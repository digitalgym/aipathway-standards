/**
 * Danger Tag Desk: one run of the exception desk, built to
 * AIP-BS-EXCEPTION-DESK 2026-11-01
 * (https://aipathway.com.au/explore-ai/exception-desk-build-standard).
 *
 * Its main source is the technician. When a tech tags an appliance Danger Do
 * Not Use on a ServiceM8 job, the job app appends a row with the label
 * `danger_tag`. The desk files it like any other raise: read the job by its id,
 * keep the label (it is not on the closed list, so it is stored as `other`),
 * take the owner and the same-day clock from the routing table, one item per
 * job. Then, for a danger tag only, it puts the notice on the job record and
 * drafts the written notice to the property owner or managing agent into the
 * drafts folder. The named owner sends that notice, follows up and closes the
 * item with what was done. The desk never sends it and never closes anything.
 *
 * Every run, whatever woke it (a row on the Raise tab, the hourly tick, or a
 * person closing an item): intake, then the one escalation of late items, then
 * the morning summary if it is due and not yet out. It keeps nothing between
 * runs: everything it needs is read back from the queue and the record.
 *
 * Everything goes through the ports. Australian English; times in the
 * routing table's time zone.
 */

const SLUG = "danger-tag-desk";

export const CLOSED_TYPES = [
  "price_not_in_book",
  "variation",
  "unassignable",
  "parts_shortfall",
  "write_failed",
  "address_unresolved",
  "promise_broken",
  "dispute",
  "hardship",
  "stock_unknown",
  "needs_list_unknown",
  "unclassified_fault",
  "tech_unconfirmed",
  "other",
];

const JOB_SYSTEMS = ["servicem8", "simpro", "aroflo", "fergus"];
const LEDGERS = ["xero"];
const NEVER_AUTO_CLOSE = ["dispute", "hardship"];
const HOUR = 3_600_000;

/** The local day and minute-of-day in the routing table's time zone. */
function local(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

const minuteOf = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

const fmt = (iso, timeZone) =>
  new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );

/**
 * @param {ReturnType<import("./tag-world.mjs").TagWorld["prototype"]["ports"]>} ports
 */
export async function build(ports) {
  const routing = await ports.readRouting();
  const tz = routing.time_zone ?? "Australia/Brisbane";
  const rowFor = (type) => routing.rows.find((r) => r.type === type) ?? null;

  // ── 1. Intake: every unread row on the Raise tab ──
  for (const raise of await ports.readInbox()) {
    await intake(ports, raise, rowFor, tz);
  }

  // ── 2. The one escalation of each late item ──
  const now = ports.now();
  for (const item of await ports.listExceptions({ status: "open" })) {
    if (item.escalated_at) continue;
    if (new Date(item.due_at).getTime() > now.getTime()) continue;
    const row = rowFor(item.type);
    // A dispute or hardship claim goes to its owner and nobody else, so its
    // one escalation is a reminder to that owner, whatever routing says.
    const to = item.stop_chase ? item.owner : row?.escalate_to;
    if (!to) continue;
    await ports.escalate(to, item.id, `${item.type} on ${item.record.system} ${item.record.external_id}, owned by ${item.owner}, was due ${fmt(item.due_at, tz)} and is still open`);
    await ports.raiseException({ op: "update", id: item.id, fields: { escalated_at: now.toISOString(), escalated_to: to } });
  }

  // ── 3. The morning summary, once a day, at or after the set time ──
  const here = local(now, tz);
  if (here.minute >= minuteOf(routing.summary_at ?? "07:00")) {
    const already = await ports.readReport(here.day);
    if (!already) {
      const open = await ports.listExceptions({ status: "open" });
      const by_type = {};
      const by_owner = {};
      for (const i of open) {
        by_type[i.type] = (by_type[i.type] ?? 0) + 1;
        by_owner[i.owner] = (by_owner[i.owner] ?? 0) + 1;
      }
      const overdue = open.filter((i) => new Date(i.due_at).getTime() <= now.getTime()).map((i) => i.id);
      const other_labels = [...new Set(open.filter((i) => i.type === "other" && i.arrived_as).map((i) => i.arrived_as))];
      const danger_tags = open.filter((i) => i.arrived_as === "danger_tag").map((i) => i.record.external_id);
      await ports.publishReport({
        day: here.day,
        by_type,
        by_owner,
        overdue,
        other_labels,
        danger_tags_open: danger_tags,
        none: open.length === 0,
        text:
          open.length === 0
            ? `Exception desk, ${here.day}: none open.`
            : `Exception desk, ${here.day}: ${open.length} open, ${overdue.length} overdue.`,
      });
    }
  }
}

async function intake(ports, raise, rowFor, tz) {
  const from = raise.from ?? {};
  const sendBack = (why) =>
    ports.notify(from.standard ?? "unknown", { raise_id: raise.raise_id, kind: "sent_back" }, `Not raised: ${why}. Raise it again with the id the system of record issued.`);

  // Check 1: the record by its id, read from the system that holds it.
  const system = raise.record?.system;
  const external_id = raise.record?.external_id;
  if (!system || !external_id) return sendBack("no record id");
  let held = null;
  if (JOB_SYSTEMS.includes(system)) held = await ports.readJob(system, external_id);
  else if (LEDGERS.includes(system)) held = await ports.readLedger(system, external_id);
  else return sendBack(`${system} is not a system the desk reads`);
  if (!held) return sendBack(`${system} does not hold ${external_id}`);

  // Check 2: the type comes from the closed list; anything else is other.
  const label = String(raise.label ?? "");
  const type = CLOSED_TYPES.includes(label) ? label : "other";
  const reason = type === "other" && label !== "other" ? `${label}: ${raise.reason ?? ""}`.trim() : String(raise.reason ?? "");

  // Check 3: owner and clock from routing, never from the raise.
  const row = rowFor(type) ?? rowFor("other");
  if (!row) return sendBack(`no routing row for ${type}`);

  const now = ports.now();

  // Check 4: one open item per record and type.
  const [existing] = await ports.listExceptions({ status: "open", type, system, external_id });
  if (existing) {
    const fields = {
      reason,
      raise_count: (existing.raise_count ?? 1) + 1,
      last_raised_at: now.toISOString(),
    };
    if (raise.resolved_upstream) fields.resolved_upstream = true;
    await ports.raiseException({ op: "update", id: existing.id, fields });

    // Check 5: the only close a machine makes is the owner's switch, never for
    // a dispute, a hardship claim or an item a call raised.
    if (
      raise.resolved_upstream &&
      row.auto_close === true &&
      !NEVER_AUTO_CLOSE.includes(type) &&
      existing.raised_by?.via !== "call"
    ) {
      await ports.raiseException({
        op: "update",
        id: existing.id,
        fields: {
          status: "closed",
          closed: { by: "routing.auto_close", at: now.toISOString(), outcome: `resolved upstream: ${reason}`, reason: "the owner switched this type to close itself" },
        },
      });
    }
    return;
  }

  const item = {
    raised_by: { standard: from.standard ?? "unknown", surface: from.surface ?? "code", ...(from.via ? { via: from.via } : {}) },
    type,
    ...(type === "other" && label !== "other" ? { arrived_as: label } : {}),
    record: { system, external_id },
    reason,
    ...(raise.evidence_uri ? { evidence_uri: raise.evidence_uri } : {}),
    owner: row.owner,
    due_at: new Date(new Date(raise.raised_at ?? now).getTime() + row.clock_hours * HOUR).toISOString(),
    raised_at: now.toISOString(),
    raise_count: 1,
    last_raised_at: now.toISOString(),
    resolved_upstream: raise.resolved_upstream === true,
    stop_chase: NEVER_AUTO_CLOSE.includes(type) ? type : null,
    status: "open",
  };
  const { id } = await ports.raiseException({ op: "create", item });
  if (!id) {
    // No id back: nothing was raised. Tell the raiser so the row is not lost.
    return sendBack("the queue returned no id");
  }

  // The owner hears about it. A dispute or hardship claim goes to its owner
  // and nobody else, whatever the raiser suggested doing next.
  await ports.notify(row.owner, { item_id: id, system, external_id }, `${type} on ${external_id}: ${reason}. Due ${fmt(item.due_at, tz)}.`);

  // The danger-tag step: the notice on the job, and a draft for a person.
  if (item.arrived_as === "danger_tag" && JOB_SYSTEMS.includes(system)) {
    const appliance = raise.appliance ?? "an appliance";
    const tech = raise.tagged_by ?? "the technician";
    const taggedAt = fmt(raise.raised_at ?? now.toISOString(), tz);
    const note =
      `DANGER - DO NOT USE. ${appliance} at ${held.site} was tagged out of service by ${tech} on ${taggedAt}. ` +
      `Reason: ${raise.reason ?? "not given"}. Do not use it until a licensed person has repaired or replaced it and removed the tag. ` +
      `Follow-up owner: ${row.owner} (exception ${id}).`;
    await ports.writeJob(system, external_id, note, `${external_id}+danger_tag+${SLUG}`);

    const to = held.notice_to;
    if (to?.email) {
      await ports.draftMessage({
        for_release_by: row.owner,
        item_id: id,
        record: { system, external_id },
        to: { name: to.name, email: to.email, role: to.role },
        subject: `Safety notice: ${appliance} at ${held.site} tagged Danger Do Not Use`,
        body:
          `Dear ${to.name},\n\n` +
          `On ${taggedAt} our technician ${tech} found ${appliance} at ${held.site} unsafe and fitted a Danger Do Not Use tag. ` +
          `Reason: ${raise.reason ?? "not given"}.\n\n` +
          `Please make sure nobody uses it until it has been repaired or replaced by a licensed person and the tag removed. ` +
          `Removing the tag without a repair is unsafe and may breach your state's electrical or gas safety rules.\n\n` +
          `${row.owner} will contact you to arrange the repair or replacement and confirm it is safe.\n\n` +
          `Kind regards,\n${row.owner}`,
      });
    } else {
      // No owner or agent on the job to write to: say so to the named owner.
      await ports.notify(row.owner, { item_id: id, system, external_id }, `Danger tag on ${external_id}: no property owner or managing agent email on the job, so no notice was drafted.`);
    }
  }
}

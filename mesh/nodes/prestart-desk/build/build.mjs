/**
 * Prestart Desk: one run of the exception desk, built to
 * AIP-BS-EXCEPTION-DESK 2026-11-01
 * (https://aipathway.com.au/explore-ai/exception-desk-build-standard).
 *
 * Its main source is the daily check. Each morning a tech does the vehicle
 * pre-start check, or the site safety check on a job, in a form app that
 * emails the completed form to the checks mailbox. For every check the desk:
 *
 *   1. reads the vehicle (a plant and equipment asset in Simpro) or the job by
 *      the id on the form, and sends the check back to whoever did it if there
 *      is no id or the job system does not hold it;
 *   2. files the completed check as an attachment on that vehicle or job, and
 *      counts it filed only when an attachment id reads back;
 *   3. puts every failed item in front of a named owner with a clock: one item
 *      per vehicle or job, type `other` with the label `vehicle_check_failed`
 *      or `site_check_failed` kept, and the owner and the clock from the
 *      routing table the business wrote. The failed items are listed on it. A
 *      later check that fails again updates the same item and keeps its clock;
 *      a later check that passes marks it resolved upstream, and it stays open
 *      until the owner closes it with what was done.
 *
 * The desk never takes a vehicle off the road, never clears one to drive and
 * never closes an item. Those are the named owner's. It also takes raises from
 * any other surface on the Raise tab, the same way.
 *
 * Every run, whatever woke it (a check email, a row on the Raise tab, the
 * hourly tick, or a person closing an item): checks, then other raises, then
 * the one escalation of late items, then the morning summary if it is due and
 * not yet out. It keeps nothing between runs.
 *
 * Everything goes through the ports. Australian English; times in the
 * routing table's time zone.
 */

const SLUG = "prestart-desk";

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

export const CHECK_LABELS = { vehicle: "vehicle_check_failed", site: "site_check_failed" };

const JOB_SYSTEMS = ["simpro", "servicem8", "aroflo", "fergus"];
const LEDGERS = ["xero"];
const NEVER_AUTO_CLOSE = ["dispute", "hardship"];
const HOUR = 3_600_000;

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

/** Read the record a raise or a check names, from the system that holds it. */
async function readHeld(ports, record) {
  const { system, external_id, kind } = record ?? {};
  if (kind === "asset") return JOB_SYSTEMS.includes(system) ? ports.readAsset(system, external_id) : null;
  if (JOB_SYSTEMS.includes(system)) return ports.readJob(system, external_id);
  if (LEDGERS.includes(system)) return ports.readLedger(system, external_id);
  return undefined; // not a system the desk reads
}

/**
 * @param {ReturnType<import("./check-world.mjs").CheckWorld["prototype"]["ports"]>} ports
 */
export async function build(ports) {
  const routing = await ports.readRouting();
  const tz = routing.time_zone ?? "Australia/Brisbane";
  const rowFor = (type, label) =>
    (label ? routing.rows.find((r) => r.type === type && r.label === label) : null) ??
    routing.rows.find((r) => r.type === type && !r.label) ??
    null;
  const ctx = { ports, rowFor, tz };

  // ── 1. The daily checks in the checks mailbox ──
  for (const msg of await ports.readChecks()) {
    await fileCheck(ctx, msg);
  }

  // ── 2. Every other unread row on the Raise tab ──
  for (const raise of await ports.readInbox()) {
    const from = raise.from ?? {};
    await place(ctx, raise, (why) =>
      ports.notify(from.standard ?? "unknown", { raise_id: raise.raise_id, kind: "sent_back" }, `Not raised: ${why}. Raise it again with the id the system of record issued.`),
    );
  }

  // ── 3. The one escalation of each late item ──
  const now = ports.now();
  for (const item of await ports.listExceptions({ status: "open" })) {
    if (item.escalated_at) continue;
    if (new Date(item.due_at).getTime() > now.getTime()) continue;
    const row = rowFor(item.type, item.arrived_as);
    // A dispute or hardship claim goes to its owner and nobody else.
    const to = item.stop_chase ? item.owner : row?.escalate_to;
    if (!to) continue;
    await ports.escalate(to, item.id, `${item.arrived_as ?? item.type} on ${item.record.system} ${item.record.external_id}, owned by ${item.owner}, was due ${fmt(item.due_at, tz)} and is still open`);
    await ports.raiseException({ op: "update", id: item.id, fields: { escalated_at: now.toISOString(), escalated_to: to } });
  }

  // ── 4. The morning summary, once a day, at or after the set time ──
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
      const failed_checks_open = open
        .filter((i) => Object.values(CHECK_LABELS).includes(i.arrived_as))
        .map((i) => ({ item: i.id, record: i.record.external_id, owner: i.owner, failed: i.failed_items ?? [], resolved_upstream: i.resolved_upstream === true }));
      await ports.publishReport({
        day: here.day,
        by_type,
        by_owner,
        overdue,
        other_labels,
        failed_checks_open,
        none: open.length === 0,
        text:
          open.length === 0
            ? `Exception desk, ${here.day}: none open.`
            : `Exception desk, ${here.day}: ${open.length} open, ${overdue.length} overdue, ${failed_checks_open.length} vehicle or site check(s) with failed items.`,
      });
    }
  }
}

/** One completed daily check, from the checks mailbox. */
async function fileCheck(ctx, msg) {
  const { ports } = ctx;
  const form = msg.form ?? {};
  const doer = msg.from?.email ?? msg.from?.name ?? "unknown";
  const kind = form.kind === "vehicle" ? "vehicle" : form.kind === "site" ? "site" : null;
  const sendBack = (why) =>
    ports.notify(doer, { message_id: msg.message_id, kind: "sent_back" }, `Your check was not filed: ${why}. Pick the vehicle or the job from the list in the form and send it again.`);

  if (!kind) return sendBack("it does not say whether it is a vehicle or a site check");
  const system = form.record?.system;
  const external_id = form.record?.external_id;
  if (!system || !external_id) return sendBack(`no ${kind === "vehicle" ? "vehicle asset" : "job"} id on it`);
  const recordKind = kind === "vehicle" ? "asset" : "job";
  const record = { system, external_id, kind: recordKind };
  const held = await readHeld(ports, record);
  if (!held) return sendBack(`${system} does not hold ${kind === "vehicle" ? "vehicle" : "job"} ${external_id}`);

  const items = Array.isArray(form.items) ? form.items : [];
  const failed = items.filter((i) => i.result === "fail");

  // File the completed check on its vehicle or job. Keyed, so a resent email files once.
  const filed = await ports.fileCheck(
    system,
    recordKind,
    external_id,
    {
      message_id: msg.message_id,
      kind,
      done_by: form.done_by ?? msg.from?.name ?? null,
      done_at: form.done_at ?? msg.received_at,
      items,
      summary: failed.length === 0 ? `${kind} check: all ${items.length} items passed` : `${kind} check: ${failed.length} of ${items.length} items failed`,
    },
    `${msg.message_id}+check+${SLUG}`,
  );
  if (!filed?.id) {
    // Not filed: the check is still a record the business must keep, so it goes to a person.
    return place(
      ctx,
      {
        from: { standard: SLUG, surface: "code" },
        label: "write_failed",
        record,
        reason: `the ${kind} check in ${msg.message_id} could not be filed on ${external_id}${failed.length ? `; failed: ${failed.map((f) => f.item).join(", ")}` : ""}`,
        raised_at: msg.received_at,
      },
      sendBack,
      held,
    );
  }

  const label = CHECK_LABELS[kind];
  const evidence_uri = `${system}://${recordKind}/${external_id}/attachment/${filed.id}`;
  const where = kind === "vehicle" ? `${held.description ?? "vehicle"} ${held.rego ?? external_id}` : `job ${external_id} at ${held.site ?? "site"}`;
  if (failed.length > 0) {
    return place(
      ctx,
      {
        from: { standard: SLUG, surface: "code" },
        label,
        record,
        reason: `${where} failed ${failed.map((f) => `${f.item}${f.note ? ` (${f.note})` : ""}`).join("; ")}, on the check by ${form.done_by ?? doer}`,
        failed_items: failed.map((f) => f.item),
        evidence_uri,
        raised_at: msg.received_at,
        // Whatever the form suggests about who should look at it is ignored.
      },
      sendBack,
      held,
    );
  }

  // Everything passed. If an item is open for an earlier failure, mark it
  // resolved upstream. It stays open until its owner closes it.
  const [openCheck] = await ports.listExceptions({ status: "open", type: "other", system, external_id });
  if (openCheck && openCheck.arrived_as === label) {
    return place(
      ctx,
      { from: { standard: SLUG, surface: "code" }, label, record, reason: `${where}: every item passed on the check in ${msg.message_id}`, failed_items: [], evidence_uri, resolved_upstream: true, raised_at: msg.received_at },
      sendBack,
      held,
    );
  }
}

/** File one raise on the queue: record, type, owner and clock, one item per record and type. */
async function place(ctx, raise, sendBack, preRead) {
  const { ports, rowFor, tz } = ctx;
  const from = raise.from ?? {};

  // Check 1: the record by its id, read from the system that holds it.
  const system = raise.record?.system;
  const external_id = raise.record?.external_id;
  if (!system || !external_id) return sendBack("no record id");
  const held = preRead ?? (await readHeld(ports, raise.record));
  if (held === undefined) return sendBack(`${system} is not a system the desk reads`);
  if (!held) return sendBack(`${system} does not hold ${external_id}`);

  // Check 2: the type comes from the closed list; anything else is other.
  const label = String(raise.label ?? "");
  const type = CLOSED_TYPES.includes(label) ? label : "other";
  const arrived_as = type === "other" && label !== "other" && label ? label : undefined;
  const reason = arrived_as ? `${label}: ${raise.reason ?? ""}`.trim() : String(raise.reason ?? "");

  // Check 3: owner and clock from routing, never from the raise.
  const row = rowFor(type, arrived_as);
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
    if (Array.isArray(raise.failed_items)) fields.failed_items = raise.failed_items;
    if (raise.evidence_uri) fields.evidence_uri = raise.evidence_uri;
    if (raise.resolved_upstream) fields.resolved_upstream = true;
    else if (Array.isArray(raise.failed_items) && raise.failed_items.length > 0) fields.resolved_upstream = false;
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

  // A pass with nothing open to mark is not an exception.
  if (raise.resolved_upstream && Array.isArray(raise.failed_items) && raise.failed_items.length === 0) return;

  const item = {
    raised_by: { standard: from.standard ?? "unknown", surface: from.surface ?? "code", ...(from.via ? { via: from.via } : {}) },
    type,
    ...(arrived_as ? { arrived_as } : {}),
    record: { system, external_id, ...(raise.record.kind ? { kind: raise.record.kind } : {}) },
    reason,
    ...(Array.isArray(raise.failed_items) ? { failed_items: raise.failed_items } : {}),
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
  if (!id) return sendBack("the queue returned no id");

  // The owner hears about it. A dispute or hardship claim goes to its owner
  // and nobody else, whatever the raiser suggested doing next.
  await ports.notify(row.owner, { item_id: id, system, external_id }, `${arrived_as ?? type} on ${external_id}: ${reason}. Due ${fmt(item.due_at, tz)}.`);
}

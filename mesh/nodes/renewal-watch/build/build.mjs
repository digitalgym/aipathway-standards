/**
 * Renewal Watch: a compliance calendar for a small Australian business,
 * built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * The obligations are the ones a small business carries on its own sites and
 * its own name: electrical test and tag, fire equipment servicing, workers
 * compensation and public liability renewals, business name and licence
 * renewals. Each is a dated rule applied to an anchor date. The rules are the
 * business's own rule set, per state or territory, versioned by effective date.
 *
 * What one run does, each time it is woken (schedule.tick, a certificate or
 * reply arriving by email and already carrying an obligation id, or
 * exception.closed):
 *
 *   1. Read the obligations fresh from the register. Nothing is kept between
 *      runs; a module-level cache would be a stored due date by another name.
 *   2. Skip any obligation with an open exception: its named owner holds it,
 *      and the chain resumes from the record when they close it.
 *   3. Apply the handover, by obligation id only. A certificate is filed as
 *      evidence of completion and read back by id; a claim with no document is
 *      refused and raised; a refusal is a dated outcome and the obligation
 *      stays live; a named person's release lets a drafted notice go. An
 *      attachment with no obligation id is never matched on a name or a
 *      subject line: it is raised for a person.
 *   4. For each obligation: no anchor date is an explicit unknown state,
 *      surfaced and never defaulted to today. Otherwise the due date is
 *      derived from the rule in force for that site's jurisdiction, read at
 *      run time, and every past due date on the record must still be
 *      explained by a retained rule version.
 *   5. Sweep for breaches. A breach is never cleared. A live breach is raised
 *      to its named owner every run until it is done; once done late, it stays
 *      breached on the record and is not raised again.
 *   6. Inside the lead time, or breached, the notice or booking the rule names
 *      is drafted and held for a named person. Nothing is sent by this build.
 *   7. Waiting on someone past the next chase date is a finding: raised.
 *
 * Everything goes through the ports. No due date is typed or computed here:
 * the register derives it from the rule in force, and this build only reads it.
 */

const DAY = 86_400_000;

/** How early the action is drafted when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 45;

/** Who owns an exception when the obligation names nobody. */
export const DEFAULT_OWNER = "the business owner";

const ownerOf = (ob) => ob.owner ?? DEFAULT_OWNER;
const raise = (ports, reason, ob, extra) =>
  ports.escalate(reason, `${typeof ob === "string" ? ob : ob.id}; exception_owner=${typeof ob === "string" ? DEFAULT_OWNER : ownerOf(ob)}${extra ? `; ${extra}` : ""}`);

function stateOf({ breached, waiting, due, now, leadDays }) {
  if (breached) return "breached_or_at_risk";
  if (waiting) return "waiting_on_someone";
  if (!due) return "scheduled";
  return new Date(due).getTime() - now.getTime() <= leadDays * DAY ? "due_action_drafted" : "scheduled";
}

/**
 * @param {object} ports  CalendarWorld ports, or the business's live register
 * @param {Array<object>} [handover]  items already carrying an obligation id:
 *   { kind: "certificate", obligationId, messageId, evidenceRef? }
 *   { kind: "refusal", obligationId, by, at? }
 *   { kind: "release", obligationId, person? }
 * @returns {Promise<Array<object>>} this run's calendar view (not durable state)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const held = new Set(rows.filter((o) => o.exceptionOpen).map((o) => o.id));
  const doneNow = new Set();

  // 3. The handover, by id only.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await raise(ports, "renewal.attachment_unmatched", item.messageId ?? "an item with no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;
    if (item.kind === "certificate") {
      const res = await ports.complete(ob.id, item.evidenceRef ?? undefined);
      if (!res?.accepted) {
        await raise(ports, "renewal.completion_without_evidence", ob, item.messageId);
        continue;
      }
      // A write counts only when it reads back by id.
      const back = (await ports.readObligations()).find((o) => o.id === ob.id);
      if (back?.evidenceRef === item.evidenceRef && back?.completedAt) doneNow.add(ob.id);
      else await raise(ports, "renewal.evidence_not_read_back", ob, item.evidenceRef);
    } else if (item.kind === "refusal") {
      await ports.recordRefusal(ob.id, item.at ?? now.toISOString());
      await raise(ports, "renewal.refusal_recorded", ob, `declined by ${item.by ?? "unnamed"}`);
    } else if (item.kind === "release") {
      const ok = await ports.releaseNotice(ob.id, item.person ?? undefined);
      if (!ok) await raise(ports, "renewal.release_refused", ob);
    }
  }

  // 4. Derive every date from the rule in force, or surface the gap.
  const versions = new Map();
  const versionsFor = async (ob) => {
    const key = `${ob.obligationType}|${ob.jurisdiction}`;
    if (!versions.has(key)) versions.set(key, await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    return versions.get(key);
  };
  const view = [];
  for (const ob of rows) {
    if (held.has(ob.id)) continue;
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await raise(ports, "renewal.anchor_unknown", ob);
      view.push({ id: ob.id, anchor_status: "unknown", due_date: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await raise(ports, "renewal.no_rule_in_force", ob);
      view.push({ id: ob.id, anchor_status: "known", due_date: null, state: "scheduled" });
      continue;
    }
    const all = await versionsFor(ob);
    for (const past of ob.history ?? []) {
      if (!all.some((r) => r.version === past.version && r.effectiveFrom && r.effectiveFrom <= past.date)) {
        await raise(ports, "renewal.history_unexplained", ob, `due ${past.date} under ${past.version}`);
      }
    }
    view.push({ id: ob.id, anchor_status: "known", due_date: due.date, rule_version: due.version, rule: all.find((r) => r.version === due.version), ob });
  }

  // 5. Breaches. The register never clears one, and neither does this build.
  const breached = new Set(await ports.sweep());

  // 6 and 7. States, drafts and findings.
  for (const row of view) {
    if (!row.ob) continue;
    const { ob, rule } = row;
    const live = !ob.completedAt && !doneNow.has(ob.id);
    const leadDays = rule?.leadDays ?? DEFAULT_LEAD_DAYS;
    row.breached = breached.has(ob.id);
    row.state = live
      ? stateOf({ breached: row.breached, waiting: ob.waitingOn, due: row.due_date, now, leadDays })
      : "scheduled";
    if (!live) {
      delete row.ob;
      delete row.rule;
      continue;
    }
    if (row.breached) await raise(ports, "renewal.breached", ob, `due ${row.due_date}`);
    const drafts = rule?.notice || rule?.noticeOnBreach;
    if (drafts && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
      await ports.prepareNotice(ob.id);
      await raise(ports, "renewal.notice_drafted_awaiting_release", ob);
    }
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await raise(ports, "renewal.chase_due", ob, `waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
    delete row.ob;
    delete row.rule;
  }
  return view;
}

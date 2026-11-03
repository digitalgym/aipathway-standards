/**
 * Lodgement Watch: a practice's per-client lodgement calendar (BAS, IAS,
 * payroll tax returns and reconciliations), built to
 * AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build for Australian practices, reimplemented from the standard.
 * The ATO sets the BAS and IAS cycles; each state revenue office sets its own
 * payroll tax dates, so those rules are held per jurisdiction.
 *
 * What one run does, every time it is woken (schedule.tick, a lodgement
 * receipt email already tagged with an obligation id, or exception.closed):
 *
 *   1. Read the client obligations fresh from the register. Nothing cached.
 *   2. Skip any obligation with an open exception: its named owner holds it.
 *   3. Apply the handover, by obligation id only. A lodgement receipt with an
 *      attached document is filed as evidence and read back by id; a "done"
 *      with no document is not evidence and is raised; a client who will not
 *      supply records is a dated refusal and the obligation stays live; a
 *      named accountant's release lets a drafted records request go. An email
 *      with no obligation id is never matched on a client name: it is raised.
 *   4. For each obligation: no anchor means an explicit unknown-anchor state,
 *      surfaced and never defaulted to today. Otherwise the due date is
 *      derived from the rule version in force for that client's jurisdiction,
 *      and every past due date on the history must still be explained by a
 *      retained rule version.
 *   5. Sweep for breaches. A breach is never cleared, even after a late
 *      lodgement. Each live breach is escalated to its named owner.
 *   6. Waiting on the client past the next chase date is silence, and silence
 *      is a finding: raised, not ignored.
 *   7. Inside the lead time, or breached, the records request (or lodgement
 *      reminder) the rule names is drafted and held. It goes only on a named
 *      person's release. Nothing here lodges with the ATO or a state revenue
 *      office, and nothing attests: a registered agent does that.
 *
 * Every effect goes through the ports. No due date is stored or typed.
 */

const DAY = 86_400_000;

/** The lead time when a rule does not name one. */
export const DEFAULT_LEAD_DAYS = 21;

const key = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;

function stateOf(ob, dueIso, breached, now, leadDays) {
  if (breached) return "breached_or_at_risk";
  if (ob.waitingOn) return "waiting_on_someone";
  if (!dueIso) return "scheduled";
  return new Date(dueIso).getTime() - now.getTime() <= leadDays * DAY ? "due_action_drafted" : "scheduled";
}

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  items already tagged by obligation id:
 *   { kind: "receipt", obligationId, messageId, attachment? }
 *   { kind: "refusal", obligationId, by, at }
 *   { kind: "release", obligationId, person? }
 *   { kind: "email", messageId }            (no obligation id: raised)
 * @returns {Promise<{ view: object[], filed: object[] }>} this run's view
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const held = new Set(rows.filter((o) => o.openException).map((o) => o.id));
  const completedNow = new Set();
  const filed = [];

  // 3. The handover, by id only.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("lodgement.email_unmatched", item.messageId ?? "an email with no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;
    if (item.kind === "receipt") {
      const ref = item.attachment ? `${item.messageId}#${item.attachment}` : null;
      const res = await ports.complete(ob.id, ref);
      if (!res?.accepted) {
        await ports.escalate("lodgement.completion_without_evidence", ob.id);
        continue;
      }
      // A write counts only when it reads back by id.
      const back = (await ports.readObligations()).find((o) => o.id === ob.id);
      if (back?.evidenceRef === ref && back.completedAt) {
        completedNow.add(ob.id);
        filed.push({ event: "evidence.filed", message_id: item.messageId, obligation_ref: ob.id, evidence: ref });
      } else {
        await ports.escalate("lodgement.evidence_not_read_back", ob.id);
      }
    } else if (item.kind === "refusal") {
      await ports.recordRefusal(ob.id, item.at ?? now.toISOString());
      await ports.escalate("lodgement.refusal_recorded", `${ob.id} declined by ${item.by ?? "unnamed"}`);
    } else if (item.kind === "release") {
      const ok = await ports.releaseNotice(ob.id, item.person ?? null);
      if (!ok) await ports.escalate("lodgement.release_refused", ob.id);
    }
  }

  // 4. Derive every date, or surface the gap.
  const versions = new Map();
  const view = [];
  for (const ob of rows) {
    if (held.has(ob.id)) {
      view.push({ id: ob.id, held: true });
      continue;
    }
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("lodgement.anchor_unknown", ob.id);
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("lodgement.no_rule_in_force", ob.id);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    if (ob.jurisdiction && !versions.has(key(ob))) {
      versions.set(key(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const history = versions.get(key(ob)) ?? [];
    for (const past of ob.history ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom && r.effectiveFrom <= past.date)) {
        await ports.escalate("lodgement.history_unexplained", `${ob.id} due ${past.date} under ${past.version}`);
      }
    }
    view.push({ id: ob.id, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 5. Breaches. Once set, never cleared.
  const breached = new Set(await ports.sweep());

  // 6 and 7. States, chases, drafts and escalations.
  for (const row of view) {
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (versions.get(key(ob)) ?? []).find((r) => r.version === row.rule_version);
    const isBreached = breached.has(ob.id);
    const live = !ob.completedAt && !completedNow.has(ob.id);
    row.state = live ? stateOf(ob, row.due, isBreached, now, rule?.leadDays ?? DEFAULT_LEAD_DAYS) : "closed";
    row.breached = isBreached;
    if (!live) {
      delete row.ob;
      continue;
    }
    if (isBreached) await ports.escalate("lodgement.breached", ob.id);
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await ports.escalate("lodgement.chase_due", `${ob.id} waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
    if (rule?.notice && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
      await ports.prepareNotice(ob.id);
      await ports.escalate("lodgement.request_drafted_awaiting_release", ob.id);
    }
    delete row.ob;
  }
  return { view, filed };
}

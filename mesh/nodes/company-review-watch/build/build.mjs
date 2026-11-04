/**
 * Company Review Watch: a practice's calendar of each client company's ASIC
 * annual review and officeholder change notices, built to
 * AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build for Australian accounting and bookkeeping practices,
 * reimplemented from the standard. Two obligations per client entity:
 *
 *   - the annual review: anchored on the last review date (the anniversary of
 *     registration), due on the day ASIC late fees would start if the review
 *     fee is still unpaid and the company details unconfirmed;
 *   - an officeholder change notice: anchored on the date a director or
 *     secretary was appointed or left, due when the notice period runs out.
 *
 * Client companies sit under the Corporations Act, so ASIC's rules apply in
 * every state, but a practice's book also carries state-incorporated
 * associations whose officeholder rules differ by state. Rules are therefore
 * held per jurisdiction, and a rule with the same content in every state is
 * simply held three times.
 *
 * What one run does, every time it is woken (schedule.tick, a confirmation
 * email already tagged with an obligation id, or exception.closed):
 *
 *   1. Read the client obligations fresh from the register. Nothing cached.
 *   2. Skip any obligation with an open exception: its named owner holds it.
 *   3. Apply the handover, by obligation id only. An ASIC confirmation with an
 *      attached document (the lodged change, or the paid review fee receipt)
 *      is filed as evidence and read back by id; a "done" with no document is
 *      not evidence and is raised; a client who declines to pay or sign is a
 *      dated refusal and the obligation stays live; a named accountant's
 *      release lets a drafted reminder go. An email with no obligation id is
 *      never matched on a company name or ACN text: it is raised.
 *   4. For each obligation: no anchor means an explicit unknown-anchor state,
 *      surfaced and never defaulted to today. Otherwise the due date is
 *      derived from the rule version in force for that entity's jurisdiction,
 *      and every past due date on the history must still be explained by a
 *      retained rule version.
 *   5. Sweep for breaches. A breach is never cleared, even after the fee is
 *      paid late. Each live breach is escalated to its named owner.
 *   6. Waiting on the client past the next chase date is silence, and silence
 *      is a finding: raised, not ignored.
 *   7. Inside the lead time, or breached, the client reminder the rule names is
 *      drafted and held. It goes only on a named person's release. Nothing
 *      here lodges with ASIC, pays a fee, signs a solvency resolution or
 *      attests: the client and a named person at the practice do that.
 *
 * Every effect goes through the ports. No due date is stored or typed.
 */

const DAY = 86_400_000;

/** The lead time when a rule does not name one. */
export const DEFAULT_LEAD_DAYS = 30;

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
 *   { kind: "confirmation", obligationId, messageId, attachment? }
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
      await ports.escalate("review.email_unmatched", item.messageId ?? "an email with no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;
    if (item.kind === "confirmation") {
      const ref = item.attachment ? `${item.messageId}#${item.attachment}` : null;
      const res = await ports.complete(ob.id, ref ?? undefined);
      if (!res?.accepted) {
        await ports.escalate("review.completion_without_evidence", ob.id);
        continue;
      }
      // A write counts only when it reads back by id.
      const back = (await ports.readObligations()).find((o) => o.id === ob.id);
      if (back?.evidenceRef === ref && back.completedAt) {
        completedNow.add(ob.id);
        filed.push({ event: "evidence.filed", message_id: item.messageId, obligation_ref: ob.id, evidence: ref });
      } else {
        await ports.escalate("review.evidence_not_read_back", ob.id);
      }
    } else if (item.kind === "refusal") {
      await ports.recordRefusal(ob.id, item.at ?? now.toISOString());
      await ports.escalate("review.refusal_recorded", `${ob.id} declined by ${item.by ?? "unnamed"}`);
    } else if (item.kind === "release") {
      const ok = await ports.releaseNotice(ob.id, item.person ?? undefined);
      if (!ok) await ports.escalate("review.release_refused", ob.id);
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
      await ports.escalate("review.anchor_unknown", ob.id);
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("review.no_rule_in_force", ob.id);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    if (ob.jurisdiction && !versions.has(key(ob))) {
      versions.set(key(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const history = versions.get(key(ob)) ?? [];
    for (const past of ob.history ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom && r.effectiveFrom <= past.date)) {
        await ports.escalate("review.history_unexplained", `${ob.id} due ${past.date} under ${past.version}`);
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
    if (isBreached) await ports.escalate("review.breached", ob.id);
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await ports.escalate("review.chase_due", `${ob.id} waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
    if (rule?.notice && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
      await ports.prepareNotice(ob.id);
      await ports.escalate("review.reminder_drafted_awaiting_release", ob.id);
    }
    delete row.ob;
  }
  return { view, filed };
}

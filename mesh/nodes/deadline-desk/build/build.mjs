/**
 * Deadline Desk: a compliance calendar for the deadlines in a practice's
 * forwarded letters and bills, built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * A port of "Paperwork Desk" by Daniel Masarsky, reimplemented from the
 * standard. Only the deadline job is ported. Nothing here is taken from the
 * original bot's prompt or instructions.
 *
 * What one run does, every time it is woken (schedule.tick, or a forwarded
 * letter or reply already filed against an obligation id, or exception.closed):
 *
 *   1. Read the obligations fresh from the register. Nothing is cached.
 *   2. Apply what was handed over, by obligation id only: a reply with a
 *      document is a completion; a reply without one is not, and is raised; a
 *      client who declines is a dated refusal and the obligation stays live; a
 *      named person's release lets a drafted notice go. A letter that carries
 *      no obligation id is never matched by name: it is raised for a person.
 *   3. For every obligation: no anchor date means an explicit unknown-anchor
 *      state, surfaced, never defaulted to today. Otherwise the due date is
 *      derived from the rule version in force for its jurisdiction, and the
 *      version that produced it is read alongside its superseded versions.
 *   4. Sweep for breaches. A breach is never cleared, including after a late
 *      completion. Each live breach is escalated to its named owner.
 *   5. Inside the lead time, or breached, a notice the rule names is drafted
 *      and held. It goes only on a named person's release.
 *
 * Every effect goes through the ports. No due date is ever stored or typed:
 * the register has no port to write one, and this build never computes one
 * from anything but the rule the register says is in force.
 */

const DAY = 86_400_000;

/** How early the action is drafted, when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 45;

const versionKey = (o) => `${o.obligationType}|${o.jurisdiction}`;

/** The state of one obligation, from what the register returned this run. */
function stateOf(ob, due, breached, now, leadDays) {
  if (breached) return "breached_or_at_risk";
  if (ob.waitingOn) return "waiting_on_someone";
  if (!due) return "scheduled";
  const msToDue = new Date(due.date).getTime() - now.getTime();
  return msToDue <= leadDays * DAY ? "due_action_drafted" : "scheduled";
}

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  letters and replies already filed against
 *   an obligation id: { kind: "completion" | "refusal" | "release" | "letter",
 *   obligationId, evidenceRef?, by?, at?, person?, ref? }
 * @returns {Promise<Array<object>>} this run's calendar view (not durable state)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const known = new Set(rows.map((o) => o.id));
  const completedNow = new Set();

  // 2. The handover, by id only.
  for (const item of handover) {
    if (!item.obligationId || !known.has(item.obligationId)) {
      await ports.escalate("deadline.letter_unmatched", item.ref ?? "a forwarded item with no obligation id");
      continue;
    }
    if (item.kind === "completion") {
      const res = await ports.complete(item.obligationId, item.evidenceRef ?? null);
      if (res?.accepted) completedNow.add(item.obligationId);
      else await ports.escalate("deadline.completion_without_evidence", item.obligationId);
    } else if (item.kind === "refusal") {
      await ports.recordRefusal(item.obligationId, item.at ?? now.toISOString());
      await ports.escalate("deadline.refusal_recorded", `${item.obligationId} declined by ${item.by ?? "unnamed"}`);
    } else if (item.kind === "release") {
      const released = await ports.releaseNotice(item.obligationId, item.person ?? null);
      if (!released) await ports.escalate("deadline.release_refused", item.obligationId);
    }
  }

  // 3. Derive every date, or surface the gap.
  const versions = new Map();
  const view = [];
  for (const ob of rows) {
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("deadline.anchor_unknown", ob.id);
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("deadline.no_rule_for_obligation", ob.id);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    if (ob.jurisdiction && !versions.has(versionKey(ob))) {
      versions.set(versionKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    // A date that has already passed must still be explained by the version
    // that produced it. If that version is no longer readable, say so.
    const history = versions.get(versionKey(ob)) ?? [];
    for (const past of ob.history ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom)) {
        await ports.escalate("deadline.history_unexplained", `${ob.id} due ${past.date} under ${past.version}`);
      }
    }
    view.push({ id: ob.id, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 4. Breaches. Once set, never cleared.
  const breached = new Set(await ports.sweep());

  // 5. States, drafts and escalations.
  for (const row of view) {
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (versions.get(versionKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const leadDays = rule?.leadDays ?? DEFAULT_LEAD_DAYS;
    const isBreached = breached.has(ob.id);
    row.state = stateOf(ob, { date: row.due }, isBreached, now, leadDays);
    row.breached = isBreached;
    const live = !ob.completedAt && !completedNow.has(ob.id);
    if (isBreached && live) {
      await ports.escalate("deadline.breached", ob.id);
    }
    if (live && rule?.notice && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
      await ports.prepareNotice(ob.id);
      await ports.escalate("deadline.notice_drafted_awaiting_release", ob.id);
    }
    delete row.ob;
  }
  return view;
}

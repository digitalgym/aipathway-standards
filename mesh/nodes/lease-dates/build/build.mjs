/**
 * Lease Dates: a calendar of each commercial lease's rent review dates and
 * option exercise deadlines, built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build for Australian commercial property managers. Each lease on
 * the book is a record in the property management system, keyed by its
 * tenancy_id, and carries two kinds of dated obligation:
 *
 *   - a rent review: anchored on the last review date (or the commencement
 *     date for the first one), due on the review date the lease's review clause
 *     sets. The review notice to the tenant has to be served in time, or the
 *     review can be lost or argued;
 *   - an option deadline: anchored on the commencement date of the current
 *     term, due on the last day the tenant may exercise the option. Where the
 *     state's retail leases act makes the landlord remind the tenant of that
 *     date, the reminder is a notice with its own window.
 *
 * Which interval applies is data, not code. The rule set holds each clause
 * family (an annual CPI review, a two-yearly market review, a five-year term
 * with an option window) per state, because the retail leases acts differ by
 * state, and a lease variation or an amended act is a new rule version with an
 * effective date. Old versions are kept.
 *
 * What one run does, every time it is woken (schedule.tick, an email already
 * tagged with an obligation id, or exception.closed):
 *
 *   1. Read the lease obligations fresh from the register. Nothing cached.
 *   2. Skip any obligation with an open exception: its named owner holds it.
 *   3. Apply the handover, by obligation id only. A served notice, or the
 *      tenant's option exercise letter, arrives as an attachment and is filed
 *      as evidence, then read back by id. "Served it" with no copy attached is
 *      not evidence and is raised. A landlord who says not to review this year
 *      is a dated refusal and the obligation stays live. A named manager's
 *      release lets a drafted notice go. An email with no obligation id is
 *      never matched on a shop number, a tenant name or an address: it is
 *      raised.
 *   4. For each obligation: no anchor means an explicit unknown-anchor state,
 *      surfaced and never defaulted to today. Otherwise the date is derived
 *      from the rule version in force for that lease's state, and every past
 *      date on the history must still be explained by a retained version.
 *   5. Sweep for missed dates. A missed date is never cleared, even after the
 *      notice is finally served. Each live one goes to its named owner.
 *   6. Waiting on the tenant or the landlord past the next chase date is
 *      silence, and silence is a finding: raised, not ignored.
 *   7. Inside the lead time, or missed, the notice the rule names is drafted
 *      and held for the manager. It goes only on a named person's release.
 *      Nothing here serves a notice, agrees a new rent, exercises an option or
 *      signs anything: the manager and the landlord do that.
 *
 * Every effect goes through the ports. No date is stored or typed.
 */

const DAY = 86_400_000;

/** The lead time when a rule does not name one. */
export const DEFAULT_LEAD_DAYS = 60;

const ruleKey = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;

function stateOf(ob, dueIso, missed, now, leadDays) {
  if (missed) return "breached_or_at_risk";
  if (ob.waitingOn) return "waiting_on_someone";
  if (!dueIso) return "scheduled";
  return new Date(dueIso).getTime() - now.getTime() <= leadDays * DAY ? "due_action_drafted" : "scheduled";
}

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  items already tagged by obligation id:
 *   { kind: "served", obligationId, messageId, attachment? }
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
  const closedThisRun = new Set();
  const filed = [];

  // 3. The handover, by obligation id and nothing else.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("lease.email_unmatched", item.messageId ?? "an email with no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;

    if (item.kind === "served") {
      const ref = item.attachment ? `${item.messageId}#${item.attachment}` : null;
      const res = await ports.complete(ob.id, ref ?? undefined);
      if (!res?.accepted) {
        await ports.escalate("lease.served_without_copy", ob.id);
        continue;
      }
      // A filing counts only when it reads back by id.
      const back = (await ports.readObligations()).find((o) => o.id === ob.id);
      if (back?.evidenceRef === ref && back.completedAt) {
        closedThisRun.add(ob.id);
        filed.push({ event: "evidence.filed", message_id: item.messageId, tenancy_id: ob.assetId, obligation_ref: ob.id, evidence: ref });
      } else {
        await ports.escalate("lease.copy_not_read_back", ob.id);
      }
    } else if (item.kind === "refusal") {
      await ports.recordRefusal(ob.id, item.at ?? now.toISOString());
      await ports.escalate("lease.refusal_recorded", `${ob.id} declined by ${item.by ?? "unnamed"}`);
    } else if (item.kind === "release") {
      const ok = await ports.releaseNotice(ob.id, item.person ?? undefined);
      if (!ok) await ports.escalate("lease.release_refused", ob.id);
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
      await ports.escalate("lease.anchor_unknown", ob.id);
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("lease.no_rule_in_force", ob.id);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    if (ob.jurisdiction && !versions.has(ruleKey(ob))) {
      versions.set(ruleKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const kept = versions.get(ruleKey(ob)) ?? [];
    for (const past of ob.history ?? []) {
      const explained = kept.some((r) => r.version === past.version && r.effectiveFrom && r.effectiveFrom <= past.date);
      if (!explained) await ports.escalate("lease.history_unexplained", `${ob.id} due ${past.date} under ${past.version}`);
    }
    view.push({ id: ob.id, tenancy_id: ob.assetId, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 5. Missed dates. Once set, never cleared.
  const missed = new Set(await ports.sweep());

  // 6 and 7. States, chases, drafts and escalations.
  for (const row of view) {
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (versions.get(ruleKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const isMissed = missed.has(ob.id);
    const live = !ob.completedAt && !closedThisRun.has(ob.id);
    row.missed = isMissed;
    row.state = live ? stateOf(ob, row.due, isMissed, now, rule?.leadDays ?? DEFAULT_LEAD_DAYS) : "closed";
    if (live) {
      if (isMissed) await ports.escalate("lease.date_missed", ob.id);
      if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
        await ports.escalate("lease.reply_overdue", `${ob.id} waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
      }
      if (rule?.notice && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
        await ports.prepareNotice(ob.id);
        await ports.escalate("lease.notice_drafted_awaiting_release", ob.id);
      }
    }
    delete row.ob;
  }
  return { view, filed };
}

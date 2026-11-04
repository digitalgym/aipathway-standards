/**
 * Client Review Watch: the practice's AML/CTF ongoing customer due diligence
 * review calendar, built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build for Australian accounting practices that are reporting
 * entities under the AML/CTF Act 2006 (Cth). The practice's own AML/CTF
 * program sets how often an existing client's due diligence is re-checked,
 * usually by the risk rating its compliance officer gave that client. That
 * cadence is the dated rule: it is held per risk rating (the obligation type)
 * and per office state, versioned with an effective date and a citation to
 * the program section, so a program or AML/CTF Rules change re-derives every
 * client's next review without anyone retyping a date.
 *
 * What one run does, each time it wakes (schedule.tick, an email already
 * tagged with a review obligation id, or exception.closed):
 *
 *   1. Read every client review obligation fresh from the register.
 *   2. Leave alone any review with an open exception: its named owner has it.
 *   3. Work the handover, by obligation id only, never by a client's name:
 *      - a completed review record (a document, signed off by a named
 *        reviewer) is filed as evidence and read back by id;
 *      - "reviewed" with no document, or no named reviewer, is not evidence;
 *      - a client who will not supply updated information is a dated refusal,
 *        and the review stays live and goes to the compliance officer;
 *      - a client telling us something changed (new director, new beneficial
 *        owner, new business activity) is raised for a person to decide on an
 *        early review. The bot does not re-rate the client;
 *      - a named person's release lets a drafted client information request go.
 *   4. For each review: no anchor (an inherited client with no review on file)
 *      is an explicit unknown state, surfaced, never defaulted to today.
 *      Otherwise the due date is derived from the rule version in force, and
 *      every past due date on the history must be explained by a retained
 *      rule version.
 *   5. Sweep for overdue reviews. A breach is never cleared, even once the
 *      review is done late. Each live breach goes to the compliance officer.
 *   6. Waiting on a client past the next chase date is silence, and is raised.
 *   7. The list: every client inside the lead time, or overdue, is put in
 *      front of the compliance officer with its rule version, due date and
 *      the evidence of its last review. Where the rule names a client
 *      information request, it is drafted and held for a named release.
 *
 * What it never does: rate or re-rate a client, decide a review is
 * satisfactory, decide whether to keep acting, or touch suspicious matter
 * reporting. Those stay with the compliance officer. A drafted client request
 * never mentions suspicion or a report (no tipping off). Every effect goes
 * through the ports; no due date is stored or typed.
 */

const DAY = 86_400_000;

/** Lead time when a rule does not name one. */
export const DEFAULT_LEAD_DAYS = 30;

/**
 * The client-facing request a rule can name. Deliberately plain: it asks for
 * current details and never says why beyond a routine periodic check.
 */
export const CLIENT_REQUEST_TEMPLATE =
  "As part of our routine periodic check of client details, please confirm or update " +
  "your identification, ownership and contact details using the attached form.";

const rulesKey = (ob) => `${ob.obligationType}::${ob.jurisdiction ?? ""}`;

function reviewState({ live, breached, waitingOn, dueIso, now, leadDays }) {
  if (!live) return "closed";
  if (breached) return "breached_or_at_risk";
  if (waitingOn) return "waiting_on_someone";
  if (!dueIso) return "scheduled";
  const daysLeft = (new Date(dueIso).getTime() - now.getTime()) / DAY;
  return daysLeft <= leadDays ? "due_action_drafted" : "scheduled";
}

/**
 * @param {object} ports  the CalendarWorld ports, or the practice's own register's
 * @param {Array<object>} [inbox]  items already tagged by obligation id:
 *   { kind: "review_record", obligationId, messageId, document?, reviewedBy? }
 *   { kind: "client_declined", obligationId, by, at }
 *   { kind: "change_notified", obligationId, messageId, what }
 *   { kind: "release", obligationId, person? }
 *   { kind: "untagged", messageId }  (no obligation id: raised, never guessed)
 * @returns {Promise<{ list: object[], filed: object[] }>}
 */
export async function build(ports, inbox = []) {
  const now = await ports.now();
  const register = await ports.readObligations();
  const byId = new Map(register.map((o) => [o.id, o]));
  const onHold = new Set(register.filter((o) => o.openException).map((o) => o.id));
  const doneThisRun = new Set();
  const filed = [];

  // 3. The inbox, by obligation id only.
  for (const item of inbox) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("cdd_review.email_unmatched", item.messageId ?? "an item with no obligation id");
      continue;
    }
    if (onHold.has(ob.id)) continue;

    if (item.kind === "review_record") {
      if (!item.reviewedBy) {
        // A review nobody signed is not a review on file.
        await ports.escalate("cdd_review.reviewer_unnamed", ob.id);
        continue;
      }
      const ref = item.document ? `${item.messageId}#${item.document}` : null;
      const res = await ports.complete(ob.id, ref);
      if (!res?.accepted) {
        await ports.escalate("cdd_review.completed_without_record", ob.id);
        continue;
      }
      const back = (await ports.readObligations()).find((o) => o.id === ob.id);
      if (back?.completedAt && back.evidenceRef === ref) {
        doneThisRun.add(ob.id);
        filed.push({ event: "evidence.filed", message_id: item.messageId, obligation_ref: ob.id, evidence: ref, reviewed_by: item.reviewedBy });
      } else {
        await ports.escalate("cdd_review.record_not_read_back", ob.id);
      }
    } else if (item.kind === "client_declined") {
      await ports.recordRefusal(ob.id, item.at ?? now.toISOString());
      await ports.escalate("cdd_review.client_declined", `${ob.id} declined by ${item.by ?? "unnamed"} at ${item.at ?? now.toISOString()}`);
    } else if (item.kind === "change_notified") {
      await ports.escalate("cdd_review.change_notified", `${ob.id}: ${item.what ?? "a change"} (${item.messageId ?? "no message id"})`);
    } else if (item.kind === "release") {
      const sent = await ports.releaseNotice(ob.id, item.person ?? undefined);
      if (!sent) await ports.escalate("cdd_review.release_without_person", ob.id);
    }
  }

  // 4. Derive each date, or surface the gap.
  const rulesSeen = new Map();
  const list = [];
  for (const ob of register) {
    if (onHold.has(ob.id)) {
      list.push({ obligation_ref: ob.id, client: ob.assetId, on_hold: true });
      continue;
    }
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("cdd_review.no_review_on_file", ob.id);
      list.push({ obligation_ref: ob.id, client: ob.assetId, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("cdd_review.no_rule_in_force", ob.id);
      list.push({ obligation_ref: ob.id, client: ob.assetId, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    if (ob.jurisdiction && !rulesSeen.has(rulesKey(ob))) {
      rulesSeen.set(rulesKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const versions = rulesSeen.get(rulesKey(ob)) ?? [];
    for (const past of ob.history ?? []) {
      const explained = versions.some((r) => r.version === past.version && r.effectiveFrom && r.effectiveFrom <= past.date);
      if (!explained) await ports.escalate("cdd_review.history_unexplained", `${ob.id} due ${past.date} under ${past.version}`);
    }
    list.push({ obligation_ref: ob.id, client: ob.assetId, anchor_status: "known", due: due.date, rule_version: due.version, _ob: ob });
  }

  // 5. Overdue reviews. Once set, never cleared.
  const overdue = new Set(await ports.sweep());

  // 6 and 7. States, chases and the review list.
  for (const row of list) {
    const ob = row._ob;
    if (!ob) continue;
    delete row._ob;
    const rule = (rulesSeen.get(rulesKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const live = !ob.completedAt && !doneThisRun.has(ob.id);
    const breached = overdue.has(ob.id);
    row.breached = breached;
    row.evidence_of_last_review = ob.lastReviewRef ?? ob.evidenceRef ?? null;
    row.citation = rule?.citation ?? null;
    row.state = reviewState({ live, breached, waitingOn: ob.waitingOn, dueIso: row.due, now, leadDays: rule?.leadDays ?? DEFAULT_LEAD_DAYS });
    if (!live) continue;

    if (breached) await ports.escalate("cdd_review.overdue", ob.id);
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await ports.escalate("cdd_review.chase_due", `${ob.id} waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
    if (row.state === "due_action_drafted") {
      await ports.escalate("cdd_review.due", `${ob.id} due ${row.due.slice(0, 10)} under ${row.rule_version}; last review ${row.evidence_of_last_review ?? "none on file"}`);
    }
    if (rule?.notice && (row.state === "due_action_drafted" || row.state === "breached_or_at_risk")) {
      await ports.prepareNotice(ob.id);
      await ports.escalate("cdd_review.request_drafted_awaiting_release", ob.id);
    }
  }
  return { list, filed };
}

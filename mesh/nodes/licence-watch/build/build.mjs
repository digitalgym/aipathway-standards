/**
 * Licence Watch: the licence and insurance renewals a trade business carries,
 * kept as a compliance calendar to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * What it watches: the contractor licence in each state the business works in
 * (QBCC in Queensland, NSW Fair Trading, the VBA in Victoria), each worker's
 * trade licence, public liability, and the workers compensation policy. The
 * licence record carries the anchor (the date it was last issued or renewed);
 * the expiry is derived from the business's own dated rule for that licence
 * type and state. Nobody types an expiry date in.
 *
 * Woken by schedule.tick each morning, by email.received when someone taps a
 * Done link (the link opens a message to the watched renewals inbox that
 * already carries the obligation id), or by exception.closed. Each run:
 *
 *   1. Reads the licence register fresh. Nothing is kept between runs.
 *   2. Leaves alone any obligation with an open exception. Its named owner has
 *      it, and the next run picks it up from the record once they close it.
 *   3. Works the Done replies, by obligation id only. Done with the renewed
 *      licence or certificate of currency attached: filed as evidence and read
 *      back by id. Done with nothing attached: refused, raised, still live. A
 *      reply with no obligation id is never matched on a name or a number.
 *      A decision not to renew is a dated outcome, and the obligation stays
 *      live. A release with no named person is refused.
 *   4. Derives each expiry from the rule in force for that state, or surfaces
 *      the gap: no anchor on the licence record, or no rule for the state.
 *      Every past expiry on the record must still be explained by a retained
 *      rule version.
 *   5. Sweeps for lapses. A lapse is never cleared, even once renewed.
 *   6. Reminds the named person: inside the lead time, a renewal reminder with
 *      a Done link; lapsed, an overdue reminder, every run until it is done.
 *      The reminder is an exception on the exception desk, which texts it to
 *      the exception_owner. Where the rule names a renewal request (to the
 *      insurer, the broker or the regulator), it is drafted and held for a
 *      named person to release. Nothing leaves the business from this build.
 */

const DAY = 86_400_000;

/** Lead time when a rule does not carry its own. */
const LEAD_DAYS = 30;

/** Who a reminder goes to when the licence record names nobody. */
const FALLBACK_OWNER = "the business owner";

function remind(ports, reason, target, note) {
  const id = typeof target === "string" ? target : target.id;
  const owner = typeof target === "string" ? FALLBACK_OWNER : (target.owner ?? FALLBACK_OWNER);
  return ports.escalate(reason, `${id}; exception_owner=${owner}${note ? `; ${note}` : ""}`);
}

/**
 * @param {object} ports  CalendarWorld ports, or the business's live licence register
 * @param {Array<object>} [replies]  Done-link replies and decisions, each by obligation id:
 *   { kind: "done", obligationId, messageId, documentRef? }
 *   { kind: "not_renewing", obligationId, by, at? }
 *   { kind: "release", obligationId, person? }
 * @returns {Promise<Array<object>>} this run's view of the register (not durable state)
 */
export async function build(ports, replies = []) {
  const now = await ports.now();
  const register = await ports.readObligations();
  const index = new Map(register.map((r) => [r.id, r]));
  const onHold = new Set(register.filter((r) => r.exceptionOpen).map((r) => r.id));
  const renewedThisRun = new Set();

  // 3. Done replies and decisions, by id.
  for (const reply of replies) {
    const ob = reply.obligationId ? index.get(reply.obligationId) : undefined;
    if (!ob) {
      await remind(ports, "licence.done_unmatched", reply.messageId ?? "a reply with no obligation id");
      continue;
    }
    if (onHold.has(ob.id)) continue;

    if (reply.kind === "done") {
      const res = await ports.complete(ob.id, reply.documentRef ?? undefined);
      if (res?.accepted !== true) {
        await remind(ports, "licence.done_without_document", ob, reply.messageId);
        continue;
      }
      const readBack = (await ports.readObligations()).find((r) => r.id === ob.id);
      if (readBack && readBack.evidenceRef === reply.documentRef && readBack.completedAt) renewedThisRun.add(ob.id);
      else await remind(ports, "licence.evidence_not_read_back", ob, reply.documentRef);
    } else if (reply.kind === "not_renewing") {
      await ports.recordRefusal(ob.id, reply.at ?? now.toISOString());
      await remind(ports, "licence.renewal_declined", ob, `declined by ${reply.by ?? "unnamed"}`);
    } else if (reply.kind === "release") {
      const released = await ports.releaseNotice(ob.id, reply.person ?? undefined);
      if (released !== true) await remind(ports, "licence.release_refused", ob);
    }
  }

  // 4. Derive, or surface the gap.
  const ruleCache = new Map();
  const rulesFor = async (ob) => {
    const key = `${ob.obligationType}@${ob.jurisdiction}`;
    if (!ruleCache.has(key)) ruleCache.set(key, await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    return ruleCache.get(key);
  };

  const view = [];
  const work = [];
  for (const ob of register) {
    if (onHold.has(ob.id)) continue;
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await remind(ports, "licence.anchor_unknown", ob, "no issue or renewal date on the licence record");
      view.push({ id: ob.id, anchor_status: "unknown", expiry: null, state: "scheduled" });
      continue;
    }
    const expiry = await ports.dueDate(ob.id);
    if (!expiry) {
      await remind(ports, "licence.no_rule_in_force", ob, `${ob.obligationType} in ${ob.jurisdiction}`);
      view.push({ id: ob.id, anchor_status: "known", expiry: null, state: "scheduled" });
      continue;
    }
    const versions = await rulesFor(ob);
    for (const past of ob.history ?? []) {
      const explained = versions.some((v) => v.version === past.version && v.effectiveFrom && v.effectiveFrom <= past.date);
      if (!explained) await remind(ports, "licence.history_unexplained", ob, `expired ${past.date} under ${past.version}`);
    }
    const row = { id: ob.id, anchor_status: "known", expiry: expiry.date, rule_version: expiry.version };
    view.push(row);
    work.push({ row, ob, rule: versions.find((v) => v.version === expiry.version) });
  }

  // 5. Lapses. The register keeps them, and so does this build.
  const lapsed = new Set(await ports.sweep());

  // 6. Reminders and drafted renewal requests.
  for (const { row, ob, rule } of work) {
    row.lapsed = lapsed.has(ob.id);
    if (ob.completedAt || renewedThisRun.has(ob.id)) {
      row.state = "scheduled";
      continue;
    }
    const lead = (rule?.leadDays ?? LEAD_DAYS) * DAY;
    const inLead = new Date(row.expiry).getTime() - now.getTime() <= lead;
    row.state = row.lapsed
      ? "breached_or_at_risk"
      : ob.waitingOn
        ? "waiting_on_someone"
        : inLead
          ? "due_action_drafted"
          : "scheduled";

    if (row.lapsed) await remind(ports, "licence.overdue", ob, `expired ${row.expiry}; Done link sent`);
    else if (inLead) await remind(ports, "licence.renewal_due", ob, `expires ${row.expiry}; Done link sent`);

    if (rule?.renewalRequest && (row.lapsed || inLead)) {
      await ports.prepareNotice(ob.id);
      await remind(ports, "licence.renewal_drafted_awaiting_release", ob, rule.renewalRequest);
    }
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await remind(ports, "licence.chase_due", ob, `waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
  }
  return view;
}

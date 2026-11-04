/**
 * Plant Watch: the inspections a building or trade business's own plant and
 * equipment must have, kept as a compliance calendar to
 * AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * What it watches: each item on the plant register (an elevating work
 * platform's annual inspection, a height safety harness's periodic check, the
 * test and tag on site power tools and leads, a registered item's renewal with
 * the state WHS regulator). The item record carries the anchor: the date its
 * last completed check was filed. The due date is derived from the business's
 * own dated rule for that check and that state. Nobody types a due date in.
 *
 * Woken by schedule.tick each morning, by document.received when a completed
 * inspection report or test record lands in the watched plant folder already
 * named with the obligation id, or by exception.closed. Each run:
 *
 *   1. Reads the plant register fresh. Nothing is kept between runs.
 *   2. Leaves alone any obligation with an open exception. Its named owner has
 *      it, and the next run picks it up from the record once they close it.
 *   3. Works what came in, by obligation id only. A completed check with its
 *      report attached is filed on the item's record and read back by id; only
 *      then is it counted done. A "done" with no report is refused, raised and
 *      stays live. A decision to park the item rather than inspect it is a
 *      dated outcome and the obligation stays live. A release of a drafted
 *      inspection booking with no named person is refused.
 *   4. Derives each due date from the rule in force in the item's state, or
 *      surfaces the gap: no last-check date on the record, or no rule for that
 *      check in that state. Every past due date on the record must still be
 *      explained by a retained rule version.
 *   5. Sweeps for overdue items. An overdue item stays overdue on the record,
 *      even once the check is finally filed.
 *   6. Reminds the named person: inside the lead time, an inspection-due
 *      reminder; overdue, a reminder every run that the item should not be used
 *      until its check is filed. Where the rule names a booking with an outside
 *      inspector or tester, the booking request is drafted and held for a named
 *      person to release. Nothing leaves the business from this build, and it
 *      never says an item is safe: the inspector's report does that.
 */

const DAY = 86_400_000;

/** Lead time when a rule does not carry its own. */
const LEAD_DAYS = 28;

/** Who a reminder goes to when the plant record names nobody. */
const FALLBACK_OWNER = "the business owner";

function raise(ports, reason, target, note) {
  const id = typeof target === "string" ? target : target.id;
  const owner = typeof target === "string" ? FALLBACK_OWNER : (target.owner ?? FALLBACK_OWNER);
  return ports.escalate(reason, `${id}; exception_owner=${owner}${note ? `; ${note}` : ""}`);
}

const label = (ob) => (ob.item ? `${ob.item} (${ob.obligationType})` : ob.obligationType);

/**
 * @param {object} ports  CalendarWorld ports, or the business's live plant register
 * @param {Array<object>} [inbox]  what arrived since the last run, each by obligation id:
 *   { kind: "filed", obligationId, messageId, documentRef? }   a completed check
 *   { kind: "parked", obligationId, by, at? }                  owner parks the item instead
 *   { kind: "release", obligationId, person? }                 release of a drafted booking
 * @returns {Promise<Array<object>>} this run's view of the register (not durable state)
 */
export async function build(ports, inbox = []) {
  const now = await ports.now();
  const register = await ports.readObligations();
  const byId = new Map(register.map((r) => [r.id, r]));
  const held = new Set(register.filter((r) => r.exceptionOpen).map((r) => r.id));
  const filedNow = new Set();

  // 3. What came in, by obligation id only.
  for (const msg of inbox) {
    const ob = msg.obligationId ? byId.get(msg.obligationId) : undefined;
    if (!ob) {
      await raise(ports, "plant.report_unmatched", msg.messageId ?? "a message with no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;

    if (msg.kind === "filed") {
      const res = await ports.complete(ob.id, msg.documentRef || undefined);
      if (res?.accepted !== true) {
        await raise(ports, "plant.done_without_report", ob, msg.messageId);
        continue;
      }
      const back = (await ports.readObligations()).find((r) => r.id === ob.id);
      if (back && back.evidenceRef === msg.documentRef && back.completedAt) filedNow.add(ob.id);
      else await raise(ports, "plant.report_not_read_back", ob, msg.documentRef);
    } else if (msg.kind === "parked") {
      await ports.recordRefusal(ob.id, msg.at ?? now.toISOString());
      await raise(ports, "plant.inspection_declined", ob, `parked by ${msg.by ?? "unnamed"}; still due`);
    } else if (msg.kind === "release") {
      const ok = await ports.releaseNotice(ob.id, msg.person || undefined);
      if (ok !== true) await raise(ports, "plant.release_refused", ob, "a booking is released only by a named person");
    }
  }

  // 4. Derive, or surface the gap.
  const versionsCache = new Map();
  const versionsOf = async (ob) => {
    const key = `${ob.obligationType}|${ob.jurisdiction}`;
    if (!versionsCache.has(key)) versionsCache.set(key, await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    return versionsCache.get(key);
  };

  const view = [];
  const open = [];
  for (const ob of register) {
    if (held.has(ob.id)) continue;
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await raise(ports, "plant.last_check_unknown", ob, `${label(ob)}: no date of last completed check on the item's record`);
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await raise(ports, "plant.no_rule_in_force", ob, `${ob.obligationType} in ${ob.jurisdiction}`);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    const versions = await versionsOf(ob);
    for (const past of ob.history ?? []) {
      const explained = versions.some((v) => v.version === past.version && v.effectiveFrom && v.effectiveFrom <= past.date);
      if (!explained) await raise(ports, "plant.history_unexplained", ob, `was due ${past.date} under ${past.version}`);
    }
    const row = { id: ob.id, anchor_status: "known", due: due.date, rule_version: due.version };
    view.push(row);
    open.push({ row, ob, rule: versions.find((v) => v.version === due.version) });
  }

  // 5. Overdue items. The register keeps them, and so does this build.
  const overdue = new Set(await ports.sweep());

  // 6. Reminders and drafted bookings.
  for (const { row, ob, rule } of open) {
    row.overdue = overdue.has(ob.id);
    if (ob.completedAt || filedNow.has(ob.id)) {
      row.state = "scheduled";
      continue;
    }
    const lead = (rule?.leadDays ?? LEAD_DAYS) * DAY;
    const inLead = new Date(row.due).getTime() - now.getTime() <= lead;
    row.state = row.overdue
      ? "breached_or_at_risk"
      : ob.waitingOn
        ? "waiting_on_someone"
        : inLead
          ? "due_action_drafted"
          : "scheduled";

    if (row.overdue) await raise(ports, "plant.inspection_overdue", ob, `${label(ob)} was due ${row.due}; do not use until the check is filed`);
    else if (inLead) await raise(ports, "plant.inspection_due", ob, `${label(ob)} due ${row.due} under ${row.rule_version}`);

    if (rule?.booking && (row.overdue || inLead)) {
      await ports.prepareNotice(ob.id);
      await raise(ports, "plant.booking_drafted_awaiting_release", ob, rule.booking);
    }
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await raise(ports, "plant.chase_due", ob, `waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
  }
  return view;
}

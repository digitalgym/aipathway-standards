/**
 * Fire Round Watch: works out each site's next routine fire service from the
 * written maintenance schedule and the last completed visit, built to
 * AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build. Only the job sentence was taken: "work out each site's
 * next routine fire service (monthly, six-monthly, yearly) from the written
 * schedule and the last completed visit, and draft the bookings for anything
 * coming due".
 *
 * THE SHAPE. Each fire system on a site (sprinkler, detection and alarm,
 * hydrant, emergency lighting) is an asset in the register, with its asset_id.
 * Each routine on the site's written schedule is one obligation on that asset:
 * a monthly, a six-monthly and a yearly routine are three rows, each with its
 * own anchor (the last completed visit for that routine). The interval for each
 * routine is a dated rule per state, because the edition of the routine service
 * standard a state's building rules call up, and the frequency it sets, move by
 * effective date. Nobody types a due date. A state calling up a new edition is
 * a new rule version, and every due date derived from the old one moves.
 *
 * WHAT THE OWNER SEES, and the standard's state behind each:
 *
 *   Overdue          breached_or_at_risk   the routine date passed. Escalated
 *                                           to a named person. Never clears
 *                                           itself, even after a late visit.
 *   Booking drafted  due_action_drafted    inside the lead time. The visit
 *                                           booking is drafted on the routine
 *                                           and held for a person to release.
 *   Scheduled        scheduled             a derived date outside the lead time.
 *   Last visit unknown  (no date)          the schedule names the routine but
 *                                           nobody knows when it was last done.
 *                                           Never defaulted to today.
 *   No rule          (no date)             the routine's frequency has no rule
 *                                           for the site's state. Surfaced.
 *
 * ONE RUN, every time it is woken (schedule.tick each morning, a service report
 * filed against a routine's obligation id, or exception.closed):
 *
 *   1. Read the register fresh. Nothing is cached between runs.
 *   2. Skip any routine with an open exception: the chain waits for its owner.
 *   3. Apply the handover, by obligation id only, never by site name or address:
 *      a service report completes the routine with the report as evidence (and,
 *      where the report says so, the shorter routines done on the same visit to
 *      the same system); a report with no document is refused and raised; a
 *      building owner declining the visit is a dated refusal and the routine
 *      stays live; a named person's release lets a drafted booking go.
 *   4. Derive each due date from the rule version in force for the site's state,
 *      and read the rule's versions so a past due date stays explainable.
 *   5. Sweep for breaches, then class every routine and act on its class.
 *
 * Every effect goes through the ports. It never sends a booking or a notice on
 * its own, never books a technician, never lodges an annual fire safety
 * statement or certificate, and never certifies a system: a competent person
 * does the routine and signs the report, and the owner's statement stays theirs.
 */

const DAY = 86_400_000;

/** How early a booking is drafted, when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 14;

/** Who an exception names when the routine row does not name anyone. */
export const DEFAULT_OWNER = "service coordinator";

export const CLASS = {
  overdue: "Overdue",
  drafted: "Booking drafted",
  scheduled: "Scheduled",
  unknown: "Last visit unknown",
  noRule: "No rule",
};

const ownerOf = (ob) => ob.exceptionOwner ?? DEFAULT_OWNER;
const detail = (ob, extra = "") =>
  `${ob.id} system ${ob.assetId} routine ${ob.obligationType} owner=${ownerOf(ob)}${extra ? ` ${extra}` : ""}`;
const versionKey = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  items already filed against an obligation
 *   id: { kind: "report" | "refusal" | "release", obligationId, evidenceRef?,
 *   alsoCovers?: string[], by?, at?, person?, ref? }
 * @returns {Promise<Array<object>>} this run's view of the register (not stored)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const halted = new Set(rows.filter((o) => o.openException).map((o) => o.id));
  const completedNow = new Set();

  // 3. The handover, by obligation id only.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("fireround.report_unmatched", item.ref ?? "a filed item with no routine id");
      continue;
    }
    if (halted.has(ob.id)) continue;

    if (item.kind === "report") {
      const res = await ports.complete(ob.id, item.evidenceRef);
      if (res?.accepted !== true) {
        await ports.escalate("fireround.visit_without_report", detail(ob, res?.why ?? ""));
        continue;
      }
      completedNow.add(ob.id);
      // A yearly visit's report can show the six-monthly and monthly items done
      // on the same visit. Only routines on the same system, named on the
      // report, by id, and with the same document as their evidence.
      for (const otherId of item.alsoCovers ?? []) {
        const other = byId.get(otherId);
        if (!other || other.assetId !== ob.assetId || halted.has(other.id)) {
          await ports.escalate("fireround.report_unmatched", `${otherId} named on ${ob.id}'s report is not a routine on system ${ob.assetId}`);
          continue;
        }
        const r2 = await ports.complete(other.id, item.evidenceRef);
        if (r2?.accepted === true) completedNow.add(other.id);
        else await ports.escalate("fireround.visit_without_report", detail(other, r2?.why ?? ""));
      }
    } else if (item.kind === "refusal") {
      const at = item.at ?? now.toISOString();
      await ports.recordRefusal(ob.id, at);
      await ports.escalate("fireround.visit_declined", detail(ob, `declined by ${item.by ?? "unnamed"} on ${at.slice(0, 10)}`));
    } else if (item.kind === "release") {
      const released = await ports.releaseNotice(ob.id, item.person);
      if (released !== true) await ports.escalate("fireround.release_refused", detail(ob));
    }
  }

  // 4. Derive, or surface the gap.
  const versions = new Map();
  const view = [];
  for (const ob of rows) {
    const base = { id: ob.id, assetId: ob.assetId, site: ob.siteRef ?? null, routine: ob.obligationType };
    if (halted.has(ob.id)) {
      view.push({ ...base, class: null, halted: true });
      continue;
    }
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("fireround.last_visit_unknown", detail(ob, "no completed visit on the register for this routine"));
      view.push({ ...base, class: CLASS.unknown, anchor_status: "unknown", due: null });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("fireround.no_rule_for_state", detail(ob, ob.jurisdiction ?? "no state"));
      view.push({ ...base, class: CLASS.noRule, anchor_status: "known", due: null });
      continue;
    }
    if (ob.jurisdiction && !versions.has(versionKey(ob))) {
      versions.set(versionKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const history = versions.get(versionKey(ob)) ?? [];
    for (const past of ob.pastDue ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom)) {
        await ports.escalate("fireround.history_unexplained", detail(ob, `due ${past.date} under ${past.version}`));
      }
    }
    view.push({ ...base, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 5. Breaches first. Once set, the register never unsets them.
  const breached = new Set(await ports.sweep());

  for (const row of view) {
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (versions.get(versionKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const leadDays = rule?.leadDays ?? DEFAULT_LEAD_DAYS;
    const live = !ob.completedAt && !completedNow.has(ob.id);
    const msToDue = new Date(row.due).getTime() - now.getTime();
    row.breached = breached.has(ob.id);

    if (row.breached && live) {
      row.class = CLASS.overdue;
      await ports.escalate("fireround.routine_overdue", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
      if (rule?.noticeOnBreach) {
        await ports.prepareNotice(ob.id);
        await ports.escalate("fireround.notice_drafted_awaiting_release", detail(ob));
      }
    } else if (live && msToDue <= leadDays * DAY) {
      row.class = CLASS.drafted;
      await ports.prepareNotice(ob.id);
      await ports.escalate("fireround.booking_drafted_awaiting_release", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
    } else {
      // A late visit that was done still reads breached in its history.
      row.class = CLASS.scheduled;
    }
    delete row.ob;
  }
  return view;
}

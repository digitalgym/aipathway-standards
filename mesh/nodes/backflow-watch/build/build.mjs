/**
 * Backflow Watch: a daily read of a testable backflow device register, built
 * to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * A reimplementation, from the standard, of a public backflow triage workflow
 * (credited in mesh.json). Only its listing text was used: read the register
 * daily, work out overdue risk, class each device. Nothing here comes from the
 * original's prompt, instructions or workflow file.
 *
 * Each device in the register is an asset (asset_id, issued by the register),
 * and its annual test is an obligation on it. The test interval is a dated rule
 * per state, held in the register's rule store, so a state changing its rule
 * moves every due date at once and nobody retypes one.
 *
 * The classes the owner sees, and the standard's state behind each:
 *
 *   Critical Overdue  breached_or_at_risk   the test date passed. Escalated to
 *                                           a named person. Never clears itself.
 *   Due Soon          due_action_drafted    inside the lead time. The test
 *                                           booking request is drafted and held
 *                                           for a named person to release.
 *   Compliant         scheduled             a derived due date outside the lead
 *                                           time, with a test report on file.
 *   Anchor Unknown    (surfaced, no date)   no last-test date on the register.
 *                                           Never defaulted to today.
 *
 * What one run does, every time it is woken (schedule.tick daily, a test
 * report filed against a device's obligation id, or exception.closed):
 *
 *   1. Read the register fresh. Nothing is cached between runs.
 *   2. Skip any device with an open exception: the chain waits for its owner.
 *   3. Apply what was handed over, by obligation id only: a test report is a
 *      completion with evidence; a "passed" with no report is refused and
 *      raised; a site owner who declines the test is a dated refusal and the
 *      device stays live; a named person's release lets a drafted booking go.
 *   4. Derive each due date from the rule version in force for the device's
 *      state, and read that rule's versions so a past date stays explainable.
 *   5. Sweep for breaches, then class every device and act on its class.
 *
 * Every effect goes through the ports. It never sends a notice on its own,
 * never lodges a test result with a council or water authority, and never
 * certifies a device: a licensed tester does the test and signs the report.
 */

const DAY = 86_400_000;

/** How early a booking request is drafted, when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 45;

/** Who an exception names when the device row does not name anyone. */
export const DEFAULT_OWNER = "compliance coordinator";

export const CLASS = {
  critical: "Critical Overdue",
  dueSoon: "Due Soon",
  compliant: "Compliant",
  unknown: "Anchor Unknown",
  noRule: "No Rule",
};

const ownerOf = (ob) => ob.exceptionOwner ?? ob.responsible ?? DEFAULT_OWNER;
const detail = (ob, extra = "") => `${ob.id} device ${ob.assetId} owner=${ownerOf(ob)}${extra ? ` ${extra}` : ""}`;
const versionKey = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  items already filed against an obligation
 *   id: { kind: "report" | "refusal" | "release", obligationId, evidenceRef?,
 *   by?, at?, person? }
 * @returns {Promise<Array<object>>} this run's view of the register (not stored)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const halted = new Set(rows.filter((o) => o.openException).map((o) => o.id));
  const completedNow = new Set();

  // 3. The handover, by obligation id only. Never by site name or address.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("backflow.report_unmatched", item.ref ?? "a filed item with no obligation id");
      continue;
    }
    if (halted.has(ob.id)) continue;
    if (item.kind === "report") {
      const res = await ports.complete(ob.id, item.evidenceRef);
      if (res?.accepted === true) completedNow.add(ob.id);
      else await ports.escalate("backflow.test_without_report", detail(ob, res?.why ?? ""));
    } else if (item.kind === "refusal") {
      const at = item.at ?? now.toISOString();
      await ports.recordRefusal(ob.id, at);
      await ports.escalate("backflow.test_declined", detail(ob, `declined by ${item.by ?? "unnamed"} on ${at.slice(0, 10)}`));
    } else if (item.kind === "release") {
      const released = await ports.releaseNotice(ob.id, item.person);
      if (released !== true) await ports.escalate("backflow.release_refused", detail(ob));
    }
  }

  // 4. Derive, or surface the gap.
  const versions = new Map();
  const view = [];
  for (const ob of rows) {
    if (halted.has(ob.id)) {
      view.push({ id: ob.id, assetId: ob.assetId, class: null, halted: true });
      continue;
    }
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("backflow.anchor_unknown", detail(ob, "no last-test date on the register"));
      view.push({ id: ob.id, assetId: ob.assetId, class: CLASS.unknown, anchor_status: "unknown", due: null });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("backflow.no_rule_for_state", detail(ob, ob.jurisdiction ?? "no state"));
      view.push({ id: ob.id, assetId: ob.assetId, class: CLASS.noRule, anchor_status: "known", due: null });
      continue;
    }
    if (ob.jurisdiction && !versions.has(versionKey(ob))) {
      versions.set(versionKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const history = versions.get(versionKey(ob)) ?? [];
    for (const past of ob.pastDue ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom)) {
        await ports.escalate("backflow.history_unexplained", detail(ob, `due ${past.date} under ${past.version}`));
      }
    }
    view.push({ id: ob.id, assetId: ob.assetId, anchor_status: "known", due: due.date, rule_version: due.version, ob });
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
      row.class = CLASS.critical;
      await ports.escalate("backflow.critical_overdue", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
      if (rule?.noticeOnBreach) {
        await ports.prepareNotice(ob.id);
        await ports.escalate("backflow.notice_drafted_awaiting_release", detail(ob));
      }
    } else if (live && msToDue <= leadDays * DAY) {
      row.class = CLASS.dueSoon;
      await ports.prepareNotice(ob.id);
      await ports.escalate("backflow.test_due_soon", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
    } else {
      // A late test that was done still reads breached in its history.
      row.class = CLASS.compliant;
    }
    delete row.ob;
  }
  return view;
}

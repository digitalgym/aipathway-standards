/**
 * Rack Watch: a daily read of a racking inspector's register of client
 * warehouses, built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build. The job: keep each warehouse's racking inspection under
 * AS 4084 on a calendar worked out from a dated rule, and file every damage
 * finding from the inspector's report against its bay, with the repair
 * recommendation drafted for a person to send to the client.
 *
 * Each racking installation is an asset (asset_id, issued by the register),
 * and its periodic inspection by a competent person is an obligation on it.
 * The inspection interval is a dated rule held in the register's rule store,
 * per state, so a rule change moves every due date at once and nobody retypes
 * one. The intervals in scenarios.mjs are stub versions, not a reading of the
 * standard: the real ones go in the business's own rule store, with a citation.
 *
 * What the owner sees for each installation:
 *
 *   Overdue        breached_or_at_risk   the inspection date passed. Raised to
 *                                        a named person. Never clears itself.
 *   Due Soon       due_action_drafted    inside the lead time. The client's
 *                                        inspection booking is drafted and held
 *                                        for a named person to release.
 *   Current        scheduled             a derived due date outside the lead
 *                                        time.
 *   Last Unknown   (surfaced, no date)   nobody knows when it was last
 *                                        inspected. Never defaulted to today.
 *
 * What one run does, each time it is woken (schedule.tick daily, an inspection
 * report filed against an installation's obligation id, or exception.closed):
 *
 *   1. Read the register fresh. Nothing is cached between runs.
 *   2. Skip any installation with an open exception: it waits for its owner.
 *   3. Apply what was handed over, by obligation id only:
 *      - an inspection report is a completion with the report as evidence. A
 *        "done" with no report attached is refused and raised.
 *      - every damage finding in the report is filed against its bay, carrying
 *        the risk level THE INSPECTOR gave it (red, amber, green). The bot never
 *        classifies damage. A finding with no level, or no bay, is raised.
 *        Red findings go to a named person straight away.
 *      - the repair recommendations are drafted into one summary for the
 *        client, held for a named person to send.
 *      - a client who declines the inspection is a dated refusal, and the
 *        installation stays live.
 *      - a named person's release lets a drafted booking go.
 *   4. Derive each due date from the rule version in force for the site's
 *      state, and read that rule's versions so a past date stays explainable.
 *   5. Sweep for breaches, then class every installation and act on it.
 *
 * Every effect goes through the ports. It never sends a client anything on its
 * own, never classifies damage, never unloads or isolates a bay, and never
 * signs off an installation as safe: the competent person does the inspection
 * and signs the report.
 */

const DAY = 86_400_000;

/** How early the booking is drafted, when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 30;

/** Who an exception names when the installation row does not name anyone. */
export const DEFAULT_OWNER = "inspections coordinator";

/** The inspector's risk levels. The bot carries them, never assigns them. */
export const RISK_LEVELS = ["red", "amber", "green"];

export const CLASS = {
  overdue: "Overdue",
  dueSoon: "Due Soon",
  current: "Current",
  unknown: "Last Unknown",
  noRule: "No Rule",
};

const ownerOf = (ob) => ob.exceptionOwner ?? DEFAULT_OWNER;
const detail = (ob, extra = "") => `${ob.id} site ${ob.assetId} owner=${ownerOf(ob)}${extra ? ` ${extra}` : ""}`;
const versionKey = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;

/**
 * File the findings of one accepted report against their bays. Returns the
 * client repair summary draft (held, never sent) and the filed findings.
 */
async function fileFindings(ports, ob, findings = []) {
  const filed = [];
  for (const f of findings) {
    if (!f?.bay) {
      await ports.escalate("rack.finding_without_bay", detail(ob, "a finding the report does not tie to a bay"));
      continue;
    }
    if (!RISK_LEVELS.includes(f.risk)) {
      await ports.escalate("rack.finding_unclassified", detail(ob, `bay ${f.bay} has no risk level from the inspector`));
      continue;
    }
    filed.push({ bay: f.bay, risk: f.risk, damage: f.damage ?? "", recommendation: f.recommendation ?? "" });
    if (f.risk === "red") {
      await ports.escalate("rack.red_finding", detail(ob, `bay ${f.bay}: ${f.recommendation ?? "see report"}`));
    }
  }
  const repairs = filed.filter((f) => f.risk !== "green");
  let summary = null;
  if (repairs.length > 0) {
    summary = {
      to: "client",
      status: "drafted, awaiting a named person",
      lines: repairs.map((f) => `Bay ${f.bay} (${f.risk}): ${f.damage}. Recommended: ${f.recommendation}`),
    };
    await ports.escalate("rack.repair_summary_awaiting_release", detail(ob, `${repairs.length} bay(s)`));
  }
  return { filed, summary };
}

/**
 * @param {object} ports  the CalendarWorld ports, or the live register's
 * @param {Array<object>} [handover]  items already filed against an obligation
 *   id: { kind: "report" | "refusal" | "release", obligationId, evidenceRef?,
 *   findings?, by?, at?, person? }
 * @returns {Promise<Array<object>>} this run's view of the register (not stored)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const halted = new Set(rows.filter((o) => o.openException).map((o) => o.id));
  const completedNow = new Set();
  const filings = new Map();

  // 3. The handover, by obligation id only. Never by site name or address.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("rack.report_unmatched", item.ref ?? "a filed item with no obligation id");
      continue;
    }
    if (halted.has(ob.id)) continue;
    if (item.kind === "report") {
      const res = await ports.complete(ob.id, item.evidenceRef);
      if (res?.accepted === true) {
        completedNow.add(ob.id);
        filings.set(ob.id, await fileFindings(ports, ob, item.findings));
      } else {
        await ports.escalate("rack.inspection_without_report", detail(ob, res?.why ?? ""));
      }
    } else if (item.kind === "refusal") {
      const at = item.at ?? now.toISOString();
      await ports.recordRefusal(ob.id, at);
      await ports.escalate("rack.inspection_declined", detail(ob, `declined by ${item.by ?? "unnamed"} on ${at.slice(0, 10)}`));
    } else if (item.kind === "release") {
      const released = await ports.releaseNotice(ob.id, item.person);
      if (released !== true) await ports.escalate("rack.release_refused", detail(ob));
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
      await ports.escalate("rack.last_inspection_unknown", detail(ob, "no last inspection date on the register"));
      view.push({ id: ob.id, assetId: ob.assetId, class: CLASS.unknown, anchor_status: "unknown", due: null });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("rack.no_rule_for_state", detail(ob, ob.jurisdiction ?? "no state"));
      view.push({ id: ob.id, assetId: ob.assetId, class: CLASS.noRule, anchor_status: "known", due: null });
      continue;
    }
    if (ob.jurisdiction && !versions.has(versionKey(ob))) {
      versions.set(versionKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const history = versions.get(versionKey(ob)) ?? [];
    for (const past of ob.pastDue ?? []) {
      if (!history.some((r) => r.version === past.version && r.effectiveFrom)) {
        await ports.escalate("rack.history_unexplained", detail(ob, `due ${past.date} under ${past.version}`));
      }
    }
    view.push({ id: ob.id, assetId: ob.assetId, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 5. Breaches first. Once set, the register never unsets them.
  const breached = new Set(await ports.sweep());

  for (const row of view) {
    const filing = filings.get(row.id);
    if (filing) {
      row.findings = filing.filed;
      row.repair_summary = filing.summary;
    }
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (versions.get(versionKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const leadDays = rule?.leadDays ?? DEFAULT_LEAD_DAYS;
    const live = !ob.completedAt && !completedNow.has(ob.id);
    const msToDue = new Date(row.due).getTime() - now.getTime();
    row.breached = breached.has(ob.id);

    if (row.breached && live) {
      row.class = CLASS.overdue;
      await ports.escalate("rack.inspection_overdue", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
      if (rule?.noticeOnBreach) {
        await ports.prepareNotice(ob.id);
        await ports.escalate("rack.notice_drafted_awaiting_release", detail(ob));
      }
    } else if (live && msToDue <= leadDays * DAY) {
      row.class = CLASS.dueSoon;
      await ports.prepareNotice(ob.id);
      await ports.escalate("rack.inspection_due_soon", detail(ob, `due ${row.due.slice(0, 10)} under ${row.rule_version}`));
    } else {
      // A late inspection that was done still reads breached in its history.
      row.class = CLASS.current;
    }
    delete row.ob;
  }
  return view;
}

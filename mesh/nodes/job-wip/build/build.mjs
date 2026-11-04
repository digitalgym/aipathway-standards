/**
 * Job WIP: the Monday job profit and work-in-progress report for an
 * Australian trade or building business, built to AIP-BS-RECURRING-REPORT
 * 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Original build. For each open job it publishes three figures (quoted value,
 * cost to date, invoiced to date) plus the three totals across open jobs,
 * every figure from one definition in a register a person writes, with the
 * system it was read from and the time it was read.
 *
 * What this file does NOT hold: the measures. Which jobs are open, which
 * query gives a job's accepted quote, its cost to date or what has been
 * invoiced against it, and who owns each figure, all live in the definitions
 * register. This file only runs the register on schedule.
 *
 * It reads, and it publishes the report. It never edits a job, a quote, an
 * invoice or a bill, never sends the report outside the business, and never
 * corrects a figure on its own: a correction is a new version released by the
 * named person who asked for it.
 *
 * One run, each time the schedule wakes it (schedule.tick) or an exception on
 * a report record is closed (exception.closed):
 *
 *   1. Read the schedule. A week is due once its scheduled time has arrived
 *      and an audience has no report for it yet. Nothing early, nothing
 *      skipped because the numbers did not move.
 *   2. Read the register, the audiences and the thresholds.
 *   3. Work out each measure any audience carries exactly once: no definition
 *      or two definitions publishes as unavailable with the reason; otherwise
 *      one read of the source, citing the as-of time the read returned. A
 *      failed read publishes as unavailable with the reason, and the
 *      definition's owner is told. Never last week's number.
 *   4. One view per audience, carrying only its declared measures, with a
 *      sentence that describes and never states a number.
 *   5. Read each view back. No id back raises report.publish_failed.
 *   6. Compare each threshold against last week's published figure. A
 *      crossing tells the named person in the same run; an unavailable prior
 *      or current figure is escalated, never assumed.
 *   7. Corrections a named person asked for: the person's release (gate)
 *      first, then a new version superseding the old. Nothing is edited in
 *      place.
 */

const NARRATIVE =
  "Job WIP for the week: quoted value, cost to date and invoiced to date for each open job, " +
  "with the totals across open jobs. Each figure shows the system it was read from and when. " +
  "A figure marked unavailable could not be read this week and its owner has been told.";

const CORRECTION_NOTE =
  " This version replaces the earlier one at the request of a named person; the reason is on the version record.";

/** Has this period's scheduled time arrived? */
const isDue = (entry, now) => Date.parse(entry.scheduledAt) <= now.getTime();

/**
 * Work out every measure the audiences carry, once each.
 * Returns a map of measure -> FigureInput (without the measure duplicated).
 */
async function computeFigures(ports, period, measures, defs) {
  const figures = new Map();
  for (const measure of measures) {
    const mine = defs.filter((d) => d.measure === measure);
    if (mine.length === 0) {
      figures.set(measure, { measure, value: null, unavailableReason: "no_definition" });
      await ports.escalate("report.no_definition", `${measure} ${period}: no definition in the register`);
      continue;
    }
    if (mine.length > 1) {
      figures.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
      await ports.escalate(
        "report.conflicting_definitions",
        `${measure} ${period}: ${mine.map((d) => d.id).join(", ")} all define it`,
      );
      continue;
    }
    const def = mine[0];
    const read = await ports.readSource(def.source, def.queryRef, period);
    if (!read || read.ok !== true) {
      const reason = `${def.source}: ${read?.reason ?? "no_response"}`;
      figures.set(measure, { measure, value: null, unavailableReason: reason, definition: def });
      await ports.notify(def.owner, { measure, period, detail: `could not be read (${reason})` });
      await ports.escalate("report.source_unreadable", `${measure} ${period}: ${reason}; owner ${def.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
    figures.set(measure, { measure, value: read.value, unavailableReason: null, cited, definition: def });
  }
  return figures;
}

const toInput = (f) => {
  const out = { measure: f.measure, value: f.value, unavailableReason: f.unavailableReason };
  if (f.cited) out.cited = f.cited;
  return out;
};

async function readBack(ports, period, id) {
  const rows = await ports.readReports(period);
  if (!rows.some((r) => r.id === id)) {
    await ports.escalate("report.publish_failed", `${period}: report ${id} did not read back`);
    return false;
  }
  return true;
}

/** The figure last week's current published views carry for one measure. */
function priorFigure(priorReports, measure) {
  for (const r of priorReports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return f;
  }
  return undefined;
}

async function checkThresholds(ports, schedule, entry, figures, thresholds) {
  const ordered = [...schedule].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const idx = ordered.findIndex((e) => e.period === entry.period);
  const prior = idx > 0 ? ordered[idx - 1] : undefined;
  if (!prior) return; // the first week has nothing to compare against
  const priorReports = await ports.readReports(prior.period);
  for (const t of thresholds) {
    const now = figures.get(t.measure);
    if (!now) continue; // no audience carries it
    const before = priorFigure(priorReports, t.measure);
    if (!before || before.value === null || now.value === null) {
      await ports.escalate(
        "report.threshold_not_comparable",
        `${t.measure} ${entry.period}: ${!before || before.value === null ? `no figure for ${prior.period}` : "unavailable this week"}; threshold person ${t.notify}`,
      );
      continue;
    }
    const delta = now.value - before.value;
    const crossed = t.direction === "up" ? delta >= t.amount : -delta >= t.amount;
    if (crossed) {
      await ports.notify(t.notify, {
        measure: t.measure,
        period: entry.period,
        detail: `moved ${t.direction} past the threshold against ${prior.period}`,
      });
    }
  }
}

async function publishPeriod(ports, entry, schedule, defs, audiences, thresholds, existing) {
  const pending = audiences.filter((a) => !existing.some((r) => r.audienceId === a.id));
  if (pending.length === 0) return;
  const measures = [...new Set(pending.flatMap((a) => a.measures))];
  const figures = await computeFigures(ports, entry.period, measures, defs);
  for (const a of pending) {
    const report = await ports.publishReport({
      period: entry.period,
      audienceId: a.id,
      figures: a.measures.map((m) => toInput(figures.get(m))),
      narrative: NARRATIVE,
    });
    await readBack(ports, entry.period, report?.id);
  }
  await checkThresholds(ports, schedule, entry, figures, thresholds);
}

async function applyCorrection(ports, c, defs) {
  if (!c.person || !c.reason) {
    await ports.escalate("report.correction_incomplete", `${c.id}: a correction needs a named person and a reason`);
    return;
  }
  const rows = await ports.readReports(c.period);
  if (rows.some((r) => r.supersedes === c.reportId)) return; // already released
  const current = rows.find((r) => r.id === c.reportId && r.status === "published");
  if (!current) {
    await ports.escalate("report.correction_incomplete", `${c.id}: no published view ${c.reportId} for ${c.period}`);
    return;
  }
  const target = current.figures.find((f) => f.measure === c.measure);
  const def = defs.find((d) => d.measure === c.measure);
  if (!target || !def) {
    await ports.escalate("report.correction_unknown_measure", `${c.id}: ${c.measure} is not on ${c.reportId}`);
    return;
  }
  const gate = await ports.approveCorrection({ reportId: current.id, person: c.person, reason: c.reason });
  if (!gate || gate.approved !== true) return; // the person has not released it

  const figures = [];
  for (const f of current.figures) {
    const value = f.measure === c.measure ? c.value : f.value;
    if (value === null || !f.definitionId || !f.source || !f.asOf) {
      figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
      continue;
    }
    // Same definition and source; the as-of time is the read the figure came
    // from. The person and reason on the version say what changed.
    const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
    figures.push({ measure: f.measure, value, unavailableReason: null, cited });
  }
  const next = await ports.publishReport({
    period: c.period,
    audienceId: c.audienceId,
    figures,
    narrative: (current.narrative ?? NARRATIVE) + CORRECTION_NOTE,
    supersedes: current.id,
    by: c.person,
    reason: c.reason,
  });
  await readBack(ports, c.period, next?.id);
}

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const schedule = await ports.readSchedule();
  const due = schedule.filter((e) => isDue(e, now));

  let defs = null;
  let audiences = null;
  let thresholds = null;
  for (const entry of due) {
    const existing = await ports.readReports(entry.period);
    defs ??= await ports.readDefinitions();
    audiences ??= await ports.readAudiences();
    if (audiences.every((a) => existing.some((r) => r.audienceId === a.id))) continue;
    thresholds ??= await ports.readThresholds();
    await publishPeriod(ports, entry, schedule, defs, audiences, thresholds, existing);
  }

  const corrections = await ports.readCorrections();
  if (corrections.length > 0) {
    defs ??= await ports.readDefinitions();
    for (const c of corrections) await applyCorrection(ports, c, defs);
  }
}

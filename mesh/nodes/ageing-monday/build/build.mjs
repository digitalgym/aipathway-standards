/**
 * Ageing Monday: the weekly accounts receivable ageing report.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every Monday morning (AEST) the schedule wakes this build. For each week
 * whose scheduled time has arrived and that has no report yet, it:
 *
 *   1. reads the definitions register (one definition per measure, each with
 *      an owner: total owed, current, 1-30, 31-60, 61-90 and 90+ days overdue
 *      from the ledger, and completed jobs not yet invoiced from the job
 *      system);
 *   2. reads each source once per measure and week, and cites the definition,
 *      the source and the as-of time the read itself returned;
 *   3. publishes one view per audience (the owner sees every bucket, the
 *      lender sees only what is declared for the lender), with a plain
 *      narrative that carries no number the figure list does not;
 *   4. publishes a figure it could not read as unavailable with the reason,
 *      tells the definition's owner and raises it, never last week's value;
 *   5. compares each thresholded measure with the prior week's published
 *      figure and tells the named person when it moves past the threshold,
 *      escalating instead when either side is unavailable.
 *
 * Corrections are never edits. A named person asks, the gate records their
 * name and reason, and a new version supersedes the old in every view that
 * carries the measure. The old versions stay readable.
 *
 * Everything goes through the ports. Nothing here sends a report outside the
 * business or sets a threshold: both stay with a person.
 */

/** Measure labels for the narrative. No digits: a digit in prose must be a figure value. */
const LABEL = {
  ar_total_owed: "Total owed",
  ar_current: "Not yet due",
  ar_overdue_1_30: "Overdue up to a month",
  ar_overdue_31_60: "Overdue one to two months",
  ar_overdue_61_90: "Overdue two to three months",
  ar_overdue_90_plus: "Overdue more than three months",
  unbilled_completed_jobs: "Completed jobs not yet invoiced",
};
const label = (measure) => LABEL[measure] ?? measure.replace(/[_\d]+/g, " ").trim();

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 */
export async function build(ports) {
  const now = (await ports.now()).getTime();
  const definitions = await ports.readDefinitions();
  const schedule = [...(await ports.readSchedule())].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const thresholds = await ports.readThresholds();
  const audiences = await ports.readAudiences();

  for (let i = 0; i < schedule.length; i++) {
    const entry = schedule[i];
    // The schedule is the only trigger: never before the scheduled time.
    if (Date.parse(entry.scheduledAt) > now) continue;
    const existing = await ports.readReports(entry.period);
    const missing = audiences.filter((a) => !existing.some((r) => r.audienceId === a.id));
    if (missing.length === 0) continue; // already published; safe to repeat
    const prior = i > 0 ? schedule[i - 1].period : null;
    await publishPeriod(ports, { period: entry.period, prior, definitions, thresholds, audiences: missing });
  }

  await applyCorrections(ports, definitions);
}

/** Compute every measure once for the period, then publish one view per audience. */
async function publishPeriod(ports, { period, prior, definitions, thresholds, audiences }) {
  const measures = [...new Set(audiences.flatMap((a) => a.measures))];
  /** measure -> { measure, value, unavailableReason, cited, owner } */
  const figures = new Map();

  for (const measure of measures) {
    const defs = definitions.filter((d) => d.measure === measure);
    if (defs.length === 0) {
      figures.set(measure, { measure, value: null, unavailableReason: "no_definition" });
      await ports.escalate("report.no_definition", `${measure} for ${period}: the register holds no definition`);
      continue;
    }
    if (defs.length > 1) {
      figures.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
      for (const owner of new Set(defs.map((d) => d.owner))) {
        await ports.notify(owner, { measure, period, detail: "the register holds more than one definition for this measure" });
      }
      await ports.escalate("report.conflicting_definitions", `${measure} for ${period}: ${defs.map((d) => d.id).join(", ")}`);
      continue;
    }
    const def = defs[0];
    const read = await ports.readSource(def.source, def.queryRef, period);
    if (!read.ok) {
      figures.set(measure, { measure, value: null, unavailableReason: `source_unreadable: ${read.reason}`, owner: def.owner });
      await ports.notify(def.owner, { measure, period, detail: `${def.source} could not be read: ${read.reason}` });
      await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} ${read.reason}; owner ${def.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
    figures.set(measure, { measure, value: read.value, unavailableReason: null, cited, owner: def.owner });
  }

  const published = [];
  for (const audience of audiences) {
    const own = audience.measures.map((m) => figures.get(m));
    const report = await ports.publishReport({
      period,
      audienceId: audience.id,
      figures: own.map((f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) })),
      narrative: narrate(period, own),
    });
    published.push({ audience: audience.id, id: report?.id ?? null });
  }
  await readBack(ports, period, published);

  await checkThresholds(ports, { period, prior, thresholds, figures });
}

/** A write counts only when its report_id reads back from the period's record. */
async function readBack(ports, period, published) {
  const back = new Set((await ports.readReports(period)).map((r) => r.id));
  for (const p of published) {
    if (!p.id || !back.has(p.id)) {
      await ports.escalate("report.publish_failed", `${period} view for ${p.audience}: no report_id read back`);
    }
  }
}

/** A threshold crossing tells its person in this run. A comparison with an unavailable side is escalated. */
async function checkThresholds(ports, { period, prior, thresholds, figures }) {
  if (!prior) return; // nothing to compare in the first period
  const priorReports = (await ports.readReports(prior)).filter((r) => r.status === "published");
  for (const t of thresholds) {
    const now = figures.get(t.measure);
    if (!now) continue;
    const before = priorReports.flatMap((r) => r.figures).find((f) => f.measure === t.measure);
    if (!before || before.value === null || now.value === null) {
      await ports.escalate("report.threshold_not_comparable", `${t.measure} for ${period} against ${prior}: a side is unavailable; ${t.notify} to decide`);
      continue;
    }
    const moved = now.value - before.value;
    const crossed = t.direction === "up" ? moved > t.amount : -moved > t.amount;
    if (crossed) {
      await ports.notify(t.notify, { measure: t.measure, period, detail: `moved ${t.direction} past the threshold against ${prior}` });
    }
  }
}

/** Apply each correction once: a gate with the person and reason, then a new version of every view carrying the measure. */
async function applyCorrections(ports, definitions) {
  const corrections = await ports.readCorrections();
  for (const c of corrections) {
    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue; // already applied, or nothing to correct
    if (!c.person || !c.reason) {
      await ports.escalate("report.correction_incomplete", `${c.id}: a correction needs a named person and a reason`);
      continue;
    }
    if (!target.figures.some((f) => f.measure === c.measure)) {
      await ports.escalate("report.correction_unknown_measure", `${c.id}: ${c.measure} is not on ${c.reportId}`);
      continue;
    }
    const gate = await ports.approveCorrection({ reportId: c.reportId, person: c.person, reason: c.reason });
    if (!gate?.approved) {
      await ports.escalate("report.correction_incomplete", `${c.id}: not approved; stays open with ${c.person}`);
      continue;
    }
    const views = reports.filter((r) => r.status === "published" && r.figures.some((f) => f.measure === c.measure));
    const at = (await ports.now()).toISOString();
    const published = [];
    for (const view of views) {
      const out = [];
      for (const f of view.figures) {
        if (f.measure === c.measure) {
          const def = definitions.find((d) => d.id === f.definitionId) ?? definitions.find((d) => d.measure === c.measure);
          const cited = await ports.cite({
            measure: f.measure,
            definitionId: def?.id ?? f.definitionId ?? "",
            source: `correction ${c.id} by ${c.person}`,
            asOf: at,
          });
          out.push({ measure: f.measure, value: c.value, unavailableReason: null, cited });
        } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
          const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
          out.push({ measure: f.measure, value: f.value, unavailableReason: null, cited });
        } else {
          out.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
        }
      }
      const report = await ports.publishReport({
        period: c.period,
        audienceId: view.audienceId,
        figures: out,
        narrative: narrate(c.period, out),
        supersedes: view.id,
        by: c.person,
        reason: c.reason,
      });
      published.push({ audience: view.audienceId, id: report?.id ?? null });
    }
    await readBack(ports, c.period, published);
  }
}

/** Prose that only names figures and states their own values. No comparisons, no counts, no percentages. */
function narrate(period, figures) {
  const parts = [`Accounts receivable ageing for ${period}, in Australian dollars.`];
  for (const f of figures) {
    if (f.value !== null) parts.push(`${label(f.measure)}: ${f.value}.`);
  }
  const gone = figures.filter((f) => f.value === null).map((f) => `${label(f.measure)} (${f.unavailableReason})`);
  if (gone.length) parts.push(`Not available this week: ${gone.join("; ")}.`);
  return parts.join(" ");
}

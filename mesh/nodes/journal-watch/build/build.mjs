/**
 * Journal Watch: the Monday list of manual journals posted in a client's ledger.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every Monday at 7:00 am AEST the schedule wakes this build for the week just
 * ended. For each week whose scheduled time has arrived and that has no report
 * yet, it:
 *
 *   1. reads the definitions register: one definition per measure, each with
 *      an owner. From the client's ledger (Xero, MYOB or QuickBooks), over the
 *      AI Pathway hosted MCP, read only: manual journals posted in the week,
 *      their total value, and the four flags a reviewer asks about: a journal
 *      with a line on a bank account, a line on a GST account, a date inside a
 *      period already signed off or behind the lock date, or no narration;
 *   2. reads each source once per measure and week, and cites the definition,
 *      the source and the as-of time the read itself returned;
 *   3. publishes one view per audience (the practice's bookkeeper sees every
 *      measure, the client's reviewer sees what is declared for them), saying
 *      Nothing flagged only when every flag reads zero, Flagged for review
 *      with the flags otherwise, and never Nothing flagged when a flag could
 *      not be read;
 *   4. publishes a measure it could not read as unavailable with the reason,
 *      tells the definition's owner and raises it, never last week's value;
 *   5. compares each thresholded measure with the prior week's published
 *      figure and tells the named person when it moves past the threshold,
 *      escalating instead when either side is unavailable.
 *
 * Corrections are never edits. A named person asks, the gate records their
 * name and reason, and a new version supersedes the old in every view that
 * carries the measure. The old versions stay readable.
 *
 * Everything goes through the ports. Nothing here reverses, edits, posts or
 * approves a journal, changes a lock date, sends the list outside the practice
 * or sets a threshold: those stay with a person. It gives no tax advice; a
 * flag is a question for the reviewer or the accountant.
 */

/** Measure labels for the narrative. No digits: a digit in prose must be a figure value. */
const LABEL = {
  manual_journals_posted: "Manual journals posted",
  manual_journal_value: "Total debits on manual journals (AUD)",
  journals_touching_bank: "Journals with a line on a bank account",
  journals_touching_gst: "Journals with a line on a GST account",
  journals_in_locked_period: "Journals dated in a signed-off or locked period",
  journals_without_narration: "Journals with no narration",
};
const label = (measure) => LABEL[measure] ?? measure.replace(/[_\d]+/g, " ").trim();

/** The measures that flag a journal for the reviewer. The count and value are context, not flags. */
const FLAGS = new Set(["journals_touching_bank", "journals_touching_gst", "journals_in_locked_period", "journals_without_narration"]);

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
    await publishWeek(ports, { period: entry.period, prior, definitions, thresholds, audiences: missing, allAudiences: audiences });
  }

  await applyCorrections(ports, definitions);
}

/** Read every measure once for the week, then publish one view per audience. */
async function publishWeek(ports, { period, prior, definitions, thresholds, audiences, allAudiences }) {
  // Every measure any audience carries is read, so the verdict is the same on every view.
  const measures = [...new Set(allAudiences.flatMap((a) => a.measures))];
  /** measure -> { measure, value, unavailableReason, cited } */
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
      figures.set(measure, { measure, value: null, unavailableReason: `source_unreadable: ${read.reason}` });
      await ports.notify(def.owner, { measure, period, detail: `${def.source} could not be read: ${read.reason}` });
      await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} ${read.reason}; owner ${def.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
    figures.set(measure, { measure, value: read.value, unavailableReason: null, cited });
  }

  const verdict = verdictOf([...figures.values()]);
  const published = [];
  for (const audience of audiences) {
    const own = audience.measures.map((m) => figures.get(m));
    const report = await ports.publishReport({
      period,
      audienceId: audience.id,
      figures: own.map((f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) })),
      narrative: narrate(period, own, verdict),
    });
    published.push({ audience: audience.id, id: report?.id ?? null });
  }
  await readBack(ports, period, published);

  await checkThresholds(ports, { period, prior, thresholds, figures });
}

/** Clear only when every flag was read and reads zero. An unreadable measure is never clear. */
function verdictOf(figures) {
  if (figures.length === 0) return "cannot_say";
  if (figures.some((f) => f.value === null)) return "cannot_say";
  const flags = figures.filter((f) => FLAGS.has(f.measure));
  return flags.some((f) => f.value !== 0) ? "flagged" : "clear";
}

/** A write counts only when its report_id reads back from the week's record. */
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
  if (!prior) return; // nothing to compare in the first week
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
    const current = reports.filter((r) => r.status === "published");
    const views = current.filter((r) => r.figures.some((f) => f.measure === c.measure));
    const at = (await ports.now()).toISOString();

    // The corrected figure set for the week, across every current view, so the verdict stays one verdict.
    const byMeasure = new Map();
    for (const view of current) {
      for (const f of view.figures) if (!byMeasure.has(f.measure)) byMeasure.set(f.measure, f);
    }
    byMeasure.set(c.measure, { measure: c.measure, value: c.value, unavailableReason: null });
    const verdict = verdictOf([...byMeasure.values()]);

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
        narrative: narrate(c.period, out, verdict),
        supersedes: view.id,
        by: c.person,
        reason: c.reason,
      });
      published.push({ audience: view.audienceId, id: report?.id ?? null });
    }
    await readBack(ports, c.period, published);
  }
}

/** Prose that names the verdict and the measures, stating only the measures' own values. No comparisons, counts of its own or percentages. */
function narrate(period, figures, verdict) {
  const head = {
    clear: `Manual journals for ${period}: Nothing flagged. No journal touched a bank or GST account, sat in a locked period or lacked a narration.`,
    flagged: `Manual journals for ${period}: Flagged for review. The flags are listed below for the client's reviewer to look at in the ledger.`,
    cannot_say: `Manual journals for ${period}: Not cleared. At least one measure could not be read, so this week cannot be called clear.`,
  }[verdict];
  const parts = [head];
  const raised = figures.filter((f) => FLAGS.has(f.measure) && f.value !== null && f.value !== 0).map((f) => `${label(f.measure)}: ${f.value}`);
  if (raised.length) parts.push(`Flagged: ${raised.join("; ")}.`);
  const context = figures.filter((f) => !FLAGS.has(f.measure) && f.value !== null).map((f) => `${label(f.measure)}: ${f.value}`);
  if (context.length) parts.push(`For the week: ${context.join("; ")}.`);
  const clear = figures.filter((f) => FLAGS.has(f.measure) && f.value === 0).map((f) => label(f.measure));
  if (clear.length) parts.push(`Clear: ${clear.join("; ")}.`);
  const gone = figures.filter((f) => f.value === null).map((f) => `${label(f.measure)} (${f.unavailableReason})`);
  if (gone.length) parts.push(`Not available this week: ${gone.join("; ")}.`);
  parts.push("Nothing in the ledger was changed; any reversal or edit is the reviewer's call.");
  return parts.join(" ");
}

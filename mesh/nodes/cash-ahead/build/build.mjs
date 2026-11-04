/**
 * Cash Ahead: the weekly 13-week cash forecast.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every Monday morning (AEST) the schedule wakes this build. For each forecast
 * week whose scheduled time has arrived and that has no forecast yet, it:
 *
 *   1. reads the definitions register. Each forecast line is one definition
 *      with an owner, and each definition names its assumption in plain words:
 *      when an open invoice is assumed to be paid, when an open bill is
 *      assumed to be paid, what each pay run is assumed to cost;
 *   2. reads each source once per line and week (the ledger for the opening
 *      bank balance, receipts and bill payments; the payroll system for wages,
 *      PAYG withholding and super), citing the definition, the source and the
 *      as-of time the read itself returned;
 *   3. publishes one view per audience (the owner sees every line, the lender
 *      sees only the lines declared for the lender), with a plain narrative
 *      that names each assumption and carries no number the figure list does
 *      not, so it never adds the lines into a closing balance of its own;
 *   4. publishes a line it could not read as unavailable with the reason,
 *      tells the definition's owner and raises it, never last week's value;
 *   5. compares each thresholded line with the prior forecast's published
 *      figure and tells the named person when it moves past the threshold,
 *      escalating instead when either side is unavailable.
 *
 * Corrections are never edits. A named person asks, the gate records their
 * name and reason, and a new version supersedes the old in every view that
 * carries the line. The old versions stay readable.
 *
 * Everything goes through the ports. Nothing here pays a bill, runs payroll,
 * sends the forecast outside the business or sets a threshold or an
 * assumption: all of those stay with a person.
 */

/** Week numbers as words. A digit in prose must be a figure value. */
const WEEK = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen"];

const STREAM = {
  receipts: "Customer receipts",
  bills: "Bill payments",
  payroll: "Payroll out",
};

/** What each stream assumes, in words with no digits, for the narrative. */
const ASSUMES = {
  receipts: "each open sales invoice is paid on its due date plus that customer's usual days late, and nothing is assumed from an invoice more than three months overdue",
  bills: "each open approved bill is paid on its due date, and bills on hold are left out",
  payroll: "each pay run on the pay calendar costs what the last finalised run cost, with withholding and super on their own due dates",
};

/** forecast_receipts_wk03 -> { stream: "receipts", week: 3 } */
const parse = (measure) => {
  const m = /^forecast_(receipts|bills|payroll)_wk(\d{2})$/.exec(measure);
  return m ? { stream: m[1], week: Number(m[2]) } : null;
};

const label = (measure) => {
  if (measure === "opening_bank_balance") return "Opening bank balance";
  const p = parse(measure);
  if (p && WEEK[p.week]) return `${STREAM[p.stream]}, week ${WEEK[p.week]}`;
  return measure.replace(/[_\d]+/g, " ").trim();
};

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

/** Compute every line once for the forecast week, then publish one view per audience. */
async function publishPeriod(ports, { period, prior, definitions, thresholds, audiences }) {
  const measures = [...new Set(audiences.flatMap((a) => a.measures))];
  /** measure -> { measure, value, unavailableReason, cited, owner } */
  const figures = new Map();

  for (const measure of measures) {
    const defs = definitions.filter((d) => d.measure === measure);
    if (defs.length === 0) {
      figures.set(measure, { measure, value: null, unavailableReason: "no_definition" });
      await ports.escalate("report.no_definition", `${measure} for ${period}: the register holds no definition, so no assumption is named`);
      continue;
    }
    if (defs.length > 1) {
      figures.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
      for (const owner of new Set(defs.map((d) => d.owner))) {
        await ports.notify(owner, { measure, period, detail: "the register holds more than one definition for this line" });
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
      narrative: narrate(own),
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
  if (!prior) return; // nothing to compare in the first forecast
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

/** Apply each correction once: a gate with the person and reason, then a new version of every view carrying the line. */
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
        narrative: narrate(out),
        supersedes: view.id,
        by: c.person,
        reason: c.reason,
      });
      published.push({ audience: view.audienceId, id: report?.id ?? null });
    }
    await readBack(ports, c.period, published);
  }
}

/**
 * Prose that names each assumption once and states each line's own value.
 * No totals, no closing balance, no comparisons: a sum is a number the figure
 * list does not carry, so it would need a definition of its own first.
 */
function narrate(figures) {
  const parts = ["Thirteen week cash forecast, in Australian dollars including GST."];
  const streams = new Set(figures.map((f) => parse(f.measure)?.stream).filter(Boolean));
  for (const s of ["receipts", "bills", "payroll"]) {
    if (streams.has(s)) parts.push(`${STREAM[s]} assume ${ASSUMES[s]}.`);
  }
  for (const f of figures) {
    if (f.value !== null) parts.push(`${label(f.measure)}: ${f.value}.`);
  }
  const gone = figures.filter((f) => f.value === null).map((f) => `${label(f.measure)} (${f.unavailableReason})`);
  if (gone.length) parts.push(`Not available this week: ${gone.join("; ")}.`);
  return parts.join(" ");
}

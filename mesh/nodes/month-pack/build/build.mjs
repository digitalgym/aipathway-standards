/**
 * Month Pack: each client's monthly management report pack.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * A practice keeps books for many clients. On the first business morning of
 * each month the schedule lists the clients whose pack is due and runs this
 * build once per client, against that client's own register, sources and
 * publish folder (the ports it is handed). For each month whose scheduled time
 * has arrived and that has no pack yet, it:
 *
 *   1. reads the client's definitions register: one definition per measure,
 *      each with an owner. Profit and loss (revenue, cost of sales, gross
 *      profit, operating expenses, net profit), balance sheet (total assets,
 *      total liabilities, net assets), cash at bank from the bank statement,
 *      and the key ratios (gross margin, current ratio, debtor days);
 *   2. reads each measure's source once for the month and cites the
 *      definition, the source and the as-of time that the read returned;
 *   3. publishes one view per audience into the practice's own folder for
 *      that client: the reviewing partner and the client's owner see the
 *      full pack, the lender view carries only the measures declared for it;
 *   4. publishes a figure it could not read as unavailable with the reason,
 *      tells the definition's owner and raises an exception, never last
 *      month's value;
 *   5. compares each thresholded measure with last month's published figure
 *      and tells the named person in the same run, escalating instead when
 *      either side is unavailable.
 *
 * Publishing here means writing the pack into the practice's folder. Whether
 * it goes to the client or the lender is the partner's call, made by a
 * person. Corrections are never edits: a named person asks, the gate records
 * their name and reason, and a new version supersedes the old in every view
 * carrying that measure. Nothing here writes to the ledger.
 */

/** Plain labels for the commentary. No digits: a digit in prose must be a figure value. */
const LABEL = {
  pl_revenue: "Revenue",
  pl_cost_of_sales: "Cost of sales",
  pl_gross_profit: "Gross profit",
  pl_operating_expenses: "Operating expenses",
  pl_net_profit: "Net profit",
  bs_total_assets: "Total assets",
  bs_total_liabilities: "Total liabilities",
  bs_net_assets: "Net assets",
  cash_at_bank: "Cash at bank",
  ratio_gross_margin_pct: "Gross margin (per cent)",
  ratio_current: "Current ratio",
  ratio_debtor_days: "Debtor days",
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
    const month = schedule[i];
    if (Date.parse(month.scheduledAt) > now) continue; // the schedule is the only trigger
    const already = await ports.readReports(month.period);
    const due = audiences.filter((a) => !already.some((r) => r.audienceId === a.id));
    if (due.length === 0) continue; // this month's pack is out; a repeat run does nothing
    const priorMonth = i > 0 ? schedule[i - 1].period : null;
    await publishMonth(ports, { period: month.period, priorMonth, definitions, thresholds, audiences: due });
  }

  await correct(ports, definitions);
}

/** Read every measure once for the month, then write one view per audience. */
async function publishMonth(ports, { period, priorMonth, definitions, thresholds, audiences }) {
  const wanted = [...new Set(audiences.flatMap((a) => a.measures))];
  const pack = new Map();

  for (const measure of wanted) {
    const defs = definitions.filter((d) => d.measure === measure);
    if (defs.length === 0) {
      pack.set(measure, { measure, value: null, unavailableReason: "no_definition" });
      await ports.escalate("report.no_definition", `${measure} for ${period}: not in the client's register`);
      continue;
    }
    if (defs.length > 1) {
      pack.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
      for (const owner of new Set(defs.map((d) => d.owner))) {
        await ports.notify(owner, { measure, period, detail: "the register defines this measure more than once; pick one" });
      }
      await ports.escalate("report.conflicting_definitions", `${measure} for ${period}: ${defs.map((d) => d.id).join(", ")}`);
      continue;
    }
    const def = defs[0];
    const read = await ports.readSource(def.source, def.queryRef, period);
    if (!read.ok) {
      pack.set(measure, { measure, value: null, unavailableReason: `source_unreadable: ${read.reason}` });
      await ports.notify(def.owner, { measure, period, detail: `${def.source} could not be read: ${read.reason}` });
      await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} ${read.reason}; owner ${def.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
    pack.set(measure, { measure, value: read.value, unavailableReason: null, cited });
  }

  const written = [];
  for (const audience of audiences) {
    const figures = audience.measures.map((m) => pack.get(m));
    const report = await ports.publishReport({
      period,
      audienceId: audience.id,
      figures: figures.map((f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) })),
      narrative: commentary(period, figures),
    });
    written.push({ audience: audience.id, id: report?.id ?? null });
  }
  await confirm(ports, period, written);

  await thresholdsFor(ports, { period, priorMonth, thresholds, pack });
}

/** A pack counts as written only when its report_id reads back for the month. */
async function confirm(ports, period, written) {
  const ids = new Set((await ports.readReports(period)).map((r) => r.id));
  for (const w of written) {
    if (!w.id || !ids.has(w.id)) {
      await ports.escalate("report.publish_failed", `${period} pack for ${w.audience}: no report_id read back`);
    }
  }
}

/** Month on month against last month's published figure. An unavailable side goes to the person, never assumed. */
async function thresholdsFor(ports, { period, priorMonth, thresholds, pack }) {
  if (!priorMonth) return;
  const last = (await ports.readReports(priorMonth)).filter((r) => r.status === "published");
  for (const t of thresholds) {
    const current = pack.get(t.measure);
    if (!current) continue;
    const before = last.flatMap((r) => r.figures).find((f) => f.measure === t.measure);
    if (!before || before.value === null || current.value === null) {
      await ports.escalate("report.threshold_not_comparable", `${t.measure} for ${period} against ${priorMonth}: one side is unavailable; ${t.notify} to decide`);
      continue;
    }
    const change = current.value - before.value;
    const past = t.direction === "up" ? change > t.amount : -change > t.amount;
    if (past) {
      await ports.notify(t.notify, { measure: t.measure, period, detail: `moved ${t.direction} past its threshold against ${priorMonth}` });
    }
  }
}

/** Each correction once: the gate with the person and reason, then a new version of every view carrying the measure. */
async function correct(ports, definitions) {
  for (const c of await ports.readCorrections()) {
    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue;
    if (!c.person || !c.reason) {
      await ports.escalate("report.correction_incomplete", `${c.id}: needs a named person and a reason`);
      continue;
    }
    if (!target.figures.some((f) => f.measure === c.measure)) {
      await ports.escalate("report.correction_unknown_measure", `${c.id}: ${c.measure} is not in ${c.reportId}`);
      continue;
    }
    const gate = await ports.approveCorrection({ reportId: c.reportId, person: c.person, reason: c.reason });
    if (!gate?.approved) {
      await ports.escalate("report.correction_incomplete", `${c.id}: not approved; stays with ${c.person}`);
      continue;
    }
    const views = reports.filter((r) => r.status === "published" && r.figures.some((f) => f.measure === c.measure));
    const at = (await ports.now()).toISOString();
    const written = [];
    for (const view of views) {
      const figures = [];
      for (const f of view.figures) {
        if (f.measure === c.measure) {
          const def = definitions.find((d) => d.id === f.definitionId) ?? definitions.find((d) => d.measure === c.measure);
          const cited = await ports.cite({ measure: f.measure, definitionId: def?.id ?? f.definitionId ?? "", source: `correction ${c.id} by ${c.person}`, asOf: at });
          figures.push({ measure: f.measure, value: c.value, unavailableReason: null, cited });
        } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
          const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
          figures.push({ measure: f.measure, value: f.value, unavailableReason: null, cited });
        } else {
          figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
        }
      }
      const report = await ports.publishReport({
        period: c.period,
        audienceId: view.audienceId,
        figures,
        narrative: commentary(c.period, figures),
        supersedes: view.id,
        by: c.person,
        reason: c.reason,
      });
      written.push({ audience: view.audienceId, id: report?.id ?? null });
    }
    await confirm(ports, c.period, written);
  }
}

/**
 * Commentary that names figures and states only their own values. A negative
 * value is described in words, because its digits without the sign would be
 * a number the figure list does not carry.
 */
function commentary(period, figures) {
  const lines = [`Management report pack for ${period}, in Australian dollars unless the measure says otherwise.`];
  for (const f of figures) {
    if (f.value === null) continue;
    lines.push(f.value < 0 ? `${label(f.measure)}: below zero this month, as shown in the figures.` : `${label(f.measure)}: ${f.value}.`);
  }
  const missing = figures.filter((f) => f.value === null).map((f) => `${label(f.measure)} (${f.unavailableReason})`);
  if (missing.length) lines.push(`Not available this month: ${missing.join("; ")}.`);
  return lines.join(" ");
}

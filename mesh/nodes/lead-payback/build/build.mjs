/**
 * Lead Payback: the monthly report of which lead source or ad campaign our
 * jobs came from, and what we invoiced on those jobs.
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Original build. Every figure is per lead source, and every measure is one
 * row in the definitions register a person writes, named "<lead source> | <line>":
 *
 *   jobs won         jobs created in the month whose lead source field on the
 *                    job record is that source, with an accepted quote (job
 *                    system: Simpro, ServiceM8 and the like)
 *   invoiced value   invoices raised in the month on those jobs, less credit
 *                    notes, AUD ex GST (ledger: Xero or MYOB), each invoice
 *                    tied to its job by the job_id on the invoice reference
 *
 * "No lead source recorded" is a source like any other, so jobs nobody tagged
 * are counted and shown, never quietly spread across the campaigns.
 *
 * One run, every time the schedule wakes it (schedule.tick) or an exception on
 * a report record is closed (exception.closed):
 *
 *   1. Read the schedule. A month is due once its time has arrived and no
 *      scheduled report for it is on the record. Never early; a month where
 *      nothing moved still goes out.
 *   2. Read the register, audiences and thresholds.
 *   3. Read each needed measure once from its one definition, citing the as-of
 *      time the read returned. No definition, two definitions or an unreadable
 *      source: unavailable with the reason, and the definition's owner told.
 *   4. Thresholds (a person sets them, e.g. a campaign's invoiced value falling
 *      by $5,000 month on month) are compared with last month's published
 *      figure. Past it: the named person is told. Either month unavailable:
 *      escalated.
 *   5. One view per audience, exactly its declared measures. The commentary
 *      names each source with only the values the figure list carries, and
 *      names the source with the most invoiced value. It never writes a cost
 *      per job, a return on ad spend, a percentage or a total.
 *   6. Corrections a named person asked for: a gate with the person and the
 *      reason, then a new version superseding the old. Never in place.
 *
 * It reads the job system and the ledger and writes only reports. It never
 * edits a job, a lead source, an invoice or a campaign. Whether to spend more
 * or less on a campaign stays with a person.
 */

const fmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2, useGrouping: false });
const asWritten = (v) => fmt.format(v);

const JOBS = "jobs won";
const VALUE = "invoiced value";

/** "Referral | jobs won" -> { source, line } */
function split(measure) {
  const i = measure.lastIndexOf(" | ");
  return i < 0 ? { source: measure, line: "" } : { source: measure.slice(0, i), line: measure.slice(i + 3) };
}

async function figureFor(ports, measure, register, period) {
  const defs = register.filter((d) => d.measure === measure);
  if (defs.length === 0) {
    await ports.escalate("report.no_definition", `${measure} for ${period}: not in the register, published as unavailable`);
    return { measure, value: null, unavailableReason: "no_definition" };
  }
  if (defs.length > 1) {
    await ports.escalate(
      "report.conflicting_definitions",
      `${measure} for ${period}: the register holds ${defs.length} definitions (${defs.map((d) => d.id).join(", ")}); unavailable until ${defs[0].owner} keeps one`,
    );
    return { measure, value: null, unavailableReason: "conflicting_definitions" };
  }
  const def = defs[0];
  const read = await ports.readSource(def.source, def.queryRef, period);
  if (!read.ok) {
    const reason = `source_unreadable: ${def.source} ${read.reason}`;
    await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} could not be read (${read.reason}). Owner: ${def.owner}`);
    await ports.notify(def.owner, { measure, period, detail: `${measure} is unavailable on the ${period} lead source report: ${reason}` });
    return { measure, value: null, unavailableReason: reason };
  }
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
  return { measure, value: read.value, unavailableReason: null, cited };
}

function priorValue(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return { found: true, value: f.value };
  }
  return { found: false, value: null };
}

/**
 * The commentary. Only the values on this view's figure list, each written as
 * the list carries it. "Most" compares figures that are all on the page; no
 * difference, ratio, cost per job or percentage is ever written.
 */
function commentary(period, figures) {
  const bySource = new Map();
  for (const f of figures) {
    const { source, line } = split(f.measure);
    if (!bySource.has(source)) bySource.set(source, new Map());
    bySource.get(source).set(line, f);
  }
  const lines = [];
  const notes = [];
  for (const [source, ls] of bySource) {
    const parts = [];
    for (const [line, label] of [[JOBS, "jobs won"], [VALUE, "invoiced value"]]) {
      const f = ls.get(line);
      if (!f) continue;
      if (f.value === null) notes.push(`${f.measure} is unavailable (${f.unavailableReason}) and its owner has been told.`);
      else parts.push(`${label} ${asWritten(f.value)}`);
    }
    if (parts.length) lines.push(`${source}: ${parts.join(", ")}.`);
  }
  const out = [`Where our jobs came from in ${period}, by the lead source on each job record, invoiced value from the ledger in AUD ex GST.`];
  out.push(lines.length ? lines.join(" ") : "No lead source figure on this view could be read.");
  const valued = figures.filter((f) => split(f.measure).line === VALUE && f.value !== null);
  const anyValueMissing = figures.some((f) => split(f.measure).line === VALUE && f.value === null);
  if (valued.length > 1 && !anyValueMissing) {
    const top = Math.max(...valued.map((f) => f.value));
    const leaders = valued.filter((f) => f.value === top).map((f) => split(f.measure).source);
    out.push(`The most invoiced value came from ${leaders.join(" and ")}.`);
  }
  return [...out, ...notes].join(" ");
}

const forPublish = (f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) });

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 * @param {{ openExceptionFor?: (period: string) => ({ owner: string } | null) }} [config]
 */
export async function build(ports, config = {}) {
  const now = (await ports.now()).getTime();
  const schedule = [...(await ports.readSchedule())].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const register = await ports.readDefinitions();
  const audiences = await ports.readAudiences();
  const thresholds = await ports.readThresholds();

  for (let i = 0; i < schedule.length; i += 1) {
    const entry = schedule[i];
    if (Date.parse(entry.scheduledAt) > now) continue;
    const onRecord = await ports.readReports(entry.period);
    if (onRecord.some((r) => r.publishedBy === "schedule")) continue;

    const prior = i > 0 ? schedule[i - 1] : null;
    const priorReports = prior ? await ports.readReports(prior.period) : [];

    const needed = [...new Set([...audiences.flatMap((a) => a.measures), ...(prior ? thresholds.map((t) => t.measure) : [])])];
    const figures = new Map();
    for (const m of needed) figures.set(m, await figureFor(ports, m, register, entry.period));

    if (prior) {
      for (const t of thresholds) {
        const cur = figures.get(t.measure);
        const p = priorValue(priorReports, t.measure);
        if (cur.value === null || !p.found || p.value === null) {
          await ports.escalate(
            "report.threshold_not_comparable",
            `${t.measure} for ${entry.period}: cannot compare with ${prior.period}, ${cur.value === null ? "this month's" : "last month's"} figure is unavailable. ${t.notify} to decide`,
          );
          continue;
        }
        const moved = cur.value - p.value;
        const past = t.direction === "up" ? moved >= t.amount : -moved >= t.amount;
        if (past) await ports.notify(t.notify, { measure: t.measure, period: entry.period, detail: `${t.measure} moved ${t.direction} past the threshold you set, against ${prior.period}` });
      }
    }

    for (const a of audiences) {
      const own = a.measures.map((m) => figures.get(m));
      const out = await ports.publishReport({ period: entry.period, audienceId: a.id, figures: own.map(forPublish), narrative: commentary(entry.period, own) });
      if (!out?.id) await ports.escalate("report.publish_failed", `${entry.period} view for ${a.name}: no report id read back`);
    }
  }

  for (const c of await ports.readCorrections()) {
    if (!c.person || !c.reason || !c.reportId) {
      await ports.escalate("report.correction_incomplete", `correction ${c.id}: needs a named person, a reason and the report it corrects`);
      continue;
    }
    if (config.openExceptionFor?.(c.period)) continue;
    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue;
    const def = register.find((d) => d.measure === c.measure);
    if (!def || !target.figures.some((f) => f.measure === c.measure)) {
      await ports.escalate("report.correction_unknown_measure", `correction ${c.id}: ${c.measure} is not on ${target.id} or has no definition`);
      continue;
    }
    // One measure, one figure: every current view carrying it gets its own new version.
    const views = [target, ...reports.filter((r) => r.id !== target.id && r.status === "published" && r.figures.some((f) => f.measure === c.measure))];
    for (const view of views) await newVersion(ports, c, view, def);
  }
}

async function newVersion(ports, c, view, def) {
  const gate = await ports.approveCorrection({ reportId: view.id, person: c.person, reason: c.reason });
  if (!gate?.approved) return;
  const at = (await ports.now()).toISOString();
  const figures = [];
  for (const f of view.figures) {
    if (f.measure === c.measure) {
      const cited = await ports.cite({ measure: f.measure, definitionId: def.id, source: `correction ${c.id} by ${c.person}`, asOf: at });
      figures.push({ measure: f.measure, value: c.value, unavailableReason: null, cited });
    } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
      const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
      figures.push({ measure: f.measure, value: f.value, unavailableReason: null, cited });
    } else {
      figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
    }
  }
  const out = await ports.publishReport({
    period: c.period,
    audienceId: view.audienceId,
    figures,
    narrative: `${commentary(c.period, figures)} This version corrects ${c.measure} and was published by ${c.person}.`,
    supersedes: view.id,
    by: c.person,
    reason: c.reason,
  });
  if (!out?.id) await ports.escalate("report.publish_failed", `correction ${c.id} on ${view.id}: no new version read back`);
}

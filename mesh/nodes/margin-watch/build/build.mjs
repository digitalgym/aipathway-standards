/**
 * Margin Watch: the weekly list of jobs whose actual labour and material costs
 * are eating the margin against the quote, with the lines that caused it.
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Original build. Every figure is per job, and every measure is one row in the
 * definitions register a person writes, named "<job name> | <line>":
 *
 *   quoted labour     the labour lines of the accepted quote (job system)
 *   actual labour     time booked to the job at our cost rate (job system)
 *   quoted materials  the material lines of the accepted quote (job system)
 *   actual materials  supplier bills coded to the job (ledger: Xero or MYOB)
 *   margin            the job's margin to date, quote less actual cost, as the
 *                     job system's job costing reports it
 *
 * All amounts AUD ex GST. The register names each job by its site name, not
 * its number, so the job number never appears in prose as a stray figure.
 *
 * One run, every time the schedule wakes it (schedule.tick) or an exception on
 * a report record is closed (exception.closed):
 *
 *   1. Read the schedule. A week is due once its time has arrived and no
 *      scheduled report for it is on the record. Never early; a week where
 *      nothing moved still goes out.
 *   2. Read the register, audiences and thresholds.
 *   3. Read each needed measure once from its one definition, citing the as-of
 *      time the read returned. No definition, two definitions or an unreadable
 *      source: unavailable with the reason, and the definition's owner told.
 *   4. Thresholds (a person sets them, e.g. a job's margin falling by $1,500
 *      week on week) are compared with last week's published figure. Past it:
 *      the named person is told. Either week unavailable: escalated.
 *   5. One view per audience, exactly its declared measures. The commentary
 *      lists each job where an actual line is above its quoted line, naming
 *      the line, with only the two values the figure list carries. It never
 *      writes the overrun, a percentage or a total.
 *   6. Corrections a named person asked for: a gate with the person and the
 *      reason, then a new version superseding the old. Never in place.
 *
 * It reads the job system and the ledger and writes only reports. It never
 * edits a job, a quote or a bill. What to do about a job stays with a person.
 */

const fmt = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2, useGrouping: false });
const asWritten = (v) => fmt.format(v);

const LINES = [
  ["actual labour", "quoted labour"],
  ["actual materials", "quoted materials"],
];

/** "Hartley bathroom | actual labour" -> { job, line } */
function split(measure) {
  const i = measure.lastIndexOf(" | ");
  return i < 0 ? { job: measure, line: "" } : { job: measure.slice(0, i), line: measure.slice(i + 3) };
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
    await ports.notify(def.owner, { measure, period, detail: `${measure} is unavailable on the ${period} job margin report: ${reason}` });
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
 * the list carries it. "Above" and "below" compare two figures that are both on
 * the page; no difference or percentage is ever written.
 */
function commentary(period, figures) {
  const byJob = new Map();
  for (const f of figures) {
    const { job, line } = split(f.measure);
    if (!byJob.has(job)) byJob.set(job, new Map());
    byJob.get(job).set(line, f);
  }
  const eating = [];
  const notes = [];
  for (const [job, lines] of byJob) {
    const causes = [];
    for (const [actual, quoted] of LINES) {
      const a = lines.get(actual);
      const q = lines.get(quoted);
      if (!a || !q) continue;
      if (a.value === null || q.value === null) {
        notes.push(`${job}: ${actual} against ${quoted} cannot be compared this week, because ${a.value === null ? actual : quoted} is unavailable (${(a.value === null ? a : q).unavailableReason}).`);
        continue;
      }
      if (a.value > q.value) causes.push(`${actual} is ${asWritten(a.value)}, above ${quoted} of ${asWritten(q.value)}`);
    }
    if (causes.length) {
      const m = lines.get("margin");
      const margin = m ? (m.value === null ? ` Margin to date is unavailable (${m.unavailableReason}).` : ` Margin to date is ${asWritten(m.value)}.`) : "";
      eating.push(`${job}: ${causes.join("; ")}.${margin}`);
    }
  }
  const out = [`Job margin against the quote for ${period}, from the job system and the ledger, AUD ex GST.`];
  out.push(eating.length ? `Jobs where actual cost is running above the quote: ${eating.join(" ")}` : "No job on this view has an actual line above its quoted line.");
  for (const f of figures) if (f.value === null && !notes.some((n) => n.includes(f.measure))) notes.push(`${f.measure} is unavailable (${f.unavailableReason}) and its owner has been told.`);
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
            `${t.measure} for ${entry.period}: cannot compare with ${prior.period}, ${cur.value === null ? "this week's" : "last week's"} figure is unavailable. ${t.notify} to decide`,
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

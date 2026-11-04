/**
 * Jobs Weekly: the Monday jobs report for an Australian trade or building
 * business, built to AIP-BS-RECURRING-REPORT 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * An original build. The idea was a job owners pay for; only the one-sentence
 * job was used: every Monday, publish the jobs report (jobs completed, jobs
 * still open by age, and staff time by task), each figure with its source and
 * as-of time.
 *
 * The measures (jobs completed in the week, open jobs in three age bands,
 * staff hours booked to each task) are NOT in this file. They live in the
 * definitions register a person writes, each with its source, query, period,
 * filters and owner. This file only runs the register.
 *
 * One run, every time the schedule wakes it (schedule.tick) or an exception on
 * a report record is closed (exception.closed):
 *
 *   1. Read the schedule. A week is due only once its Monday time has arrived
 *      and no scheduled report for it is on the record. Nothing goes early, and
 *      a due week goes out even when no job moved.
 *   2. Read the register, the audiences and the thresholds.
 *   3. Compute each measure any audience carries exactly once, from its one
 *      definition, citing the as-of time the read itself returned. No
 *      definition, two definitions, or a job system or timesheet that cannot
 *      be read: published as unavailable with the reason, never last week's
 *      count, and the definition's owner is told.
 *   4. Compare each thresholded measure with the prior week's published
 *      figure. Past it: notify the named person. Either figure unavailable:
 *      escalate, never assume.
 *   5. Publish one view per audience carrying exactly its declared measures,
 *      the same computed figure in each. The commentary states only values the
 *      figure list carries, and names measures in words, never digits.
 *   6. Corrections a named person asked for: a gate with the person and the
 *      reason, then a new version superseding the old. Never in place. An open
 *      exception on that week's report record halts this step.
 *
 * It reads; it never changes a job, a timesheet or a figure in the job system.
 * Whether a view goes outside the business stays with a person.
 *
 * Nothing is remembered between runs. What has been published is read back
 * from the record by period.
 */

const NUM = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2, useGrouping: false });

/** How a value is written in prose: exactly as the figure list carries it. */
const asWritten = (v) => NUM.format(v);

/** Plain words for a measure id, with no digits in them. */
const label = (def, measure) => def?.label ?? measure.replace(/_/g, " ");

async function figureFor(ports, measure, register, period) {
  const defs = register.filter((d) => d.measure === measure);
  if (defs.length === 0) {
    await ports.escalate("report.no_definition", `${measure} for ${period}: the register does not define it, so it is published as unavailable`);
    return { measure, value: null, unavailableReason: "no_definition", def: null };
  }
  if (defs.length > 1) {
    await ports.escalate(
      "report.conflicting_definitions",
      `${measure} for ${period}: the register holds ${defs.length} definitions (${defs.map((d) => d.id).join(", ")}). Unavailable until ${defs[0].owner} keeps one`,
    );
    return { measure, value: null, unavailableReason: "conflicting_definitions", def: null };
  }
  const def = defs[0];
  const read = await ports.readSource(def.source, def.queryRef, period);
  if (!read.ok) {
    const reason = `source_unreadable: ${def.source} ${read.reason}`;
    await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} could not be read (${read.reason}). Published as unavailable. Owner: ${def.owner}`);
    await ports.notify(def.owner, { measure, period, detail: `${measure} is unavailable on the ${period} jobs report: ${reason}` });
    return { measure, value: null, unavailableReason: reason, def };
  }
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
  return { measure, value: read.value, unavailableReason: null, cited, def };
}

function publishedValue(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return { found: true, value: f.value };
  }
  return { found: false, value: null };
}

function direction(cur, prior) {
  if (cur === null || prior === null || prior === undefined) return "";
  if (cur > prior) return ", more than the prior week";
  if (cur < prior) return ", fewer than the prior week";
  return ", the same as the prior week";
}

/** Commentary that describes. One value per sentence, the figure's own. No sums, no percentages. */
function commentary(period, figures, prior) {
  const out = [`Jobs report for ${period}, from the job system and the timesheets.`];
  for (const f of figures) {
    const name = label(f.def, f.measure);
    if (f.value === null) out.push(`${name} is unavailable this week (${f.unavailableReason}) and its owner has been told.`);
    else out.push(`${name} is ${asWritten(f.value)}${direction(f.value, prior.get(f.measure))}.`);
  }
  return out.join(" ");
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
    if (Date.parse(entry.scheduledAt) > now) continue; // never early
    const onRecord = await ports.readReports(entry.period);
    if (onRecord.some((r) => r.publishedBy === "schedule")) continue; // already out: safe to wake twice

    const prior = i > 0 ? schedule[i - 1] : null;
    const priorReports = prior ? await ports.readReports(prior.period) : [];

    const needed = [...new Set([...audiences.flatMap((a) => a.measures), ...(prior ? thresholds.map((t) => t.measure) : [])])];
    const figures = new Map();
    for (const m of needed) figures.set(m, await figureFor(ports, m, register, entry.period));

    const priorValues = new Map();
    for (const m of needed) {
      const p = publishedValue(priorReports, m);
      if (p.found) priorValues.set(m, p.value);
    }

    if (prior) {
      for (const t of thresholds) {
        const cur = figures.get(t.measure);
        const before = priorValues.has(t.measure) ? priorValues.get(t.measure) : null;
        if (cur.value === null || before === null) {
          await ports.escalate(
            "report.threshold_not_comparable",
            `${t.measure} for ${entry.period}: cannot compare with ${prior.period} because ${cur.value === null ? "this week's" : "the prior week's"} figure is unavailable. ${t.notify} to decide`,
          );
          continue;
        }
        const moved = cur.value - before;
        const past = t.direction === "up" ? moved >= t.amount : -moved >= t.amount;
        if (past) {
          await ports.notify(t.notify, { measure: t.measure, period: entry.period, detail: `${t.measure} moved ${t.direction} past the threshold you set, against ${prior.period}` });
        }
      }
    }

    for (const a of audiences) {
      const own = a.measures.map((m) => figures.get(m));
      const out = await ports.publishReport({
        period: entry.period,
        audienceId: a.id,
        figures: own.map(forPublish),
        narrative: commentary(entry.period, own, priorValues),
      });
      if (!out?.id) await ports.escalate("report.publish_failed", `${entry.period} view for ${a.name}: no report id read back, so it was not published`);
    }
  }

  for (const c of await ports.readCorrections()) {
    if (!c.person || !c.reason || !c.reportId) {
      await ports.escalate("report.correction_incomplete", `correction ${c.id}: needs a named person, a reason and the report it corrects`);
      continue;
    }
    if (config.openExceptionFor?.(c.period)) continue; // open exception on this report record: the chain waits

    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue; // applied in an earlier run

    const def = register.find((d) => d.measure === c.measure);
    if (!def || !target.figures.some((f) => f.measure === c.measure)) {
      await ports.escalate("report.correction_unknown_measure", `correction ${c.id}: ${c.measure} is not on ${target.id} or has no definition`);
      continue;
    }

    // One measure, one figure: every current view of the week carrying it is corrected, each as its own new version.
    const views = [target, ...reports.filter((r) => r.id !== target.id && r.status === "published" && r.figures.some((f) => f.measure === c.measure))];
    for (const view of views) await newVersion(ports, c, view, def, register);
  }
}

/** Gate, then publish a version that supersedes the view. The old one is never touched. */
async function newVersion(ports, c, view, def, register) {
  const gate = await ports.approveCorrection({ reportId: view.id, person: c.person, reason: c.reason });
  if (!gate?.approved) return;

  const at = (await ports.now()).toISOString();
  const figures = [];
  for (const f of view.figures) {
    const fdef = register.find((d) => d.measure === f.measure) ?? null;
    if (f.measure === c.measure) {
      const cited = await ports.cite({ measure: f.measure, definitionId: def.id, source: `correction ${c.id} by ${c.person}`, asOf: at });
      figures.push({ measure: f.measure, value: c.value, unavailableReason: null, cited, def: fdef });
    } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
      const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
      figures.push({ measure: f.measure, value: f.value, unavailableReason: null, cited, def: fdef });
    } else {
      figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable", def: fdef });
    }
  }
  const out = await ports.publishReport({
    period: c.period,
    audienceId: view.audienceId,
    figures: figures.map(forPublish),
    narrative: `${commentary(c.period, figures, new Map())} This version corrects ${label(def, c.measure)} and was published by ${c.person}.`,
    supersedes: view.id,
    by: c.person,
    reason: c.reason,
  });
  if (!out?.id) await ports.escalate("report.publish_failed", `correction ${c.id} on ${view.id}: no report id read back, so the new version was not published`);
}

/**
 * Threshold Watch: the weekly key-numbers report for an Australian business
 * (or a bookkeeping client of a practice), built to AIP-BS-RECURRING-REPORT
 * 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Original build. The job: watch the job system and the ledger and tell a
 * named person when job margin, debtors or cash moves past a threshold the
 * business set, with the figures behind it.
 *
 * The narrowing: the job as asked alerts whenever a figure moves. This build
 * runs on a schedule (every Monday morning), publishes the key numbers every
 * week whether or not anything moved, and compares each thresholded figure
 * with the prior week's published figure. Past a threshold, the named person
 * the business chose is told that run, with both figures. It never fires
 * between runs, and it never decides what to do about a crossing: that stays
 * with the person told.
 *
 * The measures (gross margin on completed jobs, debtors, debtors over 60
 * days, cash at bank) are NOT in this file. They live in the definitions
 * register, each with its source, query, period, filters and owner. The
 * thresholds (measure, direction, amount, person) are set by a person in
 * their own list. This file only runs the register.
 *
 * One run, every time the schedule wakes it (schedule.tick) or an exception
 * on a report record is closed (exception.closed):
 *
 *   1. Read the schedule. A week is due only once its scheduled time has
 *      arrived and no scheduled report for it is on the record.
 *   2. Read the register, the audiences and the thresholds.
 *   3. Compute every measure any audience or threshold needs exactly once,
 *      from its one definition, citing the as-of time the read returned. No
 *      definition, two definitions or an unreadable source: unavailable with
 *      the reason, and the definition's owner told.
 *   4. Compare each thresholded measure with the prior week's published
 *      figure. Past it: notify the named person with both figures. Either
 *      figure unavailable: escalate to that person, never assume.
 *   5. Publish one view per audience carrying exactly its declared measures.
 *      The commentary states only values the figure list carries.
 *   6. Corrections a named person asked for: a gate with the person and the
 *      reason, then a new version superseding the old. Never in place.
 *
 * Nothing is remembered between runs. What has been published is read back
 * from the record by period. Nothing is written to the job system or the
 * ledger: they are read only.
 */

const NUM = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2, useGrouping: false });
const asWritten = (v) => NUM.format(v);

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
    await ports.notify(def.owner, { measure, period, detail: `${measure} is unavailable on the ${period} key numbers: ${reason}` });
    return { measure, value: null, unavailableReason: reason, def };
  }
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
  return { measure, value: read.value, unavailableReason: null, cited, def, asOf: read.asOf };
}

/** The value a measure carries on the current published views of a period. */
function publishedValue(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return { found: true, value: f.value, asOf: f.asOf ?? null, reportId: r.id };
  }
  return { found: false, value: null, asOf: null, reportId: null };
}

function direction(cur, prior) {
  if (cur === null || prior === null || prior === undefined) return "";
  if (cur > prior) return ", higher than the prior week";
  if (cur < prior) return ", lower than the prior week";
  return ", the same as the prior week";
}

/** Describes, never computes: one figure per sentence, its own value. */
function commentary(period, figures, prior) {
  const out = [`Key numbers for ${period}, from the job system and the ledger.`];
  for (const f of figures) {
    if (f.value === null) out.push(`${f.measure} is unavailable this week (${f.unavailableReason}) and its owner has been told.`);
    else out.push(`${f.measure} is ${asWritten(f.value)}${direction(f.value, prior.get(f.measure))}.`);
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

    const priorFigures = new Map();
    for (const m of needed) {
      const p = publishedValue(priorReports, m);
      if (p.found) priorFigures.set(m, p);
    }
    const priorValues = new Map([...priorFigures].map(([m, p]) => [m, p.value]));

    // Thresholds against the prior week, in this run, to the person a person named.
    if (prior) {
      for (const t of thresholds) {
        const cur = figures.get(t.measure);
        const before = priorFigures.get(t.measure);
        if (!before || before.value === null || cur.value === null) {
          await ports.escalate(
            "report.threshold_not_comparable",
            `${t.measure} for ${entry.period}: cannot compare with ${prior.period} because ${cur.value === null ? "this week's" : "the prior week's"} figure is unavailable. ${t.notify} to decide`,
          );
          continue;
        }
        const moved = cur.value - before.value;
        const past = t.direction === "up" ? moved >= t.amount : -moved >= t.amount;
        if (past) {
          await ports.notify(t.notify, {
            measure: t.measure,
            period: entry.period,
            detail:
              `${t.measure} moved ${t.direction} past the threshold you set (${asWritten(t.amount)} week on week). ` +
              `${prior.period}: ${asWritten(before.value)} (as of ${before.asOf}, report ${before.reportId}). ` +
              `${entry.period}: ${asWritten(cur.value)} (definition ${cur.def.id}, ${cur.def.source}, as of ${cur.asOf}). What to do about it is yours.`,
          });
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
    narrative: `${commentary(c.period, figures, new Map())} This version corrects ${c.measure} and was published by ${c.person}.`,
    supersedes: view.id,
    by: c.person,
    reason: c.reason,
  });
  if (!out?.id) await ports.escalate("report.publish_failed", `correction ${c.id} on ${view.id}: no report id read back, so the new version was not published`);
}

/**
 * Comp Report: the weekly multifamily comp report, built to
 * AIP-BS-RECURRING-REPORT 2026-10-03.
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * A port of "Multifamily Comp Desk" by Matthew Dickson, reimplemented from the
 * standard. Only its public one-liner was used (source-linked availability
 * reports, effective rents and weekly comps for multifamily property
 * management). Nothing here is taken from the original bot's prompt or
 * instructions.
 *
 * The measures (units available, effective rent after concessions, the comp
 * set's asking rent, and whatever else the register defines) are not in this
 * file. They live in the definitions register a person writes, each with its
 * source, query, period and owner. This file only runs the register.
 *
 * What one run does, every time it is woken (schedule.tick, or
 * exception.closed on a report record):
 *
 *   1. Read the schedule. Only a period whose scheduled time has arrived and
 *      which has no scheduled report yet is due. Nothing publishes early, and a
 *      due period publishes whether or not anything changed.
 *   2. Read the register, the audiences and the thresholds.
 *   3. For each due period, compute every measure any audience carries exactly
 *      once, from its one definition: read the source, cite the read's own
 *      as-of time. A measure with no definition, two definitions, or an
 *      unreadable source is published as unavailable with the reason, and the
 *      owner is told. Never last week's value.
 *   4. Compare each thresholded measure with the prior period's published
 *      figure. Past the threshold: notify the named person. Prior figure
 *      unavailable: escalate, never assume.
 *   5. Publish one view per audience carrying exactly its declared measures,
 *      reusing the one computed figure. The narrative names figures and states
 *      only values the figure list carries.
 *   6. Apply corrections a named person asked for: a gate with the person and
 *      the reason, then a new version superseding the old. Never in place.
 *      An open exception on that period's report record halts this step.
 *
 * Every effect goes through the ports. Nothing is remembered between runs: what
 * has been published is read back from the reports by period.
 */

/** A definition's owner, for the escalation text. */
const ownerOf = (def) => (def ? def.owner : "the register's owner");

/** One figure per measure per period, computed once from its one definition. */
async function computeFigure(ports, measure, definitions, period) {
  const defs = definitions.filter((d) => d.measure === measure);
  if (defs.length === 0) {
    await ports.escalate("report.no_definition", `${measure} for ${period}: no definition in the register; published as unavailable`);
    return { measure, value: null, unavailableReason: "no_definition" };
  }
  if (defs.length > 1) {
    await ports.escalate(
      "report.conflicting_definitions",
      `${measure} for ${period}: the register holds ${defs.length} definitions (${defs.map((d) => d.id).join(", ")}); published as unavailable until a person keeps one`,
    );
    return { measure, value: null, unavailableReason: "conflicting_definitions" };
  }
  const def = defs[0];
  const read = await ports.readSource(def.source, def.queryRef, period);
  if (!read.ok) {
    await ports.escalate(
      "report.source_unreadable",
      `${measure} for ${period}: ${def.source} could not be read (${read.reason}); published as unavailable. Owner told: ${ownerOf(def)}`,
    );
    return { measure, value: null, unavailableReason: `source_unreadable: ${read.reason}`, definition: def };
  }
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
  return { measure, value: read.value, unavailableReason: null, cited, definition: def };
}

/** The current published value of a measure for a period, from the record. */
function currentFigure(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return f;
  }
  return undefined;
}

function movement(cur, prior) {
  if (cur === null || cur === undefined || prior === null || prior === undefined) return null;
  if (cur > prior) return "rose against the prior week";
  if (cur < prior) return "fell against the prior week";
  return "was unchanged on the prior week";
}

/**
 * Prose that describes. It names each figure and states only the value the
 * figure itself carries, written exactly as the figure list carries it. No
 * percentage, no difference, no other period's label.
 */
function narrativeFor(period, figures, priorFigures) {
  const lines = [`Weekly comp report for ${period}.`];
  for (const f of figures) {
    if (f.value === null) {
      lines.push(`${f.measure} is unavailable this week (${f.unavailableReason}); its owner has been told.`);
    } else {
      const move = movement(f.value, priorFigures.get(f.measure));
      lines.push(`${f.measure} is ${String(f.value)}${move ? `, and ${move}` : ""}.`);
    }
  }
  return lines.join(" ");
}

const toInput = (f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) });

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 * @param {{ openExceptionFor?: (period: string) => ({ owner: string } | null) }} [config]
 */
export async function build(ports, config = {}) {
  const now = (await ports.now()).getTime();
  const schedule = [...(await ports.readSchedule())].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const definitions = await ports.readDefinitions();
  const audiences = await ports.readAudiences();
  const thresholds = await ports.readThresholds();

  // 1. Due periods: scheduled time arrived, no scheduled report on the record yet.
  for (const [i, entry] of schedule.entries()) {
    if (Date.parse(entry.scheduledAt) > now) continue;
    const existing = await ports.readReports(entry.period);
    if (existing.some((r) => r.publishedBy === "schedule")) continue;

    const prior = i > 0 ? schedule[i - 1] : null;
    const priorReports = prior ? await ports.readReports(prior.period) : [];

    // 3. Every measure any audience carries, computed once.
    const measures = [...new Set(audiences.flatMap((a) => a.measures))];
    const figures = new Map();
    for (const m of measures) figures.set(m, await computeFigure(ports, m, definitions, entry.period));

    // 4. Thresholds against the prior period, in the same run.
    const priorValues = new Map();
    for (const m of measures) {
      const pf = currentFigure(priorReports, m);
      if (pf) priorValues.set(m, pf.value);
    }
    if (prior) {
      for (const t of thresholds) {
        const cur = figures.get(t.measure) ?? (await computeFigure(ports, t.measure, definitions, entry.period));
        if (!figures.has(t.measure)) figures.set(t.measure, cur);
        const pf = currentFigure(priorReports, t.measure);
        if (cur.value === null || !pf || pf.value === null) {
          await ports.escalate(
            "report.threshold_not_comparable",
            `${t.measure} for ${entry.period}: the threshold cannot be compared because ${cur.value === null ? "this week's" : "the prior week's"} figure is unavailable. ${t.notify} to decide`,
          );
          continue;
        }
        const delta = cur.value - pf.value;
        const crossed = t.direction === "up" ? delta >= t.amount : -delta >= t.amount;
        if (crossed) {
          await ports.notify(t.notify, {
            measure: t.measure,
            period: entry.period,
            detail: `${t.measure} moved ${t.direction} past its threshold against ${prior.period}`,
          });
        }
      }
    }

    // 5. One view per audience, exactly its declared measures, the same figure in each.
    for (const a of audiences) {
      const own = a.measures.map((m) => figures.get(m));
      const published = await ports.publishReport({
        period: entry.period,
        audienceId: a.id,
        figures: own.map(toInput),
        narrative: narrativeFor(entry.period, own, priorValues),
      });
      if (!published?.id) await ports.escalate("report.publish_failed", `${entry.period} view for ${a.name}: no report id came back, so it was not published`);
    }
  }

  // 6. Corrections: a named person, a reason, a gate, then a new version.
  const corrections = await ports.readCorrections();
  for (const c of corrections) {
    if (!c.person || !c.reason || !c.reportId) {
      await ports.escalate("report.correction_incomplete", `correction ${c.id}: a correction needs a named person, a reason and the report it corrects`);
      continue;
    }
    const open = config.openExceptionFor?.(c.period);
    if (open) continue; // an open exception on this report record halts the chain until its owner closes it

    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue; // already superseded: applied in an earlier run

    const def = definitions.find((d) => d.measure === c.measure);
    if (!target.figures.some((f) => f.measure === c.measure) || !def) {
      await ports.escalate("report.correction_unknown_measure", `correction ${c.id}: ${c.measure} is not on ${target.id} or has no definition`);
      continue;
    }

    // One measure, one figure: every current view of the period carrying the
    // measure takes the correction, each as its own gated new version.
    const views = [target, ...reports.filter((r) => r.id !== target.id && r.status === "published" && r.figures.some((f) => f.measure === c.measure))];
    for (const view of views) await correctView(ports, c, view, def);
  }
}

/** Gate one view, then publish its new version superseding it. Never in place. */
async function correctView(ports, c, target, def) {
  const gate = await ports.approveCorrection({ reportId: target.id, person: c.person, reason: c.reason });
  if (!gate.approved) return;

  const at = (await ports.now()).toISOString();
  const figures = [];
  for (const f of target.figures) {
    if (f.measure === c.measure) {
      // The corrected value came from a person, so the provenance says so.
      const cited = await ports.cite({ measure: f.measure, definitionId: def.id, source: `correction ${c.id} by ${c.person}`, asOf: at });
      figures.push({ measure: f.measure, value: c.value, unavailableReason: null, cited });
    } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
      const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
      figures.push({ measure: f.measure, value: f.value, unavailableReason: null, cited });
    } else {
      figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
    }
  }
  const published = await ports.publishReport({
    period: c.period,
    audienceId: target.audienceId,
    figures,
    narrative: `${narrativeFor(c.period, figures, new Map())} This version corrects ${c.measure}, published by ${c.person}.`,
    supersedes: target.id,
    by: c.person,
    reason: c.reason,
  });
  if (!published?.id) await ports.escalate("report.publish_failed", `correction ${c.id} on ${target.id}: no report id came back, so the new version was not published`);
}

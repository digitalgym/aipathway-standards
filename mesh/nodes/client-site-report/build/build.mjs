/**
 * Client Site Report: the monthly service report each commercial fire and
 * electrical client gets on their sites.
 *
 * Built to AIP-BS-RECURRING-REPORT,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Four lines per site, each defined once in the register by a person:
 *   jobs_done          jobs completed on the site in the month (job system)
 *   assets_overdue     assets in the register past their AS 1851 or
 *                      AS/NZS 3760 service date at month end (asset register)
 *   open_defects       defects logged on the site and not yet rectified (job system)
 *   services_due_next  routine services the register says fall due next month
 *
 * Each run, woken by the schedule (first business morning of the month):
 *   1. Take every scheduled month whose time has come.
 *   2. For a month with a view still to publish, compute each measure once
 *      from its one definition, read its source once, cite that read, and
 *      publish one view per audience: each client sees only its own sites, the
 *      service manager sees every site. A measure with no definition, two
 *      definitions, or a source that would not answer is published as
 *      unavailable with the reason, and its owner is told. Never last month's.
 *   3. On the run that first publishes a month, compare each thresholded
 *      measure with last month's published figure and tell the named person.
 *      Nothing to compare against is escalated, not assumed.
 *   4. Apply each correction a named person asked for: a gate with their name
 *      and reason, then a new version of every current view carrying that
 *      measure. Nothing is edited in place.
 *
 * Every view goes into the business's report store, which issues the
 * report_id. Sending a client's view to the client stays with their account
 * manager: there is no send port here, on purpose.
 *
 * Nothing is kept between runs. What is already published is read back.
 */

const t = (iso) => Date.parse(iso);

const WORDS = {
  jobs_done: "jobs done",
  assets_overdue: "assets past their service date",
  open_defects: "open defects",
  services_due_next: "services due next month",
};
const words = (measure) => WORDS[measure.split(".").pop()] ?? "a line";

/** Describes the figures; states no number, so it can never invent one. */
function commentary(audience, figures) {
  const own = audience.id !== "service-manager";
  const parts = [
    own
      ? "This is the month's service record for your sites. Every line names the record it was read from and when."
      : "This is the month's service record for every client site, each line with its source and read time.",
  ];
  const gaps = [...new Set(figures.filter((f) => f.value === null).map((f) => words(f.measure)))];
  if (gaps.length > 0) {
    parts.push(`We could not read ${gaps.join(" or ")} this month, so those lines show as unavailable rather than carried over. The person who owns them has been told.`);
  }
  if (figures.some((f) => f.measure.endsWith(".open_defects") && f.value !== null && f.value > 0)) {
    parts.push("Open defects are listed against the site they were found on.");
  }
  return parts.join(" ");
}

async function computeMonth(ports, period, measures, definitions) {
  const out = new Map();
  for (const measure of measures) {
    const defs = definitions.filter((d) => d.measure === measure);
    if (defs.length !== 1) {
      const reason = defs.length === 0 ? "no_definition" : "conflicting_definitions";
      out.set(measure, { measure, value: null, unavailableReason: reason });
      await ports.escalate(`report.${reason}`, `${measure} for ${period}: ${defs.length === 0 ? "nothing in the register defines it" : `defined by ${defs.map((d) => d.id).join(" and ")}`}; published as unavailable`);
      continue;
    }
    const d = defs[0];
    const read = await ports.readSource(d.source, d.queryRef, period);
    if (!read.ok) {
      const reason = `source_unreadable: ${d.source} ${read.reason}`;
      out.set(measure, { measure, value: null, unavailableReason: reason });
      await ports.notify(d.owner, { measure, period, detail: reason });
      await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${d.source} ${read.reason}; owner ${d.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: d.id, source: d.source, asOf: read.asOf });
    out.set(measure, { measure, value: read.value, unavailableReason: null, cited });
  }
  return out;
}

function lastPublished(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return f;
  }
  return undefined;
}

async function checkThresholds(ports, schedule, period, computed, thresholds) {
  const i = schedule.findIndex((e) => e.period === period);
  if (i <= 0) return;
  const before = await ports.readReports(schedule[i - 1].period);
  for (const th of thresholds) {
    const now = computed.get(th.measure);
    if (!now) continue;
    const prior = lastPublished(before, th.measure);
    if (!prior || prior.value === null || now.value === null) {
      await ports.escalate("report.threshold_not_comparable", `${th.measure} for ${period}: no figure on both months to compare; ${th.notify} set this threshold`);
      continue;
    }
    const moved = th.direction === "up" ? now.value - prior.value : prior.value - now.value;
    if (moved >= th.amount) {
      await ports.notify(th.notify, { measure: th.measure, period, detail: `moved ${th.direction} past the threshold set for it` });
    }
  }
}

async function recite(ports, f) {
  if (!f.definitionId) return { measure: f.measure, value: f.value, unavailableReason: f.unavailableReason };
  const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
  return { measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, cited };
}

async function applyCorrections(ports, definitions, audiences) {
  for (const c of await ports.readCorrections()) {
    if (!c.person || !c.reason) {
      await ports.escalate("report.correction_incomplete", `correction ${c.id} names no person or no reason; nothing changed`);
      continue;
    }
    const views = (await ports.readReports(c.period)).filter((r) => r.status === "published" && r.figures.some((f) => f.measure === c.measure));
    if (views.length === 0) {
      await ports.escalate("report.correction_unknown_measure", `correction ${c.id}: no published view of ${c.period} carries ${c.measure}`);
      continue;
    }
    for (const r of views) {
      const target = r.figures.find((f) => f.measure === c.measure);
      if (r.supersedes && r.publishedBy === c.person && target.value === c.value) continue; // already done
      const gate = await ports.approveCorrection({ reportId: r.id, person: c.person, reason: c.reason });
      if (!gate.approved) continue;
      const def = definitions.find((d) => d.measure === c.measure);
      const figures = [];
      for (const f of r.figures) {
        if (f.measure !== c.measure) {
          figures.push(await recite(ports, f));
          continue;
        }
        const asOf = f.asOf ?? (await ports.now()).toISOString();
        const definitionId = f.definitionId ?? def?.id;
        const source = f.source ?? def?.source;
        figures.push({
          measure: c.measure,
          value: c.value,
          unavailableReason: null,
          ...(definitionId && source ? { cited: await ports.cite({ measure: c.measure, definitionId, source, asOf }) } : {}),
        });
      }
      const audience = audiences.find((a) => a.id === r.audienceId) ?? { id: r.audienceId };
      await ports.publishReport({ period: c.period, audienceId: r.audienceId, figures, narrative: commentary(audience, figures), supersedes: r.id, by: c.person, reason: c.reason });
    }
  }
}

/** @param {import("@aipathway/conformance").ReportPorts} ports */
export async function build(ports) {
  const now = (await ports.now()).getTime();
  const schedule = [...(await ports.readSchedule())].sort((a, b) => t(a.scheduledAt) - t(b.scheduledAt));
  const due = schedule.filter((e) => t(e.scheduledAt) <= now);
  if (due.length === 0) return;

  const definitions = await ports.readDefinitions();
  const audiences = await ports.readAudiences();
  const thresholds = await ports.readThresholds();

  for (const { period } of due) {
    const already = await ports.readReports(period);
    const todo = audiences.filter((a) => !already.some((r) => r.audienceId === a.id));
    if (todo.length === 0) continue;
    const measures = [...new Set(todo.flatMap((a) => a.measures))];
    const computed = await computeMonth(ports, period, measures, definitions);
    for (const a of todo) {
      const figures = a.measures.map((m) => ({ ...computed.get(m) }));
      await ports.publishReport({ period, audienceId: a.id, figures, narrative: commentary(a, figures) });
    }
    if (already.length === 0) await checkThresholds(ports, schedule, period, computed, thresholds);
  }

  await applyCorrections(ports, definitions, audiences);
}

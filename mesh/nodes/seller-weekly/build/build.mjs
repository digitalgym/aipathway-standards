/**
 * Seller Weekly: the Monday activity report each seller gets on their listing.
 *
 * Built to AIP-BS-RECURRING-REPORT,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Each run, woken by the schedule:
 *   1. Read the schedule and take every period whose time has arrived.
 *   2. Read the definitions register, the audiences (one per seller, one for
 *      the agency principal) and the thresholds the listing agents set.
 *   3. For a period not yet published, read each measure's source once, cite
 *      the read, and publish one view per audience carrying only its declared
 *      measures. A measure with no definition, two definitions, or a source
 *      that would not answer publishes as unavailable with the reason, and its
 *      owner is told. Never last week's number.
 *   4. Compare each thresholded measure with the prior week's published figure
 *      and tell the named person in the same run. No prior figure to compare
 *      against is escalated, not assumed.
 *   5. Apply any correction a named person asked for: a gate with their name
 *      and reason, then a new version superseding every current view that
 *      carries the measure. Nothing is edited in place.
 *
 * Every view is published into the agency's report store, which issues the
 * report_id. Whether a seller's view is sent to the seller stays with the
 * listing agent: there is no send port here, by design.
 *
 * Everything goes through the ports. Nothing is kept between runs: whether a
 * period or a correction is already done is read back from the published
 * reports.
 */

const ms = (iso) => Date.parse(iso);

/** The words a seller reads for each kind of measure. Keyed on the measure's suffix. */
const LABEL = {
  enquiries: "new buyer enquiries",
  inspections: "groups through inspections",
  portal_views: "views of the listing online",
};

const kindOf = (measure) => measure.split(".").pop();
const labelOf = (measure) => LABEL[kindOf(measure)] ?? kindOf(measure).replace(/[^a-z]+/g, " ").trim();

/** A sentence per figure, carrying only the figure's own value. */
function narrativeFor(audience, figures) {
  const lines = [];
  const sellerView = audience.id.startsWith("seller-");
  lines.push(sellerView ? "Here is the activity on your listing over the past week." : "Each current listing's activity over the past week is below.");
  if (sellerView) {
    for (const f of figures) {
      if (f.value !== null) lines.push(`Your listing had ${f.value} ${labelOf(f.measure)}.`);
    }
  }
  const missing = figures.filter((f) => f.value === null);
  if (missing.length > 0) {
    lines.push(
      sellerView
        ? `We could not read ${missing.map((f) => labelOf(f.measure)).join(" or ")} this week, so it is marked unavailable rather than guessed. Your agent has been told.`
        : "Some figures could not be read this week and are marked unavailable, with the reason on each.",
    );
  }
  return lines.join(" ");
}

/** The latest published view of a period that carries a measure. */
function figureFrom(reports, measure) {
  for (const r of reports) {
    if (r.status !== "published") continue;
    const f = r.figures.find((x) => x.measure === measure);
    if (f) return f;
  }
  return undefined;
}

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 */
export async function build(ports) {
  const now = (await ports.now()).getTime();
  const schedule = (await ports.readSchedule()).slice().sort((a, b) => ms(a.scheduledAt) - ms(b.scheduledAt));
  const due = schedule.filter((e) => ms(e.scheduledAt) <= now);
  if (due.length === 0) return;

  const definitions = await ports.readDefinitions();
  const audiences = await ports.readAudiences();
  const thresholds = await ports.readThresholds();

  for (const entry of due) {
    const period = entry.period;
    const existing = await ports.readReports(period);
    const missing = audiences.filter((a) => !existing.some((r) => r.audienceId === a.id));
    if (missing.length === 0) continue;

    // Compute every measure any audience carries, once, from its one definition.
    const measures = [...new Set(audiences.flatMap((a) => a.measures))];
    /** @type {Map<string, {measure: string, value: number|null, unavailableReason: string|null, cited?: string}>} */
    const computed = new Map();
    for (const measure of measures) {
      const defs = definitions.filter((d) => d.measure === measure);
      if (defs.length === 0) {
        computed.set(measure, { measure, value: null, unavailableReason: "no_definition" });
        await ports.escalate("report.no_definition", `${measure} for ${period}: the register holds no definition, published as unavailable`);
        continue;
      }
      if (defs.length > 1) {
        computed.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
        await ports.escalate("report.conflicting_definitions", `${measure} for ${period}: ${defs.map((d) => d.id).join(", ")} all define it`);
        continue;
      }
      const d = defs[0];
      const read = await ports.readSource(d.source, d.queryRef, period);
      if (!read.ok) {
        const reason = `source_unreadable: ${d.source} ${read.reason}`;
        computed.set(measure, { measure, value: null, unavailableReason: reason });
        await ports.notify(d.owner, { measure, period, detail: reason });
        await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${d.source} ${read.reason}; owner ${d.owner}`);
        continue;
      }
      const cited = await ports.cite({ measure, definitionId: d.id, source: d.source, asOf: read.asOf });
      computed.set(measure, { measure, value: read.value, unavailableReason: null, cited });
    }

    for (const a of missing) {
      const figures = a.measures.map((m) => ({ ...computed.get(m) }));
      await ports.publishReport({ period, audienceId: a.id, figures, narrative: narrativeFor(a, figures) });
    }

    // Thresholds against the prior period, only on the run that first publishes it.
    if (existing.length > 0) continue;
    const i = schedule.findIndex((e) => e.period === period);
    const prior = i > 0 ? schedule[i - 1].period : null;
    if (!prior) continue;
    const priorReports = await ports.readReports(prior);
    for (const t of thresholds) {
      const cur = computed.get(t.measure);
      if (!cur) continue;
      const before = figureFrom(priorReports, t.measure);
      if (!before || before.value === null || cur.value === null) {
        await ports.escalate("report.threshold_not_comparable", `${t.measure} for ${period}: no figure on both weeks to compare; ${t.notify} sets this threshold`);
        continue;
      }
      const moved = t.direction === "up" ? cur.value - before.value : before.value - cur.value;
      if (moved >= t.amount) {
        await ports.notify(t.notify, { measure: t.measure, period, detail: `moved ${t.direction} past the threshold set for it` });
      }
    }
  }

  // Corrections: a named person, a reason, a gate, then a new version.
  const corrections = await ports.readCorrections();
  for (const c of corrections) {
    if (!c.person || !c.reason) {
      await ports.escalate("report.correction_incomplete", `correction ${c.id} names no person or no reason; nothing changed`);
      continue;
    }
    const reports = await ports.readReports(c.period);
    const current = reports.filter((r) => r.status === "published" && r.figures.some((f) => f.measure === c.measure));
    if (current.length === 0) {
      await ports.escalate("report.correction_unknown_measure", `correction ${c.id}: no published view of ${c.period} carries ${c.measure}`);
      continue;
    }
    for (const r of current) {
      const f = r.figures.find((x) => x.measure === c.measure);
      // Already corrected: this person published this value as a new version.
      if (r.supersedes && r.publishedBy === c.person && f.value === c.value) continue;
      const gate = await ports.approveCorrection({ reportId: r.id, person: c.person, reason: c.reason });
      if (!gate.approved) continue;
      const figures = [];
      for (const x of r.figures) {
        if (x.measure !== c.measure) {
          figures.push({
            measure: x.measure,
            value: x.value,
            unavailableReason: x.unavailableReason,
            ...(x.definitionId ? { cited: await ports.cite({ measure: x.measure, definitionId: x.definitionId, source: x.source, asOf: x.asOf }) } : {}),
          });
          continue;
        }
        const d = definitions.find((y) => y.measure === c.measure);
        figures.push({
          measure: c.measure,
          value: c.value,
          unavailableReason: null,
          ...(d ? { cited: await ports.cite({ measure: c.measure, definitionId: d.id, source: x.source ?? d.source, asOf: x.asOf ?? (await ports.now()).toISOString() }) } : {}),
        });
      }
      const audience = audiences.find((a) => a.id === r.audienceId) ?? { id: r.audienceId };
      await ports.publishReport({
        period: c.period,
        audienceId: r.audienceId,
        figures,
        narrative: narrativeFor(audience, figures),
        supersedes: r.id,
        by: c.person,
        reason: c.reason,
      });
    }
  }
}

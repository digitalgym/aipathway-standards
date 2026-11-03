/**
 * One scenario per check of recurring-report-build-standard, for Comp Report.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`
 * from https://aipathway.com.au/explore-ai/recurring-report-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a multifamily asset: a property management system (the rent
 * roll and unit availability, a "ledger" source) and the comp survey the
 * leasing team keeps (a second source, read through the job-system port), a
 * Monday-morning schedule, and two audiences: the asset manager and the
 * onsite leasing team.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory.
 */

import { ReportWorld } from "@aipathway/conformance";

const W1 = "2026-W40";
const W2 = "2026-W41";
const SCHEDULE = [
  { period: W1, scheduledAt: "2026-09-28T22:00:00.000Z" }, // Monday 8am Brisbane
  { period: W2, scheduledAt: "2026-10-05T22:00:00.000Z" },
];

const LEASING = "Jo Park, leasing manager";
const REVENUE = "Sam Ortiz, revenue manager";

const DEFINITIONS = [
  { id: "D-UNITS", measure: "units_available", source: "pms", queryRef: "vacant_plus_on_notice_units", period: "week", filters: ["exclude_down_units"], owner: LEASING },
  { id: "D-EFF", measure: "effective_rent", source: "pms", queryRef: "avg_new_lease_rent_net_of_concessions", period: "week", filters: ["new_leases_signed_in_week"], owner: REVENUE },
  { id: "D-COMP", measure: "comp_set_rent", source: "comp-survey", queryRef: "comp_set_avg_asking_rent", period: "week", filters: ["comp_set_v1_properties"], owner: REVENUE },
];

const sources = (pms = {}, comp = {}) => [
  {
    id: "pms",
    kind: "ledger",
    values: {
      vacant_plus_on_notice_units: { [W1]: 14, [W2]: 14, ...pms.units },
      avg_new_lease_rent_net_of_concessions: { [W1]: 1850, [W2]: 1850, ...pms.eff },
    },
  },
  { id: "comp-survey", kind: "job", values: { comp_set_avg_asking_rent: { [W1]: 1795, [W2]: 1795, ...comp } } },
];

const ALL = { id: "asset-manager", name: "Asset manager", measures: ["units_available", "effective_rent", "comp_set_rent"] };
const ONSITE = { id: "onsite", name: "Onsite leasing team", measures: ["units_available", "effective_rent"] };

const world = (opts = {}) =>
  new ReportWorld({
    definitions: DEFINITIONS,
    sources: sources(),
    schedule: SCHEDULE,
    audiences: [ALL, ONSITE],
    ...opts,
  });

/** Move the clock to a scheduled time. */
const advanceTo = (w, iso) => w.advance(Date.parse(iso) - w.ports().now().getTime());

/** Run the build at each scheduled time in turn. */
async function runPeriods(b, w, between = {}) {
  for (const e of SCHEDULE) {
    await between[e.period]?.(w);
    advanceTo(w, e.scheduledAt);
    await b(w.ports());
  }
}

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const valued = (r) => r.figures.filter((f) => f.value !== null);

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // 1. Three definitions; the asset manager's view also carries occupancy_forecast, which nobody defined.
    world: () => world({ audiences: [{ ...ALL, measures: [...ALL.measures, "occupancy_forecast"] }] }),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
    },
    holds: (w) => {
      const reports = w.published(W1);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const d = f.definitionId && w.definition(f.definitionId);
          if (!d || d.measure !== f.measure) return false;
        }
        const undef = r.figures.find((f) => f.measure === "occupancy_forecast");
        if (!undef || undef.value !== null || undef.unavailableReason !== "no_definition") return false;
      }
      return reports.some((r) => valued(r).length === 3);
    },
    describe: (w) => w.published(W1).map((r) => r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason}@${f.definitionId}`).join(", ")).join(" | "),
  },
  {
    checkId: "one-definition-per-measure",
    // 2. Both views carry effective_rent for the same week.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
    },
    holds: (w) => {
      if (w.definitionsFor("effective_rent").length !== 1) return false;
      const d = w.definitionsFor("effective_rent")[0];
      if (w.sourceReads(d.source, d.queryRef, W1).length !== 1) return false;
      const views = [w.current(W1, ALL.id), w.current(W1, ONSITE.id)].map((r) => r?.figures.find((f) => f.measure === "effective_rent"));
      return views.every((f) => f && f.value !== null && f.definitionId === d.id) && views[0].value === views[1].value;
    },
    describe: (w) => `reads of the effective rent query: ${w.sourceReads("pms", "avg_new_lease_rent_net_of_concessions", W1).length}`,
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // 3. Definitions over the property system (ledger port) and the comp survey (job port), one week.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
    },
    holds: (w) => {
      const reports = w.published(W1);
      if (reports.length === 0) return false;
      const kinds = new Set(callsTo(w, "read_job").length ? ["job"] : []);
      if (callsTo(w, "read_ledger", (c) => c.request.source === "pms").length) kinds.add("ledger");
      if (kinds.size !== 2) return false;
      return reports.every((r) =>
        valued(r).every((f) => {
          if (!f.source || !f.asOf) return false;
          const d = w.definition(f.definitionId);
          if (!d || d.source !== f.source) return false;
          return w.sourceReads(d.source, d.queryRef, W1).some((c) => c.response.ok && c.response.asOf === f.asOf);
        }),
      );
    },
    describe: (w) => w.published(W1).map((r) => r.figures.map((f) => `${f.measure} ${f.source}@${f.asOf}`).join(", ")).join(" | "),
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // 4. Same values both weeks. A run before the first scheduled time must publish nothing.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, "2026-09-28T21:00:00.000Z"); // an hour early
      await b(w.ports());
      await runPeriods(b, w);
    },
    holds: (w) =>
      SCHEDULE.every((e) => {
        const rs = w.published(e.period).filter((r) => r.publishedBy === "schedule");
        return rs.length === 2 && rs.every((r) => Date.parse(r.publishedAt) >= Date.parse(e.scheduledAt));
      }),
    describe: (w) => w.reports.map((r) => `${r.period}/${r.audienceId} at ${r.publishedAt}`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // 5. The comp survey stops answering before the second week's run.
    world: () => world(),
    drive: (b, w) => runPeriods(b, w, { [W2]: (x) => x.breakSource("comp-survey") }),
    holds: (w) => {
      const first = w.current(W1, ALL.id)?.figures.find((f) => f.measure === "comp_set_rent");
      const second = w.current(W2, ALL.id)?.figures.find((f) => f.measure === "comp_set_rent");
      if (!first || first.value === null || !second) return false;
      const unavailable = second.value === null && typeof second.unavailableReason === "string" && /source_unreachable/.test(second.unavailableReason);
      const told = callsTo(w, "escalate", (c) => /comp_set_rent/.test(c.request.detail ?? "") && /source_unreachable/.test(c.request.detail ?? "")).length > 0;
      return unavailable && told;
    },
    describe: (w) => `W41 comp: ${JSON.stringify(w.current(W2, ALL.id)?.figures.find((f) => f.measure === "comp_set_rent"))}; escalations ${w.escalations.length}`,
  },
  {
    checkId: "no-narrative-invents-a-number",
    // 6. Effective rent rises and units available fall in the second week: a percentage is tempting.
    world: () => world({ sources: sources({ eff: { [W2]: 1910 }, units: { [W2]: 9 } }) }),
    drive: (b, w) => runPeriods(b, w),
    holds: (w) => {
      const all = [...w.published(W1), ...w.published(W2)];
      return all.length === 4 && all.every((r) => typeof r.narrative === "string" && r.narrative.length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => w.reports.map((r) => `${r.id}: ${r.narrative} [invented: ${w.inventedNumbers(r).join(",")}]`).join(" | "),
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // 7. A threshold the revenue manager set: effective rent up 50 or more week on week.
    world: () =>
      world({
        sources: sources({ eff: { [W2]: 1910 } }),
        thresholds: [{ measure: "effective_rent", direction: "up", amount: 50, notify: REVENUE }],
      }),
    drive: (b, w) => runPeriods(b, w),
    holds: (w) => {
      const n = callsTo(w, "notify");
      const firstWeek = n.filter((c) => c.request.period === W1);
      const secondWeek = n.filter((c) => c.request.period === W2 && c.request.person === REVENUE && c.request.measure === "effective_rent");
      const sameRun = secondWeek.some((c) => Date.parse(c.at) === Date.parse(SCHEDULE[1].scheduledAt));
      return firstWeek.length === 0 && secondWeek.length === 1 && sameRun;
    },
    describe: (w) => `notifications: ${JSON.stringify(w.notifications)}`,
  },
  {
    checkId: "audience-gets-its-own-view",
    // 8. The asset manager is declared for every measure; onsite leasing for a subset.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
    },
    holds: (w) =>
      [ALL, ONSITE].every((a) => {
        const r = w.current(W1, a.id);
        if (!r) return false;
        const got = r.figures.map((f) => f.measure).sort();
        const want = [...a.measures].sort();
        return got.length === want.length && got.every((m, i) => m === want[i]);
      }),
    describe: (w) => w.published(W1).map((r) => `${r.audienceId}: ${r.figures.map((f) => f.measure).join(",")}`).join(" | "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // 9. One week published to the asset manager; the revenue manager corrects effective rent.
    world: () => world({ audiences: [ALL] }),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
      w.requestCorrection({ period: W1, audienceId: ALL.id, measure: "effective_rent", value: 1835, person: REVENUE, reason: "Two concessions were posted to the wrong week in the rent roll" });
      w.advance(3 * 3600 * 1000);
      await b(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W1, ALL.id);
      const v1 = rs.find((r) => r.version === 1);
      const v2 = rs.find((r) => r.version === 2);
      if (!v1 || !v2 || rs.length !== 2) return false;
      const gate = w.firstCall("gate", (c) => c.request.person === REVENUE && /concessions/.test(c.request.reason));
      const pub = w.firstCall("publish_report", (c) => c.request.supersedes === v1.id);
      const ver = w.versionsOf(v2.id)[0];
      const oldEff = v1.figures.find((f) => f.measure === "effective_rent");
      const newEff = v2.figures.find((f) => f.measure === "effective_rent");
      return (
        gate >= 0 &&
        pub > gate &&
        v2.supersedes === v1.id &&
        v1.status === "superseded" &&
        v2.publishedBy === REVENUE &&
        ver?.by === REVENUE &&
        /concessions/.test(ver?.reason ?? "") &&
        oldEff?.value === 1850 &&
        newEff?.value === 1835 &&
        w.amendments.length === 0
      );
    },
    describe: (w) => w.reports.map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "the-record-by-period",
    // 10. One week to two audiences, then corrected once; the record is read back by period.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, SCHEDULE[0].scheduledAt);
      await b(w.ports());
      w.requestCorrection({ period: W1, audienceId: ALL.id, measure: "units_available", value: 13, person: LEASING, reason: "One unit was marked on notice twice" });
      w.advance(3600 * 1000);
      await b(w.ports());
      await w.ports().readReports(W1); // the lender's question, asked through the port
    },
    holds: (w) => {
      const read = callsTo(w, "read_ledger", (c) => c.request.reports === W1).at(-1);
      const rows = w.published(W1);
      if (!read || rows.length < 3) return false;
      const ids = new Set(read.response.ids);
      if (!rows.every((r) => ids.has(`${r.id}@v${r.version}`))) return false;
      const views = new Set(rows.map((r) => r.audienceId));
      if (views.size !== 2) return false;
      return rows.every((r) => {
        const v = w.versionsOf(r.id)[0];
        if (!v || !v.by) return false;
        if (r.supersedes && !(v.reason && v.by !== "schedule")) return false;
        return valued(r).every((f) => f.definitionId && f.source && f.asOf);
      });
    },
    describe: (w) => w.published(W1).map((r) => `${r.id} v${r.version} ${r.audienceId} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the definitions register and the schedule run on
    // the property management business's own account.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own sources and schedule. This
// standard publishes no live port map yet, so run.mjs refuses a production run
// and the stub reports it as with_us. Run by hand on the real systems.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

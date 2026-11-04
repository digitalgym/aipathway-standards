/**
 * One scenario per check of recurring-report-build-standard, for Client Site Report.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`
 * from https://aipathway.com.au/explore-ai/recurring-report-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a Brisbane fire and electrical services business with two
 * commercial clients: a shopping centre owner with two sites, and a medical
 * centre group with one. The job system (Simpro, on the job port) holds jobs
 * done and open defects per site; the asset register (read on the stub's
 * ledger port) holds assets past their service date and services due next
 * month. Reports publish 7am Brisbane on the first business morning after each
 * month. Three audiences: each client, who sees only its own sites, and the
 * service manager, who sees all three.
 *
 * Every `holds` reads the world's recorded trace, never the build's memory.
 */

import { ReportWorld } from "@aipathway/conformance";

const NOV = "2026-11";
const DEC = "2026-12";
const SCHEDULE = [
  { period: NOV, scheduledAt: "2026-11-30T21:00:00.000Z" }, // Tuesday 1 December, 7am Brisbane
  { period: DEC, scheduledAt: "2027-01-03T21:00:00.000Z" }, // Monday 4 January, 7am Brisbane
];

const COORD = "Mel Hart, service coordinator";
const SERVICE_MGR = "Dan Okafor, service manager";
const ACCOUNT_MGR = "Leah Brandt, account manager";

const SITES = { harbour: ["site118", "site121"], ridge: ["site204"] };
const ALL_SITES = [...SITES.harbour, ...SITES.ridge];
const KINDS = ["jobs_done", "assets_overdue", "open_defects", "services_due_next"];
const m = (site, kind) => `${site}.${kind}`;

const SRC = { jobs_done: "simpro", open_defects: "simpro", assets_overdue: "asset-register", services_due_next: "asset-register" };
const OWNER = { jobs_done: COORD, open_defects: SERVICE_MGR, assets_overdue: SERVICE_MGR, services_due_next: COORD };
const FILTERS = {
  jobs_done: ["status_completed_in_month", "exclude_quotes_and_cancelled"],
  open_defects: ["defect_logged", "not_rectified_at_month_end"],
  assets_overdue: ["as1851_or_as3760_due_date_before_month_end", "not_serviced"],
  services_due_next: ["routine_service_due_next_calendar_month"],
};

const DEFINITIONS = ALL_SITES.flatMap((s) =>
  KINDS.map((k) => ({ id: `D-${s}-${k}`, measure: m(s, k), source: SRC[k], queryRef: `${s}_${k}`, period: "month", filters: FILTERS[k], owner: OWNER[k] })),
);

const STEADY = {
  site118: { jobs_done: 14, assets_overdue: 3, open_defects: 2, services_due_next: 22 },
  site121: { jobs_done: 9, assets_overdue: 0, open_defects: 5, services_due_next: 17 },
  site204: { jobs_done: 6, assets_overdue: 1, open_defects: 1, services_due_next: 8 },
};

/** Source values; `over` sets one query's value for one month. */
const sources = (over = {}) => {
  const values = {};
  for (const s of ALL_SITES) for (const k of KINDS) values[`${s}_${k}`] = { [NOV]: STEADY[s][k], [DEC]: STEADY[s][k] };
  for (const [q, byMonth] of Object.entries(over)) values[q] = { ...values[q], ...byMonth };
  const of = (src) => Object.fromEntries(Object.entries(values).filter(([q]) => SRC[q.split("_").slice(1).join("_")] === src));
  return [
    { id: "simpro", kind: "job", values: of("simpro") },
    { id: "asset-register", kind: "ledger", values: of("asset-register") },
  ];
};

const HARBOUR = { id: "client-harbour", name: "Harbour Point centre management", measures: SITES.harbour.flatMap((s) => KINDS.map((k) => m(s, k))) };
const RIDGE = { id: "client-ridge", name: "Ridgeview Medical facilities", measures: SITES.ridge.flatMap((s) => KINDS.map((k) => m(s, k))) };
const MANAGER = { id: "service-manager", name: "Service manager", measures: ALL_SITES.flatMap((s) => KINDS.map((k) => m(s, k))) };
const AUDIENCES = [HARBOUR, RIDGE, MANAGER];

const world = (opts = {}) => new ReportWorld({ definitions: DEFINITIONS, sources: sources(), schedule: SCHEDULE, audiences: AUDIENCES, ...opts });

const goTo = (w, iso) => w.advance(Date.parse(iso) - w.ports().now().getTime());

async function bothMonths(b, w, before = {}) {
  for (const e of SCHEDULE) {
    await before[e.period]?.(w);
    goTo(w, e.scheduledAt);
    await b(w.ports());
  }
}

async function november(b, w) {
  goTo(w, SCHEDULE[0].scheduledAt);
  await b(w.ports());
}

const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const withValue = (r) => r.figures.filter((f) => f.value !== null);
const line = (r, measure) => r?.figures.find((f) => f.measure === measure);

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // 1. Twelve definitions. Harbour's view also asks for a thirteenth line, emergency lighting
    //    test failures at site 118, which nobody has defined.
    world: () => world({ audiences: [{ ...HARBOUR, measures: [...HARBOUR.measures, m("site118", "em_light_failures")] }, RIDGE, MANAGER] }),
    drive: november,
    holds: (w) => {
      const rs = w.published(NOV);
      if (rs.length !== 3) return false;
      for (const r of rs) {
        for (const f of withValue(r)) {
          const d = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!d || d.measure !== f.measure) return false;
        }
      }
      const h = w.current(NOV, HARBOUR.id);
      const undefinedLine = line(h, m("site118", "em_light_failures"));
      if (!undefinedLine || undefinedLine.value !== null || undefinedLine.unavailableReason !== "no_definition") return false;
      return withValue(h).length === 8 && withValue(w.current(NOV, MANAGER.id)).length === 12;
    },
    describe: (w) => w.published(NOV).map((r) => `${r.audienceId}: ${r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason}@${f.definitionId}`).join(", ")}`).join(" | "),
  },
  {
    checkId: "one-definition-per-measure",
    // 2. Harbour and the service manager both carry open defects at site 121 for November.
    world: () => world(),
    drive: november,
    holds: (w) => {
      const measure = m("site121", "open_defects");
      const defs = w.definitionsFor(measure);
      if (defs.length !== 1) return false;
      const d = defs[0];
      if (w.sourceReads(d.source, d.queryRef, NOV).length !== 1) return false;
      const both = [w.current(NOV, HARBOUR.id), w.current(NOV, MANAGER.id)].map((r) => line(r, measure));
      return both.every((f) => f && f.value === 5 && f.definitionId === d.id) && both[0].asOf === both[1].asOf;
    },
    describe: (w) => `reads of site121_open_defects for November: ${w.sourceReads("simpro", "site121_open_defects", NOV).length}`,
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // 3. Definitions over Simpro (job port) and the asset register (ledger port), November.
    world: () => world(),
    drive: november,
    holds: (w) => {
      const rs = w.published(NOV);
      if (rs.length !== 3) return false;
      if (calls(w, "read_job", (c) => c.request.source === "simpro").length === 0) return false;
      if (calls(w, "read_ledger", (c) => c.request.source === "asset-register").length === 0) return false;
      return rs.every(
        (r) =>
          r.figures.length > 0 &&
          withValue(r).length === r.figures.length &&
          r.figures.every((f) => {
            if (!f.source || !f.asOf) return false;
            const d = w.definition(f.definitionId);
            return Boolean(d) && d.source === f.source && w.sourceReads(d.source, d.queryRef, NOV).some((c) => c.response.ok && c.response.asOf === f.asOf);
          }),
      );
    },
    describe: (w) => w.published(NOV).map((r) => r.figures.map((f) => `${f.measure} ${f.source}@${f.asOf}`).join(", ")).join(" | "),
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // 4. Identical figures both months. A run on the afternoon of 30 November, before the
    //    first scheduled morning, must publish nothing.
    world: () => world(),
    drive: async (b, w) => {
      goTo(w, "2026-11-30T05:00:00.000Z"); // 3pm Brisbane on 30 November, sixteen hours early
      await b(w.ports());
      await bothMonths(b, w);
    },
    holds: (w) =>
      calls(w, "publish_report").length === 6 &&
      calls(w, "publish_report").every((c) => Date.parse(c.at) >= Date.parse(SCHEDULE[0].scheduledAt)) &&
      SCHEDULE.every((e) => {
        const rs = w.published(e.period).filter((r) => r.publishedBy === "schedule");
        return rs.length === 3 && new Set(rs.map((r) => r.audienceId)).size === 3 && rs.every((r) => Date.parse(r.publishedAt) >= Date.parse(e.scheduledAt));
      }),
    describe: (w) => w.reports.map((r) => `${r.period}/${r.audienceId} at ${r.publishedAt}`).join("; ") || "nothing published",
  },
  {
    checkId: "cannot-compute-says-so",
    // 5. The asset register stops answering before the January run.
    world: () => world(),
    drive: (b, w) => bothMonths(b, w, { [DEC]: (x) => x.breakSource("asset-register") }),
    holds: (w) => {
      const measure = m("site118", "assets_overdue");
      const nov = line(w.current(NOV, HARBOUR.id), measure);
      const dec = line(w.current(DEC, HARBOUR.id), measure);
      if (!nov || nov.value !== 3 || !dec) return false;
      const unavailable = dec.value === null && typeof dec.unavailableReason === "string" && /source_unreachable/.test(dec.unavailableReason);
      const escalated = calls(w, "escalate", (c) => (c.request.detail ?? "").includes(measure) && /source_unreachable/.test(c.request.detail ?? "")).length > 0;
      const ownerTold = calls(w, "notify", (c) => c.request.person === SERVICE_MGR && c.request.measure === measure && c.request.period === DEC).length > 0;
      const simproStillRead = withValue(w.current(DEC, HARBOUR.id)).length === 4;
      return unavailable && escalated && ownerTold && simproStillRead;
    },
    describe: (w) => `December site118 assets overdue: ${JSON.stringify(line(w.current(DEC, HARBOUR.id), m("site118", "assets_overdue")))}; escalations ${w.escalations.length}`,
  },
  {
    checkId: "no-narrative-invents-a-number",
    // 6. Site 118 open defects triple and jobs done halve in December: "up 200%" is tempting.
    world: () => world({ sources: sources({ site118_open_defects: { [DEC]: 6 }, site118_jobs_done: { [DEC]: 7 } }) }),
    drive: (b, w) => bothMonths(b, w),
    holds: (w) => {
      const all = [...w.published(NOV), ...w.published(DEC)];
      return all.length === 6 && all.every((r) => typeof r.narrative === "string" && r.narrative.length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => w.reports.map((r) => `${r.id}: ${r.narrative} [invented: ${w.inventedNumbers(r).join(",")}]`).join(" | "),
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // 7. The account manager set: open defects up 3 or more month on month, per site.
    //    Site 118 goes 2 to 6 and crosses; site 204 goes 1 to 2 and does not.
    world: () =>
      world({
        sources: sources({ site118_open_defects: { [DEC]: 6 }, site204_open_defects: { [DEC]: 2 } }),
        thresholds: [
          { measure: m("site118", "open_defects"), direction: "up", amount: 3, notify: ACCOUNT_MGR },
          { measure: m("site204", "open_defects"), direction: "up", amount: 3, notify: ACCOUNT_MGR },
        ],
      }),
    drive: (b, w) => bothMonths(b, w),
    holds: (w) => {
      const n = calls(w, "notify");
      const inNov = n.filter((c) => c.request.period === NOV);
      const crossed = n.filter((c) => c.request.period === DEC && c.request.person === ACCOUNT_MGR && c.request.measure === m("site118", "open_defects"));
      const quiet = n.filter((c) => c.request.measure === m("site204", "open_defects"));
      return inNov.length === 0 && crossed.length === 1 && quiet.length === 0 && Date.parse(crossed[0].at) === Date.parse(SCHEDULE[1].scheduledAt);
    },
    describe: (w) => `notifications: ${JSON.stringify(w.notifications)}`,
  },
  {
    checkId: "audience-gets-its-own-view",
    // 8. Harbour is declared for its two sites, Ridgeview for its one, the service manager for all.
    world: () => world(),
    drive: november,
    holds: (w) =>
      AUDIENCES.every((a) => {
        const r = w.current(NOV, a.id);
        if (!r) return false;
        const got = r.figures.map((f) => f.measure).sort();
        const want = [...a.measures].sort();
        return got.length === want.length && got.every((x, i) => x === want[i]);
      }),
    describe: (w) => w.published(NOV).map((r) => `${r.audienceId}: ${r.figures.map((f) => f.measure).join(",")}`).join(" | "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // 9. November is published; the service coordinator corrects site 118 jobs done from 14 to 13.
    world: () => world(),
    drive: async (b, w) => {
      await november(b, w);
      w.requestCorrection({ period: NOV, audienceId: HARBOUR.id, measure: m("site118", "jobs_done"), value: 13, person: COORD, reason: "One job was a duplicate of a callout already counted" });
      w.advance(2 * 3600 * 1000);
      await b(w.ports());
      w.advance(3600 * 1000);
      await b(w.ports()); // a retried run must not publish a third version
    },
    holds: (w) => {
      const measure = m("site118", "jobs_done");
      const rs = w.published(NOV, HARBOUR.id);
      const v1 = rs.find((r) => r.version === 1);
      const v2 = rs.find((r) => r.version === 2);
      if (!v1 || !v2 || rs.length !== 2) return false;
      const gate = w.firstCall("gate", (c) => c.request.person === COORD && c.request.correction === v1.id && /duplicate/.test(c.request.reason));
      const pub = w.firstCall("publish_report", (c) => c.request.supersedes === v1.id);
      const ver = w.versionsOf(v2.id)[0];
      return (
        gate >= 0 &&
        pub > gate &&
        v2.supersedes === v1.id &&
        v1.status === "superseded" &&
        v2.publishedBy === COORD &&
        ver?.by === COORD &&
        /duplicate/.test(ver?.reason ?? "") &&
        line(v1, measure)?.value === 14 &&
        line(v2, measure)?.value === 13 &&
        w.published(NOV, MANAGER.id).length === 2 &&
        line(w.current(NOV, MANAGER.id), measure)?.value === 13 &&
        w.published(NOV, RIDGE.id).length === 1 &&
        w.amendments.length === 0
      );
    },
    describe: (w) => w.reports.map((r) => `${r.id} ${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "the-record-by-period",
    // 10. November to all three audiences, corrected once, then read back by month
    //     when the Ridgeview facilities manager asks where a number came from.
    world: () => world(),
    drive: async (b, w) => {
      await november(b, w);
      w.requestCorrection({ period: NOV, audienceId: RIDGE.id, measure: m("site204", "open_defects"), value: 2, person: SERVICE_MGR, reason: "A failed exit sign was logged on the job after month end close" });
      w.advance(3600 * 1000);
      await b(w.ports());
      await w.ports().readReports(NOV);
    },
    holds: (w) => {
      const read = calls(w, "read_ledger", (c) => c.request.reports === NOV).at(-1);
      const rows = w.published(NOV);
      if (!read || rows.length !== 5) return false;
      const ids = new Set(read.response.ids);
      if (!rows.every((r) => ids.has(`${r.id}@v${r.version}`))) return false;
      if (new Set(rows.map((r) => r.audienceId)).size !== 3) return false;
      if (rows.filter((r) => r.supersedes).length !== 2) return false;
      return rows.every((r) => {
        const v = w.versionsOf(r.id)[0];
        if (!v || !v.by) return false;
        if (r.supersedes && !(v.reason && v.by === SERVICE_MGR)) return false;
        return withValue(r).length === r.figures.length && r.figures.every((f) => f.definitionId && f.source && f.asOf);
      });
    },
    describe: (w) => w.published(NOV).map((r) => `${r.id} v${r.version} ${r.audienceId} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the definitions register, the audiences and the
    // schedule run on the services business's own account.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own Simpro, asset register and
// schedule. This standard publishes no live port map yet, so run.mjs refuses
// a production run and the stub reports it as with_us. Run it by hand.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

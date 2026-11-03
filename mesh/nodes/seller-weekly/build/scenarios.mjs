/**
 * One scenario per check of recurring-report-build-standard, for Seller Weekly.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`
 * from https://aipathway.com.au/explore-ai/recurring-report-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a sales agency with two listings on the market. The agency CRM
 * holds buyer enquiries and online listing views per listing (a "ledger"
 * source); the inspection register holds the groups through each open home or
 * private inspection (read through the job-system port). The schedule is
 * Monday 7am Brisbane. Three audiences: the seller of each listing, who sees
 * only their own listing, and the agency principal, who sees both.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory.
 */

import { ReportWorld } from "@aipathway/conformance";

const W1 = "2026-W46";
const W2 = "2026-W47";
const SCHEDULE = [
  { period: W1, scheduledAt: "2026-11-08T21:00:00.000Z" }, // Monday 9 November, 7am Brisbane
  { period: W2, scheduledAt: "2026-11-15T21:00:00.000Z" }, // Monday 16 November, 7am Brisbane
];

const ADMIN = "Priya Shah, sales administrator";
const AGENT = "Tom Reid, listing agent";

const LISTINGS = ["l1042", "l1077"];
const KINDS = ["enquiries", "inspections", "portal_views"];
const m = (listing, kind) => `${listing}.${kind}`;

const DEFINITIONS = LISTINGS.flatMap((l) => [
  { id: `D-${l}-ENQ`, measure: m(l, "enquiries"), source: "crm", queryRef: `${l}_buyer_enquiries`, period: "week", filters: ["new_contacts_only", "exclude_agent_entered_duplicates"], owner: ADMIN },
  { id: `D-${l}-INS`, measure: m(l, "inspections"), source: "inspections", queryRef: `${l}_groups_attended`, period: "week", filters: ["attended_not_registered"], owner: AGENT },
  { id: `D-${l}-VIEW`, measure: m(l, "portal_views"), source: "crm", queryRef: `${l}_listing_views`, period: "week", filters: ["portal_feed_unique_views"], owner: ADMIN },
]);

/** Source values; anything passed in overrides the steady default for that query. */
const sources = (over = {}) => {
  const base = {
    l1042_buyer_enquiries: { [W1]: 18, [W2]: 18 },
    l1042_groups_attended: { [W1]: 12, [W2]: 12 },
    l1042_listing_views: { [W1]: 640, [W2]: 640 },
    l1077_buyer_enquiries: { [W1]: 11, [W2]: 11 },
    l1077_groups_attended: { [W1]: 7, [W2]: 7 },
    l1077_listing_views: { [W1]: 415, [W2]: 415 },
  };
  for (const [q, byPeriod] of Object.entries(over)) base[q] = { ...base[q], ...byPeriod };
  const pick = (re) => Object.fromEntries(Object.entries(base).filter(([q]) => re.test(q)));
  return [
    { id: "crm", kind: "ledger", values: pick(/_(buyer_enquiries|listing_views)$/) },
    { id: "inspections", kind: "job", values: pick(/_groups_attended$/) },
  ];
};

const SELLER_1042 = { id: "seller-l1042", name: "Seller of listing L1042", measures: KINDS.map((k) => m("l1042", k)) };
const SELLER_1077 = { id: "seller-l1077", name: "Seller of listing L1077", measures: KINDS.map((k) => m("l1077", k)) };
const PRINCIPAL = { id: "principal", name: "Agency principal", measures: LISTINGS.flatMap((l) => KINDS.map((k) => m(l, k))) };
const AUDIENCES = [SELLER_1042, SELLER_1077, PRINCIPAL];

const world = (opts = {}) =>
  new ReportWorld({
    definitions: DEFINITIONS,
    sources: sources(),
    schedule: SCHEDULE,
    audiences: AUDIENCES,
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

async function firstWeek(b, w) {
  advanceTo(w, SCHEDULE[0].scheduledAt);
  await b(w.ports());
}

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const valued = (r) => r.figures.filter((f) => f.value !== null);
const fig = (r, measure) => r?.figures.find((f) => f.measure === measure);

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // 1. Six definitions; the L1042 seller's view also carries offers received, which nobody defined.
    world: () => world({ audiences: [{ ...SELLER_1042, measures: [...SELLER_1042.measures, m("l1042", "offers")] }, SELLER_1077, PRINCIPAL] }),
    drive: firstWeek,
    holds: (w) => {
      const reports = w.published(W1);
      if (reports.length !== 3) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const d = f.definitionId && w.definition(f.definitionId);
          if (!d || d.measure !== f.measure) return false;
        }
      }
      const seller = w.current(W1, SELLER_1042.id);
      const offers = fig(seller, m("l1042", "offers"));
      if (!offers || offers.value !== null || offers.unavailableReason !== "no_definition") return false;
      return valued(seller).length === 3 && valued(w.current(W1, PRINCIPAL.id)).length === 6;
    },
    describe: (w) => w.published(W1).map((r) => `${r.audienceId}: ${r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason}@${f.definitionId}`).join(", ")}`).join(" | "),
  },
  {
    checkId: "one-definition-per-measure",
    // 2. The L1042 seller and the principal both carry L1042 enquiries for the same week.
    world: () => world(),
    drive: firstWeek,
    holds: (w) => {
      const measure = m("l1042", "enquiries");
      const defs = w.definitionsFor(measure);
      if (defs.length !== 1) return false;
      const d = defs[0];
      if (w.sourceReads(d.source, d.queryRef, W1).length !== 1) return false;
      const views = [w.current(W1, SELLER_1042.id), w.current(W1, PRINCIPAL.id)].map((r) => fig(r, measure));
      return views.every((f) => f && f.value !== null && f.definitionId === d.id) && views[0].value === views[1].value && views[0].asOf === views[1].asOf;
    },
    describe: (w) => `reads of the L1042 enquiries query: ${w.sourceReads("crm", "l1042_buyer_enquiries", W1).length}`,
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // 3. Definitions over the CRM (ledger port) and the inspection register (job port), one week.
    world: () => world(),
    drive: firstWeek,
    holds: (w) => {
      const reports = w.published(W1);
      if (reports.length !== 3) return false;
      if (callsTo(w, "read_job", (c) => c.request.source === "inspections").length === 0) return false;
      if (callsTo(w, "read_ledger", (c) => c.request.source === "crm").length === 0) return false;
      return reports.every(
        (r) =>
          valued(r).length === r.figures.length &&
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
    // 4. Same values both weeks. A run on Sunday evening, before the first Monday, must publish nothing.
    world: () => world(),
    drive: async (b, w) => {
      advanceTo(w, "2026-11-08T09:00:00.000Z"); // Sunday 7pm Brisbane, ten hours early
      await b(w.ports());
      await runPeriods(b, w);
    },
    holds: (w) =>
      callsTo(w, "publish_report").every((c) => Date.parse(c.at) >= Date.parse(SCHEDULE[0].scheduledAt)) &&
      SCHEDULE.every((e) => {
        const rs = w.published(e.period).filter((r) => r.publishedBy === "schedule");
        return rs.length === 3 && new Set(rs.map((r) => r.audienceId)).size === 3 && rs.every((r) => Date.parse(r.publishedAt) >= Date.parse(e.scheduledAt));
      }),
    describe: (w) => w.reports.map((r) => `${r.period}/${r.audienceId} at ${r.publishedAt}`).join("; ") || "nothing published",
  },
  {
    checkId: "cannot-compute-says-so",
    // 5. The inspection register stops answering before the second Monday's run.
    world: () => world(),
    drive: (b, w) => runPeriods(b, w, { [W2]: (x) => x.breakSource("inspections") }),
    holds: (w) => {
      const measure = m("l1042", "inspections");
      const first = fig(w.current(W1, SELLER_1042.id), measure);
      const second = fig(w.current(W2, SELLER_1042.id), measure);
      if (!first || first.value === null || !second) return false;
      const unavailable = second.value === null && typeof second.unavailableReason === "string" && /source_unreachable/.test(second.unavailableReason);
      const escalated = callsTo(w, "escalate", (c) => (c.request.detail ?? "").includes(measure) && /source_unreachable/.test(c.request.detail ?? "")).length > 0;
      const ownerTold = callsTo(w, "notify", (c) => c.request.person === AGENT && c.request.measure === measure && c.request.period === W2).length > 0;
      const others = valued(w.current(W2, SELLER_1042.id)).length === 2;
      return unavailable && escalated && ownerTold && others;
    },
    describe: (w) => `W47 L1042 inspections: ${JSON.stringify(fig(w.current(W2, SELLER_1042.id), m("l1042", "inspections")))}; escalations ${w.escalations.length}`,
  },
  {
    checkId: "no-narrative-invents-a-number",
    // 6. L1042 enquiries halve and online views jump in the second week: "down 50%" is tempting.
    world: () => world({ sources: sources({ l1042_buyer_enquiries: { [W2]: 9 }, l1042_listing_views: { [W2]: 910 } }) }),
    drive: (b, w) => runPeriods(b, w),
    holds: (w) => {
      const all = [...w.published(W1), ...w.published(W2)];
      return all.length === 6 && all.every((r) => typeof r.narrative === "string" && r.narrative.length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => w.reports.map((r) => `${r.id}: ${r.narrative} [invented: ${w.inventedNumbers(r).join(",")}]`).join(" | "),
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // 7. The listing agent set two thresholds: enquiries down 5 or more week on week, on each listing.
    //    L1042 falls 18 to 9 and crosses; L1077 falls 11 to 10 and does not.
    world: () =>
      world({
        sources: sources({ l1042_buyer_enquiries: { [W2]: 9 }, l1077_buyer_enquiries: { [W2]: 10 } }),
        thresholds: [
          { measure: m("l1042", "enquiries"), direction: "down", amount: 5, notify: AGENT },
          { measure: m("l1077", "enquiries"), direction: "down", amount: 5, notify: AGENT },
        ],
      }),
    drive: (b, w) => runPeriods(b, w),
    holds: (w) => {
      const n = callsTo(w, "notify");
      const inFirst = n.filter((c) => c.request.period === W1);
      const crossed = n.filter((c) => c.request.period === W2 && c.request.person === AGENT && c.request.measure === m("l1042", "enquiries"));
      const notCrossed = n.filter((c) => c.request.measure === m("l1077", "enquiries"));
      const sameRun = crossed.some((c) => Date.parse(c.at) === Date.parse(SCHEDULE[1].scheduledAt));
      return inFirst.length === 0 && crossed.length === 1 && notCrossed.length === 0 && sameRun;
    },
    describe: (w) => `notifications: ${JSON.stringify(w.notifications)}`,
  },
  {
    checkId: "audience-gets-its-own-view",
    // 8. Each seller is declared for their own listing only; the principal for both.
    world: () => world(),
    drive: firstWeek,
    holds: (w) =>
      AUDIENCES.every((a) => {
        const r = w.current(W1, a.id);
        if (!r) return false;
        const got = r.figures.map((f) => f.measure).sort();
        const want = [...a.measures].sort();
        return got.length === want.length && got.every((x, i) => x === want[i]);
      }),
    describe: (w) => w.published(W1).map((r) => `${r.audienceId}: ${r.figures.map((f) => f.measure).join(",")}`).join(" | "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // 9. The first week is published; the listing agent corrects L1042 inspections from 12 to 11.
    world: () => world(),
    drive: async (b, w) => {
      await firstWeek(b, w);
      w.requestCorrection({ period: W1, audienceId: SELLER_1042.id, measure: m("l1042", "inspections"), value: 11, person: AGENT, reason: "One group was logged at both the Saturday open and a private inspection" });
      w.advance(2 * 3600 * 1000);
      await b(w.ports());
      w.advance(3600 * 1000);
      await b(w.ports()); // a retried run must not publish a third version
    },
    holds: (w) => {
      const measure = m("l1042", "inspections");
      const rs = w.published(W1, SELLER_1042.id);
      const v1 = rs.find((r) => r.version === 1);
      const v2 = rs.find((r) => r.version === 2);
      if (!v1 || !v2 || rs.length !== 2) return false;
      const gate = w.firstCall("gate", (c) => c.request.person === AGENT && c.request.correction === v1.id && /private inspection/.test(c.request.reason));
      const pub = w.firstCall("publish_report", (c) => c.request.supersedes === v1.id);
      const ver = w.versionsOf(v2.id)[0];
      const principal = w.published(W1, PRINCIPAL.id);
      return (
        gate >= 0 &&
        pub > gate &&
        v2.supersedes === v1.id &&
        v1.status === "superseded" &&
        v2.publishedBy === AGENT &&
        ver?.by === AGENT &&
        /private inspection/.test(ver?.reason ?? "") &&
        fig(v1, measure)?.value === 12 &&
        fig(v2, measure)?.value === 11 &&
        principal.length === 2 &&
        fig(w.current(W1, PRINCIPAL.id), measure)?.value === 11 &&
        w.published(W1, SELLER_1077.id).length === 1 &&
        w.amendments.length === 0
      );
    },
    describe: (w) => w.reports.map((r) => `${r.id} ${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "the-record-by-period",
    // 10. One week to all three audiences, then corrected once; the record is read back by period.
    world: () => world(),
    drive: async (b, w) => {
      await firstWeek(b, w);
      w.requestCorrection({ period: W1, audienceId: SELLER_1077.id, measure: m("l1077", "enquiries"), value: 10, person: ADMIN, reason: "One buyer enquired twice under two email addresses" });
      w.advance(3600 * 1000);
      await b(w.ports());
      await w.ports().readReports(W1); // the seller's question, asked through the port
    },
    holds: (w) => {
      const read = callsTo(w, "read_ledger", (c) => c.request.reports === W1).at(-1);
      const rows = w.published(W1);
      if (!read || rows.length !== 5) return false;
      const ids = new Set(read.response.ids);
      if (!rows.every((r) => ids.has(`${r.id}@v${r.version}`))) return false;
      if (new Set(rows.map((r) => r.audienceId)).size !== 3) return false;
      if (!rows.some((r) => r.supersedes)) return false;
      return rows.every((r) => {
        const v = w.versionsOf(r.id)[0];
        if (!v || !v.by) return false;
        if (r.supersedes && !(v.reason && v.by === ADMIN)) return false;
        return valued(r).length > 0 && valued(r).every((f) => f.definitionId && f.source && f.asOf);
      });
    },
    describe: (w) => w.published(W1).map((r) => `${r.id} v${r.version} ${r.audienceId} by ${r.publishedBy}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the definitions register, the audiences and the
    // schedule run on the agency's own account.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the agency's own sources and schedule. This
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

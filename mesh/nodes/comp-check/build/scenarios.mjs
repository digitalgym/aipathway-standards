/**
 * One scenario per check of price-one-pager-build-standard, for Comp Check.
 *
 * Scaffolded by `npx @aipathway/conformance init price-one-pager-build-standard`;
 * the checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/price-one-pager-build-standard
 *
 * Each `holds` reads the world (the recorded port calls and what the build
 * wrote through the ports), never the build, and returns a strict boolean.
 * Each scenario was run against a do-nothing build and deliberately broken
 * builds, and goes red for them.
 */

import { PriceWorld } from "@aipathway/conformance";

const NOW = new Date("2026-10-24T00:00:00.000Z");
const DAY = 86_400_000;
const AGENT = "Priya Nair";

/** A recorded sale that meets every default rule for a 3-bed house on 600 sqm. */
const sale = (id, price, extra = {}) => ({
  id,
  address: `${id.replace("s", "")} Banksia Street, Paddington`,
  type: "house",
  beds: 3,
  landSqm: 610,
  distanceKm: 0.8,
  soldOn: "2026-08-15",
  price,
  priceStatus: "verified",
  source: `NSW Valuer General sales record ${id}`,
  ...extra,
});

/** Four clean comparables: low 850,000, median 905,000, high 960,000. */
const FOUR = () => [sale("s1", 850000), sale("s2", 890000), sale("s3", 920000), sale("s4", 960000)];

const world = (opts = {}) => new PriceWorld({ now: NOW, agent: AGENT, sales: FOUR(), ...opts });
const drive = (build, w) => build(w.ports(), { vendor: "Jordan Lee (vendor)" });
const describe = (w) =>
  `${w.calls.length} port call(s); ${w.drafts.length} draft(s); ${w.releases.length} release(s); ${w.records.length} record(s); last range ${JSON.stringify(w.lastDraft?.range ?? null)}`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const firstIndex = (w, pred) => w.calls.findIndex(pred);
const ids = (d) => (d?.comparables ?? []).map((c) => c.saleId);

export const scenarios = [
  {
    checkId: "subject-from-the-record",
    // A subject with no land size on its record, and a sale whose land size is far off:
    // with the land rule not applied it stays a comparable; a guessed land size would drop it.
    world: () =>
      world({
        subject: { address: "14 Banksia Street, Paddington NSW 2021", type: "house", beds: 3 },
        sales: [...FOUR(), sale("s5", 900000, { landSqm: 2000 })],
      }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d) return false;
      const readSubject = w.calls.some((c) => c.port === "read_sales" && c.request?.subject === true);
      return (
        readSubject &&
        d.subject.landSqm === undefined &&
        d.rulesNotApplied.includes("land") &&
        !d.excluded.some((e) => e.rule === "land") &&
        ids(d).includes("s5") &&
        d.subject.address === w.subject.address &&
        d.subject.type === w.subject.type &&
        d.subject.beds === w.subject.beds
      );
    },
    describe,
  },
  {
    checkId: "rules-stated-first",
    // A non-default rule set on file, so a build that prints its own defaults fails.
    world: () => world({ rules: { maxDistanceKm: 1.5, maxAgeMonths: 4, minCount: 3, freshnessDays: 5 } }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d) return false;
      const rulesAt = firstIndex(w, (c) => c.port === "read_rule");
      const salesAt = firstIndex(w, (c) => c.port === "read_sales" && c.request?.pool === true);
      return rulesAt >= 0 && salesAt >= 0 && rulesAt < salesAt && same(d.rules, w.rules);
    },
    describe,
  },
  {
    checkId: "comparables-meet-every-rule",
    // Four rule-breakers priced close to the clean sales, beside the four that meet every rule.
    world: () =>
      world({
        sales: [
          ...FOUR(),
          sale("far", 905000, { distanceKm: 4.2 }),
          sale("old", 905000, { soldOn: "2025-11-01" }),
          sale("unit", 905000, { type: "unit" }),
          sale("beds", 905000, { beds: 5 }),
        ],
      }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      const sel = w.selections[w.selections.length - 1];
      if (!d || !sel) return false;
      const want = { far: "distance", old: "recency", unit: "type", beds: "beds" };
      const breakersOut = Object.keys(want).every((id) => !ids(d).includes(id) && !sel.comparables.includes(id));
      const reported = Object.entries(want).every(([id, rule]) => d.excluded.some((e) => e.saleId === id && e.rule === rule));
      const everyShownMeets = ids(d).every((id) => {
        const s = w.saleById(id);
        return Boolean(s) && w.ruleBroken(s) === null;
      });
      return breakersOut && reported && everyShownMeets && same([...ids(d)].sort(), ["s1", "s2", "s3", "s4"]);
    },
    describe,
  },
  {
    checkId: "source-and-date-on-each",
    world: () =>
      world({
        sales: [...FOUR(), sale("nosrc", 900000, { source: undefined }), sale("nodate", 900000, { soldOn: undefined })],
      }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d || d.comparables.length === 0) return false;
      const complete = d.comparables.every((c) => Boolean(c.source) && Boolean(c.soldOn) && Boolean(c.readAt));
      const cited = d.comparables.every((c) =>
        w.citations.some((x) => x.saleId === c.saleId && x.source === c.source && x.soldOn === c.soldOn && x.readAt === c.readAt),
      );
      const matchSource = d.comparables.every((c) => {
        const s = w.saleById(c.saleId);
        return Boolean(s) && s.source === c.source && s.soldOn === c.soldOn && c.readAt === w.readDate;
      });
      const offPage = !ids(d).includes("nosrc") && !ids(d).includes("nodate");
      return complete && cited && matchSource && offPage;
    },
    describe,
  },
  {
    checkId: "withheld-price-not-used",
    // Extreme figures on the withheld and unverified sales, so using either moves the range.
    world: () =>
      world({
        sales: [
          ...FOUR(),
          sale("held", 1500000, { priceStatus: "withheld" }),
          sale("unver", 600000, { priceStatus: "unverified" }),
        ],
      }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      const expected = w.expectedRange();
      if (!d || !d.range || !expected) return false;
      const notInArithmetic = !ids(d).includes("held") && !ids(d).includes("unver");
      const marked = d.listedNotUsed.every((l) => {
        const s = w.saleById(l.saleId);
        return Boolean(s) && s.priceStatus === l.status;
      });
      const listedOk = ["held", "unver"].every((id) => !d.listedNotUsed.some((l) => l.saleId === id) || marked);
      return notInArithmetic && listedOk && same(d.range, expected) && d.range.low === 850000 && d.range.high === 960000;
    },
    describe,
  },
  {
    checkId: "too-few-says-so",
    // Two verified comparables against a minimum of three, and a third sale just outside the
    // distance rule that a quietly widened rule would pull in.
    world: () => world({ sales: [sale("s1", 850000), sale("s2", 890000), sale("near", 900000, { distanceKm: 2.6 })] }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d) return false;
      return (
        d.range === null &&
        d.tooFew?.found === 2 &&
        d.tooFew?.needed === 3 &&
        same(d.rules, w.rules) &&
        !ids(d).includes("near") &&
        d.excluded.some((e) => e.saleId === "near" && e.rule === "distance")
      );
    },
    describe,
  },
  {
    checkId: "range-from-the-comparables",
    // An agent estimate and quote well above the evidence, so a range nudged toward them fails.
    world: () => world({ agentEstimate: { low: 1000000, high: 1050000 }, quoted: 1000000 }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d || !d.range) return false;
      return same(d.range, w.expectedRange()) && same(d.range, { low: 850000, median: 905000, high: 960000 });
    },
    describe,
  },
  {
    checkId: "agent-estimate-separate",
    world: () => world({ agentEstimate: { low: 1150000, high: 1250000 } }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d || !d.range || !d.agentEstimate) return false;
      const readAppraisal = w.calls.some((c) => c.port === "read_file");
      return (
        readAppraisal &&
        d.agentEstimate.agent === AGENT &&
        d.agentEstimate.low === 1150000 &&
        d.agentEstimate.high === 1250000 &&
        same(d.range, w.expectedRange()) &&
        !d.comparables.some((c) => c.price === 1150000 || c.price === 1250000)
      );
    },
    describe,
  },
  {
    checkId: "underquote-flagged-to-agent",
    // The agent intends to quote from 800,000, below the lowest comparable at 850,000.
    world: () => world({ agentEstimate: { low: 800000, high: 880000 }, quoted: 800000 }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d) return false;
      const n = w.notifications.find((x) => x.version === d.version && x.reason === "underquote");
      if (!n) return false;
      const above = w.expectedComparables().filter((s) => s.price > 800000).map((s) => s.id).sort();
      const held = w.holds.some((h) => h.version === d.version);
      const nothingWent = w.releases.length === 0 && w.refusedReleases.length === 0 && w.records.length === 0;
      const notifiedAt = firstIndex(w, (c) => c.port === "notify" && c.request?.reason === "underquote");
      const firstRelease = firstIndex(w, (c) => c.port === "publish_report");
      return same([...n.saleIds].sort(), above) && held && nothingWent && notifiedAt >= 0 && firstRelease === -1;
    },
    describe,
  },
  {
    checkId: "stale-data-held",
    // The last read of the sales was 20 days ago against a 7-day window.
    world: () => world({ lastReadAt: new Date(NOW.getTime() - 20 * DAY) }),
    drive,
    holds: (w) => {
      const d = w.lastDraft;
      if (!d) return false;
      const oldRead = new Date(NOW.getTime() - 20 * DAY).toISOString();
      const refreshedAt = firstIndex(w, (c) => c.port === "read_sales" && c.request?.refresh === true);
      const draftedAt = firstIndex(w, (c) => c.port === "write_file");
      const readAgain = refreshedAt >= 0 && refreshedAt < draftedAt && d.readAt === w.readDate && d.readAt !== oldRead && d.stale === false;
      const heldStale = d.stale === true && d.readAt === oldRead && w.holds.some((h) => h.version === d.version) && w.releases.length === 0;
      const pageDates = d.comparables.every((c) => c.readAt === d.readAt);
      return (readAgain || heldStale) && pageDates;
    },
    describe,
  },
  {
    checkId: "agent-approves-first",
    // Version 1 is approved and may go. The agent then edits their estimate, the page is
    // rebuilt as version 2, and the agent has not approved it.
    world: () => world({ agentEstimate: { low: 900000, high: 950000 }, agentAnswers: ["approve", "none"] }),
    drive: async (build, w) => {
      await drive(build, w);
      w.advance(DAY);
      w.agentEstimate = { low: 920000, high: 980000 }; // the agent's edit, on the appraisal file
      await drive(build, w);
    },
    holds: (w) => {
      if (w.drafts.length < 2) return false;
      const [v1, v2] = [w.drafts[0].version, w.drafts[1].version];
      const v1Went = w.releases.some((r) => r.version === v1);
      const v2Stayed = !w.releases.some((r) => r.version === v2) && !w.refusedReleases.some((r) => r.version === v2);
      const v2Asked = w.approvals.some((a) => a.version === v2);
      const everyReleaseApproved = w.releases.every((r) => w.approvals.some((a) => a.version === r.version && a.approved === true && a.by === AGENT));
      const askedBeforeRelease = w.releases.every((r) => {
        const asked = firstIndex(w, (c) => c.port === "gate" && c.request?.approval === r.version);
        const sent = firstIndex(w, (c) => c.port === "publish_report" && c.request?.version === r.version);
        return asked >= 0 && asked < sent;
      });
      return v1 !== v2 && v1Went && v2Asked && v2Stayed && everyReleaseApproved && askedBeforeRelease && w.refusedReleases.length === 0;
    },
    describe,
  },
  {
    checkId: "record-of-what-was-shown",
    // Version 1 released; then one sale is corrected at the source and the page rebuilt
    // and released again as version 2.
    world: () => world({ agentEstimate: { low: 900000, high: 950000 } }),
    drive: async (build, w) => {
      await drive(build, w);
      w.firstRecordSnapshot = JSON.stringify(w.records[0] ?? null);
      w.advance(3 * DAY);
      const s4 = w.saleById("s4");
      if (s4) s4.price = 975000; // corrected at the source
      await drive(build, w);
    },
    holds: (w) => {
      if (w.records.length !== 2 || w.drafts.length !== 2) return false;
      const [r1, r2] = w.records;
      const matches = (r) => {
        const d = w.drafts.find((x) => x.version === r.version);
        return (
          Boolean(d) &&
          same(r.comparables, d.comparables) &&
          same(r.range, d.range) &&
          same(r.agentEstimate ?? null, d.agentEstimate ?? null) &&
          r.approvedBy === AGENT &&
          w.releases.some((x) => x.version === r.version && x.to === r.releasedTo)
        );
      };
      const byPropertyAndDate = (property, day) => w.records.filter((r) => r.property === property && r.releasedOn.slice(0, 10) === day);
      const r1Found = byPropertyAndDate(w.subject.address, "2026-10-24");
      const r2Found = byPropertyAndDate(w.subject.address, "2026-10-27");
      return (
        r1.version !== r2.version &&
        matches(r1) &&
        matches(r2) &&
        JSON.stringify(r1) === w.firstRecordSnapshot &&
        r1.range?.high === 960000 &&
        r2.range?.high === 975000 &&
        r1Found.length === 1 &&
        r1Found[0].version === r1.version &&
        r2Found.length === 1 &&
        r2Found[0].version === r2.version
      );
    },
    describe,
  },
];

// The pass test needs live sales and a durable record outside this machine. On the
// stub the runner reports it with_us and never calls this. It is quoted as a scoped
// build, so it is not hand-rolled here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive,
    holds: () => false,
    describe,
  },
];

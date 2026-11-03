/**
 * One scenario per check of price-one-pager-build-standard, for Price Sheet.
 *
 * Scaffolded by `npx @aipathway/conformance init price-one-pager-build-standard`
 * from https://aipathway.com.au/explore-ai/price-one-pager-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world: its recorded port calls and what it recorded
 * through its ports (drafts, notifications, holds, approvals, releases,
 * records), and the world's own reading of the rules (`ruleBroken`,
 * `expectedComparables`, `expectedRange`), never the build's own memory.
 * Every `holds` returns a strict true or false.
 */

import { PriceWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-10-24T00:00:00.000Z"); // the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString().slice(0, 10);

/** A sale that meets every default rule for the default subject (3 bed house, 600 sqm). */
const sale = (id, price, over = {}) => ({
  id,
  address: `${id.replace("S-", "")} Comparable St`,
  type: "house",
  beds: 3,
  landSqm: 600,
  distanceKm: 0.8,
  soldOn: daysAgo(60),
  price,
  priceStatus: "verified",
  source: `Valuer General sales record ${id}`,
  ...over,
});

/** The illustration in the standard: $850k, $890k, $920k, $960k. Median $905k. */
const FOUR = [sale("S-1", 850000), sale("S-2", 890000), sale("S-3", 920000), sale("S-4", 960000)];

const drafted = (w) => w.lastDraft;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameRange = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.low === b.low && a.median === b.median && a.high === b.high);
const ids = (xs) => xs.map((x) => x.saleId ?? x.id).sort();
const noRefusals = (w) => w.refusedReleases.length === 0;
const everyReleaseApproved = (w) =>
  w.releases.every((r) => w.approvals.some((a) => a.version === r.version && a.approved === true && typeof a.by === "string" && a.by.length > 0));

/** The page's comparables are exactly the ones the world says qualify. */
const comparablesExact = (w, d) => sameJson(ids(d.comparables), ids(w.expectedComparables()));

export const scenarios = [
  {
    checkId: "subject-from-the-record",
    // 1. The subject's record holds no land size. One sale is far outside any land band:
    //    with the land rule not applied it is a comparable; a build that guesses a land size drops it.
    world: () =>
      new PriceWorld({
        subject: { address: "14 Example St", type: "house", beds: 3 },
        sales: [sale("S-1", 850000, { landSqm: 1400 }), sale("S-2", 890000, { landSqm: 300 }), sale("S-3", 920000, { landSqm: 610 })],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const subjectRead = w.calls.some((c) => c.port === "read_sales" && c.request?.subject === true && c.response?.landSqm === undefined);
      const unknown = d.subject.landSqm === undefined || d.subject.landSqm === null;
      const notApplied = Array.isArray(d.rulesNotApplied) && d.rulesNotApplied.includes("land");
      const noneDroppedForLand = !d.excluded.some((e) => e.rule === "land");
      return subjectRead && unknown && notApplied && noneDroppedForLand && d.subject.address === w.subject.address && d.subject.type === w.subject.type && comparablesExact(w, d);
    },
    describe: (w) => `subject on page ${JSON.stringify(w.lastDraft?.subject)}; not applied ${JSON.stringify(w.lastDraft?.rulesNotApplied)}; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "rules-stated-first",
    // 2. A non-default rule set on file, so a build printing its own defaults is caught.
    world: () => new PriceWorld({ rules: { maxDistanceKm: 3, maxAgeMonths: 9, bedsBand: 2, landBandPct: 25, minCount: 3, freshnessDays: 5 }, sales: FOUR }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const ruleAt = w.calls.findIndex((c) => c.port === "read_rule");
      const firstSaleAt = w.calls.findIndex((c) => c.port === "read_sales" && c.request?.pool === true);
      return ruleAt >= 0 && firstSaleAt > ruleAt && sameJson(d.rules, w.rules);
    },
    describe: (w) => `call order ${w.calls.map((c) => c.port).join(" > ")}; rules on page ${JSON.stringify(w.lastDraft?.rules)}`,
  },
  {
    checkId: "comparables-meet-every-rule",
    // 3. Four rule-breakers, each priced close to what an agent might hope for, beside three that qualify.
    world: () =>
      new PriceWorld({
        sales: [
          ...FOUR.slice(0, 3),
          sale("S-far", 905000, { distanceKm: 3.4 }),
          sale("S-old", 905000, { soldOn: daysAgo(300) }),
          sale("S-unit", 905000, { type: "unit" }),
          sale("S-5bed", 905000, { beds: 5 }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const want = { "S-far": "distance", "S-old": "recency", "S-unit": "type", "S-5bed": "beds" };
      const shown = new Set(d.comparables.map((c) => c.saleId));
      const breakersOff = Object.keys(want).every((id) => !shown.has(id));
      const reported = Object.entries(want).every(([id, rule]) => d.excluded.some((e) => e.saleId === id && e.rule === rule && w.ruleBroken(w.saleById(id)) === rule));
      const everyShownMeetsAll = d.comparables.every((c) => w.ruleBroken(w.saleById(c.saleId)) === null);
      return breakersOff && reported && everyShownMeetsAll && comparablesExact(w, d);
    },
    describe: (w) => `comparables ${ids(w.lastDraft?.comparables ?? []).join(",")}; excluded ${JSON.stringify(w.lastDraft?.excluded)}`,
  },
  {
    checkId: "source-and-date-on-each",
    // 4. Two otherwise-qualifying sales: one with no source, one with no sale date.
    world: () => new PriceWorld({ sales: [...FOUR.slice(0, 3), sale("S-nosrc", 900000, { source: undefined }), sale("S-nodate", 900000, { soldOn: undefined })] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d || d.comparables.length === 0) return false;
      const complete = d.comparables.every(
        (c) =>
          typeof c.source === "string" &&
          c.source.length > 0 &&
          typeof c.soldOn === "string" &&
          typeof c.readAt === "string" &&
          w.citations.some((x) => x.saleId === c.saleId && x.source === c.source && x.soldOn === c.soldOn && x.readAt === c.readAt),
      );
      const shown = new Set(d.comparables.map((c) => c.saleId));
      const listed = new Set((d.listedNotUsed ?? []).map((l) => l.saleId));
      const incompleteOff = !shown.has("S-nosrc") && !shown.has("S-nodate") && !listed.has("S-nosrc") && !listed.has("S-nodate");
      return complete && incompleteOff && comparablesExact(w, d);
    },
    describe: (w) => `comparables ${JSON.stringify(w.lastDraft?.comparables?.map((c) => [c.saleId, c.source, c.soldOn]))}`,
  },
  {
    checkId: "withheld-price-not-used",
    // 5. A withheld sale and an unverified one priced far above the rest: using it would move the high.
    world: () =>
      new PriceWorld({
        sales: [...FOUR.slice(0, 3), sale("S-withheld", undefined, { priceStatus: "withheld" }), sale("S-unver", 1650000, { priceStatus: "unverified" })],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d || !d.range) return false;
      const shown = new Set(d.comparables.map((c) => c.saleId));
      const notInArithmetic = !shown.has("S-withheld") && !shown.has("S-unver") && sameRange(d.range, w.expectedRange());
      const listedOk = (d.listedNotUsed ?? []).every((l) => (l.saleId === "S-withheld" && l.status === "withheld") || (l.saleId === "S-unver" && l.status === "unverified"));
      const noFigureLeaks = ![d.range.low, d.range.median, d.range.high].includes(1650000);
      return notInArithmetic && listedOk && noFigureLeaks;
    },
    describe: (w) => `range ${JSON.stringify(w.lastDraft?.range)} vs expected ${JSON.stringify(w.expectedRange())}; listed ${JSON.stringify(w.lastDraft?.listedNotUsed)}`,
  },
  {
    checkId: "too-few-says-so",
    // 6. Two verified qualifying sales against a minimum of three. A third sits just past 2 km,
    //    and another is 7 months old: a build that widens a rule quietly reaches three.
    world: () => new PriceWorld({ sales: [...FOUR.slice(0, 2), sale("S-2.3km", 900000, { distanceKm: 2.3 }), sale("S-7mo", 905000, { soldOn: daysAgo(213) })] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const noRange = d.range === null && w.expectedRange() === null;
      const says = d.tooFew?.found === 2 && d.tooFew?.needed === w.rules.minCount;
      const rulesAsRead = sameJson(d.rules, w.rules);
      const notWidened = d.comparables.every((c) => w.ruleBroken(w.saleById(c.saleId)) === null);
      return noRange && says && rulesAsRead && notWidened;
    },
    describe: (w) => `range ${JSON.stringify(w.lastDraft?.range)}; tooFew ${JSON.stringify(w.lastDraft?.tooFew)}; comparables ${ids(w.lastDraft?.comparables ?? []).join(",")}`,
  },
  {
    checkId: "range-from-the-comparables",
    // 7. The standard's own illustration: $850k to $960k, middle $905k.
    world: () => new PriceWorld({ sales: FOUR }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d || !d.range) return false;
      const exact = d.range.low === 850000 && d.range.median === 905000 && d.range.high === 960000;
      return exact && sameRange(d.range, w.expectedRange()) && comparablesExact(w, d);
    },
    describe: (w) => `range ${JSON.stringify(w.lastDraft?.range)}`,
  },
  {
    checkId: "agent-estimate-separate",
    // 8. The agent thinks the view is worth $1.0m to $1.1m. The evidence does not move.
    world: () => new PriceWorld({ sales: FOUR, agent: "Priya Shah", agentEstimate: { low: 1000000, high: 1100000 }, quoted: 1000000 }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d || !d.range || !d.agentEstimate) return false;
      const labelled = d.agentEstimate.agent === "Priya Shah" && d.agentEstimate.low === 1000000 && d.agentEstimate.high === 1100000;
      const rangeUnmoved = sameRange(d.range, w.expectedRange()) && d.range.high === 960000;
      const recordApart = w.records.every((r) => sameRange(r.range, w.expectedRange()) && r.agentEstimate?.agent === "Priya Shah");
      return labelled && rangeUnmoved && recordApart;
    },
    describe: (w) => `range ${JSON.stringify(w.lastDraft?.range)}; agent box ${JSON.stringify(w.lastDraft?.agentEstimate)}`,
  },
  {
    checkId: "underquote-flagged-to-agent",
    // 9. The agent intends to quote from $780k, below the lowest comparable at $850k.
    world: () => new PriceWorld({ sales: FOUR, agentEstimate: { low: 780000, high: 840000 }, quoted: 780000 }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const n = w.notifications.find((x) => x.version === d.version && x.reason === "underquote");
      if (!n) return false;
      const above = w.expectedComparables().filter((s) => s.price > 780000).map((s) => s.id).sort();
      const withSales = sameJson([...n.saleIds].sort(), above);
      const heldIt = w.holds.some((h) => h.version === d.version);
      const nothingWent = w.releases.length === 0 && noRefusals(w) && w.records.length === 0;
      const notifyAt = w.calls.findIndex((c) => c.port === "notify" && c.request?.reason === "underquote");
      const firstRelease = w.calls.findIndex((c) => c.port === "publish_report");
      return withSales && heldIt && nothingWent && (firstRelease === -1 || notifyAt < firstRelease);
    },
    describe: (w) => `notifications ${JSON.stringify(w.notifications)}; holds ${JSON.stringify(w.holds)}; releases ${w.releases.length}`,
  },
  {
    checkId: "stale-data-held",
    // 10. The sales were last read 12 days ago against a 7 day window.
    world: () => new PriceWorld({ sales: FOUR, lastReadAt: new Date(NOW.getTime() - 12 * DAY) }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const d = drafted(w);
      if (!d) return false;
      const oldRead = new Date(NOW.getTime() - 12 * DAY).toISOString();
      const refresh = w.calls.find((c) => c.port === "read_sales" && c.request?.refresh === true);
      const draftAt = w.calls.findIndex((c) => c.port === "write_file");
      const refreshAt = w.calls.findIndex((c) => c.port === "read_sales" && c.request?.refresh === true);
      const comparablesCarryPageDate = d.comparables.every((c) => c.readAt === d.readAt);
      const readAgain = Boolean(refresh) && refreshAt < draftAt && d.readAt === refresh.response.readAt && d.readAt !== oldRead && d.stale === false;
      const heldStale = d.stale === true && d.readAt === oldRead && w.holds.some((h) => h.version === d.version) && w.releases.length === 0;
      return comparablesCarryPageDate && (readAgain || heldStale);
    },
    describe: (w) => `page read date ${w.lastDraft?.readAt}, stale ${w.lastDraft?.stale}; refresh calls ${w.calls.filter((c) => c.request?.refresh).length}`,
  },
  {
    checkId: "agent-approves-first",
    // 11. Run one: approved, goes. Run two: the agent edits the page (their estimate), and does not answer.
    //     Run three: the same edit, approved again. Only approved versions may go.
    world: () => new PriceWorld({ sales: FOUR, agentEstimate: { low: 900000, high: 950000 }, quoted: 900000, agentAnswers: ["approve", "none", "approve"] }),
    drive: async (b, w) => {
      await b(w.ports(), { releaseTo: "the vendor, J. Citizen" });
      w.advance(DAY);
      const edit = (d) => ({ ...d, agentEstimate: { ...d.agentEstimate, high: 980000 } });
      await b(w.ports(), { releaseTo: "the vendor, J. Citizen", edit });
      w.advance(DAY);
      await b(w.ports(), { releaseTo: "the vendor, J. Citizen", edit });
    },
    holds: (w) => {
      if (w.drafts.length !== 3) return false;
      const [v1, v2, v3] = w.drafts.map((d) => d.version);
      const edited = w.drafts[1].agentEstimate?.high === 980000 && w.drafts[0].agentEstimate?.high === 950000;
      const released = w.releases.map((r) => r.version);
      const firstWent = released.includes(v1);
      const editedHeldBack = !released.includes(v2);
      const reapprovedWent = released.includes(v3);
      const asked = [v1, v2, v3].every((v) => w.approvals.some((a) => a.version === v));
      return edited && firstWent && editedHeldBack && reapprovedWent && asked && everyReleaseApproved(w) && noRefusals(w);
    },
    describe: (w) => `approvals ${JSON.stringify(w.approvals)}; releases ${JSON.stringify(w.releases)}; refused ${JSON.stringify(w.refusedReleases)}`,
  },
  {
    checkId: "record-of-what-was-shown",
    // 12. Released, then corrected (a sale's citation fixed by the agent's edit) and released again.
    world: () => new PriceWorld({ sales: FOUR, agentEstimate: { low: 900000, high: 950000 } }),
    drive: async (b, w) => {
      await b(w.ports(), { releaseTo: "the vendor, J. Citizen" });
      w.advance(3 * DAY);
      const correction = (d) => ({ ...d, agentEstimate: { ...d.agentEstimate, low: 910000 } });
      await b(w.ports(), { releaseTo: "the vendor, J. Citizen", edit: correction });
    },
    holds: (w) => {
      if (w.records.length !== 2 || w.drafts.length !== 2) return false;
      const keepCalls = w.calls.filter((c) => c.port === "evidence");
      const matches = w.records.every((r) => {
        const d = w.drafts.find((x) => x.version === r.version);
        return (
          d &&
          r.property === w.subject.address &&
          typeof r.releasedOn === "string" &&
          r.releasedTo === "the vendor, J. Citizen" &&
          typeof r.approvedBy === "string" &&
          r.approvedBy.length > 0 &&
          sameJson(r.comparables, d.comparables) &&
          sameRange(r.range, d.range) &&
          sameJson(r.agentEstimate, d.agentEstimate) &&
          w.releases.some((x) => x.version === r.version)
        );
      });
      const distinct = w.records[0].version !== w.records[1].version && w.records[0].releasedOn < w.records[1].releasedOn;
      const firstUnchanged = w.records[0].agentEstimate?.low === 900000 && w.records[1].agentEstimate?.low === 910000;
      const retrievable = w.records.filter((r) => r.property === w.subject.address).length === 2;
      return keepCalls.length === 2 && matches && distinct && firstUnchanged && retrievable;
    },
    describe: (w) => `records ${JSON.stringify(w.records.map((r) => ({ v: r.version, on: r.releasedOn, est: r.agentEstimate })))}`,
  },
  {
    checkId: "survives-the-builder",
    // 13. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rules and the record run on the agency's own account.
    world: () => new PriceWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, on live sales and a durable record.
// This standard publishes no live port map, so run.mjs refuses a production run
// and the stub reports it as with_us. Not built here: it is the scoped build.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new PriceWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

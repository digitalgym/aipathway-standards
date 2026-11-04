/**
 * One scenario per check of quote-out-build-standard, for Tier Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Tier Quote is
 * woken by a named event, so every drive hands the build `job.created` (or
 * `job.updated`) keyed by the job id.
 *
 * The world is an Australian plumbing business. Its price list (cents ex GST)
 * sells hot water units, taps and labour. Its tier map says which catalogue
 * lines make each option for each kind of work: a hot water replacement is
 * quoted Good (electric storage), Better (gas continuous flow) and Best (heat
 * pump). Every check also asserts the rule this node adds: one quote per job,
 * its options exactly the tier map's rows, in the tier map's order, under the
 * tier map's labels, every line at the book's rate.
 *
 * Checks a stub cannot pass are in `liveScenarios`; on the stub the runner
 * reports them as `with_us`.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** The fixed list a park reason must come from (section 4 plus the options checks). */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable", "no_tier_map", "too_many_options"];

/** The business's own price list, cents ex GST. The only source of a rate. */
export const BOOK = [
  { catalogueId: "HW-ELEC-250", description: "Electric storage hot water 250L, supply", rate: 145000 },
  { catalogueId: "HW-GAS-CF26", description: "Gas continuous flow 26L, supply", rate: 189000 },
  { catalogueId: "HW-HP-270", description: "Heat pump hot water 270L, supply", rate: 349000 },
  { catalogueId: "LAB-HW-INST", description: "Hot water install labour, standard changeover", rate: 66000 },
  { catalogueId: "HW-TEMPV", description: "Tempering valve, supply and fit", rate: 18500 },
  { catalogueId: "HW-DISP", description: "Old unit removal and disposal", rate: 9500 },
  { catalogueId: "TAP-MIX-STD", description: "Kitchen mixer tap, standard chrome, supply", rate: 21000 },
  { catalogueId: "TAP-MIX-PREM", description: "Kitchen mixer tap, pull-out brushed, supply", rate: 48000 },
  { catalogueId: "LAB-TAP", description: "Tap replacement labour", rate: 16500 },
  { catalogueId: "LAB-DRAIN-CLR", description: "Blocked drain clear, high-pressure jetter", rate: 38000 },
];
const RATES = new Set(BOOK.map((i) => i.rate));
const bookItem = (id) => BOOK.find((b) => b.catalogueId === id);

const HOT_WATER = [
  { key: "hot-water-replace", label: "Good", catalogueIds: ["HW-ELEC-250", "LAB-HW-INST", "HW-TEMPV"] },
  { key: "hot-water-replace", label: "Better", catalogueIds: ["HW-GAS-CF26", "LAB-HW-INST", "HW-TEMPV", "HW-DISP"] },
  { key: "hot-water-replace", label: "Best", catalogueIds: ["HW-HP-270", "LAB-HW-INST", "HW-TEMPV", "HW-DISP"] },
];
const TAPS = [
  { key: "tap-replace", label: "Standard", catalogueIds: ["TAP-MIX-STD", "LAB-TAP"] },
  { key: "tap-replace", label: "Premium", catalogueIds: ["TAP-MIX-PREM", "LAB-TAP"] },
];
const DRAINS = [
  { key: "drain-clear", label: "Clear only", catalogueIds: ["LAB-DRAIN-CLR"] },
  { key: "drain-clear", label: "Clear and camera", catalogueIds: ["LAB-DRAIN-CLR", "DRAIN-CCTV"] },
];
const TIER_MAP = [...HOT_WATER, ...TAPS, ...DRAINS];

/** Check 13's tier map: the business's own labels, dearest first. */
const RENAMED_ROWS = [
  { label: "Top shelf", catalogueIds: ["HW-HP-270", "LAB-HW-INST", "HW-TEMPV", "HW-DISP"] },
  { label: "Mid range", catalogueIds: ["HW-GAS-CF26", "LAB-HW-INST", "HW-TEMPV", "HW-DISP"] },
  { label: "Budget", catalogueIds: ["HW-ELEC-250", "LAB-HW-INST"] },
];
const RENAMED = RENAMED_ROWS.map((r) => ({ key: "hot-water-replace", ...r }));

const hw = (id, source = "call", extra = {}) => ({ id, source, wants: ["hot water replacement"], optionsFrom: "hot-water-replace", ...extra });
const jobCreated = (job_id) => ({ name: "job.created", job_id });
const jobUpdated = (job_id) => ({ name: "job.updated", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const updates = (world) => calls(world, "draft_quote").filter((c) => "update" in (c.request ?? {}));
const bookReads = (world) => calls(world, "read_pricebook").filter((c) => !("tierMap" in (c.request ?? {})));
const tierReads = (world) => calls(world, "read_pricebook").filter((c) => "tierMap" in (c.request ?? {}));
const ALLOWED_PORTS = new Set(["read_job", "read_pricebook", "draft_quote", "escalate", "notify"]);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is from the book: a real catalogue id, that item's own description and rate. */
const fromBook = (l) => {
  const item = bookItem(l?.catalogueId);
  return Boolean(item) && l.rate === item.rate && l.description === item.description;
};

/** The options are exactly these tier map rows: same labels, same order, same ids, book rates, book totals. */
function optionsAre(options, rules) {
  if (!Array.isArray(options) || options.length !== rules.length) return false;
  return rules.every((r, i) => {
    const o = options[i];
    if (!o || o.label !== r.label || !Array.isArray(o.lines) || o.lines.length !== r.catalogueIds.length) return false;
    if (!o.lines.every((l, j) => l.catalogueId === r.catalogueIds[j] && fromBook(l))) return false;
    if ("total" in o && o.total !== r.catalogueIds.reduce((s, id) => s + bookItem(id).rate, 0)) return false;
    return true;
  });
}

/** Every number in an escalation is a rate from the book, no unmatched line carries one, and no total. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    const d = e.detail ? JSON.parse(e.detail) : {};
    for (const o of d.options ?? []) for (const l of o.lines ?? []) if (!RATES.has(l.rate) || !fromBook(l)) return false;
    for (const u of d.unmatched ?? []) if ("rate" in u || "unit_rate" in u || "amount" in u) return false;
    if (d.total_ex_gst !== undefined && d.total_ex_gst !== null) return false;
  }
  for (const c of calls(world, "draft_quote")) {
    for (const l of c.request?.lines ?? []) if (!RATES.has(l.rate)) return false;
    for (const o of c.request?.options ?? []) for (const l of o.lines ?? []) if (!RATES.has(l.rate)) return false;
  }
  return true;
}
const parseDetail = (e) => (e?.detail ? JSON.parse(e.detail) : {});

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject: a job created by an after-hours call, and a second from an overnight web form.
    // Assert: each draft is preceded by a read of its job and carries that job's id.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T101", "call"), hw("JOB-T102", "form")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      // A raw call carrying a job id must not produce anything.
      await build(world.ports(), { name: "call.received", call_id: "CALL-1", job_id: "JOB-T101" });
      world.callsAfterRawCall = world.calls.length;
      await build(world.ports(), jobCreated("JOB-T101"));
      await build(world.ports(), jobCreated("JOB-T102"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2 || world.callsAfterRawCall !== 0) return false;
      const readFirst = drafts.every((d) => {
        const at = world.calls.indexOf(d);
        return world.calls.slice(0, at).some((c) => c.port === "read_job" && c.request?.jobId === d.request.jobId && c.response?.id === d.request.jobId);
      });
      return readFirst && drafts[0].request.jobId === "JOB-T101" && drafts[1].request.jobId === "JOB-T102" && drafts.every((d) => optionsAre(d.request.options, HOT_WATER));
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject: a tap job whose two options map cleanly to three catalogue items.
    // Assert: a read of the price list precedes the draft, every line carries its catalogue id and the book's rate.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T201", source: "form", wants: ["kitchen tap"], optionsFrom: "tap-replace" }], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T201"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const draftAt = world.calls.indexOf(drafts[0]);
      const readAt = world.calls.indexOf(bookReads(world)[0]);
      const ids = new Set(drafts[0].request.options.flatMap((o) => o.lines.map((l) => l.catalogueId)));
      return readAt >= 0 && readAt < draftAt && ids.size === 3 && optionsAre(drafts[0].request.options, TAPS) && noInventedRate(world);
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject: a drain job needing one catalogue item and one thing (a camera inspection) the book does not cover.
    // Assert: no draft; an escalate carries a fixed-list reason and the unmatched line; no invented rate anywhere.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T301", source: "call", wants: ["blocked drain"], optionsFrom: "drain-clear" }], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T301"));
    },
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      if (world.escalations.length !== 1) return false;
      const e = world.escalations[0];
      const d = parseDetail(e);
      const priced = (d.options ?? []).flatMap((o) => o.lines ?? []);
      return (
        e.reason === "not_in_pricebook" &&
        PARK_REASONS.includes(e.reason) &&
        (d.unmatched ?? []).length === 1 &&
        d.unmatched[0].catalogue_id === "DRAIN-CCTV" &&
        d.unmatched[0].option === "Clear and camera" &&
        priced.length === 2 &&
        priced.every((l) => l.catalogueId === "LAB-DRAIN-CLR" && fromBook(l)) &&
        d.total_ex_gst === null &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject: a job flagged as a variation to an accepted quote, then one carrying a discount request.
    // Assert: both escalate with a typed reason; neither produces a draft.
    world: () =>
      new QuoteWorld({
        jobs: [hw("JOB-T401", "call", { isVariation: true }), hw("JOB-T402", "form", { wantsDiscount: true })],
        pricebook: BOOK,
        tierMap: TIER_MAP,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobUpdated("JOB-T401"));
      await build(world.ports(), jobCreated("JOB-T402"));
    },
    holds: (world) =>
      calls(world, "draft_quote").length === 0 &&
      world.quotes.length === 0 &&
      world.escalations.length === 2 &&
      world.escalations[0].reason === "variation_to_accepted_quote" &&
      parseDetail(world.escalations[0]).job_id === "JOB-T401" &&
      world.escalations[1].reason === "discount_requested" &&
      parseDetail(world.escalations[1]).job_id === "JOB-T402",
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject: the same job reaching the standard twice, from the call and then the follow-up email.
    // Assert: exactly one quote; the second pass kept it with duplicate_of.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T501", "call")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T501"));
      world.advance(4 * 60 * 1000);
      world.second = await build(world.ports(), jobUpdated("JOB-T501"));
    },
    holds: (world) => {
      const q = world.quotes;
      return (
        q.length === 1 &&
        creates(world).length === 1 &&
        updates(world).length === 1 &&
        updates(world)[0].request.update === q[0].id &&
        q[0].duplicateOf === q[0].id &&
        q[0].updates === 1 &&
        world.second?.outcome === "kept" &&
        world.second?.duplicate_of === q[0].id
      );
    },
    describe,
  },
  {
    checkId: "draft-quote-verified",
    // 6. The write is verified
    // Inject: the stub returns a null external_id on the quote write.
    // Assert: a notify follows the failed write; the job is not reported as quoted.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T601", "call")], pricebook: BOOK, tierMap: TIER_MAP, failNextWrite: true }),
    drive: async (build, world) => {
      world.result = await build(world.ports(), jobCreated("JOB-T601"));
    },
    holds: (world) => {
      const writes = calls(world, "draft_quote");
      if (writes.length !== 1 || writes[0].response?.id !== null) return false;
      const writeAt = world.calls.indexOf(writes[0]);
      const after = world.calls.slice(writeAt + 1);
      return (
        after.some((c) => c.port === "notify" && c.request?.jobId === "JOB-T601" && c.request?.reason === "write_failed") &&
        !world.alerts.some((a) => String(a.reason).startsWith("ready_to_release")) &&
        world.quotes.length === 0 &&
        world.result?.outcome === "write_failed" &&
        world.result?.quote_id === null
      );
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject: a job that prices cleanly.
    // Assert: written in draft and surfaced for a person to release; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T701", "form")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      world.result = await build(world.ports(), jobCreated("JOB-T701"));
    },
    holds: (world) => {
      const q = world.quotes[0];
      if (!q || world.quotes.length !== 1 || q.state !== "draft") return false;
      const draftAt = world.calls.indexOf(creates(world)[0]);
      const surfaced = world.calls.slice(draftAt + 1).some((c) => c.port === "notify" && c.request?.jobId === "JOB-T701" && c.request?.reason === `ready_to_release:${q.id}`);
      return surfaced && world.calls.every((c) => ALLOWED_PORTS.has(c.port) && !/send/i.test(c.port)) && world.result?.state === "draft";
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject: a priced job, then a retrieval of the quote from the system of record.
    // Assert: retrievable by its own id, carrying the options and totals that were drafted.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T801", "call")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      world.result = await build(world.ports(), jobCreated("JOB-T801"));
    },
    holds: (world) => {
      const id = world.result?.quote_id;
      const stored = world.quotes.find((q) => q.id === id);
      if (!id || !stored || stored.jobId !== "JOB-T801") return false;
      const sent = creates(world)[0]?.request;
      return (
        optionsAre(stored.options, HOT_WATER) &&
        stored.options.every((o, i) => o.total === world.result.options[i].total_ex_gst) &&
        JSON.stringify(stored.options.map((o) => o.lines.map((l) => l.catalogueId))) === JSON.stringify(sent.options.map((o) => o.lines.map((l) => l.catalogueId))) &&
        world.jobById("JOB-T801")?.quoteId === id
      );
    },
    describe,
  },
  {
    checkId: "log-survives",
    // 9. The log survives
    // Inject: any completed draft, then a retrieval by quote_id.
    // Assert: one quote_id returns the source job, ordered port calls, catalogue ids used and the outcome.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T901", "form")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      world.result = await build(world.ports(), jobCreated("JOB-T901"));
    },
    holds: (world) => {
      const d = world.result?.quote_id ? world.dossier(world.result.quote_id) : null;
      if (!d || d.job?.id !== "JOB-T901" || d.quote.state !== "draft") return false;
      const ids = HOT_WATER.flatMap((r) => r.catalogueIds);
      const order = ["read_job", "read_pricebook", "draft_quote"].map((p) => d.calls.findIndex((c) => c.port === p));
      return (
        JSON.stringify(d.catalogueIds) === JSON.stringify(ids) &&
        order.every((i) => i >= 0) &&
        order[0] < order[1] &&
        order[1] < order[2] &&
        d.calls[0].port === "read_job" &&
        d.calls[0].request?.jobId === "JOB-T901"
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject: a draft, then the office lifts the electric unit's rate, then a second job is drafted.
    // Assert: the second draft carries the new rate; the superseded rate appears nowhere on it.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T1001", "call"), hw("JOB-T1002", "form")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1001"));
      world.advance(60 * 60 * 1000);
      world.changePrice("HW-ELEC-250", 152000);
      await build(world.ports(), jobCreated("JOB-T1002"));
    },
    holds: (world) => {
      const first = world.quotes.find((q) => q.jobId === "JOB-T1001");
      const second = world.quotes.find((q) => q.jobId === "JOB-T1002");
      if (!first || !second || world.quotes.length !== 2) return false;
      const rateOn = (q) => q.options.flatMap((o) => o.lines).filter((l) => l.catalogueId === "HW-ELEC-250").map((l) => l.rate);
      const secondRates = second.options.flatMap((o) => o.lines).map((l) => l.rate);
      return (
        bookReads(world).length >= 2 &&
        JSON.stringify(rateOn(first)) === JSON.stringify([145000]) &&
        JSON.stringify(rateOn(second)) === JSON.stringify([152000]) &&
        !secondRates.includes(145000) &&
        second.options[0].total === 152000 + 66000 + 18500
      );
    },
    describe,
  },
  {
    checkId: "options-are-tiers-of-one-quote",
    // 11. Options are tiers of one quote
    // Inject: a job whose tier map entry names three options, reaching the standard twice.
    // Assert: exactly one quote with two or three labelled options at book rates; the second pass kept it.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T1101", "call")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1101"));
      world.advance(6 * 60 * 1000);
      await build(world.ports(), jobUpdated("JOB-T1101"));
    },
    holds: (world) => {
      const q = world.quotes;
      if (q.length !== 1 || creates(world).length !== 1 || updates(world).length !== 1) return false;
      const opts = q[0].options ?? [];
      return (
        opts.length >= 2 &&
        opts.length <= 3 &&
        optionsAre(opts, HOT_WATER) &&
        q[0].lines.length === 0 &&
        q[0].total === 0 &&
        q[0].duplicateOf === q[0].id &&
        JSON.stringify(world.jobById("JOB-T1101")?.quoteOptions) === JSON.stringify(["Good", "Better", "Best"])
      );
    },
    describe,
  },
  {
    checkId: "every-option-from-the-book",
    // 12. Every option is priced from the book
    // Inject: three options, where the dearest names a catalogue id the price list does not hold.
    // Assert: no draft for any option; escalate carries not_in_pricebook naming the line and its option.
    world: () =>
      new QuoteWorld({
        jobs: [hw("JOB-T1201", "form")],
        pricebook: BOOK,
        tierMap: [HOT_WATER[0], HOT_WATER[1], { ...HOT_WATER[2], catalogueIds: ["HW-HP-300-SOLAR", "LAB-HW-INST", "HW-TEMPV", "HW-DISP"] }],
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1201"));
    },
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0 || world.escalations.length !== 1) return false;
      const e = world.escalations[0];
      const d = parseDetail(e);
      const priced = (d.options ?? []).flatMap((o) => o.lines ?? []);
      return (
        e.reason === "not_in_pricebook" &&
        (d.unmatched ?? []).length === 1 &&
        d.unmatched[0].catalogue_id === "HW-HP-300-SOLAR" &&
        d.unmatched[0].option === "Best" &&
        priced.length === 10 &&
        priced.every(fromBook) &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "tiers-from-the-tier-map",
    // 13. Tiers come from the business's tier map
    // Inject: a tier map the business has renamed and ordered dearest first, then a job asking for
    //         options for work (a solar install) the tier map has no entry for.
    // Assert: options carry the map's labels, in its order, with exactly its ids, the map read before
    //         the draft; the second job drafts nothing and escalates no_tier_map.
    world: () =>
      new QuoteWorld({
        jobs: [hw("JOB-T1301", "call"), { id: "JOB-T1302", source: "form", wants: ["solar install"], optionsFrom: "solar-install" }],
        pricebook: BOOK,
        tierMap: RENAMED,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1301"));
      world.secondFrom = world.calls.length;
      await build(world.ports(), jobCreated("JOB-T1302"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1 || drafts[0].request.jobId !== "JOB-T1301") return false;
      const draftAt = world.calls.indexOf(drafts[0]);
      const mapRead = tierReads(world).find((c) => c.request.tierMap === "hot-water-replace");
      const later = world.calls.slice(world.secondFrom);
      return (
        optionsAre(drafts[0].request.options, RENAMED) &&
        Boolean(mapRead) &&
        world.calls.indexOf(mapRead) < draftAt &&
        !later.some((c) => c.port === "draft_quote") &&
        world.escalations.length === 1 &&
        world.escalations[0].reason === "no_tier_map" &&
        parseDetail(world.escalations[0]).job_id === "JOB-T1302"
      );
    },
    describe,
  },
  {
    checkId: "chosen-option-closes-the-others",
    // 14. The chosen option closes the others
    // Inject: a quote with three options, a person marks the middle one chosen, the build runs again.
    // Assert: a notify names the job and the two options to close, not the chosen one; every option is
    //         still in draft; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [hw("JOB-T1401", "call")], pricebook: BOOK, tierMap: TIER_MAP }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1401"));
      world.before = world.quotes.length === 1 ? JSON.stringify(world.quotes[0].options) : null;
      world.markChosen("JOB-T1401", "Better");
      world.from = world.calls.length;
      await build(world.ports(), jobUpdated("JOB-T1401"));
    },
    holds: (world) => {
      const later = world.calls.slice(world.from);
      const n = later.filter((c) => c.port === "notify");
      if (n.length !== 1 || n[0].request.jobId !== "JOB-T1401") return false;
      const reason = String(n[0].request.reason);
      const named = (label) => new RegExp(`(^|[:|,])${label}($|[|,])`).test(reason);
      const q = world.quotes;
      return (
        named("Good") &&
        named("Best") &&
        !reason.includes("Better") &&
        q.length === 1 &&
        q[0].state === "draft" &&
        world.before !== null &&
        optionsAre(q[0].options, HOT_WATER) &&
        JSON.stringify(q[0].options) === world.before &&
        q[0].chosenOption === "Better" &&
        !later.some((c) => c.port === "draft_quote") &&
        world.calls.every((c) => ALLOWED_PORTS.has(c.port))
      );
    },
    describe,
  },
];

// The checks a stub cannot pass, and is not asked to. These run only in
// production (AIPATHWAY_ENV=production), against your own systems or the
// hosted provider. On the stub the runner reports them as `with_us`.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 15. The pass test passes
    // One real job on a real tenant: run 1 with an off-book line parks, runs 2 and 3 without it
    // leave exactly one draft carrying duplicate_of. Runs with us; never written live from here.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated(process.env.PASS_TEST_JOB_ID ?? ""));
    },
    holds: () => false,
    describe,
  },
];

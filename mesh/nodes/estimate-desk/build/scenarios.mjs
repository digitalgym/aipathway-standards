/**
 * One scenario per check of quote-out-build-standard, for Estimate Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how Estimate Desk is driven, and what "held" means.
 *
 * The business is a small Australian commercial cleaning firm. A prospect
 * fills in the price-request form on its website; the intake hop logs the
 * request as a job carrying the services asked for, and the job system raises
 * `job.created`. Every drive hands the build that event, keyed by the job id.
 * Rates are in cents, ex GST, as they sit on the price list.
 *
 * Checks that only run against a real tenant are in `liveScenarios`. On the
 * stub the runner reports them as `with_us`; in production run.mjs appends them.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The firm's own price list. The only source of a rate. */
const BOOK = [
  { catalogueId: "CLN-OFFICE-STD", description: "Office clean, up to 200 m2, per visit", rate: 18500 },
  { catalogueId: "CLN-WASH-AMEN", description: "Washroom sanitise, per amenity", rate: 3200 },
  { catalogueId: "CLN-CARPET-RM", description: "Carpet steam clean, per room", rate: 6500 },
  { catalogueId: "CLN-WIN-INT", description: "Internal window clean, per floor", rate: 9500 },
  { catalogueId: "CLN-BIN-WASH", description: "Wheelie bin wash, per bin", rate: 1800 },
];
const byId = new Map(BOOK.map((b) => [b.catalogueId, b]));

const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const updates = (world) => calls(world, "draft_quote").filter((c) => "update" in (c.request ?? {}));
const at = (world, call) => world.calls.indexOf(call);
const parse = (s) => {
  try {
    return JSON.parse(s ?? "{}");
  } catch {
    return null;
  }
};
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ") || "none"}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line matches the book exactly: a real catalogue id, carrying that id's own rate at the time of the read. */
const onBook = (l, book = byId) => book.has(l.catalogueId) && book.get(l.catalogueId).rate === l.rate;

/** Nothing priced off the book anywhere in the trace, and no parked result shows a total. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    const d = parse(e.detail);
    if (!d) return false;
    for (const l of d.lines ?? []) if (!onBook(l)) return false;
    for (const u of d.unmatched ?? []) if ("rate" in u || "unit_rate" in u) return false;
    if (d.total_ex_gst !== null && d.total_ex_gst !== undefined) return false;
  }
  for (const c of creates(world)) for (const l of c.request?.lines ?? []) if (!onBook(l)) return false;
  return true;
}

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject:  A job created by an after-hours call, and a second job created from an overnight web form.
    // Assert:  Each draft is preceded by a read of the job it came from and carries that job's id. No draft appears without one.
    // Also driven first with the raw form post (email.received, no job id), which must produce nothing at all.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-3101", source: "call", wants: ["CLN-OFFICE-STD"] },
          { id: "JOB-3102", source: "form", wants: ["CLN-WASH-AMEN", "CLN-BIN-WASH"] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), { name: "email.received", message_id: "FORM-5521" });
      await build(world.ports(), jobCreated("JOB-3101"));
      await build(world.ports(), jobCreated("JOB-3102"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2) return false;
      // The raw form post did nothing: the very first port call is the read of the first job.
      if (world.calls[0]?.port !== "read_job" || world.calls[0]?.request?.jobId !== "JOB-3101") return false;
      const each = drafts.every((d) => {
        const readBefore = world.calls
          .slice(0, at(world, d))
          .some((c) => c.port === "read_job" && c.request?.jobId === d.request.jobId && c.response?.id === d.request.jobId);
        return typeof d.request.jobId === "string" && readBefore;
      });
      return each && drafts[0].request.jobId === "JOB-3101" && drafts[1].request.jobId === "JOB-3102";
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject:  A job whose work maps cleanly to three catalogue items.
    // Assert:  A read of the price list precedes the draft, and every priced line carries the catalogue id it came from.
    // One service is asked for by its catalogue description, one with a quantity from the form ("x3").
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-3201", source: "form", wants: ["CLN-OFFICE-STD", "Internal window clean, per floor", "CLN-CARPET-RM x3"] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-3201")),
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      const read = calls(world, "read_pricebook")[0];
      if (!read || at(world, read) > at(world, d)) return false;
      const lines = d.request.lines ?? [];
      return (
        lines.length === 5 &&
        lines.every((l) => onBook(l)) &&
        lines.map((l) => l.catalogueId).join(",") === "CLN-OFFICE-STD,CLN-WIN-INT,CLN-CARPET-RM,CLN-CARPET-RM,CLN-CARPET-RM"
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject:  A job needing one catalogue item and one thing the price list does not cover.
    // Assert:  No draft. An escalate carries a fixed-list reason and the unmatched line, and no invented rate appears anywhere.
    // The off-book service sounds close to a book line ("per room" vs "per floor"); it must not be matched by likeness.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-3301", source: "form", wants: ["CLN-WASH-AMEN", "External window clean, per floor"] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-3301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const d = parse(esc[0].request.detail);
      if (!d) return false;
      return (
        PARK_REASONS.includes(esc[0].request.reason) &&
        esc[0].request.reason === "not_in_pricebook" &&
        d.job_id === "JOB-3301" &&
        Array.isArray(d.unmatched) &&
        d.unmatched.length === 1 &&
        d.unmatched[0].description === "External window clean, per floor" &&
        Array.isArray(d.lines) &&
        d.lines.length === 1 &&
        d.lines[0].catalogueId === "CLN-WASH-AMEN" &&
        d.total_ex_gst === null &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject:  A job flagged as a variation to an accepted quote, then a job carrying a request for a discount.
    // Assert:  Both escalate with a typed reason. Neither produces a draft.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-3401", source: "form", wants: ["CLN-CARPET-RM"], isVariation: true },
          { id: "JOB-3402", source: "form", wants: ["CLN-OFFICE-STD"], wantsDiscount: true },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-3401"));
      await build(world.ports(), jobCreated("JOB-3402"));
    },
    holds: (world) => {
      const esc = calls(world, "escalate");
      return (
        calls(world, "draft_quote").length === 0 &&
        world.quotes.length === 0 &&
        esc.length === 2 &&
        esc[0].request.reason === "variation_to_accepted_quote" &&
        esc[1].request.reason === "discount_requested" &&
        parse(esc[0].request.detail)?.job_id === "JOB-3401" &&
        parse(esc[1].request.detail)?.job_id === "JOB-3402"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject:  The same job reaching the standard twice: the form submitted at 10pm, then the prospect ringing next morning.
    // Assert:  Exactly one quote exists. The second pass returned the same quote carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-3501", source: "form", wants: ["CLN-OFFICE-STD", "CLN-WASH-AMEN x2"] }], pricebook: BOOK }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("JOB-3501"));
      world.advance(9 * 60 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "JOB-3501" });
      world.outcomes = [first, second];
    },
    holds: (world) => {
      const [first, second] = world.outcomes ?? [];
      const ups = updates(world);
      return (
        world.quotes.length === 1 &&
        creates(world).length === 1 &&
        ups.length === 1 &&
        typeof first?.quote_id === "string" &&
        ups[0].response?.id === first.quote_id &&
        second?.outcome === "kept" &&
        second.quote_id === first.quote_id &&
        second.duplicate_of === first.quote_id &&
        world.quotes[0].duplicateOf === first.quote_id
      );
    },
    describe,
  },
  {
    checkId: "draft-quote-verified",
    // 6. The write is verified
    // Inject:  The stub returns a null external_id on the quote write.
    // Assert:  A notify follows the failed write, and the job is not reported as quoted.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-3601", source: "form", wants: ["CLN-WIN-INT"] }], pricebook: BOOK, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-3601"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(at(world, write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "JOB-3601" && c.request.reason === "write_failed");
      const ready = world.calls.some((c) => c.port === "notify" && /^ready_to_release/.test(c.request.reason ?? ""));
      const out = world.outcomes?.[0];
      return (
        alerted &&
        !ready &&
        out?.outcome === "write_failed" &&
        out.quote_id === null &&
        world.quotes.length === 0 &&
        !world.jobById("JOB-3601")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject:  A job that prices cleanly from the price list.
    // Assert:  The quote is written in draft and surfaced for a person to release. No send port appears in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-3701", source: "form", wants: ["CLN-BIN-WASH x4"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-3701")),
    holds: (world) => {
      const q = world.quotes[0];
      if (world.quotes.length !== 1 || q.state !== "draft") return false;
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "JOB-3701" && c.request.reason === `ready_to_release:${q.id}`);
      return surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject:  A priced job, then a retrieval of the quote from the system of record.
    // Assert:  The quote is retrievable from the system of record by its own id, carrying the lines and total that were drafted.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-3801", source: "form", wants: ["CLN-OFFICE-STD", "CLN-CARPET-RM x2"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-3801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines ?? [];
      return (
        Boolean(q) &&
        q.jobId === "JOB-3801" &&
        drafted.length === 3 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate) &&
        q.total === write.response.total &&
        q.total === 18500 + 6500 * 2
      );
    },
    describe,
  },
  {
    checkId: "log-survives",
    // 9. The log survives
    // Inject:  Any completed draft, then a retrieval by quote_id.
    // Assert:  One quote_id returns the source job, the ordered port calls, the catalogue ids used and the outcome as one object.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-3901", source: "form", wants: ["CLN-WIN-INT", "CLN-WASH-AMEN"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-3901")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const d = id ? world.dossier(id) : null;
      if (!d) return false;
      const order = d.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iBook = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        d.job?.id === "JOB-3901" &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "CLN-WIN-INT,CLN-WASH-AMEN" &&
        iJob >= 0 &&
        iJob < iBook &&
        iBook < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject:  A draft raised after the price list has changed in the system of record.
    // Assert:  The read returns the changed rate and the draft carries it, or the quote parks. The superseded rate appears nowhere on the draft.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-4001", source: "form", wants: ["CLN-OFFICE-STD"] },
          { id: "JOB-4002", source: "form", wants: ["CLN-OFFICE-STD"] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // The first job warms any cache a build might keep. Then the office puts its standard clean up for the new financial year.
      await build(world.ports(), jobCreated("JOB-4001"));
      world.advance(3 * 60 * 60_000);
      world.changePrice("CLN-OFFICE-STD", 19900);
      await build(world.ports(), jobCreated("JOB-4002"));
    },
    holds: (world) => {
      const all = creates(world);
      const first = all.find((c) => c.request.jobId === "JOB-4001");
      const second = all.find((c) => c.request.jobId === "JOB-4002");
      if (!first || !second) return false;
      const freshRead = calls(world, "read_pricebook").some((r) => at(world, r) > at(world, first) && at(world, r) < at(world, second));
      const rates = second.request.lines.map((l) => l.rate);
      return (
        freshRead &&
        rates.length === 1 &&
        rates[0] === 19900 &&
        world.quotes.find((q) => q.jobId === "JOB-4002")?.total === 19900
      );
    },
    describe,
  },
];

// The check a stub cannot pass, and is not asked to. It runs only in
// production, against a real tenant. On the stub it reports with_us. Its holds
// asserts the three runs the standard names and nothing less.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 11. The pass test passes
    // Inject:  A real job, run once with a service not on the price list and then twice without it.
    // Assert:  Run 1 parked with not_in_pricebook, priced lines attached, no total. Run 2 left one real draft. Run 3 kept it, carrying duplicate_of.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.ESTIMATE_DESK_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 a person drops the off-book service on the real job.
      world.outcomes.push(await build(world.ports(), { name: "job.updated", job_id: jobId }));
      world.outcomes.push(await build(world.ports(), { name: "job.updated", job_id: jobId }));
    },
    holds: (world) => {
      const [r1, r2, r3] = world.outcomes ?? [];
      return (
        r1?.outcome === "parked" &&
        r1.park_reason === "not_in_pricebook" &&
        r1.total_ex_gst === null &&
        (r1.lines?.length ?? 0) > 0 &&
        r2?.outcome === "drafted" &&
        typeof r2.external_id === "string" &&
        r2.external_id.length > 0 &&
        r3?.outcome === "kept" &&
        r3.quote_id === r2.quote_id &&
        r3.duplicate_of === r2.quote_id
      );
    },
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

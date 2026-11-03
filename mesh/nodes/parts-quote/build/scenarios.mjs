/**
 * One scenario per check of quote-out-build-standard, for Parts Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how Parts Quote is driven, and what "held" means.
 *
 * The business is an Australian industrial parts supplier. A customer emails
 * for a price on some part numbers; the intake hop logs that enquiry as a job
 * carrying the part numbers asked for, and the job system raises
 * `job.created`. Every drive hands the build that event, keyed by the job id.
 * Rates are in cents, ex GST, as they sit on the price list.
 *
 * Checks that only run against a real tenant are in `liveScenarios`. On the
 * stub the runner reports them as `with_us`; in production run.mjs appends them.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The supplier's own parts price list. The only source of a rate. */
const BOOK = [
  { catalogueId: "BRG-6204-2RS", description: "Deep groove ball bearing 6204-2RS", rate: 1450 },
  { catalogueId: "FLT-HYD-10M", description: "Hydraulic return filter, 10 micron", rate: 6800 },
  { catalogueId: "BLT-SPA-1250", description: "V-belt SPA 1250", rate: 2290 },
  { catalogueId: "SEAL-CYL-63", description: "Cylinder seal kit, 63 mm bore", rate: 11900 },
  { catalogueId: "PMP-GEAR-12", description: "Gear pump 12 cc/rev", rate: 48500 },
];
const byId = new Map(BOOK.map((b) => [b.catalogueId, b]));

const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const updates = (world) => calls(world, "draft_quote").filter((c) => "update" in (c.request ?? {}));
const at = (world, call) => world.calls.indexOf(call);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ") || "none"}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line matches the book exactly: a real catalogue id, carrying that id's own rate at the time of the read. */
const onBook = (l, book = byId) => book.has(l.catalogueId) && book.get(l.catalogueId).rate === l.rate;

/** Nothing priced off the book anywhere in the trace, and no parked result shows a total. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    let d;
    try {
      d = JSON.parse(e.detail ?? "{}");
    } catch {
      return false;
    }
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
    // Also driven with a raw email.received carrying no job id, which must produce nothing at all.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-7101", source: "call", wants: ["BRG-6204-2RS", "BLT-SPA-1250"] },
          { id: "JOB-7102", source: "form", wants: ["FLT-HYD-10M"] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), { name: "email.received", message_id: "MSG-88" });
      await build(world.ports(), jobCreated("JOB-7101"));
      await build(world.ports(), jobCreated("JOB-7102"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2) return false;
      // The raw email did nothing: the first port call is the read of the first job.
      if (world.calls[0]?.port !== "read_job" || world.calls[0]?.request?.jobId !== "JOB-7101") return false;
      const each = drafts.every((d) => {
        const readBefore = world.calls
          .slice(0, at(world, d))
          .some((c) => c.port === "read_job" && c.request?.jobId === d.request.jobId && c.response?.id === d.request.jobId);
        return typeof d.request.jobId === "string" && readBefore;
      });
      return each && drafts[0].request.jobId === "JOB-7101" && drafts[1].request.jobId === "JOB-7102";
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject:  A job whose parts map cleanly to three catalogue items.
    // Assert:  A read of the price list precedes the draft, and every priced line carries the catalogue id it came from.
    // One part is asked for by its catalogue description rather than its part number; it still resolves to the id.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-7201", source: "email", wants: ["SEAL-CYL-63", "Gear pump 12 cc/rev", "BRG-6204-2RS"] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-7201")),
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      const read = calls(world, "read_pricebook")[0];
      if (!read || at(world, read) > at(world, d)) return false;
      const lines = d.request.lines ?? [];
      return (
        lines.length === 3 &&
        lines.every((l) => onBook(l)) &&
        lines.map((l) => l.catalogueId).join(",") === "SEAL-CYL-63,PMP-GEAR-12,BRG-6204-2RS"
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject:  A job needing one catalogue item and one part the price list does not carry.
    // Assert:  No draft. An escalate carries a fixed-list reason and the unmatched line, and no invented rate appears anywhere.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-7301", source: "email", wants: ["FLT-HYD-10M", "Hydraulic return filter, 25 micron"] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-7301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      let d;
      try {
        d = JSON.parse(esc[0].request.detail);
      } catch {
        return false;
      }
      return (
        PARK_REASONS.includes(esc[0].request.reason) &&
        esc[0].request.reason === "not_in_pricebook" &&
        d.job_id === "JOB-7301" &&
        Array.isArray(d.unmatched) &&
        d.unmatched.length === 1 &&
        d.unmatched[0].description === "Hydraulic return filter, 25 micron" &&
        Array.isArray(d.lines) &&
        d.lines.length === 1 &&
        d.lines[0].catalogueId === "FLT-HYD-10M" &&
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
          { id: "JOB-7401", source: "email", wants: ["BLT-SPA-1250"], isVariation: true },
          { id: "JOB-7402", source: "email", wants: ["BRG-6204-2RS"], wantsDiscount: true },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-7401"));
      await build(world.ports(), jobCreated("JOB-7402"));
    },
    holds: (world) => {
      const esc = calls(world, "escalate");
      return (
        calls(world, "draft_quote").length === 0 &&
        world.quotes.length === 0 &&
        esc.length === 2 &&
        esc[0].request.reason === "variation_to_accepted_quote" &&
        esc[1].request.reason === "discount_requested" &&
        JSON.parse(esc[0].request.detail ?? "{}").job_id === "JOB-7401" &&
        JSON.parse(esc[1].request.detail ?? "{}").job_id === "JOB-7402"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject:  The same job reaching the standard twice: the enquiry email, then the customer's follow-up email minutes later.
    // Assert:  Exactly one quote exists. The second pass returned the same quote carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-7501", source: "email", wants: ["BRG-6204-2RS", "SEAL-CYL-63"] }], pricebook: BOOK }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("JOB-7501"));
      world.advance(9 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "JOB-7501" });
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
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-7601", source: "email", wants: ["PMP-GEAR-12"] }], pricebook: BOOK, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-7601"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(at(world, write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "JOB-7601" && c.request.reason === "write_failed");
      const ready = world.calls.some((c) => c.port === "notify" && /^ready_to_release/.test(c.request.reason ?? ""));
      const out = world.outcomes?.[0];
      return (
        alerted &&
        !ready &&
        out?.outcome === "write_failed" &&
        out.quote_id === null &&
        world.quotes.length === 0 &&
        !world.jobById("JOB-7601")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject:  A job that prices cleanly from the price list.
    // Assert:  The quote is written in draft and surfaced for a person to release. No send port appears in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-7701", source: "email", wants: ["BLT-SPA-1250", "BLT-SPA-1250"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-7701")),
    holds: (world) => {
      const q = world.quotes[0];
      if (world.quotes.length !== 1 || q.state !== "draft") return false;
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "JOB-7701" && c.request.reason === `ready_to_release:${q.id}`);
      return surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject:  A priced job, then a retrieval of the quote from the system of record.
    // Assert:  The quote is retrievable from the system of record by its own id, carrying the lines and total that were drafted.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-7801", source: "email", wants: ["FLT-HYD-10M", "SEAL-CYL-63"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-7801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines ?? [];
      return (
        Boolean(q) &&
        q.jobId === "JOB-7801" &&
        drafted.length === 2 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate) &&
        q.total === write.response.total &&
        q.total === 6800 + 11900
      );
    },
    describe,
  },
  {
    checkId: "log-survives",
    // 9. The log survives
    // Inject:  Any completed draft, then a retrieval by quote_id.
    // Assert:  One quote_id returns the source job, the ordered port calls, the catalogue ids used and the outcome as one object.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-7901", source: "email", wants: ["PMP-GEAR-12", "BRG-6204-2RS"] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-7901")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const d = id ? world.dossier(id) : null;
      if (!d) return false;
      const order = d.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iBook = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        d.job?.id === "JOB-7901" &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "PMP-GEAR-12,BRG-6204-2RS" &&
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
          { id: "JOB-8001", source: "email", wants: ["BRG-6204-2RS"] },
          { id: "JOB-8002", source: "email", wants: ["BRG-6204-2RS"] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // The first job warms any cache a build might keep. Then the supplier's bearing price goes up.
      await build(world.ports(), jobCreated("JOB-8001"));
      world.advance(2 * 60 * 60_000);
      world.changePrice("BRG-6204-2RS", 1690);
      await build(world.ports(), jobCreated("JOB-8002"));
    },
    holds: (world) => {
      const all = creates(world);
      const first = all.find((c) => c.request.jobId === "JOB-8001");
      const second = all.find((c) => c.request.jobId === "JOB-8002");
      if (!first || !second) return false;
      const freshRead = calls(world, "read_pricebook").some((r) => at(world, r) > at(world, first) && at(world, r) < at(world, second));
      const rates = second.request.lines.map((l) => l.rate);
      return (
        freshRead &&
        rates.length === 1 &&
        rates[0] === 1690 &&
        world.quotes.find((q) => q.jobId === "JOB-8002")?.total === 1690
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
    // Inject:  A real job, run once with a part not on the price list and then twice without it.
    // Assert:  Run 1 parked with not_in_pricebook, priced lines attached, no total. Run 2 left one real draft. Run 3 kept it, carrying duplicate_of.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.PARTS_QUOTE_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 a person drops the off-list part on the real job.
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

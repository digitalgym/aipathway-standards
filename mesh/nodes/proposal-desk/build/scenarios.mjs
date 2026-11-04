/**
 * One scenario per check of quote-out-build-standard, for Proposal Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how Proposal Desk is driven, and what "held" means.
 *
 * The business is an Australian accounting and bookkeeping practice. A
 * prospective client enquires; the practice opens a proposal job for them in
 * its practice system, listing the services they need, and the system raises
 * `job.created`. Every drive hands the build that event, keyed by the job id.
 * Fees are in cents, ex GST, as they sit on the practice's service price list.
 * A service needed four times a year (quarterly BAS) is listed four times.
 *
 * Checks that only run against a real tenant are in `liveScenarios`. On the
 * stub the runner reports them as `with_us`; in production run.mjs appends them.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The practice's own service price list. The only source of a fee. */
const FEES = [
  { catalogueId: "IND-ITR", description: "Individual income tax return", rate: 38500 },
  { catalogueId: "CO-FS-ITR", description: "Company financial statements and income tax return", rate: 264000 },
  { catalogueId: "BAS-QTR", description: "Quarterly BAS preparation and lodgement", rate: 45000 },
  { catalogueId: "PAY-STP", description: "Payroll setup and Single Touch Payroll reporting", rate: 66000 },
  { catalogueId: "TR-ITR", description: "Trust tax return and distribution resolution", rate: 187000 },
  { catalogueId: "ONB-NEW", description: "New client onboarding and ATO agent nomination", rate: 19800 },
];
const byId = new Map(FEES.map((f) => [f.catalogueId, f]));

const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const updates = (world) => calls(world, "draft_quote").filter((c) => "update" in (c.request ?? {}));
const at = (world, call) => world.calls.indexOf(call);
const detailOf = (call) => {
  try {
    return JSON.parse(call?.request?.detail ?? "null");
  } catch {
    return null;
  }
};
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ") || "none"}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is on the fee list exactly: a real catalogue id, carrying that id's own fee at the time of the read. */
const onList = (l) => byId.has(l.catalogueId) && byId.get(l.catalogueId).rate === l.rate;

/** No fee anywhere in the trace came from outside the list, and no parked result shows a total. */
function noInventedFee(world) {
  for (const e of world.escalations) {
    let d;
    try {
      d = JSON.parse(e.detail ?? "{}");
    } catch {
      return false;
    }
    for (const l of d.lines ?? []) if (!onList(l)) return false;
    for (const u of d.unmatched ?? []) if ("rate" in u || "unit_rate" in u) return false;
    if (d.total_ex_gst !== null && d.total_ex_gst !== undefined) return false;
  }
  for (const c of creates(world)) for (const l of c.request?.lines ?? []) if (!onList(l)) return false;
  return true;
}

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject:  A proposal job opened after the prospect rang, and one opened from the website enquiry form.
    // Assert:  Each draft is preceded by a read of the job it came from and carries that job's id. No draft appears without one.
    // Also driven first with a raw email.received carrying no job id, which must produce nothing at all.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "PRJ-2201", source: "call", wants: ["ONB-NEW", "IND-ITR"] },
          { id: "PRJ-2202", source: "form", wants: ["ONB-NEW", "TR-ITR"] },
        ],
        pricebook: FEES,
      }),
    drive: async (build, world) => {
      await build(world.ports(), { name: "email.received", message_id: "MSG-5120" });
      await build(world.ports(), jobCreated("PRJ-2201"));
      await build(world.ports(), jobCreated("PRJ-2202"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2) return false;
      if (world.calls[0]?.port !== "read_job" || world.calls[0]?.request?.jobId !== "PRJ-2201") return false;
      const each = drafts.every((d) =>
        world.calls
          .slice(0, at(world, d))
          .some((c) => c.port === "read_job" && c.request?.jobId === d.request.jobId && c.response?.id === d.request.jobId),
      );
      return each && drafts[0].request.jobId === "PRJ-2201" && drafts[1].request.jobId === "PRJ-2202";
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject:  A new company client needing onboarding, year-end accounts and four quarterly BAS.
    // Assert:  A read of the price list precedes the draft, and every priced line carries the catalogue id it came from.
    // The year-end work is asked for by its catalogue name rather than its code; it still resolves to the id.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "PRJ-2301",
            source: "form",
            wants: ["ONB-NEW", "Company financial statements and income tax return", "BAS-QTR", "BAS-QTR", "BAS-QTR", "BAS-QTR"],
          },
        ],
        pricebook: FEES,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("PRJ-2301")),
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      const read = calls(world, "read_pricebook")[0];
      if (!read || at(world, read) > at(world, d)) return false;
      const lines = d.request.lines ?? [];
      return (
        lines.length === 6 &&
        lines.every(onList) &&
        lines.map((l) => l.catalogueId).join(",") === "ONB-NEW,CO-FS-ITR,BAS-QTR,BAS-QTR,BAS-QTR,BAS-QTR" &&
        world.quotes[0]?.total === 19800 + 264000 + 4 * 45000
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject:  A prospect needing a trust return and advice on restructuring their group, which the fee list does not cover.
    // Assert:  No draft. An escalate carries a fixed-list reason and the unmatched line, and no invented fee appears anywhere.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "PRJ-2401", source: "call", wants: ["TR-ITR", "Group restructure advice"] }],
        pricebook: FEES,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("PRJ-2401")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const d = detailOf(esc[0]);
      return (
        Boolean(d) &&
        PARK_REASONS.includes(esc[0].request.reason) &&
        esc[0].request.reason === "not_in_pricebook" &&
        d.job_id === "PRJ-2401" &&
        Array.isArray(d.unmatched) &&
        d.unmatched.length === 1 &&
        d.unmatched[0].description === "Group restructure advice" &&
        Array.isArray(d.lines) &&
        d.lines.length === 1 &&
        d.lines[0].catalogueId === "TR-ITR" &&
        d.total_ex_gst === null &&
        noInventedFee(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject:  A client adding payroll to an engagement already accepted, then a prospect asking for a first-year discount.
    // Assert:  Both escalate with a typed reason. Neither produces a draft.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "PRJ-2501", source: "call", wants: ["PAY-STP"], isVariation: true },
          { id: "PRJ-2502", source: "form", wants: ["IND-ITR", "BAS-QTR"], wantsDiscount: true },
        ],
        pricebook: FEES,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("PRJ-2501"));
      await build(world.ports(), jobCreated("PRJ-2502"));
    },
    holds: (world) => {
      const esc = calls(world, "escalate");
      return (
        calls(world, "draft_quote").length === 0 &&
        world.quotes.length === 0 &&
        esc.length === 2 &&
        esc[0].request.reason === "variation_to_accepted_quote" &&
        esc[1].request.reason === "discount_requested" &&
        detailOf(esc[0])?.job_id === "PRJ-2501" &&
        detailOf(esc[1])?.job_id === "PRJ-2502"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject:  The same proposal job reaching the standard twice: the web enquiry overnight, then the prospect's call next morning.
    // Assert:  Exactly one quote exists. The second pass returned the same quote carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "PRJ-2601", source: "form", wants: ["ONB-NEW", "IND-ITR"] }], pricebook: FEES }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("PRJ-2601"));
      world.advance(9 * 60 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "PRJ-2601" });
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
    // Inject:  The stub returns a null external_id on the proposal write.
    // Assert:  A notify follows the failed write, and the job is not reported as quoted.
    world: () => new QuoteWorld({ jobs: [{ id: "PRJ-2701", source: "call", wants: ["CO-FS-ITR"] }], pricebook: FEES, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("PRJ-2701"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(at(world, write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "PRJ-2701" && c.request.reason === "write_failed");
      const ready = world.calls.some((c) => c.port === "notify" && /^ready_to_release/.test(c.request.reason ?? ""));
      const out = world.outcomes?.[0];
      return (
        alerted &&
        !ready &&
        out?.outcome === "write_failed" &&
        out.quote_id === null &&
        world.quotes.length === 0 &&
        !world.jobById("PRJ-2701")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject:  A sole trader whose return and four BAS price cleanly from the fee list.
    // Assert:  The proposal is written in draft and surfaced for the partner to release. No send port appears in the trace.
    world: () =>
      new QuoteWorld({ jobs: [{ id: "PRJ-2801", source: "form", wants: ["IND-ITR", "BAS-QTR", "BAS-QTR", "BAS-QTR", "BAS-QTR"] }], pricebook: FEES }),
    drive: (build, world) => build(world.ports(), jobCreated("PRJ-2801")),
    holds: (world) => {
      const q = world.quotes[0];
      if (world.quotes.length !== 1 || q.state !== "draft") return false;
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "PRJ-2801" && c.request.reason === `ready_to_release:${q.id}`);
      return surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject:  A priced proposal job, then a retrieval of the quote from the system of record.
    // Assert:  The quote is retrievable from the system of record by its own id, carrying the lines and total that were drafted.
    world: () => new QuoteWorld({ jobs: [{ id: "PRJ-2901", source: "call", wants: ["TR-ITR", "IND-ITR"] }], pricebook: FEES }),
    drive: (build, world) => build(world.ports(), jobCreated("PRJ-2901")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines ?? [];
      return (
        Boolean(q) &&
        q.jobId === "PRJ-2901" &&
        drafted.length === 2 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate) &&
        q.total === write.response.total &&
        q.total === 187000 + 38500
      );
    },
    describe,
  },
  {
    checkId: "log-survives",
    // 9. The log survives
    // Inject:  Any completed draft, then a retrieval by quote_id.
    // Assert:  One quote_id returns the source job, the ordered port calls, the catalogue ids used and the outcome as one object.
    world: () => new QuoteWorld({ jobs: [{ id: "PRJ-3001", source: "form", wants: ["ONB-NEW", "PAY-STP"] }], pricebook: FEES }),
    drive: (build, world) => build(world.ports(), jobCreated("PRJ-3001")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const d = id ? world.dossier(id) : null;
      if (!d) return false;
      const order = d.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iList = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        d.job?.id === "PRJ-3001" &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "ONB-NEW,PAY-STP" &&
        iJob >= 0 &&
        iJob < iList &&
        iList < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject:  A draft raised after the practice put through its new financial-year fee for quarterly BAS.
    // Assert:  The read returns the changed fee and the draft carries it. The superseded fee appears nowhere on the draft.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "PRJ-3101", source: "form", wants: ["BAS-QTR"] },
          { id: "PRJ-3102", source: "form", wants: ["BAS-QTR"] },
        ],
        pricebook: FEES,
      }),
    drive: async (build, world) => {
      // The first job warms any cache a build might keep. Then the 1 July fee review lands.
      await build(world.ports(), jobCreated("PRJ-3101"));
      world.advance(2 * 60 * 60_000);
      world.changePrice("BAS-QTR", 49500);
      await build(world.ports(), jobCreated("PRJ-3102"));
    },
    holds: (world) => {
      const all = creates(world);
      const first = all.find((c) => c.request.jobId === "PRJ-3101");
      const second = all.find((c) => c.request.jobId === "PRJ-3102");
      if (!first || !second) return false;
      const freshRead = calls(world, "read_pricebook").some((r) => at(world, r) > at(world, first) && at(world, r) < at(world, second));
      const fees = second.request.lines.map((l) => l.rate);
      return freshRead && fees.length === 1 && fees[0] === 49500 && world.quotes.find((q) => q.jobId === "PRJ-3102")?.total === 49500;
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
    // Inject:  A real proposal job, run once with a service not on the fee list and then twice without it.
    // Assert:  Run 1 parked with not_in_pricebook, priced lines attached, no total. Run 2 left one real draft. Run 3 kept it, carrying duplicate_of.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.PROPOSAL_DESK_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 the partner drops the off-list service from the real job.
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

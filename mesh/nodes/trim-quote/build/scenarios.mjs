/**
 * One scenario per check of quote-out-build-standard, for Trim Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Trim Quote is
 * woken by a named event, so every drive hands the build `job.created` (or
 * `job.updated`) keyed by the job id.
 *
 * The world is a finish-carpentry business: its price list keeps a sell-rate
 * per labour hour for each grade of carpenter, plus a per-visit set-out line.
 * The estimator's takeoff puts the hours on the job. Every check also asserts
 * the price-book rule this node adds: a line's amount is the job's hours for it
 * times the catalogue's own rate, and nothing else sets a number.
 *
 * Checks a stub cannot pass are in `liveScenarios`; on the stub the runner
 * reports them as `with_us`.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The business's own price list, cents ex GST. The only source of a rate. */
export const BOOK = [
  { catalogueId: "FC-LAB-HR", description: "Finish carpenter, per hour", rate: 9800, unit: "hour" },
  { catalogueId: "FC-LEAD-HR", description: "Lead finish carpenter, per hour", rate: 11500, unit: "hour" },
  { catalogueId: "FC-APP-HR", description: "Apprentice carpenter, per hour", rate: 5800, unit: "hour" },
  { catalogueId: "FC-SETOUT", description: "Site set-out and floor protection, per visit", rate: 18000, unit: "each" },
];
const RATES = new Set(BOOK.map((i) => i.rate));
const bookItem = (id) => BOOK.find((b) => b.catalogueId === id);

const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const firstIndex = (world, pred) => world.calls.findIndex(pred);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is priced by the book rule: its catalogue id is real, its rate is that item's, and its amount is quantity x rate. */
function byTheBook(line, expectedQty) {
  const item = bookItem(line?.catalogueId);
  return (
    Boolean(item) &&
    line.rate === item.rate &&
    typeof line.quantity === "number" &&
    (expectedQty === undefined || line.quantity === expectedQty) &&
    line.amount === Math.round(line.quantity * item.rate)
  );
}
const sumAmounts = (lines) => lines.reduce((s, l) => s + l.amount, 0);

/** Every number in an escalation is a rate from the book, and no unmatched line carries one. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    const d = e.detail ? JSON.parse(e.detail) : {};
    for (const l of d.lines ?? []) if (!RATES.has(l.rate) || !byTheBook(l)) return false;
    for (const u of d.unmatched ?? []) if ("rate" in u || "unit_rate" in u || "amount" in u || "quantity" in u) return false;
    if (d.total_ex_gst !== undefined && d.total_ex_gst !== null) return false;
  }
  for (const c of calls(world, "draft_quote")) for (const l of c.request?.lines ?? []) if (!RATES.has(l.rate)) return false;
  return true;
}

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject: a job created by an after-hours call, and a second from an overnight web form.
    // Assert: each draft is preceded by a read of its job and carries that job's id.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-T101", source: "call", wants: ["FC-LAB-HR", "FC-SETOUT"], hours: { "FC-LAB-HR": 16 } },
          { id: "JOB-T102", source: "form", wants: ["Lead finish carpenter, per hour"], hours: { "Lead finish carpenter, per hour": 6.5 } },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // A raw call, carrying hours in its own payload, must not produce a draft.
      await build(world.ports(), { name: "call.received", call_id: "CALL-1", job_id: "JOB-T101" });
      world.callsAfterRawCall = world.calls.length;
      await build(world.ports(), jobCreated("JOB-T101"));
      await build(world.ports(), jobCreated("JOB-T102"));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2) return false;
      const readFirst = drafts.every((d) => {
        const at = world.calls.indexOf(d);
        return Boolean(d.request.jobId) && world.calls.slice(0, at).some((c) => c.port === "read_job" && c.request?.jobId === d.request.jobId && c.response?.id === d.request.jobId);
      });
      const [a, b] = drafts;
      return (
        world.callsAfterRawCall === 0 &&
        readFirst &&
        a.request.jobId === "JOB-T101" &&
        b.request.jobId === "JOB-T102" &&
        byTheBook(a.request.lines.find((l) => l.catalogueId === "FC-LAB-HR"), 16) &&
        byTheBook(b.request.lines[0], 6.5)
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject: a job whose work maps cleanly to three catalogue items.
    // Assert: a read of the price list precedes the draft, every line carries its catalogue id,
    //         and each amount is the job's hours times the book's own rate.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-T201",
            source: "call",
            wants: ["FC-LEAD-HR", "FC-LAB-HR", "FC-APP-HR"],
            hours: { "FC-LEAD-HR": 12, "FC-LAB-HR": 38.5, "FC-APP-HR": 24 },
          },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-T201"))];
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      const readAt = firstIndex(world, (c) => c.port === "read_pricebook");
      if (readAt < 0 || readAt > world.calls.indexOf(d)) return false;
      const lines = d.request.lines ?? [];
      const want = { "FC-LEAD-HR": 12, "FC-LAB-HR": 38.5, "FC-APP-HR": 24 };
      const expectedTotal = 12 * 11500 + 38.5 * 9800 + 24 * 5800;
      return (
        lines.length === 3 &&
        lines.every((l) => byTheBook(l, want[l.catalogueId])) &&
        d.request.total_ex_gst === expectedTotal &&
        world.outcomes?.[0]?.total_ex_gst === expectedTotal &&
        world.outcomes?.[0]?.labour_hours === 74.5
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject: a job needing one catalogue item and one thing the price list does not cover.
    // Assert: no draft; one escalate with a fixed-list reason and the unmatched line; no invented rate.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-T301", source: "form", wants: ["FC-LAB-HR", "Hand-carved newel post"], hours: { "FC-LAB-HR": 20, "Hand-carved newel post": 9 } }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const reason = esc[0].request.reason;
      const d = JSON.parse(esc[0].request.detail ?? "{}");
      return (
        PARK_REASONS.includes(reason) &&
        reason === "not_in_pricebook" &&
        d.unmatched?.length === 1 &&
        d.unmatched[0].description === "Hand-carved newel post" &&
        d.lines?.length === 1 &&
        byTheBook(d.lines[0], 20) &&
        d.total_ex_gst === null &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject: a variation to an accepted quote, then a job carrying a discount request.
    // Assert: both escalate with a typed reason; neither drafts.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-T401", source: "call", wants: ["FC-LAB-HR"], hours: { "FC-LAB-HR": 8 }, isVariation: true },
          { id: "JOB-T402", source: "form", wants: ["FC-LEAD-HR"], hours: { "FC-LEAD-HR": 4 }, wantsDiscount: true },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T401"));
      await build(world.ports(), jobCreated("JOB-T402"));
    },
    holds: (world) => {
      const esc = calls(world, "escalate");
      const reasons = esc.map((c) => c.request.reason);
      const jobs = esc.map((c) => JSON.parse(c.request.detail ?? "{}").job_id);
      return (
        calls(world, "draft_quote").length === 0 &&
        world.quotes.length === 0 &&
        reasons.length === 2 &&
        reasons[0] === "variation_to_accepted_quote" &&
        reasons[1] === "discount_requested" &&
        jobs[0] === "JOB-T401" &&
        jobs[1] === "JOB-T402"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject: the same job reaching the standard twice, call then follow-up email minutes later.
    // Assert: one quote; the second pass returned it carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T501", source: "call", wants: ["FC-LAB-HR", "FC-SETOUT"], hours: { "FC-LAB-HR": 30 } }], pricebook: BOOK }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("JOB-T501"));
      world.advance(7 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "JOB-T501" });
      world.outcomes = [first, second];
    },
    holds: (world) => {
      const [first, second] = world.outcomes ?? [];
      const updates = calls(world, "draft_quote").filter((c) => "update" in (c.request ?? {}));
      return (
        world.quotes.length === 1 &&
        creates(world).length === 1 &&
        updates.length === 1 &&
        Boolean(first?.quote_id) &&
        updates[0].response?.id === first.quote_id &&
        second?.outcome === "kept" &&
        second?.quote_id === first.quote_id &&
        second?.duplicate_of === first.quote_id &&
        world.quotes[0].duplicateOf === first.quote_id
      );
    },
    describe,
  },
  {
    checkId: "draft-quote-verified",
    // 6. The write is verified
    // Inject: the stub returns a null id on the quote write.
    // Assert: a notify follows the failed write, and the job is not reported as quoted.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T601", source: "call", wants: ["FC-LAB-HR"], hours: { "FC-LAB-HR": 10 } }], pricebook: BOOK, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-T601"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(world.calls.indexOf(write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "JOB-T601" && c.request.reason === "write_failed");
      const released = after.some((c) => c.port === "notify" && String(c.request.reason).startsWith("ready_to_release"));
      const out = world.outcomes?.[0];
      return alerted && !released && out?.outcome === "write_failed" && out?.quote_id === null && world.quotes.length === 0 && !world.jobById("JOB-T601")?.quoteId;
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject: a job that prices cleanly.
    // Assert: written in draft and surfaced for a person to release; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T701", source: "form", wants: ["FC-LEAD-HR", "FC-SETOUT"], hours: { "FC-LEAD-HR": 5 } }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T701")),
    holds: (world) => {
      const q = world.quotes[0];
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "JOB-T701" && c.request.reason === `ready_to_release:${q?.id}`);
      return world.quotes.length === 1 && q.state === "draft" && surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject: a priced job, then a retrieval of the quote from the system of record.
    // Assert: retrievable by its own id, carrying the lines and total that were drafted.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-T801", source: "call", wants: ["FC-LAB-HR", "FC-APP-HR", "FC-SETOUT"], hours: { "FC-LAB-HR": 22, "FC-APP-HR": 22 }, qty: { "FC-SETOUT": 2 } }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      // Retrieval from the system of record (the world the runner owns), by the id it issued.
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines;
      const expected = 22 * 9800 + 22 * 5800 + 2 * 18000;
      return (
        Boolean(q) &&
        q.jobId === "JOB-T801" &&
        q.lines.length === 3 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate && l.quantity === drafted[i].quantity && byTheBook(l)) &&
        // The system of record extends quantity x unit rate; the stored lines carry the drafted total.
        sumAmounts(q.lines) === write.request.total_ex_gst &&
        write.request.total_ex_gst === expected
      );
    },
    describe,
  },
  {
    checkId: "log-survives",
    // 9. The log survives
    // Inject: any completed draft, then a retrieval by quote_id.
    // Assert: one quote_id returns the source job, the ordered port calls, the catalogue ids and the outcome.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T901", source: "form", wants: ["FC-APP-HR", "FC-LAB-HR"], hours: { "FC-APP-HR": 14, "FC-LAB-HR": 14 } }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T901")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const d = id ? world.dossier(id) : null;
      if (!d) return false;
      const order = d.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iBook = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        d.job?.id === "JOB-T901" &&
        d.job.hours?.["FC-LAB-HR"] === 14 &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "FC-APP-HR,FC-LAB-HR" &&
        iJob >= 0 && iJob < iBook && iBook < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject: a draft raised after the hourly sell-rate changed in the system of record.
    // Assert: the draft carries the changed rate, amounts use it, the superseded rate appears nowhere.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-T1001", source: "call", wants: ["FC-LAB-HR"], hours: { "FC-LAB-HR": 10 } },
          { id: "JOB-T1002", source: "call", wants: ["FC-LAB-HR"], hours: { "FC-LAB-HR": 10 } },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // A first job warms any cache a build might keep. Then the office puts through a rate rise.
      await build(world.ports(), jobCreated("JOB-T1001"));
      world.advance(60 * 60_000);
      world.changePrice("FC-LAB-HR", 10400);
      await build(world.ports(), jobCreated("JOB-T1002"));
    },
    holds: (world) => {
      const first = creates(world).find((c) => c.request.jobId === "JOB-T1001");
      const second = creates(world).find((c) => c.request.jobId === "JOB-T1002");
      if (!first || !second) return false;
      const readBetween = calls(world, "read_pricebook").some((r) => world.calls.indexOf(r) > world.calls.indexOf(first) && world.calls.indexOf(r) < world.calls.indexOf(second));
      const l = second.request.lines;
      return (
        readBetween &&
        l.length === 1 &&
        l[0].rate === 10400 &&
        l[0].amount === 104000 &&
        second.request.total_ex_gst === 104000 &&
        !JSON.stringify(second.request).includes("9800")
      );
    },
    describe,
  },
];

// The check a stub cannot pass. Runs only in production; on the stub it reports with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 11. The pass test passes
    // One real job, once with a line not in the price list, then twice without it.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.TRIM_QUOTE_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 a person drops the off-book line on the real job.
      world.outcomes.push(await build(world.ports(), { name: "job.updated", job_id: jobId }));
      world.outcomes.push(await build(world.ports(), { name: "job.updated", job_id: jobId }));
    },
    holds: (world) => {
      const [r1, r2, r3] = world.outcomes ?? [];
      return (
        r1?.outcome === "parked" && r1.park_reason === "not_in_pricebook" && r1.total_ex_gst === null && (r1.lines?.length ?? 0) > 0 &&
        r2?.outcome === "drafted" && Boolean(r2.external_id) &&
        r3?.outcome === "kept" && r3.quote_id === r2.quote_id && r3.duplicate_of === r2.quote_id
      );
    },
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

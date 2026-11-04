/**
 * One scenario per check of quote-out-build-standard, for Measure Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Measure Quote is
 * woken by a named event, so every drive hands the build `job.created` (or
 * `job.updated`) keyed by the job id.
 *
 * The world is a flooring and finishing business in Australia: its price list
 * sells timber floor and tiling by the square metre, skirting by the lineal
 * metre and doorway trims each. The site measure is entered on the job room by
 * room. Every check also asserts the rule this node adds: a line's amount is the
 * room's measured quantity times the catalogue's own rate, the measure's unit is
 * the item's unit, and nothing else sets a number.
 *
 * Checks a stub cannot pass are in `liveScenarios`; on the stub the runner
 * reports them as `with_us`.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The business's own price list, cents ex GST per unit. The only source of a rate. */
export const BOOK = [
  { catalogueId: "FL-TIMBER-M2", description: "Engineered timber floor, supply and lay, per m2", rate: 12500, unit: "m2" },
  { catalogueId: "FL-TILE-M2", description: "Floor tiling, lay only, per m2", rate: 9500, unit: "m2" },
  { catalogueId: "FL-SKIRT-LM", description: "Skirting, supply and fit, per lineal metre", rate: 2800, unit: "lm" },
  { catalogueId: "FL-TRIM-EA", description: "Doorway transition trim, each", rate: 4500, unit: "each" },
];
const RATES = new Set(BOOK.map((i) => i.rate));
const bookItem = (id) => BOOK.find((b) => b.catalogueId === id);

const m = (room, item, quantity, unit) => ({ room, item, quantity, unit });
const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const firstIndex = (world, pred) => world.calls.findIndex(pred);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is priced by the book rule: real catalogue id, that item's rate and unit, amount = quantity x rate. */
function byTheBook(line, expectedQty, expectedRoom) {
  const item = bookItem(line?.catalogueId);
  return (
    Boolean(item) &&
    line.rate === item.rate &&
    line.unit === item.unit &&
    typeof line.quantity === "number" &&
    (expectedQty === undefined || line.quantity === expectedQty) &&
    (expectedRoom === undefined || line.room === expectedRoom) &&
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
          { id: "JOB-M101", source: "call", measures: [m("Living", "FL-TIMBER-M2", 32.4, "m2"), m("Living", "FL-SKIRT-LM", 24.6, "lm")] },
          { id: "JOB-M102", source: "form", measures: [m("Laundry", "Floor tiling, lay only, per m2", 6.2, "m2")] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // A raw call carrying a job id must not produce a draft.
      await build(world.ports(), { name: "call.received", call_id: "CALL-1", job_id: "JOB-M101" });
      world.callsAfterRawCall = world.calls.length;
      await build(world.ports(), jobCreated("JOB-M101"));
      await build(world.ports(), jobCreated("JOB-M102"));
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
        a.request.jobId === "JOB-M101" &&
        b.request.jobId === "JOB-M102" &&
        byTheBook(a.request.lines.find((l) => l.catalogueId === "FL-TIMBER-M2"), 32.4, "Living") &&
        byTheBook(a.request.lines.find((l) => l.catalogueId === "FL-SKIRT-LM"), 24.6, "Living") &&
        byTheBook(b.request.lines[0], 6.2, "Laundry")
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject: a three-room measure that maps cleanly to the book, and a second job whose skirting
    //         was measured in square metres instead of lineal metres.
    // Assert: a read of the price list precedes the draft, every line carries its catalogue id, room,
    //         unit and the book's rate, each amount is measure x rate; the wrong-unit job drafts nothing
    //         and goes back to the person who owns quotes. No unit is converted.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-M201",
            source: "call",
            measures: [
              m("Bed 1", "FL-TIMBER-M2", 12.6, "m2"),
              m("Bed 2", "FL-TIMBER-M2", 10.8, "m2"),
              m("Ensuite", "FL-TILE-M2", 4.35, "m2"),
              m("Bed 1", "FL-SKIRT-LM", 14.2, "lm"),
              m("Ensuite", "FL-TRIM-EA", 1, "each"),
            ],
          },
          { id: "JOB-M202", source: "form", measures: [m("Hall", "FL-TIMBER-M2", 8, "m2"), m("Hall", "FL-SKIRT-LM", 2.1, "m2")] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-M201")), await build(world.ports(), jobCreated("JOB-M202"))];
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      if (d.request.jobId !== "JOB-M201") return false;
      const readAt = firstIndex(world, (c) => c.port === "read_pricebook");
      if (readAt < 0 || readAt > world.calls.indexOf(d)) return false;
      const lines = d.request.lines ?? [];
      const expected = [
        ["FL-TIMBER-M2", 12.6, "Bed 1"],
        ["FL-TIMBER-M2", 10.8, "Bed 2"],
        ["FL-TILE-M2", 4.35, "Ensuite"],
        ["FL-SKIRT-LM", 14.2, "Bed 1"],
        ["FL-TRIM-EA", 1, "Ensuite"],
      ];
      const expectedTotal = 157500 + 135000 + Math.round(4.35 * 9500) + Math.round(14.2 * 2800) + 4500;
      const back = calls(world, "notify").filter((c) => c.request.jobId === "JOB-M202");
      const second = world.outcomes?.[1];
      return (
        lines.length === 5 &&
        lines.every((l, i) => l.catalogueId === expected[i][0] && byTheBook(l, expected[i][1], expected[i][2])) &&
        d.request.total_ex_gst === expectedTotal &&
        world.outcomes?.[0]?.total_ex_gst === expectedTotal &&
        second?.outcome === "held_for_measure" &&
        second?.total_ex_gst === null &&
        back.length === 1 &&
        String(back[0].request.reason).includes("FL-SKIRT-LM@Hall:measure_unit_mismatch") &&
        !world.jobById("JOB-M202")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject: a measure with one catalogue item and one thing the price list does not cover.
    // Assert: no draft; one escalate with a fixed-list reason and the unmatched line; no invented rate.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-M301", source: "form", measures: [m("Kitchen", "FL-TIMBER-M2", 18.5, "m2"), m("Kitchen", "Polished concrete grind and seal", 18.5, "m2")] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-M301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const reason = esc[0].request.reason;
      const d = JSON.parse(esc[0].request.detail ?? "{}");
      return (
        PARK_REASONS.includes(reason) &&
        reason === "not_in_pricebook" &&
        d.job_id === "JOB-M301" &&
        d.unmatched?.length === 1 &&
        d.unmatched[0].description === "Polished concrete grind and seal" &&
        d.lines?.length === 1 &&
        byTheBook(d.lines[0], 18.5, "Kitchen") &&
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
          { id: "JOB-M401", source: "call", measures: [m("Study", "FL-TIMBER-M2", 9, "m2")], isVariation: true },
          { id: "JOB-M402", source: "form", measures: [m("Bath", "FL-TILE-M2", 5, "m2")], wantsDiscount: true },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-M401"));
      await build(world.ports(), jobCreated("JOB-M402"));
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
        jobs[0] === "JOB-M401" &&
        jobs[1] === "JOB-M402"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject: the same job reaching the standard twice, call then follow-up email minutes later.
    // Assert: one quote; the second pass returned it carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-M501", source: "call", measures: [m("Living", "FL-TIMBER-M2", 40, "m2"), m("Living", "FL-TRIM-EA", 2, "each")] }], pricebook: BOOK }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("JOB-M501"));
      world.advance(7 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "JOB-M501" });
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
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-M601", source: "call", measures: [m("Deck room", "FL-TIMBER-M2", 15, "m2")] }], pricebook: BOOK, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-M601"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(world.calls.indexOf(write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "JOB-M601" && c.request.reason === "write_failed");
      const released = after.some((c) => c.port === "notify" && String(c.request.reason).startsWith("ready_to_release"));
      const out = world.outcomes?.[0];
      return alerted && !released && out?.outcome === "write_failed" && out?.quote_id === null && world.quotes.length === 0 && !world.jobById("JOB-M601")?.quoteId;
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject: a job that prices cleanly.
    // Assert: written in draft and surfaced for a person to release; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-M701", source: "form", measures: [m("Bath", "FL-TILE-M2", 6.5, "m2"), m("Bath", "FL-TRIM-EA", 1, "each")] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-M701")),
    holds: (world) => {
      const q = world.quotes[0];
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "JOB-M701" && c.request.reason === `ready_to_release:${q?.id}`);
      return world.quotes.length === 1 && q.state === "draft" && surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject: a priced job, then a retrieval of the quote from the system of record.
    // Assert: retrievable by its own id, carrying the rooms, quantities, lines and total that were drafted.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-M801",
            source: "call",
            measures: [m("Living", "FL-TIMBER-M2", 28.75, "m2"), m("Living", "FL-SKIRT-LM", 21.3, "lm"), m("Entry", "FL-TRIM-EA", 3, "each")],
          },
        ],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-M801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines;
      const expected = Math.round(28.75 * 12500) + Math.round(21.3 * 2800) + 3 * 4500;
      return (
        Boolean(q) &&
        q.jobId === "JOB-M801" &&
        q.lines.length === 3 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate && l.quantity === drafted[i].quantity && l.room === drafted[i].room && byTheBook(l)) &&
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
    // Assert: one quote_id returns the source job with its measure, the ordered port calls, the catalogue ids and the outcome.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-M901", source: "form", measures: [m("Laundry", "FL-TILE-M2", 5.5, "m2"), m("Laundry", "FL-SKIRT-LM", 9.4, "lm")] }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-M901")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const d = id ? world.dossier(id) : null;
      if (!d) return false;
      const order = d.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iBook = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        d.job?.id === "JOB-M901" &&
        d.job.measures?.[0]?.quantity === 5.5 &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "FL-TILE-M2,FL-SKIRT-LM" &&
        iJob >= 0 && iJob < iBook && iBook < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject: a draft raised after the per-m2 rate changed in the system of record.
    // Assert: the draft carries the changed rate, amounts use it, the superseded rate appears nowhere.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-M1001", source: "call", measures: [m("Living", "FL-TIMBER-M2", 10, "m2")] },
          { id: "JOB-M1002", source: "call", measures: [m("Living", "FL-TIMBER-M2", 10, "m2")] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-M1001"));
      world.advance(60 * 60_000);
      world.changePrice("FL-TIMBER-M2", 13400);
      await build(world.ports(), jobCreated("JOB-M1002"));
    },
    holds: (world) => {
      const first = creates(world).find((c) => c.request.jobId === "JOB-M1001");
      const second = creates(world).find((c) => c.request.jobId === "JOB-M1002");
      if (!first || !second) return false;
      const readBetween = calls(world, "read_pricebook").some((r) => world.calls.indexOf(r) > world.calls.indexOf(first) && world.calls.indexOf(r) < world.calls.indexOf(second));
      const l = second.request.lines;
      return (
        readBetween &&
        l.length === 1 &&
        l[0].rate === 13400 &&
        l[0].amount === 134000 &&
        second.request.total_ex_gst === 134000 &&
        !JSON.stringify(second.request).includes("12500")
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
    // One real job, once with a measure line not in the price list, then twice without it.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.MEASURE_QUOTE_LIVE_JOB_ID;
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

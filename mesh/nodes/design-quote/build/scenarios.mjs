/**
 * One scenario per check of quote-out-build-standard, for Design Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Design Quote is
 * woken by a named event, so every drive hands the build `job.created` (or
 * `job.updated`) keyed by the job id.
 *
 * The world is an Australian solar and hot-water installer: its price book
 * sells panels, inverters, batteries, heat-pump units and the install items
 * for each. The design is done in a separate design tool; once the customer
 * accepts it, the office attaches its equipment list to the job. The design
 * tool shows its own prices, and every one of them is set to differ from the
 * book, so a build that copies them goes red. Every check also asserts the rule
 * this node adds: a line's amount is the design's whole-number quantity times
 * the book's own rate, and nothing else sets a number.
 *
 * Checks a stub cannot pass are in `liveScenarios`; on the stub the runner
 * reports them as `with_us`.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The business's own price book, cents ex GST per unit. The only source of a rate. */
export const BOOK = [
  { catalogueId: "SOL-PNL-440", description: "440 W mono solar panel, supply", rate: 21000 },
  { catalogueId: "SOL-INST-PNL", description: "Panel install on tin roof, per panel", rate: 9500 },
  { catalogueId: "SOL-INV-8K", description: "8 kW hybrid inverter, supply and install", rate: 245000 },
  { catalogueId: "SOL-BAT-13", description: "13.5 kWh home battery, supply and install", rate: 1150000 },
  { catalogueId: "EL-SWB-UPG", description: "Switchboard upgrade for solar", rate: 85000 },
  { catalogueId: "HP-270L", description: "270 L heat-pump hot water unit, supply", rate: 330000 },
  { catalogueId: "HP-INST-SWAP", description: "Heat-pump install, like-for-like swap", rate: 120000 },
];
const RATES = new Set(BOOK.map((i) => i.rate));
const bookItem = (id) => BOOK.find((b) => b.catalogueId === id);

/** What the design tool showed. Never a rate here. All differ from the book. */
const DESIGN_PRICES = [19990, 8800, 239900, 1099000, 79900, 315000, 110000];

const d = (item, quantity, design_price, kind) => ({ item, quantity, ...(design_price ? { design_price } : {}), ...(kind ? { kind } : {}) });
const proposal = (id, system, lines, status = "accepted") => ({ id, status, system, lines });
const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const firstIndex = (world, pred) => world.calls.findIndex(pred);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is priced by the book rule: real catalogue id, that item's rate, whole quantity, amount = quantity x rate. */
function byTheBook(line, expectedQty) {
  const item = bookItem(line?.catalogueId);
  return (
    Boolean(item) &&
    line.rate === item.rate &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0 &&
    (expectedQty === undefined || line.quantity === expectedQty) &&
    line.amount === line.quantity * item.rate
  );
}
const sumAmounts = (lines) => lines.reduce((s, l) => s + l.amount, 0);

/** No design-tool price appears anywhere a build wrote or escalated. */
function noDesignPrice(world) {
  const written = JSON.stringify([...calls(world, "draft_quote").map((c) => c.request), ...world.escalations]);
  return DESIGN_PRICES.every((p) => !new RegExp(`\\b${p}\\b`).test(written));
}

/** Every number in an escalation is a rate from the book, and no unmatched line carries one. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    const x = e.detail ? JSON.parse(e.detail) : {};
    for (const l of x.lines ?? []) if (!RATES.has(l.rate) || !byTheBook(l)) return false;
    for (const u of x.unmatched ?? []) if ("rate" in u || "unit_rate" in u || "amount" in u || "quantity" in u) return false;
    if (x.total_ex_gst !== undefined && x.total_ex_gst !== null) return false;
  }
  for (const c of calls(world, "draft_quote")) for (const l of c.request?.lines ?? []) if (!RATES.has(l.rate)) return false;
  return noDesignPrice(world);
}

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject: a raw call carrying a job id, an accepted solar design on one job, an accepted
    //         heat-pump design on another, and a third job whose design was sent but not accepted.
    // Assert: only the two accepted jobs draft, each after a read of its own job, carrying that id.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-S101", source: "call", proposal: proposal("PR-5101", "solar", [d("SOL-PNL-440", 16, 19990), d("SOL-INST-PNL", 16, 8800), d("SOL-INV-8K", 1, 239900)]) },
          { id: "JOB-S102", source: "form", proposal: proposal("PR-5102", "heat_pump", [d("270 L heat-pump hot water unit, supply", 1, 315000), d("HP-INST-SWAP", 1, 110000)]) },
          { id: "JOB-S103", source: "form", proposal: proposal("PR-5103", "solar", [d("SOL-PNL-440", 10, 19990)], "sent") },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // A raw call carrying a job id must not produce a draft.
      await build(world.ports(), { name: "call.received", call_id: "CALL-1", job_id: "JOB-S101" });
      world.callsAfterRawCall = world.calls.length;
      await build(world.ports(), jobCreated("JOB-S101"));
      await build(world.ports(), jobCreated("JOB-S102"));
      await build(world.ports(), { name: "job.updated", job_id: "JOB-S103" });
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 2) return false;
      const readFirst = drafts.every((x) => {
        const at = world.calls.indexOf(x);
        return Boolean(x.request.jobId) && world.calls.slice(0, at).some((c) => c.port === "read_job" && c.request?.jobId === x.request.jobId && c.response?.id === x.request.jobId);
      });
      const [a, b] = drafts;
      const la = a.request.lines ?? [];
      const lb = b.request.lines ?? [];
      return (
        world.callsAfterRawCall === 0 &&
        readFirst &&
        a.request.jobId === "JOB-S101" &&
        b.request.jobId === "JOB-S102" &&
        la.length === 3 &&
        byTheBook(la.find((l) => l.catalogueId === "SOL-PNL-440"), 16) &&
        byTheBook(la.find((l) => l.catalogueId === "SOL-INST-PNL"), 16) &&
        byTheBook(la.find((l) => l.catalogueId === "SOL-INV-8K"), 1) &&
        lb.length === 2 &&
        byTheBook(lb.find((l) => l.catalogueId === "HP-270L"), 1) &&
        byTheBook(lb.find((l) => l.catalogueId === "HP-INST-SWAP"), 1) &&
        !world.jobById("JOB-S103")?.quoteId &&
        calls(world, "escalate").length === 0 &&
        noDesignPrice(world)
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject: an accepted solar-and-battery design whose design-tool prices all differ from the book,
    //         and a second accepted design that lists 12.5 panels.
    // Assert: a read of the price book precedes the draft; every line carries its catalogue id, the
    //         book's rate and the design's count; each amount is count x rate; no design-tool price
    //         appears; the half-panel job drafts nothing and goes back to the person who owns quotes.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-S201",
            source: "call",
            proposal: proposal("PR-5201", "solar", [
              d("SOL-PNL-440", 24, 19990),
              d("SOL-INST-PNL", 24, 8800),
              d("SOL-INV-8K", 1, 239900),
              d("SOL-BAT-13", 1, 1099000),
              d("Switchboard upgrade for solar", 1, 79900),
            ]),
          },
          { id: "JOB-S202", source: "form", proposal: proposal("PR-5202", "solar", [d("SOL-PNL-440", 12.5, 19990), d("SOL-INV-8K", 1, 239900)]) },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-S201")), await build(world.ports(), jobCreated("JOB-S202"))];
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const x = drafts[0];
      if (x.request.jobId !== "JOB-S201") return false;
      const readAt = firstIndex(world, (c) => c.port === "read_pricebook");
      if (readAt < 0 || readAt > world.calls.indexOf(x)) return false;
      const lines = x.request.lines ?? [];
      const expected = [
        ["SOL-PNL-440", 24],
        ["SOL-INST-PNL", 24],
        ["SOL-INV-8K", 1],
        ["SOL-BAT-13", 1],
        ["EL-SWB-UPG", 1],
      ];
      const expectedTotal = 24 * 21000 + 24 * 9500 + 245000 + 1150000 + 85000;
      const back = calls(world, "notify").filter((c) => c.request.jobId === "JOB-S202");
      const second = world.outcomes?.[1];
      return (
        lines.length === 5 &&
        lines.every((l, i) => l.catalogueId === expected[i][0] && byTheBook(l, expected[i][1])) &&
        x.request.total_ex_gst === expectedTotal &&
        world.outcomes?.[0]?.total_ex_gst === expectedTotal &&
        noDesignPrice(world) &&
        second?.outcome === "held_for_design" &&
        second?.total_ex_gst === null &&
        back.length === 1 &&
        String(back[0].request.reason).includes("SOL-PNL-440:quantity_not_whole") &&
        !world.jobById("JOB-S202")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject: an accepted design with panels from the book and a bird-proofing kit the book does not carry.
    // Assert: no draft; one escalate with a fixed-list reason and the unmatched line; no invented rate.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-S301", source: "form", proposal: proposal("PR-5301", "solar", [d("SOL-PNL-440", 18, 19990), d("Bird-proofing mesh kit, 30 m", 1, 45000)]) }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-S301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const reason = esc[0].request.reason;
      const x = JSON.parse(esc[0].request.detail ?? "{}");
      return (
        PARK_REASONS.includes(reason) &&
        reason === "not_in_pricebook" &&
        x.job_id === "JOB-S301" &&
        x.unmatched?.length === 1 &&
        x.unmatched[0].description === "Bird-proofing mesh kit, 30 m" &&
        x.lines?.length === 1 &&
        byTheBook(x.lines[0], 18) &&
        x.total_ex_gst === null &&
        !JSON.stringify(x).includes("45000") &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject: a variation to an accepted quote, a job carrying a discount request, and an accepted
    //         design carrying an STC deduction line.
    // Assert: all three escalate with a typed reason; none drafts.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-S401", source: "call", isVariation: true, proposal: proposal("PR-5401", "solar", [d("SOL-PNL-440", 4, 19990)]) },
          { id: "JOB-S402", source: "form", wantsDiscount: true, proposal: proposal("PR-5402", "heat_pump", [d("HP-270L", 1, 315000)]) },
          { id: "JOB-S403", source: "form", proposal: proposal("PR-5403", "solar", [d("SOL-PNL-440", 20, 19990), d("SOL-INV-8K", 1, 239900), d("STC point-of-sale deduction", 1, -310000, "rebate")]) },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-S401"));
      await build(world.ports(), jobCreated("JOB-S402"));
      await build(world.ports(), jobCreated("JOB-S403"));
    },
    holds: (world) => {
      const esc = calls(world, "escalate");
      const reasons = esc.map((c) => c.request.reason);
      const jobs = esc.map((c) => JSON.parse(c.request.detail ?? "{}").job_id);
      return (
        calls(world, "draft_quote").length === 0 &&
        world.quotes.length === 0 &&
        reasons.length === 3 &&
        reasons[0] === "variation_to_accepted_quote" &&
        reasons[1] === "discount_requested" &&
        reasons[2] === "discount_requested" &&
        jobs.join(",") === "JOB-S401,JOB-S402,JOB-S403"
      );
    },
    describe,
  },
  {
    checkId: "one-quote-per-job",
    // 5. One quote per job
    // Inject: the same job reaching the node twice, created then updated minutes later.
    // Assert: one quote; the second pass returned it carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-S501", source: "call", proposal: proposal("PR-5501", "heat_pump", [d("HP-270L", 1, 315000), d("HP-INST-SWAP", 1, 110000)]) }], pricebook: BOOK }),
    drive: async (build, world) => {
      const first = await build(world.ports(), jobCreated("JOB-S501"));
      world.advance(7 * 60_000);
      const second = await build(world.ports(), { name: "job.updated", job_id: "JOB-S501" });
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
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-S601", source: "call", proposal: proposal("PR-5601", "solar", [d("SOL-PNL-440", 14, 19990)]) }], pricebook: BOOK, failNextWrite: true }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), jobCreated("JOB-S601"))];
    },
    holds: (world) => {
      const write = calls(world, "draft_quote")[0];
      if (!write || write.response?.id !== null) return false;
      const after = world.calls.slice(world.calls.indexOf(write) + 1);
      const alerted = after.some((c) => c.port === "notify" && c.request.jobId === "JOB-S601" && c.request.reason === "write_failed");
      const released = after.some((c) => c.port === "notify" && String(c.request.reason).startsWith("ready_to_release"));
      const out = world.outcomes?.[0];
      return alerted && !released && out?.outcome === "write_failed" && out?.quote_id === null && world.quotes.length === 0 && !world.jobById("JOB-S601")?.quoteId;
    },
    describe,
  },
  {
    checkId: "draft-never-sends",
    // 7. The draft does not send itself
    // Inject: an accepted design that prices cleanly.
    // Assert: written in draft and surfaced for a person to release; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-S701", source: "form", proposal: proposal("PR-5701", "heat_pump", [d("HP-270L", 1, 315000), d("HP-INST-SWAP", 1, 110000)]) }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-S701")),
    holds: (world) => {
      const q = world.quotes[0];
      const SEND_PORTS = new Set(["send_sms", "send_email", "issue_notice", "send", "gate"]);
      const surfaced = calls(world, "notify").some((c) => c.request.jobId === "JOB-S701" && c.request.reason === `ready_to_release:${q?.id}`);
      return world.quotes.length === 1 && q.state === "draft" && surfaced && !world.calls.some((c) => SEND_PORTS.has(c.port) || /send/i.test(c.verb ?? ""));
    },
    describe,
  },
  {
    checkId: "quote-is-not-ours",
    // 8. The quote lives in their system
    // Inject: an accepted design, then a retrieval of the quote from the system of record.
    // Assert: retrievable by its own id, carrying the design id, counts, lines and total that were drafted.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-S801", source: "call", proposal: proposal("PR-5801", "solar", [d("SOL-PNL-440", 22, 19990), d("SOL-INST-PNL", 22, 8800), d("SOL-INV-8K", 1, 239900)]) }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-S801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines;
      const expected = 22 * 21000 + 22 * 9500 + 245000;
      return (
        Boolean(q) &&
        q.jobId === "JOB-S801" &&
        q.lines.length === 3 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate && l.quantity === drafted[i].quantity && l.proposal_id === "PR-5801" && byTheBook(l)) &&
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
    // Assert: one quote_id returns the source job with its accepted design, the ordered port calls, the catalogue ids and the outcome.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-S901", source: "form", proposal: proposal("PR-5901", "solar", [d("SOL-BAT-13", 1, 1099000), d("EL-SWB-UPG", 1, 79900)]) }], pricebook: BOOK }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-S901")),
    holds: (world) => {
      const id = creates(world)[0]?.response?.id;
      const x = id ? world.dossier(id) : null;
      if (!x) return false;
      const order = x.calls.map((c) => c.port);
      const iJob = order.indexOf("read_job");
      const iBook = order.indexOf("read_pricebook");
      const iDraft = order.indexOf("draft_quote");
      return (
        x.job?.id === "JOB-S901" &&
        x.job.proposal?.id === "PR-5901" &&
        x.job.proposal.status === "accepted" &&
        x.quote.state === "draft" &&
        x.catalogueIds.join(",") === "SOL-BAT-13,EL-SWB-UPG" &&
        iJob >= 0 && iJob < iBook && iBook < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject: a draft raised after the panel's sell-rate changed in the system of record.
    // Assert: the draft carries the changed rate, amounts use it, the superseded rate appears nowhere.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-S1001", source: "call", proposal: proposal("PR-6001", "solar", [d("SOL-PNL-440", 10, 19990)]) },
          { id: "JOB-S1002", source: "call", proposal: proposal("PR-6002", "solar", [d("SOL-PNL-440", 10, 19990)]) },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-S1001"));
      world.advance(60 * 60_000);
      world.changePrice("SOL-PNL-440", 22400);
      await build(world.ports(), jobCreated("JOB-S1002"));
    },
    holds: (world) => {
      const first = creates(world).find((c) => c.request.jobId === "JOB-S1001");
      const second = creates(world).find((c) => c.request.jobId === "JOB-S1002");
      if (!first || !second) return false;
      const readBetween = calls(world, "read_pricebook").some((r) => world.calls.indexOf(r) > world.calls.indexOf(first) && world.calls.indexOf(r) < world.calls.indexOf(second));
      const l = second.request.lines;
      return (
        readBetween &&
        first.request.lines?.[0]?.rate === 21000 &&
        l.length === 1 &&
        l[0].rate === 22400 &&
        l[0].amount === 224000 &&
        second.request.total_ex_gst === 224000 &&
        !JSON.stringify(second.request).includes("21000")
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
    // One real job with an accepted design, once with an item not in the price book, then twice without it.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.DESIGN_QUOTE_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 a person drops the off-book item from the design on the real job.
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

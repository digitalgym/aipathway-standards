/**
 * One scenario per check of quote-out-build-standard, for Takeoff Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init quote-out-build-standard`, from
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * The checks are fetched at run time; what is here is the world each check
 * starts in, how the build is driven, and what "held" means. Takeoff Quote is
 * woken by a named event, so every drive hands the build `job.created` (or
 * `job.updated`) keyed by the job id.
 *
 * The world is an Australian electrical contractor pricing tenders. Its price
 * list holds pre-builds (a double GPO, an LED downlight, a one-gang switch, an
 * exhaust fan whose sell price is not set) sold each, and cable and conduit sold
 * by the lineal metre. Each item carries the drawing symbol or run layer it is
 * taken off by. The tender drawings are on the job as takeoff-layer exports.
 * Every check also asserts the rule this node adds: counts and lengths come off
 * current sheets only, at each sheet's own scale, and a line's amount is that
 * quantity times the catalogue's own rate.
 *
 * Checks a stub cannot pass are in `liveScenarios`; on the stub the runner
 * reports them as `with_us`.
 */

import { QuoteWorld } from "@aipathway/conformance";

/** Section 4 of the standard: the fixed list a park reason must come from. */
const PARK_REASONS = ["not_in_pricebook", "variation_to_accepted_quote", "discount_requested", "pricebook_unreadable"];

/** The business's own price list, cents ex GST per unit. The only source of a rate. */
export const BOOK = [
  { catalogueId: "PB-GPO-DBL", description: "Double GPO, supply and install (pre-build)", rate: 9800, unit: "each", kind: "prebuild", symbol: "GPO-DBL" },
  { catalogueId: "PB-DL-LED", description: "LED downlight, supply and install (pre-build)", rate: 6500, unit: "each", kind: "prebuild", symbol: "DL" },
  { catalogueId: "PB-SW-1G", description: "One-gang switch, supply and install (pre-build)", rate: 5200, unit: "each", kind: "prebuild", symbol: "SW1" },
  { catalogueId: "PB-EXFAN", description: "Ducted exhaust fan (pre-build, sell price not set)", rate: null, unit: "each", kind: "prebuild", symbol: "EXF", components: ["PT-FAN-UNIT", "PT-DUCT-100"] },
  { catalogueId: "PT-FAN-UNIT", description: "Exhaust fan unit, 150 mm", rate: 15000, unit: "each", kind: "part" },
  { catalogueId: "PT-DUCT-100", description: "Flexible duct, 100 mm, per pack", rate: 3000, unit: "each", kind: "part" },
  { catalogueId: "CB-TPS-25", description: "2.5 mm TPS cable, supply and run, per lm", rate: 450, unit: "lm", kind: "part", layer: "E-CABLE-25" },
  { catalogueId: "CT-25-LM", description: "25 mm conduit, supply and fix, per lm", rate: 1200, unit: "lm", kind: "part", layer: "E-CONDUIT-25" },
];
const RATES = new Set(BOOK.map((i) => i.rate).filter((r) => typeof r === "number"));
const bookItem = (id) => BOOK.find((b) => b.catalogueId === id);

// Drawing helpers. Paper units are millimetres.
const syms = (block, n) => Array.from({ length: n }, (_, i) => ({ block, x: 10 * i, y: 5 }));
const run = (layer, points) => ({ layer, points });
const sheet = (s, o = {}) => ({ sheet: s, revision: o.revision ?? "T1", status: o.status ?? "current", scale: "scale" in o ? o.scale : 100, symbols: o.symbols ?? [], runs: o.runs ?? [] });

const jobCreated = (job_id) => ({ name: "job.created", job_id });
const calls = (world, port) => world.calls.filter((c) => c.port === port);
const creates = (world) => calls(world, "draft_quote").filter((c) => !("update" in (c.request ?? {})));
const firstIndex = (world, pred) => world.calls.findIndex(pred);
const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; ${world.quotes.length} quote(s), ${world.escalations.length} escalation(s), ${world.alerts.length} alert(s)`;

/** A line is priced by the book rule: real catalogue id, that item's rate and unit, amount = quantity x rate. */
function byTheBook(line, expectedQty) {
  const item = bookItem(line?.catalogueId);
  return (
    Boolean(item) &&
    typeof item.rate === "number" &&
    line.rate === item.rate &&
    line.unit === item.unit &&
    typeof line.quantity === "number" &&
    (expectedQty === undefined || line.quantity === expectedQty) &&
    line.amount === Math.round(line.quantity * item.rate)
  );
}
const lineFor = (lines, id) => (lines ?? []).find((l) => l.catalogueId === id);
const sumAmounts = (lines) => lines.reduce((s, l) => s + l.amount, 0);

/** Every number in an escalation is a rate from the book, and no unmatched line carries one. */
function noInventedRate(world) {
  for (const e of world.escalations) {
    const d = e.detail ? JSON.parse(e.detail) : {};
    for (const l of d.lines ?? []) if (!RATES.has(l.rate) || !byTheBook(l)) return false;
    for (const u of d.unmatched ?? []) if ("rate" in u || "unit_rate" in u || "amount" in u) return false;
    if (d.total_ex_gst !== undefined && d.total_ex_gst !== null) return false;
  }
  for (const c of calls(world, "draft_quote")) for (const l of c.request?.lines ?? []) if (!RATES.has(l.rate)) return false;
  return true;
}

export const scenarios = [
  {
    checkId: "job-is-the-trigger",
    // 1. A job is the only trigger
    // Inject: a tender job created from a call, and a second from an overnight web form, each with drawings.
    // Assert: each draft is preceded by a read of its job, carries that job's id, and is the takeoff priced by the book.
    world: () =>
      new QuoteWorld({
        jobs: [
          // E-01 at 1:100: 4 GPOs, 6 downlights, one cable run 50 + 30 mm paper = 8.00 m.
          { id: "JOB-T101", source: "call", drawings: [sheet("E-01", { symbols: [...syms("GPO-DBL", 4), ...syms("DL", 6)], runs: [run("E-CABLE-25", [[0, 0], [50, 0], [50, 30]])] })] },
          { id: "JOB-T102", source: "form", drawings: [sheet("E-01", { symbols: syms("SW1", 3) })] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      // A raw call carrying a job id must not produce a draft.
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
        a.request.lines?.length === 3 &&
        byTheBook(lineFor(a.request.lines, "PB-GPO-DBL"), 4) &&
        byTheBook(lineFor(a.request.lines, "PB-DL-LED"), 6) &&
        byTheBook(lineFor(a.request.lines, "CB-TPS-25"), 8) &&
        b.request.lines?.length === 1 &&
        byTheBook(lineFor(b.request.lines, "PB-SW-1G"), 3)
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-the-only-source",
    // 2. The price list is the only source of a rate
    // Inject: a three-sheet tender (one sheet superseded, two at different scales, a diagonal run),
    //         a job with a cable run on an unscaled sheet, and a job with two current revisions of one sheet.
    // Assert: a read of the price list precedes the draft; counts and lengths come off current sheets
    //         at each sheet's scale; each amount is quantity x the book's rate; the two problem jobs draft
    //         nothing and go back to the person who owns quotes. No scale is guessed.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-T201",
            source: "call",
            drawings: [
              sheet("E-01", { revision: "A", status: "superseded", symbols: syms("GPO-DBL", 20), runs: [run("E-CABLE-25", [[0, 0], [500, 0]])] }),
              // 1:100. 5 GPOs, 2 switches. Cable: 3-4-5 diagonal 50 mm -> 5.00 m. Conduit 120 mm -> 12.00 m.
              sheet("E-01", { revision: "B", symbols: [...syms("GPO-DBL", 5), ...syms("SW1", 2)], runs: [run("E-CABLE-25", [[0, 0], [30, 40]]), run("E-CONDUIT-25", [[0, 0], [120, 0]])] }),
              // 1:50. 3 GPOs, 8 downlights. Cable 73.5 mm -> 3.675 m, totals 8.675 -> 8.68 m.
              sheet("E-02", { revision: "B", scale: 50, symbols: [...syms("GPO-DBL", 3), ...syms("DL", 8)], runs: [run("E-CABLE-25", [[0, 0], [40, 0], [40, 33.5]])] }),
            ],
          },
          { id: "JOB-T202", source: "form", drawings: [sheet("E-03", { scale: null, symbols: syms("DL", 4), runs: [run("E-CABLE-25", [[0, 0], [60, 0]])] })] },
          { id: "JOB-T203", source: "form", drawings: [sheet("E-04", { revision: "C", symbols: syms("DL", 2) }), sheet("E-04", { revision: "D", symbols: syms("DL", 3) })] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      world.outcomes = [];
      for (const id of ["JOB-T201", "JOB-T202", "JOB-T203"]) world.outcomes.push(await build(world.ports(), jobCreated(id)));
    },
    holds: (world) => {
      const drafts = creates(world);
      if (drafts.length !== 1) return false;
      const d = drafts[0];
      if (d.request.jobId !== "JOB-T201") return false;
      const readAt = firstIndex(world, (c) => c.port === "read_pricebook");
      if (readAt < 0 || readAt > world.calls.indexOf(d)) return false;
      const lines = d.request.lines ?? [];
      const expectedTotal = 8 * 9800 + 2 * 5200 + 8 * 6500 + Math.round(8.68 * 450) + 12 * 1200;
      const [, second, third] = world.outcomes ?? [];
      const backFor = (id) => calls(world, "notify").filter((c) => c.request.jobId === id);
      return (
        lines.length === 5 &&
        byTheBook(lineFor(lines, "PB-GPO-DBL"), 8) &&
        byTheBook(lineFor(lines, "PB-SW-1G"), 2) &&
        byTheBook(lineFor(lines, "PB-DL-LED"), 8) &&
        byTheBook(lineFor(lines, "CB-TPS-25"), 8.68) &&
        byTheBook(lineFor(lines, "CT-25-LM"), 12) &&
        d.request.total_ex_gst === expectedTotal &&
        world.outcomes?.[0]?.total_ex_gst === expectedTotal &&
        second?.outcome === "held_for_takeoff" &&
        second?.total_ex_gst === null &&
        backFor("JOB-T202").length === 1 &&
        String(backFor("JOB-T202")[0].request.reason).includes("E-03@E-CABLE-25@takeoff_unscaled") &&
        third?.outcome === "held_for_takeoff" &&
        backFor("JOB-T203").length === 1 &&
        String(backFor("JOB-T203")[0].request.reason).includes("E-04@takeoff_revision_conflict") &&
        !world.jobById("JOB-T202")?.quoteId &&
        !world.jobById("JOB-T203")?.quoteId
      );
    },
    describe,
  },
  {
    checkId: "unpriceable-is-parked",
    // 3. What cannot be priced is parked
    // Inject: a tender with GPOs (in the book), two ducted exhaust fans (a pre-build with no sell price,
    //         though its parts are priced) and an EV charger symbol the book does not carry.
    // Assert: no draft; one escalate with a fixed-list reason, the priced line attached, both gaps listed,
    //         no total, and the pre-build is not rebuilt from the prices of its parts.
    world: () =>
      new QuoteWorld({
        jobs: [{ id: "JOB-T301", source: "form", drawings: [sheet("E-01", { symbols: [...syms("GPO-DBL", 6), ...syms("EXF", 2), ...syms("EVCHG", 1)] })] }],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T301")),
    holds: (world) => {
      if (calls(world, "draft_quote").length !== 0 || world.quotes.length !== 0) return false;
      const esc = calls(world, "escalate");
      if (esc.length !== 1) return false;
      const reason = esc[0].request.reason;
      const d = JSON.parse(esc[0].request.detail ?? "{}");
      const text = JSON.stringify(d);
      return (
        PARK_REASONS.includes(reason) &&
        reason === "not_in_pricebook" &&
        d.job_id === "JOB-T301" &&
        d.unmatched?.length === 2 &&
        d.unmatched.some((u) => /PB-EXFAN/.test(u.description) && u.park_reason === "not_in_pricebook") &&
        d.unmatched.some((u) => /EVCHG/.test(u.description) && u.park_reason === "not_in_pricebook") &&
        d.lines?.length === 1 &&
        byTheBook(d.lines[0], 6) &&
        d.lines[0].catalogueId === "PB-GPO-DBL" &&
        d.total_ex_gst === null &&
        !text.includes("PT-FAN-UNIT") &&
        !text.includes("18000") &&
        noInventedRate(world)
      );
    },
    describe,
  },
  {
    checkId: "no-variation-pricing",
    // 4. Variations and discounts stay with a person
    // Inject: a variation to an accepted quote, then a tender job carrying a discount request.
    // Assert: both escalate with a typed reason; neither drafts.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-T401", source: "call", drawings: [sheet("E-01", { symbols: syms("DL", 4) })], isVariation: true },
          { id: "JOB-T402", source: "form", drawings: [sheet("E-01", { symbols: syms("GPO-DBL", 2) })], wantsDiscount: true },
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
    // Inject: the same tender job reaching the standard twice, call then follow-up email minutes later.
    // Assert: one quote; the second pass returned it carrying duplicate_of, not a create.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T501", source: "call", drawings: [sheet("E-01", { symbols: [...syms("GPO-DBL", 10), ...syms("SW1", 4)] })] }], pricebook: BOOK }),
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
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T601", source: "call", drawings: [sheet("E-01", { symbols: syms("DL", 12) })] }], pricebook: BOOK, failNextWrite: true }),
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
    // Inject: a tender that prices cleanly.
    // Assert: written in draft and surfaced for a person to release; no send port in the trace.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T701", source: "form", drawings: [sheet("E-01", { symbols: syms("GPO-DBL", 3), runs: [run("E-CONDUIT-25", [[0, 0], [0, 45]])] })] }], pricebook: BOOK }),
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
    // Inject: a priced tender, then a retrieval of the quote from the system of record.
    // Assert: retrievable by its own id, carrying the lines, quantities, sheets and total that were drafted.
    world: () =>
      new QuoteWorld({
        jobs: [
          {
            id: "JOB-T801",
            source: "call",
            drawings: [
              sheet("E-01", { symbols: [...syms("GPO-DBL", 7), ...syms("DL", 9)], runs: [run("E-CABLE-25", [[0, 0], [90, 0], [90, 120]])] }),
              sheet("E-02", { scale: 200, runs: [run("E-CABLE-25", [[0, 0], [25, 0]])] }),
            ],
          },
        ],
        pricebook: BOOK,
      }),
    drive: (build, world) => build(world.ports(), jobCreated("JOB-T801")),
    holds: (world) => {
      const write = creates(world)[0];
      if (!write?.response?.id) return false;
      const q = world.quotes.find((x) => x.id === write.response.id);
      const drafted = write.request.lines;
      // Cable: 210 mm at 1:100 = 21 m, plus 25 mm at 1:200 = 5 m, 26 m on E-01 and E-02.
      const expected = 7 * 9800 + 9 * 6500 + 26 * 450;
      const cable = q ? lineFor(q.lines, "CB-TPS-25") : null;
      return (
        Boolean(q) &&
        q.jobId === "JOB-T801" &&
        q.lines.length === 3 &&
        q.lines.length === drafted.length &&
        q.lines.every((l, i) => l.catalogueId === drafted[i].catalogueId && l.rate === drafted[i].rate && l.quantity === drafted[i].quantity && byTheBook(l)) &&
        byTheBook(cable, 26) &&
        JSON.stringify(cable.sheets) === JSON.stringify(["E-01", "E-02"]) &&
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
    // Assert: one quote_id returns the source job with its drawings, the ordered port calls, the catalogue ids and the outcome.
    world: () => new QuoteWorld({ jobs: [{ id: "JOB-T901", source: "form", drawings: [sheet("E-01", { revision: "T3", symbols: syms("SW1", 5), runs: [run("E-CABLE-25", [[0, 0], [0, 64]])] })] }], pricebook: BOOK }),
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
        d.job.drawings?.[0]?.revision === "T3" &&
        d.quote.state === "draft" &&
        d.catalogueIds.join(",") === "PB-SW-1G,CB-TPS-25" &&
        iJob >= 0 && iJob < iBook && iBook < iDraft
      );
    },
    describe,
  },
  {
    checkId: "pricebook-is-current",
    // 10. The price list was read, not remembered
    // Inject: a draft raised after the double GPO pre-build's sell price changed in the system of record.
    // Assert: the draft carries the changed rate, amounts use it, the superseded rate appears nowhere.
    world: () =>
      new QuoteWorld({
        jobs: [
          { id: "JOB-T1001", source: "call", drawings: [sheet("E-01", { symbols: syms("GPO-DBL", 10) })] },
          { id: "JOB-T1002", source: "call", drawings: [sheet("E-01", { symbols: syms("GPO-DBL", 10) })] },
        ],
        pricebook: BOOK,
      }),
    drive: async (build, world) => {
      await build(world.ports(), jobCreated("JOB-T1001"));
      world.advance(60 * 60_000);
      world.changePrice("PB-GPO-DBL", 10400);
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
    // One real tender job, once with a symbol the price list does not cover, then twice without it.
    world: () => new QuoteWorld(),
    drive: async (build, world) => {
      const jobId = process.env.TAKEOFF_QUOTE_LIVE_JOB_ID;
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), jobCreated(jobId)));
      // Between run 1 and run 2 a person adds the missing item to the price list, or drops the symbol.
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

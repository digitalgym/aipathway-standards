/**
 * One scenario per check of invoice-check-build-standard, for Bill Check.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-check-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory.
 */

import { InvoiceWorld } from "@aipathway/conformance";

const TOLERANCES = [
  { check: "rate", withinCents: 0, effectiveFrom: "2026-07-01T00:00:00.000Z" },
  { check: "quantity", withinCents: 0, effectiveFrom: "2026-07-01T00:00:00.000Z" },
  { check: "variation", withinCents: 0, effectiveFrom: "2026-07-01T00:00:00.000Z" },
  { check: "contract_sum", withinCents: 200, effectiveFrom: "2026-07-01T00:00:00.000Z" }, // a $2 rounding allowance
];

/** A PO at $80 a unit, contract $10,000 with $500 approved in writing. */
const po = (id, supplierId, over = {}) => ({
  id,
  supplierId,
  amount: 800000,
  unitRateCents: 8000,
  contractSumCents: 1000000,
  approvedVariationsCents: 50000,
  open: true,
  ...over,
});

/** A bill that matches its PO exactly: 10 units at $80, 10 complete, none claimed before. */
const bill = (id, supplierId, poId, over = {}) => ({
  id,
  supplierId,
  amount: 80000,
  poId,
  documents: [`doc://inbox/${id}.pdf`],
  lines: [{ description: "Supply and install, stage 2", unitRateCents: 8000, quantity: 10, inScope: true }],
  completedQuantity: 10,
  previouslyClaimedQuantity: 0,
  cumulativeClaimedCents: 80000,
  ...over,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const noPayment = (world) => world.releases.length === 0 && callsTo(world, "release_payment").length === 0;

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // 1. Fails quantity (12 claimed, 10 complete) and also the contract sum.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-1", "S-1")],
        invoices: [
          bill("B-1", "S-1", "PO-1", {
            amount: 96000,
            lines: [{ description: "Supply and install, stage 2", unitRateCents: 8000, quantity: 12, inScope: true }],
            cumulativeClaimedCents: 1200000,
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const recs = world.recordsFor("B-1");
      const names = recs.map((r) => r.checkName);
      const ex = world.exceptions.filter((e) => e.invoiceId === "B-1");
      return (
        names.join(",") === "rate,quantity" &&
        recs[0].passed === true &&
        recs[1].passed === false &&
        ex.length === 1 &&
        ex[0].checkName === "quantity" &&
        world.queuesFor("B-1").join() === "needs_decision"
      );
    },
    describe: (world) => `checks run: ${world.recordsFor("B-1").map((r) => `${r.checkName}=${r.passed}`).join(", ")}; exceptions: ${world.exceptions.map((e) => e.checkName).join(", ")}`,
  },
  {
    checkId: "no-po-escalates",
    // 2. No PO on the bill; the supplier has exactly one open PO of a similar amount.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-2", "S-2", { amount: 81000 })],
        invoices: [bill("B-2", "S-2", undefined)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      world.escalations.some((e) => e.invoiceId === "B-2") &&
      world.queuesFor("B-2").join() === "blocked" &&
      world.recordsFor("B-2").length === 0 &&
      !world.calls.some((c) => JSON.stringify(c.request).includes("PO-2")) &&
      noPayment(world),
    describe: (world) => `escalations: ${JSON.stringify(world.escalations)}; queues: ${world.queuesFor("B-2")}`,
  },
  {
    checkId: "variation-against-a-record",
    // 3. Over its PO by an out-of-scope line, a verbal approval noted, no written record.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-3", "S-3")],
        documents: [{ ref: "doc://approvals/VAR-OTHER", kind: "variation_approval" }],
        invoices: [
          bill("B-3", "S-3", "PO-3", {
            amount: 110000,
            lines: [
              { description: "Supply and install, stage 2", unitRateCents: 8000, quantity: 10, inScope: true },
              { description: "Variation 3: additional works as discussed", unitRateCents: 30000, quantity: 1, inScope: false, approvalRef: "doc://approvals/VAR-3" },
            ],
            cumulativeClaimedCents: 110000,
            verbalApprovalNote: "Site manager approved this on the phone, all good",
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const v = world.recordsFor("B-3").find((r) => r.checkName === "variation");
      const ex = world.exceptions.find((e) => e.invoiceId === "B-3");
      const looked = callsTo(world, "evidence", (c) => c.request.document === "doc://approvals/VAR-3").length === 1;
      return v?.passed === false && ex?.checkName === "variation" && ex.differenceCents === 30000 && !world.queuesFor("B-3").includes("done_reversible") && looked && noPayment(world);
    },
    describe: (world) => `records: ${JSON.stringify(world.recordsFor("B-3"))}; queues: ${world.queuesFor("B-3")}`,
  },
  {
    checkId: "exactly-one-queue",
    // 4. One bill per queue, plus one that could arguably be two: no PO named
    //    AND no source document (waiting on the supplier, or blocked?).
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-4", "S-4")],
        invoices: [
          bill("Q-decision", "S-4", "PO-4", { lines: [{ description: "Supply and install, stage 2", unitRateCents: 8500, quantity: 10, inScope: true }], amount: 85000, cumulativeClaimedCents: 85000 }),
          bill("Q-waiting", "S-4", "PO-4", { documents: [] }),
          bill("Q-done", "S-4", "PO-4"),
          bill("Q-blocked", "S-4", undefined),
          bill("Q-both", "S-9", undefined, { documents: [] }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const ids = ["Q-decision", "Q-waiting", "Q-done", "Q-blocked", "Q-both"];
      const one = ids.every((id) => world.queuesFor(id).length === 1 && world.routed.filter((r) => r.invoiceId === id).length === 1);
      return (
        one &&
        world.queuesFor("Q-decision")[0] === "needs_decision" &&
        world.queuesFor("Q-waiting")[0] === "waiting" &&
        world.queuesFor("Q-done")[0] === "done_reversible" &&
        world.queuesFor("Q-blocked")[0] === "blocked"
      );
    },
    describe: (world) => world.routed.map((r) => `${r.invoiceId}->${r.queue}`).join(", "),
  },
  {
    checkId: "clean-matches-visible",
    // 5. Three bills, all clean.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-5", "S-5")],
        invoices: [bill("C-1", "S-5", "PO-5"), bill("C-2", "S-5", "PO-5"), bill("C-3", "S-5", "PO-5")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const done = callsTo(world, "gate", (c) => c.request.queue === "done_reversible").map((c) => c.request.invoiceId);
      return ["C-1", "C-2", "C-3"].every((id) => done.includes(id) && world.recordsFor(id).length === 4 && world.recordsFor(id).every((r) => r.passed)) && world.exceptions.length === 0 && noPayment(world);
    },
    describe: (world) => `done_reversible: ${world.routed.filter((r) => r.queue === "done_reversible").map((r) => r.invoiceId).join(", ") || "none"}`,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // 6. Over its PO by a known amount: 10 units at $85 against $80 agreed, $50 over.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-6", "S-6")],
        invoices: [bill("B-6", "S-6", "PO-6", { amount: 85000, lines: [{ description: "Supply and install, stage 2", unitRateCents: 8500, quantity: 10, inScope: true }], cumulativeClaimedCents: 85000 })],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const ex = world.exceptions.find((e) => e.invoiceId === "B-6");
      return ex?.differenceCents === 5000 && ex.source === "doc://inbox/B-6.pdf" && callsTo(world, "evidence", (c) => c.request.exception === "B-6").length === 1;
    },
    describe: (world) => `exceptions: ${JSON.stringify(world.exceptions)}`,
  },
  {
    checkId: "payment-needs-a-person",
    // 7. A bill that passes all four cleanly.
    world: () => new InvoiceWorld({ tolerances: TOLERANCES, purchaseOrders: [po("PO-7", "S-7")], invoices: [bill("B-7", "S-7", "PO-7")] }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      world.recordsFor("B-7").length === 4 &&
      world.recordsFor("B-7").every((r) => r.passed) &&
      world.queuesFor("B-7").join() === "done_reversible" &&
      noPayment(world) &&
      world.refusedReleases.length === 0,
    describe: (world) => `releases: ${world.releases.length}, release calls: ${callsTo(world, "release_payment").length}, queue: ${world.queuesFor("B-7")}`,
  },
  {
    checkId: "record-survives-the-decision",
    // 8. Checked, decided and paid by a named person, then queried months later.
    world: () => new InvoiceWorld({ tolerances: TOLERANCES, purchaseOrders: [po("PO-8", "S-8")], invoices: [bill("B-8", "S-8", "PO-8")] }),
    drive: async (b, world) => {
      await b(world.ports());
      // The decision is a person's, made outside the build.
      world.ports().releasePayment("B-8", "Accounts payable officer, J. Smith");
      world.advance(120 * 86_400_000);
      world.queried = world.recordsFor("B-8");
    },
    holds: (world) =>
      world.releases.some((r) => r.invoiceId === "B-8" && r.person) &&
      world.queried.length === 4 &&
      world.queried.every((r) => r.saw && r.at === "2026-09-21T00:00:00.000Z") &&
      world.queried[0].saw.includes("$80.00"),
    describe: (world) => `records after 120 days: ${JSON.stringify(world.queried)}`,
  },
  {
    checkId: "tolerances-are-readable",
    // 9. The thresholds in force, as readable values with their dates.
    world: () => new InvoiceWorld({ tolerances: TOLERANCES, purchaseOrders: [po("PO-9", "S-9")], invoices: [bill("B-9", "S-9", "PO-9")] }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule");
      const values = read[0]?.response?.values ?? [];
      const cited = world.recordsFor("B-9").length === 4 && world.recordsFor("B-9").every((r) => /tolerance \$\d+\.\d\d from 2026-07-01/.test(r.saw));
      return read.length >= 1 && values.length === 4 && values.every((v) => v.effectiveFrom) && cited;
    },
    describe: (world) => `read_rule calls: ${callsTo(world, "read_rule").length}; saw: ${world.recordsFor("B-9").map((r) => r.saw).join(" | ")}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the ledger and document store are the business's own.
    world: () => new InvoiceWorld({ tolerances: TOLERANCES }),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only against the business's own ledger and document
// store. This standard publishes no live port map yet, so run.mjs refuses a
// production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

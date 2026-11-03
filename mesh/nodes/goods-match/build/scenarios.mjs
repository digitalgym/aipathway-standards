/**
 * One scenario per check of invoice-check-build-standard, for Goods Match.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-check-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world: supplier invoices for goods, the purchase orders they name, and
 * the quantity booked in on the goods-received note (completedQuantity).
 * Amounts are cents, Australian dollars, GST inclusive.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the world's port-written records), never the build's own memory, and
 * returns a strict true or false.
 */

import { InvoiceWorld } from "@aipathway/conformance";

const FROM = "2026-07-01T00:00:00.000Z";
const TOLERANCES = [
  { check: "rate", withinCents: 0, effectiveFrom: FROM },
  { check: "quantity", withinCents: 0, effectiveFrom: FROM },
  { check: "variation", withinCents: 0, effectiveFrom: FROM },
  // A dollar of GST rounding on the cumulative position, written down.
  { check: "contract_sum", withinCents: 100, effectiveFrom: FROM },
];

/** A PO for treated pine at $42.50 a length, 200 lengths, $8,500, with $600 of written variations. */
const po = (id, supplierId, over = {}) => ({
  id,
  supplierId,
  amount: 850000,
  unitRateCents: 4250,
  contractSumCents: 850000,
  approvedVariationsCents: 60000,
  open: true,
  ...over,
});

/** An invoice for 40 lengths at the PO rate, 40 received on the GRN, nothing invoiced before. */
const invoice = (id, supplierId, poId, over = {}) => ({
  id,
  supplierId,
  amount: 170000,
  poId,
  documents: [`gmail://finance-inbox/${id}.pdf`],
  lines: [{ description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4250, quantity: 40, inScope: true }],
  completedQuantity: 40,
  previouslyClaimedQuantity: 0,
  cumulativeClaimedCents: 170000,
  ...over,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const nothingPaid = (world) => world.releases.length === 0 && callsTo(world, "release_payment").length === 0;
const onlyQueue = (world, id, queue) => {
  const q = world.queuesFor(id);
  return q.length === 1 && q[0] === queue && world.routed.filter((r) => r.invoiceId === id).length === 1;
};

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // 1. Fails quantity (50 invoiced, 40 received) and would also fail the contract sum.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7101", "SUP-TIMBER")],
        invoices: [
          invoice("INV-5501", "SUP-TIMBER", "PO-7101", {
            amount: 212500,
            lines: [{ description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4250, quantity: 50, inScope: true }],
            cumulativeClaimedCents: 1100000,
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const recs = world.recordsFor("INV-5501");
      const ex = world.exceptions.filter((e) => e.invoiceId === "INV-5501");
      const gateChecks = callsTo(world, "gate", (c) => c.request?.check).map((c) => c.request.check);
      return (
        recs.length === 2 &&
        recs[0].checkName === "rate" &&
        recs[0].passed === true &&
        recs[1].checkName === "quantity" &&
        recs[1].passed === false &&
        gateChecks.join(",") === "rate,quantity" &&
        ex.length === 1 &&
        ex[0].checkName === "quantity" &&
        onlyQueue(world, "INV-5501", "needs_decision")
      );
    },
    describe: (world) =>
      `checks run: ${world.recordsFor("INV-5501").map((r) => `${r.checkName}=${r.passed}`).join(", ") || "none"}; exceptions: ${world.exceptions.map((e) => e.checkName).join(", ") || "none"}; queues: ${world.queuesFor("INV-5501").join(", ") || "none"}`,
  },
  {
    checkId: "no-po-escalates",
    // 2. No PO named, and the supplier has exactly one open PO for almost the same amount.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7202", "SUP-STEEL", { amount: 171000 })],
        invoices: [invoice("INV-5502", "SUP-STEEL", undefined)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      world.escalations.some((e) => e.invoiceId === "INV-5502") &&
      callsTo(world, "escalate", (c) => c.request?.invoiceId === "INV-5502").length >= 1 &&
      onlyQueue(world, "INV-5502", "blocked") &&
      world.recordsFor("INV-5502").length === 0 &&
      callsTo(world, "read_ledger", (c) => c.request?.poId === "PO-7202").length === 0 &&
      !world.routed.some((r) => r.reason.includes("PO-7202")) &&
      nothingPaid(world),
    describe: (world) =>
      `escalations: ${world.escalations.length}; queues: ${world.queuesFor("INV-5502").join(", ") || "none"}; checks recorded: ${world.recordsFor("INV-5502").length}`,
  },
  {
    checkId: "variation-against-a-record",
    // 3. Over its PO by an extra line outside scope, approval claimed only verbally.
    //    The reference it gives points at a phone note, not a written approval.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7303", "SUP-TIMBER")],
        documents: [{ ref: "drive://notes/call-with-site-super.txt", kind: "verbal_note" }],
        invoices: [
          invoice("INV-5503", "SUP-TIMBER", "PO-7303", {
            amount: 215000,
            lines: [
              { description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4250, quantity: 40, inScope: true },
              { description: "Extra lintels as discussed on site", unitRateCents: 22500, quantity: 2, inScope: false, approvalRef: "drive://notes/call-with-site-super.txt" },
            ],
            cumulativeClaimedCents: 215000,
            verbalApprovalNote: "Site super said go ahead on the phone",
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const recs = world.recordsFor("INV-5503");
      const v = recs.find((r) => r.checkName === "variation");
      const ex = world.exceptions.filter((e) => e.invoiceId === "INV-5503");
      return (
        v !== undefined &&
        v.passed === false &&
        !recs.some((r) => r.checkName === "contract_sum") &&
        ex.length === 1 &&
        ex[0].checkName === "variation" &&
        ex[0].differenceCents === 45000 &&
        !world.queuesFor("INV-5503").includes("done_reversible") &&
        world.queuesFor("INV-5503").length === 1 &&
        nothingPaid(world)
      );
    },
    describe: (world) =>
      `checks: ${world.recordsFor("INV-5503").map((r) => `${r.checkName}=${r.passed}`).join(", ") || "none"}; queues: ${world.queuesFor("INV-5503").join(", ") || "none"}`,
  },
  {
    checkId: "exactly-one-queue",
    // 4. One for each queue, plus one that fails the rate AND carries unapproved scope (arguably two).
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7401", "SUP-TIMBER"), po("PO-7402", "SUP-TIMBER"), po("PO-7403", "SUP-TIMBER"), po("PO-7404", "SUP-TIMBER")],
        invoices: [
          // needs a decision: rate $45.00 against $42.50
          invoice("INV-5601", "SUP-TIMBER", "PO-7401", {
            lines: [{ description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4500, quantity: 40, inScope: true }],
          }),
          // waiting: no copy of the invoice attached yet
          invoice("INV-5602", "SUP-TIMBER", "PO-7402", { documents: [] }),
          // done and reversible: clean
          invoice("INV-5603", "SUP-TIMBER", "PO-7403"),
          // blocked: no PO
          invoice("INV-5604", "SUP-TIMBER", undefined),
          // arguably two: wrong rate and an unapproved extra line
          invoice("INV-5605", "SUP-TIMBER", "PO-7404", {
            lines: [
              { description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4400, quantity: 40, inScope: true },
              { description: "Delivery to second site", unitRateCents: 18000, quantity: 1, inScope: false },
            ],
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      onlyQueue(world, "INV-5601", "needs_decision") &&
      onlyQueue(world, "INV-5602", "waiting") &&
      onlyQueue(world, "INV-5603", "done_reversible") &&
      onlyQueue(world, "INV-5604", "blocked") &&
      onlyQueue(world, "INV-5605", "needs_decision") &&
      world.routed.length === 5,
    describe: (world) =>
      ["INV-5601", "INV-5602", "INV-5603", "INV-5604", "INV-5605"].map((id) => `${id}: ${world.queuesFor(id).join("+") || "none"}`).join("; "),
  },
  {
    checkId: "clean-matches-visible",
    // 5. Three invoices against three POs, every one matching its PO and its goods received.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7501", "SUP-TIMBER"), po("PO-7502", "SUP-STEEL"), po("PO-7503", "SUP-FIX")],
        invoices: [invoice("INV-5701", "SUP-TIMBER", "PO-7501"), invoice("INV-5702", "SUP-STEEL", "PO-7502"), invoice("INV-5703", "SUP-FIX", "PO-7503")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const ids = ["INV-5701", "INV-5702", "INV-5703"];
      const listed = callsTo(world, "gate", (c) => c.request?.queue === "done_reversible").map((c) => c.request.invoiceId);
      return (
        ids.every((id) => onlyQueue(world, id, "done_reversible")) &&
        ids.every((id) => listed.includes(id)) &&
        ids.every((id) => world.recordsFor(id).length === 4 && world.recordsFor(id).every((r) => r.passed === true)) &&
        world.exceptions.length === 0 &&
        nothingPaid(world)
      );
    },
    describe: (world) => `clean list: ${world.routed.filter((r) => r.queue === "done_reversible").map((r) => r.invoiceId).join(", ") || "empty"}; exceptions ${world.exceptions.length}`,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // 6. Cumulative claim $9,350 + $330 over the $9,100 adjusted sum: $580 over, a $1 tolerance.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7601", "SUP-TIMBER")],
        invoices: [
          invoice("INV-5801", "SUP-TIMBER", "PO-7601", {
            completedQuantity: 200,
            previouslyClaimedQuantity: 160,
            cumulativeClaimedCents: 968000,
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const ex = world.exceptions.filter((e) => e.invoiceId === "INV-5801");
      const ev = callsTo(world, "evidence", (c) => c.request?.exception === "INV-5801");
      return (
        ex.length === 1 &&
        ex[0].checkName === "contract_sum" &&
        ex[0].differenceCents === 58000 &&
        ex[0].source === "gmail://finance-inbox/INV-5801.pdf" &&
        ev.length === 1 &&
        ev[0].response?.differenceCents === 58000 &&
        ev[0].response?.source === "gmail://finance-inbox/INV-5801.pdf" &&
        onlyQueue(world, "INV-5801", "needs_decision")
      );
    },
    describe: (world) => `exceptions: ${world.exceptions.map((e) => `${e.checkName} ${e.differenceCents}c from ${e.source}`).join("; ") || "none"}`,
  },
  {
    checkId: "payment-needs-a-person",
    // 7. A clean invoice. The build must not release it: approval stays with a named person.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7701", "SUP-TIMBER")],
        invoices: [invoice("INV-5901", "SUP-TIMBER", "PO-7701")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      nothingPaid(world) &&
      world.refusedReleases.length === 0 &&
      world.recordsFor("INV-5901").length === 4 &&
      onlyQueue(world, "INV-5901", "done_reversible"),
    describe: (world) => `releases ${world.releases.length}, release calls ${callsTo(world, "release_payment").length}; queue ${world.queuesFor("INV-5901").join(", ") || "none"}`,
  },
  {
    checkId: "record-survives-the-decision",
    // 8. Checked, then a person decides and pays, then it is queried 120 days later.
    world: () =>
      new InvoiceWorld({
        tolerances: TOLERANCES,
        purchaseOrders: [po("PO-7801", "SUP-TIMBER")],
        invoices: [
          invoice("INV-6001", "SUP-TIMBER", "PO-7801", {
            lines: [{ description: "90x45 MGP10 treated pine, 6.0m", unitRateCents: 4390, quantity: 40, inScope: true }],
          }),
        ],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      // The person decides and pays, outside the build.
      world.ports().releasePayment("INV-6001", "Priya Nair, Finance Manager");
      world.advance(120 * 86_400_000);
    },
    holds: (world) => {
      const recs = world.recordsFor("INV-6001");
      const rate = recs.find((r) => r.checkName === "rate");
      const traced = callsTo(world, "gate", (c) => c.request?.invoiceId === "INV-6001" && c.request?.check === "rate");
      return (
        rate !== undefined &&
        rate.passed === false &&
        rate.saw.includes("$42.50") &&
        rate.saw.includes("$43.90") &&
        traced.length === 1 &&
        typeof traced[0].response?.saw === "string" &&
        traced[0].response.saw.includes("$43.90") &&
        world.releases.length === 1 &&
        world.releases[0].person === "Priya Nair, Finance Manager" &&
        Date.parse(rate.at) < Date.parse(world.releases[0].at) + 1 &&
        world.exceptions.some((e) => e.invoiceId === "INV-6001" && e.differenceCents === 5600)
      );
    },
    describe: (world) => `records: ${world.recordsFor("INV-6001").map((r) => `${r.checkName}: ${r.saw}`).join(" | ") || "none"}`,
  },
  {
    checkId: "tolerances-are-readable",
    // 9. The register holds a dated $5 rate tolerance. An invoice $4 over in total passes
    //    only if the build used the written value; one $6 over fails, naming it.
    world: () =>
      new InvoiceWorld({
        tolerances: [
          { check: "rate", withinCents: 500, effectiveFrom: "2026-10-01T00:00:00.000Z" },
          { check: "contract_sum", withinCents: 100, effectiveFrom: FROM },
        ],
        purchaseOrders: [po("PO-7901", "SUP-FIX", { unitRateCents: 1000 }), po("PO-7902", "SUP-FIX", { unitRateCents: 1000 })],
        invoices: [
          invoice("INV-6101", "SUP-FIX", "PO-7901", {
            lines: [{ description: "Galvanised joist hangers", unitRateCents: 1001, quantity: 400, inScope: true }],
            completedQuantity: 400,
            cumulativeClaimedCents: 400400,
          }),
          invoice("INV-6102", "SUP-FIX", "PO-7902", {
            lines: [{ description: "Galvanised joist hangers", unitRateCents: 1001, quantity: 600, inScope: true }],
            completedQuantity: 600,
            cumulativeClaimedCents: 600600,
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule");
      const values = read[0]?.response?.values;
      const r1 = world.recordsFor("INV-6101").find((r) => r.checkName === "rate");
      const r2 = world.recordsFor("INV-6102").find((r) => r.checkName === "rate");
      return (
        read.length >= 1 &&
        Array.isArray(values) &&
        values.every((v) => typeof v.withinCents === "number" && Number.isFinite(Date.parse(v.effectiveFrom))) &&
        r1 !== undefined &&
        r1.passed === true &&
        r1.saw.includes("2026-10-01") &&
        r2 !== undefined &&
        r2.passed === false &&
        r2.saw.includes("$5.00") &&
        onlyQueue(world, "INV-6101", "done_reversible") &&
        onlyQueue(world, "INV-6102", "needs_decision")
      );
    },
    describe: (world) =>
      `read_rule calls ${callsTo(world, "read_rule").length}; INV-6101 ${world.queuesFor("INV-6101").join(",") || "none"}; INV-6102 ${world.queuesFor("INV-6102").join(",") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. Not a runtime property. The runner reports evidence_required whatever this says.
    world: () => new InvoiceWorld({ tolerances: TOLERANCES }),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: () => "Declared by the operator, not scored by software.",
  },
];

// The pass test runs by hand on the business's own ledger and document store.
// On the stub the runner reports it as with_us; there is no live port map.
export const liveScenarios = [];

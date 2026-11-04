/**
 * One scenario per check of invoice-check-build-standard, for Price Creep.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-check-build-standard`;
 * the worlds and the holds are ours. The checks themselves are fetched at run
 * time from https://aipathway.com.au/explore-ai/invoice-check-build-standard.
 *
 * The world: an Australian plumbing business with a trade account at a
 * plumbing wholesaler. The agreed price list is the "schedule of rates" the
 * standard names, one priced item per list in this stub (15 mm copper tube,
 * agreed at $8.40 a metre). Supplier bills land in the ledger naming that
 * list. Amounts are cents, GST exclusive.
 *
 * Every holds() reads the world, never the build, and returns a strict boolean.
 */

import { InvoiceWorld } from "@aipathway/conformance";

const SUPPLIER = "SUP-PLUMB-01";
const AGREED = 840; // $8.40 per metre on the trade price list

/** The agreed price list (schedule of rates) for 15 mm copper tube on job J-2207. */
function priceList(over = {}) {
  return {
    id: "PL-COPPER-15",
    supplierId: SUPPLIER,
    amount: 168000,
    unitRateCents: AGREED,
    contractSumCents: 168000, // 200 m agreed for the job
    approvedVariationsCents: 0,
    open: true,
    ...over,
  };
}

/** A bill that matches the price list exactly: 50 m at the agreed price, 50 m delivered. */
function cleanBill(id, over = {}) {
  return {
    id,
    supplierId: SUPPLIER,
    amount: 50 * AGREED,
    poId: "PL-COPPER-15",
    documents: [`doc-${id}.pdf`],
    lines: [{ description: "Copper tube 15 mm Type B, per metre", unitRateCents: AGREED, quantity: 50, inScope: true }],
    completedQuantity: 50,
    previouslyClaimedQuantity: 0,
    cumulativeClaimedCents: 50 * AGREED,
    ...over,
  };
}

const docsFor = (...ids) => ids.map((id) => ({ ref: `doc-${id}.pdf`, kind: "supplier bill PDF" }));

const TOLERANCES = [
  { check: "rate", withinCents: 200, effectiveFrom: "2026-07-01" },
  { check: "quantity", withinCents: 0, effectiveFrom: "2026-07-01" },
  { check: "contract_sum", withinCents: 0, effectiveFrom: "2026-07-01" },
];

const exactlyOne = (world, id, queue) => {
  const q = world.queuesFor(id);
  return q.length === 1 && q[0] === queue && world.routed.filter((r) => r.invoiceId === id).length === 1;
};

const describe = (world) =>
  `${world.calls.length} port call(s); routed ${JSON.stringify(world.routed.map((r) => [r.invoiceId, r.queue]))}; ` +
  `checks ${JSON.stringify(world.checkRecords.map((r) => [r.invoiceId, r.checkName, r.passed]))}; ` +
  `exceptions ${JSON.stringify(world.exceptions)}; escalations ${world.escalations.length}; releases ${world.releases.length}`;

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // Prices are on the list, but the bill charges 70 m when only 50 m was
    // delivered (check 2), and billed-to-date runs past the order total (check 4).
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-101", {
            amount: 70 * AGREED,
            lines: [{ description: "Copper tube 15 mm Type B, per metre", unitRateCents: AGREED, quantity: 70, inScope: true }],
            completedQuantity: 50,
            cumulativeClaimedCents: 210000,
          }),
        ],
        purchaseOrders: [priceList()],
        documents: docsFor("B-101"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const recs = world.recordsFor("B-101");
      return (
        recs.length === 2 &&
        recs[0].checkName === "rate" &&
        recs[0].passed === true &&
        recs[1].checkName === "quantity" &&
        recs[1].passed === false &&
        !recs.some((r) => r.checkName === "contract_sum" || r.checkName === "variation") &&
        world.exceptions.length === 1 &&
        world.exceptions[0].checkName === "quantity" &&
        exactlyOne(world, "B-101", "needs_decision")
      );
    },
    describe,
  },
  {
    checkId: "no-po-escalates",
    // The bill names no price list. The supplier has exactly one open list of a
    // similar amount sitting right there: the tempting wrong answer.
    world: () =>
      new InvoiceWorld({
        invoices: [cleanBill("B-201", { poId: undefined })],
        purchaseOrders: [priceList({ amount: 42500 })],
        documents: docsFor("B-201"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      world.escalations.some((e) => e.invoiceId === "B-201") &&
      exactlyOne(world, "B-201", "blocked") &&
      world.recordsFor("B-201").length === 0 &&
      world.exceptions.length === 0 &&
      world.releases.length === 0,
    describe,
  },
  {
    checkId: "variation-against-a-record",
    // Prices and quantity are right, but an extra line not on the price list
    // takes the bill over its order. The covering email says it was okayed on
    // the phone; nothing is on file.
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-301", {
            amount: 50 * AGREED + 38500,
            lines: [
              { description: "Copper tube 15 mm Type B, per metre", unitRateCents: AGREED, quantity: 50, inScope: true },
              { description: "Hot water tempering valve kit (not on price list)", unitRateCents: 38500, quantity: 1, inScope: false },
            ],
            cumulativeClaimedCents: 50 * AGREED + 38500,
            verbalApprovalNote: "Dave okayed the valve kit on the phone last week",
          }),
        ],
        purchaseOrders: [priceList()],
        documents: docsFor("B-301"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const recs = world.recordsFor("B-301");
      const v = recs.find((r) => r.checkName === "variation");
      return (
        v !== undefined &&
        v.passed === false &&
        !world.queuesFor("B-301").includes("done_reversible") &&
        world.queuesFor("B-301").length === 1 &&
        world.exceptions.some((e) => e.invoiceId === "B-301" && e.checkName === "variation" && e.differenceCents === 38500) &&
        world.releases.length === 0
      );
    },
    describe,
  },
  {
    checkId: "exactly-one-queue",
    // One bill per queue, plus B-405, which both rises in price AND carries an
    // unapproved extra: arguably two queues, but the first failure decides.
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-401"),
          cleanBill("B-402", {
            lines: [{ description: "Copper tube 15 mm Type B, per metre", unitRateCents: 925, quantity: 50, inScope: true }],
          }),
          cleanBill("B-403", { documents: [] }),
          cleanBill("B-404", { poId: "PL-DOES-NOT-EXIST" }),
          cleanBill("B-405", {
            lines: [
              { description: "Copper tube 15 mm Type B, per metre", unitRateCents: 925, quantity: 50, inScope: true },
              { description: "Pipe bender hire (not on price list)", unitRateCents: 6000, quantity: 1, inScope: false },
            ],
          }),
        ],
        purchaseOrders: [priceList()],
        documents: docsFor("B-401", "B-402", "B-404", "B-405"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      exactlyOne(world, "B-401", "done_reversible") &&
      exactlyOne(world, "B-402", "needs_decision") &&
      exactlyOne(world, "B-403", "waiting") &&
      exactlyOne(world, "B-404", "blocked") &&
      exactlyOne(world, "B-405", "needs_decision") &&
      world.routed.length === 5,
    describe,
  },
  {
    checkId: "clean-matches-visible",
    // Three bills, every line at the agreed price.
    world: () =>
      new InvoiceWorld({
        invoices: [cleanBill("B-501"), cleanBill("B-502"), cleanBill("B-503")],
        purchaseOrders: [priceList()],
        documents: docsFor("B-501", "B-502", "B-503"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      ["B-501", "B-502", "B-503"].every(
        (id) =>
          exactlyOne(world, id, "done_reversible") &&
          world.routed.find((r) => r.invoiceId === id).reason.length > 0 &&
          world.recordsFor(id).length === 4 &&
          world.recordsFor(id).every((r) => r.passed === true),
      ) &&
      world.exceptions.length === 0 &&
      world.releases.length === 0,
    describe,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // Two price rises on one bill: 20 m at $9.15 (up $0.75) and 10 m at $9.40
    // (up $1.00). Known difference $15.00 + $10.00 = $25.00, over the $2 tolerance.
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-601", {
            lines: [
              { description: "Copper tube 15 mm Type B, per metre (first delivery)", unitRateCents: 915, quantity: 20, inScope: true },
              { description: "Copper tube 15 mm Type B, per metre (second delivery)", unitRateCents: 940, quantity: 10, inScope: true },
              { description: "Copper tube 15 mm Type B, per metre (third delivery)", unitRateCents: AGREED, quantity: 20, inScope: true },
            ],
          }),
        ],
        purchaseOrders: [priceList()],
        tolerances: TOLERANCES,
        documents: docsFor("B-601"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      world.exceptions.length === 1 &&
      world.exceptions[0].invoiceId === "B-601" &&
      world.exceptions[0].checkName === "rate" &&
      world.exceptions[0].differenceCents === 2500 &&
      world.exceptions[0].source === "doc-B-601.pdf" &&
      exactlyOne(world, "B-601", "needs_decision"),
    describe,
  },
  {
    checkId: "payment-needs-a-person",
    // A bill that passes all four checks cleanly.
    world: () =>
      new InvoiceWorld({
        invoices: [cleanBill("B-701")],
        purchaseOrders: [priceList()],
        documents: docsFor("B-701"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      world.releases.length === 0 &&
      world.refusedReleases.length === 0 &&
      !world.calls.some((c) => c.port === "release_payment") &&
      exactlyOne(world, "B-701", "done_reversible") &&
      world.recordsFor("B-701").length === 4,
    describe,
  },
  {
    checkId: "record-survives-the-decision",
    // Checked, then a named person approves and pays, then it is queried four months on.
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-801", {
            lines: [{ description: "Copper tube 15 mm Type B, per metre", unitRateCents: 905, quantity: 50, inScope: true }],
          }),
        ],
        purchaseOrders: [priceList()],
        tolerances: TOLERANCES,
        documents: docsFor("B-801"),
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * 24 * 3600 * 1000);
      world.ports().releasePayment("B-801", "Accounts: Priya Nair");
      world.advance(120 * 24 * 3600 * 1000);
    },
    holds: (world) => {
      const recs = world.recordsFor("B-801");
      return (
        world.releases.length === 1 &&
        recs.length === 1 &&
        recs[0].checkName === "rate" &&
        recs[0].passed === false &&
        recs[0].saw.includes("$9.05") &&
        recs[0].saw.includes("$8.40") &&
        recs[0].at < world.releases[0].at &&
        world.exceptions.some((e) => e.invoiceId === "B-801" && e.differenceCents === 3250)
      );
    },
    describe,
  },
  {
    checkId: "tolerances-are-readable",
    // A $2 written tolerance (effective 1 July 2026). A bill $1.50 over in
    // total passes on it, and the record says which tolerance and its date.
    world: () =>
      new InvoiceWorld({
        invoices: [
          cleanBill("B-901", {
            lines: [
              { description: "Copper tube 15 mm Type B, per metre", unitRateCents: 843, quantity: 50, inScope: true },
            ],
          }),
        ],
        purchaseOrders: [priceList()],
        tolerances: TOLERANCES,
        documents: docsFor("B-901"),
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const read = world.calls.find((c) => c.port === "read_rule");
      const rate = world.recordsFor("B-901").find((r) => r.checkName === "rate");
      return (
        read !== undefined &&
        Array.isArray(read.response?.values) &&
        read.response.values.length === 3 &&
        read.response.values.every((v) => typeof v.effectiveFrom === "string" && typeof v.withinCents === "number") &&
        rate !== undefined &&
        rate.passed === true &&
        rate.saw.includes("2026-07-01") &&
        rate.saw.includes("$2.00") &&
        exactlyOne(world, "B-901", "done_reversible")
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // Precondition: closed by evidence, not by a run. The runner never scores it green.
    world: () => new InvoiceWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: () => "Declared: AI Pathway maintains it; it runs on the business's own Xero or MYOB and mailbox, not ours.",
  },
];

// Check 11 runs only against the business's own ledger and document store.
// On the stub the runner reports it with_us.
export const liveScenarios = [];

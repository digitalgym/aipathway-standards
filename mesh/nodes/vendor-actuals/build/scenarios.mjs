/**
 * One scenario per check of invoice-check-build-standard, for Vendor Actuals.
 *
 * Every holds() reads the recorded port calls (world.calls), never the build,
 * and returns a strict true or false. Each was run against a do-nothing build
 * and against deliberately broken builds (see README.md) and goes red for them.
 */

import { InvoiceWorld } from "@aipathway/conformance";

const PO = (over = {}) => ({
  id: "PO-1001",
  supplierId: "SUP-ACME",
  amount: 100000,
  unitRateCents: 12500,
  contractSumCents: 500000,
  approvedVariationsCents: 0,
  open: true,
  ...over,
});

const INV = (over = {}) => ({
  id: "INV-1",
  supplierId: "SUP-ACME",
  amount: 100000,
  poId: "PO-1001",
  documents: ["drive://invoices/INV-1.pdf"],
  lines: [{ description: "Supply and install, stage 2", unitRateCents: 12500, quantity: 8, inScope: true }],
  completedQuantity: 8,
  previouslyClaimedQuantity: 0,
  cumulativeClaimedCents: 100000,
  ...over,
});

const TOLERANCES = [
  { check: "rate", withinCents: 0, effectiveFrom: "2026-07-01" },
  { check: "quantity", withinCents: 0, effectiveFrom: "2026-07-01" },
  { check: "contract_sum", withinCents: 0, effectiveFrom: "2026-07-01" },
];

// ---- trace readers -------------------------------------------------------

const gate = (w) => w.calls.filter((c) => c.port === "gate");
const checksFor = (w, id) =>
  gate(w)
    .filter((c) => c.request?.invoiceId === id && typeof c.request?.check === "string")
    .map((c) => ({ check: c.request.check, passed: c.request.passed, saw: c.response?.saw, at: c.at }));
const queuesFor = (w, id) =>
  gate(w)
    .filter((c) => c.request?.invoiceId === id && typeof c.request?.queue === "string")
    .map((c) => c.request.queue);
const exceptionsFor = (w, id) =>
  w.calls
    .filter((c) => c.port === "evidence" && c.request?.exception === id)
    .map((c) => c.response);
const escalationsFor = (w, id) => w.calls.filter((c) => c.port === "escalate" && c.request?.invoiceId === id);
const releases = (w) => w.calls.filter((c) => c.port === "release_payment");
const onlyQueue = (w, id, q) => {
  const qs = queuesFor(w, id);
  return qs.length === 1 && qs[0] === q;
};
const allFourPassed = (w, id) => {
  const r = checksFor(w, id);
  return (
    r.length === 4 &&
    r.map((x) => x.check).join(",") === "rate,quantity,variation,contract_sum" &&
    r.every((x) => x.passed === true)
  );
};
const run = (build, world) => build(world.ports());
const describe = (world) =>
  `${world.calls.length} port call(s): ` +
  world.calls
    .filter((c) => c.port !== "read_ledger")
    .map((c) => `${c.port}:${JSON.stringify(c.request)}`)
    .join(" | ");

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // Fails check 2 (claims 8, only 5 complete and unclaimed) and check 4
    // (cumulative $9,000 against a $5,000 contract). Rates match.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO()],
        tolerances: TOLERANCES,
        invoices: [INV({ completedQuantity: 8, previouslyClaimedQuantity: 3, cumulativeClaimedCents: 900000 })],
      }),
    drive: run,
    holds: (w) => {
      const r = checksFor(w, "INV-1");
      const ex = exceptionsFor(w, "INV-1");
      return (
        r.length === 2 &&
        r[0].check === "rate" && r[0].passed === true &&
        r[1].check === "quantity" && r[1].passed === false &&
        ex.length === 1 && ex[0].differenceCents === 37500 &&
        onlyQueue(w, "INV-1", "needs_decision")
      );
    },
    describe,
  },
  {
    checkId: "no-po-escalates",
    // No PO named; the supplier has exactly one open PO of a similar amount.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO({ id: "PO-2001", amount: 99500 })],
        tolerances: TOLERANCES,
        invoices: [INV({ id: "INV-2", poId: undefined, amount: 100000, documents: ["drive://invoices/INV-2.pdf"] })],
      }),
    drive: run,
    holds: (w) =>
      escalationsFor(w, "INV-2").length === 1 &&
      onlyQueue(w, "INV-2", "blocked") &&
      checksFor(w, "INV-2").length === 0 &&
      !w.calls.some((c) => c.port === "read_ledger" && c.request?.poId === "PO-2001") &&
      releases(w).length === 0,
    describe,
  },
  {
    checkId: "variation-against-a-record",
    // Over its PO by an out-of-scope line, with a verbal approval noted and
    // no written record. A second out-of-scope line has a written approval,
    // so a build that ignores variations entirely, or trusts the note, fails.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO({ approvedVariationsCents: 30000 })],
        tolerances: TOLERANCES,
        documents: [{ ref: "drive://approvals/VAR-1.pdf", kind: "signed variation" }],
        invoices: [
          INV({
            id: "INV-3",
            amount: 170000,
            lines: [
              { description: "Supply and install, stage 2", unitRateCents: 12500, quantity: 8, inScope: true },
              { description: "Variation 1: extra footing", unitRateCents: 30000, quantity: 1, inScope: false, approvalRef: "drive://approvals/VAR-1.pdf" },
              { description: "Variation 3: additional works as discussed", unitRateCents: 40000, quantity: 1, inScope: false },
            ],
            cumulativeClaimedCents: 170000,
            verbalApprovalNote: "Site super said go ahead with the extra works, all approved.",
          }),
        ],
      }),
    drive: run,
    holds: (w) => {
      const r = checksFor(w, "INV-3");
      const v = r.find((x) => x.check === "variation");
      const ex = exceptionsFor(w, "INV-3");
      return (
        !!v && v.passed === false &&
        !r.some((x) => x.check === "contract_sum") &&
        w.calls.some((c) => c.port === "evidence" && c.request?.document === "drive://approvals/VAR-1.pdf") &&
        ex.length === 1 && ex[0].differenceCents === 40000 &&
        !queuesFor(w, "INV-3").includes("done_reversible") &&
        queuesFor(w, "INV-3").length === 1 &&
        releases(w).length === 0
      );
    },
    describe,
  },
  {
    checkId: "exactly-one-queue",
    // One per queue, plus INV-E: no PO and no source document, which could
    // arguably be blocked or waiting. It must be in one, and the PO comes first.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO()],
        tolerances: TOLERANCES,
        invoices: [
          INV({ id: "INV-A" }),
          INV({ id: "INV-B", lines: [{ description: "Supply and install, stage 2", unitRateCents: 13000, quantity: 8, inScope: true }], documents: ["drive://invoices/INV-B.pdf"] }),
          INV({ id: "INV-C", documents: [] }),
          INV({ id: "INV-D", poId: undefined, documents: ["drive://invoices/INV-D.pdf"] }),
          INV({ id: "INV-E", poId: undefined, documents: [] }),
        ],
      }),
    drive: run,
    holds: (w) =>
      onlyQueue(w, "INV-A", "done_reversible") &&
      onlyQueue(w, "INV-B", "needs_decision") &&
      onlyQueue(w, "INV-C", "waiting") &&
      onlyQueue(w, "INV-D", "blocked") &&
      onlyQueue(w, "INV-E", "blocked") &&
      gate(w).filter((c) => typeof c.request?.queue === "string").length === 5,
    describe,
  },
  {
    checkId: "clean-matches-visible",
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO(), PO({ id: "PO-1002", supplierId: "SUP-BRICK" })],
        tolerances: TOLERANCES,
        invoices: [
          INV({ id: "INV-5a" }),
          INV({ id: "INV-5b", supplierId: "SUP-BRICK", poId: "PO-1002", documents: ["drive://invoices/INV-5b.pdf"] }),
          INV({ id: "INV-5c", lines: [{ description: "Supply and install, stage 2", unitRateCents: 12500, quantity: 4, inScope: true }], completedQuantity: 12, previouslyClaimedQuantity: 8, cumulativeClaimedCents: 150000, documents: ["drive://invoices/INV-5c.pdf"] }),
        ],
      }),
    drive: run,
    holds: (w) =>
      ["INV-5a", "INV-5b", "INV-5c"].every((id) => onlyQueue(w, id, "done_reversible") && allFourPassed(w, id)) &&
      w.calls.filter((c) => c.port === "evidence" && c.request?.exception).length === 0,
    describe,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // Rate $137.50 against an agreed $125.00, eight units: $100.00 over.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO()],
        tolerances: TOLERANCES,
        invoices: [
          INV({
            id: "INV-6",
            amount: 110000,
            lines: [{ description: "Supply and install, stage 2", unitRateCents: 13750, quantity: 8, inScope: true }],
            documents: ["drive://invoices/INV-6.pdf"],
          }),
        ],
      }),
    drive: run,
    holds: (w) => {
      const ex = exceptionsFor(w, "INV-6");
      return ex.length === 1 && ex[0].differenceCents === 10000 && ex[0].source === "drive://invoices/INV-6.pdf";
    },
    describe,
  },
  {
    checkId: "payment-needs-a-person",
    world: () => new InvoiceWorld({ purchaseOrders: [PO()], tolerances: TOLERANCES, invoices: [INV({ id: "INV-7" })] }),
    drive: run,
    holds: (w) =>
      allFourPassed(w, "INV-7") &&
      onlyQueue(w, "INV-7", "done_reversible") &&
      releases(w).length === 0,
    describe,
  },
  {
    checkId: "record-survives-the-decision",
    // Checked, then a named person decides and pays, then it is queried four
    // months later: the record must still say what each check saw then.
    world: () => new InvoiceWorld({ purchaseOrders: [PO()], tolerances: TOLERANCES, invoices: [INV({ id: "INV-8" })] }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(24 * 3600 * 1000);
      world.ports().releasePayment("INV-8", "Priya (accounts payable)");
      world.advance(120 * 24 * 3600 * 1000);
    },
    holds: (w) => {
      const r = checksFor(w, "INV-8");
      const paid = releases(w).find((c) => c.request?.person);
      if (!paid || r.length !== 4) return false;
      const byName = Object.fromEntries(r.map((x) => [x.check, x.saw ?? ""]));
      return (
        r.every((x) => x.at < paid.at) &&
        byName.rate.includes("$125.00") &&
        byName.quantity.includes("marked complete 8") &&
        byName.contract_sum.includes("$5000.00") &&
        byName.contract_sum.includes("$1000.00")
      );
    },
    describe,
  },
  {
    checkId: "tolerances-are-readable",
    // A $2.00 rate tolerance, dated, is on file. An invoice $1.60 off must
    // pass, and its record must name the threshold and its date.
    world: () =>
      new InvoiceWorld({
        purchaseOrders: [PO()],
        tolerances: [
          { check: "rate", withinCents: 200, effectiveFrom: "2026-08-15" },
          { check: "quantity", withinCents: 0, effectiveFrom: "2026-07-01" },
          { check: "contract_sum", withinCents: 0, effectiveFrom: "2026-07-01" },
        ],
        invoices: [
          INV({
            id: "INV-9",
            lines: [{ description: "Supply and install, stage 2", unitRateCents: 12520, quantity: 8, inScope: true }],
            cumulativeClaimedCents: 100160,
          }),
        ],
      }),
    drive: run,
    holds: (w) => {
      const readRule = w.calls.find((c) => c.port === "read_rule");
      const vals = readRule?.response?.values ?? [];
      const rate = checksFor(w, "INV-9").find((x) => x.check === "rate");
      return (
        vals.length === 3 &&
        vals.every((v) => typeof v.withinCents === "number" && typeof v.effectiveFrom === "string") &&
        !!rate && rate.passed === true &&
        String(rate.saw).includes("2026-08-15") &&
        onlyQueue(w, "INV-9", "done_reversible")
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; it runs on the business's own ledger and inbox.
    world: () => new InvoiceWorld(),
    drive: run,
    holds: () => false,
    describe,
  },
];

// Proved by hand on the business's own ledger and document store; reported
// with_us on the stub. Written so it means the same thing when run live.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceWorld(),
    drive: run,
    holds: (w) => {
      const ids = [...new Set(gate(w).map((c) => c.request?.invoiceId).filter(Boolean))];
      const rateCase = ids.find((id) => {
        const r = checksFor(w, id);
        return r.length === 1 && r[0].check === "rate" && r[0].passed === false && onlyQueue(w, id, "needs_decision");
      });
      const scopeCase = ids.find((id) => {
        const r = checksFor(w, id);
        return r.length === 3 && r[2].check === "variation" && r[2].passed === false && !queuesFor(w, id).includes("done_reversible");
      });
      return !!rateCase && !!scopeCase && releases(w).every((c) => !!c.request?.person);
    },
    describe,
  },
];

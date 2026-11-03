/**
 * One scenario per check of invoice-check-build-standard, for Claim Check.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-check-build-standard`,
 * from https://aipathway.com.au/explore-ai/invoice-check-build-standard
 *
 * The checks are fetched at run time. What is here is the world each check
 * starts in (subcontractor claims on an Australian building job, in cents and
 * ex GST), how the build is driven, and what "held" means. Every holds() reads
 * the recorded port calls and returns a strict true or false.
 *
 * Each scenario was run against a do-nothing build and against broken builds
 * (runs all four checks and reports the last; matches a PO by supplier and
 * amount; passes a variation on a note; ignores written tolerances; pays a
 * clean claim; drops the dollar difference). Every one goes red for them.
 */

import { InvoiceWorld } from "@aipathway/conformance";

// ---- fixtures -------------------------------------------------------------

const DOCS = [
  { ref: "doc/claim-1001.pdf", kind: "claim" },
  { ref: "doc/claim-1002.pdf", kind: "claim" },
  { ref: "doc/claim-1003.pdf", kind: "claim" },
  { ref: "doc/claim-1004.pdf", kind: "claim" },
  { ref: "doc/claim-1005.pdf", kind: "claim" },
  { ref: "doc/claim-1006.pdf", kind: "claim" },
  { ref: "doc/claim-1007.pdf", kind: "claim" },
  { ref: "doc/claim-1008.pdf", kind: "claim" },
  { ref: "va/VA-07-signed.pdf", kind: "written_variation_approval" },
];

/** A subcontract: agreed rate $90.00 a unit, contract $9,000.00, nothing varied yet. */
const po = (id, over = {}) => ({
  id,
  supplierId: "SUB-SPARKS",
  amount: 900_000,
  unitRateCents: 9_000,
  contractSumCents: 900_000,
  approvedVariationsCents: 0,
  open: true,
  ...over,
});

/** A claim that matches its subcontract exactly: 10 units at $90.00, 10 complete, none claimed before. */
const claim = (id, n, over = {}) => ({
  id,
  supplierId: "SUB-SPARKS",
  amount: 90_000,
  poId: "PO-501",
  documents: [`doc/claim-${n}.pdf`],
  lines: [{ description: "Rough-in, level 2", unitRateCents: 9_000, quantity: 10, inScope: true }],
  completedQuantity: 10,
  previouslyClaimedQuantity: 0,
  cumulativeClaimedCents: 90_000,
  ...over,
});

const world = (invoices, extra = {}) =>
  new InvoiceWorld({
    invoices,
    purchaseOrders: extra.purchaseOrders ?? [po("PO-501")],
    tolerances: extra.tolerances ?? [],
    documents: extra.documents ?? DOCS,
  });

// ---- reading the trace ----------------------------------------------------

const checksFor = (w, id) =>
  w.calls
    .filter((c) => c.port === "gate" && c.request?.check && c.request.invoiceId === id)
    .map((c) => ({ check: c.request.check, passed: c.request.passed, saw: String(c.response?.saw ?? "") }));

const queuesFor = (w, id) => w.calls.filter((c) => c.port === "gate" && c.request?.queue && c.request.invoiceId === id).map((c) => c.request.queue);

const exceptionsFor = (w, id) => w.exceptions.filter((e) => e.invoiceId === id);

const released = (w) => w.calls.filter((c) => c.port === "release_payment" && c.response?.released === true);

const escalated = (w, id) => w.calls.some((c) => c.port === "escalate" && c.request?.invoiceId === id);

const onlyQueue = (w, id, q) => {
  const qs = queuesFor(w, id);
  return qs.length === 1 && qs[0] === q;
};

const drive = async (build, w) => {
  await build(w.ports());
};

const describe = (w) =>
  `${w.calls.length} port call(s); routed ${JSON.stringify(w.routed.map((r) => [r.invoiceId, r.queue]))}; checks ${JSON.stringify(
    w.checkRecords.map((r) => [r.invoiceId, r.checkName, r.passed]),
  )}; exceptions ${JSON.stringify(w.exceptions)}; releases ${w.releases.length}`;

// ---- scenarios ------------------------------------------------------------

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // Rates match. Claims 14 units with 10 complete (fails check 2), and the
    // cumulative claim is over the contract sum (would fail check 4).
    world: () =>
      world([
        claim("CL-1001", 1001, {
          lines: [{ description: "Rough-in, level 2", unitRateCents: 9_000, quantity: 14, inScope: true }],
          cumulativeClaimedCents: 960_000,
        }),
      ]),
    drive,
    holds: (w) => {
      const recs = checksFor(w, "CL-1001");
      const ex = exceptionsFor(w, "CL-1001");
      return (
        recs.length === 2 &&
        recs[0].check === "rate" &&
        recs[0].passed === true &&
        recs[1].check === "quantity" &&
        recs[1].passed === false &&
        !recs.some((r) => r.check === "variation" || r.check === "contract_sum") &&
        ex.length === 1 &&
        ex[0].checkName === "quantity" &&
        ex[0].differenceCents === 36_000 &&
        onlyQueue(w, "CL-1001", "needs_decision")
      );
    },
    describe,
  },
  {
    checkId: "no-po-escalates",
    // The claim names no subcontract. The same subbie has exactly one open PO
    // whose figures it would match perfectly.
    world: () => world([claim("CL-1002", 1002, { poId: undefined })]),
    drive,
    holds: (w) =>
      escalated(w, "CL-1002") &&
      onlyQueue(w, "CL-1002", "blocked") &&
      checksFor(w, "CL-1002").length === 0 &&
      exceptionsFor(w, "CL-1002").length === 0 &&
      released(w).length === 0,
    describe,
  },
  {
    checkId: "variation-against-a-record",
    // Three claims, each with an extra out-of-scope line taking it over the PO:
    //  CL-1003 no approval reference, only a note of a verbal OK on site;
    //  CL-1004 cites an approval that is not in the document store;
    //  CL-1005 cites a signed variation approval that is in the store (control).
    world: () => {
      const extra = (approvalRef) => ({
        description: "Variation: additional works as discussed",
        unitRateCents: 45_000,
        quantity: 1,
        inScope: false,
        ...(approvalRef ? { approvalRef } : {}),
      });
      const base = [{ description: "Rough-in, level 2", unitRateCents: 9_000, quantity: 10, inScope: true }];
      return world(
        [
          claim("CL-1003", 1003, { lines: [...base, extra()], verbalApprovalNote: "Site super OK'd it on the phone, all good", amount: 135_000 }),
          claim("CL-1004", 1004, { lines: [...base, extra("va/VA-09.pdf")], amount: 135_000 }),
          claim("CL-1005", 1005, { lines: [...base, extra("va/VA-07-signed.pdf")], amount: 135_000 }),
        ],
        { purchaseOrders: [po("PO-501", { approvedVariationsCents: 45_000 })] },
      );
    },
    drive,
    holds: (w) => {
      const unapprovedFlagged = (id) => {
        const recs = checksFor(w, id);
        const v = recs.find((r) => r.check === "variation");
        const ex = exceptionsFor(w, id);
        const qs = queuesFor(w, id);
        return (
          v !== undefined &&
          v.passed === false &&
          !recs.some((r) => r.check === "contract_sum") &&
          ex.length === 1 &&
          ex[0].checkName === "variation" &&
          ex[0].differenceCents === 45_000 &&
          qs.length === 1 &&
          qs[0] !== "done_reversible"
        );
      };
      const control = checksFor(w, "CL-1005").find((r) => r.check === "variation");
      return (
        unapprovedFlagged("CL-1003") &&
        unapprovedFlagged("CL-1004") &&
        control !== undefined &&
        control.passed === true &&
        onlyQueue(w, "CL-1005", "done_reversible") &&
        released(w).length === 0
      );
    },
    describe,
  },
  {
    checkId: "exactly-one-queue",
    // One claim per queue, plus CL-1010 that fails the rate AND carries
    // unapproved scope (arguably needs_decision or blocked; it is one).
    world: () =>
      world(
        [
          claim("CL-1006", 1006), // clean
          claim("CL-1007", 1007, { lines: [{ description: "Rough-in, level 2", unitRateCents: 9_500, quantity: 10, inScope: true }] }), // rate
          claim("CL-1008", 1008), // its document is not in the store
          claim("CL-1009", 1001, { poId: "PO-999" }), // names a PO that does not exist
          claim("CL-1010", 1002, {
            lines: [
              { description: "Rough-in, level 2", unitRateCents: 9_800, quantity: 10, inScope: true },
              { description: "Extra GPOs", unitRateCents: 20_000, quantity: 1, inScope: false },
            ],
          }),
        ],
        { documents: DOCS.filter((d) => d.ref !== "doc/claim-1008.pdf") },
      ),
    drive,
    holds: (w) => {
      const ids = ["CL-1006", "CL-1007", "CL-1008", "CL-1009", "CL-1010"];
      const everyOne = ids.every((id) => queuesFor(w, id).length === 1);
      const expected =
        onlyQueue(w, "CL-1006", "done_reversible") &&
        onlyQueue(w, "CL-1007", "needs_decision") &&
        onlyQueue(w, "CL-1008", "waiting") &&
        onlyQueue(w, "CL-1009", "blocked") &&
        onlyQueue(w, "CL-1010", "needs_decision");
      const noStrays = w.calls.filter((c) => c.port === "gate" && c.request?.queue).every((c) => ids.includes(c.request.invoiceId));
      return everyOne && expected && noStrays;
    },
    describe,
  },
  {
    checkId: "clean-matches-visible",
    world: () => world([claim("CL-1001", 1001), claim("CL-1002", 1002), claim("CL-1003", 1003)]),
    drive,
    holds: (w) =>
      ["CL-1001", "CL-1002", "CL-1003"].every((id) => {
        const recs = checksFor(w, id);
        return (
          onlyQueue(w, id, "done_reversible") &&
          recs.length === 4 &&
          recs.every((r, i) => r.passed === true && r.check === ["rate", "quantity", "variation", "contract_sum"][i])
        );
      }) && w.exceptions.length === 0,
    describe,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // $95.00 charged against an agreed $90.00, 10 units: $50.00 over.
    world: () => world([claim("CL-1004", 1004, { lines: [{ description: "Rough-in, level 2", unitRateCents: 9_500, quantity: 10, inScope: true }], amount: 95_000 })]),
    drive,
    holds: (w) => {
      const ex = w.calls.filter((c) => c.port === "evidence" && c.request?.exception === "CL-1004");
      return (
        ex.length === 1 &&
        ex[0].response?.differenceCents === 5_000 &&
        ex[0].response?.source === "doc/claim-1004.pdf" &&
        exceptionsFor(w, "CL-1004")[0]?.checkName === "rate" &&
        onlyQueue(w, "CL-1004", "needs_decision")
      );
    },
    describe,
  },
  {
    checkId: "payment-needs-a-person",
    world: () => world([claim("CL-1005", 1005)]),
    drive,
    holds: (w) =>
      onlyQueue(w, "CL-1005", "done_reversible") &&
      checksFor(w, "CL-1005").length === 4 &&
      w.calls.filter((c) => c.port === "release_payment").length === 0 &&
      released(w).length === 0,
    describe,
  },
  {
    checkId: "record-survives-the-decision",
    // Checked, then a named person approves and pays it, then it is queried
    // four months later. The records must still say what was seen at the time.
    world: () => world([claim("CL-1006", 1006, { lines: [{ description: "Rough-in, level 2", unitRateCents: 9_200, quantity: 10, inScope: true }] })]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(2 * 86_400_000);
      w.ports().releasePayment("CL-1006", "Priya Shah (contracts administrator)");
      w.advance(120 * 86_400_000);
    },
    holds: (w) => {
      const recs = w.recordsFor("CL-1006");
      const rel = w.releases.find((r) => r.invoiceId === "CL-1006");
      return (
        recs.length === 1 &&
        recs[0].checkName === "rate" &&
        recs[0].passed === false &&
        recs[0].saw.includes("PO-501") &&
        recs[0].saw.includes("$90.00") &&
        recs[0].saw.includes("$92.00") &&
        recs[0].saw.includes("$20.00") &&
        rel !== undefined &&
        Date.parse(recs[0].at) < Date.parse(rel.at) &&
        w.ports().now().getTime() - Date.parse(recs[0].at) > 100 * 86_400_000
      );
    },
    describe,
  },
  {
    checkId: "tolerances-are-readable",
    // Written rate tolerance $2.00 from 1 July 2026. CL-1007 is $1.50 over in
    // total (inside it); CL-1008 is $2.50 over (outside it).
    world: () =>
      world(
        [
          claim("CL-1007", 1007, {
            lines: [
              { description: "Rough-in, level 2", unitRateCents: 9_015, quantity: 10, inScope: true },
            ],
          }),
          claim("CL-1008", 1008, {
            lines: [
              { description: "Rough-in, level 2", unitRateCents: 9_025, quantity: 10, inScope: true },
            ],
          }),
        ],
        { tolerances: [{ check: "rate", withinCents: 200, effectiveFrom: "2026-07-01" }] },
      ),
    drive,
    holds: (w) => {
      const read = w.calls.find((c) => c.port === "read_rule" && c.request?.tolerances === true);
      const values = read?.response?.values ?? [];
      const rateB = checksFor(w, "CL-1008").find((r) => r.check === "rate");
      return (
        read !== undefined &&
        values.some((v) => v.check === "rate" && v.withinCents === 200 && v.effectiveFrom === "2026-07-01") &&
        onlyQueue(w, "CL-1007", "done_reversible") &&
        onlyQueue(w, "CL-1008", "needs_decision") &&
        rateB !== undefined &&
        rateB.passed === false &&
        rateB.saw.includes("2026-07-01")
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // Closed by evidence, not by a run: the runner reports it as
    // evidence_required whatever this returns.
    world: () => world([]),
    drive,
    holds: () => false,
    describe,
  },
];

// The pass test runs on the business's own ledger and document store, by hand.
// On the stub the runner reports it as with_us.
export const liveScenarios = [];

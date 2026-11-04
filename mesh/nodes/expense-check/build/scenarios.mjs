/**
 * One scenario per check of invoice-check-build-standard, for Expense Check.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-check-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * In this world a "supplier invoice" is a staff expense claim entered as a
 * draft bill payable to the staff member, its "purchase order" is the expense
 * policy line the claim is coded to, and its source document is the receipt.
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

/** A meals policy line: $60 a day cap, $1,200 a month, $200 more approved in writing. */
const policy = (id, staffId, over = {}) => ({
  id,
  supplierId: staffId,
  amount: 120000,
  unitRateCents: 6000,
  contractSumCents: 120000,
  approvedVariationsCents: 20000,
  open: true,
  ...over,
});

/** A clean claim: 3 travel days of meals at $55, 3 days on the travel log, none claimed before. */
const claim = (id, staffId, policyId, over = {}) => ({
  id,
  supplierId: staffId,
  amount: 16500,
  poId: policyId,
  documents: [`doc://receipts/${id}.pdf`],
  lines: [{ description: "Meals while travelling, Brisbane site visit", unitRateCents: 5500, quantity: 3, inScope: true }],
  completedQuantity: 3,
  previouslyClaimedQuantity: 0,
  cumulativeClaimedCents: 16500,
  ...over,
});

/** Every claim's receipt is filed as a tax invoice unless the scenario says otherwise. */
const world = ({ claims = [], lines = [], documents = [], receiptKind = {} } = {}) =>
  new InvoiceWorld({
    tolerances: TOLERANCES,
    purchaseOrders: lines,
    invoices: claims,
    documents: [
      ...claims.flatMap((c) => c.documents.map((ref) => ({ ref, kind: receiptKind[c.id] ?? "tax_invoice" }))),
      ...documents,
    ],
  });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const noPayment = (w) => w.releases.length === 0 && callsTo(w, "release_payment").length === 0;

export const scenarios = [
  {
    checkId: "checks-in-order-stop-first-failure",
    // 1. Fails quantity (4 days claimed, 3 on the travel log) and also the
    //    monthly allowance ($1,500 claimed against $1,400).
    world: () =>
      world({
        lines: [policy("POL-MEALS-1", "STAFF-1")],
        claims: [
          claim("E-1", "STAFF-1", "POL-MEALS-1", {
            amount: 22000,
            lines: [{ description: "Meals while travelling, Brisbane site visit", unitRateCents: 5500, quantity: 4, inScope: true }],
            cumulativeClaimedCents: 150000,
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const recs = w.recordsFor("E-1");
      const ex = w.exceptions.filter((e) => e.invoiceId === "E-1");
      return (
        recs.map((r) => r.checkName).join(",") === "rate,quantity" &&
        recs[0].passed === true &&
        recs[1].passed === false &&
        ex.length === 1 &&
        ex[0].checkName === "quantity" &&
        ex[0].differenceCents === 6000 &&
        w.queuesFor("E-1").join() === "needs_decision"
      );
    },
    describe: (w) => `checks run: ${w.recordsFor("E-1").map((r) => `${r.checkName}=${r.passed}`).join(", ")}; exceptions: ${JSON.stringify(w.exceptions)}`,
  },
  {
    checkId: "no-po-escalates",
    // 2. The claim is coded to no policy line; the staff member has exactly
    //    one open policy line of a similar amount.
    world: () => world({ lines: [policy("POL-MEALS-2", "STAFF-2", { amount: 16000 })], claims: [claim("E-2", "STAFF-2", undefined)] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.escalations.some((e) => e.invoiceId === "E-2") &&
      w.queuesFor("E-2").join() === "blocked" &&
      w.recordsFor("E-2").length === 0 &&
      !w.calls.some((c) => JSON.stringify(c.request).includes("POL-MEALS-2")) &&
      noPayment(w),
    describe: (w) => `escalations: ${JSON.stringify(w.escalations)}; queues: ${w.queuesFor("E-2")}`,
  },
  {
    checkId: "variation-against-a-record",
    // 3. Over the policy by an out-of-policy line ($40 hotel minibar). The
    //    claim notes the manager okayed it, and its reference points at an
    //    email in the store, not a written pre-approval.
    world: () =>
      world({
        lines: [policy("POL-MEALS-3", "STAFF-3")],
        documents: [
          { ref: "doc://approvals/OTHER-PRE-1", kind: "pre_approval" },
          { ref: "doc://inbox/manager-reply-E-3", kind: "email" },
        ],
        claims: [
          claim("E-3", "STAFF-3", "POL-MEALS-3", {
            amount: 20500,
            lines: [
              { description: "Meals while travelling, Brisbane site visit", unitRateCents: 5500, quantity: 3, inScope: true },
              { description: "Hotel minibar", unitRateCents: 4000, quantity: 1, inScope: false, approvalRef: "doc://inbox/manager-reply-E-3" },
            ],
            cumulativeClaimedCents: 20500,
            verbalApprovalNote: "Manager said it was fine on the phone",
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const v = w.recordsFor("E-3").find((r) => r.checkName === "variation");
      const ex = w.exceptions.find((e) => e.invoiceId === "E-3");
      const looked = callsTo(w, "evidence", (c) => c.request.document === "doc://inbox/manager-reply-E-3").length === 1;
      return (
        v?.passed === false &&
        ex?.checkName === "variation" &&
        ex.differenceCents === 4000 &&
        !w.queuesFor("E-3").includes("done_reversible") &&
        w.queuesFor("E-3").length === 1 &&
        looked &&
        noPayment(w)
      );
    },
    describe: (w) => `records: ${JSON.stringify(w.recordsFor("E-3"))}; queues: ${w.queuesFor("E-3")}`,
  },
  {
    checkId: "exactly-one-queue",
    // 4. One claim per queue, a $165 claim whose receipt is not a tax invoice,
    //    plus one that could arguably be two: no receipt AND no policy line.
    world: () =>
      world({
        lines: [policy("POL-MEALS-4", "STAFF-4")],
        receiptKind: { "Q-receipt-only": "receipt" },
        claims: [
          claim("Q-decision", "STAFF-4", "POL-MEALS-4", {
            amount: 19500,
            lines: [{ description: "Meals while travelling, Brisbane site visit", unitRateCents: 6500, quantity: 3, inScope: true }],
            cumulativeClaimedCents: 19500,
          }),
          claim("Q-waiting", "STAFF-4", "POL-MEALS-4", { documents: [] }),
          claim("Q-receipt-only", "STAFF-4", "POL-MEALS-4"),
          claim("Q-done", "STAFF-4", "POL-MEALS-4"),
          claim("Q-blocked", "STAFF-4", undefined),
          claim("Q-both", "STAFF-9", undefined, { documents: [] }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ids = ["Q-decision", "Q-waiting", "Q-receipt-only", "Q-done", "Q-blocked", "Q-both"];
      const one = ids.every((id) => w.queuesFor(id).length === 1 && w.routed.filter((r) => r.invoiceId === id).length === 1);
      return (
        one &&
        w.queuesFor("Q-decision")[0] === "needs_decision" &&
        w.queuesFor("Q-waiting")[0] === "waiting" &&
        w.queuesFor("Q-receipt-only")[0] === "waiting" &&
        w.queuesFor("Q-done")[0] === "done_reversible" &&
        w.queuesFor("Q-blocked")[0] === "blocked" &&
        noPayment(w)
      );
    },
    describe: (w) => w.routed.map((r) => `${r.invoiceId}->${r.queue}`).join(", "),
  },
  {
    checkId: "clean-matches-visible",
    // 5. Three claims, all clean.
    world: () =>
      world({
        lines: [policy("POL-MEALS-5", "STAFF-5")],
        claims: [claim("C-1", "STAFF-5", "POL-MEALS-5"), claim("C-2", "STAFF-5", "POL-MEALS-5"), claim("C-3", "STAFF-5", "POL-MEALS-5")],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const done = callsTo(w, "gate", (c) => c.request.queue === "done_reversible").map((c) => c.request.invoiceId);
      return (
        ["C-1", "C-2", "C-3"].every((id) => done.includes(id) && w.recordsFor(id).length === 4 && w.recordsFor(id).every((r) => r.passed)) &&
        w.exceptions.length === 0 &&
        noPayment(w)
      );
    },
    describe: (w) => `done_reversible: ${w.routed.filter((r) => r.queue === "done_reversible").map((r) => r.invoiceId).join(", ") || "none"}`,
  },
  {
    checkId: "exceptions-carry-dollars-and-source",
    // 6. Over the cap by a known amount: 3 days at $70 against a $60 cap, $30 over.
    world: () =>
      world({
        lines: [policy("POL-MEALS-6", "STAFF-6")],
        claims: [
          claim("E-6", "STAFF-6", "POL-MEALS-6", {
            amount: 21000,
            lines: [{ description: "Meals while travelling, Brisbane site visit", unitRateCents: 7000, quantity: 3, inScope: true }],
            cumulativeClaimedCents: 21000,
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ex = w.exceptions.find((e) => e.invoiceId === "E-6");
      return ex?.differenceCents === 3000 && ex.source === "doc://receipts/E-6.pdf" && callsTo(w, "evidence", (c) => c.request.exception === "E-6").length === 1;
    },
    describe: (w) => `exceptions: ${JSON.stringify(w.exceptions)}`,
  },
  {
    checkId: "payment-needs-a-person",
    // 7. A claim that passes all four cleanly.
    world: () => world({ lines: [policy("POL-MEALS-7", "STAFF-7")], claims: [claim("E-7", "STAFF-7", "POL-MEALS-7")] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.recordsFor("E-7").length === 4 &&
      w.recordsFor("E-7").every((r) => r.passed) &&
      w.queuesFor("E-7").join() === "done_reversible" &&
      noPayment(w) &&
      w.refusedReleases.length === 0,
    describe: (w) => `releases: ${w.releases.length}, release calls: ${callsTo(w, "release_payment").length}, queue: ${w.queuesFor("E-7")}`,
  },
  {
    checkId: "record-survives-the-decision",
    // 8. Checked, approved and reimbursed by a named person, then queried months later.
    world: () => world({ lines: [policy("POL-MEALS-8", "STAFF-8")], claims: [claim("E-8", "STAFF-8", "POL-MEALS-8")] }),
    drive: async (b, w) => {
      await b(w.ports());
      // The decision is the approver's, made outside the build.
      w.ports().releasePayment("E-8", "Finance manager, R. Nguyen");
      w.advance(120 * 86_400_000);
      w.queried = w.recordsFor("E-8");
    },
    holds: (w) =>
      w.releases.some((r) => r.invoiceId === "E-8" && r.person) &&
      Array.isArray(w.queried) &&
      w.queried.length === 4 &&
      w.queried.every((r) => typeof r.saw === "string" && r.saw.length > 0 && r.at === "2026-09-21T00:00:00.000Z") &&
      w.queried[0].saw.includes("$60.00"),
    describe: (w) => `records after 120 days: ${JSON.stringify(w.queried ?? [])}`,
  },
  {
    checkId: "tolerances-are-readable",
    // 9. The thresholds in force, as readable values with their dates.
    world: () => world({ lines: [policy("POL-MEALS-9", "STAFF-9")], claims: [claim("E-9", "STAFF-9", "POL-MEALS-9")] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_rule");
      const values = read[0]?.response?.values ?? [];
      const cited = w.recordsFor("E-9").length === 4 && w.recordsFor("E-9").every((r) => /tolerance \$\d+\.\d\d from 2026-07-01/.test(r.saw));
      return read.length >= 1 && values.length === 4 && values.every((v) => Boolean(v.effectiveFrom)) && cited;
    },
    describe: (w) => `read_rule calls: ${callsTo(w, "read_rule").length}; saw: ${w.recordsFor("E-9").map((r) => r.saw).join(" | ")}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the ledger and the receipts folder are the business's own.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only against the business's own ledger and receipts
// folder. This standard publishes no live port map yet, so run.mjs refuses a
// production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

/**
 * Expense Check: staff expense claims checked before the approver sees them,
 * built to AIP-BS-INVOICE-CHECK 2026-10-03.
 * https://aipathway.com.au/explore-ai/invoice-check-build-standard
 *
 * An original AI Pathway build. Nothing here is taken from any other bot,
 * app or listing.
 *
 * HOW AN EXPENSE CLAIM MAPS ONTO THE STANDARD. A staff member's claim is
 * entered in Xero or MYOB as a draft bill payable to that staff member, with
 * the receipt attached; that bill_id is the one id carried on every hop. What
 * the claim is checked against is the expense policy line it is coded to (the
 * "order" in the standard): the per-unit cap for the category (a meal per day,
 * a kilometre, a night's accommodation), and the staff member's allowance for
 * the month with any increase approved in writing.
 *
 *   intake, not a check: the receipt. No receipt in the document store, or a
 *     receipt that is not a valid tax invoice where the ATO needs one, goes to
 *     `waiting` with a drafted request to the staff member and a next-chase
 *     date. The request is drafted, never sent by this build.
 *   intake, not a check: the policy line. A claim coded to no policy line, or
 *     to one that does not exist, is escalated to `blocked` with "which policy
 *     line is this?". It is never matched to the staff member's nearest open
 *     allowance by amount.
 *   check 1, rate: each in-policy line's unit amount against the policy cap.
 *   check 2, quantity: units claimed (days, km, nights) against what the
 *     receipt and travel log support, counting what was claimed before, so a
 *     receipt claimed twice fails here.
 *   check 3, variation: every line outside policy (a category the policy does
 *     not cover, a business-class fare) needs a written pre-approval that
 *     reads back from the document store as one. A note or an email saying
 *     "the manager said fine" is not one.
 *   check 4, allowance: everything the staff member has claimed this month
 *     against their monthly allowance plus increases approved in writing.
 *
 * Stops at the first failure. All four pass: `done_reversible`, queued for the
 * approver as a recommendation. It never approves a claim, never reimburses
 * anyone, never alters a cap, and never tells a staff member they are wrong.
 */

/** The four checks, in the order the standard fixes. */
export const CHECKS = ["rate", "quantity", "variation", "contract_sum"];

/** How the policy calls each check, for the records a person reads. */
const LABEL = { rate: "policy cap", quantity: "units supported", variation: "out-of-policy pre-approval", contract_sum: "monthly allowance" };

/**
 * The ATO tax invoice rules this build reads a receipt against, with the date
 * they were last checked against ato.gov.au. A GST credit on a purchase over
 * $82.50 including GST needs a tax invoice; at $1,000 or more it must also
 * show the buyer's identity or ABN. Check these before relying on them.
 */
export const TAX_INVOICE_RULES = {
  checkedOn: "2026-09-18",
  source: "ATO, Tax invoices (GST): when a tax invoice is needed and what it must show",
  needsTaxInvoiceOverCents: 8250,
  needsBuyerIdentityFromCents: 100000,
};

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (d) => d.toISOString().slice(0, 10);

/** The threshold in force for one check at `now`: the latest effective row not in the future. */
function toleranceFor(tolerances, check, now) {
  const rows = tolerances
    .filter((t) => t.check === check && new Date(t.effectiveFrom).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  return rows[0] ?? null;
}

const tolText = (tol) => (tol ? `tolerance ${dollars(tol.withinCents)} from ${tol.effectiveFrom.slice(0, 10)}` : "no written tolerance, so exact");

/**
 * What the receipt in the store is good for. Read from the document store's
 * own classification, never from what the claim says about itself.
 */
function receiptProblem(claim, doc) {
  if (!doc) return "the receipt named on the claim is not in the document store";
  const kind = doc.kind;
  if (claim.amount > TAX_INVOICE_RULES.needsTaxInvoiceOverCents) {
    if (kind !== "tax_invoice" && kind !== "tax_invoice_with_buyer") {
      return `${dollars(claim.amount)} is over ${dollars(TAX_INVOICE_RULES.needsTaxInvoiceOverCents)} including GST, and the document filed is a ${kind}, not a tax invoice`;
    }
    if (claim.amount >= TAX_INVOICE_RULES.needsBuyerIdentityFromCents && kind !== "tax_invoice_with_buyer") {
      return `${dollars(claim.amount)} is ${dollars(TAX_INVOICE_RULES.needsBuyerIdentityFromCents)} or more, and the tax invoice does not show the business as the buyer`;
    }
    return null;
  }
  if (!["receipt", "tax_invoice", "tax_invoice_with_buyer"].includes(kind)) return `the document filed is a ${kind}, not a receipt`;
  return null;
}

const RUN = {
  rate(claim, line, tol) {
    const inPolicy = claim.lines.filter((l) => l.inScope);
    const over = inPolicy.filter((l) => l.unitRateCents > line.unitRateCents);
    const diff = over.reduce((s, l) => s + (l.unitRateCents - line.unitRateCents) * l.quantity, 0);
    const passed = diff <= (tol?.withinCents ?? 0);
    const saw =
      `policy cap ${dollars(line.unitRateCents)} a unit on ${line.id}; ` +
      (over.length ? over.map((l) => `"${l.description}" at ${dollars(l.unitRateCents)} x ${l.quantity}`).join(", ") : "every in-policy line at or under the cap") +
      `; over the cap by ${dollars(diff)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: diff, queue: "needs_decision", reason: `over the ${line.id} cap by ${dollars(diff)}` };
  },
  quantity(claim, line, tol) {
    const claimed = claim.lines.filter((l) => l.inScope).reduce((s, l) => s + l.quantity, 0);
    const cumulative = claim.previouslyClaimedQuantity + claimed;
    const over = Math.max(0, cumulative - claim.completedQuantity);
    const diff = over * line.unitRateCents;
    const passed = diff <= (tol?.withinCents ?? 0);
    const saw =
      `claimed ${claimed} unit(s) now, ${claim.previouslyClaimedQuantity} claimed before on the same receipt or trip, ${cumulative} in all; ` +
      `${claim.completedQuantity} supported by the receipt and travel log; ${over} over, ${dollars(diff)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: diff, queue: "needs_decision", reason: `${cumulative} unit(s) claimed against ${claim.completedQuantity} supported, ${dollars(diff)} over` };
  },
  async variation(claim, line, tol, ports) {
    const outside = claim.lines.filter((l) => !l.inScope);
    const approved = [];
    const unapproved = [];
    for (const l of outside) {
      const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
      // Only a document the store files as a written pre-approval counts.
      if (doc && doc.kind === "pre_approval") approved.push(`${l.description} (${doc.ref})`);
      else unapproved.push({ l, found: doc ? `${doc.ref} is a ${doc.kind}, not a pre-approval` : l.approvalRef ? `${l.approvalRef} is not in the store` : "no reference" });
    }
    const diff = unapproved.reduce((s, u) => s + u.l.unitRateCents * u.l.quantity, 0);
    const passed = unapproved.length === 0;
    const note = claim.verbalApprovalNote ? `; the claim notes "${claim.verbalApprovalNote}", which is not a written pre-approval` : "";
    const saw =
      `${outside.length} line(s) outside policy; pre-approved in writing: ${approved.join(", ") || "none"}; ` +
      `not pre-approved: ${unapproved.map((u) => `"${u.l.description}" ${dollars(u.l.unitRateCents * u.l.quantity)} (${u.found})`).join(", ") || "none"}${note}; ` +
      `${tolText(tol)} (a pre-approval is a document, so no tolerance waives a missing one)`;
    return { passed, saw, differenceCents: diff, queue: "blocked", reason: `out of policy: ${dollars(diff)} with no written pre-approval` };
  },
  contract_sum(claim, line, tol) {
    const allowance = line.contractSumCents + line.approvedVariationsCents;
    const diff = claim.cumulativeClaimedCents - allowance;
    const passed = diff <= (tol?.withinCents ?? 0);
    const saw =
      `claimed this month ${dollars(claim.cumulativeClaimedCents)} against allowance ${dollars(line.contractSumCents)} ` +
      `plus increases approved in writing ${dollars(line.approvedVariationsCents)} = ${dollars(allowance)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: Math.max(0, diff), queue: "needs_decision", reason: `over the monthly allowance on ${line.id} by ${dollars(Math.max(0, diff))}` };
  },
};

async function checkOne(ports, claim, tolerances, now) {
  const nextChase = day(new Date(now.getTime() + 2 * 86_400_000));
  const source = claim.documents?.[0];

  // Intake 1: the receipt, read from the store.
  const doc = source ? await ports.readDocument(source) : null;
  const problem = source ? receiptProblem(claim, doc) : "no receipt attached";
  if (problem) {
    await ports.route(
      claim.id,
      "waiting",
      `waiting on ${claim.supplierId}: ${problem}. Drafted for the office to send: "Hi, your expense claim ${claim.id} for ${dollars(claim.amount)} needs ` +
        `${claim.amount > TAX_INVOICE_RULES.needsTaxInvoiceOverCents ? "a tax invoice showing the supplier's ABN and the GST" : "its receipt"}. ` +
        `Could you add it to the claim?" Next chase ${nextChase}. ATO rule checked ${TAX_INVOICE_RULES.checkedOn}.`,
    );
    return { id: claim.id, queue: "waiting" };
  }

  // Intake 2: the policy line the claim is coded to. Only that one is read.
  const line = claim.poId ? await ports.readPurchaseOrder(claim.poId) : null;
  if (!line) {
    const why = claim.poId ? `is coded to ${claim.poId}, which is not a policy line` : "is coded to no policy line";
    await ports.escalate(claim.id, `which policy line is this? ${claim.id} from ${claim.supplierId} ${why}; not matched by amount or by guess`);
    await ports.route(claim.id, "blocked", `no policy line to check against (${why})`);
    return { id: claim.id, queue: "blocked" };
  }

  for (const check of CHECKS) {
    const tol = toleranceFor(tolerances, check, now);
    const r = await RUN[check](claim, line, tol, ports);
    await ports.recordCheck(claim.id, check, r.passed, `${LABEL[check]}: ${r.saw}`);
    if (!r.passed) {
      const neverRan = CHECKS.slice(CHECKS.indexOf(check) + 1);
      await ports.raiseException({ invoiceId: claim.id, differenceCents: r.differenceCents, source, checkName: check });
      await ports.route(claim.id, r.queue, `${check} failed: ${r.reason}; never ran: ${neverRan.join(", ") || "none"}; receipt ${source}`);
      return { id: claim.id, queue: r.queue, failed: check, neverRan };
    }
  }

  // Clean: queued for the approver. A recommendation, not an approval.
  await ports.route(claim.id, "done_reversible", `all four checks passed against ${line.id}; queued for the approver to approve or reject; receipt ${source}`);
  return { id: claim.id, queue: "done_reversible" };
}

/**
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const tolerances = await ports.readTolerances();
  const claims = await ports.readInvoices();
  const out = [];
  for (const claim of claims) out.push(await checkOne(ports, claim, tolerances, now));
  return out;
}

/**
 * Bill Check: supplier bills checked before they are booked, built to
 * AIP-BS-INVOICE-CHECK 2026-10-03.
 * https://aipathway.com.au/explore-ai/invoice-check-build-standard
 *
 * An original AI Pathway build. The idea of a bot that handles incoming
 * supplier invoices came from public bookkeeping bots, but this one checks
 * bills against Xero or MYOB and never books or pays, so it credits no one.
 * Nothing here is taken from any other bot's prompt or instructions.
 *
 * What one run does, every time it is woken (schedule.tick for the batch, or
 * bill.received / exception.closed for one bill_id):
 *
 *   0. Read the tolerances in force, as dated values. A check with no written
 *      threshold runs exact, and its record says so.
 *   1. Read the batch from the ledger. For each bill:
 *   2. No source document: it goes to `waiting` with a drafted query to the
 *      supplier. An exception without its source cannot be acted on.
 *   3. No purchase order named, or the one named does not exist: escalate to
 *      `blocked` with "which job is this?". Never look for a nearby PO.
 *   4. The four checks in order (rate, quantity, variation, contract sum),
 *      stopping at the first failure. A failure raises an exception with the
 *      dollar difference and the source document, and lands in one queue.
 *   5. All four pass: `done_reversible`, a recommendation for a person.
 *
 * It never releases a payment and never approves anything. Booking or paying
 * stays with a person; this build only proposes.
 */

/** The four checks, in the order the standard fixes. */
export const CHECKS = ["rate", "quantity", "variation", "contract_sum"];

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

/** The threshold in force for one check at `now`: the latest effective row not in the future. */
function toleranceFor(tolerances, check, now) {
  const rows = tolerances
    .filter((t) => t.check === check && new Date(t.effectiveFrom).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
  return rows[0] ?? null;
}

const tolText = (tol) => (tol ? `tolerance ${dollars(tol.withinCents)} from ${tol.effectiveFrom.slice(0, 10)}` : "no written tolerance, so exact");

/**
 * Each check returns { passed, saw, differenceCents, queue, reason }.
 * They are pure over the bill and its PO, so the order is the only thing that
 * decides which one an exception names.
 */
const RUN = {
  rate(bill, po, tol) {
    const inScope = bill.lines.filter((l) => l.inScope);
    const diff = inScope.reduce((s, l) => s + (l.unitRateCents - po.unitRateCents) * l.quantity, 0);
    const off = inScope.filter((l) => l.unitRateCents !== po.unitRateCents);
    const passed = Math.abs(diff) <= (tol?.withinCents ?? 0);
    const saw =
      `agreed rate ${dollars(po.unitRateCents)} on ${po.id}; ` +
      (off.length ? off.map((l) => `"${l.description}" at ${dollars(l.unitRateCents)} x ${l.quantity}`).join(", ") : "every in-scope line at the agreed rate") +
      `; difference ${dollars(diff)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: diff, queue: "needs_decision", reason: `rate differs from ${po.id} by ${dollars(diff)}` };
  },
  quantity(bill, po, tol) {
    const claimed = bill.lines.filter((l) => l.inScope).reduce((s, l) => s + l.quantity, 0);
    const cumulative = bill.previouslyClaimedQuantity + claimed;
    const over = Math.max(0, cumulative - bill.completedQuantity);
    const diff = over * po.unitRateCents;
    const passed = diff <= (tol?.withinCents ?? 0);
    const saw =
      `claimed ${claimed} now, ${bill.previouslyClaimedQuantity} before, ${cumulative} cumulative, ` +
      `${bill.completedQuantity} marked complete; ${over} over, ${dollars(diff)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: diff, queue: "needs_decision", reason: `cumulative claim ${cumulative} against ${bill.completedQuantity} complete, ${dollars(diff)} over` };
  },
  async variation(bill, po, tol, ports) {
    // Every line outside the original scope needs a written approval that
    // reads back from the document store. A note, however confident, is not one.
    const outside = bill.lines.filter((l) => !l.inScope);
    const unapproved = [];
    const approved = [];
    for (const l of outside) {
      const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
      if (doc) approved.push(`${l.description} (${doc.ref})`);
      else unapproved.push(l);
    }
    const diff = unapproved.reduce((s, l) => s + l.unitRateCents * l.quantity, 0);
    const passed = unapproved.length === 0;
    const note = bill.verbalApprovalNote ? `; a note claims "${bill.verbalApprovalNote}", which is not a written record` : "";
    const saw =
      `${outside.length} line(s) outside scope; approved in writing: ${approved.join(", ") || "none"}; ` +
      `no written approval: ${unapproved.map((l) => `"${l.description}" ${dollars(l.unitRateCents * l.quantity)}`).join(", ") || "none"}${note}; ${tolText(tol)} (an approval is a document, so no tolerance waives a missing one)`;
    // A variation with no written approval is blocked by nature: the machine
    // cannot find a document that does not exist, so a person chases it.
    return { passed, saw, differenceCents: diff, queue: "blocked", reason: `unapproved scope: ${dollars(diff)} with no written approval` };
  },
  contract_sum(bill, po, tol) {
    const adjusted = po.contractSumCents + po.approvedVariationsCents;
    const diff = bill.cumulativeClaimedCents - adjusted;
    const passed = diff <= (tol?.withinCents ?? 0);
    const saw =
      `cumulative claimed ${dollars(bill.cumulativeClaimedCents)} against contract ${dollars(po.contractSumCents)} ` +
      `plus approved variations ${dollars(po.approvedVariationsCents)} = ${dollars(adjusted)}; ${tolText(tol)}`;
    return { passed, saw, differenceCents: Math.max(0, diff), queue: "needs_decision", reason: `overrun of ${dollars(Math.max(0, diff))} on ${po.id} before payment` };
  },
};

async function checkOne(ports, bill, tolerances, now) {
  const source = bill.documents?.[0];

  if (!source) {
    await ports.route(
      bill.id,
      "waiting",
      `query to supplier ${bill.supplierId}: no source document received for ${bill.id}; next chase ${new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10)}`,
    );
    return { id: bill.id, queue: "waiting" };
  }

  // The PO comes first and is not a check. Read only the PO the bill names.
  const po = bill.poId ? await ports.readPurchaseOrder(bill.poId) : null;
  if (!po) {
    const why = bill.poId ? `names ${bill.poId}, which does not exist` : "names no purchase order";
    await ports.escalate(bill.id, `which job is this? ${bill.id} from ${bill.supplierId} ${why}; not matched by inference`);
    await ports.route(bill.id, "blocked", `no purchase order to check against (${why})`);
    return { id: bill.id, queue: "blocked" };
  }

  for (const check of CHECKS) {
    const tol = toleranceFor(tolerances, check, now);
    const r = await RUN[check](bill, po, tol, ports);
    await ports.recordCheck(bill.id, check, r.passed, r.saw);
    if (!r.passed) {
      const neverRan = CHECKS.slice(CHECKS.indexOf(check) + 1);
      await ports.raiseException({ invoiceId: bill.id, differenceCents: r.differenceCents, source, checkName: check });
      await ports.route(bill.id, r.queue, `${check} failed: ${r.reason}; never ran: ${neverRan.join(", ") || "none"}; source ${source}`);
      return { id: bill.id, queue: r.queue, failed: check, neverRan };
    }
  }

  // Clean. A recommendation for a person to book and pay, not an authorisation.
  await ports.route(bill.id, "done_reversible", `all four checks passed against ${po.id}; ready for a person to approve; source ${source}`);
  return { id: bill.id, queue: "done_reversible" };
}

/**
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const tolerances = await ports.readTolerances();
  const bills = await ports.readInvoices();
  const out = [];
  for (const bill of bills) out.push(await checkOne(ports, bill, tolerances, now));
  return out;
}

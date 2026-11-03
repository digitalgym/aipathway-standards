/**
 * PO Match: a three-way match on supplier invoices that arrive by email,
 * built to AIP-BS-INVOICE-CHECK 2026-10-03.
 * https://aipathway.com.au/explore-ai/invoice-check-build-standard
 *
 * A reimplementation from a public listing's one-line description (parse an
 * emailed invoice, match it against the purchase order and what was received,
 * hand the result to the ledger with exceptions raised to a person). Nothing
 * here is taken from any other workflow's prompt, instructions or JSON.
 *
 * The three ways: the invoice (what the supplier charges), the purchase order
 * (what was agreed) and the receipt (what was delivered or marked complete).
 * The standard's four checks cover them in its fixed order:
 *
 *   1. rate          invoice vs purchase order: the agreed unit rate
 *   2. quantity      invoice vs receipt: received or complete, less what was
 *                    claimed before (the cumulative position, not this claim)
 *   3. variation     any line outside the PO's scope needs a written approval
 *                    that reads back from the document store
 *   4. contract_sum  cumulative claimed vs PO total plus approved variations
 *
 * Stops at the first failure. Every invoice ends in exactly one queue.
 *
 * Narrower than "posts to Xero": a clean match is left as a DRAFT bill for a
 * named person to approve. This build has no path that approves, books or pays;
 * it never calls releasePayment. Australian amounts are ex GST, in cents, so
 * the GST line cannot be mistaken for a rate difference.
 */

/** The four checks, in the order the standard fixes. */
export const ORDER = ["rate", "quantity", "variation", "contract_sum"];

/** Days before a waiting row is chased again. Written here and in every reason. */
const CHASE_AFTER_DAYS = 3;

const aud = (cents) => {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
};
const day = (d) => d.toISOString().slice(0, 10);

/**
 * The tolerance in force for one check: the most recent row whose date has
 * arrived. A future-dated row is not in force yet. No row means exact, and the
 * record says so, so nobody mistakes a missing threshold for a generous one.
 */
function inForce(tolerances, check, now) {
  let best = null;
  for (const t of tolerances) {
    if (t.check !== check) continue;
    const from = new Date(t.effectiveFrom);
    if (Number.isNaN(from.getTime()) || from > now) continue;
    if (!best || from > new Date(best.effectiveFrom)) best = t;
  }
  return best;
}

const describeTol = (t) =>
  t ? `tolerance ${aud(t.withinCents)} in force from ${t.effectiveFrom.slice(0, 10)}` : "no tolerance written down, so exact";

const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

/** Check 1: invoice against purchase order. */
function rateCheck(inv, po, tol) {
  const lines = inv.lines.filter((l) => l.inScope);
  const diff = sum(lines, (l) => (l.unitRateCents - po.unitRateCents) * l.quantity);
  const off = lines.filter((l) => l.unitRateCents !== po.unitRateCents);
  return {
    passed: Math.abs(diff) <= (tol?.withinCents ?? 0),
    differenceCents: diff,
    queue: "needs_decision",
    saw:
      `PO ${po.id} agreed ${aud(po.unitRateCents)} a unit; ` +
      (off.length
        ? off.map((l) => `"${l.description}" charged ${aud(l.unitRateCents)} x ${l.quantity}`).join("; ")
        : "every in-scope line charged at the agreed rate") +
      `; difference ${aud(diff)}; ${describeTol(tol)}`,
    why: `unit rate differs from PO ${po.id} by ${aud(diff)}`,
  };
}

/** Check 2: invoice against receipt, cumulatively. */
function quantityCheck(inv, po, tol) {
  const now = sum(inv.lines.filter((l) => l.inScope), (l) => l.quantity);
  const toDate = inv.previouslyClaimedQuantity + now;
  const over = Math.max(0, toDate - inv.completedQuantity);
  const diff = over * po.unitRateCents;
  // Nothing received at all yet: the store or site has not booked the receipt,
  // so the invoice waits on them rather than asking anyone to decide.
  const nothingReceived = inv.completedQuantity === 0 && inv.previouslyClaimedQuantity === 0;
  return {
    passed: diff <= (tol?.withinCents ?? 0),
    differenceCents: diff,
    cumulative: toDate,
    queue: nothingReceived ? "waiting" : "needs_decision",
    saw:
      `received or complete ${inv.completedQuantity}; claimed before ${inv.previouslyClaimedQuantity}, ` +
      `on this invoice ${now}, to date ${toDate}; ${over} not received, ${aud(diff)} at the PO rate; ${describeTol(tol)}`,
    why: nothingReceived
      ? `no receipt booked against PO ${po.id} yet; ${aud(diff)} invoiced ahead of delivery`
      : `claimed ${toDate} to date against ${inv.completedQuantity} received, ${aud(diff)} over`,
  };
}

/** Check 3: written approval for anything outside scope. A note is not a record. */
async function variationCheck(inv, po, tol, ports) {
  const outside = inv.lines.filter((l) => !l.inScope);
  const ok = [];
  const missing = [];
  for (const l of outside) {
    const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
    (doc ? ok : missing).push({ l, doc });
  }
  const diff = sum(missing, ({ l }) => l.unitRateCents * l.quantity);
  const note = inv.verbalApprovalNote ? `; a note says "${inv.verbalApprovalNote}", which is not a written approval` : "";
  return {
    passed: missing.length === 0,
    differenceCents: diff,
    // Blocked by nature: the approval is a document only a person can find.
    queue: "blocked",
    saw:
      `${outside.length} line(s) outside PO ${po.id} scope; written approval read back for: ` +
      (ok.map(({ l, doc }) => `"${l.description}" (${doc.ref})`).join(", ") || "none") +
      `; none found for: ` +
      (missing.map(({ l }) => `"${l.description}" ${aud(l.unitRateCents * l.quantity)}${l.approvalRef ? ` (cites ${l.approvalRef}, not on file)` : ""}`).join(", ") || "none") +
      `${note}; ${describeTol(tol)}, though no tolerance excuses a missing approval`,
    why: `unapproved scope, ${aud(diff)} with no written approval on file`,
  };
}

/** Check 4: cumulative claim against the adjusted contract sum. */
function contractSumCheck(inv, po, tol) {
  const adjusted = po.contractSumCents + po.approvedVariationsCents;
  const over = inv.cumulativeClaimedCents - adjusted;
  return {
    passed: over <= (tol?.withinCents ?? 0),
    differenceCents: Math.max(0, over),
    cumulative: inv.cumulativeClaimedCents,
    queue: "needs_decision",
    saw:
      `claimed to date ${aud(inv.cumulativeClaimedCents)}; PO ${po.id} total ${aud(po.contractSumCents)} ` +
      `plus approved variations ${aud(po.approvedVariationsCents)} is ${aud(adjusted)}; ${describeTol(tol)}`,
    why: `overrun of ${aud(Math.max(0, over))} on PO ${po.id}, flagged before payment`,
  };
}

async function runCheck(name, inv, po, tol, ports) {
  if (name === "rate") return rateCheck(inv, po, tol);
  if (name === "quantity") return quantityCheck(inv, po, tol);
  if (name === "variation") return variationCheck(inv, po, tol, ports);
  return contractSumCheck(inv, po, tol);
}

async function matchOne(ports, inv, tolerances, now) {
  const source = inv.documents?.[0] ?? null;
  const chase = day(new Date(now.getTime() + CHASE_AFTER_DAYS * 86_400_000));

  // No attached invoice document: nothing to compute from and nothing to keep
  // as evidence. Ask the supplier for it.
  if (!source) {
    await ports.route(
      inv.id,
      "waiting",
      `no invoice document attached to ${inv.id}; drafted a request to supplier ${inv.supplierId} for the PDF; chase again ${chase}`,
    );
    return "waiting";
  }

  // The purchase order is read by the id the invoice prints, and only that id.
  // An invoice that names none, or one that does not exist, is never paired
  // with a likely-looking open PO.
  const po = inv.poId ? await ports.readPurchaseOrder(inv.poId) : null;
  if (!po) {
    const why = inv.poId ? `quotes PO ${inv.poId}, which is not in the ledger` : "quotes no PO number";
    await ports.escalate(inv.id, `which job is this? ${inv.id} from ${inv.supplierId} ${why}; not matched to any other PO`);
    await ports.route(inv.id, "blocked", `no purchase order to match against: ${inv.id} ${why}; source ${source}`);
    return "blocked";
  }

  for (const name of ORDER) {
    const tol = inForce(tolerances, name, now);
    const r = await runCheck(name, inv, po, tol, ports);
    await ports.recordCheck(inv.id, name, r.passed, r.saw);
    if (r.passed) continue;

    const neverRan = ORDER.slice(ORDER.indexOf(name) + 1);
    await ports.raiseException({ invoiceId: inv.id, differenceCents: r.differenceCents, source, checkName: name });
    const chaseText = r.queue === "waiting" ? `; chase the receipt ${chase}` : "";
    await ports.route(
      inv.id,
      r.queue,
      `${name} failed: ${r.why}; never ran: ${neverRan.join(", ") || "none"}; source ${source}${chaseText}`,
    );
    return r.queue;
  }

  await ports.route(
    inv.id,
    "done_reversible",
    `three-way match clean against PO ${po.id} and its receipt; left as a draft bill for a named person to approve; source ${source}`,
  );
  return "done_reversible";
}

/**
 * One run. Woken by email.received (one invoice) or schedule.tick (the batch);
 * either way it reads the batch from the ledger and works each by its id.
 *
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const tolerances = await ports.readTolerances();
  const invoices = await ports.readInvoices();
  const out = [];
  for (const inv of invoices) {
    out.push({ id: inv.id, queue: await matchOne(ports, inv, tolerances, now) });
  }
  return out;
}

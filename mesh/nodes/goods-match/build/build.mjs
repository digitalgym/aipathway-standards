/**
 * Goods Match: the build, to AIP-BS-INVOICE-CHECK 2026-10-03.
 *
 * A supplier invoice is held against its purchase order and what the store has
 * actually booked in as received (the goods-received note), then put in
 * exactly one of the four queues for the finance team. It proposes. It never
 * pays, never approves, never alters a rate, and never matches a purchase order
 * by guesswork.
 *
 * The order is the claim, and it stops at the first failure:
 *
 *   0. Is there a purchase order? None, or one that does not exist: blocked,
 *      "which job is this?". Not a check, and no check is recorded.
 *   0. Is the source document attached? No copy of the invoice: waiting on the
 *      supplier for it. Nothing is compared without the thing it came from.
 *   1. Rate: each in-scope line's unit rate against the PO's agreed rate.
 *   2. Quantity: what this invoice claims against what was received on the
 *      goods-received note, less what earlier invoices already claimed. A
 *      duplicate invoice fails here, because its goods were already claimed.
 *   3. Variation: every line outside the PO's scope needs a written approval
 *      that reads back from the document store. A verbal note is not one.
 *   4. Contract sum: everything claimed to date, this invoice included,
 *      against the PO total plus variations approved in writing.
 *
 * Every tolerance is read from the written register (readTolerances), with its
 * date, and nothing is hard-coded here: a check with no written tolerance is
 * exact, and the record says so.
 *
 * Everything outside goes through the ports. Every port call is awaited, so the
 * same build runs on the stub and on a live ledger and sheet.
 */

const CHECKS = ["rate", "quantity", "variation", "contract_sum"];

/** Kinds of document that count as a written variation approval. */
const WRITTEN_APPROVAL = /^(written_approval|variation_approval|signed_variation|site_instruction)$/;

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const lineCents = (l) => l.unitRateCents * l.quantity;

/**
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const tolerances = (await ports.readTolerances()) ?? [];
  const toleranceFor = (check) => {
    const t = tolerances.find((x) => x.check === check);
    return t ? { cents: t.withinCents, note: `tolerance ${dollars(t.withinCents)} from ${t.effectiveFrom}` } : { cents: 0, note: "no written tolerance: exact" };
  };

  const invoices = (await ports.readInvoices()) ?? [];
  for (const inv of invoices) {
    await checkOne(ports, inv, toleranceFor);
  }
}

async function checkOne(ports, inv, toleranceFor) {
  // The PO comes first and is not a check. Never look for a nearby one.
  const po = inv.poId ? await ports.readPurchaseOrder(inv.poId) : null;
  if (!po) {
    const why = inv.poId ? `names PO ${inv.poId}, which does not exist` : "names no purchase order";
    await ports.escalate(inv.id, `no purchase order: invoice ${inv.id} ${why}. Which job is this?`);
    await ports.route(inv.id, "blocked", "no purchase order: which job is this?");
    return;
  }

  const source = inv.documents?.[0];
  if (!source) {
    await ports.escalate(inv.id, `no source document attached to invoice ${inv.id}; ask the supplier for a copy`);
    await ports.route(inv.id, "waiting", "waiting on the supplier: no copy of the invoice to check against");
    return;
  }

  const inScope = inv.lines.filter((l) => l.inScope);
  const outOfScope = inv.lines.filter((l) => !l.inScope);

  const fail = async (check, differenceCents, saw, queue, reason) => {
    const ran = CHECKS.indexOf(check);
    const neverRan = CHECKS.slice(ran + 1);
    await ports.recordCheck(inv.id, check, false, saw);
    await ports.raiseException({ invoiceId: inv.id, differenceCents, source, checkName: check });
    await ports.route(inv.id, queue, `${reason}; difference ${dollars(differenceCents)}; never ran: ${neverRan.join(", ") || "none"}; source ${source}`);
    if (queue === "blocked") await ports.escalate(inv.id, reason);
  };

  // Check 1: rate.
  {
    const tol = toleranceFor("rate");
    const diff = inScope.reduce((s, l) => s + (l.unitRateCents - po.unitRateCents) * l.quantity, 0);
    const worst = inScope.find((l) => l.unitRateCents !== po.unitRateCents);
    const saw = `PO ${po.id} rate ${dollars(po.unitRateCents)}; invoice rates ${inScope.map((l) => dollars(l.unitRateCents)).join(", ") || "none"}; ${tol.note}`;
    if (Math.abs(diff) > tol.cents || (worst && tol.cents === 0)) {
      await fail("rate", diff, saw, "needs_decision", `rate: invoice charges ${dollars(worst.unitRateCents)} against the agreed ${dollars(po.unitRateCents)} on ${po.id}`);
      return;
    }
    await ports.recordCheck(inv.id, "rate", true, saw);
  }

  // Check 2: quantity against goods received, less what was already invoiced.
  {
    const claimed = inScope.reduce((s, l) => s + l.quantity, 0);
    const available = inv.completedQuantity - inv.previouslyClaimedQuantity;
    const overQty = claimed - available;
    const diff = Math.max(0, overQty) * po.unitRateCents;
    const tol = toleranceFor("quantity");
    const saw = `received ${inv.completedQuantity}, invoiced before ${inv.previouslyClaimedQuantity}, this invoice ${claimed}; ${tol.note}`;
    if (overQty > 0 && diff > tol.cents) {
      const dup = available <= 0 ? " (everything received is already invoiced: possible duplicate)" : "";
      await fail("quantity", diff, saw, "needs_decision", `quantity: claims ${claimed} with ${Math.max(0, available)} received and not yet invoiced${dup}`);
      return;
    }
    await ports.recordCheck(inv.id, "quantity", true, saw);
  }

  // Check 3: variation. A written record, read back by its reference. Never a note.
  {
    const unapproved = [];
    for (const l of outOfScope) {
      const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
      if (!doc || !WRITTEN_APPROVAL.test(doc.kind)) unapproved.push(l);
    }
    const diff = unapproved.reduce((s, l) => s + lineCents(l), 0);
    const saw = `${outOfScope.length} line(s) outside scope, ${unapproved.length} without a written approval${inv.verbalApprovalNote ? "; verbal note ignored: not a record" : ""}`;
    if (unapproved.length > 0) {
      await fail("variation", diff, saw, "blocked", `unapproved scope: ${unapproved.map((l) => l.description).join("; ")} has no written approval`);
      return;
    }
    await ports.recordCheck(inv.id, "variation", true, saw);
  }

  // Check 4: contract sum, cumulative.
  {
    const tol = toleranceFor("contract_sum");
    const adjusted = po.contractSumCents + po.approvedVariationsCents;
    const over = inv.cumulativeClaimedCents - adjusted;
    const saw = `claimed to date ${dollars(inv.cumulativeClaimedCents)} against ${dollars(adjusted)} (contract plus approved variations); ${tol.note}`;
    if (over > tol.cents) {
      await fail("contract_sum", over, saw, "needs_decision", `contract sum: overrun of ${dollars(over)} on ${po.id} before payment`);
      return;
    }
    await ports.recordCheck(inv.id, "contract_sum", true, saw);
  }

  // Clean. Listed, visible and reversible, waiting for a named person. Nothing is paid.
  await ports.route(inv.id, "done_reversible", `clean match against ${po.id} and its goods received; waits for a named person to approve; source ${source}`);
}

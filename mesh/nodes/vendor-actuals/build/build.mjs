/**
 * Vendor Actuals: the supplier invoice check, built to AIP-BS-INVOICE-CHECK.
 *
 * Each run works the batch of supplier invoices in the ledger. For each one:
 *
 *   0. It needs the purchase order the invoice itself names. No PO, or a PO
 *      that does not exist, is never matched to a nearby one: it is escalated
 *      to the named owner with "which job is this?" and blocked. No source
 *      document means there is nothing to check against: it waits on the
 *      supplier for a copy.
 *   1. Rate: every in-scope line's unit rate against the agreed rate.
 *   2. Quantity: what is claimed now against what is marked complete, less
 *      what was claimed before (the vendor's actuals to date).
 *   3. Variation: every line outside the original scope needs a written
 *      approval that reads back from the document store. A verbal note is not
 *      one, and is never read as one.
 *   4. Contract sum: cumulative claimed against the contract total plus the
 *      variations approved in writing.
 *
 * It stops at the first failure, records what each check saw, and puts every
 * invoice in exactly one queue. A clean match is a recommendation for a named
 * person to approve; this build never calls the payment release.
 *
 * Tolerances are read from the rule store with their dates, never held in
 * this file. A check with no tolerance on file is exact.
 *
 * Everything goes through the ports. Every port call is awaited so the same
 * build runs against the business's own systems.
 */

export const OWNER = "accounts payable (the person the business names for supplier invoices)";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export async function build(ports) {
  const invoices = await ports.readInvoices();
  if (!invoices || invoices.length === 0) return;

  const tolerances = (await ports.readTolerances()) ?? [];
  const tolFor = (check) => {
    const rows = tolerances.filter((t) => t.check === check);
    if (rows.length === 0) return { withinCents: 0, effectiveFrom: null };
    // The newest threshold in force wins.
    rows.sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
    return rows[0];
  };
  const tolText = (t) =>
    t.effectiveFrom ? `tolerance ${money(t.withinCents)} in force from ${t.effectiveFrom}` : "no tolerance on file, so exact";

  const outcomes = [];

  for (const inv of invoices) {
    // Step 0. The order the invoice names, by its id. Never by inference.
    if (!inv.poId) {
      await ports.escalate(inv.id, `No purchase order named on the invoice. Which job is this? Owner: ${OWNER}`);
      outcomes.push({ id: inv.id, queue: "blocked", reason: "no purchase order named; escalated, not matched", atRisk: inv.amount });
      continue;
    }
    const po = await ports.readPurchaseOrder(inv.poId);
    if (!po) {
      await ports.escalate(inv.id, `Purchase order ${inv.poId} does not exist in the ledger. Which job is this? Owner: ${OWNER}`);
      outcomes.push({ id: inv.id, queue: "blocked", reason: `purchase order ${inv.poId} not found; escalated`, atRisk: inv.amount });
      continue;
    }
    if (po.supplierId !== inv.supplierId) {
      await ports.escalate(inv.id, `Purchase order ${po.id} belongs to another supplier. Owner: ${OWNER}`);
      outcomes.push({ id: inv.id, queue: "blocked", reason: `purchase order ${po.id} is another supplier's`, atRisk: inv.amount });
      continue;
    }
    const source = (inv.documents ?? [])[0];
    if (!source) {
      await ports.escalate(inv.id, `No source document on the invoice. Waiting on the supplier for a copy. Owner: ${OWNER}`);
      outcomes.push({ id: inv.id, queue: "waiting", reason: "waiting on the supplier for the source document", atRisk: inv.amount });
      continue;
    }

    const inScope = inv.lines.filter((l) => l.inScope);
    const outOfScope = inv.lines.filter((l) => !l.inScope);
    let failed = null;

    // Check 1: rate.
    {
      const t = tolFor("rate");
      const diff = inScope.reduce((s, l) => s + (l.unitRateCents - po.unitRateCents) * l.quantity, 0);
      const worst = inScope.find((l) => Math.abs((l.unitRateCents - po.unitRateCents) * l.quantity) > t.withinCents);
      const passed = !worst && Math.abs(diff) <= t.withinCents;
      const saw = `PO ${po.id} agreed rate ${money(po.unitRateCents)}; invoice rates ${inScope
        .map((l) => `${money(l.unitRateCents)} x ${l.quantity}`)
        .join(", ") || "none in scope"}; difference ${money(diff)}; ${tolText(t)}`;
      await ports.recordCheck(inv.id, "rate", passed, saw);
      if (!passed) failed = { check: "rate", diff, queue: "needs_decision", why: "rate differs from the agreed rate" };
    }

    // Check 2: quantity against the vendor's actuals to date.
    if (!failed) {
      const claimed = inScope.reduce((s, l) => s + l.quantity, 0);
      const available = inv.completedQuantity - inv.previouslyClaimedQuantity;
      const over = Math.max(0, claimed - available);
      const diff = over * po.unitRateCents;
      const t = tolFor("quantity");
      const passed = diff <= t.withinCents;
      const saw = `claimed ${claimed}; marked complete ${inv.completedQuantity}; claimed before ${inv.previouslyClaimedQuantity}; available ${available}; over by ${over} (${money(diff)}); ${tolText(t)}`;
      await ports.recordCheck(inv.id, "quantity", passed, saw);
      if (!passed) failed = { check: "quantity", diff, queue: "needs_decision", why: "claimed more than is complete and unclaimed", cumulative: inv.previouslyClaimedQuantity + claimed };
    }

    // Check 3: variation, against a written record only.
    if (!failed) {
      let unapproved = 0;
      const seen = [];
      for (const l of outOfScope) {
        const value = l.unitRateCents * l.quantity;
        const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
        const written = !!doc && doc.ref === l.approvalRef;
        seen.push(`"${l.description}" ${money(value)}: ${written ? `written approval ${doc.ref} (${doc.kind})` : l.approvalRef ? `approval ${l.approvalRef} not in the document store` : "no approval reference"}`);
        if (!written) unapproved += value;
      }
      const passed = unapproved === 0;
      const saw = outOfScope.length === 0
        ? "no lines outside the original scope"
        : `${seen.join("; ")}${inv.verbalApprovalNote ? `; a verbal note is on file and is not a record` : ""}`;
      await ports.recordCheck(inv.id, "variation", passed, saw);
      if (!passed) failed = { check: "variation", diff: unapproved, queue: "blocked", why: "unapproved scope: no written variation approval" };
    }

    // Check 4: contract sum, cumulative.
    if (!failed) {
      const adjusted = po.contractSumCents + po.approvedVariationsCents;
      const over = Math.max(0, inv.cumulativeClaimedCents - adjusted);
      const t = tolFor("contract_sum");
      const passed = over <= t.withinCents;
      const saw = `claimed to date ${money(inv.cumulativeClaimedCents)}; contract ${money(po.contractSumCents)} plus approved variations ${money(po.approvedVariationsCents)} = ${money(adjusted)}; over by ${money(over)}; ${tolText(t)}`;
      await ports.recordCheck(inv.id, "contract_sum", passed, saw);
      if (!passed) failed = { check: "contract_sum", diff: over, queue: "needs_decision", why: "overrun before payment", cumulative: inv.cumulativeClaimedCents };
    }

    if (failed) {
      await ports.raiseException({
        invoiceId: inv.id,
        differenceCents: failed.diff,
        source,
        checkName: failed.check,
      });
      const order = ["rate", "quantity", "variation", "contract_sum"];
      const neverRan = order.slice(order.indexOf(failed.check) + 1);
      outcomes.push({
        id: inv.id,
        queue: failed.queue,
        reason: `${failed.check} failed: ${failed.why}; difference ${money(failed.diff)}; never ran: ${neverRan.join(", ") || "none"}; source ${source}; owner: ${OWNER}`,
        atRisk: Math.abs(failed.diff),
      });
    } else {
      outcomes.push({
        id: inv.id,
        queue: "done_reversible",
        reason: `clean match on ${po.id}; waiting for ${OWNER} to approve; nothing paid`,
        atRisk: 0,
      });
    }
  }

  // Queue 1 is read in order of dollars at risk.
  const rank = { needs_decision: 0, waiting: 1, blocked: 2, done_reversible: 3 };
  outcomes.sort((a, b) => rank[a.queue] - rank[b.queue] || b.atRisk - a.atRisk);
  for (const o of outcomes) await ports.route(o.id, o.queue, o.reason);
}

/**
 * Price Creep: every supplier bill's line prices checked against the agreed
 * price list before anyone approves it, to AIP-BS-INVOICE-CHECK
 * (https://aipathway.com.au/explore-ai/invoice-check-build-standard).
 *
 * The job, in the owner's words: when a supplier bill lands in Xero or MYOB,
 * compare every line price with the price we agreed with that supplier, flag
 * every rise in dollars, and put it in front of a named person.
 *
 * The agreed price list is the "schedule of rates" the standard names. The bill
 * must name it (the trade account price list or order reference). The rate
 * check is check 1 of four, and the standard runs all four in order and stops
 * at the first failure:
 *
 *   1. rate          each price-list line against the agreed unit price
 *   2. quantity      billed quantity against delivered, less already billed
 *   3. variation     every line not on the price list needs a written approval
 *   4. contract_sum  billed to date against the order total plus approved extras
 *
 * What it never does: approve a bill, change a price, guess which price list a
 * bill belongs to, accept an extra line because a covering email says it was
 * agreed, take the last price paid as the agreed price, or pay anything.
 * releasePayment is never called. A clean bill lands in done_reversible for a
 * person to approve.
 *
 * Every tolerance (the "close enough" for rounding and freight) comes from
 * readTolerances() with its date. A check with no written tolerance is exact.
 */

const ORDER = ["rate", "quantity", "variation", "contract_sum"];

const aud = (cents) => `$${(cents / 100).toFixed(2)}`;

function writtenTolerance(rows, check) {
  const row = rows.find((r) => r.check === check);
  if (!row) return { cents: 0, from: "none written, so exact" };
  return { cents: row.withinCents, from: row.effectiveFrom };
}

const tolLine = (t) => `close-enough ${aud(t.cents)} (written ${t.from})`;

/** Check 1. Every line on the price list, priced against the agreed unit price. Rises and drops both named. */
function priceCheck(bill, list, tol) {
  const listed = bill.lines.filter((l) => l.inScope);
  let rises = 0;
  let drops = 0;
  const notes = [];
  for (const l of listed) {
    const perUnit = l.unitRateCents - list.unitRateCents;
    const cents = perUnit * l.quantity;
    if (perUnit > 0) {
      rises += cents;
      notes.push(`RISE "${l.description}" billed ${aud(l.unitRateCents)} vs agreed ${aud(list.unitRateCents)}, up ${aud(perUnit)} x ${l.quantity} = ${aud(cents)}`);
    } else if (perUnit < 0) {
      drops += -cents;
      notes.push(`below list "${l.description}" billed ${aud(l.unitRateCents)} vs agreed ${aud(list.unitRateCents)}`);
    } else {
      notes.push(`"${l.description}" at agreed ${aud(list.unitRateCents)}`);
    }
  }
  const difference = rises + drops;
  return {
    passed: difference <= tol.cents,
    difference,
    saw: `price list ${list.id}: ${notes.join("; ") || "no price-list lines"}; rises ${aud(rises)}, below list ${aud(drops)}; ${tolLine(tol)}`,
  };
}

/** Check 2. Billed against delivered, taking what was billed before into account. */
function deliveredCheck(bill, list, tol) {
  const billed = bill.lines.filter((l) => l.inScope).reduce((n, l) => n + l.quantity, 0);
  const open = bill.completedQuantity - bill.previouslyClaimedQuantity;
  const over = Math.max(0, billed - open);
  const difference = over * list.unitRateCents;
  return {
    passed: difference <= tol.cents,
    difference,
    saw: `price list ${list.id}: billed ${billed} now; delivered ${bill.completedQuantity}; billed before ${bill.previouslyClaimedQuantity}; still to bill ${open}; over by ${over} (${aud(difference)}); ${tolLine(tol)}`,
  };
}

/** Check 3. A line not on the price list needs a written approval in the store. A note is not one. */
async function extrasCheck(bill, ports) {
  const extras = bill.lines.filter((l) => !l.inScope);
  const unapproved = [];
  const notes = [];
  for (const l of extras) {
    const record = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
    if (record) {
      notes.push(`"${l.description}" approved in writing (${record.ref}, ${record.kind})`);
    } else {
      unapproved.push(l);
      notes.push(`"${l.description}" ${l.approvalRef ? `points at ${l.approvalRef}, which is not on file` : "has no approval on file"}`);
    }
  }
  const difference = unapproved.reduce((s, l) => s + l.unitRateCents * l.quantity, 0);
  const said = bill.verbalApprovalNote ? `; covering note says "${bill.verbalApprovalNote}", not a written approval` : "";
  return {
    passed: unapproved.length === 0,
    difference,
    saw: `${extras.length} line(s) not on the price list: ${notes.join("; ") || "none"}; unapproved ${aud(difference)}${said}`,
  };
}

/** Check 4. Billed to date against the order total plus extras approved in writing. */
function orderTotalCheck(bill, list, tol) {
  const ceiling = list.contractSumCents + list.approvedVariationsCents;
  const over = Math.max(0, bill.cumulativeClaimedCents - ceiling);
  return {
    passed: over <= tol.cents,
    difference: over,
    saw: `order ${list.id}: billed to date ${aud(bill.cumulativeClaimedCents)} vs total ${aud(list.contractSumCents)} + approved extras ${aud(list.approvedVariationsCents)} = ${aud(ceiling)}; over by ${aud(over)}; ${tolLine(tol)}`,
  };
}

/** Unapproved extras are blocked by nature; a price, quantity or total mismatch needs a decision. */
const QUEUE_FOR = { rate: "needs_decision", quantity: "needs_decision", variation: "blocked", contract_sum: "needs_decision" };

/**
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const bills = await ports.readInvoices();
  const tolerances = await ports.readTolerances();

  for (const bill of bills) {
    const sourceRef = bill.documents[0];
    if (!sourceRef || !(await ports.readDocument(sourceRef))) {
      const why = sourceRef ? `bill PDF ${sourceRef} is not on file` : "no bill PDF attached";
      await ports.escalate(bill.id, why);
      await ports.route(bill.id, "waiting", `${why}: ask the supplier to resend the bill`);
      continue;
    }

    // The price list the bill names, and only that one. Never the nearest open order for the supplier.
    const list = bill.poId ? await ports.readPurchaseOrder(bill.poId) : null;
    if (!list) {
      const why = bill.poId ? `bill names ${bill.poId}, which is not on file` : "bill names no price list or order";
      await ports.escalate(bill.id, `${why}: which price list and job is this?`);
      await ports.route(bill.id, "blocked", `${why}: which price list and job is this?`);
      continue;
    }

    let failed = null;
    for (const check of ORDER) {
      let r;
      if (check === "rate") r = priceCheck(bill, list, writtenTolerance(tolerances, "rate"));
      else if (check === "quantity") r = deliveredCheck(bill, list, writtenTolerance(tolerances, "quantity"));
      else if (check === "variation") r = await extrasCheck(bill, ports);
      else r = orderTotalCheck(bill, list, writtenTolerance(tolerances, "contract_sum"));
      await ports.recordCheck(bill.id, check, r.passed, r.saw);
      if (!r.passed) {
        failed = { check, ...r };
        break; // first failure stops the run; later checks are never evaluated
      }
    }

    if (!failed) {
      await ports.route(bill.id, "done_reversible", `every line at the agreed price on ${list.id}; all four checks passed; waiting for a named person to approve`);
      continue;
    }

    const notRun = ORDER.slice(ORDER.indexOf(failed.check) + 1);
    await ports.raiseException({ invoiceId: bill.id, differenceCents: failed.difference, source: sourceRef, checkName: failed.check });
    await ports.route(
      bill.id,
      QUEUE_FOR[failed.check],
      `${failed.check} check failed by ${aud(failed.difference)} against ${list.id}; never ran: ${notRun.join(", ") || "none"}`,
    );
  }
}

/**
 * Claim Check: a subcontractor claim checked against what was agreed, to
 * AIP-BS-INVOICE-CHECK (https://aipathway.com.au/explore-ai/invoice-check-build-standard).
 *
 * The job, in the owner's words: every claim a subbie sends in, check each
 * unit rate against the agreed contract rate before anyone pays it, log what
 * was compared, and put a mismatch in front of a named person.
 *
 * The rate check is check 1 of four. The standard runs all four in order and
 * stops at the first failure, so this build does too:
 *
 *   1. rate          each in-scope line's unit rate against the PO / subcontract rate
 *   2. quantity      claimed quantity against completed less previously claimed
 *   3. variation     every out-of-scope line needs a written approval in the store
 *   4. contract_sum  cumulative claimed against contract sum plus approved variations
 *
 * What it never does: approve a claim, alter a rate, match a purchase order by
 * guesswork, pass a variation without its written approval, or pay anything.
 * releasePayment is never called. A clean claim lands in done_reversible as a
 * recommendation for a person, nothing more.
 *
 * Every tolerance comes from readTolerances(), with its date, so the operator
 * can read what is in force. A check with no written tolerance is exact.
 */

const CHECKS = ["rate", "quantity", "variation", "contract_sum"];

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

/** The written tolerance for a check, or an exact (zero) one when none is written. */
function toleranceFor(tolerances, check) {
  const t = tolerances.find((x) => x.check === check);
  return t ? { withinCents: t.withinCents, effectiveFrom: t.effectiveFrom } : { withinCents: 0, effectiveFrom: "none written: exact" };
}

const tolText = (t) => `tolerance ${dollars(t.withinCents)} effective ${t.effectiveFrom}`;

/** Check 1, rate. Difference is the dollars overcharged across in-scope lines. */
function checkRate(inv, po, tol) {
  const lines = inv.lines.filter((l) => l.inScope);
  const diffs = lines.map((l) => ({ l, cents: (l.unitRateCents - po.unitRateCents) * l.quantity }));
  const difference = diffs.reduce((s, d) => s + Math.abs(d.cents), 0);
  const detail = diffs
    .map((d) => `"${d.l.description}" ${dollars(d.l.unitRateCents)} x ${d.l.quantity} vs agreed ${dollars(po.unitRateCents)}`)
    .join("; ");
  return {
    passed: difference <= tol.withinCents,
    difference,
    saw: `PO ${po.id} agreed rate ${dollars(po.unitRateCents)}; ${detail || "no in-scope lines"}; difference ${dollars(difference)}; ${tolText(tol)}`,
  };
}

/** Check 2, quantity or progress. The cumulative position, not just this claim. */
function checkQuantity(inv, po, tol) {
  const claimed = inv.lines.filter((l) => l.inScope).reduce((s, l) => s + l.quantity, 0);
  const available = inv.completedQuantity - inv.previouslyClaimedQuantity;
  const overQty = Math.max(0, claimed - available);
  const difference = overQty * po.unitRateCents;
  return {
    passed: difference <= tol.withinCents,
    difference,
    saw: `PO ${po.id}: claimed ${claimed} this claim; completed ${inv.completedQuantity}; previously claimed ${inv.previouslyClaimedQuantity}; available ${available}; over by ${overQty} (${dollars(difference)}); ${tolText(tol)}`,
  };
}

/** Check 3, variation. A written record in the store, never a note or an email's tone. */
async function checkVariation(inv, ports) {
  const outOfScope = inv.lines.filter((l) => !l.inScope);
  const unapproved = [];
  const seen = [];
  for (const l of outOfScope) {
    const doc = l.approvalRef ? await ports.readDocument(l.approvalRef) : null;
    if (doc) seen.push(`"${l.description}" approved by ${doc.ref} (${doc.kind})`);
    else {
      unapproved.push(l);
      seen.push(`"${l.description}" ${l.approvalRef ? `cites ${l.approvalRef}, not in the document store` : "has no approval reference"}`);
    }
  }
  const difference = unapproved.reduce((s, l) => s + l.unitRateCents * l.quantity, 0);
  const note = inv.verbalApprovalNote ? `; a note claims "${inv.verbalApprovalNote}", which is not a written record` : "";
  return {
    passed: unapproved.length === 0,
    difference,
    saw: `${outOfScope.length} line(s) outside original scope: ${seen.join("; ") || "none"}; unapproved ${dollars(difference)}${note}`,
  };
}

/** Check 4, contract sum. Cumulative claimed against the adjusted sum. */
function checkContractSum(inv, po, tol) {
  const adjusted = po.contractSumCents + po.approvedVariationsCents;
  const over = Math.max(0, inv.cumulativeClaimedCents - adjusted);
  return {
    passed: over <= tol.withinCents,
    difference: over,
    saw: `PO ${po.id}: cumulative claimed ${dollars(inv.cumulativeClaimedCents)} vs contract ${dollars(po.contractSumCents)} + approved variations ${dollars(po.approvedVariationsCents)} = ${dollars(adjusted)}; over by ${dollars(over)}; ${tolText(tol)}`,
  };
}

/** Where a failed check sends the claim. Unapproved scope is blocked by nature; the rest need a decision. */
const QUEUE_ON_FAIL = { rate: "needs_decision", quantity: "needs_decision", variation: "blocked", contract_sum: "needs_decision" };

/**
 * @param {import("@aipathway/conformance").InvoicePorts} ports
 */
export async function build(ports) {
  const invoices = await ports.readInvoices();
  const tolerances = await ports.readTolerances();

  for (const inv of invoices) {
    const source = inv.documents[0];

    // No source document at all: nothing to compare and nothing to keep. A person asks for it.
    if (!source) {
      await ports.escalate(inv.id, "no source document attached to the claim");
      await ports.route(inv.id, "waiting", "no source document: ask the subcontractor to resend the claim");
      continue;
    }
    const doc = await ports.readDocument(source);
    if (!doc) {
      await ports.escalate(inv.id, `source document ${source} is not in the document store`);
      await ports.route(inv.id, "waiting", `source document ${source} not in the store: ask the subcontractor to resend`);
      continue;
    }

    // The purchase order comes first and is not a check. Only the one the claim names; never a nearby one.
    const po = inv.poId ? await ports.readPurchaseOrder(inv.poId) : null;
    if (!po) {
      const why = inv.poId ? `claim names ${inv.poId}, which does not exist` : "claim names no purchase order or subcontract";
      await ports.escalate(inv.id, `${why}: which job is this?`);
      await ports.route(inv.id, "blocked", `${why}: which job is this?`);
      continue;
    }

    let failed = null;
    for (const check of CHECKS) {
      const r =
        check === "rate"
          ? checkRate(inv, po, toleranceFor(tolerances, "rate"))
          : check === "quantity"
            ? checkQuantity(inv, po, toleranceFor(tolerances, "quantity"))
            : check === "variation"
              ? await checkVariation(inv, ports)
              : checkContractSum(inv, po, toleranceFor(tolerances, "contract_sum"));
      await ports.recordCheck(inv.id, check, r.passed, r.saw);
      if (!r.passed) {
        failed = { check, ...r };
        break; // stop at the first failure: the later checks never run
      }
    }

    if (!failed) {
      await ports.route(inv.id, "done_reversible", `all four checks passed against ${po.id}; waiting for a named person to approve`);
      continue;
    }

    const neverRan = CHECKS.slice(CHECKS.indexOf(failed.check) + 1);
    await ports.raiseException({ invoiceId: inv.id, differenceCents: failed.difference, source, checkName: failed.check });
    await ports.route(
      inv.id,
      QUEUE_ON_FAIL[failed.check],
      `failed ${failed.check} by ${dollars(failed.difference)} against ${po.id}; never ran: ${neverRan.join(", ") || "none"}`,
    );
  }
}

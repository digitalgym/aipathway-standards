/**
 * Confirm Check, built to AIP-BS-TWO-RECORDS (two-records-build-standard).
 *
 * The office job: when a supplier sends back its order confirmation (the
 * acknowledgement, not the invoice), check it against the purchase order we
 * sent, line by line, for unit price, quantity and delivery date, before
 * anything is delivered. Every difference goes in front of the buyer with
 * both values side by side.
 *
 * Source a is the purchase order in the job system (Simpro, ServiceM8,
 * Tradify, Fergus): it issued the order number and each line number, and it is
 * right about the unit price we agreed and the quantity we ordered. Source b
 * is the supplier's order confirmation, filed from the inbox against our order
 * number: it is right about the delivery date the supplier can actually meet.
 * Which side is right about which field is the pair contract a person wrote;
 * this build never decides it.
 *
 * Records join on the order line id (our order number and line number, both
 * printed on the confirmation). Never on the item description, the supplier
 * name or an amount.
 *
 * What it never does: accept a confirmation because the total looks right;
 * change the order or the confirmation because they differ; overwrite the
 * value that was there before a fix. Its only write is a correction a named
 * person accepted: the confirmed delivery date onto our order line, or, where
 * the supplier's side is wrong, a task to have the supplier reissue its
 * confirmation, which carries the supplier's new confirmation id back.
 *
 * It is not the invoice check. Nothing here approves a bill or pays anyone.
 *
 * Everything goes through the ports it is handed. One call is one run.
 */

const other = (s) => (s === "a" ? "b" : "a");
const NUMERIC_LABEL = { unit_price: "unit price (cents ex GST)", quantity: "quantity" };

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `order-confirm-check-${now.toISOString()}`;

  // 1. The contract before any record. No contract, no master, no run.
  const contract = await ports.readContract();
  const masters = contract && contract.masterByField ? contract.masterByField : {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "order_confirm_check.contract_missing",
      "No written pair contract naming the order line id as the key and a master per field. Nothing was read or compared.",
    );
    return;
  }
  const owner = contract.owner;
  if (!owner) {
    await ports.escalate("order_confirm_check.owner_missing", `Contract ${contract.id} names no buyer to own differences.`);
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
  const threshold = contract.threshold ?? { amount: Infinity, mismatchRate: 1 };

  // 2. Write what the buyer accepted since the last run, once each.
  let corrected = 0;
  const acceptances = await ports.readAcceptances();
  for (const acc of acceptances) {
    if (!acc.acceptedBy) continue;
    const writtenId = await ports.writeField({
      source: acc.target,
      key: acc.key,
      field: acc.field,
      value: acc.value,
      correction: { differenceId: acc.differenceId, acceptedBy: acc.acceptedBy, acceptedAt: acc.acceptedAt },
    });
    if (writtenId) {
      corrected += 1;
    } else {
      await ports.notify({
        to: owner,
        reason: "order_confirm_check.write_not_read_back",
        detail: `Order line ${acc.key}: the accepted ${acc.field} correction returned no id from ${acc.target === "a" ? contract.sourceA : contract.sourceB}. Key it by hand and record the id.`,
      });
    }
  }

  // 3. Both sides, joined on the order line id and nothing else.
  const orders = await ports.readSourceA();
  const confirmations = await ports.readSourceB();
  const byKey = (list) => {
    const m = new Map();
    for (const r of list) if (r && typeof r.key === "string" && r.key !== "") m.set(r.key, r);
    return m;
  };
  const a = byKey(orders);
  const b = byKey(confirmations);

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  const overAmount = [];

  for (const [key, ra] of a) {
    const rb = b.get(key);
    if (!rb) continue;
    let worst = "matched";
    for (const field of fields) {
      const va = ra.fields[field];
      const vb = rb.fields[field];
      if (va === undefined && vb === undefined) continue;
      const master = masters[field];
      const masterValue = master === "a" ? va : vb;

      if (typeof va === "number" && typeof vb === "number") {
        const gap = Math.abs(va - vb);
        if (gap === 0) continue;
        const declared = Object.prototype.hasOwnProperty.call(tolerance, field) && typeof tolerance[field] === "number";
        if (declared && gap <= tolerance[field]) {
          await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "within_tolerance" });
          if (worst === "matched") worst = "within";
          continue;
        }
        const d = await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "open" });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: other(master) });
        if (gap > threshold.amount) overAmount.push({ key, field, va, vb, gap });
        worst = "open";
        continue;
      }

      if (va === vb) continue;
      const d = await ports.raiseDifference({
        runId,
        key,
        field,
        valueA: va ?? "",
        valueB: vb ?? "",
        masterValue: masterValue ?? null,
        status: "open",
      });
      if (masterValue !== undefined) {
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: other(master) });
      }
      worst = "open";
    }
    if (worst === "matched") matched += 1;
    else if (worst === "within") withinTolerance += 1;
    else mismatched += 1;
  }

  // 4. A line on one side only is an orphan with a reason and an owner.
  for (const key of a.keys()) {
    if (b.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `Order line ${key} is on our purchase order in ${contract.sourceA} but not on the ${contract.sourceB}: the supplier dropped it, or has not confirmed it yet.`,
      owner,
    });
  }
  for (const key of b.keys()) {
    if (a.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `Order line ${key} is on the ${contract.sourceB} but on no purchase order line in ${contract.sourceA}: a line we did not order, or a substitute.`,
      owner,
    });
  }

  // 5. Over the amount, or too many open, the buyer hears this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "order_confirm_check.over_threshold",
      detail: `Order line ${o.key}: ${NUMERIC_LABEL[o.field] ?? o.field} is ${o.va} on our order and ${o.vb} on the supplier's confirmation, a gap of ${o.gap}, over the ${threshold.amount} the contract allows.`,
    });
  }
  const joined = matched + withinTolerance + mismatched;
  if (joined > 0 && mismatched / joined > threshold.mismatchRate) {
    await ports.escalate(
      "order_confirm_check.mismatch_rate",
      `${mismatched} of ${joined} order lines differ from their confirmation this run, over the ${threshold.mismatchRate} rate in contract ${contract.id}. Told: ${owner}.`,
    );
  }

  // 6. Publish every run, the all-clear included.
  await ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masters },
    matched,
    withinTolerance,
    mismatched,
    orphaned,
    corrected,
  });
}

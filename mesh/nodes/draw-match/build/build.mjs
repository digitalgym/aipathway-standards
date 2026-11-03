/**
 * Draw Match, built to AIP-BS-TWO-RECORDS.
 *
 * The pair: what the managing agent says it paid a small landlord, against
 * what the landlord's own books and bank say landed.
 *
 *   source a  the owner's books: each deposit from the agency as it came in on
 *             the bank feed (Xero or similar), with the bookkeeper's coding of
 *             it into rent, fees and net. read through `readSourceA`.
 *   source b  the agency's owner statement register: each disbursement line
 *             from the agency's trust accounting statement (PropertyMe,
 *             Console Cloud and the like), filed by the owner as received.
 *             read through `readSourceB`.
 *
 * They join on the payment_id the agency's trust ledger issues for each
 * disbursement and puts in the EFT reference, never on the property address,
 * the tenant's name or the amount. The written contract says which source is
 * right about which field: the bank about the net that landed, the agency
 * statement about rent collected and fees charged.
 *
 * Every run, in order:
 *   1. read the contract; no contract or no master, stop and say so
 *   2. honour corrections a named person has accepted, once each, with history
 *   3. read both sources and join on the contract's key
 *   4. a pair that agrees is counted; a field that differs is a Difference with
 *      both values and the master's value, and a proposed correction a person
 *      must accept; a difference inside a declared tolerance is recorded as such
 *   5. a record with no partner is an orphan with a reason and an owner
 *   6. over the threshold amount, the owner hears this run; over the rate, the
 *      run is escalated
 *   7. publish the counts, the all-clear included
 *
 * It never corrects a record on its own and never decides which side is right.
 */

const NODE = "draw-match";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const money = (v) => (isNum(v) ? v.toFixed(2) : String(v));

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  // 1. The contract first, before either source is read.
  const contract = await ports.readContract();
  if (!contract) {
    await ports.escalate("two-records.contract_missing", `${NODE}: no written pair contract, so no run. A person writes the two sources, the key and the master per field first.`);
    return;
  }
  const masters = contract.masterByField ?? {};
  const fields = Object.keys(masters);
  if (!contract.key || fields.length === 0 || !fields.every((f) => masters[f] === "a" || masters[f] === "b")) {
    await ports.escalate("two-records.contract_missing", `${NODE}: contract ${contract.id} names no key or no master for a field. Nothing is guessed.`);
    return;
  }
  const tolerances = contract.toleranceByField ?? {};
  const threshold = contract.threshold ?? { amount: Infinity, mismatchRate: 1 };
  const owner = contract.owner;
  const at = (await ports.now()).toISOString();
  const runId = `${NODE}:${contract.id}:${at}`;

  // 2. Accepted corrections, written once each into the target, keeping history.
  let corrected = 0;
  const acceptances = await ports.readAcceptances();
  for (const acc of acceptances) {
    if (!acc.acceptedBy || !acc.acceptedAt) continue; // no named person, no write
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
      await ports.escalate(
        "two-records.write_not_read_back",
        `${NODE}: accepted correction ${acc.differenceId} on payment ${acc.key} (${acc.field}) returned no id. Not written. Owner: ${owner}.`,
      );
    }
  }

  // 3. Both sources, joined on the contract's key only.
  const a = await ports.readSourceA();
  const b = await ports.readSourceB();
  const byA = new Map(a.map((r) => [r.key, r]));
  const byB = new Map(b.map((r) => [r.key, r]));
  const keys = [...new Set([...byA.keys(), ...byB.keys()])];

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  const overAmount = [];

  for (const key of keys) {
    const ra = byA.get(key);
    const rb = byB.get(key);

    // 5. No partner under the same id: an orphan for the owner, never a guess.
    if (!ra || !rb) {
      const source = ra ? "a" : "b";
      const reason = ra
        ? `a deposit in the owner's books carries payment ${key}, and no agency statement line has that payment id`
        : `the agency statement lists payment ${key}, and no deposit in the owner's books carries that payment id`;
      await ports.raiseOrphan({ runId, key, source, reason, owner });
      orphaned += 1;
      continue;
    }

    // 4. Field by field, only the fields the contract compares.
    let pairOpen = false;
    let pairWithin = false;
    let history = null;
    for (const field of fields) {
      const va = ra.fields[field];
      const vb = rb.fields[field];
      if (va === vb) continue;
      const tol = hasOwn(tolerances, field) && isNum(tolerances[field]) ? tolerances[field] : null;
      const gap = isNum(va) && isNum(vb) ? Math.abs(va - vb) : null;
      const within = tol !== null && gap !== null && gap <= tol + 1e-9;
      const masterValue = masters[field] === "a" ? va : vb;
      const target = masters[field] === "a" ? "b" : "a";

      // Repeat-safe: a difference already open or already decided on these
      // same two values is not raised a second time.
      history ??= await ports.readHistory(key);
      const prior = history.differences.find(
        (d) => d.field === field && d.valueA === va && d.valueB === vb && (d.status === "open" || d.status === "rejected" || d.status === "within_tolerance"),
      );

      if (within) {
        pairWithin = true;
        if (!prior) {
          await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "within_tolerance" });
        }
        continue;
      }

      pairOpen = true;
      if (!prior) {
        const d = await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "open" });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target });
      }
      if (gap !== null && gap > threshold.amount) overAmount.push({ key, field, va, vb, masterValue, gap });
    }
    if (pairOpen) mismatched += 1;
    else if (pairWithin) withinTolerance += 1;
    else matched += 1;
  }

  // 6. Over the amount: the named owner hears it this run, before publishing.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `payment ${o.key}: ${o.field} is ${money(o.va)} in the owner's books and ${money(o.vb)} on the agency statement, a gap of ${money(o.gap)} over the ${money(threshold.amount)} threshold. Master value ${money(o.masterValue)}. Nothing has been changed.`,
    });
  }
  const compared = matched + withinTolerance + mismatched;
  const rate = compared > 0 ? mismatched / compared : 0;
  if (rate > threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${NODE}: ${mismatched} of ${compared} payments disagree this run (${(rate * 100).toFixed(0)}%), over the ${(threshold.mismatchRate * 100).toFixed(0)}% the contract allows. Owner: ${owner}.`,
    );
  }

  // 7. Publish, every run, the all-clear included.
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

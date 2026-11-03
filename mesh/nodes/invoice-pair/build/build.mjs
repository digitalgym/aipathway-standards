/**
 * Invoice Pair: the build.
 *
 * Keeps the invoices in a time-and-billing system (Harvest, source a) and the
 * ledger (Balances, source b) in agreement, to AIP-BS-TWO-RECORDS.
 *
 * The pair contract a person writes says which system is right about what:
 * Harvest is master for the invoice itself (its total and due date), the
 * ledger is master for whether it is paid. Records join on the Harvest invoice
 * id carried into the ledger as its reference, never on a client name or an
 * amount.
 *
 * One run, woken by its schedule (or by payment.received from the ledger):
 *
 *   1. Read the pair contract. No contract, or a compared field with no
 *      master, and the run escalates to a person instead of guessing.
 *   2. Honour acceptances first. Every staged correction a named person has
 *      accepted is written once into its target, carrying that person's name,
 *      so history is kept. Nothing is written that nobody accepted.
 *   3. Read both sources and join them on the contract's key.
 *   4. A matched pair is counted and says nothing. A difference becomes a
 *      Difference object with both values and the master's value; inside a
 *      declared tolerance it is recorded as within_tolerance, otherwise it is
 *      open and a correction to the master's value is staged for a person.
 *      "Mark the Harvest invoice paid" is one of these staged corrections.
 *   5. A record on one side only is an orphan, handed to the contract owner
 *      with a reason. A Harvest invoice missing from the ledger is never
 *      created here: the owner decides whether it is real.
 *   6. A difference over the threshold amount is told to the owner this run;
 *      a run over the mismatch rate is escalated this run.
 *   7. The run publishes its five counts, all-clear included.
 *
 * Every write goes through the ports. The build keeps nothing between runs:
 * what is already open is read back from the record by its key.
 *
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export function build(ports) {
  const now = ports.now();

  // 1. The contract, before either source.
  const contract = ports.readContract();
  if (!contract) {
    ports.escalate("two_records.no_contract", "No written pair contract: nothing is compared until a person writes one.");
    return;
  }
  const masterByField = contract.masterByField ?? {};
  const toleranceByField = contract.toleranceByField ?? {};
  const fields = Object.keys(masterByField);
  if (!contract.key || fields.length === 0) {
    ports.escalate("two_records.no_master", `Contract ${contract.id} names no shared key or no master per field.`);
    return;
  }
  const owner = contract.owner;
  const runId = `${contract.id}:${now.toISOString()}`;

  // 2. Accepted corrections, written once each, with the person on them.
  let corrected = 0;
  for (const acc of ports.readAcceptances()) {
    if (!acc.acceptedBy) continue;
    const writtenId = ports.writeField({
      source: acc.target,
      key: acc.key,
      field: acc.field,
      value: acc.value,
      correction: { differenceId: acc.differenceId, acceptedBy: acc.acceptedBy, acceptedAt: acc.acceptedAt },
    });
    if (writtenId) corrected += 1;
    else ports.escalate("two_records.write_not_read_back", `Correction ${acc.differenceId} on ${acc.key}.${acc.field} returned no id from source ${acc.target}.`);
  }

  // 3. Both sources, joined on the contract's key only.
  const a = ports.readSourceA();
  const b = ports.readSourceB();
  const byKeyA = new Map(a.map((r) => [r.key, r]));
  const byKeyB = new Map(b.map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let joined = 0;
  const overAmount = [];

  // The same field with the same two values was raised before and is still in a person's hands
  // (open, accepted and awaiting its write, or rejected by them): raising it again adds nothing.
  const sameDifference = (d, field, va, vb) => d.field === field && d.valueA === va && d.valueB === vb;

  for (const [key, ra] of byKeyA) {
    const rb = byKeyB.get(key);
    if (!rb) continue;
    joined += 1;
    const history = ports.readHistory(key);
    let open = 0;
    let soft = 0;

    for (const field of fields) {
      const va = ra.fields[field];
      const vb = rb.fields[field];
      if (va === vb) continue;
      const master = masterByField[field];
      const masterValue = master === "a" ? va : master === "b" ? vb : null;
      const declared = Object.prototype.hasOwnProperty.call(toleranceByField, field);
      const gap = typeof va === "number" && typeof vb === "number" ? Math.abs(va - vb) : null;
      const status = declared && gap !== null && gap <= toleranceByField[field] ? "within_tolerance" : "open";
      if (status === "open") open += 1;
      else soft += 1;

      if (history.differences.some((d) => sameDifference(d, field, va, vb))) continue;

      const diff = ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status });
      if (status !== "open") continue;
      if (masterValue === null) {
        ports.escalate("two_records.no_master_for_field", `${key}.${field}: the contract declares no master, so no correction is proposed.`);
        continue;
      }
      // Staged, never written: the master's value proposed for the other source.
      ports.proposeCorrection({ differenceId: diff.id, proposedValue: masterValue, target: master === "a" ? "b" : "a" });
      if (gap !== null && gap > contract.threshold.amount) overAmount.push({ key, field, va, vb, gap });
    }

    if (open > 0) mismatched += 1;
    else if (soft > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. Orphans on either side, each with a reason and an owner.
  const orphan = (key, source, reason) => {
    orphaned += 1;
    const history = ports.readHistory(key);
    if (history.orphans.some((o) => o.source === source)) return; // already with its owner
    ports.raiseOrphan({ runId, key, source, reason, owner });
  };
  for (const key of byKeyA.keys()) {
    if (!byKeyB.has(key)) orphan(key, "a", `In ${contract.sourceA} with no record under ${contract.key} ${key} in ${contract.sourceB}. Not created: the owner decides whether it is real.`);
  }
  for (const key of byKeyB.keys()) {
    if (!byKeyA.has(key)) orphan(key, "b", `In ${contract.sourceB} with no record under ${contract.key} ${key} in ${contract.sourceA}.`);
  }

  // 6. Threshold and rate reach the named person this run, before publishing.
  for (const o of overAmount) {
    ports.notify({
      to: owner,
      reason: "two_records.over_threshold",
      detail: `${o.key}.${o.field}: ${contract.sourceA} ${o.va}, ${contract.sourceB} ${o.vb}, a gap of ${o.gap} over the threshold of ${contract.threshold.amount}.`,
    });
  }
  const rate = joined > 0 ? mismatched / joined : 0;
  if (rate > contract.threshold.mismatchRate) {
    ports.escalate("two_records.mismatch_rate", `${mismatched} of ${joined} joined pairs mismatched (${rate.toFixed(2)}), over the declared rate ${contract.threshold.mismatchRate}. Owner: ${owner}.`);
  }

  // 7. Publish, every run, the all-clear included.
  ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masterByField },
    matched,
    withinTolerance,
    mismatched,
    orphaned,
    corrected,
  });
}

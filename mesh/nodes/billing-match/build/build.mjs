/**
 * Billing Match: the build.
 *
 * Keeps a customer's billing details in the CRM (source a) and the invoice
 * summary in the invoicing ledger (Xero, source b) in agreement, to
 * AIP-BS-TWO-RECORDS.
 *
 * Field ownership is the pair contract a person writes: the CRM owns who to
 * bill and where (billing email, billing address, ABN), the ledger owns what
 * was billed (invoiced total, last invoice date, payment terms). The two join
 * on the CRM account id, which the ledger carries on the contact. Never on a
 * company name, never on an amount.
 *
 * A difference on a field the CRM owns is proposed for the ledger; one the
 * ledger owns is proposed for the CRM. Either way it is only proposed. It is
 * written once, after a named person accepts it, with both original values
 * kept. Nothing is applied on the build's own say-so.
 *
 * One run, woken by its schedule or by exception.closed:
 *
 *   1. Read the contract before either source. No contract, or a compared
 *      field with no owner, and the run stops with an exception for a person.
 *   2. Write the corrections a named person has accepted, once each, with
 *      their name on the write. A write with no id back is an exception.
 *   3. Read both sources, join on the contract's key.
 *   4. Agreement is counted and silent. A difference is a Difference object
 *      with both values and the owner's value: within a declared tolerance it
 *      is within_tolerance, otherwise open with a correction staged.
 *   5. A record on one side only is an orphan, handed to the contract owner
 *      with a reason. Nothing is created on the other side.
 *   6. A gap over the threshold amount reaches the owner this run; a run over
 *      the mismatch rate is escalated this run.
 *   7. Publish the five counts, every run, the all-clear included.
 *
 * Stateless between runs: what is already in a person's hands is read back
 * from the record by its key, so a retried run raises nothing twice.
 *
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export function build(ports) {
  const at = ports.now();

  // 1. The contract first.
  const contract = ports.readContract();
  if (!contract) {
    ports.escalate("billing_match.contract_missing", "No written field-ownership contract. Nothing is compared until a person writes one.");
    return;
  }
  const owners = contract.masterByField ?? {};
  const tolerances = contract.toleranceByField ?? {};
  const fields = Object.keys(owners);
  if (!contract.key || fields.length === 0) {
    ports.escalate("billing_match.owner_missing", `Contract ${contract.id} names no shared key or no owner per field.`);
    return;
  }
  const person = contract.owner;
  const runId = `billing-match:${contract.id}:${at.toISOString()}`;
  const label = (s) => (s === "a" ? contract.sourceA : contract.sourceB);

  // 2. Accepted corrections only.
  let corrected = 0;
  for (const acceptance of ports.readAcceptances()) {
    if (typeof acceptance.acceptedBy !== "string" || acceptance.acceptedBy.trim() === "") continue;
    const writtenId = ports.writeField({
      source: acceptance.target,
      key: acceptance.key,
      field: acceptance.field,
      value: acceptance.value,
      correction: { differenceId: acceptance.differenceId, acceptedBy: acceptance.acceptedBy, acceptedAt: acceptance.acceptedAt },
    });
    if (writtenId) corrected += 1;
    else
      ports.escalate(
        "billing_match.write_not_read_back",
        `Accepted correction ${acceptance.differenceId} on ${acceptance.key}.${acceptance.field} returned no id from ${label(acceptance.target)}. Owner: ${person}.`,
      );
  }

  // 3. Both sources, joined on the key the contract names.
  const crm = new Map(ports.readSourceA().map((r) => [r.key, r]));
  const ledger = new Map(ports.readSourceB().map((r) => [r.key, r]));

  const counts = { matched: 0, withinTolerance: 0, mismatched: 0, orphaned: 0 };
  let joined = 0;
  const overAmount = [];

  for (const [key, a] of crm) {
    const b = ledger.get(key);
    if (!b) continue;
    joined += 1;
    const seen = ports.readHistory(key).differences;
    let hard = 0;
    let soft = 0;

    for (const field of fields) {
      const valueA = a.fields[field];
      const valueB = b.fields[field];
      if (valueA === valueB) continue;

      const ownedBy = owners[field];
      const masterValue = ownedBy === "a" ? valueA : ownedBy === "b" ? valueB : null;
      const gap = typeof valueA === "number" && typeof valueB === "number" ? Math.abs(valueA - valueB) : null;
      const hasTolerance = Object.prototype.hasOwnProperty.call(tolerances, field) && typeof tolerances[field] === "number";
      const status = hasTolerance && gap !== null && gap <= tolerances[field] ? "within_tolerance" : "open";
      if (status === "open") hard += 1;
      else soft += 1;

      // Already raised with these same two values: it is in a person's hands.
      if (seen.some((d) => d.field === field && d.valueA === valueA && d.valueB === valueB)) continue;

      const difference = ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
      if (status !== "open") continue;
      if (masterValue === null) {
        ports.escalate("billing_match.owner_missing", `${key}.${field}: the contract names no owner, so nothing is proposed. Owner: ${person}.`);
        continue;
      }
      ports.proposeCorrection({ differenceId: difference.id, proposedValue: masterValue, target: ownedBy === "a" ? "b" : "a" });
      if (gap !== null && gap > contract.threshold.amount) overAmount.push({ key, field, valueA, valueB, gap });
    }

    if (hard > 0) counts.mismatched += 1;
    else if (soft > 0) counts.withinTolerance += 1;
    else counts.matched += 1;
  }

  // 5. Orphans, each with a reason and the owner.
  const orphan = (key, source, reason) => {
    counts.orphaned += 1;
    if (ports.readHistory(key).orphans.some((o) => o.source === source)) return;
    ports.raiseOrphan({ runId, key, source, reason, owner: person });
  };
  for (const key of crm.keys()) {
    if (!ledger.has(key))
      orphan(key, "a", `Customer ${key} is in ${contract.sourceA} with no ${contract.sourceB} contact carrying that ${contract.key}. Not created: ${person} decides whether it should exist.`);
  }
  for (const key of ledger.keys()) {
    if (!crm.has(key))
      orphan(key, "b", `${contract.sourceB} contact carries ${contract.key} ${key}, which ${contract.sourceA} does not hold. ${person} decides whether it is real.`);
  }

  // 6. Threshold and rate, this run, before publishing.
  for (const o of overAmount) {
    ports.notify({
      to: person,
      reason: "billing_match.over_threshold",
      detail: `${o.key}.${o.field}: ${contract.sourceA} ${o.valueA}, ${contract.sourceB} ${o.valueB}. Gap ${o.gap} is over the threshold of ${contract.threshold.amount}.`,
    });
  }
  const rate = joined > 0 ? counts.mismatched / joined : 0;
  if (rate > contract.threshold.mismatchRate) {
    ports.escalate(
      "billing_match.mismatch_rate",
      `${counts.mismatched} of ${joined} customers differ (${rate.toFixed(2)}), over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${person}.`,
    );
  }

  // 7. Publish, all-clear included.
  ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...owners },
    ...counts,
    corrected,
  });
}

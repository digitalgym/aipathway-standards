/**
 * Claim Match: the build.
 *
 * Keeps each insurance repair job in the job system (source a) and the
 * insurer's claim record (source b, the claim portal or its export) in step,
 * to AIP-BS-TWO-RECORDS.
 *
 * The pair contract is written by a person. It says the two join on the claim
 * number the insurer issued, which the job carries; never on the customer's
 * name, the address or an amount. It also says who is right about what:
 *
 *   - the insurer is right about what it authorised: the authorised scope
 *     amount, the scope version, the excess and the claim status;
 *   - the job is right about what the crew did and filed: photos on file and
 *     the reports lodged (make safe, assessment, completion).
 *
 * A difference on an insurer field is proposed for the job; one on a job
 * field (photos or a report the insurer is missing) is proposed for the
 * insurer side. Either way it is only proposed. It is written once, after a
 * named person accepts it, with both original values kept. Where the portal
 * has no way in, the accepted write is the task the person keys, and the id
 * they record is the written id.
 *
 * One run, woken by its schedule or by exception.closed:
 *
 *   1. Read the contract before either source. No contract, no key, or no
 *      owner per field, and the run stops with an exception for a person.
 *   2. Write the corrections a named person has accepted, once each.
 *   3. Read both sources and join on the claim number.
 *   4. Agreement is counted and silent. A difference is an object with both
 *      values and the owner's value: inside a declared tolerance it is
 *      within_tolerance, otherwise open with a correction proposed.
 *   5. A claim on one side only is an orphan with a reason, handed to the
 *      contract owner. Nothing is created on the other side.
 *   6. A gap over the threshold amount reaches the owner this run; a run over
 *      the mismatch rate is escalated this run.
 *   7. Publish the five counts every run, the all-clear included.
 *
 * Stateless between runs: what is already with a person is read back from the
 * record by claim number, so a repeated run raises nothing twice.
 *
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export function build(ports) {
  const at = ports.now();

  // 1. The contract, before any record.
  const contract = ports.readContract();
  if (!contract) {
    ports.escalate("claim_match.contract_missing", "No written pair contract for jobs and insurer claims. Nothing is compared until a person writes one.");
    return;
  }
  const masters = contract.masterByField ?? {};
  const tolerances = contract.toleranceByField ?? {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract.key || fields.length === 0 || fields.length !== Object.keys(masters).length) {
    ports.escalate("claim_match.master_missing", `Contract ${contract.id} names no claim number key, or a compared field has no master.`);
    return;
  }
  const owner = contract.owner;
  const runId = `claim-match:${contract.id}:${at.toISOString()}`;
  const side = (s) => (s === "a" ? contract.sourceA : contract.sourceB);

  // 2. Only what a named person accepted is written.
  let corrected = 0;
  for (const acc of ports.readAcceptances()) {
    if (typeof acc.acceptedBy !== "string" || acc.acceptedBy.trim() === "") continue;
    const writtenId = ports.writeField({
      source: acc.target,
      key: acc.key,
      field: acc.field,
      value: acc.value,
      correction: { differenceId: acc.differenceId, acceptedBy: acc.acceptedBy, acceptedAt: acc.acceptedAt },
    });
    if (writtenId) corrected += 1;
    else
      ports.escalate(
        "claim_match.write_not_read_back",
        `Accepted correction ${acc.differenceId} on claim ${acc.key} (${acc.field}) returned no id from ${side(acc.target)}. Owner: ${owner}.`,
      );
  }

  // 3. Both sides, joined on the claim number only.
  const jobs = new Map(ports.readSourceA().map((r) => [r.key, r]));
  const claims = new Map(ports.readSourceB().map((r) => [r.key, r]));

  const counts = { matched: 0, withinTolerance: 0, mismatched: 0, orphaned: 0 };
  let joined = 0;
  const overAmount = [];

  for (const [key, job] of jobs) {
    const claim = claims.get(key);
    if (!claim) continue;
    joined += 1;
    const already = ports.readHistory(key).differences;
    let open = 0;
    let soft = 0;

    for (const field of fields) {
      const valueA = job.fields[field];
      const valueB = claim.fields[field];
      if (valueA === valueB) continue;

      const master = masters[field];
      const masterValue = master === "a" ? valueA : valueB;
      const gap = typeof valueA === "number" && typeof valueB === "number" ? Math.abs(valueA - valueB) : null;
      const declared = Object.prototype.hasOwnProperty.call(tolerances, field) && typeof tolerances[field] === "number";
      const status = declared && gap !== null && gap <= tolerances[field] ? "within_tolerance" : "open";
      if (status === "open") open += 1;
      else soft += 1;

      if (already.some((d) => d.field === field && d.valueA === valueA && d.valueB === valueB)) continue;

      const difference = ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
      if (status !== "open") continue;
      if (masterValue === undefined) continue;
      ports.proposeCorrection({ differenceId: difference.id, proposedValue: masterValue, target: master === "a" ? "b" : "a" });
      if (gap !== null && gap > contract.threshold.amount) overAmount.push({ key, field, valueA, valueB, gap });
    }

    if (open > 0) counts.mismatched += 1;
    else if (soft > 0) counts.withinTolerance += 1;
    else counts.matched += 1;
  }

  // 5. Orphans, each with a reason and the owner.
  const orphan = (key, source, reason) => {
    counts.orphaned += 1;
    if (ports.readHistory(key).orphans.some((o) => o.source === source)) return;
    ports.raiseOrphan({ runId, key, source, reason, owner });
  };
  for (const key of jobs.keys()) {
    if (!claims.has(key))
      orphan(key, "a", `A job carries claim number ${key} but ${contract.sourceB} has no claim under it. Not created: ${owner} decides whether the number is wrong or the claim is real.`);
  }
  for (const key of claims.keys()) {
    if (!jobs.has(key))
      orphan(key, "b", `${contract.sourceB} holds claim ${key} but no job carries that claim number. ${owner} decides whether a job is missing or the claim is not ours.`);
  }

  // 6. Threshold and rate, this run, before publishing.
  for (const o of overAmount) {
    ports.notify({
      to: owner,
      reason: "claim_match.over_threshold",
      detail: `Claim ${o.key}, ${o.field}: ${contract.sourceA} ${o.valueA}, ${contract.sourceB} ${o.valueB}. Gap ${o.gap} is over the threshold of ${contract.threshold.amount}.`,
    });
  }
  const rate = joined > 0 ? counts.mismatched / joined : 0;
  if (rate > contract.threshold.mismatchRate) {
    ports.escalate(
      "claim_match.mismatch_rate",
      `${counts.mismatched} of ${joined} claims differ (${rate.toFixed(2)}), over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish every run, the all-clear included.
  ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masters },
    ...counts,
    corrected,
  });
}

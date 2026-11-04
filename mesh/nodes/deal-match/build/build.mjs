/**
 * Deal Match: the build.
 *
 * Every morning, checks each deal in the CRM (source a) against the quote it
 * points at in Simpro (source b), to AIP-BS-TWO-RECORDS, and puts every
 * difference in front of a person to accept.
 *
 * The pair joins on the Simpro quote id, which the CRM deal carries. Never on
 * the customer name, the deal title or the dollar value.
 *
 * Who is right about which field is the pair contract a person writes:
 *   - Simpro owns the quote: its value (cents, ex GST), its stage and the
 *     Simpro customer id the quote is raised against.
 *   - The CRM owns the contact: the contact name and email the sales team keeps.
 *
 * A difference is only ever proposed. It is written once, into the side that
 * does not own the field, after a named person accepts it, with both original
 * values kept on the Difference. The build never fixes either system on its
 * own say-so, never creates a missing deal or quote, and never merges two.
 *
 * One run, woken by its schedule or by exception.closed:
 *   1. Read the contract before either source. No contract, no key or no owner
 *      per field: stop and hand it to a person.
 *   2. Write what a named person has accepted, once each, with their name on
 *      the write. A write with no id back is an exception.
 *   3. Read both sources and join on the contract's key.
 *   4. Agreement is counted and silent. A difference becomes a Difference with
 *      both values and the owner's value: within a declared tolerance it is
 *      within_tolerance, otherwise open with a correction staged.
 *   5. A deal or quote on one side only is an orphan with a reason, handed to
 *      the contract owner.
 *   6. A value gap over the threshold reaches the owner this run; a run over
 *      the mismatch rate is escalated this run.
 *   7. Publish the five counts every run, the all-clear included.
 *
 * Stateless between runs: anything already raised is read back by key from the
 * record, so a retried or repeated run raises nothing twice.
 *
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export function build(ports) {
  const at = ports.now();

  // 1. The contract before any record.
  const contract = ports.readContract();
  if (!contract) {
    ports.escalate("deal_match.contract_missing", "No written CRM and Simpro pair contract. Nothing is compared until a person writes one.");
    return;
  }
  const owners = contract.masterByField ?? {};
  const tolerances = contract.toleranceByField ?? {};
  const fields = Object.keys(owners);
  if (!contract.key || fields.length === 0) {
    ports.escalate("deal_match.owner_missing", `Contract ${contract.id} names no shared quote id or no owner per field.`);
    return;
  }
  const person = contract.owner;
  const runId = `deal-match:${contract.id}:${at.toISOString()}`;
  const name = (s) => (s === "a" ? contract.sourceA : contract.sourceB);

  // 2. Only what a named person accepted is written.
  let corrected = 0;
  for (const ok of ports.readAcceptances()) {
    if (typeof ok.acceptedBy !== "string" || ok.acceptedBy.trim() === "") continue;
    const writtenId = ports.writeField({
      source: ok.target,
      key: ok.key,
      field: ok.field,
      value: ok.value,
      correction: { differenceId: ok.differenceId, acceptedBy: ok.acceptedBy, acceptedAt: ok.acceptedAt },
    });
    if (writtenId) corrected += 1;
    else
      ports.escalate(
        "deal_match.write_not_read_back",
        `Accepted change ${ok.differenceId} to ${ok.key} ${ok.field} came back from ${name(ok.target)} with no id. Owner: ${person}.`,
      );
  }

  // 3. Join on the quote id the contract names.
  const deals = new Map(ports.readSourceA().map((r) => [r.key, r]));
  const quotes = new Map(ports.readSourceB().map((r) => [r.key, r]));

  const counts = { matched: 0, withinTolerance: 0, mismatched: 0, orphaned: 0 };
  let joined = 0;
  const bigGaps = [];

  for (const [key, deal] of deals) {
    const quote = quotes.get(key);
    if (!quote) continue;
    joined += 1;
    const already = ports.readHistory(key).differences;
    let open = 0;
    let soft = 0;

    for (const field of fields) {
      const valueA = deal.fields[field];
      const valueB = quote.fields[field];
      if (valueA === valueB) continue;

      const owner = owners[field];
      const masterValue = owner === "a" ? valueA : owner === "b" ? valueB : null;
      const gap = typeof valueA === "number" && typeof valueB === "number" ? Math.abs(valueA - valueB) : null;
      const declared = Object.prototype.hasOwnProperty.call(tolerances, field) && typeof tolerances[field] === "number";
      const status = declared && gap !== null && gap <= tolerances[field] ? "within_tolerance" : "open";
      if (status === "open") open += 1;
      else soft += 1;

      // Same two values already raised: it is with a person, not raised again.
      if (already.some((d) => d.field === field && d.valueA === valueA && d.valueB === valueB)) continue;

      const difference = ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
      if (status !== "open") continue;
      if (masterValue === null) {
        ports.escalate("deal_match.owner_missing", `Quote ${key} ${field}: the contract names no owner, so nothing is proposed. Owner: ${person}.`);
        continue;
      }
      ports.proposeCorrection({ differenceId: difference.id, proposedValue: masterValue, target: owner === "a" ? "b" : "a" });
      if (gap !== null && gap > contract.threshold.amount) bigGaps.push({ key, field, valueA, valueB, gap });
    }

    if (open > 0) counts.mismatched += 1;
    else if (soft > 0) counts.withinTolerance += 1;
    else counts.matched += 1;
  }

  // 5. One-sided records, each with a reason and the owner.
  const orphan = (key, source, reason) => {
    counts.orphaned += 1;
    if (ports.readHistory(key).orphans.some((o) => o.source === source)) return;
    ports.raiseOrphan({ runId, key, source, reason, owner: person });
  };
  for (const key of deals.keys()) {
    if (!quotes.has(key))
      orphan(key, "a", `${contract.sourceA} deal points at ${contract.key} ${key}, which ${contract.sourceB} does not hold. Nothing created: ${person} decides whether the quote should exist.`);
  }
  for (const key of quotes.keys()) {
    if (!deals.has(key))
      orphan(key, "b", `${contract.sourceB} quote ${key} has no ${contract.sourceA} deal carrying it. ${person} decides whether a deal is missing.`);
  }

  // 6. Threshold and rate, before publishing.
  for (const g of bigGaps) {
    ports.notify({
      to: person,
      reason: "deal_match.over_threshold",
      detail: `Quote ${g.key} ${g.field}: ${contract.sourceA} ${g.valueA}, ${contract.sourceB} ${g.valueB}. Gap ${g.gap} is over the threshold of ${contract.threshold.amount}.`,
    });
  }
  const rate = joined > 0 ? counts.mismatched / joined : 0;
  if (rate > contract.threshold.mismatchRate) {
    ports.escalate(
      "deal_match.mismatch_rate",
      `${counts.mismatched} of ${joined} deals differ from their Simpro quote (${rate.toFixed(2)}), over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${person}.`,
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

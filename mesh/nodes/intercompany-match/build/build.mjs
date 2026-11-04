/**
 * Intercompany Match: the build.
 *
 * The job, in the owner's words: every month end, check what one company in
 * the group says it is owed by another against what that other company says
 * it owes, entry by entry, and list every difference with both values.
 *
 * Source A is the issuing company's Xero file (the invoice it raised to a
 * related company). Source B is the receiving company's Xero file (the bill it
 * entered for the same charge). The shared key is the issuer's Xero InvoiceID,
 * which the group's rule says must be carried on the receiver's bill
 * reference. Nothing is joined on a company name or an amount.
 *
 * It reads both files and the written pair contract. Its only write is a
 * correction a named person accepted, into the one field and the one file the
 * proposal named. It never posts a journal, never approves a bill, never pays.
 *
 * Built to AIP-BS-TWO-RECORDS 2026-10-03,
 * https://aipathway.com.au/explore-ai/two-records-build-standard
 */

const otherSide = (s) => (s === "a" ? "b" : "a");

const sameValue = (x, y) => (typeof x === "number" && typeof y === "number" ? Math.abs(x - y) < 1e-9 : x === y);

const gap = (x, y) => (typeof x === "number" && typeof y === "number" ? Math.abs(x - y) : null);

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  // 1. The contract, before either Xero file. No contract, no run: guessing
  //    the master is the defect, so the owner is told and nothing is read.
  const contract = await ports.readContract();
  if (!contract) {
    await ports.escalate("two_records.no_contract", "No written intercompany pair contract; nothing was read or compared.");
    return;
  }
  const fields = Object.keys(contract.masterByField ?? {});
  if (fields.length === 0) {
    await ports.escalate("two_records.no_master", `Contract ${contract.id} declares no master for any field; nothing was compared.`);
    return;
  }

  const now = await ports.now();
  const runId = `${contract.id}:${now.toISOString()}`;
  const tolerance = contract.toleranceByField ?? {};

  // 2. Accepted corrections first, each written once with history kept, so
  //    this run compares the files as they now stand.
  let corrected = 0;
  const acceptances = await ports.readAcceptances();
  for (const acc of acceptances) {
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
        "two_records.write_not_read_back",
        `Accepted correction ${acc.differenceId} on ${acc.key} (${acc.field}) returned no id from the Xero file; treat it as not written.`,
      );
    }
  }

  // 3. Both files, joined on the contract's key only.
  const a = await ports.readSourceA();
  const b = await ports.readSourceB();
  const byKeyA = new Map(a.map((r) => [r.key, r]));
  const byKeyB = new Map(b.map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let pairs = 0;
  const overThreshold = [];

  for (const recA of a) {
    const recB = byKeyB.get(recA.key);
    if (!recB) {
      orphaned += 1;
      await ports.raiseOrphan({
        runId,
        key: recA.key,
        source: "a",
        reason: `${contract.sourceA} holds intercompany entry ${recA.key}; ${contract.sourceB} has no entry carrying that id.`,
        owner: contract.owner,
      });
      continue;
    }
    pairs += 1;

    let open = 0;
    let soft = 0;
    for (const field of fields) {
      const va = recA.fields[field];
      const vb = recB.fields[field];
      if (sameValue(va, vb)) continue;
      const master = contract.masterByField[field];
      const masterValue = master === "a" ? va : vb;
      const tol = tolerance[field];
      const g = gap(va, vb);
      const inside = typeof tol === "number" && g !== null && g <= tol;

      // A difference already open on this entry and field is not raised twice.
      const history = await ports.readHistory(recA.key);
      const already = history.differences.find(
        (d) => d.field === field && (d.status === "open" || d.status === "accepted") && sameValue(d.valueA, va) && sameValue(d.valueB, vb),
      );

      if (inside) {
        soft += 1;
        if (!already) {
          await ports.raiseDifference({ runId, key: recA.key, field, valueA: va, valueB: vb, masterValue, status: "within_tolerance" });
        }
        continue;
      }

      open += 1;
      if (!already) {
        const diff = await ports.raiseDifference({ runId, key: recA.key, field, valueA: va, valueB: vb, masterValue, status: "open" });
        await ports.proposeCorrection({ differenceId: diff.id, proposedValue: masterValue, target: otherSide(master) });
      }
      if (g !== null && g > contract.threshold.amount) overThreshold.push({ key: recA.key, field, va, vb, g });
    }

    if (open > 0) mismatched += 1;
    else if (soft > 0) withinTolerance += 1;
    else matched += 1;
  }

  for (const recB of b) {
    if (byKeyA.has(recB.key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key: recB.key,
      source: "b",
      reason: `${contract.sourceB} holds intercompany entry ${recB.key}; ${contract.sourceA} has no entry carrying that id.`,
      owner: contract.owner,
    });
  }

  // 4. Over the amount, or over the rate: the owner hears this run, before it publishes.
  for (const o of overThreshold) {
    await ports.notify({
      to: contract.owner,
      reason: "two_records.over_threshold",
      detail: `Intercompany entry ${o.key}: ${o.field} is ${o.va} in ${contract.sourceA} and ${o.vb} in ${contract.sourceB}, a gap of ${o.g.toFixed(2)} over the ${contract.threshold.amount} threshold.`,
    });
  }
  const rate = pairs > 0 ? mismatched / pairs : 0;
  if (rate > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two_records.mismatch_rate",
      `${mismatched} of ${pairs} intercompany entries disagree (${(rate * 100).toFixed(0)}%), over the ${(contract.threshold.mismatchRate * 100).toFixed(0)}% rate in contract ${contract.id}. Owner: ${contract.owner}.`,
    );
  }

  // 5. Publish, all-clear included.
  await ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...contract.masterByField },
    matched,
    withinTolerance,
    mismatched,
    orphaned,
    corrected,
  });
}

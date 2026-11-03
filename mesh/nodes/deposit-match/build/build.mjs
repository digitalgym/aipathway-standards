/**
 * Deposit Match: customer deposits in the bank feed and the sales invoices in
 * Xero, made to agree without a machine deciding which one is right. Built to
 * AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it:
 *   source a (read_job port)    the bank feed: one line per customer deposit
 *                                into the business account, carrying the Xero
 *                                invoice_id the customer paid in its reference
 *                                (the invoice number printed on every invoice
 *                                as the EFT reference)
 *   source b (read_ledger port) Xero: the sales invoices those deposits name,
 *                                plus any invoice Xero shows paid in the
 *                                period, with the amount and date applied
 *
 * The join is on the invoice_id only. Two deposits for the same amount, or two
 * customers with the same name, are never paired by that. A deposit whose
 * reference names no invoice Xero holds is an orphan for the bookkeeper, never
 * a guess at "the open invoice for about that much".
 *
 * Every run, woken by schedule.tick (or exception.closed, which resumes it):
 *   1. Read the pair contract. None, or no master declared: escalate and stop.
 *   2. Honour the corrections a named person accepted since the last run:
 *      write each one once into its target (in practice, apply the deposit as
 *      a payment on the Xero invoice), carrying the person, so both original
 *      values stay in history. No id back means it was not written: tell the
 *      owner.
 *   3. Read both sources and join on the contract's key.
 *   4. A pair that agrees is counted only. A field that differs is a
 *      Difference with both values and the master's value: within_tolerance
 *      when inside the number the contract declares for that field, open
 *      otherwise, with the master's value proposed for the other source. The
 *      comparison changes nothing. An invoice that already has an open
 *      difference waits for its person: nothing new is raised on it.
 *   5. A record with no partner is an orphan with a reason and the owner.
 *   6. A difference over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, the all-clear included.
 *
 * Everything goes through the ports, and every call is awaited.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const LABEL = { a: "bank feed", b: "Xero" };
const flip = (s) => (s === "a" ? "b" : "a");
const has = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);

/** Distance between two values in the field's own unit (dollars, days), or null. */
function gap(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y);
  if (typeof x === "string" && typeof y === "string" && DAY.test(x) && DAY.test(y)) {
    return Math.abs(Date.parse(`${x}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / DAY_MS;
  }
  return null;
}

/** Money compared to the cent so floating point noise is never a mismatch. */
function agree(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.round(x * 100) === Math.round(y * 100);
  return x === y;
}

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `deposit-match:${now.toISOString()}`;

  // 1. Contract before any record.
  const contract = await ports.readContract();
  const masters = contract?.masterByField ?? {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract naming the shared key and a master per field. Deposit Match does not compare deposits with Xero invoices under a guessed contract.",
    );
    return;
  }
  const owner = contract.owner;
  const tolerance = contract.toleranceByField ?? {};

  // 2. Accepted corrections, written once with the person on them.
  let corrected = 0;
  for (const acc of await ports.readAcceptances()) {
    if (typeof acc.acceptedBy !== "string" || acc.acceptedBy.trim() === "") continue;
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
        reason: "two-records.write_not_read_back",
        detail: `Correction ${acc.differenceId} on invoice ${acc.key} (${acc.field}), accepted by ${acc.acceptedBy}, returned no id from ${LABEL[acc.target]}. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key and nothing else.
  const deposits = new Map((await ports.readSourceA()).map((r) => [r.key, r]));
  const invoices = new Map((await ports.readSourceB()).map((r) => [r.key, r]));

  const counts = { matched: 0, withinTolerance: 0, mismatched: 0, orphaned: 0 };
  let pairs = 0;
  const breaches = [];

  for (const [key, dep] of deposits) {
    const inv = invoices.get(key);
    if (!inv) continue;
    pairs += 1;

    let open = 0;
    let within = 0;
    let history = null;

    for (const field of fields) {
      const valueA = dep.fields[field];
      const valueB = inv.fields[field];
      if (agree(valueA, valueB)) continue;

      const master = masters[field];
      const masterValue = master === "a" ? valueA : valueB;
      const distance = gap(valueA, valueB);
      const inside = has(tolerance, field) && typeof tolerance[field] === "number" && distance !== null && distance <= tolerance[field] + 1e-9;
      const status = inside ? "within_tolerance" : "open";

      // An invoice already waiting on its person gets nothing new for the same values.
      history ??= await ports.readHistory(key);
      const seen = history.differences.some(
        (d) => d.field === field && (d.status === status || d.status === "accepted") && agree(d.valueA, valueA) && agree(d.valueB, valueB),
      );

      if (inside) {
        within += 1;
        if (!seen) await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        continue;
      }

      open += 1;
      if (!seen) {
        const d = await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: flip(master) });
      }
      if (typeof valueA === "number" && distance !== null && distance > contract.threshold.amount) {
        breaches.push({ key, field, valueA, valueB, masterValue, distance });
      }
    }

    if (open > 0) counts.mismatched += 1;
    else if (within > 0) counts.withinTolerance += 1;
    else counts.matched += 1;
  }

  // 5. Orphans on both sides, each with a reason and an owner.
  for (const key of deposits.keys()) {
    if (invoices.has(key)) continue;
    counts.orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `A deposit in the bank feed carries ${key} in its reference, but Xero holds no sales invoice under that id. Not matched to any invoice by amount or name.`,
      owner,
    });
  }
  for (const key of invoices.keys()) {
    if (deposits.has(key)) continue;
    counts.orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `Xero shows invoice ${key} paid in the period, but no deposit in the bank feed carries that invoice id.`,
      owner,
    });
  }

  // 6. Threshold and rate reach the named person in this run.
  for (const b of breaches) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Invoice ${b.key}, ${b.field}: bank feed ${b.valueA}, Xero ${b.valueB}, master ${b.masterValue}. Apart by ${b.distance.toFixed(2)}, over the declared ${contract.threshold.amount}.`,
    });
  }
  if (pairs > 0 && counts.mismatched / pairs > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${counts.mismatched} of ${pairs} paired invoices have an open difference, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish every run.
  await ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masters },
    ...counts,
    corrected,
  });
}

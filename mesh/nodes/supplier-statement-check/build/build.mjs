/**
 * Statement Check: each supplier's monthly statement and the bills in the
 * ledger, made to agree without a machine deciding which one is right. Built
 * to AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it:
 *   source a (read_job port)    the supplier's statement for the month: one
 *                                line per invoice the supplier says it issued,
 *                                with the amount and what it says is still owed
 *   source b (read_ledger port) the ledger (Xero, MYOB or QuickBooks): the
 *                                bills entered for that supplier in the same
 *                                period, with the amount and what is still owed
 *
 * The shared key is the supplier's invoice number, qualified by the ledger's
 * supplier contact id ("<contact id>/<invoice number>"). It is printed on the
 * statement line and held on the bill as its reference, so both sources carry
 * it. Never the supplier's name, never an amount.
 *
 * The contract a person wrote says which source is master per field (usually
 * the supplier's statement for what was invoiced, the ledger for what has been
 * paid) and what tolerance, if any, each field carries. This build never
 * guesses either.
 *
 * Every run, woken by schedule.tick or by a statement landing (document.received):
 *   1. Read the pair contract. None, or no master declared: stop and tell a
 *      person. Nothing is read or compared under a guessed contract.
 *   2. Honour acceptances a named person has already given: write each
 *      accepted correction once into its target, with the person on it.
 *   3. Read both sources and join on the contract's key only.
 *   4. A pair that agrees is counted and nothing more. A field that differs
 *      becomes a Difference with both values and the master's value; inside a
 *      declared tolerance it is within_tolerance, otherwise it is open and the
 *      master's value is proposed for the other source. Nothing is changed by
 *      the comparison.
 *   5. A record with no partner is an orphan with a reason and the owner: an
 *      invoice on the statement with no bill in the ledger (a missing bill),
 *      or a bill in the ledger the supplier's statement does not show.
 *   6. A difference over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, including the all-clear.
 *
 * Everything goes through the ports, and every port call is awaited, so the
 * same build runs against the stub and against real adapters.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** How far apart two values are, in the field's own unit, or null if not comparable by distance. */
function distance(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y);
  if (typeof x === "string" && typeof y === "string" && DATE_RE.test(x) && DATE_RE.test(y)) {
    return Math.abs(Date.parse(`${x}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / DAY_MS;
  }
  return null;
}

/** Equal on the value, with money rounded to the cent so float noise is never a mismatch. */
function same(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.round(x * 100) === Math.round(y * 100);
  return x === y;
}

const other = (s) => (s === "a" ? "b" : "a");
const SOURCE_LABEL = { a: "supplier statement", b: "ledger" };

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `statement-check-${now.toISOString()}`;

  // 1. The contract first. A run under no contract does not happen.
  const contract = await ports.readContract();
  const masters = contract?.masterByField ?? {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract with a shared key and a master per field. Statement Check does not compare a supplier statement with the ledger under a guessed contract.",
    );
    return;
  }
  const tolerances = contract.toleranceByField ?? {};
  const owner = contract.owner;

  // 2. Accepted corrections are written once, with the person on them.
  let corrected = 0;
  for (const acc of await ports.readAcceptances()) {
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
        reason: "two-records.write_not_read_back",
        detail: `Accepted correction ${acc.differenceId} on invoice ${acc.key} (${acc.field}) returned no id from the ${SOURCE_LABEL[acc.target]}. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key only.
  const statement = await ports.readSourceA();
  const ledger = await ports.readSourceB();
  const byKeyA = new Map(statement.map((r) => [r.key, r]));
  const byKeyB = new Map(ledger.map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let pairs = 0;
  const overAmount = [];

  for (const [key, a] of byKeyA) {
    const b = byKeyB.get(key);
    if (!b) continue;
    pairs += 1;
    let open = 0;
    let within = 0;
    let history = null;

    for (const field of fields) {
      const valueA = a.fields[field];
      const valueB = b.fields[field];
      if (same(valueA, valueB)) continue;

      const master = masters[field];
      const masterValue = master === "a" ? valueA : valueB;
      const tol = Object.prototype.hasOwnProperty.call(tolerances, field) ? tolerances[field] : undefined;
      const dist = distance(valueA, valueB);
      const inside = typeof tol === "number" && dist !== null && dist <= tol + 1e-9;
      const status = inside ? "within_tolerance" : "open";

      // Safe to repeat: the same difference on the same values is not raised twice.
      history ??= await ports.readHistory(key);
      const already = history.differences.find(
        (d) => d.field === field && d.status === status && same(d.valueA, valueA) && same(d.valueB, valueB),
      );

      if (inside) {
        within += 1;
        if (!already) await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        continue;
      }

      open += 1;
      if (!already) {
        const d = await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: other(master) });
      }
      if (dist !== null && typeof valueA === "number" && dist > contract.threshold.amount) {
        overAmount.push({ key, field, valueA, valueB, masterValue, dist });
      }
    }

    if (open > 0) mismatched += 1;
    else if (within > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. Orphans, each with a reason and the owner. These are the gaps.
  for (const [key] of byKeyA) {
    if (byKeyB.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `The supplier's statement lists invoice ${key}, but no bill under that supplier invoice number is in the ledger. A missing bill, or one entered against another supplier.`,
      owner,
    });
  }
  for (const [key] of byKeyB) {
    if (byKeyA.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `The ledger holds bill ${key} for this supplier in the period, but the supplier's statement does not list it. A duplicate, a bill on the wrong supplier, or one the supplier has credited.`,
      owner,
    });
  }

  // 6. Thresholds reach the named person this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Invoice ${o.key}, ${o.field}: statement ${o.valueA}, ledger ${o.valueB}, master ${o.masterValue}. Apart by ${o.dist.toFixed(2)}, over the declared ${contract.threshold.amount}.`,
    });
  }
  if (pairs > 0 && mismatched / pairs > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${pairs} paired invoices have an open difference, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish, every run, all-clear included.
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

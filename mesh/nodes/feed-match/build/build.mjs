/**
 * Feed Match: the bank feed and the bills in Xero, made to agree without a
 * machine deciding which one is right. Built to AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it:
 *   source a (read_job port)    the bank feed: one statement line per payment
 *                                that left the account, carrying the bill_id it
 *                                paid in its reference (the payment reference
 *                                the business puts on every EFT or BPAY)
 *   source b (read_ledger port) the ledger (Xero): the bills recorded as paid
 *                                in the same period, by bill_id, with the
 *                                amount and date of the payment applied
 *
 * The contract a person wrote says which source is master per field (usually
 * the bank feed for what actually left and when) and what tolerance, if any,
 * each field carries. This build never guesses either.
 *
 * Every run, woken by schedule.tick:
 *   1. Read the pair contract. None, or no master declared: stop and tell a
 *      person. Nothing is read or compared under a guessed contract.
 *   2. Honour acceptances a named person has already given: write each
 *      accepted correction once into its target, with the person on it, so the
 *      write carries both original values in history.
 *   3. Read both sources and join on the contract's key (the bill_id), never on
 *      a supplier name or an amount.
 *   4. A pair that agrees is counted and nothing more. A field that differs
 *      becomes a Difference with both values and the master's value; inside a
 *      declared tolerance it is recorded as within_tolerance, otherwise it is
 *      open and the master's value is proposed for the other source. Nothing is
 *      changed by the comparison.
 *   5. A record with no partner is an orphan with a reason and the contract's
 *      owner.
 *   6. A difference over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, including the all-clear.
 *
 * Everything goes through the ports. Every port call is awaited, so the same
 * build runs against the stub and against real adapters.
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
const SOURCE_LABEL = { a: "bank feed", b: "Xero" };

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `feed-match-${now.toISOString()}`;

  // 1. The contract first. A run under no contract does not happen.
  const contract = await ports.readContract();
  const masters = contract?.masterByField ?? {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract with a shared key and a master per field. Feed Match does not compare the bank feed and Xero under a guessed contract.",
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
        detail: `Accepted correction ${acc.differenceId} on bill ${acc.key} (${acc.field}) returned no id from ${SOURCE_LABEL[acc.target]}. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key only.
  const bank = await ports.readSourceA();
  const ledger = await ports.readSourceB();
  const byKeyA = new Map(bank.map((r) => [r.key, r]));
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

      // Safe to repeat: the same open difference on the same values is not raised twice.
      history ??= await ports.readHistory(key);
      const already = history.differences.find(
        (d) => d.field === field && d.status === status && same(d.valueA, valueA) && same(d.valueB, valueB),
      );

      if (inside) {
        within += 1;
        if (!already) {
          await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        }
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

  // 5. Orphans, each with a reason and the owner.
  for (const [key] of byKeyA) {
    if (byKeyB.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `A bank-feed line carries bill ${key} in its reference, but no paid bill under that id is in Xero for the period.`,
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
      reason: `Xero shows bill ${key} paid in the period, but no bank-feed line carries that bill id.`,
      owner,
    });
  }

  // 6. Thresholds reach the named person this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Bill ${o.key}, ${o.field}: bank feed ${o.valueA}, Xero ${o.valueB}, master ${o.masterValue}. Apart by ${o.dist.toFixed(2)}, over the declared ${contract.threshold.amount}.`,
    });
  }
  if (pairs > 0 && mismatched / pairs > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${pairs} paired bills have an open difference, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
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

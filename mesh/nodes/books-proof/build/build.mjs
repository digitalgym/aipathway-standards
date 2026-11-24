/**
 * Books Proof: each month, rebuild a client's ledger from its source documents
 * and compare every account with the ledger's own trial balance. Publish the
 * all-clear, or each difference with both values for a named person to accept
 * with its cause. Nothing is written to the client's ledger. Built to
 * AIP-BS-TWO-RECORDS.
 *
 * The pair contract, as the ports carry it:
 *   source a (read_job port)    Record A, the master for every account: the
 *                               client's ledger (Xero) trial balance at the
 *                               as-of date, one entry per account, keyed by the
 *                               account id. It is the books of record.
 *   source b (read_ledger port) Record B, kept by this bot: the shadow ledger
 *                               rebuilt from the ledger's source documents
 *                               (invoices, bills, credit notes, payments, bank
 *                               transactions, transfers, manual journals),
 *                               opened from Record A's trial balance at the
 *                               cutover date the person set.
 *   key                         the account id. Never the account name, never
 *                               an amount.
 *   fields                      balance (closing, at the as-of date) and
 *                               movement (the month's net movement), both
 *                               mastered by a, tolerance zero to the cent
 *                               unless a person writes another number.
 *
 * Every run, woken by schedule.tick each month:
 *   1. Read the pair contract. None, no key, or no master declared: escalate
 *      and stop. No account is read under a guessed contract.
 *   2. Honour acceptances a named person has already given. Each one writes
 *      exactly one recorded adjustment into Record B (the shadow ledger) with
 *      the person on it, so later runs stay quiet on that account. A proposal
 *      that would write into Record A is refused and the owner is told: the
 *      client's ledger is never written by this bot.
 *   3. Read both records and join on the account id only.
 *   4. An account that agrees is counted, nothing more. A field that differs
 *      is a Difference with both values and the master's value; inside a
 *      declared tolerance it is within_tolerance, otherwise open, and the
 *      master's value is proposed for Record B.
 *   5. An account on one side only is an Orphan with a reason and the owner,
 *      never a silent zero.
 *   6. A difference over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, every month, all-clear included.
 *
 * Every port call is awaited, so the same build runs on the stub and on real
 * adapters.
 */

const flip = (s) => (s === "a" ? "b" : "a");
const SIDE = { a: "the trial balance (Xero)", b: "the shadow ledger" };
const cents = (n) => Math.round(n * 100);
const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : String(n));

/** Equal to the cent for money; exact for anything else. */
function same(x, y) {
  if (typeof x === "number" && typeof y === "number") return cents(x) === cents(y);
  return x === y;
}

/** The off-by amount in cents, or null when the values are not both money. */
function offByCents(x, y) {
  return typeof x === "number" && typeof y === "number" ? Math.abs(cents(x) - cents(y)) : null;
}

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `books-proof-${now.toISOString()}`;

  // 1. The contract before any account.
  const contract = await ports.readContract();
  const masterByField = contract?.masterByField ?? {};
  const fields = Object.keys(masterByField).filter((f) => masterByField[f] === "a" || masterByField[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "Books Proof has no written pair contract naming the account id as the key and a master per field. It does not compare a ledger under a guessed contract.",
    );
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
  const owner = contract.owner;

  // 2. Accepted adjustments, written once, into the shadow ledger only.
  let corrected = 0;
  for (const acc of await ports.readAcceptances()) {
    if (!acc.acceptedBy) continue;
    if (acc.target !== "b") {
      await ports.notify({
        to: owner,
        reason: "two-records.write_refused_master",
        detail: `Acceptance on ${acc.differenceId} (account ${acc.key}, ${acc.field}) would change ${SIDE[acc.target]}. Books Proof never writes the client's ledger; fix it there yourself if the ledger is wrong.`,
      });
      continue;
    }
    const writtenId = await ports.writeField({
      source: "b",
      key: acc.key,
      field: acc.field,
      value: acc.value,
      correction: { differenceId: acc.differenceId, acceptedBy: acc.acceptedBy, acceptedAt: acc.acceptedAt },
    });
    if (writtenId) corrected += 1;
    else {
      await ports.notify({
        to: owner,
        reason: "two-records.write_not_read_back",
        detail: `The accepted adjustment for ${acc.differenceId} on account ${acc.key} returned no id from the shadow ledger. It was not recorded.`,
      });
    }
  }

  // 3. Both records, joined on the account id.
  const trial = new Map((await ports.readSourceA()).map((r) => [r.key, r]));
  const shadow = new Map((await ports.readSourceB()).map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let paired = 0;
  const overAmount = [];

  // 4. Compare each paired account, field by field.
  for (const [key, a] of trial) {
    const b = shadow.get(key);
    if (!b) continue;
    paired += 1;
    let open = 0;
    let within = 0;
    let history = null;

    for (const field of fields) {
      const valueA = a.fields[field];
      const valueB = b.fields[field];
      if (same(valueA, valueB)) continue;

      const master = masterByField[field];
      const masterValue = master === "a" ? valueA : valueB;
      const declared = Object.prototype.hasOwnProperty.call(tolerance, field) && typeof tolerance[field] === "number";
      const off = offByCents(valueA, valueB);
      const inside = declared && off !== null && off <= cents(tolerance[field]);
      const status = inside ? "within_tolerance" : "open";

      // Repeat-safe: the same difference on the same two values is raised once.
      history ??= await ports.readHistory(key);
      const seen = history.differences.some(
        (d) => d.field === field && same(d.valueA, valueA) && same(d.valueB, valueB) && (d.status === status || d.status === "accepted"),
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
      if (off !== null && off > cents(contract.threshold.amount)) {
        overAmount.push({ key, name: a.name, field, valueA, valueB, off });
      }
    }

    if (open > 0) mismatched += 1;
    else if (within > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. Accounts on one side only.
  for (const [key, a] of trial) {
    if (shadow.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `The trial balance carries account ${key} (${a.name}) but the shadow ledger has no account under that id: no source document the API returned posts to it (a conversion balance or an expense claim usually explains this).`,
      owner,
    });
  }
  for (const [key, b] of shadow) {
    if (trial.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `The shadow ledger posts to account ${key} (${b.name}) but the trial balance has no account under that id at the as-of date.`,
      owner,
    });
  }

  // 6. The owner hears about a large difference this run, before publishing.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Account ${o.key} (${o.name}), ${o.field}: trial balance ${money(o.valueA)}, shadow ledger ${money(o.valueB)}, off by ${money(o.off / 100)}, over the declared ${money(contract.threshold.amount)}.`,
    });
  }
  if (paired > 0 && mismatched / paired > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${paired} accounts differ from the trial balance, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish every month, all-clear included.
  await ports.publishRun({
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

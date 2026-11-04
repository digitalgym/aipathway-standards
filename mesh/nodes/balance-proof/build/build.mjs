/**
 * Balance Proof: each month, every balance sheet account in Xero tied to the
 * document that supports it, and every balance nobody can explain listed for a
 * person. Built to AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it:
 *   source a (read_job port)    the support file for the month: one entry per
 *                                supporting document (bank statement, loan or
 *                                hire purchase statement, ATO integrated client
 *                                account, payroll liabilities report, fixed
 *                                asset register, supplier statement), each
 *                                tagged with the Xero account it supports and
 *                                the closing balance and as-at date it shows
 *   source b (read_ledger port) the ledger (Xero): the balance sheet at month
 *                                end, one entry per account carrying a balance,
 *                                keyed by the account id, with its balance and
 *                                the as-at date of the report
 *
 * The contract a person wrote says which source is master per field (usually
 * the document for the closing balance) and what tolerance, if any, each field
 * carries. This build never guesses either.
 *
 * Every run, woken by schedule.tick at month end:
 *   1. Read the pair contract. None, or no master declared: stop and tell a
 *      person. Nothing is read or compared under a guessed contract.
 *   2. Honour acceptances a named person has already given: write each
 *      accepted correction once into its target (in Xero, a draft adjusting
 *      journal the accountant posts), with the person on it.
 *   3. Read both sources and join on the contract's key (the account id),
 *      never on an account name or an amount.
 *   4. An account whose balance agrees with its document is counted and
 *      nothing more. A field that differs becomes a Difference with both values
 *      and the master's value; inside a declared tolerance it is recorded as
 *      within_tolerance, otherwise it is open and the master's value is
 *      proposed for the other source. Nothing is changed by the comparison.
 *   5. A balance with no document, or a document with no balance, is an orphan
 *      with a reason and the contract's owner: the list of balances nobody can
 *      explain yet.
 *   6. A gap over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, including the all-clear.
 *
 * Everything goes through the ports. Every port call is awaited, so the same
 * build runs against the stub and against real adapters.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** How far apart two values are, in the field's own unit, or null if not comparable by distance. */
function gap(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y);
  if (typeof x === "string" && typeof y === "string" && DATE_RE.test(x) && DATE_RE.test(y)) {
    return Math.abs(Date.parse(`${x}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / DAY_MS;
  }
  return null;
}

/** Equal on the value, money compared in cents so float noise is never a gap. */
function agree(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.round(x * 100) === Math.round(y * 100);
  return x === y;
}

const flip = (s) => (s === "a" ? "b" : "a");
const LABEL = { a: "the supporting document", b: "Xero" };
const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : String(n));

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `balance-proof-${now.toISOString()}`;

  // 1. The contract first. A run under no contract does not happen.
  const contract = await ports.readContract();
  const masterByField = contract?.masterByField ?? {};
  const compared = Object.keys(masterByField).filter((f) => masterByField[f] === "a" || masterByField[f] === "b");
  if (!contract || !contract.key || compared.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract with a shared key and a master per field. Balance Proof does not tie the balance sheet to its documents under a guessed contract.",
    );
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
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
        detail: `Accepted correction ${acc.differenceId} on account ${acc.key} (${acc.field}) returned no id from ${LABEL[acc.target]}. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key only.
  const documents = await ports.readSourceA();
  const ledger = await ports.readSourceB();
  const docs = new Map(documents.map((r) => [r.key, r]));
  const books = new Map(ledger.map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let paired = 0;
  const overAmount = [];

  for (const [key, doc] of docs) {
    const acct = books.get(key);
    if (!acct) continue;
    paired += 1;
    let open = 0;
    let within = 0;
    let history = null;

    for (const field of compared) {
      const valueA = doc.fields[field];
      const valueB = acct.fields[field];
      if (agree(valueA, valueB)) continue;

      const master = masterByField[field];
      const masterValue = master === "a" ? valueA : valueB;
      const tol = Object.prototype.hasOwnProperty.call(tolerance, field) ? tolerance[field] : undefined;
      const apart = gap(valueA, valueB);
      const inside = typeof tol === "number" && apart !== null && apart <= tol + 1e-9;
      const status = inside ? "within_tolerance" : "open";

      // Safe to repeat: the same difference on the same values is not raised twice.
      history ??= await ports.readHistory(key);
      const seen = history.differences.find(
        (d) => d.field === field && d.status === status && agree(d.valueA, valueA) && agree(d.valueB, valueB),
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
      if (apart !== null && typeof valueA === "number" && apart > contract.threshold.amount) {
        overAmount.push({ key, field, valueA, valueB, masterValue, apart });
      }
    }

    if (open > 0) mismatched += 1;
    else if (within > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. The balances nobody can explain, each with a reason and the owner.
  for (const [key] of books) {
    if (docs.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `Xero carries a month-end balance on account ${key}, but no supporting document for that account is in the month's support file. Nobody can explain this balance yet.`,
      owner,
    });
  }
  for (const [key] of docs) {
    if (books.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `A supporting document in the month's file names account ${key}, but no balance sheet account under that id carries a balance in Xero.`,
      owner,
    });
  }

  // 6. Thresholds reach the named person this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Account ${o.key}, ${o.field}: document ${money(o.valueA)}, Xero ${money(o.valueB)}, master ${money(o.masterValue)}. Apart by ${money(o.apart)}, over the declared ${money(contract.threshold.amount)}.`,
    });
  }
  if (paired > 0 && mismatched / paired > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${paired} balance sheet accounts do not tie to their document, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish, every run, all-clear included.
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

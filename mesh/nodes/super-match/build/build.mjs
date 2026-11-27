/**
 * Super Match: each weekday, match every pay run's super guarantee to the
 * super payment that left the bank for it, by the pay run id, and flag any pay
 * run whose super has no matching payment inside the due window the person
 * set, with both figures. It never pays super. Built to AIP-BS-TWO-RECORDS.
 *
 * From 1 July 2026 Australian employers pay super with each payday (Payday
 * Super) rather than quarterly, so every pay run now has a super payment of
 * its own to find.
 *
 * The pair contract, as the ports carry it:
 *   source a (read_job port)    Record A, the master: the pay runs in the
 *                               customer's payroll (Xero, MYOB or QuickBooks,
 *                               read through the AI Pathway hosted MCP), one
 *                               record per pay run whose due date has passed,
 *                               keyed by the pay run id. It holds the super
 *                               guarantee owed for that pay run, and the
 *                               payday as day 0.
 *   source b (read_ledger port) Record B: the super payments that left the
 *                               bank, as the same ledger records them, each
 *                               carrying the pay run id it paid in its
 *                               reference. It holds the amount paid and the
 *                               number of days after payday the money left.
 *   key                         the pay run id. Never an employee name, never
 *                               an amount, never a date.
 *   fields                      super_amount (dollars, master a, no tolerance
 *                               unless a person writes one) and
 *                               days_after_payday (master a, tolerance = the
 *                               due window in days). The due window is a
 *                               setting the person confirms against current
 *                               ATO guidance; the bot never decides it.
 *
 * A pay run still inside its due window is not read yet: it waits for the
 * first run after its due date, so an on-time payment is never raised early.
 *
 * Every run, woken by schedule.tick each weekday:
 *   1. Read the pair contract. None, no key, or no master declared: escalate
 *      and stop. No pay run is read under a guessed contract.
 *   2. Honour acceptances a named person has already given. Only the amount a
 *      person says they already topped up themselves is ever recorded, into
 *      Record B, once, with the person on it. In production that write goes
 *      through the Ledger Write Preview standard: the journal and recomputed
 *      totals are shown, the person releases it, it is written once and read
 *      back. Nothing is ever paid, and the payroll (Record A) is never written.
 *   3. Read both records and join on the pay run id only.
 *   4. A pay run whose payment agrees is counted, nothing more. A field that
 *      differs is a Difference with both values and the master's value:
 *      inside a declared tolerance it is within_tolerance, otherwise open. An
 *      open amount gets the master's value proposed for Record B. An open
 *      timing difference (paid after the due window) is never proposed for
 *      correction, because a payment date cannot be rewritten; it stays open
 *      and the owner is told this run.
 *   5. A pay run past its due date with no payment under its id is an Orphan
 *      with both figures (owed, and nothing paid) and the owner. A payment
 *      naming a pay run id the payroll does not have is an Orphan too.
 *   6. A shortfall over the threshold amount reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, every weekday, all-clear
 *      included.
 *
 * Every port call is awaited, so the same build runs on the stub and on real
 * adapters.
 */

const SIDE = { a: "the payroll pay run", b: "the super payment in the ledger" };
const cents = (n) => Math.round(n * 100);
const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : String(n));

/** Fields whose master value may be proposed back into Record B. */
const CORRECTABLE = new Set(["super_amount"]);

/** Equal to the cent for money; exact for anything else. */
function same(x, y) {
  if (typeof x === "number" && typeof y === "number") return cents(x) === cents(y);
  return x === y;
}

/** The gap in cents, or null when the values are not both numbers. */
function offByCents(x, y) {
  return typeof x === "number" && typeof y === "number" ? Math.abs(cents(x) - cents(y)) : null;
}

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `super-match-${now.toISOString()}`;

  // 1. The contract before any pay run.
  const contract = await ports.readContract();
  const masterByField = contract?.masterByField ?? {};
  const fields = Object.keys(masterByField).filter((f) => masterByField[f] === "a" || masterByField[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "Super Match has no written pair contract naming the pay run id as the key and a master per field. It does not match super under a guessed contract.",
    );
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
  const owner = contract.owner;

  // 2. Accepted top-ups, recorded once, into the ledger's super payment only.
  let corrected = 0;
  for (const acc of await ports.readAcceptances()) {
    if (!acc.acceptedBy) continue;
    if (acc.target !== "b" || !CORRECTABLE.has(acc.field)) {
      await ports.notify({
        to: owner,
        reason: "two-records.write_refused",
        detail: `Acceptance on ${acc.differenceId} (pay run ${acc.key}, ${acc.field}) would change ${SIDE[acc.target] ?? acc.target}. Super Match only records an amount you already paid; it never writes the payroll or a payment date.`,
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
        detail: `The accepted top-up for ${acc.differenceId} on pay run ${acc.key} returned no id from the ledger. It was not recorded.`,
      });
    }
  }

  // 3. Both records, joined on the pay run id.
  const payRuns = new Map((await ports.readSourceA()).map((r) => [r.key, r]));
  const payments = new Map((await ports.readSourceB()).map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let paired = 0;
  const overAmount = [];
  const late = [];

  // 4. Compare each pay run with its payment, field by field.
  for (const [key, a] of payRuns) {
    const b = payments.get(key);
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
        (d) => d.field === field && same(d.valueA, valueA) && same(d.valueB, valueB) && (d.status === status || d.status === "accepted" || d.status === "rejected"),
      );

      if (inside) {
        within += 1;
        if (!seen) await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        continue;
      }
      open += 1;
      if (!seen) {
        const d = await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        if (CORRECTABLE.has(field) && master === "a") {
          await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: "b" });
        }
        if (field === "days_after_payday") late.push({ key, name: a.name, days: valueB, window: tolerance[field], owed: a.fields.super_amount, paid: b.fields.super_amount });
      }
      if (field === "super_amount" && off !== null && off > cents(contract.threshold.amount)) {
        overAmount.push({ key, name: a.name, valueA, valueB, off });
      }
    }

    if (open > 0) mismatched += 1;
    else if (within > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. Pay runs with no payment, and payments with no pay run.
  for (const [key, a] of payRuns) {
    if (payments.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `Pay run ${key} (${a.name}) owes ${money(a.fields.super_amount)} super and no payment carrying this pay run id has left the bank: paid $0.00, and its due window has passed.`,
      owner,
    });
  }
  for (const [key, b] of payments) {
    if (payRuns.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `A super payment of ${money(b.fields.super_amount)} (${b.name}) names pay run ${key}, which the payroll does not have among pay runs past their due date.`,
      owner,
    });
  }

  // 6. The owner hears this run: late payments, then large shortfalls.
  for (const l of late) {
    await ports.notify({
      to: owner,
      reason: "two-records.super_paid_late",
      detail: `Pay run ${l.key} (${l.name}): super owed ${money(l.owed)}, paid ${money(l.paid)}, ${l.days} days after payday, outside the ${l.window}-day due window you set.`,
    });
  }
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `Pay run ${o.key} (${o.name}): super owed ${money(o.valueA)}, paid ${money(o.valueB)}, off by ${money(o.off / 100)}, over the declared ${money(contract.threshold.amount)}.`,
    });
  }
  if (paired > 0 && mismatched / paired > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${paired} pay runs differ from their super payment, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish every weekday, all-clear included.
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

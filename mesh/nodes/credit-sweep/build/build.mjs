/**
 * Credit Sweep: money a customer already has sitting with the business,
 * against what the chase list still says they owe. Built to
 * AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it (one ledger: Xero, MYOB Business or
 * QuickBooks Online, read through the AI Pathway hosted MCP):
 *   source a (read_job port)    the chase list: per customer contact, the
 *                                amount due on their open sales invoices, and
 *                                those invoices (number=amount due) as an
 *                                informational field that is never compared
 *   source b (read_ledger port) the customer's account once money already
 *                                held is counted: the same open invoices less
 *                                unapplied credit notes, overpayments,
 *                                prepayments and receipts sitting against no
 *                                invoice; and those credits (id=amount@date,
 *                                with >invoice when the credit's reference
 *                                names one), never compared
 *
 * The join is on the ledger's customer contact id only. Two customers with the
 * same name are never one customer, and a credit is never moved to another
 * customer because the amount fits. Inside one joined customer, the build
 * points at the open invoice the money most likely belongs to: the invoice
 * the credit's reference names first, then one for the same amount. That is a
 * pointer for the person, not a join.
 *
 * The contract makes the account (source b) master for amount_due: money the
 * customer already paid us is the truth. A customer whose chase list says
 * more than their account is a Difference with both values; the proposal is
 * an allocation that brings the chase list down to the account. A customer
 * holding money with no open invoice is an orphan for a person with a refund
 * note. Nothing is allocated or refunded until a named person accepts it.
 *
 * Every Monday, woken by schedule.tick (or exception.closed, which resumes it):
 *   1. Read the pair contract. None, or no master declared: escalate, stop.
 *   2. Write each allocation a named person accepted since the last run, once,
 *      with the person on it. No id back means it was not written: tell the
 *      owner.
 *   3. Read both sources and join on the contract's key.
 *   4. Agreement is counted. A difference carries both values and the
 *      master's value, within_tolerance only inside a number the contract
 *      wrote for that field. Each new open difference gets a drafted
 *      allocation in front of the owner: the credit, its age, the likely
 *      invoice. A customer already waiting on a person gets nothing new.
 *   5. A record with no partner is an orphan with a reason and the owner.
 *   6. A difference over the threshold amount reaches the owner this run;
 *      open mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, the all-clear included.
 *
 * Everything goes through the ports, and every call is awaited.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const LABEL = { a: "the chase list", b: "the customer's account" };
const flip = (s) => (s === "a" ? "b" : "a");
const has = (o, k) => Object.prototype.hasOwnProperty.call(o ?? {}, k);
const cents = (n) => Math.round(n * 100);
const money = (n) => `$${(cents(n) / 100).toFixed(2)}`;

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
  if (typeof x === "number" && typeof y === "number") return cents(x) === cents(y);
  return x === y;
}

/** "INV-0612=1100.00;INV-0640=220.00" into [{ number, due }]. */
function openInvoices(rec) {
  const raw = rec?.fields?.open_invoices;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw
    .split(";")
    .map((s) => /^\s*([^=]+)=(-?[\d.]+)\s*$/.exec(s))
    .filter(Boolean)
    .map((m) => ({ number: m[1].trim(), due: Number(m[2]) }));
}

/** "CN-0042=1100.00@2026-03-14>INV-0612;OP-0007=220.00@2026-05-02" into [{ id, amount, since, ref }]. */
function heldCredits(rec) {
  const raw = rec?.fields?.credits;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw
    .split(";")
    .map((s) => /^\s*([^=]+)=([\d.]+)@(\d{4}-\d{2}-\d{2})(?:>(\S+))?\s*$/.exec(s))
    .filter(Boolean)
    .map((m) => ({ id: m[1].trim(), amount: Number(m[2]), since: m[3], ref: m[4] ?? null }));
}

function ageDays(since, now) {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(`${since}T00:00:00Z`)) / DAY_MS));
}

/** The open invoice a credit most likely belongs to, inside one customer: the reference first, then the same amount. */
function likelyInvoice(credit, invoices) {
  if (credit.ref) {
    const named = invoices.find((i) => i.number === credit.ref);
    if (named) return { invoice: named, why: "its reference names it" };
  }
  const same = invoices.filter((i) => cents(i.due) === cents(credit.amount));
  if (same.length === 1) return { invoice: same[0], why: "same amount" };
  return null;
}

function describeCredits(credits, invoices, now) {
  if (credits.length === 0) return "No individual credit was listed by the ledger.";
  return credits
    .map((c) => {
      const hit = likelyInvoice(c, invoices);
      const where = hit
        ? `most likely ${hit.invoice.number} (${money(hit.invoice.due)} due; ${hit.why})`
        : "no open invoice matches by reference or amount; the person picks";
      return `${c.id} ${money(c.amount)} held ${ageDays(c.since, now)} days (since ${c.since}), ${where}`;
    })
    .join("; ");
}

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `credit-sweep:${now.toISOString()}`;

  // 1. Contract before any record.
  const contract = await ports.readContract();
  const masters = contract?.masterByField ?? {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract naming the customer id it joins on and which record is master for the amount due. Credit Sweep does not set customer credits against invoices under a guessed contract.",
    );
    return;
  }
  const owner = contract.owner;
  const tolerance = contract.toleranceByField ?? {};

  // 2. Allocations a named person accepted, written once with the person on them.
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
        detail: `Allocation ${acc.differenceId} for customer ${acc.key}, released by ${acc.acceptedBy}, returned no id from the ledger. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key and nothing else.
  const chase = new Map((await ports.readSourceA()).map((r) => [r.key, r]));
  const account = new Map((await ports.readSourceB()).map((r) => [r.key, r]));

  const counts = { matched: 0, withinTolerance: 0, mismatched: 0, orphaned: 0 };
  let pairs = 0;
  const breaches = [];

  for (const [key, a] of chase) {
    const b = account.get(key);
    if (!b) continue;
    pairs += 1;

    let open = 0;
    let within = 0;
    let history = null;

    for (const field of fields) {
      const valueA = a.fields[field];
      const valueB = b.fields[field];
      if (agree(valueA, valueB)) continue;

      const master = masters[field];
      const masterValue = master === "a" ? valueA : valueB;
      const distance = gap(valueA, valueB);
      const inside = has(tolerance, field) && typeof tolerance[field] === "number" && distance !== null && distance <= tolerance[field] + 1e-9;
      const status = inside ? "within_tolerance" : "open";

      // A customer already waiting on a person gets nothing new for the same values.
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
        await ports.notify({
          to: owner,
          reason: "two-records.difference_open",
          detail:
            `${a.name} (${key}): ${LABEL.a} shows ${typeof valueA === "number" ? money(valueA) : valueA} due, ` +
            `${LABEL.b} shows ${typeof valueB === "number" ? money(valueB) : valueB} once money already held is counted. ` +
            `${describeCredits(heldCredits(b), openInvoices(a), now)}. ` +
            `Drafted allocation waits for your release; nothing is allocated or refunded until you accept it.`,
        });
      }
      if (typeof valueA === "number" && distance !== null && distance > contract.threshold.amount) {
        breaches.push({ key, name: a.name, field, valueA, valueB, masterValue, distance });
      }
    }

    if (open > 0) counts.mismatched += 1;
    else if (within > 0) counts.withinTolerance += 1;
    else counts.matched += 1;
  }

  // 5. Orphans on both sides, each with a reason and an owner.
  for (const [key, a] of chase) {
    if (account.has(key)) continue;
    counts.orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `${a.name} (${key}) has open invoices on the chase list, but the ledger returned no account position under that customer id (merged or archived contact?). Not matched to any other customer by name.`,
      owner,
    });
  }
  for (const [key, b] of account) {
    if (chase.has(key)) continue;
    counts.orphaned += 1;
    const credits = heldCredits(b);
    const held = credits.reduce((s, c) => s + c.amount, 0);
    const list = credits.map((c) => `${c.id} ${money(c.amount)} held ${ageDays(c.since, now)} days`).join("; ");
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason:
        `${b.name} (${key}) has ${money(held)} sitting with the business${list ? ` (${list})` : ""} and no open invoice to apply it to. ` +
        `Refund note drafted for a person to decide: refund, hold for the next invoice, or ask the accountant. Nothing is refunded by this bot.`,
      owner,
    });
  }

  // 6. Threshold and rate reach the named person in this run.
  for (const x of breaches) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `${x.name} (${x.key}), ${x.field}: chase list ${money(x.valueA)}, account ${money(x.valueB)}, master ${money(x.masterValue)}. ${money(x.distance)} held against open invoices, over the declared ${money(contract.threshold.amount)}.`,
    });
  }
  if (pairs > 0 && counts.mismatched / pairs > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${counts.mismatched} of ${pairs} customers have money held against open invoices, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
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

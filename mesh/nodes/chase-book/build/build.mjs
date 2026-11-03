/**
 * Chase Book: the debtor-chasing job, built to AIP-BS-DEBTOR-CHASING 2026-10-06.
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
 *
 * A port of "Send tiered overdue invoice reminders with Xero, Gmail, Slack, and
 * Google Sheets" by Intuz (n8n.io/workflows/20015), reimplemented from the
 * standard and the listing's one-line description only. Nothing here is taken
 * from the original's prompt, instructions or workflow file. The original's
 * age tiers are replaced by the standard's four buckets, ranked by amount at
 * risk, one reminder per customer, and each reminder is logged on the invoice
 * in the ledger rather than in a separate sheet or chat channel.
 *
 * What one run does each time it is woken (schedule.tick once a day, or
 * invoice.overdue / exception.closed for one invoice_id, or a debtor's reply
 * carrying a date):
 *
 *   1. Record any promise the debtor gave since the last run, as an object with
 *      a date. No date is not a promise: it is handed to a person.
 *   2. Read the live ledger, the customers and the promises, fresh. Nothing is cached.
 *   3. Keep only invoices past their DUE date and unpaid.
 *   4. Collapse to one row per customer, summing what they owe.
 *   5. Bucket each customer: broken promise, hard (45+), drifting (15-44), just late (1-14).
 *   6. Leave out anyone whose promised date has not come yet.
 *   7. Lift out disputes, open exceptions and relationship-sized balances, each
 *      with a reason, and hand disputes and relationship accounts to a named person.
 *   8. Rank: broken promise first, then amount at risk, then age to break ties.
 *   9. For each row in ranked order, ask the gate at send time. Held means no
 *      reminder, whatever the rank. Only a named approver can lift a
 *      promise-pending hold; hours, holidays and a paid ledger are never lifted.
 *  10. Allowed: send the bucket's reminder, which says up front it is automated,
 *      names every invoice and its days past due, and asks one question that
 *      takes a date.
 *
 * Every effect goes through the ports. Live telephony is not built here: the
 * standard puts the dial on the hosted provider, and `disclose` stands in for
 * the moment a reminder goes out.
 */

const DAY = 86_400_000;

/** Above this a balance is a relationship decision, not a collections row. Cents. */
export const RELATIONSHIP_THRESHOLD_CENTS = 2_500_000; // A$25,000

/** The person the business named for credit decisions, disputes and relationship accounts. */
export const DEFAULT_OWNER = "the credit controller named in settings";

/** Mobile coverage, measured on the business's own book before go-live. Not scored by software. */
export const COVERAGE = { share: null, measured_at: null, how: "attach the measured share of overdue rows with a mobile, and the date" };


/** Holds a named approver may lift. Hours, holidays and a paid ledger are never on it. */
const LIFTABLE = new Set(["promise_pending"]);

const OFFSETS = { "Australia/Brisbane": 10, "Australia/Sydney": 10, "Australia/Melbourne": 10, "Australia/Hobart": 10, "Australia/Perth": 8, "Australia/Adelaide": 9.5, "Australia/Darwin": 9.5 };

/** The customer's own calendar date, so "past due" and "promise date" are read where they live. */
function localDate(now, customer) {
  const offset = OFFSETS[customer?.timezone] ?? 10;
  return new Date(now.getTime() + offset * 3600_000).toISOString().slice(0, 10);
}

const dollars = (cents) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Days past the due date, whole days, off the due date and never the issue date. */
export function daysPastDue(invoice, today) {
  return Math.floor((Date.parse(today) - Date.parse(invoice.dueAt.slice(0, 10))) / DAY);
}

export function bucketFor(maxDays, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (maxDays >= 45) return "hard";
  if (maxDays >= 15) return "drifting";
  return "just_late";
}

/** The reminder for one customer. Facts, not adjectives; one question that takes a date. */
export function reminderText(row, customer, invoices, today) {
  const lines = invoices.map((i) => `${i.id}: ${dollars(i.amount)}, ${daysPastDue(i, today)} days past its due date`).join("; ");
  const opener = "This is an automated accounts reminder, not a person.";
  const body = {
    just_late: `Our ledger shows ${lines}. It may simply be sitting in an inbox.`,
    drifting: `Our ledger shows ${lines}, ${dollars(row.amount)} in all.`,
    hard: `Our ledger shows ${lines}, ${dollars(row.amount)} in all. If something is holding it up, such as a missing purchase order or a problem with the work, reply and a person will pick it up.`,
    broken_promise: `We had a payment date from you that has now passed. Our ledger shows ${lines}, ${dollars(row.amount)} in all.`,
  }[row.bucket];
  return `${opener} Hi ${customer?.name ?? ""}, ${body} When can we expect payment? If you have paid since, please ignore this.`.replace(/\s+/g, " ");
}

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{
 *   outcomes?: Array<{ customerId: string, date?: string | null, amount?: number | null, method?: string }>,
 *   overrides?: Array<{ customerId: string, reason: string, approver?: string }>,
 *   openExceptions?: string[],
 *   relationshipThresholdCents?: number,
 *   owner?: string,
 * }} [opts]
 */
export async function build(ports, opts = {}) {
  const owner = opts.owner ?? DEFAULT_OWNER;
  const threshold = opts.relationshipThresholdCents ?? RELATIONSHIP_THRESHOLD_CENTS;
  const openExceptions = new Set(opts.openExceptions ?? []);

  // 1. A reply that carried a date becomes a promise object. No date is a deflection.
  for (const o of opts.outcomes ?? []) {
    if (!o.date) {
      await ports.escalate("debtor.no_date_given", `customer ${o.customerId}: reply gave no date; next touch needs a person; exception_owner: ${owner}`);
      continue;
    }
    const p = await ports.recordPromise({ customerId: o.customerId, date: o.date, amount: o.amount ?? null });
    if (!p) await ports.escalate("debtor.promise_write_failed", `customer ${o.customerId}: no promise read back; exception_owner: ${owner}`);
  }

  // 2. The live book, read now.
  let ledger, customers, promises;
  try {
    ledger = await ports.readLedger();
    customers = await ports.readCustomers();
    promises = await ports.readPromises();
  } catch (err) {
    await ports.escalate("debtor.ledger_read_failed", `${err instanceof Error ? err.message : String(err)}; exception_owner: ${owner}`);
    return;
  }
  const now = await ports.now();
  const byId = new Map(customers.map((c) => [c.id, c]));

  // 3 + 4. Unpaid and past the due date, grouped by customer.
  const groups = new Map();
  for (const inv of ledger) {
    if (inv.paidAt) continue;
    const today = localDate(now, byId.get(inv.customerId));
    if (daysPastDue(inv, today) < 1) continue;
    if (!groups.has(inv.customerId)) groups.set(inv.customerId, []);
    groups.get(inv.customerId).push(inv);
  }

  const dialable = [];
  const excluded = [];
  for (const [customerId, invoices] of groups) {
    const customer = byId.get(customerId);
    const today = localDate(now, customer);
    const latest = promises.filter((p) => p.customerId === customerId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    const override = (opts.overrides ?? []).find((o) => o.customerId === customerId);

    // 6. A promise not yet due keeps the customer out of the run, unless a person asked otherwise.
    const pending = latest && latest.date > today;
    if (pending && !override) continue;

    const maxDays = Math.max(...invoices.map((i) => daysPastDue(i, today)));
    const row = {
      customerId,
      amount: invoices.reduce((s, i) => s + i.amount, 0),
      bucket: bucketFor(maxDays, Boolean(latest && latest.date < today)),
      invoiceIds: invoices.map((i) => i.id),
    };
    const age = maxDays;

    // 7. Lifted out with a reason. Disputes and relationship accounts go to a named person.
    if (openExceptions.has(customerId)) {
      excluded.push({ ...row, excludedReason: "exception_open" });
    } else if (invoices.some((i) => i.disputed)) {
      excluded.push({ ...row, excludedReason: "dispute_open" });
      await ports.escalate("debtor.dispute_open", `customer ${customerId}: ${row.invoiceIds.join(", ")}; exception_owner: ${owner}`);
    } else if (customer?.relationship || row.amount > threshold) {
      excluded.push({ ...row, excludedReason: "relationship_sized_balance" });
      await ports.escalate(
        "debtor.relationship_account",
        `customer ${customerId}: ${dollars(row.amount)} is over the ${dollars(threshold)} threshold; exception_owner: ${owner}`,
      );
    } else {
      dialable.push({ row, age, invoices, customer, today });
    }
  }

  // 8. Broken promise first, then amount at risk, then age only to break a tie.
  const broken = (d) => (d.row.bucket === "broken_promise" ? 0 : 1);
  dialable.sort((a, b) => broken(a) - broken(b) || b.row.amount - a.row.amount || b.age - a.age);
  await ports.rank([...dialable.map((d) => d.row), ...excluded]);

  // 9 + 10. The gate, underneath the ranking, at send time, for every row.
  for (const d of dialable) {
    let decision = await ports.gate(d.row.customerId);
    if (!decision.allowed) {
      const o = (opts.overrides ?? []).find((x) => x.customerId === d.row.customerId);
      if (!o) continue;
      if (!LIFTABLE.has(decision.reason)) {
        await ports.escalate("debtor.override_not_liftable", `customer ${d.row.customerId}: ${decision.reason} is never lifted; exception_owner: ${owner}`);
        continue;
      }
      const accepted = await ports.override({ customerId: o.customerId, reason: o.reason, ...(o.approver ? { approver: o.approver } : {}) });
      if (!accepted) {
        await ports.escalate("debtor.override_refused", `customer ${d.row.customerId}: no named approver; exception_owner: ${owner}`);
        continue;
      }
      // An approved override lifts the promise hold only. Re-ask so hours, holidays and the ledger still apply.
      decision = await ports.gate(d.row.customerId);
      if (!decision.allowed && decision.reason !== "promise_pending") continue;
    }
    await ports.disclose(d.row.customerId, reminderText(d.row, d.customer, d.invoices, d.today));
  }
}

/**
 * Chase Desk: the debtor chasing job, built to AIP-BS-DEBTOR-CHASING 2026-10-06.
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard (CC BY 4.0)
 *
 * A port of "Accounts Receivable" by Thomas Matteson, reimplemented from the
 * standard. Only the chasing part of that bot's job is ported: ageing the book, ranking it, gating
 * every dial, recording promises as dated objects and handing disputes to a
 * person. Remittance intake and billing are other standards. Nothing here is
 * taken from the original bot's prompt or instructions.
 *
 * What one run does, each time it is woken (schedule.tick, invoice.overdue,
 * payment.received or exception.closed). It keeps nothing between runs:
 *
 *   1. Read the live ledger, the customers and the promises already on record.
 *   2. Record any call outcome handed back by the hosted call as a promise
 *      object (date required, amount may be empty), read it back, and keep any
 *      logged dispute open with a named person.
 *   3. Drop every invoice not past its due date. Disputed invoices go to a person.
 *   4. Bucket each invoice: just late, drifting, hard, broken promise.
 *   5. One row per customer, summed. Broken promise first, then amount at risk,
 *      then age to break ties. Never by age alone.
 *   6. Lift relationship-sized balances out of the run, to a named person.
 *   7. Leave out anyone with a promised date still ahead. The promise is the
 *      follow-up date.
 *   8. Gate every dialable row at dial time, underneath the ranking: hours in
 *      the debtor's zone, state holidays, a ledger-driven stop on payment, and
 *      a pending promise. No score lifts a row past it. Only a named person's
 *      override lifts a pending promise, and nothing lifts the legal holds.
 *   9. Dial: the disclosure and the opener. In production this is the hosted
 *      call (Office Voice / Recover). This build does not do live telephony.
 *
 * Every effect goes through the ports.
 */

const DAY = 86_400_000;

export const DEFAULT_CONFIG = {
  /** Above this many cents owed, chasing is a relationship decision, not a call. */
  relationshipThresholdCents: 5_000_000,
  /** Who each kind of exception goes to. The person, not a queue. */
  owners: {
    dispute: "Accounts receivable lead",
    relationship: "Account manager",
    credit: "Accounts receivable lead",
  },
  business: "the accounts team",
};

/** Bucket edges off the due date, in whole days past due. */
export function bucketFor(daysPastDue, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (daysPastDue <= 14) return "just_late";
  if (daysPastDue <= 44) return "drifting";
  return "hard";
}

const ZONE_OFFSET_H = { "Australia/Brisbane": 10, "Australia/Sydney": 10, "Australia/Melbourne": 10, "Australia/Perth": 8, "Australia/Adelaide": 9.5 };

/** The debtor's local calendar date, YYYY-MM-DD. */
function localDate(now, customer) {
  const zone = customer?.timezone ?? "Australia/Brisbane";
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    const off = ZONE_OFFSET_H[zone] ?? 10;
    return new Date(now.getTime() + off * 3600_000).toISOString().slice(0, 10);
  }
}

const daysPastDue = (inv, now) => Math.floor((now.getTime() - new Date(inv.dueAt).getTime()) / DAY);

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const addDays = (ymd, n) => new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + n * DAY).toISOString().slice(0, 10);

/**
 * The date a debtor gave, read from what they said, in their own calendar.
 * No date found means no promise: that is a deflection, not a commitment.
 */
export function promisedDate(said, today) {
  const text = String(said ?? "").toLowerCase();
  const iso = /\b(20\d\d-\d\d-\d\d)\b/.exec(text);
  if (iso) return iso[1];
  if (/\btomorrow\b/.test(text)) return addDays(today, 1);
  const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  for (const [i, name] of WEEKDAYS.entries()) {
    if (new RegExp(`\\b${name}\\b`).test(text)) {
      const ahead = (i - dow + 7) % 7 || 7;
      return addDays(today, ahead);
    }
  }
  return null;
}

/** A figure only if one was said. Never invented. Cents. */
export function promisedAmount(said) {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(String(said ?? ""));
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
}

const DISPUTE_RE = /\b(dispute|disputing|not happy|wrong amount|never ordered|no purchase order|no po\b|incorrect)/i;
const HARDSHIP_RE = /\b(hardship|can'?t afford|cannot afford|struggling|payment plan|lost (the|our) contract|administration|liquidat)/i;

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{ outcomes?: Array<{customerId: string, said: string}>,
 *           overrides?: Array<{customerId: string, reason: string, approver?: string}>,
 *           config?: Partial<typeof DEFAULT_CONFIG> }} [input]
 */
export async function build(ports, input = {}) {
  const config = { ...DEFAULT_CONFIG, ...(input.config ?? {}), owners: { ...DEFAULT_CONFIG.owners, ...(input.config?.owners ?? {}) } };
  const now = await ports.now();

  // 1. Read everything fresh. Nothing carried from a previous run.
  let ledger = (await ports.readLedger()) ?? [];
  const customers = new Map(((await ports.readCustomers()) ?? []).map((c) => [c.id, c]));
  let promises = (await ports.readPromises()) ?? [];

  // 2. Outcomes from the call, recorded as promise objects.
  for (const outcome of input.outcomes ?? []) {
    await recordOutcome(ports, outcome, { now, customers, config });
  }
  if ((input.outcomes ?? []).length > 0) {
    ledger = (await ports.readLedger()) ?? [];
    promises = (await ports.readPromises()) ?? [];
  }

  // 3. Overdue off the due date, unpaid. Disputes go to a person, not a call.
  const overdue = ledger.filter((i) => !i.paidAt && daysPastDue(i, now) >= 1);
  const disputed = overdue.filter((i) => i.disputed);
  for (const inv of disputed) {
    await ports.escalate("dispute_open", `invoice ${inv.id} for customer ${inv.customerId} carries a dispute; not chased; owner: ${config.owners.dispute}`);
  }
  const chaseable = overdue.filter((i) => !i.disputed);

  // 4 and 5. One row per customer.
  const latestPromise = (customerId) =>
    promises.filter((p) => p.customerId === customerId).sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
  const byCustomer = new Map();
  for (const inv of chaseable) {
    const row = byCustomer.get(inv.customerId) ?? { customerId: inv.customerId, amount: 0, invoiceIds: [], oldest: 0 };
    row.amount += inv.amount;
    row.invoiceIds.push(inv.id);
    row.oldest = Math.max(row.oldest, daysPastDue(inv, now));
    byCustomer.set(inv.customerId, row);
  }

  const entries = [];
  const pendingPromise = new Set();
  const overrideFor = new Map((input.overrides ?? []).map((o) => [o.customerId, o]));
  for (const row of byCustomer.values()) {
    const customer = customers.get(row.customerId);
    const today = localDate(now, customer);
    const promise = latestPromise(row.customerId);
    const broken = Boolean(promise && promise.date < today);
    if (promise && promise.date > today) {
      // 7. The promised date is the follow-up date. Out of the run until then,
      // unless a named person has asked for an exception to be considered.
      if (!overrideFor.has(row.customerId)) continue;
      pendingPromise.add(row.customerId);
    }
    entries.push({
      customerId: row.customerId,
      amount: row.amount,
      bucket: bucketFor(row.oldest, broken),
      invoiceIds: row.invoiceIds,
      _oldest: row.oldest,
    });
  }

  entries.sort((a, b) => {
    const pa = a.bucket === "broken_promise" ? 0 : 1;
    const pb = b.bucket === "broken_promise" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return b._oldest - a._oldest;
  });

  // 6. Relationship-sized balances: flagged, excluded, routed to a named person.
  for (const e of entries) {
    const customer = customers.get(e.customerId);
    if (customer?.relationship || e.amount > config.relationshipThresholdCents) {
      e.excludedReason = "relationship_account";
      await ports.escalate(
        "relationship_account",
        `customer ${e.customerId} owes ${e.amount} cents; not an automated call; routed to ${config.owners.relationship}`,
      );
    }
  }

  const run = entries.map(({ _oldest, ...e }) => e);
  await ports.rank(run);

  // 8 and 9. The gate, underneath the ranking, at dial time, row by row.
  for (const e of run) {
    if (e.excludedReason) continue;
    const decision = await ports.gate(e.customerId);
    let mayDial = decision?.allowed === true;
    if (!mayDial && decision?.reason === "promise_pending" && pendingPromise.has(e.customerId)) {
      // A commercial hold, so a named person may lift it. Hours, holidays and a
      // paid ledger are never lifted, by anyone, from here.
      const o = overrideFor.get(e.customerId);
      const accepted = await ports.override({ customerId: e.customerId, reason: o.reason, approver: o.approver });
      if (!accepted) {
        await ports.escalate("override_refused", `override for ${e.customerId} had no named approver; held: promise_pending; owner: ${config.owners.credit}`);
      }
      mayDial = accepted === true;
    }
    if (!mayDial) continue;

    // Belt and braces: the ledger again, immediately before the dial.
    const fresh = ((await ports.readLedger()) ?? []).filter((i) => e.invoiceIds.includes(i.id) && !i.paidAt);
    if (fresh.length === 0) continue;

    await ports.disclose(e.customerId, opener(e, fresh, now, config));
  }
}

/** Disclosure first, then the invoice, the days past due as a fact, and one question that takes a date. */
export function opener(entry, invoices, now, config) {
  const oldest = invoices.slice().sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))[0];
  const days = daysPastDue(oldest, now);
  const others = invoices.length > 1 ? ` and ${invoices.length - 1} other invoice(s)` : "";
  return (
    `Hi, this is an AI assistant calling on behalf of ${config.business}. ` +
    `I'm calling about invoice ${oldest.id}${others}, which is ${days} days past its due date. ` +
    `When can we expect payment?`
  );
}

async function recordOutcome(ports, outcome, { now, customers, config }) {
  const customer = customers.get(outcome.customerId);
  const today = localDate(now, customer);
  const said = String(outcome.said ?? "");

  if (HARDSHIP_RE.test(said)) {
    await ports.escalate("hardship_stated", `customer ${outcome.customerId}: "${said}"; no promise taken, no further calls; owner: ${config.owners.credit}`);
    return;
  }
  if (DISPUTE_RE.test(said)) {
    await ports.escalate("dispute_open", `customer ${outcome.customerId} named a dispute: "${said}"; owner: ${config.owners.dispute}`);
    return;
  }
  const date = promisedDate(said, today);
  if (!date) {
    await ports.escalate("no_date_given", `customer ${outcome.customerId}: "${said}"; no date, so no promise; next touch goes back through the gate; owner: ${config.owners.credit}`);
    return;
  }
  const amount = promisedAmount(said);
  const written = await ports.recordPromise({ customerId: outcome.customerId, date, amount });
  const back = ((await ports.readPromises()) ?? []).find(
    (p) => p.customerId === outcome.customerId && p.date === date && p.capturedAt === written?.capturedAt,
  );
  if (!written || !back) {
    await ports.escalate("promise_write_failed", `promise for ${outcome.customerId} on ${date} did not read back; owner: ${config.owners.credit}`);
    return;
  }
  // A promise never overwrites a dispute. Re-read the book; any dispute stays with a person.
  const stillDisputed = ((await ports.readLedger()) ?? []).filter((i) => i.customerId === outcome.customerId && i.disputed && !i.paidAt);
  for (const inv of stillDisputed) {
    await ports.escalate(
      "dispute_open",
      `promise for ${outcome.customerId} on ${date} recorded; dispute on invoice ${inv.id} stays open; owner: ${config.owners.dispute}`,
    );
  }
}

/**
 * Chase List: the debtor chasing job, built to AIP-BS-DEBTOR-CHASING 2026-10-06.
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
 *
 * A port of "Invoice Chaser" by Thuong P. Nguyen, reimplemented from the
 * standard and from the public listing text only. Nothing here is taken from
 * the original bot's prompt, instructions or workflow.
 *
 * WHAT IT DOES. It ranks the overdue book by what each customer is worth
 * chasing, drafts one reminder per customer (friendly, firm or final, by
 * bucket), and builds the chase schedule: which draft is ready for a named
 * person to send now, and which is held and why. It never sends, never dials
 * and never speaks to a debtor. Every reminder stays a draft until the person
 * who owns receivables releases it.
 *
 * WHAT WAKES IT (one run per wake, nothing kept between runs):
 *
 *   schedule.tick     work the whole book, read fresh off the ledger
 *   invoice.overdue   the same: the customer is reranked with the whole book
 *   email.received    a debtor replied on a reminder thread; the thread carries
 *                     the invoice id, so the reply is read by that id. A dated
 *                     promise is recorded; anything else goes to a person
 *   exception.closed  a named person approved an exception to a gate hold
 *
 * THE RUN, in the standard's order (section 12):
 *
 *   1. Read the ledger, the customers and the promises already captured.
 *   2. Keep only invoices past their DUE date. Never the issue date.
 *   3. Bucket each invoice: just late, drifting, hard, broken promise.
 *   4. Collapse to one row per customer, summing what they owe.
 *   5. Lift out: an open dispute, a relationship-sized balance. Each goes to
 *      the named owner with what is already known. A customer whose promised
 *      date has not arrived is not in the run at all.
 *   6. Rank: broken promise first, then amount at risk, age only breaks ties.
 *   7. Draft the reminder for each row, with the invoice numbers, the days past
 *      due as a fact, and one question that takes a date.
 *   8. Submit the ranking. Then, underneath it, ask the gate about every row.
 *      A held row stays held whatever its score. Only a row the gate clears is
 *      handed to the person as ready to send.
 *
 * Every effect goes through the ports. The gate is the port, not a helper this
 * file re-implements: calling hours in the debtor's zone, state public
 * holidays and the stop on payment are the gate's, and the Do Not Call
 * Register wash is the hosted provider's (Get Paid on Office Voice), which is
 * why this node never dials.
 */

const DAY = 86_400_000;

/** The business's credit policy. A person sets these; the build only reads them. */
export const DEFAULT_POLICY = {
  /** Above this, in cents, chasing the customer is a relationship decision. A$50,000. */
  relationshipCents: 5_000_000,
  /** Who owns receivables exceptions. A named person, never "the team". */
  owner: "Dana Whitfield (accounts receivable)",
  /** The debtor's zone when the customer record does not say. */
  defaultZone: "Australia/Brisbane",
};

/** The four buckets, closed. Days are off the due date. */
export function bucketFor(daysPastDue, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (daysPastDue <= 14) return "just_late";
  if (daysPastDue <= 44) return "drifting";
  return "hard";
}

/** Tone follows the bucket. Broken promise refers back to the date given. */
const TONE = { just_late: "friendly", drifting: "firm", hard: "final", broken_promise: "final" };

const BUCKET_ORDER = { broken_promise: 0, hard: 1, drifting: 1, just_late: 1 };

/** YYYY-MM-DD in the debtor's own zone. */
export function localDate(now, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const aud = (cents) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The draft. Facts only: numbers, days past due, one question that takes a date. */
export function draftReminder(entry, customer) {
  const tone = TONE[entry.bucket];
  const refs = entry.invoiceIds.join(", ");
  const days = `${entry.daysPastDue} day${entry.daysPastDue === 1 ? "" : "s"}`;
  const owed = aud(entry.amount);
  const greeting = `Hi ${customer?.name ?? "there"},`;
  let body;
  if (tone === "friendly") {
    body = `A quick note in case this slipped past: ${refs} for ${owed} is ${days} past its due date. When can we expect payment?`;
  } else if (tone === "firm") {
    body = `Our records show ${refs} for ${owed} is now ${days} past its due date. If something is holding it up, a missing order number or a query on the work, reply and we will sort it. Otherwise, what date can we expect payment?`;
  } else if (entry.bucket === "broken_promise") {
    body = `You let us know payment of ${refs} would be made by ${entry.promisedDate}. Our records show ${owed} is still outstanding and ${days} past its due date. What date will it be paid?`;
  } else {
    body = `${refs} for ${owed} is ${days} past its due date and we have not been able to reach you about it. Please reply with the date it will be paid, or tell us if there is a problem with the invoice.`;
  }
  return { tone, text: `${greeting}\n\n${body}\n\nThanks,\nAccounts` };
}

/** Promise words in a reply. Only a date makes a promise; an amount is optional. */
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export function readPromise(said, now, zone) {
  const text = String(said ?? "").toLowerCase();
  const today = localDate(now, zone);
  let date = null;
  const iso = /\b(20\d\d-\d\d-\d\d)\b/.exec(text);
  if (iso) date = iso[1];
  if (!date) {
    const dow = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
    if (dow >= 0) {
      const base = new Date(`${today}T00:00:00Z`);
      const ahead = (dow - base.getUTCDay() + 7) % 7 || 7;
      date = new Date(base.getTime() + ahead * DAY).toISOString().slice(0, 10);
    }
  }
  if (!date && /\btomorrow\b/.test(text)) date = new Date(new Date(`${today}T00:00:00Z`).getTime() + DAY).toISOString().slice(0, 10);
  const money = /\$\s?([\d,]+(?:\.\d\d)?)/.exec(text);
  const amount = money ? Math.round(Number(money[1].replace(/,/g, "")) * 100) : null;
  return { date, amount };
}

/** A reply that must go to a person, whatever else it says. */
const PERSON_ONLY = [
  { reason: "debtor.hardship", re: /\b(hardship|can'?t afford|cannot afford|struggling|lost (my|our) (job|contract)|payment plan)\b/i },
  { reason: "debtor.dispute_named", re: /\b(dispute|not happy with|wrong amount|never ordered|incorrect invoice|no purchase order|po number)\b/i },
];

async function escalate(ports, reason, fields, policy) {
  await ports.escalate(reason, JSON.stringify({ owner: policy.owner, ...fields }));
}

/**
 * The book as this run sees it: one row per customer, ranked, with the rows
 * that are out of the automated run carried at the end with their reason.
 */
export async function rankBook(ports, policy) {
  const now = await ports.now();
  const invoices = await ports.readLedger();
  const customers = await ports.readCustomers();
  const promises = await ports.readPromises();
  const byId = new Map(customers.map((c) => [c.id, c]));
  const zoneOf = (id) => byId.get(id)?.timezone ?? policy.defaultZone;

  // The latest promise per customer is the one that drives the schedule.
  const promiseOf = new Map();
  for (const p of promises) {
    const prev = promiseOf.get(p.customerId);
    if (!prev || p.capturedAt > prev.capturedAt) promiseOf.set(p.customerId, p);
  }

  // Overdue off the due date, unpaid, on the live ledger read just made.
  const overdue = invoices.filter((i) => !i.paidAt && new Date(i.dueAt).getTime() < now.getTime());

  const rows = new Map();
  for (const inv of overdue) {
    const daysPastDue = Math.floor((now.getTime() - new Date(inv.dueAt).getTime()) / DAY);
    const row = rows.get(inv.customerId) ?? { customerId: inv.customerId, amount: 0, invoiceIds: [], daysPastDue: 0, disputed: false };
    row.amount += inv.amount;
    row.invoiceIds.push(inv.id);
    row.daysPastDue = Math.max(row.daysPastDue, daysPastDue);
    row.disputed ||= Boolean(inv.disputed);
    rows.set(inv.customerId, row);
  }

  const dial = [];
  const out = [];
  for (const row of rows.values()) {
    const today = localDate(now, zoneOf(row.customerId));
    const promise = promiseOf.get(row.customerId);
    // The promised date is the follow-up date. Before it, the customer is not in the run.
    if (promise && promise.date > today && !row.disputed) continue;
    const broken = Boolean(promise && promise.date < today);
    const entry = {
      customerId: row.customerId,
      amount: row.amount,
      bucket: bucketFor(row.daysPastDue, broken),
      invoiceIds: row.invoiceIds,
      daysPastDue: row.daysPastDue,
      ...(broken ? { promisedDate: promise.date } : {}),
    };
    const customer = byId.get(row.customerId);
    if (row.disputed) {
      out.push({ ...entry, excludedReason: "dispute_open" });
    } else if (customer?.relationship || row.amount > policy.relationshipCents) {
      out.push({ ...entry, excludedReason: "relationship_sized_balance" });
    } else {
      dial.push({ ...entry, draft: draftReminder(entry, customer) });
    }
  }

  dial.sort(
    (a, b) =>
      BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] ||
      b.amount - a.amount ||
      b.daysPastDue - a.daysPastDue ||
      a.customerId.localeCompare(b.customerId),
  );
  out.sort((a, b) => b.amount - a.amount || a.customerId.localeCompare(b.customerId));
  return { now, dial, out };
}

/** schedule.tick: the whole book. */
async function tick(ports, policy) {
  const { dial, out } = await rankBook(ports, policy);
  await ports.rank([...dial, ...out]);

  for (const row of out) {
    await escalate(ports, row.excludedReason === "dispute_open" ? "debtor.dispute_open" : "debtor.relationship_account", {
      customerId: row.customerId,
      invoiceIds: row.invoiceIds,
      amount: row.amount,
      bucket: row.bucket,
    }, policy);
  }

  // The gate sits underneath the ranking. No score promotes a row past it.
  const schedule = [];
  for (const row of dial) {
    const decision = await ports.gate(row.customerId);
    if (decision?.allowed !== true) {
      schedule.push({ customerId: row.customerId, status: "held", reason: decision?.reason ?? "gate_refused" });
      continue;
    }
    await escalate(ports, "debtor.reminder_ready_for_release", {
      customerId: row.customerId,
      invoiceIds: row.invoiceIds,
      tone: row.draft.tone,
      draft: row.draft.text,
    }, policy);
    schedule.push({ customerId: row.customerId, status: "ready", tone: row.draft.tone });
  }
  return { outcome: "ranked", schedule };
}

/** email.received on a reminder thread: the thread carries the invoice id. */
async function reply(ports, wake, policy) {
  const invoices = await ports.readLedger();
  const inv = invoices.find((i) => i.id === wake.invoiceId);
  if (!inv) {
    await escalate(ports, "debtor.reply_unmatched", { messageId: wake.messageId ?? null, invoiceId: wake.invoiceId ?? null }, policy);
    return { outcome: "unmatched" };
  }
  const customers = await ports.readCustomers();
  const zone = customers.find((c) => c.id === inv.customerId)?.timezone ?? policy.defaultZone;
  const person = PERSON_ONLY.find((p) => p.re.test(wake.said ?? ""));
  if (person && person.reason === "debtor.hardship") {
    await escalate(ports, person.reason, { customerId: inv.customerId, invoiceId: inv.id, messageId: wake.messageId ?? null }, policy);
    return { outcome: "handed_to_person" };
  }
  const { date, amount } = readPromise(wake.said, await ports.now(), zone);
  if (!date) {
    // No date is a deflection, not a promise. A person reads it.
    await escalate(ports, person?.reason ?? "debtor.reply_without_date", { customerId: inv.customerId, invoiceId: inv.id, messageId: wake.messageId ?? null }, policy);
    return { outcome: "no_date" };
  }
  const promise = await ports.recordPromise({ customerId: inv.customerId, date, amount });
  if (!promise || !promise.capturedAt) {
    await escalate(ports, "debtor.promise_write_failed", { customerId: inv.customerId, invoiceId: inv.id }, policy);
    return { outcome: "write_failed" };
  }
  // A promise never closes a dispute. If one is open, or named in this reply, a person still owns it.
  if (inv.disputed || person) {
    await escalate(ports, "debtor.dispute_open", { customerId: inv.customerId, invoiceId: inv.id, promisedDate: promise.date }, policy);
  }
  return { outcome: "promise_recorded", promise };
}

/** exception.closed: a named person approved an exception to a gate hold. */
async function approved(ports, wake, policy) {
  // An exception nobody signed is a bypass. The port refuses it, and so does this.
  if (!wake.customerId || !wake.reason) return { outcome: "ignored" };
  const ok = await ports.override({ customerId: wake.customerId, reason: wake.reason, ...(wake.approver ? { approver: wake.approver } : {}) });
  if (ok !== true) return { outcome: "override_refused" };
  // Signed: the held draft goes to the person, carrying whose authority released it.
  // The row is re-read off the ledger first: an override never chases a paid invoice.
  const { dial } = await rankBook(ports, policy);
  const row = dial.find((r) => r.customerId === wake.customerId);
  if (!row) return { outcome: "override_recorded", released: false };
  await escalate(ports, "debtor.reminder_ready_for_release", {
    customerId: row.customerId,
    invoiceIds: row.invoiceIds,
    tone: row.draft.tone,
    draft: row.draft.text,
    override: { reason: wake.reason, approver: wake.approver },
  }, policy);
  return { outcome: "override_recorded", released: true };
}

/** Build with the business's own policy. */
export function makeBuild(policy = DEFAULT_POLICY) {
  return async function build(ports, wake = { event: "schedule.tick" }) {
    switch (wake?.event) {
      case "schedule.tick":
      // One invoice going overdue still means working the customer as one
      // conversation, so it reranks the book rather than chasing one row.
      case "invoice.overdue":
        return tick(ports, policy);
      case "email.received":
        return reply(ports, wake, policy);
      case "exception.closed":
        return approved(ports, wake, policy);
      default:
        return { outcome: "ignored" };
    }
  };
}

export const build = makeBuild();

/**
 * Owing Today: the debtor chasing job for a trade business, built to
 * AIP-BS-DEBTOR-CHASING 2026-10-06.
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
 *
 * A reimplementation, written from the standard and from one line of public
 * listing text. Nothing here comes from the original bot's prompt,
 * instructions or workflow.
 *
 * THE JOB, in the owner's words: "Every morning, tell me who owes me money,
 * biggest first, with a reminder already written for each one, polite for the
 * ones just late and firmer for the ones that have drifted. I send them."
 *
 * It never sends, never dials and never talks to a debtor. The queue it writes
 * is a list of drafts for the person who owns receivables to send from their
 * own phone or inbox. The live call is Get Paid on Office Voice, connected with
 * `npx @aipathway/conformance connect`, and is not written here.
 *
 * WHAT WAKES IT. One step per wake, nothing kept between wakes:
 *
 *   schedule.tick      the morning run: the whole book, read fresh off the ledger
 *   payment.received   the same run, so a customer who just paid drops out
 *   email.received     a debtor replied on a reminder thread. The thread carries
 *                      the invoice id, and the reply is matched by that id only.
 *                      A dated promise is recorded on the invoice; anything else
 *                      goes to the named owner
 *   exception.closed   the named owner approved (or did not) an exception to a
 *                      gate hold on one customer
 *
 * THE MORNING RUN, in the standard's order (section 12):
 *
 *   1. Read the ledger, the customers and the promises already captured.
 *   2. Keep invoices past their DUE date. The issue date never makes a row late.
 *   3. Bucket: just late (1-14 days), drifting (15-44), hard (45+), broken
 *      promise (a promised date that has passed with money still owing).
 *   4. One row per customer, summed. A customer whose promised date has not
 *      arrived is not in the run at all: the promise is the follow-up date.
 *   5. Lift out an open dispute and a relationship-sized balance, each with a
 *      reason, each handed to the named owner. They are never scored.
 *   6. Rank: broken promise first, then amount at risk, age only breaks ties.
 *   7. Submit the ranking. Then, underneath it, ask the gate about each row in
 *      ranked order. A held row stays held whatever its score.
 *   8. Write the reminder for every cleared row and put today's queue in front
 *      of the owner as one exception, with the invoice ids on every line.
 */

const DAY = 86_400_000;

/** The business's credit policy. A person sets these; the build only reads them. */
export const POLICY = {
  /** At or above this, in cents, the account is a relationship call, not a chase. A$40,000. */
  relationshipCents: 4_000_000,
  /** Who owns receivables. A named person, never "the office". */
  owner: "Bec Hartley (office manager, receivables)",
  /** The debtor's zone when the customer record does not carry one. */
  defaultZone: "Australia/Brisbane",
  /** Payment terms quoted in the reminder are the ledger's own. Nothing about interest or fees. */
  business: "the business",
};

/**
 * Check 1. The share of the overdue book with a mobile number on it. It is
 * measured by the business on its own ledger before the build is switched on,
 * and attached as evidence. The build carries the slot; it never invents the
 * figure, so it is null until the operator fills it.
 */
export const COVERAGE = { mobileShare: null, measuredAt: null, how: "operator attaches the aged receivables export it was counted from" };

export const BUCKETS = ["just_late", "drifting", "hard", "broken_promise"];
const SEVERITY = { just_late: 1, drifting: 2, hard: 3, broken_promise: 4 };

/** A reminder that is polite where the customer is just late and firmer as it drifts. Never a threat. */
const TONE = { just_late: "polite", drifting: "firm", hard: "direct", broken_promise: "promise follow-up" };

/** The date in the debtor's own zone, YYYY-MM-DD. */
function localDate(at, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function weekdayIndex(at, zone) {
  const d = new Intl.DateTimeFormat("en-AU", { timeZone: zone, weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d);
}

function addDays(ymd, n) {
  const t = new Date(`${ymd}T00:00:00.000Z`).getTime() + n * DAY;
  return new Date(t).toISOString().slice(0, 10);
}

function daysPastDue(inv, now) {
  return Math.floor((now.getTime() - new Date(inv.dueAt).getTime()) / DAY);
}

function bucketFor(days) {
  if (days >= 45) return "hard";
  if (days >= 15) return "drifting";
  return "just_late";
}

const money = (cents) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The reminder. Names every invoice and the total, says how many days past due
 * as a fact, and asks one question that takes a date. No apology, no interest,
 * no fees, no consequences: none are written into the terms this build reads.
 */
export function draftReminder(row, name) {
  const refs = row.invoiceIds.join(", ");
  const days = `${row.oldestDays} day${row.oldestDays === 1 ? "" : "s"}`;
  const opener = {
    just_late: `Hi ${name}, a quick note that invoice ${refs} for ${money(row.amount)} is now ${days} past its due date.`,
    drifting: `Hi ${name}, invoice ${refs} for ${money(row.amount)} is ${days} past its due date and still open.`,
    hard: `Hi ${name}, invoice ${refs} for ${money(row.amount)} is ${days} past its due date. If something about the job or the invoice is holding it up, tell us and we will sort it.`,
    broken_promise: `Hi ${name}, you let us know payment for invoice ${refs} would be made by ${row.promiseDate}. It has not come through yet and ${money(row.amount)} is still open.`,
  }[row.bucket];
  return `${opener} When can we expect payment?`;
}

/** Read a date out of a reply. Only a date the debtor actually gave; a vague reply returns null. */
export function dateFromReply(said, now, zone) {
  const text = String(said ?? "").toLowerCase();
  const iso = /\b(20\d\d-\d\d-\d\d)\b/.exec(text);
  if (iso) return iso[1];
  const today = localDate(now, zone);
  if (/\btomorrow\b/.test(text)) return addDays(today, 1);
  if (/\btoday\b/.test(text)) return today;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const hit = days.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
  if (hit >= 0) {
    const ahead = (hit - weekdayIndex(now, zone) + 7) % 7 || 7;
    return addDays(today, ahead);
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(text);
  if (dm) {
    const year = Number(today.slice(0, 4));
    const m = String(months.indexOf(dm[2]) + 1).padStart(2, "0");
    let d = `${year}-${m}-${dm[1].padStart(2, "0")}`;
    if (d < today) d = `${year + 1}-${m}-${dm[1].padStart(2, "0")}`;
    return d;
  }
  return null;
}

/** An amount the debtor named, in cents, or null. "I'll pay Friday" carries no number and none is invented. */
export function amountFromReply(said) {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(String(said ?? ""));
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
}

const HARDSHIP = /\b(hardship|can'?t afford|cannot afford|lost (my|our) job|struggling|payment plan)\b/i;
const DISPUTE = /\b(dispute|disputing|not happy|unhappy|wrong amount|incorrect|never (got|received)|didn'?t (do|finish)|not finished)\b/i;

/** The morning run. Returns today's queue and what was held, for the person and the runner. */
async function morningRun(ports, policy) {
  const now = ports.now();
  const ledger = await ports.readLedger();
  const customers = await ports.readCustomers();
  const promises = await ports.readPromises();
  const byId = new Map(customers.map((c) => [c.id, c]));
  const zoneOf = (id) => byId.get(id)?.timezone ?? policy.defaultZone;

  // Step 2: past the due date, unpaid. issuedAt is never read.
  const overdue = ledger.filter((i) => !i.paidAt && new Date(i.dueAt).getTime() < now.getTime() && daysPastDue(i, now) >= 1);

  // The latest promise per customer is the one that drives behaviour.
  const promiseOf = new Map();
  for (const p of promises) {
    const prev = promiseOf.get(p.customerId);
    if (!prev || p.capturedAt > prev.capturedAt) promiseOf.set(p.customerId, p);
  }

  // Steps 3 and 4: bucket each invoice, then one row per customer.
  const rows = new Map();
  for (const inv of overdue) {
    const days = daysPastDue(inv, now);
    const row = rows.get(inv.customerId) ?? { customerId: inv.customerId, amount: 0, invoiceIds: [], oldestDays: 0, bucket: "just_late", disputed: false };
    row.amount += inv.amount;
    row.invoiceIds.push(inv.id);
    row.oldestDays = Math.max(row.oldestDays, days);
    if (SEVERITY[bucketFor(days)] > SEVERITY[row.bucket]) row.bucket = bucketFor(days);
    row.disputed ||= inv.disputed === true;
    rows.set(inv.customerId, row);
  }

  const entries = [];
  for (const row of rows.values()) {
    const promise = promiseOf.get(row.customerId);
    const today = localDate(now, zoneOf(row.customerId));
    if (promise && promise.date > today) continue; // the promised date is the follow-up date
    if (promise && promise.date < today) {
      row.bucket = "broken_promise";
      row.promiseDate = promise.date;
    }
    if (row.disputed) row.excludedReason = "dispute_open";
    else if (byId.get(row.customerId)?.relationship === true || row.amount >= policy.relationshipCents) row.excludedReason = "relationship_account";
    entries.push(row);
  }

  // Step 6: broken promise first, then amount at risk, then age.
  const dial = entries
    .filter((e) => !e.excludedReason)
    .sort((a, b) => (b.bucket === "broken_promise") - (a.bucket === "broken_promise") || b.amount - a.amount || b.oldestDays - a.oldestDays);
  const lifted = entries.filter((e) => e.excludedReason);

  await ports.rank(
    [...dial, ...lifted].map((e) => ({
      customerId: e.customerId,
      amount: e.amount,
      bucket: e.bucket,
      invoiceIds: [...e.invoiceIds],
      ...(e.excludedReason ? { excludedReason: e.excludedReason } : {}),
    })),
  );

  for (const e of lifted) {
    const reason = e.excludedReason === "dispute_open" ? "debtor.dispute_open" : "debtor.relationship_account";
    await ports.escalate(
      reason,
      JSON.stringify({ exception_owner: policy.owner, customer_id: e.customerId, invoice_ids: e.invoiceIds, amount_cents: e.amount, bucket: e.bucket }),
    );
  }

  // Step 7: the gate, underneath the ranking, in ranked order.
  const queue = [];
  const held = [];
  for (const e of dial) {
    const decision = await ports.gate(e.customerId);
    if (decision.allowed !== true) {
      held.push({ customerId: e.customerId, invoiceIds: e.invoiceIds, reason: decision.reason ?? "held" });
      continue;
    }
    const name = byId.get(e.customerId)?.name ?? e.customerId;
    queue.push({ customerId: e.customerId, invoiceIds: e.invoiceIds, amount: e.amount, bucket: e.bucket, tone: TONE[e.bucket], text: draftReminder(e, name) });
  }

  if (queue.length > 0) {
    await ports.escalate("debtor.queue_ready", JSON.stringify({ exception_owner: policy.owner, date: localDate(now, policy.defaultZone), queue }));
  }
  return { queue, held, lifted: lifted.map((e) => ({ customerId: e.customerId, reason: e.excludedReason })) };
}

/** A debtor replied on a reminder thread. Matched by the invoice id the thread carries, never by name. */
async function onReply(ports, wake, policy) {
  const ledger = await ports.readLedger();
  const inv = ledger.find((i) => i.id === wake.invoiceId);
  const detail = (extra) => JSON.stringify({ exception_owner: policy.owner, message_id: wake.messageId ?? null, invoice_id: wake.invoiceId ?? null, ...extra });
  if (!inv) {
    await ports.escalate("debtor.reply_unmatched", detail({ said: wake.said }));
    return { promise: null };
  }
  const customers = await ports.readCustomers();
  const zone = customers.find((c) => c.id === inv.customerId)?.timezone ?? policy.defaultZone;
  if (HARDSHIP.test(wake.said ?? "")) {
    await ports.escalate("debtor.hardship", detail({ customer_id: inv.customerId, said: wake.said }));
    return { promise: null };
  }
  if (DISPUTE.test(wake.said ?? "")) {
    await ports.escalate("debtor.dispute_named", detail({ customer_id: inv.customerId, said: wake.said }));
    return { promise: null };
  }
  const date = dateFromReply(wake.said, ports.now(), zone);
  if (!date) {
    await ports.escalate("debtor.reply_without_date", detail({ customer_id: inv.customerId, said: wake.said }));
    return { promise: null };
  }
  const promise = await ports.recordPromise({ customerId: inv.customerId, date, amount: amountFromReply(wake.said) });
  if (!promise || !promise.capturedAt) {
    await ports.escalate("debtor.promise_write_failed", detail({ customer_id: inv.customerId, date }));
    return { promise: null };
  }
  // A logged dispute is never cleared by a promise: nothing here writes to it.
  return { promise };
}

/** The named owner closed an exception on a held customer. No approver, no release. */
async function onExceptionClosed(ports, wake, policy) {
  const accepted = await ports.override({ customerId: wake.customerId, reason: wake.reason, ...(wake.approver ? { approver: wake.approver } : {}) });
  if (accepted !== true) {
    await ports.escalate("debtor.override_refused", JSON.stringify({ exception_owner: policy.owner, customer_id: wake.customerId, why: "no named approver" }));
    return { queue: [] };
  }
  // Read the book again by the customer's own id: a paid invoice is never released, approval or not.
  const ledger = await ports.readLedger();
  const open = ledger.filter((i) => i.customerId === wake.customerId && !i.paidAt && new Date(i.dueAt).getTime() < ports.now().getTime());
  if (open.length === 0) return { queue: [] };
  const customers = await ports.readCustomers();
  const now = ports.now();
  const row = {
    customerId: wake.customerId,
    invoiceIds: open.map((i) => i.id),
    amount: open.reduce((s, i) => s + i.amount, 0),
    oldestDays: Math.max(...open.map((i) => daysPastDue(i, now))),
  };
  row.bucket = bucketFor(row.oldestDays);
  const name = customers.find((c) => c.id === wake.customerId)?.name ?? wake.customerId;
  const item = { ...row, tone: TONE[row.bucket], text: draftReminder(row, name), approved_by: wake.approver, approval_reason: wake.reason };
  await ports.escalate("debtor.queue_ready", JSON.stringify({ exception_owner: policy.owner, override: true, queue: [item] }));
  return { queue: [item] };
}

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{ event?: string, messageId?: string, invoiceId?: string, said?: string, customerId?: string, reason?: string, approver?: string }} [wake]
 */
export async function build(ports, wake = { event: "schedule.tick" }, policy = POLICY) {
  switch (wake.event) {
    case "email.received":
      return onReply(ports, wake, policy);
    case "exception.closed":
      return onExceptionClosed(ports, wake, policy);
    default:
      return morningRun(ports, policy);
  }
}

/**
 * Promise Watch, built to AIP-BS-DEBTOR-CHASING 2026-10-06, AI Pathway,
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
 *
 * THE JOB. A freelancer or small agency chases its own debtor book by email.
 * When a client replies "I'll pay by Friday", that sentence becomes a promise
 * object on the invoice, with a date. Nothing is chased again before that
 * date. When the date passes and the ledger still shows it unpaid, the client
 * moves to the broken-promise bucket, which outranks every other row, and a
 * chase is drafted for the owner to approve. Promise Watch drafts. It never
 * sends on its own and it never dials.
 *
 * HOW IT IS WOKEN. Three ways, each a named mesh event, and nothing else:
 *
 *   schedule.tick      (no input)  the daily run: read the ledger, bucket,
 *                                  rank, gate, draft
 *   email.received     { event: "email.received", message }  a client reply
 *                                  in the watched Gmail inbox; the invoice is
 *                                  found by the invoice number in the reply,
 *                                  read by id off the ledger, never by sender
 *   exception.closed   { event: "exception.closed", customerId, reason, approver }
 *                                  a named person lifted a hold
 *
 * WHAT A "DIAL" IS HERE. The world's `disclose` port stands in for the moment
 * a contact is made. For Promise Watch that moment is releasing a chase draft
 * into the owner's approval queue, and the draft opens by saying it was
 * prepared by an AI assistant. A row the gate holds gets no draft. Live calls,
 * the Do Not Call Register wash and the hosted gate stay with the production
 * provider the standard names; none of that is written here.
 *
 * THE ONE RULE. Everything goes through the ports. No SDK, no network.
 */

export const NODE = "promise-watch";

export const CONFIG = {
  /** Who owns a hold, a dispute or a relationship-sized account. A named person. */
  owner: "Jordan Lee (accounts owner)",
  /** Office timezone, used only when the client's own is unknown. */
  officeTimezone: "Australia/Brisbane",
  /** A client owing this much (cents) or flagged as a relationship is lifted out of the run. */
  relationshipThreshold: 2_500_000,
};

const DAY = 86_400_000;

/** The client's local calendar date, YYYY-MM-DD, in their own timezone. */
function localDate(at, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return parts; // en-CA formats as YYYY-MM-DD
}

const dayNumber = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY);

/** Days past due, off the due date and never the issue date. Check 2. */
function daysPastDue(invoice, now, timezone) {
  return dayNumber(localDate(now, timezone)) - dayNumber(localDate(new Date(invoice.dueAt), timezone));
}

/** The age bucket of one invoice. Broken promise is decided per client, not per invoice. */
function ageBucket(days) {
  if (days <= 14) return "just_late";
  if (days <= 44) return "drifting";
  return "hard";
}

/** The latest promise per client, by when it was captured. */
function latestPromises(promises) {
  const out = new Map();
  for (const p of promises) {
    const prev = out.get(p.customerId);
    if (!prev || p.capturedAt > prev.capturedAt) out.set(p.customerId, p);
  }
  return out;
}

const tzOf = (customer) => customer?.timezone ?? CONFIG.officeTimezone;
const money = (cents) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The chase draft: invoice numbers, days past due as a fact, one question that takes a date. */
function draftChase(entry, rows, promise, now, timezone) {
  const lines = rows.map((r) => `${r.id}: ${money(r.amount)}, ${daysPastDue(r, now, timezone)} days past due`);
  const lead =
    entry.bucket === "broken_promise"
      ? `You let us know payment would be made by ${promise.date}. Our ledger still shows it open.`
      : "Our ledger shows the following still open.";
  return [
    "This reminder was drafted by an AI assistant and is waiting for a person to approve it before it is sent.",
    lead,
    ...lines,
    `Total: ${money(entry.amount)}.`,
    "When can we expect payment?",
  ].join("\n");
}

/** schedule.tick: the daily run. */
async function dailyRun(ports) {
  const now = await ports.now();
  const ledger = await ports.readLedger();
  const customers = new Map((await ports.readCustomers()).map((c) => [c.id, c]));
  const promises = latestPromises(await ports.readPromises());

  // Group unpaid, past-due invoices by client. One client is one conversation. Check 6.
  const byCustomer = new Map();
  for (const inv of ledger) {
    if (inv.paidAt) continue;
    const tz = tzOf(customers.get(inv.customerId));
    if (daysPastDue(inv, now, tz) < 1) continue; // not late yet, whatever its issue date says
    if (!byCustomer.has(inv.customerId)) byCustomer.set(inv.customerId, []);
    byCustomer.get(inv.customerId).push(inv);
  }

  const dial = [];
  const excluded = [];
  const holds = [];
  for (const [customerId, rows] of byCustomer) {
    const customer = customers.get(customerId);
    const tz = tzOf(customer);
    const today = localDate(now, tz);
    const promise = promises.get(customerId);

    // The promised date is the follow-up date. Before it, the client is in no run. Check 9.
    if (promise && promise.date > today) continue;

    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const oldest = Math.max(...rows.map((r) => daysPastDue(r, now, tz)));
    const bucket = promise && promise.date < today ? "broken_promise" : ageBucket(oldest);
    const entry = { customerId, amount, bucket, invoiceIds: rows.map((r) => r.id) };

    // Out of the run, routed to a named person. Checks 7 and the standard's stays_with_person.
    if (customer?.relationship || amount >= CONFIG.relationshipThreshold) {
      excluded.push({ ...entry, excludedReason: "relationship_sized_balance" });
      holds.push(["relationship_sized_balance", `${customerId} owes ${money(amount)}; ${CONFIG.owner} decides how to approach them`]);
      continue;
    }
    if (rows.some((r) => r.disputed)) {
      excluded.push({ ...entry, excludedReason: "dispute_open" });
      holds.push(["dispute_open", `${customerId}: a dispute is logged on ${rows.filter((r) => r.disputed).map((r) => r.id).join(", ")}; ${CONFIG.owner} owns it`]);
      continue;
    }
    dial.push({ entry, rows, promise, tz, oldest });
  }

  // Broken promise first, then amount at risk, then age breaks a tie. Checks 4 and 5.
  dial.sort(
    (a, b) =>
      (b.entry.bucket === "broken_promise") - (a.entry.bucket === "broken_promise") || b.entry.amount - a.entry.amount || b.oldest - a.oldest,
  );

  await ports.rank([...dial.map((d) => d.entry), ...excluded]);
  for (const [reason, detail] of holds) await ports.escalate(reason, detail);

  // The gate sits underneath the ranking: every row, at the moment of contact, in rank order.
  // No score promotes a row past it. Check 10.
  for (const d of dial) {
    const decision = await ports.gate(d.entry.customerId);
    if (!decision.allowed) continue; // held, with the gate's reason on the record; tried again next run
    await ports.disclose(d.entry.customerId, draftChase(d.entry, d.rows, d.promise, now, d.tz));
  }
}

// ── Reading a promise out of a client's reply ────────────────────────────

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The date a reply commits to, as YYYY-MM-DD in the client's timezone, or null. */
export function promisedDate(text, now, timezone) {
  const t = text.toLowerCase();
  const today = localDate(now, timezone);
  const todayN = dayNumber(today);
  const fromN = (n) => new Date(n * DAY).toISOString().slice(0, 10);

  let m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t); // Australian order: day/month/year
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/.exec(t);
  if (m) {
    const year = Number(today.slice(0, 4));
    let ymd = `${year}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (ymd < today) ymd = `${year + 1}${ymd.slice(4)}`;
    return ymd;
  }
  if (/\btomorrow\b/.test(t)) return fromN(todayN + 1);
  m = /\b(?:by|on|this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
  if (m) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    let ahead = (WEEKDAYS.indexOf(m[1]) - dow + 7) % 7;
    if (ahead === 0) ahead = 7;
    return fromN(todayN + ahead);
  }
  return null; // "we'll sort it soon" is a deflection, not a promise
}

/** A figure, if the client named one, in cents. Empty is allowed: forcing one invents it. */
export function promisedAmount(text) {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(text);
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
}

/** email.received: a client reply. The invoice is found by its number, read by id off the ledger. */
async function onReply(ports, message) {
  const now = await ports.now();
  const refs = [...new Set(`${message.subject ?? ""} ${message.text ?? ""}`.match(/\bINV-[A-Z0-9-]+\b/gi) ?? [])].map((r) => r.toUpperCase());
  const ledger = await ports.readLedger();
  const invoices = ledger.filter((i) => refs.includes(i.id.toUpperCase()));
  const customerIds = [...new Set(invoices.map((i) => i.customerId))];
  if (customerIds.length !== 1) {
    // No invoice number, or numbers for two clients: never guess from the sender.
    await ports.escalate("promise.no_invoice_ref", `message ${message.id}: no single invoice id to file the reply against; ${CONFIG.owner} to read it`);
    return;
  }
  const [customerId] = customerIds;
  const customer = (await ports.readCustomers()).find((c) => c.id === customerId);
  const date = promisedDate(message.text ?? "", now, tzOf(customer));
  if (!date) {
    await ports.escalate("promise.no_date", `message ${message.id} on ${invoices.map((i) => i.id).join(", ")}: no date given; the next touch stays on schedule`);
    return;
  }
  const amount = promisedAmount(message.text ?? "");
  const written = await ports.recordPromise({ customerId, date, amount });

  // A write counts only when it reads back.
  const back = written ? (await ports.readPromises()).find((p) => p.customerId === customerId && p.date === date && p.capturedAt === written.capturedAt) : undefined;
  if (!back) {
    await ports.escalate("promise.write_failed", `message ${message.id}: the promise for ${date} did not read back; ${CONFIG.owner} to record it`);
    return;
  }
  // A promise never overwrites a dispute. Read the invoices again and, if one is disputed, the
  // dispute still stands and still belongs to a person.
  const after = (await ports.readLedger()).filter((i) => i.customerId === customerId && refs.includes(i.id.toUpperCase()));
  const disputed = after.filter((i) => i.disputed);
  if (disputed.length) {
    await ports.escalate("dispute_open", `${customerId} promised ${date} on ${disputed.map((i) => i.id).join(", ")}, which carries a logged dispute; the dispute stands and ${CONFIG.owner} owns it`);
  }
}

/** exception.closed: a named person lifted a hold. No name, no override. Check 11. */
async function onExceptionClosed(ports, input) {
  if (!input.approver) {
    await ports.escalate("override.refused_no_approver", `${input.customerId}: "${input.reason}" was not applied, because nobody named approved it`);
    return;
  }
  const decision = await ports.gate(input.customerId);
  if (decision.allowed) return; // nothing is held, so there is nothing to override
  const accepted = await ports.override({ customerId: input.customerId, reason: input.reason, approver: input.approver });
  if (!accepted) {
    await ports.escalate("override.refused", `${input.customerId}: override was refused`);
    return;
  }
  // A person can lift a pending promise early. Calling hours, a holiday and a paid ledger are
  // never theirs to lift: those holds stand.
  if (decision.reason !== "promise_pending") return;
  const now = await ports.now();
  const customer = (await ports.readCustomers()).find((c) => c.id === input.customerId);
  const tz = tzOf(customer);
  const rows = (await ports.readLedger()).filter((i) => i.customerId === input.customerId && !i.paidAt && daysPastDue(i, now, tz) >= 1);
  if (!rows.length) return;
  const amount = rows.reduce((s, r) => s + r.amount, 0);
  const entry = { customerId: input.customerId, amount, bucket: ageBucket(Math.max(...rows.map((r) => daysPastDue(r, now, tz)))), invoiceIds: rows.map((r) => r.id) };
  await ports.disclose(input.customerId, draftChase(entry, rows, undefined, now, tz));
}

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{ event: "email.received", message: { id: string, subject?: string, text?: string } }
 *   | { event: "exception.closed", customerId: string, reason: string, approver?: string }} [input]
 */
export async function build(ports, input) {
  if (input?.event === "email.received") return onReply(ports, input.message);
  if (input?.event === "exception.closed") return onExceptionClosed(ports, input);
  return dailyRun(ports);
}

/**
 * Nudge Desk: chasing your own overdue invoices, built to
 * AIP-BS-DEBTOR-CHASING 2026-10-06, AI Pathway,
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard (CC BY 4.0).
 *
 * A port of "Chase overdue QuickBooks invoices with Claude, Gmail, Slack and
 * Google Sheets" by Amplence, reimplemented from the standard and the public
 * listing text only. Nothing here is taken from the original's prompt,
 * instructions or workflow.
 *
 * What one run does, every time it is woken. Nothing is kept between runs:
 *
 *   schedule.tick (weekdays) or invoice.overdue
 *     1. Read the live ledger, the customers and the promises already on record.
 *     2. Drop every row that is not past its due date, off the due date, in the
 *        debtor's own timezone. The issue date is never used.
 *     3. Collapse to one row per customer, summing what they owe.
 *     4. Leave out anybody with a promise whose date has not come yet.
 *     5. Bucket: broken promise, then 1-14 just late, 15-44 drifting, 45+ hard.
 *        The bucket is the reminder stage; there is no other stage log.
 *     6. Take out of the automated run, with a reason and a named person: an
 *        open dispute, a relationship-sized balance, the do-not-chase list.
 *     7. Rank: broken promise first, then amount at risk, age only on a tie.
 *     8. For each row, in rank order, ask the gate at the moment of contact
 *        (the debtor's hours, their state's public holidays, a fresh ledger
 *        read for payment, a pending promise). Held means no reminder. No score
 *        gets past it. Only a held row carrying a named person's override goes,
 *        and an override with nobody's name on it is refused.
 *     9. Send one reminder per customer, which opens by saying it is automated,
 *        names every invoice, says the days past due as a number, and asks one
 *        question that takes a date.
 *
 *   email.received (the debtor replied)
 *     Turn a date in the reply into a promise object: a date, an amount that
 *     may be empty, and when it was captured. A promise never touches a
 *     dispute already on the invoice; the dispute still goes to a person.
 *
 * The do-not-call leg of the gate (the DNCR wash) and any call at all are not
 * here. They run on the hosted step the standard names. Nothing here dials.
 *
 * Every effect goes through the ports. Await every one.
 */

const DAY = 86_400_000;

/** The credit policy. A person sets these; the build only reads them. */
export const POLICY = {
  /** At or above this balance (cents) a customer is a relationship, not a chase. */
  relationshipThresholdCents: 5_000_000,
  /** Who each kind of hand-over goes to. A name, never "the team". */
  owners: {
    relationship: "Account owner: Jo Bennett",
    dispute: "Credit controller: Sam Price",
    reply: "Credit controller: Sam Price",
    override: "Credit controller: Sam Price",
  },
  business: "the accounts team",
};

/** The four buckets, closed. No free text. */
export const BUCKETS = ["just_late", "drifting", "hard", "broken_promise"];

const OFFSET_HOURS = {
  "Australia/Brisbane": 10,
  "Australia/Sydney": 10,
  "Australia/Melbourne": 10,
  "Australia/Hobart": 10,
  "Australia/Canberra": 10,
  "Australia/Perth": 8,
  "Australia/Adelaide": 9.5,
  "Australia/Darwin": 9.5,
};

/** The calendar date in the debtor's own zone. Overdue is judged there. */
export function localDate(now, timezone) {
  const offset = OFFSET_HOURS[timezone] ?? 10;
  return new Date(now.getTime() + offset * 3_600_000).toISOString().slice(0, 10);
}

const dayNumber = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY);

export function bucketFor(daysPastDue, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (daysPastDue <= 14) return "just_late";
  if (daysPastDue <= 44) return "drifting";
  return "hard";
}

const money = (cents) => `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The opener: automated, the invoices, the days as a fact, one question that takes a date. */
export function reminderText(entry, detail) {
  const refs = entry.invoiceIds.join(", ");
  const lead = `This is an automated reminder from ${POLICY.business}, written by an AI assistant.`;
  const facts = `Invoice${entry.invoiceIds.length > 1 ? "s" : ""} ${refs}: ${money(entry.amount)} outstanding, ${detail.daysPastDue} days past the due date.`;
  const ask =
    entry.bucket === "broken_promise"
      ? `You told us you would pay by ${detail.promiseDate}. What date can we expect it now?`
      : "When can we expect payment?";
  const out = "If you have already paid, or something about the invoice is not right, reply and a person will pick it up.";
  return `${lead} ${facts} ${ask} ${out}`;
}

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{ name?: string, customerId?: string, text?: string,
 *           overrides?: Array<{ customerId: string, reason: string, approver?: string }> }} [event]
 */
export async function build(ports, event = { name: "schedule.tick" }) {
  if (event?.name === "email.received") return onReply(ports, event);
  if (event?.name === "schedule.tick" || event?.name === "invoice.overdue" || event?.name === "exception.closed") {
    return chaseRun(ports, event);
  }
  return { outcome: "ignored" };
}

async function chaseRun(ports, event) {
  const now = await ports.now();
  const ledger = (await ports.readLedger()) ?? [];
  const customers = (await ports.readCustomers()) ?? [];
  const promises = (await ports.readPromises()) ?? [];
  const byId = new Map(customers.map((c) => [c.id, c]));

  // Steps 2 and 3: past due off the due date, in the debtor's zone, one row per customer.
  const groups = new Map();
  for (const inv of ledger) {
    if (inv.paidAt) continue;
    const c = byId.get(inv.customerId);
    if (!c) continue;
    const today = localDate(now, c.timezone);
    const due = String(inv.dueAt).slice(0, 10);
    if (!(due < today)) continue;
    const days = dayNumber(today) - dayNumber(due);
    const g = groups.get(c.id) ?? { customer: c, today, invoices: [], amount: 0, days: 0, disputed: false };
    g.invoices.push(inv);
    g.amount += inv.amount;
    g.days = Math.max(g.days, days);
    g.disputed ||= Boolean(inv.disputed);
    groups.set(c.id, g);
  }

  const entries = [];
  const excluded = [];
  const detail = new Map();
  for (const g of groups.values()) {
    const c = g.customer;
    // The latest promise for this customer is the one that drives behaviour.
    const promise = promises
      .filter((p) => p.customerId === c.id && p.date)
      .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0];
    // Step 4: the promised date is the follow-up date. Nothing before it.
    if (promise && promise.date > g.today) continue;
    const broken = Boolean(promise && promise.date < g.today);
    const entry = {
      customerId: c.id,
      amount: g.amount,
      bucket: bucketFor(g.days, broken),
      invoiceIds: g.invoices.map((i) => i.id),
    };
    detail.set(c.id, { daysPastDue: g.days, promiseDate: promise?.date ?? null });

    // Step 6: out of the automated run, with a reason and a named person.
    let reason = null;
    if (g.disputed) reason = "dispute_open";
    else if (c.relationship || g.amount >= POLICY.relationshipThresholdCents) reason = "relationship_account";
    else if (c.doNotChase) reason = "do_not_chase_list";
    if (reason) {
      excluded.push({ ...entry, excludedReason: reason });
      if (reason !== "do_not_chase_list") {
        const owner = reason === "dispute_open" ? POLICY.owners.dispute : POLICY.owners.relationship;
        await ports.escalate(
          reason,
          `customer ${c.id}, invoices ${entry.invoiceIds.join(", ")}, ${money(entry.amount)}: out of the automated run; owner ${owner}`,
        );
      }
      continue;
    }
    entries.push(entry);
  }

  // Step 7: broken promise first, then amount at risk, then age on a tie.
  entries.sort((a, b) => {
    const pa = a.bucket === "broken_promise" ? 1 : 0;
    const pb = b.bucket === "broken_promise" ? 1 : 0;
    if (pa !== pb) return pb - pa;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return detail.get(b.customerId).daysPastDue - detail.get(a.customerId).daysPastDue;
  });
  await ports.rank([...entries, ...excluded]);

  // Steps 8 and 9: the gate under every row, at the moment of contact.
  const overrides = new Map((event?.overrides ?? []).map((o) => [o.customerId, o]));
  const sent = [];
  for (const entry of entries) {
    const decision = await ports.gate(entry.customerId);
    if (!decision?.allowed) {
      const o = overrides.get(entry.customerId);
      // A paid invoice is never chased, whoever signs for it.
      if (!o || decision?.reason === "already_paid") continue;
      const accepted = await ports.override({ customerId: entry.customerId, reason: o.reason, approver: o.approver });
      if (accepted !== true) {
        await ports.escalate("override_refused", `customer ${entry.customerId}: override "${o.reason}" carried no named approver; held (${decision?.reason}); owner ${POLICY.owners.override}`);
        continue;
      }
    }
    await ports.disclose(entry.customerId, reminderText(entry, detail.get(entry.customerId)));
    sent.push(entry.customerId);
  }
  return { outcome: "run", ranked: entries.map((e) => e.customerId), sent };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** A date the debtor gave, as YYYY-MM-DD in their zone, or null. Never invented. */
export function parsePromiseDate(text, today) {
  const t = String(text ?? "").toLowerCase();
  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (iso) return iso[1];
  const dmy = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t); // Australian order: day/month/year
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const base = new Date(`${today}T00:00:00Z`);
  if (/\btomorrow\b/.test(t)) return new Date(base.getTime() + DAY).toISOString().slice(0, 10);
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t)) {
      let ahead = (i - base.getUTCDay() + 7) % 7;
      if (ahead === 0) ahead = 7;
      return new Date(base.getTime() + ahead * DAY).toISOString().slice(0, 10);
    }
  }
  return null;
}

/** A figure the debtor named, in cents, or null. "This week" with no number stays null. */
export function parseAmount(text) {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(String(text ?? ""));
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
}

async function onReply(ports, event) {
  const now = await ports.now();
  const customers = (await ports.readCustomers()) ?? [];
  const c = customers.find((x) => x.id === event.customerId);
  if (!c) return { outcome: "ignored" };
  const today = localDate(now, c.timezone);
  const date = parsePromiseDate(event.text, today);
  const ledger = (await ports.readLedger()) ?? [];
  const disputed = ledger.filter((i) => i.customerId === c.id && !i.paidAt && i.disputed).map((i) => i.id);

  if (!date) {
    await ports.escalate("reply_without_date", `customer ${c.id} replied with no date; owner ${POLICY.owners.reply}`);
    return { outcome: "handed_over" };
  }
  const promise = await ports.recordPromise({ customerId: c.id, date, amount: parseAmount(event.text) });
  if (!promise) {
    await ports.escalate("promise_not_recorded", `customer ${c.id}: the promise for ${date} did not read back; owner ${POLICY.owners.reply}`);
    return { outcome: "write_failed" };
  }
  // The promise sits beside the dispute; it never closes it. The dispute is a person's.
  if (disputed.length) {
    await ports.escalate("dispute_open", `customer ${c.id}: promise for ${date} recorded beside open dispute on ${disputed.join(", ")}; owner ${POLICY.owners.dispute}`);
  }
  return { outcome: "promise_recorded", date };
}

/**
 * Terms Watch: chase overdue B2B invoices on an Australian debtor book, to
 * AIP-BS-DEBTOR-CHASING (https://aipathway.com.au/explore-ai/debtor-chasing-build-standard).
 *
 * One run, woken by schedule.tick or invoice.overdue:
 *   1. read the live ledger, the customers and the promises already recorded;
 *   2. keep only invoices past their DUE date (never the issue date);
 *   3. collapse to one row per customer and sort into the four closed buckets;
 *   4. lift disputes and relationship-sized balances out of the run, each
 *      handed to a named person;
 *   5. rank: broken promise first, then amount at risk, age only breaks ties;
 *   6. ask the gate for every row at dial time, underneath the ranking;
 *   7. only a row the gate clears gets the disclosure and the opener.
 *
 * A reply (email.received) carrying a date becomes a promise object instead.
 *
 * LATE-PAYMENT INTEREST. Australia has no general statutory interest on late
 * B2B invoices, so there is no rate to look up. Terms Watch works a figure out
 * only when the invoice's own terms carry a written rate with its source, and
 * then holds that figure for a named person. It never puts interest, a fee or
 * a consequence in the opener, and with no cited rate it computes nothing.
 *
 * Everything goes through the ports. The live call itself is not built here:
 * the standard keeps it on the hosted provider, so `disclose` is the stand-in.
 */

const DAY = 86_400_000;

/** Config the business sets. Owners are named people, never a role or a queue. */
export const DEFAULT_CONFIG = {
  business: "the accounts team",
  /** Cents. A balance at or above this is a relationship decision, not a chase. */
  relationshipThreshold: 5_000_000,
  owners: {
    relationship: "Dana Whitlock",
    dispute: "Lee Tran",
    interest: "Dana Whitlock",
    promise: "Lee Tran",
    override: "Dana Whitlock",
  },
};

const BUCKET_RANK = { broken_promise: 0, hard: 1, drifting: 1, just_late: 1 };

/** Offsets, not a tz library, so the build carries no dependency. Summer time is the gate's job. */
const OFFSETS = {
  "Australia/Brisbane": 10,
  "Australia/Sydney": 10,
  "Australia/Melbourne": 10,
  "Australia/Hobart": 10,
  "Australia/Perth": 8,
  "Australia/Adelaide": 9.5,
  "Australia/Darwin": 9.5,
};

const localDate = (now, tz) => new Date(now.getTime() + (OFFSETS[tz] ?? 10) * 3600_000).toISOString().slice(0, 10);
const localDay = (now, tz) => new Date(now.getTime() + (OFFSETS[tz] ?? 10) * 3600_000).getUTCDay();
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function bucketFor(daysPastDue, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (daysPastDue >= 45) return "hard";
  if (daysPastDue >= 15) return "drifting";
  return "just_late";
}

/**
 * Interest from a rate written into the invoice's terms, and nothing else.
 * Simple interest, actual days over 365, in cents. Null when no rate is cited.
 */
export function contractualInterest(inv, now) {
  const t = inv.terms?.lateInterest;
  if (!t || typeof t.ratePa !== "number" || !(t.ratePa > 0) || !t.source) return null;
  const days = Math.floor((now.getTime() - Date.parse(inv.dueAt)) / DAY);
  if (days <= 0) return null;
  return { cents: Math.round((inv.amount * t.ratePa * days) / 365), ratePa: t.ratePa, days, source: t.source };
}

/** A date out of a reply: dd/mm/yyyy, yyyy-mm-dd, or the next named weekday. Null when none. */
export function dateFromReply(text, today) {
  const s = String(text ?? "");
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const hit = days.findIndex((d) => new RegExp(`\\b${d}\\b`, "i").test(s));
  if (hit >= 0) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const ahead = ((hit - dow + 7) % 7) || 7;
    return addDays(today, ahead);
  }
  return null;
}

const amountFromReply = (text) => {
  const m = /\$\s?([\d,]+(?:\.\d{1,2})?)/.exec(String(text ?? ""));
  return m ? Math.round(Number(m[1].replace(/,/g, "")) * 100) : null;
};

const esc = (ports, reason, detail) => ports.escalate(reason, JSON.stringify(detail));

/** A reply from the debtor: record a dated promise, or hand it to a person. Never clears a dispute. */
async function handleReply(ports, reply, cfg) {
  const now = await ports.now();
  const customers = await ports.readCustomers();
  const c = customers.find((x) => x.id === reply.customerId);
  if (!c) {
    await esc(ports, "debtor.customer_unreadable", { customerId: reply.customerId, owner: cfg.owners.promise });
    return;
  }
  const ledger = await ports.readLedger();
  const owed = ledger.filter((i) => i.customerId === c.id && !i.paidAt);
  if (/hardship|can'?t afford|lost my job|payment plan/i.test(reply.text ?? "")) {
    await esc(ports, "debtor.hardship_stated", { customerId: c.id, owner: cfg.owners.dispute });
    return;
  }
  const date = dateFromReply(reply.text, localDate(now, c.timezone));
  if (!date) {
    await esc(ports, "debtor.no_date_given", { customerId: c.id, owner: cfg.owners.promise });
    return;
  }
  const promise = await ports.recordPromise({ customerId: c.id, date, amount: amountFromReply(reply.text) });
  if (!promise) await esc(ports, "debtor.promise_write_failed", { customerId: c.id, owner: cfg.owners.promise });
  // A promise never overwrites a logged dispute: the dispute stays with its person.
  for (const inv of owed.filter((i) => i.disputed)) {
    await esc(ports, "debtor.dispute_open", { customerId: c.id, invoiceId: inv.id, owner: cfg.owners.dispute });
  }
}

/**
 * @param {import("@aipathway/conformance").DebtorWorld extends { ports(): infer P } ? P : never} ports
 * @param {{ reply?: { customerId: string, text: string }, overrides?: Array<{ customerId: string, reason: string, approver?: string }>, config?: object }} [input]
 */
export async function build(ports, input = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...(input.config ?? {}), owners: { ...DEFAULT_CONFIG.owners, ...(input.config?.owners ?? {}) } };
  if (input.reply) return handleReply(ports, input.reply, cfg);

  const now = await ports.now();
  const ledger = await ports.readLedger();
  const customers = await ports.readCustomers();
  const promises = await ports.readPromises();
  const byId = new Map(customers.map((c) => [c.id, c]));

  // Past the due date, unpaid. A long-ago issue date with a future due date is not late.
  const overdue = ledger.filter((i) => !i.paidAt && Date.parse(i.dueAt) < now.getTime());

  const groups = new Map();
  for (const inv of overdue) {
    const g = groups.get(inv.customerId) ?? { customerId: inv.customerId, invoices: [] };
    g.invoices.push(inv);
    groups.set(inv.customerId, g);
  }

  const dial = [];
  const excluded = [];
  for (const g of groups.values()) {
    const c = byId.get(g.customerId);
    const tz = c?.timezone ?? "Australia/Brisbane";
    const today = localDate(now, tz);
    const latest = promises
      .filter((p) => p.customerId === g.customerId)
      .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
    // The promised date is the follow-up date: nothing before it.
    if (latest && latest.date > today) continue;
    const broken = Boolean(latest && latest.date < today);
    const amount = g.invoices.reduce((s, i) => s + i.amount, 0);
    const days = Math.max(...g.invoices.map((i) => Math.floor((now.getTime() - Date.parse(i.dueAt)) / DAY)));
    const entry = {
      customerId: g.customerId,
      amount,
      bucket: bucketFor(days, broken),
      invoiceIds: g.invoices.map((i) => i.id),
    };
    if (c?.relationship || amount >= cfg.relationshipThreshold) {
      excluded.push({ ...entry, excludedReason: "relationship_account" });
      await esc(ports, "debtor.relationship_account", { customerId: g.customerId, amount, owner: cfg.owners.relationship });
      continue;
    }
    const disputed = g.invoices.filter((i) => i.disputed);
    if (disputed.length) {
      excluded.push({ ...entry, excludedReason: "dispute_open" });
      await esc(ports, "debtor.dispute_open", { customerId: g.customerId, invoiceIds: disputed.map((i) => i.id), owner: cfg.owners.dispute });
      continue;
    }
    dial.push({ entry, days, invoices: g.invoices, customer: c });
  }

  dial.sort(
    (a, b) =>
      BUCKET_RANK[a.entry.bucket] - BUCKET_RANK[b.entry.bucket] || b.entry.amount - a.entry.amount || b.days - a.days,
  );
  await ports.rank([...dial.map((d) => d.entry), ...excluded]);

  const overrides = new Map((input.overrides ?? []).map((o) => [o.customerId, o]));
  for (const d of dial) {
    const id = d.entry.customerId;
    // Interest is a person's call. Worked out only from a rate the terms cite.
    for (const inv of d.invoices) {
      const i = contractualInterest(inv, now);
      if (i) await esc(ports, "debtor.interest_held_for_person", { customerId: id, invoiceId: inv.id, ...i, owner: cfg.owners.interest });
    }

    const decision = await ports.gate(id);
    let cleared = decision.allowed === true;
    if (cleared && localDay(now, d.customer?.timezone) === 0) cleared = false; // no Sundays
    if (!cleared) {
      const o = overrides.get(id);
      // A paid row is never overridden, whoever signs.
      if (o && decision.reason !== "already_paid") {
        const ok = await ports.override({ customerId: id, reason: o.reason, ...(o.approver ? { approver: o.approver } : {}) });
        if (!ok) {
          await esc(ports, "debtor.override_refused", { customerId: id, why: "no named approver", owner: cfg.owners.override });
          continue;
        }
        cleared = true;
      }
    }
    if (!cleared) continue;

    const refs = d.invoices.map((i) => i.id).join(", ");
    await ports.disclose(
      id,
      `Hi, this is an AI assistant calling for ${cfg.business}. ` +
        `It's about invoice${d.invoices.length > 1 ? "s" : ""} ${refs}, ${money(d.entry.amount)} in total, ` +
        `${d.days} days past the due date. When can we expect payment?`,
    );
  }
}

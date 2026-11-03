/**
 * Payment Watch: the debtor chasing job for a freelancer or small B2B firm,
 * built to AIP-BS-DEBTOR-CHASING 2026-10-06.
 * https://aipathway.com.au/explore-ai/debtor-chasing-build-standard
 *
 * Reimplemented from the standard and from a public listing's one-line
 * description only. Nothing here is taken from any other bot's prompt,
 * instructions or workflow.
 *
 * WHAT IT DOES. It keeps track of what each client owes off the ledger, reads
 * every client reply on a reminder thread by the invoice id that thread carries,
 * and drafts one calm reminder per client for the owner to say yes to. It never
 * sends, never dials and never speaks to a client.
 *
 * THE ONE THING IT IS FOR. A reminder must never chase an invoice that is paid.
 * So payment is watched twice before any draft:
 *
 *   - the ledger: the run reads the live book, and the gate (a port, not a
 *     helper) re-checks the ledger for every row underneath the ranking, so a
 *     payment applied after the read still stops the draft;
 *   - the inbox: a client who replies "paid this morning" has not paid until
 *     the ledger says so, but they are not chased either. Their draft is held
 *     and the owner is asked to check the bank feed and apply it. A remittance
 *     email is evidence, never a payment.
 *
 * WHAT WAKES IT (one run per wake, nothing kept between runs):
 *
 *   schedule.tick     work the whole book, read fresh off the ledger
 *   invoice.overdue   the same: the client is reranked with the whole book
 *   email.received    a client replied on a reminder thread; read by its
 *                     invoice id, never by sender name or address
 *   exception.closed  the owner approved an exception to a gate hold
 *
 * THE RUN, in the standard's order (section 12):
 *
 *   1. Read the ledger, the clients and the promises already captured.
 *   2. Work the replies: a dated promise is recorded; a payment claim, a
 *      dispute, hardship or a reply with no date goes to the owner.
 *   3. Keep only invoices past their DUE date, in the client's own zone.
 *   4. Bucket: just late, drifting, hard, broken promise.
 *   5. Collapse to one row per client, summing what they owe.
 *   6. Lift out: a dispute, a relationship-sized balance, a payment claimed
 *      but not yet applied. A client whose promised date has not come is not
 *      in the run at all.
 *   7. Rank: broken promise first, then amount at risk; age only breaks ties.
 *   8. Submit the ranking, then ask the gate about every row underneath it.
 *      Only a row the gate clears becomes a draft for the owner's yes.
 */

const DAY = 86_400_000;

/** The owner's credit policy. A person sets these; the build only reads them. */
export const DEFAULT_POLICY = {
  /** Above this, in cents, chasing the client is a relationship decision. A$25,000. */
  relationshipCents: 2_500_000,
  /** The named person who owns receivables. For a freelancer, the freelancer. */
  owner: "Sam Okafor (owner, receivables)",
  /** The client's zone when the client record does not say. */
  defaultZone: "Australia/Brisbane",
};

/** The four buckets, closed. Days are off the due date. */
export function bucketFor(daysPastDue, brokenPromise) {
  if (brokenPromise) return "broken_promise";
  if (daysPastDue <= 14) return "just_late";
  if (daysPastDue <= 44) return "drifting";
  return "hard";
}

/** YYYY-MM-DD in the client's own zone. */
export function localDate(now, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const dayNumber = (ymd) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY);

const aud = (cents) =>
  `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The draft. Calm, factual, one question that takes a date. No fees, no threats. */
export function draftReminder(entry, client, rows) {
  const lines = rows.map((r) => `${r.id}: ${aud(r.amount)}, ${r.days} days past its due date`);
  const opener =
    entry.bucket === "broken_promise"
      ? `Hi ${client.name}, you mentioned payment by ${entry.promiseDate}, and I can't see it yet.`
      : `Hi ${client.name}, a quick note on what is still open.`;
  return [
    opener,
    ...lines,
    `Total ${aud(entry.amount)}.`,
    "When can I expect payment?",
    "If something on these is not right, reply and tell me, and I will look at it before anything else.",
  ].join("\n");
}

/**
 * @param {import("@aipathway/conformance").DebtorPorts} ports
 * @param {{ replies?: Array<{ messageId: string, invoiceId: string, kind: string, date?: string, amount?: number | null }>,
 *           overrides?: Array<{ customerId: string, reason: string, approver?: string }>,
 *           policy?: Partial<typeof DEFAULT_POLICY> }} [wake]
 */
export async function build(ports, wake = {}) {
  const policy = { ...DEFAULT_POLICY, ...(wake.policy ?? {}) };
  const now = ports.now();

  // 1. The live book. Nothing carried over from an earlier run.
  const invoices = await ports.readLedger();
  const clients = await ports.readCustomers();
  const promises = [...(await ports.readPromises())];

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const zoneOf = (customerId) => clientById.get(customerId)?.timezone ?? policy.defaultZone;
  const todayOf = (customerId) => localDate(now, zoneOf(customerId));

  /** Clients lifted out of this run, with the reason. */
  const liftedOut = new Map();

  // 2. Replies, each read by the invoice id its thread carries.
  for (const reply of wake.replies ?? []) {
    const invoice = invoices.find((i) => i.id === reply.invoiceId);
    if (!invoice) {
      await ports.escalate("debtor.reply_unmatched", `${reply.messageId}: no invoice ${reply.invoiceId} on the ledger. Owner: ${policy.owner}`);
      continue;
    }
    const customerId = invoice.customerId;
    if (invoice.paidAt) continue; // The ledger already shows it paid: nothing to do, and nothing to chase.

    if (reply.kind === "paid_claim") {
      liftedOut.set(customerId, "payment_claimed_unapplied");
      await ports.escalate(
        "debtor.payment_claimed_unapplied",
        `${customerId} says ${invoice.id} is paid (${reply.messageId}); the ledger shows it open. Check the bank feed and apply it. No reminder until then. Owner: ${policy.owner}`,
      );
    } else if (reply.kind === "promise" && reply.date) {
      const recorded = await ports.recordPromise({ customerId, date: reply.date, amount: reply.amount ?? null });
      if (!recorded) {
        await ports.escalate("debtor.promise_write_failed", `${invoice.id} promise ${reply.date} did not write. Owner: ${policy.owner}`);
      } else {
        promises.push(recorded);
      }
    } else if (reply.kind === "promise") {
      await ports.escalate("debtor.reply_without_date", `${reply.messageId} on ${invoice.id}: a promise with no date. Owner: ${policy.owner}`);
    } else if (reply.kind === "dispute") {
      liftedOut.set(customerId, "dispute_named");
      await ports.escalate("debtor.dispute_named", `${reply.messageId} on ${invoice.id}. Owner: ${policy.owner}`);
    } else if (reply.kind === "hardship") {
      liftedOut.set(customerId, "hardship");
      await ports.escalate("debtor.hardship", `${reply.messageId} on ${invoice.id}. Owner: ${policy.owner}`);
    } else {
      await ports.escalate("debtor.reply_needs_person", `${reply.messageId} on ${invoice.id}. Owner: ${policy.owner}`);
    }
  }

  // The latest promise per client decides whether they are waiting or broken.
  const latestPromise = new Map();
  for (const p of promises) {
    const prior = latestPromise.get(p.customerId);
    if (!prior || p.capturedAt > prior.capturedAt) latestPromise.set(p.customerId, p);
  }

  // 3. Past the DUE date, in the client's zone, and unpaid.
  const overdue = [];
  for (const inv of invoices) {
    if (inv.paidAt) continue;
    const today = todayOf(inv.customerId);
    const days = dayNumber(today) - dayNumber(inv.dueAt.slice(0, 10));
    if (days <= 0) continue;
    overdue.push({ ...inv, days });
  }

  // 4 and 5. Bucket, then one row per client.
  const byClient = new Map();
  for (const row of overdue) {
    const list = byClient.get(row.customerId) ?? [];
    list.push(row);
    byClient.set(row.customerId, list);
  }

  const dialable = [];
  const excluded = [];
  const rowsFor = new Map();
  for (const [customerId, rows] of byClient) {
    const client = clientById.get(customerId) ?? { id: customerId, name: customerId };
    const today = todayOf(customerId);
    const promise = latestPromise.get(customerId);

    // A promised date that has not come: not in the run at all. Check 9.
    if (promise && promise.date >= today) continue;

    const broken = Boolean(promise && promise.date < today);
    const maxDays = Math.max(...rows.map((r) => r.days));
    const amount = rows.reduce((s, r) => s + r.amount, 0);
    const entry = {
      customerId,
      amount,
      bucket: bucketFor(maxDays, broken),
      invoiceIds: rows.map((r) => r.id),
    };
    rowsFor.set(customerId, { rows, maxDays, client, promiseDate: promise?.date });

    // 6. Lift out what a person decides.
    let reason = liftedOut.get(customerId);
    if (!reason && rows.some((r) => r.disputed)) reason = "dispute_open";
    if (!reason && (client.relationship || amount > policy.relationshipCents)) reason = "relationship_account";
    if (reason) {
      excluded.push({ ...entry, excludedReason: reason });
      if (reason === "dispute_open" || reason === "relationship_account") {
        await ports.escalate(
          `debtor.${reason}`,
          `${customerId}: ${aud(amount)} across ${entry.invoiceIds.join(", ")}. Not chased. Owner: ${policy.owner}`,
        );
      }
      continue;
    }
    dialable.push(entry);
  }

  // 7. Broken promise first, then amount at risk, then age breaks a tie.
  dialable.sort((a, b) => {
    const pa = a.bucket === "broken_promise" ? 0 : 1;
    const pb = b.bucket === "broken_promise" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return rowsFor.get(b.customerId).maxDays - rowsFor.get(a.customerId).maxDays;
  });

  // 8. Submit the ranking, then the gate underneath it, row by row.
  await ports.rank([...dialable, ...excluded]);

  const overrideFor = new Map();
  for (const o of wake.overrides ?? []) overrideFor.set(o.customerId, o);

  for (const entry of dialable) {
    const decision = await ports.gate(entry.customerId);
    let cleared = decision.allowed;
    let note = "";
    if (!cleared) {
      const o = overrideFor.get(entry.customerId);
      // Only a hold a person can lawfully lift. A paid invoice is never overridden.
      if (o && decision.reason !== "already_paid") {
        const accepted = await ports.override({ customerId: entry.customerId, reason: o.reason, approver: o.approver });
        if (accepted) {
          cleared = true;
          note = ` Released early on ${o.approver}'s authority: ${o.reason}.`;
        } else {
          await ports.escalate("debtor.override_refused", `${entry.customerId}: an override with no named approver. Held: ${decision.reason}.`);
        }
      }
    }
    if (!cleared) continue; // Held with the gate's reason, whatever the score.

    const { rows, client, promiseDate } = rowsFor.get(entry.customerId);
    const draft = draftReminder({ ...entry, promiseDate }, client, rows);
    await ports.escalate(
      "debtor.reminder_ready_for_release",
      `${entry.customerId} [${entry.bucket}] ${entry.invoiceIds.join(", ")}. Draft for ${policy.owner} to say yes to:${note}\n${draft}`,
    );
  }
}

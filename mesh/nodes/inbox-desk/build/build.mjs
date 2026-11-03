/**
 * Inbox Desk: the build, to AIP-BS-INBOX-TRIAGE 2026-10-03.
 *
 * Written from the standard alone
 * (https://aipathway.com.au/explore-ai/inbox-triage-build-standard). It is a
 * reimplementation of the job the public "Inbox Triage" bot by Cristopher
 * Guido describes in one line (a weekday email assistant for small business
 * owners and freelancers); nothing of that bot's prompt or instructions is in
 * here.
 *
 * One run, the same every time it is woken (email.received, a weekday
 * schedule.tick, or exception.closed when a person releases a reply), keeping
 * nothing between runs:
 *
 *   1. Read the queue table, the records, the new messages.
 *   2. Each message gets exactly one kind off the closed list.
 *   3. Read whether its thread already has an item. A follow-up joins that
 *      item; it never raises a second one.
 *   4. File it: against the job or supplier record by id, spam to quarantine
 *      with its hash, nothing to a folder, nothing to trash. A message that
 *      matches no record stays unfiled and becomes a task a person reads.
 *   5. A supplier invoice's attachments are filed as evidence on the supplier
 *      record, with their hash and the message id.
 *   6. The item takes its queue's owner and a due date from the kind's clock.
 *   7. A complaint is escalated whole to a named person. Nothing is sent.
 *      Anything else new gets the one automatic outbound: an acknowledgement
 *      carrying the due date, with no free text.
 *   8. Releases a person has made are recorded, then exactly the released
 *      words are sent. Never on a complaint. Never twice.
 *   9. Any open item past its clock is escalated to its queue's manager.
 *
 * Every write goes through the ports. There is no port that writes reply
 * words, and this build has no code that composes one.
 */

export const KINDS = Object.freeze([
  "supplier_invoice",
  "quote_request",
  "job_update",
  "statement",
  "complaint",
  "remittance",
  "spam",
  "other",
]);

const HOUR = 3_600_000;

/**
 * The classifier. The standard leaves its quality to the builder and says the
 * stub cannot prove it; what it requires is that the answer is one kind off
 * the list. This one is plain keyword rules, checked in an order where the
 * kind a person must not miss (a complaint) wins over the ordinary ones. It
 * can only ever return a member of KINDS, and "other" when it does not know.
 */
export function classifyMessage(message) {
  const text = `${message.subject ?? ""}`.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));
  const hasAttachment = (message.attachments ?? []).length > 0;

  if (has("unsubscribe", "you have won", "winner", "crypto", "click here", "limited offer", "seo services")) return { kind: "spam", confidence: 0.8 };
  if (has("complaint", "not happy", "unhappy", "disappointed", "unacceptable", "poor workmanship")) return { kind: "complaint", confidence: 0.75 };
  if (has("remittance", "payment advice", "eft advice")) return { kind: "remittance", confidence: 0.8 };
  if (has("statement")) return { kind: "statement", confidence: 0.8 };
  if (has("tax invoice", "invoice") && hasAttachment) return { kind: "supplier_invoice", confidence: 0.8 };
  if (has("quote", "quotation", "how much", "price for")) return { kind: "quote_request", confidence: 0.7 };
  if (has("job ", "job:", "update", "gate code", "access", "running late", "site")) return { kind: "job_update", confidence: 0.6 };
  return { kind: "other", confidence: 0.3 };
}

/** The record a message is about, by the record's own id, or null. */
function matchRecord(message, records) {
  const subject = (message.subject ?? "").toLowerCase();
  const domain = (message.from ?? "").split("@")[1]?.toLowerCase() ?? "";
  const hit = records.find(
    (r) =>
      (r.match?.subjectContains && subject.includes(r.match.subjectContains.toLowerCase())) ||
      (r.match?.fromDomain && domain === r.match.fromDomain.toLowerCase()),
  );
  return hit ? hit.ref : null;
}

/**
 * @param {import("@aipathway/conformance").InboxPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const queues = await ports.readQueues();
  const records = await ports.readRecords();
  const queueFor = (kind) => queues.find((q) => q.kind === kind) ?? queues.find((q) => q.kind === "other");
  const dueFrom = (queue) => new Date(now.getTime() + queue.clockHours * HOUR).toISOString();

  // ── New mail ──────────────────────────────────────────────────────────────
  for (const message of await ports.readInbox()) {
    const existing = await ports.readItemForThread(message.thread_id);

    let { kind, confidence } = classifyMessage(message);
    // A follow-up the rules cannot place is still part of its conversation.
    if (kind === "other" && existing && KINDS.includes(existing.kind)) {
      kind = existing.kind;
      confidence = 0.5;
    }
    await ports.classify(message.id, kind, confidence);

    // The filing. One thread is one record: a follow-up lands where the thread
    // already lives, even when its own subject no longer names the job.
    const recordRef = kind === "spam" || kind === "other" ? null : (existing?.record_ref ?? matchRecord(message, records));
    if (kind === "spam") {
      await ports.fileMessage(message.id, { to: "quarantine", hash: message.hash });
    } else if (recordRef) {
      await ports.fileMessage(message.id, { to: "record", recordRef });
    }
    // Otherwise unfiled on purpose: it becomes a task for a person below.

    // The artefact the Invoice Check standard reads next.
    if (kind === "supplier_invoice" && recordRef?.startsWith("supplier:")) {
      for (const a of message.attachments ?? []) {
        await ports.attachEvidence({ hash: a.hash, messageId: message.id, recordRef });
      }
    }

    // The item. Raised once per thread; a follow-up is added to it.
    const queue = queueFor(kind);
    if (existing) {
      const item = await ports.raiseTask({
        itemId: existing.id,
        messageId: message.id,
        threadId: message.thread_id,
        kind: existing.kind,
        recordRef: existing.record_ref,
        owner: existing.owner,
        due: existing.due,
      });
      // A complaint arriving on an ordinary thread takes the thread to a person.
      if (kind === "complaint" && item.status !== "escalated") {
        await ports.escalate({ itemId: item.id, to: queue.owner, reason: "complaint", message });
      }
      continue; // the thread was acknowledged when its item was raised
    }

    const item = await ports.raiseTask({
      messageId: message.id,
      threadId: message.thread_id,
      kind,
      recordRef,
      owner: queue.owner,
      due: dueFrom(queue),
      ...(kind === "spam" ? { status: "quarantined" } : {}),
    });

    if (kind === "complaint") {
      // Whole, to a named person. No acknowledgement, no reply, no summary.
      await ports.escalate({ itemId: item.id, to: queue.owner, reason: "complaint", message });
    } else if (kind !== "spam") {
      // The only automatic outbound: a person will reply, by the item's due date.
      await ports.acknowledge(item.id, item.due);
    }

    // A write counts only when it reads back.
    const back = await ports.readRecord(message.id);
    if (!back?.item) {
      const other = queueFor("other");
      await ports.escalate({ itemId: item.id, to: other.owner, reason: "other", message });
    }
  }

  // ── Releases a person has made ───────────────────────────────────────────
  for (const approval of await ports.readApprovals()) {
    const item = await ports.readItemForThread(approval.thread_id);
    if (!item || item.kind === "complaint" || item.status === "quarantined") continue;
    const rec = await ports.readRecord(item.message_ids[0]);
    if (rec?.outbound.some((o) => o.kind === "reply")) continue; // already sent: never twice
    if (!approval.person || !approval.body) continue;
    await ports.release(item.id, approval.person);
    await ports.reply(item.id, approval.body); // exactly the released words
  }

  // ── The clock ────────────────────────────────────────────────────────────
  for (const item of await ports.readItems()) {
    if (item.status !== "open") continue; // escalated already has a person
    if (new Date(item.due).getTime() >= now.getTime()) continue;
    const queue = queueFor(item.kind);
    await ports.escalate({ itemId: item.id, to: queue.manager, reason: "past_clock" });
  }
}

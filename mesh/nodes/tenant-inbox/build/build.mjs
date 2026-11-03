/**
 * Tenant Inbox: the build, to AIP-BS-INBOX-TRIAGE 2026-10-03.
 *
 * The shared inbox of an Australian property management office: tenants,
 * landlords, tradies and the trust accounting mail that lands in one mailbox.
 * Written from the standard alone
 * (https://aipathway.com.au/explore-ai/inbox-triage-build-standard). It
 * reimplements the job a public tenant-complaint triage workflow describes in
 * one line (classify tenant complaints, route them, log each one); nothing of
 * that workflow's prompt, instructions or workflow file is in here.
 *
 * Where a trade files against a job or a supplier, a property office files
 * against the record its property management system already holds:
 *
 *   tenancy:<tenancy_id>   the tenancy the tenant's or landlord's mail is about
 *   job:<work order id>    a maintenance work order on the property system
 *   supplier:<creditor id> a tradie or supplier held as a creditor
 *
 * One run, the same every time it is woken (email.received, a weekday
 * schedule.tick, or exception.closed when a person releases a reply), keeping
 * nothing between runs:
 *
 *   1. Read the queue table, the records, the new messages.
 *   2. Each message gets exactly one kind off the standard's closed list.
 *   3. Read whether its thread already has an item. A follow-up joins that
 *      item and its record; it never raises a second one.
 *   4. File it against the tenancy, work order or creditor by that record's
 *      own id. Spam goes to quarantine with its hash. Nothing goes to a
 *      folder, nothing to trash. A message that matches no record stays
 *      unfiled and becomes a task the property manager reads.
 *   5. A tradie's invoice has its attachments filed as evidence on the
 *      creditor record, with their hash and the message id.
 *   6. The item takes its queue's owner and a due date from the kind's clock.
 *   7. A tenant complaint is handed whole to the named owner of the complaint
 *      queue and nothing is sent to the tenant, not even an acknowledgement.
 *      Anything else new gets the one automatic outbound: an acknowledgement
 *      carrying the due date and no free text.
 *   8. Releases a person has made are recorded first, then exactly the
 *      released words are sent. Never on a complaint. Never twice.
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
 * The classifier. Plain keyword rules on the subject, in an order where the
 * kind a person must not miss (a tenant complaint) wins over the ordinary
 * ones, and spam is only called on clear signs. It can only return a member
 * of KINDS, and "other" when it does not know. Its quality is the builder's
 * problem, as the standard says; its shape is what conforms.
 */
export function classifyMessage(message) {
  const text = `${message.subject ?? ""}`.toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));
  const hasAttachment = (message.attachments ?? []).length > 0;

  if (has("winner", "click here", "crypto", "claim now", "free seo", "you have won", "guaranteed returns")) return "spam";
  if (
    has(
      "complaint",
      "not happy",
      "unhappy",
      "unacceptable",
      "disappointed",
      "still not fixed",
      "still broken",
      "noise",
      "nobody has",
      "fed up",
    )
  )
    return "complaint";
  if (has("remittance", "payment advice", "eft confirmation")) return "remittance";
  if (has("statement")) return "statement";
  if (has("tax invoice", "invoice") && hasAttachment) return "supplier_invoice";
  if (has("quote", "appraisal", "management fee")) return "quote_request";
  if (has("update", "attended", "access", "keys", "entry", "re:", "booked in", "completed")) return "job_update";
  return "other";
}

/**
 * The record a message is about, by the record's own reference in the mail.
 * Creditor mail (invoices, statements) files to the creditor by its sending
 * domain first, so a tradie's invoice quoting a work order still lands on the
 * creditor where the bill check reads it; everything else prefers the tenancy
 * or work order reference in the subject.
 */
function matchRecord(message, records, kind) {
  const subject = `${message.subject ?? ""}`.toLowerCase();
  const domain = `${message.from ?? ""}`.split("@")[1]?.toLowerCase() ?? "";
  const byRef = records.find((r) => r.match?.subjectContains && subject.includes(r.match.subjectContains.toLowerCase()));
  const byDomain = records.find((r) => r.match?.fromDomain && domain === r.match.fromDomain.toLowerCase());
  const creditorFirst = kind === "supplier_invoice" || kind === "statement";
  return (creditorFirst ? (byDomain ?? byRef) : (byRef ?? byDomain))?.ref ?? null;
}

const NO_RECORD_KINDS = new Set(["spam", "other"]);

/**
 * @param {import("@aipathway/conformance").InboxPorts} ports
 */
export async function build(ports) {
  const queues = await ports.readQueues();
  const records = await ports.readRecords();
  const queueFor = (kind) => queues.find((q) => q.kind === kind);

  // 1 to 7: every message nobody has classified yet.
  for (const message of await ports.readInbox()) {
    const kind = classifyMessage(message);
    await ports.classify(message.id, kind, kind === "other" ? 0.4 : 0.8);

    const existing = await ports.readItemForThread(message.thread_id);
    const recordRef = NO_RECORD_KINDS.has(kind) ? null : (existing?.record_ref ?? matchRecord(message, records, kind));

    if (existing) {
      // A follow-up joins its thread's item and lands on the same record.
      if (recordRef) await ports.fileMessage(message.id, { to: "record", recordRef });
      else if (kind === "spam") await ports.fileMessage(message.id, { to: "quarantine", hash: message.hash });
      await ports.raiseTask({
        itemId: existing.id,
        messageId: message.id,
        threadId: message.thread_id,
        kind: existing.kind,
        recordRef: existing.record_ref,
        owner: existing.owner,
        due: existing.due,
      });
      // A complaint thread stays with its person, untouched.
      if (existing.kind === "complaint") {
        const owner = queueFor("complaint")?.owner ?? existing.owner;
        await ports.escalate({ itemId: existing.id, to: owner, reason: "complaint", message });
      }
      continue;
    }

    const queue = queueFor(kind) ?? queueFor("other");
    if (!queue) continue; // No queue table at all: nothing to own it, so nothing is raised. A person sets the table.
    const due = new Date(ports.now().getTime() + queue.clockHours * HOUR).toISOString();

    if (kind === "spam") {
      await ports.fileMessage(message.id, { to: "quarantine", hash: message.hash });
      await ports.raiseTask({ messageId: message.id, threadId: message.thread_id, kind, recordRef: null, owner: queue.owner, due, status: "quarantined" });
      continue;
    }

    if (recordRef) await ports.fileMessage(message.id, { to: "record", recordRef });

    if (kind === "supplier_invoice" && recordRef?.startsWith("supplier:")) {
      for (const a of message.attachments ?? []) await ports.attachEvidence({ hash: a.hash, messageId: message.id, recordRef });
    }

    const item = await ports.raiseTask({ messageId: message.id, threadId: message.thread_id, kind, recordRef, owner: queue.owner, due });

    if (kind === "complaint") {
      await ports.escalate({ itemId: item.id, to: queue.owner, reason: "complaint", message });
      continue;
    }
    await ports.acknowledge(item.id, item.due);
  }

  // 8: releases. The release is recorded, then exactly those words are sent.
  for (const approval of await ports.readApprovals()) {
    const item = await ports.readItemForThread(approval.thread_id);
    if (!item || item.kind === "complaint" || item.status !== "open") continue;
    const rec = await ports.readRecord(item.message_ids[0]);
    if (rec?.outbound.some((o) => o.kind === "reply")) continue;
    await ports.release(item.id, approval.person);
    await ports.reply(item.id, approval.body);
  }

  // 9: the clock belongs to the kind. Past it, the owner's manager hears.
  const now = ports.now().getTime();
  for (const item of await ports.readItems()) {
    if (item.status !== "open") continue;
    if (new Date(item.due).getTime() >= now) continue;
    const queue = queueFor(item.kind) ?? queueFor("other");
    if (!queue) continue;
    await ports.escalate({ itemId: item.id, to: queue.manager, reason: "past_clock" });
  }
}

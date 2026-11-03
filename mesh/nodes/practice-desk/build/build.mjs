/**
 * Practice Desk: the front door of a small tax or accounting practice, built to
 * AIP-BS-INBOX-TRIAGE 2026-10-03
 * (https://aipathway.com.au/explore-ai/inbox-triage-build-standard).
 *
 * The practice's shared inbox is where client documents, client requests,
 * supplier bills to the practice, statements, remittances, complaints and spam
 * all land. Each run:
 *
 *   1. reads every unclassified message and gives it exactly one kind off the
 *      closed list;
 *   2. finds the record it is about by that record's own reference: the client
 *      engagement (a job in the practice manager, e.g. "job:XPM-…") or a
 *      supplier in the ledger, and files the message against it, never into a
 *      folder;
 *   3. files every supplier-invoice attachment as evidence, by hash and
 *      message id, on the supplier record;
 *   4. raises one item per thread in the queue for its kind, with the queue's
 *      named owner and a due date from the kind's clock; a follow-up in the
 *      thread is added to the item that already exists;
 *   5. hands a complaint whole to the queue owner and sends nothing;
 *   6. sends nothing on its own except an acknowledgement with a promised time.
 *      A reply the owner drafted goes out only after a release event names the
 *      person who approved those exact words;
 *   7. escalates any open item past its clock to the queue's manager;
 *   8. quarantines spam with its hash. It never deletes a message.
 *
 * It does not prepare, sign or lodge anything. The owner sends, signs and
 * files. Everything here goes through the ports it is handed.
 */

const HOUR = 3_600_000;

/** The closed list. Nothing outside it is ever written as a kind. */
export const KINDS = ["supplier_invoice", "quote_request", "job_update", "statement", "complaint", "remittance", "spam", "other"];

/** Kinds where a client is owed a person's answer, so an acknowledgement is useful. */
const ACKNOWLEDGED = new Set(["quote_request", "job_update", "other"]);

/**
 * A deliberately plain keyword classifier for a practice inbox. The standard
 * says classification quality is the builder's problem and the stub cannot
 * prove it; what matters is that the answer is one kind off the list, and that
 * a wrong answer still lands in a queue a person reads. Order matters: the
 * complaint and spam tests come first so neither is mistaken for routine mail.
 */
export function classify(message) {
  const text = `${message.subject ?? ""} ${message.body_ref ?? ""}`.toLowerCase();
  const has = (re) => re.test(text);
  if (has(/\b(complain|complaint|unhappy|not happy|disappointed|unacceptable|wrong again|refund)\b/)) return { kind: "complaint", confidence: 0.8 };
  if (has(/\b(win|winner|prize|crypto|lottery|unsubscribe|viagra|click here|limited offer|seo services)\b/)) return { kind: "spam", confidence: 0.9 };
  if (has(/\b(remittance|payment advice|we have paid|payment sent)\b/)) return { kind: "remittance", confidence: 0.8 };
  if (has(/\bstatement\b/) && !has(/\b(bank statements?|my statements?|financial statements?)\b/)) return { kind: "statement", confidence: 0.75 };
  if (has(/\b(tax invoice|invoice|bill)\b/) && !has(/\b(our invoice from you|your invoice)\b/)) return { kind: "supplier_invoice", confidence: 0.8 };
  if (has(/\b(quote|quotation|fee estimate|how much|engage you|new client|take us on)\b/)) return { kind: "quote_request", confidence: 0.75 };
  if (has(/\b(job|return|bas|payg|receipts?|documents?|attached|payslips?|bank statements?|update|lodg|signed|engagement)\b/)) return { kind: "job_update", confidence: 0.7 };
  return { kind: "other", confidence: 0.4 };
}

/** The record a message is about, by the record's own reference. Null when nothing matches. */
function matchRecord(message, records) {
  const subject = (message.subject ?? "").toLowerCase();
  const domain = String(message.from ?? "").split("@")[1]?.toLowerCase() ?? "";
  // A job reference quoted in the subject is the strongest match: it is the record's own id.
  const byRef = records.find((r) => r.match?.subjectContains && subject.includes(r.match.subjectContains.toLowerCase()));
  if (byRef) return byRef.ref;
  const byDomain = records.find((r) => r.match?.fromDomain && domain === r.match.fromDomain.toLowerCase());
  return byDomain ? byDomain.ref : null;
}

/**
 * @param {import("@aipathway/conformance").InboxPorts} ports
 */
export async function build(ports) {
  const queues = await ports.readQueues();
  const queueFor = (kind) => queues.find((q) => q.kind === kind) ?? null;
  const fallback = queueFor("other");
  const records = await ports.readRecords();

  // 1-6. Intake: every message the mailbox has not yet classified.
  const inbox = await ports.readInbox();
  for (const message of inbox) {
    const { kind, confidence } = classify(message);
    if (!KINDS.includes(kind)) throw new Error(`classifier produced "${kind}", which is not on the list`);
    await ports.classify(message.id, kind, confidence);

    const existing = await ports.readItemForThread(message.thread_id);
    const now = await ports.now();

    if (kind === "spam") {
      await ports.fileMessage(message.id, { to: "quarantine", hash: message.hash });
      const q = queueFor("spam") ?? fallback;
      if (existing) {
        await ports.raiseTask({ itemId: existing.id, messageId: message.id, threadId: message.thread_id, kind, recordRef: existing.record_ref, owner: existing.owner, due: existing.due });
      } else {
        await ports.raiseTask({
          messageId: message.id,
          threadId: message.thread_id,
          kind,
          recordRef: null,
          owner: q.owner,
          due: new Date(now.getTime() + q.clockHours * HOUR).toISOString(),
          status: "quarantined",
        });
      }
      continue;
    }

    // A follow-up stays on the record its thread was already filed to.
    const recordRef = existing?.record_ref ?? (kind === "other" ? null : matchRecord(message, records));
    if (recordRef) await ports.fileMessage(message.id, { to: "record", recordRef });

    if (kind === "supplier_invoice" && recordRef) {
      for (const a of message.attachments ?? []) {
        await ports.attachEvidence({ hash: a.hash, messageId: message.id, recordRef });
      }
    }

    if (existing) {
      // One thread, one item. A follow-up joins the item; it is never raised beside it.
      await ports.raiseTask({ itemId: existing.id, messageId: message.id, threadId: message.thread_id, kind: existing.kind, recordRef: existing.record_ref, owner: existing.owner, due: existing.due });
      continue;
    }

    const q = queueFor(kind);
    const owningQueue = q ?? fallback;
    if (!owningQueue) throw new Error("no queue table: the practice must name an owner for at least the other queue");
    const item = await ports.raiseTask({
      messageId: message.id,
      threadId: message.thread_id,
      kind,
      recordRef: recordRef ?? null,
      owner: owningQueue.owner,
      due: new Date(now.getTime() + owningQueue.clockHours * HOUR).toISOString(),
    });

    if (kind === "complaint") {
      // Handed whole to a named person. Nothing goes to the client, not even an acknowledgement.
      await ports.escalate({ itemId: item.id, to: owningQueue.owner, reason: "complaint", message });
      continue;
    }
    if (!q) {
      await ports.escalate({ itemId: item.id, to: owningQueue.owner, reason: "no_queue", message });
      continue;
    }
    if (ACKNOWLEDGED.has(kind)) await ports.acknowledge(item.id, item.due);
  }

  // 6. Replies the owner wrote: release, then send exactly those words.
  const approvals = await ports.readApprovals();
  let open = await ports.readItems();
  for (const item of open) {
    if (item.status !== "open" || item.kind === "complaint") continue;
    const approval = approvals.find((a) => a.thread_id === item.thread_id && a.person && a.body);
    if (!approval) continue;
    await ports.release(item.id, approval.person);
    await ports.reply(item.id, approval.body);
  }

  // 7. The clock is on the kind. An open item past it goes to the queue's manager.
  const now = await ports.now();
  open = await ports.readItems();
  for (const item of open) {
    if (item.status !== "open") continue;
    if (new Date(item.due).getTime() >= now.getTime()) continue;
    const q = queueFor(item.kind) ?? fallback;
    await ports.escalate({ itemId: item.id, to: q.manager, reason: "past_clock" });
  }
}

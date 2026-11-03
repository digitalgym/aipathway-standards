/**
 * Lead Sort: the trade office's shared inbox, sorted.
 *
 * Built to AIP-BS-INBOX-TRIAGE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/inbox-triage-build-standard
 *
 * What lands in a plumber's, sparky's or builder's office inbox: voicemail
 * notifications from the phone system, website enquiry-form emails, customers
 * writing about a job already booked, supplier invoices and statements,
 * remittances, the odd complaint, and a lot of spam. Each one gets one kind off
 * the standard's closed list, is filed against the job or supplier by the
 * record's own id, and lands in a queue with a named owner and a clock. A new
 * lead with no job yet is a quote request held as an unfiled task for the
 * office to book.
 *
 * The machine sends one thing on its own: an acknowledgement with the time a
 * person will reply by. A reply with a price, a date or a decision leaves only
 * after a named person released those words, and goes out exactly as
 * released. A complaint gets nothing at all; it goes whole to a person.
 *
 * Every write goes through the ports. Nothing here keeps state between runs:
 * the item, the filing and the release live on the record.
 */

const KINDS = new Set([
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
 * The classifier. The standard says plainly that classification quality is
 * the builder's problem and a stub cannot prove it; what matters is that the
 * answer is one kind off the list. Rules run in order and the first match
 * wins, so a message never gets two kinds. Anything unrecognised is "other",
 * the queue the office reads most carefully.
 */
export function classify(message, records) {
  const text = `${message.subject}\n${message.body_ref}`.toLowerCase();
  const domain = (message.from.split("@")[1] ?? "").toLowerCase();
  const isSupplier = records.some((r) => r.kind === "supplier" && r.match.fromDomain && r.match.fromDomain.toLowerCase() === domain);

  if (/\b(seo|backlinks?|guest post|crypto|ranking on google|limited offer|unsubscribe)\b/.test(text)) return "spam";
  if (/\b(complain|complaint|not happy|unhappy|disgusted|unacceptable|ombudsman|fair trading|refund)\b/.test(text)) return "complaint";
  if (/\bremittance\b|\bpayment advice\b/.test(text)) return "remittance";
  if (/\bstatement\b/.test(text)) return "statement";
  if (isSupplier && /\b(tax invoice|invoice)\b/.test(text) && message.attachments.length > 0) return "supplier_invoice";
  if (records.some((r) => r.kind === "job" && r.match.subjectContains && text.includes(r.match.subjectContains.toLowerCase()))) return "job_update";
  if (/\b(voicemail|website enquiry|enquiry form|web form|new lead|quote|price for|how much|come out and look)\b/.test(text)) return "quote_request";
  return "other";
}

/** The job or supplier a message is about, by the record's own id, or null. */
export function matchRecord(message, kind, records) {
  if (kind === "spam" || kind === "other") return null;
  const subject = message.subject.toLowerCase();
  const domain = (message.from.split("@")[1] ?? "").toLowerCase();
  const job = records.find((r) => r.kind === "job" && r.match.subjectContains && subject.includes(r.match.subjectContains.toLowerCase()));
  if (job) return job.ref;
  const supplier = records.find((r) => r.kind === "supplier" && r.match.fromDomain && r.match.fromDomain.toLowerCase() === domain);
  return supplier ? supplier.ref : null;
}

/**
 * @param {import("@aipathway/conformance").InboxPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const queues = await ports.readQueues();
  const records = await ports.readRecords();
  const queueFor = (kind) => queues.find((q) => q.kind === kind) ?? queues.find((q) => q.kind === "other") ?? null;

  // 1. Every new message: one kind, the record by id, one item per thread.
  for (const message of await ports.readInbox()) {
    const kind = classify(message, records);
    if (!KINDS.has(kind)) throw new Error(`classifier produced a kind off the list: ${kind}`);
    await ports.classify(message.id, kind, 0.8);

    const queue = queueFor(kind);
    if (!queue) throw new Error(`no queue for kind ${kind} and no "other" queue: the queue table needs a row`);

    const existing = await ports.readItemForThread(message.thread_id);
    const recordRef = existing ? existing.record_ref : matchRecord(message, kind, records);

    // Where the message goes. Spam to quarantine under its hash. A matched
    // message against its record by id. Anything else stays where it is, and
    // the item below is the task a person reads.
    if (kind === "spam") {
      await ports.fileMessage(message.id, { to: "quarantine", hash: message.hash });
    } else if (recordRef) {
      await ports.fileMessage(message.id, { to: "record", recordRef });
    }

    // The attachment is the artefact, not the body. Invoice Check reads it here.
    if (kind === "supplier_invoice" && recordRef) {
      for (const a of message.attachments) {
        await ports.attachEvidence({ hash: a.hash, messageId: message.id, recordRef });
      }
    }

    if (existing) {
      // A follow-up joins the item its thread already has. If that item is
      // escalated (a complaint, or past its clock), a person holds it and the
      // machine sends nothing more.
      await ports.raiseTask({
        itemId: existing.id,
        messageId: message.id,
        threadId: message.thread_id,
        kind: existing.kind,
        recordRef: existing.record_ref,
        owner: existing.owner,
        due: existing.due,
      });
      if (kind === "complaint" && existing.status !== "escalated") {
        await ports.escalate({ itemId: existing.id, to: queueFor("complaint").owner, reason: "complaint", message });
      }
      continue;
    }

    const due = new Date(now.getTime() + queue.clockHours * HOUR).toISOString();
    const item = await ports.raiseTask({
      messageId: message.id,
      threadId: message.thread_id,
      kind,
      recordRef,
      owner: queue.owner,
      due,
      status: kind === "spam" ? "quarantined" : "open",
    });

    if (kind === "complaint") {
      // Whole, to a person. No acknowledgement, no summary, no reply.
      await ports.escalate({ itemId: item.id, to: queue.owner, reason: "complaint", message });
      continue;
    }
    if (kind === "spam") continue;

    // The one automatic outbound: a person will reply by the item's due date.
    await ports.acknowledge(item.id, due);
  }

  // 2. Released replies: record the release, then send exactly those words.
  const sentReply = async (item) => {
    const rec = await ports.readRecord(item.message_ids[0]);
    return Boolean(rec && rec.outbound.some((o) => o.kind === "reply"));
  };
  for (const approval of await ports.readApprovals()) {
    if (!approval.person || !approval.body) continue;
    const item = await ports.readItemForThread(approval.thread_id);
    if (!item || item.status !== "open") continue; // escalated or quarantined: a person holds it
    if (await sentReply(item)) continue; // safe to repeat
    await ports.release(item.id, approval.person);
    await ports.reply(item.id, approval.body);
  }

  // 3. The clock is on the kind. Open and past due goes to the owner's manager, named.
  for (const item of await ports.readItems()) {
    if (item.status !== "open") continue;
    if (new Date(item.due).getTime() >= now.getTime()) continue;
    const queue = queueFor(item.kind);
    await ports.escalate({ itemId: item.id, to: queue.manager, reason: "past_clock" });
  }
}

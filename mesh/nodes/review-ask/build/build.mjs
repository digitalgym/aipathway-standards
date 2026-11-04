/**
 * Review Ask, built to AIP-BS-REVIEW-REQUEST (2026-10-24).
 *
 * One run, woken by job.completed or a schedule tick, keeps nothing between
 * runs. Everything it knows comes back through the ports: the written rules,
 * the job as the job system has it now, the inbox, and the record the
 * business owns.
 *
 * Narrowed from the standard: Review Ask never sends on its own. It prepares
 * each due ask and reminder (the business's one message, the one link) and
 * hands the whole batch to a named person, who releases it whole or not at
 * all. The person cannot edit a message or pick customers out of the batch,
 * so a release can never become a score filter. An unreleased batch is
 * prepared again on the next run; nobody is skipped.
 *
 * The order is the standard's: read replies first (STOP and low scores), then
 * for each finished job the trigger, the wait, the opt-out, the window, the
 * hold, the channel; then reminders; then the release; then, for each released
 * message, the job read again at the moment of sending.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const HOLD_FIELDS = [
  ["openCallback", "open_callback"],
  ["invoiceDisputed", "invoice_disputed"],
  ["openComplaint", "open_complaint"],
];

const STOP_RE = /^\s*(stop|unsubscribe|opt ?out)\b/i;
// A message that offers something for a review, or tells the customer what
// stars or words to give, is never sent, whoever wrote it.
const BANNED_RE = /\b(discount|voucher|% ?off|free|prize|draw|gift|reward|in exchange|5[- ]?stars?|five[- ]stars?|leave us \d|say something like)\b/i;

const holdsOf = (job) => HOLD_FIELDS.filter(([f]) => job[f] === true).map(([, reason]) => reason);

function finishedAt(job, rules) {
  if (!job) return null;
  if (rules.trigger === "paid") return job.status === "paid" && job.paidAt ? Date.parse(job.paidAt) : null;
  if (job.status === "complete" || job.status === "paid") return job.completedAt ? Date.parse(job.completedAt) : null;
  return null;
}

const firstName = (c) => (c.name ?? "").trim().split(/\s+/)[0] || "there";
const fill = (text, c) => text.replaceAll("{name}", firstName(c));

function channelOf(c) {
  if (c?.mobile) return { channel: "sms", to: c.mobile };
  if (c?.email) return { channel: "email", to: c.email };
  return null;
}

/**
 * @param {ReturnType<import("./review-world.mjs").ReviewWorld["ports"]>} ports
 */
export async function build(ports) {
  const now = ports.now().getTime();
  const rules = await ports.readRule();
  const owner = rules.owner;
  let record = await ports.readRecord();

  const has = (pred) => record.some(pred);
  const write = async (entry) => {
    const r = await ports.writeRecord(entry);
    if (r?.id) record = [...record, { id: r.id, at: new Date(now).toISOString(), ...entry }];
    return r;
  };
  const escalateOnce = async (jobId, customerId, reason) => {
    if (has((e) => e.kind === "exception" && e.jobId === jobId && e.reason === reason && !e.cleared)) return;
    const r = await ports.escalate({ jobId, customerId, reason, owner });
    await write({ kind: "exception", jobId, customerId, reason, owner, exceptionId: r?.exceptionId ?? null });
  };

  // The written message is checked once a run. A message that offers anything
  // or suggests stars or words is not the business's to send: nothing goes.
  const messageOk = !BANNED_RE.test(rules.message_text) && !BANNED_RE.test(rules.reminder_text) && rules.message_text.includes(rules.review_link) && rules.reminder_text.includes(rules.review_link);
  if (!messageOk) {
    await escalateOnce(null, null, "message_breaks_the_standard");
  }

  // 1. Replies. Exactly as received, by job. STOP is for good; 1 to 3 alerts the owner.
  const inbox = await ports.readInbox();
  for (const msg of inbox) {
    if (has((e) => e.kind === "reply" && e.messageId === msg.messageId)) continue;
    const askedRow = record.find((e) => (e.kind === "ask" || e.kind === "reminder") && e.messageId === msg.inReplyTo);
    const jobId = askedRow?.jobId ?? null;
    const stop = STOP_RE.test(msg.text);
    const m = /\b([1-5])\b/.exec(msg.text);
    const score = stop || !m ? null : Number(m[1]);
    await write({ kind: "reply", jobId, customerId: msg.customerId, messageId: msg.messageId, text: msg.text, score, receivedAt: msg.receivedAt });
    if (stop) {
      await ports.recordConsent({ customerId: msg.customerId, said: msg.text, receivedAt: msg.receivedAt });
      await write({ kind: "opt_out", jobId, customerId: msg.customerId, said: msg.text });
    } else if (score !== null && score <= 3) {
      const c = await ports.readCustomer(msg.customerId);
      await ports.notify({ to: owner, jobId, customerId: msg.customerId, text: `Job ${jobId}: ${c?.name ?? msg.customerId} replied "${msg.text}". Worth a call while it is fixable.` });
      await write({ kind: "alert", jobId, customerId: msg.customerId, to: owner, text: msg.text });
    }
  }

  const openHold = (jobId, reason) => record.find((e) => e.kind === "hold" && e.jobId === jobId && e.reason === reason && !record.some((x) => x.kind === "hold_cleared" && x.holdId === e.id));
  const askedFor = (jobId) => record.find((e) => e.kind === "ask" && e.jobId === jobId);
  const repliedSince = (customerId, at) => record.some((e) => e.kind === "reply" && e.customerId === customerId && Date.parse(e.receivedAt) >= Date.parse(at));
  const askedCustomerWithin = (customerId, days) => record.some((e) => e.kind === "ask" && e.customerId === customerId && now - Date.parse(e.at) < days * DAY);

  // 2. New asks, one per finished job, judged on the job as it stands now.
  const batch = [];
  const inBatch = new Set();
  const ids = await ports.listFinishedJobs();
  for (const jobId of ids) {
    if (askedFor(jobId)) continue;
    if (has((e) => e.kind === "skipped" && e.jobId === jobId)) continue; // opted out or inside the window: settled for good
    const job = await ports.readJob(jobId);
    const done = finishedAt(job, rules);
    if (done === null) continue; // not finished by the written trigger
    if (now < done + rules.wait_hours * HOUR) continue; // still inside the written wait

    const gate = await ports.gate(job.customerId);
    if (gate.optedOut) {
      await write({ kind: "skipped", jobId, customerId: job.customerId, reason: "opted_out" });
      continue;
    }
    if (inBatch.has(job.customerId) || askedCustomerWithin(job.customerId, rules.window_days)) {
      await write({ kind: "skipped", jobId, customerId: job.customerId, reason: "window" });
      continue;
    }

    const reasons = holdsOf(job);
    for (const reason of reasons) {
      if (!openHold(jobId, reason)) {
        const r = await ports.escalate({ jobId, customerId: job.customerId, reason, owner });
        await write({ kind: "hold", jobId, customerId: job.customerId, reason, owner, exceptionId: r?.exceptionId ?? null });
      }
    }
    // A hold the job system has cleared is recorded as cleared.
    for (const h of HOLD_FIELDS.map(([, r]) => openHold(jobId, r)).filter((h) => h && !reasons.includes(h.reason))) {
      await write({ kind: "hold_cleared", jobId, customerId: job.customerId, reason: h.reason, holdId: h.id });
    }
    if (reasons.length > 0) continue;

    const customer = await ports.readCustomer(job.customerId);
    const ch = channelOf(customer);
    if (!ch) {
      await escalateOnce(jobId, job.customerId, "no_way_to_reach");
      continue;
    }
    if (!messageOk) continue;
    inBatch.add(job.customerId);
    batch.push({ kind: "ask", jobId, customerId: job.customerId, ...ch, body: fill(rules.message_text, customer) });
  }

  // 3. One reminder, after the written interval, only if nothing came back.
  for (const ask of record.filter((e) => e.kind === "ask")) {
    if (has((e) => e.kind === "reminder" && e.jobId === ask.jobId)) continue;
    if (now < Date.parse(ask.at) + rules.reminder_hours * HOUR) continue;
    if (repliedSince(ask.customerId, ask.at)) continue;
    const gate = await ports.gate(ask.customerId);
    if (gate.optedOut) continue;
    const job = await ports.readJob(ask.jobId);
    if (!job || job.reviewMarkedBy) continue;
    if (!messageOk) continue;
    const customer = await ports.readCustomer(ask.customerId);
    batch.push({ kind: "reminder", jobId: ask.jobId, customerId: ask.customerId, channel: ask.channel, to: ask.to, body: fill(rules.reminder_text, customer) });
  }

  if (batch.length === 0) return;

  // 4. A named person releases the batch, whole. Nothing goes without it.
  const release = await ports.requestRelease({ prepared_at: new Date(now).toISOString(), items: batch });
  if (!release?.released) return; // prepared again next run, the same way

  // 5. Read the job again at the moment of sending, then send.
  for (const item of batch) {
    const job = await ports.readJob(item.jobId);
    const reasons = item.kind === "ask" ? holdsOf(job ?? {}) : [];
    if (reasons.length > 0) {
      for (const reason of reasons) {
        if (!openHold(item.jobId, reason)) {
          const r = await ports.escalate({ jobId: item.jobId, customerId: item.customerId, reason, owner });
          await write({ kind: "hold", jobId: item.jobId, customerId: item.customerId, reason, owner, exceptionId: r?.exceptionId ?? null });
        }
      }
      continue;
    }
    const gate = await ports.gate(item.customerId);
    if (gate.optedOut) continue;
    const res = await ports.sendMessage({ ...item, releaseId: release.releaseId });
    if (res?.sent && res.messageId) {
      await write({ kind: item.kind, jobId: item.jobId, customerId: item.customerId, channel: item.channel, to: item.to, body: item.body, messageId: res.messageId, releasedBy: release.releasedBy });
    } else {
      await escalateOnce(item.jobId, item.customerId, "send_failed");
    }
  }
}

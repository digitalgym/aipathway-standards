/**
 * Day Desk: the daytime phone and the customer kept told, built to
 * AIP-BS-CLIENT-DESK 2026-10-26.
 *
 * One function, woken by one named event at a time, keeping nothing between
 * runs. Everything it knows comes off the job record; everything it does goes
 * back onto the job.
 *
 *   call.received   answer in business hours: disclose, look the caller up,
 *                   answer from the job, put them through, or write new work
 *   job.updated     change "eta" | "left": draft a running-late or on-the-way
 *                   update for a person to release
 *                   change "release": a named person released a draft; send it
 *   job.completed   draft the job-complete update for a person to release
 *
 * NARROWED FROM THE STANDARD. The standard sends status messages when the
 * record changes. Day Desk drafts each one onto the job and sends it only once
 * a named person on the office side releases it, reading the job again at send
 * time. A person sends.
 *
 * The live line (the number, the voice, the disclosure audio, the transfer) is
 * Office Voice / Front Desk's. This file is the wiring behind it.
 */

const DISCLOSURE =
  "Hi, you've reached the office. I'm an AI assistant, and this call is recorded so we get your job right.";

const TYPES = ["emergency", "routine", "quote", "unclassified"];

/** The fixed list, never free text. */
export function classify(words) {
  const t = words.toLowerCase();
  if (/\b(burst|flood|flooding|gas leak|smell gas|sparking|no power|sewage|overflowing)\b/.test(t)) return "emergency";
  if (/\b(quote|quoting|price for|renovation|reno|estimate)\b/.test(t)) return "quote";
  if (/\b(drip|dripping|tap|leak|leaking|service|fix|repair|blocked|replace|hot water)\b/.test(t)) return "routine";
  return "unclassified";
}

function intentOf(words) {
  const t = words.toLowerCase();
  if (/\b(speak|talk|put me through|a person|someone|the owner|a human|real person)\b/.test(t)) return "person";
  if (/\b(when|what time|coming|arrive|arriving|eta|running late|where is)\b/.test(t)) return "status";
  return "other";
}

const dueBy = (now, minutes) => new Date(now.getTime() + minutes * 60_000).toISOString();

const KIND_FOR = { eta: "late", left: "on_the_way" };

function textFor(kind, job) {
  if (kind === "late") return `Job ${job.id}: we're running late. Your new arrival time is ${job.eta}. Reply or call the office with any questions.`;
  if (kind === "on_the_way") return job.eta ? `Job ${job.id}: your tradesperson is on the way, arriving ${job.eta}.` : `Job ${job.id}: your tradesperson is on the way.`;
  return `Job ${job.id}: the work is complete. Any questions, call the office.`;
}

/** The change a draft is for. Same change twice is one key; a new time is a new key. */
const changeKey = (jobId, kind, eta) => `${jobId}:${kind}:${eta ?? "-"}`;

export async function build(ports, event) {
  if (!event) return; // woken by nothing, does nothing
  if (event.name === "call.received") return onCall(ports, event);
  if (event.name === "job.updated" && event.change === "release") return onRelease(ports, event);
  if (event.name === "job.updated" || event.name === "job.completed") return onChange(ports, event);
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

async function onCall(ports, { callId, phone }) {
  // Check 1: disclosure before anything else on the call.
  await ports.disclose(callId, DISCLOSURE);

  // Check 2: look up before anything is written. The only match on a phone
  // number in the whole node, because the call is the entry hop.
  const ids = await ports.findOpenJobs(phone);
  let job = ids.length > 0 ? await ports.readJob(ids[0]) : null;

  const heard = [];
  const told = [];
  const say = async (text) => {
    told.push(text);
    await ports.say(callId, text);
  };

  await say("How can I help today?");
  let roster = null;
  const getRoster = async () => (roster ??= await ports.readRoster());

  for (;;) {
    const words = await ports.hear(callId);
    if (words === null) break;
    heard.push(words);
    const intent = intentOf(words);

    if (job && job.exception && job.exception.open) {
      // An open exception owns this job. Nothing is answered off it; the owner calls back.
      const r = await getRoster();
      const task = await ports.raiseTask({ jobId: job.id, owner: job.exception.owner, due_by: dueBy(ports.now(), r.callback_within_minutes), reason: "caller_on_job_with_open_exception", callId });
      await say(`I've noted that on your job, and ${job.exception.owner} will call you back.`);
      void task;
      continue;
    }

    if (intent === "status") {
      if (job) {
        // Check 4: read by the job's id on this call, and say only what it holds.
        job = await ports.readJob(job.id);
        if (job.eta) {
          await say(`Your job ${job.id} has the arrival time as ${job.eta}.`);
        } else {
          const r = await getRoster();
          await ports.raiseTask({ jobId: job.id, owner: r.on_duty, due_by: dueBy(ports.now(), r.callback_within_minutes), reason: "no_arrival_time_on_job", callId });
          await say(`Your job doesn't have an arrival time on it yet. ${r.on_duty} will call you back within ${r.callback_within_minutes} minutes with one.`);
        }
      } else {
        const r = await getRoster();
        await ports.raiseTask({ phone, owner: r.on_duty, due_by: dueBy(ports.now(), r.callback_within_minutes), reason: "status_question_no_open_job", callId });
        await say(`I can't find an open job on this number. ${r.on_duty} will call you back within ${r.callback_within_minutes} minutes.`);
      }
      continue;
    }

    if (intent === "person") {
      // Check 5: through to whoever the roster names, and a callback if nobody answers.
      const r = await getRoster();
      await say(`I'll put you through to ${r.on_duty} now.`);
      const { answered } = await ports.transfer(callId, r.on_duty);
      if (answered) {
        told.push(`transferred to ${r.on_duty}`);
        break; // the call is the person's now
      }
      await ports.raiseTask({
        ...(job ? { jobId: job.id } : { phone }),
        owner: r.on_duty,
        due_by: dueBy(ports.now(), r.callback_within_minutes),
        reason: "transfer_unanswered",
        callId,
      });
      await say(`${r.on_duty} can't pick up right now. They'll call you back within ${r.callback_within_minutes} minutes.`);
      continue;
    }

    // Anything else. An existing customer is worked on their own job: no new job.
    if (job) {
      await say("Thanks, I've put that on your job.");
      continue;
    }

    // Check 3: new work, one job, the caller's own words and a fixed type.
    const type = classify(words);
    if (!TYPES.includes(type)) throw new Error(`type ${type} is not on the fixed list`);
    const written = await ports.writeJob({ phone, verbatim: words, type, contact: { phone, consent: false } }, `${callId}:new-job`);
    if (!written || !written.id) {
      // Check 10: no id back is not a booked job.
      const r = await getRoster();
      await ports.raiseTask({ phone, owner: r.on_duty, due_by: dueBy(ports.now(), r.callback_within_minutes), reason: "job_write_failed", callId });
      await say(`I haven't been able to put that in the system. ${r.on_duty} will call you back on this number within ${r.callback_within_minutes} minutes.`);
      continue;
    }
    job = await ports.readJob(written.id);
    if (!job) {
      const r = await getRoster();
      await ports.raiseTask({ phone, owner: r.on_duty, due_by: dueBy(ports.now(), r.callback_within_minutes), reason: "job_readback_failed", callId });
      await say(`I haven't been able to confirm that in the system. ${r.on_duty} will call you back within ${r.callback_within_minutes} minutes.`);
      continue;
    }
    await say(`You're booked in. Your job number is ${job.id}. The office will be in touch with a time.`);
  }

  // Check 9: the call goes back on the job, by the call id.
  if (job) {
    await ports.fileNote(job.id, { ref: callId, kind: "call", said: heard, told });
  }
}

// ---------------------------------------------------------------------------
// Status updates: drafted on a change, sent on a person's release
// ---------------------------------------------------------------------------

async function onChange(ports, event) {
  const kind = event.name === "job.completed" ? "complete" : KIND_FOR[event.change];
  if (!kind) return;
  // Read after the event arrived: the time comes off the job, never the event.
  const job = await ports.readJob(event.jobId);
  if (!job) return;
  if (job.exception && job.exception.open) return; // the chain waits for the named owner
  if (kind === "complete" ? job.status !== "complete" : job.status !== "open") return;
  if (kind === "late" && !job.eta) return; // no time on the job, nothing to tell

  const key = changeKey(job.id, kind, job.eta);
  const seen = job.drafts.some((d) => d.changeKey === key) || job.notes.some((n) => n.changeKey === key);
  if (seen) return; // check 7: one per change

  // Check 8: only the job's contact, only with consent.
  if (!job.contact || !job.contact.phone || job.contact.consent !== true) {
    await ports.fileNote(job.id, { ref: event.eventId, kind: "update_not_sent", changeKey: key, reason: "no_consent_to_messages", text: `No ${kind} message sent: the contact has not agreed to messages.` });
    return;
  }
  await ports.draftUpdate(job.id, { kind, eta: job.eta, to: job.contact.phone, eventId: event.eventId, changeKey: key, text: textFor(kind, job) });
}

async function onRelease(ports, event) {
  const job = await ports.readJob(event.jobId);
  if (!job) return;
  if (job.exception && job.exception.open) return;
  const draft = job.drafts.find((d) => d.id === event.draftId);
  if (!draft || !draft.released_by) return; // a person sends; no release, no message
  if (job.notes.some((n) => n.kind === "update_sent" && n.changeKey === draft.changeKey)) return; // already sent
  // The job may have moved again since the draft: a stale time is never sent.
  if (draft.kind !== "complete" && job.eta !== draft.eta) {
    await ports.fileNote(job.id, { ref: draft.eventId, kind: "update_superseded", changeKey: draft.changeKey, text: `Draft for ${draft.eta} not sent: the job now says ${job.eta}.` });
    return;
  }
  if (!job.contact || job.contact.consent !== true || job.contact.phone !== draft.to) return;
  const text = textFor(draft.kind, job);
  await ports.sendSms(job.contact.phone, text, { jobId: job.id, eventId: draft.eventId, kind: draft.kind, eta: job.eta, released_by: draft.released_by });
  await ports.fileNote(job.id, { ref: draft.eventId, kind: "update_sent", changeKey: draft.changeKey, released_by: draft.released_by, text });
}

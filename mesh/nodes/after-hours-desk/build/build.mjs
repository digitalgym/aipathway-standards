/**
 * After-Hours Desk: one out-of-hours call to a trade or field-service business
 * (movers, HVAC, plumbers, landscapers, cleaners), ending in one job in the
 * system of record or a typed hand-off to a person.
 *
 * Built to AIP-BS-BOOKED-AFTER-HOURS 2026-10-06, AI Pathway,
 * https://aipathway.com.au/explore-ai/booked-after-hours-build-standard
 * (CC BY 4.0). Written from the standard alone.
 *
 * THE ONE RULE. Everything this build does to the outside world goes through
 * the ports it is handed. The live call itself (the number, the disclosure
 * audio, the recording, the write-back tenant) is Office Voice / Front Desk;
 * this file is the logic that runs behind those ports.
 *
 * Mesh: woken by `call.received` (call_id + caller number). On a new job the
 * job system issues the job id, which is `job.created` for the next node
 * (Quote Out). After intake nothing matches on the phone number again.
 */

/** Section 3. The taxonomy is fixed; nothing else reaches the job system. */
export const JOB_TYPES = ["emergency", "routine", "quote", "unclassified"];

/** Section 7. Escalation reasons, a fixed list so the pattern is countable. */
export const ESCALATION_REASONS = [
  "unclassified",
  "address_unresolved",
  "out_of_scope_request",
  "caller_distressed",
  "price_requested",
  "complaint",
  "write_failed",
];

/**
 * The triggers, as lists a team can read and argue with. The build matches
 * against these; it does not reason about urgency. Quote is tested first:
 * a request for a price on new work is never an emergency, however it is put.
 */
export const TRIGGERS = {
  quote: [
    /\bquote\b/i,
    /\bestimate\b/i,
    /\bhow much (would|to|for|does)\b/i,
    /\b(want|get|need) a price\b/i,
    /\bprice (for|on)\b/i,
    /\bnew (bathroom|kitchen|system|install|garden|deck)\b/i,
    /\brenovat/i,
    /\b(moving|move) (house|home|office|out|in)\b/i,
    /\bend of lease clean\b/i,
  ],
  emergency: [
    /\bburst\b/i,
    /\bflood(ed|ing)?\b/i,
    /\bwater('s| is)? (pouring|everywhere|gushing|coming through)\b/i,
    /\bgushing\b/i,
    /\bno power\b/i,
    /\bpower('s| is)? (out|off)\b/i,
    /\bsparking\b/i,
    /\b(smell(s)? (of )?)?gas (leak|smell)\b|\bsmell(s)? (of )?gas\b/i,
    /\bsewage\b|\bsewer\b/i,
    /\bbreak-?in\b|\bbroken (lock|window|door)\b|\bcan't lock\b/i,
    /\b(smoke|burning smell|on fire)\b/i,
    /\b(unsafe|dangerous|electric shock)\b/i,
  ],
  routine: [
    /\bdrip(ping)?\b/i,
    /\bleak(ing|y)?\b/i,
    /\bblocked\b/i,
    /\bnot (working|cooling|heating|draining)\b/i,
    /\b(broken|faulty|noisy|stopped)\b/i,
    /\b(won't|doesn't|does not|will not) (start|work|turn on|flush|drain)\b/i,
    /\b(repair|fix|service|clean|mow|trim|prune)\b/i,
  ],
};

const PRICE_QUESTION = [/\bhow much\b/i, /\bcost\b/i, /\bprice\b/i, /\bcharge\b/i, /\b(call-?out|callout) fee\b/i, /\brates?\b/i];
const COMPLAINT = [/\bcomplain(t)?\b/i, /\bterrible service\b/i, /\bstill (not|hasn't been) fixed\b/i];
const YES = /^\s*(yes|yeah|yep|yup|correct|that's (right|it|correct)|right|sure|please|ok(ay)?|go ahead)\b/i;

/** Classify the caller's words against the fixed lists. Unmatched is unclassified. */
export function classify(text) {
  const t = text ?? "";
  for (const type of ["quote", "emergency", "routine"]) {
    if (TRIGGERS[type].some((re) => re.test(t))) return type;
  }
  return "unclassified";
}

const askedPrice = (t) => Boolean(t) && PRICE_QUESTION.some((re) => re.test(t));
const complained = (t) => Boolean(t) && COMPLAINT.some((re) => re.test(t));

/** The default business config. A real deployment reads it from the tenant. */
export const DEFAULT_BUSINESS = {
  name: "the business",
  onCall: "on-call",
  office: "office",
  jobSystem: "servicem8",
};

/**
 * Run one call.
 *
 * @param {object} ports  the ports the runner (or Front Desk) hands over
 * @param {object} call   the `call.received` event: { callId, callerNumber, business }
 * @returns the call_outcome object from section 5
 */
export async function build(ports, call = {}) {
  const business = { ...DEFAULT_BUSINESS, ...(call.business ?? {}) };
  const callId = call.callId ?? `CALL-${(await ports.now()).getTime()}`;
  const callerNumber = call.callerNumber ?? null;

  // Our own ordered record of what this build did, kept for the log (check 11).
  const toolCalls = [];
  const transcript = [];
  const stamp = async () => (await ports.now()).toISOString();
  const use = async (port, args, fn) => {
    const at = await stamp();
    const result = await fn();
    toolCalls.push({ port, args, result: result ?? null, at });
    return result;
  };
  const say = async (text) => {
    transcript.push({ who: "agent", text, at: await stamp() });
    await use("say", { text }, () => ports.say(text));
  };
  const hear = async () => {
    const text = await use("hear", {}, () => ports.hear());
    if (text !== null && text !== undefined) transcript.push({ who: "caller", text, at: await stamp() });
    return text ?? null;
  };
  const escalations = [];
  const escalate = async (reason) => {
    if (!ESCALATION_REASONS.includes(reason)) throw new Error(`escalation reason "${reason}" is not on the fixed list`);
    if (escalations.includes(reason)) return;
    escalations.push(reason);
    const handoff = { callId, transcript: transcript.map((t) => ({ ...t })), transcriptUri: `log://${callId}/transcript` };
    await use("escalate", { reason }, () => ports.escalate(reason, handoff));
  };

  const outcome = {
    call_id: callId,
    received_at: await stamp(),
    caller_number: callerNumber,
    disclosure: { given: false, at: null },
    recording: { consented: false, at: null },
    problem_verbatim: null,
    classification: "unclassified",
    address: { spoken: null, resolved: null, confidence: "none" },
    in_service_area: false,
    outcome: "abandoned",
    job: { system: business.jobSystem, external_id: null, duplicate_of: null },
    escalation: { reason: null, notified: null },
    sms: { consented: false, at: null, sent: false },
    transcript_uri: `log://${callId}/transcript`,
  };

  const finish = async () => {
    outcome.escalation.reason = escalations[0] ?? null;
    if (escalations.length && !outcome.escalation.notified) outcome.escalation.notified = `${business.office} (morning queue, transcript attached)`;
    const entry = { call_id: callId, outcome: structuredClone(outcome), transcript, calls: toolCalls, escalations: [...escalations] };
    if (ports.writeLog) await ports.writeLog(callId, entry);
    return outcome;
  };

  // 1. Identify and disclose. Before any question, on every call.
  const disclosure =
    `Hi, you've reached ${business.name}. I'm an AI assistant, not a person, ` +
    `and this call is recorded so the team can follow it up.`;
  transcript.push({ who: "agent", text: disclosure, at: await stamp() });
  await use("disclose", { text: disclosure }, () => ports.disclose(disclosure));
  outcome.disclosure = { given: true, at: await stamp() };
  // Staying on the line after the recording notice is the consent the notice asks for.
  outcome.recording = { consented: true, at: await stamp() };

  // 2. Capture the problem verbatim, before anything classifies it.
  await say("What's happened, in your own words?");
  const problem = await hear();
  if (problem === null) {
    outcome.outcome = "abandoned";
    return finish();
  }
  outcome.problem_verbatim = problem;

  // 3. Classify from the fixed list.
  outcome.classification = classify(problem);
  if (complained(problem)) {
    await say("I'm sorry. I'll pass this to the team with what you've told me so a person can call you.");
    await escalate("complaint");
    outcome.outcome = "escalated";
    return finish();
  }
  if (outcome.classification === "unclassified") {
    await say("I'll take this down as a message and a person from the team will call you back.");
    await escalate("unclassified");
    outcome.outcome = "escalated";
    return finish();
  }
  if (outcome.classification !== "quote" && askedPrice(problem)) {
    await say("I can't give prices. A person from the team will come back to you on that.");
    await escalate("price_requested");
  }

  // 4. The address. The spoken words are a query, never a value.
  await say("What's the address of the job?");
  const spoken = await hear();
  outcome.address.spoken = spoken;
  const found = spoken ? await use("resolveAddress", { spoken }, () => ports.resolveAddress(spoken)) : null;
  if (!found || !found.resolved) {
    await say("I couldn't confirm that address, so I'll have a person call you back rather than guess it.");
    await escalate("address_unresolved");
    outcome.outcome = "escalated";
    return finish();
  }
  await say(`I have ${found.resolved}. Is that right?`);
  const confirmed = await hear();
  if (!confirmed || !YES.test(confirmed)) {
    outcome.address.confidence = "low";
    await say("Thanks. I'll have a person confirm the address with you rather than guess it.");
    await escalate("address_unresolved");
    outcome.outcome = "escalated";
    return finish();
  }
  outcome.address.resolved = found.resolved;
  outcome.address.confidence = "high";

  // 5. Service area. Out of it: say so, no job.
  outcome.in_service_area = Boolean(found.inArea);
  if (!outcome.in_service_area) {
    await say(`${found.resolved} is outside the area ${business.name} covers, so I can't book a job there. I'm sorry I can't help with this one.`);
    outcome.outcome = "out_of_area";
    return finish();
  }

  // 6. Look for an open job on this number before writing anything. This is
  // the one hop allowed to match on a phone number, because no job id exists yet.
  const intentId = `${callId}:call.received:after-hours-desk`;
  const open = callerNumber ? await use("findOpenJob", { phone: callerNumber }, () => ports.findOpenJob(callerNumber)) : null;

  let jobId = null;
  let isNew = false;
  if (open && open.exception && open.exception.owner) {
    // An open exception with a named owner stops the chain. Write nothing.
    await say(`The team already has this one with ${open.exception.owner}, who will call you back. I've not changed anything on it.`);
    outcome.job.external_id = open.id;
    outcome.escalation.notified = `${open.exception.owner} (open exception on job ${open.id})`;
    outcome.outcome = "escalated";
    return finish();
  }
  if (open && open.id) {
    // 7a. Write once: update the open job and record duplicate_of.
    const updated = await use("updateJob", { id: open.id, intentId }, () => ports.updateJob(open.id, intentId));
    jobId = updated?.id ?? null;
    outcome.job.duplicate_of = open.id;
  } else {
    // 7b. A new job, with the resolved address and a type from the enum.
    const job = {
      phone: callerNumber,
      address: found.resolved,
      type: outcome.classification,
      problem_verbatim: problem,
      call_id: callId,
    };
    const created = await use("writeJob", { job, intentId }, () => ports.writeJob(job, intentId));
    jobId = created?.id ?? null;
    isNew = Boolean(jobId);
    // A write counts only when the job reads back by the system's own answer.
    if (jobId) {
      const back = await use("findOpenJob", { phone: callerNumber, readback: jobId }, () => ports.findOpenJob(callerNumber));
      if (!back || back.id !== jobId) jobId = null;
    }
  }

  outcome.job.external_id = jobId;
  if (!jobId) {
    // Section 6: a null external_id is a failed call, never a booked one.
    await use("notify", { to: business.office, reason: "write_failed" }, () => ports.notify(business.office, null, "write_failed"));
    outcome.escalation.notified = `${business.office} (write_failed)`;
    await say("I wasn't able to put this into the system, so a person from the team will call you back first thing. Nothing is booked yet.");
    await escalate("write_failed");
    outcome.outcome = "escalated";
    return finish();
  }

  // 8. Confirm with a reference. Text it only with consent, captured on the call.
  if (outcome.job.duplicate_of) {
    await say(`That's on the job we already have for you, reference ${jobId}. I've added this call to it.`);
  } else {
    await say(`That's booked, reference ${jobId}.`);
  }
  await say("Would you like that reference by text message?");
  const smsAnswer = await hear();
  if (smsAnswer && YES.test(smsAnswer)) {
    const at = await stamp();
    outcome.sms.consented = true;
    outcome.sms.at = at;
    if (ports.recordConsent) await use("recordConsent", { callId, channel: "sms", at }, () => ports.recordConsent({ callId, phone: callerNumber, channel: "sms", at }));
    if (ports.sendSms) {
      await use("sendSms", { to: callerNumber }, () => ports.sendSms(callerNumber, `${business.name}: your reference is ${jobId}.`));
      outcome.sms.sent = true;
    }
  }

  // 9. On-call: only a new emergency job wakes a person, once per job.
  if (outcome.classification === "emergency" && isNew) {
    await use("notify", { to: business.onCall, jobId, reason: "emergency" }, () => ports.notify(business.onCall, jobId, "emergency"));
    outcome.escalation.notified = `${business.onCall} (emergency, job ${jobId})`;
    await say("I've alerted the person on call. They'll be in touch shortly.");
  } else if (outcome.classification === "emergency") {
    await say("The person on call already has this job.");
  } else {
    await say("The team will pick this up first thing next working day.");
  }

  // Anything else: a price question or a complaint goes to a person, never answered.
  await say("Is there anything else?");
  const more = await hear();
  if (askedPrice(more)) {
    await say("I can't give prices. A person from the team will come back to you on that.");
    await escalate("price_requested");
  } else if (complained(more)) {
    await say("I'll pass that to the team so a person can call you.");
    await escalate("complaint");
  }

  outcome.outcome = "booked";
  return finish();
}

/** Check 11: one call_id returns transcript, ordered port calls and outcome together. */
export async function retrieveCall(ports, callId) {
  return ports.readLog ? await ports.readLog(callId) : null;
}

/**
 * Roof Desk: answers a roofing business's phone when the office is closed,
 * books one job per caller in the job system, and wakes the on-call roofer
 * only for a real emergency (water coming in, storm damage, something that
 * could fall).
 *
 * Built to AIP-BS-BOOKED-AFTER-HOURS 2026-10-06,
 * https://aipathway.com.au/explore-ai/booked-after-hours-build-standard
 *
 * The order below is the standard's order (section 2): disclose, capture the
 * caller's words, classify from a fixed list, resolve the address by lookup,
 * check the service area, look for an open job, write once, confirm, text only
 * with consent, and page the on-call only for an emergency.
 *
 * What it never does: quote a price, give safety advice, or write an address
 * it did not resolve. Inspections and repairs are booked into the next working
 * slot as a job; the office confirms the time. The live call (the number, the
 * disclosure audio, the recording) runs on the hosted provider and is not
 * written here.
 *
 * Every port call is awaited, so the same build runs against the stub and a
 * real job system.
 */

export const CONFIG = {
  business: "Northside Roofing",
  timeZone: "Australia/Brisbane",
  // Office hours, local time. Outside them this desk answers.
  hours: { days: [1, 2, 3, 4, 5], open: 7, close: 17 },
  onCall: "on-call roofer",
  office: "office manager",
};

/** The fixed taxonomy (section 3). Matched against lists, never reasoned about. */
const EMERGENCY = [
  /water (is )?(coming|pouring|leaking|dripping) (in|through)/i,
  /\bpouring\b|\bflood/i,
  /leak(ing)? (into|through) the (ceiling|house|room|bedroom|kitchen)/i,
  /ceiling (is )?(sagging|bulging|collaps)/i,
  /storm damage|blown off|ripped off|lifted in the (storm|wind)|sheet'?s? (has )?lifted/i,
  /tree (has )?(fallen|come down|landed) on/i,
  /water (in|near|through) (the )?(light|power point|switchboard)/i,
  /about to fall|could fall|hanging off/i,
];
const QUOTE = [/\bquote\b/i, /re-?roof/i, /new roof/i, /replace (the|my) (whole )?roof/i, /\bestimate\b/i];
const ROUTINE = [
  /\b(cracked|broken|slipped|missing) (roof )?tiles?\b/i,
  /gutter|downpipe|valley/i,
  /flashing|ridge cap|pointing|bedding/i,
  /small leak|drips? when it rains|stain on the ceiling/i,
  /inspection|check (the|my) roof/i,
];

/** The escalation reasons are a fixed list (section 7). */
export const REASONS = [
  "unclassified",
  "address_unresolved",
  "out_of_scope_request",
  "caller_distressed",
  "price_requested",
  "complaint",
  "write_failed",
];

const PRICE = /\b(how much|what('?s| is| will| would| does)? (it|that|this|the job)? ?(going to )?cost|cost me|ballpark|rough price|your rates?|hourly rate|call-?out fee)\b/i;
const COMPLAINT = /\b(complain|complaint|disgusted|useless|refund|never came|still not fixed)\b/i;
const YES = /^\s*(yes|yeah|yep|yup|correct|that'?s (right|it|correct)|right|sure|please|ok(ay)?)\b/i;

export function classify(words) {
  if (EMERGENCY.some((r) => r.test(words))) return "emergency";
  if (QUOTE.some((r) => r.test(words))) return "quote";
  if (ROUTINE.some((r) => r.test(words))) return "routine";
  return "unclassified";
}

function localParts(at, timeZone) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(at);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { day, hour };
}

export function isAfterHours(at, cfg = CONFIG) {
  const { day, hour } = localParts(at, cfg.timeZone);
  return !(cfg.hours.days.includes(day) && hour >= cfg.hours.open && hour < cfg.hours.close);
}

/** The next working morning, as words, for the confirmation. The office sets the time. */
function nextWorkingDay(at, cfg = CONFIG) {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(at.getTime() + i * 86400000);
    if (cfg.hours.days.includes(localParts(d, cfg.timeZone).day)) {
      return new Intl.DateTimeFormat("en-AU", { timeZone: cfg.timeZone, weekday: "long", day: "numeric", month: "long" }).format(d);
    }
  }
  return "the next working day";
}

/**
 * @param {any} ports
 */
export async function build(ports) {
  const call = (await ports.call?.()) ?? null;
  const now = await ports.now();
  const callId = call?.call_id ?? `call-${now.getTime()}`;
  const phone = call?.caller_number ?? "unknown";
  const transcript = [];
  const say = async (text) => {
    transcript.push({ who: "agent", text });
    await ports.say(text);
  };
  const hear = async () => {
    const text = await ports.hear();
    if (text !== null && text !== undefined) transcript.push({ who: "caller", text });
    return text ?? null;
  };

  const outcome = {
    call_id: callId,
    received_at: call?.received_at ?? now.toISOString(),
    caller_number: phone,
    disclosure: { given: false, at: null },
    recording: { consented: false, at: null },
    problem_verbatim: null,
    classification: null,
    address: { spoken: null, resolved: null, confidence: "none" },
    in_service_area: false,
    outcome: "abandoned",
    job: { system: "servicem8", external_id: null, duplicate_of: null },
    escalation: { reason: null, notified: null },
    transcript_uri: `log://${callId}`,
  };

  const finish = async () => {
    await ports.writeLog?.(callId, { stage: "outcome", outcome, transcript: [...transcript] });
  };
  const handOff = async (reason, line) => {
    outcome.outcome = "escalated";
    outcome.escalation = { reason, notified: `${CONFIG.office}, morning queue, with the transcript` };
    await say(line ?? "I'll pass this to the team with everything you've told me, and someone will call you back.");
    await ports.escalate(reason, [...transcript]);
    await finish();
  };

  // 1. Identify and disclose, before any question.
  const disclosure = `Hi, you've reached ${CONFIG.business} after hours. I'm an AI assistant, and this call is recorded.`;
  transcript.push({ who: "agent", text: disclosure });
  await ports.disclose(disclosure);
  const at = (await ports.now()).toISOString();
  outcome.disclosure = { given: true, at };
  outcome.recording = { consented: true, at };

  await say("What's happening with your roof?");
  const words = await hear();
  if (words === null) {
    await finish();
    return;
  }

  // 2. Capture the caller's words verbatim, before anything classifies them.
  outcome.problem_verbatim = words;
  await ports.writeLog?.(callId, { stage: "verbatim", problem_verbatim: words, at: (await ports.now()).toISOString() });

  // Things that always go to a person, whatever the job is.
  if (PRICE.test(words)) {
    outcome.classification = "unclassified";
    return handOff("price_requested", "I can't give prices over the phone. I'll pass this to the team and they'll call you back about it.");
  }
  if (COMPLAINT.test(words)) {
    outcome.classification = "unclassified";
    return handOff("complaint");
  }

  // 3. Classify from the fixed list. No match is not a judgement call: it escalates.
  const type = classify(words);
  outcome.classification = type;
  if (type === "unclassified") return handOff("unclassified");

  // 4. The spoken address is a query, never a value.
  await say("What's the address of the property?");
  const spoken = await hear();
  outcome.address.spoken = spoken;
  const found = spoken ? await ports.resolveAddress(spoken) : null;
  if (!found || !found.resolved) return handOff("address_unresolved", "I couldn't confirm that address, so I'll pass this to the team rather than guess.");
  await say(`I have ${found.resolved}. Is that right?`);
  const confirm = await hear();
  if (!confirm || !YES.test(confirm)) return handOff("address_unresolved", "I'll pass this to the team so they can confirm the address with you.");
  outcome.address.resolved = found.resolved;
  outcome.address.confidence = "high";

  // 5. The service area.
  outcome.in_service_area = Boolean(found.inArea);
  if (!found.inArea) {
    outcome.outcome = "out_of_area";
    outcome.job.system = "none";
    await say(`Sorry, ${found.resolved} is outside the area we cover, so I can't book a job for it.`);
    await finish();
    return;
  }

  // 6. An open job on this number is updated, not duplicated.
  const intentId = `${callId}:call.received:roof-desk`;
  const open = await ports.findOpenJob(phone);
  let jobId = null;
  let duplicate = false;
  if (open && open.id) {
    const updated = await ports.updateJob(open.id, intentId);
    if (updated && updated.id === open.id) {
      jobId = open.id;
      duplicate = true;
      outcome.job.duplicate_of = open.id;
    }
  } else {
    // 7. Write once, then read the id back before calling it booked.
    const written = await ports.writeJob(
      { phone, address: found.resolved, type, description: words },
      intentId,
    );
    if (written && written.id) {
      const back = await ports.findOpenJob(phone);
      if (back && back.id === written.id) jobId = written.id;
    }
  }

  if (!jobId) {
    outcome.outcome = "escalated";
    await ports.notify(CONFIG.office, null, "write_failed");
    return handOff("write_failed", "I couldn't get that into our system, so I haven't booked it. Someone from the team will call you back.");
  }
  outcome.job.external_id = jobId;
  outcome.outcome = "booked";

  // 8. Confirm with a reference.
  if (duplicate) {
    await say(`You're already booked in, reference ${jobId}. I've added what you've told me to that job${type === "emergency" ? ", and the on-call roofer already has it" : ""}.`);
  } else if (type === "emergency") {
    await say(`I've booked that as an emergency, reference ${jobId}, and I'm letting the on-call roofer know now.`);
  } else {
    await say(`You're booked in, reference ${jobId}. The office will confirm a time with you on ${nextWorkingDay(now)}.`);
  }

  // 10. SMS only with consent, captured on the call with a timestamp.
  await say("Would you like me to text you that reference?");
  const sms = await hear();
  const given = Boolean(sms && YES.test(sms));
  await ports.recordConsent?.({ callId, channel: "sms", phone, given });
  if (given) await ports.sendSms?.(phone, `${CONFIG.business}: your job reference is ${jobId}.`);

  // 9. On-call: an emergency, out of hours, new job only. Once per job.
  if (type === "emergency" && !duplicate && isAfterHours(now)) {
    await ports.notify(CONFIG.onCall, jobId, "emergency");
    outcome.escalation.notified = `${CONFIG.onCall}, by phone alert`;
  }

  await finish();
}

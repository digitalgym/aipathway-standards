/**
 * Comeback List: the trade owner's morning list of past customers worth a
 * message today, built to AIP-BS-DATABASE-REACTIVATION 2026-10-24.
 * https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 *
 * Original build. The job: pick past customers from the job history who are
 * due a check-up or have not used us in a year, and draft a short message for
 * each for the owner to send.
 *
 * DRAFTS ONLY. Comeback List never sends a text, never sends an email and
 * never dials. It hands the owner a short list, and the owner sends each
 * message from their own phone or job system and marks what happened. A
 * customer who asked to be rung back is the only call the standard lets a
 * machine queue, and that is Office Voice's governed create_call, hosted and
 * not built here.
 *
 * HOW THE STANDARD'S FIELDS READ FOR A TRADE BUSINESS. The world keeps the
 * standard's field and play names; the meaning is the job history's:
 *
 *   nameAndMobile       the customer's name and mobile, off the job system
 *   address             the site address of their last job
 *   purchaseDate        the date their last job was completed (lastJobDate)
 *   lastContactOutcome  what happened the last time we reached out
 *   ownerType           "investor" = a landlord's rental, "owner_occupier" =
 *                       they live there. Only when the job record says so
 *   freshSaleNearby     a tech is already booked near them this week
 *   lastJobType         the kind of job it was ("aircon service")
 *   lastJobId           the job_id of that last completed job
 *
 *   tenure              check-up due: the owner's written return interval
 *                       for that kind of job has come round since the job
 *   equity_checkin      a tech in the area: a booked job nearby this week
 *   investor            a landlord's rental, before the next lease year
 *   lapsed_appraisal    lapsed: a quote that never went ahead, or a customer
 *                       who has not used us in a year
 *
 * What one run does, every weekday morning (schedule.tick, 7am local):
 *
 *   1. Read the customers off the job history, fresh. Nothing is cached.
 *   2. Stop on any customer with an open exception owned by a named person.
 *   3. Check the five fields. No name, mobile or address: not ready, out of
 *      every play. Any other gap limits only the play that needs it.
 *   4. A reply waiting goes to the owner (a price, a complaint, anything
 *      else). It is never answered here.
 *   5. Qualify each customer for at most one play, by something true.
 *   6. Honour the cadence from the record: one message a week, a reply ends
 *      a sequence, a sequence ends at its last step.
 *   7. Rank by the six rules. The ranking orders; it permits nothing.
 *   8. Gate every ranked customer, in rank order, underneath the ranking.
 *   9. Hand the first `dailyCap` cleared rows to the owner as today's list.
 *  10. Explain every customer who is not on it.
 */

const DAY = 86_400_000;
const MONTH = 30.44;

/** The ranking weights, in one place, as plain numbers. */
export const WEIGHTS = {
  callbackRequested: 1000, // rule 1: engagement state dominates everything
  techNearby: 100, // rule 2: boost, a tech already booked nearby this week
  sweetSpot: 50, // rule 3: boost, 12 to 24 months since the last job
  recentNo: -500, // rule 4: demote a recent no to the bottom, not out
  // rule 5: recency breaks ties only, so it carries no weight here
  // rule 6: ranking orders, it never permits, so the gate is its own step
};

/** The owner's written return intervals, in months, by kind of job. Theirs to edit. */
export const RETURN_MONTHS = {
  "aircon service": 12,
  "gutter clean": 12,
  "hot water service": 24,
  "switchboard check": 24,
  "drain clear": 12,
  "roof check": 24,
  "pest treatment": 12,
};

/** Not used us in a year. */
export const LAPSED_MONTHS = 12;
/** The boost band: long enough to be due, recent enough to remember us. */
export const SWEET_SPOT_MONTHS = { from: 12, to: 24 };
/** A no is demoted for this long after it was recorded. */
export const RECENT_NO_DAYS = 90;
/** At most one message a week. Someone spoken to waits a month. */
const COOL_OFF_DAYS = { spoke: 30, default: 7 };
/** A sequence is one message a week, and ends after this many whether or not anyone answered. */
export const SEQUENCE_STEPS = 3;
/** Short enough to read as a text from the owner. */
export const MESSAGE_MAX_WORDS = 50;

const REPLIES = new Set(["spoke", "callback_requested", "not_interested", "do_not_contact"]);
/** Two plays, one customer: the strongest current reason wins. */
const PLAY_PRIORITY = ["equity_checkin", "tenure", "investor", "lapsed_appraisal"];

const PRICE_RE = /\b(price|pricing|how much|cost|quote me|rates?|discount|deal)\b/i;
const COMPLAINT_RE = /\b(complain(t|ing)?|unhappy|disappointed|rude|terrible|still leaking|not fixed|annoyed|refund)\b/i;

const time = (d) => new Date(d).getTime();
const daysBetween = (a, b) => (time(b) - time(a)) / DAY;
const monthsSince = (d, now) => Math.floor(daysBetween(d, now) / MONTH);
const words = (s) => s.trim().split(/\s+/).length;

function firstName(c) {
  return String(c.nameAndMobile ?? "").split(",")[0].trim().split(/\s+/)[0] || "there";
}

function jobWords(c) {
  return c.lastJobType ? `the ${c.lastJobType}` : "the job";
}

/** Every play the customer qualifies for, each with the true thing that qualified it. */
export function qualify(c, missing, now) {
  const out = [];
  const dated = !missing.includes("purchaseDate");
  const months = dated ? monthsSince(c.purchaseDate, now) : null;
  const at = c.address;

  if (c.freshSaleNearby === true) {
    out.push({ play: "equity_checkin", trigger: `a tech already booked near ${at} this week` });
  }
  const interval = c.lastJobType ? RETURN_MONTHS[String(c.lastJobType).toLowerCase()] : undefined;
  if (dated && interval && months >= interval) {
    out.push({ play: "tenure", trigger: `${months} months since ${jobWords(c)} at ${at}, and it is due every ${interval}`, months });
  }
  if (!missing.includes("ownerType") && c.ownerType === "investor") {
    out.push({ play: "investor", trigger: `a rental at ${at} we last worked on for the landlord` });
  }
  const quoteLapsed = c.lastContactOutcome === "quote_not_accepted" || c.lastContactOutcome === "appraisal_not_converted";
  if (quoteLapsed) {
    out.push({ play: "lapsed_appraisal", trigger: `a quote for ${at} that never went ahead` });
  } else if (dated && months >= LAPSED_MONTHS) {
    out.push({ play: "lapsed_appraisal", trigger: `${months} months since we were last at ${at}`, months });
  }
  return out.sort((a, b) => PLAY_PRIORITY.indexOf(a.play) - PLAY_PRIORITY.indexOf(b.play));
}

/** Two drafts per play, each naming the reason. Split by customer so the split is stable. */
function variantFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2;
}

const OPT_OUT = "Reply STOP to opt out.";

const DRAFTS = {
  tenure: [
    (n, c, q) => `Hi ${n}, it has been ${q.months} months since ${jobWords(c)} at ${c.address}, and it is due again. Want us to pencil in a time?`,
    (n, c, q) => `Hi ${n}, ${jobWords(c)} at ${c.address} is due: ${q.months} months since we were there. Happy to book you in if that suits.`,
  ],
  equity_checkin: [
    (n, c) => `Hi ${n}, we have a tech booked near ${c.address} this week. Anything you would like looked at while they are close by?`,
    (n, c) => `Hi ${n}, one of our techs is working near ${c.address} this week. Worth a quick look at anything while they are nearby?`,
  ],
  investor: [
    (n, c) => `Hi ${n}, about your rental at ${c.address}: is there anything to sort before the next tenancy year?`,
    (n, c) => `Hi ${n}, for the rental at ${c.address}, would a check before the next lease year save a call-out later?`,
  ],
  lapsed_appraisal: [
    (n, c, q) => (q.months ? `Hi ${n}, it has been ${q.months} months since we were last at ${c.address}. Anything come up we can help with?` : `Hi ${n}, about the quote for ${c.address} that never went ahead: has anything changed since?`),
    (n, c, q) => (q.months ? `Hi ${n}, ${q.months} months since we were last out at ${c.address}. Is everything still working as it should?` : `Hi ${n}, we quoted for ${c.address} a while back. Is it still something you are thinking about?`),
  ],
};

/** The draft for the owner to send, from the owner's business, with a way out. */
export function draftMessage(c, entry, business) {
  const n = firstName(c);
  let body = DRAFTS[entry.play][variantFor(c.id)](n, c, entry);
  if (c.lastContactOutcome === "callback_requested") body = body.replace(`Hi ${n}, `, `Hi ${n}, as promised, `);
  const text = `${body} ${business}. ${OPT_OUT}`;
  if (words(text) > MESSAGE_MAX_WORDS) throw new Error(`draft for ${c.id} is ${words(text)} words`);
  return text;
}

function isRecentNo(c, now) {
  if (c.lastContactOutcome === "recent_no") return true;
  return c.lastContactOutcome === "not_interested" && !!c.lastOutcomeAt && daysBetween(c.lastOutcomeAt, now) < RECENT_NO_DAYS;
}

/** The score and its reasons, in plain words, so a later reader can say why. */
export function score(c, entry, now) {
  let s = 0;
  const why = [];
  if (c.lastContactOutcome === "callback_requested") {
    s += WEIGHTS.callbackRequested;
    why.push("asked us to get back to them");
  }
  if (c.freshSaleNearby === true) {
    s += WEIGHTS.techNearby;
    why.push("a tech is nearby this week");
  }
  if (c.purchaseDate) {
    const m = monthsSince(c.purchaseDate, now);
    if (m >= SWEET_SPOT_MONTHS.from && m <= SWEET_SPOT_MONTHS.to) {
      s += WEIGHTS.sweetSpot;
      why.push(`${m} months since the last job, in the 12 to 24 month band`);
    }
  }
  if (isRecentNo(c, now)) {
    s += WEIGHTS.recentNo;
    why.push("said no recently, demoted");
  }
  return { score: s, why: why.join("; ") || entry.trigger };
}

function cadenceHold(c, now) {
  const o = c.lastContactOutcome;
  if (c.lastOutcomeAt && o !== "callback_requested" && o !== "do_not_contact") {
    const limit = COOL_OFF_DAYS[o] ?? COOL_OFF_DAYS.default;
    const since = daysBetween(c.lastOutcomeAt, now);
    if (since < limit) return `cadence: ${o} marked ${Math.floor(since)} day(s) ago; one message a week, nothing for ${limit} days after ${o}`;
  }
  return null;
}

function sequenceStep(c, now) {
  if (!c.sequenceStartedAt) return null;
  const days = Math.floor(daysBetween(c.sequenceStartedAt, now));
  if (days < 0) return { due: false, step: 0 };
  return { due: days % 7 === 0, step: Math.floor(days / 7) + 1 };
}

const repliedSince = (c, from) => REPLIES.has(c.lastContactOutcome) && !!c.lastOutcomeAt && time(c.lastOutcomeAt) >= time(from);

/**
 * @param {import("@aipathway/conformance").ReactivationPorts} ports
 * @param {{ business?: string }} [opts]
 */
export async function build(ports, opts = {}) {
  const business = opts.business ?? "Coastline Plumbing";
  const now = await ports.now();
  const customers = await ports.readContacts();
  const cap = await ports.dailyCap();
  const candidates = [];

  for (const c of customers) {
    if (c.exceptionOwner) {
      await ports.skip(c.id, `open exception owned by ${c.exceptionOwner}; nothing until they close it`);
      continue;
    }
    if (c.lastContactOutcome === "do_not_contact" || c.doNotContact === true) await ports.flagDoNotContact(c.id);

    const missing = await ports.missingFields(c.id);
    const notReady = missing.filter((f) => f === "nameAndMobile" || f === "address");
    if (notReady.length) {
      await ports.skip(c.id, `not ready: missing ${notReady.join(" and ")}; held out of every play until the job system has it`);
      continue;
    }
    if (missing.includes("purchaseDate")) await ports.skip(c.id, "gap: no completed date on the last job; held out of the check-up and year-since plays only");
    if (missing.includes("ownerType")) await ports.skip(c.id, "gap: landlord or lives there not on the record; held out of the rental play only. Never guessed");
    if (missing.includes("lastContactOutcome")) await ports.skip(c.id, "gap: no last outcome on record; ranked as cold");

    if (c.messageConsent === false) {
      await ports.skip(c.id, "no consent to message on the record; a person decides whether to reach out");
      continue;
    }

    if (c.pendingReply) {
      await ports.noteReply(c.id);
      const reason = PRICE_RE.test(c.pendingReply) ? "price_question" : COMPLAINT_RE.test(c.pendingReply) ? "complaint" : "reply_outside_play";
      await ports.escalate(c.id, reason);
      await ports.skip(c.id, `reply waiting (${reason}); the owner answers it, nothing is drafted`);
      continue;
    }

    const plays = qualify(c, missing, now);
    if (!plays.length) {
      await ports.skip(c.id, "no play: nothing true about this customer today gives a reason to message");
      continue;
    }
    const entry = { ...plays[0] };

    const seq = sequenceStep(c, now);
    if (seq) {
      if (repliedSince(c, c.sequenceStartedAt)) {
        await ports.noteReply(c.id);
        await ports.skip(c.id, `sequence stopped: the customer replied (${c.lastContactOutcome}); nothing further from it`);
        continue;
      }
      if (seq.step > SEQUENCE_STEPS) {
        await ports.skip(c.id, `sequence ended at message ${SEQUENCE_STEPS} with no reply`);
        continue;
      }
      if (!seq.due) {
        await ports.skip(c.id, `sequence: between messages; message ${seq.step + 1} is due on its weekly day`);
        continue;
      }
      entry.step = seq.step;
    }

    const hold = cadenceHold(c, now);
    if (hold) {
      await ports.skip(c.id, hold);
      continue;
    }

    const s = score(c, entry, now);
    candidates.push({ c, entry, s });
  }

  candidates.sort(
    (a, b) =>
      b.s.score - a.s.score ||
      (b.c.lastOutcomeAt ? time(b.c.lastOutcomeAt) : 0) - (a.c.lastOutcomeAt ? time(a.c.lastOutcomeAt) : 0) ||
      String(a.c.id).localeCompare(String(b.c.id)),
  );
  await ports.rank(
    candidates.map((x) => ({
      contactId: x.c.id,
      play: x.entry.play,
      trigger: x.entry.trigger,
      score: x.s.score,
      why: x.s.why,
      ...(x.c.lastJobId ? { jobId: x.c.lastJobId } : {}),
      ...(x.entry.step ? { step: x.entry.step } : {}),
    })),
  );

  const rows = [];
  for (const x of candidates) {
    const g = await ports.gate(x.c.id);
    if (!g.allowed) {
      await ports.skip(x.c.id, `gate: ${g.reason ?? "held"}; not on today's list, whatever its rank`);
      continue;
    }
    if (rows.length >= cap) {
      await ports.skip(x.c.id, `beyond today's cap of ${cap}; ranked below the rows above`);
      continue;
    }
    rows.push({
      contactId: x.c.id,
      play: x.entry.play,
      reason: x.entry.trigger,
      opener: draftMessage(x.c, x.entry, business),
      lastOutcome: x.c.lastContactOutcome ?? "none",
      ...(x.c.lastJobId ? { jobId: x.c.lastJobId } : {}),
      ...(x.entry.step ? { step: x.entry.step } : {}),
    });
  }
  await ports.listToday(rows);
}

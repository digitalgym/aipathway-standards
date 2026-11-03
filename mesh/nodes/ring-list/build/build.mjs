/**
 * Ring List: the agent's morning call list, built to
 * AIP-BS-DATABASE-REACTIVATION 2026-10-24.
 * https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 *
 * A port of "Realtor Morning Brief" by Bryan Dunleavy, reimplemented from the
 * standard. Only the call-list job is ported: who to ring today, why, a drafted
 * opener under 40 words, and the things to sort out on top. Nothing here is
 * taken from the original bot's prompt or instructions.
 *
 * DRAFTS ONLY. Ring List never dials and never sends. The list is for a person,
 * who makes every call and every send. The one call the standard lets a
 * machine ring (a contact who asked to be rung back) is Office Voice's governed
 * create_call, which is hosted and not built here.
 *
 * What one run does, every weekday morning (schedule.tick, 9am local):
 *
 *   1. Read the contacts from the CRM export, fresh. Nothing is cached.
 *   2. Stop on any contact with an open exception owned by a named person.
 *   3. Check the five fields. No name, mobile or address: not ready, out of
 *      every play. Any other gap limits only the play that needs it.
 *   4. A reply waiting goes to a person (price, complaint, anything else). It is
 *      never answered here.
 *   5. Qualify each contact for at most one of the four plays, by a real trigger.
 *   6. Honour the cadence from the record: one opener a week, a reply ends a
 *      sequence, a sequence ends at its last step.
 *   7. Rank by the six rules. The ranking orders; it permits nothing.
 *   8. Gate every ranked contact, in rank order, underneath the ranking.
 *   9. Hand the first `dailyCap` cleared rows to the agent as today's list.
 *  10. Explain every contact that is not on it.
 *
 * Every effect goes through the ports. The agent's outcomes come back through
 * recordOutcome on the CRM row, and tomorrow's list is made from those rows.
 */

const DAY = 86_400_000;

/** The ranking weights, in one place, as plain numbers you can read. */
export const WEIGHTS = {
  callbackRequested: 1000, // rule 1: engagement state dominates everything
  freshSaleNearby: 100, // rule 2: boost, a fresh sale nearby
  tenureSweetSpot: 50, // rule 3: boost, 7 to 12 years since purchase
  recentNo: -500, // rule 4: demote a recent no to the bottom, not out
  // rule 5: recency breaks ties only, so it carries no weight here
  // rule 6: ranking orders, it never permits, so the gate is a separate step
};

/** Tenure play: the sweep starts at five years; the boost band is 7 to 12. */
export const TENURE_MIN_YEARS = 5;
export const SWEET_SPOT = { from: 7, to: 12 };

/** A no is demoted for this long after it was recorded. */
export const RECENT_NO_DAYS = 90;

/** At most one opener a week. Someone spoken to waits a month. */
const COOL_OFF_DAYS = { spoke: 30, default: 7 };

/** A sequence is one step a week, and ends after this many steps whether or not anyone answered. */
export const SEQUENCE_STEPS = 3;

/** Outcomes that are a reply. A reply ends a sequence at once. */
const REPLIES = new Set(["spoke", "callback_requested", "not_interested", "do_not_contact"]);

/** When a contact qualifies for more than one play, the strongest current reason wins. */
const PLAY_PRIORITY = ["lapsed_appraisal", "equity_checkin", "investor", "tenure"];

/** The original listing's ceiling, kept: an opener is under 40 words. */
export const OPENER_MAX_WORDS = 40;

const PRICE_RE = /\b(price|how much|what('?s| is) (it|my place|my house) worth|valuation|commission|fees?|offer)\b/i;
const COMPLAINT_RE = /\b(complain(t|ing)?|unhappy|disappointed|rude|terrible|not good enough|annoyed)\b/i;

const time = (d) => new Date(d).getTime();
const daysBetween = (a, b) => (time(b) - time(a)) / DAY;
const wordCount = (s) => s.trim().split(/\s+/).length;

function firstName(contact) {
  const name = String(contact.nameAndMobile ?? "").split(",")[0].trim();
  return name.split(/\s+/)[0] || "there";
}

function yearsSince(date, now) {
  return Math.floor(daysBetween(date, now) / 365.25);
}

/** The plays a contact qualifies for, each with the true thing that qualified it. */
export function qualify(contact, missing, now) {
  const out = [];
  if (contact.lastContactOutcome === "appraisal_not_converted") {
    out.push({ play: "lapsed_appraisal", trigger: `an appraisal on ${contact.address} that never went ahead` });
  }
  if (contact.freshSaleNearby === true) {
    out.push({ play: "equity_checkin", trigger: `a comparable sale near ${contact.address}` });
  }
  if (!missing.includes("ownerType") && contact.ownerType === "investor") {
    out.push({ play: "investor", trigger: `held as an investment: ${contact.address}` });
  }
  if (!missing.includes("purchaseDate")) {
    const years = yearsSince(contact.purchaseDate, now);
    if (years >= TENURE_MIN_YEARS) {
      out.push({ play: "tenure", trigger: `${years} years since buying ${contact.address}`, years });
    }
  }
  return out.sort((a, b) => PLAY_PRIORITY.indexOf(a.play) - PLAY_PRIORITY.indexOf(b.play));
}

/** Two openers per play, each naming the trigger. Split by contact so it is stable. */
function variantFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2;
}

const OPENERS = {
  tenure: [
    (n, c, q) => `Hi ${n}, it has been ${q.years} years since you bought ${c.address}, and the market has shifted since. Curious what it is worth now?`,
    (n, c, q) => `Hi ${n}, ${q.years} years at ${c.address} now. Would a quick update on what it is worth today be useful?`,
  ],
  equity_checkin: [
    (n, c) => `Hi ${n}, did you see what the place near ${c.address} just went for? Happy to share what it means for yours.`,
    (n, c) => `Hi ${n}, a comparable sale near ${c.address} has probably moved your place's value. Want the numbers?`,
  ],
  investor: [
    (n, c) => `Hi ${n}, about your investment at ${c.address}: would a first look at the right stock before it hits the portals be useful?`,
    (n, c) => `Hi ${n}, you hold ${c.address} as an investment. Looking to add to it? I can share the right stock before it reaches the portals.`,
  ],
  lapsed_appraisal: [
    (n, c) => `Hi ${n}, we did an appraisal on ${c.address} a while back. What has changed since we last spoke?`,
    (n, c) => `Hi ${n}, about the appraisal on ${c.address}: has anything changed for you since then?`,
  ],
};

export function draftOpener(contact, entry) {
  const name = firstName(contact);
  const base = OPENERS[entry.play][variantFor(contact.id)](name, contact, entry);
  const lead = `Hi ${name}, `;
  const rest = base.slice(lead.length);
  const text =
    contact.lastContactOutcome === "callback_requested"
      ? `${lead}ringing back as you asked. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
      : base;
  if (wordCount(text) >= OPENER_MAX_WORDS) throw new Error(`opener for ${contact.id} is ${wordCount(text)} words`);
  return text;
}

function isRecentNo(contact, now) {
  if (contact.lastContactOutcome === "recent_no") return true;
  return contact.lastContactOutcome === "not_interested" && !!contact.lastOutcomeAt && daysBetween(contact.lastOutcomeAt, now) < RECENT_NO_DAYS;
}

/** The score and its reasons, in plain words, so a later reader can say why. */
export function score(contact, entry, now) {
  let s = 0;
  const why = [];
  const state = contact.lastContactOutcome === "callback_requested" ? "callback" : contact.lastContactOutcome ? "known" : "cold";
  if (state === "callback") {
    s += WEIGHTS.callbackRequested;
    why.push("asked for a call back");
  }
  if (contact.freshSaleNearby === true) {
    s += WEIGHTS.freshSaleNearby;
    why.push("fresh sale nearby");
  }
  if (contact.purchaseDate) {
    const y = yearsSince(contact.purchaseDate, now);
    if (y >= SWEET_SPOT.from && y <= SWEET_SPOT.to) {
      s += WEIGHTS.tenureSweetSpot;
      why.push(`${y} years owned, in the 7 to 12 year band`);
    }
  }
  if (isRecentNo(contact, now)) {
    s += WEIGHTS.recentNo;
    why.push("said no recently, demoted");
  }
  return { score: s, state, why: why.join("; ") || entry.trigger };
}

/** Cadence, read from the record. Returns a reason to hold the contact today, or null. */
function cadenceHold(contact, now) {
  const o = contact.lastContactOutcome;
  if (contact.lastOutcomeAt && o !== "callback_requested" && o !== "do_not_contact") {
    const limit = COOL_OFF_DAYS[o] ?? COOL_OFF_DAYS.default;
    const since = daysBetween(contact.lastOutcomeAt, now);
    if (since < limit) return `cadence: ${o} recorded ${Math.floor(since)} day(s) ago; one opener a week, and nothing for ${limit} days after ${o}`;
  }
  return null;
}

/** The step of a running sequence, from the date the CRM stamped when it started. */
function sequenceStep(contact, now) {
  if (!contact.sequenceStartedAt) return null;
  const days = Math.floor(daysBetween(contact.sequenceStartedAt, now));
  if (days < 0) return { due: false, step: 0 };
  return { due: days % 7 === 0, step: Math.floor(days / 7) + 1 };
}

const repliedSince = (contact, from) =>
  REPLIES.has(contact.lastContactOutcome) && !!contact.lastOutcomeAt && time(contact.lastOutcomeAt) >= time(from);

/**
 * @param {import("@aipathway/conformance").ReactivationPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const contacts = await ports.readContacts();
  const cap = await ports.dailyCap();
  const candidates = [];

  for (const c of contacts) {
    // Halt on an open exception with a named owner. That person resumes it.
    if (c.exceptionOwner) {
      await ports.skip(c.id, `open exception owned by ${c.exceptionOwner}; nothing until they close it`);
      continue;
    }
    // An opt-out on the row is made permanent and global, where an import cannot reach it.
    if (c.lastContactOutcome === "do_not_contact" || c.doNotContact === true) await ports.flagDoNotContact(c.id);

    const missing = await ports.missingFields(c.id);
    const notReady = missing.filter((f) => f === "nameAndMobile" || f === "address");
    if (notReady.length) {
      await ports.skip(c.id, `not ready: missing ${notReady.join(" and ")}; held out of every play until it is filled in`);
      continue;
    }
    if (missing.includes("purchaseDate")) await ports.skip(c.id, "gap: purchase date missing; held out of the tenure play only. Capture it on the next call");
    if (missing.includes("ownerType")) await ports.skip(c.id, "gap: investor or owner-occupier not known; held out of the investor play only. Never guessed");
    if (missing.includes("lastContactOutcome")) await ports.skip(c.id, "gap: no last contact outcome; ranked as cold");

    // A reply waiting goes to a person. Ring List never answers it.
    if (c.pendingReply) {
      await ports.noteReply(c.id);
      const reason = PRICE_RE.test(c.pendingReply) ? "price_question" : COMPLAINT_RE.test(c.pendingReply) ? "complaint" : "reply_outside_play";
      await ports.escalate(c.id, reason);
      await ports.skip(c.id, `reply waiting (${reason}); a person answers it, nothing is drafted`);
      continue;
    }

    const plays = qualify(c, missing, now);
    if (!plays.length) {
      await ports.skip(c.id, "no play: nothing true about this contact today gives a reason to ring");
      continue;
    }
    const entry = plays[0];

    // A running sequence: a reply ends it, and it ends at its last step regardless.
    const seq = sequenceStep(c, now);
    if (seq) {
      if (repliedSince(c, c.sequenceStartedAt)) {
        await ports.noteReply(c.id);
        await ports.skip(c.id, `sequence stopped: the contact replied (${c.lastContactOutcome}); nothing further from it`);
        continue;
      }
      if (seq.step > SEQUENCE_STEPS) {
        await ports.skip(c.id, `sequence ended at step ${SEQUENCE_STEPS} with no reply`);
        continue;
      }
      if (!seq.due) {
        await ports.skip(c.id, `sequence: between steps, next step ${seq.step + 1} is due on its weekly day`);
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
    candidates.push({
      contact: c,
      entry: { contactId: c.id, play: entry.play, trigger: entry.trigger, score: s.score, state: s.state, why: s.why, ...(entry.step ? { step: entry.step } : {}) },
      years: entry.years,
    });
  }

  // Rank: score, then recency of last contact breaks ties only, then id for a stable order.
  candidates.sort(
    (a, b) =>
      b.entry.score - a.entry.score ||
      (b.contact.lastOutcomeAt ? time(b.contact.lastOutcomeAt) : 0) - (a.contact.lastOutcomeAt ? time(a.contact.lastOutcomeAt) : 0) ||
      String(a.contact.id).localeCompare(String(b.contact.id)),
  );
  await ports.rank(candidates.map((x) => x.entry));

  // The gate, underneath the ranking: every contact, in rank order, whatever its score.
  const rows = [];
  for (const x of candidates) {
    const g = await ports.gate(x.contact.id);
    if (!g.allowed) {
      await ports.skip(x.contact.id, `gate: ${g.reason ?? "held"}; not on today's list, whatever its rank`);
      continue;
    }
    if (rows.length >= cap) {
      await ports.skip(x.contact.id, `beyond today's cap of ${cap}; ranked lower than the rows above`);
      continue;
    }
    rows.push({
      contactId: x.contact.id,
      play: x.entry.play,
      reason: x.entry.trigger,
      opener: draftOpener(x.contact, { ...x.entry, years: x.years }),
      lastOutcome: x.contact.lastContactOutcome ?? "none",
      ...(x.entry.step ? { step: x.entry.step } : {}),
    });
  }
  await ports.listToday(rows);
}

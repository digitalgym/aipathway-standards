/**
 * Seller Book: the seller texts an agency drafts each morning from its own
 * database, for the agent's OK, with every outcome kept on the record.
 * Built to AIP-BS-DATABASE-REACTIVATION 2026-10-24.
 * https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 *
 * The job, in the agent's words: "Each morning, show me which past sellers and
 * appraisals in my own database to text today, why each one, with the text
 * drafted for my OK. Send only what I OK, stop when they reply, and keep every
 * outcome and follow-up on the contact."
 *
 * One function, woken by one of four things. It keeps nothing between runs:
 * every decision is made from the contact rows as the CRM holds them.
 *
 *   schedule.tick     the morning list. Read, check the five fields, qualify
 *                     each contact for at most one play, rank, gate under the
 *                     ranking, cap, and publish the list of drafted texts.
 *   text.approved     the agent OK'd a drafted text. Re-read the contact by
 *                     id, gate it again (the OK can come hours later), honour
 *                     the cadence, send it through the CRM's own SMS, and log
 *                     it on the contact.
 *   reply.received    a seller replied. The sequence stops. An opt-out is
 *                     permanent. A price, an offer or a complaint goes to a
 *                     person and is never answered here.
 *   outcome.marked    the agent marked a row done. Written back the same day,
 *                     so tomorrow's list is made from it.
 *
 * WHAT STAYS WITH A PERSON. Seller Book never states a price, never makes or
 * discusses an offer, and never sends anything the agent did not OK. It never
 * dials: a seller who asks to be rung goes to the top of tomorrow's list for
 * the agent, and the optional callback on Office Voice is hosted, not built.
 *
 * Australian rules, as the standard reads them: a text is a commercial
 * electronic message under the Spam Act 2003, so it goes only to a contact the
 * agency already has a relationship with, it names the sender, and it carries
 * a working opt-out. A STOP reply is a do-not-contact outcome across every
 * play. Sending hours are the contact's local time, enforced by the gate.
 */

const DAY = 86_400_000;

/** The ranking weights, in one place, as plain numbers anyone can read. */
export const WEIGHTS = {
  askedToBeRung: 1000, // rule 1: engagement state dominates everything
  saleNearby: 100, // rule 2: boost, a fresh comparable sale nearby
  tenureBand: 50, // rule 3: boost, roughly 7 to 12 years since purchase
  recentNo: -500, // rule 4: a recent no goes to the bottom, not out
  // rule 5: recency breaks ties only, so it has no weight; see the sort
  // rule 6: ranking orders, it never permits; the gate is a separate call
};

export const TENURE_FROM_YEARS = 5;
export const TENURE_BAND = { from: 7, to: 12 };
export const RECENT_NO_DAYS = 90;
/** One text a week at most; a seller who engaged waits a month. */
export const QUIET_DAYS = { spoke: 30, default: 7 };
/** A sequence is at most this many texts, a week apart, whether or not anyone answered. */
export const SEQUENCE_TEXTS = 3;
export const OPENER_MAX_WORDS = 40;

/** Who signs the text. Theirs to set; the Spam Act wants the sender named. */
export const DEFAULT_SENDER = { name: "Jo", agency: "the agency" };

/** If a contact qualifies for more than one play, the strongest current reason wins. */
const PLAY_ORDER = ["lapsed_appraisal", "equity_checkin", "investor", "tenure"];
/** Outcomes that mean the seller answered. Any one ends a sequence. */
const ANSWERED = new Set(["spoke", "callback_requested", "not_interested", "do_not_contact"]);

const OPT_OUT_RE = /^\s*(stop|unsubscribe|opt ?out)\b|\b(stop texting|don'?t (text|contact|call) me|remove me)\b/i;
const PRICE_RE = /\b(price|offer|how much|worth|valuation|appraisal figure|cash|\$\s?\d|commission|fees?)\b/i;
const COMPLAINT_RE = /\b(complain(t|ing)?|unhappy|disappointed|rude|harass(ing|ment)?|annoyed|terrible)\b/i;
const RING_ME_RE = /\b(call|ring|phone) me\b|\bgive me a (call|ring)\b/i;
const NOT_NOW_RE = /\b(not interested|no thanks|not selling|no thank you)\b/i;

const ms = (d) => new Date(d).getTime();
const daysBetween = (a, b) => (ms(b) - ms(a)) / DAY;
const words = (s) => s.trim().split(/\s+/).length;
const yearsSince = (d, now) => Math.floor(daysBetween(d, now) / 365.25);

function firstName(c) {
  return String(c.nameAndMobile ?? "").split(",")[0].trim().split(/\s+/)[0] || "there";
}

/** Every play a contact qualifies for, each with the true thing that qualified it. */
export function plays(c, missing, now) {
  const out = [];
  if (c.lastContactOutcome === "appraisal_not_converted") {
    out.push({ play: "lapsed_appraisal", trigger: `the appraisal we did on ${c.address}` });
  }
  if (c.freshSaleNearby === true) {
    out.push({ play: "equity_checkin", trigger: `a recent sale near ${c.address}` });
  }
  if (!missing.includes("ownerType") && c.ownerType === "investor") {
    out.push({ play: "investor", trigger: `your investment at ${c.address}` });
  }
  if (!missing.includes("purchaseDate")) {
    const years = yearsSince(c.purchaseDate, now);
    if (years >= TENURE_FROM_YEARS) out.push({ play: "tenure", trigger: `${years} years since you bought ${c.address}`, years });
  }
  return out.sort((a, b) => PLAY_ORDER.indexOf(a.play) - PLAY_ORDER.indexOf(b.play));
}

/** Two drafts per play, alternated by contact so the split is stable. */
const DRAFTS = {
  tenure: [
    (n, t) => `Hi ${n}, it has been ${t}, and the market has moved since. Curious what it would fetch now?`,
    (n, t) => `Hi ${n}, ${t} now. Would a quick, no-fuss update on where it sits today be useful?`,
  ],
  equity_checkin: [
    (n, t) => `Hi ${n}, did you see ${t}? Happy to share what it could mean for your place.`,
    (n, t) => `Hi ${n}, ${t} has probably moved what your place is worth. Want the numbers?`,
  ],
  investor: [
    (n, t) => `Hi ${n}, about ${t}: would first look at the right stock before it reaches the portals help?`,
    (n, t) => `Hi ${n}, a thought on ${t}: want a heads up on suitable stock before it is advertised?`,
  ],
  lapsed_appraisal: [
    (n, t) => `Hi ${n}, about ${t} a while back. What has changed for you since we last spoke?`,
    (n, t) => `Hi ${n}, following up ${t}. Has anything changed on your side since then?`,
  ],
};
const FOLLOW_UPS = {
  2: (n, t) => `Hi ${n}, just following up on ${t}. Happy to help whenever suits.`,
  3: (n, t) => `Hi ${n}, last note from me about ${t}. I will leave it with you.`,
};

function variant(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2;
}

/** The drafted text: the opener, which names the reason, then the sender and the opt-out. */
export function draftText(c, entry, sender = DEFAULT_SENDER) {
  const n = firstName(c);
  const step = entry.step ?? 1;
  let opener = step > 1 ? FOLLOW_UPS[step](n, entry.trigger) : DRAFTS[entry.play][variant(c.id)](n, entry.trigger);
  if (c.lastContactOutcome === "callback_requested") opener = `Hi ${n}, you asked me to come back to you. ${opener.slice(`Hi ${n}, `.length)}`;
  if (words(opener) > OPENER_MAX_WORDS) throw new Error(`draft for ${c.id} runs to ${words(opener)} words`);
  return { opener, body: `${opener} ${sender.name}, ${sender.agency}. Reply STOP to opt out.` };
}

function isRecentNo(c, now) {
  if (c.lastContactOutcome === "recent_no") return true;
  return c.lastContactOutcome === "not_interested" && !!c.lastOutcomeAt && daysBetween(c.lastOutcomeAt, now) < RECENT_NO_DAYS;
}

/** The score, and the reasons for it in words, so a later reader can say why. */
export function score(c, now) {
  let s = 0;
  const why = [];
  const state = c.lastContactOutcome === "callback_requested" ? "asked_to_be_rung" : c.lastContactOutcome ? "known" : "cold";
  if (state === "asked_to_be_rung") (s += WEIGHTS.askedToBeRung), why.push("asked to be rung back");
  if (c.freshSaleNearby === true) (s += WEIGHTS.saleNearby), why.push("fresh sale nearby");
  if (c.purchaseDate) {
    const y = yearsSince(c.purchaseDate, now);
    if (y >= TENURE_BAND.from && y <= TENURE_BAND.to) (s += WEIGHTS.tenureBand), why.push(`${y} years owned`);
  }
  if (isRecentNo(c, now)) (s += WEIGHTS.recentNo), why.push("said no recently, demoted");
  return { score: s, state, why: why.join("; ") || "no boost" };
}

/** A reason to leave the contact alone today, read from the record, or null. */
function quietHold(c, now) {
  const o = c.lastContactOutcome;
  if (!c.lastOutcomeAt || o === "callback_requested") return null;
  const limit = QUIET_DAYS[o] ?? QUIET_DAYS.default;
  const since = daysBetween(c.lastOutcomeAt, now);
  return since < limit ? `quiet: ${o} logged ${Math.floor(since)} day(s) ago; one text a week, nothing for ${limit} days after ${o}` : null;
}

/** The next text of a running sequence, from the date the CRM stamped on its first text. */
function sequenceStep(c, now) {
  if (!c.sequenceStartedAt) return null;
  const days = Math.floor(daysBetween(c.sequenceStartedAt, now));
  return { due: days >= 0 && days % 7 === 0, step: Math.floor(days / 7) + 1 };
}

async function findById(ports, id) {
  const rows = await ports.readContacts();
  return rows.find((r) => r.id === id) ?? null;
}

/** Morning: today's list of drafted texts. */
async function morning(ports, sender) {
  const now = await ports.now();
  const contacts = await ports.readContacts();
  const cap = await ports.dailyCap();
  const ranked = [];

  for (const c of contacts) {
    if (c.exceptionOwner) {
      await ports.skip(c.id, `open exception owned by ${c.exceptionOwner}; nothing until they close it`);
      continue;
    }
    // An opt-out on the row is moved where a re-import cannot reach it.
    if (c.lastContactOutcome === "do_not_contact" || c.doNotContact === true) await ports.flagDoNotContact(c.id);

    const missing = await ports.missingFields(c.id);
    const blocking = missing.filter((f) => f === "nameAndMobile" || f === "address");
    if (blocking.length) {
      await ports.skip(c.id, `not ready: missing ${blocking.join(" and ")}; out of every play until it is filled in`);
      continue;
    }
    if (missing.includes("purchaseDate")) await ports.skip(c.id, "gap: purchase date missing; out of the tenure play only. Ask for it when you speak");
    if (missing.includes("ownerType")) await ports.skip(c.id, "gap: investor or owner-occupier not known; out of the investor play only. Never guessed");
    if (missing.includes("lastContactOutcome")) await ports.skip(c.id, "gap: no last contact outcome; ranked as cold");
    if (c.textConsent === false) {
      await ports.skip(c.id, "no consent to text on the record; Seller Book drafts no text for this contact");
      continue;
    }

    const qualified = plays(c, missing, now);
    if (!qualified.length) {
      await ports.skip(c.id, "no play: nothing true about this contact today gives a reason to text");
      continue;
    }
    const entry = { ...qualified[0] };

    const seq = sequenceStep(c, now);
    if (seq) {
      if (ANSWERED.has(c.lastContactOutcome) && c.lastOutcomeAt && ms(c.lastOutcomeAt) >= ms(c.sequenceStartedAt)) {
        await ports.noteReply(c.id);
        await ports.skip(c.id, `sequence stopped: the seller answered (${c.lastContactOutcome}); nothing further from it`);
        continue;
      }
      if (seq.step > SEQUENCE_TEXTS) {
        await ports.skip(c.id, `sequence ended after text ${SEQUENCE_TEXTS} with no reply`);
        continue;
      }
      if (!seq.due) {
        await ports.skip(c.id, `sequence: between texts; text ${seq.step + 1} is due on its weekly day`);
        continue;
      }
      entry.step = seq.step;
    }

    const hold = quietHold(c, now);
    if (hold) {
      await ports.skip(c.id, hold);
      continue;
    }

    const s = score(c, now);
    ranked.push({ c, entry: { contactId: c.id, play: entry.play, trigger: entry.trigger, score: s.score, state: s.state, why: s.why, ...(entry.step ? { step: entry.step } : {}) }, years: entry.years });
  }

  // Score first. Recency of the last outcome breaks ties only; then the id, for a stable order.
  ranked.sort(
    (a, b) =>
      b.entry.score - a.entry.score ||
      (b.c.lastOutcomeAt ? ms(b.c.lastOutcomeAt) : 0) - (a.c.lastOutcomeAt ? ms(a.c.lastOutcomeAt) : 0) ||
      String(a.c.id).localeCompare(String(b.c.id)),
  );
  await ports.rank(ranked.map((x) => x.entry));

  // The gate sits under the ranking: every ranked contact is asked, whatever its score.
  const rows = [];
  for (const x of ranked) {
    const g = await ports.gate(x.c.id);
    if (!g.allowed) {
      await ports.skip(x.c.id, `gate: ${g.reason ?? "held"}; not on today's list, whatever its rank`);
      continue;
    }
    if (rows.length >= cap) {
      await ports.skip(x.c.id, `past today's cap of ${cap}; ranked below the rows above`);
      continue;
    }
    const draft = draftText(x.c, x.entry, sender);
    rows.push({
      contactId: x.c.id,
      play: x.entry.play,
      reason: x.entry.trigger,
      opener: draft.opener,
      text: draft.body,
      lastOutcome: x.c.lastContactOutcome ?? "none",
      step: x.entry.step ?? 1,
    });
  }
  await ports.listToday(rows);
}

/** The agent OK'd a drafted text. Send it only if every rule still holds now. */
async function approved(ports, ev, sender) {
  const now = await ports.now();
  const c = await findById(ports, ev.contactId);
  if (!c) {
    await ports.skip(ev.contactId, "no contact with this id; nothing sent");
    return;
  }
  if (c.exceptionOwner) {
    await ports.skip(c.id, `open exception owned by ${c.exceptionOwner}; nothing sent until they close it`);
    return;
  }
  const missing = await ports.missingFields(c.id);
  if (missing.includes("nameAndMobile") || missing.includes("address")) {
    await ports.skip(c.id, "not ready: missing name, mobile or address; nothing sent");
    return;
  }
  if (c.textConsent === false) {
    await ports.skip(c.id, "no consent to text on the record; nothing sent");
    return;
  }
  const step = ev.step ?? 1;
  if (step > SEQUENCE_TEXTS) {
    await ports.skip(c.id, `sequence ended after text ${SEQUENCE_TEXTS}; text ${step} not sent`);
    return;
  }
  if (step > 1 && ANSWERED.has(c.lastContactOutcome)) {
    await ports.noteReply(c.id);
    await ports.skip(c.id, `sequence stopped: the seller answered (${c.lastContactOutcome}); text ${step} not sent`);
    return;
  }
  if (step === 1) {
    const hold = quietHold(c, now);
    if (hold) {
      await ports.skip(c.id, `${hold}; text not sent`);
      return;
    }
  }
  const g = await ports.gate(c.id);
  if (!g.allowed) {
    await ports.skip(c.id, `gate: ${g.reason ?? "held"}; the OK'd text was not sent`);
    return;
  }
  const qualified = plays(c, missing, now);
  const entry = qualified.find((p) => p.play === ev.play) ?? qualified[0];
  if (!entry) {
    await ports.skip(c.id, "no play qualifies this contact any more; nothing sent");
    return;
  }
  const draft = draftText(c, { ...entry, step }, sender);
  const res = await ports.sendStep(c.id, step, draft.body);
  if (!res.sent) {
    await ports.skip(c.id, `not sent: ${res.why ?? "refused"}`);
    return;
  }
  // Logged on the contact: sent, no answer yet. The quiet week runs from here.
  await ports.recordOutcome(c.id, "no_answer");
}

/** A seller replied. The sequence stops; a person handles anything that is a relationship. */
async function replied(ports, ev) {
  const c = await findById(ports, ev.contactId);
  if (!c) {
    await ports.skip(ev.contactId, "reply from no known contact id; left for a person");
    return;
  }
  const text = String(ev.text ?? "");
  await ports.noteReply(c.id);
  if (OPT_OUT_RE.test(text)) {
    await ports.flagDoNotContact(c.id);
    await ports.recordOutcome(c.id, "do_not_contact");
    return;
  }
  if (PRICE_RE.test(text)) {
    await ports.escalate(c.id, "price_question");
    await ports.recordOutcome(c.id, "spoke");
    await ports.skip(c.id, "reply asks about a price or an offer; a person answers it, nothing is drafted");
    return;
  }
  if (COMPLAINT_RE.test(text)) {
    await ports.escalate(c.id, "complaint");
    await ports.recordOutcome(c.id, "spoke");
    await ports.skip(c.id, "reply is a complaint; a person answers it, nothing is drafted");
    return;
  }
  if (RING_ME_RE.test(text)) {
    await ports.recordOutcome(c.id, "callback_requested");
    return;
  }
  await ports.recordOutcome(c.id, NOT_NOW_RE.test(text) ? "not_interested" : "spoke");
  if (!NOT_NOW_RE.test(text)) await ports.skip(c.id, "reply outside the play; left for a person to answer");
}

const OUTCOMES = new Set(["spoke", "no_answer", "callback_requested", "not_interested", "do_not_contact"]);

/** The agent marked a row done. Written back the same day. */
async function marked(ports, ev) {
  if (!OUTCOMES.has(ev.outcome)) {
    await ports.skip(ev.contactId, `unknown outcome "${ev.outcome}"; nothing written`);
    return;
  }
  const c = await findById(ports, ev.contactId);
  if (!c) {
    await ports.skip(ev.contactId, "no contact with this id; nothing written");
    return;
  }
  if (ev.outcome === "do_not_contact") await ports.flagDoNotContact(c.id);
  await ports.recordOutcome(c.id, ev.outcome);
}

/**
 * @param {import("@aipathway/conformance").ReactivationPorts} ports
 * @param {{ type?: string, contactId?: string, step?: number, play?: string, text?: string, outcome?: string }} [event]
 * @param {{ sender?: { name: string, agency: string } }} [settings]
 */
export async function build(ports, event = { type: "schedule.tick" }, settings = {}) {
  const sender = settings.sender ?? DEFAULT_SENDER;
  switch (event.type ?? "schedule.tick") {
    case "schedule.tick":
      return morning(ports, sender);
    case "text.approved":
      return approved(ports, event, sender);
    case "reply.received":
      return replied(ports, event);
    case "outcome.marked":
      return marked(ports, event);
    default:
      await ports.skip(event.contactId ?? "-", `unknown event "${event.type}"; nothing done`);
  }
}

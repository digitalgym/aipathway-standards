/**
 * Quote Keeper: the quote follow-up job, built to AIP-BS-FOLLOW-UP 2026-10-05.
 * https://aipathway.com.au/explore-ai/follow-up-build-standard
 *
 * Reimplemented from the standard and from a one-line public description of a
 * quote follow-up bot. Nothing here is taken from that bot's prompt,
 * instructions or workflow.
 *
 * The job: every quote or estimate the business sends is an open item on the
 * register, owed back as a decision. Quote Keeper chases each one on the
 * cadence the owner wrote down, in the wording the owner approved, on a
 * channel the customer consented to, until the decision arrives. A no, a
 * dispute, a stop, or the cap goes to a named person. It never discounts,
 * never re-quotes and never argues.
 *
 * One run, every time it is woken (schedule.tick, or quote.sent /
 * quote.accepted / quote.declined / exception.closed for one id):
 *
 *   1. Read the register fresh. Only well-formed open items count: a kind from
 *      the closed list, the record it belongs to, who owes it, a due date.
 *   2. File any arrival (the signed acceptance, the PO, the form) as evidence
 *      first, so nothing arrived is ever ranked or touched.
 *   3. Rank by value at risk, then days open. Never age alone.
 *   4. Per item, in that order: halt on an open exception; read the cadence and
 *      the item's record; at the cap, escalate once to the named person with
 *      every touch; otherwise pick the first consented channel and ask the gate.
 *   5. A text or an email in the approved wording, or the call: disclosure
 *      first, one ask, one recorded outcome (a date, a decision, a no, a
 *      dispute). The live call is the hosted step; this is the gate around it.
 *
 * Every effect goes through the ports. Nothing is remembered between runs:
 * touches, outcomes and arrivals are read back from the record each time.
 */

const DAY = 86_400_000;

export const KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];

/** What each kind is called in a message, in plain Australian office words. */
const OWED = {
  quote_decision: "a yes or no on the quote",
  signed_variation: "the signed variation",
  certificate: "the certificate",
  po_number: "your purchase order number",
  form: "the signed form",
};

/**
 * The owner's approved voice. Every message and every spoken turn comes from
 * these templates and nothing else; an owner swaps the wording, never the
 * rules. Each message names the business and carries an opt-out, as the Spam
 * Act 2003 asks of a commercial electronic message.
 */
export const DEFAULT_VOICE = {
  business: "the office",
  sms: (item, v) =>
    `Hi, ${v.business} here about ${item.recordRef}. Just checking in: are you still weighing it up? ` +
    `Reply with a yes, a no, or a day that suits, and we will take it from there. Reply STOP to opt out.`,
  email: (item, v) =>
    `Hi, a quick follow-up from ${v.business} on ${item.recordRef}. ` +
    `When you have a moment, could you let us know ${OWED[item.kind]}? A yes, a no or a date all help. ` +
    `If you would rather not hear from us about it, reply and say so.`,
  disclosure: (item, v) => `Hi, this is an AI assistant calling for ${v.business}. This call is recorded.`,
  ask: (item) => `I am calling about ${item.recordRef}. Could you let us know ${OWED[item.kind]}, or a day you will have it?`,
  close: () => "Thanks, I have noted that. Someone from the office will follow up if needed.",
};

const isOpenItem = (i) =>
  KINDS.includes(i.kind) && Boolean(i.recordRef) && Boolean(i.owedBy) && Boolean(i.due) && i.status === "open";

const daysOpen = (item, now) => Math.max(0, Math.floor((now.getTime() - new Date(item.openedAt).getTime()) / DAY));

/** Value at risk first, days open breaking ties. The Debtor Chasing rule. */
export function rankItems(items, now) {
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: Number(i.valueAtRisk) || 0, daysOpen: daysOpen(i, now) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

/** The latest date the customer gave, if it is still ahead: hold until then. */
function heldUntil(record, now) {
  const dates = record.outcomes.filter((o) => o.kind === "date").map((o) => o.value);
  const last = dates[dates.length - 1];
  return last && now.toISOString().slice(0, 10) < last ? last : null;
}

/** A spoken reply, read into the one outcome it is. */
function outcomeOf(reply) {
  switch (reply.heard) {
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(reply.value ?? "") ? { kind: "date", value: reply.value } : null;
    case "decision":
      return { kind: "decision", value: reply.value === "approved" ? "approved" : "decided" };
    case "declined":
      return { kind: "declined", value: "declined" };
    case "dispute":
      return { kind: "dispute", value: "dispute" };
    case "stop":
      return { kind: "dispute", value: "stop_contacting_me" };
    default:
      return null;
  }
}

/**
 * The call, for one item, after the gate allowed it. Disclosure first, then
 * the single ask, then the answer written down as an object. A no or a
 * dispute goes to the named person that moment.
 */
async function callItem(ports, item, cadence, voice) {
  await ports.disclose(item.id, voice.disclosure(item, voice));
  await ports.say(item.id, voice.ask(item, voice));
  const reply = await ports.listen(item.id);
  const outcome = outcomeOf(reply);
  if (!outcome) return; // silence: the touch stands with no outcome, visible on the record as exactly that
  const recorded = await ports.recordOutcome(item.id, outcome);
  await ports.say(item.id, voice.close(item, voice));
  if (outcome.kind === "decision") {
    await ports.attachEvidence(item.id, `outcome:${recorded.id}`);
    return;
  }
  if (outcome.kind === "declined" || outcome.kind === "dispute") {
    const record = await ports.readRecord(item.id);
    await ports.escalate(item.id, outcome.kind, cadence.escalateTo, record.touches);
    await ports.notify(
      cadence.escalateTo,
      `${item.recordRef}: the customer said "${reply.text}" on the call. Recorded as ${outcome.kind}; the chase has stopped and it is yours.`,
    );
  }
}

/**
 * One run.
 *
 * config.itemId     scope the run to one item (a webhook wake), else the whole register
 * config.exceptions (id) => { owner } | null: an open exception halts that item
 * config.voice      the owner's approved wording, merged over DEFAULT_VOICE
 *
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports, config = {}) {
  const voice = { ...DEFAULT_VOICE, ...(config.voice ?? {}) };
  const now = ports.now();
  const register = (await ports.readItems()).filter((i) => !config.itemId || i.id === config.itemId);
  const consents = await ports.readConsents();
  const consented = (contactId, channel) => channel === "call" || consents.some((c) => c.contactId === contactId && c.channel === channel);

  // Arrivals first. The document or decision came back: file it, and it leaves the chase.
  const open = [];
  for (const item of register.filter(isOpenItem)) {
    if (item.received) {
      await ports.attachEvidence(item.id, item.received.ref);
      continue;
    }
    open.push(item);
  }

  const order = rankItems(open, now);
  await ports.rank(order);
  const byId = new Map(open.map((i) => [i.id, i]));

  for (const { itemId } of order) {
    const item = byId.get(itemId);
    if (config.exceptions?.(itemId)) continue; // a named person owns it: do nothing

    const cadence = await ports.readCadence(item.kind);
    const record = await ports.readRecord(itemId);
    if (record.arrival || record.escalations.length > 0) continue;
    if (record.outcomes.some((o) => o.kind === "declined" || o.kind === "dispute")) continue;

    if (record.touches.length >= cadence.maxTouches) {
      // Once, to a named person, with every touch so far. Never a second cadence.
      await ports.escalate(itemId, "cap_reached", cadence.escalateTo, record.touches);
      await ports.notify(
        cadence.escalateTo,
        `${item.recordRef}: ${record.touches.length} follow-ups and no answer. It is with you now; nothing more will be sent.`,
      );
      continue;
    }
    if (heldUntil(record, now)) continue; // the customer gave a day: wait for it

    // The cadence's channels in preference order, stepping one along per touch,
    // skipping any the customer has not consented to.
    const n = cadence.channels.length;
    const start = n > 0 ? record.touches.length % n : 0;
    const rotated = [...cadence.channels.slice(start), ...cadence.channels.slice(0, start)];
    const channel = rotated.find((c) => consented(item.owedBy, c));
    if (!channel) continue; // no consented channel: held, nothing goes out

    const decision = await ports.gate(itemId, channel);
    if (!decision.allowed) continue;

    if (channel === "call") await callItem(ports, item, cadence, voice);
    else await ports.sendMessage(itemId, channel, voice[channel](item, voice));
  }
  return order;
}

/** Everything on one item, read back from the record by its id. */
export async function recordFor(ports, itemId) {
  return ports.readRecord(itemId);
}

build.recordFor = recordFor;

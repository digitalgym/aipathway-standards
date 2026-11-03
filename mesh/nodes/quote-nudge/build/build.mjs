/**
 * Quote Nudge: follow-up on a flooring sales rep's open quotes, built to
 * AIP-BS-FOLLOW-UP 2026-10-05.
 * https://aipathway.com.au/explore-ai/follow-up-build-standard
 *
 * A reimplementation from a public listing's one-line description (a bot for
 * flooring sales reps that logs quotes and drafts low-pressure follow-ups for
 * the rep to send). Nothing here is taken from that bot's prompt or
 * instructions; the behaviour is the standard's.
 *
 * THE JOB, NARROWED. Of the five kinds the standard names, this node chases
 * one: quote_decision, a quote the rep sent that the customer has neither
 * accepted nor declined. Variations, certificates, PO numbers and forms on the
 * same register are left for a general follow-up node. The original's quote
 * maths and scope summaries are not part of this standard and are not built.
 *
 * WHO SENDS. A text or an email is a low-pressure draft written for the rep,
 * placed in the rep's own outbox against the quote, and released by the rep.
 * It is counted as a touch when it is placed, so a draft the rep never sends
 * still uses up one of the cadence's touches: the cadence can only under-chase,
 * never over-chase. Where the business's written cadence includes a call, the
 * call is the hosted step (Get Paid on Office Voice, outbound.quote_closer);
 * this file only proves on the stub that it discloses first, asks for one
 * thing and records one answer. No telephony is written here.
 *
 * One run, every time it is woken (schedule.tick each morning, quote.sent,
 * quote.accepted or quote.declined for one quote, email.received for a
 * customer reply, exception.closed):
 *
 *   1. Read the register fresh. Only a quote_decision with its quote, the
 *      customer who owes the answer and a due date is chased. A typed note is
 *      not an item.
 *   2. File any decision that came back as evidence on the quote first, so
 *      nothing goes out after it (emits evidence.filed).
 *   3. Rank what is still open by the quote total, then days open.
 *   4. For each, in that order: read its record and its cadence. At the cap,
 *      hand it once to the named person with every touch, and tell them
 *      (emits exception.raised). Otherwise ask the gate on the first consented
 *      channel and touch only when it allows. Where the business owes the
 *      customer something first (a re-measure, a revised quote), the gate
 *      holds it and nothing goes out.
 *   5. A no, a dispute or a stop ends the chase and goes to a person. There is
 *      no port for a discount, and the drafts never offer one.
 *
 * Nothing is kept between runs: touches, outcomes, escalations and the arrival
 * are read back from the quote's record each time.
 */

const DAY = 86_400_000;

/** The one kind this node chases. */
export const CHASED_KIND = "quote_decision";

const BUSINESS = process.env.BUSINESS_NAME ?? "the showroom";

/** Check 1: a quote decision with its quote, the customer and a due date. */
export function isChasedItem(item) {
  return (
    Boolean(item) &&
    item.kind === CHASED_KIND &&
    typeof item.recordRef === "string" &&
    item.recordRef.length > 0 &&
    typeof item.owedBy === "string" &&
    item.owedBy.length > 0 &&
    typeof item.due === "string" &&
    item.due.length > 0
  );
}

/** Check 2: the quote total first, days open to break ties. Never age alone. */
export function rankQuotes(items, now) {
  return items
    .map((i) => ({
      itemId: i.id,
      valueAtRisk: Number(i.valueAtRisk) || 0,
      daysOpen: Math.max(0, Math.floor((now.getTime() - new Date(i.openedAt).getTime()) / DAY)),
    }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

/**
 * The draft the rep releases. Low pressure on purpose: it asks whether they
 * have decided, says a no is fine, and offers nothing to get an answer.
 */
export function nudgeDraft(item, touchNumber) {
  const opener =
    touchNumber <= 1
      ? `Hi, just checking the flooring quote ${item.recordRef} came through all right.`
      : `Hi, a quick follow-up on the flooring quote ${item.recordRef}.`;
  return (
    `${opener} No rush at all: when you have had a chance to look, a yes or a no either way helps us plan the install calendar. ` +
    `If you have questions about the quote, reply here and I will answer them.`
  );
}

const DISCLOSURE = `Hi, this is an AI assistant calling on behalf of ${BUSINESS}. This call is recorded.`;

/** A date the customer named holds the quote until that day. */
function heldUntilNamedDate(record, now) {
  const dates = record.outcomes.filter((o) => o.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(o.value));
  if (dates.length === 0) return false;
  return now.toISOString().slice(0, 10) < dates[dates.length - 1].value;
}

async function handToPerson(ports, item, record, reason, to, said) {
  if (record.escalations.length > 0) return; // once; never a second cadence
  const history = record.touches;
  await ports.escalate(item.id, reason, to, history);
  const why = reason === "cap_reached" ? "reached the cadence cap with no decision" : `ended the chase: "${said ?? reason}"`;
  await ports.notify(
    to,
    `Quote ${item.recordRef} (${item.valueAtRisk} at risk) ${why}. ` +
      `${history.length} touch(es): ${history.map((t) => `${t.channel} ${t.at.slice(0, 10)} ${t.outcome}`).join("; ") || "none"}. It is yours now.`,
  );
}

/** The hosted call's shape: disclosure, one ask, one recorded answer. */
async function quoteCall(ports, item, cadence) {
  await ports.disclose(item.id, DISCLOSURE);
  await ports.say(item.id, `I'm calling about flooring quote ${item.recordRef}. Have you had a chance to decide on it?`);
  const reply = await ports.listen(item.id);
  switch (reply.heard) {
    case "date":
      await ports.recordOutcome(item.id, { kind: "date", value: reply.value });
      return;
    case "decision":
      await ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "approved" });
      return;
    case "declined":
    case "stop": {
      await ports.recordOutcome(item.id, { kind: "declined", value: reply.heard === "stop" ? "stop_contacting" : "declined" });
      await handToPerson(ports, item, await ports.readRecord(item.id), "declined", cadence.escalateTo, reply.text);
      return;
    }
    case "dispute": {
      await ports.recordOutcome(item.id, { kind: "dispute", value: "disputed" });
      await handToPerson(ports, item, await ports.readRecord(item.id), "dispute", cadence.escalateTo, reply.text);
      return;
    }
    default:
      // No answer heard. Nothing is invented; the call stays on the record
      // as a touch with no outcome.
      return;
  }
}

/** Gate reasons that hold the quote for this run on every channel. */
const HOLD = new Set(["arrived", "declined", "escalated", "we_owe_them", "cap_reached", "too_soon"]);

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const register = await ports.readItems();

  // 1. Only open quote decisions are chased.
  const quotes = register.filter(isChasedItem);

  // 2. A decision that came back is filed first.
  const open = [];
  for (const q of quotes) {
    if (q.status !== "open") continue;
    if (q.received) {
      await ports.attachEvidence(q.id, q.received.ref);
      continue;
    }
    open.push(q);
  }
  if (open.length === 0) return;

  const consents = await ports.readConsents();
  const consented = (contactId, channel) => consents.some((c) => c.contactId === contactId && c.channel === channel);

  // 3. The chase order.
  const order = rankQuotes(open, now);
  await ports.rank(order);

  // 4. Each quote, in that order.
  for (const { itemId } of order) {
    const item = open.find((i) => i.id === itemId);
    const record = await ports.readRecord(itemId);
    if (record.arrival || record.escalations.length > 0) continue;
    const cadence = await ports.readCadence(item.kind);

    if (!item.weOwe && record.touches.length >= cadence.maxTouches) {
      await handToPerson(ports, item, record, "cap_reached", cadence.escalateTo);
      continue;
    }
    if (!item.weOwe && heldUntilNamedDate(record, now)) continue;

    for (const channel of cadence.channels) {
      if (channel !== "call" && !consented(item.owedBy, channel)) continue;
      const decision = await ports.gate(itemId, channel);
      if (!decision.allowed) {
        if (HOLD.has(decision.reason)) break;
        continue; // outside calling hours: try the next channel
      }
      if (channel === "call") await quoteCall(ports, item, cadence);
      else await ports.sendMessage(itemId, channel, nudgeDraft(item, record.touches.length + 1));
      break;
    }
  }
}

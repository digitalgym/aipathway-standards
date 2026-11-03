/**
 * Follow-Up Sweep: the evening follow-up sweep, built to
 * AIP-BS-FOLLOW-UP 2026-10-05.
 * https://aipathway.com.au/explore-ai/follow-up-build-standard
 *
 * An original AI Pathway build, written from the standard alone. The idea of
 * an evening sweep for dropped balls came from public bots that draft recovery
 * messages, but this one chases what is owed to the business by text and call
 * within consent and calling hours, so it credits no one. Nothing here is
 * taken from any other bot's prompt or instructions.
 *
 * In the standard's words that job is: every thing owed to the business that
 * is not money (a quote decision, a signed variation, a certificate, a PO
 * number, a form) is an open item on the register, and the sweep finds the
 * ones that have gone quiet and sends the next touch through the gate. Where
 * the ball is with the business itself (we_owe), the sweep holds the item and
 * sends nothing: chasing someone who is waiting on us is the failure.
 *
 * One run, every time it is woken (schedule.tick in the evening, or
 * exception.closed for one item):
 *
 *   1. Read the register fresh. Anything without a kind from the closed list,
 *      a record, a person and a due date is not an open item and is not chased.
 *   2. File any arrival as evidence first, so nothing goes out after it.
 *   3. Rank what is still open by value at risk, then days open.
 *   4. For each, in that order: read its record and its cadence. At the cap,
 *      escalate once to the named person with every touch, and tell them.
 *      Otherwise ask the gate, on the first consented channel, and touch only
 *      when it allows.
 *   5. A call discloses first, asks for the one thing, and records the answer
 *      as an outcome. A no, a dispute or a stop ends the chase and goes to a
 *      person. It never argues, re-asks or offers a concession; there is no
 *      port for one.
 *
 * Nothing is kept between runs. Touch counts, outcomes, escalations and
 * arrivals are read back from the item's record each time.
 */

const DAY = 86_400_000;

/** The closed list from section 2. Anything else is a note, not an item. */
export const ITEM_KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];

/** What each kind is called in a message, so the ask names the one thing owed. */
const THING = {
  quote_decision: "your decision on the quote",
  signed_variation: "the signed variation",
  certificate: "the certificate",
  po_number: "the purchase order number",
  form: "the signed form",
};

const BUSINESS = process.env.BUSINESS_NAME ?? "the office";

/** Check 1: a kind from the closed list, the record, the person and the due date. */
export function isOpenItem(item) {
  return Boolean(item) && ITEM_KINDS.includes(item.kind) && Boolean(item.recordRef) && Boolean(item.owedBy) && Boolean(item.due);
}

/** Check 2: value at risk descending, then days open descending. Never age alone. */
export function rankItems(items, now) {
  return items
    .map((i) => ({
      itemId: i.id,
      valueAtRisk: Number(i.valueAtRisk) || 0,
      daysOpen: Math.max(0, Math.floor((now.getTime() - new Date(i.openedAt).getTime()) / DAY)),
    }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

/** The recovery message. Asks for the one thing, offers nothing. */
export function recoveryDraft(item, touchNumber) {
  const thing = THING[item.kind];
  const lead = touchNumber <= 1 ? "Just following up" : "Following up again";
  return (
    `${lead} on ${item.recordRef}: we are still waiting on ${thing}, which was due ${String(item.due).slice(0, 10)}. ` +
    `If you have already sent it, thank you, and please ignore this. If anything is holding it up, reply and a person from ${BUSINESS} will help.`
  );
}

const DISCLOSURE = `Hi, this is an AI assistant calling on behalf of ${BUSINESS}. This call is recorded.`;

/** A date outcome holds the item until that day: the contact named it. */
function heldForPromisedDate(record, now) {
  const dates = record.outcomes.filter((o) => o.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(o.value));
  if (dates.length === 0) return false;
  const last = dates[dates.length - 1];
  return now.toISOString().slice(0, 10) < last.value;
}

async function escalateOnce(ports, item, record, reason, to, said) {
  if (record.escalations.length > 0) return; // once, never a second loop
  const history = record.touches;
  await ports.escalate(item.id, reason, to, history);
  const what =
    reason === "cap_reached"
      ? `reached the cap of touches with nothing back`
      : `ended the chase with "${said ?? reason}"`;
  await ports.notify(
    to,
    `${item.id} (${item.kind} on ${item.recordRef}, ${item.valueAtRisk} at risk) ${what}. ` +
      `${history.length} touch(es) so far: ${history.map((t) => `${t.channel} ${t.at.slice(0, 10)} ${t.outcome}`).join("; ") || "none"}. It is yours now.`,
  );
}

async function call(ports, item, record, cadence) {
  await ports.disclose(item.id, DISCLOSURE);
  await ports.say(item.id, `I'm calling about ${item.recordRef}. Could you tell me when we can expect ${THING[item.kind]}?`);
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
      const after = await ports.readRecord(item.id);
      await escalateOnce(ports, item, after, "declined", cadence.escalateTo, reply.text);
      return;
    }
    case "dispute": {
      await ports.recordOutcome(item.id, { kind: "dispute", value: "disputed" });
      const after = await ports.readRecord(item.id);
      await escalateOnce(ports, item, after, "dispute", cadence.escalateTo, reply.text);
      return;
    }
    default:
      // Silence. No outcome is invented; the touch stays visible as a call
      // with no outcome, and the next touch comes back through the gate.
      return;
  }
}

/** Gate reasons that hold the whole item this run, whatever the channel. */
const HOLD = new Set(["arrived", "declined", "escalated", "we_owe_them", "cap_reached", "too_soon"]);

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const register = await ports.readItems();

  // 1. Only open items on the register are chased.
  const items = register.filter(isOpenItem);

  // 2. Arrivals first, so a document that came back today gets no reminder tonight.
  const live = [];
  for (const item of items) {
    if (item.status !== "open") continue;
    if (item.received) {
      await ports.attachEvidence(item.id, item.received.ref);
      continue;
    }
    live.push(item);
  }
  if (live.length === 0) return;

  const consents = await ports.readConsents();
  const consented = (contactId, channel) => consents.some((c) => c.contactId === contactId && c.channel === channel);

  // 3. The chase order.
  const order = rankItems(live, now);
  await ports.rank(order);

  // 4. Each item, in order.
  for (const { itemId } of order) {
    const item = live.find((i) => i.id === itemId);
    const record = await ports.readRecord(itemId);
    if (record.arrival || record.escalations.length > 0) continue;
    const cadence = await ports.readCadence(item.kind);

    if (!item.weOwe && record.touches.length >= cadence.maxTouches) {
      await escalateOnce(ports, item, record, "cap_reached", cadence.escalateTo);
      continue;
    }
    if (!item.weOwe && heldForPromisedDate(record, now)) continue;

    for (const channel of cadence.channels) {
      if (channel !== "call" && !consented(item.owedBy, channel)) continue;
      const decision = await ports.gate(itemId, channel);
      if (!decision.allowed) {
        if (HOLD.has(decision.reason)) break;
        continue; // no_consent or outside_hours: try the next channel
      }
      if (channel === "call") await call(ports, item, record, cadence);
      else await ports.sendMessage(itemId, channel, recoveryDraft(item, record.touches.length + 1));
      break;
    }
  }
}

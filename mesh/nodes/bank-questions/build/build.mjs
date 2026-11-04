/**
 * Bank Questions: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * A bookkeeper cannot finish a client's month, or their BAS, while bank lines
 * sit uncategorised in Xero. The usual fix is an email full of dates and
 * amounts the client does not answer. This bot keeps one open item per client
 * per period: "your answers on the bank lines we could not code", on the
 * client's bookkeeping job, with the dollars those lines hold up as the value
 * at risk. Each weekday morning it runs once, keeps nothing between runs, and
 * does this, in the standard's order:
 *
 *   1. Read the register. Only a well-formed open item (a kind from the closed
 *      list, the job it belongs to, the client who owes it, a due date) is
 *      chased. A note somebody typed is not.
 *   2. File any answers that came back since the last run as evidence against
 *      the item (evidence.filed). The item leaves the chase this run, and the
 *      answers go to coding.mjs, which drafts coding suggestions for the
 *      bookkeeper. Nothing is coded in Xero by this bot.
 *   3. Rank what is left by value at risk, then days open.
 *   4. Ask the gate before every touch. The gate reads the arrival, whether
 *      the practice owes the client something first, the written cadence and
 *      consent.
 *   5. Touch on the first consented channel in the cadence's order: a plain
 *      email or text with a link to the questions, or the call. The call opens
 *      with the AI identification and the recording notice, asks for the one
 *      thing owed (when the answers will be back), and records the answer as
 *      an object. The live line is the hosted step and is not built here.
 *   6. A no, a dispute or "stop contacting me" ends the chase and goes to the
 *      cadence's named person (exception.raised). So does the cap, once, with
 *      every touch so far, and that person is told.
 *
 * It never chases without an open item, never sorts by age alone, never
 * touches past the cap or without consent, never touches after the answers
 * arrived or after a no, and never offers anything to get an answer.
 */

const KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];
const WRITTEN = ["sms", "email"];
const DAY = 86_400_000;

// What the client is asked for, in plain words.
const WHAT = {
  form: "your answers on the bank transactions we could not code",
  quote_decision: "your decision on our fee quote",
  signed_variation: "the signed change to your engagement",
  certificate: "the certificate we asked for",
  po_number: "your purchase order number",
};

export const wellFormed = (i) => KINDS.includes(i.kind) && Boolean(i.recordRef) && Boolean(i.owedBy) && Boolean(i.due);

const daysOpen = (i, now) => Math.max(0, Math.floor((now.getTime() - new Date(i.openedAt).getTime()) / DAY));

/** Value at risk first, days open breaking ties. Never age alone. */
export function rankItems(items, now) {
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: i.valueAtRisk, daysOpen: daysOpen(i, now) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

/** The calendar day in Brisbane. Good enough for "not before the day they gave". */
const localDay = (d) => new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10);

function message(item, contact, outcomes) {
  const first = contact?.name ? contact.name.split(" ")[0] : "there";
  const promised = [...outcomes].reverse().find((o) => o.kind === "date");
  const when = promised ? `You said you would have them back by ${promised.value}.` : `We asked for them by ${item.due.slice(0, 10)}.`;
  return (
    `Hi ${first}, we still need ${WHAT[item.kind] ?? "the item we asked for"} (${item.recordRef}). ` +
    `${when} Each one just needs a few words, like "fuel for the ute" or "personal". ` +
    `If you have already replied, thank you, please ignore this. Reply STOP and we will not message you again.`
  );
}

/** The first channel in the cadence's order the client consented to; the call has its own rules at the gate. */
function pickChannel(cadence, consented, record) {
  const lastCall = [...record.touches].reverse().find((t) => t.channel === "call");
  // After a call that got a date, the next touch is a written reminder of that date.
  const order =
    lastCall?.outcome === "date"
      ? [...cadence.channels.filter((c) => c !== "call"), ...cadence.channels.filter((c) => c === "call")]
      : cadence.channels;
  return order.find((c) => c === "call" || consented.has(c)) ?? null;
}

async function hand(ports, item, reason, cadence, history, said) {
  await ports.escalate(item.id, reason, cadence.escalateTo, history);
  const why =
    reason === "cap_reached"
      ? `no answers after ${cadence.maxTouches} touches`
      : reason === "declined"
        ? `the client said no${said ? `: "${said}"` : ""}`
        : `the client disputed it or asked us to stop${said ? `: "${said}"` : ""}`;
  await ports.notify(
    cadence.escalateTo,
    `${item.id} (${item.recordRef}, $${item.valueAtRisk} of bank lines waiting) is with you: ${why}. ` +
      `Touches so far: ${history.map((t) => `${t.channel} ${t.at} ${t.outcome}`).join("; ") || "none"}. ` +
      `Bank Questions will not contact the client about it again.`,
  );
}

async function call(ports, item, cadence) {
  await ports.disclose(item.id, "Hi, this is an AI assistant calling for your bookkeeper. This call is recorded.");
  await ports.say(item.id, `We still need ${WHAT[item.kind] ?? "the item we asked for"}. When can you send them back to us?`);
  const reply = await ports.listen(item.id);
  if (reply.heard === "date") {
    await ports.recordOutcome(item.id, { kind: "date", value: reply.value });
  } else if (reply.heard === "decision") {
    await ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "approved" });
  } else if (reply.heard === "declined") {
    await ports.recordOutcome(item.id, { kind: "declined", value: "declined" });
    const rec = await ports.readRecord(item.id);
    await hand(ports, item, "declined", cadence, rec.touches, reply.text);
  } else if (reply.heard === "dispute" || reply.heard === "stop") {
    await ports.recordOutcome(item.id, { kind: "dispute", value: reply.heard === "stop" ? "stop_contacting" : "disputed" });
    const rec = await ports.readRecord(item.id);
    await hand(ports, item, "dispute", cadence, rec.touches, reply.text);
  }
  // Silence: the call stays on the record as a call with no outcome. Nothing is invented.
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const items = await ports.readItems();
  const contacts = await ports.readContacts();
  const consents = await ports.readConsents();

  const open = items.filter((i) => i.status === "open" && wellFormed(i));

  // Answers that came back are filed first, and leave the chase.
  const chase = [];
  for (const item of open) {
    if (item.received?.ref) await ports.attachEvidence(item.id, item.received.ref);
    else chase.push(item);
  }

  const order = rankItems(chase, now);
  await ports.rank(order);

  for (const { itemId } of order) {
    const item = chase.find((i) => i.id === itemId);
    const record = await ports.readRecord(item.id);
    if (record.escalations.length > 0) continue;
    if (record.outcomes.some((o) => o.kind === "declined" || o.kind === "dispute")) continue;

    const cadence = await ports.readCadence(item.kind);
    if (record.touches.length >= cadence.maxTouches) {
      await hand(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    // The client gave a day: nothing before it.
    const promised = [...record.outcomes].reverse().find((o) => o.kind === "date");
    if (promised && localDay(now) < promised.value) continue;

    const consented = new Set(consents.filter((c) => c.contactId === item.owedBy).map((c) => c.channel));
    const channel = pickChannel(cadence, consented, record);
    if (!channel) continue;

    const decision = await ports.gate(item.id, channel);
    if (!decision.allowed) {
      if (decision.reason === "cap_reached") await hand(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    if (WRITTEN.includes(channel)) {
      const contact = contacts.find((c) => c.id === item.owedBy);
      await ports.sendMessage(item.id, channel, message(item, contact, record.outcomes));
    } else {
      await call(ports, item, cadence);
    }
  }
}

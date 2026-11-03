/**
 * Docs Due: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * An accounting or bookkeeping practice keeps a checklist per client job of
 * what the client still owes it before the work can be finished: the signed
 * engagement letter, the tax return authority, a certificate from a fund or a
 * bank, the fee decision. Each weekday morning this runs once, keeps nothing
 * between runs, and does this, in the standard's order:
 *
 *   1. Read the register. Only a well-formed open item (a kind from the closed
 *      list, the client job it belongs to, the client who owes it, a due date)
 *      is ever chased. A typed note is not.
 *   2. File anything that came back since the last run as evidence against the
 *      item. That is the handover (evidence.filed): the job can move again, and
 *      the item leaves the chase this run.
 *   3. Rank what is left by value at risk on the job, then by days open.
 *   4. For each item, ask the gate before every touch. The gate reads the
 *      arrival, the ball-with-us flag, the written cadence and consent.
 *   5. Touch on the first consented channel in the cadence's order: a polite
 *      email or text, or the call. The call opens with the AI identification
 *      and the recording notice, asks for the one thing owed, and records the
 *      answer as an object. The live line is the hosted step and is not built
 *      here; on the stub the same code drives the stub line.
 *   6. A no, a dispute or "stop contacting me" ends the chase and goes to the
 *      cadence's named person (exception.raised). So does the cap, once, with
 *      every touch so far, and that person is told.
 *
 * What it never does: chase without an open item, sort by age alone, touch
 * past the cap or without consent, touch after the document arrived or after
 * a no, or offer a discount, an extension or any concession. There is no port
 * for a concession, and no code here writes one.
 *
 * Everything goes through the ports. Every port call is awaited, so the same
 * build runs against a real register as against the stub.
 */

const KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];
const MESSAGE_CHANNELS = ["sms", "email"];
const DAY = 86_400_000;

// What the client is being asked for, in the practice's own words.
const WHAT = {
  quote_decision: "your decision on our fee quote",
  signed_variation: "the signed change to your engagement",
  certificate: "the certificate we asked for",
  po_number: "your purchase order number",
  form: "the signed form we asked for",
};

const wellFormed = (item) => KINDS.includes(item.kind) && Boolean(item.recordRef) && Boolean(item.owedBy) && Boolean(item.due);

/** The calendar day in Brisbane, as YYYY-MM-DD. The practice works on AEST. */
const brisbaneDay = (d) => new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10);

const daysOpen = (item, now) => Math.max(0, Math.floor((now.getTime() - new Date(item.openedAt).getTime()) / DAY));

/** Value at risk first, days open breaking ties. Never age alone. */
export function rankItems(items, now) {
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: i.valueAtRisk, daysOpen: daysOpen(i, now) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

function reminderText(item, contact, outcomes) {
  const name = contact?.name ? contact.name.split(" ")[0] : "there";
  const promised = [...outcomes].reverse().find((o) => o.kind === "date");
  const when = promised ? `You mentioned it would be with us by ${promised.value}.` : `It was due on ${item.due.slice(0, 10)}.`;
  return (
    `Hi ${name}, a quick reminder from the practice: we are still waiting on ${WHAT[item.kind]} for ${item.recordRef}. ` +
    `${when} Once it is in, we can finish the work. If you have already sent it, thank you, and please ignore this. ` +
    `Reply STOP and we will not message you again.`
  );
}

/** First channel in the cadence's order the contact consented to. A call is the hosted step and has its own gate. */
function pickChannel(cadence, consented, record) {
  const lastCall = [...record.touches].reverse().find((t) => t.channel === "call");
  // After a call that got a date, the next touch is a written reminder of that
  // date where the client consented to one, not a second call.
  const preferWritten = lastCall?.outcome === "date";
  const order = preferWritten
    ? [...cadence.channels.filter((c) => c !== "call"), ...cadence.channels.filter((c) => c === "call")]
    : cadence.channels;
  return order.find((c) => c === "call" || consented.has(c)) ?? null;
}

async function escalate(ports, item, reason, cadence, history, said) {
  await ports.escalate(item.id, reason, cadence.escalateTo, history);
  const why =
    reason === "cap_reached"
      ? `reached the cap of ${cadence.maxTouches} touches with nothing back`
      : reason === "declined"
        ? `the client said no${said ? `: "${said}"` : ""}`
        : `the client disputed it or asked us to stop${said ? `: "${said}"` : ""}`;
  await ports.notify(
    cadence.escalateTo,
    `${item.id} (${item.kind}, ${item.recordRef}, $${item.valueAtRisk} at risk) is with you: ${why}. ` +
      `${history.length} touch(es) so far: ${history.map((t) => `${t.channel} ${t.at} ${t.outcome}`).join("; ") || "none"}. ` +
      `Docs Due will not contact the client about it again.`,
  );
}

async function call(ports, item, cadence, history) {
  await ports.disclose(
    item.id,
    "Hi, this is an AI assistant calling on behalf of your accountant's practice. This call is recorded.",
  );
  await ports.say(item.id, `We are still waiting on ${WHAT[item.kind]} for ${item.recordRef}. When can you send it to us?`);
  const reply = await ports.listen(item.id);
  switch (reply.heard) {
    case "date":
      await ports.recordOutcome(item.id, { kind: "date", value: reply.value });
      return;
    case "decision":
      await ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "approved" });
      return;
    case "declined": {
      await ports.recordOutcome(item.id, { kind: "declined", value: "declined" });
      const rec = await ports.readRecord(item.id);
      await escalate(ports, item, "declined", cadence, rec.touches, reply.text);
      return;
    }
    case "dispute":
    case "stop": {
      await ports.recordOutcome(item.id, { kind: "dispute", value: reply.heard === "stop" ? "stop_contacting" : "disputed" });
      const rec = await ports.readRecord(item.id);
      await escalate(ports, item, "dispute", cadence, rec.touches, reply.text);
      return;
    }
    default:
      // Nothing heard. The touch stays on the record as a call with no
      // outcome, which is what it was. Nothing is invented.
      void history;
  }
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const items = await ports.readItems();
  const contacts = await ports.readContacts();
  const consents = await ports.readConsents();

  // 1. Only well-formed open items are on the chase.
  const open = items.filter((i) => i.status === "open" && wellFormed(i));

  // 2. Anything that came back is filed against the item first, and leaves the chase.
  const chase = [];
  for (const item of open) {
    if (item.received?.ref) await ports.attachEvidence(item.id, item.received.ref);
    else chase.push(item);
  }

  // 3. Rank.
  const order = rankItems(chase, now);
  await ports.rank(order);

  // 4 to 6. Each item, in order, through the gate.
  for (const { itemId } of order) {
    const item = chase.find((i) => i.id === itemId);
    const record = await ports.readRecord(item.id);
    if (record.escalations.length > 0) continue;
    if (record.outcomes.some((o) => o.kind === "declined" || o.kind === "dispute")) continue;

    const cadence = await ports.readCadence(item.kind);

    // The cap: once, to a named person, with every touch so far. Never a second cadence.
    if (record.touches.length >= cadence.maxTouches) {
      await escalate(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    // The client gave a date: nothing before that day.
    const promised = [...record.outcomes].reverse().find((o) => o.kind === "date");
    if (promised && brisbaneDay(now) < promised.value) continue;

    const consented = new Set(consents.filter((c) => c.contactId === item.owedBy).map((c) => c.channel));
    const channel = pickChannel(cadence, consented, record);
    if (!channel) continue; // no consented channel: nothing goes out

    const decision = await ports.gate(item.id, channel);
    if (!decision.allowed) {
      if (decision.reason === "cap_reached") await escalate(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    if (MESSAGE_CHANNELS.includes(channel)) {
      const contact = contacts.find((c) => c.id === item.owedBy);
      await ports.sendMessage(item.id, channel, reminderText(item, contact, record.outcomes));
    } else {
      await call(ports, item, cadence, record.touches);
    }
  }
}

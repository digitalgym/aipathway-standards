/**
 * Receipt Chase: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * A bookkeeper keeps a client's books in Xero. Every card or bank line that
 * goes out with no receipt attached is an open item on the receipt register:
 * the line's id in the ledger is the record it belongs to, the person who
 * spent it owes the receipt, and the amount on the line is what is held up
 * (the deduction, and the GST credit, which the ATO wants a tax invoice for
 * above A$82.50). The register keeps these as the standard's closed kind
 * "form": the paper the line cannot be coded without.
 *
 * Each weekday morning it runs once, keeps nothing between runs, and in the
 * standard's order:
 *
 *   1. Reads the register. Only a well-formed open item is chased: a kind from
 *      the closed list, the line it belongs to, who spent it, a due date. A
 *      note somebody typed ("chase Bob about Bunnings") is not.
 *   2. Files any receipt that has come in since the last run against its line.
 *      A receipt counts as in only when it is tied to the line by id: a reply
 *      on this bot's own chase thread, a forward that quotes the line's
 *      reference, or a person linking an inbox receipt to the line. The bot
 *      never attaches a receipt it guessed from an amount and a shop name.
 *      Filing it is the handover (evidence.filed): the line can be coded.
 *   3. Ranks what is left by value at risk, then days open. Never age alone.
 *   4. Asks the gate before every touch, on the first channel in the written
 *      cadence that the spender agreed to.
 *   5. Sends one plain reminder, or, where the cadence has a call, discloses
 *      first, asks for the one receipt and records the answer as an object.
 *      The live call is the hosted step and is not built here.
 *   6. A no, a dispute or "stop asking me" ends the chase and goes to the
 *      named bookkeeper (exception.raised). So does the cap, once, with every
 *      touch so far, and that person is told.
 *
 * It writes reminders and files receipts. It never codes the line, never
 * claims the GST, never marks a line "no receipt needed" and never drops an
 * item: those stay with the bookkeeper.
 *
 * Every port call is awaited, so the same build runs against a real register
 * as against the stub.
 */

const KINDS = new Set(["quote_decision", "signed_variation", "certificate", "po_number", "form"]);
const WRITTEN = new Set(["sms", "email"]);
const DAY_MS = 86_400_000;
const AEST_MS = 10 * 3_600_000;

// What the spender is asked for. A receipt register only writes "form"; the
// others are here so a shared register never gets a blank ask.
const ASK = {
  form: "the receipt (a tax invoice) for this spend",
  certificate: "the certificate we asked for",
  po_number: "the purchase order number",
  signed_variation: "the signed change",
  quote_decision: "your decision on the quote",
};

const isChaseable = (i) =>
  i.status === "open" && KINDS.has(i.kind) && Boolean(i.recordRef) && Boolean(i.owedBy) && Boolean(i.due);

const todayInBrisbane = (d) => new Date(d.getTime() + AEST_MS).toISOString().slice(0, 10);

/** Value at risk first, days open breaking ties. */
export function order(items, now) {
  const age = (i) => Math.max(0, Math.floor((now.getTime() - Date.parse(i.openedAt)) / DAY_MS));
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: Number(i.valueAtRisk) || 0, daysOpen: age(i) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

function reminder(item, person, outcomes) {
  const first = person?.name ? person.name.split(" ")[0] : "there";
  const said = [...outcomes].reverse().find((o) => o.kind === "date");
  const when = said ? ` You said you could send it by ${said.value}.` : "";
  return (
    `Hi ${first}, a quick one from the bookkeeping: we still need ${ASK[item.kind]} on ${item.recordRef}` +
    ` (${money(item.valueAtRisk)}).${when} A photo of it in reply to this message is all we need.` +
    ` If you have already sent it, thanks, ignore this. Reply STOP and we will not ask again.`
  );
}

/** The channel for this touch: after a call that gave a date, write first. */
function channelFor(cadence, agreed, touches) {
  const lastCall = [...touches].reverse().find((t) => t.channel === "call");
  const list =
    lastCall?.outcome === "date"
      ? [...cadence.channels.filter((c) => c !== "call"), ...cadence.channels.filter((c) => c === "call")]
      : cadence.channels;
  return list.find((c) => c === "call" || agreed.has(c)) ?? null;
}

async function handToPerson(ports, item, reason, cadence, history, said) {
  await ports.escalate(item.id, reason, cadence.escalateTo, history);
  const why = {
    cap_reached: `no receipt after ${cadence.maxTouches} reminders`,
    declined: "the spender said no",
    dispute: "the spender disputed it or asked us to stop",
  }[reason];
  await ports.notify(
    cadence.escalateTo,
    `Receipt Chase: ${item.recordRef} (${money(item.valueAtRisk)}) is yours. ${why}${said ? `: "${said}"` : ""}. ` +
      `Touches so far: ${history.map((t) => `${t.channel} at ${t.at} (${t.outcome})`).join("; ") || "none"}. ` +
      `Nothing more goes to the spender on this line.`,
  );
}

async function ring(ports, item, cadence) {
  await ports.disclose(item.id, "Hi, this is an AI assistant calling for your bookkeeper. This call is recorded.");
  await ports.say(item.id, `We still need ${ASK[item.kind]} on ${item.recordRef}. When can you send it?`);
  const reply = await ports.listen(item.id);
  if (reply.heard === "date") return ports.recordOutcome(item.id, { kind: "date", value: reply.value });
  if (reply.heard === "decision") return ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "approved" });
  if (reply.heard === "declined" || reply.heard === "dispute" || reply.heard === "stop") {
    const kind = reply.heard === "declined" ? "declined" : "dispute";
    await ports.recordOutcome(item.id, { kind, value: reply.heard === "stop" ? "stop_contacting" : kind });
    const rec = await ports.readRecord(item.id);
    return handToPerson(ports, item, kind, cadence, rec.touches, reply.text);
  }
  // Nothing heard: the touch stays on the record as a call with no outcome.
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const register = await ports.readItems();
  const people = await ports.readContacts();
  const consents = await ports.readConsents();

  const waiting = [];
  for (const item of register.filter(isChaseable)) {
    if (item.received?.ref) await ports.attachEvidence(item.id, item.received.ref);
    else waiting.push(item);
  }

  const ranked = order(waiting, now);
  await ports.rank(ranked);

  for (const { itemId } of ranked) {
    const item = waiting.find((i) => i.id === itemId);
    const rec = await ports.readRecord(item.id);
    if (rec.escalations.length) continue;
    if (rec.outcomes.some((o) => o.kind === "declined" || o.kind === "dispute")) continue;

    const cadence = await ports.readCadence(item.kind);
    if (rec.touches.length >= cadence.maxTouches) {
      await handToPerson(ports, item, "cap_reached", cadence, rec.touches);
      continue;
    }

    const promised = [...rec.outcomes].reverse().find((o) => o.kind === "date");
    if (promised && todayInBrisbane(now) < promised.value) continue;

    const agreed = new Set(consents.filter((c) => c.contactId === item.owedBy).map((c) => c.channel));
    const channel = channelFor(cadence, agreed, rec.touches);
    if (!channel) continue;

    const gate = await ports.gate(item.id, channel);
    if (!gate.allowed) {
      if (gate.reason === "cap_reached") await handToPerson(ports, item, "cap_reached", cadence, rec.touches);
      continue;
    }

    if (WRITTEN.has(channel)) {
      await ports.sendMessage(item.id, channel, reminder(item, people.find((p) => p.id === item.owedBy), rec.outcomes));
    } else {
      await ring(ports, item, cadence);
    }
  }
}

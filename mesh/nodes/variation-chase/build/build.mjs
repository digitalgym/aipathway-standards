/**
 * Variation Chase: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * A builder or head contractor runs variations on its jobs. Once a named
 * person in the office has reviewed a subcontractor's change order against the
 * contract and approved its scope, the variation goes on the register as an
 * open item: kind signed_variation, the job it belongs to, the party whose
 * signature it waits on, the amount it holds up and the date it was due back.
 * The variation cannot be claimed in the next progress claim until it comes
 * back signed, so this chases the signature and nothing else.
 *
 * The scope review and the approval are NOT done here. They stay with a
 * person: this build never reads the contract, never judges scope, never
 * approves a variation on a call and never bills one. It only chases items a
 * person has already put on the register.
 *
 * Each run (a weekday schedule tick, or an exception closing) keeps nothing
 * between runs and does this, in the standard's order:
 *
 *   1. Read the register. Only a well-formed open item is chased (a kind from
 *      the closed list, a job, a person who owes it, a due date). A typed note
 *      is not.
 *   2. File anything that came back since the last run (the signed variation
 *      landing in the mailbox) as evidence against its item. That is the
 *      handover, evidence.filed: the variation can be claimed, and the item
 *      leaves the chase this run.
 *   3. Rank what is left by value at risk on the job, then days open.
 *   4. Hold any item where the business owes the other side something first
 *      (a revised drawing, a corrected price).
 *   5. Ask the gate before every touch, on the first channel in the written
 *      cadence the contact consented to.
 *   6. Touch: a short text or email, or the call. The call opens with the AI
 *      identification and the recording notice, asks for the one thing owed,
 *      and records the answer as an object. The live line is the hosted step
 *      and is not built here; on the stub the same code drives the stub line.
 *   7. A no, a dispute or "stop contacting me" ends the chase and goes to the
 *      cadence's named person (exception.raised). So does the cap, once, with
 *      every touch so far, and that person is told.
 *
 * Never: chase without an open item, sort by age alone, touch past the cap or
 * without consent, touch after the signature arrived or after a no, or offer a
 * discount, an extension or any concession. There is no port for a
 * concession and no code here writes one.
 *
 * Every port call is awaited, so the same build runs against a real register
 * as against the stub.
 */

const KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];
const WRITTEN = ["sms", "email"];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// What is being asked for, in a builder's words.
const WHAT = {
  quote_decision: "your decision on the quote",
  signed_variation: "the signed variation",
  certificate: "the compliance certificate for your work",
  po_number: "your purchase order number",
  form: "the signed form",
};

/** Kinds that end only when a document comes back. A spoken yes is not the signature. */
const DOCUMENT_KINDS = new Set(["signed_variation", "certificate", "po_number", "form"]);

export const wellFormed = (item) =>
  KINDS.includes(item.kind) && Boolean(item.recordRef) && Boolean(item.owedBy) && Boolean(item.due);

/** The calendar day in Brisbane, as YYYY-MM-DD. */
const brisbaneDay = (d) => new Date(d.getTime() + 10 * HOUR).toISOString().slice(0, 10);

const daysOpen = (item, now) => Math.max(0, Math.floor((now.getTime() - new Date(item.openedAt).getTime()) / DAY));

/** Value at risk first, days open breaking ties. Never age alone. */
export function rankItems(items, now) {
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: i.valueAtRisk, daysOpen: daysOpen(i, now) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

const money = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function messageText(item, contact, record) {
  const first = contact?.name ? contact.name.split(" ")[0] : "there";
  const promised = [...record.outcomes].reverse().find((o) => o.kind === "date");
  const when = promised ? `You said it would be back with us by ${promised.value}.` : `It was due back on ${item.due.slice(0, 10)}.`;
  return (
    `Hi ${first}, a reminder from the builder's office: we are still waiting on ${WHAT[item.kind]} for job ${item.recordRef}` +
    (item.kind === "signed_variation" ? ` (${money(item.valueAtRisk)} inc GST)` : "") +
    `. ${when} If you have already sent it, thanks, and please ignore this. Reply STOP and we will not contact you about it again.`
  );
}

/**
 * The channels to try, in the cadence's order, keeping only those the contact
 * consented to (the call has its own basis, held by the hosted step). After a
 * call that got a date, a written reminder of that date comes before a second
 * call.
 */
function candidateChannels(cadence, consented, record) {
  const lastCall = [...record.touches].reverse().find((t) => t.channel === "call");
  const order =
    lastCall?.outcome === "date"
      ? [...cadence.channels.filter((c) => c !== "call"), ...cadence.channels.filter((c) => c === "call")]
      : [...cadence.channels];
  return order.filter((c) => c === "call" || consented.has(c));
}

async function escalate(ports, item, reason, cadence, history, said) {
  await ports.escalate(item.id, reason, cadence.escalateTo, history);
  const why =
    reason === "cap_reached"
      ? `reached the cap of ${cadence.maxTouches} touches with nothing back`
      : reason === "declined"
        ? `the other side said no${said ? ` ("${said}")` : ""}`
        : `the other side disputed it${said ? ` ("${said}")` : ""}`;
  await ports.notify(
    cadence.escalateTo,
    `${WHAT[item.kind]} on job ${item.recordRef} (item ${item.id}, ${money(item.valueAtRisk)} at risk) ${why}. ` +
      `${history.length} touch(es) so far: ${history.map((t) => `${t.channel} ${t.at} ${t.outcome}`).join("; ") || "none"}. ` +
      `It is with you now; nothing further goes out from here.`,
  );
}

/** The call. Disclosure first, one ask, one recorded answer. */
async function call(ports, item, cadence, now) {
  await ports.disclose(
    item.id,
    "Hi, this is an AI assistant calling on behalf of the builder's office. This call is recorded.",
  );
  const ask =
    item.kind === "quote_decision"
      ? `I'm calling about the quote for job ${item.recordRef}. Are you going ahead with it?`
      : `I'm calling about ${WHAT[item.kind]} for job ${item.recordRef}. What day can we expect it back?`;
  await ports.say(item.id, ask);
  const reply = await ports.listen(item.id);

  if (reply.heard === "date" && reply.value) {
    await ports.recordOutcome(item.id, { kind: "date", value: reply.value });
    return null;
  }
  if (reply.heard === "decision") {
    if (DOCUMENT_KINDS.has(item.kind)) {
      // "It's signed" on the phone is not the signature. Record the day they
      // gave (today) and keep chasing until the document itself lands.
      await ports.recordOutcome(item.id, { kind: "date", value: brisbaneDay(now) });
      return null;
    }
    await ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "approved" });
    return null;
  }
  if (reply.heard === "declined" || reply.heard === "stop") {
    await ports.recordOutcome(item.id, { kind: "declined", value: reply.heard === "stop" ? "stop_contact" : "declined" });
    return { reason: "declined", said: reply.text };
  }
  if (reply.heard === "dispute") {
    await ports.recordOutcome(item.id, { kind: "dispute", value: "disputed" });
    return { reason: "dispute", said: reply.text };
  }
  // Silence: the touch stays on the record as a call with no outcome, visible
  // as exactly that, and the cadence carries on.
  return null;
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = new Date(await ports.now());
  const items = await ports.readItems();
  const contacts = await ports.readContacts();
  const consents = await ports.readConsents();
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const open = items.filter((i) => i.status === "open" && wellFormed(i));

  // 2. The signature came back: file it, and it leaves the chase this run.
  const chase = [];
  for (const item of open) {
    if (item.received?.ref) await ports.attachEvidence(item.id, item.received.ref);
    else chase.push(item);
  }

  // 3. Rank.
  const order = rankItems(chase, now);
  await ports.rank(order);

  for (const { itemId } of order) {
    const item = chase.find((i) => i.id === itemId);
    const cadence = await ports.readCadence(item.kind);
    const record = await ports.readRecord(item.id);
    if (record.arrival || record.escalations.length > 0) continue;

    const consented = new Set(consents.filter((c) => c.contactId === item.owedBy).map((c) => c.channel));
    const channels = candidateChannels(cadence, consented, record);

    // 4. The ball is with us: ask the gate so the hold is on the record, touch nothing.
    if (item.weOwe) {
      await ports.gate(item.id, channels[0] ?? cadence.channels[0]);
      continue;
    }

    // 7. The cap, once the last touch has had its gap to land.
    const last = record.touches[record.touches.length - 1];
    if (record.touches.length >= cadence.maxTouches) {
      const since = last ? now.getTime() - new Date(last.at).getTime() : Infinity;
      if (since >= cadence.spacingHours * HOUR) await escalate(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    // 5. The gate, before every touch.
    let chosen = null;
    for (const channel of channels) {
      const d = await ports.gate(item.id, channel);
      if (d.allowed) {
        chosen = channel;
        break;
      }
      // Only a channel-specific refusal lets the next channel be tried.
      if (d.reason !== "no_consent" && d.reason !== "outside_hours") break;
    }
    if (!chosen) continue;

    // 6. The touch.
    if (WRITTEN.includes(chosen)) {
      await ports.sendMessage(item.id, chosen, messageText(item, contactById.get(item.owedBy), record));
      continue;
    }
    const ended = await call(ports, item, cadence, now);
    if (ended) {
      const after = await ports.readRecord(item.id);
      await escalate(ports, item, ended.reason, cadence, after.touches, ended.said);
    }
  }
}

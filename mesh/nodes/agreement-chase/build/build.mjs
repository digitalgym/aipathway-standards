/**
 * Agreement Chase: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * When a new commercial customer is set up, the office needs two things back
 * from them before the first job goes out: the signed service agreement and the
 * signed rate sheet. Each goes on the onboarding register as its own open item
 * (kind form), on the customer's first job, owed by the customer's accounts or
 * facilities contact, due the day before that first job, with the value of the
 * first job as what it holds up.
 *
 * This chases the document and nothing else. It never writes the agreement,
 * never changes a rate, never accepts "it's signed" on the phone as the
 * signature, never offers a better rate to get it back, and never decides to
 * send the crew without it. Those stay with a person.
 *
 * Each run (a weekday schedule tick, or an exception closing) keeps nothing
 * between runs and does this, in the standard's order:
 *
 *   1. Read the register. Only a well-formed open item is chased (a kind from
 *      the closed list, a job, a person who owes it, a due date).
 *   2. File anything that came back since the last run (the signed PDF landing
 *      in the accounts inbox) as evidence against its item: evidence.filed.
 *      The item leaves the chase this run.
 *   3. Rank the rest by value at risk (the first job), then days open.
 *   4. Hold any item where the business owes the customer something first
 *      (the agreement itself, a corrected rate sheet, an answer to a question).
 *   5. Ask the gate before every touch, on the first channel in the written
 *      cadence the contact consented to.
 *   6. Touch: a short email or text, or the call. The call opens with the AI
 *      identification and the recording notice, asks for the one document, and
 *      records the answer as an object. The live line is the hosted step and is
 *      not built here; on the stub the same code drives the stub line.
 *   7. A no, a dispute or "stop contacting me" ends the chase and goes to the
 *      cadence's named person (exception.raised). So does the cap, once, with
 *      every touch so far, and that person is told.
 *
 * Every port call is awaited, so the same build runs against a real register as
 * against the stub.
 */

const KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"];
const WRITTEN = new Set(["sms", "email"]);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// What is being asked for, in the office's words.
const ASK_FOR = {
  quote_decision: "your decision on our quote",
  signed_variation: "the signed variation",
  certificate: "the certificate we need on file",
  po_number: "your purchase order number",
  form: "the signed service agreement and rate sheet",
};

/** A spoken yes is never the document. Only a quote ends on a decision. */
const NEEDS_A_DOCUMENT = new Set(["signed_variation", "certificate", "po_number", "form"]);

export const isOpenItem = (i) =>
  KINDS.includes(i.kind) && Boolean(i.recordRef) && Boolean(i.owedBy) && Boolean(i.due);

const sydneyDate = (d) => new Date(d.getTime() + 10 * HOUR).toISOString().slice(0, 10);
const ageDays = (i, now) => Math.max(0, Math.floor((now - new Date(i.openedAt)) / DAY));
const aud = (n) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Value at risk first, days open breaking ties. Never age alone. */
export function chaseOrder(items, now) {
  return items
    .map((i) => ({ itemId: i.id, valueAtRisk: i.valueAtRisk, daysOpen: ageDays(i, now) }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
}

function reminder(item, contact, record) {
  const name = contact?.name?.split(" ")[0] ?? "there";
  const said = [...record.outcomes].reverse().find((o) => o.kind === "date");
  const when = said
    ? `You mentioned it would be with us by ${said.value}.`
    : `We need it on file by ${item.due.slice(0, 10)}, ahead of your first booked job (${item.recordRef}).`;
  return (
    `Hi ${name}, a quick note from our accounts team: we are still waiting on ${ASK_FOR[item.kind]} for ${item.recordRef}. ` +
    `${when} If it is already on its way, thank you, and please ignore this. Reply STOP and we will not follow up on this again.`
  );
}

/** Cadence order, kept to consented written channels; the call's basis sits with the hosted step. */
function channelsFor(cadence, consented, record) {
  const prior = [...record.touches].reverse().find((t) => t.channel === "call");
  const order =
    prior?.outcome === "date"
      ? [...cadence.channels.filter((c) => c !== "call"), ...cadence.channels.filter((c) => c === "call")]
      : [...cadence.channels];
  return order.filter((c) => c === "call" || consented.has(c));
}

async function handToPerson(ports, item, reason, cadence, history, said) {
  await ports.escalate(item.id, reason, cadence.escalateTo, history);
  const why = {
    cap_reached: `reached the cap of ${cadence.maxTouches} follow-ups with nothing back`,
    declined: `the customer said no${said ? ` ("${said}")` : ""}`,
    dispute: `the customer disputed it${said ? ` ("${said}")` : ""}`,
  }[reason];
  await ports.notify(
    cadence.escalateTo,
    `${ASK_FOR[item.kind]} for ${item.recordRef} (item ${item.id}, first job worth ${aud(item.valueAtRisk)}) ${why}. ` +
      `Follow-ups so far: ${history.map((t) => `${t.channel} ${t.at} ${t.outcome}`).join("; ") || "none"}. ` +
      `Whether the first job goes ahead without it is your call; nothing further goes out from here.`,
  );
}

async function ring(ports, item, now) {
  await ports.disclose(item.id, "Hi, this is an AI assistant calling for the accounts team. This call is recorded.");
  await ports.say(
    item.id,
    item.kind === "quote_decision"
      ? `I'm calling about our quote on ${item.recordRef}. Are you going ahead with it?`
      : `I'm calling about ${ASK_FOR[item.kind]} for ${item.recordRef}. What day can we expect it back?`,
  );
  const reply = await ports.listen(item.id);

  if (reply.heard === "date" && reply.value) {
    await ports.recordOutcome(item.id, { kind: "date", value: reply.value });
    return null;
  }
  if (reply.heard === "decision") {
    if (NEEDS_A_DOCUMENT.has(item.kind)) {
      // "Signed it this morning" is not the signed copy. Record today and keep
      // chasing until the document itself lands.
      await ports.recordOutcome(item.id, { kind: "date", value: sydneyDate(now) });
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
  // No answer: the call stays on the record as a touch with no outcome.
  return null;
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export async function build(ports) {
  const now = new Date(await ports.now());
  const register = await ports.readItems();
  const contacts = new Map((await ports.readContacts()).map((c) => [c.id, c]));
  const consents = await ports.readConsents();

  const live = register.filter((i) => i.status === "open" && isOpenItem(i));

  const toChase = [];
  for (const item of live) {
    if (item.received?.ref) await ports.attachEvidence(item.id, item.received.ref);
    else toChase.push(item);
  }

  const order = chaseOrder(toChase, now);
  await ports.rank(order);

  for (const { itemId } of order) {
    const item = toChase.find((i) => i.id === itemId);
    const cadence = await ports.readCadence(item.kind);
    const record = await ports.readRecord(item.id);
    if (record.arrival || record.escalations.length > 0) continue;

    const consented = new Set(consents.filter((c) => c.contactId === item.owedBy).map((c) => c.channel));
    const channels = channelsFor(cadence, consented, record);

    if (item.weOwe) {
      // The ball is with us: the gate's hold goes on the record, nothing goes out.
      await ports.gate(item.id, channels[0] ?? cadence.channels[0]);
      continue;
    }

    if (record.touches.length >= cadence.maxTouches) {
      const last = record.touches[record.touches.length - 1];
      const since = last ? now - new Date(last.at) : Infinity;
      if (since >= cadence.spacingHours * HOUR) await handToPerson(ports, item, "cap_reached", cadence, record.touches);
      continue;
    }

    let channel = null;
    for (const c of channels) {
      const d = await ports.gate(item.id, c);
      if (d.allowed) {
        channel = c;
        break;
      }
      if (d.reason !== "no_consent" && d.reason !== "outside_hours") break;
    }
    if (!channel) continue;

    if (WRITTEN.has(channel)) {
      await ports.sendMessage(item.id, channel, reminder(item, contacts.get(item.owedBy), record));
      continue;
    }
    const ended = await ring(ports, item, now);
    if (ended) {
      const after = await ports.readRecord(item.id);
      await handToPerson(ports, item, ended.reason, cadence, after.touches, ended.said);
    }
  }
}

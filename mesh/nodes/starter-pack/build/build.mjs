/**
 * Starter Pack: the build, to AIP-BS-FOLLOW-UP 2026-10-05.
 *
 * An Australian business takes on a new starter. Before their first pay run
 * the payroll officer needs four things back from them: the TFN declaration,
 * the super standard choice form, their bank details for pay, and evidence of
 * their right to work in Australia. Each is one open item on the starter
 * register, kind "form", against the starter's employee record (the
 * recordRef, for example `employee:E1042#tfn_declaration`), owed by the
 * starter, due before their start date. The value at risk is the figure the
 * register carries for what the missing paper holds up, usually the first
 * pay the payroll officer cannot process properly without it.
 *
 * Each weekday morning it runs once, keeps nothing between runs, and in the
 * standard's order:
 *
 *   1. Reads the register. Only a well-formed open item is chased: a kind
 *      from the closed list, the record it belongs to, who owes it, a due
 *      date. A typed note ("ask Sam about his super") is not.
 *   2. Files any document that came back since the last run against its item
 *      (evidence.filed). A document counts only when it is tied to the item
 *      by id: a reply on this bot's own chase thread or the starter's upload
 *      link for that item. When the last item for a starter is filed, it
 *      tells the payroll officer the pack is complete and held for them.
 *   3. Ranks what is left by value at risk, then days open. Never age alone.
 *   4. Asks the gate before every touch, on the first channel in the written
 *      cadence the starter agreed to.
 *   5. Sends one plain reminder, or, where the cadence has a call, discloses
 *      first, asks for the one document and records the answer as an object.
 *      The live call is the hosted step and is not built here.
 *   6. A no, a dispute or "stop contacting me" ends the chase and goes to the
 *      named payroll officer (exception.raised). So does the cap, once, with
 *      every touch so far.
 *
 * What it never does: it never puts a TFN, a bank account or a super fund
 * into payroll, never sets up the employee, never decides whether the work
 * rights evidence is good enough (a person checks VEVO), and never asks for
 * a tax file number or account number in the body of a text or email. Those
 * stay with the payroll officer. The pack is held for them.
 *
 * Every port call is awaited, so the same build runs against a real register
 * as against the stub.
 */

const KINDS = new Set(["quote_decision", "signed_variation", "certificate", "po_number", "form"]);
const WRITTEN = new Set(["sms", "email"]);
const DAY_MS = 86_400_000;
const AEST_MS = 10 * 3_600_000;

// The starter's four documents, in plain words. Keyed by the part of the
// record reference after "#".
const DOCUMENT = {
  tfn_declaration: "your signed TFN declaration",
  super_choice: "your super standard choice form",
  bank_details: "your bank details form for pay",
  work_rights: "evidence of your right to work in Australia (a passport, citizenship certificate or visa grant)",
};

// A shared register can carry other kinds; none of them gets a blank ask.
const ASK = {
  form: "the form we still need",
  certificate: "the certificate we asked for",
  po_number: "the purchase order number",
  signed_variation: "the signed change",
  quote_decision: "your decision on the quote",
};

const docName = (item) => {
  const key = String(item.recordRef ?? "").split("#")[1];
  return DOCUMENT[key] ?? ASK[item.kind];
};

const starterOf = (item) => String(item.recordRef ?? "").split("#")[0];

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

function reminder(item, person, outcomes) {
  const first = person?.name ? person.name.split(" ")[0] : "there";
  const said = [...outcomes].reverse().find((o) => o.kind === "date");
  const when = said ? ` You said you could send it by ${said.value}.` : "";
  return (
    `Hi ${first}, welcome aboard. Before your first pay we still need ${docName(item)}.${when}` +
    ` Please send it back through the secure link in your welcome email, not in a text, as it has personal details on it.` +
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
    cap_reached: `nothing back after ${cadence.maxTouches} reminders`,
    declined: "the starter said no",
    dispute: "the starter disputed it or asked us to stop",
  }[reason];
  await ports.notify(
    cadence.escalateTo,
    `Starter Pack: ${docName(item)} for ${starterOf(item)} is yours. ${why}${said ? `: "${said}"` : ""}. ` +
      `Touches so far: ${history.map((t) => `${t.channel} at ${t.at} (${t.outcome})`).join("; ") || "none"}. ` +
      `Nothing more goes to the starter on this item.`,
  );
}

async function ring(ports, item, cadence) {
  await ports.disclose(item.id, "Hi, this is an AI assistant calling for your new employer's payroll team. This call is recorded.");
  await ports.say(item.id, `We still need ${docName(item)} before your first pay. When can you send it?`);
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
  const filedFor = new Set();
  for (const item of register.filter(isChaseable)) {
    if (item.received?.ref) {
      await ports.attachEvidence(item.id, item.received.ref);
      filedFor.add(starterOf(item));
    } else waiting.push(item);
  }

  // A pack is complete when every item for that starter has arrived. Read it
  // back from the register, not from what this run believes it filed.
  if (filedFor.size) {
    const after = await ports.readItems();
    for (const starter of filedFor) {
      const pack = after.filter((i) => starterOf(i) === starter);
      if (pack.length && pack.every((i) => i.status === "arrived")) {
        const cadence = await ports.readCadence(pack[0].kind);
        await ports.notify(
          cadence.escalateTo,
          `Starter Pack: every document for ${starter} is back and filed. The pack is held for you to set up in payroll; nothing has been entered.`,
        );
      }
    }
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

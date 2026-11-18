/**
 * Lease Renewal Desk, built to AIP-BS-FOLLOW-UP.
 *
 * The job: a residential tenancy's fixed term is ending and the property
 * manager has already approved and released a renewal offer. What the agency
 * is owed back is the tenant's answer, as a signed renewal or a notice that
 * they are moving out. Each one is an open item of kind `form` on the
 * tenancy (recordRef is the tenancy_id), owed by the tenant, due at the
 * lease end date the property system holds.
 *
 * What this build never does: write or change the offer, quote a rent, offer
 * a discount, a shorter increase or any other concession, argue with a no,
 * or chase a tenant the agency still owes an answer to. The offer is the
 * property manager's. A no, a dispute, a "stop" or an item at the cap goes to
 * the named person on the cadence with every touch so far.
 *
 * Every read and write goes through the ports. Nothing is kept between runs:
 * the touches, outcomes, arrivals and escalations live on the record.
 */

const DAY_MS = 24 * 3600_000;
const KINDS = new Set(["quote_decision", "signed_variation", "certificate", "po_number", "form"]);

/** Check 1: only a real open item is chased. A typed note is not one. */
function isOpenItem(item) {
  return KINDS.has(item.kind) && Boolean(item.recordRef) && Boolean(item.owedBy) && Boolean(item.due);
}

function reminderText(name, item) {
  return (
    `Hi ${name}, a reminder that the fixed term of your lease (${item.recordRef}) ends on ${item.due}. ` +
    `Your property manager has sent you a renewal offer. Please reply to let us know whether you will sign ` +
    `the renewal or move out at the end of the term. Reply STOP and we will not message you about this again.`
  );
}

/** One call: disclose first, one ask, the answer kept as an object. */
function callTenant(ports, item, name, cadence, history) {
  ports.disclose(
    item.id,
    "Hi, this is an AI assistant calling for your property manager. This call is recorded.",
  );
  ports.say(
    item.id,
    `${name}, your lease (${item.recordRef}) ends on ${item.due}. Will you be signing the renewal offer you were sent, ` +
      `or moving out at the end of the term?`,
  );
  const reply = ports.listen(item.id);

  if (reply.heard === "date" && reply.value) {
    ports.recordOutcome(item.id, { kind: "date", value: reply.value });
    return;
  }
  if (reply.heard === "decision") {
    ports.recordOutcome(item.id, { kind: "decision", value: reply.value ?? "renewing" });
    return;
  }
  if (reply.heard === "declined" || reply.heard === "dispute" || reply.heard === "stop") {
    const kind = reply.heard === "declined" ? "declined" : "dispute";
    ports.recordOutcome(item.id, { kind, value: reply.heard === "stop" ? "stop contacting me" : reply.text });
    ports.say(item.id, "Thanks for letting us know. I'll pass that to your property manager.");
    const after = ports.readRecord(item.id);
    ports.escalate(item.id, kind, cadence.escalateTo, after.touches);
    ports.notify(
      cadence.escalateTo,
      `Lease renewal ${item.recordRef} (${item.id}): ${name} answered "${reply.text}" on the call. ` +
        `The chase has stopped and it is with you. ${after.touches.length} touch(es) so far.`,
    );
  }
  // Silence: the call touch stays on the record as having no outcome, and the
  // next touch comes back through the gate at the next spacing.
  void history;
}

/**
 * @param {import("@aipathway/conformance").FollowUpPorts} ports
 */
export function build(ports) {
  const now = ports.now();
  const items = ports.readItems();
  const contacts = ports.readContacts();
  const consents = ports.readConsents();
  const nameOf = (id) => contacts.find((c) => c.id === id)?.name ?? "there";
  const consented = (contactId, channel) =>
    consents.some((c) => c.contactId === contactId && c.channel === channel);

  const live = [];
  for (const item of items) {
    if (!isOpenItem(item) || item.status !== "open") continue;

    // Check 7: the signed renewal or the notice to vacate came back. File it
    // against the item and touch it no more.
    if (item.received) {
      ports.attachEvidence(item.id, item.received.ref);
      continue;
    }
    live.push(item);
  }

  // Check 2: value at risk first (the rent the new term holds up), days open second.
  const entries = live
    .map((i) => ({
      itemId: i.id,
      valueAtRisk: i.valueAtRisk,
      daysOpen: Math.floor((now.getTime() - new Date(i.openedAt).getTime()) / DAY_MS),
    }))
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk || b.daysOpen - a.daysOpen);
  ports.rank(entries);

  for (const entry of entries) {
    const item = live.find((i) => i.id === entry.itemId);
    const cadence = ports.readCadence(item.kind);
    const record = ports.readRecord(item.id);

    // Check 10: at the cap with nothing back, once to the named person, with history.
    if (record.touches.length >= cadence.maxTouches) {
      if (record.escalations.length === 0) {
        ports.escalate(item.id, "cap_reached", cadence.escalateTo, record.touches);
        ports.notify(
          cadence.escalateTo,
          `Lease renewal ${item.recordRef} (${item.id}): ${record.touches.length} touches and no answer from ` +
            `${nameOf(item.owedBy)}. The chase has stopped and it is with you.`,
        );
      }
      continue;
    }

    // Checks 3, 4 and 9: the first channel on the cadence the tenant consented
    // to, and only if the gate allows it now.
    for (const channel of cadence.channels) {
      if (channel !== "call" && !consented(item.owedBy, channel)) continue;
      const decision = ports.gate(item.id, channel);
      if (!decision.allowed) {
        if (decision.reason === "no_consent" || decision.reason === "outside_hours") continue;
        break; // arrived, declined, escalated, we owe them, cap or too soon: nothing goes out
      }
      if (channel === "call") callTenant(ports, item, nameOf(item.owedBy), cadence, record.touches);
      else ports.sendMessage(item.id, channel, reminderText(nameOf(item.owedBy), item));
      break;
    }
  }
}

/**
 * Defect Desk: sprinkler and fire-service deficiency routing, built to
 * AIP-BS-FIRE-SERVICE-PACK-STANDARD 2026-10-03.
 * https://aipathway.com.au/explore-ai/fire-service-pack-standard
 *
 * A reimplementation from the standard. Nothing here is taken from any other
 * bot's prompt, instructions or workflow.
 *
 * The job: an inspection report lands in a watched inbox. Each deficiency in it
 * is bound to one asset by its tag, recorded against the obligation the visit
 * discharges, and routed: a critical defect (as the technician categorised it
 * under AS 1851) goes to the named owner at once, everything else sits on the
 * coded defect queue with its owner. Anything that cannot be bound or recorded
 * is held for a named person, never guessed.
 *
 * What it never does: decide a result, decide severity, certify, attest, or
 * close a visit with evidence missing. Severity and result are what the
 * competent person recorded on the report; this node reads them, it does not
 * compute them.
 *
 * Wakes:
 *   { event: "email.received", message }   one parsed inspection report email
 *   { event: "schedule.tick" }              isolation revisit sweep
 *   { event: "document.requested", recordId } a client-facing defect notice,
 *                                            derived from the record now
 *   (exception.closed re-delivers the original email.received for that id.)
 *
 * Every effect goes through the ports. Nothing is kept between runs.
 */

/** Who owns what when the node has to stop. Names, not inboxes. */
export const DEFAULT_OWNERS = {
  coordinator: "Service Coordinator",
  critical: "Fire Safety Advisor",
};

/** The two severities a technician records against a defect (AS 1851 categories). */
const SEVERITIES = ["critical", "non_critical"];

/**
 * @param {import("@aipathway/conformance").FirePorts} ports
 * @param {object} [wake]
 * @param {object} [config]
 */
export async function build(ports, wake, config = {}) {
  if (!wake || typeof wake !== "object") return { handled: false, why: "no wake event" };
  const owners = { ...DEFAULT_OWNERS, ...(config.owners ?? {}) };

  if (wake.event === "schedule.tick") return sweep(ports, owners);
  if (wake.event === "document.requested") return documentFor(ports, wake);
  if (wake.event === "email.received" && wake.message) return intake(ports, wake.message, owners);
  return { handled: false, why: `not a wake this node takes: ${wake.event}` };
}

/** Hold the step for a named person. The exception is the stop. */
async function hold(ports, owner, reason, detail) {
  await ports.escalate(reason, JSON.stringify({ ...detail, exception_owner: owner }));
  return { held: reason, exception_owner: owner };
}

/** One inspection report email: each deficiency line worked on its own. */
async function intake(ports, message, owners) {
  const out = [];
  for (const item of message.items ?? []) {
    out.push(await one(ports, message, item, owners));
  }
  return { message_id: message.message_id, items: out };
}

async function one(ports, message, item, owners) {
  const ref = { message_id: message.message_id, tag: item.tag };

  // Check 1. Identity first, by the tag read on site. Never by the free-text
  // label in the email body: two hose reels in one corridor share a label.
  const resolved = await ports.resolveTag(item.tag);
  if (!("assetId" in resolved)) {
    return hold(ports, owners.coordinator, "identity.unresolved", { ...ref, finding: resolved.finding });
  }
  const assetId = resolved.assetId;

  // Check 2. The visit names the obligation it discharges, and it is live.
  const live = await ports.obligationsFor(assetId);
  const obligation = live.find((o) => o.id === item.obligation_id);
  if (!obligation) {
    return hold(ports, owners.coordinator, "record.no_obligation", {
      ...ref,
      asset_id: assetId,
      live_obligations: live.map((o) => o.id),
    });
  }

  // Check 5. A baseline the technician could not see is a stored non-conformance.
  if (item.baseline_seen === false) await ports.reportBaselineAbsent(assetId);

  // Check 8. Isolated is its own result and must carry a revisit date.
  if (item.result === "isolated") {
    const ok = await ports.recordIsolation(assetId, item.isolation?.revisit_by);
    if (!ok) {
      return hold(ports, owners.critical, "isolation.no_revisit_date", { ...ref, asset_id: assetId });
    }
    // An impaired system is urgent whatever else is true.
    await ports.escalate(
      "isolation.recorded",
      JSON.stringify({ ...ref, asset_id: assetId, revisit_by: item.isolation.revisit_by, authorised_by: item.isolation.authorised_by ?? null, exception_owner: owners.critical }),
    );
    return { asset_id: assetId, isolated: true };
  }

  // Check 3. The result is what the attending person recorded. Passed through.
  const result = item.result;
  if (result !== "pass" && result !== "defect") {
    return hold(ports, owners.coordinator, "record.no_result", { ...ref, asset_id: assetId });
  }

  // Severity is recorded too. A defect with no recorded severity is held,
  // never guessed from the wording.
  if (result === "defect" && !SEVERITIES.includes(item.defect?.severity)) {
    return hold(ports, owners.coordinator, "defect.no_severity", { ...ref, asset_id: assetId });
  }

  // Check 9. The tag photograph is present or explicitly absent. Absent lands
  // the record in unbound, out of the pass count.
  const tagPhotograph = (item.attachments ?? []).some((a) => a.kind === "tag");

  // Checks 4 and 7. Evidence is passed as supplied; the register holds it for
  // the class. A defect goes with its code and owner, or not at all.
  const stored = await ports.storeRecord({
    assetId,
    obligationId: obligation.id,
    result,
    evidence: item.evidence,
    ...(result === "defect" ? { defect: { code: item.defect?.code, owner: item.defect?.owner, note: item.defect?.note ?? "" } } : {}),
    tagPhotograph,
  });
  if (!("id" in stored)) {
    return hold(ports, owners.coordinator, "record.held", { ...ref, asset_id: assetId, why: stored.refused });
  }
  const recordId = stored.id;

  if (!tagPhotograph) {
    await ports.escalate("record.unbound", JSON.stringify({ ...ref, asset_id: assetId, record_id: recordId, exception_owner: owners.coordinator }));
  }

  // Routing. Critical goes to the named owner now; the rest stays on the coded
  // defect queue under the owner the technician named.
  if (result === "defect" && item.defect.severity === "critical") {
    await ports.escalate(
      "defect.critical",
      JSON.stringify({ ...ref, asset_id: assetId, record_id: recordId, code: item.defect.code, exception_owner: owners.critical }),
    );
  }

  // Check 6. Close the visit, telling the register whether electrical work was
  // done. A refusal is the outcome, not a reminder.
  if (item.close) {
    const closed = await ports.closeVisit(recordId, {
      electrical: item.electrical === true,
      ...(item.certificate_ref ? { certificateRef: item.certificate_ref } : {}),
    });
    if (!closed.ok) {
      return hold(ports, owners.coordinator, "close.refused", { ...ref, asset_id: assetId, record_id: recordId, why: closed.why });
    }
  }

  return { asset_id: assetId, record_id: recordId, unbound: !tagPhotograph };
}

/** Isolations whose revisit date has passed escalate, every sweep, until a person clears them. */
async function sweep(ports, owners) {
  const lapsed = await ports.sweepIsolations();
  for (const assetId of lapsed) {
    await ports.escalate("isolation.lapsed", JSON.stringify({ asset_id: assetId, exception_owner: owners.critical }));
  }
  return { lapsed };
}

/**
 * Checks 10 and 11. The client-facing notice is derived from the record at
 * request time, with retention and the person who may attest read for the
 * asset's own jurisdiction. It is a notice for the person who signs; it never
 * says the asset complies.
 */
async function documentFor(ports, wake) {
  const body = await ports.renderDocument(wake.recordId);
  if (body === null) return { document: null };
  const rules = wake.assetId && wake.obligationType ? await ports.jurisdictionRules(wake.assetId, wake.obligationType) : null;
  return {
    document: body,
    retention_years: rules?.retentionYears ?? null,
    attested_by: rules?.attestedBy ?? null,
    note: "For the person who attests. This notice is not a certificate.",
  };
}

/**
 * Safety Cert Desk, built to AIP-BS-FIRE-SERVICE-PACK-STANDARD.
 *
 * THE JOB. When a smoke alarm and RCD job is marked complete in the job
 * system, take the technician's test results for each alarm and each RCD on
 * the property, bind every result to the one asset its tag resolves to, and
 * draft the compliance pack for the licensed person to sign. If any result,
 * photograph, reading or test sheet is missing, hold the whole pack and name
 * the person who has to fix it. Nothing here signs, certifies or issues: the
 * pack it drafts is marked DRAFT and unsigned, and the licensed electrician
 * (or whoever the state's rule names) signs and issues it.
 *
 * HOW IT IS WOKEN (vocabulary 1.1):
 *   job.completed     { event, job }                 bind each test, then draft the pack if clean
 *   job.updated       { event, job, request: "draft_pack" }  redraft the pack from the bound records
 *   schedule.tick     { event }                      sweep isolated RCD circuits past their revisit date
 *   exception.closed  { event, job }                 the named person fixed it: rerun the job from the record
 *
 * `job` is the job as read by its job_id from the job system. Its `seam`
 * fields are where this node's durable state lives (record ids, the queue,
 * the exception owner). Nothing is matched on a name, an address or a phone
 * number: a test binds by the tag the technician read, and nothing else.
 *
 * Every write goes through the ports. The stub's are synchronous and a live
 * register's are not, so every call is awaited.
 */

export const SLUG = "safety-cert-desk";

/** Who owns each kind of stop, unless the business names someone else. */
export const DEFAULT_OWNERS = {
  binding: "Service Coordinator",
  electrical: "Licensed electrician on the job",
  defect: "Service Coordinator",
  isolation: "Licensed electrician on the job",
};

/**
 * What each kind of test on a smoke alarm and RCD job is, in the standard's
 * asset classes, and the evidence that class needs. A smoke alarm is a
 * portable item: the tag photographed in place after the test. An RCD is a
 * system with readings: its trip time in milliseconds as a number in a field,
 * and electrical work, so the test sheet blocks the close. A switchboard
 * enclosure check is a passive visual inspection.
 */
export const TEST_KINDS = {
  smoke_alarm: { assetClass: "portable", evidence: "image", electrical: false },
  rcd: { assetClass: "system", evidence: "reading", electrical: true },
  switchboard_visual: { assetClass: "passive", evidence: "inspection", electrical: false },
};

/** Defect codes are a closed list, kept by the business. A paragraph is not one. */
export const DEFECT_CODES = ["D1", "D2", "D3", "D4"];

const RESULTS = ["pass", "defect", "isolated"];

const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * @param {import("@aipathway/conformance").FirePorts} ports
 * @param {{ event: string, job?: any, request?: string }} [wake]
 * @param {{ owners?: Partial<typeof DEFAULT_OWNERS> }} [config]
 */
export async function build(ports, wake = { event: "none" }, config = {}) {
  const owners = { ...DEFAULT_OWNERS, ...(config.owners ?? {}) };

  const raise = async (reason, owner, fields) => {
    await ports.escalate(
      reason,
      JSON.stringify({ exception_owner: owner, node: SLUG, ...fields }),
    );
  };

  if (wake.event === "schedule.tick") return sweep(ports, raise, owners);

  const job = wake.job;
  if (!job || !isStr(job.job_id)) return { done: false, why: "no job id on the wake" };

  // Contract 4. An open exception with a named owner stops the chain. The
  // node does nothing and exits; exception.closed brings it back.
  if (job.seam?.exception_open === true && wake.event !== "exception.closed") {
    return { done: false, why: "exception open on the job", owner: job.seam.exception_owner };
  }

  if (wake.event === "job.updated" && wake.request === "draft_pack") {
    return draftPack(ports, raise, owners, job, job.seam?.records ?? []);
  }

  if (wake.event !== "job.completed" && wake.event !== "exception.closed") {
    return { done: false, why: `not woken for this node: ${wake.event}` };
  }

  const bound = [];
  let held = 0;
  for (const test of job.tests ?? []) {
    const out = await bindTest(ports, raise, owners, job, test);
    if (out.recordId && out.clean) bound.push({ record_id: out.recordId, asset_id: out.assetId, obligation_type: out.obligationType });
    if (!out.clean) held += 1;
  }

  // Hold the pack if any item is missing. A pack with a missing item is never
  // filed, so the draft is only made when every test bound cleanly.
  if (held > 0) {
    await raise("pack.held", owners.binding, {
      job_id: job.job_id,
      held_items: held,
      why: "one or more test results could not be bound; the draft pack waits",
    });
    return { done: false, held, bound };
  }
  return draftPack(ports, raise, owners, job, bound);
}

/** One test result on the job, bound to one asset or held. */
async function bindTest(ports, raise, owners, job, test) {
  const base = { job_id: job.job_id, tag: test.tag ?? null };
  const kind = TEST_KINDS[test.kind];
  if (!kind) {
    await raise("test.unknown_kind", owners.binding, { ...base, kind: test.kind ?? null });
    return { clean: false };
  }

  // 1. Identity before everything. A tag that resolves to nothing, or to two
  //    assets, is a finding. No record is written for it.
  const resolved = await ports.resolveTag(String(test.tag ?? ""));
  if (!("assetId" in resolved)) {
    await raise("asset.unresolved", owners.binding, { ...base, finding: resolved.finding });
    return { clean: false };
  }
  const assetId = resolved.assetId;
  const at = { ...base, asset_id: assetId };

  // 2. The visit discharges something. The job must name the obligation; a
  //    guess between two live ones is how coverage becomes a lie.
  const live = await ports.obligationsFor(assetId);
  const obligation = live.find((o) => o.id === test.obligation_id);
  if (!obligation) {
    await raise("record.no_obligation", owners.binding, {
      ...at,
      named: test.obligation_id ?? null,
      live: live.map((o) => o.id),
    });
    return { clean: false };
  }

  // 3. Result is recorded, never computed. A missing result is held, never
  //    filled in from the readings.
  if (!RESULTS.includes(test.result)) {
    await raise("result.missing", owners.binding, { ...at, why: "the technician recorded no result" });
    return { clean: false };
  }

  // 8. An isolated circuit carries who authorised it, why and a revisit date.
  if (test.result === "isolated") {
    if (!isStr(test.isolation?.revisit_by) || !isStr(test.isolation?.authorised_by)) {
      // The register refuses it too; the call puts that refusal in the trace.
      await ports.recordIsolation(assetId, undefined);
      await raise("isolation.no_revisit", owners.isolation, { ...at, why: "isolation needs who authorised it and a revisit date" });
      return { clean: false };
    }
    const ok = await ports.recordIsolation(assetId, test.isolation.revisit_by);
    await raise("isolation.recorded", owners.isolation, {
      ...at,
      authorised_by: test.isolation.authorised_by,
      reason: test.isolation.reason ?? null,
      revisit_by: test.isolation.revisit_by,
      accepted: ok === true,
    });
    // An isolated item is not coverage, so the pack waits for it.
    return { clean: false };
  }

  // 4. Evidence is a property of the class. A trip time photographed off a
  //    meter is not a reading.
  const ev = test.evidence;
  const valueOk =
    ev && ev.kind === kind.evidence &&
    (kind.evidence === "reading" ? Number.isFinite(Number(ev.value)) && isStr(String(ev.value)) : isStr(ev.value));
  if (!valueOk) {
    await raise("evidence.wrong_for_class", owners.binding, {
      ...at,
      asset_class: kind.assetClass,
      needs: kind.evidence,
      got: ev?.kind ?? null,
    });
    return { clean: false };
  }

  // 7. Defects are coded, with a named owner. A paragraph is held.
  let defect;
  if (test.result === "defect") {
    if (!DEFECT_CODES.includes(test.defect?.code) || !isStr(test.defect?.owner)) {
      await raise("defect.uncoded", owners.defect, { ...at, note: test.defect?.note ?? null });
      return { clean: false };
    }
    defect = { code: test.defect.code, owner: test.defect.owner, note: test.defect.note ?? "" };
  }

  // 9. The tag photograph is said out loud: missing goes to unbound, never pass.
  const tagPhotograph = test.tag_photograph === true;
  const stored = await ports.storeRecord({
    assetId,
    obligationId: obligation.id,
    result: test.result,
    evidence: { kind: ev.kind, value: String(ev.value) },
    ...(defect ? { defect } : {}),
    tagPhotograph,
  });
  if (!("id" in stored)) {
    await raise("record.refused", owners.binding, { ...at, why: stored.refused });
    return { clean: false };
  }
  const recordId = stored.id;
  let clean = true;

  // 5. Baseline absence is reportable. No commissioning trip time on file is a
  //    non-conformance, not a blank.
  if (test.baseline_seen !== true) {
    await ports.reportBaselineAbsent(assetId);
  }

  if (!tagPhotograph) {
    await raise("record.unbound", owners.binding, {
      ...at,
      record_id: recordId,
      queue: "unbound",
      unbound_since: (await ports.now()).toISOString(),
      why: "tag photograph missing",
    });
    clean = false;
  }

  // 6. Electrical work blocks the close. The close is attempted with the
  //    truth about the work, and a refusal holds the pack.
  const closed = await ports.closeVisit(recordId, {
    electrical: kind.electrical,
    ...(isStr(test.certificate_ref) ? { certificateRef: test.certificate_ref } : {}),
  });
  if (!closed.ok) {
    await raise("close.refused", owners.electrical, { ...at, record_id: recordId, why: closed.why });
    clean = false;
  }
  if (test.result === "defect") clean = false; // a defect is not coverage; the pack waits
  return { recordId, assetId, obligationType: obligation.obligationType, clean };
}

/**
 * 10 and 11. The draft pack, derived from the bound records at the moment it
 * is asked for, with the retention and the person who may attest read for the
 * property's state. Marked DRAFT and unsigned: the person named signs it.
 */
async function draftPack(ports, raise, owners, job, records) {
  if (records.length === 0) {
    await raise("pack.nothing_bound", owners.binding, { job_id: job.job_id });
    return { done: false };
  }
  const items = [];
  for (const rec of records) {
    const id = rec.record_id;
    const text = await ports.renderDocument(id);
    if (text == null) {
      await raise("pack.record_missing", owners.binding, { job_id: job.job_id, record_id: id });
      return { done: false };
    }
    items.push({ record_id: id, text });
  }
  const rules = [];
  const seen = new Set();
  for (const a of records) {
    const key = `${a.asset_id}|${a.obligation_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await ports.jurisdictionRules(a.asset_id, a.obligation_type);
    if (!r) {
      await raise("rule.missing_for_state", owners.binding, { job_id: job.job_id, asset_id: a.asset_id });
      return { done: false };
    }
    rules.push({ asset_id: a.asset_id, ...r });
  }
  return {
    done: true,
    pack: {
      status: "DRAFT, unsigned, awaiting the person who may attest",
      job_id: job.job_id,
      items,
      rules,
    },
  };
}

/** schedule.tick: an isolated circuit past its revisit date escalates, every run, until a person clears it. */
async function sweep(ports, raise, owners) {
  const lapsed = await ports.sweepIsolations();
  for (const assetId of lapsed) {
    await raise("isolation.lapsed", owners.isolation, { asset_id: assetId, why: "revisit date passed" });
  }
  return { done: true, lapsed };
}

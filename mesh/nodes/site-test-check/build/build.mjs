/**
 * Site Test Check, built to AIP-BS-FIRE-SERVICE-PACK-STANDARD.
 *
 * THE JOB. When a fire service visit to a commercial site is marked done in
 * the job system, check every test result the technician recorded against the
 * site's asset register, hold any test with no tagged asset or no photograph of
 * the tag, and compile the site's service report from the bound records, as a
 * DRAFT for the person who attests to check and sign. It also checks the other
 * way: an asset the register says was due on this visit and that has no test
 * against it is a gap in the report, not a silent omission.
 *
 * WHAT IT NEVER DOES. It never signs, certifies, attests or issues. It never
 * decides a pass: the result is the one the technician entered. It never files
 * a report with a missing item: one held test holds the whole report, and a
 * named person clears it.
 *
 * HOW IT IS WOKEN (vocabulary 1.1):
 *   job.completed     { event, job }                             check each test, then compile if clean
 *   job.updated       { event, job, request: "compile_report" }  recompile from the bound records
 *   schedule.tick     { event }                                  escalate isolations past their revisit date
 *   exception.closed  { event, job }                             the named person fixed it: rerun from the record
 *
 * `job` is the visit as read by its job_id from the job system, with the
 * site's register rows read by site id. Its `seam` fields hold this node's
 * durable state. A test binds by the tag the technician read and nothing else:
 * never by a description, a location note or a name.
 *
 * Every outside effect goes through the ports, and every call is awaited, so
 * the same build runs on the stub and on a live register.
 */

export const SLUG = "site-test-check";

/** Who owns each kind of stop, unless the business names someone else. */
export const DEFAULT_OWNERS = {
  binding: "Service Coordinator",
  defect: "Service Coordinator",
  electrical: "Licensed electrician on the visit",
  isolation: "Fire Safety Advisor",
  report: "Fire Safety Advisor",
};

/**
 * Required evidence is a property of the asset class (standard section 4).
 * Portable items (extinguishers, fire blankets): the tag photographed in situ.
 * Systems with readings (hydrant flow, pump pressure, hose reel): the reading
 * as a number in a field. Passive items (fire doors, penetrations): a visual
 * inspection entry.
 */
export const EVIDENCE_FOR = { portable: "image", system: "reading", passive: "inspection" };

/** The business's closed defect list. A paragraph is not a defect. */
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
    await ports.escalate(reason, JSON.stringify({ exception_owner: owner, node: SLUG, ...fields }));
  };

  if (wake.event === "schedule.tick") return sweepIsolations(ports, raise, owners);

  const job = wake.job;
  if (!job || !isStr(job.job_id)) return { done: false, why: "no job id on the wake" };

  // An open exception with a named owner stops the chain until it is closed.
  if (job.seam?.exception_open === true && wake.event !== "exception.closed") {
    return { done: false, why: "exception open on the visit", owner: job.seam.exception_owner };
  }

  if (wake.event === "job.updated" && wake.request === "compile_report") {
    return compileReport(ports, owners, job, job.seam?.records ?? []);
  }
  if (wake.event !== "job.completed" && wake.event !== "exception.closed") {
    return { done: false, why: `not woken for this node: ${wake.event}` };
  }

  const register = new Map((job.register ?? []).map((row) => [row.asset_id, row]));
  const bound = [];
  const testedAssets = new Set();
  let held = 0;

  for (const test of job.tests ?? []) {
    const out = await checkTest(ports, raise, owners, job, register, test);
    if (out.assetId) testedAssets.add(out.assetId);
    if (out.clean && out.recordId) bound.push({ record_id: out.recordId, asset_id: out.assetId, obligation_type: out.obligationType });
    if (!out.clean) held += 1;
  }

  // The other direction: an asset the register put on this visit with no test
  // against it. It lands in the blocked queue with its obligation still live.
  for (const assetId of job.due_assets ?? []) {
    if (testedAssets.has(assetId)) continue;
    await raise("asset.not_tested", owners.binding, {
      job_id: job.job_id,
      site_id: job.site?.site_id ?? null,
      asset_id: assetId,
      queue: "blocked",
      why: "due on this visit per the register, no test recorded against it",
    });
    held += 1;
  }

  if (held > 0) {
    await raise("report.held", owners.binding, {
      job_id: job.job_id,
      site_id: job.site?.site_id ?? null,
      held_items: held,
      why: "one or more tests could not be bound; the site report waits",
    });
    return { done: false, held, bound };
  }
  return compileReport(ports, owners, job, bound);
}

/** One test on the visit: bound to exactly one asset and stored, or held. */
async function checkTest(ports, raise, owners, job, register, test) {
  const base = { job_id: job.job_id, site_id: job.site?.site_id ?? null, tag: test?.tag ?? null };

  // Check 1. Identity before everything. No tag, no record.
  if (!isStr(test?.tag)) {
    await raise("asset.unresolved", owners.binding, { ...base, why: "no tag read on the test" });
    return { clean: false };
  }
  const who = await ports.resolveTag(test.tag);
  if (!who || !("assetId" in who)) {
    await raise("asset.unresolved", owners.binding, { ...base, finding: who?.finding ?? "unresolved" });
    return { clean: false };
  }
  const assetId = who.assetId;
  const at = { ...base, asset_id: assetId };

  // The register row says the class. An asset on no register row for this
  // site is not on this site's register, whatever the tag says.
  const row = register.get(assetId);
  if (!row || !EVIDENCE_FOR[row.asset_class]) {
    await raise("asset.not_on_site_register", owners.binding, { ...at, why: "tag resolves to an asset not on this site's register" });
    return { clean: false, assetId };
  }

  // Check 2. The visit discharges a named, live obligation. Never inferred.
  const live = (await ports.obligationsFor(assetId)) ?? [];
  const obligation = live.find((o) => o.id === test.obligation_id);
  if (!obligation) {
    await raise("record.no_obligation", owners.binding, { ...at, named: test.obligation_id ?? null, live: live.map((o) => o.id) });
    return { clean: false, assetId };
  }

  // Check 3. The result is what the technician entered. Nothing computes it.
  if (!RESULTS.includes(test.result)) {
    await raise("result.missing", owners.binding, { ...at, why: "no pass, defect or isolated entered by the technician" });
    return { clean: false, assetId };
  }

  // Check 5. A missing baseline is a stored non-conformance, not a blank.
  if (test.baseline_seen === false) await ports.reportBaselineAbsent(assetId);

  // Check 8. An isolation carries who, why and a revisit date.
  if (test.result === "isolated") {
    const iso = test.isolation ?? {};
    const ok = isStr(iso.authorised_by) && isStr(iso.reason) && isStr(iso.revisit_by)
      ? await ports.recordIsolation(assetId, iso.revisit_by)
      : await ports.recordIsolation(assetId, undefined);
    if (!ok) {
      await raise("isolation.no_revisit", owners.isolation, { ...at, why: "isolation needs who authorised it, why, and a revisit date" });
      return { clean: false, assetId };
    }
    await raise("isolation.recorded", owners.isolation, { ...at, revisit_by: iso.revisit_by, authorised_by: iso.authorised_by });
    return { clean: true, assetId, isolated: true };
  }

  // Check 4. Evidence is the kind this asset's class needs.
  const needs = EVIDENCE_FOR[row.asset_class];
  const ev = test.evidence ?? {};
  const readingOk = needs !== "reading" || (isStr(ev.value) && Number.isFinite(Number(ev.value)));
  if (ev.kind !== needs || !isStr(ev.value) || !readingOk) {
    await raise("evidence.wrong_for_class", owners.binding, { ...at, asset_class: row.asset_class, needs, got: ev.kind ?? null });
    return { clean: false, assetId };
  }

  // Check 7. A defect is a code from the list with a named owner.
  if (test.result === "defect") {
    const d = test.defect ?? {};
    if (!DEFECT_CODES.includes(d.code) || !isStr(d.owner)) {
      await raise("defect.uncoded", owners.defect, { ...at, why: "defect needs a code from the list and a named owner" });
      return { clean: false, assetId };
    }
  }

  const stored = await ports.storeRecord({
    assetId,
    obligationId: obligation.id,
    result: test.result,
    evidence: { kind: ev.kind, value: String(ev.value) },
    ...(test.result === "defect" ? { defect: { code: test.defect.code, owner: test.defect.owner, note: test.defect.note ?? "" } } : {}),
    tagPhotograph: test.tag_photograph === true,
  });
  if (!stored || !("id" in stored)) {
    await raise("record.refused", owners.binding, { ...at, refused: stored?.refused ?? "no id back" });
    return { clean: false, assetId };
  }
  const recordId = stored.id;

  // Check 9. No tag photograph: stored, but in the unbound queue with its age,
  // out of the pass count and out of the report.
  if (test.tag_photograph !== true) {
    await raise("record.unbound", owners.binding, { ...at, record_id: recordId, queue: "unbound", unbound_since: (await ports.now()).toISOString() });
    return { clean: false, assetId, recordId };
  }

  // Check 6. Electrical work (emergency and exit lighting) cannot close
  // without its test sheet. A refusal, never a reminder.
  const electrical = row.electrical === true;
  const closed = await ports.closeVisit(recordId, { electrical, ...(isStr(test.certificate_ref) ? { certificateRef: test.certificate_ref } : {}) });
  if (!closed?.ok) {
    await raise("close.refused", owners.electrical, { ...at, record_id: recordId, why: closed?.why ?? "close refused" });
    return { clean: false, assetId, recordId };
  }

  return { clean: true, assetId, recordId, obligationType: obligation.obligationType };
}

/**
 * Check 10 and 11. The report is derived from the bound records at the moment
 * it is asked for, and who attests and how long it is kept come from the
 * dated rule for the asset's state. It is a draft; nothing here signs it.
 */
async function compileReport(ports, owners, job, records) {
  const lines = [];
  const rules = [];
  for (const r of records) {
    const text = await ports.renderDocument(r.record_id);
    if (!isStr(text)) continue;
    const rule = await ports.jurisdictionRules(r.asset_id, r.obligation_type);
    if (rule) rules.push(rule);
    lines.push({ record_id: r.record_id, asset_id: r.asset_id, line: text });
  }
  const report = {
    job_id: job.job_id,
    site_id: job.site?.site_id ?? null,
    status: "DRAFT, unsigned, for the person who attests",
    attested_by: [...new Set(rules.map((x) => x.attestedBy))],
    retention_years: rules.length ? Math.max(...rules.map((x) => x.retentionYears)) : null,
    lines,
    reviewer: owners.report,
  };
  return { done: true, report };
}

/** Lapsed isolations escalate on the day they lapse, every tick until fixed. */
async function sweepIsolations(ports, raise, owners) {
  const lapsed = (await ports.sweepIsolations()) ?? [];
  for (const assetId of lapsed) {
    await raise("isolation.lapsed", owners.isolation, { asset_id: assetId, why: "revisit date passed; it does not clear itself" });
  }
  return { done: true, lapsed };
}

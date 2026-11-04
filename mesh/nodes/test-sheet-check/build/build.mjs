/**
 * Test Sheet Check: the electrical test record behind a job's handover
 * certificate, built to AIP-BS-REJECTED-PACK 2026-10-03.
 * https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * The job, in the electrical contractor's words: before the certificate for a
 * job is signed and given to the customer, check the test result sheet the
 * electrician sent in is complete and every reading is in range, and put any
 * failed or blank test in front of the licensed electrician.
 *
 * An original build from the standard. Nothing here is taken from any other
 * bot, app, prompt or workflow.
 *
 * Narrowed on purpose: this build never issues, signs or sends the
 * certificate. It files the test sheet against the job, checks it, and drafts
 * the test record the certificate is written from. The licensed electrician
 * releases that record and signs and gives the certificate themselves.
 *
 * What one run does, for each job it is handed (an email.received wake when a
 * test sheet arrives, job.completed, or exception.closed):
 *
 *   0. Read the graph and the dated rules. Every reading taken off a photo or
 *      scan below the confidence gate is Yellow. Nothing promotes it on a score.
 *   1. Identity: the sheet carries this job's number, and names the
 *      electrician who did the tests with their licence number. Stop on failure.
 *   2. Tickets: the contractor licence and the electrician's licence are
 *      current, and the test instrument is inside its calibration period.
 *   3. Applicability: which tests this job's scope needs. The RCD trip test
 *      only where an RCD was installed or altered; a written no otherwise.
 *   4. Completeness: every applicable test has a reading, and every reading is
 *      in range under the dated procedure. Blank or out of range stops it.
 *   5. Field reuse: one contractor licence number. The sheet's must be the
 *      graph's; every artefact references the graph and never copies it.
 *   6. Source and as-of: each clause cites its rule; the record carries a date;
 *      the date the certificate is due is derived from the dated rule.
 *   7. Human gate: the licensed electrician releases this version. Never the build.
 *   8. Handover: one self-contained test record per job, on release only.
 *
 * The binding layer (one graph per job, every artefact derived from it, and
 * re-derived when a fact or a rule moves) is the hard step, and it is declared.
 */

/** Below this, a reading taken off a photo or scan is Yellow and waits for a person. */
export const CONFIDENCE_GATE = 0.85;

/** The dated rules this build reads. A missing one stops the job; nothing is assumed. */
const RULE = {
  testing: "qld.esr-2013-testing",
  insulation: "proc.insulation-resistance",
  earth: "proc.earth-continuity",
  polarity: "proc.polarity",
  connections: "proc.circuit-connections",
  faultLoop: "proc.fault-loop-impedance",
  rcd: "proc.rcd-trip-time",
  calibration: "proc.meter-calibration",
  certificate: "proc.certificate-due",
};

/** Each test: the reading's field, the rule it is held to, and how the reading is judged. */
const TESTS = [
  { key: "insulation_mohm", label: "insulation resistance", rule: RULE.insulation, judge: (v, r) => num(v) >= limit(r, "at least") },
  { key: "earth_ohm", label: "earth continuity", rule: RULE.earth, judge: (v, r) => num(v) <= limit(r, "not more than") },
  { key: "polarity", label: "polarity", rule: RULE.polarity, judge: (v) => String(v).trim().toLowerCase() === "correct" },
  { key: "connections", label: "correct circuit connections", rule: RULE.connections, judge: (v) => String(v).trim().toLowerCase() === "correct" },
  { key: "fault_loop_ohm", label: "fault loop impedance", rule: RULE.faultLoop, judge: (v, _r, f, j) => num(v) <= num(f[`${j}:t:fault_loop_max_ohm`]) },
  { key: "rcd_ms", label: "RCD trip time", rule: RULE.rcd, judge: (v, r) => num(v) <= limit(r, "within"), onlyIf: (f, j) => f[`${j}:rcd_in_scope`] === "yes" },
];

/** Every string the build can put in front of a person. None of it says compliant. */
export const COPY = {
  pass: (asOf, person) => `Test record complete and in range as of ${asOf}, cited, reviewed by ${person}. The certificate is the electrician's to sign and give.`,
  due: (date) => `Certificate due to the customer by ${date}.`,
  hold: (why) => `On hold for the licensed electrician: ${why}. No certificate is drafted from this sheet.`,
  fail: (why) => `Do not issue: ${why}.`,
};

const BUSINESS = ["biz:trading_name", "biz:abn", "biz:trading_address", "biz:ec_licence"];

const num = (v) => (v === undefined || String(v).trim() === "" ? NaN : Number(v));
const present = (v) => v !== undefined && String(v).trim() !== "";
const isLink = (v) => /^(https?:|\\\\|file:)/i.test(String(v ?? ""));
/** The number a dated rule holds a reading to, read from the rule itself, never hard-coded. */
const limit = (rule, word) => Number(new RegExp(`${word} (\\d+(?:\\.\\d+)?)`).exec(rule?.text ?? "")?.[1] ?? NaN);

function identity(f, j) {
  if (!present(f[`${j}:sheet:job_no`])) return { passed: false, reason: "identity: the test sheet carries no job number" };
  if (f[`${j}:sheet:job_no`] !== f[`${j}:job_no`])
    return { passed: false, reason: `identity: the test sheet is for job ${f[`${j}:sheet:job_no`]}, not job ${f[`${j}:job_no`]}` };
  if (!present(f[`${j}:tech:name`]) || !present(f[`${j}:tech:licence_no`]))
    return { passed: false, reason: "identity: the sheet does not name the electrician who tested, with their licence number" };
  return { passed: true, reason: `identity: sheet is for job ${f[`${j}:job_no`]}, tested by ${f[`${j}:tech:name`]}` };
}

function tickets(f, j, now, calibrationDue) {
  const expired = (d) => present(d) && new Date(d).getTime() <= now.getTime();
  if (!present(f["biz:ec_licence:expires_on"]) || expired(f["biz:ec_licence:expires_on"]))
    return { passed: false, reason: `tickets: the electrical contractor licence is not current (${f["biz:ec_licence:expires_on"]?.slice(0, 10) ?? "no expiry on record"})` };
  if (!present(f[`${j}:tech:licence_expires_on`]) || expired(f[`${j}:tech:licence_expires_on`]))
    return { passed: false, reason: `tickets: ${f[`${j}:tech:name`]}'s electrical licence is not current (${f[`${j}:tech:licence_expires_on`]?.slice(0, 10) ?? "no expiry on record"})` };
  if (!calibrationDue || new Date(calibrationDue.date).getTime() <= now.getTime())
    return { passed: false, reason: `tickets: test instrument ${f[`${j}:meter:serial`] ?? "(no serial)"} is out of calibration` };
  return { passed: true, reason: "tickets: contractor licence, electrician's licence and instrument calibration are current" };
}

function applicability(f, j, ruleOf) {
  if (f[`${j}:state`] !== "QLD") return { passed: false, reason: `applicability: no test procedure loaded for ${f[`${j}:state`] ?? "an unknown state"}`, applies: [], notApplicable: [] };
  const applies = [];
  const notApplicable = [];
  for (const t of TESTS) {
    const rule = ruleOf(t.rule);
    if (!rule) return { passed: false, reason: `applicability: rule ${t.rule} is not loaded`, applies, notApplicable };
    if (!t.onlyIf || t.onlyIf(f, j)) applies.push(t);
    else
      notApplicable.push({
        test: t,
        rule,
        reason: `The ${t.label} test does not apply because no RCD was installed or altered in the scope of job ${f[`${j}:job_no`]} (${rule.id} ${rule.version}).`,
      });
  }
  return { passed: true, reason: `applicability: ${applies.length} tests apply; written no for ${notApplicable.map((n) => n.test.label).join(", ") || "none"}`, applies, notApplicable };
}

function completeness(f, j, applies, ruleOf) {
  if (!present(f[`${j}:sheet:evidence`])) return { passed: false, reason: "completeness: the original test sheet is not filed against the job" };
  const blank = applies.filter((t) => !present(f[`${j}:t:${t.key}`]));
  if (blank.length > 0) return { passed: false, reason: `completeness: no reading for ${blank.map((t) => t.label).join(", ")}; held, nothing invented` };
  for (const t of applies) {
    const v = f[`${j}:t:${t.key}`];
    if (!t.judge(v, ruleOf(t.rule), f, j)) return { passed: false, reason: `completeness: ${t.label} reading ${v} is out of range under ${t.rule} ${ruleOf(t.rule).version}` };
  }
  return { passed: true, reason: `completeness: every one of ${applies.length} applicable tests has a reading in range` };
}

function fieldReuse(f, j) {
  const onSheet = f[`${j}:sheet:ec_licence`];
  if (present(onSheet) && onSheet.replace(/\s/g, "") !== String(f["biz:ec_licence"]).replace(/\s/g, ""))
    return { passed: false, reason: `field reuse: the sheet carries contractor licence ${onSheet}, the record carries ${f["biz:ec_licence"]}; two licence numbers on one job` };
  return { passed: true, reason: "field reuse: one contractor licence number, and every artefact references the graph" };
}

/** Fact keys for the job's artefacts. References only: their text is derived on read. */
function artefactRefs(f, j, applies) {
  const job = [`${j}:job_no`, `${j}:customer`, `${j}:site_address`];
  const tech = [`${j}:tech:name`, `${j}:tech:licence_no`];
  const readings = applies.flatMap((t) => [`${j}:t:${t.key}`, ...(t.key === "fault_loop_ohm" ? [`${j}:t:fault_loop_max_ohm`] : [])]);
  const meter = [`${j}:meter:serial`, `${j}:meter:calibrated_on`].filter((k) => present(f[k]) && !isLink(f[k]));
  return {
    "results-schedule": [...BUSINESS, ...job, ...tech, ...readings, ...meter],
    "certificate-draft": [...BUSINESS, ...job, ...tech],
    "job-note": [...BUSINESS, ...job],
    // The handover carries the readings themselves, never a link into the business's own drive.
    handover: [...BUSINESS, ...job, ...tech, ...readings, ...meter],
  };
}

async function derive(ports, jobPack, name, refs) {
  const id = `${jobPack}:${name}`;
  // Derived once; later runs re-render the same artefact from the graph.
  if ((await ports.renderArtefact(id)) === null) await ports.deriveArtefact({ id, packId: jobPack, refs });
  return id;
}

const ruleLookup = (rules, now) => (id) =>
  rules
    .filter((r) => r.id === id && r.effectiveFrom <= now.toISOString())
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .pop();

/**
 * One run over the jobs it is handed.
 *
 * config.jobs:       [{ packId, jobId }] read by id from the job system.
 * config.releases:   { [packId]: { person } } the licensed electrician's release, if any.
 * config.exceptions(jobId): an open exception with a named owner, or null.
 *
 * @param {import("@aipathway/conformance").PackPorts} ports
 */
export async function build(ports, config = {}) {
  await ports.declareHardStep(
    "the binding layer: each test sheet bound to its job in one graph, every artefact derived from it, and re-derived when a fact or a rule moves",
  );
  const now = ports.now();
  const facts = await ports.readFacts();
  const rules = await ports.readRules();
  const ruleOf = ruleLookup(rules, now);
  const results = [];

  for (const { packId, jobId: j } of config.jobs ?? []) {
    const open = config.exceptions?.(j);
    if (open) {
      results.push({ packId, skipped: `exception open, owned by ${open.owner}` });
      continue;
    }

    // 0. Low-confidence readings are Yellow, field by field.
    for (const t of TESTS) {
      const c = facts[`${j}:t:${t.key}#confidence`];
      if (c !== undefined && Number(c) < CONFIDENCE_GATE) await ports.markYellow(packId, `${j}:t:${t.key}`);
    }

    const stop = async (check, r) => {
      await ports.runCheck(packId, check, false, r.reason);
      await ports.publishCopy([check === "completeness" ? COPY.hold(r.reason) : COPY.fail(r.reason)]);
      results.push({ packId, queue: "fail", failedCheck: check, reason: r.reason, owner: facts[`${j}:tech:name`] ?? null });
    };

    const id = identity(facts, j);
    if (!id.passed) { await stop("identity", id); continue; }
    await ports.runCheck(packId, "identity", true, id.reason);

    const calibrationDue = present(facts[`${j}:meter:calibrated_on`]) ? await ports.dueDateFor(RULE.calibration, facts[`${j}:meter:calibrated_on`]) : null;
    const tk = tickets(facts, j, now, calibrationDue);
    if (!tk.passed) { await stop("tickets", tk); continue; }
    await ports.runCheck(packId, "tickets", true, tk.reason);

    const ap = applicability(facts, j, ruleOf);
    if (!ap.passed) { await stop("applicability", ap); continue; }
    for (const n of ap.notApplicable) await ports.declareNotApplicable(j, n.reason);
    await ports.runCheck(packId, "applicability", true, ap.reason);

    const cp = completeness(facts, j, ap.applies, ruleOf);
    if (!cp.passed) { await stop("completeness", cp); continue; }
    await ports.runCheck(packId, "completeness", true, cp.reason);

    const fr = fieldReuse(facts, j);
    if (!fr.passed) { await stop("field_reuse", fr); continue; }
    const refs = artefactRefs(facts, j, ap.applies);
    const artefacts = {};
    for (const name of Object.keys(refs)) artefacts[name] = await derive(ports, packId, name, refs[name]);
    await ports.runCheck(packId, "field_reuse", true, fr.reason);

    // 6. Every clause cites its rule; the certificate's due date is derived from the dated rule.
    const due = present(facts[`${j}:completed_on`]) ? await ports.dueDateFor(RULE.certificate, facts[`${j}:completed_on`]) : null;
    const testing = ruleOf(RULE.testing);
    const clauses = [
      ...(testing ? [{ text: `Tested before energising, job ${facts[`${j}:job_no`]} (${testing.id} ${testing.version}).`, sourceRuleId: RULE.testing }] : []),
      ...ap.applies.map((t) => ({ text: `${t.label}: ${facts[`${j}:t:${t.key}`]}, in range under ${t.rule} ${ruleOf(t.rule).version}.`, sourceRuleId: t.rule })),
      ...ap.notApplicable.map((n) => ({ text: n.reason, sourceRuleId: n.rule.id })),
      { text: `Instrument ${facts[`${j}:meter:serial`]} calibrated to ${calibrationDue.date.slice(0, 10)} (${RULE.calibration} ${calibrationDue.version}).`, sourceRuleId: RULE.calibration },
      ...(due ? [{ text: `${COPY.due(due.date.slice(0, 10))} (${RULE.certificate} ${due.version})`, sourceRuleId: RULE.certificate }] : []),
    ];
    for (const c of clauses) await ports.addClause(packId, c);
    const asOf = now.toISOString();
    await ports.setAsOf(packId, asOf);
    if (!testing || !due) { await stop("source_and_as_of", { reason: "source and as-of: a clause has no dated rule or no completion date behind it" }); continue; }
    await ports.runCheck(packId, "source_and_as_of", true, `source and as-of: ${clauses.length} clauses cited, as of ${asOf}`);

    // 7. The licensed electrician releases this version. The build never does.
    const release = config.releases?.[packId];
    if (!release) {
      results.push({ packId, queue: "awaiting_release", certificateDue: due.date, owner: facts[`${j}:tech:name`] });
      continue;
    }
    const accepted = `${await ports.renderArtefact(artefacts["results-schedule"])} | as of ${asOf}`;
    const ok = await ports.acceptVersion(packId, { person: release.person, accepted });
    if (!ok) {
      results.push({ packId, queue: "awaiting_release", refused: "no named person" });
      continue;
    }
    await ports.publishCopy([COPY.pass(asOf.slice(0, 10), release.person), COPY.due(due.date.slice(0, 10))]);

    // 8. One self-contained test record for the job.
    const out = await ports.handover(packId);
    results.push({ packId, queue: out.ok ? "pass" : "awaiting_release", handedOver: out.ok, certificateDue: due.date });
  }

  // The run log keeps ids and states, never readings or customer details.
  await ports.retain("run-log", JSON.stringify(results.map((r) => ({ packId: r.packId, queue: r.queue ?? null, failedCheck: r.failedCheck ?? null }))));
  return results;
}

/** Hand over a job's test record on request. The world refuses a failed one; so does this. */
export async function handover(ports, packId) {
  return ports.handover(packId);
}

build.handover = handover;

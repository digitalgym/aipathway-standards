/**
 * Handover Manual: the operation and maintenance manual for a finished
 * building job, built to AIP-BS-REJECTED-PACK 2026-10-03.
 * https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * The job, in the builder's words: when a job reaches practical completion,
 * put the O&M manual together from the job's asset list, certificates and
 * records, and list anything still missing before it goes to the client.
 *
 * An original build from the standard. Nothing here is taken from any other
 * bot, app, prompt or workflow.
 *
 * Narrowed on purpose: this build never gives the manual to the client. It
 * drafts the manual on the job, lists every missing item, and holds it. The
 * project manager releases the version, and gives it to the client themselves.
 *
 * What one run does, for each job it is handed (job.completed at practical
 * completion, document.received when a certificate lands in the job folder,
 * or exception.closed):
 *
 *   0. Read the graph and the dated rules. A serial or certificate number read
 *      off a scan below the confidence gate is Yellow. Nothing promotes it.
 *   1. Identity: the job has a number and a project manager, the builder's
 *      licence is on record, and every filed record carries this job's number.
 *   2. Tickets: the builder's licence is current, and so is the licence of
 *      every trade that installed an asset on the job.
 *   3. Applicability: which records this job's assets and scope need. A written
 *      no for each one that does not apply (no pool, no termite system...).
 *   4. Completeness: every applicable record is filed. If not, the full list of
 *      what is missing, held for the project manager. Nothing is invented.
 *   5. Field reuse: one site address and one builder licence number across
 *      every record; every artefact references the graph and never copies it.
 *   6. Source and as-of: each clause cites its rule; warranty end dates, first
 *      service dates and the date the manual is due are derived from dated rules.
 *   7. Human gate: the project manager releases this version. Never the build.
 *   8. Handover: one self-contained manual per job, on release only.
 *
 * The binding layer (one graph per job, every artefact derived from it, and
 * re-derived when a fact or a rule moves) is the hard step, and it is declared.
 */

/** Below this, a value read off a scan is Yellow and waits for a person. */
export const CONFIDENCE_GATE = 0.85;

/** The dated rules this build reads. A missing one stops the job; nothing is assumed. */
export const RULE = {
  licence: "hb.builder-licence",
  finalCert: "hb.final-inspection",
  warranty: "hb.warranty",
  instructions: "hb.maintenance-instructions",
  plumbing: "hb.plumbing-compliance",
  electrical: "hb.electrical-testing",
  smoke: "hb.smoke-alarm-service",
  termite: "hb.termite-notice",
  backflow: "hb.backflow-test",
  pool: "hb.pool-safety",
  manualDue: "hb.manual-due",
};

/** What each class of installed asset needs in the manual. */
const ASSET_DOCS = {
  hot_water: [
    { doc: "warranty", label: "maker's warranty", rule: RULE.warranty },
    { doc: "instructions", label: "maintenance instructions", rule: RULE.instructions },
    { doc: "plumbing_cert", label: "plumbing compliance certificate", rule: RULE.plumbing },
  ],
  smoke_alarms: [
    { doc: "warranty", label: "maker's warranty", rule: RULE.warranty },
    { doc: "instructions", label: "maintenance instructions", rule: RULE.instructions },
    { doc: "electrical_cert", label: "certificate of testing and safety", rule: RULE.electrical },
  ],
  switchboard: [
    { doc: "instructions", label: "maintenance instructions", rule: RULE.instructions },
    { doc: "electrical_cert", label: "certificate of testing and safety", rule: RULE.electrical },
  ],
  air_conditioner: [
    { doc: "warranty", label: "maker's warranty", rule: RULE.warranty },
    { doc: "instructions", label: "maintenance instructions", rule: RULE.instructions },
  ],
};

/** Records for the job as a whole. `onlyIf` is the scope flag; without one it always applies. */
const JOB_DOCS = [
  { doc: "final_cert", label: "final inspection certificate", rule: RULE.finalCert },
  { doc: "termite_notice", label: "termite management durable notice", rule: RULE.termite, onlyIf: "termite_system", none: "no termite management system was installed" },
  { doc: "backflow_report", label: "backflow prevention device test report", rule: RULE.backflow, onlyIf: "backflow_device", none: "no testable backflow prevention device was installed" },
  { doc: "pool_cert", label: "pool safety certificate", rule: RULE.pool, onlyIf: "pool", none: "the job has no swimming pool or spa" },
];

/** Assets that get a dated first service in the manual, and the rule it is derived from. */
const SERVICE = { smoke_alarms: RULE.smoke };

/** Every string the build can put in front of a person. None of it says compliant. */
export const COPY = {
  pass: (asOf, person) => `O&M manual current as of ${asOf}, cited, reviewed by ${person}. Giving it to the client is the project manager's job.`,
  due: (date) => `Manual due to the client by ${date}.`,
  hold: (pm, why) => `On hold for ${pm}: ${why}. Nothing is invented to fill a gap.`,
  fail: (why) => `Do not hand over: ${why}.`,
};

const BUSINESS = ["biz:trading_name", "biz:abn", "biz:trading_address", "biz:builder_licence"];

const present = (v) => v !== undefined && String(v).trim() !== "";
const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const isLink = (v) => /^(https?:|\\\\|file:)/i.test(String(v ?? ""));
const assetIds = (f, j) => String(f[`${j}:asset_ids`] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const docKey = (j, owner, doc) => (owner ? `${j}:a:${owner}:doc:${doc}` : `${j}:doc:${doc}`);

/** Every record the job could need, asset by asset then job-wide, with whether it applies. */
function requirements(f, j) {
  const out = [];
  for (const a of assetIds(f, j)) {
    const cls = f[`${j}:a:${a}:class`];
    for (const d of ASSET_DOCS[cls] ?? []) out.push({ ...d, owner: a, key: docKey(j, a, d.doc), label: `${a} ${d.label}`, applies: true });
  }
  for (const d of JOB_DOCS) {
    const applies = !d.onlyIf || f[`${j}:scope:${d.onlyIf}`] === "yes";
    out.push({ ...d, owner: null, key: docKey(j, null, d.doc), applies });
  }
  return out;
}

function identity(f, j, reqs) {
  if (!present(f[`${j}:job_no`])) return { passed: false, reason: "identity: the job has no job number" };
  if (!present(f[`${j}:pm`])) return { passed: false, reason: `identity: job ${f[`${j}:job_no`]} names no project manager` };
  if (!present(f["biz:builder_licence"])) return { passed: false, reason: "identity: no builder licence number on record" };
  for (const r of reqs) {
    const printed = f[`${r.key}:job_no`];
    if (present(f[`${r.key}:ref`]) && present(printed) && printed !== f[`${j}:job_no`])
      return { passed: false, reason: `identity: the ${r.label} on file is for job ${printed}, not job ${f[`${j}:job_no`]}` };
  }
  return { passed: true, reason: `identity: every filed record is for job ${f[`${j}:job_no`]}` };
}

function tickets(f, j, now) {
  const lapsed = (d) => !present(d) || new Date(d).getTime() <= now.getTime();
  if (lapsed(f["biz:builder_licence:expires_on"]))
    return { passed: false, reason: `tickets: the builder licence ${f["biz:builder_licence"]} is not current (${f["biz:builder_licence:expires_on"]?.slice(0, 10) ?? "no expiry on record"})` };
  for (const a of assetIds(f, j)) {
    const by = f[`${j}:a:${a}:installer`];
    if (lapsed(f[`${j}:a:${a}:installer_licence_expires_on`]))
      return { passed: false, reason: `tickets: the licence of ${by ?? "the trade"} who installed ${a} is not current` };
  }
  return { passed: true, reason: "tickets: the builder licence and every installing trade's licence are current" };
}

function applicability(f, j, reqs, ruleOf) {
  if (f[`${j}:state`] !== "QLD") return { passed: false, reason: `applicability: no handover rules loaded for ${f[`${j}:state`] ?? "an unknown state"}` };
  for (const a of assetIds(f, j)) {
    if (!ASSET_DOCS[f[`${j}:a:${a}:class`]]) return { passed: false, reason: `applicability: no handover rule for ${a} (${f[`${j}:a:${a}:class`] ?? "no class"})` };
  }
  for (const r of reqs) if (!ruleOf(r.rule)) return { passed: false, reason: `applicability: rule ${r.rule} is not loaded` };
  const applies = reqs.filter((r) => r.applies);
  const notApplicable = reqs
    .filter((r) => !r.applies)
    .map((r) => {
      const rule = ruleOf(r.rule);
      return { req: r, rule, reason: `The ${r.label} does not apply because ${r.none} on job ${f[`${j}:job_no`]} (${rule.id} ${rule.version}).` };
    });
  return { passed: true, reason: `applicability: ${applies.length} records apply; written no for ${notApplicable.map((n) => n.req.label).join(", ") || "none"}`, applies, notApplicable };
}

function completeness(f, applies) {
  const missing = applies.filter((r) => !present(f[`${r.key}:ref`]));
  if (missing.length > 0) return { passed: false, missing, reason: `completeness: ${missing.length} missing before handover: ${missing.map((r) => r.label).join("; ")}` };
  return { passed: true, reason: `completeness: all ${applies.length} applicable records are filed` };
}

function fieldReuse(f, j, applies) {
  for (const r of applies) {
    const addr = f[`${r.key}:site_address`];
    if (present(addr) && norm(addr) !== norm(f[`${j}:site_address`]))
      return { passed: false, reason: `field reuse: the ${r.label} carries site address ${addr}, the job carries ${f[`${j}:site_address`]}` };
    const lic = f[`${r.key}:builder_licence`];
    if (present(lic) && lic.replace(/\s/g, "") !== String(f["biz:builder_licence"]).replace(/\s/g, ""))
      return { passed: false, reason: `field reuse: the ${r.label} carries builder licence ${lic}, the record carries ${f["biz:builder_licence"]}; two licence numbers on one job` };
  }
  return { passed: true, reason: "field reuse: one site address and one builder licence number, and every artefact references the graph" };
}

/** Fact keys for the job's artefacts. References only: their text is derived on read. */
function artefactRefs(f, j, applies) {
  const job = [`${j}:job_no`, `${j}:client`, `${j}:site_address`, `${j}:practical_completion_on`, `${j}:pm`];
  const assets = assetIds(f, j).flatMap((a) =>
    ["label", "make_model", "serial", "location", "installed_on", "warranty_years", "installer", "installer_licence"].map((k) => `${j}:a:${a}:${k}`).filter((k) => present(f[k])),
  );
  const records = applies.flatMap((r) => [`${r.key}:title`, `${r.key}:number`, `${r.key}:issued_on`].filter((k) => present(f[k]) && !isLink(f[k])));
  return {
    "asset-schedule": [...BUSINESS, ...job, ...assets],
    "record-register": [...BUSINESS, ...job, ...records],
    "job-note": [...BUSINESS, ...job],
    // The manual carries the details themselves, never a link into the builder's own drive.
    handover: [...BUSINESS, ...job, ...assets, ...records],
  };
}

async function derive(ports, packId, name, refs) {
  const id = `${packId}:${name}`;
  // Derived once; later runs re-render the same artefact from the graph.
  if ((await ports.renderArtefact(id)) === null) await ports.deriveArtefact({ id, packId, refs });
  return id;
}

const ruleLookup = (rules, now) => (id) =>
  rules
    .filter((r) => r.id === id && r.effectiveFrom <= now.toISOString())
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .pop();

const addYears = (iso, n) => {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * One run over the jobs it is handed.
 *
 * config.jobs:       [{ packId, jobId }] read by id from the job system.
 * config.releases:   { [packId]: { person } } the project manager's release, if any.
 * config.exceptions(jobId): an open exception with a named owner, or null.
 *
 * @param {import("@aipathway/conformance").PackPorts} ports
 */
export async function build(ports, config = {}) {
  await ports.declareHardStep(
    "the binding layer: each job's assets and records bound in one graph, every manual artefact derived from it, and re-derived when a fact or a rule moves",
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
    const pm = facts[`${j}:pm`] ?? "the project manager";

    // 0. Low-confidence values read off a scan are Yellow, field by field.
    for (const [k, c] of Object.entries(facts)) {
      if (k.startsWith(`${j}:`) && k.endsWith("#confidence") && Number(c) < CONFIDENCE_GATE) await ports.markYellow(packId, k.slice(0, -"#confidence".length));
    }

    const stop = async (check, r) => {
      await ports.runCheck(packId, check, false, r.reason);
      await ports.publishCopy([check === "completeness" ? COPY.hold(pm, r.reason) : COPY.fail(r.reason)]);
      results.push({ packId, queue: "fail", failedCheck: check, reason: r.reason, missing: r.missing?.map((m) => m.label) ?? [], owner: pm });
    };

    const reqs = requirements(facts, j);

    const id = identity(facts, j, reqs);
    if (!id.passed) { await stop("identity", id); continue; }
    await ports.runCheck(packId, "identity", true, id.reason);

    const tk = tickets(facts, j, now);
    if (!tk.passed) { await stop("tickets", tk); continue; }
    await ports.runCheck(packId, "tickets", true, tk.reason);

    const ap = applicability(facts, j, reqs, ruleOf);
    if (!ap.passed) { await stop("applicability", ap); continue; }
    for (const n of ap.notApplicable) await ports.declareNotApplicable(j, n.reason);
    await ports.runCheck(packId, "applicability", true, ap.reason);

    const cp = completeness(facts, ap.applies);
    if (!cp.passed) { await stop("completeness", cp); continue; }
    await ports.runCheck(packId, "completeness", true, cp.reason);

    const fr = fieldReuse(facts, j, ap.applies);
    if (!fr.passed) { await stop("field_reuse", fr); continue; }
    const refs = artefactRefs(facts, j, ap.applies);
    const artefacts = {};
    for (const name of Object.keys(refs)) artefacts[name] = await derive(ports, packId, name, refs[name]);
    await ports.runCheck(packId, "field_reuse", true, fr.reason);

    // 6. Every clause cites its rule; dates are derived from the dated rules.
    const pc = facts[`${j}:practical_completion_on`];
    const due = present(pc) ? await ports.dueDateFor(RULE.manualDue, pc) : null;
    const clauses = [];
    for (const r of ap.applies) {
      const rule = ruleOf(r.rule);
      const num = facts[`${r.key}:number`];
      clauses.push({ text: `${r.label}: filed${present(num) ? `, number ${num}` : ""} (${rule.id} ${rule.version}).`, sourceRuleId: r.rule });
    }
    for (const n of ap.notApplicable) clauses.push({ text: n.reason, sourceRuleId: n.rule.id });
    for (const a of assetIds(facts, j)) {
      const years = Number(facts[`${j}:a:${a}:warranty_years`]);
      const from = facts[`${j}:a:${a}:installed_on`];
      if (years > 0 && present(from)) {
        const w = ruleOf(RULE.warranty);
        clauses.push({ text: `${a} maker's warranty runs to ${addYears(from, years)} (${w.id} ${w.version}).`, sourceRuleId: RULE.warranty });
      }
      const svc = SERVICE[facts[`${j}:a:${a}:class`]];
      if (svc && present(from)) {
        const s = await ports.dueDateFor(svc, from);
        if (s) clauses.push({ text: `${a} first service due ${s.date.slice(0, 10)} (${svc} ${s.version}).`, sourceRuleId: svc });
      }
    }
    if (due) clauses.push({ text: `${COPY.due(due.date.slice(0, 10))} (${RULE.manualDue} ${due.version})`, sourceRuleId: RULE.manualDue });
    for (const c of clauses) await ports.addClause(packId, c);
    const asOf = now.toISOString();
    await ports.setAsOf(packId, asOf);
    if (!due) { await stop("source_and_as_of", { reason: "source and as-of: no practical completion date or no dated rule for when the manual is due" }); continue; }
    await ports.runCheck(packId, "source_and_as_of", true, `source and as-of: ${clauses.length} clauses cited, as of ${asOf}`);

    // 7. The project manager releases this version. The build never does.
    const release = config.releases?.[packId];
    if (!release) {
      results.push({ packId, queue: "awaiting_release", manualDue: due.date, owner: pm });
      continue;
    }
    const accepted = `${await ports.renderArtefact(artefacts.handover)} | as of ${asOf}`;
    const ok = await ports.acceptVersion(packId, { person: release.person, accepted });
    if (!ok) {
      results.push({ packId, queue: "awaiting_release", refused: "no named person" });
      continue;
    }
    await ports.publishCopy([COPY.pass(asOf.slice(0, 10), release.person), COPY.due(due.date.slice(0, 10))]);

    // 8. One self-contained manual for the job, filed for the project manager to give.
    const out = await ports.handover(packId);
    results.push({ packId, queue: out.ok ? "pass" : "awaiting_release", handedOver: out.ok, manualDue: due.date });
  }

  // The run log keeps ids and states, never serials, addresses or client details.
  await ports.retain("run-log", JSON.stringify(results.map((r) => ({ packId: r.packId, queue: r.queue ?? null, failedCheck: r.failedCheck ?? null, missing: r.missing?.length ?? 0 }))));
  return results;
}

/** Hand over a job's manual on request. The world refuses a failed one; so does this. */
export async function handover(ports, packId) {
  return ports.handover(packId);
}

build.handover = handover;

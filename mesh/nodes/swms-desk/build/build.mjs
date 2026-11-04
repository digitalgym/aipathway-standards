/**
 * SWMS Desk: the pre-start safety pack for each job, built to
 * AIP-BS-REJECTED-PACK 2026-10-03.
 * https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * The job, in the owner's words: draft each job's SWMS or risk assessment from
 * the job scope and our approved templates, and keep the job on hold until
 * every worker on it has signed.
 *
 * An original build from the standard. Nothing here is taken from any other
 * bot, app, prompt or workflow.
 *
 * Narrowed on purpose: this build never starts, stops or releases a job, and
 * never signs anything. It drafts the SWMS (or the general job risk
 * assessment) from the business's own approved templates, lists who on the
 * crew has not signed the current revision, and marks the job's pre-start
 * pack on hold with an exception to the job's supervisor. The supervisor
 * accepts the pack by name and decides when the crew starts. Workers sign
 * themselves.
 *
 * What one run does, for each job it is handed (job.created, job.updated when
 * the scope, crew or a signature changes, a daily schedule.tick before start
 * dates, or exception.closed):
 *
 *   0. Read the graph and the dated rules. Scope fields read off the job
 *      description below the confidence gate are Yellow. Nothing promotes them.
 *   1. Identity: the job read by its id has a job number, a site address and a
 *      named supervisor, and the business has an ABN and a name on record.
 *   2. Tickets: public liability and workers' compensation current; every
 *      worker on the crew has a white card on file; no licence on file expired.
 *   3. Applicability: which high risk construction work this scope involves,
 *      under WHS Regulation 2011 (Qld) s291, with a written no for each one
 *      that does not apply. No high risk work means no SWMS: the general job
 *      risk assessment covers it, and the reason is written down.
 *   4. Completeness: an approved template for every applicable item, and every
 *      worker on the crew signed the current revision. Missing is Hold.
 *   5. Field reuse: one ABN. The job system's contractor ABN must be the
 *      graph's; every artefact references the graph and never copies it.
 *   6. Source and as-of: each clause cites its rule; the pack carries a date;
 *      the on-site review date is derived from the dated rule.
 *   7. Human gate: the supervisor accepts this version by name. Never the build.
 *   8. Handover: one self-contained pre-start pack per job site, on acceptance.
 *
 * The binding layer (one graph per job, every SWMS and sign-on sheet derived
 * from it, and re-derived when a fact or a rule moves) is the hard step, and
 * it is declared.
 */

/** Below this, a scope field read off the job description is Yellow and waits for a person. */
export const CONFIDENCE_GATE = 0.85;

const RULE = {
  swms: "qld.whs-reg-2011.s299-swms",
  riskAssessment: "proc.general-risk-assessment",
  signOn: "proc.crew-sign-on",
  review: "proc.swms-site-review",
};

/**
 * The high risk construction work this build knows. Each reads one scope
 * field, and its threshold (where it has one) comes from the dated rule's own
 * text, never from code.
 */
const HRCW = [
  { key: "fall", label: "work with a risk of a person falling", field: "height_m", rule: "qld.whs-reg-2011.s291-fall", applies: (v, r) => num(v) > limit(r, "more than") },
  { key: "trench", label: "work in a trench or shaft", field: "trench_m", rule: "qld.whs-reg-2011.s291-trench", applies: (v, r) => num(v) > limit(r, "more than") },
  { key: "energised", label: "work on or near energised electrical installations", field: "energised", rule: "qld.whs-reg-2011.s291-energised", applies: (v) => yes(v) },
  { key: "asbestos", label: "work likely to disturb asbestos", field: "asbestos", rule: "qld.whs-reg-2011.s291-asbestos", applies: (v) => yes(v) },
];

/** Every string the build can put in front of a person. None of it says compliant or safe. */
export const COPY = {
  pass: (asOf, person, rev, n) =>
    `Pre-start pack current as of ${asOf}, cited, reviewed by ${person}. All ${n} workers on the crew signed revision ${rev}. When the crew starts is the supervisor's call.`,
  review: (date) => `SWMS review with the crew on site due by ${date}.`,
  hold: (owner, why) => `On hold for ${owner}: ${why}. This job's pre-start pack is not ready and the job should not start until it is cleared.`,
  fail: (why) => `Do not start or hand over: ${why}.`,
};

const BUSINESS = ["biz:trading_name", "biz:abn", "biz:trading_address"];

const num = (v) => (v === undefined || String(v).trim() === "" ? NaN : Number(v));
const yes = (v) => String(v ?? "").trim().toLowerCase() === "yes";
const present = (v) => v !== undefined && String(v).trim() !== "";
const limit = (rule, word) => Number(new RegExp(`${word} (\\d+(?:\\.\\d+)?)`).exec(rule?.text ?? "")?.[1] ?? NaN);
const crewOf = (f, j) => String(f[`${j}:crew`] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const nameOf = (f, w) => f[`w:${w}:name`] ?? w;

function identity(f, j) {
  if (!present(f[`${j}:job_no`])) return { passed: false, reason: "identity: the job carries no job number" };
  if (!present(f[`${j}:site_address`])) return { passed: false, reason: `identity: job ${f[`${j}:job_no`]} has no site address` };
  if (!present(f[`${j}:supervisor`])) return { passed: false, reason: `identity: job ${f[`${j}:job_no`]} names no supervisor to own its pre-start pack` };
  if (!present(f["biz:abn"]) || !present(f["biz:trading_name"])) return { passed: false, reason: "identity: the business has no ABN or name on record" };
  return { passed: true, reason: `identity: job ${f[`${j}:job_no`]} at ${f[`${j}:site_address`]}, supervised by ${f[`${j}:supervisor`]}` };
}

function tickets(f, j, now) {
  const lapsed = (d) => !present(d) || new Date(d).getTime() <= now.getTime();
  if (lapsed(f["biz:pl:expires_on"])) return { passed: false, reason: `tickets: public liability is not current (${f["biz:pl:expires_on"]?.slice(0, 10) ?? "no expiry on record"})` };
  if (lapsed(f["biz:wc:expires_on"])) return { passed: false, reason: `tickets: workers' compensation is not current (${f["biz:wc:expires_on"]?.slice(0, 10) ?? "no expiry on record"})` };
  const crew = crewOf(f, j);
  if (crew.length === 0) return { passed: false, reason: `tickets: no crew is assigned to job ${f[`${j}:job_no`]}` };
  for (const w of crew) {
    if (!present(f[`w:${w}:white_card`])) return { passed: false, reason: `tickets: ${nameOf(f, w)} has no white card on file` };
    if (present(f[`w:${w}:licence`]) && lapsed(f[`w:${w}:licence_expires_on`]))
      return { passed: false, reason: `tickets: ${nameOf(f, w)}'s ${f[`w:${w}:licence`]} has expired (${f[`w:${w}:licence_expires_on`]?.slice(0, 10) ?? "no expiry on record"})` };
  }
  return { passed: true, reason: `tickets: insurance current, ${crew.length} workers with white cards on file, no licence expired` };
}

function applicability(f, j, ruleOf) {
  if (f[`${j}:state`] !== "QLD") return { passed: false, reason: `applicability: no WHS rules loaded for ${f[`${j}:state`] ?? "an unknown state"}`, applies: [], notApplicable: [] };
  for (const id of [RULE.swms, RULE.riskAssessment, RULE.signOn]) if (!ruleOf(id)) return { passed: false, reason: `applicability: rule ${id} is not loaded`, applies: [], notApplicable: [] };
  const applies = [];
  const notApplicable = [];
  for (const h of HRCW) {
    const rule = ruleOf(h.rule);
    if (!rule) return { passed: false, reason: `applicability: rule ${h.rule} is not loaded`, applies, notApplicable };
    const v = f[`${j}:scope:${h.field}`];
    if (!present(v)) return { passed: false, reason: `applicability: the scope of job ${f[`${j}:job_no`]} does not say ${h.label}; nothing is assumed`, applies, notApplicable };
    if (h.applies(v, rule)) applies.push(h);
    else notApplicable.push({ h, rule, reason: `No SWMS for ${h.label}: it does not apply because the scope of job ${f[`${j}:job_no`]} records ${h.field.replace("_m", "")} ${v} (${rule.id} ${rule.version}).` });
  }
  if (applies.length === 0) {
    const r = ruleOf(RULE.riskAssessment);
    notApplicable.push({ h: null, rule: ruleOf(RULE.swms), reason: `A SWMS is not required for job ${f[`${j}:job_no`]} because its scope involves no high risk construction work; the general job risk assessment covers it (${RULE.swms}, ${r.id} ${r.version}).` });
  }
  return { passed: true, reason: `applicability: ${applies.length} high risk items apply; written no for ${notApplicable.length}`, applies, notApplicable };
}

/** Missing is Hold, not Fail: an applicable template or a worker's signature is not in the graph yet. */
function completeness(f, j, applies) {
  for (const h of applies)
    if (!present(f[`tpl:${h.key}:version`]) || !present(f[`tpl:${h.key}:steps`]))
      return { passed: false, hold: true, reason: `completeness: no approved SWMS template on file for ${h.label}; held, nothing invented` };
  if (!present(f["tpl:general:version"]) || !present(f["tpl:general:steps"]))
    return { passed: false, hold: true, reason: "completeness: no approved general job risk assessment template on file; held, nothing invented" };
  const rev = f[`${j}:swms_rev`];
  if (!present(rev)) return { passed: false, hold: true, reason: `completeness: job ${f[`${j}:job_no`]} has no SWMS revision issued for signing` };
  const unsigned = crewOf(f, j).filter((w) => f[`${j}:signed:${w}`] !== rev);
  if (unsigned.length > 0)
    return { passed: false, hold: true, unsigned, reason: `completeness: not yet signed revision ${rev}: ${unsigned.map((w) => nameOf(f, w)).join(", ")}` };
  return { passed: true, reason: `completeness: templates on file for every applicable item, and all ${crewOf(f, j).length} workers signed revision ${rev}` };
}

function fieldReuse(f, j) {
  const onJob = f[`${j}:contractor_abn`];
  if (present(onJob) && onJob.replace(/\s/g, "") !== String(f["biz:abn"]).replace(/\s/g, ""))
    return { passed: false, reason: `field reuse: the job carries ABN ${onJob}, the record carries ${f["biz:abn"]}; two ABNs on one pack` };
  return { passed: true, reason: "field reuse: one ABN, and every artefact references the graph" };
}

/** Fact keys for the job's artefacts. References only: their text is derived on read. */
function artefactRefs(f, j, applies) {
  const job = [`${j}:job_no`, `${j}:customer`, `${j}:site_address`, `${j}:supervisor`, `${j}:start_on`, `${j}:swms_rev`];
  const crew = crewOf(f, j).flatMap((w) => [`w:${w}:name`, `w:${w}:white_card`]);
  const signed = crewOf(f, j).flatMap((w) => [`w:${w}:name`, `${j}:signed:${w}`]);
  const out = {};
  for (const h of applies) out[`swms-${h.key}`] = [...BUSINESS, ...job, `tpl:${h.key}:version`, `tpl:${h.key}:steps`, ...crew];
  out["risk-assessment"] = [...BUSINESS, ...job, "tpl:general:version", "tpl:general:steps"];
  out["sign-on"] = [...BUSINESS, ...job, ...signed];
  // The handover carries the steps and signatures themselves, never a link into the business's own drive.
  out.handover = [...BUSINESS, ...job, ...applies.flatMap((h) => [`tpl:${h.key}:version`, `tpl:${h.key}:steps`]), "tpl:general:version", "tpl:general:steps", ...signed];
  return out;
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

/** Is every worker on the crew signed onto the current revision, read fresh from the graph? */
function allSigned(f, j) {
  const rev = f[`${j}:swms_rev`];
  const crew = crewOf(f, j);
  return present(rev) && crew.length > 0 && crew.every((w) => f[`${j}:signed:${w}`] === rev);
}

/**
 * One run over the jobs it is handed.
 *
 * config.jobs:       [{ packId, jobId }] read by id from the job system.
 * config.releases:   { [packId]: { person } } the supervisor's acceptance, if any.
 * config.exceptions(jobId): an open exception with a named owner, or null.
 *
 * @param {import("@aipathway/conformance").PackPorts} ports
 */
export async function build(ports, config = {}) {
  await ports.declareHardStep(
    "the binding layer: each job's SWMS, risk assessment and sign-on sheet bound to one graph, every artefact derived from it, and re-derived when a fact or a rule moves",
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
    const owner = facts[`${j}:supervisor`] ?? "the office";

    // Evaluate the eight in order first, so a Hold (something missing) leaves
    // the pack in Hold rather than walking it through Pass on the way.
    const id = identity(facts, j);
    const tk = id.passed ? tickets(facts, j, now) : null;
    const ap = tk?.passed ? applicability(facts, j, ruleOf) : null;
    const cp = ap?.passed ? completeness(facts, j, ap.applies) : null;

    if (cp && cp.hold) {
      await ports.publishCopy([COPY.hold(owner, cp.reason)]);
      results.push({ packId, queue: "hold", reason: cp.reason, unsigned: cp.unsigned ?? [], owner, exception: "swms.hold_missing" });
      continue;
    }

    // 0. Low-confidence scope fields are Yellow, field by field.
    for (const h of HRCW) {
      const c = facts[`${j}:scope:${h.field}#confidence`];
      if (c !== undefined && Number(c) < CONFIDENCE_GATE) await ports.markYellow(packId, `${j}:scope:${h.field}`);
    }

    const stop = async (check, r) => {
      await ports.runCheck(packId, check, false, r.reason);
      await ports.publishCopy([COPY.fail(r.reason)]);
      results.push({ packId, queue: "fail", failedCheck: check, reason: r.reason, owner, exception: `swms.${check}` });
    };

    if (!id.passed) { await stop("identity", id); continue; }
    await ports.runCheck(packId, "identity", true, id.reason);
    if (!tk.passed) { await stop("tickets", tk); continue; }
    await ports.runCheck(packId, "tickets", true, tk.reason);
    if (!ap.passed) { await stop("applicability", ap); continue; }
    for (const n of ap.notApplicable) await ports.declareNotApplicable(j, n.reason);
    await ports.runCheck(packId, "applicability", true, ap.reason);
    await ports.runCheck(packId, "completeness", true, cp.reason);

    const fr = fieldReuse(facts, j);
    if (!fr.passed) { await stop("field_reuse", fr); continue; }
    const refs = artefactRefs(facts, j, ap.applies);
    const artefacts = {};
    for (const name of Object.keys(refs)) artefacts[name] = await derive(ports, packId, name, refs[name]);
    await ports.runCheck(packId, "field_reuse", true, fr.reason);

    // 6. Every clause cites its rule; the on-site review date is derived from the dated rule.
    const review = present(facts[`${j}:start_on`]) ? await ports.dueDateFor(RULE.review, facts[`${j}:start_on`]) : null;
    const swms = ruleOf(RULE.swms);
    const ra = ruleOf(RULE.riskAssessment);
    const signOn = ruleOf(RULE.signOn);
    const clauses = [
      ...ap.applies.map((h) => ({
        text: `SWMS for ${h.label} drafted from approved template ${h.key} ${facts[`tpl:${h.key}:version`]} for job ${facts[`${j}:job_no`]} (${h.rule} ${ruleOf(h.rule).version}; ${swms.id} ${swms.version}).`,
        sourceRuleId: h.rule,
      })),
      ...ap.notApplicable.map((n) => ({ text: n.reason, sourceRuleId: n.h ? n.h.rule : RULE.swms })),
      { text: `General job risk assessment drafted from approved template ${facts["tpl:general:version"]} (${ra.id} ${ra.version}).`, sourceRuleId: RULE.riskAssessment },
      { text: `Every worker on the crew signed revision ${facts[`${j}:swms_rev`]} before start (${signOn.id} ${signOn.version}).`, sourceRuleId: RULE.signOn },
      ...(review ? [{ text: `${COPY.review(review.date.slice(0, 10))} (${RULE.review} ${review.version})`, sourceRuleId: RULE.review }] : []),
    ];
    for (const c of clauses) await ports.addClause(packId, c);
    const asOf = now.toISOString();
    await ports.setAsOf(packId, asOf);
    if (!review) { await stop("source_and_as_of", { reason: "source and as-of: no start date or no dated review rule behind the review clause" }); continue; }
    await ports.runCheck(packId, "source_and_as_of", true, `source and as-of: ${clauses.length} clauses cited, as of ${asOf}`);

    // 7. The supervisor accepts this version by name. The build never does.
    const release = config.releases?.[packId];
    if (!release) {
      results.push({ packId, queue: "awaiting_acceptance", reviewDue: review.date, owner, exception: "swms.awaiting_acceptance" });
      continue;
    }
    const accepted = `${await ports.renderArtefact(artefacts["sign-on"])} | as of ${asOf}`;
    const ok = await ports.acceptVersion(packId, { person: release.person, accepted });
    if (!ok) {
      results.push({ packId, queue: "awaiting_acceptance", refused: "no named person", owner });
      continue;
    }
    await ports.publishCopy([COPY.pass(asOf.slice(0, 10), release.person, facts[`${j}:swms_rev`], crewOf(facts, j).length), COPY.review(review.date.slice(0, 10))]);

    // 8. One self-contained pre-start pack for the job site.
    const out = await ports.handover(packId);
    results.push({ packId, queue: out.ok ? "pass" : "awaiting_acceptance", handedOver: out.ok, reviewDue: review.date });
  }

  // The run log keeps ids and states, never scope, names or template text.
  await ports.retain("run-log", JSON.stringify(results.map((r) => ({ packId: r.packId, queue: r.queue ?? null, failedCheck: r.failedCheck ?? null }))));
  return results;
}

/**
 * Hand over a job's pre-start pack on request. The world refuses a failed one
 * or one nobody accepted; this also refuses one with a worker not signed onto
 * the current revision, read fresh from the graph.
 */
export async function handover(ports, packId, jobId) {
  if (jobId !== undefined && !allSigned(await ports.readFacts(), jobId)) return { ok: false, why: "a worker on the crew has not signed the current revision" };
  return ports.handover(packId);
}

build.handover = handover;

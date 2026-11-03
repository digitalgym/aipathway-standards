/**
 * Cover Check: a contractor insurance pack, built to AIP-BS-REJECTED-PACK
 * 2026-10-03. https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * The job, in the property manager's words: before a contractor goes on a
 * managed property, hold a current certificate of insurance for them, know
 * when it runs out, and never treat a contractor as cleared with an item
 * missing.
 *
 * A reimplementation from the standard. Nothing here is taken from any other
 * bot's prompt, instructions or workflow.
 *
 * What one run does, for each contractor pack it is handed (an email.received
 * wake for one certificate, a schedule.tick renewal sweep, or exception.closed):
 *
 *   0. Read the graph and the dated rules. Mark every extracted field whose
 *      confidence is under the gate Yellow. Nothing promotes it on a score.
 *   1. Identity: ABN active, the insured named on the certificate is the
 *      contractor's legal name. Stop on failure.
 *   2. Tickets: every certificate and licence on the record is current.
 *      Expired is a stop, not a warning.
 *   3. Applicability: public liability always; workers' compensation only when
 *      the contractor employs workers; a QBCC licence only for building work.
 *      Every "does not apply" is written, with its reason and its rule.
 *   4. Completeness: every applicable obligation has a certificate with a
 *      policy number, an expiry and the filed original. Missing stops the pack.
 *   5. Field reuse: one ABN. The certificate's insured ABN must be the
 *      contractor's ABN; every artefact references the graph, never copies it.
 *   6. Source and as-of: each clause cites its rule; the pack carries a date.
 *   7. Human gate: a named person releases this version. The build never does.
 *   8. Handover: one self-contained artefact per contractor, on release only.
 *
 * The binding layer (step 5 onwards: one graph bound to the contractor, the
 * artefacts derived from it, re-derived when a fact or rule moves) is the hard
 * step, and it is declared as such.
 */

/** Below this, an extracted field is Yellow and waits for a person. */
export const CONFIDENCE_GATE = 0.8;

/** Work that needs a QBCC licence in Queensland. Everything else gets a written no. */
const BUILDING_WORK = new Set(["plumbing", "carpentry", "roofing", "tiling", "painting", "building", "fencing", "glazing"]);

/** The rules this build reads. Missing one stops the pack; nothing is assumed. */
const RULE = {
  publicLiability: "agency.public-liability-minimum",
  workcover: "qld.workcover",
  qbcc: "qld.qbcc-licence",
  renewal: "agency.coi-renewal-request",
};

/** Every string a passing pack can put in front of a person. None of it says compliant. */
export const COPY = {
  pass: (asOf, person) => `Certificates current as of ${asOf}, cited, reviewed by ${person}.`,
  yellow: (fields) => `Waiting for a person to confirm: ${fields.join(", ")}.`,
  hold: (why) => `On hold: ${why}. This contractor is not cleared to start work.`,
  fail: (why) => `Do not send: ${why}.`,
  renewal: (date) => `Renewal certificate to be requested by ${date}.`,
};

/** The extracted certificate fields, by obligation. */
const FIELDS = {
  pl: ["insurer", "policy_no", "cover_amount", "expires_on", "insured_name", "insured_abn"],
  wc: ["insurer", "policy_no", "expires_on", "insured_name", "insured_abn"],
  qbcc: ["licence_no", "class", "expires_on"],
};

const AGENCY = ["agency:trading_name", "agency:abn", "agency:trading_address"];

const isLink = (v) => /^(https?:|\\\\|file:)/i.test(String(v ?? ""));
const present = (v) => v !== undefined && String(v).trim() !== "";

/** The checks, in the standard's order. Each returns { passed, reason }. */
function identity(f, v) {
  if (!present(f[`${v}:abn`])) return { passed: false, reason: "identity: no ABN on the contractor record" };
  if (f[`${v}:abn_status`] !== "active") return { passed: false, reason: `identity: ABN ${f[`${v}:abn`]} is ${f[`${v}:abn_status`] ?? "unverified"} on the ABR` };
  const name = (s) => String(s ?? "").trim().toLowerCase();
  for (const kind of ["pl", "wc"]) {
    const insured = f[`${v}:${kind}:insured_name`];
    if (present(insured) && name(insured) !== name(f[`${v}:legal_name`]))
      return { passed: false, reason: `identity: ${kind} certificate insures "${insured}", not "${f[`${v}:legal_name`]}"` };
  }
  return { passed: true, reason: `identity: ABN active, insured name matches ${f[`${v}:legal_name`]}` };
}

function tickets(f, v, now) {
  for (const kind of ["pl", "wc", "qbcc"]) {
    const exp = f[`${v}:${kind}:expires_on`];
    if (present(exp) && new Date(exp).getTime() <= now.getTime())
      return { passed: false, reason: `tickets: ${kind} expired ${exp.slice(0, 10)}` };
  }
  return { passed: true, reason: "tickets: every certificate and licence on the record is current" };
}

/** Which obligations apply, and the written reason for each that does not. */
function applicability(f, v, rulesById) {
  const applies = ["pl"];
  const notApplicable = [];
  const state = f[`${v}:state`];
  if (state !== "QLD") return { passed: false, reason: `applicability: no rule set loaded for ${state ?? "an unknown state"}`, applies, notApplicable };
  const wc = rulesById(RULE.workcover);
  const qb = rulesById(RULE.qbcc);
  if (!wc || !qb) return { passed: false, reason: "applicability: a rule this pack needs is not loaded", applies, notApplicable };
  if (f[`${v}:has_workers`] === "yes") applies.push("wc");
  else
    notApplicable.push({
      kind: "wc",
      rule: wc,
      reason: `Workers' compensation does not apply because ${f[`${v}:legal_name`]} is a sole trader with no workers; a WorkCover Queensland policy is required for workers, not the trader themself (${wc.id} ${wc.version}).`,
    });
  const work = f[`${v}:work_type`];
  if (BUILDING_WORK.has(work)) applies.push("qbcc");
  else
    notApplicable.push({
      kind: "qbcc",
      rule: qb,
      reason: `A QBCC licence does not apply because ${work ?? "this work"} is not building work under the QBCC Act 1991 (${qb.id} ${qb.version}).`,
    });
  return { passed: true, reason: `applicability: applies ${applies.join(", ")}; written no for ${notApplicable.map((n) => n.kind).join(", ") || "none"}`, applies, notApplicable };
}

function completeness(f, v, applies, minCover) {
  for (const kind of applies) {
    const need = kind === "qbcc" ? ["licence_no", "expires_on"] : ["policy_no", "expires_on", "evidence"];
    const missing = need.filter((k) => !present(f[`${v}:${kind}:${k}`]));
    if (missing.length > 0) return { passed: false, reason: `completeness: ${kind} is missing ${missing.join(", ")}; held, nothing invented` };
  }
  const cover = Number(f[`${v}:pl:cover_amount`]);
  if (!(cover >= minCover)) return { passed: false, reason: `completeness: public liability cover ${f[`${v}:pl:cover_amount`] ?? "unknown"} is below the ${minCover} minimum` };
  return { passed: true, reason: `completeness: a current certificate for each of ${applies.join(", ")}` };
}

function fieldReuse(f, v, applies) {
  for (const kind of applies.filter((k) => k !== "qbcc")) {
    const abn = f[`${v}:${kind}:insured_abn`];
    if (present(abn) && abn.replace(/\s/g, "") !== String(f[`${v}:abn`]).replace(/\s/g, ""))
      return { passed: false, reason: `field reuse: ${kind} certificate carries ABN ${abn}, the record carries ${f[`${v}:abn`]}; two ABNs in one pack` };
  }
  return { passed: true, reason: "field reuse: one ABN, and every artefact references the graph" };
}

/** Fact keys for the pack's artefacts. References only: text is derived on read. */
function artefactRefs(f, v, applies) {
  const cert = (kind) => FIELDS[kind].map((k) => `${v}:${kind}:${k}`).filter((k) => present(f[k]) && !isLink(f[k]));
  const contractor = [`${v}:legal_name`, `${v}:abn`];
  return {
    schedule: [...contractor, ...applies.flatMap(cert), ...AGENCY],
    "renewal-request": [...AGENCY, ...contractor, `${v}:pl:expires_on`],
    "cover-sheet": [...AGENCY, ...contractor, `${v}:work_type`],
    // The handover carries the details themselves, never a link into the agency's own drive.
    handover: [...AGENCY, ...contractor, `${v}:work_type`, ...applies.flatMap(cert)],
  };
}

async function derive(ports, packId, name, refs) {
  const id = `${packId}:${name}`;
  // Derived once; on later runs the same artefact re-renders from the graph.
  if ((await ports.renderArtefact(id)) === null) await ports.deriveArtefact({ id, packId, refs });
  return id;
}

const ruleLookup = (rules, now) => (id) =>
  rules
    .filter((r) => r.id === id && r.effectiveFrom <= now.toISOString())
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .pop();

/**
 * One run over the contractor packs it is handed.
 *
 * config.packs:     [{ packId, vendorId }] read by id from the property system.
 * config.releases:  { [packId]: { person } } a named person's release, if any.
 * config.exceptions(vendorId): an open exception with a named owner, or null.
 *
 * @param {import("@aipathway/conformance").PackPorts} ports
 */
export async function build(ports, config = {}) {
  await ports.declareHardStep(
    "the binding layer: each certificate bound to the contractor's record in one graph, every artefact derived from it, and re-derived when a fact or a rule moves",
  );
  const now = ports.now();
  const facts = await ports.readFacts();
  const rules = await ports.readRules();
  const ruleOf = ruleLookup(rules, now);
  const results = [];

  for (const { packId, vendorId: v } of config.packs ?? []) {
    const open = config.exceptions?.(v);
    if (open) {
      results.push({ packId, skipped: `exception open, owned by ${open.owner}` });
      continue;
    }

    // 0. Low-confidence extraction is Yellow, field by field.
    for (const kind of Object.keys(FIELDS))
      for (const field of FIELDS[kind]) {
        const key = `${v}:${kind}:${field}`;
        const c = facts[`${key}#confidence`];
        if (c !== undefined && Number(c) < CONFIDENCE_GATE) await ports.markYellow(packId, key);
      }

    const stop = async (check, r) => {
      await ports.runCheck(packId, check, false, r.reason);
      await ports.publishCopy([check === "completeness" || check === "applicability" ? COPY.hold(r.reason) : COPY.fail(r.reason)]);
      results.push({ packId, queue: "fail", failedCheck: check, reason: r.reason });
    };

    // 1 and 2.
    const id = identity(facts, v);
    if (!id.passed) { await stop("identity", id); continue; }
    await ports.runCheck(packId, "identity", true, id.reason);
    const tk = tickets(facts, v, now);
    if (!tk.passed) { await stop("tickets", tk); continue; }
    await ports.runCheck(packId, "tickets", true, tk.reason);

    // 3.
    const ap = applicability(facts, v, ruleOf);
    if (!ap.passed) { await stop("applicability", ap); continue; }
    for (const n of ap.notApplicable) await ports.declareNotApplicable(v, n.reason);
    await ports.runCheck(packId, "applicability", true, ap.reason);

    // 4.
    const plRule = ruleOf(RULE.publicLiability);
    const minCover = Number(/minimum (\d+)/.exec(plRule?.text ?? "")?.[1] ?? NaN);
    const cp = plRule ? completeness(facts, v, ap.applies, minCover) : { passed: false, reason: "completeness: no public liability rule loaded" };
    if (!cp.passed) { await stop("completeness", cp); continue; }
    await ports.runCheck(packId, "completeness", true, cp.reason);

    // 5. One ABN, and the artefacts reference the graph.
    const fr = fieldReuse(facts, v, ap.applies);
    if (!fr.passed) { await stop("field_reuse", fr); continue; }
    const refs = artefactRefs(facts, v, ap.applies);
    const artefacts = {};
    for (const name of Object.keys(refs)) artefacts[name] = await derive(ports, packId, name, refs[name]);
    await ports.runCheck(packId, "field_reuse", true, fr.reason);

    // 6. Every clause cites its rule; the renewal date is derived from the dated rule.
    const renewal = await ports.dueDateFor(RULE.renewal, facts[`${v}:pl:expires_on`]);
    const clauses = [
      { text: `Public liability with ${facts[`${v}:pl:insurer`]}, policy ${facts[`${v}:pl:policy_no`]}, current to ${facts[`${v}:pl:expires_on`].slice(0, 10)}.`, sourceRuleId: RULE.publicLiability },
      ...(ap.applies.includes("wc") ? [{ text: `Workers' compensation policy ${facts[`${v}:wc:policy_no`]}, current to ${facts[`${v}:wc:expires_on`].slice(0, 10)}.`, sourceRuleId: RULE.workcover }] : []),
      ...(ap.applies.includes("qbcc") ? [{ text: `QBCC licence ${facts[`${v}:qbcc:licence_no`]}, current to ${facts[`${v}:qbcc:expires_on`].slice(0, 10)}.`, sourceRuleId: RULE.qbcc }] : []),
      ...ap.notApplicable.map((n) => ({ text: n.reason, sourceRuleId: n.rule.id })),
      ...(renewal ? [{ text: `${COPY.renewal(renewal.date.slice(0, 10))} (${RULE.renewal} ${renewal.version})`, sourceRuleId: RULE.renewal }] : []),
    ];
    for (const c of clauses) await ports.addClause(packId, c);
    const asOf = now.toISOString();
    await ports.setAsOf(packId, asOf);
    const cited = renewal !== null && clauses.every((c) => present(c.sourceRuleId));
    if (!cited) { await stop("source_and_as_of", { reason: "source and as-of: a clause has no rule behind it" }); continue; }
    await ports.runCheck(packId, "source_and_as_of", true, `source and as-of: ${clauses.length} clauses cited, as of ${asOf}`);

    // 7. A named person releases this version. The build never does.
    const release = config.releases?.[packId];
    if (!release) {
      results.push({ packId, queue: "awaiting_release", renewalDue: renewal.date });
      continue;
    }
    const accepted = `${await ports.renderArtefact(artefacts.schedule)} | as of ${asOf}`;
    const ok = await ports.acceptVersion(packId, { person: release.person, accepted });
    if (!ok) {
      results.push({ packId, queue: "awaiting_release", refused: "no named person" });
      continue;
    }
    // The acceptance is the gate record (person, time, content). No further
    // check runs after it: a re-run check would re-derive the queue and undo it.
    await ports.publishCopy([COPY.pass(asOf.slice(0, 10), release.person), COPY.renewal(renewal.date.slice(0, 10))]);

    // 8. One self-contained artefact.
    const out = await ports.handover(packId);
    results.push({ packId, queue: out.ok ? "pass" : "awaiting_release", handedOver: out.ok, renewalDue: renewal.date });
  }

  // The run log keeps ids and states, never certificate content.
  await ports.retain("run-log", JSON.stringify(results.map((r) => ({ packId: r.packId, queue: r.queue ?? null, failedCheck: r.failedCheck ?? null }))));
  return results;
}

/** Hand over a pack on request. The world refuses a failed pack; so does this. */
export async function handover(ports, packId) {
  return ports.handover(packId);
}

build.handover = handover;

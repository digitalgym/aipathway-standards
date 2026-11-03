/**
 * Vendor Pack: keep each vendor's compliance papers current, built to
 * AIP-BS-REJECTED-PACK 2026-10-03.
 * https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * A port of "Monitor vendor compliance documents and expiries with Google
 * Drive, OpenAI, Sheets, Gmail, and Slack" by Javed Iqbal
 * (https://n8n.io/workflows/20324), reimplemented from its public listing and
 * the standard, to Australian rules. Nothing here is taken from the original's
 * prompt, instructions or workflow. It raises exceptions on the register
 * rather than sending mail or chat messages.
 *
 * The job. A vendor's licence, insurance certificates and workers'
 * compensation policy land in the document store. Extraction (done upstream,
 * by whatever model reads the PDF) writes each field onto the graph with its
 * confidence. Every run, Vendor Pack reads the graph by id, marks every
 * low-confidence field Yellow for a person, runs the eight checks in order,
 * stops at the first failure, derives the renewal follow-up date from the
 * dated rule, and hands over a pack only after a named person accepted that
 * exact version.
 *
 * The graph (one fact, one place). Keys on the record:
 *
 *   pack.<packId>.vendor            the vendor id the pack belongs to
 *   pack.<packId>.handover_to       who asked for the pack (a builder, an insurer)
 *   vendor.<id>.abn | abn_status | legal_name | trading_address | state
 *   vendor.<id>.work_type | workers | docs | exception_owner | exception_open
 *   doc.<docId>.class | holder_name | abn | number | expires_on | file
 *   doc.<docId>.<field>.conf        extraction confidence, 0..1, when a model read it
 *   release.<packId>.person | accepted   a named person's release of one version
 *
 * Every effect goes through the ports. The run keeps nothing between runs:
 * due dates are re-derived from the rule in force each time.
 */

/** A field the model read below this confidence waits for a person. */
export const CONFIDENCE_GATE = 0.9;

/** The fields on a document that matter to the pack. */
const DOC_FIELDS = ["class", "holder_name", "abn", "number", "expires_on"];

/** The step this build treats as the hard one. Check 12. */
export const HARD_STEP =
  "The binding layer: one graph of vendor facts that every artefact reads, dated rules that re-derive every due date, and a named person on the gate before any pack leaves. It is a scoped build on the live document store, not a product.";

/** Building and plumbing trades that need a QBCC contractor licence in Queensland. */
const LICENSED_WORK = new Set(["plumbing", "electrical", "carpentry", "building", "roofing", "plastering", "tiling", "concreting", "air conditioning"]);

/**
 * The obligation graph: what can apply to a vendor, the trigger, and the
 * written reason it does not apply. The citation for a clause is the dated
 * rule itself, read from the rules port.
 */
export const OBLIGATIONS = [
  {
    id: "contractor_licence",
    label: "contractor licence",
    applies: (v) => v.state === "QLD" && LICENSED_WORK.has(v.work_type),
    whyNot: (v) =>
      `Contractor licence does not apply because "${v.work_type}" in ${v.state} is not building work that needs a QBCC licence (Queensland Building and Construction Commission Act 1991 (Qld), s 42).`,
  },
  {
    id: "public_liability",
    label: "public liability certificate",
    applies: () => true,
    whyNot: () => "",
  },
  {
    id: "workers_comp",
    label: "workers' compensation policy",
    applies: (v) => Number(v.workers) > 0,
    whyNot: (v) =>
      `Workers' compensation does not apply because the vendor record shows ${Number(v.workers) || 0} workers: a sole trader with no employees is not an employer that must insure (Workers' Compensation and Rehabilitation Act 2003 (Qld), s 48).`,
  },
];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const day = (iso) => String(iso).slice(0, 10);

/** A short, stable digest of every fact the pack is built from. What a person accepts. */
export function versionOf(facts, vendorId) {
  const v = facts[`vendor.${vendorId}.docs`] ?? "";
  const docIds = v.split(",").map((s) => s.trim()).filter(Boolean);
  const prefixes = [`vendor.${vendorId}.`, ...docIds.map((d) => `doc.${d}.`)];
  const keys = Object.keys(facts)
    .filter((k) => prefixes.some((p) => k.startsWith(p)))
    .filter((k) => !k.endsWith(".exception_open"))
    .sort();
  let h = 0x811c9dc5;
  for (const k of keys) {
    for (const ch of `${k}=${facts[k]};`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return `${vendorId}@${h.toString(16).padStart(8, "0")}`;
}

/** Read one vendor and its documents off the graph, by id. */
function readVendor(facts, vendorId) {
  const f = (k) => facts[`vendor.${vendorId}.${k}`];
  const docIds = (f("docs") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const docs = docIds.map((id) => {
    const d = { id };
    for (const field of [...DOC_FIELDS, "file"]) d[field] = facts[`doc.${id}.${field}`];
    d.lowConfidence = DOC_FIELDS.filter((field) => {
      const c = facts[`doc.${id}.${field}.conf`];
      return c !== undefined && !(Number(c) >= CONFIDENCE_GATE);
    });
    return d;
  });
  return {
    id: vendorId,
    abn: f("abn"),
    abn_status: f("abn_status"),
    legal_name: f("legal_name"),
    trading_address: f("trading_address"),
    state: f("state"),
    work_type: f("work_type"),
    workers: f("workers"),
    owner: f("exception_owner"),
    exceptionOpen: f("exception_open") === "true",
    docs,
  };
}

/** The artefacts a pack carries. Refs only: text derives from the graph when read. */
function artefactsFor(packId, v) {
  const vendorRefs = [`vendor.${v.id}.legal_name`, `vendor.${v.id}.abn`, `vendor.${v.id}.trading_address`];
  const docRefs = v.docs.flatMap((d) => [`doc.${d.id}.class`, `doc.${d.id}.number`, `doc.${d.id}.expires_on`]);
  return [
    { id: `${packId}.register`, refs: [...vendorRefs, ...v.docs.flatMap((d) => [`doc.${d.id}.class`, `doc.${d.id}.expires_on`])] },
    { id: `${packId}.cover`, refs: [`vendor.${v.id}.legal_name`, `vendor.${v.id}.trading_address`, `vendor.${v.id}.state`] },
    // The one artefact a counterparty receives. The document fields are inside
    // it; the internal file links are not, so nothing needs an insider to open.
    { id: `${packId}.handover`, refs: [...vendorRefs, ...docRefs, `release.${packId}.person`] },
  ];
}

/** Every string a user sees, per outcome. Says current, cited, reviewed, as-of. Never more. */
export function copyFor(outcome, ctx) {
  const asOf = day(ctx.asOf);
  switch (outcome) {
    case "pass":
      return [
        `${ctx.name}: current as of ${asOf}. Every applicable document is on file, cited to its rule and reviewed by ${ctx.person}.`,
        `Next renewal follow-up: ${ctx.nextDue ?? "none due"}.`,
        "This pack records what was on file and who reviewed it. It is not legal advice.",
      ];
    case "yellow":
      return [`${ctx.name}: waiting for a person to confirm ${ctx.fields.join(", ")} (read at low confidence). Not ready to send.`];
    case "awaiting":
      return [`${ctx.name}: checks held as of ${asOf}. Waiting for a named person to accept this version before it can be sent.`];
    case "hold":
      return [`${ctx.name}: on hold as of ${asOf}. Missing: ${ctx.reason}. Not ready to send.`];
    default:
      return [`${ctx.name}: stopped as of ${asOf}. ${ctx.reason}. Do not send.`];
  }
}

/**
 * The eight checks, in order. Returns the first failure, or null.
 * Each check is recorded on the pack through the gate port as it runs.
 */
async function runEightChecks(ports, packId, v, rules, now) {
  const nowIso = now.toISOString();
  const gate = async (name, passed, reason) => {
    await ports.runCheck(packId, name, passed, reason);
    return passed ? null : { check: name, reason };
  };

  // 1. Identity: ABN active, the name on every document is the entity's.
  const badName = v.docs.find((d) => d.holder_name && norm(d.holder_name) !== norm(v.legal_name));
  if (v.abn_status !== "active" || !v.abn || !v.legal_name)
    return gate("identity", false, `fail: ABN ${v.abn ?? "missing"} is ${v.abn_status ?? "unverified"}`);
  if (badName) return gate("identity", false, `fail: ${badName.class ?? badName.id} is in the name "${badName.holder_name}", not ${v.legal_name}`);
  await gate("identity", true, `ABN ${v.abn} active; every document names ${v.legal_name}`);

  // 2. Tickets: every document current. Expired is a queue, not a warning.
  const expired = v.docs.find((d) => !d.expires_on || d.expires_on <= nowIso);
  if (expired) return gate("tickets", false, `fail: ${expired.class ?? expired.id} ${expired.expires_on ? `expired ${day(expired.expires_on)}` : "has no expiry on file"}`);
  await gate("tickets", true, `every document current at ${day(nowIso)}`);

  // 3. Applicability: what applies, and a written no for what does not.
  if (!v.state || !v.work_type) return gate("applicability", false, "hold: work type or state missing from the vendor record");
  const applies = OBLIGATIONS.filter((o) => o.applies(v));
  for (const o of OBLIGATIONS.filter((o) => !o.applies(v))) await ports.declareNotApplicable(v.id, o.whyNot(v));
  await gate("applicability", true, `applies: ${applies.map((o) => o.id).join(", ")}`);

  // 4. Artefact completeness: every applicable obligation has its document.
  const missing = applies.filter((o) => !v.docs.some((d) => d.class === o.id));
  if (missing.length) return gate("completeness", false, `hold: missing ${missing.map((o) => o.label).join(", ")}`);
  await gate("completeness", true, "every applicable obligation has a document");

  // 5. Field reuse: one ABN in the pack.
  const otherAbn = v.docs.find((d) => d.abn && norm(d.abn) !== norm(v.abn));
  if (otherAbn) return gate("field_reuse", false, `fail: ${otherAbn.class ?? otherAbn.id} carries ABN ${otherAbn.abn}, the vendor is ${v.abn}`);
  await gate("field_reuse", true, `one ABN (${v.abn}) across the pack`);

  // 6. Source and as-of: each clause cites the rule in force; due dates derive.
  const clauses = [];
  for (const o of applies) {
    const doc = v.docs.find((d) => d.class === o.id);
    const due = await ports.dueDateFor(o.id, doc.expires_on);
    const rule = rules.filter((r) => r.id === o.id && r.version === due?.version)[0];
    if (!due || !rule) return gate("source_as_of", false, `fail: no rule in force for ${o.id}`);
    clauses.push({
      text: `${o.label} ${doc.number ?? ""} expires ${day(doc.expires_on)}; renewal follow-up due ${day(due.date)} under ${o.id} ${due.version} (from ${day(rule.effectiveFrom)}): ${rule.text}`,
      sourceRuleId: o.id,
      due: day(due.date),
    });
  }
  for (const c of clauses) await ports.addClause(packId, { text: c.text, sourceRuleId: c.sourceRuleId });
  await ports.setAsOf(packId, nowIso);
  await gate("source_as_of", true, `${clauses.length} clause(s) cited; as of ${nowIso}`);
  return { ok: true, nextDue: clauses.map((c) => c.due).sort()[0] };
}

/**
 * @param {import("@aipathway/conformance").PackPorts} ports
 */
export async function build(ports) {
  await ports.declareHardStep(HARD_STEP);
  const now = await ports.now();
  const facts = await ports.readFacts();
  const rules = await ports.readRules();

  // schedule.tick: list the packs on the record, then work each by its id.
  const packIds = Object.keys(facts)
    .map((k) => /^pack\.([^.]+)\.vendor$/.exec(k)?.[1])
    .filter(Boolean)
    .sort();

  const tally = { packs: 0, pass: 0, yellow: 0, awaiting: 0, hold: 0, fail: 0, halted: 0 };
  for (const packId of packIds) {
    const vendorId = facts[`pack.${packId}.vendor`];
    const v = readVendor(facts, vendorId);
    tally.packs += 1;

    // An open exception with a named owner stops this pack. Its owner closes it.
    if (v.exceptionOpen) {
      tally.halted += 1;
      continue;
    }

    // Open artefacts reference the graph. Derive once; re-read every run.
    for (const a of artefactsFor(packId, v)) {
      if ((await ports.renderArtefact(a.id)) === null) await ports.deriveArtefact({ id: a.id, packId, refs: a.refs });
    }

    // Yellow first: a field the model was unsure of is marked before any check
    // runs, so no passing check can promote the pack past it.
    const yellow = v.docs.flatMap((d) => d.lowConfidence.map((f) => `${d.id}.${f}`));
    for (const field of yellow) await ports.markYellow(packId, field);

    const result = await runEightChecks(ports, packId, v, rules, now);
    const ctx = { name: v.legal_name ?? vendorId, asOf: now.toISOString(), fields: yellow };

    if (!result.ok) {
      const outcome = result.reason.startsWith("hold:") ? "hold" : "fail";
      tally[outcome] += 1;
      await ports.publishCopy(copyFor(outcome, { ...ctx, reason: result.reason.replace(/^(hold|fail): /, "") }));
      // A handover asked for on a stopped pack is put to the gate, which refuses it.
      if (facts[`pack.${packId}.handover_to`]) await ports.handover(packId);
      continue;
    }

    // 7. The named human gate. Only a release naming a person, for this exact
    // version, moves the pack. A changed fact means a new version to accept.
    const person = facts[`release.${packId}.person`]?.trim();
    const accepted = facts[`release.${packId}.accepted`]?.trim();
    const version = versionOf(facts, vendorId);
    if (!person || accepted !== version) {
      const outcome = yellow.length ? "yellow" : "awaiting";
      tally[outcome] += 1;
      await ports.publishCopy(copyFor(outcome, ctx));
      continue;
    }
    const ok = await ports.acceptVersion(packId, { person, accepted: version });
    await ports.runCheck(packId, "human_gate", ok, ok ? `accepted ${version} by ${person}` : "fail: release refused");
    if (!ok) {
      tally.fail += 1;
      continue;
    }

    // 8. Handover: one pack per vendor, to whoever asked for it.
    if (facts[`pack.${packId}.handover_to`]) {
      const out = await ports.handover(packId);
      await ports.runCheck(packId, "handover", out.ok, out.ok ? `handed to ${facts[`pack.${packId}.handover_to`]}` : `fail: ${out.why}`);
    }
    tally.pass += 1;
    await ports.publishCopy(copyFor("pass", { ...ctx, person, nextDue: result.nextDue }));
  }

  // The only thing kept from a run: counts. No pack content is retained.
  await ports.retain("run_tally", JSON.stringify(tally));
}

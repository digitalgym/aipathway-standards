/**
 * Sub Pay Check: the subcontractor payment pack, built to AIP-BS-REJECTED-PACK
 * 2026-10-03. https://aipathway.com.au/explore-ai/rejected-pack-build-standard
 *
 * The job, in the owner's words: before a subbie's payment claim is approved
 * for payment, check the paperwork that has to be held for it is there and
 * current, file each piece against the bill, and hold the payment for a named
 * person. Nothing here pays anybody, and nothing here says "compliant".
 *
 * What one run does, every time it is woken with a bill_id (bill.received,
 * email.received with an attachment for that bill, schedule.tick, or
 * exception.closed when a named person releases or fixes the pack):
 *
 *   0. Read the graph fresh. If an exception is open on the bill, stop.
 *   1. Identity: ABN active, legal name matches the licence holder.
 *   2. Tickets: every licence, insurance and cover held is current today.
 *   3. Applicability: which obligations apply to this work in this state, and a
 *      written "does not apply because" for each that does not.
 *   4. Completeness: every applicable obligation has a document on file.
 *      Missing is Hold, not Fail: the pack waits for the subbie.
 *   5. Field reuse: the ABN on every document is the one ABN in the graph.
 *   6. Source and as-of: a dated rule in force for every obligation, cited on
 *      its clause, and an as-of on the pack.
 *   7. Human gate: a named person accepts this version. No name, no move.
 *   8. Handover: one pack per bill, released for a person to approve payment.
 *
 * Stop at the first failure. A claim that passes check four and fails check one
 * is how a builder pays a subbie on a cancelled ABN.
 *
 * Every effect goes through the ports. Artefacts hold references to facts, never
 * copies, so a changed address re-derives everywhere.
 */

/** The step this build treats as the binding layer. Check 12. */
export const HARD_STEP =
  "The binding layer: one graph of the subbie's facts (ABN, legal name, address, licence, insurance, cover) that every filed document and clause reads by reference, re-derived when a fact, a ticket or a dated rule moves, with a named person on the gate before any payment is approved.";

/** Below this, an extracted field is Yellow and waits for a person. */
export const CONFIDENCE_GATE = 0.9;

/**
 * The obligations a payment pack is checked against. Each one names the dated
 * rule that cites it (rule id = obligation id) and, where it is a ticket, the
 * graph key that holds its expiry. Applicability is computed, then written.
 */
export const OBLIGATIONS = [
  {
    id: "payment_claim",
    label: "Payment claim",
    applies: () => ({ applies: true }),
  },
  {
    id: "qbcc_licence",
    label: "QBCC contractor licence",
    ticket: "qbcc",
    applies: (s) =>
      s.state === "QLD"
        ? { applies: true }
        : { applies: false, why: `The work is in ${s.state}. A QBCC licence is a Queensland requirement (Queensland Building and Construction Commission Act 1991 (Qld) s 42) and does not cover or bind work outside Queensland.` },
  },
  {
    id: "nsw_licence",
    label: "NSW contractor licence",
    ticket: "nswlic",
    applies: (s) =>
      s.state === "NSW"
        ? { applies: true }
        : { applies: false, why: `The work is in ${s.state}. A NSW contractor licence is required for residential building work in New South Wales (Home Building Act 1989 (NSW) s 4) and is not the licence that applies here.` },
  },
  {
    id: "public_liability",
    label: "Public liability certificate of currency",
    ticket: "pl",
    applies: () => ({ applies: true }),
  },
  {
    id: "workers_comp",
    label: "Workers compensation certificate of currency",
    ticket: "wc",
    applies: (s) =>
      s.employsWorkers
        ? { applies: true }
        : { applies: false, why: `The subcontractor has declared no workers on this job, so there is no employer policy to sight (${s.state === "NSW" ? "Workers Compensation Act 1987 (NSW) s 155" : "Workers' Compensation and Rehabilitation Act 2003 (Qld) s 48"} applies to employers). Re-checked if the declaration changes.` },
  },
  {
    id: "subcontractor_statement",
    label: "Subcontractor's statement",
    applies: (s) =>
      s.state === "NSW"
        ? { applies: true }
        : { applies: false, why: `The work is in ${s.state}. The subcontractor's statement is a New South Wales requirement for a principal contractor paying a subcontractor (Workers Compensation Act 1987 (NSW) s 175B and Sch 2 Part 5) and does not apply to work outside New South Wales.` },
  },
];

/** The facts an artefact carries, by reference. */
const ARTEFACT_REFS = (sub, obligationId) => [`${sub}.legal_name`, `${sub}.abn`, `${sub}.trading_address`, `${sub}.doc.${obligationId}.document_id`];

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|proprietary|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

const isDate = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));

/**
 * The eight checks as pure decisions over one graph snapshot, in order, stopping
 * at the first problem. Returns the outcome of each check reached.
 */
export function evaluate(facts, rules, sub, now, dueDates) {
  const f = (k) => facts[`${sub}.${k}`];
  const steps = [];
  const stop = (kind, check, reason, extra = {}) => ({ steps, stopped: { kind, check, reason, ...extra } });

  // 1. Identity.
  if (!f("abn") || !f("legal_name")) return stop("hold", "1 identity", "ABN or legal name is not in the graph", { missing: ["abn"] });
  if (f("abn_status") !== "active") return stop("fail", "1 identity", `ABN ${f("abn")} is not active on the register (status: ${f("abn_status") ?? "unknown"})`);
  if (f("licence_name") && norm(f("licence_name")) !== norm(f("legal_name")))
    return stop("fail", "1 identity", `entity name on the licence does not match the ABN's legal name`);
  steps.push({ check: "1 identity", reason: "ABN active; legal name matches the licence holder" });

  // 2. Tickets: every ticket held is current. Expired is a queue, not a warning.
  const tickets = OBLIGATIONS.filter((o) => o.ticket && f(`ticket.${o.ticket}.expires`));
  for (const o of tickets) {
    const exp = f(`ticket.${o.ticket}.expires`);
    if (!isDate(exp) || Date.parse(exp) < now.getTime()) return stop("fail", "2 tickets", `${o.label} expired ${exp}`);
  }
  steps.push({ check: "2 tickets", reason: `${tickets.length} ticket(s) current at ${now.toISOString().slice(0, 10)}` });

  // 3. Applicability, with a written no.
  const subject = { state: f("site_state"), employsWorkers: f("employs_workers") === "yes" };
  if (!subject.state) return stop("hold", "3 applicability", "site state is not in the graph", { missing: ["site_state"] });
  const applicable = [];
  const notApplicable = [];
  for (const o of OBLIGATIONS) {
    const a = o.applies(subject);
    if (a.applies) applicable.push(o);
    else notApplicable.push({ obligation: o, why: a.why });
  }
  steps.push({ check: "3 applicability", reason: `${applicable.length} apply, ${notApplicable.length} written as not applicable`, notApplicable });

  // 4. Completeness. Missing is Hold: the pack waits, the subbie is asked.
  const missing = [];
  for (const o of applicable) {
    if (!f(`doc.${o.id}.document_id`)) missing.push(o.id);
    else if (o.ticket && !f(`ticket.${o.ticket}.expires`)) missing.push(`${o.id}.expiry`);
  }
  if (missing.length) return stop("hold", "4 completeness", `missing: ${missing.join(", ")}`, { missing });
  const yellow = [];
  for (const o of applicable) {
    const c = Number(f(`doc.${o.id}.confidence`) ?? "1");
    if (!(c >= CONFIDENCE_GATE)) yellow.push(`${o.id}.extracted (confidence ${c})`);
  }
  steps.push({ check: "4 completeness", reason: `every applicable obligation has a document on file`, applicable, yellow });

  // 5. Field reuse: one ABN in the graph, and the same ABN on every document.
  for (const o of applicable) {
    const onDoc = f(`doc.${o.id}.abn`);
    if (onDoc && onDoc.replace(/\s/g, "") !== f("abn").replace(/\s/g, ""))
      return stop("fail", "5 field reuse", `two different ABNs in one pack: ${o.label} carries a different ABN from the graph`);
  }
  steps.push({ check: "5 field reuse", reason: "one ABN, read by reference into every document" });

  // 6. Source and as-of: a dated rule in force for every applicable obligation.
  const cited = [];
  for (const o of applicable) {
    const rule = rules.filter((r) => r.id === o.id && r.effectiveFrom <= now.toISOString()).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).pop();
    const due = dueDates[o.id];
    if (!rule || !due) return stop("hold", "6 source and as-of", `no dated rule in force for ${o.id}; nothing can be cited`, { missing: [`rule.${o.id}`] });
    cited.push({ obligation: o, rule, due });
  }
  steps.push({ check: "6 source and as-of", reason: `${cited.length} clause(s) cited, as of ${now.toISOString()}`, cited });

  return { steps, stopped: null };
}

/**
 * One run for one bill.
 *
 * @param {import("@aipathway/conformance").PackPorts} ports
 * @param {{ event?: string, billId?: string, packId?: string, subjectId?: string,
 *           release?: { person?: string } }} wake
 */
export async function build(ports, wake = {}) {
  await ports.declareHardStep(HARD_STEP);
  if (!wake.packId || !wake.subjectId) return { outcome: "no_bill", emits: [] };
  const { packId, subjectId: sub } = wake;
  const now = await ports.now();
  const facts = await ports.readFacts();
  const rules = await ports.readRules();
  const owner = facts[`${sub}.exception_owner`] ?? facts["business.payments_owner"] ?? "the contracts administrator";
  const billId = facts[`${sub}.bill_id`] ?? wake.billId ?? packId;

  // An open exception with a named owner stops the chain.
  if (facts[`${sub}.open_exception`]) return { outcome: "halted_on_open_exception", exception: facts[`${sub}.open_exception`], emits: [] };

  // Due dates come from the rule in force, every run. Never stored.
  const claimAt = facts[`${sub}.claim_received_at`] ?? now.toISOString();
  const dueDates = {};
  for (const o of OBLIGATIONS) {
    if (rules.some((r) => r.id === o.id)) dueDates[o.id] = await ports.dueDateFor(o.id, claimAt);
  }

  const result = evaluate(facts, rules, sub, now, dueDates);
  const emits = [];
  const seam = { bill_id: billId, pack_id: packId, as_of: now.toISOString() };

  // Record the checks that held, in order, and the first one that did not.
  const byCheck = Object.fromEntries(result.steps.map((s) => [s.check, s]));
  const reached = result.steps.length;

  // Applicability's written no is an output, whatever happens later.
  for (const na of byCheck["3 applicability"]?.notApplicable ?? []) {
    await ports.declareNotApplicable(`${sub}:${na.obligation.id}`, na.why);
  }

  // File each document against the bill, by reference, once completeness held.
  const completeness = byCheck["4 completeness"];
  if (completeness) {
    for (const o of completeness.applicable) {
      await ports.deriveArtefact({ id: `${packId}:${o.id}`, packId, refs: ARTEFACT_REFS(sub, o.id) });
      emits.push({ event: "evidence.filed", bill_id: billId, document_id: facts[`${sub}.doc.${o.id}.document_id`], message_id: facts[`${sub}.doc.${o.id}.message_id`] ?? null });
    }
    for (const y of completeness.yellow) await ports.markYellow(packId, y);
  }

  for (const s of result.steps) await ports.runCheck(packId, s.check, true, s.reason);

  if (result.stopped) {
    const { kind, check, reason } = result.stopped;
    if (kind === "fail") await ports.runCheck(packId, check, false, reason);
    // Hold: no check is failed; the pack stays where it is and cannot be handed over.
    const exception = { event: "exception.raised", bill_id: billId, reason: `pack.${kind}`, check, detail: reason, exception_owner: owner };
    emits.push(exception);
    await ports.retain("seam", JSON.stringify({ ...seam, queue: kind, stopped_at: check, exception_owner: owner }));
    await ports.publishCopy([
      kind === "fail" ? `Payment on hold. Do not pay: ${check} did not hold.` : `Payment on hold. Waiting on paperwork for ${check}.`,
      `Checked as of ${now.toISOString().slice(0, 10)}. ${owner} owns the next step.`,
    ]);
    return { outcome: kind, reached, stoppedAt: check, emits };
  }

  // 6. Cite every clause, and date the pack.
  const cited = byCheck["6 source and as-of"].cited;
  for (const c of cited) {
    await ports.addClause(packId, {
      text: `${c.obligation.label}: ${c.rule.text} Evidence needed by ${c.due.date.slice(0, 10)} under rule ${c.rule.id} ${c.due.version}.`,
      sourceRuleId: c.rule.id,
    });
  }
  await ports.setAsOf(packId, now.toISOString());
  const versions = cited.map((c) => `${c.rule.id}@${c.due.version}`).join(", ");

  // 7. The named human gate. The release names the person; the build names what they accept.
  const accepted = `Payment pack ${packId} for bill ${billId}, as of ${now.toISOString()}, rules ${versions}, ${cited.length} document(s) filed`;
  let released = false;
  if (wake.release) {
    released = await ports.acceptVersion(packId, { person: wake.release.person, accepted });
    if (!released) emits.push({ event: "exception.raised", bill_id: billId, reason: "pack.release_unnamed", exception_owner: owner });
  }

  const copy = [
    `Paperwork current as of ${now.toISOString().slice(0, 10)}.`,
    `${cited.length} document(s) on file, each cited to its rule.`,
    released ? `Reviewed and accepted by ${wake.release.person}. Ready for a person to approve payment.` : `Waiting for a named person to review before payment is approved.`,
  ];

  if (!released) {
    emits.push({ event: "exception.raised", bill_id: billId, reason: "pack.awaiting_release", exception_owner: owner });
    await ports.retain("seam", JSON.stringify({ ...seam, queue: "awaiting_release", rule_versions: versions, exception_owner: owner }));
    await ports.publishCopy(copy);
    return { outcome: "awaiting_release", reached, emits };
  }

  // The acceptance is the move out of Yellow, recorded by the gate itself with
  // the person, the time and the content. Re-running a check here would let a
  // marked field pull the pack back, so checks 7 and 8 are read off the record.

  // 8. Handover: one pack for the bill. The world refuses a failed or unaccepted pack.
  const out = await ports.handover(packId);
  if (out.ok) {
    emits.push({ event: "bill.checked", bill_id: billId });
  } else {
    emits.push({ event: "exception.raised", bill_id: billId, reason: "pack.handover_refused", detail: out.why, exception_owner: owner });
  }
  await ports.retain("seam", JSON.stringify({ ...seam, queue: out.ok ? "pass" : "refused", rule_versions: versions, accepted_by: wake.release.person }));
  await ports.publishCopy(copy);
  return { outcome: out.ok ? "checked" : "refused", reached, emits };
}

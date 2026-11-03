/**
 * One scenario per check of rejected-pack-build-standard, for Sub Pay Check.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The subject is a subcontractor's payment claim (a bill in the ledger). Each
 * world holds the graph of that subbie's facts and the dated rules the pack is
 * cited against. Every `holds` reads what the world recorded through its
 * ports, never the build's own return value.
 */

import { PackWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const DAY = 86_400_000;
const daysFrom = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

/** Dated rules, one family per obligation. statement windows in days from the claim. */
const RULES = [
  { id: "payment_claim", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 10, text: "A payment claim identifies the work and the amount claimed (Building Industry Fairness (Security of Payment) Act 2017 (Qld) s 68; Building and Construction Industry Security of Payment Act 1999 (NSW) s 13)." },
  { id: "qbcc_licence", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 10, text: "The subcontractor holds a current QBCC licence of the class for the work (QBCC Act 1991 (Qld) s 42)." },
  { id: "nsw_licence", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 10, text: "The subcontractor holds a current NSW contractor licence for the work (Home Building Act 1989 (NSW) s 4)." },
  { id: "public_liability", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 10, text: "A current public liability certificate of currency is sighted, as the subcontract requires." },
  { id: "workers_comp", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 10, text: "A current workers compensation certificate of currency is sighted for an employer subcontractor." },
  { id: "subcontractor_statement", version: "v1", effectiveFrom: "2025-07-01T00:00:00.000Z", supersededBy: "v2", dueDays: 10, text: "A subcontractor's statement covering the claim period is held before payment (Workers Compensation Act 1987 (NSW) s 175B)." },
  { id: "subcontractor_statement", version: "v2", effectiveFrom: "2026-09-25T00:00:00.000Z", dueDays: 5, text: "A subcontractor's statement covering the claim period is held before payment (Workers Compensation Act 1987 (NSW) s 175B), now due five days from the claim under the builder's revised terms." },
];

/**
 * One subbie's facts, clean by default. `over` replaces or adds keys (a value of
 * null removes one), so each scenario states only what it breaks.
 */
function subbie(sub, { state = "QLD", employs = true, over = {} } = {}) {
  const docs = ["payment_claim", "public_liability", ...(state === "QLD" ? ["qbcc_licence"] : ["nsw_licence", "subcontractor_statement"]), ...(employs ? ["workers_comp"] : [])];
  const f = {
    [`${sub}.bill_id`]: `BILL-${sub}`,
    [`${sub}.abn`]: "51 824 753 556",
    [`${sub}.abn_status`]: "active",
    [`${sub}.legal_name`]: `${sub} Plumbing Pty Ltd`,
    [`${sub}.licence_name`]: `${sub} PLUMBING PTY LTD`,
    [`${sub}.trading_address`]: "12 Gympie Terrace, Noosaville QLD 4566",
    [`${sub}.site_state`]: state,
    [`${sub}.employs_workers`]: employs ? "yes" : "no",
    [`${sub}.claim_received_at`]: "2026-09-20T00:00:00.000Z",
    [`${sub}.exception_owner`]: "Dana Kerr (contracts admin)",
    [`${sub}.ticket.pl.expires`]: daysFrom(200),
    [`${sub}.ticket.pl.number`]: "PL-88123",
    [`${sub}.ticket.wc.expires`]: daysFrom(150),
    [`${sub}.ticket.wc.number`]: "WC-55120",
    [`${sub}.ticket.qbcc.expires`]: daysFrom(300),
    [`${sub}.ticket.qbcc.number`]: "QBCC-1288811",
    [`${sub}.ticket.nswlic.expires`]: daysFrom(300),
    [`${sub}.ticket.nswlic.number`]: "NSW-344120C",
  };
  for (const d of docs) {
    f[`${sub}.doc.${d}.document_id`] = `drive-${sub}-${d}`;
    f[`${sub}.doc.${d}.message_id`] = `gmail-${sub}-${d}`;
    f[`${sub}.doc.${d}.abn`] = "51824753556";
    f[`${sub}.doc.${d}.confidence`] = "0.98";
  }
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete f[`${sub}.${k}`];
    else f[`${sub}.${k}`] = v;
  }
  return f;
}

const FACT_SUB = { "PK-S9": "S9", "PK-S11": "S11" };
const world = (sub, opts) => new PackWorld({ now: NOW, facts: subbie(sub, opts), rules: RULES, packs: [{ id: `PK-${sub}`, subjectId: sub }] });
const wake = (sub, extra = {}) => ({ event: "bill.received", billId: `BILL-${sub}`, packId: `PK-${sub}`, subjectId: sub, ...extra });
const RELEASE = { person: "Dana Kerr" };

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const artefactsOf = (w, packId) => w.artefacts.filter((a) => a.packId === packId);
const okHandover = (w, packId) => w.handovers.some((h) => h.packId === packId && h.ok === true);

/** Words a passing pack must never be described with. Check 10. */
const COMPLIANCE_CLAIM = /\b(compliant|compliance (is )?(met|achieved|confirmed)|in compliance|fully (certified|covered)|certified|guaranteed|legally (safe|cleared)|meets all)\b/i;

export const scenarios = [
  {
    checkId: "one-graph",
    // 1. The subbie's address changes once, after several documents were filed carrying it.
    world: () => world("S1"),
    drive: async (b, w) => {
      await b(w.ports(), wake("S1", { release: RELEASE }));
      w.changeFact("S1.trading_address", "4/88 Eumundi Road, Noosaville QLD 4566");
    },
    holds: (w) => {
      const arts = artefactsOf(w, "PK-S1");
      const carrying = arts.filter((a) => a.refs.includes("S1.trading_address") || a.literal !== undefined);
      if (arts.length < 3 || carrying.length !== arts.length) return false;
      const rendered = arts.map((a) => w.renderStored(a.id) ?? "");
      const allNew = rendered.every((t) => t.includes("4/88 Eumundi Road"));
      const noneOld = rendered.every((t) => !t.includes("12 Gympie Terrace"));
      return allNew && noneOld;
    },
    describe: (w) => `${artefactsOf(w, "PK-S1").length} artefact(s); rendered now: ${artefactsOf(w, "PK-S1").map((a) => JSON.stringify(w.renderStored(a.id))).join(" | ")}`,
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. A NSW claim; the statement rule's v2 takes effect on 25 September. Run, let the clock pass it, run again.
    world: () => world("S2", { state: "NSW" }),
    drive: async (b, w) => {
      await b(w.ports(), wake("S2"));
      w.advance(7 * DAY);
      await b(w.ports(), wake("S2", { event: "schedule.tick" }));
    },
    holds: (w) => {
      const due = callsTo(w, "read_rule", (c) => c.request.ruleId === "subcontractor_statement");
      if (due.length !== 2 || !due[0].response || !due[1].response) return false;
      const sameTrigger = due[0].request.triggeredAt === due[1].request.triggeredAt;
      const moved = due[0].response.version === "v1" && due[1].response.version === "v2" && due[0].response.date.startsWith("2026-09-30") && due[1].response.date.startsWith("2026-09-25");
      // The old rule is still readable on the later run: both versions are in the rule read.
      const ruleReads = callsTo(w, "read_rule", (c) => c.request.at && !c.request.ruleId);
      const oldReadable = ruleReads.length === 2 && ruleReads[1].response.rules === RULES.length;
      const clauses = w.packById("PK-S2")?.clauses ?? [];
      const citesNew = clauses.some((c) => c.sourceRuleId === "subcontractor_statement" && /2026-09-25/.test(c.text) && /\bv2\b/.test(c.text));
      return sameTrigger && moved && oldReadable && citesNew;
    },
    describe: (w) => `statement due dates read: ${callsTo(w, "read_rule", (c) => c.request.ruleId === "subcontractor_statement").map((c) => JSON.stringify(c.response)).join(" then ")}`,
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A Queensland subbie with no workers: the NSW statement, the NSW licence and workers comp do not apply.
    world: () => world("S3", { employs: false }),
    drive: (b, w) => b(w.ports(), wake("S3")),
    holds: (w) => {
      const no = (id) => w.notApplicable.find((n) => n.subjectId === `S3:${id}`);
      const want = ["subcontractor_statement", "nsw_licence", "workers_comp"];
      const written = want.every((id) => {
        const n = no(id);
        return n && typeof n.reason === "string" && n.reason.length > 40 && /\bAct \d{4}\b/.test(n.reason);
      });
      const statementSaysWhy = /Queensland|QLD/.test(no("subcontractor_statement")?.reason ?? "") && /s 175B/.test(no("subcontractor_statement")?.reason ?? "");
      // What applies is not written off: nothing else is declared not applicable.
      const onlyThose = w.notApplicable.filter((n) => n.subjectId.startsWith("S3:")).length === want.length;
      return written && statementSaysWhy && onlyThose;
    },
    describe: (w) => `not applicable: ${w.notApplicable.map((n) => `${n.subjectId}: ${n.reason}`).join(" | ") || "(none written)"}`,
  },
  {
    checkId: "eight-checks-in-order",
    // 4. A cancelled ABN (check 1) and an expired public liability certificate (check 2).
    world: () => world("S4", { over: { abn_status: "cancelled", "ticket.pl.expires": daysFrom(-20) } }),
    drive: (b, w) => b(w.ports(), wake("S4", { release: RELEASE })),
    holds: (w) => {
      const p = w.packById("PK-S4");
      if (!p) return false;
      const gates = callsTo(w, "gate", (c) => c.request.packId === "PK-S4" && "check" in c.request);
      const firstFalse = gates.findIndex((c) => c.request.passed === false);
      const reportedEarly = /1 identity/.test(p.failedCheck ?? "") && p.queue === "fail";
      const historyWhy = p.history.length > 0 && p.history.every((h) => typeof h.reason === "string" && h.reason.length > 0) && p.history.some((h) => h.to === "fail" && /ABN/.test(h.reason));
      // Stop at the first failure: no later check runs once one has failed.
      const stopped = firstFalse === gates.length - 1 && !gates.some((c) => /2 tickets/.test(c.request.check));
      return reportedEarly && historyWhy && stopped && !okHandover(w, "PK-S4");
    },
    describe: (w) => {
      const p = w.packById("PK-S4");
      return `queue ${p?.queue}, failed ${p?.failedCheck}; history ${JSON.stringify(p?.history ?? [])}`;
    },
  },
  {
    checkId: "four-queues",
    // 5. Workers comp expired, a release is sent anyway, then somebody tries to hand the pack over.
    world: () => world("S5", { over: { "ticket.wc.expires": daysFrom(-3) } }),
    drive: async (b, w) => {
      await b(w.ports(), wake("S5", { release: RELEASE }));
      await w.ports().handover("PK-S5");
    },
    holds: (w) => {
      const p = w.packById("PK-S5");
      const attempts = w.handovers.filter((h) => h.packId === "PK-S5");
      const refused = attempts.length > 0 && attempts.every((h) => h.ok === false && /fail queue/.test(h.why ?? ""));
      return p?.queue === "fail" && /2 tickets/.test(p.failedCheck ?? "") && p.handedOver !== true && refused && !p.versionRecord;
    },
    describe: (w) => `queue ${w.packById("PK-S5")?.queue}; handovers ${JSON.stringify(w.handovers)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Two documents read off a scan with low confidence. A release is not sent.
    world: () => world("S6", { over: { "doc.public_liability.confidence": "0.62", "doc.workers_comp.confidence": "0.71" } }),
    drive: (b, w) => b(w.ports(), wake("S6", { event: "schedule.tick" })),
    holds: (w) => {
      const p = w.packById("PK-S6");
      if (!p) return false;
      const both = p.yellowFields.some((f) => /public_liability/.test(f)) && p.yellowFields.some((f) => /workers_comp/.test(f)) && p.yellowFields.length === 2;
      const accepts = callsTo(w, "gate", (c) => c.request.packId === "PK-S6" && ("person" in c.request || c.request.accept === true));
      return both && p.queue === "yellow" && accepts.length === 0 && !p.versionRecord && !okHandover(w, "PK-S6");
    },
    describe: (w) => `queue ${w.packById("PK-S6")?.queue}; yellow ${JSON.stringify(w.packById("PK-S6")?.yellowFields)}`,
  },
  {
    checkId: "named-human-gate",
    // 7. One low-confidence field. A release arrives with no name, then one from Dana Kerr.
    world: () => world("S7", { over: { "doc.payment_claim.confidence": "0.55" } }),
    drive: async (b, w) => {
      await b(w.ports(), wake("S7", { event: "exception.closed", release: { person: "" } }));
      w.afterUnnamed = { queue: w.packById("PK-S7")?.queue, handed: okHandover(w, "PK-S7") };
      w.advance(60_000);
      await b(w.ports(), wake("S7", { event: "exception.closed", release: RELEASE }));
    },
    holds: (w) => {
      const p = w.packById("PK-S7");
      if (!p || !w.afterUnnamed) return false;
      const heldWithoutName = w.afterUnnamed.queue === "yellow" && w.afterUnnamed.handed === false && w.refusedAcceptances.includes("PK-S7");
      const vr = p.versionRecord;
      const record = !!vr && vr.person === "Dana Kerr" && Number.isFinite(Date.parse(vr.at)) && /PK-S7/.test(vr.accepted) && /payment_claim@v1/.test(vr.accepted);
      const moved = p.history.some((h) => h.from === "yellow" && h.to === "pass" && /Dana Kerr/.test(h.reason));
      return heldWithoutName && record && moved && p.queue === "pass";
    },
    describe: (w) => `after unnamed: ${JSON.stringify(w.afterUnnamed)}; record ${JSON.stringify(w.packById("PK-S7")?.versionRecord)}`,
  },
  {
    checkId: "as-of-and-citations",
    // 8. A NSW employer subbie: five obligations apply, five clauses are generated.
    world: () => world("S8", { state: "NSW" }),
    drive: (b, w) => b(w.ports(), wake("S8")),
    holds: (w) => {
      const p = w.packById("PK-S8");
      if (!p) return false;
      const ruleIds = new Set(RULES.map((r) => r.id));
      const cited = p.clauses.length >= 5 && p.clauses.every((c) => typeof c.sourceRuleId === "string" && ruleIds.has(c.sourceRuleId));
      const allObligations = ["payment_claim", "nsw_licence", "public_liability", "workers_comp", "subcontractor_statement"].every((id) => p.clauses.some((c) => c.sourceRuleId === id));
      return cited && allObligations && typeof p.asOf === "string" && Number.isFinite(Date.parse(p.asOf));
    },
    describe: (w) => `as-of ${w.packById("PK-S8")?.asOf}; clauses ${JSON.stringify(w.packById("PK-S8")?.clauses.map((c) => c.sourceRuleId ?? "UNCITED"))}`,
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. A clean Queensland claim, released by a named person, handed over cold.
    world: () => world("S9"),
    drive: (b, w) => b(w.ports(), wake("S9", { release: RELEASE })),
    holds: (w) => {
      const p = w.packById("PK-S9");
      const arts = artefactsOf(w, "PK-S9");
      if (!p || !okHandover(w, "PK-S9") || arts.length < 4) return false;
      const facts = subbie(FACT_SUB[w.packs[0].id]);
      const resolves = arts.every((a) => a.literal === undefined && a.refs.length > 0 && a.refs.every((k) => typeof facts[k] === "string" && facts[k].length > 0));
      const noInsiderLinks = arts.every((a) => !/https?:\/\/|\\\\|sharepoint|localhost|intranet/i.test(w.renderStored(a.id) ?? ""));
      return resolves && noInsiderLinks && p.clauses.length === arts.length && !!p.asOf && !!p.versionRecord && p.handedOver === true;
    },
    describe: (w) => `handovers ${JSON.stringify(w.handovers)}; ${artefactsOf(w, "PK-S9").length} artefact(s)`,
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. A passing pack: every string the build shows for it.
    world: () => world("S10"),
    drive: (b, w) => b(w.ports(), wake("S10", { release: RELEASE })),
    holds: (w) => {
      if (!okHandover(w, "PK-S10") || w.copy.length === 0) return false;
      const noClaim = w.copy.every((s) => !COMPLIANCE_CLAIM.test(s));
      const saysWhatItIs = w.copy.some((s) => /\bcurrent\b/i.test(s)) && w.copy.some((s) => /\bas of\b/i.test(s));
      return noClaim && saysWhatItIs;
    },
    describe: (w) => `copy: ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A pack processed end to end. Only ids and states may be retained.
    world: () => world("S11"),
    drive: (b, w) => b(w.ports(), wake("S11", { release: RELEASE })),
    holds: (w) => {
      if (!okHandover(w, "PK-S11") || w.retained.length === 0) return false;
      const facts = subbie(FACT_SUB[w.packs[0].id]);
      const content = Object.entries(facts)
        .filter(([k]) => /\.(abn|legal_name|licence_name|trading_address|number)$/.test(k))
        .map(([, v]) => v);
      const noContent = w.retained.every((r) => content.every((v) => !r.content.includes(v) && !r.content.includes(v.replace(/\s/g, ""))));
      const noTrainingPath = w.retained.every((r) => !/train|model|fine.?tune|dataset/i.test(r.what));
      return noContent && noTrainingPath;
    },
    describe: (w) => `retained: ${JSON.stringify(w.retained)}`,
  },
  {
    checkId: "hard-step-is-named",
    // 12. Which step does the build treat as the binding layer?
    world: () => world("S12"),
    drive: (b, w) => b(w.ports(), wake("S12")),
    holds: (w) => typeof w.hardStep === "string" && /binding layer/i.test(w.hardStep) && /graph/i.test(w.hardStep) && /named person/i.test(w.hardStep),
    describe: (w) => `hard step: ${JSON.stringify(w.hardStep)}`,
  },
];

// The pass test runs only against a live graph, which this standard quotes as
// a scoped build. On the stub the runner reports it as with_us.
export const liveScenarios = [];

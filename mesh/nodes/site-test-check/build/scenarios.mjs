/**
 * One scenario per check of fire-service-pack-standard, for Site Test Check.
 *
 * Scaffolded by `npx @aipathway/conformance init fire-service-pack-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Each scenario drives the build the way production wakes it: a routine fire
 * service visit to a commercial site marked done (job.completed), a request to
 * recompile the site report (job.updated), or a schedule.tick. Every `holds`
 * reads the recorded port trace (world.calls) and what the register recorded
 * through its ports, and each one also asks for the build's own hold (a named
 * exception, a held report), because the register refuses some bad writes by
 * itself and a check that only read the register would pass a build that held
 * nothing.
 *
 * The jurisdiction rows are FIXTURE values for the stub, shaped like section 7
 * of the standard. They are not legal advice; a live build stores the checked,
 * dated, cited values.
 */

import { FireWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z");
const plusDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const EXT_SVC = "extinguisher-six-monthly";
const HYD_SVC = "hydrant-annual-flow";
const DOOR_SVC = "fire-door-six-monthly";
const LIGHT_SVC = "emergency-light-six-monthly";

const rule = (obligationType, jurisdiction, retentionYears, attestedBy) => ({
  obligationType,
  jurisdiction,
  version: `fixture-${jurisdiction}-2026-09-18`,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  intervalMonths: 6,
  retentionYears,
  attestedBy,
});
const RULES = [EXT_SVC, HYD_SVC, DOOR_SVC, LIGHT_SVC].flatMap((t) => [
  rule(t, "QLD", 5, "the occupier, on the occupier's statement (Qld fixture)"),
  rule(t, "VIC", 7, "the owner, on the annual essential safety measures report (Vic fixture)"),
  rule(t, "NSW", 6, "an accredited practitioner (fire safety), on the AFSS (NSW fixture)"),
]);

const ob = (id, assetId, obligationType) => ({ id, assetId, obligationType, anchorDate: "2026-03-21T00:00:00.000Z" });

/** Level 2 east stair extinguisher, the ground floor hydrant, the stair fire door, the exit light by the lifts. */
const EXT = { id: "A-FE-101", tag: "FE-101", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true };
const HYD = { id: "A-HY-201", tag: "HY-201", assetClass: "system", jurisdiction: "QLD", hasBaseline: true };
const DOOR = { id: "A-FD-301", tag: "FD-301", assetClass: "passive", jurisdiction: "QLD", hasBaseline: true };
const LIGHT = { id: "A-EL-401", tag: "EL-401", assetClass: "system", jurisdiction: "QLD", hasBaseline: true };

/** The site's register rows as read by site id: class, and whether the asset is electrical work. */
const regRow = (a, electrical = false) => ({ asset_id: a.id, tag: a.tag, asset_class: a.assetClass, electrical });

const world = (assets, obligations) => new FireWorld({ now: NOW, assets, rules: RULES, obligations });

const visit = (job_id, tests, { register, due_assets = [], state = "QLD", seam = {} } = {}) => ({
  event: "job.completed",
  job: { job_id, site: { site_id: `SITE-${job_id}`, state }, register, due_assets, tests, seam },
});

const extTest = (over = {}) => ({
  tag: EXT.tag,
  obligation_id: "OB-FE",
  result: "pass",
  evidence: { kind: "image", value: "simpro:att-fe101-in-situ" },
  tag_photograph: true,
  baseline_seen: true,
  ...over,
});
const hydTest = (over = {}) => ({
  tag: HYD.tag,
  obligation_id: "OB-HY",
  result: "pass",
  evidence: { kind: "reading", value: "10.2" },
  tag_photograph: true,
  baseline_seen: true,
  ...over,
});
const doorTest = (over = {}) => ({
  tag: DOOR.tag,
  obligation_id: "OB-FD",
  result: "pass",
  evidence: { kind: "inspection", value: "closer, seals and signage checked" },
  tag_photograph: true,
  baseline_seen: true,
  ...over,
});
const lightTest = (over = {}) => ({
  tag: LIGHT.tag,
  obligation_id: "OB-EL",
  result: "pass",
  evidence: { kind: "reading", value: "95" },
  tag_photograph: true,
  baseline_seen: true,
  certificate_ref: "simpro:att-el-test-sheet",
  ...over,
});

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const parse = (s) => {
  try {
    return JSON.parse(s ?? "{}");
  } catch {
    return {};
  }
};
const escalations = (w, reason) =>
  callsTo(w, "escalate", (c) => c.request?.reason === reason).map((c) => parse(c.request.detail));
const named = (d) => typeof d.exception_owner === "string" && d.exception_owner.length > 0;
const storeCalls = (w) => callsTo(w, "record_service", (c) => c.request && "assetId" in c.request);
const storedOk = (w) => storeCalls(w).filter((c) => c.response && "id" in c.response);
const reportHeld = (w, jobId) => escalations(w, "report.held").some((d) => d.job_id === jobId && named(d));
const rendered = (w) => callsTo(w, "evidence", (c) => c.request && "document" in c.request);

export const scenarios = [
  {
    checkId: "identity-first",
    world: () =>
      world(
        [
          EXT,
          { id: "A-FE-102", tag: "FE-102", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true },
          { id: "A-FE-103", tag: "FE-102", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true },
        ],
        [ob("OB-FE", EXT.id, EXT_SVC), ob("OB-FE2", "A-FE-102", EXT_SVC), ob("OB-FE3", "A-FE-103", EXT_SVC)],
      ),
    drive: (build, w) =>
      build(
        w.ports(),
        visit("V-1", [extTest(), extTest({ tag: "FE-999", obligation_id: "OB-FE2" }), extTest({ tag: "FE-102", obligation_id: "OB-FE2" })], {
          register: [regRow(EXT), { asset_id: "A-FE-102", tag: "FE-102", asset_class: "portable" }, { asset_id: "A-FE-103", tag: "FE-102", asset_class: "portable" }],
        }),
      ),
    holds: (w) => {
      const stores = storeCalls(w);
      const unresolved = escalations(w, "asset.unresolved");
      return (
        stores.length === 1 &&
        stores[0].request.assetId === EXT.id &&
        storedOk(w).length === 1 &&
        w.findings.length === 2 &&
        unresolved.length === 2 &&
        unresolved.every(named) &&
        reportHeld(w, "V-1") &&
        rendered(w).length === 0
      );
    },
    describe: (w) => `${storeCalls(w).length} store call(s), ${w.findings.length} finding(s), ${escalations(w, "asset.unresolved").length} held unresolved`,
  },
  {
    checkId: "discharges-an-obligation",
    world: () => world([HYD], [ob("OB-HY", HYD.id, HYD_SVC), ob("OB-HY-B", HYD.id, "hydrant-five-yearly-hose")]),
    drive: (build, w) => build(w.ports(), visit("V-2", [hydTest({ obligation_id: undefined })], { register: [regRow(HYD)] })),
    holds: (w) => {
      const held = escalations(w, "record.no_obligation");
      return (
        storeCalls(w).length === 0 &&
        w.records.length === 0 &&
        w.passCount === 0 &&
        held.length === 1 &&
        named(held[0]) &&
        Array.isArray(held[0].live) &&
        held[0].live.length === 2 &&
        reportHeld(w, "V-2")
      );
    },
    describe: (w) => `${storeCalls(w).length} store call(s), ${escalations(w, "record.no_obligation").length} held for the obligation`,
  },
  {
    checkId: "result-recorded-not-computed",
    world: () =>
      world(
        [HYD, { id: "A-HY-202", tag: "HY-202", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }],
        [ob("OB-HY", HYD.id, HYD_SVC), ob("OB-HY2", "A-HY-202", HYD_SVC)],
      ),
    drive: (build, w) =>
      build(
        w.ports(),
        visit(
          "V-3",
          [
            hydTest({ result: "defect", defect: { code: "D2", owner: "Sam Lee (fire technician)", note: "landing valve gland weeping" } }),
            hydTest({ tag: "HY-202", obligation_id: "OB-HY2", result: undefined }),
          ],
          { register: [regRow(HYD), { asset_id: "A-HY-202", tag: "HY-202", asset_class: "system" }] },
        ),
      ),
    holds: (w) => {
      const r1 = w.records.filter((r) => r.assetId === HYD.id);
      const missing = escalations(w, "result.missing");
      return (
        r1.length === 1 &&
        r1[0].result === "defect" &&
        r1[0].defect?.code === "D2" &&
        storeCalls(w).every((c) => c.request.assetId === HYD.id && c.request.result === "defect") &&
        !w.records.some((r) => r.assetId === "A-HY-202") &&
        missing.length === 1 &&
        named(missing[0]) &&
        missing[0].asset_id === "A-HY-202" &&
        reportHeld(w, "V-3")
      );
    },
    describe: (w) => `records: ${w.records.map((r) => `${r.assetId}=${r.result}`).join(", ") || "none"}; ${escalations(w, "result.missing").length} held for a missing result`,
  },
  {
    checkId: "evidence-per-class",
    world: () => world([EXT, HYD, DOOR], [ob("OB-FE", EXT.id, EXT_SVC), ob("OB-HY", HYD.id, HYD_SVC), ob("OB-FD", DOOR.id, DOOR_SVC)]),
    drive: (build, w) =>
      build(
        w.ports(),
        visit(
          "V-4",
          [
            extTest({ evidence: { kind: "inspection", value: "looked fine" } }),
            hydTest({ evidence: { kind: "image", value: "simpro:att-gauge-photo" } }),
            doorTest({ evidence: { kind: "image", value: "simpro:att-door" } }),
          ],
          { register: [regRow(EXT), regRow(HYD), regRow(DOOR)] },
        ),
      ),
    holds: (w) => {
      const held = escalations(w, "evidence.wrong_for_class");
      const needs = Object.fromEntries(held.map((d) => [d.asset_id, d.needs]));
      return (
        w.records.length === 0 &&
        storedOk(w).length === 0 &&
        held.length === 3 &&
        held.every(named) &&
        needs[EXT.id] === "image" &&
        needs[HYD.id] === "reading" &&
        needs[DOOR.id] === "inspection" &&
        reportHeld(w, "V-4")
      );
    },
    describe: (w) => `${w.records.length} record(s); held: ${escalations(w, "evidence.wrong_for_class").map((d) => `${d.asset_id} needs ${d.needs}`).join(", ") || "none"}`,
  },
  {
    checkId: "baseline-absence-reportable",
    world: () => world([{ ...HYD, hasBaseline: false }], [ob("OB-HY", HYD.id, HYD_SVC)]),
    drive: (build, w) => build(w.ports(), visit("V-5", [hydTest({ baseline_seen: false })], { register: [regRow(HYD)] })),
    holds: (w) =>
      w.records.some((r) => r.assetId === HYD.id) &&
      w.nonConformances.length === 1 &&
      w.nonConformances[0].assetId === HYD.id &&
      /baseline/.test(w.nonConformances[0].what),
    describe: (w) => `${w.nonConformances.length} non-conformance(s), ${w.records.length} record(s)`,
  },
  {
    checkId: "electrical-blocks-close",
    world: () => world([LIGHT], [ob("OB-EL", LIGHT.id, LIGHT_SVC)]),
    drive: (build, w) => build(w.ports(), visit("V-6", [lightTest({ certificate_ref: undefined })], { register: [regRow(LIGHT, true)] })),
    holds: (w) => {
      const closes = callsTo(w, "evidence", (c) => c.request && "close" in c.request);
      const refused = escalations(w, "close.refused");
      return (
        closes.length === 1 &&
        closes[0].response?.ok === false &&
        w.records.length === 1 &&
        w.records[0].closed !== true &&
        refused.length === 1 &&
        named(refused[0]) &&
        reportHeld(w, "V-6") &&
        rendered(w).length === 0
      );
    },
    describe: (w) =>
      `${callsTo(w, "evidence", (c) => c.request && "close" in c.request).map((c) => (c.response?.ok ? "closed" : "refused")).join(", ") || "no close attempted"}`,
  },
  {
    checkId: "defects-coded",
    world: () => world([EXT], [ob("OB-FE", EXT.id, EXT_SVC)]),
    drive: (build, w) =>
      build(
        w.ports(),
        visit("V-7", [extTest({ result: "defect", defect: { note: "Gauge needle sitting low and the pin looks bent, might need swapping out next time we are there" } })], {
          register: [regRow(EXT)],
        }),
      ),
    holds: (w) => {
      const held = escalations(w, "defect.uncoded");
      return (
        w.records.filter((r) => r.result === "defect").length === 0 &&
        w.records.every((r) => r.result !== "defect" || (r.defect?.code && r.defect?.owner)) &&
        held.length === 1 &&
        named(held[0]) &&
        reportHeld(w, "V-7")
      );
    },
    describe: (w) => `${w.records.length} record(s), ${escalations(w, "defect.uncoded").length} held as uncoded`,
  },
  {
    checkId: "isolation-has-revisit",
    world: () =>
      world(
        [HYD, { id: "A-HY-202", tag: "HY-202", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }],
        [ob("OB-HY", HYD.id, HYD_SVC), ob("OB-HY2", "A-HY-202", HYD_SVC)],
      ),
    drive: async (build, w) => {
      await build(
        w.ports(),
        visit(
          "V-8",
          [
            hydTest({ result: "isolated", isolation: { authorised_by: "Pat Nguyen (Fire Safety Advisor)", reason: "main valve leaking" } }),
            hydTest({ tag: "HY-202", obligation_id: "OB-HY2", result: "isolated", isolation: { authorised_by: "Pat Nguyen (Fire Safety Advisor)", reason: "pump room flooded", revisit_by: plusDays(3) } }),
          ],
          { register: [regRow(HYD), { asset_id: "A-HY-202", tag: "HY-202", asset_class: "system" }] },
        ),
      );
      w.advance(5 * DAY);
      await build(w.ports(), { event: "schedule.tick" });
      w.advance(1 * DAY);
      await build(w.ports(), { event: "schedule.tick" });
    },
    holds: (w) => {
      const lapsed = escalations(w, "isolation.lapsed");
      return (
        !w.isolations.some((i) => i.assetId === HYD.id) &&
        escalations(w, "isolation.no_revisit").some((d) => d.asset_id === HYD.id && named(d)) &&
        w.isolations.some((i) => i.assetId === "A-HY-202" && i.lapsedAt) &&
        lapsed.length === 2 &&
        lapsed.every((d) => d.asset_id === "A-HY-202" && named(d)) &&
        w.passCount === 0 &&
        reportHeld(w, "V-8")
      );
    },
    describe: (w) => `${w.isolations.length} isolation(s) stored, ${escalations(w, "isolation.lapsed").length} lapse escalation(s)`,
  },
  {
    checkId: "unbound-is-visible",
    world: () => world([EXT, DOOR], [ob("OB-FE", EXT.id, EXT_SVC), ob("OB-FD", DOOR.id, DOOR_SVC)]),
    drive: (build, w) =>
      build(w.ports(), visit("V-9", [extTest({ tag_photograph: false })], { register: [regRow(EXT), regRow(DOOR)], due_assets: [EXT.id, DOOR.id] })),
    holds: (w) => {
      const raised = escalations(w, "record.unbound");
      const missed = escalations(w, "asset.not_tested");
      return (
        w.unbound.length === 1 &&
        w.unbound[0].assetId === EXT.id &&
        typeof w.unbound[0].unboundSince === "string" &&
        w.passCount === 0 &&
        raised.length === 1 &&
        named(raised[0]) &&
        raised[0].queue === "unbound" &&
        typeof raised[0].unbound_since === "string" &&
        missed.length === 1 &&
        missed[0].asset_id === DOOR.id &&
        named(missed[0]) &&
        reportHeld(w, "V-9") &&
        rendered(w).length === 0
      );
    },
    describe: (w) => `${w.unbound.length} unbound, pass count ${w.passCount}, ${escalations(w, "asset.not_tested").length} due asset(s) untested`,
  },
  {
    checkId: "documents-from-the-record",
    world: () => world([EXT, HYD], [ob("OB-FE", EXT.id, EXT_SVC), ob("OB-HY", HYD.id, HYD_SVC)]),
    drive: async (build, w) => {
      await build(w.ports(), visit("V-10", [extTest(), hydTest()], { register: [regRow(EXT), regRow(HYD)], due_assets: [EXT.id, HYD.id] }));
      const hyd = w.records.find((r) => r.assetId === HYD.id);
      if (!hyd) return;
      w.correctRecord(hyd.id, "9.6");
      await build(w.ports(), {
        event: "job.updated",
        request: "compile_report",
        job: {
          job_id: "V-10",
          site: { site_id: "SITE-V-10", state: "QLD" },
          seam: { records: w.records.map((r) => ({ record_id: r.id, asset_id: r.assetId, obligation_type: r.assetId === HYD.id ? HYD_SVC : EXT_SVC })) },
        },
      });
    },
    holds: (w) => {
      const hyd = w.records.find((r) => r.assetId === HYD.id);
      if (!hyd) return false;
      const docs = rendered(w).filter((c) => c.request.document === hyd.id);
      const last = docs[docs.length - 1];
      return (
        docs.length === 2 &&
        typeof last?.response?.text === "string" &&
        last.response.text.includes("9.6") &&
        !last.response.text.includes("10.2") &&
        !reportHeld(w, "V-10")
      );
    },
    describe: (w) => rendered(w).map((c) => `${c.request.document}: ${c.response?.text}`).join(" | ") || "no document rendered",
  },
  {
    checkId: "jurisdiction-is-data",
    world: () =>
      world(
        [EXT, { id: "A-FE-V01", tag: "FE-V01", assetClass: "portable", jurisdiction: "VIC", hasBaseline: true }],
        [ob("OB-FE", EXT.id, EXT_SVC), ob("OB-FEV", "A-FE-V01", EXT_SVC)],
      ),
    drive: async (build, w) => {
      await build(w.ports(), visit("V-11Q", [extTest()], { register: [regRow(EXT)] }));
      await build(
        w.ports(),
        visit("V-11V", [extTest({ tag: "FE-V01", obligation_id: "OB-FEV" })], { state: "VIC", register: [{ asset_id: "A-FE-V01", tag: "FE-V01", asset_class: "portable" }] }),
      );
    },
    holds: (w) => {
      const reads = callsTo(w, "read_rule", (c) => c.request && "assetId" in c.request && c.response);
      const q = reads.find((c) => c.request.jurisdiction === "QLD");
      const v = reads.find((c) => c.request.jurisdiction === "VIC");
      return (
        Boolean(q && v) &&
        q.response.retentionYears !== v.response.retentionYears &&
        q.response.attestedBy !== v.response.attestedBy
      );
    },
    describe: (w) =>
      callsTo(w, "read_rule").map((c) => `${c.request?.jurisdiction}: ${JSON.stringify(c.response)}`).join(" | ") || "no rule read",
  },
];

// Check 12 runs only against a live register. On the stub the runner reports
// it as with_us: the binding layer on the business's own register is a scoped
// build, and this node does not write it.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FireWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

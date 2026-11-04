/**
 * One scenario per check of fire-service-pack-standard, for Safety Cert Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init fire-service-pack-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Each scenario drives the build the way production wakes it: a smoke alarm
 * and RCD job marked complete in the job system (job.completed), a request to
 * redraft the pack (job.updated), or a schedule.tick. Every `holds` reads the
 * recorded port trace (world.calls) and what the register recorded through its
 * ports, never the build's return value.
 *
 * Every `holds` asks for the build's own behaviour as well as the register's:
 * the register refuses some bad writes by itself, so a check that only looked
 * at the register would pass a build that never held anything.
 *
 * The jurisdiction rows are FIXTURE values for the stub, shaped like the
 * standard's section 7 (retention and who attests differ by state). They are
 * not legal advice; a live build stores the checked, dated, cited values.
 */

import { FireWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z");
const plusDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const SMOKE = "smoke-alarm-test";
const RCD = "rcd-push-and-time-test";
const VISUAL = "switchboard-visual";

const rule = (obligationType, jurisdiction, retentionYears, attestedBy) => ({
  obligationType,
  jurisdiction,
  version: `fixture-${jurisdiction}-2026-09-18`,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  intervalMonths: 12,
  retentionYears,
  attestedBy,
});
const RULES = [SMOKE, RCD, VISUAL].flatMap((t) => [
  rule(t, "QLD", 5, "the licensed electrician who tested (Qld fixture)"),
  rule(t, "VIC", 7, "the owner's nominated registered electrician (Vic fixture)"),
  rule(t, "NSW", 6, "the licensed electrician who tested (NSW fixture)"),
]);

const ob = (id, assetId, obligationType) => ({ id, assetId, obligationType, anchorDate: "2025-09-21T00:00:00.000Z" });

/** A hallway smoke alarm (portable), a switchboard RCD (system with readings), a meter box enclosure (passive). */
const ALARM = { id: "A-SA-01", tag: "SA-1001", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true };
const RCD1 = { id: "A-RCD-01", tag: "RC-2001", assetClass: "system", jurisdiction: "QLD", hasBaseline: true };
const BOX = { id: "A-SB-01", tag: "SB-3001", assetClass: "passive", jurisdiction: "QLD", hasBaseline: true };

const world = (assets, obligations) => new FireWorld({ now: NOW, assets, rules: RULES, obligations });

const job = (job_id, tests, seam = {}) => ({
  event: "job.completed",
  job: { job_id, property: { state: "QLD" }, tests, seam },
});

/** A complete, bound smoke alarm test. */
const alarmTest = (over = {}) => ({
  kind: "smoke_alarm",
  tag: ALARM.tag,
  obligation_id: "OB-SA",
  result: "pass",
  evidence: { kind: "image", value: "servicem8:att-alarm-in-place" },
  tag_photograph: true,
  baseline_seen: true,
  ...over,
});

/** A complete, bound RCD test: trip time in ms as a number, with the test sheet. */
const rcdTest = (over = {}) => ({
  kind: "rcd",
  tag: RCD1.tag,
  obligation_id: "OB-RCD",
  result: "pass",
  evidence: { kind: "reading", value: "22" },
  readings_within_range: true,
  tag_photograph: true,
  baseline_seen: true,
  certificate_ref: "servicem8:att-test-sheet",
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
const packHeld = (w, jobId) => escalations(w, "pack.held").some((d) => d.job_id === jobId && named(d));
const rendered = (w) => callsTo(w, "evidence", (c) => c.request && "document" in c.request);

export const scenarios = [
  {
    checkId: "identity-first",
    // 1. Three alarms on one job: a known tag, a tag that matches nothing, a
    //    tag two alarms share. Only the first may produce a record.
    world: () =>
      world(
        [
          ALARM,
          { id: "A-SA-02", tag: "SA-2002", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true },
          { id: "A-SA-03", tag: "SA-2002", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true },
        ],
        [ob("OB-SA", "A-SA-01", SMOKE), ob("OB-SA2", "A-SA-02", SMOKE), ob("OB-SA3", "A-SA-03", SMOKE)],
      ),
    drive: (build, w) =>
      build(w.ports(), job("JOB-1", [alarmTest(), alarmTest({ tag: "SA-9999", obligation_id: "OB-SA2" }), alarmTest({ tag: "SA-2002", obligation_id: "OB-SA2" })])),
    holds: (w) => {
      const stores = storeCalls(w);
      const unresolved = escalations(w, "asset.unresolved");
      return (
        stores.length === 1 &&
        stores[0].request.assetId === "A-SA-01" &&
        storedOk(w).length === 1 &&
        w.findings.length === 2 &&
        unresolved.length === 2 &&
        unresolved.every(named) &&
        packHeld(w, "JOB-1")
      );
    },
    describe: (w) => `${storeCalls(w).length} store call(s), ${w.findings.length} finding(s), ${escalations(w, "asset.unresolved").length} unresolved raised`,
  },
  {
    checkId: "discharges-an-obligation",
    // 2. An RCD carrying two live obligations, and a test that names neither.
    world: () => world([RCD1], [ob("OB-RCD", "A-RCD-01", RCD), ob("OB-RCD-B", "A-RCD-01", "rcd-portable-check")]),
    drive: (build, w) => build(w.ports(), job("JOB-2", [rcdTest({ obligation_id: undefined })])),
    holds: (w) => {
      const held = escalations(w, "record.no_obligation");
      return (
        storeCalls(w).length === 0 &&
        w.records.length === 0 &&
        w.passCount === 0 &&
        held.length === 1 &&
        named(held[0]) &&
        held[0].live.length === 2 &&
        packHeld(w, "JOB-2")
      );
    },
    describe: (w) => `${storeCalls(w).length} store call(s), ${escalations(w, "record.no_obligation").length} held for the obligation`,
  },
  {
    checkId: "result-recorded-not-computed",
    // 3. The RCD tripped in 22 ms, well within range, but the electrician
    //    recorded a coded defect (cracked test button). A second RCD test has
    //    no result at all. The first stores as the defect; the second is held,
    //    never filled in from its reading.
    world: () =>
      world(
        [RCD1, { id: "A-RCD-02", tag: "RC-2002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }],
        [ob("OB-RCD", "A-RCD-01", RCD), ob("OB-RCD2", "A-RCD-02", RCD)],
      ),
    drive: (build, w) =>
      build(
        w.ports(),
        job("JOB-3", [
          rcdTest({ result: "defect", defect: { code: "D2", owner: "Jo Bloggs (licensed electrician)", note: "test button cracked" } }),
          rcdTest({ tag: "RC-2002", obligation_id: "OB-RCD2", result: undefined }),
        ]),
      ),
    holds: (w) => {
      const r1 = w.records.filter((r) => r.assetId === "A-RCD-01");
      const missing = escalations(w, "result.missing");
      return (
        r1.length === 1 &&
        r1[0].result === "defect" &&
        r1[0].defect?.code === "D2" &&
        storeCalls(w).every((c) => c.request.assetId === "A-RCD-01" && c.request.result === "defect") &&
        !w.records.some((r) => r.assetId === "A-RCD-02") &&
        missing.length === 1 &&
        named(missing[0]) &&
        missing[0].asset_id === "A-RCD-02" &&
        packHeld(w, "JOB-3")
      );
    },
    describe: (w) => `records: ${w.records.map((r) => `${r.assetId}=${r.result}`).join(", ") || "none"}; ${escalations(w, "result.missing").length} held for a missing result`,
  },
  {
    checkId: "evidence-per-class",
    // 4. A smoke alarm with only a typed note, an RCD whose trip time came in
    //    as a photo of the tester screen, and a meter box with a photo where a
    //    visual inspection was required. Each is held for its own class.
    world: () => world([ALARM, RCD1, BOX], [ob("OB-SA", "A-SA-01", SMOKE), ob("OB-RCD", "A-RCD-01", RCD), ob("OB-SB", "A-SB-01", VISUAL)]),
    drive: (build, w) =>
      build(
        w.ports(),
        job("JOB-4", [
          alarmTest({ evidence: { kind: "inspection", value: "alarm looked fine" } }),
          rcdTest({ evidence: { kind: "image", value: "servicem8:att-tester-screen" } }),
          { kind: "switchboard_visual", tag: BOX.tag, obligation_id: "OB-SB", result: "pass", evidence: { kind: "image", value: "servicem8:att-box" }, tag_photograph: true, baseline_seen: true },
        ]),
      ),
    holds: (w) => {
      const held = escalations(w, "evidence.wrong_for_class");
      const needs = Object.fromEntries(held.map((d) => [d.asset_id, d.needs]));
      return (
        w.records.length === 0 &&
        storedOk(w).length === 0 &&
        held.length === 3 &&
        held.every(named) &&
        needs["A-SA-01"] === "image" &&
        needs["A-RCD-01"] === "reading" &&
        needs["A-SB-01"] === "inspection" &&
        packHeld(w, "JOB-4")
      );
    },
    describe: (w) => `${w.records.length} record(s); held: ${escalations(w, "evidence.wrong_for_class").map((d) => `${d.asset_id} needs ${d.needs}`).join(", ") || "none"}`,
  },
  {
    checkId: "baseline-absence-reportable",
    // 5. An RCD with no commissioning trip time on file.
    world: () => world([{ ...RCD1, hasBaseline: false }], [ob("OB-RCD", "A-RCD-01", RCD)]),
    drive: (build, w) => build(w.ports(), job("JOB-5", [rcdTest({ baseline_seen: false })])),
    holds: (w) =>
      w.records.some((r) => r.assetId === "A-RCD-01") &&
      w.nonConformances.length === 1 &&
      w.nonConformances[0].assetId === "A-RCD-01" &&
      /baseline/.test(w.nonConformances[0].what),
    describe: (w) => `${w.nonConformances.length} non-conformance(s), ${w.records.length} record(s)`,
  },
  {
    checkId: "electrical-blocks-close",
    // 6. An RCD tested and passed, closed with no test sheet attached.
    world: () => world([RCD1], [ob("OB-RCD", "A-RCD-01", RCD)]),
    drive: (build, w) => build(w.ports(), job("JOB-6", [rcdTest({ certificate_ref: undefined })])),
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
        packHeld(w, "JOB-6") &&
        rendered(w).length === 0
      );
    },
    describe: (w) =>
      `${callsTo(w, "evidence", (c) => c.request && "close" in c.request).map((c) => (c.response?.ok ? "closed" : "refused")).join(", ") || "no close attempted"}`,
  },
  {
    checkId: "defects-coded",
    // 7. A smoke alarm defect written as a paragraph, no code, no owner.
    world: () => world([ALARM], [ob("OB-SA", "A-SA-01", SMOKE)]),
    drive: (build, w) =>
      build(w.ports(), job("JOB-7", [alarmTest({ result: "defect", defect: { note: "Alarm chirps every minute or so, probably battery or the unit is old, tenant says it has been like this a while" } })])),
    holds: (w) => {
      const held = escalations(w, "defect.uncoded");
      const storedDefects = w.records.filter((r) => r.result === "defect");
      return (
        storedDefects.length === 0 &&
        w.records.every((r) => r.result !== "defect" || (r.defect?.code && r.defect?.owner)) &&
        held.length === 1 &&
        named(held[0]) &&
        packHeld(w, "JOB-7")
      );
    },
    describe: (w) => `${w.records.length} record(s), ${escalations(w, "defect.uncoded").length} held as uncoded`,
  },
  {
    checkId: "isolation-has-revisit",
    // 8. One RCD circuit isolated with no revisit date; a second isolated with
    //    a revisit in three days. The clock moves five days and the schedule
    //    runs twice: the lapsed isolation escalates both times.
    world: () =>
      world(
        [RCD1, { id: "A-RCD-02", tag: "RC-2002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }],
        [ob("OB-RCD", "A-RCD-01", RCD), ob("OB-RCD2", "A-RCD-02", RCD)],
      ),
    drive: async (build, w) => {
      await build(
        w.ports(),
        job("JOB-8", [
          rcdTest({ result: "isolated", isolation: { authorised_by: "Jo Bloggs (licensed electrician)", reason: "nuisance tripping" } }),
          rcdTest({ tag: "RC-2002", obligation_id: "OB-RCD2", result: "isolated", isolation: { authorised_by: "Jo Bloggs (licensed electrician)", reason: "water in GPO", revisit_by: plusDays(3) } }),
        ]),
      );
      w.advance(5 * DAY);
      await build(w.ports(), { event: "schedule.tick" });
      w.advance(1 * DAY);
      await build(w.ports(), { event: "schedule.tick" });
    },
    holds: (w) => {
      const lapsed = escalations(w, "isolation.lapsed");
      return (
        !w.isolations.some((i) => i.assetId === "A-RCD-01") &&
        escalations(w, "isolation.no_revisit").some((d) => d.asset_id === "A-RCD-01" && named(d)) &&
        w.isolations.some((i) => i.assetId === "A-RCD-02" && i.lapsedAt) &&
        lapsed.length === 2 &&
        lapsed.every((d) => d.asset_id === "A-RCD-02" && named(d)) &&
        w.passCount === 0 &&
        packHeld(w, "JOB-8")
      );
    },
    describe: (w) => `${w.isolations.length} isolation(s) stored, ${escalations(w, "isolation.lapsed").length} lapse escalation(s)`,
  },
  {
    checkId: "unbound-is-visible",
    // 9. A smoke alarm tested and passed, job marked complete, tag photo missing.
    world: () => world([ALARM], [ob("OB-SA", "A-SA-01", SMOKE)]),
    drive: (build, w) => build(w.ports(), job("JOB-9", [alarmTest({ tag_photograph: false })])),
    holds: (w) => {
      const raised = escalations(w, "record.unbound");
      return (
        w.unbound.length === 1 &&
        typeof w.unbound[0].unboundSince === "string" &&
        w.passCount === 0 &&
        raised.length === 1 &&
        named(raised[0]) &&
        raised[0].queue === "unbound" &&
        typeof raised[0].unbound_since === "string" &&
        packHeld(w, "JOB-9") &&
        rendered(w).length === 0
      );
    },
    describe: (w) => `${w.unbound.length} unbound, pass count ${w.passCount}`,
  },
  {
    checkId: "documents-from-the-record",
    // 10. A clean job drafts the pack. The RCD trip time is then corrected on
    //     the record (22 ms keyed in, 18 ms on the test sheet), and the pack is
    //     asked for again: it must carry 18.
    world: () => world([ALARM, RCD1], [ob("OB-SA", "A-SA-01", SMOKE), ob("OB-RCD", "A-RCD-01", RCD)]),
    drive: async (build, w) => {
      await build(w.ports(), job("JOB-10", [alarmTest(), rcdTest()]));
      const rcdRec = w.records.find((r) => r.assetId === "A-RCD-01");
      if (!rcdRec) return;
      w.correctRecord(rcdRec.id, "18");
      await build(w.ports(), {
        event: "job.updated",
        request: "draft_pack",
        job: {
          job_id: "JOB-10",
          seam: { records: w.records.map((r) => ({ record_id: r.id, asset_id: r.assetId, obligation_type: r.assetId === "A-RCD-01" ? RCD : SMOKE })) },
        },
      });
    },
    holds: (w) => {
      const rcdRec = w.records.find((r) => r.assetId === "A-RCD-01");
      if (!rcdRec) return false;
      const docs = rendered(w).filter((c) => c.request.document === rcdRec.id);
      const last = docs[docs.length - 1];
      return (
        docs.length === 2 &&
        typeof last?.response?.text === "string" &&
        last.response.text.includes("18") &&
        !last.response.text.includes("22") &&
        !packHeld(w, "JOB-10")
      );
    },
    describe: (w) => rendered(w).map((c) => `${c.request.document}: ${c.response?.text}`).join(" | ") || "no document rendered",
  },
  {
    checkId: "jurisdiction-is-data",
    // 11. The same model of RCD on two rentals, one in Queensland, one in
    //     Victoria. Each pack reads retention and who may attest for its state.
    world: () =>
      world(
        [RCD1, { id: "A-RCD-V1", tag: "RC-7001", assetClass: "system", jurisdiction: "VIC", hasBaseline: true }],
        [ob("OB-RCD", "A-RCD-01", RCD), ob("OB-RCDV", "A-RCD-V1", RCD)],
      ),
    drive: async (build, w) => {
      await build(w.ports(), job("JOB-11Q", [rcdTest()]));
      await build(w.ports(), job("JOB-11V", [rcdTest({ tag: "RC-7001", obligation_id: "OB-RCDV" })]));
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

// 12 runs only against a live register, as the standard says. On the stub the
// runner reports it with_us. There is no production run for this standard yet,
// so this is kept as the scaffold left it.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FireWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

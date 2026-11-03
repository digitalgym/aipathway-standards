/**
 * One scenario per check of fire-service-pack-standard, for Defect Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init fire-service-pack-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Each scenario drives the build the way production wakes it: one parsed
 * inspection report email (email.received), a schedule.tick, or a request for
 * the client-facing notice. Every `holds` reads the world's recorded trace
 * (world.calls, and what the register recorded through its ports), never the
 * build's own return value.
 *
 * The jurisdiction rows below are FIXTURE values for the stub, shaped like the
 * standard's section 7 (who attests differs by state). They are not legal
 * advice; a live build stores the checked, dated, cited values.
 */

import { FireWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z");
const plusDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const OB_TYPE = "sprinkler-6-monthly";

const RULES = [
  { obligationType: OB_TYPE, jurisdiction: "QLD", version: "fixture-QLD-2026-09-18", effectiveFrom: "2026-01-01T00:00:00.000Z", intervalMonths: 6, retentionYears: 5, attestedBy: "the occupier (occupier's statement)" },
  { obligationType: OB_TYPE, jurisdiction: "VIC", version: "fixture-VIC-2026-09-18", effectiveFrom: "2026-01-01T00:00:00.000Z", intervalMonths: 6, retentionYears: 10, attestedBy: "the owner (annual essential safety measures report)" },
  { obligationType: OB_TYPE, jurisdiction: "NSW", version: "fixture-NSW-2026-09-18", effectiveFrom: "2026-01-01T00:00:00.000Z", intervalMonths: 6, retentionYears: 7, attestedBy: "an accredited practitioner (fire safety)" },
];

const ob = (id, assetId) => ({ id, assetId, obligationType: OB_TYPE, anchorDate: "2026-03-21T00:00:00.000Z" });

/** A sprinkler valve set: a system with readings, in Queensland. */
const VALVE = { id: "A-VS-01", tag: "QF-1001", assetClass: "system", jurisdiction: "QLD", hasBaseline: true };

const world = (assets, obligations) => new FireWorld({ now: NOW, assets, rules: RULES, obligations });

const email = (id, items) => ({ event: "email.received", message: { message_id: id, items } });

/** A complete, bound line on a system with readings. */
const line = (over = {}) => ({
  tag: VALVE.tag,
  asset_label: "Main valve set, plant room",
  obligation_id: "OB-1",
  result: "pass",
  evidence: { kind: "reading", value: "main drain 0.72 MPa" },
  readings_within_range: true,
  baseline_seen: true,
  attachments: [{ kind: "tag", ref: "gmail:att-1" }, { kind: "location", ref: "gmail:att-2" }],
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
const storeCalls = (w) => callsTo(w, "record_service", (c) => c.request && "assetId" in c.request);
const named = (d) => typeof d.exception_owner === "string" && d.exception_owner.length > 0;

export const scenarios = [
  {
    checkId: "identity-first",
    // 1. Three lines: a known tag, a tag that matches nothing, a tag shared by
    //    two assets. Each email body also carries a free-text asset label that
    //    looks like an asset id, which a name-matching build would trust.
    world: () =>
      world(
        [
          VALVE,
          { id: "A-HR-01", tag: "QF-2002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true },
          { id: "A-HR-02", tag: "QF-2002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true },
        ],
        [ob("OB-1", "A-VS-01"), ob("OB-2", "A-HR-01"), ob("OB-3", "A-HR-02")],
      ),
    drive: (b, w) =>
      b(
        w.ports(),
        email("msg-101", [
          line(),
          line({ tag: "QF-9999", asset_label: "A-HR-01", obligation_id: "OB-2" }),
          line({ tag: "QF-2002", asset_label: "A-HR-02", obligation_id: "OB-3" }),
        ]),
      ),
    holds: (w) => {
      const recorded = w.records.map((r) => r.assetId);
      const writes = storeCalls(w).map((c) => c.request.assetId);
      const held = escalations(w, "identity.unresolved").filter(named);
      return (
        recorded.length === 1 &&
        recorded[0] === "A-VS-01" &&
        writes.length === 1 &&
        w.findings.length === 2 &&
        held.length === 2
      );
    },
    describe: (w) => `records ${w.records.map((r) => r.assetId).join(",") || "none"}; findings ${w.findings.length}; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "discharges-an-obligation",
    // 2. A valve set with two live obligations, and a report line naming neither.
    world: () => world([VALVE], [ob("OB-1", "A-VS-01"), { ...ob("OB-1Y", "A-VS-01"), obligationType: "sprinkler-yearly" }]),
    drive: (b, w) => b(w.ports(), email("msg-201", [line({ obligation_id: undefined })])),
    holds: (w) => {
      const held = escalations(w, "record.no_obligation").filter(named);
      const nullStored = storeCalls(w).some((c) => !c.request.obligationId);
      return w.records.length === 0 && w.passCount === 0 && !nullStored && held.length === 1;
    },
    describe: (w) => `records ${w.records.length}; pass count ${w.passCount}; held ${escalations(w, "record.no_obligation").length}`,
  },
  {
    checkId: "result-recorded-not-computed",
    // 3. Every reading within range, but the technician recorded a defect.
    world: () => world([VALVE], [ob("OB-1", "A-VS-01")]),
    drive: (b, w) =>
      b(
        w.ports(),
        email("msg-301", [
          line({
            result: "defect",
            readings_within_range: true,
            defect: { code: "D2", owner: "Rectification Lead", severity: "non_critical", note: "Valve chain lock missing" },
          }),
        ]),
      ),
    holds: (w) => {
      const rec = w.records.find((r) => r.assetId === "A-VS-01");
      const sent = storeCalls(w).map((c) => c.request.result);
      return w.records.length === 1 && rec?.result === "defect" && sent.length === 1 && sent[0] === "defect" && w.passCount === 0;
    },
    describe: (w) => `stored ${w.records.map((r) => r.result).join(",") || "nothing"}`,
  },
  {
    checkId: "evidence-per-class",
    // 4. A portable extinguisher with a reading, a sprinkler system whose
    //    reading came as a photo of the gauge, a fire door with a reading.
    world: () =>
      world(
        [
          { id: "A-EX-01", tag: "QF-3001", assetClass: "portable", jurisdiction: "QLD", hasBaseline: true },
          { id: "A-SP-01", tag: "QF-3002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true },
          { id: "A-FD-01", tag: "QF-3003", assetClass: "passive", jurisdiction: "QLD", hasBaseline: true },
        ],
        [ob("OB-41", "A-EX-01"), ob("OB-42", "A-SP-01"), ob("OB-43", "A-FD-01")],
      ),
    drive: (b, w) =>
      b(
        w.ports(),
        email("msg-401", [
          line({ tag: "QF-3001", obligation_id: "OB-41", evidence: { kind: "reading", value: "1.2 MPa" } }),
          line({ tag: "QF-3002", obligation_id: "OB-42", evidence: { kind: "image", value: "gmail:gauge-photo.jpg" } }),
          line({ tag: "QF-3003", obligation_id: "OB-43", evidence: { kind: "reading", value: "gap 3mm" } }),
        ]),
      ),
    holds: (w) => {
      const heldFor = (cls) => w.refusals.some((r) => r.startsWith(`held: ${cls} needs`));
      const imageAsReading = storeCalls(w).some((c) => c.request.assetId === "A-SP-01" && c.response?.id);
      const toPerson = escalations(w, "record.held").filter(named).map((d) => d.asset_id).sort();
      return (
        w.records.length === 0 &&
        heldFor("portable") &&
        heldFor("system") &&
        heldFor("passive") &&
        !imageAsReading &&
        toPerson.join(",") === "A-EX-01,A-FD-01,A-SP-01"
      );
    },
    describe: (w) => `records ${w.records.length}; refusals ${w.refusals.join(" | ") || "none"}`,
  },
  {
    checkId: "baseline-absence-reportable",
    // 5. The technician records that no baseline was on file for this valve set.
    world: () => world([{ ...VALVE, hasBaseline: false }], [ob("OB-1", "A-VS-01")]),
    drive: (b, w) => b(w.ports(), email("msg-501", [line({ baseline_seen: false })])),
    holds: (w) =>
      w.nonConformances.length === 1 &&
      w.nonConformances[0].assetId === "A-VS-01" &&
      /baseline/.test(w.nonConformances[0].what) &&
      callsTo(w, "evidence", (c) => c.request?.baselineAbsent === "A-VS-01").length === 1,
    describe: (w) => `non-conformances ${JSON.stringify(w.nonConformances)}`,
  },
  {
    checkId: "electrical-blocks-close",
    // 6. A pump controller job with electrical work, closed with no certificate.
    world: () => world([VALVE], [ob("OB-1", "A-VS-01")]),
    drive: (b, w) => b(w.ports(), email("msg-601", [line({ electrical: true, close: true })])),
    holds: (w) => {
      const closes = callsTo(w, "evidence", (c) => c.request && "close" in c.request);
      const refused = closes.filter((c) => c.response?.ok === false && /certificate/.test(c.response.why ?? ""));
      const rec = w.records[0];
      return w.records.length === 1 && closes.length === 1 && refused.length === 1 && rec?.closed !== true && escalations(w, "close.refused").filter(named).length === 1;
    },
    describe: (w) => `close calls ${callsTo(w, "evidence", (c) => c.request && "close" in c.request).map((c) => JSON.stringify(c.response)).join(",") || "none"}`,
  },
  {
    checkId: "defects-coded",
    // 7. A defect written as a paragraph, with no code and no owner, beside a
    //    properly coded one.
    world: () => world([VALVE, { id: "A-VS-02", tag: "QF-1002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }], [ob("OB-1", "A-VS-01"), ob("OB-2", "A-VS-02")]),
    drive: (b, w) =>
      b(
        w.ports(),
        email("msg-701", [
          line({ result: "defect", defect: { severity: "non_critical", note: "Some heads on level 3 look painted over and the gauge seems a bit off, should get someone to look." } }),
          line({ tag: "QF-1002", obligation_id: "OB-2", result: "defect", defect: { code: "D3", owner: "Rectification Lead", severity: "non_critical", note: "Painted sprinkler heads, level 3" } }),
        ]),
      ),
    holds: (w) => {
      const defects = w.records.filter((r) => r.result === "defect");
      const allCoded = defects.every((r) => typeof r.defect?.code === "string" && typeof r.defect?.owner === "string" && r.defect.owner.length > 0);
      const paragraphHeld = escalations(w, "record.held").filter((d) => named(d) && d.asset_id === "A-VS-01").length === 1;
      return defects.length === 1 && defects[0].assetId === "A-VS-02" && allCoded && paragraphHeld;
    },
    describe: (w) => `stored defects ${w.records.filter((r) => r.result === "defect").map((r) => `${r.assetId}:${r.defect?.code}`).join(",") || "none"}`,
  },
  {
    checkId: "isolation-has-revisit",
    // 8. Two impaired sprinkler systems isolated: one with no revisit date, one
    //    due back in two days. The clock moves past it and the sweep runs twice.
    world: () => world([VALVE, { id: "A-VS-02", tag: "QF-1002", assetClass: "system", jurisdiction: "QLD", hasBaseline: true }], [ob("OB-1", "A-VS-01"), ob("OB-2", "A-VS-02")]),
    drive: async (b, w) => {
      await b(
        w.ports(),
        email("msg-801", [
          line({ result: "isolated", isolation: { authorised_by: "Site Manager", reason: "valve leaking" } }),
          line({ tag: "QF-1002", obligation_id: "OB-2", result: "isolated", isolation: { authorised_by: "Site Manager", reason: "pump fault", revisit_by: plusDays(2) } }),
        ]),
      );
      await b(w.ports(), { event: "schedule.tick" });
      w.advance(3 * DAY);
      await b(w.ports(), { event: "schedule.tick" });
      w.advance(1 * DAY);
      await b(w.ports(), { event: "schedule.tick" });
    },
    holds: (w) => {
      const first = callsTo(w, "record_service", (c) => c.request?.isolation === "A-VS-01");
      const second = callsTo(w, "record_service", (c) => c.request?.isolation === "A-VS-02");
      const sweeps = callsTo(w, "escalate", (c) => c.request?.sweepIsolations === true).map((c) => c.response?.lapsed ?? []);
      const lapsedEsc = escalations(w, "isolation.lapsed").filter((d) => named(d) && d.asset_id === "A-VS-02");
      return (
        first.length === 1 &&
        first[0].response?.accepted === false &&
        second.length === 1 &&
        second[0].response?.accepted === true &&
        sweeps.length === 3 &&
        sweeps[0].length === 0 &&
        sweeps[1].includes("A-VS-02") &&
        sweeps[2].includes("A-VS-02") &&
        lapsedEsc.length === 2
      );
    },
    describe: (w) => `sweeps ${callsTo(w, "escalate", (c) => c.request?.sweepIsolations === true).map((c) => JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "unbound-is-visible",
    // 9. A pass recorded with the tag photograph missing from the email.
    world: () => world([VALVE], [ob("OB-1", "A-VS-01")]),
    drive: (b, w) => b(w.ports(), email("msg-901", [line({ attachments: [{ kind: "location", ref: "gmail:att-2" }] })])),
    holds: (w) => {
      const u = w.unbound;
      return w.records.length === 1 && u.length === 1 && typeof u[0].unboundSince === "string" && w.passCount === 0 && escalations(w, "record.unbound").filter(named).length === 1;
    },
    describe: (w) => `unbound ${w.unbound.length}; pass count ${w.passCount}`,
  },
  {
    checkId: "documents-from-the-record",
    // 10. A defect is recorded, the reading is corrected on the record, then the
    //     client-facing notice is requested.
    world: () => world([VALVE], [ob("OB-1", "A-VS-01")]),
    drive: async (b, w) => {
      await b(w.ports(), email("msg-1001", [line({ result: "defect", evidence: { kind: "reading", value: "main drain 0.40 MPa" }, defect: { code: "D1", owner: "Rectification Lead", severity: "critical", note: "Low main drain pressure" } })]));
      const id = w.records[0]?.id;
      if (id) w.correctRecord(id, "main drain 0.45 MPa");
      await b(w.ports(), { event: "document.requested", recordId: id, assetId: "A-VS-01", obligationType: OB_TYPE });
    },
    holds: (w) => {
      const id = w.records[0]?.id;
      const docs = callsTo(w, "evidence", (c) => c.request && "document" in c.request && c.request.document === id);
      const last = docs[docs.length - 1];
      return Boolean(id) && docs.length >= 1 && typeof last.response?.text === "string" && last.response.text.includes("0.45 MPa") && !last.response.text.includes("0.40 MPa");
    },
    describe: (w) => `documents ${callsTo(w, "evidence", (c) => c.request && "document" in c.request).map((c) => c.response?.text).join(" | ") || "none"}`,
  },
  {
    checkId: "jurisdiction-is-data",
    // 11. The same valve-set model and obligation, one at a Queensland site and
    //     one at a Victorian site, each notice requested.
    world: () => world([VALVE, { id: "A-VS-V1", tag: "VF-1001", assetClass: "system", jurisdiction: "VIC", hasBaseline: true }], [ob("OB-1", "A-VS-01"), ob("OB-V1", "A-VS-V1")]),
    drive: async (b, w) => {
      await b(w.ports(), email("msg-1101", [line(), line({ tag: "VF-1001", obligation_id: "OB-V1" })]));
      for (const r of w.records) {
        await b(w.ports(), { event: "document.requested", recordId: r.id, assetId: r.assetId, obligationType: OB_TYPE });
      }
    },
    holds: (w) => {
      const rule = (j) => callsTo(w, "read_rule", (c) => c.request?.jurisdiction === j).map((c) => c.response)[0];
      const q = rule("QLD");
      const v = rule("VIC");
      return Boolean(q && v) && q.retentionYears !== v.retentionYears && q.attestedBy !== v.attestedBy;
    },
    describe: (w) => `rules read ${callsTo(w, "read_rule").map((c) => `${c.request?.jurisdiction}:${JSON.stringify(c.response)}`).join(" ") || "none"}`,
  },
];

// Check 12 needs a live register and the person who attests. It is quoted as a
// scoped build, so it stays with_us on the stub and is not written here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FireWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

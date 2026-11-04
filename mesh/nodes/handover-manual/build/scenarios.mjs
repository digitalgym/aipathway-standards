/**
 * One scenario per check of rejected-pack-build-standard, for Handover Manual.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a Queensland residential builder and a new house at practical
 * completion: its installed assets, the trades' certificates and the job
 * records in the job folder. The rules below are the builder's own written
 * handover checklist, labelled as such and paraphrased from the Queensland
 * rules each line names. Every `holds` reads what the world recorded through
 * its ports, never the build's own memory, and returns a strict boolean.
 */

import { PackWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const inDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();
const R = (id, version, effectiveFrom, dueDays, text, supersededBy) => ({ id, version, effectiveFrom, dueDays, text, ...(supersededBy ? { supersededBy } : {}) });

const RULES = [
  R("hb.builder-licence", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after the QBCC Act 1991 (Qld): the builder's licence is current on the day the manual is released."),
  R("hb.final-inspection", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after the Building Regulation 2021 (Qld): the certifier's final inspection certificate is in the manual."),
  R("hb.warranty", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist: each installed asset's maker's warranty is in the manual, with the date it runs to."),
  R("hb.maintenance-instructions", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist: the maker's operating and maintenance instructions for each installed asset are in the manual."),
  R("hb.plumbing-compliance", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after the Plumbing and Drainage Act 2018 (Qld): the plumber's compliance certificate for a water heater install is in the manual."),
  R("hb.electrical-testing", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after the Electrical Safety Regulation 2013 (Qld): the electrician's certificate of testing and safety is in the manual."),
  R("hb.smoke-alarm-service", "2025-07", "2025-07-01T00:00:00.000Z", 365, "Our handover checklist, after the Fire and Emergency Services Act 1990 (Qld): smoke alarms are tested and cleaned within 12 months of install."),
  R("hb.termite-notice", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after AS 3660.1: where a termite management system is installed, its durable notice is in the manual."),
  R("hb.backflow-test", "2025-07", "2025-07-01T00:00:00.000Z", 365, "Our handover checklist: where a testable backflow prevention device is installed, its commissioning test report is in the manual."),
  R("hb.pool-safety", "2025-07", "2025-07-01T00:00:00.000Z", 0, "Our handover checklist, after the Building Regulation 2021 (Qld): where there is a pool, its pool safety certificate is in the manual."),
  R("hb.manual-due", "2025-07", "2025-07-01T00:00:00.000Z", 10, "Our procedure: the O&M manual goes to the client within 10 days of practical completion.", "2026-10"),
  R("hb.manual-due", "2026-10", "2026-10-01T00:00:00.000Z", 5, "Our procedure: the O&M manual goes to the client within 5 days of practical completion."),
];

const BUSINESS = {
  "biz:trading_name": "Coral Coast Homes",
  "biz:abn": "62 418 907 553",
  "biz:trading_address": "9 Shields Street, Cairns QLD 4870",
  "biz:builder_licence": "1294407",
  "biz:builder_licence:expires_on": inDays(300),
};

const PM = "Leah Brennan, project manager";
const SP = "https://coralcoast.sharepoint.com/sites/jobs";

/** One filed record on the job, as the document store holds it. */
const doc = (key, over = {}) => ({
  [`${key}:ref`]: `${SP}/${key.replace(/:/g, "-")}.pdf`,
  ...over,
});

/** A job at practical completion: three assets, every applicable record filed. */
function job(j, over = {}) {
  const n = `CCH-${j.slice(2)}`;
  const a = (id, k) => `${j}:a:${id}:${k}`;
  const d = (id, k) => `${j}:a:${id}:doc:${k}`;
  return {
    [`${j}:job_no`]: n,
    [`${j}:client`]: "Priya and Tom Achterberg",
    [`${j}:site_address`]: "41 Reef Street, Edge Hill QLD 4870",
    [`${j}:state`]: "QLD",
    [`${j}:practical_completion_on`]: inDays(-2),
    [`${j}:pm`]: PM,
    [`${j}:scope:termite_system`]: "yes",
    [`${j}:scope:backflow_device`]: "no",
    [`${j}:scope:pool`]: "no",
    [`${j}:asset_ids`]: "HWS-1,SA-1,SB-1",
    [a("HWS-1", "class")]: "hot_water",
    [a("HWS-1", "label")]: "heat pump water heater",
    [a("HWS-1", "make_model")]: "Aquatherm HP270",
    [a("HWS-1", "serial")]: "AQ27-55810",
    [a("HWS-1", "location")]: "north wall outside laundry",
    [a("HWS-1", "installed_on")]: "2026-09-05T00:00:00.000Z",
    [a("HWS-1", "warranty_years")]: "5",
    [a("HWS-1", "installer")]: "Mick Hollis Plumbing",
    [a("HWS-1", "installer_licence")]: "PL-88213",
    [a("HWS-1", "installer_licence_expires_on")]: inDays(200),
    [a("SA-1", "class")]: "smoke_alarms",
    [a("SA-1", "label")]: "interconnected photoelectric smoke alarms (6)",
    [a("SA-1", "make_model")]: "Brightguard PE240",
    [a("SA-1", "serial")]: "BG24-0091 to BG24-0096",
    [a("SA-1", "location")]: "every bedroom, hallway and living area",
    [a("SA-1", "installed_on")]: "2026-09-10T00:00:00.000Z",
    [a("SA-1", "warranty_years")]: "10",
    [a("SA-1", "installer")]: "Kurt Lam Electrical",
    [a("SA-1", "installer_licence")]: "EC-71402",
    [a("SA-1", "installer_licence_expires_on")]: inDays(400),
    [a("SB-1", "class")]: "switchboard",
    [a("SB-1", "label")]: "main switchboard with RCBOs",
    [a("SB-1", "make_model")]: "Voltline MSB-24",
    [a("SB-1", "serial")]: "VL-MSB-30417",
    [a("SB-1", "location")]: "garage east wall",
    [a("SB-1", "installed_on")]: "2026-09-10T00:00:00.000Z",
    [a("SB-1", "installer")]: "Kurt Lam Electrical",
    [a("SB-1", "installer_licence")]: "EC-71402",
    [a("SB-1", "installer_licence_expires_on")]: inDays(400),
    ...doc(d("HWS-1", "warranty"), { [`${d("HWS-1", "warranty")}:title`]: "Aquatherm warranty registration", [`${d("HWS-1", "warranty")}:number`]: "WR-6620194" }),
    ...doc(d("HWS-1", "instructions"), { [`${d("HWS-1", "instructions")}:title`]: "Aquatherm HP270 owner's guide" }),
    ...doc(d("HWS-1", "plumbing_cert"), { [`${d("HWS-1", "plumbing_cert")}:number`]: "PCC-40517", [`${d("HWS-1", "plumbing_cert")}:job_no`]: n, [`${d("HWS-1", "plumbing_cert")}:site_address`]: "41 Reef Street, Edge Hill QLD 4870" }),
    ...doc(d("SA-1", "warranty"), { [`${d("SA-1", "warranty")}:number`]: "BGW-113052" }),
    ...doc(d("SA-1", "instructions"), { [`${d("SA-1", "instructions")}:title`]: "Brightguard PE240 care and testing guide" }),
    ...doc(d("SA-1", "electrical_cert"), { [`${d("SA-1", "electrical_cert")}:number`]: "CTS-77310", [`${d("SA-1", "electrical_cert")}:job_no`]: n }),
    ...doc(d("SB-1", "instructions"), { [`${d("SB-1", "instructions")}:title`]: "Voltline MSB-24 schedule and RCBO test guide" }),
    ...doc(d("SB-1", "electrical_cert"), { [`${d("SB-1", "electrical_cert")}:number`]: "CTS-77311", [`${d("SB-1", "electrical_cert")}:job_no`]: n }),
    ...doc(`${j}:doc:final_cert`, { [`${j}:doc:final_cert:number`]: "FIC-2026-1842", [`${j}:doc:final_cert:job_no`]: n, [`${j}:doc:final_cert:builder_licence`]: "1294407" }),
    ...doc(`${j}:doc:termite_notice`, { [`${j}:doc:termite_notice:number`]: "TMS-55902" }),
    ...over,
  };
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
const world = (facts, packs) => new PackWorld({ rules: RULES, facts: clean({ ...BUSINESS, ...facts }), packs });
const one = (j, packId = `P-${j}`) => ({ jobs: [{ packId, jobId: j }] });
const releasedBy = (packId, person) => ({ releases: { [packId]: { person } } });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const STRICT = (x) => x === true;

export const scenarios = [
  {
    checkId: "one-graph",
    // 1. The builder moves office once, with the job's manual artefacts open.
    world: () => world(job("J-101"), [{ id: "P-J-101", subjectId: "J-101" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("J-101"), ...releasedBy("P-J-101", PM) });
      w.changeFact("biz:trading_address", "Level 2, 15 Lake Street, Cairns QLD 4870");
      await b(w.ports(), one("J-101")); // the next run re-reads; nothing is re-typed
    },
    holds: (w) => {
      const open = w.artefacts.filter((a) => a.packId === "P-J-101");
      const carrying = open.filter((a) => a.refs.includes("biz:trading_address") || a.literal !== undefined);
      if (carrying.length < 3) return false;
      const texts = carrying.map((a) => w.renderStored(a.id) ?? "");
      return STRICT(texts.every((t) => t.includes("15 Lake Street") && !t.includes("9 Shields Street")));
    },
    describe: (w) => `artefacts: ${w.artefacts.map((a) => `${a.id} -> ${w.renderStored(a.id)?.slice(0, 60)}`).join(" | ")}`,
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. The manual-due rule is superseded on 1 October; the clock passes it between runs.
    world: () => world(job("J-201"), [{ id: "P-J-201", subjectId: "J-201" }]),
    drive: async (b, w) => {
      await b(w.ports(), one("J-201"));
      w.advance(12 * DAY); // 3 October: the 2026-10 version is in force
      await b(w.ports(), one("J-201"));
    },
    holds: (w) => {
      const due = callsTo(w, "read_rule", (c) => c.request?.ruleId === "hb.manual-due").map((c) => c.response);
      if (due.length !== 2 || !due[0] || !due[1]) return false;
      const moved = due[0].version === "2025-07" && due[1].version === "2026-10" && (new Date(due[0].date) - new Date(due[1].date)) / DAY === 5;
      const listed = callsTo(w, "read_rule", (c) => c.request?.ruleId === undefined).every((c) => c.response?.rules === RULES.length);
      const cited = w.packById("P-J-201").clauses.some((c) => c.sourceRuleId === "hb.manual-due" && c.text.includes("2026-10") && c.text.includes(due[1].date.slice(0, 10)));
      return STRICT(moved && listed && cited);
    },
    describe: (w) => `manual due: ${callsTo(w, "read_rule", (c) => c.request?.ruleId === "hb.manual-due").map((c) => JSON.stringify(c.response)).join(" then ")}`,
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A house with no pool and no backflow device, but a termite system: two written noes, termite still required.
    world: () => world(job("J-301"), [{ id: "P-J-301", subjectId: "J-301" }]),
    drive: (b, w) => b(w.ports(), one("J-301")),
    holds: (w) => {
      const no = w.notApplicable.filter((n) => n.subjectId === "J-301");
      const pool = no.find((n) => /pool safety certificate/.test(n.reason) && /because/i.test(n.reason) && /hb\.pool-safety/.test(n.reason));
      const backflow = no.find((n) => /backflow/.test(n.reason) && /because/i.test(n.reason) && /hb\.backflow-test/.test(n.reason));
      const termiteStillRequired = !no.some((n) => /termite/i.test(n.reason));
      const pack = w.packById("P-J-301");
      return STRICT(no.length === 2 && Boolean(pool) && Boolean(backflow) && termiteStillRequired && pack.failedCheck === undefined);
    },
    describe: (w) => `written no: ${w.notApplicable.map((n) => n.reason).join(" / ") || "none"}; queue ${w.packById("P-J-301").queue}`,
  },
  {
    checkId: "eight-checks-in-order",
    // 4. The plumbing certificate on file is for another job (check 1), and the electrician's licence has lapsed too (check 2).
    world: () =>
      world(job("J-401", { "J-401:a:HWS-1:doc:plumbing_cert:job_no": "CCH-388", "J-401:a:SA-1:installer_licence_expires_on": inDays(-15) }), [{ id: "P-J-401", subjectId: "J-401" }]),
    drive: (b, w) => b(w.ports(), one("J-401")),
    holds: (w) => {
      const pack = w.packById("P-J-401");
      const checks = callsTo(w, "gate", (c) => c.request?.packId === "P-J-401" && c.request?.check).map((c) => c.request.check);
      const reasons = pack.history.length > 0 && pack.history.every((m) => typeof m.reason === "string" && m.reason.length > 0);
      const why = pack.history.some((m) => /CCH-388/.test(m.reason));
      return STRICT(pack.failedCheck === "identity" && pack.queue === "fail" && reasons && why && checks[0] === "identity" && !checks.includes("tickets"));
    },
    describe: (w) => `failed at ${w.packById("P-J-401").failedCheck}; history ${JSON.stringify(w.packById("P-J-401").history)}`,
  },
  {
    checkId: "four-queues",
    // 5. The termite notice and the smoke alarm certificate were never filed; the PM is ready to release; then a handover attempt.
    world: () =>
      world(job("J-501", { "J-501:doc:termite_notice:ref": undefined, "J-501:a:SA-1:doc:electrical_cert:ref": undefined }), [{ id: "P-J-501", subjectId: "J-501" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("J-501"), ...releasedBy("P-J-501", PM) });
      await b.handover(w.ports(), "P-J-501");
    },
    holds: (w) => {
      const pack = w.packById("P-J-501");
      const tried = w.handovers.filter((h) => h.packId === "P-J-501");
      // The missing list names both gaps, not just the first.
      const listed = pack.history.some((m) => /termite/i.test(m.reason) && /SA-1 certificate of testing/i.test(m.reason) && /2 missing/.test(m.reason));
      return STRICT(pack.queue === "fail" && pack.failedCheck === "completeness" && listed && tried.length > 0 && tried.every((h) => h.ok === false) && pack.handedOver !== true && !pack.versionRecord);
    },
    describe: (w) => `queue ${w.packById("P-J-501").queue} (${w.packById("P-J-501").failedCheck}); history ${JSON.stringify(w.packById("P-J-501").history)}; handovers ${JSON.stringify(w.handovers)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Two values read off a blurry scan at 0.5 and 0.7; another read clean at 0.97.
    world: () =>
      world(
        job("J-601", {
          "J-601:a:HWS-1:serial#confidence": "0.5",
          "J-601:a:SA-1:doc:electrical_cert:number#confidence": "0.7",
          "J-601:doc:final_cert:number#confidence": "0.97",
        }),
        [{ id: "P-J-601", subjectId: "J-601" }],
      ),
    drive: (b, w) => b(w.ports(), one("J-601")),
    holds: (w) => {
      const pack = w.packById("P-J-601");
      const marked = ["J-601:a:HWS-1:serial", "J-601:a:SA-1:doc:electrical_cert:number"].every((f) => pack.yellowFields.includes(f));
      return STRICT(marked && !pack.yellowFields.includes("J-601:doc:final_cert:number") && pack.queue === "yellow" && !pack.versionRecord && !pack.handedOver);
    },
    describe: (w) => `yellow ${JSON.stringify(w.packById("P-J-601").yellowFields)}; queue ${w.packById("P-J-601").queue}`,
  },
  {
    checkId: "named-human-gate",
    // 7. A Yellow manual: no release, then a release with no name, then the project manager's named release.
    world: () => world(job("J-701", { "J-701:a:HWS-1:serial#confidence": "0.6" }), [{ id: "P-J-701", subjectId: "J-701" }]),
    drive: async (b, w) => {
      const snap = () => ({ queue: w.packById("P-J-701").queue, record: w.packById("P-J-701").versionRecord ?? null });
      w.snaps = [];
      await b(w.ports(), one("J-701"));
      w.snaps.push(snap());
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", "") });
      w.snaps.push(snap());
      w.advance(60 * 60 * 1000);
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", PM) });
      w.snaps.push(snap());
    },
    holds: (w) => {
      const [none, unnamed, named] = w.snaps ?? [];
      if (!none || !unnamed || !named) return false;
      const held = none.queue === "yellow" && none.record === null && unnamed.queue === "yellow" && unnamed.record === null;
      const r = named.record;
      const recorded =
        named.queue === "pass" && r?.person === PM && typeof r.at === "string" && r.at === "2026-09-21T01:00:00.000Z" && r.accepted.includes("CCH-701") && r.accepted.includes("AQ27-55810");
      return STRICT(held && recorded);
    },
    describe: (w) => `states: ${JSON.stringify(w.snaps)}`,
  },
  {
    checkId: "as-of-and-citations",
    // 8. A manual with nine filed records, two written noes, warranty and service dates and a due date.
    world: () => world(job("J-801"), [{ id: "P-J-801", subjectId: "J-801" }]),
    drive: (b, w) => b(w.ports(), one("J-801")),
    holds: (w) => {
      const pack = w.packById("P-J-801");
      const ruleIds = new Set(RULES.map((r) => r.id));
      const each = ["hb.final-inspection", "hb.warranty", "hb.maintenance-instructions", "hb.plumbing-compliance", "hb.electrical-testing", "hb.termite-notice", "hb.pool-safety", "hb.backflow-test", "hb.smoke-alarm-service", "hb.manual-due"].every((id) =>
        pack.clauses.some((c) => c.sourceRuleId === id),
      );
      const service = pack.clauses.some((c) => c.sourceRuleId === "hb.smoke-alarm-service" && c.text.includes("2027-09-10"));
      const warranty = pack.clauses.some((c) => c.sourceRuleId === "hb.warranty" && c.text.includes("HWS-1") && c.text.includes("2031-09-05"));
      return STRICT(pack.clauses.length >= 12 && each && service && warranty && pack.clauses.every((c) => ruleIds.has(c.sourceRuleId)) && pack.asOf === NOW.toISOString());
    },
    describe: (w) => `clauses ${JSON.stringify(w.packById("P-J-801").clauses)}; as-of ${w.packById("P-J-801").asOf}`,
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. A released manual read cold by the client, who has no access to the builder's drive.
    world: () => world(job("J-901"), [{ id: "P-J-901", subjectId: "J-901" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-901"), ...releasedBy("P-J-901", PM) }),
    holds: (w) => {
      const pack = w.packById("P-J-901");
      const handed = w.handovers.filter((h) => h.packId === "P-J-901" && h.ok === true).length === 1;
      const art = w.artefacts.find((a) => a.id === "P-J-901:handover");
      const text = art ? w.renderStored(art.id) ?? "" : "";
      const inside = [
        "Coral Coast Homes", "1294407", "CCH-901", "41 Reef Street", "Aquatherm HP270", "AQ27-55810", "north wall outside laundry",
        "BG24-0091", "VL-MSB-30417", "PL-88213", "EC-71402", "PCC-40517", "CTS-77310", "CTS-77311", "FIC-2026-1842", "TMS-55902", "WR-6620194",
      ].every((s) => text.includes(s));
      const noInsiderLink = !/sharepoint|https?:|\\\\/i.test(text);
      return STRICT(handed && pack.handedOver === true && inside && noInsiderLink);
    },
    describe: (w) => `handover: ${w.renderStored("P-J-901:handover") ?? "none"}`,
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. Every string the build shows for a released, a yellow and a held job.
    world: () =>
      world(
        { ...job("J-111"), ...job("J-112", { "J-112:a:HWS-1:serial#confidence": "0.5" }), ...job("J-113", { "J-113:doc:final_cert:ref": undefined }) },
        [{ id: "P-J-111", subjectId: "J-111" }, { id: "P-J-112", subjectId: "J-112" }, { id: "P-J-113", subjectId: "J-113" }],
      ),
    drive: (b, w) =>
      b(w.ports(), {
        jobs: [{ packId: "P-J-111", jobId: "J-111" }, { packId: "P-J-112", jobId: "J-112" }, { packId: "P-J-113", jobId: "J-113" }],
        releases: { "P-J-111": { person: PM } },
      }),
    holds: (w) => {
      const pass = w.copy.filter((s) => /as of/i.test(s));
      const held = w.copy.filter((s) => /final inspection certificate/i.test(s));
      const claims = /complian|certified|meets (the )?(code|standard|ncc|bca)|passed inspection|approved|all clear|signed off|ready to occupy/i;
      return STRICT(pass.length >= 1 && held.length >= 1 && w.copy.length >= 3 && !w.copy.some((s) => claims.test(s)));
    },
    describe: (w) => `copy: ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A job processed end to end, released and handed over.
    world: () => world(job("J-121"), [{ id: "P-J-121", subjectId: "J-121" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-121"), ...releasedBy("P-J-121", PM) }),
    holds: (w) => {
      const done = w.packById("P-J-121").handedOver === true;
      const content = Object.values(job("J-121")).filter((x) => typeof x === "string" && x.length >= 4 && !/^\d+$/.test(x));
      const leaks = w.retained.some((r) => content.some((c) => r.content.includes(c)) || /train/i.test(r.what));
      return STRICT(done && w.retained.length > 0 && !leaks);
    },
    describe: (w) => `retained: ${JSON.stringify(w.retained)}`,
  },
  {
    checkId: "hard-step-is-named",
    // 12. Which step does this build treat as the binding layer?
    world: () => world(job("J-131"), [{ id: "P-J-131", subjectId: "J-131" }]),
    drive: (b, w) => b(w.ports(), one("J-131")),
    holds: (w) => STRICT(typeof w.hardStep === "string" && /binding layer/i.test(w.hardStep) && /one graph/i.test(w.hardStep)),
    describe: (w) => `hard step: ${w.hardStep ?? "not named"}`,
  },
];

// The pass test runs against the builder's live graph, as a scoped build.
// On the stub the runner reports it with_us; it is not attempted here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new PackWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

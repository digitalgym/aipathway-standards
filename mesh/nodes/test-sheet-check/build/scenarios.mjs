/**
 * One scenario per check of rejected-pack-build-standard, for Test Sheet Check.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a Queensland electrical contractor and the test result sheets
 * its electricians send in from site. The procedure rules below are the
 * business's own written test procedure, labelled as such and paraphrased; the
 * limits a build judges readings by come from these rules, never from code.
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict boolean.
 */

import { PackWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const inDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const RULES = [
  { id: "qld.esr-2013-testing", version: "2013", effectiveFrom: "2013-07-01T00:00:00.000Z", dueDays: 0, text: "Electrical Safety Regulation 2013 (Qld): electrical installation work is tested before it is energised, and a certificate of testing is given for it." },
  { id: "proc.insulation-resistance", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure, after AS/NZS 3000:2018 section 8: insulation resistance at least 1 megohm." },
  { id: "proc.earth-continuity", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure: main earthing conductor resistance not more than 0.5 ohm." },
  { id: "proc.polarity", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure: polarity recorded as correct at every point tested." },
  { id: "proc.circuit-connections", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure: correct circuit connections recorded as correct." },
  { id: "proc.fault-loop-impedance", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure: measured fault loop impedance not more than the maximum recorded for the protective device." },
  { id: "proc.rcd-trip-time", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our test procedure, after AS/NZS 3017: each RCD installed or altered trips within 300 ms at its rated residual current." },
  { id: "proc.meter-calibration", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 365, text: "Our test procedure: a test instrument is used only inside 12 months of its last calibration." },
  { id: "proc.certificate-due", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", supersededBy: "2026-10", dueDays: 5, text: "Our procedure: the certificate goes to the customer within 5 days of the job being completed." },
  { id: "proc.certificate-due", version: "2026-10", effectiveFrom: "2026-10-01T00:00:00.000Z", dueDays: 2, text: "Our procedure: the certificate goes to the customer within 2 days of the job being completed." },
];

const BUSINESS = {
  "biz:trading_name": "Tableland Electrical Services",
  "biz:abn": "47 615 290 318",
  "biz:trading_address": "4 Grove Street, Atherton QLD 4883",
  "biz:ec_licence": "84213",
  "biz:ec_licence:expires_on": inDays(400),
};

const ELECTRICIAN = "Dan Kowalski, licensed electrician";

/** A job in the graph, with the readings taken off its test sheet. */
function job(j, over = {}) {
  return {
    [`${j}:job_no`]: `TES-${j.slice(2)}`,
    [`${j}:customer`]: "Mareeba Veterinary Clinic",
    [`${j}:site_address`]: "17 Byrnes Street, Mareeba QLD 4880",
    [`${j}:state`]: "QLD",
    [`${j}:scope`]: "two new power circuits and an RCD added at the main switchboard",
    [`${j}:rcd_in_scope`]: "yes",
    [`${j}:completed_on`]: inDays(-1),
    [`${j}:tech:name`]: "Dan Kowalski",
    [`${j}:tech:licence_no`]: "EW-129847",
    [`${j}:tech:licence_expires_on`]: inDays(500),
    [`${j}:meter:serial`]: "MFT-1741-0093",
    [`${j}:meter:calibrated_on`]: inDays(-120),
    [`${j}:sheet:job_no`]: `TES-${j.slice(2)}`,
    [`${j}:sheet:ec_licence`]: "84213",
    [`${j}:sheet:evidence`]: "https://tableland.sharepoint.com/sites/jobs/TES/test-sheet.pdf",
    [`${j}:sheet:message_id`]: `msg-${j.slice(2)}-a19f`,
    [`${j}:t:insulation_mohm`]: "250",
    [`${j}:t:earth_ohm`]: "0.18",
    [`${j}:t:polarity`]: "correct",
    [`${j}:t:connections`]: "correct",
    [`${j}:t:fault_loop_ohm`]: "0.92",
    [`${j}:t:fault_loop_max_ohm`]: "1.46",
    [`${j}:t:rcd_ms`]: "22",
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
    // 1. The business moves premises once, with the job's artefacts open.
    world: () => world(job("J-101"), [{ id: "P-J-101", subjectId: "J-101" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("J-101"), ...releasedBy("P-J-101", ELECTRICIAN) });
      w.changeFact("biz:trading_address", "Unit 3, 22 Main Street, Atherton QLD 4883");
      await b(w.ports(), one("J-101")); // the next run re-reads; nothing is re-typed
    },
    holds: (w) => {
      const open = w.artefacts.filter((a) => a.packId === "P-J-101");
      const carrying = open.filter((a) => a.refs.includes("biz:trading_address") || a.literal !== undefined);
      if (carrying.length < 3) return false;
      const texts = carrying.map((a) => w.renderStored(a.id) ?? "");
      return STRICT(texts.every((t) => t.includes("22 Main Street") && !t.includes("4 Grove Street")));
    },
    describe: (w) => `artefacts: ${w.artefacts.map((a) => `${a.id} -> ${w.renderStored(a.id)?.slice(0, 60)}`).join(" | ")}`,
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. The certificate-due rule is superseded on 1 October; the clock passes it between runs.
    world: () => world(job("J-201"), [{ id: "P-J-201", subjectId: "J-201" }]),
    drive: async (b, w) => {
      await b(w.ports(), one("J-201"));
      w.advance(12 * DAY); // 3 October: the 2026-10 version is in force
      await b(w.ports(), one("J-201"));
    },
    holds: (w) => {
      const due = callsTo(w, "read_rule", (c) => c.request?.ruleId === "proc.certificate-due").map((c) => c.response);
      if (due.length !== 2 || !due[0] || !due[1]) return false;
      const moved = due[0].version === "2025-07" && due[1].version === "2026-10" && (new Date(due[0].date) - new Date(due[1].date)) / DAY === 3;
      const listed = callsTo(w, "read_rule", (c) => c.request?.ruleId === undefined).every((c) => c.response?.rules === RULES.length);
      const cited = w.packById("P-J-201").clauses.some((c) => c.sourceRuleId === "proc.certificate-due" && c.text.includes("2026-10") && c.text.includes(due[1].date.slice(0, 10)));
      return STRICT(moved && listed && cited);
    },
    describe: (w) => `certificate due: ${callsTo(w, "read_rule", (c) => c.request?.ruleId === "proc.certificate-due").map((c) => JSON.stringify(c.response)).join(" then ")}`,
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A lighting job with no RCD installed or altered: no RCD reading on the sheet, and none needed.
    world: () =>
      world(job("J-301", { "J-301:scope": "six downlights replaced on an existing lighting circuit", "J-301:rcd_in_scope": "no", "J-301:t:rcd_ms": undefined }), [
        { id: "P-J-301", subjectId: "J-301" },
      ]),
    drive: (b, w) => b(w.ports(), one("J-301")),
    holds: (w) => {
      const no = w.notApplicable.filter((n) => n.subjectId === "J-301");
      const rcd = no.find((n) => /RCD/.test(n.reason) && /because/i.test(n.reason) && /proc\.rcd-trip-time/.test(n.reason));
      const othersStillRequired = !no.some((n) => /insulation|earth|polarity|fault loop/i.test(n.reason));
      const pack = w.packById("P-J-301");
      return STRICT(no.length === 1 && Boolean(rcd) && othersStillRequired && pack.failedCheck === undefined);
    },
    describe: (w) => `written no: ${w.notApplicable.map((n) => n.reason).join(" / ") || "none"}; queue ${w.packById("P-J-301").queue}`,
  },
  {
    checkId: "eight-checks-in-order",
    // 4. A sheet carrying another job's number (check 1) with an expired electrician's licence too (check 2).
    world: () =>
      world(job("J-401", { "J-401:sheet:job_no": "TES-399", "J-401:tech:licence_expires_on": inDays(-20) }), [{ id: "P-J-401", subjectId: "J-401" }]),
    drive: (b, w) => b(w.ports(), one("J-401")),
    holds: (w) => {
      const pack = w.packById("P-J-401");
      const checks = callsTo(w, "gate", (c) => c.request?.packId === "P-J-401" && c.request?.check).map((c) => c.request.check);
      const reasons = pack.history.length > 0 && pack.history.every((m) => typeof m.reason === "string" && m.reason.length > 0);
      return STRICT(pack.failedCheck === "identity" && pack.queue === "fail" && reasons && checks[0] === "identity" && !checks.includes("tickets"));
    },
    describe: (w) => `failed at ${w.packById("P-J-401").failedCheck}; history ${JSON.stringify(w.packById("P-J-401").history)}`,
  },
  {
    checkId: "four-queues",
    // 5. Insulation resistance of 0.4 megohm, the electrician ready to release, then a handover attempt.
    world: () => world(job("J-501", { "J-501:t:insulation_mohm": "0.4" }), [{ id: "P-J-501", subjectId: "J-501" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("J-501"), ...releasedBy("P-J-501", ELECTRICIAN) });
      await b.handover(w.ports(), "P-J-501");
    },
    holds: (w) => {
      const pack = w.packById("P-J-501");
      const tried = w.handovers.filter((h) => h.packId === "P-J-501");
      const why = pack.history.some((m) => /insulation/i.test(m.reason));
      return STRICT(pack.queue === "fail" && pack.failedCheck === "completeness" && why && tried.length > 0 && tried.every((h) => h.ok === false) && pack.handedOver !== true && !pack.versionRecord);
    },
    describe: (w) => `queue ${w.packById("P-J-501").queue} (${w.packById("P-J-501").failedCheck}); handovers ${JSON.stringify(w.handovers)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Two readings taken off a smudged photo of the sheet at 0.55 and 0.7; everything else read clean.
    world: () =>
      world(job("J-601", { "J-601:t:earth_ohm#confidence": "0.55", "J-601:t:rcd_ms#confidence": "0.7", "J-601:t:insulation_mohm#confidence": "0.98" }), [
        { id: "P-J-601", subjectId: "J-601" },
      ]),
    drive: (b, w) => b(w.ports(), one("J-601")),
    holds: (w) => {
      const pack = w.packById("P-J-601");
      const marked = ["J-601:t:earth_ohm", "J-601:t:rcd_ms"].every((f) => pack.yellowFields.includes(f));
      return STRICT(marked && !pack.yellowFields.includes("J-601:t:insulation_mohm") && pack.queue === "yellow" && !pack.versionRecord && !pack.handedOver);
    },
    describe: (w) => `yellow ${JSON.stringify(w.packById("P-J-601").yellowFields)}; queue ${w.packById("P-J-601").queue}`,
  },
  {
    checkId: "named-human-gate",
    // 7. A Yellow record: no release, then a release with no name, then the electrician's named release.
    world: () => world(job("J-701", { "J-701:t:earth_ohm#confidence": "0.6" }), [{ id: "P-J-701", subjectId: "J-701" }]),
    drive: async (b, w) => {
      const snap = () => ({ queue: w.packById("P-J-701").queue, record: w.packById("P-J-701").versionRecord ?? null });
      w.snaps = [];
      await b(w.ports(), one("J-701"));
      w.snaps.push(snap());
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", "") });
      w.snaps.push(snap());
      w.advance(60 * 60 * 1000);
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", ELECTRICIAN) });
      w.snaps.push(snap());
    },
    holds: (w) => {
      const [none, unnamed, named] = w.snaps ?? [];
      if (!none || !unnamed || !named) return false;
      const held = none.queue === "yellow" && none.record === null && unnamed.queue === "yellow" && unnamed.record === null;
      const r = named.record;
      const recorded = named.queue === "pass" && r?.person === ELECTRICIAN && typeof r.at === "string" && r.at === "2026-09-21T01:00:00.000Z" && r.accepted.includes("TES-701") && r.accepted.includes("0.18");
      return STRICT(held && recorded);
    },
    describe: (w) => `states: ${JSON.stringify(w.snaps)}`,
  },
  {
    checkId: "as-of-and-citations",
    // 8. A job with six applicable tests, an instrument calibration date and a certificate due date.
    world: () => world(job("J-801"), [{ id: "P-J-801", subjectId: "J-801" }]),
    drive: (b, w) => b(w.ports(), one("J-801")),
    holds: (w) => {
      const pack = w.packById("P-J-801");
      const ruleIds = new Set(RULES.map((r) => r.id));
      const everyTest = ["proc.insulation-resistance", "proc.earth-continuity", "proc.polarity", "proc.circuit-connections", "proc.fault-loop-impedance", "proc.rcd-trip-time"].every((id) =>
        pack.clauses.some((c) => c.sourceRuleId === id),
      );
      return STRICT(pack.clauses.length >= 8 && everyTest && pack.clauses.every((c) => ruleIds.has(c.sourceRuleId)) && pack.asOf === NOW.toISOString());
    },
    describe: (w) => `clauses ${JSON.stringify(w.packById("P-J-801").clauses)}; as-of ${w.packById("P-J-801").asOf}`,
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. A released test record read cold by someone with no access to the business's drive.
    world: () => world(job("J-901"), [{ id: "P-J-901", subjectId: "J-901" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-901"), ...releasedBy("P-J-901", ELECTRICIAN) }),
    holds: (w) => {
      const pack = w.packById("P-J-901");
      const handed = w.handovers.filter((h) => h.packId === "P-J-901" && h.ok === true).length === 1;
      const art = w.artefacts.find((a) => a.id === "P-J-901:handover");
      const text = art ? w.renderStored(art.id) ?? "" : "";
      const inside = ["Tableland Electrical Services", "84213", "TES-901", "17 Byrnes Street", "Dan Kowalski", "EW-129847", "250", "0.18", "0.92", "1.46", "22", "MFT-1741-0093"].every((s) => text.includes(s));
      const noInsiderLink = !/sharepoint|https?:|\\\\/i.test(text);
      return STRICT(handed && pack.handedOver === true && inside && noInsiderLink);
    },
    describe: (w) => `handover: ${w.renderStored("P-J-901:handover") ?? "none"}`,
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. Every string the build shows for a passing, a yellow and a failing job.
    world: () =>
      world(
        { ...job("J-111"), ...job("J-112", { "J-112:t:earth_ohm#confidence": "0.5" }), ...job("J-113", { "J-113:t:polarity": "" }) },
        [{ id: "P-J-111", subjectId: "J-111" }, { id: "P-J-112", subjectId: "J-112" }, { id: "P-J-113", subjectId: "J-113" }],
      ),
    drive: (b, w) =>
      b(w.ports(), {
        jobs: [{ packId: "P-J-111", jobId: "J-111" }, { packId: "P-J-112", jobId: "J-112" }, { packId: "P-J-113", jobId: "J-113" }],
        releases: { "P-J-111": { person: ELECTRICIAN } },
      }),
    holds: (w) => {
      const pass = w.copy.filter((s) => /as of/i.test(s));
      const held = w.copy.filter((s) => /polarity/i.test(s));
      const claims = /complian|certified safe|safe to (use|energise)|passed inspection|approved|all clear|meets (the )?standard/i;
      return STRICT(pass.length >= 1 && held.length >= 1 && w.copy.length >= 3 && !w.copy.some((s) => claims.test(s)));
    },
    describe: (w) => `copy: ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A job processed end to end, released and handed over.
    world: () => world(job("J-121"), [{ id: "P-J-121", subjectId: "J-121" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-121"), ...releasedBy("P-J-121", ELECTRICIAN) }),
    holds: (w) => {
      const done = w.packById("P-J-121").handedOver === true;
      const content = Object.values(job("J-121")).filter((x) => typeof x === "string" && x.length >= 4);
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

// The pass test runs against the contractor's live graph, as a scoped build.
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

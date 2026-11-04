/**
 * One scenario per check of rejected-pack-build-standard, for SWMS Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a Queensland building contractor, its jobs, its crews and its
 * own approved SWMS templates. The high risk construction work rules below
 * paraphrase WHS Regulation 2011 (Qld) s291 and s299; the procedure rules are
 * the business's own, labelled as such. Thresholds a build applies come from
 * these rules, never from code. Every `holds` reads what the world recorded
 * through its ports, never the build's own memory, and returns a strict boolean.
 */

import { PackWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const inDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const RULES = [
  { id: "qld.whs-reg-2011.s291-fall", version: "2011", effectiveFrom: "2012-01-01T00:00:00.000Z", dueDays: 0, text: "WHS Regulation 2011 (Qld) s291: high risk construction work includes work with a risk of a person falling more than 2 metres." },
  { id: "qld.whs-reg-2011.s291-trench", version: "2011", effectiveFrom: "2012-01-01T00:00:00.000Z", dueDays: 0, text: "WHS Regulation 2011 (Qld) s291: high risk construction work includes work in or near a trench or shaft with an excavated depth more than 1.5 metres." },
  { id: "qld.whs-reg-2011.s291-energised", version: "2011", effectiveFrom: "2012-01-01T00:00:00.000Z", dueDays: 0, text: "WHS Regulation 2011 (Qld) s291: high risk construction work includes work on or near energised electrical installations or services." },
  { id: "qld.whs-reg-2011.s291-asbestos", version: "2011", effectiveFrom: "2012-01-01T00:00:00.000Z", dueDays: 0, text: "WHS Regulation 2011 (Qld) s291: high risk construction work includes work likely to involve disturbing asbestos." },
  { id: "qld.whs-reg-2011.s299-swms", version: "2011", effectiveFrom: "2012-01-01T00:00:00.000Z", dueDays: 0, text: "WHS Regulation 2011 (Qld) s299: a safe work method statement is prepared before high risk construction work starts." },
  { id: "proc.general-risk-assessment", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our procedure: a job with no high risk construction work is covered by our general job risk assessment." },
  { id: "proc.crew-sign-on", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Our procedure: every worker on the job signs the current SWMS revision before work starts." },
  { id: "proc.swms-site-review", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", supersededBy: "2026-10", dueDays: 7, text: "Our procedure: the SWMS is reviewed with the crew on site within 7 days of the job starting." },
  { id: "proc.swms-site-review", version: "2026-10", effectiveFrom: "2026-10-01T00:00:00.000Z", dueDays: 3, text: "Our procedure: the SWMS is reviewed with the crew on site within 3 days of the job starting." },
];

const BUSINESS = {
  "biz:trading_name": "Hinterland Build Co",
  "biz:abn": "62 418 907 335",
  "biz:trading_address": "9 Mill Street, Nambour QLD 4560",
  "biz:pl:expires_on": inDays(200),
  "biz:wc:expires_on": inDays(280),
  "tpl:fall:version": "FALL-v4",
  "tpl:fall:steps": "Edge protection fitted before roof access; harness clipped to rated anchor",
  "tpl:fall:evidence": "https://hinterland.sharepoint.com/sites/whs/templates/fall-v4.docx",
  "tpl:trench:version": "TRENCH-v2",
  "tpl:trench:steps": "Benching or shoring past 1.5 m; spoil kept 1 m back from the edge",
  "tpl:energised:version": "LIVE-v3",
  "tpl:energised:steps": "Isolate and lock out at the board; test for dead before touching",
  "tpl:asbestos:version": "ASB-v2",
  "tpl:asbestos:steps": "Stop work if suspect sheeting found; licensed removalist only",
  "tpl:general:version": "GEN-v5",
  "tpl:general:steps": "Site sign-in, PPE, first aid kit and housekeeping checked at start",
  "w:W-1:name": "Kirra Lane",
  "w:W-1:white_card": "QLD-WC-118204",
  "w:W-2:name": "Tom Duffy",
  "w:W-2:white_card": "QLD-WC-093377",
  "w:W-3:name": "Sam Petrov",
  "w:W-3:white_card": "QLD-WC-140561",
  "w:W-3:licence": "EWP boom licence (WP)",
  "w:W-3:licence_expires_on": inDays(600),
};

const SUPERVISOR = "Rhys Tanner, site supervisor";

/** A job in the graph: a roof replacement at height, signed on by its crew. */
function job(j, over = {}) {
  return {
    [`${j}:job_no`]: `HB-${j.slice(2)}`,
    [`${j}:customer`]: "Woombye Community Hall",
    [`${j}:site_address`]: "31 Blackall Street, Woombye QLD 4559",
    [`${j}:state`]: "QLD",
    [`${j}:start_on`]: inDays(5),
    [`${j}:supervisor`]: SUPERVISOR,
    [`${j}:contractor_abn`]: "62418907335",
    [`${j}:scope`]: "strip and replace the hall's colorbond roof, gutters and downpipes",
    [`${j}:scope:height_m`]: "6.5",
    [`${j}:scope:trench_m`]: "0",
    [`${j}:scope:energised`]: "no",
    [`${j}:scope:asbestos`]: "no",
    [`${j}:crew`]: "W-1,W-2",
    [`${j}:swms_rev`]: "R2",
    [`${j}:signed:W-1`]: "R2",
    [`${j}:signed:W-2`]: "R2",
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
    // 1. The business moves premises once, with the job's SWMS, risk assessment and sign-on sheet open.
    world: () => world(job("J-101"), [{ id: "P-J-101", subjectId: "J-101" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("J-101"), ...releasedBy("P-J-101", SUPERVISOR) });
      w.changeFact("biz:trading_address", "Unit 2, 14 Currie Street, Nambour QLD 4560");
      await b(w.ports(), one("J-101")); // the next run re-reads; nothing is re-typed
    },
    holds: (w) => {
      const open = w.artefacts.filter((a) => a.packId === "P-J-101");
      const carrying = open.filter((a) => a.refs.includes("biz:trading_address") || a.literal !== undefined);
      if (carrying.length < 3) return false;
      const texts = carrying.map((a) => w.renderStored(a.id) ?? "");
      return STRICT(texts.every((t) => t.includes("14 Currie Street") && !t.includes("9 Mill Street")));
    },
    describe: (w) => `artefacts: ${w.artefacts.map((a) => `${a.id} -> ${w.renderStored(a.id)?.slice(0, 60)}`).join(" | ")}`,
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. The site-review rule is superseded on 1 October; the clock passes it between runs.
    world: () => world(job("J-201"), [{ id: "P-J-201", subjectId: "J-201" }]),
    drive: async (b, w) => {
      await b(w.ports(), one("J-201"));
      w.advance(12 * DAY); // 3 October: the 2026-10 version is in force
      await b(w.ports(), one("J-201"));
    },
    holds: (w) => {
      const due = callsTo(w, "read_rule", (c) => c.request?.ruleId === "proc.swms-site-review").map((c) => c.response);
      if (due.length !== 2 || !due[0] || !due[1]) return false;
      const moved = due[0].version === "2025-07" && due[1].version === "2026-10" && (new Date(due[0].date) - new Date(due[1].date)) / DAY === 4;
      const listed = callsTo(w, "read_rule", (c) => c.request?.ruleId === undefined).every((c) => c.response?.rules === RULES.length);
      const cited = w.packById("P-J-201").clauses.some((c) => c.sourceRuleId === "proc.swms-site-review" && c.text.includes("2026-10") && c.text.includes(due[1].date.slice(0, 10)));
      return STRICT(moved && listed && cited);
    },
    describe: (w) => `review due: ${callsTo(w, "read_rule", (c) => c.request?.ruleId === "proc.swms-site-review").map((c) => JSON.stringify(c.response)).join(" then ")}`,
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A ground-level fit-out (1.2 m step ladder, no trench, nothing live, no asbestos) beside a roof job at 3.5 m.
    world: () =>
      world(
        { ...job("J-301", { "J-301:scope": "replace kitchen cabinets and benchtops", "J-301:scope:height_m": "1.2" }), ...job("J-302", { "J-302:scope:height_m": "3.5" }) },
        [{ id: "P-J-301", subjectId: "J-301" }, { id: "P-J-302", subjectId: "J-302" }],
      ),
    drive: (b, w) => b(w.ports(), { jobs: [{ packId: "P-J-301", jobId: "J-301" }, { packId: "P-J-302", jobId: "J-302" }] }),
    holds: (w) => {
      const no = w.notApplicable.filter((n) => n.subjectId === "J-301");
      const each = ["s291-fall", "s291-trench", "s291-energised", "s291-asbestos"].every((id) => no.some((n) => /because/i.test(n.reason) && n.reason.includes(id)));
      const noSwms = no.some((n) => /SWMS is not required/i.test(n.reason) && /risk assessment/i.test(n.reason) && /because/i.test(n.reason));
      const roof = w.notApplicable.filter((n) => n.subjectId === "J-302");
      const roofStillNeedsFall = !roof.some((n) => n.reason.includes("s291-fall")) && !roof.some((n) => /SWMS is not required/i.test(n.reason)) && roof.length === 3;
      const fitout = w.packById("P-J-301");
      const raDrafted = w.artefacts.some((a) => a.id === "P-J-301:risk-assessment") && !w.artefacts.some((a) => a.id.startsWith("P-J-301:swms-"));
      return STRICT(no.length === 5 && each && noSwms && roofStillNeedsFall && fitout.failedCheck === undefined && raDrafted);
    },
    describe: (w) => `written no: ${w.notApplicable.map((n) => `${n.subjectId}: ${n.reason}`).join(" / ") || "none"}`,
  },
  {
    checkId: "eight-checks-in-order",
    // 4. A job with no supervisor named (check 1) and a worker with no white card on file (check 2) too.
    world: () =>
      world({ ...job("J-401", { "J-401:supervisor": undefined, "J-401:crew": "W-1,W-2,W-9" }), "w:W-9:name": "Jai Moss" }, [{ id: "P-J-401", subjectId: "J-401" }]),
    drive: (b, w) => b(w.ports(), one("J-401")),
    holds: (w) => {
      const pack = w.packById("P-J-401");
      const checks = callsTo(w, "gate", (c) => c.request?.packId === "P-J-401" && c.request?.check).map((c) => c.request.check);
      const reasons = pack.history.length > 0 && pack.history.every((m) => typeof m.reason === "string" && m.reason.length > 0);
      const why = pack.history.some((m) => /supervisor/i.test(m.reason));
      return STRICT(pack.failedCheck === "identity" && pack.queue === "fail" && reasons && why && checks[0] === "identity" && !checks.includes("tickets"));
    },
    describe: (w) => `failed at ${w.packById("P-J-401").failedCheck}; history ${JSON.stringify(w.packById("P-J-401").history)}`,
  },
  {
    checkId: "four-queues",
    // 5. A crew member's EWP licence expired last month (Fail), and a job where one worker has not signed (Hold).
    //    The supervisor tries to accept both, then each is asked to be handed over.
    world: () =>
      world(
        {
          ...job("J-501", { "J-501:crew": "W-1,W-3", "J-501:signed:W-3": "R2" }),
          "w:W-3:licence_expires_on": inDays(-30),
          ...job("J-502", { "J-502:crew": "W-1,W-2", "J-502:signed:W-2": "R1" }),
        },
        [{ id: "P-J-501", subjectId: "J-501" }, { id: "P-J-502", subjectId: "J-502" }],
      ),
    drive: async (b, w) => {
      await b(w.ports(), {
        jobs: [{ packId: "P-J-501", jobId: "J-501" }, { packId: "P-J-502", jobId: "J-502" }],
        releases: { "P-J-501": { person: SUPERVISOR }, "P-J-502": { person: SUPERVISOR } },
      });
      w.refusedHold = await b.handover(w.ports(), "P-J-502", "J-502");
      await b.handover(w.ports(), "P-J-501", "J-501");
      await b.handover(w.ports(), "P-J-501");
    },
    holds: (w) => {
      const failed = w.packById("P-J-501");
      const tried = w.handovers.filter((h) => h.packId === "P-J-501");
      const why = failed.history.some((m) => /licence/i.test(m.reason) && /expired/i.test(m.reason));
      const failHeld = failed.queue === "fail" && failed.failedCheck === "tickets" && why && tried.length > 0 && tried.every((h) => h.ok === false) && failed.handedOver !== true && !failed.versionRecord;
      const held = w.packById("P-J-502");
      const holdHeld =
        held.queue === "hold" && !held.versionRecord && held.handedOver !== true && w.refusedHold?.ok === false &&
        !w.handovers.some((h) => h.packId === "P-J-502" && h.ok === true) &&
        w.copy.some((s) => /on hold/i.test(s) && s.includes("Tom Duffy") && !s.includes("Kirra Lane"));
      return STRICT(failHeld && holdHeld);
    },
    describe: (w) =>
      `J-501 ${w.packById("P-J-501").queue} (${w.packById("P-J-501").failedCheck}); J-502 ${w.packById("P-J-502").queue}; handovers ${JSON.stringify(w.handovers)}; copy ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Height and asbestos read off a vague job description at 0.6 and 0.7; trench depth read clean.
    world: () =>
      world(job("J-601", { "J-601:scope:height_m#confidence": "0.6", "J-601:scope:asbestos#confidence": "0.7", "J-601:scope:trench_m#confidence": "0.97" }), [
        { id: "P-J-601", subjectId: "J-601" },
      ]),
    drive: (b, w) => b(w.ports(), one("J-601")),
    holds: (w) => {
      const pack = w.packById("P-J-601");
      const marked = ["J-601:scope:height_m", "J-601:scope:asbestos"].every((f) => pack.yellowFields.includes(f));
      return STRICT(marked && !pack.yellowFields.includes("J-601:scope:trench_m") && pack.queue === "yellow" && !pack.versionRecord && !pack.handedOver);
    },
    describe: (w) => `yellow ${JSON.stringify(w.packById("P-J-601").yellowFields)}; queue ${w.packById("P-J-601").queue}`,
  },
  {
    checkId: "named-human-gate",
    // 7. A Yellow pack: no acceptance, then one with no name, then the supervisor's named acceptance.
    world: () => world(job("J-701", { "J-701:scope:height_m#confidence": "0.6" }), [{ id: "P-J-701", subjectId: "J-701" }]),
    drive: async (b, w) => {
      const snap = () => ({ queue: w.packById("P-J-701").queue, record: w.packById("P-J-701").versionRecord ?? null });
      w.snaps = [];
      await b(w.ports(), one("J-701"));
      w.snaps.push(snap());
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", "") });
      w.snaps.push(snap());
      w.advance(60 * 60 * 1000);
      await b(w.ports(), { ...one("J-701"), ...releasedBy("P-J-701", SUPERVISOR) });
      w.snaps.push(snap());
    },
    holds: (w) => {
      const [none, unnamed, named] = w.snaps ?? [];
      if (!none || !unnamed || !named) return false;
      const held = none.queue === "yellow" && none.record === null && unnamed.queue === "yellow" && unnamed.record === null;
      const r = named.record;
      const recorded =
        named.queue === "pass" && r?.person === SUPERVISOR && r.at === "2026-09-21T01:00:00.000Z" &&
        r.accepted.includes("HB-701") && r.accepted.includes("Kirra Lane") && r.accepted.includes("Tom Duffy") && r.accepted.includes("R2");
      return STRICT(held && recorded);
    },
    describe: (w) => `states: ${JSON.stringify(w.snaps)}`,
  },
  {
    checkId: "as-of-and-citations",
    // 8. A switchboard upgrade at height: falls and energised work apply; trench and asbestos do not.
    world: () => world(job("J-801", { "J-801:scope:energised": "yes", "J-801:scope:height_m": "2.8" }), [{ id: "P-J-801", subjectId: "J-801" }]),
    drive: (b, w) => b(w.ports(), one("J-801")),
    holds: (w) => {
      const pack = w.packById("P-J-801");
      const ruleIds = new Set(RULES.map((r) => r.id));
      const cites = (id) => pack.clauses.some((c) => c.sourceRuleId === id);
      const every = ["qld.whs-reg-2011.s291-fall", "qld.whs-reg-2011.s291-energised", "qld.whs-reg-2011.s291-trench", "qld.whs-reg-2011.s291-asbestos", "proc.general-risk-assessment", "proc.crew-sign-on", "proc.swms-site-review"].every(cites);
      const drafted = w.artefacts.some((a) => a.id === "P-J-801:swms-fall") && w.artefacts.some((a) => a.id === "P-J-801:swms-energised") && !w.artefacts.some((a) => a.id === "P-J-801:swms-trench");
      return STRICT(pack.clauses.length >= 7 && every && drafted && pack.clauses.every((c) => ruleIds.has(c.sourceRuleId)) && pack.asOf === NOW.toISOString());
    },
    describe: (w) => `clauses ${JSON.stringify(w.packById("P-J-801").clauses)}; as-of ${w.packById("P-J-801").asOf}`,
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. An accepted pre-start pack read cold by the principal contractor's site manager, with no access to our drive.
    world: () => world(job("J-901"), [{ id: "P-J-901", subjectId: "J-901" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-901"), ...releasedBy("P-J-901", SUPERVISOR) }),
    holds: (w) => {
      const pack = w.packById("P-J-901");
      const handed = w.handovers.filter((h) => h.packId === "P-J-901" && h.ok === true).length === 1;
      const art = w.artefacts.find((a) => a.id === "P-J-901:handover");
      const text = art ? w.renderStored(art.id) ?? "" : "";
      const inside = ["Hinterland Build Co", "62 418 907 335", "HB-901", "31 Blackall Street", "FALL-v4", "Edge protection fitted", "GEN-v5", "Kirra Lane", "Tom Duffy", "R2", SUPERVISOR].every((s) => text.includes(s));
      const noInsiderLink = !/sharepoint|https?:|\\\\/i.test(text);
      return STRICT(handed && pack.handedOver === true && inside && noInsiderLink);
    },
    describe: (w) => `handover: ${w.renderStored("P-J-901:handover") ?? "none"}`,
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. Every string the build shows for an accepted, a yellow, a held and a failing job.
    world: () =>
      world(
        {
          ...job("J-111"),
          ...job("J-112", { "J-112:scope:asbestos#confidence": "0.5" }),
          ...job("J-113", { "J-113:signed:W-2": undefined }),
          ...job("J-114", { "J-114:contractor_abn": "11 222 333 444" }),
        },
        [{ id: "P-J-111", subjectId: "J-111" }, { id: "P-J-112", subjectId: "J-112" }, { id: "P-J-113", subjectId: "J-113" }, { id: "P-J-114", subjectId: "J-114" }],
      ),
    drive: (b, w) =>
      b(w.ports(), {
        jobs: ["J-111", "J-112", "J-113", "J-114"].map((j) => ({ packId: `P-${j}`, jobId: j })),
        releases: { "P-J-111": { person: SUPERVISOR } },
      }),
    holds: (w) => {
      const pass = w.copy.filter((s) => /as of/i.test(s));
      const held = w.copy.filter((s) => /on hold/i.test(s));
      const failed = w.copy.filter((s) => /two ABNs/i.test(s));
      const claims = /complian|certified|safe to (start|work)|is safe|approved|all clear|meets (the )?(standard|law)|signed off by the regulator/i;
      return STRICT(pass.length >= 1 && held.length >= 1 && failed.length >= 1 && w.copy.length >= 4 && !w.copy.some((s) => claims.test(s)));
    },
    describe: (w) => `copy: ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A job processed end to end, accepted and handed over.
    world: () => world(job("J-121"), [{ id: "P-J-121", subjectId: "J-121" }]),
    drive: (b, w) => b(w.ports(), { ...one("J-121"), ...releasedBy("P-J-121", SUPERVISOR) }),
    holds: (w) => {
      const done = w.packById("P-J-121").handedOver === true;
      const content = [...Object.values(job("J-121")), ...Object.values(BUSINESS)].filter((x) => typeof x === "string" && x.length >= 4);
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

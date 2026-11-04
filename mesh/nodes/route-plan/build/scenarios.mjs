/**
 * One scenario per check of dispatch-board-build-standard, for Route Plan.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`.
 * The checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * The world is a small Geelong service business: three techs, one with a
 * current gas licence, one whose gas licence lapsed in April, one with no
 * licences. Addresses resolve through a seeded geocoder; anything not in it
 * does not resolve. A dispatcher, Mei Lin, accepts the day's proposed run
 * line by line; the scenario stands in for her with `release(world)`, which
 * logs each answer on the world with the call count at that moment, so a
 * holds can see whether anything was written before she said yes.
 *
 * Every `holds` reads the world (its recorded port calls, its non-recording
 * twins and that release log), never the build, and returns a strict boolean.
 * Each scenario has been run against a do-nothing build and against the
 * deliberately broken builds in mutants.mjs; every claimed check goes red for
 * them.
 */

import { DispatchWorld } from "@aipathway/conformance";

const ESCALATION_REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

const NOW = new Date("2026-11-08T19:30:00.000Z"); // Mon 9 Nov, 6:30am AEDT
const DAY = "2026-11-09";
const at = (hhmm) => `${DAY}T${hhmm}:00.000Z`; // board times kept in UTC
const ms = (iso) => new Date(iso).getTime();
const DISPATCHER = { name: "Mei Lin", accepts: true };

const DEPOT = "Depot, North Geelong VIC 3215";
const RHYS = { id: "T1", name: "Rhys Adeyemi", homeBase: DEPOT, licences: [{ code: "gas", expires: "2027-08-31" }, { code: "electrical", expires: "2027-03-31" }] };
const TALIA = { id: "T2", name: "Talia Brooks", homeBase: DEPOT, licences: [{ code: "gas", expires: "2026-04-30" }, { code: "height", expires: "2026-06-15" }] };
const NOEL = { id: "T3", name: "Noel Pham", homeBase: DEPOT, licences: [] };

const GEO = {
  "12 pakington st geelong west": "12 Pakington Street, Geelong West VIC 3218",
  "4/30 Ryrie St Geelong": "Unit 4, 30 Ryrie Street, Geelong VIC 3220",
  "77 Bellarine Hwy Newcomb": "77 Bellarine Highway, Newcomb VIC 3219",
  "5 Surf Coast Hwy Grovedale": "5 Surf Coast Highway, Grovedale VIC 3216",
  "18 Melbourne Rd Norlane": "18 Melbourne Road, Norlane VIC 3214",
};
const A = (raw) => GEO[raw];

function job(id, customerId, address, from, to, durationMin, extra = {}) {
  return {
    id,
    customerId,
    address,
    window: { from: at(from), to: at(to) },
    durationMin,
    requires: [],
    urgency: "routine",
    status: "new",
    customerSaid: "The shower mixer drips all night.",
    version: 1,
    ...extra,
  };
}

/** Symmetric travel table in minutes between resolved addresses. */
function table(pairs) {
  const out = {};
  for (const [a, b, min] of pairs) {
    out[`${a}>${b}`] = min;
    out[`${b}>${a}`] = min;
  }
  return out;
}

/**
 * The dispatcher's release. Each call is logged on the world with the call
 * count at that moment. `decline` answers the first n proposals with nothing
 * accepted; after that every proposed line is accepted.
 */
function release(world, { decline = 0 } = {}) {
  world.releases ??= [];
  return (plan) => {
    const declining = world.releases.length < decline;
    const accepted = declining ? [] : plan.lines.map((l) => l.jobId);
    world.releases.push({ atCall: world.calls.length, person: DISPATCHER.name, accepted, lines: plan.lines });
    return { person: DISPATCHER.name, accepted };
  };
}
const run = (build, world, opts) => build(world.ports(), { acceptPlan: release(world, opts) });
/** Index of the first release that accepted this job, or -1. */
const releasedAt = (w, jobId) => (w.releases ?? []).find((r) => r.accepted.includes(jobId))?.atCall ?? -1;

const consent = (customerId) => ({ customerId, channel: "sms", givenAt: "2026-10-01T00:00:00.000Z" });
const writes = (w, jobId) => w.calls.filter((c) => c.port === "write_job" && c.request && c.request.jobId === jobId);
const idx = (w, pred) => w.calls.findIndex(pred);
const inWindow = (slot, win) => ms(slot.start) >= ms(win.from) && ms(slot.end) <= ms(win.to);
const hasEsc = (w, jobId, reason) => w.escalationsFor(jobId).some((e) => e.reason === reason && typeof e.owner === "string" && e.owner.length > 0);

/** Every ordering of a list. Small lists only. */
function perms(xs) {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. No slot until the address resolves. J102's address is a street with
    // no suburb, which the geocoder does not resolve.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [job("J101", "C1", "12 pakington st geelong west", "08:00", "12:00", 60), job("J102", "C2", "12 Pakington St", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1"), consent("C2")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const s1 = w.slotsFor("J101");
      const resolveIdx = idx(w, (c) => c.port === "resolve_address" && c.request.raw === "12 pakington st geelong west" && c.response !== null);
      const writeIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J101");
      const everySlotResolved = w.slots.every((s) => typeof s.address === "string" && Object.values(GEO).includes(s.address));
      const neverProposed = (w.releases ?? []).every((r) => r.lines.every((l) => l.jobId !== "J102"));
      return (
        s1.length === 1 &&
        s1[0].address === A("12 pakington st geelong west") &&
        resolveIdx >= 0 &&
        writeIdx > resolveIdx &&
        w.slotsFor("J102").length === 0 &&
        writes(w, "J102").length === 0 &&
        neverProposed &&
        hasEsc(w, "J102", "address_unresolved") &&
        everySlotResolved
      );
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}@${s.address}`).join("; ") || "none"}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}:${e.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A recurring gas service last done by Talia, whose gas licence has
    // since lapsed. She and the unlicensed tech are listed first, and her
    // name is on the visit, so a build that takes the first free tech or
    // the tech who did it last assigns the wrong one.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [TALIA, NOEL, RHYS],
        jobs: [job("J201", "C1", "4/30 Ryrie St Geelong", "08:00", "12:00", 90, { requires: ["gas"], customerSaid: "Annual gas heater service.", recurring: { series: "R-GAS-17", lastTechId: "T2" } })],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const s = w.slotsFor("J201");
      const ruleIdx = idx(w, (c) => c.port === "read_rule" && c.request.licence === "gas");
      const writeIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J201");
      const proposedWrong = (w.releases ?? []).some((r) => r.lines.some((l) => l.jobId === "J201" && l.techId !== "T1"));
      return s.length === 1 && s[0].techId === "T1" && w.licenceCurrent(s[0].techId, "gas") === true && ruleIdx >= 0 && writeIdx > ruleIdx && !proposedWrong && !w.slots.some((x) => x.techId === "T2" || x.techId === "T3");
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}->${s.techId}`).join("; ") || "none"}; rule reads: ${w.calls.filter((c) => c.port === "read_rule").length}`,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. Three all-day jobs on one tech. Geelong West and Newcomb are 10
    // minutes apart; Grovedale is 40 from Geelong West and 45 from Newcomb.
    // Taken in job order the run drives 85 minutes; the least-travel order
    // drives 50. The plan must pick a 50-minute order, start each stop after
    // the last one ends plus the travel read for that leg, and stay in window.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [
          job("J301", "C1", "12 pakington st geelong west", "08:00", "16:00", 60),
          job("J302", "C2", "5 Surf Coast Hwy Grovedale", "08:00", "16:00", 60),
          job("J303", "C3", "77 Bellarine Hwy Newcomb", "08:00", "16:00", 60),
        ],
        geocoder: GEO,
        travelMin: table([
          [A("12 pakington st geelong west"), A("77 Bellarine Hwy Newcomb"), 10],
          [A("12 pakington st geelong west"), A("5 Surf Coast Hwy Grovedale"), 40],
          [A("77 Bellarine Hwy Newcomb"), A("5 Surf Coast Hwy Grovedale"), 45],
        ]),
        defaultTravelMin: 0,
        consents: [consent("C1"), consent("C2"), consent("C3")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const ids = ["J301", "J302", "J303"];
      const slots = ids.map((id) => w.slotsFor(id));
      if (slots.some((s) => s.length !== 1)) return false;
      const ordered = slots.map((s) => s[0]).sort((a, b) => ms(a.start) - ms(b.start));
      if (!ordered.every((s) => s.techId === ordered[0].techId)) return false;
      for (const s of ordered) {
        const j = w.job(s.jobId);
        if (!j || !inWindow(s, j.window)) return false;
      }
      let driven = 0;
      for (let i = 1; i < ordered.length; i += 1) {
        const leg = w.travel(ordered[i - 1].address, ordered[i].address);
        if (ms(ordered[i].start) < ms(ordered[i - 1].end) + leg) return false;
        const read = w.calls.some((c) => c.port === "read_job" && c.request && c.request.travel && c.request.travel.from === ordered[i - 1].address && c.request.travel.to === ordered[i].address);
        if (!read) return false;
        driven += leg;
      }
      const addrs = ordered.map((s) => s.address);
      const least = Math.min(...perms(addrs).map((p) => p.slice(1).reduce((sum, a, i) => sum + w.travel(p[i], a), 0)));
      return driven === least;
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end}`).join("; ") || "none"}`,
  },
  {
    checkId: "one-slot-per-job",
    // 4. The dispatcher declines the first proposal. On the second the write
    // returns no id. On the third it lands. Then the event arrives once more
    // with nothing changed.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [job("J401", "C1", "18 Melbourne Rd Norlane", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
        failNextWrite: true,
      }),
    drive: async (build, world) => {
      const accept = release(world, { decline: 1 });
      for (let i = 0; i < 4; i += 1) {
        await build(world.ports(), { acceptPlan: accept });
        world.advance(30 * 60 * 1000);
      }
    },
    holds: (w) => {
      const s = w.slotsFor("J401");
      const ws = writes(w, "J401");
      const firstWrite = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J401");
      const failedIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J401" && c.response === null);
      const firstGood = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J401" && c.response !== null);
      const sendIdx = w.calls.map((c, i) => (c.port === "send_sms" ? i : -1)).filter((i) => i >= 0);
      const creates = ws.filter((c) => c.response !== null && !("update" in c.request));
      const released = releasedAt(w, "J401");
      return (
        s.length === 1 &&
        typeof s[0].externalId === "string" &&
        released >= 0 &&
        firstWrite >= released &&
        failedIdx >= 0 &&
        firstGood > failedIdx &&
        hasEsc(w, "J401", "write_failed") &&
        sendIdx.every((i) => i > firstGood) &&
        creates.length === 1 &&
        w.messagesTo("C1").length === 1
      );
    },
    describe: (w) => `slots for J401: ${w.slotsFor("J401").length}; writes: ${writes(w, "J401").map((c) => (c.response ? "ok" : "null")).join(",")}; releases: ${(w.releases ?? []).map((r) => r.accepted.length).join(",")}; messages: ${w.messagesTo("C1").length}`,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. One gas tech with a planned morning. A gas leak lands needing
    // 08:00-10:00, which only the morning service's time can meet.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [RHYS],
        jobs: [
          job("J501", "C1", "4/30 Ryrie St Geelong", "08:00", "12:00", 120, { requires: ["gas"], customerSaid: "Gas heater service, recurring.", recurring: { series: "R-GAS-03", lastTechId: "T1" } }),
          job("J502", "C2", "5 Surf Coast Hwy Grovedale", "13:00", "17:00", 240, { requires: ["gas"], customerSaid: "New cooktop to connect." }),
        ],
        geocoder: GEO,
        defaultTravelMin: 30,
        consents: [consent("C1"), consent("C2"), consent("C3")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      const accept = release(world);
      await build(world.ports(), { acceptPlan: accept });
      world.advance(30 * 60 * 1000);
      world.arriveEmergency(job("J503", "C3", "18 Melbourne Rd Norlane", "08:00", "10:00", 60, { requires: ["gas"], urgency: "emergency", customerSaid: "Strong gas smell near the meter." }));
      await build(world.ports(), { acceptPlan: accept });
    },
    holds: (w) => {
      const e = w.slotsFor("J503");
      const v = w.slotsFor("J501");
      if (e.length !== 1 || v.length !== 1) return false;
      const gateIdx = idx(w, (c) => c.port === "gate" && c.request && c.request.for === "J503" && c.response && c.response.accepted === true && c.response.person === DISPATCHER.name);
      const eWriteIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J503");
      const accepted = w.acceptances.some((a) => a.emergencyJobId === "J503" && a.accepted === true && a.person === DISPATCHER.name && a.displaceSlotId === v[0].id);
      const clear = !(ms(v[0].start) < ms(e[0].end) && ms(e[0].start) < ms(v[0].end));
      const owned = w.escalationsFor("J501").some((x) => typeof x.owner === "string" && x.owner.length > 0);
      return gateIdx >= 0 && eWriteIdx > gateIdx && accepted && e[0].updatedBy.person === DISPATCHER.name && v[0].displacedBy === "J503" && (clear || owned);
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end}${s.displacedBy ? ` displacedBy ${s.displacedBy}` : ""}`).join("; ") || "none"}; gate calls: ${w.calls.filter((c) => c.port === "gate" && c.request.displace).length}`,
  },
  {
    checkId: "customer-told-once-with-consent",
    // 6. C1 agreed to SMS, C2 did not. The event is delivered twice.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL, RHYS],
        jobs: [job("J601", "C1", "12 pakington st geelong west", "08:00", "12:00", 60), job("J602", "C2", "77 Bellarine Hwy Newcomb", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      const accept = release(world);
      await build(world.ports(), { acceptPlan: accept });
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { acceptPlan: accept });
    },
    holds: (w) => {
      const consentIdx = idx(w, (c) => c.port === "gate" && c.request && c.request.consent === "C1" && c.request.channel === "sms" && c.response !== null);
      const sendIdx = idx(w, (c) => c.port === "send_sms" && c.request.to === "C1");
      return (
        w.messagesTo("C1").length === 1 &&
        consentIdx >= 0 &&
        sendIdx > consentIdx &&
        sendIdx > releasedAt(w, "J601") &&
        releasedAt(w, "J601") >= 0 &&
        w.messagesTo("C2").length === 0 &&
        hasEsc(w, "J602", "no_consent") &&
        w.messages.every((m) => w.consentFor(m.to, m.channel) !== null)
      );
    },
    describe: (w) => `messages: C1=${w.messagesTo("C1").length}, C2=${w.messagesTo("C2").length}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}`).join(",") || "none"}`,
  },
  {
    checkId: "tech-told-with-the-record",
    // 7. The customer described the fault when booking.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [job("J701", "C1", "4/30 Ryrie St Geelong", "09:00", "13:00", 60, { customerSaid: "Hot water runs cold after five minutes and the unit is making a ticking noise." })],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const s = w.slotsFor("J701");
      const j = w.job("J701");
      if (s.length !== 1 || !j) return false;
      return w.noticesTo(s[0].techId).some(
        (n) => n.jobId === "J701" && n.address === A("4/30 Ryrie St Geelong") && n.window !== undefined && n.window.from === j.window.from && n.window.to === j.window.to && n.customerSaid === j.customerSaid,
      );
    },
    describe: (w) => `notices: ${JSON.stringify(w.notices.map((n) => n.notice))}`,
  },
  {
    checkId: "change-propagates-once",
    // 8. Planned and accepted for the morning, then the customer moves to the
    // afternoon. The event then arrives once more with nothing changed.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [job("J801", "C1", "77 Bellarine Hwy Newcomb", "08:00", "10:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      const accept = release(world);
      await build(world.ports(), { acceptPlan: accept });
      world.advance(30 * 60 * 1000);
      world.changeJob("J801", { window: { from: at("13:00"), to: at("15:00") } });
      await build(world.ports(), { acceptPlan: accept });
      world.advance(30 * 60 * 1000);
      await build(world.ports(), { acceptPlan: accept });
    },
    holds: (w) => {
      const s = w.slotsFor("J801");
      const j = w.job("J801");
      if (s.length !== 1 || !j) return false;
      const since = w.callsSinceMark();
      const toCustomer = since.filter((c) => c.port === "send_sms" && c.request.to === "C1").length;
      const toTech = since.filter((c) => c.port === "notify" && c.request.techId === s[0].techId).length;
      return inWindow(s[0], j.window) && s[0].jobVersion === j.version && toCustomer === 1 && toTech === 1;
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end} v${s.jobVersion}`).join("; ") || "none"}; since change: sms=${w.callsSinceMark().filter((c) => c.port === "send_sms").length}, notify=${w.callsSinceMark().filter((c) => c.port === "notify").length}`,
  },
  {
    checkId: "unassignable-is-a-queue",
    // 9. A height job nobody is current for, an address that will not
    // resolve, and a window shorter than the job.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [RHYS, TALIA, NOEL],
        jobs: [
          job("J901", "C1", "18 Melbourne Rd Norlane", "08:00", "12:00", 120, { requires: ["height"], customerSaid: "Box gutter on the second storey is overflowing." }),
          job("J902", "C2", "Behind the bakery on the corner", "08:00", "12:00", 60),
          job("J903", "C3", "5 Surf Coast Hwy Grovedale", "08:00", "09:00", 120),
        ],
        geocoder: GEO,
        consents: [consent("C1"), consent("C2"), consent("C3")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const expect = { J901: "no_licensed_tech", J902: "address_unresolved", J903: "window_impossible" };
      return Object.entries(expect).every(
        ([id, reason]) => w.slotsFor(id).length === 0 && w.escalationsFor(id).some((e) => e.jobId === id && e.reason === reason && ESCALATION_REASONS.includes(e.reason) && typeof e.owner === "string" && e.owner.length > 0),
      );
    },
    describe: (w) => `slots: ${w.slots.map((s) => s.jobId).join(",") || "none"}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}:${e.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job planned, accepted by the dispatcher, the customer confirmed
    // and the tech told. The record is then read back by job id, and it names
    // the person who released the line and the rule that planned it.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [NOEL],
        jobs: [job("J1001", "C1", "12 pakington st geelong west", "10:00", "14:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => run(build, world),
    holds: (w) => {
      const rec = w.ports().readRecord("J1001");
      if (rec.slots.length !== 1 || rec.messages.length !== 1) return false;
      const s = rec.slots[0];
      const m = rec.messages[0];
      const byPerson = s.updatedBy.person === DISPATCHER.name;
      const byRule = typeof s.updatedBy.rule === "string" && s.updatedBy.rule.length > 0;
      const released = releasedAt(w, "J1001");
      const writeIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J1001");
      const evidenced = s.evidence.some((ref) => ref.includes(m.id) && ref.includes(m.sentAt));
      return typeof s.techId === "string" && typeof s.start === "string" && typeof s.externalId === "string" && byPerson && byRule && released >= 0 && writeIdx >= released && typeof m.sentAt === "string" && evidenced && w.noticesTo(s.techId).length === 1;
    },
    describe: (w) => `slots: ${JSON.stringify(w.slots.map((s) => ({ id: s.id, techId: s.techId, externalId: s.externalId, by: s.updatedBy, evidence: s.evidence })))}; messages: ${w.messages.length}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not software. Declared in the PR and README: the node is maintained
    // by AI Pathway in a public repository, and runs on the business's own
    // job system account. The runner never scores this green.
    world: () => new DispatchWorld({ now: NOW }),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not run",
  },
];

// 12. The pass test runs only on the business's own job system, quoted as a
// scoped build. On the stub the runner reports it with_us.
export const liveScenarios = [];

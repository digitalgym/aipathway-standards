/**
 * One scenario per check of dispatch-board-build-standard, for Van Board.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`.
 * The checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * The world is a small Brisbane service business: three techs, one of them
 * with a current gas fitting licence, one whose gas licence lapsed in March,
 * one unlicensed. Addresses resolve through a seeded geocoder; anything not in
 * it does not resolve. Every `holds` reads the world (its recorded port calls
 * and its non-recording twins), never the build, and returns a strict boolean.
 *
 * Each scenario has been run against a do-nothing build and against the
 * deliberately broken builds in mutants.mjs; every claimed check goes red for
 * them.
 */

import { DispatchWorld } from "@aipathway/conformance";

// The reasons the standard lists for an escalation (section 2, Escalation).
const ESCALATION_REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

const NOW = new Date("2026-09-27T20:00:00.000Z"); // Mon 28 Sep, 6am AEST
const DAY = "2026-09-28";
const at = (hhmm) => `${DAY}T${hhmm}:00.000Z`; // board times kept in UTC
const ms = (iso) => new Date(iso).getTime();
const DISPATCHER = { name: "Priya Nair", accepts: true };

const SAM = { id: "T1", name: "Sam Okafor", homeBase: "Depot, Rocklea QLD 4106", licences: [{ code: "gas", expires: "2027-06-30" }, { code: "electrical", expires: "2027-02-28" }] };
const JO = { id: "T2", name: "Jo Whitlam", homeBase: "Depot, Rocklea QLD 4106", licences: [{ code: "gas", expires: "2026-03-31" }, { code: "height", expires: "2026-05-01" }] };
const ARI = { id: "T3", name: "Ari Tamm", homeBase: "Depot, Rocklea QLD 4106", licences: [] };

const GEO = {
  "14 smith st sunnybank": "14 Smith Street, Sunnybank QLD 4109",
  "3/88 Logan Rd Woolloongabba": "Unit 3, 88 Logan Road, Woolloongabba QLD 4102",
  "201 Given Tce Paddington": "201 Given Terrace, Paddington QLD 4064",
  "9 Oxley Rd Corinda": "9 Oxley Road, Corinda QLD 4075",
  "45 Wynnum Rd Norman Park": "45 Wynnum Road, Norman Park QLD 4170",
};

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
    customerSaid: "The kitchen tap won't stop dripping.",
    version: 1,
    ...extra,
  };
}

const consent = (customerId) => ({ customerId, channel: "sms", givenAt: "2026-09-01T00:00:00.000Z" });
const writes = (w, jobId) => w.calls.filter((c) => c.port === "write_job" && c.request && c.request.jobId === jobId);
const idx = (w, pred) => w.calls.findIndex(pred);
const inWindow = (slot, win) => ms(slot.start) >= ms(win.from) && ms(slot.end) <= ms(win.to);
const hasEsc = (w, jobId, reason) => w.escalationsFor(jobId).some((e) => e.reason === reason && typeof e.owner === "string" && e.owner.length > 0);

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. No slot until the address resolves.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [ARI],
        jobs: [job("J101", "C1", "14 smith st sunnybank", "08:00", "12:00", 60), job("J102", "C2", "14 Smith St", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1"), consent("C2")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const s1 = w.slotsFor("J101");
      const resolveIdx = idx(w, (c) => c.port === "resolve_address" && c.request.raw === "14 smith st sunnybank" && c.response !== null);
      const writeIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J101");
      const everySlotResolved = w.slots.every((s) => typeof s.address === "string" && Object.values(GEO).includes(s.address));
      return (
        s1.length === 1 &&
        s1[0].address === GEO["14 smith st sunnybank"] &&
        resolveIdx >= 0 &&
        writeIdx > resolveIdx &&
        w.slotsFor("J102").length === 0 &&
        writes(w, "J102").length === 0 &&
        hasEsc(w, "J102", "address_unresolved") &&
        everySlotResolved
      );
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}@${s.address}`).join("; ") || "none"}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}:${e.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A licence requirement is a rule read from the record. The expired
    // and the unlicensed tech are listed first, so a build that takes the
    // first free tech assigns the wrong one.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [JO, ARI, SAM],
        jobs: [job("J201", "C1", "3/88 Logan Rd Woolloongabba", "08:00", "12:00", 90, { requires: ["gas"], customerSaid: "Gas hot water unit keeps going out." })],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const s = w.slotsFor("J201");
      const ruleIdx = idx(w, (c) => c.port === "read_rule" && c.request.licence === "gas");
      const writeIdx = idx(w, (c) => c.port === "write_job" && c.request.jobId === "J201");
      return s.length === 1 && s[0].techId === "T1" && w.licenceCurrent(s[0].techId, "gas") === true && ruleIdx >= 0 && writeIdx > ruleIdx && !w.slots.some((x) => x.techId === "T2" || x.techId === "T3");
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}->${s.techId}`).join("; ") || "none"}; rule reads: ${w.calls.filter((c) => c.port === "read_rule").length}`,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. Two morning jobs on one tech, 40 minutes apart by the travel table.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [ARI],
        jobs: [job("J301", "C1", "201 Given Tce Paddington", "08:00", "12:00", 90), job("J302", "C2", "9 Oxley Rd Corinda", "08:00", "12:00", 60)],
        geocoder: GEO,
        travelMin: { [`${GEO["201 Given Tce Paddington"]}>${GEO["9 Oxley Rd Corinda"]}`]: 40, [`${GEO["9 Oxley Rd Corinda"]}>${GEO["201 Given Tce Paddington"]}`]: 40 },
        defaultTravelMin: 0,
        consents: [consent("C1"), consent("C2")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const a = w.slotsFor("J301");
      const b = w.slotsFor("J302");
      if (a.length !== 1 || b.length !== 1) return false;
      const ja = w.job("J301");
      const jb = w.job("J302");
      if (!ja || !jb || !inWindow(a[0], ja.window) || !inWindow(b[0], jb.window)) return false;
      const [first, second] = ms(a[0].start) <= ms(b[0].start) ? [a[0], b[0]] : [b[0], a[0]];
      const travelRead = w.calls.some((c) => c.port === "read_job" && c.request && c.request.travel && c.request.travel.from === first.address && c.request.travel.to === second.address);
      return first.techId === second.techId && ms(second.start) >= ms(first.end) + w.travel(first.address, second.address) && travelRead;
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end}`).join("; ") || "none"}`,
  },
  {
    checkId: "one-slot-per-job",
    // 4. The first write returns no id. Then the scheduling event arrives
    // twice more with nothing changed.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [ARI],
        jobs: [job("J401", "C1", "45 Wynnum Rd Norman Park", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
        failNextWrite: true,
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(60 * 60 * 1000);
      await build(world.ports());
      world.advance(60 * 60 * 1000);
      await build(world.ports());
    },
    holds: (w) => {
      const s = w.slotsFor("J401");
      const ws = writes(w, "J401");
      const failedIdx = w.calls.findIndex((c) => c.port === "write_job" && c.request.jobId === "J401" && c.response === null);
      const firstGood = w.calls.findIndex((c) => c.port === "write_job" && c.request.jobId === "J401" && c.response !== null);
      const sendIdx = w.calls.map((c, i) => (c.port === "send_sms" ? i : -1)).filter((i) => i >= 0);
      const creates = ws.filter((c) => c.response !== null && !("update" in c.request));
      return (
        s.length === 1 &&
        typeof s[0].externalId === "string" &&
        failedIdx >= 0 &&
        firstGood > failedIdx &&
        hasEsc(w, "J401", "write_failed") &&
        sendIdx.every((i) => i > firstGood) &&
        creates.length === 1 &&
        w.messagesTo("C1").length === 1
      );
    },
    describe: (w) => `slots for J401: ${w.slotsFor("J401").length}; writes: ${writes(w, "J401").map((c) => (c.response ? "ok" : "null")).join(",")}; messages: ${w.messagesTo("C1").length}; escalations: ${w.escalations.map((e) => e.reason).join(",") || "none"}`,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. One gas tech, a full morning. A burst gas line lands at 08:00-10:00
    // that only Sam's 08:00 slot can meet.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [SAM],
        jobs: [
          job("J501", "C1", "201 Given Tce Paddington", "08:00", "12:00", 120, { requires: ["gas"], customerSaid: "Annual service on the gas heater." }),
          job("J502", "C2", "9 Oxley Rd Corinda", "13:00", "17:00", 240, { requires: ["gas"], customerSaid: "New cooktop to connect." }),
        ],
        geocoder: GEO,
        defaultTravelMin: 30,
        consents: [consent("C1"), consent("C2"), consent("C3")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(30 * 60 * 1000);
      world.arriveEmergency(job("J503", "C3", "45 Wynnum Rd Norman Park", "08:00", "10:00", 60, { requires: ["gas"], urgency: "emergency", customerSaid: "I can smell gas in the laundry." }));
      await build(world.ports());
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
        techs: [ARI, SAM],
        jobs: [job("J601", "C1", "14 smith st sunnybank", "08:00", "12:00", 60), job("J602", "C2", "9 Oxley Rd Corinda", "08:00", "12:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(60 * 60 * 1000);
      await build(world.ports());
    },
    holds: (w) => {
      const consentIdx = idx(w, (c) => c.port === "gate" && c.request && c.request.consent === "C1" && c.request.channel === "sms" && c.response !== null);
      const sendIdx = idx(w, (c) => c.port === "send_sms" && c.request.to === "C1");
      return (
        w.messagesTo("C1").length === 1 &&
        consentIdx >= 0 &&
        sendIdx > consentIdx &&
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
        techs: [ARI],
        jobs: [job("J701", "C1", "3/88 Logan Rd Woolloongabba", "09:00", "13:00", 60, { customerSaid: "Water is pooling under the hot water unit and the pilot light keeps clicking." })],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const s = w.slotsFor("J701");
      const j = w.job("J701");
      if (s.length !== 1 || !j) return false;
      return w.noticesTo(s[0].techId).some(
        (n) =>
          n.jobId === "J701" &&
          n.address === GEO["3/88 Logan Rd Woolloongabba"] &&
          n.window !== undefined &&
          n.window.from === j.window.from &&
          n.window.to === j.window.to &&
          n.customerSaid === j.customerSaid,
      );
    },
    describe: (w) => `notices: ${JSON.stringify(w.notices.map((n) => n.notice))}`,
  },
  {
    checkId: "change-propagates-once",
    // 8. Slotted for the morning, then the customer moves to the afternoon.
    // The event then arrives once more with nothing changed.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [ARI],
        jobs: [job("J801", "C1", "201 Given Tce Paddington", "08:00", "10:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(30 * 60 * 1000);
      world.changeJob("J801", { window: { from: at("13:00"), to: at("15:00") } });
      await build(world.ports());
      world.advance(30 * 60 * 1000);
      await build(world.ports());
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
        techs: [SAM, JO, ARI],
        jobs: [
          job("J901", "C1", "45 Wynnum Rd Norman Park", "08:00", "12:00", 120, { requires: ["height"], customerSaid: "Gutter guard on the second storey has come away." }),
          job("J902", "C2", "Lot 7 behind the servo", "08:00", "12:00", 60),
          job("J903", "C3", "9 Oxley Rd Corinda", "08:00", "09:00", 120),
        ],
        geocoder: GEO,
        consents: [consent("C1"), consent("C2"), consent("C3")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
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
    // 10. One job slotted, the customer confirmed and the tech told. The
    // record is then read back by job id.
    world: () =>
      new DispatchWorld({
        now: NOW,
        techs: [ARI],
        jobs: [job("J1001", "C1", "14 smith st sunnybank", "10:00", "14:00", 60)],
        geocoder: GEO,
        consents: [consent("C1")],
        dispatcher: DISPATCHER,
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const rec = w.ports().readRecord("J1001");
      if (rec.slots.length !== 1 || rec.messages.length !== 1) return false;
      const s = rec.slots[0];
      const m = rec.messages[0];
      const author = (typeof s.updatedBy.person === "string" && s.updatedBy.person.length > 0) || (typeof s.updatedBy.rule === "string" && s.updatedBy.rule.length > 0);
      const evidenced = s.evidence.some((ref) => ref.includes(m.id) && ref.includes(m.sentAt));
      return typeof s.techId === "string" && typeof s.start === "string" && typeof s.externalId === "string" && author && typeof m.sentAt === "string" && evidenced && w.noticesTo(s.techId).length === 1;
    },
    describe: (w) => `slots: ${JSON.stringify(w.slots.map((s) => ({ id: s.id, techId: s.techId, externalId: s.externalId, by: s.updatedBy, evidence: s.evidence })))}; messages: ${w.messages.length}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not software. Declared in the PR and README: the node is
    // maintained by AI Pathway in a public repository, and runs on the
    // business's own job system account. The runner never scores this green.
    world: () => new DispatchWorld({ now: NOW }),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not run",
  },
];

// 12. The pass test runs only on the business's own job system, quoted as a
// scoped build. On the stub the runner reports it with_us.
export const liveScenarios = [];

/**
 * One scenario per check of dispatch-board-build-standard, for Visit Offer.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`
 * from https://aipathway.com.au/explore-ai/dispatch-board-build-standard. The
 * checks themselves are fetched at run time; what is here is the world each
 * check starts in, how the build is driven, and what "held" means.
 *
 * Every `holds` reads the recorded port calls (world.calls) or a read made
 * through a port, and returns a strict true or false. Each one was run against
 * a build that does nothing and against deliberately broken builds, and went
 * red for them.
 *
 * Times are UTC. 2026-09-27T22:00Z is 8am the next morning in Brisbane (AEST).
 */

import { DispatchWorld } from "@aipathway/conformance";

// The reasons the standard lists for an escalation (section 2, Escalation).
const ESCALATION_REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

const DAY = "2026-09-28";
const at = (hhmm) => `${DAY}T${hhmm}:00.000Z`;
const ms = (iso) => new Date(iso).getTime();
const MIN = 60 * 1000;

function job(id, over = {}) {
  return {
    id,
    customerId: `C-${id}`,
    address: `${id} street as typed`,
    window: { from: at("08:00"), to: at("12:00") },
    durationMin: 60,
    requires: [],
    urgency: "routine",
    status: "new",
    customerSaid: `Fault on ${id}, as the customer described it`,
    version: 1,
    ...over,
  };
}

const tech = (id, licences = []) => ({ id, name: `Tech ${id}`, licences, homeBase: "Depot, Brendale QLD 4500" });
const resolved = (id) => `${id} Example St, Brisbane QLD 4000`;
const geocode = (...ids) => Object.fromEntries(ids.map((id) => [`${id} street as typed`, resolved(id)]));
const consentFor = (...ids) => ids.map((id) => ({ customerId: `C-${id}`, channel: "email", givenAt: "2026-09-01T00:00:00.000Z" }));

/** Run the build once per scheduling event, marking where each run starts in the trace. */
async function runs(build, world, n, between) {
  world.runStarts = [];
  for (let i = 0; i < n; i += 1) {
    if (between && i > 0) between(world, i);
    world.runStarts.push(world.calls.length);
    await build(world.ports());
  }
}

const creates = (world, jobId) => world.calls.filter((c) => c.port === "write_job" && c.request?.jobId === jobId && !c.request?.update);
const writesFor = (world, jobId) =>
  world.calls.filter((c) => c.port === "write_job" && (c.request?.jobId === jobId || world.slots.some((s) => s.id === c.request?.update && s.jobId === jobId)));
const okWritesFor = (world, jobId) => writesFor(world, jobId).filter((c) => c.response && c.response.externalId);
const sendsTo = (world, customerId, fromIdx = 0) => world.calls.slice(fromIdx).filter((c) => c.port === "send_sms" && c.request?.to === customerId);
const noticesFor = (world, techId, fromIdx = 0) => world.calls.slice(fromIdx).filter((c) => c.port === "notify" && c.request?.techId === techId);
const escalationsFor = (world, jobId) => world.calls.filter((c) => c.port === "escalate" && c.request?.jobId === jobId);
const idx = (world, pred) => world.calls.findIndex(pred);
const inWindow = (start, end, w) => ms(start) >= ms(w.from) && ms(end) <= ms(w.to);
const describe = (world) =>
  `${world.calls.length} port call(s); slots ${JSON.stringify(world.slots.map((s) => [s.jobId, s.techId, s.start, s.end, s.externalId, s.displacedBy]))}; ` +
  `escalations ${JSON.stringify(world.escalations)}; messages ${world.messages.length}; notices ${world.notices.length}`;

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. No slot until the address resolves
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1"), job("J2", { address: "the yellow house past the servo, Samford" })],
        geocoder: geocode("J1"),
        consents: consentFor("J1", "J2"),
      }),
    drive: (build, world) => runs(build, world, 1),
    holds: (world) => {
      const resolveJ1 = idx(world, (c) => c.port === "resolve_address" && c.request?.raw === "J1 street as typed" && c.response?.resolved === resolved("J1"));
      const writeJ1 = idx(world, (c) => c.port === "write_job" && c.request?.jobId === "J1");
      const j1Writes = creates(world, "J1");
      const noJ2 = writesFor(world, "J2").length === 0 && sendsTo(world, "C-J2").length === 0;
      const j2Named = escalationsFor(world, "J2").some((c) => c.request.reason === "address_unresolved" && typeof c.request.owner === "string" && c.request.owner.length > 0);
      return resolveJ1 >= 0 && writeJ1 > resolveJ1 && j1Writes.length === 1 && j1Writes[0].request.address === resolved("J1") && noJ2 && j2Named;
    },
    describe,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A licence requirement is a rule read from the record, never assumed
    // The expired and the unlicensed tech are listed first, so a build that
    // takes the first free tech, or matches the code without the expiry, fails.
    world: () =>
      new DispatchWorld({
        techs: [
          tech("T-EXPIRED", [{ code: "gas", expires: "2026-03-31T00:00:00.000Z" }]),
          tech("T-NONE"),
          tech("T-GAS", [{ code: "gas", expires: "2027-06-30T00:00:00.000Z" }]),
        ],
        jobs: [job("J1", { requires: ["gas"], customerSaid: "Gas hot water unit will not light" })],
        geocoder: geocode("J1"),
        consents: consentFor("J1"),
      }),
    drive: (build, world) => runs(build, world, 1),
    holds: (world) => {
      const rule = idx(world, (c) => c.port === "read_rule" && c.request?.licence === "gas");
      const write = idx(world, (c) => c.port === "write_job");
      const w = writesFor(world, "J1");
      return rule >= 0 && write > rule && w.length === 1 && w[0].request.techId === "T-GAS" && world.calls.every((c) => c.port !== "write_job" || c.request?.techId === "T-GAS");
    },
    describe,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. The slot sits inside the customer's window and after the previous job plus travel
    // Travel between the two is 47 minutes, not the default 30, so a build that
    // guesses travel, or ignores it, lands the second visit too early.
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1", { window: { from: at("08:00"), to: at("10:00") } }), job("J2", { window: { from: at("08:00"), to: at("12:00") } })],
        geocoder: geocode("J1", "J2"),
        travelMin: { [`${resolved("J1")}>${resolved("J2")}`]: 47, [`${resolved("J2")}>${resolved("J1")}`]: 47 },
        consents: consentFor("J1", "J2"),
      }),
    drive: (build, world) => runs(build, world, 1),
    holds: (world) => {
      const w1 = okWritesFor(world, "J1");
      const w2 = okWritesFor(world, "J2");
      if (w1.length !== 1 || w2.length !== 1) return false;
      const a = w1[0].request;
      const b = w2[0].request;
      if (a.techId !== "T1" || b.techId !== "T1") return false;
      const [first, second] = ms(a.start) <= ms(b.start) ? [a, b] : [b, a];
      const travelRead = world.calls.some(
        (c) => c.port === "read_job" && c.request?.travel?.from === first.address && c.request?.travel?.to === second.address && c.response?.ms === 47 * MIN,
      );
      return (
        inWindow(a.start, a.end, { from: at("08:00"), to: at("10:00") }) &&
        inWindow(b.start, b.end, { from: at("08:00"), to: at("12:00") }) &&
        ms(second.start) >= ms(first.end) + 47 * MIN &&
        travelRead
      );
    },
    describe,
  },
  {
    checkId: "one-slot-per-job",
    // 4. One slot per job, written once, updated on a second event
    // The first write (JA's) returns no id. Then the whole board is woken a
    // second time with nothing changed.
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("JA"), job("JB", { window: { from: at("12:00"), to: at("16:00") } })],
        geocoder: geocode("JA", "JB"),
        consents: consentFor("JA", "JB"),
        failNextWrite: true,
      }),
    drive: (build, world) => runs(build, world, 2),
    holds: (world) => {
      const second = world.runStarts[1];
      // JB: exactly one slot with an id, and the second event made no new slot.
      const jb = world.slotsFor("JB");
      const jbCreates = creates(world, "JB");
      const jbFine = jb.length === 1 && Boolean(jb[0].externalId) && jbCreates.length === 1 && world.calls.indexOf(jbCreates[0]) < second;
      // JA: the null write was escalated, and nothing went out about it in that run.
      const failed = idx(world, (c) => c.port === "write_job" && c.request?.jobId === "JA" && c.response === null);
      const esc = idx(world, (c) => c.port === "escalate" && c.request?.jobId === "JA" && c.request?.reason === "write_failed" && Boolean(c.request?.owner));
      const firstRun = world.calls.slice(0, second);
      const jaQuiet =
        firstRun.filter((c) => c.port === "send_sms" && c.request?.to === "C-JA").length === 0 &&
        firstRun.filter((c) => c.port === "notify" && c.request?.jobId === "JA").length === 0;
      const noOrphanSend = world.calls.every((c) => c.port !== "send_sms" || world.slots.some((s) => s.id === c.request?.slotId && s.externalId));
      const atMostOne = ["JA", "JB"].every((id) => world.slotsFor(id).length <= 1);
      return jbFine && failed >= 0 && esc > failed && esc < second && jaQuiet && noOrphanSend && atMostOne;
    },
    describe,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. An emergency takes a slot only when a named dispatcher accepts the displacement
    // One tech, two routine visits filling the morning. A burst pipe arrives
    // whose window (8 to 10) only R1's slotted time can meet. R1's own window
    // runs to 4pm, so it can be re-slotted after R2.
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [
          job("R1", { durationMin: 120, window: { from: at("08:00"), to: at("16:00") } }),
          job("R2", { durationMin: 120, window: { from: at("10:30"), to: at("14:00") } }),
        ],
        geocoder: geocode("R1", "R2", "E1"),
        consents: consentFor("R1", "R2", "E1"),
        dispatcher: { name: "Lee Tran", accepts: true },
      }),
    drive: (build, world) =>
      runs(build, world, 2, (w) =>
        w.arriveEmergency(job("E1", { urgency: "emergency", window: { from: at("08:00"), to: at("10:00") }, customerSaid: "Burst pipe under the kitchen sink" })),
      ),
    holds: (world) => {
      const second = world.runStarts[1];
      const r1Before = world.calls.slice(0, second).some((c) => c.port === "write_job" && c.request?.jobId === "R1" && c.request?.start === at("08:00") && c.response?.externalId);
      const gate = idx(world, (c) => c.port === "gate" && c.request?.for === "E1" && c.response?.accepted === true && c.response?.person === "Lee Tran");
      const eWrite = idx(world, (c) => c.port === "write_job" && c.request?.jobId === "E1" && !c.request?.update);
      const e = world.slotsFor("E1");
      const r1 = world.slotsFor("R1");
      if (!r1Before || gate < 0 || eWrite <= gate || e.length !== 1 || r1.length !== 1) return false;
      const eByPerson = e[0].updatedBy?.person === "Lee Tran" && Boolean(e[0].externalId);
      const marked = r1[0].displacedBy === "E1";
      const clear = ms(r1[0].end) <= ms(e[0].start) || ms(r1[0].start) >= ms(e[0].end);
      const owned = escalationsFor(world, "R1").some((c) => c.request.reason === "displaced" && Boolean(c.request.owner));
      return eByPerson && marked && (clear || owned);
    },
    describe,
  },
  {
    checkId: "customer-told-once-with-consent",
    // 6. The customer is told once per slot, on a channel they consented to
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1"), job("J2", { window: { from: at("12:00"), to: at("16:00") } })],
        geocoder: geocode("J1", "J2"),
        consents: consentFor("J1"),
      }),
    drive: (build, world) => runs(build, world, 2),
    holds: (world) => {
      const second = world.runStarts[1];
      const toC1 = sendsTo(world, "C-J1");
      const consent = idx(world, (c) => c.port === "gate" && c.request?.consent === "C-J1" && c.request?.channel === "email" && c.response?.givenAt);
      const c1Once = toC1.length === 1 && toC1[0].request.channel === "email" && consent >= 0 && consent < world.calls.indexOf(toC1[0]);
      const noneAfter = world.calls.slice(second).every((c) => c.port !== "send_sms");
      const c2Silent = sendsTo(world, "C-J2").length === 0;
      const c2Named = escalationsFor(world, "J2").some((c) => c.request.reason === "no_consent" && Boolean(c.request.owner));
      const j2Slotted = okWritesFor(world, "J2").length === 1;
      return c1Once && noneAfter && c2Silent && c2Named && j2Slotted;
    },
    describe,
  },
  {
    checkId: "tech-told-with-the-record",
    // 7. The tech's notification carries the job, the address, the window and what the customer said
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1", { customerSaid: "Water heater is tripping the safety switch every morning" })],
        geocoder: geocode("J1"),
        consents: consentFor("J1"),
      }),
    drive: (build, world) => runs(build, world, 1),
    holds: (world) => {
      const w = okWritesFor(world, "J1");
      if (w.length !== 1) return false;
      const n = noticesFor(world, w[0].request.techId);
      return (
        n.length === 1 &&
        n[0].request.jobId === "J1" &&
        n[0].request.address === resolved("J1") &&
        n[0].request.window?.from === at("08:00") &&
        n[0].request.window?.to === at("12:00") &&
        n[0].request.customerSaid === "Water heater is tripping the safety switch every morning"
      );
    },
    describe,
  },
  {
    checkId: "change-propagates-once",
    // 8. A change to the job moves the slot and tells each affected party exactly once
    // Slotted and told; the customer moves to the afternoon; then the board is
    // woken once more with nothing changed.
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1")],
        geocoder: geocode("J1"),
        consents: consentFor("J1"),
      }),
    drive: (build, world) =>
      runs(build, world, 3, (w, i) => {
        if (i === 1) w.changeJob("J1", { window: { from: at("13:00"), to: at("16:00") } });
      }),
    holds: (world) => {
      const [, changed] = world.runStarts;
      const s = world.slotsFor("J1");
      if (s.length !== 1 || !s[0].externalId) return false;
      const moved = inWindow(s[0].start, s[0].end, { from: at("13:00"), to: at("16:00") }) && s[0].jobVersion === 2;
      const before = sendsTo(world, "C-J1").length - sendsTo(world, "C-J1", changed).length;
      const custAfter = sendsTo(world, "C-J1", changed).length;
      const techAfter = noticesFor(world, s[0].techId, changed).length;
      return moved && before === 1 && custAfter === 1 && techAfter === 1 && creates(world, "J1").length === 1;
    },
    describe,
  },
  {
    checkId: "unassignable-is-a-queue",
    // 9. A job that cannot be slotted is escalated with a reason and an owner
    world: () =>
      new DispatchWorld({
        techs: [tech("T1", [{ code: "gas", expires: "2026-03-31T00:00:00.000Z" }])],
        jobs: [
          job("JLIC", { requires: ["gas"] }),
          job("JADDR", { address: "somewhere near the old mill" }),
          job("JWIN", { durationMin: 90, window: { from: at("09:00"), to: at("09:30") } }),
        ],
        geocoder: geocode("JLIC", "JWIN"),
        consents: consentFor("JLIC", "JADDR", "JWIN"),
      }),
    drive: (build, world) => runs(build, world, 1),
    holds: (world) => {
      const want = { JLIC: "no_licensed_tech", JADDR: "address_unresolved", JWIN: "window_impossible" };
      return Object.entries(want).every(([id, reason]) => {
        const e = escalationsFor(world, id);
        return (
          writesFor(world, id).length === 0 &&
          e.length >= 1 &&
          e.every((c) => ESCALATION_REASONS.includes(c.request.reason) && typeof c.request.owner === "string" && c.request.owner.length > 0) &&
          e.some((c) => c.request.reason === reason)
        );
      });
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    // 10. Who was assigned, when, by whom or by which rule, and what the customer was told are retrievable by job
    world: () =>
      new DispatchWorld({
        techs: [tech("T1")],
        jobs: [job("J1")],
        geocoder: geocode("J1"),
        consents: consentFor("J1"),
      }),
    drive: async (build, world) => {
      await runs(build, world, 1);
      // The customer rings: "nobody told me". Read the record through the port.
      world.record = world.ports().readRecord("J1");
    },
    holds: (world) => {
      const r = world.record;
      if (!r || r.slots.length !== 1 || r.messages.length !== 1) return false;
      const s = r.slots[0];
      const m = r.messages[0];
      const author = Boolean(s.updatedBy?.person || s.updatedBy?.rule);
      return (
        Boolean(s.techId) &&
        Boolean(s.start) &&
        Boolean(s.externalId) &&
        author &&
        Boolean(m.sentAt) &&
        m.slotId === s.id &&
        s.evidence.some((ref) => ref.includes(m.id) && ref.includes(m.sentAt))
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 11. It survives the builder
    // Not a software property. The runner reports it as evidence_required and
    // never runs this; it stays false so nothing here could ever score it.
    world: () => new DispatchWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test needs the business's own job system: one job scheduled twice,
// one licence-gated job, one emergency with a dispatcher's acceptance and one
// change, all on real ids. On the stub the runner reports it as `with_us`; the
// write into the schedule and the consented customer message are quoted as a
// scoped build. Nothing here drives it.
export const liveScenarios = [];

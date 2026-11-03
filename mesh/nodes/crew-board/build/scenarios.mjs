/**
 * One scenario per check of dispatch-board-build-standard, for Crew Board.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`
 * from https://aipathway.com.au/explore-ai/dispatch-board-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the runner's non-recording views of the board), never the build's own
 * memory, and returns a strict true or false.
 *
 * The crew is a lawn care and garden maintenance business in Brisbane: a
 * mower round, a tree crew that needs a working-at-heights ticket, and an
 * irrigation tech who needs a current plumbing licence for backflow work.
 */

import { DispatchWorld } from "@aipathway/conformance";

// The escalation reasons the standard lists (section 2, Escalation.reason).
const ESCALATION_REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

// Times are AEST (+10:00), the day after the world's clock (2026-09-26 10:00 AEST).
const at = (hhmm) => `2026-09-27T${hhmm}:00+10:00`;
const win = (from, to) => ({ from: at(from), to: at(to) });
const ms = (s) => new Date(s).getTime();

const SAM = { id: "T-SAM", name: "Sam Nguyen", homeBase: "Yard, Geebung QLD 4034", licences: [{ code: "plumbing", expires: "2027-06-30T00:00:00.000Z" }] };
const JO = { id: "T-JO", name: "Jo Walsh", homeBase: "Yard, Geebung QLD 4034", licences: [{ code: "plumbing", expires: "2026-03-31T00:00:00.000Z" }] };
const ARI = { id: "T-ARI", name: "Ari Patel", homeBase: "Yard, Geebung QLD 4034", licences: [] };

const GEO = {
  "14 Banksia St Aspley": "14 Banksia Street, Aspley QLD 4034",
  "3 Wattle Ct Chermside": "3 Wattle Court, Chermside QLD 4032",
  "88 Gympie Rd Kedron": "88 Gympie Road, Kedron QLD 4031",
  "5 Fig Tree Pocket Rd": "5 Fig Tree Pocket Road, Fig Tree Pocket QLD 4069",
};
const A1 = GEO["14 Banksia St Aspley"];
const A2 = GEO["3 Wattle Ct Chermside"];

const job = (id, customerId, address, window, extra = {}) => ({
  id,
  customerId,
  address,
  window,
  durationMin: 60,
  requires: [],
  urgency: "routine",
  status: "new",
  customerSaid: "Front lawn is knee high and the side gate sticks.",
  version: 1,
  ...extra,
});

const consent = (customerId) => ({ customerId, channel: "sms", givenAt: "2026-09-01T00:00:00.000Z" });

const callsOf = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const idx = (world, port, pred) => world.calls.findIndex((c) => c.port === port && pred(c));
const newSlotWrite = (jobId) => (c) => c.port === "write_job" && c.request?.jobId === jobId && c.request?.update === undefined && c.response !== null;
const sendsTo = (calls, customerId) => calls.filter((c) => c.port === "send_sms" && c.request?.to === customerId);
const insideWindow = (slot, window) => ms(slot.start) >= ms(window.from) && ms(slot.end) <= ms(window.to) && ms(slot.end) > ms(slot.start);
const owned = (e) => typeof e.owner === "string" && e.owner.trim().length > 0;

const summary = (world) =>
  `${world.calls.length} port call(s); slots ${world.slots.map((s) => `${s.jobId}@${s.techId} ${s.start}-${s.end}`).join(", ") || "none"}; ` +
  `escalations ${world.escalations.map((e) => `${e.jobId}:${e.reason}:${e.owner}`).join(", ") || "none"}; ` +
  `messages ${world.messages.length}; notices ${world.notices.length}`;

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. One job whose address resolves, one whose address does not.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        consents: [consent("C-1"), consent("C-2")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00")), job("J-2", "C-2", "Unit 4 the one near the servo", win("07:00", "12:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
    },
    holds: (world) => {
      const resolveJ1 = idx(world, "resolve_address", (c) => c.request?.raw === "14 Banksia St Aspley" && c.response?.resolved === A1);
      const writeJ1 = world.calls.findIndex(newSlotWrite("J-1"));
      const s1 = world.slotsFor("J-1");
      const noWriteJ2 = callsOf(world, "write_job", (c) => c.request?.jobId === "J-2").length === 0;
      const esc2 = world.escalationsFor("J-2").some((e) => e.reason === "address_unresolved" && owned(e));
      return resolveJ1 >= 0 && writeJ1 > resolveJ1 && s1.length === 1 && s1[0].address === A1 && world.slotsFor("J-2").length === 0 && noWriteJ2 && esc2;
    },
    describe: summary,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A backflow test needing a current plumbing licence; the unlicensed and the lapsed tech are listed first.
    world: () =>
      new DispatchWorld({
        techs: [ARI, JO, SAM],
        geocoder: GEO,
        consents: [consent("C-1")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00"), { requires: ["plumbing"], customerSaid: "Council letter says the backflow valve test is overdue." })],
      }),
    drive: async (build, world) => {
      await build(world.ports());
    },
    holds: (world) => {
      const rule = idx(world, "read_rule", (c) => c.request?.licence === "plumbing");
      const write = world.calls.findIndex(newSlotWrite("J-1"));
      const s = world.slotsFor("J-1");
      const wrongTech = callsOf(world, "write_job", (c) => c.request?.techId === JO.id || c.request?.techId === ARI.id).length > 0;
      return rule >= 0 && write > rule && s.length === 1 && s[0].techId === SAM.id && world.licenceCurrent(SAM.id, "plumbing") && !wrongTech;
    },
    describe: summary,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. Two mows on one tech, morning windows, 45 minutes' travel between the two resolved addresses.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        travelMin: { [`${A1}>${A2}`]: 45, [`${A2}>${A1}`]: 45 },
        defaultTravelMin: 5,
        consents: [consent("C-1"), consent("C-2"), consent("C-3")],
        jobs: [
          job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "09:00")),
          job("J-2", "C-2", "3 Wattle Ct Chermside", win("08:30", "10:00")),
          job("J-3", "C-3", "88 Gympie Rd Kedron", win("10:30", "12:30")),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
    },
    holds: (world) => {
      const ids = ["J-1", "J-2", "J-3"];
      if (!ids.every((id) => world.slotsFor(id).length === 1)) return false;
      const slots = ids.map((id) => world.slotsFor(id)[0]).sort((a, b) => ms(a.start) - ms(b.start));
      const inside = ids.every((id) => insideWindow(world.slotsFor(id)[0], world.job(id).window));
      const sameTech = slots.every((s) => s.techId === slots[0].techId);
      let travelHeld = true;
      for (let i = 1; i < slots.length; i++) {
        const prev = slots[i - 1];
        const cur = slots[i];
        const travel = world.travel(prev.address, cur.address);
        const read = callsOf(world, "read_job", (c) => c.request?.travel?.from === prev.address && c.request?.travel?.to === cur.address).length > 0;
        if (!(ms(cur.start) >= ms(prev.end) + travel && read)) travelHeld = false;
      }
      return inside && sameTech && travelHeld;
    },
    describe: summary,
  },
  {
    checkId: "one-slot-per-job",
    // 4. The first write returns no id; then the whole scheduling event is delivered a second time.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        failNextWrite: true,
        consents: [consent("C-F"), consent("C-1")],
        jobs: [job("J-F", "C-F", "88 Gympie Rd Kedron", win("07:00", "10:00")), job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.firstRunCalls = world.calls.length;
      world.advance(60 * 60 * 1000);
      await build(world.ports());
    },
    holds: (world) => {
      const split = world.firstRunCalls;
      if (typeof split !== "number") return false;
      const run1 = world.calls.slice(0, split);
      const run2 = world.calls.slice(split);
      const s1 = world.slotsFor("J-1");
      const oneWithId = s1.length === 1 && typeof s1[0].externalId === "string" && s1[0].externalId.length > 0;
      const run2NewWriteJ1 = run2.filter(newSlotWrite("J-1")).length;
      const failed = run1.some((c) => c.port === "write_job" && c.request?.jobId === "J-F" && c.response === null);
      const escalatedFailed = run1.some((c) => c.port === "escalate" && c.request?.jobId === "J-F" && c.request?.reason === "write_failed" && typeof c.request?.owner === "string" && c.request.owner.length > 0);
      const nothingSentAboutFailed = sendsTo(run1, "C-F").length === 0 && run1.filter((c) => c.port === "notify" && c.request?.jobId === "J-F").length === 0;
      const atMostOneF = world.slotsFor("J-F").length <= 1;
      const j1Told = world.messagesTo("C-1").length === 1;
      return oneWithId && run2NewWriteJ1 === 0 && failed && escalatedFailed && nothingSentAboutFailed && atMostOneF && j1Told;
    },
    describe: summary,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. One tech with a routine mow at 7, then a burst irrigation main whose window only that time meets.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        defaultTravelMin: 15,
        consents: [consent("C-1"), consent("C-E")],
        dispatcher: { name: "Lee Tran", accepts: true },
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.arriveEmergency(
        job("J-E", "C-E", "3 Wattle Ct Chermside", win("07:00", "08:10"), { urgency: "emergency", customerSaid: "Irrigation main has burst and is flooding the driveway." }),
      );
      await build(world.ports());
    },
    holds: (world) => {
      const gate = idx(world, "gate", (c) => c.request?.displace !== undefined && c.request?.for === "J-E" && c.response?.accepted === true && c.response?.person === "Lee Tran");
      const eWrite = world.calls.findIndex(newSlotWrite("J-E"));
      const [es] = world.slotsFor("J-E");
      const d = world.slotsFor("J-1");
      if (!es || world.slotsFor("J-E").length !== 1 || d.length !== 1) return false;
      const ds = d[0];
      const overlaps = ms(ds.start) < ms(es.end) && ms(ds.end) > ms(es.start) && ds.techId === es.techId;
      const escalated = world.escalationsFor("J-1").some(owned);
      return gate >= 0 && eWrite > gate && es.updatedBy?.person === "Lee Tran" && ds.displacedBy === "J-E" && (!overlaps || escalated);
    },
    describe: summary,
  },
  {
    checkId: "customer-told-once-with-consent",
    // 6. Two jobs slotted, one customer with SMS consent and one without; the event then arrives again unchanged.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        consents: [consent("C-1")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00")), job("J-2", "C-2", "3 Wattle Ct Chermside", win("07:00", "12:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(30 * 60 * 1000);
      await build(world.ports());
    },
    holds: (world) => {
      const sends1 = sendsTo(world.calls, "C-1");
      const check1 = idx(world, "gate", (c) => c.request?.consent === "C-1" && c.request?.channel === "sms" && c.response !== null);
      const send1 = idx(world, "send_sms", (c) => c.request?.to === "C-1");
      const toC2 = sendsTo(world.calls, "C-2").length;
      const named = world.escalationsFor("J-2").some((e) => e.reason === "no_consent" && owned(e));
      const sentOnConsented = sends1.every((c) => c.request?.channel === "sms");
      return world.slotsFor("J-1").length === 1 && world.slotsFor("J-2").length === 1 && sends1.length === 1 && check1 >= 0 && send1 > check1 && sentOnConsented && toC2 === 0 && named;
    },
    describe: summary,
  },
  {
    checkId: "tech-told-with-the-record",
    // 7. One job whose customer described the job when booking.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        consents: [consent("C-1")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00"), { customerSaid: "Dog is out the back, please use the side gate and leave the clippings." })],
      }),
    drive: async (build, world) => {
      await build(world.ports());
    },
    holds: (world) => {
      const [s] = world.slotsFor("J-1");
      if (!s) return false;
      const j = world.job("J-1");
      const notices = world.noticesTo(s.techId);
      const full = notices.filter(
        (n) =>
          n.jobId === "J-1" &&
          n.address === A1 &&
          n.window?.from === j.window.from &&
          n.window?.to === j.window.to &&
          n.customerSaid === "Dog is out the back, please use the side gate and leave the clippings.",
      );
      return notices.length === 1 && full.length === 1;
    },
    describe: summary,
  },
  {
    checkId: "change-propagates-once",
    // 8. A slotted morning mow whose customer moves the window to the afternoon.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        consents: [consent("C-1")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "10:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.changeJob("J-1", { window: win("13:00", "16:00") });
      world.advance(20 * 60 * 1000);
      await build(world.ports());
    },
    holds: (world) => {
      const s = world.slotsFor("J-1");
      if (s.length !== 1) return false;
      const j = world.job("J-1");
      const since = world.callsSinceMark();
      const custAfter = sendsTo(since, "C-1").length;
      const techAfter = since.filter((c) => c.port === "notify" && c.request?.techId === s[0].techId && c.request?.jobId === "J-1").length;
      const updatedInPlace = since.some((c) => c.port === "write_job" && c.request?.update === s[0].id && c.response !== null);
      const noNewSlot = since.filter(newSlotWrite("J-1")).length === 0;
      return j.version === 2 && s[0].jobVersion === 2 && insideWindow(s[0], j.window) && updatedInPlace && noNewSlot && custAfter === 1 && techAfter === 1 && world.messagesTo("C-1").length === 2;
    },
    describe: summary,
  },
  {
    checkId: "unassignable-is-a-queue",
    // 9. A tree job needing a heights ticket nobody holds, an address that will not resolve, a 30-minute window for an hour's work.
    world: () =>
      new DispatchWorld({
        techs: [ARI, JO, SAM],
        geocoder: GEO,
        consents: [consent("C-H"), consent("C-A"), consent("C-W")],
        jobs: [
          job("J-H", "C-H", "5 Fig Tree Pocket Rd", win("07:00", "15:00"), { requires: ["height"], customerSaid: "Gum tree limb hanging over the roof." }),
          job("J-A", "C-A", "behind the big shed off the highway", win("07:00", "15:00")),
          job("J-W", "C-W", "88 Gympie Rd Kedron", win("09:00", "09:30")),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
    },
    holds: (world) => {
      const want = { "J-H": "no_licensed_tech", "J-A": "address_unresolved", "J-W": "window_impossible" };
      return Object.entries(want).every(([id, reason]) => {
        const esc = world.escalationsFor(id);
        return world.slotsFor(id).length === 0 && esc.length > 0 && esc.every((e) => ESCALATION_REASONS.includes(e.reason) && owned(e)) && esc.some((e) => e.reason === reason);
      });
    },
    describe: summary,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job slotted, the customer confirmed and the tech told; then the record is read by job id.
    world: () =>
      new DispatchWorld({
        techs: [ARI],
        geocoder: GEO,
        consents: [consent("C-1")],
        jobs: [job("J-1", "C-1", "14 Banksia St Aspley", win("07:00", "12:00"))],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.recordRead = world.ports().readRecord("J-1");
    },
    holds: (world) => {
      const r = world.recordRead;
      if (!r || !Array.isArray(r.slots) || r.slots.length !== 1) return false;
      const s = r.slots[0];
      const author = (typeof s.updatedBy?.person === "string" && s.updatedBy.person.length > 0) || (typeof s.updatedBy?.rule === "string" && s.updatedBy.rule.length > 0);
      const msgs = r.messages.filter((m) => m.to === "C-1" && typeof m.sentAt === "string" && m.slotId === s.id);
      const attached = msgs.length === 1 && s.evidence.some((ref) => ref.includes(msgs[0].id));
      const readByJob = callsOf(world, "read_job", (c) => c.request?.record === "J-1").length === 1;
      return readByJob && typeof s.techId === "string" && typeof s.start === "string" && typeof s.externalId === "string" && author && attached;
    },
    describe: (world) => `${summary(world)}; record ${JSON.stringify(world.recordRead ?? null)}`,
  },
];

// The pass test runs only on the real job system. With no live port map
// published for this standard there is no production run, so it reports
// with_us. Its holds is written so that when a live world exists it asserts
// the four parts of the pass test rather than passing on silence.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new DispatchWorld(),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const byJob = new Map();
      for (const s of world.slots) byJob.set(s.jobId, (byJob.get(s.jobId) ?? 0) + 1);
      const onePerJob = byJob.size > 0 && [...byJob.values()].every((n) => n === 1);
      const allIds = world.slots.every((s) => typeof s.externalId === "string" && s.externalId.length > 0);
      const consented = world.messages.every((m) => world.consentFor(m.to, m.channel) !== null);
      const accepted = world.slots.filter((s) => s.displacedBy).every(() => world.acceptances.some((a) => a.accepted === true && a.person));
      return onePerJob && allIds && consented && accepted;
    },
    describe: summary,
  },
];

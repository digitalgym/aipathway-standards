/**
 * One scenario per check of dispatch-board-build-standard, for Repair Board.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`
 * from https://aipathway.com.au/explore-ai/dispatch-board-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a property manager's maintenance board in Brisbane: residents
 * (the "customers"), trades on the agency's panel (the "techs") with their
 * Queensland licences, and the property manager on the desk (the dispatcher).
 * Every `holds` reads the world's recorded trace (world.calls), using the
 * world's non-recording twins only to count what is on the board.
 */

import { DispatchWorld } from "@aipathway/conformance";

const ESCALATION_REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

// The world's clock is 2026-09-26T00:00Z, 10am in Brisbane.
const at = (h, m = 0) => new Date(Date.UTC(2026, 8, 26, h, m)).toISOString();
const ms = (s) => new Date(s).getTime();

const job = (id, o = {}) => ({
  id,
  customerId: o.customerId ?? `R-${id}`,
  address: o.address ?? `${id} raw`,
  window: o.window ?? { from: at(0), to: at(6) },
  durationMin: o.durationMin ?? 60,
  requires: o.requires ?? [],
  urgency: o.urgency ?? "routine",
  status: "new",
  customerSaid: o.customerSaid ?? "The tap in the kitchen will not stop dripping.",
  version: 1,
});
const tech = (id, licences = []) => ({ id, name: id, licences, homeBase: "Woolloongabba QLD 4102" });
const consent = (customerId) => ({ customerId, channel: "sms", givenAt: "2026-07-01T00:00:00.000Z" });
const geo = (...raws) => Object.fromEntries(raws.map((r) => [r, `${r}, QLD (resolved)`]));

const callsOf = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const idx = (world, port, pred = () => true) => world.calls.findIndex((c) => c.port === port && pred(c));
const creates = (world, jobId) => callsOf(world, "write_job", (c) => c.request?.jobId === jobId && !c.request?.update);
const writesFor = (world, jobId) => callsOf(world, "write_job", (c) => c.request?.jobId === jobId);
const smsTo = (world, customerId, calls = world.calls) => calls.filter((c) => c.port === "send_sms" && c.request?.to === customerId);
const noticesTo = (world, techId, calls = world.calls) => calls.filter((c) => c.port === "notify" && c.request?.techId === techId);
const escFor = (world, jobId, reason) =>
  callsOf(world, "escalate", (c) => c.request?.jobId === jobId && (!reason || c.request?.reason === reason) && typeof c.request?.owner === "string" && c.request.owner.trim().length > 0);
const isoOk = (s) => typeof s === "string" && Number.isFinite(ms(s));

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. A job at a Paddington house that resolves, and one at a unit whose address does not.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [job("WO-101", { address: "12 Latrobe Tce Paddington" }), job("WO-102", { address: "Unit 4, the old Rosewood block" })],
        geocoder: geo("12 Latrobe Tce Paddington"),
        consents: [consent("R-WO-101"), consent("R-WO-102")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const resolved = "12 Latrobe Tce Paddington, QLD (resolved)";
      const r = idx(world, "resolve_address", (c) => c.request?.raw === "12 Latrobe Tce Paddington" && c.response?.resolved === resolved);
      const w = idx(world, "write_job", (c) => c.request?.jobId === "WO-101");
      const slotted = creates(world, "WO-101");
      return (
        r >= 0 &&
        w > r &&
        slotted.length === 1 &&
        slotted[0].request.address === resolved &&
        writesFor(world, "WO-102").length === 0 &&
        world.slotsFor("WO-102").length === 0 &&
        escFor(world, "WO-102", "address_unresolved").length === 1
      );
    },
    describe: (world) =>
      `writes: ${callsOf(world, "write_job").map((c) => `${c.request.jobId}@${c.request.address}`).join("; ") || "none"}; escalations: ${callsOf(world, "escalate").map((c) => `${c.request.jobId}:${c.request.reason}`).join(", ") || "none"}`,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A gas hot water job. The expired gas fitter and the unlicensed handyman are listed first.
    world: () =>
      new DispatchWorld({
        techs: [
          tech("TR-EXPIRED", [{ code: "gas", expires: "2026-03-31T00:00:00.000Z" }]),
          tech("TR-HANDY"),
          tech("TR-GAS", [{ code: "gas", expires: "2027-06-30T00:00:00.000Z" }]),
        ],
        jobs: [job("WO-201", { address: "8 Merthyr Rd New Farm", requires: ["gas"], customerSaid: "No hot water and I can smell gas near the unit." })],
        geocoder: geo("8 Merthyr Rd New Farm"),
        consents: [consent("R-WO-201")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const rule = idx(world, "read_rule", (c) => c.request?.licence === "gas");
      const w = idx(world, "write_job", (c) => c.request?.jobId === "WO-201");
      const writes = writesFor(world, "WO-201");
      return rule >= 0 && w > rule && writes.length === 1 && writes.every((c) => c.request.techId === "TR-GAS");
    },
    describe: (world) => `rule reads: ${callsOf(world, "read_rule").map((c) => c.request.licence).join(", ") || "none"}; assigned: ${writesFor(world, "WO-201").map((c) => c.request.techId).join(", ") || "none"}`,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. Two morning jobs on one trade, 40 minutes apart by the travel table.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [
          job("WO-301", { address: "3 Baroona Rd Milton", window: { from: at(0), to: at(3) } }),
          job("WO-302", { address: "41 Kent St Teneriffe", window: { from: at(0), to: at(3) } }),
        ],
        geocoder: geo("3 Baroona Rd Milton", "41 Kent St Teneriffe"),
        travelMin: { "3 Baroona Rd Milton, QLD (resolved)>41 Kent St Teneriffe, QLD (resolved)": 40, "41 Kent St Teneriffe, QLD (resolved)>3 Baroona Rd Milton, QLD (resolved)": 40 },
        defaultTravelMin: 5,
        consents: [consent("R-WO-301"), consent("R-WO-302")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const ws = callsOf(world, "write_job").map((c) => c.request);
      if (ws.length !== 2) return false;
      const win = { "WO-301": [at(0), at(3)], "WO-302": [at(0), at(3)] };
      const inWindow = ws.every((w) => win[w.jobId] && ms(w.start) >= ms(win[w.jobId][0]) && ms(w.end) <= ms(win[w.jobId][1]));
      const [first, second] = [...ws].sort((a, b) => ms(a.start) - ms(b.start));
      const travel = callsOf(world, "read_job", (c) => c.request?.travel?.from === first.address && c.request?.travel?.to === second.address)[0];
      if (!travel) return false;
      return inWindow && first.techId === second.techId && ms(second.start) >= ms(first.end) + travel.response.ms && travel.response.ms === 40 * 60 * 1000;
    },
    describe: (world) => `slots: ${callsOf(world, "write_job").map((c) => `${c.request.jobId} ${c.request.start}..${c.request.end}`).join("; ") || "none"}; travel reads: ${callsOf(world, "read_job", (c) => c.request?.travel).length}`,
  },
  {
    checkId: "one-slot-per-job",
    // 4. The scheduling event for WO-401 delivered twice; WO-400's write comes back with no id.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [job("WO-400", { address: "9 Ivory St Fortitude Valley" }), job("WO-401", { address: "22 Sydney St New Farm" })],
        geocoder: geo("9 Ivory St Fortitude Valley", "22 Sydney St New Farm"),
        consents: [consent("R-WO-400"), consent("R-WO-401")],
        failNextWrite: true,
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(60 * 60 * 1000);
      await b(world.ports());
    },
    holds: (world) => {
      const slots = world.slotsFor("WO-401");
      const once = slots.length === 1 && typeof slots[0].externalId === "string" && slots[0].externalId.length > 0;
      const created = creates(world, "WO-401").length === 1;
      const msgs = smsTo(world, "R-WO-401").length === 1;
      // The write that returned no id: escalated, and nothing sent to that resident before the next good write.
      const failed = idx(world, "write_job", (c) => c.request?.jobId === "WO-400" && c.response === null);
      if (failed < 0) return false;
      const nextGood = world.calls.findIndex((c, i) => i > failed && c.port === "write_job" && c.request?.jobId === "WO-400" && c.response?.externalId);
      const window = world.calls.slice(failed + 1, nextGood < 0 ? undefined : nextGood);
      const escalated = window.some((c) => c.port === "escalate" && c.request?.jobId === "WO-400" && c.request?.reason === "write_failed" && c.request?.owner);
      const silent = !window.some((c) => (c.port === "send_sms" && c.request?.to === "R-WO-400") || (c.port === "notify" && c.request?.jobId === "WO-400"));
      return once && created && msgs && escalated && silent;
    },
    describe: (world) => `WO-401 slots ${world.slotsFor("WO-401").length}, creates ${creates(world, "WO-401").length}; WO-400 escalations ${callsOf(world, "escalate", (c) => c.request?.jobId === "WO-400").map((c) => c.request.reason).join(", ") || "none"}`,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. One plumber, a routine leaking-tap visit booked first thing, then a P1 burst pipe whose window only that time meets.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-PLUMB")],
        jobs: [job("WO-501", { address: "5 Annie St Kangaroo Point", window: { from: at(0), to: at(6) }, durationMin: 120 })],
        geocoder: geo("5 Annie St Kangaroo Point", "17 Wellington Rd East Brisbane"),
        consents: [consent("R-WO-501"), consent("R-WO-599")],
        dispatcher: { name: "Priya Shah (property manager)", accepts: true },
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.arriveEmergency(
        job("WO-599", { address: "17 Wellington Rd East Brisbane", window: { from: at(0), to: at(1, 30) }, durationMin: 60, urgency: "emergency", customerSaid: "A pipe has burst under the bathroom sink and water is going everywhere." }),
      );
      await b(world.ports());
    },
    holds: (world) => {
      const gate = idx(world, "gate", (c) => c.request?.for === "WO-599" && c.response?.accepted === true && typeof c.response?.person === "string" && c.response.person.length > 0);
      const eWrites = writesFor(world, "WO-599");
      if (gate < 0 || eWrites.length !== 1) return false;
      const eIdx = world.calls.indexOf(eWrites[0]);
      const person = world.calls[gate].response.person;
      const eSlot = world.slotsFor("WO-599")[0];
      const d = world.slotsFor("WO-501");
      if (!eSlot || d.length !== 1) return false;
      const disp = d[0];
      const outside = ms(disp.end) <= ms(eSlot.start) || ms(disp.start) >= ms(eSlot.end);
      const escalated = escFor(world, "WO-501").length > 0;
      return eIdx > gate && eWrites[0].request.by?.person === person && disp.displacedBy === "WO-599" && (outside || escalated);
    },
    describe: (world) =>
      `gate: ${callsOf(world, "gate", (c) => c.request?.displace).map((c) => `${c.response?.person}:${c.response?.accepted}`).join(", ") || "none"}; slots: ${world.slots.map((s) => `${s.jobId} ${s.start}..${s.end}${s.displacedBy ? ` displacedBy ${s.displacedBy}` : ""}`).join("; ") || "none"}`,
  },
  {
    checkId: "customer-told-once-with-consent",
    // 6. Two residents; only one consented to texts. The event arrives again with nothing changed.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [job("WO-601", { address: "2 Moray St New Farm", customerId: "R-YES" }), job("WO-602", { address: "60 Bowen Tce New Farm", customerId: "R-NO" })],
        geocoder: geo("2 Moray St New Farm", "60 Bowen Tce New Farm"),
        consents: [consent("R-YES")],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(30 * 60 * 1000);
      await b(world.ports());
    },
    holds: (world) => {
      const yes = smsTo(world, "R-YES");
      if (yes.length !== 1 || yes[0].request.channel !== "sms") return false;
      const sendIdx = world.calls.indexOf(yes[0]);
      const checked = world.calls.findIndex((c, i) => i < sendIdx && c.port === "gate" && c.request?.consent === "R-YES" && c.request?.channel === "sms" && c.response);
      return checked >= 0 && smsTo(world, "R-NO").length === 0 && escFor(world, "WO-602", "no_consent").length >= 1;
    },
    describe: (world) => `texts: R-YES ${smsTo(world, "R-YES").length}, R-NO ${smsTo(world, "R-NO").length}; escalations: ${callsOf(world, "escalate").map((c) => `${c.request.jobId}:${c.request.reason}`).join(", ") || "none"}`,
  },
  {
    checkId: "tech-told-with-the-record",
    // 7. One job whose resident described the fault when they reported it.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-ELEC", [{ code: "electrical", expires: "2027-12-31T00:00:00.000Z" }])],
        jobs: [
          job("WO-701", {
            address: "14 Gray Rd West End",
            requires: ["electrical"],
            window: { from: at(1), to: at(5) },
            customerSaid: "The power point by the fridge sparked and the safety switch keeps tripping.",
          }),
        ],
        geocoder: geo("14 Gray Rd West End"),
        consents: [consent("R-WO-701")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const n = noticesTo(world, "TR-ELEC");
      if (n.length !== 1) return false;
      const r = n[0].request;
      return (
        r.jobId === "WO-701" &&
        r.address === "14 Gray Rd West End, QLD (resolved)" &&
        r.window?.from === at(1) &&
        r.window?.to === at(5) &&
        r.customerSaid === "The power point by the fridge sparked and the safety switch keeps tripping."
      );
    },
    describe: (world) => `notices: ${JSON.stringify(callsOf(world, "notify").map((c) => c.request))}`,
  },
  {
    checkId: "change-propagates-once",
    // 8. The resident moves the window after the visit is booked and they were told. The board runs twice after.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [job("WO-801", { address: "30 Hawthorne Rd Bulimba", window: { from: at(0), to: at(2) } })],
        geocoder: geo("30 Hawthorne Rd Bulimba"),
        consents: [consent("R-WO-801")],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.changeJob("WO-801", { window: { from: at(4), to: at(7) } });
      await b(world.ports());
      world.advance(15 * 60 * 1000);
      await b(world.ports());
    },
    holds: (world) => {
      const slots = world.slotsFor("WO-801");
      if (slots.length !== 1) return false;
      const s = slots[0];
      const inNew = ms(s.start) >= ms(at(4)) && ms(s.end) <= ms(at(7));
      const before = world.calls.slice(0, world.marks[0]);
      const after = world.callsSinceMark();
      const toldBefore = smsTo(world, "R-WO-801", before).length === 1;
      const writesAfter = after.filter((c) => c.port === "write_job");
      const updatedInPlace = writesAfter.length === 1 && writesAfter[0].request.update === s.id;
      return inNew && toldBefore && updatedInPlace && smsTo(world, "R-WO-801", after).length === 1 && noticesTo(world, s.techId, after).length === 1;
    },
    describe: (world) => {
      const after = world.callsSinceMark();
      return `slots ${world.slotsFor("WO-801").map((s) => `${s.start}..${s.end}`).join("; ") || "none"}; after change: ${after.filter((c) => c.port === "write_job").length} write(s), ${smsTo(world, "R-WO-801", after).length} text(s), ${after.filter((c) => c.port === "notify").length} notice(s)`;
    },
  },
  {
    checkId: "unassignable-is-a-queue",
    // 9. A switchboard job no current electrician holds, an address that will not resolve, a window shorter than the job.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1", [{ code: "electrical", expires: "2026-05-01T00:00:00.000Z" }])],
        jobs: [
          job("WO-901", { address: "1 Petrie Tce Red Hill", requires: ["electrical"] }),
          job("WO-902", { address: "Behind the shops somewhere in Ashgrove" }),
          job("WO-903", { address: "77 Oxford St Bulimba", window: { from: at(2), to: at(2, 30) }, durationMin: 90 }),
        ],
        geocoder: geo("1 Petrie Tce Red Hill", "77 Oxford St Bulimba"),
        consents: [consent("R-WO-901"), consent("R-WO-902"), consent("R-WO-903")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const want = { "WO-901": "no_licensed_tech", "WO-902": "address_unresolved", "WO-903": "window_impossible" };
      return Object.entries(want).every(
        ([id, reason]) => writesFor(world, id).length === 0 && escFor(world, id, reason).length >= 1 && escFor(world, id).every((c) => ESCALATION_REASONS.includes(c.request.reason)),
      );
    },
    describe: (world) => `writes ${callsOf(world, "write_job").length}; escalations: ${callsOf(world, "escalate").map((c) => `${c.request.jobId}:${c.request.reason}:${c.request.owner}`).join(", ") || "none"}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job slotted, the resident texted and the trade told. Then the record is read by job id.
    world: () =>
      new DispatchWorld({
        techs: [tech("TR-1")],
        jobs: [job("WO-1001", { address: "6 Vulture St South Brisbane" })],
        geocoder: geo("6 Vulture St South Brisbane"),
        consents: [consent("R-WO-1001")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const rec = world.ports().readRecord("WO-1001");
      if (rec.slots.length !== 1 || rec.messages.length !== 1) return false;
      const s = rec.slots[0];
      const m = rec.messages[0];
      const author = (typeof s.updatedBy?.person === "string" && s.updatedBy.person.length > 0) || (typeof s.updatedBy?.rule === "string" && s.updatedBy.rule.length > 0);
      const evidenced = s.evidence.some((e) => typeof e === "string" && e.includes(m.id) && e.includes(m.sentAt));
      return typeof s.techId === "string" && isoOk(s.start) && typeof s.externalId === "string" && s.externalId.length > 0 && author && isoOk(m.sentAt) && evidenced;
    },
    describe: (world) => `slots ${world.slotsFor("WO-1001").map((s) => `${s.techId} ${s.start} ${s.externalId} by ${JSON.stringify(s.updatedBy)} evidence ${s.evidence.join("|")}`).join("; ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a software check. The runner reports it as evidence_required and never calls holds.
    // Declared: the board runs on the agency's own property management and messaging accounts;
    // the agency's senior property manager is the second person who can explain it.
    world: () => new DispatchWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "Declared, not scored: runs on the agency's own accounts; a second named person explains it.",
  },
];

// The pass test runs on the real job system only, quoted as a scoped build.
// On the stub the runner reports it with_us and never calls this.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new DispatchWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "Runs on the agency's own property management system, as a scoped build.",
  },
];

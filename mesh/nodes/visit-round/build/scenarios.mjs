/**
 * One scenario per check of dispatch-board-build-standard, for Visit Round.
 *
 * Scaffolded by `npx @aipathway/conformance init dispatch-board-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * The world is an Adelaide air conditioning and refrigeration service
 * business running quarterly and six-monthly maintenance contracts. Each
 * visit job carries its contract on the record. Three techs: Mia holds a
 * current refrigerant handling licence and an electrical licence, Dev's
 * refrigerant licence lapsed in May, Tom holds none. Anything not in the
 * seeded geocoder does not resolve.
 *
 * Every `holds` reads the world (its recorded port calls and its
 * non-recording twins), never the build, and returns a strict boolean.
 * `node mutants.mjs` runs each one against a do-nothing build and the broken
 * builds; every claimed check goes red for them.
 */

import { DispatchWorld } from "@aipathway/conformance";

export const REASONS = ["address_unresolved", "no_licensed_tech", "window_impossible", "no_consent", "write_failed", "displaced", "no_capacity"];

export const NOW = new Date("2026-11-08T20:30:00.000Z"); // Mon 9 Nov 2026, 7:00am ACDT
const DAY = "2026-11-09";
export const at = (hhmm) => `${DAY}T${hhmm}:00.000Z`;
const t = (iso) => new Date(iso).getTime();
export const DESK = { name: "Grace Liu", accepts: true };

export const MIA = { id: "T1", name: "Mia Russo", homeBase: "Depot, Wingfield SA 5013", licences: [{ code: "refrigerant", expires: "2027-08-31" }, { code: "electrical", expires: "2027-03-31" }] };
export const DEV = { id: "T2", name: "Dev Patel", homeBase: "Depot, Wingfield SA 5013", licences: [{ code: "refrigerant", expires: "2026-05-31" }] };
export const TOM = { id: "T3", name: "Tom Hart", homeBase: "Depot, Wingfield SA 5013", licences: [] };

export const GEO = {
  "22 King William St Adelaide": "22 King William Street, Adelaide SA 5000",
  "5 Port Rd Hindmarsh": "5 Port Road, Hindmarsh SA 5007",
  "140 The Parade Norwood": "140 The Parade, Norwood SA 5067",
  "3/9 Grote St Adelaide": "Unit 3, 9 Grote Street, Adelaide SA 5000",
  "61 Jetty Rd Glenelg": "61 Jetty Road, Glenelg SA 5045",
};

export function visit(id, customerId, address, from, to, durationMin, extra = {}) {
  return {
    id,
    customerId,
    address,
    window: { from: at(from), to: at(to) },
    durationMin,
    requires: [],
    urgency: "routine",
    status: "new",
    customerSaid: "Quarterly service on the office split systems.",
    version: 1,
    contract: { id: `MC-${id}`, everyMonths: 3, endsOn: "2027-06-30", owner: "Sophie Grant" },
    ...extra,
  };
}

export const consent = (customerId) => ({ customerId, channel: "sms", givenAt: "2026-07-01T00:00:00.000Z" });
const writesFor = (w, jobId) => w.calls.filter((c) => c.port === "write_job" && c.request && c.request.jobId === jobId);
const first = (w, pred) => w.calls.findIndex(pred);
const inside = (slot, win) => t(slot.start) >= t(win.from) && t(slot.end) <= t(win.to);
const owned = (w, jobId, reason) => w.escalationsFor(jobId).some((e) => e.reason === reason && typeof e.owner === "string" && e.owner.length > 0);
const world = (opts) => new DispatchWorld({ now: NOW, geocoder: GEO, dispatcher: DESK, ...opts });
const HOUR = 3_600_000;

export const scenarios = [
  {
    checkId: "address-verified-before-slot",
    // 1. One visit resolves; the other is typed without a suburb and does not.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V101", "C1", "22 King William St Adelaide", "08:00", "12:00", 60), visit("V102", "C2", "22 King William", "08:00", "12:00", 60)],
        consents: [consent("C1"), consent("C2")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const s = w.slotsFor("V101");
      const resolved = first(w, (c) => c.port === "resolve_address" && c.request.raw === "22 King William St Adelaide" && c.response !== null);
      const wrote = first(w, (c) => c.port === "write_job" && c.request.jobId === "V101");
      const allReal = w.slots.every((x) => typeof x.address === "string" && Object.values(GEO).includes(x.address));
      return (
        s.length === 1 &&
        s[0].address === GEO["22 King William St Adelaide"] &&
        resolved >= 0 &&
        wrote > resolved &&
        w.slotsFor("V102").length === 0 &&
        writesFor(w, "V102").length === 0 &&
        owned(w, "V102", "address_unresolved") &&
        allReal
      );
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}@${s.address}`).join("; ") || "none"}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}`).join("; ") || "none"}`,
  },
  {
    checkId: "licence-is-a-rule-not-a-vibe",
    // 2. A refrigerant visit. The lapsed and the unlicensed tech are listed
    // first, so taking the first free tech assigns the wrong one.
    world: () =>
      world({
        techs: [DEV, TOM, MIA],
        jobs: [visit("V201", "C1", "5 Port Rd Hindmarsh", "08:00", "12:00", 120, { requires: ["refrigerant"], customerSaid: "Coolroom compressor service, it iced up last month." })],
        consents: [consent("C1")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const s = w.slotsFor("V201");
      const rule = first(w, (c) => c.port === "read_rule" && c.request.licence === "refrigerant");
      const wrote = first(w, (c) => c.port === "write_job" && c.request.jobId === "V201");
      return s.length === 1 && s[0].techId === "T1" && w.licenceCurrent("T1", "refrigerant") === true && rule >= 0 && wrote > rule && !w.slots.some((x) => x.techId === "T2" || x.techId === "T3");
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId}->${s.techId}`).join("; ") || "none"}`,
  },
  {
    checkId: "window-and-travel-are-data",
    // 3. Two visits on one tech, 35 minutes apart by the table, all other
    // travel zero so only the read value can keep them apart.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V301", "C1", "140 The Parade Norwood", "08:00", "12:00", 90), visit("V302", "C2", "61 Jetty Rd Glenelg", "08:00", "12:00", 60)],
        travelMin: { [`${GEO["140 The Parade Norwood"]}>${GEO["61 Jetty Rd Glenelg"]}`]: 35, [`${GEO["61 Jetty Rd Glenelg"]}>${GEO["140 The Parade Norwood"]}`]: 35 },
        defaultTravelMin: 0,
        consents: [consent("C1"), consent("C2")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const a = w.slotsFor("V301");
      const b = w.slotsFor("V302");
      if (a.length !== 1 || b.length !== 1) return false;
      const ja = w.job("V301");
      const jb = w.job("V302");
      if (!ja || !jb || !inside(a[0], ja.window) || !inside(b[0], jb.window)) return false;
      const [p, q] = t(a[0].start) <= t(b[0].start) ? [a[0], b[0]] : [b[0], a[0]];
      const read = w.calls.some((c) => c.port === "read_job" && c.request && c.request.travel && c.request.travel.from === p.address && c.request.travel.to === q.address);
      return p.techId === q.techId && t(q.start) >= t(p.end) + w.travel(p.address, q.address) && read;
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end}`).join("; ") || "none"}`,
  },
  {
    checkId: "one-slot-per-job",
    // 4. The first write returns no id; the period tick then fires twice more.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V401", "C1", "3/9 Grote St Adelaide", "08:00", "12:00", 60)],
        consents: [consent("C1")],
        failNextWrite: true,
      }),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR);
      await build(w.ports());
      w.advance(HOUR);
      await build(w.ports());
    },
    holds: (w) => {
      const s = w.slotsFor("V401");
      const ws = writesFor(w, "V401");
      const failed = first(w, (c) => c.port === "write_job" && c.request.jobId === "V401" && c.response === null);
      const good = first(w, (c) => c.port === "write_job" && c.request.jobId === "V401" && c.response !== null);
      const sends = w.calls.map((c, i) => (c.port === "send_sms" ? i : -1)).filter((i) => i >= 0);
      const creates = ws.filter((c) => c.response !== null && !("update" in c.request));
      return s.length === 1 && typeof s[0].externalId === "string" && failed >= 0 && good > failed && owned(w, "V401", "write_failed") && sends.every((i) => i > good) && creates.length === 1 && w.messagesTo("C1").length === 1;
    },
    describe: (w) => `slots: ${w.slotsFor("V401").length}; writes: ${writesFor(w, "V401").map((c) => (c.response ? "ok" : "null")).join(",")}; sms: ${w.messagesTo("C1").length}`,
  },
  {
    checkId: "emergency-displaces-with-a-person",
    // 5. Mia is the only refrigerant tech and her morning holds a contract
    // visit. A coolroom failure lands that only her morning can meet.
    world: () =>
      world({
        techs: [MIA],
        jobs: [
          visit("V501", "C1", "140 The Parade Norwood", "08:00", "12:00", 120, { requires: ["refrigerant"] }),
          visit("V502", "C2", "61 Jetty Rd Glenelg", "13:00", "17:00", 240, { requires: ["refrigerant"] }),
        ],
        defaultTravelMin: 30,
        consents: [consent("C1"), consent("C2"), consent("C3")],
      }),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR / 2);
      w.arriveEmergency(visit("E503", "C3", "5 Port Rd Hindmarsh", "08:00", "10:00", 60, { requires: ["refrigerant"], urgency: "emergency", contract: null, customerSaid: "The coolroom is at 12 degrees and climbing." }));
      await build(w.ports());
    },
    holds: (w) => {
      const e = w.slotsFor("E503");
      const v = w.slotsFor("V501");
      if (e.length !== 1 || v.length !== 1) return false;
      const gate = first(w, (c) => c.port === "gate" && c.request && c.request.for === "E503" && c.response && c.response.accepted === true && c.response.person === DESK.name);
      const wrote = first(w, (c) => c.port === "write_job" && c.request.jobId === "E503");
      const accepted = w.acceptances.some((a) => a.emergencyJobId === "E503" && a.accepted === true && a.person === DESK.name && a.displaceSlotId === v[0].id);
      const clear = !(t(v[0].start) < t(e[0].end) && t(e[0].start) < t(v[0].end));
      const hasOwner = w.escalationsFor("V501").some((x) => typeof x.owner === "string" && x.owner.length > 0);
      return gate >= 0 && wrote > gate && accepted && e[0].updatedBy.person === DESK.name && v[0].displacedBy === "E503" && (clear || hasOwner);
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end}${s.displacedBy ? ` displacedBy ${s.displacedBy}` : ""}`).join("; ") || "none"}`,
  },
  {
    checkId: "customer-told-once-with-consent",
    // 6. C1 agreed to SMS, C2 did not. The period tick fires twice.
    world: () =>
      world({
        techs: [TOM, MIA],
        jobs: [visit("V601", "C1", "22 King William St Adelaide", "08:00", "12:00", 60), visit("V602", "C2", "61 Jetty Rd Glenelg", "08:00", "12:00", 60)],
        consents: [consent("C1")],
      }),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR);
      await build(w.ports());
    },
    holds: (w) => {
      const checked = first(w, (c) => c.port === "gate" && c.request && c.request.consent === "C1" && c.request.channel === "sms" && c.response !== null);
      const sent = first(w, (c) => c.port === "send_sms" && c.request.to === "C1");
      return w.messagesTo("C1").length === 1 && checked >= 0 && sent > checked && w.messagesTo("C2").length === 0 && owned(w, "V602", "no_consent") && w.messages.every((m) => w.consentFor(m.to, m.channel) !== null);
    },
    describe: (w) => `sms: C1=${w.messagesTo("C1").length}, C2=${w.messagesTo("C2").length}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}`).join(",") || "none"}`,
  },
  {
    checkId: "tech-told-with-the-record",
    // 7. The customer added a note when the contract visit came due.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V701", "C1", "3/9 Grote St Adelaide", "09:00", "13:00", 60, { customerSaid: "The boardroom unit drips onto the carpet and rattles on start-up." })],
        consents: [consent("C1")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const s = w.slotsFor("V701");
      const j = w.job("V701");
      if (s.length !== 1 || !j) return false;
      return w.noticesTo(s[0].techId).some((n) => n.jobId === "V701" && n.address === GEO["3/9 Grote St Adelaide"] && n.window !== undefined && n.window.from === j.window.from && n.window.to === j.window.to && n.customerSaid === j.customerSaid);
    },
    describe: (w) => `notices: ${JSON.stringify(w.notices.map((n) => n.notice))}`,
  },
  {
    checkId: "change-propagates-once",
    // 8. Booked for the morning; the customer moves it to the afternoon;
    // the tick then fires again with nothing changed.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V801", "C1", "140 The Parade Norwood", "08:00", "10:00", 60)],
        consents: [consent("C1")],
      }),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR / 2);
      w.changeJob("V801", { window: { from: at("13:00"), to: at("15:00") } });
      await build(w.ports());
      w.advance(HOUR / 2);
      await build(w.ports());
    },
    holds: (w) => {
      const s = w.slotsFor("V801");
      const j = w.job("V801");
      if (s.length !== 1 || !j) return false;
      const since = w.callsSinceMark();
      const sms = since.filter((c) => c.port === "send_sms" && c.request.to === "C1").length;
      const told = since.filter((c) => c.port === "notify" && c.request.techId === s[0].techId).length;
      return inside(s[0], j.window) && s[0].jobVersion === j.version && sms === 1 && told === 1;
    },
    describe: (w) => `slots: ${w.slots.map((s) => `${s.jobId} ${s.start}-${s.end} v${s.jobVersion}`).join("; ") || "none"}`,
  },
  {
    checkId: "unassignable-is-a-queue",
    // 9. An electrical visit nobody but Mia could do (Mia is not rostered
    // this period), an address that will not resolve, and a window shorter
    // than the visit.
    world: () =>
      world({
        techs: [DEV, TOM],
        jobs: [
          visit("V901", "C1", "5 Port Rd Hindmarsh", "08:00", "12:00", 120, { requires: ["electrical"], customerSaid: "Six-monthly check on the rooftop units' isolators." }),
          visit("V902", "C2", "Unit 4 out the back", "08:00", "12:00", 60),
          visit("V903", "C3", "61 Jetty Rd Glenelg", "08:00", "09:00", 120),
        ],
        consents: [consent("C1"), consent("C2"), consent("C3")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const want = { V901: "no_licensed_tech", V902: "address_unresolved", V903: "window_impossible" };
      return Object.entries(want).every(([id, reason]) => w.slotsFor(id).length === 0 && w.escalationsFor(id).some((e) => e.jobId === id && e.reason === reason && REASONS.includes(e.reason) && typeof e.owner === "string" && e.owner.length > 0));
    },
    describe: (w) => `slots: ${w.slots.map((s) => s.jobId).join(",") || "none"}; escalations: ${w.escalations.map((e) => `${e.jobId}:${e.reason}:${e.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. One visit booked, confirmed and briefed, then read back by job id.
    world: () =>
      world({
        techs: [TOM],
        jobs: [visit("V1001", "C1", "22 King William St Adelaide", "10:00", "14:00", 60)],
        consents: [consent("C1")],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const rec = w.ports().readRecord("V1001");
      if (rec.slots.length !== 1 || rec.messages.length !== 1) return false;
      const s = rec.slots[0];
      const m = rec.messages[0];
      const author = (typeof s.updatedBy.person === "string" && s.updatedBy.person.length > 0) || (typeof s.updatedBy.rule === "string" && s.updatedBy.rule.length > 0);
      const filed = s.evidence.some((ref) => ref.includes(m.id) && ref.includes(m.sentAt));
      return typeof s.techId === "string" && typeof s.start === "string" && typeof s.externalId === "string" && author && typeof m.sentAt === "string" && filed && w.noticesTo(s.techId).length === 1;
    },
    describe: (w) => `slots: ${JSON.stringify(w.slots.map((s) => ({ id: s.id, techId: s.techId, externalId: s.externalId, by: s.updatedBy, evidence: s.evidence })))}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not software. Declared in the README and the pull request: AI
    // Pathway maintains it in a public repository, and it runs on the
    // business's own job system account. The runner never scores this green.
    world: () => world({}),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not run",
  },
];

// 12. The pass test runs only on the business's own job system, quoted as a
// scoped build. On the stub the runner reports it with_us.
export const liveScenarios = [];

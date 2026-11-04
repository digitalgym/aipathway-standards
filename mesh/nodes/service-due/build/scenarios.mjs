/**
 * One scenario per check of next-service-build-standard, for Service Due.
 *
 * Scaffolded by `npx @aipathway/conformance init next-service-build-standard`
 * from https://aipathway.com.au/explore-ai/next-service-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The package ships no world for this standard, so ./service-book-world.mjs is
 * the stub the standard describes (local.mock_service_book). Every `holds`
 * reads the world's recorded trace (world.calls), never the build's memory,
 * and returns a strict boolean.
 *
 * The schedule rows below are a stand-in for the business's own, not advice
 * on how often anything should be serviced. Customers and numbers are made up.
 */

import { ServiceBookWorld } from "./service-book-world.mjs";

const DAY = 86_400_000;
const NOW = new Date("2026-11-04T00:00:00.000Z"); // 10am Brisbane, the world's default clock

const SCHEDULE = [
  { equipmentType: "hot_water_system", serviceMonths: 12, changedBy: "owner", changedOn: "2026-01-12" },
  { equipmentType: "split_system_ac", serviceMonths: 12, changedBy: "owner", changedOn: "2026-01-12" },
  { equipmentType: "solar_inverter", serviceMonths: 12, changedBy: "owner", changedOn: "2026-01-12" },
  { equipmentType: "switchboard", serviceMonths: 24, changedBy: "owner", changedOn: "2026-01-12" },
];
const SETTINGS = { leadDays: 21, followUpDays: 5 };

const CUSTOMERS = [
  { id: "C-ANA", name: "Ana Silva", phone: "0491570110", email: "ana@example.com.au", consent: { sms: true, email: true } },
  { id: "C-BEN", name: "Ben Ngata", phone: "0491570111", email: "ben@example.com.au", consent: { sms: false, email: true } },
  { id: "C-CHLOE", name: "Chloe Park", phone: "0491570112", email: "chloe@example.com.au", consent: { sms: false, email: false } },
  { id: "C-DEV", name: "Dev Rao", phone: "0491570113", email: "dev@example.com.au", consent: { sms: true, email: false } },
];

/** An asset already on the register, captured from an earlier job. */
const asset = (id, customerId, eq) => ({
  id,
  customerId,
  sourceJobId: `J-${id}`,
  equipmentType: eq.equipmentType ?? null,
  make: eq.make ?? null,
  model: eq.model ?? null,
  serial: eq.serial ?? null,
  installedOn: eq.installedOn ?? null,
  lastServicedOn: eq.lastServicedOn ?? null,
  warrantyMonths: eq.warrantyMonths ?? null,
  records: [{ sourceJobId: `J-${id}` }],
});

const HWS = { equipmentType: "hot_water_system", make: "Rheem", model: "Stellar 315" };
const AC = { equipmentType: "split_system_ac", make: "Daikin", model: "Cora FTXM35" };
const INV = { equipmentType: "solar_inverter", make: "Fronius", model: "Primo 5.0" };

const world = (opts = {}) =>
  new ServiceBookWorld({ now: NOW, schedule: SCHEDULE, settings: SETTINGS, customers: CUSTOMERS, ...opts });

// ── Reading the trace. ──
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const sends = (w, pred = () => true) => callsTo(w, "send_message", (c) => pred(c.request));
const sent = (w, pred = () => true) => sends(w, pred).filter((c) => c.response?.sent === true);
const drafts = (w, pred = () => true) => callsTo(w, "draft_message", (c) => pred(c.request));
const forAsset = (id) => (r) => r.assetId === id;
const escalations = (w, kind, assetId) => callsTo(w, "escalate", (c) => c.request.kind === kind && (assetId === undefined || c.request.assetId === assetId));
const bookings = (w) => callsTo(w, "write_job", (c) => c.request.kind === "booking_request" && c.response?.id);
const evidenceOf = (w, type) => callsTo(w, "evidence", (c) => c.request.entry?.type === type && c.response?.id);

/** Every send attempt was a draft a named person released, read before the send. */
const everySendReleased = (w) =>
  w.calls.every((c, i) => {
    if (c.port !== "send_message") return true;
    const id = c.request.draftId;
    const before = w.calls.slice(0, i);
    return (
      before.some((d) => d.port === "draft_message" && d.response?.id === id) &&
      before.some((g) => g.port === "gate" && g.request.release === id && g.response?.released === true && typeof g.response.by === "string")
    );
  });

const strict = (list) => list.map((s) => ({ ...s, holds: (w) => s.holds(w) === true }));

export const scenarios = strict([
  {
    checkId: "captured-at-completion",
    // 1. A finished install, a finished service on a unit already on the register,
    // and a job still open. The run is repeated.
    world: () =>
      world({
        assets: [asset("A-0101", "C-ANA", { ...AC, installedOn: "2024-03-01", warrantyMonths: 60 })],
        jobs: [
          { id: "J-110", status: "complete", kind: "install", customerId: "C-ANA", equipment: { ...HWS, serial: "RH-88231", installedOn: "2026-02-10", warrantyMonths: 60 } },
          { id: "J-111", status: "complete", kind: "service", customerId: "C-ANA", assetId: "A-0101", equipment: { ...AC, servicedOn: "2026-10-20" } },
          { id: "J-112", status: "open", kind: "install", customerId: "C-BEN", equipment: { ...INV, installedOn: "2026-11-01", warrantyMonths: 120 } },
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(60 * 60 * 1000);
      await b(w.ports());
    },
    holds: (w) => {
      const rec = (jobId) => callsTo(w, "record_service", (c) => c.request.sourceJobId === jobId && c.response?.id);
      const same = (call, eq) =>
        call.request.fields.equipmentType === (eq.equipmentType ?? null) &&
        call.request.fields.make === (eq.make ?? null) &&
        call.request.fields.model === (eq.model ?? null) &&
        call.request.fields.serial === (eq.serial ?? null) &&
        call.request.fields.installedOn === (eq.installedOn ?? null) &&
        call.request.fields.lastServicedOn === (eq.servicedOn ?? null) &&
        call.request.fields.warrantyMonths === (eq.warrantyMonths ?? null);
      const install = rec("J-110");
      const service = rec("J-111");
      return (
        install.length === 1 &&
        same(install[0], { ...HWS, serial: "RH-88231", installedOn: "2026-02-10", warrantyMonths: 60 }) &&
        service.length === 1 &&
        service[0].request.assetId === "A-0101" &&
        same(service[0], { ...AC, servicedOn: "2026-10-20" }) &&
        rec("J-112").length === 0 &&
        callsTo(w, "record_service", (c) => c.request.sourceJobId === "J-112").length === 0
      );
    },
    describe: (w) => `service records: ${JSON.stringify(callsTo(w, "record_service").map((c) => [c.request.sourceJobId, c.response?.id]))}`,
  },
  {
    checkId: "missing-details-to-a-person",
    // 2. Four units: no install date, no model, no type, and a type with no row
    // in the schedule. Each is otherwise in the reminder window.
    world: () =>
      world({
        assets: [
          asset("A-0201", "C-ANA", { ...HWS, installedOn: null, lastServicedOn: "2025-11-20" }),
          asset("A-0202", "C-ANA", { ...AC, model: null, installedOn: "2025-11-20" }),
          asset("A-0203", "C-DEV", { ...HWS, equipmentType: null, installedOn: "2025-11-20" }),
          asset("A-0204", "C-DEV", { equipmentType: "water_filter", make: "Puretec", model: "Hybrid G7", installedOn: "2025-11-20" }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const want = { "A-0201": "missing_install_date", "A-0202": "missing_model", "A-0203": "missing_equipment_type", "A-0204": "no_schedule" };
      return Object.entries(want).every(([id, kind]) => {
        const own = callsTo(w, "escalate", (c) => c.request.assetId === id && c.response?.id);
        return (
          own.length === 1 &&
          own[0].request.kind === kind &&
          typeof own[0].request.owner === "string" &&
          drafts(w, forAsset(id)).length === 0 &&
          sends(w, forAsset(id)).length === 0
        );
      });
    },
    describe: (w) => `exceptions: ${JSON.stringify(callsTo(w, "escalate").map((c) => [c.request.assetId, c.request.kind]))}; sends ${sends(w).length}`,
  },
  {
    checkId: "dates-derived-not-stored",
    // 3. A hot water system serviced on 14 May on a twelve-month schedule, with
    // a next-due of 10 November typed onto the service job. Then the owner changes
    // the schedule row to six months. Nobody edits a date.
    world: () =>
      world({
        assets: [asset("A-0301", "C-ANA", { ...HWS, installedOn: "2023-05-14" })],
        jobs: [{ id: "J-301", status: "complete", kind: "service", customerId: "C-ANA", assetId: "A-0301", equipment: { ...HWS, servicedOn: "2026-05-14", nextDue: "2026-11-10" } }],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.changedAt = w.calls.length;
      w.setSchedule("hot_water_system", 6);
      w.advance(60 * 60 * 1000);
      await b(w.ports());
    },
    holds: (w) => {
      const before = w.calls.slice(0, w.changedAt);
      const after = w.calls.slice(w.changedAt);
      const msgBefore = before.filter((c) => (c.port === "send_message" || c.port === "draft_message") && c.request.assetId === "A-0301");
      const sentAfter = after.filter((c) => c.port === "send_message" && c.request.assetId === "A-0301" && c.response?.sent === true);
      return (
        typeof w.changedAt === "number" &&
        msgBefore.length === 0 &&
        sentAfter.length === 1 &&
        sentAfter[0].request.kind === "service" &&
        sentAfter[0].request.dueOn === "2026-11-14" &&
        !sends(w).some((c) => c.request.dueOn === "2026-11-10") &&
        !w.calls.some((c) => c.port !== "read_job" && c.port !== "read_asset" && JSON.stringify(c.request ?? {}).match(/"(nextDue|dueDate|next_due)"/)) &&
        !callsTo(w, "record_service").some((c) => "nextDue" in (c.request.fields ?? {}))
      );
    },
    describe: (w) => `A-0301 sends: ${JSON.stringify(sends(w, forAsset("A-0301")).map((c) => [c.request.dueOn, c.response?.sent]))}; schedule changed at call ${w.changedAt}`,
  },
  {
    checkId: "warranty-from-the-record",
    // 4. Two identical inverters installed on 20 November 2021, last serviced in
    // June. One has a sixty-month term on the record and one has none.
    world: () =>
      world({
        assets: [
          asset("A-0401", "C-ANA", { ...INV, installedOn: "2021-11-20", lastServicedOn: "2026-06-01", warrantyMonths: 60 }),
          asset("A-0402", "C-DEV", { ...INV, installedOn: "2021-11-20", lastServicedOn: "2026-06-01", warrantyMonths: null }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const first = sent(w, (r) => r.assetId === "A-0401" && r.kind === "warranty");
      const second = [...drafts(w, (r) => r.assetId === "A-0402" && r.kind === "warranty"), ...sends(w, (r) => r.assetId === "A-0402" && r.kind === "warranty")];
      return first.length === 1 && first[0].request.dueOn === "2026-11-20" && second.length === 0;
    },
    describe: (w) => `warranty sends: ${JSON.stringify(sends(w, (r) => r.kind === "warranty").map((c) => [c.request.assetId, c.request.dueOn]))}`,
  },
  {
    checkId: "reminder-ahead-of-the-date",
    // 5. Dates inside the 21-day lead time (one on its first day), one further
    // out and one already past. Run twice on the same day.
    world: () =>
      world({
        assets: [
          asset("A-0501", "C-ANA", { ...HWS, installedOn: "2025-11-15" }), // due 2026-11-15, inside
          asset("A-0502", "C-ANA", { ...AC, installedOn: "2026-01-20" }), // due 2027-01-20, further out
          asset("A-0503", "C-DEV", { ...HWS, installedOn: "2025-10-20" }), // due 2026-10-20, past
          asset("A-0504", "C-DEV", { ...AC, installedOn: "2025-11-25" }), // due 2026-11-25, first day of the window
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(3 * 60 * 60 * 1000);
      await b(w.ports());
    },
    holds: (w) => {
      const inWindow = (id, due) => {
        const s = sent(w, (r) => r.assetId === id && r.stage === "reminder");
        const at = s[0] ? s[0].at.slice(0, 10) : null;
        const open = new Date(Date.parse(`${due}T00:00:00.000Z`) - SETTINGS.leadDays * DAY).toISOString().slice(0, 10);
        return s.length === 1 && s[0].request.dueOn === due && at >= open && at <= due;
      };
      return (
        inWindow("A-0501", "2026-11-15") &&
        inWindow("A-0504", "2026-11-25") &&
        sends(w, forAsset("A-0502")).length === 0 &&
        sends(w, forAsset("A-0503")).length === 0 &&
        everySendReleased(w)
      );
    },
    describe: (w) => `sends: ${JSON.stringify(sends(w).map((c) => [c.request.assetId, c.request.dueOn, c.at.slice(0, 10), c.response?.sent]))}`,
  },
  {
    checkId: "channel-they-agreed-to",
    // 6. Ben agreed to email only; Chloe agreed to neither. Both have a date in the window.
    world: () =>
      world({
        assets: [asset("A-0601", "C-BEN", { ...HWS, installedOn: "2025-11-18" }), asset("A-0602", "C-CHLOE", { ...HWS, installedOn: "2025-11-18" })],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ben = sends(w, forAsset("A-0601"));
      return (
        ben.length === 1 &&
        ben[0].request.channel === "email" &&
        ben[0].response?.sent === true &&
        sends(w, forAsset("A-0602")).length === 0 &&
        drafts(w, forAsset("A-0602")).length === 0 &&
        escalations(w, "no_consent", "A-0602").length === 1 &&
        everySendReleased(w)
      );
    },
    describe: (w) => `sends: ${JSON.stringify(sends(w).map((c) => [c.request.assetId, c.request.channel, c.response]))}; no_consent ${escalations(w, "no_consent").length}`,
  },
  {
    checkId: "already-booked-no-reminder",
    // 7. Two air conditioners due; one already has a service job scheduled in the job system.
    world: () =>
      world({
        assets: [asset("A-0701", "C-ANA", { ...AC, installedOn: "2025-11-16" }), asset("A-0702", "C-DEV", { ...AC, installedOn: "2025-11-16" })],
        jobs: [{ id: "J-701", status: "scheduled", kind: "service", customerId: "C-ANA", assetId: "A-0701" }],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const precededByRead = w.calls.every((c, i) => {
        if (c.port !== "send_message") return true;
        return w.calls.slice(0, i).some((r) => r.port === "read_job" && r.request.open === true && r.request.assetId === c.request.assetId);
      });
      return (
        sends(w, forAsset("A-0701")).length === 0 &&
        drafts(w, forAsset("A-0701")).length === 0 &&
        sent(w, forAsset("A-0702")).length === 1 &&
        precededByRead
      );
    },
    describe: (w) => `sends: ${JSON.stringify(sends(w).map((c) => c.request.assetId))}; open-job reads ${callsTo(w, "read_job", (c) => c.request.open).length}`,
  },
  {
    checkId: "one-follow-up-then-stop",
    // 8. Two reminders go. Dev replies with a question. The clock moves past the
    // follow-up gap twice, then by three weeks.
    world: () =>
      world({
        assets: [asset("A-0801", "C-ANA", { ...HWS, installedOn: "2025-11-20" }), asset("A-0802", "C-DEV", { ...HWS, installedOn: "2025-11-20" })],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      const m = w.sentFor("A-0802")[0];
      if (m) w.reply({ inReplyTo: m.id, text: "Can you come after 3pm?" });
      for (const days of [6, 6, 21]) {
        w.advance(days * DAY);
        await b(w.ports());
      }
    },
    holds: (w) => {
      const ok = ["A-0801", "A-0802"].every((id) => {
        const r = sent(w, (x) => x.assetId === id && x.stage === "reminder");
        const f = sent(w, (x) => x.assetId === id && x.stage === "follow_up");
        return r.length === 1 && f.length <= 1 && f.every((x) => Date.parse(x.at) - Date.parse(r[0].at) >= SETTINGS.followUpDays * DAY);
      });
      const unclear = escalations(w, "unclear_reply", "A-0802");
      return (
        ok &&
        sent(w, (x) => x.assetId === "A-0801" && x.stage === "follow_up").length === 1 &&
        sends(w, (x) => x.assetId === "A-0802" && x.stage === "follow_up").length === 0 &&
        unclear.length === 1 &&
        typeof unclear[0].request.replyId === "string"
      );
    },
    describe: (w) => `sends: ${JSON.stringify(sends(w).map((c) => [c.request.assetId, c.request.stage, c.at.slice(0, 10)]))}; unclear ${escalations(w, "unclear_reply").length}`,
  },
  {
    checkId: "opt-out-for-good",
    // 9. Ana replies STOP. Then a new hot water system is installed for her, with
    // its service date in the window.
    world: () => world({ assets: [asset("A-0901", "C-ANA", { ...AC, installedOn: "2025-11-18" })] }),
    drive: async (b, w) => {
      await b(w.ports());
      const m = w.sentFor("A-0901")[0];
      if (m) w.reply({ inReplyTo: m.id, text: "STOP" });
      w.advance(DAY);
      await b(w.ports());
      w.completeJob({ id: "J-902", kind: "install", customerId: "C-ANA", equipment: { ...HWS, installedOn: "2025-11-21", warrantyMonths: 12 } });
      w.advance(DAY);
      await b(w.ports());
      w.advance(7 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const idx = w.calls.findIndex((c) => c.port === "record_consent" && c.request.customerId === "C-ANA" && c.request.withdrawn === true && c.response?.ok === true);
      if (idx < 0) return false;
      const after = w.calls.slice(idx);
      const toAna = after.filter((c) => (c.port === "send_message" || c.port === "draft_message") && c.request.customerId === "C-ANA");
      return (
        sent(w, forAsset("A-0901")).length === 1 &&
        toAna.length === 0 &&
        callsTo(w, "record_service", (c) => c.request.sourceJobId === "J-902" && c.response?.id).length === 1 &&
        !callsTo(w, "record_consent").some((c) => c.request.withdrawn === false)
      );
    },
    describe: (w) => `consent writes ${JSON.stringify(callsTo(w, "record_consent").map((c) => c.request))}; sends to Ana ${sends(w, (r) => r.customerId === "C-ANA").length}`,
  },
  {
    checkId: "warranty-says-only-the-date",
    // 10. An inverter whose recorded sixty-month term ends on 12 November 2026.
    world: () => world({ assets: [asset("A-1001", "C-ANA", { ...INV, installedOn: "2021-11-12", lastServicedOn: "2026-07-01", warrantyMonths: 60 })] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const s = sent(w, (r) => r.assetId === "A-1001" && r.kind === "warranty");
      const bodies = [...drafts(w), ...sends(w)].map((c) => String(c.request.body ?? ""));
      const COVER = /\b(cover|covers|covered|coverage|free|no charge|no cost|claim|claims|guarantee|guarantees|guaranteed|consumer law|your rights|entitled|refund|replace(ment)?)\b/i;
      return (
        s.length === 1 &&
        s[0].request.dueOn === "2026-11-12" &&
        String(s[0].request.body).includes("12 November 2026") &&
        bodies.length > 0 &&
        bodies.every((t) => !COVER.test(t))
      );
    },
    describe: (w) => `bodies: ${JSON.stringify(sends(w).map((c) => c.request.body))}`,
  },
  {
    checkId: "one-booking-request",
    // 11. Ana replies YES by SMS, then YES again. Ben taps the booking link.
    // The run is repeated.
    world: () =>
      world({ assets: [asset("A-1101", "C-ANA", { ...HWS, installedOn: "2025-11-19" }), asset("A-1102", "C-BEN", { ...AC, installedOn: "2025-11-19" })] }),
    drive: async (b, w) => {
      await b(w.ports());
      const m = w.sentFor("A-1101")[0];
      if (m) w.reply({ inReplyTo: m.id, text: "YES" });
      w.reply({ channel: "link", text: "booking link tapped", assetId: "A-1102", dueOn: "2026-11-19" });
      w.advance(60 * 60 * 1000);
      await b(w.ports());
      if (m) w.reply({ inReplyTo: m.id, text: "Yes please" });
      w.advance(60 * 60 * 1000);
      await b(w.ports());
      await b(w.ports());
    },
    holds: (w) => {
      const one = (id, customer) => {
        const bs = bookings(w).filter((c) => c.request.assetId === id);
        return bs.length === 1 && bs[0].request.customerId === customer;
      };
      const checkedFirst = bookings(w).every((c) => {
        const i = w.calls.indexOf(c);
        return w.calls.slice(0, i).some((r) => r.port === "read_job" && r.request.open === true && r.request.assetId === c.request.assetId);
      });
      return one("A-1101", "C-ANA") && one("A-1102", "C-BEN") && callsTo(w, "write_job").length === 2 && checkedFirst;
    },
    describe: (w) => `booking writes: ${JSON.stringify(callsTo(w, "write_job").map((c) => [c.request.assetId, c.request.customerId, c.response?.id]))}`,
  },
  {
    checkId: "no-time-no-price",
    // 12. Two customers say yes in the same week.
    world: () =>
      world({ assets: [asset("A-1201", "C-ANA", { ...HWS, installedOn: "2025-11-22" }), asset("A-1202", "C-DEV", { ...AC, installedOn: "2025-11-22" })] }),
    drive: async (b, w) => {
      await b(w.ports());
      for (const id of ["A-1201", "A-1202"]) {
        const m = w.sentFor(id)[0];
        if (m) w.reply({ inReplyTo: m.id, text: "Yes" });
        w.advance(2 * DAY);
        await b(w.ports());
      }
    },
    holds: (w) => {
      const bs = bookings(w);
      const BANNED = /time|slot|start|end|window|date_?time|appointment|price|amount|rate|cost|total|fee|quote/i;
      const clean = bs.every((c) => Object.keys(c.request).every((k) => k === "intentId" || !BANNED.test(k)));
      const told = bs.every((c) => callsTo(w, "notify", (n) => n.request.jobId === c.response.id && typeof n.request.to === "string").length === 1);
      return bs.length === 2 && new Set(bs.map((c) => c.request.assetId)).size === 2 && clean && told;
    },
    describe: (w) => `bookings: ${JSON.stringify(bookings(w).map((c) => c.request))}; notices ${JSON.stringify(callsTo(w, "notify").map((c) => c.request.jobId))}`,
  },
  {
    checkId: "record-by-asset",
    // 13. Reminders to three customers. Ana says yes, Dev says stop, Ben says
    // nothing and gets a follow-up.
    world: () =>
      world({
        assets: [
          asset("A-1301", "C-ANA", { ...HWS, installedOn: "2025-11-24" }),
          asset("A-1302", "C-DEV", { ...AC, installedOn: "2025-11-24" }),
          asset("A-1303", "C-BEN", { ...HWS, installedOn: "2025-11-24" }),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      const a = w.sentFor("A-1301")[0];
      const d = w.sentFor("A-1302")[0];
      if (a) w.reply({ inReplyTo: a.id, text: "YES" });
      if (d) w.reply({ inReplyTo: d.id, text: "Stop texting me please" });
      w.advance(6 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const ev = (type) => evidenceOf(w, type);
      const sentOk = sent(w).every((s) =>
        ev("sent").some((e) => e.request.assetId === s.request.assetId && e.request.entry.messageId === s.response.id && e.request.entry.channel === s.request.channel && e.request.entry.dueOn === s.request.dueOn),
      );
      const inbox = callsTo(w, "read_inbox").flatMap((c) => c.response);
      const replies = [...new Map(inbox.map((r) => [r.id, r])).values()];
      const repliesOk = replies.every((r) => {
        const e = ev("reply").filter((x) => x.request.entry.replyId === r.id);
        return e.length === 1 && e[0].request.entry.replyText === r.text && typeof e[0].request.assetId === "string";
      });
      const stopsOk = callsTo(w, "record_consent", (c) => c.request.withdrawn === true).every((c) =>
        ev("stop").some((e) => e.request.entry.replyId === c.request.replyId && e.request.assetId === "A-1302"),
      );
      const bookOk = bookings(w).every((b) => ev("booking_request").some((e) => e.request.assetId === b.request.assetId && e.request.entry.jobNumber === b.response.id));
      return (
        sent(w, (r) => r.stage === "reminder").length === 3 &&
        sent(w, (r) => r.stage === "follow_up" && r.assetId === "A-1303").length === 1 &&
        replies.length === 2 &&
        callsTo(w, "record_consent").length === 1 &&
        bookings(w).length === 1 &&
        sentOk &&
        repliesOk &&
        stopsOk &&
        bookOk
      );
    },
    describe: (w) => `record entries: ${JSON.stringify(evidenceOf(w, "sent").length)} sent, ${evidenceOf(w, "reply").length} reply, ${evidenceOf(w, "stop").length} stop, ${evidenceOf(w, "booking_request").length} booking`,
  },
  {
    checkId: "survives-the-builder",
    // 14. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the schedule, the register and the reminders run
    // on the business's own job system and accounts.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the business's own job system and phone. This
// standard publishes no live port map, so run.mjs refuses a production run and
// the stub reports it as with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];


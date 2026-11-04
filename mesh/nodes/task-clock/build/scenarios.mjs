/**
 * One scenario per check of exception-desk-build-standard, for Task Clock.
 *
 * Scaffolded by `npx @aipathway/conformance init exception-desk-build-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the recorded trace (world.calls) and, where a check is
 * about what a person did on the list's screen, the list itself. Never the
 * build's memory.
 *
 * Times are Brisbane (UTC+10, no daylight saving). Every id, name and address
 * is made up.
 */

import { TaskWorld } from "./task-world.mjs";
import { CLOSED_TYPES } from "./build.mjs";

const HOUR = 3_600_000;
const bne = (s) => new Date(`${s}:00+10:00`).toISOString();
const bneMinute = (iso) => (((new Date(iso).getUTCHours() + 10) % 24) * 60) + new Date(iso).getUTCMinutes();
const bneDay = (iso) => new Date(new Date(iso).getTime() + 10 * HOUR).toISOString().slice(0, 10);

// The routing table the office manager wrote for Coastline Facility Services.
// Follow-ups that arrive off the closed list land as `other` and go to Mel
// with a day on the clock; the late nudge for those goes back to Mel herself.
const ROUTING = {
  summary_at: "07:00",
  time_zone: "Australia/Brisbane",
  rows: [
    { type: "parts_shortfall", owner: "Mel", clock_hours: 4, escalate_to: "Dana", auto_close: false },
    { type: "price_not_in_book", owner: "Mel", clock_hours: 24, escalate_to: "Dana", auto_close: false },
    { type: "write_failed", owner: "Jordan", clock_hours: 4, escalate_to: "Dana", auto_close: false },
    { type: "address_unresolved", owner: "Jordan", clock_hours: 2, escalate_to: "Dana", auto_close: false },
    { type: "promise_broken", owner: "Mel", clock_hours: 24, escalate_to: "Dana", auto_close: false },
    // Escalation names Sam on purpose: nothing about a dispute may reach him.
    { type: "dispute", owner: "Dana", clock_hours: 24, escalate_to: "Sam", auto_close: false },
    { type: "hardship", owner: "Dana", clock_hours: 24, escalate_to: "Sam", auto_close: false },
    { type: "other", owner: "Mel", clock_hours: 24, escalate_to: "", auto_close: false },
  ],
};

const JOBS = [
  { id: "J-2041", customer: "Harbourview Body Corporate", site: "12 Esplanade, Manly QLD 4179" },
  { id: "J-2042", customer: "Redcliffe Dental Pty Ltd", site: "3/88 Anzac Ave, Redcliffe QLD 4020" },
  { id: "J-2043", customer: "Wynnum Bowls Club", site: "1 Bay Tce, Wynnum QLD 4178" },
];
const LEDGER = [
  { id: "INV-2207", kind: "invoice", contact: "Harbourview Body Corporate", status: "AUTHORISED" },
  { id: "INV-2210", kind: "invoice", contact: "K. Okafor", status: "AUTHORISED" },
  { id: "INV-3001", kind: "invoice", contact: "Redcliffe Dental Pty Ltd", status: "AUTHORISED" },
];

const world = (o = {}) => new TaskWorld({ jobs: JOBS, ledger: LEDGER, routing: ROUTING, now: new Date(bne("2026-11-03T09:00")), ...o });

const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const creates = (w) => calls(w, "write_task", (c) => c.request.op === "create" && c.response.id);
const sentBack = (w) => calls(w, "notify", (c) => c.request.about?.kind === "sent_back");
const noOpenDupes = (w) => {
  const keys = w.open.map((t) => `${t.record.system}|${t.record.external_id}|${t.type}`);
  return new Set(keys).size === keys.length;
};

const shortfall = (o = {}) => ({
  from: { standard: "parts-bot", surface: "bot" },
  label: "parts_shortfall",
  record: { system: "servicem8", external_id: "J-2041" },
  reason: "replacement pump not in stock at the wholesaler",
  ...o,
});

const followUp = (o = {}) => ({
  from: { person: "Jordan", surface: "workspace" },
  label: "call_back_customer",
  record: { system: "servicem8", external_id: "J-2043" },
  reason: "ring the club secretary to confirm Thursday access",
  ...o,
});

export const scenarios = [
  {
    checkId: "names-its-record",
    world: () => world(),
    drive: async (build, w) => {
      w.add({ from: { standard: "quote-desk", surface: "workspace" }, label: "price_not_in_book", record: { system: "servicem8", external_id: "J-2041" }, reason: "pump line not in the price book" });
      w.add(followUp({ from: { standard: "inbox-bot", surface: "bot" }, record: null, reason: "follow up the dental surgery about the leak" }));
      w.add({ from: { standard: "invoice-desk", surface: "workspace" }, label: "price_not_in_book", record: { system: "xero", external_id: "INV-9999" }, reason: "unpriced line" });
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      if (made.length !== 1 || w.tasks.length !== 1) return false;
      const t = made[0].request.task;
      const readAt = w.calls.findIndex((c) => c.port === "read_job" && c.request.id === "J-2041" && c.response);
      const back = sentBack(w);
      return (
        t.record.system === "servicem8" &&
        t.record.external_id === "J-2041" &&
        readAt >= 0 &&
        readAt < w.calls.indexOf(made[0]) &&
        back.length === 2 &&
        back.some((c) => c.request.to === "inbox-bot" && /no record id/.test(c.request.text)) &&
        back.some((c) => c.request.to === "invoice-desk" && /does not hold INV-9999/.test(c.request.text)) &&
        w.tasks.every((x) => Boolean(x.record?.external_id))
      );
    },
    describe: (w) => `${creates(w).length} task(s) written; sent back: ${sentBack(w).map((c) => `${c.request.to}: ${c.request.text}`).join("; ")}`,
  },
  {
    checkId: "type-from-the-closed-list",
    world: () => world(),
    drive: async (build, w) => {
      w.add(followUp({ from: { standard: "inbox-bot", surface: "bot" }, label: "missing_permit", reason: "council permit for the roof access not on file" }));
      w.add({ from: { standard: "quote-desk", surface: "workspace" }, label: "price_not_in_book", record: { system: "servicem8", external_id: "J-2042" }, reason: "after-hours rate not in the price book" });
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w).map((c) => c.request.task);
      if (made.length !== 2) return false;
      const a = made.find((t) => t.record.external_id === "J-2043");
      const b = made.find((t) => t.record.external_id === "J-2042");
      return (
        Boolean(a && b) &&
        a.type === "other" &&
        a.reason.includes("missing_permit") &&
        b.type === "price_not_in_book" &&
        w.tasks.every((t) => CLOSED_TYPES.includes(t.type))
      );
    },
    describe: (w) => creates(w).map((c) => `${c.request.task.record.external_id}: ${c.request.task.type} "${c.request.task.reason}"`).join("; "),
  },
  {
    checkId: "owner-and-clock-from-routing",
    world: () => world(),
    drive: async (build, w) => {
      w.add(shortfall({ suggested_owner: "parts-bot", suggested_due: bne("2026-11-10T09:00") }));
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      if (made.length !== 1) return false;
      const t = made[0].request.task;
      const routingAt = w.calls.findIndex((c) => c.port === "read_routing");
      const body = JSON.stringify(made[0].request);
      return (
        t.owner === "Mel" &&
        new Date(t.due_at).getTime() - new Date(made[0].at).getTime() === 4 * HOUR &&
        routingAt >= 0 &&
        routingAt < w.calls.indexOf(made[0]) &&
        t.owner !== "parts-bot" &&
        !body.includes(bne("2026-11-10T09:00"))
      );
    },
    describe: (w) => creates(w).map((c) => `owner ${c.request.task.owner}, due ${c.request.task.due_at}, written ${c.at}`).join("; "),
  },
  {
    checkId: "one-item-per-record-and-type",
    world: () => world(),
    drive: async (build, w) => {
      w.add(shortfall());
      await build(w.ports());
      w.at(bne("2026-11-03T11:00"));
      w.add(shortfall({ from: { person: "Jordan", surface: "workspace" }, reason: "wholesaler now says Thursday for the pump" }));
      w.add({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "servicem8", external_id: "J-2041" }, reason: "job card write refused" });
      await build(w.ports());
      // A person ticks the shortfall off; a fresh raise then opens a new task.
      w.at(bne("2026-11-03T12:00"));
      w.tickOff(w.open.find((t) => t.type === "parts_shortfall").id, "Mel", "pump on Thursday's run, customer told");
      w.at(bne("2026-11-03T12:30"));
      w.add(shortfall({ reason: "second pump now short as well" }));
      await build(w.ports());
    },
    holds: (w) => {
      const sf = w.tasks.filter((t) => t.type === "parts_shortfall");
      const first = sf.find((t) => t.status === "closed");
      const fresh = sf.find((t) => t.status === "open");
      const wf = w.open.filter((t) => t.type === "write_failed" && t.record.external_id === "J-2041");
      return (
        creates(w).length === 3 &&
        sf.length === 2 &&
        Boolean(first && fresh) &&
        first.id === "T-1" &&
        first.raise_count === 2 &&
        first.reason === "wholesaler now says Thursday for the pump" &&
        first.due_at === bne("2026-11-03T13:00") &&
        fresh.raise_count === 1 &&
        wf.length === 1 &&
        noOpenDupes(w)
      );
    },
    describe: (w) => w.tasks.map((t) => `${t.id} ${t.type} ${t.status} x${t.raise_count} due ${t.due_at}`).join("; "),
  },
  {
    checkId: "nothing-auto-closes",
    world: () => world(),
    drive: async (build, w) => {
      w.add({ from: { standard: "chase-bot", surface: "bot" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "said paid by Friday, nothing in" });
      w.add(followUp());
      await build(w.ports());
      w.at(bne("2026-11-03T15:00"));
      w.add({ from: { standard: "get-paid", surface: "code" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "paid in full today", resolved: true });
      w.tickOff(w.open.find((t) => t.record.external_id === "J-2043").id, "Mel", "rang the secretary, access confirmed for 7:30 Thursday");
      await build(w.ports());
    },
    holds: (w) => {
      const paid = w.tasks.find((t) => t.record.external_id === "INV-3001");
      const rang = w.tasks.find((t) => t.record.external_id === "J-2043");
      const closingWrites = calls(w, "write_task", (c) => {
        const f = c.request.op === "create" ? c.request.task : c.request.fields;
        return f?.status === "closed" || f?.closed !== undefined;
      });
      return (
        Boolean(paid && rang) &&
        paid.status === "open" &&
        paid.resolved_upstream === true &&
        rang.status === "closed" &&
        rang.closed?.by === "Mel" &&
        /access confirmed/.test(rang.closed?.outcome ?? "") &&
        Boolean(rang.closed?.at) &&
        closingWrites.length === 0
      );
    },
    describe: (w) => w.tasks.map((t) => `${t.record.external_id} ${t.status}${t.resolved_upstream ? " resolved upstream" : ""}`).join("; "),
  },
  {
    checkId: "disputes-stay-with-a-person",
    world: () => world(),
    drive: async (build, w) => {
      w.add({ from: { standard: "front-desk", surface: "call" }, label: "dispute", record: { system: "xero", external_id: "INV-2207" }, reason: "says the second visit was a callback", suggested_next: "send them a payment plan", suggested_owner: "Sam" });
      w.add({ from: { standard: "chase-bot", surface: "bot" }, label: "hardship", record: { system: "xero", external_id: "INV-2210" }, reason: "lost a major contract, asking for time" });
      await build(w.ports());
      // Both go late; the nudges must still go to Dana only.
      w.at(bne("2026-11-04T10:00"));
      await build(w.ports());
    },
    holds: (w) => {
      const items = w.tasks.filter((t) => ["INV-2207", "INV-2210"].includes(t.record.external_id));
      const said = w.calls.filter((c) => ["notify", "nudge", "send_message"].includes(c.port) && /INV-22(07|10)/.test(JSON.stringify(c.request)));
      return (
        items.length === 2 &&
        items.every((t) => t.owner === "Dana" && Boolean(t.stop_chase)) &&
        w.chaseHeld("INV-2207") &&
        w.chaseHeld("INV-2210") &&
        said.length > 0 &&
        said.every((c) => c.request.to === "Dana") &&
        calls(w, "send_message").length === 0
      );
    },
    describe: (w) => w.calls.filter((c) => ["notify", "nudge", "send_message"].includes(c.port)).map((c) => `${c.port} to ${c.request.to}`).join("; "),
  },
  {
    checkId: "overdue-escalates-once",
    world: () => world({ now: new Date(bne("2026-11-03T10:00")) }),
    drive: async (build, w) => {
      w.add(shortfall());
      w.add({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "servicem8", external_id: "J-2042" }, reason: "job card write refused" });
      await build(w.ports());
      // A follow-up with no escalation named: its one nudge goes to its owner.
      w.at(bne("2026-11-02T09:00"));
      w.add(followUp());
      await build(w.ports());
      w.at(bne("2026-11-03T13:00"));
      await build(w.ports());
      w.at(bne("2026-11-03T13:30"));
      w.tickOff(w.tasks.find((t) => t.type === "write_failed").id, "Jordan", "rewrote the job card by hand");
      for (const t of ["2026-11-03T15:00", "2026-11-03T19:00", "2026-11-04T08:00"]) {
        w.at(bne(t));
        await build(w.ports());
      }
    },
    holds: (w) => {
      const sf = w.tasks.find((t) => t.type === "parts_shortfall");
      const wf = w.tasks.find((t) => t.type === "write_failed");
      const fu = w.tasks.find((t) => t.type === "other");
      if (!sf || !wf || !fu) return false;
      const n = (id) => calls(w, "nudge", (c) => c.request.taskId === id);
      const sfN = n(sf.id);
      const fuN = n(fu.id);
      return (
        sfN.length === 1 &&
        sfN[0].request.to === "Dana" &&
        new Date(sfN[0].at).getTime() >= new Date(sf.due_at).getTime() &&
        n(wf.id).length === 0 &&
        fuN.length === 1 &&
        fuN[0].request.to === "Mel"
      );
    },
    describe: (w) => calls(w, "nudge").map((c) => `${c.request.taskId} to ${c.request.to} at ${c.at}`).join("; ") || "no nudges",
  },
  {
    checkId: "daily-summary-even-when-empty",
    world: () => world({ now: new Date(bne("2026-11-04T04:30")) }),
    drive: async (build, w) => {
      // An address the early call could not place: two hours, so late by 6:30.
      w.add({ from: { standard: "front-desk", surface: "call" }, label: "address_unresolved", record: { system: "servicem8", external_id: "J-2042" }, reason: "caller gave a suburb with no street" });
      await build(w.ports());
      w.at(bne("2026-11-04T06:00"));
      w.add(shortfall());
      w.add(followUp());
      await build(w.ports());
      w.at(bne("2026-11-04T07:05"));
      await build(w.ports());
      // A second run that morning must publish nothing more.
      w.at(bne("2026-11-04T07:40"));
      await build(w.ports());
      w.at(bne("2026-11-05T05:00"));
      for (const t of [...w.open]) w.tickOff(t.id, "Mel", "done");
      w.at(bne("2026-11-05T06:00"));
      await build(w.ports());
      w.at(bne("2026-11-05T07:05"));
      await build(w.ports());
      w.at(bne("2026-11-05T09:00"));
      await build(w.ports());
    },
    holds: (w) => {
      const pubs = calls(w, "publish_list");
      const d1 = pubs.filter((c) => c.request.day === "2026-11-04");
      const d2 = pubs.filter((c) => c.request.day === "2026-11-05");
      if (d1.length !== 1 || d2.length !== 1 || pubs.length !== 2) return false;
      const inWindow = (c) => bneDay(c.at) === c.request.day && bneMinute(c.at) >= 7 * 60 && bneMinute(c.at) < 8 * 60;
      const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
      const a = d1[0].request;
      const b = d2[0].request;
      return (
        inWindow(d1[0]) &&
        inWindow(d2[0]) &&
        sum(a.by_type) === 3 &&
        sum(a.by_owner) === 3 &&
        a.overdue.length === 1 &&
        a.none === false &&
        b.none === true &&
        sum(b.by_type) === 0 &&
        /none/.test(b.text)
      );
    },
    describe: (w) => calls(w, "publish_list").map((c) => `${c.request.day} at ${c.at}: ${JSON.stringify(c.request.by_type)} overdue ${c.request.overdue.length} none ${c.request.none}`).join("; "),
  },
];

export const liveScenarios = [
  {
    checkId: "pass-test",
    // Deliberately unpassable on a stub: three surfaces built by different
    // people writing to one list on the business's own systems.
    world: () => world(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

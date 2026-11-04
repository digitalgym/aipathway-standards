/**
 * One scenario per check of exception-desk-build-standard, for Danger Tag Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init exception-desk-build-standard`
 * from https://aipathway.com.au/explore-ai/exception-desk-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls), and where a
 * check is about what a person did on the queue's screen, the queue itself.
 * Never the build's memory.
 *
 * Times are Brisbane (UTC+10, no daylight saving). Job and invoice ids, names
 * and addresses are made up.
 */

import { TagWorld } from "./tag-world.mjs";
import { CLOSED_TYPES } from "./build.mjs";

const HOUR = 3_600_000;
const bne = (s) => `${new Date(`${s}:00+10:00`).toISOString()}`;
const localHour = (iso) => (new Date(iso).getUTCHours() + 10) % 24;
const localMinute = (iso) => localHour(iso) * 60 + new Date(iso).getUTCMinutes();

// The routing table Harding Plumbing's owner wrote. Danger tags arrive as
// `other` and go to Mel the same day: six hours, then Dana.
const ROUTING = {
  summary_at: "07:00",
  time_zone: "Australia/Brisbane",
  rows: [
    { type: "parts_shortfall", owner: "Mel", clock_hours: 4, escalate_to: "Dana", auto_close: false },
    { type: "price_not_in_book", owner: "Mel", clock_hours: 24, escalate_to: "Dana", auto_close: false },
    { type: "write_failed", owner: "Mel", clock_hours: 4, escalate_to: "Dana", auto_close: false },
    { type: "address_unresolved", owner: "Mel", clock_hours: 2, escalate_to: "Dana", auto_close: false },
    { type: "promise_broken", owner: "Mel", clock_hours: 24, escalate_to: "Dana", auto_close: false },
    // Disputes and hardship belong to Dana. The escalation row names Sam on
    // purpose: the desk must still send nothing about them to anyone but Dana.
    { type: "dispute", owner: "Dana", clock_hours: 24, escalate_to: "Sam", auto_close: false },
    { type: "hardship", owner: "Dana", clock_hours: 24, escalate_to: "Sam", auto_close: false },
    { type: "other", owner: "Mel", clock_hours: 6, escalate_to: "Dana", auto_close: false },
  ],
};

const AGENT = { name: "Priya Shah", email: "priya.shah@example-realty.com.au", role: "managing agent" };
const JOBS = [
  { id: "J-1042", site: "14 Wattle St, Paddington QLD 4064", notice_to: { name: "Ruth Patel", email: "ruth.patel@example.com.au", role: "property owner" } },
  { id: "J-1043", site: "2 Banksia Ct, Ashgrove QLD 4060" },
  { id: "J-1050", site: "9 Fig Tree Pocket Rd, Chapel Hill QLD 4069" },
  { id: "J-1077", site: "Unit 3, 41 Latrobe Tce, Paddington QLD 4064", notice_to: AGENT },
];
const INVOICES = [
  { id: "INV-2207", contact: "Lin Family Trust", status: "AUTHORISED" },
  { id: "INV-2210", contact: "M. Okafor", status: "AUTHORISED" },
  { id: "INV-3001", contact: "Ridge Cafe Pty Ltd", status: "AUTHORISED" },
];

const world = (o = {}) => new TagWorld({ jobs: JOBS, invoices: INVOICES, routing: ROUTING, now: new Date(bne("2026-11-03T09:10")), ...o });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const creates = (w) => callsTo(w, "raise_exception", (c) => c.request.op === "create" && c.response.id);
const indexOf = (w, pred) => w.calls.findIndex(pred);
const lastOpenList = (w) => {
  const lists = callsTo(w, "list_exceptions", (c) => c.request.status === "open" && Object.keys(c.request).length === 1);
  return lists.length ? lists[lists.length - 1].response : null;
};
const sayCallsAbout = (w, ids) =>
  w.calls.filter(
    (c) =>
      ["notify", "escalate", "draft_message", "send_message"].includes(c.port) &&
      JSON.stringify(c.request).match(new RegExp(ids.join("|"))),
  );

const shortfall = (o = {}) => ({
  from: { standard: "parts-check", surface: "bot" },
  label: "parts_shortfall",
  record: { system: "servicem8", external_id: "J-1042" },
  reason: "tempering valve short at the wholesaler",
  ...o,
});

const dangerTag = (o = {}) => ({
  from: { standard: "servicem8-job-app", surface: "code" },
  label: "danger_tag",
  record: { system: "servicem8", external_id: "J-1077" },
  appliance: "the wall-mounted gas heater in the living room",
  tagged_by: "Josh Nguyen",
  reason: "flue cracked and spilling combustion gases; heater isolated at the gas cock",
  evidence_uri: "servicem8://job/J-1077/attachment/tag-photo-1",
  ...o,
});

export const scenarios = [
  {
    checkId: "names-its-record",
    // 1. Three raises: J-1042 (held), a bot raise with no id, Xero INV-9999 (not held).
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "quote-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "servicem8", external_id: "J-1042" }, reason: "heat pump line not in the price book" });
      w.raise(shortfall({ record: null, reason: "Mrs Patel's hot water job is short a valve" }));
      w.raise({ from: { standard: "invoice-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "xero", external_id: "INV-9999" }, reason: "unpriced line" });
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      if (made.length !== 1) return false;
      const it = made[0].request.item;
      const onRecord = it.record.system === "servicem8" && it.record.external_id === "J-1042";
      const readFirst = indexOf(w, (c) => c.port === "read_job" && c.request.id === "J-1042" && c.response) < w.calls.indexOf(made[0]);
      const readIdx = indexOf(w, (c) => c.port === "read_job" && c.request.id === "J-1042" && c.response);
      const back = callsTo(w, "notify", (c) => c.request.about?.kind === "sent_back");
      const toBot = back.some((c) => c.request.to === "parts-check" && /no record id/.test(c.request.text));
      const toInvoiceOut = back.some((c) => c.request.to === "invoice-out" && /does not hold INV-9999/.test(c.request.text));
      const noIdless = w.queue.every((i) => i.record?.external_id);
      return onRecord && readIdx >= 0 && readFirst && toBot && toInvoiceOut && back.length === 2 && noIdless && w.queue.length === 1;
    },
    describe: (w) => `${creates(w).length} item(s) written: ${creates(w).map((c) => c.request.item.record.external_id).join(", ")}; sent back: ${callsTo(w, "notify", (c) => c.request.about?.kind === "sent_back").map((c) => `${c.request.to} (${c.request.text})`).join("; ")}`,
  },
  {
    checkId: "type-from-the-closed-list",
    // 2. missing_permit (off the list) and price_not_in_book, plus the tech's
    // danger_tag, which is this desk's main source and is also off the list.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "permit-bot", surface: "bot" }, label: "missing_permit", record: { system: "servicem8", external_id: "J-1050" }, reason: "council plumbing permit not lodged" });
      w.raise({ from: { standard: "quote-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "servicem8", external_id: "J-1042" }, reason: "heat pump line not in the price book" });
      w.raise(dangerTag());
      await build(w.ports());
    },
    holds: (w) => {
      const items = creates(w).map((c) => c.request.item);
      const permit = items.find((i) => i.record.external_id === "J-1050");
      const price = items.find((i) => i.record.external_id === "J-1042");
      const tag = items.find((i) => i.record.external_id === "J-1077");
      if (items.length !== 3 || !permit || !price || !tag) return false;
      const typed = permit.type === "other" && permit.reason.includes("missing_permit") && price.type === "price_not_in_book";
      const tagTyped = tag.type === "other" && tag.reason.includes("danger_tag") && tag.owner === "Mel";
      const allClosed = w.queue.every((i) => CLOSED_TYPES.includes(i.type));
      // The danger tag: the notice on the job record, with an id back, and the
      // written notice drafted to the managing agent for Mel to send. Nothing sent.
      const note = callsTo(w, "write_job", (c) => c.request.jobId === "J-1077" && /DANGER - DO NOT USE/.test(c.request.note) && c.response.id);
      const draft = callsTo(w, "draft_message", (c) => c.request.to?.email === AGENT.email && c.request.for_release_by === "Mel" && /Danger Do Not Use/.test(c.request.subject) && c.response.id);
      const noSend = callsTo(w, "send_message").length === 0;
      const noOtherNotes = callsTo(w, "write_job", (c) => c.request.jobId !== "J-1077").length === 0;
      return typed && tagTyped && allClosed && note.length === 1 && draft.length === 1 && noSend && noOtherNotes;
    },
    describe: (w) =>
      `items: ${creates(w).map((c) => `${c.request.item.record.external_id}=${c.request.item.type} (${c.request.item.reason})`).join("; ")}; notes on job: ${callsTo(w, "write_job").length}; drafts: ${callsTo(w, "draft_message").length}; sends: ${callsTo(w, "send_message").length}`,
  },
  {
    checkId: "owner-and-clock-from-routing",
    // 3. The bot suggests itself as owner, due in a week. Routing says Mel, 4 hours.
    world: () => world(),
    drive: async (build, w) => {
      w.raise(shortfall({ suggested_owner: "parts-check-bot", suggested_due_at: bne("2026-11-10T09:10") }));
      // The tech's tag, with the tech suggesting he follow it up himself.
      w.raise(dangerTag({ suggested_owner: "Josh Nguyen", suggested_due_at: bne("2026-11-06T17:00") }));
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      const s = made.find((c) => c.request.item.type === "parts_shortfall");
      const t = made.find((c) => c.request.item.record.external_id === "J-1077");
      if (!s || !t) return false;
      const raisedAt = new Date(bne("2026-11-03T09:10")).getTime();
      const sOk = s.request.item.owner === "Mel" && new Date(s.request.item.due_at).getTime() === raisedAt + 4 * HOUR;
      const tOk = t.request.item.owner === "Mel" && new Date(t.request.item.due_at).getTime() === raisedAt + 6 * HOUR; // same day, 3:10pm
      const ruleFirst = indexOf(w, (c) => c.port === "read_rule") >= 0 && indexOf(w, (c) => c.port === "read_rule") < w.calls.indexOf(s);
      const writes = JSON.stringify(callsTo(w, "raise_exception").map((c) => c.request));
      const ignored = !writes.includes("parts-check-bot") && !writes.includes(bne("2026-11-10T09:10")) && !/"owner":"Josh Nguyen"/.test(writes) && !writes.includes(bne("2026-11-06T17:00"));
      const toldMel = callsTo(w, "notify").every((c) => c.request.to === "Mel");
      return sOk && tOk && ruleFirst && ignored && toldMel;
    },
    describe: (w) => creates(w).map((c) => `${c.request.item.type} on ${c.request.item.record.external_id}: owner ${c.request.item.owner}, due ${c.request.item.due_at}`).join("; "),
  },
  {
    checkId: "one-item-per-record-and-type",
    // 4. A shortfall, the same shortfall two hours later with a new reason, and write_failed.
    world: () => world(),
    drive: async (build, w) => {
      w.raise(shortfall());
      w.raise(dangerTag());
      await build(w.ports());
      w.advance(2 * HOUR);
      w.raise(shortfall({ from: { standard: "parts-ready", surface: "workspace" }, reason: "supplier now says Thursday" }));
      w.raise({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "servicem8", external_id: "J-1042" }, reason: "job card write refused" });
      // The tech's app fires the tag a second time when the job syncs.
      w.raise(dangerTag({ reason: "flue cracked; owner was told on site" }));
      await build(w.ports());
    },
    holds: (w) => {
      const open = lastOpenList(w);
      if (!open) return false;
      const on1042 = open.filter((i) => i.record.external_id === "J-1042");
      const sf = on1042.find((i) => i.type === "parts_shortfall");
      const wf = on1042.find((i) => i.type === "write_failed");
      const first = creates(w).find((c) => c.request.item.type === "parts_shortfall");
      if (!sf || !wf || !first) return false;
      const keptClock = sf.id === first.response.id && sf.due_at === first.request.item.due_at;
      const updated = sf.reason === "supplier now says Thursday" && sf.raise_count === 2;
      const keys = open.map((i) => `${i.record.system}|${i.record.external_id}|${i.type}`);
      const unique = new Set(keys).size === keys.length;
      const tag = open.filter((i) => i.record.external_id === "J-1077");
      const oneTag = tag.length === 1 && tag[0].raise_count === 2;
      const oneNotice = callsTo(w, "draft_message").length === 1 && w.jobs.get("J-1077").notes.length === 1;
      return on1042.length === 2 && keptClock && updated && unique && oneTag && oneNotice && creates(w).length === 3;
    },
    describe: (w) => `open: ${(lastOpenList(w) ?? []).map((i) => `${i.id} ${i.record.external_id}/${i.type} x${i.raise_count} due ${i.due_at}`).join("; ")}; creates ${creates(w).length}; drafts ${callsTo(w, "draft_message").length}`,
  },
  {
    checkId: "nothing-auto-closes",
    // 5. Get Paid reports the first invoice paid; Mel closes the second on screen.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "debtor-chasing", surface: "office_voice" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "promised Friday, nothing arrived" });
      w.raise(shortfall());
      w.raise(dangerTag());
      await build(w.ports());
      w.advance(HOUR);
      w.raise({ from: { standard: "get-paid", surface: "office_voice" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "invoice paid in full", resolved_upstream: true });
      // The tech's app reports the heater was replaced.
      w.raise(dangerTag({ reason: "heater replaced, tag removed", resolved_upstream: true }));
      const sf = w.queue.find((i) => i.type === "parts_shortfall");
      if (sf) w.closeByPerson(sf.id, "Mel", "rang supplier, part on the 7:30 run");
      await build(w.ports());
    },
    holds: (w) => {
      const inv = w.queue.find((i) => i.record.external_id === "INV-3001");
      const sf = w.queue.find((i) => i.type === "parts_shortfall");
      const tag = w.queue.find((i) => i.record.external_id === "J-1077");
      if (!inv || !sf || !tag) return false;
      const stillOpen = inv.status === "open" && inv.resolved_upstream === true && tag.status === "open" && tag.resolved_upstream === true;
      const closedByMel = sf.status === "closed" && sf.closed?.by === "Mel" && sf.closed?.outcome === "rang supplier, part on the 7:30 run" && !!sf.closed?.at;
      const noMachineClose = callsTo(w, "raise_exception").every((c) => {
        const body = c.request.op === "create" ? c.request.item : c.request.fields;
        return body.status !== "closed" && body.closed === undefined;
      });
      return stillOpen && closedByMel && noMachineClose;
    },
    describe: (w) => w.queue.map((i) => `${i.id} ${i.type} ${i.status}${i.resolved_upstream ? " resolved-upstream" : ""}${i.closed ? ` closed by ${i.closed.by}: ${i.closed.outcome}` : ""}`).join("; "),
  },
  {
    checkId: "disputes-stay-with-a-person",
    // 6. A call raises a dispute on INV-2207 suggesting a payment plan; a bot raises hardship on INV-2210.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({
        from: { standard: "booked-after-hours", surface: "office_voice", via: "call" },
        label: "dispute",
        record: { system: "xero", external_id: "INV-2207" },
        reason: "caller says the second visit was a callback",
        suggested_owner: "front-desk",
        suggested_action: "send a payment plan to the customer",
        evidence_uri: "ov://call/CALL-88/transcript",
      });
      w.raise({ from: { standard: "chase-bot", surface: "bot" }, label: "hardship", record: { system: "xero", external_id: "INV-2210" }, reason: "customer lost their job, asks for time", suggested_action: "offer three instalments" });
      await build(w.ports());
      // Past due, so the escalation pass runs on both.
      w.advance(26 * HOUR);
      await build(w.ports());
    },
    holds: (w) => {
      const items = creates(w).map((c) => c.request.item);
      const d = items.find((i) => i.record.external_id === "INV-2207");
      const h = items.find((i) => i.record.external_id === "INV-2210");
      if (!d || !h) return false;
      const owned = d.owner === "Dana" && h.owner === "Dana" && d.stop_chase === "dispute" && h.stop_chase === "hardship";
      const held = w.chaseHeld("INV-2207") && w.chaseHeld("INV-2210");
      const about = sayCallsAbout(w, ["INV-2207", "INV-2210", d && creates(w)[0].response.id, creates(w)[1]?.response.id].filter(Boolean));
      const onlyDana = about.length > 0 && about.every((c) => c.request.to === "Dana");
      const nothingDrafted = callsTo(w, "draft_message").length === 0 && callsTo(w, "send_message").length === 0;
      return owned && held && onlyDana && nothingDrafted;
    },
    describe: (w) => `items: ${creates(w).map((c) => `${c.request.item.record.external_id} ${c.request.item.type} -> ${c.request.item.owner}, stop ${c.request.item.stop_chase}`).join("; ")}; said: ${w.calls.filter((c) => ["notify", "escalate", "draft_message", "send_message"].includes(c.port)).map((c) => `${c.port}->${c.request.to}`).join(", ")}`,
  },
  {
    checkId: "overdue-escalates-once",
    // 7. A shortfall due 2pm; a second item due 2pm closed by a person at 1:30pm.
    world: () => world({ now: new Date(bne("2026-11-03T10:00")) }),
    drive: async (build, w) => {
      w.raise(shortfall());
      w.raise({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "servicem8", external_id: "J-1043" }, reason: "job card write refused" });
      await build(w.ports()); // 10am
      w.at(bne("2026-11-03T13:00"));
      await build(w.ports()); // 1pm
      w.at(bne("2026-11-03T13:30"));
      const wf = w.queue.find((i) => i.type === "write_failed");
      if (wf) w.closeByPerson(wf.id, "Mel", "re-ran the write, card is on the job");
      w.at(bne("2026-11-03T15:00"));
      await build(w.ports()); // 3pm
      w.at(bne("2026-11-03T19:00"));
      await build(w.ports()); // 7pm
      w.at(bne("2026-11-04T07:00"));
      await build(w.ports()); // next morning
    },
    holds: (w) => {
      const sf = creates(w).find((c) => c.request.item.type === "parts_shortfall");
      const wf = creates(w).find((c) => c.request.item.type === "write_failed");
      if (!sf || !wf) return false;
      const due = new Date(bne("2026-11-03T14:00")).getTime();
      if (new Date(sf.request.item.due_at).getTime() !== due) return false;
      const esc = callsTo(w, "escalate");
      const forSf = esc.filter((c) => c.request.itemId === sf.response.id);
      const forWf = esc.filter((c) => c.request.itemId === wf.response.id);
      return esc.length === 1 && forSf.length === 1 && forSf[0].request.to === "Dana" && new Date(forSf[0].at).getTime() >= due && forWf.length === 0;
    },
    describe: (w) => `escalations: ${callsTo(w, "escalate").map((c) => `${c.request.itemId} -> ${c.request.to} at ${c.at}`).join("; ") || "none"}`,
  },
  {
    checkId: "daily-summary-even-when-empty",
    // 8. Two mornings, summary at 7am, runs at 6am and 7:05am. Three open, one
    // overdue on the first; all closed by the second.
    world: () => world({ now: new Date(bne("2026-11-03T05:00")) }),
    drive: async (build, w) => {
      w.raise({ from: { standard: "booked-after-hours", surface: "office_voice", via: "call" }, label: "address_unresolved", record: { system: "servicem8", external_id: "J-1043" }, reason: "caller gave a street with no number" });
      w.raise({ from: { standard: "booked-after-hours", surface: "office_voice", via: "call" }, label: "dispute", record: { system: "xero", external_id: "INV-2207" }, reason: "second visit was a callback" });
      w.raise(dangerTag());
      await build(w.ports()); // 5am intake, before the summary time
      for (const t of ["2026-11-03T06:00", "2026-11-03T07:05", "2026-11-03T07:40"]) {
        w.at(bne(t));
        await build(w.ports());
      }
      w.at(bne("2026-11-03T10:00"));
      for (const i of w.open) w.closeByPerson(i.id, i.owner, "dealt with");
      for (const t of ["2026-11-04T06:00", "2026-11-04T07:05", "2026-11-04T07:40"]) {
        w.at(bne(t));
        await build(w.ports());
      }
    },
    holds: (w) => {
      const pubs = callsTo(w, "publish_report", (c) => c.response.id);
      if (pubs.length !== 2) return false;
      const [a, b] = pubs;
      const inWindow = (c) => localMinute(c.at) >= 7 * 60 && localMinute(c.at) < 8 * 60;
      const sum = (o) => Object.values(o ?? {}).reduce((x, y) => x + y, 0);
      const addr = creates(w).find((c) => c.request.item.type === "address_unresolved")?.response.id;
      const first =
        a.request.day === "2026-11-03" &&
        sum(a.request.by_type) === 3 &&
        sum(a.request.by_owner) === 3 &&
        a.request.by_owner.Mel === 2 &&
        a.request.by_owner.Dana === 1 &&
        a.request.overdue.length === 1 &&
        a.request.overdue[0] === addr &&
        a.request.other_labels.includes("danger_tag") &&
        a.request.none === false;
      const second = b.request.day === "2026-11-04" && b.request.none === true && sum(b.request.by_type) === 0 && b.request.overdue.length === 0;
      return inWindow(a) && inWindow(b) && first && second;
    },
    describe: (w) => callsTo(w, "publish_report").map((c) => `${c.request.day} at ${c.at}: ${c.request.text} by_type ${JSON.stringify(c.request.by_type)} overdue ${JSON.stringify(c.request.overdue)}`).join(" | ") || "no summary published",
  },
];

// The pass test runs on the business's own systems, from three real surfaces.
// On the stub the runner reports it with_us and never calls this.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of exception-desk-build-standard, for Prestart Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init exception-desk-build-standard`
 * from https://aipathway.com.au/explore-ai/exception-desk-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls), and where a
 * check is about what a person did on the queue's screen, the queue itself and
 * the attachments on each record. Never the build's memory.
 *
 * Times are Brisbane (UTC+10, no daylight saving). Job ids, asset ids, regos,
 * invoice ids, names and addresses are made up.
 */

import { CheckWorld } from "./check-world.mjs";
import { CLOSED_TYPES } from "./build.mjs";

const HOUR = 3_600_000;
const bne = (s) => `${new Date(`${s}:00+10:00`).toISOString()}`;
const localMinute = (iso) => ((new Date(iso).getUTCHours() + 10) % 24) * 60 + new Date(iso).getUTCMinutes();

// The routing table Harding Plumbing's owner wrote. A failed vehicle check
// goes to Kim, who looks after the vans, with two hours on the clock; a failed
// site check goes to Tom, the site supervisor, with four. Both escalate to Dana.
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
    { type: "other", label: "vehicle_check_failed", owner: "Kim", clock_hours: 2, escalate_to: "Dana", auto_close: false },
    { type: "other", label: "site_check_failed", owner: "Tom", clock_hours: 4, escalate_to: "Dana", auto_close: false },
    { type: "other", owner: "Mel", clock_hours: 6, escalate_to: "Dana", auto_close: false },
  ],
};

const JOBS = [
  { system: "simpro", id: "J-1042", site: "14 Wattle St, Paddington QLD 4064" },
  { system: "simpro", id: "J-1043", site: "2 Banksia Ct, Ashgrove QLD 4060" },
  { system: "simpro", id: "J-1050", site: "9 Fig Tree Pocket Rd, Chapel Hill QLD 4069" },
  { system: "simpro", id: "J-1077", site: "Lot 12, Corella Dr, Ripley QLD 4306" },
];
const ASSETS = [
  { system: "simpro", id: "AS-201", rego: "512 XKT", description: "white tray-back ute, van 3" },
  { system: "simpro", id: "AS-202", rego: "604 QRM", description: "service van, van 4" },
];
const INVOICES = [
  { id: "INV-2207", contact: "Lin Family Trust", status: "AUTHORISED" },
  { id: "INV-2210", contact: "M. Okafor", status: "AUTHORISED" },
  { id: "INV-3001", contact: "Ridge Cafe Pty Ltd", status: "AUTHORISED" },
];
const JOSH = { name: "Josh Nguyen", email: "josh@example-plumbing.com.au" };
const AMY = { name: "Amy Clarke", email: "amy@example-plumbing.com.au" };

const world = (o = {}) =>
  new CheckWorld({ jobs: JOBS, assets: ASSETS, invoices: INVOICES, routing: ROUTING, now: new Date(bne("2026-11-03T06:30")), ...o });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const creates = (w) => callsTo(w, "raise_exception", (c) => c.request.op === "create" && c.response.id);
const indexOf = (w, pred) => w.calls.findIndex(pred);
const lastOpenList = (w) => {
  const lists = callsTo(w, "list_exceptions", (c) => c.request.status === "open" && Object.keys(c.request).length === 1);
  return lists.length ? lists[lists.length - 1].response : null;
};
const sayCallsAbout = (w, ids) =>
  w.calls.filter(
    (c) => ["notify", "escalate", "send_message"].includes(c.port) && JSON.stringify(c.request).match(new RegExp(ids.join("|"))),
  );
const filedWithId = (w, pred = () => true) => callsTo(w, "file_check", (c) => c.response.id && pred(c));

const shortfall = (o = {}) => ({
  from: { standard: "parts-check", surface: "bot" },
  label: "parts_shortfall",
  record: { system: "simpro", external_id: "J-1042" },
  reason: "tempering valve short at the wholesaler",
  ...o,
});

const vehicleCheck = (o = {}) => ({
  kind: "vehicle",
  record: { system: "simpro", external_id: "AS-201" },
  done_by: "Josh Nguyen",
  items: [
    { item: "Brakes", result: "fail", note: "pedal goes soft" },
    { item: "Tyres", result: "pass" },
    { item: "Lights and indicators", result: "pass" },
    { item: "Load restraint", result: "pass" },
  ],
  ...o,
});

const siteCheck = (o = {}) => ({
  kind: "site",
  record: { system: "simpro", external_id: "J-1077" },
  done_by: "Amy Clarke",
  items: [
    { item: "Trench barricaded", result: "fail", note: "no barrier on the street side" },
    { item: "Excavation over 1.5 m has shoring", result: "pass" },
    { item: "Site sign-in sheet", result: "pass" },
  ],
  ...o,
});

const allPass = (items) => items.map((i) => ({ item: i.item, result: "pass" }));

export const scenarios = [
  {
    checkId: "names-its-record",
    // 1. The three raises the check names, and three daily checks: one on a
    // vehicle Simpro holds, one with no vehicle picked, one on an asset id
    // Simpro does not hold.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "quote-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "simpro", external_id: "J-1042" }, reason: "heat pump line not in the price book" });
      w.raise(shortfall({ record: null, reason: "Mrs Patel's hot water job is short a valve" }));
      w.raise({ from: { standard: "invoice-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "xero", external_id: "INV-9999" }, reason: "unpriced line" });
      w.mailCheck(vehicleCheck(), JOSH);
      w.mailCheck(vehicleCheck({ record: { system: "simpro" } }), AMY);
      w.mailCheck(vehicleCheck({ record: { system: "simpro", external_id: "AS-999" } }), AMY);
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      if (made.length !== 2) return false;
      const price = made.find((c) => c.request.item.record.external_id === "J-1042");
      const van = made.find((c) => c.request.item.record.external_id === "AS-201");
      if (!price || !van) return false;
      const readJob = indexOf(w, (c) => c.port === "read_job" && c.request.id === "J-1042" && c.response);
      const readVan = indexOf(w, (c) => c.port === "read_asset" && c.request.id === "AS-201" && c.response);
      const fileVan = indexOf(w, (c) => c.port === "file_check" && c.request.recordId === "AS-201" && c.response.id);
      const ordered = readJob >= 0 && readJob < w.calls.indexOf(price) && readVan >= 0 && readVan < fileVan && fileVan < w.calls.indexOf(van);
      const back = callsTo(w, "notify", (c) => c.request.about?.kind === "sent_back");
      const toBot = back.some((c) => c.request.to === "parts-check" && /no record id/.test(c.request.text));
      const toInvoiceOut = back.some((c) => c.request.to === "invoice-out" && /does not hold INV-9999/.test(c.request.text));
      const toAmyNoId = back.some((c) => c.request.to === AMY.email && /no vehicle asset id/.test(c.request.text));
      const toAmyUnheld = back.some((c) => c.request.to === AMY.email && /does not hold vehicle AS-999/.test(c.request.text));
      const nothingFiledUnheld = callsTo(w, "file_check").every((c) => c.request.recordId === "AS-201");
      const noIdless = w.queue.every((i) => i.record?.external_id);
      return ordered && toBot && toInvoiceOut && toAmyNoId && toAmyUnheld && back.length === 4 && nothingFiledUnheld && noIdless && w.queue.length === 2;
    },
    describe: (w) =>
      `${creates(w).length} item(s): ${creates(w).map((c) => c.request.item.record.external_id).join(", ")}; filed on: ${callsTo(w, "file_check").map((c) => c.request.recordId).join(", ") || "none"}; sent back: ${callsTo(w, "notify", (c) => c.request.about?.kind === "sent_back").map((c) => `${c.request.to} (${c.request.text})`).join("; ")}`,
  },
  {
    checkId: "type-from-the-closed-list",
    // 2. missing_permit (off the list) and price_not_in_book, plus a failed
    // vehicle check, a failed site check and a vehicle check that passed.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "permit-bot", surface: "bot" }, label: "missing_permit", record: { system: "simpro", external_id: "J-1050" }, reason: "council plumbing permit not lodged" });
      w.raise({ from: { standard: "quote-out", surface: "workspace" }, label: "price_not_in_book", record: { system: "simpro", external_id: "J-1042" }, reason: "heat pump line not in the price book" });
      w.mailCheck(vehicleCheck(), JOSH);
      w.mailCheck(siteCheck(), AMY);
      w.mailCheck(vehicleCheck({ record: { system: "simpro", external_id: "AS-202" }, items: allPass(vehicleCheck().items) }), AMY);
      await build(w.ports());
    },
    holds: (w) => {
      const items = creates(w).map((c) => c.request.item);
      const by = (id) => items.find((i) => i.record.external_id === id);
      const permit = by("J-1050");
      const price = by("J-1042");
      const van = by("AS-201");
      const site = by("J-1077");
      if (items.length !== 4 || !permit || !price || !van || !site) return false;
      const typed = permit.type === "other" && permit.reason.includes("missing_permit") && price.type === "price_not_in_book";
      const vanTyped = van.type === "other" && van.reason.includes("vehicle_check_failed") && van.reason.includes("Brakes") && !van.reason.includes("Tyres");
      const siteTyped = site.type === "other" && site.reason.includes("site_check_failed") && site.reason.includes("Trench barricaded");
      const allClosed = w.queue.every((i) => CLOSED_TYPES.includes(i.type));
      // All three checks filed with an id back, the passing one with no item.
      const filed = filedWithId(w);
      const threeFiled = filed.length === 3 && ["AS-201", "J-1077", "AS-202"].every((id) => filed.some((c) => c.request.recordId === id));
      const noPassItem = !by("AS-202");
      const noSend = callsTo(w, "send_message").length === 0;
      return typed && vanTyped && siteTyped && allClosed && threeFiled && noPassItem && noSend;
    },
    describe: (w) =>
      `items: ${creates(w).map((c) => `${c.request.item.record.external_id}=${c.request.item.type} (${c.request.item.reason})`).join("; ")}; filed: ${filedWithId(w).map((c) => c.request.recordId).join(", ")}`,
  },
  {
    checkId: "owner-and-clock-from-routing",
    // 3. The bot suggests itself as owner; the tech's form suggests he sorts the
    // brakes himself by Friday. Routing says Mel 4h, Kim 2h, Tom 4h.
    world: () => world(),
    drive: async (build, w) => {
      w.raise(shortfall({ suggested_owner: "parts-check-bot", suggested_due_at: bne("2026-11-10T09:10") }));
      w.mailCheck(vehicleCheck({ suggested_owner: "Josh Nguyen", suggested_due_at: bne("2026-11-06T17:00") }), JOSH);
      w.mailCheck(siteCheck({ suggested_owner: "Amy Clarke" }), AMY);
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      const s = made.find((c) => c.request.item.type === "parts_shortfall");
      const v = made.find((c) => c.request.item.record.external_id === "AS-201");
      const t = made.find((c) => c.request.item.record.external_id === "J-1077");
      if (!s || !v || !t) return false;
      const at = new Date(bne("2026-11-03T06:30")).getTime();
      const sOk = s.request.item.owner === "Mel" && new Date(s.request.item.due_at).getTime() === at + 4 * HOUR;
      const vOk = v.request.item.owner === "Kim" && new Date(v.request.item.due_at).getTime() === at + 2 * HOUR;
      const tOk = t.request.item.owner === "Tom" && new Date(t.request.item.due_at).getTime() === at + 4 * HOUR;
      const rule = indexOf(w, (c) => c.port === "read_rule");
      const ruleFirst = rule >= 0 && made.every((c) => rule < w.calls.indexOf(c));
      const writes = JSON.stringify(callsTo(w, "raise_exception").map((c) => c.request));
      const ignored =
        !writes.includes("parts-check-bot") &&
        !writes.includes(bne("2026-11-10T09:10")) &&
        !/"owner":"(Josh Nguyen|Amy Clarke)"/.test(writes) &&
        !writes.includes(bne("2026-11-06T17:00"));
      const told = callsTo(w, "notify", (c) => c.request.about?.item_id);
      const toldOwners = told.length === 3 && ["Mel", "Kim", "Tom"].every((o) => told.some((c) => c.request.to === o));
      return sOk && vOk && tOk && ruleFirst && ignored && toldOwners;
    },
    describe: (w) => creates(w).map((c) => `${c.request.item.arrived_as ?? c.request.item.type} on ${c.request.item.record.external_id}: owner ${c.request.item.owner}, due ${c.request.item.due_at}`).join("; "),
  },
  {
    checkId: "one-item-per-record-and-type",
    // 4. Tuesday the ute fails its brakes; Wednesday it fails brakes and
    // lights. A shortfall is raised twice, and a write_failed on the same job.
    world: () => world(),
    drive: async (build, w) => {
      w.mailCheck(vehicleCheck(), JOSH);
      w.raise(shortfall());
      await build(w.ports());
      w.advance(2 * HOUR);
      w.raise(shortfall({ from: { standard: "parts-ready", surface: "workspace" }, reason: "supplier now says Thursday" }));
      w.raise({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "simpro", external_id: "J-1042" }, reason: "job card write refused" });
      await build(w.ports());
      w.at(bne("2026-11-04T06:30"));
      w.mailCheck(
        vehicleCheck({
          items: [
            { item: "Brakes", result: "fail", note: "still soft" },
            { item: "Tyres", result: "pass" },
            { item: "Lights and indicators", result: "fail", note: "left indicator out" },
            { item: "Load restraint", result: "pass" },
          ],
        }),
        JOSH,
      );
      await build(w.ports());
    },
    holds: (w) => {
      const open = lastOpenList(w);
      if (!open) return false;
      const on1042 = open.filter((i) => i.record.external_id === "J-1042");
      const sf = on1042.find((i) => i.type === "parts_shortfall");
      const wf = on1042.find((i) => i.type === "write_failed");
      const first = creates(w).find((c) => c.request.item.type === "parts_shortfall");
      const firstVan = creates(w).find((c) => c.request.item.record.external_id === "AS-201");
      if (!sf || !wf || !first || !firstVan) return false;
      const keptClock = sf.id === first.response.id && sf.due_at === first.request.item.due_at;
      const updated = sf.reason === "supplier now says Thursday" && sf.raise_count === 2;
      const vans = open.filter((i) => i.record.external_id === "AS-201");
      const van = vans[0];
      const oneVan =
        vans.length === 1 &&
        van.id === firstVan.response.id &&
        van.raise_count === 2 &&
        van.due_at === firstVan.request.item.due_at &&
        JSON.stringify(van.failed_items) === JSON.stringify(["Brakes", "Lights and indicators"]);
      const bothFiled = w.attachmentsOn("simpro", "asset", "AS-201").length === 2;
      const keys = open.map((i) => `${i.record.system}|${i.record.external_id}|${i.type}`);
      const unique = new Set(keys).size === keys.length;
      return on1042.length === 2 && keptClock && updated && oneVan && bothFiled && unique && creates(w).length === 3;
    },
    describe: (w) =>
      `open: ${(lastOpenList(w) ?? []).map((i) => `${i.id} ${i.record.external_id}/${i.type} x${i.raise_count} due ${i.due_at}${i.failed_items ? ` [${i.failed_items.join(", ")}]` : ""}`).join("; ")}; creates ${creates(w).length}; attachments on AS-201 ${w.attachmentsOn("simpro", "asset", "AS-201").length}`,
  },
  {
    checkId: "nothing-auto-closes",
    // 5. The ute fails Tuesday and passes Wednesday; the invoice is reported
    // paid; Mel closes the shortfall on screen.
    world: () => world(),
    drive: async (build, w) => {
      w.raise({ from: { standard: "debtor-chasing", surface: "office_voice" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "promised Friday, nothing arrived" });
      w.raise(shortfall());
      w.mailCheck(vehicleCheck(), JOSH);
      await build(w.ports());
      w.at(bne("2026-11-04T06:30"));
      w.raise({ from: { standard: "get-paid", surface: "office_voice" }, label: "promise_broken", record: { system: "xero", external_id: "INV-3001" }, reason: "invoice paid in full", resolved_upstream: true });
      w.mailCheck(vehicleCheck({ items: allPass(vehicleCheck().items) }), JOSH);
      const sf = w.queue.find((i) => i.type === "parts_shortfall");
      if (sf) w.closeByPerson(sf.id, "Mel", "rang supplier, part on the 7:30 run");
      await build(w.ports());
    },
    holds: (w) => {
      const inv = w.queue.find((i) => i.record.external_id === "INV-3001");
      const sf = w.queue.find((i) => i.type === "parts_shortfall");
      const van = w.queue.find((i) => i.record.external_id === "AS-201");
      if (!inv || !sf || !van) return false;
      const stillOpen = inv.status === "open" && inv.resolved_upstream === true && van.status === "open" && van.resolved_upstream === true;
      const closedByMel = sf.status === "closed" && sf.closed?.by === "Mel" && sf.closed?.outcome === "rang supplier, part on the 7:30 run" && !!sf.closed?.at;
      const noMachineClose = callsTo(w, "raise_exception").every((c) => {
        const body = c.request.op === "create" ? c.request.item : c.request.fields;
        return body.status !== "closed" && body.closed === undefined;
      });
      const passFiled = w.attachmentsOn("simpro", "asset", "AS-201").length === 2;
      return stillOpen && closedByMel && noMachineClose && passFiled;
    },
    describe: (w) => w.queue.map((i) => `${i.id} ${i.arrived_as ?? i.type} ${i.status}${i.resolved_upstream ? " resolved-upstream" : ""}${i.closed ? ` closed by ${i.closed.by}: ${i.closed.outcome}` : ""}`).join("; "),
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
      w.advance(26 * HOUR);
      await build(w.ports());
    },
    holds: (w) => {
      const made = creates(w);
      const d = made.find((c) => c.request.item.record.external_id === "INV-2207");
      const h = made.find((c) => c.request.item.record.external_id === "INV-2210");
      if (!d || !h) return false;
      const di = d.request.item;
      const hi = h.request.item;
      const owned = di.owner === "Dana" && hi.owner === "Dana" && di.stop_chase === "dispute" && hi.stop_chase === "hardship";
      const held = w.chaseHeld("INV-2207") && w.chaseHeld("INV-2210");
      const about = sayCallsAbout(w, ["INV-2207", "INV-2210", d.response.id, h.response.id]);
      const onlyDana = about.length > 0 && about.every((c) => c.request.to === "Dana");
      const nothingSent = callsTo(w, "send_message").length === 0;
      return owned && held && onlyDana && nothingSent;
    },
    describe: (w) =>
      `items: ${creates(w).map((c) => `${c.request.item.record.external_id} ${c.request.item.type} -> ${c.request.item.owner}, stop ${c.request.item.stop_chase}`).join("; ")}; said: ${w.calls.filter((c) => ["notify", "escalate", "send_message"].includes(c.port)).map((c) => `${c.port}->${c.request.to}`).join(", ")}`,
  },
  {
    checkId: "overdue-escalates-once",
    // 7. The ute fails at 6:30 (due 8:30). A shortfall at 10am (due 2pm). A
    // write_failed at 10am, closed by Mel at 1:30pm before it is due.
    world: () => world(),
    drive: async (build, w) => {
      w.mailCheck(vehicleCheck(), JOSH);
      await build(w.ports()); // 6:30
      w.at(bne("2026-11-03T08:00"));
      await build(w.ports()); // before it is due
      w.at(bne("2026-11-03T10:00"));
      w.raise(shortfall());
      w.raise({ from: { standard: "job-close", surface: "code" }, label: "write_failed", record: { system: "simpro", external_id: "J-1043" }, reason: "job card write refused" });
      await build(w.ports()); // 10am
      w.at(bne("2026-11-03T13:00"));
      await build(w.ports());
      w.at(bne("2026-11-03T13:30"));
      const wf = w.queue.find((i) => i.type === "write_failed");
      if (wf) w.closeByPerson(wf.id, "Mel", "re-ran the write, card is on the job");
      for (const t of ["2026-11-03T15:00", "2026-11-03T19:00", "2026-11-04T07:00"]) {
        w.at(bne(t));
        await build(w.ports());
      }
    },
    holds: (w) => {
      const made = creates(w);
      const v = made.find((c) => c.request.item.record.external_id === "AS-201");
      const sf = made.find((c) => c.request.item.type === "parts_shortfall");
      const wf = made.find((c) => c.request.item.type === "write_failed");
      if (!v || !sf || !wf) return false;
      const vDue = new Date(bne("2026-11-03T08:30")).getTime();
      const sDue = new Date(bne("2026-11-03T14:00")).getTime();
      if (new Date(v.request.item.due_at).getTime() !== vDue || new Date(sf.request.item.due_at).getTime() !== sDue) return false;
      const esc = callsTo(w, "escalate");
      const forV = esc.filter((c) => c.request.itemId === v.response.id);
      const forS = esc.filter((c) => c.request.itemId === sf.response.id);
      const forW = esc.filter((c) => c.request.itemId === wf.response.id);
      return (
        esc.length === 2 &&
        forV.length === 1 &&
        forV[0].request.to === "Dana" &&
        new Date(forV[0].at).getTime() >= vDue &&
        forS.length === 1 &&
        forS[0].request.to === "Dana" &&
        new Date(forS[0].at).getTime() >= sDue &&
        forW.length === 0
      );
    },
    describe: (w) => `escalations: ${callsTo(w, "escalate").map((c) => `${c.request.itemId} -> ${c.request.to} at ${c.at}`).join("; ") || "none"}`,
  },
  {
    checkId: "daily-summary-even-when-empty",
    // 8. Two mornings, summary at 7am. Day one: an address (due 7am), a dispute
    // and a failed ute check at 6am (due 8am). Day two: all closed.
    world: () => world({ now: new Date(bne("2026-11-03T05:00")) }),
    drive: async (build, w) => {
      w.raise({ from: { standard: "booked-after-hours", surface: "office_voice", via: "call" }, label: "address_unresolved", record: { system: "simpro", external_id: "J-1043" }, reason: "caller gave a street with no number" });
      w.raise({ from: { standard: "booked-after-hours", surface: "office_voice", via: "call" }, label: "dispute", record: { system: "xero", external_id: "INV-2207" }, reason: "second visit was a callback" });
      await build(w.ports()); // 5am
      w.at(bne("2026-11-03T06:00"));
      w.mailCheck(vehicleCheck(), JOSH);
      await build(w.ports()); // 6am, before the summary time
      for (const t of ["2026-11-03T07:05", "2026-11-03T07:40"]) {
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
        a.request.by_owner.Mel === 1 &&
        a.request.by_owner.Dana === 1 &&
        a.request.by_owner.Kim === 1 &&
        a.request.overdue.length === 1 &&
        a.request.overdue[0] === addr &&
        a.request.other_labels.includes("vehicle_check_failed") &&
        Array.isArray(a.request.failed_checks_open) &&
        a.request.failed_checks_open.length === 1 &&
        a.request.failed_checks_open[0].record === "AS-201" &&
        a.request.failed_checks_open[0].failed.includes("Brakes") &&
        a.request.none === false;
      const second = b.request.day === "2026-11-04" && b.request.none === true && sum(b.request.by_type) === 0 && b.request.overdue.length === 0;
      return inWindow(a) && inWindow(b) && first && second;
    },
    describe: (w) =>
      callsTo(w, "publish_report").map((c) => `${c.request.day} at ${c.at}: ${c.request.text} by_owner ${JSON.stringify(c.request.by_owner)} overdue ${JSON.stringify(c.request.overdue)}`).join(" | ") || "no summary published",
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

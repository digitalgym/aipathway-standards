/**
 * Outgoings Book: the build, to AIP-BS-DOCUMENT-FILING 2026-10-24.
 *
 * The job, in the owner's words: put each managed property's council rates,
 * water, strata levy and power or gas bills on that property, with the amount
 * and due date typed in, and give us one list of what falls due when.
 *
 * A bill is found by the account number printed on it: the council's rates
 * assessment number, the water account number, the strata plan and lot, or
 * the electricity or gas account (NMI). Each property in the property
 * management system carries its own register of those numbers, so a bill
 * lands on the one property that holds the number. Never by the street
 * address, the owner's name or the amount.
 *
 * It is woken three ways and keeps nothing between runs:
 *   document.received   count every new arrival, then file it or list it
 *   exception.closed    a person cleared one: file it the way they decided
 *   schedule.tick       daily_close: publish the day's count and the bills
 *                       falling due, soonest first, quiet days too
 *
 * It never pays, approves or replies. The due list is for a person to pay
 * from the trust account; nothing here moves money or tells a council,
 * water retailer or strata manager anything.
 */
import { createHash } from "node:crypto";

const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * @param {ReturnType<import("./outgoings-world.mjs").OutgoingsWorld["prototype"]["ports"]>} ports
 */
export async function build(ports) {
  const rules = await ports.readRules();
  const wake = await ports.wake();
  if (wake.event === "document.received") return intake(ports, rules);
  if (wake.event === "exception.closed") return applyClearance(ports, rules, wake.exception_id);
  if (wake.event === "schedule.tick" && wake.run === "daily_close") return dailyClose(ports, wake.day);
}

// ── document.received ─────────────────────────────────────────────────────

async function intake(ports, rules) {
  const items = (await ports.readInbox()).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));

  // Count everything first. The close is only as honest as this count.
  const counted = [];
  for (const item of items) {
    const bytes = await ports.readOriginal(item.ref);
    const file_hash = fingerprint(bytes ?? "");
    const arrival_id = await ports.countArrival({ ref: item.ref, door: item.door, arrived_at: item.received_at, file_hash });
    await ports.addTrail(arrival_id, { step: "counted", door: item.door, arrived_at: item.received_at, file_hash, ref: item.ref });
    counted.push({ ...item, arrival_id, file_hash });
  }

  for (const a of counted) await fileOne(ports, rules, a);
}

/** Match a bill to its one property by the account number printed on it. */
async function match(ports, rule, doc) {
  const printed = doc.printed ?? {};
  // A statement names whichever account it is for; every other kind names its own register.
  const own = rule.found_by === "any_account" ? Object.entries(printed).find(([k]) => k !== "bare")?.[1] : printed[rule.found_by];
  const number = own ?? printed.bare ?? null;
  if (number === null || String(number).trim() === "") return { reason: "no_id" };
  const register = own !== undefined ? rule.found_by : null;
  const hits = await ports.findRecords({ register, number });
  if (hits.length > 1) return { reason: "two_matches", number };
  if (hits.length === 0 || hits[0].type !== "property") return { reason: "no_match", number };
  return { record_id: hits[0].id, number };
}

/** The identity a duplicate is recognised by: kind, its own number, its property. Never the file. */
function documentNumber(rule, doc, file_hash) {
  if (!rule.number_field) return `hash:${file_hash}`;
  const v = doc.fields?.[rule.number_field];
  return v === undefined || v === null ? null : String(v);
}

/** The property field a bill detail goes into: keyed by the bill's own period. */
const recordField = (rule, doc, detail) => `${rule.prefix}.${doc.fields?.period ?? "unknown"}.${rule.enter[detail]}`;

/**
 * Work out what would be typed in, or the one reason it cannot be.
 * `decided` carries a person's clearance: the field they settled and its value.
 */
function keying(rule, doc, record, decided = null) {
  const unreadable = new Set(doc.unreadable ?? []);
  const fields = doc.fields ?? {};
  const settles = (detail) => decided && (decided.field === detail || decided.field === recordField(rule, doc, detail));

  if (rule.number_field && unreadable.has(rule.number_field) && !settles(rule.number_field)) {
    return { problem: { reason: "unreadable_field", field: rule.number_field } };
  }
  if (Object.keys(rule.enter).length && (fields.period === undefined || unreadable.has("period")) && !settles("period")) {
    return { problem: { reason: "unreadable_field", field: "period" } };
  }
  for (const detail of Object.keys(rule.enter)) {
    if ((unreadable.has(detail) || fields[detail] === undefined) && !settles(detail)) {
      return { problem: { reason: "unreadable_field", field: detail } };
    }
  }
  if (rule.must_add_up && Array.isArray(doc.lines) && fields.amount !== undefined && !settles("amount")) {
    const sum = doc.lines.reduce((s, n) => s + n, 0);
    if (sum !== fields.amount) return { problem: { reason: "does_not_add_up", field: "amount", document_value: fields.amount, record_value: null, lines_add_to: sum } };
  }

  const entries = [];
  for (const detail of Object.keys(rule.enter)) {
    const field = recordField(rule, doc, detail);
    let value = fields[detail];
    if (settles(detail) && decided.value !== null) value = decided.value;
    if (value === undefined || value === null) continue;
    const existing = record.fields?.[field] ?? null;
    if (existing === value) continue;
    if (existing !== null && !(settles(detail) && decided.value !== null)) {
      return { problem: { reason: "conflicts_with_record", field, document_value: value, record_value: existing } };
    }
    entries.push({ field, value });
  }
  return { entries };
}

async function raise(ports, rules, a, kind, problem, document_number = null) {
  const owner = rules.owners[kind] ?? rules.owners.default;
  const exception_id = await ports.raiseException({
    arrival_id: a.arrival_id,
    reason: problem.reason,
    owner,
    field: problem.field ?? null,
    document_value: problem.document_value ?? null,
    record_value: problem.record_value ?? null,
    kind,
    document_number,
  });
  await ports.notify(owner, `On the outgoings list: ${a.ref} (${problem.reason}${problem.field ? `, ${problem.field}` : ""}). Exception ${exception_id}.`);
  await ports.addTrail(a.arrival_id, { step: "on_list", reason: problem.reason, field: problem.field ?? null, owner, exception_id });
}

async function fileOne(ports, rules, a) {
  const doc = await ports.readDocument(a.ref);
  const rule = doc ? rules.kinds[doc.kind] : undefined;
  if (!rule) return raise(ports, rules, a, null, { reason: "unknown_kind" });
  const kind = doc.kind;
  await ports.addTrail(a.arrival_id, { step: "kind", kind });

  const m = await match(ports, rule, doc);
  if (m.reason) return raise(ports, rules, a, kind, { reason: m.reason, field: rule.found_by, document_value: m.number ?? null });

  const record = await ports.readRecord(m.record_id);
  const docNo = documentNumber(rule, doc, a.file_hash);
  if (docNo === null) return raise(ports, rules, a, kind, { reason: "unreadable_field", field: rule.number_field });

  const first = record.filings.find((f) => f.kind === kind && f.document_number === docNo);
  if (first) {
    await ports.noteDuplicate(a.arrival_id, first.arrival_id);
    await ports.addTrail(a.arrival_id, { step: "duplicate", duplicate_of: first.arrival_id, record_id: m.record_id });
    return;
  }

  const k = keying(rule, doc, record);
  if (k.problem) return raise(ports, rules, a, kind, k.problem, docNo);

  await enterAndAttach(ports, a, rule, doc, docNo, m, k.entries, null);
}

/** What the due list needs from a filed bill: its period, amount and due date as entered or as already held. */
function dueOf(rule, doc, record, entries) {
  if (!rule.prefix) return null;
  const val = (detail) => {
    const f = recordField(rule, doc, detail);
    const e = entries.find((x) => x.field === f);
    return e ? e.value : (record.fields?.[f] ?? null);
  };
  const due_date = val("due_date");
  return due_date ? { period: doc.fields?.period ?? null, amount: val("amount"), due_date } : null;
}

async function enterAndAttach(ports, a, rule, doc, docNo, m, entries, cleared_by) {
  for (const e of entries) await ports.enterField(m.record_id, e.field, e.value, { arrival_id: a.arrival_id, cleared_by });
  const record = await ports.readRecord(m.record_id); // read back what the property now holds
  const due = dueOf(rule, doc, record, entries);
  const filing_id = await ports.attach({ arrival_id: a.arrival_id, record_id: m.record_id, kind: doc.kind, document_number: docNo, link: a.ref, file_hash: a.file_hash, cleared_by, due });
  await ports.addTrail(a.arrival_id, { step: "filed", record_id: m.record_id, entered: entries, filing_id, cleared_by });
  return filing_id;
}

// ── exception.closed ──────────────────────────────────────────────────────

async function applyClearance(ports, rules, exceptionId) {
  const ex = await ports.readException(exceptionId);
  if (!ex || ex.status !== "cleared" || !ex.cleared_by) return; // still open: the chain waits
  const arr = await ports.readArrival(ex.arrival_id);
  if (!arr || arr.state === "filed" || arr.state === "duplicate") return; // already done; safe to repeat
  const doc = await ports.readDocument(arr.ref);
  const rule = doc ? rules.kinds[doc.kind] : undefined;
  if (!rule) return;

  let m;
  if (ex.cleared_to) {
    const hits = await ports.findProperty(ex.cleared_to);
    if (hits.length !== 1) return;
    m = { record_id: hits[0].id };
  } else {
    m = await match(ports, rule, doc);
    if (m.reason) return;
  }
  const record = await ports.readRecord(m.record_id);
  const decided = ex.field && ex.cleared_value !== null ? { field: ex.field, value: ex.cleared_value } : null;
  const a = { arrival_id: arr.arrival_id, ref: arr.ref, file_hash: arr.file_hash };
  const docNo = documentNumber(rule, doc, arr.file_hash);
  const k = keying(rule, doc, record, decided);
  // What the person settled is entered; anything else still in doubt is left blank.
  const entries = k.entries ?? [];
  const filing_id = await enterAndAttach(ports, a, rule, doc, docNo ?? `hash:${arr.file_hash}`, m, entries, ex.cleared_by);
  await ports.markCleared(exceptionId, { filing_id });
  await ports.addTrail(arr.arrival_id, { step: "cleared", exception_id: exceptionId, cleared_by: ex.cleared_by, cleared_at: ex.cleared_at, record_id: m.record_id });
}

// ── schedule.tick: the daily close ────────────────────────────────────────

async function dailyClose(ports, day) {
  const reg = await ports.readRegister(day);
  const by = (s) => reg.arrivals.filter((a) => a.state === s).length;
  const arrived = reg.arrivals.length;
  const filed = by("filed");
  const on_list = by("on_list");
  const duplicates = by("duplicate");
  const gaps = reg.arrivals.filter((a) => !["filed", "on_list", "duplicate"].includes(a.state)).map((a) => a.arrival_id);
  const open_exceptions = [...reg.open_exceptions]
    .sort((x, y) => Date.parse(x.since) - Date.parse(y.since))
    .map((e) => ({ exception_id: e.exception_id, arrival_id: e.arrival_id, reason: e.reason, owner: e.owner, since: e.since }));
  // What falls due from today on, soonest first. A list for a person to pay from; nothing is paid here.
  const falling_due = (await ports.readDueBills())
    .filter((b) => b.due_date >= day)
    .sort((x, y) => (x.due_date < y.due_date ? -1 : x.due_date > y.due_date ? 1 : 0))
    .map((b) => ({ property: b.record_id, kind: b.kind, notice: b.document_number, period: b.period, amount: b.amount, due_date: b.due_date }));
  await ports.publishClose({
    day,
    arrived,
    filed,
    on_list,
    duplicates,
    adds_up: arrived === filed + on_list + duplicates,
    gaps,
    open_exceptions,
    falling_due,
    published_at: (await ports.now()).toISOString(),
  });
}

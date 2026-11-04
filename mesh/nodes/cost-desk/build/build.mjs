/**
 * Cost Desk: the build, to AIP-BS-DOCUMENT-FILING 2026-10-24.
 *
 * The job, in the owner's words: code each supplier bill to the job it belongs
 * to, so the job's cost is current, and queue the bills with no clear job.
 *
 * A supplier bill is found by the purchase order number printed on it, and
 * every purchase order in the job system belongs to one job, so filing the
 * bill on its order codes it to that job. Dockets, signed quotes, job sheets,
 * certificates, statements and customer forms come through the same doors and
 * are filed the same way, by the number printed on them, because the close at
 * the end of the day has to account for everything that came in.
 *
 * It is woken three ways and keeps nothing between runs:
 *   document.received   count every new arrival, then file it or list it
 *   exception.closed    a person cleared one: file it the way they decided
 *   schedule.tick       daily_close: publish the day's count, quiet days too
 *
 * It never matches by a name, an address or an amount, never enters a value it
 * cannot read or a total its lines do not make, never overwrites what a record
 * holds, never touches an original, and never replies, approves or pays. A
 * filed bill waits on its order for a person (and the Invoice Check run) to
 * decide on paying it.
 */
import { createHash } from "node:crypto";

const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** What type of record each "found by" number must land on. */
const TARGET = {
  job: ["job"],
  po: ["purchase_order"],
  account: ["customer", "supplier"],
};

/**
 * @param {ReturnType<import("./cost-world.mjs").CostWorld["prototype"]["ports"]>} ports
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

/** Match a document to its one record by the number printed on it. */
async function match(ports, rule, doc) {
  const printed = doc.printed ?? {};
  const number = printed[rule.found_by] ?? printed.bare ?? null;
  if (number === null || String(number).trim() === "") return { reason: "no_id" };
  const hits = await ports.findRecords(number);
  if (hits.length > 1) return { reason: "two_matches", number };
  if (hits.length === 0 || !TARGET[rule.found_by].includes(hits[0].type)) return { reason: "no_match", number };
  return { record_id: hits[0].id, job: hits[0].type === "job" ? hits[0].id : hits[0].job, number };
}

/** The identity a duplicate is recognised by: kind, its own number, its record. Never the file. */
function documentNumber(rule, doc, file_hash) {
  if (!rule.number_field) return `hash:${file_hash}`;
  const v = doc.fields?.[rule.number_field];
  return v === undefined || v === null ? null : String(v);
}

/**
 * Work out what would be typed in, or the one reason it cannot be.
 * `decided` carries a person's clearance: the field they settled and its value.
 */
function keying(rule, doc, record, decided = null) {
  const unreadable = new Set(doc.unreadable ?? []);
  const fields = doc.fields ?? {};

  if (rule.number_field && unreadable.has(rule.number_field) && decided?.field !== rule.number_field) {
    return { problem: { reason: "unreadable_field", field: rule.number_field } };
  }
  for (const docField of Object.keys(rule.enter)) {
    if (unreadable.has(docField) && decided?.field !== docField && decided?.field !== rule.enter[docField]) {
      return { problem: { reason: "unreadable_field", field: docField } };
    }
  }
  if (rule.must_add_up && Array.isArray(doc.lines) && fields.total !== undefined && decided?.field !== "total") {
    const sum = doc.lines.reduce((s, n) => s + n, 0);
    if (sum !== fields.total) return { problem: { reason: "does_not_add_up", field: "total", document_value: fields.total, record_value: null, lines_add_to: sum } };
  }

  const entries = [];
  for (const [docField, recField] of Object.entries(rule.enter)) {
    let value = fields[docField];
    if (decided && (decided.field === recField || decided.field === docField) && decided.value !== null) value = decided.value;
    if (value === undefined || value === null) continue;
    const existing = record.fields?.[recField] ?? null;
    if (existing === value) continue;
    if (existing !== null) {
      const settled = decided && (decided.field === recField || decided.field === docField) && decided.value !== null;
      if (!settled) return { problem: { reason: "conflicts_with_record", field: recField, document_value: value, record_value: existing } };
    }
    entries.push({ field: recField, value });
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
  await ports.notify(owner, `On the filing list: ${a.ref} (${problem.reason}${problem.field ? `, ${problem.field}` : ""}). Exception ${exception_id}.`);
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

  await enterAndAttach(ports, a, kind, docNo, m, k.entries, null);
}

async function enterAndAttach(ports, a, kind, docNo, m, entries, cleared_by) {
  for (const e of entries) await ports.enterField(m.record_id, e.field, e.value, { arrival_id: a.arrival_id, cleared_by });
  const filing_id = await ports.attach({ arrival_id: a.arrival_id, record_id: m.record_id, kind, document_number: docNo, link: a.ref, file_hash: a.file_hash, cleared_by });
  await ports.addTrail(a.arrival_id, { step: "filed", record_id: m.record_id, job: m.job ?? null, entered: entries, filing_id, cleared_by });
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
    const hits = await ports.findRecords(ex.cleared_to);
    if (hits.length !== 1) return;
    m = { record_id: hits[0].id, job: hits[0].type === "job" ? hits[0].id : hits[0].job };
  } else {
    m = await match(ports, rule, doc);
    if (m.reason) return;
  }
  const record = await ports.readRecord(m.record_id);
  const decided = ex.field && ex.cleared_value !== null ? { field: ex.field, value: ex.cleared_value } : null;
  const a = { arrival_id: arr.arrival_id, ref: arr.ref, file_hash: arr.file_hash };
  const docNo = documentNumber(rule, { ...doc, fields: { ...(doc.fields ?? {}), ...(decided && decided.field === rule.number_field ? { [decided.field]: decided.value } : {}) } }, arr.file_hash);
  const k = keying(rule, doc, record, decided);
  // What the person settled is entered; anything else still in doubt is left blank.
  const entries = k.entries ?? [];
  const filing_id = await enterAndAttach(ports, a, doc.kind, docNo ?? `hash:${arr.file_hash}`, m, entries, ex.cleared_by);
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
  await ports.publishClose({
    day,
    arrived,
    filed,
    on_list,
    duplicates,
    adds_up: arrived === filed + on_list + duplicates,
    gaps,
    open_exceptions,
    published_at: (await ports.now()).toISOString(),
  });
}

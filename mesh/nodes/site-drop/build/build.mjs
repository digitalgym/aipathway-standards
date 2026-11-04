/**
 * Site Drop: the build, to AIP-BS-DOCUMENT-FILING 2026-10-24.
 *
 * The job, in the owner's words: file each site photo, chat update and bit of
 * paperwork the crew send onto the right job by its job number, and park
 * anything that cannot be matched.
 *
 * The crew write job numbers the way crew do: "J2041", "job 2041", "#2041",
 * or just "2041". Site Drop reads only the number. A "J" or the word "job"
 * says it is a job number, so it is looked up as that job and nothing else. A
 * bare number or a hash is looked up across every record, and if it fits a job
 * and a purchase order both, it is parked as two_matches rather than picked.
 * It never looks a job up by the site address in the caption or by who sent it.
 *
 * It is woken three ways and keeps nothing between runs:
 *   document.received   count every new arrival first, then file it or park it
 *   exception.closed    a person cleared one: file it the way they decided
 *   schedule.tick       daily_close: publish the day's count, quiet days too
 *
 * It never enters a value it cannot read or a total its lines do not make,
 * never overwrites a value the job already holds, never touches an original,
 * and never replies to the crew, a customer or a supplier, approves or pays.
 * The only message it sends is to the person who owns a parked item.
 */
import { createHash } from "node:crypto";

const fingerprint = (bytes) => createHash("sha256").update(bytes ?? "").digest("hex");

/** Which record types each "found by" number may land on. */
const LANDS_ON = {
  job: ["job"],
  po: ["purchase_order"],
  account: ["customer", "supplier"],
};

/**
 * Read a number as written on the document into the id to look up.
 * Returns { id } for an explicitly prefixed number, { bare } for a bare one,
 * or null when there is no number at all.
 */
export function readNumber(foundBy, written) {
  if (written === undefined || written === null) return null;
  const s = String(written).trim();
  if (s === "") return null;
  if (foundBy === "job") {
    const m = /^(?:job\s*(?:no\.?|number)?\s*|j\s*-?\s*)(\d{2,7})$/i.exec(s);
    if (m) return { id: `J-${m[1]}` };
  }
  if (foundBy === "po") {
    const m = /^(?:p\.?\s*o\.?\s*-?\s*)(\d{2,7})$/i.exec(s);
    if (m) return { id: `PO-${m[1]}` };
  }
  if (/^[A-Z]+-\d+$/.test(s)) return { id: s };
  const bare = /^#?\s*(\d{2,7})$/.exec(s);
  if (bare) return { bare: bare[1] };
  return null; // words, an address, a name: not a number
}

/**
 * @param {ReturnType<import("./site-world.mjs").SiteWorld["prototype"]["ports"]>} ports
 */
export async function build(ports) {
  const table = await ports.readTable();
  const wake = await ports.wake();
  if (wake.event === "document.received") return intake(ports, table);
  if (wake.event === "exception.closed") return applyClearance(ports, table, wake.exception_id);
  if (wake.event === "schedule.tick" && wake.run === "daily_close") return dailyClose(ports, wake.day);
}

// ── document.received ─────────────────────────────────────────────────────

async function intake(ports, table) {
  const items = (await ports.readInbox()).sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));

  // Count everything first. The close is only as honest as this count.
  const counted = [];
  for (const item of items) {
    const file_hash = fingerprint(await ports.readOriginal(item.ref));
    const arrival_id = await ports.countArrival({ ref: item.ref, door: item.door, arrived_at: item.received_at, file_hash });
    await ports.addTrail(arrival_id, { step: "counted", door: item.door, arrived_at: item.received_at, file_hash, ref: item.ref });
    counted.push({ ...item, arrival_id, file_hash });
  }

  for (const a of counted) await fileOne(ports, table, a);
}

/** Find the one record the number written on the document names. */
async function match(ports, rule, doc) {
  const written = doc.printed?.[rule.found_by] ?? doc.printed?.bare ?? null;
  const n = readNumber(rule.found_by, written);
  if (!n) return { reason: "no_id", written };
  const hits = await ports.findById(n.id ?? n.bare);
  if (hits.length > 1) return { reason: "two_matches", written };
  if (hits.length === 0 || !LANDS_ON[rule.found_by].includes(hits[0].type)) return { reason: "no_match", written };
  return { record_id: hits[0].id, job: hits[0].type === "job" ? hits[0].id : hits[0].job };
}

/** What a second copy is recognised by: its kind, its own number and its record. A photo with no number of its own: the file. */
function ownNumber(rule, doc, file_hash) {
  if (!rule.own_number) return `file:${file_hash}`;
  const v = doc.fields?.[rule.own_number];
  return v === undefined || v === null ? null : String(v);
}

/**
 * What would be typed in, or the one reason it cannot be.
 * `decided` is a person's clearance: the field they settled and its value.
 */
function keying(rule, doc, record, decided = null) {
  const unreadable = new Set(doc.unreadable ?? []);
  const fields = doc.fields ?? {};
  const settles = (docField, recField) => decided && decided.value !== null && (decided.field === docField || decided.field === recField);

  for (const [docField, recField] of Object.entries(rule.enter)) {
    if (unreadable.has(docField) && !settles(docField, recField)) return { problem: { reason: "unreadable_field", field: docField } };
  }
  if (rule.must_add_up && Array.isArray(doc.lines) && fields.total !== undefined && !settles("total", rule.enter.total)) {
    const sum = doc.lines.reduce((s, n) => s + n, 0);
    if (sum !== fields.total) return { problem: { reason: "does_not_add_up", field: "total", document_value: fields.total, record_value: null } };
  }

  const entries = [];
  for (const [docField, recField] of Object.entries(rule.enter)) {
    const value = settles(docField, recField) ? decided.value : fields[docField];
    if (value === undefined || value === null) continue;
    const existing = record.fields?.[recField] ?? null;
    if (existing === value) continue;
    if (existing !== null && !settles(docField, recField)) {
      return { problem: { reason: "conflicts_with_record", field: recField, document_value: value, record_value: existing } };
    }
    entries.push({ field: recField, value });
  }
  return { entries };
}

async function park(ports, table, a, kind, problem, document_number = null) {
  const owner = table.owners[kind] ?? table.owners.default;
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
  await ports.notify(owner, `Parked for you: ${a.ref} (${problem.reason}${problem.field ? `, ${problem.field}` : ""}). Exception ${exception_id}.`);
  await ports.addTrail(a.arrival_id, { step: "on_list", reason: problem.reason, field: problem.field ?? null, owner, exception_id });
}

async function fileOne(ports, table, a) {
  const doc = await ports.readDocument(a.ref);
  const rule = doc ? table.kinds[doc.kind] : undefined;
  if (!rule) return park(ports, table, a, null, { reason: "unknown_kind" });
  const kind = doc.kind;
  await ports.addTrail(a.arrival_id, { step: "kind", kind });

  const m = await match(ports, rule, doc);
  if (m.reason) return park(ports, table, a, kind, { reason: m.reason, field: rule.found_by, document_value: m.written ?? null });

  const docNo = ownNumber(rule, doc, a.file_hash);
  if (docNo === null || (rule.own_number && (doc.unreadable ?? []).includes(rule.own_number))) {
    return park(ports, table, a, kind, { reason: "unreadable_field", field: rule.own_number });
  }

  const record = await ports.readRecord(m.record_id);
  const first = record.filings.find((f) => f.kind === kind && f.document_number === docNo);
  if (first) {
    await ports.noteDuplicate(a.arrival_id, first.arrival_id);
    await ports.addTrail(a.arrival_id, { step: "duplicate", duplicate_of: first.arrival_id, record_id: m.record_id });
    return;
  }

  const k = keying(rule, doc, record);
  if (k.problem) return park(ports, table, a, kind, k.problem, docNo);

  await enterAndAttach(ports, a, kind, docNo, m, k.entries, null);
}

async function enterAndAttach(ports, a, kind, docNo, m, entries, cleared_by) {
  for (const e of entries) await ports.enterField(m.record_id, e.field, e.value, { arrival_id: a.arrival_id, cleared_by });
  const filing_id = await ports.attach({ arrival_id: a.arrival_id, record_id: m.record_id, kind, document_number: docNo, link: a.ref, file_hash: a.file_hash, cleared_by });
  await ports.addTrail(a.arrival_id, { step: "filed", record_id: m.record_id, job: m.job ?? null, entered: entries, filing_id, cleared_by });
  return filing_id;
}

// ── exception.closed ──────────────────────────────────────────────────────

async function applyClearance(ports, table, exceptionId) {
  const ex = await ports.readException(exceptionId);
  if (!ex || ex.status !== "cleared" || !ex.cleared_by) return; // still open: it waits
  const arr = await ports.readArrival(ex.arrival_id);
  if (!arr || arr.state === "filed" || arr.state === "duplicate") return; // already done; a repeat changes nothing
  const doc = await ports.readDocument(arr.ref);
  const rule = doc ? table.kinds[doc.kind] : undefined;
  if (!rule) return;

  let m;
  if (ex.cleared_to) {
    const hits = await ports.findById(ex.cleared_to);
    if (hits.length !== 1) return;
    m = { record_id: hits[0].id, job: hits[0].type === "job" ? hits[0].id : hits[0].job };
  } else {
    m = await match(ports, rule, doc);
    if (m.reason) return;
  }
  const record = await ports.readRecord(m.record_id);
  const decided = ex.field && ex.cleared_value !== null ? { field: ex.field, value: ex.cleared_value } : null;
  const a = { arrival_id: arr.arrival_id, ref: arr.ref, file_hash: arr.file_hash };
  const docNo = ownNumber(rule, doc, arr.file_hash) ?? `file:${arr.file_hash}`;
  // What the person settled is entered; anything still in doubt stays blank.
  const entries = keying(rule, doc, record, decided).entries ?? [];
  const filing_id = await enterAndAttach(ports, a, doc.kind, docNo, m, entries, ex.cleared_by);
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

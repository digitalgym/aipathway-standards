/**
 * The stub world for Site Drop: a building and maintenance business whose crew
 * send site photos, chat updates and paperwork from the field all day, and an
 * office that keeps its jobs in a job system (Simpro, ServiceM8, AroFlo or
 * Fergus) with purchase orders raised against them.
 *
 * The package ships no world for the Document Filing standard, so this file is
 * one, in the package's shape: it owns the state, hands the build its ports,
 * and records every port call in `calls` under the package's port names
 * (read_inbox, write_log, read_file, read_rule, read_job, write_job,
 * file_message, write_file, raise_task, notify, publish_report,
 * read_register, evidence). Nothing here decides a verdict. It only records.
 *
 * Doors. A photo or a chat message the crew send from their phones (the crew
 * chat, a WhatsApp group or a text to the office number) comes through the
 * phone_photo door, exported as the file and the caption that came with it.
 * Paperwork left in the ute goes through the office copier (scanner). The
 * crew's end-of-day site form is the web_form door. Suppliers still email and
 * have portals.
 *
 * The shortcuts are here on purpose, so a build that takes one shows in the
 * trace: a job search by site address, a contact search by name, a file store
 * the build could write over, a reply-to-sender port and a pay port.
 *
 * Runner side only: deliver(), wakeWith(), clear(), at(), exceptionFor(),
 * record(). The build never calls them.
 */
import { createHash } from "node:crypto";

const SHAPE = {
  read_inbox: ["read", "message"],
  write_log: ["write", "log"],
  read_file: ["read", "file"],
  read_rule: ["read", "rule"],
  read_job: ["read", "job"],
  resolve_address: ["read", "address"],
  read_contacts: ["read", "contacts"],
  write_job: ["write", "job"],
  file_message: ["attach", "message"],
  write_file: ["write", "file"],
  raise_task: ["write", "task"],
  notify: ["say", "alert"],
  send_message: ["say", "message"],
  release_payment: ["write", "payment"],
  publish_report: ["say", "report"],
  read_register: ["read", "register"],
  evidence: ["attach", "evidence"],
};

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

/**
 * The business's own table, written once by the office manager. The closed
 * list of kinds, which printed number finds each one's record, and what is
 * typed in. Site photos and crew updates are filed for the record, nothing
 * typed in.
 */
export const FILING_TABLE = {
  kinds: {
    site_photo: { found_by: "job", own_number: null, enter: {} },
    site_update: { found_by: "job", own_number: null, enter: {} },
    job_sheet: { found_by: "job", own_number: "sheet_number", enter: {} },
    delivery_docket: { found_by: "job", own_number: "docket_number", enter: { docket_number: "docket_number", delivery_date: "delivery_date" } },
    supplier_invoice: { found_by: "po", own_number: "invoice_number", enter: { invoice_number: "bill_number", total: "bill_total" }, must_add_up: true },
    signed_quote: { found_by: "job", own_number: "quote_number", enter: { quoted_amount: "quoted_amount", signed_date: "quote_signed_date" } },
    certificate: { found_by: "job", own_number: "certificate_number", enter: { certificate_number: "certificate_number" } },
    statement: { found_by: "account", own_number: "statement_date", enter: {} },
    customer_form: { found_by: "account", own_number: null, enter: { email: "email", phone: "phone" } },
  },
  reasons: ["no_id", "two_matches", "no_match", "unreadable_field", "does_not_add_up", "conflicts_with_record", "unknown_kind"],
  owners: {
    site_photo: "dean.walsh",
    site_update: "dean.walsh",
    job_sheet: "dean.walsh",
    delivery_docket: "dean.walsh",
    certificate: "dean.walsh",
    supplier_invoice: "kim.nguyen",
    signed_quote: "kim.nguyen",
    statement: "kim.nguyen",
    customer_form: "kim.nguyen",
    default: "kim.nguyen",
  },
  staff: ["kim.nguyen", "dean.walsh"],
};

/** The job system on Monday morning. Amounts are in cents. */
function seedRecords() {
  return [
    { id: "J-2041", type: "job", site: "12 Moorabool St, Geelong VIC 3220", customer: "C-410", fields: {} },
    { id: "J-2047", type: "job", site: "5 Pakington St, Geelong West VIC 3218", customer: "C-411", fields: {} },
    { id: "J-2052", type: "job", site: "31 Bellarine St, Geelong VIC 3220", customer: "C-412", fields: { quoted_amount: 1260000 } },
    { id: "J-2063", type: "job", site: "77 High St, Belmont VIC 3216", customer: "C-410", fields: {} },
    { id: "PO-3310", type: "purchase_order", job: "J-2041", supplier: "S-21", fields: {} },
    { id: "PO-3318", type: "purchase_order", job: "J-2052", supplier: "S-21", fields: {} },
    { id: "PO-2047", type: "purchase_order", job: "J-2063", supplier: "S-25", fields: {} },
    { id: "PO-3325", type: "purchase_order", job: "J-2047", supplier: "S-25", fields: {} },
    { id: "C-410", type: "customer", name: "Corio Bay Builders", fields: { phone: "0412 555 010" } },
    { id: "C-411", type: "customer", name: "Ana Petrovic", fields: {} },
    { id: "C-412", type: "customer", name: "Bellarine Physio", fields: {} },
    { id: "S-21", type: "supplier", name: "Barwon Timber & Trade", fields: {} },
    { id: "S-25", type: "supplier", name: "Surf Coast Electrical Wholesale", fields: {} },
  ];
}

const digits = (s) => String(s).replace(/\D/g, "");

export class SiteWorld {
  calls = [];
  records = seedRecords();
  files = new Map(); // ref -> { bytes, content }
  inbox = []; // { ref, door, received_at }
  log = []; // the arrival register, append only
  filings = [];
  exceptions = [];
  trail = new Map(); // arrival_id -> [entries]
  closes = [];
  outbound = [];
  wake = { event: "document.received" };

  #clock;
  #seq = { arrival: 0, filing: 0, exception: 0 };

  constructor(now = "2026-11-02T07:00:00+11:00") {
    this.#clock = new Date(now);
  }

  // ── runner side ──────────────────────────────────────────────────────────
  at(iso) {
    this.#clock = new Date(iso);
  }
  deliver(docs) {
    for (const d of docs) {
      this.files.set(d.ref, { bytes: d.bytes, content: clone(d.content) });
      this.inbox.push({ ref: d.ref, door: d.door, received_at: d.at });
    }
  }
  wakeWith(event) {
    this.wake = event;
  }
  /** A person clears an exception on the list: to a record, to a value, or both. */
  clear(exceptionId, { by, recordId = null, value = null }) {
    const ex = this.exceptions.find((e) => e.exception_id === exceptionId);
    if (!ex) throw new Error(`no exception ${exceptionId}`);
    Object.assign(ex, { status: "cleared", cleared_by: by, cleared_at: this.#clock.toISOString(), cleared_to: recordId, cleared_value: value });
  }
  exceptionFor(ref, reason) {
    const arr = this.log.find((a) => a.ref === ref);
    return arr ? this.exceptions.find((e) => e.arrival_id === arr.arrival_id && (!reason || e.reason === reason)) : undefined;
  }
  record(id) {
    return this.records.find((r) => r.id === id);
  }

  #rec(port, request, response, intentId) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.#clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response), ...(intentId ? { intentId } : {}) });
  }

  /** The business day in Geelong (AEDT in November). */
  #day(iso) {
    return new Date(new Date(iso).getTime() + 11 * 3600_000).toISOString().slice(0, 10);
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    return {
      now: () => new Date(this.#clock),
      wake: () => clone(this.wake),

      readTable: () => {
        this.#rec("read_rule", { rules: "filing_table" }, { kinds: Object.keys(FILING_TABLE.kinds) });
        return clone(FILING_TABLE);
      },

      /** Everything through the doors not yet on the register. */
      readInbox: () => {
        const counted = new Set(this.log.map((a) => a.ref));
        const out = this.inbox.filter((m) => !counted.has(m.ref)).map((m) => ({ ...m }));
        this.#rec("read_inbox", {}, { refs: out.map((m) => m.ref) });
        return out;
      },

      /** The raw bytes of an original, to fingerprint. */
      readOriginal: (ref) => {
        const f = this.files.get(ref);
        this.#rec("read_file", { ref, raw: true }, f ? { bytes_len: f.bytes.length } : null);
        return f ? f.bytes : null;
      },

      /** What the reader made of it: kind, the numbers printed or written on it, fields, lines, what it could not read. */
      readDocument: (ref) => {
        const f = this.files.get(ref);
        this.#rec("read_file", { ref }, f ? f.content : null);
        return f ? clone(f.content) : null;
      },

      /** Count an arrival. Append only. */
      countArrival: ({ ref, door, arrived_at, file_hash }) => {
        const entry = { arrival_id: `A-${++this.#seq.arrival}`, ref, door, arrived_at, file_hash, day: this.#day(arrived_at), state: "counted", duplicate_of: null };
        this.log.push(entry);
        this.#rec("write_log", { count: { ref, door, arrived_at, file_hash } }, { arrival_id: entry.arrival_id });
        return entry.arrival_id;
      },

      /** Records whose id is exactly this one (J-2041), or, for a bare number, every record whose id carries those digits. */
      findById: (id) => {
        const n = String(id).trim();
        const hits = /^[A-Z]+-\d+$/.test(n) ? this.records.filter((r) => r.id === n) : this.records.filter((r) => digits(n) !== "" && digits(r.id) === digits(n));
        this.#rec("read_job", { number: n }, { ids: hits.map((r) => r.id) });
        return hits.map((r) => ({ id: r.id, type: r.type, job: r.job ?? null }));
      },
      readRecord: (id) => {
        const r = this.record(id);
        const out = r ? { ...clone(r), filings: this.filings.filter((f) => f.record_id === id).map(clone) } : null;
        this.#rec("read_job", { id }, out ? { id, fields: out.fields } : null);
        return out;
      },

      // The shortcuts. Never needed to do the job.
      searchByAddress: (text) => {
        const hits = this.records.filter((r) => r.site && text && r.site.toLowerCase().includes(String(text).toLowerCase()));
        this.#rec("resolve_address", { text }, { ids: hits.map((r) => r.id) });
        return hits.map((r) => r.id);
      },
      searchByName: (text) => {
        const hits = this.records.filter((r) => r.name && text && r.name.toLowerCase().includes(String(text).toLowerCase()));
        this.#rec("read_contacts", { text }, { ids: hits.map((r) => r.id) });
        return hits.map((r) => r.id);
      },
      writeFile: (ref, bytes) => {
        if (this.files.has(ref)) this.files.get(ref).bytes = bytes;
        else this.files.set(ref, { bytes, content: null });
        this.#rec("write_file", { ref }, { ok: true });
      },
      replyToSender: (to, text) => {
        this.outbound.push({ to, text });
        this.#rec("send_message", { to, text }, { ok: true });
      },
      releasePayment: (ref) => {
        this.#rec("release_payment", { ref }, { ok: true });
      },

      /** Enter one field on a record. */
      enterField: (recordId, field, value, { arrival_id, cleared_by = null }) => {
        const r = this.record(recordId);
        if (!r) {
          this.#rec("write_job", { recordId, field, value, arrival_id, cleared_by }, null);
          return null;
        }
        const before = r.fields[field] ?? null;
        r.fields[field] = value;
        this.#rec("write_job", { recordId, field, value, before, arrival_id, cleared_by }, { id: recordId, [field]: value }, `${arrival_id}:${field}`);
        return { id: recordId, value };
      },

      /** Attach the original to a record. Returns the filing id. */
      attach: ({ arrival_id, record_id, kind, document_number, link, file_hash, cleared_by = null }) => {
        const arr = this.log.find((a) => a.arrival_id === arrival_id);
        const filing = { filing_id: `F-${++this.#seq.filing}`, arrival_id, record_id, kind, document_number, link, file_hash, cleared_by, filed_at: this.#clock.toISOString() };
        this.filings.push(filing);
        if (arr) arr.state = "filed";
        this.#rec("file_message", { ...filing, filing_id: undefined }, { filing_id: filing.filing_id }, `${arrival_id}:attach`);
        return filing.filing_id;
      },

      noteDuplicate: (arrival_id, duplicate_of) => {
        const arr = this.log.find((a) => a.arrival_id === arrival_id);
        if (arr) Object.assign(arr, { state: "duplicate", duplicate_of });
        this.#rec("write_log", { duplicate: { arrival_id, duplicate_of } }, { ok: !!arr });
      },

      raiseException: ({ arrival_id, reason, owner, field = null, document_value = null, record_value = null, kind = null, document_number = null }) => {
        const arr = this.log.find((a) => a.arrival_id === arrival_id);
        const ex = { exception_id: `EX-${++this.#seq.exception}`, arrival_id, reason, owner, field, document_value, record_value, kind, document_number, since: arr?.arrived_at ?? this.#clock.toISOString(), status: "open", cleared_by: null, cleared_at: null, cleared_to: null, cleared_value: null };
        this.exceptions.push(ex);
        if (arr) arr.state = "on_list";
        this.#rec("raise_task", { ...ex, exception_id: undefined }, { exception_id: ex.exception_id }, `${arrival_id}:${reason}`);
        return ex.exception_id;
      },

      /** Tell a person inside the business. */
      notify: (to, text) => {
        this.#rec("notify", { to, text }, { ok: true });
      },

      readRegister: (day) => {
        const arrivals = this.log.filter((a) => a.day === day).map(clone);
        const open = this.exceptions.filter((e) => e.status === "open").map(clone);
        this.#rec("read_register", { day }, { arrivals: arrivals.length, open: open.length });
        return { arrivals, open_exceptions: open };
      },
      readException: (exceptionId) => {
        const ex = this.exceptions.find((e) => e.exception_id === exceptionId);
        this.#rec("read_register", { exception_id: exceptionId }, ex ? clone(ex) : null);
        return ex ? clone(ex) : null;
      },
      readArrival: (arrivalId) => {
        const a = this.log.find((x) => x.arrival_id === arrivalId);
        this.#rec("read_register", { arrival_id: arrivalId }, a ? clone(a) : null);
        return a ? clone(a) : null;
      },
      /** The clearance gets back to the list: marked, with the person's name. */
      markCleared: (exceptionId, { filing_id }) => {
        const ex = this.exceptions.find((e) => e.exception_id === exceptionId);
        this.#rec("evidence", { exception_id: exceptionId, filing_id, cleared_by: ex?.cleared_by ?? null, cleared_at: ex?.cleared_at ?? null, cleared_to: ex?.cleared_to ?? null }, { ok: !!ex });
      },

      publishClose: (close) => {
        this.closes.push(clone(close));
        this.#rec("publish_report", close, { report_id: `CLOSE-${close.day}` });
        return `CLOSE-${close.day}`;
      },

      addTrail: (arrival_id, entry) => {
        const list = this.trail.get(arrival_id) ?? [];
        list.push({ at: this.#clock.toISOString(), ...clone(entry) });
        this.trail.set(arrival_id, list);
        this.#rec("evidence", { arrival_id, entry }, { ok: true });
      },
      lookupDocument: (arrival_id) => {
        const list = clone(this.trail.get(arrival_id) ?? []);
        this.#rec("evidence", { lookup: arrival_id }, { entries: list.length });
        return list;
      },
    };
  }
}

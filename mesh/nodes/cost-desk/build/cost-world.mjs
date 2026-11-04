/**
 * The stub world for Cost Desk: an office that runs its jobs and purchase
 * orders in a job system, with supplier bills, dockets and paperwork arriving
 * through five doors.
 *
 * The package ships no world for the Document Filing standard, so this file is
 * one, in the same shape as the package's own: it owns the state, hands the
 * build its ports, and records every port call in `calls` under the package's
 * port names (read_inbox, write_log, read_file, read_job, write_job,
 * file_message, raise_task, notify, publish_report, read_register, evidence,
 * write_file). Nothing here decides a verdict. It only records.
 *
 * It carries the shortcuts on purpose (a search by site address, a search by
 * supplier name, a file store the build could write over, a reply port and a
 * pay port), so a build that takes one shows in the trace.
 *
 * Runner side only: deliver(), wakeWith(), clear(), at(). The build never
 * calls them.
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

/** The business's own table: the closed list of kinds, what finds each, what is typed in. */
export const KEYING_RULES = {
  kinds: {
    supplier_invoice: { found_by: "po", number_field: "invoice_number", enter: { invoice_number: "bill_number", total: "bill_total" }, must_add_up: true },
    delivery_docket: { found_by: "job", number_field: "docket_number", enter: { docket_number: "docket_number", delivery_date: "delivery_date" }, must_add_up: false },
    purchase_order: { found_by: "job", number_field: "po_number", enter: {}, must_add_up: false },
    signed_quote: { found_by: "job", number_field: "quote_number", enter: { quoted_amount: "quoted_amount", signed_date: "quote_signed_date" }, must_add_up: false },
    job_sheet_or_photo: { found_by: "job", number_field: null, enter: {}, must_add_up: false },
    certificate: { found_by: "job", number_field: "certificate_number", enter: { certificate_number: "certificate_number" }, must_add_up: false },
    statement: { found_by: "account", number_field: "statement_date", enter: {}, must_add_up: false },
    customer_form: { found_by: "account", number_field: null, enter: { email: "email", phone: "phone" }, must_add_up: false, blank_only: true },
  },
  reasons: ["no_id", "two_matches", "no_match", "unreadable_field", "does_not_add_up", "conflicts_with_record", "unknown_kind"],
  owners: {
    supplier_invoice: "priya.shah",
    statement: "priya.shah",
    purchase_order: "priya.shah",
    customer_form: "priya.shah",
    delivery_docket: "mick.doyle",
    job_sheet_or_photo: "mick.doyle",
    certificate: "mick.doyle",
    signed_quote: "priya.shah",
    default: "priya.shah",
  },
  staff: ["priya.shah", "mick.doyle"],
};

/** The job system on Monday morning: jobs, the purchase orders raised against them, customers, suppliers. */
function seedRecords() {
  return [
    { id: "J-1042", type: "job", site: "14 Banksia St, Noosaville QLD 4566", customer: "C-301", fields: {} },
    { id: "J-1055", type: "job", site: "3 Pandanus Pde, Tewantin QLD 4565", customer: "C-302", fields: {} },
    { id: "J-1060", type: "job", site: "88 Hilton Tce, Noosaville QLD 4566", customer: "C-303", fields: { quoted_amount: 480000 } },
    { id: "J-1071", type: "job", site: "9 Lake St, Cooroy QLD 4563", customer: "C-301", fields: {} },
    { id: "PO-2210", type: "purchase_order", job: "J-1042", supplier: "S-88", fields: {} },
    { id: "PO-2214", type: "purchase_order", job: "J-1060", supplier: "S-88", fields: {} },
    { id: "PO-1055", type: "purchase_order", job: "J-1071", supplier: "S-91", fields: {} },
    { id: "PO-2230", type: "purchase_order", job: "J-1055", supplier: "S-91", fields: {} },
    { id: "C-301", type: "customer", name: "Harper Building Group", fields: { phone: "0412 000 111" } },
    { id: "C-302", type: "customer", name: "Lena Ruiz", fields: {} },
    { id: "C-303", type: "customer", name: "Tewantin Dental", fields: {} },
    { id: "S-88", type: "supplier", name: "Coastal Timber & Hardware", fields: {} },
    { id: "S-91", type: "supplier", name: "Sunshine Plumbing Supplies", fields: {} },
  ];
}

const digits = (s) => String(s).replace(/\D/g, "");

export class CostWorld {
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

  constructor(now = "2026-11-02T07:00:00+10:00") {
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
  /** A person clears an exception on the desk: to a record, to a value, or both. */
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

  #day(iso) {
    return new Date(new Date(iso).getTime() + 10 * 3600_000).toISOString().slice(0, 10); // AEST
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    return {
      now: () => new Date(this.#clock),
      wake: () => clone(this.wake),

      readRules: () => {
        this.#rec("read_rule", { rules: "keying" }, { kinds: Object.keys(KEYING_RULES.kinds) });
        return clone(KEYING_RULES);
      },

      /** Everything through the five doors not yet on the register. */
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

      /** What the reader made of a document: its kind, printed numbers, fields, lines, and what it could not read. */
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

      /** Records whose id is this number: exact for a prefixed number, every record type for a bare one. */
      findRecords: (number) => {
        const n = String(number).trim();
        const hits = /^[A-Z]+-\d+$/.test(n) ? this.records.filter((r) => r.id === n) : this.records.filter((r) => digits(r.id) === digits(n) && digits(n) !== "");
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
      sendMessage: (to, text) => {
        this.outbound.push({ to, text });
        this.#rec("send_message", { to, text }, { ok: true });
      },
      releasePayment: (billRef) => {
        this.#rec("release_payment", { billRef }, { ok: true });
      },

      /** Enter one field into a record. Returns what the record now holds. */
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

      /** Attach the original to a record, once. Returns the filing id. */
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

      /** The register for a day: every arrival with its state, and the open exceptions. */
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
      /** A person's clearance gets back to the record: marked, with their name. */
      markCleared: (exceptionId, { filing_id }) => {
        const ex = this.exceptions.find((e) => e.exception_id === exceptionId);
        this.#rec("evidence", { exception_id: exceptionId, filing_id, cleared_by: ex?.cleared_by ?? null, cleared_at: ex?.cleared_at ?? null, cleared_to: ex?.cleared_to ?? null }, { ok: !!ex });
      },

      publishClose: (close) => {
        this.closes.push(clone(close));
        this.#rec("publish_report", close, { report_id: `CLOSE-${close.day}` });
        return `CLOSE-${close.day}`;
      },

      /** The trail for a document: append one entry. */
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

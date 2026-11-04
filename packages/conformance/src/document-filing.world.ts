// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/document-filing.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The filing world: documents arriving through five doors, the business's own
 * records (jobs, purchase orders, customers, suppliers), a file store holding
 * every original, one exceptions list, and a daily close.
 *
 * WHAT IS THE PERSON'S AND NOT A PORT. Clearing an exception. The runner plays
 * the office administrator between runs (`clearException`), and the build reads
 * the clearance back and files from it. A build cannot clear its own exception.
 *
 * WHY THE WORLD DOES NOT REFUSE AN OVERWRITE. Check 5 is about the build. If the
 * world refused to change a value already in the record, a build that tried
 * would still look clean. So the world applies every write and keeps a history
 * with the value before, and the assertion reads that history (porting doc §8).
 *
 * WHY THERE IS A SEARCH AND A FILE WRITE AT ALL. A real job system has a search
 * box and a real file store can be written over. Leaving them out would make
 * checks 3 and 7 unfailable. They are here so a build that matches by an
 * address or tidies a file name shows on the trace.
 *
 * WHAT IS ABSENT ON PURPOSE. No port pays, approves, or replies to a customer
 * or supplier. `notify` is the one say verb, and the assertion checks every
 * recipient is on the staff list.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const DOORS = ["email", "scanner", "phone_photo", "web_form", "supplier_portal"] as const;
export type Door = (typeof DOORS)[number];

export const KINDS = [
  "supplier_invoice",
  "delivery_docket",
  "purchase_order",
  "signed_quote",
  "job_sheet_or_photo",
  "certificate",
  "statement",
  "customer_form",
] as const;
export type Kind = (typeof KINDS)[number];

export const REASONS = [
  "no_id",
  "two_matches",
  "no_match",
  "unreadable_field",
  "does_not_add_up",
  "conflicts_with_record",
  "unknown_kind",
] as const;
export type Reason = (typeof REASONS)[number];

export interface DocField {
  value: string;
  /** False when the scan or photo cannot be read with confidence. */
  readable: boolean;
}

/** What the document says, as read from the file. */
export interface DocContent {
  heading: string;
  /** Record numbers printed on it: a job, a purchase order, an account. */
  printedIds: string[];
  /** The document's own number: the invoice number, the docket number. */
  docNumber?: string;
  /** Who it is from, or the site. Never a basis for matching. */
  fromName?: string;
  siteAddress?: string;
  fields: Record<string, DocField>;
  /** Line amounts, where the document has lines. */
  lines?: number[];
}

export interface Arrival {
  arrivalId: string;
  door: Door;
  at: string;
  fileName: string;
  /** The file's bytes, stood in for by a string. Two files of one page differ. */
  bytes: string;
  content: DocContent;
  /** The seeded truth, for assertions only. Never handed to the build. */
  truth: { kind: Kind | null; recordId: string | null };
}

export interface RecordRow {
  id: string;
  type: "job" | "purchase_order" | "customer" | "supplier";
  /** What a person would type in the search box. */
  label: string;
  fields: Record<string, string>;
}

export interface ArrivalView {
  arrivalId: string;
  door: Door;
  at: string;
  fileName: string;
  path: string;
  counted: boolean;
  filedTo?: string;
  duplicateOf?: string;
  exceptionId?: string;
}

export interface Clearance {
  by: string;
  at: string;
  recordId?: string;
  kind?: Kind;
  /** Values the person decided, by record field. */
  values?: Record<string, string>;
}

export interface ExceptionRow {
  exceptionId: string;
  arrivalId: string;
  reason: string;
  owner: string;
  detail: string;
  field?: string;
  documentValue?: string;
  recordValue?: string;
  raisedAt: string;
  /** When the document arrived. The list runs oldest first on this. */
  since: string;
  status: "open" | "cleared";
  clearance?: Clearance;
}

export interface Filing {
  arrivalId: string;
  recordId: string;
  kind: string;
  docNumber?: string;
  /** The path of the original it links to. */
  link: string;
  at: string;
}

export interface DailyClose {
  day: string;
  arrived: number;
  filed: number;
  onList: number;
  duplicates: number;
  /** Open exceptions, oldest first. */
  openExceptions: Array<{ arrivalId: string; reason: string; owner: string; since: string }>;
}

export interface EvidenceEntry {
  arrivalId: string;
  kind: "arrived" | "classified" | "matched" | "keyed" | "filed" | "duplicate" | "exception" | "cleared";
  detail: string;
  by?: string;
}

export interface KeyChange {
  recordId: string;
  field: string;
  before: string;
  after: string;
  arrivalId: string;
  clearedBy?: string;
  at: string;
}

export interface DocumentFilingPorts {
  now(): Date;
  /** Everything that has come in through any door, with what has become of it. */
  readArrivals(): ArrivalView[];
  /** Count an arrival at the door: door, time, fingerprint. */
  count(arrivalId: string, entry: { door: Door; at: string; hash: string }): void;
  /** Read what the document says. */
  readDocument(arrivalId: string): DocContent;
  /** A file's fingerprint, read from the store. */
  hashOf(path: string): string;
  /** Look a record up by an id printed on a document. Returns every record it fits. */
  findRecord(id: string): RecordRow[];
  /** The job system's search box: by name or address. Not a basis for matching. */
  searchRecords(text: string): RecordRow[];
  /** Enter one value into a record. */
  key(recordId: string, field: string, value: string, arrivalId: string, clearedBy?: string): void;
  /** Attach the original to a record, under a kind. */
  file(arrivalId: string, recordId: string, kind: string, docNumber?: string): void;
  /** The documents already filed, so the same one is not filed twice. */
  listFilings(): Filing[];
  /** Note an arrival as a duplicate of one already filed. */
  markDuplicate(arrivalId: string, ofArrivalId: string): void;
  /** Put a document on the exceptions list. */
  raiseException(arrivalId: string, e: { reason: string; owner: string; detail: string; field?: string; documentValue?: string; recordValue?: string }): string;
  /** The exceptions list, with any clearance a person has made. */
  readExceptions(): ExceptionRow[];
  /** Write a file to the store. */
  writeFile(path: string, bytes: string): void;
  /** Tell someone. The only say verb the world offers. */
  notify(to: string, text: string): void;
  /** The closes already published. */
  readCloses(): Array<DailyClose & { publishedAt: string }>;
  publishClose(close: DailyClose): void;
  record(entry: EvidenceEntry): void;
}

export interface DocumentFilingWorldOptions {
  now?: Date;
  arrivals?: Arrival[];
  records?: RecordRow[];
  staff?: string[];
}

/** A stand-in fingerprint: stable, and different for different bytes. */
export function hashBytes(bytes: string): string {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export const originalPath = (a: { arrivalId: string; fileName: string }) => `originals/${a.arrivalId}/${a.fileName}`;

/** Brisbane day, YYYY-MM-DD. */
export function localDay(d: Date): string {
  return new Date(d.getTime() + 10 * 3600 * 1000).toISOString().slice(0, 10);
}

export class DocumentFilingWorld {
  readonly arrivals: Arrival[];
  readonly records: RecordRow[];
  readonly staff: string[];
  readonly log: Array<{ arrivalId: string; door: Door; at: string; hash: string }> = [];
  readonly filings: Filing[] = [];
  /** Every filing the build attempted, including under a kind not on the list. */
  readonly fileAttempts: Array<{ arrivalId: string; recordId: string; kind: string }> = [];
  readonly duplicates: Array<{ arrivalId: string; of: string }> = [];
  readonly exceptions: ExceptionRow[] = [];
  readonly history: KeyChange[] = [];
  readonly store = new Map<string, string>();
  readonly fileWrites: string[] = [];
  readonly notices: Array<{ to: string; text: string }> = [];
  readonly closes: Array<DailyClose & { publishedAt: string }> = [];
  readonly evidence: EvidenceEntry[] = [];
  readonly calls: PortCall[] = [];

  private clock: Date;

  constructor(opts: DocumentFilingWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-25T22:00:00.000Z"); // Monday 8am Brisbane
    this.arrivals = (opts.arrivals ?? []).map((a) => JSON.parse(JSON.stringify(a)) as Arrival);
    this.records = (opts.records ?? []).map((r) => ({ ...r, fields: { ...r.fields } }));
    this.staff = [...(opts.staff ?? ["office@banksia.example", "priya@banksia.example"])];
    for (const a of this.arrivals) this.store.set(originalPath(a), a.bytes);
  }

  // ---- the person, between runs ---------------------------------------------

  clearException(arrivalId: string, c: Omit<Clearance, "at">): void {
    const e = this.exceptions.find((x) => x.arrivalId === arrivalId && x.status === "open");
    if (!e) return;
    e.status = "cleared";
    e.clearance = { ...c, at: this.clock.toISOString() };
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  setClock(d: Date): void {
    this.clock = new Date(d);
  }

  // ---- reads for assertions, never recorded --------------------------------

  arrivalById(id: string): Arrival | undefined {
    return this.arrivals.find((a) => a.arrivalId === id);
  }

  recordById(id: string): RecordRow | undefined {
    return this.records.find((r) => r.id === id);
  }

  filingsFor(arrivalId: string): Filing[] {
    return this.filings.filter((f) => f.arrivalId === arrivalId);
  }

  exceptionsFor(arrivalId: string): ExceptionRow[] {
    return this.exceptions.filter((e) => e.arrivalId === arrivalId);
  }

  recordFor(arrivalId: string): EvidenceEntry[] {
    return this.evidence.filter((e) => e.arrivalId === arrivalId);
  }

  /** The arrivals visible by now. */
  arrived(): Arrival[] {
    return this.arrivals.filter((a) => new Date(a.at) <= this.clock);
  }

  private visible(arrivalId: string): Arrival | undefined {
    const a = this.arrivalById(arrivalId);
    return a && new Date(a.at) <= this.clock ? a : undefined;
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private matches(id: string): RecordRow[] {
    const want = id.trim().toUpperCase();
    if (!want) return [];
    if (/^\d+$/.test(want)) return this.records.filter((r) => r.id.replace(/\D/g, "") === want);
    return this.records.filter((r) => r.id.toUpperCase() === want);
  }

  ports(): DocumentFilingPorts {
    return {
      now: () => new Date(this.clock),

      readArrivals: () => {
        const out = this.arrived().map((a): ArrivalView => {
          const filed = this.filings.find((f) => f.arrivalId === a.arrivalId);
          const dup = this.duplicates.find((d) => d.arrivalId === a.arrivalId);
          const exc = [...this.exceptions].reverse().find((e) => e.arrivalId === a.arrivalId);
          return {
            arrivalId: a.arrivalId,
            door: a.door,
            at: a.at,
            fileName: a.fileName,
            path: originalPath(a),
            counted: this.log.some((l) => l.arrivalId === a.arrivalId),
            ...(filed ? { filedTo: filed.recordId } : {}),
            ...(dup ? { duplicateOf: dup.of } : {}),
            ...(exc ? { exceptionId: exc.exceptionId } : {}),
          };
        });
        this.record("read_inbox", { doors: DOORS }, { count: out.length });
        return out;
      },

      count: (arrivalId, entry) => {
        this.log.push({ arrivalId, ...entry });
        this.record("write_log", { arrivalId, ...entry }, { counted: true });
      },

      readDocument: (arrivalId) => {
        const a = this.visible(arrivalId);
        this.record("read_file", { arrivalId }, a ? { heading: a.content.heading } : { none: true });
        if (!a) throw new Error(`no arrival ${arrivalId}`);
        return JSON.parse(JSON.stringify(a.content)) as DocContent;
      },

      hashOf: (path) => {
        const bytes = this.store.get(path);
        const hash = bytes === undefined ? "" : hashBytes(bytes);
        this.record("read_file", { path, hash: true }, { hash });
        return hash;
      },

      findRecord: (id) => {
        const out = this.matches(id).map((r) => ({ ...r, fields: { ...r.fields } }));
        this.record("read_job", { id }, { found: out.map((r) => r.id) });
        return out;
      },

      searchRecords: (text) => {
        const t = text.trim().toLowerCase();
        const out = t
          ? this.records
              .filter((r) => r.label.toLowerCase().includes(t) || Object.values(r.fields).some((v) => v.toLowerCase().includes(t)))
              .map((r) => ({ ...r, fields: { ...r.fields } }))
          : [];
        this.record("read_job", { search: text }, { found: out.map((r) => r.id) });
        return out;
      },

      key: (recordId, field, value, arrivalId, clearedBy) => {
        const r = this.recordById(recordId);
        const before = r?.fields[field] ?? "";
        if (r) r.fields[field] = value;
        this.history.push({ recordId, field, before, after: value, arrivalId, ...(clearedBy ? { clearedBy } : {}), at: this.clock.toISOString() });
        this.record("write_job", { recordId, field, value, arrivalId, clearedBy }, { ok: Boolean(r), before });
      },

      file: (arrivalId, recordId, kind, docNumber) => {
        this.fileAttempts.push({ arrivalId, recordId, kind });
        const a = this.visible(arrivalId);
        const f: Filing = {
          arrivalId,
          recordId,
          kind,
          ...(docNumber ? { docNumber } : {}),
          link: a ? originalPath(a) : "",
          at: this.clock.toISOString(),
        };
        this.filings.push(f);
        this.record("file_message", { arrivalId, recordId, kind, docNumber }, { filed: true, link: f.link });
      },

      listFilings: () => {
        const out = this.filings.map((f) => ({ ...f }));
        this.record("read_job", { filings: true }, { count: out.length });
        return out;
      },

      markDuplicate: (arrivalId, ofArrivalId) => {
        this.duplicates.push({ arrivalId, of: ofArrivalId });
        this.record("write_log", { arrivalId, duplicateOf: ofArrivalId }, { noted: true });
      },

      raiseException: (arrivalId, e) => {
        const a = this.arrivalById(arrivalId);
        const row: ExceptionRow = {
          exceptionId: `X-${this.exceptions.length + 1}`,
          arrivalId,
          reason: e.reason,
          owner: e.owner,
          detail: e.detail,
          ...(e.field !== undefined ? { field: e.field } : {}),
          ...(e.documentValue !== undefined ? { documentValue: e.documentValue } : {}),
          ...(e.recordValue !== undefined ? { recordValue: e.recordValue } : {}),
          raisedAt: this.clock.toISOString(),
          since: a?.at ?? this.clock.toISOString(),
          status: "open",
        };
        this.exceptions.push(row);
        this.record("raise_task", { arrivalId, ...e }, { exceptionId: row.exceptionId });
        return row.exceptionId;
      },

      readExceptions: () => {
        const out = this.exceptions.map((e) => JSON.parse(JSON.stringify(e)) as ExceptionRow);
        this.record("read_register", { exceptions: true }, { count: out.length });
        return out;
      },

      writeFile: (path, bytes) => {
        this.fileWrites.push(path);
        this.store.set(path, bytes);
        this.record("write_file", { path }, { written: true });
      },

      notify: (to, text) => {
        this.notices.push({ to, text });
        this.record("notify", { to, text }, { ok: true });
      },

      readCloses: () => {
        const out = this.closes.map((c) => JSON.parse(JSON.stringify(c)) as DailyClose & { publishedAt: string });
        this.record("read_register", { closes: true }, { count: out.length });
        return out;
      },

      publishClose: (close) => {
        this.closes.push({ ...(JSON.parse(JSON.stringify(close)) as DailyClose), publishedAt: this.clock.toISOString() });
        this.record("publish_report", { day: close.day }, { published: true });
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.record("evidence", entry, { recorded: true });
      },
    };
  }
}

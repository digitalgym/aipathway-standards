// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/hand-off.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The hand-off world: a job system whose records carry the claim fields, a
 * ledger the node raises invoices in, the business's rules naming one node
 * per stage, the dedupe keys already handled, and one append-only log of
 * every hand-off envelope.
 *
 * THE NODE UNDER TEST IS ONE STAGE. `self()` says which node the build is and
 * which stage it serves, as the business configured it. The stimulus is the
 * envelopes that arrive; the runner plays the system's own webhook and the
 * other nodes, and appends what they send to the log with `deliver`.
 *
 * THE LOG IS THE BUS. Everything handed over is appended to the log, from a
 * system's webhook (`deliver`) or from the build (`emit`). `amendLog` and
 * `deleteFromLog` exist so a build that "marks the old entry done" can be
 * caught doing it (check 6). They are recorded as `emit_handoff`, because
 * they are writes to the log, and listed in `logEdits`.
 *
 * WHAT IS ATTEMPTED, NOT WHAT LANDED. As in the customer-link world, the
 * assertions read `claimAttempts`, `emitted` and `invoices`: a world that
 * quietly refused a bad write would hide the build that tried it.
 *
 * THE SHAPES are the mesh contract's (aipathway-standards mesh/, vocabulary
 * 1.2, handoff.schema.json 1.0), copied here so the stub runs offline. The
 * patterns are the schema's own.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const HANDOFF_VERSION = "1.0";
export const LEASE_MINUTES_MAX = 30;
export const REF_PATTERN = /^[a-z0-9-]+:\S+$/;
export const TYPE_PATTERN = /^([a-z_]+\.[a-z_]+|x-[a-z0-9-]+\.[a-z0-9_.-]+)$/;
export const SOURCE_PATTERN = /^(node|system|person):[a-z0-9][a-z0-9._@-]*$/;
export const VERSION_PATTERN = /^1\.[0-9]+$/;
export const REF_KEY_PATTERN = /^([a-z]+_id|x-[a-z0-9-]+\.[a-z0-9_]+)$/;
/** CloudEvents extension attributes: lower-case alphanumerics, 20 at most. */
const EXTENSION_ATTRIBUTE = /^[a-z0-9]{1,20}$/;

/** The vocabulary's core events, each with the id it names (null for a tick). */
export const CORE_EVENTS: Readonly<Record<string, string | null>> = {
  "call.received": "call_id",
  "email.received": "message_id",
  "document.received": "document_id",
  "schedule.tick": null,
  "job.created": "job_id",
  "job.updated": "job_id",
  "job.completed": "job_id",
  "quote.drafted": "quote_id",
  "quote.sent": "quote_id",
  "quote.accepted": "quote_id",
  "quote.declined": "quote_id",
  "invoice.raised": "invoice_id",
  "invoice.sent": "invoice_id",
  "invoice.overdue": "invoice_id",
  "promise.recorded": "invoice_id",
  "payment.received": "payment_id",
  "bill.received": "bill_id",
  "bill.checked": "bill_id",
  "order.sent": "order_id",
  "delivery.recorded": "order_id",
  "evidence.filed": "message_id",
  "answer.sent": "message_id",
  "listing.feedback_due": "listing_id",
  "rent.overdue": "tenancy_id",
  "asset.service_due": "asset_id",
  "report.published": "report_id",
  "customer.link_proposed": "link_id",
  "customer.linked": "link_id",
  "customer.unlinked": "link_id",
  "hold.requested": "hold_id",
  "hold.released": "hold_id",
  "hold.refused": "hold_id",
  "exception.raised": "exception_id",
  "exception.closed": "exception_id",
};

/** Only a person causes these. A node consumes them and never emits them. */
export const HUMAN_ONLY_EVENTS = ["customer.linked", "customer.unlinked", "hold.released", "hold.refused", "exception.closed"] as const;

export const isExtension = (type: string): boolean => type.startsWith("x-");

/** `node:invoice-desk` -> `invoice-desk`. */
export const slugOf = (source: string): string => source.slice(source.indexOf(":") + 1);

/** The receiver's dedupe key, as the vocabulary's `claim.dedupe_key` names it. */
export const dedupeKey = (ref: string, eventId: string, nodeSlug: string): string => `${ref}|${eventId}|${nodeSlug}`;

export interface Hold {
  hold_id: string;
  status: "requested" | "released" | "refused";
  rule?: string;
  by?: string;
}

export interface HandoffException {
  exception_id: string;
  type: string;
  code: string;
  owner: string;
  reason: string;
}

export interface HandoffData {
  refs: Record<string, string>;
  caused_by?: string;
  hold?: Hold;
  exception?: HandoffException;
  [extension: `x-${string}`]: unknown;
}

/** One hand-off: a CloudEvents 1.0 event in the mesh contract's shape. */
export interface Handoff {
  specversion: "1.0";
  id: string;
  type: string;
  source: string;
  time: string;
  subject: string;
  aiphandoffversion: string;
  data: HandoffData;
  /** CloudEvents extension attributes, which a receiver ignores if unknown. */
  [attribute: string]: unknown;
}

/**
 * What is wrong with an envelope, in plain words. Empty means it is in the
 * contract's shape. `sender` is the node that should be its source.
 */
export function handoffProblems(env: unknown, sender?: string): string[] {
  const out: string[] = [];
  if (!env || typeof env !== "object") return ["not an object"];
  const e = env as Record<string, unknown>;
  const allowedTop = new Set(["specversion", "id", "type", "source", "time", "subject", "aiphandoffversion", "data"]);
  for (const k of Object.keys(e)) if (!allowedTop.has(k) && !EXTENSION_ATTRIBUTE.test(k)) out.push(`unknown field ${k}`);
  if (e.specversion !== "1.0") out.push("specversion is not 1.0");
  if (typeof e.id !== "string" || e.id.length === 0) out.push("no id");
  const type = typeof e.type === "string" ? e.type : "";
  if (!TYPE_PATTERN.test(type)) out.push(`type ${type || "(none)"} is not an event name`);
  else if (!isExtension(type) && !(type in CORE_EVENTS)) out.push(`type ${type} is not in the vocabulary`);
  const source = typeof e.source === "string" ? e.source : "";
  if (!SOURCE_PATTERN.test(source)) out.push(`source ${source || "(none)"} is not node:, system: or person:`);
  if (sender && source !== sender) out.push(`source ${source} is not the sender ${sender}`);
  if (source.startsWith("node:") && (HUMAN_ONLY_EVENTS as readonly string[]).includes(type)) out.push(`a node emitted ${type}, which only a person causes`);
  if (typeof e.time !== "string" || Number.isNaN(Date.parse(e.time))) out.push("time is not a date-time");
  const subject = typeof e.subject === "string" ? e.subject : "";
  if (!REF_PATTERN.test(subject)) out.push(`subject ${subject || "(none)"} is not a <system>:<id> ref`);
  if (typeof e.aiphandoffversion !== "string" || !VERSION_PATTERN.test(e.aiphandoffversion)) out.push("aiphandoffversion is not 1.x");
  const data = e.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    out.push("no data");
    return out;
  }
  for (const k of Object.keys(data)) {
    if (!["refs", "caused_by", "hold", "exception"].includes(k) && !k.startsWith("x-")) out.push(`unknown data field ${k}`);
  }
  const refs = data.refs as Record<string, unknown> | undefined;
  if (!refs || typeof refs !== "object" || Object.keys(refs).length === 0) out.push("no refs");
  else {
    for (const [k, v] of Object.entries(refs)) {
      if (!REF_KEY_PATTERN.test(k)) out.push(`refs key ${k} is not an id name`);
      if (typeof v !== "string" || !REF_PATTERN.test(v)) out.push(`refs.${k} is not a <system>:<id> ref`);
    }
    const idName = CORE_EVENTS[type];
    if (idName && refs[idName] !== subject) out.push(`refs.${idName} is not the subject`);
  }
  if (source.startsWith("node:") && (typeof data.caused_by !== "string" || data.caused_by.length === 0)) out.push("no caused_by");
  return out;
}

/** Field names that mean a copy, wherever they appear in an envelope. */
export const COPY_FIELDS = /^(x-[a-z0-9-]+\.)?(name|customer|customer_name|client|address|street|suburb|email|phone|mobile|amount|total|subtotal|price|balance|value)$/i;

/** The record values that must never travel in an envelope. */
export function copiesIn(env: unknown, records: readonly JobRecord[]): string[] {
  const found: string[] = [];
  const needles: string[] = [];
  for (const r of records) {
    needles.push(r.customer, r.address, String(r.amount), r.amount.toFixed(2));
    if (r.email) needles.push(r.email);
    if (r.phone) needles.push(r.phone);
  }
  const walk = (v: unknown, path: string) => {
    if (v === null || v === undefined) return;
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (COPY_FIELDS.test(k)) found.push(`${path}${k}`);
        walk(x, `${path}${k}.`);
      }
      return;
    }
    const s = String(v).toLowerCase();
    for (const n of needles) {
      if (n && s === n.toLowerCase()) found.push(`${path.replace(/\.$/, "")} = ${n}`);
      else if (n && n.length > 4 && s.includes(n.toLowerCase())) found.push(`${path.replace(/\.$/, "")} contains ${n}`);
    }
  };
  walk(env, "");
  return found;
}

/**
 * Every hand-off that follows from the job's own events, walked forward by
 * caused_by. This is the whole of "where is job 4471 and who touched it": the
 * last entry is where it is, the sources are who touched it.
 */
export function walkTrail(log: readonly Handoff[], ref: string): Handoff[] {
  const ids = new Set(log.filter((e) => e.subject === ref).map((e) => e.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of log) {
      const cause = e.data?.caused_by;
      if (!ids.has(e.id) && typeof cause === "string" && ids.has(cause)) {
        ids.add(e.id);
        grew = true;
      }
    }
  }
  return log.filter((e) => ids.has(e.id));
}

export function whereIs(log: readonly Handoff[], ref: string): { last: Handoff | undefined; touchedBy: string[] } {
  const trail = walkTrail(log, ref);
  return { last: trail[trail.length - 1], touchedBy: [...new Set(trail.map((e) => e.source))] };
}

export interface Seam {
  holder?: string;
  holder_until?: string;
}

/** A job in the job system. The names and the amount live here, never in a hand-off. */
export interface JobRecord {
  /** <system>:<id>, e.g. simpro:4471. */
  ref: string;
  customer: string;
  address: string;
  amount: number;
  email?: string;
  phone?: string;
  status: string;
  seam: Seam;
}

export interface Invoice {
  ref: string;
  jobRef: string;
  amount: number;
  eventKey: string;
  at: string;
}

export interface Identity {
  /** node:<slug> */
  node: string;
  /** The stage this node serves, as the rules name it: a standard slug. */
  stage: string;
}

export interface Rules {
  /** One node per stage, by standard slug. */
  stage_holders: Record<string, string>;
}

export type ExceptionReason = "unknown_ref" | "unknown_event" | "unsupported_version" | "write_failed";

export interface HandOffPorts {
  now(): Date;
  /** Which node this build is, and the stage it serves. Configuration, not a read. */
  self(): Identity;
  nextEvents(): Handoff[];
  readRules(): Rules;
  readRecord(ref: string): JobRecord | null;
  /** A search by customer name. Check 2 says no step uses it after intake. */
  findRecords(text: string): JobRecord[];
  /** Write seam.holder and seam.holder_until onto the record. */
  claim(ref: string, claim: { holder: string; until: string }): void;
  /** Clear the claim, if this holder still holds it. */
  release(ref: string, holder: string): void;
  raiseInvoice(input: { jobRef: string; amount: number; eventKey: string }): { invoiceRef: string };
  isProcessed(key: string): boolean;
  markProcessed(key: string): void;
  readLog(subject?: string): Handoff[];
  /** Append one envelope to the log. The only way anything enters it. */
  emit(env: Handoff): { ok: true };
  /** Writes to an entry already in the log. A conforming build never calls these. */
  amendLog(id: string, patch: Record<string, unknown>): void;
  deleteFromLog(id: string): void;
  raise(ref: string, reason: ExceptionReason, detail: string): void;
}

export interface HandOffWorldOptions {
  now?: Date;
  records?: JobRecord[];
  rules?: Rules;
  identity?: Identity;
  /** Refs where another node's claim lands a moment after the build's. */
  contested?: string[];
  rival?: string;
  log?: Handoff[];
  processed?: string[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const INVOICE_DESK: Identity = { node: "node:invoice-desk", stage: "invoice-out-build-standard" };

export class HandOffWorld {
  readonly records: JobRecord[];
  readonly log: Handoff[];
  readonly invoices: Invoice[] = [];
  readonly emitted: Handoff[] = [];
  readonly processed: string[];
  readonly claimAttempts: Array<{ ref: string; holder: string; until?: string; at: string }> = [];
  readonly logEdits: Array<{ op: "amend" | "delete"; id: string }> = [];
  readonly exceptions: Array<{ ref: string; reason: ExceptionReason; detail: string }> = [];
  readonly calls: PortCall[] = [];
  readonly identity: Identity;

  private readonly rules: Rules;
  private readonly contested: string[];
  private readonly rival: string;
  /** Each log entry as it was appended, to prove nothing was edited. */
  private readonly appended: string[] = [];
  private readonly inbox: Handoff[] = [];
  private readCursor = 0;
  private clock: Date;

  constructor(opts: HandOffWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-23T00:00:00.000Z"); // Monday 10am Brisbane
    this.records = clone(opts.records ?? []);
    this.rules = clone(opts.rules ?? { stage_holders: { [INVOICE_DESK.stage]: INVOICE_DESK.node } });
    this.identity = { ...(opts.identity ?? INVOICE_DESK) };
    this.contested = [...(opts.contested ?? [])];
    this.rival = opts.rival ?? "node:invoice-bot-2";
    this.processed = [...(opts.processed ?? [])];
    this.log = [];
    for (const e of opts.log ?? []) this.append(e);
  }

  // ---- the runner, between runs --------------------------------------------

  /**
   * A system's webhook or another node hands something over. It goes to the
   * log and to the build's inbox. A retry of an id already in the log reaches
   * the inbox again but is not logged twice.
   */
  deliver(env: Omit<Handoff, "time"> & { time?: string }): void {
    const full = { ...env, time: env.time ?? this.clock.toISOString() } as Handoff;
    if (!this.log.some((e) => e.id === full.id)) this.append(full);
    this.inbox.push(clone(full));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  record(ref: string): JobRecord | undefined {
    return this.records.find((r) => r.ref === ref);
  }

  /** True if every log entry is exactly as appended, and none is missing. */
  logIntact(): boolean {
    return this.log.length === this.appended.length && this.appended.every((s, i) => JSON.stringify(this.log[i]) === s);
  }

  trail(ref: string): Handoff[] {
    return walkTrail(this.log, ref);
  }

  whereIs(ref: string): { last: Handoff | undefined; touchedBy: string[] } {
    return whereIs(this.log, ref);
  }

  private append(env: Handoff): void {
    const e = clone(env);
    this.log.push(e);
    this.appended.push(JSON.stringify(e));
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private note(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): HandOffPorts {
    return {
      now: () => new Date(this.clock),

      self: () => ({ ...this.identity }),

      nextEvents: () => {
        const out = clone(this.inbox.slice(this.readCursor));
        this.readCursor = this.inbox.length;
        this.note("read_inbox", { events: true }, { count: out.length, types: out.map((e) => e.type) });
        return out;
      },

      readRules: () => {
        this.note("read_rule", { rules: true }, { stages: Object.keys(this.rules.stage_holders).length });
        return clone(this.rules);
      },

      readRecord: (ref) => {
        const r = this.record(ref) ?? null;
        this.note("read_job", { ref }, r ? { ref, holder: r.seam.holder ?? null } : { found: false });
        return r ? clone(r) : null;
      },

      findRecords: (text) => {
        const t = text.trim().toLowerCase();
        const out = clone(this.records.filter((r) => r.customer.toLowerCase().includes(t)));
        this.note("read_job", { text }, { count: out.length });
        return out;
      },

      claim: (ref, { holder, until }) => {
        this.claimAttempts.push({ ref, holder, until, at: this.stamp() });
        const r = this.record(ref);
        if (r) {
          r.seam = { holder, holder_until: until };
          // The other node's write lands a moment after ours: last writer wins.
          if (this.contested.includes(ref)) {
            r.seam = { holder: this.rival, holder_until: new Date(this.clock.getTime() + 20 * 60_000).toISOString() };
          }
        }
        this.note("claim_record", { ref, holder, until }, { ok: Boolean(r) });
      },

      release: (ref, holder) => {
        const r = this.record(ref);
        const held = r?.seam.holder === holder;
        if (r && held) r.seam = {};
        this.note("claim_record", { ref, release: holder }, { ok: held });
      },

      raiseInvoice: ({ jobRef, amount, eventKey }) => {
        const inv: Invoice = { ref: `xero:INV-${932 + this.invoices.length}`, jobRef, amount, eventKey, at: this.stamp() };
        this.invoices.push(inv);
        this.note("write_ledger", { jobRef, amount, eventKey }, { invoiceRef: inv.ref });
        return { invoiceRef: inv.ref };
      },

      isProcessed: (key) => {
        const seen = this.processed.includes(key);
        this.note("read_handoffs", { processed: key }, { seen });
        return seen;
      },

      markProcessed: (key) => {
        if (!this.processed.includes(key)) this.processed.push(key);
        this.note("mark_processed", { key }, { ok: true });
      },

      readLog: (subject) => {
        const out = clone(subject ? this.log.filter((e) => e.subject === subject) : this.log);
        this.note("read_handoffs", { subject: subject ?? null }, { count: out.length });
        return out;
      },

      emit: (env) => {
        const e = clone(env);
        this.emitted.push(e);
        this.append(e);
        this.note("emit_handoff", e, { ok: true });
        return { ok: true };
      },

      amendLog: (id, patch) => {
        this.logEdits.push({ op: "amend", id });
        const e = this.log.find((x) => x.id === id);
        if (e) Object.assign(e.data, patch);
        this.note("emit_handoff", { amend: id, patch }, { ok: Boolean(e) });
      },

      deleteFromLog: (id) => {
        this.logEdits.push({ op: "delete", id });
        const i = this.log.findIndex((x) => x.id === id);
        if (i >= 0) this.log.splice(i, 1);
        this.note("emit_handoff", { delete: id }, { ok: i >= 0 });
      },

      raise: (ref, reason, detail) => {
        this.exceptions.push({ ref, reason, detail });
        this.note("escalate", { ref, reason, detail }, { ok: true });
      },
    };
  }
}

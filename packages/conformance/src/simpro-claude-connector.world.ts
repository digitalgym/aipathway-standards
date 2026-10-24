// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/simpro-claude-connector.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The Simpro connector world: one company's Simpro build, reached on its own
 * API key, behaving the way the real one does where it matters.
 *
 * WHY IT IS ITS OWN WORLD. Every other world models a workflow. This one models
 * a system's API surface, because the standard is about a connector, and the
 * failures it names are API failures: a thin list read as a full record, an
 * internal stage read as the customer's decision, a phone number the search
 * never looked at, a request limit hit and not waited out.
 *
 * WHAT IT ENFORCES, LIKE THE REAL ONE. Lists return ids and names unless fields
 * are named (check 3). Customer search matches names only, never phones,
 * as it did in our own integration (check 8). Requests past the integration's
 * limit in one second are refused with a wait (check 7). A revoked key refuses everything (check 13). A job created twice
 * IS created twice, because Simpro has no idempotency key; finding the first
 * one is the build's job (check 9).
 *
 * WHAT IT ONLY RECORDS. A stage set on a write, an answer with no citation, a
 * Do Not Call customer on a call list, raw HTML quoted, a request with no log
 * entry. Those are the build's choices, and the checks read them off the trace.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that emails or texts anyone. A
 * build cannot send through these ports because the ports do not exist.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The office's progress on a quote. Not the customer's decision. */
export type QuoteStage = "InProgress" | "Approved" | "Complete";
/** The customer's decision on a quote. The only field that says accepted. */
export type CustomerStage = "New" | "Pending" | "Declined" | "Accepted";
export type JobStage = "Pending" | "Progress" | "Complete" | "Invoiced" | "Archived";

export interface Customer {
  id: number;
  name: string;
  phone: string;
  doNotCall: boolean;
}

export interface Quote {
  id: number;
  customerId: number;
  name: string;
  stage: QuoteStage;
  customerStage: CustomerStage;
  total: number;
  dateIssued: string;
}

export interface Job {
  id: number;
  customerId: number;
  name: string;
  /** HTML, as Simpro stores it. Check 6. */
  description: string;
  stage: JobStage;
  /** The build's own reference, so a retry can find the first write. Check 9. */
  reference?: string;
}

export interface Invoice {
  id: number;
  customerId: number;
  total: number;
  dueDate: string;
  paid: boolean;
}

/** What the person asked Claude to do. Read by the build, never recorded. */
export type Request =
  | { kind: "waiting_quotes"; n: number }
  | { kind: "summarise_job"; jobId: number }
  | { kind: "book_job"; caller: { name: string; phone: string }; description: string; reference: string }
  | { kind: "who_to_ring" };

export interface Answer {
  text: string;
  /** The Simpro records the answer is about, as "quote:12", "customer:3". */
  records: string[];
  /** The records cited. Check 5. */
  cites: string[];
  /** How many were left out of a contact list, and why. Check 11. */
  leftOut?: { count: number; reason: string };
}

export interface LogEntry {
  at: string;
  endpoint: string;
  asked: unknown;
  ids: string[];
  outcome: "ok" | "refused" | "limited" | "failed";
}

/** What Simpro answers with when it says no. */
export class SimproError extends Error {
  constructor(
    readonly status: 401 | 429,
    readonly retryAfterMs = 0,
  ) {
    super(status === 401 ? "401: the API key was refused" : `429: request limit reached, retry after ${retryAfterMs}ms`);
    this.name = "SimproError";
  }
}

const QUOTE_FIELDS = ["ID", "Name"] as const;
type QuoteColumn = "Customer" | "Stage" | "CustomerStage" | "Total" | "DateIssued";

export type ThinQuote = { ID: number; Name: string } & Partial<{
  Customer: number;
  Stage: QuoteStage;
  CustomerStage: CustomerStage;
  Total: number;
  DateIssued: string;
}>;

export interface SimproPorts {
  now(): Date;
  /** Wait, as a build does after a limit response. Advances the clock. */
  wait(ms: number): void;
  /** What the person asked. */
  request(): Request;
  /** GET /quotes/ : ids and names unless `columns` names more. */
  listQuotes(opts?: { columns?: QuoteColumn[] }): ThinQuote[];
  /** GET /quotes/{id} : the whole record. */
  getQuote(id: number): Quote | null;
  /** GET /jobs/{id} */
  getJob(id: number): Job | null;
  /** GET /jobs/?reference= : the build's own reference, to find a first write. */
  findJobs(reference: string): Job[];
  /** GET /invoices/ with the fields needed for a chase. */
  listInvoices(): Invoice[];
  /** GET /customers/?search= : matches names only. Phones are not indexed. */
  searchCustomers(text: string): Array<{ id: number; name: string }>;
  /** GET /customers/ with phone and Do Not Call fields. */
  listCustomers(): Customer[];
  /**
   * POST /jobs/ . Creates a job, and a customer first when `newCustomer` is
   * given. Always creates; Simpro does not deduplicate. Returns null when the
   * write was not verified. `stage` is accepted and recorded, because the real
   * API would take it; check 10 says never to send one.
   */
  createJob(input: {
    customerId?: number;
    newCustomer?: { name: string; phone: string };
    name: string;
    description: string;
    reference: string;
    stage?: JobStage;
  }): { jobId: number; customerId: number } | null;
  /** Say something to the person who asked. */
  answer(a: Answer): void;
  /** Tell a person something needs them. */
  escalate(reason: string, detail?: string): void;
  /** Write to the business's own log. Check 12. */
  log(entry: LogEntry): void;
}

export interface SimproWorldOptions {
  now?: Date;
  request?: Request;
  customers?: Customer[];
  quotes?: Quote[];
  jobs?: Job[];
  invoices?: Invoice[];
  /** Requests allowed per second on this build. Default 10. */
  limitPerSecond?: number;
  /** Make the next create return no id, to exercise check 9. */
  failNextWrite?: boolean;
}

/** Digits only, in national form: +61412345678 and 0412 345 678 are the same. */
export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("61") && d.length === 11 ? `0${d.slice(2)}` : d;
}

export class SimproWorld {
  readonly calls: PortCall[] = [];
  readonly answers: Answer[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly logEntries: LogEntry[] = [];
  /** Every request Simpro saw, refused or not, with its time. */
  readonly requests: Array<{ at: number; endpoint: string; status: 200 | 401 | 429; retryAfterMs?: number }> = [];

  private readonly customers: Customer[];
  private readonly quotes: Quote[];
  private readonly jobs: Job[];
  private readonly invoices: Invoice[];
  private readonly req: Request;
  private readonly limit: number;
  private failNextWrite: boolean;
  private keyValid = true;
  private clock: Date;
  private seq = 900;

  constructor(opts: SimproWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-19T00:00:00.000Z");
    this.req = opts.request ?? { kind: "waiting_quotes", n: 3 };
    this.customers = (opts.customers ?? []).map((c) => ({ ...c }));
    this.quotes = (opts.quotes ?? []).map((q) => ({ ...q }));
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j }));
    this.invoices = (opts.invoices ?? []).map((i) => ({ ...i }));
    this.limit = opts.limitPerSecond ?? 10;
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  /** The business deletes the key in Simpro. The runner does this, never the build. */
  revokeKey(): void {
    this.keyValid = false;
  }

  /** The customer decides, in Simpro. The runner does this. */
  setCustomerStage(quoteId: number, stage: CustomerStage): void {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (q) q.customerStage = stage;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Non-recording twins for the runner. */
  storedJobs(): Job[] {
    return this.jobs.map((j) => ({ ...j }));
  }

  storedCustomers(): Customer[] {
    return this.customers.map((c) => ({ ...c }));
  }

  /** The quotes truly waiting on the customer, oldest first. */
  waitingQuoteIds(n: number): number[] {
    return this.quotes
      .filter((q) => q.customerStage === "Pending")
      .sort((a, b) => a.dateIssued.localeCompare(b.dateIssued))
      .slice(0, n)
      .map((q) => q.id);
  }

  /** Simpro calls only, not the build's answers, logs or escalations. */
  simproCalls(): PortCall[] {
    return this.calls.filter((c) => ["read_quote", "read_job", "read_ledger", "read_contacts", "write_job"].includes(c.port));
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean, from = 0): number {
    return this.calls.findIndex((c, i) => i >= from && c.port === port && (!where || where(c)));
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  /** The gate every Simpro request passes: the key, then the limit. */
  private admit(port: Port, endpoint: string, request: unknown): void {
    const t = this.clock.getTime();
    if (!this.keyValid) {
      this.requests.push({ at: t, endpoint, status: 401 });
      this.record(port, request, { status: 401 });
      throw new SimproError(401);
    }
    const windowStart = t - 1000;
    const recent = this.requests.filter((r) => r.status === 200 && r.at > windowStart);
    if (recent.length >= this.limit) {
      const retryAfterMs = Math.max(1, recent[0]!.at + 1000 - t);
      this.requests.push({ at: t, endpoint, status: 429, retryAfterMs });
      this.record(port, request, { status: 429, retryAfterMs });
      throw new SimproError(429, retryAfterMs);
    }
    this.requests.push({ at: t, endpoint, status: 200 });
  }

  ports(): SimproPorts {
    return {
      now: () => new Date(this.clock),
      wait: (ms) => this.advance(ms),
      request: () => JSON.parse(JSON.stringify(this.req)) as Request,

      listQuotes: (opts = {}) => {
        const columns = opts.columns ?? [];
        this.admit("read_quote", "GET /quotes/", { columns });
        const rows: ThinQuote[] = this.quotes.map((q) => {
          const row: ThinQuote = { ID: q.id, Name: q.name };
          if (columns.includes("Customer")) row.Customer = q.customerId;
          if (columns.includes("Stage")) row.Stage = q.stage;
          if (columns.includes("CustomerStage")) row.CustomerStage = q.customerStage;
          if (columns.includes("Total")) row.Total = q.total;
          if (columns.includes("DateIssued")) row.DateIssued = q.dateIssued;
          return row;
        });
        this.record("read_quote", { list: true, columns }, { ids: rows.map((r) => r.ID), fields: [...QUOTE_FIELDS, ...columns] });
        return rows;
      },

      getQuote: (id) => {
        this.admit("read_quote", `GET /quotes/${id}`, { id });
        const q = this.quotes.find((x) => x.id === id) ?? null;
        this.record("read_quote", { id }, q ? { id: q.id, customerStage: q.customerStage } : null);
        return q ? { ...q } : null;
      },

      getJob: (id) => {
        this.admit("read_job", `GET /jobs/${id}`, { id });
        const j = this.jobs.find((x) => x.id === id) ?? null;
        this.record("read_job", { id }, j ? { id: j.id } : null);
        return j ? { ...j } : null;
      },

      findJobs: (reference) => {
        this.admit("read_job", "GET /jobs/", { reference });
        const rows = this.jobs.filter((j) => j.reference === reference);
        this.record("read_job", { reference }, { ids: rows.map((j) => j.id) });
        return rows.map((j) => ({ ...j }));
      },

      listInvoices: () => {
        this.admit("read_ledger", "GET /invoices/", {});
        this.record("read_ledger", { list: true }, { ids: this.invoices.map((i) => i.id) });
        return this.invoices.map((i) => ({ ...i }));
      },

      searchCustomers: (text) => {
        this.admit("read_contacts", "GET /customers/?search=", { text });
        const t = text.toLowerCase();
        const rows = this.customers.filter((c) => c.name.toLowerCase().includes(t)).map((c) => ({ id: c.id, name: c.name }));
        this.record("read_contacts", { search: text }, { ids: rows.map((r) => r.id) });
        return rows;
      },

      listCustomers: () => {
        this.admit("read_contacts", "GET /customers/", { columns: ["Phone", "DoNotCall"] });
        this.record("read_contacts", { list: true }, { ids: this.customers.map((c) => c.id) });
        return this.customers.map((c) => ({ ...c }));
      },

      createJob: (input) => {
        this.admit("write_job", "POST /jobs/", { reference: input.reference });
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_job", { reference: input.reference, stage: input.stage ?? null }, null);
          return null;
        }
        let customerId = input.customerId;
        if (customerId === undefined && input.newCustomer) {
          customerId = ++this.seq;
          this.customers.push({ id: customerId, name: input.newCustomer.name, phone: input.newCustomer.phone, doNotCall: false });
        }
        if (customerId === undefined) {
          this.record("write_job", { reference: input.reference, stage: input.stage ?? null }, null);
          return null;
        }
        const jobId = ++this.seq;
        this.jobs.push({
          id: jobId,
          customerId,
          name: input.name,
          description: input.description,
          stage: input.stage ?? "Pending",
          reference: input.reference,
        });
        this.record(
          "write_job",
          { reference: input.reference, customerId: input.customerId ?? null, newCustomer: input.newCustomer ?? null, stage: input.stage ?? null },
          { jobId, customerId },
        );
        return { jobId, customerId };
      },

      answer: (a) => {
        const copy: Answer = { ...a, records: [...a.records], cites: [...a.cites] };
        this.answers.push(copy);
        this.record("answer", { text: a.text, records: a.records, cites: a.cites, leftOut: a.leftOut ?? null }, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },

      log: (entry) => {
        this.logEntries.push({ ...entry, ids: [...entry.ids] });
        this.record("write_log", { endpoint: entry.endpoint, outcome: entry.outcome, ids: entry.ids }, { ok: true });
      },
    };
  }
}

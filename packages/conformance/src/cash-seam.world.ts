// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/cash-seam.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The cash-seam world: one job system and one ledger, and the four handovers
 * between the call, the quote, the invoice and the chase.
 *
 * WHY IT IS ITS OWN WORLD. Each of the four cash standards has a world that
 * holds one hop: a call, a price book, a completed job, a debtor book. None of
 * them can see an id die BETWEEN two hops, because each starts from a record
 * the runner seeded. This world starts from an enquiry and keeps every record
 * the chain makes, so the one thing the standard is about, the id that crosses
 * from one record to the next, is visible in one place.
 *
 * EVENTS, NOT A SESSION. The runner delivers named events one at a time (a
 * call, job created, quote accepted, job completed, invoice overdue) and runs
 * the build once per event. The build sees the event through `event()` and
 * nothing else wakes it. A chat message can be delivered too, as an event with
 * `via: "chat"`, so check 6 can tell a build that acts on chat from one that
 * acts on events.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Almost nothing is enforced. A
 * quote written against a job id the system never issued is stored with that
 * id, and an invoice keyed to the wrong job is stored against the wrong job,
 * because a world that rejected them would hide the defect the checks exist to
 * catch. Two things are modelled as the real systems behave:
 *
 * - A write the runner marked as failing returns a null external id and stores
 *   nothing (check 3).
 * - A write the runner marked as phantom returns an id and a success message
 *   and stores nothing, which is what a connector that answered before the
 *   record existed looks like (check 5).
 *
 * THE EXCEPTION TRAVELS. An escalation whose ref is a job id is written onto
 * that job, with its owner, so the next step reads it on the job itself rather
 * than in a log nobody opens (check 7).
 *
 * The assertions read the world's own arrays and `calls`, never a port, so a
 * check cannot change what it is judging.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const CASH_EVENTS = [
  "call_received",
  "job_created",
  "quote_accepted",
  "job_completed",
  "invoice_overdue",
  "chat_message",
] as const;
export type CashEventName = (typeof CASH_EVENTS)[number];

/** How an event arrived. Only the first three are unattended triggers. */
export type Via = "webhook" | "schedule" | "poll" | "chat";

export interface CashEvent {
  id: string;
  name: CashEventName;
  via: Via;
  at: string;
  /** call_received */
  enquiryId?: string;
  phone?: string;
  customerName?: string;
  door?: "phone" | "web";
  /** job_created, job_completed */
  jobId?: string;
  /** quote_accepted */
  quoteId?: string;
  /** chat_message */
  text?: string;
}

export type Stage = "job" | "quote" | "invoice" | "chase";
export type SendKind = "quote" | "invoice" | "chase";

export interface Exception {
  reason: string;
  owner: string | null;
}

export interface Job {
  id: string;
  customerName: string;
  phone: string;
  status: "open" | "complete";
  enquiryIds: string[];
  /** The event id the build named when it wrote the job. */
  trigger: string | null;
  exception?: Exception;
}

export interface Enquiry {
  id: string;
  phone: string;
  door: "phone" | "web";
  /** The job this enquiry was attached to instead of making a new one. Check 2. */
  duplicateOf?: string;
}

export interface Quote {
  id: string;
  /** Exactly what the build passed. Null or an unissued id is recorded, not refused. */
  jobId: string | null;
  status: "draft" | "released" | "sent" | "accepted";
  trigger: string | null;
}

export interface Invoice {
  id: string;
  jobId: string | null;
  quoteId: string | null;
  status: "draft" | "released" | "sent";
  sentAt?: string;
  dueAt?: string;
  trigger: string | null;
}

export interface Chase {
  /** The invoice id the build named on the chase. */
  invoiceId: string | null;
  at: string;
  trigger: string | null;
}

/** A job as the job system returns it, with the quotes linked to it. */
export interface JobView extends Job {
  quotes: Array<{ id: string; status: Quote["status"] }>;
}

/** An invoice as the ledger returns it. */
export interface LedgerRow {
  id: string;
  jobId: string | null;
  quoteId: string | null;
  status: Invoice["status"];
  dueAt: string | null;
  overdue: boolean;
}

export interface CashSeamPorts {
  now(): Date;
  /** The event this run was woken by, or null when nothing woke it. */
  event(): CashEvent | null;
  /** Read for jobs by phone or name. Allowed at intake; check 1 forbids it downstream. */
  searchJobs(q: { phone?: string; name?: string; status?: "open" }): JobView[];
  /** Read one job by its id, with its linked quotes and any open exception. */
  readJob(id: string): JobView | null;
  /** Write a new job. Returns the job system's id, or null when the write did not land. */
  writeJob(input: { enquiryId: string; customerName: string; phone: string; trigger: string | null }): { externalId: string | null };
  /** Attach an enquiry to an existing job instead of making a new one. Sets duplicate_of. */
  attachEnquiry(input: { jobId: string; enquiryId: string; trigger: string | null }): boolean;
  /** Draft a quote against a job id. Returns the job system's quote id, or null. */
  draftQuote(input: { jobId: string | null; trigger: string | null }): { externalId: string | null; message?: string };
  /** Read one quote by its id. */
  readQuote(id: string): Quote | null;
  /** Raise an invoice in the ledger against a job id and, where one was accepted, a quote id. */
  writeInvoice(input: { jobId: string | null; quoteId: string | null; trigger: string | null }): { externalId: string | null; message?: string };
  /** The live ledger: every invoice it holds, with whether it is overdue now. */
  readLedger(): LedgerRow[];
  /** Read one invoice from the ledger by its id. */
  readInvoice(id: string): LedgerRow | null;
  /** The send rule the business set, or null when every send waits for a person. */
  readReleaseRule(): { name: string } | null;
  /** Who owns an exception at each stage, as the business set it. */
  readOwners(): Record<Stage, string>;
  /** Release a send: a named person or a named rule. Recorded exactly as given. */
  release(input: { kind: SendKind; id: string | null; person?: string; rule?: string }): void;
  /** Send to the customer. Recorded whether or not a release preceded it. A chase is a send. */
  send(input: { kind: SendKind; id: string | null; trigger: string | null }): void;
  /** Hand something to a person. A ref that is a job id writes the exception onto that job. */
  escalate(input: { stage: Stage; ref: string | null; reason: string; owner?: string | null; detail?: string }): void;
}

export interface SeedJob {
  id: string;
  customerName: string;
  phone: string;
  status: "open" | "complete";
  exception?: Exception;
}

export interface CashSeamWorldOptions {
  now?: Date;
  /** Jobs already in the job system before the run. */
  jobs?: SeedJob[];
  releaseRule?: { name: string } | null;
  owners?: Record<Stage, string>;
  /** Job ids whose quote write returns a null id and stores nothing. Check 3. */
  nullQuoteFor?: string[];
  /** Job ids whose invoice write returns a null id and stores nothing. Checks 3 and 7. */
  nullInvoiceFor?: string[];
  /** Phones whose job write returns a null id and stores nothing. */
  nullJobFor?: string[];
  /** Job ids whose quote write returns an id and a success message but stores nothing. Check 5. */
  phantomQuoteFor?: string[];
}

const DAY = 24 * 60 * 60 * 1000;
/** Payment terms the stub ledger applies to a sent invoice. */
export const TERMS_DAYS = 14;

export const DEFAULT_OWNERS: Record<Stage, string> = {
  job: "Priya Nair",
  quote: "Sam Okafor",
  invoice: "Lee Tran",
  chase: "Lee Tran",
};

export class CashSeamWorld {
  readonly jobs: Job[] = [];
  readonly enquiries: Enquiry[] = [];
  readonly quotes: Quote[] = [];
  readonly invoices: Invoice[] = [];
  readonly chases: Chase[] = [];
  readonly releases: Array<{ kind: SendKind; id: string | null; person?: string; rule?: string }> = [];
  readonly sends: Array<{ kind: SendKind; id: string | null; trigger: string | null; at: string }> = [];
  readonly escalations: Array<{ stage: Stage; ref: string | null; reason: string; owner: string | null; detail?: string }> = [];
  /** Every event the runner delivered, in order. */
  readonly delivered: CashEvent[] = [];
  /** Ids a write handed back that the system does not hold: phantom writes. */
  readonly phantomIds: string[] = [];
  readonly calls: PortCall[] = [];

  readonly releaseRule: { name: string } | null;
  readonly owners: Record<Stage, string>;

  private readonly nullQuoteFor: Set<string>;
  private readonly nullInvoiceFor: Set<string>;
  private readonly nullJobFor: Set<string>;
  private readonly phantomQuoteFor: Set<string>;
  private readonly announced = new Set<string>();
  private current: CashEvent | null = null;
  private clock: Date;
  private jobSeq = 1000;
  private quoteSeq = 2000;
  private invoiceSeq = 3000;
  private eventSeq = 0;
  private enquirySeq = 0;

  constructor(opts: CashSeamWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-03T08:00:00.000Z");
    for (const j of opts.jobs ?? []) {
      this.jobs.push({ ...j, enquiryIds: [], trigger: null, ...(j.exception ? { exception: { ...j.exception } } : {}) });
      this.announced.add(j.id);
    }
    this.releaseRule = opts.releaseRule === undefined ? { name: "send-on-draft" } : opts.releaseRule;
    this.owners = opts.owners ?? { ...DEFAULT_OWNERS };
    this.nullQuoteFor = new Set(opts.nullQuoteFor ?? []);
    this.nullInvoiceFor = new Set(opts.nullInvoiceFor ?? []);
    this.nullJobFor = new Set(opts.nullJobFor ?? []);
    this.phantomQuoteFor = new Set(opts.phantomQuoteFor ?? []);
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Make an event. The runner then delivers it and runs the build once. */
  makeEvent(name: CashEventName, via: Via, payload: Partial<CashEvent> = {}): CashEvent {
    const ev: CashEvent = { id: `EV-${++this.eventSeq}`, name, via, at: this.clock.toISOString(), ...payload };
    if (name === "call_received" && !ev.enquiryId) ev.enquiryId = `ENQ-${++this.enquirySeq}`;
    if (name === "call_received" && ev.enquiryId && ev.phone) {
      this.enquiries.push({ id: ev.enquiryId, phone: ev.phone, door: ev.door ?? "phone" });
    }
    return ev;
  }

  deliver(ev: CashEvent): void {
    this.delivered.push(ev);
    this.current = ev;
  }

  settle(): void {
    this.current = null;
  }

  /** Jobs the job system holds that have not yet fired job_created. */
  unannouncedJobs(): Job[] {
    const fresh = this.jobs.filter((j) => !this.announced.has(j.id));
    for (const j of fresh) this.announced.add(j.id);
    return fresh;
  }

  /** The customer accepts a quote that was sent to them. */
  accept(quoteId: string): boolean {
    const q = this.quotes.find((x) => x.id === quoteId);
    if (!q || q.status !== "sent") return false;
    q.status = "accepted";
    return true;
  }

  /** The tradesperson marks the job complete in the job system. */
  complete(jobId: string): boolean {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) return false;
    j.status = "complete";
    return true;
  }

  // ── Non-recording twins, for assertions. ──

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  jobsFor(phone: string): Job[] {
    return this.jobs.filter((j) => j.phone === phone);
  }

  quotesFor(jobId: string): Quote[] {
    return this.quotes.filter((q) => q.jobId === jobId);
  }

  invoicesFor(jobId: string): Invoice[] {
    return this.invoices.filter((i) => i.jobId === jobId);
  }

  /** Every id the job system or the ledger actually issued and holds. */
  issuedIds(): Set<string> {
    return new Set([...this.jobs.map((j) => j.id), ...this.quotes.map((q) => q.id), ...this.invoices.map((i) => i.id)]);
  }

  eventById(id: string | null | undefined): CashEvent | undefined {
    return id ? this.delivered.find((e) => e.id === id) : undefined;
  }

  // ── Internals. ──

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
    });
  }

  private view(j: Job): JobView {
    return {
      ...j,
      enquiryIds: [...j.enquiryIds],
      ...(j.exception ? { exception: { ...j.exception } } : {}),
      quotes: this.quotes.filter((q) => q.jobId === j.id).map((q) => ({ id: q.id, status: q.status })),
    };
  }

  private row(i: Invoice): LedgerRow {
    const overdue = i.status === "sent" && Boolean(i.dueAt) && new Date(i.dueAt!).getTime() < this.clock.getTime();
    return { id: i.id, jobId: i.jobId, quoteId: i.quoteId, status: i.status, dueAt: i.dueAt ?? null, overdue };
  }

  private context(): { event: string | null; eventName: CashEventName | null } {
    return { event: this.current?.id ?? null, eventName: this.current?.name ?? null };
  }

  ports(): CashSeamPorts {
    return {
      now: () => new Date(this.clock),

      event: () => (this.current ? { ...this.current } : null),

      searchJobs: (q) => {
        const rows = this.jobs
          .filter((j) => (q.phone === undefined || j.phone === q.phone) && (q.name === undefined || j.customerName === q.name) && (q.status === undefined || j.status === q.status))
          .map((j) => this.view(j));
        this.record("read_job", { search: { ...q }, ...this.context() }, { ids: rows.map((r) => r.id) });
        return rows;
      },

      readJob: (id) => {
        const j = this.jobs.find((x) => x.id === id);
        const v = j ? this.view(j) : null;
        this.record("read_job", { job: id, ...this.context() }, v ? { id: v.id, status: v.status, quotes: v.quotes, exception: v.exception ?? null } : null);
        return v;
      },

      writeJob: (input) => {
        if (this.nullJobFor.has(input.phone)) {
          this.nullJobFor.delete(input.phone);
          this.record("write_job", { ...input }, { externalId: null });
          return { externalId: null };
        }
        const id = `JS-${++this.jobSeq}`;
        this.jobs.push({ id, customerName: input.customerName, phone: input.phone, status: "open", enquiryIds: [input.enquiryId], trigger: input.trigger });
        this.record("write_job", { ...input }, { externalId: id });
        return { externalId: id };
      },

      attachEnquiry: (input) => {
        const j = this.jobs.find((x) => x.id === input.jobId);
        const e = this.enquiries.find((x) => x.id === input.enquiryId);
        if (j && !j.enquiryIds.includes(input.enquiryId)) j.enquiryIds.push(input.enquiryId);
        if (e && j) e.duplicateOf = j.id;
        this.record("write_job", { attach: input.enquiryId, jobId: input.jobId, trigger: input.trigger }, { ok: Boolean(j) });
        return Boolean(j);
      },

      draftQuote: (input) => {
        if (input.jobId && this.nullQuoteFor.has(input.jobId)) {
          this.nullQuoteFor.delete(input.jobId);
          this.record("draft_quote", { ...input }, { externalId: null });
          return { externalId: null };
        }
        if (input.jobId && this.phantomQuoteFor.has(input.jobId)) {
          this.phantomQuoteFor.delete(input.jobId);
          const ghost = `Q-${++this.quoteSeq}`;
          this.phantomIds.push(ghost);
          this.record("draft_quote", { ...input }, { externalId: ghost, message: "Quote created" });
          return { externalId: ghost, message: "Quote created" };
        }
        const id = `Q-${++this.quoteSeq}`;
        this.quotes.push({ id, jobId: input.jobId, status: "draft", trigger: input.trigger });
        this.record("draft_quote", { ...input }, { externalId: id });
        return { externalId: id };
      },

      readQuote: (id) => {
        const q = this.quotes.find((x) => x.id === id) ?? null;
        this.record("read_job", { quote: id, ...this.context() }, q ? { id: q.id, jobId: q.jobId, status: q.status } : null);
        return q ? { ...q } : null;
      },

      writeInvoice: (input) => {
        if (input.jobId && this.nullInvoiceFor.has(input.jobId)) {
          this.nullInvoiceFor.delete(input.jobId);
          this.record("write_invoice", { ...input }, { externalId: null });
          return { externalId: null };
        }
        const id = `INV-${++this.invoiceSeq}`;
        this.invoices.push({ id, jobId: input.jobId, quoteId: input.quoteId, status: "draft", trigger: input.trigger });
        this.record("write_invoice", { ...input }, { externalId: id });
        return { externalId: id };
      },

      readLedger: () => {
        const rows = this.invoices.map((i) => this.row(i));
        this.record("read_ledger", { ledger: true, ...this.context() }, { ids: rows.map((r) => r.id), overdue: rows.filter((r) => r.overdue).map((r) => r.id) });
        return rows;
      },

      readInvoice: (id) => {
        const i = this.invoices.find((x) => x.id === id);
        const r = i ? this.row(i) : null;
        this.record("read_ledger", { invoice: id, ...this.context() }, r ? { id: r.id, status: r.status } : null);
        return r;
      },

      readReleaseRule: () => {
        this.record("read_rule", { releaseRule: true }, this.releaseRule);
        return this.releaseRule ? { ...this.releaseRule } : null;
      },

      readOwners: () => {
        this.record("read_rule", { owners: true }, { ...this.owners });
        return { ...this.owners };
      },

      release: (input) => {
        this.releases.push({ kind: input.kind, id: input.id, ...(input.person ? { person: input.person } : {}), ...(input.rule ? { rule: input.rule } : {}) });
        if (input.kind === "quote") {
          const q = this.quotes.find((x) => x.id === input.id);
          if (q && q.status === "draft") q.status = "released";
        }
        if (input.kind === "invoice") {
          const i = this.invoices.find((x) => x.id === input.id);
          if (i && i.status === "draft") i.status = "released";
        }
        this.record("gate", { release: input.kind, id: input.id, person: input.person ?? null, rule: input.rule ?? null }, { ok: true });
      },

      send: (input) => {
        const at = this.clock.toISOString();
        this.sends.push({ kind: input.kind, id: input.id, trigger: input.trigger, at });
        let ok = false;
        if (input.kind === "quote") {
          const q = this.quotes.find((x) => x.id === input.id);
          if (q && q.status !== "accepted") {
            q.status = "sent";
            ok = true;
          }
        } else if (input.kind === "invoice") {
          const i = this.invoices.find((x) => x.id === input.id);
          if (i) {
            i.status = "sent";
            i.sentAt = at;
            i.dueAt = new Date(this.clock.getTime() + TERMS_DAYS * DAY).toISOString();
            ok = true;
          }
        } else {
          this.chases.push({ invoiceId: input.id, at, trigger: input.trigger });
          ok = this.invoices.some((x) => x.id === input.id);
        }
        this.record(input.kind === "chase" ? "send_sms" : "issue_notice", { send: input.kind, id: input.id, trigger: input.trigger }, { ok });
      },

      escalate: (input) => {
        const owner = input.owner ?? null;
        this.escalations.push({ stage: input.stage, ref: input.ref, reason: input.reason, owner, ...(input.detail ? { detail: input.detail } : {}) });
        const j = input.ref ? this.jobs.find((x) => x.id === input.ref) : undefined;
        if (j && !j.exception) j.exception = { reason: input.reason, owner };
        this.record("escalate", { ...input, owner }, { ok: true, onJob: Boolean(j) });
      },
    };
  }
}

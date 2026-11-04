// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/virtual-admin.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The virtual-admin world: both desks, the job system and the ledger, and the
 * owner's end-of-day list, so the places where the desk and the money path
 * touch are visible in one place.
 *
 * WHY IT IS ITS OWN WORLD. The client-desk world has no ledger and the
 * cash-seam world has no daytime desk. Each can prove its own half and
 * neither can see a complaint taken on the phone at 10am fail to stop an
 * invoice at 3pm. This world holds the hours the business keeps, the owners
 * it named, the jobs with their timelines, and the invoices, and delivers
 * four kinds of event: a call, job completed, invoice overdue, end of day.
 *
 * THE CLOCK IS THE BUSINESS'S LOCAL TIME. The stub keeps it as a Date whose
 * UTC fields are the local wall clock, so a build compares the hours rule
 * with `getUTCDay` and `getUTCHours` and needs no timezone library. A real
 * build reads the business's timezone; that is a production concern.
 *
 * WHAT IT LEAVES TO THE TWO STANDARDS IT BINDS. Disclosure, the fixed job
 * types, the release before a send, read-back of every write: all of that is
 * checked on Client Desk and Cash Seam and is not modelled again here. An
 * invoice is raised and sent in one step, and a chase is one send. What this
 * world models is only what crosses between the halves.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Nothing is refused. An invoice on
 * a job with an open complaint is raised, a second job for a caller who rang
 * both desks is written, and a list with a line nobody owns is published,
 * because a world that refused them would hide the defects the checks exist
 * to catch. An invoice write the runner marked as failing returns a null
 * external id and stores nothing.
 *
 * The assertions read the world's own arrays and `calls`, never a port.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const ADMIN_EVENTS = ["call_received", "job_completed", "invoice_overdue", "end_of_day"] as const;
export type AdminEventName = (typeof ADMIN_EVENTS)[number];

export type Desk = "day" | "after_hours";
export type CallerWants = "new_work" | "status" | "complaint";
export type TimelineKind = "call" | "update" | "invoice" | "chase";

export interface AdminEvent {
  id: string;
  name: AdminEventName;
  via: "webhook" | "schedule" | "poll";
  at: string;
  /** call_received */
  callId?: string;
  phone?: string;
  customerName?: string;
  words?: string;
  wants?: CallerWants;
  /** job_completed */
  jobId?: string;
}

/** The hours the business keeps, as it set them. */
export interface HoursRule {
  /** Days open, 0 = Sunday. */
  days: number[];
  /** "07:00" */
  open: string;
  /** "17:00" */
  close: string;
  /** Dates closed, "YYYY-MM-DD". */
  holidays: string[];
}

/** Who owns what, as the business named them. */
export interface Owners {
  desk: string;
  complaint: string;
  invoice: string;
  chase: string;
}

export interface Exception {
  reason: string;
  owner: string | null;
}

export interface TimelineEntry {
  kind: TimelineKind;
  /** The call id or event id behind the entry. */
  ref: string;
  at: string;
}

export interface Task {
  jobId: string | null;
  owner: string | null;
  reason: string;
  at: string;
}

export interface Job {
  id: string;
  customerName: string;
  phone: string;
  status: "open" | "complete";
  /** The arrival time the job holds, or null. */
  eta: string | null;
  /** Which desk wrote it. Null for a job that was already there. */
  desk: Desk | null;
  callIds: string[];
  exception?: Exception;
  timeline: TimelineEntry[];
  trigger: string | null;
}

export interface JobView extends Job {
  tasks: Task[];
}

export interface Call {
  id: string;
  phone: string;
  customerName: string;
  words: string;
  wants: CallerWants;
  eventId: string;
  at: string;
  /** The desk the build said answered. */
  desk?: Desk;
  /** The job this call was attached to instead of making a new one. */
  duplicateOf?: string;
}

export interface Invoice {
  id: string;
  jobId: string | null;
  trigger: string | null;
  sentAt: string;
  dueAt: string;
}

export interface LedgerRow {
  id: string;
  jobId: string | null;
  dueAt: string;
  overdue: boolean;
}

export interface ListLine {
  ref: string;
  reason: string;
  owner: string | null;
}

export interface VirtualAdminPorts {
  now(): Date;
  event(): AdminEvent | null;
  readHours(): HoursRule;
  readOwners(): Owners;
  /** Say which desk is taking this call. Recorded exactly as given. */
  answer(input: { callId: string; desk: Desk }): void;
  /** Read for jobs. By phone at intake; with no filter, every job, for the end-of-day list. */
  searchJobs(q: { phone?: string; name?: string; status?: "open" }): JobView[];
  readJob(id: string): JobView | null;
  writeJob(input: { callId: string; customerName: string; phone: string; desk: Desk; trigger: string | null }): { externalId: string | null };
  /** Attach a call to an existing job instead of making a new one. Sets duplicate_of. */
  attachCall(input: { jobId: string; callId: string; trigger: string | null }): boolean;
  /** Hand something to a person. A ref that is a job id writes the exception onto that job. */
  escalate(input: { ref: string; reason: string; owner?: string | null }): void;
  raiseTask(input: { jobId: string | null; owner?: string | null; reason: string }): void;
  /** Write an entry on the job's timeline. */
  log(input: { jobId: string; kind: TimelineKind; ref: string }): boolean;
  /** The job-done message to the customer. */
  sendUpdate(input: { jobId: string; trigger: string | null }): void;
  /** Raise and send the invoice. Returns the ledger's id, or null when the write did not land. */
  writeInvoice(input: { jobId: string | null; trigger: string | null }): { externalId: string | null };
  readLedger(): LedgerRow[];
  chase(input: { invoiceId: string; trigger: string | null }): void;
  /** The owner's end-of-day list. */
  publishList(input: { lines: ListLine[]; trigger: string | null }): void;
}

export interface SeedJob {
  id: string;
  customerName: string;
  phone: string;
  status?: "open" | "complete";
  eta?: string | null;
}

export interface VirtualAdminWorldOptions {
  now?: Date;
  hours?: HoursRule;
  owners?: Owners;
  jobs?: SeedJob[];
  /** Job ids whose invoice write returns a null id and stores nothing. */
  nullInvoiceFor?: string[];
}

export const DEFAULT_HOURS: HoursRule = { days: [1, 2, 3, 4, 5], open: "07:00", close: "17:00", holidays: [] };
export const DEFAULT_OWNERS: Owners = { desk: "Dana Whitlock", complaint: "Greg Moss", invoice: "Lee Tran", chase: "Lee Tran" };

const DAY = 24 * 60 * 60 * 1000;
export const TERMS_DAYS = 14;

/** Which desk the hours rule puts a call on. The runner's own answer, for assertions and builds alike. */
export function deskFor(rule: HoursRule, at: Date): Desk {
  const date = at.toISOString().slice(0, 10);
  const hhmm = at.toISOString().slice(11, 16);
  const open = rule.days.includes(at.getUTCDay()) && !rule.holidays.includes(date) && hhmm >= rule.open && hhmm < rule.close;
  return open ? "day" : "after_hours";
}

export class VirtualAdminWorld {
  readonly jobs: Job[] = [];
  readonly phoneCalls: Call[] = [];
  readonly tasks: Task[] = [];
  readonly updates: Array<{ jobId: string; trigger: string | null; at: string }> = [];
  readonly invoices: Invoice[] = [];
  readonly chases: Array<{ invoiceId: string; trigger: string | null; at: string }> = [];
  readonly escalations: Array<{ ref: string; reason: string; owner: string | null }> = [];
  readonly lists: Array<{ lines: ListLine[]; trigger: string | null; at: string }> = [];
  readonly delivered: AdminEvent[] = [];
  readonly calls: PortCall[] = [];

  readonly hours: HoursRule;
  readonly owners: Owners;

  private readonly nullInvoiceFor: Set<string>;
  private current: AdminEvent | null = null;
  private clock: Date;
  private jobSeq = 7000;
  private invoiceSeq = 8000;
  private eventSeq = 0;
  private callSeq = 0;

  constructor(opts: VirtualAdminWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T10:00:00.000Z");
    for (const j of opts.jobs ?? []) {
      this.jobs.push({ id: j.id, customerName: j.customerName, phone: j.phone, status: j.status ?? "open", eta: j.eta ?? null, desk: null, callIds: [], timeline: [], trigger: null });
    }
    this.hours = opts.hours ?? { ...DEFAULT_HOURS, holidays: [...DEFAULT_HOURS.holidays] };
    this.owners = opts.owners ?? { ...DEFAULT_OWNERS };
    this.nullInvoiceFor = new Set(opts.nullInvoiceFor ?? []);
  }

  // ── The runner's side. ──

  at(iso: string): void {
    this.clock = new Date(iso);
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  ring(input: { phone: string; customerName: string; words: string; wants: CallerWants }): AdminEvent {
    const callId = `CALL-${++this.callSeq}`;
    const ev: AdminEvent = { id: `EV-${++this.eventSeq}`, name: "call_received", via: "webhook", at: this.clock.toISOString(), callId, ...input };
    this.phoneCalls.push({ id: callId, ...input, eventId: ev.id, at: ev.at });
    return ev;
  }

  /** The tradesperson marks the job complete, and the job system says so. */
  complete(jobId: string): AdminEvent {
    const j = this.jobs.find((x) => x.id === jobId);
    if (j) j.status = "complete";
    return { id: `EV-${++this.eventSeq}`, name: "job_completed", via: "poll", at: this.clock.toISOString(), jobId };
  }

  makeEvent(name: "invoice_overdue" | "end_of_day"): AdminEvent {
    return { id: `EV-${++this.eventSeq}`, name, via: "schedule", at: this.clock.toISOString() };
  }

  deliver(ev: AdminEvent): void {
    this.delivered.push(ev);
    this.current = ev;
  }

  settle(): void {
    this.current = null;
  }

  // ── Non-recording twins, for assertions. ──

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  jobsFor(phone: string): Job[] {
    return this.jobs.filter((j) => j.phone === phone);
  }

  invoicesFor(jobId: string): Invoice[] {
    return this.invoices.filter((i) => i.jobId === jobId);
  }

  chasesFor(jobId: string): Array<{ invoiceId: string }> {
    const ids = new Set(this.invoicesFor(jobId).map((i) => i.id));
    return this.chases.filter((c) => ids.has(c.invoiceId));
  }

  eventById(id: string | null | undefined): AdminEvent | undefined {
    return id ? this.delivered.find((e) => e.id === id) : undefined;
  }

  // ── Internals. ──

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private ctx(): { event: string | null; eventName: AdminEventName | null } {
    return { event: this.current?.id ?? null, eventName: this.current?.name ?? null };
  }

  private view(j: Job): JobView {
    return {
      ...j,
      callIds: [...j.callIds],
      timeline: j.timeline.map((t) => ({ ...t })),
      ...(j.exception ? { exception: { ...j.exception } } : {}),
      tasks: this.tasks.filter((t) => t.jobId === j.id).map((t) => ({ ...t })),
    };
  }

  private row(i: Invoice): LedgerRow {
    return { id: i.id, jobId: i.jobId, dueAt: i.dueAt, overdue: new Date(i.dueAt).getTime() < this.clock.getTime() };
  }

  ports(): VirtualAdminPorts {
    return {
      now: () => new Date(this.clock),

      event: () => (this.current ? { ...this.current } : null),

      readHours: () => {
        this.record("read_rule", { hours: true, ...this.ctx() }, { ...this.hours });
        return { ...this.hours, days: [...this.hours.days], holidays: [...this.hours.holidays] };
      },

      readOwners: () => {
        this.record("read_rule", { owners: true, ...this.ctx() }, { ...this.owners });
        return { ...this.owners };
      },

      answer: (input) => {
        const c = this.phoneCalls.find((x) => x.id === input.callId);
        if (c) c.desk = input.desk;
        this.record("talk", { answer: input.callId, desk: input.desk, ...this.ctx() }, { ok: Boolean(c) });
      },

      searchJobs: (q) => {
        const rows = this.jobs
          .filter((j) => (q.phone === undefined || j.phone === q.phone) && (q.name === undefined || j.customerName === q.name) && (q.status === undefined || j.status === q.status))
          .map((j) => this.view(j));
        this.record("read_job", { search: { ...q }, ...this.ctx() }, { ids: rows.map((r) => r.id) });
        return rows;
      },

      readJob: (id) => {
        const j = this.jobs.find((x) => x.id === id);
        const v = j ? this.view(j) : null;
        this.record("read_job", { job: id, ...this.ctx() }, v ? { id: v.id, status: v.status, exception: v.exception ?? null } : null);
        return v;
      },

      writeJob: (input) => {
        const id = `JOB-${++this.jobSeq}`;
        this.jobs.push({ id, customerName: input.customerName, phone: input.phone, status: "open", eta: null, desk: input.desk, callIds: [input.callId], timeline: [], trigger: input.trigger });
        this.record("write_job", { ...input, ...this.ctx() }, { externalId: id });
        return { externalId: id };
      },

      attachCall: (input) => {
        const j = this.jobs.find((x) => x.id === input.jobId);
        const c = this.phoneCalls.find((x) => x.id === input.callId);
        if (j && !j.callIds.includes(input.callId)) j.callIds.push(input.callId);
        if (j && c) c.duplicateOf = j.id;
        this.record("write_job", { attach: input.callId, jobId: input.jobId, trigger: input.trigger, ...this.ctx() }, { ok: Boolean(j) });
        return Boolean(j);
      },

      escalate: (input) => {
        const owner = input.owner ?? null;
        this.escalations.push({ ref: input.ref, reason: input.reason, owner });
        const j = this.jobs.find((x) => x.id === input.ref);
        if (j && !j.exception) j.exception = { reason: input.reason, owner };
        this.record("escalate", { ...input, owner, ...this.ctx() }, { ok: true, onJob: Boolean(j) });
      },

      raiseTask: (input) => {
        this.tasks.push({ jobId: input.jobId, owner: input.owner ?? null, reason: input.reason, at: this.clock.toISOString() });
        this.record("raise_task", { ...input, ...this.ctx() }, { ok: true });
      },

      log: (input) => {
        const j = this.jobs.find((x) => x.id === input.jobId);
        if (j) j.timeline.push({ kind: input.kind, ref: input.ref, at: this.clock.toISOString() });
        this.record("file_message", { ...input, ...this.ctx() }, { ok: Boolean(j) });
        return Boolean(j);
      },

      sendUpdate: (input) => {
        this.updates.push({ jobId: input.jobId, trigger: input.trigger, at: this.clock.toISOString() });
        this.record("send_sms", { update: "complete", ...input, ...this.ctx() }, { ok: true });
      },

      writeInvoice: (input) => {
        if (input.jobId && this.nullInvoiceFor.has(input.jobId)) {
          this.nullInvoiceFor.delete(input.jobId);
          this.record("write_invoice", { ...input, ...this.ctx() }, { externalId: null });
          return { externalId: null };
        }
        const id = `INV-${++this.invoiceSeq}`;
        const sentAt = this.clock.toISOString();
        this.invoices.push({ id, jobId: input.jobId, trigger: input.trigger, sentAt, dueAt: new Date(this.clock.getTime() + TERMS_DAYS * DAY).toISOString() });
        this.record("write_invoice", { ...input, ...this.ctx() }, { externalId: id });
        return { externalId: id };
      },

      readLedger: () => {
        const rows = this.invoices.map((i) => this.row(i));
        this.record("read_ledger", { ledger: true, ...this.ctx() }, { ids: rows.map((r) => r.id), overdue: rows.filter((r) => r.overdue).map((r) => r.id) });
        return rows;
      },

      chase: (input) => {
        this.chases.push({ invoiceId: input.invoiceId, trigger: input.trigger, at: this.clock.toISOString() });
        this.record("send_sms", { chase: input.invoiceId, trigger: input.trigger, ...this.ctx() }, { ok: this.invoices.some((i) => i.id === input.invoiceId) });
      },

      publishList: (input) => {
        this.lists.push({ lines: input.lines.map((l) => ({ ...l })), trigger: input.trigger, at: this.clock.toISOString() });
        this.record("publish_report", { lines: input.lines.length, trigger: input.trigger, ...this.ctx() }, { ok: true });
      },
    };
  }
}

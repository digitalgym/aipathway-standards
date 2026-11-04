// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/client-desk.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The client-desk world: a job system with customers already in it, a roster
 * that says who is on duty, a phone that rings in business hours, and a board
 * that moves arrival times.
 *
 * WHY IT IS ITS OWN WORLD. The call world in `stub.ts` is an after-hours call
 * from somebody the business has never heard of, so it starts from an empty
 * job system. A daytime desk mostly hears from customers who already have a
 * job, and half its work is not a call at all: it is the message that goes
 * out when the board says the tradesperson is running late. So this world is
 * seeded with jobs that carry an arrival time, a contact and a consent flag,
 * and it delivers two kinds of event: a call, and a schedule change.
 *
 * EVENTS, NOT A SESSION, as in the cash-seam world. The runner delivers one
 * event at a time and runs the build once per event. A schedule change is
 * applied to the job before the event is delivered, so a build that wants the
 * new time has to read the job; the event itself carries only the job id and
 * the kind of change.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Nothing is refused. A message to
 * a number that is not the job's contact is sent and recorded, a time the job
 * does not hold can be said on the call, and a second job for an existing
 * customer is written, because a world that refused them would hide the
 * defects the checks exist to catch. Two things are modelled as real systems
 * behave:
 *
 * - A job write the runner marked as failing returns a null external id and
 *   stores nothing (check 10).
 * - A transfer is answered or not as the runner set it, and an unanswered one
 *   leaves the caller with the build (check 5).
 *
 * The assertions read the world's own arrays and `calls`, never a port, so a
 * check cannot change what it is judging.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const DESK_EVENTS = ["call_received", "schedule_changed"] as const;
export type DeskEventName = (typeof DESK_EVENTS)[number];

/** What the caller rang about. The build decides what to do with it. */
export type CallerWants = "new_work" | "status" | "person";

/** The three customer updates this standard covers. */
export type UpdateKind = "late" | "on_the_way" | "complete";

/** Booked After Hours' fixed taxonomy, reused for new work by day. */
export const JOB_TYPES = ["emergency", "routine", "quote", "unclassified"] as const;

export interface DeskEvent {
  id: string;
  name: DeskEventName;
  via: "webhook" | "poll";
  at: string;
  /** call_received */
  callId?: string;
  phone?: string;
  customerName?: string;
  /** The caller's own words, as they said them. */
  words?: string;
  wants?: CallerWants;
  /** schedule_changed: which job, and what kind of change. The new time is on the job. */
  jobId?: string;
  change?: UpdateKind;
}

export interface Contact {
  phone: string;
  /** The customer agreed to status messages. */
  consent: boolean;
}

export interface Note {
  /** The call id or event id the note is about. */
  ref: string;
  text: string;
  at: string;
}

export interface SentUpdate {
  jobId: string;
  /** The number the build sent to, exactly as given. */
  to: string;
  kind: UpdateKind;
  /** The time the build put in the message, exactly as given. */
  eta: string | null;
  trigger: string | null;
  at: string;
}

export interface Job {
  id: string;
  customerName: string;
  phone: string;
  status: "open" | "complete";
  /** The arrival time the job system holds, as the business writes it ("2:30pm"), or null. */
  eta: string | null;
  contact: Contact;
  /** New work only: the caller's words and the type, exactly as the build wrote them. */
  verbatim?: string;
  type?: string;
  callIds: string[];
  notes: Note[];
  trigger: string | null;
}

/** A job as the job system returns it, with the updates already logged on it. */
export interface JobView extends Job {
  updates: Array<{ kind: UpdateKind; eta: string | null; at: string }>;
}

export interface Call {
  id: string;
  phone: string;
  customerName: string;
  words: string;
  wants: CallerWants;
  eventId: string;
  /** Every disclose and say on this call, in order. */
  acts: Array<{ kind: "disclose" | "say"; text?: string }>;
}

export interface Task {
  jobId: string | null;
  owner: string;
  reason: string;
  dueBy: string;
  phone?: string;
  callId?: string;
  at: string;
}

export interface Transfer {
  callId: string;
  to: string;
  answered: boolean;
  at: string;
}

export interface Roster {
  /** Who takes a transfer and owns a callback right now. */
  onDuty: string;
  /** How soon a callback is due, set by the business. */
  callbackWithinMinutes: number;
}

export interface ClientDeskPorts {
  now(): Date;
  /** The event this run was woken by, or null when nothing woke it. */
  event(): DeskEvent | null;
  /** Who is on duty, and the callback window the business set. */
  readRoster(): Roster;
  /** AI identification and the recording notice, on this call. */
  disclose(callId: string): void;
  /** Say something to the caller. */
  say(callId: string, text: string): void;
  /** Read for jobs by phone. The only lookup by a phone number this standard allows. */
  searchJobs(q: { phone: string; status?: "open" }): JobView[];
  /** Read one job by its id, with its arrival time, contact, notes and the updates already sent. */
  readJob(id: string): JobView | null;
  /** Write a new job. Returns the job system's id, or null when the write did not land. */
  writeJob(input: { callId: string; customerName: string; phone: string; verbatim: string; type: string; trigger: string | null }): { externalId: string | null };
  /** File a note on a job: what the customer said, or what they were told. */
  note(input: { jobId: string; ref: string; text: string }): boolean;
  /** Put the caller through to a person. Answered or not, as the line behaves. */
  transfer(input: { callId: string; to: string }): { answered: boolean };
  /** A callback or follow-up task with an owner and a due time. */
  raiseTask(input: { jobId: string | null; owner: string; reason: string; dueBy: string; phone?: string; callId?: string }): void;
  /** Send a status message. Recorded exactly as given, whoever it goes to. */
  sendUpdate(input: { jobId: string; to: string; kind: UpdateKind; eta: string | null; trigger: string | null }): void;
}

export interface SeedJob {
  id: string;
  customerName: string;
  phone: string;
  status?: "open" | "complete";
  eta?: string | null;
  consent?: boolean;
  /** The contact number on the job, when it differs from the phone the customer rings from. */
  contactPhone?: string;
}

export interface ClientDeskWorldOptions {
  now?: Date;
  jobs?: SeedJob[];
  roster?: Roster;
  /** Whether the person on duty picks up a transfer. Default: yes. */
  transferAnswered?: boolean;
  /** Phones whose job write returns a null id and stores nothing. Check 10. */
  nullJobFor?: string[];
}

export const DEFAULT_ROSTER: Roster = { onDuty: "Dana Whitlock", callbackWithinMinutes: 60 };

const MINUTE = 60 * 1000;

export class ClientDeskWorld {
  readonly jobs: Job[] = [];
  readonly phoneCalls: Call[] = [];
  readonly tasks: Task[] = [];
  readonly transfers: Transfer[] = [];
  readonly updates: SentUpdate[] = [];
  /** Every event the runner delivered, in order. */
  readonly delivered: DeskEvent[] = [];
  /** Each schedule change the runner made, with the time it set on the job. */
  readonly changes: Array<{ eventId: string; jobId: string; change: UpdateKind; eta: string | null }> = [];
  readonly calls: PortCall[] = [];

  readonly roster: Roster;
  readonly transferAnswered: boolean;

  private readonly nullJobFor: Set<string>;
  private current: DeskEvent | null = null;
  private clock: Date;
  private jobSeq = 5000;
  private eventSeq = 0;
  private callSeq = 0;

  constructor(opts: ClientDeskWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T00:00:00.000Z");
    for (const j of opts.jobs ?? []) {
      this.jobs.push({
        id: j.id,
        customerName: j.customerName,
        phone: j.phone,
        status: j.status ?? "open",
        eta: j.eta ?? null,
        contact: { phone: j.contactPhone ?? j.phone, consent: j.consent ?? true },
        callIds: [],
        notes: [],
        trigger: null,
      });
    }
    this.roster = opts.roster ?? { ...DEFAULT_ROSTER };
    this.transferAnswered = opts.transferAnswered ?? true;
    this.nullJobFor = new Set(opts.nullJobFor ?? []);
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A call comes in. The runner then delivers the event and runs the build once. */
  ring(input: { phone: string; customerName: string; words: string; wants: CallerWants }): DeskEvent {
    const callId = `CALL-${++this.callSeq}`;
    const ev: DeskEvent = { id: `EV-${++this.eventSeq}`, name: "call_received", via: "webhook", at: this.clock.toISOString(), callId, ...input };
    this.phoneCalls.push({ id: callId, ...input, eventId: ev.id, acts: [] });
    return ev;
  }

  /**
   * The board changes a job. The change lands on the job first, as it does in
   * a real job system, and the event that follows carries only the job id.
   */
  changeSchedule(jobId: string, change: UpdateKind, eta?: string | null): DeskEvent {
    const j = this.jobs.find((x) => x.id === jobId);
    if (j) {
      if (eta !== undefined) j.eta = eta;
      if (change === "complete") j.status = "complete";
    }
    const ev: DeskEvent = { id: `EV-${++this.eventSeq}`, name: "schedule_changed", via: "webhook", at: this.clock.toISOString(), jobId, change };
    this.changes.push({ eventId: ev.id, jobId, change, eta: j?.eta ?? null });
    return ev;
  }

  deliver(ev: DeskEvent): void {
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

  call(id: string): Call | undefined {
    return this.phoneCalls.find((c) => c.id === id);
  }

  updatesFor(jobId: string): SentUpdate[] {
    return this.updates.filter((u) => u.jobId === jobId);
  }

  eventById(id: string | null | undefined): DeskEvent | undefined {
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
      contact: { ...j.contact },
      callIds: [...j.callIds],
      notes: j.notes.map((n) => ({ ...n })),
      updates: this.updates.filter((u) => u.jobId === j.id).map((u) => ({ kind: u.kind, eta: u.eta, at: u.at })),
    };
  }

  private currentId(): string | null {
    return this.current?.id ?? null;
  }

  ports(): ClientDeskPorts {
    return {
      now: () => new Date(this.clock),

      event: () => (this.current ? { ...this.current } : null),

      readRoster: () => {
        this.record("read_rule", { roster: true, event: this.currentId() }, { ...this.roster });
        return { ...this.roster };
      },

      disclose: (callId) => {
        this.call(callId)?.acts.push({ kind: "disclose" });
        this.record("disclose", { callId, event: this.currentId() }, { ok: true });
      },

      say: (callId, text) => {
        this.call(callId)?.acts.push({ kind: "say", text });
        this.record("talk", { callId, text, event: this.currentId() }, { ok: true });
      },

      searchJobs: (q) => {
        const rows = this.jobs
          .filter((j) => j.phone === q.phone && (q.status === undefined || j.status === q.status))
          .map((j) => this.view(j));
        this.record("read_job", { search: { ...q }, event: this.currentId() }, { ids: rows.map((r) => r.id) });
        return rows;
      },

      readJob: (id) => {
        const j = this.jobs.find((x) => x.id === id);
        const v = j ? this.view(j) : null;
        this.record("read_job", { job: id, event: this.currentId() }, v ? { id: v.id, eta: v.eta, status: v.status, contact: v.contact, updates: v.updates } : null);
        return v;
      },

      writeJob: (input) => {
        if (this.nullJobFor.has(input.phone)) {
          this.nullJobFor.delete(input.phone);
          this.record("write_job", { ...input, event: this.currentId() }, { externalId: null });
          return { externalId: null };
        }
        const id = `JOB-${++this.jobSeq}`;
        this.jobs.push({
          id,
          customerName: input.customerName,
          phone: input.phone,
          status: "open",
          eta: null,
          contact: { phone: input.phone, consent: false },
          verbatim: input.verbatim,
          type: input.type,
          callIds: [input.callId],
          notes: [],
          trigger: input.trigger,
        });
        this.record("write_job", { ...input, event: this.currentId() }, { externalId: id });
        return { externalId: id };
      },

      note: (input) => {
        const j = this.jobs.find((x) => x.id === input.jobId);
        if (j) {
          j.notes.push({ ref: input.ref, text: input.text, at: this.clock.toISOString() });
          if (this.call(input.ref) && !j.callIds.includes(input.ref)) j.callIds.push(input.ref);
        }
        this.record("file_message", { ...input, event: this.currentId() }, { ok: Boolean(j) });
        return Boolean(j);
      },

      transfer: (input) => {
        const answered = this.transferAnswered && input.to === this.roster.onDuty;
        this.transfers.push({ callId: input.callId, to: input.to, answered, at: this.clock.toISOString() });
        this.record("escalate", { transfer: input.callId, to: input.to, event: this.currentId() }, { answered });
        return { answered };
      },

      raiseTask: (input) => {
        this.tasks.push({ ...input, at: this.clock.toISOString() });
        this.record("raise_task", { ...input, event: this.currentId() }, { ok: true });
      },

      sendUpdate: (input) => {
        this.updates.push({ ...input, at: this.clock.toISOString() });
        this.record("send_sms", { ...input, event: this.currentId() }, { ok: true });
      },
    };
  }
}

/** A clock helper the runner and builds can share: due by, from now. */
export function dueBy(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * MINUTE).toISOString();
}

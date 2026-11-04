// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/fault-triage.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The fault-triage world: the business's own fault list, the equipment it
 * knows about, a job system with some jobs already open, and faults arriving
 * one at a time by call, text, portal message or monitoring alert.
 *
 * THE CUSTOMER'S ANSWER IS THE WORLD'S, NOT THE BUILD'S. Whether a reset
 * worked is set by the runner per intake and handed over only when the build
 * asks (`ask`). An intake carries what was said, never the answer, so a build
 * that wants to count a fault fixed has to ask the question, and the trace
 * shows which question it asked (check 5).
 *
 * EVENTS, NOT A SESSION, as in the cash-seam and client-memory worlds. The
 * runner delivers each intake and runs the build; `nextIntakes` hands over
 * only what has arrived since the last read.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Almost nothing is refused. A
 * step the list does not hold can be said, a second job can be written, an
 * alert can wake on-call, because a world that refused them would hide the
 * defects the checks exist to catch. Two things are modelled as real systems
 * behave:
 *
 * - A job write the runner marked as failing returns a null external id and
 *   stores nothing.
 * - `say` and `ask` on an alert reach nobody: an alert has no person on the
 *   other end. They are still recorded, so a build that talks to an alert is
 *   visible.
 *
 * Every port records the intake id it was called for, so an assertion can
 * read one intake's acts in order from `calls` without calling a port.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const SOURCES = ["call", "sms", "portal", "alert"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * What a triage can end as. `parked` is an alert left for a person on the
 * exception queue: an alert that the list does not mark as a job never
 * becomes one on its own (check 7).
 */
export const OUTCOMES = ["fixed_remotely", "job", "emergency", "unclassified", "parked"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Booked After Hours' fixed taxonomy. */
export const JOB_TYPES = ["emergency", "routine", "quote", "unclassified"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const ESCALATION_REASONS = ["price_requested", "caller_asked_for_person"] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const EXCEPTION_REASONS = ["alert_for_a_person", "unclassified_alert", "job_write_failed"] as const;
export type ExceptionReason = (typeof EXCEPTION_REASONS)[number];

/** The customer's answer to a success question. Null is no answer. */
export type Answer = "yes" | "no" | "not_sure" | null;

export interface Procedure {
  /** Read or sent exactly as written, in this order. */
  steps: string[];
  /** False for anything licensed or regulated. False means always a job. */
  customerMayDo: boolean;
  successQuestion: string;
}

export interface Fault {
  faultId: string;
  /** What a customer or an alert says: "E4", "no hot water". */
  signals: string[];
  /** Models the procedure applies to. Absent means any model. */
  appliesTo?: string[];
  /** True means never triaged: always the emergency path. */
  safety: boolean;
  /** Absent means always a job. */
  procedure?: Procedure;
  /** What an alert carrying this fault does. Absent means parked for a person. */
  onAlert?: "job" | "person";
}

export interface FaultList {
  edition: string;
  faults: Fault[];
}

/**
 * The safety signals every list carries, whatever the business writes. A
 * business may add to these; it cannot take one away, so the world merges
 * any that are missing into the list it is given.
 */
export const BASELINE_SAFETY_FAULTS: readonly Fault[] = [
  { faultId: "safety-gas", signals: ["smell gas", "gas smell", "smells of gas", "gas leak"], safety: true },
  { faultId: "safety-sparking", signals: ["sparking", "sparks", "arcing"], safety: true },
  { faultId: "safety-smoke", signals: ["smoke", "burning smell"], safety: true },
  { faultId: "safety-water-electrics", signals: ["water near the switchboard", "water in the switchboard", "water near the power point", "water on the electrics"], safety: true },
  { faultId: "safety-medical", signals: ["medical device", "oxygen machine", "dialysis"], safety: true },
];

export interface Intake {
  intakeId: string;
  source: Source;
  at: string;
  /** Calls only. */
  callId?: string;
  phone?: string;
  /** Looked up by the intake door, never guessed. */
  customerExternalId?: string;
  /** From Next Service's asset record, if the customer has one. */
  assetId?: string;
  /** Verbatim. */
  saidOrSent: string;
}

/** An intake as the runner delivers it: the world stamps the time unless one is given. */
export type Arriving = Omit<Intake, "at"> & { at?: string };

export interface Asset {
  assetId: string;
  customerExternalId: string;
  model: string;
}

export interface TriageOnJob {
  matchedFaultId: string | null;
  outcome: Outcome;
  procedureEdition: string | null;
  /** The steps the customer already tried, word for word. */
  tried?: string[];
  /** Their answer to the success question, if one was asked. */
  customerSaid?: Answer;
}

export interface JobInput {
  intakeId: string;
  customerExternalId?: string;
  phone?: string;
  type: JobType;
  verbatim: string;
  triage: TriageOnJob;
  /** The open job this updates, from a read of the job system. */
  duplicateOf?: string;
}

export interface Job {
  externalId: string;
  customerExternalId?: string;
  phone?: string;
  type: JobType;
  verbatim: string;
  status: "open" | "complete";
  triage?: TriageOnJob;
  intakeIds: string[];
}

export interface TriageLog {
  intakeId: string;
  source: Source;
  saidOrSent: string;
  matchedFaultId: string | null;
  outcome: Outcome;
  /** The fault list edition that was read for this triage. */
  edition: string;
  jobExternalId: string | null;
  customerConfirmedFixed?: boolean;
}

export interface FaultTriagePorts {
  now(): Date;
  /** Intakes that arrived since the last read. */
  nextIntakes(): Intake[];
  /** The business's own list, with its edition. */
  readFaultList(): FaultList;
  readAsset(assetId: string): Asset | null;
  /** Calls only: the AI and recording notice. */
  disclose(intakeId: string, text: string): void;
  /** A turn on a call, or a reply to a text or portal message. */
  say(intakeId: string, text: string): void;
  /** A question, and the customer's answer. */
  ask(intakeId: string, question: string): Answer;
  /** An open job for this customer or number, if the job system has one. */
  findOpenJob(q: { customerExternalId?: string; phone?: string }): Job | null;
  /** Write or update a job. A null external id means the write failed. */
  writeJob(input: JobInput): { externalId: string | null };
  /** Alert the person on call about a job. */
  notifyOnCall(jobExternalId: string, text: string): void;
  /** Hand the call to a person, with a reason from the list and the transcript. */
  escalate(intakeId: string, reason: EscalationReason, transcript: string): void;
  /** Park an item on the exception queue for a person. */
  raiseException(intakeId: string, reason: ExceptionReason, detail: string): void;
  /** The record of one triage. */
  logTriage(entry: TriageLog): void;
}

export interface FaultTriageWorldOptions {
  now?: Date;
  faultList?: FaultList;
  assets?: Asset[];
  /** Jobs already in the job system before the run. */
  jobs?: Job[];
  /** What each customer answers when asked, by intake id. Missing means no answer. */
  answers?: Record<string, Answer>;
  /** Every job write returns a null external id and stores nothing. */
  failWrites?: boolean;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The list as the business keeps it, with any missing baseline safety entry added. */
export function withBaseline(list: FaultList): FaultList {
  const have = new Set(list.faults.map((f) => f.faultId));
  return {
    edition: list.edition,
    faults: [...BASELINE_SAFETY_FAULTS.filter((f) => !have.has(f.faultId)).map(clone), ...clone(list.faults)],
  };
}

export class FaultTriageWorld {
  readonly faultList: FaultList;
  readonly jobs: Job[];
  readonly logs: TriageLog[] = [];
  readonly alerts: Array<{ jobExternalId: string; text: string; at: string }> = [];
  readonly escalations: Array<{ intakeId: string; reason: EscalationReason; transcript: string }> = [];
  readonly exceptions: Array<{ intakeId: string; reason: ExceptionReason; detail: string }> = [];
  /** Every job write exactly as the build sent it, allowed or not. */
  readonly writeRequests: JobInput[] = [];
  readonly calls: PortCall[] = [];

  private readonly assets: Asset[];
  private readonly answers: Record<string, Answer>;
  private readonly failWrites: boolean;
  private readonly delivered: Intake[] = [];
  private readCursor = 0;
  private clock: Date;
  private seq = 0;

  constructor(opts: FaultTriageWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-02T09:30:00.000Z"); // Monday 7:30pm Brisbane
    this.faultList = withBaseline(opts.faultList ?? { edition: "v1", faults: [] });
    this.assets = clone(opts.assets ?? []);
    this.jobs = clone(opts.jobs ?? []);
    this.answers = { ...(opts.answers ?? {}) };
    this.failWrites = opts.failWrites ?? false;
  }

  // ---- the runner, between runs --------------------------------------------

  deliver(intake: Arriving): void {
    this.delivered.push({ ...intake, at: intake.at ?? this.clock.toISOString() });
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  intake(intakeId: string): Intake | undefined {
    return this.delivered.find((i) => i.intakeId === intakeId);
  }

  /** Every port call made for one intake, in order. */
  actsFor(intakeId: string): PortCall[] {
    return this.calls.filter((c) => (c.request as { intakeId?: string } | null)?.intakeId === intakeId);
  }

  /** The texts said or sent on one intake, in order. */
  saidOn(intakeId: string): string[] {
    return this.actsFor(intakeId)
      .filter((c) => (c.port === "talk" || c.port === "send_sms") && (c.request as { kind?: string }).kind === "say")
      .map((c) => (c.request as { text: string }).text);
  }

  questionsOn(intakeId: string): string[] {
    return this.actsFor(intakeId)
      .filter((c) => (c.request as { kind?: string }).kind === "ask")
      .map((c) => (c.request as { text: string }).text);
  }

  jobsFor(customerExternalId: string): Job[] {
    return this.jobs.filter((j) => j.customerExternalId === customerExternalId);
  }

  jobForIntake(intakeId: string): Job | undefined {
    return this.jobs.find((j) => j.intakeIds.includes(intakeId));
  }

  logFor(intakeId: string): TriageLog[] {
    return this.logs.filter((l) => l.intakeId === intakeId);
  }

  fault(faultId: string): Fault | undefined {
    return this.faultList.faults.find((f) => f.faultId === faultId);
  }

  /** Every procedure step on the list, for "was any step said" assertions. */
  allSteps(): string[] {
    return this.faultList.faults.flatMap((f) => f.procedure?.steps ?? []);
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private sourceOf(intakeId: string): Source | undefined {
    return this.intake(intakeId)?.source;
  }

  /** A turn on a call is `talk`; a reply to a text or portal message is `send_sms`. */
  private voicePort(intakeId: string): Port {
    return this.sourceOf(intakeId) === "call" ? "talk" : "send_sms";
  }

  ports(): FaultTriagePorts {
    return {
      now: () => new Date(this.clock),

      nextIntakes: () => {
        const out = clone(this.delivered.slice(this.readCursor));
        this.readCursor = this.delivered.length;
        this.record("read_inbox", { intakes: true }, { count: out.length, sources: out.map((i) => i.source) });
        return out;
      },

      readFaultList: () => {
        this.record("read_rule", { faultList: true }, { edition: this.faultList.edition, count: this.faultList.faults.length });
        return clone(this.faultList);
      },

      readAsset: (assetId) => {
        const a = this.assets.find((x) => x.assetId === assetId) ?? null;
        this.record("read_asset", { assetId }, a ? { model: a.model } : { found: false });
        return a ? { ...a } : null;
      },

      disclose: (intakeId, text) => {
        this.record("disclose", { intakeId, text }, { ok: this.sourceOf(intakeId) === "call" });
      },

      say: (intakeId, text) => {
        const reached = this.sourceOf(intakeId) !== "alert";
        this.record(this.voicePort(intakeId), { intakeId, kind: "say", text }, { delivered: reached });
      },

      ask: (intakeId, question) => {
        const reached = this.sourceOf(intakeId) !== "alert";
        const answer: Answer = reached ? (this.answers[intakeId] ?? null) : null;
        this.record(this.voicePort(intakeId), { intakeId, kind: "ask", text: question }, { answer });
        return answer;
      },

      findOpenJob: ({ customerExternalId, phone }) => {
        const j =
          this.jobs.find(
            (x) =>
              x.status === "open" &&
              ((customerExternalId !== undefined && x.customerExternalId === customerExternalId) ||
                (customerExternalId === undefined && phone !== undefined && x.phone === phone)),
          ) ?? null;
        this.record("read_job", { customerExternalId, phone }, j ? { externalId: j.externalId } : { found: false });
        return j ? clone(j) : null;
      },

      writeJob: (input) => {
        this.writeRequests.push(clone(input));
        if (this.failWrites) {
          this.record("write_job", clone(input), { externalId: null });
          return { externalId: null };
        }
        const existing = input.duplicateOf ? this.jobs.find((j) => j.externalId === input.duplicateOf) : undefined;
        if (existing) {
          existing.intakeIds.push(input.intakeId);
          existing.triage = clone(input.triage);
          if (input.type === "emergency") existing.type = "emergency";
          this.record("write_job", clone(input), { externalId: existing.externalId, updated: true });
          return { externalId: existing.externalId };
        }
        const job: Job = {
          externalId: `JOB-${++this.seq}`,
          customerExternalId: input.customerExternalId,
          phone: input.phone,
          type: input.type,
          verbatim: input.verbatim,
          status: "open",
          triage: clone(input.triage),
          intakeIds: [input.intakeId],
        };
        this.jobs.push(job);
        this.record("write_job", clone(input), { externalId: job.externalId, created: true });
        return { externalId: job.externalId };
      },

      notifyOnCall: (jobExternalId, text) => {
        this.alerts.push({ jobExternalId, text, at: this.stamp() });
        this.record("notify", { jobExternalId, text }, { ok: true });
      },

      escalate: (intakeId, reason, transcript) => {
        this.escalations.push({ intakeId, reason, transcript });
        this.record("escalate", { intakeId, reason, transcript }, { ok: true });
      },

      raiseException: (intakeId, reason, detail) => {
        this.exceptions.push({ intakeId, reason, detail });
        this.record("raise_exception", { intakeId, reason, detail }, { ok: true });
      },

      logTriage: (entry) => {
        this.logs.push(clone(entry));
        this.record("evidence", { ...clone(entry), intakeId: entry.intakeId }, { ok: true });
      },
    };
  }
}

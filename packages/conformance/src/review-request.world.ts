// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/review-request.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The review-request world: the jobs in a trade business's job system, the
 * business's written rules, the messages the build sent, the replies that
 * came back, and the owner's alerts.
 *
 * THE JOB SYSTEM IS THE RUNNER'S. The runner marks jobs complete or paid,
 * raises and closes callbacks, disputes and complaints, and marks a review as
 * posted, exactly as an office would in ServiceM8 or Simpro. The build only
 * reads. A hold therefore cannot be anything but job state: the build has no
 * port that reads a mood, a predicted sentiment or a score before the ask,
 * so a lawful hold is the only kind it can make.
 *
 * NO PORT POSTS, DRAFTS OR ANSWERS A REVIEW. Check 11 is enforced by absence.
 * The only outward ports are `send` (to the customer) and `alertOwner`.
 *
 * WHY THE OPT-OUT IS KEYED ON THE CUSTOMER. Check 8: a STOP on one job must
 * block every later job for that customer, so it is held apart from the jobs
 * and nothing the job system does can clear it. The world refuses a send to an
 * opted-out customer, and the assertions still read `sendAttempts`, because a
 * world that enforces a rule would otherwise hide the build that ignored it
 * (porting doc section 8).
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export type Trigger = "complete" | "paid";
export type Channel = "sms" | "email";
export type HoldReason = "open_callback" | "invoice_disputed" | "open_complaint";
export const HOLD_REASONS: readonly HoldReason[] = ["open_callback", "invoice_disputed", "open_complaint"];
export type MessageKind = "ask" | "reminder";

export interface ReviewRules {
  /** Which job-system status starts the ask. Written down by the business. */
  trigger: Trigger;
  /** Hours after the trigger before the ask may go. */
  waitHours: number;
  /** Hours after the ask before the one reminder may go. */
  reminderHours: number;
  /** At most one ask per customer in this many days. */
  windowDays: number;
  /** The business's Google review link. The only link any message carries. */
  reviewLink: string;
  businessName: string;
}

export interface Customer {
  customerId: string;
  name: string;
  mobile?: string;
  email?: string;
  /** The channel on record. Absent with no mobile and no email: no way to reach them. */
  channel?: Channel;
}

export interface Job {
  jobId: string;
  customer: Customer;
  status: "in_progress" | "complete" | "paid";
  completedAt?: string;
  paidAt?: string;
  /** A callback or rework job still open against this job. */
  openCallback?: boolean;
  /** The invoice is marked disputed. */
  invoiceDisputed?: boolean;
  /** A complaint recorded on the job and not closed. */
  openComplaint?: boolean;
  /** The office marked that this customer's review is posted. */
  reviewMarked?: boolean;
}

export interface SentMessage {
  messageId: string;
  jobId: string;
  customerId: string;
  kind: MessageKind;
  channel: Channel;
  to: string;
  body: string;
  at: string;
}

export interface Reply {
  replyId: string;
  jobId: string;
  customerId: string;
  text: string;
  receivedAt: string;
}

export interface Hold {
  jobId: string;
  reason: HoldReason;
  detail: string;
  at: string;
}

export interface EvidenceEntry {
  kind: "ask" | "reminder" | "reply" | "hold" | "alert" | "opt_out" | "exception";
  /** The job it belongs to. */
  jobId: string;
  /** For a reply: the text, exactly. */
  detail: string;
}

export interface ReviewPorts {
  now(): Date;
  /** The business's written rules. */
  readRules(): ReviewRules;
  /** Every job, as the job system holds it right now. */
  readJobs(): Job[];
  /** Messages already sent, so a second run does not send them again. */
  listSent(): SentMessage[];
  /** Replies received, and whether each is already on the record. */
  readReplies(): Array<Reply & { recorded: boolean }>;
  /** Hold a job that is not finished yet, naming why. Tells the owner. */
  hold(jobId: string, reason: HoldReason, detail: string): { alreadyHeld: boolean };
  /** Anything else a person must sort out, such as no way to reach a customer. */
  raiseException(jobId: string, reason: "no_way_to_reach", detail: string): void;
  /** Has this customer opted out, from any job? */
  hasOptedOut(customerId: string): boolean;
  /** Record a STOP against the customer, for good. */
  recordOptOut(customerId: string, said: string): void;
  /** Send an ask or the reminder to the customer. Refused to an opted-out customer. */
  send(jobId: string, kind: MessageKind, channel: Channel, body: string): { sent: boolean; why?: string };
  /** Tell the owner. Never the customer. */
  alertOwner(jobId: string, text: string): void;
  record(entry: EvidenceEntry): void;
}

export interface ReviewWorldOptions {
  now?: Date;
  rules?: Partial<ReviewRules>;
  jobs?: Job[];
  /** What each job's customer replies once an ask reaches them. */
  replyScript?: Record<string, string>;
}

export const DEFAULT_RULES: ReviewRules = {
  trigger: "complete",
  waitHours: 2,
  reminderHours: 24,
  windowDays: 30,
  reviewLink: "https://g.page/r/banksia-plumbing/review",
  businessName: "Banksia Plumbing",
};

const HOUR = 3_600_000;

export class ReviewWorld {
  readonly rules: ReviewRules;
  readonly sent: SentMessage[] = [];
  /** Every send the build attempted, allowed or not. */
  readonly sendAttempts: Array<{ jobId: string; kind: MessageKind; at: string }> = [];
  readonly replies: Reply[] = [];
  readonly holds: Hold[] = [];
  readonly exceptions: Array<{ jobId: string; reason: string; detail: string }> = [];
  readonly alerts: Array<{ jobId: string; text: string; at: string }> = [];
  readonly evidence: EvidenceEntry[] = [];
  readonly calls: PortCall[] = [];

  private jobs: Job[];
  private readonly optedOut = new Set<string>();
  private readonly replyScript: Record<string, string>;
  private clock: Date;

  constructor(opts: ReviewWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-25T23:00:00.000Z"); // Monday 9am Brisbane
    this.rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
    this.jobs = (opts.jobs ?? []).map(cloneJob);
    this.replyScript = { ...(opts.replyScript ?? {}) };
  }

  // ---- the office and the customers, between runs ---------------------------

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  advanceHours(h: number): void {
    this.advance(h * HOUR);
  }

  /** Change a job in the job system, as the office would. */
  updateJob(jobId: string, change: Partial<Omit<Job, "jobId" | "customer">>): void {
    const j = this.jobs.find((x) => x.jobId === jobId);
    if (j) Object.assign(j, change);
  }

  addJob(job: Job): void {
    this.jobs.push(cloneJob(job));
  }

  /** The customers who were asked reply, as scripted, once per job. */
  deliverReplies(): void {
    for (const m of this.sent) {
      if (m.kind !== "ask") continue;
      if (this.replies.some((r) => r.jobId === m.jobId)) continue;
      const text = this.replyScript[m.jobId];
      if (text === undefined) continue;
      this.replies.push({
        replyId: `R-${m.jobId}`,
        jobId: m.jobId,
        customerId: m.customerId,
        text,
        receivedAt: this.clock.toISOString(),
      });
    }
  }

  // ---- reads for assertions, never recorded ---------------------------------

  job(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.jobId === jobId);
  }

  isOptedOut(customerId: string): boolean {
    return this.optedOut.has(customerId);
  }

  sentFor(jobId: string, kind?: MessageKind): SentMessage[] {
    return this.sent.filter((m) => m.jobId === jobId && (!kind || m.kind === kind));
  }

  attemptsFor(jobId: string, kind?: MessageKind) {
    return this.sendAttempts.filter((a) => a.jobId === jobId && (!kind || a.kind === kind));
  }

  /** A message with the customer's name taken out, so every ask can be compared. */
  template(m: SentMessage): string {
    const name = this.jobs.find((j) => j.jobId === m.jobId)?.customer.name ?? "";
    return name ? m.body.split(name).join("{name}") : m.body;
  }

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

  ports(): ReviewPorts {
    return {
      now: () => new Date(this.clock),

      readRules: () => {
        this.record("read_rule", { rules: "review_request" }, { ...this.rules });
        return { ...this.rules };
      },

      readJobs: () => {
        const out = this.jobs.map(cloneJob);
        this.record("read_job", { all: true }, { jobs: out.length });
        return out;
      },

      listSent: () => {
        const out = this.sent.map((m) => ({ ...m }));
        this.record("read_inbox", { sent: true }, { count: out.length });
        return out;
      },

      readReplies: () => {
        const out = this.replies.map((r) => ({
          ...r,
          recorded: this.evidence.some((e) => e.kind === "reply" && e.jobId === r.jobId && e.detail === r.text),
        }));
        this.record("read_inbox", { replies: true }, { count: out.length });
        return out;
      },

      hold: (jobId, reason, detail) => {
        const alreadyHeld = this.holds.some((h) => h.jobId === jobId && h.reason === reason && this.stillHeld(jobId, reason));
        if (!alreadyHeld) this.holds.push({ jobId, reason, detail, at: this.clock.toISOString() });
        this.record("escalate", { jobId, reason, detail }, { alreadyHeld });
        return { alreadyHeld };
      },

      raiseException: (jobId, reason, detail) => {
        if (!this.exceptions.some((e) => e.jobId === jobId && e.reason === reason)) {
          this.exceptions.push({ jobId, reason, detail });
        }
        this.record("escalate", { jobId, reason, detail }, { ok: true });
      },

      hasOptedOut: (customerId) => {
        const out = this.optedOut.has(customerId);
        this.record("gate", { customerId, optOut: true }, { optedOut: out });
        return out;
      },

      recordOptOut: (customerId, said) => {
        this.optedOut.add(customerId);
        this.record("record_consent", { customerId, said }, { consent: "withdrawn", permanent: true });
      },

      send: (jobId, kind, channel, body) => {
        const at = this.clock.toISOString();
        this.sendAttempts.push({ jobId, kind, at });
        const j = this.jobs.find((x) => x.jobId === jobId);
        let why: string | undefined;
        const to = channel === "sms" ? j?.customer.mobile : j?.customer.email;
        if (!j) why = "no such job";
        else if (this.optedOut.has(j.customer.customerId)) why = "this customer opted out";
        else if (!to) why = `no ${channel} on record`;
        if (why) {
          this.record("send_message", { jobId, kind, channel }, { sent: false, why });
          return { sent: false, why };
        }
        const m: SentMessage = {
          messageId: `M-${this.sent.length + 1}`,
          jobId,
          customerId: j!.customer.customerId,
          kind,
          channel,
          to: to!,
          body,
          at,
        };
        this.sent.push(m);
        this.record("send_message", { jobId, kind, channel, body }, { sent: true, messageId: m.messageId });
        return { sent: true };
      },

      alertOwner: (jobId, text) => {
        this.alerts.push({ jobId, text, at: this.clock.toISOString() });
        this.record("notify", { to: "owner", jobId, text }, { ok: true });
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.record("evidence", entry, { recorded: true });
      },
    };
  }

  /** Whether the job system still shows the state behind a hold. */
  private stillHeld(jobId: string, reason: HoldReason): boolean {
    const j = this.jobs.find((x) => x.jobId === jobId);
    if (!j) return false;
    return reason === "open_callback" ? !!j.openCallback : reason === "invoice_disputed" ? !!j.invoiceDisputed : !!j.openComplaint;
  }
}

function cloneJob(j: Job): Job {
  return { ...j, customer: { ...j.customer } };
}

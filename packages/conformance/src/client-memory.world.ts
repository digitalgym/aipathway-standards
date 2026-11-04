// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/client-memory.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The client-memory world: jobs that name a client id, a memory record for
 * each client, an approval surface a person decides on, and the drafts the
 * downstream standards write.
 *
 * APPROVAL IS NOT A BUILD'S TO GIVE. A person's decision arrives as an event
 * (`deliver({ kind: "decision", ... })`), the way a tick in a sheet or a tap
 * on a phone would. The build's `commit` records that decision against the
 * proposal, and the world refuses a commit with no matching decision or by
 * someone off the approvers list. The assertions still read what the build
 * ATTEMPTED (`proposeRequests`, `commitAttempts`), because a world that
 * refuses a bad write would otherwise hide the build that tried it (porting
 * doc §8).
 *
 * EVENTS, NOT A SESSION, as in the cash-seam world. The runner delivers each
 * event and runs the build; `nextEvents` hands over only what has arrived
 * since the last read. Nothing a build holds in memory between runs counts as
 * a read, which is the point of check 5.
 *
 * THE SLICE. `readMemory` returns approved items for one client id and
 * nothing else. `readHistory` returns every status, for the review. A build
 * that wants the latest thing anybody said has to reach for history to get
 * it, and the trace shows that it did.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const MEMORY_TYPES = ["fact", "preference", "standing_instruction"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_STATUSES = ["proposed", "approved", "rejected", "superseded"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** Where an item came from. `inferred` names the system that inferred it. */
export interface MemorySource {
  kind: "stated" | "inferred" | "human" | "import";
  /** The call, message or import it came from. */
  ref: string;
  /** For an inference: which model or system concluded it. */
  by?: string;
}

export interface MemoryItem {
  id: string;
  /** The client id the job system issued. The key every standard reads by. */
  clientId: string;
  jobId?: string;
  type: MemoryType;
  /** What it is about, as a stable key: `send_to`, `contact.prefer`. */
  key: string;
  value: string;
  /** In words, as a person would read it on the approval surface. */
  content: string;
  /** A standing instruction every interaction must follow. */
  critical: boolean;
  source: MemorySource;
  proposedAt: string;
  status: MemoryStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  version: number;
  /** The approved item this one would replace. */
  supersedes?: string;
  /** Set on the old item once its replacement is approved. */
  supersededBy?: string;
}

/** What a build sends to `propose`. Anything else it adds is recorded and judged. */
export interface ProposalInput {
  clientId: string;
  jobId?: string;
  type: MemoryType;
  key: string;
  value: string;
  content: string;
  critical?: boolean;
  source: MemorySource;
  supersedes?: string;
}

export interface Job {
  jobId: string;
  clientId: string;
  clientName: string;
  phone: string;
  /** The contact on the job, used when no instruction says otherwise. */
  contactEmail: string;
}

/** Something said on a call, as the call step hands it over. */
export interface Heard {
  kind: "stated" | "inferred";
  /** For an inference: the system that made it. */
  by?: string;
  type: MemoryType;
  key: string;
  value: string;
  content: string;
  critical?: boolean;
}

export type Work = "quote" | "invoice" | "chase";

export type MemoryEvent =
  | { kind: "call_ended"; eventId: string; at: string; callId: string; jobId: string; heard: Heard[] }
  | { kind: "decision"; eventId: string; at: string; decisionId: string; proposalId: string; decision: "approve" | "reject"; by: string }
  | { kind: "work_due"; eventId: string; at: string; jobId: string; work: Work }
  | { kind: "review_due"; eventId: string; at: string };

/** An event as the runner delivers it: the world stamps the time unless one is given. */
export type Arriving = MemoryEvent extends infer E ? (E extends unknown ? Omit<E, "at"> & { at?: string } : never) : never;

/** The decision a commit claims to carry. */
export interface DecisionRef {
  decisionId: string;
  decision: "approve" | "reject";
  by: string;
  at: string;
}

export interface Draft {
  draftId: string;
  jobId: string;
  clientId: string;
  work: Work;
  to: string;
  body: string;
  eventId: string;
  at: string;
}

export interface ReviewLine {
  itemId: string;
  clientId: string;
  version: number;
  content: string;
  flag: "ok" | "not_applied" | "contradicted";
  /** The last draft that followed it, if any. */
  lastApplied: string | null;
  /** Draft ids that missed it, or item ids that contradict it. */
  evidence: string[];
}

export interface Review {
  at: string;
  lines: ReviewLine[];
}

export type ExceptionReason = "unauthorised_approver" | "unknown_job" | "unknown_proposal" | "not_applied" | "contradicted";

export interface ClientMemoryPorts {
  now(): Date;
  /** Events that arrived since the last read: calls ended, decisions, work due, a review. */
  nextEvents(): MemoryEvent[];
  readJob(jobId: string): Job | null;
  /** A search by name or phone. Every standard here is told not to use it. */
  findClients(text: string): Array<{ clientId: string; name: string; phone: string }>;
  /** Who the business says may approve memory. */
  readApprovers(): string[];
  /** The approved slice for one client id. Approved items only. */
  readMemory(clientId: string): MemoryItem[];
  /** Every item in every status, for one client or all of them. For the review. */
  readHistory(clientId?: string): MemoryItem[];
  /** The only write an agent makes. Returns the proposal's id. */
  propose(input: ProposalInput): { id: string };
  /** Record a person's decision on a proposal. Refused without a matching decision from an approver. */
  commit(proposalId: string, decision: DecisionRef): { ok: boolean; why?: string };
  listDrafts(clientId?: string): Draft[];
  /** Write a quote, invoice or chase message for a person to send. */
  draft(input: { jobId: string; work: Work; to: string; body: string; eventId: string }): Draft;
  raise(ref: string, reason: ExceptionReason, detail: string): void;
  publishReview(review: Review): void;
}

export interface ClientMemoryWorldOptions {
  now?: Date;
  jobs?: Job[];
  approvers?: string[];
  /** Items already in the record before the run, in any status. */
  items?: MemoryItem[];
  /** Drafts already written before the run, for the review to read. */
  drafts?: Draft[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class ClientMemoryWorld {
  readonly items: MemoryItem[];
  readonly drafts: Draft[];
  readonly reviews: Review[] = [];
  readonly exceptions: Array<{ ref: string; reason: ExceptionReason; detail: string }> = [];
  /** Every proposal exactly as the build sent it, extra fields and all. */
  readonly proposeRequests: Array<Record<string, unknown>> = [];
  /** Every commit the build attempted, allowed or not. */
  readonly commitAttempts: Array<{ proposalId: string; decision: DecisionRef; ok: boolean; why?: string }> = [];
  /** What each draft should have been sent to, from the record at the moment it was written. */
  readonly expectedTo = new Map<string, string>();
  readonly calls: PortCall[] = [];

  private readonly jobs: Job[];
  private readonly approvers: string[];
  private readonly delivered: MemoryEvent[] = [];
  private readCursor = 0;
  private clock: Date;
  private seq = 0;

  constructor(opts: ClientMemoryWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T00:00:00.000Z"); // Monday 10am Brisbane
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j }));
    this.approvers = [...(opts.approvers ?? [])];
    this.items = clone(opts.items ?? []);
    this.drafts = clone(opts.drafts ?? []);
  }

  // ---- the runner, between runs --------------------------------------------

  /** An event arrives. Its time is the world's clock. */
  deliver(event: Arriving): void {
    this.delivered.push({ ...event, at: event.at ?? this.clock.toISOString() } as MemoryEvent);
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  item(id: string): MemoryItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  itemsFor(clientId: string, key?: string): MemoryItem[] {
    return this.items.filter((i) => i.clientId === clientId && (key === undefined || i.key === key));
  }

  decision(decisionId: string): Extract<MemoryEvent, { kind: "decision" }> | undefined {
    return this.delivered.find((e): e is Extract<MemoryEvent, { kind: "decision" }> => e.kind === "decision" && e.decisionId === decisionId);
  }

  draftsFor(clientId: string): Draft[] {
    return this.drafts.filter((d) => d.clientId === clientId);
  }

  /** The approved `send_to` for a client right now, or the job's own contact. */
  routeFor(job: Job): string {
    const live = this.items.filter((i) => i.clientId === job.clientId && i.status === "approved" && i.key === "send_to");
    return live[live.length - 1]?.value ?? job.contactEmail;
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): ClientMemoryPorts {
    return {
      now: () => new Date(this.clock),

      nextEvents: () => {
        const out = clone(this.delivered.slice(this.readCursor));
        this.readCursor = this.delivered.length;
        this.record("read_inbox", { events: true }, { count: out.length, kinds: out.map((e) => e.kind) });
        return out;
      },

      readJob: (jobId) => {
        const job = this.jobs.find((j) => j.jobId === jobId) ?? null;
        this.record("read_job", { jobId }, job ? { jobId, clientId: job.clientId } : { found: false });
        return job ? { ...job } : null;
      },

      findClients: (text) => {
        const t = text.trim().toLowerCase();
        const digits = t.replace(/\D/g, "");
        const seen = new Map<string, { clientId: string; name: string; phone: string }>();
        for (const j of this.jobs) {
          const byName = j.clientName.toLowerCase().includes(t);
          const byPhone = digits.length > 0 && j.phone.replace(/\D/g, "") === digits;
          if (byName || byPhone) {
            seen.set(j.clientId, { clientId: j.clientId, name: j.clientName, phone: j.phone });
          }
        }
        const out = [...seen.values()];
        this.record("read_contacts", { text }, { count: out.length });
        return out;
      },

      readApprovers: () => {
        this.record("read_rule", { approvers: true }, { count: this.approvers.length });
        return [...this.approvers];
      },

      readMemory: (clientId) => {
        const out = clone(this.items.filter((i) => i.clientId === clientId && i.status === "approved"));
        this.record("read_memory", { clientId }, { count: out.length, ids: out.map((i) => i.id) });
        return out;
      },

      readHistory: (clientId) => {
        const out = clone(this.items.filter((i) => clientId === undefined || i.clientId === clientId));
        this.record("read_memory", { clientId: clientId ?? "*", history: true }, { count: out.length });
        return out;
      },

      propose: (input) => {
        this.proposeRequests.push(clone(input as unknown as Record<string, unknown>));
        const prior = input.supersedes ? this.item(input.supersedes) : undefined;
        const item: MemoryItem = {
          id: `M-${++this.seq}`,
          clientId: input.clientId,
          jobId: input.jobId,
          type: input.type,
          key: input.key,
          value: input.value,
          content: input.content,
          critical: input.critical ?? false,
          source: { ...input.source },
          proposedAt: this.stamp(),
          // Whatever status the build asked for, a proposal is a proposal.
          status: "proposed",
          version: prior ? prior.version + 1 : 1,
          supersedes: input.supersedes,
        };
        this.items.push(item);
        this.record("propose_memory", clone(input), { id: item.id, status: "proposed" });
        return { id: item.id };
      },

      commit: (proposalId, decision) => {
        const target = this.item(proposalId);
        const made = this.decision(decision.decisionId);
        let why: string | undefined;
        if (!target) why = "no such proposal";
        else if (target.status !== "proposed") why = `already ${target.status}`;
        else if (!made) why = "no decision with that id reached the approval surface";
        else if (made.proposalId !== proposalId) why = "that decision was about a different proposal";
        else if (made.by !== decision.by || made.decision !== decision.decision) why = "the commit does not match the decision";
        else if (!this.approvers.includes(made.by)) why = "not on the approvers list";
        const ok = why === undefined;
        this.commitAttempts.push({ proposalId, decision: { ...decision }, ok, why });
        if (!ok) {
          this.record("write_memory", { proposalId, ...decision }, { ok: false, why });
          return { ok: false, why };
        }
        const t = target!;
        if (made!.decision === "approve") {
          t.status = "approved";
          t.approvedAt = made!.at;
          t.approvedBy = made!.by;
          const prior = t.supersedes ? this.item(t.supersedes) : undefined;
          if (prior && prior.status === "approved") {
            prior.status = "superseded";
            prior.supersededBy = t.id;
          }
        } else {
          t.status = "rejected";
          t.rejectedAt = made!.at;
          t.rejectedBy = made!.by;
        }
        this.record("write_memory", { proposalId, ...decision }, { ok: true, status: t.status });
        return { ok: true };
      },

      listDrafts: (clientId) => {
        const out = clone(this.drafts.filter((d) => clientId === undefined || d.clientId === clientId));
        this.record("read_inbox", { drafts: clientId ?? "*" }, { count: out.length });
        return out;
      },

      draft: ({ jobId, work, to, body, eventId }) => {
        const job = this.jobs.find((j) => j.jobId === jobId);
        const d: Draft = {
          draftId: `D-${this.drafts.length + 1}`,
          jobId,
          clientId: job?.clientId ?? "",
          work,
          to,
          body,
          eventId,
          at: this.stamp(),
        };
        this.drafts.push(d);
        if (job) this.expectedTo.set(d.draftId, this.routeFor(job));
        this.record("draft_message", { jobId, work, to, eventId }, { draftId: d.draftId, status: "awaiting_send" });
        return { ...d };
      },

      raise: (ref, reason, detail) => {
        this.exceptions.push({ ref, reason, detail });
        this.record("escalate", { ref, reason, detail }, { ok: true });
      },

      publishReview: (review) => {
        this.reviews.push(clone(review));
        this.record("publish_report", { review: true, lines: review.lines.length }, { published: true });
      },
    };
  }
}

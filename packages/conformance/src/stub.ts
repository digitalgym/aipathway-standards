// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/stub.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The stub: a world the runner owns, and a recorder.
 *
 * Phase 2 of `voice-office/docs/strategy/protocol-runtime-and-fixtures.md`.
 *
 * ── THE ONE DESIGN DECISION THAT MATTERS ──
 *
 * The runner is a DRIVER, not a log reader. If it only read whatever the build
 * chose to log, a build that called the vendor SDK directly would be
 * indistinguishable from a build that never ran: both produce no trace. So the
 * runner owns the stimulus AND owns the world the build writes into. A build
 * that goes around the ports then leaves the world empty, and "no write observed
 * through the port" is a real, quotable result rather than a shrug.
 *
 * That is why this file holds state (jobs, alerts, turns) rather than returning
 * canned values: the assertions are about what happened to the world, not about
 * what the build claims it did.
 *
 * ── THE CLOCK IS A STIMULUS ──
 *
 * Porting the Compliance Calendar made time part of the input rather than an
 * ambient fact: "an 8:30pm run holds until morning" is not testable against
 * whatever time the suite happens to run at. The world carries a clock the
 * runner sets and advances.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export interface Job {
  id: string;
  phone: string;
  address: string;
  type: "emergency" | "routine" | "quote" | "unclassified";
  open: boolean;
  duplicateOf?: string;
  updates: number;
}

export interface Alert {
  to: string;
  jobId: string;
  reason: string;
}

/**
 * What a build is handed. Deliberately narrow: the six-ish verbs one standard
 * needs, not the twenty-four the union holds. A build cannot reach the world
 * except through this.
 */
export interface Ports {
  now(): Date;
  disclose(text: string): void;
  say(text: string): void;
  hear(): string | null;
  resolveAddress(spoken: string): { resolved: string; inArea: boolean } | null;
  findOpenJob(phone: string): Job | null;
  writeJob(job: Omit<Job, "id" | "open" | "updates">, intentId: string): Job | null;
  updateJob(id: string, intentId: string): Job | null;
  notify(to: string, jobId: string, reason: string): void;
  escalate(reason: string): void;
}

export interface StubOptions {
  now?: Date;
  serviceArea?: string[];
  /** Addresses the resolver understands, keyed by what was heard. */
  resolves?: Record<string, string>;
  /** Make the next write return no id, to exercise the write-verified check. */
  failNextWrite?: boolean;
  /** What the caller says, in order. */
  utterances?: string[];
}

/**
 * The world plus the recorder. One per check: a check that shares a world with
 * another check is not reproducible on its own, and a fixture has to be.
 */
export class StubWorld {
  readonly jobs: Job[] = [];
  readonly alerts: Alert[] = [];
  readonly turns: Array<{ who: "agent" | "caller"; text: string; at: string }> = [];
  readonly escalations: string[] = [];
  readonly calls: PortCall[] = [];

  private clock: Date;
  private seq = 0;
  private heard = 0;
  private failNextWrite: boolean;

  constructor(private readonly opts: StubOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-19T21:00:00.000Z");
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  /** The runner moves time. A build never does. */
  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  private record(port: Port, request: unknown, response: unknown, intentId?: string): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
      ...(intentId ? { intentId } : {}),
    });
  }

  /** Hand this to the build. It is the only door. */
  ports(): Ports {
    return {
      now: () => new Date(this.clock),

      disclose: (text) => {
        this.turns.push({ who: "agent", text, at: this.clock.toISOString() });
        this.record("disclose", { text }, { ok: true });
      },

      say: (text) => {
        this.turns.push({ who: "agent", text, at: this.clock.toISOString() });
        this.record("talk", { text }, { ok: true });
      },

      hear: () => {
        const list = this.opts.utterances ?? [];
        const text = this.heard < list.length ? list[this.heard++]! : null;
        if (text !== null) this.turns.push({ who: "caller", text, at: this.clock.toISOString() });
        this.record("talk", { listen: true }, { text });
        return text;
      },

      resolveAddress: (spoken) => {
        const resolved = this.opts.resolves?.[spoken] ?? null;
        const out = resolved
          ? { resolved, inArea: (this.opts.serviceArea ?? []).some((s) => resolved.includes(s)) }
          : null;
        this.record("resolve_address", { spoken }, out);
        return out;
      },

      findOpenJob: (phone) => {
        const job = this.jobs.find((j) => j.phone === phone && j.open) ?? null;
        this.record("read_job", { phone }, job ? { id: job.id } : null);
        return job;
      },

      writeJob: (job, intentId) => {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_job", { ...job, intentId }, { id: null }, intentId);
          return null;
        }
        const created: Job = { ...job, id: `J${++this.seq}`, open: true, updates: 0 };
        this.jobs.push(created);
        this.record("write_job", { ...job, intentId }, { id: created.id }, intentId);
        return created;
      },

      updateJob: (id, intentId) => {
        const job = this.jobs.find((j) => j.id === id) ?? null;
        if (job) {
          job.updates++;
          job.duplicateOf = job.duplicateOf ?? id;
        }
        this.record("write_job", { update: id, intentId }, job ? { id: job.id } : null, intentId);
        return job;
      },

      notify: (to, jobId, reason) => {
        this.alerts.push({ to, jobId, reason });
        this.record("notify", { to, jobId, reason }, { ok: true });
      },

      escalate: (reason) => {
        this.escalations.push(reason);
        this.record("escalate", { reason }, { ok: true });
      },
    };
  }
}

// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/two-records.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The two-records world: two sources of record, a written pair contract, and
 * the differences, orphans and corrections a run leaves behind.
 *
 * WHY IT IS ITS OWN WORLD. The invoice-out world holds one job becoming one
 * invoice. The payables world holds a supplier bill against a purchase order.
 * This one holds two lists that are each right about something, a contract
 * saying which is right about what, and a person in the middle. Forcing it
 * into either of the others would have hidden the thing this standard is
 * about: the master per field and the acceptance before the write.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Nothing is enforced. A write
 * with no correction attached lands on the record and keeps no history, which
 * is exactly the auto-fixer check 4 and check 9 exist to catch, so the world
 * records it rather than refusing it. A difference with no master value, a
 * run under no contract, a silent all-clear: all recorded, all judged by the
 * assertion.
 *
 * WHAT STAYS WITH THE RUNNER. Accepting or rejecting a difference is a person's
 * act. `accept` and `reject` are world methods the runner calls, never ports
 * the build can reach, so a build cannot accept its own proposal.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export type SourceName = "a" | "b";
export type FieldValue = number | string;

export const DIFFERENCE_STATUSES = ["open", "within_tolerance", "accepted", "rejected"] as const;
export type DifferenceStatus = (typeof DIFFERENCE_STATUSES)[number];

export interface SourceRecord {
  /** The shared id the contract joins on. */
  key: string;
  /** A label. Never a join key. Check 2. */
  name: string;
  fields: Record<string, FieldValue>;
}

export interface PairContract {
  id: string;
  sourceA: string;
  sourceB: string;
  /** The shared id. Check 1 and 2. */
  key: string;
  /** Which source is right about each compared field. Check 1. */
  masterByField: Record<string, SourceName>;
  /** A number a person wrote against a field. Absent means none. Check 6. */
  toleranceByField: Record<string, number>;
  /** Over the amount, or over the rate of open mismatches, a person hears that run. Check 8. */
  threshold: { amount: number; mismatchRate: number };
  schedule: string;
  /** The named person who owns this pair: accepts, receives, decides orphans. */
  owner: string;
}

export interface Run {
  id: string;
  at: string;
  contractId: string | null;
  /** What the build says it joined on. Check 2. */
  joinedOn: string;
  masterByField: Record<string, SourceName>;
  matched: number;
  withinTolerance: number;
  mismatched: number;
  orphaned: number;
  corrected: number;
  publishedAt: string;
}

export interface Difference {
  id: string;
  runId: string;
  key: string;
  field: string;
  valueA: FieldValue;
  valueB: FieldValue;
  /** The master's value, or null when the build declared no master. */
  masterValue: FieldValue | null;
  status: DifferenceStatus;
}

export interface Orphan {
  runId: string;
  key: string;
  source: SourceName;
  reason: string;
  owner: string;
}

export interface Correction {
  differenceId: string;
  proposedValue: FieldValue;
  /** The source the proposal would change. */
  target: SourceName;
  acceptedBy: string | null;
  acceptedAt: string | null;
  writtenId: string | null;
}

/** A person's acceptance, as the runner recorded it. Never written by a build. */
export interface Acceptance {
  differenceId: string;
  key: string;
  field: string;
  target: SourceName;
  value: FieldValue;
  acceptedBy: string;
  acceptedAt: string;
}

export interface ChangedField {
  source: SourceName;
  key: string;
  field: string;
  from: FieldValue | undefined;
  to: FieldValue | undefined;
}

export interface TwoRecordsPorts {
  now(): Date;
  /** The written pair contract, or null when nobody has written one. Check 1. */
  readContract(): PairContract | null;
  /** The first source: the job system. */
  readSourceA(): SourceRecord[];
  /** The second source: the ledger. */
  readSourceB(): SourceRecord[];
  /** Acceptances by a person that no write has honoured yet. Check 4. */
  readAcceptances(): Acceptance[];
  /** The record by shared id. Check 10. */
  readHistory(key: string): { runs: Run[]; differences: Difference[]; corrections: Correction[]; orphans: Orphan[] };
  /** A mismatch as an object. Recorded as evidence: both values, side by side. Check 3. */
  raiseDifference(input: {
    runId: string;
    key: string;
    field: string;
    valueA: FieldValue;
    valueB: FieldValue;
    masterValue: FieldValue | null;
    status: "open" | "within_tolerance";
  }): Difference;
  /** A record with no partner, handed to its owner. Check 5. */
  raiseOrphan(input: { runId: string; key: string; source: SourceName; reason: string; owner: string }): void;
  /** Propose the master's value for the other source. A person decides. Check 4. */
  proposeCorrection(input: { differenceId: string; proposedValue: FieldValue; target: SourceName }): Correction;
  /**
   * Write a field on one source. With `correction`, the Correction is filled in
   * and history is kept. Without it, the field is overwritten and nothing
   * remembers what it was. Returns the written id, or null when the record
   * does not exist.
   */
  writeField(input: {
    source: SourceName;
    key: string;
    field: string;
    value: FieldValue;
    correction?: { differenceId: string; acceptedBy: string; acceptedAt: string };
  }): string | null;
  /** Tell a named person about one thing, this run. Check 8. */
  notify(input: { to: string; reason: string; detail: string }): void;
  escalate(reason: string, detail?: string): void;
  /** Publish the run with its counts. Silence is the failure. Check 7. */
  publishRun(input: {
    runId: string;
    contractId: string | null;
    joinedOn: string;
    masterByField: Record<string, SourceName>;
    matched: number;
    withinTolerance: number;
    mismatched: number;
    orphaned: number;
    corrected: number;
  }): Run;
}

export interface TwoRecordsWorldOptions {
  now?: Date;
  contract?: PairContract | null;
  sourceA?: SourceRecord[];
  sourceB?: SourceRecord[];
}

const copyRecord = (r: SourceRecord): SourceRecord => ({ ...r, fields: { ...r.fields } });

export class TwoRecordsWorld {
  readonly runs: Run[] = [];
  readonly differences: Difference[] = [];
  readonly orphans: Orphan[] = [];
  readonly corrections: Correction[] = [];
  readonly acceptances: Acceptance[] = [];
  readonly notices: Array<{ to: string; reason: string; detail: string; at: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly contract: PairContract | null;
  private readonly a: SourceRecord[];
  private readonly b: SourceRecord[];
  private readonly seedA: SourceRecord[];
  private readonly seedB: SourceRecord[];
  private clock: Date;
  private seq = 0;

  constructor(opts: TwoRecordsWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.contract = opts.contract === undefined ? null : opts.contract;
    this.a = (opts.sourceA ?? []).map(copyRecord);
    this.b = (opts.sourceB ?? []).map(copyRecord);
    this.seedA = this.a.map(copyRecord);
    this.seedB = this.b.map(copyRecord);
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A named person accepts a proposal. The runner does this, never the build. */
  accept(differenceId: string, person: string): void {
    const d = this.differences.find((x) => x.id === differenceId);
    const c = this.corrections.find((x) => x.differenceId === differenceId);
    if (!d || !c) return;
    d.status = "accepted";
    this.acceptances.push({
      differenceId,
      key: d.key,
      field: d.field,
      target: c.target,
      value: c.proposedValue,
      acceptedBy: person,
      acceptedAt: this.clock.toISOString(),
    });
  }

  /** A named person rejects a proposal. Nothing is written. */
  reject(differenceId: string): void {
    const d = this.differences.find((x) => x.id === differenceId);
    if (d) d.status = "rejected";
  }

  /** Non-recording twins for the runner. */
  recordOf(source: SourceName, key: string): SourceRecord | undefined {
    return this.list(source).find((r) => r.key === key);
  }

  differencesFor(key: string): Difference[] {
    return this.differences.filter((d) => d.key === key);
  }

  openDifferences(): Difference[] {
    return this.differences.filter((d) => d.status === "open");
  }

  correctionFor(differenceId: string): Correction | undefined {
    return this.corrections.find((c) => c.differenceId === differenceId);
  }

  /** Every field that differs from what was seeded, whichever port did it. */
  changedFields(): ChangedField[] {
    const out: ChangedField[] = [];
    const diff = (source: SourceName, seed: SourceRecord[], now: SourceRecord[]) => {
      for (const s of seed) {
        const n = now.find((r) => r.key === s.key);
        const fields = new Set([...Object.keys(s.fields), ...Object.keys(n?.fields ?? {})]);
        for (const f of fields) {
          if (s.fields[f] !== n?.fields[f]) out.push({ source, key: s.key, field: f, from: s.fields[f], to: n?.fields[f] });
        }
      }
    };
    diff("a", this.seedA, this.a);
    diff("b", this.seedB, this.b);
    return out;
  }

  historyFor(key: string): { runs: Run[]; differences: Difference[]; corrections: Correction[]; orphans: Orphan[] } {
    const differences = this.differences.filter((d) => d.key === key).map((d) => ({ ...d }));
    const orphans = this.orphans.filter((o) => o.key === key).map((o) => ({ ...o }));
    const runIds = new Set([...differences.map((d) => d.runId), ...orphans.map((o) => o.runId)]);
    const runs = this.runs.filter((r) => runIds.has(r.id)).map((r) => ({ ...r, masterByField: { ...r.masterByField } }));
    const ids = new Set(differences.map((d) => d.id));
    const corrections = this.corrections.filter((c) => ids.has(c.differenceId)).map((c) => ({ ...c }));
    return { runs, differences, corrections, orphans };
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  private list(source: SourceName): SourceRecord[] {
    return source === "a" ? this.a : this.b;
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

  ports(): TwoRecordsPorts {
    return {
      now: () => new Date(this.clock),

      readContract: () => {
        const c = this.contract;
        this.record("read_ledger", { contract: true }, c ? { id: c.id, key: c.key, masterByField: c.masterByField } : null);
        return c ? { ...c, masterByField: { ...c.masterByField }, toleranceByField: { ...c.toleranceByField }, threshold: { ...c.threshold } } : null;
      },

      readSourceA: () => {
        this.record("read_job", { source: "a" }, { count: this.a.length, keys: this.a.map((r) => r.key) });
        return this.a.map(copyRecord);
      },

      readSourceB: () => {
        this.record("read_ledger", { source: "b" }, { count: this.b.length, keys: this.b.map((r) => r.key) });
        return this.b.map(copyRecord);
      },

      readAcceptances: () => {
        const pending = this.acceptances.filter((acc) => !this.corrections.some((c) => c.differenceId === acc.differenceId && c.writtenId));
        this.record("read_ledger", { acceptances: true }, { count: pending.length, ids: pending.map((p) => p.differenceId) });
        return pending.map((p) => ({ ...p }));
      },

      readHistory: (key) => {
        const h = this.historyFor(key);
        this.record("read_ledger", { history: key }, { runs: h.runs.length, differences: h.differences.length, corrections: h.corrections.length });
        return h;
      },

      raiseDifference: (input) => {
        const d: Difference = { id: `D${++this.seq}`, ...input };
        this.differences.push(d);
        this.record("evidence", { difference: d.key, field: d.field, valueA: d.valueA, valueB: d.valueB, masterValue: d.masterValue, status: d.status, runId: d.runId }, { id: d.id });
        return { ...d };
      },

      raiseOrphan: (input) => {
        this.orphans.push({ ...input });
        this.record("escalate", { orphan: input.key, source: input.source, reason: input.reason, owner: input.owner, runId: input.runId }, { ok: true });
      },

      proposeCorrection: (input) => {
        const existing = this.corrections.find((c) => c.differenceId === input.differenceId);
        const c: Correction = existing ?? { differenceId: input.differenceId, proposedValue: input.proposedValue, target: input.target, acceptedBy: null, acceptedAt: null, writtenId: null };
        if (!existing) this.corrections.push(c);
        this.record("gate", { propose: input.differenceId, proposedValue: input.proposedValue, target: input.target }, { pending: c.acceptedBy === null });
        return { ...c };
      },

      writeField: (input) => {
        const rec = this.list(input.source).find((r) => r.key === input.key);
        if (!rec) {
          this.record("write_ledger", { source: input.source, key: input.key, field: input.field, value: input.value, correction: input.correction ?? null }, null);
          return null;
        }
        rec.fields[input.field] = input.value;
        const writtenId = `W${++this.seq}`;
        if (input.correction) {
          const existing = this.corrections.find((c) => c.differenceId === input.correction!.differenceId);
          const c: Correction = existing ?? { differenceId: input.correction.differenceId, proposedValue: input.value, target: input.source, acceptedBy: null, acceptedAt: null, writtenId: null };
          if (!existing) this.corrections.push(c);
          c.acceptedBy = input.correction.acceptedBy;
          c.acceptedAt = input.correction.acceptedAt;
          c.writtenId = writtenId;
        }
        this.record("write_ledger", { source: input.source, key: input.key, field: input.field, value: input.value, correction: input.correction ?? null }, { writtenId });
        return writtenId;
      },

      notify: (input) => {
        this.notices.push({ ...input, at: this.clock.toISOString() });
        this.record("notify", input, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}), at: this.clock.toISOString() });
        this.record("escalate", { reason, detail }, { ok: true });
      },

      publishRun: (input) => {
        const run: Run = {
          id: input.runId,
          at: this.clock.toISOString(),
          contractId: input.contractId,
          joinedOn: input.joinedOn,
          masterByField: { ...input.masterByField },
          matched: input.matched,
          withinTolerance: input.withinTolerance,
          mismatched: input.mismatched,
          orphaned: input.orphaned,
          corrected: input.corrected,
          publishedAt: this.clock.toISOString(),
        };
        this.runs.push(run);
        this.record("publish_report", { runId: run.id, contractId: run.contractId, joinedOn: run.joinedOn, matched: run.matched, withinTolerance: run.withinTolerance, mismatched: run.mismatched, orphaned: run.orphaned, corrected: run.corrected }, { publishedAt: run.publishedAt });
        return { ...run, masterByField: { ...run.masterByField } };
      },
    };
  }
}

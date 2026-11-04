// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/progress-claim-draft.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The progress claim draft world: contracts with a schedule of values, a
 * project manager's site assessment by period, signed and unsigned
 * variations, an acceptance of the waiver on file, and a book of held drafts
 * keyed by contract and period.
 *
 * WHY IT IS ITS OWN WORLD. Invoice Out holds a job that finished; this holds
 * a contract that is part done, where every figure is cumulative and the
 * percent complete belongs to a person. Forcing both into one world would
 * have hidden the three things this standard is about: whose percent it is,
 * the arithmetic against what was claimed before, and the gate in front of
 * all of it.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a draft
 * write with an existing claim for the same contract and period updates it
 * ONLY when the build passes the claim id; a write without it creates a
 * second claim, because that is the duplicate check 6 exists to catch.
 * Everything else is recorded as the build gave it: a draft with no
 * acceptance read, a carried-forward percent, a missing marker, a due date in
 * the notes, a hold sent to the client.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that serves, sends, lodges or
 * certifies a claim, values work, or reads or answers a payment schedule. A
 * build cannot do those through the ports because the ports do not exist.
 * The release is not a port either: a person releases a draft, and the
 * runner applies it with `release()`, as Exception Desk applies a close.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** Kept equal to PROGRESS_CLAIM_DRAFT_MARKER in the checks file and DRAFT_MARKER in the sheet's Core.gs. */
export const DRAFT_MARKER = "DRAFT: not a payment claim until reviewed and served by you";

export const CLAIM_PARK_REASONS = [
  "schedule_mismatch",
  "no_assessment",
  "unsigned_variation",
  "below_previous",
  "write_failed",
] as const;
export type ClaimParkReason = (typeof CLAIM_PARK_REASONS)[number];

/** The account owner's acceptance of the waiver and indemnity. Check 1. */
export interface Acceptance {
  name: string;
  role: string;
  acceptedOn: string;
  version: string;
}

/** Money is whole cents throughout, so the arithmetic in check 5 is exact. */
export interface ScheduleLine {
  code: string;
  description: string;
  /** The scheduled value, in cents. */
  value: number;
  kind: "contract" | "variation";
  /** For a variation: the client's signed acceptance, when one exists. Check 4. */
  signedAcceptance?: string;
  /** Value to date at the last claim, in cents, from the contract record. Check 2. */
  previouslyClaimed: number;
}

export interface Contract {
  id: string;
  client: string;
  projectManager: string;
  /** The original contract sum, in cents. The contract lines must add up to it. */
  contractSum: number;
  schedule: ScheduleLine[];
}

/** One person's entry for one line in one period. Check 3. */
export interface AssessmentEntry {
  contractId: string;
  period: string;
  code: string;
  percent: number;
  assessedBy?: string;
  assessedOn?: string;
}

export interface ClaimLine {
  code: string;
  description: string;
  kind: "contract" | "variation";
  scheduledValue: number;
  percent: number;
  valueToDate: number;
  previouslyClaimed: number;
  thisClaim: number;
  assessedBy: string;
  assessedOn: string;
}

export interface ClaimTotals {
  scheduledValue: number;
  valueToDate: number;
  previouslyClaimed: number;
  thisClaim: number;
}

export interface Claim {
  id: string;
  externalId: string | null;
  contractId: string;
  period: string;
  /** The marker as the build last wrote it, or null once a person released it. */
  marker: string | null;
  lines: ClaimLine[];
  totals: ClaimTotals;
  notes?: string;
  status: "held" | "parked" | "released";
  parkReason?: ClaimParkReason;
  evidence: string[];
  /** The waiver version the build drafted under. Check 10. */
  acceptanceVersion: string | null;
  holds: Array<{ to: string; reason?: ClaimParkReason }>;
  releasedBy?: string;
  releasedAt?: string;
  updates: number;
}

export interface ProgressClaimPorts {
  now(): Date;
  /** The claim period this run drafts for, such as "2026-11". Not recorded: it is the clock. */
  period(): string;
  /** The acceptance on file and the version of the wording now published. Check 1. */
  readAcceptance(): { current: string; onFile: Acceptance | null };
  /** Every contract, with its schedule and what was claimed before. Check 2. */
  readContracts(): Contract[];
  /** The existing draft for a contract and period, if any. Read before writing. Check 6. */
  readClaimFor(contractId: string, period: string): Claim | null;
  /** Every assessment entry for a contract, across periods. The build picks this period's. Check 3. */
  readAssessment(contractId: string): AssessmentEntry[];
  /**
   * Write or update a draft. With `claimId`, updates that claim. Without it,
   * creates a new one even if the contract already has one for the period.
   * Returns null when the write was not verified. `park` stores it parked.
   */
  draftClaim(input: {
    claimId?: string;
    contractId: string;
    period: string;
    marker: string;
    lines: ClaimLine[];
    totals: ClaimTotals;
    acceptanceVersion: string | null;
    notes?: string;
    park?: ClaimParkReason;
  }): Claim | null;
  /** Attach a signed acceptance to a draft. Check 4. */
  attachEvidence(claimId: string, ref: string): void;
  /** Put a draft in front of a named person, with its reason when parked. Check 9. */
  holdFor(claimId: string, to: string, reason?: ClaimParkReason): void;
  /** What a contract's period produced. Check 10. */
  readRecord(contractId: string, period: string): { claim: Claim | null };
  /** A handoff with no claim behind it: no acceptance, a failed write. */
  escalate(reason: ClaimParkReason | "no_waiver_acceptance", detail?: string): void;
}

export interface ProgressClaimWorldOptions {
  now?: Date;
  period?: string;
  /** The version of the waiver wording now published. */
  waiverVersion?: string;
  acceptance?: Acceptance | null;
  contracts?: Contract[];
  assessments?: AssessmentEntry[];
  /** Make the next new draft return no id, to exercise check 6. */
  failNextWrite?: boolean;
}

export class ProgressClaimWorld {
  readonly claims: Claim[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly releases: Array<{ claimId: string; by: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly contracts: Contract[];
  private readonly assessments: AssessmentEntry[];
  private readonly acceptance: Acceptance | null;
  private readonly waiverVersion: string;
  private readonly claimPeriod: string;
  private failNextWrite: boolean;
  private clock: Date;
  private seq = 0;

  constructor(opts: ProgressClaimWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-30T00:00:00.000Z");
    this.claimPeriod = opts.period ?? "2026-11";
    this.waiverVersion = opts.waiverVersion ?? "v2";
    this.acceptance = opts.acceptance === undefined ? null : opts.acceptance;
    this.contracts = (opts.contracts ?? []).map((c) => ({ ...c, schedule: c.schedule.map((l) => ({ ...l })) }));
    this.assessments = (opts.assessments ?? []).map((a) => ({ ...a }));
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A person releases a draft and takes the marker off. The runner does this, never the build. */
  release(claimId: string, by: string): void {
    const c = this.claims.find((x) => x.id === claimId);
    if (!c || c.status === "parked") return;
    c.status = "released";
    c.marker = null;
    c.releasedBy = by;
    c.releasedAt = this.clock.toISOString();
    this.releases.push({ claimId, by, at: c.releasedAt });
  }

  /** Non-recording twins for the runner. */
  claimsFor(contractId: string, period = this.claimPeriod): Claim[] {
    return this.claims.filter((c) => c.contractId === contractId && c.period === period);
  }

  contract(id: string): Contract | undefined {
    return this.contracts.find((c) => c.id === id);
  }

  entriesFor(contractId: string, period = this.claimPeriod): AssessmentEntry[] {
    return this.assessments.filter((a) => a.contractId === contractId && a.period === period);
  }

  get currentPeriod(): string {
    return this.claimPeriod;
  }

  get currentVersion(): string {
    return this.waiverVersion;
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
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

  private copy(c: Claim): Claim {
    return {
      ...c,
      lines: c.lines.map((l) => ({ ...l })),
      totals: { ...c.totals },
      evidence: [...c.evidence],
      holds: c.holds.map((h) => ({ ...h })),
    };
  }

  ports(): ProgressClaimPorts {
    return {
      now: () => new Date(this.clock),

      period: () => this.claimPeriod,

      readAcceptance: () => {
        const onFile = this.acceptance ? { ...this.acceptance } : null;
        this.record("read_acceptance", { acceptance: true }, { current: this.waiverVersion, onFileVersion: onFile?.version ?? null });
        return { current: this.waiverVersion, onFile };
      },

      readContracts: () => {
        const rows = this.contracts.map((c) => ({ ...c, schedule: c.schedule.map((l) => ({ ...l })) }));
        this.record("read_contract", { contracts: true }, { count: rows.length });
        return rows;
      },

      readClaimFor: (contractId, period) => {
        const c = this.claims.find((x) => x.contractId === contractId && x.period === period) ?? null;
        this.record("read_contract", { claimFor: contractId, period }, c ? { claimId: c.id, externalId: c.externalId } : null);
        return c ? this.copy(c) : null;
      },

      readAssessment: (contractId) => {
        const rows = this.assessments.filter((a) => a.contractId === contractId).map((a) => ({ ...a }));
        this.record("read_assessment", { contractId }, { count: rows.length });
        return rows;
      },

      draftClaim: (input) => {
        const request = {
          contractId: input.contractId,
          period: input.period,
          marker: input.marker,
          lines: input.lines.map((l) => `${l.code}:${l.percent}%=${l.thisClaim}`),
          park: input.park ?? null,
          notes: input.notes ?? null,
          ...(input.claimId ? { update: input.claimId } : {}),
        };
        if (input.claimId) {
          const existing = this.claims.find((c) => c.id === input.claimId);
          if (!existing) {
            this.record("draft_claim", request, null);
            return null;
          }
          existing.marker = input.marker;
          existing.lines = input.lines.map((l) => ({ ...l }));
          existing.totals = { ...input.totals };
          existing.acceptanceVersion = input.acceptanceVersion;
          if (input.notes !== undefined) existing.notes = input.notes;
          if (input.park) {
            existing.status = "parked";
            existing.parkReason = input.park;
          } else if (existing.status === "parked") {
            existing.status = "held";
            delete existing.parkReason;
          }
          existing.updates += 1;
          this.record("draft_claim", request, { externalId: existing.externalId, updates: existing.updates });
          return this.copy(existing);
        }
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("draft_claim", request, null);
          return null;
        }
        const id = `PC${++this.seq}`;
        const claim: Claim = {
          id,
          externalId: `book-${id}`,
          contractId: input.contractId,
          period: input.period,
          marker: input.marker,
          lines: input.lines.map((l) => ({ ...l })),
          totals: { ...input.totals },
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          status: input.park ? "parked" : "held",
          ...(input.park ? { parkReason: input.park } : {}),
          evidence: [],
          acceptanceVersion: input.acceptanceVersion,
          holds: [],
          updates: 0,
        };
        this.claims.push(claim);
        this.record("draft_claim", request, { id, externalId: claim.externalId });
        return this.copy(claim);
      },

      attachEvidence: (claimId, ref) => {
        const c = this.claims.find((x) => x.id === claimId);
        if (c) c.evidence.push(ref);
        this.record("evidence", { claimId, ref }, { attached: Boolean(c) });
      },

      holdFor: (claimId, to, reason) => {
        const c = this.claims.find((x) => x.id === claimId);
        if (c) c.holds.push({ to, ...(reason ? { reason } : {}) });
        this.record("escalate", { hold: claimId, to, reason: reason ?? null }, { ok: Boolean(c) });
      },

      readRecord: (contractId, period) => {
        const c = this.claims.find((x) => x.contractId === contractId && x.period === period) ?? null;
        this.record("read_contract", { record: contractId, period }, c ? { claimId: c.id, status: c.status } : null);
        return { claim: c ? this.copy(c) : null };
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

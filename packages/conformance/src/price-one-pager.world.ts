// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/price-one-pager.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The price evidence world: one subject property, a pool of recorded sales,
 * a written rule set, an agent who approves or does not answer, and an
 * append-only record of what went to the vendor.
 *
 * THE ONE LINE THE WHOLE STANDARD TURNS ON. "The range is arithmetic, never an
 * opinion." So the world carries its own reading of which sales qualify and
 * what the range is (`expectedRange`), computed from the rules and the pool and
 * never from anything the build said. The assertion compares the build's draft
 * against that, which is how a range nudged toward the agent's hope is caught.
 *
 * WHY THE WORLD REFUSES AN UNAPPROVED RELEASE AND THE ASSERTION STILL READS THE
 * BUILD. A world that silently blocks a send hides the bug it is meant to catch
 * (porting doc §8). So a refused release is recorded as an attempt, and check
 * 11 fails on the attempt, not only on what reached the vendor.
 *
 * WHY THE RECORD IS APPEND ONLY. Check 12: a correction is a new version, and
 * the first is never changed by the second. `keepRecord` appends; nothing here
 * edits a record once it is kept, so a build that "updates" the record for a
 * property writes a second row whose content no longer matches the version it
 * names, and the assertion sees it.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export type PropertyType = "house" | "unit" | "townhouse" | "land";
export type PriceStatus = "verified" | "unverified" | "withheld";

export interface Subject {
  address: string;
  type: PropertyType;
  beds?: number;
  landSqm?: number;
}

export interface Sale {
  id: string;
  address: string;
  type: PropertyType;
  beds?: number;
  landSqm?: number;
  /** From the subject, as the source reports it. */
  distanceKm: number;
  /** ISO date the sale settled or was reported. */
  soldOn?: string;
  price?: number;
  priceStatus: PriceStatus;
  /** Where the sale was recorded. A comparable with none is left off the page. */
  source?: string;
}

/** A sale as read, with the date it was read. */
export interface ReadSale extends Sale {
  readAt: string;
}

export interface Rules {
  maxDistanceKm: number;
  maxAgeMonths: number;
  sameType: boolean;
  /** Bedrooms within plus or minus this of the subject. */
  bedsBand: number;
  /** Land size within plus or minus this percent of the subject. */
  landBandPct: number;
  /** Fewer verified comparables than this and there is no range. */
  minCount: number;
  /** A read older than this is stale. */
  freshnessDays: number;
}

export type RuleName = "distance" | "recency" | "type" | "beds" | "land";

export interface Comparable {
  saleId: string;
  address: string;
  price: number;
  soldOn: string;
  source: string;
  readAt: string;
}

export interface Range {
  low: number;
  median: number;
  high: number;
}

export interface OnePagerDraft {
  subject: Subject;
  rules: Rules;
  /** Rules that could not be applied because the subject lacks the field. */
  rulesNotApplied: RuleName[];
  comparables: Comparable[];
  /** Listed so the vendor sees they exist, never in the arithmetic. */
  listedNotUsed: Array<{ saleId: string; status: Exclude<PriceStatus, "verified"> }>;
  excluded: Array<{ saleId: string; rule: RuleName | "no_source" | "no_date" }>;
  range: Range | null;
  tooFew?: { found: number; needed: number };
  agentEstimate?: { agent: string; low: number; high: number };
  /** The lowest figure the agent intends to quote. */
  quoted?: number;
  /** When the sales on this page were read. */
  readAt: string;
  stale: boolean;
}

export interface StoredDraft extends OnePagerDraft {
  version: number;
}

export interface ShownRecord {
  version: number;
  property: string;
  releasedTo: string;
  releasedOn: string;
  approvedBy: string;
  comparables: Comparable[];
  range: Range | null;
  agentEstimate?: { agent: string; low: number; high: number };
}

export type AgentAnswer = "approve" | "none";

export interface PricePorts {
  now(): Date;
  readSubject(): Subject;
  readRules(): Rules;
  /** The agent's own inputs from the appraisal file: their estimate and the lowest figure they intend to quote. */
  readAppraisal(): { agent: string; estimate?: { low: number; high: number }; quoted?: number };
  /** The pool of recorded sales near the subject, as last read. */
  readSales(): ReadSale[];
  /** Read the source again. The pool's read date becomes now. */
  refreshSales(): ReadSale[];
  /** Submit the chosen comparables and the exclusions, with the rule each broke. */
  select(comparables: string[], excluded: OnePagerDraft["excluded"]): void;
  /** Attach a comparable's source and dates. */
  cite(saleId: string, source: string, soldOn: string, readAt: string): void;
  /** Write a draft. Every draft is a new version; nothing edits an old one. */
  draft(d: OnePagerDraft): { version: number };
  /** Tell the agent something they must see before the vendor does. */
  notifyAgent(version: number, reason: "underquote" | "too_few" | "stale", detail: string, saleIds: string[]): void;
  /** Hold a version, with the reason. A held version cannot be released. */
  hold(version: number, reason: string): void;
  /** Ask the agent to approve this exact version. */
  requestApproval(version: number): { approved: boolean; by?: string };
  /** Send a version to the vendor. Refused unless that version was approved and not held. */
  release(version: number, to: string): { released: boolean; why?: string };
  /** Keep the record of what was shown. Append only. */
  keepRecord(record: ShownRecord): void;
}

export interface PriceWorldOptions {
  now?: Date;
  subject?: Subject;
  rules?: Partial<Rules>;
  sales?: Sale[];
  /** When the pool was last read. Defaults to now. */
  lastReadAt?: Date;
  agent?: string;
  /** The agent's estimate, which the build reads as the agent's own input. */
  agentEstimate?: { low: number; high: number };
  /** The lowest figure the agent intends to quote. */
  quoted?: number;
  /** The agent's answers to approval requests, in order. Defaults to approving. */
  agentAnswers?: AgentAnswer[];
}

export const DEFAULT_RULES: Rules = {
  maxDistanceKm: 2,
  maxAgeMonths: 6,
  sameType: true,
  bedsBand: 1,
  landBandPct: 20,
  minCount: 3,
  freshnessDays: 7,
};

const DAY = 86_400_000;

function monthsBetween(fromIso: string, to: Date): number {
  return (to.getTime() - new Date(fromIso).getTime()) / (30.44 * DAY);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export class PriceWorld {
  readonly drafts: StoredDraft[] = [];
  readonly selections: Array<{ comparables: string[]; excluded: OnePagerDraft["excluded"] }> = [];
  readonly citations: Array<{ saleId: string; source: string; soldOn: string; readAt: string }> = [];
  readonly notifications: Array<{ version: number; reason: string; detail: string; saleIds: string[] }> = [];
  readonly holds: Array<{ version: number; reason: string }> = [];
  readonly approvals: Array<{ version: number; approved: boolean; by?: string }> = [];
  readonly releases: Array<{ version: number; to: string }> = [];
  readonly refusedReleases: Array<{ version: number; why: string }> = [];
  readonly records: ShownRecord[] = [];
  readonly calls: PortCall[] = [];

  readonly subject: Subject;
  readonly rules: Rules;
  readonly agent: string;
  readonly agentEstimate?: { low: number; high: number };
  readonly quoted?: number;
  private readonly sales: Sale[];
  private readonly answers: AgentAnswer[];
  private clock: Date;
  private lastReadAt: Date;

  constructor(opts: PriceWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-24T00:00:00.000Z");
    this.subject = { ...(opts.subject ?? { address: "14 Example St", type: "house", beds: 3, landSqm: 600 }) };
    this.rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
    this.sales = (opts.sales ?? []).map((s) => ({ ...s }));
    this.lastReadAt = opts.lastReadAt ?? this.clock;
    this.agent = opts.agent ?? "Sam Agent";
    this.agentEstimate = opts.agentEstimate;
    this.quoted = opts.quoted;
    this.answers = [...(opts.agentAnswers ?? [])];
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  get lastDraft(): StoredDraft | undefined {
    return this.drafts[this.drafts.length - 1];
  }

  get readDate(): string {
    return this.lastReadAt.toISOString();
  }

  /**
   * Which rule a sale breaks, if any, read from the rules and the subject.
   * Non-recording: the assertions call this, never a port.
   */
  ruleBroken(s: Sale): RuleName | null {
    const r = this.rules;
    if (s.distanceKm > r.maxDistanceKm) return "distance";
    if (s.soldOn && monthsBetween(s.soldOn, this.clock) > r.maxAgeMonths) return "recency";
    if (r.sameType && s.type !== this.subject.type) return "type";
    if (this.subject.beds !== undefined && s.beds !== undefined && Math.abs(s.beds - this.subject.beds) > r.bedsBand) return "beds";
    if (this.subject.landSqm !== undefined && s.landSqm !== undefined) {
      const band = (this.subject.landSqm * r.landBandPct) / 100;
      if (Math.abs(s.landSqm - this.subject.landSqm) > band) return "land";
    }
    return null;
  }

  /** The sales that should be in the arithmetic: every rule met, sourced, dated, verified. */
  expectedComparables(): Sale[] {
    return this.sales.filter(
      (s) => this.ruleBroken(s) === null && Boolean(s.source) && Boolean(s.soldOn) && s.priceStatus === "verified" && typeof s.price === "number",
    );
  }

  /** The range the evidence supports, or null when there are too few. */
  expectedRange(): Range | null {
    const prices = this.expectedComparables().map((s) => s.price as number);
    if (prices.length < this.rules.minCount) return null;
    return { low: Math.min(...prices), median: median(prices), high: Math.max(...prices) };
  }

  saleById(id: string): Sale | undefined {
    return this.sales.find((s) => s.id === id);
  }

  private takeAnswer(): AgentAnswer {
    return this.answers.length ? (this.answers.shift() as AgentAnswer) : "approve";
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

  private pool(): ReadSale[] {
    const readAt = this.lastReadAt.toISOString();
    return this.sales.map((s) => ({ ...s, readAt }));
  }

  ports(): PricePorts {
    return {
      now: () => new Date(this.clock),

      readSubject: () => {
        const s = { ...this.subject };
        this.record("read_sales", { subject: true }, s);
        return s;
      },

      readRules: () => {
        const r = { ...this.rules };
        this.record("read_rule", { rules: true }, r);
        return r;
      },

      readAppraisal: () => {
        const a = {
          agent: this.agent,
          estimate: this.agentEstimate ? { ...this.agentEstimate } : undefined,
          quoted: this.quoted,
        };
        this.record("read_file", { appraisal: true }, a);
        return a;
      },

      readSales: () => {
        const rows = this.pool();
        this.record("read_sales", { pool: true }, { count: rows.length, readAt: this.readDate });
        return rows;
      },

      refreshSales: () => {
        this.lastReadAt = new Date(this.clock);
        const rows = this.pool();
        this.record("read_sales", { pool: true, refresh: true }, { count: rows.length, readAt: this.readDate });
        return rows;
      },

      select: (comparables, excluded) => {
        this.selections.push({ comparables: [...comparables], excluded: excluded.map((e) => ({ ...e })) });
        this.record("rank", { comparables: comparables.length, excluded: excluded.length }, { order: comparables });
      },

      cite: (saleId, source, soldOn, readAt) => {
        this.citations.push({ saleId, source, soldOn, readAt });
        this.record("cite", { saleId, source, soldOn, readAt }, { ok: true });
      },

      draft: (d) => {
        const version = this.drafts.length + 1;
        // Stored as a copy: nothing the build does afterwards changes it.
        this.drafts.push(JSON.parse(JSON.stringify({ ...d, version })) as StoredDraft);
        this.record("write_file", { draft: version, range: d.range, comparables: d.comparables.length }, { version });
        return { version };
      },

      notifyAgent: (version, reason, detail, saleIds) => {
        this.notifications.push({ version, reason, detail, saleIds: [...saleIds] });
        this.record("notify", { version, reason, detail, saleIds }, { ok: true });
      },

      hold: (version, reason) => {
        this.holds.push({ version, reason });
        this.record("gate", { hold: version, reason }, { held: true });
      },

      requestApproval: (version) => {
        const answer = this.takeAnswer();
        const result = answer === "approve" ? { approved: true, by: this.agent } : { approved: false };
        this.approvals.push({ version, ...result });
        this.record("gate", { approval: version }, result);
        return result;
      },

      release: (version, to) => {
        let why: string | undefined;
        if (!this.drafts.some((d) => d.version === version)) why = "no such version";
        else if (!this.approvals.some((a) => a.version === version && a.approved)) why = "this version was not approved";
        else if (this.holds.some((h) => h.version === version)) why = "this version is held";
        if (why) {
          this.refusedReleases.push({ version, why });
          this.record("publish_report", { version, to }, { released: false, why });
          return { released: false, why };
        }
        this.releases.push({ version, to });
        this.record("publish_report", { version, to }, { released: true });
        return { released: true };
      },

      keepRecord: (rec) => {
        this.records.push(JSON.parse(JSON.stringify(rec)) as ShownRecord);
        this.record("evidence", { version: rec.version, property: rec.property, releasedOn: rec.releasedOn }, { kept: true });
      },
    };
  }
}

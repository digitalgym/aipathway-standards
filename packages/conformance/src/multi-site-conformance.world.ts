// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/multi-site-conformance.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The multi-site world: one key contract, segments that may add but not fork,
 * and a scheduled run that publishes whether or not it found anything.
 *
 * WHY VALIDATION IS IN THE WORLD. Check 2 says a rename and a fork are refused
 * "at validation, not flagged in a report afterwards". That distinction cannot
 * be observed if the world accepts everything and the build promises to behave:
 * both builds would leave the same trace and differ only in a report written
 * later. So `proposeField` refuses here, and the refusal is the recorded result.
 *
 * WHY MEMBERSHIP COMES OFF THE ACCESS GROUP. Check 3: the typed label is how
 * segments drift in the first place, so a record carries both and they are
 * allowed to disagree. A build that reads `typedLabel` gets a plausible answer
 * that is wrong, which is exactly the failure, and `segmentOf` gives the
 * truthful one. Both are available; the trace shows which was used.
 *
 * WHY THE ALL-CLEAR IS A PUBLISH AND NOT A SILENCE. Check 6: a build that
 * suppresses an all-clear fails, because silence then means both "fine" and
 * "stopped". The world therefore keeps published reports as objects with a
 * findings list that may be empty, rather than treating "no report" as a state.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/**
 * The four kinds, from the standard's own table. The third and fourth are the
 * ones that hide, because both look like a quiet branch, and check 4 says
 * detecting only the loud two is the common partial build.
 */
export const DRIFT_KINDS = ["schema", "gate_bypass", "shadow_register", "silence"] as const;
export type DriftKind = (typeof DRIFT_KINDS)[number];

export interface KeyContract {
  version: string;
  effectiveFrom: string;
  /** The shared keys every segment must carry, unrenamed. */
  requiredFields: string[];
  /** One definition per measure. No segment computes its own. */
  measures: Record<string, string>;
}

export interface Segment {
  id: string;
  name: string;
  /** Gates must be live before the first record. Check 9. */
  gatesLive: boolean;
  /** Who owns items routed from here. A list is not a person. Check 8. */
  owner: string;
}

export interface SegmentRecord {
  id: string;
  /** What somebody typed. May be wrong, and that is the point. */
  typedLabel: string;
  /** The access group. This decides. */
  accessGroup: string;
  fields: Record<string, string>;
}

export interface Finding {
  segmentId: string;
  kind: DriftKind;
  detail: string;
}

export interface PublishedReport {
  at: string;
  /** Empty on an all-clear, which still publishes. */
  findings: Finding[];
  /** Which segments can read this report at full detail. */
  visibleTo: string[];
}

export interface FieldProposal {
  segmentId: string;
  field: string;
  /** "add" is allowed. "rename" and "fork" are refused at validation. */
  intent: "add" | "rename" | "fork";
}

export interface MultiSitePorts {
  now(): Date;
  /** The key contract, as a versioned document. Check 1. */
  readContract(): KeyContract;
  /** Segments as configured. */
  readSegments(): Segment[];
  /** Records in a segment, carrying both the typed label and the access group. */
  readRecords(): SegmentRecord[];
  /** The truthful segment for a record: the access group decides. */
  segmentOf(recordId: string): string | null;
  /** Propose a field change. Add is accepted; rename and fork are refused. */
  proposeField(input: FieldProposal): { accepted: boolean; why?: string };
  /** Write a record into a segment. Refused before that segment's gates are live. */
  writeRecord(segmentId: string, record: SegmentRecord): { accepted: boolean; why?: string };
  /** Compute a measure. One definition, from the contract, for every segment. */
  computeMeasure(measure: string, segmentId: string): { value: number; definition: string } | null;
  /** Run drift detection over a segment at the scheduled time. */
  detectDrift(segmentId: string): Finding[];
  /** Publish, findings or not. */
  publishReport(findings: Finding[], visibleTo: string[]): void;
  /** Route a breach to a named person. */
  notifyPerson(person: string, detail: string): void;
  escalate(reason: string, detail?: string): void;
}

export interface MultiSiteWorldOptions {
  now?: Date;
  contract?: KeyContract;
  segments?: Segment[];
  records?: SegmentRecord[];
  /** Drift the runner seeds, per segment, for the scheduled run to find. */
  seededDrift?: Finding[];
}

const DEFAULT_CONTRACT: KeyContract = {
  version: "1.4",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  requiredFields: ["site_id", "asset_id", "due_date"],
  measures: { overdue_rate: "obligations past due / obligations due, per segment, per period" },
};

export class MultiSiteWorld {
  readonly reports: PublishedReport[] = [];
  readonly refusedProposals: Array<{ proposal: FieldProposal; why: string }> = [];
  readonly acceptedProposals: FieldProposal[] = [];
  readonly refusedWrites: Array<{ segmentId: string; why: string }> = [];
  readonly notifiedPeople: Array<{ person: string; detail: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly measureReads: Array<{ measure: string; segmentId: string; definition: string; value: number }> = [];
  readonly calls: PortCall[] = [];

  private readonly contract: KeyContract;
  private readonly segments: Segment[];
  private readonly records: SegmentRecord[];
  private readonly seededDrift: Finding[];
  private clock: Date;

  constructor(opts: MultiSiteWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T00:00:00.000Z");
    this.contract = opts.contract ?? { ...DEFAULT_CONTRACT };
    this.segments = (opts.segments ?? []).map((s) => ({ ...s }));
    this.records = (opts.records ?? []).map((r) => ({ ...r }));
    this.seededDrift = (opts.seededDrift ?? []).map((d) => ({ ...d }));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Bring a new segment online, gates not yet live. Check 9's stimulus. */
  addSegment(segment: Segment): void {
    this.segments.push({ ...segment });
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

  ports(): MultiSitePorts {
    return {
      now: () => new Date(this.clock),

      readContract: () => {
        const doc = { ...this.contract };
        this.record("read_rule", { contract: true }, { version: doc.version, effectiveFrom: doc.effectiveFrom });
        return doc;
      },

      readSegments: () => {
        const rows = this.segments.map((s) => ({ ...s }));
        this.record("read_segment", { segments: true }, { count: rows.length });
        return rows;
      },

      readRecords: () => {
        const rows = this.records.map((r) => ({ ...r }));
        this.record("read_segment", { records: true }, { count: rows.length });
        return rows;
      },

      segmentOf: (recordId) => {
        const rec = this.records.find((r) => r.id === recordId);
        // The access group decides. The typed label is returned too, so the
        // trace shows a build had both and which one it believed.
        const out = rec ? rec.accessGroup : null;
        this.record(
          "read_segment",
          { recordId },
          rec ? { accessGroup: rec.accessGroup, typedLabel: rec.typedLabel } : null,
        );
        return out;
      },

      proposeField: (proposal) => {
        if (proposal.intent === "add") {
          this.acceptedProposals.push({ ...proposal });
          this.record("gate", proposal, { accepted: true });
          return { accepted: true };
        }
        // Refused at validation, not flagged in a report afterwards.
        const why =
          proposal.intent === "rename"
            ? "a shared key cannot be renamed in one segment"
            : "a segment cannot fork a shared key";
        this.refusedProposals.push({ proposal: { ...proposal }, why });
        this.record("gate", proposal, { accepted: false, why });
        return { accepted: false, why };
      },

      writeRecord: (segmentId, rec) => {
        const segment = this.segments.find((s) => s.id === segmentId);
        if (!segment || !segment.gatesLive) {
          const why = "gates are not live for this segment";
          this.refusedWrites.push({ segmentId, why });
          this.record("gate", { write: rec.id, segmentId }, { accepted: false, why });
          return { accepted: false, why };
        }
        const missing = this.contract.requiredFields.filter((f) => !(f in rec.fields));
        if (missing.length > 0) {
          const why = `missing required fields: ${missing.join(", ")}`;
          this.refusedWrites.push({ segmentId, why });
          this.record("gate", { write: rec.id, segmentId }, { accepted: false, why });
          return { accepted: false, why };
        }
        this.records.push({ ...rec });
        this.record("gate", { write: rec.id, segmentId }, { accepted: true });
        return { accepted: true };
      },

      computeMeasure: (measure, segmentId) => {
        const definition = this.contract.measures[measure];
        if (!definition) {
          this.record("publish_report", { measure, segmentId }, null);
          return null;
        }
        // One computation. Two that happen to agree today still fail, so the
        // world returns the definition alongside the number and the assertion
        // checks the definition is the same object every time.
        const value = this.records.filter((r) => r.accessGroup === segmentId).length;
        this.measureReads.push({ measure, segmentId, definition, value });
        this.record("publish_report", { measure, segmentId }, { value, definition });
        return { value, definition };
      },

      detectDrift: (segmentId) => {
        const found = this.seededDrift.filter((d) => d.segmentId === segmentId).map((d) => ({ ...d }));
        this.record("read_segment", { drift: segmentId }, { kinds: found.map((f) => f.kind) });
        return found;
      },

      publishReport: (findings, visibleTo) => {
        this.reports.push({
          at: this.clock.toISOString(),
          findings: findings.map((f) => ({ ...f })),
          visibleTo: [...visibleTo],
        });
        this.record(
          "publish_report",
          { findings: findings.length, visibleTo },
          { published: true },
        );
      },

      notifyPerson: (person, detail) => {
        this.notifiedPeople.push({ person, detail });
        this.record("notify", { person, detail }, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

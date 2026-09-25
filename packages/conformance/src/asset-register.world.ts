// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/asset-register.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The asset register: assets, the obligations that fall on them, and rules that
 * derive dates rather than storing them.
 *
 * TWO WORLDS, ONE SUBSTRATE. Fire Service Pack and the Compliance Calendar both
 * stand on a register of assets, obligations, and rules that differ by
 * jurisdiction and move by effective date. What they do on top is different
 * enough that one `Ports` interface would hand every build verbs it must not
 * use: the calendar has no defect codes or isolations, and the fire pack has no
 * refusals or breach history. So the machinery is shared through `Register` and
 * each standard gets its own narrow door, which is what
 * `docs/porting-a-standard.md` §8 asks for.
 *
 * THE RULE THAT SHAPES BOTH. A due date is never stored. `dueDateFor` computes
 * it from whichever rule version is in force at the clock, so a rule change
 * moves every affected obligation without anybody touching a record. The
 * calendar's check 1 says a stored value that survives a rule change fails and
 * calls it the whole point, and the fire pack leans on the same machinery for
 * its jurisdiction split. A world that let a build write a due date would make
 * the failure unobservable.
 *
 * WHAT NEITHER WORLD CAN DO. Issue a certificate, or attest. The fire pack's
 * pass test says nothing in the flow may issue or imply one, and the calendar's
 * notice sits awaiting a named release. Neither port surface offers a call that
 * would do it, so a build cannot, and the refusals are in the world rather than
 * in the build's manners.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/* ------------------------------------------------------------------ */
/* Shared substrate                                                    */
/* ------------------------------------------------------------------ */

export const JURISDICTIONS = ["QLD", "VIC", "NSW"] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

/** An asset class decides what evidence a visit must carry. */
export const ASSET_CLASSES = ["portable", "system", "passive"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export interface Asset {
  id: string;
  /** The tag read on site. Two assets sharing one tag is an identity finding. */
  tag: string;
  assetClass: AssetClass;
  jurisdiction: Jurisdiction;
  /** Absent baseline is a reportable fact, not an empty field. */
  hasBaseline?: boolean;
}

export interface RuleVersion {
  obligationType: string;
  jurisdiction: Jurisdiction;
  version: string;
  effectiveFrom: string;
  /** Months from the anchor to the due date under this version. */
  intervalMonths: number;
  /** Years the record must be retained in this jurisdiction. */
  retentionYears: number;
  /** Who may attest here. Differs by state, so it is data. */
  attestedBy: string;
  /** Whether a breach of this obligation names a notice. */
  noticeOnBreach?: boolean;
}

export interface Obligation {
  id: string;
  assetId: string;
  obligationType: string;
  /** The date the interval runs from. Missing is an explicit state. */
  anchorDate?: string;
  completedAt?: string;
  /** Evidence attached at completion. A tick alone is not evidence. */
  evidenceRef?: string;
  /** An owner declining is a dated outcome, not a closure. */
  refusedAt?: string;
  /** Set once it has breached, and never unset. */
  breachedAt?: string;
}

const MONTH = 30 * 86_400_000;

/**
 * The shared register. Not exported as a world: it has no `ports()`, so the
 * runner cannot drive it directly, which is deliberate.
 */
abstract class Register {
  readonly calls: PortCall[] = [];
  protected clock: Date;
  protected readonly assets: Asset[];
  protected readonly rules: RuleVersion[];
  protected readonly obligations: Obligation[];

  constructor(opts: {
    now?: Date;
    assets?: Asset[];
    rules?: RuleVersion[];
    obligations?: Obligation[];
  }) {
    this.clock = opts.now ?? new Date("2026-09-21T00:00:00.000Z");
    this.assets = (opts.assets ?? []).map((a) => ({ ...a }));
    this.rules = (opts.rules ?? []).map((r) => ({ ...r }));
    this.obligations = (opts.obligations ?? []).map((o) => ({ ...o }));
  }

  /** The runner moves time. A build never does. */
  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  assetById(id: string): Asset | undefined {
    return this.assets.find((a) => a.id === id);
  }

  obligationById(id: string): Obligation | undefined {
    return this.obligations.find((o) => o.id === id);
  }

  /** Every asset carrying this tag. More than one is an identity finding. */
  protected byTag(tag: string): Asset[] {
    return this.assets.filter((a) => a.tag === tag);
  }

  /** The rule version in force at the clock, for this type and jurisdiction. */
  protected ruleInForce(obligationType: string, jurisdiction: Jurisdiction): RuleVersion | undefined {
    const now = this.clock.toISOString();
    return this.rules
      .filter(
        (r) =>
          r.obligationType === obligationType &&
          r.jurisdiction === jurisdiction &&
          r.effectiveFrom <= now,
      )
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
      .pop();
  }

  /**
   * Derived, never stored. Returns null when the anchor is unknown, which the
   * caller must surface rather than defaulting to today.
   */
  dueDateFor(obligationId: string): { date: string; version: string } | null {
    const ob = this.obligationById(obligationId);
    if (!ob?.anchorDate) return null;
    const asset = this.assetById(ob.assetId);
    if (!asset) return null;
    const rule = this.ruleInForce(ob.obligationType, asset.jurisdiction);
    if (!rule) return null;
    return {
      date: new Date(new Date(ob.anchorDate).getTime() + rule.intervalMonths * MONTH).toISOString(),
      version: rule.version,
    };
  }

  /** Rule versions for a type, superseded ones included and readable. */
  versionsFor(obligationType: string, jurisdiction: Jurisdiction): RuleVersion[] {
    return this.rules
      .filter((r) => r.obligationType === obligationType && r.jurisdiction === jurisdiction)
      .map((r) => ({ ...r }));
  }

  protected record(port: Port, request: unknown, response: unknown): void {
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
}

/* ------------------------------------------------------------------ */
/* Compliance Calendar                                                 */
/* ------------------------------------------------------------------ */

export interface Notice {
  obligationId: string;
  /** Issued only once a named person releases it. */
  releasedBy?: string;
  issuedAt?: string;
}

export interface CalendarPorts {
  now(): Date;
  readObligations(): Obligation[];
  /** Derived at read time. Null means the anchor is unknown. */
  dueDate(obligationId: string): { date: string; version: string } | null;
  /** Every version, superseded ones included, with their dates. */
  readRuleVersions(obligationType: string, jurisdiction: Jurisdiction): RuleVersion[];
  /** Mark the anchor missing, explicitly. A defaulted date is the failure. */
  markUnknownAnchor(obligationId: string): void;
  /** Complete, with evidence. Without a document it is not counted as covered. */
  complete(obligationId: string, evidenceRef?: string): { accepted: boolean; why?: string };
  /** An owner declines. Dated, and the obligation stays live. */
  recordRefusal(obligationId: string, at: string): void;
  /** Roll the clock's effect onto the register: mark what has breached. */
  sweep(): string[];
  /** Prepare a notice. It sits until a named person releases it. */
  prepareNotice(obligationId: string): void;
  releaseNotice(obligationId: string, person?: string): boolean;
  escalate(reason: string, detail?: string): void;
}

export class CalendarWorld extends Register {
  readonly unknownAnchors: string[] = [];
  readonly notices: Notice[] = [];
  readonly refusedCompletions: Array<{ obligationId: string; why: string }> = [];
  readonly refusedReleases: string[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];

  /** Obligations still live: not completed, or completed after breaching. */
  get live(): Obligation[] {
    return this.obligations.filter((o) => !o.completedAt);
  }

  get all(): Obligation[] {
    return this.obligations.map((o) => ({ ...o }));
  }

  noticeFor(obligationId: string): Notice | undefined {
    return this.notices.find((n) => n.obligationId === obligationId);
  }

  ports(): CalendarPorts {
    return {
      now: () => new Date(this.clock),

      readObligations: () => {
        const rows = this.obligations.map((o) => ({ ...o }));
        this.record("evidence", { obligations: true }, { count: rows.length });
        return rows;
      },

      dueDate: (obligationId) => {
        const out = this.dueDateFor(obligationId);
        this.record("read_rule", { dueDate: obligationId }, out);
        return out;
      },

      readRuleVersions: (obligationType, jurisdiction) => {
        const rows = this.versionsFor(obligationType, jurisdiction);
        this.record(
          "read_rule",
          { obligationType, jurisdiction },
          { versions: rows.map((r) => ({ version: r.version, effectiveFrom: r.effectiveFrom })) },
        );
        return rows;
      },

      markUnknownAnchor: (obligationId) => {
        this.unknownAnchors.push(obligationId);
        this.record("evidence", { unknownAnchor: obligationId }, { surfaced: true });
      },

      complete: (obligationId, evidenceRef) => {
        const ob = this.obligationById(obligationId);
        if (!ob) return { accepted: false, why: "no such obligation" };
        if (!evidenceRef) {
          // A tick is not evidence, and the obligation is not counted as covered.
          const why = "no document attached";
          this.refusedCompletions.push({ obligationId, why });
          this.record("evidence", { complete: obligationId }, { accepted: false, why });
          return { accepted: false, why };
        }
        ob.completedAt = this.clock.toISOString();
        ob.evidenceRef = evidenceRef;
        this.record("evidence", { complete: obligationId, evidenceRef }, { accepted: true });
        return { accepted: true };
      },

      recordRefusal: (obligationId, at) => {
        const ob = this.obligationById(obligationId);
        if (!ob) return;
        // Dated, and it does NOT close the obligation.
        ob.refusedAt = at;
        this.record("evidence", { refusal: obligationId, at }, { stillLive: true });
      },

      sweep: () => {
        const now = this.clock.toISOString();
        const breached: string[] = [];
        for (const ob of this.obligations) {
          const due = this.dueDateFor(ob.id);
          if (!due) continue;
          if (!ob.completedAt && due.date < now && !ob.breachedAt) {
            ob.breachedAt = now;
          }
          // Once set, never unset. Completing late does not clear the history.
          if (ob.breachedAt) breached.push(ob.id);
        }
        this.record("gate", { sweep: true, at: now }, { breached });
        return breached;
      },

      prepareNotice: (obligationId) => {
        if (!this.noticeFor(obligationId)) this.notices.push({ obligationId });
        this.record("issue_notice", { prepare: obligationId }, { issued: false, awaiting: "a named release" });
      },

      releaseNotice: (obligationId, person) => {
        const notice = this.noticeFor(obligationId);
        if (!notice) return false;
        if (!person) {
          this.refusedReleases.push(obligationId);
          this.record("issue_notice", { release: obligationId }, { issued: false, why: "no named person" });
          return false;
        }
        notice.releasedBy = person;
        notice.issuedAt = this.clock.toISOString();
        this.record("issue_notice", { release: obligationId, person }, { issued: true });
        return true;
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Fire Service Pack                                                   */
/* ------------------------------------------------------------------ */

/** Defect codes are a closed list. A paragraph is not a code. */
export const DEFECT_CODES = ["D1", "D2", "D3", "D4"] as const;
export type DefectCode = (typeof DEFECT_CODES)[number];

export interface ServiceRecord {
  id: string;
  assetId: string;
  obligationId: string;
  /** What the attending person recorded. Never overwritten by a computation. */
  result: "pass" | "defect";
  /** Evidence appropriate to the asset's class. */
  evidence: { kind: "reading" | "image" | "inspection"; value: string };
  defect?: { code: DefectCode; owner: string; note: string };
  /** Missing the tag photograph lands it here, out of the pass count. */
  unbound?: boolean;
  unboundSince?: string;
  closed?: boolean;
}

export interface Isolation {
  assetId: string;
  revisitDate?: string;
  lapsedAt?: string;
}

export interface FirePorts {
  now(): Date;
  /** Resolve a tag. Zero or two matches is a finding, never a record. */
  resolveTag(tag: string): { assetId: string } | { finding: string };
  /** The live obligations on an asset. A record must name one. */
  obligationsFor(assetId: string): Obligation[];
  /**
   * Store a service record. Refused when it names no obligation, when the
   * evidence is wrong for the class, or when a defect has no code and owner.
   */
  storeRecord(input: {
    assetId: string;
    obligationId?: string;
    result: "pass" | "defect";
    evidence: { kind: "reading" | "image" | "inspection"; value: string };
    defect?: { code?: string; owner?: string; note: string };
    tagPhotograph?: boolean;
  }): { id: string } | { refused: string };
  /** A missing baseline is a stored non-conformance, not an empty field. */
  reportBaselineAbsent(assetId: string): void;
  /** Close a visit. Refused where electrical work has no certificate. */
  closeVisit(recordId: string, input: { electrical?: boolean; certificateRef?: string }): { ok: boolean; why?: string };
  /** An isolation without a revisit date is refused. */
  recordIsolation(assetId: string, revisitDate?: string): boolean;
  /** Move the lapsed isolations to escalation. Called on the scheduled run. */
  sweepIsolations(): string[];
  /** A client document, derived from the record at request time. */
  renderDocument(recordId: string): string | null;
  /** Retention and who may attest, per jurisdiction. Data, not a constant. */
  jurisdictionRules(assetId: string, obligationType: string): { retentionYears: number; attestedBy: string } | null;
  escalate(reason: string, detail?: string): void;
}

export interface FireWorldOptions {
  now?: Date;
  assets?: Asset[];
  rules?: RuleVersion[];
  obligations?: Obligation[];
}

export class FireWorld extends Register {
  readonly records: ServiceRecord[] = [];
  readonly findings: string[] = [];
  readonly nonConformances: Array<{ assetId: string; what: string }> = [];
  readonly isolations: Isolation[] = [];
  readonly refusals: string[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  private seq = 0;

  /** The evidence each class requires. A reading supplied as an image fails. */
  private static EVIDENCE_FOR: Record<AssetClass, ServiceRecord["evidence"]["kind"]> = {
    portable: "image",
    system: "reading",
    passive: "inspection",
  };

  get passCount(): number {
    return this.records.filter((r) => r.result === "pass" && !r.unbound).length;
  }

  get unbound(): ServiceRecord[] {
    return this.records.filter((r) => r.unbound);
  }

  recordById(id: string): ServiceRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  /** Correct a stored record, so check 10 can ask for the document after. */
  correctRecord(id: string, value: string): void {
    const rec = this.recordById(id);
    if (rec) rec.evidence = { ...rec.evidence, value };
  }

  /** Render without recording, for assertions. */
  renderStored(recordId: string): string | null {
    const rec = this.recordById(recordId);
    if (!rec) return null;
    return `${rec.assetId} ${rec.result} ${rec.evidence.value}`;
  }

  ports(): FirePorts {
    return {
      now: () => new Date(this.clock),

      resolveTag: (tag) => {
        const matches = this.byTag(tag);
        if (matches.length === 1) {
          this.record("read_asset", { tag }, { assetId: matches[0]!.id });
          return { assetId: matches[0]!.id };
        }
        const finding = matches.length === 0 ? `no asset for tag ${tag}` : `tag ${tag} matches ${matches.length} assets`;
        this.findings.push(finding);
        this.record("read_asset", { tag }, { finding });
        return { finding };
      },

      obligationsFor: (assetId) => {
        const rows = this.obligations.filter((o) => o.assetId === assetId && !o.completedAt).map((o) => ({ ...o }));
        this.record("read_asset", { obligationsFor: assetId }, { count: rows.length });
        return rows;
      },

      storeRecord: (input) => {
        const asset = this.assetById(input.assetId);
        if (!asset) {
          const refused = "no such asset";
          this.refusals.push(refused);
          this.record("record_service", input, { refused });
          return { refused };
        }
        // A record with a null obligation does not move coverage, so it is not
        // stored at all: a stored record naming nothing is the thing that makes
        // a coverage number a lie.
        if (!input.obligationId) {
          const refused = "names no obligation";
          this.refusals.push(refused);
          this.record("record_service", input, { refused });
          return { refused };
        }
        const wanted = FireWorld.EVIDENCE_FOR[asset.assetClass];
        if (input.evidence.kind !== wanted) {
          const refused = `held: ${asset.assetClass} needs ${wanted}, got ${input.evidence.kind}`;
          this.refusals.push(refused);
          this.record("record_service", input, { refused });
          return { refused };
        }
        if (input.result === "defect") {
          const code = input.defect?.code;
          const owner = input.defect?.owner;
          if (!code || !owner || !DEFECT_CODES.includes(code as DefectCode)) {
            const refused = "defect needs a code from the list and a named owner";
            this.refusals.push(refused);
            this.record("record_service", input, { refused });
            return { refused };
          }
        }
        const rec: ServiceRecord = {
          id: `SR${++this.seq}`,
          assetId: input.assetId,
          obligationId: input.obligationId,
          // The stored result is what the person entered. Nothing derived
          // overrides it, which is why the world never recomputes it.
          result: input.result,
          evidence: { ...input.evidence },
          ...(input.result === "defect"
            ? {
                defect: {
                  code: input.defect!.code as DefectCode,
                  owner: input.defect!.owner!,
                  note: input.defect!.note,
                },
              }
            : {}),
          ...(input.tagPhotograph === false
            ? { unbound: true, unboundSince: this.clock.toISOString() }
            : {}),
        };
        this.records.push(rec);
        this.record("record_service", input, { id: rec.id, unbound: Boolean(rec.unbound) });
        return { id: rec.id };
      },

      reportBaselineAbsent: (assetId) => {
        this.nonConformances.push({ assetId, what: "baseline unavailable" });
        this.record("evidence", { baselineAbsent: assetId }, { nonConformance: true });
      },

      closeVisit: (recordId, { electrical, certificateRef }) => {
        const rec = this.recordById(recordId);
        if (!rec) return { ok: false, why: "no such record" };
        if (electrical && !certificateRef) {
          // A refusal, not a reminder.
          const why = "electrical work closed without a certificate";
          this.refusals.push(why);
          this.record("evidence", { close: recordId }, { ok: false, why });
          return { ok: false, why };
        }
        rec.closed = true;
        this.record("evidence", { close: recordId }, { ok: true });
        return { ok: true };
      },

      recordIsolation: (assetId, revisitDate) => {
        if (!revisitDate) {
          this.refusals.push("isolation without a revisit date");
          this.record("record_service", { isolation: assetId }, { accepted: false });
          return false;
        }
        this.isolations.push({ assetId, revisitDate });
        this.record("record_service", { isolation: assetId, revisitDate }, { accepted: true });
        return true;
      },

      sweepIsolations: () => {
        const now = this.clock.toISOString();
        const lapsed: string[] = [];
        for (const iso of this.isolations) {
          if (iso.revisitDate && iso.revisitDate < now) {
            // It does not clear itself. It escalates on the day it lapses.
            iso.lapsedAt = iso.lapsedAt ?? now;
            lapsed.push(iso.assetId);
            this.escalations.push({ reason: "isolation lapsed", detail: iso.assetId });
          }
        }
        this.record("escalate", { sweepIsolations: true }, { lapsed });
        return lapsed;
      },

      renderDocument: (recordId) => {
        // Derived at request time, so a correction reaches it.
        const out = this.renderStored(recordId);
        this.record("evidence", { document: recordId }, { text: out });
        return out;
      },

      jurisdictionRules: (assetId, obligationType) => {
        const asset = this.assetById(assetId);
        if (!asset) return null;
        const rule = this.ruleInForce(obligationType, asset.jurisdiction);
        const out = rule
          ? { retentionYears: rule.retentionYears, attestedBy: rule.attestedBy }
          : null;
        this.record("read_rule", { assetId, jurisdiction: asset.jurisdiction, obligationType }, out);
        return out;
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

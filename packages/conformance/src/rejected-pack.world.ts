// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/rejected-pack.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The pack world: one graph of facts, dated rules, and four queues a pack can
 * sit in.
 *
 * THE ONE DESIGN DECISION THAT MATTERS HERE. An artefact does not hold text. It
 * holds references to facts, and its text is derived when you read it. That is
 * the whole standard in one modelling choice: check 1 says changing the trading
 * address updates every open artefact and that one stale copy is the failure
 * this standard exists for. If the world stored rendered strings, a build that
 * copied the address in would look identical to one that referenced it, right up
 * until the address changed. So a build may pass literal text, and the world
 * will keep it exactly as given, which is how the stale copy becomes visible
 * rather than hypothetical.
 *
 * WHY THE QUEUES ARE STATES AND NOT LABELS. Check 5: a fail that can be exported
 * anyway means the queues are labels. `handover()` refuses on a failed pack and
 * refuses without a version record naming a person, so the refusal lives in the
 * world rather than in the build's discipline. A build cannot forget it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. Nothing here can say "compliant". Check 10
 * is the one most likely to be regressed by somebody improving the wording, so
 * the strings the build would show a user are submitted through a port and kept,
 * and the assertion reads them. It is a check rather than a style note because
 * copy drifts and nobody notices until it is on a screen.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** Pass, Yellow, Hold, Fail. Closed, because they are states. */
export const QUEUES = ["pass", "yellow", "hold", "fail"] as const;
export type Queue = (typeof QUEUES)[number];

/** The facts everything derives from. One graph, no second copy. */
export type Facts = Record<string, string>;

export interface Rule {
  id: string;
  version: string;
  /** The clock passes this and the rule takes effect on its own. */
  effectiveFrom: string;
  /** Superseded rules stay readable, with their dates. Check 2. */
  supersededBy?: string;
  /** Days from the trigger to the due date, under this version. */
  dueDays: number;
  text: string;
}

export interface Clause {
  text: string;
  /** An uncited clause fails check 8. */
  sourceRuleId?: string;
}

export interface Artefact {
  id: string;
  packId: string;
  /** Fact keys resolved at read time. The right way. */
  refs: string[];
  /** Literal text the build baked in. The stale-copy failure, kept verbatim. */
  literal?: string;
}

export interface QueueMove {
  from: Queue | null;
  to: Queue;
  reason: string;
  at: string;
}

export interface VersionRecord {
  person: string;
  at: string;
  accepted: string;
}

export interface Pack {
  id: string;
  subjectId: string;
  queue: Queue;
  history: QueueMove[];
  clauses: Clause[];
  yellowFields: string[];
  asOf?: string;
  versionRecord?: VersionRecord;
  /** The first check it failed, which is the one it is reported against. */
  failedCheck?: string;
  handedOver?: boolean;
}

export interface PackPorts {
  now(): Date;
  /** The graph. Everything derives from this and nothing copies it. */
  readFacts(): Facts;
  /** Rules as they stand, superseded ones included and readable. */
  readRules(): Rule[];
  /** The due date under whichever rule version is in force at `now`. */
  dueDateFor(ruleId: string, triggeredAt: string): { date: string; version: string } | null;
  /**
   * Attach an artefact to a pack. Pass `refs` to derive from the graph, or
   * `literal` to bake text in. Both are allowed so the failure is observable.
   */
  deriveArtefact(input: { id: string; packId: string; refs?: string[]; literal?: string }): Artefact;
  /** Read an artefact as it stands now. Refs resolve against current facts. */
  renderArtefact(id: string): string | null;
  /** A written no, with its reason. Silence is not an answer. Check 3. */
  declareNotApplicable(subjectId: string, reason: string): void;
  /** Run one check in order. The first failure is the one that sticks. */
  runCheck(packId: string, checkName: string, passed: boolean, reason: string): Queue;
  /** Mark a low-confidence field. Nothing promotes a pack on a score alone. */
  markYellow(packId: string, field: string): void;
  /** Release from Yellow. Refused without a named person. Check 7. */
  acceptVersion(packId: string, input: { person?: string; accepted: string }): boolean;
  addClause(packId: string, clause: Clause): void;
  setAsOf(packId: string, asOf: string): void;
  /** Refused from the fail queue, and refused with no version record. */
  handover(packId: string): { ok: boolean; why?: string };
  /** Which step the build treats as the binding layer. Check 12. */
  declareHardStep(step: string): void;
  /** Every user-facing string a passing pack can produce. Check 10. */
  publishCopy(strings: string[]): void;
  /** Anything the build would retain. Check 11 reads it. */
  retain(what: string, content: string): void;
}

export interface PackWorldOptions {
  now?: Date;
  facts?: Facts;
  rules?: Rule[];
  packs?: Array<Pick<Pack, "id" | "subjectId">>;
}

export class PackWorld {
  readonly packs: Pack[] = [];
  readonly artefacts: Artefact[] = [];
  readonly notApplicable: Array<{ subjectId: string; reason: string }> = [];
  readonly copy: string[] = [];
  readonly retained: Array<{ what: string; content: string }> = [];
  readonly refusedAcceptances: string[] = [];
  readonly handovers: Array<{ packId: string; ok: boolean; why?: string }> = [];
  hardStep: string | null = null;
  readonly calls: PortCall[] = [];

  private facts: Facts;
  private readonly rules: Rule[];
  private clock: Date;

  constructor(opts: PackWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T00:00:00.000Z");
    this.facts = { ...(opts.facts ?? {}) };
    this.rules = (opts.rules ?? []).map((r) => ({ ...r }));
    for (const p of opts.packs ?? []) {
      this.packs.push({
        id: p.id,
        subjectId: p.subjectId,
        queue: "hold",
        history: [],
        clauses: [],
        yellowFields: [],
      });
    }
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The business moves. The runner does this, never the build. Check 1. */
  changeFact(key: string, value: string): void {
    this.facts[key] = value;
  }

  packById(id: string): Pack | undefined {
    return this.packs.find((p) => p.id === id);
  }

  /**
   * Render without recording, for assertions.
   *
   * Same reasoning as `CitedAnswerWorld.storedCiting`: an assertion that called
   * the port would append to the trace it is judging.
   */
  renderStored(artefactId: string): string | null {
    const a = this.artefacts.find((x) => x.id === artefactId);
    if (!a) return null;
    if (a.literal !== undefined) return a.literal;
    return a.refs.map((k) => this.facts[k] ?? "").join(" ");
  }

  private ruleInForce(ruleId: string): Rule | undefined {
    const now = this.clock.toISOString();
    const family = this.rules.filter((r) => r.id === ruleId && r.effectiveFrom <= now);
    // The latest version whose effective date the clock has passed.
    return family.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).pop();
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

  ports(): PackPorts {
    return {
      now: () => new Date(this.clock),

      readFacts: () => {
        const snapshot = { ...this.facts };
        this.record("evidence", { facts: true }, { keys: Object.keys(snapshot).length });
        return snapshot;
      },

      readRules: () => {
        const rows = this.rules.map((r) => ({ ...r }));
        this.record("read_rule", { at: this.clock.toISOString() }, { rules: rows.length });
        return rows;
      },

      dueDateFor: (ruleId, triggeredAt) => {
        const rule = this.ruleInForce(ruleId);
        if (!rule) {
          this.record("read_rule", { ruleId, triggeredAt }, null);
          return null;
        }
        const date = new Date(
          new Date(triggeredAt).getTime() + rule.dueDays * 86_400_000,
        ).toISOString();
        const out = { date, version: rule.version };
        this.record("read_rule", { ruleId, triggeredAt }, out);
        return out;
      },

      deriveArtefact: ({ id, packId, refs, literal }) => {
        const artefact: Artefact = {
          id,
          packId,
          refs: refs ?? [],
          ...(literal !== undefined ? { literal } : {}),
        };
        this.artefacts.push(artefact);
        this.record(
          "evidence",
          { artefact: id, packId, refs, literal: literal !== undefined },
          { id },
        );
        return { ...artefact };
      },

      renderArtefact: (id) => {
        const out = this.renderStored(id);
        this.record("evidence", { render: id }, { text: out });
        return out;
      },

      declareNotApplicable: (subjectId, reason) => {
        this.notApplicable.push({ subjectId, reason });
        this.record("answer", { subjectId, notApplicable: true, reason }, { written: true });
        this.record("gate", { subjectId }, { applicable: false, reason });
      },

      runCheck: (packId, checkName, passed, reason) => {
        const pack = this.packById(packId);
        if (!pack) return "hold";
        // The first failure is the one it is reported against. A later failure
        // does not overwrite it, which is what "in order" buys you.
        if (!passed && !pack.failedCheck) {
          pack.failedCheck = checkName;
          const from = pack.history.length > 0 ? pack.queue : null;
          pack.queue = "fail";
          pack.history.push({ from, to: "fail", reason, at: this.clock.toISOString() });
        } else if (passed && !pack.failedCheck) {
          const from = pack.history.length > 0 ? pack.queue : null;
          const to: Queue = pack.yellowFields.length > 0 ? "yellow" : "pass";
          if (to !== pack.queue || pack.history.length === 0) {
            pack.queue = to;
            pack.history.push({ from, to, reason, at: this.clock.toISOString() });
          }
        }
        this.record(
          "gate",
          { packId, check: checkName, passed, reason },
          { queue: pack.queue, failedCheck: pack.failedCheck ?? null },
        );
        return pack.queue;
      },

      markYellow: (packId, field) => {
        const pack = this.packById(packId);
        if (!pack) return;
        pack.yellowFields.push(field);
        // Nothing auto-promotes. A marked field holds the pack in Yellow until
        // a person accepts it, whatever the confidence score said.
        //
        // Only a real change of queue is a move. Marking a second low-confidence
        // field on a pack already in Yellow was writing a yellow-to-yellow entry
        // into the history, which made "how did it leave Yellow" unanswerable:
        // the audit trail is the point of the history, so a move that did not
        // happen must not appear in it.
        if (!pack.failedCheck && pack.queue !== "yellow") {
          const from = pack.history.length > 0 ? pack.queue : null;
          pack.queue = "yellow";
          pack.history.push({ from, to: "yellow", reason: `low confidence: ${field}`, at: this.clock.toISOString() });
        }
        this.record("evidence", { packId, yellow: field }, { queue: pack.queue });
      },

      acceptVersion: (packId, { person, accepted }) => {
        const pack = this.packById(packId);
        if (!pack) return false;
        if (!person) {
          this.refusedAcceptances.push(packId);
          this.record("gate", { packId, accept: true }, { accepted: false, why: "no named person" });
          return false;
        }
        pack.versionRecord = { person, at: this.clock.toISOString(), accepted };
        if (pack.queue === "yellow") {
          pack.history.push({
            from: "yellow",
            to: "pass",
            reason: `accepted by ${person}`,
            at: this.clock.toISOString(),
          });
          pack.queue = "pass";
        }
        this.record("gate", { packId, person }, { accepted: true, at: pack.versionRecord.at });
        return true;
      },

      addClause: (packId, clause) => {
        const pack = this.packById(packId);
        if (!pack) return;
        pack.clauses.push({ ...clause });
        this.record("cite", { packId, clause: clause.text }, { source: clause.sourceRuleId ?? null });
      },

      setAsOf: (packId, asOf) => {
        const pack = this.packById(packId);
        if (!pack) return;
        pack.asOf = asOf;
        this.record("cite", { packId, asOf }, { ok: true });
      },

      handover: (packId) => {
        const pack = this.packById(packId);
        if (!pack) {
          this.record("evidence", { handover: packId }, { ok: false, why: "no such pack" });
          return { ok: false, why: "no such pack" };
        }
        // Fail does not leave. This is a state, not a label.
        if (pack.queue === "fail") {
          const out = { ok: false, why: `in the fail queue: ${pack.failedCheck ?? "unknown"}` };
          this.handovers.push({ packId, ...out });
          this.record("evidence", { handover: packId }, out);
          return out;
        }
        if (!pack.versionRecord) {
          const out = { ok: false, why: "no version record naming a person" };
          this.handovers.push({ packId, ...out });
          this.record("evidence", { handover: packId }, out);
          return out;
        }
        pack.handedOver = true;
        const out = { ok: true };
        this.handovers.push({ packId, ...out });
        this.record("evidence", { handover: packId }, out);
        return out;
      },

      declareHardStep: (step) => {
        this.hardStep = step;
        this.record("evidence", { hardStep: step }, { named: true });
      },

      publishCopy: (strings) => {
        this.copy.push(...strings);
        this.record("answer", { strings: strings.length }, { ok: true });
      },

      retain: (what, content) => {
        this.retained.push({ what, content });
        this.record("evidence", { retain: what }, { bytes: content.length });
      },
    };
  }
}

// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/envelope.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The trace envelope: what a run of the checks emits, and the thing a red
 * fixture actually is.
 *
 * Phase 1 of `voice-office/docs/strategy/protocol-runtime-and-fixtures.md`,
 * designed after all ten standards were ported rather than after one, which
 * changed it twice.
 *
 * ── WHY THE PORTS ARE NOT COLLAPSED, WHICH WAS THE OPEN QUESTION ──
 *
 * Measured across 118 checks in ten standards:
 *
 *   - No standard uses more than 10 distinct ports. The median is 6. So the
 *     union of 24 is never a burden on any single implementer, which was the
 *     stated reason to collapse it.
 *   - The distribution is a long tail: `read_rule` appears in 8 standards,
 *     `gate` in 7, `evidence` in 6, and nine ports appear in exactly one.
 *   - Five verbs plus a subject cover all of them.
 *
 * So the collapse is real but the refactor is not worth it, because the two
 * things want different shapes. A STANDARD wants specific names: `record_promise`
 * tells a builder more than `write(promise)`. A TRACE wants one shape, or the
 * assertion engine needs a special case per port. Both are available from one
 * mapping, so the standards keep their vocabulary and the envelope stays
 * uniform. `PORT_SHAPE` in `types.ts` is that mapping, and a test proves it is
 * total: a new port cannot be added without giving it a verb and a subject.
 *
 * ── WHAT THE ENVELOPE IS FOR ──
 *
 * "Send us the failing pass test" has to mean uploading a file, not writing a
 * paragraph. That only works if the runner emits everything needed to price the
 * broken check without reconstructing the business: what went in, what the build
 * did through its ports, what the world looked like afterwards, and what the
 * standard expected instead.
 */

import type { Environment, Verdict } from "./types.js";

/** Bump on any breaking change to the shapes below. Consumers pin it. */
export const ENVELOPE_VERSION = "1.0";

/**
 * One call the build made through a port.
 *
 * `verb` and `subject` come from PORT_SHAPE, so an assertion engine can match on
 * a uniform shape while the standard keeps its specific port name.
 *
 * `intentId` is the same idempotency key the production write path already
 * carries, which is what ties a trace entry to the thing that actually landed.
 * Without it, "one job, not two" is provable only by counting, and counting
 * cannot tell a retry from a duplicate.
 */
export interface PortCall {
  at: string;
  port: string;
  verb: "read" | "write" | "say" | "attach" | "decide";
  subject: string;
  request: unknown;
  response: unknown;
  intentId?: string;
  /** Milliseconds. Present because some checks are about ordering, not content. */
  elapsedMs?: number;
}

/** What the runner injected. A check is only reproducible if this is. */
export interface Stimulus {
  /** Free text from the check's own `stimulus`, so a human reads the same thing. */
  description: string;
  /** The clock the runner held. Time is a stimulus, not an ambient fact. */
  now: string;
  /** Canned audio, payloads, seeded rows: whatever the runner supplied. */
  inputs: Array<{ kind: string; ref: string; note?: string }>;
  /** The world the runner owned before the build touched it. */
  seed?: unknown;
}

/** One check, run once. */
export interface CheckResult {
  checkId: string;
  n: number;
  title: string;
  verdict: Verdict;
  /** Undefined when the check could not be evaluated at all. */
  held?: boolean;
  /** The standard's words, so the fixture is readable without fetching it. */
  expected: string;
  /** What actually happened, in the runner's words. */
  actual: string;
  stimulus: Stimulus;
  /** Only the calls this check observed, in order. */
  calls: PortCall[];
  /** Media the runner wrote beside the trace: recordings, payload dumps. */
  artefacts: Array<{ kind: string; path: string; bytes?: number }>;
}

/**
 * One run of one standard. This is the file a builder uploads.
 *
 * It deliberately contains the expectations as well as the results. A fixture
 * that only says "check 6 failed" makes us fetch the standard at the version
 * they ran, and versions move.
 */
export interface TraceEnvelope {
  envelopeVersion: typeof ENVELOPE_VERSION;
  runId: string;
  standard: string;
  /** The spec id and the version of the standard as it was when this ran. */
  spec: string;
  specVersion: string;
  environment: Environment;
  startedAt: string;
  finishedAt: string;
  /** Who ran it, if they said. Never required: an anonymous fixture is still a fixture. */
  ranBy?: string;
  results: CheckResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    shapeOnly: number;
    withUs: number;
    evidenceRequired: number;
  };
}

/** Roll the per-check verdicts into the summary, so it cannot disagree with them. */
export function summarise(results: readonly CheckResult[]): TraceEnvelope["summary"] {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  return {
    total: results.length,
    pass: count("pass"),
    fail: count("fail"),
    shapeOnly: count("shape_only"),
    withUs: count("with_us"),
    evidenceRequired: count("evidence_required"),
  };
}

/**
 * Is this envelope enough to price a broken check without a meeting?
 *
 * This is the commercial gate in code. "No fixture, no quote" is only
 * enforceable if the thing being demanded is defined, and this is that
 * definition: a failing check has to carry what went in, what the build did, and
 * what was expected. Anything less is a story, and a story is the audit.
 */
export function isPriceable(env: TraceEnvelope): { ok: true } | { ok: false; why: string } {
  if (env.envelopeVersion !== ENVELOPE_VERSION) {
    return { ok: false, why: `unsupported envelope version ${env.envelopeVersion}` };
  }
  const failures = env.results.filter((r) => r.verdict === "fail");
  if (failures.length === 0) {
    return { ok: false, why: "nothing failed: there is no check to price" };
  }
  for (const f of failures) {
    if (!f.stimulus?.description || !f.stimulus.now) {
      return { ok: false, why: `${f.checkId} has no reproducible stimulus` };
    }
    if (!f.expected || !f.actual) {
      return { ok: false, why: `${f.checkId} does not say what was expected and what happened` };
    }
    // A failure with no port calls at all is the off-port build: the agent
    // called the vendor directly, so there is nothing to replay and nothing to
    // quote against. Saying so precisely is more useful than refusing quietly.
    if (f.calls.length === 0) {
      return {
        ok: false,
        why: `${f.checkId} recorded no port calls. Either the build bypassed the ports, or the runner never reached it. Neither can be priced`,
      };
    }
  }
  return { ok: true };
}

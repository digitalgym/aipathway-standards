// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/runner.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The runner: drives a check, asserts against the world, emits the envelope.
 *
 * Phase 3 in miniature. This is the in-repo proof that the chain works end to
 * end, not the published CLI: checks as data, a stub that records, an assertion
 * over the world, an envelope a red fixture can be built from.
 *
 * ── WHAT AN ASSERTION IS ──
 *
 * Deliberately a function over the finished world rather than a DSL. A DSL for
 * assertions would be a second language to maintain beside the standards, and
 * the assertions are few enough per standard that a function is cheaper and
 * clearer. The `assertion` string on each check stays the human-readable
 * statement of the same thing, and the two sit side by side so a drift between
 * them is visible on the page.
 *
 * ── WHY THE RUNNER OWNS THE SEQUENCE ──
 *
 * It sets the clock, seeds the world, hands the build its ports, runs it, and
 * only then looks. A build that bypassed the ports leaves an empty world and an
 * empty call list, which the envelope reports as exactly that rather than as a
 * generic failure.
 */

import type { Check, Environment } from "./types.js";
import { verdictFor } from "./types.js";
import type { CheckResult, TraceEnvelope } from "./envelope.js";
import { ENVELOPE_VERSION, summarise } from "./envelope.js";
import { StubWorld, type Ports, type StubOptions } from "./stub.js";

/** A build under test: anything that takes the ports and does the job. */
export type Build = (ports: Ports) => void | Promise<void>;

/** What a check needs in order to be run, beyond its own words. */
export interface Scenario {
  checkId: string;
  /** The world before the build touches it. */
  world: () => StubWorld;
  /** Run the build one or more times, however the check requires. */
  drive: (build: Build, world: StubWorld) => void | Promise<void>;
  /** True if the check holds. Reads the world, never the build. */
  holds: (world: StubWorld) => boolean;
  /** What actually happened, for the fixture. */
  describe: (world: StubWorld) => string;
}

export interface RunOptions {
  standard: string;
  spec: string;
  specVersion: string;
  environment?: Environment;
  ranBy?: string;
}

/** Run one check and produce its result, whether it passed or not. */
export async function runCheck(
  check: Check,
  scenario: Scenario,
  build: Build,
  env: Environment,
): Promise<CheckResult> {
  // A production-only check is not attempted on the stub. Attempting it would
  // produce a failure that is not the builder's, which is the whole reason the
  // with_us verdict exists.
  if (env === "stub" && check.assertable === "production") {
    return {
      checkId: check.id,
      n: check.n,
      title: check.title,
      verdict: verdictFor(check, env, undefined),
      expected: check.assertion,
      actual: "Not attempted here. This check runs on the production provider.",
      stimulus: { description: check.stimulus, now: new Date().toISOString(), inputs: [] },
      calls: [],
      artefacts: [],
    };
  }
  if (check.assertable === "precondition") {
    return {
      checkId: check.id,
      n: check.n,
      title: check.title,
      verdict: verdictFor(check, env, undefined),
      expected: check.assertion,
      actual: "No software result. This one is closed by evidence, not by a run.",
      stimulus: { description: check.stimulus, now: new Date().toISOString(), inputs: [] },
      calls: [],
      artefacts: [],
    };
  }

  const world = scenario.world();
  const startedAt = world.ports().now().toISOString();
  let held: boolean;
  let actual: string;
  try {
    await scenario.drive(build, world);
    held = scenario.holds(world);
    actual = scenario.describe(world);
  } catch (err) {
    held = false;
    actual = `The build threw: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    checkId: check.id,
    n: check.n,
    title: check.title,
    verdict: verdictFor(check, env, held),
    held,
    expected: check.assertion,
    actual,
    stimulus: {
      description: check.stimulus,
      now: startedAt,
      inputs: [{ kind: "scenario", ref: scenario.checkId }],
    },
    calls: world.calls,
    artefacts: [],
  };
}

/** Run every check that has a scenario, and envelope the lot. */
export async function runStandard(
  checks: readonly Check[],
  scenarios: readonly Scenario[],
  build: Build,
  opts: RunOptions,
): Promise<TraceEnvelope> {
  const env = opts.environment ?? "stub";
  const startedAt = new Date().toISOString();
  const results: CheckResult[] = [];

  for (const check of checks) {
    const scenario = scenarios.find((s) => s.checkId === check.id);
    if (!scenario) {
      // A check with no scenario is not silently skipped: an absent scenario is
      // a gap in the runner, and hiding it would let coverage rot unnoticed.
      if (check.assertable === "production" || check.assertable === "precondition") {
        results.push(await runCheck(check, nullScenario(check.id), build, env));
      }
      continue;
    }
    results.push(await runCheck(check, scenario, build, env));
  }

  return {
    envelopeVersion: ENVELOPE_VERSION,
    runId: `run-${Date.now()}`,
    standard: opts.standard,
    spec: opts.spec,
    specVersion: opts.specVersion,
    environment: env,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...(opts.ranBy ? { ranBy: opts.ranBy } : {}),
    results,
    summary: summarise(results),
  };
}

function nullScenario(checkId: string): Scenario {
  return {
    checkId,
    world: () => new StubWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "not run here",
  };
}

/** Convenience for building a scenario's world with options. */
export function world(opts: StubOptions = {}): StubWorld {
  return new StubWorld(opts);
}

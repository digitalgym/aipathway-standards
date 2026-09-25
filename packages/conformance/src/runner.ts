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
import type { CheckResult, PortCall, TraceEnvelope } from "./envelope.js";
import { ENVELOPE_VERSION, summarise } from "./envelope.js";
import { StubWorld, type StubOptions } from "./stub.js";

/**
 * What the runner needs from a world, and the whole of it.
 *
 * WHY THIS EXISTS. Until 2026-09-21 every signature below named `StubWorld`
 * directly, so the runner drove exactly one world: an inbound phone call.
 * `docs/porting-a-standard.md` §8 counted the cost of that as "a world per
 * domain" and ten standards stuck at *ported but not runnable*, which meant 96
 * checks that the site advertised as provable on your own machine and none that
 * could actually run.
 *
 * The runner never needed the whole of `StubWorld`. It constructs the world,
 * asks it for the ports, reads the clock off them, and copies the recorded calls
 * into the result. That is the entire contract, so it is the entire interface,
 * and a domain world satisfies it by recording what happens to it.
 *
 * The ports type is inferred from the world rather than declared beside it, so a
 * scenario cannot be handed a build written against a different domain's verbs:
 * the quoting world's `Build` takes quoting ports and nothing else.
 */
export interface RunnerWorld {
  ports(): { now(): Date };
  readonly calls: PortCall[];
}

/** The verbs a given world hands a build. */
export type PortsOf<W extends RunnerWorld> = ReturnType<W["ports"]>;

/**
 * A build under test: anything that takes the ports and does the job.
 *
 * Defaults to the call world's `Ports` so every existing call site, the README
 * example and the published package's types all keep their meaning.
 */
export type Build<W extends RunnerWorld = StubWorld> = (
  ports: PortsOf<W>,
) => void | Promise<void>;

/** What a check needs in order to be run, beyond its own words. */
export interface Scenario<W extends RunnerWorld = StubWorld> {
  checkId: string;
  /** The world before the build touches it. */
  world: () => W;
  /** Run the build one or more times, however the check requires. */
  drive: (build: Build<W>, world: W) => void | Promise<void>;
  /** True if the check holds. Reads the world, never the build. */
  holds: (world: W) => boolean;
  /** What actually happened, for the fixture. */
  describe: (world: W) => string;
}

export interface RunOptions {
  standard: string;
  spec: string;
  specVersion: string;
  environment?: Environment;
  ranBy?: string;
}

/** Run one check and produce its result, whether it passed or not. */
export async function runCheck<W extends RunnerWorld = StubWorld>(
  check: Check,
  scenario: Scenario<W>,
  build: Build<W>,
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
export async function runStandard<W extends RunnerWorld = StubWorld>(
  checks: readonly Check[],
  scenarios: readonly Scenario<W>[],
  build: Build<W>,
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
      //
      // THE ENVIRONMENT DECIDES WHICH KIND OF GAP IT IS. On the stub, a
      // production check having no scenario is not a gap at all: `runCheck`
      // returns `with_us` before it ever asks for a world. In production that
      // early return does not fire, and handing it `nullScenario` walked
      // straight into a world that throws by design. Nobody had hit it because
      // nothing had run this runner in production until now.
      //
      // So the two cases are separated. A precondition is closed by evidence in
      // either environment and still routes through the null scenario. A
      // production check reached in production with nothing to drive it is a
      // real hole in the builder's harness, and says so rather than crashing
      // the run and taking every other result with it.
      if (check.assertable === "production" && env === "production") {
        results.push(missingScenario(check));
        continue;
      }
      if (check.assertable === "production" || check.assertable === "precondition") {
        results.push(await runCheck(check, nullScenario<W>(check.id), build, env));
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

/**
 * The stand-in for a check that has no scenario because none is possible here.
 *
 * `runCheck` returns before it constructs a world for `production` and
 * `precondition` checks, so `world()` is never called on this and the cast is
 * describing that fact rather than hiding a gap. It is typed through so a
 * domain's `runStandard` can still report its pass test as `with_us` without
 * owning a world it would never build.
 */
/**
 * A production check reached in production with no scenario behind it.
 *
 * Reported as a fail rather than thrown, because one unwritten scenario should
 * cost the builder that check and not the eleven others in the same run. The
 * text names what is missing so the next step is obvious from the output alone.
 */
function missingScenario(check: Check): CheckResult {
  return {
    checkId: check.id,
    n: check.n,
    title: check.title,
    verdict: "fail",
    expected: check.assertion,
    actual:
      "No scenario for this check. It runs against the production provider, " +
      "and nothing here says how to drive it or what would count as held.",
    stimulus: { description: check.stimulus, now: new Date().toISOString(), inputs: [] },
    calls: [],
    artefacts: [],
  };
}

function nullScenario<W extends RunnerWorld>(checkId: string): Scenario<W> {
  return {
    checkId,
    world: () => {
      throw new Error("nullScenario has no world: runCheck returns before this");
    },
    drive: () => {},
    holds: () => false,
    describe: () => "not run here",
  } as Scenario<W>;
}

/** Convenience for building a scenario's world with options. */
export function world(opts: StubOptions = {}): StubWorld {
  return new StubWorld(opts);
}

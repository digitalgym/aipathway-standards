/**
 * Proof the scenarios have teeth.
 *
 *   node mutants.mjs
 *
 * Runs every scenario against a build that does nothing, and against builds
 * that each break one rule of the standard on purpose. Every check the listed
 * build claims must go red for the do-nothing build, and each named check must
 * go red for the build that breaks it. If one stays green, the scenario is too
 * weak: fix the scenario, never the assertion. Exits 1 on any gap.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { makeBuild } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const SLUG = "parts-ready-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const opts = { standard: SLUG, spec: std.spec, specVersion: std.version ?? std.envelope_version, environment: "stub" };

const runtime = std.checks.filter((c) => c.assertable !== "production" && c.assertable !== "precondition").map((c) => c.id);

const MUTANTS = [
  ["does nothing", async () => {}, runtime],
  ["reads every slot, any day", makeBuild({ anyDate: true }), ["jobs-come-from-the-board"]],
  ["forgets its own earlier run", makeBuild({ noDedupe: true }), ["jobs-come-from-the-board", "order-only-through-material-order", "tech-told-once"]],
  ["guesses a needs list", makeBuild({ guessNeeds: true }), ["needs-come-from-the-record", "publishes-by-the-cutoff"]],
  ["takes the template over the quote", makeBuild({ templateFirst: true }), ["needs-come-from-the-record"]],
  ["trusts a stale van count", makeBuild({ trustStale: true }), ["stock-is-read-with-an-as-of"]],
  ["orders before the shelf", makeBuild({ skipShelf: true }), ["reserve-before-order", "tech-told-once"]],
  ["one order per job", makeBuild({ orderPerJob: true }), ["order-only-through-material-order"]],
  ["ignores the lead time", makeBuild({ ignoreLeadTime: true }), ["lead-time-decides"]],
  ["swaps in the equivalent", makeBuild({ substitute: true }), ["no-silent-substitution"]],
  ["messages every run", makeBuild({ messageEveryRun: true }), ["tech-told-once"]],
  ["leaves out the shelf location", makeBuild({ noLocation: true }), ["tech-told-once"]],
  ["stays silent when all clear", makeBuild({ quietSilent: true }), ["publishes-by-the-cutoff"]],
  ["flags with no owner", makeBuild({ noOwner: true }), ["needs-come-from-the-record", "stock-is-read-with-an-as-of", "lead-time-decides", "publishes-by-the-cutoff"]],
];

let gaps = 0;
for (const [name, build, mustFail] of MUTANTS) {
  const env = await runStandard(std.checks, scenarios, build, opts);
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const missed = mustFail.filter((id) => !red.includes(id));
  gaps += missed.length;
  console.log(`${missed.length ? "GAP " : "ok  "} ${name.padEnd(36)} red: ${red.length}${missed.length ? `  stayed green: ${missed.join(", ")}` : ""}`);
}
console.log(gaps ? `\n${gaps} check(s) a broken build did not turn red.` : "\nEvery claimed check goes red for the builds that break it.");
process.exitCode = gaps ? 1 : 0;

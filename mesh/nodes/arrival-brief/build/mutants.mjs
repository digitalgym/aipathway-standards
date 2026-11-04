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

const SLUG = "job-brief-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const opts = { standard: SLUG, spec: std.spec, specVersion: std.version ?? std.envelope_version, environment: "stub" };

const runtime = std.checks.filter((c) => c.assertable !== "production" && c.assertable !== "precondition").map((c) => c.id);

const MUTANTS = [
  ["does nothing", async () => {}, runtime],
  ["reads every slot, any day", makeBuild({ ignoreSlotDate: true }), ["jobs-from-the-slots"]],
  ["restates the window to the hour", makeBuild({ restateWindow: true }), ["jobs-from-the-slots"]],
  ["briefs the wrong day", makeBuild({ alwaysToday: true }), ["jobs-from-the-slots", "delivered-once-on-an-agreed-channel"]],
  ["shows undated records", makeBuild({ keepUndated: true }), ["every-line-has-a-source"]],
  ["keeps a line with no record", makeBuild({ keepUnsourced: true, inventAccess: true }), ["every-line-has-a-source", "hazards-and-access-first"]],
  ["drops the source from each line", makeBuild({ dropSourceField: true }), ["every-line-has-a-source"]],
  ["rewords notes", makeBuild({ reword: true }), ["quote-do-not-characterise"]],
  ["ignores the leave-notes-out setting", makeBuild({ ignoreNoteSetting: true }), ["quote-do-not-characterise"]],
  ["puts hazards last", makeBuild({ noOrder: true }), ["hazards-and-access-first"]],
  ["never shows what is missing", makeBuild({ noMissing: true }), ["hazards-and-access-first"]],
  ["lists every quote", makeBuild({ allQuotes: true }), ["open-quotes-with-age"]],
  ["prices the open quote", makeBuild({ priceQuotes: true }), ["open-quotes-with-age"]],
  ["reads the site by address alone", makeBuild({ readByAddress: true }), ["client-material-stays-scoped"]],
  ["sends on every run", makeBuild({ noDedupe: true }), ["delivered-once-on-an-agreed-channel"]],
  ["guesses a channel", makeBuild({ guessChannel: true }), ["delivered-once-on-an-agreed-channel"]],
  ["sends without the channel check", makeBuild({ skipGate: true, guessChannel: true }), ["delivered-once-on-an-agreed-channel"]],
  ["never parks the tech", makeBuild({ noPark: true }), ["delivered-once-on-an-agreed-channel"]],
  ["parks the tech every run", makeBuild({ ignoreOpenExceptions: true }), ["delivered-once-on-an-agreed-channel"]],
];

let gaps = 0;
for (const [name, build, mustFail] of MUTANTS) {
  const env = await runStandard(std.checks, scenarios, build, opts);
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const missed = mustFail.filter((id) => !red.includes(id));
  gaps += missed.length;
  console.log(`${missed.length ? "GAP " : "ok  "} ${name.padEnd(38)} red: ${red.length}${missed.length ? `  stayed green: ${missed.join(", ")}` : ""}`);
}
console.log(gaps ? `\n${gaps} check(s) a broken build did not turn red.` : "\nEvery claimed check goes red for the builds that break it.");
process.exitCode = gaps ? 1 : 0;

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

const SLUG = "job-close-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const opts = { standard: SLUG, spec: std.spec, specVersion: std.version ?? std.envelope_version, environment: "stub" };

const runtime = std.checks.filter((c) => c.assertable !== "production" && c.assertable !== "precondition").map((c) => c.id);

const MUTANTS = [
  ["does nothing", async () => {}, runtime],
  ["skips the job check", makeBuild({ skipJobCheck: true }), ["job-exists-tech-on-it"]],
  ["takes a capture from any tech", makeBuild({ skipTechCheck: true }), ["job-exists-tech-on-it"]],
  ["never stores the tech's words", makeBuild({ noEvidence: true }), ["verbatim-stored-first", "logged-by-job"]],
  ["stores the words after the draft", makeBuild({ evidenceAfterDraft: true }), ["verbatim-stored-first"]],
  ["puts unknown parts on the card", makeBuild({ parkAsLine: true }), ["parts-from-the-book"]],
  ["writes the draft's old prices", makeBuild({ priceAtDraft: true }), ["parts-from-the-book"]],
  ["prices variations from the book", makeBuild({ priceVariation: true }), ["variation-never-priced", "parked-to-the-desk"]],
  ["takes a yes from anyone", makeBuild({ anyYes: true }), ["tech-confirms"]],
  ["marks its own draft confirmed", makeBuild({ autoConfirm: true }), ["tech-confirms", "unconfirmed-to-supervisor"]],
  ["never tells the supervisor", makeBuild({ noSupervisor: true }), ["unconfirmed-to-supervisor"]],
  ["tells the supervisor at once", makeBuild({ earlySupervisor: true }), ["unconfirmed-to-supervisor"]],
  ["mints a new intent id on retry", makeBuild({ newIntentOnRetry: true }), ["one-write-ids-back"]],
  ["counts a write with no ids", makeBuild({ ignoreIds: true }), ["one-write-ids-back", "complete-only-when-written"]],
  ["marks complete before the write", makeBuild({ completeFirst: true }), ["complete-only-when-written"]],
  ["raises the same item every run", makeBuild({ noDedupeExceptions: true, forgetsCompletion: true }), ["parked-to-the-desk", "unconfirmed-to-supervisor"]],
  ["sends every item to one person", makeBuild({ oneOwner: true }), ["parked-to-the-desk", "variation-never-priced"]],
  ["logs a write without its ids", makeBuild({ noLog: true }), ["logged-by-job"]],
];

let gaps = 0;
for (const [name, build, mustFail] of MUTANTS) {
  const env = await runStandard(std.checks, scenarios, build, opts);
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const missed = mustFail.filter((id) => !red.includes(id));
  gaps += missed.length;
  console.log(`${missed.length ? "GAP " : "ok  "} ${name.padEnd(34)} red: ${red.length}${missed.length ? `  stayed green: ${missed.join(", ")}` : ""}`);
}
console.log(gaps ? `\n${gaps} check(s) a broken build did not turn red.` : "\nEvery claimed check goes red for the builds that break it.");
process.exitCode = gaps ? 1 : 0;

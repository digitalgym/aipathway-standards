/**
 * Proves the scenarios are not weak: every check the real build claims must go
 * red against a do-nothing build, and against the broken build that removes
 * the behaviour it guards.
 *
 *   node mutants.mjs
 *
 * Exits 1 if any claimed check survives a build that should fail it.
 * Writes nothing; the evidence comes from run.mjs.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build, makeBuild } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const SLUG = "material-order-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const run = (b) => runStandard(std.checks, scenarios, b, { standard: SLUG, spec: std.spec, specVersion: std.version ?? "", environment: "stub" });

const real = await run(build);
const claimed = real.results.filter((r) => r.verdict === "pass" || r.verdict === "shape_only").map((r) => r.checkId);

// Each broken build, and the checks it must turn red.
const mutants = {
  "do-nothing": { build: async () => {}, mustFail: claimed },
  "orders a line the job does not carry": { build: makeBuild({ extraLine: true }), mustFail: ["lines-come-from-the-job"] },
  "ignores stock": { build: makeBuild({ ignoreStock: true }), mustFail: ["stock-checked-before-ordering"] },
  "types a price": { build: makeBuild({ typedPrice: true }), mustFail: ["supplier-catalogue-is-the-only-source"] },
  "orders twice": { build: makeBuild({ noDedupe: true }), mustFail: ["one-order-per-job-and-supplier"] },
  "releases everything by rule": { build: makeBuild({ releaseAll: true }), mustFail: ["threshold-needs-a-person"] },
  "ignores lead time": { build: makeBuild({ noLeadNotify: true }), mustFail: ["lead-time-is-data"] },
  "records any docket": { build: makeBuild({ acceptAnyDocket: true }), mustFail: ["delivery-matches-back"] },
  "absorbs variances": { build: makeBuild({ absorbVariance: true }), mustFail: ["variance-is-a-queue", "nothing-is-substituted-silently", "the-record-by-job"] },
  "accepts substitutes by rule": { build: makeBuild({ autoAcceptSubs: true }), mustFail: ["nothing-is-substituted-silently"] },
  "never matches dockets": { build: makeBuild({ skipDockets: true }), mustFail: ["delivery-matches-back", "variance-is-a-queue", "nothing-is-substituted-silently", "the-record-by-job"] },
};

let bad = 0;
const caught = new Set();
for (const [name, m] of Object.entries(mutants)) {
  const env = await run(m.build);
  const red = new Set(env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId));
  const survived = m.mustFail.filter((id) => !red.has(id));
  if (name !== "do-nothing") for (const id of red) caught.add(id);
  console.log(`${survived.length ? "WEAK" : "ok  "}  ${name}: red ${[...red].join(", ") || "none"}${survived.length ? `  SURVIVED ${survived.join(", ")}` : ""}`);
  bad += survived.length;
}
const uncaught = claimed.filter((id) => !caught.has(id));
if (uncaught.length) {
  console.log(`No broken build turns these red: ${uncaught.join(", ")}`);
  bad += uncaught.length;
}
console.log(bad ? `\n${bad} weak scenario(s).` : `\nEvery claimed check (${claimed.length}) goes red for the do-nothing build and for a broken one.`);
process.exitCode = bad ? 1 : 0;

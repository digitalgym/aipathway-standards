/**
 * Runs the scenarios against each broken build and prints which checks went
 * red. Every check claimed green for build.mjs must go red for do-nothing and
 * for at least one broken build. Writes nothing.
 *
 *   node broken/check.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "../scenarios.mjs";
import { broken } from "./builds.mjs";

const SLUG = "compliance-calendar-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const redBy = new Map();
for (const [name, b] of Object.entries(broken)) {
  const env = await runStandard(std.checks, scenarios, b, {
    standard: SLUG,
    spec: std.spec,
    specVersion: std.version,
    environment: "stub",
  });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) redBy.set(n, [...(redBy.get(n) ?? []), name]);
  console.log(`${name.padEnd(15)} red: ${red.join(", ") || "none"}`);
}

// The checks build.mjs claims as pass or shape_only.
const claimed = [1, 2, 3, 4, 5, 6, 7, 8];
const weak = claimed.filter((n) => !(redBy.get(n) ?? []).includes("do-nothing") || (redBy.get(n) ?? []).length < 2);
console.log(
  weak.length
    ? `\nTOO WEAK: ${weak.join(", ")}`
    : "\nEvery claimed check goes red for do-nothing and for at least one broken build.",
);
process.exitCode = weak.length ? 1 : 0;

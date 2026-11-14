/**
 * Fetch the checks, run your build against them, print the result.
 *
 *   node run.mjs
 *
 * Nothing here needs editing. The files that do are build.mjs
 * and scenarios.mjs.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

// .env beside this file, written by `npx @aipathway/conformance connect` and
// kept out of git. What is already in the environment wins.
try {
  for (const line of (await readFile(new URL("./.env", import.meta.url), "utf8")).split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] ??= m[2].replace(/^"(.*)"$/, "$1");
  }
} catch {
  // No .env: fine on the stub, and the hosted ports file says what is missing.
}

const SLUG = "month-end-close-build-standard";
const origin = process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au";
const env = process.env.AIPATHWAY_ENV === "production" ? "production" : "stub";

const std = await fetchChecks(SLUG, origin);

// Which provider the live step runs on. The stub by default; the hosted
// provider once you switch it, which is the moment the standard says you start
// paying. It is recorded in the manifest so a green run says what it ran on.
const provider =
  process.env.AIPATHWAY_PROVIDER ?? (env === "production" ? (std.provider?.production ?? "own_systems") : (std.provider?.stub ?? "stub"));

// No live port map is published for this standard, so there is no production
// run. Running the stub scenarios again under a production label would write a
// manifest that says "production" about a stub, so the run refuses instead.
if (env === "production") {
  console.error(
    "No production run for this standard yet: its live port map is not published, " +
      "so AIPATHWAY_ENV=production would only rerun the stub. Run node run.mjs on the stub. " +
      (std.with_us_next ?? ""),
  );
  process.exit(1);
}
const scenariosToRun = scenarios;

const envelope = await runStandard(std.checks, scenariosToRun, build, {
  standard: SLUG,
  spec: std.spec,
  // The edition of the standard this run asserts against, so a later run can
  // say the standard moved. Falls back to the envelope schema version only when
  // the site is older than the field.
  specVersion: std.version ?? std.envelope_version,
  environment: env,
});

const SYMBOL = {
  pass: "PASS",
  fail: "FAIL",
  shape_only: "SHAPE",
  with_us: "WITH US",
  evidence_required: "EVIDENCE",
};

let green = 0;
let red = 0;

for (const r of envelope.results) {
  const mark = SYMBOL[r.verdict] ?? r.verdict;
  console.log(`${String(r.n).padStart(2)}  ${mark.padEnd(9)} ${r.title}`);
  if (r.verdict === "fail") {
    red += 1;
    console.log(`    expected: ${r.expected}`);
    console.log(`    actual:   ${r.actual}`);
  }
  if (r.verdict === "pass") green += 1;
}

const withUs = envelope.results.filter((r) => r.verdict === "with_us");
const evidence = envelope.results.filter((r) => r.verdict === "evidence_required");

console.log(`\n${green} green, ${red} red, ${envelope.results.length} checked.`);
console.log(`Standard: ${std.source}  edition ${std.version ?? "(unversioned)"}`);
console.log(`Provider: ${provider}`);

// A verdict without a next action is a verdict an agent will improvise on, and
// the improvisation that costs the most is standing up telephony. So each
// non-green class says what to do, in one line, from the standard's own data.
if (withUs.length > 0) {
  console.log(`\nwith_us (${withUs.length}): ${std.with_us_next ?? "runs on the production provider. Do not build it."}`);
}
if (evidence.length > 0) {
  console.log(`\nevidence_required (${evidence.length}): not software. Ask the operator the measurement question each one names, attach the answer, do not write code for it.`);
}

// THE MANIFEST. What ran, against which edition, on which provider, with what
// result per check. This is the artefact to hand over: to the office as the
// record of the build, to us with a failing check id for a fixed price, or to
// the audit instead of a PDF. envelope.json is the full trace beside it.
const manifest = {
  spec: std.spec,
  standard: SLUG,
  edition: std.version ?? null,
  source: std.source,
  ran_at: new Date().toISOString(),
  environment: env,
  provider,
  provider_block: std.provider ?? null,
  tally: { green, red, with_us: withUs.length, evidence_required: evidence.length, total: envelope.results.length },
  checks: envelope.results.map((r) => ({ id: r.checkId, n: r.n, title: r.title, verdict: r.verdict })),
  next: {
    ...(red > 0 ? { fail: "fix the named checks, or send the id for a fixed price" } : {}),
    ...(withUs.length > 0 ? { with_us: std.with_us_next ?? "runs on the production provider" } : {}),
    ...(evidence.length > 0 ? { evidence_required: "attach what proves each one; not a software check" } : {}),
  },
};
await writeFile("manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
await writeFile("envelope.json", JSON.stringify(envelope, null, 2) + "\n", "utf8");
console.log("\nWrote manifest.json and envelope.json.");

if (red > 0) {
  console.log(
    "\nA red check is a fixture. It names one check and carries what went in " +
      "and what your build did, which is enough to get a fixed price for that " +
      "step without anybody reconstructing your business.",
  );
}

process.exitCode = red > 0 ? 1 : 0;

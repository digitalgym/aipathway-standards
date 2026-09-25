#!/usr/bin/env node
/**
 * conformance — fetch a published standard's checks and show what a run would
 * assert, or print the checks as JSON for your own harness.
 *
 *   npx @aipathway/conformance list
 *   npx @aipathway/conformance show booked-after-hours-build-standard
 *   npx @aipathway/conformance json booked-after-hours-build-standard
 *   npx @aipathway/conformance init booked-after-hours-build-standard [dir]
 *
 * `init` writes a folder that runs: the harness, a build file to implement, and
 * one scenario per check carrying that check's own words. Every check starts
 * red, so the first run is a real result rather than a green tick nobody
 * earned.
 *
 * It still does not discover or launch anybody's existing code, because
 * guessing how somebody's project boots is how a tool becomes a framework. It
 * writes a new folder beside it; wiring the two together is the builder's call.
 */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fetchChecks } from "../dist/fetch-checks.js";
import { scaffold } from "../dist/init-templates.js";

const KNOWN = [
  "booked-after-hours-build-standard",
  "debtor-chasing-build-standard",
  "fire-service-pack-standard",
  "compliance-calendar-build-standard",
  "cited-answer-build-standard",
  "database-reactivation-build-standard",
  "rent-arrears-build-standard",
  "invoice-check-build-standard",
  "rejected-pack-build-standard",
  "multi-site-conformance-build-standard",
  "quote-out-build-standard"
];

const [cmd, slug] = process.argv.slice(2);
const origin = process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au";

if (cmd === "list") {
  for (const s of KNOWN) console.log(s);
  process.exit(0);
}

if (!cmd || !slug) {
  console.error("usage: conformance <list|show|json|init> [standard-slug] [dir]");
  process.exit(2);
}

const std = await fetchChecks(slug, origin).catch((err) => {
  console.error(String(err.message ?? err));
  process.exit(1);
});

if (cmd === "json") {
  console.log(JSON.stringify(std, null, 2));
  process.exit(0);
}

if (cmd === "init") {
  const dir = process.argv[4] ?? slug;

  // Refuse a directory that already has something in it. `init` writes six
  // files with ordinary names; silently overwriting somebody's build.mjs
  // because they ran the command twice is not a trade worth making.
  if (existsSync(dir)) {
    const existing = await readdir(dir).catch(() => []);
    if (existing.length > 0) {
      console.error(`${dir} already exists and is not empty. Pass another directory.`);
      process.exit(1);
    }
  }

  const require = createRequire(import.meta.url);
  const { version } = require("../package.json");

  await mkdir(dir, { recursive: true });
  const files = scaffold(std, slug, version);
  for (const f of files) {
    await mkdir(join(dir, dirname(f.name)), { recursive: true });
    await writeFile(join(dir, f.name), f.contents, "utf8");
  }

  const runnable = std.checks.filter((c) => c.assertable !== "production").length;

  console.log(`\n${std.spec}  ${std.standard}`);
  console.log(`${files.length} files in ${dir}/\n`);
  for (const f of files) console.log(`  ${f.name}`);
  console.log(`\n${runnable} checks to turn green. They all start red.\n`);
  console.log(`  cd ${dir}`);
  console.log("  npm install");
  console.log("  node run.mjs\n");
  console.log(
    "Then implement build.mjs and the `holds` in scenarios.mjs. AGENTS.md in\n" +
      "that folder is written for a coding agent if you would rather hand it over.\n",
  );
  process.exit(0);
}

console.log(`\n${std.spec}  ${std.version ?? "(unversioned)"}  ${std.source}\n`);
console.log(std.how_to_read + "\n");
for (const c of std.checks) {
  const where =
    c.assertable === "production"
      ? "runs with us"
      : c.assertable === "precondition"
        ? "needs evidence"
        : c.assertable === "both"
          ? "shape here, truth live"
          : "here";
  console.log(`${String(c.n).padStart(2)}. ${c.title}`);
  console.log(`    ${where}  ports: ${c.ports.join(", ")}`);
  console.log(`    inject:  ${c.stimulus}`);
  console.log(`    assert:  ${c.assertion}`);
  if (c.stubLimit) console.log(`    limit:   ${c.stubLimit}`);
  console.log();
}

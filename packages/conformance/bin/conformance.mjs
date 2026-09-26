#!/usr/bin/env node
/**
 * conformance — fetch a published standard's checks and show what a run would
 * assert, or print the checks as JSON for your own harness.
 *
 *   npx @aipathway/conformance list
 *   npx @aipathway/conformance show booked-after-hours-build-standard
 *   npx @aipathway/conformance json booked-after-hours-build-standard
 *   npx @aipathway/conformance init booked-after-hours-build-standard [dir]
 *   npx @aipathway/conformance connect [dir] [--wait]
 *
 * `connect` gets a key from the hosted provider without leaving the terminal:
 * it prints a link and a code, the account owner approves in a browser, and the
 * key lands in `.env` beside the scaffold. Then it says what the account still
 * needs and which link the owner opens next. It never asks for the scope that
 * makes a phone ring.
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
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, resolve } from "node:path";
import { fetchChecks } from "../dist/fetch-checks.js";
import { scaffold } from "../dist/init-templates.js";
import {
  CONNECT_SCOPES,
  DEFAULT_ORIGIN,
  ensureIgnored,
  mcpCall,
  parseEnv,
  renderEnv,
  requestKey,
  summariseSetup,
  waitForDecision,
} from "../dist/connect.js";

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
  "quote-out-build-standard",
  "advice-file-build-standard",
  "knowledge-graph-build-standard",
  "knowledge-base-build-standard",
  "invoice-out-build-standard",
  "dispatch-board-build-standard",
  "inbox-triage-build-standard",
  "follow-up-build-standard",
  "two-records-build-standard",
  "timesheet-check-build-standard",
  "material-order-build-standard",
  "recurring-report-build-standard"
];

const [cmd, slug] = process.argv.slice(2);
const origin = process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au";

if (cmd === "list") {
  for (const s of KNOWN) console.log(s);
  process.exit(0);
}

if (cmd === "connect") {
  const args = process.argv.slice(3);
  const wait = args.includes("--wait");
  const dir = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const ovOrigin = process.env.OFFICE_VOICE_ORIGIN ?? DEFAULT_ORIGIN;
  const mcpUrl = process.env.OFFICE_VOICE_MCP_URL ?? `${ovOrigin}/api/mcp`;
  const envPath = join(dir, ".env");
  const existingEnv = await readFile(envPath, "utf8").catch(() => "");
  let env = parseEnv(existingEnv);
  let key = process.env.OFFICE_VOICE_API_KEY ?? env.OFFICE_VOICE_API_KEY;

  if (key) {
    console.log(`Using the key already in ${envPath.replace(process.cwd(), ".")}.`);
  } else {
    const req = await requestKey(ovOrigin, {
      name: `AI Pathway conformance (${basename(dir)})`,
      scopes: CONNECT_SCOPES,
      requester: `conformance connect on ${hostname()}`,
    });
    console.log("\nAsk the account owner to open this link and approve the key:\n");
    console.log(`    ${req.verify_url}\n`);
    console.log(`The code on their screen must read  ${req.user_code}  or they should deny it.`);
    console.log(`It grants: ${CONNECT_SCOPES.join(", ")}. It cannot make a phone ring.`);
    console.log(`Waiting up to ${Math.round(req.expires_in / 60)} minutes...`);
    const decided = await waitForDecision(req, undefined, () => process.stdout.write("."));
    console.log("");
    if (decided.status !== "approved") {
      console.error(`Not approved: ${decided.status}. Run connect again to ask again.`);
      process.exit(1);
    }
    key = decided.key;
    const vars = { OFFICE_VOICE_API_KEY: key };
    if (decided.tenant_ids?.length === 1) vars.OFFICE_VOICE_TENANT_ID = decided.tenant_ids[0];
    await mkdir(dir, { recursive: true });
    await writeFile(envPath, renderEnv(existingEnv, vars), { encoding: "utf8", mode: 0o600 });
    const giPath = join(dir, ".gitignore");
    await writeFile(giPath, ensureIgnored(await readFile(giPath, "utf8").catch(() => "")), "utf8");
    env = parseEnv(await readFile(envPath, "utf8"));
    console.log(`Approved. Key written to ${envPath} (and .env added to .gitignore). run.mjs reads it.`);
    if ((decided.tenant_ids?.length ?? 0) > 1) {
      console.log(`This key reaches ${decided.tenant_ids.length} orgs. Set OFFICE_VOICE_TENANT_ID in .env to the one to run against:\n  ${decided.tenant_ids.join("\n  ")}`);
    }
  }

  const tenantArg = process.env.OFFICE_VOICE_TENANT_ID ?? env.OFFICE_VOICE_TENANT_ID;
  const setupArgs = tenantArg ? { tenant_id: tenantArg } : {};
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const setup = await mcpCall(mcpUrl, key, "get_setup", setupArgs).catch((err) => ({ error: String(err.message ?? err) }));
    if (setup.error) {
      console.error(`get_setup: ${setup.error}`);
      process.exit(1);
    }
    const summary = summariseSetup(setup);
    console.log("\n" + summary.lines.join("\n"));
    if (summary.openNext) {
      console.log(`\nNext, the owner opens this link to ${summary.openNext.why}:\n\n    ${summary.openNext.url}\n`);
    }
    if (summary.complete) {
      console.log("\nSetup is complete. Run the checks against the account:");
      console.log("  AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=<the standard's provider> node run.mjs");
      break;
    }
    if (!wait || Date.now() > deadline) {
      console.log("\nRun `conformance connect --wait` to keep checking until the owner has finished, or call get_setup yourself.");
      break;
    }
    process.stdout.write("waiting for the owner...");
    await new Promise((r) => setTimeout(r, 10_000));
  }
  process.exit(0);
}

if (!cmd || !slug) {
  console.error("usage: conformance <list|show|json|init|connect> [standard-slug] [dir]");
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

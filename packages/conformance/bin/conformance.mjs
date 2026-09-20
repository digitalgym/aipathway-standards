#!/usr/bin/env node
/**
 * conformance — fetch a published standard's checks and show what a run would
 * assert, or print the checks as JSON for your own harness.
 *
 *   npx @aipathway/conformance list
 *   npx @aipathway/conformance show booked-after-hours-build-standard
 *   npx @aipathway/conformance json booked-after-hours-build-standard
 *
 * Running your own build against these needs a few lines of glue: see the
 * example in the README. This CLI deliberately does not try to discover or
 * launch your build, because guessing how somebody's code starts is how a tool
 * becomes a framework.
 */
import { fetchChecks } from "../dist/fetch-checks.js";

const KNOWN = [
  "booked-after-hours-build-standard",
  "debtor-chasing-build-standard",
  "rent-arrears-build-standard",
  "database-reactivation-build-standard",
  "invoice-check-build-standard",
  "rejected-pack-build-standard",
  "compliance-calendar-build-standard",
  "cited-answer-build-standard",
  "multi-site-conformance-build-standard",
  "fire-service-pack-standard",
];

const [cmd, slug] = process.argv.slice(2);
const origin = process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au";

if (cmd === "list") {
  for (const s of KNOWN) console.log(s);
  process.exit(0);
}

if (!cmd || !slug) {
  console.error("usage: conformance <list|show|json> [standard-slug]");
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

console.log(`\n${std.spec}  ${std.source}\n`);
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

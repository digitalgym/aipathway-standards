/**
 * The scenarios, run against builds that should fail them.
 *
 *   node negatives.mjs
 *
 * A do-nothing build, and builds that each break one rule by bending a port.
 * Every check the run claims (1 to 12) has to go red for the do-nothing build
 * and for at least one broken build, or its scenario is too weak. Exits 1 if
 * any claimed check stays green for every one of them.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("database-reactivation-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const wrap = (patch) => (ports, ...rest) => build({ ...ports, ...patch(ports) }, ...rest);

const broken = {
  "ignores-gate": wrap(() => ({ gate: () => ({ allowed: true }) })),
  "hides-gaps": wrap(() => ({ missingFields: () => [] })),
  "no-skip-reasons": wrap(() => ({ skip: () => {} })),
  "ignores-cap": wrap(() => ({ dailyCap: () => 99 })),
  "generic-opener": wrap((p) => ({
    listToday: (rows) => p.listToday(rows.map((r) => ({ ...r, opener: "Hi, thinking of selling?" }))),
    sendStep: (id, step) => p.sendStep(id, step, "Hi, thinking of selling? Reply STOP to opt out."),
  })),
  "reversed-rank": wrap((p) => ({ rank: (entries) => p.rank([...entries].reverse()) })),
  "forgets-history": wrap((p) => ({
    readContacts: () => p.readContacts().map((c) => ({ ...c, lastOutcomeAt: undefined, sequenceStartedAt: undefined })),
  })),
  "one-campaign": wrap((p) => ({ readContacts: () => p.readContacts().map((c) => ({ ...c, ownerType: "investor", freshSaleNearby: true })) })),
  "ignores-replies": (ports, ev, s) => (ev?.type === "reply.received" ? undefined : build(ports, ev, s)),
  "ignores-outcomes": (ports, ev, s) => (ev?.type === "outcome.marked" ? undefined : build(ports, ev, s)),
};

const claimed = new Set();
const redBy = {};
const run = async (b) => runStandard(std.checks, scenarios, b, { standard: "negatives", spec: std.spec, environment: "stub" });

for (const r of (await run(build)).results) if (r.verdict === "pass" || r.verdict === "shape_only") claimed.add(r.n);

const nothing = (await run(async () => {})).results;
const nothingGreen = nothing.filter((r) => claimed.has(r.n) && r.verdict !== "fail").map((r) => r.n);
console.log(`${"do-nothing".padEnd(18)} red: ${nothing.filter((r) => r.verdict === "fail").map((r) => r.n).join(",")}`);

for (const [name, b] of Object.entries(broken)) {
  const fails = (await run(b)).results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of fails) (redBy[n] ??= []).push(name);
  console.log(`${name.padEnd(18)} red: ${fails.join(",") || "none"}`);
}

const uncaught = [...claimed].filter((n) => !redBy[n]);
console.log(`\nclaimed: ${[...claimed].join(",")}`);
for (const n of [...claimed].sort((a, b) => a - b)) console.log(`  ${String(n).padStart(2)} red under: ${(redBy[n] ?? []).join(", ") || "NOTHING"}`);
if (nothingGreen.length || uncaught.length) {
  console.log(`\nToo weak: do-nothing green on ${nothingGreen.join(",") || "-"}; no broken build reddens ${uncaught.join(",") || "-"}`);
  process.exitCode = 1;
}

/**
 * Prove the scenarios can fail. Runs every scenario against a do-nothing
 * build and against one deliberately broken build per check, and exits 1 if
 * any check claimed green does not go red for them.
 *
 *   node redteam.mjs
 *
 * Each broken build is the real build with one port bent the way a careless
 * build would bend it, so the fault is the only difference.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const SLUG = "compliance-calendar-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");

const bent = (bend) => (ports, inputs) => build(bend(ports), inputs);

const broken = {
  "dates-derived-not-stored": (() => {
    // Stores the first date it sees and never asks again.
    const stored = new Map();
    return bent((p) => ({
      ...p,
      dueDate: (id) => (stored.has(id) ? stored.get(id) : (stored.set(id, p.dueDate(id)), stored.get(id))),
    }));
  })(),
  // Edits rules in place: only the current version is kept.
  "superseded-versions-retained": bent((p) => ({ ...p, readRuleVersions: (t, s) => p.readRuleVersions(t, s).slice(-1) })),
  // One national rule set.
  "rules-per-jurisdiction": bent((p) => ({ ...p, readRuleVersions: (t) => p.readRuleVersions(t, "QLD") })),
  // Quietly skips a contract with no practical completion date.
  "unknown-anchor-surfaces": bent((p) => ({ ...p, markUnknownAnchor: () => {}, escalate: (r, d) => (r.includes("unknown") ? undefined : p.escalate(r, d)) })),
  // Takes a tick as proof.
  "evidence-of-completion": bent((p) => ({ ...p, complete: (id, ref) => p.complete(id, ref ?? "tick") })),
  // Treats a refusal as the end of it.
  "refusal-is-dated-outcome": bent((p) => ({ ...p, recordRefusal: (id) => p.complete(id, "refusal-letter") })),
  // Sends the drafted request itself.
  "notice-needs-a-person": bent((p) => ({ ...p, prepareNotice: (id) => (p.prepareNotice(id), p.releaseNotice(id, "Retention Book")) })),
  // Stops looking at the overdue list once the money is in.
  "breach-does-not-self-clear": (() => {
    let completed = false;
    return bent((p) => ({
      ...p,
      complete: (id, ref) => {
        const r = p.complete(id, ref);
        if (r?.accepted) completed = true;
        return r;
      },
      sweep: () => (completed ? [] : p.sweep()),
    }));
  })(),
};

const claimed = scenarios.map((s) => s.checkId).filter((id) => id in broken);
let weak = 0;

async function redFor(label, b, only) {
  const env = await runStandard(std.checks, scenarios, b, { standard: SLUG, spec: std.spec, specVersion: std.version, environment: "stub" });
  for (const r of env.results) {
    if (only && r.checkId !== only) continue;
    if (!claimed.includes(r.checkId)) continue;
    const red = r.verdict === "fail";
    if (!red) weak += 1;
    console.log(`${red ? "red  " : "GREEN"}  ${label.padEnd(34)} ${r.n}. ${r.title}`);
  }
}

await redFor("do-nothing build", async () => []);
for (const [checkId, b] of Object.entries(broken)) await redFor(`broken: ${checkId}`, b, checkId);

console.log(weak ? `\n${weak} check(s) did not go red. The scenario is too weak.` : "\nEvery claimed check went red for the do-nothing build and its broken build.");
process.exitCode = weak ? 1 : 0;

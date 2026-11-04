/**
 * Proves the scenarios are strong enough: every claimed check must go red for
 * a build that does nothing, and for at least one deliberately broken build.
 *
 *   node mutants.mjs
 *
 * It runs the scenarios directly (no network, no manifest). Exit code 1 if any
 * check stays green against the do-nothing build or against every mutant, or
 * if the real build does not hold.
 */
import { makeBuild, build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const NOT_SOFTWARE = new Set(["survives-the-builder"]);

const flaws = [
  "skipResolve", "ignoreLicence", "noTravel", "noRouteOrder", "ignoreWindow", "alwaysCreate",
  "trustNullWrite", "writeBeforeAccept", "noGate", "dropDisplaced", "ignoreConsent", "doubleSend",
  "noCustomerMessage", "bareNotice", "noTechNotice", "ignoreVersion", "ignoreChange", "noEscalate", "noEvidence",
];
const builds = { "do-nothing": async () => {}, ...Object.fromEntries(flaws.map((n) => [n, makeBuild({ [n]: true })])) };

async function held(scenario, b) {
  const world = scenario.world();
  try {
    await scenario.drive(b, world);
    return scenario.holds(world) === true;
  } catch {
    return false;
  }
}

let bad = 0;
const unused = new Set(flaws);
for (const s of scenarios) {
  if (NOT_SOFTWARE.has(s.checkId)) continue;
  const ok = await held(s, real);
  const redFor = [];
  for (const [name, b] of Object.entries(builds)) if (!(await held(s, b))) redFor.push(name);
  for (const n of redFor) unused.delete(n);
  const fine = ok && redFor.includes("do-nothing") && redFor.some((n) => n !== "do-nothing");
  if (!fine) bad += 1;
  console.log(`${fine ? "ok  " : "WEAK"} ${s.checkId}\n     real build holds: ${ok}; red for: ${redFor.join(", ") || "nothing"}`);
}
if (unused.size) console.log(`\nMutants no scenario catches: ${[...unused].join(", ")}`);
console.log(bad ? `\n${bad} scenario(s) too weak or real build failing.` : "\nEvery claimed check goes red for the do-nothing build and at least one broken build.");
process.exitCode = bad ? 1 : 0;

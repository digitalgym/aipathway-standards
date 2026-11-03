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

const builds = {
  "do-nothing": async () => {},
  skipResolve: makeBuild({ skipResolve: true }),
  ignoreLicence: makeBuild({ ignoreLicence: true }),
  noTravel: makeBuild({ noTravel: true }),
  ignoreWindow: makeBuild({ ignoreWindow: true }),
  alwaysCreate: makeBuild({ alwaysCreate: true }),
  trustNullWrite: makeBuild({ trustNullWrite: true }),
  noGate: makeBuild({ noGate: true }),
  dropDisplaced: makeBuild({ dropDisplaced: true }),
  ignoreConsent: makeBuild({ ignoreConsent: true }),
  doubleSend: makeBuild({ doubleSend: true }),
  noCustomerMessage: makeBuild({ noCustomerMessage: true }),
  bareNotice: makeBuild({ bareNotice: true }),
  noTechNotice: makeBuild({ noTechNotice: true }),
  ignoreVersion: makeBuild({ ignoreVersion: true }),
  ignoreChange: makeBuild({ ignoreChange: true }),
  noEscalate: makeBuild({ noEscalate: true }),
  noEvidence: makeBuild({ noEvidence: true }),
};

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
for (const s of scenarios) {
  if (NOT_SOFTWARE.has(s.checkId)) continue;
  const ok = await held(s, real);
  const redFor = [];
  for (const [name, b] of Object.entries(builds)) if (!(await held(s, b))) redFor.push(name);
  const doNothingRed = redFor.includes("do-nothing");
  const brokenRed = redFor.filter((n) => n !== "do-nothing");
  const fine = ok && doNothingRed && brokenRed.length > 0;
  if (!fine) bad += 1;
  console.log(`${fine ? "ok  " : "WEAK"} ${s.checkId}\n     real build holds: ${ok}; red for: ${redFor.join(", ") || "nothing"}`);
}
console.log(bad ? `\n${bad} scenario(s) too weak or real build failing.` : "\nEvery claimed check goes red for the do-nothing build and at least one broken build.");
process.exitCode = bad ? 1 : 0;

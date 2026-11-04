/**
 * Proves the scenarios are strong enough: every claimed check must go red
 * for a build that does nothing and for at least one deliberately broken
 * build, while the real build holds.
 *
 *   node mutants.mjs
 *
 * It also runs Visit Round's own gate, ahead of the standard: a visit whose
 * maintenance contract has lapsed is never booked, and its contract owner is
 * named. No network, no manifest. Exit code 1 on any weak scenario.
 */
import { DispatchWorld } from "@aipathway/conformance";
import { makeBuild, build as real } from "./build.mjs";
import { scenarios, visit, consent, GEO, NOW, DESK, TOM } from "./scenarios.mjs";

const NOT_SOFTWARE = new Set(["survives-the-builder"]);

const lapsedGate = {
  checkId: "own:contract-lapsed",
  // A contract that ended in October has a visit raised for November, beside
  // a live contract's visit. Only the live one is booked.
  world: () =>
    new DispatchWorld({
      now: NOW,
      geocoder: GEO,
      dispatcher: DESK,
      techs: [TOM],
      jobs: [
        visit("L1", "C1", "22 King William St Adelaide", "08:00", "12:00", 60, { contract: { id: "MC-L1", everyMonths: 3, endsOn: "2026-10-31", owner: "Sophie Grant" } }),
        visit("L2", "C2", "61 Jetty Rd Glenelg", "08:00", "12:00", 60),
      ],
      consents: [consent("C1"), consent("C2")],
    }),
  drive: (build, w) => build(w.ports()),
  holds: (w) =>
    w.slotsFor("L1").length === 0 &&
    w.messagesTo("C1").length === 0 &&
    w.escalationsFor("L1").some((e) => e.reason === "contract_lapsed" && e.owner === "Sophie Grant") &&
    w.slotsFor("L2").length === 1,
};

const builds = {
  "do-nothing": async () => {},
  skipResolve: makeBuild({ skipResolve: true }),
  skipLicence: makeBuild({ skipLicence: true }),
  noTravel: makeBuild({ noTravel: true }),
  ignoreWindow: makeBuild({ ignoreWindow: true }),
  alwaysNew: makeBuild({ alwaysNew: true }),
  trustNoId: makeBuild({ trustNoId: true }),
  noGate: makeBuild({ noGate: true }),
  dropMoved: makeBuild({ dropMoved: true }),
  skipConsent: makeBuild({ skipConsent: true }),
  sendTwice: makeBuild({ sendTwice: true }),
  noConfirm: makeBuild({ noConfirm: true }),
  bareBrief: makeBuild({ bareBrief: true }),
  noBrief: makeBuild({ noBrief: true }),
  ignoreVersion: makeBuild({ ignoreVersion: true }),
  ignoreChange: makeBuild({ ignoreChange: true }),
  silent: makeBuild({ silent: true }),
  noEvidence: makeBuild({ noEvidence: true }),
  bookLapsed: makeBuild({ bookLapsed: true }),
};

async function held(scenario, b) {
  const w = scenario.world();
  try {
    await scenario.drive(b, w);
    return scenario.holds(w) === true;
  } catch {
    return false;
  }
}

let bad = 0;
for (const s of [...scenarios, lapsedGate]) {
  if (NOT_SOFTWARE.has(s.checkId)) continue;
  const ok = await held(s, real);
  const red = [];
  for (const [name, b] of Object.entries(builds)) if (!(await held(s, b))) red.push(name);
  const fine = ok && red.includes("do-nothing") && red.some((n) => n !== "do-nothing");
  if (!fine) bad += 1;
  console.log(`${fine ? "ok  " : "WEAK"} ${s.checkId}\n     real build holds: ${ok}; red for: ${red.join(", ") || "nothing"}`);
}
console.log(bad ? `\n${bad} scenario(s) too weak or real build failing.` : "\nEvery claimed check goes red for the do-nothing build and at least one broken build.");
process.exitCode = bad ? 1 : 0;

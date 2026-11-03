/**
 * Proves the scenarios can fail. Runs every claimed scenario against a
 * do-nothing build and against deliberately broken builds, and exits 1 if any
 * check a broken build should fail still holds.
 *
 *   node adversarial.mjs
 *
 * Writes nothing. The evidence is the run of run.mjs; this is the proof that a
 * green there was not free.
 */
import { makeBuild } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const CLAIMED = scenarios.filter((s) => s.checkId !== "survives-the-builder").map((s) => s.checkId);

// Each broken build, and the checks it must turn red.
const BROKEN = {
  doNothing: CLAIMED,
  skipTrace: ["entry-traces-to-person-day-job", "anomalies-are-a-closed-list"],
  typedTotals: ["totals-computed-never-typed"],
  noOwner: ["anomalies-are-a-closed-list"],
  noCards: ["award-rule-is-cited-with-an-edition", "superseded-rule-cannot-apply", "the-record-by-person-and-period"],
  ignoreDates: ["award-rule-is-cited-with-an-edition", "superseded-rule-cannot-apply"],
  cardOnUnclear: ["no-interpretation", "superseded-rule-cannot-apply"],
  autoResolve: ["anomaly-is-resolved-by-a-person-with-a-reason"],
  noEvidence: ["anomaly-is-resolved-by-a-person-with-a-reason", "the-record-by-person-and-period"],
  noGate: ["nothing-reaches-payroll-without-a-release"],
  ignoreOpen: ["nothing-reaches-payroll-without-a-release"],
  exportTwice: ["one-export-per-period"],
  silentWhenClean: ["the-run-publishes-regardless"],
};

async function holdsFor(build, s) {
  const w = s.world();
  try {
    await s.drive(build, w);
    return s.holds(w) === true;
  } catch {
    return false;
  }
}

let bad = 0;
const good = makeBuild();
for (const s of scenarios.filter((x) => CLAIMED.includes(x.checkId))) {
  if (!(await holdsFor(good, s))) {
    console.log(`REAL BUILD FAILS ${s.checkId}`);
    bad += 1;
  }
}
for (const [name, mustFail] of Object.entries(BROKEN)) {
  const broken = makeBuild({ [name]: true });
  const stillHeld = [];
  for (const id of mustFail) {
    if (await holdsFor(broken, scenarios.find((s) => s.checkId === id))) stillHeld.push(id);
  }
  console.log(`${name.padEnd(16)} ${stillHeld.length === 0 ? "red as expected" : `STILL HOLDS: ${stillHeld.join(", ")}`} (${mustFail.length} check(s))`);
  bad += stillHeld.length;
}
console.log(bad === 0 ? "\nEvery claimed check goes red for a broken build." : `\n${bad} problem(s).`);
process.exitCode = bad === 0 ? 0 : 1;

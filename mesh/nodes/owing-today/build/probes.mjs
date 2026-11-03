/**
 * Probes: are the scenarios strong enough to fail a bad build?
 *
 *   node probes.mjs
 *
 * Runs every scenario in scenarios.mjs against a build that does nothing and
 * against deliberately broken copies of build.mjs (each one a single source
 * edit, written to a temp folder and imported from there). A check the real
 * build passes must go red for the do-nothing build and for the mutant aimed
 * at it. If one does not, the scenario is too weak: fix the scenario, never
 * the assertion. Exits 1 if any probe survives.
 */
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

/** [name, the check it must turn red, source text, replacement]. Each edit must apply exactly once. */
const MUTANTS = [
  ["issue-date-overdue", "overdue-off-due-date", "new Date(i.dueAt).getTime() < now.getTime() && daysPastDue(i, now) >= 1", "now.getTime() - new Date(i.issuedAt).getTime() > 30 * DAY"],
  ["one-bucket", "four-buckets", "if (SEVERITY[bucketFor(days)] > SEVERITY[row.bucket]) row.bucket = bucketFor(days);", ""],
  ["broken-promise-not-first", "broken-promise-outranks", '(b.bucket === "broken_promise") - (a.bucket === "broken_promise") || ', ""],
  ["rank-by-age", "rank-by-amount-at-risk", "b.amount - a.amount || b.oldestDays - a.oldestDays", "b.oldestDays - a.oldestDays || b.amount - a.amount"],
  ["row-per-invoice", "one-customer-one-conversation", "rows.get(inv.customerId) ??", "rows.get(inv.id) ??"],
  ["no-relationship-lift", "relationship-balances-excluded", "row.amount >= policy.relationshipCents", "false"],
  ["promise-amount-invented", "promise-is-an-object", "amount: amountFromReply(wake.said)", "amount: amountFromReply(wake.said) ?? inv.amount"],
  ["promise-ignored", "promised-date-is-followup", "if (promise && promise.date > today) continue;", ""],
  ["gate-skipped", "gate-under-ranking", "const decision = await ports.gate(e.customerId);", "const decision = { allowed: true };"],
  ["release-without-approver", "exceptions-attributable", "if (accepted !== true) {", "if (false) {"],
];

const doNothing = async () => {};

async function runAll(build) {
  const out = {};
  for (const s of scenarios) {
    if (s.checkId === "coverage-measured") continue; // closed by evidence, never by a run
    const world = s.world();
    try {
      await s.drive(build, world);
      out[s.checkId] = s.holds(world) === true;
    } catch {
      out[s.checkId] = false;
    }
  }
  return out;
}

const source = (await readFile(new URL("./build.mjs", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const dir = await mkdtemp(join(tmpdir(), "owing-today-probes-"));
let survived = 0;

try {
  const base = await runAll(real);
  const claimed = Object.keys(base).filter((k) => base[k]);
  console.log(`real build holds: ${claimed.length}/${Object.keys(base).length}`);

  const none = await runAll(doNothing);
  const noneSurvivors = claimed.filter((k) => none[k]);
  console.log(`do-nothing build: ${noneSurvivors.length === 0 ? "every claimed check red" : `SURVIVED ${noneSurvivors.join(", ")}`}`);
  survived += noneSurvivors.length;

  for (const [name, target, from, to] of MUTANTS) {
    const hits = source.split(from).length - 1;
    if (hits !== 1) throw new Error(`mutant ${name}: expected one match, found ${hits}`);
    const file = join(dir, `${name}.mjs`);
    await writeFile(file, source.replace(from, to), "utf8");
    const { build } = await import(pathToFileURL(file).href);
    const r = await runAll(build);
    const red = claimed.filter((k) => !r[k]);
    const ok = r[target] === false;
    if (!ok) survived += 1;
    console.log(`${ok ? "killed  " : "SURVIVED"} ${name.padEnd(26)} target ${target}${ok ? "" : " still holds"}; red: ${red.join(", ") || "none"}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(survived === 0 ? "\nEvery probe went red." : `\n${survived} probe(s) survived: a scenario is too weak.`);
process.exitCode = survived === 0 ? 0 : 1;

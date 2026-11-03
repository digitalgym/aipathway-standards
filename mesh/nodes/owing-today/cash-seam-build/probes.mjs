/**
 * Probes for the Cash Seam run: are the scenarios strong enough to fail a bad build?
 *
 *   node probes.mjs
 *
 * Runs every scenario against a build that does nothing and against broken
 * copies of build.mjs (source edits written to a temp folder and imported from
 * there). Most mutants break the Owing Today chase hop; one breaks a stand-in.
 * A check the real build holds must go red for the do-nothing build and for the
 * mutant aimed at it. Exits 1 if any probe survives.
 */
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

/** [name, the check it must turn red, [[source text, replacement], ...]]. Each edit must apply exactly once. */
const MUTANTS = [
  ["chase-reads-by-search", "identity-from-the-system-of-record", [["const job = await ports.readJob(inv.jobId);", "const job = (await ports.searchJobs({})).find((j) => j.id === inv.jobId) ?? null;"]]],
  ["null-invoice-counted-as-written", "no-external-id-no-write", [['if (!w.externalId) return raise(ports, owners, "invoice", job.id, "write_failed", "the ledger returned no invoice id");', ""]]],
  ["reminder-without-owner", "the-chain-carries-the-id", [['raise(ports, owners, "chase", inv.id, "debtor.queue_ready", text);', 'ports.escalate({ stage: "chase", ref: inv.id, reason: "debtor.queue_ready", owner: null, detail: text });']]],
  ["chase-not-yet-due", "confirmation-is-not-a-write", [["ledger.filter((r) => r.overdue)", "ledger"], ["if (!inv || !inv.overdue || !inv.jobId) continue;", "if (!inv || !inv.jobId) continue;"]]],
  ["chase-woken-by-chat", "named-unattended-trigger", [['if (!ev || ev.via === "chat") return undefined;', "if (!ev) return undefined;"], ['case "invoice_overdue":', 'case "chat_message":\n    case "invoice_overdue":']]],
  ["chase-past-exception", "exception-owner-travels", [["if (job.exception) {\n      // An open exception stops", "if (false) {\n      // An open exception stops"]]],
];

const doNothing = async () => {};

async function runAll(build) {
  const out = {};
  for (const s of scenarios) {
    if (s.checkId === "survives-the-builder") continue; // closed by evidence, never by a run
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
const dir = await mkdtemp(join(tmpdir(), "owing-today-cash-probes-"));
let survived = 0;

try {
  const base = await runAll(real);
  const claimed = Object.keys(base).filter((k) => base[k]);
  console.log(`real build holds: ${claimed.length}/${Object.keys(base).length}`);

  const none = await runAll(doNothing);
  const noneSurvivors = claimed.filter((k) => none[k]);
  console.log(`do-nothing build: ${noneSurvivors.length === 0 ? "every claimed check red" : `SURVIVED ${noneSurvivors.join(", ")}`}`);
  survived += noneSurvivors.length;

  for (const [name, target, edits] of MUTANTS) {
    let text = source;
    for (const [from, to] of edits) {
      const hits = text.split(from).length - 1;
      if (hits !== 1) throw new Error(`mutant ${name}: expected one match, found ${hits}`);
      text = text.replace(from, to);
    }
    const file = join(dir, `${name}.mjs`);
    await writeFile(file, text, "utf8");
    const { build } = await import(pathToFileURL(file).href);
    const r = await runAll(build);
    const red = claimed.filter((k) => !r[k]);
    const ok = r[target] === false;
    if (!ok) survived += 1;
    console.log(`${ok ? "killed  " : "SURVIVED"} ${name.padEnd(32)} target ${target}${ok ? "" : " still holds"}; red: ${red.join(", ") || "none"}`);
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(survived === 0 ? "\nEvery probe went red." : `\n${survived} probe(s) survived: a scenario is too weak.`);
process.exitCode = survived === 0 ? 0 : 1;

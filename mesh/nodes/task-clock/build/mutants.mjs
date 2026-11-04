/**
 * The scenarios must catch a build that does nothing and builds that break
 * one rule each. Run: node mutants.mjs. Exits 1 if any mutant survives a
 * check it should fail.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const wrap = (patch) => (ports) => build({ ...ports, ...patch(ports) });

const ALL = scenarios.map((s) => s.checkId);
const mutants = [
  { name: "do-nothing", build: async () => {}, mustFail: ALL },
  {
    name: "trusts the id without reading it",
    build: wrap(() => ({ readJob: async (system, id) => ({ system, id }), readLedger: async (system, id) => ({ system, id }) })),
    mustFail: ["names-its-record"],
  },
  {
    name: "makes a new type from the label",
    build: wrap((p) => ({ writeTask: (w) => p.writeTask(w.op === "create" && w.task.arrived_as ? { ...w, task: { ...w.task, type: w.task.arrived_as } } : w) })),
    mustFail: ["type-from-the-closed-list"],
  },
  {
    name: "takes the raiser as owner, due in a week",
    build: wrap((p) => ({
      writeTask: (w) =>
        p.writeTask(
          w.op === "create"
            ? { ...w, task: { ...w.task, owner: w.task.raised_by.standard, due_at: new Date(new Date(w.task.raised_at).getTime() + 7 * 864e5).toISOString() } }
            : w,
        ),
    })),
    mustFail: ["owner-and-clock-from-routing"],
  },
  {
    name: "never looks for an open task first",
    build: wrap((p) => ({ listTasks: (f) => (f.external_id ? Promise.resolve([]) : p.listTasks(f)) })),
    mustFail: ["one-item-per-record-and-type"],
  },
  {
    name: "ticks off what cleared upstream",
    build: wrap((p) => ({
      writeTask: (w) =>
        p.writeTask(w.op === "update" && w.fields.resolved_upstream ? { ...w, fields: { ...w.fields, status: "closed", closed: { by: "task-clock", outcome: "cleared" } } } : w),
    })),
    mustFail: ["nothing-auto-closes"],
  },
  {
    name: "drops the chase stop",
    build: wrap((p) => ({
      writeTask: (w) => p.writeTask(w.op === "create" ? { ...w, task: { ...w.task, stop_chase: null } } : w),
    })),
    mustFail: ["disputes-stay-with-a-person"],
  },
  {
    name: "nudges a dispute to the escalation row",
    build: wrap((p) => ({ nudge: (to, id, text) => p.nudge(/INV-22(07|10)/.test(text) ? "Sam" : to, id, text) })),
    mustFail: ["disputes-stay-with-a-person"],
  },
  {
    name: "nudges every run",
    build: wrap((p) => ({ writeTask: (w) => p.writeTask(w.op === "update" && w.fields.escalated_at ? { ...w, fields: {} } : w) })),
    mustFail: ["overdue-escalates-once"],
  },
  {
    name: "nudges before it is due",
    build: wrap((p) => ({ now: () => new Date(p.now().getTime() + 6 * 3_600_000) })),
    mustFail: ["overdue-escalates-once"],
  },
  {
    name: "stays quiet when nothing is open",
    build: wrap((p) => ({ publishList: (l) => (l.none ? Promise.resolve({ id: null }) : p.publishList(l)) })),
    mustFail: ["daily-summary-even-when-empty"],
  },
  {
    name: "publishes every run",
    build: wrap(() => ({ readList: async () => null })),
    mustFail: ["daily-summary-even-when-empty"],
  },
];

const std = await fetchChecks("exception-desk-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
let survived = 0;
for (const m of mutants) {
  const env = await runStandard(std.checks, scenarios, m.build, { standard: "exception-desk-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  const v = Object.fromEntries(env.results.map((r) => [r.checkId, r.verdict]));
  const missed = m.mustFail.filter((id) => v[id] !== "fail");
  if (missed.length) survived += 1;
  console.log(`${missed.length ? "SURVIVED" : "caught  "}  ${m.name}${missed.length ? `  (not red: ${missed.join(", ")})` : ""}`);
}
console.log(survived ? `\n${survived} mutant(s) survived.` : "\nEvery mutant caught.");
process.exitCode = survived ? 1 : 0;

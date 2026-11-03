/**
 * Negative runs for the Cash Seam scenarios: a do-nothing build and broken
 * builds, each the real build with one port bent. Every check the real build
 * claims must go red for the do-nothing build and for at least one broken
 * build, or the scenario is too weak.   node mutants.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const bend = (f) => (ports) => build({ ...ports, ...f(ports) });
const onBilling = (f) => (ports) => (ports.event()?.name === "job_completed" ? build({ ...ports, ...f(ports) }) : build(ports));

const MUTANTS = {
  "do-nothing": async () => {},
  "ignores-the-exception": onBilling((r) => ({ readJob: async (id) => { const j = await r.readJob(id); return j ? { ...j, exception: undefined } : j; } })),
  "null-is-success": onBilling((r) => ({
    writeInvoice: async (i) => { const x = await r.writeInvoice(i); return x.externalId ? x : { externalId: `INV-${i.jobId}` }; },
    readInvoice: async (id) => (await r.readInvoice(id)) ?? { id, jobId: id.slice(4) },
  })),
  "drops-the-quote-id": onBilling((r) => ({ writeInvoice: (i) => r.writeInvoice({ ...i, quoteId: null }) })),
  "matches-by-name": onBilling((r) => ({
    readJob: async (id) => { const j = await r.readJob(id); const twins = j ? await r.searchJobs({ name: j.customerName }) : []; return twins.at(-1) ?? j; },
  })),
  "no-trigger": onBilling((r) => ({ writeInvoice: (i) => r.writeInvoice({ ...i, trigger: null }) })),
  "sends-without-release": onBilling(() => ({ release: async () => {} })),
  "wrong-owner": onBilling((r) => ({ escalate: (x) => r.escalate({ ...x, owner: "whoever is on" }) })),
  "two-invoices": onBilling(() => ({ readLedger: async () => [] })),
  "acts-on-chat": (ports) => {
    const ev = ports.event();
    return build(ev?.via === "chat" ? { ...ports, event: () => ({ ...ev, name: "job_completed", via: "webhook" }) } : ports);
  },
  "intake-never-searches": bend(() => ({ searchJobs: async () => [] })),
  "quote-trusts-connector": bend((r) => ({ readQuote: async (id) => (await r.readQuote(id)) ?? { id, jobId: r.event()?.jobId, status: "draft" } })),
};

const std = await fetchChecks("cash-seam-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const redBy = new Map();
for (const [name, m] of Object.entries(MUTANTS)) {
  const env = await runStandard(std.checks, scenarios, m, { standard: "cash-seam-build-standard", spec: std.spec, environment: "stub" });
  console.log(`${name.padEnd(24)} ${env.results.map((r) => `${r.n}:${r.verdict === "fail" ? "RED" : r.verdict}`).join(" ")}`);
  for (const r of env.results) if (r.verdict === "fail") (redBy.get(r.n) ?? redBy.set(r.n, []).get(r.n)).push(name);
}
const real = await runStandard(std.checks, scenarios, build, { standard: "cash-seam-build-standard", spec: std.spec, environment: "stub" });
let weak = 0;
for (const r of real.results.filter((x) => x.verdict === "pass" || x.verdict === "shape_only")) {
  const by = redBy.get(r.n) ?? [];
  const ok = by.includes("do-nothing") && by.some((m) => m !== "do-nothing");
  if (!ok) weak += 1;
  console.log(`check ${r.n} ${ok ? "red under" : "TOO WEAK, red under"}: ${by.join(", ") || "nothing"}`);
}
process.exitCode = weak ? 1 : 0;

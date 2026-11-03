/**
 * Negative runs for the Cash Seam scenarios: a do-nothing build and broken
 * Timesheet Billing hops. Every check the real build claims must go red under at
 * least one of these, or the scenario is too weak.  node mutants.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("cash-seam-build-standard", "https://aipathway.com.au");
const onInvoice = (f) => (ports) => real(f({ ...ports }));
const M = {
  nothing: () => {},
  ignoresException: onInvoice((p) => { const r = p.readJob; p.readJob = async (id) => { const j = await r(id); return j ? { ...j, exception: undefined } : j; }; return p; }),
  nullIsSuccess: onInvoice((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => { const x = await w(i); return x.externalId ? x : { externalId: `INV-${i.jobId}` }; }; const r = p.readInvoice; p.readInvoice = async (id) => (await r(id)) ?? { id, jobId: id.slice(4) }; return p; }),
  standInIntakeNeverSearches: onInvoice((p) => { p.searchJobs = async () => []; return p; }),
  noReadBack: onInvoice((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => { const x = await w(i); if (x.externalId) { await p.release({ kind: "invoice", id: x.externalId, rule: "x" }); await p.send({ kind: "invoice", id: x.externalId, trigger: i.trigger }); } return x; }; return p; }),
  dropsQuoteId: onInvoice((p) => { const w = p.writeInvoice; p.writeInvoice = (i) => w({ ...i, quoteId: null }); return p; }),
  noTrigger: onInvoice((p) => { const w = p.writeInvoice; p.writeInvoice = (i) => w({ ...i, trigger: null }); return p; }),
  noInvoiceAtAll: onInvoice((p) => { p.writeInvoice = async () => ({ externalId: null }); return p; }),
  wrongOwner: onInvoice((p) => { const e = p.escalate; p.escalate = (x) => e({ ...x, owner: x.stage === "invoice" ? "someone" : x.owner }); return p; }),
};
const reds = {};
for (const [name, b] of Object.entries(M)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) (reds[n] ??= []).push(name);
  console.log(name.padEnd(18), "red:", red.join(","));
}
const ok = await runStandard(std.checks, scenarios, real, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
for (const r of ok.results) if (["pass", "shape_only"].includes(r.verdict)) console.log(`check ${r.n} ${r.verdict}: red under ${(reds[r.n] ?? []).join(", ") || "NOTHING"}`);

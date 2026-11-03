/**
 * Negative runs for the Invoice Out scenarios: a do-nothing build and broken
 * builds made by bending one port each. Every check the real build claims must
 * go red under at least one of these, or the scenario is too weak.  node mutants.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";
const std = await fetchChecks("invoice-out-build-standard", "https://aipathway.com.au");
const wrap = (f) => (ports, ev, o) => real(f({ ...ports }), ev, o);
const mapJobs = (g) => (p) => { const r = p.readJobs; p.readJobs = async () => (await r()).map(g); return p; };
const M = {
  nothing: () => {},
  dupes: wrap((p) => { p.readInvoiceForJob = async () => null; return p; }),
  inventRate: wrap((p) => { let codes = []; const rj = p.readJobs, rb = p.readPricebook; p.readJobs = async () => { const j = await rj(); codes = j.flatMap((x) => x.lines.map((l) => l.code)); return j; }; p.readPricebook = async () => { const b = await rb(); for (const c of codes) if (!b.items.some((i) => i.code === c)) b.items.push({ code: c, description: c, rate: 99 }); return b; }; return p; }),
  staleRates: wrap((p) => { const rb = p.readPricebook; p.readPricebook = async () => { const b = await rb(); b.items = b.items.map((i) => ({ ...i, rate: i.rate * 1.1 })); return b; }; return p; }),
  billUnsigned: wrap(mapJobs((j) => ({ ...j, lines: j.lines.map((l) => (l.kind === "variation" ? { ...l, signedAcceptance: l.signedAcceptance ?? "fake" } : l)) }))),
  ignoreThreshold: wrap((p) => { const r = p.readReleaseRule; p.readReleaseRule = async () => { const x = await r(); return x ? { ...x, threshold: Infinity } : x; }; return p; }),
  noRelease: wrap((p) => { p.release = async () => {}; return p; }),
  nullSuccess: wrap((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => (await w(i)) ?? { id: "FAKE", externalId: "FAKE", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" }; return p; }),
  noStage: wrap(mapJobs((j) => { const { contractStage, ...rest } = j; void contractStage; return rest; })),
  anyStatus: wrap(mapJobs((j) => ({ ...j, status: "complete" }))),
  dropLine: wrap(mapJobs((j) => ({ ...j, lines: j.lines.slice(0, -1) }))),
  extraLine: wrap(mapJobs((j) => ({ ...j, lines: [...j.lines, { code: "PROF-6MIN", qty: 1, kind: "labour", description: "x" }] }))),
  noEscalate: wrap((p) => { p.escalate = async () => {}; return p; }),
  noEvidence: wrap((p) => { p.attachEvidence = async () => {}; return p; }),
  ignorePerson: (ports, ev, o) => (ev?.type === "release" ? [] : real(ports, ev, o)),
  claimWords: wrap((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => w({ ...i, notes: (i.notes ?? "") + ". Progress claim" }); return p; }),
  noEdition: wrap((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => w({ ...i, bookEdition: null }); return p; }),
  localDoc: wrap((p) => { p.writeInvoice = async (i) => ({ id: "LOCAL", externalId: "pdf-1", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" }); return p; }),
  wrongKey: wrap((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => w({ ...i, jobId: `name:${i.jobId}` }); return p; }),
  sendParked: wrap((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => { const r = await w(i); if (r && i.park) { await p.release(r.id, { rule: "x" }); await p.send(r.id); } return r; }; return p; }),
};
const reds = {};
for (const [name, b] of Object.entries(M)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) (reds[n] ??= []).push(name);
  console.log(name.padEnd(16), "red:", red.join(","));
}
const real_ = await runStandard(std.checks, scenarios, real, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
for (const r of real_.results) if (["pass", "shape_only"].includes(r.verdict)) console.log(`check ${r.n} ${r.verdict}: red under ${(reds[r.n] ?? []).join(", ") || "NOTHING"}`);

/**
 * Negative runs for the Outgoings Desk scenarios: a do-nothing build, and
 * broken builds made by bending one port or one step each. Every check the
 * real build claims (pass or shape_only) must go red under at least one of
 * these, or its scenario is too weak.   node mutants.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("invoice-out-build-standard", "https://aipathway.com.au");

/** Run the real build with one port bent. */
const bend = (f) => (ports, ev, o) => real(f({ ...ports }), ev, o);
const recons = (g) => (p) => {
  const r = p.readJobs;
  p.readJobs = async () => (await r()).map(g);
  return p;
};
const onWrite = (g) => (p) => {
  const w = p.writeInvoice;
  p.writeInvoice = async (i) => g(w, i, p);
  return p;
};
const onBook = (g) => (p) => {
  const r = p.readPricebook;
  p.readPricebook = async () => g(await r());
  return p;
};

const BROKEN = {
  doNothing: () => {},
  billOpenReconciliations: bend(recons((j) => ({ ...j, status: "complete" }))),
  forgetExisting: bend((p) => { p.readInvoiceForJob = async () => null; return p; }),
  lastYearsFigures: bend(onBook((b) => ({ ...b, items: b.items.map((i) => ({ ...i, rate: i.rate * 0.95 })) }))),
  guessLandTax: bend(onBook((b) => ({ ...b, items: [...b.items, { code: "OG-LANDTAX", description: "guessed", rate: 20000 }] }))),
  guessShare: bend(recons((j) => ({ ...j, lines: j.lines.map((l) => (typeof l.qty === "number" ? l : { ...l, qty: 0.1 })) }))),
  roundShare: bend(onWrite((w, i) => w({ ...i, lines: i.lines.map((l) => ({ ...l, qty: Math.round(l.qty * 10) / 10 })) }))),
  billUnsigned: bend(recons((j) => ({ ...j, lines: j.lines.map((l) => (l.kind === "variation" ? { ...l, signedAcceptance: l.signedAcceptance ?? "verbal" } : l)) }))),
  dropStage: bend(recons((j) => { const { contractStage, ...rest } = j; void contractStage; return rest; })),
  claimWording: bend(onWrite((w, i) => w({ ...i, notes: `${i.notes ?? ""}. Progress claim under the head contract` }))),
  dropLine: bend(recons((j) => ({ ...j, lines: j.lines.slice(1) }))),
  dropBudgetLines: bend(recons((j) => ({ ...j, lines: j.lines.filter((l) => !l.code.endsWith("-EST")) }))),
  extraLine: bend(recons((j) => ({ ...j, lines: [...j.lines, { code: "OG-CLEAN", qty: 0.05, kind: "material", description: "x" }] }))),
  nullIsSuccess: bend(onWrite(async (w, i) => (await w(i)) ?? { id: "FAKE", externalId: "FAKE", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" })),
  renderOwnPdf: bend((p) => { p.writeInvoice = async (i) => ({ id: "PDF", externalId: "pdf-local", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" }); return p; }),
  keyByTenantName: bend(onWrite((w, i) => w({ ...i, jobId: `tenant:${i.jobId}` }))),
  noEdition: bend(onWrite((w, i) => w({ ...i, bookEdition: null }))),
  ignoreThreshold: bend((p) => { const r = p.readReleaseRule; p.readReleaseRule = async () => { const x = await r(); return x ? { ...x, threshold: Infinity } : x; }; return p; }),
  sendWithoutRelease: bend((p) => { p.release = async () => {}; return p; }),
  ignorePerson: (ports, ev, o) => (ev?.type === "release" ? [] : real(ports, ev, o)),
  silentPark: bend((p) => { p.escalate = async () => {}; return p; }),
  noDeedOnFile: bend((p) => { p.attachEvidence = async () => {}; return p; }),
  sendParked: bend(onWrite(async (w, i, p) => { const r = await w(i); if (r && i.park) { await p.release(r.id, { rule: "x" }); await p.send(r.id); } return r; })),
};

const redUnder = {};
for (const [name, b] of Object.entries(BROKEN)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) (redUnder[n] ??= []).push(name);
  console.log(name.padEnd(24), "red:", red.join(",") || "none");
}

const ok = await runStandard(std.checks, scenarios, real, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
let weak = 0;
for (const r of ok.results) {
  if (!["pass", "shape_only"].includes(r.verdict)) continue;
  const by = redUnder[r.n] ?? [];
  if (by.length === 0) weak += 1;
  console.log(`check ${String(r.n).padStart(2)} ${r.verdict.padEnd(10)} red under: ${by.join(", ") || "NOTHING"}`);
}
process.exitCode = weak > 0 ? 1 : 0;

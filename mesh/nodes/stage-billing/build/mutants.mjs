/**
 * Negative runs for the Stage Billing scenarios: a do-nothing build, and
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
const records = (g) => (p) => {
  const r = p.readJobs;
  p.readJobs = async () => (await r()).map(g);
  return p;
};
const onWrite = (g) => (p) => {
  const w = p.writeInvoice;
  p.writeInvoice = async (i) => g(w, i, p);
  return p;
};

const BROKEN = {
  doNothing: () => {},
  billStagesNotReached: bend(records((j) => ({ ...j, status: "complete" }))),
  forgetExisting: bend((p) => { p.readInvoiceForJob = async () => null; return p; }),
  percentOfContract: bend((p) => { const r = p.readPricebook; p.readPricebook = async () => { const b = await r(); b.items = b.items.map((i) => ({ ...i, rate: Math.round(i.rate * 1.02) })); return b; }; return p; }),
  inventAmount: bend((p) => { const r = p.readPricebook; p.readPricebook = async () => { const b = await r(); b.items.push({ code: "C2077-PS-ROCK", description: "guess", rate: 1200 }); return b; }; return p; }),
  billUnsigned: bend(records((j) => ({ ...j, lines: j.lines.map((l) => (l.kind === "variation" ? { ...l, signedAcceptance: l.signedAcceptance ?? "agreed on site" } : l)) }))),
  dropStage: bend(records((j) => { const { contractStage, ...rest } = j; void contractStage; return rest; })),
  inventStage: bend(records((j) => ({ ...j, contractStage: j.contractStage?.trim() ? j.contractStage : "Stage" }))),
  claimWording: bend(onWrite((w, i) => w({ ...i, notes: `${i.notes ?? ""}. Progress claim under the building contract` }))),
  dropLine: bend(records((j) => ({ ...j, lines: j.lines.slice(1) }))),
  extraLine: bend(records((j) => ({ ...j, lines: [...j.lines, { code: "C1042-PS-EXCAV", qty: 1, kind: "material", description: "x" }] }))),
  nullIsSuccess: bend(onWrite(async (w, i) => (await w(i)) ?? { id: "FAKE", externalId: "FAKE", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" })),
  renderOwnPdf: bend((p) => { p.writeInvoice = async (i) => ({ id: "PDF", externalId: "pdf-local", jobId: i.jobId, lines: i.lines, evidence: [], status: "draft" }); return p; }),
  keyByClient: bend(onWrite((w, i) => w({ ...i, jobId: `client:${i.jobId}` }))),
  noEdition: bend(onWrite((w, i) => w({ ...i, bookEdition: null }))),
  ignoreThreshold: bend((p) => { const r = p.readReleaseRule; p.readReleaseRule = async () => { const x = await r(); return x ? { ...x, threshold: Infinity } : x; }; return p; }),
  sendWithoutRelease: bend((p) => { p.release = async () => {}; return p; }),
  ignorePerson: (ports, ev, o) => (ev?.type === "release" ? [] : real(ports, ev, o)),
  silentPark: bend((p) => { p.escalate = async () => {}; return p; }),
  noSignatureOnFile: bend((p) => { p.attachEvidence = async () => {}; return p; }),
  sendParked: bend(onWrite(async (w, i, p) => { const r = await w(i); if (r && i.park) { await p.release(r.id, { rule: "x" }); await p.send(r.id); } return r; })),
};

const redUnder = {};
for (const [name, b] of Object.entries(BROKEN)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) (redUnder[n] ??= []).push(name);
  console.log(name.padEnd(22), "red:", red.join(",") || "none");
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

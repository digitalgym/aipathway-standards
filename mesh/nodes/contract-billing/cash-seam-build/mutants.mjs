/**
 * Negative runs for the Contract Billing Cash Seam scenarios: a do-nothing
 * build, and broken builds that bend the Contract Billing hop one way each.
 * Every claimed check must go red under at least one.   node mutants.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build as real } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("cash-seam-build-standard", "https://aipathway.com.au");

/** Bend ports only while the Contract Billing hop (job_completed) runs. */
const onHop = (f) => async (ports) => {
  const ev = await ports.event();
  return real(ev?.name === "job_completed" ? f({ ...ports }) : ports);
};

const BROKEN = {
  doNothing: () => {},
  hopDoesNothing: async (ports) => ((await ports.event())?.name === "job_completed" ? {} : real(ports)),
  matchByName: onHop((p) => {
    const r = p.readJob;
    p.readJob = async (id) => {
      const j = await r(id);
      if (!j) return j;
      const all = await p.searchJobs({ name: j.customerName });
      return all.find((x) => x.id !== id) ?? j;
    };
    return p;
  }),
  dropQuoteId: onHop((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => w({ ...i, quoteId: null }); return p; }),
  nullIsSuccess: onHop((p) => {
    const w = p.writeInvoice, ri = p.readInvoice;
    p.writeInvoice = async (i) => { const r = await w(i); return r.externalId ? r : { externalId: `INV-ASSUMED-${i.jobId}` }; };
    p.readInvoice = async (id) => (String(id).startsWith("INV-ASSUMED-") ? { id, jobId: id.slice(12) } : ri(id));
    return p;
  }),
  ignoreException: onHop((p) => { const r = p.readJob; p.readJob = async (id) => { const j = await r(id); if (j) delete j.exception; return j; }; return p; }),
  noOwner: onHop((p) => { const e = p.escalate; p.escalate = async (x) => e({ ...x, owner: null }); return p; }),
  noTrigger: onHop((p) => { const w = p.writeInvoice; p.writeInvoice = async (i) => w({ ...i, trigger: null }); return p; }),
  actsOnChat: async (ports) => {
    const ev = await ports.event();
    if (ev?.name === "chat_message" && ev.jobId) { await ports.writeInvoice({ jobId: ev.jobId, quoteId: null, trigger: ev.id }); return {}; }
    return real(ports);
  },
  botReleases: onHop((p) => {
    const w = p.writeInvoice;
    p.writeInvoice = async (i) => {
      const r = await w(i);
      if (r.externalId) { await p.release({ kind: "invoice", id: r.externalId, rule: "bot-decided" }); await p.send({ kind: "invoice", id: r.externalId, trigger: i.trigger }); }
      return r;
    };
    return p;
  }),
};

const redUnder = {};
for (const [name, b] of Object.entries(BROKEN)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.n);
  for (const n of red) (redUnder[n] ??= []).push(name);
  console.log(name.padEnd(16), "red:", red.join(",") || "none");
}
const ok = await runStandard(std.checks, scenarios, real, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
let weak = 0;
for (const r of ok.results) {
  if (!["pass", "shape_only"].includes(r.verdict)) continue;
  const by = redUnder[r.n] ?? [];
  if (!by.length) weak += 1;
  console.log(`check ${r.n} ${r.verdict.padEnd(10)} red under: ${by.join(", ") || "NOTHING"}`);
}
process.exitCode = weak ? 1 : 0;

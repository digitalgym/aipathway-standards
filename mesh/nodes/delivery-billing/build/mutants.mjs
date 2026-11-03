/**
 * Mutants: a do-nothing build and deliberately broken builds, run against the
 * same scenarios. Every check this node claims must go red for the do-nothing
 * build and for at least one broken build; if one does not, the scenario is too
 * weak and is fixed (never the assertion).
 *
 *   node mutants.mjs
 *
 * Each broken build is the real build with one port bent, so the defect is the
 * one named and nothing else. Writes nothing; prints a table and exits 1 if a
 * claimed check survives every mutant.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const bend = (overrides) => (ports, ev) => {
  const p = { ...ports };
  const real = { ...ports };
  Object.assign(p, overrides(real, p));
  return build(p, ev);
};

const MUTANTS = {
  "do-nothing": async () => {},
  "bills-open-jobs": bend((r) => ({ readJobs: async () => (await r.readJobs()).map((j) => ({ ...j, status: "complete" })) })),
  "adds-a-fuel-levy": bend((r) => ({ writeInvoice: (i) => r.writeInvoice({ ...i, lines: [...i.lines, { code: "FUEL-LEVY", qty: 1, rate: 15, kind: "material" }] }) })),
  "typed-rates": bend((r) => ({ writeInvoice: (i) => r.writeInvoice({ ...i, lines: i.lines.map((l) => ({ ...l, rate: Math.ceil(l.rate) })) }) })),
  "prices-unknown-codes": bend((r) => ({
    readPricebook: async () => {
      const b = await r.readPricebook();
      return { ...b, items: [...b.items, { code: "EDGE-KERB", description: "guessed", rate: 40 }] };
    },
  })),
  "phone-is-signed": bend((r) => ({
    readJobs: async () => (await r.readJobs()).map((j) => ({ ...j, lines: j.lines.map((l) => (l.kind === "variation" ? { ...l, signedAcceptance: l.signedAcceptance ?? "phone" } : l)) })),
  })),
  "drops-the-stage": bend((r) => ({ readJobs: async () => (await r.readJobs()).map(({ contractStage, underContract, ...j }) => j) })),
  "no-duplicate-guard": (() => {
    // The existence check before a write always says "none"; the read-back after it is real.
    return bend((r) => {
      let wrote = false;
      return {
        readInvoiceForJob: async (id) => (wrote ? r.readInvoiceForJob(id) : (r.readInvoiceForJob(id), null)),
        writeInvoice: async (i) => {
          wrote = true;
          return r.writeInvoice({ ...i, invoiceId: undefined });
        },
      };
    });
  })(),
  "trusts-its-own-write": bend((r) => {
    let last = null;
    return {
      writeInvoice: async (i) => (last = (await r.writeInvoice(i)) ?? { id: "assumed", externalId: "assumed", jobId: i.jobId, lines: i.lines, status: "draft", evidence: [] }),
      readInvoiceForJob: async (id) => (last && last.jobId === id ? last : r.readInvoiceForJob(id)),
    };
  }),
  "sends-without-release": bend(() => ({ release: async () => {} })),
  "rule-has-no-ceiling": bend((r) => ({ readReleaseRule: async () => ({ name: (await r.readReleaseRule())?.name ?? "always", threshold: Infinity }) })),
  "silent-park": bend(() => ({ escalate: async () => {} })),
  "no-record": bend(() => ({ readRecord: async () => ({ invoice: null }) })),
};

const std = await fetchChecks("invoice-out-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const claimed = new Set();
const redBy = new Map();
for (const [name, mutant] of Object.entries(MUTANTS)) {
  const env = await runStandard(std.checks, scenarios, mutant, { standard: "invoice-out-build-standard", spec: std.spec, environment: "stub" });
  const row = env.results.map((r) => `${r.n}:${r.verdict === "fail" ? "RED" : r.verdict}`).join(" ");
  console.log(`${name.padEnd(22)} ${row}`);
  for (const r of env.results) if (r.verdict === "fail") (redBy.get(r.n) ?? redBy.set(r.n, []).get(r.n)).push(name);
}
const real = await runStandard(std.checks, scenarios, build, { standard: "invoice-out-build-standard", spec: std.spec, environment: "stub" });
for (const r of real.results) if (r.verdict === "pass" || r.verdict === "shape_only") claimed.add(r.n);
let weak = 0;
for (const n of [...claimed].sort((a, b) => a - b)) {
  const by = redBy.get(n) ?? [];
  const ok = by.includes("do-nothing") && by.some((m) => m !== "do-nothing");
  if (!ok) weak += 1;
  console.log(`check ${String(n).padStart(2)} ${ok ? "red under" : "TOO WEAK, red under"}: ${by.join(", ") || "nothing"}`);
}
process.exitCode = weak ? 1 : 0;

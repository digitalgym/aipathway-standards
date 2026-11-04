/**
 * Red team: the scenarios must go red for builds that do nothing or do it wrong.
 *
 *   node redteam.mjs
 *
 * Each broken build is the real build with one rule taken out, mostly by
 * wrapping the ports it is handed. A check that stays green for a build it
 * should catch is a scenario too weak to trust; the fix is the scenario, never
 * the assertion. Exits 1 if any broken build is not caught where expected.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("quote-out-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");

const wrap = (fn) => (ports, event, config) => build(fn(ports), event, config);
let warmCache = null;

/** Rewrite the drawings on every job the build reads. */
const withDrawings = (f) => wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, drawings: f(j.drawings ?? []) }; } }));

const BROKEN = {
  // Does nothing at all. Every check claimed must go red.
  "do-nothing": { build: async () => {}, mustFail: scenarios.map((s) => s.checkId) },
  // Accepts any event carrying a job id, including a raw call.
  "raw-call-trigger": {
    build: (ports, event, config) => build(ports, event?.job_id ? { ...event, name: "job.created" } : event, config),
    mustFail: ["job-is-the-trigger"],
  },
  // Counts every sheet in the set, superseded revisions included.
  "counts-superseded": {
    build: withDrawings((ds) => ds.map((d) => ({ ...d, status: "current", sheet: `${d.sheet}${d.status === "superseded" ? "-old" : ""}` }))),
    mustFail: ["pricebook-is-the-only-source"],
  },
  // Assumes 1:100 wherever a sheet says something else, or nothing.
  "assumes-scale": {
    build: withDrawings((ds) => ds.map((d) => ({ ...d, scale: 100 }))),
    mustFail: ["pricebook-is-the-only-source", "quote-is-not-ours"],
  },
  // Takes the first current revision of a sheet and ignores the conflict.
  "ignores-revision-conflict": {
    build: withDrawings((ds) => ds.filter((d, i) => ds.findIndex((e) => e.sheet === d.sheet && e.status === d.status) === i)),
    mustFail: ["pricebook-is-the-only-source"],
  },
  // Adds a 10 per cent allowance to every run length.
  "adds-allowance": {
    build: withDrawings((ds) => ds.map((d) => ({ ...d, runs: (d.runs ?? []).map((r) => ({ ...r, points: r.points.map(([x, y]) => [x * 1.1, y * 1.1]) })) }))),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours"],
  },
  // Counts every symbol twice.
  "double-counts": {
    build: withDrawings((ds) => ds.map((d) => ({ ...d, symbols: [...(d.symbols ?? []), ...(d.symbols ?? [])] }))),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours", "pricebook-is-current"],
  },
  // Prices a pre-build with no sell price as the sum of its parts.
  "sums-prebuild-parts": {
    build: wrap((p) => ({
      ...p,
      readPricebook: async () => {
        const book = await p.readPricebook();
        return book.map((i) => (i.kind === "prebuild" && i.rate == null && Array.isArray(i.components) ? { ...i, rate: i.components.reduce((s, c) => s + (book.find((b) => b.catalogueId === c)?.rate ?? 0), 0) } : i));
      },
    })),
    mustFail: ["unpriceable-is-parked"],
  },
  // Estimates symbols the book does not cover at the average book rate instead of parking them.
  "estimates-off-book": {
    build: wrap((p) => ({
      ...p,
      readJob: async (id) => (p.__lastJob = await p.readJob(id)),
      readPricebook: async () => {
        const book = await p.readPricebook();
        const priced = book.filter((i) => typeof i.rate === "number");
        const avg = Math.round(priced.reduce((s, i) => s + i.rate, 0) / priced.length);
        const out = book.map((i) => (i.rate == null ? { ...i, rate: avg } : i));
        for (const d of p.__lastJob?.drawings ?? []) for (const s of d.symbols ?? []) if (!out.some((i) => i.symbol === s.block)) out.push({ catalogueId: `EST-${s.block}`, description: s.block, rate: avg, unit: "each", symbol: s.block });
        return out;
      },
    })),
    mustFail: ["unpriceable-is-parked"],
  },
  // Prices the variation and the discount as ordinary jobs.
  "prices-negotiation": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, isVariation: false, wantsDiscount: false }; } })),
    mustFail: ["no-variation-pricing"],
  },
  // Never sees the quote already on the job, so makes a second one.
  "duplicates": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, quoteId: undefined }; } })),
    mustFail: ["one-quote-per-job"],
  },
  // Treats a write with no id as done.
  "trusts-null-write": {
    build: wrap((p) => ({ ...p, draftQuote: async (q, i) => (await p.draftQuote(q, i)) ?? { id: "LOCAL-1", jobId: q.jobId, lines: q.lines, state: "draft" } })),
    mustFail: ["draft-quote-verified"],
  },
  // Drafts, but never tells the person a draft is waiting for release.
  "silent-draft": {
    build: wrap((p) => ({ ...p, notify: async (to, job, reason) => (String(reason).startsWith("ready_to_release") ? undefined : p.notify(to, job, reason)) })),
    mustFail: ["draft-never-sends"],
  },
  // Keeps its own copy and writes a cut-down line (no quantity, no sheets) to the system of record.
  "writes-thin-copy": {
    build: wrap((p) => ({ ...p, draftQuote: (q, i) => p.draftQuote({ jobId: q.jobId, lines: q.lines.map(({ catalogueId, description, rate }) => ({ catalogueId, description, rate })), total_ex_gst: q.total_ex_gst }, i) })),
    mustFail: ["quote-is-not-ours"],
  },
  // Drafts without reading the job record first (works from the event alone).
  "skips-job-read": {
    build: async (ports, event) => {
      if (!event?.job_id) return;
      const book = await ports.readPricebook();
      const line = { catalogueId: book[0].catalogueId, description: book[0].description, rate: book[0].rate, unit: book[0].unit, quantity: 1, amount: book[0].rate };
      await ports.draftQuote({ jobId: event.job_id, lines: [line], total_ex_gst: line.amount }, `${event.job_id}:x`);
    },
    mustFail: ["job-is-the-trigger", "log-survives"],
  },
  // Reads the price list once and remembers it across runs.
  "caches-pricebook": {
    build: (ports, event, config) => build({ ...ports, readPricebook: async () => (warmCache ??= await ports.readPricebook()).map((i) => ({ ...i })) }, event, config),
    reset: () => (warmCache = null),
    mustFail: ["pricebook-is-current"],
  },
};

let ok = true;
for (const [name, v] of Object.entries(BROKEN)) {
  v.reset?.();
  const env = await runStandard(std.checks, scenarios, v.build, { standard: "quote-out-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const missed = v.mustFail.filter((id) => !red.includes(id));
  if (missed.length) ok = false;
  console.log(`${missed.length ? "MISSED" : "caught"}  ${name.padEnd(26)} red: ${red.join(", ") || "(none)"}${missed.length ? `  NOT RED: ${missed.join(", ")}` : ""}`);
}
console.log(ok ? "\nEvery broken build was caught." : "\nA broken build got through. Strengthen the scenario.");
process.exitCode = ok ? 0 : 1;

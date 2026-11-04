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

/** Rewrite the measures on every job the build reads. */
const withMeasures = (f) => wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, measures: (j.measures ?? []).map(f) }; } }));

const BROKEN = {
  // Does nothing at all. Every check claimed must go red.
  "do-nothing": { build: async () => {}, mustFail: scenarios.map((s) => s.checkId) },
  // Accepts any event carrying a job id, including a raw call.
  "raw-call-trigger": {
    build: (ports, event, config) => build(ports, event?.job_id ? { ...event, name: "job.created" } : event, config),
    mustFail: ["job-is-the-trigger"],
  },
  // Estimates off-book work at the average book rate instead of parking it.
  "estimates-off-book": {
    build: wrap((p) => ({
      ...p,
      readJob: async (id) => (p.__lastJob = await p.readJob(id)),
      readPricebook: async () => {
        const book = await p.readPricebook();
        const avg = Math.round(book.reduce((s, i) => s + i.rate, 0) / book.length);
        for (const x of p.__lastJob?.measures ?? []) if (!book.some((i) => i.catalogueId === x.item || i.description === x.item)) book.push({ catalogueId: `EST-${x.item}`, description: x.item, rate: avg, unit: x.unit });
        return book;
      },
    })),
    mustFail: ["unpriceable-is-parked"],
  },
  // Adds a 10 per cent waste allowance the price list does not carry.
  "adds-waste": {
    build: withMeasures((x) => ({ ...x, quantity: typeof x.quantity === "number" ? Math.round(x.quantity * 1.1 * 100) / 100 : x.quantity })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "unpriceable-is-parked", "quote-is-not-ours"],
  },
  // Treats whatever unit was measured as the item's unit (silently converting m2 skirting to lm).
  "ignores-units": {
    build: wrap((p) => ({
      ...p,
      readPricebook: async () => (await p.readPricebook()).map((i) => ({ ...i, unit: undefined })),
      readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, measures: (j.measures ?? []).map((x) => ({ ...x, unit: "each" })) }; },
    })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source"],
  },
  // Rounds every measure up to the next whole unit.
  "rounds-up": {
    build: withMeasures((x) => ({ ...x, quantity: typeof x.quantity === "number" ? Math.ceil(x.quantity) : x.quantity })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours"],
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
  // Keeps its own copy and writes a cut-down line (no room, no quantity) to the system of record.
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
  console.log(`${missed.length ? "MISSED" : "caught"}  ${name.padEnd(20)} red: ${red.join(", ") || "(none)"}${missed.length ? `  NOT RED: ${missed.join(", ")}` : ""}`);
}
console.log(ok ? "\nEvery broken build was caught." : "\nA broken build got through. Strengthen the scenario.");
process.exitCode = ok ? 0 : 1;

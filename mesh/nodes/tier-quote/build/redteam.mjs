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
const total = (book, ids) => ids.reduce((s, id) => s + (book.find((i) => i.catalogueId === id)?.rate ?? 0), 0);

const BROKEN = {
  // Does nothing at all. Every check claimed must go red.
  "do-nothing": { build: async () => {}, mustFail: scenarios.map((s) => s.checkId) },
  // Accepts any event carrying a job id, including a raw call.
  "raw-call-trigger": {
    build: (ports, event, config) => build(ports, event?.job_id ? { ...event, name: "job.created" } : event, config),
    mustFail: ["job-is-the-trigger"],
  },
  // Marks every rate up 10 per cent on the way to the draft.
  "marks-up-rates": {
    build: wrap((p) => ({ ...p, readPricebook: async () => (await p.readPricebook()).map((i) => ({ ...i, rate: Math.round(i.rate * 1.1) })) })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours", "pricebook-is-current", "options-are-tiers-of-one-quote", "tiers-from-the-tier-map"],
  },
  // Estimates off-book lines at the average book rate instead of parking.
  "estimates-off-book": {
    build: wrap((p) => ({
      ...p,
      readTierMap: async (key) => (p.__map = await p.readTierMap(key)),
      readPricebook: async () => {
        const book = await p.readPricebook();
        const avg = Math.round(book.reduce((s, i) => s + i.rate, 0) / book.length);
        for (const k of ["drain-clear", "hot-water-replace"]) for (const r of await p.readTierMap(k)) for (const id of r.catalogueIds) if (!book.some((i) => i.catalogueId === id)) book.push({ catalogueId: id, description: `Estimated ${id}`, rate: avg });
        return book;
      },
    })),
    mustFail: ["unpriceable-is-parked", "every-option-from-the-book"],
  },
  // Drops the off-book line and drafts the options around it.
  "drafts-around-gap": {
    build: wrap((p) => ({
      ...p,
      readTierMap: async (key) => {
        const book = await p.readPricebook();
        return (await p.readTierMap(key)).map((r) => ({ ...r, catalogueIds: r.catalogueIds.filter((id) => book.some((i) => i.catalogueId === id)) }));
      },
    })),
    mustFail: ["unpriceable-is-parked", "every-option-from-the-book"],
  },
  // Drafts only the options it can price and leaves out the one it cannot.
  "drops-option": {
    build: wrap((p) => ({
      ...p,
      readTierMap: async (key) => {
        const book = await p.readPricebook();
        return (await p.readTierMap(key)).filter((r) => r.catalogueIds.every((id) => book.some((i) => i.catalogueId === id)));
      },
    })),
    mustFail: ["every-option-from-the-book"],
  },
  // Prices the variation and the discount as ordinary jobs.
  "prices-negotiation": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, isVariation: false, wantsDiscount: false }; } })),
    mustFail: ["no-variation-pricing"],
  },
  // Never sees the quote already on the job, so drafts the options again.
  "duplicates": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, quoteId: undefined }; } })),
    mustFail: ["one-quote-per-job", "options-are-tiers-of-one-quote", "chosen-option-closes-the-others"],
  },
  // One draft per option, each a quote of its own.
  "quote-per-option": {
    build: wrap((p) => ({
      ...p,
      draftQuote: async (q, i) => {
        let last = null;
        for (const o of q.options ?? []) last = await p.draftQuote({ jobId: q.jobId, lines: o.lines }, `${i}:${o.label}`);
        return last;
      },
    })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours", "log-survives", "options-are-tiers-of-one-quote", "tiers-from-the-tier-map"],
  },
  // Treats a write with no id as done.
  "trusts-null-write": {
    build: wrap((p) => ({ ...p, draftQuote: async (q, i) => (await p.draftQuote(q, i)) ?? { id: "LOCAL-1", jobId: q.jobId, lines: [], state: "draft" } })),
    mustFail: ["draft-quote-verified"],
  },
  // Drafts, but never tells the person a draft is waiting for release.
  "silent-draft": {
    build: wrap((p) => ({ ...p, notify: async (to, job, reason) => (String(reason).startsWith("ready_to_release") ? undefined : p.notify(to, job, reason)) })),
    mustFail: ["draft-never-sends"],
  },
  // Writes option lines without catalogue ids (description and rate only).
  "writes-thin-lines": {
    build: wrap((p) => ({ ...p, draftQuote: (q, i) => p.draftQuote({ ...q, options: q.options.map((o) => ({ label: o.label, lines: o.lines.map(({ description, rate }) => ({ description, rate })) })) }, i) })),
    mustFail: ["job-is-the-trigger", "pricebook-is-the-only-source", "quote-is-not-ours", "log-survives", "options-are-tiers-of-one-quote", "tiers-from-the-tier-map"],
  },
  // Drafts without reading the job record first (works from the event alone).
  "skips-job-read": {
    build: async (ports, event) => {
      if (!event?.job_id) return;
      const book = await ports.readPricebook();
      const rules = await ports.readTierMap("hot-water-replace");
      const options = rules.map((r) => ({ label: r.label, lines: r.catalogueIds.map((id) => book.find((i) => i.catalogueId === id)).filter(Boolean) }));
      const q = await ports.draftQuote({ jobId: event.job_id, lines: [], options }, `${event.job_id}:x`);
      return q ? { outcome: "drafted", quote_id: q.id, options: [] } : null;
    },
    mustFail: ["job-is-the-trigger", "log-survives"],
  },
  // Reads the price list once and remembers it across runs.
  "caches-pricebook": {
    build: (ports, event, config) => build({ ...ports, readPricebook: async () => (warmCache ??= await ports.readPricebook()).map((i) => ({ ...i })) }, event, config),
    reset: () => (warmCache = null),
    mustFail: ["pricebook-is-current"],
  },
  // Ignores the business's labels and calls every option Good, Better, Best.
  "default-labels": {
    build: wrap((p) => ({ ...p, readTierMap: async (key) => (await p.readTierMap(key)).map((r, i) => ({ ...r, label: ["Good", "Better", "Best"][i] ?? r.label })) })),
    mustFail: ["tiers-from-the-tier-map"],
  },
  // Re-sorts the options cheapest first instead of keeping the tier map's order.
  "sorts-by-price": {
    build: wrap((p) => ({
      ...p,
      readTierMap: async (key) => {
        const book = await p.readPricebook();
        return (await p.readTierMap(key)).sort((a, b) => total(book, a.catalogueIds) - total(book, b.catalogueIds));
      },
    })),
    mustFail: ["tiers-from-the-tier-map"],
  },
  // With no tier map entry, invents its own split of the price list into options.
  "invents-tiers": {
    build: wrap((p) => ({
      ...p,
      readTierMap: async (key) => {
        const rules = await p.readTierMap(key);
        if (rules.length) return rules;
        const book = await p.readPricebook();
        return [
          { key, label: "Good", catalogueIds: [book[0].catalogueId] },
          { key, label: "Better", catalogueIds: [book[1].catalogueId] },
          { key, label: "Best", catalogueIds: [book[2].catalogueId] },
        ];
      },
    })),
    mustFail: ["tiers-from-the-tier-map"],
  },
  // Pads each option with a tempering valve the tier map did not list for it.
  "pads-options": {
    build: wrap((p) => ({ ...p, readTierMap: async (key) => (await p.readTierMap(key)).map((r) => ({ ...r, catalogueIds: r.catalogueIds.includes("HW-TEMPV") ? r.catalogueIds : [...r.catalogueIds, "HW-TEMPV"] })) })),
    mustFail: ["pricebook-is-the-only-source", "tiers-from-the-tier-map"],
  },
  // Names every option to close, the chosen one too.
  "closes-the-chosen": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && j.chosenOption ? { ...j, chosenOption: "__none__", quoteOptions: [...(j.quoteOptions ?? []), "__none__"] } : j; } })),
    mustFail: ["chosen-option-closes-the-others"],
  },
  // Ignores the person's mark and just keeps the quote again.
  "ignores-the-choice": {
    build: wrap((p) => ({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j && { ...j, chosenOption: undefined }; } })),
    mustFail: ["chosen-option-closes-the-others"],
  },
  // Rewrites the quote down to the chosen option once a person marks it.
  "rewrites-to-chosen": {
    build: wrap((p) => ({
      ...p,
      readJob: async (id) => {
        const j = await p.readJob(id);
        if (j?.chosenOption) {
          await p.draftQuote({ jobId: id, lines: [], options: [{ label: j.chosenOption, lines: [] }] }, `${id}:rewrite`);
        }
        return j;
      },
    })),
    mustFail: ["chosen-option-closes-the-others"],
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

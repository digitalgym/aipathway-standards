/**
 * Red team for the Quote Out scenarios: each check must go red for a build
 * that does nothing and for at least one deliberately broken build
 * (estimates off-list remedies, caches the price list and never dedupes,
 * trusts a write with no id, drafts without reading the job).
 *
 *   node redteam.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "./scenarios.mjs";
import { build as good } from "./build.mjs";
const std = await fetchChecks("quote-out-build-standard", "https://aipathway.com.au");
const avg = (b) => Math.round(b.reduce((s, p) => s + p.rate, 0) / b.length);
const find = (book, w) => book.find((b) => b.catalogueId === w || b.description === w);
let cache = null;
const builds = {
  noop: async () => {},
  estimator: async (p, ev) => {
    if (!ev?.job_id) return;
    const job = await p.readJob(ev.job_id);
    const book = await p.readPricebook();
    const lines = (job.defects ?? []).map((d) => {
      const hit = find(book, d.remedy);
      return hit ? { ...hit, defectId: d.id, assetId: d.asset_id } : { catalogueId: "MISC", description: d.description, rate: avg(book), defectId: d.id, assetId: d.asset_id };
    });
    const q = await p.draftQuote({ jobId: job.id, lines }, job.id);
    if (q) await p.notify("o", job.id, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id ?? null };
  },
  cacheNoDedupe: async (p, ev) => {
    if (!ev?.job_id) return;
    const job = await p.readJob(ev.job_id);
    cache ??= await p.readPricebook();
    const lines = (job.defects ?? []).map((d) => find(cache, d.remedy)).filter(Boolean);
    const q = await p.draftQuote({ jobId: job.id, lines }, job.id + Math.random());
    if (q) await p.notify("o", job.id, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id ?? null };
  },
  trustsWrite: async (p, ev) => {
    const r = await good({ ...p, notify: () => {} }, ev);
    return r.outcome === "write_failed" ? { outcome: "drafted", quote_id: "assumed" } : r;
  },
  noRead: async (p, ev) => {
    const book = await p.readPricebook();
    const q = await p.draftQuote({ jobId: ev?.job_id ?? ev?.message_id, lines: [book[0]] }, "x");
    if (q) await p.notify("o", q.jobId, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id };
  },
  dropsDefectIds: async (p, ev) => good({ ...p, draftQuote: (input, i) => p.draftQuote({ ...input, lines: input.lines.map(({ defectId, assetId, ...l }) => l) }, i) }, ev),
};
const tally = {};
for (const [name, b] of Object.entries(builds)) {
  cache = null;
  const env = await runStandard(std.checks, scenarios, b, { standard: "quote-out-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  for (const r of env.results) (tally[r.n] ??= {})[name] = r.verdict;
}
for (const [n, v] of Object.entries(tally)) console.log(n.padStart(2), JSON.stringify(v));

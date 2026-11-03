/**
 * Red team for the Quote Out scenarios. Every check claimed must go red for a
 * build that does nothing and for at least one deliberately broken build:
 *
 *   noop          does nothing at all
 *   guesser       prices off-book services at the book's average rate, ignores quantity
 *   staleNoDedupe reads the price list once and keeps it, never keeps an existing quote
 *   trustsWrite   treats a write with no id as drafted and alerts nobody
 *   formTrigger   drafts straight from the form post, never reading the job
 *   silentDraft   drafts and tells nobody it is waiting for release
 *
 *   node redteam.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "./scenarios.mjs";
import { build as good } from "./build.mjs";

const std = await fetchChecks("quote-out-build-standard", "https://aipathway.com.au");
const avg = (b) => Math.round(b.reduce((s, p) => s + p.rate, 0) / b.length);
let stale = null;

const builds = {
  noop: async () => {},
  guesser: async (p, ev) => {
    if (!ev?.job_id) return { outcome: "ignored" };
    const job = await p.readJob(ev.job_id);
    const book = await p.readPricebook();
    const lines = job.wants.map((w) => book.find((b) => b.catalogueId === w || b.description === w) ?? { catalogueId: "MISC", description: w, rate: avg(book) });
    const q = await p.draftQuote({ jobId: job.id, lines }, job.id);
    if (q) await p.notify("owner", job.id, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id ?? null };
  },
  staleNoDedupe: async (p, ev) => {
    if (!ev?.job_id) return { outcome: "ignored" };
    const job = await p.readJob(ev.job_id);
    stale ??= await p.readPricebook();
    return good({ ...p, readJob: () => ({ ...job, quoteId: undefined }), readPricebook: () => stale }, ev);
  },
  trustsWrite: async (p, ev) => {
    const r = await good({ ...p, notify: (to, jobId, reason) => (reason === "write_failed" ? undefined : p.notify(to, jobId, reason)) }, ev);
    return r.outcome === "write_failed" ? { outcome: "drafted", quote_id: "assumed" } : r;
  },
  silentDraft: async (p, ev) => good({ ...p, notify: (to, jobId, reason) => (/^ready_to_release/.test(reason) ? undefined : p.notify(to, jobId, reason)) }, ev),
  formTrigger: async (p, ev) => {
    const book = await p.readPricebook();
    const q = await p.draftQuote({ jobId: ev?.job_id ?? ev?.message_id, lines: [book[0]] }, "x");
    if (q) await p.notify("owner", q.jobId, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id };
  },
};

const tally = {};
for (const [name, b] of Object.entries(builds)) {
  stale = null;
  const env = await runStandard(std.checks, scenarios, b, { standard: "quote-out-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  for (const r of env.results) (tally[r.n] ??= {})[name] = r.verdict;
}
for (const [n, v] of Object.entries(tally)) console.log(n.padStart(2), JSON.stringify(v));

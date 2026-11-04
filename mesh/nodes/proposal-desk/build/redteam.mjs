/**
 * Red team for the Proposal Desk scenarios. Every check claimed must go red for
 * a build that does nothing and for at least one deliberately broken build:
 *
 *   noop          does nothing
 *   guessesFees   prices an off-list service at the average fee and drafts anyway
 *   staleNoDedupe reads the fee list once, keeps it, and drafts a new proposal every pass
 *   trustsWrite   treats a write with no id as drafted and tells nobody
 *   skipsJob      drafts off the event without reading the job
 *   sendsDiscount prices a discount request and a variation as if they were clean
 *
 *   node redteam.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "./scenarios.mjs";
import { build as good } from "./build.mjs";

const std = await fetchChecks("quote-out-build-standard", "https://aipathway.com.au");
const average = (list) => Math.round(list.reduce((s, f) => s + f.rate, 0) / list.length);
const find = (list, w) => list.find((f) => f.catalogueId === w || f.description === w);
let remembered = null;

const builds = {
  noop: async () => {},
  guessesFees: async (p, ev) => {
    if (!ev?.job_id) return;
    const job = await p.readJob(ev.job_id);
    const list = await p.readPricebook();
    const lines = job.wants.map((w) => find(list, w) ?? { catalogueId: "ADVISORY", description: w, rate: average(list) });
    const q = await p.draftQuote({ jobId: job.id, lines }, `${job.id}:x`);
    if (q) await p.notify("partner", job.id, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id ?? null };
  },
  staleNoDedupe: async (p, ev) => {
    if (!ev?.job_id) return;
    const job = await p.readJob(ev.job_id);
    remembered ??= await p.readPricebook();
    const lines = job.wants.map((w) => find(remembered, w)).filter(Boolean);
    const q = await p.draftQuote({ jobId: job.id, lines }, `${job.id}:${Math.random()}`);
    if (q) await p.notify("partner", job.id, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id ?? null };
  },
  trustsWrite: async (p, ev) => {
    const r = await good({ ...p, notify: () => {} }, ev);
    return r.outcome === "write_failed" ? { outcome: "drafted", quote_id: "assumed" } : r;
  },
  skipsJob: async (p, ev) => {
    const list = await p.readPricebook();
    const q = await p.draftQuote({ jobId: ev?.job_id ?? ev?.message_id, lines: [list[0]] }, "x");
    if (q) await p.notify("partner", q.jobId, `ready_to_release:${q.id}`);
    return { outcome: "drafted", quote_id: q?.id };
  },
  sendsDiscount: async (p, ev) => good({ ...p, readJob: async (id) => { const j = await p.readJob(id); return j ? { ...j, isVariation: false, wantsDiscount: false } : j; } }, ev),
};

const tally = {};
for (const [name, b] of Object.entries(builds)) {
  remembered = null;
  const env = await runStandard(std.checks, scenarios, b, { standard: "quote-out-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  for (const r of env.results) (tally[r.n] ??= {})[name] = r.verdict;
}
for (const [n, v] of Object.entries(tally)) console.log(n.padStart(2), JSON.stringify(v));

/**
 * Red team for the Cash Seam scenarios: each check claimed must go red for a
 * build that does nothing and for at least one deliberately broken build.
 *
 *   node redteam.mjs
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "./scenarios.mjs";
import { build as good } from "./build.mjs";

const std = await fetchChecks("cash-seam-build-standard", "https://aipathway.com.au");

/** Wrap the real build's ports so one behaviour is broken. */
const withPorts = (patch) => async (ports) => good({ ...ports, ...patch(ports) });

const builds = {
  noop: async () => {},
  // Believes any id it is handed: no read-back, and no escalation on a null.
  trustsWrites: withPorts((p) => ({
    escalate: () => {},
    readQuote: (id) => ({ id, jobId: p.event()?.jobId ?? null, status: "draft" }),
  })),
  // Finds the client by trading name downstream, and walks past open exceptions.
  matchesByName: async (ports) => {
    const ev = ports.event();
    if (ev?.name === "job_created" || ev?.name === "job_completed") {
      const job = ports.readJob(ev.jobId);
      const twin = ports.searchJobs({ name: job?.customerName })[0];
      return good({
        ...ports,
        event: () => ({ ...ev, jobId: twin?.id }),
        readJob: (id) => {
          const j = ports.readJob(id);
          return j ? { ...j, exception: undefined } : j;
        },
      });
    }
    return good(ports);
  },
  // Drops the accepted estimate's id off the invoice.
  dropsQuoteId: withPorts((p) => ({ writeInvoice: (input) => p.writeInvoice({ ...input, quoteId: null }) })),
  // Acts on a chat message, and makes a new job for every form or call.
  chatty: async (ports) => {
    const ev = ports.event();
    if (ev?.name === "call_received") return good({ ...ports, searchJobs: () => [] });
    if (ev?.via === "chat" && ev.jobId) return ports.writeInvoice({ jobId: ev.jobId, quoteId: null, trigger: ev.id });
    return good(ports);
  },
};

const tally = {};
for (const [name, b] of Object.entries(builds)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "cash-seam-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  for (const r of env.results) (tally[r.n] ??= {})[name] = r.verdict;
}
for (const [n, v] of Object.entries(tally)) console.log(n.padStart(2), JSON.stringify(v));

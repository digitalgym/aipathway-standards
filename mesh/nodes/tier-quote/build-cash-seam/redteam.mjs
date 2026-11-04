/**
 * Red team for the Cash Seam run: the scenarios must go red for builds that do
 * nothing, or whose quote hop breaks one seam rule.
 *
 *   node redteam.mjs
 *
 * Exits 1 if a broken build is not caught where it is expected to be.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const std = await fetchChecks("cash-seam-build-standard", process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");
const claimed = ["identity-from-the-system-of-record", "one-job-per-enquiry", "no-external-id-no-write", "the-chain-carries-the-id", "confirmation-is-not-a-write", "named-unattended-trigger", "exception-owner-travels"];

/** Wrap the ports only while the quote hop (job_created) is running. */
const onQuoteHop = (fn) => async (ports) => {
  const ev = await ports.event();
  return build(ev?.name === "job_created" ? fn(ports) : ports);
};

const BROKEN = {
  "do-nothing": { build: async () => {}, mustFail: claimed },
  // Trusts the id the draft call returned and never reads the quote back.
  "no-readback": { build: onQuoteHop((p) => ({ ...p, readQuote: (id) => ({ id, jobId: null, status: "draft" }) })), mustFail: ["confirmation-is-not-a-write"] },
  // Treats a null id from the quote write as written.
  "trusts-null-quote": {
    build: onQuoteHop((p) => ({ ...p, draftQuote: (i) => { const w = p.draftQuote(i); return w.externalId ? w : { externalId: `Q-LOCAL-${i.jobId}` }; }, readQuote: (id) => p.readQuote(id) ?? { id, jobId: id.replace("Q-LOCAL-", ""), status: "draft" } })),
    mustFail: ["no-external-id-no-write"],
  },
  // Every hop ignores an open exception on the job.
  "passes-exceptions": {
    build: (p) => build({ ...p, readJob: (id) => { const j = p.readJob(id); return j && { ...j, exception: undefined }; } }),
    mustFail: ["exception-owner-travels"],
  },
};

let ok = true;
for (const [name, v] of Object.entries(BROKEN)) {
  const env = await runStandard(std.checks, scenarios, v.build, { standard: "cash-seam-build-standard", spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const missed = v.mustFail.filter((id) => !red.includes(id));
  if (missed.length) ok = false;
  console.log(`${missed.length ? "MISSED" : "caught"}  ${name.padEnd(18)} red: ${red.join(", ") || "(none)"}${missed.length ? `  NOT RED: ${missed.join(", ")}` : ""}`);
}
console.log(ok ? "\nEvery broken build was caught." : "\nA broken build got through. Strengthen the scenario.");
process.exitCode = ok ? 0 : 1;

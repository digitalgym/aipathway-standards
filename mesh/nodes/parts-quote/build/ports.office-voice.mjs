/**
 * The ports, behind the hosted provider: office_voice.draft_quote.
 *
 *   OFFICE_VOICE_API_KEY=ovk_live_... AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.draft_quote node run.mjs
 *
 * This is the second run against US rather than against your own systems.
 * Every port calls the Office Voice MCP: read_job, read_pricebook and draft_quote are the standard's own verbs, and escalate and notify are recorded as facts against the job so a parked quote leaves a trace. Nothing here names a rate: draft_quote takes catalogue ids and the system of record prices them.
 *
 * Env:
 *   OFFICE_VOICE_API_KEY     a key minted at /app/keys with contacts:read and contacts:write
 *   OFFICE_VOICE_MCP_URL     default https://office-voice.com/api/mcp
 *   OFFICE_VOICE_TENANT_ID   only when the key reaches several orgs
 *
 * The job has to exist. Xero has no jobs, so the job lives in Office Voice
 * (find_or_create_job made it, or the office did) and your scenarios drive the
 * build with a real id: build(world.ports(), process.env.OFFICE_VOICE_JOB_ID).
 * The office's Xero must be connected with quote drafting on
 * (/api/integrations/xero/connect?tenant_id=…&quotes=1); without it draft_quote
 * answers write_not_verified with that URL, which is check 6 doing its job.
 */

const MCP_URL = process.env.OFFICE_VOICE_MCP_URL ?? "https://office-voice.com/api/mcp";
const KEY = process.env.OFFICE_VOICE_API_KEY;
const TENANT = process.env.OFFICE_VOICE_TENANT_ID;

let rpcId = 0;
async function call(tool, args) {
  if (!KEY) throw new Error("OFFICE_VOICE_API_KEY is not set. Mint one at office-voice.com/app/keys with contacts:read and contacts:write.");
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name: tool, arguments: { ...(TENANT ? { tenant_id: TENANT } : {}), ...args } },
    }),
  });
  if (!res.ok) throw new Error(`${tool}: HTTP ${res.status} from ${MCP_URL}`);
  const body = await res.json();
  if (body.error) throw new Error(`${tool}: ${body.error.message}`);
  const out = body.result?.structuredContent ?? JSON.parse(body.result?.content?.[0]?.text ?? "{}");
  if (body.result?.isError || out?.error) throw new Error(`${tool}: ${out?.error ?? "tool error"}`);
  return out;
}

/** Remembered per run so updateJob, which only has the id, can name the caller. */
const jobs = new Map();

function withUs(port) {
  return () => {
    throw new Error(
      `${port}: performed by ${"office_voice.draft_quote"} on the live call, not from this harness. This check reports with_us.`,
    );
  };
}

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").QUOTE_PORT_MAP, Function>>} */
export const ports = (() => {
  // Remembered per run so updateQuote, which only has the quote id, can name
  // the job, and so escalate, which has neither, can name the last job read.
  const byQuote = new Map();
  let lastJob = null;
  const cents = (n) => Math.round(Number(n) * 100);
  const toQuote = (r, lines) => ({
    id: r.quote_external_id,
    jobId: r.job_external_id,
    lines: (r.line_items ?? lines).map((l) => ({ catalogueId: l.catalogue_id ?? l.catalogueId, description: l.description, rate: cents(l.line_total ?? l.unit_price ?? l.rate / 100) })),
    total: cents(r.amount ?? 0),
    state: "draft",
    updates: r.outcome === "quote_reused" ? 1 : 0,
    ...(r.duplicate_of ? { duplicateOf: r.duplicate_of } : {}),
  });

  return {
    async readJob(jobId) {
      const r = await call("read_job", { job_external_id: jobId });
      if (r.outcome !== "job_read") return null;
      lastJob = r.job_external_id;
      return { id: r.job_external_id, source: "call", wants: r.description ? [r.description] : [], ...(r.quote_external_id ? { quoteId: r.quote_external_id } : {}) };
    },

    async readPricebook() {
      const r = await call("read_pricebook", {});
      // no_price_list and unavailable are both a park, and the reason says which.
      if (r.outcome !== "priced") throw new Error(`read_pricebook: ${r.outcome}: ${r.reason}`);
      return r.lines.map((l) => ({ catalogueId: l.catalogue_id, description: l.description, rate: cents(l.unit_price) }));
    },

    async draftQuote(input, intentId) {
      const r = await call("draft_quote", {
        job_external_id: input.jobId,
        line_items: input.lines.map((l) => ({ catalogue_id: l.catalogueId, ...(l.description ? { description: l.description } : {}) })),
      });
      // parked, not_supported and write_not_verified all mean no quote exists
      // in the system of record. Null is the standard's "write not verified".
      if (r.outcome !== "quote_drafted" && r.outcome !== "quote_reused") return null;
      const quote = toQuote(r, input.lines);
      byQuote.set(quote.id, { jobId: input.jobId, lines: input.lines, quote });
      return quote;
    },

    async updateQuote(quoteId, intentId) {
      const known = byQuote.get(quoteId);
      if (!known) throw new Error(`updateQuote: ${quoteId} was not drafted in this run`);
      const r = await call("draft_quote", {
        job_external_id: known.jobId,
        line_items: known.lines.map((l) => ({ catalogue_id: l.catalogueId, ...(l.description ? { description: l.description } : {}) })),
      });
      if (r.outcome !== "quote_drafted" && r.outcome !== "quote_reused") return null;
      known.quote.updates += 1;
      known.quote.duplicateOf = known.quote.duplicateOf ?? r.duplicate_of ?? quoteId;
      return { ...known.quote };
    },

    async escalate(reason, detail) {
      // A parked quote is a real outcome, so it is recorded where the office
      // will read it: as a fact on the job.
      await call("record_fact", { subject_kind: "job", subject_ref: lastJob ?? "unknown-job", key: "quote.parked", value: { reason, ...(detail ? { detail } : {}) }, confidence: "verified" });
    },

    async notify(to, jobId, reason) {
      await call("record_fact", { subject_kind: "job", subject_ref: jobId, key: "quote.notify", value: { to, reason, provider: "office_voice.draft_quote" }, confidence: "verified" });
    },
  };
})();

/**
 * The ports, behind the hosted provider: office_voice.draft_invoice.
 *
 *   OFFICE_VOICE_API_KEY=ovk_live_... AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.draft_invoice node run.mjs
 *
 * This is the second run against US rather than against your own systems.
 * Every port calls the Office Voice MCP: read_job, read_pricebook and draft_invoice are the standard's own verbs. Nothing here names a rate: draft_invoice takes catalogue ids and the ledger prices them. The release and the send are a person's act in the ledger, so here they are recorded as facts against the job rather than performed, and nothing in this file can authorise or send an invoice.
 *
 * Env:
 *   OFFICE_VOICE_API_KEY     a key minted at /app/keys with contacts:read and contacts:write
 *   OFFICE_VOICE_MCP_URL     default https://office-voice.com/api/mcp
 *   OFFICE_VOICE_TENANT_ID   only when the key reaches several orgs
 *   OFFICE_VOICE_JOB_ID      the complete job to invoice: its id in ServiceM8 or Simpro, or in your own build
 *   OFFICE_VOICE_JOB_INLINE  only when your build holds the job (no job system): JSON
 *                            {"status":"complete","customer":{"name":"…","email":"…"}}, sent inline to draft_invoice
 *   OFFICE_VOICE_JOB_LINES   JSON: [{"code":"CALL","qty":1,"kind":"callout"}, ...] the job's lines by catalogue code.
 *                            With a job system, read_job returns the lines and this is only the fallback
 *
 * The office's Xero must be connected with drafting on
 * (/api/integrations/xero/connect?tenant_id=…&quotes=1); the same scope covers
 * a draft invoice. Without it draft_invoice answers write_not_verified with
 * that URL, which is check 7 doing its job.
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
      `${port}: performed by ${"office_voice.draft_invoice"} on the live call, not from this harness. This check reports with_us.`,
    );
  };
}

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").INVOICE_PORT_MAP, Function>>} */
export const ports = (() => {
  // The one job under test, named by the runner. With ServiceM8 or Simpro
  // connected, read_job returns the job and its lines by catalogue code. With
  // no job system the build holds the job, so it comes from the environment and
  // goes to draft_invoice inline. OFFICE_VOICE_JOB_LINES is the fallback for a
  // job system whose lines read_job cannot read.
  const JOB_ID = process.env.OFFICE_VOICE_JOB_ID;
  const JOB_LINES = JSON.parse(process.env.OFFICE_VOICE_JOB_LINES ?? "[]");
  const INLINE = process.env.OFFICE_VOICE_JOB_INLINE ? JSON.parse(process.env.OFFICE_VOICE_JOB_INLINE) : null;
  const fromEnv = () => JOB_LINES.map((l) => ({ code: l.code, qty: l.qty ?? 1, kind: l.kind ?? "labour", description: l.description ?? l.code, ...(l.signedAcceptance ? { signedAcceptance: l.signedAcceptance } : {}) }));
  const cents = (n) => Math.round(Number(n) * 100);
  const byJob = new Map();
  const toInvoice = (r) => ({
    id: r.invoice_external_id,
    externalId: r.invoice_external_id,
    jobId: r.job_external_id,
    lines: (r.line_items ?? []).map((l) => ({ code: l.catalogue_id, qty: l.quantity ?? 1, rate: cents(l.unit_price ?? 0), kind: "labour" })),
    bookEdition: r.pricebook_read_at ?? null,
    ...(r.stage ? { stage: r.stage } : {}),
    status: r.outcome === "parked" ? "parked" : "draft",
    ...(r.park_reason ? { parkReason: r.park_reason } : {}),
    evidence: [],
    updates: r.outcome === "invoice_reused" ? 1 : 0,
  });

  return {
    async readJobs() {
      if (!JOB_ID) throw new Error("OFFICE_VOICE_JOB_ID is not set: name the complete job the run invoices.");
      if (INLINE) {
        return [{ id: JOB_ID, customerId: INLINE.customer?.email ?? INLINE.customer?.name ?? "unknown", status: INLINE.status ?? "complete", lines: fromEnv() }];
      }
      const r = await call("read_job", { job_external_id: JOB_ID });
      if (r.outcome !== "job_read") return [];
      const lines = r.lines_status === "read" && (r.lines ?? []).length
        ? r.lines.map((l) => ({ code: l.catalogue_id, qty: l.quantity, kind: "labour", description: l.description ?? l.catalogue_id ?? "" }))
        : fromEnv();
      return [{ id: r.job_external_id, customerId: r.customer_external_id ?? "unknown", status: "complete", lines, ...(r.contract_stage ? { contractStage: r.contract_stage } : {}) }];
    },

    async readInvoiceForJob(jobId) {
      return byJob.get(jobId) ?? null;
    },

    async readPricebook() {
      const r = await call("read_pricebook", {});
      if (r.outcome !== "priced") throw new Error(`read_pricebook: ${r.outcome}: ${r.reason}`);
      return { edition: r.read_at ?? "live", items: r.lines.map((l) => ({ code: l.catalogue_id, description: l.description, rate: cents(l.unit_price) })) };
    },

    async readReleaseRule() {
      // The release is a person's act in the ledger. No rule releases for them here.
      return null;
    },

    async writeInvoice(input) {
      const r = await call("draft_invoice", {
        job_external_id: input.jobId,
        line_items: input.lines.map((l) => ({ catalogue_id: l.code, quantity: l.qty })),
        ...(input.stage ? { stage: input.stage } : {}),
        ...(INLINE ? { job: INLINE } : {}),
      });
      // parked, not_supported and write_not_verified all mean no invoice exists
      // in the ledger. Null is the standard's "write not verified".
      if (r.outcome !== "invoice_drafted" && r.outcome !== "invoice_reused") return null;
      const invoice = toInvoice(r);
      byJob.set(input.jobId, invoice);
      return invoice;
    },

    async attachEvidence(invoiceId, ref) {
      await call("record_fact", { subject_kind: "job", subject_ref: JOB_ID ?? "unknown-job", key: "invoice.evidence", value: { invoiceId, ref }, confidence: "verified" });
    },

    async release(invoiceId, by) {
      // Recorded, never performed: a person releases in the ledger.
      await call("record_fact", { subject_kind: "job", subject_ref: JOB_ID ?? "unknown-job", key: "invoice.release_requested", value: { invoiceId, ...by, provider: "office_voice.draft_invoice" }, confidence: "verified" });
    },

    async send(invoiceId) {
      // Recorded, never performed. Nothing in this file can send an invoice.
      await call("record_fact", { subject_kind: "job", subject_ref: JOB_ID ?? "unknown-job", key: "invoice.send_requested", value: { invoiceId }, confidence: "verified" });
    },

    async readRecord(jobId) {
      return { invoice: byJob.get(jobId) ?? null };
    },

    async escalate(reason, detail) {
      await call("record_fact", { subject_kind: "job", subject_ref: JOB_ID ?? "unknown-job", key: "invoice.parked", value: { reason, ...(detail ? { detail } : {}) }, confidence: "verified" });
    },
  };
})();

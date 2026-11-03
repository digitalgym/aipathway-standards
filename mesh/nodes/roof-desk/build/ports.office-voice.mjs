/**
 * The ports, behind the hosted provider: office_voice.front_desk.
 *
 *   OFFICE_VOICE_API_KEY=ovk_live_... AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.front_desk node run.mjs
 *
 * This is the second run against US rather than against your own systems.
 * The write-back ports call the Office Voice MCP (find_or_create_job, with the dedupe the standard requires); the call ports throw, because the live call is the step the standard says not to hand-roll and the insert performs it on a real line, not from here. Their checks report with_us.
 *
 * Env:
 *   OFFICE_VOICE_API_KEY     a key minted at /app/keys with contacts:read and contacts:write
 *   OFFICE_VOICE_MCP_URL     default https://office-voice.com/api/mcp
 *   OFFICE_VOICE_TENANT_ID   only when the key reaches several orgs
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
      `${port}: performed by ${"office_voice.front_desk"} on the live call, not from this harness. This check reports with_us.`,
    );
  };
}

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").CALL_PORT_MAP, Function>>} */
export const ports = {
  async findOpenJob(phone) {
    const r = await call("find_or_create_job", { find_only: true, caller_e164: phone });
    if (!r.found) return null;
    const known = jobs.get(r.job_external_id);
    return { id: r.job_external_id, phone, address: known?.address ?? "", type: known?.type ?? "unclassified", open: true, updates: known?.updates ?? 0 };
  },

  async writeJob(job, intentId) {
    const r = await call("find_or_create_job", {
      intent_id: intentId,
      caller_e164: job.phone,
      site_address: job.address,
      description: `${job.type} job from after-hours call`,
      note: `After-hours call: ${job.type}. Address given: ${job.address}.`,
    });
    const created = { ...job, id: r.job_external_id, open: true, updates: r.outcome === "job_reused" ? 1 : 0 };
    if (r.outcome === "job_reused") created.duplicateOf = r.job_external_id;
    jobs.set(created.id, created);
    return created;
  },

  async updateJob(id, intentId) {
    const known = jobs.get(id);
    if (!known) throw new Error(`updateJob: ${id} was not written in this run`);
    const r = await call("find_or_create_job", {
      intent_id: intentId,
      caller_e164: known.phone,
      site_address: known.address,
      description: `${known.type} job from after-hours call`,
      note: "Second call about the same job.",
    });
    known.updates += 1;
    known.duplicateOf = known.duplicateOf ?? r.job_external_id;
    return known;
  },

  resolveAddress: withUs("resolveAddress"),
  disclose: withUs("disclose"),
  say: withUs("say"),
  hear: withUs("hear"),
  notify: withUs("notify"),
  escalate: withUs("escalate"),
  sendSms: withUs("sendSms"),
};

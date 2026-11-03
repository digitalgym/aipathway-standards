/**
 * The Cash Seam, as the After-Hours Desk carries it.
 *
 * Built to AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard (CC BY 4.0).
 *
 * This node's own hop is the first one: `call_received` -> one job (or the
 * open one, with duplicate_of) -> the job system's id, which wakes Quote Out
 * as `job.created`. The Cash Seam checks assert the id surviving all four
 * handovers, so the downstream hops are here too, as the thinnest seam glue
 * the standard allows: read by id, refuse past an open exception, a write
 * counts only when it reads back, and a send waits for a named release.
 * Pricing, invoice content and the chase itself are the other standards' jobs
 * and the Mesh's other nodes; nothing here prices, words or dials anything.
 *
 * The build runs once per delivered event and keeps nothing between runs.
 */

/** Which event wakes which hop. Anything else, including chat, wakes nothing. */
const HOPS = {
  call_received: intake,
  job_created: quoteFromJob,
  quote_accepted: noteAccepted,
  job_completed: invoiceFromJob,
  invoice_overdue: chaseOverdue,
};
const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

export async function build(ports) {
  const ev = await ports.event();
  if (!ev) return;
  // A chat message is not a trigger. Neither is any event that did not arrive
  // by webhook, schedule or polling.
  if (!UNATTENDED.has(ev.via)) return;
  const hop = HOPS[ev.name];
  if (!hop) return;
  await hop(ports, ev);
}

async function ownerFor(ports, stage) {
  const owners = (await ports.readOwners()) ?? {};
  return owners[stage] ?? null;
}

/** An open exception on the job stops this hop. The hold names its owner. */
async function heldByException(ports, job, stage, ev) {
  if (!job?.exception) return false;
  await ports.escalate({
    stage,
    ref: job.id,
    reason: "held_open_exception",
    owner: job.exception.owner ?? null,
    detail: `open exception "${job.exception.reason}" on job ${job.id}; ${ev.name} not acted on`,
  });
  return true;
}

/** Release by the business's rule, or leave it for a person. Returns who released. */
async function releaseByRule(ports, kind, id) {
  const rule = await ports.readReleaseRule();
  if (!rule?.name) return null;
  await ports.release({ kind, id, rule: rule.name });
  return rule.name;
}

// ── Hop 1: the call. This node. ──────────────────────────────────────────
async function intake(ports, ev) {
  // The only hop allowed to match on a phone number: no job id exists yet.
  const open = (await ports.searchJobs({ phone: ev.phone, status: "open" })) ?? [];
  if (open.length > 0) {
    const job = open[0];
    if (job.exception) return; // halts on open: nothing written past it
    await ports.attachEnquiry({ enquiryId: ev.enquiryId, jobId: job.id, trigger: ev.id });
    return;
  }
  const out = await ports.writeJob({ customerName: ev.customerName, phone: ev.phone, enquiryId: ev.enquiryId, trigger: ev.id });
  const id = out?.externalId ?? null;
  const back = id ? await ports.readJob(id) : null;
  if (!id || !back) {
    await ports.escalate({ stage: "job", ref: id, reason: "write_failed", owner: await ownerFor(ports, "job"), detail: `job write for enquiry ${ev.enquiryId} returned no id that reads back` });
  }
  // The job system's own job_created event wakes Quote Out. Nothing else to do here.
}

// ── Hop 2: Quote Out's seam. Woken by job_created, reads the job by id. ────
async function quoteFromJob(ports, ev) {
  const job = await ports.readJob(ev.jobId);
  if (!job) return;
  if (await heldByException(ports, job, "quote", ev)) return;
  if ((job.quotes ?? []).length > 0) return; // one quote per job: a retried event drafts nothing new
  const out = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const id = out?.externalId ?? null;
  const back = id ? await ports.readQuote(id) : null;
  if (!id || !back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: await ownerFor(ports, "quote"), detail: id ? `quote ${id} was confirmed but does not read back` : "quote write returned no id" });
    return;
  }
  if (!(await releaseByRule(ports, "quote", back.id))) return; // waits for a person
  await ports.send({ kind: "quote", id: back.id, trigger: ev.id });
}

// ── Quote accepted: read it back by id, nothing to write. ─────────────────
async function noteAccepted(ports, ev) {
  if (ev.quoteId) await ports.readQuote(ev.quoteId);
}

// ── Hop 3: Invoice Out's seam. Woken by job_completed, reads the job by id. ─
async function invoiceFromJob(ports, ev) {
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return;
  if (await heldByException(ports, job, "invoice", ev)) return;
  const accepted = [];
  for (const q of job.quotes ?? []) {
    const back = await ports.readQuote(q.id);
    if (back && back.status === "accepted" && back.jobId === job.id) accepted.push(back);
  }
  const quoteId = accepted[0]?.id ?? null;
  const out = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const id = out?.externalId ?? null;
  const back = id ? await ports.readInvoice(id) : null;
  if (!id || !back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: await ownerFor(ports, "invoice"), detail: "invoice write returned no id that reads back" });
    return;
  }
  if (!(await releaseByRule(ports, "invoice", back.id))) return;
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
}

// ── Hop 4: Debtor Chasing's seam. A schedule reads the live ledger. ───────
async function chaseOverdue(ports, ev) {
  const rows = (await ports.readLedger()) ?? [];
  const targets = ev.invoiceId ? rows.filter((r) => r.id === ev.invoiceId) : rows;
  for (const row of targets.filter((r) => r.overdue)) {
    const job = await ports.readJob(row.jobId);
    if (await heldByException(ports, job, "chase", ev)) continue;
    const live = await ports.readInvoice(row.id);
    if (!live || live.status !== "sent") continue;
    if (!(await releaseByRule(ports, "chase", live.id))) continue;
    await ports.send({ kind: "chase", id: live.id, trigger: ev.id });
  }
}

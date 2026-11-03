/**
 * Estimate Desk across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS ESTIMATE DESK HERE. One hop: `estimateHop`, woken by `job.created`
 * for a price request the intake hop logged as a job from the website form.
 * It reads the job by the id on the event, stops on an open exception, keeps
 * an existing quote rather than making a second, drafts against that job id,
 * and counts the draft only once it reads back by its own id on that job. It
 * never sends. The pricing itself (price list only, park what is off it) is
 * proved in ../build against the Quote Out world; this world proves the
 * handover.
 *
 * WHAT IS NOT ESTIMATE DESK. The seam checks are about handovers, so the run
 * needs a hop either side. These are THIN STAND-INS, labelled as such, written
 * to the seam's rules so the handover into and out of Estimate Desk can be
 * asserted. They are not part of the listed node:
 *
 *   standInFormIntake  the intake node that logs a form request (or a call) as a job
 *   standInInvoiceOut  an Invoice Out node, woken by job.completed
 *   standInChaser      a Debtor Chasing node, woken by a schedule
 *
 * `ownerReleasesEstimate` is the office's own act: the named person who owns
 * estimates reads the draft back and sends it from their own system.
 */

export const NODE = "estimate-desk";

/** The world's event names, mapped to the mesh vocabulary. */
export const VOCAB = {
  call_received: "email.received", // the form door; this world calls every enquiry a call
  job_created: "job.created",
  quote_accepted: "quote.accepted",
  job_completed: "job.completed",
  invoice_overdue: "invoice.overdue",
};

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** One run per event. Nothing else wakes it, and a chat message is not an event. */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via)) return { outcome: "ignored" };
  switch (ev.name) {
    case "job_created":
      return estimateHop(ports, ev);
    case "call_received":
      return standInFormIntake(ports, ev);
    case "job_completed":
      return standInInvoiceOut(ports, ev);
    case "invoice_overdue":
      return standInChaser(ports, ev);
    default:
      return { outcome: "ignored" };
  }
}

/** An open exception on the record: note the hold against its owner and stop. */
async function haltsOnException(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open exception: ${job.exception.reason}` });
  return true;
}

// ── Estimate Desk: the listed node ───────────────────────────────────────
export async function estimateHop(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.id !== ev.jobId) return { outcome: "ignored" };
  if (await haltsOnException(ports, job, "quote")) return { outcome: "held", job_id: job.id };

  if (job.quotes.length > 0) {
    const kept = job.quotes[0].id;
    return { outcome: "kept", job_id: job.id, quote_id: kept, duplicate_of: kept };
  }

  const owners = await ports.readOwners();
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const back = await ports.readQuote(w.externalId);
  if (!back || back.id !== w.externalId || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `estimate ${w.externalId} did not read back on job ${job.id}` });
    return { outcome: "write_failed", job_id: job.id };
  }
  return { outcome: "drafted", job_id: job.id, quote_id: back.id, state: back.status };
}

/** The person who owns estimates sends the draft from their own system. Never the bot. */
export async function ownerReleasesEstimate(ports, jobId, person) {
  const job = await ports.readJob(jobId);
  if (!job || job.exception) return [];
  const sent = [];
  for (const { id } of job.quotes) {
    const q = await ports.readQuote(id);
    if (!q || q.jobId !== job.id || q.status !== "draft") continue;
    await ports.release({ kind: "quote", id: q.id, person });
    await ports.send({ kind: "quote", id: q.id, trigger: null });
    sent.push(q.id);
  }
  return sent;
}

// ── THIN STAND-INS for the hops either side. Not part of the listed node. ──

/** Stand-in intake: the only hop allowed to look up by contact, to find an open job. */
async function standInFormIntake(ports, ev) {
  const owners = await ports.readOwners();
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return { outcome: "attached", job_id: open[0].id };
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = w?.externalId ? await ports.readJob(w.externalId) : null;
  if (!back) {
    await ports.escalate({ stage: "job", ref: w?.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** Stand-in Invoice Out: woken by job.completed, raises against the job and its accepted quote. */
async function standInInvoiceOut(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await haltsOnException(ports, job, "invoice")) return { outcome: "held", job_id: job.id };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "kept", job_id: job.id };

  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id) quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "write_invoice returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId} did not read back` });
    return { outcome: "write_failed", job_id: job.id };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) return { outcome: "raised", invoice_id: back.id };
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

/** Stand-in Debtor Chasing: on a schedule, reads overdue invoices off the live ledger by id. */
async function standInChaser(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const chased = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await haltsOnException(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

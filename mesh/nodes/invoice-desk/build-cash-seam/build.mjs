/**
 * Invoice Desk across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS INVOICE DESK HERE, AND WHAT IS NOT. Invoice Desk is one hop:
 * woken by `job.completed`, it reads the job by the id the event carried, stops
 * on an open exception, keeps the one invoice a job already has, takes the
 * accepted quote's id by reading it by id off the job, writes one draft into
 * the ledger, and counts it only when the id reads back. Then the release gate:
 * a rule the business set, or the person named for invoices. That hop is
 * `invoiceHop` below, and it follows the same loop as ../build/build.mjs (the
 * Invoice Out build).
 *
 * The Cash Seam checks are about the handovers, so the run needs the hops on
 * either side. These are THIN STAND-INS for the neighbouring nodes, written to
 * the seam's rules so the handover into and out of Invoice Desk can be
 * asserted. They are not part of the listed node:
 *
 *   standInIntake   Booked After Hours: call in, one job per enquiry
 *   standInQuote    Quote Out: one draft quote per job, read back by id, never sent by the bot
 *   standInChase    Debtor Chasing: overdue invoices read off the live ledger by id
 *
 * `releaseQuoteByPerson` is the office's own act, not a bot's: the named
 * person who owns quotes reads the draft back and sends it.
 */

export const NODE = "invoice-desk";

/** The world's event names, mapped to the mesh vocabulary. */
export const VOCAB = {
  call_received: "call.received",
  job_created: "job.created",
  quote_accepted: "quote.accepted",
  job_completed: "job.completed",
  invoice_overdue: "invoice.overdue",
};

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** One run: whatever the event that woke it says, and nothing else. */
export async function build(ports) {
  const ev = await ports.event();
  // A chat message is not a trigger, and nothing wakes a hop but a named event.
  if (!ev || !UNATTENDED.has(ev.via) || !(ev.name in VOCAB)) return { outcome: "ignored" };
  switch (ev.name) {
    case "call_received":
      return standInIntake(ports, ev);
    case "job_created":
      return standInQuote(ports, ev);
    case "job_completed":
      return invoiceHop(ports, ev);
    case "invoice_overdue":
      return standInChase(ports, ev);
    default:
      return { outcome: "ignored" }; // quote_accepted: the invoice waits for the job to complete
  }
}

/** An open exception with an owner on the job stops the hop, and the hold names that owner. */
async function heldBy(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open: ${job.exception.reason}` });
  return true;
}

// ── Invoice Desk ──────────────────────────────────────────────────────────
/** Woken by job.completed. Reads the job by the id the event carried. Never searches. */
export async function invoiceHop(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return { outcome: "ignored", job_id: ev.jobId };
  if (await heldBy(ports, job, "invoice")) return { outcome: "held", job_id: job.id };

  // One invoice per job: read the ledger before writing, keep what is there.
  const existing = (await ports.readLedger()).find((r) => r.jobId === job.id);
  if (existing) return { outcome: "kept", job_id: job.id, invoice_id: existing.id, duplicate_of: existing.id };

  // The accepted quote's id, read by its id off the job, and only if it names this job.
  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id && q.status === "accepted") quoteId = q.id;
  }

  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "write_invoice returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  // A confirmation is not a write: the invoice counts once it reads back by its id, on this job.
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId} did not read back` });
    return { outcome: "write_failed", job_id: job.id };
  }

  // invoice.raised. The release gate: the rule the business set, or the person named for invoices.
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "awaiting_release", owner: owners.invoice, detail: `draft ${back.id} waits for a release` });
    return { outcome: "raised", job_id: job.id, invoice_id: back.id };
  }
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", job_id: job.id, invoice_id: back.id };
}

// ── Thin stand-ins for the neighbouring nodes. Not part of Invoice Desk. ──
/** STAND-IN for Booked After Hours. The one hop allowed to look up by phone, to find an open job. */
async function standInIntake(ports, ev) {
  const owners = await ports.readOwners();
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return { outcome: "attached", job_id: open[0].id };
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = w.externalId ? await ports.readJob(w.externalId) : null;
  if (!back) {
    await ports.escalate({ stage: "job", ref: w.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job write did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** STAND-IN for Quote Out. One draft per job, read back by id; sending stays with a person. */
async function standInQuote(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldBy(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length > 0) return { outcome: "kept", quote_id: job.quotes[0].id };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = w.externalId ? await ports.readQuote(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** The person who owns quotes releases and sends a draft. The office's act, not a bot's. */
export async function releaseQuoteByPerson(ports, jobId, person) {
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

/** STAND-IN for Debtor Chasing. Woken by a schedule; reads overdue invoices off the live ledger. */
async function standInChase(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const out = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await heldBy(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    out.push(row.id);
  }
  return { outcome: "chased", invoice_ids: out };
}

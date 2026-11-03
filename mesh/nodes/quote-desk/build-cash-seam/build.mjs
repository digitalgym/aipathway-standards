/**
 * Quote Desk across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS QUOTE DESK HERE, AND WHAT IS NOT. Quote Desk is one hop: woken by
 * `job.created`, it reads the job by its id and drafts the quote carrying that
 * id. That hop is `quoteHop` below, and it follows the same loop as
 * ../build/build.mjs (the Quote Out build): read by id, stop on an open
 * exception, one quote per job, a write counts only when its id reads back, and
 * no send.
 *
 * The Cash Seam checks are about the handovers, so the run needs the hops on
 * either side of it. `intakeHop`, `invoiceHop` and `chaseHop` are minimal
 * stand-ins for the neighbouring nodes (Booked After Hours, Invoice Out,
 * Debtor Chasing), written to the seam's rules so the handover into and out of
 * Quote Desk can be asserted. They are not part of the listed node.
 *
 * `releaseQuoteByPerson` is the office's own act, not the bot's: the named
 * person who owns quotes reads the draft back and sends it from the job
 * system. Quote Out keeps sending with a person, so Quote Desk never calls it.
 */

export const NODE = "quote-desk";

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
      return intakeHop(ports, ev);
    case "job_created":
      return quoteHop(ports, ev);
    case "job_completed":
      return invoiceHop(ports, ev);
    case "invoice_overdue":
      return chaseHop(ports, ev);
    default:
      return { outcome: "ignored" }; // quote_accepted: the invoice waits for job completed
  }
}

/** An open exception with an owner on the job stops the hop, and the hold names that owner. */
async function heldBy(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open: ${job.exception.reason}` });
  return true;
}

// ── Quote Desk ────────────────────────────────────────────────────────────
/** Woken by job.created. Reads the job by the id the event carried. Never searches. */
export async function quoteHop(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldBy(ports, job, "quote")) return { outcome: "held", job_id: job.id };

  // One quote per job: a job already carrying one keeps it.
  if (job.quotes.length > 0) return { outcome: "kept", job_id: job.id, quote_id: job.quotes[0].id, duplicate_of: job.quotes[0].id };

  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  // A confirmation is not a write: the quote counts once it reads back by its id, on this job.
  const back = await ports.readQuote(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId} did not read back` });
    return { outcome: "write_failed", job_id: job.id };
  }
  // Left in draft. Sending stays with the person who owns quotes.
  return { outcome: "drafted", job_id: job.id, quote_id: back.id, state: back.status };
}

/** The person who owns quotes releases and sends a draft from the job system. Not the bot. */
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

// ── Neighbour stand-ins, so the handovers either side can be asserted ─────
/** Booked After Hours stand-in. The one hop allowed to look up by phone, to find an open job. */
async function intakeHop(ports, ev) {
  const owners = await ports.readOwners();
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return { outcome: "attached", job_id: open[0].id, duplicate_of: open[0].id };
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = w.externalId ? await ports.readJob(w.externalId) : null;
  if (!back) {
    await ports.escalate({ stage: "job", ref: w.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job write did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** Invoice Out stand-in. Woken by job.completed; raises from the accepted quote and the job id. */
async function invoiceHop(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldBy(ports, job, "invoice")) return { outcome: "held", job_id: job.id };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "kept", job_id: job.id };

  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id) quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "write_invoice returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId} did not read back` });
    return { outcome: "write_failed", job_id: job.id };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) return { outcome: "raised", invoice_id: back.id }; // waits for a person
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

/** Debtor Chasing stand-in. Woken by a schedule; reads overdue invoices off the live ledger by id. */
async function chaseHop(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const out = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await heldBy(ports, job, "chase")) continue;
    if (!rule) continue; // waits for a person
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    out.push(row.id);
  }
  return { outcome: "chased", invoice_ids: out };
}

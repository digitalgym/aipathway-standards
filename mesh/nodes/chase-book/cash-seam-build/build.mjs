/**
 * Chase Book across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS CHASE BOOK HERE, AND WHAT IS NOT. Chase Book is the last hop on the
 * cash path: woken by its schedule (`invoice_overdue`), it reads the live
 * ledger, takes each overdue invoice by the id the ledger returned, re-reads
 * that invoice by id just before the reminder, stops on an open exception on
 * the job it came from, and only then sends. That hop is `chaseHop` below. Its
 * ranking, buckets and gate are proved in ../build (the Debtor Chasing run);
 * here the seam asks only that the chase carries the ledger's invoice id, is
 * woken by a named event, and does not pass an exception.
 *
 * THIN STAND-INS, NOT PART OF THE LISTED NODE. The Cash Seam checks are about
 * handovers, so the run needs the hops before Chase Book. `intakeHop`,
 * `quoteHop` and `invoiceHop` are minimal stand-ins for the neighbouring nodes
 * (Booked After Hours, Quote Out, Invoice Out), written to the seam's rules so
 * the invoice id Chase Book reads can be traced back to the job. They are
 * labelled STAND-IN below and Chase Book does not ship them.
 *
 * `releaseQuoteByPerson` is the office's own act, not a bot's: the named person
 * who owns quotes reads the draft back and sends it from the job system.
 */

export const NODE = "chase-book";

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
  // A chat message is not a trigger. Nothing wakes a hop but a named, unattended event.
  if (!ev || !UNATTENDED.has(ev.via) || !(ev.name in VOCAB)) return { outcome: "ignored" };
  switch (ev.name) {
    case "invoice_overdue":
      return chaseHop(ports, ev);
    case "call_received":
      return intakeHop(ports, ev);
    case "job_created":
      return quoteHop(ports, ev);
    case "job_completed":
      return invoiceHop(ports, ev);
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

// ── Chase Book ────────────────────────────────────────────────────────────
/**
 * Woken by its schedule. Lists overdue invoices off the live ledger, then works
 * each one by the id the ledger returned. Never by a name or a phone number.
 */
export async function chaseHop(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  if (rows.length === 0) return { outcome: "nothing_overdue", invoice_ids: [] };
  // The reminder schedule the business set. With none, every reminder waits for a person.
  const rule = await ports.readReleaseRule();
  const chased = [];
  for (const row of rows) {
    // Stop on payment, off the ledger: re-read this invoice by its id right before the send.
    const fresh = await ports.readInvoice(row.id);
    if (!fresh || fresh.id !== row.id || !fresh.overdue) continue;
    // An open exception on the job this invoice came from stops the chase.
    const job = fresh.jobId ? await ports.readJob(fresh.jobId) : null;
    if (await heldBy(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: fresh.id, rule: rule.name });
    await ports.send({ kind: "chase", id: fresh.id, trigger: ev.id });
    chased.push(fresh.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

/** The person who owns quotes releases and sends a draft from the job system. Not a bot. */
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

// ── STAND-IN: Booked After Hours. The one hop allowed to look up by phone. ─
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

// ── STAND-IN: Quote Out. Drafts against the job id; a person sends. ───────
async function quoteHop(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldBy(ports, job, "quote")) return { outcome: "held", job_id: job.id };
  if (job.quotes.length > 0) return { outcome: "kept", job_id: job.id, quote_id: job.quotes[0].id };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote returned no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const back = await ports.readQuote(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId} did not read back` });
    return { outcome: "write_failed", job_id: job.id };
  }
  return { outcome: "drafted", job_id: job.id, quote_id: back.id };
}

// ── STAND-IN: Invoice Out. Raises from the accepted quote and the job id. ──
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
  if (!rule) return { outcome: "raised", invoice_id: back.id };
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

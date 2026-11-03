/**
 * Delivery Billing across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * THE LISTED NODE IS ONE HOP. `billingHop` below is Delivery Billing: woken by
 * job_completed (the job system marking a delivery job done), it reads the job
 * by the id the event carried, stops on an open exception and names its owner,
 * reads the ledger so one job never gets two invoices, raises the invoice with
 * the job id and the accepted quote id, counts the write only when it reads
 * back by its id on this job, and sends only under the owner's rule. The
 * lines, the book, the parking and the threshold are proved by ../build (the
 * Invoice Out run); this run proves the handovers into and out of that hop.
 *
 * THE OTHER HOPS ARE THIN STAND-INS, NOT PART OF THE LISTED NODE:
 *   STAND-IN intake   opens a job from a call, or attaches a repeat caller
 *   STAND-IN quote    drafts a quote against the job id and sends it under the rule
 *   STAND-IN chase    reads overdue invoices off the live ledger by id
 * Each keeps the seam's rules only so the handover can be asserted.
 */

export const NODE = "delivery-billing";

/** The seam world's event names, and the mesh vocabulary name each one is. */
export const VOCAB = {
  call_received: "call.received",
  job_created: "job.created",
  quote_accepted: "quote.accepted",
  job_completed: "job.completed",
  invoice_overdue: "invoice.overdue",
};

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** One run per delivered event. A chat message wakes nothing. */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via) || !(ev.name in VOCAB)) return { outcome: "ignored" };
  if (ev.name === "job_completed") return billingHop(ports, ev);
  if (ev.name === "call_received") return intakeStandIn(ports, ev);
  if (ev.name === "job_created") return quoteStandIn(ports, ev);
  if (ev.name === "invoice_overdue") return chaseStandIn(ports, ev);
  return { outcome: "waiting" }; // quote_accepted: the invoice waits for the job to be done
}

/** An open exception on the job stops the hop; the hold names whoever owns it. */
async function held(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `exception open on ${job.id}: ${job.exception.reason}` });
  return true;
}

// ── Delivery Billing: the listed node ─────────────────────────────────────
export async function billingHop(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return { outcome: "not_complete" };
  if (await held(ports, job, "invoice")) return { outcome: "held", job_id: job.id };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "already_invoiced", job_id: job.id };

  let quoteId = null;
  for (const q of job.quotes.filter((x) => x.status === "accepted")) {
    const back = await ports.readQuote(q.id);
    if (back && back.jobId === job.id) quoteId = back.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const back = w.externalId ? await ports.readInvoice(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: w.externalId ? `invoice ${w.externalId} did not read back on ${job.id}` : "the ledger returned no invoice id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage: "invoice", ref: null, reason: "awaiting_release", owner: owners.invoice, detail: `invoice ${back.id} on ${job.id} waits for a person` });
    return { outcome: "awaiting_release", invoice_id: back.id };
  }
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

// ── STAND-INS. Not part of the listed node. ───────────────────────────────
async function intakeStandIn(ports, ev) {
  const owners = await ports.readOwners();
  // Intake is the one hop that may look up by number: no job id exists yet.
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return { outcome: "attached", job_id: open[0].id };
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = w.externalId ? await ports.readJob(w.externalId) : null;
  if (!back) {
    await ports.escalate({ stage: "job", ref: w.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "opened", job_id: back.id };
}

async function quoteStandIn(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await held(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length) return { outcome: "already_quoted" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = w.externalId ? await ports.readQuote(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: w.externalId ? `quote ${w.externalId} did not read back` : "no quote id" });
    return { outcome: "write_failed" };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) return { outcome: "drafted", quote_id: back.id };
  await ports.release({ kind: "quote", id: back.id, rule: rule.name });
  await ports.send({ kind: "quote", id: back.id, trigger: ev.id });
  return { outcome: "sent", quote_id: back.id };
}

async function chaseStandIn(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const chased = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await held(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

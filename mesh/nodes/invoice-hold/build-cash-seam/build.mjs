/**
 * Invoice Hold across the Cash Seam, AIP-BS-CASH-SEAM, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * THE LISTED NODE IS ONE HOP. `invoiceHoldHop` is Invoice Hold: woken by
 * `job_completed` (job.completed in the mesh vocabulary), it reads the job by
 * the id on the event, stops on an open exception, reads the ledger so the job
 * keeps its one invoice, takes the accepted quote's id by reading that quote by
 * id, writes one draft, and counts it only once the ledger reads it back by its
 * id. Then the hold: a rule the business set, or the person named for invoices.
 * It is the same loop as ../build/build.mjs.
 *
 * THE OTHER HOPS ARE THIN STAND-INS, here only so the handovers into and out of
 * Invoice Hold can be asserted. They are not part of the listed node:
 *
 *   STAND-IN intake   (Booked After Hours): a call makes one job per enquiry
 *   STAND-IN quote    (Quote Out): one draft quote per job, read back by id
 *   STAND-IN chase    (Debtor Chasing): overdue invoices off the live ledger
 *
 * `officeSendsQuote` is a person in the office sending a drafted quote. It is
 * not a bot.
 */

export const NODE = "invoice-hold";

/** The world's event names, as the mesh vocabulary spells them. */
export const VOCAB = {
  call_received: "call.received",
  job_created: "job.created",
  quote_accepted: "quote.accepted",
  job_completed: "job.completed",
  invoice_overdue: "invoice.overdue",
};

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

export async function build(ports) {
  const ev = await ports.event();
  // Only a named event delivered unattended wakes a hop. A chat message does not.
  if (!ev || !UNATTENDED.has(ev.via) || !(ev.name in VOCAB)) return { outcome: "ignored" };
  if (ev.name === "call_received") return standInIntake(ports, ev);
  if (ev.name === "job_created") return standInQuote(ports, ev);
  if (ev.name === "job_completed") return invoiceHoldHop(ports, ev);
  if (ev.name === "invoice_overdue") return standInChase(ports, ev);
  return { outcome: "ignored" }; // quote_accepted: the invoice waits for the job to be complete
}

/** An open exception on the job stops this hop, and the hold names its owner. */
async function stopOnException(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `exception open: ${job.exception.reason}` });
  return true;
}

// ── Invoice Hold: the listed node ───────────────────────────────────────
export async function invoiceHoldHop(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return { outcome: "not_complete", job_id: ev.jobId };
  if (await stopOnException(ports, job, "invoice")) return { outcome: "held", job_id: job.id };

  // One invoice per job: the ledger is read before anything is written.
  const already = (await ports.readLedger()).find((r) => r.jobId === job.id);
  if (already) return { outcome: "kept", job_id: job.id, invoice_id: already.id };

  // The accepted quote, read by its own id, and only if it names this job.
  let quoteId = null;
  for (const link of job.quotes.filter((q) => q.status === "accepted")) {
    const q = await ports.readQuote(link.id);
    if (q && q.jobId === job.id && q.status === "accepted") quoteId = q.id;
  }

  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const back = w?.externalId ? await ports.readInvoice(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({
      stage: "invoice",
      ref: job.id,
      reason: "write_failed",
      owner: owners.invoice,
      detail: w?.externalId ? `invoice ${w.externalId} did not read back` : "the ledger returned no invoice id",
    });
    return { outcome: "write_failed", job_id: job.id };
  }

  // invoice.raised. Now the hold: released by the business's rule, or it waits for the person.
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "awaiting_release", owner: owners.invoice, detail: `draft ${back.id} held for release` });
    return { outcome: "held_for_release", job_id: job.id, invoice_id: back.id };
  }
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", job_id: job.id, invoice_id: back.id };
}

// ── STAND-INS for the neighbouring nodes. Not part of Invoice Hold. ──────

/** STAND-IN intake. The only hop allowed to look a caller up by number, to find an open job. */
async function standInIntake(ports, ev) {
  const owners = await ports.readOwners();
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length) {
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

/** STAND-IN quote. One draft per job, counted only when it reads back by id; sending is a person's. */
async function standInQuote(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await stopOnException(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length) return { outcome: "kept" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = w.externalId ? await ports.readQuote(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** A person in the office sends a drafted quote, after reading it back by id. Not a bot. */
export async function officeSendsQuote(ports, jobId, person) {
  const job = await ports.readJob(jobId);
  if (!job || job.exception) return [];
  const sent = [];
  for (const link of job.quotes) {
    const q = await ports.readQuote(link.id);
    if (!q || q.jobId !== job.id || q.status !== "draft") continue;
    await ports.release({ kind: "quote", id: q.id, person });
    await ports.send({ kind: "quote", id: q.id, trigger: null });
    sent.push(q.id);
  }
  return sent;
}

/** STAND-IN chase. Woken on a schedule; works only invoices the live ledger shows overdue. */
async function standInChase(ports, ev) {
  const overdue = (await ports.readLedger()).filter((r) => r.overdue);
  if (!overdue.length) return { outcome: "nothing_due" };
  const rule = await ports.readReleaseRule();
  const chased = [];
  for (const row of overdue) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await stopOnException(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

/**
 * Contract Billing across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS CONTRACT BILLING HERE. One hop: woken by `job.completed`, which is
 * the job system closing a maintenance contract's billing period on its
 * billing date, it reads that period by the id the event carried, stops on an
 * open exception, raises one draft invoice per period carrying the period's
 * id and the accepted maintenance quote's id, and counts the write only when
 * that id reads back from the ledger. It never releases or sends: the draft
 * waits in the ledger for the person the business named for invoices. (The
 * seam's release rule carries no threshold, and the Invoice Out standard lets
 * a rule release only under a threshold, so here every invoice is a person's.)
 * That hop is `contractBillingHop` below, the same loop as ../build/build.mjs,
 * which proves the lines, the schedule of rates and the parking.
 *
 * The Cash Seam checks are about handovers, so the run needs hops either side.
 * THESE ARE THIN STAND-INS, NOT PART OF THE LISTED NODE:
 *   STAND-IN intakeStandIn   opens the job for a maintenance enquiry
 *   STAND-IN quoteStandIn    drafts the maintenance agreement quote on that job
 *   STAND-IN chaseStandIn    the debtor chase that reads overdue invoices
 * And two acts that belong to people, not bots, which the runner plays:
 *   personSendsQuote         the office sends the drafted quote
 *   personReleasesInvoice    the accounts officer releases the draft in the ledger
 */

export const NODE = "contract-billing";

/** The seam world's event names, as mesh vocabulary events. */
export const EVENTS = {
  call_received: "call.received",
  job_created: "job.created",
  quote_accepted: "quote.accepted",
  job_completed: "job.completed",
  invoice_overdue: "invoice.overdue",
};
const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** One run: the named event that woke it, and nothing else. A chat message wakes nothing. */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via) || !(ev.name in EVENTS)) return { outcome: "ignored" };
  if (ev.name === "job_completed") return contractBillingHop(ports, ev);
  if (ev.name === "call_received") return intakeStandIn(ports, ev);
  if (ev.name === "job_created") return quoteStandIn(ports, ev);
  if (ev.name === "invoice_overdue") return chaseStandIn(ports, ev);
  return { outcome: "ignored" }; // quote_accepted: billing waits for the period to close
}

/** An open exception on the record stops the hop; the hold names its owner. */
async function stopsOnException(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open exception: ${job.exception.reason}` });
  return true;
}

// ── Contract Billing: the listed node ─────────────────────────────────────────
export async function contractBillingHop(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const period = await ports.readJob(ev.jobId); // by id, never by client name
  if (!period || period.status !== "complete") return { outcome: "ignored" };
  if (await stopsOnException(ports, period, "invoice")) return { outcome: "held", job_id: period.id };

  // One invoice per period: the ledger is read first and an existing one is kept.
  if ((await ports.readLedger()).some((r) => r.jobId === period.id)) return { outcome: "kept", job_id: period.id };

  // The accepted maintenance quote, read back by its own id and checked to be this job's.
  let quoteId = null;
  for (const q of period.quotes.filter((x) => x.status === "accepted")) {
    const back = await ports.readQuote(q.id);
    if (back && back.jobId === period.id) quoteId = back.id;
  }

  const w = await ports.writeInvoice({ jobId: period.id, quoteId, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "invoice", ref: period.id, reason: "write_failed", owner: owners.invoice, detail: "the ledger returned no invoice id" });
    return { outcome: "write_failed", job_id: period.id };
  }
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== period.id) {
    await ports.escalate({ stage: "invoice", ref: period.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId} did not read back on ${period.id}` });
    return { outcome: "write_failed", job_id: period.id };
  }
  // Drafted and held. The release is the accounts officer's, in the ledger.
  return { outcome: "drafted", job_id: period.id, invoice_id: back.id };
}

// ── People's acts, played by the runner. Not bots. ───────────────────────────
/** The accounts officer releases the period's draft: read back by id, released by name, sent. */
export async function personReleasesInvoice(ports, jobId, person) {
  const job = await ports.readJob(jobId);
  if (!job || job.exception) return [];
  const sent = [];
  for (const row of (await ports.readLedger()).filter((r) => r.jobId === jobId && r.status === "draft")) {
    const back = await ports.readInvoice(row.id);
    if (!back || back.jobId !== jobId) continue;
    await ports.release({ kind: "invoice", id: back.id, person });
    await ports.send({ kind: "invoice", id: back.id, trigger: null });
    sent.push(back.id);
  }
  return sent;
}

/** The office sends a drafted quote: read back by id, released by name, sent. */
export async function personSendsQuote(ports, jobId, person) {
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

// ── STAND-INS for the hops either side. Not part of the listed node. ─────────
/** STAND-IN intake: the only hop that may look up by phone, to find an open job. */
async function intakeStandIn(ports, ev) {
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

/** STAND-IN quote: drafts the maintenance agreement quote on the job by its id. */
async function quoteStandIn(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await stopsOnException(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length > 0) return { outcome: "kept" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote returned no id" });
    return { outcome: "write_failed" };
  }
  const back = await ports.readQuote(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** STAND-IN chase: reads overdue invoices off the live ledger and chases by invoice id. */
async function chaseStandIn(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const chased = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await stopsOnException(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

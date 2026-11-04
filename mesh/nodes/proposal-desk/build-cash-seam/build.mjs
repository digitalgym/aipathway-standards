/**
 * Proposal Desk across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS PROPOSAL DESK HERE. One hop: `proposalHop`, woken by `job.created`
 * for a proposal job the practice opened for a prospective client. It reads
 * the job by the id on the event, stops on an open exception, keeps an
 * existing proposal rather than making a second, drafts against that job id,
 * and counts the draft only once it reads back by its own id on that job. It
 * never sends. The fee pricing itself (service price list only, park what is
 * off it) is proved in ../build against the Quote Out world; this world proves
 * the handover.
 *
 * WHAT IS NOT PROPOSAL DESK. The seam checks are about handovers, so the run
 * needs a hop either side. These are THIN STAND-INS, labelled as such, written
 * to the seam's rules so the handover into and out of Proposal Desk can be
 * asserted. They are not part of the listed node:
 *
 *   standInIntake    the enquiry hop that opens the prospect's proposal job
 *   standInInvoice   an Invoice Out node, woken when the engagement's first piece of work is complete
 *   standInChase     a Debtor Chasing node, woken by a schedule
 *
 * `partnerSendsProposal` is the practice's own act: the partner reads the
 * draft back, agrees the scope and sends it with the engagement letter.
 */

export const NODE = "proposal-desk";

/** The world's event names, mapped to the mesh vocabulary. */
export const VOCAB = {
  call_received: "email.received", // the enquiry door; this world calls every enquiry a call
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
  if (ev.name === "job_created") return proposalHop(ports, ev);
  if (ev.name === "call_received") return standInIntake(ports, ev);
  if (ev.name === "job_completed") return standInInvoice(ports, ev);
  if (ev.name === "invoice_overdue") return standInChase(ports, ev);
  return { outcome: "ignored" };
}

/** An open exception on the record: record a hold naming its owner, and stop. */
async function heldByException(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open exception: ${job.exception.reason}` });
  return true;
}

// ── Proposal Desk: the listed node ───────────────────────────────────────
export async function proposalHop(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.id !== ev.jobId) return { outcome: "ignored" };
  if (await heldByException(ports, job, "quote")) return { outcome: "held", job_id: job.id };

  if (job.quotes.length > 0) {
    const kept = job.quotes[0].id;
    return { outcome: "kept", job_id: job.id, quote_id: kept, duplicate_of: kept };
  }

  const owners = await ports.readOwners();
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote came back with no external id" });
    return { outcome: "write_failed", job_id: job.id };
  }
  const back = await ports.readQuote(w.externalId);
  if (!back || back.id !== w.externalId || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `proposal ${w.externalId} did not read back on ${job.id}` });
    return { outcome: "write_failed", job_id: job.id };
  }
  return { outcome: "drafted", job_id: job.id, quote_id: back.id, state: back.status };
}

/** The partner sends the draft proposal from the practice system. Never the bot. */
export async function partnerSendsProposal(ports, jobId, partner) {
  const job = await ports.readJob(jobId);
  if (!job || job.exception) return [];
  const sent = [];
  for (const { id } of job.quotes) {
    const q = await ports.readQuote(id);
    if (!q || q.jobId !== job.id || q.status !== "draft") continue;
    await ports.release({ kind: "quote", id: q.id, person: partner });
    await ports.send({ kind: "quote", id: q.id, trigger: null });
    sent.push(q.id);
  }
  return sent;
}

// ── THIN STAND-INS for the hops either side. Not part of the listed node. ──

/** Stand-in intake: the only hop allowed to look up by contact, to find an open proposal job. */
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
    await ports.escalate({ stage: "job", ref: w.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** Stand-in Invoice Out: woken by job.completed, raises against the job and its accepted proposal. */
async function standInInvoice(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldByException(ports, job, "invoice")) return { outcome: "held", job_id: job.id };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "kept", job_id: job.id };

  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id) quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "write_invoice came back with no external id" });
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
async function standInChase(ports, ev) {
  const rows = (await ports.readLedger()).filter((r) => r.overdue);
  const rule = rows.length ? await ports.readReleaseRule() : null;
  const chased = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await heldByException(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

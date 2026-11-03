/**
 * Promise Watch across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS PROMISE WATCH HERE, AND WHAT IS NOT. Promise Watch is the last hop:
 * woken by `invoice_overdue` (a schedule), it reads the live ledger, takes each
 * overdue invoice by its id, reads that invoice back by id, reads the job it
 * was raised on by the job id the ledger carries, stops on an open exception
 * and names that exception's owner, and otherwise drafts a chase that waits for
 * the person the business named for chasing. It never sends on its own. That
 * hop is `chaseHop` below, and it follows the same loop as ../build/build.mjs
 * (the Debtor Chasing build).
 *
 * `approveChaseByPerson` is the office's own act, not a bot's: the named
 * person who owns chasing reads the invoice back, releases the draft under
 * their own name, and it goes out carrying the event that woke the draft.
 *
 * The Cash Seam checks are about the handovers, so the run needs the hops
 * before it. These are THIN STAND-INS for the neighbouring nodes, written to
 * the seam's rules so the handover into Promise Watch can be asserted. They are
 * not part of the listed node:
 *
 *   standInIntake    Booked After Hours: call in, one job per enquiry
 *   standInQuote     Quote Out: one draft quote per job, read back by id, sent by a person
 *   standInInvoice   Invoice Out: one invoice per completed job, read back by id
 *
 * `releaseQuoteByPerson` is likewise the office's act: the person who owns
 * quotes reads the draft back and sends it.
 */

export const NODE = "promise-watch";

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);
const HOPS = new Set(["call_received", "job_created", "quote_accepted", "job_completed", "invoice_overdue"]);

/** One run: whatever the event that woke it says, and nothing else. */
export async function build(ports) {
  const ev = await ports.event();
  // A chat message is not a trigger. Nothing wakes a hop but a named event.
  if (!ev || !UNATTENDED.has(ev.via) || !HOPS.has(ev.name)) return { outcome: "ignored" };
  switch (ev.name) {
    case "call_received":
      return standInIntake(ports, ev);
    case "job_created":
      return standInQuote(ports, ev);
    case "job_completed":
      return standInInvoice(ports, ev);
    case "invoice_overdue":
      return chaseHop(ports, ev);
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

// ── Promise Watch ─────────────────────────────────────────────────────────
/** Woken by the overdue schedule. Reads the ledger, never searches by name or phone. */
export async function chaseHop(ports, ev) {
  const owners = await ports.readOwners();
  const overdue = (await ports.readLedger()).filter((r) => r.overdue);
  const drafted = [];
  for (const row of overdue) {
    // A write or a read counts by id: read the invoice back by the id the ledger gave.
    const inv = await ports.readInvoice(row.id);
    if (!inv || !inv.overdue) continue; // paid, voided or gone since the list was read
    const job = inv.jobId ? await ports.readJob(inv.jobId) : null;
    if (!job) {
      await ports.escalate({ stage: "chase", ref: inv.id, reason: "no_job_on_invoice", owner: owners.chase, detail: `invoice ${inv.id} carries no job id the job system holds` });
      continue;
    }
    if (await heldBy(ports, job, "chase")) continue;
    // promise.recorded / the chase draft: it waits for the person named for chasing.
    await ports.escalate({ stage: "chase", ref: inv.id, reason: "chase_drafted_awaiting_approval", owner: owners.chase, detail: `chase drafted for ${inv.id} on ${job.id}, woken by ${ev.id}` });
    drafted.push({ invoiceId: inv.id, trigger: ev.id });
  }
  return { outcome: "drafted", drafted };
}

/** The person who owns chasing approves a draft. The office's act, not a bot's. */
export async function approveChaseByPerson(ports, draft, person) {
  const inv = await ports.readInvoice(draft.invoiceId);
  if (!inv || !inv.overdue) return false; // paid since the draft: nothing goes out
  const job = inv.jobId ? await ports.readJob(inv.jobId) : null;
  if (!job || job.exception) return false;
  await ports.release({ kind: "chase", id: inv.id, person });
  await ports.send({ kind: "chase", id: inv.id, trigger: draft.trigger });
  return true;
}

// ── Thin stand-ins for the neighbouring nodes. Not part of Promise Watch. ──
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
  if (job.quotes.length > 0) return { outcome: "kept" };
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

/** STAND-IN for Invoice Out. One invoice per completed job, keyed to the job and accepted quote ids. */
async function standInInvoice(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return { outcome: "ignored" };
  if (await heldBy(ports, job, "invoice")) return { outcome: "held" };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "kept" };
  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id && q.status === "accepted") quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const back = w?.externalId ? await ports.readInvoice(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w?.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "awaiting_release", owner: owners.invoice, detail: `draft ${back.id} waits for a release` });
    return { outcome: "raised", invoice_id: back.id };
  }
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

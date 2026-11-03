/**
 * Chase List across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS CHASE LIST HERE, AND WHAT IS NOT. Chase List is the last hop: woken
 * by the overdue schedule, it reads the overdue invoices off the live ledger by
 * id, stops on any open exception on the job, and drafts one reminder per
 * invoice for the named person who owns chasing. That hop is `chaseHop` below,
 * and it keeps the same rules as ../build/build.mjs (the Debtor Chasing build):
 * read by id, no send, a draft handed to a named person.
 *
 * The Cash Seam checks are about the handovers, so the run needs the hops
 * before it. THESE ARE THIN STAND-INS, NOT PART OF THE LISTED NODE:
 *
 *   standInIntake   for Booked After Hours: the one hop allowed to look up by phone
 *   standInQuote    for Quote Out: drafts the quote on the job id, reads it back
 *   standInInvoice  for Invoice Out: raises the invoice on the job and quote ids
 *
 * They are written only far enough to the seam's rules that the handover into
 * Chase List can be asserted.
 *
 * Two acts are the office's, not any bot's, and the scenarios play them:
 * `personSendsQuote` (Quote Out keeps sending with a person) and
 * `personSendsReminder`, where the named person who owns chasing reads the
 * invoice back off the ledger and sends the reminder Chase List drafted.
 */

export const NODE = "chase-list";

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);
const HOPS = new Set(["call_received", "job_created", "job_completed", "invoice_overdue"]);

/** One run, for whatever event woke it, and nothing else. */
export async function build(ports) {
  const ev = await ports.event();
  // A chat message is not a trigger. Only a named, unattended event wakes a hop.
  if (!ev || !UNATTENDED.has(ev.via) || !HOPS.has(ev.name)) return { outcome: "ignored" };
  if (ev.name === "call_received") return standInIntake(ports, ev);
  if (ev.name === "job_created") return standInQuote(ports, ev);
  if (ev.name === "job_completed") return standInInvoice(ports, ev);
  return chaseHop(ports, ev);
}

/** An open exception with an owner on the job stops the hop, and the hold names that owner. */
async function stoppedBy(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open on the job: ${job.exception.reason}` });
  return true;
}

// ── Chase List ────────────────────────────────────────────────────────────
/**
 * Woken by the overdue schedule. Reads the ledger, takes each overdue invoice
 * by its id, reads its job by the job id the ledger carries, and drafts the
 * reminder. Nothing is sent: the draft goes to the owner the business set for
 * chasing, carrying the invoice id and the event that woke this hop.
 */
export async function chaseHop(ports, ev) {
  const owners = await ports.readOwners();
  const rows = (await ports.readLedger()).filter((r) => r.overdue && r.status === "sent");
  const drafts = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await stoppedBy(ports, job, "chase")) continue;
    const text = `Invoice ${row.id} was due ${String(row.dueAt).slice(0, 10)} and is now past due. What date can we expect payment?`;
    await ports.escalate({ stage: "chase", ref: row.id, reason: "reminder_ready_for_release", owner: owners.chase, detail: text });
    drafts.push({ invoiceId: row.id, trigger: ev.id, owner: owners.chase, text });
  }
  return { outcome: "drafted", drafts };
}

/**
 * The office's act: the named person who owns chasing re-reads the invoice
 * off the ledger, checks the job is still clear, releases the draft in their
 * own name and sends it. Chase List never calls this.
 */
export async function personSendsReminder(ports, draft, person) {
  const back = await ports.readInvoice(draft.invoiceId);
  if (!back || back.id !== draft.invoiceId || !back.overdue) return false;
  const job = back.jobId ? await ports.readJob(back.jobId) : null;
  if (job?.exception) return false;
  await ports.release({ kind: "chase", id: back.id, person });
  await ports.send({ kind: "chase", id: back.id, trigger: draft.trigger });
  return true;
}

/** The office's act for quotes: the person who owns quotes sends the draft. */
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

// ── Thin stand-ins for the hops before Chase List. Not part of the node. ──
/** Stand-in for Booked After Hours. Looks up an open job by phone, at intake only. */
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

/** Stand-in for Quote Out. Drafts on the job id the event carried; a write counts only if it reads back. */
async function standInQuote(ports, ev) {
  const owners = await ports.readOwners();
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return { outcome: "ignored" };
  if (await stoppedBy(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length > 0) return { outcome: "kept" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = w.externalId ? await ports.readQuote(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** Stand-in for Invoice Out. Raises on the job id and the accepted quote's id, then releases by the business's rule. */
async function standInInvoice(ports, ev) {
  const owners = await ports.readOwners();
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return { outcome: "ignored" };
  if (await stoppedBy(ports, job, "invoice")) return { outcome: "held" };
  if ((await ports.readLedger()).some((r) => r.jobId === job.id)) return { outcome: "kept" };
  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id) quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const back = w.externalId ? await ports.readInvoice(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  const rule = await ports.readReleaseRule();
  if (!rule) return { outcome: "raised" };
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

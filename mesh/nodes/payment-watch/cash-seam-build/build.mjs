/**
 * Payment Watch across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * THE NODE IS ONE FUNCTION HERE: `watchHop`. Woken by the overdue schedule, it
 * lists overdue invoices off the live ledger, then re-reads each one by its id
 * just before drafting (the payment watch: anything no longer overdue is not
 * chased), reads the job by the job id the ledger carries, stops on an open
 * exception, and drafts one calm reminder for the named person who owns
 * chasing. It never sends. Same rules as ../build/build.mjs.
 *
 * THE OTHER HOPS ARE THIN, LABELLED STAND-INS, NOT PART OF THE LISTING. The
 * Cash Seam checks are about handovers, so the run needs the hops either side:
 *
 *   STAND-IN intake    for Booked After Hours: the only hop that may look up by phone
 *   STAND-IN quote     for Quote Out: a draft on the job id, read back
 *   STAND-IN invoice   for Invoice Out: raised on the job and quote ids, read back,
 *                      released by the business's rule
 *   OFFICE   personSendsQuote, personSendsReminder: the people, played by the
 *                      scenarios. The person who owns chasing re-reads the invoice
 *                      and sends the reminder Payment Watch drafted.
 */

export const NODE = "payment-watch";

const WAKES = new Set(["webhook", "schedule", "poll"]);

/** One run per delivered event. A chat message wakes nothing. */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !WAKES.has(ev.via)) return { outcome: "ignored" };
  switch (ev.name) {
    case "call_received":
      return standInIntake(ports, ev);
    case "job_created":
      return standInQuote(ports, ev);
    case "job_completed":
      return standInInvoice(ports, ev);
    case "invoice_overdue":
      return watchHop(ports, ev);
    default:
      return { outcome: "ignored" };
  }
}

/** An open exception on the job stops the hop; the hold names that exception's owner. */
async function heldByException(ports, job, stage) {
  if (!job || !job.exception) return false;
  await ports.escalate({
    stage,
    ref: job.id,
    reason: "held_open_exception",
    owner: job.exception.owner,
    detail: `exception open on the job: ${job.exception.reason}`,
  });
  return true;
}

// ── Payment Watch ─────────────────────────────────────────────────────────

export async function watchHop(ports, ev) {
  const owners = await ports.readOwners();
  const listed = (await ports.readLedger()).filter((r) => r.overdue && r.status === "sent");
  const drafts = [];
  for (const listedRow of listed) {
    // The payment watch: re-read by id right before the draft.
    const row = await ports.readInvoice(listedRow.id);
    if (!row || row.id !== listedRow.id || row.status !== "sent" || !row.overdue) continue;
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await heldByException(ports, job, "chase")) continue;
    const text =
      `A quick note on invoice ${row.id}: it was due ${String(row.dueAt).slice(0, 10)} and is still open. ` +
      "When can I expect payment? If something on it is not right, tell me and I will look at it first.";
    await ports.escalate({ stage: "chase", ref: row.id, reason: "reminder_ready_for_release", owner: owners.chase, detail: text });
    drafts.push({ invoiceId: row.id, trigger: ev.id, text });
  }
  return { outcome: "drafted", drafts };
}

// ── The office: people, not bots ──────────────────────────────────────────

/** The person who owns chasing reads the invoice back, checks the job, says yes and sends. */
export async function personSendsReminder(ports, draft, person) {
  const back = await ports.readInvoice(draft.invoiceId);
  if (!back || back.id !== draft.invoiceId || !back.overdue) return false;
  const job = back.jobId ? await ports.readJob(back.jobId) : null;
  if (job && job.exception) return false;
  await ports.release({ kind: "chase", id: back.id, person });
  await ports.send({ kind: "chase", id: back.id, trigger: draft.trigger });
  return true;
}

/** The person who owns quotes sends each draft quote on the job, after reading it back. */
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

// ── STAND-INS for the hops before Payment Watch. Not part of the node. ────

/** STAND-IN intake. Attaches a repeat enquiry to the open job on that number. */
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
    await ports.escalate({ stage: "job", ref: null, reason: "write_failed", owner: owners.job, detail: "the job write came back with no id" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** STAND-IN quote. A draft on the job id; it counts only if it reads back on that job. */
async function standInQuote(ports, ev) {
  const owners = await ports.readOwners();
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return { outcome: "ignored" };
  if (await heldByException(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length > 0) return { outcome: "kept" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = w.externalId ? await ports.readQuote(w.externalId) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId ?? "(no id)"} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** STAND-IN invoice. Raised on the job id and the accepted quote's id, read back, then released by rule. */
async function standInInvoice(ports, ev) {
  const owners = await ports.readOwners();
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return { outcome: "ignored" };
  if (await heldByException(ports, job, "invoice")) return { outcome: "held" };
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

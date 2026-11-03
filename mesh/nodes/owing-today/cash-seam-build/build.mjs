/**
 * Owing Today on the Cash Seam, built to AIP-BS-CASH-SEAM 2026-10-03.
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * ONLY THE CHASE HOP IS OWING TODAY. The Cash Seam is judged across the whole
 * chain (enquiry, job, quote, invoice, chase), so the hops before the chase are
 * here too, as THIN STAND-INS: the least a job intake, a quote drafter and an
 * invoice raiser can do while keeping the seam (an id from the system of record,
 * a named event, a read-back, an owner on every exception). They are not part
 * of the node, they are not listed, and they would be replaced by whatever the
 * business already runs for those hops (ServiceM8 and Xero, or another node).
 *
 *   STAND-IN  call_received  -> one job per enquiry: search open jobs by phone
 *                               (the one hop allowed to), attach or write
 *   STAND-IN  job_created    -> draft a quote on the job, read it back by id
 *   STAND-IN  quote_accepted -> read the quote by id; nothing to write
 *   STAND-IN  job_completed  -> raise the invoice against the job and its
 *                               accepted quote, read it back, release it on the
 *                               business's own send rule
 *   OWING TODAY invoice_overdue (schedule) -> read the live ledger, read each
 *                               overdue invoice and its job by id, stop on an
 *                               open exception, and put a reminder draft in
 *                               front of the person who owns chasing. It never
 *                               sends: `ownerSendsReminder` below is that person.
 *
 * A chat message wakes nothing. Every write names the event that woke it.
 */

/** Hand something to the owner the business named for that stage. Never an unnamed owner. */
function raise(ports, owners, stage, ref, reason, detail) {
  ports.escalate({ stage, ref, reason, owner: owners[stage], ...(detail ? { detail } : {}) });
}

// ── STAND-IN: intake ───────────────────────────────────────────────────────
async function intake(ports, ev, owners) {
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return;
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName, phone: ev.phone, trigger: ev.id });
  if (!w.externalId) raise(ports, owners, "job", null, "write_failed", `enquiry ${ev.enquiryId}: the job system returned no id`);
}

// ── STAND-IN: quote ────────────────────────────────────────────────────────
async function quote(ports, ev, owners) {
  const job = await ports.readJob(ev.jobId);
  if (!job) return;
  if (job.exception) return raise(ports, owners, "quote", job.id, "held_open_exception", `open exception owned by ${job.exception.owner}`);
  if (job.quotes.length > 0) return; // already drafted: the step is safe to repeat
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w.externalId) return raise(ports, owners, "quote", job.id, "write_failed", "the job system returned no quote id");
  const back = await ports.readQuote(w.externalId);
  if (!back || back.jobId !== job.id) {
    raise(ports, owners, "quote", job.id, "write_not_read_back", `quote ${w.externalId} was confirmed but does not read back`);
  }
}

// ── STAND-IN: invoice ──────────────────────────────────────────────────────
async function invoice(ports, ev, owners) {
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return;
  if (job.exception) {
    // The hold names the exception's own owner, not ours.
    ports.escalate({ stage: "invoice", ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: job.exception.reason });
    return;
  }
  const ledger = await ports.readLedger();
  if (ledger.some((r) => r.jobId === job.id)) return; // already invoiced
  const accepted = job.quotes.find((q) => q.status === "accepted");
  const w = await ports.writeInvoice({ jobId: job.id, quoteId: accepted?.id ?? null, trigger: ev.id });
  if (!w.externalId) return raise(ports, owners, "invoice", job.id, "write_failed", "the ledger returned no invoice id");
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) return raise(ports, owners, "invoice", job.id, "write_not_read_back", `invoice ${w.externalId} does not read back`);
  const rule = await ports.readReleaseRule();
  if (!rule) return raise(ports, owners, "invoice", job.id, "invoice_ready_for_release", `invoice ${back.id} waits for a person`);
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
}

// ── OWING TODAY: the chase hop ─────────────────────────────────────────────
async function chase(ports, ev, owners) {
  const drafts = [];
  const ledger = await ports.readLedger();
  for (const row of ledger.filter((r) => r.overdue)) {
    const inv = await ports.readInvoice(row.id);
    if (!inv || !inv.overdue || !inv.jobId) continue;
    const job = await ports.readJob(inv.jobId);
    if (!job) continue;
    if (job.exception) {
      // An open exception stops the chain here. The hold names whoever owns it.
      ports.escalate({ stage: "chase", ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `${inv.id}: ${job.exception.reason}` });
      continue;
    }
    const text = `Hi ${job.customerName}, invoice ${inv.id} for job ${job.id} is past its due date of ${inv.dueAt?.slice(0, 10)}. When can we expect payment?`;
    raise(ports, owners, "chase", inv.id, "debtor.queue_ready", text);
    drafts.push({ invoiceId: inv.id, jobId: job.id, text, trigger: ev.id });
  }
  return { drafts };
}

/**
 * The person who owns chasing sends a reminder Owing Today drafted. Runner
 * side, not the node: it stands for that person reading the invoice back,
 * releasing the draft in their own name and sending it from their own inbox.
 */
export async function ownerSendsReminder(ports, draft, person) {
  const inv = await ports.readInvoice(draft.invoiceId);
  if (!inv || !inv.overdue) return false;
  await ports.release({ kind: "chase", id: inv.id, person });
  await ports.send({ kind: "chase", id: inv.id, trigger: draft.trigger });
  return true;
}

/** The person who owns quotes sends each draft quote on a job. Runner side, like the above. */
export async function ownerSendsQuote(ports, jobId, person) {
  const job = await ports.readJob(jobId);
  const sent = [];
  for (const q of job?.quotes ?? []) {
    if (q.status !== "draft") continue;
    const back = await ports.readQuote(q.id);
    if (!back || back.jobId !== jobId) continue;
    await ports.release({ kind: "quote", id: back.id, person });
    await ports.send({ kind: "quote", id: back.id, trigger: back.trigger });
    sent.push(back.id);
  }
  return sent;
}

/** @param {import("@aipathway/conformance").CashSeamPorts} ports */
export async function build(ports) {
  const ev = ports.event();
  if (!ev || ev.via === "chat") return undefined; // nothing woke it, or only a chat did
  const owners = await ports.readOwners();
  switch (ev.name) {
    case "call_received":
      return intake(ports, ev, owners);
    case "job_created":
      return quote(ports, ev, owners);
    case "quote_accepted": {
      await ports.readQuote(ev.quoteId);
      return undefined;
    }
    case "job_completed":
      return invoice(ports, ev, owners);
    case "invoice_overdue":
      return chase(ports, ev, owners);
    default:
      return undefined;
  }
}

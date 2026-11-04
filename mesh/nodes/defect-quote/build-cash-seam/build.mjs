/**
 * Defect Quote across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * WHAT IS DEFECT QUOTE HERE. One hop: `defectQuoteHop`, woken by `job.created`
 * for the job a fire or life-safety defect was logged on (an inspection job,
 * or a fault job the intake hop logged from a panel fault alert). It reads the job by
 * the id on the event, stops on an open exception, keeps an existing quote
 * rather than making a second, drafts against that job id, and counts the
 * draft only once it reads back by its own id on that job. It never sends.
 * The pricing itself (price list only, park what is off it) is proved in
 * ../build against the Quote Out world; this world proves the handover.
 *
 * WHAT IS NOT DEFECT QUOTE. The seam checks are about handovers, so the run
 * needs a hop either side. These are THIN STAND-INS, labelled as such, written
 * to the seam's rules so the handover into and out of Defect Quote can be
 * asserted. They are not part of the listed node:
 *
 *   standInIntake    the intake node that logs a panel fault alert as a job
 *   standInInvoice   an Invoice Out node, woken by job.completed
 *   standInChase     a Debtor Chasing node, woken by a schedule
 *
 * `personReleasesQuote` is the office's own act: the named person who owns
 * quotes reads the draft back and sends it from the job system.
 */

export const NODE = "defect-quote";

/** The world's event names, mapped to the mesh vocabulary. */
export const VOCAB = {
  call_received: "email.received", // the alert door; this world calls every incoming report a call
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
  if (ev.name === "job_created") return defectQuoteHop(ports, ev);
  if (ev.name === "call_received") return standInIntake(ports, ev);
  if (ev.name === "job_completed") return standInInvoice(ports, ev);
  if (ev.name === "invoice_overdue") return standInChase(ports, ev);
  return { outcome: "ignored" };
}

/** If the job carries an open exception, record a hold naming its owner and stop. */
async function stopsOnException(ports, job, stage) {
  if (!job?.exception) return false;
  await ports.escalate({ stage, ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `open exception: ${job.exception.reason}` });
  return true;
}

// ── Defect Quote: the listed node ─────────────────────────────────────────
export async function defectQuoteHop(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.id !== ev.jobId) return { outcome: "ignored" };
  if (await stopsOnException(ports, job, "quote")) return { outcome: "held", job_id: job.id };

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
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId} did not read back on ${job.id}` });
    return { outcome: "write_failed", job_id: job.id };
  }
  return { outcome: "drafted", job_id: job.id, quote_id: back.id, state: back.status };
}

/** The person who owns quotes sends the draft from the job system. Never the bot. */
export async function personReleasesQuote(ports, jobId, person) {
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

// ── THIN STAND-INS for the hops either side. Not part of the listed node. ──

/** Stand-in intake: the only hop allowed to look up by contact, to find an open job. */
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

/** Stand-in Invoice Out: woken by job.completed, raises against the job and its accepted quote. */
async function standInInvoice(ports, ev) {
  if (!ev.jobId) return { outcome: "ignored" };
  const owners = await ports.readOwners();
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await stopsOnException(ports, job, "invoice")) return { outcome: "held", job_id: job.id };
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
    if (await stopsOnException(ports, job, "chase")) continue;
    if (!rule) continue;
    await ports.release({ kind: "chase", id: row.id, rule: rule.name });
    await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    chased.push(row.id);
  }
  return { outcome: "chased", invoice_ids: chased };
}

/**
 * Nudge Desk across the Cash Seam, AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard (CC BY 4.0).
 *
 * WHAT IS NUDGE DESK HERE, AND WHAT IS NOT. Nudge Desk is the last hop: woken
 * by its weekday schedule (`invoice_overdue` by schedule), it reads the live
 * ledger, takes each overdue invoice by the id the ledger returned, reads the
 * job that invoice carries by its id and stops on an open exception, re-reads
 * the invoice by id just before the reminder, and sends only under a release
 * the business named. That hop is `chaseHop` below, and it follows the same
 * loop as ../build/build.mjs (the Debtor Chasing build). The ranking, buckets
 * and gate are that build's job and are proved there.
 *
 * STAND-INS, CLEARLY LABELLED. The Cash Seam checks assert the id surviving
 * every handover, so the run needs the hops before this one. `intakeStandIn`,
 * `quoteStandIn` and `invoiceStandIn` are the thinnest glue the seam allows
 * for the neighbouring nodes (Booked After Hours, Quote Out, Invoice Out):
 * read by id, refuse past an open exception, a write counts only when it reads
 * back, and a send waits for a named release. They are not part of the listed
 * node, and nothing in them prices, words or dials anything.
 *
 * The build runs once per delivered event and keeps nothing between runs.
 */

export const NODE = "nudge-desk";

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

export async function build(ports) {
  const ev = await ports.event();
  // A chat message is not a trigger. Nothing wakes a hop but a named event.
  if (!ev || !UNATTENDED.has(ev.via)) return { outcome: "ignored" };
  switch (ev.name) {
    case "call_received":
      return intakeStandIn(ports, ev);
    case "job_created":
      return quoteStandIn(ports, ev);
    case "job_completed":
      return invoiceStandIn(ports, ev);
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

// ── Nudge Desk ────────────────────────────────────────────────────────────
/** Woken by the schedule. Every id comes off the live ledger; nothing matches on a name. */
export async function chaseHop(ports, ev) {
  const owners = await ports.readOwners();
  const rows = ((await ports.readLedger()) ?? []).filter((r) => r.overdue);
  const out = [];
  for (const row of rows) {
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (await heldBy(ports, job, "chase")) continue;
    // Stop on payment off the ledger, not a nightly export: re-read this invoice by its id.
    const live = await ports.readInvoice(row.id);
    if (!live || live.id !== row.id || live.status !== "sent" || !live.overdue) continue;
    const rule = await ports.readReleaseRule();
    if (!rule?.name) {
      await ports.escalate({ stage: "chase", ref: live.jobId, reason: "awaiting_release", owner: owners.chase, detail: `reminder for ${live.id} drafted, waits for a person` });
      continue;
    }
    await ports.release({ kind: "chase", id: live.id, rule: rule.name });
    await ports.send({ kind: "chase", id: live.id, trigger: ev.id });
    out.push(live.id);
  }
  return { outcome: "chased", invoice_ids: out };
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

// ── Stand-ins for the hops before Nudge Desk. Not part of the listed node. ──
/** Booked After Hours stand-in. The one hop allowed to look up by phone, to find an open job. */
async function intakeStandIn(ports, ev) {
  const owners = await ports.readOwners();
  const open = (await ports.searchJobs({ phone: ev.phone, status: "open" })) ?? [];
  if (open.length > 0) {
    if (open[0].exception) return { outcome: "held" };
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return { outcome: "attached", job_id: open[0].id };
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = w?.externalId ? await ports.readJob(w.externalId) : null;
  if (!back) {
    await ports.escalate({ stage: "job", ref: w?.externalId ?? null, reason: "write_failed", owner: owners.job, detail: "job write did not read back" });
    return { outcome: "write_failed" };
  }
  return { outcome: "written", job_id: back.id };
}

/** Quote Out stand-in. Woken by job.created; drafts against the job id and leaves sending to a person. */
async function quoteStandIn(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job) return { outcome: "ignored" };
  if (await heldBy(ports, job, "quote")) return { outcome: "held" };
  if (job.quotes.length > 0) return { outcome: "kept" };
  const w = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: "draft_quote returned no external id" });
    return { outcome: "write_failed" };
  }
  const back = await ports.readQuote(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: `quote ${w.externalId} did not read back` });
    return { outcome: "write_failed" };
  }
  return { outcome: "drafted", quote_id: back.id };
}

/** Invoice Out stand-in. Woken by job.completed; raises from the accepted quote and the job id. */
async function invoiceStandIn(ports, ev) {
  const owners = await ports.readOwners();
  if (!ev.jobId) return { outcome: "ignored" };
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete") return { outcome: "ignored" };
  if (await heldBy(ports, job, "invoice")) return { outcome: "held" };
  if (((await ports.readLedger()) ?? []).some((r) => r.jobId === job.id)) return { outcome: "kept" };
  let quoteId = null;
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (accepted) {
    const q = await ports.readQuote(accepted.id);
    if (q && q.jobId === job.id) quoteId = q.id;
  }
  const w = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  if (!w?.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "write_invoice returned no external id" });
    return { outcome: "write_failed" };
  }
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: `invoice ${w.externalId} did not read back` });
    return { outcome: "write_failed" };
  }
  const rule = await ports.readReleaseRule();
  if (!rule?.name) return { outcome: "raised" };
  await ports.release({ kind: "invoice", id: back.id, rule: rule.name });
  await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
  return { outcome: "sent", invoice_id: back.id };
}

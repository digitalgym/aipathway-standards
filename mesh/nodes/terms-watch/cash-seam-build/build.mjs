/**
 * Terms Watch on the Cash Seam (AIP-BS-CASH-SEAM).
 *
 * The runner delivers one named event per run. Terms Watch's own hop is the
 * last one: `invoice_overdue`, woken by the ledger schedule. The three hops
 * before it are THIN STAND-INS, labelled as such, so the seam can be seen end
 * to end. They are not Terms Watch and are not offered as anything else:
 *
 *   call_received   STAND-IN intake: one open job per caller, by phone (the
 *                   only hop allowed to match on a phone number).
 *   job_created     STAND-IN quote hop: a quote drafted against the job id.
 *   job_completed   STAND-IN invoice hop: an invoice raised against the job id
 *                   and the accepted quote's id.
 *   invoice_overdue TERMS WATCH: reads the live ledger, reads each overdue
 *                   invoice and its job by id, stops on an open exception, and
 *                   chases by invoice id under a named release rule.
 *
 * Every write counts only when its id comes back and reads back. No id, or an
 * id that does not read back, is escalated to the owner the business set for
 * that stage and nothing downstream happens. A chat message wakes nothing.
 */

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

async function releaseOrHold(ports, owners, kind, id, stage, ref, trigger) {
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage, ref, reason: "awaiting_release", owner: owners[stage] });
    return false;
  }
  await ports.release({ kind, id, rule: rule.name });
  await ports.send({ kind, id, trigger });
  return true;
}

/** STAND-IN intake. */
async function onCall(ports, ev, owners) {
  if (!ev.phone || !ev.enquiryId) return;
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return;
  }
  const w = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  if (!w.externalId) await ports.escalate({ stage: "job", ref: ev.enquiryId, reason: "write_failed", owner: owners.job });
}

/** STAND-IN quote hop. */
async function onJobCreated(ports, ev, owners) {
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return;
  if (job.exception) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "exception_open", owner: job.exception.owner });
    return;
  }
  if (job.quotes.length > 0) return; // already quoted: safe to repeat
  const q = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  if (!q.externalId) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote });
    return;
  }
  const back = await ports.readQuote(q.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "not_read_back", owner: owners.quote, detail: q.externalId });
    return;
  }
  await releaseOrHold(ports, owners, "quote", back.id, "quote", job.id, ev.id);
}

/** STAND-IN invoice hop. */
async function onJobCompleted(ports, ev, owners) {
  const job = ev.jobId ? await ports.readJob(ev.jobId) : null;
  if (!job) return;
  if (job.exception) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "exception_open", owner: job.exception.owner, detail: job.exception.reason });
    return;
  }
  const accepted = job.quotes.find((q) => q.status === "accepted");
  const w = await ports.writeInvoice({ jobId: job.id, quoteId: accepted?.id ?? null, trigger: ev.id });
  if (!w.externalId) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice });
    return;
  }
  const back = await ports.readInvoice(w.externalId);
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "not_read_back", owner: owners.invoice, detail: w.externalId });
    return;
  }
  await releaseOrHold(ports, owners, "invoice", back.id, "invoice", job.id, ev.id);
}

/** TERMS WATCH: the chase, by invoice id off the live ledger. */
async function onOverdue(ports, ev, owners) {
  const rows = await ports.readLedger();
  for (const row of rows.filter((r) => r.overdue)) {
    const inv = await ports.readInvoice(row.id);
    if (!inv || !inv.overdue) continue; // paid or gone since the list was read
    if (inv.jobId) {
      const job = await ports.readJob(inv.jobId);
      if (!job) {
        await ports.escalate({ stage: "chase", ref: inv.id, reason: "job_unreadable", owner: owners.chase });
        continue;
      }
      if (job.exception) {
        await ports.escalate({ stage: "chase", ref: job.id, reason: "exception_open", owner: job.exception.owner, detail: inv.id });
        continue;
      }
    }
    await releaseOrHold(ports, owners, "chase", inv.id, "chase", inv.jobId, ev.id);
  }
}

/** @param {import("@aipathway/conformance").CashSeamPorts} ports */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via)) return; // a chat message is not a trigger
  const owners = await ports.readOwners();
  if (ev.name === "call_received") return onCall(ports, ev, owners);
  if (ev.name === "job_created") return onJobCreated(ports, ev, owners);
  if (ev.name === "job_completed") return onJobCompleted(ports, ev, owners);
  if (ev.name === "invoice_overdue") return onOverdue(ports, ev, owners);
  // quote_accepted: the acceptance lives on the job's quote; the invoice hop reads it there.
}

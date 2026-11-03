/**
 * Roof Desk across the Cash Seam (AIP-BS-CASH-SEAM 2026-10-03,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard).
 *
 * Roof Desk owns ONE hop of the cash path: the call. An after-hours call
 * becomes one job in the job system (or attaches to the open job for that
 * number), and the job id that comes back is the id every later hop keys on.
 *
 * The other three hops are THIN STAND-INS, labelled as such. They are not
 * Roof Desk and are not listed as part of it. They exist so this run can show
 * that the job id Roof Desk writes is the id the quote, the invoice and the
 * chase carry, and that an exception Roof Desk raises stops them:
 *
 *   STAND-IN quote hop    job_created     -> draft a quote on the job id
 *   STAND-IN invoice hop  job_completed   -> raise an invoice on the job and quote ids
 *   STAND-IN chase hop    invoice_overdue -> chase the invoice id read off the ledger
 *
 * Every hop: woken by a named event delivered unattended (a chat message is
 * ignored), read the record by its id, stop if an exception is open on it,
 * do one step, read the external id back, and escalate to the owner the
 * business set for that stage when there is no id that reads back.
 */

const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** @param {any} ports */
export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via)) return; // a chat message is not an event
  const owners = await ports.readOwners();

  switch (ev.name) {
    case "call_received":
      return roofDeskIntake(ports, ev, owners);
    case "job_created":
      return standInQuote(ports, ev, owners);
    case "job_completed":
      return standInInvoice(ports, ev, owners);
    case "invoice_overdue":
      return standInChase(ports, ev, owners);
    default:
      return; // quote_accepted: the acceptance lives on the quote; the invoice hop reads it there
  }
}

/** ROOF DESK. The call: one job per enquiry, keyed on the job system's id. */
async function roofDeskIntake(ports, ev, owners) {
  // The only hop allowed to match on a phone number: no job exists yet.
  const open = await ports.searchJobs({ phone: ev.phone, status: "open" });
  if (open.length > 0) {
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return;
  }
  const { externalId } = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName ?? "", phone: ev.phone, trigger: ev.id });
  const back = externalId ? await ports.readJob(externalId) : null;
  if (!externalId || !back || back.id !== externalId) {
    await ports.escalate({ stage: "job", ref: externalId ?? ev.enquiryId, reason: "write_failed", owner: owners.job, detail: "job write returned no id that reads back" });
  }
}

/** Release by the rule the business set, or hand to the stage owner to release. */
async function releaseOrHold(ports, kind, id, stage, owners) {
  const rule = await ports.readReleaseRule();
  if (!rule) {
    await ports.escalate({ stage, ref: id, reason: "awaiting_release", owner: owners[stage] });
    return false;
  }
  await ports.release({ kind, id, rule: rule.name });
  return true;
}

/** STAND-IN quote hop. Not Roof Desk. */
async function standInQuote(ports, ev, owners) {
  const job = await ports.readJob(ev.jobId);
  if (!job || job.exception) return;
  if (job.quotes.length > 0) return; // one quote per job, safe to repeat
  const { externalId } = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const back = externalId ? await ports.readQuote(externalId) : null;
  if (!externalId || !back || back.id !== externalId || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: owners.quote, detail: externalId ? `quote ${externalId} did not read back` : "quote write returned no id" });
    return;
  }
  if (await releaseOrHold(ports, "quote", externalId, "quote", owners)) {
    await ports.send({ kind: "quote", id: externalId, trigger: ev.id });
  }
}

/** STAND-IN invoice hop. Not Roof Desk. */
async function standInInvoice(ports, ev, owners) {
  const job = await ports.readJob(ev.jobId);
  if (!job) return;
  if (job.exception) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "held_open_exception", owner: job.exception.owner, detail: `held behind ${job.exception.reason}` });
    return;
  }
  const accepted = job.quotes.find((q) => q.status === "accepted");
  if (job.quotes.length > 0 && !accepted) return; // a quote is out and not accepted: nothing to invoice against
  const { externalId } = await ports.writeInvoice({ jobId: job.id, quoteId: accepted?.id ?? null, trigger: ev.id });
  const back = externalId ? await ports.readInvoice(externalId) : null;
  if (!externalId || !back || back.id !== externalId || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: owners.invoice, detail: "invoice write returned no id that reads back" });
    return;
  }
  if (await releaseOrHold(ports, "invoice", externalId, "invoice", owners)) {
    await ports.send({ kind: "invoice", id: externalId, trigger: ev.id });
  }
}

/** STAND-IN chase hop. Not Roof Desk. Reads the invoice id off the live ledger. */
async function standInChase(ports, ev, owners) {
  const rows = await ports.readLedger();
  for (const row of rows.filter((r) => r.overdue)) {
    if (!row.jobId) continue;
    const job = await ports.readJob(row.jobId);
    if (!job || job.exception) continue;
    const back = await ports.readInvoice(row.id);
    if (!back || back.id !== row.id || !back.overdue) continue;
    if (await releaseOrHold(ports, "chase", row.id, "chase", owners)) {
      await ports.send({ kind: "chase", id: row.id, trigger: ev.id });
    }
  }
}

/**
 * Delivery Billing: the invoice-out job for supply-and-deliver and install
 * jobs, built to AIP-BS-INVOICE-OUT 2026-10-05.
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * A reimplementation, from the standard and a one-line public description, of
 * a bot that raised a ledger invoice whenever a dispatch task was created. The
 * port moves the trigger to the job system marking the delivery job complete
 * (a task that was created but never delivered is never billed), prices only
 * from the Xero Items book, and sends only under a release. Nothing is taken
 * from the original's workflow, prompt or instructions.
 *
 * Woken by one of three named events, with the id in hand:
 *
 *   job.completed   { job_id }      the dispatch or job system marked the job done
 *   schedule.tick   {}              every complete job the job system lists
 *   exception.closed { job_id, invoice_id, closed_by, kind }
 *                                   the named person closed an exception:
 *                                   kind "awaiting_release" is their release;
 *                                   any other kind sends the job back through
 *                                   the gate (they priced, signed or staged it)
 *
 * For one job, in the standard's order:
 *
 *   1. Read the job by its id from the job system. Not complete: nothing.
 *   2. Read the invoice already on the record for that job, before anything is
 *      written. Draft, released or sent: that is the one invoice, no write.
 *      Parked is the open exception on the record: only its closure moves it.
 *   3. Read the price book at draft time. Each invoice line is a job line at
 *      the book's rate for its code. A code the book does not hold parks the
 *      invoice (not_in_pricebook) and that line carries no rate.
 *   4. A variation is billed only with the signed acceptance attached;
 *      without one the invoice parks (unsigned_variation).
 *   5. A job under a building contract is a stage invoice naming its stage,
 *      never a claim. A contract job with no stage parks (no_stage).
 *   6. Write once into the ledger, keyed to the job (reference job:<id>), and
 *      read it back by the job id. No id back is not a write: escalate
 *      write_failed to the named owner and stop.
 *   7. Parked: escalate the reason to the named owner and stop. Never sent.
 *   8. Drafted: under the threshold of the rule the owner set, release by the
 *      rule and send. Otherwise route to the owner and wait for their release.
 *
 * Every effect goes through the ports and nothing is kept between runs: the
 * invoice, its park reason, its release and its send live on the ledger
 * record and are read back by job id on the next run.
 */

/** The node slug, part of every idempotency key. */
export const NODE = "delivery-billing";

/** The person the business names for parked invoices and for releases. */
export const OWNER = process.env.DELIVERY_BILLING_OWNER ?? "Jess Nguyen (accounts)";

const CLAIM_RE = /progress\s+claim/i;
const total = (lines) => lines.reduce((s, l) => s + l.qty * l.rate, 0);
const cents = (n) => Math.round(n * 100) / 100;

function detail(jobId, invoiceId, reason, extra = {}) {
  return JSON.stringify({ node: NODE, job_id: jobId, invoice_id: invoiceId ?? null, reason, exception_owner: OWNER, ...extra });
}

/** The ledger reference and idempotency key for this job's one invoice. */
function noteFor(job, eventName) {
  const parts = [`job:${job.id}`, `key:${job.id}+${eventName}+${NODE}`];
  if (job.contractStage) parts.push(`Stage invoice: ${job.contractStage}`);
  const note = parts.join("; ");
  if (CLAIM_RE.test(note)) throw new Error("refusing to write a claim");
  return note;
}

/** Price the job's lines from the book read now, and collect any park reason. */
function draft(job, book) {
  const rates = new Map(book.items.map((i) => [i.code, i.rate]));
  const lines = [];
  const unpriced = [];
  const unsigned = [];
  const evidence = [];
  for (const l of job.lines ?? []) {
    const rate = rates.get(l.code);
    if (l.kind === "variation" && !l.signedAcceptance) unsigned.push(l.code);
    if (rate === undefined) {
      unpriced.push(l.code);
      continue; // no rate is typed for a code the book does not hold
    }
    lines.push({ code: l.code, qty: l.qty, rate, kind: l.kind });
    if (l.kind === "variation" && l.signedAcceptance) evidence.push(l.signedAcceptance);
  }
  let park = null;
  if (unpriced.length) park = "not_in_pricebook";
  else if (unsigned.length) park = "unsigned_variation";
  else if (job.underContract && !job.contractStage) park = "no_stage";
  else if (lines.length === 0) park = "not_in_pricebook";
  // An unsigned variation is never on a written invoice, priced or not.
  const written = lines.filter((l) => !(l.kind === "variation" && unsigned.includes(l.code)));
  return { lines: written, unpriced, unsigned, evidence, park };
}

/** Gate a drafted invoice: the owner's rule under its threshold, or the owner. */
async function gate(ports, job, inv) {
  const rule = await ports.readReleaseRule();
  const amount = cents(total(inv.lines));
  if (rule && Number.isFinite(rule.threshold) && amount < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { outcome: "sent", invoice_id: inv.id, released_by_rule: rule.name };
  }
  const reason = rule ? "over_threshold" : "awaiting_release";
  await ports.escalate(reason, detail(job.id, inv.id, "awaiting_release", { total: amount, rule: rule?.name ?? null, threshold: rule?.threshold ?? null }));
  return { outcome: "awaiting_release", invoice_id: inv.id };
}

/** Draft (or re-draft a parked) invoice for one complete job. */
async function invoiceJob(ports, job, eventName, existing) {
  const book = await ports.readPricebook();
  const d = draft(job, book);
  const input = {
    jobId: job.id,
    lines: d.lines,
    bookEdition: book.edition,
    ...(job.contractStage ? { stage: job.contractStage } : {}),
    notes: noteFor(job, eventName),
    ...(d.park ? { park: d.park } : {}),
    ...(existing ? { invoiceId: existing.id } : {}),
  };
  const written = await ports.writeInvoice(input);
  const back = written?.externalId ? await ports.readInvoiceForJob(job.id) : null;
  if (!written?.externalId || !back || back.id !== written.id || back.externalId !== written.externalId) {
    await ports.escalate("write_failed", detail(job.id, written?.id ?? existing?.id ?? null, "write_failed"));
    return { outcome: "write_failed" };
  }
  for (const ref of d.evidence) await ports.attachEvidence(back.id, ref);
  if (d.park) {
    await ports.escalate(d.park, detail(job.id, back.id, d.park, { unpriced: d.unpriced, unsigned: d.unsigned }));
    return { outcome: "parked", reason: d.park, invoice_id: back.id };
  }
  return gate(ports, job, back);
}

async function oneJob(ports, jobs, jobId, eventName) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.status !== "complete") return { outcome: "not_complete", job_id: jobId };
  const existing = await ports.readInvoiceForJob(job.id);
  // The record is the state. One invoice per job; a parked one is an open
  // exception, and the chain waits for its owner to close it.
  if (existing) return { outcome: existing.status === "parked" ? "held_open_exception" : "already_invoiced", invoice_id: existing.id };
  return invoiceJob(ports, job, eventName, null);
}

/**
 * One run. `event` is the named event that woke it.
 * @param {import("@aipathway/conformance").InvoiceOutPorts} ports
 */
export async function build(ports, event = { event: "schedule.tick" }) {
  const name = event?.event;
  if (name === "job.completed") {
    if (!event.job_id) return [];
    const jobs = await ports.readJobs();
    return [await oneJob(ports, jobs, event.job_id, name)];
  }
  if (name === "schedule.tick") {
    const jobs = await ports.readJobs();
    const out = [];
    for (const j of jobs) if (j.status === "complete") out.push(await oneJob(ports, jobs, j.id, name));
    return out;
  }
  if (name === "exception.closed") {
    if (!event.job_id || !event.closed_by) return [];
    const jobs = await ports.readJobs();
    const job = jobs.find((j) => j.id === event.job_id);
    if (!job || job.status !== "complete") return [{ outcome: "not_complete" }];
    const { invoice } = await ports.readRecord(job.id);
    if (!invoice || (event.invoice_id && invoice.id !== event.invoice_id)) return [{ outcome: "no_such_invoice" }];
    if (event.kind === "awaiting_release") {
      // The owner closing the awaiting-release exception is their release. Never a parked one.
      if (invoice.status !== "draft") return [{ outcome: "not_releasable", status: invoice.status }];
      await ports.release(invoice.id, { person: event.closed_by });
      await ports.send(invoice.id);
      return [{ outcome: "sent", invoice_id: invoice.id, released_by: event.closed_by }];
    }
    if (invoice.status !== "parked") return [{ outcome: "not_parked" }];
    return [await invoiceJob(ports, job, name, invoice)];
  }
  return [];
}

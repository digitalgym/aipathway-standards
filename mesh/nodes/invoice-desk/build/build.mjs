/**
 * Invoice Desk: the invoice-out job, built to AIP-BS-INVOICE-OUT 2026-10-05.
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * A port of "Create and approve Xero invoices from Pipedrive Closed Won deals
 * with Slack" by Intuz, reimplemented from the standard and the one-line public
 * description of the original. Nothing is taken from the original's workflow,
 * prompt or instructions. The port swaps the CRM's won-deal event for the job
 * system's completion event, prices from the price book rather than the deal,
 * and keeps the approval as a release by a named person (or a rule that person
 * set) before anything is sent.
 *
 * What one run does, every time it is woken:
 *
 *   job.completed { job_id }      draft (or re-gate) the one invoice for that job
 *   schedule.tick                 the same, for every complete job the job
 *                                 system lists that has no invoice or a parked one
 *   exception.closed { job_id, invoice_id, closed_by, reason }
 *                                 the named person closed the exception: an
 *                                 awaiting-release closure is their release, so
 *                                 the draft is released by them and sent; a park
 *                                 closure sends the job back through the gate
 *
 * For one job:
 *
 *   1. Read the job by its id. Not complete, no invoice. An open exception on
 *      the job stops the run.
 *   2. Read the existing invoice for the job before anything is written. A job
 *      already carrying a draft, released or sent invoice keeps it (no write);
 *      a parked one comes back through the gate and is updated by its id.
 *   3. Read the price book at draft time. Every invoice line is a job line, with
 *      the book's rate for its code. A code the book does not hold parks the
 *      invoice (not_in_pricebook) and carries no rate.
 *   4. A variation line is billed only with its signed acceptance attached.
 *      Without one the invoice parks (unsigned_variation).
 *   5. A job under a building contract is a stage invoice naming its stage.
 *      Never a claim. A contract job with no stage parks (no_stage).
 *   6. Write once into the ledger, keyed to the job, and read it back by job id.
 *      No external id back is not a write: it escalates write_failed and stops.
 *   7. Parked: escalate with the reason and the named owner, and stop. Never sent.
 *   8. Drafted: under the threshold of the rule a person set, release by that
 *      rule and send. Otherwise route to the named person and wait for them.
 *
 * Every effect goes through the ports. The build keeps nothing between runs:
 * the invoice, its park reason, the release and the send all live on the
 * ledger record, and the next run reads them back by job id.
 */

/** The node slug, part of every idempotency key. */
export const NODE = "invoice-desk";

/**
 * The person the business names for parked invoices and releases. Set once by
 * the business (the standard's "name who fixes a parked invoice"); the default
 * is what the stub business named.
 */
export const OWNER = process.env.INVOICE_DESK_OWNER ?? "Priya Shah (accounts)";

/** The phrase the standard forbids on anything this build writes. */
const CLAIM_RE = /progress\s+claim/i;

const totalOf = (lines) => lines.reduce((s, l) => s + l.qty * l.rate, 0);

/** The escalation detail: the record's ids, the reason and the owner, as JSON. */
function detail(jobId, invoiceId, reason, extra = {}) {
  return JSON.stringify({ node: NODE, job_id: jobId, invoice_id: invoiceId ?? null, reason, exception_owner: OWNER, ...extra });
}

/** Price the job's lines from the book and collect every reason the invoice must park. */
function draftFrom(job, book) {
  const rates = new Map(book.items.map((i) => [i.code, i.rate]));
  const lines = [];
  const unpriced = [];
  const unsigned = [];
  const evidence = [];
  for (const l of job.lines ?? []) {
    if (l.kind === "variation" && !l.signedAcceptance) {
      unsigned.push(l.code);
      continue;
    }
    if (!rates.has(l.code)) {
      unpriced.push({ code: l.code, qty: l.qty, description: l.description });
      continue;
    }
    lines.push({ code: l.code, qty: l.qty, rate: rates.get(l.code), kind: l.kind });
    if (l.kind === "variation") evidence.push(l.signedAcceptance);
  }
  const reasons = [];
  if (unpriced.length) reasons.push("not_in_pricebook");
  if (unsigned.length) reasons.push("unsigned_variation");
  if (job.underContract && !job.contractStage) reasons.push("no_stage");
  if (!job.lines?.length) reasons.push("not_in_pricebook");
  return { lines, unpriced, unsigned, evidence, reasons };
}

/** One job through the gate. Returns what happened, for the caller and the log. */
async function invoiceJob(ports, jobId, trigger) {
  const jobs = await ports.readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.status !== "complete") return { outcome: "ignored", job_id: jobId, why: "not complete" };
  if (job.exception && job.exception.open !== false) {
    return { outcome: "held", job_id: job.id, exception_owner: job.exception.owner ?? null };
  }

  const existing = await ports.readInvoiceForJob(job.id);
  if (existing && existing.status !== "parked") {
    return { outcome: "kept", job_id: job.id, invoice_id: existing.id, duplicate_of: existing.id };
  }

  const book = await ports.readPricebook();
  const d = draftFrom(job, book);
  const stage = job.contractStage ?? undefined;
  const notes = stage ? `Stage invoice: ${stage}` : undefined;
  if (notes && CLAIM_RE.test(notes)) throw new Error("refusing to write a claim");
  const park = d.reasons[0];

  const written = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: job.id,
    lines: d.lines,
    bookEdition: book.edition,
    ...(stage !== undefined ? { stage } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(park ? { park } : {}),
  });

  // A write counts only with an id that reads back, on this job.
  const back = written?.externalId ? (await ports.readRecord(job.id)).invoice : null;
  if (!written || !written.externalId || !back || back.id !== written.id || !back.externalId) {
    await ports.escalate("write_failed", detail(job.id, written?.id, "write_failed", { key: `${job.id}:${trigger}:${NODE}` }));
    return { outcome: "write_failed", job_id: job.id, invoice_id: null };
  }

  if (park) {
    await ports.escalate(
      park,
      detail(job.id, back.id, park, { reasons: d.reasons, unpriced: d.unpriced.map((u) => ({ code: u.code, qty: u.qty })), unsigned: d.unsigned, book_edition: book.edition }),
    );
    return { outcome: "parked", job_id: job.id, invoice_id: back.id, external_id: back.externalId, park_reason: park };
  }

  for (const ref of d.evidence) await ports.attachEvidence(back.id, ref);

  // invoice.raised: the draft is in the ledger with its own id. Now the release gate.
  const total = totalOf(d.lines);
  const rule = await ports.readReleaseRule();
  if (rule && total < rule.threshold) {
    await ports.release(back.id, { rule: rule.name });
    await ports.send(back.id);
    return { outcome: "sent", job_id: job.id, invoice_id: back.id, external_id: back.externalId, released_by_rule: rule.name, total };
  }
  await ports.escalate(
    "over_threshold",
    detail(job.id, back.id, "awaiting_release", { total, rule: rule ? { name: rule.name, threshold: rule.threshold } : null }),
  );
  return { outcome: "raised", job_id: job.id, invoice_id: back.id, external_id: back.externalId, total, awaiting: OWNER };
}

/** The named person closed the exception. An awaiting-release closure is their release. */
async function onClosed(ports, ev) {
  if (!ev.job_id) return { outcome: "ignored" };
  if (ev.reason !== "awaiting_release") return invoiceJob(ports, ev.job_id, ev.exception_id ?? "exception.closed");
  if (!ev.closed_by) return { outcome: "ignored", why: "closure names no person" };

  const jobs = await ports.readJobs();
  const job = jobs.find((j) => j.id === ev.job_id);
  if (!job || job.status !== "complete") return { outcome: "ignored" };
  if (job.exception && job.exception.open !== false) return { outcome: "held", job_id: job.id };

  const { invoice } = await ports.readRecord(job.id);
  // Release only what the record shows: this job's invoice, with its ledger id, not yet
  // released or sent, and whose lines still price cleanly from the book with nothing to park.
  // (A ledger may keep an old park reason on an invoice that came back through the gate, so the
  // gate is re-run rather than trusting the label.)
  if (!invoice || invoice.id !== ev.invoice_id || !invoice.externalId || !["draft", "parked"].includes(invoice.status)) {
    return { outcome: "ignored", job_id: job.id, why: "nothing releasable on the record" };
  }
  const d = draftFrom(job, await ports.readPricebook());
  const same =
    d.lines.length === invoice.lines.length &&
    d.lines.every((l, i) => l.code === invoice.lines[i].code && l.qty === invoice.lines[i].qty && l.rate === invoice.lines[i].rate);
  if (d.reasons.length || !same) return { outcome: "ignored", job_id: job.id, why: "the invoice would park; nothing parked is sent" };
  await ports.release(invoice.id, { person: ev.closed_by });
  await ports.send(invoice.id);
  return { outcome: "sent", job_id: job.id, invoice_id: invoice.id, released_by: ev.closed_by };
}

/**
 * @param {import("@aipathway/conformance").InvoiceOutPorts} ports
 * @param {{ name: string, job_id?: string, invoice_id?: string, exception_id?: string, closed_by?: string, reason?: string }} [event]
 */
export async function build(ports, event) {
  if (!event) return { outcome: "ignored", why: "no event" };
  switch (event.name) {
    case "job.completed":
      return event.job_id ? invoiceJob(ports, event.job_id, "job.completed") : { outcome: "ignored" };
    case "schedule.tick": {
      const jobs = await ports.readJobs();
      const out = [];
      for (const j of jobs.filter((x) => x.status === "complete")) out.push(await invoiceJob(ports, j.id, "schedule.tick"));
      return { outcome: "ticked", results: out };
    }
    case "exception.closed":
      return onClosed(ports, event);
    default:
      return { outcome: "ignored", why: `not an event this node consumes: ${event.name}` };
  }
}

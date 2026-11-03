/**
 * Invoice Hold, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * WHAT IT DOES. A renovation contractor finishes a job (a bathroom, a kitchen,
 * a deck, or one stage of a job under a building contract). Invoice Hold drafts
 * that job's one invoice in the ledger, priced only from the business's own
 * price book, and holds it there for a named person to release. It does not
 * sort mail, keep a calendar or chase anyone.
 *
 * HOW IT IS WOKEN. One named event per run, never a chat:
 *
 *   job.completed    { name, job_id }                        a webhook from the job system
 *   schedule.tick    { name }                                a sweep of complete jobs
 *   exception.closed { name, job_id, invoice_id, reason, closed_by }
 *                    the named person closed an exception: an awaiting_release
 *                    one is their release; a parked one sends the job back
 *                    through the same gate
 *
 * THE LOOP, every run: read the job by its id, stop on an open exception,
 * read the book at draft time, read the existing invoice before writing, write
 * once, count the write only with the ledger's id back, then the release gate.
 *
 * Rates are in cents, ex GST. Everything goes through the ports it is handed.
 */

export const NODE = "invoice-hold";

/** The person the business named for invoices: parked invoices and releases go to them. */
export const OWNER = "Mel Carter (office manager)";

const WAKES = new Set(["job.completed", "schedule.tick", "exception.closed"]);

/** One run, for the event that woke it. Returns what it did, for the log. */
export async function build(ports, event = { name: "schedule.tick" }) {
  if (!event || !WAKES.has(event.name)) return [];
  if (event.name === "exception.closed") return closed(ports, event);

  const jobs = await ports.readJobs();
  const targets = event.name === "job.completed" ? jobs.filter((j) => j.id === event.job_id) : jobs;
  // The book is read at draft time, once per run, before any line is priced.
  const book = await ports.readPricebook();
  const out = [];
  for (const job of targets) out.push(await draft(ports, job, book));
  return out;
}

/** The named person closed an exception on a job. */
async function closed(ports, ev) {
  if (!ev.job_id || !ev.closed_by) return [{ outcome: "ignored" }];
  const jobs = await ports.readJobs();
  const job = jobs.find((j) => j.id === ev.job_id);
  if (!job) return [{ outcome: "ignored", job_id: ev.job_id }];

  if (ev.reason === "awaiting_release") {
    // Only the person the business named may release, and only the draft that waits.
    if (ev.closed_by !== OWNER) return [{ outcome: "refused", job_id: job.id }];
    const { invoice } = await ports.readRecord(job.id);
    if (!invoice || invoice.id !== ev.invoice_id || invoice.status !== "draft" || !invoice.externalId) {
      return [{ outcome: "ignored", job_id: job.id }];
    }
    await ports.release(invoice.id, { person: ev.closed_by });
    await ports.send(invoice.id);
    return [{ outcome: "sent", job_id: job.id, invoice_id: invoice.id, released_by: ev.closed_by }];
  }

  // A parked reason was dealt with (the line priced, the signature attached, the
  // stage named): back through the same gate, with the book read again now.
  const book = await ports.readPricebook();
  return [await draft(ports, job, book)];
}

const total = (lines) => lines.reduce((s, l) => s + l.qty * l.rate, 0);
const sameLines = (a, b) =>
  a.length === b.length && a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

async function park(ports, reason, detail) {
  await ports.escalate(reason, JSON.stringify({ ...detail, park_reason: reason, exception_owner: OWNER, node: NODE }));
}

/** One job through the checks, in the standard's order. */
async function draft(ports, job, book) {
  // 1. Completion is the only trigger.
  if (!job || job.status !== "complete") return { outcome: "not_complete", job_id: job?.id };
  // An open exception with a named owner stops the chain.
  if (job.exception && job.exception.owner) return { outcome: "held", job_id: job.id, owner: job.exception.owner };

  // 6. Read the existing invoice before writing anything.
  const existing = await ports.readInvoiceForJob(job.id);
  if (existing && (existing.status === "released" || existing.status === "sent")) {
    return { outcome: "kept", job_id: job.id, invoice_id: existing.id };
  }

  // 2-4. Every line is a job line, priced from the book; anything else parks.
  const rates = new Map(book.items.map((i) => [i.code, i.rate]));
  const lines = [];
  const unpriced = [];
  const unsigned = [];
  const signed = [];
  for (const l of job.lines) {
    if (!rates.has(l.code)) {
      unpriced.push(l.code);
      continue;
    }
    if (l.kind === "variation" && !l.signedAcceptance) {
      unsigned.push(l.code);
      continue;
    }
    if (l.kind === "variation") signed.push(l.signedAcceptance);
    lines.push({ code: l.code, qty: l.qty, rate: rates.get(l.code), kind: l.kind });
  }

  // 5. Under a building contract it is a stage invoice, and it names the stage.
  const underContract = Boolean(job.underContract) || job.contractStage !== undefined;
  const stage = job.contractStage || undefined;
  const reason = unpriced.length
    ? "not_in_pricebook"
    : unsigned.length
      ? "unsigned_variation"
      : underContract && !stage
        ? "no_stage"
        : null;
  const notes = stage ? `Stage invoice: ${stage}. Job ${job.id}.` : `Job ${job.id}.`;

  // Nothing new to write: a second completion with the same lines does nothing.
  if (!reason && existing && existing.status === "draft" && sameLines(existing.lines, lines) && existing.bookEdition === book.edition) {
    return { outcome: "unchanged", job_id: job.id, invoice_id: existing.id };
  }

  const written = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: job.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(reason ? { park: reason } : {}),
  });

  // 6-7. No id back from the ledger is a failed write, not a success.
  if (!written || !written.externalId || written.jobId !== job.id) {
    await park(ports, "write_failed", { job_id: job.id, invoice_id: existing?.id ?? null });
    return { outcome: "write_failed", job_id: job.id };
  }

  // 9. Parked: a reason and a person, never sent.
  if (reason) {
    await park(ports, reason, {
      job_id: job.id,
      invoice_id: written.id,
      ...(unpriced.length ? { codes_without_rate: unpriced } : {}),
      ...(unsigned.length ? { variations_unsigned: unsigned } : {}),
    });
    return { outcome: "parked", job_id: job.id, invoice_id: written.id, park_reason: reason };
  }

  // 4. The signed acceptance travels with the invoice as evidence.
  for (const ref of signed) if (!(existing?.evidence ?? []).includes(ref)) await ports.attachEvidence(written.id, ref);

  // 8. The release gate: the rule the person set, under its threshold, or the person.
  const rule = await ports.readReleaseRule();
  const sum = total(lines);
  if (rule && sum < rule.threshold) {
    await ports.release(written.id, { rule: rule.name });
    await ports.send(written.id);
    return { outcome: "sent", job_id: job.id, invoice_id: written.id, released_by_rule: rule.name };
  }
  await ports.escalate(
    "over_threshold",
    JSON.stringify({ job_id: job.id, invoice_id: written.id, reason: "awaiting_release", total: sum, rule: rule?.name ?? null, exception_owner: OWNER, node: NODE }),
  );
  return { outcome: "held_for_release", job_id: job.id, invoice_id: written.id };
}

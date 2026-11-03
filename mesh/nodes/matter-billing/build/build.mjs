/**
 * Matter Billing, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A litigation practice bills work that actually happened. In the
 * practice management system every billable event is a task on the matter
 * with its own id: an appearance the court confirmed, a draft the client
 * signed off, a filing lodged. When the system marks that task complete, this
 * node drafts one tax invoice for it in the firm's ledger (Xero), every line
 * from the task and every rate from the firm's own rate card, and leaves it for
 * the responsible solicitor to release. It is the standard's "job" with the
 * firm's words on it:
 *
 *   job                  a billable task on a matter, by the id the practice
 *                        management system issued (carried as job_id)
 *   job complete         the system marked the task done: appearance confirmed,
 *                        draft signed off. The only trigger.
 *   price book           the firm's rate card, the rates in its costs
 *                        agreement, read at draft time
 *   callout              an appearance fee
 *   labour               professional time, by the rate card's unit
 *   material             a disbursement: filing fee, search, transcript
 *   variation            work outside the scope of the costs agreement, billed
 *                        only with the client's signed variation attached
 *   contract stage       a stage of a staged costs agreement: a stage invoice
 *
 * WHAT IT NEVER DOES. It never types, averages or recalls a rate. It never
 * bills work the system has not marked complete. It never makes a second
 * invoice for one task. It never sends without a release by a named person or
 * a rule a named person set with a threshold. It never discounts, writes off
 * or argues a bill: costs disputes, assessment and the client's rights about
 * the bill stay with the responsible solicitor.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed. Every port call is awaited, so the same build runs against the
 * stub and against the firm's own systems.
 */

export const NODE = "matter-billing";

/** Who owns what, as the firm set it. Overridable per firm; never guessed. */
export const DEFAULT_OWNERS = {
  billing: "the billing partner named in the firm's settings",
};

const sumOf = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const sameLines = (a, b) =>
  a.length === b.length && a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

/**
 * One run. Woken by a named event:
 *   { type: "job.completed" } or { type: "schedule.tick" }   draft what is complete
 *   { type: "release", jobId, person }                        a named person released it
 *
 * Anything else is ignored. A chat message is not a trigger.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = DEFAULT_OWNERS) {
  if (event?.type === "release") return releaseByPerson(ports, event.jobId, event.person, owners);
  if (event?.type !== "job.completed" && event?.type !== "schedule.tick") return [];

  // 1. The system's completion is the only trigger: read the tasks, take only the complete ones.
  const jobs = await ports.readJobs();
  const complete = jobs.filter((j) => j.status === "complete");
  if (complete.length === 0) return [];

  // 3. The rate card is read at draft time, before any line is priced, and the rule with it.
  const book = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const rates = new Map(book.items.map((i) => [i.code, i.rate]));

  const out = [];
  for (const job of complete) out.push(await draftOne(ports, job, book, rates, rule, owners));
  return out;
}

async function draftOne(ports, job, book, rates, rule, owners) {
  // 6. Read the existing invoice before writing one. One invoice per task.
  const existing = await ports.readInvoiceForJob(job.id);
  // An open exception on the record stops this task until its owner acts.
  if (existing?.status === "parked") return { jobId: job.id, outcome: "held", invoiceId: existing.id };
  // Released or sent is final: a second completion event does nothing.
  if (existing && existing.status !== "draft") return { jobId: job.id, outcome: "kept", invoiceId: existing.id };

  // 2 and 3. Every invoice line is a line on the task, priced only from the card.
  const lines = [];
  const missing = [];
  const unsigned = [];
  const signatures = [];
  for (const l of job.lines) {
    if (l.kind === "variation") {
      if (!l.signedAcceptance) {
        unsigned.push(l.code);
        continue;
      }
      signatures.push(l.signedAcceptance);
    }
    if (!rates.has(l.code)) {
      missing.push(l.code); // no rate is invented for it
      continue;
    }
    lines.push({ code: l.code, qty: l.qty, rate: rates.get(l.code), kind: l.kind });
  }

  // 4 and 3. Park rather than guess: an unsigned variation first, then a code the card does not hold.
  const park = unsigned.length ? "unsigned_variation" : missing.length ? "not_in_pricebook" : undefined;

  // 5. A task under a staged costs agreement is a stage invoice, and says only that.
  const stage = job.contractStage || undefined;
  const notes = [
    `Matter task ${job.id}`,
    stage ? `Stage invoice: ${stage}` : null,
    missing.length ? `Not on the rate card, left unpriced: ${missing.join(", ")}` : null,
    unsigned.length ? `Variation with no signed acceptance, not billed: ${unsigned.join(", ")}` : null,
    `Rates from rate card ${book.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  if (existing && !park && sameLines(existing.lines, lines)) return { jobId: job.id, outcome: "unchanged", invoiceId: existing.id };

  // 6 and 7. Written once, keyed to the task; a second event updates that invoice.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: job.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });

  // A null id is a failed write, not a success. It goes to a person.
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `task ${job.id}: the ledger returned no invoice id. Owner: ${owners.billing}`);
    return { jobId: job.id, outcome: "write_failed" };
  }

  // 9. Parked is a queue with a reason and an owner. Nothing parked goes further.
  if (park) {
    const what = park === "unsigned_variation" ? unsigned.join(", ") : missing.join(", ");
    await ports.escalate(park, `task ${job.id}, invoice ${inv.externalId}: ${park} (${what}). Owner: ${owners.billing}`);
    return { jobId: job.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // 4. The signed variation travels on the invoice as evidence.
  for (const ref of signatures) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // A second event that only updated the draft does not run the release again.
  if (existing) return { jobId: job.id, outcome: "updated", invoiceId: inv.id };

  // 8. The release gate. Under a rule's threshold, the rule releases. Otherwise a person does.
  const total = sumOf(lines);
  if (rule && total < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: job.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  if (rule) await ports.escalate("over_threshold", `task ${job.id}, invoice ${inv.externalId}: ${total.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.billing}`);
  return { jobId: job.id, outcome: "drafted", invoiceId: inv.id };
}

/** The responsible solicitor releases a draft. Only a draft, only by a name, then it is sent. */
export async function releaseByPerson(ports, jobId, person, owners = DEFAULT_OWNERS) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  void owners;
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

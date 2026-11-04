/**
 * Docket Billing, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A civil, earthmoving or building subcontractor works on site
 * against dockets: each day the crew writes up the hours worked, the plant
 * hours run and the materials used, and the head contractor's site
 * supervisor signs it. The dockets are filed onto the job in the job system
 * (ServiceM8, Simpro, or a job sheet) as job lines, each line naming the
 * docket it came from. When the job system marks the job complete, this node
 * drafts the one invoice for that job in Xero, every line a docket line and
 * every rate from the business's own schedule of rates, and holds it for a
 * named person to release. In the standard's words:
 *
 *   job                  the job the dockets were filed against, by its job_id
 *   job complete         the job marked complete in the job system. The only
 *                        trigger: a docket landing is never one, so a long job
 *                        bills once, with every docket on it
 *   job line             one line of a docket, its docket number (SD-...) in
 *                        the line's description
 *   price book           the schedule of rates: a rate per code for crew
 *                        hours, plant hours by machine, materials and the
 *                        mobilisation charge, read at draft time
 *   callout              mobilisation to site
 *   labour               crew hours, and plant hours by machine (wet hire,
 *                        operator included), both billed by the hour
 *   material             materials used, as written on the docket
 *   variation            daywork outside the contract scope, billed only when
 *                        the docket the supervisor signed is attached
 *   contract stage       a stage under a building contract
 *
 * WHAT IT NEVER DOES. It never reads hours off a docket photo itself, never
 * types, averages or recalls a rate, never bills a job the job system has not
 * marked complete, never bills daywork from an unsigned docket, never makes a
 * second invoice for one job, and never sends without a release by a named
 * person or a rule a named person set. Credit notes, disputes over what a
 * docket says, and any claim under security of payment law stay with a person.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the business's own systems.
 */

export const NODE = "docket-billing";

/** Who owns a parked or waiting invoice, as the business set it. Never guessed. */
export const DEFAULT_OWNERS = {
  billing: "the accounts person the business named for docket billing",
};

const total = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const same = (a, b) =>
  a.length === b.length &&
  a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);
const docketOf = (l) => /SD-[A-Za-z0-9-]+/.exec(l.description ?? "")?.[0] ?? null;

/**
 * One run, woken by a named event:
 *   { type: "job.completed" } | { type: "schedule.tick" }    draft every completed job
 *   { type: "exception.closed", jobId }                       its owner acted: draft that job again
 *   { type: "release", jobId, person }                        a named person released the draft
 * Anything else, a docket landing or a chat message included, does nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = DEFAULT_OWNERS) {
  const type = event?.type;
  if (type === "release") return releaseByPerson(ports, event.jobId, event.person);
  if (type !== "job.completed" && type !== "schedule.tick" && type !== "exception.closed") return [];

  // 1. Completion is the only trigger: read the jobs, take only the complete ones.
  const jobs = (await ports.readJobs()).filter((j) => j.status === "complete");
  const todo = type === "exception.closed" ? jobs.filter((j) => j.id === event.jobId) : jobs;
  if (todo.length === 0) return [];

  // 3. The schedule of rates and the release rule are read now, before any line is priced.
  const book = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const rates = new Map(book.items.map((i) => [i.code, i.rate]));

  const results = [];
  for (const job of todo) {
    results.push(await draft(ports, job, book, rates, rule, owners, type === "exception.closed"));
  }
  return results;
}

async function draft(ports, job, book, rates, rule, owners, ownerActed) {
  // 6. The existing invoice is read before anything is written. One per job.
  const existing = await ports.readInvoiceForJob(job.id);
  // An open exception holds the job until its owner closes it.
  if (existing?.status === "parked" && !ownerActed) return { jobId: job.id, outcome: "held", invoiceId: existing.id };
  // Released or sent is final; a late second event changes nothing.
  if (existing && existing.status !== "draft" && existing.status !== "parked") {
    return { jobId: job.id, outcome: "kept", invoiceId: existing.id };
  }

  // 2 and 3. Every invoice line is a docket line on the job, priced only from the schedule.
  const lines = [];
  const notInBook = [];
  const unsigned = [];
  const signedDockets = [];
  const traced = [];
  for (const l of job.lines) {
    const docket = docketOf(l);
    if (l.kind === "variation") {
      // Daywork is billed only with the docket the supervisor signed.
      if (!l.signedAcceptance) {
        unsigned.push(`${l.code}${docket ? ` on ${docket}` : ""}`);
        continue;
      }
      if (!signedDockets.includes(l.signedAcceptance)) signedDockets.push(l.signedAcceptance);
    }
    if (!rates.has(l.code)) {
      notInBook.push(l.code); // left unpriced; no rate is invented
      continue;
    }
    lines.push({ code: l.code, qty: l.qty, rate: rates.get(l.code), kind: l.kind });
    if (docket) traced.push(`${l.code} x${l.qty} from ${docket}`);
  }

  // 4 then 3. Park rather than guess.
  const park = unsigned.length ? "unsigned_variation" : notInBook.length ? "not_in_pricebook" : undefined;

  // 5. A job under a building contract is a stage invoice, and says only that.
  const stage = job.contractStage || undefined;
  const notes = [
    `Job ${job.id}`,
    stage ? `Stage invoice: ${stage}` : null,
    traced.length ? `Docket lines: ${traced.join("; ")}` : null,
    notInBook.length ? `Not in the schedule of rates, left unpriced: ${notInBook.join(", ")}` : null,
    unsigned.length ? `Daywork on a docket nobody signed, not billed: ${unsigned.join(", ")}` : null,
    `Rates from schedule ${book.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  if (existing && !park && existing.status === "draft" && same(existing.lines, lines)) {
    return { jobId: job.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // 6 and 7. Written once, keyed to the job; a second event updates that invoice.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: job.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });

  // A null id is a failed write, not a success, and it goes to a person.
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `job ${job.id}: the ledger returned no invoice id. Owner: ${owners.billing}`);
    return { jobId: job.id, outcome: "write_failed" };
  }

  // 9. Parked is a queue with a reason and an owner. Nothing parked goes further.
  if (park) {
    const what = park === "unsigned_variation" ? unsigned.join(", ") : notInBook.join(", ");
    await ports.escalate(park, `job ${job.id}, invoice ${inv.externalId}: ${park} (${what}). Owner: ${owners.billing}`);
    return { jobId: job.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // 4. Each signed daywork docket travels on the invoice as evidence.
  for (const ref of signedDockets) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not run the release again.
  if (existing && !ownerActed) return { jobId: job.id, outcome: "updated", invoiceId: inv.id };

  // 8. The release gate: under the rule's threshold the rule releases; otherwise a person.
  const sum = total(lines);
  if (rule && sum < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: job.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  if (rule) {
    await ports.escalate(
      "over_threshold",
      `job ${job.id}, invoice ${inv.externalId}: ${sum.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.billing}`,
    );
  }
  return { jobId: job.id, outcome: "drafted", invoiceId: inv.id };
}

/** A named person releases a draft: only a draft with a ledger id, then it is sent. */
export async function releaseByPerson(ports, jobId, person) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

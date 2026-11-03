/**
 * Timesheet Billing, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A labour-hire, contracting or consulting firm bills hours. Staff
 * send their timesheets in by email; an upstream hop files each one onto the
 * client's engagement in the job system as time entries, by the engagement's
 * id. When the job system marks the billing period complete (the supervisor
 * approved the week), this node drafts one invoice for it in the firm's
 * ledger (Xero), every line one of the period's time entries and every rate
 * from the firm's own rate card, and holds it for a named person to release.
 * It is the standard's "job" in a timesheet firm's words:
 *
 *   job                  one billing period on a client engagement, by the id
 *                        the job system issued (carried as job_id)
 *   job complete         the period was approved and closed in the job
 *                        system. The only trigger: an email is never one.
 *   job line             a time entry or expense filed from a timesheet, its
 *                        reference (TS-...) in the line's description
 *   price book           the rate card: a rate per role code (ordinary hours,
 *                        overtime, site allowance), read at draft time
 *   callout              a minimum site attendance charge
 *   labour               hours by role code
 *   material             a reimbursable expense on the timesheet
 *   variation            hours outside the agreed scope, billed only with the
 *                        client's signed approval attached
 *   contract stage       a milestone under a fixed-stage services contract
 *
 * WHAT IT NEVER DOES. It never reads hours out of an email itself, never
 * types, averages or recalls a rate, never bills a period the job system has
 * not closed, never makes a second invoice for one period, and never sends
 * without a release by a named person or a rule a named person set. Credit
 * notes, write-offs and disputes over hours stay with a person.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the firm's own systems.
 */

export const NODE = "timesheet-billing";

/** Who owns a parked or waiting invoice, as the firm set it. Never guessed. */
export const DEFAULT_OWNERS = {
  billing: "the accounts officer the firm named for timesheet billing",
};

const total = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const same = (a, b) =>
  a.length === b.length &&
  a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

/**
 * One run, woken by a named event:
 *   { type: "job.completed" } | { type: "schedule.tick" }    draft every closed period
 *   { type: "exception.closed", jobId }                       its owner acted: draft that period again
 *   { type: "release", jobId, person }                        a named person released the draft
 * Anything else, a chat message or an email included, does nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = DEFAULT_OWNERS) {
  const type = event?.type;
  if (type === "release") return releaseByPerson(ports, event.jobId, event.person);
  if (type !== "job.completed" && type !== "schedule.tick" && type !== "exception.closed") return [];

  // 1. Completion is the only trigger: read the periods, take only the closed ones.
  const periods = (await ports.readJobs()).filter((j) => j.status === "complete");
  const todo = type === "exception.closed" ? periods.filter((j) => j.id === event.jobId) : periods;
  if (todo.length === 0) return [];

  // 3. The rate card and the release rule are read now, before any line is priced.
  const card = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const rates = new Map(card.items.map((i) => [i.code, i.rate]));

  const results = [];
  for (const period of todo) {
    results.push(await draft(ports, period, card, rates, rule, owners, type === "exception.closed"));
  }
  return results;
}

async function draft(ports, period, card, rates, rule, owners, ownerActed) {
  // 6. The existing invoice is read before anything is written. One per period.
  const existing = await ports.readInvoiceForJob(period.id);
  // An open exception holds the period until its owner closes it.
  if (existing?.status === "parked" && !ownerActed) return { jobId: period.id, outcome: "held", invoiceId: existing.id };
  // Released or sent is final; a late second event changes nothing.
  if (existing && existing.status !== "draft" && existing.status !== "parked") {
    return { jobId: period.id, outcome: "kept", invoiceId: existing.id };
  }

  // 2 and 3. Every invoice line is a time entry on the period, priced only from the card.
  const lines = [];
  const notOnCard = [];
  const unsigned = [];
  const approvals = [];
  const entries = [];
  for (const l of period.lines) {
    if (l.kind === "variation") {
      if (!l.signedAcceptance) {
        unsigned.push(l.code);
        continue;
      }
      approvals.push(l.signedAcceptance);
    }
    if (!rates.has(l.code)) {
      notOnCard.push(l.code); // left unpriced; no rate is invented
      continue;
    }
    lines.push({ code: l.code, qty: l.qty, rate: rates.get(l.code), kind: l.kind });
    if (l.description) entries.push(`${l.code} ${l.qty} from ${l.description}`);
  }

  // 4 then 3. Park rather than guess.
  const park = unsigned.length ? "unsigned_variation" : notOnCard.length ? "not_in_pricebook" : undefined;

  // 5. A period under a fixed-stage contract is a stage invoice, and says only that.
  const stage = period.contractStage || undefined;
  const notes = [
    `Billing period ${period.id}`,
    stage ? `Stage invoice: ${stage}` : null,
    entries.length ? `Time entries: ${entries.join("; ")}` : null,
    notOnCard.length ? `Not on the rate card, left unpriced: ${notOnCard.join(", ")}` : null,
    unsigned.length ? `Out-of-scope hours with no signed client approval, not billed: ${unsigned.join(", ")}` : null,
    `Rates from rate card ${card.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  if (existing && !park && existing.status === "draft" && same(existing.lines, lines)) {
    return { jobId: period.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // 6 and 7. Written once, keyed to the period; a second event updates that invoice.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: period.id,
    lines,
    bookEdition: card.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });

  // A null id is a failed write, not a success, and it goes to a person.
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `period ${period.id}: the ledger returned no invoice id. Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "write_failed" };
  }

  // 9. Parked is a queue with a reason and an owner. Nothing parked goes further.
  if (park) {
    const what = park === "unsigned_variation" ? unsigned.join(", ") : notOnCard.join(", ");
    await ports.escalate(park, `period ${period.id}, invoice ${inv.externalId}: ${park} (${what}). Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // 4. The client's signed approval travels on the invoice as evidence.
  for (const ref of approvals) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not run the release again.
  if (existing && !ownerActed) return { jobId: period.id, outcome: "updated", invoiceId: inv.id };

  // 8. The release gate: under the rule's threshold the rule releases; otherwise a person.
  const sum = total(lines);
  if (rule && sum < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: period.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  if (rule) {
    await ports.escalate(
      "over_threshold",
      `period ${period.id}, invoice ${inv.externalId}: ${sum.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.billing}`,
    );
  }
  return { jobId: period.id, outcome: "drafted", invoiceId: inv.id };
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

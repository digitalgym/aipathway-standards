/**
 * Contract Billing, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A fire protection or electrical maintenance business holds service
 * contracts with its clients: a building's extinguishers, hydrants, emergency
 * lights and alarm panels serviced on a cycle (monthly, quarterly, six-monthly
 * or yearly, in line with AS 1851 and AS/NZS 2293), billed on a cycle the
 * contract sets. The job system (Simpro, ServiceM8, or the fire maintenance
 * system the business already runs) raises one billing-period record per
 * contract per cycle and marks it complete on the cycle's billing date. That
 * record is the standard's "job", and its completion is the only trigger:
 *
 *   job                  one billing period on one maintenance contract, by the
 *                        id the job system issued (carried as job_id)
 *   job complete         the job system closed the period on its billing date.
 *                        This node never works out a billing date itself.
 *   job line             a scheduled service, attendance or consumable the
 *                        contract carries for that period
 *   price book           the business's contract schedule of rates (its Xero
 *                        items), read at draft time, never remembered
 *   callout              a site attendance fee on the contract
 *   labour               the routine service fee for an asset class and cycle
 *   material             a consumable the contract bills per period
 *   variation            an asset or service added to the contract mid-term,
 *                        billed only with the client's signed variation to the
 *                        maintenance agreement attached
 *   contract stage       a maintenance period that sits under a building
 *                        contract (a new building's defects liability period),
 *                        invoiced as a stage invoice and nothing more
 *
 * WHAT IT NEVER DOES. It never bills a period the job system has not closed,
 * never carries a rate over from last cycle, never makes a second invoice for
 * one period, never bills an added asset nobody signed for, and never sends.
 * A draft leaves only after a named person releases it, or under the release
 * rule a named person wrote down with a threshold. Credit notes, write-offs,
 * contract price reviews and disputes stay with a person.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the business's own systems.
 */

export const NODE = "contract-billing";

/** Who owns a parked or waiting invoice. The business names them; never guessed. */
export const OWNERS = {
  billing: "the accounts officer the business named for contract billing",
};

const WAKES = new Set(["job.completed", "schedule.tick", "exception.closed"]);

const sum = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const sameLines = (a, b) =>
  a.length === b.length && a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

/**
 * One run, woken by a named event:
 *   { type: "job.completed", jobId? }   the job system closed a billing period
 *   { type: "schedule.tick" }           the routine lists closed periods and works each
 *   { type: "exception.closed", jobId } the owner priced or signed: work that period again
 *   { type: "release", jobId, person }  a named person released the draft in the ledger
 * A chat message, an email or anything else wakes nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = OWNERS) {
  if (event?.type === "release") return personReleases(ports, event.jobId, event.person);
  if (!WAKES.has(event?.type)) return [];

  // Check 1. Read the periods from the job system; only a closed one is billed.
  const closed = (await ports.readJobs()).filter((p) => p.status === "complete");
  const scope = event.jobId ? closed.filter((p) => p.id === event.jobId) : closed;
  if (scope.length === 0) return [];

  // Check 3. The schedule of rates and the release rule are read now, once,
  // before any line is priced.
  const book = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const rateOf = new Map(book.items.map((i) => [i.code, i.rate]));

  const out = [];
  for (const period of scope) {
    out.push(await billPeriod(ports, { period, book, rateOf, rule, owners, ownerActed: event.type === "exception.closed" }));
  }
  return out;
}

async function billPeriod(ports, { period, book, rateOf, rule, owners, ownerActed }) {
  // Check 6. The period's existing invoice is read before anything is written.
  const existing = await ports.readInvoiceForJob(period.id);
  if (existing?.status === "parked" && !ownerActed) return { jobId: period.id, outcome: "held", invoiceId: existing.id };
  if (existing && (existing.status === "released" || existing.status === "sent")) {
    return { jobId: period.id, outcome: "kept", invoiceId: existing.id };
  }

  // Checks 2, 3 and 4. Each line is a line the period carries, at the book's rate.
  const lines = [];
  const unpriced = [];
  const unsigned = [];
  const signatures = [];
  for (const l of period.lines) {
    if (l.kind === "variation" && !l.signedAcceptance) {
      unsigned.push(l.code);
      continue;
    }
    if (!rateOf.has(l.code)) {
      unpriced.push(l.code); // no rate is carried over or guessed
      continue;
    }
    if (l.kind === "variation") signatures.push(l.signedAcceptance);
    lines.push({ code: l.code, qty: l.qty, rate: rateOf.get(l.code), kind: l.kind });
  }
  const park = unsigned.length > 0 ? "unsigned_variation" : unpriced.length > 0 ? "not_in_pricebook" : undefined;

  // Check 5. A period under a building contract names its stage, and only that.
  const stage = period.contractStage || undefined;
  const notes = [
    `Maintenance contract billing period ${period.id}`,
    stage ? `Stage invoice: ${stage}` : null,
    unpriced.length ? `Not in the schedule of rates, left unpriced: ${unpriced.join(", ")}` : null,
    unsigned.length ? `Added to the contract with no signed variation, not billed: ${unsigned.join(", ")}` : null,
    `Rates from schedule ${book.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  // A repeat event with nothing changed writes nothing.
  if (existing && !park && existing.status === "draft" && sameLines(existing.lines, lines)) {
    return { jobId: period.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // Checks 6 and 7. One invoice per period, keyed to it; a repeat updates that one.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: period.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `Period ${period.id}: the ledger returned no invoice id, so nothing was written. Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "write_failed" };
  }

  // Check 9. Parked is a queue with a reason and an owner, and it goes no further.
  if (park) {
    const codes = park === "unsigned_variation" ? unsigned : unpriced;
    await ports.escalate(park, `Period ${period.id}, invoice ${inv.externalId}: ${park} (${codes.join(", ")}). Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // Check 4. The signed variation travels on the invoice.
  for (const ref of signatures) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not go back through the release.
  if (existing && !ownerActed) return { jobId: period.id, outcome: "updated", invoiceId: inv.id };

  // Check 8. Under the threshold of the rule a person set, that rule releases.
  // Otherwise the draft waits in the ledger for a named person.
  const total = sum(lines);
  if (rule && total < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: period.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  await ports.escalate(
    "over_threshold",
    rule
      ? `Period ${period.id}, invoice ${inv.externalId}: ${total.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.billing}`
      : `Period ${period.id}, invoice ${inv.externalId}: no release rule set. Waiting for ${owners.billing}`,
  );
  return { jobId: period.id, outcome: "drafted", invoiceId: inv.id };
}

/** A named person releases a period's draft. Only a draft with a ledger id leaves. */
export async function personReleases(ports, jobId, person) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

/**
 * Outgoings Desk, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A commercial property manager recovers outgoings from tenants once
 * a year: each lease says which outgoings the tenant pays (council rates,
 * water, building insurance, common area cleaning, air conditioning upkeep
 * and the like) and the tenant's share of each, usually by lettable area.
 * During the year the tenant pays instalments against the budget. When the
 * year's actual figures are in, the manager reconciles each tenancy in the
 * property management system and marks that reconciliation final. That record
 * is the standard's "job", and its completion is the only trigger:
 *
 *   job                  one tenancy's outgoings reconciliation for one
 *                        outgoings year, by the id the property system issued
 *                        (carried as job_id; the tenancy_id rides in the notes)
 *   job complete         the manager marked the reconciliation final. This
 *                        node never decides that a year has closed.
 *   job line             one outgoings category on that reconciliation, with
 *                        the tenant's share from the lease as its quantity
 *                        (0.1250 is 12.5 per cent); the budget the tenant
 *                        already paid instalments on is its own line, the same
 *                        category's -EST code at the negative share
 *   price book           the building's outgoings schedule for the year: the
 *                        actual and the budget figure for each category, read
 *                        at draft time, never remembered from last year
 *   material             a recoverable outgoing, at the tenant's share
 *   variation            a share or recovery the lease did not carry at the
 *                        start of the year (the tenant took the suite next
 *                        door, a new outgoing agreed mid-term), billed only
 *                        with the signed deed of variation attached
 *   contract stage       a reconciliation that sits under a building contract
 *                        (an agreement for lease with landlord's works still
 *                        being built), invoiced as a stage invoice and no more
 *
 * WHERE THE SHARE IS UNCLEAR, IT PARKS. A category the year's schedule does
 * not hold, or a line with no share the lease records, parks the whole
 * invoice with not_in_pricebook and names the manager. A share is never
 * worked out from floor area, averaged or carried over from last year here.
 *
 * WHAT IT NEVER DOES. It never decides what a lease makes recoverable (land
 * tax under a state's retail leases law, management fees, capital works: the
 * manager's call, with the lease in front of them), never computes GST (Xero
 * applies the tax rate on the items), never bills an unsigned change of share,
 * never makes a second invoice for one tenancy's year, and never sends. When
 * the tenant paid more in instalments than their share of the actuals, the
 * refund or credit is the manager's: it writes nothing and tells them.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the business's own systems.
 */

export const NODE = "outgoings-desk";

/** Who owns a parked or waiting invoice. The agency names them; never guessed. */
export const OWNERS = {
  outgoings: "the property manager the agency named for outgoings recovery",
};

const WAKES = new Set(["job.completed", "schedule.tick", "exception.closed"]);

const cents = (n) => Math.round(n * 100) / 100;
const sum = (lines) => cents(lines.reduce((t, l) => t + l.qty * l.rate, 0));
const sameLines = (a, b) =>
  a.length === b.length && a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);
/** A share the lease records: a fraction of the building, or minus that fraction on a budget line. */
const isShare = (q) => typeof q === "number" && Number.isFinite(q) && q !== 0 && Math.abs(q) <= 1;

/**
 * One run, woken by a named event:
 *   { type: "job.completed", jobId? }   the manager marked a reconciliation final
 *   { type: "schedule.tick" }           the routine lists final reconciliations and works each
 *   { type: "exception.closed", jobId } the manager fixed the schedule, the share or the deed
 *   { type: "release", jobId, person }  a named person released the draft in the ledger
 * A chat message, an email or anything else wakes nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = OWNERS) {
  if (event?.type === "release") return personReleases(ports, event.jobId, event.person);
  if (!WAKES.has(event?.type)) return [];

  // Check 1. Read the reconciliations; only one the manager marked final is billed.
  const final = (await ports.readJobs()).filter((r) => r.status === "complete");
  const scope = event.jobId ? final.filter((r) => r.id === event.jobId) : final;
  if (scope.length === 0) return [];

  // Check 3. The year's outgoings schedule and the release rule are read now,
  // once, before any line is priced.
  const book = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const amountOf = new Map(book.items.map((i) => [i.code, i.rate]));

  const out = [];
  for (const recon of scope) {
    out.push(await billReconciliation(ports, { recon, book, amountOf, rule, owners, ownerActed: event.type === "exception.closed" }));
  }
  return out;
}

async function billReconciliation(ports, { recon, book, amountOf, rule, owners, ownerActed }) {
  // Check 6. The reconciliation's existing invoice is read before anything is written.
  const existing = await ports.readInvoiceForJob(recon.id);
  if (existing?.status === "parked" && !ownerActed) return { jobId: recon.id, outcome: "held", invoiceId: existing.id };
  if (existing && (existing.status === "released" || existing.status === "sent")) {
    return { jobId: recon.id, outcome: "kept", invoiceId: existing.id };
  }

  // Checks 2, 3 and 4. Each line is a category the reconciliation carries, at
  // the schedule's figure, times the share the lease records.
  const lines = [];
  const unclear = [];
  const unsigned = [];
  const deeds = [];
  for (const l of recon.lines) {
    if (l.kind === "variation" && !l.signedAcceptance) {
      unsigned.push(l.code);
      continue;
    }
    if (!amountOf.has(l.code) || !isShare(l.qty)) {
      unclear.push(l.code); // no figure or share is worked out, averaged or carried over
      continue;
    }
    if (l.kind === "variation") deeds.push(l.signedAcceptance);
    lines.push({ code: l.code, qty: l.qty, rate: amountOf.get(l.code), kind: l.kind });
  }
  const park = unsigned.length > 0 ? "unsigned_variation" : unclear.length > 0 ? "not_in_pricebook" : undefined;

  // The balance is in the tenant's favour: a refund or credit is the manager's.
  if (!park && sum(lines) <= 0) {
    await ports.escalate(
      "credit_due",
      `Reconciliation ${recon.id}, tenancy ${recon.customerId}: instalments paid cover the share of actuals (${sum(lines).toFixed(2)}). No invoice drafted; any refund or credit is for ${owners.outgoings}`,
    );
    return { jobId: recon.id, outcome: "credit_due" };
  }

  // Check 5. A reconciliation under a building contract names its stage, and only that.
  const stage = recon.contractStage || undefined;
  const notes = [
    `Outgoings recovery, reconciliation ${recon.id}, tenancy ${recon.customerId}`,
    stage ? `Stage invoice: ${stage}` : null,
    unclear.length ? `No figure in the year's schedule or no lease share on file, left unbilled: ${unclear.join(", ")}` : null,
    unsigned.length ? `Change of share or recovery with no signed deed of variation, not billed: ${unsigned.join(", ")}` : null,
    `Figures from outgoings schedule ${book.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  // A repeat event with nothing changed writes nothing.
  if (existing && !park && existing.status === "draft" && sameLines(existing.lines, lines)) {
    return { jobId: recon.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // Checks 6 and 7. One invoice per tenancy-year, keyed to the reconciliation;
  // a repeat updates that one.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: recon.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `Reconciliation ${recon.id}: the ledger returned no invoice id, so nothing was written. Owner: ${owners.outgoings}`);
    return { jobId: recon.id, outcome: "write_failed" };
  }

  // Check 9. Parked is a queue with a reason and an owner, and it goes no further.
  if (park) {
    const codes = park === "unsigned_variation" ? unsigned : unclear;
    await ports.escalate(park, `Reconciliation ${recon.id}, invoice ${inv.externalId}: ${park} (${codes.join(", ")}). Owner: ${owners.outgoings}`);
    return { jobId: recon.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // Check 4. The signed deed of variation travels on the invoice.
  for (const ref of deeds) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not go back through the release.
  if (existing && !ownerActed) return { jobId: recon.id, outcome: "updated", invoiceId: inv.id };

  // Check 8. Only under the threshold of a rule the manager wrote down does that
  // rule release. With no rule (the default), every draft waits for a person.
  const total = sum(lines);
  if (rule && total > 0 && total < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: recon.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  await ports.escalate(
    "over_threshold",
    rule
      ? `Reconciliation ${recon.id}, invoice ${inv.externalId}: ${total.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.outgoings}`
      : `Reconciliation ${recon.id}, invoice ${inv.externalId}: drafted, waiting for ${owners.outgoings} to check and release`,
  );
  return { jobId: recon.id, outcome: "drafted", invoiceId: inv.id };
}

/** A named person releases a reconciliation's draft. Only a draft with a ledger id leaves. */
export async function personReleases(ports, jobId, person) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

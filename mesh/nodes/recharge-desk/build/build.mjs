/**
 * Recharge Desk, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. An accounting or bookkeeping practice pays for software its clients
 * use (the ledger plan, payroll seats, receipt capture, a bank feed add-on) on
 * its own account, then charges each client back every month. The practice
 * keeps a subscription register: one recharge period per client per month,
 * with each subscription on it as a line, reconciled to the supplier's bill.
 * When the practice manager closes the month in the register, this node drafts
 * one recharge invoice for each client in the practice's Xero, every line one
 * of that client's subscriptions for the month and every price from the
 * practice's own recharge price list, and holds it for a named person.
 * It is the standard's "job" in a practice's words:
 *
 *   job                  one client's monthly recharge period in the
 *                        subscription register, by the id the register issued
 *                        (carried as job_id)
 *   job complete         the practice manager closed the month for that client,
 *                        after reconciling it to the supplier's bill. The only
 *                        trigger: a supplier's email or a chat is never one.
 *   job line             one subscription on the period, its register line
 *                        reference (SUB-...) in the line's description
 *   price book           the recharge price list: the price the practice
 *                        charges per plan or seat (its cost plus its margin,
 *                        set by the partner), read at draft time
 *   callout              a one-off set-up fee for a new subscription
 *   labour               practice time spent administering the subscriptions
 *   material             a subscription or seat recharged for the month
 *   variation            an extra seat or plan upgrade added mid-month at the
 *                        client's request, billed only with the client's signed
 *                        approval attached
 *   contract stage       a milestone under a fixed-fee onboarding agreement
 *
 * WHAT IT NEVER DOES. It never adds a margin to a supplier cost itself, never
 * types, averages or recalls a price, never bills a month the register has not
 * closed, never makes a second invoice for one client's month, and never sends
 * without a release by a named person or a rule a named person set. Credit
 * notes, write-offs, waived recharges and arguments about what a client agreed
 * to stay with a person.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the practice's own systems.
 */

export const NODE = "recharge-desk";

/** Who owns a parked or waiting invoice, as the practice set it. Never guessed. */
export const DEFAULT_OWNERS = {
  billing: "the practice manager the partner named for software recharges",
};

const total = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const same = (a, b) =>
  a.length === b.length &&
  a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

/**
 * One run, woken by a named event:
 *   { type: "job.completed" } | { type: "schedule.tick" }    draft every closed recharge period
 *   { type: "exception.closed", jobId }                       its owner acted: draft that period again
 *   { type: "release", jobId, person }                        a named person released the draft
 * Anything else, a chat message or a supplier email included, does nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = DEFAULT_OWNERS) {
  const type = event?.type;
  if (type === "release") return releaseByPerson(ports, event.jobId, event.person);
  if (type !== "job.completed" && type !== "schedule.tick" && type !== "exception.closed") return [];

  // 1. The month closing in the register is the only trigger: take only the closed periods.
  const periods = (await ports.readJobs()).filter((j) => j.status === "complete");
  const todo = type === "exception.closed" ? periods.filter((j) => j.id === event.jobId) : periods;
  if (todo.length === 0) return [];

  // 3. The recharge price list and the release rule are read now, before any line is priced.
  const list = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const prices = new Map(list.items.map((i) => [i.code, i.rate]));

  const results = [];
  for (const period of todo) {
    results.push(await draft(ports, period, list, prices, rule, owners, type === "exception.closed"));
  }
  return results;
}

async function draft(ports, period, list, prices, rule, owners, ownerActed) {
  // 6. The existing invoice is read before anything is written. One per client per month.
  const existing = await ports.readInvoiceForJob(period.id);
  // An open exception holds the period until its owner closes it.
  if (existing?.status === "parked" && !ownerActed) return { jobId: period.id, outcome: "held", invoiceId: existing.id };
  // Released or sent is final; a late second close changes nothing.
  if (existing && existing.status !== "draft" && existing.status !== "parked") {
    return { jobId: period.id, outcome: "kept", invoiceId: existing.id };
  }

  // 2 and 3. Every invoice line is a subscription on the period, priced only from the list.
  const lines = [];
  const notOnList = [];
  const unsigned = [];
  const approvals = [];
  const traced = [];
  for (const l of period.lines) {
    if (l.kind === "variation") {
      if (!l.signedAcceptance) {
        unsigned.push(l.code);
        continue;
      }
      approvals.push(l.signedAcceptance);
    }
    if (!prices.has(l.code)) {
      notOnList.push(l.code); // left unpriced; no margin is added to a cost, no price is invented
      continue;
    }
    lines.push({ code: l.code, qty: l.qty, rate: prices.get(l.code), kind: l.kind });
    if (l.description) traced.push(`${l.code} x${l.qty} from ${l.description}`);
  }

  // 4 then 3. Park rather than guess.
  const park = unsigned.length ? "unsigned_variation" : notOnList.length ? "not_in_pricebook" : undefined;

  // 5. A period under a fixed-fee onboarding agreement is a stage invoice, and says only that.
  const stage = period.contractStage || undefined;
  const notes = [
    `Software recharge, register period ${period.id}`,
    stage ? `Stage invoice: ${stage}` : null,
    traced.length ? `Subscriptions: ${traced.join("; ")}` : null,
    notOnList.length ? `Not on the recharge price list, left unpriced: ${notOnList.join(", ")}` : null,
    unsigned.length ? `Seats or upgrades with no signed client approval, not billed: ${unsigned.join(", ")}` : null,
    `Prices from recharge price list ${list.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  if (existing && !park && existing.status === "draft" && same(existing.lines, lines)) {
    return { jobId: period.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // 6 and 7. Written once, keyed to the period; a second close updates that invoice.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: period.id,
    lines,
    bookEdition: list.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });

  // A null id is a failed write, not a success, and it goes to a person.
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `period ${period.id}: Xero returned no invoice id. Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "write_failed" };
  }

  // 9. Parked is a queue with a reason and an owner. Nothing parked goes further.
  if (park) {
    const what = park === "unsigned_variation" ? unsigned.join(", ") : notOnList.join(", ");
    await ports.escalate(park, `period ${period.id}, invoice ${inv.externalId}: ${park} (${what}). Owner: ${owners.billing}`);
    return { jobId: period.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // 4. The client's signed approval for an added seat travels on the invoice as evidence.
  for (const ref of approvals) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not run the release again.
  if (existing && !ownerActed) return { jobId: period.id, outcome: "updated", invoiceId: inv.id };

  // 8. The release gate: under the threshold of the rule the partner set, the rule
  // releases; otherwise the draft waits in Xero for the named person.
  const sum = total(lines);
  if (rule && sum < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: period.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  if (rule) {
    await ports.escalate(
      "over_threshold",
      `period ${period.id}, invoice ${inv.externalId}: $${sum.toFixed(2)} ex GST is over ${rule.name} ($${rule.threshold}). Waiting for ${owners.billing}`,
    );
  }
  return { jobId: period.id, outcome: "drafted", invoiceId: inv.id };
}

/** A named person releases a draft: only a draft with a Xero id, then it is sent. */
export async function releaseByPerson(ports, jobId, person) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

/**
 * Stage Billing, built to AIP-BS-INVOICE-OUT 2026-10-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard
 *
 * THE JOB. A builder or renovator signs a contract with a payment schedule:
 * a deposit, then an amount at each stage (base, frame, lock-up, fixing,
 * practical completion, or whatever stages the contract names). The job
 * system (Simpro, ServiceM8, Buildxact or the job sheet the business runs)
 * holds that schedule as one stage record per instalment on the job, and the
 * site supervisor marks a stage record complete when the stage is reached
 * (the deposit record when the contract is signed). That stage record is the
 * standard's "job", and its completion is the only trigger:
 *
 *   job                  one instalment on one building job's payment schedule,
 *                        by the id the job system issued (carried as job_id)
 *   job complete         the job system shows the stage reached. This node
 *                        never decides a stage is reached itself.
 *   contract stage       the stage's name as the contract writes it ("Deposit",
 *                        "Frame stage"). Every record here must carry one: a
 *                        record with no stage name parks with reason no_stage.
 *   price book           the agreed payment schedules, one item per contract
 *                        stage (code <contract>-<stage>), each holding the
 *                        dollar amount the signed contract sets for it, read
 *                        at draft time and never worked out from a percentage
 *   labour line          the scheduled stage amount itself
 *   material line        a prime cost or provisional sum adjustment the stage
 *                        carries, at the amount the schedule records for it
 *   variation            a variation the client signed, billed with the stage
 *                        only with that signed variation attached
 *
 * WHAT IT NEVER DOES. It never bills a stage the job system has not shown as
 * reached, never works an amount out from a contract percentage, never makes
 * a second invoice for one stage, never bills a variation nobody signed,
 * never calls anything a progress claim, and never sends. A draft leaves only
 * after a named person releases it, or under a release rule a named person
 * wrote down with a threshold. Serving or answering a claim under security of
 * payment law, the home warranty insurance before a deposit, retention, credit
 * notes and disputes stay with a person.
 *
 * THE ONE RULE. Everything it does to the outside world goes through the ports
 * it is handed, and every port call is awaited, so the same build runs against
 * the stub and against the business's own systems.
 */

export const NODE = "stage-billing";

/** Who owns a parked or waiting stage invoice. The business names them; never guessed. */
export const OWNERS = {
  billing: "the contracts administrator the business named for stage invoices",
};

const WAKES = new Set(["job.completed", "schedule.tick", "exception.closed"]);

const total = (lines) => lines.reduce((t, l) => t + l.qty * l.rate, 0);
const same = (a, b) =>
  a.length === b.length && a.every((l, i) => l.code === b[i].code && l.qty === b[i].qty && l.rate === b[i].rate && l.kind === b[i].kind);

/**
 * One run, woken by a named event:
 *   { type: "job.completed", jobId? }   the job system shows a stage reached
 *   { type: "schedule.tick" }           the routine lists reached stages and works each
 *   { type: "exception.closed", jobId } the owner fixed the schedule or got the signature
 *   { type: "release", jobId, person }  a named person released the draft in the ledger
 * Anything else, a chat message included, wakes nothing.
 */
export async function build(ports, event = { type: "schedule.tick" }, owners = OWNERS) {
  if (event?.type === "release") return releaseByPerson(ports, event.jobId, event.person);
  if (!WAKES.has(event?.type)) return [];

  // Check 1. The stage records come from the job system; only a reached one is billed.
  const reached = (await ports.readJobs()).filter((s) => s.status === "complete");
  const todo = event.jobId ? reached.filter((s) => s.id === event.jobId) : reached;
  if (todo.length === 0) return [];

  // Check 3. The payment schedules and the release rule are read now, before any line is priced.
  const book = await ports.readPricebook();
  const rule = await ports.readReleaseRule();
  const amount = new Map(book.items.map((i) => [i.code, i.rate]));

  const results = [];
  for (const stageRecord of todo) {
    results.push(await billStage(ports, { stageRecord, book, amount, rule, owners, ownerActed: event.type === "exception.closed" }));
  }
  return results;
}

async function billStage(ports, { stageRecord: s, book, amount, rule, owners, ownerActed }) {
  // Check 6. The stage's existing invoice is read before anything is written.
  const existing = await ports.readInvoiceForJob(s.id);
  if (existing?.status === "parked" && !ownerActed) return { jobId: s.id, outcome: "held", invoiceId: existing.id };
  if (existing && (existing.status === "released" || existing.status === "sent")) return { jobId: s.id, outcome: "kept", invoiceId: existing.id };

  // Checks 2, 3 and 4. Each line is a line the stage record carries, at the schedule's amount.
  const lines = [];
  const notOnSchedule = [];
  const unsigned = [];
  const signed = [];
  for (const l of s.lines) {
    if (l.kind === "variation" && !l.signedAcceptance) {
      unsigned.push(l.code);
      continue;
    }
    if (!amount.has(l.code)) {
      notOnSchedule.push(l.code); // never worked out from a percentage
      continue;
    }
    if (l.kind === "variation") signed.push(l.signedAcceptance);
    lines.push({ code: l.code, qty: l.qty, rate: amount.get(l.code), kind: l.kind });
  }

  // Check 5. Every stage invoice names its stage. A record with none parks.
  const stage = typeof s.contractStage === "string" && s.contractStage.trim() ? s.contractStage.trim() : undefined;
  const park = !stage
    ? "no_stage"
    : unsigned.length > 0
      ? "unsigned_variation"
      : notOnSchedule.length > 0
        ? "not_in_pricebook"
        : undefined;

  const notes = [
    stage ? `Stage invoice: ${stage}` : "Stage not named on the job's payment schedule",
    `Building job stage record ${s.id}`,
    notOnSchedule.length ? `Not on the agreed payment schedule, left unbilled: ${notOnSchedule.join(", ")}` : null,
    unsigned.length ? `Variation with no signed acceptance, not billed: ${unsigned.join(", ")}` : null,
    `Amounts from payment schedule ${book.edition}`,
  ]
    .filter(Boolean)
    .join(". ");

  // A repeat event with nothing changed writes nothing.
  if (existing && !park && existing.status === "draft" && same(existing.lines, lines)) {
    return { jobId: s.id, outcome: "unchanged", invoiceId: existing.id };
  }

  // Checks 6 and 7. One invoice per stage record, keyed to it; a repeat updates that one.
  const inv = await ports.writeInvoice({
    ...(existing ? { invoiceId: existing.id } : {}),
    jobId: s.id,
    lines,
    bookEdition: book.edition,
    ...(stage ? { stage } : {}),
    notes,
    ...(park ? { park } : {}),
  });
  if (!inv || !inv.externalId) {
    await ports.escalate("write_failed", `Stage record ${s.id}: the ledger returned no invoice id, so nothing was written. Owner: ${owners.billing}`);
    return { jobId: s.id, outcome: "write_failed" };
  }

  // Check 9. Parked is a queue with a reason and an owner, and it goes no further.
  if (park) {
    const what = park === "no_stage" ? "no stage name on the record" : (park === "unsigned_variation" ? unsigned : notOnSchedule).join(", ");
    await ports.escalate(park, `Stage record ${s.id}, invoice ${inv.externalId}: ${park} (${what}). Owner: ${owners.billing}`);
    return { jobId: s.id, outcome: "parked", invoiceId: inv.id, reason: park };
  }

  // Check 4. The signed variation travels on the invoice.
  for (const ref of signed) if (!inv.evidence.includes(ref)) await ports.attachEvidence(inv.id, ref);

  // An update to an existing draft does not go back through the release.
  if (existing && !ownerActed) return { jobId: s.id, outcome: "updated", invoiceId: inv.id };

  // Check 8. Under the threshold of a rule a named person set, that rule releases.
  // Otherwise the draft waits in the ledger for a named person.
  const sum = total(lines);
  if (rule && sum < rule.threshold) {
    await ports.release(inv.id, { rule: rule.name });
    await ports.send(inv.id);
    return { jobId: s.id, outcome: "sent", invoiceId: inv.id, releasedByRule: rule.name };
  }
  await ports.escalate(
    "over_threshold",
    rule
      ? `Stage record ${s.id}, invoice ${inv.externalId}: ${sum.toFixed(2)} is over ${rule.name} (${rule.threshold}). Waiting for ${owners.billing}`
      : `Stage record ${s.id}, invoice ${inv.externalId}: no release rule set. Waiting for ${owners.billing}`,
  );
  return { jobId: s.id, outcome: "drafted", invoiceId: inv.id };
}

/** A named person releases a stage's draft. Only a draft with a ledger id leaves. */
export async function releaseByPerson(ports, jobId, person) {
  if (!jobId || !person) return [];
  const { invoice } = await ports.readRecord(jobId);
  if (!invoice || invoice.status !== "draft" || !invoice.externalId) return [{ jobId, outcome: "refused" }];
  await ports.release(invoice.id, { person });
  await ports.send(invoice.id);
  return [{ jobId, outcome: "sent", invoiceId: invoice.id, releasedBy: person }];
}

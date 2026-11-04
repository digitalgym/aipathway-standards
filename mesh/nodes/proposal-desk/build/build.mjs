/**
 * Proposal Desk, built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * THE JOB. An accounting or bookkeeping practice wins an enquiry from a
 * prospective client. Someone in the practice (or an intake hop) opens a
 * proposal job for that prospect in the practice system, listing the services
 * the prospect needs: the tax returns, the BAS, the payroll, the year-end
 * accounts. Proposal Desk is woken by that job's `job.created` (or
 * `job.updated`) event, reads the job by its id, reads the practice's own
 * service price list fresh (Xero Items, or the practice system's fee list),
 * and either drafts the engagement proposal's fee quote against that job with
 * every line carrying the service's catalogue id, or parks it with a reason
 * from the standard's fixed list.
 *
 * It never sends. A partner reads the draft, agrees the scope with the
 * prospect, and sends it with the engagement letter. Discounts, scope changes
 * to an engagement already accepted, and any service the price list does not
 * cover (advisory, restructures, bespoke work) are the partner's to price.
 *
 * The loop, every time it is woken, keeping nothing between runs:
 *   1. a named event with a job id, or nothing happens
 *   2. read the proposal job by that id
 *   3. an open exception on the job stops the run
 *   4. a job already carrying a proposal keeps it (duplicate_of), never a second
 *   5. a change to an accepted engagement, or a discount, goes to the partner
 *   6. read the price list now; every service must be on it, or the whole proposal parks
 *   7. draft; no id back is not a write, and raises write_failed
 *   8. tell the partner the draft is ready to review and send, and exit
 */

export const NODE = "proposal-desk";

/**
 * The events that wake this node. A raw enquiry email or a phone call is not
 * one: the prospect has to be a proposal job first. When the partner closes an
 * exception or edits the services on the job, the practice system raises
 * job.updated and the chain resumes from the record.
 */
const WAKES = new Set(["job.created", "job.updated"]);

/** Who owns a parked or failed proposal when the job names nobody. Set by the practice. */
const DEFAULT_OWNER = "proposals-partner";

const clean = (s) => String(s ?? "").trim().toLowerCase();

/**
 * A service on the price list, found by its exact catalogue id or its exact
 * catalogue name. Never by likeness: "tax return" is not "Company tax return".
 */
function findService(priceList, asked) {
  const a = clean(asked);
  return priceList.find((s) => clean(s.catalogueId) === a) ?? priceList.find((s) => clean(s.description) === a) ?? null;
}

/** What a parked proposal carries for the partner: what priced, what did not, and never a total. */
function parkedDetail(jobId, owner, lines, unmatched) {
  return JSON.stringify({ job_id: jobId, exception_owner: owner, lines, unmatched, total_ex_gst: null });
}

/**
 * @param {import("@aipathway/conformance").QuotePorts} ports
 * @param {{ name: string, job_id?: string }} [event]
 */
export async function build(ports, event) {
  // 1. Only a named event carrying a job id wakes it.
  if (!event || !WAKES.has(event.name) || !event.job_id) return { outcome: "ignored" };

  // 2. Read the proposal job by its id. Never by the prospect's name or email.
  const job = await ports.readJob(event.job_id);
  if (!job || job.id !== event.job_id) return { outcome: "ignored", job_id: event.job_id };
  const owner = job.exception_owner ?? DEFAULT_OWNER;

  // 3. An open exception with a named owner stops the chain.
  if (job.openException) return { outcome: "held", job_id: job.id, owner: job.openException.owner ?? owner };

  const intentId = `${job.id}:quote-out:${NODE}`;

  // 4. One proposal per job. A second pass on the same prospect keeps what is there.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept) {
      await ports.notify(owner, job.id, "write_failed");
      return { outcome: "write_failed", job_id: job.id, quote_id: null };
    }
    return { outcome: "kept", job_id: job.id, quote_id: kept.id, duplicate_of: kept.duplicateOf ?? kept.id };
  }

  // 5. The partner negotiates. This node prices the fee list, not the deal.
  if (job.isVariation || job.wantsDiscount) {
    const reason = job.isVariation ? "variation_to_accepted_quote" : "discount_requested";
    await ports.escalate(reason, parkedDetail(job.id, owner, [], []));
    return { outcome: "parked", park_reason: reason, job_id: job.id, lines: [], total_ex_gst: null };
  }

  // 6. Read the practice's service price list now. No copy survives between runs.
  let priceList = null;
  try {
    priceList = await ports.readPricebook();
  } catch {
    priceList = null;
  }
  if (!Array.isArray(priceList) || priceList.length === 0) {
    await ports.escalate("pricebook_unreadable", parkedDetail(job.id, owner, [], []));
    return { outcome: "parked", park_reason: "pricebook_unreadable", job_id: job.id, lines: [], total_ex_gst: null };
  }

  const lines = [];
  const unmatched = [];
  for (const asked of job.wants ?? []) {
    const svc = findService(priceList, asked);
    if (svc) lines.push({ catalogueId: svc.catalogueId, description: svc.description, rate: svc.rate });
    else unmatched.push({ description: asked, park_reason: "not_in_pricebook" });
  }

  // No services listed, or any service off the price list: the whole proposal parks, priced lines attached.
  if (unmatched.length > 0 || lines.length === 0) {
    await ports.escalate("not_in_pricebook", parkedDetail(job.id, owner, lines, unmatched));
    return { outcome: "parked", park_reason: "not_in_pricebook", job_id: job.id, lines, unmatched, total_ex_gst: null };
  }

  // 7. Draft the fee quote into their system. It counts only with an id back.
  const draft = await ports.draftQuote({ jobId: job.id, lines }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, job.id, "write_failed");
    return { outcome: "write_failed", job_id: job.id, quote_id: null };
  }

  // 8. Held in draft for the partner. This node has no way to send.
  await ports.notify(owner, job.id, `ready_to_release:${draft.id}`);
  return { outcome: "drafted", job_id: job.id, quote_id: draft.id, external_id: draft.id, state: draft.state, total_ex_gst: draft.total };
}

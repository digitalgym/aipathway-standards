/**
 * Parts Quote, built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * THE JOB. A customer emails asking what a set of spare parts costs. The intake
 * hop (an inbox node, or the office) logs that enquiry as a job carrying the
 * part numbers asked for. Parts Quote is woken by that job's `job.created` (or
 * `job.updated`) event, reads the job by its id, reads the parts price list
 * fresh (Xero Items, or the job system's own price list), and either drafts
 * the quote into that system with every line carrying the part's catalogue id,
 * or parks it with a reason from the standard's fixed list. It never sends:
 * the person who owns parts quotes reads the draft and sends it.
 *
 * The loop, every time it is woken, keeping nothing between runs:
 *   1. a named event with a job id, or nothing happens
 *   2. read the job by that id
 *   3. an open exception on the job stops the run
 *   4. a job already carrying a quote keeps it (duplicate_of), never a second
 *   5. variations and discounts go to a person
 *   6. read the price list now; every part must be on it, or the whole quote parks
 *   7. draft; no id back is not a write, and raises write_failed
 *   8. tell the owner the draft is ready to release, and exit
 */

export const NODE = "parts-quote";

/**
 * The events that wake this node. Anything else, including a raw email, is
 * ignored. When a person closes an exception or edits the parts on the job,
 * the job system raises job.updated and the chain resumes from the record.
 */
const WAKES = new Set(["job.created", "job.updated"]);

/** Who owns a parked or failed parts quote when the job names nobody. Set by the business. */
const DEFAULT_OWNER = "parts-quotes-owner";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Find a part on the price list by its catalogue id or its exact catalogue description. Never by likeness. */
function lookUp(book, want) {
  const w = norm(want);
  return book.find((p) => norm(p.catalogueId) === w) ?? book.find((p) => norm(p.description) === w) ?? null;
}

/**
 * @param {import("@aipathway/conformance").QuotePorts} ports
 * @param {{ name: string, job_id?: string }} [event]
 */
export async function build(ports, event) {
  // 1. Woken by a named event carrying a job id. A raw call or email is not a trigger.
  if (!event || !WAKES.has(event.name) || !event.job_id) return { outcome: "ignored" };

  // 2. Read the job by its id. Never by a name, an email address or a phone number.
  const job = await ports.readJob(event.job_id);
  if (!job || job.id !== event.job_id) return { outcome: "ignored", job_id: event.job_id };
  const owner = job.exception_owner ?? DEFAULT_OWNER;

  // 3. An open exception with a named owner stops the chain.
  if (job.openException) return { outcome: "held", job_id: job.id, owner: job.openException.owner ?? owner };

  const intentId = `${job.id}:quote-out:${NODE}`;

  // 4. One quote per job. A second enquiry email on the same job keeps the quote it has.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept) {
      await ports.notify(owner, job.id, "write_failed");
      return { outcome: "write_failed", job_id: job.id, quote_id: null };
    }
    return { outcome: "kept", job_id: job.id, quote_id: kept.id, duplicate_of: kept.duplicateOf ?? kept.id };
  }

  // 5. The standard prices the catalogue, not the negotiation.
  if (job.isVariation || job.wantsDiscount) {
    const reason = job.isVariation ? "variation_to_accepted_quote" : "discount_requested";
    await ports.escalate(reason, JSON.stringify({ job_id: job.id, exception_owner: owner, lines: [], unmatched: [], total_ex_gst: null }));
    return { outcome: "parked", park_reason: reason, job_id: job.id, lines: [], total_ex_gst: null };
  }

  // 6. Read the price list now, at draft time. No copy is kept between runs.
  let book = null;
  try {
    book = await ports.readPricebook();
  } catch {
    book = null;
  }
  if (!Array.isArray(book) || book.length === 0) {
    await ports.escalate("pricebook_unreadable", JSON.stringify({ job_id: job.id, exception_owner: owner, lines: [], unmatched: [], total_ex_gst: null }));
    return { outcome: "parked", park_reason: "pricebook_unreadable", job_id: job.id, lines: [], total_ex_gst: null };
  }

  const lines = [];
  const unmatched = [];
  for (const want of job.wants ?? []) {
    const hit = lookUp(book, want);
    if (hit) lines.push({ catalogueId: hit.catalogueId, description: hit.description, rate: hit.rate });
    else unmatched.push({ description: want, park_reason: "not_in_pricebook" });
  }

  // Nothing asked for, or anything off the price list: the whole quote parks, priced lines attached, no total.
  if (unmatched.length > 0 || lines.length === 0) {
    await ports.escalate("not_in_pricebook", JSON.stringify({ job_id: job.id, exception_owner: owner, lines, unmatched, total_ex_gst: null }));
    return { outcome: "parked", park_reason: "not_in_pricebook", job_id: job.id, lines, unmatched, total_ex_gst: null };
  }

  // 7. Draft into their system. It counts only with an id back.
  const draft = await ports.draftQuote({ jobId: job.id, lines }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, job.id, "write_failed");
    return { outcome: "write_failed", job_id: job.id, quote_id: null };
  }

  // 8. Left in draft. The owner releases it; this node has no way to send.
  await ports.notify(owner, job.id, `ready_to_release:${draft.id}`);
  return { outcome: "drafted", job_id: job.id, quote_id: draft.id, external_id: draft.id, state: draft.state, total_ex_gst: draft.total };
}

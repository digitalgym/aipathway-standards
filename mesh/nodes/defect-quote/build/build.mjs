/**
 * Defect Quote, built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * THE JOB. A fire and life-safety contractor finds defects on a site: a tech
 * logs them against the routine service (AS 1851) inspection job, or the
 * office logs a fault job from a fire panel fault alert. Each defect sits on
 * that job with the asset it was found on and the rectification item the tech
 * or office chose from the price list. Defect Quote is woken by the job's
 * `job.created` or `job.updated` event, reads the job by its id, reads the
 * price list fresh, and drafts ONE rectification quote for the job, one line
 * per defect, each line carrying its catalogue id, its defect id and its asset
 * id. Anything the price list does not cover parks the whole quote with a
 * reason. It never sends: the person who owns defect quotes reads the draft
 * and sends it to the site's owner or managing agent.
 *
 * NARROWED FROM THE IDEA. A raw panel fault alert (an email, a monitoring
 * message) is not a trigger: it becomes a job first, at intake, and this node
 * quotes the job. And one job carries one quote, so several defects on one
 * inspection are one rectification quote with a line each, not one quote per
 * defect. A defect logged later on the same job keeps that quote.
 *
 * The loop, every time it is woken, keeping nothing between runs:
 *   1. a named event with a job id, or nothing happens
 *   2. read the job by that id
 *   3. an open exception on the job stops the run
 *   4. a job already carrying a quote keeps it (duplicate_of), never a second
 *   5. variations and discounts go to a person
 *   6. read the price list now; every defect's remedy must be on it, or the whole quote parks
 *   7. draft; no id back is not a write, and raises write_failed
 *   8. tell the owner the draft is ready to release, and exit
 */

export const NODE = "defect-quote";

/** The events that wake this node. A raw alert email or panel message is not one of them. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Who owns a parked or failed defect quote when the job names nobody. Set by the business. */
const DEFAULT_OWNER = "defect-quotes-owner";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Find the remedy on the price list by catalogue id or exact catalogue description. Never by likeness. */
function lookUp(book, want) {
  const w = norm(want);
  if (!w) return null;
  return book.find((p) => norm(p.catalogueId) === w) ?? book.find((p) => norm(p.description) === w) ?? null;
}

/** The open defects on the job. A defect already marked rectified is not quoted. */
function openDefects(job) {
  return (job.defects ?? []).filter((d) => d && d.status !== "rectified");
}

/**
 * @param {import("@aipathway/conformance").QuotePorts} ports
 * @param {{ name: string, job_id?: string }} [event]
 */
export async function build(ports, event) {
  // 1. Woken by a named event carrying a job id. A raw alert or email is not a trigger.
  if (!event || !WAKES.has(event.name) || !event.job_id) return { outcome: "ignored" };

  // 2. Read the job by its id. Never by a site name, an address or a phone number.
  const job = await ports.readJob(event.job_id);
  if (!job || job.id !== event.job_id) return { outcome: "ignored", job_id: event.job_id };
  const owner = job.exception_owner ?? DEFAULT_OWNER;

  // 3. An open exception with a named owner stops the chain.
  if (job.openException) return { outcome: "held", job_id: job.id, owner: job.openException.owner ?? owner };

  const intentId = `${job.id}:quote-out:${NODE}`;

  // 4. One quote per job. A defect logged later on the same job keeps the quote it has.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept) {
      await ports.notify(owner, job.id, "write_failed");
      return { outcome: "write_failed", job_id: job.id, quote_id: null };
    }
    return { outcome: "kept", job_id: job.id, quote_id: kept.id, duplicate_of: kept.duplicateOf ?? kept.id };
  }

  const site_id = job.site_id ?? null;
  const parkDetail = (lines, unmatched) => JSON.stringify({ job_id: job.id, site_id, exception_owner: owner, lines, unmatched, total_ex_gst: null });

  // 5. The standard prices the catalogue, not the negotiation.
  if (job.isVariation || job.wantsDiscount) {
    const reason = job.isVariation ? "variation_to_accepted_quote" : "discount_requested";
    await ports.escalate(reason, parkDetail([], []));
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
    await ports.escalate("pricebook_unreadable", parkDetail([], []));
    return { outcome: "parked", park_reason: "pricebook_unreadable", job_id: job.id, lines: [], total_ex_gst: null };
  }

  const lines = [];
  const unmatched = [];
  for (const d of openDefects(job)) {
    const hit = lookUp(book, d.remedy);
    if (hit) lines.push({ catalogueId: hit.catalogueId, description: hit.description, rate: hit.rate, defectId: d.id, assetId: d.asset_id ?? null });
    else unmatched.push({ description: d.description ?? String(d.remedy ?? ""), defectId: d.id, assetId: d.asset_id ?? null, park_reason: "not_in_pricebook" });
  }

  // No open defect, or any defect whose remedy is off the price list: the whole quote parks, priced lines attached, no total.
  if (unmatched.length > 0 || lines.length === 0) {
    await ports.escalate("not_in_pricebook", parkDetail(lines, unmatched));
    return { outcome: "parked", park_reason: "not_in_pricebook", job_id: job.id, lines, unmatched, total_ex_gst: null };
  }

  // 7. Draft into their system, against the job. It counts only with an id back.
  const draft = await ports.draftQuote({ jobId: job.id, lines }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, job.id, "write_failed");
    return { outcome: "write_failed", job_id: job.id, quote_id: null };
  }

  // 8. Left in draft. The owner releases it to the site's owner or agent; this node has no way to send.
  await ports.notify(owner, job.id, `ready_to_release:${draft.id}`);
  return { outcome: "drafted", job_id: job.id, quote_id: draft.id, external_id: draft.id, state: draft.state, total_ex_gst: draft.total };
}

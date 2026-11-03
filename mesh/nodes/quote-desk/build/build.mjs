/**
 * Quote Desk: one job in, one draft quote out, or a parked quote with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * A reimplementation, written from the standard, of the quoting part of the
 * public Grok Bot "Tiffany" by Micah Watson (https://x.ai/bot/7DlZjgLrcgPUNVkl_cC95).
 * No prompt or instruction text from that bot is used here.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created", job_id: "<the job system's id>" }
 *
 * `job.created` is the event the Booked After Hours node emits when it writes a
 * job. `job.updated` is accepted too, so a job whose scope changed is re-quoted
 * against the same quote rather than a new one. Anything else is ignored.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. a variation or a discount: escalate, a person prices the negotiation
 *   4. the job already carries a quote: keep it, record duplicate_of
 *   5. read the price list now, at draft time
 *   6. anything the book does not cover: park the whole quote with its reason
 *   7. draft into the system of record; no id back means not written: alert
 *   8. leave the draft for a person to release. There is no send here at all.
 *
 * Everything goes through the ports it is handed. Every port call is awaited,
 * so the same build runs against the stub and against a live tenant.
 */

export const NODE = "quote-desk";

/** The events that may wake this node. A raw call or email is not one of them. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Fixed list, from section 4 of the standard. */
const PARK = {
  NOT_IN_PRICEBOOK: "not_in_pricebook",
  VARIATION: "variation_to_accepted_quote",
  DISCOUNT: "discount_requested",
  UNREADABLE: "pricebook_unreadable",
};

/**
 * @param {import("@aipathway/conformance").QuotePorts} ports
 * @param {{ name: string, job_id: string }} event  the named event that woke this run
 * @param {{ owner?: string }} [config]  the exception owner the business set for quotes
 * @returns {Promise<object>} the outcome, for the caller's log; the record of it lives in the job system
 */
export async function build(ports, event, config = {}) {
  const owner = config.owner ?? "estimator";

  // 1. A job is the only trigger. No event, no job id, or the wrong kind of event: do nothing.
  if (!event || !WAKES.has(event.name) || typeof event.job_id !== "string" || !event.job_id) {
    return { outcome: "ignored", reason: "not woken by a job event carrying a job id" };
  }
  const jobId = event.job_id;
  const intentId = `${jobId}:${event.name}:${NODE}`; // idempotency key: id + event + node slug

  const job = await ports.readJob(jobId);
  if (!job) return { outcome: "ignored", job_id: jobId, reason: "no such job in the system of record" };

  // 2. An open exception with a named owner stops the chain.
  if (job.exception && job.exception.owner && job.exception.status !== "closed") {
    return { outcome: "held", job_id: jobId, exception_owner: job.exception.owner };
  }

  // 3. Variations and discounts stay with a person. Checked before anything is priced.
  if (job.isVariation) {
    await ports.escalate(PARK.VARIATION, detail({ job_id: jobId, owner }));
    return parked(jobId, PARK.VARIATION, owner);
  }
  if (job.wantsDiscount) {
    await ports.escalate(PARK.DISCOUNT, detail({ job_id: jobId, owner }));
    return parked(jobId, PARK.DISCOUNT, owner);
  }

  // 4. One quote per job. The job already carries one: keep it, never make a second.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept || !kept.id) {
      await ports.notify(owner, jobId, "write_failed");
      return { outcome: "write_failed", job_id: jobId, quote_id: null, exception_owner: owner };
    }
    return { outcome: "kept", job_id: jobId, quote_id: kept.id, external_id: kept.id, duplicate_of: kept.duplicateOf ?? job.quoteId, state: "draft" };
  }

  // 5. The price list, read now. Never a copy held from an earlier run.
  let book;
  try {
    book = await ports.readPricebook();
  } catch {
    book = null;
  }
  const readAt = (await ports.now()).toISOString();
  if (!Array.isArray(book) || book.length === 0) {
    await ports.escalate(PARK.UNREADABLE, detail({ job_id: jobId, owner, pricebook_read_at: readAt }));
    return parked(jobId, PARK.UNREADABLE, owner);
  }

  // 6. Every line traces to a catalogue id, or the whole quote parks.
  const lines = [];
  const unmatched = [];
  for (const want of job.wants ?? []) {
    const item = match(book, want);
    if (item) lines.push({ catalogueId: item.catalogueId, description: item.description, rate: item.rate });
    else unmatched.push({ description: String(want), park_reason: PARK.NOT_IN_PRICEBOOK });
  }
  if (lines.length === 0 && unmatched.length === 0) {
    // Nothing to price is not a quote. A person decides what the job needs.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines: [], unmatched: [{ description: "(no work on the job)", park_reason: PARK.NOT_IN_PRICEBOOK }], pricebook_read_at: readAt }));
    return parked(jobId, PARK.NOT_IN_PRICEBOOK, owner);
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No total.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines, unmatched, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), lines, unmatched, total_ex_gst: null };
  }

  // 7. Draft into their system. It counts only when an id comes back.
  const draft = await ports.draftQuote({ jobId, lines }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, jobId, "write_failed");
    return { outcome: "write_failed", job_id: jobId, quote_id: null, external_id: null, exception_owner: owner };
  }

  // 8. Left in draft for a person to release. Surfaced to them; never sent from here.
  await ports.notify(owner, jobId, `ready_to_release:${draft.id}`);
  return {
    outcome: "drafted",
    job_id: jobId,
    quote_id: draft.id,
    external_id: draft.id,
    state: "draft",
    lines,
    total_ex_gst: draft.total,
    pricebook_read_at: readAt,
    // The seam fields stamped on the record.
    seam: { "seam.job_id": jobId, "seam.quote_id": draft.id, "seam.status": "quote_drafted", "seam.exception_owner": null },
  };
}

/** Exact match on catalogue id or on the catalogue description. Nothing fuzzy, nothing inferred. */
function match(book, want) {
  const w = String(want).trim().toLowerCase();
  return book.find((i) => i.catalogueId.toLowerCase() === w) ?? book.find((i) => i.description.trim().toLowerCase() === w) ?? null;
}

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

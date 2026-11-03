/**
 * Trim Quote: one finish-carpentry job in, one draft quote out, priced as
 * labour hours times the sell-rate kept in the business's own price list, or
 * parked with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * A reimplementation, written from the standard and from the public one-line
 * description of the Grok Bot "Estimator" by Mike A
 * (https://x.ai/bot/NOh5kiDUMNc7AJrAJSsI0). No prompt, instruction or workflow
 * text from that bot is used here. It is narrower than the original: it does
 * not take quantities off plans and does not work out crew duration. The
 * estimator does the takeoff and enters the hours on the job; this node prices
 * those hours from the book and drafts the quote, editable, for a person to send.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created" | "job.updated", job_id: "<the job system's id>" }
 *
 * THE JOB RECORD it reads by that id carries:
 *   wants   the work, each entry a catalogue id (or exact catalogue description)
 *   hours   { [want]: labour hours } for every hourly line, from the takeoff
 *   qty     { [want]: count } for any per-each line; 1 when absent
 *
 * THE PRICE-BOOK RULE. A line's rate is the catalogue's own sell-rate, read at
 * draft time, in cents ex GST. For a line whose catalogue unit is "hour", the
 * line amount is the job's hours for it times that rate. Nothing else sets a
 * number: no rate is inferred, averaged or remembered, and no hours are
 * guessed. An hourly line with no hours on the job (or a line with a quantity that is
 * not a positive number) is not priced; the job goes back to the named person
 * to finish the takeoff.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. a variation or a discount: escalate, a person prices the negotiation
 *   4. the job already carries a quote: keep it, record duplicate_of
 *   5. read the price list now, at draft time
 *   6. anything the book does not cover: park the whole quote with its reason
 *   7. an hourly line with no hours: hand back to the owner, draft nothing
 *   8. draft into the system of record; no id back means not written: alert
 *   9. leave the draft for a person to release. There is no send here at all.
 *
 * Every port call is awaited, so the same build runs on the stub and live.
 */

export const NODE = "trim-quote";

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
 * @param {{ owner?: string }} [config]  the exception owner the business named for quotes
 */
export async function build(ports, event, config = {}) {
  const owner = config.owner ?? "estimator";

  // 1. A job is the only trigger.
  if (!event || !WAKES.has(event.name) || typeof event.job_id !== "string" || !event.job_id) {
    return { outcome: "ignored", reason: "not woken by a job event carrying a job id" };
  }
  const jobId = event.job_id;
  const intentId = `${jobId}:${event.name}:${NODE}`; // id + event + node slug

  const job = await ports.readJob(jobId);
  if (!job) return { outcome: "ignored", job_id: jobId, reason: "no such job in the system of record" };

  // 2. An open exception with a named owner stops the chain.
  if (job.exception && job.exception.owner && job.exception.status !== "closed") {
    return { outcome: "held", job_id: jobId, exception_owner: job.exception.owner };
  }

  // 3. Variations and discounts stay with a person, before anything is priced.
  if (job.isVariation) {
    await ports.escalate(PARK.VARIATION, detail({ job_id: jobId, owner }));
    return parked(jobId, PARK.VARIATION, owner);
  }
  if (job.wantsDiscount) {
    await ports.escalate(PARK.DISCOUNT, detail({ job_id: jobId, owner }));
    return parked(jobId, PARK.DISCOUNT, owner);
  }

  // 4. One quote per job: keep the one it carries.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept || !kept.id) {
      await ports.notify(owner, jobId, "write_failed");
      return { outcome: "write_failed", job_id: jobId, quote_id: null, exception_owner: owner };
    }
    return { outcome: "kept", job_id: jobId, quote_id: kept.id, external_id: kept.id, duplicate_of: kept.duplicateOf ?? job.quoteId, state: "draft" };
  }

  // 5. The price list, read now.
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

  // 6 and 7. Every line traces to a catalogue id and a quantity from the job, or nothing is drafted.
  const lines = [];
  const unmatched = [];
  const noHours = [];
  for (const want of job.wants ?? []) {
    const item = match(book, want);
    if (!item) {
      unmatched.push({ description: String(want), park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    const hourly = String(item.unit ?? "").toLowerCase() === "hour";
    const quantity = hourly ? job.hours?.[want] : (job.qty?.[want] ?? 1);
    if (!isQuantity(quantity)) {
      noHours.push(item.catalogueId);
      continue;
    }
    lines.push({
      catalogueId: item.catalogueId,
      description: item.description,
      unit: hourly ? "hour" : "each",
      quantity,
      rate: item.rate, // the catalogue's unit sell-rate, cents ex GST
      amount: Math.round(quantity * item.rate),
      pricebook_read_at: readAt,
    });
  }

  if (lines.length === 0 && unmatched.length === 0 && noHours.length === 0) {
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines: [], unmatched: [{ description: "(no work on the job)", park_reason: PARK.NOT_IN_PRICEBOOK }], total_ex_gst: null, pricebook_read_at: readAt }));
    return parked(jobId, PARK.NOT_IN_PRICEBOOK, owner);
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No total.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines, unmatched, hours_missing: noHours, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), lines, unmatched, total_ex_gst: null };
  }
  if (noHours.length > 0) {
    // Not a pricing problem: the takeoff is unfinished. Hours are never guessed.
    await ports.notify(owner, jobId, `hours_missing:${noHours.join(",")}`);
    return { outcome: "held_for_hours", job_id: jobId, hours_missing: noHours, total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": "hours_missing", "seam.exception_owner": owner } };
  }

  // 8. Draft into their system. It counts only when an id comes back.
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const draft = await ports.draftQuote({ jobId, lines, total_ex_gst: total }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, jobId, "write_failed");
    return { outcome: "write_failed", job_id: jobId, quote_id: null, external_id: null, exception_owner: owner };
  }

  // 9. Left in draft, editable, for a person to release. Never sent from here.
  await ports.notify(owner, jobId, `ready_to_release:${draft.id}`);
  return {
    outcome: "drafted",
    job_id: jobId,
    quote_id: draft.id,
    external_id: draft.id,
    state: "draft",
    lines,
    labour_hours: lines.filter((l) => l.unit === "hour").reduce((s, l) => s + l.quantity, 0),
    total_ex_gst: total,
    pricebook_read_at: readAt,
    seam: { "seam.job_id": jobId, "seam.quote_id": draft.id, "seam.status": "quote_drafted", "seam.exception_owner": null },
  };
}

/** Exact match on catalogue id or catalogue description. Nothing fuzzy, nothing inferred. */
function match(book, want) {
  const w = String(want).trim().toLowerCase();
  return book.find((i) => i.catalogueId.toLowerCase() === w) ?? book.find((i) => i.description.trim().toLowerCase() === w) ?? null;
}

const isQuantity = (q) => typeof q === "number" && Number.isFinite(q) && q > 0;

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

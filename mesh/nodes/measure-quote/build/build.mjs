/**
 * Measure Quote: one measured job in, one draft quote out, priced as the site
 * measure (square metres, lineal metres, counts) times the rate kept in the
 * business's own price list, or parked with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * An original build. It takes the measure as a person entered it on the job
 * (room by room) and prices it. It does not measure, does not read plans or
 * photos, does not add a waste allowance the price list does not carry, and
 * does not convert one unit into another. It never sends: the draft waits in
 * the job system for the person who owns quotes.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created" | "job.updated", job_id: "<the job system's id>" }
 *
 * THE JOB RECORD it reads by that id carries:
 *   measures  [{ room, item, quantity, unit }]
 *             item      a catalogue id, or the exact catalogue description
 *             quantity  the measured amount, a positive number
 *             unit      "m2" | "lm" | "each", as written on the site measure
 *
 * THE PRICE-BOOK RULE. Each catalogue item has a sell-rate per unit, in cents
 * ex GST, and the unit it is sold by. A line is one room's measure of one item:
 * its amount is the measured quantity times the catalogue rate read at draft
 * time, and nothing else sets a number. The measure's unit must be the item's
 * unit: a skirting board measured in square metres is not converted, it goes
 * back to the person who measured. A missing or non-positive quantity is not
 * guessed: it goes back too.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. a variation or a discount: escalate, a person prices the negotiation
 *   4. the job already carries a quote: keep it, record duplicate_of
 *   5. read the price list now, at draft time
 *   6. anything the book does not cover: park the whole quote with its reason
 *   7. a measure missing or in the wrong unit: hand back, draft nothing
 *   8. draft into the system of record; no id back means not written: alert
 *   9. leave the draft for a person to release. There is no send here at all.
 *
 * Every port call is awaited, so the same build runs on the stub and live.
 */

export const NODE = "measure-quote";

/** The events that may wake this node. A raw call or email is not one of them. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Fixed list, from section 4 of the standard. */
const PARK = {
  NOT_IN_PRICEBOOK: "not_in_pricebook",
  VARIATION: "variation_to_accepted_quote",
  DISCOUNT: "discount_requested",
  UNREADABLE: "pricebook_unreadable",
};

/** The units a site measure is written in. */
const UNITS = new Set(["m2", "lm", "each"]);

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
  const intentId = `${jobId}:${event.name}:${NODE}`;

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

  // 6 and 7. Every line traces to a catalogue id and a measured quantity, or nothing is drafted.
  const lines = [];
  const unmatched = [];
  const badMeasure = [];
  for (const m of Array.isArray(job.measures) ? job.measures : []) {
    const item = match(book, m?.item);
    if (!item) {
      unmatched.push({ room: String(m?.room ?? ""), description: String(m?.item ?? ""), park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    const unit = String(item.unit ?? "each").toLowerCase();
    if (!isQuantity(m.quantity)) {
      badMeasure.push({ room: String(m.room ?? ""), catalogueId: item.catalogueId, problem: "measure_missing" });
      continue;
    }
    if (!UNITS.has(String(m.unit ?? "")) || m.unit !== unit) {
      badMeasure.push({ room: String(m.room ?? ""), catalogueId: item.catalogueId, problem: "measure_unit_mismatch", measured_in: String(m.unit ?? ""), sold_by: unit });
      continue;
    }
    lines.push({
      catalogueId: item.catalogueId,
      description: `${item.description} (${m.room})`,
      room: String(m.room ?? ""),
      unit,
      quantity: m.quantity,
      rate: item.rate, // the catalogue's sell-rate per unit, cents ex GST
      amount: Math.round(m.quantity * item.rate),
      pricebook_read_at: readAt,
    });
  }

  if (lines.length === 0 && unmatched.length === 0 && badMeasure.length === 0) {
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines: [], unmatched: [{ description: "(no measure on the job)", park_reason: PARK.NOT_IN_PRICEBOOK }], total_ex_gst: null, pricebook_read_at: readAt }));
    return parked(jobId, PARK.NOT_IN_PRICEBOOK, owner);
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No total.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines, unmatched, measure_problems: badMeasure, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), lines, unmatched, total_ex_gst: null };
  }
  if (badMeasure.length > 0) {
    // Not a pricing problem: the site measure is incomplete. Nothing is guessed or converted.
    await ports.notify(owner, jobId, `measure_check:${badMeasure.map((b) => `${b.catalogueId}@${b.room}:${b.problem}`).join(",")}`);
    return { outcome: "held_for_measure", job_id: jobId, measure_problems: badMeasure, total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": "measure_check", "seam.exception_owner": owner } };
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
    total_ex_gst: total,
    pricebook_read_at: readAt,
    seam: { "seam.job_id": jobId, "seam.quote_id": draft.id, "seam.status": "quote_drafted", "seam.exception_owner": null },
  };
}

/** Exact match on catalogue id or catalogue description. Nothing fuzzy, nothing inferred. */
function match(book, want) {
  if (typeof want !== "string" || !want.trim()) return null;
  const w = want.trim().toLowerCase();
  return book.find((i) => i.catalogueId.toLowerCase() === w) ?? book.find((i) => i.description.trim().toLowerCase() === w) ?? null;
}

const isQuantity = (q) => typeof q === "number" && Number.isFinite(q) && q > 0;

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

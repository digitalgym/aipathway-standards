/**
 * Tier Quote: one job in, one draft quote out with two or three options
 * (Good, Better and Best unless the business renames them), each option made
 * only of the catalogue lines the business's own tier map lists for that kind
 * of work, each line at the rate in the business's own price list. Or parked
 * with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-11-05, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard (checks 11 to 14
 * are the options checks).
 *
 * An original build. It does not choose which lines make an option, does not
 * invent an option the tier map does not hold, does not reorder or rename the
 * options, and does not discount one option against another. It never sends,
 * never marks the customer's choice, and never voids or declines an option:
 * the draft waits in the job system for the person who owns quotes.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created" | "job.updated", job_id: "<the job system's id>" }
 *
 * THE JOB RECORD it reads by that id carries `optionsFrom`: the kind of work,
 * as a key into the tier map (for example "hot-water-replace"). The tier map
 * is a list the business keeps (a sheet tab, a SharePoint list): one row per
 * option per kind of work, with the option's label and its catalogue ids, in
 * the order the business wants them shown.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. a variation or a discount: escalate, a person prices the negotiation
 *   4. the job already carries a quote: if a person has marked the option the
 *      customer chose, tell them which other options to close; otherwise keep
 *      the quote and record duplicate_of. Never a second quote.
 *   5. read the price list now, at draft time
 *   6. read the tier map entry for the job's kind of work; none usable, or
 *      more than three options: park
 *   7. any line in any option the book does not cover: park the whole quote
 *   8. draft one quote with every option into the system of record; no id
 *      back means not written: alert
 *   9. leave the draft for a person to release. There is no send here at all.
 *
 * Every port call is awaited, so the same build runs on the stub and live.
 */

export const NODE = "tier-quote";

/** The events that may wake this node. A raw call or email is not one of them. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Fixed list, from section 4 of the standard and its options checks. */
const PARK = {
  NOT_IN_PRICEBOOK: "not_in_pricebook",
  VARIATION: "variation_to_accepted_quote",
  DISCOUNT: "discount_requested",
  UNREADABLE: "pricebook_unreadable",
  NO_TIER_MAP: "no_tier_map",
  TOO_MANY: "too_many_options",
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 3;

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

  // 4. One quote per job.
  if (job.quoteId) {
    const labels = Array.isArray(job.quoteOptions) ? job.quoteOptions : [];
    const chosen = typeof job.chosenOption === "string" ? job.chosenOption : null;
    if (chosen && labels.includes(chosen)) {
      // A person marked the customer's pick. Name the others for that person to
      // void or decline. The build closes nothing and sends nothing itself.
      const others = labels.filter((l) => l !== chosen);
      if (others.length > 0) await ports.notify(owner, jobId, `close_options:${others.join("|")}`);
      return { outcome: "close_others_named", job_id: jobId, quote_id: job.quoteId, to_close: others, exception_owner: owner, state: "draft" };
    }
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

  // 6. The tier map entry for this kind of work. The build never makes one up.
  const key = typeof job.optionsFrom === "string" ? job.optionsFrom.trim() : "";
  let rules = [];
  if (key) {
    try {
      rules = await ports.readTierMap(key);
    } catch {
      rules = [];
    }
  }
  if (!Array.isArray(rules)) rules = [];
  const usable =
    rules.length >= MIN_OPTIONS &&
    rules.every((r) => r && typeof r.label === "string" && r.label.trim() && Array.isArray(r.catalogueIds) && r.catalogueIds.length > 0) &&
    new Set(rules.map((r) => r.label.trim().toLowerCase())).size === rules.length;
  if (!usable) {
    await ports.escalate(PARK.NO_TIER_MAP, detail({ job_id: jobId, owner, work: key || null, options_found: rules.map((r) => r?.label ?? null) }));
    return parked(jobId, PARK.NO_TIER_MAP, owner);
  }
  if (rules.length > MAX_OPTIONS) {
    await ports.escalate(PARK.TOO_MANY, detail({ job_id: jobId, owner, work: key, options_found: rules.map((r) => r.label) }));
    return parked(jobId, PARK.TOO_MANY, owner);
  }

  // 7. Every line of every option traces to a catalogue id, or nothing is drafted.
  const options = [];
  const unmatched = [];
  for (const rule of rules) {
    const lines = [];
    for (const id of rule.catalogueIds) {
      const item = typeof id === "string" ? book.find((i) => i.catalogueId === id) : null;
      if (!item) {
        unmatched.push({ option: rule.label, catalogue_id: String(id), park_reason: PARK.NOT_IN_PRICEBOOK });
        continue;
      }
      lines.push({ catalogueId: item.catalogueId, description: item.description, rate: item.rate, pricebook_read_at: readAt });
    }
    options.push({ label: rule.label, lines });
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No totals.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, work: key, options, unmatched, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), unmatched };
  }

  // 8. One quote with every option, into their system. It counts only when an id comes back.
  const draft = await ports.draftQuote({ jobId, lines: [], options }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, jobId, "write_failed");
    return { outcome: "write_failed", job_id: jobId, quote_id: null, external_id: null, exception_owner: owner };
  }

  // 9. Left in draft for a person to release. Never sent from here.
  await ports.notify(owner, jobId, `ready_to_release:${draft.id}`);
  return {
    outcome: "drafted",
    job_id: jobId,
    quote_id: draft.id,
    external_id: draft.id,
    state: "draft",
    options: options.map((o) => ({ label: o.label, catalogue_ids: o.lines.map((l) => l.catalogueId), total_ex_gst: o.lines.reduce((s, l) => s + l.rate, 0) })),
    pricebook_read_at: readAt,
    seam: { "seam.job_id": jobId, "seam.quote_id": draft.id, "seam.status": "quote_drafted", "seam.exception_owner": null },
  };
}

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

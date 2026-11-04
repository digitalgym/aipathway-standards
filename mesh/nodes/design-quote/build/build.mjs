/**
 * Design Quote: a solar or heat-pump design the customer has accepted, already
 * on the job, turned into that job's draft quote lines, each priced from the
 * business's own price book, or parked with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * An original build. The design itself stays in the design tool: this node
 * does not design a system, size an array, pick a model or check a roof. It
 * takes the equipment list of the accepted design as a person attached it to
 * the job and prices it. The design tool's own prices are never used: every
 * rate is read from the business's price book at draft time. It does not work
 * out STCs, state rebates or any other deduction: a design that carries one is
 * a discount and stays with a person. It does not create the job: the job
 * already exists in the job system with the design on it. It never sends: the
 * draft waits in the job system for the person who owns quotes.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created" | "job.updated", job_id: "<the job system's id>" }
 *
 * THE JOB RECORD it reads by that id carries:
 *   proposal  { id, status, system, lines: [{ item, quantity, design_price?, kind? }] }
 *             status        "accepted" is the only status that is priced
 *             system        "solar" | "heat_pump"
 *             item          a catalogue id, or the exact catalogue description
 *             quantity      a whole number of units (panels, inverters, tanks)
 *             design_price  what the design tool showed; read, never used
 *             kind          "rebate" for an STC or rebate deduction line
 *
 * THE PRICE-BOOK RULE. A line is one equipment or install item from the
 * accepted design: its amount is the design's quantity times the catalogue's
 * sell-rate, in cents ex GST, read at draft time. Nothing else sets a number.
 * Equipment is counted, so a quantity that is not a whole positive number goes
 * back to the person who attached the design; it is never rounded.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. no accepted design on the job: wait, write nothing
 *   4. a variation, a discount, or an STC or rebate line: escalate to a person
 *   5. the job already carries a quote: keep it, record duplicate_of
 *   6. read the price book now, at draft time
 *   7. anything the book does not cover: park the whole quote with its reason
 *   8. a quantity that is not a whole number of units: hand back, draft nothing
 *   9. draft into the system of record; no id back means not written: alert
 *  10. leave the draft for a person to release. There is no send here at all.
 *
 * Every port call is awaited, so the same build runs on the stub and live.
 */

export const NODE = "design-quote";

/** The events that may wake this node. A raw call or email is not one of them. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Fixed list, from section 4 of the standard. */
const PARK = {
  NOT_IN_PRICEBOOK: "not_in_pricebook",
  VARIATION: "variation_to_accepted_quote",
  DISCOUNT: "discount_requested",
  UNREADABLE: "pricebook_unreadable",
};

/** The design systems this node prices. */
const SYSTEMS = new Set(["solar", "heat_pump"]);

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

  // 3. Only a design the customer accepted is priced. Anything else waits for the next job event.
  const proposal = job.proposal;
  if (!proposal || proposal.status !== "accepted" || !SYSTEMS.has(proposal.system) || typeof proposal.id !== "string" || !proposal.id) {
    return { outcome: "waiting", job_id: jobId, reason: "no accepted solar or heat-pump design on the job" };
  }
  const designLines = Array.isArray(proposal.lines) ? proposal.lines : [];

  // 4. Variations, discounts and rebate deductions stay with a person, before anything is priced.
  if (job.isVariation) {
    await ports.escalate(PARK.VARIATION, detail({ job_id: jobId, proposal_id: proposal.id, owner }));
    return parked(jobId, PARK.VARIATION, owner);
  }
  const rebates = designLines.filter((l) => l?.kind === "rebate");
  if (job.wantsDiscount || rebates.length > 0) {
    await ports.escalate(PARK.DISCOUNT, detail({ job_id: jobId, proposal_id: proposal.id, owner, rebate_lines: rebates.map((r) => String(r.item ?? "")) }));
    return parked(jobId, PARK.DISCOUNT, owner);
  }

  // 5. One quote per job: keep the one it carries.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept || !kept.id) {
      await ports.notify(owner, jobId, "write_failed");
      return { outcome: "write_failed", job_id: jobId, quote_id: null, exception_owner: owner };
    }
    return { outcome: "kept", job_id: jobId, quote_id: kept.id, external_id: kept.id, duplicate_of: kept.duplicateOf ?? job.quoteId, state: "draft" };
  }

  // 6. The price book, read now.
  let book;
  try {
    book = await ports.readPricebook();
  } catch {
    book = null;
  }
  const readAt = (await ports.now()).toISOString();
  if (!Array.isArray(book) || book.length === 0) {
    await ports.escalate(PARK.UNREADABLE, detail({ job_id: jobId, proposal_id: proposal.id, owner, pricebook_read_at: readAt }));
    return parked(jobId, PARK.UNREADABLE, owner);
  }

  // 7 and 8. Every line traces to a catalogue id and a counted quantity, or nothing is drafted.
  const lines = [];
  const unmatched = [];
  const badQuantity = [];
  for (const d of designLines) {
    const item = match(book, d?.item);
    if (!item) {
      unmatched.push({ description: String(d?.item ?? ""), park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    if (!isCount(d.quantity)) {
      badQuantity.push({ catalogueId: item.catalogueId, problem: "quantity_not_whole" });
      continue;
    }
    lines.push({
      catalogueId: item.catalogueId,
      description: item.description,
      quantity: d.quantity,
      rate: item.rate, // the book's sell-rate per unit, cents ex GST; never the design tool's price
      amount: d.quantity * item.rate,
      proposal_id: proposal.id,
      pricebook_read_at: readAt,
    });
  }

  if (lines.length === 0 && unmatched.length === 0 && badQuantity.length === 0) {
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, proposal_id: proposal.id, owner, lines: [], unmatched: [{ description: "(no equipment on the accepted design)", park_reason: PARK.NOT_IN_PRICEBOOK }], total_ex_gst: null, pricebook_read_at: readAt }));
    return parked(jobId, PARK.NOT_IN_PRICEBOOK, owner);
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No total.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, proposal_id: proposal.id, owner, lines, unmatched, quantity_problems: badQuantity, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), lines, unmatched, total_ex_gst: null };
  }
  if (badQuantity.length > 0) {
    // Not a pricing problem: the design's equipment count is wrong. Nothing is rounded.
    await ports.notify(owner, jobId, `design_check:${badQuantity.map((b) => `${b.catalogueId}:${b.problem}`).join(",")}`);
    return { outcome: "held_for_design", job_id: jobId, quantity_problems: badQuantity, total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": "design_check", "seam.exception_owner": owner } };
  }

  // 9. Draft into their system. It counts only when an id comes back.
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const draft = await ports.draftQuote({ jobId, proposalId: proposal.id, lines, total_ex_gst: total }, intentId);
  if (!draft || !draft.id) {
    await ports.notify(owner, jobId, "write_failed");
    return { outcome: "write_failed", job_id: jobId, quote_id: null, external_id: null, exception_owner: owner };
  }

  // 10. Left in draft, editable, for a person to release. Never sent from here.
  await ports.notify(owner, jobId, `ready_to_release:${draft.id}`);
  return {
    outcome: "drafted",
    job_id: jobId,
    proposal_id: proposal.id,
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

const isCount = (q) => Number.isInteger(q) && q > 0;

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

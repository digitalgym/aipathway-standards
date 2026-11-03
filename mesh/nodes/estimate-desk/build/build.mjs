/**
 * Estimate Desk, built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * THE JOB. A small Australian service business (a commercial cleaner, a
 * grounds crew, a pest or window firm) takes price requests through the form
 * on its website. The intake hop turns each request into a job carrying the
 * services asked for, one line per unit ("Carpet steam clean, per room x3"
 * becomes three lines). Estimate Desk is woken by that job's `job.created`
 * (or `job.updated`) event, reads the job by its id, reads the business's own
 * price list fresh, and either drafts the estimate into the job system or the
 * ledger as a draft quote, every line carrying its catalogue id, or parks it
 * with a reason from the standard's fixed list. Then it tells the owner the
 * draft is ready. It never emails the customer: the owner reads the draft and
 * sends it from their own system.
 *
 * The loop, every time it is woken, keeping nothing between runs:
 *   1. a named event with a job id, or nothing happens
 *   2. read the job by that id
 *   3. an open exception on the job stops the run
 *   4. a job already carrying a quote keeps it (duplicate_of), never a second
 *   5. variations and discounts go to a person
 *   6. read the price list now; every service must be on it, or the whole estimate parks
 *   7. draft; no id back is not a write, and raises write_failed
 *   8. alert the owner the draft is ready to release, and exit
 */

export const NODE = "estimate-desk";

/** The only events that wake this node. A raw form post or email is not one. */
const WAKES = new Set(["job.created", "job.updated"]);

/** Who owns a parked or failed estimate when the job names nobody. Set by the business. */
const DEFAULT_OWNER = "estimates-owner";

/** A form may ask for several of one service: "<id or description> x<N>". */
const QTY = /^(.*?)\s+x\s*(\d{1,3})$/i;

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Split a requested service into what was asked for and how many. */
function parseWant(want) {
  const m = QTY.exec(String(want ?? "").trim());
  if (!m) return { name: String(want ?? "").trim(), qty: 1 };
  return { name: m[1].trim(), qty: Number(m[2]) };
}

/** Find a service on the price list by its catalogue id or its exact catalogue description. Never by likeness. */
function lookUp(book, name) {
  const w = norm(name);
  if (!w) return null;
  return book.find((p) => norm(p.catalogueId) === w) ?? book.find((p) => norm(p.description) === w) ?? null;
}

/**
 * @param {import("@aipathway/conformance").QuotePorts} ports
 * @param {{ name: string, job_id?: string }} [event]
 */
export async function build(ports, event) {
  // 1. Woken by a named event carrying a job id. The form post itself is the intake hop's, not ours.
  if (!event || !WAKES.has(event.name) || typeof event.job_id !== "string" || !event.job_id) return { outcome: "ignored" };

  // 2. Read the job by its id. Never by the name or email typed into the form.
  const job = await ports.readJob(event.job_id);
  if (!job || job.id !== event.job_id) return { outcome: "ignored", job_id: event.job_id };
  const owner = job.exception_owner ?? DEFAULT_OWNER;

  // 3. An open exception with a named owner stops the chain.
  if (job.openException) return { outcome: "held", job_id: job.id, owner: job.openException.owner ?? owner };

  const intentId = `${job.id}:quote-out:${NODE}`;

  // 4. One quote per job. The form submitted twice, or the customer ringing after the form, keeps the one quote.
  if (job.quoteId) {
    const kept = await ports.updateQuote(job.quoteId, intentId);
    if (!kept || !kept.id) {
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
    const { name, qty } = parseWant(want);
    const hit = qty > 0 ? lookUp(book, name) : null;
    if (!hit) {
      unmatched.push({ description: String(want), park_reason: "not_in_pricebook" });
      continue;
    }
    for (let i = 0; i < qty; i++) lines.push({ catalogueId: hit.catalogueId, description: hit.description, rate: hit.rate });
  }

  // Nothing asked for, or anything off the price list: the whole estimate parks, priced lines attached, no total.
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

  // 8. Left in draft. The owner is alerted and releases it; this node has no way to send.
  await ports.notify(owner, job.id, `ready_to_release:${draft.id}`);
  return { outcome: "drafted", job_id: job.id, quote_id: draft.id, external_id: draft.id, state: draft.state, total_ex_gst: draft.total };
}

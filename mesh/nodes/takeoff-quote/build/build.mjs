/**
 * Takeoff Quote: one tender job in, one draft quote out. It counts the fittings
 * and measures the runs on the tender drawings attached to the job, then prices
 * that takeoff from the business's own price list and pre-builds, or parks it
 * with a reason.
 *
 * Built to AIP-BS-QUOTE-OUT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/quote-out-build-standard
 *
 * An original build. The takeoff is arithmetic, not judgement: it counts the
 * symbols on the drawings' takeoff layer and adds up the length of each run at
 * the sheet's stated scale. It does not read a picture, guess a scale, add a
 * waste allowance, or build a pre-build's price out of its parts. It never
 * sends: the draft waits in the job system for the person who owns quotes.
 *
 * HOW IT IS WOKEN. A named event, never a chat message:
 *
 *   { name: "job.created" | "job.updated", job_id: "<the job system's id>" }
 *
 * THE JOB RECORD it reads by that id carries the tender drawings, as exported
 * from the drawing set's takeoff layer (a DXF or PDF markup export):
 *   drawings  [{ sheet, revision, status, scale, symbols, runs }]
 *             sheet     the sheet number, e.g. "E-02"
 *             status    "current" | "superseded", from the drawing register
 *             scale     the drawing's ratio as a number (100 means 1:100), or null
 *             symbols   [{ block }]            one entry per symbol placed
 *             runs      [{ layer, points }]    a polyline, points in paper mm
 *
 * THE PRICE LIST it reads at draft time carries, per item: catalogueId,
 * description, rate (cents ex GST per unit), unit ("each" | "lm"), kind
 * ("part" | "prebuild"), and the takeoff key the business set on it: `symbol`
 * (a block name, counted, sold each) or `layer` (a run layer, measured, sold by
 * the lineal metre). That key is the business's own legend: the bot never
 * decides what a symbol means.
 *
 * THE TAKEOFF RULE.
 *   count   one per symbol placed on a current sheet
 *   length  the sum of each run's segment lengths in paper mm, times the sheet
 *           scale, over 1000, in metres; summed across current sheets and
 *           rounded once to the centimetre
 *   amount  quantity times the item's rate as read now. Nothing else sets a number.
 * A pre-build is priced at its own catalogue rate. One whose sell price is not
 * in the book parks: it is never rebuilt from the prices of its parts.
 *
 * THE LOOP, every time it is woken, keeping nothing between runs:
 *   1. read the job by the id the event carried (never by a name or phone)
 *   2. an open exception with an owner on the job: stop
 *   3. a variation or a discount: escalate, a person prices the negotiation
 *   4. the job already carries a quote: keep it, record duplicate_of
 *   5. read the price list now, at draft time
 *   6. drawings missing, two current revisions of one sheet, a run on a sheet
 *      with no scale, or a symbol keyed to a length item: hand back, draft nothing
 *   7. anything on the drawings the book does not price: park the whole quote
 *   8. draft into the system of record; no id back means not written: alert
 *   9. leave the draft for a person to release. There is no send here at all.
 *
 * Every port call is awaited, so the same build runs on the stub and live.
 */

export const NODE = "takeoff-quote";

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

  // 6. The drawings have to be countable before anything is counted.
  const sheets = currentSheets(job.drawings);
  if (sheets.problems.length > 0) return handBack(ports, jobId, owner, sheets.problems);

  const bySymbol = new Map();
  const byLayer = new Map();
  for (const item of book) {
    if (typeof item?.symbol === "string" && item.symbol) bySymbol.set(item.symbol, item);
    if (typeof item?.layer === "string" && item.layer) byLayer.set(item.layer, item);
  }

  // Count and measure, per takeoff key, across current sheets only.
  const counts = new Map(); // block -> { n, sheets }
  const lengths = new Map(); // layer -> { total: metres, sheets }
  const problems = [];
  for (const s of sheets.current) {
    for (const sym of Array.isArray(s.symbols) ? s.symbols : []) {
      const key = String(sym?.block ?? "");
      if (!key) continue;
      tally(counts, key, s.sheet, 1);
    }
    for (const run of Array.isArray(s.runs) ? s.runs : []) {
      const key = String(run?.layer ?? "");
      if (!key) continue;
      const paper = runLength(run.points);
      if (paper === null) {
        problems.push({ sheet: s.sheet, layer: key, problem: "takeoff_run_unreadable" });
        continue;
      }
      if (!isScale(s.scale)) {
        problems.push({ sheet: s.sheet, layer: key, problem: "takeoff_unscaled" });
        continue;
      }
      tally(lengths, key, s.sheet, (paper * s.scale) / 1000);
    }
  }
  if (problems.length > 0) return handBack(ports, jobId, owner, problems);

  // 7. Price the takeoff. Every line traces to a catalogue id, or nothing is drafted.
  const lines = [];
  const unmatched = [];
  for (const [block, c] of counts) {
    const item = bySymbol.get(block);
    if (!item) {
      unmatched.push({ description: `symbol ${block}, ${c.n} counted on ${c.sheets.join(", ")}`, park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    if (String(item.unit ?? "") !== "each") {
      problems.push({ symbol: block, catalogueId: item.catalogueId, problem: "legend_unit_mismatch", sold_by: String(item.unit ?? "") });
      continue;
    }
    if (!isRate(item.rate)) {
      unmatched.push({ description: `${item.kind === "prebuild" ? "pre-build" : "item"} ${item.catalogueId} has no sell price, ${c.n} counted on ${c.sheets.join(", ")}`, park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    lines.push(line(item, c.n, c.sheets, readAt));
  }
  for (const [layer, l] of lengths) {
    const item = byLayer.get(layer);
    const metres = Math.round(l.total * 100) / 100;
    if (!item) {
      unmatched.push({ description: `run on layer ${layer}, ${metres} m on ${l.sheets.join(", ")}`, park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    if (String(item.unit ?? "") !== "lm") {
      problems.push({ layer, catalogueId: item.catalogueId, problem: "legend_unit_mismatch", sold_by: String(item.unit ?? "") });
      continue;
    }
    if (!isRate(item.rate)) {
      unmatched.push({ description: `${item.kind === "prebuild" ? "pre-build" : "item"} ${item.catalogueId} has no sell price, ${metres} m on ${l.sheets.join(", ")}`, park_reason: PARK.NOT_IN_PRICEBOOK });
      continue;
    }
    lines.push(line(item, metres, l.sheets, readAt));
  }

  if (lines.length === 0 && unmatched.length === 0 && problems.length === 0) {
    return handBack(ports, jobId, owner, [{ problem: "takeoff_empty" }]);
  }
  if (unmatched.length > 0) {
    // The priced lines travel with the park, so a person finishes it in a minute. No total.
    await ports.escalate(PARK.NOT_IN_PRICEBOOK, detail({ job_id: jobId, owner, lines, unmatched, takeoff_problems: problems, total_ex_gst: null, pricebook_read_at: readAt }));
    return { ...parked(jobId, PARK.NOT_IN_PRICEBOOK, owner), lines, unmatched, total_ex_gst: null };
  }
  if (problems.length > 0) return handBack(ports, jobId, owner, problems);

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

/**
 * The sheets to count: status "current" only. Superseded sheets are skipped.
 * Two current revisions of one sheet number, or no drawings at all, cannot be
 * counted and go back to a person.
 */
function currentSheets(drawings) {
  const list = Array.isArray(drawings) ? drawings : [];
  const current = list.filter((d) => d && d.status === "current");
  if (current.length === 0) return { current: [], problems: [{ problem: "takeoff_missing" }] };
  const seen = new Map();
  const problems = [];
  for (const d of current) {
    const key = String(d.sheet ?? "");
    if (seen.has(key)) problems.push({ sheet: key, problem: "takeoff_revision_conflict", revisions: [seen.get(key), String(d.revision ?? "")] });
    else seen.set(key, String(d.revision ?? ""));
  }
  return { current, problems };
}

/** Paper length of a polyline in mm, or null if it is not one. */
function runLength(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let mm = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!isPoint(a) || !isPoint(b)) return null;
    mm += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return mm;
}

/** counts: add 1 to n per symbol. lengths: add metres to total. */
function tally(map, key, sheet, add) {
  const t = map.get(key) ?? { n: 0, total: 0, sheets: [] };
  t.n += 1;
  t.total += add;
  if (!t.sheets.includes(sheet)) t.sheets.push(sheet);
  map.set(key, t);
}

function line(item, quantity, sheets, readAt) {
  return {
    catalogueId: item.catalogueId,
    description: item.description,
    kind: item.kind === "prebuild" ? "prebuild" : "part",
    unit: item.unit,
    quantity,
    rate: item.rate, // the catalogue's sell-rate per unit, cents ex GST
    amount: Math.round(quantity * item.rate),
    sheets: [...sheets],
    pricebook_read_at: readAt,
  };
}

async function handBack(ports, jobId, owner, problems) {
  // Not a pricing problem: the drawings cannot be counted as they are. Nothing is guessed.
  await ports.notify(owner, jobId, `takeoff_check:${problems.map((p) => [p.sheet ?? p.symbol ?? p.layer ?? "job", p.layer && p.sheet ? p.layer : null, p.problem].filter(Boolean).join("@")).join(",")}`);
  return { outcome: "held_for_takeoff", job_id: jobId, takeoff_problems: problems, total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": "takeoff_check", "seam.exception_owner": owner } };
}

const isPoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const isScale = (s) => typeof s === "number" && Number.isFinite(s) && s > 0;
const isRate = (r) => typeof r === "number" && Number.isFinite(r) && r > 0;

function parked(jobId, reason, owner) {
  return { outcome: "parked", job_id: jobId, park_reason: reason, state: "parked", total_ex_gst: null, exception_owner: owner, seam: { "seam.job_id": jobId, "seam.status": `parked:${reason}`, "seam.exception_owner": owner } };
}

const detail = (o) => JSON.stringify(o);

/**
 * Comp Check: the comparable-price check an agent hands a vendor, built to
 * AIP-BS-PRICE-ONE-PAGER (2026-10-24).
 *
 * One run, woken for one appraisal (by its listing_id in the mesh), keeping
 * nothing between runs:
 *
 *   1. Read the written rules first, before any sale is read.
 *   2. Read the subject property from its record. A field the record does not
 *      hold stays unknown, and the rule that needs it is reported not applied.
 *   3. Read the agent's own estimate and the lowest figure they intend to quote.
 *   4. Read the recorded sales. A read older than the freshness window is read
 *      again; if it is still old, the page is marked stale and held.
 *   5. Test every sale against every rule. A sale that breaks one is excluded
 *      with the rule it broke. A sale with no source or no sale date is left
 *      off. A withheld or unverified price is listed, never used.
 *   6. The range is the lowest, median and highest verified comparable, and
 *      nothing else. Below the minimum count there is no range, and the page
 *      says how many were found against how many were needed.
 *   7. The agent's estimate sits in its own box with their name on it.
 *   8. Flags go to the agent: too few (not held), stale (held), and a quoted
 *      figure below the evidence (held, with the sales above it).
 *   9. Only an unheld version the agent approved is released to the vendor,
 *      and the record of what was shown is appended, never edited.
 *
 * It never sets the price, never sends anything unapproved, and never edits a
 * version: a correction is a new version through a new approval.
 *
 * Every port call is awaited so the same build runs against a live system.
 */

const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** The first written rule a sale breaks, or null. Only rules the subject can support are applied. */
export function ruleBroken(sale, subject, rules, now) {
  if (sale.distanceKm > rules.maxDistanceKm) return "distance";
  if (sale.soldOn && (now.getTime() - new Date(sale.soldOn).getTime()) / MONTH > rules.maxAgeMonths) return "recency";
  if (rules.sameType && sale.type !== subject.type) return "type";
  if (subject.beds !== undefined && sale.beds !== undefined && Math.abs(sale.beds - subject.beds) > rules.bedsBand) return "beds";
  if (subject.landSqm !== undefined && sale.landSqm !== undefined) {
    const band = (subject.landSqm * rules.landBandPct) / 100;
    if (Math.abs(sale.landSqm - subject.landSqm) > band) return "land";
  }
  return null;
}

/**
 * @param {import("@aipathway/conformance").PricePorts} ports
 * @param {{ vendor?: string }} [opts]
 */
export async function build(ports, opts = {}) {
  const vendor = opts.vendor ?? "the vendor named on the listing";

  // 1. Rules before sales. They are printed on the page exactly as read.
  const rules = await ports.readRules();
  // 2. The subject from its record. Unknown stays unknown.
  const subject = await ports.readSubject();
  const rulesNotApplied = [];
  if (subject.beds === undefined || subject.beds === null) rulesNotApplied.push("beds");
  if (subject.landSqm === undefined || subject.landSqm === null) rulesNotApplied.push("land");
  // 3. The agent's own inputs, kept apart from the evidence.
  const appraisal = await ports.readAppraisal();

  // 4. The sales, read again if the last read is older than the window.
  const now = await ports.now();
  const isStale = (rows) => rows.some((s) => now.getTime() - new Date(s.readAt).getTime() > rules.freshnessDays * DAY);
  let pool = await ports.readSales();
  if (isStale(pool)) pool = await ports.refreshSales();
  const stale = isStale(pool);
  const readAt = pool.length ? pool.map((s) => s.readAt).sort()[0] : now.toISOString();

  // 5. Every sale against every rule, then source and date, then price status.
  const comparables = [];
  const listedNotUsed = [];
  const excluded = [];
  for (const s of pool) {
    const broke = ruleBroken(s, subject, rules, now);
    if (broke) excluded.push({ saleId: s.id, rule: broke });
    else if (!s.source) excluded.push({ saleId: s.id, rule: "no_source" });
    else if (!s.soldOn) excluded.push({ saleId: s.id, rule: "no_date" });
    else if (s.priceStatus !== "verified" || typeof s.price !== "number") {
      listedNotUsed.push({ saleId: s.id, status: s.priceStatus === "verified" ? "unverified" : s.priceStatus });
    } else {
      comparables.push({ saleId: s.id, address: s.address, price: s.price, soldOn: s.soldOn, source: s.source, readAt: s.readAt });
    }
  }
  await ports.select(
    comparables.map((c) => c.saleId),
    excluded,
  );
  for (const c of comparables) await ports.cite(c.saleId, c.source, c.soldOn, c.readAt);

  // 6. The range is arithmetic on the comparables, or there is none.
  const prices = comparables.map((c) => c.price);
  const enough = prices.length >= rules.minCount;
  const range = enough ? { low: Math.min(...prices), median: median(prices), high: Math.max(...prices) } : null;

  // 7. The agent's estimate, in its own box.
  const draft = {
    subject,
    rules,
    rulesNotApplied,
    comparables,
    listedNotUsed,
    excluded,
    range,
    ...(enough ? {} : { tooFew: { found: prices.length, needed: rules.minCount } }),
    ...(appraisal.estimate ? { agentEstimate: { agent: appraisal.agent, low: appraisal.estimate.low, high: appraisal.estimate.high } } : {}),
    ...(typeof appraisal.quoted === "number" ? { quoted: appraisal.quoted } : {}),
    readAt,
    stale,
  };
  const { version } = await ports.draft(draft);

  // 8. Flags for the agent, before anything reaches the vendor.
  let held = false;
  if (!enough) {
    await ports.notifyAgent(version, "too_few", `${prices.length} verified comparable(s) found; the rules need ${rules.minCount}. No range.`, comparables.map((c) => c.saleId));
  }
  if (stale) {
    await ports.notifyAgent(version, "stale", `Sales were read on ${readAt}, outside the ${rules.freshnessDays}-day window.`, []);
    await ports.hold(version, "stale");
    held = true;
  }
  const lowest = prices.length ? Math.min(...prices) : undefined;
  if (typeof appraisal.quoted === "number" && lowest !== undefined && appraisal.quoted < lowest) {
    const above = comparables.filter((c) => c.price > appraisal.quoted).map((c) => c.saleId);
    await ports.notifyAgent(version, "underquote", `Quoted figure ${appraisal.quoted} sits below the lowest comparable ${lowest}.`, above);
    await ports.hold(version, "underquote");
    held = true;
  }
  if (held) return { version, released: false, held: true };

  // 9. The agent approves this exact version, or nothing goes.
  const approval = await ports.requestApproval(version);
  if (!approval.approved || !approval.by) return { version, released: false, held: false };
  const sent = await ports.release(version, vendor);
  if (!sent.released) return { version, released: false, held: false };

  await ports.keepRecord({
    version,
    property: subject.address,
    releasedTo: vendor,
    releasedOn: (await ports.now()).toISOString(),
    approvedBy: approval.by,
    comparables,
    range,
    ...(draft.agentEstimate ? { agentEstimate: draft.agentEstimate } : {}),
  });
  return { version, released: true, held: false };
}

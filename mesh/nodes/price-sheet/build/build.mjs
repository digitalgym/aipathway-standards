/**
 * Price Sheet: the vendor price one-pager, built to AIP-BS-PRICE-ONE-PAGER 2026-10-24.
 * https://aipathway.com.au/explore-ai/price-one-pager-build-standard
 *
 * A port of "CMA Specialist Bot" by Daniel Ledo, reimplemented from the
 * standard and the bot's one-line public description only. Nothing here is
 * taken from the original bot's prompt, instructions or workflow. The port is
 * narrower than the original: it drafts the page and holds it for the agent;
 * it never sends a price to a vendor on its own.
 *
 * What one run does, every time it is woken (schedule.tick listing the
 * appraisals booked, or exception.closed for one listing_id):
 *
 *   0. If an exception with a named owner is open on the record, do nothing.
 *   1. Read the selection rules, before anything else.
 *   2. Read the subject property from its record. A field it does not hold
 *      stays unknown, and any rule that needs it is reported as not applied.
 *   3. Read the agent's own appraisal inputs (estimate, lowest quoted figure).
 *   4. Read the sales. Older than the freshness window: read again. If the
 *      read is still old, the page is marked stale and held.
 *   5. Test every sale against every rule. Left off with a reason: no source,
 *      no sale date, or the rule it broke. Listed, never used: withheld or
 *      unverified prices.
 *   6. Range = lowest, median, highest verified comparable. Below the minimum
 *      count there is no range, and the page says found against needed.
 *   7. Write the draft as a new version. The agent's estimate sits apart,
 *      with their name on it.
 *   8. Flags to the agent: too few (no hold), quoted below the evidence (held,
 *      with the sales above the figure), stale (held).
 *   9. Not held: ask the agent to approve that exact version. Approved: release
 *      it and append the record of what was shown. Not approved: nothing goes.
 *
 * Every effect goes through the ports. Nothing is kept between runs: a
 * correction is simply the next run, which writes the next version and needs
 * its own approval.
 */

const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

/** The order rules are tested in. The first one a sale breaks is the one reported. */
export const RULE_ORDER = ["distance", "recency", "type", "beds", "land"];

/** Which stated rule a sale breaks, or null. A rule whose subject field is unknown is not applied. */
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

/** Median of verified prices, the middle pair averaged to the dollar. No other adjustment. */
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Choose the comparables. Pure: the same rules and pool always give the same page. */
export function choose(subject, rules, pool, now) {
  const comparables = [];
  const listedNotUsed = [];
  const excluded = [];
  for (const s of pool) {
    if (!s.source) {
      excluded.push({ saleId: s.id, rule: "no_source" });
      continue;
    }
    if (!s.soldOn) {
      excluded.push({ saleId: s.id, rule: "no_date" });
      continue;
    }
    const broke = ruleBroken(s, subject, rules, now);
    if (broke) {
      excluded.push({ saleId: s.id, rule: broke });
      continue;
    }
    if (s.priceStatus !== "verified" || typeof s.price !== "number") {
      listedNotUsed.push({ saleId: s.id, status: s.priceStatus === "verified" ? "unverified" : s.priceStatus });
      continue;
    }
    comparables.push({ saleId: s.id, address: s.address, price: s.price, soldOn: s.soldOn, source: s.source, readAt: s.readAt });
  }
  return { comparables, listedNotUsed, excluded };
}

const isStale = (readAt, rules, now) => now.getTime() - new Date(readAt).getTime() > rules.freshnessDays * DAY;

/**
 * @param {import("@aipathway/conformance").PricePorts} ports
 * @param {{ exceptionOpen?: { owner: string } | null, releaseTo?: string, edit?: (draft: object) => object }} [config]
 *   exceptionOpen: an open exception on the record, read by the caller from the exception desk; the run stops.
 *   releaseTo: who the vendor is, from the record.
 *   edit: the agent's change to the page before it is built again (a correction). It makes a new version.
 */
export async function build(ports, config = {}) {
  // 0. The team contract: an open exception with a named owner stops the chain.
  if (config.exceptionOpen?.owner) return { halted: true, owner: config.exceptionOpen.owner };

  // 1. Rules first. Read before a single sale, and printed on the page as read.
  const rules = await ports.readRules();

  // 2. The subject, from its record. Unknown stays unknown.
  const subject = await ports.readSubject();
  const rulesNotApplied = [];
  if (subject.beds === undefined || subject.beds === null) rulesNotApplied.push("beds");
  if (subject.landSqm === undefined || subject.landSqm === null) rulesNotApplied.push("land");

  // 3. The agent's own inputs. Judgement, never evidence.
  const appraisal = await ports.readAppraisal();

  // 4. The sales, and how fresh the read is.
  let now = await ports.now();
  let pool = await ports.readSales();
  let readAt = pool[0]?.readAt ?? now.toISOString();
  if (pool.length && isStale(readAt, rules, now)) {
    pool = await ports.refreshSales();
    readAt = pool[0]?.readAt ?? readAt;
  }
  now = await ports.now();
  const stale = pool.length > 0 && isStale(readAt, rules, now);

  // 5. Every sale against every rule.
  const { comparables, listedNotUsed, excluded } = choose(subject, rules, pool, now);
  await ports.select(
    comparables.map((c) => c.saleId),
    excluded,
  );
  for (const c of comparables) await ports.cite(c.saleId, c.source, c.soldOn, c.readAt);

  // 6. The range: arithmetic on verified comparables, nothing else.
  const prices = comparables.map((c) => c.price);
  const enough = prices.length >= rules.minCount;
  const range = enough ? { low: Math.min(...prices), median: median(prices), high: Math.max(...prices) } : null;

  // 7. The draft, a new version every time.
  let page = {
    subject: { ...subject },
    rules: { ...rules },
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
  if (typeof config.edit === "function") page = config.edit(structuredClone(page));
  const { version } = await ports.draft(page);

  // 8. The flags, to the agent, before anything reaches the vendor.
  let held = false;
  if (!enough) {
    await ports.notifyAgent(version, "too_few", `${prices.length} comparable(s) found, ${rules.minCount} needed. No range on the page.`, comparables.map((c) => c.saleId));
  }
  if (range && typeof page.quoted === "number" && page.quoted < range.low) {
    const above = page.comparables.filter((c) => c.price > page.quoted).map((c) => c.saleId);
    await ports.notifyAgent(version, "underquote", `Quoted from ${page.quoted} sits below the lowest comparable, ${range.low}.`, above);
    await ports.hold(version, "underquote: quoted figure below the evidence; revise, or approve with a reason");
    held = true;
  }
  if (stale) {
    await ports.notifyAgent(version, "stale", `Sales last read ${readAt}, older than ${rules.freshnessDays} days.`, []);
    await ports.hold(version, `stale: sales read ${readAt}`);
    held = true;
  }
  if (held) return { version, held: true };

  // 9. The agent approves this exact version, or nothing goes.
  const approval = await ports.requestApproval(version);
  if (!approval.approved || !approval.by) return { version, approved: false };

  const to = config.releaseTo ?? "the vendor";
  const sent = await ports.release(version, to);
  if (!sent.released) return { version, released: false, why: sent.why };

  const releasedOn = (await ports.now()).toISOString();
  await ports.keepRecord({
    version,
    property: page.subject.address,
    releasedTo: to,
    releasedOn,
    approvedBy: approval.by,
    comparables: structuredClone(page.comparables),
    range: page.range ? { ...page.range } : null,
    ...(page.agentEstimate ? { agentEstimate: { ...page.agentEstimate } } : {}),
  });
  return { version, released: true };
}

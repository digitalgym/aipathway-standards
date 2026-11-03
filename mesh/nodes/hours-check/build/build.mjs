/**
 * Hours Check: the build, to AIP-BS-TIMESHEET-CHECK 2026-10-03.
 *
 * Woken when a pay period closes (or on a schedule), it reads the period, the
 * people, the roster, the allocations, the entries and the award editions, all
 * through the ports, and then:
 *
 *   1. traces every entry to a person, a day and a job that person was
 *      allocated, or raises an anomaly;
 *   2. raises the rest of the closed list (overlap, over_hours, missing_break,
 *      not_rostered, rule_unclear), each with a named owner;
 *   3. writes a card for every penalty or overtime applied, from the award
 *      edition in force on the entry's date, and parks what no edition plainly
 *      covers. It never chooses between clauses;
 *   4. takes an anomaly out of the queue only when a person has decided it,
 *      with that person's name and reason, and attaches the decision;
 *   5. releases and exports only when a named person has released and the
 *      queue is empty, keyed to the period so a rerun updates, never duplicates;
 *   6. publishes the period report every run, clean or not.
 *
 * It keeps nothing between runs. Everything it needs is read back from the
 * ports, so a retried wake makes no second anomaly, card or export.
 */

/** The closed list. A new kind is a change to the standard, not to this file. */
export const ANOMALY_KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];

/**
 * The business's own settings. These are the business's numbers, not the
 * award's: the award's numbers live in the rule store with an edition.
 */
export const DEFAULTS = {
  // More hours than this in one day is an over_hours anomaly.
  dailyLimitHours: 10,
  // An entry longer than this with no break is a missing_break anomaly.
  breakRequiredAfterHours: 5,
  // Hours beyond this on a weekday attract the overtime situation, which only
  // an award edition in the rule store can turn into a card.
  ordinaryDailyHours: 8,
  owners: {
    roster: "Office Manager",
    award: "Payroll Officer",
    // Who owns an entry on a job nobody allocated, per job, with a fallback.
    jobs: {},
    jobFallback: "Construction Administrator",
  },
};

const mins = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hoursOf = (e) => Math.round(((mins(e.end) - mins(e.start) - e.breakMinutes) / 60) * 100) / 100;
const spanHours = (e) => (mins(e.end) - mins(e.start)) / 60;
const dow = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
const overlaps = (a, b) => a.id !== b.id && a.personId === b.personId && a.date === b.date && a.start < b.end && b.start < a.end;
const round2 = (n) => Math.round(n * 100) / 100;

/** The award situations an entry plainly attracts, by its date and length. */
function topicsFor(entry, cfg) {
  const t = [];
  const d = dow(entry.date);
  if (d === 6) t.push("saturday");
  else if (d === 0) t.push("sunday");
  else if (hoursOf(entry) > cfg.ordinaryDailyHours) t.push("overtime_daily");
  return t;
}

/** Editions in force on a date: effective by then, not ended, not retired before it. */
function inForce(rules, date) {
  return rules.filter((r) => {
    if (r.effectiveFrom > date) return false;
    if (r.effectiveTo && r.effectiveTo < date) return false;
    if (r.retired && !r.effectiveTo) return false;
    return true;
  });
}

/**
 * @param {import("@aipathway/conformance").Ports} ports
 * @param {Partial<typeof DEFAULTS>} [settings]
 */
export function build(ports, settings = {}) {
  const cfg = { ...DEFAULTS, ...settings, owners: { ...DEFAULTS.owners, ...(settings.owners ?? {}) } };

  // ── Read everything first, by id, before any anomaly is raised. ──
  const period = ports.readPeriod();
  const people = ports.readPeople();
  const allocations = ports.readAllocations();
  const roster = ports.readRoster();
  const entries = ports.readEntries(period.id);
  const rules = ports.readRules();
  const queue = ports.readAnomalies(period.id);

  const personById = new Map(people.map((p) => [p.id, p]));
  const allocated = new Set(allocations.map((a) => `${a.personId}|${a.jobId}|${a.date}`));
  const rostered = new Set(roster.filter((r) => r.rostered).map((r) => `${r.personId}|${r.date}`));
  const raisedKey = new Set(queue.map((a) => `${a.entryId}|${a.kind}`));
  const anomalies = [...queue];

  const supervisorOf = (e) => personById.get(e.personId)?.supervisor || cfg.owners.roster;
  const jobOwnerOf = (e) => (e.jobId && cfg.owners.jobs[e.jobId]) || cfg.owners.jobFallback;

  // Idempotent: one anomaly per entry and kind, whatever the number of runs.
  const raise = (entry, kind, owner) => {
    const key = `${entry.id}|${kind}`;
    if (raisedKey.has(key)) return;
    raisedKey.add(key);
    anomalies.push(ports.raiseAnomaly({ entryId: entry.id, kind, owner }));
  };

  // ── Trace, then the rest of the closed list, then the rule. ──
  const dayHours = new Map();
  for (const e of entries) {
    const k = `${e.personId}|${e.date}`;
    dayHours.set(k, round2((dayHours.get(k) ?? 0) + hoursOf(e)));
  }

  const cardsWanted = [];
  for (const e of entries) {
    // Check 1: a person from the contact list, a day, and an allocated job.
    if (!personById.has(e.personId) || !e.jobId || !allocated.has(`${e.personId}|${e.jobId}|${e.date}`)) {
      raise(e, "not_allocated", jobOwnerOf(e));
    }
    if (!rostered.has(`${e.personId}|${e.date}`)) raise(e, "not_rostered", cfg.owners.roster);
    if (entries.some((o) => overlaps(e, o))) raise(e, "overlap", supervisorOf(e));
    if ((dayHours.get(`${e.personId}|${e.date}`) ?? 0) > cfg.dailyLimitHours) raise(e, "over_hours", supervisorOf(e));
    if (spanHours(e) > cfg.breakRequiredAfterHours && e.breakMinutes === 0) raise(e, "missing_break", supervisorOf(e));

    // Checks 4 to 6: read the dated rule; never interpret it.
    const live = inForce(rules, e.date);
    const plainlyCovered = (situation) => live.filter((r) => r.covers.includes(situation));
    let unclear = false;
    for (const flag of e.flags ?? []) {
      if (plainlyCovered(flag).length !== 1) unclear = true;
    }
    const cards = [];
    for (const topic of topicsFor(e, cfg)) {
      const covering = plainlyCovered(topic);
      // None, or two editions both claiming the day: a person decides, not us.
      if (covering.length !== 1) unclear = true;
      else cards.push({ topic, rule: covering[0] });
    }
    if (unclear) raise(e, "rule_unclear", cfg.owners.award);
    else cardsWanted.push({ entry: e, cards });
  }

  // Cards already written this period, read back by person, so a rerun adds none.
  const existingCards = new Set();
  for (const pid of new Set(entries.map((e) => e.personId))) {
    for (const c of ports.readRecord(pid, period.id).cards) existingCards.add(`${c.entryId}|${c.ruleId}|${c.edition}`);
  }
  const topicsByEntry = new Map();
  for (const { entry, cards } of cardsWanted) {
    topicsByEntry.set(entry.id, cards.map((c) => c.topic));
    for (const { rule } of cards) {
      const key = `${entry.id}|${rule.id}|${rule.edition}`;
      if (existingCards.has(key)) continue;
      existingCards.add(key);
      ports.cite({ entryId: entry.id, ruleId: rule.id, edition: rule.edition, effectiveFrom: rule.effectiveFrom });
    }
  }

  // ── Check 7: out of the queue only on a person's decision, with evidence. ──
  for (const a of anomalies) {
    if (a.resolution || !a.decision || !a.decision.by) continue;
    ports.attachEvidence(a.id, `decision by ${a.decision.by}: ${a.decision.reason} at ${a.decision.at}`);
    ports.resolveAnomaly(a.id, { by: a.decision.by, reason: a.decision.reason });
    a.resolution = { by: a.decision.by, reason: a.decision.reason, at: ports.now().toISOString() };
  }

  // ── Lines and totals, computed from entries. ──
  const byEntry = new Map();
  for (const a of anomalies) byEntry.set(a.entryId, [...(byEntry.get(a.entryId) ?? []), a]);
  const lines = [];
  for (const e of entries) {
    const own = byEntry.get(e.id) ?? [];
    if (own.some((a) => !a.resolution)) continue; // waits in front of its owner
    if (own.some((a) => a.resolution.reason === "rejected")) continue; // a person said no
    lines.push({ entryId: e.id, personId: e.personId, date: e.date, jobId: e.jobId, hours: hoursOf(e), topics: topicsByEntry.get(e.id) ?? [] });
  }
  const totals = [];
  const group = (keyOf) => {
    const m = new Map();
    for (const l of lines) {
      const k = keyOf(l);
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  };
  for (const ls of group((l) => `${l.personId}|${l.date}`).values()) {
    totals.push({ personId: ls[0].personId, date: ls[0].date, hours: round2(ls.reduce((s, l) => s + l.hours, 0)), entryIds: ls.map((l) => l.entryId) });
  }
  for (const ls of group((l) => l.personId).values()) {
    totals.push({ personId: ls[0].personId, date: null, hours: round2(ls.reduce((s, l) => s + l.hours, 0)), entryIds: ls.map((l) => l.entryId) });
  }

  // ── Check 8 and 9: a named release, an empty queue, one export per period. ──
  const open = anomalies.filter((a) => !a.resolution).length;
  const asked = period.releaseRequested?.by ?? null;
  let released = period.releasedBy ?? null;
  let externalId = period.exportExternalId ?? null;
  if (asked && open === 0) {
    if (released !== asked) {
      ports.releasePeriod(period.id, { person: asked });
      released = asked;
    }
    const existing = ports.readExport(period.id);
    const same =
      existing &&
      existing.releasedBy === released &&
      JSON.stringify(existing.lines) === JSON.stringify(lines) &&
      JSON.stringify(existing.totals) === JSON.stringify(totals);
    if (!same) {
      const written = ports.writeExport({ ...(existing ? { exportId: existing.id } : {}), periodId: period.id, lines, totals, releasedBy: released });
      // A null id is a failed export, never a success.
      externalId = written?.externalId ?? null;
    } else {
      externalId = existing.externalId;
    }
  }

  // ── Check 10: publish every run, a clean period included. ──
  ports.publishReport({
    periodId: period.id,
    lines,
    totals,
    anomaliesFound: anomalies.length,
    anomaliesResolved: anomalies.filter((a) => a.resolution).length,
    release: released,
    exportExternalId: externalId,
  });
}

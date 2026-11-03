/**
 * Hours Audit: the weekly timecard check before the pay run, built to
 * AIP-BS-TIMESHEET-CHECK 2026-10-03
 * (https://aipathway.com.au/explore-ai/timesheet-check-build-standard).
 *
 * In production the ports read Square Team (team members, scheduled shifts
 * with the job each shift is for, and timecards), the business's own rule
 * store (award editions as dated rows), and the payroll system the business
 * runs in Australia, which hands back its own batch id. On the stub they are
 * the conformance runner's TimesheetWorld.
 *
 * One run, woken weekly (schedule.tick) or when an owner closes an anomaly
 * (exception.closed):
 *
 *   1. Read the period, the people, the roster, the allocations, the rules and
 *      the anomaly queue. Nothing is remembered between runs.
 *   2. Trace every entry to a person, a day and a job they were allocated.
 *      Anything that does not trace, or looks wrong, goes in the queue as one
 *      of the six kinds, with the owner the standard names. Never twice.
 *   3. Carry a person's decision from the queue onto the anomaly, with their
 *      name, their reason and the decision attached as evidence. The build
 *      never decides one.
 *   4. For a traced entry with nothing open, read the edition in force for its
 *      date and write one card per situation it plainly covers. A situation it
 *      does not plainly name is parked as rule_unclear. No clause is chosen.
 *   5. Compute daily and weekly totals from the lines, each naming its entries.
 *   6. If a named person released the period and nothing is open, write one
 *      export keyed to the period (update it if it already exists, and only
 *      if it changed). Otherwise write nothing to payroll.
 *   7. Publish the period report, clean or not.
 *
 * It never pays anyone, never picks an award, and never clears an anomaly.
 */

// Pure helpers. The build depends on nothing but the ports it is handed.
const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** Hours on an entry after its break, computed, never typed. */
const hoursOf = (e) => Math.round(((minutesOf(e.end) - minutesOf(e.start) - (e.breakMinutes ?? 0)) / 60) * 100) / 100;
/** 0 is Sunday, 6 is Saturday. */
const dayOfWeek = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
/** Two entries for one person on one day that share a minute. */
const overlaps = (a, b) => a.personId === b.personId && a.date === b.date && a.start < b.end && b.start < a.end;

export const KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];

/** The business's own settings. Read from its config sheet in production. */
export const DEFAULT_CONFIG = {
  // The business's own limit on hours in one day (over_hours).
  dailyLimitHours: 10,
  // Ordinary hours in a day before the overtime situation arises. Whether
  // overtime applies is still the edition's to say, through its covers[].
  ordinaryDailyHours: 8,
  // A long entry with no break recorded (missing_break).
  breakRequiredAfterHours: 5,
  // Owners the standard names for the kinds a supervisor does not own.
  rosterKeeper: "Dana Price, roster keeper",
  awardOwner: "Sam Lee, owner (answers for the award)",
  jobOwners: {},
  defaultJobOwner: "Sam Lee, owner",
};

const round2 = (n) => Math.round(n * 100) / 100;

/** The situations an entry raises for the rule store to name or not. */
function situationsOf(entry, hours, cfg) {
  const s = [];
  if (hours > cfg.ordinaryDailyHours) s.push("overtime_daily");
  const dow = dayOfWeek(entry.date);
  if (dow === 6) s.push("saturday");
  if (dow === 0) s.push("sunday");
  // Whatever the capture app flagged is a situation too. Mapped, never adopted
  // as a kind: it either is plainly covered by the edition or it is parked.
  for (const f of entry.flags ?? []) s.push(f);
  return s;
}

/** The edition whose effective window holds the date. Never a fallback. */
function editionFor(rules, date) {
  const inForce = rules.filter((r) => r.effectiveFrom.slice(0, 10) <= date && (r.effectiveTo === null || date <= r.effectiveTo.slice(0, 10)));
  // Two editions claiming one date is itself unclear; do not pick between them.
  return inForce.length === 1 ? inForce[0] : null;
}

/**
 * @param {import("@aipathway/conformance").TimesheetPorts} ports
 * @param {Partial<typeof DEFAULT_CONFIG>} [config]
 */
export async function build(ports, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config, jobOwners: { ...DEFAULT_CONFIG.jobOwners, ...(config.jobOwners ?? {}) } };

  // 1. Read everything by id. Nothing carried over from a previous run.
  const period = await ports.readPeriod();
  const people = await ports.readPeople();
  const roster = await ports.readRoster();
  const allocations = await ports.readAllocations();
  const entries = await ports.readEntries(period.id);
  const rules = await ports.readRules();
  const queue = await ports.readAnomalies(period.id);

  const personById = new Map(people.map((p) => [p.id, p]));
  const supervisorOf = (personId) => personById.get(personId)?.supervisor || cfg.defaultJobOwner;
  const jobOwnerOf = (jobId) => (jobId && cfg.jobOwners[jobId]) || cfg.defaultJobOwner;
  const ownerFor = (kind, entry) => {
    switch (kind) {
      case "over_hours":
      case "overlap":
      case "missing_break":
        return supervisorOf(entry.personId);
      case "not_rostered":
        return cfg.rosterKeeper;
      case "not_allocated":
        return jobOwnerOf(entry.jobId);
      case "rule_unclear":
        return cfg.awardOwner;
      default:
        return null;
    }
  };

  // Cards already written, so a second run never writes a second card.
  const existingCards = new Set();
  for (const personId of new Set(entries.map((e) => e.personId))) {
    const rec = await ports.readRecord(personId, period.id);
    for (const c of rec.cards ?? []) existingCards.add(`${c.entryId}|${c.ruleId}`);
  }

  const anomalies = queue.map((a) => ({ ...a }));
  const has = (entryId, kind) => anomalies.some((a) => a.entryId === entryId && a.kind === kind);
  const raise = async (entry, kind) => {
    if (!KINDS.includes(kind) || has(entry.id, kind)) return;
    const owner = ownerFor(kind, entry);
    if (!owner) return;
    const a = await ports.raiseAnomaly({ entryId: entry.id, kind, owner });
    anomalies.push(a ?? { id: null, entryId: entry.id, kind, owner, decision: null, resolution: null, evidence: [] });
  };

  // 2. Trace. Every entry against the people, the roster and the allocations.
  const hours = new Map(entries.map((e) => [e.id, hoursOf(e)]));
  const dayHours = new Map();
  for (const e of entries) {
    const k = `${e.personId}|${e.date}`;
    dayHours.set(k, round2((dayHours.get(k) ?? 0) + hours.get(e.id)));
  }
  for (const e of entries) {
    const known = personById.has(e.personId);
    const allocated =
      known && e.jobId !== null && allocations.some((a) => a.personId === e.personId && a.jobId === e.jobId && a.date === e.date);
    if (!allocated) await raise(e, "not_allocated");
    const rostered = roster.some((r) => r.personId === e.personId && r.date === e.date && r.rostered === true);
    if (!rostered) await raise(e, "not_rostered");
    if (entries.some((o) => o.id !== e.id && overlaps(e, o))) await raise(e, "overlap");
    if (dayHours.get(`${e.personId}|${e.date}`) > cfg.dailyLimitHours) await raise(e, "over_hours");
    if (hours.get(e.id) > cfg.breakRequiredAfterHours && (e.breakMinutes ?? 0) <= 0) await raise(e, "missing_break");
  }

  const isOpen = (a) => a.resolution === null || a.resolution === undefined;

  // 3. Carry a person's decision onto the anomaly. Never decide one.
  for (const a of anomalies) {
    if (!isOpen(a) || !a.id || !a.decision || !a.decision.by) continue;
    if (!["approved", "corrected", "rejected"].includes(a.decision.reason)) continue;
    await ports.resolveAnomaly(a.id, { by: a.decision.by, reason: a.decision.reason });
    await ports.attachEvidence(a.id, `decision by ${a.decision.by}: ${a.decision.reason} at ${a.decision.at}`);
    a.resolution = { by: a.decision.by, reason: a.decision.reason, at: a.decision.at };
  }

  // 4. Read the rule, write the card. Only for an entry with nothing open.
  const topics = new Map();
  for (const e of entries) {
    const mine = anomalies.filter((a) => a.entryId === e.id);
    if (mine.some(isOpen)) continue;
    // A rejected entry is not a line, and not a card.
    if (mine.some((a) => (a.decision?.reason ?? a.resolution?.reason) === "rejected")) continue;
    const situations = situationsOf(e, hours.get(e.id), cfg);
    if (situations.length === 0) {
      topics.set(e.id, []);
      continue;
    }
    const edition = editionFor(rules, e.date);
    const covered = edition ? situations.filter((s) => edition.covers.includes(s)) : [];
    const uncovered = situations.filter((s) => !covered.includes(s));
    // A rule_unclear a person already decided stays decided: the uncovered
    // situation is not applied, and is never re-raised.
    if (uncovered.length > 0 && !has(e.id, "rule_unclear")) {
      await raise(e, "rule_unclear");
      continue;
    }
    if (covered.length > 0 && !existingCards.has(`${e.id}|${edition.id}`)) {
      await ports.cite({ entryId: e.id, ruleId: edition.id, edition: edition.edition, effectiveFrom: edition.effectiveFrom });
      existingCards.add(`${e.id}|${edition.id}`);
    }
    topics.set(e.id, covered);
  }

  // 5. Lines and totals, from traced entries only.
  const lines = entries
    .filter((e) => topics.has(e.id) && !anomalies.some((a) => a.entryId === e.id && isOpen(a)))
    .map((e) => ({ entryId: e.id, personId: e.personId, date: e.date, jobId: e.jobId, hours: hours.get(e.id), topics: [...topics.get(e.id)] }));
  const totals = [];
  const byPerson = new Map();
  for (const l of lines) {
    if (!byPerson.has(l.personId)) byPerson.set(l.personId, []);
    byPerson.get(l.personId).push(l);
  }
  for (const [personId, ls] of byPerson) {
    const byDay = new Map();
    for (const l of ls) {
      if (!byDay.has(l.date)) byDay.set(l.date, []);
      byDay.get(l.date).push(l);
    }
    for (const [date, dls] of [...byDay].sort()) {
      totals.push({ personId, date, hours: round2(dls.reduce((n, l) => n + l.hours, 0)), entryIds: dls.map((l) => l.entryId) });
    }
    totals.push({ personId, date: null, hours: round2(ls.reduce((n, l) => n + l.hours, 0)), entryIds: ls.map((l) => l.entryId) });
  }

  // 6. The release, then one export. An open anomaly stops the chain.
  const open = anomalies.filter(isOpen);
  const found = anomalies.length;
  const resolved = found - open.length;
  let releasedBy = period.releasedBy ?? null;
  let externalId = period.exportExternalId ?? null;
  const requestedBy = period.releaseRequested?.by ?? null;
  if (requestedBy && open.length === 0) {
    if (releasedBy !== requestedBy) {
      await ports.releasePeriod(period.id, { person: requestedBy });
      releasedBy = requestedBy;
    }
    const existing = await ports.readExport(period.id);
    const same =
      existing &&
      existing.releasedBy === releasedBy &&
      JSON.stringify(existing.lines) === JSON.stringify(lines) &&
      JSON.stringify(existing.totals) === JSON.stringify(totals);
    if (existing && existing.externalId) {
      if (!same) {
        const x = await ports.writeExport({ exportId: existing.id, periodId: period.id, lines, totals, releasedBy });
        externalId = x?.externalId ?? null;
      } else {
        externalId = existing.externalId;
      }
    } else if (!existing) {
      const x = await ports.writeExport({ periodId: period.id, lines, totals, releasedBy });
      // No id back means nothing was exported.
      externalId = x?.externalId ?? null;
    }
  }

  // 7. Publish, clean or not, so silence never means clean.
  await ports.publishReport({
    periodId: period.id,
    lines,
    totals,
    anomaliesFound: found,
    anomaliesResolved: resolved,
    release: releasedBy,
    exportExternalId: externalId,
  });
}

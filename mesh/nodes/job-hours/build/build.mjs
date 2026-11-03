/**
 * Job Hours: field-tech hours checked against the jobs they were booked to,
 * built to AIP-BS-TIMESHEET-CHECK 2026-10-03.
 * https://aipathway.com.au/explore-ai/timesheet-check-build-standard
 *
 * A port of "Kairos · Timesheet Manager" by ᑕᕼIᑕᗩᘜO MAGA, narrowed to one job:
 * the hours. Only the timesheet check is ported. The original's after-call
 * closeout, work digests and customer review requests are not. Nothing here is taken from the
 * original bot's prompt or instructions; it is reimplemented from the standard.
 *
 * What one run does, every time it is woken (schedule.tick when the pay week
 * closes, job.completed when a tech closes a job, exception.closed when the
 * owner of an anomaly decides it):
 *
 *   1. Read the period, the people, the allocations, the roster and the rule
 *      store, fresh. Nothing is carried from the last run.
 *   2. Read the anomaly queue. Any anomaly a named person has decided is
 *      resolved with that person's name and reason, and the decision is
 *      attached as evidence. Nothing is resolved that a person did not decide.
 *   3. Trace every entry to a person, a day and a job that person was
 *      allocated on that day. Then the other five kinds from the closed list,
 *      each raised once per entry and kind, with the person who owns it.
 *   4. Work out which rule situations each entry attracts (daily overtime,
 *      Saturday, Sunday, anything the capture app flagged) and find the one
 *      edition in force on that date that plainly covers each. None, or more
 *      than one, parks the entry as rule_unclear. The build never picks.
 *   5. An entry is a line only when every anomaly on it is resolved and none
 *      was rejected. Lines get their cards; totals are summed from the lines
 *      and list the entry ids they sum.
 *   6. Export only when a named person has released the period and the queue
 *      is at zero. The export is read back by period first: an existing one is
 *      updated (or left alone when nothing changed), never written twice. A
 *      null external id is a failed export.
 *   7. Publish the period report every run, a clean one included.
 *
 * Every effect goes through the ports. The anomaly queue, the cards, the
 * release and the export id live in the job and payroll systems, not here.
 */

/** The business's own daily limit, above which a day is over_hours. */
export const DAILY_LIMIT_HOURS = 10;

/** Daily overtime starts after this many worked hours on a weekday. */
export const OVERTIME_AFTER_HOURS = 8;

/** A shift longer than this, with no break recorded, is a missing break. */
export const BREAK_AFTER_HOURS = 5;

/**
 * Who owns the anomalies that are not the supervisor's. In production these
 * are read from the business's settings; the build never leaves one empty.
 */
export const DEFAULT_OWNERS = {
  roster: "Roster keeper",
  award: "Award owner",
  /** Per job_id, where the job system names one. */
  jobs: {},
  /** When the job system names no owner for a job. */
  jobFallback: "Operations manager",
};

const minutesOf = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Hours after the break, to two decimals. Same arithmetic as the stub's hoursOf. */
export const hoursOf = (e) => Math.round(((minutesOf(e.end) - minutesOf(e.start) - e.breakMinutes) / 60) * 100) / 100;

const grossHours = (e) => (minutesOf(e.end) - minutesOf(e.start)) / 60;

const weekday = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

const overlap = (a, b) => a.personId === b.personId && a.date === b.date && a.start < b.end && b.start < a.end;

const round2 = (n) => Math.round(n * 100) / 100;

/** The edition of a rule in force on a date. A retired edition stops at its effective_to. */
function inForce(rule, date) {
  if (rule.effectiveFrom.slice(0, 10) > date) return false;
  if (rule.effectiveTo === null || rule.effectiveTo === undefined) return !rule.retired;
  const to = rule.effectiveTo.slice(0, 10);
  return rule.retired ? date < to : date <= to;
}

/** The rule situations an entry attracts, from its own facts. No interpretation. */
function topicsFor(entry) {
  const topics = [];
  const day = weekday(entry.date);
  if (day === 6) topics.push("saturday");
  else if (day === 0) topics.push("sunday");
  else if (hoursOf(entry) > OVERTIME_AFTER_HOURS) topics.push("overtime_daily");
  for (const f of entry.flags ?? []) topics.push(f);
  return topics;
}

/**
 * @param {import("@aipathway/conformance").TimesheetPorts} ports
 * @param {{ event?: string, id?: string }} [wake] what woke the run; every wake runs the whole period
 * @param {typeof DEFAULT_OWNERS} [owners]
 */
export async function build(ports, wake = { event: "schedule.tick" }, owners = DEFAULT_OWNERS) {
  void wake;

  // 1. Fresh reads, by id.
  const period = await ports.readPeriod();
  const people = await ports.readPeople();
  const allocations = await ports.readAllocations();
  const roster = await ports.readRoster();
  const rules = await ports.readRules();
  const entries = await ports.readEntries(period.id);

  const personById = new Map(people.map((p) => [p.id, p]));
  const allocated = new Set(allocations.map((a) => `${a.personId}|${a.jobId}|${a.date}`));
  const rostered = new Set(roster.filter((r) => r.rostered).map((r) => `${r.personId}|${r.date}`));
  const supervisorOf = (personId) => personById.get(personId)?.supervisor || owners.jobFallback;
  const jobOwnerOf = (jobId) => (jobId && owners.jobs[jobId]) || owners.jobFallback;

  // 2. The queue. Resolve only what a named person decided.
  const queue = await ports.readAnomalies(period.id);
  for (const a of queue) {
    if (a.resolution === null && a.decision && a.decision.by) {
      await ports.resolveAnomaly(a.id, { by: a.decision.by, reason: a.decision.reason });
      await ports.attachEvidence(a.id, `decision by ${a.decision.by}: ${a.decision.reason} at ${a.decision.at}`);
      a.resolution = { by: a.decision.by, reason: a.decision.reason, at: (await ports.now()).toISOString() };
    }
  }

  // 3 and 4. What each entry should raise, from the closed list.
  const wanted = []; // { entry, kind, owner }
  const want = (entry, kind, owner) => wanted.push({ entry, kind, owner });

  const dayHours = new Map();
  for (const e of entries) {
    const k = `${e.personId}|${e.date}`;
    dayHours.set(k, (dayHours.get(k) ?? 0) + hoursOf(e));
  }

  const cardsFor = new Map(); // entryId -> [{ rule }]
  for (const e of entries) {
    const sup = supervisorOf(e.personId);
    if (!personById.has(e.personId) || !e.jobId || !allocated.has(`${e.personId}|${e.jobId}|${e.date}`)) {
      want(e, "not_allocated", jobOwnerOf(e.jobId));
    }
    if (!rostered.has(`${e.personId}|${e.date}`)) want(e, "not_rostered", owners.roster);
    if (entries.some((o) => o.id !== e.id && overlap(e, o))) want(e, "overlap", sup);
    if ((dayHours.get(`${e.personId}|${e.date}`) ?? 0) > DAILY_LIMIT_HOURS) want(e, "over_hours", sup);
    if (grossHours(e) > BREAK_AFTER_HOURS && !(e.breakMinutes > 0)) want(e, "missing_break", sup);

    const cards = [];
    let unclear = false;
    for (const topic of topicsFor(e)) {
      const editions = rules.filter((r) => r.covers.includes(topic) && inForce(r, e.date));
      if (editions.length === 1) cards.push(editions[0]);
      else unclear = true; // none plainly covers it, or two disagree on who does
    }
    if (unclear) want(e, "rule_unclear", owners.award);
    else cardsFor.set(e.id, cards);
  }

  // Raise once per entry and kind, so a retried wake raises nothing twice.
  const have = new Set(queue.map((a) => `${a.entryId}|${a.kind}`));
  for (const w of wanted) {
    const key = `${w.entry.id}|${w.kind}`;
    if (have.has(key)) continue;
    const raised = await ports.raiseAnomaly({ entryId: w.entry.id, kind: w.kind, owner: w.owner });
    have.add(key);
    queue.push(raised);
  }

  // 5. Lines, cards and totals.
  const byEntry = new Map();
  for (const a of queue) byEntry.set(a.entryId, [...(byEntry.get(a.entryId) ?? []), a]);
  const isLine = (e) => {
    const as = byEntry.get(e.id) ?? [];
    if (as.some((a) => a.kind === "rule_unclear")) return false; // parked: no card, no line
    return as.every((a) => a.resolution !== null && a.resolution.reason !== "rejected");
  };

  const lineEntries = entries.filter(isLine);
  const existingCards = new Map();
  for (const personId of new Set(lineEntries.map((e) => e.personId))) {
    const rec = await ports.readRecord(personId, period.id);
    for (const c of rec.cards) existingCards.set(`${c.entryId}|${c.ruleId}|${c.edition}`, c);
  }

  const lines = [];
  for (const e of lineEntries) {
    const cards = cardsFor.get(e.id) ?? [];
    for (const r of cards) {
      if (existingCards.has(`${e.id}|${r.id}|${r.edition}`)) continue;
      await ports.cite({ entryId: e.id, ruleId: r.id, edition: r.edition, effectiveFrom: r.effectiveFrom });
    }
    lines.push({ entryId: e.id, personId: e.personId, date: e.date, jobId: e.jobId, hours: hoursOf(e), topics: topicsFor(e) });
  }

  const totals = [];
  const groups = new Map();
  for (const l of lines) {
    for (const key of [`${l.personId}|${l.date}`, `${l.personId}|`]) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
  }
  for (const [key, ls] of groups) {
    const [personId, date] = key.split("|");
    totals.push({ personId, date: date || null, hours: round2(ls.reduce((s, l) => s + l.hours, 0)), entryIds: ls.map((l) => l.entryId) });
  }

  // 6. The release gate, then one export per period.
  const open = queue.filter((a) => a.resolution === null);
  let releasedBy = period.releasedBy ?? null;
  let exportExternalId = null;
  const existing = await ports.readExport(period.id);
  if (existing?.externalId) exportExternalId = existing.externalId;

  const releaser = period.releaseRequested?.by ?? null;
  if (releaser && open.length === 0) {
    if (releasedBy !== releaser) {
      await ports.releasePeriod(period.id, { person: releaser });
      releasedBy = releaser;
    }
    const same =
      existing &&
      existing.releasedBy === releasedBy &&
      JSON.stringify(existing.lines) === JSON.stringify(lines) &&
      JSON.stringify(existing.totals) === JSON.stringify(totals);
    if (!same) {
      const written = await ports.writeExport({
        ...(existing ? { exportId: existing.id } : {}),
        periodId: period.id,
        lines,
        totals,
        releasedBy,
      });
      // No external id back means payroll has nothing: reported as failed, never as a success.
      exportExternalId = written?.externalId ?? null;
    }
  }

  // 7. Publish regardless.
  await ports.publishReport({
    periodId: period.id,
    lines,
    totals,
    anomaliesFound: queue.length,
    anomaliesResolved: queue.filter((a) => a.resolution !== null).length,
    release: releasedBy,
    exportExternalId,
  });
}

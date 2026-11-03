/**
 * Consultant Hours: the check between the hours consultants write on their
 * PDF timesheets and the payroll run, built to AIP-BS-TIMESHEET-CHECK
 * 2026-10-03 (https://aipathway.com.au/explore-ai/timesheet-check-build-standard).
 *
 * WHERE IT SITS. A PDF timesheet lands in the watched folder (document.received)
 * and its rows are read into entries keyed by the document id and row, source
 * "paper", each flagged "onsite" or "remote" when the sheet says so. This build
 * is what runs after that, every time it is woken, keeping nothing between runs:
 *
 *   1. Read the period, the people, the roster and the allocations, then the
 *      entries and the rule store. Nothing is raised before the trace inputs
 *      are read.
 *   2. Trace every entry to a person, a day and an allocated job. Find the
 *      overlaps, the over-hours days, the missing breaks and the unrostered
 *      days. Each is one anomaly from the closed list, with an owner.
 *   3. Read the award as a dated rule: an entry that attracts overtime or a
 *      weekend penalty gets a card from the edition in force on its date. A
 *      situation no in-force edition plainly names is parked as rule_unclear.
 *      The build never picks a clause.
 *   4. Carry a person's decision onto the anomaly, with the decision attached
 *      as evidence. Never clear one on its own say-so.
 *   5. Only when a named person has released the period and the queue is at
 *      zero, write one export to payroll, keyed to the period: update the one
 *      that exists, never write a second. A null external id is a failed export.
 *   6. Publish the period report every run, a clean one included: hours by
 *      person and day with the entry ids each total sums, onsite, remote and
 *      unknown hours (a row the sheet does not place stays unknown, never
 *      guessed), anomalies found and resolved, and who released or that nobody
 *      has.
 *
 * Everything goes through the ports. Every port call is awaited, so the same
 * build runs against the stub and against the business's own systems.
 *
 * `makeBuild(breakage)` exists only so adversarial.mjs can prove each scenario
 * goes red for a broken build. The listed build is `build`, with no breakage.
 */

/** The business's own daily limit: more than this in a day is over_hours. */
export const DAILY_LIMIT_HOURS = 10;
/** An entry longer than this with no break recorded is missing_break. */
export const BREAK_REQUIRED_AFTER_HOURS = 5;
/** Over this many hours in one weekday entry attracts the overtime rule, if the dated rule names it. */
export const OVERTIME_AFTER_HOURS = 8;

/**
 * Who owns each kind that is not the person's supervisor. On the business's
 * own systems these come from its settings; they are named people, never a role
 * nobody holds.
 */
export const OWNERS = {
  roster: "Hannah Lee (keeps the roster)",
  award: "Grace Moretti (answers for the award)",
  // The job's owner, by job id, from the job system. A job with no named owner
  // falls back to the person who keeps the roster, so no anomaly is ownerless.
  jobs: {},
};

const MODE_FLAGS = new Set(["onsite", "remote"]);
const round2 = (n) => Math.round(n * 100) / 100;

function hoursOf(e) {
  const [sh, sm] = e.start.split(":").map(Number);
  const [eh, em] = e.end.split(":").map(Number);
  return round2(((eh * 60 + em) - (sh * 60 + sm) - e.breakMinutes) / 60);
}
const dayOfWeek = (date) => new Date(`${date}T00:00:00.000Z`).getUTCDay();
const overlaps = (a, b) => a.personId === b.personId && a.date === b.date && a.start < b.end && b.start < a.end;

/** The edition of a rule in force on a date: effective by then, not ended, not retired with no end. */
function inForce(rule, date, breakage) {
  if (breakage.ignoreDates) return true;
  if (rule.effectiveFrom > date) return false;
  if (rule.effectiveTo && date > rule.effectiveTo) return false;
  if (rule.retired && !rule.effectiveTo) return false;
  return true;
}

/** The rule situations an entry raises: overtime, a weekend penalty, anything the sheet flagged. */
function topicsOf(e) {
  const topics = [];
  const dow = dayOfWeek(e.date);
  if (dow === 6) topics.push("saturday");
  else if (dow === 0) topics.push("sunday");
  else if (hoursOf(e) > OVERTIME_AFTER_HOURS) topics.push("overtime_daily");
  for (const f of e.flags ?? []) if (!MODE_FLAGS.has(f)) topics.push(f);
  return topics;
}

/** onsite, remote, or unknown: what the sheet said, never a guess. */
function modeOf(e) {
  const f = e.flags ?? [];
  if (f.includes("onsite") && !f.includes("remote")) return "onsite";
  if (f.includes("remote") && !f.includes("onsite")) return "remote";
  return "unknown";
}

export function makeBuild(breakage = {}) {
  return async function build(ports) {
    if (breakage.doNothing) return;

    // ── 1. Read everything the trace needs, before anything is raised. ──
    const period = await ports.readPeriod();
    const people = await ports.readPeople();
    const roster = await ports.readRoster();
    const allocations = await ports.readAllocations();
    const entries = await ports.readEntries(period.id);
    const rules = await ports.readRules();
    const existing = await ports.readAnomalies(period.id);

    const personById = new Map(people.map((p) => [p.id, p]));
    const allocated = (e) => e.jobId !== null && allocations.some((a) => a.personId === e.personId && a.jobId === e.jobId && a.date === e.date);
    const rostered = (e) => roster.some((r) => r.personId === e.personId && r.date === e.date && r.rostered === true);
    const supervisorOf = (e) => personById.get(e.personId)?.supervisor || OWNERS.roster;
    const jobOwnerOf = (e) => (e.jobId && OWNERS.jobs[e.jobId]) || OWNERS.roster;

    // ── 2. Trace and the closed list. ──
    const found = []; // { entryId, kind, owner }
    const flag = (e, kind, owner) => found.push({ entryId: e.id, kind, owner: breakage.noOwner ? "" : owner });

    const dayHours = new Map();
    for (const e of entries) {
      const k = `${e.personId}|${e.date}`;
      dayHours.set(k, round2((dayHours.get(k) ?? 0) + hoursOf(e)));
    }

    /** entryId -> { ruleCards: [], unclear: boolean } */
    const ruling = new Map();
    for (const e of entries) {
      if (!breakage.skipTrace && (!personById.has(e.personId) || !allocated(e))) flag(e, "not_allocated", jobOwnerOf(e));
      if (!rostered(e)) flag(e, "not_rostered", OWNERS.roster);
      if (entries.some((o) => o.id !== e.id && overlaps(o, e))) flag(e, "overlap", supervisorOf(e));
      if (dayHours.get(`${e.personId}|${e.date}`) > DAILY_LIMIT_HOURS) flag(e, "over_hours", supervisorOf(e));
      if (hoursOf(e) > BREAK_REQUIRED_AFTER_HOURS && e.breakMinutes === 0) flag(e, "missing_break", supervisorOf(e));

      // ── 3. The award as a dated rule. ──
      const cards = [];
      let unclear = false;
      for (const topic of topicsOf(e)) {
        const rule = rules.find((r) => r.covers.includes(topic) && inForce(r, e.date, breakage));
        if (rule) cards.push({ topic, rule });
        else if (breakage.cardOnUnclear && rules[0]) cards.push({ topic, rule: rules[0] });
        else unclear = true;
      }
      if (unclear) flag(e, "rule_unclear", OWNERS.award);
      ruling.set(e.id, { cards: unclear ? [] : cards, unclear });
    }

    // One anomaly per entry and kind, so a retried wake raises nothing twice.
    for (const a of found) {
      if (existing.some((x) => x.entryId === a.entryId && x.kind === a.kind)) continue;
      await ports.raiseAnomaly(a);
    }

    // ── 4. A person's decision, carried onto the anomaly. ──
    for (const a of await ports.readAnomalies(period.id)) {
      if (a.resolution) continue;
      if (breakage.autoResolve) {
        await ports.resolveAnomaly(a.id, { by: null, reason: "approved" });
        continue;
      }
      if (!a.decision || !a.decision.by) continue;
      if (!breakage.noEvidence) await ports.attachEvidence(a.id, `decision by ${a.decision.by}: ${a.decision.reason} at ${a.decision.at}`);
      await ports.resolveAnomaly(a.id, { by: a.decision.by, reason: a.decision.reason });
    }
    const queue = await ports.readAnomalies(period.id);
    const open = queue.filter((a) => !a.resolution);

    // ── Lines: an entry with an open anomaly, or one a person rejected, is not a line. ──
    const lines = [];
    for (const e of entries) {
      const mine = queue.filter((a) => a.entryId === e.id);
      if (mine.some((a) => !a.resolution)) continue;
      if (mine.some((a) => a.resolution.reason === "rejected")) continue;
      const r = ruling.get(e.id);
      lines.push({ entryId: e.id, personId: e.personId, date: e.date, jobId: e.jobId, hours: hoursOf(e), topics: r.cards.map((c) => c.topic), mode: modeOf(e) });
    }

    // Cards for the lines that apply a rule, once each.
    const cited = new Map();
    for (const p of people) {
      const rec = await ports.readRecord(p.id, period.id);
      for (const c of rec.cards) cited.set(`${c.entryId}|${c.ruleId}|${c.edition}`, true);
    }
    if (!breakage.noCards) {
      for (const l of lines) {
        for (const { rule } of ruling.get(l.entryId).cards) {
          const k = `${l.entryId}|${rule.id}|${rule.edition}`;
          if (cited.has(k)) continue;
          cited.set(k, true);
          await ports.cite({ entryId: l.entryId, ruleId: rule.id, edition: rule.edition, effectiveFrom: rule.effectiveFrom });
        }
      }
    }

    // ── Totals, computed from the lines they name. ──
    const totals = [];
    const byPerson = new Map();
    for (const l of lines) {
      if (!byPerson.has(l.personId)) byPerson.set(l.personId, []);
      byPerson.get(l.personId).push(l);
    }
    for (const [personId, ls] of byPerson) {
      const days = [...new Set(ls.map((l) => l.date))].sort();
      for (const d of days) {
        const dl = ls.filter((l) => l.date === d);
        totals.push(
          breakage.typedTotals
            ? { personId, date: d, hours: 8, entryIds: [] }
            : { personId, date: d, hours: round2(dl.reduce((s, l) => s + l.hours, 0)), entryIds: dl.map((l) => l.entryId) },
        );
      }
      totals.push({ personId, date: null, hours: round2(ls.reduce((s, l) => s + l.hours, 0)), entryIds: ls.map((l) => l.entryId) });
    }
    const modeTotals = [];
    for (const [personId, ls] of byPerson) {
      for (const mode of ["onsite", "remote", "unknown"]) {
        const ml = ls.filter((l) => l.mode === mode);
        modeTotals.push({ personId, mode, hours: round2(ml.reduce((s, l) => s + l.hours, 0)), entryIds: ml.map((l) => l.entryId) });
      }
    }
    const exportLines = lines.map(({ mode, ...l }) => l);

    // ── 5. The release gate, then one export per period. ──
    let releasedBy = period.releasedBy ?? null;
    let exportExternalId = period.exportExternalId ?? null;
    let exportFailed = false;
    const requested = period.releaseRequested?.by ?? null;
    const mayExport = breakage.noGate ? true : Boolean(requested) && (breakage.ignoreOpen || open.length === 0);
    if (mayExport) {
      if (requested) {
        await ports.releasePeriod(period.id, { person: requested });
        releasedBy = requested;
      }
      const prior = breakage.exportTwice ? null : await ports.readExport(period.id);
      const body = { periodId: period.id, lines: exportLines, totals, releasedBy };
      const same = prior && JSON.stringify({ l: prior.lines, t: prior.totals, r: prior.releasedBy }) === JSON.stringify({ l: exportLines, t: totals, r: releasedBy });
      const written = same ? prior : await ports.writeExport(prior ? { ...body, exportId: prior.id } : body);
      if (written && written.externalId) exportExternalId = written.externalId;
      else {
        exportFailed = true;
        exportExternalId = null;
      }
    }

    // ── 6. The report, every run, a clean period included. ──
    if (breakage.silentWhenClean && queue.length === 0) return;
    await ports.publishReport({
      periodId: period.id,
      lines: exportLines,
      totals,
      modeTotals,
      anomaliesFound: queue.length,
      anomaliesResolved: queue.filter((a) => a.resolution).length,
      release: releasedBy,
      releaseNote: releasedBy ? `released by ${releasedBy}` : "nobody has released this period",
      exportExternalId,
      exportFailed,
    });
  };
}

export const build = makeBuild();

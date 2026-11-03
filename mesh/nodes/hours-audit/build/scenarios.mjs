/**
 * One scenario per check of timesheet-check-build-standard, for Hours Audit.
 *
 * Scaffolded by `npx @aipathway/conformance init timesheet-check-build-standard`
 * from https://aipathway.com.au/explore-ai/timesheet-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a small Australian cafe on Square Team: three team members,
 * the jobs their scheduled shifts are for, a week of timecards, and the
 * Hospitality Industry (General) Award held as dated editions in a rule store.
 * The editions here are test rows with made-up dates, not the real instrument.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns a strict
 * true or false.
 */

import { TimesheetWorld } from "@aipathway/conformance";

// The closed list, as the standard gives it. Six is the list.
const ANOMALY_KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const SUP_A = "Dana Price, store manager";
const SUP_B = "Tom Reid, shift lead";
const ROSTER_KEEPER = "Dana Price, roster keeper";
const AWARD_OWNER = "Sam Lee, owner (answers for the award)";
const JOB_OWNERS = { "J-BAR": "Dana Price, store manager", "J-FLOOR": "Tom Reid, shift lead", "J-KITCHEN": "Kai Moana, head chef" };
const CONFIG = { rosterKeeper: ROSTER_KEEPER, awardOwner: AWARD_OWNER, jobOwners: JOB_OWNERS, dailyLimitHours: 10, ordinaryDailyHours: 8, breakRequiredAfterHours: 5 };

const PEOPLE = [
  { id: "TM-1", name: "Mia Chen", supervisor: SUP_A },
  { id: "TM-2", name: "Liam Ortiz", supervisor: SUP_A },
  { id: "TM-3", name: "Ava Singh", supervisor: SUP_B },
];

// Week 39: Monday 21 to Sunday 27 September 2026.
const W39 = { id: "2026-W39", from: "2026-09-21", to: "2026-09-27" };
const W41 = { id: "2026-W41", from: "2026-10-05", to: "2026-10-11" };
const DATES_W39 = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];
const DATES_W41 = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

/** Everyone rostered every day; the not_rostered case is seeded by removing a row. */
const rosterFor = (dates, people = PEOPLE) => people.flatMap((p) => dates.map((date) => ({ personId: p.id, date, rostered: true })));

/** Each person allocated to their own job every day (Square: a scheduled shift for that job). */
const HOME_JOB = { "TM-1": "J-BAR", "TM-2": "J-KITCHEN", "TM-3": "J-FLOOR" };
const allocFor = (dates) => PEOPLE.flatMap((p) => dates.map((date) => ({ personId: p.id, jobId: HOME_JOB[p.id], date })));

const entry = (id, personId, date, jobId, start, end, breakMinutes = 30, extra = {}) => ({
  id, personId, date, jobId, start, end, breakMinutes, source: "app", ...extra,
});

// Two editions: one retired at 30 June 2026, one in force from 1 July 2026.
const ED_2025 = {
  id: "HIGA-2025", instrument: "Hospitality Industry (General) Award 2020", edition: "2025-07-01",
  effectiveFrom: "2025-07-01", effectiveTo: "2026-06-30", text: "test edition", covers: ["overtime_daily", "saturday", "sunday"], retired: true,
};
const ED_2026 = {
  id: "HIGA-2026", instrument: "Hospitality Industry (General) Award 2020", edition: "2026-07-01",
  effectiveFrom: "2026-07-01", effectiveTo: null, text: "test edition", covers: ["overtime_daily", "saturday", "sunday"], retired: false,
};
const RULES = [ED_2025, ED_2026];

/**
 * The eight base entries across three people. TM-1's Wednesday is on J-FLOOR,
 * which she was never allocated to. Everything else traces, at 8 hours or less.
 */
const BASE = [
  entry("E1", "TM-1", "2026-09-21", "J-BAR", "07:00", "15:30"),
  entry("E2", "TM-1", "2026-09-22", "J-BAR", "07:00", "15:30"),
  entry("E3", "TM-1", "2026-09-23", "J-FLOOR", "07:00", "15:30"), // not allocated
  entry("E4", "TM-2", "2026-09-21", "J-KITCHEN", "10:00", "18:30"),
  entry("E5", "TM-2", "2026-09-24", "J-KITCHEN", "10:00", "18:30"),
  entry("E6", "TM-2", "2026-09-25", "J-KITCHEN", "10:00", "18:30"),
  entry("E7", "TM-3", "2026-09-22", "J-FLOOR", "16:00", "22:30"),
  entry("E8", "TM-3", "2026-09-24", "J-FLOOR", "16:00", "22:30"),
];

const world = (opts = {}) =>
  new TimesheetWorld({
    people: PEOPLE,
    roster: rosterFor(DATES_W39),
    allocations: allocFor(DATES_W39),
    rules: RULES,
    period: W39,
    ...opts,
  });

const run = (b, w) => b(w.ports(), CONFIG);
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const escalations = (w) => callsTo(w, "escalate");
const kindsFor = (w, entryId) => w.anomalies.filter((a) => a.entryId === entryId).map((a) => a.kind);
const lastReport = (w, periodId) => w.reportsFor(periodId).at(-1);
const lineIds = (r) => new Set((r?.lines ?? []).map((l) => l.entryId));
const sumOf = (w, ids) => Math.round(ids.reduce((n, id) => n + hoursOfEntry(w.entry(id)), 0) * 100) / 100;
function hoursOfEntry(e) {
  if (!e) return NaN;
  const m = (t) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  return Math.round(((m(e.end) - m(e.start) - e.breakMinutes) / 60) * 100) / 100;
}
const describeAll = (w) =>
  `${w.calls.length} port call(s); anomalies ${w.anomalies.map((a) => `${a.entryId}:${a.kind}:${a.owner || "(no owner)"}${a.resolution ? `:resolved by ${a.resolution.by}` : ""}`).join(", ") || "none"}; ` +
  `cards ${w.cards.map((c) => `${c.entryId}:${c.ruleId}`).join(", ") || "none"}; reports ${w.reports.length}; exports ${w.exports.map((x) => `${x.periodId}:${x.externalId}:u${x.updates}`).join(", ") || "none"}`;

/** The anomaly fixture: base week plus an overlapping pair and a twelve-hour day. */
const ANOMALY_ENTRIES = [
  ...BASE,
  entry("E9", "TM-3", "2026-09-25", "J-FLOOR", "09:00", "13:00", 0), // overlaps E10
  entry("E10", "TM-3", "2026-09-25", "J-FLOOR", "12:30", "15:00", 0), // overlaps E9
  entry("E11", "TM-2", "2026-09-22", "J-KITCHEN", "07:00", "19:30"), // twelve hours
];

/** Decide every open anomaly as a named person, reasons in rotation, and leave none undecided. */
function decideAll(w, by = SUP_A) {
  const reasons = ["approved", "corrected", "rejected"];
  w.anomalies.filter((a) => a.decision === null).forEach((a, i) => w.decide(a.id, by, reasons[i % 3]));
}

export const scenarios = [
  {
    checkId: "entry-traces-to-person-day-job",
    // 1. Eight entries across three people, E3 on a job TM-1 was never allocated.
    world: () => world({ entries: BASE }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const firstEsc = w.firstCall("escalate");
      const peopleRead = w.firstCall("read_contacts", (c) => c.request.people === true);
      const allocRead = w.firstCall("read_job", (c) => c.request.allocations === true);
      if (firstEsc < 0 || peopleRead < 0 || allocRead < 0) return false;
      if (!(peopleRead < firstEsc && allocRead < firstEsc)) return false;
      const r = lastReport(w, W39.id);
      if (!r) return false;
      const ids = new Set(PEOPLE.map((p) => p.id));
      const alloc = allocFor(DATES_W39);
      const linesOk = r.lines.every(
        (l) => ids.has(l.personId) && typeof l.date === "string" && alloc.some((a) => a.personId === l.personId && a.jobId === l.jobId && a.date === l.date),
      );
      const seven = r.lines.length === 7 && !lineIds(r).has("E3");
      const e3 = kindsFor(w, "E3").includes("not_allocated");
      const onlyE3 = w.anomalies.every((a) => a.entryId === "E3");
      return linesOk && seven && e3 && onlyE3;
    },
    describe: describeAll,
  },
  {
    checkId: "totals-computed-never-typed",
    // 2. Clean entries for two people, one day with two entries for TM-3.
    world: () =>
      world({
        entries: [
          entry("E4", "TM-2", "2026-09-21", "J-KITCHEN", "10:00", "18:30"),
          entry("E5", "TM-2", "2026-09-24", "J-KITCHEN", "10:00", "18:30", 45),
          entry("E7", "TM-3", "2026-09-22", "J-FLOOR", "16:00", "22:30"),
          entry("E8a", "TM-3", "2026-09-24", "J-FLOOR", "09:00", "12:00", 0),
          entry("E8b", "TM-3", "2026-09-24", "J-FLOOR", "16:00", "21:00", 0),
        ],
      }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const r = lastReport(w, W39.id);
      if (!r || r.totals.length === 0) return false;
      const everyNamed = r.totals.every((t) => Array.isArray(t.entryIds) && t.entryIds.length > 0 && t.hours === sumOf(w, t.entryIds));
      const daily = (p, d) => r.totals.find((t) => t.personId === p && t.date === d);
      const weekly = (p) => r.totals.find((t) => t.personId === p && t.date === null);
      const d1 = daily("TM-3", "2026-09-24");
      const expected =
        d1?.hours === 8 &&
        d1.entryIds.length === 2 &&
        daily("TM-2", "2026-09-21")?.hours === 8 &&
        daily("TM-2", "2026-09-24")?.hours === 7.75 &&
        weekly("TM-2")?.hours === 15.75 &&
        weekly("TM-3")?.hours === 14 &&
        weekly("TM-3").entryIds.length === 3;
      return everyNamed && expected && w.anomalies.length === 0;
    },
    describe: (w) => `totals ${(lastReport(w, W39.id)?.totals ?? []).map((t) => `${t.personId}:${t.date ?? "week"}=${t.hours}[${t.entryIds.join("+")}]`).join(", ") || "none"}`,
  },
  {
    checkId: "anomalies-are-a-closed-list",
    // 3. The eight entries plus an overlapping pair and a twelve-hour day.
    world: () => world({ entries: ANOMALY_ENTRIES }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const esc = escalations(w);
      if (esc.length === 0) return false;
      const closed = esc.every((c) => ANOMALY_KINDS.includes(c.request.kind) && typeof c.request.owner === "string" && c.request.owner.trim().length > 0);
      const has = (id, kind, owner) => w.anomalies.some((a) => a.entryId === id && a.kind === kind && a.owner === owner);
      const caught =
        has("E9", "overlap", SUP_B) &&
        has("E10", "overlap", SUP_B) &&
        has("E11", "over_hours", SUP_A) &&
        has("E3", "not_allocated", JOB_OWNERS["J-FLOOR"]);
      const clean = ["E1", "E2", "E4", "E5", "E6", "E7", "E8"].every((id) => kindsFor(w, id).length === 0);
      return closed && caught && clean;
    },
    describe: describeAll,
  },
  {
    checkId: "award-rule-is-cited-with-an-edition",
    // 4. A ten-hour Tuesday and a Saturday, two editions in the store, and a
    //    plain eight-hour Monday that attracts nothing.
    world: () =>
      world({
        entries: [
          entry("E1", "TM-1", "2026-09-21", "J-BAR", "07:00", "15:30"),
          entry("E2", "TM-1", "2026-09-22", "J-BAR", "07:00", "17:30"),
          entry("E3", "TM-3", "2026-09-26", "J-FLOOR", "08:00", "14:00"),
        ],
      }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const firstRead = w.firstCall("read_rule");
      const firstCite = w.firstCall("cite");
      if (firstRead < 0 || firstCite < 0 || firstRead > firstCite) return false;
      const cardOk = (id) => {
        const cs = w.cardsFor(id);
        const e = w.entry(id);
        return (
          cs.length > 0 &&
          cs.every((c) => {
            const r = w.rule(c.ruleId);
            return r && c.edition === r.edition && c.effectiveFrom === r.effectiveFrom && r.effectiveFrom <= e.date && (r.effectiveTo === null || e.date <= r.effectiveTo);
          })
        );
      };
      const r = lastReport(w, W39.id);
      if (!r) return false;
      const topicLinesCarded = r.lines.every((l) => l.topics.length === 0 || w.cardsFor(l.entryId).length > 0);
      const topicsRight =
        r.lines.find((l) => l.entryId === "E2")?.topics.includes("overtime_daily") === true &&
        r.lines.find((l) => l.entryId === "E3")?.topics.includes("saturday") === true;
      return cardOk("E2") && cardOk("E3") && w.cardsFor("E1").length === 0 && topicLinesCarded && topicsRight;
    },
    describe: describeAll,
  },
  {
    checkId: "superseded-rule-cannot-apply",
    // 5. Week 39 under the 2026 edition. Then that edition is retired at 30
    //    September, a 1 October edition that names overtime but not Saturday
    //    comes into force, and week 41 runs.
    world: () =>
      new TimesheetWorld({
        people: PEOPLE,
        roster: rosterFor([...DATES_W39, ...DATES_W41]),
        allocations: allocFor([...DATES_W39, ...DATES_W41]),
        rules: [
          { ...ED_2026, effectiveTo: null, retired: false },
          { ...ED_2026, id: "HIGA-2026B", edition: "2026-10-01", effectiveFrom: "2026-10-01", effectiveTo: null, covers: ["overtime_daily", "sunday"] },
        ],
        period: W39,
        entries: [
          entry("A1", "TM-1", "2026-09-22", "J-BAR", "07:00", "17:30"), // overtime, week 39
          entry("A2", "TM-3", "2026-09-26", "J-FLOOR", "08:00", "14:00"), // Saturday, week 39
          entry("B1", "TM-1", "2026-10-06", "J-BAR", "07:00", "17:30"), // overtime, week 41
          entry("B2", "TM-3", "2026-10-10", "J-FLOOR", "08:00", "14:00"), // Saturday, week 41: not named
        ],
      }),
    drive: async (b, w) => {
      await run(b, w);
      w.retireRule("HIGA-2026", "2026-09-30");
      w.setPeriod(W41);
      w.advance(14 * DAY);
      await run(b, w);
    },
    holds: (w) => {
      const cite = (id) => w.cardsFor(id).map((c) => c.ruleId);
      const first = cite("A1").length > 0 && cite("A2").length > 0 && [...cite("A1"), ...cite("A2")].every((r) => r === "HIGA-2026");
      const later = cite("B1").length > 0 && cite("B1").every((r) => r === "HIGA-2026B");
      const noRetiredLater = !w.cards.some((c) => c.ruleId === "HIGA-2026" && c.entryId.startsWith("B"));
      const parked = kindsFor(w, "B2").includes("rule_unclear") && cite("B2").length === 0;
      return first && later && noRetiredLater && parked;
    },
    describe: describeAll,
  },
  {
    checkId: "no-interpretation",
    // 6. A weekday entry flagged as a disputed break, which no edition names,
    //    beside a Saturday the edition plainly covers.
    world: () =>
      world({
        entries: [
          entry("E1", "TM-1", "2026-09-22", "J-BAR", "07:00", "15:30", 30, { flags: ["disputed_break"] }),
          entry("E2", "TM-3", "2026-09-26", "J-FLOOR", "08:00", "14:00"),
        ],
      }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const a = w.anomalies.filter((x) => x.entryId === "E1");
      const parked = a.length === 1 && a[0].kind === "rule_unclear" && a[0].owner === AWARD_OWNER;
      const readFirst = w.firstCall("read_rule") >= 0 && w.firstCall("read_rule") < w.firstCall("escalate", (c) => c.request.entryId === "E1");
      const r = lastReport(w, W39.id);
      const notALine = r !== undefined && !lineIds(r).has("E1");
      const otherCarded = w.cardsFor("E2").length === 1 && lineIds(r).has("E2");
      return parked && readFirst && w.cardsFor("E1").length === 0 && notALine && otherCarded;
    },
    describe: describeAll,
  },
  {
    checkId: "anomaly-is-resolved-by-a-person-with-a-reason",
    // 7. Run, then a named person decides all but one anomaly, then run again.
    world: () => world({ entries: ANOMALY_ENTRIES }),
    drive: async (b, w) => {
      await run(b, w);
      w.advance(4 * HOUR);
      const raised = w.anomalies.filter((a) => a.decision === null);
      const reasons = ["approved", "corrected", "rejected"];
      raised.slice(0, -1).forEach((a, i) => w.decide(a.id, i % 2 ? SUP_B : SUP_A, reasons[i % 3]));
      w.advance(HOUR);
      await run(b, w);
    },
    holds: (w) => {
      if (w.anomalies.length < 4) return false;
      const decided = w.anomalies.filter((a) => a.decision !== null);
      const undecided = w.anomalies.filter((a) => a.decision === null);
      const carried = decided.every(
        (a) =>
          a.resolution !== null &&
          a.resolution.by === a.decision.by &&
          a.resolution.reason === a.decision.reason &&
          a.resolution.at >= a.decision.at &&
          a.evidence.some((ref) => ref.includes(a.decision.by) && ref.includes(a.decision.reason)),
      );
      const leftOpen = undecided.length === 1 && undecided.every((a) => a.resolution === null);
      const noneNameless = callsTo(w, "gate", (c) => "resolve" in c.request).every((c) => typeof c.request.by === "string" && c.request.by.length > 0);
      return decided.length > 0 && carried && leftOpen && noneNameless;
    },
    describe: describeAll,
  },
  {
    checkId: "nothing-reaches-payroll-without-a-release",
    // 8. Run with anomalies open and no release. Then one anomaly still open and
    //    a named person presses release. Then every anomaly decided.
    world: () => world({ entries: ANOMALY_ENTRIES }),
    drive: async (b, w) => {
      await run(b, w);
      w.__afterFirst = w.calls.length;
      w.advance(HOUR);
      const open = w.anomalies.filter((a) => a.decision === null);
      open.slice(0, -1).forEach((a) => w.decide(a.id, SUP_A, "approved"));
      w.release(SUP_A);
      w.advance(HOUR);
      await run(b, w);
      w.__afterSecond = w.calls.length;
      w.advance(HOUR);
      decideAll(w, SUP_B);
      w.advance(HOUR);
      await run(b, w);
    },
    holds: (w) => {
      const writes = w.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "write_ledger");
      const beforeThird = writes.some(([, i]) => i < w.__afterSecond);
      if (beforeThird || writes.length !== 1) return false;
      const [write, wi] = writes[0];
      const release = w.calls.findIndex((c) => c.port === "gate" && c.request.release === W39.id && c.request.person === SUP_A);
      const x = w.exportsFor(W39.id);
      return (
        release >= 0 &&
        release < wi &&
        write.request.openAtWrite === 0 &&
        write.request.releasedBy === SUP_A &&
        x.length === 1 &&
        x[0].releasedBy === SUP_A &&
        typeof x[0].externalId === "string"
      );
    },
    describe: describeAll,
  },
  {
    checkId: "one-export-per-period",
    // 9. A clean period released by a named person, run twice an hour apart,
    //    then released again by a second person and run a third time.
    world: () => world({ entries: BASE.filter((e) => e.id !== "E3") }),
    drive: async (b, w) => {
      w.release(SUP_A);
      await run(b, w);
      w.__afterFirst = w.calls.length;
      w.advance(HOUR);
      await run(b, w);
      w.__afterSecond = w.calls.length;
      w.advance(HOUR);
      w.release(SUP_B);
      await run(b, w);
    },
    holds: (w) => {
      const x = w.exportsFor(W39.id);
      if (x.length !== 1 || typeof x[0].externalId !== "string" || x[0].externalId.length === 0) return false;
      const writes = w.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "write_ledger");
      const creates = writes.filter(([c]) => !("update" in c.request));
      // The second run, an hour later with nothing changed, writes nothing.
      const secondRun = writes.filter(([, i]) => i >= w.__afterFirst && i < w.__afterSecond);
      const updates = writes.filter(([c]) => "update" in c.request);
      const report = lastReport(w, W39.id);
      return secondRun.length === 0 && creates.length === 1 && updates.length === 1 && x[0].updates === 1 && x[0].releasedBy === SUP_B && report?.exportExternalId === x[0].externalId;
    },
    describe: describeAll,
  },
  {
    checkId: "the-run-publishes-regardless",
    // 10. A clean period with nothing to raise and nobody having released.
    world: () => world({ entries: BASE.filter((e) => e.id !== "E3") }),
    drive: (b, w) => run(b, w),
    holds: (w) => {
      const rs = w.reportsFor(W39.id);
      if (rs.length !== 1) return false;
      const r = rs[0];
      const byPerson = new Set(r.lines.map((l) => l.personId));
      return (
        r.lines.length === 7 &&
        PEOPLE.every((p) => byPerson.has(p.id)) &&
        r.anomaliesFound === 0 &&
        r.anomaliesResolved === 0 &&
        "release" in r &&
        r.release === null &&
        w.exports.length === 0
      );
    },
    describe: describeAll,
  },
  {
    checkId: "the-record-by-person-and-period",
    // 11. One period for three people through anomalies, decisions, release and
    //     export, then a read by person and period for each.
    world: () =>
      world({
        entries: [...ANOMALY_ENTRIES, entry("E12", "TM-1", "2026-09-26", "J-BAR", "08:00", "14:00")],
      }),
    drive: async (b, w) => {
      await run(b, w);
      w.advance(HOUR);
      decideAll(w, SUP_A);
      w.release(SUP_A);
      w.advance(HOUR);
      await run(b, w);
      w.__records = PEOPLE.map((p) => w.ports().readRecord(p.id, W39.id));
    },
    holds: (w) => {
      const recs = w.__records ?? [];
      if (recs.length !== 3) return false;
      const every = recs.every(
        (r) =>
          r.entries.length > 0 &&
          r.release.by === SUP_A &&
          typeof r.exportExternalId === "string" &&
          r.anomalies.every((a) => a.resolution !== null && typeof a.resolution.by === "string" && a.resolution.reason.length > 0 && a.evidence.length > 0),
      );
      const m = recs.find((r) => r.personId === "TM-1");
      const ava = recs.find((r) => r.personId === "TM-3");
      const liam = recs.find((r) => r.personId === "TM-2");
      const content =
        m.anomalies.some((a) => a.kind === "not_allocated") &&
        m.cards.some((c) => c.entryId === "E12" && c.ruleId === "HIGA-2026" && c.edition === "2026-07-01") &&
        ava.anomalies.filter((a) => a.kind === "overlap").length === 2 &&
        liam.anomalies.some((a) => a.kind === "over_hours");
      return every && content;
    },
    describe: (w) => `${describeAll(w)}; records ${(w.__records ?? []).map((r) => `${r.personId}: ${r.entries.length}e/${r.anomalies.length}a/${r.cards.length}c release ${r.release.by}`).join("; ")}`,
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store, the roster and the release run
    // on the business's own Square and payroll accounts.
    world: () => world({ entries: BASE }),
    drive: (b, w) => run(b, w),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own Square Team, rule store and
// payroll, released by a person. No live port map is published, so run.mjs
// refuses a production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TimesheetWorld(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of timesheet-check-build-standard, for Consultant Hours.
 *
 * Scaffolded by `npx @aipathway/conformance init timesheet-check-build-standard`.
 * The checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/timesheet-check-build-standard
 *
 * The world: consultants whose hours arrive on PDF timesheets (source "paper",
 * entry ids "<document_id>#<row>"), flagged onsite or remote where the sheet
 * says so. The award fixtures below are illustrative dated editions seeded for
 * the run, not quoted clause text: a business loads its own instrument and
 * checks it against the Fair Work Commission's published award.
 *
 * Every `holds` reads the world after the build ran and returns a strict
 * boolean. adversarial.mjs runs these same scenarios against a do-nothing build
 * and against deliberately broken builds, and every claimed check goes red.
 */

import { TimesheetWorld } from "@aipathway/conformance";

// The standard's closed list (section 2), and hours after the break, as the
// world computes them. The package exports neither, so they are restated here.
const ANOMALY_KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];
const hoursOf = (e) => {
  const [sh, sm] = e.start.split(":").map(Number);
  const [eh, em] = e.end.split(":").map(Number);
  return Math.round((((eh * 60 + em) - (sh * 60 + sm) - e.breakMinutes) / 60) * 100) / 100;
};

// ── Fixtures ──

const PEOPLE = [
  { id: "P1", name: "Mia Chen", supervisor: "Dana Ruiz" },
  { id: "P2", name: "Tom Okafor", supervisor: "Dana Ruiz" },
  { id: "P3", name: "Lena Park", supervisor: "Sam Wu" },
];
const W39 = { id: "2026-W39", from: "2026-09-21", to: "2026-09-27" };
const W41 = { id: "2026-W41", from: "2026-10-05", to: "2026-10-11" };
const WEEK = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25"];
const SAT = "2026-09-26";
const INSTRUMENT = "Clerks - Private Sector Award 2020 [MA000002] (illustrative fixture)";

const rule = (id, edition, effectiveFrom, effectiveTo, covers) => ({
  id,
  instrument: INSTRUMENT,
  edition,
  effectiveFrom,
  effectiveTo,
  text: `Seeded edition ${edition}: names ${covers.join(", ")}.`,
  covers,
  retired: false,
});
// The edition before last financial year, ended; and the one in force.
const ED_2025 = () => rule("CLERKS-2025", "2025-07", "2025-07-01", "2026-06-30", ["overtime_daily", "saturday"]);
const ED_2026 = () => rule("CLERKS-2026", "2026-07", "2026-07-01", null, ["overtime_daily", "saturday"]);

const entry = (id, personId, date, jobId, start, end, breakMinutes, mode, flags = []) => ({
  id,
  personId,
  date,
  jobId,
  start,
  end,
  breakMinutes,
  source: "paper",
  flags: mode ? [mode, ...flags] : flags,
});
const rosterFor = (entries, extraDays = []) => {
  const keys = new Set(entries.map((e) => `${e.personId}|${e.date}`));
  for (const d of extraDays) keys.add(d);
  return [...keys].map((k) => {
    const [personId, date] = k.split("|");
    return { personId, date, rostered: true };
  });
};
const allocationsFor = (entries, except = []) =>
  entries.filter((e) => e.jobId && !except.includes(e.id)).map((e) => ({ personId: e.personId, jobId: e.jobId, date: e.date }));

const world = (o) =>
  new TimesheetWorld({
    people: PEOPLE,
    period: W39,
    rules: [ED_2025(), ED_2026()],
    ...o,
  });

/** Eight entries across three people, clean except E8, on a job Lena was never allocated. */
function traceEntries() {
  return [
    entry("doc-401#1", "P1", WEEK[0], "J-100", "09:00", "17:00", 30, "onsite"),
    entry("doc-401#2", "P1", WEEK[1], "J-100", "09:00", "16:30", 30, "remote"),
    entry("doc-402#1", "P2", WEEK[0], "J-200", "08:30", "16:30", 30, "onsite"),
    entry("doc-402#2", "P2", WEEK[1], "J-200", "08:30", "12:30", 0, null),
    entry("doc-402#3", "P2", WEEK[1], "J-100", "13:00", "16:00", 0, "remote"),
    entry("doc-403#1", "P3", WEEK[0], "J-300", "09:00", "17:00", 45, "onsite"),
    entry("doc-403#2", "P3", WEEK[1], "J-300", "09:00", "15:00", 30, "remote"),
    entry("doc-403#3", "P3", WEEK[2], "J-100", "09:00", "17:00", 30, "onsite"),
  ];
}
const UNALLOCATED = "doc-403#3";

/** Eight entries with one overlapping pair, one twelve-hour day and one unallocated job. */
function anomalyEntries() {
  return [
    entry("doc-501#1", "P1", WEEK[1], "J-100", "09:00", "13:00", 0, "onsite"),
    entry("doc-501#2", "P1", WEEK[1], "J-200", "12:00", "16:00", 0, "remote"),
    entry("doc-502#1", "P2", WEEK[0], "J-200", "07:00", "19:30", 30, "onsite"),
    entry("doc-502#2", "P2", WEEK[2], "J-200", "09:00", "17:00", 30, "onsite"),
    entry("doc-503#1", "P3", WEEK[0], "J-300", "09:00", "17:00", 30, "remote"),
    entry("doc-503#2", "P3", WEEK[1], "J-200", "09:00", "17:00", 30, "onsite"),
    entry("doc-503#3", "P3", WEEK[2], "J-300", "09:00", "15:00", 30, null),
    entry("doc-501#3", "P1", WEEK[3], "J-100", "09:00", "17:00", 30, "onsite"),
  ];
}
const OVERLAP = ["doc-501#1", "doc-501#2"];
const TWELVE = "doc-502#1";
const UNALLOC_3 = "doc-503#2";

function anomalyWorld() {
  const es = anomalyEntries();
  return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es, [UNALLOC_3]) });
}

const REASONS = ["approved", "corrected", "rejected"];
/** Each owner decides their anomaly in the queue. The runner's stimulus, never the build's. */
function decideAll(w, except = []) {
  let i = 0;
  for (const a of w.anomalies) {
    if (except.includes(a.entryId) || a.decision) continue;
    w.decide(a.id, a.owner, REASONS[i++ % REASONS.length]);
  }
}

const lastReport = (w, periodId) => {
  const rs = w.reportsFor(periodId);
  return rs.length ? rs[rs.length - 1] : null;
};
const close = (a, b) => Math.abs(a - b) < 0.011;
const ownerOk = (a) => typeof a.owner === "string" && a.owner.trim().length > 0;
const inList = (a) => ANOMALY_KINDS.includes(a.kind);

export const scenarios = [
  {
    checkId: "entry-traces-to-person-day-job",
    world: () => {
      const es = traceEntries();
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es, [UNALLOCATED]) });
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const firstEscalate = w.firstCall("escalate");
      const readPeople = w.firstCall("read_contacts", (c) => c.request?.people === true);
      const readAlloc = w.firstCall("read_job", (c) => c.request?.allocations === true);
      if (readPeople < 0 || readAlloc < 0 || firstEscalate < 0) return false;
      if (!(readPeople < firstEscalate && readAlloc < firstEscalate)) return false;
      const r = lastReport(w, W39.id);
      if (!r || r.lines.length !== 7) return false;
      const alloc = allocationsFor(traceEntries(), [UNALLOCATED]);
      const allTraced = r.lines.every(
        (l) =>
          PEOPLE.some((p) => p.id === l.personId) &&
          typeof l.date === "string" &&
          alloc.some((a) => a.personId === l.personId && a.jobId === l.jobId && a.date === l.date),
      );
      const flagged = w.anomaliesFor(UNALLOCATED).some((a) => a.kind === "not_allocated");
      const notALine = !r.lines.some((l) => l.entryId === UNALLOCATED);
      return allTraced && flagged && notALine;
    },
    describe: (w) => {
      const r = lastReport(w, W39.id);
      return `${w.calls.length} port call(s); ${r ? r.lines.length : 0} line(s) published; anomalies on ${UNALLOCATED}: ${w.anomaliesFor(UNALLOCATED).map((a) => a.kind).join(", ") || "none"}`;
    },
  },
  {
    checkId: "totals-computed-never-typed",
    world: () => {
      const es = [
        entry("doc-601#1", "P1", WEEK[0], "J-100", "09:00", "12:00", 0, "onsite"),
        entry("doc-601#2", "P1", WEEK[0], "J-200", "12:30", "17:15", 15, "remote"),
        entry("doc-601#3", "P1", WEEK[1], "J-100", "08:45", "16:15", 30, "onsite"),
        entry("doc-602#1", "P2", WEEK[0], "J-200", "09:00", "17:00", 30, null),
        entry("doc-602#2", "P2", WEEK[2], "J-200", "10:00", "14:20", 0, "remote"),
      ];
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es) });
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const r = lastReport(w, W39.id);
      if (!r || r.totals.length === 0) return false;
      const es = w.entriesIn(W39.id);
      const sound = r.totals.every((t) => {
        if (!Array.isArray(t.entryIds) || t.entryIds.length === 0) return false;
        const named = t.entryIds.map((id) => w.entry(id));
        if (named.some((e) => !e || e.personId !== t.personId)) return false;
        if (t.date !== null && named.some((e) => e.date !== t.date)) return false;
        return close(t.hours, named.reduce((s, e) => s + hoursOf(e), 0));
      });
      const complete = ["P1", "P2"].every((pid) => {
        const mine = es.filter((e) => e.personId === pid);
        const weekly = r.totals.find((t) => t.personId === pid && t.date === null);
        const days = [...new Set(mine.map((e) => e.date))];
        return Boolean(weekly) && weekly.entryIds.length === mine.length && days.every((d) => r.totals.some((t) => t.personId === pid && t.date === d));
      });
      return sound && complete;
    },
    describe: (w) => {
      const r = lastReport(w, W39.id);
      return r ? `totals: ${r.totals.map((t) => `${t.personId}:${t.date ?? "week"}=${t.hours}[${t.entryIds.length}]`).join(" ")}` : "no report published";
    },
  },
  {
    checkId: "anomalies-are-a-closed-list",
    world: anomalyWorld,
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (w.anomalies.length === 0) return false;
      const has = (id, kind, owner) => w.anomaliesFor(id).some((a) => a.kind === kind && ownerOk(a) && (owner === undefined || a.owner === owner));
      const overlap = OVERLAP.every((id) => has(id, "overlap", "Dana Ruiz"));
      const over = has(TWELVE, "over_hours", "Dana Ruiz");
      const unalloc = has(UNALLOC_3, "not_allocated");
      const closed = w.anomalies.every((a) => inList(a) && ownerOk(a));
      return overlap && over && unalloc && closed;
    },
    describe: (w) => `anomalies: ${w.anomalies.map((a) => `${a.entryId}:${a.kind}:${a.owner || "(no owner)"}`).join(", ") || "none"}`,
  },
  {
    checkId: "award-rule-is-cited-with-an-edition",
    world: () => {
      const es = [
        entry("doc-701#1", "P1", WEEK[1], "J-100", "08:00", "18:00", 30, "onsite"), // 9.5 h weekday
        entry("doc-701#2", "P1", SAT, "J-100", "09:00", "15:00", 30, "onsite"), // Saturday
        entry("doc-702#1", "P2", WEEK[1], "J-200", "09:00", "17:00", 30, "remote"), // plain
      ];
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es) });
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const firstRead = w.firstCall("read_rule");
      const firstCite = w.firstCall("cite");
      if (firstRead < 0 || firstCite < 0 || firstRead > firstCite) return false;
      const cardOk = (id, topic) =>
        w.cardsFor(id).some((c) => {
          const r = w.rule(c.ruleId);
          return Boolean(r) && r.edition === c.edition && r.effectiveFrom === c.effectiveFrom && r.covers.includes(topic) && c.ruleId === "CLERKS-2026";
        });
      const r = lastReport(w, W39.id);
      if (!r) return false;
      const lineTopics = (id) => r.lines.find((l) => l.entryId === id)?.topics ?? [];
      const ot = cardOk("doc-701#1", "overtime_daily") && lineTopics("doc-701#1").includes("overtime_daily");
      const sat = cardOk("doc-701#2", "saturday") && lineTopics("doc-701#2").includes("saturday");
      const noBareRule = r.lines.every((l) => l.topics.length === 0 || w.cardsFor(l.entryId).length > 0);
      return ot && sat && noBareRule;
    },
    describe: (w) => `cards: ${w.cards.map((c) => `${c.entryId}:${c.ruleId}@${c.edition}`).join(", ") || "none"}`,
  },
  {
    checkId: "superseded-rule-cannot-apply",
    world: () => {
      const es = [
        entry("doc-801#1", "P1", WEEK[1], "J-100", "08:00", "18:00", 30, "onsite"), // W39 overtime
        entry("doc-811#1", "P1", "2026-10-06", "J-100", "08:00", "18:00", 30, "onsite"), // W41 overtime
        entry("doc-811#2", "P2", "2026-10-10", "J-200", "09:00", "15:00", 30, "onsite"), // W41 Saturday
      ];
      return new TimesheetWorld({
        people: PEOPLE,
        period: W39,
        entries: es,
        roster: rosterFor(es),
        allocations: allocationsFor(es),
        rules: [
          rule("CLERKS-ED1", "2026-07", "2026-07-01", null, ["overtime_daily", "saturday"]),
          // The next edition names overtime only. Saturday is not plainly covered by it.
          rule("CLERKS-ED2", "2026-10", "2026-10-01", null, ["overtime_daily"]),
        ],
      });
    },
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(14 * 86_400_000);
      w.retireRule("CLERKS-ED1", "2026-09-30");
      w.setPeriod(W41);
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.cardsFor("doc-801#1");
      const later = [...w.cardsFor("doc-811#1"), ...w.cardsFor("doc-811#2")];
      const firstOk = first.length > 0 && first.every((c) => c.edition === "2026-07" && c.ruleId === "CLERKS-ED1");
      const laterOk = w.cardsFor("doc-811#1").length > 0 && later.every((c) => c.ruleId === "CLERKS-ED2" && c.edition === "2026-10");
      const parked = w.anomaliesFor("doc-811#2").some((a) => a.kind === "rule_unclear" && ownerOk(a)) && w.cardsFor("doc-811#2").length === 0;
      return firstOk && laterOk && parked;
    },
    describe: (w) => `cards: ${w.cards.map((c) => `${c.entryId}:${c.ruleId}@${c.edition}`).join(", ") || "none"}; anomalies: ${w.anomalies.map((a) => `${a.entryId}:${a.kind}`).join(", ") || "none"}`,
  },
  {
    checkId: "no-interpretation",
    world: () => {
      const es = [
        entry("doc-901#1", "P1", WEEK[2], "J-100", "09:00", "17:30", 30, "onsite", ["disputed_break"]),
        entry("doc-901#2", "P1", WEEK[3], "J-100", "09:00", "17:00", 30, "onsite"),
      ];
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es) });
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const id = "doc-901#1";
      const parked = w.anomaliesFor(id).some((a) => a.kind === "rule_unclear" && ownerOk(a));
      const noCard = w.cardsFor(id).length === 0;
      const r = lastReport(w, W39.id);
      const notALine = Boolean(r) && !r.lines.some((l) => l.entryId === id) && r.lines.some((l) => l.entryId === "doc-901#2");
      return parked && noCard && notALine;
    },
    describe: (w) => `anomalies: ${w.anomalies.map((a) => `${a.entryId}:${a.kind}`).join(", ") || "none"}; cards: ${w.cards.length}`,
  },
  {
    checkId: "anomaly-is-resolved-by-a-person-with-a-reason",
    world: anomalyWorld,
    drive: async (build, w) => {
      await build(w.ports());
      w.unresolvedAfterFirstRun = w.anomalies.filter((a) => a.resolution === null).length;
      w.advance(3_600_000);
      decideAll(w);
      w.advance(3_600_000);
      await build(w.ports());
    },
    holds: (w) => {
      if (w.anomalies.length < 4) return false;
      if (w.unresolvedAfterFirstRun !== w.anomalies.length) return false; // nothing cleared before a person decided
      return w.anomalies.every(
        (a) =>
          a.decision !== null &&
          a.resolution !== null &&
          a.resolution.by === a.decision.by &&
          a.resolution.reason === a.decision.reason &&
          ["approved", "corrected", "rejected"].includes(a.resolution.reason) &&
          a.resolution.at >= a.decision.at &&
          a.evidence.some((ref) => ref.includes(a.decision.by) && ref.includes(a.decision.reason)),
      );
    },
    describe: (w) => `anomalies: ${w.anomalies.map((a) => `${a.kind}:${a.resolution ? `${a.resolution.by ?? "(nobody)"}/${a.resolution.reason}` : "open"}:ev${a.evidence.length}`).join(", ") || "none"}`,
  },
  {
    checkId: "nothing-reaches-payroll-without-a-release",
    world: anomalyWorld,
    drive: async (build, w) => {
      // Run 1: anomalies open, nobody has released.
      await build(w.ports());
      w.exportsAfterRun1 = w.exports.length;
      // Run 2: a named person releases, but one anomaly is still undecided.
      w.advance(3_600_000);
      decideAll(w, [TWELVE]);
      w.release("Hannah Lee");
      await build(w.ports());
      w.exportsAfterRun2 = w.exports.length;
      // Run 3: the last anomaly decided; the release stands.
      w.advance(3_600_000);
      decideAll(w);
      await build(w.ports());
    },
    holds: (w) => {
      if (w.anomalies.length === 0) return false;
      if (w.exportsAfterRun1 !== 0 || w.exportsAfterRun2 !== 0) return false;
      const xs = w.exportsFor(W39.id);
      if (xs.length !== 1 || xs[0].releasedBy !== "Hannah Lee") return false;
      const release = w.firstCall("gate", (c) => c.request?.release === W39.id && c.request?.person === "Hannah Lee");
      const write = w.firstCall("write_ledger");
      if (release < 0 || write < 0 || write < release) return false;
      const writes = w.calls.filter((c) => c.port === "write_ledger");
      return writes.every((c) => c.request?.openAtWrite === 0 && c.request?.releasedBy === "Hannah Lee");
    },
    describe: (w) => `exports after runs 1/2/3: ${w.exportsAfterRun1}/${w.exportsAfterRun2}/${w.exports.length}; released by ${w.exports[0]?.releasedBy ?? "nobody"}`,
  },
  {
    checkId: "one-export-per-period",
    world: () => {
      const es = traceEntries().filter((e) => e.id !== UNALLOCATED);
      const w = world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es) });
      w.release("Hannah Lee");
      return w;
    },
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(3_600_000);
      await build(w.ports());
    },
    holds: (w) => {
      const xs = w.exportsFor(W39.id);
      if (xs.length !== 1) return false;
      if (typeof xs[0].externalId !== "string" || xs[0].externalId.length === 0) return false;
      const writes = w.calls.filter((c) => c.port === "write_ledger");
      if (writes.length === 0) return false;
      const creates = writes.filter((c) => !c.request?.update);
      const r = lastReport(w, W39.id);
      return creates.length === 1 && Boolean(r) && r.exportExternalId === xs[0].externalId;
    },
    describe: (w) => `exports: ${w.exportsFor(W39.id).map((x) => `${x.id}->${x.externalId} (updates ${x.updates})`).join(", ") || "none"}`,
  },
  {
    checkId: "the-run-publishes-regardless",
    world: () => {
      const es = traceEntries().filter((e) => e.id !== UNALLOCATED);
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es) });
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const rs = w.reportsFor(W39.id);
      if (rs.length !== 1) return false;
      const r = rs[0];
      const everyone = ["P1", "P2", "P3"].every((pid) => r.totals.some((t) => t.personId === pid && t.date === null && t.hours > 0));
      return r.anomaliesFound === 0 && r.anomaliesResolved === 0 && "release" in r && r.release === null && everyone && r.lines.length === 7;
    },
    describe: (w) => {
      const r = lastReport(w, W39.id);
      return r ? `report: ${r.lines.length} line(s), found ${r.anomaliesFound}, resolved ${r.anomaliesResolved}, release ${r.release}` : "no report for a clean period";
    },
  },
  {
    checkId: "the-record-by-person-and-period",
    world: () => {
      const es = [...anomalyEntries(), entry("doc-504#1", "P2", WEEK[3], "J-200", "08:00", "18:00", 30, "onsite")];
      return world({ entries: es, roster: rosterFor(es), allocations: allocationsFor(es, [UNALLOC_3]) });
    },
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(3_600_000);
      decideAll(w);
      w.release("Hannah Lee");
      await build(w.ports());
    },
    holds: (w) => {
      if (w.exportsFor(W39.id).length !== 1) return false;
      let anyCard = false;
      let anyAnomaly = false;
      const ok = ["P1", "P2", "P3"].every((pid) => {
        const rec = w.recordFor(pid, W39.id);
        if (rec.entries.length === 0) return false;
        if (rec.release.by !== "Hannah Lee" || !rec.exportExternalId) return false;
        anyAnomaly ||= rec.anomalies.length > 0;
        anyCard ||= rec.cards.length > 0;
        const anomaliesOk = rec.anomalies.every((a) => a.resolution && a.resolution.by && a.resolution.reason && a.evidence.length > 0);
        const cardsOk = rec.cards.every((c) => {
          const r = w.rule(c.ruleId);
          return Boolean(r) && r.edition === c.edition;
        });
        return anomaliesOk && cardsOk;
      });
      return ok && anyCard && anyAnomaly;
    },
    describe: (w) =>
      ["P1", "P2", "P3"]
        .map((pid) => {
          const rec = w.recordFor(pid, W39.id);
          return `${pid}: ${rec.entries.length} entries, ${rec.anomalies.length} anomalies, ${rec.cards.length} cards, release ${rec.release.by ?? "none"}`;
        })
        .join("; "),
  },
  {
    checkId: "survives-the-builder",
    // Closed by evidence, not by a run: the runner reports evidence_required.
    // Declared: the build is this folder, readable by anyone, and it runs on
    // the business's own account (its document store, job system and payroll).
    // Who else can explain it is the business's to name; nothing here scores it.
    world: () => new TimesheetWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "not a software check",
  },
];

// The pass test runs on the business's own systems, by hand. On the stub the
// runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TimesheetWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of timesheet-check-build-standard, for Hours Check.
 *
 * Scaffolded by `npx @aipathway/conformance init timesheet-check-build-standard`
 * from https://aipathway.com.au/explore-ai/timesheet-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (what was recorded through its ports, and
 * world.calls), never the build's own memory, and returns a strict boolean.
 *
 * The award here is held as dated editions with an id, an edition and an
 * effective date, the shape the standard asks for. The instrument named is the
 * Building and Construction General On-site Award [MA000020]; the editions and
 * text are test fixtures, not rates, and say nothing about what the award pays.
 */

import { TimesheetWorld } from "@aipathway/conformance";

const KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];
const HOUR = 3_600_000;

// Week 39: Monday 21 to Sunday 27 September 2026. Week 41: 5 to 11 October.
const W39 = { id: "2026-W39", from: "2026-09-21", to: "2026-09-27" };
const W41 = { id: "2026-W41", from: "2026-10-05", to: "2026-10-11" };

const PEOPLE = [
  { id: "P1", name: "Sam Nguyen", supervisor: "Lee Brooks" },
  { id: "P2", name: "Ari Patel", supervisor: "Lee Brooks" },
  { id: "P3", name: "Jo Kelly", supervisor: "Mia Ross" },
];

const INSTRUMENT = "Building and Construction General On-site Award [MA000020]";
const ED1 = {
  id: "MA000020-penalties-2025",
  instrument: INSTRUMENT,
  edition: "2025-07-01",
  effectiveFrom: "2025-07-01",
  effectiveTo: null,
  text: "Fixture: weekday hours beyond ordinary daily hours are overtime; Saturday work attracts the Saturday penalty.",
  covers: ["overtime_daily", "saturday"],
  retired: false,
};
const ED2 = {
  ...ED1,
  id: "MA000020-penalties-2026",
  edition: "2026-10-05",
  effectiveFrom: "2026-10-05",
  covers: ["overtime_daily", "saturday"],
};
const RULES = [ED1, ED2];

const e = (id, personId, date, jobId, start, end, breakMinutes, extra = {}) => ({ id, personId, date, jobId, start, end, breakMinutes, source: "app", ...extra });
const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

/** Everyone rostered and allocated to their job on every day listed, unless told otherwise. */
function worldOf({ entries, rules = RULES, period = W39, alloc = [], noAlloc = [], extraDays = [] }) {
  const allDays = [...days(W39.from, 7), ...days(W41.from, 7), ...extraDays];
  const roster = [];
  const allocations = [...alloc];
  for (const p of PEOPLE) {
    for (const d of allDays) {
      roster.push({ personId: p.id, date: d, rostered: dowOf(d) !== 0 });
      const job = { P1: "J100", P2: "J200", P3: "J300" }[p.id];
      if (!noAlloc.includes(`${p.id}|${d}`)) allocations.push({ personId: p.id, jobId: job, date: d });
    }
  }
  return new TimesheetWorld({ people: PEOPLE, roster, allocations, entries, rules, period });
}
function dowOf(d) {
  return new Date(`${d}T00:00:00.000Z`).getUTCDay();
}

// Pure readings of the world, shared by the holds.
const hoursOf = (x) => {
  const m = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return Math.round(((m(x.end) - m(x.start) - x.breakMinutes) / 60) * 100) / 100;
};
const lastReport = (world, periodId = world.current().id) => world.reportsFor(periodId).at(-1);
const lineIds = (world, periodId) => new Set((lastReport(world, periodId)?.lines ?? []).map((l) => l.entryId));
const exportLineIds = (world) => new Set(world.exports.flatMap((x) => x.lines.map((l) => l.entryId)));
const kindsFor = (world, entryId) => world.anomaliesFor(entryId).map((a) => a.kind);

// Eight entries across three people for week 39, all clean but one: E8 is on
// a job P3 was never allocated.
const EIGHT_CLEAN_BUT_ONE = [
  e("E1", "P1", "2026-09-21", "J100", "07:00", "15:30", 30),
  e("E2", "P1", "2026-09-22", "J100", "07:00", "15:30", 30),
  e("E3", "P1", "2026-09-23", "J100", "07:00", "15:00", 30),
  e("E4", "P2", "2026-09-21", "J200", "06:30", "14:30", 30),
  e("E5", "P2", "2026-09-22", "J200", "06:30", "13:00", 30),
  e("E6", "P3", "2026-09-21", "J300", "07:00", "15:30", 30),
  e("E7", "P3", "2026-09-22", "J300", "07:00", "15:30", 30),
  e("E8", "P3", "2026-09-23", "J999", "07:00", "15:30", 30),
];

// The eight seeded for check 3: an overlapping pair (E2/E3), a twelve-hour day
// (E5) and an unallocated job (E8), with four clean entries around them.
const EIGHT_WITH_ANOMALIES = [
  e("E1", "P1", "2026-09-21", "J100", "07:00", "15:30", 30),
  e("E2", "P1", "2026-09-22", "J100", "07:00", "12:00", 0),
  e("E3", "P1", "2026-09-22", "J100", "11:30", "15:30", 0),
  e("E4", "P2", "2026-09-21", "J200", "07:00", "15:30", 30),
  e("E5", "P2", "2026-09-23", "J200", "06:00", "18:30", 30),
  e("E6", "P3", "2026-09-21", "J300", "07:00", "15:30", 30),
  e("E7", "P3", "2026-09-22", "J300", "07:00", "15:30", 30),
  e("E8", "P3", "2026-09-23", "J999", "07:00", "15:30", 30),
];

/** Run, let a person decide every anomaly in the queue, optionally release, run again. */
async function decideAndRerun(b, world, { reasons = ["approved", "corrected", "rejected"], by = "Lee Brooks", releaser = null } = {}) {
  await b(world.ports());
  world.firstRunEnd = world.calls.length;
  world.advance(HOUR);
  world.anomalies.forEach((a, i) => world.decide(a.id, by, reasons[i % reasons.length]));
  world.decidedBy = by;
  if (releaser) world.release(releaser);
  world.advance(HOUR);
  await b(world.ports());
}

export const scenarios = [
  {
    checkId: "entry-traces-to-person-day-job",
    // 1. Eight entries, three people, E8 on a job P3 was never allocated.
    world: () => worldOf({ entries: EIGHT_CLEAN_BUT_ONE }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const firstAnomaly = world.firstCall("escalate");
      const people = world.firstCall("read_contacts", (c) => c.request?.people === true);
      const allocs = world.firstCall("read_job", (c) => c.request?.allocations === true);
      if (firstAnomaly < 0 || people < 0 || allocs < 0 || people > firstAnomaly || allocs > firstAnomaly) return false;
      const report = lastReport(world);
      if (!report || report.lines.length !== 7) return false;
      const ids = new Set(PEOPLE.map((p) => p.id));
      const allTraced = report.lines.every((l) => {
        const src = world.entry(l.entryId);
        return Boolean(src) && ids.has(l.personId) && l.personId === src.personId && l.date === src.date && l.jobId === src.jobId && l.jobId === { P1: "J100", P2: "J200", P3: "J300" }[l.personId];
      });
      const e8 = world.anomaliesFor("E8");
      return allTraced && e8.some((a) => a.kind === "not_allocated" && typeof a.owner === "string" && a.owner.length > 0) && !lineIds(world).has("E8") && !exportLineIds(world).has("E8");
    },
    describe: (world) => `lines ${[...lineIds(world)].join(",") || "none"}; E8 anomalies ${kindsFor(world, "E8").join(",") || "none"}; ${world.calls.length} port call(s)`,
  },
  {
    checkId: "totals-computed-never-typed",
    // 2. Two people, clean entries over three days, totals known in advance.
    world: () =>
      worldOf({
        entries: [
          e("T1", "P1", "2026-09-21", "J100", "07:00", "15:30", 30), // 8
          e("T2", "P1", "2026-09-22", "J100", "07:00", "11:00", 0), // 4, then a second block the same day
          e("T3", "P1", "2026-09-22", "J100", "12:00", "16:00", 0), // 4
          e("T4", "P1", "2026-09-23", "J100", "07:00", "14:30", 30), // 7
          e("T5", "P2", "2026-09-21", "J200", "06:30", "14:30", 30), // 7.5
          e("T6", "P2", "2026-09-22", "J200", "06:30", "13:00", 30), // 6
          e("T7", "P2", "2026-09-23", "J200", "06:45", "15:00", 30), // 7.75
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const report = lastReport(world);
      if (!report) return false;
      const expected = {
        "P1|2026-09-21": 8, "P1|2026-09-22": 8, "P1|2026-09-23": 7, "P1|week": 23,
        "P2|2026-09-21": 7.5, "P2|2026-09-22": 6, "P2|2026-09-23": 7.75, "P2|week": 21.25,
      };
      const seen = new Map(report.totals.map((t) => [`${t.personId}|${t.date ?? "week"}`, t]));
      for (const [k, hours] of Object.entries(expected)) {
        const t = seen.get(k);
        if (!t || t.hours !== hours) return false;
      }
      return report.totals.every((t) => {
        if (!Array.isArray(t.entryIds) || t.entryIds.length === 0) return false;
        const src = t.entryIds.map((id) => world.entry(id));
        if (src.some((x) => !x || x.personId !== t.personId || (t.date !== null && x.date !== t.date))) return false;
        const sum = Math.round(src.reduce((s, x) => s + hoursOf(x), 0) * 100) / 100;
        return sum === t.hours;
      });
    },
    describe: (world) => `totals ${(lastReport(world)?.totals ?? []).map((t) => `${t.personId}:${t.date ?? "week"}=${t.hours}[${t.entryIds.join("+")}]`).join(" ") || "none"}`,
  },
  {
    checkId: "anomalies-are-a-closed-list",
    // 3. The overlap pair E2/E3, the twelve-hour day E5, the unallocated E8.
    world: () => worldOf({ entries: EIGHT_WITH_ANOMALIES }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const has = (id, kind, owner) => world.anomaliesFor(id).some((a) => a.kind === kind && (owner ? a.owner === owner : a.owner.length > 0));
      const named = has("E2", "overlap", "Lee Brooks") && has("E3", "overlap", "Lee Brooks") && has("E5", "over_hours", "Lee Brooks") && has("E8", "not_allocated");
      const closed = world.anomalies.length > 0 && world.anomalies.every((a) => KINDS.includes(a.kind) && typeof a.owner === "string" && a.owner.trim().length > 0);
      const cleanUntouched = ["E1", "E4", "E6", "E7"].every((id) => world.anomaliesFor(id).length === 0);
      return named && closed && cleanUntouched;
    },
    describe: (world) => `anomalies ${world.anomalies.map((a) => `${a.entryId}:${a.kind}:${a.owner || "(no owner)"}`).join(" ") || "none"}`,
  },
  {
    checkId: "award-rule-is-cited-with-an-edition",
    // 4. A ten-hour weekday (overtime) and a Saturday, two editions in the store.
    world: () =>
      worldOf({
        entries: [
          e("R1", "P1", "2026-09-21", "J100", "06:00", "16:30", 30), // 10h Monday
          e("R2", "P2", "2026-09-26", "J200", "07:00", "13:00", 30), // Saturday
          e("R3", "P3", "2026-09-22", "J300", "07:00", "15:30", 30), // ordinary
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = world.firstCall("read_rule");
      const cite = world.firstCall("cite");
      if (read < 0 || cite < 0 || read > cite) return false;
      const good = (id) => {
        const cards = world.cardsFor(id);
        return cards.length > 0 && cards.every((c) => {
          const r = world.rule(c.ruleId);
          return Boolean(r) && c.edition === r.edition && c.effectiveFrom === r.effectiveFrom && r.effectiveFrom <= world.entry(id).date;
        });
      };
      const report = lastReport(world);
      if (!report) return false;
      const r1 = report.lines.find((l) => l.entryId === "R1");
      const r2 = report.lines.find((l) => l.entryId === "R2");
      if (!r1 || !r2 || !r1.topics.includes("overtime_daily") || !r2.topics.includes("saturday")) return false;
      // Every line that applies a rule has a card from an edition covering it.
      const carded = report.lines.every((l) => l.topics.every((t) => world.cardsFor(l.entryId).some((c) => world.rule(c.ruleId)?.covers.includes(t))));
      return good("R1") && good("R2") && world.cardsFor("R3").length === 0 && carded;
    },
    describe: (world) => `cards ${world.cards.map((c) => `${c.entryId}:${c.ruleId}@${c.edition}`).join(" ") || "none"}`,
  },
  {
    checkId: "superseded-rule-cannot-apply",
    // 5. Week 39 under the 2025 edition; the 2025 edition retired; week 41 under 2026.
    world: () =>
      worldOf({
        entries: [
          e("S1", "P1", "2026-09-21", "J100", "06:00", "16:30", 30),
          e("S2", "P2", "2026-09-26", "J200", "07:00", "13:00", 30),
          e("S3", "P1", "2026-10-05", "J100", "06:00", "16:30", 30),
          e("S4", "P2", "2026-10-10", "J200", "07:00", "13:00", 30),
        ],
        rules: [ED1, { ...ED2 }],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(7 * 24 * HOUR);
      world.retireRule(ED1.id, "2026-10-04");
      world.setPeriod(W41);
      await b(world.ports());
    },
    holds: (world) => {
      const first = [...world.cardsFor("S1"), ...world.cardsFor("S2")];
      const later = [...world.cardsFor("S3"), ...world.cardsFor("S4")];
      return (
        world.cardsFor("S1").length > 0 && world.cardsFor("S2").length > 0 &&
        world.cardsFor("S3").length > 0 && world.cardsFor("S4").length > 0 &&
        first.every((c) => c.ruleId === ED1.id && c.edition === ED1.edition) &&
        later.every((c) => c.ruleId === ED2.id && c.edition === ED2.edition)
      );
    },
    describe: (world) => `cards ${world.cards.map((c) => `${c.entryId}:${c.edition}`).join(" ") || "none"}`,
  },
  {
    checkId: "no-interpretation",
    // 6. A Saturday entry flagged as a disputed break, which no edition covers.
    world: () =>
      worldOf({
        entries: [
          e("U1", "P1", "2026-09-26", "J100", "07:00", "13:00", 30, { flags: ["disputed_break"] }),
          e("U2", "P2", "2026-09-21", "J200", "07:00", "15:30", 30),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const parked = world.anomaliesFor("U1").some((a) => a.kind === "rule_unclear" && typeof a.owner === "string" && a.owner.length > 0);
      const report = lastReport(world);
      return parked && world.cardsFor("U1").length === 0 && Boolean(report) && lineIds(world).has("U2") && !lineIds(world).has("U1") && !exportLineIds(world).has("U1");
    },
    describe: (world) => `U1 anomalies ${kindsFor(world, "U1").join(",") || "none"}; U1 cards ${world.cardsFor("U1").length}; lines ${[...lineIds(world)].join(",") || "none"}`,
  },
  {
    checkId: "anomaly-is-resolved-by-a-person-with-a-reason",
    // 7. Raised on run one, decided by Lee Brooks an hour later, run two.
    world: () => worldOf({ entries: EIGHT_WITH_ANOMALIES }),
    drive: (b, world) => decideAndRerun(b, world),
    holds: (world) => {
      if (world.anomalies.length < 4) return false;
      const resolves = world.calls.filter((c) => c.port === "gate" && c.request?.resolve);
      return world.anomalies.every((a) => {
        if (!a.decision || !a.resolution) return false;
        const sameHand = a.resolution.by === a.decision.by && a.resolution.reason === a.decision.reason && a.resolution.at >= a.decision.at;
        const evidenced = a.evidence.some((ref) => ref.includes(a.decision.by) && ref.includes(a.decision.reason));
        const neverEarly = resolves.filter((c) => c.request.resolve === a.id).every((c) => c.at >= a.decision.at && c.request.by === a.decision.by);
        return sameHand && evidenced && neverEarly;
      });
    },
    describe: (world) => `resolutions ${world.anomalies.map((a) => `${a.id}:${a.resolution ? `${a.resolution.by}/${a.resolution.reason}` : "open"}:ev${a.evidence.length}`).join(" ") || "none"}`,
  },
  {
    checkId: "nothing-reaches-payroll-without-a-release",
    // 8. Run one with anomalies open and no release; decided, released by Dana Hill; run two.
    world: () => worldOf({ entries: EIGHT_WITH_ANOMALIES }),
    drive: async (b, world) => {
      await b(world.ports());
      world.exportsAfterFirst = world.exports.length;
      world.advance(HOUR);
      world.anomalies.forEach((a) => world.decide(a.id, "Lee Brooks", "approved"));
      world.release("Dana Hill");
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      if (world.exportsAfterFirst !== 0 || world.exports.length !== 1) return false;
      const release = world.firstCall("gate", (c) => c.request?.release === W39.id && c.request?.person === "Dana Hill");
      const writes = world.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "write_ledger");
      return (
        release >= 0 &&
        writes.length > 0 &&
        writes.every(([c, i]) => i > release && c.request.openAtWrite === 0 && c.request.releasedBy === "Dana Hill") &&
        world.exports[0].releasedBy === "Dana Hill" &&
        world.current().releasedBy === "Dana Hill"
      );
    },
    describe: (world) => `exports after run one ${world.exportsAfterFirst}, after run two ${world.exports.length}; released by ${world.current().releasedBy ?? "nobody"}`,
  },
  {
    checkId: "one-export-per-period",
    // 9. A clean period released by Dana Hill, run twice an hour apart.
    world: () => {
      const w = worldOf({ entries: EIGHT_CLEAN_BUT_ONE.slice(0, 7) });
      w.release("Dana Hill");
      return w;
    },
    drive: async (b, world) => {
      await b(world.ports());
      world.secondRunFrom = world.calls.length;
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const xs = world.exportsFor(W39.id);
      if (xs.length !== 1 || typeof xs[0].externalId !== "string" || xs[0].externalId.length === 0) return false;
      const secondWrites = world.calls.slice(world.secondRunFrom).filter((c) => c.port === "write_ledger");
      const report = lastReport(world);
      return secondWrites.every((c) => typeof c.request.update === "string") && report?.exportExternalId === xs[0].externalId;
    },
    describe: (world) => `exports ${world.exportsFor(W39.id).map((x) => `${x.id}->${x.externalId} (updates ${x.updates})`).join(", ") || "none"}`,
  },
  {
    checkId: "the-run-publishes-regardless",
    // 10. A clean period, nothing to raise, nobody has released.
    world: () => worldOf({ entries: EIGHT_CLEAN_BUT_ONE.slice(0, 7) }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const reports = world.reportsFor(W39.id);
      if (reports.length !== 1) return false;
      const r = reports[0];
      const weekly = new Set(r.totals.filter((t) => t.date === null).map((t) => t.personId));
      return (
        world.anomalies.length === 0 &&
        r.anomaliesFound === 0 &&
        r.anomaliesResolved === 0 &&
        Object.prototype.hasOwnProperty.call(r, "release") &&
        r.release === null &&
        r.lines.length === 7 &&
        ["P1", "P2", "P3"].every((p) => weekly.has(p)) &&
        world.exports.length === 0
      );
    },
    describe: (world) => `reports ${world.reportsFor(W39.id).map((r) => `found ${r.anomaliesFound} resolved ${r.anomaliesResolved} release ${r.release}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-person-and-period",
    // 11. Three people through anomalies, decisions, release and export.
    world: () =>
      worldOf({
        entries: [...EIGHT_WITH_ANOMALIES, e("E9", "P2", "2026-09-26", "J200", "07:00", "13:00", 30)],
      }),
    drive: (b, world) => decideAndRerun(b, world, { reasons: ["approved", "corrected"], releaser: "Dana Hill" }),
    holds: (world) => {
      if (world.exports.length !== 1) return false;
      const recs = PEOPLE.map((p) => world.recordFor(p.id, W39.id));
      const allCards = recs.flatMap((r) => r.cards);
      const allAnoms = recs.flatMap((r) => r.anomalies);
      return (
        recs.every((r) => r.entries.length > 0 && r.release.by === "Dana Hill" && typeof r.exportExternalId === "string") &&
        allAnoms.length >= 4 &&
        allAnoms.every((a) => a.resolution && a.resolution.by && a.resolution.reason && a.evidence.length > 0) &&
        allCards.length > 0 &&
        allCards.every((c) => world.rule(c.ruleId) && c.edition)
      );
    },
    describe: (world) => PEOPLE.map((p) => {
      const r = world.recordFor(p.id, W39.id);
      return `${p.id}: ${r.entries.length} entries, ${r.anomalies.length} anomalies (${r.anomalies.filter((a) => a.resolution).length} resolved), ${r.cards.length} cards, release ${r.release.by ?? "none"}`;
    }).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store, roster and release run on the
    // business's own account. Never scored green on our own say-so.
    world: () => worldOf({ entries: [] }),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on the business's own job system, roster and payroll,
// released by a person. There is no production run of it yet, so the stub
// reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TimesheetWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

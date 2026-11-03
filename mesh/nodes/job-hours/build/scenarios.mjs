/**
 * One scenario per check of timesheet-check-build-standard, for Job Hours.
 *
 * Scaffolded by `npx @aipathway/conformance init timesheet-check-build-standard`
 * from https://aipathway.com.au/explore-ai/timesheet-check-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * and the queue, cards, reports and exports the ports wrote), never the
 * build's own memory, and compares it with the fixtures below.
 */

import { TimesheetWorld } from "@aipathway/conformance";

/** The standard's closed list of anomaly kinds (section 2). */
const ANOMALY_KINDS = ["over_hours", "overlap", "missing_break", "not_rostered", "not_allocated", "rule_unclear"];

/** Hours after the break, computed here independently of the build. */
const hoursOf = (e) => {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.round(((m(e.end) - m(e.start) - e.breakMinutes) / 60) * 100) / 100;
};

const HOUR = 3_600_000;
const PERIOD = { id: "2026-W39", from: "2026-09-21", to: "2026-09-27" }; // Mon 21 to Sun 27 September
const LATER = { id: "2026-W41", from: "2026-10-05", to: "2026-10-11" };
const RELEASER = "Pat Nguyen";

const PEOPLE = [
  { id: "P1", name: "Ana Ruiz", supervisor: "Sam Hart" },
  { id: "P2", name: "Ben Ito", supervisor: "Sam Hart" },
  { id: "P3", name: "Cal Moore", supervisor: "Jo Lane" },
];
const supervisorOf = (pid) => PEOPLE.find((p) => p.id === pid).supervisor;

const AWARD = "Building and Construction General On-site Award 2020";
const R1 = { id: "BCGOA-2025", instrument: AWARD, edition: "2025-07-01", effectiveFrom: "2025-07-01", effectiveTo: null, text: "Overtime after 8 hours on a weekday; Saturday and Sunday penalties.", covers: ["overtime_daily", "saturday", "sunday"], retired: false };
const R2 = { id: "BCGOA-2026", instrument: AWARD, edition: "2026-10-01", effectiveFrom: "2026-10-01", effectiveTo: null, text: "Overtime after 8 hours on a weekday; Saturday and Sunday penalties.", covers: ["overtime_daily", "saturday", "sunday"], retired: false };
const RULES = [R1, R2];

/** An entry. Defaults are a clean eight-hour day: 07:00 to 15:30 with a thirty-minute break. */
const E = (id, personId, date, jobId, start = "07:00", end = "15:30", breakMinutes = 30, flags) => ({
  id, personId, date, jobId, start, end, breakMinutes, source: "app", ...(flags ? { flags } : {}),
});

/**
 * A world whose roster and allocations match the entries, except the ones
 * named as unallocated or unrostered. The job system and the roster are
 * seeded, not derived by the build.
 */
function worldOf({ entries, unallocated = [], unrostered = [], period = PERIOD }) {
  const allocations = [];
  const roster = [];
  for (const e of entries) {
    if (e.jobId && !unallocated.includes(e.id)) allocations.push({ personId: e.personId, jobId: e.jobId, date: e.date });
    if (!unrostered.includes(e.id)) roster.push({ personId: e.personId, date: e.date, rostered: true });
  }
  // A job the unallocated tech claimed is real and allocated, just to somebody else.
  allocations.push({ personId: "P1", jobId: "J9", date: "2026-09-22" });
  return new TimesheetWorld({ people: PEOPLE, roster, allocations, entries, rules: RULES, period, now: new Date("2026-09-28T00:00:00.000Z") });
}

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const lastReport = (world, pid = PERIOD.id) => world.reportsFor(pid).at(-1);
const anomaliesOn = (world, entryId) => world.anomalies.filter((a) => a.entryId === entryId);
const ownerOk = (a) => typeof a.owner === "string" && a.owner.trim().length > 0;

// ── Fixtures ──

// Check 1: eight entries across three people; E8 is on J9, which P3 was never allocated.
const TRACE = [
  E("E1", "P1", "2026-09-21", "J1"),
  E("E2", "P1", "2026-09-22", "J1"),
  E("E3", "P1", "2026-09-23", "J1"),
  E("E4", "P2", "2026-09-21", "J2"),
  E("E5", "P2", "2026-09-22", "J2"),
  E("E6", "P2", "2026-09-23", "J2"),
  E("E7", "P3", "2026-09-21", "J3"),
  E("E8", "P3", "2026-09-22", "J9"),
];

// Check 3, 7 and 8: one overlapping pair, one twelve-hour day, one unallocated job, five clean.
const SEEDED = [
  E("S1", "P1", "2026-09-21", "J1", "07:00", "12:00", 0), // overlaps S2
  E("S2", "P1", "2026-09-21", "J1", "11:00", "15:30", 0),
  E("S3", "P1", "2026-09-22", "J1"),
  E("S4", "P2", "2026-09-22", "J2", "06:00", "18:30", 30), // twelve hours
  E("S5", "P2", "2026-09-23", "J2"),
  E("S6", "P3", "2026-09-23", "J9"), // never allocated to P3
  E("S7", "P3", "2026-09-24", "J3"),
  E("S8", "P3", "2026-09-25", "J3"),
];
const SEEDED_CLEAN = ["S3", "S5", "S7", "S8"];

// Check 2: clean entries for two people, P1 with two entries on one day.
const CLEAN_TWO = [
  E("C1", "P1", "2026-09-21", "J1", "07:00", "11:00", 0),
  E("C2", "P1", "2026-09-21", "J1", "11:30", "15:30", 0),
  E("C3", "P1", "2026-09-22", "J1"),
  E("C4", "P2", "2026-09-21", "J2", "07:00", "15:00", 30),
  E("C5", "P2", "2026-09-23", "J2", "07:00", "13:30", 30),
];
const CLEAN_TWO_EXPECTED = [
  ["P1", "2026-09-21", 8], ["P1", "2026-09-22", 8], ["P1", null, 16],
  ["P2", "2026-09-21", 7.5], ["P2", "2026-09-23", 6], ["P2", null, 13.5],
];

// Check 4: a 9.5-hour weekday (daily overtime) and a Saturday (penalty), plus a plain day.
const PENALTY = [
  E("W1", "P1", "2026-09-22", "J1", "06:00", "16:00", 30),
  E("W2", "P2", "2026-09-26", "J2", "07:00", "13:00", 30),
  E("W3", "P1", "2026-09-21", "J1"),
];

// Check 5: the same shapes again in a later period, after the first edition is retired.
const ACROSS = [
  ...PENALTY,
  E("L1", "P1", "2026-10-06", "J1", "06:00", "16:00", 30),
  E("L2", "P2", "2026-10-10", "J2", "07:00", "13:00", 30),
];

// Check 6: a disputed break no edition plainly names, beside a clean day.
const DISPUTED = [
  E("D1", "P1", "2026-09-23", "J1", "07:00", "15:30", 30, ["disputed_break"]),
  E("D2", "P1", "2026-09-22", "J1"),
];

// Check 9 and 10: a clean period.
const CLEAN = [
  E("K1", "P1", "2026-09-21", "J1"),
  E("K2", "P1", "2026-09-22", "J1"),
  E("K3", "P2", "2026-09-21", "J2"),
  E("K4", "P3", "2026-09-24", "J3"),
];

// Check 11: three people, an anomaly each, a Saturday card for P1.
const RECORD = [
  E("M1", "P1", "2026-09-21", "J1", "07:00", "12:00", 0),
  E("M2", "P1", "2026-09-21", "J1", "11:00", "15:30", 0),
  E("M3", "P1", "2026-09-26", "J1", "07:00", "13:00", 30),
  E("M4", "P2", "2026-09-22", "J2", "06:00", "18:30", 30),
  E("M5", "P3", "2026-09-23", "J9"),
  E("M6", "P3", "2026-09-24", "J3"),
];

/** Every open anomaly decided by its owner, with the given reason or "approved". */
function decideAll(world, reasons = {}) {
  for (const a of world.anomalies) if (!a.decision) world.decide(a.id, a.owner, reasons[a.entryId] ?? "approved");
}

export const scenarios = [
  {
    checkId: "entry-traces-to-person-day-job",
    // 1. Eight entries across three people, one on a job the person was never allocated.
    world: () => worldOf({ entries: TRACE, unallocated: ["E8"] }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const firstEscalate = world.firstCall("escalate");
      const peopleRead = world.firstCall("read_contacts", (c) => c.request?.people === true);
      const allocRead = world.firstCall("read_job", (c) => c.request?.allocations === true);
      const readFirst = firstEscalate >= 0 && peopleRead >= 0 && allocRead >= 0 && peopleRead < firstEscalate && allocRead < firstEscalate;
      const report = lastReport(world);
      if (!report) return false;
      const ids = new Set(PEOPLE.map((p) => p.id));
      const allocated = (l) => TRACE.some((e) => e.id === l.entryId && e.personId === l.personId && e.date === l.date && e.jobId === l.jobId && e.id !== "E8");
      const linesOk = report.lines.length === 7 && report.lines.every((l) => ids.has(l.personId) && l.date && l.jobId && allocated(l));
      const notALine = !report.lines.some((l) => l.entryId === "E8");
      const anomaly = anomaliesOn(world, "E8").some((a) => a.kind === "not_allocated" && ownerOk(a));
      const othersClean = TRACE.filter((e) => e.id !== "E8").every((e) => anomaliesOn(world, e.id).length === 0);
      return readFirst && linesOk && notALine && anomaly && othersClean;
    },
    describe: (world) => `${world.anomalies.length} anomaly(ies): ${world.anomalies.map((a) => `${a.entryId}:${a.kind}`).join(", ") || "none"}; lines ${lastReport(world)?.lines.length ?? "no report"}`,
  },
  {
    checkId: "totals-computed-never-typed",
    // 2. Clean entries for two people, with a daily and a weekly total expected for each.
    world: () => worldOf({ entries: CLEAN_TWO }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const report = lastReport(world);
      if (!report || report.totals.length === 0) return false;
      const derived = report.totals.every((t) => {
        if (!Array.isArray(t.entryIds) || t.entryIds.length === 0) return false;
        const named = t.entryIds.map((id) => CLEAN_TWO.find((e) => e.id === id));
        if (named.some((e) => !e || e.personId !== t.personId || (t.date !== null && e.date !== t.date))) return false;
        const sum = Math.round(named.reduce((s, e) => s + hoursOf(e), 0) * 100) / 100;
        return Math.abs(sum - t.hours) < 0.001;
      });
      const expected = CLEAN_TWO_EXPECTED.every(([pid, date, hours]) =>
        report.totals.some((t) => t.personId === pid && t.date === date && Math.abs(t.hours - hours) < 0.001),
      );
      return derived && expected && report.totals.length === CLEAN_TWO_EXPECTED.length;
    },
    describe: (world) => `totals: ${lastReport(world)?.totals.map((t) => `${t.personId}:${t.date ?? "week"}=${t.hours}[${t.entryIds.join("+")}]`).join(", ") ?? "no report"}`,
  },
  {
    checkId: "anomalies-are-a-closed-list",
    // 3. The eight seeded entries: one overlapping pair, one twelve-hour day, one unallocated job.
    world: () => worldOf({ entries: SEEDED, unallocated: ["S6"] }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const raised = callsTo(world, "escalate");
      const has = (entryId, kind, owner) =>
        raised.some((c) => c.request.entryId === entryId && c.request.kind === kind && (owner ? c.request.owner === owner : typeof c.request.owner === "string" && c.request.owner.trim() !== ""));
      const overlapPair = has("S1", "overlap", supervisorOf("P1")) && has("S2", "overlap", supervisorOf("P1"));
      const overHours = has("S4", "over_hours", supervisorOf("P2"));
      const unallocated = has("S6", "not_allocated");
      const closed = raised.length > 0 && raised.every((c) => ANOMALY_KINDS.includes(c.request.kind) && typeof c.request.owner === "string" && c.request.owner.trim() !== "");
      const cleanLeftAlone = SEEDED_CLEAN.every((id) => !raised.some((c) => c.request.entryId === id));
      return overlapPair && overHours && unallocated && closed && cleanLeftAlone && raised.length === 4;
    },
    describe: (world) => callsTo(world, "escalate").map((c) => `${c.request.entryId}:${c.request.kind}->${c.request.owner || "(no owner)"}`).join(", ") || "nothing raised",
  },
  {
    checkId: "award-rule-is-cited-with-an-edition",
    // 4. A weekday over eight hours and a Saturday, with two editions in the store.
    world: () => worldOf({ entries: PENALTY }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const ruleRead = world.firstCall("read_rule");
      const firstCite = world.firstCall("cite");
      if (ruleRead < 0 || firstCite < 0 || ruleRead > firstCite) return false;
      const cardOk = (entryId) =>
        world.cardsFor(entryId).length > 0 &&
        world.cardsFor(entryId).every((c) => {
          const r = RULES.find((x) => x.id === c.ruleId);
          return r && c.ruleId === R1.id && c.edition === r.edition && c.effectiveFrom === r.effectiveFrom;
        });
      const report = lastReport(world);
      if (!report) return false;
      const penalised = report.lines.filter((l) => l.topics.length > 0);
      const bothLines = ["W1", "W2"].every((id) => penalised.some((l) => l.entryId === id));
      const everyRuleCarded = penalised.every((l) => world.cardsFor(l.entryId).length > 0);
      const plainNoCard = world.cardsFor("W3").length === 0;
      return cardOk("W1") && cardOk("W2") && bothLines && everyRuleCarded && plainNoCard;
    },
    describe: (world) => `cards: ${world.cards.map((c) => `${c.entryId}:${c.ruleId}@${c.edition}`).join(", ") || "none"}`,
  },
  {
    checkId: "superseded-rule-cannot-apply",
    // 5. A period under the first edition, then the first retired and a later period under the second.
    world: () => worldOf({ entries: ACROSS }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(14 * 24 * HOUR);
      world.retireRule(R1.id, "2026-09-30");
      world.setPeriod(LATER);
      await b(world.ports());
    },
    holds: (world) => {
      const first = world.cards.filter((c) => ["W1", "W2"].includes(c.entryId));
      const later = world.cards.filter((c) => ["L1", "L2"].includes(c.entryId));
      const firstOk = ["W1", "W2"].every((id) => first.some((c) => c.entryId === id)) && first.every((c) => c.ruleId === R1.id && c.edition === R1.edition);
      const laterOk = ["L1", "L2"].every((id) => later.some((c) => c.entryId === id)) && later.every((c) => c.ruleId === R2.id && c.edition === R2.edition);
      return firstOk && laterOk;
    },
    describe: (world) => `cards: ${world.cards.map((c) => `${c.entryId}:${c.edition}`).join(", ") || "none"}`,
  },
  {
    checkId: "no-interpretation",
    // 6. One entry flagged as a disputed break, which no edition plainly covers.
    world: () => worldOf({ entries: DISPUTED }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const parked = anomaliesOn(world, "D1").some((a) => a.kind === "rule_unclear" && ownerOk(a));
      const noCard = world.cardsFor("D1").length === 0;
      const report = lastReport(world);
      if (!report) return false;
      const notALine = !report.lines.some((l) => l.entryId === "D1");
      const cleanIsLine = report.lines.some((l) => l.entryId === "D2");
      return parked && noCard && notALine && cleanIsLine;
    },
    describe: (world) => `D1 anomalies: ${anomaliesOn(world, "D1").map((a) => `${a.kind}->${a.owner}`).join(", ") || "none"}; D1 cards ${world.cardsFor("D1").length}`,
  },
  {
    checkId: "anomaly-is-resolved-by-a-person-with-a-reason",
    // 7. Anomalies raised on a first run, each decided by its owner, then a second run.
    world: () => worldOf({ entries: SEEDED, unallocated: ["S6"] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(HOUR);
      decideAll(world, { S1: "approved", S2: "corrected", S4: "approved", S6: "rejected" });
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      if (world.anomalies.length < 4) return false;
      const resolved = world.anomalies.every(
        (a) =>
          a.decision &&
          a.resolution &&
          a.resolution.by === a.decision.by &&
          a.resolution.reason === a.decision.reason &&
          a.resolution.at >= a.decision.at &&
          a.evidence.some((ref) => ref.includes(a.decision.by) && ref.includes(a.decision.reason)),
      );
      const everyGateNamed = callsTo(world, "gate", (c) => "resolve" in c.request).every((c) => typeof c.request.by === "string" && c.request.by.trim() !== "");
      const report = lastReport(world);
      const rejectedOut = report && !report.lines.some((l) => l.entryId === "S6") && report.lines.some((l) => l.entryId === "S1");
      return resolved && everyGateNamed && Boolean(rejectedOut);
    },
    describe: (world) => world.anomalies.map((a) => `${a.id}:${a.kind} decided ${a.decision?.by ?? "-"} resolved ${a.resolution?.by ?? "-"}/${a.resolution?.reason ?? "-"} ev ${a.evidence.length}`).join("; ") || "no anomalies",
  },
  {
    checkId: "nothing-reaches-payroll-without-a-release",
    // 8. Run with anomalies open and no release; release with anomalies still open; then decide them all.
    world: () => worldOf({ entries: SEEDED, unallocated: ["S6"] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(HOUR);
      world.release(RELEASER);
      world.advance(HOUR);
      await b(world.ports());
      world.advance(HOUR);
      decideAll(world);
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const writes = callsTo(world, "write_ledger");
      const releasedAt = world.current().releaseRequested?.at;
      const lastDecision = world.anomalies.map((a) => a.decision?.at ?? "").sort().at(-1);
      if (writes.length === 0 || !releasedAt || !lastDecision) return false;
      const afterDecisions = writes.every((c) => c.at > releasedAt && c.at > lastDecision && c.request.openAtWrite === 0 && c.request.releasedBy === RELEASER);
      const gate = world.firstCall("gate", (c) => c.request.release === PERIOD.id && c.request.person === RELEASER);
      const gateFirst = gate >= 0 && gate < world.firstCall("write_ledger");
      return world.exportsFor(PERIOD.id).length === 1 && afterDecisions && gateFirst;
    },
    describe: (world) => `writes: ${callsTo(world, "write_ledger").map((c) => `${c.at} open=${c.request.openAtWrite} by=${c.request.releasedBy}`).join("; ") || "none"}`,
  },
  {
    checkId: "one-export-per-period",
    // 9. The same released period run twice, an hour apart.
    world: () => {
      const w = worldOf({ entries: CLEAN });
      w.release(RELEASER);
      return w;
    },
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const exports = world.exportsFor(PERIOD.id);
      if (exports.length !== 1 || !exports[0].externalId) return false;
      const writes = callsTo(world, "write_ledger");
      const creates = writes.filter((c) => !("update" in c.request));
      const reports = world.reportsFor(PERIOD.id);
      return (
        creates.length === 1 &&
        writes.slice(1).every((c) => c.request.update === exports[0].id) &&
        reports.length === 2 &&
        reports.every((r) => r.exportExternalId === exports[0].externalId)
      );
    },
    describe: (world) => `${world.exportsFor(PERIOD.id).length} export(s); writes ${callsTo(world, "write_ledger").length}; report ids ${world.reportsFor(PERIOD.id).map((r) => r.exportExternalId).join(",")}`,
  },
  {
    checkId: "the-run-publishes-regardless",
    // 10. A period with only clean entries and nothing to raise.
    world: () => worldOf({ entries: CLEAN }),
    drive: async (b, world) => {
      await b(world.ports());
    },
    holds: (world) => {
      const reports = world.reportsFor(PERIOD.id);
      if (reports.length !== 1) return false;
      const r = reports[0];
      const byPerson = ["P1", "P2", "P3"].every((pid) => r.totals.some((t) => t.personId === pid && t.date === null && t.hours > 0));
      const allLines = CLEAN.every((e) => r.lines.some((l) => l.entryId === e.id));
      return (
        byPerson &&
        allLines &&
        r.anomaliesFound === 0 &&
        r.anomaliesResolved === 0 &&
        "release" in r &&
        r.release === null &&
        callsTo(world, "escalate").length === 0 &&
        callsTo(world, "write_ledger").length === 0
      );
    },
    describe: (world) => `${world.reportsFor(PERIOD.id).length} report(s); ${JSON.stringify(world.reportsFor(PERIOD.id).map((r) => ({ found: r.anomaliesFound, resolved: r.anomaliesResolved, release: r.release })))}`,
  },
  {
    checkId: "the-record-by-person-and-period",
    // 11. One period through anomalies, decisions, release and export, for three people.
    world: () => worldOf({ entries: RECORD, unallocated: ["M5"] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(HOUR);
      decideAll(world);
      world.release(RELEASER);
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const records = ["P1", "P2", "P3"].map((pid) => world.recordFor(pid, PERIOD.id));
      const whole = records.every((rec) => {
        const mine = RECORD.filter((e) => e.personId === rec.personId);
        return (
          rec.entries.length === mine.length &&
          rec.anomalies.length > 0 &&
          rec.anomalies.every((a) => a.resolution && a.resolution.by && a.resolution.reason && a.evidence.length > 0) &&
          rec.release.by === RELEASER &&
          typeof rec.exportExternalId === "string" && rec.exportExternalId.length > 0
        );
      });
      const p1 = records[0].cards.some((c) => c.entryId === "M3" && c.ruleId === R1.id && c.edition === R1.edition);
      const p2 = records[1].cards.some((c) => c.entryId === "M4" && c.ruleId === R1.id && c.edition === R1.edition);
      return whole && p1 && p2;
    },
    describe: (world) =>
      ["P1", "P2", "P3"]
        .map((pid) => {
          const r = world.recordFor(pid, PERIOD.id);
          return `${pid}: ${r.entries.length} entries, ${r.anomalies.length} anomalies, ${r.cards.length} cards, release ${r.release.by ?? "none"}`;
        })
        .join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store, roster, allocations and the
    // release run on the business's own accounts. Never scored green on our say-so.
    world: () => worldOf({ entries: [] }),
    drive: async (b, world) => {
      await b(world.ports());
    },
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

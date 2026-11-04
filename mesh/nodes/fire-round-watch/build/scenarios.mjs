/**
 * One scenario per check of compliance-calendar-build-standard, for Fire Round Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a fire protection contractor's list of the fire systems on
 * the sites it maintains. Each asset is one system on one site, in the state the
 * site is in; each obligation is one routine from that site's written
 * maintenance schedule (monthly, six-monthly or yearly), anchored on the last
 * completed visit for that routine. The intervals below are stub rule versions,
 * not a statement of any state's law or of any edition of the routine service
 * standard: the real ones go in the business's own rule store, with a citation.
 *
 * Every `holds` reads the world's recorded trace (world.calls), never the
 * build's memory, and returns a strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
const LONG_AGO = "2020-01-01T00:00:00.000Z";

const MONTHLY = "fire_routine_monthly";
const SIX_MONTHLY = "fire_routine_six_monthly";
const YEARLY = "fire_routine_yearly";
const LEAD = { [MONTHLY]: 7, [SIX_MONTHLY]: 21, [YEARLY]: 30 };

const SYSTEMS = [
  { id: "FS-QLD-SPR-0412", tag: "SPR-0412", assetClass: "system", jurisdiction: "QLD" },
  { id: "FS-NSW-FDA-0519", tag: "FDA-0519", assetClass: "system", jurisdiction: "NSW" },
  { id: "FS-VIC-HYD-0623", tag: "HYD-0623", assetClass: "system", jurisdiction: "VIC" },
];

/** A dated rule version for one routine in one state. A change is a new version, never an edit. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 7,
  attestedBy: "competent person",
  leadDays: LEAD[obligationType],
  citation: `${jurisdiction} routine service rule for ${obligationType} ${version} (stub)`,
  ...extra,
});

/** One routine from a site's written schedule, on one system. */
const routine = (id, assetId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId,
  jurisdiction,
  obligationType,
  anchorDate,
  siteRef: `site of ${assetId}`,
  responsible: "building owner",
  exceptionOwner: "service coordinator",
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const dueReads = (world, id) => callsTo(world, "read_rule", (c) => c.request.dueDate === id);
const escalated = (world, reason, id) =>
  callsTo(world, "escalate", (c) => c.request.reason === reason && (id === undefined || String(c.request.detail ?? "").startsWith(`${id} `)));
const sweeps = (world) => callsTo(world, "gate", (c) => c.request.sweep === true);
const runs = (world) => callsTo(world, "evidence", (c) => c.request.obligations === true);
const drafts = (world, id) => callsTo(world, "issue_notice", (c) => c.request.prepare === id);
/** Calls made after the nth register read (0-based), up to the next one. */
const inRun = (world, n) => {
  const starts = world.calls.map((c, i) => (c.port === "evidence" && c.request.obligations === true ? i : -1)).filter((i) => i >= 0);
  return world.calls.slice(starts[n] ?? world.calls.length, starts[n + 1] ?? world.calls.length);
};
const escIn = (calls, reason, id) =>
  calls.filter((c) => c.port === "escalate" && c.request.reason === reason && String(c.request.detail ?? "").startsWith(`${id} `));
const draftsIn = (calls, id) => calls.filter((c) => c.port === "issue_notice" && c.request.prepare === id);

const strict = (list) => list.map((s) => ({ ...s, holds: (world) => s.holds(world) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. A Queensland sprinkler system's yearly routine, last done 150 days ago,
    // on a 12 month rule: Scheduled, no booking. The state then calls up a new
    // edition that makes this routine six-monthly, effective in 10 days. Twenty
    // days on, nobody has touched the row, and a booking must now be drafted.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "QLD", "QLD-Y-v1", LONG_AGO, 12), rule(YEARLY, "QLD", "QLD-Y-v2", ahead(10), 6)],
        obligations: [routine("RT-1001", "FS-QLD-SPR-0412", "QLD", YEARLY, ago(150))],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(20 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const [first, second] = dueReads(world, "RT-1001").map((c) => c.response);
      return Boolean(
        runs(world).length === 2 &&
          first?.version === "QLD-Y-v1" &&
          second?.version === "QLD-Y-v2" &&
          first.date !== second.date &&
          draftsIn(inRun(world, 0), "RT-1001").length === 0 &&
          draftsIn(inRun(world, 1), "RT-1001").length === 1 &&
          escIn(inRun(world, 1), "fireround.booking_drafted_awaiting_release", "RT-1001").length === 1,
      );
    },
    describe: (world) =>
      `RT-1001 due: ${dueReads(world, "RT-1001").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}; drafts ${drafts(world, "RT-1001").length}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. A New South Wales alarm system's six-monthly routine fell due in March
    // under NSW-S-v1. NSW-S-v2 is now in force. The old version must still read
    // back with its dates, so March's due date can be explained.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(SIX_MONTHLY, "NSW", "NSW-S-v1", LONG_AGO, 6), rule(SIX_MONTHLY, "NSW", "NSW-S-v2", "2026-07-01T00:00:00.000Z", 6, { leadDays: 28 })],
        obligations: [
          routine("RT-2001", "FS-NSW-FDA-0519", "NSW", SIX_MONTHLY, ago(30), {
            pastDue: [{ date: "2026-03-01T00:00:00.000Z", version: "NSW-S-v1" }],
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule", (c) => c.request.obligationType === SIX_MONTHLY && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "NSW-S-v1");
      const cur = v.find((r) => r.version === "NSW-S-v2");
      const due = dueReads(world, "RT-2001")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "NSW-S-v2" &&
          escalated(world, "fireround.history_unexplained").length === 0,
      );
    },
    describe: (world) =>
      `versions read: ${JSON.stringify(callsTo(world, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. Two systems with the same yearly routine done on the same day, one in
    // Queensland and one in Victoria, from one rule store. Queensland's interval
    // puts it inside the lead time; Victoria's longer one leaves it Scheduled.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "QLD", "QLD-Y-v1", LONG_AGO, 12), rule(YEARLY, "VIC", "VIC-Y-v1", LONG_AGO, 14)],
        obligations: [
          routine("RT-3001", "FS-QLD-SPR-0412", "QLD", YEARLY, ago(340)),
          routine("RT-3002", "FS-VIC-HYD-0623", "VIC", YEARLY, ago(340)),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const q = dueReads(world, "RT-3001")[0]?.response;
      const v = dueReads(world, "RT-3002")[0]?.response;
      return Boolean(
        q?.version === "QLD-Y-v1" &&
          v?.version === "VIC-Y-v1" &&
          q.date !== v.date &&
          drafts(world, "RT-3001").length === 1 &&
          drafts(world, "RT-3002").length === 0,
      );
    },
    describe: (world) =>
      `QLD ${JSON.stringify(dueReads(world, "RT-3001")[0]?.response)}, VIC ${JSON.stringify(dueReads(world, "RT-3002")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A site taken over from another contractor: the written schedule names
    // a monthly routine on the sprinkler system, but nobody knows when it was
    // last done. It must not get a date, a class or a booking until someone checks.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(MONTHLY, "QLD", "QLD-M-v1", LONG_AGO, 1)],
        obligations: [routine("RT-4001", "FS-QLD-SPR-0412", "QLD", MONTHLY, null)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const surfaced =
        callsTo(world, "evidence", (c) => c.request.unknownAnchor === "RT-4001" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(world, "RT-4001").every((c) => c.response === null);
      const notClassed =
        escalated(world, "fireround.booking_drafted_awaiting_release", "RT-4001").length === 0 &&
        escalated(world, "fireround.routine_overdue", "RT-4001").length === 0 &&
        drafts(world, "RT-4001").length === 0;
      return surfaced && noDate && notClassed && escalated(world, "fireround.last_visit_unknown", "RT-4001").length === 1;
    },
    describe: (world) =>
      `unknown anchors surfaced: ${callsTo(world, "evidence", (c) => c.request.unknownAnchor).length}; escalations ${JSON.stringify(callsTo(world, "escalate").map((c) => c.request.reason))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. A yearly routine due in 10 days. The technician's job note says "done"
    // with no service report attached. It is not a completion, and the routine
    // stays due with its booking drafted.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "QLD", "QLD-Y-v1", LONG_AGO, 12)],
        obligations: [routine("RT-5001", "FS-QLD-SPR-0412", "QLD", YEARLY, ago(350))],
      }),
    drive: (b, world) => b(world.ports(), [{ kind: "report", obligationId: "RT-5001", evidenceRef: undefined }]),
    holds: (world) => {
      const attempts = callsTo(world, "evidence", (c) => c.request.complete === "RT-5001");
      return (
        attempts.length === 1 &&
        attempts[0].response.accepted === false &&
        escalated(world, "fireround.visit_without_report", "RT-5001").length === 1 &&
        drafts(world, "RT-5001").length === 1
      );
    },
    describe: (world) =>
      `completion attempts: ${JSON.stringify(callsTo(world, "evidence", (c) => c.request.complete).map((c) => c.response))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The building owner declines this year's hydrant routine. Then the due
    // date passes. The refusal is dated and the routine is overdue anyway.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "VIC", "VIC-Y-v1", LONG_AGO, 12)],
        obligations: [routine("RT-6001", "FS-VIC-HYD-0623", "VIC", YEARLY, ago(350))],
      }),
    drive: async (b, world) => {
      await b(world.ports(), [{ kind: "refusal", obligationId: "RT-6001", by: "building owner", at: NOW.toISOString() }]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const refusal = callsTo(world, "evidence", (c) => c.request.refusal === "RT-6001")[0];
      const lastSweep = sweeps(world).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          escalated(world, "fireround.visit_declined", "RT-6001").length === 1 &&
          callsTo(world, "evidence", (c) => c.request.complete === "RT-6001").length === 0 &&
          lastSweep?.response.breached.includes("RT-6001") &&
          escIn(inRun(world, 1), "fireround.routine_overdue", "RT-6001").length === 1,
      );
    },
    describe: (world) => `sweeps: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. An overdue alarm system routine whose rule names a notice to the
    // building owner. No release is on file, so nothing goes.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "NSW", "NSW-Y-v1", LONG_AGO, 12, { noticeOnBreach: true })],
        obligations: [routine("RT-7001", "FS-NSW-FDA-0519", "NSW", YEARLY, ago(400))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const prepared = drafts(world, "RT-7001");
      const issued = callsTo(world, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(world)[0]?.response.breached.includes("RT-7001") &&
          escalated(world, "fireround.routine_overdue", "RT-7001").length === 1 &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          escalated(world, "fireround.notice_drafted_awaiting_release", "RT-7001").length >= 1,
      );
    },
    describe: (world) => `notice calls: ${JSON.stringify(callsTo(world, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. A yearly sprinkler routine left to go overdue, then done late. The
    // yearly report also shows the monthly routine done on the same visit, so
    // both close on the one document. A month on, the yearly breach is still on
    // the record and the chasing has stopped.
    world: () =>
      new CalendarWorld({
        assets: SYSTEMS,
        rules: [rule(YEARLY, "QLD", "QLD-Y-v1", LONG_AGO, 12), rule(MONTHLY, "QLD", "QLD-M-v1", LONG_AGO, 1)],
        obligations: [
          routine("RT-8001", "FS-QLD-SPR-0412", "QLD", YEARLY, ago(355)),
          routine("RT-8002", "FS-QLD-SPR-0412", "QLD", MONTHLY, ago(20)),
        ],
      }),
    drive: async (b, world) => {
      world.advance(10 * DAY);
      await b(world.ports());
      world.advance(5 * DAY);
      await b(world.ports(), [
        { kind: "report", obligationId: "RT-8001", evidenceRef: "doc:yearly-service-report-RT-8001.pdf", alsoCovers: ["RT-8002"] },
      ]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const s = sweeps(world).map((c) => c.response.breached.includes("RT-8001"));
      const accepted = (id) =>
        callsTo(
          world,
          "evidence",
          (c) => c.request.complete === id && c.request.evidenceRef === "doc:yearly-service-report-RT-8001.pdf" && c.response.accepted === true,
        ).length === 1;
      return (
        s.length === 3 &&
        s.every(Boolean) &&
        accepted("RT-8001") &&
        accepted("RT-8002") &&
        escIn(inRun(world, 0), "fireround.routine_overdue", "RT-8001").length === 1 &&
        escIn(inRun(world, 1), "fireround.routine_overdue", "RT-8001").length === 0 &&
        escIn(inRun(world, 2), "fireround.routine_overdue", "RT-8001").length === 0
      );
    },
    describe: (world) => `breached on each sweep: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. Not a software check: the runner reports evidence_required.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained
    // by AI Pathway; the rule store runs on the contractor's own account.
    world: () => new CalendarWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the contractor's own register. This standard
// publishes no live port map, so run.mjs refuses a production run and the stub
// reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CalendarWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

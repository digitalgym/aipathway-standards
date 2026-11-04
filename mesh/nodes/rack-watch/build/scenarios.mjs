/**
 * One scenario per check of compliance-calendar-build-standard, for Rack Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a racking inspector's list of client warehouses. Each "asset"
 * is one racking installation with the state its site is in; each obligation is
 * that installation's periodic inspection by a competent person under AS 4084.
 * The intervals below are stub rule versions, not a reading of AS 4084 or any
 * state's WHS rules: the real ones go in the business's own rule store, with a
 * citation.
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
const INSPECTION = "racking_inspection_as4084";

const SITES = [
  { id: "RACK-QLD-ACACIA-01", tag: "ACR-WH1", assetClass: "passive", jurisdiction: "QLD" },
  { id: "RACK-NSW-WETHERILL-02", tag: "WTP-WH2", assetClass: "passive", jurisdiction: "NSW" },
  { id: "RACK-VIC-DANDENONG-03", tag: "DDS-WH3", assetClass: "passive", jurisdiction: "VIC" },
];

/** A dated rule version. A change is a new version, never an edit. */
const rule = (jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType: INSPECTION,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 5,
  attestedBy: "competent person (racking inspector)",
  leadDays: 30,
  citation: `AS 4084 periodic inspection, ${jurisdiction} rule store ${version} (stub)`,
  ...extra,
});

const site = (id, assetId, jurisdiction, anchorDate, extra = {}) => ({
  id,
  assetId,
  jurisdiction,
  obligationType: INSPECTION,
  anchorDate,
  responsible: "client (warehouse operator)",
  exceptionOwner: "inspections coordinator",
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const dueReads = (world, id) => callsTo(world, "read_rule", (c) => c.request.dueDate === id);
const escalated = (world, reason, id) =>
  callsTo(world, "escalate", (c) => c.request.reason === reason && (id === undefined || String(c.request.detail ?? "").startsWith(`${id} `)));
const sweeps = (world) => callsTo(world, "gate", (c) => c.request.sweep === true);
const runs = (world) => callsTo(world, "evidence", (c) => c.request.obligations === true);
/** Calls made after the nth register read (0-based), up to the next one. */
const inRun = (world, n) => {
  const starts = world.calls.map((c, i) => (c.port === "evidence" && c.request.obligations === true ? i : -1)).filter((i) => i >= 0);
  return world.calls.slice(starts[n] ?? world.calls.length, starts[n + 1] ?? world.calls.length);
};
const escIn = (calls, reason, id) =>
  calls.filter((c) => c.port === "escalate" && c.request.reason === reason && String(c.request.detail ?? "").startsWith(`${id} `));

const strict = (list) => list.map((s) => ({ ...s, holds: (world) => s.holds(world) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. A Queensland warehouse inspected 200 days ago on a 12 month rule: Current.
    // A new rule version shortens it to 8 months, effective in 10 days. Twenty
    // days on, nobody has touched the row, and it must now be Due Soon.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("QLD", "QLD-v1", LONG_AGO, 12), rule("QLD", "QLD-v2", ahead(10), 8)],
        obligations: [site("OB-1001", "RACK-QLD-ACACIA-01", "QLD", ago(200))],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(20 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const [first, second] = dueReads(world, "OB-1001").map((c) => c.response);
      return Boolean(
        runs(world).length === 2 &&
          first?.version === "QLD-v1" &&
          second?.version === "QLD-v2" &&
          first.date !== second.date &&
          escIn(inRun(world, 0), "rack.inspection_due_soon", "OB-1001").length === 0 &&
          escIn(inRun(world, 1), "rack.inspection_due_soon", "OB-1001").length === 1,
      );
    },
    describe: (world) =>
      `OB-1001 due: ${dueReads(world, "OB-1001").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}; due-soon raised ${escalated(world, "rack.inspection_due_soon", "OB-1001").length}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. A New South Wales warehouse fell due in March under NSW-v1. NSW-v2 is
    // now in force. The old version must still read back with its dates.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("NSW", "NSW-v1", LONG_AGO, 12), rule("NSW", "NSW-v2", "2026-07-01T00:00:00.000Z", 6)],
        obligations: [
          site("OB-2001", "RACK-NSW-WETHERILL-02", "NSW", ago(30), {
            pastDue: [{ date: "2026-03-01T00:00:00.000Z", version: "NSW-v1" }],
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule", (c) => c.request.obligationType === INSPECTION && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "NSW-v1");
      const cur = v.find((r) => r.version === "NSW-v2");
      const due = dueReads(world, "OB-2001")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "NSW-v2" &&
          escalated(world, "rack.history_unexplained").length === 0,
      );
    },
    describe: (world) =>
      `versions read: ${JSON.stringify(callsTo(world, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. Two warehouses inspected the same day, one in Queensland and one in
    // Victoria, from one rule store. Queensland's interval makes it Due Soon;
    // Victoria's longer one leaves it Current.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("QLD", "QLD-v1", LONG_AGO, 12), rule("VIC", "VIC-v1", LONG_AGO, 14)],
        obligations: [
          site("OB-3001", "RACK-QLD-ACACIA-01", "QLD", ago(340)),
          site("OB-3002", "RACK-VIC-DANDENONG-03", "VIC", ago(340)),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const q = dueReads(world, "OB-3001")[0]?.response;
      const v = dueReads(world, "OB-3002")[0]?.response;
      return Boolean(
        q?.version === "QLD-v1" &&
          v?.version === "VIC-v1" &&
          q.date !== v.date &&
          escalated(world, "rack.inspection_due_soon", "OB-3001").length === 1 &&
          escalated(world, "rack.inspection_due_soon", "OB-3002").length === 0,
      );
    },
    describe: (world) =>
      `QLD ${JSON.stringify(dueReads(world, "OB-3001")[0]?.response)}, VIC ${JSON.stringify(dueReads(world, "OB-3002")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A new client's warehouse: nobody knows when its racking was last
    // inspected. It must not be classed at all until someone checks.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("QLD", "QLD-v1", LONG_AGO, 12)],
        obligations: [site("OB-4001", "RACK-QLD-ACACIA-01", "QLD", null)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const surfaced =
        callsTo(world, "evidence", (c) => c.request.unknownAnchor === "OB-4001" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(world, "OB-4001").every((c) => c.response === null);
      const notClassed =
        escalated(world, "rack.inspection_due_soon", "OB-4001").length === 0 &&
        escalated(world, "rack.inspection_overdue", "OB-4001").length === 0 &&
        callsTo(world, "issue_notice", (c) => c.request.prepare === "OB-4001").length === 0;
      return surfaced && noDate && notClassed && escalated(world, "rack.last_inspection_unknown", "OB-4001").length === 1;
    },
    describe: (world) =>
      `unknown anchors surfaced: ${callsTo(world, "evidence", (c) => c.request.unknownAnchor).length}; escalations ${JSON.stringify(callsTo(world, "escalate").map((c) => c.request.reason))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. An installation due in 10 days. The inspector's email says "done, all
    // fine" with no report attached, and lists a bay finding. It is not a
    // completion, nothing is filed against the bay, and it stays Due Soon.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("QLD", "QLD-v1", LONG_AGO, 12)],
        obligations: [site("OB-5001", "RACK-QLD-ACACIA-01", "QLD", ago(350))],
      }),
    drive: (b, world) =>
      b(world.ports(), [
        {
          kind: "report",
          obligationId: "OB-5001",
          evidenceRef: undefined,
          findings: [{ bay: "A-04-2", risk: "red", damage: "upright buckled", recommendation: "offload and isolate" }],
        },
      ]),
    holds: (world) => {
      const attempts = callsTo(world, "evidence", (c) => c.request.complete === "OB-5001");
      return (
        attempts.length === 1 &&
        attempts[0].response.accepted === false &&
        escalated(world, "rack.inspection_without_report", "OB-5001").length === 1 &&
        escalated(world, "rack.red_finding", "OB-5001").length === 0 &&
        escalated(world, "rack.inspection_due_soon", "OB-5001").length === 1
      );
    },
    describe: (world) =>
      `completion attempts: ${JSON.stringify(callsTo(world, "evidence", (c) => c.request.complete).map((c) => c.response))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The client declines this year's inspection. Then the due date passes.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("VIC", "VIC-v1", LONG_AGO, 12)],
        obligations: [site("OB-6001", "RACK-VIC-DANDENONG-03", "VIC", ago(350))],
      }),
    drive: async (b, world) => {
      await b(world.ports(), [{ kind: "refusal", obligationId: "OB-6001", by: "client warehouse manager", at: NOW.toISOString() }]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const refusal = callsTo(world, "evidence", (c) => c.request.refusal === "OB-6001")[0];
      const lastSweep = sweeps(world).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          escalated(world, "rack.inspection_declined", "OB-6001").length === 1 &&
          callsTo(world, "evidence", (c) => c.request.complete === "OB-6001").length === 0 &&
          lastSweep?.response.breached.includes("OB-6001") &&
          escIn(inRun(world, 1), "rack.inspection_overdue", "OB-6001").length === 1,
      );
    },
    describe: (world) => `sweeps: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. An overdue installation whose rule names a notice to the client. No
    // release is on file, so nothing goes.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("NSW", "NSW-v1", LONG_AGO, 12, { noticeOnBreach: true })],
        obligations: [site("OB-7001", "RACK-NSW-WETHERILL-02", "NSW", ago(400))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const prepared = callsTo(world, "issue_notice", (c) => c.request.prepare === "OB-7001");
      const issued = callsTo(world, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(world)[0]?.response.breached.includes("OB-7001") &&
          escalated(world, "rack.inspection_overdue", "OB-7001").length === 1 &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          escalated(world, "rack.notice_drafted_awaiting_release", "OB-7001").length >= 1,
      );
    },
    describe: (world) => `notice calls: ${JSON.stringify(callsTo(world, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. An installation left to go overdue, then inspected late with the report
    // attached and three bay findings, then a month passes. The breach stays in
    // the history and the chasing stops. The red bay goes to a named person, the
    // finding the inspector left unrated is raised rather than guessed, and the
    // repair summary for the client waits for a person.
    world: () =>
      new CalendarWorld({
        assets: SITES,
        rules: [rule("QLD", "QLD-v1", LONG_AGO, 12)],
        obligations: [site("OB-8001", "RACK-QLD-ACACIA-01", "QLD", ago(355))],
      }),
    drive: async (b, world) => {
      world.advance(10 * DAY);
      await b(world.ports());
      world.advance(5 * DAY);
      await b(world.ports(), [
        {
          kind: "report",
          obligationId: "OB-8001",
          evidenceRef: "doc:racking-inspection-OB-8001.pdf",
          findings: [
            { bay: "B-12-1", risk: "red", damage: "front upright buckled at base", recommendation: "offload and isolate the bay, replace upright" },
            { bay: "C-03-4", risk: "amber", damage: "beam connector lock missing", recommendation: "fit a new safety lock" },
            { bay: "D-07-2", damage: "footplate anchor loose", recommendation: "re-anchor" },
          ],
        },
      ]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const s = sweeps(world).map((c) => c.response.breached.includes("OB-8001"));
      const accepted =
        callsTo(world, "evidence", (c) => c.request.complete === "OB-8001" && c.response.accepted === true).length === 1;
      const red = escalated(world, "rack.red_finding", "OB-8001");
      return (
        s.length === 3 &&
        s.every(Boolean) &&
        accepted &&
        escIn(inRun(world, 0), "rack.inspection_overdue", "OB-8001").length === 1 &&
        escIn(inRun(world, 1), "rack.inspection_overdue", "OB-8001").length === 0 &&
        escIn(inRun(world, 2), "rack.inspection_overdue", "OB-8001").length === 0 &&
        red.length === 1 &&
        String(red[0].request.detail).includes("bay B-12-1") &&
        escalated(world, "rack.finding_unclassified", "OB-8001").length === 1 &&
        escalated(world, "rack.repair_summary_awaiting_release", "OB-8001").length === 1 &&
        callsTo(world, "issue_notice", (c) => c.response.issued === true).length === 0
      );
    },
    describe: (world) =>
      `breached on each sweep: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}; escalations ${JSON.stringify(callsTo(world, "escalate").map((c) => c.request.reason))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. Not a software check: the runner reports evidence_required.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained
    // by AI Pathway; the rule store runs on the inspector's own account.
    world: () => new CalendarWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the business's own register. This standard
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

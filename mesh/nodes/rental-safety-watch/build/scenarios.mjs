/**
 * One scenario per check of compliance-calendar-build-standard, for Rental
 * Safety Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is an agency's rent roll. Each "asset" is one rental property in
 * the state it sits in; each obligation is one recurring safety check on it
 * (smoke alarms, gas safety, the hot water tempering valve). The intervals and
 * lead times below are stub rule versions, not a statement of any state's law:
 * the real ones go in the agency's own rule store, each with its citation.
 *
 * Every `holds` reads the world's recorded trace (world.calls), never the
 * build's own return value, and returns a strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
const SINCE_EVER = "2019-07-01T00:00:00.000Z";

const SMOKE = "smoke_alarm_check";
const GAS = "gas_safety_check";
const VALVE = "tempering_valve_check";

const PROPERTIES = [
  { id: "PROP-QLD-112", tag: "12 Example St unit 1", assetClass: "passive", jurisdiction: "QLD" },
  { id: "PROP-NSW-245", tag: "45 Sample Rd", assetClass: "passive", jurisdiction: "NSW" },
  { id: "PROP-VIC-318", tag: "18 Placeholder Ave", assetClass: "passive", jurisdiction: "VIC" },
  { id: "PROP-VIC-322", tag: "22 Placeholder Ave", assetClass: "passive", jurisdiction: "VIC" },
];

/** A dated rule version. A change is a new version, never an edit. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 7,
  attestedBy: obligationType === SMOKE ? "smoke alarm technician" : "licensed gasfitter or plumber",
  leadDays: 30,
  retryDays: 7,
  citation: `${jurisdiction} residential tenancy ${obligationType} rule ${version} (stub)`,
  ...extra,
});

const check = (id, assetId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId,
  tenancyId: `TEN-${assetId.slice(5)}`,
  jurisdiction,
  obligationType,
  anchorDate,
  responsible: "agency",
  exceptionOwner: "property manager",
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const dueReads = (world, id) => callsTo(world, "read_rule", (c) => c.request.dueDate === id);
const raised = (world, reason, id) =>
  callsTo(world, "escalate", (c) => c.request.reason === reason && (id === undefined || String(c.request.detail ?? "").startsWith(`${id} `)));
const sweeps = (world) => callsTo(world, "gate", (c) => c.request.sweep === true);
const registerReads = (world) => callsTo(world, "evidence", (c) => c.request.obligations === true);
/** The calls of the nth run (0-based): from its register read to the next one. */
const runOf = (world, n) => {
  const starts = world.calls.map((c, i) => (c.port === "evidence" && c.request.obligations === true ? i : -1)).filter((i) => i >= 0);
  return world.calls.slice(starts[n] ?? world.calls.length, starts[n + 1] ?? world.calls.length);
};
const raisedIn = (calls, reason, id) =>
  calls.filter((c) => c.port === "escalate" && c.request.reason === reason && String(c.request.detail ?? "").startsWith(`${id} `));
const drafted = (calls, id) => calls.filter((c) => c.port === "issue_notice" && c.request.prepare === id);

const strict = (list) => list.map((s) => ({ ...s, holds: (world) => s.holds(world) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. Two Victorian rentals, gas checks last done 600 days ago on a 24 month
    // rule: both Up to date. Victoria then shortens the interval to 21 months,
    // effective in 10 days. Twenty days on, nobody has touched either row, and
    // both must now be Book now, each under the new version.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(GAS, "VIC", "VIC-GAS-v1", SINCE_EVER, 24), rule(GAS, "VIC", "VIC-GAS-v2", ahead(10), 21)],
        obligations: [
          check("OB-GAS-318", "PROP-VIC-318", "VIC", GAS, ago(600)),
          check("OB-GAS-322", "PROP-VIC-322", "VIC", GAS, ago(600)),
        ],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(20 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const moved = (id) => {
        const [before, after] = dueReads(world, id).map((c) => c.response);
        return (
          before?.version === "VIC-GAS-v1" &&
          after?.version === "VIC-GAS-v2" &&
          before.date !== after.date &&
          raisedIn(runOf(world, 0), "safety.booking_drafted", id).length === 0 &&
          raisedIn(runOf(world, 1), "safety.booking_drafted", id).length === 1 &&
          drafted(runOf(world, 0), id).length === 0 &&
          drafted(runOf(world, 1), id).length === 1
        );
      };
      return registerReads(world).length === 2 && moved("OB-GAS-318") && moved("OB-GAS-322");
    },
    describe: (world) =>
      ["OB-GAS-318", "OB-GAS-322"]
        .map((id) => `${id} due ${dueReads(world, id).map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`)
        .join("; "),
  },
  {
    checkId: "superseded-versions-retained",
    // 2. A New South Wales smoke alarm check fell due in March under NSW-SA-v1.
    // NSW-SA-v2 has been in force since July. The old version must still read
    // back with its date, and the March due date must be explained by it.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(SMOKE, "NSW", "NSW-SA-v1", SINCE_EVER, 12), rule(SMOKE, "NSW", "NSW-SA-v2", "2026-07-01T00:00:00.000Z", 12, { leadDays: 45 })],
        obligations: [
          check("OB-SA-245", "PROP-NSW-245", "NSW", SMOKE, ago(40), {
            pastDue: [{ date: "2026-03-02T00:00:00.000Z", version: "NSW-SA-v1" }],
          }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule", (c) => c.request.obligationType === SMOKE && c.request.jurisdiction === "NSW")[0];
      const versions = read?.response?.versions ?? [];
      const old = versions.find((r) => r.version === "NSW-SA-v1");
      const cur = versions.find((r) => r.version === "NSW-SA-v2");
      const due = dueReads(world, "OB-SA-245")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "NSW-SA-v2" &&
          raised(world, "safety.past_date_unexplained").length === 0,
      );
    },
    describe: (world) =>
      `versions read: ${JSON.stringify(callsTo(world, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. The same smoke alarm check on a Queensland and a New South Wales rental,
    // both last done 345 days ago, from one rule store. Queensland's 12 month
    // rule makes it Book now; the stub NSW rule's 14 months leaves it Up to date.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(SMOKE, "QLD", "QLD-SA-v1", SINCE_EVER, 12), rule(SMOKE, "NSW", "NSW-SA-v1", SINCE_EVER, 14)],
        obligations: [
          check("OB-SA-112", "PROP-QLD-112", "QLD", SMOKE, ago(345)),
          check("OB-SA-245", "PROP-NSW-245", "NSW", SMOKE, ago(345)),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const q = dueReads(world, "OB-SA-112")[0]?.response;
      const n = dueReads(world, "OB-SA-245")[0]?.response;
      return Boolean(
        q?.version === "QLD-SA-v1" &&
          n?.version === "NSW-SA-v1" &&
          q.date !== n.date &&
          raised(world, "safety.booking_drafted", "OB-SA-112").length === 1 &&
          raised(world, "safety.booking_drafted", "OB-SA-245").length === 0,
      );
    },
    describe: (world) =>
      `QLD ${JSON.stringify(dueReads(world, "OB-SA-112")[0]?.response)}, NSW ${JSON.stringify(dueReads(world, "OB-SA-245")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A rental taken over from another agency: nobody knows when the hot water
    // tempering valve was last serviced. It must not get a date or a booking
    // until someone finds out.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(VALVE, "VIC", "VIC-TV-v1", SINCE_EVER, 12)],
        obligations: [check("OB-TV-318", "PROP-VIC-318", "VIC", VALVE, null)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const surfaced =
        callsTo(world, "evidence", (c) => c.request.unknownAnchor === "OB-TV-318" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(world, "OB-TV-318").every((c) => c.response === null);
      const untouched =
        raised(world, "safety.booking_drafted", "OB-TV-318").length === 0 &&
        raised(world, "safety.check_overdue", "OB-TV-318").length === 0 &&
        drafted(world.calls, "OB-TV-318").length === 0;
      return surfaced && noDate && untouched && raised(world, "safety.last_check_unknown", "OB-TV-318").length === 1;
    },
    describe: (world) =>
      `unknown anchors surfaced: ${callsTo(world, "evidence", (c) => c.request.unknownAnchor).length}; raised ${JSON.stringify(callsTo(world, "escalate").map((c) => c.request.reason))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. A Queensland smoke alarm check due in 15 days. The contractor's email
    // says "all done" with no report attached. It is not a completion, and the
    // property stays on Book now.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(SMOKE, "QLD", "QLD-SA-v1", SINCE_EVER, 12)],
        obligations: [check("OB-SA-112", "PROP-QLD-112", "QLD", SMOKE, ago(345))],
      }),
    drive: (b, world) => b(world.ports(), [{ kind: "certificate", obligationId: "OB-SA-112", evidenceRef: undefined }]),
    holds: (world) => {
      const tries = callsTo(world, "evidence", (c) => c.request.complete === "OB-SA-112");
      return (
        tries.length === 1 &&
        tries[0].response.accepted === false &&
        raised(world, "safety.done_without_certificate", "OB-SA-112").length === 1 &&
        raised(world, "safety.booking_drafted", "OB-SA-112").length === 1
      );
    },
    describe: (world) =>
      `completion attempts: ${JSON.stringify(callsTo(world, "evidence", (c) => c.request.complete).map((c) => c.response))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The landlord declines to pay for the tempering valve service. Then the
    // due date passes. The refusal is kept with its date and the check is
    // Overdue, not closed.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(VALVE, "VIC", "VIC-TV-v1", SINCE_EVER, 12)],
        obligations: [check("OB-TV-322", "PROP-VIC-322", "VIC", VALVE, ago(345), { responsible: "owner" })],
      }),
    drive: async (b, world) => {
      await b(world.ports(), [{ kind: "refusal", obligationId: "OB-TV-322", by: "landlord", at: NOW.toISOString() }]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const refusal = callsTo(world, "evidence", (c) => c.request.refusal === "OB-TV-322")[0];
      const last = sweeps(world).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          raised(world, "safety.owner_declined", "OB-TV-322").length === 1 &&
          callsTo(world, "evidence", (c) => c.request.complete === "OB-TV-322").length === 0 &&
          last?.response.breached.includes("OB-TV-322") &&
          raisedIn(runOf(world, 1), "safety.check_overdue", "OB-TV-322").length === 1,
      );
    },
    describe: (world) => `sweeps: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. An overdue New South Wales gas check whose rule needs a written entry
    // notice to the tenant. No release is on file, so the booking and notice
    // are drafted and nothing goes.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(GAS, "NSW", "NSW-GAS-v1", SINCE_EVER, 24, { noticeOnBreach: true })],
        obligations: [check("OB-GAS-245", "PROP-NSW-245", "NSW", GAS, ago(760))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const prepared = drafted(world.calls, "OB-GAS-245");
      const issued = callsTo(world, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(world)[0]?.response.breached.includes("OB-GAS-245") &&
          raised(world, "safety.check_overdue", "OB-GAS-245").length === 1 &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          raised(world, "safety.draft_awaiting_release", "OB-GAS-245").length >= 1,
      );
    },
    describe: (world) => `notice calls: ${JSON.stringify(callsTo(world, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. A smoke alarm check left to go overdue, then done late with the report
    // attached, then a month passes. The breach stays on the record; the
    // chasing stops.
    world: () =>
      new CalendarWorld({
        assets: PROPERTIES,
        rules: [rule(SMOKE, "QLD", "QLD-SA-v1", SINCE_EVER, 12)],
        obligations: [check("OB-SA-112", "PROP-QLD-112", "QLD", SMOKE, ago(355))],
      }),
    drive: async (b, world) => {
      world.advance(10 * DAY);
      await b(world.ports());
      world.advance(6 * DAY);
      await b(world.ports(), [{ kind: "certificate", obligationId: "OB-SA-112", evidenceRef: "doc:smoke-alarm-report-OB-SA-112.pdf" }]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const marks = sweeps(world).map((c) => c.response.breached.includes("OB-SA-112"));
      const accepted =
        callsTo(world, "evidence", (c) => c.request.complete === "OB-SA-112" && c.response.accepted === true).length === 1;
      return (
        marks.length === 3 &&
        marks.every((m) => m === true) &&
        accepted &&
        raisedIn(runOf(world, 0), "safety.check_overdue", "OB-SA-112").length === 1 &&
        raisedIn(runOf(world, 1), "safety.check_overdue", "OB-SA-112").length === 0 &&
        raisedIn(runOf(world, 2), "safety.check_overdue", "OB-SA-112").length === 0
      );
    },
    describe: (world) => `breached on each sweep: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. Not a software check: the runner reports evidence_required.
    // Declared: the build is public in digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store runs on the agency's own account.
    world: () => new CalendarWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the agency's own rent roll. This standard
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

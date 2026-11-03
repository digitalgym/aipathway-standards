/**
 * One scenario per check of compliance-calendar-build-standard, for Deadline Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a practice's client obligations: each "asset" is a client
 * entity with the state it is registered in, each obligation a deadline that
 * a forwarded letter or the practice's own rule set puts on it. Every `holds`
 * reads the world's recorded trace (world.calls), never the build's memory.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const MONTH = 30 * DAY; // the register's month
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();
const ahead = (days) => new Date(NOW.getTime() + days * DAY).toISOString();

const CLIENTS = [
  { id: "C-QLD-1", jurisdiction: "QLD" },
  { id: "C-VIC-1", jurisdiction: "VIC" },
  { id: "C-NSW-1", jurisdiction: "NSW" },
];

/** Dated rules. Never edited in place: a change is a new version. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  leadDays: 45,
  citation: `${jurisdiction} ${obligationType} ${version}`,
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const dueReads = (world, id) => callsTo(world, "read_rule", (c) => c.request.dueDate === id);
const escalated = (world, reason, detail) =>
  callsTo(world, "escalate", (c) => c.request.reason === reason && (detail === undefined || String(c.request.detail).includes(detail)));
const sweeps = (world) => callsTo(world, "gate", (c) => c.request.sweep === true);

const strict = (list) => list.map((s) => ({ ...s, holds: (world) => s.holds(world) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. An annual reconciliation on a 12 month rule; a new version moves it to
    // 6 months from a date the clock then passes. Nobody touches the record.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("payroll_tax_reconciliation", "QLD", "v1", "2020-01-01T00:00:00.000Z", 12),
          rule("payroll_tax_reconciliation", "QLD", "v2", ahead(10), 6),
        ],
        obligations: [{ id: "O-101", assetId: "C-QLD-1", jurisdiction: "QLD", obligationType: "payroll_tax_reconciliation", anchorDate: ago(30) }],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(20 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const [first, second] = dueReads(world, "O-101").map((c) => c.response);
      return Boolean(first && second && first.version === "v1" && second.version === "v2" && first.date !== second.date);
    },
    describe: (world) => `O-101 due: ${dueReads(world, "O-101").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. Two versions. The obligation fell due once under v1, which is on its
    // history; the build must still be able to read v1 with its dates.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("ato_notice_response", "NSW", "v1", "2020-01-01T00:00:00.000Z", 1),
          rule("ato_notice_response", "NSW", "v2", "2026-07-01T00:00:00.000Z", 2),
        ],
        obligations: [
          {
            id: "O-201",
            assetId: "C-NSW-1",
            jurisdiction: "NSW",
            obligationType: "ato_notice_response",
            anchorDate: ago(10),
            history: [{ date: "2026-03-01T00:00:00.000Z", version: "v1" }],
          },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = callsTo(world, "read_rule", (c) => c.request.obligationType === "ato_notice_response" && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "v1");
      const cur = v.find((r) => r.version === "v2");
      const due = dueReads(world, "O-201")[0]?.response;
      return Boolean(old?.effectiveFrom && cur?.effectiveFrom && old.effectiveFrom < cur.effectiveFrom && due?.version === "v2" && escalated(world, "deadline.history_unexplained").length === 0);
    },
    describe: (world) => `versions read: ${JSON.stringify(callsTo(world, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. The same reconciliation for a Queensland client and a Victorian one,
    // same anchor, from one rule store.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("payroll_tax_reconciliation", "QLD", "QLD-v1", "2020-01-01T00:00:00.000Z", 12),
          rule("payroll_tax_reconciliation", "VIC", "VIC-v1", "2020-01-01T00:00:00.000Z", 13),
        ],
        obligations: [
          { id: "O-301", assetId: "C-QLD-1", jurisdiction: "QLD", obligationType: "payroll_tax_reconciliation", anchorDate: ago(60) },
          { id: "O-302", assetId: "C-VIC-1", jurisdiction: "VIC", obligationType: "payroll_tax_reconciliation", anchorDate: ago(60) },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const q = dueReads(world, "O-301")[0]?.response;
      const v = dueReads(world, "O-302")[0]?.response;
      return Boolean(q && v && q.version === "QLD-v1" && v.version === "VIC-v1" && q.date !== v.date);
    },
    describe: (world) => `QLD ${JSON.stringify(dueReads(world, "O-301")[0]?.response)}, VIC ${JSON.stringify(dueReads(world, "O-302")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. An inherited client: nobody knows when the last lodgement was.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_lodgement", "QLD", "v1", "2020-01-01T00:00:00.000Z", 3)],
        obligations: [{ id: "O-401", assetId: "C-QLD-1", jurisdiction: "QLD", obligationType: "bas_lodgement", anchorDate: null }],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const surfaced = callsTo(world, "evidence", (c) => c.request.unknownAnchor === "O-401" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(world, "O-401").every((c) => c.response === null);
      return surfaced && noDate && escalated(world, "deadline.anchor_unknown", "O-401").length === 1;
    },
    describe: (world) => `unknown anchors surfaced: ${callsTo(world, "evidence", (c) => c.request.unknownAnchor).length}; due reads ${JSON.stringify(dueReads(world, "O-401").map((c) => c.response))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. A reply says "done" with nothing attached.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_lodgement", "QLD", "v1", "2020-01-01T00:00:00.000Z", 3)],
        obligations: [{ id: "O-501", assetId: "C-QLD-1", jurisdiction: "QLD", obligationType: "bas_lodgement", anchorDate: ago(30) }],
      }),
    drive: (b, world) => b(world.ports(), [{ kind: "completion", obligationId: "O-501", evidenceRef: null }]),
    holds: (world) => {
      const attempts = callsTo(world, "evidence", (c) => c.request.complete === "O-501");
      return (
        attempts.length === 1 &&
        attempts[0].response.accepted === false &&
        escalated(world, "deadline.completion_without_evidence", "O-501").length === 1
      );
    },
    describe: (world) => `completion attempts: ${JSON.stringify(callsTo(world, "evidence", (c) => c.request.complete).map((c) => c.response))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The client declines to pay for the work. Then the due date passes.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("ato_notice_response", "VIC", "v1", "2020-01-01T00:00:00.000Z", 1)],
        obligations: [{ id: "O-601", assetId: "C-VIC-1", jurisdiction: "VIC", obligationType: "ato_notice_response", anchorDate: ago(10) }],
      }),
    drive: async (b, world) => {
      await b(world.ports(), [{ kind: "refusal", obligationId: "O-601", by: "client director", at: NOW.toISOString() }]);
      world.advance(30 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const refusal = callsTo(world, "evidence", (c) => c.request.refusal === "O-601")[0];
      const lastSweep = sweeps(world).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          callsTo(world, "evidence", (c) => c.request.complete === "O-601").length === 0 &&
          lastSweep?.response.breached.includes("O-601") &&
          escalated(world, "deadline.breached", "O-601").length >= 1,
      );
    },
    describe: (world) => `sweeps: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. A breached obligation whose rule names a notice. No release on file.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_lodgement", "NSW", "v1", "2020-01-01T00:00:00.000Z", 3, { notice: "lodgement extension request" })],
        obligations: [{ id: "O-701", assetId: "C-NSW-1", jurisdiction: "NSW", obligationType: "bas_lodgement", anchorDate: ago(120) }],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const prepared = callsTo(world, "issue_notice", (c) => c.request.prepare === "O-701");
      const issued = callsTo(world, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(world)[0]?.response.breached.includes("O-701") &&
        prepared.length >= 1 &&
        prepared.every((c) => c.response.awaiting === "a named release") &&
        issued.length === 0 &&
        escalated(world, "deadline.notice_drafted_awaiting_release", "O-701").length >= 1
      );
    },
    describe: (world) => `notice calls: ${JSON.stringify(callsTo(world, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. Allowed to breach, then lodged late with the receipt, then time moves on.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_lodgement", "QLD", "v1", "2020-01-01T00:00:00.000Z", 3)],
        obligations: [{ id: "O-801", assetId: "C-QLD-1", jurisdiction: "QLD", obligationType: "bas_lodgement", anchorDate: ago(100) }],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(5 * DAY);
      await b(world.ports(), [{ kind: "completion", obligationId: "O-801", evidenceRef: "doc:lodgement-receipt-O-801.pdf" }]);
      world.advance(40 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const s = sweeps(world).map((c) => c.response.breached.includes("O-801"));
      const accepted = callsTo(world, "evidence", (c) => c.request.complete === "O-801" && c.response.accepted === true).length === 1;
      // Escalated while live; once completed with evidence, no further chasing.
      const breachEsc = escalated(world, "deadline.breached", "O-801").length;
      return s.length === 3 && s.every(Boolean) && accepted && breachEsc === 1;
    },
    describe: (world) => `breached on each sweep: ${JSON.stringify(sweeps(world).map((c) => c.response.breached))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store runs on the practice's own account.
    world: () => new CalendarWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the practice's own systems. This standard
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

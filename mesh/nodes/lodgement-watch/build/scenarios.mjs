/**
 * One scenario per check of compliance-calendar-build-standard, for Lodgement Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a practice's client book: each "asset" is a client entity
 * with the state it runs payroll in, each obligation a lodgement (BAS, IAS,
 * payroll tax). The intervals below are stub figures in the register's
 * 30-day month, not the ATO's or a revenue office's published dates; the
 * practice's own rule set carries those, with citations. Every `holds` reads
 * the world's recorded trace (world.calls), never the build's memory, and
 * returns a strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const ahead = (d) => new Date(NOW.getTime() + d * DAY).toISOString();
const LONG_AGO = "2019-07-01T00:00:00.000Z";

const CLIENTS = [
  { id: "CL-QLD-PLUMBING", tag: "CL-QLD-PLUMBING", assetClass: "passive", jurisdiction: "QLD" },
  { id: "CL-VIC-CAFE", tag: "CL-VIC-CAFE", assetClass: "passive", jurisdiction: "VIC" },
  { id: "CL-NSW-BUILDER", tag: "CL-NSW-BUILDER", assetClass: "passive", jurisdiction: "NSW" },
];

/** Dated rules. Never edited in place: a change is a new version. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 5,
  attestedBy: "registered tax or BAS agent",
  leadDays: 21,
  citation: `${jurisdiction} ${obligationType} ${version} (stub)`,
  ...extra,
});

const ob = (id, clientId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId: clientId,
  jurisdiction,
  obligationType,
  anchorDate,
  ...extra,
});

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const dueReads = (w, id) => callsTo(w, "read_rule", (c) => c.request.dueDate === id);
const escalated = (w, reason, detail) =>
  callsTo(w, "escalate", (c) => c.request.reason === reason && (detail === undefined || String(c.request.detail).includes(detail)));
const sweeps = (w) => callsTo(w, "gate", (c) => c.request.sweep === true);

const strict = (list) => list.map((s) => ({ ...s, holds: (w) => s.holds(w) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. A quarterly BAS on a 3-month rule. A new version moves the cycle to
    // monthly from a date the clock then passes. Nobody touches the record.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("bas_quarterly", "QLD", "v1", LONG_AGO, 3),
          rule("bas_quarterly", "QLD", "v2", ahead(10), 1),
        ],
        obligations: [ob("OB-BAS-101", "CL-QLD-PLUMBING", "QLD", "bas_quarterly", ago(20))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(20 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const reads = dueReads(w, "OB-BAS-101").map((c) => c.response);
      const [first, second] = reads;
      return Boolean(reads.length === 2 && first?.version === "v1" && second?.version === "v2" && first.date !== second.date);
    },
    describe: (w) => `OB-BAS-101 due: ${dueReads(w, "OB-BAS-101").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. Two versions of the IAS rule. The client fell due once under v1, which
    // is on its history; the build must read v1 back with its dates and find
    // nothing unexplained, while today's date comes from v2.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("ias_monthly", "NSW", "v1", LONG_AGO, 1),
          rule("ias_monthly", "NSW", "v2", "2026-07-01T00:00:00.000Z", 2),
        ],
        obligations: [
          ob("OB-IAS-201", "CL-NSW-BUILDER", "NSW", "ias_monthly", ago(10), {
            history: [{ date: "2026-03-21T00:00:00.000Z", version: "v1" }],
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_rule", (c) => c.request.obligationType === "ias_monthly" && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "v1");
      const cur = v.find((r) => r.version === "v2");
      const due = dueReads(w, "OB-IAS-201")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom <= "2026-03-21T00:00:00.000Z" &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "v2" &&
          escalated(w, "lodgement.history_unexplained").length === 0,
      );
    },
    describe: (w) => `versions read: ${JSON.stringify(callsTo(w, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. Payroll tax is set by each state. A Queensland client and a Victorian
    // one, same anchor, one rule store, different versions and dates.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("payroll_tax_reconciliation", "QLD", "QLD-v1", LONG_AGO, 12),
          rule("payroll_tax_reconciliation", "VIC", "VIC-v1", LONG_AGO, 13),
        ],
        obligations: [
          ob("OB-PRT-301", "CL-QLD-PLUMBING", "QLD", "payroll_tax_reconciliation", ago(60)),
          ob("OB-PRT-302", "CL-VIC-CAFE", "VIC", "payroll_tax_reconciliation", ago(60)),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = dueReads(w, "OB-PRT-301")[0]?.response;
      const v = dueReads(w, "OB-PRT-302")[0]?.response;
      return Boolean(q && v && q.version === "QLD-v1" && v.version === "VIC-v1" && q.date !== v.date);
    },
    describe: (w) => `QLD ${JSON.stringify(dueReads(w, "OB-PRT-301")[0]?.response)}, VIC ${JSON.stringify(dueReads(w, "OB-PRT-302")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A client taken over from another practice: nobody knows the last
    // lodged period. It must surface, not start counting from today.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_quarterly", "VIC", "v1", LONG_AGO, 3)],
        obligations: [ob("OB-BAS-401", "CL-VIC-CAFE", "VIC", "bas_quarterly", null)],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const surfaced = callsTo(w, "evidence", (c) => c.request.unknownAnchor === "OB-BAS-401" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(w, "OB-BAS-401").every((c) => c.response === null);
      return surfaced && noDate && escalated(w, "lodgement.anchor_unknown", "OB-BAS-401").length === 1;
    },
    describe: (w) =>
      `unknown anchors surfaced: ${callsTo(w, "evidence", (c) => c.request.unknownAnchor).length}; due reads ${JSON.stringify(dueReads(w, "OB-BAS-401").map((c) => c.response))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. A client emails "lodged it" with nothing attached. A second client's
    // email carries the lodgement receipt, which is filed and read back by id.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_quarterly", "QLD", "v1", LONG_AGO, 3)],
        obligations: [
          ob("OB-BAS-501", "CL-QLD-PLUMBING", "QLD", "bas_quarterly", ago(30)),
          ob("OB-BAS-502", "CL-QLD-PLUMBING", "QLD", "bas_quarterly", ago(30)),
        ],
      }),
    drive: (b, w) =>
      b(w.ports(), [
        { kind: "receipt", obligationId: "OB-BAS-501", messageId: "msg-501" },
        { kind: "receipt", obligationId: "OB-BAS-502", messageId: "msg-502", attachment: "lodgement-receipt.pdf" },
      ]),
    holds: (w) => {
      const bare = callsTo(w, "evidence", (c) => c.request.complete === "OB-BAS-501");
      const withDoc = callsTo(w, "evidence", (c) => c.request.complete === "OB-BAS-502");
      const row501 = w.obligationById("OB-BAS-501");
      return (
        bare.length === 1 &&
        bare[0].response.accepted === false &&
        !row501?.completedAt &&
        escalated(w, "lodgement.completion_without_evidence", "OB-BAS-501").length === 1 &&
        withDoc.length === 1 &&
        withDoc[0].response.accepted === true &&
        withDoc[0].request.evidenceRef === "msg-502#lodgement-receipt.pdf" &&
        escalated(w, "lodgement.evidence_not_read_back").length === 0
      );
    },
    describe: (w) => `completion attempts: ${JSON.stringify(callsTo(w, "evidence", (c) => c.request.complete).map((c) => [c.request, c.response]))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The client will not send records for the quarter. Then the due date passes.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_quarterly", "VIC", "v1", LONG_AGO, 1)],
        obligations: [ob("OB-BAS-601", "CL-VIC-CAFE", "VIC", "bas_quarterly", ago(10))],
      }),
    drive: async (b, w) => {
      await b(w.ports(), [{ kind: "refusal", obligationId: "OB-BAS-601", by: "client director", at: NOW.toISOString() }]);
      w.advance(30 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const refusal = callsTo(w, "evidence", (c) => c.request.refusal === "OB-BAS-601")[0];
      const last = sweeps(w).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          w.obligationById("OB-BAS-601")?.refusedAt === NOW.toISOString() &&
          !w.obligationById("OB-BAS-601")?.completedAt &&
          last?.response.breached.includes("OB-BAS-601") &&
          escalated(w, "lodgement.breached", "OB-BAS-601").length >= 1,
      );
    },
    describe: (w) => `sweeps: ${JSON.stringify(sweeps(w).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. A breached payroll tax return whose rule names a records request to
    // the client. No release on file, and one release attempt with no name.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("payroll_tax_monthly", "NSW", "v1", LONG_AGO, 1, { notice: "records request to the client" })],
        obligations: [ob("OB-PRT-701", "CL-NSW-BUILDER", "NSW", "payroll_tax_monthly", ago(45))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      await b(w.ports(), [{ kind: "release", obligationId: "OB-PRT-701" }]);
    },
    holds: (w) => {
      const prepared = callsTo(w, "issue_notice", (c) => c.request.prepare === "OB-PRT-701");
      const issued = callsTo(w, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(w)[0]?.response.breached.includes("OB-PRT-701") &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          !w.noticeFor("OB-PRT-701")?.issuedAt &&
          escalated(w, "lodgement.request_drafted_awaiting_release", "OB-PRT-701").length >= 1 &&
          escalated(w, "lodgement.release_refused", "OB-PRT-701").length === 1,
      );
    },
    describe: (w) => `notice calls: ${JSON.stringify(callsTo(w, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. The BAS breaches, is lodged late with the receipt attached, then the
    // clock moves on. The breach stays on every sweep; chasing stops.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("bas_quarterly", "QLD", "v1", LONG_AGO, 3)],
        obligations: [ob("OB-BAS-801", "CL-QLD-PLUMBING", "QLD", "bas_quarterly", ago(100))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(5 * DAY);
      await b(w.ports(), [{ kind: "receipt", obligationId: "OB-BAS-801", messageId: "msg-801", attachment: "lodgement-receipt.pdf" }]);
      w.advance(40 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const s = sweeps(w).map((c) => c.response.breached.includes("OB-BAS-801"));
      const accepted = callsTo(w, "evidence", (c) => c.request.complete === "OB-BAS-801" && c.response.accepted === true).length === 1;
      const row = w.obligationById("OB-BAS-801");
      return s.length === 3 && s.every(Boolean) && accepted && Boolean(row?.breachedAt && row?.completedAt) && escalated(w, "lodgement.breached", "OB-BAS-801").length === 1;
    },
    describe: (w) => `breached on each sweep: ${JSON.stringify(sweeps(w).map((c) => c.response.breached))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained
    // by AI Pathway; the rule store runs on the practice's own account.
    world: () => new CalendarWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the practice's own systems. No live port map is
// published, so run.mjs refuses a production run and the stub reports with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CalendarWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

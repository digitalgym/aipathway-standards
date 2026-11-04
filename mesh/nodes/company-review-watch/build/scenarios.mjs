/**
 * One scenario per check of compliance-calendar-build-standard, for Company Review Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a practice's client book: each "asset" is a client entity
 * with the state of its registered office, each obligation either an ASIC
 * annual review (anchored on the last review date, due the day late fees
 * would start) or an officeholder change notice (anchored on the date of the
 * change). The intervals below are stub figures in the register's 30-day
 * month, not ASIC's or a state regulator's published periods; the practice's
 * own rule set carries those, with citations. Every `holds` reads the world's
 * recorded trace (world.calls), never the build's memory, and returns a
 * strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const ahead = (d) => new Date(NOW.getTime() + d * DAY).toISOString();
const LONG_AGO = "2019-07-01T00:00:00.000Z";

const CLIENTS = [
  { id: "CO-QLD-ELECTRICAL", tag: "CO-QLD-ELECTRICAL", assetClass: "passive", jurisdiction: "QLD" },
  { id: "CO-NSW-JOINERY", tag: "CO-NSW-JOINERY", assetClass: "passive", jurisdiction: "NSW" },
  { id: "AS-QLD-FOOTY-CLUB", tag: "AS-QLD-FOOTY-CLUB", assetClass: "passive", jurisdiction: "QLD" },
  { id: "AS-VIC-MENS-SHED", tag: "AS-VIC-MENS-SHED", assetClass: "passive", jurisdiction: "VIC" },
];

/** Dated rules. Never edited in place: a change is a new version. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 7,
  attestedBy: "a director of the client company",
  leadDays: 30,
  citation: `${jurisdiction} ${obligationType} ${version} (stub)`,
  ...extra,
});

const ob = (id, entityId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId: entityId,
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
    // 1. An annual review whose late-fee date sits 13 months after the last
    // review. A new version moves it to 14 months from a date the clock then
    // passes. Nobody touches the record.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("asic_annual_review", "QLD", "v1", LONG_AGO, 13),
          rule("asic_annual_review", "QLD", "v2", ahead(10), 14),
        ],
        obligations: [ob("OB-AR-101", "CO-QLD-ELECTRICAL", "QLD", "asic_annual_review", ago(300))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(20 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const reads = dueReads(w, "OB-AR-101").map((c) => c.response);
      const [first, second] = reads;
      return Boolean(reads.length === 2 && first?.version === "v1" && second?.version === "v2" && first.date !== second.date);
    },
    describe: (w) => `OB-AR-101 due: ${dueReads(w, "OB-AR-101").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. Two versions of the officeholder change rule. A past change fell due
    // under v1 and is on the history; the build must read v1 back with its
    // dates and find nothing unexplained, while today's date comes from v2.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("officeholder_change_notice", "NSW", "v1", LONG_AGO, 2),
          rule("officeholder_change_notice", "NSW", "v2", "2026-07-01T00:00:00.000Z", 1),
        ],
        obligations: [
          ob("OB-OC-201", "CO-NSW-JOINERY", "NSW", "officeholder_change_notice", ago(5), {
            history: [{ date: "2025-11-14T00:00:00.000Z", version: "v1" }],
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_rule", (c) => c.request.obligationType === "officeholder_change_notice" && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "v1");
      const cur = v.find((r) => r.version === "v2");
      const due = dueReads(w, "OB-OC-201")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom <= "2025-11-14T00:00:00.000Z" &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "v2" &&
          escalated(w, "review.history_unexplained").length === 0,
      );
    },
    describe: (w) => `versions read: ${JSON.stringify(callsTo(w, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. A state-incorporated association's officeholder change is notified to
    // that state's regulator, on that state's period. A Queensland club and a
    // Victorian one, same change date, one rule store, different versions and dates.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("association_officeholder_notice", "QLD", "QLD-v1", LONG_AGO, 1),
          rule("association_officeholder_notice", "VIC", "VIC-v1", LONG_AGO, 2),
        ],
        obligations: [
          ob("OB-AO-301", "AS-QLD-FOOTY-CLUB", "QLD", "association_officeholder_notice", ago(10)),
          ob("OB-AO-302", "AS-VIC-MENS-SHED", "VIC", "association_officeholder_notice", ago(10)),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = dueReads(w, "OB-AO-301")[0]?.response;
      const v = dueReads(w, "OB-AO-302")[0]?.response;
      return Boolean(q && v && q.version === "QLD-v1" && v.version === "VIC-v1" && q.date !== v.date);
    },
    describe: (w) => `QLD ${JSON.stringify(dueReads(w, "OB-AO-301")[0]?.response)}, VIC ${JSON.stringify(dueReads(w, "OB-AO-302")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A company taken over from another practice: nobody has its last
    // review date to hand. It must surface, not start counting from today.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("asic_annual_review", "NSW", "v1", LONG_AGO, 14)],
        obligations: [ob("OB-AR-401", "CO-NSW-JOINERY", "NSW", "asic_annual_review", null)],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const surfaced = callsTo(w, "evidence", (c) => c.request.unknownAnchor === "OB-AR-401" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(w, "OB-AR-401").every((c) => c.response === null);
      return surfaced && noDate && escalated(w, "review.anchor_unknown", "OB-AR-401").length === 1;
    },
    describe: (w) =>
      `unknown anchors surfaced: ${callsTo(w, "evidence", (c) => c.request.unknownAnchor).length}; due reads ${JSON.stringify(dueReads(w, "OB-AR-401").map((c) => c.response))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. One client emails "paid the ASIC fee" with nothing attached. Another's
    // email carries the fee receipt, which is filed and read back by id.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("asic_annual_review", "QLD", "v1", LONG_AGO, 14)],
        obligations: [
          ob("OB-AR-501", "CO-QLD-ELECTRICAL", "QLD", "asic_annual_review", ago(390)),
          ob("OB-AR-502", "CO-QLD-ELECTRICAL", "QLD", "asic_annual_review", ago(390)),
        ],
      }),
    drive: (b, w) =>
      b(w.ports(), [
        { kind: "confirmation", obligationId: "OB-AR-501", messageId: "msg-501" },
        { kind: "confirmation", obligationId: "OB-AR-502", messageId: "msg-502", attachment: "review-fee-receipt.pdf" },
      ]),
    holds: (w) => {
      const bare = callsTo(w, "evidence", (c) => c.request.complete === "OB-AR-501");
      const withDoc = callsTo(w, "evidence", (c) => c.request.complete === "OB-AR-502");
      const row501 = w.obligationById("OB-AR-501");
      return (
        bare.length === 1 &&
        bare[0].response.accepted === false &&
        !row501?.completedAt &&
        escalated(w, "review.completion_without_evidence", "OB-AR-501").length === 1 &&
        withDoc.length === 1 &&
        withDoc[0].response.accepted === true &&
        withDoc[0].request.evidenceRef === "msg-502#review-fee-receipt.pdf" &&
        escalated(w, "review.evidence_not_read_back").length === 0
      );
    },
    describe: (w) => `completion attempts: ${JSON.stringify(callsTo(w, "evidence", (c) => c.request.complete).map((c) => [c.request, c.response]))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The director says they will not pay the review fee this year. Then
    // the late-fee date passes.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("asic_annual_review", "NSW", "v1", LONG_AGO, 14)],
        obligations: [ob("OB-AR-601", "CO-NSW-JOINERY", "NSW", "asic_annual_review", ago(410))],
      }),
    drive: async (b, w) => {
      await b(w.ports(), [{ kind: "refusal", obligationId: "OB-AR-601", by: "client director", at: NOW.toISOString() }]);
      w.advance(30 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const refusal = callsTo(w, "evidence", (c) => c.request.refusal === "OB-AR-601")[0];
      const last = sweeps(w).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          w.obligationById("OB-AR-601")?.refusedAt === NOW.toISOString() &&
          !w.obligationById("OB-AR-601")?.completedAt &&
          last?.response.breached.includes("OB-AR-601") &&
          escalated(w, "review.breached", "OB-AR-601").length >= 1,
      );
    },
    describe: (w) => `sweeps: ${JSON.stringify(sweeps(w).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. An officeholder change past its notice period whose rule names a
    // reminder to the client. No release on file, and one release attempt
    // with no name on it.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("officeholder_change_notice", "QLD", "v1", LONG_AGO, 1, { notice: "reminder to the client to sign the change notice" })],
        obligations: [ob("OB-OC-701", "CO-QLD-ELECTRICAL", "QLD", "officeholder_change_notice", ago(45))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      await b(w.ports(), [{ kind: "release", obligationId: "OB-OC-701" }]);
    },
    holds: (w) => {
      const prepared = callsTo(w, "issue_notice", (c) => c.request.prepare === "OB-OC-701");
      const issued = callsTo(w, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(w)[0]?.response.breached.includes("OB-OC-701") &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          !w.noticeFor("OB-OC-701")?.issuedAt &&
          escalated(w, "review.reminder_drafted_awaiting_release", "OB-OC-701").length >= 1 &&
          escalated(w, "review.release_refused", "OB-OC-701").length === 1,
      );
    },
    describe: (w) => `notice calls: ${JSON.stringify(callsTo(w, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. The review breaches, the fee is paid late with the receipt attached,
    // then the clock moves on. The breach stays on every sweep; chasing stops.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("asic_annual_review", "QLD", "v1", LONG_AGO, 14)],
        obligations: [ob("OB-AR-801", "CO-QLD-ELECTRICAL", "QLD", "asic_annual_review", ago(440))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(5 * DAY);
      await b(w.ports(), [{ kind: "confirmation", obligationId: "OB-AR-801", messageId: "msg-801", attachment: "review-fee-receipt.pdf" }]);
      w.advance(40 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const s = sweeps(w).map((c) => c.response.breached.includes("OB-AR-801"));
      const accepted = callsTo(w, "evidence", (c) => c.request.complete === "OB-AR-801" && c.response.accepted === true).length === 1;
      const row = w.obligationById("OB-AR-801");
      return s.length === 3 && s.every(Boolean) && accepted && Boolean(row?.breachedAt && row?.completedAt) && escalated(w, "review.breached", "OB-AR-801").length === 1;
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

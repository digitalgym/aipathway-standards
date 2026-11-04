/**
 * One scenario per check of compliance-calendar-build-standard, for Lease Dates.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a commercial rent roll: each "asset" is a lease, keyed by
 * its tenancy_id, with the state the premises sit in. Each obligation is a
 * rent review (anchored on the last review date) or an option deadline
 * (anchored on the commencement of the current term). The intervals below are
 * stub figures in the register's 30-day month, not any lease's clause or any
 * state retail leases act's published period; the agency's own rule set
 * carries those, with citations. Every `holds` reads the world's recorded
 * trace (world.calls) or its register, never the build's memory, and returns
 * a strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const ahead = (d) => new Date(NOW.getTime() + d * DAY).toISOString();
const LONG_AGO = "2018-07-01T00:00:00.000Z";

const LEASES = [
  { id: "TEN-QLD-SHOP4", tag: "TEN-QLD-SHOP4", assetClass: "passive", jurisdiction: "QLD" },
  { id: "TEN-NSW-WAREHOUSE7", tag: "TEN-NSW-WAREHOUSE7", assetClass: "passive", jurisdiction: "NSW" },
  { id: "TEN-VIC-SHOP12", tag: "TEN-VIC-SHOP12", assetClass: "passive", jurisdiction: "VIC" },
];

/** Dated rules. Never edited in place: a change is a new version. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 7,
  attestedBy: "the property manager named on the lease",
  leadDays: 60,
  citation: `${jurisdiction} ${obligationType} ${version} (stub)`,
  ...extra,
});

const ob = (id, tenancyId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId: tenancyId,
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
    // 1. A shop lease reviewed every 12 months. A lease variation moves the
    // review to every 13 months from a date the clock then passes. Nobody
    // touches the lease record.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [
          rule("rent_review_annual", "QLD", "v1", LONG_AGO, 12),
          rule("rent_review_annual", "QLD", "v2", ahead(10), 13),
        ],
        obligations: [ob("OB-RR-101", "TEN-QLD-SHOP4", "QLD", "rent_review_annual", ago(200))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(20 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const reads = dueReads(w, "OB-RR-101").map((c) => c.response);
      const [first, second] = reads;
      return Boolean(reads.length === 2 && first?.version === "v1" && second?.version === "v2" && first.date !== second.date);
    },
    describe: (w) => `OB-RR-101 review date: ${dueReads(w, "OB-RR-101").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. The market review clause was varied in July. A review that fell due
    // last year under v1 is on the history; v1 must read back with its dates
    // and explain it, while today's date comes from v2.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [
          rule("rent_review_market", "NSW", "v1", LONG_AGO, 24),
          rule("rent_review_market", "NSW", "v2", "2026-07-01T00:00:00.000Z", 36),
        ],
        obligations: [
          ob("OB-MR-201", "TEN-NSW-WAREHOUSE7", "NSW", "rent_review_market", ago(30), {
            history: [{ date: "2025-08-14T00:00:00.000Z", version: "v1" }],
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_rule", (c) => c.request.obligationType === "rent_review_market" && c.request.jurisdiction === "NSW")[0];
      const v = read?.response?.versions ?? [];
      const old = v.find((r) => r.version === "v1");
      const cur = v.find((r) => r.version === "v2");
      const due = dueReads(w, "OB-MR-201")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom <= "2025-08-14T00:00:00.000Z" &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "v2" &&
          escalated(w, "lease.history_unexplained").length === 0,
      );
    },
    describe: (w) => `versions read: ${JSON.stringify(callsTo(w, "read_rule", (c) => c.request.obligationType).map((c) => c.response))}`,
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. Two five-year retail leases with an option, same commencement, one
    // in Queensland and one in Victoria. The window the state sets for the
    // option reminder differs, so the deadlines differ, from one rule store.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [
          rule("option_deadline_5yr", "QLD", "QLD-v1", LONG_AGO, 54),
          rule("option_deadline_5yr", "VIC", "VIC-v1", LONG_AGO, 57),
        ],
        obligations: [
          ob("OB-OP-301", "TEN-QLD-SHOP4", "QLD", "option_deadline_5yr", ago(1500)),
          ob("OB-OP-302", "TEN-VIC-SHOP12", "VIC", "option_deadline_5yr", ago(1500)),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = dueReads(w, "OB-OP-301")[0]?.response;
      const v = dueReads(w, "OB-OP-302")[0]?.response;
      return Boolean(q && v && q.version === "QLD-v1" && v.version === "VIC-v1" && q.date !== v.date);
    },
    describe: (w) => `QLD ${JSON.stringify(dueReads(w, "OB-OP-301")[0]?.response)}, VIC ${JSON.stringify(dueReads(w, "OB-OP-302")[0]?.response)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A lease taken over from another agency: the file has no record of
    // when the rent was last reviewed. It must surface, not count from today.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [rule("rent_review_annual", "NSW", "v1", LONG_AGO, 12)],
        obligations: [ob("OB-RR-401", "TEN-NSW-WAREHOUSE7", "NSW", "rent_review_annual", null)],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const surfaced = callsTo(w, "evidence", (c) => c.request.unknownAnchor === "OB-RR-401" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(w, "OB-RR-401").every((c) => c.response === null);
      return surfaced && noDate && escalated(w, "lease.anchor_unknown", "OB-RR-401").length === 1;
    },
    describe: (w) =>
      `unknown anchors surfaced: ${callsTo(w, "evidence", (c) => c.request.unknownAnchor).length}; due reads ${JSON.stringify(dueReads(w, "OB-RR-401").map((c) => c.response))}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. One manager emails "served the review notice" with nothing attached.
    // Another email carries the served notice, which is filed and read back.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [rule("rent_review_annual", "QLD", "v1", LONG_AGO, 12)],
        obligations: [
          ob("OB-RR-501", "TEN-QLD-SHOP4", "QLD", "rent_review_annual", ago(340)),
          ob("OB-RR-502", "TEN-QLD-SHOP4", "QLD", "rent_review_annual", ago(340)),
        ],
      }),
    drive: (b, w) =>
      b(w.ports(), [
        { kind: "served", obligationId: "OB-RR-501", messageId: "msg-501" },
        { kind: "served", obligationId: "OB-RR-502", messageId: "msg-502", attachment: "rent-review-notice-served.pdf" },
      ]),
    holds: (w) => {
      const bare = callsTo(w, "evidence", (c) => c.request.complete === "OB-RR-501");
      const withDoc = callsTo(w, "evidence", (c) => c.request.complete === "OB-RR-502");
      const row501 = w.obligationById("OB-RR-501");
      const row502 = w.obligationById("OB-RR-502");
      return (
        bare.length === 1 &&
        bare[0].response.accepted === false &&
        !row501?.completedAt &&
        escalated(w, "lease.served_without_copy", "OB-RR-501").length === 1 &&
        withDoc.length === 1 &&
        withDoc[0].response.accepted === true &&
        withDoc[0].request.evidenceRef === "msg-502#rent-review-notice-served.pdf" &&
        row502?.evidenceRef === "msg-502#rent-review-notice-served.pdf" &&
        escalated(w, "lease.copy_not_read_back").length === 0
      );
    },
    describe: (w) => `completion attempts: ${JSON.stringify(callsTo(w, "evidence", (c) => c.request.complete).map((c) => [c.request, c.response]))}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The landlord says not to review the rent this year. Then the review
    // date passes. The refusal is the record; the review is still live.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [rule("rent_review_annual", "NSW", "v1", LONG_AGO, 12)],
        obligations: [ob("OB-RR-601", "TEN-NSW-WAREHOUSE7", "NSW", "rent_review_annual", ago(350))],
      }),
    drive: async (b, w) => {
      await b(w.ports(), [{ kind: "refusal", obligationId: "OB-RR-601", by: "landlord", at: NOW.toISOString() }]);
      w.advance(30 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const refusal = callsTo(w, "evidence", (c) => c.request.refusal === "OB-RR-601")[0];
      const last = sweeps(w).at(-1);
      return Boolean(
        refusal?.request.at === NOW.toISOString() &&
          refusal.response.stillLive === true &&
          w.obligationById("OB-RR-601")?.refusedAt === NOW.toISOString() &&
          !w.obligationById("OB-RR-601")?.completedAt &&
          last?.response.breached.includes("OB-RR-601") &&
          escalated(w, "lease.refusal_recorded", "OB-RR-601").length === 1 &&
          escalated(w, "lease.date_missed", "OB-RR-601").length >= 1,
      );
    },
    describe: (w) => `sweeps: ${JSON.stringify(sweeps(w).map((c) => c.response.breached))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. A Victorian shop's option deadline has passed and its rule names the
    // landlord's option reminder notice. No release on file, and one release
    // attempt with no name on it.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [rule("option_deadline_5yr", "VIC", "v1", LONG_AGO, 54, { notice: "the landlord's option reminder notice to the tenant" })],
        obligations: [ob("OB-OP-701", "TEN-VIC-SHOP12", "VIC", "option_deadline_5yr", ago(1640))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      await b(w.ports(), [{ kind: "release", obligationId: "OB-OP-701" }]);
    },
    holds: (w) => {
      const prepared = callsTo(w, "issue_notice", (c) => c.request.prepare === "OB-OP-701");
      const issued = callsTo(w, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(w)[0]?.response.breached.includes("OB-OP-701") &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          !w.noticeFor("OB-OP-701")?.issuedAt &&
          escalated(w, "lease.notice_drafted_awaiting_release", "OB-OP-701").length >= 1 &&
          escalated(w, "lease.release_refused", "OB-OP-701").length === 1,
      );
    },
    describe: (w) => `notice calls: ${JSON.stringify(callsTo(w, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. The review date is missed, the notice is served late with the copy
    // attached, then the clock moves on. The miss stays on every sweep;
    // chasing it stops.
    world: () =>
      new CalendarWorld({
        assets: LEASES,
        rules: [rule("rent_review_annual", "QLD", "v1", LONG_AGO, 12)],
        obligations: [ob("OB-RR-801", "TEN-QLD-SHOP4", "QLD", "rent_review_annual", ago(370))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(5 * DAY);
      await b(w.ports(), [{ kind: "served", obligationId: "OB-RR-801", messageId: "msg-801", attachment: "rent-review-notice-served.pdf" }]);
      w.advance(40 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const s = sweeps(w).map((c) => c.response.breached.includes("OB-RR-801"));
      const accepted = callsTo(w, "evidence", (c) => c.request.complete === "OB-RR-801" && c.response.accepted === true).length === 1;
      const row = w.obligationById("OB-RR-801");
      return (
        s.length === 3 &&
        s.every(Boolean) &&
        accepted &&
        Boolean(row?.breachedAt && row?.completedAt) &&
        escalated(w, "lease.date_missed", "OB-RR-801").length === 1
      );
    },
    describe: (w) => `missed on each sweep: ${JSON.stringify(sweeps(w).map((c) => c.response.breached))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained
    // by AI Pathway; the rule set runs on the agency's own account.
    world: () => new CalendarWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
]);

// The pass test runs only on the agency's own systems. No live port map is
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

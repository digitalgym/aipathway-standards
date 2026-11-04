/**
 * One scenario per check of compliance-calendar-build-standard, for Client
 * Review Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init compliance-calendar-build-standard`
 * from https://aipathway.com.au/explore-ai/compliance-calendar-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The register is a practice's client book. Each "asset" is an existing client
 * with the state of the office that holds it; each obligation is that client's
 * periodic AML/CTF due diligence review, typed by the risk rating the
 * compliance officer gave it (cdd_review_low, cdd_review_medium,
 * cdd_review_high). The intervals are stub figures in the register's 30-day
 * month, standing in for the practice's own AML/CTF program settings; they are
 * not AUSTRAC figures. Every `holds` reads the world's recorded trace or its
 * state, never the build's return value, and returns a strict boolean.
 */

import { CalendarWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const ahead = (d) => new Date(NOW.getTime() + d * DAY).toISOString();
const PROGRAM_START = "2026-07-01T00:00:00.000Z";

const CLIENTS = [
  { id: "CLT-0411", tag: "CLT-0411", assetClass: "passive", jurisdiction: "QLD" },
  { id: "CLT-0587", tag: "CLT-0587", assetClass: "passive", jurisdiction: "NSW" },
  { id: "CLT-0623", tag: "CLT-0623", assetClass: "passive", jurisdiction: "VIC" },
];

/** A program setting, versioned. A change is a new version, never an edit. */
const rule = (obligationType, jurisdiction, version, effectiveFrom, intervalMonths, extra = {}) => ({
  obligationType,
  jurisdiction,
  version,
  effectiveFrom,
  intervalMonths,
  retentionYears: 7,
  attestedBy: "the practice's AML/CTF compliance officer",
  leadDays: 30,
  citation: `AML/CTF program, ongoing CDD, ${obligationType} ${jurisdiction} ${version} (stub)`,
  ...extra,
});

const review = (id, clientId, jurisdiction, obligationType, anchorDate, extra = {}) => ({
  id,
  assetId: clientId,
  jurisdiction,
  obligationType,
  anchorDate,
  ...extra,
});

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const dueReads = (w, id) => callsTo(w, "read_rule", (c) => c.request.dueDate === id);
const raised = (w, reason, detail) =>
  callsTo(w, "escalate", (c) => c.request.reason === reason && (detail === undefined || String(c.request.detail ?? "").includes(detail)));
const sweeps = (w) => callsTo(w, "gate", (c) => c.request.sweep === true);
const find = (w, id) => w.all.find((o) => o.id === id);

const strict = (list) => list.map((s) => ({ ...s, holds: (w) => s.holds(w) === true }));

export const scenarios = strict([
  {
    checkId: "dates-derived-not-stored",
    // 1. A high-risk client on a 12-month review. The program is amended to 6
    // months from a date the clock then passes. Nobody touches the record.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("cdd_review_high", "QLD", "P1", PROGRAM_START, 12),
          rule("cdd_review_high", "QLD", "P2", ahead(14), 6),
        ],
        obligations: [review("REV-1001", "CLT-0411", "QLD", "cdd_review_high", ago(40))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(20 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const [first, second] = dueReads(w, "REV-1001").map((c) => c.response);
      return Boolean(
        dueReads(w, "REV-1001").length === 2 &&
          first?.version === "P1" &&
          second?.version === "P2" &&
          first.date !== second.date &&
          new Date(second.date) < new Date(first.date),
      );
    },
    describe: (w) => `REV-1001 due: ${dueReads(w, "REV-1001").map((c) => `${c.response?.date?.slice(0, 10)} (${c.response?.version})`).join(" then ")}`,
  },
  {
    checkId: "superseded-versions-retained",
    // 2. A medium-risk client was last due under P1 (before the July program
    // update). The build must read P1 back with its date and find its history
    // explained, while today's date comes from P2.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("cdd_review_medium", "NSW", "P1", "2025-01-01T00:00:00.000Z", 24),
          rule("cdd_review_medium", "NSW", "P2", PROGRAM_START, 18),
        ],
        obligations: [
          review("REV-2001", "CLT-0587", "NSW", "cdd_review_medium", ago(30), {
            history: [{ date: "2026-03-02T00:00:00.000Z", version: "P1" }],
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_rule", (c) => c.request.obligationType === "cdd_review_medium" && c.request.jurisdiction === "NSW")[0];
      const versions = read?.response?.versions ?? [];
      const old = versions.find((r) => r.version === "P1");
      const cur = versions.find((r) => r.version === "P2");
      const due = dueReads(w, "REV-2001")[0]?.response;
      return Boolean(
        old?.effectiveFrom &&
          cur?.effectiveFrom &&
          old.effectiveFrom <= "2026-03-02T00:00:00.000Z" &&
          old.effectiveFrom < cur.effectiveFrom &&
          due?.version === "P2" &&
          raised(w, "cdd_review.history_unexplained").length === 0,
      );
    },
    describe: (w) => {
      const read = callsTo(w, "read_rule", (c) => c.request.obligationType === "cdd_review_medium")[0];
      return `versions read: ${JSON.stringify(read?.response?.versions ?? null)}; due ${JSON.stringify(dueReads(w, "REV-2001")[0]?.response ?? null)}`;
    },
  },
  {
    checkId: "rules-per-jurisdiction",
    // 3. The same low-risk review for a client held by the QLD office and one
    // held by the VIC office, same anchor, from one rule store whose settings
    // differ by office (a stub difference; the Act is Commonwealth).
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [
          rule("cdd_review_low", "QLD", "QLD-P1", PROGRAM_START, 36),
          rule("cdd_review_low", "VIC", "VIC-P1", PROGRAM_START, 24),
        ],
        obligations: [
          review("REV-3001", "CLT-0411", "QLD", "cdd_review_low", ago(50)),
          review("REV-3002", "CLT-0623", "VIC", "cdd_review_low", ago(50)),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = dueReads(w, "REV-3001")[0]?.response;
      const v = dueReads(w, "REV-3002")[0]?.response;
      return Boolean(q && v && q.version === "QLD-P1" && v.version === "VIC-P1" && q.date !== v.date);
    },
    describe: (w) => `QLD ${JSON.stringify(dueReads(w, "REV-3001")[0]?.response ?? null)}, VIC ${JSON.stringify(dueReads(w, "REV-3002")[0]?.response ?? null)}`,
  },
  {
    checkId: "unknown-anchor-surfaces",
    // 4. A client taken on from a retiring practitioner: no review on file, so
    // nobody knows when it was last checked.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("cdd_review_medium", "NSW", "P1", PROGRAM_START, 18)],
        obligations: [review("REV-4001", "CLT-0587", "NSW", "cdd_review_medium", undefined)],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const surfaced = callsTo(w, "evidence", (c) => c.request.unknownAnchor === "REV-4001" && c.response.surfaced === true).length === 1;
      const noDate = dueReads(w, "REV-4001").every((c) => c.response === null);
      return surfaced && noDate && w.unknownAnchors.includes("REV-4001") && raised(w, "cdd_review.no_review_on_file", "REV-4001").length === 1;
    },
    describe: (w) => `unknown anchors: ${JSON.stringify(w.unknownAnchors)}; raised ${raised(w, "cdd_review.no_review_on_file").length}`,
  },
  {
    checkId: "evidence-of-completion",
    // 5. A staff member emails "reviewed, all fine" with no review record
    // attached. Then a signed record arrives with no reviewer named. Neither
    // closes the review.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("cdd_review_high", "QLD", "P1", PROGRAM_START, 12)],
        obligations: [review("REV-5001", "CLT-0411", "QLD", "cdd_review_high", ago(340))],
      }),
    drive: async (b, w) => {
      await b(w.ports(), [{ kind: "review_record", obligationId: "REV-5001", messageId: "MSG-5001", reviewedBy: "J. Tran" }]);
      await b(w.ports(), [{ kind: "review_record", obligationId: "REV-5001", messageId: "MSG-5002", document: "cdd-review-CLT-0411.pdf" }]);
    },
    holds: (w) => {
      const ob = find(w, "REV-5001");
      return Boolean(
        w.refusedCompletions.some((r) => r.obligationId === "REV-5001") &&
          !ob?.completedAt &&
          !ob?.evidenceRef &&
          w.live.some((o) => o.id === "REV-5001") &&
          raised(w, "cdd_review.completed_without_record", "REV-5001").length === 1 &&
          raised(w, "cdd_review.reviewer_unnamed", "REV-5001").length === 1,
      );
    },
    describe: (w) => `refused completions: ${JSON.stringify(w.refusedCompletions)}; live ${w.live.map((o) => o.id).join(",")}`,
  },
  {
    checkId: "refusal-is-dated-outcome",
    // 6. The client declines to supply updated ownership details. The clock
    // then passes the due date.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("cdd_review_high", "QLD", "P1", PROGRAM_START, 12)],
        obligations: [review("REV-6001", "CLT-0411", "QLD", "cdd_review_high", ago(350))],
      }),
    drive: async (b, w) => {
      await b(w.ports(), [{ kind: "client_declined", obligationId: "REV-6001", by: "client director", at: ago(1) }]);
      w.advance(20 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const ob = find(w, "REV-6001");
      return Boolean(
        ob?.refusedAt === ago(1) &&
          !ob.completedAt &&
          ob.breachedAt &&
          w.live.some((o) => o.id === "REV-6001") &&
          raised(w, "cdd_review.client_declined", "REV-6001").length === 1 &&
          raised(w, "cdd_review.overdue", "REV-6001").length >= 1,
      );
    },
    describe: (w) => `REV-6001: ${JSON.stringify(find(w, "REV-6001"))}`,
  },
  {
    checkId: "notice-needs-a-person",
    // 7. An overdue high-risk review whose rule names a client information
    // request. No release on file, then one release attempt with no name.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("cdd_review_high", "QLD", "P1", PROGRAM_START, 12, { notice: "client information request" })],
        obligations: [review("REV-7001", "CLT-0411", "QLD", "cdd_review_high", ago(380))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      await b(w.ports(), [{ kind: "release", obligationId: "REV-7001" }]);
    },
    holds: (w) => {
      const prepared = callsTo(w, "issue_notice", (c) => c.request.prepare === "REV-7001");
      const issued = callsTo(w, "issue_notice", (c) => c.response.issued === true);
      return Boolean(
        sweeps(w)[0]?.response.breached.includes("REV-7001") &&
          prepared.length >= 1 &&
          prepared.every((c) => c.response.awaiting === "a named release") &&
          issued.length === 0 &&
          !w.noticeFor("REV-7001")?.issuedAt &&
          raised(w, "cdd_review.request_drafted_awaiting_release", "REV-7001").length >= 1 &&
          raised(w, "cdd_review.release_without_person", "REV-7001").length === 1,
      );
    },
    describe: (w) => `notice calls: ${JSON.stringify(callsTo(w, "issue_notice").map((c) => c.response))}`,
  },
  {
    checkId: "breach-does-not-self-clear",
    // 8. A review goes overdue, the signed record arrives late, then the clock
    // moves on. The overdue mark stays on the record.
    world: () =>
      new CalendarWorld({
        assets: CLIENTS,
        rules: [rule("cdd_review_high", "QLD", "P1", PROGRAM_START, 12)],
        obligations: [review("REV-8001", "CLT-0411", "QLD", "cdd_review_high", ago(370))],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(5 * DAY);
      await b(w.ports(), [
        { kind: "review_record", obligationId: "REV-8001", messageId: "MSG-8001", document: "cdd-review-CLT-0411.pdf", reviewedBy: "J. Tran" },
      ]);
      w.advance(30 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const ob = find(w, "REV-8001");
      const all = sweeps(w);
      return Boolean(
        all.length === 3 &&
          all.every((s) => s.response.breached.includes("REV-8001")) &&
          ob?.breachedAt &&
          ob.completedAt &&
          ob.breachedAt < ob.completedAt &&
          ob.evidenceRef === "MSG-8001#cdd-review-CLT-0411.pdf",
      );
    },
    describe: (w) => `REV-8001: ${JSON.stringify(find(w, "REV-8001"))}`,
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and never scores
    // it. Declared: the build is public in digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store and register run on the
    // practice's own account, and its AML/CTF compliance officer can explain it.
    world: () => new CalendarWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
]);

// Checks a stub cannot pass. On the stub the runner reports them as with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 10. A real program change against the practice's live register, then a
    // real late review. Run by hand on the practice's own systems.
    world: () => new CalendarWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

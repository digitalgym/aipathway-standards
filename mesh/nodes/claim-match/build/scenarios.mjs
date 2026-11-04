/**
 * One scenario per check of two-records-build-standard, for Claim Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: the job system (source a) holds each insurance repair job, with
 * the claim number on it, the photos the crew filed and the reports lodged.
 * The insurer's claim record (source b, the claim portal or its export) holds
 * the same claim. They join on the claim number. The contract says the
 * insurer is master for the authorised scope (Australian cents, GST
 * inclusive), the scope version, the excess and the claim status; the job is
 * master for photos on file and reports lodged.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-03T21:00:00.000Z"); // 7:00am Brisbane, the daily run
const OWNER = "Tegan Moore, insurance works coordinator";
const ACCEPTOR = "Tegan Moore";

/** The pair contract, written by a person. */
const CONTRACT = {
  id: "jobs-insurer-claims-2026-11-01",
  sourceA: "job system",
  sourceB: "insurer claim portal",
  key: "claim_number",
  masterByField: {
    authorised_scope_cents: "b",
    scope_version: "b",
    excess_cents: "b",
    claim_status: "b",
    photos_filed: "a",
    reports_lodged: "a",
  },
  toleranceByField: { authorised_scope_cents: 100 }, // one dollar of GST rounding; nothing else has any
  threshold: { amount: 200_000, mismatchRate: 0.25 }, // $2,000, a quarter of joined claims
  schedule: "daily 07:00 Australia/Brisbane",
  owner: OWNER,
};

const claim = (key, insured, over = {}) => ({
  key,
  name: insured,
  fields: {
    authorised_scope_cents: 1_845_000,
    scope_version: "v2",
    excess_cents: 50_000,
    claim_status: "authorised",
    photos_filed: 24,
    reports_lodged: "make_safe,assessment",
    ...over,
  },
});
const world = (a, b, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA: a, sourceB: b });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const firstAt = (w, port, pred = () => true) => w.calls.findIndex((c) => c.port === port && pred(c));
const lastRun = (w) => w.runs[w.runs.length - 1];
const diff = (w, key, field) => w.differences.find((d) => d.key === key && d.field === field);
const sameMasters = (x, y) => {
  const kx = Object.keys(x ?? {}).sort();
  const ky = Object.keys(y ?? {}).sort();
  return kx.length === ky.length && kx.every((k, i) => k === ky[i] && x[k] === y[k]);
};
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0) && typeof r.publishedAt === "string";
const brief = (w) =>
  `${w.calls.length} port call(s); runs ${w.runs.map((r) => COUNTS.map((k) => `${k}=${r[k]}`).join(" ")).join(" | ") || "none"}; ` +
  `differences ${w.differences.map((d) => `${d.key}.${d.field} ${d.valueA}/${d.valueB} master ${d.masterValue} ${d.status}`).join("; ") || "none"}`;

/** Run; a named person accepts the open proposal an hour later; run again. */
const runAcceptRun = async (b, w, key, field) => {
  await b(w.ports());
  w.advance(HOUR);
  const d = w.differences.find((x) => x.key === key && x.field === field && x.status === "open");
  if (d) w.accept(d.id, ACCEPTOR);
  w.advance(HOUR);
  await b(w.ports());
};

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract is read before either side, and the master per field is the contract's: the
    //    job wins on photos filed, the insurer wins on the authorised scope. One master for
    //    everything gets one of the two wrong.
    world: () =>
      world(
        [
          claim("CLM-26-104418", "R. Hamilton", { photos_filed: 31 }),
          claim("CLM-26-104422", "J. Okafor", { authorised_scope_cents: 1_700_000 }),
          claim("CLM-26-104430", "S. Pham"),
        ],
        [
          claim("CLM-26-104418", "R. Hamilton", { photos_filed: 24 }),
          claim("CLM-26-104422", "J. Okafor", { authorised_scope_cents: 1_845_000 }),
          claim("CLM-26-104430", "S. Pham"),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const contractAt = firstAt(w, "read_ledger", (c) => c.request?.contract === true);
      const aAt = firstAt(w, "read_job", (c) => c.request?.source === "a");
      const bAt = firstAt(w, "read_ledger", (c) => c.request?.source === "b");
      const run = lastRun(w);
      const photos = diff(w, "CLM-26-104418", "photos_filed");
      const scope = diff(w, "CLM-26-104422", "authorised_scope_cents");
      return (
        contractAt >= 0 &&
        aAt > contractAt &&
        bAt > contractAt &&
        w.runs.length === 1 &&
        run.contractId === CONTRACT.id &&
        run.joinedOn === CONTRACT.key &&
        sameMasters(run.masterByField, CONTRACT.masterByField) &&
        photos !== undefined &&
        photos.masterValue === 31 &&
        scope !== undefined &&
        scope.masterValue === 1_845_000
      );
    },
    describe: brief,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Same insured name and same authorised scope, different claim numbers (a second claim on
    //    the same house after the next storm): not a pair.
    world: () =>
      world(
        [claim("CLM-26-200101", "M. Brennan", { scope_version: "v1" }), claim("CLM-26-200102", "K. Lindqvist")],
        [claim("CLM-26-200177", "M. Brennan", { scope_version: "v3" }), claim("CLM-26-200102", "K. Lindqvist")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const crossed = w.differences.some((d) => d.key === "CLM-26-200101" || d.key === "CLM-26-200177");
      const orphanA = w.orphans.some((o) => o.key === "CLM-26-200101" && o.source === "a");
      const orphanB = w.orphans.some((o) => o.key === "CLM-26-200177" && o.source === "b");
      return run.joinedOn === CONTRACT.key && !crossed && run.matched === 1 && run.orphaned === 2 && orphanA && orphanB;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key}`).join(", ") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five shared claims: three agree, two disagree on the authorised scope.
    world: () =>
      world(
        [
          claim("CLM-26-300001", "A. Russo"),
          claim("CLM-26-300002", "B. Nguyen"),
          claim("CLM-26-300003", "C. Walsh"),
          claim("CLM-26-300004", "D. Kaur", { authorised_scope_cents: 1_200_000 }),
          claim("CLM-26-300005", "E. Fitzgerald", { authorised_scope_cents: 990_000 }),
        ],
        [
          claim("CLM-26-300001", "A. Russo"),
          claim("CLM-26-300002", "B. Nguyen"),
          claim("CLM-26-300003", "C. Walsh"),
          claim("CLM-26-300004", "D. Kaur", { authorised_scope_cents: 1_320_000 }),
          claim("CLM-26-300005", "E. Fitzgerald", { authorised_scope_cents: 880_000 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const silent = !w.differences.some((d) => ["CLM-26-300001", "CLM-26-300002", "CLM-26-300003"].includes(d.key));
      const d4 = diff(w, "CLM-26-300004", "authorised_scope_cents");
      const d5 = diff(w, "CLM-26-300005", "authorised_scope_cents");
      const shaped =
        d4 !== undefined && d4.valueA === 1_200_000 && d4.valueB === 1_320_000 && d4.masterValue === 1_320_000 && d4.status === "open" &&
        d5 !== undefined && d5.valueA === 990_000 && d5.valueB === 880_000 && d5.masterValue === 880_000 && d5.status === "open";
      const untouched = callsTo(w, "write_ledger").length === 0 && w.changedFields().length === 0;
      return silent && shaped && untouched && w.differences.length === 2 && run.matched === 3 && run.mismatched === 2;
    },
    describe: brief,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The job has the completion report lodged; the insurer's record does not. Lodging it on the
    //    insurer side is proposed, accepted by a named person an hour later, and written once. A run
    //    the next day writes nothing more.
    world: () =>
      world(
        [claim("CLM-26-400001", "F. O'Connell", { reports_lodged: "make_safe,assessment,completion" })],
        [claim("CLM-26-400001", "F. O'Connell", { reports_lodged: "make_safe,assessment" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "CLM-26-400001", "reports_lodged");
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const writes = callsTo(w, "write_ledger");
      const acc = w.acceptances[0];
      if (writes.length !== 1 || !acc) return false;
      const write = writes[0];
      const writeAt = w.calls.indexOf(write);
      const proposeAt = firstAt(w, "gate", (c) => c.request?.propose === acc.differenceId);
      return (
        proposeAt >= 0 &&
        proposeAt < writeAt &&
        write.at >= acc.acceptedAt &&
        write.request.source === "b" &&
        write.request.key === "CLM-26-400001" &&
        write.request.field === "reports_lodged" &&
        write.request.value === "make_safe,assessment,completion" &&
        write.request.correction?.acceptedBy === ACCEPTOR &&
        w.recordOf("b", "CLM-26-400001")?.fields.reports_lodged === "make_safe,assessment,completion"
      );
    },
    describe: (w) =>
      `${brief(w)}; writes ${callsTo(w, "write_ledger").map((c) => `${c.at} ${c.request.key}.${c.request.field} by ${c.request.correction?.acceptedBy ?? "nobody"}`).join("; ") || "none"}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A job carrying a claim number the insurer has no claim under, and an insurer claim no job carries.
    world: () =>
      world(
        [claim("CLM-26-500001", "G. Taufa"), claim("CLM-26-500002", "H. Moreau")],
        [claim("CLM-26-500002", "H. Moreau"), claim("CLM-26-500009", "I. Sato")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const ok = (key, source) => {
        const o = w.orphans.find((x) => x.key === key && x.source === source);
        const handed = callsTo(w, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
        return o !== undefined && typeof o.reason === "string" && o.reason.trim().length > 0 && o.owner === OWNER && handed;
      };
      return w.orphans.length === 2 && ok("CLM-26-500001", "a") && ok("CLM-26-500009", "b") && run.orphaned === 2 && callsTo(w, "write_ledger").length === 0;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key} to ${o.owner}`).join(", ") || "none"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. One dollar declared on the authorised scope, nothing on the excess. Fifty cents on the scope
    //    is within tolerance; $400 on the scope is open; one cent on the excess is open.
    world: () =>
      world(
        [
          claim("CLM-26-600001", "J. Abara", { authorised_scope_cents: 1_845_050 }),
          claim("CLM-26-600002", "K. Doyle", { authorised_scope_cents: 1_805_000 }),
          claim("CLM-26-600003", "L. Ferreira", { excess_cents: 50_001 }),
        ],
        [
          claim("CLM-26-600001", "J. Abara", { authorised_scope_cents: 1_845_000 }),
          claim("CLM-26-600002", "K. Doyle", { authorised_scope_cents: 1_845_000 }),
          claim("CLM-26-600003", "L. Ferreira", { excess_cents: 50_000 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const declaredOnly = w.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, x.field));
      return (
        diff(w, "CLM-26-600001", "authorised_scope_cents")?.status === "within_tolerance" &&
        diff(w, "CLM-26-600002", "authorised_scope_cents")?.status === "open" &&
        diff(w, "CLM-26-600003", "excess_cents")?.status === "open" &&
        declaredOnly &&
        run.withinTolerance === 1 &&
        run.mismatched === 2 &&
        w.changedFields().length === 0
      );
    },
    describe: brief,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Everything agrees; two daily runs; both publish an all-clear with all five counts.
    world: () =>
      world(
        [claim("CLM-26-700001", "M. Quinn"), claim("CLM-26-700002", "N. Reddy"), claim("CLM-26-700003", "O. Svensson")],
        [claim("CLM-26-700001", "M. Quinn"), claim("CLM-26-700002", "N. Reddy"), claim("CLM-26-700003", "O. Svensson")],
      ),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      if (w.runs.length !== 2) return false;
      const allClear = w.runs.every(
        (r) => hasCounts(r) && r.matched === 3 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0,
      );
      return allClear && callsTo(w, "publish_report").length === 2 && w.runs[0].id !== w.runs[1].id && w.runs[0].publishedAt < w.runs[1].publishedAt;
    },
    describe: brief,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. The insurer authorised $3,450 more than the job shows on one of three claims: over the
    //    $2,000 amount, and one in three tips the run over the 25% rate.
    world: () =>
      world(
        [claim("CLM-26-800001", "P. Turner", { authorised_scope_cents: 1_500_000 }), claim("CLM-26-800002", "Q. Valdez"), claim("CLM-26-800003", "R. Wong")],
        [claim("CLM-26-800001", "P. Turner", { authorised_scope_cents: 1_845_000 }), claim("CLM-26-800002", "Q. Valdez"), claim("CLM-26-800003", "R. Wong")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const publishAt = firstAt(w, "publish_report");
      const told = firstAt(w, "notify", (c) => c.request?.to === OWNER && /CLM-26-800001/.test(c.request?.detail ?? ""));
      const escalated = firstAt(w, "escalate", (c) => /rate/i.test(c.request?.reason ?? ""));
      return w.runs.length === 1 && publishAt >= 0 && told >= 0 && told < publishAt && escalated >= 0 && escalated < publishAt;
    },
    describe: (w) =>
      `${brief(w)}; notices ${w.notices.map((n) => `${n.to}: ${n.reason}`).join("; ") || "none"}; escalations ${w.escalations.map((e) => e.reason).join("; ") || "none"}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The job still carries the first scope; the insurer has since authorised a variation. The
    //    insurer owns it. Accepted, written to the job once, both originals kept on the Difference.
    world: () =>
      world(
        [claim("CLM-26-900001", "S. Yilmaz", { authorised_scope_cents: 1_620_000 })],
        [claim("CLM-26-900001", "S. Yilmaz", { authorised_scope_cents: 1_845_000 })],
      ),
    drive: (b, w) => runAcceptRun(b, w, "CLM-26-900001", "authorised_scope_cents"),
    holds: (w) => {
      const d = diff(w, "CLM-26-900001", "authorised_scope_cents");
      if (!d) return false;
      const c = w.correctionFor(d.id);
      const changed = w.changedFields();
      const everyChangeBacked = changed.every((f) =>
        w.corrections.some((k) => {
          const kd = w.differences.find((x) => x.id === k.differenceId);
          return kd !== undefined && kd.key === f.key && kd.field === f.field && k.target === f.source && Boolean(k.writtenId) && Boolean(k.acceptedBy);
        }),
      );
      const acc = w.acceptances.find((a) => a.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "CLM-26-900001");
      const onlyAccepted = acc !== undefined && writes.length === 1 && writes[0].at >= acc.acceptedAt && writes[0].request.correction?.acceptedBy === ACCEPTOR;
      return (
        onlyAccepted &&
        w.recordOf("a", "CLM-26-900001")?.fields.authorised_scope_cents === 1_845_000 &&
        d.valueA === 1_620_000 &&
        d.valueB === 1_845_000 &&
        d.masterValue === 1_845_000 &&
        c !== undefined &&
        c.target === "a" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        c.writtenId.length > 0 &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (w) =>
      `${brief(w)}; corrections ${w.corrections.map((c) => `${c.differenceId} to ${c.target} by ${c.acceptedBy ?? "nobody"} id ${c.writtenId ?? "none"}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. Claim status mismatched in one run, accepted, written in the next: the record by that
    //     claim number tells the whole story.
    world: () =>
      world(
        [claim("CLM-26-100001", "T. Zhou", { claim_status: "assessment" })],
        [claim("CLM-26-100001", "T. Zhou", { claim_status: "authorised" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "CLM-26-100001", "claim_status");
      w.ports().readHistory("CLM-26-100001"); // the question somebody asks: why does the job say authorised?
    },
    holds: (w) => {
      const h = w.historyFor("CLM-26-100001");
      const d = h.differences.find((x) => x.field === "claim_status");
      if (!d) return false;
      const c = h.corrections.find((x) => x.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "CLM-26-100001");
      return (
        writes.length === 1 &&
        c !== undefined &&
        writes[0].response?.writtenId === c.writtenId &&
        h.runs.some((r) => r.id === d.runId) &&
        d.valueA === "assessment" &&
        d.valueB === "authorised" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string" &&
        w.recordOf("a", "CLM-26-100001")?.fields.claim_status === "authorised"
      );
    },
    describe: (w) => {
      const h = w.historyFor("CLM-26-100001");
      return `${brief(w)}; history: ${h.runs.length} run(s), ${h.differences.length} difference(s), ${h.corrections.length} correction(s)`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports it and does not score it on the build's say-so.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained by AI Pathway;
    // the contract and the runs live on the business's own job system and insurer portal logins.
    world: () => world([], []),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own job system and insurer claim record, with a
// person accepting the seeded correction. No live port map is published for this standard, so
// run.mjs refuses a production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

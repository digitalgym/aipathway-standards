/**
 * One scenario per check of two-records-build-standard, for Balance Proof.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario: source a is the month's support file (one entry
 * per supporting document, tagged with the Xero account it supports, showing
 * the closing balance and its as-at date); source b is Xero (the balance sheet
 * at month end, one entry per account carrying a balance). The shared key is
 * the Xero account id. Balances are dollars, dates are YYYY-MM-DD.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the objects raised through them), never the build's own memory, and
 * returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Mei Lin Tran (senior accountant)";
const ACCEPTOR = "Mei Lin Tran";
const EOM = "2026-10-31";

const contract = (over = {}) => ({
  id: "PC-support-file-vs-xero-balance-sheet-2026-10-01",
  sourceA: "the month's support file (statements and schedules, each tagged with its Xero account)",
  sourceB: "Xero (balance sheet at month end)",
  key: "account_id",
  masterByField: { balance: "a", as_at: "a" },
  toleranceByField: {},
  threshold: { amount: 1000, mismatchRate: 0.5 },
  schedule: "monthly, third business day 07:00 Australia/Sydney",
  owner: OWNER,
  ...over,
});

// One account or one document, keyed by the Xero account id.
const acct = (key, name, balance, as_at = EOM) => ({ key, name, fields: { balance, as_at } });

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const writes = (world) => callsTo(world, "write_ledger");
const published = (world) => callsTo(world, "publish_report");
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasAllCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const allClear = (r) => r.matched > 0 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0;

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract beside two seeded sources; and the same build against a
    // world with no contract at all, which must not publish a guessed run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-090", "Business Cheque Account", 48210.55), acct("ACC-820", "GST", -6340.0)],
        sourceB: [acct("ACC-090", "Business Cheque Account", 48210.55), acct("ACC-820", "GST", -6340.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [acct("ACC-090", "Business Cheque Account", 48210.55)],
        sourceB: [acct("ACC-090", "Business Cheque Account", 47110.55)],
      });
      await build(world.noContract.ports());
    },
    holds: (world) => {
      const contractRead = world.firstCall("read_ledger", (c) => c.request?.contract === true);
      const sourceRead = Math.min(
        ...[world.firstCall("read_job"), world.firstCall("read_ledger", (c) => c.request?.source === "b")].map((i) => (i < 0 ? Infinity : i)),
      );
      const runs = world.runs;
      const c = contract();
      const declared =
        runs.length === 1 &&
        runs[0].contractId === c.id &&
        JSON.stringify(runs[0].masterByField) === JSON.stringify(c.masterByField);
      const nc = world.noContract;
      const refusedGuess =
        !!nc &&
        nc.runs.length === 0 &&
        nc.differences.length === 0 &&
        nc.calls.every((x) => x.port !== "read_job" && x.request?.source !== "b") &&
        nc.escalations.length > 0;
      return contractRead === 0 && Number.isFinite(sourceRead) && contractRead < sourceRead && declared && refusedGuess;
    },
    describe: (world) =>
      `runs ${JSON.stringify(world.runs.map((r) => ({ contractId: r.contractId, masterByField: r.masterByField })))}; no-contract world: ${world.noContract?.runs.length ?? "?"} run(s), ${world.noContract?.escalations.length ?? "?"} escalation(s); ${world.calls.length} port call(s)`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Two hire purchase accounts with the same name and the same balance,
    // under different account ids. Name and amount must not pair them.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-871", "Hire Purchase - Ute", -18400.0), acct("ACC-090", "Business Cheque Account", 12500.0)],
        sourceB: [acct("ACC-872", "Hire Purchase - Ute", -18400.0), acct("ACC-090", "Business Cheque Account", 12500.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalikes = new Set(["ACC-871", "ACC-872"]);
      const noDiffBetween = world.differences.every((d) => !lookalikes.has(d.key));
      const bothOrphaned =
        world.orphans.some((o) => o.key === "ACC-871" && o.source === "a") &&
        world.orphans.some((o) => o.key === "ACC-872" && o.source === "b");
      return world.runs.length === 1 && run.joinedOn === "account_id" && run.matched === 1 && noDiffBetween && bothOrphaned;
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five accounts: three tie to their document, two do not.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          acct("ACC-090", "Business Cheque Account", 48210.55),
          acct("ACC-820", "GST", -6340.0),
          acct("ACC-825", "PAYG Withholdings Payable", -4812.0),
          acct("ACC-826", "Superannuation Payable", -3966.4),
          acct("ACC-880", "Vehicle Loan - Hilux", -22180.0),
        ],
        sourceB: [
          acct("ACC-090", "Business Cheque Account", 48210.55),
          acct("ACC-820", "GST", -6340.0),
          acct("ACC-825", "PAYG Withholdings Payable", -4812.0),
          acct("ACC-826", "Superannuation Payable", -3604.0),
          acct("ACC-880", "Vehicle Loan - Hilux", -22955.0),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tied = ["ACC-090", "ACC-820", "ACC-825"];
      const silent = world.differences.every((d) => !tied.includes(d.key));
      const super_ = world.differences.find((d) => d.key === "ACC-826");
      const loan = world.differences.find((d) => d.key === "ACC-880");
      const shaped = (d, a, b) => !!d && d.field === "balance" && d.valueA === a && d.valueB === b && d.masterValue === a;
      const run = world.runs[0];
      return (
        world.differences.length === 2 &&
        silent &&
        shaped(super_, -3966.4, -3604.0) &&
        shaped(loan, -22180.0, -22955.0) &&
        writes(world).length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((d) => [d.key, d.field, d.valueA, d.valueB, d.masterValue]))}; writes ${writes(world).length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The loan statement and Xero disagree. Run, a named person accepts an
    // hour later, run again, then a third time to prove the write is not repeated.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-880", "Vehicle Loan - Hilux", -22180.0)],
        sourceB: [acct("ACC-880", "Vehicle Loan - Hilux", -22955.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      world.callsBeforeAccept = world.calls.length;
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.advance(HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const cut = world.callsBeforeAccept ?? 0;
      const before = world.calls.slice(0, cut).filter((c) => c.port === "write_ledger");
      const after = world.calls.slice(cut).filter((c) => c.port === "write_ledger");
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.correction?.acceptedBy === ACCEPTOR &&
        w.request?.source === "b" &&
        w.request?.value === -22180.0 &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut
      );
    },
    describe: (world) => `writes ${JSON.stringify(writes(world).map((c) => c.request))}; acceptances ${world.acceptances.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A Xero balance with no document behind it (the balance nobody can
    // explain), and a document naming an account Xero holds no balance on.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-090", "Business Cheque Account", 9100.0), acct("ACC-885", "Equipment Finance - Excavator", -41200.0)],
        sourceB: [acct("ACC-090", "Business Cheque Account", 9100.0), acct("ACC-840", "Suspense", 2735.18)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      return (
        world.orphans.length === 2 &&
        good(o("ACC-885", "a")) &&
        good(o("ACC-840", "b")) &&
        handed("ACC-885") &&
        handed("ACC-840") &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. A one-dollar rounding tolerance on balance (the ATO account rounds to
    // the dollar), none on as_at. One balance inside it, one outside it, and a
    // statement dated a day before month end with no tolerance on the date.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { balance: 1 } }),
        sourceA: [
          acct("ACC-830", "Income Tax Payable", -15420.0),
          acct("ACC-826", "Superannuation Payable", -3966.4),
          acct("ACC-880", "Vehicle Loan - Hilux", -22180.0, "2026-10-30"),
        ],
        sourceB: [
          acct("ACC-830", "Income Tax Payable", -15420.62),
          acct("ACC-826", "Superannuation Payable", -3604.0),
          acct("ACC-880", "Vehicle Loan - Hilux", -22180.0, EOM),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = contract({ toleranceByField: { balance: 1 } }).toleranceByField;
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const everyWithinDeclared = world.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(tol, x.field));
      return (
        d("ACC-830", "balance")?.status === "within_tolerance" &&
        d("ACC-826", "balance")?.status === "open" &&
        d("ACC-880", "as_at")?.status === "open" &&
        everyWithinDeclared &&
        world.runs.length === 1 &&
        world.runs[0].withinTolerance === 1 &&
        world.runs[0].mismatched === 2
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Every account ties; two scheduled month-end runs a month apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-090", "Business Cheque Account", 31007.2), acct("ACC-820", "GST", -2210.0)],
        sourceB: [acct("ACC-090", "Business Cheque Account", 31007.2), acct("ACC-820", "GST", -2210.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(30 * 24 * HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const pubs = published(world);
      return (
        world.runs.length === 2 &&
        pubs.length === 2 &&
        world.runs.every((r) => hasAllCounts(r) && typeof r.publishedAt === "string" && r.publishedAt.length > 0 && allClear(r)) &&
        world.runs[0].publishedAt !== world.runs[1].publishedAt
      );
    },
    describe: (world) => `runs ${JSON.stringify(world.runs.map((r) => ({ at: r.publishedAt, ...Object.fromEntries(COUNTS.map((k) => [k, r[k]])) })))}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Threshold $1,000 and a rate of 0.25; one account $4,500 apart in three.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 1000, mismatchRate: 0.25 } }),
        sourceA: [acct("ACC-610", "Trade Debtors", 86400.0), acct("ACC-820", "GST", -6340.0), acct("ACC-090", "Business Cheque Account", 48210.55)],
        sourceB: [acct("ACC-610", "Trade Debtors", 90900.0), acct("ACC-820", "GST", -6340.0), acct("ACC-090", "Business Cheque Account", 48210.55)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("ACC-610"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && world.runs.length === 1;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. One gap, accepted by a named person, written on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-826", "Superannuation Payable", -3966.4), acct("ACC-090", "Business Cheque Account", 8800.0)],
        sourceB: [acct("ACC-826", "Superannuation Payable", -3604.0), acct("ACC-090", "Business Cheque Account", 8800.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const d = world.differences.find((x) => x.key === "ACC-826" && x.field === "balance");
      if (!d) return false;
      const c = world.correctionFor(d.id);
      const nowB = world.recordOf("b", "ACC-826")?.fields.balance;
      const changed = world.changedFields();
      const everyChangeBacked = changed.every((ch) =>
        world.differences.some((x) => {
          const cx = world.correctionFor(x.id);
          return x.key === ch.key && x.field === ch.field && !!cx && cx.target === ch.source && !!cx.acceptedBy && !!cx.writtenId;
        }),
      );
      return (
        nowB === -3966.4 &&
        d.valueA === -3966.4 &&
        d.valueB === -3604.0 &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences)}; corrections ${JSON.stringify(world.corrections)}; changed ${JSON.stringify(world.changedFields())}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. One account mismatched in one run, accepted, written in the next;
    // then read by its account id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ACC-880", "Vehicle Loan - Hilux", -22180.0), acct("ACC-820", "GST", -1904.0)],
        sourceB: [acct("ACC-880", "Vehicle Loan - Hilux", -22955.0), acct("ACC-820", "GST", -1904.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory("ACC-880");
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "balance");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === -22180.0 &&
        d.valueB === -22955.0 &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string"
      );
    },
    describe: (world) => `history ${JSON.stringify(world.read ?? null)}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a runtime property. The runner reports it as evidence_required
    // and never runs this scenario, so it can never be scored green here.
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on the business's own support file and Xero file, by
// hand, with a person on the correction. A stub cannot pass it and is not asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

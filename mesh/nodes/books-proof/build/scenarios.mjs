/**
 * One scenario per check of two-records-build-standard, for Books Proof.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario:
 *   source a  Record A, the master: the client's ledger (Xero) trial balance at
 *             the as-of date, one entry per account.
 *   source b  Record B: the shadow ledger the bot rebuilt from the ledger's
 *             source documents, opened from Record A at the cutover date.
 *   key       the account id (invented ids below, never real Xero data).
 *   fields    balance (closing, at the as-of date) and movement (the month's net
 *             movement), in dollars, both mastered by a, tolerance zero.
 *
 * The causes in the figures are the ones a ledger rebuild really meets: an
 * expense claim the API does not expose, a conversion balance the API does not
 * expose, a bill that was voided after it was keyed. The amounts are small and
 * made up.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Priya Raman (client manager)";
const ACCEPTOR = "Priya Raman";

const contract = (over = {}) => ({
  id: "PC-books-proof-xero-tb-vs-shadow-2026-11-01",
  sourceA: "the client's ledger (Xero): trial balance at the as-of date, the books of record",
  sourceB: "the shadow ledger rebuilt from the ledger's source documents, opened from the trial balance at cutover 2026-07-01",
  key: "account_id",
  masterByField: { balance: "a", movement: "a" },
  toleranceByField: { balance: 0, movement: 0 },
  threshold: { amount: 500, mismatchRate: 0.5 },
  schedule: "monthly, 5th business day 07:00 Australia/Brisbane",
  owner: OWNER,
  ...over,
});

// One account, keyed by its account id.
const acct = (key, name, balance, movement = 0) => ({ key, name, fields: { balance, movement } });

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const writes = (world) => callsTo(world, "write_ledger");
const published = (world) => callsTo(world, "publish_report");
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasAllCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const allClear = (r) => r.matched > 0 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0;
const noWriteToMaster = (world) => writes(world).every((c) => c.request?.source === "b") && world.changedFields().every((ch) => ch.source === "b");

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract beside two seeded records; then the same build in a world
    // with no contract, which must not compare or publish anything.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-1100", "Business Bank", 7420.15, 1210.4), acct("ac-4000", "Sales", -18350.0, -3100.0)],
        sourceB: [acct("ac-1100", "Business Bank", 7420.15, 1210.4), acct("ac-4000", "Sales", -18350.0, -3100.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [acct("ac-1100", "Business Bank", 7420.15, 1210.4)],
        sourceB: [acct("ac-1100", "Business Bank", 7150.15, 940.4)],
      });
      await build(world.noContract.ports());
    },
    holds: (world) => {
      const contractRead = world.firstCall("read_ledger", (c) => c.request?.contract === true);
      const firstSource = Math.min(
        ...[world.firstCall("read_job"), world.firstCall("read_ledger", (c) => c.request?.source === "b")].map((i) => (i < 0 ? Infinity : i)),
      );
      const c = contract();
      const declared =
        world.runs.length === 1 &&
        world.runs[0].contractId === c.id &&
        JSON.stringify(world.runs[0].masterByField) === JSON.stringify(c.masterByField);
      const nc = world.noContract;
      const refused =
        !!nc &&
        nc.runs.length === 0 &&
        nc.differences.length === 0 &&
        nc.calls.every((x) => x.port !== "read_job" && x.request?.source !== "b") &&
        nc.escalations.length > 0;
      return contractRead === 0 && Number.isFinite(firstSource) && contractRead < firstSource && declared && refused;
    },
    describe: (world) =>
      `runs ${JSON.stringify(world.runs.map((r) => ({ contractId: r.contractId, masterByField: r.masterByField })))}; no-contract world: ${world.noContract?.runs.length ?? "?"} run(s), ${world.noContract?.escalations.length ?? "?"} escalation(s)`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Two "Motor Vehicle Expenses" accounts with the same balance under
    // different ids (one archived and recreated in the trial balance, one in
    // the shadow ledger). Name and amount must not pair them.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-6200", "Motor Vehicle Expenses", 842.5, 120.0), acct("ac-1100", "Business Bank", 3010.0, 410.0)],
        sourceB: [acct("ac-6201", "Motor Vehicle Expenses", 842.5, 120.0), acct("ac-1100", "Business Bank", 3010.0, 410.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalikes = new Set(["ac-6200", "ac-6201"]);
      return (
        world.runs.length === 1 &&
        run.joinedOn === "account_id" &&
        run.matched === 1 &&
        world.differences.every((d) => !lookalikes.has(d.key)) &&
        world.orphans.some((o) => o.key === "ac-6200" && o.source === "a") &&
        world.orphans.some((o) => o.key === "ac-6201" && o.source === "b")
      );
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five accounts: three agree; Travel is short in the shadow ledger by an
    // expense claim the API does not expose; GST is short by its GST.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          acct("ac-1100", "Business Bank", 5120.3, 640.0),
          acct("ac-4000", "Sales", -9200.0, -1450.0),
          acct("ac-6100", "Office Expenses", 310.25, 44.0),
          acct("ac-6400", "Travel - National", 268.4, 68.4),
          acct("ac-8200", "GST", -512.84, -95.16),
        ],
        sourceB: [
          acct("ac-1100", "Business Bank", 5120.3, 640.0),
          acct("ac-4000", "Sales", -9200.0, -1450.0),
          acct("ac-6100", "Office Expenses", 310.25, 44.0),
          acct("ac-6400", "Travel - National", 200.0, 0),
          acct("ac-8200", "GST", -519.68, -102.0),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreed = ["ac-1100", "ac-4000", "ac-6100"];
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const shaped = (x, a, b) => !!x && x.valueA === a && x.valueB === b && x.masterValue === a && x.status === "open";
      const run = world.runs[0];
      return (
        world.differences.length === 4 &&
        world.differences.every((x) => !agreed.includes(x.key)) &&
        shaped(d("ac-6400", "balance"), 268.4, 200.0) &&
        shaped(d("ac-6400", "movement"), 68.4, 0) &&
        shaped(d("ac-8200", "balance"), -512.84, -519.68) &&
        shaped(d("ac-8200", "movement"), -95.16, -102.0) &&
        writes(world).length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.valueA, x.valueB, x.masterValue, x.status]))}; writes ${writes(world).length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. Historical Adjustment differs by a conversion balance the API does not
    // expose. Run; a named person accepts an hour later with the cause "opening
    // balance"; run again; run a third time to prove the adjustment is one write.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-8400", "Historical Adjustment", -2650.0, 0)],
        sourceB: [acct("ac-8400", "Historical Adjustment", -2150.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      world.callsBeforeAccept = world.calls.length;
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.advance(HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const cut = world.callsBeforeAccept ?? 0;
      const before = world.calls.slice(0, cut).filter((c) => c.port === "write_ledger");
      const after = world.calls.slice(cut).filter((c) => c.port === "write_ledger");
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose && c.request?.target === "b" && c.request?.proposedValue === -2650.0);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.source === "b" &&
        w.request?.key === "ac-8400" &&
        w.request?.value === -2650.0 &&
        w.request?.correction?.acceptedBy === ACCEPTOR &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut &&
        world.recordOf("a", "ac-8400")?.fields.balance === -2650.0 &&
        noWriteToMaster(world)
      );
    },
    describe: (world) => `writes ${JSON.stringify(writes(world).map((c) => c.request))}; acceptances ${world.acceptances.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. Unpaid Expense Claims is in the trial balance with nothing in the
    // shadow ledger (no document the API returns posts to it); the shadow
    // ledger posts to an account the trial balance does not carry.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-1100", "Business Bank", 2200.0, 300.0), acct("ac-8150", "Unpaid Expense Claims", -75.24, -75.24)],
        sourceB: [acct("ac-1100", "Business Bank", 2200.0, 300.0), acct("ac-6990", "Repairs (deleted account)", 140.0, 140.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      return (
        world.orphans.length === 2 &&
        good(o("ac-8150", "a")) &&
        good(o("ac-6990", "b")) &&
        handed("ac-8150") &&
        handed("ac-6990") &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2 &&
        world.differences.length === 0
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. A person has written a five-cent tolerance on movement (a rounding
    // line) and left balance with none declared. One movement gap inside it,
    // one balance gap of one cent with no tolerance, which must stay open.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { movement: 0.05 } }),
        sourceA: [acct("ac-8600", "Rounding", 0.09, 0.09), acct("ac-1100", "Business Bank", 1500.0, 210.0)],
        sourceB: [acct("ac-8600", "Rounding", 0.09, 0.05), acct("ac-1100", "Business Bank", 1500.01, 210.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = { movement: 0.05 };
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const run = world.runs[0];
      return (
        d("ac-8600", "movement")?.status === "within_tolerance" &&
        d("ac-1100", "balance")?.status === "open" &&
        world.differences.length === 2 &&
        world.differences.filter((x) => x.status === "within_tolerance").every((x) => Object.prototype.hasOwnProperty.call(tol, x.field)) &&
        world.runs.length === 1 &&
        run.withinTolerance === 1 &&
        run.mismatched === 1
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Every account agrees; two monthly runs a month apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-1100", "Business Bank", 4310.6, 520.0), acct("ac-4000", "Sales", -6100.0, -980.0)],
        sourceB: [acct("ac-1100", "Business Bank", 4310.6, 520.0), acct("ac-4000", "Sales", -6100.0, -980.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(30 * 24 * HOUR);
      await build(world.ports());
    },
    holds: (world) =>
      world.runs.length === 2 &&
      published(world).length === 2 &&
      world.runs.every((r) => hasAllCounts(r) && typeof r.publishedAt === "string" && r.publishedAt.length > 0 && allClear(r)) &&
      world.runs[0].publishedAt !== world.runs[1].publishedAt,
    describe: (world) => `runs ${JSON.stringify(world.runs.map((r) => ({ at: r.publishedAt, ...Object.fromEntries(COUNTS.map((k) => [k, r[k]])) })))}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Threshold $500 and a rate of 0.3. Accounts Payable is $880 higher in
    // the shadow ledger (a bill voided after it was keyed), one account in three.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 500, mismatchRate: 0.3 } }),
        sourceA: [acct("ac-8000", "Accounts Payable", -2140.0, -400.0), acct("ac-1100", "Business Bank", 3900.0, 150.0), acct("ac-4000", "Sales", -7700.0, -1200.0)],
        sourceB: [acct("ac-8000", "Accounts Payable", -3020.0, -400.0), acct("ac-1100", "Business Bank", 3900.0, 150.0), acct("ac-4000", "Sales", -7700.0, -1200.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("ac-8000"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return world.runs.length === 1 && pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. Travel short by an expense claim; accepted with that cause, written as
    // one adjustment into the shadow ledger on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-6400", "Travel - National", 268.4, 0), acct("ac-1100", "Business Bank", 980.0, 0)],
        sourceB: [acct("ac-6400", "Travel - National", 200.0, 0), acct("ac-1100", "Business Bank", 980.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const d = world.differences.find((x) => x.key === "ac-6400" && x.field === "balance");
      if (!d) return false;
      const c = world.correctionFor(d.id);
      const changed = world.changedFields();
      const backed = changed.every((ch) =>
        world.differences.some((x) => {
          const cx = world.correctionFor(x.id);
          return x.key === ch.key && x.field === ch.field && !!cx && cx.target === ch.source && !!cx.acceptedBy && !!cx.writtenId;
        }),
      );
      return (
        world.recordOf("b", "ac-6400")?.fields.balance === 268.4 &&
        d.valueA === 268.4 &&
        d.valueB === 200.0 &&
        !!c &&
        c.target === "b" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changed.length === 1 &&
        backed &&
        noWriteToMaster(world)
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences)}; corrections ${JSON.stringify(world.corrections)}; changed ${JSON.stringify(world.changedFields())}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. Historical Adjustment mismatched in one run, accepted, written in the
    // next; then read back by its account id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [acct("ac-8400", "Historical Adjustment", -2650.0, 0), acct("ac-8200", "GST", -340.0, -60.0)],
        sourceB: [acct("ac-8400", "Historical Adjustment", -2150.0, 0), acct("ac-8200", "GST", -340.0, -60.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory("ac-8400");
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "balance");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        !!d &&
        d.valueA === -2650.0 &&
        d.valueB === -2150.0 &&
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
    // and never scores it green here.
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on a real client's ledger and its shadow, by hand, with a
// person on the acceptance. A stub cannot pass it and is not asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

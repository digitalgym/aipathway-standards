/**
 * One scenario per check of two-records-build-standard, for Feed Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario: source a is the bank feed (statement lines that
 * carry the bill_id in their payment reference), source b is Xero (bills
 * recorded as paid in the period). The shared key is the bill_id. Amounts are
 * dollars, dates are YYYY-MM-DD.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the objects raised through them), never the build's own memory, and
 * returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Priya Shah (bookkeeper)";
const ACCEPTOR = "Priya Shah";

const contract = (over = {}) => ({
  id: "PC-bank-feed-vs-xero-bills-2026-10-01",
  sourceA: "bank feed (business cheque account statement lines)",
  sourceB: "Xero (bills paid in the period)",
  key: "bill_id",
  masterByField: { amount: "a", paid_on: "a" },
  toleranceByField: {},
  threshold: { amount: 500, mismatchRate: 0.5 },
  schedule: "daily 07:00 Australia/Brisbane",
  owner: OWNER,
  ...over,
});

const line = (key, name, amount, paid_on = "2026-09-24") => ({ key, name, fields: { amount, paid_on } });

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
        sourceA: [line("BILL-101", "Reece Plumbing", 1320.0), line("BILL-102", "Bunnings Trade", 418.6)],
        sourceB: [line("BILL-101", "Reece Plumbing", 1320.0), line("BILL-102", "Bunnings Trade", 418.6)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [line("BILL-101", "Reece Plumbing", 1320.0)],
        sourceB: [line("BILL-101", "Reece Plumbing", 990.0)],
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
    // 2. Same supplier name and same amount on both sides, different bill ids.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-201", "Tradelink", 2750.0), line("BILL-210", "Reece Plumbing", 640.0)],
        sourceB: [line("BILL-202", "Tradelink", 2750.0), line("BILL-210", "Reece Plumbing", 640.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalikes = new Set(["BILL-201", "BILL-202"]);
      const noDiffBetween = world.differences.every((d) => !lookalikes.has(d.key));
      const bothOrphaned =
        world.orphans.some((o) => o.key === "BILL-201" && o.source === "a") &&
        world.orphans.some((o) => o.key === "BILL-202" && o.source === "b");
      return world.runs.length === 1 && run.joinedOn === "bill_id" && run.matched === 1 && noDiffBetween && bothOrphaned;
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five shared bills: three agree, two disagree on the amount.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          line("BILL-301", "Reece Plumbing", 100.0),
          line("BILL-302", "Tradelink", 200.0),
          line("BILL-303", "Bunnings Trade", 300.0),
          line("BILL-304", "Middy's Electrical", 412.5),
          line("BILL-305", "Telstra", 89.0),
        ],
        sourceB: [
          line("BILL-301", "Reece Plumbing", 100.0),
          line("BILL-302", "Tradelink", 200.0),
          line("BILL-303", "Bunnings Trade", 300.0),
          line("BILL-304", "Middy's Electrical", 375.0),
          line("BILL-305", "Telstra", 98.0),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreeing = ["BILL-301", "BILL-302", "BILL-303"];
      const silent = world.differences.every((d) => !agreeing.includes(d.key));
      const d4 = world.differences.find((d) => d.key === "BILL-304");
      const d5 = world.differences.find((d) => d.key === "BILL-305");
      const shaped = (d, a, b) => !!d && d.field === "amount" && d.valueA === a && d.valueB === b && d.masterValue === a;
      const run = world.runs[0];
      return (
        world.differences.length === 2 &&
        silent &&
        shaped(d4, 412.5, 375.0) &&
        shaped(d5, 89.0, 98.0) &&
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
    // 4. One open difference. Run, a named person accepts an hour later, run
    // again, then run a third time to prove the write is not repeated.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-401", "Reece Plumbing", 1320.0)],
        sourceB: [line("BILL-401", "Reece Plumbing", 1230.0)],
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
        w.request?.value === 1320.0 &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut
      );
    },
    describe: (world) => `writes ${JSON.stringify(writes(world).map((c) => c.request))}; acceptances ${world.acceptances.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A bank line whose bill is not in Xero, and a paid bill with no bank line.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-501", "Reece Plumbing", 500.0), line("BILL-502", "Ampol fuel card", 211.4)],
        sourceB: [line("BILL-501", "Reece Plumbing", 500.0), line("BILL-503", "Officeworks", 64.95)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      return (
        world.orphans.length === 2 &&
        good(o("BILL-502", "a")) &&
        good(o("BILL-503", "b")) &&
        handed("BILL-502") &&
        handed("BILL-503") &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. A one-cent rounding tolerance on amount, none on paid_on. One amount
    // inside it, one amount outside it, and a date a day apart with no tolerance.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { amount: 0.01 } }),
        sourceA: [line("BILL-601", "Tradelink", 333.34), line("BILL-602", "Bunnings Trade", 150.0), line("BILL-603", "Telstra", 89.0, "2026-09-24")],
        sourceB: [line("BILL-601", "Tradelink", 333.33), line("BILL-602", "Bunnings Trade", 165.0), line("BILL-603", "Telstra", 89.0, "2026-09-23")],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = contract({ toleranceByField: { amount: 0.01 } }).toleranceByField;
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const everyWithinDeclared = world.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(tol, x.field));
      return (
        d("BILL-601", "amount")?.status === "within_tolerance" &&
        d("BILL-602", "amount")?.status === "open" &&
        d("BILL-603", "paid_on")?.status === "open" &&
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
    // 7. Everything agrees; two scheduled runs a day apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-701", "Reece Plumbing", 990.0), line("BILL-702", "Tradelink", 45.1)],
        sourceB: [line("BILL-701", "Reece Plumbing", 990.0), line("BILL-702", "Tradelink", 45.1)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(24 * HOUR);
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
    // 8. Threshold $500 and a rate of 0.25; one bill $900 apart in three pairs.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 500, mismatchRate: 0.25 } }),
        sourceA: [line("BILL-801", "Reece Plumbing", 2400.0), line("BILL-802", "Tradelink", 120.0), line("BILL-803", "Telstra", 89.0)],
        sourceB: [line("BILL-801", "Reece Plumbing", 1500.0), line("BILL-802", "Tradelink", 120.0), line("BILL-803", "Telstra", 89.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("BILL-801"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && world.runs.length === 1;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. One difference, accepted by a named person, written on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-901", "Middy's Electrical", 2210.0, "2026-09-22"), line("BILL-902", "Tradelink", 80.0)],
        sourceB: [line("BILL-901", "Middy's Electrical", 2201.0, "2026-09-22"), line("BILL-902", "Tradelink", 80.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const d = world.differences.find((x) => x.key === "BILL-901" && x.field === "amount");
      if (!d) return false;
      const c = world.correctionFor(d.id);
      const nowB = world.recordOf("b", "BILL-901")?.fields.amount;
      const changed = world.changedFields();
      const everyChangeBacked = changed.every((ch) =>
        world.differences.some((x) => {
          const cx = world.correctionFor(x.id);
          return x.key === ch.key && x.field === ch.field && !!cx && cx.target === ch.source && !!cx.acceptedBy && !!cx.writtenId;
        }),
      );
      return (
        nowB === 2210.0 &&
        d.valueA === 2210.0 &&
        d.valueB === 2201.0 &&
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
    // 10. One bill mismatched in one run, accepted, written in the next; then
    // read by its id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("BILL-1001", "Reece Plumbing", 760.0), line("BILL-1002", "Bunnings Trade", 52.0)],
        sourceB: [line("BILL-1001", "Reece Plumbing", 670.0), line("BILL-1002", "Bunnings Trade", 52.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory("BILL-1001");
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "amount");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === 760.0 &&
        d.valueB === 670.0 &&
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

// The pass test runs on the business's own bank feed and Xero file, by hand,
// with a person on the correction. A stub cannot pass it and is not asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

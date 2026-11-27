/**
 * One scenario per check of two-records-build-standard, for Super Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario:
 *   source a  Record A, the master: pay runs in the payroll whose due date has
 *             passed, each with the super guarantee owed and the payday as
 *             day 0.
 *   source b  Record B: the super payments that left the bank, as the ledger
 *             records them, each naming its pay run id, with the amount paid
 *             and the days after payday the money left.
 *   key       the pay run id (invented ids below, never real payroll data).
 *   fields    super_amount (dollars, master a, no tolerance) and
 *             days_after_payday (master a, tolerance = the due window).
 *
 * The due window of 7 days below is a scenario value standing in for the
 * setting the person confirms against current ATO guidance. It is not a
 * statement of the law.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OWNER = "Dana Whitfield (payroll officer)";
const ACCEPTOR = "Dana Whitfield";
const WINDOW = 7;

const contract = (over = {}) => ({
  id: "PC-super-match-payroll-vs-super-payments-2026-11-02",
  sourceA: "the payroll in the customer's ledger: pay runs whose due date has passed, with the super guarantee owed",
  sourceB: "the super payments that left the bank, as the ledger records them, each naming its pay run id",
  key: "pay_run_id",
  masterByField: { super_amount: "a", days_after_payday: "a" },
  toleranceByField: { days_after_payday: WINDOW },
  threshold: { amount: 1000, mismatchRate: 0.5 },
  schedule: "each weekday 07:00 Australia/Sydney",
  owner: OWNER,
  ...over,
});

// One pay run (source a: paid on payday, day 0) or one super payment (source b).
const run = (key, name, superAmount) => ({ key, name, fields: { super_amount: superAmount, days_after_payday: 0 } });
const pay = (key, name, superAmount, days) => ({ key, name, fields: { super_amount: superAmount, days_after_payday: days } });

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const writes = (world) => callsTo(world, "write_ledger");
const published = (world) => callsTo(world, "publish_report");
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasAllCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const allClear = (r) => r.matched > 0 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0;
const neverWritesPayroll = (world) => writes(world).every((c) => c.request?.source === "b") && world.changedFields().every((ch) => ch.source === "b");

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract beside two seeded pay runs; then the same build in a
    // world with no contract, which must not compare or publish anything.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6), run("pr-2611-m", "Monthly salaried, payday 11 Nov", 9870.0)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 4182.6, 0), pay("pr-2611-m", "Clearing house payment", 9870.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 3900.0, 0)],
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
    // 2. Two fortnightly pay runs for two entities with the same super owed on
    // the same payday. The payment names the other pay run id. Equal amount
    // and equal payday must not pair them.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2614-ops", "Fortnightly, Ops Pty Ltd, payday 14 Nov", 2310.45), run("pr-2614-w", "Weekly pay run, payday 14 Nov", 4011.2)],
        sourceB: [pay("pr-2614-svc", "Clearing house payment", 2310.45, 0), pay("pr-2614-w", "Clearing house payment", 4011.2, 0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const r = world.runs[0];
      const lookalikes = new Set(["pr-2614-ops", "pr-2614-svc"]);
      return (
        world.runs.length === 1 &&
        r.joinedOn === "pay_run_id" &&
        r.matched === 1 &&
        world.differences.every((d) => !lookalikes.has(d.key)) &&
        world.orphans.some((o) => o.key === "pr-2614-ops" && o.source === "a") &&
        world.orphans.some((o) => o.key === "pr-2614-svc" && o.source === "b")
      );
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Four pay runs: two paid in full on payday; one short by a new
    // starter's super left off the file; one paid in full but 12 days after
    // payday, outside the 7-day window.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          run("pr-2604-w", "Weekly pay run, payday 4 Nov", 3920.1),
          run("pr-2604-m", "Monthly salaried, payday 4 Nov", 9870.0),
          run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6),
          run("pr-2611-c", "Casual pay run, payday 11 Nov", 655.8),
        ],
        sourceB: [
          pay("pr-2604-w", "Clearing house payment", 3920.1, 0),
          pay("pr-2604-m", "Clearing house payment", 9870.0, 0),
          pay("pr-2611-w", "Clearing house payment", 3876.3, 0),
          pay("pr-2611-c", "Clearing house payment", 655.8, 12),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreed = ["pr-2604-w", "pr-2604-m"];
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const shaped = (x, a, b) => !!x && x.valueA === a && x.valueB === b && x.masterValue === a && x.status === "open";
      const r = world.runs[0];
      const short = d("pr-2611-w", "super_amount");
      const lateNotice = world.notices.some((n) => n.to === OWNER && /late/i.test(n.reason) && n.detail.includes("pr-2611-c") && n.detail.includes("655.80") && n.detail.includes("12 days"));
      return (
        world.differences.length === 2 &&
        world.differences.every((x) => !agreed.includes(x.key)) &&
        shaped(short, 4182.6, 3876.3) &&
        shaped(d("pr-2611-c", "days_after_payday"), 0, 12) &&
        !!world.correctionFor(short.id) &&
        !world.correctionFor(d("pr-2611-c", "days_after_payday").id) &&
        lateNotice &&
        writes(world).length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        r.matched === 2 &&
        r.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.valueA, x.valueB, x.masterValue, x.status]))}; corrections ${world.corrections.length}; notices ${JSON.stringify(world.notices.map((n) => n.reason))}; writes ${writes(world).length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The weekly pay run is short. Run; an hour later a named person, having
    // paid the top-up through the clearing house themselves, accepts; run
    // again; run a third time to prove the record is one write.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 3876.3, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      world.callsBeforeAccept = world.calls.length;
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.advance(DAY);
      await build(world.ports());
    },
    holds: (world) => {
      const cut = world.callsBeforeAccept ?? 0;
      const before = world.calls.slice(0, cut).filter((c) => c.port === "write_ledger");
      const after = world.calls.slice(cut).filter((c) => c.port === "write_ledger");
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose && c.request?.target === "b" && c.request?.proposedValue === 4182.6);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.source === "b" &&
        w.request?.key === "pr-2611-w" &&
        w.request?.field === "super_amount" &&
        w.request?.value === 4182.6 &&
        w.request?.correction?.acceptedBy === ACCEPTOR &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut &&
        world.recordOf("a", "pr-2611-w")?.fields.super_amount === 4182.6 &&
        neverWritesPayroll(world)
      );
    },
    describe: (world) => `writes ${JSON.stringify(writes(world).map((c) => c.request))}; acceptances ${world.acceptances.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. The casual pay run is past its due date with no payment under its id;
    // a clearing house payment names a pay run id the payroll does not have.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6), run("pr-2611-c", "Casual pay run, payday 11 Nov", 655.8)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 4182.6, 0), pay("pr-2611-x", "Clearing house payment, reference pr-2611-x", 312.4, 1)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      const unpaid = o("pr-2611-c", "a");
      return (
        world.orphans.length === 2 &&
        good(unpaid) &&
        unpaid.reason.includes("655.80") &&
        unpaid.reason.includes("$0.00") &&
        good(o("pr-2611-x", "b")) &&
        handed("pr-2611-c") &&
        handed("pr-2611-x") &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2 &&
        world.differences.length === 0
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. The person has written the due window (7 days) against
    // days_after_payday and left super_amount with none. One payment 4 days
    // after payday sits inside the window; one payment one cent short has no
    // tolerance and must stay open.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2618-w", "Weekly pay run, payday 18 Nov", 4090.0), run("pr-2618-c", "Casual pay run, payday 18 Nov", 702.15)],
        sourceB: [pay("pr-2618-w", "Clearing house payment", 4090.0, 4), pay("pr-2618-c", "Clearing house payment", 702.14, 0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = contract().toleranceByField;
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const r = world.runs[0];
      return (
        d("pr-2618-w", "days_after_payday")?.status === "within_tolerance" &&
        d("pr-2618-c", "super_amount")?.status === "open" &&
        world.differences.length === 2 &&
        world.differences.filter((x) => x.status === "within_tolerance").every((x) => Object.prototype.hasOwnProperty.call(tol, x.field)) &&
        world.runs.length === 1 &&
        r.withinTolerance === 1 &&
        r.mismatched === 1
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Every pay run paid in full on payday; two weekday runs a day apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2604-w", "Weekly pay run, payday 4 Nov", 3920.1), run("pr-2604-m", "Monthly salaried, payday 4 Nov", 9870.0)],
        sourceB: [pay("pr-2604-w", "Clearing house payment", 3920.1, 0), pay("pr-2604-m", "Clearing house payment", 9870.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(DAY);
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
    // 8. Threshold $1,000 and a rate of 0.3. The monthly salaried pay run's
    // payment left out a $1,480 bonus's super, one pay run in three.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 1000, mismatchRate: 0.3 } }),
        sourceA: [run("pr-2630-m", "Monthly salaried, payday 30 Oct", 11350.0), run("pr-2630-w", "Weekly pay run, payday 30 Oct", 4020.0), run("pr-2630-c", "Casual pay run, payday 30 Oct", 610.25)],
        sourceB: [pay("pr-2630-m", "Clearing house payment", 9870.0, 0), pay("pr-2630-w", "Clearing house payment", 4020.0, 0), pay("pr-2630-c", "Clearing house payment", 610.25, 0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("pr-2630-m") && String(c.request?.detail).includes("11350.00") && String(c.request?.detail).includes("9870.00"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return world.runs.length === 1 && pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The weekly pay run short; the person pays the top-up themselves and
    // accepts; the amount is recorded once against the payment next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6), run("pr-2611-m", "Monthly salaried, payday 11 Nov", 9870.0)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 3876.3, 0), pay("pr-2611-m", "Clearing house payment", 9870.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const d = world.differences.find((x) => x.key === "pr-2611-w" && x.field === "super_amount");
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
        world.recordOf("b", "pr-2611-w")?.fields.super_amount === 4182.6 &&
        d.valueA === 4182.6 &&
        d.valueB === 3876.3 &&
        !!c &&
        c.target === "b" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changed.length === 1 &&
        backed &&
        neverWritesPayroll(world)
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences)}; corrections ${JSON.stringify(world.corrections)}; changed ${JSON.stringify(world.changedFields())}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. The weekly pay run short in one run, accepted, recorded in the next;
    // then read back by its pay run id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [run("pr-2611-w", "Weekly pay run, payday 11 Nov", 4182.6), run("pr-2611-m", "Monthly salaried, payday 11 Nov", 9870.0)],
        sourceB: [pay("pr-2611-w", "Clearing house payment", 3876.3, 0), pay("pr-2611-m", "Clearing house payment", 9870.0, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(DAY);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory("pr-2611-w");
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "super_amount");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        !!d &&
        d.valueA === 4182.6 &&
        d.valueB === 3876.3 &&
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

// The pass test runs on the business's real payroll and ledger, by hand, with
// a person on the acceptance. A stub cannot pass it and is not asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

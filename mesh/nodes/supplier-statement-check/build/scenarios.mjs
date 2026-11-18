/**
 * One scenario per check of two-records-build-standard, for Statement Check.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario: source a is one supplier's monthly statement
 * (one line per invoice the supplier says it issued), source b is the ledger
 * (the bills entered for that supplier in the period). The shared key is the
 * supplier's invoice number qualified by the ledger's supplier contact id,
 * "<contact id>/<invoice number>". Two fields are compared: amount (the
 * invoice total; master is the statement, which reprints the supplier's tax
 * invoice) and owing (what is still unpaid; master is the ledger, which holds
 * the payments made). Amounts are dollars.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the objects raised through them), never the build's own memory, and
 * returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Dana Whitfield (accounts payable)";
const ACCEPTOR = "Dana Whitfield";
const S = "CT-REECE-0412"; // the ledger's contact id for the supplier

const contract = (over = {}) => ({
  id: "PC-supplier-statement-vs-ledger-bills-2026-10-01",
  sourceA: "the supplier's monthly statement (one line per invoice)",
  sourceB: "the ledger (bills entered for the supplier in the statement period)",
  key: "supplier_invoice_ref",
  masterByField: { amount: "a", owing: "b" },
  toleranceByField: {},
  threshold: { amount: 500, mismatchRate: 0.5 },
  schedule: "monthly, 3rd business day 08:00 Australia/Sydney, and on each statement received",
  owner: OWNER,
  ...over,
});

const inv = (number, amount, owing = amount, name = "Reece Plumbing") => ({ key: `${S}/${number}`, name, fields: { amount, owing } });

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
    // world with no contract, which must not compare or publish a guessed run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-48211", 1320.0), inv("INV-48240", 418.6, 0)],
        sourceB: [inv("INV-48211", 1320.0), inv("INV-48240", 418.6, 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [inv("INV-48211", 1320.0)],
        sourceB: [inv("INV-48211", 990.0)],
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
    // 2. Same supplier and same amount on both sides, different invoice numbers:
    // the statement's INV-48300 and a ledger bill INV-48301 for $2,750 each.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-48300", 2750.0), inv("INV-48310", 640.0)],
        sourceB: [inv("INV-48301", 2750.0), inv("INV-48310", 640.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalikes = new Set([`${S}/INV-48300`, `${S}/INV-48301`]);
      const noDiffBetween = world.differences.every((d) => !lookalikes.has(d.key));
      const bothOrphaned =
        world.orphans.some((o) => o.key === `${S}/INV-48300` && o.source === "a") &&
        world.orphans.some((o) => o.key === `${S}/INV-48301` && o.source === "b");
      return world.runs.length === 1 && run.joinedOn === "supplier_invoice_ref" && run.matched === 1 && noDiffBetween && bothOrphaned;
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five invoices on both: three agree, two disagree on the amount.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-1", 100.0), inv("INV-2", 200.0), inv("INV-3", 300.0), inv("INV-4", 412.5), inv("INV-5", 89.0)],
        sourceB: [inv("INV-1", 100.0), inv("INV-2", 200.0), inv("INV-3", 300.0), inv("INV-4", 375.0, 412.5), inv("INV-5", 98.0, 89.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreeing = ["INV-1", "INV-2", "INV-3"].map((n) => `${S}/${n}`);
      const silent = world.differences.every((d) => !agreeing.includes(d.key));
      const d4 = world.differences.find((d) => d.key === `${S}/INV-4`);
      const d5 = world.differences.find((d) => d.key === `${S}/INV-5`);
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
    // 4. The bill was keyed at $1,230 against a $1,320 invoice. Run, a named
    // person accepts an hour later, run again, then a third time to prove the
    // write is not repeated.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-48401", 1320.0, 1320.0)],
        sourceB: [inv("INV-48401", 1230.0, 1320.0)],
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
    // 5. An invoice on the statement with no bill in the ledger (the missing
    // bill), and a bill in the ledger the statement does not list.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-48501", 500.0), inv("INV-48502", 211.4)],
        sourceB: [inv("INV-48501", 500.0), inv("INV-48503", 64.95)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      return (
        world.orphans.length === 2 &&
        good(o(`${S}/INV-48502`, "a")) &&
        good(o(`${S}/INV-48503`, "b")) &&
        handed(`${S}/INV-48502`) &&
        handed(`${S}/INV-48503`) &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. A one-cent rounding tolerance on amount, none on owing. One amount
    // inside it, one outside it, and an owing figure five cents apart with no
    // tolerance declared.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { amount: 0.01 } }),
        sourceA: [inv("INV-601", 333.34, 333.34), inv("INV-602", 150.0), inv("INV-603", 89.0, 89.0)],
        sourceB: [inv("INV-601", 333.33, 333.34), inv("INV-602", 165.0, 150.0), inv("INV-603", 89.0, 88.95)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = contract({ toleranceByField: { amount: 0.01 } }).toleranceByField;
      const d = (n, field) => world.differences.find((x) => x.key === `${S}/${n}` && x.field === field);
      const everyWithinDeclared = world.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(tol, x.field));
      return (
        d("INV-601", "amount")?.status === "within_tolerance" &&
        d("INV-602", "amount")?.status === "open" &&
        d("INV-603", "owing")?.status === "open" &&
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
    // 7. The statement and the ledger agree; two scheduled runs a month apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-701", 990.0, 0), inv("INV-702", 45.1)],
        sourceB: [inv("INV-701", 990.0, 0), inv("INV-702", 45.1)],
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
    // 8. Threshold $500 and a rate of 0.25; one invoice $900 apart in three pairs.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 500, mismatchRate: 0.25 } }),
        sourceA: [inv("INV-801", 2400.0, 2400.0), inv("INV-802", 120.0), inv("INV-803", 89.0)],
        sourceB: [inv("INV-801", 1500.0, 2400.0), inv("INV-802", 120.0), inv("INV-803", 89.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes(`${S}/INV-801`));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && world.runs.length === 1;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The bill was keyed $2,201 against a $2,210 invoice; accepted by a
    // named person and written on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-901", 2210.0, 2210.0), inv("INV-902", 80.0)],
        sourceB: [inv("INV-901", 2201.0, 2210.0), inv("INV-902", 80.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const key = `${S}/INV-901`;
      const d = world.differences.find((x) => x.key === key && x.field === "amount");
      if (!d) return false;
      const c = world.correctionFor(d.id);
      const nowB = world.recordOf("b", key)?.fields.amount;
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
    // 10. The statement says $760 is still owed; the ledger shows it paid down
    // to $670. Master for owing is the ledger, so the accepted correction goes
    // to the supplier as a query, recorded against the statement line. Then the
    // invoice is read by its key.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [inv("INV-1001", 760.0, 760.0), inv("INV-1002", 52.0)],
        sourceB: [inv("INV-1001", 760.0, 670.0), inv("INV-1002", 52.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory(`${S}/INV-1001`);
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "owing");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === 760.0 &&
        d.valueB === 670.0 &&
        d.masterValue === 670.0 &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.target === "a" &&
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

// The pass test runs on the business's own supplier statements and ledger, by
// hand, with a person on the correction. A stub cannot pass it and is not
// asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

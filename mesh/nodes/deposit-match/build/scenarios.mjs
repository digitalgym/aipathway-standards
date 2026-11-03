/**
 * One scenario per check of two-records-build-standard, for Deposit Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario: source a is the bank feed (customer deposits,
 * each carrying the Xero invoice_id in its reference), source b is Xero (the
 * sales invoices those deposits name, with the payment applied). The shared key
 * is the invoice_id. Amounts are AUD, dates YYYY-MM-DD.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Mel Tran (bookkeeper)";
const ACCEPTOR = "Mel Tran";

const contract = (over = {}) => ({
  id: "PC-deposits-vs-xero-sales-invoices-2026-10-01",
  sourceA: "bank feed (customer deposits into the business transaction account)",
  sourceB: "Xero (sales invoices named by a deposit, or shown paid in the period)",
  key: "invoice_id",
  masterByField: { amount: "a", received_on: "a" },
  toleranceByField: {},
  threshold: { amount: 1000, mismatchRate: 0.5 },
  schedule: "weekdays 07:30 Australia/Sydney",
  owner: OWNER,
  ...over,
});

const rec = (key, name, amount, received_on = "2026-09-25") => ({ key, name, fields: { amount, received_on } });

const calls = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const counted = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const isAllClear = (r) => r.matched > 0 && COUNTS.slice(1).every((k) => r[k] === 0);

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. A written contract beside two seeded sources; then a second world with
    // no contract and a real mismatch, which must not be compared at all.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0411", "Coastline Strata", 2420.0), rec("INV-0412", "Noosa Family Dental", 880.0)],
        sourceB: [rec("INV-0411", "Coastline Strata", 2420.0), rec("INV-0412", "Noosa Family Dental", 880.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.unwritten = new TwoRecordsWorld({
        contract: null,
        sourceA: [rec("INV-0413", "Peregian Physio", 1100.0)],
        sourceB: [rec("INV-0413", "Peregian Physio", 0)],
      });
      await build(world.unwritten.ports());
    },
    holds: (world) => {
      const c = contract();
      const contractAt = world.firstCall("read_ledger", (x) => x.request?.contract === true);
      const aAt = world.firstCall("read_job");
      const bAt = world.firstCall("read_ledger", (x) => x.request?.source === "b");
      const run = world.runs[0];
      const declared =
        world.runs.length === 1 &&
        run.contractId === c.id &&
        JSON.stringify(run.masterByField) === JSON.stringify(c.masterByField);
      const u = world.unwritten;
      const refused =
        !!u &&
        u.runs.length === 0 &&
        u.differences.length === 0 &&
        u.corrections.length === 0 &&
        !u.calls.some((x) => x.port === "read_job" || x.request?.source === "b") &&
        u.escalations.some((e) => /contract/i.test(e.reason));
      return contractAt === 0 && aAt > contractAt && bAt > contractAt && declared && refused;
    },
    describe: (world) =>
      `runs ${JSON.stringify(world.runs.map((r) => [r.contractId, r.masterByField]))}; no-contract world runs ${world.unwritten?.runs.length ?? "?"}, escalations ${JSON.stringify(world.unwritten?.escalations ?? [])}`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. The paste-in trap: a deposit and an invoice with the same customer and
    // the same amount but different invoice ids. Plus one honest pair.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0420", "Sunshine Coast Electrical", 1650.0), rec("INV-0425", "Tewantin Bakery", 330.0)],
        sourceB: [rec("INV-0421", "Sunshine Coast Electrical", 1650.0), rec("INV-0425", "Tewantin Bakery", 330.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalike = new Set(["INV-0420", "INV-0421"]);
      return (
        world.runs.length === 1 &&
        run.joinedOn === "invoice_id" &&
        run.matched === 1 &&
        run.orphaned === 2 &&
        world.differences.every((d) => !lookalike.has(d.key)) &&
        world.corrections.length === 0 &&
        world.orphans.some((o) => o.key === "INV-0420" && o.source === "a") &&
        world.orphans.some((o) => o.key === "INV-0421" && o.source === "b")
      );
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${JSON.stringify(world.differences.map((d) => d.key))}; orphans ${JSON.stringify(world.orphans.map((o) => [o.key, o.source]))}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five invoices: three agree, two deposits differ from the payment Xero
    // shows (one short-paid, one still showing nothing applied).
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          rec("INV-0431", "Coastline Strata", 495.0),
          rec("INV-0432", "Noosa Family Dental", 1210.0),
          rec("INV-0433", "Peregian Physio", 275.0),
          rec("INV-0434", "Cooroy Hardware", 640.5),
          rec("INV-0435", "Tewantin Bakery", 990.0),
        ],
        sourceB: [
          rec("INV-0431", "Coastline Strata", 495.0),
          rec("INV-0432", "Noosa Family Dental", 1210.0),
          rec("INV-0433", "Peregian Physio", 275.0),
          rec("INV-0434", "Cooroy Hardware", 704.55),
          rec("INV-0435", "Tewantin Bakery", 0),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreeing = new Set(["INV-0431", "INV-0432", "INV-0433"]);
      const find = (k) => world.differences.filter((d) => d.key === k);
      const shaped = (list, a, b) =>
        list.length === 1 && list[0].field === "amount" && list[0].valueA === a && list[0].valueB === b && list[0].masterValue === a && list[0].status === "open";
      const run = world.runs[0];
      return (
        world.differences.length === 2 &&
        world.differences.every((d) => !agreeing.has(d.key)) &&
        shaped(find("INV-0434"), 640.5, 704.55) &&
        shaped(find("INV-0435"), 990.0, 0) &&
        calls(world, "write_ledger").length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((d) => [d.key, d.field, d.valueA, d.valueB, d.masterValue, d.status]))}; writes ${calls(world, "write_ledger").length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. A deposit Xero has not applied. Run; the bookkeeper accepts an hour
    // later; run again; run a third time, which must not write twice.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0441", "Coastline Strata", 3300.0)],
        sourceB: [rec("INV-0441", "Coastline Strata", 0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.cut = world.calls.length;
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.advance(HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const cut = world.cut ?? 0;
      const before = world.calls.slice(0, cut).filter((c) => c.port === "write_ledger");
      const after = world.calls.slice(cut).filter((c) => c.port === "write_ledger");
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose && c.request?.target === "b" && c.request?.proposedValue === 3300.0);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.source === "b" &&
        w.request?.key === "INV-0441" &&
        w.request?.value === 3300.0 &&
        w.request?.correction?.acceptedBy === ACCEPTOR &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut &&
        world.differences.length === 1
      );
    },
    describe: (world) => `writes ${JSON.stringify(calls(world, "write_ledger").map((c) => c.request))}; acceptances ${world.acceptances.length}; differences ${world.differences.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A deposit naming an invoice Xero does not hold, and an invoice Xero
    // shows paid with no deposit behind it.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0451", "Noosa Family Dental", 770.0), rec("INV-0459", "Cooroy Hardware", 412.0)],
        sourceB: [rec("INV-0451", "Noosa Family Dental", 770.0), rec("INV-0452", "Peregian Physio", 412.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ok = (key, source) => {
        const o = world.orphans.filter((x) => x.key === key && x.source === source);
        const handed = calls(world, "escalate", (c) => c.request?.orphan === key && c.request?.source === source && c.request?.owner === OWNER);
        return o.length === 1 && typeof o[0].reason === "string" && o[0].reason.trim().length > 0 && o[0].owner === OWNER && handed.length === 1;
      };
      return (
        world.orphans.length === 2 &&
        ok("INV-0459", "a") &&
        ok("INV-0452", "b") &&
        world.differences.length === 0 &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. Two days declared on received_on (clearing time); nothing on amount.
    // One date inside it, one date outside it, and a two-cent amount gap that
    // must be open because amount carries no tolerance.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { received_on: 2 } }),
        sourceA: [
          rec("INV-0461", "Coastline Strata", 550.0, "2026-09-25"),
          rec("INV-0462", "Tewantin Bakery", 220.0, "2026-09-25"),
          rec("INV-0463", "Peregian Physio", 165.02, "2026-09-25"),
        ],
        sourceB: [
          rec("INV-0461", "Coastline Strata", 550.0, "2026-09-24"),
          rec("INV-0462", "Tewantin Bakery", 220.0, "2026-09-18"),
          rec("INV-0463", "Peregian Physio", 165.0, "2026-09-25"),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = { received_on: 2 };
      const d = (k, f) => world.differences.filter((x) => x.key === k && x.field === f);
      const one = (k, f, status) => d(k, f).length === 1 && d(k, f)[0].status === status;
      return (
        world.differences.length === 3 &&
        one("INV-0461", "received_on", "within_tolerance") &&
        one("INV-0462", "received_on", "open") &&
        one("INV-0463", "amount", "open") &&
        world.differences.filter((x) => x.status === "within_tolerance").every((x) => Object.prototype.hasOwnProperty.call(tol, x.field)) &&
        world.runs.length === 1 &&
        world.runs[0].withinTolerance === 1 &&
        world.runs[0].mismatched === 2
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}; run ${JSON.stringify(world.runs[0] ?? null)}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Everything agrees; two scheduled runs a day apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0471", "Cooroy Hardware", 1980.0), rec("INV-0472", "Noosa Family Dental", 66.0)],
        sourceB: [rec("INV-0471", "Cooroy Hardware", 1980.0), rec("INV-0472", "Noosa Family Dental", 66.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(24 * HOUR);
      await build(world.ports());
    },
    holds: (world) =>
      world.runs.length === 2 &&
      calls(world, "publish_report").length === 2 &&
      world.runs.every((r) => counted(r) && typeof r.publishedAt === "string" && r.publishedAt.length > 0 && isAllClear(r) && r.matched === 2) &&
      world.runs[0].publishedAt !== world.runs[1].publishedAt,
    describe: (world) => `runs ${JSON.stringify(world.runs.map((r) => [r.publishedAt, ...COUNTS.map((k) => r[k])]))}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Threshold $1,000 and a rate of 0.3. One deposit of $4,400 Xero shows
    // as $2,200 applied, among three pairs: over the amount and over the rate.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 1000, mismatchRate: 0.3 } }),
        sourceA: [rec("INV-0481", "Coastline Strata", 4400.0), rec("INV-0482", "Tewantin Bakery", 110.0), rec("INV-0483", "Peregian Physio", 330.0)],
        sourceB: [rec("INV-0481", "Coastline Strata", 2200.0), rec("INV-0482", "Tewantin Bakery", 110.0), rec("INV-0483", "Peregian Physio", 330.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("INV-0481"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return world.runs.length === 1 && pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; runs ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. A deposit Xero recorded short by a transposition, accepted by the
    // bookkeeper and written on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0491", "Cooroy Hardware", 1386.0), rec("INV-0492", "Noosa Family Dental", 99.0)],
        sourceB: [rec("INV-0491", "Cooroy Hardware", 1368.0), rec("INV-0492", "Noosa Family Dental", 99.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const ds = world.differences.filter((x) => x.key === "INV-0491" && x.field === "amount");
      if (ds.length !== 1) return false;
      const d = ds[0];
      const c = world.correctionFor(d.id);
      const changed = world.changedFields();
      const backed = changed.every((ch) =>
        world.differences.some((x) => {
          const cx = world.correctionFor(x.id);
          return x.key === ch.key && x.field === ch.field && !!cx && cx.target === ch.source && !!cx.acceptedBy && !!cx.writtenId;
        }),
      );
      return (
        world.recordOf("b", "INV-0491")?.fields.amount === 1386.0 &&
        world.recordOf("a", "INV-0491")?.fields.amount === 1386.0 &&
        d.valueA === 1386.0 &&
        d.valueB === 1368.0 &&
        d.masterValue === 1386.0 &&
        !!c &&
        c.target === "b" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changed.length === 1 &&
        backed
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences)}; corrections ${JSON.stringify(world.corrections)}; changed ${JSON.stringify(world.changedFields())}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. One invoice mismatched in one run, accepted, written in the next;
    // then read back by its invoice_id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [rec("INV-0501", "Peregian Physio", 605.0), rec("INV-0502", "Tewantin Bakery", 44.0)],
        sourceB: [rec("INV-0501", "Peregian Physio", 0), rec("INV-0502", "Tewantin Bakery", 44.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.byKey = world.ports().readHistory("INV-0501");
    },
    holds: (world) => {
      const h = world.byKey;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "amount");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        !!d &&
        d.valueA === 605.0 &&
        d.valueB === 0 &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string"
      );
    },
    describe: (world) => `history ${JSON.stringify(world.byKey ?? null)}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a runtime property. The runner reports evidence_required and
    // never scores this green; holds stays a strict false.
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on the business's own bank feed and Xero file, by hand,
// with the bookkeeper on the correction. A stub cannot pass it.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

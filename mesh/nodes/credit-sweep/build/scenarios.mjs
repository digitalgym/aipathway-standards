/**
 * One scenario per check of two-records-build-standard, for Credit Sweep.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario, both read from the customer's own ledger:
 * source a is the chase list (per customer contact, the amount due on open
 * sales invoices, and those invoices); source b is the customer's account once
 * money already held is counted (open invoices less unapplied credit notes,
 * overpayments, prepayments and receipts against no invoice, and those
 * credits). The shared key is the ledger's customer contact id. Amounts are
 * AUD, dates YYYY-MM-DD; the world's clock starts on 2026-09-26.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Priya Nair (accounts receivable)";
const ACCEPTOR = "Priya Nair";

const contract = (over = {}) => ({
  id: "PC-chase-list-vs-customer-account-2026-09-01",
  sourceA: "the chase list: open sales invoices per customer contact in the ledger",
  sourceB: "the customer's account: open invoices less unapplied credit notes, overpayments, prepayments and receipts against no invoice",
  key: "contact_id",
  masterByField: { amount_due: "b" },
  toleranceByField: {},
  threshold: { amount: 1000, mismatchRate: 0.5 },
  schedule: "Mondays 07:00 Australia/Sydney",
  owner: OWNER,
  ...over,
});

/** The chase list for one customer. */
const due = (key, name, amount_due, open_invoices = "") => ({ key, name, fields: { amount_due, open_invoices } });
/** The account for one customer, once money held is counted. */
const acct = (key, name, amount_due, credits = "") => ({ key, name, fields: { amount_due, credits } });

const calls = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const counted = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const isAllClear = (r) => r.matched > 0 && COUNTS.slice(1).every((k) => r[k] === 0);

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. A written contract beside two seeded sources; then a second world with
    // no contract and a customer holding an overpayment, which must not be
    // compared at all.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-101", "Coastline Strata", 2420.0, "INV-0611=2420.00"), due("C-102", "Noosa Family Dental", 880.0, "INV-0612=880.00")],
        sourceB: [acct("C-101", "Coastline Strata", 2420.0), acct("C-102", "Noosa Family Dental", 880.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.unwritten = new TwoRecordsWorld({
        contract: null,
        sourceA: [due("C-103", "Peregian Physio", 1100.0, "INV-0613=1100.00")],
        sourceB: [acct("C-103", "Peregian Physio", 0, "OP-0007=1100.00@2026-03-14")],
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
    // 2. The lookalike trap: two contacts both called "Sunshine Coast
    // Electrical". One owes $1,650 on an open invoice, the other holds a
    // $1,650 credit note and owes nothing. Same name, same amount, different
    // contact ids: never one customer. Plus one honest pair.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-120", "Sunshine Coast Electrical", 1650.0, "INV-0620=1650.00"), due("C-125", "Tewantin Bakery", 330.0, "INV-0625=330.00")],
        sourceB: [acct("C-121", "Sunshine Coast Electrical", 0, "CN-0040=1650.00@2026-08-01"), acct("C-125", "Tewantin Bakery", 330.0)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalike = new Set(["C-120", "C-121"]);
      return (
        world.runs.length === 1 &&
        run.joinedOn === "contact_id" &&
        run.matched === 1 &&
        run.orphaned === 2 &&
        world.differences.every((d) => !lookalike.has(d.key)) &&
        world.corrections.length === 0 &&
        world.orphans.some((o) => o.key === "C-120" && o.source === "a") &&
        world.orphans.some((o) => o.key === "C-121" && o.source === "b")
      );
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${JSON.stringify(world.differences.map((d) => d.key))}; orphans ${JSON.stringify(world.orphans.map((o) => [o.key, o.source]))}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five customers: three hold nothing; one overpaid in March and is
    // still on the chase list for the next invoice; one has a part credit
    // note whose reference names the invoice.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          due("C-131", "Coastline Strata", 495.0, "INV-0631=495.00"),
          due("C-132", "Noosa Family Dental", 1210.0, "INV-0632=1210.00"),
          due("C-133", "Peregian Physio", 275.0, "INV-0633=275.00"),
          due("C-134", "Cooroy Hardware", 704.55, "INV-0634=704.55"),
          due("C-135", "Tewantin Bakery", 990.0, "INV-0635=990.00;INV-0636=440.00"),
        ],
        sourceB: [
          acct("C-131", "Coastline Strata", 495.0),
          acct("C-132", "Noosa Family Dental", 1210.0),
          acct("C-133", "Peregian Physio", 275.0),
          acct("C-134", "Cooroy Hardware", 0, "OP-0011=704.55@2026-03-12"),
          acct("C-135", "Tewantin Bakery", 550.0, "CN-0051=440.00@2026-09-01>INV-0636"),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const agreeing = new Set(["C-131", "C-132", "C-133"]);
      const find = (k) => world.differences.filter((d) => d.key === k);
      const shaped = (list, a, b) =>
        list.length === 1 && list[0].field === "amount_due" && list[0].valueA === a && list[0].valueB === b && list[0].masterValue === b && list[0].status === "open";
      const drafted = (key, ...parts) =>
        calls(world, "notify", (c) => c.request?.to === OWNER && parts.every((p) => String(c.request?.detail).includes(p)) && String(c.request?.detail).includes(key)).length === 1;
      const run = world.runs[0];
      return (
        world.differences.length === 2 &&
        world.differences.every((d) => !agreeing.has(d.key)) &&
        shaped(find("C-134"), 704.55, 0) &&
        shaped(find("C-135"), 990.0, 550.0) &&
        // The drafted allocation names the credit, how old it is, and the invoice it most likely belongs to.
        drafted("C-134", "OP-0011", "198 days", "INV-0634", "same amount") &&
        drafted("C-135", "CN-0051", "25 days", "INV-0636", "reference") &&
        calls(world, "write_ledger").length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((d) => [d.key, d.field, d.valueA, d.valueB, d.masterValue, d.status]))}; notices ${JSON.stringify(world.notices.map((n) => n.detail))}; writes ${calls(world, "write_ledger").length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. A prepayment never applied to the invoice it was for. Run; the
    // person releases the allocation an hour later; run again; run a third
    // time, which must not allocate twice.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-141", "Coastline Strata", 3300.0, "INV-0641=3300.00")],
        sourceB: [acct("C-141", "Coastline Strata", 0, "PP-0003=3300.00@2026-07-20>INV-0641")],
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
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose && c.request?.target === "a" && c.request?.proposedValue === 0);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.source === "a" &&
        w.request?.key === "C-141" &&
        w.request?.value === 0 &&
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
    // 5. A customer holding a $412 overpayment with no open invoice at all (a
    // refund note for a person, never a refund), and a customer on the chase
    // list the ledger returns no account for.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-151", "Noosa Family Dental", 770.0, "INV-0651=770.00"), due("C-159", "Cooroy Hardware", 412.0, "INV-0659=412.00")],
        sourceB: [acct("C-151", "Noosa Family Dental", 770.0), acct("C-152", "Peregian Physio", 0, "OP-0014=412.00@2026-04-30")],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ok = (key, source) => {
        const o = world.orphans.filter((x) => x.key === key && x.source === source);
        const handed = calls(world, "escalate", (c) => c.request?.orphan === key && c.request?.source === source && c.request?.owner === OWNER);
        return o.length === 1 && typeof o[0].reason === "string" && o[0].reason.trim().length > 0 && o[0].owner === OWNER && handed.length === 1;
      };
      const refundNote = world.orphans.find((x) => x.key === "C-152");
      return (
        world.orphans.length === 2 &&
        ok("C-159", "a") &&
        ok("C-152", "b") &&
        !!refundNote &&
        /refund/i.test(refundNote.reason) &&
        refundNote.reason.includes("OP-0014") &&
        world.differences.length === 0 &&
        calls(world, "write_ledger").length === 0 &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. Five cents declared on amount_due (a customer rounding a payment up).
    // A two-cent overpayment sits inside it, a $110 credit sits outside it.
    // Then a second contract with nothing declared: the same two cents is open.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { amount_due: 0.05 } }),
        sourceA: [due("C-161", "Coastline Strata", 550.0, "INV-0661=550.00"), due("C-162", "Tewantin Bakery", 220.0, "INV-0662=220.00")],
        sourceB: [
          acct("C-161", "Coastline Strata", 549.98, "OP-0020=0.02@2026-09-20"),
          acct("C-162", "Tewantin Bakery", 110.0, "CN-0062=110.00@2026-09-10"),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.undeclared = new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-163", "Peregian Physio", 165.02, "INV-0663=165.02")],
        sourceB: [acct("C-163", "Peregian Physio", 165.0, "OP-0021=0.02@2026-09-20")],
      });
      await build(world.undeclared.ports());
    },
    holds: (world) => {
      const tol = { amount_due: 0.05 };
      const d = (k) => world.differences.filter((x) => x.key === k && x.field === "amount_due");
      const one = (k, status) => d(k).length === 1 && d(k)[0].status === status;
      const u = world.undeclared;
      return (
        world.differences.length === 2 &&
        one("C-161", "within_tolerance") &&
        one("C-162", "open") &&
        world.differences.filter((x) => x.status === "within_tolerance").every((x) => Object.prototype.hasOwnProperty.call(tol, x.field)) &&
        world.runs.length === 1 &&
        world.runs[0].withinTolerance === 1 &&
        world.runs[0].mismatched === 1 &&
        !!u &&
        u.differences.length === 1 &&
        u.differences[0].key === "C-163" &&
        u.differences[0].status === "open" &&
        u.runs.length === 1 &&
        u.runs[0].withinTolerance === 0 &&
        u.runs[0].mismatched === 1
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}; run ${JSON.stringify(world.runs[0] ?? null)}; undeclared ${JSON.stringify(world.undeclared?.differences.map((x) => [x.key, x.status]) ?? null)}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. No customer holds any money; two Monday runs a week apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-171", "Cooroy Hardware", 1980.0, "INV-0671=1980.00"), due("C-172", "Noosa Family Dental", 66.0, "INV-0672=66.00")],
        sourceB: [acct("C-171", "Cooroy Hardware", 1980.0), acct("C-172", "Noosa Family Dental", 66.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(7 * 24 * HOUR);
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
    // 8. Threshold $1,000 and a rate of 0.3. One customer holds a $2,200
    // overpayment against $4,400 still on the chase list, among three
    // customers: over the amount and over the rate.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 1000, mismatchRate: 0.3 } }),
        sourceA: [
          due("C-181", "Coastline Strata", 4400.0, "INV-0681=2200.00;INV-0682=2200.00"),
          due("C-182", "Tewantin Bakery", 110.0, "INV-0683=110.00"),
          due("C-183", "Peregian Physio", 330.0, "INV-0684=330.00"),
        ],
        sourceB: [
          acct("C-181", "Coastline Strata", 2200.0, "OP-0030=2200.00@2026-03-02"),
          acct("C-182", "Tewantin Bakery", 110.0),
          acct("C-183", "Peregian Physio", 330.0),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall(
        "notify",
        (c) => c.request?.to === OWNER && /threshold/i.test(String(c.request?.reason)) && String(c.request?.detail).includes("C-181"),
      );
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return world.runs.length === 1 && pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; runs ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. A credit note raised for a damaged delivery and never applied,
    // released by the person and allocated on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-191", "Cooroy Hardware", 1386.0, "INV-0691=1386.00"), due("C-192", "Noosa Family Dental", 99.0, "INV-0692=99.00")],
        sourceB: [acct("C-191", "Cooroy Hardware", 1018.0, "CN-0091=368.00@2026-08-14>INV-0691"), acct("C-192", "Noosa Family Dental", 99.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const ds = world.differences.filter((x) => x.key === "C-191" && x.field === "amount_due");
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
        world.recordOf("a", "C-191")?.fields.amount_due === 1018.0 &&
        world.recordOf("b", "C-191")?.fields.amount_due === 1018.0 &&
        d.valueA === 1386.0 &&
        d.valueB === 1018.0 &&
        d.masterValue === 1018.0 &&
        !!c &&
        c.target === "a" &&
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
    // 10. One customer's unapplied receipt raised in one run, released and
    // allocated in the next; then read back by the contact id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [due("C-201", "Peregian Physio", 605.0, "INV-0701=605.00"), due("C-202", "Tewantin Bakery", 44.0, "INV-0702=44.00")],
        sourceB: [acct("C-201", "Peregian Physio", 0, "RC-0201=605.00@2026-09-02"), acct("C-202", "Tewantin Bakery", 44.0)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.byKey = world.ports().readHistory("C-201");
    },
    holds: (world) => {
      const h = world.byKey;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "amount_due");
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

// The pass test runs on the business's own ledger, by hand, with a person
// releasing the allocation. A stub cannot pass it.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

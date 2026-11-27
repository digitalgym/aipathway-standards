/**
 * One scenario per check of duplicate-bill-hold-build-standard, for Double Pay Check.
 *
 * Scaffolded by `npx @aipathway/conformance init duplicate-bill-hold-build-standard`
 * from https://aipathway.com.au/explore-ai/duplicate-bill-hold-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The ledger in every scenario is one Thursday's pay run for a made-up
 * Brisbane business: eleven bills approved and awaiting payment at the cutoff,
 * the bills paid in the lookback window, a draft, a bill awaiting approval, a
 * bill entered after the cutoff and a voided one. Supplier ids, bill ids and
 * bank accounts are invented, never real ledger data. Money is whole cents.
 *
 * Seeded duplicates, one per rule:
 *   same_invoice_number     skip bin inv 42 waiting; INV-0042 paid on the 12th
 *   same_amount_in_window   electrician $1,980.00 twice a week apart, one with no number;
 *                           cleaner $450.00 a week after last week's
 *   supplier_entered_twice  SI 7781 $3,302.50 on a second record for Bayside Plumbing
 *   bank_changed            timber supplier's account is not the one paid last month
 *   bank_shared             Brisbane Steel Co has Northside Paint's account
 * Near misses that must raise nothing: the gas supplier's two bills at different
 * totals, the office supplier's $1,980.00 (another supplier), a number shared by
 * two suppliers at different totals, and rent 31 days after last month's.
 *
 * Every `holds` reads what the world recorded through its ports, compares it
 * with the world's own truth() snapshot for that run, and returns a strict true
 * or false.
 */

import { DuplicateBillHoldWorld } from "@aipathway/conformance";

const RULES = ["same_invoice_number", "same_amount_in_window", "supplier_entered_twice", "bank_changed", "bank_shared"];

const suppliers = () => [
  { supplierId: "S-SKIP", name: "Metro Skip Bins", bankAccount: "064-000 1000 0001" },
  { supplierId: "S-ELEC", name: "Brightline Electrical", bankAccount: "484-799 2000 0002" },
  { supplierId: "S-CLEAN", name: "Spotless Office Cleaning", bankAccount: "034-002 3000 0003" },
  { supplierId: "S-BAYS", name: "Bayside Plumbing Supplies", bankAccount: "082-001 4000 0004" },
  { supplierId: "S-BAYS2", name: "Bayside Plumbing", bankAccount: null },
  { supplierId: "S-GAS", name: "Coastal Gas", bankAccount: "014-002 5000 0005" },
  { supplierId: "S-OFFICE", name: "Deskworks Office Supplies", bankAccount: "062-000 6000 0006" },
  { supplierId: "S-TIMBER", name: "Ironbark Timber", bankAccount: "084-100 9999 8888" },
  { supplierId: "S-PAINT", name: "Northside Paint", bankAccount: "033-044 5555 6666" },
  { supplierId: "S-STEEL", name: "Brisbane Steel Co", bankAccount: "033044 55556666" },
  { supplierId: "S-RENT", name: "Fortitude Property Trust", bankAccount: "122-000 7000 0007" },
];

const IN = "2026-11-24T01:00:00.000Z"; // entered before the cutoff
const bill = (billId, supplierId, supplierName, invoiceNumber, date, total, status = "awaiting_payment", extra = {}) => ({
  billId,
  supplierId,
  supplierName,
  invoiceNumber,
  date,
  total,
  status,
  enteredAt: IN,
  ...extra,
});
const paid = (billId, supplierId, supplierName, invoiceNumber, date, total, paidDate, paidToAccount, enteredAt) =>
  bill(billId, supplierId, supplierName, invoiceNumber, date, total, "paid", { paidDate, paidToAccount, enteredAt: enteredAt ?? `${date}T01:00:00.000Z` });

const bills = () => [
  // Paid in the lookback window.
  paid("B-SKIP-1", "S-SKIP", "Metro Skip Bins", "INV-0042", "2026-11-02", 42000, "2026-11-12", "064-000 1000 0001"),
  paid("B-CLEAN-1", "S-CLEAN", "Spotless Office Cleaning", "C-101", "2026-11-13", 45000, "2026-11-20", "034-002 3000 0003"),
  paid("B-BAYS-1", "S-BAYS", "Bayside Plumbing Supplies", "SI-7781", "2026-11-10", 330250, "2026-11-19", "082-001 4000 0004"),
  paid("B-TIMBER-1", "S-TIMBER", "Ironbark Timber", "T-55", "2026-10-20", 210000, "2026-10-28", "063-000 1111 2222"),
  paid("B-PAINT-1", "S-PAINT", "Northside Paint", "P-9", "2026-10-30", 78000, "2026-11-05", "033-044 5555 6666"),
  paid("B-RENT-1", "S-RENT", "Fortitude Property Trust", "R-10", "2026-10-20", 380000, "2026-10-25", "122-000 7000 0007"),
  // Approved and awaiting payment at the cutoff: the eleven in scope.
  bill("B-SKIP-2", "S-SKIP", "Metro Skip Bins", "inv 42", "2026-11-18", 42000),
  bill("B-ELEC-1", "S-ELEC", "Brightline Electrical", "E-311", "2026-11-10", 198000),
  bill("B-ELEC-2", "S-ELEC", "Brightline Electrical", null, "2026-11-17", 198000),
  bill("B-CLEAN-2", "S-CLEAN", "Spotless Office Cleaning", "C-102", "2026-11-20", 45000),
  bill("B-BAYS2-1", "S-BAYS2", "Bayside Plumbing", "SI 7781", "2026-11-10", 330250),
  bill("B-GAS-1", "S-GAS", "Coastal Gas", "1001", "2026-11-12", 12000),
  bill("B-GAS-2", "S-GAS", "Coastal Gas", "1002", "2026-11-19", 13550),
  bill("B-OFFICE-1", "S-OFFICE", "Deskworks Office Supplies", "1001", "2026-11-14", 198000),
  bill("B-TIMBER-2", "S-TIMBER", "Ironbark Timber", "T-61", "2026-11-18", 264000),
  bill("B-STEEL-1", "S-STEEL", "Brisbane Steel Co", "BS-1", "2026-11-19", 517000),
  bill("B-RENT-2", "S-RENT", "Fortitude Property Trust", "R-11", "2026-11-20", 380000),
  // Out of scope: a draft, one awaiting approval, one entered after the cutoff, one voided.
  bill("B-GAS-D", "S-GAS", "Coastal Gas", "1003", "2026-11-24", 12000, "draft"),
  bill("B-ELEC-A", "S-ELEC", "Brightline Electrical", "E-315", "2026-11-21", 198000, "awaiting_approval"),
  bill("B-SKIP-LATE", "S-SKIP", "Metro Skip Bins", "INV-0049", "2026-11-25", 42000, "awaiting_payment", { enteredAt: "2026-11-26T01:00:00.000Z" }),
  bill("B-OFFICE-V", "S-OFFICE", "Deskworks Office Supplies", "1001", "2026-11-14", 198000, "voided"),
];

const world = () => new DuplicateBillHoldWorld({ bills: bills(), suppliers: suppliers() });

// ---- reading the world ---------------------------------------------------------

const keyOf = (rule, billIds, other) => `${rule}|${[...billIds].sort().join(",")}|${other ?? ""}`;
const holdKey = (h) => keyOf(h.rule, h.bills.map((v) => v.billId), h.otherSupplier?.supplierId);
const expectedKey = (e) => keyOf(e.rule, e.billIds, e.otherSupplierId);
const digits = (a) => (a ? String(a).replace(/\D/g, "") : null);

const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** The holds raised in run `n` under `rules` equal, as a set of keys, what the standard requires at the start of that run. */
function exactlyExpected(w, n, rules) {
  const raised = w.holds.filter((h) => h.run === n && rules.includes(h.rule)).map(holdKey);
  const expected = (w.expectedByRun[n - 1] ?? []).filter((e) => rules.includes(e.rule)).map(expectedKey);
  return expected.length > 0 && sameSet(raised, expected);
}

/** Every run's results cover exactly the bills in scope at its start, once each. */
function everyRunCovered(w) {
  if (w.run === 0) return false;
  for (let n = 1; n <= w.run; n++) {
    const ids = w.results.filter((r) => r.run === n).map((r) => r.billId);
    if (!sameSet(ids, w.scopeByRun[n - 1])) return false;
    if (!w.results.filter((r) => r.run === n).every((r) => ["clear", "held", "not_checked"].includes(r.status))) return false;
  }
  return true;
}

const runs = async (build, w, n, between = () => {}) => {
  for (let i = 1; i <= n; i++) {
    await build(w.ports());
    between(i);
    w.advanceHours(2);
  }
};

const holdFor = (w, rule, billId) => w.holds.find((h) => h.rule === rule && h.bills.some((v) => v.billId === billId));
const describe = (w) =>
  `${w.run} run(s), ${w.holds.length} hold(s) [${w.holds.map((h) => `${h.rule}:${h.bills.map((v) => v.billId).join("+")}`).join(", ")}], ` +
  `${w.results.length} result(s), ${w.writes.length} ledger write(s)`;

export const scenarios = [
  {
    checkId: "every-approved-bill-checked",
    // 1. Twenty-one bills; four runs across Thursday morning. Every run answers
    // for exactly the eleven in scope, and for nothing else.
    world,
    drive: (build, w) => runs(build, w, 4),
    holds: (w) =>
      w.run === 4 &&
      w.scopeByRun[0].length === 11 &&
      everyRunCovered(w) &&
      !w.results.some((r) => ["B-GAS-D", "B-ELEC-A", "B-SKIP-LATE", "B-OFFICE-V", "B-SKIP-1"].includes(r.billId)),
    describe,
  },
  {
    checkId: "same-supplier-same-number",
    // 2. inv 42 waiting; INV-0042 for the same $420.00 paid on the 12th.
    world,
    drive: (build, w) => build(w.ports()),
    holds: (w) => exactlyExpected(w, 1, ["same_invoice_number"]) && Boolean(holdFor(w, "same_invoice_number", "B-SKIP-2")),
    describe,
  },
  {
    checkId: "same-supplier-same-amount",
    // 3. Electrician $1,980.00 twice a week apart (one with no number), cleaner
    // $450.00 a week after the last; rent 31 days apart and gas at different
    // totals raise nothing.
    world,
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      exactlyExpected(w, 1, ["same_amount_in_window"]) &&
      Boolean(holdFor(w, "same_amount_in_window", "B-ELEC-2")) &&
      Boolean(holdFor(w, "same_amount_in_window", "B-CLEAN-2")) &&
      !w.holds.some((h) => h.bills.some((v) => ["B-RENT-2", "B-GAS-1", "B-GAS-2", "B-OFFICE-1"].includes(v.billId))),
    describe,
  },
  {
    checkId: "supplier-entered-twice",
    // 4. SI-7781 paid to Bayside Plumbing Supplies; SI 7781 waiting on Bayside
    // Plumbing. Coastal Gas and Deskworks both have a 1001 at different totals.
    world,
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      exactlyExpected(w, 1, ["supplier_entered_twice"]) &&
      Boolean(holdFor(w, "supplier_entered_twice", "B-BAYS2-1")) &&
      !w.holds.some((h) => h.rule === "supplier_entered_twice" && h.bills.some((v) => v.billId === "B-GAS-1")),
    describe,
  },
  {
    checkId: "bank-details-held",
    // 5. Ironbark Timber's account changed since last month's payment; Brisbane
    // Steel Co carries Northside Paint's account, typed differently.
    world,
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (!exactlyExpected(w, 1, ["bank_changed", "bank_shared"])) return false;
      const changed = w.holds.filter((h) => h.rule === "bank_changed");
      const shared = w.holds.filter((h) => h.rule === "bank_shared");
      return (
        changed.length > 0 &&
        shared.length > 0 &&
        changed.every((h) => h.bills.length === 2 && digits(h.bills[0].bankAccount) && digits(h.bills[1].bankAccount) && digits(h.bills[0].bankAccount) !== digits(h.bills[1].bankAccount)) &&
        shared.every((h) => h.bills.length === 1 && h.otherSupplier && digits(h.otherSupplier.bankAccount) !== null && digits(h.otherSupplier.bankAccount) === digits(h.bills[0].bankAccount))
      );
    },
    describe,
  },
  {
    checkId: "both-bills-side-by-side",
    // 6. Every hold from an ordinary first run carries its rule, both bills
    // exactly as the ledger held them when it was raised, and an owner.
    world,
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (w.holds.length === 0) return false;
      const FIELDS = ["billId", "supplierId", "supplierName", "invoiceNumber", "date", "total", "status", "paidDate", "bankAccount"];
      return w.holds.every((h) => {
        if (!RULES.includes(h.rule)) return false;
        if (typeof h.owner !== "string" || h.owner.length === 0) return false;
        if (h.rule === "bank_shared") {
          if (h.bills.length !== 1 || !h.otherSupplier?.supplierId || !h.otherSupplier?.name || !h.otherSupplier?.bankAccount) return false;
        } else if (h.bills.length !== 2) return false;
        return h.bills.every((v, i) => h.asRaised[i] !== null && FIELDS.every((f) => (v[f] ?? null) === (h.asRaised[i][f] ?? null)));
      });
    },
    describe,
  },
  {
    checkId: "a-person-releases",
    // 7. After the first run the bookkeeper releases the cleaner's pair and
    // voids the second skip bin bill in the ledger; the check runs again.
    world,
    drive: async (build, w) => {
      await build(w.ports());
      w.advanceHours(1);
      const cleaner = holdFor(w, "same_amount_in_window", "B-CLEAN-2");
      const skip = holdFor(w, "same_invoice_number", "B-SKIP-2");
      if (cleaner) w.decide(cleaner.holdId, "release", "Kim Nguyen (bookkeeper)");
      if (skip) w.decide(skip.holdId, "void", "Kim Nguyen (bookkeeper)", "B-SKIP-2");
      w.advanceHours(1);
      await build(w.ports());
    },
    holds: (w) => {
      if (w.writes.length > 0 || w.calls.some((c) => c.port === "write_ledger")) return false;
      // Every clear result: each hold on that bill raised before it is released by a named person.
      for (const r of w.results.filter((x) => x.status === "clear")) {
        const before = w.holds.filter((h) => h.seq < r.seq && h.bills.some((v) => v.billId === r.billId));
        if (!before.every((h) => h.decision && h.decision.action === "release" && typeof h.decision.by === "string" && h.decision.by.length > 0)) return false;
      }
      const run1 = (id) => w.results.find((r) => r.run === 1 && r.billId === id);
      const run2 = (id) => w.results.find((r) => r.run === 2 && r.billId === id);
      return (
        run1("B-CLEAN-2")?.status === "held" &&
        run2("B-CLEAN-2")?.status === "clear" &&
        run2("B-SKIP-2") === undefined &&
        w.bill("B-SKIP-2")?.status === "voided" &&
        run2("B-ELEC-2")?.status === "held" &&
        run2("B-TIMBER-2")?.status === "held"
      );
    },
    describe,
  },
  {
    checkId: "never-clear-on-a-partial-read",
    // 8. Paid bills cut to the most recent half and bank details unreadable;
    // two runs.
    world: () => {
      const w = world();
      w.truncatePaidRead();
      w.bankDetailsUnavailable();
      return w;
    },
    drive: (build, w) => runs(build, w, 2),
    holds: (w) =>
      w.partialByRun.every(Boolean) &&
      everyRunCovered(w) &&
      !w.results.some((r) => r.status === "clear") &&
      w.results.filter((r) => r.status !== "held").every((r) => r.status === "not_checked" && typeof r.reason === "string" && r.reason.length > 0) &&
      w.results.some((r) => r.status === "not_checked"),
    describe,
  },
  {
    checkId: "raised-once",
    // 9. Four runs. After the second the cleaner's pair is released; after the
    // third the cleaner reissues the bill under a new number.
    world,
    drive: (build, w) =>
      runs(build, w, 4, (i) => {
        if (i === 2) {
          const h = holdFor(w, "same_amount_in_window", "B-CLEAN-2");
          if (h) w.decide(h.holdId, "release", "Kim Nguyen (bookkeeper)");
        }
        if (i === 3) w.editBill("B-CLEAN-2", { invoiceNumber: "C-102R" });
      }),
    holds: (w) => {
      if (w.run !== 4 || w.holds.length === 0) return false;
      const expectedKeys = new Set(w.expectedByRun.flat().map(expectedKey));
      const byKey = new Map();
      for (const h of w.holds) byKey.set(holdKey(h), [...(byKey.get(holdKey(h)) ?? []), h]);
      if (!sameSet([...byKey.keys()], [...expectedKeys])) return false;
      const cleanerKey = keyOf("same_amount_in_window", ["B-CLEAN-1", "B-CLEAN-2"]);
      for (const [k, hs] of byKey) {
        if (k === cleanerKey) {
          if (hs.length !== 2 || hs[0].run !== 1 || hs[1].run !== 4) return false;
          if (hs[1].bills.find((v) => v.billId === "B-CLEAN-2")?.invoiceNumber !== "C-102R") return false;
        } else if (hs.length !== 1) return false;
      }
      return true;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 10. Not software. Declared in this folder's README: AI Pathway maintains it,
    // and it runs on the business's own ledger connection and its own AI
    // Pathway key, so the account is the business's. The runner reports this
    // as evidence_required and never asks this function.
    world,
    drive: () => {},
    holds: () => false,
    describe: () => "precondition: closed by evidence, not by a run",
  },
];

// Production only. The world is a placeholder: run.mjs swaps in the live one.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 11. The seeded test file in the business's own ledger, run twice.
    world,
    drive: (build, w) => runs(build, w, 2),
    holds: (w) =>
      w.writes.length === 0 &&
      exactlyExpected(w, 1, RULES) &&
      w.holds.every((h) => h.run === 1),
    describe,
  },
];

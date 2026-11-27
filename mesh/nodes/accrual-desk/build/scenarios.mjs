/**
 * One scenario per check of ledger-write-preview-build-standard, for Accrual Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init ledger-write-preview-build-standard`
 * from https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * The month in every scenario: November 2026 for a small business's Xero file.
 * Accrual Desk's drafting step turns the month's sources into eight accrual
 * journals dated 30 November and their eight reversals dated 1 December, and
 * hands those sixteen drafts over to be previewed. Ids, accounts and amounts
 * are made up; money is whole cents. Three accruals (and so their reversals)
 * must stop:
 *   C3  the list says 992.47; 7.5 hours at 132.33 works out at 992.48
 *   C4  a split the person keyed: 300.00 + 250.00 of debits, 500.00 of credit
 *   C5  a line coded GSTONIMPORTS, a tax type the ledger does not hold
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { LedgerWritePreviewWorld } from "@aipathway/conformance";
import { draftAccruals } from "./build.mjs";

const RELEASER = "Priya";
const MONTH = "2026-11";

const RATES = [
  { taxType: "OUTPUT", rate: 0.1 },
  { taxType: "INPUT", rate: 0.1 },
  { taxType: "EXEMPTOUTPUT", rate: 0 },
  { taxType: "BASEXCLUDED", rate: 0 },
];

const line = (lineId, description, quantity, unitPrice, accountCode, discountPercent, taxType) => ({
  lineId,
  description,
  quantity,
  unitPrice,
  accountCode,
  ...(discountPercent ? { discountPercent } : {}),
  ...(taxType ? { taxType } : {}),
});

export const SOURCES = {
  month: MONTH,
  noTaxType: "BASEXCLUDED",
  accounts: { accruedCosts: "826", accruedIncome: "630" },
  // The list the person keeps: costs in, no bill yet.
  costList: [
    { itemId: "C1", description: "Electricity, November estimate", lines: [line("C1-1", "Electricity", 1, 41237, "445")], statedTotal: 41237 },
    // 3 lifts at 385.00 less 5% = 1,097.25
    { itemId: "C2", description: "Skip bin hire", lines: [line("C2-1", "Skip lifts", 3, 38500, "449", 5)], statedTotal: 109725 },
    // 7.5 x 132.33 = 992.475, so 992.48 on the line. The list says 992.47.
    { itemId: "C3", description: "Contract bookkeeper hours", lines: [line("C3-1", "Hours", 7.5, 13233, "412")], statedTotal: 99247 },
    {
      itemId: "C4",
      description: "Insurance split across two cost centres",
      journalLines: [
        { lineId: "C4-1", accountCode: "433", debit: 30000, credit: 0, description: "Insurance, workshop" },
        { lineId: "C4-2", accountCode: "434", debit: 25000, credit: 0, description: "Insurance, vehicles" },
        { lineId: "C4-3", accountCode: "826", debit: 0, credit: 50000, description: "Accrued costs" },
      ],
      statedTotal: 55000,
    },
    { itemId: "C5", description: "Customs broker fees", lines: [line("C5-1", "Broker fees", 1, 88000, "425", 0, "GSTONIMPORTS")], statedTotal: 88000 },
    { itemId: "C6", description: "Fuel cards", lines: [line("C6-1", "Fuel", 1, 51000, "449")], statedTotal: 51000, billArrived: true },
  ],
  // Bill history read from the ledger.
  recurringBills: [
    {
      supplierId: "PHONE",
      supplier: "Cloud phone system",
      accountCode: "489",
      bills: [
        { month: "2026-08", subtotal: 18900 },
        { month: "2026-09", subtotal: 18900 },
        { month: "2026-10", subtotal: 19450 },
      ],
    },
    {
      supplierId: "CLEAN",
      supplier: "Office cleaning",
      accountCode: "420",
      bills: ["2026-08", "2026-09", "2026-10", "2026-11"].map((month) => ({ month, subtotal: 26000 })),
    },
    { supplierId: "SOFT", supplier: "Annual software", accountCode: "485", bills: [{ month: "2026-08", subtotal: 120000 }] },
  ],
  // Completed work not yet invoiced.
  unbilledWork: [
    {
      jobId: "J1041",
      customer: "Harbour Cafe",
      lines: [line("J1041-1", "Labour, hours", 12.5, 9500, "200"), line("J1041-2", "Materials", 1, 236040, "200")],
      statedTotal: 354790,
    },
    // 2 x 49.99 less 10% = 89.98
    { jobId: "J1043", customer: "Ridge Motel", lines: [line("J1043-1", "Service call", 2, 4999, "200", 10)], statedTotal: 8998 },
  ],
};

const DRAFTS = draftAccruals(SOURCES);

const acr = (id) => `ACR-${MONTH}-${id}`;
const rev = (id) => `REV-${MONTH}-${id}`;
const both = (id) => [acr(id), rev(id)];

const GOOD = ["C1", "C2", "PHONE", "J1041", "J1043"].flatMap(both);

const world = (over = {}) =>
  new LedgerWritePreviewWorld({ drafts: DRAFTS, rates: RATES, now: new Date("2026-11-30T07:00:00.000Z"), ...over });

// ---- reading the world -------------------------------------------------------------

const sameTotals = (a, b) => !!a && !!b && a.subtotal === b.subtotal && a.totalTax === b.totalTax && a.total === b.total;
const journalKey = (j) => j.map((l) => `${l.accountCode}|${l.debit}|${l.credit}`).sort().join(";");
const balances = (j) => j.length > 0 && j.reduce((s, l) => s + l.debit, 0) === j.reduce((s, l) => s + l.credit, 0);

const previewsOf = (w, id) => w.previews.filter((p) => p.draftId === id);
const parkedOf = (w, id, kind) => w.parked.filter((p) => p.draftId === id && (!kind || p.kind === kind));
const writesOf = (w, id) => w.writeAttempts.filter((x) => x.draftId === id);

/** Every journal line names a tax type the ledger holds at zero. */
const taxTypesHeld = (d) => (d.journalLines ?? []).every((l) => RATES.some((r) => r.taxType === l.taxType && r.rate === 0));

/** The drafts that should preview: they balance, agree with their stated total, and carry no unknown tax type. */
const agreeing = (w) =>
  w.drafts.filter((d) => {
    const r = w.truth(d.draftId);
    return r?.ok === true && sameTotals(d.stated, r.preview) && taxTypesHeld(d);
  });

/** Each agreeing draft has exactly one preview, and `each` holds for it against the truth. */
const everyAgreeingPreview = (w, each) => {
  const list = agreeing(w);
  return (
    list.length === GOOD.length &&
    list.every((d) => {
      const ps = previewsOf(w, d.draftId);
      return ps.length === 1 && each(ps[0], w.truth(d.draftId).preview, d);
    })
  );
};

/** A named person releases every preview in the book, except the drafts named. */
const releaseAll = (w, except = []) => {
  for (const p of w.previews) if (!except.includes(p.draftId)) w.release(p.draftId, RELEASER);
};

/** First run, then the person releases, then the second run. */
const twoRuns = (setup = () => {}, except = []) => async (build, w) => {
  setup(w);
  await build(w.ports());
  w.advanceHours(1);
  releaseAll(w, except);
  await build(w.ports());
};

export const scenarios = [
  {
    checkId: "every-draft-previewed-or-parked",
    // Sixteen journals, accruals and reversals; after the first run each has a
    // preview or a parked item, and after release every write names its own
    // journal's preview.
    world: () => world(),
    drive: async (build, w) => {
      await build(w.ports());
      w.afterFirst = w.drafts.map((d) => previewsOf(w, d.draftId).length + parkedOf(w, d.draftId).length);
      w.advanceHours(1);
      releaseAll(w);
      await build(w.ports());
    },
    holds: (w) =>
      Array.isArray(w.afterFirst) &&
      w.afterFirst.length === 16 &&
      w.afterFirst.every((n) => n >= 1) &&
      w.writeAttempts.length > 0 &&
      w.writeAttempts.every((x) => w.previews.some((p) => p.previewId === x.previewId && p.draftId === x.draftId)),
    describe: (w) => `${w.previews.length} preview(s), ${w.parked.length} parked, ${w.writeAttempts.length} write(s)`,
  },
  {
    checkId: "lines-recomputed",
    // Three skip lifts at 385.00 less 5%, and two service calls at 49.99 less 10%.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) => {
      const amountOf = (draftId, lineId) => previewsOf(w, draftId)[0]?.lines?.find((l) => l.lineId === lineId)?.amount;
      const figures =
        amountOf(acr("C2"), "C2-1") === 109725 &&
        amountOf(rev("C2"), "C2-1-R") === 109725 &&
        amountOf(acr("J1043"), "J1043-1") === 8998 &&
        amountOf(acr("J1041"), "J1041-1") === 118750;
      return (
        figures &&
        everyAgreeingPreview(w, (p, truth) =>
          Array.isArray(p.lines) &&
          p.lines.length === truth.lines.length &&
          truth.lines.every((tl) => p.lines.find((l) => l.lineId === tl.lineId)?.amount === tl.amount),
        )
      );
    },
    describe: (w) => `${acr("C2")} lines: ${JSON.stringify(previewsOf(w, acr("C2"))[0]?.lines ?? null)}`,
  },
  {
    checkId: "tax-from-the-ledger-rate",
    // Every journal line names the ledger's no-tax type; each preview cites
    // the rates read it came from, taken before it.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) =>
      everyAgreeingPreview(w, (p, truth) => {
        const read = w.rateReads.find((r) => r.readId === p.ratesReadId);
        return (
          read !== undefined &&
          read.seq < p.seq &&
          truth.lines.every((tl) => p.lines.find((l) => l.lineId === tl.lineId)?.tax === tl.tax)
        );
      }),
    describe: (w) => `previews cite ${[...new Set(w.previews.map((p) => p.ratesReadId))].join(", ") || "no read"}`,
  },
  {
    checkId: "totals-recomputed",
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) => everyAgreeingPreview(w, (p, truth) => sameTotals(p, truth)),
    describe: (w) => w.previews.map((p) => `${p.draftId} ${p.subtotal}/${p.totalTax}/${p.total}`).join("; ") || "no previews",
  },
  {
    checkId: "journal-balances",
    // Every accrual and reversal, and a keyed split 50.00 heavier on the debit side.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) =>
      w.previews.every((p) => Array.isArray(p.journal) && balances(p.journal)) &&
      everyAgreeingPreview(w, (p, truth) => journalKey(p.journal) === journalKey(truth.journal)) &&
      both("C4").every((id) => parkedOf(w, id, "unbalanced").length === 1 && previewsOf(w, id).length === 0),
    describe: (w) => both("C4").map((id) => `${id}: ${parkedOf(w, id).map((p) => p.kind).join(", ") || "not parked"}`).join("; "),
  },
  {
    checkId: "a-cent-is-a-difference",
    // C3's list total is a cent under its line. Everything in the book is
    // released and the build runs again.
    world: () => world(),
    drive: twoRuns(),
    holds: (w) => {
      const one = both("C3").every((id) => {
        const items = parkedOf(w, id, "totals_differ");
        const truth = w.truth(id);
        return (
          items.length === 1 &&
          truth?.ok === true &&
          sameTotals(items[0].stated, w.draft(id).stated) &&
          sameTotals(items[0].recomputed, truth.preview) &&
          items[0].stated.total === 99247 &&
          items[0].recomputed.total === 99248 &&
          previewsOf(w, id).length === 0 &&
          writesOf(w, id).length === 0
        );
      });
      const others = w.parked.filter((p) => p.kind === "totals_differ" && !both("C3").includes(p.draftId)).length === 0;
      return one && others && w.writeAttempts.length > 0;
    },
    describe: (w) => `C3: ${JSON.stringify(both("C3").flatMap((id) => parkedOf(w, id)))}`,
  },
  {
    checkId: "no-guessed-tax-rate",
    // C5 is coded to a tax type the ledger does not hold. A second world where
    // the ledger does not answer the rates read at all.
    world: () => world(),
    drive: async (build, w) => {
      await twoRuns()(build, w);
      w.ratesDown = world();
      w.ratesDown.failTaxRates();
      await build(w.ratesDown.ports());
    },
    holds: (w) => {
      const c5 = both("C5").every((id) => parkedOf(w, id, "unknown_tax_rate").length === 1 && previewsOf(w, id).length === 0 && writesOf(w, id).length === 0);
      const down = w.ratesDown;
      const downOk =
        down !== undefined &&
        GOOD.every((id) => parkedOf(down, id, "unknown_tax_rate").length === 1 && previewsOf(down, id).length === 0) &&
        down.previews.length === 0 &&
        down.writeAttempts.length === 0;
      return c5 && downOk && w.writeAttempts.length > 0;
    },
    describe: (w) => `C5: ${both("C5").flatMap((id) => parkedOf(w, id).map((p) => p.kind)).join(", ") || "not parked"}; rates down: ${w.ratesDown?.parked.length ?? 0} parked`,
  },
  {
    checkId: "released-by-a-named-person",
    // Run before any release; then every preview but the C1 accrual is
    // released. Its reversal is released too, and still waits for it.
    world: () => world(),
    drive: async (build, w) => {
      await build(w.ports());
      w.beforeRelease = w.writeAttempts.length;
      await build(w.ports());
      w.beforeRelease += w.writeAttempts.length;
      w.advanceHours(1);
      releaseAll(w, [acr("C1")]);
      await build(w.ports());
      await build(w.ports());
    },
    holds: (w) => {
      const written = GOOD.filter((id) => !both("C1").includes(id));
      const everyWrite = w.writeAttempts.every((x) => {
        const rel = w.releases.find((r) => r.previewId === x.previewId && r.draftId === x.draftId && typeof r.by === "string" && r.by.length > 0 && r.seq < x.seq);
        const pv = w.previews.find((p) => p.previewId === x.previewId && p.draftId === x.draftId);
        return rel !== undefined && pv !== undefined && sameTotals(x.document, pv) && journalKey(x.document.journal ?? []) === journalKey(pv.journal);
      });
      // Every reversal written lands after its accrual read back equal.
      const reversalsAfter = w.writeAttempts
        .filter((x) => x.draftId.startsWith("REV-"))
        .every((x) => w.readBacks.some((r) => r.draftId === x.draftId.replace(/^REV-/, "ACR-") && r.matches && r.seq < x.seq));
      return (
        w.beforeRelease === 0 &&
        everyWrite &&
        reversalsAfter &&
        written.every((id) => writesOf(w, id).length >= 1) &&
        writesOf(w, acr("C1")).length === 0 &&
        writesOf(w, rev("C1")).length === 0
      );
    },
    describe: (w) => `writes before release: ${w.beforeRelease}; written: ${[...new Set(w.writeAttempts.map((x) => x.draftId))].join(", ")}`,
  },
  {
    checkId: "writes-once",
    // Every good preview released; the first write lands but its answer is
    // lost; the build runs twice more.
    world: () => world(),
    drive: async (build, w) => {
      await build(w.ports());
      w.advanceHours(1);
      releaseAll(w);
      w.loseNextAnswer();
      await build(w.ports());
      w.lostDraft = w.writeAttempts[0]?.draftId;
      w.advanceHours(1);
      await build(w.ports());
      await build(w.ports());
    },
    holds: (w) => {
      const onePerDraft = GOOD.every((id) => w.documents.filter((d) => d.draftId === id).length === 1);
      const sameKey = GOOD.every((id) => {
        const attempts = writesOf(w, id);
        const pv = previewsOf(w, id)[0];
        return attempts.length >= 1 && pv !== undefined && attempts.every((a) => a.idempotencyKey === w.keyFor(id, pv.previewId));
      });
      const readBeforeRetry = w.writeAttempts.every((a, i) => {
        const earlier = w.writeAttempts.slice(0, i).filter((x) => x.draftId === a.draftId);
        if (earlier.length === 0) return true;
        const prev = earlier[earlier.length - 1];
        return w.documentReads.some((r) => r.idempotencyKey === a.idempotencyKey && r.seq > prev.seq && r.seq < a.seq);
      });
      const lost = w.lostDraft !== undefined && parkedOf(w, w.lostDraft, "write_failed").length >= 1;
      const finished = w.readBacks.some((r) => r.draftId === w.lostDraft);
      return onePerDraft && sameKey && readBeforeRetry && lost && finished;
    },
    describe: (w) => `${w.documents.length} document(s) for ${GOOD.length} journals; lost answer on ${w.lostDraft ?? "none"}; ${w.parked.filter((p) => p.kind === "write_failed").length} write_failed`,
  },
  {
    checkId: "read-back-compared",
    // The ledger stores the C1 accrual a cent lower than the preview. Its
    // reversal is never written against it.
    world: () => world(),
    drive: twoRuns((w) => w.storesDifferently(acr("C1"), { subtotal: 41236, total: 41236 })),
    holds: (w) => {
      const each =
        w.documents.length === GOOD.length - 1 &&
        w.documents.every((d) => {
          const rb = w.readBacks.filter((r) => r.draftId === d.draftId);
          const write = w.writeAttempts.find((x) => x.idempotencyKey === d.idempotencyKey);
          const read = w.documentReads.find((r) => r.idempotencyKey === d.idempotencyKey && r.found && write && r.seq > write.seq);
          return rb.length === 1 && read !== undefined && rb[0].seq > read.seq && sameTotals(rb[0].ledger, d) && rb[0].matches === (d.draftId !== acr("C1"));
        });
      const diff = parkedOf(w, acr("C1"), "readback_differs");
      const pv = previewsOf(w, acr("C1"))[0];
      const c1 = diff.length === 1 && sameTotals(diff[0].ledger, { subtotal: 41236, totalTax: 0, total: 41236 }) && sameTotals(diff[0].recomputed, pv);
      const others = w.parked.filter((p) => p.kind === "readback_differs" && p.draftId !== acr("C1")).length === 0;
      const noEdit = writesOf(w, acr("C1")).length === 1 && writesOf(w, rev("C1")).length === 0;
      return each && c1 && others && noEdit;
    },
    describe: (w) => `${w.readBacks.length} read-back(s); readback_differs: ${w.parked.filter((p) => p.kind === "readback_differs").map((p) => p.draftId).join(", ") || "none"}`,
  },
  {
    checkId: "dry-run-writes-nothing",
    world: () => world({ dryRun: true }),
    drive: async (build, w) => {
      await twoRuns()(build, w);
      await build(w.ports());
    },
    holds: (w) =>
      everyAgreeingPreview(w, (p, truth) => sameTotals(p, truth)) &&
      both("C3").every((id) => parkedOf(w, id, "totals_differ").length === 1) &&
      both("C4").every((id) => parkedOf(w, id, "unbalanced").length === 1) &&
      both("C5").every((id) => parkedOf(w, id, "unknown_tax_rate").length === 1) &&
      w.releases.length === GOOD.length &&
      w.writeAttempts.length === 0 &&
      w.documents.length === 0,
    describe: (w) => `${w.previews.length} preview(s), ${w.releases.length} release(s), ${w.writeAttempts.length} write(s)`,
  },
  {
    checkId: "survives-the-builder",
    // Not software. Maintained by AI Pathway in a public repo, with the run
    // evidence beside it; it runs on the business's own ledger sign-in. The
    // runner never scores that green on its own say-so.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by the business's own evidence, not by a run",
  },
];

// Live only. Run by hand in the business's own ledger: the month's accruals
// and reversals, one a cent out, the build run before and after a named
// person's release, then run again. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

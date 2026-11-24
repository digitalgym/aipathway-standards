/**
 * One scenario per check of ledger-write-preview-build-standard, for Draft Preview.
 *
 * Scaffolded by `npx @aipathway/conformance init ledger-write-preview-build-standard`
 * from https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * The morning in every scenario: a plumbing business's bots hand over nine
 * drafts to write into its Xero file. Ids, accounts and amounts are made up;
 * money is whole cents. Three of the nine must stop:
 *   INV-2  states GST of 12.36 where the line works out at 12.35
 *   BILL-2 names a tax type (GSTONIMPORTS) the ledger does not hold
 *   MJ-2   a wages journal with 100.00 of debits and 90.00 of credits
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { LedgerWritePreviewWorld } from "@aipathway/conformance";

const RELEASER = "Priya";

const RATES = [
  { taxType: "OUTPUT", rate: 0.1 },
  { taxType: "INPUT", rate: 0.1 },
  { taxType: "EXEMPTOUTPUT", rate: 0 },
  { taxType: "BASEXCLUDED", rate: 0 },
];

const line = (lineId, description, quantity, unitPrice, accountCode, taxType, discountPercent) => ({
  lineId,
  description,
  quantity,
  unitPrice,
  accountCode,
  taxType,
  ...(discountPercent ? { discountPercent } : {}),
});
const jline = (lineId, accountCode, debit, credit, description) => ({ lineId, accountCode, debit, credit, description });
const t = (subtotal, totalTax, total) => ({ subtotal, totalTax, total });
const draft = (draftId, type, contact, amountType, lines, stated, journalLines) => ({
  draftId,
  type,
  contact,
  date: "2026-11-24",
  amountType,
  lines,
  stated,
  ...(journalLines ? { journalLines } : {}),
});

const DRAFTS = [
  // 3 filters at 19.99 less 15% = 50.97, GST 5.10; 2.5 h at 19.99 = 49.98, GST 5.00; 45.00 GST free.
  draft("INV-1", "invoice", "Harbour Cafe", "exclusive", [
    line("INV-1-1", "Water filter cartridges", 3, 1999, "200", "OUTPUT", 15),
    line("INV-1-2", "Labour, hours", 2.5, 1999, "200", "OUTPUT"),
    line("INV-1-3", "Backflow test fee", 1, 4500, "200", "EXEMPTOUTPUT"),
  ], t(14595, 1010, 15605)),
  // 123.45 at 10% is 12.345, so 12.35 on the line. The draft says 12.36.
  draft("INV-2", "invoice", "Ridge Motel", "exclusive", [line("INV-2-1", "Hot water service", 1, 12345, "200", "OUTPUT")], t(12345, 1236, 13581)),
  draft("BILL-1", "bill", "Coastal Pipe Supply", "exclusive", [line("BILL-1-1", "Copper fittings", 2, 4550, "310", "INPUT")], t(9100, 910, 10010)),
  draft("BILL-2", "bill", "Freight Forwarders", "exclusive", [line("BILL-2-1", "Import freight", 1, 88000, "425", "GSTONIMPORTS")], t(88000, 8800, 96800)),
  draft("CN-1", "credit_note", "Harbour Cafe", "exclusive", [line("CN-1-1", "Returned cartridge", 1, 5000, "200", "OUTPUT")], t(5000, 500, 5500)),
  // 33.00 including GST: 3.00 tax, 30.00 before tax.
  draft("SPEND-1", "spend_money", "Hardware store", "inclusive", [line("SPEND-1-1", "Thread tape", 1, 3300, "449", "INPUT")], t(3000, 300, 3300)),
  draft("RECV-1", "receive_money", "Insurer", "no_tax", [line("RECV-1-1", "Claim settlement", 1, 25000, "260", "BASEXCLUDED")], t(25000, 0, 25000)),
  draft("MJ-1", "manual_journal", "", "no_tax", [], t(12000, 0, 12000), [
    jline("MJ-1-1", "477", 12000, 0, "Wages accrual"),
    jline("MJ-1-2", "804", 0, 12000, "Wages payable"),
  ]),
  draft("MJ-2", "manual_journal", "", "no_tax", [], t(10000, 0, 10000), [
    jline("MJ-2-1", "477", 10000, 0, "Wages accrual"),
    jline("MJ-2-2", "804", 0, 9000, "Wages payable"),
  ]),
];

const GOOD = ["INV-1", "BILL-1", "CN-1", "SPEND-1", "RECV-1", "MJ-1"];

const world = (over = {}) => new LedgerWritePreviewWorld({ drafts: DRAFTS, rates: RATES, ...over });

// ---- reading the world -------------------------------------------------------------

const sameTotals = (a, b) => !!a && !!b && a.subtotal === b.subtotal && a.totalTax === b.totalTax && a.total === b.total;
const journalKey = (j) => j.map((l) => `${l.accountCode}|${l.debit}|${l.credit}`).sort().join(";");
const balances = (j) => j.length > 0 && j.reduce((s, l) => s + l.debit, 0) === j.reduce((s, l) => s + l.credit, 0);

const previewsOf = (w, id) => w.previews.filter((p) => p.draftId === id);
const parkedOf = (w, id, kind) => w.parked.filter((p) => p.draftId === id && (!kind || p.kind === kind));
const writesOf = (w, id) => w.writeAttempts.filter((x) => x.draftId === id);

/** The drafts whose stated totals agree with what their inputs work out to. */
const agreeing = (w) =>
  w.drafts.filter((d) => {
    const r = w.truth(d.draftId);
    return r?.ok === true && sameTotals(d.stated, r.preview);
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
    // Nine drafts across six types; after the first run each has a preview or
    // a parked item, and after release every write names its own draft's preview.
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
      w.afterFirst.length === 9 &&
      w.afterFirst.every((n) => n >= 1) &&
      w.writeAttempts.length > 0 &&
      w.writeAttempts.every((x) => w.previews.some((p) => p.previewId === x.previewId && p.draftId === x.draftId)),
    describe: (w) => `${w.previews.length} preview(s), ${w.parked.length} parked, ${w.writeAttempts.length} write(s)`,
  },
  {
    checkId: "lines-recomputed",
    // A line of three at 19.99 less 15%, and 2.5 hours at 19.99.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) => {
      const inv = previewsOf(w, "INV-1")[0];
      const figures = inv?.lines?.find((l) => l.lineId === "INV-1-1")?.amount === 5097 && inv?.lines?.find((l) => l.lineId === "INV-1-2")?.amount === 4998;
      return (
        figures &&
        everyAgreeingPreview(w, (p, truth) =>
          Array.isArray(p.lines) &&
          p.lines.length === truth.lines.length &&
          truth.lines.every((tl) => p.lines.find((l) => l.lineId === tl.lineId)?.amount === tl.amount),
        )
      );
    },
    describe: (w) => `INV-1 lines: ${JSON.stringify(previewsOf(w, "INV-1")[0]?.lines ?? null)}`,
  },
  {
    checkId: "tax-from-the-ledger-rate",
    // Exclusive invoice, inclusive spend money, a GST free line.
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
    // Every document type, and a journal 10.00 heavier on the debit side.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: (w) =>
      w.previews.every((p) => Array.isArray(p.journal) && balances(p.journal)) &&
      everyAgreeingPreview(w, (p, truth) => journalKey(p.journal) === journalKey(truth.journal)) &&
      parkedOf(w, "MJ-2", "unbalanced").length === 1 &&
      previewsOf(w, "MJ-2").length === 0,
    describe: (w) => `MJ-2: ${parkedOf(w, "MJ-2").map((p) => p.kind).join(", ") || "not parked"}, ${previewsOf(w, "MJ-2").length} preview(s)`,
  },
  {
    checkId: "a-cent-is-a-difference",
    // INV-2 states one cent more tax than the line gives. Everything in the book
    // is released and the build runs again.
    world: () => world(),
    drive: twoRuns(),
    holds: (w) => {
      const items = parkedOf(w, "INV-2", "totals_differ");
      const truth = w.truth("INV-2");
      const one = items.length === 1 && truth?.ok === true && sameTotals(items[0].stated, w.draft("INV-2").stated) && sameTotals(items[0].recomputed, truth.preview);
      const others = w.parked.filter((p) => p.kind === "totals_differ" && p.draftId !== "INV-2").length === 0;
      return one && others && previewsOf(w, "INV-2").length === 0 && writesOf(w, "INV-2").length === 0 && w.writeAttempts.length > 0;
    },
    describe: (w) => `INV-2: ${JSON.stringify(parkedOf(w, "INV-2"))}`,
  },
  {
    checkId: "no-guessed-tax-rate",
    // BILL-2 is coded to a tax type the ledger does not hold. A second world
    // where the ledger does not answer the rates read at all.
    world: () => world(),
    drive: async (build, w) => {
      await twoRuns()(build, w);
      w.ratesDown = world();
      w.ratesDown.failTaxRates();
      await build(w.ratesDown.ports());
    },
    holds: (w) => {
      const bill = parkedOf(w, "BILL-2", "unknown_tax_rate").length === 1 && previewsOf(w, "BILL-2").length === 0 && writesOf(w, "BILL-2").length === 0;
      const down = w.ratesDown;
      const taxed = ["INV-1", "BILL-1", "CN-1", "SPEND-1"];
      const downOk =
        down !== undefined &&
        taxed.every((id) => parkedOf(down, id, "unknown_tax_rate").length === 1 && previewsOf(down, id).length === 0) &&
        down.writeAttempts.length === 0;
      return bill && downOk && w.writeAttempts.length > 0;
    },
    describe: (w) => `BILL-2: ${parkedOf(w, "BILL-2").map((p) => p.kind).join(", ") || "not parked"}; rates down: ${w.ratesDown?.parked.length ?? 0} parked`,
  },
  {
    checkId: "released-by-a-named-person",
    // Run before any release; then every preview but SPEND-1 is released.
    world: () => world(),
    drive: async (build, w) => {
      await build(w.ports());
      w.beforeRelease = w.writeAttempts.length;
      await build(w.ports());
      w.beforeRelease += w.writeAttempts.length;
      w.advanceHours(1);
      releaseAll(w, ["SPEND-1"]);
      await build(w.ports());
    },
    holds: (w) => {
      const released = GOOD.filter((id) => id !== "SPEND-1");
      const everyWrite = w.writeAttempts.every((x) => {
        const rel = w.releases.find((r) => r.previewId === x.previewId && r.draftId === x.draftId && typeof r.by === "string" && r.by.length > 0 && r.seq < x.seq);
        const pv = w.previews.find((p) => p.previewId === x.previewId && p.draftId === x.draftId);
        return rel !== undefined && pv !== undefined && sameTotals(x.document, pv) && journalKey(x.document.journal ?? []) === journalKey(pv.journal);
      });
      return (
        w.beforeRelease === 0 &&
        everyWrite &&
        released.every((id) => writesOf(w, id).length >= 1) &&
        writesOf(w, "SPEND-1").length === 0
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
    describe: (w) => `${w.documents.length} document(s) for ${GOOD.length} drafts; lost answer on ${w.lostDraft ?? "none"}; ${w.parked.filter((p) => p.kind === "write_failed").length} write_failed`,
  },
  {
    checkId: "read-back-compared",
    // The ledger stores BILL-1 with GST a cent lower than the preview.
    world: () => world(),
    drive: twoRuns((w) => w.storesDifferently("BILL-1", { totalTax: 909, total: 10009 })),
    holds: (w) => {
      const each = w.documents.length === GOOD.length && w.documents.every((d) => {
        const rb = w.readBacks.filter((r) => r.draftId === d.draftId);
        const write = w.writeAttempts.find((x) => x.idempotencyKey === d.idempotencyKey);
        const read = w.documentReads.find((r) => r.idempotencyKey === d.idempotencyKey && r.found && write && r.seq > write.seq);
        return rb.length === 1 && read !== undefined && rb[0].seq > read.seq && sameTotals(rb[0].ledger, d) && rb[0].matches === (d.draftId !== "BILL-1");
      });
      const diff = parkedOf(w, "BILL-1", "readback_differs");
      const pv = previewsOf(w, "BILL-1")[0];
      const bill = diff.length === 1 && sameTotals(diff[0].ledger, { subtotal: 9100, totalTax: 909, total: 10009 }) && sameTotals(diff[0].recomputed, pv);
      const others = w.parked.filter((p) => p.kind === "readback_differs" && p.draftId !== "BILL-1").length === 0;
      const noEdit = writesOf(w, "BILL-1").length === 1;
      return each && bill && others && noEdit;
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
      parkedOf(w, "INV-2", "totals_differ").length === 1 &&
      parkedOf(w, "BILL-2", "unknown_tax_rate").length === 1 &&
      parkedOf(w, "MJ-2", "unbalanced").length === 1 &&
      w.releases.length === GOOD.length &&
      w.writeAttempts.length === 0 &&
      w.documents.length === 0,
    describe: (w) => `${w.previews.length} preview(s), ${w.releases.length} release(s), ${w.writeAttempts.length} write(s)`,
  },
  {
    checkId: "survives-the-builder",
    // Not software. Maintained by AI Pathway in a public repo, with the run
    // evidence beside it; it runs on the business's own Xero sign-in. The
    // runner never scores that green on its own say-so.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by the business's own evidence, not by a run",
  },
];

// Live only. Run by hand in the business's own Xero file: one invoice draft,
// one bill draft and one a cent out, the build run before and after a named
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

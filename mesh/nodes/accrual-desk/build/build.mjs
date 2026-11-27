/**
 * Accrual Desk: the build for ledger-write-preview-build-standard.
 *
 * Each month at month end it drafts the accrual journals the month needs and
 * puts every one through the preview before anything goes near the ledger.
 *
 * Two stages:
 *
 *   draftAccruals(sources)   turns the month's sources into manual journal
 *                            drafts: costs received without a bill yet (the
 *                            list the person keeps, and recurring bills that
 *                            did not arrive this month) and revenue earned but
 *                            not invoiced (completed work not yet billed), each
 *                            with its reversal dated the first of next month.
 *                            It writes nothing.
 *
 *   build(ports)             the standard's loop over those drafts:
 *     1. reads the ledger's own tax rates once, before any preview;
 *     2. works every journal line out again from quantity, unit price and
 *        discount, never from the amount the draft states, and checks the
 *        tax type on each line is one the ledger holds at a rate of zero;
 *     3. parks a journal a cent out, naming a tax type the ledger does not
 *        hold, or whose debits and credits differ, with both sets of figures;
 *     4. puts every other journal in the preview book for a named person;
 *     5. for a preview a named person released (and only then, and never on a
 *        dry run), reads the ledger for the preview's key, writes once if it
 *        is not there, reads the journal back and compares its stored totals.
 *        A reversal is written only after its accrual has read back equal.
 *
 * It never pays, approves, posts or lodges anything on its own: every write is
 * a journal a person released. In production the preview comes from
 * preview_draft on the AI Pathway connector (connect.aipathway.com.au); the
 * arithmetic here is the same arithmetic, so the stub run proves the order and
 * the rules around it. Money is whole cents.
 */

/** Round to the cent, half away from zero, with float noise taken off first. */
export function roundCents(x) {
  const a = Math.round(Math.abs(x) * 1e6) / 1e6;
  return Math.sign(x) * Math.round(a);
}

/** Quantity x unit price less discount, rounded to the cent. */
export function lineAmount(l) {
  return roundCents(l.quantity * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100));
}

// ---- stage 1: drafting the month's accruals --------------------------------------

const lastDay = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const firstOfNext = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};
const previousMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 2 - i, 1)).toISOString().slice(0, 7));
};

const worked = (l, side, taxType) => ({
  lineId: l.lineId,
  accountCode: l.accountCode,
  description: l.description,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  ...(l.discountPercent ? { discountPercent: l.discountPercent } : {}),
  taxType: l.taxType ?? taxType,
  debit: side === "debit" ? lineAmount(l) : 0,
  credit: side === "credit" ? lineAmount(l) : 0,
});

const control = (lineId, accountCode, amount, side, taxType, description) => ({
  lineId,
  accountCode,
  description,
  taxType,
  debit: side === "debit" ? amount : 0,
  credit: side === "credit" ? amount : 0,
});

const journalDraft = (draftId, date, narration, journalLines, statedTotal, extra = {}) => ({
  draftId,
  type: "manual_journal",
  contact: "",
  date,
  narration,
  amountType: "no_tax",
  lines: [],
  journalLines,
  stated: { subtotal: statedTotal, totalTax: 0, total: statedTotal },
  ...extra,
});

/** The reversal: the same lines on the other side, dated the first of next month. */
const reversalOf = (d, month) =>
  journalDraft(
    d.draftId.replace(/^ACR-/, "REV-"),
    firstOfNext(month),
    `Reversal of ${d.narration}`,
    d.journalLines.map((l) => ({ ...l, lineId: `${l.lineId}-R`, debit: l.credit, credit: l.debit })),
    d.stated.total,
    { reverses: d.draftId, source: d.source },
  );

/**
 * The month's accrual journals and their reversals, from the sources.
 *
 * sources: {
 *   month: "YYYY-MM",
 *   noTaxType: the ledger's own name for a line with no GST (Xero BASEXCLUDED),
 *   accounts: { accruedCosts, accruedIncome },
 *   costList:      the list the person keeps: { itemId, description, lines[], statedTotal, billArrived? }
 *                  or a split the person keyed as journal lines: { itemId, description, journalLines[], statedTotal }
 *   recurringBills: bill history read from the ledger: { supplierId, supplier, accountCode, bills: [{ month, subtotal }] }
 *   unbilledWork:  completed work not yet invoiced: { jobId, customer, lines[], statedTotal }
 * }
 */
export function draftAccruals(sources) {
  const { month, noTaxType, accounts } = sources;
  const date = lastDay(month);
  const accruals = [];

  for (const item of sources.costList ?? []) {
    if (item.billArrived) continue; // the bill is in; nothing to accrue
    const id = `ACR-${month}-${item.itemId}`;
    const narration = `Accrued cost, ${item.description}, ${month}`;
    const lines = item.journalLines
      ? item.journalLines.map((l) => ({ ...l, taxType: l.taxType ?? noTaxType }))
      : [
          ...item.lines.map((l) => worked(l, "debit", noTaxType)),
          control(`${item.itemId}-AC`, accounts.accruedCosts, item.lines.reduce((s, l) => s + lineAmount(l), 0), "credit", noTaxType, "Accrued costs"),
        ];
    accruals.push(journalDraft(id, date, narration, lines, item.statedTotal, { source: { kind: "cost_list", id: item.itemId } }));
  }

  // A supplier who billed in each of the three months before, and not this
  // month, is accrued at the latest month's amount before GST. A supplier with
  // a gap is not recurring and is left to the person's list.
  const before = previousMonths(month, 3);
  for (const s of sources.recurringBills ?? []) {
    const billed = new Set(s.bills.map((b) => b.month));
    if (billed.has(month) || !before.every((m) => billed.has(m))) continue;
    const latest = s.bills.filter((b) => b.month === before[0]).reduce((sum, b) => sum + b.subtotal, 0);
    const id = `ACR-${month}-${s.supplierId}`;
    const line = { lineId: `${s.supplierId}-1`, accountCode: s.accountCode, description: `${s.supplier}, no bill for ${month}`, quantity: 1, unitPrice: latest };
    accruals.push(
      journalDraft(
        id,
        date,
        `Accrued cost, ${s.supplier} (recurring bill not received), ${month}`,
        [worked(line, "debit", noTaxType), control(`${s.supplierId}-AC`, accounts.accruedCosts, latest, "credit", noTaxType, "Accrued costs")],
        latest,
        { source: { kind: "recurring_bill", id: s.supplierId, basis: before[0] } },
      ),
    );
  }

  for (const job of sources.unbilledWork ?? []) {
    const id = `ACR-${month}-${job.jobId}`;
    const lines = [
      control(`${job.jobId}-AI`, accounts.accruedIncome, job.lines.reduce((s, l) => s + lineAmount(l), 0), "debit", noTaxType, "Accrued income"),
      ...job.lines.map((l) => worked(l, "credit", noTaxType)),
    ];
    accruals.push(
      journalDraft(id, date, `Accrued revenue, ${job.customer}, job ${job.jobId} completed not invoiced, ${month}`, lines, job.statedTotal, {
        source: { kind: "unbilled_work", id: job.jobId },
      }),
    );
  }

  return [...accruals, ...accruals.map((d) => reversalOf(d, month))];
}

// ---- stage 2: the preview, the release, the write, the read-back -------------------

const balances = (journal) => journal.length > 0 && journal.reduce((s, l) => s + l.debit, 0) === journal.reduce((s, l) => s + l.credit, 0);
const totalsOf = (x) => ({ subtotal: x.subtotal, totalTax: x.totalTax, total: x.total });
const sameTotals = (a, b) => a.subtotal === b.subtotal && a.totalTax === b.totalTax && a.total === b.total;

/**
 * The preview for one accrual or reversal journal, from its inputs and the
 * ledger's rates. Returns { ok: true, preview } or { ok: false, kind, detail }.
 */
function recompute(draft, rates) {
  if (draft.type !== "manual_journal") {
    return { ok: false, kind: "unbalanced", detail: `Accrual Desk writes journals only; ${draft.draftId} is a ${draft.type}` };
  }
  const jl = draft.journalLines ?? [];

  // GST treatment: an accrual journal carries no GST; the GST comes on the
  // bill or invoice when it is raised. Each line names the ledger's own no-tax
  // type, which the ledger must hold at a rate of zero. Anything else is a
  // person's call, never a guess.
  if (rates === null) return { ok: false, kind: "unknown_tax_rate", detail: "the ledger did not answer the tax rates read" };
  for (const l of jl) {
    const r = rates.find((x) => x.taxType === l.taxType);
    if (!r) return { ok: false, kind: "unknown_tax_rate", detail: `line ${l.lineId}: the ledger holds no tax rate named ${l.taxType}` };
    if (r.rate !== 0) {
      return { ok: false, kind: "unknown_tax_rate", detail: `line ${l.lineId}: ${l.taxType} carries ${r.rate * 100}% in the ledger; an accrual line with GST goes to a person` };
    }
  }

  // Each worked line from its quantity, unit price and discount; a keyed line
  // (a control line, or a split the person typed) from the amount keyed.
  const journal = jl.map((l) => {
    const amount = typeof l.quantity === "number" ? lineAmount(l) : l.debit || l.credit;
    return l.debit > 0
      ?{ accountCode: l.accountCode, debit: amount, credit: 0 }
      : { accountCode: l.accountCode, debit: 0, credit: amount };
  });
  const debits = journal.reduce((s, l) => s + l.debit, 0);
  const credits = journal.reduce((s, l) => s + l.credit, 0);
  if (!balances(journal)) return { ok: false, kind: "unbalanced", detail: `debits ${debits} cents and credits ${credits} cents` };

  return {
    ok: true,
    preview: {
      lines: jl.map((l, i) => ({ lineId: l.lineId, amount: journal[i].debit || journal[i].credit, tax: 0 })),
      subtotal: debits,
      totalTax: 0,
      total: debits,
      journal,
    },
  };
}

const OWNER_ROLE = {
  totals_differ: "bookkeeper",
  unknown_tax_rate: "bookkeeper",
  unbalanced: "bookkeeper",
  readback_differs: "releaser",
  write_failed: "bookkeeper",
};

/**
 * @param {import("@aipathway/conformance").LedgerWritePreviewPorts} ports
 */
export async function build(ports) {
  const settings = await ports.readSettings();
  const drafts = await ports.readDrafts();
  const book = await ports.readBook();

  const ownerFor = (kind) => settings.owners[OWNER_ROLE[kind]];
  const park = async (item) => ports.park({ ...item, owner: ownerFor(item.kind) });

  // The ledger's own rates, read once before any preview.
  const ratesRead = await ports.readTaxRates();
  const rates = ratesRead.ok ? ratesRead.data : null;
  const ratesReadId = ratesRead.ok ? ratesRead.readId : null;

  const STOPS = new Set(["totals_differ", "unknown_tax_rate", "unbalanced", "readback_differs"]);

  // Accruals first, so a reversal can see its accrual land in the same run.
  const ordered = [...drafts.filter((d) => !d.reverses), ...drafts.filter((d) => d.reverses)];
  const landed = new Set(book.readBacks.filter((r) => r.matches).map((r) => r.draftId));

  for (const draft of ordered) {
    const id = draft.draftId;
    const previews = book.previews.filter((p) => p.draftId === id);
    if (book.parked.some((p) => p.draftId === id && STOPS.has(p.kind))) continue;

    // 1. Preview, or park. Once per journal.
    if (previews.length === 0) {
      const r = recompute(draft, rates);
      if (!r.ok) {
        await park({ draftId: id, kind: r.kind, detail: r.detail });
        continue;
      }
      const recomputed = totalsOf(r.preview);
      if (!sameTotals(draft.stated, recomputed)) {
        await park({
          draftId: id,
          kind: "totals_differ",
          detail: "the total on the source differs from the total worked out from its lines",
          stated: totalsOf(draft.stated),
          recomputed,
        });
        continue;
      }
      await ports.writePreview({ draftId: id, ratesReadId, ...r.preview });
      continue; // a fresh preview has no release yet
    }

    // 2. Write only the preview a named person released.
    const latest = previews[previews.length - 1];
    const release = book.releases.find(
      (x) => x.previewId === latest.previewId && x.draftId === id && typeof x.by === "string" && x.by.trim() !== "",
    );
    if (!release) continue;
    if (book.readBacks.some((x) => x.draftId === id)) continue; // done
    if (draft.reverses && !landed.has(draft.reverses)) continue; // never a reversal without its accrual
    if (settings.dryRun) continue;

    const { previewId, ...document } = latest;
    const key = `preview:${settings.tenant}:${id}:${previewId}`;

    // Read the ledger for the key before any write, so a write whose answer
    // was lost is found rather than written again.
    let stored = await ports.readDocument(key);
    if (!stored) {
      const res = await ports.writeDocument({ draftId: id, previewId, idempotencyKey: key, document });
      if (!res.ok) {
        await park({ draftId: id, kind: "write_failed", detail: `no answer from the ledger (${res.error}); it is read for ${key} before any retry` });
        continue;
      }
      stored = await ports.readDocument(key);
      if (!stored) {
        await park({ draftId: id, kind: "write_failed", detail: `the ledger answered ${res.documentId} but holds nothing for ${key}` });
        continue;
      }
    }

    // 3. Read back and compare, to the cent. A difference goes to a person.
    const ledger = totalsOf(stored);
    const preview = totalsOf(latest);
    const matches = sameTotals(ledger, preview);
    await ports.recordReadBack({ draftId: id, documentId: stored.documentId, previewId, matches, ledger, preview });
    if (matches) {
      landed.add(id);
    } else {
      await park({
        draftId: id,
        kind: "readback_differs",
        detail: `journal ${stored.documentId} stored totals that differ from the released preview`,
        recomputed: preview,
        ledger,
      });
    }
  }
}

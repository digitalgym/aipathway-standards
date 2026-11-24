/**
 * Draft Preview: the build for ledger-write-preview-build-standard.
 *
 * Another bot or a person hands over drafts to write into the client's ledger
 * (Xero): invoices, bills, credit notes, spend and receive money, manual
 * journals. Each run:
 *
 *   1. reads the ledger's own tax rates, once, before any preview;
 *   2. works every line, its tax, the totals and the journal out again from
 *      the draft's inputs, never from the figures the draft states;
 *   3. parks a draft that is a cent out, names a tax type the ledger does not
 *      hold, or whose journal does not balance, with both sets of figures;
 *   4. puts every other draft in the preview book for a named person;
 *   5. for a preview a named person released (and only then, and never on a
 *      dry run), reads the ledger for the preview's key, writes once if it is
 *      not there, reads the document back and compares its stored totals.
 *
 * In production the preview comes from preview_draft on the AI Pathway
 * connector (connect.aipathway.com.au); the arithmetic here is the same
 * arithmetic, so the stub run proves the order and the rules around it.
 *
 * Every call to the outside world goes through the ports. Money is whole cents.
 */

/** Round to the cent, half away from zero, with float noise taken off first. */
function roundCents(x) {
  const a = Math.round(Math.abs(x) * 1e6) / 1e6;
  return Math.sign(x) * Math.round(a);
}

function lineAmount(l) {
  return roundCents(l.quantity * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100));
}

function lineTax(amount, rate, amountType) {
  if (amountType === "no_tax") return 0;
  return amountType === "inclusive" ? roundCents((amount * rate) / (1 + rate)) : roundCents(amount * rate);
}

/** Which account takes the total, and on which side, for each document type. */
const CONTROL = {
  invoice: { account: "receivable", side: "debit" },
  credit_note: { account: "receivable", side: "credit" },
  bill: { account: "payable", side: "credit" },
  spend_money: { account: "bank", side: "credit" },
  receive_money: { account: "bank", side: "debit" },
};

const post = (accountCode, amount, side) =>
  side === "debit" ? { accountCode, debit: amount, credit: 0 } : { accountCode, debit: 0, credit: amount };

const balances = (journal) => journal.reduce((s, l) => s + l.debit, 0) === journal.reduce((s, l) => s + l.credit, 0);

const totalsOf = (x) => ({ subtotal: x.subtotal, totalTax: x.totalTax, total: x.total });
const sameTotals = (a, b) => a.subtotal === b.subtotal && a.totalTax === b.totalTax && a.total === b.total;

/**
 * The preview for one draft, from its inputs and the ledger's rates.
 * Returns { ok: true, preview } or { ok: false, kind, detail }.
 */
function recompute(draft, rates, accounts) {
  if (draft.type === "manual_journal") {
    const jl = draft.journalLines ?? [];
    const debits = jl.reduce((s, l) => s + l.debit, 0);
    const credits = jl.reduce((s, l) => s + l.credit, 0);
    if (debits !== credits) {
      return { ok: false, kind: "unbalanced", detail: `debits ${debits} cents and credits ${credits} cents` };
    }
    return {
      ok: true,
      preview: {
        lines: jl.map((l) => ({ lineId: l.lineId, amount: l.debit || l.credit, tax: 0 })),
        subtotal: debits,
        totalTax: 0,
        total: debits,
        journal: jl.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit })),
      },
    };
  }

  const lines = [];
  for (const l of draft.lines) {
    const amount = lineAmount(l);
    let tax = 0;
    if (draft.amountType !== "no_tax") {
      if (rates === null) {
        return { ok: false, kind: "unknown_tax_rate", detail: "the ledger did not answer the tax rates read" };
      }
      const r = rates.find((x) => x.taxType === l.taxType);
      if (!r) {
        return { ok: false, kind: "unknown_tax_rate", detail: `line ${l.lineId}: the ledger holds no tax rate named ${l.taxType}` };
      }
      tax = lineTax(amount, r.rate, draft.amountType);
    }
    lines.push({ lineId: l.lineId, amount, tax });
  }

  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const totalTax = lines.reduce((s, l) => s + l.tax, 0);
  const subtotal = draft.amountType === "inclusive" ? sum - totalTax : sum;
  const total = subtotal + totalTax;

  const control = CONTROL[draft.type];
  const lineSide = control.side === "debit" ? "credit" : "debit";
  const journal = [post(accounts[control.account], total, control.side)];
  draft.lines.forEach((l, i) => {
    const beforeTax = lines[i].amount - (draft.amountType === "inclusive" ? lines[i].tax : 0);
    journal.push(post(l.accountCode, beforeTax, lineSide));
  });
  if (totalTax !== 0) journal.push(post(accounts.tax, totalTax, lineSide));

  if (!balances(journal)) {
    return { ok: false, kind: "unbalanced", detail: "the journal lines do not balance" };
  }
  return { ok: true, preview: { lines, subtotal, totalTax, total, journal } };
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

  // The ledger's own rates, read once before any preview. No answer means no
  // rate: a taxed draft is parked, never given 10%.
  const ratesRead = await ports.readTaxRates();
  const rates = ratesRead.ok ? ratesRead.data : null;
  const ratesReadId = ratesRead.ok ? ratesRead.readId : null;

  const STOPS = new Set(["totals_differ", "unknown_tax_rate", "unbalanced", "readback_differs"]);

  for (const draft of drafts) {
    const id = draft.draftId;
    const previews = book.previews.filter((p) => p.draftId === id);
    const stopped = book.parked.some((p) => p.draftId === id && STOPS.has(p.kind));
    if (stopped) continue;

    // 1. Preview, or park. Once per draft.
    if (previews.length === 0) {
      const r = recompute(draft, rates, settings.accounts);
      if (!r.ok) {
        await park({ draftId: id, kind: r.kind, detail: r.detail });
        continue;
      }
      const recomputed = totalsOf(r.preview);
      if (!sameTotals(draft.stated, recomputed)) {
        await park({
          draftId: id,
          kind: "totals_differ",
          detail: "the draft's stated totals differ from the totals worked out from its lines",
          stated: totalsOf(draft.stated),
          recomputed,
        });
        continue;
      }
      if (ratesReadId === null && draft.type !== "manual_journal" && draft.amountType !== "no_tax") continue;
      await ports.writePreview({ draftId: id, ratesReadId: ratesReadId ?? "none", ...r.preview });
      continue; // a fresh preview has no release yet
    }

    // 2. Write only the preview a named person released.
    const latest = previews[previews.length - 1];
    const release = book.releases.find(
      (x) => x.previewId === latest.previewId && x.draftId === id && typeof x.by === "string" && x.by.trim() !== "",
    );
    if (!release) continue;
    if (book.readBacks.some((x) => x.draftId === id)) continue; // done
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
    if (!matches) {
      await park({
        draftId: id,
        kind: "readback_differs",
        detail: `document ${stored.documentId} stored totals that differ from the released preview`,
        recomputed: preview,
        ledger,
      });
    }
  }
}

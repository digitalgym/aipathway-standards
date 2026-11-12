/**
 * BAS Check, built to AIP-BS-BAS-READY-CHECK 2026-11-12.
 *
 * Before a BAS period is lodged, read the period from the client's ledger
 * (Xero, MYOB Business or QuickBooks Online) read only, run the GST checks in
 * the standard's order, and hand one exceptions list to the named bookkeeper
 * or BAS agent: Ready (no flags) or Not ready with the flags to look at. Every
 * line flag cites the ledger's own transaction id, read back with its date and
 * total; a flag that does not read back is dropped. What the ledger could not
 * be read for is listed under not checked, never guessed.
 *
 * It never writes to the ledger, never changes a tax code, never lodges and
 * never says what a code should be. A person decides and lodges.
 *
 * Everything goes through the ports it is handed. Every port call is awaited,
 * so the same build runs against the stub and a real ledger.
 */

const PURCHASE = new Set(["bill", "spend"]);
const CODED_KINDS = new Set(["bill", "spend", "invoice", "receive"]);

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `$${round2(n).toFixed(2)}`;
const inRange = (d, r) => d >= r.from && d <= r.to;
const who = (t) => t.contactName ?? t.contactId ?? "no contact";

/** The figures for a period, worked out from its coded lines. */
function fromLines(txns, codes) {
  let totalSales = 0;
  let gstOnSales = 0;
  let gstOnPurchases = 0;
  for (const t of txns) {
    for (const l of t.lines) {
      const c = codes.get(l.taxCode);
      if (!c) continue;
      if (c.onSales) {
        totalSales += l.amount;
        gstOnSales += l.gst;
      } else if (c.claimsCredit) {
        gstOnPurchases += l.gst;
      }
    }
  }
  return { totalSales: round2(totalSales), gstOnSales: round2(gstOnSales), gstOnPurchases: round2(gstOnPurchases) };
}

/** The most common code in a set of prior lines, if it is clear and seen often enough. */
function usualOf(lines, minHistory) {
  if (lines.length < Math.max(1, minHistory)) return null;
  const counts = new Map();
  for (const code of lines) counts.set(code, (counts.get(code) ?? 0) + 1);
  const [code, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  // A clear usual code: more than half the prior lines, and at least the minimum.
  if (count * 2 <= lines.length || count < minHistory) return null;
  return { code, count };
}

/**
 * @param {import("@aipathway/conformance").BasPorts} ports
 */
export async function build(ports) {
  const asOf = (await ports.now()).toISOString();
  const s = await ports.readSettings();
  const caps = await ports.readCapabilities();
  const codes = new Map((await ports.readTaxCodes()).map((c) => [c.code, c]));
  const accounts = new Map((await ports.readAccounts()).map((a) => [a.code, a]));
  const period = { from: s.period.from, to: s.period.to };

  // 1. The period, by the ledger's own ids and dates. A transaction dated
  // outside it is not looked at, whatever the read returned.
  const txns = (await ports.readTransactions(period.from, period.to)).filter((t) => inRange(t.date, period));
  const byId = new Map(txns.map((t) => [t.txnId, t]));

  const candidates = [];
  const notChecked = [];
  const skip = (kind, why) => {
    if (!notChecked.some((n) => n.kind === kind)) notChecked.push({ kind, why });
  };
  const flagLine = (kind, t, evidence, why, extra = {}) => {
    if (candidates.some((c) => c.kind === kind && c.ids.includes(t.txnId))) return;
    candidates.push({ kind, ids: [t.txnId], evidence, why, ...extra });
  };

  // 3. Tax invoice held.
  if (!caps.attachments) {
    skip("tax_invoice", "This ledger's API does not say whether a document is attached, so no purchase was flagged either way.");
  } else {
    for (const t of txns.filter((x) => PURCHASE.has(x.kind))) {
      const credit = round2(t.lines.filter((l) => codes.get(l.taxCode)?.claimsCredit).reduce((a, l) => a + l.gst, 0));
      if (credit <= 0 || !(t.total > s.taxInvoiceThreshold)) continue;
      if (t.hasAttachment === undefined) {
        skip("tax_invoice", "The ledger did not say whether a document is attached on one or more purchases; those were not flagged either way.");
        continue;
      }
      if (t.hasAttachment === false) {
        flagLine(
          "tax_invoice",
          t,
          `${who(t)}, ${money(t.total)}, GST of ${money(credit)} claimed, no document attached in the ledger.`,
          `GST claimed on a purchase above the ${money(s.taxInvoiceThreshold)} tax invoice threshold set for this business, with no document attached.`,
        );
      }
    }
  }

  // 4. A code unlike the supplier's, or failing that the account's, usual code.
  const history = (await ports.readTransactions(s.history.from, s.history.to)).filter(
    (t) => inRange(t.date, s.history) && t.date < period.from && PURCHASE.has(t.kind),
  );
  const bySupplier = new Map();
  const byAccount = new Map();
  for (const t of history) {
    for (const l of t.lines) {
      if (!l.taxCode || codes.get(l.taxCode)?.onSales) continue;
      if (t.contactId) bySupplier.set(t.contactId, [...(bySupplier.get(t.contactId) ?? []), l.taxCode]);
      byAccount.set(l.accountCode, [...(byAccount.get(l.accountCode) ?? []), l.taxCode]);
    }
  }
  let thinHistory = 0;
  for (const t of txns.filter((x) => PURCHASE.has(x.kind))) {
    for (const l of t.lines) {
      if (!l.taxCode || codes.get(l.taxCode)?.onSales) continue;
      if (accounts.get(l.accountCode)?.type === "gst_control") continue;
      const fromSupplier = t.contactId ? usualOf(bySupplier.get(t.contactId) ?? [], s.minHistory) : null;
      const usual = fromSupplier ?? usualOf(byAccount.get(l.accountCode) ?? [], s.minHistory);
      if (!usual) {
        thinHistory += 1;
        continue;
      }
      if (usual.code !== l.taxCode) {
        const basis = fromSupplier ? `${who(t)}` : `account ${l.accountCode}`;
        flagLine(
          "usual_code",
          t,
          `${who(t)}, coded ${l.taxCode} on account ${l.accountCode}. ${basis} carried ${usual.code} on ${usual.count} prior lines from ${s.history.from} to ${s.history.to}.`,
          `The code on this line differs from the usual code for ${basis} in the history window set for this business.`,
          { usual },
        );
      }
    }
  }
  if (thinHistory > 0) {
    skip("usual_code", `${thinHistory} purchase line(s) had fewer than ${s.minHistory} prior lines for the supplier or the account, so no usual code was compared.`);
  }

  // 5. GST claimed on an account the business marked as carrying no GST.
  const noGst = new Set(s.noGstAccounts);
  for (const t of txns.filter((x) => PURCHASE.has(x.kind))) {
    for (const l of t.lines) {
      if (!noGst.has(l.accountCode) || !codes.get(l.taxCode)?.claimsCredit || !(l.gst > 0)) continue;
      const name = accounts.get(l.accountCode)?.name ?? l.accountCode;
      flagLine(
        "no_gst_account",
        t,
        `${who(t)}, GST of ${money(l.gst)} claimed in account ${l.accountCode} ${name}.`,
        "This account is on the no-GST list set by the business or its BAS agent.",
      );
    }
  }

  // 6. Capital coded capital, under full reporting only.
  if (s.reporting !== "full") {
    skip("capital", "The business reports on simpler BAS, so G10 and G11 are not reported and capital coding was not checked.");
  } else {
    for (const t of txns.filter((x) => PURCHASE.has(x.kind))) {
      for (const l of t.lines) {
        const c = codes.get(l.taxCode);
        const type = accounts.get(l.accountCode)?.type;
        if (!c) continue;
        if (type === "fixed_asset" && !c.capital) {
          flagLine("capital", t, `${who(t)}, account ${l.accountCode} ${accounts.get(l.accountCode).name} on non-capital code ${l.taxCode}.`, "A purchase in a fixed asset account carries a non-capital GST code.");
        } else if (type === "expense" && c.capital) {
          flagLine("capital", t, `${who(t)}, account ${l.accountCode} ${accounts.get(l.accountCode).name} on capital code ${l.taxCode}.`, "A purchase in an expense account carries a capital GST code.");
        }
      }
    }
  }

  // 7. Uncoded lines and unreconciled bank transactions.
  for (const t of txns.filter((x) => CODED_KINDS.has(x.kind))) {
    if (t.lines.some((l) => !l.taxCode)) {
      flagLine("uncoded", t, `${who(t)}, ${money(t.total)}, a line with no tax code.`, "A bill, spend, invoice or receive line in the period carries no tax code.");
    }
  }
  if (!caps.reconciliation) {
    skip("reconciliation", "This ledger's API does not say whether a bank transaction is reconciled, so none was flagged either way.");
  } else {
    for (const t of txns.filter((x) => x.bank)) {
      if (t.reconciled === undefined) {
        skip("reconciliation", "The ledger did not say whether one or more bank transactions are reconciled; those were not flagged either way.");
      } else if (t.reconciled === false) {
        flagLine("unreconciled", t, `${who(t)}, ${money(t.total)}, not reconciled in the ledger.`, "A bank transaction dated in the period is shown by the ledger as not reconciled.");
      }
    }
  }

  // 8. Swings against the comparable period, each side read the same way.
  const comparable = { from: s.comparable.from, to: s.comparable.to };
  const reportNow = await ports.readGstReport(period.from, period.to);
  const reportThen = await ports.readGstReport(comparable.from, comparable.to);
  const viaReport = Boolean(reportNow && reportThen);
  let now;
  let then;
  if (viaReport) {
    now = reportNow;
    then = reportThen;
  } else {
    const thenTxns = (await ports.readTransactions(comparable.from, comparable.to)).filter((t) => inRange(t.date, comparable));
    now = fromLines(txns, codes);
    then = fromLines(thenTxns, codes);
    skip("gst_report", "This ledger offers no GST report through its API, so the period figures were worked out from the coded lines.");
  }
  const MEASURE = { total_sales: "totalSales", gst_on_sales: "gstOnSales", gst_on_purchases: "gstOnPurchases" };
  const LABEL = { total_sales: "Total sales", gst_on_sales: "GST on sales", gst_on_purchases: "GST on purchases" };
  for (const [measure, key] of Object.entries(MEASURE)) {
    const a = round2(now[key]);
    const b = round2(then[key]);
    const pct = b === 0 ? (a === 0 ? 0 : null) : ((a - b) / Math.abs(b)) * 100;
    if (pct !== null && Math.abs(pct) <= s.swingBand) continue;
    candidates.push({
      kind: "swing",
      ids: [],
      period,
      comparable,
      evidence: `${LABEL[measure]}: ${money(a)} for ${period.from} to ${period.to}, ${money(b)} for ${comparable.from} to ${comparable.to}${viaReport ? ", from the ledger's GST report" : ", worked out from the coded lines"}.`,
      why: `The move is ${pct === null ? "from nil" : `${round2(pct)} percent`}, outside the ${s.swingBand} percent band set for this business.`,
      figures: { measure, now: a, then: b, change: round2(a - b), changePercent: pct === null ? null : round2(pct) },
    });
  }

  // 9. The GST control account against the GST the transactions report.
  const control = [...accounts.values()].filter((a) => a.type === "gst_control");
  if (control.length > 0) {
    let movement = 0;
    for (const a of control) movement += await ports.readAccountMovement(a.code, period.from, period.to);
    movement = round2(movement);
    const expected = round2(now.gstOnSales - now.gstOnPurchases);
    const diff = round2(movement - expected);
    if (Math.abs(diff) >= 0.01) {
      const direct = txns.filter((t) => t.lines.some((l) => control.some((a) => a.code === l.accountCode)));
      candidates.push({
        kind: "control_account",
        ids: direct.map((t) => t.txnId),
        period,
        evidence: `The GST account moved ${money(movement)}; GST on sales less purchases is ${money(expected)}${viaReport ? " from the ledger's GST report" : " worked out from the coded lines"}. ${direct.length ? `Posted straight to the GST account: ${direct.map((t) => t.txnId).join(", ")}.` : "No transaction posted straight to the GST account was found."}`,
        why: "The GST account's movement for the period differs from the GST on the period's transactions.",
        figures: { now: movement, then: expected, change: diff },
      });
    }
  }

  // 2. The gate: every cited transaction reads back with the date and total
  // the flag states, or the flag is dropped.
  const flags = [];
  for (const c of candidates) {
    const cites = [];
    let ok = true;
    for (const id of c.ids) {
      const read = await ports.cite(id);
      const seen = byId.get(id);
      if (!read || !seen || read.date !== seen.date || round2(read.total) !== round2(seen.total) || !inRange(read.date, period)) {
        ok = false;
        break;
      }
      cites.push({ txnId: read.txnId, date: read.date, total: read.total });
    }
    const lineFlag = c.kind !== "swing" && c.kind !== "control_account";
    if (!ok || (lineFlag && cites.length === 0)) continue;
    const { ids, ...rest } = c;
    flags.push({ ...rest, cites, asOf, source: `${s.ledger} ledger, read only` });
  }

  // 11. One list, to the named person, once. Nothing written, nothing lodged.
  await ports.publish({
    period,
    ledger: s.ledger,
    reviewer: s.reviewer,
    // Ready only when nothing is flagged and nothing went unchecked.
    status: flags.length > 0 ? "Not ready" : notChecked.length > 0 ? "Ready on what could be checked" : "Ready",
    asOf,
    flags,
    notChecked,
  });
}

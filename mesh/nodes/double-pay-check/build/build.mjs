/**
 * Double Pay Check: the build.
 *
 * Every Thursday before the pay run, each supplier bill that is approved and
 * awaiting payment at the cutoff is compared with the other bills awaiting
 * payment and the bills paid in the lookback window, and held when it looks
 * like the same bill twice or a payment to a changed or shared bank account.
 *
 * It reads the ledger and the hold book, raises holds and records one result
 * per bill. It never calls writeBill: it does not pay, approve, void or edit a
 * bill, and it never changes bank details. A person releases or voids each
 * hold; this build only reads that decision on the next run.
 *
 * Built to AIP-BS-DUPLICATE-BILL-HOLD,
 * https://aipathway.com.au/explore-ai/duplicate-bill-hold-build-standard
 */

const DAY = 86_400_000;

/** Upper case, letters and digits only, leading zeros off each run of digits: INV-0042 and inv 42 are the same. */
export function cleanNumber(n) {
  if (!n) return null;
  const s = String(n)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ""));
  return s.length ? s : null;
}

/** BSB and account as digits only, so spacing and dashes never hide a match. */
export function cleanAccount(a) {
  if (!a) return null;
  const s = String(a).replace(/\D/g, "");
  return s.length ? s : null;
}

const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const daysApart = (a, b) => Math.abs(dayMs(a) - dayMs(b)) / DAY;
const minusDays = (d, n) => new Date(dayMs(d) - n * DAY).toISOString().slice(0, 10);

/** One bill as the hold shows it. A bill awaiting payment shows the account on its supplier record now; a paid bill the account it was paid to. */
function view(b, supplierById) {
  return {
    billId: b.billId,
    supplierId: b.supplierId,
    supplierName: b.supplierName,
    invoiceNumber: b.invoiceNumber ?? null,
    date: b.date,
    total: b.total,
    status: b.status,
    paidDate: b.paidDate ?? null,
    bankAccount: b.status === "paid" ? (b.paidToAccount ?? null) : supplierById ? (supplierById.get(b.supplierId)?.bankAccount ?? null) : null,
  };
}

const keyOf = (rule, billIds, otherSupplierId) => `${rule}|${[...billIds].sort().join(",")}|${otherSupplierId ?? ""}`;

/**
 * What a hold was raised on: each bill's total, invoice number and (when the
 * bank details could be read) bank account. A change to any of them makes a
 * released pair new again.
 */
function fingerprintOf(bills, otherSupplier, withBank) {
  const parts = [...bills]
    .sort((a, b) => a.billId.localeCompare(b.billId))
    .map((b) => `${b.billId}:${b.total}:${cleanNumber(b.invoiceNumber) ?? ""}${withBank ? `:${cleanAccount(b.bankAccount) ?? ""}` : ""}`);
  if (otherSupplier && withBank) parts.push(`other:${cleanAccount(otherSupplier.bankAccount) ?? ""}`);
  return parts.join(";");
}

const RULE_WORDS = {
  same_invoice_number: "same supplier, same invoice number",
  same_amount_in_window: "same supplier, same total within the window",
  supplier_entered_twice: "same invoice number and total on a second supplier record",
  bank_changed: "bank account changed since this supplier was last paid",
  bank_shared: "bank account is on another supplier's record too",
};

/**
 * @param {import("@aipathway/conformance").DuplicateBillHoldPorts} ports
 */
export function build(ports) {
  const settings = ports.readSettings();
  const cutoff = settings.cutoff;
  const since = minusDays(cutoff.slice(0, 10), settings.lookbackDays);

  // 1. Fix the list of bills to check before any comparing starts.
  const unpaid = ports.readBills();
  if (!unpaid.ok) return; // Nothing known to be in scope; nothing can be called clear.
  const scope = unpaid.data.filter((b) => b.status === "awaiting_payment" && b.enteredAt <= cutoff);

  const paid = ports.readPaidBills(since);
  const suppliersRead = ports.readSuppliers();
  const existing = ports.readHolds();

  // 8. What could not be read in full. Any of these means no bill is called clear.
  const missing = [];
  if (!paid.ok) missing.push(`paid bills could not be read (${paid.reason})`);
  else if (paid.truncated) missing.push("paid bills came back cut short");
  if (!suppliersRead.ok) missing.push(`supplier bank details could not be read (${suppliersRead.reason})`);
  const bankReadable = suppliersRead.ok;
  const supplierById = bankReadable ? new Map(suppliersRead.data.map((s) => [s.supplierId, s])) : null;

  const paidBills = paid.ok ? paid.data.filter((b) => b.status === "paid" && (b.paidDate ?? "") >= since) : [];
  const comparable = [...unpaid.data.filter((b) => b.status === "awaiting_payment"), ...paidBills];

  // 2 to 5. Every rule on every bill in scope. A pair both awaiting payment is one hold.
  const found = new Map();
  const add = (rule, bills, otherSupplier) => {
    const key = keyOf(rule, bills.map((b) => b.billId), otherSupplier?.supplierId);
    if (!found.has(key)) found.set(key, { rule, bills, otherSupplier });
  };

  for (const b of scope) {
    const nb = cleanNumber(b.invoiceNumber);
    for (const c of comparable) {
      if (c.billId === b.billId) continue;
      const sameNumber = nb !== null && nb === cleanNumber(c.invoiceNumber);
      if (c.supplierId === b.supplierId) {
        if (sameNumber) add("same_invoice_number", [b, c]);
        else if (c.total === b.total && daysApart(b.date, c.date) <= settings.windowDays) add("same_amount_in_window", [b, c]);
      } else if (sameNumber && c.total === b.total) {
        add("supplier_entered_twice", [b, c]);
      }
    }

    if (!bankReadable) continue;
    const account = cleanAccount(supplierById.get(b.supplierId)?.bankAccount);
    if (!account) continue;
    const lastPaid = paidBills
      .filter((p) => p.supplierId === b.supplierId && cleanAccount(p.paidToAccount))
      .sort((x, y) => (y.paidDate ?? "").localeCompare(x.paidDate ?? ""))[0];
    if (lastPaid && cleanAccount(lastPaid.paidToAccount) !== account) add("bank_changed", [b, lastPaid]);
    for (const other of suppliersRead.data) {
      if (other.supplierId !== b.supplierId && cleanAccount(other.bankAccount) === account) add("bank_shared", [b], other);
    }
  }

  // 6 and 9. Raise each pair once per state of its bills, both bills side by side.
  const holdsNow = [...existing];
  for (const [key, f] of found) {
    const views = f.bills.map((b) => view(b, supplierById));
    const other = f.otherSupplier ? { supplierId: f.otherSupplier.supplierId, name: f.otherSupplier.name, bankAccount: f.otherSupplier.bankAccount } : undefined;
    const print = fingerprintOf(views, other, bankReadable);
    const already = existing.some(
      (h) => keyOf(h.rule, h.bills.map((v) => v.billId), h.otherSupplier?.supplierId) === key && fingerprintOf(h.bills, h.otherSupplier, bankReadable) === print,
    );
    if (already) continue;
    const named = views.map((v) => `${v.supplierName} ${v.invoiceNumber ?? "(no number)"} $${(v.total / 100).toFixed(2)} ${v.status}`).join(" and ");
    const hold = {
      rule: f.rule,
      bills: views,
      ...(other ? { otherSupplier: other } : {}),
      owner: settings.owner,
      detail:
        `Held: ${RULE_WORDS[f.rule]}. ${named}${other ? `; same account as ${other.name}` : ""}. ` +
        (f.rule === "bank_changed" || f.rule === "bank_shared"
          ? "Ring the supplier on a number already on file from before the change, never one from the bill or its email, before releasing."
          : "Release or void it in the ledger; this check changes nothing."),
    };
    const { holdId } = ports.raiseHold(hold);
    holdsNow.push({ ...hold, holdId, decision: null });
  }

  // 7 and 8. One result per bill in scope: held while any hold on it waits for a
  // person; never clear when the ledger was read only in part.
  for (const b of scope) {
    const onBill = holdsNow.filter((h) => h.bills.some((v) => v.billId === b.billId));
    const open = onBill.filter((h) => !h.decision);
    if (open.length > 0) {
      ports.recordResult({ billId: b.billId, status: "held", holdIds: open.map((h) => h.holdId), reason: [...new Set(open.map((h) => h.rule))].join(", ") });
    } else if (missing.length > 0) {
      ports.recordResult({ billId: b.billId, status: "not_checked", holdIds: [], reason: missing.join("; ") });
    } else {
      ports.recordResult({ billId: b.billId, status: "clear", holdIds: [] });
    }
  }
}

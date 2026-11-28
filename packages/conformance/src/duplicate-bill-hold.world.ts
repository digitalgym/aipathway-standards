// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/duplicate-bill-hold.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The duplicate bill hold world: a ledger's supplier bills (drafts, bills
 * awaiting approval, approved bills awaiting payment, paid bills and voided
 * ones), the supplier records with their bank details, a hold book the build
 * fills, and the person who releases or voids each hold.
 *
 * THE CHECK IS READ ONLY. The world offers a ledger write port (`writeBill`)
 * because a real connection with write scope offers one too. It lands, the
 * way it would live, and a conforming build never calls it.
 *
 * THE DECISION IS THE WORLD'S. A person releases a hold, or voids the bill in
 * the ledger, by an event between runs (`decide`). No port can release, so a
 * build can only read the decision, with the person's name and the time.
 *
 * A READ CAN BE PARTIAL. `truncatePaidRead` makes the paid bills read return
 * the most recent half with `truncated: true`, and `bankDetailsUnavailable`
 * makes the supplier read fail, the way a connection without that scope does.
 * A build that reports a bill clear on either is caught by check 8.
 *
 * EACH `ports()` OBJECT A BUILD USES IS ONE RUN. The world snapshots which
 * bills were in scope at the start of each run, so a check can hold the
 * results of a run to the bills that were awaiting payment when it started.
 *
 * MONEY IS WHOLE CENTS. Dates are YYYY-MM-DD.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const BILL_STATUSES = ["draft", "awaiting_approval", "awaiting_payment", "paid", "voided"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** The rules a hold can fire under, in the order the standard numbers them (checks 2 to 5). */
export const HOLD_RULES = ["same_invoice_number", "same_amount_in_window", "supplier_entered_twice", "bank_changed", "bank_shared"] as const;
export type HoldRule = (typeof HOLD_RULES)[number];

export const RESULT_STATUSES = ["clear", "held", "not_checked"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export interface Bill {
  billId: string;
  /** The ledger's contact id for the supplier. Names are not compared. */
  supplierId: string;
  supplierName: string;
  /** The supplier's own invoice number, as entered. Null when none was entered. */
  invoiceNumber: string | null;
  /** Issue date. */
  date: string;
  /** Cents. */
  total: number;
  status: BillStatus;
  /** When the bill was entered into the ledger, ISO. */
  enteredAt: string;
  /** Paid bills only. */
  paidDate?: string;
  /** Paid bills only: the account the money went to. */
  paidToAccount?: string;
}

export interface Supplier {
  supplierId: string;
  name: string;
  /** BSB and account number as the ledger holds them now, or null when none is on file. */
  bankAccount: string | null;
}

/** One bill as a hold shows it, side by side with the other. */
export interface BillView {
  billId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string | null;
  date: string;
  total: number;
  status: BillStatus;
  paidDate: string | null;
  /** For a bill awaiting payment, the account on the supplier record now; for a paid bill, the account it was paid to. */
  bankAccount: string | null;
}

export interface NewHold {
  rule: HoldRule;
  /** The bill held and the bill it looks like, side by side. One bill for bank_shared. */
  bills: BillView[];
  /** bank_shared only: the other supplier whose record holds the same account. */
  otherSupplier?: { supplierId: string; name: string; bankAccount: string };
  owner: string;
  detail: string;
}

export interface Decision {
  action: "release" | "void";
  by: string;
  at: string;
  /** void only: the bill the person voided in the ledger. */
  billId?: string;
}

export interface Hold extends NewHold {
  holdId: string;
  raisedAt: string;
  decision: Decision | null;
}

export interface BillResult {
  billId: string;
  status: ResultStatus;
  holdIds: string[];
  /** For not_checked: what could not be read. For held: the rules fired. */
  reason?: string;
}

export interface Settings {
  tenant: string;
  ledger: "xero" | "myob" | "qbo";
  /** The pay run this check runs before. */
  payRunDay: string;
  /** Bills entered after this time wait for the next run. ISO. */
  cutoff: string;
  /** Rule 3: same supplier, same total, issue dates this many days apart or fewer. */
  windowDays: number;
  /** How far back paid bills are compared, from the cutoff. */
  lookbackDays: number;
  /** Who works the holds. The business names the person. */
  owner: string;
}

export type Read<T> =
  | { ok: true; readId: string; asAt: string; data: T; truncated: boolean }
  | { ok: false; reason: string };

export interface DuplicateBillHoldPorts {
  now(): Date;
  readSettings(): Settings;
  /** Every bill not yet paid or voided: drafts, awaiting approval and awaiting payment, with status. */
  readBills(): Read<Bill[]>;
  /** Bills paid in full on or after `since` (YYYY-MM-DD), most recently paid first. */
  readPaidBills(since: string): Read<Bill[]>;
  /** Supplier records with their bank details. */
  readSuppliers(): Read<Supplier[]>;
  /** Every hold raised so far, with a person's decision where there is one. */
  readHolds(): Hold[];
  /** One hold for a person. Not a ledger write. */
  raiseHold(h: NewHold): { holdId: string };
  /** This run's answer for one bill in scope. */
  recordResult(r: BillResult): void;
  /** A write to a bill in the ledger. A conforming build never calls it. */
  writeBill(billId: string, change: Record<string, unknown>): { ok: true };
}

// ---- the comparisons the standard names ------------------------------------------

/** Upper case, everything but letters and digits removed, leading zeros taken off each run of digits. */
export function normaliseInvoiceNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  const s = n.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ""));
  return s.length ? s : null;
}

/** Digits only, so "063-000 1234 5678" and "0630001234 5678" are the same account. */
export function normaliseBankAccount(a: string | null | undefined): string | null {
  if (!a) return null;
  const s = a.replace(/\D/g, "");
  return s.length ? s : null;
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** In scope: approved and awaiting payment, entered by the cutoff. Drafts and bills awaiting approval are not. */
export function inScope(b: Bill, cutoff: string): boolean {
  return b.status === "awaiting_payment" && b.enteredAt <= cutoff;
}

export function viewOf(b: Bill, suppliers: readonly Supplier[]): BillView {
  return {
    billId: b.billId,
    supplierId: b.supplierId,
    supplierName: b.supplierName,
    invoiceNumber: b.invoiceNumber,
    date: b.date,
    total: b.total,
    status: b.status,
    paidDate: b.paidDate ?? null,
    bankAccount: b.status === "paid" ? b.paidToAccount ?? null : suppliers.find((s) => s.supplierId === b.supplierId)?.bankAccount ?? null,
  };
}

export interface ExpectedHold {
  rule: HoldRule;
  billIds: string[];
  otherSupplierId?: string;
}

/** The one key a hold is raised under: the rule, the bills (sorted) and any other supplier. */
export function holdKey(h: { rule: HoldRule; billIds: readonly string[]; otherSupplierId?: string }): string {
  return `${h.rule}|${[...h.billIds].sort().join(",")}|${h.otherSupplierId ?? ""}`;
}

/** What a released hold was released on: each bill's total, invoice number and bank account. A change to any raises it again. */
export function fingerprint(bills: readonly BillView[], otherSupplier?: { bankAccount: string } | null): string {
  const parts = [...bills]
    .sort((a, b) => a.billId.localeCompare(b.billId))
    .map((b) => `${b.billId}:${b.total}:${normaliseInvoiceNumber(b.invoiceNumber) ?? ""}:${normaliseBankAccount(b.bankAccount) ?? ""}`);
  if (otherSupplier) parts.push(`other:${normaliseBankAccount(otherSupplier.bankAccount) ?? ""}`);
  return parts.join(";");
}

/**
 * Every hold the standard requires on these bills, from the bills alone.
 *
 * Each bill in scope is compared with every other bill awaiting payment and
 * every bill paid on or after the lookback day. A pair of bills both awaiting
 * payment is one hold, not two.
 */
export function findDuplicates(bills: readonly Bill[], suppliers: readonly Supplier[], settings: Settings): ExpectedHold[] {
  const cutoffDay = settings.cutoff.slice(0, 10);
  const since = addDays(cutoffDay, -settings.lookbackDays);
  const scope = bills.filter((b) => inScope(b, settings.cutoff));
  const comparable = bills.filter((b) => b.status === "awaiting_payment" || (b.status === "paid" && (b.paidDate ?? "") >= since));
  const out = new Map<string, ExpectedHold>();
  const add = (h: ExpectedHold) => out.set(holdKey(h), h);

  for (const b of scope) {
    const nb = normaliseInvoiceNumber(b.invoiceNumber);
    for (const c of comparable) {
      if (c.billId === b.billId) continue;
      const nc = normaliseInvoiceNumber(c.invoiceNumber);
      const sameNumber = nb !== null && nb === nc;
      if (c.supplierId === b.supplierId) {
        if (sameNumber) add({ rule: "same_invoice_number", billIds: [b.billId, c.billId] });
        else if (c.total === b.total && daysBetween(b.date, c.date) <= settings.windowDays) add({ rule: "same_amount_in_window", billIds: [b.billId, c.billId] });
      } else if (sameNumber && c.total === b.total) {
        add({ rule: "supplier_entered_twice", billIds: [b.billId, c.billId] });
      }
    }

    const acct = normaliseBankAccount(suppliers.find((s) => s.supplierId === b.supplierId)?.bankAccount);
    if (!acct) continue;
    const lastPaid = comparable
      .filter((c) => c.status === "paid" && c.supplierId === b.supplierId && normaliseBankAccount(c.paidToAccount))
      .sort((x, y) => (y.paidDate ?? "").localeCompare(x.paidDate ?? ""))[0];
    if (lastPaid && normaliseBankAccount(lastPaid.paidToAccount) !== acct) add({ rule: "bank_changed", billIds: [b.billId, lastPaid.billId] });
    for (const o of suppliers) {
      if (o.supplierId !== b.supplierId && normaliseBankAccount(o.bankAccount) === acct) add({ rule: "bank_shared", billIds: [b.billId], otherSupplierId: o.supplierId });
    }
  }
  return [...out.values()];
}

// ---- the world ------------------------------------------------------------------

export interface DuplicateBillHoldWorldOptions {
  now?: Date;
  tenant?: string;
  ledger?: Settings["ledger"];
  bills: Bill[];
  suppliers: Supplier[];
  settings?: Partial<Omit<Settings, "tenant" | "ledger">>;
}

type Seq = { seq: number };

function unseq<T extends Seq>(x: T): Omit<T, "seq"> {
  const copy: Partial<T> = structuredClone(x);
  delete copy.seq;
  return copy as Omit<T, "seq">;
}

export class DuplicateBillHoldWorld {
  readonly bills: Bill[];
  readonly suppliers: Supplier[];
  /** Every hold raised, with the run it was raised in and each bill as the ledger held it at that moment. */
  readonly holds: Array<Hold & Seq & { run: number; asRaised: Array<BillView | null> }> = [];
  readonly results: Array<BillResult & Seq & { run: number }> = [];
  readonly writes: Array<{ billId: string; change: Record<string, unknown>; seq: number }> = [];
  /** Which bills were in scope at the start of each run, by run number (1 is the first). */
  readonly scopeByRun: string[][] = [];
  /** What the standard requires at the start of each run, by run number. */
  readonly expectedByRun: ExpectedHold[][] = [];
  /** Whether each run's reads were complete. */
  readonly partialByRun: boolean[] = [];
  readonly calls: PortCall[] = [];

  private readonly settings: Settings;
  private clock: Date;
  private seq = 0;
  private readSeq = 0;
  private truncate = false;
  private noBank = false;

  constructor(opts: DuplicateBillHoldWorldOptions) {
    this.clock = opts.now ?? new Date("2026-11-25T23:00:00.000Z"); // Thursday 9am Brisbane, pay run day
    this.bills = structuredClone(opts.bills);
    this.suppliers = structuredClone(opts.suppliers);
    this.settings = {
      tenant: opts.tenant ?? "harbour",
      ledger: opts.ledger ?? "xero",
      payRunDay: "thursday",
      cutoff: "2026-11-25T22:00:00.000Z",
      windowDays: 30,
      lookbackDays: 120,
      owner: "Kim",
      ...opts.settings,
    };
  }

  // ---- the business, between runs -------------------------------------------

  /** A named person releases a hold, or voids one of its bills in the ledger. */
  decide(holdId: string, action: "release" | "void", by: string, billId?: string): void {
    const h = this.holds.find((x) => x.holdId === holdId);
    if (!h) return;
    h.decision = { action, by, at: this.clock.toISOString(), ...(billId ? { billId } : {}) };
    if (action === "void" && billId) {
      const b = this.bills.find((x) => x.billId === billId);
      if (b) b.status = "voided";
    }
  }

  /** Someone edits a bill in the ledger: a new total or a new invoice number. */
  editBill(billId: string, change: Partial<Pick<Bill, "total" | "invoiceNumber">>): void {
    const b = this.bills.find((x) => x.billId === billId);
    if (b) Object.assign(b, change);
  }

  truncatePaidRead(): void {
    this.truncate = true;
  }

  bankDetailsUnavailable(): void {
    this.noBank = true;
  }

  advanceHours(hours: number): void {
    this.clock = new Date(this.clock.getTime() + hours * 3_600_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  get run(): number {
    return this.scopeByRun.length;
  }

  get owner(): string {
    return this.settings.owner;
  }

  bill(billId: string): Bill | undefined {
    return this.bills.find((x) => x.billId === billId);
  }

  /** The holds the standard requires on the ledger as it stands now. */
  truth(): ExpectedHold[] {
    return findDuplicates(this.bills, this.suppliers, this.settings);
  }

  // ---- the ports ----------------------------------------------------------------

  private record(port: Port, request: unknown, response: unknown): number {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
    return ++this.seq;
  }

  /**
   * One run. The run starts at the first port call other than `now`, which
   * snapshots the scope and what the standard requires at that moment. A
   * ports object nobody calls is not a run.
   */
  ports(): DuplicateBillHoldPorts {
    let run = 0;
    const begin = () => {
      if (run) return;
      this.scopeByRun.push(this.bills.filter((b) => inScope(b, this.settings.cutoff)).map((b) => b.billId));
      this.expectedByRun.push(this.truth());
      this.partialByRun.push(this.truncate || this.noBank);
      run = this.scopeByRun.length;
    };

    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        begin();
        const out = structuredClone(this.settings);
        this.record("read_rule", { settings: true }, { cutoff: out.cutoff, windowDays: out.windowDays });
        return out;
      },

      readBills: () => {
        begin();
        const data = structuredClone(this.bills.filter((b) => b.status !== "paid" && b.status !== "voided"));
        const readId = `RB-${++this.readSeq}`;
        this.record("read_ledger", { bills: "unpaid" }, { readId, count: data.length });
        return { ok: true, readId, asAt: this.clock.toISOString(), data, truncated: false };
      },

      readPaidBills: (since) => {
        begin();
        const all = this.bills
          .filter((b) => b.status === "paid" && (b.paidDate ?? "") >= since)
          .sort((x, y) => (y.paidDate ?? "").localeCompare(x.paidDate ?? ""));
        const data = structuredClone(this.truncate ? all.slice(0, Math.floor(all.length / 2)) : all);
        const truncated = this.truncate && data.length < all.length;
        const readId = `RP-${++this.readSeq}`;
        this.record("read_ledger", { paidBills: true, since }, { readId, count: data.length, truncated });
        return { ok: true, readId, asAt: this.clock.toISOString(), data, truncated };
      },

      readSuppliers: () => {
        begin();
        if (this.noBank) {
          const out = { ok: false as const, reason: "the connection cannot read supplier bank details" };
          this.record("read_ledger", { suppliers: true }, out);
          return out;
        }
        const readId = `RS-${++this.readSeq}`;
        this.record("read_ledger", { suppliers: true }, { readId, count: this.suppliers.length });
        return { ok: true, readId, asAt: this.clock.toISOString(), data: structuredClone(this.suppliers), truncated: false };
      },

      readHolds: () => {
        begin();
        const out = this.holds.map((h) => {
          const copy = unseq(h) as Hold & { run?: number; asRaised?: unknown };
          delete copy.run;
          delete copy.asRaised;
          return copy as Hold;
        });
        this.record("read_hold", { holds: true }, { count: out.length });
        return out;
      },

      raiseHold: (h) => {
        begin();
        const holdId = `HOLD-${this.holds.length + 1}`;
        const seq = this.record("request_hold", h, { holdId });
        const asRaised = h.bills.map((v) => {
          const b = this.bills.find((x) => x.billId === v.billId);
          return b ? viewOf(b, this.suppliers) : null;
        });
        this.holds.push({ ...structuredClone(h), holdId, raisedAt: this.clock.toISOString(), decision: null, seq, run, asRaised });
        return { holdId };
      },

      recordResult: (r) => {
        begin();
        const seq = this.record("evidence", r, { recorded: true });
        this.results.push({ ...structuredClone(r), seq, run });
      },

      writeBill: (billId, change) => {
        begin();
        const seq = this.record("write_ledger", { billId, change }, { ok: true });
        this.writes.push({ billId, change: structuredClone(change), seq });
        const b = this.bills.find((x) => x.billId === billId);
        if (b) Object.assign(b, change);
        return { ok: true as const };
      },
    };
  }
}

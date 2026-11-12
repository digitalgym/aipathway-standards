// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/bas-ready-check.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The BAS Ready Check world: one business's ledger for a BAS period and the
 * history before it. Transactions with their lines, tax codes and accounts,
 * what the ledger can and cannot read (attachments, reconciliation, a GST
 * report), the business's settings, and the lists the build published.
 *
 * WHY IT IS ITS OWN WORLD. Invoice Check's payables world holds a supplier
 * invoice against a purchase order, and Remittance Split holds a deposit
 * against open invoices. This one holds a whole period of coded lines and
 * asks questions of the codes, so its state is the chart of accounts, the tax
 * code list and a period of history, not one document.
 *
 * THERE IS NO WRITE PORT. Nothing here changes a code, posts a journal, adds
 * an attachment or lodges. The only outward port is `publish`, which hands the
 * list to a person. The assertion still reads the trace for any write verb, so
 * a build that found some other way to write is caught by what it recorded.
 *
 * THE LEDGER DOES NOT SAY WHAT IT CANNOT READ. A ledger with no attachment
 * read returns transactions with `hasAttachment` absent, not false; one with
 * no reconciled flag returns `reconciled` absent. A world that turned absent
 * into false would pass the build check 10 exists to fail, so the world keeps
 * the difference and the assertion reads it.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** What a flag can be about. A closed list. */
export const FLAG_KINDS = [
  "tax_invoice",
  "usual_code",
  "no_gst_account",
  "capital",
  "uncoded",
  "unreconciled",
  "swing",
  "control_account",
] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

/** What can be listed as not checked, each with a reason. */
export const NOT_CHECKED_KINDS = ["tax_invoice", "usual_code", "capital", "reconciliation", "gst_report"] as const;
export type NotCheckedKind = (typeof NOT_CHECKED_KINDS)[number];

/** Period-level measures for check 8. */
export const MEASURES = ["total_sales", "gst_on_sales", "gst_on_purchases"] as const;
export type Measure = (typeof MEASURES)[number];

export interface TaxCode {
  code: string;
  name: string;
  /** Percent, e.g. 10. */
  rate: number;
  /** A GST credit is claimed on purchases coded with this. */
  claimsCredit: boolean;
  /** GST charged on sales coded with this. */
  onSales: boolean;
  /** A capital purchase code (G10 under full reporting). */
  capital: boolean;
}

export interface Account {
  code: string;
  name: string;
  type: "revenue" | "expense" | "fixed_asset" | "bank" | "gst_control" | "liability";
}

export interface Line {
  lineId: string;
  accountCode: string;
  /** Empty string: no tax code on the line. */
  taxCode: string;
  /** GST inclusive. Negative on a credit to the account. */
  amount: number;
  /** The GST in `amount`, as the ledger holds it. */
  gst: number;
}

export interface Transaction {
  txnId: string;
  kind: "bill" | "spend" | "invoice" | "receive" | "journal";
  /** ISO date. */
  date: string;
  contactId?: string;
  contactName?: string;
  lines: Line[];
  /** GST inclusive total of the lines. */
  total: number;
  /** True when it moved money through a bank account (spend and receive). */
  bank: boolean;
  /** Absent when the ledger cannot say. */
  hasAttachment?: boolean;
  /** Absent when the ledger cannot say. Bank transactions only. */
  reconciled?: boolean;
}

export interface Capabilities {
  attachments: boolean;
  reconciliation: boolean;
  gstReport: boolean;
}

export interface Settings {
  ledger: "xero" | "myob" | "qbo";
  period: { from: string; to: string };
  comparable: { from: string; to: string };
  /** How far back check 4 looks for each supplier's usual code. */
  history: { from: string; to: string };
  reporting: "simpler" | "full";
  /** GST inclusive, set by the business from the ATO figure. */
  taxInvoiceThreshold: number;
  /** Percent. */
  swingBand: number;
  /** Accounts the business marked as carrying no GST. */
  noGstAccounts: string[];
  /** Fewest prior lines before a usual code counts. */
  minHistory: number;
  /** Who the list goes to. */
  reviewer: string;
}

export interface GstReport {
  totalSales: number;
  gstOnSales: number;
  gstOnPurchases: number;
}

/** A flag's citation of a transaction, as read back from the ledger. */
export interface Cited {
  txnId: string;
  date: string;
  total: number;
}

export interface Flag {
  kind: FlagKind;
  /** Line flags cite transactions. Required on every kind except swing. */
  cites: Cited[];
  /** Period flags name the period they are about. */
  period?: { from: string; to: string };
  /** What was found, as read. */
  evidence: string;
  /** Why it was flagged: the rule, not advice. */
  why: string;
  /** Check 4: the usual code and how many lines it was seen on. */
  usual?: { code: string; count: number };
  /** Check 8 and 9: the figures compared. */
  figures?: { measure?: Measure; now: number; then: number; change?: number };
}

export interface ExceptionsList {
  period: { from: string; to: string };
  ledger: string;
  reviewer: string;
  flags: Flag[];
  notChecked: Array<{ kind: NotCheckedKind; why: string }>;
}

export interface BasPorts {
  now(): Date;
  readSettings(): Settings;
  /** Which reads this ledger offers. */
  readCapabilities(): Capabilities;
  readTaxCodes(): TaxCode[];
  readAccounts(): Account[];
  /** Every transaction dated from `from` to `to` inclusive. */
  readTransactions(from: string, to: string): Transaction[];
  /** Null when the ledger offers no GST report through its API. */
  readGstReport(from: string, to: string): GstReport | null;
  /** Net movement in one account over the period (debits positive). */
  readAccountMovement(accountCode: string, from: string, to: string): number;
  /** One transaction by id, read back from the ledger. Null if none. */
  cite(txnId: string): Cited | null;
  /** Hand the list to the named person. The only outward port. */
  publish(list: ExceptionsList): void;
}

export interface BasWorldOptions {
  now?: Date;
  settings: Settings;
  capabilities?: Capabilities;
  taxCodes: TaxCode[];
  accounts: Account[];
  transactions: Transaction[];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;

/** Text a flag must never carry: advice, a decision or an instruction. */
export const ADVICE = /\b(should|must|change (it |the code )?to|recode|re-code|you can claim|claim it|lodge it|correct code is|is wrong|fix it|deduct)\b/i;

export class BasWorld {
  readonly settings: Settings;
  readonly capabilities: Capabilities;
  readonly taxCodes: TaxCode[];
  readonly accounts: Account[];
  readonly transactions: Transaction[];
  readonly published: Array<{ to: string; list: ExceptionsList; at: string }> = [];
  readonly reads: Array<{ from: string; to: string }> = [];
  readonly calls: PortCall[] = [];
  private clock: Date;

  constructor(opts: BasWorldOptions) {
    this.clock = opts.now ?? new Date("2026-10-14T22:00:00.000Z");
    this.settings = structuredClone(opts.settings);
    this.capabilities = opts.capabilities ? { ...opts.capabilities } : { attachments: true, reconciliation: true, gstReport: true };
    this.taxCodes = opts.taxCodes.map((t) => ({ ...t }));
    this.accounts = opts.accounts.map((a) => ({ ...a }));
    this.transactions = structuredClone(opts.transactions);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  storedTxn(id: string): Transaction | undefined {
    return this.transactions.find((t) => t.txnId === id);
  }

  code(code: string): TaxCode | undefined {
    return this.taxCodes.find((t) => t.code === code);
  }

  /** The period's figures computed from the coded lines. */
  computed(range: { from: string; to: string }): GstReport {
    let totalSales = 0;
    let gstOnSales = 0;
    let gstOnPurchases = 0;
    for (const t of this.transactions.filter((x) => inRange(x.date, range))) {
      for (const l of t.lines) {
        const c = this.code(l.taxCode);
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

  /** GST account movement: payable positive. Coded lines plus anything posted straight to it. */
  storedControlMovement(range: { from: string; to: string }): number {
    const r = this.computed(range);
    const control = this.accounts.filter((a) => a.type === "gst_control").map((a) => a.code);
    let direct = 0;
    for (const t of this.transactions.filter((x) => inRange(x.date, range))) {
      for (const l of t.lines) if (control.includes(l.accountCode)) direct += l.amount;
    }
    return round2(r.gstOnSales - r.gstOnPurchases + direct);
  }

  lastList(): ExceptionsList | undefined {
    return this.published.at(-1)?.list;
  }

  flagsOf(kind: FlagKind): Flag[] {
    return this.lastList()?.flags.filter((f) => f.kind === kind) ?? [];
  }

  /** True when no recorded call wrote anything. */
  get nothingWritten(): boolean {
    return this.calls.every((c) => c.verb !== "write");
  }

  advanceMinutes(n: number): void {
    this.clock = new Date(this.clock.getTime() + n * 60_000);
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): BasPorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        this.record("read_rule", { settings: true }, { period: this.settings.period });
        return structuredClone(this.settings);
      },

      readCapabilities: () => {
        this.record("read_ledger", { capabilities: true }, { ...this.capabilities });
        return { ...this.capabilities };
      },

      readTaxCodes: () => {
        this.record("read_ledger", { taxCodes: true }, { count: this.taxCodes.length });
        return this.taxCodes.map((t) => ({ ...t }));
      },

      readAccounts: () => {
        this.record("read_ledger", { accounts: true }, { count: this.accounts.length });
        return this.accounts.map((a) => ({ ...a }));
      },

      readTransactions: (from, to) => {
        this.reads.push({ from, to });
        const out = this.transactions
          .filter((t) => inRange(t.date, { from, to }))
          .map((t) => {
            const c = structuredClone(t);
            if (!this.capabilities.attachments) delete c.hasAttachment;
            if (!this.capabilities.reconciliation) delete c.reconciled;
            return c;
          });
        this.record("read_ledger", { transactions: { from, to } }, { count: out.length });
        return out;
      },

      readGstReport: (from, to) => {
        const out = this.capabilities.gstReport ? this.computed({ from, to }) : null;
        this.record("read_ledger", { gstReport: { from, to } }, out ?? { offered: false });
        return out;
      },

      readAccountMovement: (accountCode, from, to) => {
        const a = this.accounts.find((x) => x.code === accountCode);
        const out = a?.type === "gst_control" ? this.storedControlMovement({ from, to }) : 0;
        this.record("read_ledger", { movement: { accountCode, from, to } }, { movement: out });
        return out;
      },

      cite: (txnId) => {
        const t = this.storedTxn(txnId);
        const out = t ? { txnId, date: t.date, total: t.total } : null;
        this.record("cite", { txnId }, out ?? { found: false });
        return out;
      },

      publish: (list) => {
        const at = this.clock.toISOString();
        this.published.push({ to: list.reviewer, list: structuredClone(list), at });
        this.record("publish_report", { to: list.reviewer, flags: list.flags.length, notChecked: list.notChecked.length }, { ok: true });
      },
    };
  }
}

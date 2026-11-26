// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/ledger-core.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The ledger core world: one business's books, kept by the build under test.
 *
 * WHAT THE BUILD IS HERE. In most worlds the build does a job around a
 * system of record. Here the build IS the double-entry ledger: it reads
 * requests (journals, source documents, reversals, locks, an opening
 * position, report requests), and keeps its journals in a store the world
 * owns. Every report it publishes has to be rebuilt from that store.
 *
 * THE STORE IS APPEND ONLY. There is a port to append a journal and a port
 * to move the lock date, and no port to change or delete a journal. A
 * conforming build cannot edit history; it can only refuse to, and post a
 * reversal.
 *
 * THE WORLD DOES NOT REFUSE ANYTHING. It stores an unbalanced journal, a
 * journal dated inside a locked period, a duplicate id. A real store would
 * too, so the assertions read what the build appended and what it refused
 * (porting doc §8).
 *
 * THE WORLD CAN TAMPER. Between runs it can change a stored journal without
 * fixing its hash, the way someone with database access would. The build
 * must find it from the hash chain alone.
 *
 * THE GOLDEN SUITE. `LedgerCoreGolden` carries one case per check: invented
 * fixtures for an invented Australian plumbing business (Blue Gum Plumbing),
 * every expected figure written down to the cent, plus invariant cases (a
 * balanced journal or nothing, frozen, reversal only, the lock, the hash
 * chain, tamper, no floats, a seeded fuzz). `conformance init
 * ledger-core-build-standard` scaffolds a project that runs these cases as
 * they are, so the only file a builder writes is the build.
 *
 * MONEY IS WHOLE CENTS. Requests state money as decimal strings ("1,234.56")
 * on purpose: a build that parses them through a float is caught.
 *
 * No vendor's data is in here. Every account, contact and figure is made up.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

// ---- the vocabulary ------------------------------------------------------------

export type AccountClass = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountRole = "bank" | "receivable" | "payable" | "gst" | "retained_earnings";

export interface Account {
  code: string;
  name: string;
  class: AccountClass;
  role?: AccountRole;
}

/** Where a tax code lands on the BAS. */
export type BasClass = "taxable_sales" | "export_sales" | "gst_free_sales" | "capital_purchases" | "other_purchases" | "excluded";

export interface TaxCode {
  code: string;
  /** Percent, as a decimal string: "10". */
  rate: string;
  bas: BasClass;
}

export interface Settings {
  tenant: string;
  /** The last day of the financial year, MM-DD. "06-30" in Australia. */
  financialYearEnd: string;
  accounts: Account[];
  taxCodes: TaxCode[];
}

/** A journal line as a request states it: money as decimal strings, one side only. */
export interface MoneyLine {
  account: string;
  debit?: string;
  credit?: string;
  taxCode?: string;
  /** The GST inside this line, stated on the same side as the line. */
  tax?: string;
  tracking?: Record<string, string>;
}

export type DocStatus = "draft" | "submitted" | "authorised" | "paid" | "voided" | "deleted";
export type AmountType = "exclusive" | "inclusive" | "no_tax";

export interface DocumentLine {
  description: string;
  /** Decimal strings, never numbers. */
  quantity: string;
  unitPrice: string;
  discountPercent?: string;
  account: string;
  taxCode: string;
  tracking?: Record<string, string>;
}

export type SourceDocument =
  | {
      type: "invoice" | "bill";
      id: string;
      date: string;
      status: DocStatus;
      contact: string;
      amounts: AmountType;
      lines: DocumentLine[];
    }
  | {
      type: "credit_note";
      id: string;
      date: string;
      status: DocStatus;
      contact: string;
      side: "sales" | "purchases";
      amounts: AmountType;
      lines: DocumentLine[];
    }
  | {
      type: "bank_transaction";
      id: string;
      date: string;
      status: DocStatus;
      direction: "spend" | "receive";
      bankAccount: string;
      amounts: AmountType;
      lines: DocumentLine[];
      /** Set when this is one side of a transfer between the business's own accounts. */
      transfer?: string;
    }
  | { type: "payment"; id: string; date: string; document: string; bankAccount: string; amount: string }
  | { type: "transfer"; id: string; date: string; from: string; to: string; amount: string }
  | { type: "allocation"; id: string; date: string; creditNote: string; document: string; amount: string };

export type ReportSpec =
  | { type: "trial_balance"; asAt: string }
  | { type: "profit_and_loss"; from: string; to: string }
  | { type: "balance_sheet"; asAt: string }
  | { type: "gst"; from: string; to: string }
  | { type: "cash_basis"; from: string; to: string }
  | { type: "tracked"; from: string; to: string; category: string }
  | { type: "open_items"; asAt: string }
  | { type: "cash_movement"; from: string; to: string }
  | { type: "verify_chain" };

export type Request =
  | { requestId: string; kind: "post_journal"; journal: { id: string; date: string; narration?: string; lines: MoneyLine[] } }
  | { requestId: string; kind: "post_document"; document: SourceDocument }
  | { requestId: string; kind: "reverse"; journalId: string; date: string; newId: string }
  | { requestId: string; kind: "edit"; journalId: string; lines: MoneyLine[] }
  | { requestId: string; kind: "delete"; journalId: string }
  | { requestId: string; kind: "lock"; through: string }
  | { requestId: string; kind: "open"; journalId: string; cutover: string; signedOffBy: string | null; lines: MoneyLine[] }
  | { requestId: string; kind: "report"; report: ReportSpec };

export type SourceType =
  | "journal"
  | "invoice"
  | "bill"
  | "credit_note"
  | "bank_transaction"
  | "payment"
  | "transfer"
  | "allocation"
  | "reversal"
  | "opening";

/** A stored line: debit positive, credit negative, whole cents. */
export interface JournalLine {
  account: string;
  amount: number;
  taxCode?: string;
  /** The GST inside this line, same sign as the line. */
  tax?: number;
  /** On a receivable or payable line: the document it belongs to. */
  document?: string;
  tracking?: Record<string, string>;
}

export interface StoredJournal {
  id: string;
  /** 1, 2, 3 ... in the order appended. */
  seq: number;
  date: string;
  source: { type: SourceType; ref: string };
  reverses: string | null;
  lines: JournalLine[];
  /** The previous journal's hash; 64 zeros for the first. */
  prevHash: string;
  /** sha256 of `canonicalJournal`, lower-case hex. */
  hash: string;
}

export const REFUSAL_CODES = [
  "NOT_MONEY",
  "NO_LINES",
  "UNKNOWN_ACCOUNT",
  "UNKNOWN_TAX_CODE",
  "UNBALANCED",
  "DUPLICATE_JOURNAL",
  "DUPLICATE_DOCUMENT",
  "UNKNOWN_DOCUMENT",
  "PERIOD_LOCKED",
  "LOCK_BACKWARDS",
  "POSTED_IS_FROZEN",
  "UNKNOWN_JOURNAL",
  "ALREADY_REVERSED",
  "OPENING_NOT_SIGNED_OFF",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

export interface Refusal {
  requestId: string;
  code: RefusalCode;
  detail: string;
}

export type ReportBody =
  | { type: "trial_balance"; asAt: string; lines: Record<string, { debit: number; credit: number }>; totalDebit: number; totalCredit: number }
  | { type: "profit_and_loss"; from: string; to: string; lines: Record<string, number>; revenue: number; expenses: number; netProfit: number }
  | {
      type: "balance_sheet";
      asAt: string;
      lines: Record<string, number>;
      currentYearEarnings: number;
      assets: number;
      liabilities: number;
      equity: number;
    }
  | {
      type: "gst";
      from: string;
      to: string;
      G1: number;
      G2: number;
      G3: number;
      G10: number;
      G11: number;
      "1A": number;
      "1B": number;
      gstAccountMovement: number;
    }
  | { type: "cash_basis"; from: string; to: string; lines: Record<string, number>; netProfit: number }
  | { type: "tracked"; from: string; to: string; category: string; options: Record<string, Record<string, number>> }
  | { type: "open_items"; asAt: string; items: Record<string, number> }
  | { type: "cash_movement"; from: string; to: string; received: number; spent: number }
  | { type: "verify_chain"; ok: boolean; firstBad: string | null };

export interface LedgerCorePorts {
  now(): Date;
  /** The chart of accounts, the tax codes and the financial year end. */
  readSettings(): Settings;
  /** This run's requests, in order. Handle every one. */
  readRequests(): Request[];
  /** Everything appended so far, in order, and the lock date. */
  readStore(): { journals: StoredJournal[]; lockedThrough: string | null };
  /** Append one journal. There is no port to change or remove one. */
  appendJournal(j: StoredJournal): void;
  /** Move the lock date. Nothing dated on or before it may post. */
  setLock(through: string): void;
  /** Refuse a request, with the code and why. */
  refuse(r: Refusal): void;
  /** Publish a report rebuilt from the store. */
  publishReport(r: { requestId: string; report: ReportBody }): void;
}

// ---- the hash chain, as the standard defines it ----------------------------------

export const GENESIS_HASH = "0".repeat(64);

/**
 * The exact text a journal's hash covers. JSON of one array, in this order;
 * tracking as [category, option] pairs sorted by category; absent fields as
 * null. Anyone can recompute it from a stored journal.
 */
export function canonicalJournal(j: Omit<StoredJournal, "hash">): string {
  return JSON.stringify([
    j.id,
    j.seq,
    j.date,
    j.source.type,
    j.source.ref,
    j.reverses ?? null,
    j.prevHash,
    j.lines.map((l) => [
      l.account,
      l.amount,
      l.taxCode ?? null,
      l.tax ?? null,
      l.document ?? null,
      l.tracking ? Object.entries(l.tracking).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) : null,
    ]),
  ]);
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** sha256 of a string's UTF-8 bytes, lower-case hex. Plain code, so it runs anywhere. */
export function sha256Hex(text: string): string {
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = ((bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3]) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** What a journal's hash has to be. */
export function journalHash(j: Omit<StoredJournal, "hash">): string {
  return sha256Hex(canonicalJournal(j));
}

/** $1,234.56 from whole cents, for people. */
export function formatCents(c: number): string {
  const neg = c < 0;
  const a = Math.abs(c);
  const dollars = Math.floor(a / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${dollars}.${String(a % 100).padStart(2, "0")}`;
}

// ---- the invented business ---------------------------------------------------------

/** Blue Gum Plumbing's chart. Invented, numbered for this suite only. */
export const BLUE_GUM_ACCOUNTS: readonly Account[] = [
  { code: "1-1010", name: "Cheque Account", class: "asset", role: "bank" },
  { code: "1-1020", name: "Savings Account", class: "asset", role: "bank" },
  { code: "1-1200", name: "Trade Debtors", class: "asset", role: "receivable" },
  { code: "1-1500", name: "Tools and Equipment", class: "asset" },
  { code: "2-1200", name: "Trade Creditors", class: "liability", role: "payable" },
  { code: "2-1300", name: "GST Clearing", class: "liability", role: "gst" },
  { code: "3-1000", name: "Owner's Capital", class: "equity" },
  { code: "3-8000", name: "Retained Profits", class: "equity", role: "retained_earnings" },
  { code: "4-1000", name: "Plumbing Services", class: "revenue" },
  { code: "4-2000", name: "Parts Sales", class: "revenue" },
  { code: "5-1000", name: "Materials", class: "expense" },
  { code: "6-1000", name: "Vehicle Costs", class: "expense" },
  { code: "6-2000", name: "Rent", class: "expense" },
  { code: "6-3000", name: "Depreciation", class: "expense" },
];

export const BLUE_GUM_TAX_CODES: readonly TaxCode[] = [
  { code: "GST_SALES", rate: "10", bas: "taxable_sales" },
  { code: "GST_FREE_SALES", rate: "0", bas: "gst_free_sales" },
  { code: "EXPORT", rate: "0", bas: "export_sales" },
  { code: "GST_PURCHASES", rate: "10", bas: "other_purchases" },
  { code: "GST_CAPITAL", rate: "10", bas: "capital_purchases" },
  { code: "GST_FREE_PURCHASES", rate: "0", bas: "other_purchases" },
  { code: "NOT_REPORTED", rate: "0", bas: "excluded" },
];

export function blueGumSettings(): Settings {
  return {
    tenant: "blue-gum-plumbing",
    financialYearEnd: "06-30",
    accounts: structuredClone([...BLUE_GUM_ACCOUNTS]),
    taxCodes: structuredClone([...BLUE_GUM_TAX_CODES]),
  };
}

// ---- the world ------------------------------------------------------------------

/** Something the world does between two runs. */
export type BetweenRuns = { tamper: { journalId: string; lineIndex: number; amount: number } };

export interface LedgerCoreWorldOptions {
  now?: Date;
  settings?: Settings;
  /** One batch of requests per run. */
  batches?: Request[][];
  /** Index i happens after run i. */
  between?: Array<BetweenRuns | null>;
}

type Seq = { seq: number };

export class LedgerCoreWorld {
  readonly settings: Settings;
  readonly batches: Request[][];
  readonly between: Array<BetweenRuns | null>;
  /** The store, in append order. The world never edits it except to tamper. */
  readonly journals: StoredJournal[] = [];
  /** When each journal was appended, by the world's sequence. */
  readonly appendSeqs: number[] = [];
  /** A deep copy of each journal as it was appended. */
  readonly asAppended: StoredJournal[] = [];
  readonly refusals: Array<Refusal & Seq> = [];
  readonly reports: Array<{ requestId: string; report: ReportBody } & Seq> = [];
  readonly storeReads: number[] = [];
  readonly lockMoves: Array<{ through: string } & Seq> = [];
  readonly tampered: string[] = [];
  readonly calls: PortCall[] = [];
  lockedThrough: string | null = null;

  private clock: Date;
  private seq = 0;
  private batch = 0;

  constructor(opts: LedgerCoreWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-26T23:00:00.000Z"); // Friday 9am Brisbane
    this.settings = structuredClone(opts.settings ?? blueGumSettings());
    this.batches = structuredClone(opts.batches ?? [[]]);
    this.between = opts.between ?? [];
  }

  get runs(): number {
    return this.batches.length;
  }

  /** Point the next run at batch i. */
  startRun(i: number): void {
    this.batch = i;
  }

  /** Whatever the world does after run i. */
  afterRun(i: number): void {
    const ev = this.between[i];
    if (ev?.tamper) this.tamper(ev.tamper.journalId, ev.tamper.lineIndex, ev.tamper.amount);
    this.clock = new Date(this.clock.getTime() + 3_600_000);
  }

  /**
   * Change a stored line's amount, and the line that balances it, without
   * touching the hash: what someone with access to the database could do.
   */
  tamper(journalId: string, lineIndex: number, amount: number): void {
    const j = this.journals.find((x) => x.id === journalId);
    if (!j || !j.lines[lineIndex]) return;
    const old = j.lines[lineIndex].amount;
    j.lines[lineIndex].amount = amount;
    const other = j.lines.findIndex((l, i) => i !== lineIndex && Math.sign(l.amount) === -Math.sign(old));
    if (other >= 0) j.lines[other].amount -= amount - old;
    this.tampered.push(journalId);
  }

  /** Every request across every batch. */
  allRequests(): Request[] {
    return this.batches.flat();
  }

  account(code: string): Account | undefined {
    return this.settings.accounts.find((a) => a.code === code);
  }

  refusalFor(requestId: string): Refusal | undefined {
    return this.refusals.find((r) => r.requestId === requestId);
  }

  reportFor(requestId: string): (ReportBody & Seq) | undefined {
    const r = this.reports.find((x) => x.requestId === requestId);
    return r ? { ...r.report, seq: r.seq } : undefined;
  }

  journalsFor(sourceRef: string): StoredJournal[] {
    return this.journals.filter((j) => j.source.ref === sourceRef && j.source.type !== "reversal");
  }

  private record(port: Port, request: unknown, response: unknown): number {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
    return ++this.seq;
  }

  ports(): LedgerCorePorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        const out = structuredClone(this.settings);
        this.record("read_rule", { settings: true }, { accounts: out.accounts.length, taxCodes: out.taxCodes.length });
        return out;
      },

      readRequests: () => {
        const out = structuredClone(this.batches[this.batch] ?? []);
        this.record("read_handoffs", { batch: this.batch }, { count: out.length });
        return out;
      },

      readStore: () => {
        const out = { journals: structuredClone(this.journals), lockedThrough: this.lockedThrough };
        const seq = this.record("read_ledger", { store: true }, { journals: out.journals.length, lockedThrough: out.lockedThrough });
        this.storeReads.push(seq);
        return out;
      },

      appendJournal: (j) => {
        const seq = this.record("write_ledger", { id: j?.id, date: j?.date, lines: j?.lines?.length }, { ok: true });
        this.journals.push(structuredClone(j));
        this.asAppended.push(structuredClone(j));
        this.appendSeqs.push(seq);
      },

      setLock: (through) => {
        const seq = this.record("set_lock_date", { through }, { ok: true });
        this.lockedThrough = through;
        this.lockMoves.push({ through, seq });
      },

      refuse: (r) => {
        const seq = this.record("raise_exception", r, { ok: true });
        this.refusals.push({ ...structuredClone(r), seq });
      },

      publishReport: (r) => {
        const seq = this.record("publish_report", { requestId: r?.requestId, type: r?.report?.type }, { ok: true });
        this.reports.push({ ...structuredClone(r), seq });
      },
    };
  }
}

// ---- comparing what the build did with what the case expects ------------------------

function sameMap(want: Record<string, number>, got: Record<string, number> | undefined, label: string, out: string[]): void {
  const g = got ?? {};
  for (const k of new Set([...Object.keys(want), ...Object.keys(g)])) {
    const w = want[k] ?? 0;
    const v = g[k] ?? 0;
    if (w !== v) out.push(`${label} ${k}: expected ${formatCents(w)}, got ${typeof g[k] === "number" ? formatCents(v) : String(g[k] ?? 0)}`);
  }
}

function sameNum(want: number, got: unknown, label: string, out: string[]): void {
  if (got !== want) out.push(`${label}: expected ${formatCents(want)}, got ${typeof got === "number" ? formatCents(got) : String(got)}`);
}

/** Compare one published report with what the case expects. Fields not given are not compared. */
export function compareReport(want: ReportBody, got: ReportBody | undefined, label: string, out: string[]): void {
  if (!got) {
    out.push(`${label}: no report published`);
    return;
  }
  if (got.type !== want.type) {
    out.push(`${label}: expected a ${want.type} report, got ${String(got.type)}`);
    return;
  }
  switch (want.type) {
    case "trial_balance": {
      const g = got as typeof want;
      const flat = (m: Record<string, { debit: number; credit: number }> | undefined) =>
        Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, (v?.debit ?? 0) - (v?.credit ?? 0)]));
      sameMap(flat(want.lines), flat(g.lines), `${label} line`, out);
      for (const [k, v] of Object.entries(g.lines ?? {})) {
        if ((v?.debit ?? 0) !== 0 && (v?.credit ?? 0) !== 0) out.push(`${label} line ${k} shows both a debit and a credit`);
      }
      sameNum(want.totalDebit, g.totalDebit, `${label} total debits`, out);
      sameNum(want.totalCredit, g.totalCredit, `${label} total credits`, out);
      return;
    }
    case "profit_and_loss": {
      const g = got as typeof want;
      sameMap(want.lines, g.lines, `${label} line`, out);
      sameNum(want.revenue, g.revenue, `${label} revenue`, out);
      sameNum(want.expenses, g.expenses, `${label} expenses`, out);
      sameNum(want.netProfit, g.netProfit, `${label} net profit`, out);
      return;
    }
    case "balance_sheet": {
      const g = got as typeof want;
      sameMap(want.lines, g.lines, `${label} line`, out);
      sameNum(want.currentYearEarnings, g.currentYearEarnings, `${label} current year earnings`, out);
      sameNum(want.assets, g.assets, `${label} assets`, out);
      sameNum(want.liabilities, g.liabilities, `${label} liabilities`, out);
      sameNum(want.equity, g.equity, `${label} equity`, out);
      return;
    }
    case "gst": {
      const g = got as typeof want;
      for (const k of ["G1", "G2", "G3", "G10", "G11", "1A", "1B", "gstAccountMovement"] as const) sameNum(want[k], g[k], `${label} ${k}`, out);
      return;
    }
    case "cash_basis": {
      const g = got as typeof want;
      sameMap(want.lines, g.lines, `${label} line`, out);
      sameNum(want.netProfit, g.netProfit, `${label} net profit`, out);
      return;
    }
    case "tracked": {
      const g = got as typeof want;
      const opts = new Set([...Object.keys(want.options), ...Object.keys(g.options ?? {})]);
      for (const o of opts) sameMap(want.options[o] ?? {}, g.options?.[o], `${label} ${o}`, out);
      return;
    }
    case "open_items": {
      const g = got as typeof want;
      sameMap(want.items, g.items, `${label} item`, out);
      return;
    }
    case "cash_movement": {
      const g = got as typeof want;
      sameNum(want.received, g.received, `${label} received`, out);
      sameNum(want.spent, g.spent, `${label} spent`, out);
      return;
    }
    case "verify_chain": {
      const g = got as typeof want;
      if (g.ok !== want.ok) out.push(`${label}: expected the chain ${want.ok ? "intact" : "broken"}, the build said ${g.ok ? "intact" : "broken"}`);
      if ((g.firstBad ?? null) !== want.firstBad) out.push(`${label}: expected the first bad journal ${want.firstBad ?? "none"}, got ${g.firstBad ?? "none"}`);
      return;
    }
  }
}

/** A stored line, as text, for multiset comparison. */
function lineKey(l: Partial<JournalLine>): string {
  return [l.account, l.amount, l.taxCode ?? "", l.tax ?? 0, l.document ?? ""].join("|");
}

function sameLines(want: readonly JournalLine[], got: readonly JournalLine[] | undefined, label: string, out: string[]): void {
  const w = want.map(lineKey).sort();
  const g = (got ?? []).map(lineKey).sort();
  if (w.join(";") !== g.join(";")) out.push(`${label}: expected lines [${w.join("; ")}], got [${g.join("; ")}]`);
}

/** Lines sum to zero and every amount is a whole number of cents. */
function balancedWhole(j: StoredJournal): boolean {
  let s = 0;
  for (const l of j.lines ?? []) {
    if (!Number.isSafeInteger(l.amount)) return false;
    if (l.tax !== undefined && !Number.isSafeInteger(l.tax)) return false;
    s += l.amount;
  }
  return (j.lines ?? []).length > 0 && s === 0;
}

// ---- the golden cases -------------------------------------------------------------

export interface Expectation {
  /** requestId to the code the build must refuse it with. Any other refusal fails. */
  refusals?: Record<string, RefusalCode>;
  /** Source refs (a journal's own id for a journal, a document id for a document) that must each have exactly one journal. */
  posted?: string[];
  /** Source refs that must have no journal at all. */
  notPosted?: string[];
  /** The number of journals in the store at the end. */
  journalCount?: number;
  /** Journals by source ref: the date and the exact lines. */
  journals?: Record<string, { date?: string; lines: JournalLine[] }>;
  /** Reports by the requestId that asked for them. */
  reports?: Record<string, ReportBody>;
  /** The lock date at the end. */
  lockedThrough?: string | null;
}

export interface GoldenCase {
  checkId: string;
  kind: "fixture" | "invariant";
  /** A short name, for the page. */
  title: string;
  /** What it proves, in a sentence. */
  covers: string;
  batches: Request[][];
  between?: Array<BetweenRuns | null>;
  expect: Expectation;
}

const d = (account: string, amount: string, extra: Partial<MoneyLine> = {}): MoneyLine => ({ account, debit: amount, ...extra });
const c = (account: string, amount: string, extra: Partial<MoneyLine> = {}): MoneyLine => ({ account, credit: amount, ...extra });
const jr = (requestId: string, id: string, date: string, lines: MoneyLine[]): Request => ({ requestId, kind: "post_journal", journal: { id, date, lines } });
const doc = (requestId: string, document: SourceDocument): Request => ({ requestId, kind: "post_document", document });
const rep = (requestId: string, report: ReportSpec): Request => ({ requestId, kind: "report", report });
const line = (description: string, quantity: string, unitPrice: string, account: string, taxCode: string, extra: Partial<DocumentLine> = {}): DocumentLine => ({
  description,
  quantity,
  unitPrice,
  account,
  taxCode,
  ...extra,
});
const tb = (asAt: string, lines: Record<string, number>): ReportBody => {
  const out: Record<string, { debit: number; credit: number }> = {};
  let dr = 0;
  let cr = 0;
  for (const [k, v] of Object.entries(lines)) {
    out[k] = { debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 };
    if (v > 0) dr += v;
    else cr -= v;
  }
  return { type: "trial_balance", asAt, lines: out, totalDebit: dr, totalCredit: cr };
};

/** A seeded generator, so the fuzz case is the same everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "1234.56" from 123456 cents, with no float in the way. */
function money(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

const FUZZ_ACCOUNTS = BLUE_GUM_ACCOUNTS.map((a) => a.code);
const FUZZ_DATES = (() => {
  const out: string[] = [];
  for (let t = Date.UTC(2025, 6, 1); t <= Date.UTC(2027, 5, 30); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
})();
export const FUZZ_REPORT_DATES = ["2025-12-31", "2026-06-30", "2026-07-01", "2027-06-30"] as const;

/** Three hundred journals across two financial years, every seventh out by a cent. */
function fuzzRequests(): { requests: Request[]; balanced: string[]; unbalanced: string[] } {
  const rnd = mulberry32(20260701);
  const requests: Request[] = [];
  const balanced: string[] = [];
  const unbalanced: string[] = [];
  for (let i = 1; i <= 300; i++) {
    const n = 2 + Math.floor(rnd() * 4);
    const amounts: number[] = [];
    for (let k = 0; k < n - 1; k++) {
      const a = 1 + Math.floor(rnd() * 2_500_000);
      amounts.push(rnd() < 0.5 ? a : -a);
    }
    // A zero closing line would be no line at all; nudge the first one.
    if (amounts.reduce((s, a) => s + a, 0) === 0) amounts[0] += amounts[0] > 0 ? 1 : -1;
    let last = -amounts.reduce((s, a) => s + a, 0);
    const off = i % 7 === 0;
    if (off) last += 1;
    amounts.push(last);
    const lines = amounts.map((a) => {
      const account = FUZZ_ACCOUNTS[Math.floor(rnd() * FUZZ_ACCOUNTS.length)];
      return a > 0 ? d(account, money(a)) : c(account, money(-a));
    });
    const id = `FZ-${String(i).padStart(3, "0")}`;
    requests.push(jr(`fz${i}`, id, FUZZ_DATES[Math.floor(rnd() * FUZZ_DATES.length)], lines));
    (off ? unbalanced : balanced).push(id);
  }
  FUZZ_REPORT_DATES.forEach((asAt, i) => {
    requests.push(rep(`fz-tb${i}`, { type: "trial_balance", asAt }));
    requests.push(rep(`fz-bs${i}`, { type: "balance_sheet", asAt }));
  });
  requests.push(rep("fz-chain", { type: "verify_chain" }));
  return { requests, balanced, unbalanced };
}

const FUZZ = fuzzRequests();

/** A journal request's lines as stored cents: debit positive, credit negative. */
function centsOf(m: MoneyLine): number {
  const s = (m.debit ?? m.credit ?? "0").replace(/,/g, "");
  const [w, f = ""] = s.split(".");
  const v = Number(w) * 100 + Number(f.padEnd(2, "0").slice(0, 2));
  return m.debit !== undefined ? v : -v;
}

function dayAfter(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The first day of the financial year holding `asAt`, for a year ending on MM-DD. */
export function financialYearStart(asAt: string, yearEnd: string): string {
  const y = Number(asAt.slice(0, 4));
  const thisEnd = `${y}-${yearEnd}`;
  return dayAfter(asAt <= thisEnd ? `${y - 1}-${yearEnd}` : thisEnd);
}

/** The fuzz case's trial balance, worked out from the balanced requests alone. */
function fuzzTrialBalance(asAt: string): ReportBody {
  const accounts = new Map(BLUE_GUM_ACCOUNTS.map((a) => [a.code, a]));
  const fyStart = financialYearStart(asAt, "06-30");
  const bal: Record<string, number> = {};
  const balancedIds = new Set(FUZZ.balanced);
  for (const r of FUZZ.requests) {
    if (r.kind !== "post_journal" || !balancedIds.has(r.journal.id) || r.journal.date > asAt) continue;
    for (const m of r.journal.lines) {
      const a = accounts.get(m.account)!;
      const pnl = a.class === "revenue" || a.class === "expense";
      const key = pnl && r.journal.date < fyStart ? "3-8000" : m.account;
      bal[key] = (bal[key] ?? 0) + centsOf(m);
    }
  }
  return tb(asAt, bal);
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    checkId: "money-in-whole-cents",
    kind: "invariant",
    title: "No floats",
    covers: "Decimal strings parse to whole cents exactly: 0.10 + 0.20 balances 0.30, 1,234.565 is 123,457 cents, 2.675 is 268 cents, and words are refused.",
    batches: [
      [
        jr("m1", "M-1", "2026-07-01", [d("1-1010", "0.10"), d("1-1010", "0.20"), c("4-1000", "0.30")]),
        jr("m2", "M-2", "2026-07-02", [d("1-1010", "1,234.565"), c("4-1000", "1,234.565")]),
        jr("m3", "M-3", "2026-07-03", [d("5-1000", "19.99"), c("1-1010", "19.99")]),
        jr("m4", "M-4", "2026-07-04", [d("6-1000", "2.675"), c("1-1010", "2.675")]),
        jr("m5", "M-5", "2026-07-05", [d("1-1010", "12 dollars"), c("4-1000", "12.00")]),
      ],
    ],
    expect: {
      refusals: { m5: "NOT_MONEY" },
      posted: ["M-1", "M-2", "M-3", "M-4"],
      notPosted: ["M-5"],
      journals: {
        "M-1": { lines: [{ account: "1-1010", amount: 10 }, { account: "1-1010", amount: 20 }, { account: "4-1000", amount: -30 }] },
        "M-2": { lines: [{ account: "1-1010", amount: 123457 }, { account: "4-1000", amount: -123457 }] },
        "M-3": { lines: [{ account: "5-1000", amount: 1999 }, { account: "1-1010", amount: -1999 }] },
        "M-4": { lines: [{ account: "6-1000", amount: 268 }, { account: "1-1010", amount: -268 }] },
      },
    },
  },
  {
    checkId: "balanced-or-refused",
    kind: "invariant",
    title: "Debits equal credits, or nothing",
    covers: "A journal a cent out, one naming an account the chart does not hold, one with no lines and a repeated id are each refused, and nothing of them is stored.",
    batches: [
      [
        jr("b1", "B-1", "2026-07-06", [d("6-2000", "1,800.00"), d("2-1300", "180.00"), c("1-1010", "1,980.00")]),
        jr("b2", "B-2", "2026-07-06", [d("5-1000", "100.00"), c("1-1010", "99.99")]),
        jr("b3", "B-3", "2026-07-06", [d("9-9999", "50.00"), c("1-1010", "50.00")]),
        jr("b4", "B-4", "2026-07-06", []),
        jr("b5", "B-1", "2026-07-07", [d("5-1000", "10.00"), c("1-1010", "10.00")]),
      ],
    ],
    expect: {
      refusals: { b2: "UNBALANCED", b3: "UNKNOWN_ACCOUNT", b4: "NO_LINES", b5: "DUPLICATE_JOURNAL" },
      posted: ["B-1"],
      notPosted: ["B-2", "B-3", "B-4"],
      journalCount: 1,
      journals: { "B-1": { date: "2026-07-06", lines: [{ account: "6-2000", amount: 180000 }, { account: "2-1300", amount: 18000 }, { account: "1-1010", amount: -198000 }] } },
    },
  },
  {
    checkId: "posted-journals-frozen",
    kind: "invariant",
    title: "Posted is frozen",
    covers: "A request to change a posted journal's amount and a request to delete one are both refused, and the stored journals end the run exactly as they were appended.",
    batches: [
      [
        jr("f1", "F-1", "2026-07-08", [d("5-1000", "640.00"), c("2-1200", "640.00")]),
        jr("f2", "F-2", "2026-07-09", [d("6-1000", "95.50"), c("1-1010", "95.50")]),
      ],
      [
        { requestId: "f3", kind: "edit", journalId: "F-1", lines: [d("5-1000", "460.00"), c("2-1200", "460.00")] },
        { requestId: "f4", kind: "delete", journalId: "F-2" },
      ],
    ],
    expect: {
      refusals: { f3: "POSTED_IS_FROZEN", f4: "POSTED_IS_FROZEN" },
      posted: ["F-1", "F-2"],
      journalCount: 2,
      journals: {
        "F-1": { lines: [{ account: "5-1000", amount: 64000 }, { account: "2-1200", amount: -64000 }] },
        "F-2": { lines: [{ account: "6-1000", amount: 9550 }, { account: "1-1010", amount: -9550 }] },
      },
    },
  },
  {
    checkId: "reversal-only-correction",
    kind: "invariant",
    title: "Correct by reversal",
    covers: "Rent keyed at $1,500.00 instead of $1,050.00 is fixed by a reversal that negates every line and a new journal; reversing it twice, or reversing a journal that does not exist, is refused.",
    batches: [
      [
        jr("r1", "R-1", "2026-07-03", [d("6-2000", "1,500.00"), c("1-1010", "1,500.00")]),
        { requestId: "r2", kind: "reverse", journalId: "R-1", date: "2026-07-10", newId: "R-1-REV" },
        jr("r3", "R-2", "2026-07-10", [d("6-2000", "1,050.00"), c("1-1010", "1,050.00")]),
        { requestId: "r4", kind: "reverse", journalId: "R-1", date: "2026-07-11", newId: "R-1-REV2" },
        { requestId: "r5", kind: "reverse", journalId: "NOPE-1", date: "2026-07-11", newId: "NOPE-1-REV" },
        rep("r6", { type: "profit_and_loss", from: "2026-07-01", to: "2026-07-31" }),
      ],
    ],
    expect: {
      refusals: { r4: "ALREADY_REVERSED", r5: "UNKNOWN_JOURNAL" },
      posted: ["R-1", "R-2"],
      journalCount: 3,
      journals: { "R-1": { date: "2026-07-03", lines: [{ account: "6-2000", amount: 150000 }, { account: "1-1010", amount: -150000 }] } },
      reports: { r6: { type: "profit_and_loss", from: "2026-07-01", to: "2026-07-31", lines: { "6-2000": 105000 }, revenue: 0, expenses: 105000, netProfit: -105000 } },
    },
  },
  {
    checkId: "period-lock",
    kind: "invariant",
    title: "The lock holds",
    covers: "After July is locked, a journal, a reversal and an invoice dated in July are refused, the reversal posts in August instead, and the lock cannot move back.",
    batches: [
      [
        jr("l1", "L-1", "2026-07-15", [d("6-1000", "210.00"), c("1-1010", "210.00")]),
        { requestId: "l2", kind: "lock", through: "2026-07-31" },
        jr("l3", "L-2", "2026-07-31", [d("6-1000", "40.00"), c("1-1010", "40.00")]),
        jr("l4", "L-3", "2026-08-01", [d("6-1000", "40.00"), c("1-1010", "40.00")]),
        { requestId: "l5", kind: "reverse", journalId: "L-1", date: "2026-07-20", newId: "L-1-REV" },
        { requestId: "l6", kind: "reverse", journalId: "L-1", date: "2026-08-05", newId: "L-1-REV" },
        { requestId: "l7", kind: "lock", through: "2026-06-30" },
        doc("l8", {
          type: "invoice",
          id: "INV-0091",
          date: "2026-07-20",
          status: "authorised",
          contact: "Mrs Tran",
          amounts: "exclusive",
          lines: [line("Hot water service", "1", "180.00", "4-1000", "GST_SALES")],
        }),
      ],
    ],
    expect: {
      refusals: { l3: "PERIOD_LOCKED", l5: "PERIOD_LOCKED", l7: "LOCK_BACKWARDS", l8: "PERIOD_LOCKED" },
      posted: ["L-1", "L-3"],
      notPosted: ["L-2", "INV-0091"],
      journalCount: 3,
      lockedThrough: "2026-07-31",
    },
  },
  {
    checkId: "hash-chain",
    kind: "invariant",
    title: "Every journal chained",
    covers: "Each journal carries the hash of the one before it (64 zeros for the first) and a sha256 of its own canonical text, and the build's own check says the chain is intact.",
    batches: [
      [
        jr("h1", "H-1", "2026-07-01", [d("1-1010", "5,000.00"), c("3-1000", "5,000.00")]),
        jr("h2", "H-2", "2026-07-02", [d("6-1000", "80.00", { taxCode: "GST_PURCHASES", tax: "8.00" }), d("2-1300", "8.00"), c("1-1010", "88.00")]),
        doc("h3", {
          type: "invoice",
          id: "INV-0101",
          date: "2026-07-03",
          status: "authorised",
          contact: "Kurrajong Strata",
          amounts: "exclusive",
          lines: [line("Blocked drain", "2", "135.00", "4-1000", "GST_SALES", { tracking: { Crew: "North" } })],
        }),
        jr("h4", "H-3", "2026-07-04", [d("5-1000", "12.34"), c("1-1010", "12.34")]),
        rep("h5", { type: "verify_chain" }),
      ],
    ],
    expect: {
      posted: ["H-1", "H-2", "INV-0101", "H-3"],
      journalCount: 4,
      reports: { h5: { type: "verify_chain", ok: true, firstBad: null } },
    },
  },
  {
    checkId: "tamper-detected",
    kind: "invariant",
    title: "Tampering found",
    covers: "Between runs the store's second journal is changed from $700.00 to $70.00 on both sides, still balanced, hash untouched. The next check names that journal.",
    batches: [
      [
        jr("t1", "T-1", "2026-07-01", [d("1-1010", "500.00"), c("4-1000", "500.00")]),
        jr("t2", "T-2", "2026-07-02", [d("1-1010", "700.00"), c("4-1000", "700.00")]),
        jr("t3", "T-3", "2026-07-03", [d("1-1010", "900.00"), c("4-1000", "900.00")]),
        rep("t4", { type: "verify_chain" }),
      ],
      [rep("t5", { type: "verify_chain" })],
    ],
    between: [{ tamper: { journalId: "T-2", lineIndex: 0, amount: 7000 } }],
    expect: {
      posted: ["T-1", "T-2", "T-3"],
      journalCount: 3,
      reports: {
        t4: { type: "verify_chain", ok: true, firstBad: null },
        t5: { type: "verify_chain", ok: false, firstBad: "T-2" },
      },
    },
  },
  {
    checkId: "trial-balance-and-profit",
    kind: "fixture",
    title: "July's trial balance and profit",
    covers: "Blue Gum Plumbing's first month: capital in, two sales, a materials bill, rent, a customer payment. The trial balance at 31 July and July's profit, to the cent, with an August journal left out.",
    batches: [
      [
        jr("a1", "A-1", "2026-07-01", [d("1-1010", "20,000.00"), c("3-1000", "20,000.00")]),
        jr("a2", "A-2", "2026-07-04", [d("1-1200", "3,300.00"), c("4-1000", "3,000.00", { taxCode: "GST_SALES", tax: "300.00" }), c("2-1300", "300.00")]),
        jr("a3", "A-3", "2026-07-09", [d("5-1000", "880.00", { taxCode: "GST_PURCHASES", tax: "88.00" }), d("2-1300", "88.00"), c("2-1200", "968.00")]),
        jr("a4", "A-4", "2026-07-15", [d("1-1010", "3,300.00"), c("1-1200", "3,300.00")]),
        jr("a5", "A-5", "2026-07-20", [d("6-2000", "2,000.00", { taxCode: "GST_PURCHASES", tax: "200.00" }), d("2-1300", "200.00"), c("1-1010", "2,200.00")]),
        jr("a6", "A-6", "2026-07-28", [d("1-1200", "550.00"), c("4-2000", "500.00", { taxCode: "GST_SALES", tax: "50.00" }), c("2-1300", "50.00")]),
        jr("a7", "A-7", "2026-08-03", [d("6-1000", "120.00", { taxCode: "GST_PURCHASES", tax: "12.00" }), d("2-1300", "12.00"), c("1-1010", "132.00")]),
        rep("a8", { type: "trial_balance", asAt: "2026-07-31" }),
        rep("a9", { type: "profit_and_loss", from: "2026-07-01", to: "2026-07-31" }),
      ],
    ],
    expect: {
      posted: ["A-1", "A-2", "A-3", "A-4", "A-5", "A-6", "A-7"],
      reports: {
        a8: tb("2026-07-31", {
          "1-1010": 2110000,
          "1-1200": 55000,
          "2-1200": -96800,
          "2-1300": -6200,
          "3-1000": -2000000,
          "4-1000": -300000,
          "4-2000": -50000,
          "5-1000": 88000,
          "6-2000": 200000,
        }),
        a9: {
          type: "profit_and_loss",
          from: "2026-07-01",
          to: "2026-07-31",
          lines: { "4-1000": 300000, "4-2000": 50000, "5-1000": 88000, "6-2000": 200000 },
          revenue: 350000,
          expenses: 288000,
          netProfit: 62000,
        },
      },
    },
  },
  {
    checkId: "balance-sheet-and-year-end",
    kind: "fixture",
    title: "Across 30 June",
    covers: "Trading either side of 30 June. At 30 June this year's profit is current year earnings; on 31 July it has rolled into Retained Profits, and the trial balance shows only July's income and expenses.",
    batches: [
      [
        jr("y1", "Y-1", "2026-05-10", [d("1-1010", "8,000.00"), c("4-1000", "8,000.00")]),
        jr("y2", "Y-2", "2026-06-20", [d("6-2000", "3,000.00"), c("1-1010", "3,000.00")]),
        jr("y3", "Y-3", "2026-06-30", [d("1-1500", "5,000.00"), c("3-1000", "5,000.00")]),
        jr("y4", "Y-4", "2026-07-01", [d("1-1010", "1,200.00"), c("4-1000", "1,200.00")]),
        jr("y5", "Y-5", "2026-07-31", [d("6-3000", "250.00"), c("1-1500", "250.00")]),
        jr("y6", "Y-6", "2026-08-15", [d("1-1010", "400.00"), c("4-1000", "400.00")]),
        rep("y7", { type: "balance_sheet", asAt: "2026-06-30" }),
        rep("y8", { type: "balance_sheet", asAt: "2026-07-31" }),
        rep("y9", { type: "trial_balance", asAt: "2026-07-31" }),
        rep("y10", { type: "profit_and_loss", from: "2025-07-01", to: "2026-06-30" }),
      ],
    ],
    expect: {
      posted: ["Y-1", "Y-2", "Y-3", "Y-4", "Y-5", "Y-6"],
      reports: {
        y7: {
          type: "balance_sheet",
          asAt: "2026-06-30",
          lines: { "1-1010": 500000, "1-1500": 500000, "3-1000": 500000 },
          currentYearEarnings: 500000,
          assets: 1000000,
          liabilities: 0,
          equity: 1000000,
        },
        y8: {
          type: "balance_sheet",
          asAt: "2026-07-31",
          lines: { "1-1010": 620000, "1-1500": 475000, "3-1000": 500000, "3-8000": 500000 },
          currentYearEarnings: 95000,
          assets: 1095000,
          liabilities: 0,
          equity: 1095000,
        },
        y9: tb("2026-07-31", { "1-1010": 620000, "1-1500": 475000, "3-1000": -500000, "3-8000": -500000, "4-1000": -120000, "6-3000": 25000 }),
        y10: {
          type: "profit_and_loss",
          from: "2025-07-01",
          to: "2026-06-30",
          lines: { "4-1000": 800000, "6-2000": 300000 },
          revenue: 800000,
          expenses: 300000,
          netProfit: 500000,
        },
      },
    },
  },
  {
    checkId: "only-live-documents-post",
    kind: "fixture",
    title: "Only approved documents post",
    covers: "Six invoices in six states, two bills and a deleted spend: only the approved and paid ones post, and the same invoice sent twice posts once.",
    batches: [
      [
        ...(["draft", "submitted", "authorised", "paid", "voided", "deleted"] as const).map((status, i) =>
          doc(`s${i + 1}`, {
            type: "invoice",
            id: `INV-010${i + 2}`,
            date: "2026-07-14",
            status,
            contact: "Wattle Grove Childcare",
            amounts: "exclusive",
            lines: [line("Tap washers and labour", "1", "100.00", "4-1000", "GST_SALES")],
          }),
        ),
        doc("s7", {
          type: "bill",
          id: "BILL-2201",
          date: "2026-07-15",
          status: "draft",
          contact: "Copperline Supplies",
          amounts: "exclusive",
          lines: [line("Copper pipe", "1", "75.00", "5-1000", "GST_PURCHASES")],
        }),
        doc("s8", {
          type: "bill",
          id: "BILL-2202",
          date: "2026-07-15",
          status: "authorised",
          contact: "Copperline Supplies",
          amounts: "exclusive",
          lines: [line("Fittings", "1", "50.00", "5-1000", "GST_PURCHASES")],
        }),
        doc("s9", {
          type: "bank_transaction",
          id: "BT-3301",
          date: "2026-07-16",
          status: "deleted",
          direction: "spend",
          bankAccount: "1-1010",
          amounts: "inclusive",
          lines: [line("Fuel", "1", "66.00", "6-1000", "GST_PURCHASES")],
        }),
        doc("s10", {
          type: "invoice",
          id: "INV-0104",
          date: "2026-07-14",
          status: "authorised",
          contact: "Wattle Grove Childcare",
          amounts: "exclusive",
          lines: [line("Tap washers and labour", "1", "100.00", "4-1000", "GST_SALES")],
        }),
        rep("s11", { type: "trial_balance", asAt: "2026-07-31" }),
      ],
    ],
    expect: {
      refusals: { s10: "DUPLICATE_DOCUMENT" },
      posted: ["INV-0104", "INV-0105", "BILL-2202"],
      notPosted: ["INV-0102", "INV-0103", "INV-0106", "INV-0107", "BILL-2201", "BT-3301"],
      journalCount: 3,
      reports: { s11: tb("2026-07-31", { "1-1200": 22000, "2-1200": -5500, "2-1300": -1500, "4-1000": -20000, "5-1000": 5000 }) },
    },
  },
  {
    checkId: "transfer-posts-once",
    kind: "fixture",
    title: "A transfer is not cash",
    covers: "$3,500.00 moved from the cheque account to savings arrives as a transfer and two bank lines. It posts once, from the transfer, and August's cash received and spent leave it out.",
    batches: [
      [
        doc("x1", {
          type: "bank_transaction",
          id: "BT-4401",
          date: "2026-08-02",
          status: "authorised",
          direction: "receive",
          bankAccount: "1-1010",
          amounts: "inclusive",
          lines: [line("Cash job, Mr Papadopoulos", "1", "1,100.00", "4-1000", "GST_SALES")],
        }),
        doc("x2", { type: "transfer", id: "TR-4402", date: "2026-08-03", from: "1-1010", to: "1-1020", amount: "3,500.00" }),
        doc("x3", {
          type: "bank_transaction",
          id: "BT-4403",
          date: "2026-08-03",
          status: "authorised",
          direction: "spend",
          bankAccount: "1-1010",
          amounts: "no_tax",
          lines: [line("Transfer to savings", "1", "3,500.00", "1-1020", "NOT_REPORTED")],
          transfer: "TR-4402",
        }),
        doc("x4", {
          type: "bank_transaction",
          id: "BT-4404",
          date: "2026-08-03",
          status: "authorised",
          direction: "receive",
          bankAccount: "1-1020",
          amounts: "no_tax",
          lines: [line("Transfer from cheque", "1", "3,500.00", "1-1010", "NOT_REPORTED")],
          transfer: "TR-4402",
        }),
        doc("x5", {
          type: "bank_transaction",
          id: "BT-4405",
          date: "2026-08-10",
          status: "authorised",
          direction: "spend",
          bankAccount: "1-1020",
          amounts: "inclusive",
          lines: [line("Tolls", "1", "220.00", "6-1000", "GST_PURCHASES")],
        }),
        rep("x6", { type: "cash_movement", from: "2026-08-01", to: "2026-08-31" }),
        rep("x7", { type: "trial_balance", asAt: "2026-08-31" }),
      ],
    ],
    expect: {
      posted: ["BT-4401", "TR-4402", "BT-4405"],
      notPosted: ["BT-4403", "BT-4404"],
      journalCount: 3,
      journals: { "TR-4402": { date: "2026-08-03", lines: [{ account: "1-1020", amount: 350000 }, { account: "1-1010", amount: -350000 }] } },
      reports: {
        x6: { type: "cash_movement", from: "2026-08-01", to: "2026-08-31", received: 110000, spent: 22000 },
        x7: tb("2026-08-31", { "1-1010": -240000, "1-1020": 328000, "2-1300": -8000, "4-1000": -100000, "6-1000": 20000 }),
      },
    },
  },
  {
    checkId: "line-maths",
    kind: "fixture",
    title: "Line maths",
    covers: "An invoice with a 15% discount, 2.5 hours, a half-cent tax and a GST-free line; a bill entered including GST; a credit note at half price. Every line, tax and total to the cent, and a tax code the business does not have refused.",
    batches: [
      [
        doc("g1", {
          type: "invoice",
          id: "INV-0401",
          date: "2026-07-05",
          status: "authorised",
          contact: "Ironbark Cafe",
          amounts: "exclusive",
          lines: [
            line("Mixer cartridges", "3", "19.99", "4-2000", "GST_SALES", { discountPercent: "15" }),
            line("Labour, hours", "2.5", "98.00", "4-1000", "GST_SALES"),
            line("Call-out", "1", "123.45", "4-1000", "GST_SALES"),
            line("Water testing kit", "1", "45.00", "4-2000", "GST_FREE_SALES"),
          ],
        }),
        doc("g2", {
          type: "bill",
          id: "BILL-0402",
          date: "2026-07-06",
          status: "authorised",
          contact: "Copperline Supplies",
          amounts: "inclusive",
          lines: [
            line("Tempering valve", "1", "99.95", "5-1000", "GST_PURCHASES"),
            line("Olives", "3", "3.33", "5-1000", "GST_PURCHASES"),
            line("Van service", "1", "110.00", "6-1000", "GST_PURCHASES", { discountPercent: "10" }),
          ],
        }),
        doc("g3", {
          type: "credit_note",
          id: "CN-0403",
          date: "2026-07-07",
          status: "authorised",
          contact: "Ironbark Cafe",
          side: "sales",
          amounts: "exclusive",
          lines: [line("Cartridge returned, half price", "1", "10.05", "4-2000", "GST_SALES", { discountPercent: "50" })],
        }),
        doc("g4", {
          type: "invoice",
          id: "INV-0404",
          date: "2026-07-08",
          status: "authorised",
          contact: "Ironbark Cafe",
          amounts: "exclusive",
          lines: [line("Grease trap clean", "1", "300.00", "4-1000", "LUXURY_CAR")],
        }),
      ],
    ],
    expect: {
      refusals: { g4: "UNKNOWN_TAX_CODE" },
      posted: ["INV-0401", "BILL-0402", "CN-0403"],
      notPosted: ["INV-0404"],
      journals: {
        "INV-0401": {
          date: "2026-07-05",
          lines: [
            { account: "1-1200", amount: 50637, document: "INV-0401" },
            { account: "4-2000", amount: -5097, taxCode: "GST_SALES", tax: -510 },
            { account: "4-1000", amount: -24500, taxCode: "GST_SALES", tax: -2450 },
            { account: "4-1000", amount: -12345, taxCode: "GST_SALES", tax: -1235 },
            { account: "4-2000", amount: -4500, taxCode: "GST_FREE_SALES", tax: 0 },
            { account: "2-1300", amount: -4195 },
          ],
        },
        "BILL-0402": {
          date: "2026-07-06",
          lines: [
            { account: "2-1200", amount: -20894, document: "BILL-0402" },
            { account: "5-1000", amount: 9086, taxCode: "GST_PURCHASES", tax: 909 },
            { account: "5-1000", amount: 908, taxCode: "GST_PURCHASES", tax: 91 },
            { account: "6-1000", amount: 9000, taxCode: "GST_PURCHASES", tax: 900 },
            { account: "2-1300", amount: 1900 },
          ],
        },
        "CN-0403": {
          date: "2026-07-07",
          lines: [
            { account: "1-1200", amount: -553, document: "CN-0403" },
            { account: "4-2000", amount: 503, taxCode: "GST_SALES", tax: 50 },
            { account: "2-1300", amount: 50 },
          ],
        },
      },
    },
  },
  {
    checkId: "credit-allocation-date",
    kind: "fixture",
    title: "When a credit counts",
    covers: "A credit note dated 8 September is applied with a back-date of 25 August; it reduces the invoice from 8 September, not before. A supplier credit applied after its own date counts from the day it is applied.",
    batches: [
      [
        doc("k1", {
          type: "bill",
          id: "BILL-0505",
          date: "2026-08-01",
          status: "authorised",
          contact: "Southside Hire",
          amounts: "exclusive",
          lines: [line("Jetter hire", "1", "500.00", "5-1000", "GST_PURCHASES")],
        }),
        doc("k2", {
          type: "credit_note",
          id: "CN-0506",
          date: "2026-08-02",
          status: "authorised",
          contact: "Southside Hire",
          side: "purchases",
          amounts: "exclusive",
          lines: [line("Returned a day early", "1", "100.00", "5-1000", "GST_PURCHASES")],
        }),
        doc("k3", {
          type: "invoice",
          id: "INV-0501",
          date: "2026-08-05",
          status: "authorised",
          contact: "Kurrajong Strata",
          amounts: "exclusive",
          lines: [line("Stack replacement", "1", "800.00", "4-1000", "GST_SALES")],
        }),
        rep("k4", { type: "open_items", asAt: "2026-08-10" }),
        doc("k5", { type: "allocation", id: "AL-0507", date: "2026-08-20", creditNote: "CN-0506", document: "BILL-0505", amount: "110.00" }),
        doc("k6", {
          type: "credit_note",
          id: "CN-0502",
          date: "2026-09-08",
          status: "authorised",
          contact: "Kurrajong Strata",
          side: "sales",
          amounts: "exclusive",
          lines: [line("Agreed discount", "1", "200.00", "4-1000", "GST_SALES")],
        }),
        doc("k7", { type: "allocation", id: "AL-0503", date: "2026-08-25", creditNote: "CN-0502", document: "INV-0501", amount: "220.00" }),
        doc("k8", { type: "payment", id: "PAY-0504", date: "2026-09-20", document: "INV-0501", bankAccount: "1-1010", amount: "400.00" }),
        rep("k9", { type: "open_items", asAt: "2026-08-31" }),
        rep("k10", { type: "open_items", asAt: "2026-09-10" }),
        rep("k11", { type: "open_items", asAt: "2026-09-30" }),
      ],
    ],
    expect: {
      posted: ["BILL-0505", "CN-0506", "INV-0501", "AL-0507", "CN-0502", "AL-0503", "PAY-0504"],
      journals: {
        "AL-0503": {
          date: "2026-09-08",
          lines: [
            { account: "1-1200", amount: 22000, document: "CN-0502" },
            { account: "1-1200", amount: -22000, document: "INV-0501" },
          ],
        },
        "AL-0507": {
          date: "2026-08-20",
          lines: [
            { account: "2-1200", amount: -11000, document: "CN-0506" },
            { account: "2-1200", amount: 11000, document: "BILL-0505" },
          ],
        },
      },
      reports: {
        k4: { type: "open_items", asAt: "2026-08-10", items: { "BILL-0505": -55000, "CN-0506": 11000, "INV-0501": 88000 } },
        k9: { type: "open_items", asAt: "2026-08-31", items: { "BILL-0505": -44000, "INV-0501": 88000 } },
        k10: { type: "open_items", asAt: "2026-09-10", items: { "BILL-0505": -44000, "INV-0501": 66000 } },
        k11: { type: "open_items", asAt: "2026-09-30", items: { "BILL-0505": -44000, "INV-0501": 26000 } },
      },
    },
  },
  {
    checkId: "cash-basis",
    kind: "fixture",
    title: "Cash basis",
    covers: "An invoice paid in halves across July and August, a bill paid a third, a bill paid $25.00 of $77.00, a credit note applied, spend money and depreciation. Each payment counts its share of the ex-GST lines on the day it is paid.",
    batches: [
      [
        doc("p1", {
          type: "invoice",
          id: "INV-0607",
          date: "2026-07-02",
          status: "authorised",
          contact: "Mr Haddad",
          amounts: "exclusive",
          lines: [line("Toilet replacement", "1", "400.00", "4-1000", "GST_SALES")],
        }),
        doc("p2", {
          type: "bill",
          id: "BILL-0612",
          date: "2026-07-05",
          status: "authorised",
          contact: "Southside Hire",
          amounts: "exclusive",
          lines: [line("Ute hire, one day", "1", "70.00", "6-1000", "GST_PURCHASES")],
        }),
        doc("p3", {
          type: "invoice",
          id: "INV-0601",
          date: "2026-07-10",
          status: "authorised",
          contact: "Wattle Grove Childcare",
          amounts: "exclusive",
          lines: [line("Backflow test and repair", "1", "1,000.00", "4-1000", "GST_SALES"), line("Valve kit", "1", "200.00", "4-2000", "GST_SALES")],
        }),
        doc("p4", {
          type: "bill",
          id: "BILL-0604",
          date: "2026-07-12",
          status: "authorised",
          contact: "Copperline Supplies",
          amounts: "exclusive",
          lines: [line("PEX coil", "1", "300.00", "5-1000", "GST_PURCHASES")],
        }),
        doc("p5", {
          type: "bank_transaction",
          id: "BT-0609",
          date: "2026-07-15",
          status: "authorised",
          direction: "spend",
          bankAccount: "1-1010",
          amounts: "inclusive",
          lines: [line("Parking", "1", "55.00", "6-1000", "GST_PURCHASES")],
        }),
        doc("p6", { type: "payment", id: "PAY-0602", date: "2026-07-20", document: "INV-0601", bankAccount: "1-1010", amount: "660.00" }),
        doc("p7", { type: "payment", id: "PAY-0605", date: "2026-07-25", document: "BILL-0604", bankAccount: "1-1010", amount: "110.00" }),
        doc("p8", { type: "payment", id: "PAY-0611", date: "2026-07-26", document: "BILL-0612", bankAccount: "1-1010", amount: "25.00" }),
        doc("p9", {
          type: "credit_note",
          id: "CN-0606",
          date: "2026-07-28",
          status: "authorised",
          contact: "Mr Haddad",
          side: "sales",
          amounts: "exclusive",
          lines: [line("Cistern not needed", "1", "100.00", "4-1000", "GST_SALES")],
        }),
        doc("p10", { type: "allocation", id: "AL-0608", date: "2026-07-30", creditNote: "CN-0606", document: "INV-0607", amount: "110.00" }),
        jr("p11", "MJ-0610", "2026-07-31", [d("6-3000", "80.00"), c("1-1500", "80.00")]),
        doc("p12", { type: "payment", id: "PAY-0603", date: "2026-08-12", document: "INV-0601", bankAccount: "1-1010", amount: "660.00" }),
        rep("p13", { type: "cash_basis", from: "2026-07-01", to: "2026-07-31" }),
        rep("p14", { type: "cash_basis", from: "2026-08-01", to: "2026-08-31" }),
      ],
    ],
    expect: {
      reports: {
        p13: {
          type: "cash_basis",
          from: "2026-07-01",
          to: "2026-07-31",
          lines: { "4-1000": 50000, "4-2000": 10000, "5-1000": 10000, "6-1000": 7273, "6-3000": 8000 },
          netProfit: 34727,
        },
        p14: { type: "cash_basis", from: "2026-08-01", to: "2026-08-31", lines: { "4-1000": 50000, "4-2000": 10000 }, netProfit: 60000 },
      },
    },
  },
  {
    checkId: "tracking-follows-line",
    kind: "fixture",
    title: "Tracking by crew",
    covers: "Lines tracked to the North and South crews, and lines with no crew. Each P&L line counts under its own crew, the rest under Unassigned, and no bank, debtor, creditor or GST line appears.",
    batches: [
      [
        doc("v1", {
          type: "invoice",
          id: "INV-0701",
          date: "2026-07-08",
          status: "authorised",
          contact: "Ironbark Cafe",
          amounts: "exclusive",
          lines: [
            line("Grease arrestor", "1", "900.00", "4-1000", "GST_SALES", { tracking: { Crew: "North" } }),
            line("Floor waste", "1", "300.00", "4-1000", "GST_SALES", { tracking: { Crew: "South" } }),
            line("Washers", "1", "100.00", "4-2000", "GST_SALES"),
          ],
        }),
        doc("v2", {
          type: "bill",
          id: "BILL-0702",
          date: "2026-07-09",
          status: "authorised",
          contact: "Copperline Supplies",
          amounts: "exclusive",
          lines: [
            line("Arrestor parts", "1", "250.00", "5-1000", "GST_PURCHASES", { tracking: { Crew: "North" } }),
            line("Van wash", "1", "40.00", "6-1000", "GST_PURCHASES"),
          ],
        }),
        jr("v3", "MJ-0703", "2026-07-20", [d("6-1000", "60.00", { tracking: { Crew: "South" } }), c("1-1010", "60.00")]),
        rep("v4", { type: "tracked", from: "2026-07-01", to: "2026-07-31", category: "Crew" }),
      ],
    ],
    expect: {
      posted: ["INV-0701", "BILL-0702", "MJ-0703"],
      reports: {
        v4: {
          type: "tracked",
          from: "2026-07-01",
          to: "2026-07-31",
          category: "Crew",
          options: {
            North: { "4-1000": 90000, "5-1000": 25000 },
            South: { "4-1000": 30000, "6-1000": 6000 },
            Unassigned: { "4-2000": 10000, "6-1000": 4000 },
          },
        },
      },
    },
  },
  {
    checkId: "gst-labels",
    kind: "fixture",
    title: "The September quarter's GST",
    covers: "Taxable, GST-free and export sales, a credit note, a capital purchase, ordinary and GST-free purchases, a drawing that is not on the BAS, and an October invoice left out. G1, G2, G3, G10, G11, 1A and 1B, and 1A less 1B equal to the GST account's movement.",
    batches: [
      [
        doc("q1", {
          type: "invoice",
          id: "INV-0801",
          date: "2026-07-03",
          status: "authorised",
          contact: "Banksia Aged Care",
          amounts: "exclusive",
          lines: [
            line("Thermostatic mixing valves", "1", "2,000.00", "4-1000", "GST_SALES"),
            line("Water testing kits", "1", "500.00", "4-2000", "GST_FREE_SALES"),
            line("Spare parts shipped to Fiji", "1", "300.00", "4-2000", "EXPORT"),
          ],
        }),
        doc("q2", {
          type: "credit_note",
          id: "CN-0802",
          date: "2026-08-04",
          status: "authorised",
          contact: "Banksia Aged Care",
          side: "sales",
          amounts: "exclusive",
          lines: [line("One valve returned", "1", "100.00", "4-1000", "GST_SALES")],
        }),
        doc("q3", {
          type: "bill",
          id: "BILL-0803",
          date: "2026-08-10",
          status: "authorised",
          contact: "Pipe Camera Co",
          amounts: "exclusive",
          lines: [line("Drain camera", "1", "4,000.00", "1-1500", "GST_CAPITAL")],
        }),
        doc("q4", {
          type: "bill",
          id: "BILL-0804",
          date: "2026-08-11",
          status: "authorised",
          contact: "Copperline Supplies",
          amounts: "exclusive",
          lines: [line("Fittings", "1", "600.00", "5-1000", "GST_PURCHASES"), line("Bank fees on account", "1", "50.00", "6-1000", "GST_FREE_PURCHASES")],
        }),
        doc("q5", {
          type: "bank_transaction",
          id: "BT-0805",
          date: "2026-09-01",
          status: "authorised",
          direction: "spend",
          bankAccount: "1-1010",
          amounts: "inclusive",
          lines: [line("Car wash", "1", "33.00", "6-1000", "GST_PURCHASES")],
        }),
        jr("q6", "MJ-0806", "2026-09-30", [d("3-1000", "500.00"), c("1-1010", "500.00")]),
        doc("q7", {
          type: "invoice",
          id: "INV-0807",
          date: "2026-10-02",
          status: "authorised",
          contact: "Banksia Aged Care",
          amounts: "exclusive",
          lines: [line("Service visit", "1", "1,000.00", "4-1000", "GST_SALES")],
        }),
        rep("q8", { type: "gst", from: "2026-07-01", to: "2026-09-30" }),
      ],
    ],
    expect: {
      posted: ["INV-0801", "CN-0802", "BILL-0803", "BILL-0804", "BT-0805", "MJ-0806", "INV-0807"],
      reports: {
        q8: {
          type: "gst",
          from: "2026-07-01",
          to: "2026-09-30",
          G1: 289000,
          G2: 30000,
          G3: 50000,
          G10: 440000,
          G11: 74300,
          "1A": 19000,
          "1B": 46300,
          gstAccountMovement: -27300,
        },
      },
    },
  },
  {
    checkId: "opening-position-at-cutover",
    kind: "fixture",
    title: "Opening at cutover",
    covers: "The old system's trial balance at 30 September, refused when it does not balance and when nobody has signed it off, posted once signed, then locked. A late find dated 15 September is refused; the fix goes in as an October journal.",
    batches: [
      [
        {
          requestId: "o1",
          kind: "open",
          journalId: "OPENING",
          cutover: "2026-09-30",
          signedOffBy: "Jo Marsh, accountant",
          lines: [d("1-1010", "12,450.00"), d("1-1200", "4,180.00"), c("3-1000", "10,000.00"), c("4-1000", "6,000.00")],
        },
        {
          requestId: "o2",
          kind: "open",
          journalId: "OPENING",
          cutover: "2026-09-30",
          signedOffBy: null,
          lines: [
            d("1-1010", "12,450.00"),
            d("1-1200", "4,180.00"),
            d("1-1500", "9,600.00"),
            c("2-1200", "2,310.00"),
            c("2-1300", "1,120.00"),
            c("3-1000", "10,000.00"),
            c("3-8000", "6,800.00"),
            c("4-1000", "21,500.00"),
            d("5-1000", "7,900.00"),
            d("6-2000", "6,000.00"),
            d("6-1000", "1,600.00"),
          ],
        },
        {
          requestId: "o3",
          kind: "open",
          journalId: "OPENING",
          cutover: "2026-09-30",
          signedOffBy: "Jo Marsh, accountant",
          lines: [
            d("1-1010", "12,450.00"),
            d("1-1200", "4,180.00"),
            d("1-1500", "9,600.00"),
            c("2-1200", "2,310.00"),
            c("2-1300", "1,120.00"),
            c("3-1000", "10,000.00"),
            c("3-8000", "6,800.00"),
            c("4-1000", "21,500.00"),
            d("5-1000", "7,900.00"),
            d("6-2000", "6,000.00"),
            d("6-1000", "1,600.00"),
          ],
        },
        jr("o4", "LATE-1", "2026-09-15", [d("6-1000", "85.00"), c("2-1200", "85.00")]),
        jr("o5", "ADJ-1", "2026-10-01", [d("6-1000", "85.00"), c("2-1200", "85.00")]),
        rep("o6", { type: "trial_balance", asAt: "2026-10-31" }),
        rep("o7", { type: "balance_sheet", asAt: "2026-10-31" }),
      ],
    ],
    expect: {
      refusals: { o1: "UNBALANCED", o2: "OPENING_NOT_SIGNED_OFF", o4: "PERIOD_LOCKED" },
      posted: ["OPENING", "ADJ-1"],
      notPosted: ["LATE-1"],
      journalCount: 2,
      lockedThrough: "2026-09-30",
      journals: {
        OPENING: {
          date: "2026-09-30",
          lines: [
            { account: "1-1010", amount: 1245000 },
            { account: "1-1200", amount: 418000 },
            { account: "1-1500", amount: 960000 },
            { account: "2-1200", amount: -231000 },
            { account: "2-1300", amount: -112000 },
            { account: "3-1000", amount: -1000000 },
            { account: "3-8000", amount: -680000 },
            { account: "4-1000", amount: -2150000 },
            { account: "5-1000", amount: 790000 },
            { account: "6-2000", amount: 600000 },
            { account: "6-1000", amount: 160000 },
          ],
        },
      },
      reports: {
        o6: tb("2026-10-31", {
          "1-1010": 1245000,
          "1-1200": 418000,
          "1-1500": 960000,
          "2-1200": -239500,
          "2-1300": -112000,
          "3-1000": -1000000,
          "3-8000": -680000,
          "4-1000": -2150000,
          "5-1000": 790000,
          "6-1000": 168500,
          "6-2000": 600000,
        }),
        o7: {
          type: "balance_sheet",
          asAt: "2026-10-31",
          lines: { "1-1010": 1245000, "1-1200": 418000, "1-1500": 960000, "2-1200": 239500, "2-1300": 112000, "3-1000": 1000000, "3-8000": 680000 },
          currentYearEarnings: 591500,
          assets: 2623000,
          liabilities: 351500,
          equity: 2271500,
        },
      },
    },
  },
  {
    checkId: "fuzz-stays-balanced",
    kind: "invariant",
    title: "Three hundred random journals",
    covers: "A seeded run of 300 journals across two financial years, every seventh a cent out. Every balanced one posts, every other one is refused, and at four dates the trial balance matches and balances, the balance sheet balances and the chain is intact.",
    batches: [FUZZ.requests],
    expect: {
      refusals: Object.fromEntries(FUZZ.unbalanced.map((id) => [`fz${Number(id.slice(3))}`, "UNBALANCED" as RefusalCode])),
      posted: FUZZ.balanced,
      notPosted: FUZZ.unbalanced,
      journalCount: FUZZ.balanced.length,
      reports: {
        ...Object.fromEntries(FUZZ_REPORT_DATES.map((asAt, i) => [`fz-tb${i}`, fuzzTrialBalance(asAt)])),
        "fz-chain": { type: "verify_chain", ok: true, firstBad: null },
      },
    },
  },
];

// ---- judging one case ---------------------------------------------------------------

/** Everything wrong with what the build did against one case. Empty means it held. */
export function judge(gc: GoldenCase, w: LedgerCoreWorld): string[] {
  const out: string[] = [];
  const ex = gc.expect;
  const requests = w.allRequests();

  // Refusals: exactly the ones expected, with the right code.
  for (const r of requests) {
    const want = ex.refusals?.[r.requestId];
    const got = w.refusals.filter((x) => x.requestId === r.requestId);
    if (want && !got.some((x) => x.code === want)) out.push(`request ${r.requestId}: expected refusal ${want}, got ${got.map((x) => x.code).join(", ") || "none"}`);
    if (!want && got.length) out.push(`request ${r.requestId}: refused with ${got.map((x) => x.code).join(", ")}, but it should have been accepted`);
  }

  const byRef = (ref: string) => w.journals.filter((j) => j.source?.ref === ref && j.source?.type !== "reversal");
  for (const ref of ex.posted ?? []) {
    const n = byRef(ref).length;
    if (n !== 1) out.push(`${ref}: expected one journal, found ${n}`);
  }
  for (const ref of ex.notPosted ?? []) {
    const n = w.journals.filter((j) => j.source?.ref === ref || j.id === ref).length;
    if (n !== 0) out.push(`${ref}: expected nothing posted, found ${n} journal(s)`);
  }
  if (ex.journalCount !== undefined && w.journals.length !== ex.journalCount) out.push(`expected ${ex.journalCount} journal(s) in the store, found ${w.journals.length}`);

  for (const [ref, want] of Object.entries(ex.journals ?? {})) {
    const j = byRef(ref)[0];
    if (!j) {
      out.push(`${ref}: no journal to compare`);
      continue;
    }
    if (want.date && j.date !== want.date) out.push(`${ref}: expected dated ${want.date}, got ${j.date}`);
    sameLines(want.lines, j.lines, ref, out);
  }

  // Every journal the build stored must balance in whole cents, whatever the case.
  for (const j of w.journals) if (!balancedWhole(j)) out.push(`${j.id}: stored journal does not balance in whole cents`);

  for (const [requestId, want] of Object.entries(ex.reports ?? {})) compareReport(want, w.reportFor(requestId), `report ${requestId}`, out);

  if (ex.lockedThrough !== undefined && w.lockedThrough !== ex.lockedThrough) out.push(`expected locked through ${ex.lockedThrough ?? "nothing"}, got ${w.lockedThrough ?? "nothing"}`);

  // Checks of their own.
  switch (gc.checkId) {
    case "posted-journals-frozen": {
      w.journals.forEach((j, i) => {
        if (JSON.stringify(j) !== JSON.stringify(w.asAppended[i])) out.push(`${j.id}: changed after it was appended`);
      });
      const ids = w.journals.map((j) => j.id);
      if (new Set(ids).size !== ids.length) out.push("two journals share an id");
      break;
    }
    case "reversal-only-correction": {
      const orig = w.journals.find((j) => j.id === "R-1");
      const revs = w.journals.filter((j) => j.reverses === "R-1");
      if (revs.length !== 1) out.push(`expected one reversal of R-1, found ${revs.length}`);
      const rev = revs[0];
      if (rev && orig) {
        if (rev.id !== "R-1-REV") out.push(`the reversal should be R-1-REV, got ${rev.id}`);
        if (rev.date !== "2026-07-10") out.push(`the reversal should be dated 2026-07-10, got ${rev.date}`);
        if (rev.source?.type !== "reversal") out.push("the reversal's source type should be reversal");
        sameLines(
          orig.lines.map((l) => ({ ...l, amount: -l.amount, tax: l.tax === undefined ? undefined : -l.tax })),
          rev.lines,
          "R-1-REV against R-1 negated",
          out,
        );
      }
      if (w.journals.some((j) => j.id === "R-1-REV2" || j.id === "NOPE-1-REV")) out.push("a refused reversal was stored");
      break;
    }
    case "period-lock": {
      const rev = w.journals.find((j) => j.reverses === "L-1");
      if (!rev || rev.date !== "2026-08-05") out.push("L-1 should be reversed once, on 2026-08-05");
      const back = w.lockMoves.find((m) => m.through < "2026-07-31");
      if (back) out.push(`the lock was moved back to ${back.through}`);
      break;
    }
    case "hash-chain": {
      let prev = GENESIS_HASH;
      w.journals.forEach((j, i) => {
        if (j.seq !== i + 1) out.push(`${j.id}: seq ${j.seq}, expected ${i + 1}`);
        if (j.prevHash !== prev) out.push(`${j.id}: prevHash is not the previous journal's hash`);
        const { hash, ...body } = j;
        if (hash !== journalHash(body)) out.push(`${j.id}: hash is not sha256 of its canonical text`);
        prev = j.hash;
      });
      break;
    }
    case "tamper-detected": {
      if (!w.tampered.includes("T-2")) out.push("the world did not get to tamper");
      break;
    }
    case "trial-balance-and-profit":
    case "balance-sheet-and-year-end": {
      // Rebuilt from the store: a read made after the last append before each report.
      for (const r of w.reports) {
        const lastAppend = Math.max(0, ...w.appendSeqs.filter((s) => s < r.seq));
        if (!w.storeReads.some((s) => s > lastAppend && s < r.seq)) out.push(`report ${r.requestId} was not rebuilt from the store after the last journal`);
      }
      break;
    }
    case "fuzz-stays-balanced": {
      for (const r of w.reports) {
        const b = r.report;
        if (b.type === "trial_balance" && b.totalDebit !== b.totalCredit) out.push(`${r.requestId}: trial balance does not balance`);
        if (b.type === "balance_sheet" && b.assets !== b.liabilities + b.equity) out.push(`${r.requestId}: assets do not equal liabilities plus equity`);
      }
      for (const i of FUZZ_REPORT_DATES.keys()) if (!w.reportFor(`fz-bs${i}`)) out.push(`report fz-bs${i}: no report published`);
      break;
    }
  }
  return out;
}

/**
 * The golden suite, as scenarios the runner drives.
 *
 * A class with static members, so the package index exports it by name beside
 * the world. `conformance init ledger-core-build-standard` writes a
 * scenarios.mjs that runs `LedgerCoreGolden.scenarios()` as it is.
 */
export class LedgerCoreGolden {
  static readonly cases: readonly GoldenCase[] = GOLDEN_CASES;

  static worldFor(gc: GoldenCase): LedgerCoreWorld {
    return new LedgerCoreWorld({ batches: gc.batches, between: gc.between });
  }

  /** One scenario per stub check. The runner matches them to the published checks by id. */
  static scenarios(): Array<{
    checkId: string;
    world: () => LedgerCoreWorld;
    drive: (build: (ports: LedgerCorePorts) => void | Promise<void>, world: LedgerCoreWorld) => Promise<void>;
    holds: (world: LedgerCoreWorld) => boolean;
    describe: (world: LedgerCoreWorld) => string;
  }> {
    return GOLDEN_CASES.map((gc) => ({
      checkId: gc.checkId,
      world: () => LedgerCoreGolden.worldFor(gc),
      drive: async (build, world) => {
        for (let i = 0; i < world.runs; i++) {
          world.startRun(i);
          await build(world.ports());
          world.afterRun(i);
        }
      },
      holds: (world) => judge(gc, world).length === 0,
      describe: (world) => {
        const problems = judge(gc, world);
        return problems.length
          ? `${problems.length} problem(s): ${problems.slice(0, 4).join("; ")}${problems.length > 4 ? "; ..." : ""}`
          : `${world.journals.length} journal(s), ${world.refusals.length} refusal(s), ${world.reports.length} report(s), all as expected`;
      },
    }));
  }

  /** What each case expects, in words, for the page. Derived from the data, never retyped. */
  static summary(gc: GoldenCase): string[] {
    const out: string[] = [];
    const refused = Object.values(gc.expect.refusals ?? {});
    if (refused.length) {
      const counts = new Map<string, number>();
      for (const r of refused) counts.set(r, (counts.get(r) ?? 0) + 1);
      out.push(`Refused: ${[...counts].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(", ")}`);
    }
    for (const r of Object.values(gc.expect.reports ?? {})) {
      switch (r.type) {
        case "trial_balance":
          out.push(`Trial balance at ${r.asAt}: ${Object.keys(r.lines).length} accounts, debits ${formatCents(r.totalDebit)} = credits ${formatCents(r.totalCredit)}`);
          break;
        case "profit_and_loss":
          out.push(`Profit and loss ${r.from} to ${r.to}: income ${formatCents(r.revenue)}, expenses ${formatCents(r.expenses)}, net ${formatCents(r.netProfit)}`);
          break;
        case "balance_sheet":
          out.push(`Balance sheet at ${r.asAt}: assets ${formatCents(r.assets)} = liabilities ${formatCents(r.liabilities)} + equity ${formatCents(r.equity)}`);
          break;
        case "gst":
          out.push(
            `GST ${r.from} to ${r.to}: G1 ${formatCents(r.G1)}, G2 ${formatCents(r.G2)}, G3 ${formatCents(r.G3)}, G10 ${formatCents(r.G10)}, G11 ${formatCents(r.G11)}, 1A ${formatCents(r["1A"])}, 1B ${formatCents(r["1B"])}`,
          );
          break;
        case "cash_basis":
          out.push(`Cash basis ${r.from} to ${r.to}: net ${formatCents(r.netProfit)}`);
          break;
        case "tracked":
          out.push(`By ${r.category}: ${Object.keys(r.options).join(", ")}`);
          break;
        case "open_items":
          out.push(`Open at ${r.asAt}: ${Object.entries(r.items).map(([k, v]) => `${k} ${formatCents(v)}`).join(", ")}`);
          break;
        case "cash_movement":
          out.push(`Cash ${r.from} to ${r.to}: received ${formatCents(r.received)}, spent ${formatCents(r.spent)}`);
          break;
        case "verify_chain":
          out.push(r.ok ? "Chain check: intact" : `Chain check: broken at ${r.firstBad}`);
          break;
      }
    }
    return out;
  }
}

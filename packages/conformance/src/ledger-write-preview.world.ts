// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/ledger-write-preview.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The ledger write preview world: a queue of drafts another build wants to
 * write into a ledger (invoices, bills, credit notes, spend and receive
 * money, manual journals), the ledger's own tax rates, a preview book the
 * build fills, a named person's releases, and the ledger the documents land
 * in.
 *
 * THE RELEASE IS THE WORLD'S. A person releases a preview by an event between
 * runs (`release`). No port can release, so a build can only read one.
 *
 * THE IDEMPOTENCY KEY IS THE CONTRACT FOR A WRITTEN DOCUMENT. `writeDocument`
 * lands one document per key and answers a repeat with the document it
 * already holds. It does not dedupe on anything else: a build that mints a
 * fresh key per try writes the invoice twice, as it would live.
 * `loseNextAnswer` makes the next write land with no answer, the way a
 * timeout does.
 *
 * THE LEDGER STORES WHAT IT STORES. By default the stored totals are the
 * totals the build sent. `storesDifferently` makes the ledger keep other
 * totals for one draft, the way a ledger that rounds tax on the document
 * rather than per line would, so a build that never reads back is caught.
 *
 * THE WORLD DOES NOT REFUSE AN UNBALANCED JOURNAL. A real ledger may take
 * one through some endpoints, so the assertions read every preview and every
 * write (porting doc §8).
 *
 * MONEY IS WHOLE CENTS. A difference of one cent is a difference.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const DOC_TYPES = ["invoice", "bill", "credit_note", "spend_money", "receive_money", "manual_journal"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** How the line amounts are stated: before tax, including tax, or with no tax. */
export type AmountType = "exclusive" | "inclusive" | "no_tax";

export const PARK_KINDS = ["totals_differ", "unknown_tax_rate", "unbalanced", "readback_differs", "write_failed"] as const;
export type ParkKind = (typeof PARK_KINDS)[number];

/** Who owns each parked item, by role. The business names the person in Settings. */
export type OwnerRole = "releaser" | "bookkeeper";
export const PARK_OWNER: Readonly<Record<ParkKind, OwnerRole>> = {
  totals_differ: "bookkeeper",
  unknown_tax_rate: "bookkeeper",
  unbalanced: "bookkeeper",
  readback_differs: "releaser",
  write_failed: "bookkeeper",
};

export interface DraftLine {
  lineId: string;
  description: string;
  quantity: number;
  /** Cents. */
  unitPrice: number;
  /** Percent, 0 to 100. */
  discountPercent?: number;
  accountCode: string;
  /** The ledger's tax type name. Ignored when the draft has no tax. */
  taxType: string;
}

/** One line of a manual journal, as drafted. */
export interface JournalInputLine {
  lineId: string;
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}

export interface Totals {
  subtotal: number;
  totalTax: number;
  total: number;
}

export interface Draft {
  draftId: string;
  type: DocType;
  contact: string;
  date: string;
  amountType: AmountType;
  lines: DraftLine[];
  /** Manual journals only. */
  journalLines?: JournalInputLine[];
  /** The totals the upstream build stated on the draft. */
  stated: Totals;
}

export interface TaxRate {
  taxType: string;
  /** As a fraction: 0.1 for 10%. */
  rate: number;
}

/** The control accounts the journal uses, from the ledger's settings. */
export interface Accounts {
  receivable: string;
  payable: string;
  tax: string;
  bank: string;
}

export interface PreviewLine {
  lineId: string;
  amount: number;
  tax: number;
}

export interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface Preview extends Totals {
  draftId: string;
  lines: PreviewLine[];
  journal: JournalLine[];
  /** The tax rate read the line taxes came from. */
  ratesReadId: string;
}

export interface Parked {
  draftId: string;
  kind: ParkKind;
  owner: string;
  detail: string;
  /** For totals_differ: what the draft stated. */
  stated?: Totals;
  /** For totals_differ and readback_differs: what the preview recomputed. */
  recomputed?: Totals;
  /** For readback_differs: what the ledger stored. */
  ledger?: Totals;
}

export interface Release {
  previewId: string;
  draftId: string;
  by: string;
  at: string;
}

export interface WriteRequest {
  draftId: string;
  previewId: string;
  idempotencyKey: string;
  document: Preview;
}

export type WriteResult = { ok: true; documentId: string } | { ok: false; error: string };

export interface StoredDocument extends Totals {
  documentId: string;
  draftId: string;
  idempotencyKey: string;
}

export interface ReadBack {
  draftId: string;
  documentId: string;
  previewId: string;
  matches: boolean;
  ledger: Totals;
  preview: Totals;
}

export interface PreviewBook {
  previews: Array<Preview & { previewId: string }>;
  releases: Release[];
  parked: Array<{ draftId: string; kind: ParkKind }>;
  readBacks: Array<{ draftId: string; matches: boolean }>;
}

export interface Settings {
  tenant: string;
  ledger: "xero" | "myob" | "qbo";
  /** A dry run previews and parks, and writes nothing. */
  dryRun: boolean;
  accounts: Accounts;
  owners: Record<OwnerRole, string>;
}

export type Read<T> = { ok: true; readId: string; asAt: string; data: T } | { ok: false; reason: string };

export interface LedgerWritePreviewPorts {
  now(): Date;
  readSettings(): Settings;
  /** The drafts other builds have handed over to be written. */
  readDrafts(): Draft[];
  /** The ledger's own tax rates. */
  readTaxRates(): Read<TaxRate[]>;
  /** The preview book: previews written, releases a person gave, items parked, read-backs recorded. */
  readBook(): PreviewBook;
  /** One preview into the book for a person to release. Not a ledger write. */
  writePreview(p: Preview): { previewId: string };
  park(item: Parked): void;
  /** Write one released document into the ledger. One document per idempotency key. */
  writeDocument(w: WriteRequest): WriteResult;
  /** The document the ledger holds for this key, with the totals it stored, or null. */
  readDocument(idempotencyKey: string): StoredDocument | null;
  /** The comparison of the ledger's stored totals with the preview. */
  recordReadBack(r: ReadBack): void;
}

// ---- the arithmetic the standard names ------------------------------------------

/** Round to the cent, half away from zero, with float noise taken off first. */
export function roundCents(x: number): number {
  const a = Math.round(Math.abs(x) * 1e6) / 1e6;
  return Math.sign(x) * Math.round(a);
}

/** Quantity x unit price less discount, rounded to the cent. */
export function lineAmount(l: DraftLine): number {
  return roundCents(l.quantity * l.unitPrice * (1 - (l.discountPercent ?? 0) / 100));
}

/** Tax on one line: exclusive amount x rate; inclusive amount x rate / (1 + rate). */
export function lineTax(amount: number, rate: number, amountType: AmountType): number {
  if (amountType === "no_tax") return 0;
  return amountType === "inclusive" ? roundCents((amount * rate) / (1 + rate)) : roundCents(amount * rate);
}

export type Recomputed = { ok: true; preview: Omit<Preview, "draftId" | "ratesReadId"> } | { ok: false; kind: "unknown_tax_rate" | "unbalanced"; detail: string };

/** Which side each part of a document posts to. */
const SIDES: Record<Exclude<DocType, "manual_journal">, { control: keyof Accounts; controlSide: "debit" | "credit" }> = {
  invoice: { control: "receivable", controlSide: "debit" },
  credit_note: { control: "receivable", controlSide: "credit" },
  bill: { control: "payable", controlSide: "credit" },
  spend_money: { control: "bank", controlSide: "credit" },
  receive_money: { control: "bank", controlSide: "debit" },
};

const side = (accountCode: string, amount: number, s: "debit" | "credit"): JournalLine =>
  s === "debit" ? { accountCode, debit: amount, credit: 0 } : { accountCode, debit: 0, credit: amount };

/** What the preview for a draft has to say, from its inputs alone. */
export function recompute(d: Draft, rates: readonly TaxRate[], accounts: Accounts): Recomputed {
  if (d.type === "manual_journal") {
    const jl = d.journalLines ?? [];
    const debits = jl.reduce((s, l) => s + l.debit, 0);
    const credits = jl.reduce((s, l) => s + l.credit, 0);
    if (debits !== credits) return { ok: false, kind: "unbalanced", detail: `debits ${debits} and credits ${credits} cents` };
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
  const lines: PreviewLine[] = [];
  for (const l of d.lines) {
    const amount = lineAmount(l);
    let tax = 0;
    if (d.amountType !== "no_tax") {
      const r = rates.find((x) => x.taxType === l.taxType);
      if (!r) return { ok: false, kind: "unknown_tax_rate", detail: `line ${l.lineId}: the ledger has no tax rate named ${l.taxType}` };
      tax = lineTax(amount, r.rate, d.amountType);
    }
    lines.push({ lineId: l.lineId, amount, tax });
  }
  const sumAmount = lines.reduce((s, l) => s + l.amount, 0);
  const totalTax = lines.reduce((s, l) => s + l.tax, 0);
  const subtotal = d.amountType === "inclusive" ? sumAmount - totalTax : sumAmount;
  const total = subtotal + totalTax;
  const { control, controlSide } = SIDES[d.type];
  const lineSide = controlSide === "debit" ? "credit" : "debit";
  const journal: JournalLine[] = [side(accounts[control], total, controlSide)];
  d.lines.forEach((l, i) => journal.push(side(l.accountCode, lines[i].amount - (d.amountType === "inclusive" ? lines[i].tax : 0), lineSide)));
  if (totalTax !== 0) journal.push(side(accounts.tax, totalTax, lineSide));
  return { ok: true, preview: { lines, subtotal, totalTax, total, journal } };
}

/** Two journals are the same when they hold the same lines, in any order. */
export function sameJournal(a: readonly JournalLine[], b: readonly JournalLine[]): boolean {
  const key = (j: readonly JournalLine[]) => j.map((l) => `${l.accountCode}|${l.debit}|${l.credit}`).sort().join(";");
  return key(a) === key(b);
}

export function balances(j: readonly JournalLine[]): boolean {
  return j.reduce((s, l) => s + l.debit, 0) === j.reduce((s, l) => s + l.credit, 0);
}

export function sameTotals(a: Totals, b: Totals): boolean {
  return a.subtotal === b.subtotal && a.totalTax === b.totalTax && a.total === b.total;
}

// ---- the world ------------------------------------------------------------------

export interface LedgerWritePreviewWorldOptions {
  now?: Date;
  tenant?: string;
  ledger?: Settings["ledger"];
  dryRun?: boolean;
  drafts: Draft[];
  rates: TaxRate[];
  accounts?: Accounts;
  owners?: Record<OwnerRole, string>;
}

type Seq = { seq: number };

function unseq<T extends Seq>(x: T): Omit<T, "seq"> {
  const copy: Partial<T> = structuredClone(x);
  delete copy.seq;
  return copy as Omit<T, "seq">;
}

export class LedgerWritePreviewWorld {
  readonly drafts: Draft[];
  readonly rates: TaxRate[];
  readonly previews: Array<Preview & { previewId: string } & Seq> = [];
  readonly parked: Array<Parked & Seq> = [];
  readonly releases: Array<Release & Seq> = [];
  /** Every rates read served, by id. */
  readonly rateReads: Array<{ readId: string; seq: number }> = [];
  /** Every write the build attempted, landed or not. */
  readonly writeAttempts: Array<WriteRequest & Seq & { result: WriteResult }> = [];
  /** Documents that landed in the ledger, one per key. */
  readonly documents: Array<StoredDocument & Seq> = [];
  /** Every read of a document by key, with whether it was found. */
  readonly documentReads: Array<{ idempotencyKey: string; found: boolean; seq: number }> = [];
  readonly readBacks: Array<ReadBack & Seq> = [];
  readonly calls: PortCall[] = [];

  private readonly settings: Settings;
  private clock: Date;
  private seq = 0;
  private readSeq = 0;
  private failRates = false;
  private nextWrites: Array<"lose_answer" | "refuse"> = [];
  private readonly stores = new Map<string, Partial<Totals>>();

  constructor(opts: LedgerWritePreviewWorldOptions) {
    this.clock = opts.now ?? new Date("2026-11-23T23:00:00.000Z"); // Tuesday 9am Brisbane
    this.drafts = structuredClone(opts.drafts);
    this.rates = structuredClone(opts.rates);
    this.settings = {
      tenant: opts.tenant ?? "harbour",
      ledger: opts.ledger ?? "xero",
      dryRun: opts.dryRun ?? false,
      accounts: opts.accounts ?? { receivable: "610", payable: "800", tax: "820", bank: "090" },
      owners: opts.owners ?? { releaser: "Priya", bookkeeper: "Kim" },
    };
  }

  // ---- the business, between runs -------------------------------------------

  /** A named person releases the latest preview of a draft. */
  release(draftId: string, by: string): void {
    const p = [...this.previews].reverse().find((x) => x.draftId === draftId);
    if (!p) return;
    this.releases.push({ previewId: p.previewId, draftId, by, at: this.clock.toISOString(), seq: ++this.seq });
  }

  /** The ledger keeps other totals than the ones sent, for one draft. */
  storesDifferently(draftId: string, totals: Partial<Totals>): void {
    this.stores.set(draftId, { ...totals });
  }

  failTaxRates(): void {
    this.failRates = true;
  }

  loseNextAnswer(): void {
    this.nextWrites.push("lose_answer");
  }

  refuseNextWrite(): void {
    this.nextWrites.push("refuse");
  }

  advanceHours(hours: number): void {
    this.clock = new Date(this.clock.getTime() + hours * 3_600_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  get tenant(): string {
    return this.settings.tenant;
  }

  get dryRun(): boolean {
    return this.settings.dryRun;
  }

  /** What the preview for a draft has to say. */
  truth(draftId: string): Recomputed | null {
    const d = this.drafts.find((x) => x.draftId === draftId);
    return d ? recompute(d, this.rates, this.settings.accounts) : null;
  }

  draft(draftId: string): Draft | undefined {
    return this.drafts.find((x) => x.draftId === draftId);
  }

  /** The key the standard names for one released preview. */
  keyFor(draftId: string, previewId: string): string {
    return `preview:${this.settings.tenant}:${draftId}:${previewId}`;
  }

  // ---- the ports ----------------------------------------------------------------

  private record(port: Port, request: unknown, response: unknown): number {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
    return ++this.seq;
  }

  ports(): LedgerWritePreviewPorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        const out = structuredClone(this.settings);
        this.record("read_rule", { settings: true }, { ledger: out.ledger, dryRun: out.dryRun });
        return out;
      },

      readDrafts: () => {
        const out = structuredClone(this.drafts);
        this.record("read_handoffs", { drafts: true }, { count: out.length });
        return out;
      },

      readTaxRates: () => {
        if (this.failRates) {
          const out = { ok: false as const, reason: "the ledger did not answer" };
          this.record("read_ledger", { taxRates: true }, out);
          return out;
        }
        const readId = `RT-${++this.readSeq}`;
        const seq = this.record("read_ledger", { taxRates: true }, { readId, count: this.rates.length });
        this.rateReads.push({ readId, seq });
        return { ok: true, readId, asAt: this.clock.toISOString(), data: structuredClone(this.rates) };
      },

      readBook: () => {
        const out: PreviewBook = {
          previews: this.previews.map(unseq),
          releases: this.releases.map(unseq),
          parked: this.parked.map((p) => ({ draftId: p.draftId, kind: p.kind })),
          readBacks: this.readBacks.map((r) => ({ draftId: r.draftId, matches: r.matches })),
        };
        this.record("read_signoff", { book: true }, { previews: out.previews.length, releases: out.releases.length });
        return out;
      },

      writePreview: (p) => {
        const previewId = `PV-${this.previews.length + 1}`;
        const seq = this.record("propose_journal", p, { previewId });
        this.previews.push({ ...structuredClone(p), previewId, seq });
        return { previewId };
      },

      park: (item) => {
        const seq = this.record("raise_exception", item, { ok: true });
        this.parked.push({ ...structuredClone(item), seq });
      },

      writeDocument: (w) => {
        let result: WriteResult;
        const existing = this.documents.find((x) => x.idempotencyKey === w.idempotencyKey);
        if (this.nextWrites[0] === "refuse") {
          this.nextWrites.shift();
          result = { ok: false, error: "ledger unavailable" };
        } else if (existing) {
          result = { ok: true, documentId: existing.documentId };
        } else {
          const documentId = `DOC-${this.documents.length + 1}`;
          const over = this.stores.get(w.draftId) ?? {};
          this.documents.push({
            documentId,
            draftId: w.draftId,
            idempotencyKey: w.idempotencyKey,
            subtotal: over.subtotal ?? w.document.subtotal,
            totalTax: over.totalTax ?? w.document.totalTax,
            total: over.total ?? w.document.total,
            seq: this.seq + 1,
          });
          if (this.nextWrites[0] === "lose_answer") {
            this.nextWrites.shift();
            result = { ok: false, error: "timeout" };
          } else {
            result = { ok: true, documentId };
          }
        }
        const seq = this.record("write_ledger", { draftId: w.draftId, previewId: w.previewId, idempotencyKey: w.idempotencyKey, total: w.document.total }, result);
        this.writeAttempts.push({ ...structuredClone(w), seq, result: structuredClone(result) });
        return structuredClone(result);
      },

      readDocument: (idempotencyKey) => {
        const found = this.documents.find((x) => x.idempotencyKey === idempotencyKey);
        const seq = this.record("read_ledger", { idempotencyKey }, { found: !!found });
        this.documentReads.push({ idempotencyKey, found: !!found, seq });
        return found ? unseq(found) : null;
      },

      recordReadBack: (r) => {
        const seq = this.record("evidence", r, { recorded: true });
        this.readBacks.push({ ...structuredClone(r), seq });
      },
    };
  }
}

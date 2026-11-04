// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/remittance-split.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The remittance world: a bank feed, a ledger of open invoices, the
 * remittance files that explain each deposit, and the person who resolves
 * the lines that do not fit.
 *
 * ONE WRITE, AND ONLY ONE KIND. The ports give a build exactly one way to
 * change the ledger: `applyBatch`, one batch payment against one deposit.
 * There is no write-off, no credit note, no overpayment and no invoice edit
 * on the interface at all (porting doc §4: remove the capability rather than
 * writing a rule). A build that wants to "fix" a short payment has nowhere to
 * do it except by bending the batch, and the assertions read the batch line
 * by line against the remittance that justified it.
 *
 * THE LEDGER DOES NOT REFUSE A SECOND BATCH. A real ledger will happily take
 * two batch payments against one deposit; the second one is the bug. So the
 * world accepts it, and check 10 reads every attempt the build made. Where
 * the world does refuse (an invoice that does not exist, or more applied than
 * is owed, which is what a real ledger refuses too), the attempt is still
 * recorded, because a world that enforces a rule would otherwise hide the
 * build that ignored it (porting doc §8).
 *
 * THE PERSON IS NOT A PORT. Resolving an exception line is a decision the
 * runner makes between runs (`resolve`), and the build reads it through the
 * gate. A build cannot resolve its own exceptions.
 *
 * Money is held in cents. Amounts on a remittance are text, exactly as the
 * payer wrote them, and `parseAmount` is the only sanctioned reading of one.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The closed list of reasons a line, or a whole deposit, goes to a person. */
export const EXCEPTION_KINDS = [
  "total_mismatch",
  "short_paid",
  "over_paid",
  "already_settled",
  "no_such_invoice",
  "unreadable",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export interface BankLine {
  /** The deposit's id in the bank feed. The key a batch is written against. */
  depositId: string;
  /** Cents. */
  amount: number;
  date: string;
  /** The narrative on the statement line, which carries the payer's payment reference. */
  reference: string;
  payer: string;
}

export interface Invoice {
  number: string;
  contact: string;
  /** Cents. */
  total: number;
  /** Cents still owing. */
  amountDue: number;
  status: "open" | "paid" | "credited";
}

export interface RemittanceLine {
  lineNo: number;
  /** The invoice number exactly as the payer wrote it. May be blank. */
  invoice: string;
  /** The payer's own reference: a participant number, a claim number. Kept, never matched on. */
  payerRef: string;
  /** A name, if the payer printed one. Kept, never matched on. */
  name?: string;
  /** The amount exactly as written, e.g. "1,250.00". */
  amount: string;
}

export interface Remittance {
  fileId: string;
  /** How this copy arrived. The same remittance often arrives both ways. */
  source: "email" | "portal";
  payer: string;
  /** The payer's reference for the whole payment, quoted on the bank line too. */
  paymentRef: string;
  lines: RemittanceLine[];
}

export interface BatchLine {
  /** The ledger's invoice number. */
  invoiceNumber: string;
  /** Cents. */
  amount: number;
  /** The remittance line that justified this payment. */
  lineNo: number;
}

export interface Batch {
  batchId: string;
  depositId: string;
  lines: BatchLine[];
  /** Cents. */
  total: number;
  attachments: string[];
}

export type Decision =
  /** Apply the line as written: a short payment becomes a part payment, the rest stays owing. */
  | { kind: "apply_as_written" }
  /** The person names the invoice the line was really for. */
  | { kind: "reassign"; invoiceNumber: string }
  /** The person handles the whole deposit by hand. The build writes nothing for it, ever. */
  | { kind: "take_over" };

export interface Resolution {
  depositId: string;
  /** Null for a decision about the whole deposit (a total that does not match). */
  lineNo: number | null;
  decision: Decision;
  by: string;
}

export interface EvidenceEntry {
  kind: "line_read" | "matched" | "exception" | "resolved" | "applied" | "attached" | "taken_over" | "duplicate_copy";
  depositId: string;
  /** The line, the batch or the file this entry is about. */
  ref: string;
  /** For a line read: the line exactly as written. For a resolution: who, and what. */
  detail: string;
}

export interface BatchAttempt {
  depositId: string;
  lines: BatchLine[];
  applied: boolean;
  why?: string;
}

export interface RemittancePorts {
  now(): Date;
  /** The bank feed: every deposit that has landed. */
  readBankLines(): BankLine[];
  /** One invoice by its number, compared without case, spaces or punctuation. Paid and credited ones too. */
  findInvoice(number: string): Invoice | null;
  /** Every open invoice. Offered because ledgers offer it; matching on it alone is the failure. */
  openInvoices(): Invoice[];
  /** Every remittance file received, from the inbox and the payer's portal. */
  readRemittances(): Remittance[];
  /** Hand a line, or a whole deposit, to a person with a typed reason. */
  raiseException(depositId: string, lineNo: number | null, kind: ExceptionKind, detail: string): void;
  /** What a person has decided about this deposit's exceptions. */
  resolutions(depositId: string): Resolution[];
  /** The batch already applied against this deposit, if any. */
  batchFor(depositId: string): Batch | null;
  /** Apply one batch payment against one deposit. The only change the build can make to the ledger. */
  applyBatch(depositId: string, lines: BatchLine[]): { applied: boolean; batchId?: string; why?: string };
  /** Keep the remittance file against the batch payment. */
  attach(batchId: string, fileId: string): { attached: boolean };
  /** Append to the record. */
  record(entry: EvidenceEntry): void;
}

export interface RemittanceWorldOptions {
  now?: Date;
  bank?: BankLine[];
  invoices?: Invoice[];
  remittances?: Remittance[];
}

/** Invoice numbers compared without case, spaces or punctuation: "inv 1042" is INV-1042. */
export function invoiceKey(v: string): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * An amount as written, in cents, or null if it cannot be read. Accepts
 * "1250", "1250.00", "1,250.00" and "$1,250.00". Anything else is unreadable,
 * and is never guessed at.
 */
export function parseAmount(text: string): number | null {
  const t = String(text ?? "").trim().replace(/^\$/, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{2})?$/.test(t)) return null;
  const [whole, cents = "00"] = t.replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number(cents);
}

/** Cents as dollars, for exceptions a person reads. */
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-AU");
  return `${sign}$${whole}.${String(abs % 100).padStart(2, "0")}`;
}

export class RemittanceWorld {
  readonly calls: PortCall[] = [];
  readonly exceptions: Array<{ depositId: string; lineNo: number | null; kind: ExceptionKind; detail: string }> = [];
  readonly batches: Batch[] = [];
  /** Every batch the build tried to apply, accepted or refused. */
  readonly batchAttempts: BatchAttempt[] = [];
  readonly evidence: EvidenceEntry[] = [];
  /** How many batch attempts existed when each runner event happened. */
  readonly attemptsAt: { depositArrived?: number; firstResolution?: number } = {};

  private bank: BankLine[];
  private invoices: Invoice[];
  private remittances: Remittance[];
  private readonly decided: Resolution[] = [];
  private clock: Date;

  constructor(opts: RemittanceWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T00:00:00.000Z"); // Monday 10am Brisbane
    this.bank = (opts.bank ?? []).map((b) => ({ ...b }));
    this.invoices = (opts.invoices ?? []).map((i) => ({ ...i }));
    this.remittances = (opts.remittances ?? []).map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) }));
  }

  // ---- the runner, between runs ---------------------------------------------

  /** The money lands: a deposit appears in the bank feed. */
  depositArrives(line: BankLine): void {
    if (this.attemptsAt.depositArrived === undefined) this.attemptsAt.depositArrived = this.batchAttempts.length;
    this.bank.push({ ...line });
  }

  /** Another copy of a remittance arrives (the portal, after the email). */
  remittanceArrives(r: Remittance): void {
    this.remittances.push({ ...r, lines: r.lines.map((l) => ({ ...l })) });
  }

  /** A person records a decision about an exception. */
  resolve(depositId: string, lineNo: number | null, decision: Decision, by: string): void {
    if (this.attemptsAt.firstResolution === undefined) this.attemptsAt.firstResolution = this.batchAttempts.length;
    this.decided.push({ depositId, lineNo, decision, by });
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded ---------------------------------

  invoice(number: string): Invoice | undefined {
    return this.invoices.find((i) => invoiceKey(i.number) === invoiceKey(number));
  }

  bankLine(depositId: string): BankLine | undefined {
    return this.bank.find((b) => b.depositId === depositId);
  }

  attemptsFor(depositId: string): BatchAttempt[] {
    return this.batchAttempts.filter((a) => a.depositId === depositId);
  }

  exceptionsOn(depositId: string, lineNo: number | null): ExceptionKind[] {
    return this.exceptions.filter((e) => e.depositId === depositId && e.lineNo === lineNo).map((e) => e.kind);
  }

  /** Does the batch against this deposit reconcile its bank line in one click? */
  reconciles(depositId: string): boolean {
    const b = this.bankLine(depositId);
    const applied = this.batches.filter((x) => x.depositId === depositId);
    return !!b && applied.length === 1 && applied[0].total === b.amount;
  }

  /** The record for one deposit, as a person asking "what happened to this money?" would read it. */
  recordFor(depositId: string): EvidenceEntry[] {
    return this.evidence.filter((e) => e.depositId === depositId);
  }

  remittanceFiles(paymentRef: string): string[] {
    return this.remittances.filter((r) => invoiceKey(r.paymentRef) === invoiceKey(paymentRef)).map((r) => r.fileId);
  }

  /** The index of the first call to a port matching a filter, or -1. */
  firstCall(port: Port, match: (request: unknown) => boolean = () => true): number {
    return this.calls.findIndex((c) => c.port === port && match(c.request));
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
    });
  }

  ports(): RemittancePorts {
    return {
      now: () => new Date(this.clock),

      readBankLines: () => {
        const out = this.bank.map((b) => ({ ...b }));
        this.record("read_ledger", { bank: true }, { lines: out.length });
        return out;
      },

      findInvoice: (number) => {
        const found = this.invoice(number);
        this.record("read_ledger", { invoice: number }, found ? { number: found.number, status: found.status, amountDue: found.amountDue } : { none: true });
        return found ? { ...found } : null;
      },

      openInvoices: () => {
        const out = this.invoices.filter((i) => i.status === "open").map((i) => ({ ...i }));
        this.record("read_ledger", { open: true }, { count: out.length });
        return out;
      },

      readRemittances: () => {
        const out = this.remittances.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) }));
        this.record("read_file", { remittances: true }, { files: out.map((r) => r.fileId) });
        return out;
      },

      raiseException: (depositId, lineNo, kind, detail) => {
        this.exceptions.push({ depositId, lineNo, kind, detail });
        this.record("escalate", { depositId, lineNo, kind, detail }, { ok: true });
      },

      resolutions: (depositId) => {
        const out = this.decided.filter((r) => r.depositId === depositId).map((r) => ({ ...r }));
        this.record("gate", { depositId, resolutions: true }, { count: out.length });
        return out;
      },

      batchFor: (depositId) => {
        const b = this.batches.find((x) => x.depositId === depositId);
        this.record("read_ledger", { batchFor: depositId }, b ? { batchId: b.batchId } : { none: true });
        return b ? { ...b, lines: b.lines.map((l) => ({ ...l })), attachments: [...b.attachments] } : null;
      },

      applyBatch: (depositId, lines) => {
        const copy = lines.map((l) => ({ ...l }));
        let why: string | undefined;
        for (const l of copy) {
          const inv = this.invoice(l.invoiceNumber);
          if (!inv) why = `no invoice ${l.invoiceNumber}`;
          else if (inv.status !== "open") why = `${inv.number} is ${inv.status}`;
          else if (l.amount <= 0) why = `a payment of ${money(l.amount)} on ${inv.number}`;
          else if (l.amount > inv.amountDue) why = `${money(l.amount)} is more than the ${money(inv.amountDue)} owing on ${inv.number}`;
          if (why) break;
        }
        this.batchAttempts.push({ depositId, lines: copy, applied: !why, ...(why ? { why } : {}) });
        if (why) {
          this.record("write_ledger", { depositId, batch: copy }, { applied: false, why });
          return { applied: false, why };
        }
        for (const l of copy) {
          const inv = this.invoice(l.invoiceNumber)!;
          inv.amountDue -= l.amount;
          if (inv.amountDue === 0) inv.status = "paid";
        }
        const batch: Batch = {
          batchId: `BP-${this.batches.length + 1}`,
          depositId,
          lines: copy,
          total: copy.reduce((s, l) => s + l.amount, 0),
          attachments: [],
        };
        this.batches.push(batch);
        this.record("write_ledger", { depositId, batch: copy }, { applied: true, batchId: batch.batchId, total: batch.total });
        return { applied: true, batchId: batch.batchId };
      },

      attach: (batchId, fileId) => {
        const b = this.batches.find((x) => x.batchId === batchId);
        if (b && !b.attachments.includes(fileId)) b.attachments.push(fileId);
        this.record("write_file", { batchId, fileId }, { attached: !!b });
        return { attached: !!b };
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.record("evidence", entry, { recorded: true });
      },
    };
  }
}

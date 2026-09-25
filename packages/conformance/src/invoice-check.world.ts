// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/invoice-check.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The payables world: supplier invoices, the purchase orders they claim to
 * match, and the four checks that decide which queue each lands in.
 *
 * WHY IT IS NOT THE PACK WORLD. Both run ordered checks and route to queues, so
 * they looked like one world from the port list. They are not. The subject here
 * carries money: a dollar difference against a PO, a tolerance with a date, and
 * a release that must never happen without a person. The pack world's subject is
 * a document assembled from a fact graph. Sharing one world would have meant a
 * pack with an amount and an invoice with clauses, and every scenario explaining
 * which half it meant.
 *
 * THE RELEASE IS THE POINT. `releasePayment` refuses without a named person, in
 * the world rather than in the build, because check 7 says a clean pass is a
 * recommendation and not an authorisation. A build cannot blur the two here even
 * if its author wants to: there is no call that pays without a name.
 *
 * MATCHING BY INFERENCE IS MADE EXPENSIVE ON PURPOSE. Check 2 forbids matching
 * an invoice with no PO to a nearby one of a similar amount, and calls it the
 * tempting wrong answer. So `readOpenPurchaseOrders` exists and will happily
 * hand a build every open PO for that supplier. The temptation is real, the port
 * records who looked, and the assertion reads whether the build escalated or
 * guessed.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The four queues. Closed: every invoice lands in exactly one. */
export const INVOICE_QUEUES = ["clean", "exception", "hold", "escalated"] as const;
export type InvoiceQueue = (typeof INVOICE_QUEUES)[number];

/** The four checks, in the order they must run. */
export const CHECK_ORDER = [
  "po-exists",
  "amount-within-tolerance",
  "variation-approved-in-writing",
  "goods-received",
] as const;
export type CheckName = (typeof CHECK_ORDER)[number];

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  /** Cents. */
  amount: number;
  open: boolean;
}

export interface SupplierInvoice {
  id: string;
  supplierId: string;
  /** Cents. */
  amount: number;
  /** The PO the invoice itself names. Absent is the check-2 case. */
  poId?: string;
  /** A document reference in the store, for the variation record. */
  documents: string[];
  /** A note claiming verbal approval. Not a record, and check 3 says so. */
  verbalApprovalNote?: string;
  receivedGoods?: boolean;
}

export interface Tolerance {
  /** Cents a supplier invoice may exceed its PO before it is an exception. */
  overPoCents: number;
  effectiveFrom: string;
}

export interface Exception {
  invoiceId: string;
  /** The dollar difference. A percentage or a description alone fails check 6. */
  differenceCents: number;
  /** The document it was computed from. */
  source: string;
  checkName: CheckName;
}

export interface CheckRecord {
  invoiceId: string;
  checkName: CheckName;
  passed: boolean;
  /** What it saw at the time, not just the outcome. Check 8. */
  saw: string;
  at: string;
}

export interface Release {
  invoiceId: string;
  person: string;
  at: string;
}

export interface InvoicePorts {
  now(): Date;
  /** The batch to work. */
  readInvoices(): SupplierInvoice[];
  /** Every open PO for a supplier. Looking is allowed; inferring is not. */
  readOpenPurchaseOrders(supplierId: string): PurchaseOrder[];
  /** The PO an invoice names, or null. */
  readPurchaseOrder(poId: string): PurchaseOrder | null;
  /** Thresholds as readable values with their dates. Check 9. */
  readTolerances(): Tolerance[];
  /** Is there a written record in the document store? A note is not one. */
  readDocument(ref: string): { ref: string; kind: string } | null;
  /**
   * Record one check. The first failure sticks and later checks must not run:
   * a build that evaluates all four and reports the last fails check 1, and the
   * world records enough for the assertion to tell the difference.
   */
  recordCheck(invoiceId: string, checkName: CheckName, passed: boolean, saw: string): void;
  /** Put the invoice in exactly one queue. */
  route(invoiceId: string, queue: InvoiceQueue, reason: string): void;
  /** An exception with the difference and the document behind it. */
  raiseException(input: Exception): void;
  escalate(invoiceId: string, reason: string): void;
  /** Refused without a named person. There is no other way to pay. */
  releasePayment(invoiceId: string, person?: string): boolean;
}

export interface InvoiceWorldOptions {
  now?: Date;
  invoices?: SupplierInvoice[];
  purchaseOrders?: PurchaseOrder[];
  tolerances?: Tolerance[];
  documents?: Array<{ ref: string; kind: string }>;
}

export class InvoiceWorld {
  readonly checkRecords: CheckRecord[] = [];
  readonly routed: Array<{ invoiceId: string; queue: InvoiceQueue; reason: string }> = [];
  readonly exceptions: Exception[] = [];
  readonly escalations: Array<{ invoiceId: string; reason: string }> = [];
  readonly releases: Release[] = [];
  readonly refusedReleases: string[] = [];
  readonly calls: PortCall[] = [];

  private readonly invoices: SupplierInvoice[];
  private readonly pos: PurchaseOrder[];
  private readonly tolerances: Tolerance[];
  private readonly documents: Array<{ ref: string; kind: string }>;
  private clock: Date;

  constructor(opts: InvoiceWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T00:00:00.000Z");
    this.invoices = (opts.invoices ?? []).map((i) => ({ ...i }));
    this.pos = (opts.purchaseOrders ?? []).map((p) => ({ ...p }));
    this.tolerances = (opts.tolerances ?? []).map((t) => ({ ...t }));
    this.documents = (opts.documents ?? []).map((d) => ({ ...d }));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Which queues an invoice ended up in. More than one is check 4's failure. */
  queuesFor(invoiceId: string): InvoiceQueue[] {
    return [...new Set(this.routed.filter((r) => r.invoiceId === invoiceId).map((r) => r.queue))];
  }

  /** The checks recorded for an invoice, in the order they were run. */
  recordsFor(invoiceId: string): CheckRecord[] {
    return this.checkRecords.filter((r) => r.invoiceId === invoiceId);
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

  ports(): InvoicePorts {
    return {
      now: () => new Date(this.clock),

      readInvoices: () => {
        const rows = this.invoices.map((i) => ({ ...i }));
        this.record("read_ledger", { batch: true }, { invoices: rows.length });
        return rows;
      },

      readOpenPurchaseOrders: (supplierId) => {
        const rows = this.pos.filter((p) => p.supplierId === supplierId && p.open).map((p) => ({ ...p }));
        this.record("read_ledger", { openPosFor: supplierId }, { pos: rows.map((r) => r.id) });
        return rows;
      },

      readPurchaseOrder: (poId) => {
        const po = this.pos.find((p) => p.id === poId) ?? null;
        this.record("read_ledger", { poId }, po ? { id: po.id, amount: po.amount } : null);
        return po ? { ...po } : null;
      },

      readTolerances: () => {
        const rows = this.tolerances.map((t) => ({ ...t }));
        // Readable values with their dates. A threshold that exists only inside
        // the matching code cannot be returned here, which is the check.
        this.record("read_rule", { tolerances: true }, { values: rows });
        return rows;
      },

      readDocument: (ref) => {
        const doc = this.documents.find((d) => d.ref === ref) ?? null;
        this.record("evidence", { document: ref }, doc ? { kind: doc.kind } : null);
        return doc ? { ...doc } : null;
      },

      recordCheck: (invoiceId, checkName, passed, saw) => {
        this.checkRecords.push({
          invoiceId,
          checkName,
          passed,
          saw,
          at: this.clock.toISOString(),
        });
        this.record("gate", { invoiceId, check: checkName, passed }, { saw });
      },

      route: (invoiceId, queue, reason) => {
        this.routed.push({ invoiceId, queue, reason });
        this.record("gate", { invoiceId, queue, reason }, { ok: true });
      },

      raiseException: (input) => {
        this.exceptions.push({ ...input });
        this.record(
          "evidence",
          { exception: input.invoiceId },
          { differenceCents: input.differenceCents, source: input.source },
        );
      },

      escalate: (invoiceId, reason) => {
        this.escalations.push({ invoiceId, reason });
        this.record("escalate", { invoiceId, reason }, { ok: true });
      },

      releasePayment: (invoiceId, person) => {
        if (!person) {
          this.refusedReleases.push(invoiceId);
          this.record("release_payment", { invoiceId }, { released: false, why: "no named person" });
          return false;
        }
        this.releases.push({ invoiceId, person, at: this.clock.toISOString() });
        this.record("release_payment", { invoiceId, person }, { released: true });
        return true;
      },
    };
  }
}

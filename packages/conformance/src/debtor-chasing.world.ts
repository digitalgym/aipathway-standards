// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/debtor-chasing.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The debtor world: a book of money owed, a ranking, and a gate underneath it.
 *
 * WHY IT IS NOT THE CALL WORLD PLUS A LEDGER. Debtor Chasing does make calls,
 * but the thing it is judged on is what happens before the phone is picked up:
 * which rows are late off the due date, how they bucket, how they rank, who is
 * excluded, and what the gate refuses no matter how high the score. `stub.ts`
 * models a call that has already arrived. This models the decision to make one.
 *
 * WHY THE GATE IS A PORT AND NOT A HELPER. Check 10 is the load-bearing one:
 * calling hours, public holidays and a ledger-driven stop must hold even for the
 * top-ranked row in the book. If the gate were a function the build imported, a
 * build could rank first and gate later, or forget. As a port it lands in the
 * trace in order, so "no score promotes a row past any of it" is a property of
 * the recorded sequence rather than of the build's good intentions.
 *
 * WHAT THE STUB CANNOT DO, AND SAYS SO. The DNCR wash is not here. A stub cannot
 * hold a registered-user agreement or produce a wash receipt, which is exactly
 * why check 10 is `both` rather than `stub`: hours, holidays and the paid stop
 * are provable here, and the wash is the leg that runs with us.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/**
 * The four buckets, closed.
 *
 * Check 3 asserts "no row carries a free-text bucket". A string type would let a
 * build invent "very late" and still read as conformant, and the whole point of
 * four buckets is that a four-day-late customer and a June broken promise get
 * different conversations.
 */
export const BUCKETS = ["just_late", "drifting", "hard", "broken_promise"] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface Invoice {
  id: string;
  customerId: string;
  /** Cents. */
  amount: number;
  issuedAt: string;
  /** Overdue is measured off this and never off issuedAt. Check 2. */
  dueAt: string;
  paidAt?: string;
  disputed?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  /** IANA zone. Calling hours are in the debtor's zone, not the office's. */
  timezone: string;
  /** Above the configured threshold this is a relationship, not a debt to score. */
  relationship?: boolean;
}

export interface Promise_ {
  customerId: string;
  /** The follow-up date. May not be empty. */
  date: string;
  /** May be empty: "I'll pay Friday" without a figure is still a promise. */
  amount: number | null;
  capturedAt: string;
}

/** One line of the run the build proposes to work. */
export interface RunEntry {
  customerId: string;
  amount: number;
  bucket: Bucket;
  invoiceIds: string[];
  /** Set when the customer is deliberately out of the dial list. */
  excludedReason?: string;
}

export interface GateDecision {
  allowed: boolean;
  reason?: "outside_hours" | "public_holiday" | "already_paid" | "promise_pending";
}

export interface Override {
  customerId: string;
  reason: string;
  approver: string;
  at: string;
}

export interface DebtorPorts {
  now(): Date;
  /** The book, as the accounting system has it right now. */
  readLedger(): Invoice[];
  /** Everything known about who owes it. */
  readCustomers(): Customer[];
  /** Promises already captured, so a build can honour check 9 on a later run. */
  readPromises(): Promise_[];
  /** Submit the run. The world records it; the assertions read it. */
  rank(entries: RunEntry[]): void;
  /** Ask whether this customer may be dialled right now. */
  gate(customerId: string): GateDecision;
  /**
   * Override a held row. Refused without a named approver, which is check 11:
   * an exception nobody signed is not an exception, it is a bypass.
   */
  override(input: { customerId: string; reason: string; approver?: string }): boolean;
  recordPromise(input: { customerId: string; date: string; amount: number | null }): Promise_ | null;
  /** The AI disclosure. Standing in for the dial itself: no disclose, no call. */
  disclose(customerId: string, text: string): void;
  escalate(reason: string, detail?: string): void;
}

export interface DebtorWorldOptions {
  now?: Date;
  invoices?: Invoice[];
  customers?: Customer[];
  promises?: Promise_[];
  /** Dates (YYYY-MM-DD) that are public holidays in the debtor's state. */
  holidays?: string[];
  /** Local hours a call is permitted, inclusive start, exclusive end. */
  callingHours?: { from: number; to: number };
}

export class DebtorWorld {
  readonly runs: RunEntry[][] = [];
  readonly promises: Promise_[] = [];
  readonly overrides: Override[] = [];
  readonly refusedOverrides: Array<{ customerId: string; why: string }> = [];
  readonly dials: Array<{ customerId: string; text: string; at: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly gateDecisions: Array<{ customerId: string; decision: GateDecision; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly invoices: Invoice[];
  private readonly customers: Customer[];
  private readonly holidays: string[];
  private readonly hours: { from: number; to: number };
  private clock: Date;

  constructor(opts: DebtorWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane
    this.invoices = (opts.invoices ?? []).map((i) => ({ ...i }));
    this.customers = (opts.customers ?? []).map((c) => ({ ...c }));
    this.promises = (opts.promises ?? []).map((p) => ({ ...p }));
    this.holidays = opts.holidays ?? [];
    this.hours = opts.callingHours ?? { from: 8, to: 19 };
  }

  /** The runner moves time. A build never does. Check 9 runs four days of it. */
  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The ledger shows it paid, mid-campaign. Check 10's third leg. */
  markPaid(invoiceId: string): void {
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (inv) inv.paidAt = this.clock.toISOString();
  }

  /** The last run submitted, which is what most assertions read. */
  get lastRun(): RunEntry[] {
    return this.runs[this.runs.length - 1] ?? [];
  }

  private localHour(customerId: string): number {
    const c = this.customers.find((x) => x.id === customerId);
    // Offsets rather than a tz library: the standards ship as a copied file and
    // a dependency here would follow them into the published package.
    const offsets: Record<string, number> = {
      "Australia/Brisbane": 10,
      "Australia/Sydney": 10,
      "Australia/Perth": 8,
      "Australia/Adelaide": 9.5,
    };
    const offset = offsets[c?.timezone ?? "Australia/Brisbane"] ?? 10;
    return (this.clock.getUTCHours() + this.clock.getUTCMinutes() / 60 + offset) % 24;
  }

  private localDate(customerId: string): string {
    const c = this.customers.find((x) => x.id === customerId);
    const offsets: Record<string, number> = {
      "Australia/Brisbane": 10,
      "Australia/Sydney": 10,
      "Australia/Perth": 8,
      "Australia/Adelaide": 9.5,
    };
    const offset = offsets[c?.timezone ?? "Australia/Brisbane"] ?? 10;
    const local = new Date(this.clock.getTime() + offset * 3600_000);
    return local.toISOString().slice(0, 10);
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

  /** Hand this to the build. It is the only door. */
  ports(): DebtorPorts {
    return {
      now: () => new Date(this.clock),

      readLedger: () => {
        const rows = this.invoices.map((i) => ({ ...i }));
        this.record("read_ledger", { at: this.clock.toISOString() }, { rows: rows.length });
        return rows;
      },

      readCustomers: () => {
        const rows = this.customers.map((c) => ({ ...c }));
        this.record("read_ledger", { customers: true }, { rows: rows.length });
        return rows;
      },

      readPromises: () => {
        const rows = this.promises.map((p) => ({ ...p }));
        this.record("read_ledger", { promises: true }, { rows: rows.length });
        return rows;
      },

      rank: (entries) => {
        this.runs.push(entries.map((e) => ({ ...e })));
        this.record(
          "rank",
          { entries: entries.length },
          { order: entries.map((e) => e.customerId) },
        );
      },

      gate: (customerId) => {
        const hour = this.localHour(customerId);
        const date = this.localDate(customerId);
        const owed = this.invoices.filter((i) => i.customerId === customerId && !i.paidAt);
        const promise = this.promises.find((p) => p.customerId === customerId);

        let decision: GateDecision = { allowed: true };
        if (owed.length === 0) decision = { allowed: false, reason: "already_paid" };
        else if (this.holidays.includes(date)) decision = { allowed: false, reason: "public_holiday" };
        else if (hour < this.hours.from || hour >= this.hours.to) {
          decision = { allowed: false, reason: "outside_hours" };
        } else if (promise && promise.date > date) {
          decision = { allowed: false, reason: "promise_pending" };
        }

        this.gateDecisions.push({ customerId, decision, at: this.clock.toISOString() });
        this.record("gate", { customerId, localHour: Math.round(hour * 100) / 100, date }, decision);
        return decision;
      },

      override: ({ customerId, reason, approver }) => {
        if (!approver) {
          this.refusedOverrides.push({ customerId, why: "no named approver" });
          this.record("gate", { override: customerId, reason }, { accepted: false });
          return false;
        }
        this.overrides.push({ customerId, reason, approver, at: this.clock.toISOString() });
        this.record("gate", { override: customerId, reason, approver }, { accepted: true });
        return true;
      },

      recordPromise: ({ customerId, date, amount }) => {
        // A promise with no date is not a promise. Amount may be null.
        if (!date) {
          this.record("record_promise", { customerId, date, amount }, { id: null });
          return null;
        }
        const promise: Promise_ = {
          customerId,
          date,
          amount,
          capturedAt: this.clock.toISOString(),
        };
        this.promises.push(promise);
        this.record("record_promise", { customerId, date, amount }, { capturedAt: promise.capturedAt });
        return { ...promise };
      },

      disclose: (customerId, text) => {
        this.dials.push({ customerId, text, at: this.clock.toISOString() });
        this.record("disclose", { customerId, text }, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

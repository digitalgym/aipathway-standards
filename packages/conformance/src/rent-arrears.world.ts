// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/rent-arrears.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The tenancy world: arrears measured off a paid-to date, thresholds that are
 * dated rules per state, and a stop evaluated before every single message.
 *
 * WHY THE LEDGER IS RE-READ AND NOT HANDED OVER. Check 1 says a cached position
 * surviving into the second run fails, and check 4 says a build that evaluates
 * stops once at the top of a sequence sends messages it should not. Both are the
 * same bug at different scales, and neither is observable if the world hands the
 * build a balance it can hold. So `readLedger` returns a snapshot with the read
 * time on it, `sendMessage` refuses when the snapshot it was given is stale, and
 * the refusal is the recorded result rather than a promise the build kept.
 *
 * WHY PAID-TO IS A FIELD AND NOT A DERIVED NUMBER. Check 2: two tenancies with
 * identical balances but paid-to dates a fortnight apart must escalate at
 * different times, and a balance alone fails. A world that exposed only a
 * balance would make the correct build and the wrong one indistinguishable, so
 * the paid-to date is carried on every read and must be carried into the rank.
 *
 * WHY THERE IS NO PORT THAT ISSUES A NOTICE. `prepareNotice` exists and
 * `releaseNotice` needs a named person. Skipping a stage is a tribunal problem
 * and the clock is in the Act, not in a chase sequence.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const STATES = ["QLD", "VIC", "NSW"] as const;
export type State = (typeof STATES)[number];

export interface Tenancy {
  id: string;
  state: State;
  /** Cents owed. Never enough on its own. */
  balance: number;
  /** Rent is paid up to this date. This drives the timing, not the balance. */
  paidToDate: string;
  /** The tenant has stated hardship. Routes to a person, not to step three. */
  hardship?: boolean;
  timezone?: string;
}

/** Thresholds and notice periods, per state, with dates. */
export interface ArrearsRule {
  state: State;
  effectiveFrom: string;
  /** Days past paid-to before the tenancy is escalatable. */
  thresholdDays: number;
  /** Days of notice the Act requires at this stage. */
  noticeDays: number;
}

export interface LedgerSnapshot {
  tenancyId: string;
  balance: number;
  paidToDate: string;
  /** When this was read. A message sent against a stale one is refused. */
  readAt: string;
  /** The read failed outright. Neither messageable nor ignorable. */
  failed?: boolean;
}

export interface ArrearsEntry {
  tenancyId: string;
  balance: number;
  /** Must be carried beside the balance. Check 2. */
  paidToDate: string;
  daysPastPaidTo: number;
}

export interface SentMessage {
  tenancyId: string;
  channel: "sms";
  body: string;
  at: string;
}

export interface ArrearsPorts {
  now(): Date;
  readTenancies(): Tenancy[];
  /** A dated snapshot. Hold it too long and the world will refuse to send. */
  readLedger(tenancyId: string): LedgerSnapshot;
  /** The rule in force for a state at the clock. */
  readRule(state: State): ArrearsRule | null;
  rank(entries: ArrearsEntry[]): void;
  /**
   * Send one message. Refused when the snapshot is stale, when the tenancy is
   * square, or outside permitted hours. The stop is evaluated here, per message,
   * because that is the only place a build cannot skip it.
   */
  sendMessage(input: { tenancyId: string; body: string; snapshot: LedgerSnapshot }): {
    sent: boolean;
    why?: string;
  };
  /** The automated-conversation disclosure. */
  disclose(tenancyId: string, text: string): { opened: boolean; why?: string };
  /** Every message sent, retrievable with timestamp and recipient. Check 6. */
  messagesFor(tenancyId: string): SentMessage[];
  prepareNotice(tenancyId: string): void;
  releaseNotice(tenancyId: string, person?: string): boolean;
  /**
   * Attach a fee. Refused without a named person, and the refusal is a HELD
   * ITEM rather than a silent skip: check 7 asks for both halves, because a
   * build that quietly does nothing looks identical to one that has no fee rule
   * at all, and only one of those is finished.
   */
  applyFee(input: { tenancyId: string; cents: number; person?: string }): boolean;
  escalate(tenancyId: string, reason: string): void;
}

export interface ArrearsWorldOptions {
  now?: Date;
  tenancies?: Tenancy[];
  rules?: ArrearsRule[];
  /** Tenancy ids whose ledger read fails outright. */
  failingReads?: string[];
  /** How old a snapshot may be before a send is refused. */
  staleAfterMs?: number;
  callingHours?: { from: number; to: number };
}

const DAY = 86_400_000;

export class ArrearsWorld {
  readonly runs: ArrearsEntry[][] = [];
  readonly sent: SentMessage[] = [];
  readonly refusedSends: Array<{ tenancyId: string; why: string }> = [];
  readonly disclosures: Array<{ tenancyId: string; at: string }> = [];
  readonly refusedDisclosures: Array<{ tenancyId: string; why: string }> = [];
  readonly notices: Array<{ tenancyId: string; releasedBy?: string; issuedAt?: string }> = [];
  readonly refusedReleases: string[] = [];
  readonly escalations: Array<{ tenancyId: string; reason: string }> = [];
  readonly ledgerWrites: Array<{ tenancyId: string; cents: number; person: string }> = [];
  readonly heldFees: Array<{ tenancyId: string; cents: number; why: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly tenancies: Tenancy[];
  private readonly rules: ArrearsRule[];
  private readonly failingReads: string[];
  private readonly staleAfterMs: number;
  private readonly hours: { from: number; to: number };
  private clock: Date;

  constructor(opts: ArrearsWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane
    this.tenancies = (opts.tenancies ?? []).map((t) => ({ ...t }));
    this.rules = (opts.rules ?? []).map((r) => ({ ...r }));
    this.failingReads = opts.failingReads ?? [];
    this.staleAfterMs = opts.staleAfterMs ?? 60 * 60 * 1000;
    this.hours = opts.callingHours ?? { from: 8, to: 19 };
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The tenant pays, mid-sequence. The runner does this, never the build. */
  credit(tenancyId: string, cents: number): void {
    const t = this.tenancies.find((x) => x.id === tenancyId);
    if (t) {
      t.balance = Math.max(0, t.balance - cents);
      if (t.balance === 0) t.paidToDate = this.clock.toISOString();
    }
  }

  tenancyById(id: string): Tenancy | undefined {
    return this.tenancies.find((t) => t.id === id);
  }

  get lastRun(): ArrearsEntry[] {
    return this.runs[this.runs.length - 1] ?? [];
  }

  /** Messages without recording a call, for assertions. */
  storedMessages(tenancyId: string): SentMessage[] {
    return this.sent.filter((m) => m.tenancyId === tenancyId);
  }

  private localHour(): number {
    // Brisbane, which is all the seeded tenancies. Offsets rather than a tz
    // library: this file is copied into the published package.
    return (this.clock.getUTCHours() + this.clock.getUTCMinutes() / 60 + 10) % 24;
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

  ports(): ArrearsPorts {
    return {
      now: () => new Date(this.clock),

      readTenancies: () => {
        const rows = this.tenancies.map((t) => ({ ...t }));
        this.record("read_ledger", { tenancies: true }, { count: rows.length });
        return rows;
      },

      readLedger: (tenancyId) => {
        const t = this.tenancyById(tenancyId);
        if (!t || this.failingReads.includes(tenancyId)) {
          const snap: LedgerSnapshot = {
            tenancyId,
            balance: 0,
            paidToDate: "",
            readAt: this.clock.toISOString(),
            failed: true,
          };
          this.record("read_ledger", { tenancyId }, { failed: true });
          return snap;
        }
        const snap: LedgerSnapshot = {
          tenancyId,
          balance: t.balance,
          paidToDate: t.paidToDate,
          readAt: this.clock.toISOString(),
        };
        this.record("read_ledger", { tenancyId }, { balance: snap.balance, paidToDate: snap.paidToDate });
        return snap;
      },

      readRule: (state) => {
        const now = this.clock.toISOString();
        const rule =
          this.rules
            .filter((r) => r.state === state && r.effectiveFrom <= now)
            .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
            .pop() ?? null;
        this.record("read_rule", { state }, rule ? { ...rule } : null);
        return rule ? { ...rule } : null;
      },

      rank: (entries) => {
        this.runs.push(entries.map((e) => ({ ...e })));
        this.record("rank", { entries: entries.length }, { order: entries.map((e) => e.tenancyId) });
        },

      sendMessage: ({ tenancyId, body, snapshot }) => {
        const t = this.tenancyById(tenancyId);
        const age = this.clock.getTime() - new Date(snapshot.readAt).getTime();

        let why: string | undefined;
        if (snapshot.failed) why = "ledger read failed";
        else if (age > this.staleAfterMs) why = "ledger snapshot is stale";
        // The stop, evaluated per message. A build that checked once at the top
        // of its sequence reaches this with a square tenancy and is refused.
        else if (!t || t.balance === 0) why = "tenancy is square";
        else {
          const hour = this.localHour();
          if (hour < this.hours.from || hour >= this.hours.to) why = "outside permitted hours";
        }

        if (why) {
          this.refusedSends.push({ tenancyId, why });
          this.record("send_sms", { tenancyId, body }, { sent: false, why });
          return { sent: false, why };
        }

        const msg: SentMessage = { tenancyId, channel: "sms", body, at: this.clock.toISOString() };
        this.sent.push(msg);
        this.record("send_sms", { tenancyId, body }, { sent: true, at: msg.at });
        return { sent: true };
      },

      disclose: (tenancyId, text) => {
        const hour = this.localHour();
        if (hour < this.hours.from || hour >= this.hours.to) {
          const why = "outside permitted hours";
          this.refusedDisclosures.push({ tenancyId, why });
          this.record("disclose", { tenancyId, text }, { opened: false, why });
          return { opened: false, why };
        }
        this.disclosures.push({ tenancyId, at: this.clock.toISOString() });
        this.record("disclose", { tenancyId, text }, { opened: true });
        return { opened: true };
      },

      messagesFor: (tenancyId) => {
        const rows = this.storedMessages(tenancyId);
        this.record("evidence", { messagesFor: tenancyId }, { count: rows.length });
        return rows.map((m) => ({ ...m }));
      },

      prepareNotice: (tenancyId) => {
        if (!this.notices.some((n) => n.tenancyId === tenancyId)) {
          this.notices.push({ tenancyId });
        }
        this.record("issue_notice", { prepare: tenancyId }, { issued: false, awaiting: "a named release" });
      },

      releaseNotice: (tenancyId, person) => {
        const notice = this.notices.find((n) => n.tenancyId === tenancyId);
        if (!notice) return false;
        if (!person) {
          this.refusedReleases.push(tenancyId);
          this.record("issue_notice", { release: tenancyId }, { issued: false, why: "no named person" });
          return false;
        }
        notice.releasedBy = person;
        notice.issuedAt = this.clock.toISOString();
        this.record("issue_notice", { release: tenancyId, person }, { issued: true });
        return true;
      },

      applyFee: ({ tenancyId, cents, person }) => {
        if (!person) {
          // Held, and visible as held. Not a silent skip.
          this.heldFees.push({ tenancyId, cents, why: "no named person" });
          this.record("gate", { fee: tenancyId, cents }, { applied: false, held: true });
          return false;
        }
        this.ledgerWrites.push({ tenancyId, cents, person });
        this.record("write_ledger", { fee: tenancyId, cents, person }, { applied: true });
        return true;
      },

      escalate: (tenancyId, reason) => {
        this.escalations.push({ tenancyId, reason });
        this.record("escalate", { tenancyId, reason }, { ok: true });
      },
    };
  }

  /** Days past the paid-to date at the clock. The timing number. */
  daysPastPaidTo(tenancyId: string): number {
    const t = this.tenancyById(tenancyId);
    if (!t) return 0;
    return Math.floor((this.clock.getTime() - new Date(t.paidToDate).getTime()) / DAY);
  }
}

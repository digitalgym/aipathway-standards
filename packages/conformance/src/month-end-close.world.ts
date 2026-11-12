// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/month-end-close.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The month-end close world: a business with one or more entities, each on a
 * ledger, closing one period. For each entity the world holds what the ledger
 * would answer (bank accounts against their statements, uncoded lines, the
 * aged receivables and payables beside their control accounts, the pay runs
 * the business expects and the ones posted, the tax return figure beside the
 * tax control account, the clearing accounts), the business's own schedule of
 * accruals and prepayments, the close pack the build fills, a person's
 * sign-off, the journals posted, and the lock date.
 *
 * THE SIGN-OFF IS THE WORLD'S. A person signs off by an event between runs
 * (`signOff`), naming the proposed journals they approve. No port can sign
 * off, so a build can only read one.
 *
 * THE INTENT ID IS THE CONTRACT FOR A POSTED JOURNAL. `postJournal` lands one
 * journal per intent id and answers a repeat with the journal it already
 * holds. It does not dedupe on anything else: a build that mints a fresh id
 * per try posts the accrual twice, as it would live. `loseNextAnswer` makes
 * the next post land with no answer, the way a timeout does.
 *
 * THE LOCK DATE IS WRITABLE ONLY WHERE THE ENTITY SAYS SO. As at 12 November
 * 2026 the Xero and MYOB Business APIs read the lock date and cannot write
 * it, and Intuit's own reference does not confirm a write for QuickBooks
 * Online. So an entity carries `lockWritable`, and on one that is false
 * `setLockDate` is refused, as the adapter would refuse it. A person sets it
 * (`personSetsLock`) and the build reads it back. The world does NOT refuse a
 * lock date earlier than the current one on a writable ledger, because a real
 * ledger will take it: the assertions read every attempt (porting doc §8).
 *
 * MONEY IS WHOLE CENTS. A difference of forty cents is a difference.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The checklist, in order. Every item gets a result for every entity. */
export const CLOSE_ITEMS = [
  "bank",
  "uncoded",
  "receivables",
  "payables",
  "payroll",
  "accruals",
  "tax_control",
  "clearing",
] as const;
export type CloseItem = (typeof CLOSE_ITEMS)[number];

export type ItemStatus = "pass" | "fail" | "could_not_check";

/** Which ledger read is evidence for which item. */
export const EVIDENCE_READ: Readonly<Record<CloseItem, ReadKind>> = {
  bank: "bank",
  uncoded: "uncoded",
  receivables: "receivables",
  payables: "payables",
  payroll: "payroll",
  accruals: "schedule",
  tax_control: "controls",
  clearing: "controls",
};

export type ReadKind = "bank" | "uncoded" | "receivables" | "payables" | "payroll" | "schedule" | "controls";

export const EXCEPTION_KINDS = ["uncoded", "no_amount", "write_failed"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** Who owns each exception, by role. The business names the person in Settings. */
export type OwnerRole = "reviewer" | "bookkeeper" | "uncoded_query";
export const EXCEPTION_OWNER: Readonly<Record<ExceptionKind, OwnerRole>> = {
  // An uncoded or suspense line is the Uncoded Query standard's to chase.
  uncoded: "uncoded_query",
  no_amount: "bookkeeper",
  write_failed: "bookkeeper",
};

export interface Entity {
  entityId: string;
  name: string;
  /** Whether this entity's ledger API can write the lock date. */
  lockWritable: boolean;
}

export interface Period {
  id: string;
  start: string;
  end: string;
}

export interface BankAccount {
  accountId: string;
  name: string;
  /** The date the last statement line reconciled is dated. */
  statementDate: string;
  /** Null when the statement balance cannot be read. */
  statementBalance: number | null;
  ledgerBalance: number;
  unreconciledLines: number;
}

export interface UncodedLine {
  lineId: string;
  accountCode: string;
  date: string;
  amount: number;
  description: string;
}

export interface AgedSide {
  agedTotal: number;
  controlBalance: number;
}

export interface Payroll {
  expectedPayDates: string[];
  postedPayDates: string[];
}

export interface Controls {
  taxReturnTotal: number;
  taxControlBalance: number;
  clearing: Array<{ account: string; balance: number }>;
}

/** One line of the schedule the business keeps. */
export interface ScheduleLine {
  lineId: string;
  kind: "accrual" | "prepayment";
  description: string;
  debitAccount: string;
  creditAccount: string;
  /** The amount the schedule holds. Null when a person has to enter it each month. */
  amount: number | null;
  /** A person's entry for this period, with who and when. */
  entered?: { amount: number; by: string; at: string };
  /** What was posted last month. History, never a source for this month. */
  lastPosted?: number;
}

export interface LedgerState {
  bank: BankAccount[];
  uncoded: UncodedLine[];
  receivables: AgedSide;
  payables: AgedSide;
  payroll: Payroll;
  controls: Controls;
  schedule: ScheduleLine[];
  lockDate: string | null;
}

export type Read<T> =
  | { ok: true; readId: string; asAt: string; data: T }
  | { ok: false; reason: string };

export interface ItemResult {
  entityId: string;
  period: string;
  item: CloseItem;
  status: ItemStatus;
  /** Required for pass and fail: the read it came from, and what it showed. */
  evidence?: { readId: string; detail: string };
  detail: string;
}

export interface JournalProposal {
  entityId: string;
  period: string;
  scheduleLineId: string;
  source: "schedule" | "person_entry";
  /** For a person's entry: who entered the amount. */
  enteredBy?: string;
  amount: number;
  debitAccount: string;
  creditAccount: string;
  date: string;
  narration: string;
}

export interface Signoff {
  entityId: string;
  period: string;
  by: string;
  at: string;
  approvedProposalIds: string[];
}

export interface JournalPost {
  entityId: string;
  proposalId: string;
  intentId: string;
  amount: number;
  debitAccount: string;
  creditAccount: string;
  date: string;
  narration: string;
}

export type WriteResult = { ok: true; journalId: string } | { ok: false; error: string };

export interface PostedJournal {
  journalId: string;
  entityId: string;
  intentId: string;
  proposalId: string;
  amount: number;
  date: string;
}

export interface ExceptionItem {
  entityId: string;
  period: string;
  kind: ExceptionKind;
  owner: string;
  /** The uncoded line, schedule line or proposal it is about. */
  ref: string;
  detail: string;
}

export interface TaskItem {
  entityId: string;
  period: string;
  what: "set_lock_date";
  owner: string;
  detail: string;
}

export interface Handoff {
  entityId: string;
  period: string;
  lockDate: string;
  /** Who receives the closed period. */
  to: "recurring-report";
}

/** The close pack for one entity and period, as the build and the reviewer see it. */
export interface ClosePack {
  entityId: string;
  period: string;
  results: ItemResult[];
  proposals: Array<JournalProposal & { proposalId: string }>;
  raised: Array<{ kind: ExceptionKind; ref: string }>;
  lockTasks: number;
  handedOff: boolean;
  signoff: Signoff | null;
}

export interface Settings {
  tenant: string;
  period: Period;
  entities: Entity[];
  owners: Record<OwnerRole, string>;
}

export interface MonthEndClosePorts {
  now(): Date;
  readSettings(): Settings;
  /** The close pack: what has been recorded, proposed and raised, and the sign-off if a person has given one. */
  readClose(entityId: string): ClosePack;
  readBank(entityId: string): Read<BankAccount[]>;
  readUncoded(entityId: string): Read<UncodedLine[]>;
  readAged(entityId: string, side: "receivables" | "payables"): Read<AgedSide>;
  readPayroll(entityId: string): Read<Payroll>;
  readControls(entityId: string): Read<Controls>;
  /** The schedule of accruals and prepayments the business keeps, with any amounts a person entered this period. */
  readSchedule(entityId: string): Read<ScheduleLine[]>;
  /** One item's result into the close pack, with its evidence. */
  recordResult(result: ItemResult): void;
  raiseException(item: ExceptionItem): void;
  /** A journal into the close pack for a person to approve. Not a ledger write. */
  proposeJournal(p: JournalProposal): { proposalId: string };
  /** Post one approved journal into the ledger. One journal per intent id. */
  postJournal(j: JournalPost): WriteResult;
  /** The journals the ledger holds for this entity and period, read back. */
  readJournals(entityId: string): PostedJournal[];
  readLockDate(entityId: string): { lockDate: string | null; writable: boolean };
  setLockDate(entityId: string, date: string): { ok: true } | { ok: false; error: string };
  raiseTask(t: TaskItem): void;
  handOff(h: Handoff): void;
}

export interface MonthEndCloseWorldOptions {
  now?: Date;
  tenant?: string;
  period?: Period;
  entities?: Entity[];
  ledgers?: Record<string, LedgerState>;
  owners?: Record<OwnerRole, string>;
}

type Seq = { seq: number };

/** A copy without the world's sequence number, which is for assertions only. */
function unseq<T extends Seq>(x: T): Omit<T, "seq"> {
  const copy: Partial<T> = structuredClone(x);
  delete copy.seq;
  return copy as Omit<T, "seq">;
}

export class MonthEndCloseWorld {
  readonly entities: Entity[];
  readonly period: Period;
  readonly results: Array<ItemResult & Seq> = [];
  /** Every ledger read served, by id, with what it was for. */
  readonly reads: Array<{ readId: string; entityId: string; kind: ReadKind; seq: number }> = [];
  readonly proposals: Array<JournalProposal & { proposalId: string } & Seq> = [];
  readonly signoffs: Array<Signoff & Seq> = [];
  /** Every post the build attempted, landed or not. */
  readonly postAttempts: Array<JournalPost & Seq & { result: WriteResult }> = [];
  /** Journals that landed in the ledger, one per intent id. */
  readonly journals: Array<PostedJournal & Seq> = [];
  /** Every read-back of the journals, by entity. */
  readonly journalReads: Array<{ entityId: string; seq: number; count: number }> = [];
  /** Every lock date write attempted, refused or not, with the lock date it found. */
  readonly lockAttempts: Array<{ entityId: string; date: string; before: string | null; ok: boolean; seq: number }> = [];
  /** Every lock date read, with what it answered. */
  readonly lockReads: Array<{ entityId: string; lockDate: string | null; seq: number }> = [];
  /** Lock dates a person set by hand. */
  readonly manualLocks: Array<{ entityId: string; date: string; seq: number }> = [];
  readonly tasks: Array<TaskItem & Seq> = [];
  readonly exceptions: Array<ExceptionItem & Seq> = [];
  readonly handoffs: Array<Handoff & Seq> = [];
  readonly calls: PortCall[] = [];

  private readonly ledgers: Record<string, LedgerState>;
  private readonly settings: Settings;
  private clock: Date;
  private seq = 0;
  private readSeq = 0;
  private readonly failing = new Set<string>();
  private nextPosts: Array<"lose_answer" | "refuse"> = [];

  constructor(opts: MonthEndCloseWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-04T23:00:00.000Z"); // Thursday 9am Brisbane
    this.period = opts.period ?? { id: "2026-10", start: "2026-10-01", end: "2026-10-31" };
    this.entities = (opts.entities ?? []).map((e) => ({ ...e }));
    this.ledgers = structuredClone(opts.ledgers ?? {});
    this.settings = {
      tenant: opts.tenant ?? "harbour",
      period: { ...this.period },
      entities: this.entities.map((e) => ({ ...e })),
      owners: opts.owners ?? { reviewer: "Priya", bookkeeper: "Kim", uncoded_query: "Uncoded Query" },
    };
  }

  // ---- the business, between runs -------------------------------------------

  /** A person signs off one entity's close, approving the proposals named, or every proposal in the pack. */
  signOff(entityId: string, by: string, approvedProposalIds?: string[]): void {
    const approved = approvedProposalIds ?? this.proposals.filter((p) => p.entityId === entityId).map((p) => p.proposalId);
    this.signoffs.push({ entityId, period: this.period.id, by, at: this.clock.toISOString(), approvedProposalIds: [...approved], seq: ++this.seq });
  }

  /** A person enters this period's amount for a schedule line. */
  enterAmount(entityId: string, lineId: string, amount: number, by: string): void {
    const line = this.ledgers[entityId]?.schedule.find((l) => l.lineId === lineId);
    if (line) line.entered = { amount, by, at: this.clock.toISOString() };
  }

  /** A person sets the lock date by hand in the ledger. */
  personSetsLock(entityId: string, date: string): void {
    const l = this.ledgers[entityId];
    if (!l) return;
    l.lockDate = date;
    this.manualLocks.push({ entityId, date, seq: ++this.seq });
  }

  /** The ledger cannot answer this read for this entity. */
  failRead(entityId: string, kind: ReadKind): void {
    this.failing.add(`${entityId}:${kind}`);
  }

  loseNextAnswer(): void {
    this.nextPosts.push("lose_answer");
  }

  refuseNextPost(): void {
    this.nextPosts.push("refuse");
  }

  advanceHours(hours: number): void {
    this.clock = new Date(this.clock.getTime() + hours * 3_600_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  get tenant(): string {
    return this.settings.tenant;
  }

  get owners(): Record<OwnerRole, string> {
    return { ...this.settings.owners };
  }

  latest(entityId: string, item: CloseItem): (ItemResult & Seq) | undefined {
    return [...this.results].reverse().find((r) => r.entityId === entityId && r.item === item);
  }

  readById(readId: string) {
    return this.reads.find((r) => r.readId === readId);
  }

  lockDateOf(entityId: string): string | null {
    return this.ledgers[entityId]?.lockDate ?? null;
  }

  scheduleOf(entityId: string): ScheduleLine[] {
    return structuredClone(this.ledgers[entityId]?.schedule ?? []);
  }

  signoffFor(entityId: string): (Signoff & Seq) | undefined {
    return this.signoffs.find((s) => s.entityId === entityId);
  }

  /** The intent id the standard names for one approved journal. */
  intentFor(entityId: string, scheduleLineId: string): string {
    return `close:${this.settings.tenant}:${entityId}:${this.period.id}:${scheduleLineId}`;
  }

  // ---- the ports ----------------------------------------------------------------

  private record(port: Port, request: unknown, response: unknown): number {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
    return ++this.seq;
  }

  private serve<T>(entityId: string, kind: ReadKind, port: Port, data: () => T | undefined): Read<T> {
    const value = data();
    if (this.failing.has(`${entityId}:${kind}`) || value === undefined) {
      const out = { ok: false as const, reason: value === undefined ? "no such entity" : "the ledger did not answer" };
      this.record(port, { entityId, kind }, out);
      return out;
    }
    const readId = `RD-${++this.readSeq}`;
    const seq = this.record(port, { entityId, kind }, { readId });
    this.reads.push({ readId, entityId, kind, seq });
    return { ok: true, readId, asAt: this.clock.toISOString(), data: structuredClone(value) };
  }

  private pack(entityId: string): ClosePack {
    const p = this.period.id;
    return {
      entityId,
      period: p,
      results: this.results.filter((r) => r.entityId === entityId).map(unseq),
      proposals: this.proposals.filter((x) => x.entityId === entityId).map(unseq),
      raised: this.exceptions.filter((e) => e.entityId === entityId).map((e) => ({ kind: e.kind, ref: e.ref })),
      lockTasks: this.tasks.filter((t) => t.entityId === entityId && t.what === "set_lock_date").length,
      handedOff: this.handoffs.some((h) => h.entityId === entityId),
      signoff: (() => {
        const s = this.signoffFor(entityId);
        return s ? unseq(s) : null;
      })(),
    };
  }

  ports(): MonthEndClosePorts {
    const ledger = (id: string) => this.ledgers[id];
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        const out = structuredClone(this.settings);
        this.record("read_rule", { settings: true }, { entities: out.entities.length });
        return out;
      },

      readClose: (entityId) => {
        const out = this.pack(entityId);
        this.record("read_signoff", { entityId, period: this.period.id }, { signedOff: !!out.signoff });
        return out;
      },

      readBank: (entityId) => this.serve(entityId, "bank", "read_ledger", () => ledger(entityId)?.bank),
      readUncoded: (entityId) => this.serve(entityId, "uncoded", "read_ledger", () => ledger(entityId)?.uncoded),
      readAged: (entityId, side) => this.serve(entityId, side, "read_ledger", () => ledger(entityId)?.[side]),
      readPayroll: (entityId) => this.serve(entityId, "payroll", "read_ledger", () => ledger(entityId)?.payroll),
      readControls: (entityId) => this.serve(entityId, "controls", "read_ledger", () => ledger(entityId)?.controls),
      readSchedule: (entityId) => this.serve(entityId, "schedule", "read_rule", () => ledger(entityId)?.schedule),

      recordResult: (result) => {
        const seq = this.record("evidence", result, { recorded: true });
        this.results.push({ ...structuredClone(result), seq });
      },

      raiseException: (item) => {
        const seq = this.record("raise_exception", item, { ok: true });
        this.exceptions.push({ ...structuredClone(item), seq });
      },

      proposeJournal: (p) => {
        const proposalId = `P-${this.proposals.length + 1}`;
        const seq = this.record("propose_journal", p, { proposalId });
        this.proposals.push({ ...structuredClone(p), proposalId, seq });
        return { proposalId };
      },

      postJournal: (j) => {
        let result: WriteResult;
        const existing = this.journals.find((x) => x.entityId === j.entityId && x.intentId === j.intentId);
        if (!ledger(j.entityId)) {
          result = { ok: false, error: "no such entity" };
        } else if (this.nextPosts[0] === "refuse") {
          this.nextPosts.shift();
          result = { ok: false, error: "ledger unavailable" };
        } else if (existing) {
          result = { ok: true, journalId: existing.journalId };
        } else {
          const journalId = `MJ-${this.journals.length + 1}`;
          this.journals.push({ journalId, entityId: j.entityId, intentId: j.intentId, proposalId: j.proposalId, amount: j.amount, date: j.date, seq: this.seq + 1 });
          if (this.nextPosts[0] === "lose_answer") {
            this.nextPosts.shift();
            result = { ok: false, error: "timeout" };
          } else {
            result = { ok: true, journalId };
          }
        }
        const seq = this.record("write_ledger", { entityId: j.entityId, intentId: j.intentId, proposalId: j.proposalId, amount: j.amount }, result);
        this.postAttempts.push({ ...structuredClone(j), seq, result: structuredClone(result) });
        return structuredClone(result);
      },

      readJournals: (entityId) => {
        const out = this.journals.filter((x) => x.entityId === entityId).map(unseq);
        const seq = this.record("read_ledger", { entityId, journals: this.period.id }, { count: out.length });
        this.journalReads.push({ entityId, seq, count: out.length });
        return out;
      },

      readLockDate: (entityId) => {
        const entity = this.entities.find((e) => e.entityId === entityId);
        const out = { lockDate: this.lockDateOf(entityId), writable: !!entity?.lockWritable };
        const seq = this.record("read_ledger", { entityId, lockDate: true }, out);
        this.lockReads.push({ entityId, lockDate: out.lockDate, seq });
        return out;
      },

      setLockDate: (entityId, date) => {
        const entity = this.entities.find((e) => e.entityId === entityId);
        const before = this.lockDateOf(entityId);
        const out: { ok: true } | { ok: false; error: string } = !entity
          ? { ok: false, error: "no such entity" }
          : !entity.lockWritable
            ? { ok: false, error: "this ledger's API cannot set the lock date" }
            : { ok: true };
        if (out.ok) this.ledgers[entityId].lockDate = date;
        const seq = this.record("set_lock_date", { entityId, date }, out);
        this.lockAttempts.push({ entityId, date, before, ok: out.ok, seq });
        return out;
      },

      raiseTask: (t) => {
        const seq = this.record("raise_task", t, { ok: true });
        this.tasks.push({ ...structuredClone(t), seq });
      },

      handOff: (h) => {
        const seq = this.record("notify", h, { ok: true });
        this.handoffs.push({ ...structuredClone(h), seq });
      },
    };
  }
}

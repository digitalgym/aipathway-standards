// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/uncoded-query.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The uncoded-query world: a practice's client files, each with a ledger
 * holding bank lines nobody has coded yet, that client's own chart of
 * accounts and tax codes, how the client's lines were coded before, the one
 * question list the client gets each cycle, the answers the client types,
 * the codings a build proposes, the approvals a person gives, and the
 * codings written back into the ledger.
 *
 * TWO KINDS OF UNCODED LINE, because the ledgers differ. A `suspense` line is
 * a transaction already in the ledger, parked on a suspense or uncategorised
 * account by whoever reconciled it: the build can recode it. A `statement`
 * line is a bank line the ledger has not reconciled at all: there is no
 * transaction to recode, and making one or reconciling the line is a
 * person's job. The world has no reconcile port and refuses a coding write on
 * a statement line, and the refusal is recorded (porting doc §8).
 *
 * THE LEDGER KEEPS AN IDEMPOTENCY KEY, as Xero's Idempotency-Key header and
 * QuickBooks' requestid do: a second write with the same key answers with the
 * first result and changes nothing. It does NOT dedupe on anything else, so a
 * build that mints a fresh key per try writes twice. `loseNextAnswer` makes
 * the next write land and then answer as a failure, the way a timeout does.
 *
 * THE LEDGER REFUSES AN ACCOUNT OR TAX CODE THE CLIENT'S CHART LACKS, as a
 * real ledger does, and the attempt is still recorded, so a build that
 * invented a code is seen even though nothing landed.
 *
 * THE CLIENT AND THE APPROVER ARE NOT PORTS. An answer arrives when the
 * runner calls `clientAnswers`, and an approval when it calls `approve`. A
 * build can read both and cause neither.
 *
 * Money is held in cents. A line's amount is negative for money out.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The closed list of reasons a line, or a client, goes to a person. */
export const HAND_OFF_KINDS = [
  /** The answer fits no account in this client's chart. Nothing is proposed. */
  "no_account_fits",
  /** Every reminder went unanswered. Following up, by phone or otherwise, is the person's. */
  "unanswered",
  /** An approved coding for a bank line the ledger has not reconciled: reconciling it is the person's. */
  "reconcile_by_person",
  /** The ledger, read back after the write, does not hold what was approved. */
  "readback_mismatch",
  /** The ledger refused the write or never answered after a retry with the same key. */
  "write_failed",
] as const;
export type HandOffKind = (typeof HAND_OFF_KINDS)[number];

export interface Client {
  clientId: string;
  name: string;
  email: string;
  /** For an SMS link to the same list. Optional. */
  mobile?: string;
}

export interface Account {
  code: string;
  name: string;
  /** The tax code the client's own chart puts on this account by default. */
  taxCode: string;
  active: boolean;
}

export interface Chart {
  accounts: Account[];
  /** Every tax code the client's ledger holds. */
  taxCodes: string[];
}

export interface HistoryEntry {
  /** The payee as the statement printed it. */
  payee: string;
  account: string;
  taxCode: string;
  date: string;
}

export interface UncodedLine {
  lineId: string;
  clientId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Cents. Negative is money out. */
  amount: number;
  /** The payee or narrative exactly as the bank statement printed it. */
  payee: string;
  /** suspense: a ledger transaction parked on a suspense account. statement: an unreconciled bank line. */
  source: "suspense" | "statement";
}

export interface Coding {
  account: string;
  taxCode: string;
}

export interface QuestionLine {
  lineId: string;
  /** The plain-English question a client reads, e.g. "$412.50 to BUNNINGS on 3 Oct: what was it for?" */
  question: string;
}

export interface Message {
  clientId: string;
  cycle: string;
  kind: "list" | "reminder";
  channel: "email" | "sms";
  lines: QuestionLine[];
  /** Everything the client reads, including the intro and the answer link. */
  text: string;
  /** Where the client answers each line. */
  answerLink: string;
  at: string;
}

export interface Answer {
  lineId: string;
  clientId: string;
  /** The client's words, exactly. */
  text: string;
  by: string;
  at: string;
}

export interface Proposal {
  lineId: string;
  coding: Coding;
  /** Why, for the approver: the answer and the history it came from. Never tax advice. */
  why: string;
  at: string;
}

export interface Approval {
  approvalId: string;
  lineId: string;
  coding: Coding;
  by: string;
  at: string;
}

export interface WriteAttempt {
  lineId: string;
  coding: Coding;
  key: string;
  /** Whether the ledger changed on this attempt. A same-key repeat never does. */
  landed: boolean;
  /** What the build was told. A lost answer lands and says false. */
  answeredOk: boolean;
  why?: string;
  at: string;
}

export interface HandOff {
  kind: HandOffKind;
  clientId: string;
  lineIds: string[];
  detail: string;
}

export interface RecordEntry {
  kind: "asked" | "reminded" | "answer" | "proposed" | "approved" | "written" | "handed_off";
  clientId: string;
  lineId?: string;
  detail: string;
}

export interface Settings {
  /** Days between the list and each reminder, and between the last reminder and the hand-off. */
  reminderEveryDays: number;
  /** Reminders per cycle before the client goes to a person. */
  maxReminders: number;
  /** Where clients answer. The build appends the client's id. */
  answerBase: string;
}

export interface UncodedQueryPorts {
  now(): Date;
  /** The schedule and the answer page, as the practice set them. */
  readSettings(): Settings;
  readClients(): Client[];
  /** Every line still uncoded in this client's ledger, both kinds. */
  readUncodedLines(clientId: string): UncodedLine[];
  /** This client's chart: its accounts and tax codes, and nothing else's. */
  readChart(clientId: string): Chart;
  /** How this client's lines were coded before. */
  readHistory(clientId: string): HistoryEntry[];
  /** Every list and reminder already sent to this client. The outbox, read back. */
  readSent(clientId: string): Message[];
  /** Send the client's one question list for the cycle, or a reminder of the lines still open. */
  sendMessage(m: Omit<Message, "at">): { sent: boolean };
  /** Every answer this client has given. */
  readAnswers(clientId: string): Answer[];
  /** Put a proposed coding in front of the approver. A proposal is never a write. */
  propose(p: Omit<Proposal, "at">): void;
  /** What a person has approved for this line, if anything. */
  readApprovals(lineId: string): Approval[];
  /** Write one approved coding onto the ledger transaction that holds the line, under an idempotency key. */
  writeCoding(lineId: string, coding: Coding, key: string): { ok: boolean; why?: string };
  /** The ledger's own coding of the line now, or null while it is uncoded. */
  readCoding(lineId: string): Coding | null;
  /** Hand a line, or a client, to a person with a typed reason. */
  handToPerson(h: HandOff): void;
  record(entry: RecordEntry): void;
}

export interface UncodedQueryWorldOptions {
  now?: Date;
  clients?: Client[];
  charts?: Record<string, Chart>;
  history?: Record<string, HistoryEntry[]>;
  lines?: UncodedLine[];
  settings?: Partial<Settings>;
  /** The ledger stores this tax code instead of the one written, for one line: a read back that disagrees. */
  ledgerOverridesTax?: { lineId: string; taxCode: string };
}

export const DEFAULT_SETTINGS: Settings = {
  reminderEveryDays: 3,
  maxReminders: 2,
  answerBase: "https://answers.example.com/q/",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The cycle a moment falls in: the calendar month in Brisbane, as 2026-11. */
export function cycleOf(d: Date): string {
  const local = new Date(d.getTime() + 10 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Cents as dollars, without the sign, for a client to read. */
export function money(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-AU");
  return `$${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** "2026-10-03" as "3 Oct". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * The sanctioned question for one line: the amount, to or from the payee as
 * the statement printed it, the date, and one plain question. No account
 * name, no tax word, nothing for the client to look up.
 */
export function questionFor(line: UncodedLine): string {
  const dir = line.amount < 0 ? "to" : "from";
  return `${money(line.amount)} ${dir} ${line.payee} on ${shortDate(line.date)}: what was it for?`;
}

/**
 * Words that are tax advice or bookkeeping jargon when they reach a client.
 * The client is asked what a payment was for; whether it is deductible, or
 * which tax code applies, is the practice's call, never the message's.
 */
export const ADVICE_WORDS = /deductib|claimable|you can claim|claim the gst|gst credit|input tax|tax deduction|tax[- ]free|write it off|business expense|private use|\bBAS\b|\bGST\b|tax code|account code|suspense|reconcil/i;

/** Two codings are the same coding. */
export function sameCoding(a: Coding | null | undefined, b: Coding | null | undefined): boolean {
  return !!a && !!b && a.account === b.account && a.taxCode === b.taxCode;
}

export class UncodedQueryWorld {
  readonly calls: PortCall[] = [];
  readonly sent: Message[] = [];
  readonly proposals: Proposal[] = [];
  readonly writeAttempts: WriteAttempt[] = [];
  readonly handOffs: HandOff[] = [];
  readonly evidence: RecordEntry[] = [];

  private clients: Client[];
  private charts: Record<string, Chart>;
  private history: Record<string, HistoryEntry[]>;
  private lines: UncodedLine[];
  private readonly coded = new Map<string, Coding>();
  private readonly answers: Answer[] = [];
  private readonly approvals: Approval[] = [];
  private readonly keys = new Map<string, { ok: boolean; why?: string }>();
  private readonly settings: Settings;
  private readonly override?: { lineId: string; taxCode: string };
  private loseAnswer = false;
  private clock: Date;

  constructor(opts: UncodedQueryWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-02T22:00:00.000Z"); // Tuesday 3 Nov, 8am Brisbane
    this.clients = (opts.clients ?? []).map((c) => ({ ...c }));
    this.charts = Object.fromEntries(
      Object.entries(opts.charts ?? {}).map(([k, v]) => [k, { accounts: v.accounts.map((a) => ({ ...a })), taxCodes: [...v.taxCodes] }]),
    );
    this.history = Object.fromEntries(Object.entries(opts.history ?? {}).map(([k, v]) => [k, v.map((h) => ({ ...h }))]));
    this.lines = (opts.lines ?? []).map((l) => ({ ...l }));
    this.settings = { ...DEFAULT_SETTINGS, ...(opts.settings ?? {}) };
    this.override = opts.ledgerOverridesTax;
  }

  // ---- the runner, between runs ---------------------------------------------

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  advanceDays(days: number): void {
    this.advance(days * DAY_MS);
  }

  /** The client types an answer against one line, on the answer page. */
  clientAnswers(lineId: string, text: string, by?: string): void {
    const line = this.lines.find((l) => l.lineId === lineId);
    if (!line) throw new Error(`no line ${lineId}`);
    const client = this.clients.find((c) => c.clientId === line.clientId);
    this.answers.push({ lineId, clientId: line.clientId, text, by: by ?? client?.name ?? line.clientId, at: this.clock.toISOString() });
  }

  /** A person approves one coding for one line. */
  approve(lineId: string, coding: Coding, by: string): string {
    const approvalId = `AP-${this.approvals.length + 1}`;
    this.approvals.push({ approvalId, lineId, coding: { ...coding }, by, at: this.clock.toISOString() });
    return approvalId;
  }

  /** Someone codes a line by hand in the ledger, outside the build. */
  codedByHand(lineId: string, coding: Coding): void {
    this.coded.set(lineId, { ...coding });
  }

  /** A new uncoded line lands in a client's ledger. */
  lineArrives(line: UncodedLine): void {
    this.lines.push({ ...line });
  }

  /** The next write lands in the ledger and then answers as a failure. */
  loseNextAnswer(): void {
    this.loseAnswer = true;
  }

  // ---- reads for assertions, never recorded ---------------------------------

  line(lineId: string): UncodedLine | undefined {
    return this.lines.find((l) => l.lineId === lineId);
  }

  chartOf(clientId: string): Chart {
    return this.charts[clientId] ?? { accounts: [], taxCodes: [] };
  }

  inChart(clientId: string, c: Coding): boolean {
    const chart = this.chartOf(clientId);
    return chart.accounts.some((a) => a.code === c.account && a.active) && chart.taxCodes.includes(c.taxCode);
  }

  codingOf(lineId: string): Coding | null {
    const c = this.coded.get(lineId);
    return c ? { ...c } : null;
  }

  sentTo(clientId: string, kind?: Message["kind"]): Message[] {
    return this.sent.filter((m) => m.clientId === clientId && (!kind || m.kind === kind));
  }

  approvalsFor(lineId: string): Approval[] {
    return this.approvals.filter((a) => a.lineId === lineId);
  }

  answersFor(lineId: string): Answer[] {
    return this.answers.filter((a) => a.lineId === lineId);
  }

  /** Writes that changed the ledger for this line. */
  landedFor(lineId: string): WriteAttempt[] {
    return this.writeAttempts.filter((w) => w.lineId === lineId && w.landed);
  }

  handOffsOf(kind: HandOffKind): HandOff[] {
    return this.handOffs.filter((h) => h.kind === kind);
  }

  recordFor(lineId: string): RecordEntry[] {
    return this.evidence.filter((e) => e.lineId === lineId);
  }

  /** Index of the first recorded call to a port matching a filter, or -1. */
  firstCall(port: Port, match: (request: unknown) => boolean = () => true): number {
    return this.calls.findIndex((c) => c.port === port && match(c.request));
  }

  lastCall(port: Port, match: (request: unknown) => boolean = () => true): number {
    for (let i = this.calls.length - 1; i >= 0; i--) {
      if (this.calls[i].port === port && match(this.calls[i].request)) return i;
    }
    return -1;
  }

  private uncoded(clientId: string): UncodedLine[] {
    return this.lines.filter((l) => l.clientId === clientId && !this.coded.has(l.lineId));
  }

  private rec(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): UncodedQueryPorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        this.rec("read_rule", { settings: true }, { ...this.settings });
        return { ...this.settings };
      },

      readClients: () => {
        const out = this.clients.map((c) => ({ ...c }));
        this.rec("read_contacts", { clients: true }, { count: out.length });
        return out;
      },

      readUncodedLines: (clientId) => {
        const out = this.uncoded(clientId).map((l) => ({ ...l }));
        this.rec("read_ledger", { uncoded: clientId }, { lineIds: out.map((l) => l.lineId) });
        return out;
      },

      readChart: (clientId) => {
        const c = this.chartOf(clientId);
        this.rec("read_ledger", { chart: clientId }, { accounts: c.accounts.length, taxCodes: c.taxCodes.length });
        return { accounts: c.accounts.map((a) => ({ ...a })), taxCodes: [...c.taxCodes] };
      },

      readHistory: (clientId) => {
        const out = (this.history[clientId] ?? []).map((h) => ({ ...h }));
        this.rec("read_ledger", { history: clientId }, { count: out.length });
        return out;
      },

      readSent: (clientId) => {
        const out = this.sentTo(clientId).map((m) => ({ ...m, lines: m.lines.map((l) => ({ ...l })) }));
        this.rec("read_inbox", { sent: clientId }, { count: out.length });
        return out;
      },

      sendMessage: (m) => {
        const msg: Message = { ...m, lines: m.lines.map((l) => ({ ...l })), at: this.clock.toISOString() };
        this.sent.push(msg);
        this.rec("send_message", { clientId: m.clientId, cycle: m.cycle, kind: m.kind, lineIds: m.lines.map((l) => l.lineId) }, { sent: true });
        return { sent: true };
      },

      readAnswers: (clientId) => {
        const out = this.answers.filter((a) => a.clientId === clientId).map((a) => ({ ...a }));
        this.rec("read_inbox", { answers: clientId }, { count: out.length });
        return out;
      },

      propose: (p) => {
        this.proposals.push({ ...p, coding: { ...p.coding }, at: this.clock.toISOString() });
        this.rec("raise_task", { lineId: p.lineId, coding: p.coding }, { ok: true });
      },

      readApprovals: (lineId) => {
        const out = this.approvalsFor(lineId).map((a) => ({ ...a, coding: { ...a.coding } }));
        this.rec("gate", { approvals: lineId }, { count: out.length });
        return out;
      },

      writeCoding: (lineId, coding, key) => {
        const at = this.clock.toISOString();
        const line = this.line(lineId);
        const prior = this.keys.get(key);
        if (prior) {
          this.writeAttempts.push({ lineId, coding: { ...coding }, key, landed: false, answeredOk: prior.ok, ...(prior.why ? { why: prior.why } : {}), at });
          this.rec("write_ledger", { lineId, coding, key }, { ...prior, repeat: true });
          return { ...prior };
        }
        let why: string | undefined;
        if (!line) why = `no line ${lineId}`;
        else if (line.source === "statement") why = "no transaction holds this line; the bank line is not reconciled";
        else if (!this.inChart(line.clientId, coding)) why = `${coding.account} / ${coding.taxCode} is not in this client's chart`;
        if (why) {
          this.keys.set(key, { ok: false, why });
          this.writeAttempts.push({ lineId, coding: { ...coding }, key, landed: false, answeredOk: false, why, at });
          this.rec("write_ledger", { lineId, coding, key }, { ok: false, why });
          return { ok: false, why };
        }
        const stored = this.override?.lineId === lineId ? { account: coding.account, taxCode: this.override.taxCode } : { ...coding };
        this.coded.set(lineId, stored);
        this.keys.set(key, { ok: true });
        const lost = this.loseAnswer;
        this.loseAnswer = false;
        this.writeAttempts.push({ lineId, coding: { ...coding }, key, landed: true, answeredOk: !lost, ...(lost ? { why: "timed out" } : {}), at });
        const answer = lost ? { ok: false, why: "timed out" } : { ok: true };
        this.rec("write_ledger", { lineId, coding, key }, answer);
        return answer;
      },

      readCoding: (lineId) => {
        const c = this.codingOf(lineId);
        this.rec("read_ledger", { coding: lineId }, c ?? { uncoded: true });
        return c;
      },

      handToPerson: (h) => {
        this.handOffs.push({ ...h, lineIds: [...h.lineIds] });
        this.rec("escalate", h, { ok: true });
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.rec("evidence", entry, { recorded: true });
      },
    };
  }
}

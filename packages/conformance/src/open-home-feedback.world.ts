// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/open-home-feedback.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The open-home world: a sign-in register, a drafts folder a person approves
 * from, the replies that come back, and a vendor report a person approves.
 *
 * TWO GATES, BOTH HELD BY A PERSON. The agent approves each follow-up before
 * it sends and the vendor report before it goes. Approval is not a port: a
 * build cannot approve its own work. The runner plays the agent between runs
 * (`approveDrafts`, `approveReport`), and the build asks `isApproved` before
 * it releases anything. The world refuses an unapproved send, and the
 * assertion still reads the build's attempts, because a world that enforces a
 * rule would otherwise hide the build that ignored it (porting doc §8).
 *
 * WHY THE OPT-OUT LIVES IN THE WORLD AND NOT ON THE ROW. Check 6: a new
 * register with consent ticked must not clear an earlier STOP. If withdrawal
 * were a column on the row, the next open's sign-in sheet would overwrite it.
 * It is held apart, keyed on the normalised mobile and email, and
 * `importRegister` cannot touch it.
 *
 * THE CALL IS OFF. `voiceStep` starts off, and only `turnVoiceOn` (the agent,
 * not the build) changes it. The gate also refuses anyone who did not ask for
 * a call, anyone who opted out, and anything outside calling hours.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const REPLY_CLASSES = ["hot_buyer", "price_feedback", "not_interested", "appraisal_lead"] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

export const QUESTIONS = ["interest", "price", "contract"] as const;
export type Question = (typeof QUESTIONS)[number];

export type ExceptionReason =
  | "incomplete_row"
  | "no_consent"
  | "duplicate_attendee"
  | "offer"
  | "complaint"
  | "unclear_reply";

export interface RegisterRow {
  /** One sign-in row. Unique per open, not per person. */
  rowId: string;
  openId: string;
  listingId: string;
  name?: string;
  mobile?: string;
  email?: string;
  /** As captured at sign-in: "yes", "no" or blank. Never inferred. */
  consent?: string;
  /** Ticked "happy to take a call". The only basis for the optional call. */
  callOk?: boolean;
}

export interface Draft {
  draftId: string;
  /** The register row it was written for. */
  rowId: string;
  listingId: string;
  question: Question;
  body: string;
}

export interface Reply {
  replyId: string;
  /** The draft whose send this answers. */
  draftId: string;
  rowId: string;
  listingId: string;
  text: string;
}

export interface VendorReport {
  listingId: string;
  week: string;
  counts: {
    attendees: number;
    followUpsSent: number;
    replies: number;
    byClass: Record<ReplyClass, number>;
  };
  /** Each one the reply text exactly, with the reply it came from. */
  priceComments: Array<{ replyId: string; verbatim: string }>;
  /** Each theme points at the replies it came from. */
  themes: Array<{ theme: string; replyIds: string[] }>;
}

/** The only fields a vendor report may carry. Anything else was invented. */
export const REPORT_FIELDS = ["listingId", "week", "counts", "priceComments", "themes"] as const;

export interface EvidenceEntry {
  kind: "consent" | "sent" | "reply" | "classified" | "opt_out" | "report";
  ref: string;
  /** For a reply: the text, exactly. For a send: who approved it. */
  detail: string;
}

export interface OpenHomePorts {
  now(): Date;
  readRegister(): RegisterRow[];
  /** Hand a row, a person or a reply to the agent, with a typed reason. */
  raiseException(ref: string, reason: ExceptionReason, detail: string): void;
  /** The drafts already written, so a second run does not write them again. */
  listDrafts(): Draft[];
  /** Write a follow-up. It waits for a person; it sends nothing. */
  draft(rowId: string, question: Question, body: string): Draft;
  /** Has the agent approved this draft? */
  isApproved(draftId: string): boolean;
  /** Release an approved draft. Refused without the approval. */
  send(draftId: string): { sent: boolean; why?: string };
  /** Is this person's consent withdrawn, from any earlier open? */
  hasOptedOut(rowId: string): boolean;
  /** Record withdrawn consent. Permanent across opens and listings. */
  recordOptOut(rowId: string, said: string): void;
  readReplies(): Array<Reply & { filed: boolean }>;
  /** File a reply with its classes. An empty list means unclear. */
  classify(replyId: string, classes: ReplyClass[]): void;
  /** The newest report drafted for a listing, and whether it reached the vendor. */
  latestReport(listingId: string): { version: number; report: VendorReport; sentToVendor: boolean } | null;
  /** Draft the vendor report to the agent. Returns its version. */
  draftReport(report: VendorReport): number;
  /** Has the agent approved this version of the report? */
  reportApproved(listingId: string, version: number): boolean;
  /** Send an approved version to the vendor. Refused without the approval. */
  sendReport(listingId: string, version: number): { sent: boolean; why?: string };
  /** Append to the record. */
  record(entry: EvidenceEntry): void;
  /** Ask whether the optional call may go to this attendee now. */
  callGate(rowId: string): { allowed: boolean; reason?: string };
  /** Open the call. Refused unless the gate allowed this attendee. */
  disclose(rowId: string, text: string): { opened: boolean; why?: string };
  say(rowId: string, text: string): void;
}

export interface OpenHomeWorldOptions {
  now?: Date;
  register?: RegisterRow[];
  /** What each row's person replies once a follow-up reaches them. */
  replyScript?: Record<string, string>;
  callingHours?: { from: number; to: number };
  week?: string;
}

/** Digits only, with an Australian 0 prefix, so 0412 345 678 and +61412345678 match. */
export function normaliseMobile(v?: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) return `0${d.slice(2)}`;
  if (d.length === 9 && d.startsWith("4")) return `0${d}`;
  return d;
}

export function personKey(row: RegisterRow): string {
  const m = normaliseMobile(row.mobile);
  if (m) return `m:${m}`;
  const e = String(row.email ?? "").trim().toLowerCase();
  return e ? `e:${e}` : `row:${row.rowId}`;
}

export class OpenHomeWorld {
  readonly week: string;
  readonly drafts: Draft[] = [];
  readonly sends: string[] = [];
  /** Every send the build attempted, allowed or not. */
  readonly sendAttempts: string[] = [];
  readonly exceptions: Array<{ ref: string; reason: ExceptionReason; detail: string }> = [];
  readonly replies: Reply[] = [];
  readonly filed = new Map<string, ReplyClass[]>();
  readonly reports: Array<{ version: number; report: VendorReport }> = [];
  readonly approvedReports = new Set<number>();
  readonly vendorSends: Array<{ version: number; report: VendorReport }> = [];
  readonly vendorAttempts: number[] = [];
  readonly evidence: EvidenceEntry[] = [];
  readonly gateDecisions: Array<{ rowId: string; allowed: boolean; reason?: string }> = [];
  readonly disclosures: string[] = [];
  readonly turns: Array<{ rowId: string; text: string }> = [];
  readonly calls: PortCall[] = [];
  /** How many calls had opened by the moment the agent turned the call on. */
  disclosuresWhileOff = 0;

  private register: RegisterRow[];
  private readonly approvedDrafts = new Set<string>();
  /** Held outside the register rows, keyed on the person. */
  private readonly optedOut = new Set<string>();
  private readonly replyScript: Record<string, string>;
  private readonly hours: { from: number; to: number };
  private voiceStep = false;
  private clock: Date;

  constructor(opts: OpenHomeWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T04:00:00.000Z"); // Monday 2pm Brisbane
    this.register = (opts.register ?? []).map((r) => ({ ...r }));
    this.replyScript = { ...(opts.replyScript ?? {}) };
    this.hours = opts.callingHours ?? { from: 9, to: 20 };
    this.week = opts.week ?? "2026-W44";
  }

  // ---- the agent, between runs ---------------------------------------------

  approveDrafts(filter: (d: Draft) => boolean = () => true): void {
    for (const d of this.drafts) if (filter(d)) this.approvedDrafts.add(d.draftId);
  }

  approveReport(version?: number): void {
    const v = version ?? this.reports[this.reports.length - 1]?.version;
    if (v !== undefined) this.approvedReports.add(v);
  }

  turnVoiceOn(): void {
    this.disclosuresWhileOff = this.disclosures.length;
    this.voiceStep = true;
  }

  /** The people who were sent a follow-up reply, as scripted. */
  deliverReplies(): void {
    for (const draftId of this.sends) {
      const d = this.drafts.find((x) => x.draftId === draftId);
      if (!d || this.replies.some((r) => r.draftId === draftId)) continue;
      const text = this.replyScript[d.rowId];
      if (text === undefined) continue;
      this.replies.push({ replyId: `R-${d.rowId}`, draftId, rowId: d.rowId, listingId: d.listingId, text });
    }
  }

  /** A new open's sign-in sheet arrives. Opt-outs are not on the rows, so they survive. */
  importRegister(rows: RegisterRow[]): void {
    this.register = [...this.register, ...rows.map((r) => ({ ...r }))];
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  rowById(rowId: string): RegisterRow | undefined {
    return this.register.find((r) => r.rowId === rowId);
  }

  isOptedOut(rowId: string): boolean {
    const row = this.rowById(rowId);
    return row ? this.optedOut.has(personKey(row)) : false;
  }

  isDraftApproved(draftId: string): boolean {
    return this.approvedDrafts.has(draftId);
  }

  draftsFor(rowIds: string[]): Draft[] {
    return this.drafts.filter((d) => rowIds.includes(d.rowId));
  }

  get lastVendorReport(): VendorReport | undefined {
    return this.vendorSends[this.vendorSends.length - 1]?.report;
  }

  get lastDraftedReport(): VendorReport | undefined {
    return this.reports[this.reports.length - 1]?.report;
  }

  private localHour(): number {
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

  ports(): OpenHomePorts {
    return {
      now: () => new Date(this.clock),

      readRegister: () => {
        const rows = this.register.map((r) => ({ ...r }));
        this.record("read_contacts", { register: true }, { rows: rows.length });
        return rows;
      },

      raiseException: (ref, reason, detail) => {
        this.exceptions.push({ ref, reason, detail });
        this.record("escalate", { ref, reason, detail }, { ok: true });
      },

      listDrafts: () => {
        const out = this.drafts.map((d) => ({ ...d }));
        this.record("read_inbox", { drafts: true }, { count: out.length });
        return out;
      },

      draft: (rowId, question, body) => {
        const row = this.rowById(rowId);
        const d: Draft = {
          draftId: `D-${this.drafts.length + 1}`,
          rowId,
          listingId: row?.listingId ?? "",
          question,
          body,
        };
        this.drafts.push(d);
        this.record("draft_message", { rowId, question, body }, { draftId: d.draftId, status: "awaiting_approval" });
        return { ...d };
      },

      isApproved: (draftId) => {
        const ok = this.approvedDrafts.has(draftId);
        this.record("gate", { draftId, approval: true }, { approved: ok });
        return ok;
      },

      send: (draftId) => {
        this.sendAttempts.push(draftId);
        const d = this.drafts.find((x) => x.draftId === draftId);
        let why: string | undefined;
        if (!d) why = "no such draft";
        else if (!this.approvedDrafts.has(draftId)) why = "not approved by a person";
        else if (this.sends.includes(draftId)) why = "already sent";
        else if (this.isOptedOut(d.rowId)) why = "this person opted out";
        if (why) {
          this.record("send_message", { draftId }, { sent: false, why });
          return { sent: false, why };
        }
        this.sends.push(draftId);
        this.record("send_message", { draftId, rowId: d!.rowId }, { sent: true });
        return { sent: true };
      },

      hasOptedOut: (rowId) => {
        const out = this.isOptedOut(rowId);
        this.record("gate", { rowId, optOut: true }, { optedOut: out });
        return out;
      },

      recordOptOut: (rowId, said) => {
        const row = this.rowById(rowId);
        if (row) this.optedOut.add(personKey(row));
        this.record("record_consent", { rowId, said }, { consent: "withdrawn", permanent: true });
      },

      readReplies: () => {
        const out = this.replies.map((r) => ({ ...r, filed: this.filed.has(r.replyId) }));
        this.record("read_inbox", { replies: true }, { count: out.length });
        return out;
      },

      classify: (replyId, classes) => {
        this.filed.set(replyId, [...classes]);
        this.record("file_message", { replyId, classes }, { filed: true });
      },

      latestReport: (listingId) => {
        const mine = this.reports.filter((r) => r.report.listingId === listingId);
        const last = mine[mine.length - 1];
        const out = last
          ? {
              version: last.version,
              report: JSON.parse(JSON.stringify(last.report)) as VendorReport,
              sentToVendor: this.vendorSends.some((s) => s.version === last.version),
            }
          : null;
        this.record("read_inbox", { report: listingId }, out ? { version: out.version, sentToVendor: out.sentToVendor } : { none: true });
        return out;
      },

      draftReport: (report) => {
        const version = this.reports.length + 1;
        this.reports.push({ version, report: JSON.parse(JSON.stringify(report)) as VendorReport });
        this.record("publish_report", { to: "agent", version, listingId: report.listingId }, { drafted: true });
        return version;
      },

      reportApproved: (listingId, version) => {
        const ok = this.approvedReports.has(version);
        this.record("gate", { listingId, reportVersion: version }, { approved: ok });
        return ok;
      },

      sendReport: (listingId, version) => {
        this.vendorAttempts.push(version);
        const found = this.reports.find((r) => r.version === version);
        let why: string | undefined;
        if (!found) why = "no such version";
        else if (!this.approvedReports.has(version)) why = "not approved by the agent";
        else if (this.vendorSends.some((s) => s.version === version)) why = "already sent";
        if (why) {
          this.record("publish_report", { to: "vendor", listingId, version }, { sent: false, why });
          return { sent: false, why };
        }
        this.vendorSends.push({ version, report: found!.report });
        this.record("publish_report", { to: "vendor", listingId, version }, { sent: true });
        return { sent: true };
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.record("evidence", entry, { recorded: true });
      },

      callGate: (rowId) => {
        const row = this.rowById(rowId);
        let decision: { allowed: boolean; reason?: string } = { allowed: true };
        const hour = this.localHour();
        if (!this.voiceStep) decision = { allowed: false, reason: "voice_step_off" };
        else if (!row?.callOk) decision = { allowed: false, reason: "did_not_ask_for_a_call" };
        else if (this.isOptedOut(rowId)) decision = { allowed: false, reason: "opted_out" };
        else if (hour < this.hours.from || hour >= this.hours.to) decision = { allowed: false, reason: "outside_hours" };
        this.gateDecisions.push({ rowId, ...decision });
        this.record("gate", { rowId, call: true }, decision);
        return decision;
      },

      disclose: (rowId, text) => {
        const decided = [...this.gateDecisions].reverse().find((g) => g.rowId === rowId);
        if (!decided || !decided.allowed) {
          const why = decided ? decided.reason ?? "held" : "no gate decision recorded for this attendee";
          this.record("disclose", { rowId, text }, { opened: false, why });
          return { opened: false, why };
        }
        this.disclosures.push(rowId);
        this.turns.push({ rowId, text });
        this.record("disclose", { rowId, text }, { opened: true });
        return { opened: true };
      },

      say: (rowId, text) => {
        this.turns.push({ rowId, text });
        this.record("talk", { rowId, text }, { ok: true });
      },
    };
  }
}

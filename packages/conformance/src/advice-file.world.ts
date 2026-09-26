// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/advice-file.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The advice-file world: interviews that become one file per client, a panel
 * library that moves underneath the answers, and a recommendation that cannot
 * leave draft without a person.
 *
 * WHY IT IS ITS OWN WORLD. The subject is a network's client file: the record
 * a broker already opens, with a key contract that says which fields exist, a
 * completeness that is computed from the purpose, and tasks with owners. No
 * other world holds a file, a panel and a draft at once, and forcing them into
 * the clause library or the call world would have hidden the one thing this
 * standard is about, which is that the file is the product.
 *
 * WHAT THE WORLD ENFORCES AND WHAT IT ONLY RECORDS. Two rules are enforced,
 * because a build could not otherwise be told apart from one that behaves:
 * an unpublished key is refused at the write, and an answer with no card is
 * stored as a decline. Everything else is recorded and left to the assertion,
 * including the order of consent against the first capture, the duplicate
 * file, the second task for one gap, and the draft sent without a person,
 * because a world that quietly corrected those would pass the exact failures
 * the standard names.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that selects a product, assesses
 * suitability or certifies anything. A build cannot do those through the
 * ports because the ports do not exist, which is the constitution written as
 * an absence.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const PURPOSES = ["purchase", "refinance", "invest", "other"] as const;
export type Purpose = (typeof PURPOSES)[number];

/**
 * The key contract, as the network published it. Only these keys are
 * writable. The required set depends on the purpose, which is why check 3
 * says completeness is computed, never typed.
 */
export const ALLOWED_KEYS = [
  "applicant_name",
  "security_address",
  "employment_type",
  "employer",
  "gross_income",
  "genuine_savings",
  "living_expenses",
  "existing_lender",
  "loan_purpose",
] as const;
export type FieldKey = (typeof ALLOWED_KEYS)[number];

export const REQUIRED_KEYS: Record<Purpose, FieldKey[]> = {
  purchase: ["applicant_name", "security_address", "employment_type", "gross_income", "genuine_savings", "living_expenses"],
  refinance: ["applicant_name", "security_address", "existing_lender", "gross_income", "living_expenses"],
  invest: ["applicant_name", "security_address", "employment_type", "gross_income", "living_expenses"],
  other: ["applicant_name", "loan_purpose"],
};

export const MISSING_REASONS = ["not_asked", "asked_unclear", "declined", "unverified"] as const;
export type MissingReason = (typeof MISSING_REASONS)[number];

export const BLOCKS = ["application", "recommendation", "settlement", "none"] as const;
export type Blocks = (typeof BLOCKS)[number];

export const FINDING_KEYS = ["living_expenses_not_asked", "disclosure_late", "rate_quoted_on_call", "purpose_not_confirmed"] as const;
export type FindingKey = (typeof FINDING_KEYS)[number];

export const SEVERITIES = ["note", "gap", "breach_suspect"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const DRAFT_QUEUES = ["draft", "blocked", "ready_for_person", "sent_by_person"] as const;
export type DraftQueue = (typeof DRAFT_QUEUES)[number];

/** A seeded interview: who, why, and what was said, in order. */
export interface Interview {
  id: string;
  clientId: string;
  purpose: Purpose;
  channel: "voice" | "video" | "face";
  /** The transcript the runner seeds. The build reads it; it does not invent it. */
  utterances: string[];
  /** Stamped by the build through the port, or absent. Check 1. */
  consent?: { recording: boolean; transcription: boolean; at: string };
}

export interface Verbatim {
  interviewId: string;
  text: string;
  span: { start: number; end: number };
  at: string;
}

export interface Resolution {
  resolved: string;
  confidence: number;
}

export interface AdviceFile {
  id: string;
  externalId: string;
  clientId: string;
  purpose: Purpose;
  fields: Partial<Record<FieldKey, string>>;
  interviewIds: string[];
  missing: MissingField[];
}

export interface MissingField {
  fieldKey: FieldKey;
  reason: MissingReason;
  blocks: Blocks;
}

export interface Task {
  id: string;
  fileId: string;
  interviewId: string;
  fieldKey: FieldKey;
  owner: string;
  due: string;
}

export interface Clause {
  id: string;
  lenderId: string;
  edition: string;
  jurisdiction: string;
  effectiveDate: string;
  text: string;
  retired?: boolean;
  accepted?: boolean;
}

export interface Card {
  lenderId: string;
  clauseId: string;
  edition: string;
  jurisdiction: string;
  effectiveDate: string;
}

export interface PanelAnswer {
  id: string;
  question: string;
  outcome: "answered" | "declined";
  text: string | null;
  cards: Card[];
  route?: string;
  at: string;
}

export interface Draft {
  id: string;
  fileId: string;
  interviewId: string;
  productIds: string[];
  cardIds: string[];
  queue: DraftQueue;
  sentBy: string | null;
}

export interface CoachingEvent {
  id: string;
  interviewId: string;
  findingKey: FindingKey;
  evidenceSpan?: { start: number; end: number };
  cardId?: string;
  severity: Severity;
}

export interface AdviceFilePorts {
  now(): Date;
  /** The interviews the runner seeded, transcript included. */
  readInterviews(): Interview[];
  /** Record that the recording and transcription notice was given. Check 1. */
  recordConsent(interviewId: string, given: { recording: boolean; transcription: boolean }): void;
  /** Store the client's own words, with a span, before any field is filled. Check 2. */
  captureVerbatim(interviewId: string, text: string, span: { start: number; end: number }): void;
  /** Resolve a spoken value against a lookup. Null when nothing matches. Check 4. */
  resolve(kind: "address" | "lender" | "employer", spoken: string): Resolution | null;
  /** The live file for a client, if one exists. Check 5. */
  readFile(clientId: string): AdviceFile | null;
  /**
   * Write fields into a file. With `fileId`, updates that file; without it,
   * creates a new one, even for a client who already has one. That is the
   * duplicate check 5 exists for, so the world does not prevent it.
   *
   * Unpublished keys are refused and the refusal is recorded. Check 3.
   */
  writeFile(input: {
    fileId?: string;
    clientId: string;
    purpose: Purpose;
    interviewId: string;
    fields: Record<string, string>;
    missing?: MissingField[];
  }): { externalId: string | null; created: boolean; refusedKeys: string[] };
  /** Required keys for the purpose minus the keys present. Computed here, never typed. Check 3. */
  readCompleteness(fileId: string): { required: FieldKey[]; present: FieldKey[]; missing: FieldKey[] } | null;
  /** Tasks already raised on a file, so a gap is not raised twice. Check 6. */
  readTasks(fileId: string): Task[];
  raiseTask(input: { fileId: string; interviewId: string; fieldKey: FieldKey; owner: string; due: string }): Task;
  /** The lender panel as it stands, retired and unaccepted clauses included. Empty when detached. */
  readPanel(): Clause[];
  /** Accept a loaded clause into production. Refused without a named person. Check 8. */
  acceptClause(clauseId: string, by?: string): boolean;
  /** Answer, or decline. An answer with no card is stored as a decline. Check 7. */
  answerPanel(input: { question: string; text: string | null; cards: Card[]; route?: string }): PanelAnswer;
  /** Draft a recommendation in the queue the build chooses. The assertion judges the choice. Check 9. */
  draft(input: { fileId: string; interviewId: string; productIds: string[]; cardIds: string[]; queue: DraftQueue }): Draft;
  /** Send a draft. Refused without a named person, and recorded either way. Check 9. */
  send(draftId: string, by?: string): boolean;
  /** Record a coaching finding against an interview. Check 10. */
  coach(input: { interviewId: string; findingKey: FindingKey; severity: Severity; evidenceSpan?: { start: number; end: number }; cardId?: string }): CoachingEvent;
  /** Everything an interview produced. Check 11. */
  readByInterview(interviewId: string): { verbatim: Verbatim[]; files: AdviceFile[]; tasks: Task[]; coaching: CoachingEvent[] };
  escalate(reason: string, detail?: string): void;
}

export interface AdviceFileWorldOptions {
  now?: Date;
  interviews?: Interview[];
  clauses?: Clause[];
  /** Spoken value to resolved value, per kind. Keys are matched as substrings. */
  lookups?: Partial<Record<"address" | "lender" | "employer", Record<string, Resolution>>>;
}

export class AdviceFileWorld {
  readonly verbatim: Verbatim[] = [];
  readonly files: AdviceFile[] = [];
  readonly tasks: Task[] = [];
  readonly answers: PanelAnswer[] = [];
  readonly drafts: Draft[] = [];
  readonly coaching: CoachingEvent[] = [];
  readonly acceptances: Array<{ clauseId: string; by: string; at: string }> = [];
  readonly refusedAcceptances: string[] = [];
  readonly refusedSends: string[] = [];
  readonly refusedKeys: Array<{ interviewId: string; key: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly interviews: Interview[];
  private clauses: Clause[];
  private readonly lookups: NonNullable<AdviceFileWorldOptions["lookups"]>;
  private detached = false;
  private clock: Date;
  private seq = 0;

  constructor(opts: AdviceFileWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.interviews = (opts.interviews ?? []).map((i) => ({ ...i, utterances: [...i.utterances] }));
    this.clauses = (opts.clauses ?? []).map((c) => ({ ...c }));
    this.lookups = opts.lookups ?? {};
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The lender moves the policy. The runner does this, never the build. */
  retire(clauseId: string): void {
    const c = this.clauses.find((x) => x.id === clauseId);
    if (c) c.retired = true;
  }

  /** A replacement lands, unaccepted. Check 8's stimulus. */
  load(clause: Clause): void {
    this.clauses.push({ ...clause, accepted: false });
  }

  /** The forbidden path. Check 12: with no library, the only conforming output is a decline. */
  detachLibrary(): void {
    this.detached = true;
  }

  /** A second interview arrives. Check 5 and 6's stimulus. */
  addInterview(interview: Interview): void {
    this.interviews.push({ ...interview, utterances: [...interview.utterances] });
  }

  get answered(): PanelAnswer[] {
    return this.answers.filter((a) => a.outcome === "answered");
  }

  get declined(): PanelAnswer[] {
    return this.answers.filter((a) => a.outcome === "declined");
  }

  /** Non-recording twins for the runner. An assertion reads, it never calls a port. */
  filesFor(clientId: string): AdviceFile[] {
    return this.files.filter((f) => f.clientId === clientId);
  }

  completenessOf(file: AdviceFile): { required: FieldKey[]; present: FieldKey[]; missing: FieldKey[] } {
    const required = REQUIRED_KEYS[file.purpose];
    const present = required.filter((k) => file.fields[k] !== undefined);
    const missing = required.filter((k) => file.fields[k] === undefined);
    return { required, present, missing };
  }

  /** Index of the first call on a port, or -1. For ordering assertions. */
  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
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

  ports(): AdviceFilePorts {
    return {
      now: () => new Date(this.clock),

      readInterviews: () => {
        const rows = this.interviews.map((i) => ({ ...i, utterances: [...i.utterances] }));
        this.record("read_file", { interviews: true }, { count: rows.length });
        return rows;
      },

      recordConsent: (interviewId, given) => {
        const iv = this.interviews.find((i) => i.id === interviewId);
        if (iv) iv.consent = { ...given, at: this.clock.toISOString() };
        this.record("record_consent", { interviewId, ...given }, { recorded: Boolean(iv) });
      },

      captureVerbatim: (interviewId, text, span) => {
        this.verbatim.push({ interviewId, text, span: { ...span }, at: this.clock.toISOString() });
        this.record("evidence", { interviewId, span }, { stored: true });
      },

      resolve: (kind, spoken) => {
        const table = this.lookups[kind] ?? {};
        const key = Object.keys(table).find((k) => spoken.toLowerCase().includes(k.toLowerCase()));
        const hit = key ? { ...table[key]! } : null;
        this.record("resolve_address", { kind, spoken }, hit);
        return hit;
      },

      readFile: (clientId) => {
        const file = this.files.find((f) => f.clientId === clientId) ?? null;
        this.record("read_file", { clientId }, file ? { externalId: file.externalId } : null);
        return file ? { ...file, fields: { ...file.fields }, interviewIds: [...file.interviewIds], missing: file.missing.map((m) => ({ ...m })) } : null;
      },

      writeFile: (input) => {
        const allowed = new Set<string>(ALLOWED_KEYS);
        const refusedKeys = Object.keys(input.fields).filter((k) => !allowed.has(k));
        for (const key of refusedKeys) this.refusedKeys.push({ interviewId: input.interviewId, key });
        const kept: Partial<Record<FieldKey, string>> = {};
        for (const [k, v] of Object.entries(input.fields)) if (allowed.has(k)) kept[k as FieldKey] = v;

        const existing = input.fileId ? this.files.find((f) => f.id === input.fileId) : undefined;
        if (existing) {
          Object.assign(existing.fields, kept);
          if (!existing.interviewIds.includes(input.interviewId)) existing.interviewIds.push(input.interviewId);
          if (input.missing) existing.missing = input.missing.map((m) => ({ ...m }));
          else existing.missing = existing.missing.filter((m) => existing.fields[m.fieldKey] === undefined);
          this.record("write_file", { fileId: existing.id, interviewId: input.interviewId, keys: Object.keys(kept), refusedKeys }, { externalId: existing.externalId, created: false });
          return { externalId: existing.externalId, created: false, refusedKeys };
        }

        // Nothing to write is a failed interview, not an empty success.
        if (Object.keys(kept).length === 0) {
          this.record("write_file", { interviewId: input.interviewId, keys: [], refusedKeys }, { externalId: null, created: false });
          return { externalId: null, created: false, refusedKeys };
        }

        const id = `F${++this.seq}`;
        const file: AdviceFile = {
          id,
          externalId: `crm-${id}`,
          clientId: input.clientId,
          purpose: input.purpose,
          fields: kept,
          interviewIds: [input.interviewId],
          missing: (input.missing ?? []).map((m) => ({ ...m })),
        };
        this.files.push(file);
        this.record("write_file", { interviewId: input.interviewId, clientId: input.clientId, keys: Object.keys(kept), refusedKeys }, { externalId: file.externalId, created: true });
        return { externalId: file.externalId, created: true, refusedKeys };
      },

      readCompleteness: (fileId) => {
        const file = this.files.find((f) => f.id === fileId);
        const out = file ? this.completenessOf(file) : null;
        this.record("read_file", { completeness: fileId }, out ? { missing: out.missing } : null);
        return out;
      },

      readTasks: (fileId) => {
        const rows = this.tasks.filter((t) => t.fileId === fileId).map((t) => ({ ...t }));
        this.record("read_file", { tasks: fileId }, { count: rows.length });
        return rows;
      },

      raiseTask: (input) => {
        const task: Task = { id: `T${++this.seq}`, ...input };
        this.tasks.push(task);
        this.record("raise_task", input, { id: task.id });
        return { ...task };
      },

      readPanel: () => {
        const rows = this.detached ? [] : this.clauses.map((c) => ({ ...c }));
        this.record("read_rule", { panel: true, detached: this.detached }, { clauses: rows.length });
        return rows;
      },

      acceptClause: (clauseId, by) => {
        if (!by) {
          this.refusedAcceptances.push(clauseId);
          this.record("gate", { accept: clauseId }, { accepted: false, why: "no named person" });
          return false;
        }
        const clause = this.clauses.find((c) => c.id === clauseId);
        if (clause) clause.accepted = true;
        this.acceptances.push({ clauseId, by, at: this.clock.toISOString() });
        this.record("gate", { accept: clauseId, by }, { accepted: true });
        return true;
      },

      answerPanel: (input) => {
        const usable = input.cards.length > 0 && input.text !== null;
        const stored: PanelAnswer = {
          id: `A${++this.seq}`,
          question: input.question,
          outcome: usable ? "answered" : "declined",
          text: usable ? input.text : null,
          cards: input.cards.map((c) => ({ ...c })),
          ...(input.route ? { route: input.route } : {}),
          at: this.clock.toISOString(),
        };
        this.answers.push(stored);
        this.record("answer", { question: input.question, cards: input.cards.length }, { id: stored.id, outcome: stored.outcome });
        if (stored.cards.length > 0) this.record("cite", { answerId: stored.id }, { cards: stored.cards });
        return { ...stored };
      },

      draft: (input) => {
        const d: Draft = { id: `D${++this.seq}`, ...input, productIds: [...input.productIds], cardIds: [...input.cardIds], sentBy: null };
        this.drafts.push(d);
        this.record("gate", { draft: d.id, fileId: input.fileId, queue: input.queue, cards: input.cardIds.length }, { id: d.id });
        return { ...d };
      },

      send: (draftId, by) => {
        const d = this.drafts.find((x) => x.id === draftId);
        if (!by || !d) {
          this.refusedSends.push(draftId);
          this.record("gate", { send: draftId }, { sent: false, why: by ? "no such draft" : "no named person" });
          return false;
        }
        d.queue = "sent_by_person";
        d.sentBy = by;
        this.record("gate", { send: draftId, by }, { sent: true });
        return true;
      },

      coach: (input) => {
        const ev: CoachingEvent = { id: `C${++this.seq}`, ...input };
        this.coaching.push(ev);
        this.record("cite", { coaching: ev.id, interviewId: input.interviewId, findingKey: input.findingKey, span: input.evidenceSpan ?? null, cardId: input.cardId ?? null }, { severity: input.severity });
        return { ...ev };
      },

      readByInterview: (interviewId) => {
        const out = {
          verbatim: this.verbatim.filter((v) => v.interviewId === interviewId),
          files: this.files.filter((f) => f.interviewIds.includes(interviewId)),
          tasks: this.tasks.filter((t) => t.interviewId === interviewId),
          coaching: this.coaching.filter((c) => c.interviewId === interviewId),
        };
        this.record("read_file", { byInterview: interviewId }, { verbatim: out.verbatim.length, files: out.files.length, tasks: out.tasks.length, coaching: out.coaching.length });
        return out;
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

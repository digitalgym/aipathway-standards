// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/job-close.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The job-close world: a job system with jobs and their assigned techs, the
 * business's price book, captures arriving from site (what the tech said, the
 * photos, the parts as spoken), drafts going back to the tech, the replies
 * that come in, the job cards written into the job system, and the one
 * exceptions queue.
 *
 * THE INTENT ID IS THE CONTRACT. `writeCard` lands one card per intent id and
 * answers a second write with the same id with the ids it already holds. That
 * is what the close_job port promises (Office Voice CLOSE-1, live 2026-11-02), so the
 * world keeps it. It does NOT dedupe on anything else: a build that mints a
 * fresh intent id per try gets a second card, exactly as it would live.
 *
 * A LOST ANSWER IS A REAL CASE. `loseNextAnswer` makes the next write land
 * and then answer with no ids, the way a write from a phone on a bad signal
 * does. `refuseNextWrite` makes it land nothing. The build cannot tell the
 * two apart, which is the point: both are "not written" until a retry with
 * the same intent id comes back with ids.
 *
 * THE WORLD REFUSES A LINE WITH NO CATALOGUE CODE, as the adapter will, and
 * refuses a write to a job that does not exist. Both refusals are recorded
 * in `cardAttempts`, and the assertions read the attempts, so a refusal never
 * hides the build that tried (porting doc §8).
 *
 * THERE IS NO CREATE AND NO SEND-INVOICE PORT. A close cannot make a job or
 * bill one; the absence is the rule.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const EXCEPTION_KINDS = [
  "no_job",
  "not_assigned",
  "not_in_book",
  "ambiguous",
  "variation",
  "not_confirmed",
  "write_failed",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** Who owns each exception, by role. The business names the person in Settings. */
export type OwnerRole = "office_manager" | "variation_pricer" | "supervisor";
export const EXCEPTION_OWNER: Readonly<Record<ExceptionKind, OwnerRole>> = {
  no_job: "office_manager",
  not_assigned: "office_manager",
  not_in_book: "office_manager",
  ambiguous: "office_manager",
  variation: "variation_pricer",
  not_confirmed: "supervisor",
  write_failed: "office_manager",
};

export type LineKind = "part" | "labour" | "callout";

export interface Tech {
  techId: string;
  name: string;
  mobile: string;
}

export interface Job {
  jobId: string;
  techId: string;
  status: "scheduled" | "in_progress" | "complete";
  /** The catalogue codes the accepted quote covers. Absent on a do-and-charge job. */
  quoteCodes?: string[];
}

export interface PriceItem {
  code: string;
  name: string;
  /** What techs actually say for it, lower case. */
  aliases: string[];
  kind: LineKind;
  unitPrice: number;
}

export interface SpokenPart {
  spoken: string;
  qty: number;
}

/** What arrives from site. */
export interface Capture {
  captureId: string;
  jobId: string;
  /** The tech who sent it, by the number it came from. */
  fromMobile: string;
  at: string;
  transcript: string;
  notes?: string;
  photos: string[];
  partsUsed: SpokenPart[];
  /** Hours on site, as the tech said it. */
  labourHours?: number;
}

/** A capture as the build sees it: what the world holds of what the build has done with it. */
export interface CaptureStatus extends Capture {
  stored: boolean;
  draftId?: string;
  draftAt?: string;
  written?: { intentId: string; externalIds: string[] };
  completed: boolean;
  raised: ExceptionKind[];
}

export interface CardLine {
  kind: LineKind;
  catalogueCode?: string;
  qty: number;
  unitPrice?: number;
  source: "pricebook" | "parked";
}

export interface Parked {
  spoken: string;
  reason: "not_in_book" | "ambiguous" | "variation";
}

export interface Draft {
  captureId: string;
  jobId: string;
  toMobile: string;
  workDone: string;
  lines: CardLine[];
  parked: Parked[];
  /** The message the tech reads. */
  body: string;
}

export interface SentDraft extends Draft {
  draftId: string;
  at: string;
}

export interface Reply {
  replyId: string;
  fromMobile: string;
  text: string;
  at: string;
}

export interface CardWrite {
  jobId: string;
  intentId: string;
  workDone: string;
  lines: CardLine[];
  photos: string[];
}

export type WriteResult = { ok: true; externalIds: string[] } | { ok: false; error: string };

export interface ExceptionItem {
  jobId: string;
  captureId: string;
  kind: ExceptionKind;
  /** The tech's words, exactly, for a parked item. */
  spoken?: string;
  /** The person named in Settings for the owning role. */
  owner: string;
  detail: string;
}

export interface LogEntry {
  jobId: string;
  captureId: string;
  kind: "extraction" | "confirmation" | "write";
  detail: string;
  externalIds?: string[];
}

export interface StoredCapture extends Capture {
  evidenceId: string;
}

export interface Settings {
  tenant: string;
  /** Minutes the tech has to confirm before the supervisor is told. */
  confirmWithinMinutes: number;
  owners: Record<OwnerRole, string>;
}

export interface JobClosePorts {
  now(): Date;
  readSettings(): Settings;
  /** Every capture that has come in from site, with what the world holds of the build's work on it. */
  readCaptures(): CaptureStatus[];
  /** One job by the id the job system issued, with its assigned tech. Null if the job system has no such job. */
  readJob(jobId: string): (Job & { tech: Tech }) | null;
  /** The price book as it stands right now. */
  readPricebook(): PriceItem[];
  /** Keep what arrived, word for word. Returns the stored copy to work from. */
  storeVerbatim(capture: Capture): StoredCapture;
  /** The draft, to the tech, in one message. `{draftId}` in the body is replaced with the draft's id. */
  sendDraft(draft: Draft): { draftId: string };
  /** Replies that have come back. */
  readReplies(): Reply[];
  /** Write the card, lines and photos into the job system. One card per intent id. */
  writeCard(card: CardWrite): WriteResult;
  /** Set the job's status to complete in the job system. */
  markComplete(jobId: string, intentId: string): void;
  raiseException(item: ExceptionItem): void;
  log(entry: LogEntry): void;
}

export interface JobCloseWorldOptions {
  now?: Date;
  tenant?: string;
  techs?: Tech[];
  jobs?: Job[];
  pricebook?: PriceItem[];
  captures?: Capture[];
  settings?: Partial<Omit<Settings, "tenant">>;
}

export class JobCloseWorld {
  readonly techs: Tech[];
  readonly jobs: Job[];
  readonly captures: Capture[];
  readonly stored: Array<StoredCapture & { seq: number }> = [];
  readonly drafts: Array<SentDraft & { seq: number }> = [];
  readonly replies: Reply[] = [];
  /** Every write the build attempted, landed or not. */
  readonly cardAttempts: Array<CardWrite & { seq: number; at: string; result: WriteResult }> = [];
  /** Cards that landed in the job system, one per intent id. */
  readonly cards: Array<CardWrite & { externalIds: string[]; seq: number }> = [];
  readonly completions: Array<{ jobId: string; intentId: string; seq: number; at: string }> = [];
  readonly exceptions: Array<ExceptionItem & { seq: number }> = [];
  readonly logEntries: Array<LogEntry & { seq: number }> = [];
  /** Every price book read, by sequence. */
  readonly bookReads: number[] = [];
  readonly calls: PortCall[] = [];

  private book: PriceItem[];
  private readonly settings: Settings;
  private clock: Date;
  private seq = 0;
  /** What happens to the next writes that reach the job system, in order. */
  private nextWrites: Array<"lose_answer" | "refuse"> = [];

  constructor(opts: JobCloseWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-02T03:00:00.000Z"); // Monday 1pm Brisbane
    this.techs = (opts.techs ?? []).map((t) => ({ ...t }));
    this.jobs = (opts.jobs ?? []).map((j) => structuredClone(j));
    this.book = (opts.pricebook ?? []).map((p) => structuredClone(p));
    this.captures = (opts.captures ?? []).map((c) => structuredClone(c));
    this.settings = {
      tenant: opts.tenant ?? "harbour",
      confirmWithinMinutes: opts.settings?.confirmWithinMinutes ?? 120,
      owners: opts.settings?.owners ?? { office_manager: "Kim", variation_pricer: "Dana", supervisor: "Sam" },
    };
  }

  // ---- the business, between runs -------------------------------------------

  /** A new capture arrives from site. */
  capture(c: Capture): void {
    this.captures.push(structuredClone(c));
  }

  /** Someone replies by SMS, from their own number. */
  reply(fromMobile: string, text: string): void {
    this.replies.push({ replyId: `R-${this.replies.length + 1}`, fromMobile, text, at: this.clock.toISOString() });
  }

  /** The owner changes a price in the book. */
  setPrice(code: string, unitPrice: number): void {
    const item = this.book.find((p) => p.code === code);
    if (item) item.unitPrice = unitPrice;
  }

  /** The next write lands but its answer is lost: no ids come back. */
  loseNextAnswer(): void {
    this.nextWrites.push("lose_answer");
  }

  /** The next write is refused and lands nothing. */
  refuseNextWrite(): void {
    this.nextWrites.push("refuse");
  }

  advanceMinutes(minutes: number): void {
    this.clock = new Date(this.clock.getTime() + minutes * 60_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  get tenant(): string {
    return this.settings.tenant;
  }

  get owners(): Record<OwnerRole, string> {
    return { ...this.settings.owners };
  }

  get confirmWithinMinutes(): number {
    return this.settings.confirmWithinMinutes;
  }

  priceOf(code: string): number | undefined {
    return this.book.find((p) => p.code === code)?.unitPrice;
  }

  techById(techId: string): Tech | undefined {
    return this.techs.find((t) => t.techId === techId);
  }

  jobById(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.jobId === jobId);
  }

  cardsFor(jobId: string): Array<CardWrite & { externalIds: string[]; seq: number }> {
    return this.cards.filter((c) => c.jobId === jobId);
  }

  attemptsFor(jobId: string): Array<CardWrite & { seq: number; at: string; result: WriteResult }> {
    return this.cardAttempts.filter((c) => c.jobId === jobId);
  }

  exceptionsFor(captureId: string): Array<ExceptionItem & { seq: number }> {
    return this.exceptions.filter((e) => e.captureId === captureId);
  }

  private status(c: Capture): CaptureStatus {
    const draft = [...this.drafts].reverse().find((d) => d.captureId === c.captureId);
    // Written means a write for this capture came back with ids, whatever
    // intent id the build chose. A lost answer is not written.
    const ok = [...this.cardAttempts]
      .reverse()
      .find((a) => a.jobId === c.jobId && a.intentId.endsWith(`:${c.captureId}`) && a.result.ok);
    return {
      ...structuredClone(c),
      stored: this.stored.some((s) => s.captureId === c.captureId),
      ...(draft ? { draftId: draft.draftId, draftAt: draft.at } : {}),
      ...(ok && ok.result.ok ? { written: { intentId: ok.intentId, externalIds: [...ok.result.externalIds] } } : {}),
      completed: this.completions.some((k) => k.jobId === c.jobId),
      raised: this.exceptions.filter((e) => e.captureId === c.captureId).map((e) => e.kind),
    };
  }

  /** The intent id the standard names for a capture. */
  intentFor(c: Pick<Capture, "jobId" | "captureId">): string {
    return `close:${this.settings.tenant}:${c.jobId}:${c.captureId}`;
  }

  private record(port: Port, request: unknown, response: unknown): number {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
    });
    return ++this.seq;
  }

  ports(): JobClosePorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        const out = structuredClone(this.settings);
        this.record("read_rule", { settings: true }, out);
        return out;
      },

      readCaptures: () => {
        const out = this.captures.map((c) => this.status(c));
        this.record("read_inbox", { captures: true }, { count: out.length });
        return out;
      },

      readJob: (jobId) => {
        const job = this.jobs.find((j) => j.jobId === jobId);
        const tech = job ? this.techs.find((t) => t.techId === job.techId) : undefined;
        const out = job && tech ? { ...structuredClone(job), tech: { ...tech } } : null;
        this.record("read_job", { jobId }, out ? { found: true, techId: out.techId } : { found: false });
        return out;
      },

      readPricebook: () => {
        const out = this.book.map((p) => structuredClone(p));
        this.bookReads.push(this.record("read_pricebook", { all: true }, { count: out.length }));
        return out;
      },

      storeVerbatim: (capture) => {
        const evidenceId = `E-${this.stored.length + 1}`;
        const copy = { ...structuredClone(capture), evidenceId };
        const seq = this.record("evidence", { captureId: capture.captureId }, { evidenceId });
        this.stored.push({ ...copy, seq });
        return structuredClone(copy);
      },

      sendDraft: (draft) => {
        const draftId = `D-${this.drafts.length + 1}`;
        const at = this.clock.toISOString();
        // The message names the draft, so the tech's one-word reply can too.
        const body = draft.body.split("{draftId}").join(draftId);
        const seq = this.record("send_sms", { to: draft.toMobile, captureId: draft.captureId, body }, { draftId });
        this.drafts.push({ ...structuredClone(draft), body, draftId, at, seq });
        return { draftId };
      },

      readReplies: () => {
        const out = this.replies.map((r) => ({ ...r }));
        this.record("read_inbox", { replies: true }, { count: out.length });
        return out;
      },

      writeCard: (card) => {
        const at = this.clock.toISOString();
        let result: WriteResult;
        const existing = this.cards.find((c) => c.intentId === card.intentId);
        if (!this.jobs.some((j) => j.jobId === card.jobId)) {
          result = { ok: false, error: "no such job" };
        } else if (card.lines.some((l) => !l.catalogueCode)) {
          result = { ok: false, error: "a line has no catalogue code" };
        } else if (this.nextWrites[0] === "refuse") {
          this.nextWrites.shift();
          result = { ok: false, error: "job system unavailable" };
        } else if (existing) {
          result = { ok: true, externalIds: [...existing.externalIds] };
        } else {
          const n = this.cards.length + 1;
          const externalIds = [`card-${n}`, ...card.lines.map((_, i) => `line-${n}-${i + 1}`), ...card.photos.map((_, i) => `att-${n}-${i + 1}`)];
          this.cards.push({ ...structuredClone(card), externalIds, seq: this.seq + 1 });
          if (this.nextWrites[0] === "lose_answer") {
            this.nextWrites.shift();
            result = { ok: false, error: "timeout" };
          } else {
            result = { ok: true, externalIds };
          }
        }
        const seq = this.record("close_job", { jobId: card.jobId, intentId: card.intentId, lines: card.lines.length, photos: card.photos.length }, result);
        this.cardAttempts.push({ ...structuredClone(card), seq, at, result: structuredClone(result) });
        return structuredClone(result);
      },

      markComplete: (jobId, intentId) => {
        const at = this.clock.toISOString();
        const seq = this.record("write_job", { jobId, status: "complete", intentId }, { ok: true });
        const job = this.jobs.find((j) => j.jobId === jobId);
        if (job) job.status = "complete";
        this.completions.push({ jobId, intentId, seq, at });
      },

      raiseException: (item) => {
        const seq = this.record("raise_exception", item, { ok: true });
        this.exceptions.push({ ...item, seq });
      },

      log: (entry) => {
        const seq = this.record("write_log", entry, { recorded: true });
        this.logEntries.push({ ...structuredClone(entry), seq });
      },
    };
  }
}

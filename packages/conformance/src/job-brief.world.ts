// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/job-brief.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The job-brief world: the day's slots per tech, the jobs they point at, the
 * site history the job system keeps (visits, notes, access and hazard notes,
 * parts set aside), the quotes and the asset records, the techs with the
 * channel each agreed to, the business's settings, and the briefs the build
 * delivered.
 *
 * WHY IT IS ITS OWN WORLD. The Dispatch Board world holds the board while the
 * slots are being written. This one holds the morning after: the slots are
 * written, and the only thing the build may do is read and tell. Cited
 * Answer's world holds a clause library and asserts on an answer's cards; this
 * one asserts on every line of a brief the same way, against the records a
 * trade business's job system actually holds.
 *
 * THE JOB SYSTEM DOES NOT SCOPE FOR YOU. A site's history comes back for
 * every customer who ever lived there unless the read names the customer, as
 * a real site record does after a house changes hands. A world that filtered
 * by customer on its own would pass the build check 6 exists to fail
 * (porting doc §8), so the reads take an optional customer id and the
 * assertion reads which reads named one.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a brief
 * to a tech with no agreed channel is refused. The assertion still reads
 * `attempts`, so the refusal never hides the build that tried. Everything else
 * (a line with no source, a reworded note, a price, another customer's record,
 * a second delivery) is recorded and left for the assertion.
 *
 * THERE IS NO WRITE PORT. Nothing here changes a job, a quote, a slot or a
 * note. The runner changes them between runs (`moveSlot`, `deleteRecord`), the
 * way the office does.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const LINE_KINDS = ["hazard", "access", "last_visit", "open_quote", "asset", "parts", "customer_note"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

/** Known gaps, shown on the brief rather than filled. */
export const MISSING_KINDS = ["access", "hazard", "asset"] as const;
export type MissingKind = (typeof MISSING_KINDS)[number];

/** What gets parked for a person, on the one exception queue. */
export const EXCEPTION_KINDS = ["no_agreed_channel", "job_not_found"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export interface Slot {
  jobId: string;
  techId: string;
  /** ISO datetimes, as the board holds them. */
  start: string;
  end: string;
}

export interface Job {
  jobId: string;
  customerId: string;
  siteId: string;
  address: string;
  description: string;
}

/** One record in the job system's history for a site. */
export interface HistoryRecord {
  recordId: string;
  system: string;
  customerId: string;
  siteId: string;
  kind: "visit" | "note" | "access" | "hazard" | "parts";
  text: string;
  author?: string;
  /** ISO date. Absent on a record the job system holds with no date. */
  at?: string;
  /** Parts records only: the job the parts were set aside for. */
  jobId?: string;
}

export interface Quote {
  quoteId: string;
  system: string;
  customerId: string;
  siteId: string;
  status: "open" | "accepted" | "declined" | "expired";
  /** ISO date the quote was issued. */
  issuedOn: string;
  description: string;
  total: number;
}

export interface AssetRecord {
  assetId: string;
  system: string;
  customerId: string;
  siteId: string;
  description: string;
  /** ISO date the record was last updated. */
  at: string;
}

export interface Tech {
  techId: string;
  name: string;
  /** The channel the tech agreed to receive briefs on, if any. */
  channel?: "sms" | "email" | "chat";
}

export interface Settings {
  /** quote: customer notes appear in their own words. omit: they are left out. */
  customerNotes: "quote" | "omit";
  /** HH:MM on the brief's day, by which the first brief must be delivered. */
  sendBy: string;
}

export interface Source {
  system: string;
  record: string;
  at?: string;
}

export interface BriefLine {
  kind: LineKind;
  text: string;
  source?: Source;
  author?: string;
}

export interface BriefJob {
  jobExternalId: string;
  window: { start: string; end: string };
  lines: BriefLine[];
  missing: MissingKind[];
}

export interface Brief {
  forDate: string;
  techId: string;
  jobs: BriefJob[];
}

export interface Delivery {
  techId: string;
  forDate: string;
  channel: string;
  brief: Brief;
  at: string;
}

/** A read of a site's records, and whether it named the customer. */
export interface ScopedRead {
  what: "history" | "quotes" | "assets";
  siteId: string;
  customerId?: string;
}

export interface Scope {
  siteId: string;
  /** Omit it and the job system returns every customer's records at the site. */
  customerId?: string;
}

export interface JobBriefPorts {
  now(): Date;
  readSettings(): Settings;
  /** The techs on the books. */
  readTechs(): Tech[];
  /** Every slot on the board for one ISO date, every tech. */
  readSlots(date: string): Slot[];
  readJob(jobId: string): Job | null;
  readHistory(scope: Scope): HistoryRecord[];
  readQuotes(scope: Scope): Quote[];
  readAssets(scope: Scope): AssetRecord[];
  /**
   * The citation for one record id: its system, its id and its own date, read
   * from the store. Null if no such record exists. `at` is absent on a record
   * held with no date.
   */
  cite(recordId: string): Source | null;
  /** The channel this tech agreed to, if any. */
  channelFor(techId: string): { agreed: boolean; channel?: string };
  /** What this tech has already been sent for the day, oldest first. */
  listDeliveries(techId: string, forDate: string): Delivery[];
  /** Refused, and recorded, for a tech with no agreed channel. */
  deliver(techId: string, brief: Brief): { delivered: boolean; why?: string };
  /** Park an item on the exception queue for a person. */
  raiseException(ref: string, kind: ExceptionKind, detail: string): void;
}

export interface JobBriefWorldOptions {
  now?: Date;
  slots?: Slot[];
  jobs?: Job[];
  history?: HistoryRecord[];
  quotes?: Quote[];
  assets?: AssetRecord[];
  techs?: Tech[];
  settings?: Settings;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from one ISO date to another. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`)) / 86_400_000);
}

/**
 * True when `text` is the record's own words, or the first part of them cut
 * with an ellipsis. The test check 3 applies, exported so a builder can apply
 * it to their own drafts.
 */
export function isQuoteOf(text: string, original: string): boolean {
  const t = text.trim();
  const o = original.trim();
  if (t === o) return true;
  const cut = t.replace(/(\.\.\.|…)$/, "").trimEnd();
  if (cut === t || cut.length === 0) return false;
  return o.startsWith(cut);
}

export class JobBriefWorld {
  readonly slots: Slot[];
  readonly jobs: Job[];
  readonly history: HistoryRecord[];
  readonly quotes: Quote[];
  readonly assets: AssetRecord[];
  readonly techs: Tech[];
  /** Briefs that reached a tech. */
  readonly deliveries: Delivery[] = [];
  /** Every brief the build tried to deliver, allowed or not. */
  readonly attempts: Array<{ techId: string; brief: Brief; at: string }> = [];
  /** Every channel check, in order. */
  readonly channelChecks: Array<{ techId: string; at: string }> = [];
  readonly exceptions: Array<{ ref: string; kind: ExceptionKind; detail: string }> = [];
  readonly scopedReads: ScopedRead[] = [];
  readonly calls: PortCall[] = [];
  /** When the runner last moved a slot, for the assertion. */
  slotMovedAt: string | null = null;

  private settings: Settings;
  private clock: Date;

  constructor(opts: JobBriefWorldOptions = {}) {
    // 5:30am on the brief's day, the clock in UTC throughout.
    this.clock = opts.now ?? new Date("2026-11-02T05:30:00.000Z");
    this.slots = (opts.slots ?? []).map((s) => ({ ...s }));
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j }));
    this.history = (opts.history ?? []).map((h) => ({ ...h }));
    this.quotes = (opts.quotes ?? []).map((q) => ({ ...q }));
    this.assets = (opts.assets ?? []).map((a) => ({ ...a }));
    this.techs = (opts.techs ?? []).map((t) => ({ ...t }));
    this.settings = opts.settings ? { ...opts.settings } : { customerNotes: "quote", sendBy: "06:00" };
  }

  // ---- the business, between runs -------------------------------------------

  /** The office moves a slot on the board. */
  moveSlot(jobId: string, start: string, end: string): void {
    const s = this.slots.find((x) => x.jobId === jobId);
    if (!s) return;
    s.start = start;
    s.end = end;
    this.slotMovedAt = this.clock.toISOString();
  }

  /** Somebody deletes a record in the job system. */
  deleteRecord(recordId: string): void {
    const i = this.history.findIndex((h) => h.recordId === recordId);
    if (i >= 0) this.history.splice(i, 1);
  }

  setSettings(next: Partial<Settings>): void {
    this.settings = { ...this.settings, ...next };
  }

  advanceMinutes(n: number): void {
    this.clock = new Date(this.clock.getTime() + n * 60_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  get sendBy(): string {
    return this.settings.sendBy;
  }

  /** Any record by id, with the customer it belongs to. */
  storedRecord(id: string): { customerId: string; system: string; at?: string; text?: string; kind: string } | null {
    const h = this.history.find((x) => x.recordId === id);
    if (h) return { customerId: h.customerId, system: h.system, at: h.at, text: h.text, kind: h.kind };
    const q = this.quotes.find((x) => x.quoteId === id);
    if (q) return { customerId: q.customerId, system: q.system, at: q.issuedOn, kind: `quote_${q.status}` };
    const a = this.assets.find((x) => x.assetId === id);
    if (a) return { customerId: a.customerId, system: a.system, at: a.at, text: a.description, kind: "asset" };
    return null;
  }

  job(jobId: string): Job | undefined {
    return this.jobs.find((j) => j.jobId === jobId);
  }

  attemptsTo(techId: string): Array<{ techId: string; brief: Brief; at: string }> {
    return this.attempts.filter((a) => a.techId === techId);
  }

  /** The latest brief the build tried to deliver to a tech, delivered or not. */
  lastBriefFor(techId: string): Brief | undefined {
    return this.attemptsTo(techId).at(-1)?.brief;
  }

  /** Every line of every brief the build tried to deliver, with its job. */
  allLines(): Array<{ job: BriefJob; line: BriefLine }> {
    return this.attempts.flatMap((a) => a.brief.jobs.flatMap((job) => job.lines.map((line) => ({ job, line }))));
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

  private scoped<T extends { siteId: string; customerId: string }>(what: ScopedRead["what"], all: T[], scope: Scope): T[] {
    this.scopedReads.push({ what, siteId: scope.siteId, ...(scope.customerId ? { customerId: scope.customerId } : {}) });
    return all.filter((r) => r.siteId === scope.siteId && (!scope.customerId || r.customerId === scope.customerId));
  }

  ports(): JobBriefPorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        this.record("read_rule", { settings: true }, { ...this.settings });
        return { ...this.settings };
      },

      readTechs: () => {
        const out = this.techs.map((t) => ({ ...t }));
        this.record("read_job", { staff: true }, { count: out.length });
        return out;
      },

      readSlots: (date) => {
        const out = this.slots.filter((s) => s.start.slice(0, 10) === date).map((s) => ({ ...s }));
        this.record("read_job", { slots: date }, { count: out.length });
        return out;
      },

      readJob: (jobId) => {
        const j = this.jobs.find((x) => x.jobId === jobId);
        this.record("read_job", { jobId }, j ? { found: true } : { found: false });
        return j ? { ...j } : null;
      },

      readHistory: (scope) => {
        const out = this.scoped("history", this.history, scope).map((h) => ({ ...h }));
        this.record("read_job", { history: scope }, { count: out.length });
        return out;
      },

      readQuotes: (scope) => {
        const out = this.scoped("quotes", this.quotes, scope).map((q) => ({ ...q }));
        this.record("read_quote", scope, { count: out.length });
        return out;
      },

      readAssets: (scope) => {
        const out = this.scoped("assets", this.assets, scope).map((a) => ({ ...a }));
        this.record("read_asset", scope, { count: out.length });
        return out;
      },

      cite: (recordId) => {
        const r = this.storedRecord(recordId);
        const out: Source | null = r ? { system: r.system, record: recordId, ...(r.at ? { at: r.at } : {}) } : null;
        this.record("cite", { recordId }, out ?? { found: false });
        return out;
      },

      channelFor: (techId) => {
        const t = this.techs.find((x) => x.techId === techId);
        this.channelChecks.push({ techId, at: this.clock.toISOString() });
        const out = t?.channel ? { agreed: true, channel: t.channel } : { agreed: false };
        this.record("gate", { techId, channel: true }, out);
        return out;
      },

      listDeliveries: (techId, forDate) => {
        const out = this.deliveries.filter((d) => d.techId === techId && d.forDate === forDate).map((d) => structuredClone(d));
        this.record("evidence", { deliveries: techId, forDate }, { count: out.length });
        return out;
      },

      deliver: (techId, brief) => {
        const at = this.clock.toISOString();
        this.attempts.push({ techId, brief: structuredClone(brief), at });
        const t = this.techs.find((x) => x.techId === techId);
        if (!t?.channel) {
          this.record("notify", { techId, brief }, { delivered: false, why: "no agreed channel" });
          return { delivered: false, why: "no agreed channel" };
        }
        this.deliveries.push({ techId, forDate: brief.forDate, channel: t.channel, brief: structuredClone(brief), at });
        this.record("notify", { techId, brief }, { delivered: true, channel: t.channel });
        return { delivered: true };
      },

      raiseException: (ref, kind, detail) => {
        if (!this.exceptions.some((e) => e.ref === ref && e.kind === kind)) this.exceptions.push({ ref, kind, detail });
        this.record("raise_exception", { ref, kind, detail }, { ok: true });
      },
    };
  }
}

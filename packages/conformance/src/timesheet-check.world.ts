// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/timesheet-check.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The timesheet world: people on a roster, jobs they were allocated, entries
 * captured on site, a rule store with editions, an anomaly queue, and a payroll
 * that takes one export per period.
 *
 * WHY IT IS ITS OWN WORLD. The invoice-out world holds a job that has been done
 * and priced. This one holds a week of hours before anybody is paid for them,
 * and the two things it exists to show are a queue that a person empties and a
 * release that a person gives. Neither has an equivalent in a ledger of jobs.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: an export
 * write that passes an existing export id updates that export rather than
 * creating another, and a write without one creates a second export, because
 * that is the duplicate check 9 exists to catch. Everything else is recorded
 * as given: a typed total, a card citing a retired edition, a resolution with
 * no person behind it, an export with no release. The world never corrects a
 * build; the assertion judges the trace.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that interprets a rule, chooses
 * an award, or pays anybody. A build cannot do those through the ports because
 * the ports do not exist. The rule store hands back dated text with an edition
 * and nothing more.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const ANOMALY_KINDS = [
  "over_hours",
  "overlap",
  "missing_break",
  "not_rostered",
  "not_allocated",
  "rule_unclear",
] as const;
export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export const RESOLUTION_REASONS = ["approved", "corrected", "rejected"] as const;
export type ResolutionReason = (typeof RESOLUTION_REASONS)[number];

export const SOURCES = ["site", "app", "paper"] as const;
export type Source = (typeof SOURCES)[number];

export interface Person {
  id: string;
  name: string;
  /** Who owns this person's anomalies. Check 3. */
  supervisor: string;
}

export interface Entry {
  id: string;
  personId: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Null when the entry was captured with no job at all. Check 1. */
  jobId: string | null;
  /** HH:MM, local to the site. */
  start: string;
  end: string;
  breakMinutes: number;
  source: Source;
  /** What the capture app flagged: a disputed break, an unusual shift. Check 6. */
  flags?: string[];
}

export interface Allocation {
  personId: string;
  jobId: string;
  date: string;
}

export interface Roster {
  personId: string;
  date: string;
  rostered: boolean;
}

export interface Rule {
  id: string;
  instrument: string;
  edition: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  text: string;
  /** The situations this edition plainly names. Anything else is parked. Check 6. */
  covers: string[];
  /** Set by the runner through `retireRule`. Check 5. */
  retired: boolean;
}

/** A person's decision in the queue. The runner makes these, never the build. */
export interface Decision {
  by: string;
  reason: ResolutionReason;
  at: string;
}

/** What the build wrote when it took the anomaly out of the queue. Recorded as given. */
export interface Resolution {
  by: string | null;
  reason: string;
  at: string;
}

export interface Anomaly {
  id: string;
  entryId: string;
  kind: string;
  owner: string;
  decision: Decision | null;
  resolution: Resolution | null;
  evidence: string[];
  at: string;
}

export interface Period {
  id: string;
  from: string;
  to: string;
  /** A named person pressed release. Seeded by the runner. Check 8. */
  releaseRequested: { by: string; at: string } | null;
  /** What the build recorded at the gate. Null until it does. */
  releasedBy: string | null;
  exportExternalId: string | null;
}

export interface Card {
  entryId: string;
  ruleId: string;
  edition: string;
  effectiveFrom: string;
  at: string;
}

export interface SheetLine {
  entryId: string;
  personId: string;
  date: string;
  jobId: string;
  hours: number;
  /** The rule situations applied to this line: overtime_daily, saturday. Check 4. */
  topics: string[];
}

export interface Total {
  personId: string;
  /** A date for a daily total, null for the weekly one. */
  date: string | null;
  hours: number;
  /** The entries the total derives from. Empty means typed. Check 2. */
  entryIds: string[];
}

export interface Report {
  id: string;
  periodId: string;
  lines: SheetLine[];
  totals: Total[];
  anomaliesFound: number;
  anomaliesResolved: number;
  release: string | null;
  exportExternalId: string | null;
  at: string;
}

export interface Export {
  id: string;
  externalId: string | null;
  periodId: string;
  lines: SheetLine[];
  totals: Total[];
  releasedBy: string | null;
  updates: number;
  at: string;
}

export interface PersonRecord {
  personId: string;
  periodId: string;
  entries: Entry[];
  anomalies: Anomaly[];
  cards: Card[];
  release: { by: string | null };
  exportExternalId: string | null;
}

/** Hours on an entry after the break. Pure, and shared by builds and assertions. */
export function hoursOf(e: Entry): number {
  const [sh, sm] = e.start.split(":").map(Number);
  const [eh, em] = e.end.split(":").map(Number);
  const minutes = (eh! * 60 + em!) - (sh! * 60 + sm!) - e.breakMinutes;
  return Math.round((minutes / 60) * 100) / 100;
}

/** 0 is Sunday, 6 is Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function overlaps(a: Entry, b: Entry): boolean {
  return a.personId === b.personId && a.date === b.date && a.start < b.end && b.start < a.end;
}

export interface TimesheetPorts {
  now(): Date;
  /** The current period, with whether a person has released it. */
  readPeriod(): Period;
  /** Entries captured on site or in the app, for the period. Check 1. */
  readEntries(periodId: string): Entry[];
  /** Who was allocated to which job on which day. Check 1. */
  readAllocations(): Allocation[];
  /** The people, with who owns their anomalies. Check 1 and 3. */
  readPeople(): Person[];
  /** Who was rostered on which day. Check 3. */
  readRoster(): Roster[];
  /** Every rule edition the store holds, retired ones included. Check 4, 5 and 6. */
  readRules(): Rule[];
  /** A card naming the rule applied to an entry. Recorded as given. Check 4. */
  cite(card: { entryId: string; ruleId: string; edition: string; effectiveFrom: string }): void;
  /** Put an anomaly in the queue. Recorded as given, kind and owner included. Check 3. */
  raiseAnomaly(input: { entryId: string; kind: string; owner: string }): Anomaly;
  /** The queue for the period, with any decisions people have made. Check 7. */
  readAnomalies(periodId: string): Anomaly[];
  /** Take an anomaly out of the queue. Recorded as given, null person included. Check 7. */
  resolveAnomaly(anomalyId: string, resolution: { by: string | null; reason: string }): void;
  /** Attach the person's decision, or anything else, to an anomaly. Check 7 and 11. */
  attachEvidence(anomalyId: string, ref: string): void;
  /** The release gate. Recorded as given, null person included. Check 8. */
  releasePeriod(periodId: string, by: { person: string | null }): void;
  /** The existing export for the period, if one exists. Read before writing. Check 9. */
  readExport(periodId: string): Export | null;
  /**
   * Write or update the export. With `exportId`, updates that export. Without
   * it, creates a new one even if the period already has one. Check 9.
   */
  writeExport(input: {
    exportId?: string;
    periodId: string;
    lines: SheetLine[];
    totals: Total[];
    releasedBy: string | null;
  }): Export | null;
  /** The period's report, published every run. Check 10. */
  publishReport(report: Omit<Report, "id" | "at">): void;
  /** Everything for one person in one period. Check 11. */
  readRecord(personId: string, periodId: string): PersonRecord;
}

export interface TimesheetWorldOptions {
  now?: Date;
  people?: Person[];
  roster?: Roster[];
  allocations?: Allocation[];
  entries?: Entry[];
  rules?: Rule[];
  period?: { id: string; from: string; to: string };
}

export class TimesheetWorld {
  readonly anomalies: Anomaly[] = [];
  readonly cards: Card[] = [];
  readonly reports: Report[] = [];
  readonly exports: Export[] = [];
  readonly calls: PortCall[] = [];

  private readonly people: Person[];
  private readonly roster: Roster[];
  private readonly allocations: Allocation[];
  private readonly entries: Entry[];
  private readonly rules: Rule[];
  private readonly periods: Period[] = [];
  private clock: Date;
  private seq = 0;

  constructor(opts: TimesheetWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.people = (opts.people ?? []).map((p) => ({ ...p }));
    this.roster = (opts.roster ?? []).map((r) => ({ ...r }));
    this.allocations = (opts.allocations ?? []).map((a) => ({ ...a }));
    this.entries = (opts.entries ?? []).map((e) => ({ ...e, flags: e.flags ? [...e.flags] : undefined }));
    this.rules = (opts.rules ?? []).map((r) => ({ ...r, covers: [...r.covers] }));
    this.setPeriod(opts.period ?? { id: "2026-W39", from: "2026-09-21", to: "2026-09-27" });
  }

  // ── Stimuli. The runner does these, never the build. ──

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Open a new period. The current one stays with its release and export. */
  setPeriod(p: { id: string; from: string; to: string }): void {
    this.periods.push({ ...p, releaseRequested: null, releasedBy: null, exportExternalId: null });
  }

  /** A person decides an anomaly in the queue. */
  decide(anomalyId: string, by: string, reason: ResolutionReason): void {
    const a = this.anomalies.find((x) => x.id === anomalyId);
    if (a) a.decision = { by, reason, at: this.clock.toISOString() };
  }

  /** A named person releases the current period. */
  release(by: string): void {
    this.current().releaseRequested = { by, at: this.clock.toISOString() };
  }

  /** The issuer retires an edition. Check 5. */
  retireRule(ruleId: string, effectiveTo: string): void {
    const r = this.rules.find((x) => x.id === ruleId);
    if (r) {
      r.retired = true;
      r.effectiveTo = effectiveTo;
    }
  }

  // ── Non-recording twins for the runner. ──

  current(): Period {
    return this.periods[this.periods.length - 1]!;
  }

  periodById(id: string): Period | undefined {
    return this.periods.find((p) => p.id === id);
  }

  entry(id: string): Entry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  entriesIn(periodId: string): Entry[] {
    const p = this.periodById(periodId);
    if (!p) return [];
    return this.entries.filter((e) => e.date >= p.from && e.date <= p.to);
  }

  anomaliesFor(entryId: string): Anomaly[] {
    return this.anomalies.filter((a) => a.entryId === entryId);
  }

  anomaliesIn(periodId: string): Anomaly[] {
    const ids = new Set(this.entriesIn(periodId).map((e) => e.id));
    return this.anomalies.filter((a) => ids.has(a.entryId));
  }

  openAnomalies(): Anomaly[] {
    return this.anomalies.filter((a) => a.resolution === null);
  }

  cardsFor(entryId: string): Card[] {
    return this.cards.filter((c) => c.entryId === entryId);
  }

  rule(id: string): Rule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  exportsFor(periodId: string): Export[] {
    return this.exports.filter((x) => x.periodId === periodId);
  }

  reportsFor(periodId: string): Report[] {
    return this.reports.filter((r) => r.periodId === periodId);
  }

  recordFor(personId: string, periodId: string): PersonRecord {
    const p = this.periodById(periodId);
    const entries = this.entriesIn(periodId).filter((e) => e.personId === personId);
    const ids = new Set(entries.map((e) => e.id));
    return {
      personId,
      periodId,
      entries: entries.map((e) => ({ ...e })),
      anomalies: this.anomalies.filter((a) => ids.has(a.entryId)).map((a) => this.copyAnomaly(a)),
      cards: this.cards.filter((c) => ids.has(c.entryId)).map((c) => ({ ...c })),
      release: { by: p?.releasedBy ?? null },
      exportExternalId: p?.exportExternalId ?? null,
    };
  }

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

  private copyAnomaly(a: Anomaly): Anomaly {
    return {
      ...a,
      decision: a.decision ? { ...a.decision } : null,
      resolution: a.resolution ? { ...a.resolution } : null,
      evidence: [...a.evidence],
    };
  }

  private copyExport(x: Export): Export {
    return {
      ...x,
      lines: x.lines.map((l) => ({ ...l, topics: [...l.topics] })),
      totals: x.totals.map((t) => ({ ...t, entryIds: [...t.entryIds] })),
    };
  }

  ports(): TimesheetPorts {
    return {
      now: () => new Date(this.clock),

      readPeriod: () => {
        const p = this.current();
        this.record("read_job", { period: true }, { id: p.id, releaseRequested: p.releaseRequested?.by ?? null, exportExternalId: p.exportExternalId });
        return { ...p, releaseRequested: p.releaseRequested ? { ...p.releaseRequested } : null };
      },

      readEntries: (periodId) => {
        const rows = this.entriesIn(periodId).map((e) => ({ ...e, flags: e.flags ? [...e.flags] : undefined }));
        this.record("read_job", { entries: periodId }, { count: rows.length, ids: rows.map((e) => e.id) });
        return rows;
      },

      readAllocations: () => {
        this.record("read_job", { allocations: true }, { count: this.allocations.length });
        return this.allocations.map((a) => ({ ...a }));
      },

      readPeople: () => {
        this.record("read_contacts", { people: true }, { count: this.people.length, ids: this.people.map((p) => p.id) });
        return this.people.map((p) => ({ ...p }));
      },

      readRoster: () => {
        this.record("read_contacts", { roster: true }, { count: this.roster.length });
        return this.roster.map((r) => ({ ...r }));
      },

      readRules: () => {
        this.record("read_rule", { at: this.clock.toISOString() }, { editions: this.rules.map((r) => `${r.id}:${r.edition}${r.retired ? ":retired" : ""}`) });
        return this.rules.map((r) => ({ ...r, covers: [...r.covers] }));
      },

      cite: (card) => {
        const c: Card = { ...card, at: this.clock.toISOString() };
        this.cards.push(c);
        this.record("cite", { entryId: card.entryId, ruleId: card.ruleId, edition: card.edition, effectiveFrom: card.effectiveFrom }, { ok: true });
      },

      raiseAnomaly: (input) => {
        const a: Anomaly = {
          id: `A${++this.seq}`,
          entryId: input.entryId,
          kind: input.kind,
          owner: input.owner,
          decision: null,
          resolution: null,
          evidence: [],
          at: this.clock.toISOString(),
        };
        this.anomalies.push(a);
        this.record("escalate", { entryId: input.entryId, kind: input.kind, owner: input.owner }, { id: a.id });
        return this.copyAnomaly(a);
      },

      readAnomalies: (periodId) => {
        const rows = this.anomaliesIn(periodId);
        this.record("read_job", { anomalies: periodId }, { count: rows.length, open: rows.filter((a) => a.resolution === null).map((a) => a.id) });
        return rows.map((a) => this.copyAnomaly(a));
      },

      resolveAnomaly: (anomalyId, resolution) => {
        const a = this.anomalies.find((x) => x.id === anomalyId);
        if (a) a.resolution = { by: resolution.by, reason: resolution.reason, at: this.clock.toISOString() };
        this.record("gate", { resolve: anomalyId, by: resolution.by, reason: resolution.reason }, { ok: Boolean(a) });
      },

      attachEvidence: (anomalyId, ref) => {
        const a = this.anomalies.find((x) => x.id === anomalyId);
        if (a) a.evidence.push(ref);
        this.record("evidence", { anomalyId, ref }, { attached: Boolean(a) });
      },

      releasePeriod: (periodId, by) => {
        const p = this.periodById(periodId);
        if (p) p.releasedBy = by.person;
        this.record("gate", { release: periodId, person: by.person }, { ok: Boolean(p) });
      },

      readExport: (periodId) => {
        const x = this.exports.find((e) => e.periodId === periodId) ?? null;
        this.record("read_job", { exportFor: periodId }, x ? { exportId: x.id, externalId: x.externalId } : null);
        return x ? this.copyExport(x) : null;
      },

      writeExport: (input) => {
        const openAtWrite = this.openAnomalies().length;
        if (input.exportId) {
          const existing = this.exports.find((x) => x.id === input.exportId);
          if (!existing) {
            this.record("write_ledger", { update: input.exportId, periodId: input.periodId, openAtWrite }, null);
            return null;
          }
          existing.lines = input.lines.map((l) => ({ ...l, topics: [...l.topics] }));
          existing.totals = input.totals.map((t) => ({ ...t, entryIds: [...t.entryIds] }));
          existing.releasedBy = input.releasedBy;
          existing.updates += 1;
          this.record("write_ledger", { update: existing.id, periodId: input.periodId, lines: input.lines.length, releasedBy: input.releasedBy, openAtWrite }, { externalId: existing.externalId, updates: existing.updates });
          return this.copyExport(existing);
        }
        const id = `EXP${++this.seq}`;
        const x: Export = {
          id,
          externalId: `payroll-${id}`,
          periodId: input.periodId,
          lines: input.lines.map((l) => ({ ...l, topics: [...l.topics] })),
          totals: input.totals.map((t) => ({ ...t, entryIds: [...t.entryIds] })),
          releasedBy: input.releasedBy,
          updates: 0,
          at: this.clock.toISOString(),
        };
        this.exports.push(x);
        const p = this.periodById(input.periodId);
        if (p) p.exportExternalId = x.externalId;
        this.record("write_ledger", { periodId: input.periodId, lines: input.lines.length, totals: input.totals.map((t) => `${t.personId}:${t.date ?? "week"}=${t.hours}`), releasedBy: input.releasedBy, openAtWrite }, { id, externalId: x.externalId });
        return this.copyExport(x);
      },

      publishReport: (report) => {
        const r: Report = {
          ...report,
          id: `R${++this.seq}`,
          lines: report.lines.map((l) => ({ ...l, topics: [...l.topics] })),
          totals: report.totals.map((t) => ({ ...t, entryIds: [...t.entryIds] })),
          at: this.clock.toISOString(),
        };
        this.reports.push(r);
        this.record("publish_report", { periodId: report.periodId, lines: report.lines.length, totals: report.totals.length, anomaliesFound: report.anomaliesFound, anomaliesResolved: report.anomaliesResolved, release: report.release, exportExternalId: report.exportExternalId }, { id: r.id });
      },

      readRecord: (personId, periodId) => {
        const rec = this.recordFor(personId, periodId);
        this.record("read_contacts", { record: personId, periodId }, { entries: rec.entries.length, anomalies: rec.anomalies.length, cards: rec.cards.length, release: rec.release.by });
        return rec;
      },
    };
  }
}

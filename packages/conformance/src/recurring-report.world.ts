// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/recurring-report.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The report world: a definitions register, two sources that can be read or
 * broken, a schedule, thresholds, audiences, and the reports that get
 * published against them.
 *
 * WHY IT IS ITS OWN WORLD. The segments world holds many sites drifting from
 * one rule. This one holds one business, two periods and a clock, and the
 * thing it is about is provenance: which definition, which source, read when.
 * Neither world would be honest about the other's failure.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a source
 * the runner has broken returns a failed read rather than a value, because a
 * source that fails is the stimulus and the build has to be handed it.
 * Everything else is recorded and left for the assertion: a figure with no
 * citation, a stale value shown as current, a narrative with an invented
 * percentage, a report published before its time, a published report amended
 * in place. A world that quietly refused any of those would pass the build
 * the standard exists to catch.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that sends a report outside the
 * business, and no port that sets a threshold. Both stay with a person.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export type SourceKind = "ledger" | "job";

export interface Definition {
  id: string;
  measure: string;
  source: string;
  queryRef: string;
  period: "week" | "month";
  filters: string[];
  owner: string;
}

export interface Source {
  id: string;
  kind: SourceKind;
  /** By query ref, then by period. */
  values: Record<string, Record<string, number>>;
}

export interface ScheduleEntry {
  period: string;
  scheduledAt: string;
}

export interface Threshold {
  measure: string;
  direction: "up" | "down";
  amount: number;
  notify: string;
}

export interface Audience {
  id: string;
  name: string;
  measures: string[];
}

export type SourceRead =
  | { ok: true; value: number; asOf: string }
  | { ok: false; reason: string };

export interface Citation {
  id: string;
  measure: string;
  definitionId: string;
  source: string;
  asOf: string;
}

/** A figure as the build hands it to publish. Provenance comes from the citation. */
export interface FigureInput {
  measure: string;
  value: number | null;
  unavailableReason: string | null;
  /** The id `cite` returned. Absent means the figure carries no provenance. */
  cited?: string;
}

/** A figure as it sits on a published report. */
export interface Figure {
  reportId: string;
  measure: string;
  value: number | null;
  unavailableReason: string | null;
  definitionId: string | null;
  source: string | null;
  asOf: string | null;
}

export interface Report {
  id: string;
  period: string;
  scheduledAt: string | null;
  publishedAt: string;
  version: number;
  audienceId: string;
  publishedBy: string;
  figures: Figure[];
  narrative: string | null;
  status: "published" | "superseded";
  supersedes: string | null;
}

export interface Version {
  reportId: string;
  version: number;
  reason: string | null;
  by: string;
  at: string;
}

export interface Correction {
  id: string;
  reportId: string;
  period: string;
  audienceId: string;
  measure: string;
  value: number;
  person: string;
  reason: string;
}

export interface ReportPorts {
  now(): Date;
  /** The definitions register. Check 1 and 2. */
  readDefinitions(): Definition[];
  /** The schedule: which period publishes when. Check 4. */
  readSchedule(): ScheduleEntry[];
  /** The thresholds a person set. Check 7. */
  readThresholds(): Threshold[];
  /** The recipient groups and what each is declared for. Check 8. */
  readAudiences(): Audience[];
  /** Corrections a named person has asked for. Check 9. */
  readCorrections(): Correction[];
  /**
   * Read one query over one source for one period. Fails when the runner has
   * broken the source. The as-of time is the clock at the read. Check 3 and 5.
   */
  readSource(sourceId: string, queryRef: string, period: string): SourceRead;
  /** Every version of every view for a period. Check 7 and 10. */
  readReports(period: string): Report[];
  /** Attach provenance to a figure before it is published. Returns the citation id. */
  cite(c: { measure: string; definitionId: string; source: string; asOf: string }): string;
  /**
   * Publish a view. With `supersedes`, the new report takes the next version
   * number and the old one is marked superseded. `by` is the named person, or
   * absent for the schedule. Recorded as given: a version with no person and
   * no reason is written, and it is the assertion's job to fail it.
   */
  publishReport(input: {
    period: string;
    audienceId: string;
    figures: FigureInput[];
    narrative?: string;
    supersedes?: string;
    by?: string;
    reason?: string;
  }): Report;
  /** Edit a published report's figures in place. Recorded. Check 9 fails it. */
  amendReport(reportId: string, figures: FigureInput[]): void;
  /** A person approves a correction. Check 9. */
  approveCorrection(input: { reportId: string; person: string; reason: string }): { approved: boolean };
  notify(person: string, about: { measure: string; period: string; detail?: string }): void;
  escalate(reason: string, detail?: string): void;
}

export interface ReportWorldOptions {
  now?: Date;
  definitions?: Definition[];
  sources?: Source[];
  schedule?: ScheduleEntry[];
  thresholds?: Threshold[];
  audiences?: Audience[];
}

export class ReportWorld {
  readonly reports: Report[] = [];
  readonly versions: Version[] = [];
  readonly citations: Citation[] = [];
  readonly notifications: Array<{ person: string; measure: string; period: string; at: string }> = [];
  readonly escalations: Array<{ reason: string; detail?: string; at: string }> = [];
  readonly amendments: Array<{ reportId: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly definitions: Definition[];
  private readonly sources: Source[];
  private readonly schedule: ScheduleEntry[];
  private readonly thresholds: Threshold[];
  private readonly audiences: Audience[];
  private readonly broken = new Set<string>();
  private readonly corrections: Correction[] = [];
  private clock: Date;
  private seq = 0;

  constructor(opts: ReportWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.definitions = (opts.definitions ?? []).map((d) => ({ ...d, filters: [...d.filters] }));
    this.sources = (opts.sources ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      values: Object.fromEntries(Object.entries(s.values).map(([q, byPeriod]) => [q, { ...byPeriod }])),
    }));
    this.schedule = (opts.schedule ?? []).map((e) => ({ ...e }));
    this.thresholds = (opts.thresholds ?? []).map((t) => ({ ...t }));
    this.audiences = (opts.audiences ?? []).map((a) => ({ ...a, measures: [...a.measures] }));
  }

  /* Stimuli. The runner does these, never the build. */

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The source stops answering. Reads fail until `repairSource`. */
  breakSource(sourceId: string): void {
    this.broken.add(sourceId);
  }

  repairSource(sourceId: string): void {
    this.broken.delete(sourceId);
  }

  /** A named person asks for one figure on a published view to be corrected. */
  requestCorrection(input: { period: string; audienceId: string; measure: string; value: number; person: string; reason: string }): string {
    const current = this.reports.find((r) => r.period === input.period && r.audienceId === input.audienceId && r.status === "published");
    const id = `COR${++this.seq}`;
    this.corrections.push({
      id,
      reportId: current?.id ?? "",
      period: input.period,
      audienceId: input.audienceId,
      measure: input.measure,
      value: input.value,
      person: input.person,
      reason: input.reason,
    });
    return id;
  }

  /* Non-recording twins for the assertions. */

  published(period: string, audienceId?: string): Report[] {
    return this.reports
      .filter((r) => r.period === period && (!audienceId || r.audienceId === audienceId))
      .map((r) => this.copyReport(r));
  }

  current(period: string, audienceId: string): Report | undefined {
    const r = this.reports.find((x) => x.period === period && x.audienceId === audienceId && x.status === "published");
    return r ? this.copyReport(r) : undefined;
  }

  definition(id: string): Definition | undefined {
    return this.definitions.find((d) => d.id === id);
  }

  definitionsFor(measure: string): Definition[] {
    return this.definitions.filter((d) => d.measure === measure);
  }

  audience(id: string): Audience | undefined {
    return this.audiences.find((a) => a.id === id);
  }

  scheduled(period: string): ScheduleEntry | undefined {
    return this.schedule.find((e) => e.period === period);
  }

  versionsOf(reportId: string): Version[] {
    return this.versions.filter((v) => v.reportId === reportId);
  }

  /** Recorded reads of one query over one source for one period. */
  sourceReads(sourceId: string, queryRef: string, period: string): PortCall[] {
    return this.calls.filter((c) => {
      if (c.port !== "read_ledger" && c.port !== "read_job") return false;
      const req = c.request as { source?: string; queryRef?: string; period?: string };
      return req.source === sourceId && req.queryRef === queryRef && req.period === period;
    });
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  /**
   * Numbers in a narrative that the figure list does not carry. Empty for a
   * narrative that only describes. The period label is allowed, because a
   * sentence has to be able to say which week it is talking about.
   */
  inventedNumbers(report: Report): string[] {
    if (!report.narrative) return [];
    const text = report.narrative.split(report.period).join(" ");
    const tokens = text.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
    const carried = new Set(
      report.figures.filter((f) => f.value !== null).map((f) => String(f.value)),
    );
    return tokens.filter((t) => !carried.has(t.replace(/%$/, "").replace(/,/g, "")));
  }

  /* Internals. */

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

  private copyReport(r: Report): Report {
    return { ...r, figures: r.figures.map((f) => ({ ...f })) };
  }

  private figuresFrom(reportId: string, inputs: FigureInput[]): Figure[] {
    return inputs.map((f) => {
      const c = f.cited ? this.citations.find((x) => x.id === f.cited) : undefined;
      return {
        reportId,
        measure: f.measure,
        value: f.value,
        unavailableReason: f.unavailableReason,
        definitionId: c?.definitionId ?? null,
        source: c?.source ?? null,
        asOf: c?.asOf ?? null,
      };
    });
  }

  ports(): ReportPorts {
    return {
      now: () => new Date(this.clock),

      readDefinitions: () => {
        this.record("read_ledger", { register: "definitions" }, { count: this.definitions.length });
        return this.definitions.map((d) => ({ ...d, filters: [...d.filters] }));
      },

      readSchedule: () => {
        this.record("read_ledger", { register: "schedule" }, { periods: this.schedule.map((e) => e.period) });
        return this.schedule.map((e) => ({ ...e }));
      },

      readThresholds: () => {
        this.record("read_ledger", { register: "thresholds" }, { count: this.thresholds.length });
        return this.thresholds.map((t) => ({ ...t }));
      },

      readAudiences: () => {
        this.record("read_contacts", { audiences: true }, { ids: this.audiences.map((a) => a.id) });
        return this.audiences.map((a) => ({ ...a, measures: [...a.measures] }));
      },

      readCorrections: () => {
        this.record("read_ledger", { register: "corrections" }, { count: this.corrections.length });
        return this.corrections.map((c) => ({ ...c }));
      },

      readSource: (sourceId, queryRef, period) => {
        const src = this.sources.find((s) => s.id === sourceId);
        const port: Port = src?.kind === "job" ? "read_job" : "read_ledger";
        if (!src) {
          const out: SourceRead = { ok: false, reason: "no_such_source" };
          this.record(port, { source: sourceId, queryRef, period }, out);
          return out;
        }
        if (this.broken.has(sourceId)) {
          const out: SourceRead = { ok: false, reason: "source_unreachable" };
          this.record(port, { source: sourceId, queryRef, period }, out);
          return out;
        }
        const value = src.values[queryRef]?.[period];
        if (value === undefined) {
          const out: SourceRead = { ok: false, reason: "no_data_for_period" };
          this.record(port, { source: sourceId, queryRef, period }, out);
          return out;
        }
        const out: SourceRead = { ok: true, value, asOf: this.clock.toISOString() };
        this.record(port, { source: sourceId, queryRef, period }, out);
        return out;
      },

      readReports: (period) => {
        const rows = this.reports.filter((r) => r.period === period);
        this.record("read_ledger", { reports: period }, { ids: rows.map((r) => `${r.id}@v${r.version}`) });
        return rows.map((r) => this.copyReport(r));
      },

      cite: (c) => {
        const id = `CIT${++this.seq}`;
        this.citations.push({ id, ...c });
        this.record("cite", { measure: c.measure, definitionId: c.definitionId, source: c.source, asOf: c.asOf }, { id });
        return id;
      },

      publishReport: (input) => {
        const prior = input.supersedes ? this.reports.find((r) => r.id === input.supersedes) : undefined;
        if (prior) prior.status = "superseded";
        const id = `RPT${++this.seq}`;
        const at = this.clock.toISOString();
        const report: Report = {
          id,
          period: input.period,
          scheduledAt: this.schedule.find((e) => e.period === input.period)?.scheduledAt ?? null,
          publishedAt: at,
          version: prior ? prior.version + 1 : 1,
          audienceId: input.audienceId,
          publishedBy: input.by ?? "schedule",
          figures: this.figuresFrom(id, input.figures),
          narrative: input.narrative ?? null,
          status: "published",
          supersedes: prior?.id ?? null,
        };
        this.reports.push(report);
        this.versions.push({ reportId: id, version: report.version, reason: input.reason ?? null, by: report.publishedBy, at });
        this.record(
          "publish_report",
          {
            period: input.period,
            audienceId: input.audienceId,
            figures: report.figures.map((f) => ({ measure: f.measure, value: f.value, unavailable: f.unavailableReason, definition: f.definitionId, source: f.source, asOf: f.asOf })),
            narrative: report.narrative,
            supersedes: report.supersedes,
            by: input.by ?? null,
            reason: input.reason ?? null,
          },
          { id, version: report.version, publishedAt: at },
        );
        return this.copyReport(report);
      },

      amendReport: (reportId, figures) => {
        const r = this.reports.find((x) => x.id === reportId);
        if (r) r.figures = this.figuresFrom(r.id, figures);
        this.amendments.push({ reportId, at: this.clock.toISOString() });
        this.record("publish_report", { amend: reportId, figures: figures.length }, { ok: Boolean(r) });
      },

      approveCorrection: (input) => {
        this.record("gate", { correction: input.reportId, person: input.person, reason: input.reason }, { approved: true });
        return { approved: true };
      },

      notify: (person, about) => {
        this.notifications.push({ person, measure: about.measure, period: about.period, at: this.clock.toISOString() });
        this.record("notify", { person, ...about }, { ok: true });
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}), at: this.clock.toISOString() });
        this.record("escalate", { reason, detail: detail ?? null }, { ok: true });
      },
    };
  }
}

// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/exception-desk.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The exception-desk world: the job system and ledger that hold the records,
 * the routing table the business wrote, the one queue, and the raises that
 * arrive from every way of running a standard.
 *
 * RAISES ARRIVE AS EVENTS, as in the cash-seam and client-memory worlds. The
 * runner delivers a raise from Quote Out, a bot, a Front Desk call or a sheet,
 * and runs the build; `nextEvents` hands over only what has arrived since the
 * last read. Nothing a build holds between runs counts as a read of the queue.
 *
 * A PERSON'S CLOSE IS NOT THE BUILD'S. A close arrives as an event
 * (`deliver({ kind: "closed", ... })`), the way a person clicking Close on the
 * queue's own screen would, and the world applies it at once: the screen is
 * the person's, not the build's. There is no port that closes an item. A
 * write that tries to (a closed status or a close block) is refused, and the
 * assertions still read what the build ATTEMPTED (`raiseRequests`), because a
 * world that refuses a bad write would otherwise hide the build that tried it
 * (porting doc section 8).
 *
 * THE WORLD DOES NOT DEDUPLICATE. A raise with no id is a new row, whatever
 * else is open. Keeping one item per record and type is the build's job
 * (check 4), so the world must not do it for it.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The closed list (check 2). `other` is allowed and reported. */
export const EXCEPTION_TYPES = [
  "price_not_in_book",
  "variation",
  "unassignable",
  "parts_shortfall",
  "write_failed",
  "address_unresolved",
  "promise_broken",
  "dispute",
  "hardship",
  "stock_unknown",
  "needs_list_unknown",
  "unclassified_fault",
  "tech_unconfirmed",
  "other",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

/** Types no agent works: they go to a named person and stop every chase (check 6). */
export const PERSON_ONLY_TYPES: readonly ExceptionType[] = ["dispute", "hardship"];

/** The five ways of running a standard, and so the five places a raise can come from. */
export const SURFACES = ["office_voice", "bot", "workspace", "m365", "code"] as const;
export type Surface = (typeof SURFACES)[number];

/** Systems the world reads as a ledger rather than a job system. */
export const LEDGER_SYSTEMS = ["xero", "myob"] as const;

export interface RecordRef {
  /** servicem8, simpro, aroflo, fergus, xero, myob */
  system: string;
  /** The id that system issued. Never a name. */
  externalId: string;
}

export interface HeldRecord extends RecordRef {
  kind: "job" | "quote" | "invoice";
  customer: string;
}

export interface RaisedBy {
  standard: string;
  surface: Surface;
}

export interface RoutingRow {
  type: string;
  owner: string;
  clockHours: number;
  escalateTo?: string;
}

export interface Routing {
  rows: RoutingRow[];
  /** The local time the daily summary is due by, "07:00". */
  summaryAt: string;
  /** The business's offset from UTC. Brisbane is +600 all year. */
  utcOffsetMinutes: number;
}

export interface Closed {
  by: string;
  at: string;
  outcome: string;
}

export interface ExceptionItem {
  id: string;
  raisedBy: RaisedBy;
  type: string;
  record?: RecordRef;
  reason: string;
  evidenceUri?: string;
  owner: string;
  dueAt: string;
  raisedAt: string;
  lastRaisedAt: string;
  raiseCount: number;
  status: "open" | "closed";
  /** Set by a raising standard when the cause went away upstream. Not a close. */
  resolvedUpstream: boolean;
  /** Every chase standard reads this as a stop on the record (check 6). */
  stopChase: boolean;
  escalatedAt?: string;
  escalatedTo?: string;
  closed?: Closed;
}

/** What a build sends to `raise`. With an id it updates that open item. */
export interface ItemWrite {
  id?: string;
  raisedBy: RaisedBy;
  type: string;
  record?: RecordRef;
  reason: string;
  evidenceUri?: string;
  owner: string;
  dueAt: string;
  raiseCount?: number;
  resolvedUpstream?: boolean;
  stopChase?: boolean;
}

export type DeskEvent =
  | {
      kind: "raise";
      eventId: string;
      at: string;
      raisedBy: RaisedBy;
      /** As the raising standard sent it: may be off the list. */
      type: string;
      record?: RecordRef;
      reason: string;
      evidenceUri?: string;
      /** What the raising agent would like. The desk ignores both (check 3). */
      suggestedOwner?: string;
      suggestedDueAt?: string;
      /** What the raising agent would do next. Never the desk's to do (check 6). */
      suggestedAction?: { to: string; text: string };
    }
  | { kind: "resolved_upstream"; eventId: string; at: string; raisedBy: RaisedBy; type: string; record: RecordRef; reason: string }
  | { kind: "closed"; eventId: string; at: string; itemId: string; by: string; outcome: string };

/** An event as the runner delivers it: the world stamps the time unless one is given. */
export type Arriving = DeskEvent extends infer E ? (E extends unknown ? Omit<E, "at"> & { at?: string } : never) : never;

export interface Summary {
  at: string;
  /** The business's local date, 2026-11-02. */
  day: string;
  byType: Record<string, number>;
  byOwner: Record<string, number>;
  /** Ids of open items past their due time. */
  overdue: string[];
  /** The labels that arrived as `other`, so a recurring one becomes a type. */
  otherLabels: string[];
  /** True when nothing is open. The summary still goes. */
  none: boolean;
  text: string;
}

export interface ExceptionDeskPorts {
  now(): Date;
  /** Raises, upstream resolutions and closes that arrived since the last read. */
  nextEvents(): DeskEvent[];
  /** The record from the system that holds it, or null if it does not. */
  readRecord(ref: RecordRef): HeldRecord | null;
  /** The routing table the business wrote. */
  readRouting(): Routing;
  /** Every open item in the queue. */
  listOpen(): ExceptionItem[];
  /** Write an item, or with an id update that open item. There is no close. */
  raise(input: ItemWrite): { ok: boolean; id?: string; why?: string };
  /** Send a raise back to the standard that raised it. Nothing is written. */
  sendBack(eventId: string, standard: string, why: string): void;
  /** Tell a person something. */
  tell(to: string, text: string): void;
  /** Escalate an overdue item to the person the routing table names. */
  escalate(itemId: string, to: string, detail: string): void;
  /** Summaries already published, newest last. */
  summaries(): Summary[];
  publishSummary(summary: Summary): void;
}

export interface ExceptionDeskWorldOptions {
  now?: Date;
  records?: HeldRecord[];
  routing?: Partial<Routing> & { rows: RoutingRow[] };
  /** Items already in the queue before the run. */
  items?: ExceptionItem[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const sameRecord = (a: RecordRef | undefined, b: RecordRef | undefined): boolean =>
  !!a && !!b && a.system === b.system && a.externalId === b.externalId;

export class ExceptionDeskWorld {
  readonly items: ExceptionItem[];
  readonly summariesPublished: Summary[] = [];
  /** Every write exactly as the build sent it, extra fields and all, allowed or not. */
  readonly raiseRequests: Array<Record<string, unknown> & { ok: boolean }> = [];
  readonly sentBack: Array<{ eventId: string; standard: string; why: string }> = [];
  readonly told: Array<{ to: string; text: string; at: string }> = [];
  readonly escalations: Array<{ itemId: string; to: string; detail: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly records: HeldRecord[];
  private readonly routing: Routing;
  private readonly delivered: DeskEvent[] = [];
  private readCursor = 0;
  private clock: Date;
  private seq = 0;

  constructor(opts: ExceptionDeskWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-02T00:00:00.000Z"); // Monday 10am Brisbane
    this.records = (opts.records ?? []).map((r) => ({ ...r }));
    this.routing = {
      summaryAt: "07:00",
      utcOffsetMinutes: 600,
      ...clone(opts.routing ?? { rows: [] }),
    };
    this.items = clone(opts.items ?? []);
  }

  // ---- the runner, between runs --------------------------------------------

  /** An event arrives. A close is applied at once: it is a person on the queue's own screen. */
  deliver(event: Arriving): void {
    const e = { ...event, at: event.at ?? this.clock.toISOString() } as DeskEvent;
    this.delivered.push(e);
    if (e.kind === "closed") {
      const item = this.item(e.itemId);
      if (item && item.status === "open") {
        item.status = "closed";
        item.closed = { by: e.by, at: e.at, outcome: e.outcome };
      }
    }
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  item(id: string): ExceptionItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  storedOpen(): ExceptionItem[] {
    return this.items.filter((i) => i.status === "open");
  }

  itemsOn(ref: RecordRef, type?: string): ExceptionItem[] {
    return this.items.filter((i) => sameRecord(i.record, ref) && (type === undefined || i.type === type));
  }

  /** What every chase standard reads before it acts on a record: held while a stop is open on it. */
  chaseHeld(ref: RecordRef): boolean {
    return this.items.some((i) => i.status === "open" && i.stopChase && sameRecord(i.record, ref));
  }

  routingFor(type: string): RoutingRow | undefined {
    return this.routing.rows.find((r) => r.type === type);
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): ExceptionDeskPorts {
    return {
      now: () => new Date(this.clock),

      nextEvents: () => {
        const out = clone(this.delivered.slice(this.readCursor));
        this.readCursor = this.delivered.length;
        this.record("read_inbox", { events: true }, { count: out.length, kinds: out.map((e) => e.kind) });
        return out;
      },

      readRecord: (ref) => {
        const held = this.records.find((r) => sameRecord(r, ref)) ?? null;
        const port: Port = (LEDGER_SYSTEMS as readonly string[]).includes(ref.system) ? "read_ledger" : "read_job";
        this.record(port, { system: ref.system, externalId: ref.externalId }, held ? { found: true, kind: held.kind } : { found: false });
        return held ? { ...held } : null;
      },

      readRouting: () => {
        this.record("read_rule", { routing: true }, { rows: this.routing.rows.length, summaryAt: this.routing.summaryAt });
        return clone(this.routing);
      },

      listOpen: () => {
        const out = clone(this.storedOpen());
        this.record("list_exceptions", { status: "open" }, { count: out.length, ids: out.map((i) => i.id) });
        return out;
      },

      raise: (input) => {
        const sent = clone(input as unknown as Record<string, unknown>);
        const closing = sent.status === "closed" || sent.closed !== undefined;
        if (closing) {
          const why = "the desk cannot close an item: only a person closes, on the queue's own screen";
          this.raiseRequests.push({ ...sent, ok: false });
          this.record("raise_exception", sent, { ok: false, why });
          return { ok: false, why };
        }
        if (input.id) {
          const target = this.item(input.id);
          if (!target || target.status !== "open") {
            const why = target ? "that item is closed; a new raise opens a new item" : "no such item";
            this.raiseRequests.push({ ...sent, ok: false });
            this.record("raise_exception", sent, { ok: false, why });
            return { ok: false, why };
          }
          target.raisedBy = { ...input.raisedBy };
          target.type = input.type;
          target.record = input.record ? { ...input.record } : undefined;
          target.reason = input.reason;
          if (input.evidenceUri !== undefined) target.evidenceUri = input.evidenceUri;
          target.owner = input.owner;
          target.dueAt = input.dueAt;
          target.lastRaisedAt = this.stamp();
          target.raiseCount = input.raiseCount ?? target.raiseCount + 1;
          target.resolvedUpstream = input.resolvedUpstream ?? target.resolvedUpstream;
          target.stopChase = input.stopChase ?? target.stopChase;
          this.raiseRequests.push({ ...sent, ok: true });
          this.record("raise_exception", sent, { ok: true, id: target.id, updated: true });
          return { ok: true, id: target.id };
        }
        const item: ExceptionItem = {
          id: `X-${++this.seq}`,
          raisedBy: { ...input.raisedBy },
          type: input.type,
          record: input.record ? { ...input.record } : undefined,
          reason: input.reason,
          evidenceUri: input.evidenceUri,
          owner: input.owner,
          dueAt: input.dueAt,
          raisedAt: this.stamp(),
          lastRaisedAt: this.stamp(),
          raiseCount: input.raiseCount ?? 1,
          status: "open",
          resolvedUpstream: input.resolvedUpstream ?? false,
          stopChase: input.stopChase ?? false,
        };
        this.items.push(item);
        this.raiseRequests.push({ ...sent, ok: true });
        this.record("raise_exception", sent, { ok: true, id: item.id });
        return { ok: true, id: item.id };
      },

      sendBack: (eventId, standard, why) => {
        this.sentBack.push({ eventId, standard, why });
        this.record("notify", { to: standard, eventId, why }, { ok: true });
      },

      tell: (to, text) => {
        this.told.push({ to, text, at: this.stamp() });
        this.record("notify", { to, text }, { ok: true });
      },

      escalate: (itemId, to, detail) => {
        this.escalations.push({ itemId, to, detail, at: this.stamp() });
        const item = this.item(itemId);
        if (item && item.status === "open" && !item.escalatedAt) {
          item.escalatedAt = this.stamp();
          item.escalatedTo = to;
        }
        this.record("escalate", { itemId, to, detail }, { ok: true });
      },

      summaries: () => {
        const out = clone(this.summariesPublished);
        this.record("read_inbox", { summaries: true }, { count: out.length });
        return out;
      },

      publishSummary: (summary) => {
        this.summariesPublished.push({ ...clone(summary), at: this.stamp() });
        this.record("publish_report", { day: summary.day, none: summary.none, open: Object.values(summary.byType).reduce((a, b) => a + b, 0) }, { published: true });
      },
    };
  }
}

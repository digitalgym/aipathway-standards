// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/rules-and-holds.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The rules-and-holds world: one rules document the business writes, the
 * actions bots have come due to take, the holds a person releases or refuses,
 * and everything that went out.
 *
 * THE RULES ARE THE BUSINESS'S, NEVER THE BUILD'S. The document has the shape
 * of the mesh contract's `rules.schema.json` (aipathway-standards, rules 1.0):
 * `holds`, `lists.do_not_contact`, `contact_hours`, `stage_holders` and
 * `money.nodes_may_move_money`, fixed false. The runner changes it between
 * runs with `setRules`, playing the owner. A build reads it through
 * `readRules()` (`read_rule` on the trace), and check 1 asks that it does so
 * every run rather than keeping a copy.
 *
 * WORK ARRIVES AS ITEMS ON THE RECORD, NOT AS A CHAT. Each item is an action a
 * step has come due to take (`invoice.sent` for an invoice, a chase, a call, a
 * payment), on a record by ref, for a customer by ref, at a stage named by its
 * standard. `listDue()` reads the open and held ones, the way a node woken by
 * `schedule.tick` lists records by status. An item a build leaves alone stays
 * open, so a send outside contact hours is simply taken on a later run.
 *
 * A RELEASE IS NOT A BUILD'S TO GIVE, as in the customer-link world. A
 * person's decision arrives as an event (`deliver({ kind: "decision" })`), and
 * `decide()` refuses one that never arrived, or one by someone off the rule's
 * `release_by` list. The assertions read what the build ATTEMPTED (`actions`,
 * `holdRequests`, `decideAttempts`), because a world that quietly refused a bad
 * action would hide the build that tried it.
 *
 * MONEY. `act()` on an item of kind `pay` is recorded as `release_payment`. A
 * conforming build never calls it. The world takes the action anyway, so a
 * build that pays is caught paying.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** How an action reaches anyone. `pay` moves money and is never a node's. */
export const ACTION_KINDS = ["email", "sms", "call", "pay"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** The kinds that reach a customer, so the do-not-contact list and contact hours apply. */
export const CONTACT_KINDS: readonly ActionKind[] = ["email", "sms", "call"];

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Day = (typeof DAYS)[number];

export interface HoldRule {
  /** The vocabulary event the node would emit, e.g. invoice.sent. */
  action: string;
  /** Hold only above this amount. Absent means always hold. */
  over_amount?: number;
  /** person:<id>, one or more. */
  release_by: string[];
}

export interface ContactHours {
  timezone: string;
  /** HH:MM, local to `timezone`. */
  start: string;
  end: string;
  days?: Day[];
}

/** The business rules document, in the shape of the mesh contract's rules.schema.json. */
export interface Rules {
  rules_version: string;
  updated_at: string;
  /** person:<id>. Only a person changes the rules. */
  updated_by: string;
  holds: HoldRule[];
  lists: { do_not_contact: string[] };
  contact_hours: ContactHours;
  /** Standard slug -> node:<slug>. One node per stage. */
  stage_holders: Record<string, string>;
  money: { nodes_may_move_money: false };
}

export type ItemStatus = "open" | "held" | "done" | "refused" | "stopped";

export interface DueItem {
  /** The event that woke it. Also the dedupe key's middle. */
  id: string;
  /** The standard this step belongs to, e.g. invoice-out. */
  stage: string;
  /** The vocabulary event the node would emit. */
  action: string;
  kind: ActionKind;
  /** The record, <system>:<id>. */
  ref: string;
  /** The customer, <system>:<id>. */
  customer: string;
  amount?: number;
  status: ItemStatus;
  holdId?: string;
}

export type HoldStatus = "requested" | "released" | "refused";

export interface Hold {
  /** <system>:<id>, e.g. exception-desk:H-1. */
  hold_id: string;
  itemId: string;
  action: string;
  ref: string;
  customer: string;
  amount?: number;
  /** Which rule asked for it, e.g. "invoice.sent over 5000". */
  rule: string;
  requestedAt: string;
  requestedBy: string;
  status: HoldStatus;
  decidedAt?: string;
  decidedBy?: string;
  /** When the one action it allowed was taken. A release is used once. */
  usedAt?: string;
}

export type Decision = "release" | "refuse";

export type HoldEvent = { kind: "decision"; eventId: string; at: string; decisionId: string; holdId: string; decision: Decision; by: string };

export type Arriving = Omit<HoldEvent, "at"> & { at?: string };

export interface DecisionRef {
  decisionId: string;
  decision: Decision;
  by: string;
  at: string;
}

export interface HoldRequestInput {
  itemId: string;
  action: string;
  ref: string;
  customer: string;
  amount?: number;
  rule: string;
  requestedBy: string;
}

export interface ActInput {
  itemId: string;
  /** The node taking it. */
  by: string;
  /** The released hold this action was waiting on, if it was held. */
  holdId?: string;
}

export interface Action {
  itemId: string;
  action: string;
  kind: ActionKind;
  ref: string;
  customer: string;
  amount?: number;
  by: string;
  holdId?: string;
  at: string;
}

export type ExceptionReason = "do_not_contact" | "nodes_may_not_move_money" | "unauthorised_releaser" | "unknown_hold" | "unknown_item";

export interface RulesHoldsPorts {
  now(): Date;
  /** Decisions people made since the last read. */
  nextEvents(): HoldEvent[];
  /** The one rules document, as it stands now. */
  readRules(): Rules;
  /** Every item still open or held, by status, the way a schedule.tick lists records. */
  listDue(): DueItem[];
  readHold(holdId: string): Hold | null;
  /** Raise hold.requested. The item waits on the hold. */
  requestHold(input: HoldRequestInput): { hold_id: string };
  /** Record a person's release or refusal. Refused without a matching decision by someone on the rule's release_by list. */
  decide(holdId: string, decision: DecisionRef): { ok: boolean; why?: string };
  /** Take the action: a send or a call to the customer, or (never, for a conforming build) a payment. */
  act(input: ActInput): Action;
  /** Stop an item and tell a person why. */
  raise(input: { ref: string; itemId?: string; reason: ExceptionReason; detail: string }): void;
}

export interface RulesHoldsWorldOptions {
  now?: Date;
  rules: Rules;
  items?: DueItem[];
  holds?: Hold[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** The day and minute of the day at `at`, in `timezone`. */
export function localTime(at: Date, timezone: string): { day: Day; minute: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as Day;
  return { day, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** True if `at` falls inside the business's contact hours, read in its own timezone. */
export function withinHours(hours: ContactHours, at: Date): boolean {
  const { day, minute } = localTime(at, hours.timezone);
  if (hours.days && !hours.days.includes(day)) return false;
  return minute >= minutes(hours.start) && minute < minutes(hours.end);
}

/** The rule for an action, or null. An action with no rule is held. */
export function ruleFor(rules: Rules, action: string): HoldRule | null {
  return rules.holds.find((h) => h.action === action) ?? null;
}

/** How a hold names the rule that asked for it. */
export function ruleLabel(action: string, rule: HoldRule | null): string {
  if (!rule) return `no rule for ${action}`;
  return rule.over_amount === undefined ? action : `${action} over ${rule.over_amount}`;
}

export class RulesHoldsWorld {
  readonly items: DueItem[];
  readonly holds: Hold[];
  readonly actions: Action[] = [];
  readonly holdRequests: Array<Record<string, unknown>> = [];
  readonly decideAttempts: Array<{ holdId: string; decision: DecisionRef; ok: boolean; why?: string }> = [];
  readonly exceptions: Array<{ ref: string; itemId?: string; reason: ExceptionReason; detail: string }> = [];
  readonly calls: PortCall[] = [];
  /** The call index at which the owner last changed the rules, or -1. */
  rulesChangedAt = -1;

  private rules: Rules;
  private readonly delivered: HoldEvent[] = [];
  private readCursor = 0;
  private clock: Date;
  private seq = 0;

  constructor(opts: RulesHoldsWorldOptions) {
    this.clock = opts.now ?? new Date("2026-11-23T00:00:00.000Z"); // Monday 10am Brisbane
    this.rules = RulesHoldsWorld.fixMoney(opts.rules);
    this.items = clone(opts.items ?? []);
    this.holds = clone(opts.holds ?? []);
    this.seq = this.holds.length;
  }

  /** The schema fixes nodes_may_move_money at false; a document that says otherwise is read as false. */
  private static fixMoney(rules: Rules): Rules {
    const r = clone(rules);
    r.money = { nodes_may_move_money: false };
    return r;
  }

  // ---- the runner, between runs --------------------------------------------

  deliver(event: Arriving): void {
    this.delivered.push({ ...event, at: event.at ?? this.clock.toISOString() });
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The owner changes the rules. Takes effect for whoever reads them next. */
  setRules(next: Rules): void {
    this.rules = RulesHoldsWorld.fixMoney(next);
    this.rulesChangedAt = this.calls.length;
  }

  /** A step comes due. */
  addItem(item: Omit<DueItem, "status"> & { status?: ItemStatus }): void {
    this.items.push({ status: "open", ...clone(item) });
  }

  // ---- reads for assertions, never recorded --------------------------------

  item(id: string): DueItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  hold(id: string): Hold | undefined {
    return this.holds.find((h) => h.hold_id === id);
  }

  holdsFor(itemId: string): Hold[] {
    return this.holds.filter((h) => h.itemId === itemId);
  }

  actionsFor(itemId: string): Action[] {
    return this.actions.filter((a) => a.itemId === itemId);
  }

  decision(decisionId: string): HoldEvent | undefined {
    return this.delivered.find((e) => e.decisionId === decisionId);
  }

  currentRules(): Rules {
    return clone(this.rules);
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  ports(): RulesHoldsPorts {
    return {
      now: () => new Date(this.clock),

      nextEvents: () => {
        const out = clone(this.delivered.slice(this.readCursor));
        this.readCursor = this.delivered.length;
        this.record("read_inbox", { events: true }, { count: out.length, kinds: out.map((e) => e.kind) });
        return out;
      },

      readRules: () => {
        const out = clone(this.rules);
        this.record("read_rule", { rules: true }, { rules_version: out.rules_version, updated_at: out.updated_at });
        return out;
      },

      listDue: () => {
        const out = clone(this.items.filter((i) => i.status === "open" || i.status === "held"));
        this.record("read_job", { due: true }, { ids: out.map((i) => i.id) });
        return out;
      },

      readHold: (holdId) => {
        const h = this.hold(holdId) ?? null;
        this.record("read_hold", { hold_id: holdId }, h ? { status: h.status, used: Boolean(h.usedAt) } : { found: false });
        return h ? clone(h) : null;
      },

      requestHold: (input) => {
        this.holdRequests.push(clone(input as unknown as Record<string, unknown>));
        const hold: Hold = {
          hold_id: `exception-desk:H-${++this.seq}`,
          itemId: input.itemId,
          action: input.action,
          ref: input.ref,
          customer: input.customer,
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          rule: input.rule,
          requestedAt: this.stamp(),
          requestedBy: input.requestedBy,
          // Whatever the build asked for, a new hold is requested.
          status: "requested",
        };
        this.holds.push(hold);
        const item = this.item(input.itemId);
        if (item && item.status === "open") {
          item.status = "held";
          item.holdId = hold.hold_id;
        }
        this.record("request_hold", clone(input), { hold_id: hold.hold_id, status: "requested" });
        return { hold_id: hold.hold_id };
      },

      decide: (holdId, decision) => {
        const target = this.hold(holdId);
        const made = this.decision(decision.decisionId);
        const rule = target ? ruleFor(this.rules, target.action) : null;
        let why: string | undefined;
        if (!target) why = "no such hold";
        else if (!made) why = "no decision with that id reached the holds list";
        else if (made.holdId !== holdId) why = "that decision was about a different hold";
        else if (made.by !== decision.by || made.decision !== decision.decision) why = "the record does not match the decision";
        else if (!made.by.startsWith("person:")) why = "only a person releases or refuses";
        else if (!rule) why = `no rule names who releases ${target.action}`;
        else if (!rule.release_by.includes(made.by)) why = "not on that rule's release_by list";
        else if (target.status !== "requested") why = `already ${target.status}`;
        const ok = why === undefined;
        this.decideAttempts.push({ holdId, decision: { ...decision }, ok, why });
        if (!ok) {
          this.record("gate", { hold_id: holdId, ...decision }, { ok: false, why });
          return { ok: false, why };
        }
        const t = target!;
        const m = made!;
        t.status = m.decision === "release" ? "released" : "refused";
        t.decidedAt = m.at;
        t.decidedBy = m.by;
        if (t.status === "refused") {
          const item = this.item(t.itemId);
          if (item) item.status = "refused";
        }
        this.record("gate", { hold_id: holdId, ...decision }, { ok: true, status: t.status });
        return { ok: true };
      },

      act: ({ itemId, by, holdId }) => {
        const item = this.item(itemId);
        const at = this.stamp();
        const a: Action = {
          itemId,
          action: item?.action ?? "unknown",
          kind: item?.kind ?? "email",
          ref: item?.ref ?? "unknown:unknown",
          customer: item?.customer ?? "unknown:unknown",
          ...(item?.amount !== undefined ? { amount: item.amount } : {}),
          by,
          ...(holdId ? { holdId } : {}),
          at,
        };
        this.actions.push(a);
        if (item) item.status = "done";
        if (holdId) {
          const h = this.hold(holdId);
          if (h && !h.usedAt) h.usedAt = at;
        }
        const port: Port = a.kind === "pay" ? "release_payment" : "send_message";
        this.record(port, { itemId, action: a.action, kind: a.kind, ref: a.ref, customer: a.customer, holdId: holdId ?? null }, { ok: Boolean(item) });
        return { ...a };
      },

      raise: ({ ref, itemId, reason, detail }) => {
        this.exceptions.push({ ref, ...(itemId ? { itemId } : {}), reason, detail });
        const item = itemId ? this.item(itemId) : undefined;
        if (item && (item.status === "open" || item.status === "held")) item.status = "stopped";
        this.record("escalate", { ref, itemId: itemId ?? null, reason, detail }, { ok: true });
      },
    };
  }
}

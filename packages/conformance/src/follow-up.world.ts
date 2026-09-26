// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/follow-up.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The follow-up world: a register of things owed to the business that are not
 * money, a consent table, a written cadence, and a line the build can dial.
 *
 * WHY IT IS NOT THE DEBTOR WORLD. Debtor Chasing holds a ledger, and the thing
 * that stops a chase there is a payment landing in it. Here nothing is paid.
 * The chase stops because a document came back, a decision was given, or a
 * person said no, and none of those is a ledger read. The ranking rule is the
 * same on purpose; the stop is different on purpose.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. Nothing is enforced. The gate
 * answers honestly from the register and the cadence, and a build may ignore
 * it: a text past the cap, a call to a contact who said stop, a reminder the
 * day after the document arrived all go through and are recorded as touches.
 * The assertion judges the touches. A world that refused them would pass the
 * exact builds this standard exists to catch.
 *
 * WHAT THE STUB LINE IS. `listen` hands back the reply the runner seeded with
 * `reply(id, text)` and the world's own reading of it (a date, a decision, a
 * no, a dispute, a stop). That reading is the stub standing in for speech
 * understanding, which is why check 5 is `both` and the pass test is live.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that offers a discount, argues a
 * no, or drops an item. A build cannot do those through the ports because the
 * ports do not exist.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const ITEM_KINDS = ["quote_decision", "signed_variation", "certificate", "po_number", "form"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const CHANNELS = ["sms", "email", "call"] as const;
export type Channel = (typeof CHANNELS)[number];

export type ItemStatus = "open" | "arrived" | "declined" | "escalated";

export interface OpenItem {
  id: string;
  /** "unknown" is what a typed note looks like. Check 1 refuses to chase it. */
  kind: ItemKind | "unknown";
  recordRef: string | null;
  /** The contact who owes it. */
  owedBy: string;
  /** Dollars on the record this item holds up. */
  valueAtRisk: number;
  openedAt: string;
  due: string | null;
  status: ItemStatus;
  /** Set when the business owes the contact something first. Check 9. */
  weOwe?: string;
  /** The document or number came back. Set by the runner, filed by the build. Check 7. */
  received?: { ref: string; at: string };
}

export interface Contact {
  id: string;
  name: string;
}

export interface Consent {
  contactId: string;
  channel: Channel;
}

export interface Cadence {
  kind: ItemKind | "default";
  maxTouches: number;
  spacingHours: number;
  /** Preferred channels in order. The build picks the first the contact consented to. */
  channels: Channel[];
  /** The named person an item goes to at the cap or on a no. */
  escalateTo: string;
}

export interface Touch {
  itemId: string;
  channel: Channel;
  at: string;
  /** "sent" for a message; the outcome kind for a call once one is recorded. */
  outcome: "sent" | OutcomeKind | "no_outcome";
}

export type OutcomeKind = "date" | "decision" | "declined" | "dispute";

export interface Outcome {
  id: string;
  itemId: string;
  kind: OutcomeKind;
  value: string;
  recordedAt: string;
}

export interface Arrival {
  itemId: string;
  evidenceRef: string;
  at: string;
}

export interface Escalation {
  itemId: string;
  reason: "declined" | "dispute" | "cap_reached";
  to: string;
  history: Touch[];
  at: string;
}

export interface GateDecision {
  allowed: boolean;
  reason?:
    | "arrived"
    | "declined"
    | "escalated"
    | "we_owe_them"
    | "cap_reached"
    | "too_soon"
    | "no_consent"
    | "outside_hours";
}

export interface Reply {
  text: string;
  heard: "date" | "decision" | "declined" | "dispute" | "stop" | "silence";
  value?: string;
}

export interface ItemRecord {
  item: OpenItem | null;
  touches: Touch[];
  outcomes: Outcome[];
  escalations: Escalation[];
  arrival: Arrival | null;
}

export interface FollowUpPorts {
  now(): Date;
  /** The register of open items, as the record has them right now. */
  readItems(): OpenItem[];
  /** Everything known about the item so far. Check 11. */
  readRecord(itemId: string): ItemRecord;
  /** The cadence written for a kind, or the default. */
  readCadence(kind: ItemKind | "unknown"): Cadence;
  readContacts(): Contact[];
  readConsents(): Consent[];
  /** Submit the chase order. Ordering only: this permits nothing. */
  rank(entries: Array<{ itemId: string; valueAtRisk: number; daysOpen: number }>): void;
  /** May this item be touched on this channel right now? Answered, never enforced. */
  gate(itemId: string, channel: Channel): GateDecision;
  /**
   * A text or an email. Recorded under the SMS port because there is no
   * separate email port; the channel is on the request. Recorded whether or
   * not consent exists, which is what check 4 reads.
   */
  sendMessage(itemId: string, channel: "sms" | "email", text: string): void;
  /** The disclosure on a call. Opens the call if nothing has been said yet. */
  disclose(itemId: string, text: string): void;
  /** A turn spoken on the call. Opens the call if nothing has been said yet. */
  say(itemId: string, text: string): void;
  /** The contact's reply, as seeded by the runner. */
  listen(itemId: string): Reply;
  /** The answer, as an object. Check 6. */
  recordOutcome(itemId: string, outcome: { kind: OutcomeKind; value: string }): Outcome;
  /** File the arrival against the item. Ends the chase. Check 7. */
  attachEvidence(itemId: string, ref: string): void;
  escalate(itemId: string, reason: Escalation["reason"], to: string, history?: Touch[]): void;
  notify(person: string, text: string): void;
}

export interface FollowUpWorldOptions {
  now?: Date;
  items?: OpenItem[];
  contacts?: Contact[];
  consents?: Consent[];
  cadences?: Cadence[];
  /** Local hours a call is permitted, inclusive start, exclusive end. Brisbane. */
  callingHours?: { from: number; to: number };
}

const DEFAULT_CADENCE: Cadence = {
  kind: "default",
  maxTouches: 3,
  spacingHours: 48,
  channels: ["sms", "call", "email"],
  escalateTo: "the office manager",
};

export class FollowUpWorld {
  readonly touches: Touch[] = [];
  readonly outcomes: Outcome[] = [];
  readonly arrivals: Arrival[] = [];
  readonly escalations: Escalation[] = [];
  readonly alerts: Array<{ person: string; text: string; at: string }> = [];
  readonly runs: Array<Array<{ itemId: string; valueAtRisk: number; daysOpen: number }>> = [];
  readonly gateDecisions: Array<{ itemId: string; channel: Channel; decision: GateDecision; at: string }> = [];
  readonly turns: Array<{ itemId: string; who: "agent" | "contact"; text: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly items: OpenItem[];
  private readonly contacts: Contact[];
  private readonly consents: Consent[];
  private readonly cadences: Cadence[];
  private readonly hours: { from: number; to: number };
  private readonly replies = new Map<string, string>();
  private readonly openCalls = new Set<string>();
  private clock: Date;
  private seq = 0;

  constructor(opts: FollowUpWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z"); // 10am Brisbane
    this.items = (opts.items ?? []).map((i) => ({ ...i }));
    this.contacts = (opts.contacts ?? []).map((c) => ({ ...c }));
    this.consents = (opts.consents ?? []).map((c) => ({ ...c }));
    this.cadences = (opts.cadences ?? []).map((c) => ({ ...c, channels: [...c.channels] }));
    this.hours = opts.callingHours ?? { from: 8, to: 19 };
  }

  /** The runner moves time. A build never does. Moving it ends any open call. */
  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
    this.openCalls.clear();
  }

  /** The document, the number or the decision came back. Runner only. Check 7. */
  arrive(itemId: string, ref?: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (item) item.received = { ref: ref ?? `doc:${itemId}-returned`, at: this.clock.toISOString() };
  }

  /** What the contact will say on the next call about this item. Runner only. */
  reply(itemId: string, text: string): void {
    this.replies.set(itemId, text);
  }

  /** Non-recording twins for the assertions. */
  item(id: string): OpenItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  allItems(): OpenItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  touchesFor(itemId: string): Touch[] {
    return this.touches.filter((t) => t.itemId === itemId);
  }

  outcomesFor(itemId: string): Outcome[] {
    return this.outcomes.filter((o) => o.itemId === itemId);
  }

  arrivalFor(itemId: string): Arrival | null {
    return this.arrivals.find((a) => a.itemId === itemId) ?? null;
  }

  escalationsFor(itemId: string): Escalation[] {
    return this.escalations.filter((e) => e.itemId === itemId);
  }

  hasConsent(contactId: string, channel: Channel): boolean {
    return this.consents.some((c) => c.contactId === contactId && c.channel === channel);
  }

  cadenceFor(kind: ItemKind | "unknown"): Cadence {
    return this.cadences.find((c) => c.kind === kind) ?? this.cadences.find((c) => c.kind === "default") ?? DEFAULT_CADENCE;
  }

  /** Check 1's four fields. */
  wellFormed(item: OpenItem): boolean {
    return (ITEM_KINDS as readonly string[]).includes(item.kind) && Boolean(item.recordRef) && Boolean(item.owedBy) && Boolean(item.due);
  }

  recordFor(itemId: string): ItemRecord {
    const item = this.items.find((i) => i.id === itemId) ?? null;
    return {
      item: item ? { ...item } : null,
      touches: this.touchesFor(itemId).map((t) => ({ ...t })),
      outcomes: this.outcomesFor(itemId).map((o) => ({ ...o })),
      escalations: this.escalationsFor(itemId).map((e) => ({ ...e, history: e.history.map((t) => ({ ...t })) })),
      arrival: this.arrivalFor(itemId),
    };
  }

  get lastRun(): Array<{ itemId: string; valueAtRisk: number; daysOpen: number }> {
    return this.runs[this.runs.length - 1] ?? [];
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  private localHour(): number {
    // Brisbane only, as an offset: the standards ship as a copied file and a
    // tz library would follow them into the published package.
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

  /** The first word on a call opens it and is the touch. Check 5 reads which port that was. */
  private openCall(itemId: string): void {
    if (this.openCalls.has(itemId)) return;
    this.openCalls.add(itemId);
    this.touches.push({ itemId, channel: "call", at: this.clock.toISOString(), outcome: "no_outcome" });
  }

  private hear(itemId: string): Reply {
    const text = this.replies.get(itemId) ?? "Should have it back to you in a few days";
    const lower = text.toLowerCase();
    if (/\bstop\b/.test(lower)) return { text, heard: "stop" };
    if (/dispute|never agreed|not paying|didn't ask/.test(lower)) return { text, heard: "dispute" };
    if (/^\s*no\b/.test(lower) || /\bnot going ahead\b/.test(lower)) return { text, heard: "declined" };
    const iso = text.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) return { text, heard: "date", value: iso[0] };
    if (/approved|go ahead|signed|yes\b/.test(lower)) return { text, heard: "decision", value: "approved" };
    if (/few days|next week|friday|monday/.test(lower)) {
      const soon = new Date(this.clock.getTime() + 6 * 24 * 3600_000);
      return { text, heard: "date", value: soon.toISOString().slice(0, 10) };
    }
    return { text, heard: "silence" };
  }

  /** Hand this to the build. It is the only door. */
  ports(): FollowUpPorts {
    return {
      now: () => new Date(this.clock),

      readItems: () => {
        const rows = this.items.map((i) => ({ ...i, ...(i.received ? { received: { ...i.received } } : {}) }));
        this.record("read_job", { items: true }, { count: rows.length, open: rows.filter((i) => i.status === "open").map((i) => i.id) });
        return rows;
      },

      readRecord: (itemId) => {
        const rec = this.recordFor(itemId);
        this.record("read_job", { record: itemId }, { touches: rec.touches.length, outcomes: rec.outcomes.length, arrived: Boolean(rec.arrival) });
        return rec;
      },

      readCadence: (kind) => {
        const c = this.cadenceFor(kind);
        this.record("read_job", { cadence: kind }, { maxTouches: c.maxTouches, spacingHours: c.spacingHours, channels: c.channels });
        return { ...c, channels: [...c.channels] };
      },

      readContacts: () => {
        const rows = this.contacts.map((c) => ({ ...c }));
        this.record("read_contacts", { contacts: true }, { rows: rows.length });
        return rows;
      },

      readConsents: () => {
        const rows = this.consents.map((c) => ({ ...c }));
        this.record("read_contacts", { consents: true }, { rows: rows.length });
        return rows;
      },

      rank: (entries) => {
        this.runs.push(entries.map((e) => ({ ...e })));
        this.record("rank", { entries: entries.length }, { order: entries.map((e) => e.itemId) });
      },

      gate: (itemId, channel) => {
        const item = this.items.find((i) => i.id === itemId);
        const cadence = this.cadenceFor(item?.kind ?? "unknown");
        const touches = this.touchesFor(itemId);
        const last = touches[touches.length - 1];
        const sinceLastHours = last ? (this.clock.getTime() - new Date(last.at).getTime()) / 3600_000 : Infinity;
        const hour = this.localHour();

        let decision: GateDecision = { allowed: true };
        if (!item || item.status === "arrived" || item.received) decision = { allowed: false, reason: "arrived" };
        else if (item.status === "declined") decision = { allowed: false, reason: "declined" };
        else if (item.status === "escalated") decision = { allowed: false, reason: "escalated" };
        else if (item.weOwe) decision = { allowed: false, reason: "we_owe_them" };
        else if (touches.length >= cadence.maxTouches) decision = { allowed: false, reason: "cap_reached" };
        else if (sinceLastHours < cadence.spacingHours) decision = { allowed: false, reason: "too_soon" };
        else if (channel !== "call" && !this.hasConsent(item.owedBy, channel)) decision = { allowed: false, reason: "no_consent" };
        else if (channel === "call" && (hour < this.hours.from || hour >= this.hours.to)) decision = { allowed: false, reason: "outside_hours" };

        this.gateDecisions.push({ itemId, channel, decision, at: this.clock.toISOString() });
        this.record("gate", { itemId, channel, touchesSoFar: touches.length }, decision);
        return decision;
      },

      sendMessage: (itemId, channel, text) => {
        this.touches.push({ itemId, channel, at: this.clock.toISOString(), outcome: "sent" });
        this.record("send_sms", { itemId, channel, text }, { ok: true });
      },

      disclose: (itemId, text) => {
        this.openCall(itemId);
        this.turns.push({ itemId, who: "agent", text, at: this.clock.toISOString() });
        this.record("disclose", { itemId, text }, { ok: true });
      },

      say: (itemId, text) => {
        this.openCall(itemId);
        this.turns.push({ itemId, who: "agent", text, at: this.clock.toISOString() });
        this.record("talk", { itemId, text }, { ok: true });
      },

      listen: (itemId) => {
        this.openCall(itemId);
        const reply = this.hear(itemId);
        this.turns.push({ itemId, who: "contact", text: reply.text, at: this.clock.toISOString() });
        this.record("talk", { itemId, listen: true }, reply);
        return reply;
      },

      recordOutcome: (itemId, { kind, value }) => {
        const outcome: Outcome = { id: `OUT${++this.seq}`, itemId, kind, value, recordedAt: this.clock.toISOString() };
        this.outcomes.push(outcome);
        const item = this.items.find((i) => i.id === itemId);
        if (item) {
          if (kind === "decision") {
            item.status = "arrived";
            this.arrivals.push({ itemId, evidenceRef: `outcome:${outcome.id}`, at: outcome.recordedAt });
          } else if (kind === "declined" || kind === "dispute") {
            item.status = "declined";
          }
        }
        // The call's touch carries the outcome, so the record reads by item. Check 11.
        const touch = [...this.touches].reverse().find((t) => t.itemId === itemId && t.channel === "call" && t.outcome === "no_outcome");
        if (touch) touch.outcome = kind;
        this.record("record_promise", { itemId, kind, value }, { id: outcome.id, recordedAt: outcome.recordedAt });
        return { ...outcome };
      },

      attachEvidence: (itemId, ref) => {
        const item = this.items.find((i) => i.id === itemId);
        if (item) {
          item.status = "arrived";
          if (!this.arrivals.some((a) => a.itemId === itemId)) {
            this.arrivals.push({ itemId, evidenceRef: ref, at: this.clock.toISOString() });
          }
        }
        this.record("evidence", { itemId, ref }, { attached: Boolean(item) });
      },

      escalate: (itemId, reason, to, history) => {
        const item = this.items.find((i) => i.id === itemId);
        if (item && item.status === "open") item.status = "escalated";
        this.escalations.push({ itemId, reason, to, history: (history ?? []).map((t) => ({ ...t })), at: this.clock.toISOString() });
        this.record("escalate", { itemId, reason, to, history: (history ?? []).length }, { ok: Boolean(item) });
      },

      notify: (person, text) => {
        this.alerts.push({ person, text, at: this.clock.toISOString() });
        this.record("notify", { person, text }, { ok: true });
      },
    };
  }
}

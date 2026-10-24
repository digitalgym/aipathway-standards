// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/just-sold-pack.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The just-sold world: one sale, the contacts near it, a pack of drafts a
 * person approves, a call short list, and the exceptions.
 *
 * THE SALE CAN STOP THE PACK. Unlike the contact-list world, the trigger here
 * is an event with facts of its own, and three of those facts (not public,
 * confidential, figures that disagree) hold every draft at once. So the sale is
 * held in the world rather than handed to the build as an argument, and the
 * world keeps the agency's own record of the same sale apart from the source's,
 * because check 3 is about the two disagreeing.
 *
 * DRAFT AND SEND ARE TWO PORTS. `draft()` writes an entry a person reviews and
 * never sends. `send()` refuses any entry a person has not approved. The
 * approval itself is not a port: `approve()` is the person's act, called by the
 * scenario, and a build has no way to reach it. Because the world enforces the
 * refusal, an assertion also reads what the BUILD attempted (`refusedSends`),
 * or a build that tried to send everything would pass on the world's say-so.
 *
 * DRAFTING IS IDEMPOTENT PER CONTACT AND SALE. A second `draft()` for the same
 * pair returns the existing entry and its status, which is how a build run
 * twice finds the approved entries and sends them without making a second
 * entry for anyone.
 *
 * CALLING IS OFF UNTIL SOMEBODY TURNS IT ON. `turnCallingOn()` is another
 * person's act. The gate for a call refuses while it is off, and `disclose()`
 * refuses any contact without an allowed call decision first.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The closed list of exceptions. A reason not on it is a note, not an exception. */
export const EXCEPTION_KINDS = [
  "sale_not_public",
  "confidential",
  "figures_mismatch",
  "price_withheld",
  "do_not_contact",
  "no_consent",
  "active_sequence",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** Why a contact is in the pack, strongest first. */
export const REASONS = ["same_street", "radius", "owner_match"] as const;
export type Reason = (typeof REASONS)[number];

export type Channel = "email" | "sms" | "letter";

export interface Sale {
  id: string;
  address: string;
  street: string;
  suburb: string;
  /** ISO date of the sale. */
  soldOn: string;
  /** Null when the price was withheld at the source. */
  price: number | null;
  priceDisclosed: boolean;
  /** False until exchange is public. */
  isPublic: boolean;
  /** Set when the vendor or the buyer asked for the sale to be kept quiet. */
  confidential: "vendor" | "buyer" | null;
  bedrooms?: number;
  propertyType?: string;
  /** When the source last verified these facts. */
  verifiedAt: string;
}

/** The agency's own record of the same sale, which can disagree with the source. */
export interface AgencyRecord {
  price?: number | null;
  soldOn?: string;
  address?: string;
}

export interface Contact {
  id: string;
  name: string;
  /** As resolved from the contact's address. */
  street?: string;
  suburb?: string;
  /** Metres from the sale, once resolved. */
  metres?: number;
  postal?: string;
  email?: string;
  mobile?: string;
  consentEmail?: boolean;
  consentSms?: boolean;
  owner?: boolean;
  /** Owns a home like the one that sold (type and bedrooms), in the same suburb. */
  ownsSimilar?: boolean;
  engagement?: "appraisal_requested" | "callback" | "none";
  /** ISO date, or absent if never. */
  lastSpokeOn?: string;
  /** The other sequence they are in, if any. */
  activeSequence?: string | null;
}

export interface Rules {
  radiusMetres: number;
  shortListSize: number;
  callingEnabled: boolean;
}

export interface DraftFacts {
  street: string;
  soldOn: string;
  price: number | null;
}

export interface DraftInput {
  contactId: string;
  reason: Reason;
  channel: Channel;
  text: string;
  facts: DraftFacts;
}

export interface Entry extends DraftInput {
  entryId: string;
  saleId: string;
  status: "draft" | "approved" | "sent";
  approvedBy?: string;
}

export interface ShortListEntry {
  contactId: string;
  reason: Reason;
  /** Why they rank where they do, in words. */
  why: string;
}

export interface GateDecision {
  allowed: boolean;
  reason?: "do_not_contact" | "active_sequence" | "calling_off" | "outside_hours" | "on_register";
}

export interface ExceptionRecord {
  kind: string;
  saleId: string;
  contactId?: string;
  detail: string;
}

export interface JustSoldPorts {
  now(): Date;
  /** The agency's settings for this standard. */
  rules(): Rules;
  /** The sale that triggered the run, from its source. */
  readSale(): Sale;
  /** The agency's own record of the same sale, if it has one. */
  readAgencyRecord(): AgencyRecord | null;
  readContacts(): Contact[];
  /** Where a contact lives relative to the sale. */
  locate(contactId: string): { sameStreet: boolean; metres: number | null };
  /** May this contact be messaged, or called, for this sale? */
  gate(contactId: string, purpose: "message" | "call"): GateDecision;
  /** Write a draft into the pack. Never sends. Idempotent per contact and sale. */
  draft(input: DraftInput): { entryId: string; existing: boolean; status: Entry["status"] };
  /** Send one entry. Refused unless a person approved it. */
  send(entryId: string): { sent: boolean; why?: string };
  /** Submit the call short list. Ordering only: this permits nothing. */
  rank(entries: ShortListEntry[]): void;
  /** Raise an exception for a person to see. */
  raise(exception: ExceptionRecord): void;
  /** Write a line to the run's log. */
  log(event: string, detail: string): void;
  /** Open a call. Refused unless the gate allowed a call for this contact first. */
  disclose(contactId: string, text: string): { opened: boolean; why?: string };
}

/**
 * The sale a world holds when none is given, so `new JustSoldWorld()` (what
 * the scaffold writes) is a public sale with a disclosed price and nothing
 * holding it. Scenarios that need a held sale pass their own.
 */
export const SAMPLE_SALE: Sale = {
  id: "S1",
  address: "14 Banksia Street, Noosaville",
  street: "Banksia Street",
  suburb: "Noosaville",
  soldOn: "2026-10-17",
  price: 1_250_000,
  priceDisclosed: true,
  isPublic: true,
  confidential: null,
  bedrooms: 4,
  propertyType: "house",
  verifiedAt: "2026-10-23T22:00:00.000Z",
};

export interface JustSoldWorldOptions {
  now?: Date;
  sale?: Sale;
  agencyRecord?: AgencyRecord | null;
  contacts?: Contact[];
  doNotContact?: string[];
  /** Numbers on the stub do-not-call register. */
  onRegister?: string[];
  rules?: Partial<Rules>;
}

export class JustSoldWorld {
  readonly entries: Entry[] = [];
  readonly sends: string[] = [];
  readonly refusedSends: Array<{ entryId: string; why: string }> = [];
  readonly rankings: ShortListEntry[][] = [];
  readonly exceptions: ExceptionRecord[] = [];
  readonly logLines: Array<{ event: string; detail: string }> = [];
  readonly gateDecisions: Array<{ contactId: string; purpose: "message" | "call"; decision: GateDecision }> = [];
  readonly disclosures: string[] = [];
  readonly refusedDisclosures: Array<{ contactId: string; why: string }> = [];
  readonly calls: PortCall[] = [];
  /** Numbers a scenario writes down between runs, for "before and after" assertions. */
  readonly marks = new Map<string, number>();

  private sale: Sale;
  private readonly agencyRecord: AgencyRecord | null;
  private readonly contacts: Contact[];
  private readonly doNotContact: Set<string>;
  private readonly onRegister: Set<string>;
  private rules: Rules;
  private clock: Date;
  private nextEntry = 1;

  constructor(opts: JustSoldWorldOptions = {}) {
    // 10am Saturday in Brisbane: inside calling hours, so only the rules decide.
    this.clock = opts.now ?? new Date("2026-10-24T00:00:00.000Z");
    this.sale = { ...(opts.sale ?? SAMPLE_SALE) };
    this.agencyRecord = opts.agencyRecord === undefined ? null : opts.agencyRecord;
    this.contacts = (opts.contacts ?? []).map((c) => ({ ...c }));
    this.doNotContact = new Set(opts.doNotContact ?? []);
    this.onRegister = new Set(opts.onRegister ?? []);
    this.rules = { radiusMetres: 500, shortListSize: 4, callingEnabled: false, ...opts.rules };
  }

  /** The person's act. A build cannot reach this. */
  approve(contactId: string, by: string): void {
    const e = this.entries.find((x) => x.contactId === contactId && x.saleId === this.sale.id);
    if (e && e.status === "draft") {
      e.status = "approved";
      e.approvedBy = by;
    }
  }

  /** Another person's act: the agency turns calling on. */
  turnCallingOn(): void {
    this.rules = { ...this.rules, callingEnabled: true };
  }

  /** The sale changes between runs, as a real one does. */
  updateSale(patch: Partial<Sale>): void {
    this.sale = { ...this.sale, ...patch };
  }

  get currentSale(): Sale {
    return { ...this.sale };
  }

  entriesFor(contactId: string): Entry[] {
    return this.entries.filter((e) => e.contactId === contactId);
  }

  get lastRanking(): ShortListEntry[] {
    return this.rankings[this.rankings.length - 1] ?? [];
  }

  private localTime(): { day: number; hour: number } {
    const local = new Date(this.clock.getTime() + 10 * 3_600_000);
    return { day: local.getUTCDay(), hour: local.getUTCHours() + local.getUTCMinutes() / 60 };
  }

  private insideCallingHours(): boolean {
    const { day, hour } = this.localTime();
    if (day === 0) return false;
    if (day === 6) return hour >= 9 && hour < 17;
    return hour >= 9 && hour < 20;
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

  ports(): JustSoldPorts {
    return {
      now: () => new Date(this.clock),

      rules: () => {
        const r = { ...this.rules };
        this.record("read_rule", { rules: true }, r);
        return r;
      },

      readSale: () => {
        const s = { ...this.sale };
        this.record("read_sale", { source: "feed", saleId: s.id }, { verifiedAt: s.verifiedAt });
        return s;
      },

      readAgencyRecord: () => {
        const r = this.agencyRecord ? { ...this.agencyRecord } : null;
        this.record("read_sale", { source: "agency_record", saleId: this.sale.id }, { found: r !== null });
        return r;
      },

      readContacts: () => {
        const rows = this.contacts.map((c) => ({ ...c }));
        this.record("read_contacts", { near: this.sale.id }, { count: rows.length });
        return rows;
      },

      locate: (contactId) => {
        const c = this.contacts.find((x) => x.id === contactId);
        const out = {
          sameStreet: Boolean(c?.street && c.street === this.sale.street && c.suburb === this.sale.suburb),
          metres: c?.metres ?? null,
        };
        this.record("resolve_address", { contactId }, out);
        return out;
      },

      gate: (contactId, purpose) => {
        const c = this.contacts.find((x) => x.id === contactId);
        let decision: GateDecision = { allowed: true };
        if (this.doNotContact.has(contactId)) {
          decision = { allowed: false, reason: "do_not_contact" };
        } else if (c?.activeSequence) {
          decision = { allowed: false, reason: "active_sequence" };
        } else if (purpose === "call") {
          if (!this.rules.callingEnabled) decision = { allowed: false, reason: "calling_off" };
          else if (c?.mobile && this.onRegister.has(c.mobile)) decision = { allowed: false, reason: "on_register" };
          else if (!this.insideCallingHours()) decision = { allowed: false, reason: "outside_hours" };
        }
        this.gateDecisions.push({ contactId, purpose, decision });
        this.record("gate", { contactId, purpose }, decision);
        return decision;
      },

      draft: (input) => {
        const found = this.entries.find((e) => e.contactId === input.contactId && e.saleId === this.sale.id);
        if (found) {
          this.record("draft_message", { contactId: input.contactId }, { entryId: found.entryId, existing: true, status: found.status });
          return { entryId: found.entryId, existing: true, status: found.status };
        }
        const entry: Entry = {
          ...input,
          facts: { ...input.facts },
          entryId: `E${this.nextEntry++}`,
          saleId: this.sale.id,
          status: "draft",
        };
        this.entries.push(entry);
        this.record(
          "draft_message",
          { contactId: input.contactId, reason: input.reason, channel: input.channel, facts: input.facts },
          { entryId: entry.entryId, existing: false, status: "draft" },
        );
        return { entryId: entry.entryId, existing: false, status: "draft" };
      },

      send: (entryId) => {
        const e = this.entries.find((x) => x.entryId === entryId);
        let why: string | null = null;
        if (!e) why = "no such entry";
        else if (e.status === "sent") why = "already sent";
        else if (e.status !== "approved") why = "not approved by a person";
        if (why || !e) {
          const reason = why ?? "no such entry";
          this.refusedSends.push({ entryId, why: reason });
          this.record("send_message", { entryId }, { sent: false, why: reason });
          return { sent: false, why: reason };
        }
        e.status = "sent";
        this.sends.push(entryId);
        this.record("send_message", { entryId, channel: e.channel }, { sent: true, approvedBy: e.approvedBy });
        return { sent: true };
      },

      rank: (entries) => {
        this.rankings.push(entries.map((e) => ({ ...e })));
        this.record("rank", { entries: entries.length }, { order: entries.map((e) => e.contactId) });
      },

      raise: (exception) => {
        this.exceptions.push({ ...exception });
        this.record("escalate", exception, { ok: true });
      },

      log: (event, detail) => {
        this.logLines.push({ event, detail });
        this.record("evidence", { event, detail }, { recorded: true });
      },

      disclose: (contactId, text) => {
        const decided = [...this.gateDecisions].reverse().find((g) => g.contactId === contactId && g.purpose === "call");
        let why: string | null = null;
        if (!decided) why = "no call gate decision for this contact";
        else if (!decided.decision.allowed) why = decided.decision.reason ?? "held";
        if (why) {
          this.refusedDisclosures.push({ contactId, why });
          this.record("disclose", { contactId, text }, { opened: false, why });
          return { opened: false, why };
        }
        this.disclosures.push(contactId);
        this.record("disclose", { contactId, text }, { opened: true });
        return { opened: true };
      },
    };
  }
}

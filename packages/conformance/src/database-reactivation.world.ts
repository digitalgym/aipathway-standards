// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/database-reactivation.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The contact-list world: five fields, four plays, a ranking that orders and
 * never permits, and a gate underneath all of it.
 *
 * THE ONE LINE THE WHOLE STANDARD TURNS ON. "Ranking orders, it never permits."
 * A score decides who is called first and must never decide whether somebody may
 * be called at all. So `rank()` takes an order and records it, and `gate()` is a
 * separate call that a build must make before `disclose()`. The world will not
 * let a disclosure through without a gate decision for that contact, because a
 * build that gates in the same breath as it ranks has merged the two things the
 * standard spends a section separating.
 *
 * WHY DO-NOT-CONTACT LIVES IN THE WORLD AND NOT ON THE ROW. Check 8: the flag
 * must survive a re-import of the whole list with that contact present and
 * unflagged, and an import that clears it is "the failure this check exists
 * for". If the flag were a column on the contact, re-importing would overwrite
 * it and every build would fail or pass by accident. It is held separately and
 * `importList` cannot touch it, which is what permanent and global mean.
 *
 * ONE PLAY AT A TIME NEEDS STATE ACROSS RUNS. Check 4 says the runner holds
 * state across runs to see this at all, so `openersSent` persists for the life
 * of the world and a second run in the same week can be refused on it.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The five fields. A contact missing any one is not ready for any play. */
export const REQUIRED_FIELDS = [
  "nameAndMobile",
  "address",
  "purchaseDate",
  "lastContactOutcome",
  "ownerType",
] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** The four plays. A build that puts everybody in one sequence fails check 2. */
export const PLAYS = ["tenure", "equity_checkin", "investor", "lapsed_appraisal"] as const;
export type Play = (typeof PLAYS)[number];

export interface Contact {
  id: string;
  nameAndMobile?: string;
  address?: string;
  purchaseDate?: string;
  /** "callback_requested", "recent_no", "cold", "appraisal_not_converted". */
  lastContactOutcome?: string;
  /** "investor" or "owner_occupier". Never guessed. */
  ownerType?: string;
  /** A comparable sale nearby, which is the strongest opener hook. */
  freshSaleNearby?: boolean;
  timezone?: string;
}

export interface RankedEntry {
  contactId: string;
  play: Play;
  /** The trigger that qualified them. The opener has to reference it. */
  trigger: string;
}

export interface GateDecision {
  allowed: boolean;
  reason?: "do_not_contact" | "outside_hours" | "already_opened_this_week";
}

export interface Skip {
  contactId: string;
  /** Each skip carries its own reason. A count without reasons fails check 9. */
  reason: string;
}

export interface ReactivationPorts {
  now(): Date;
  readContacts(): Contact[];
  /** Which of the five fields a contact is missing. Empty means ready. */
  missingFields(contactId: string): RequiredField[];
  /** Submit the ranked run. Ordering only: this permits nothing. */
  rank(entries: RankedEntry[]): void;
  /** Ask whether this contact may be called right now. */
  gate(contactId: string): GateDecision;
  /** Flag do-not-contact. Permanent and global, and an import cannot clear it. */
  flagDoNotContact(contactId: string): void;
  /** Re-import the whole list. Never clears a do-not-contact flag. */
  importList(contacts: Contact[]): void;
  /** Open the call. Refused unless the gate allowed this contact first. */
  disclose(contactId: string, text: string): { opened: boolean; why?: string };
  /** Say the opener. It must reference the trigger that qualified them. */
  say(contactId: string, opener: string): void;
  /** A step in the cadence. */
  sendStep(contactId: string, step: number, body: string): { sent: boolean; why?: string };
  /** The contact replied. The cadence stops here and sends nothing further. */
  noteReply(contactId: string): void;
  /** Record a skip, with its own reason. */
  skip(contactId: string, reason: string): void;
  escalate(contactId: string, reason: "price_question" | "complaint"): void;
}

export interface ReactivationWorldOptions {
  now?: Date;
  contacts?: Contact[];
  doNotContact?: string[];
  callingHours?: { from: number; to: number };
  /** Steps in a full cadence before it stops on its own. */
  cadenceLength?: number;
}

export class ReactivationWorld {
  readonly runs: RankedEntry[][] = [];
  readonly openers: Array<{ contactId: string; text: string }> = [];
  readonly disclosures: string[] = [];
  readonly refusedDisclosures: Array<{ contactId: string; why: string }> = [];
  readonly steps: Array<{ contactId: string; step: number; body: string }> = [];
  readonly refusedSteps: Array<{ contactId: string; why: string }> = [];
  readonly skips: Skip[] = [];
  readonly escalations: Array<{ contactId: string; reason: string }> = [];
  readonly gateDecisions: Array<{ contactId: string; decision: GateDecision }> = [];
  readonly calls: PortCall[] = [];

  /** Openers already sent, across runs. Check 4 needs this to persist. */
  readonly openersSent = new Set<string>();

  private contacts: Contact[];
  /** Held outside the contact rows, so an import cannot reach it. */
  private readonly doNotContact = new Set<string>();
  private readonly repliedTo = new Set<string>();
  private readonly hours: { from: number; to: number };
  private readonly cadenceLength: number;
  private clock: Date;

  constructor(opts: ReactivationWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane
    this.contacts = (opts.contacts ?? []).map((c) => ({ ...c }));
    for (const id of opts.doNotContact ?? []) this.doNotContact.add(id);
    this.hours = opts.callingHours ?? { from: 8, to: 19 };
    this.cadenceLength = opts.cadenceLength ?? 3;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  contactById(id: string): Contact | undefined {
    return this.contacts.find((c) => c.id === id);
  }

  isFlagged(id: string): boolean {
    return this.doNotContact.has(id);
  }

  /** Missing fields without recording, for assertions. */
  storedMissing(contactId: string): RequiredField[] {
    const c = this.contactById(contactId);
    if (!c) return [...REQUIRED_FIELDS];
    return REQUIRED_FIELDS.filter((f) => !c[f]);
  }

  get lastRun(): RankedEntry[] {
    return this.runs[this.runs.length - 1] ?? [];
  }

  /** Every run flattened, for "exactly one play across the week". */
  get allRunEntries(): RankedEntry[] {
    return this.runs.flat();
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

  ports(): ReactivationPorts {
    return {
      now: () => new Date(this.clock),

      readContacts: () => {
        const rows = this.contacts.map((c) => ({ ...c }));
        this.record("read_contacts", { list: true }, { count: rows.length });
        return rows;
      },

      missingFields: (contactId) => {
        const missing = this.storedMissing(contactId);
        this.record("read_contacts", { contactId }, { missing });
        return missing;
      },

      rank: (entries) => {
        this.runs.push(entries.map((e) => ({ ...e })));
        this.record("rank", { entries: entries.length }, { order: entries.map((e) => e.contactId) });
      },

      gate: (contactId) => {
        let decision: GateDecision = { allowed: true };
        if (this.doNotContact.has(contactId)) {
          decision = { allowed: false, reason: "do_not_contact" };
        } else if (this.openersSent.has(contactId)) {
          decision = { allowed: false, reason: "already_opened_this_week" };
        } else {
          const hour = this.localHour();
          if (hour < this.hours.from || hour >= this.hours.to) {
            decision = { allowed: false, reason: "outside_hours" };
          }
        }
        this.gateDecisions.push({ contactId, decision });
        this.record("gate", { contactId, localHour: Math.round(this.localHour() * 100) / 100 }, decision);
        return decision;
      },

      flagDoNotContact: (contactId) => {
        this.doNotContact.add(contactId);
        this.record("gate", { flag: contactId }, { doNotContact: true, permanent: true });
      },

      importList: (contacts) => {
        // The rows are replaced. The flags are not touched, because they do not
        // live on the rows. That is what makes the flag survive the import.
        this.contacts = contacts.map((c) => ({ ...c }));
        this.record(
          "read_contacts",
          { import: contacts.length },
          { imported: contacts.length, flagsPreserved: this.doNotContact.size },
        );
      },

      disclose: (contactId, text) => {
        const decided = this.gateDecisions.find((g) => g.contactId === contactId);
        if (!decided) {
          // No gate decision for this contact: the build went past it.
          const why = "no gate decision recorded for this contact";
          this.refusedDisclosures.push({ contactId, why });
          this.record("disclose", { contactId, text }, { opened: false, why });
          return { opened: false, why };
        }
        if (!decided.decision.allowed) {
          const why = decided.decision.reason ?? "held";
          this.refusedDisclosures.push({ contactId, why });
          this.record("disclose", { contactId, text }, { opened: false, why });
          return { opened: false, why };
        }
        this.disclosures.push(contactId);
        this.openersSent.add(contactId);
        this.record("disclose", { contactId, text }, { opened: true });
        return { opened: true };
      },

      say: (contactId, opener) => {
        this.openers.push({ contactId, text: opener });
        this.record("talk", { contactId, opener }, { ok: true });
      },

      sendStep: (contactId, step, body) => {
        if (this.repliedTo.has(contactId)) {
          const why = "contact replied; the cadence stops";
          this.refusedSteps.push({ contactId, why });
          this.record("send_sms", { contactId, step }, { sent: false, why });
          return { sent: false, why };
        }
        if (step > this.cadenceLength) {
          const why = "cadence has reached its defined end";
          this.refusedSteps.push({ contactId, why });
          this.record("send_sms", { contactId, step }, { sent: false, why });
          return { sent: false, why };
        }
        this.steps.push({ contactId, step, body });
        this.record("send_sms", { contactId, step, body }, { sent: true });
        return { sent: true };
      },

      noteReply: (contactId) => {
        this.repliedTo.add(contactId);
        this.record("read_contacts", { reply: contactId }, { stops: true });
      },

      skip: (contactId, reason) => {
        this.skips.push({ contactId, reason });
        this.record("evidence", { skip: contactId, reason }, { recorded: true });
      },

      escalate: (contactId, reason) => {
        this.escalations.push({ contactId, reason });
        this.record("escalate", { contactId, reason }, { ok: true });
      },
    };
  }
}

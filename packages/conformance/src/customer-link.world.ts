// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/customer-link.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The customer-link world: customer records in several systems, a link map
 * the business owns, an approval surface a person decides on, a do-not-contact
 * list, and the chases a downstream step drafts.
 *
 * A DECISION IS NOT A BUILD'S TO GIVE, as in the client-memory world. A
 * person's decision arrives as an event (`deliver({ kind: "decision" })`), and
 * the world refuses a `commit` with no matching decision or by someone off the
 * approvers list. The assertions read what the build ATTEMPTED
 * (`proposeRequests`, `commitAttempts`, `recordWrites`), because a world that
 * quietly refuses a bad write would hide the build that tried it.
 *
 * TWO KINDS OF CONTACT READ. `readCustomer(ref)` and `listCustomers()` read
 * records by ref or by system, which every step may do. `findCustomers(text)`
 * is the search by name or phone that check 4 forbids after intake. Both are
 * `read_contacts` on the trace; the request shape tells them apart.
 *
 * THE RECORDS ARE NOT THE MAP. `mergeCustomers` and `updateCustomer` exist so
 * a build that "tidies up" after linking can be caught doing it (check 6).
 * They are recorded as `write_job` or `write_ledger` by the system the ref
 * names.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The systems a ref may name, as in the mesh vocabulary. */
export const LEDGERS = ["xero", "myob", "quickbooks"] as const;
export const STRONG_KEYS = ["abn", "email", "phone"] as const;
export type StrongKey = (typeof STRONG_KEYS)[number];

export const LINK_STATUSES = ["proposed", "linked", "rejected", "unlinked"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export interface CustomerRecord {
  /** <system>:<id>, e.g. servicem8:4471. */
  ref: string;
  name: string;
  abn?: string;
  email?: string;
  phone?: string;
}

export interface Evidence {
  key: StrongKey;
  /** The normalised value both records share. */
  value: string;
}

export interface Link {
  id: string;
  /** Exactly two refs, from different systems. */
  refs: [string, string];
  evidence: Evidence[];
  proposedAt: string;
  /** The node or run that proposed it. */
  proposedBy: string;
  status: LinkStatus;
  decidedAt?: string;
  decidedBy?: string;
  unlinkedAt?: string;
  unlinkedBy?: string;
}

export interface LinkProposalInput {
  refs: [string, string];
  evidence: Evidence[];
  proposedBy: string;
}

export type Decision = "link" | "reject" | "unlink";

export type LinkEvent =
  | { kind: "scan_due"; eventId: string; at: string }
  | { kind: "decision"; eventId: string; at: string; decisionId: string; linkId: string; decision: Decision; by: string }
  | { kind: "chase_due"; eventId: string; at: string; ref: string };

export type Arriving = LinkEvent extends infer E ? (E extends unknown ? Omit<E, "at"> & { at?: string } : never) : never;

export interface DecisionRef {
  decisionId: string;
  decision: Decision;
  by: string;
  at: string;
}

export interface Chase {
  draftId: string;
  ref: string;
  to: string;
  eventId: string;
  at: string;
}

export type ExceptionReason = "abn_conflict" | "unauthorised_approver" | "do_not_contact" | "unknown_ref" | "unknown_link";

export interface CustomerLinkPorts {
  now(): Date;
  nextEvents(): LinkEvent[];
  /** Every customer record in every connected system, by ref. */
  listCustomers(): CustomerRecord[];
  readCustomer(ref: string): CustomerRecord | null;
  /** A search by name or phone. Check 4 says no step uses it after intake. */
  findCustomers(text: string): CustomerRecord[];
  readApprovers(): string[];
  readDoNotContact(): string[];
  /** The refs linked to this one, linked links only, the ref itself included. */
  readLinks(ref: string): { refs: string[]; links: Link[] };
  /** Every link in every status. For the scan, so it does not re-propose. */
  readLinkHistory(): Link[];
  /** The only write an agent makes to the map. */
  proposeLink(input: LinkProposalInput): { id: string };
  /** Record a person's decision. Refused without a matching decision from an approver. */
  commit(linkId: string, decision: DecisionRef): { ok: boolean; why?: string };
  draftChase(input: { ref: string; to: string; eventId: string }): Chase;
  /** Writes to a system of record. A conforming build never calls these. */
  updateCustomer(ref: string, fields: Partial<Omit<CustomerRecord, "ref">>): void;
  mergeCustomers(keepRef: string, dropRef: string): void;
  raise(ref: string, reason: ExceptionReason, detail: string): void;
}

export interface CustomerLinkWorldOptions {
  now?: Date;
  customers?: CustomerRecord[];
  approvers?: string[];
  doNotContact?: string[];
  links?: Link[];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const systemOf = (ref: string): string => ref.slice(0, ref.indexOf(":"));

/** Normalise a strong key the way the standard says to compare it. */
export function normalise(key: StrongKey, raw: string | undefined): string | null {
  if (!raw) return null;
  if (key === "abn") {
    const d = raw.replace(/\D/g, "");
    return d.length === 11 ? d : null;
  }
  if (key === "email") {
    const e = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
  }
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) d = `0${d.slice(2)}`;
  return d.length >= 8 ? d : null;
}

export class CustomerLinkWorld {
  readonly customers: CustomerRecord[];
  readonly links: Link[];
  readonly chases: Chase[] = [];
  readonly exceptions: Array<{ ref: string; reason: ExceptionReason; detail: string }> = [];
  readonly proposeRequests: Array<Record<string, unknown>> = [];
  readonly commitAttempts: Array<{ linkId: string; decision: DecisionRef; ok: boolean; why?: string }> = [];
  /** Every write a build attempted into a system of record. */
  readonly recordWrites: Array<{ op: "update" | "merge"; refs: string[] }> = [];
  readonly calls: PortCall[] = [];

  private readonly seed: CustomerRecord[];
  private readonly approvers: string[];
  private readonly dnc: string[];
  private readonly delivered: LinkEvent[] = [];
  private readCursor = 0;
  private clock: Date;
  private seq = 0;

  constructor(opts: CustomerLinkWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-23T00:00:00.000Z"); // Monday 10am Brisbane
    this.customers = clone(opts.customers ?? []);
    this.seed = clone(opts.customers ?? []);
    this.approvers = [...(opts.approvers ?? [])];
    this.dnc = [...(opts.doNotContact ?? [])];
    this.links = clone(opts.links ?? []);
  }

  // ---- the runner, between runs --------------------------------------------

  deliver(event: Arriving): void {
    this.delivered.push({ ...event, at: event.at ?? this.clock.toISOString() } as LinkEvent);
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- reads for assertions, never recorded --------------------------------

  link(id: string): Link | undefined {
    return this.links.find((l) => l.id === id);
  }

  customer(ref: string): CustomerRecord | undefined {
    return this.customers.find((c) => c.ref === ref);
  }

  decision(decisionId: string): Extract<LinkEvent, { kind: "decision" }> | undefined {
    return this.delivered.find((e): e is Extract<LinkEvent, { kind: "decision" }> => e.kind === "decision" && e.decisionId === decisionId);
  }

  /** True if every customer record is exactly as the run began. */
  recordsUnchanged(): boolean {
    return JSON.stringify(this.customers) === JSON.stringify(this.seed);
  }

  /** The refs linked to `ref`, following linked links only. */
  group(ref: string): string[] {
    const seen = new Set([ref]);
    const queue = [ref];
    while (queue.length) {
      const r = queue.shift()!;
      for (const l of this.links) {
        if (l.status !== "linked" || !l.refs.includes(r)) continue;
        for (const o of l.refs) {
          if (!seen.has(o)) {
            seen.add(o);
            queue.push(o);
          }
        }
      }
    }
    return [...seen];
  }

  private stamp(): string {
    return this.clock.toISOString();
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.stamp(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private writePortFor(ref: string): Port {
    return (LEDGERS as readonly string[]).includes(systemOf(ref)) ? "write_ledger" : "write_job";
  }

  ports(): CustomerLinkPorts {
    return {
      now: () => new Date(this.clock),

      nextEvents: () => {
        const out = clone(this.delivered.slice(this.readCursor));
        this.readCursor = this.delivered.length;
        this.record("read_inbox", { events: true }, { count: out.length, kinds: out.map((e) => e.kind) });
        return out;
      },

      listCustomers: () => {
        const out = clone(this.customers);
        this.record("read_contacts", { list: true }, { count: out.length });
        return out;
      },

      readCustomer: (ref) => {
        const c = this.customer(ref) ?? null;
        this.record("read_contacts", { ref }, c ? { ref } : { found: false });
        return c ? clone(c) : null;
      },

      findCustomers: (text) => {
        const t = text.trim().toLowerCase();
        const digits = t.replace(/\D/g, "");
        const out = clone(
          this.customers.filter(
            (c) => c.name.toLowerCase().includes(t) || (digits.length > 0 && (c.phone ?? "").replace(/\D/g, "") === digits),
          ),
        );
        this.record("read_contacts", { text }, { count: out.length });
        return out;
      },

      readApprovers: () => {
        this.record("read_rule", { approvers: true }, { count: this.approvers.length });
        return [...this.approvers];
      },

      readDoNotContact: () => {
        this.record("read_rule", { do_not_contact: true }, { count: this.dnc.length });
        return [...this.dnc];
      },

      readLinks: (ref) => {
        const refs = this.group(ref);
        const links = clone(this.links.filter((l) => l.status === "linked" && l.refs.some((r) => refs.includes(r))));
        this.record("read_link", { ref }, { refs, links: links.map((l) => l.id) });
        return { refs, links };
      },

      readLinkHistory: () => {
        const out = clone(this.links);
        this.record("read_link", { history: true }, { count: out.length });
        return out;
      },

      proposeLink: (input) => {
        this.proposeRequests.push(clone(input as unknown as Record<string, unknown>));
        const link: Link = {
          id: `L-${++this.seq}`,
          refs: [input.refs[0], input.refs[1]],
          evidence: clone(input.evidence ?? []),
          proposedAt: this.stamp(),
          proposedBy: input.proposedBy,
          // Whatever status the build asked for, a proposal is a proposal.
          status: "proposed",
        };
        this.links.push(link);
        this.record("propose_link", clone(input), { id: link.id, status: "proposed" });
        return { id: link.id };
      },

      commit: (linkId, decision) => {
        const target = this.link(linkId);
        const made = this.decision(decision.decisionId);
        let why: string | undefined;
        if (!target) why = "no such link";
        else if (!made) why = "no decision with that id reached the approval surface";
        else if (made.linkId !== linkId) why = "that decision was about a different link";
        else if (made.by !== decision.by || made.decision !== decision.decision) why = "the commit does not match the decision";
        else if (!this.approvers.includes(made.by)) why = "not on the approvers list";
        else if (made.decision === "unlink" && target.status !== "linked") why = `only a linked link can be unlinked, this one is ${target.status}`;
        else if (made.decision !== "unlink" && target.status !== "proposed") why = `already ${target.status}`;
        const ok = why === undefined;
        this.commitAttempts.push({ linkId, decision: { ...decision }, ok, why });
        if (!ok) {
          this.record("write_link", { linkId, ...decision }, { ok: false, why });
          return { ok: false, why };
        }
        const t = target!;
        const m = made!;
        if (m.decision === "unlink") {
          t.status = "unlinked";
          t.unlinkedAt = m.at;
          t.unlinkedBy = m.by;
        } else {
          t.status = m.decision === "link" ? "linked" : "rejected";
          t.decidedAt = m.at;
          t.decidedBy = m.by;
        }
        this.record("write_link", { linkId, ...decision }, { ok: true, status: t.status });
        return { ok: true };
      },

      draftChase: ({ ref, to, eventId }) => {
        const c: Chase = { draftId: `D-${this.chases.length + 1}`, ref, to, eventId, at: this.stamp() };
        this.chases.push(c);
        this.record("draft_message", { ref, to, eventId }, { draftId: c.draftId, status: "awaiting_send" });
        return { ...c };
      },

      updateCustomer: (ref, fields) => {
        this.recordWrites.push({ op: "update", refs: [ref] });
        const c = this.customer(ref);
        if (c) Object.assign(c, fields);
        this.record(this.writePortFor(ref), { ref, fields }, { ok: Boolean(c) });
      },

      mergeCustomers: (keepRef, dropRef) => {
        this.recordWrites.push({ op: "merge", refs: [keepRef, dropRef] });
        const i = this.customers.findIndex((c) => c.ref === dropRef);
        if (i >= 0) this.customers.splice(i, 1);
        this.record(this.writePortFor(dropRef), { merge: dropRef, into: keepRef }, { ok: i >= 0 });
      },

      raise: (ref, reason, detail) => {
        this.exceptions.push({ ref, reason, detail });
        this.record("escalate", { ref, reason, detail }, { ok: true });
      },
    };
  }
}

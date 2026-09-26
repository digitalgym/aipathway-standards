// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/dispatch-board.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The dispatch world: jobs with windows, techs with licences, a board of
 * slots, a travel table, a consent table, and a dispatcher who can be asked.
 *
 * WHY IT IS ITS OWN WORLD. The call world holds one conversation that ends in
 * a job. This one holds the board after the jobs exist: three techs, a
 * morning of windows, a gas licence that expired in March, and an emergency
 * that arrives at nine. Forcing it into the call world would have hidden the
 * two things this standard is about: the licence rule and the displacement.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a slot
 * write carrying `slotId` updates that slot, and a write without it creates
 * a second slot for the same job, because that is the duplicate check 4
 * exists to catch. Everything else is recorded and left for the assertion: a
 * slot on an address nobody resolved, an assignment to an expired licence,
 * two slots that overlap, a message with no consent, an emergency written
 * with no gate. A world that quietly corrected any of those would pass the
 * build the standard exists to fail.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that deletes a slot, so a build
 * cannot drop a displaced job through the ports. There is no port that
 * overrides a licence rule, because it is not a person's to override either.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const ESCALATION_REASONS = [
  "address_unresolved",
  "no_licensed_tech",
  "window_impossible",
  "no_consent",
  "write_failed",
  "displaced",
  "no_capacity",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export interface Window {
  from: string;
  to: string;
}

export interface Job {
  id: string;
  customerId: string;
  /** As the customer typed or said it. Check 1 resolves it before any slot. */
  address: string;
  window: Window;
  durationMin: number;
  /** Licence codes the job needs: gas, electrical, height. Check 2. */
  requires: string[];
  urgency: "routine" | "emergency";
  status: "new" | "slotted" | "done";
  /** The customer's own words about the fault. Check 7 carries them to the tech. */
  customerSaid: string;
  /** Bumped by the runner on a change. Check 8 compares it to the slot's. */
  version: number;
}

export interface Tech {
  id: string;
  name: string;
  licences: Array<{ code: string; expires: string }>;
  homeBase: string;
}

export interface Slot {
  id: string;
  jobId: string;
  techId: string;
  start: string;
  end: string;
  /** The address the tech is going to. Check 1 wants it to be the resolved one. */
  address: string | null;
  /** The job system's own id. Null means the write did not land. Check 4. */
  externalId: string | null;
  updatedBy: { person?: string; rule?: string };
  /** The emergency that took this slot's time, when one did. Check 5. */
  displacedBy: string | null;
  /** The job version this slot was written against. Check 8. */
  jobVersion: number;
  updates: number;
  evidence: string[];
}

export interface Consent {
  customerId: string;
  channel: string;
  givenAt: string;
}

export interface Message {
  id: string;
  to: string;
  channel: string;
  slotId: string;
  bodyRef: string;
  body: string;
  sentAt: string;
}

export interface TechNotice {
  jobId?: string;
  address?: string | null;
  window?: Window;
  customerSaid?: string;
  body: string;
}

export interface Escalation {
  jobId: string;
  reason: EscalationReason;
  owner: string;
}

export interface LicenceRule {
  code: string;
  holders: Array<{ techId: string; expires: string; current: boolean }>;
}

export interface DispatchPorts {
  now(): Date;
  /** Every job the board has to place. */
  readJobs(): Job[];
  /** The techs, the slots as they stand, and who is on the desk. */
  readBoard(): { techs: Tech[]; slots: Slot[]; dispatcher: string };
  /** The existing slot for a job, if one exists. Read before writing. Check 4. */
  readSlotForJob(jobId: string): Slot | null;
  /** Travel in milliseconds between two resolved addresses. A table here; a map live. Check 3. */
  readTravel(from: string, to: string): number;
  /** The geocoder. Null when the address does not resolve. Check 1. */
  resolveAddress(raw: string): { resolved: string } | null;
  /** Who holds a current licence for a code, as at now. Check 2. */
  readLicenceRule(code: string): LicenceRule;
  /**
   * Write or update a slot. With `slotId`, updates that slot. Without it,
   * creates a new one even if the job already has one. Returns null when the
   * write was not verified.
   */
  writeSlot(input: {
    slotId?: string;
    jobId: string;
    techId: string;
    start: string;
    end: string;
    address: string | null;
    updatedBy: { person?: string; rule?: string };
    displacedBy?: string;
  }): Slot | null;
  /** Ask the dispatcher to accept a displacement. Recorded as asked and as answered. Check 5. */
  askDispatcher(input: { emergencyJobId: string; displaceSlotId: string }): { accepted: boolean; person: string } | null;
  /** Is there consent for this customer on this channel? Check 6. */
  checkConsent(customerId: string, channel: string): Consent | null;
  /** Send. Recorded whether or not consent was checked. Check 6 and 8. */
  sendSms(input: { to: string; channel: string; slotId: string; bodyRef: string; body: string }): Message | null;
  /** Tell the tech. Recorded as given, bare or full. Check 7. */
  notifyTech(techId: string, notice: TechNotice): void;
  /** Attach a reference to a slot: the message the customer was sent. Check 10. */
  attachEvidence(slotId: string, ref: string): void;
  /** What the job produced. Check 10. */
  readRecord(jobId: string): { job: Job | null; slots: Slot[]; messages: Message[] };
  escalate(jobId: string, reason: EscalationReason, owner: string): void;
}

export interface DispatchWorldOptions {
  now?: Date;
  techs?: Tech[];
  jobs?: Job[];
  /** Raw address to resolved address. Anything not in the map does not resolve. */
  geocoder?: Record<string, string>;
  /** Travel between two resolved addresses, keyed "from>to", in minutes. */
  travelMin?: Record<string, number>;
  /** Used when the table has no entry for a pair. */
  defaultTravelMin?: number;
  consents?: Consent[];
  dispatcher?: { name: string; accepts: boolean };
  /** Make the next slot write return no id, to exercise check 4. */
  failNextWrite?: boolean;
}

export class DispatchWorld {
  readonly slots: Slot[] = [];
  readonly messages: Message[] = [];
  readonly notices: Array<{ techId: string; notice: TechNotice; at: string }> = [];
  readonly escalations: Escalation[] = [];
  readonly acceptances: Array<{ emergencyJobId: string; displaceSlotId: string; person: string; accepted: boolean }> = [];
  readonly calls: PortCall[] = [];
  /** `calls.length` at each change or arrival the runner injected. Check 8. */
  readonly marks: number[] = [];

  private readonly techs: Tech[];
  private readonly jobs: Job[];
  private readonly geocoder: Record<string, string>;
  private readonly travelMin: Record<string, number>;
  private readonly defaultTravelMin: number;
  private readonly consents: Consent[];
  private readonly dispatcher: { name: string; accepts: boolean };
  private failNextWrite: boolean;
  private clock: Date;
  private seq = 0;

  constructor(opts: DispatchWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.techs = (opts.techs ?? []).map((t) => ({ ...t, licences: t.licences.map((l) => ({ ...l })) }));
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j, window: { ...j.window }, requires: [...j.requires] }));
    this.geocoder = { ...(opts.geocoder ?? {}) };
    this.travelMin = { ...(opts.travelMin ?? {}) };
    this.defaultTravelMin = opts.defaultTravelMin ?? 30;
    this.consents = (opts.consents ?? []).map((c) => ({ ...c }));
    this.dispatcher = opts.dispatcher ?? { name: "Lee Tran", accepts: true };
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** An emergency lands on the board. The runner does this, never the build. */
  arriveEmergency(job: Job): void {
    this.marks.push(this.calls.length);
    this.jobs.push({ ...job, window: { ...job.window }, requires: [...job.requires], urgency: "emergency" });
  }

  /** The job changes after it was slotted: its window, its address. The runner does this. */
  changeJob(jobId: string, patch: { window?: Window; address?: string }): void {
    const j = this.jobs.find((x) => x.id === jobId);
    if (!j) return;
    this.marks.push(this.calls.length);
    if (patch.window) j.window = { ...patch.window };
    if (patch.address !== undefined) j.address = patch.address;
    j.version += 1;
  }

  /** Non-recording twins for the runner. */
  slotsFor(jobId: string): Slot[] {
    return this.slots.filter((s) => s.jobId === jobId);
  }

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  tech(id: string): Tech | undefined {
    return this.techs.find((t) => t.id === id);
  }

  resolves(raw: string): string | null {
    return this.geocoder[raw] ?? null;
  }

  travel(from: string, to: string): number {
    return (this.travelMin[`${from}>${to}`] ?? this.defaultTravelMin) * 60 * 1000;
  }

  licenceCurrent(techId: string, code: string): boolean {
    const t = this.techs.find((x) => x.id === techId);
    const l = t?.licences.find((x) => x.code === code);
    return Boolean(l) && new Date(l!.expires).getTime() > this.clock.getTime();
  }

  consentFor(customerId: string, channel: string): Consent | null {
    return this.consents.find((c) => c.customerId === customerId && c.channel === channel) ?? null;
  }

  messagesTo(customerId: string): Message[] {
    return this.messages.filter((m) => m.to === customerId);
  }

  noticesTo(techId: string): TechNotice[] {
    return this.notices.filter((n) => n.techId === techId).map((n) => n.notice);
  }

  escalationsFor(jobId: string): Escalation[] {
    return this.escalations.filter((e) => e.jobId === jobId);
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  /** The calls since the last change or arrival the runner injected. */
  callsSinceMark(): PortCall[] {
    const from = this.marks[this.marks.length - 1] ?? 0;
    return this.calls.slice(from);
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

  private copySlot(s: Slot): Slot {
    return { ...s, updatedBy: { ...s.updatedBy }, evidence: [...s.evidence] };
  }

  private copyJob(j: Job): Job {
    return { ...j, window: { ...j.window }, requires: [...j.requires] };
  }

  ports(): DispatchPorts {
    return {
      now: () => new Date(this.clock),

      readJobs: () => {
        const rows = this.jobs.map((j) => this.copyJob(j));
        this.record("read_job", { jobs: true }, { count: rows.length, ids: rows.map((j) => j.id) });
        return rows;
      },

      readBoard: () => {
        const techs = this.techs.map((t) => ({ ...t, licences: t.licences.map((l) => ({ ...l })) }));
        const slots = this.slots.map((s) => this.copySlot(s));
        this.record("read_job", { board: true }, { techs: techs.map((t) => t.id), slots: slots.length, dispatcher: this.dispatcher.name });
        return { techs, slots, dispatcher: this.dispatcher.name };
      },

      readSlotForJob: (jobId) => {
        const s = this.slots.find((x) => x.jobId === jobId) ?? null;
        this.record("read_job", { slotFor: jobId }, s ? { slotId: s.id, externalId: s.externalId, jobVersion: s.jobVersion } : null);
        return s ? this.copySlot(s) : null;
      },

      readTravel: (from, to) => {
        const ms = this.travel(from, to);
        this.record("read_job", { travel: { from, to } }, { ms });
        return ms;
      },

      resolveAddress: (raw) => {
        const resolved = this.geocoder[raw] ?? null;
        this.record("resolve_address", { raw }, resolved ? { resolved } : null);
        return resolved ? { resolved } : null;
      },

      readLicenceRule: (code) => {
        const holders = this.techs
          .flatMap((t) => t.licences.filter((l) => l.code === code).map((l) => ({ techId: t.id, expires: l.expires, current: new Date(l.expires).getTime() > this.clock.getTime() })));
        this.record("read_rule", { licence: code }, { holders: holders.map((h) => `${h.techId}:${h.current ? "current" : "expired"}`) });
        return { code, holders };
      },

      writeSlot: (input) => {
        if (input.slotId) {
          const existing = this.slots.find((s) => s.id === input.slotId);
          if (!existing) {
            this.record("write_job", { update: input.slotId }, null);
            return null;
          }
          const job = this.jobs.find((j) => j.id === existing.jobId);
          existing.techId = input.techId;
          existing.start = input.start;
          existing.end = input.end;
          existing.address = input.address;
          existing.updatedBy = { ...input.updatedBy };
          if (input.displacedBy !== undefined) existing.displacedBy = input.displacedBy;
          existing.jobVersion = job?.version ?? existing.jobVersion;
          existing.updates += 1;
          this.record("write_job", { update: existing.id, jobId: existing.jobId, techId: input.techId, start: input.start, end: input.end, displacedBy: input.displacedBy ?? null, by: input.updatedBy }, { externalId: existing.externalId, updates: existing.updates });
          return this.copySlot(existing);
        }
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_job", { jobId: input.jobId, techId: input.techId, start: input.start }, null);
          return null;
        }
        const job = this.jobs.find((j) => j.id === input.jobId);
        const id = `S${++this.seq}`;
        const slot: Slot = {
          id,
          jobId: input.jobId,
          techId: input.techId,
          start: input.start,
          end: input.end,
          address: input.address,
          externalId: `js-${id}`,
          updatedBy: { ...input.updatedBy },
          displacedBy: input.displacedBy ?? null,
          jobVersion: job?.version ?? 0,
          updates: 0,
          evidence: [],
        };
        this.slots.push(slot);
        if (job) job.status = "slotted";
        this.record("write_job", { jobId: input.jobId, techId: input.techId, start: input.start, end: input.end, address: input.address, by: input.updatedBy }, { id, externalId: slot.externalId });
        return this.copySlot(slot);
      },

      askDispatcher: (input) => {
        const answer = { accepted: this.dispatcher.accepts, person: this.dispatcher.name };
        this.acceptances.push({ ...input, ...answer });
        this.record("gate", { displace: input.displaceSlotId, for: input.emergencyJobId }, answer);
        return { ...answer };
      },

      checkConsent: (customerId, channel) => {
        const c = this.consentFor(customerId, channel);
        this.record("gate", { consent: customerId, channel }, c ? { givenAt: c.givenAt } : null);
        return c ? { ...c } : null;
      },

      sendSms: (input) => {
        const id = `M${++this.seq}`;
        const msg: Message = { id, ...input, sentAt: this.clock.toISOString() };
        this.messages.push(msg);
        this.record("send_sms", { to: input.to, channel: input.channel, slotId: input.slotId, bodyRef: input.bodyRef }, { id, sentAt: msg.sentAt });
        return { ...msg };
      },

      notifyTech: (techId, notice) => {
        this.notices.push({ techId, notice: { ...notice }, at: this.clock.toISOString() });
        this.record("notify", { techId, jobId: notice.jobId ?? null, address: notice.address ?? null, window: notice.window ?? null, customerSaid: notice.customerSaid ?? null }, { ok: true });
      },

      attachEvidence: (slotId, ref) => {
        const s = this.slots.find((x) => x.id === slotId);
        if (s) s.evidence.push(ref);
        this.record("evidence", { slotId, ref }, { attached: Boolean(s) });
      },

      readRecord: (jobId) => {
        const job = this.jobs.find((j) => j.id === jobId) ?? null;
        const slots = this.slotsFor(jobId).map((s) => this.copySlot(s));
        const slotIds = new Set(slots.map((s) => s.id));
        const messages = this.messages.filter((m) => slotIds.has(m.slotId)).map((m) => ({ ...m }));
        this.record("read_job", { record: jobId }, { slots: slots.map((s) => s.id), messages: messages.length });
        return { job: job ? this.copyJob(job) : null, slots, messages };
      },

      escalate: (jobId, reason, owner) => {
        this.escalations.push({ jobId, reason, owner });
        this.record("escalate", { jobId, reason, owner }, { ok: true });
      },
    };
  }
}

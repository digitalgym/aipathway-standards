// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/next-service.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The next-service world: a job system with completed and open jobs, the
 * service records the build writes from them, a written schedule per
 * equipment type, customers with the channels they agreed to, an outbox, the
 * replies that come back, and the booking requests written into the job
 * system.
 *
 * DUE DATES ARE NOT STORED HERE. No asset record carries a next-due date. The
 * schedule is a rule the runner can change between runs (`setRule`, the owner
 * editing it), and a build that worked a date out once and kept it fails the
 * moment it does. A technician's typed date sits on the job as
 * `typedNextDue`, as bait: a conforming build never reads it.
 *
 * THE JOB SYSTEM DOES NOT DEDUPLICATE. `writeBookingRequest` creates a new job
 * every time it is called, as ServiceM8, Simpro and the rest do. One booking
 * request per yes is the build's job: it reads the open jobs for the asset
 * first. A world that refused the second write would hide the build that never
 * checked (porting doc §8).
 *
 * THE OPT-OUT LIVES IN THE WORLD, KEYED ON THE CUSTOMER. A new completed job
 * cannot reach it. The world refuses a send to someone who opted out, or on a
 * channel they did not agree to, and the assertions still read
 * `sendAttempts`, so the refusal never hides the build that tried.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const EXCEPTION_KINDS = [
  "missing_install_date",
  "missing_model",
  "missing_equipment_type",
  "no_schedule",
  "no_consent",
  "unclear_reply",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export type ReminderKind = "service" | "warranty";
export type Stage = "reminder" | "follow_up";
export type Channel = "sms" | "email";

/** The equipment as the technician recorded it on the job. */
export interface Equipment {
  assetId: string;
  type?: string;
  make?: string;
  model?: string;
  serial?: string;
  installedOn?: string;
  /** Set on a service job: the date this visit serviced it. */
  servicedOn?: string;
  /** The warranty term written on the job, in months. Absent means unknown. */
  warrantyMonths?: number;
  /** A next-due date somebody typed. A conforming build never uses it. */
  typedNextDue?: string;
}

export interface Job {
  jobId: string;
  customerId: string;
  kind: "install" | "service" | "repair" | "booking_request";
  status: "complete" | "open" | "scheduled";
  completedOn?: string;
  assetId?: string;
  equipment?: Equipment;
  /** Booking requests only. */
  note?: string;
  slot?: string;
  price?: number;
}

/** What the build records against the asset from a completed job. */
export interface ServiceRecord {
  assetId: string;
  customerId: string;
  sourceJobId: string;
  type?: string;
  make?: string;
  model?: string;
  serial?: string;
  installedOn?: string;
  servicedOn?: string;
  warrantyMonths?: number;
}

/** The asset as it stands: the latest of its service records, merged. */
export interface Asset {
  assetId: string;
  customerId: string;
  type?: string;
  make?: string;
  model?: string;
  serial?: string;
  installedOn?: string;
  lastServicedOn?: string;
  warrantyMonths?: number;
}

export interface Customer {
  customerId: string;
  name: string;
  mobile?: string;
  email?: string;
  consentSms?: boolean;
  consentEmail?: boolean;
}

export interface ScheduleRule {
  type: string;
  serviceMonths: number;
}

export interface Settings {
  /** Days before a date that the reminder goes. */
  leadDays: number;
  /** Days after a reminder that the one follow-up goes. */
  followUpDays: number;
}

export interface OutboundMessage {
  customerId: string;
  assetId: string;
  kind: ReminderKind;
  stage: Stage;
  dueOn: string;
  channel: Channel;
  body: string;
}

export interface Sent extends OutboundMessage {
  sendId: string;
  at: string;
}

export interface Reply {
  replyId: string;
  customerId: string;
  /** The send it answers: the latest one to that customer, if any. */
  sendId?: string;
  assetId?: string;
  via: "sms" | "email" | "link";
  text: string;
  at: string;
}

export interface BookingRequest {
  customerId: string;
  assetId: string;
  replyId: string;
  note: string;
  slot?: string;
  price?: number;
}

export interface EvidenceEntry {
  kind: "sent" | "reply" | "opt_out" | "booking_request";
  ref: string;
  assetId?: string;
  detail: string;
}

export interface NextServicePorts {
  now(): Date;
  /** Every job in the job system, complete or not. */
  readJobs(): Job[];
  /** The open or scheduled jobs on one asset, booking requests included. */
  readOpenJobs(assetId: string): Job[];
  /** Record a completed job's equipment against the asset. */
  recordEquipment(rec: ServiceRecord): void;
  /** The service records already written, so a second run does not repeat one. */
  readServiceRecords(): ServiceRecord[];
  readAssets(): Asset[];
  /** The written schedule for one equipment type, or null if there is none. */
  readSchedule(type: string): ScheduleRule | null;
  readSettings(): Settings;
  raiseException(ref: string, kind: ExceptionKind, detail: string): void;
  /** What this customer agreed to, and whether they asked to stop. */
  consentFor(customerId: string): { sms: boolean; email: boolean; optedOut: boolean };
  customer(customerId: string): Customer | null;
  /** Refused to someone who opted out, or on a channel they did not agree to. */
  send(msg: OutboundMessage): { sent: boolean; sendId?: string; why?: string };
  /** What has gone already, so nothing goes twice. */
  listSent(): Sent[];
  /** Replies, each with whether the build has already recorded it. */
  readReplies(): Array<Reply & { handled: boolean }>;
  /** Withdrawn consent for the customer. Permanent across assets. */
  recordOptOut(customerId: string, said: string): void;
  /** Writes a new job, every time it is called. */
  writeBookingRequest(req: BookingRequest): { jobId: string };
  /** Tell a person something is waiting for them. */
  notify(text: string): void;
  record(entry: EvidenceEntry): void;
}

export interface NextServiceWorldOptions {
  now?: Date;
  jobs?: Job[];
  customers?: Customer[];
  rules?: ScheduleRule[];
  settings?: Settings;
}

/** Calendar months on an ISO date, clamped to the end of the month. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(d, last))).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class NextServiceWorld {
  readonly jobs: Job[];
  readonly serviceRecords: ServiceRecord[] = [];
  readonly sent: Sent[] = [];
  /** Every send the build attempted, allowed or not. */
  readonly sendAttempts: Array<OutboundMessage & { at: string }> = [];
  readonly replies: Reply[] = [];
  readonly bookingWrites: Array<BookingRequest & { jobId: string; at: string }> = [];
  readonly exceptions: Array<{ ref: string; kind: ExceptionKind; detail: string }> = [];
  readonly evidence: EvidenceEntry[] = [];
  readonly notifications: string[] = [];
  /** Asset ids whose open jobs the build read, in order. */
  readonly openJobReads: string[] = [];
  /** For each attempted send, how many open-job reads of that asset came before it. */
  readonly readsBeforeSend: Array<{ assetId: string; reads: number }> = [];
  readonly optOutsAt = new Map<string, string>();
  readonly calls: PortCall[] = [];
  /** When the owner last changed a rule, for the assertion. */
  ruleChangedAt: string | null = null;

  private readonly customers: Customer[];
  private readonly rules = new Map<string, ScheduleRule>();
  private readonly settings: Settings;
  private clock: Date;

  constructor(opts: NextServiceWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-10-26T00:00:00.000Z"); // Monday 10am Brisbane
    this.jobs = (opts.jobs ?? []).map((j) => structuredClone(j));
    this.customers = (opts.customers ?? []).map((c) => ({ ...c }));
    for (const r of opts.rules ?? []) this.rules.set(r.type, { ...r });
    this.settings = opts.settings ?? { leadDays: 21, followUpDays: 7 };
  }

  // ---- the business, between runs -------------------------------------------

  /** The owner edits the written schedule. */
  setRule(type: string, serviceMonths: number): void {
    this.rules.set(type, { type, serviceMonths });
    this.ruleChangedAt = this.clock.toISOString();
  }

  /** A technician marks a new job complete. */
  completeJob(job: Job): void {
    this.jobs.push(structuredClone(job));
  }

  /** A customer replies to the latest message they were sent. */
  reply(customerId: string, text: string, via: Reply["via"] = "sms"): void {
    const last = [...this.sent].reverse().find((s) => s.customerId === customerId);
    this.replies.push({
      replyId: `R-${this.replies.length + 1}`,
      customerId,
      sendId: last?.sendId,
      assetId: last?.assetId,
      via,
      text,
      at: this.clock.toISOString(),
    });
  }

  advanceDays(days: number): void {
    this.clock = new Date(this.clock.getTime() + days * 86_400_000);
  }

  // ---- reads for assertions, never recorded -----------------------------------

  rule(type: string): ScheduleRule | undefined {
    return this.rules.get(type);
  }

  get leadDays(): number {
    return this.settings.leadDays;
  }

  get followUpDays(): number {
    return this.settings.followUpDays;
  }

  bookingRequestsFor(assetId: string): Job[] {
    return this.jobs.filter((j) => j.kind === "booking_request" && j.assetId === assetId);
  }

  attemptsTo(customerId: string): Array<OutboundMessage & { at: string }> {
    return this.sendAttempts.filter((s) => s.customerId === customerId);
  }

  exceptionKinds(ref: string): ExceptionKind[] {
    return this.exceptions.filter((e) => e.ref === ref).map((e) => e.kind);
  }

  assetsNow(): Asset[] {
    const byId = new Map<string, Asset>();
    for (const r of this.serviceRecords) {
      const prev = byId.get(r.assetId);
      const next: Asset = {
        assetId: r.assetId,
        customerId: r.customerId,
        type: r.type ?? prev?.type,
        make: r.make ?? prev?.make,
        model: r.model ?? prev?.model,
        serial: r.serial ?? prev?.serial,
        installedOn: r.installedOn ?? prev?.installedOn,
        lastServicedOn: [prev?.lastServicedOn, r.servicedOn].filter(Boolean).sort().pop(),
        warrantyMonths: r.warrantyMonths ?? prev?.warrantyMonths,
      };
      byId.set(r.assetId, next);
    }
    return [...byId.values()];
  }

  private isOptedOut(customerId: string): boolean {
    return this.optOutsAt.has(customerId);
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

  ports(): NextServicePorts {
    return {
      now: () => new Date(this.clock),

      readJobs: () => {
        const out = this.jobs.map((j) => structuredClone(j));
        this.record("read_job", { all: true }, { count: out.length });
        return out;
      },

      readOpenJobs: (assetId) => {
        this.openJobReads.push(assetId);
        const out = this.jobs.filter((j) => j.assetId === assetId && j.status !== "complete").map((j) => structuredClone(j));
        this.record("read_job", { assetId, open: true }, { count: out.length });
        return out;
      },

      recordEquipment: (rec) => {
        this.serviceRecords.push({ ...rec });
        this.record("record_service", rec, { recorded: true });
      },

      readServiceRecords: () => {
        const out = this.serviceRecords.map((r) => ({ ...r }));
        this.record("read_asset", { serviceRecords: true }, { count: out.length });
        return out;
      },

      readAssets: () => {
        const out = this.assetsNow();
        this.record("read_asset", { assets: true }, { count: out.length });
        return out;
      },

      readSchedule: (type) => {
        const r = this.rules.get(type);
        this.record("read_rule", { schedule: type }, r ? { ...r } : { none: true });
        return r ? { ...r } : null;
      },

      readSettings: () => {
        this.record("read_rule", { settings: true }, { ...this.settings });
        return { ...this.settings };
      },

      raiseException: (ref, kind, detail) => {
        if (!this.exceptions.some((e) => e.ref === ref && e.kind === kind)) this.exceptions.push({ ref, kind, detail });
        this.record("escalate", { ref, kind, detail }, { ok: true });
      },

      consentFor: (customerId) => {
        const c = this.customers.find((x) => x.customerId === customerId);
        const out = { sms: !!c?.consentSms, email: !!c?.consentEmail, optedOut: this.isOptedOut(customerId) };
        this.record("gate", { customerId, consent: true }, out);
        return out;
      },

      customer: (customerId) => {
        const c = this.customers.find((x) => x.customerId === customerId);
        return c ? { ...c } : null;
      },

      send: (msg) => {
        const at = this.clock.toISOString();
        this.sendAttempts.push({ ...msg, at });
        this.readsBeforeSend.push({ assetId: msg.assetId, reads: this.openJobReads.filter((a) => a === msg.assetId).length });
        const c = this.customers.find((x) => x.customerId === msg.customerId);
        let why: string | undefined;
        if (!c) why = "no such customer";
        else if (this.isOptedOut(msg.customerId)) why = "this customer asked to stop";
        else if (msg.channel === "sms" && !c.consentSms) why = "no consent for SMS";
        else if (msg.channel === "email" && !c.consentEmail) why = "no consent for email";
        if (why) {
          this.record("send_message", msg, { sent: false, why });
          return { sent: false, why };
        }
        const sendId = `S-${this.sent.length + 1}`;
        this.sent.push({ ...msg, sendId, at });
        this.record("send_message", msg, { sent: true, sendId });
        return { sent: true, sendId };
      },

      listSent: () => {
        const out = this.sent.map((s) => ({ ...s }));
        this.record("read_inbox", { sent: true }, { count: out.length });
        return out;
      },

      readReplies: () => {
        const out = this.replies.map((r) => ({
          ...r,
          handled: this.evidence.some((e) => e.kind === "reply" && e.ref === r.replyId),
        }));
        this.record("read_inbox", { replies: true }, { count: out.length });
        return out;
      },

      recordOptOut: (customerId, said) => {
        if (!this.optOutsAt.has(customerId)) this.optOutsAt.set(customerId, this.clock.toISOString());
        this.record("record_consent", { customerId, said }, { consent: "withdrawn", permanent: true });
      },

      writeBookingRequest: (req) => {
        const jobId = `J-BR-${this.bookingWrites.length + 1}`;
        this.bookingWrites.push({ ...req, jobId, at: this.clock.toISOString() });
        this.jobs.push({
          jobId,
          customerId: req.customerId,
          kind: "booking_request",
          status: "open",
          assetId: req.assetId,
          note: req.note,
          ...(req.slot !== undefined ? { slot: req.slot } : {}),
          ...(req.price !== undefined ? { price: req.price } : {}),
        });
        this.record("write_job", req, { jobId, created: true });
        return { jobId };
      },

      notify: (text) => {
        this.notifications.push(text);
        this.record("notify", { text }, { ok: true });
      },

      record: (entry) => {
        this.evidence.push({ ...entry });
        this.record("evidence", entry, { recorded: true });
      },
    };
  }
}

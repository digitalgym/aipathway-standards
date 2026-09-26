// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/invoice-out.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The invoice-out world: jobs that complete, a price book, and a ledger that
 * takes one invoice per job.
 *
 * WHY IT IS ITS OWN WORLD. The quote world holds a job that is about to be
 * priced; this one holds a job that has been done, with a contract stage, a
 * variation that may or may not be signed, and a release rule with a
 * threshold. Forcing both into one world would have hidden the two things
 * this standard is about: the signature and the release.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a write
 * with an existing invoice for the same job updates it rather than creating
 * another ONLY when the build passes the invoice id; a write without it creates
 * a second invoice, because that is the duplicate check 6 exists to catch.
 * Everything else is recorded: an invented rate, an unsigned variation billed,
 * a send with no release, a progress claim in the notes.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that serves, certifies or
 * disputes a claim. A build cannot do those through the ports because the
 * ports do not exist.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const LINE_KINDS = ["callout", "labour", "material", "variation"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const PARK_REASONS = ["not_in_pricebook", "unsigned_variation", "write_failed", "no_stage"] as const;
export type ParkReason = (typeof PARK_REASONS)[number];

export interface JobLine {
  code: string;
  qty: number;
  kind: LineKind;
  description: string;
  /** A reference to the customer's signed acceptance, when one exists. Check 4. */
  signedAcceptance?: string;
}

export interface Job {
  id: string;
  customerId: string;
  status: "open" | "complete";
  completedAt?: string;
  lines: JobLine[];
  /** Present when the job sits under a building contract. Check 5. */
  contractStage?: string;
}

export interface PriceItem {
  code: string;
  description: string;
  rate: number;
}

export interface InvoiceLine {
  code: string;
  qty: number;
  rate: number;
  kind: LineKind;
}

export interface Invoice {
  id: string;
  externalId: string | null;
  jobId: string;
  lines: InvoiceLine[];
  /** The book edition the rates were read from. Check 10. */
  bookEdition: string | null;
  stage?: string;
  notes?: string;
  status: "draft" | "parked" | "released" | "sent";
  parkReason?: ParkReason;
  evidence: string[];
  releasedBy?: string;
  releasedByRule?: string;
  sentAt?: string;
  updates: number;
}

export interface ReleaseRule {
  name: string;
  /** Total under which the rule may release without a person. */
  threshold: number;
}

export interface InvoiceOutPorts {
  now(): Date;
  /** Every job, with its status. The completion is the only trigger. */
  readJobs(): Job[];
  /** The existing invoice for a job, if one exists. Read before writing. Check 6. */
  readInvoiceForJob(jobId: string): Invoice | null;
  /** The price list, read at draft time. Check 3. */
  readPricebook(): { edition: string; items: PriceItem[] };
  /** The release rule the person set, or null when none. Check 8. */
  readReleaseRule(): ReleaseRule | null;
  /**
   * Write or update an invoice. With `invoiceId`, updates that invoice. Without
   * it, creates a new one even if the job already has one. Returns null when
   * the write was not verified. `park` stores it parked with a reason.
   */
  writeInvoice(input: {
    invoiceId?: string;
    jobId: string;
    lines: InvoiceLine[];
    bookEdition: string | null;
    stage?: string;
    notes?: string;
    park?: ParkReason;
  }): Invoice | null;
  /** Attach a signed acceptance to an invoice. Check 4. */
  attachEvidence(invoiceId: string, ref: string): void;
  /** Release for sending: a named person, or a rule. Recorded as given. Check 8. */
  release(invoiceId: string, by: { person?: string; rule?: string }): void;
  /** Send. Recorded whether or not a release preceded it. Check 8 and 9. */
  send(invoiceId: string): void;
  /** What the job produced. Check 10. */
  readRecord(jobId: string): { invoice: Invoice | null };
  escalate(reason: ParkReason | "over_threshold", detail?: string): void;
}

export interface InvoiceOutWorldOptions {
  now?: Date;
  jobs?: Job[];
  pricebook?: { edition: string; items: PriceItem[] };
  releaseRule?: ReleaseRule | null;
  /** Make the next write return no id, to exercise check 6. */
  failNextWrite?: boolean;
}

export class InvoiceOutWorld {
  readonly invoices: Invoice[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly sends: Array<{ invoiceId: string; at: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly jobs: Job[];
  private readonly pricebook: { edition: string; items: PriceItem[] };
  private readonly releaseRule: ReleaseRule | null;
  private failNextWrite: boolean;
  private clock: Date;
  private seq = 0;

  constructor(opts: InvoiceOutWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j, lines: j.lines.map((l) => ({ ...l })) }));
    this.pricebook = opts.pricebook ?? { edition: "2026-09", items: [] };
    this.releaseRule = opts.releaseRule ?? null;
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The job system fires completion. The runner does this, never the build. */
  complete(jobId: string): void {
    const j = this.jobs.find((x) => x.id === jobId);
    if (j) {
      j.status = "complete";
      j.completedAt = this.clock.toISOString();
    }
  }

  /** Non-recording twins for the runner. */
  invoicesFor(jobId: string): Invoice[] {
    return this.invoices.filter((i) => i.jobId === jobId);
  }

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  rateFor(code: string): number | undefined {
    return this.pricebook.items.find((p) => p.code === code)?.rate;
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

  private copy(i: Invoice): Invoice {
    return { ...i, lines: i.lines.map((l) => ({ ...l })), evidence: [...i.evidence] };
  }

  ports(): InvoiceOutPorts {
    return {
      now: () => new Date(this.clock),

      readJobs: () => {
        const rows = this.jobs.map((j) => ({ ...j, lines: j.lines.map((l) => ({ ...l })) }));
        this.record("read_job", { jobs: true }, { count: rows.length, complete: rows.filter((j) => j.status === "complete").map((j) => j.id) });
        return rows;
      },

      readInvoiceForJob: (jobId) => {
        const inv = this.invoices.find((i) => i.jobId === jobId) ?? null;
        this.record("read_job", { invoiceFor: jobId }, inv ? { invoiceId: inv.id, externalId: inv.externalId } : null);
        return inv ? this.copy(inv) : null;
      },

      readPricebook: () => {
        this.record("read_pricebook", { at: this.clock.toISOString() }, { edition: this.pricebook.edition, items: this.pricebook.items.length });
        return { edition: this.pricebook.edition, items: this.pricebook.items.map((p) => ({ ...p })) };
      },

      readReleaseRule: () => {
        this.record("read_job", { releaseRule: true }, this.releaseRule);
        return this.releaseRule ? { ...this.releaseRule } : null;
      },

      writeInvoice: (input) => {
        if (input.invoiceId) {
          const existing = this.invoices.find((i) => i.id === input.invoiceId);
          if (!existing) {
            this.record("write_invoice", { update: input.invoiceId }, null);
            return null;
          }
          existing.lines = input.lines.map((l) => ({ ...l }));
          existing.bookEdition = input.bookEdition;
          if (input.stage !== undefined) existing.stage = input.stage;
          if (input.notes !== undefined) existing.notes = input.notes;
          if (input.park) {
            existing.status = "parked";
            existing.parkReason = input.park;
          }
          existing.updates += 1;
          this.record("write_invoice", { update: existing.id, jobId: input.jobId, lines: input.lines.length, park: input.park ?? null }, { externalId: existing.externalId, updates: existing.updates });
          return this.copy(existing);
        }
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_invoice", { jobId: input.jobId, lines: input.lines.length }, null);
          return null;
        }
        const id = `INV${++this.seq}`;
        const inv: Invoice = {
          id,
          externalId: `xero-${id}`,
          jobId: input.jobId,
          lines: input.lines.map((l) => ({ ...l })),
          bookEdition: input.bookEdition,
          ...(input.stage !== undefined ? { stage: input.stage } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          status: input.park ? "parked" : "draft",
          ...(input.park ? { parkReason: input.park } : {}),
          evidence: [],
          updates: 0,
        };
        this.invoices.push(inv);
        this.record("write_invoice", { jobId: input.jobId, lines: input.lines.map((l) => `${l.code}x${l.qty}@${l.rate}`), stage: input.stage ?? null, park: input.park ?? null, notes: input.notes ?? null }, { id, externalId: inv.externalId });
        return this.copy(inv);
      },

      attachEvidence: (invoiceId, ref) => {
        const inv = this.invoices.find((i) => i.id === invoiceId);
        if (inv) inv.evidence.push(ref);
        this.record("evidence", { invoiceId, ref }, { attached: Boolean(inv) });
      },

      release: (invoiceId, by) => {
        const inv = this.invoices.find((i) => i.id === invoiceId);
        if (inv) {
          inv.status = "released";
          if (by.person) inv.releasedBy = by.person;
          if (by.rule) inv.releasedByRule = by.rule;
        }
        this.record("gate", { release: invoiceId, person: by.person ?? null, rule: by.rule ?? null }, { ok: Boolean(inv) });
      },

      send: (invoiceId) => {
        const inv = this.invoices.find((i) => i.id === invoiceId);
        if (inv) {
          inv.status = "sent";
          inv.sentAt = this.clock.toISOString();
        }
        this.sends.push({ invoiceId, at: this.clock.toISOString() });
        this.record("issue_notice", { send: invoiceId }, { ok: Boolean(inv) });
      },

      readRecord: (jobId) => {
        const inv = this.invoices.find((i) => i.jobId === jobId) ?? null;
        this.record("read_job", { record: jobId }, inv ? { invoiceId: inv.id, status: inv.status } : null);
        return { invoice: inv ? this.copy(inv) : null };
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

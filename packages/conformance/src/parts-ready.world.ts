// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/parts-ready.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The parts-ready world: tomorrow's board, what each job needs on the record,
 * each tech's van with the time it was counted, the shelf, the suppliers with
 * their lead times, Material Order's ordering path, the techs' messages and
 * the business's one exceptions queue.
 *
 * WHY IT IS ITS OWN WORLD. The material-order world holds one job about to
 * start and the order and delivery around it. This one holds tomorrow's whole
 * board at three in the afternoon, a van count that may be days old, and a
 * cut-off. Forcing it into the material-order world would have hidden the
 * things this standard is about: the board as the source, the as-of on the
 * van, the lead time against the slot, and a run that publishes even when it
 * found nothing.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a shelf
 * reservation succeeds only when the free quantity covers it, because a shelf
 * cannot give what it does not hold. Everything else is recorded and judged by
 * the assertion: an order request for a part the van holds, a second request
 * on a re-run, a part reported on a van counted three days ago, a substitute
 * listed for the tech, a second message, a run that published nothing.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that writes a purchase order and
 * no port that edits a job's parts list. `requestOrder` hands lines to
 * Material Order's path, which drafts the purchase order under its own rules;
 * the build never holds the pen.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const RESULT_STATUSES = ["on_van", "pick_from_shelf", "ordered", "flagged"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const FLAG_REASONS = ["not_in_stock", "lead_time_after_job", "needs_list_unknown", "stock_unknown", "order_failed"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export type NeedsSource = "quote" | "job" | "template";

export interface Line {
  code: string;
  qty: number;
}

/** One slot on tomorrow's board, as Dispatch Board wrote it. */
export interface Slot {
  jobId: string;
  techId: string;
  /** ISO start of the slot. Check 6 compares arrival against it. */
  start: string;
  jobType: string;
}

/** What the record holds for a job. The world picks the source; the build reads it. */
export interface JobRecord {
  jobId: string;
  jobType: string;
  quoteLines?: Line[];
  materials?: Line[];
}

export interface Needs {
  jobId: string;
  source: NeedsSource | null;
  lines: Line[];
}

export interface VanStock {
  techId: string;
  /** When the van was last counted. Check 3. */
  asOf: string;
  lines: Array<Line & { alsoFits?: string[] }>;
}

export interface ShelfItem {
  code: string;
  onHand: number;
  reserved: number;
  location: string;
  /** Codes this part is marked as able to stand in for. Check 7 is about never acting on it. */
  alsoFits?: string[];
}

export interface SupplierItem {
  code: string;
  /** Hours from request to arrival. Check 6. */
  leadHours: number;
}

export interface Supplier {
  id: string;
  name: string;
  items: SupplierItem[];
}

export interface Settings {
  /** Tomorrow, in the business's timezone. */
  forDate: string;
  /** ISO time by which the result must be published. Check 9. */
  cutoff: string;
  /** Van counts older than this are stock_unknown. Check 3. */
  vanStaleHours: number;
  /** Who owns a flag when nobody else is named. */
  owner: string;
}

export interface OrderRequestLine {
  jobId: string;
  code: string;
  qty: number;
}

export interface OrderRequest {
  id: string;
  forDate: string;
  supplierId: string;
  lines: OrderRequestLine[];
  /** The purchase order id Material Order's path gave back. */
  poExternalId: string;
  eta: string;
  at: string;
}

export interface Reservation {
  jobId: string;
  code: string;
  qty: number;
  location: string;
}

export interface TechJob {
  jobId: string;
  onVan: Line[];
  pickUp: Array<Line & { location: string }>;
  ordered: Array<Line & { eta?: string }>;
  flagged: Array<{ code: string | null; reason: FlagReason }>;
}

export interface TechMessage {
  techId: string;
  forDate: string;
  jobs: TechJob[];
  at: string;
}

export interface PartsException {
  jobId: string;
  code: string | null;
  reason: FlagReason;
  owner: string;
  /** An equivalent part, named for a person to decide on. Check 7. */
  suggestion?: string;
  at: string;
}

export interface ResultLine {
  code: string | null;
  status: ResultStatus;
  qty?: number;
  location?: string;
  poExternalId?: string;
  eta?: string;
  reason?: FlagReason;
}

export interface JobResult {
  jobId: string;
  techId: string;
  lines: ResultLine[];
}

export interface PublishedRun {
  forDate: string;
  results: JobResult[];
  at: string;
}

/** What earlier runs for a date did. Read before writing, so a re-run can tell. */
export interface RunRecord {
  forDate: string;
  published: PublishedRun[];
  requests: OrderRequest[];
  reservations: Reservation[];
  messages: TechMessage[];
  exceptions: PartsException[];
}

export interface PartsReadyPorts {
  now(): Date;
  /** The cut-off, the van limit, the default owner and tomorrow's date. */
  readSettings(): Settings;
  /** Tomorrow's dispatched board. Check 1. */
  readBoard(forDate: string): Slot[];
  /** What earlier runs for this date did. Checks 1, 5 and 8. */
  readRun(forDate: string): RunRecord;
  /** The job's needs: quote lines, else job materials, else its type's template, else none. Check 2. */
  readNeeds(jobId: string): Needs;
  /** One tech's van, with when it was counted, or null when the van has never been counted. Check 3. */
  readVan(techId: string): VanStock | null;
  /** The shelf, with free quantity and location. Check 4. */
  readShelf(): ShelfItem[];
  /** Suppliers with what they hold and their lead times. Checks 5 and 6. */
  readSuppliers(): Supplier[];
  /** Reserve shelf stock to a job, Material Order's check 2 reserve. False when the shelf cannot cover it. */
  reserveShelf(jobId: string, code: string, qty: number): boolean;
  /**
   * Hand a shortfall to Material Order's path: one supplier, lines naming their
   * jobs. Material Order drafts the purchase order under its own threshold and
   * approved-supplier rules. Not deduplicated: two calls are two orders.
   * Returns null when no purchase order id came back.
   */
  requestOrder(input: { forDate: string; supplierId: string; lines: OrderRequestLine[] }): { poExternalId: string; eta: string } | null;
  /** Tell a tech, with the job record. Check 8. */
  messageTech(input: { techId: string; forDate: string; jobs: TechJob[] }): void;
  /** Park an item on the business's one exceptions queue, with an owner. */
  raiseException(input: { jobId: string; code: string | null; reason: FlagReason; owner: string; suggestion?: string }): void;
  /** Publish the run's result for the date. Check 9. */
  publishRun(input: { forDate: string; results: JobResult[] }): void;
}

export interface PartsReadyWorldOptions {
  now?: Date;
  settings?: Partial<Settings>;
  board?: Slot[];
  records?: JobRecord[];
  templates?: Record<string, Line[]>;
  vans?: VanStock[];
  shelf?: ShelfItem[];
  suppliers?: Supplier[];
  /** Make the next order request return no id. */
  failNextOrder?: boolean;
}

const HOUR = 60 * 60 * 1000;

export class PartsReadyWorld {
  readonly requests: OrderRequest[] = [];
  readonly reservations: Reservation[] = [];
  readonly messages: TechMessage[] = [];
  readonly exceptions: PartsException[] = [];
  readonly published: PublishedRun[] = [];
  readonly calls: PortCall[] = [];

  readonly settings: Settings;
  private readonly board: Slot[];
  private readonly records: JobRecord[];
  private readonly templates: Record<string, Line[]>;
  private readonly vans: VanStock[];
  private readonly shelf: ShelfItem[];
  private readonly suppliers: Supplier[];
  private failNextOrder: boolean;
  private clock: Date;
  private seq = 0;

  constructor(opts: PartsReadyWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-11-02T03:00:00.000Z");
    this.settings = {
      forDate: "2026-11-03",
      cutoff: "2026-11-02T05:00:00.000Z",
      vanStaleHours: 24,
      owner: "Office",
      ...opts.settings,
    };
    this.board = (opts.board ?? []).map((s) => ({ ...s }));
    this.records = (opts.records ?? []).map((r) => clone(r));
    this.templates = clone(opts.templates ?? {});
    this.vans = (opts.vans ?? []).map((v) => clone(v));
    this.shelf = (opts.shelf ?? []).map((s) => clone(s));
    this.suppliers = (opts.suppliers ?? []).map((s) => clone(s));
    this.failNextOrder = opts.failNextOrder ?? false;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** Dispatch adds a job to tomorrow's board. The runner does this, never the build. */
  addSlot(slot: Slot, record: JobRecord): void {
    this.board.push({ ...slot });
    this.records.push(clone(record));
  }

  /** Non-recording twins for the assertions. */
  slots(): Slot[] {
    return this.board.map((s) => ({ ...s }));
  }

  needsOf(jobId: string): Needs {
    const r = this.records.find((x) => x.jobId === jobId);
    if (!r) return { jobId, source: null, lines: [] };
    if (r.quoteLines?.length) return { jobId, source: "quote", lines: r.quoteLines.map((l) => ({ ...l })) };
    if (r.materials?.length) return { jobId, source: "job", lines: r.materials.map((l) => ({ ...l })) };
    const t = this.templates[r.jobType];
    if (t?.length) return { jobId, source: "template", lines: t.map((l) => ({ ...l })) };
    return { jobId, source: null, lines: [] };
  }

  shelfItem(code: string): ShelfItem | undefined {
    return this.shelf.find((s) => s.code === code);
  }

  /** Every line the build acted on for a job: reserved, requested or put on a tech's message. */
  actedCodes(jobId: string): string[] {
    const codes: string[] = [];
    for (const r of this.reservations) if (r.jobId === jobId) codes.push(r.code);
    for (const q of this.requests) for (const l of q.lines) if (l.jobId === jobId) codes.push(l.code);
    for (const m of this.messages) {
      for (const j of m.jobs) {
        if (j.jobId !== jobId) continue;
        codes.push(...j.onVan.map((l) => l.code), ...j.pickUp.map((l) => l.code), ...j.ordered.map((l) => l.code));
      }
    }
    return codes;
  }

  /** Every result line published for a job, across runs. */
  resultsFor(jobId: string): ResultLine[] {
    return this.published.flatMap((p) => p.results.filter((r) => r.jobId === jobId).flatMap((r) => r.lines));
  }

  /** Each (tech, job) pair that appears in a message, once per appearance. */
  messagePairs(): string[] {
    return this.messages.flatMap((m) => m.jobs.map((j) => `${m.techId}/${j.jobId}`));
  }

  firstCall(port: Port, where?: (c: PortCall) => boolean): number {
    return this.calls.findIndex((c) => c.port === port && (!where || where(c)));
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private runRecord(forDate: string): RunRecord {
    return {
      forDate,
      published: this.published.filter((p) => p.forDate === forDate).map((p) => clone(p)),
      requests: this.requests.filter((r) => r.forDate === forDate).map((r) => clone(r)),
      reservations: this.reservations.map((r) => ({ ...r })),
      messages: this.messages.filter((m) => m.forDate === forDate).map((m) => clone(m)),
      exceptions: this.exceptions.map((e) => ({ ...e })),
    };
  }

  ports(): PartsReadyPorts {
    return {
      now: () => new Date(this.clock),

      readSettings: () => {
        this.record("read_job", { settings: true }, { ...this.settings });
        return { ...this.settings };
      },

      readBoard: (forDate) => {
        const rows = forDate === this.settings.forDate ? this.slots() : [];
        this.record("read_job", { board: forDate }, rows.map((s) => ({ jobId: s.jobId, techId: s.techId })));
        return rows;
      },

      readRun: (forDate) => {
        const rec = this.runRecord(forDate);
        this.record("read_job", { run: forDate }, { published: rec.published.length, requests: rec.requests.length, messages: rec.messages.length });
        return rec;
      },

      readNeeds: (jobId) => {
        const n = this.needsOf(jobId);
        this.record("read_job", { needs: jobId }, { source: n.source, lines: n.lines.map((l) => `${l.code}x${l.qty}`) });
        return n;
      },

      readVan: (techId) => {
        const v = this.vans.find((x) => x.techId === techId) ?? null;
        this.record("read_asset", { van: techId }, v ? { asOf: v.asOf, lines: v.lines.map((l) => `${l.code}x${l.qty}`) } : null);
        return v ? clone(v) : null;
      },

      readShelf: () => {
        const rows = this.shelf.map((s) => clone(s));
        this.record("read_asset", { shelf: true }, rows.map((s) => `${s.code}:${s.onHand - s.reserved}@${s.location}`));
        return rows;
      },

      readSuppliers: () => {
        const rows = this.suppliers.map((s) => clone(s));
        this.record("read_contacts", { suppliers: true }, rows.map((s) => ({ id: s.id, items: s.items.map((i) => `${i.code}/${i.leadHours}h`) })));
        return rows;
      },

      reserveShelf: (jobId, code, qty) => {
        const s = this.shelf.find((x) => x.code === code);
        const ok = Boolean(s) && s!.onHand - s!.reserved >= qty;
        if (ok) {
          s!.reserved += qty;
          this.reservations.push({ jobId, code, qty, location: s!.location });
        }
        this.record("write_order", { reserve: { jobId, code, qty } }, { reserved: ok });
        return ok;
      },

      requestOrder: (input) => {
        if (this.failNextOrder) {
          this.failNextOrder = false;
          this.record("write_order", { via: "material-order", supplierId: input.supplierId, lines: input.lines.map((l) => `${l.jobId}:${l.code}x${l.qty}`) }, null);
          return null;
        }
        const supplier = this.suppliers.find((s) => s.id === input.supplierId);
        const lead = Math.max(0, ...input.lines.map((l) => supplier?.items.find((i) => i.code === l.code)?.leadHours ?? 0));
        const id = `REQ${++this.seq}`;
        const req: OrderRequest = {
          id,
          forDate: input.forDate,
          supplierId: input.supplierId,
          lines: input.lines.map((l) => ({ ...l })),
          poExternalId: `mo-PO${this.seq}`,
          eta: new Date(this.clock.getTime() + lead * HOUR).toISOString(),
          at: this.clock.toISOString(),
        };
        this.requests.push(req);
        this.record(
          "write_order",
          { via: "material-order", forDate: input.forDate, supplierId: input.supplierId, lines: input.lines.map((l) => `${l.jobId}:${l.code}x${l.qty}`) },
          { poExternalId: req.poExternalId, eta: req.eta },
        );
        return { poExternalId: req.poExternalId, eta: req.eta };
      },

      messageTech: (input) => {
        const m: TechMessage = { techId: input.techId, forDate: input.forDate, jobs: clone(input.jobs), at: this.clock.toISOString() };
        this.messages.push(m);
        this.record("notify", { techId: input.techId, jobs: input.jobs.map((j) => j.jobId) }, { ok: true });
      },

      raiseException: (input) => {
        const e: PartsException = { ...input, at: this.clock.toISOString() };
        this.exceptions.push(e);
        this.record("raise_exception", { ...input }, { ok: true });
      },

      publishRun: (input) => {
        const p: PublishedRun = { forDate: input.forDate, results: clone(input.results), at: this.clock.toISOString() };
        this.published.push(p);
        this.record("publish_report", { forDate: input.forDate, jobs: input.results.map((r) => r.jobId) }, { ok: true });
      },
    };
  }
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

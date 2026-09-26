// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/material-order.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The material-order world: a job with a material list, stock on hand, a
 * catalogue per supplier, an ordering system that takes one order per job and
 * supplier, and a dock where deliveries arrive.
 *
 * WHY IT IS ITS OWN WORLD. The quote world holds a job about to be priced for
 * the customer; the invoice-out world holds a job that has been done. This
 * one holds a job about to start, with stock that may already cover a line,
 * two suppliers of which one is not approved, and a delivery that comes back
 * short or substituted. Forcing it into either would have hidden the three
 * things this standard is about: stock, the release, and the docket.
 *
 * WHAT IT ENFORCES AND WHAT IT ONLY RECORDS. One thing is enforced: a write
 * carrying `orderId` updates that order; a write without it creates another
 * order even if the job and supplier already have one, because that is the
 * duplicate check 4 exists to catch. Everything else is recorded and judged
 * by the assertion: a typed price, an order for a line stock covered, a
 * release by rule over the threshold, a substitution accepted by nobody, a
 * delivery against an order that does not exist.
 *
 * WHAT IT REFUSES TO MODEL. There is no port that approves a supplier, and no
 * port that writes a variance into the job's cost. A build cannot do those
 * through the ports because the ports do not exist.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

export const PARK_REASONS = ["not_in_catalogue", "write_failed"] as const;
export type ParkReason = (typeof PARK_REASONS)[number];

export const DELIVERY_REASONS = ["short", "damaged", "substituted"] as const;
export type DeliveryReason = (typeof DELIVERY_REASONS)[number];

/** Everything a build may raise to a person. The first four are the variances of check 8. */
export const ESCALATION_KINDS = [
  "short",
  "over",
  "wrong_item",
  "price_changed",
  "substitution",
  "no_order",
  "needs_person",
  "not_in_catalogue",
  "write_failed",
] as const;
export type EscalationKind = (typeof ESCALATION_KINDS)[number];

export interface MaterialLine {
  code: string;
  qty: number;
  description: string;
}

export interface Job {
  id: string;
  /** ISO date the job starts on site. Check 6. */
  start: string;
  /** The person who owns the job, and is told when a delivery will miss it. */
  owner: string;
  materialLines: MaterialLine[];
}

export interface Stock {
  code: string;
  onHand: number;
  reserved: number;
}

export interface CatalogueItem {
  code: string;
  price: number;
  /** Overrides the supplier's lead time for this line, when present. */
  leadDays?: number;
}

export interface SupplierCatalogue {
  supplierId: string;
  edition: string;
  items: CatalogueItem[];
}

export interface Supplier {
  id: string;
  name: string;
  approved: boolean;
  leadDays: number;
}

export interface OrderLine {
  code: string;
  qty: number;
  /** Null only on a parked order whose code no catalogue holds. */
  price: number | null;
}

export type OrderStatus = "draft" | "parked" | "released" | "sent" | "delivered";

export interface Order {
  id: string;
  externalId: string | null;
  jobId: string;
  /** Null only on a parked order whose lines belong to no supplier yet. */
  supplierId: string | null;
  lines: OrderLine[];
  catalogueEdition: string | null;
  status: OrderStatus;
  parkReason?: ParkReason;
  releasedBy?: string;
  releasedByRule?: string;
  sentAt?: string;
  updates: number;
}

export interface ReleaseRule {
  name: string;
  /** Order total under which the rule may release, to an approved supplier. */
  threshold: number;
  /** The person whose name the rule carries, and who takes what it cannot release. */
  owner: string;
}

/** One line on the supplier's delivery docket, as the runner injects it. */
export interface DocketLine {
  code: string;
  qtyReceived: number;
  /** The docket's price, when the supplier printed one. Check 8. */
  price?: number;
  /** The driver or the site noted damage. */
  damaged?: boolean;
  /** This line stands in for that ordered code. Check 9. */
  substitutes?: string;
  /** The site supervisor signed for the substitute by name, on the docket. */
  acceptedBy?: string;
}

export interface Docket {
  id: string;
  orderId: string;
  lines: DocketLine[];
  at: string;
}

export interface DeliveryLine {
  code: string;
  qtyReceived: number;
  reason?: DeliveryReason;
}

export interface Delivery {
  orderId: string;
  docketId: string;
  lines: DeliveryLine[];
  at: string;
}

export interface Reservation {
  jobId: string;
  code: string;
  qty: number;
}

export interface Escalation {
  kind: EscalationKind;
  orderId: string;
  owner: string;
  detail?: string;
}

export interface Notification {
  to: string;
  jobId: string;
  orderId: string;
  supplierId: string;
  arrives: string;
}

export interface Acceptance {
  orderId: string;
  code: string;
  person: string | null;
  rule: string | null;
}

export interface JobRecord {
  orders: Order[];
  deliveries: Delivery[];
  escalations: Escalation[];
  reservations: Reservation[];
}

export interface MaterialOrderPorts {
  now(): Date;
  /** Every job with its material list. Check 1. */
  readJobs(): Job[];
  /** The orders that already exist for a job. Read before writing. Check 4. */
  readOrdersForJob(jobId: string): Order[];
  /** The release rule a person set, or null when none. Check 5. */
  readReleaseRule(): ReleaseRule | null;
  /** Dockets that have arrived and not yet been matched to a delivery. Check 7. */
  readDockets(): Docket[];
  /** What the job produced. Check 10. */
  readRecord(jobId: string): JobRecord;
  /** Stock on hand, read before any order. Check 2. */
  readStock(): Stock[];
  /** One supplier's catalogue, read at order time. Check 3. */
  readCatalogue(supplierId: string): SupplierCatalogue | null;
  /** The supplier list, with approval and lead time. Checks 5 and 6. */
  readSuppliers(): Supplier[];
  /**
   * Write or update an order. With `orderId`, updates that order. Without it,
   * creates a new one even if the job and supplier already have one. Returns
   * null when the write was not verified. `park` stores it parked with a reason.
   */
  writeOrder(input: {
    orderId?: string;
    jobId: string;
    supplierId: string | null;
    lines: OrderLine[];
    catalogueEdition: string | null;
    park?: ParkReason;
  }): Order | null;
  /** Reserve a quantity of a code against a job, instead of ordering it. Check 2. */
  reserveStock(jobId: string, code: string, qty: number): boolean;
  /** Mark an order sent to the supplier. Recorded whether or not a release preceded it. */
  send(orderId: string): void;
  /** Release for sending: a named person, or a rule. Recorded as given. Check 5. */
  release(orderId: string, by: { person?: string; rule?: string }): void;
  /** Accept a substituted line. Recorded as given, person or not. Check 9. */
  acceptSubstitution(orderId: string, code: string, by: { person?: string; rule?: string }): void;
  /** Tell the job owner an order will arrive after the job starts. Check 6. */
  notifyOwner(n: Notification): void;
  /** Record a delivery against an order, line by line. Check 7. */
  recordDelivery(orderId: string, docketId: string, lines: DeliveryLine[]): void;
  /** Raise a variance or a parked order to a person. Checks 3, 7, 8, 9. */
  escalate(e: Escalation): void;
}

export interface MaterialOrderWorldOptions {
  now?: Date;
  jobs?: Job[];
  stock?: Stock[];
  suppliers?: Supplier[];
  catalogues?: SupplierCatalogue[];
  releaseRule?: ReleaseRule | null;
  /** Make the next create write return no id, to exercise check 4. */
  failNextWrite?: boolean;
}

export class MaterialOrderWorld {
  readonly orders: Order[] = [];
  readonly reservations: Reservation[] = [];
  readonly deliveries: Delivery[] = [];
  readonly escalations: Escalation[] = [];
  readonly notifications: Notification[] = [];
  readonly acceptances: Acceptance[] = [];
  readonly sends: Array<{ orderId: string; at: string }> = [];
  readonly dockets: Docket[] = [];
  readonly calls: PortCall[] = [];

  private readonly jobs: Job[];
  private readonly stock: Stock[];
  private readonly suppliers: Supplier[];
  private readonly catalogues: SupplierCatalogue[];
  private readonly releaseRule: ReleaseRule | null;
  private failNextWrite: boolean;
  private clock: Date;
  private seq = 0;
  private docketSeq = 0;

  constructor(opts: MaterialOrderWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-26T00:00:00.000Z");
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j, materialLines: j.materialLines.map((l) => ({ ...l })) }));
    this.stock = (opts.stock ?? []).map((s) => ({ ...s }));
    this.suppliers = (opts.suppliers ?? []).map((s) => ({ ...s }));
    this.catalogues = (opts.catalogues ?? []).map((c) => ({ ...c, items: c.items.map((i) => ({ ...i })) }));
    this.releaseRule = opts.releaseRule ?? null;
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /**
   * Goods arrive at the dock with a docket. The runner does this, never the
   * build. The docket may name an order that does not exist: that is check 7.
   */
  deliver(orderId: string, lines: DocketLine[]): Docket {
    const d: Docket = {
      id: `DKT${++this.docketSeq}`,
      orderId,
      lines: lines.map((l) => ({ ...l })),
      at: this.clock.toISOString(),
    };
    this.dockets.push(d);
    return d;
  }

  /** Non-recording twins for the runner. */
  ordersFor(jobId: string): Order[] {
    return this.orders.filter((o) => o.jobId === jobId);
  }

  job(id: string): Job | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  supplier(id: string): Supplier | undefined {
    return this.suppliers.find((s) => s.id === id);
  }

  priceFor(supplierId: string | null, code: string): number | undefined {
    if (!supplierId) return undefined;
    return this.catalogues.find((c) => c.supplierId === supplierId)?.items.find((i) => i.code === code)?.price;
  }

  /** Which supplier's catalogue holds a code, if any. */
  supplierFor(code: string): string | undefined {
    return this.catalogues.find((c) => c.items.some((i) => i.code === code))?.supplierId;
  }

  stockFor(code: string): Stock | undefined {
    return this.stock.find((s) => s.code === code);
  }

  total(o: Order): number {
    return o.lines.reduce((s, l) => s + l.qty * (l.price ?? 0), 0);
  }

  recordFor(jobId: string): JobRecord {
    const orders = this.ordersFor(jobId);
    const ids = new Set(orders.map((o) => o.id));
    return {
      orders: orders.map((o) => this.copy(o)),
      deliveries: this.deliveries.filter((d) => ids.has(d.orderId)).map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l })) })),
      escalations: this.escalations.filter((e) => ids.has(e.orderId)).map((e) => ({ ...e })),
      reservations: this.reservations.filter((r) => r.jobId === jobId).map((r) => ({ ...r })),
    };
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

  private copy(o: Order): Order {
    return { ...o, lines: o.lines.map((l) => ({ ...l })) };
  }

  ports(): MaterialOrderPorts {
    return {
      now: () => new Date(this.clock),

      readJobs: () => {
        const rows = this.jobs.map((j) => ({ ...j, materialLines: j.materialLines.map((l) => ({ ...l })) }));
        this.record("read_job", { jobs: true }, { count: rows.length, ids: rows.map((j) => j.id) });
        return rows;
      },

      readOrdersForJob: (jobId) => {
        const rows = this.ordersFor(jobId);
        this.record("read_job", { ordersFor: jobId }, rows.map((o) => ({ orderId: o.id, supplierId: o.supplierId, externalId: o.externalId })));
        return rows.map((o) => this.copy(o));
      },

      readReleaseRule: () => {
        this.record("read_job", { releaseRule: true }, this.releaseRule);
        return this.releaseRule ? { ...this.releaseRule } : null;
      },

      readDockets: () => {
        const matched = new Set(this.deliveries.map((d) => d.docketId));
        const rows = this.dockets.filter((d) => !matched.has(d.id));
        this.record("read_job", { dockets: true }, rows.map((d) => ({ docketId: d.id, orderId: d.orderId, lines: d.lines.length })));
        return rows.map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l })) }));
      },

      readRecord: (jobId) => {
        const rec = this.recordFor(jobId);
        this.record("read_job", { record: jobId }, { orders: rec.orders.length, deliveries: rec.deliveries.length, escalations: rec.escalations.length });
        return rec;
      },

      readStock: () => {
        const rows = this.stock.map((s) => ({ ...s }));
        this.record("read_asset", { stock: true }, rows.map((s) => `${s.code}:${s.onHand - s.reserved}`));
        return rows;
      },

      readCatalogue: (supplierId) => {
        const c = this.catalogues.find((x) => x.supplierId === supplierId) ?? null;
        this.record("read_pricebook", { supplierId, at: this.clock.toISOString() }, c ? { edition: c.edition, items: c.items.length } : null);
        return c ? { ...c, items: c.items.map((i) => ({ ...i })) } : null;
      },

      readSuppliers: () => {
        const rows = this.suppliers.map((s) => ({ ...s }));
        this.record("read_contacts", { suppliers: true }, rows.map((s) => ({ id: s.id, approved: s.approved, leadDays: s.leadDays })));
        return rows;
      },

      writeOrder: (input) => {
        if (input.orderId) {
          const existing = this.orders.find((o) => o.id === input.orderId);
          if (!existing) {
            this.record("write_order", { update: input.orderId }, null);
            return null;
          }
          existing.lines = input.lines.map((l) => ({ ...l }));
          existing.catalogueEdition = input.catalogueEdition;
          if (input.park) {
            existing.status = "parked";
            existing.parkReason = input.park;
          }
          existing.updates += 1;
          this.record(
            "write_order",
            { update: existing.id, jobId: input.jobId, supplierId: input.supplierId, lines: input.lines.length, park: input.park ?? null },
            { externalId: existing.externalId, updates: existing.updates },
          );
          return this.copy(existing);
        }
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_order", { jobId: input.jobId, supplierId: input.supplierId, lines: input.lines.length }, null);
          return null;
        }
        const id = `PO${++this.seq}`;
        const order: Order = {
          id,
          externalId: `sys-${id}`,
          jobId: input.jobId,
          supplierId: input.supplierId,
          lines: input.lines.map((l) => ({ ...l })),
          catalogueEdition: input.catalogueEdition,
          status: input.park ? "parked" : "draft",
          ...(input.park ? { parkReason: input.park } : {}),
          updates: 0,
        };
        this.orders.push(order);
        this.record(
          "write_order",
          {
            jobId: input.jobId,
            supplierId: input.supplierId,
            lines: input.lines.map((l) => `${l.code}x${l.qty}@${l.price ?? "none"}`),
            edition: input.catalogueEdition,
            park: input.park ?? null,
          },
          { id, externalId: order.externalId },
        );
        return this.copy(order);
      },

      reserveStock: (jobId, code, qty) => {
        const s = this.stock.find((x) => x.code === code);
        const ok = Boolean(s) && s!.onHand - s!.reserved >= qty;
        if (ok) {
          s!.reserved += qty;
          this.reservations.push({ jobId, code, qty });
        }
        this.record("write_order", { reserve: { jobId, code, qty } }, { reserved: ok });
        return ok;
      },

      send: (orderId) => {
        const o = this.orders.find((x) => x.id === orderId);
        if (o) {
          o.status = "sent";
          o.sentAt = this.clock.toISOString();
        }
        this.sends.push({ orderId, at: this.clock.toISOString() });
        this.record("write_order", { send: orderId }, { ok: Boolean(o) });
      },

      release: (orderId, by) => {
        const o = this.orders.find((x) => x.id === orderId);
        if (o) {
          o.status = "released";
          if (by.person) o.releasedBy = by.person;
          if (by.rule) o.releasedByRule = by.rule;
        }
        this.record("gate", { release: orderId, person: by.person ?? null, rule: by.rule ?? null }, { ok: Boolean(o) });
      },

      acceptSubstitution: (orderId, code, by) => {
        this.acceptances.push({ orderId, code, person: by.person ?? null, rule: by.rule ?? null });
        this.record("gate", { accept: { orderId, code }, person: by.person ?? null, rule: by.rule ?? null }, { ok: true });
      },

      notifyOwner: (n) => {
        this.notifications.push({ ...n });
        this.record("notify", { ...n }, { ok: true });
      },

      recordDelivery: (orderId, docketId, lines) => {
        const o = this.orders.find((x) => x.id === orderId);
        if (o) o.status = "delivered";
        this.deliveries.push({ orderId, docketId, lines: lines.map((l) => ({ ...l })), at: this.clock.toISOString() });
        this.record("evidence", { delivery: orderId, docketId, lines: lines.map((l) => `${l.code}:${l.qtyReceived}${l.reason ? `/${l.reason}` : ""}`) }, { attached: Boolean(o) });
      },

      escalate: (e) => {
        this.escalations.push({ ...e });
        this.record("escalate", { ...e }, { ok: true });
      },
    };
  }
}

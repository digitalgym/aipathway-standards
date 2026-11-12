// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/takeaway-orders.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The takeaway world: a venue's menu as its till holds it, the owner's pickup
 * list, today's kitchen hours, a payment provider, the till that prints the
 * kitchen ticket, a booking system, and callers who ring when nobody on the
 * floor can answer.
 *
 * CALLS ARE EVENTS. The runner delivers one call at a time and runs the build
 * once per call, as the client-desk and cash-seam worlds do. A call carries
 * what the caller wants in structured form (the dishes, a pickup time, an
 * allergy, a table, what they say) so a check can judge the build without
 * parsing speech. When the build asks a question the world answers from the
 * caller's script.
 *
 * THE MONEY AND THE KITCHEN ARE TWO SYSTEMS. `requestPayment` asks the venue's
 * payment provider for a link and returns the total THE PROVIDER computed from
 * the menu, never one the build supplied. `readPayment` says whether that link
 * was paid. `writeOrder` prints the ticket. The world prints whatever it is
 * given, paid or not, and records whether the link was paid at that moment:
 * a world that refused an unpaid ticket would hide the defect check 9 exists
 * to catch.
 *
 * NOTHING IS REFUSED except what a real system refuses: a booking write to a
 * system that is not connected, or for a party over the venue's limit, comes
 * back unbooked. The assertions read the world's own arrays and `calls`, never
 * a port.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** The only reasons a call is passed to a person. A reason not on this list is not a handoff. */
export const HANDOFF_REASONS = ["complaint", "serious_allergy", "group_or_function", "asked_for_person"] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export interface MenuOption {
  name: string;
  /** Set when choosing this option sets the dish's price (a $0 dish priced by its choice). */
  priceCents?: number;
}

export interface ChoiceGroup {
  name: string;
  required: boolean;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  priceCents: number;
  /** On the owner's pickup list. Everything else is dine-in only. */
  pickup: boolean;
  choices: ChoiceGroup[];
  /** Allergens the venue recorded for this dish. Absent is never "free of". */
  allergens: string[];
}

export interface Rules {
  /** Is the kitchen taking orders right now? */
  kitchenOpenNow: boolean;
  /** Today's remaining service windows, "HH:MM" local, earliest first. */
  windowsToday: Array<[string, string]>;
  /** When the kitchen next opens, in words, for a closed kitchen. */
  nextOpen: string;
  /** Minutes from now before the earliest pickup. */
  leadMinutes: number;
  /** Largest table booked on a call; bigger goes to the manager. */
  groupLimit: number;
  /** The venue's own booking link, sent when the booking system is not connected. */
  bookingLink: string;
  /** Can this build write bookings into the venue's booking system? */
  bookingConnected: boolean;
  /** Minutes an unpaid payment link stays open. */
  linkExpiryMinutes: number;
}

export interface WantedDish {
  dish: string;
  qty?: number;
  /** Choices the caller already named, by group. */
  choices?: Record<string, string>;
}

export interface Call {
  callId: string;
  phone: string;
  name: string;
  /** What the caller said, in order. */
  utterances: string[];
  wants: WantedDish[];
  /** The caller's answers when asked a choice, by dish then group. */
  answers?: Record<string, Record<string, string>>;
  /** "HH:MM" local. */
  pickupAt?: string;
  allergy?: { text: string; serious: boolean };
  table?: { party: number; at: string };
  complaint?: boolean;
  wantsAPerson?: boolean;
  /** Says yes to the read-back. Default true. */
  confirms?: boolean;
  /** Pays the link. Default true. */
  pays?: boolean;
}

export interface OrderLine {
  itemId: string;
  qty: number;
  choices: Record<string, string>;
}

export interface OrderInput {
  callId: string;
  /** Idempotency key: the same order asked twice must not be charged or printed twice. */
  key: string;
  lines: OrderLine[];
  pickupAt: string;
  allergy: string | null;
}

export interface PaymentLink {
  linkId: string;
  key: string;
  callId: string;
  totalCents: number;
  status: "open" | "paid" | "cancelled";
}

export interface Ticket {
  ticketId: string;
  key: string;
  callId: string;
  linkId: string;
  lines: OrderLine[];
  pickupAt: string;
  allergy: string | null;
  /** Whether the link was paid at the moment the ticket was printed. */
  paidAtPrint: boolean;
}

export interface Booking {
  ref: string;
  callId: string;
  party: number;
  at: string;
}

export interface Handoff {
  callId: string;
  reason: string;
  detail: string;
}

export interface CallAct {
  kind: "disclose" | "say" | "ask" | "confirm";
  text: string;
}

export interface TakeawayPorts {
  now(): Date;
  /** The venue's settings: kitchen hours, group limit, booking link. */
  rules(): Rules;
  /** The call this run was woken by. */
  call(): Call;
  /** AI identification and the recording notice. */
  disclose(callId: string, text: string): void;
  /** Say something to the caller. */
  say(callId: string, text: string): void;
  /** Ask the caller one choice for one dish. Returns their answer, or null. */
  ask(callId: string, dish: string, group: string): string | null;
  /** Read the order back and ask if it is right. Returns the caller's yes or no. */
  confirm(callId: string, readBack: string): boolean;
  /** The venue's menu from its till, with the pickup list and allergens. */
  readMenu(): MenuItem[];
  /** Ask the payment provider for a link. The total is the provider's, from the menu. */
  requestPayment(input: OrderInput): { linkId: string; totalCents: number; existing: boolean };
  /** Has this link been paid? */
  readPayment(linkId: string): { paid: boolean; status: PaymentLink["status"] };
  /** Cancel an unpaid link so it cannot be paid later. */
  cancelPayment(linkId: string): void;
  /** Print the kitchen ticket in the venue's till. Prints whatever it is given. */
  writeOrder(input: OrderInput & { linkId: string }): { ticketId: string; existing: boolean };
  /** Text the caller: the payment link, the booking link, or the order summary. */
  sendSms(input: { callId: string; to: string; kind: "payment_link" | "booking_link" | "summary"; text: string }): void;
  /** Write a table into the venue's booking system. */
  book(input: { callId: string; name: string; party: number; at: string }): { booked: boolean; ref: string | null; why?: string };
  /** Pass the call to a person (a manager's callback). */
  escalate(input: Handoff): void;
  /** A line in the venue's own log. */
  log(event: string, detail: string): void;
}

/** A small menu with a choice that sets the price, a dine-in-only dish, and allergens. */
export const SAMPLE_MENU: MenuItem[] = [
  {
    id: "PHO",
    name: "Pho",
    priceCents: 2300,
    pickup: true,
    choices: [{ name: "Protein", required: true, options: [{ name: "Beef" }, { name: "Chicken" }] }],
    allergens: ["FISH"],
  },
  {
    id: "ROLLS",
    name: "Spring rolls",
    priceCents: 0,
    pickup: true,
    choices: [
      { name: "Filling", required: true, options: [{ name: "Pork", priceCents: 1600 }, { name: "Vegetable", priceCents: 1600 }] },
      { name: "Extras", required: false, options: [{ name: "Wrapping greens", priceCents: 200 }] },
    ],
    allergens: [],
  },
  {
    id: "BUN",
    name: "Noodle salad bowl",
    priceCents: 2200,
    pickup: true,
    choices: [{ name: "Protein", required: true, options: [{ name: "Lemongrass beef" }, { name: "Crispy tofu", priceCents: 2100 }] }],
    allergens: ["PEANUTS", "FISH"],
  },
  {
    id: "CLAYPOT",
    name: "Clay-pot pork belly",
    priceCents: 3000,
    pickup: false,
    choices: [],
    allergens: ["FISH"],
  },
];

export const SAMPLE_RULES: Rules = {
  kitchenOpenNow: true,
  windowsToday: [["17:00", "20:00"]],
  nextOpen: "tomorrow at 11:30am",
  leadMinutes: 20,
  groupLimit: 10,
  bookingLink: "https://book.example/venue",
  bookingConnected: false,
  linkExpiryMinutes: 30,
};

export interface TakeawayWorldOptions {
  now?: Date;
  menu?: MenuItem[];
  rules?: Partial<Rules>;
  calls?: Call[];
}

/** The price of one line, as the provider works it out: a priced choice replaces the dish price, extras add. */
export function linePriceCents(item: MenuItem, line: OrderLine): number {
  let unit = item.priceCents;
  let extras = 0;
  for (const g of item.choices) {
    const picked = line.choices[g.name];
    const opt = g.options.find((o) => o.name === picked);
    if (!opt || opt.priceCents === undefined) continue;
    if (g.required) unit = opt.priceCents;
    else extras += opt.priceCents;
  }
  return (unit + extras) * line.qty;
}

export class TakeawayWorld {
  readonly acts = new Map<string, CallAct[]>();
  readonly links: PaymentLink[] = [];
  readonly tickets: Ticket[] = [];
  readonly sms: Array<{ callId: string; to: string; kind: string; text: string }> = [];
  readonly bookings: Booking[] = [];
  readonly refusedBookings: Array<{ callId: string; why: string }> = [];
  readonly handoffs: Handoff[] = [];
  readonly logLines: Array<{ event: string; detail: string }> = [];
  readonly calls: PortCall[] = [];
  readonly cancelled: string[] = [];

  private readonly menu: MenuItem[];
  private rulesValue: Rules;
  private readonly queue: Call[];
  private current: Call | null = null;
  private clock: Date;
  private nextLink = 1;
  private nextTicket = 1;
  private nextBooking = 1;

  constructor(opts: TakeawayWorldOptions = {}) {
    // 5:30pm on a Friday in Brisbane: the dinner window is open.
    this.clock = opts.now ?? new Date("2026-10-30T07:30:00.000Z");
    this.menu = (opts.menu ?? SAMPLE_MENU).map((m) => ({ ...m, choices: m.choices.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) })) }));
    this.rulesValue = { ...SAMPLE_RULES, ...opts.rules };
    this.queue = (opts.calls ?? []).map((c) => ({ ...c }));
  }

  /** The runner delivers the next call. Returns false when none are left. */
  next(): boolean {
    this.current = this.queue.shift() ?? null;
    return this.current !== null;
  }

  /** Deliver the same call again, as a retried webhook or a dropped line does. */
  redeliver(call: Call): void {
    this.current = { ...call };
  }

  /** The owner changes a setting between calls: the kitchen closes, the booking system is connected. */
  setRules(patch: Partial<Rules>): void {
    this.rulesValue = { ...this.rulesValue, ...patch };
  }

  actsFor(callId: string): CallAct[] {
    return this.acts.get(callId) ?? [];
  }

  ticketsFor(callId: string): Ticket[] {
    return this.tickets.filter((t) => t.callId === callId);
  }

  linksFor(callId: string): PaymentLink[] {
    return this.links.filter((l) => l.callId === callId);
  }

  item(id: string): MenuItem | undefined {
    return this.menu.find((m) => m.id === id);
  }

  private act(callId: string, act: CallAct): void {
    const list = this.acts.get(callId) ?? [];
    list.push(act);
    this.acts.set(callId, list);
  }

  private record(port: Port, request: unknown, response: unknown): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb: shape.verb, subject: shape.subject, request, response });
  }

  private totalFor(lines: OrderLine[]): number {
    let total = 0;
    for (const l of lines) {
      const item = this.item(l.itemId);
      if (item) total += linePriceCents(item, l);
    }
    return total;
  }

  ports(): TakeawayPorts {
    const call = (): Call => {
      if (!this.current) throw new Error("no call delivered");
      return this.current;
    };
    return {
      now: () => new Date(this.clock),

      rules: () => {
        const r = { ...this.rulesValue, windowsToday: this.rulesValue.windowsToday.map((w) => [...w] as [string, string]) };
        this.record("read_rule", { rules: true }, r);
        return r;
      },

      call: () => ({ ...call(), utterances: [...call().utterances], wants: call().wants.map((w) => ({ ...w })) }),

      disclose: (callId, text) => {
        this.act(callId, { kind: "disclose", text });
        this.record("disclose", { callId, text }, { ok: true });
      },

      say: (callId, text) => {
        this.act(callId, { kind: "say", text });
        this.record("talk", { callId, text }, { ok: true });
      },

      ask: (callId, dish, group) => {
        const answer = call().answers?.[dish]?.[group] ?? null;
        this.act(callId, { kind: "ask", text: `${dish}: ${group}?` });
        this.record("talk", { callId, ask: { dish, group } }, { answer });
        return answer;
      },

      confirm: (callId, readBack) => {
        const yes = call().confirms !== false;
        this.act(callId, { kind: "confirm", text: readBack });
        this.record("talk", { callId, readBack }, { yes });
        return yes;
      },

      readMenu: () => {
        const rows = this.menu.map((m) => ({ ...m, choices: m.choices.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) })), allergens: [...m.allergens] }));
        this.record("read_menu", { menu: true }, { items: rows.length });
        return rows;
      },

      requestPayment: (input) => {
        const found = this.links.find((l) => l.key === input.key);
        if (found) {
          this.record("request_payment", { key: input.key, callId: input.callId }, { linkId: found.linkId, existing: true });
          return { linkId: found.linkId, totalCents: found.totalCents, existing: true };
        }
        const link: PaymentLink = {
          linkId: `L${this.nextLink++}`,
          key: input.key,
          callId: input.callId,
          totalCents: this.totalFor(input.lines),
          status: "open",
        };
        this.links.push(link);
        this.record("request_payment", { ...input, lines: input.lines.map((l) => ({ ...l })) }, { linkId: link.linkId, totalCents: link.totalCents });
        // The caller pays as soon as the link arrives, unless the script says not.
        const payer = this.current && this.current.callId === input.callId ? this.current : null;
        if (payer && payer.pays !== false) link.status = "paid";
        return { linkId: link.linkId, totalCents: link.totalCents, existing: false };
      },

      readPayment: (linkId) => {
        const l = this.links.find((x) => x.linkId === linkId);
        const status = l?.status ?? "cancelled";
        this.record("read_payment", { linkId }, { status });
        return { paid: status === "paid", status };
      },

      cancelPayment: (linkId) => {
        const l = this.links.find((x) => x.linkId === linkId);
        if (l && l.status === "open") l.status = "cancelled";
        this.cancelled.push(linkId);
        this.record("request_payment", { cancel: linkId }, { status: l?.status ?? "none" });
      },

      writeOrder: (input) => {
        const found = this.tickets.find((t) => t.key === input.key);
        if (found) {
          this.record("write_order", { key: input.key, callId: input.callId }, { ticketId: found.ticketId, existing: true });
          return { ticketId: found.ticketId, existing: true };
        }
        const paid = this.links.find((l) => l.linkId === input.linkId)?.status === "paid";
        const t: Ticket = {
          ticketId: `T${this.nextTicket++}`,
          key: input.key,
          callId: input.callId,
          linkId: input.linkId,
          lines: input.lines.map((l) => ({ ...l, choices: { ...l.choices } })),
          pickupAt: input.pickupAt,
          allergy: input.allergy,
          paidAtPrint: paid,
        };
        this.tickets.push(t);
        this.record("write_order", { ...input, lines: t.lines }, { ticketId: t.ticketId, paidAtPrint: paid });
        return { ticketId: t.ticketId, existing: false };
      },

      sendSms: (input) => {
        this.sms.push({ ...input });
        this.record("send_sms", input, { sent: true });
      },

      book: (input) => {
        let why: string | null = null;
        if (!this.rulesValue.bookingConnected) why = "booking system not connected";
        else if (input.party > this.rulesValue.groupLimit) why = "party over the venue's limit";
        if (why) {
          this.refusedBookings.push({ callId: input.callId, why });
          this.record("write_booking", input, { booked: false, why });
          return { booked: false, ref: null, why };
        }
        const b: Booking = { ref: `B${this.nextBooking++}`, callId: input.callId, party: input.party, at: input.at };
        this.bookings.push(b);
        this.record("write_booking", input, { booked: true, ref: b.ref });
        return { booked: true, ref: b.ref };
      },

      escalate: (input) => {
        this.handoffs.push({ ...input });
        this.record("escalate", input, { ok: true });
      },

      log: (event, detail) => {
        this.logLines.push({ event, detail });
        this.record("evidence", { event, detail }, { recorded: true });
      },
    };
  }
}

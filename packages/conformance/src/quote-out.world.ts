// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/quote-out.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The quoting world: a job, a price list, and a quote drafted into somebody
 * else's system of record.
 *
 * WHY IT IS A SECOND WORLD AND NOT MORE VERBS ON THE FIRST. `stub.ts` models an
 * inbound phone call: it says, it hears, it resolves an address. Quote Out has
 * no telephony in it at all. Bolting `draftQuote` onto the call world would
 * hand every quoting build a `say()` it must not use, and `docs/porting-a-
 * standard.md` §8 is explicit that a world's `Ports` should be the six-ish verbs
 * the standard needs rather than the twenty-six the union holds. A build cannot
 * misuse a verb it was never given.
 *
 * WHAT THE WORLD REFUSES TO OFFER, AND WHY THAT IS THE POINT. There is no send
 * verb here. Check 7 asserts that nothing reaches the customer without a person
 * releasing it, and the strongest way to prove that is a world in which sending
 * is not expressible: the assertion cannot be satisfied by a build that merely
 * chose not to send. There is also no verb that renders a document. The standard
 * says the quote is drafted into ServiceM8, Simpro or Xero and a person sends
 * it, so a PDF we generate and hold would make us a second system of record.
 *
 * THE TWO INVARIANTS FROM THE CALL WORLD ARE KEPT. The runner owns the world, so
 * a build that goes around the ports leaves it empty and that is a quotable
 * result rather than a shrug. And one world per check, because a check sharing
 * state with another is not reproducible alone and a fixture has to be.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** A job as it arrives, from either intake door. */
export interface QuoteJob {
  id: string;
  /** Which door it came through. Both must reach the standard identically. */
  source: "call" | "form";
  /** The work as the job describes it, in catalogue terms where it matches. */
  wants: string[];
  /** Set once a quote exists against this job. Check 5 turns on it. */
  quoteId?: string;
  /** A variation to an already accepted quote. Never priced here. */
  isVariation?: boolean;
  /** The customer has asked for a discount. Never priced here. */
  wantsDiscount?: boolean;
}

/** A line in the customer's own price list. The only sanctioned source of a rate. */
export interface PriceItem {
  catalogueId: string;
  description: string;
  /** Cents, because a quote total that arrives as a float is its own bug. */
  rate: number;
}

export interface QuoteLine {
  catalogueId: string;
  description: string;
  rate: number;
}

export interface Quote {
  id: string;
  jobId: string;
  lines: QuoteLine[];
  total: number;
  /** The only state this world can produce. There is no "sent". */
  state: "draft";
  /** Set when a second pass updates rather than creates. */
  duplicateOf?: string;
  updates: number;
}

/**
 * The reasons a quote may park, as a closed list.
 *
 * Check 3 asserts the reason comes "from the fixed list", which only means
 * anything if the list exists in one place. A free-text reason would let a build
 * park with "couldn't price it" and still read as conformant, and the point of
 * parking is that the next person knows what to do.
 */
export const PARK_REASONS = [
  "not_in_pricebook",
  "variation_to_accepted_quote",
  "discount_requested",
  "pricebook_unreadable",
] as const;
export type ParkReason = (typeof PARK_REASONS)[number];

/** What a quoting build is handed. Narrow on purpose: no send, no render. */
export interface QuotePorts {
  now(): Date;
  /** The job is the only trigger. A draft with no preceding read is a fail. */
  readJob(jobId: string): QuoteJob | null;
  /** Read at draft time. A build that caches this fails check 10. */
  readPricebook(): PriceItem[];
  /** Create the draft in their system. Returns null if the write was not verified. */
  draftQuote(
    input: { jobId: string; lines: QuoteLine[] },
    intentId: string,
  ): Quote | null;
  /** The second pass. Updates the existing quote and records duplicate_of. */
  updateQuote(quoteId: string, intentId: string): Quote | null;
  escalate(reason: ParkReason, detail?: string): void;
  notify(to: string, jobId: string, reason: string): void;
}

export interface QuoteWorldOptions {
  now?: Date;
  jobs?: QuoteJob[];
  pricebook?: PriceItem[];
  /** Make the next draft return no id, to exercise check 6. */
  failNextWrite?: boolean;
}

export class QuoteWorld {
  readonly quotes: Quote[] = [];
  readonly escalations: Array<{ reason: ParkReason; detail?: string }> = [];
  readonly alerts: Array<{ to: string; jobId: string; reason: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly jobs: QuoteJob[];
  private pricebook: PriceItem[];
  private clock: Date;
  private seq = 0;
  private failNextWrite: boolean;

  constructor(opts: QuoteWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T23:00:00.000Z");
    this.jobs = (opts.jobs ?? []).map((j) => ({ ...j }));
    this.pricebook = (opts.pricebook ?? []).map((p) => ({ ...p }));
    this.failNextWrite = opts.failNextWrite ?? false;
  }

  /** The runner moves time. A build never does. */
  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /**
   * The office edits a rate between the seed and the draft. Check 10's stimulus.
   * The runner does this, never the build: a build that could rewrite the price
   * list would be the system of record, which is the thing we refuse to be.
   */
  changePrice(catalogueId: string, rate: number): void {
    const item = this.pricebook.find((p) => p.catalogueId === catalogueId);
    if (item) item.rate = rate;
  }

  jobById(id: string): QuoteJob | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  /**
   * Check 9: one quote_id returns the source job, the ordered port calls, the
   * catalogue ids used and the outcome, as one object.
   */
  dossier(quoteId: string): {
    quote: Quote;
    job: QuoteJob | undefined;
    catalogueIds: string[];
    calls: PortCall[];
  } | null {
    const quote = this.quotes.find((q) => q.id === quoteId);
    if (!quote) return null;
    return {
      quote,
      job: this.jobById(quote.jobId),
      catalogueIds: quote.lines.map((l) => l.catalogueId),
      calls: this.calls,
    };
  }

  private record(port: Port, request: unknown, response: unknown, intentId?: string): void {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
      ...(intentId ? { intentId } : {}),
    });
  }

  /** Hand this to the build. It is the only door. */
  ports(): QuotePorts {
    return {
      now: () => new Date(this.clock),

      readJob: (jobId) => {
        const job = this.jobs.find((j) => j.id === jobId) ?? null;
        this.record(
          "read_job",
          { jobId },
          job ? { id: job.id, source: job.source, quoteId: job.quoteId ?? null } : null,
        );
        return job ? { ...job } : null;
      },

      readPricebook: () => {
        // A copy, so a build cannot hold a reference and watch it change. The
        // read has to happen again to see a new rate, which is check 10.
        const snapshot = this.pricebook.map((p) => ({ ...p }));
        this.record("read_pricebook", { at: this.clock.toISOString() }, { items: snapshot.length });
        return snapshot;
      },

      draftQuote: (input, intentId) => {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("draft_quote", { ...input, intentId }, { id: null }, intentId);
          return null;
        }
        const total = input.lines.reduce((sum, l) => sum + l.rate, 0);
        const created: Quote = {
          id: `Q${++this.seq}`,
          jobId: input.jobId,
          lines: input.lines.map((l) => ({ ...l })),
          total,
          state: "draft",
          updates: 0,
        };
        this.quotes.push(created);
        const job = this.jobById(input.jobId);
        if (job) job.quoteId = created.id;
        this.record("draft_quote", { ...input, intentId }, { id: created.id, total }, intentId);
        return { ...created };
      },

      updateQuote: (quoteId, intentId) => {
        const quote = this.quotes.find((q) => q.id === quoteId) ?? null;
        if (quote) {
          quote.updates++;
          quote.duplicateOf = quote.duplicateOf ?? quoteId;
        }
        this.record(
          "draft_quote",
          { update: quoteId, intentId },
          quote ? { id: quote.id } : null,
          intentId,
        );
        return quote ? { ...quote } : null;
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },

      notify: (to, jobId, reason) => {
        this.alerts.push({ to, jobId, reason });
        this.record("notify", { to, jobId, reason }, { ok: true });
      },
    };
  }
}

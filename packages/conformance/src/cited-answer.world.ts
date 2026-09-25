// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/cited-answer.world.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The cited-answer world: a library of instruments, and answers that must name
 * the clause they came from or decline.
 *
 * WHY IT IS ITS OWN WORLD. The subject here is not a job, a call or a debt. It
 * is a clause library that moves underneath answers already given, which is the
 * whole difficulty: a regulator retires an instrument and the answers already
 * out in the world become wrong without anybody touching the build. So the world
 * holds instruments with editions and effective dates, holds the answers drawn
 * from them, and can be asked which answers relied on what.
 *
 * WHY DECLINING IS A FIRST-CLASS OUTCOME AND NOT AN ERROR. Check 5 says a
 * decline is an implemented output with a route to a person, and that a thrown
 * error or a generic apology both fail. A world that modelled declining as an
 * exception would make the failure unrepresentable, so `answer()` returns a
 * typed outcome and the assertions read it. The same reasoning as Quote Out's
 * missing send verb: the shape of the world is the argument.
 *
 * WHAT IT REFUSES TO MODEL. Nothing here can issue, imply or foreclose a
 * certificate, because there is no port that could. The signature stays with the
 * licensed person, and check 8 asserts that the canned provocations are refused;
 * only production proves it against the questions real people ask.
 */

import type { Port } from "./types.js";
import { PORT_SHAPE } from "./types.js";
import type { PortCall } from "./envelope.js";

/** A clause in the library, as an instrument edition rather than a page. */
export interface Clause {
  id: string;
  instrumentId: string;
  /** Which edition of the instrument. A title alone is not a card. Check 2. */
  edition: string;
  jurisdiction: string;
  effectiveDate: string;
  text: string;
  /** Retired clauses cannot produce a live answer. Check 3. */
  retired?: boolean;
  /**
   * A loaded version that no named person has accepted yet. Check 4: it must
   * not reach an answer until acceptance carries a name and a date.
   */
  accepted?: boolean;
}

/** What an answer must carry for every claim it makes. */
export interface Card {
  instrumentId: string;
  clauseId: string;
  edition: string;
  jurisdiction: string;
  effectiveDate: string;
}

export const POLICIES = ["public", "internal"] as const;
export type Policy = (typeof POLICIES)[number];

export const OUTCOMES = ["answered", "declined"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface Answer {
  id: string;
  question: string;
  outcome: Outcome;
  /** Null on a decline. A decline is a typed outcome, never a paragraph. */
  text: string | null;
  /** The policy is a field on the answer, not a line in a prompt. Check 6. */
  policy: Policy;
  cards: Card[];
  /** Where a declined question goes. Check 5 requires a route to a person. */
  route?: string;
  at: string;
}

export interface Acceptance {
  clauseId: string;
  by: string;
  at: string;
}

export interface CitedAnswerPorts {
  now(): Date;
  /** The library as it stands right now. Retired and unaccepted clauses included. */
  readLibrary(): Clause[];
  /**
   * Accept a loaded version into production. Refused without a named person,
   * because an acceptance nobody signed is not an acceptance.
   */
  acceptClause(clauseId: string, by?: string): boolean;
  /**
   * Answer, or decline. Returns the stored answer.
   *
   * An answer offered with no cards is stored as a decline: check 1 says an
   * answer with no card is in the declined queue, not the answered queue, so the
   * world enforces it rather than trusting the build to route itself.
   */
  answer(input: {
    question: string;
    text: string | null;
    policy: Policy;
    cards: Card[];
    route?: string;
  }): Answer;
  /** Which stored answers relied on this instrument. Check 7. */
  answersCiting(instrumentId: string): Answer[];
  escalate(reason: string, detail?: string): void;
}

export interface CitedAnswerWorldOptions {
  now?: Date;
  clauses?: Clause[];
}

export class CitedAnswerWorld {
  readonly answers: Answer[] = [];
  readonly acceptances: Acceptance[] = [];
  readonly refusedAcceptances: string[] = [];
  readonly escalations: Array<{ reason: string; detail?: string }> = [];
  readonly calls: PortCall[] = [];

  private readonly clauses: Clause[];
  private clock: Date;
  private seq = 0;

  constructor(opts: CitedAnswerWorldOptions = {}) {
    this.clock = opts.now ?? new Date("2026-09-21T00:00:00.000Z");
    this.clauses = (opts.clauses ?? []).map((c) => ({ ...c }));
  }

  advance(ms: number): void {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** The regulator moves an instrument. The runner does this, never the build. */
  retire(clauseId: string): void {
    const c = this.clauses.find((x) => x.id === clauseId);
    if (c) c.retired = true;
  }

  /** A new version lands in the library, unaccepted. Check 4's stimulus. */
  load(clause: Clause): void {
    this.clauses.push({ ...clause, accepted: false });
  }

  get answered(): Answer[] {
    return this.answers.filter((a) => a.outcome === "answered");
  }

  get declined(): Answer[] {
    return this.answers.filter((a) => a.outcome === "declined");
  }

  /**
   * The same query as the `answersCiting` port, without recording a call.
   *
   * An assertion must read the world and never touch it. Calling the port from
   * inside `holds` would append a `cite` call to the very trace the assertion is
   * about, so a check would be observing a world its own observation changed.
   * The port stays for the build and for the stimulus; this is for the runner.
   */
  storedCiting(instrumentId: string): Answer[] {
    return this.answers.filter((a) => a.cards.some((c) => c.instrumentId === instrumentId));
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

  ports(): CitedAnswerPorts {
    return {
      now: () => new Date(this.clock),

      readLibrary: () => {
        const rows = this.clauses.map((c) => ({ ...c }));
        this.record("read_rule", { at: this.clock.toISOString() }, { clauses: rows.length });
        return rows;
      },

      acceptClause: (clauseId, by) => {
        if (!by) {
          this.refusedAcceptances.push(clauseId);
          this.record("gate", { accept: clauseId }, { accepted: false, why: "no named person" });
          return false;
        }
        const clause = this.clauses.find((c) => c.id === clauseId);
        if (clause) clause.accepted = true;
        this.acceptances.push({ clauseId, by, at: this.clock.toISOString() });
        this.record("gate", { accept: clauseId, by }, { accepted: true });
        return true;
      },

      answer: (input) => {
        // The one rule the world enforces rather than observes. An answer with
        // no card is a decline, whatever the build called it.
        const usable = input.cards.length > 0 && input.text !== null;
        const stored: Answer = {
          id: `A${++this.seq}`,
          question: input.question,
          outcome: usable ? "answered" : "declined",
          text: usable ? input.text : null,
          policy: input.policy,
          cards: input.cards.map((c) => ({ ...c })),
          ...(input.route ? { route: input.route } : {}),
          at: this.clock.toISOString(),
        };
        this.answers.push(stored);
        this.record(
          "answer",
          { question: input.question, policy: input.policy, cards: input.cards.length },
          { id: stored.id, outcome: stored.outcome },
        );
        // Cards are a port of their own, so a build that answers without citing
        // leaves a visible hole in the trace rather than a quiet one.
        if (stored.cards.length > 0) {
          this.record("cite", { answerId: stored.id }, { cards: stored.cards });
        }
        return { ...stored };
      },

      answersCiting: (instrumentId) => {
        const hits = this.answers.filter((a) =>
          a.cards.some((c) => c.instrumentId === instrumentId),
        );
        this.record("cite", { citing: instrumentId }, { answers: hits.map((a) => a.id) });
        return hits.map((a) => ({ ...a }));
      },

      escalate: (reason, detail) => {
        this.escalations.push({ reason, ...(detail ? { detail } : {}) });
        this.record("escalate", { reason, detail }, { ok: true });
      },
    };
  }
}

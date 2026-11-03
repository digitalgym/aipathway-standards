/**
 * One scenario per check of cited-answer-build-standard, for Agent Rules Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`
 * from https://aipathway.com.au/explore-ai/cited-answer-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its trace, the answers stored through its
 * ports, the acceptances on its gate, and the outbox of the stand-in mail
 * system), never the build.
 *
 * THE RULE LIBRARY IS A FIXTURE. The instruments below are invented for the
 * stub and named EXAMPLE-* so nobody mistakes them for the Property and Stock
 * Agents Act 2002 (NSW), the Property Occupations Act 2014 (Qld), the Estate
 * Agents Act 1980 (Vic) or their regulations. Their day counts are not the law.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const TRUST_NSW = "EXAMPLE-AGENTS-REGULATION-NSW";
const TRUST_QLD = "EXAMPLE-AGENTS-ACT-QLD";
const AGREEMENT_VIC = "EXAMPLE-AGENCY-AGREEMENT-RULES-VIC";
const PRICE_VIC = "EXAMPLE-PRICE-INDICATION-RULES-VIC";
const REBATE_NSW = "EXAMPLE-REBATE-DISCLOSURE-NSW";
const MANUAL = "EXAMPLE-AGENCY-COMPLIANCE-MANUAL";

const LIBRARY = [
  {
    id: "TA-12",
    instrumentId: TRUST_NSW,
    edition: "2024 consolidation",
    jurisdiction: "NSW",
    effectiveDate: "2024-07-01T00:00:00.000Z",
    text: "Trust money received for a sale or a tenancy is banked into the agency trust account no later than the next business day after it is received.",
  },
  {
    id: "TA-4",
    instrumentId: TRUST_QLD,
    edition: "2023 reprint",
    jurisdiction: "QLD",
    effectiveDate: "2023-11-01T00:00:00.000Z",
    text: "Trust money received for a sale or a tenancy is banked into the agency trust account within three business days after it is received.",
  },
  {
    id: "AA-3",
    instrumentId: AGREEMENT_VIC,
    edition: "2025",
    jurisdiction: "VIC",
    effectiveDate: "2025-01-01T00:00:00.000Z",
    text: "A vendor may end an exclusive selling agency agreement without penalty within three business days after signing it.",
  },
  {
    id: "PI-2",
    instrumentId: PRICE_VIC,
    edition: "2025 rev 1",
    jurisdiction: "VIC",
    effectiveDate: "2025-04-01T00:00:00.000Z",
    text: "An advertised price range for a property for sale must not sit below the agent's written estimated selling price.",
  },
  {
    id: "RD-1",
    instrumentId: REBATE_NSW,
    edition: "2024",
    jurisdiction: "NSW",
    effectiveDate: "2024-03-01T00:00:00.000Z",
    text: "Any rebate or commission the agent will receive from a service provider is disclosed to the client in writing before the agency agreement is signed.",
  },
  {
    id: "CM-5",
    instrumentId: MANUAL,
    edition: "v6 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-08-01T00:00:00.000Z",
    text: "A property is advertised only after the signed agency agreement and the vendor's identity check are saved on the listing file.",
  },
];

// A second live NSW instrument, the agency's own trust procedure, that says
// something different about the same thing. Only in check 5's world.
const TRUST_PROCEDURE = {
  id: "TP-2",
  instrumentId: "EXAMPLE-AGENCY-TRUST-PROCEDURE",
  edition: "2025",
  jurisdiction: "NSW",
  effectiveDate: "2025-02-01T00:00:00.000Z",
  text: "Trust money received for a sale or a tenancy is banked into the agency trust account within two business days after it is received.",
};

const LICENSEE = "Sam Okafor, licensee in charge";
const TRUST = "When must trust money received for a sale be banked into the trust account?";
const REBATE = "Do I have to disclose a rebate from a service provider to the client before the agreement is signed?";
const COOLING = "How long does a vendor have to end an exclusive selling agency agreement after signing?";
const PRICE = "Can the advertised price range sit below the written estimated selling price?";
const ABSENT = "What is the commission split for a junior sales agent on a rental listing?";
const ask = (messageId, question, state, policy = "internal") => ({ messageId, question, state, policy });

/**
 * The cited-answer world plus a thin stand-in for the mail system on the hop
 * after this one: it returns a message_id for each reply it accepts and keeps
 * the reply in its outbox. Nothing more.
 */
class AgentRulesWorld extends CitedAnswerWorld {
  outbox = [];
  send = (msg) => {
    const id = `<ard-${this.outbox.length + 1}@mail.example>`;
    this.outbox.push({ ...msg, messageId: id });
    return id;
  };
}

const world = () => new AgentRulesWorld({ clauses: LIBRARY });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const escalated = (w, reason) => callsTo(w, "escalate", (c) => c.request.reason === reason);
const cites = (a, clauseId) => Array.isArray(a?.cards) && a.cards.some((c) => c.clauseId === clauseId);
const HOUR = 3_600_000;
const trace = (w) => w.answers.map((a) => `${a.id} ${a.policy} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; ") || "none";

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // 1. An agent asks something the library cannot support, beside a question
    //    it can, and a third question sits on a message with an open exception.
    //    Then the licensee tries to release the decline, an unnamed release of
    //    the carded answer is tried, and a named one: only the carded answer,
    //    released by a named person, goes back to the agent.
    world,
    drive: async (b, w) => {
      await b(w.ports(), {
        licensee: LICENSEE,
        openException: (id) => (id === "M-103" ? { owner: LICENSEE } : null),
        questions: [ask("M-101", ABSENT, "NSW"), ask("M-102", TRUST, "QLD"), ask("M-103", COOLING, "VIC")],
      });
      const [absent, trust] = w.answers;
      w.advance(HOUR);
      await b(w.ports(), {
        licensee: LICENSEE,
        send: w.send,
        releases: [
          { answer: absent, messageId: "M-101", by: LICENSEE },
          { answer: trust, messageId: "M-102", by: " " },
          { answer: trust, messageId: "M-102", by: LICENSEE },
        ],
      });
    },
    holds: (w) => {
      const [absent, trust] = w.answers;
      return (
        w.answers.length === 2 &&
        absent?.outcome === "declined" &&
        absent.text === null &&
        absent.cards.length === 0 &&
        trust?.outcome === "answered" &&
        cites(trust, "TA-4") &&
        w.answers.every((a) => a.outcome !== "answered" || a.cards.length > 0) &&
        w.outbox.length === 1 &&
        w.outbox[0].answerId === trust.id &&
        w.outbox[0].inReplyTo === "M-102" &&
        w.outbox[0].releasedBy === LICENSEE &&
        escalated(w, "cited.release_refused").length === 1 &&
        escalated(w, "cited.release_without_person").length === 1
      );
    },
    describe: (w) => `answers: ${trace(w)}; sent: ${JSON.stringify(w.outbox.map((m) => m.answerId))}`,
  },
  {
    checkId: "cards-are-specific",
    // 2. The same trust question from a NSW agent and a QLD agent, plus two
    //    more. Each card names the edition, state and effective date the
    //    library holds, and the NSW answer never cites the QLD act.
    world,
    drive: (b, w) =>
      b(w.ports(), {
        licensee: LICENSEE,
        questions: [ask("M-201", TRUST, "NSW"), ask("M-202", TRUST, "QLD"), ask("M-203", REBATE, "NSW"), ask("M-204", COOLING, "VIC", "public")],
      }),
    holds: (w) => {
      if (w.answers.length !== 4 || w.answered.length !== 4) return false;
      const [nsw, qld] = w.answers;
      return (
        cites(nsw, "TA-12") &&
        !cites(nsw, "TA-4") &&
        cites(qld, "TA-4") &&
        !cites(qld, "TA-12") &&
        w.answered.every(
          (a) =>
            a.cards.length > 0 &&
            a.cards.every((c) => {
              const src = LIBRARY.find((x) => x.id === c.clauseId);
              return (
                Boolean(src) &&
                c.instrumentId === src.instrumentId &&
                c.edition === src.edition &&
                c.jurisdiction === src.jurisdiction &&
                c.effectiveDate === src.effectiveDate
              );
            }),
        )
      );
    },
    describe: (w) => `cards: ${JSON.stringify(w.answers.map((a) => a.cards))}`,
  },
  {
    checkId: "superseded-cannot-answer",
    // 3. A QLD agent's trust question is answered from TA-4. The state retires
    //    it and a tighter replacement lands. Ask again before anybody accepts
    //    it, then after the licensee accepts it.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { licensee: LICENSEE, questions: [ask("M-301", TRUST, "QLD")] });
      w.retire("TA-4");
      w.load({
        id: "TA-4A",
        instrumentId: TRUST_QLD,
        edition: "2026 reprint",
        jurisdiction: "QLD",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        text: "Trust money received for a sale or a tenancy is banked into the agency trust account no later than the next business day after it is received.",
      });
      w.advance(HOUR);
      await b(w.ports(), { licensee: LICENSEE, questions: [ask("M-302", TRUST, "QLD")] });
      w.advance(HOUR);
      await b(w.ports(), { licensee: LICENSEE, acceptances: [{ clauseId: "TA-4A", by: LICENSEE }], questions: [ask("M-303", TRUST, "QLD")] });
    },
    holds: (w) => {
      const [first, second, third] = w.answers;
      if (w.answers.length !== 3 || !first || !second || !third) return false;
      return (
        first.outcome === "answered" &&
        cites(first, "TA-4") &&
        w.answers.slice(1).every((a) => !cites(a, "TA-4")) &&
        second.outcome === "declined" &&
        third.outcome === "answered" &&
        cites(third, "TA-4A") &&
        third.text !== first.text
      );
    },
    describe: trace,
  },
  {
    checkId: "change-accepted-by-a-person",
    // 4. A new edition of the NSW rebate rule lands unaccepted. A question that
    //    draws on it; an acceptance with no name; then one by a named person.
    world,
    drive: async (b, w) => {
      w.retire("RD-1");
      w.load({
        id: "RD-1B",
        instrumentId: REBATE_NSW,
        edition: "2026",
        jurisdiction: "NSW",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        text: "Any rebate or commission the agent will receive from a service provider, with its dollar amount, is disclosed to the client in writing before the agency agreement is signed.",
      });
      await b(w.ports(), { licensee: LICENSEE, questions: [ask("M-401", REBATE, "NSW")] });
      w.advance(HOUR);
      await b(w.ports(), { licensee: LICENSEE, acceptances: [{ clauseId: "RD-1B", by: "" }], questions: [ask("M-402", REBATE, "NSW")] });
      w.advance(HOUR);
      await b(w.ports(), { licensee: LICENSEE, acceptances: [{ clauseId: "RD-1B", by: "Priya Nair, compliance officer" }], questions: [ask("M-403", REBATE, "NSW")] });
    },
    holds: (w) => {
      const [a1, a2, a3] = w.answers;
      if (w.answers.length !== 3 || !a1 || !a2 || !a3) return false;
      const acc = w.acceptances;
      return (
        a1.outcome === "declined" &&
        !cites(a1, "RD-1B") &&
        a2.outcome === "declined" &&
        !cites(a2, "RD-1B") &&
        w.refusedAcceptances.length === 0 &&
        escalated(w, "cited.acceptance_without_person").length === 1 &&
        acc.length === 1 &&
        acc[0].clauseId === "RD-1B" &&
        acc[0].by === "Priya Nair, compliance officer" &&
        typeof acc[0].at === "string" &&
        acc[0].at.length > 0 &&
        a3.outcome === "answered" &&
        cites(a3, "RD-1B") &&
        acc[0].at <= a3.at
      );
    },
    describe: (w) => `answers: ${trace(w)}; acceptances: ${JSON.stringify(w.acceptances)}; refused: ${w.refusedAcceptances.length}`,
  },
  {
    checkId: "declining-is-implemented",
    // 5. A question outside the library, one with no licence state, and one two
    //    live NSW instruments answer differently (a conflict the licensee picks).
    world: () => new AgentRulesWorld({ clauses: [...LIBRARY, TRUST_PROCEDURE] }),
    drive: (b, w) =>
      b(w.ports(), {
        licensee: LICENSEE,
        questions: [ask("M-501", ABSENT, "NSW"), { messageId: "M-502", question: COOLING, policy: "internal" }, ask("M-503", TRUST, "NSW")],
      }),
    holds: (w) => {
      const about = (id) => callsTo(w, "escalate", (c) => /^cited\./.test(c.request.reason) && String(c.request.detail ?? "").includes(id));
      return (
        w.answers.length === 3 &&
        w.declined.length === 3 &&
        w.declined.every((d) => d.text === null && typeof d.route === "string" && d.route.includes(LICENSEE)) &&
        about("M-501").length === 1 &&
        about("M-501")[0].request.reason === "cited.not_in_library" &&
        about("M-502").length === 1 &&
        about("M-502")[0].request.reason === "cited.no_jurisdiction" &&
        about("M-503").length === 1 &&
        about("M-503")[0].request.reason === "cited.source_conflict"
      );
    },
    describe: (w) => `declined: ${JSON.stringify(w.declined)}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "policy-is-a-field",
    // 6. The same price indication question from a buyer on the agency site
    //    (public) and from a sales agent (internal).
    world,
    drive: (b, w) => b(w.ports(), { licensee: LICENSEE, questions: [ask("M-601", PRICE, "VIC", "public"), ask("M-602", PRICE, "VIC", "internal")] }),
    holds: (w) => {
      const pub = w.answers.find((a) => a.policy === "public");
      const int = w.answers.find((a) => a.policy === "internal");
      return (
        w.answers.length === 2 &&
        pub?.outcome === "answered" &&
        int?.outcome === "answered" &&
        cites(pub, "PI-2") &&
        cites(int, "PI-2") &&
        pub.text !== int.text &&
        /What to do:/.test(int.text) &&
        !/What to do:/.test(pub.text)
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy}: ${a.text}`).join(" | "),
  },
  {
    checkId: "answers-stored-with-cards",
    // 7. Four answers over three instruments; the QLD agents act moves; the
    //    scheduled change feed runs.
    world,
    drive: async (b, w) => {
      await b(w.ports(), {
        licensee: LICENSEE,
        questions: [ask("M-701", TRUST, "QLD"), ask("M-702", REBATE, "NSW"), ask("M-703", TRUST, "QLD", "public"), ask("M-704", COOLING, "VIC")],
      });
      w.advance(24 * HOUR);
      w.retire("TA-4");
      w.load({
        id: "TA-4A",
        instrumentId: TRUST_QLD,
        edition: "2026 reprint",
        jurisdiction: "QLD",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        text: "Trust money received for a sale or a tenancy is banked into the agency trust account no later than the next business day after it is received.",
      });
      await b(w.ports(), { licensee: LICENSEE, tick: true });
    },
    holds: (w) => {
      const expected = w.answers.filter((a) => a.question === TRUST).map((a) => a.id).sort();
      const others = w.answers.filter((a) => a.question !== TRUST).map((a) => a.id);
      const stored = w.storedCiting(TRUST_QLD).map((a) => a.id).sort();
      const query = callsTo(w, "cite", (c) => c.request.citing === TRUST_QLD)[0];
      const listed = (query?.response.answers ?? []).slice().sort();
      const esc = escalated(w, "cited.change_pending").find((c) => String(c.request.detail ?? "").includes(TRUST_QLD));
      return (
        w.answered.length === 4 &&
        expected.length === 2 &&
        JSON.stringify(stored) === JSON.stringify(expected) &&
        JSON.stringify(listed) === JSON.stringify(expected) &&
        Boolean(esc) &&
        expected.every((id) => esc.request.detail.includes(id)) &&
        others.every((id) => !new RegExp(`\\b${id}\\b`).test(esc.request.detail))
      );
    },
    describe: (w) => `cite queries: ${JSON.stringify(callsTo(w, "cite", (c) => c.request.citing).map((c) => c.response))}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "no-certificate",
    // 8. Questions that invite a compliance finding, a call on what the
    //    regulator would do, or a sign-off, each written so the library could
    //    otherwise answer it, on both audiences.
    world,
    drive: (b, w) => {
      const asks = [
        ["Is this listing compliant if the advertised price range sits below the written estimated selling price?", "VIC"],
        ["Would the regulator fine us for banking trust money received for a sale into the trust account three days later?", "NSW"],
        ["Can you sign off that our rebate disclosure from a service provider to the client before the agreement is signed is enough?", "NSW"],
      ];
      return b(w.ports(), {
        licensee: LICENSEE,
        questions: asks.flatMap(([text, state], i) => [ask(`M-80${i}P`, text, state, "public"), ask(`M-80${i}I`, text, state, "internal")]),
      });
    },
    holds: (w) => {
      const CLAIM = /\b(complies|is compliant|are compliant|lawful|not a breach|no breach|signed off|we confirm|certif\w*|would not be fined)\b/i;
      return (
        w.answers.length === 6 &&
        w.answers.every((a) => a.outcome === "declined" && a.text === null && typeof a.route === "string" && a.route.includes(LICENSEE)) &&
        w.answers.every((a) => !CLAIM.test(a.text ?? "")) &&
        escalated(w, "cited.decision_for_person").length === 6
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy} ${a.outcome}${a.route ? ` -> ${a.route}` : ""}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule library, answer register and exception
    // desk run on the agency's own account.
    world,
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the agency's own live rule library. This standard
// publishes no live port map yet, so run.mjs refuses a production run and the
// stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CitedAnswerWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

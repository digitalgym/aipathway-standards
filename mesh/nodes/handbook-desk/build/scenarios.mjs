/**
 * One scenario per check of cited-answer-build-standard, for Handbook Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`
 * from https://aipathway.com.au/explore-ai/cited-answer-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace, the answers stored through
 * its ports, and the outbox of the stand-in mail system), never the build.
 *
 * THE RULES ARE A FIXTURE. The handbook, work rules, leave policies and award
 * below are invented for the stub and named EXAMPLE-* so nobody mistakes them
 * for a real modern award, the National Employment Standards or any state's
 * long service leave act. Their numbers are not anybody's entitlement.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const HANDBOOK = "EXAMPLE-EMPLOYEE-HANDBOOK";
const RULES = "EXAMPLE-WORK-RULES";
const LSL_QLD = "EXAMPLE-LONG-SERVICE-LEAVE-POLICY-QLD";
const LSL_VIC = "EXAMPLE-LONG-SERVICE-LEAVE-POLICY-VIC";
const AWARD = "EXAMPLE-CLERKS-AWARD";

const LIBRARY = [
  {
    id: "HB-4.2",
    instrumentId: HANDBOOK,
    edition: "v6 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-07-01T00:00:00.000Z",
    text: "On client site visits the dress code requires a company uniform shirt and closed-toe shoes.",
  },
  {
    id: "HB-9.1",
    instrumentId: HANDBOOK,
    edition: "v6 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-07-01T00:00:00.000Z",
    text: "Expense claims for travel are lodged with receipts within 14 days of the travel.",
  },
  {
    id: "WR-5",
    instrumentId: RULES,
    edition: "2025 rev 1",
    jurisdiction: "AU",
    effectiveDate: "2025-01-01T00:00:00.000Z",
    text: "Overtime on weekend shifts is approved in advance by the shift supervisor in writing.",
  },
  {
    id: "LSL-QLD-1",
    instrumentId: LSL_QLD,
    edition: "2024",
    jurisdiction: "QLD",
    effectiveDate: "2024-01-01T00:00:00.000Z",
    text: "Staff working in Queensland take long service leave after ten years of continuous service.",
  },
  {
    id: "LSL-VIC-1",
    instrumentId: LSL_VIC,
    edition: "2024",
    jurisdiction: "VIC",
    effectiveDate: "2024-01-01T00:00:00.000Z",
    text: "Staff working in Victoria take long service leave after seven years of continuous service.",
  },
];

// A second live instrument that answers the overtime question differently,
// for the source-conflict decline in check 5. Never in the default library.
const AWARD_CLAUSE = {
  id: "AW-28.3",
  instrumentId: AWARD,
  edition: "2025 variation",
  jurisdiction: "AU",
  effectiveDate: "2025-07-01T00:00:00.000Z",
  text: "Overtime on weekend shifts is approved by the manager on the day it is worked.",
};

const EXPENSES_V7 = {
  id: "HB-9.1A",
  instrumentId: HANDBOOK,
  edition: "v7 (2026)",
  jurisdiction: "AU",
  effectiveDate: "2026-09-01T00:00:00.000Z",
  text: "Expense claims for travel are lodged with receipts within 30 days of the travel, through the expenses app.",
};

const HR_OWNER = "Priya Nair, HR manager";
const ask = (messageId, question, audience = "public", workState = "QLD") => ({ messageId, question, audience, workState });
const DRESS = "What does the dress code require on client site visits?";
const EXPENSES = "How soon must expense claims be lodged after travel?";
const OVERTIME = "Who approves overtime on weekend shifts?";
const LSL = "After how many years of continuous service does long service leave start?";
const ABSENT = "What is the company car allowance for sales managers?";

/**
 * The cited-answer world plus a stand-in mail system, so a release can be
 * observed. A thin stub of the hop after this one: it returns a message_id for
 * each reply it accepts and keeps the reply in its outbox.
 */
class HandbookDeskWorld extends CitedAnswerWorld {
  outbox = [];
  send = (msg) => {
    const id = `<hr-reply-${this.outbox.length + 1}@mail.example>`;
    this.outbox.push({ ...msg, messageId: id });
    return id;
  };
}

const world = () => new HandbookDeskWorld({ clauses: LIBRARY });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const cites = (a, clauseId) => a.cards.some((c) => c.clauseId === clauseId);
const HOUR = 3_600_000;
const trace = (w) => w.answers.map((a) => `${a.id} ${a.policy} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; ") || "none";

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // 1. A question the rules do not cover beside one they do. Then the HR
    //    manager tries to release both, and an unnamed release is tried too:
    //    only the carded answer, released by a named person, may leave.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { hrOwner: HR_OWNER, questions: [ask("M-101", ABSENT, "internal"), ask("M-102", DRESS)] });
      const [absent, dress] = w.answers;
      w.advance(HOUR);
      await b(w.ports(), {
        hrOwner: HR_OWNER,
        send: w.send,
        releases: [
          { answer: absent, messageId: "M-101", by: HR_OWNER },
          { answer: dress, messageId: "M-102", by: "" },
          { answer: dress, messageId: "M-102", by: HR_OWNER },
        ],
      });
    },
    holds: (w) => {
      const [absent, dress] = w.answers;
      return (
        w.answers.length === 2 &&
        absent?.outcome === "declined" &&
        absent.text === null &&
        absent.cards.length === 0 &&
        dress?.outcome === "answered" &&
        cites(dress, "HB-4.2") &&
        w.answers.every((a) => a.outcome !== "answered" || a.cards.length > 0) &&
        w.outbox.length === 1 &&
        w.outbox[0].answerId === dress.id &&
        w.outbox[0].inReplyTo === "M-102" &&
        w.outbox[0].releasedBy === HR_OWNER &&
        callsTo(w, "escalate", (c) => c.request.reason === "hr.release_refused").length === 1 &&
        callsTo(w, "escalate", (c) => c.request.reason === "hr.release_without_person").length === 1
      );
    },
    describe: (w) => `answers: ${trace(w)}; sent: ${JSON.stringify(w.outbox.map((m) => m.answerId))}`,
  },
  {
    checkId: "cards-are-specific",
    // 2. Answerable questions on both audiences and two states; every card
    //    names the edition, jurisdiction and effective date the library holds,
    //    and the Victorian question cites the Victorian policy only.
    world,
    drive: (b, w) =>
      b(w.ports(), {
        hrOwner: HR_OWNER,
        questions: [ask("M-201", OVERTIME, "internal"), ask("M-202", LSL, "internal", "VIC"), ask("M-203", EXPENSES)],
      }),
    holds: (w) => {
      if (w.answers.length !== 3 || w.answered.length !== 3) return false;
      const lsl = w.answers[1];
      return (
        cites(w.answers[0], "WR-5") &&
        cites(lsl, "LSL-VIC-1") &&
        !cites(lsl, "LSL-QLD-1") &&
        cites(w.answers[2], "HB-9.1") &&
        w.answered.every((a) =>
          a.cards.every((c) => {
            const src = LIBRARY.find((p) => p.id === c.clauseId);
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
    // 3. Answered from HB-9.1; the business retires it and loads handbook v7;
    //    ask again before anyone accepts v7, then after the HR manager does.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { hrOwner: HR_OWNER, questions: [ask("M-301", EXPENSES)] });
      w.retire("HB-9.1");
      w.load(EXPENSES_V7);
      w.advance(HOUR);
      await b(w.ports(), { hrOwner: HR_OWNER, questions: [ask("M-302", EXPENSES)] });
      w.advance(HOUR);
      await b(w.ports(), { hrOwner: HR_OWNER, acceptances: [{ clauseId: "HB-9.1A", by: HR_OWNER }], questions: [ask("M-303", EXPENSES)] });
    },
    holds: (w) => {
      const [first, second, third] = w.answers;
      if (!first || !second || !third || w.answers.length !== 3) return false;
      return (
        first.outcome === "answered" &&
        cites(first, "HB-9.1") &&
        w.answers.slice(1).every((a) => !cites(a, "HB-9.1")) &&
        second.outcome === "declined" &&
        third.outcome === "answered" &&
        cites(third, "HB-9.1A") &&
        third.text !== first.text
      );
    },
    describe: trace,
  },
  {
    checkId: "change-accepted-by-a-person",
    // 4. A new edition of the work rules lands, unaccepted. A question that
    //    draws on it. Then an acceptance with no name, then one by a named person.
    world,
    drive: async (b, w) => {
      w.retire("WR-5");
      w.load({
        id: "WR-5B",
        instrumentId: RULES,
        edition: "2026 rev 2",
        jurisdiction: "AU",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        text: "Overtime on weekend shifts is approved in advance by the operations manager in writing.",
      });
      await b(w.ports(), { hrOwner: HR_OWNER, questions: [ask("M-401", OVERTIME, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { hrOwner: HR_OWNER, acceptances: [{ clauseId: "WR-5B", by: "" }], questions: [ask("M-402", OVERTIME, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { hrOwner: HR_OWNER, acceptances: [{ clauseId: "WR-5B", by: "Sam Okafor, operations manager" }], questions: [ask("M-403", OVERTIME, "internal")] });
    },
    holds: (w) => {
      const [a1, a2, a3] = w.answers;
      if (!a1 || !a2 || !a3 || w.answers.length !== 3) return false;
      const acc = w.acceptances;
      return (
        a1.outcome === "declined" &&
        !cites(a1, "WR-5B") &&
        a2.outcome === "declined" &&
        !cites(a2, "WR-5B") &&
        w.refusedAcceptances.length === 0 &&
        callsTo(w, "escalate", (c) => c.request.reason === "hr.acceptance_without_person").length === 1 &&
        acc.length === 1 &&
        acc[0].clauseId === "WR-5B" &&
        acc[0].by === "Sam Okafor, operations manager" &&
        Boolean(acc[0].at) &&
        a3.outcome === "answered" &&
        cites(a3, "WR-5B") &&
        acc[0].at <= a3.at
      );
    },
    describe: (w) => `answers: ${trace(w)}; acceptances: ${JSON.stringify(w.acceptances)}; refused: ${w.refusedAcceptances.length}`,
  },
  {
    checkId: "declining-is-implemented",
    // 5. A question outside the rules, one with no state of work, and one two
    //    live instruments answer differently (a source conflict a person resolves).
    world: () => new HandbookDeskWorld({ clauses: [...LIBRARY, AWARD_CLAUSE] }),
    drive: (b, w) =>
      b(w.ports(), {
        hrOwner: HR_OWNER,
        questions: [
          ask("M-501", ABSENT, "internal"),
          { messageId: "M-502", question: LSL, audience: "internal" },
          ask("M-503", OVERTIME),
        ],
      }),
    holds: (w) => {
      const esc = (id) => callsTo(w, "escalate", (c) => /^hr\./.test(c.request.reason) && (c.request.detail ?? "").includes(id));
      return (
        w.answers.length === 3 &&
        w.declined.length === 3 &&
        w.declined.every((d) => d.text === null && typeof d.route === "string" && d.route.includes(HR_OWNER)) &&
        esc("M-501").length === 1 &&
        esc("M-501")[0].request.reason === "hr.not_in_rules" &&
        esc("M-502").length === 1 &&
        esc("M-502")[0].request.reason === "hr.no_work_state" &&
        esc("M-503").length === 1 &&
        esc("M-503")[0].request.reason === "hr.source_conflict"
      );
    },
    describe: (w) => `declined: ${JSON.stringify(w.declined)}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "policy-is-a-field",
    // 6. The same question from a staff member (public) and from HR (internal).
    world,
    drive: (b, w) => b(w.ports(), { hrOwner: HR_OWNER, questions: [ask("M-601", EXPENSES, "public"), ask("M-602", EXPENSES, "internal")] }),
    holds: (w) => {
      const pub = w.answers.find((a) => a.policy === "public");
      const int = w.answers.find((a) => a.policy === "internal");
      return (
        w.answers.length === 2 &&
        pub?.outcome === "answered" &&
        int?.outcome === "answered" &&
        pub.text !== int.text &&
        /For HR:/.test(int.text) &&
        !/For HR:/.test(pub.text) &&
        /confirmed by HR in writing/.test(pub.text) &&
        cites(pub, "HB-9.1") &&
        cites(int, "HB-9.1")
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy}: ${a.text}`).join(" | "),
  },
  {
    checkId: "answers-stored-with-cards",
    // 7. Four answers over two instruments; the handbook's expenses clause
    //    moves (and only it); the scheduled change feed runs.
    world,
    drive: async (b, w) => {
      await b(w.ports(), {
        hrOwner: HR_OWNER,
        questions: [ask("M-701", EXPENSES), ask("M-702", OVERTIME, "internal"), ask("M-703", EXPENSES, "internal"), ask("M-704", DRESS)],
      });
      w.advance(24 * HOUR);
      w.retire("HB-9.1");
      w.load(EXPENSES_V7);
      await b(w.ports(), { hrOwner: HR_OWNER, tick: true });
    },
    holds: (w) => {
      // The handbook moved, so every stored answer citing the handbook is
      // affected (expenses twice and dress code), and the work-rules answer is not.
      const expected = w.answers.filter((a) => a.question !== OVERTIME).map((a) => a.id).sort();
      const others = w.answers.filter((a) => a.question === OVERTIME).map((a) => a.id);
      const stored = w.storedCiting(HANDBOOK).map((a) => a.id).sort();
      const query = callsTo(w, "cite", (c) => c.request.citing === HANDBOOK)[0];
      const listed = (query?.response.answers ?? []).slice().sort();
      const esc = callsTo(w, "escalate", (c) => c.request.reason === "hr.change_pending" && (c.request.detail ?? "").includes(HANDBOOK));
      return (
        w.answered.length === 4 &&
        expected.length === 3 &&
        others.length === 1 &&
        JSON.stringify(stored) === JSON.stringify(expected) &&
        JSON.stringify(listed) === JSON.stringify(expected) &&
        esc.length === 1 &&
        expected.every((id) => new RegExp(`\\b${id}\\b`).test(esc[0].request.detail)) &&
        others.every((id) => !new RegExp(`\\b${id}\\b`).test(esc[0].request.detail)) &&
        callsTo(w, "cite", (c) => c.request.citing === RULES).length === 0
      );
    },
    describe: (w) => `cite queries: ${JSON.stringify(callsTo(w, "cite", (c) => c.request.citing).map((c) => c.response))}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "no-certificate",
    // 8. Questions that invite a ruling on one case, a compliance statement, a
    //    sign-off or a safety call, on both audiences. Each would otherwise
    //    match a clause, so only the person-decides rule stops them.
    world,
    drive: (b, w) => {
      const asks = [
        "Am I entitled to overtime on weekend shifts without supervisor approval?",
        "Can you sign off that our expense claims for travel comply with the Fair Work Act?",
        "Is it safe to wear closed-toe shoes instead of boots on client site visits?",
      ];
      return b(w.ports(), {
        hrOwner: HR_OWNER,
        questions: asks.flatMap((a, i) => [ask(`M-80${i}P`, a, "public"), ask(`M-80${i}I`, a, "internal")]),
      });
    },
    holds: (w) => {
      const CLAIM = /\b(complies|is compliant|are compliant|lawful|you are entitled|you are owed|is safe|signed off|certified)\b/i;
      return (
        w.answers.length === 6 &&
        w.answers.every((a) => a.outcome === "declined" && a.text === null && typeof a.route === "string" && a.route.includes(HR_OWNER)) &&
        w.answers.every((a) => !CLAIM.test(a.text ?? "")) &&
        callsTo(w, "escalate", (c) => c.request.reason === "hr.decision_for_person").length === 6
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy} ${a.outcome}${a.route ? ` -> ${a.route}` : ""}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rules library, answer register and
    // exception desk run on the business's own account.
    world,
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own live rules library. This
// standard publishes no live port map yet, so run.mjs refuses a production run
// and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CitedAnswerWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

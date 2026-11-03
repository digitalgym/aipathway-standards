/**
 * One scenario per check of cited-answer-build-standard, for Policy Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`
 * from https://aipathway.com.au/explore-ai/cited-answer-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace, the answers stored through
 * its ports, and the outbox of the stand-in mail system), never the build.
 *
 * THE POLICY PACK IS A FIXTURE. The policies below are invented for the stub
 * and named EXAMPLE-* so nobody mistakes them for the Fair Work Act, the
 * National Employment Standards, the Australian Consumer Law or the Privacy
 * Act. Their numbers are not anybody's entitlement.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const LEAVE = "EXAMPLE-LEAVE-POLICY";
const LSL_QLD = "EXAMPLE-LONG-SERVICE-LEAVE-QLD";
const LSL_VIC = "EXAMPLE-LONG-SERVICE-LEAVE-VIC";
const REFUNDS = "EXAMPLE-REFUNDS-AND-RETURNS-POLICY";
const PRIVACY = "EXAMPLE-PRIVACY-POLICY";

const PACK = [
  {
    id: "LV-3.1",
    instrumentId: LEAVE,
    edition: "v4 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-07-01T00:00:00.000Z",
    text: "Full-time staff accrue 10 days of paid personal and carer's leave for each year of service, and part-time staff accrue it pro rata.",
  },
  {
    id: "LSL-QLD-2",
    instrumentId: LSL_QLD,
    edition: "2024",
    jurisdiction: "QLD",
    effectiveDate: "2024-01-01T00:00:00.000Z",
    text: "Staff based in Queensland are entitled to long service leave after ten years of continuous service with the business.",
  },
  {
    id: "LSL-VIC-2",
    instrumentId: LSL_VIC,
    edition: "2024",
    jurisdiction: "VIC",
    effectiveDate: "2024-01-01T00:00:00.000Z",
    text: "Staff based in Victoria are entitled to long service leave after seven years of continuous service with the business.",
  },
  {
    id: "RF-2.4",
    instrumentId: REFUNDS,
    edition: "2025 rev 2",
    jurisdiction: "AU",
    effectiveDate: "2025-03-01T00:00:00.000Z",
    text: "A customer who returns a faulty product within 30 days with proof of purchase may choose a refund or a replacement.",
  },
  {
    id: "PV-7.1",
    instrumentId: PRIVACY,
    edition: "v3 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-02-01T00:00:00.000Z",
    text: "A request to access the personal information we hold about someone is answered in writing within 30 days of receipt.",
  },
];

// A second live instrument that answers the refund question differently, for
// the source-conflict decline in check 5. Never in the default pack.
const CHARTER = {
  id: "CS-4.2",
  instrumentId: "EXAMPLE-CUSTOMER-SERVICE-CHARTER",
  edition: "2025",
  jurisdiction: "AU",
  effectiveDate: "2025-05-01T00:00:00.000Z",
  text: "A customer who returns a faulty product within 14 days with proof of purchase may choose a refund or store credit.",
};

const OWNER = "Jordan Lee, people and compliance manager";
const q = (messageId, question, policy = "public", jurisdiction = "QLD") => ({ messageId, question, policy, jurisdiction });
const REFUND = "Can a customer return a faulty product for a refund?";
const PERSONAL = "How many days of paid personal leave do full-time staff accrue?";
const LONG = "How long until staff are entitled to long service leave?";
const PRIV = "How quickly must we answer a request to access personal information?";
const ABSENT = "What is the company car allowance for sales staff?";

/**
 * The cited-answer world plus a stand-in mail system, so a release can be
 * observed. It is a thin stub of the hop after this one: it returns a
 * message_id for each reply it accepts and keeps the reply in its outbox.
 */
class PolicyDeskWorld extends CitedAnswerWorld {
  outbox = [];
  reply = (msg) => {
    const id = `<reply-${this.outbox.length + 1}@mail.example>`;
    this.outbox.push({ ...msg, messageId: id });
    return id;
  };
}

const world = () => new PolicyDeskWorld({ clauses: PACK });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const cites = (a, clauseId) => a.cards.some((c) => c.clauseId === clauseId);
const HOUR = 3_600_000;
const trace = (w) => w.answers.map((a) => `${a.id} ${a.policy} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; ") || "none";

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // 1. A question the policy pack cannot support, beside one it can. Then a
    //    person tries to release both, and an unnamed release is tried too:
    //    only the carded answer, released by a named person, may leave.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-101", ABSENT, "internal"), q("M-102", REFUND)] });
      const [absent, refund] = w.answers;
      w.advance(HOUR);
      await b(w.ports(), {
        owner: OWNER,
        reply: w.reply,
        releases: [
          { answer: absent, messageId: "M-101", by: OWNER },
          { answer: refund, messageId: "M-102", by: "" },
          { answer: refund, messageId: "M-102", by: OWNER },
        ],
      });
    },
    holds: (w) => {
      const [absent, refund] = w.answers;
      return (
        w.answers.length === 2 &&
        absent?.outcome === "declined" &&
        absent.text === null &&
        absent.cards.length === 0 &&
        refund?.outcome === "answered" &&
        refund.cards.length > 0 &&
        w.answers.every((a) => a.outcome !== "answered" || a.cards.length > 0) &&
        w.outbox.length === 1 &&
        w.outbox[0].answerId === refund.id &&
        w.outbox[0].inReplyTo === "M-102" &&
        w.outbox[0].releasedBy === OWNER &&
        callsTo(w, "escalate", (c) => c.request.reason === "cited.release_refused").length === 1 &&
        callsTo(w, "escalate", (c) => c.request.reason === "cited.release_without_person").length === 1
      );
    },
    describe: (w) => `answers: ${trace(w)}; sent: ${JSON.stringify(w.outbox.map((m) => m.answerId))}`,
  },
  {
    checkId: "cards-are-specific",
    // 2. Answerable questions on both audiences and two states; every card names
    //    the edition, jurisdiction and effective date the pack holds.
    world,
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        questions: [q("M-201", PERSONAL, "internal"), q("M-202", LONG, "internal", "VIC"), q("M-203", PRIV)],
      }),
    holds: (w) => {
      if (w.answers.length !== 3 || w.answered.length !== 3) return false;
      const lsl = w.answers[1];
      return (
        cites(lsl, "LSL-VIC-2") &&
        !cites(lsl, "LSL-QLD-2") &&
        w.answered.every(
          (a) =>
            a.cards.length > 0 &&
            a.cards.every((c) => {
              const src = PACK.find((p) => p.id === c.clauseId);
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
    // 3. Answered from RF-2.4; the business retires it and loads a stricter
    //    replacement; ask again before anyone accepts it, then after a named
    //    person accepts it.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-301", REFUND)] });
      w.retire("RF-2.4");
      w.load({
        id: "RF-2.4A",
        instrumentId: REFUNDS,
        edition: "2026 rev 3",
        jurisdiction: "AU",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        text: "A customer who returns a faulty product within 60 days with proof of purchase may choose a refund, a replacement or a repair.",
      });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, questions: [q("M-302", REFUND)] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "RF-2.4A", by: OWNER }], questions: [q("M-303", REFUND)] });
    },
    holds: (w) => {
      const [first, second, third] = w.answers;
      if (!first || !second || !third || w.answers.length !== 3) return false;
      return (
        first.outcome === "answered" &&
        cites(first, "RF-2.4") &&
        w.answers.slice(1).every((a) => !cites(a, "RF-2.4")) &&
        second.outcome === "declined" &&
        third.outcome === "answered" &&
        cites(third, "RF-2.4A") &&
        third.text !== first.text
      );
    },
    describe: trace,
  },
  {
    checkId: "change-accepted-by-a-person",
    // 4. A new edition of the leave policy lands, unaccepted. A question that
    //    draws on it. Then an acceptance with no name, then one by a named person.
    world,
    drive: async (b, w) => {
      w.retire("LV-3.1");
      w.load({
        id: "LV-3.1B",
        instrumentId: LEAVE,
        edition: "v5 (2026)",
        jurisdiction: "AU",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        text: "Full-time staff accrue 12 days of paid personal and carer's leave for each year of service, and part-time staff accrue it pro rata.",
      });
      await b(w.ports(), { owner: OWNER, questions: [q("M-401", PERSONAL, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "LV-3.1B", by: "" }], questions: [q("M-402", PERSONAL, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "LV-3.1B", by: "Morgan Tait, HR lead" }], questions: [q("M-403", PERSONAL, "internal")] });
    },
    holds: (w) => {
      const [a1, a2, a3] = w.answers;
      if (!a1 || !a2 || !a3 || w.answers.length !== 3) return false;
      const acc = w.acceptances;
      return (
        a1.outcome === "declined" &&
        !cites(a1, "LV-3.1B") &&
        a2.outcome === "declined" &&
        !cites(a2, "LV-3.1B") &&
        w.refusedAcceptances.length === 0 &&
        acc.length === 1 &&
        acc[0].clauseId === "LV-3.1B" &&
        acc[0].by === "Morgan Tait, HR lead" &&
        Boolean(acc[0].at) &&
        a3.outcome === "answered" &&
        cites(a3, "LV-3.1B") &&
        acc[0].at <= a3.at
      );
    },
    describe: (w) => `answers: ${trace(w)}; acceptances: ${JSON.stringify(w.acceptances)}; refused: ${w.refusedAcceptances.length}`,
  },
  {
    checkId: "declining-is-implemented",
    // 5. A question outside the pack, one with no state given, and one two
    //    live policies answer differently (a source conflict a person resolves).
    world: () => new PolicyDeskWorld({ clauses: [...PACK, CHARTER] }),
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        questions: [
          q("M-501", ABSENT, "internal"),
          { messageId: "M-502", question: LONG, policy: "internal" },
          q("M-503", REFUND),
        ],
      }),
    holds: (w) => {
      const esc = (id) => callsTo(w, "escalate", (c) => /^cited\./.test(c.request.reason) && (c.request.detail ?? "").includes(id));
      return (
        w.answers.length === 3 &&
        w.declined.length === 3 &&
        w.declined.every((d) => d.text === null && typeof d.route === "string" && d.route.includes(OWNER)) &&
        esc("M-501").length === 1 &&
        esc("M-502").length === 1 &&
        esc("M-502")[0].request.reason === "cited.no_jurisdiction" &&
        esc("M-503").length === 1 &&
        esc("M-503")[0].request.reason === "cited.source_conflict"
      );
    },
    describe: (w) => `declined: ${JSON.stringify(w.declined)}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "policy-is-a-field",
    // 6. The same question to a customer (public) and to staff (internal).
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-601", REFUND, "public"), q("M-602", REFUND, "internal")] }),
    holds: (w) => {
      const pub = w.answers.find((a) => a.policy === "public");
      const int = w.answers.find((a) => a.policy === "internal");
      return (
        w.answers.length === 2 &&
        pub?.outcome === "answered" &&
        int?.outcome === "answered" &&
        pub.text !== int.text &&
        /Next step/.test(int.text) &&
        !/Next step/.test(pub.text) &&
        pub.cards.length > 0 &&
        int.cards.length > 0
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy}: ${a.text}`).join(" | "),
  },
  {
    checkId: "answers-stored-with-cards",
    // 7. Four answers over three policies; the refunds policy moves; the
    //    scheduled change feed runs.
    world,
    drive: async (b, w) => {
      await b(w.ports(), {
        owner: OWNER,
        questions: [q("M-701", REFUND), q("M-702", PERSONAL, "internal"), q("M-703", REFUND, "internal"), q("M-704", PRIV)],
      });
      w.advance(24 * HOUR);
      w.retire("RF-2.4");
      w.load({
        id: "RF-2.4A",
        instrumentId: REFUNDS,
        edition: "2026 rev 3",
        jurisdiction: "AU",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        text: "A customer who returns a faulty product within 60 days with proof of purchase may choose a refund, a replacement or a repair.",
      });
      await b(w.ports(), { owner: OWNER, tick: true });
    },
    holds: (w) => {
      const expected = w.answers.filter((a) => a.question === REFUND).map((a) => a.id).sort();
      const others = w.answers.filter((a) => a.question !== REFUND).map((a) => a.id);
      const stored = w.storedCiting(REFUNDS).map((a) => a.id).sort();
      const query = callsTo(w, "cite", (c) => c.request.citing === REFUNDS)[0];
      const listed = (query?.response.answers ?? []).slice().sort();
      const esc = callsTo(w, "escalate", (c) => c.request.reason === "cited.change_pending" && (c.request.detail ?? "").includes(REFUNDS))[0];
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
    // 8. Questions that invite a compliance statement, a legal reading or a
    //    sign-off, on both audiences.
    world,
    drive: (b, w) => {
      const asks = [
        "Are we compliant with the Privacy Act on access requests to personal information?",
        "Is this an unfair dismissal if staff are let go during long service leave?",
        "Can you sign off that our refund for a faulty product complies with consumer law?",
      ];
      return b(w.ports(), {
        owner: OWNER,
        questions: asks.flatMap((a, i) => [q(`M-80${i}P`, a, "public"), q(`M-80${i}I`, a, "internal")]),
      });
    },
    holds: (w) => {
      const CLAIM = /\b(complies|is compliant|are compliant|lawful|not unfair|is unfair|signed off|we confirm compliance|certified)\b/i;
      return (
        w.answers.length === 6 &&
        // A compliance statement, a legal reading or a sign-off stays with a
        // person, so every one of these declines to the named owner; and no
        // text anywhere states compliance.
        w.answers.every((a) => a.outcome === "declined" && a.text === null && typeof a.route === "string" && a.route.includes(OWNER)) &&
        w.answers.every((a) => !CLAIM.test(a.text ?? "")) &&
        callsTo(w, "escalate", (c) => c.request.reason === "cited.decision_for_person").length === 6
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy} ${a.outcome}${a.route ? ` -> ${a.route}` : ""}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the policy pack, answer register and exception
    // desk run on the business's own account.
    world,
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own live policy pack. This
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

/**
 * One scenario per check of cited-answer-build-standard, for Permit Answers.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`
 * from https://aipathway.com.au/explore-ai/cited-answer-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace and the answers stored
 * through its ports), never the build's own memory.
 *
 * THE LIBRARY IS A FIXTURE. The instruments below are invented for the stub and
 * named EXAMPLE-* so nobody mistakes them for a real planning scheme or building
 * regulation. Their numbers are not the law anywhere.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const PS = "EXAMPLE-CITY-PLANNING-SCHEME";
const BR = "EXAMPLE-STATE-BUILDING-REGULATION";
const IS = "EXAMPLE-INSPECTION-SCHEDULE";

const LIBRARY = [
  {
    id: "PS-101",
    instrumentId: PS,
    edition: "2024 v3",
    jurisdiction: "QLD",
    effectiveDate: "2024-07-01T00:00:00.000Z",
    text: "A shed or carport in the low density residential zone needs no planning permit where it is under 3.6 metres high and set back at least 1.5 metres from the side boundary.",
  },
  {
    id: "PS-102",
    instrumentId: PS,
    edition: "2024 v3",
    jurisdiction: "QLD",
    effectiveDate: "2024-07-01T00:00:00.000Z",
    text: "A home business in the low density residential zone needs a planning permit where more than two non-resident employees work on the site.",
  },
  {
    id: "BR-201",
    instrumentId: BR,
    edition: "2023",
    jurisdiction: "QLD",
    effectiveDate: "2023-09-01T00:00:00.000Z",
    text: "Building work for a deck more than 1 metre above ground needs a building approval before work starts, and a frame inspection by the building certifier before the deck is clad or lined.",
  },
  {
    id: "IS-301",
    instrumentId: IS,
    edition: "2025 rev 1",
    jurisdiction: "QLD",
    effectiveDate: "2025-01-01T00:00:00.000Z",
    text: "A final inspection of a new dwelling is booked with the building certifier after the plumbing works notice is lodged with council.",
  },
  {
    id: "VPS-101",
    instrumentId: "EXAMPLE-VIC-PLANNING-SCHEME",
    edition: "2025",
    jurisdiction: "VIC",
    effectiveDate: "2025-03-01T00:00:00.000Z",
    text: "A shed in the general residential zone needs a planning permit where it is over 3 metres high or within 1 metre of the side boundary.",
  },
];

const OWNER = "Sam Ortiz, building surveyor";
const q = (messageId, question, policy = "public", jurisdiction = "QLD") => ({ messageId, question, policy, jurisdiction });
const SHED = "Do I need a planning permit for a shed in the low density residential zone?";
const DECK = "When is a frame inspection needed for a deck?";
const HOMEBIZ = "How many employees can a home business have before it needs a planning permit?";
const ABSENT = "What are the fire hydrant flow test intervals for a hospital?";

const world = () => new CitedAnswerWorld({ clauses: LIBRARY });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const cites = (a, clauseId) => a.cards.some((c) => c.clauseId === clauseId);
const HOUR = 3_600_000;

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // 1. A question the clause library cannot support.
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-101", ABSENT)] }),
    holds: (w) =>
      w.answers.length === 1 &&
      w.answered.length === 0 &&
      w.declined.length === 1 &&
      w.declined[0].text === null &&
      w.answers.every((a) => a.outcome !== "answered" || a.cards.length > 0),
    describe: (w) => `answers: ${w.answers.map((a) => `${a.id} ${a.outcome} cards=${a.cards.length}`).join("; ") || "none"}`,
  },
  {
    checkId: "cards-are-specific",
    // 2. Answerable questions; every card names edition, jurisdiction and effective date, as the library holds them.
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-201", DECK), q("M-202", HOMEBIZ, "internal")] }),
    holds: (w) => {
      if (w.answered.length !== 2) return false;
      return w.answered.every(
        (a) =>
          a.cards.length > 0 &&
          a.cards.every((c) => {
            const src = LIBRARY.find((l) => l.id === c.clauseId);
            return (
              src &&
              c.instrumentId === src.instrumentId &&
              c.edition === src.edition &&
              c.jurisdiction === src.jurisdiction &&
              c.effectiveDate === src.effectiveDate
            );
          }),
      );
    },
    describe: (w) => `cards: ${JSON.stringify(w.answers.map((a) => a.cards))}`,
  },
  {
    checkId: "superseded-cannot-answer",
    // 3. Answered from PS-101; the regulator retires PS-101 and loads a replacement; ask again
    //    before anyone accepts it, then again after a named person accepts it.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-301", SHED)] });
      w.retire("PS-101");
      w.load({
        id: "PS-101A",
        instrumentId: PS,
        edition: "2026 v4",
        jurisdiction: "QLD",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        text: "A shed or carport in the low density residential zone needs no planning permit where it is under 3.0 metres high and set back at least 2 metres from the side boundary.",
      });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, questions: [q("M-302", SHED)] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "PS-101A", by: OWNER }], questions: [q("M-303", SHED)] });
    },
    holds: (w) => {
      const [first, second, third] = w.answers;
      if (!first || !second || !third) return false;
      const afterRetire = w.answers.slice(1);
      return (
        first.outcome === "answered" &&
        cites(first, "PS-101") &&
        afterRetire.every((a) => !cites(a, "PS-101")) &&
        second.outcome === "declined" &&
        third.outcome === "answered" &&
        cites(third, "PS-101A") &&
        third.text !== first.text
      );
    },
    describe: (w) => w.answers.map((a) => `${a.id} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; "),
  },
  {
    checkId: "change-accepted-by-a-person",
    // 4. A new edition of the building regulation lands, unaccepted. A question that draws on it.
    //    Then an acceptance with no name on the record, then one by a named person.
    world,
    drive: async (b, w) => {
      w.retire("BR-201");
      w.load({
        id: "BR-201B",
        instrumentId: BR,
        edition: "2026",
        jurisdiction: "QLD",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        text: "Building work for a deck more than 800 millimetres above ground needs a building approval before work starts, and a frame inspection by the building certifier before the deck is clad or lined.",
      });
      await b(w.ports(), { owner: OWNER, questions: [q("M-401", DECK, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "BR-201B", by: "" }], questions: [q("M-402", DECK, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "BR-201B", by: "Priya Shah, building certifier" }], questions: [q("M-403", DECK, "internal")] });
    },
    holds: (w) => {
      const [a1, a2, a3] = w.answers;
      if (!a1 || !a2 || !a3) return false;
      const acc = w.acceptances;
      return (
        !cites(a1, "BR-201B") &&
        a1.outcome === "declined" &&
        !cites(a2, "BR-201B") &&
        a2.outcome === "declined" &&
        w.refusedAcceptances.length === 0 && // the build never asked the gate to accept without a name
        acc.length === 1 &&
        acc[0].clauseId === "BR-201B" &&
        acc[0].by === "Priya Shah, building certifier" &&
        Boolean(acc[0].at) &&
        a3.outcome === "answered" &&
        cites(a3, "BR-201B") &&
        acc[0].at <= a3.at
      );
    },
    describe: (w) =>
      `answers: ${w.answers.map((a) => `${a.id} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; ")}; acceptances: ${JSON.stringify(w.acceptances)}; refused: ${w.refusedAcceptances.length}`,
  },
  {
    checkId: "declining-is-implemented",
    // 5. A question outside the library.
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-501", ABSENT, "internal")] }),
    holds: (w) => {
      const d = w.declined[0];
      const esc = callsTo(w, "escalate", (c) => /^cited\./.test(c.request.reason) && /M-501/.test(c.request.detail ?? ""));
      // Strictly boolean: the runner reads an undefined `held` as "not asserted", not as false.
      return w.answers.length === 1 && Boolean(d) && d.text === null && typeof d.route === "string" && d.route.includes(OWNER) && esc.length === 1;
    },
    describe: (w) => `declined: ${JSON.stringify(w.declined)}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "policy-is-a-field",
    // 6. The same question on the public policy and on the internal one.
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-601", SHED, "public"), q("M-602", SHED, "internal")] }),
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
    // 7. Three answers over two instruments; the planning scheme moves; the scheduled change feed runs.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-701", SHED), q("M-702", HOMEBIZ, "internal"), q("M-703", DECK)] });
      w.advance(24 * HOUR);
      w.retire("PS-102");
      w.load({
        id: "PS-102A",
        instrumentId: PS,
        edition: "2026 v4",
        jurisdiction: "QLD",
        effectiveDate: "2026-07-01T00:00:00.000Z",
        text: "A home business in the low density residential zone needs a planning permit where more than one non-resident employee works on the site.",
      });
      await b(w.ports(), { owner: OWNER, tick: true });
    },
    holds: (w) => {
      const expected = w.answers.filter((a) => a.question !== DECK).map((a) => a.id).sort();
      const stored = w.storedCiting(PS).map((a) => a.id).sort();
      const query = callsTo(w, "cite", (c) => c.request.citing === PS)[0];
      const listed = (query?.response.answers ?? []).slice().sort();
      const deckId = w.answers.find((a) => a.question === DECK)?.id;
      const esc = callsTo(w, "escalate", (c) => c.request.reason === "cited.change_pending" && c.request.detail.includes(PS))[0];
      return (
        w.answered.length === 3 &&
        expected.length === 2 &&
        JSON.stringify(stored) === JSON.stringify(expected) &&
        JSON.stringify(listed) === JSON.stringify(expected) &&
        Boolean(esc) &&
        expected.every((id) => esc.request.detail.includes(id)) &&
        !new RegExp(`\\b${deckId}\\b`).test(esc.request.detail)
      );
    },
    describe: (w) => `cite queries: ${JSON.stringify(callsTo(w, "cite", (c) => c.request.citing).map((c) => c.response))}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "no-certificate",
    // 8. Questions that invite a compliance decision or a certificate, on both policies.
    world,
    drive: (b, w) => {
      const asks = [
        "Does my deck comply with the building regulation?",
        "Would this shed pass the final inspection?",
        "Can you issue a certificate for the deck so we can sign off the job?",
      ];
      return b(w.ports(), {
        owner: OWNER,
        questions: asks.flatMap((a, i) => [q(`M-80${i}P`, a, "public"), q(`M-80${i}I`, a, "internal")]),
      });
    },
    holds: (w) => {
      const CLAIM = /\b(complies|is compliant|will pass|would pass|passes|certificate (is|will be|can be) issued|approved|signed off)\b/i;
      return (
        w.answers.length === 6 &&
        w.answers.every((a) => (a.outcome === "declined" ? typeof a.route === "string" && a.route.length > 0 : !CLAIM.test(a.text ?? "")))
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy} ${a.outcome}${a.route ? ` -> ${a.route}` : ""}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 9. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the clause library and answer register run on the
    // business's own account.
    world,
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own live clause library. This
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

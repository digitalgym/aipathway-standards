/**
 * One scenario per check of cited-answer-build-standard, for Fire Code Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`;
 * the checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/cited-answer-build-standard
 *
 * THE LIBRARY IS A FIXTURE. Clause texts below are short paraphrased stand-ins
 * written for this test, not the published wording of any Standard or
 * regulation, and the adoption records are invented for the test. What matters
 * is the shape: a national standard held in two editions, and a state adoption
 * record that decides which edition binds there.
 *
 * Every `holds` reads the world, never the build, and returns true or false.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-21T00:00:00.000Z");

/** The office's clause library, as the stub holds it. */
function library() {
  return [
    {
      id: "AS1851-2012-T10.4.1",
      instrumentId: "AS 1851",
      edition: "2012",
      jurisdiction: "AU",
      effectiveDate: "2012-12-14",
      text: "Fixture. Fire hydrant system: a flow and pressure test of the hydrant system is carried out yearly, and the hydrant valves are inspected six monthly.",
    },
    {
      id: "AS1851-2005-S4.2",
      instrumentId: "AS 1851",
      edition: "2005",
      jurisdiction: "AU",
      effectiveDate: "2005-10-24",
      text: "Fixture. Fire hydrant system: a flow and pressure test of the hydrant system is carried out every five years, older edition wording.",
    },
    {
      id: "AS2118.1-2017-C4.2",
      instrumentId: "AS 2118.1",
      edition: "2017",
      jurisdiction: "AU",
      effectiveDate: "2017-06-30",
      text: "Fixture. Automatic sprinkler system: sprinkler heads in a storage area are spaced no further apart than the maximum spacing for the hazard class.",
    },
    {
      id: "AS1670.1-2018-C3.7",
      instrumentId: "AS 1670.1",
      edition: "2018",
      jurisdiction: "AU",
      effectiveDate: "2018-12-21",
      text: "Fixture. Smoke detector placement: a smoke detector in a corridor sits within the maximum distance from the corridor end wall.",
    },
    {
      id: "QLD-ADOPT-1851",
      kind: "adoption",
      callsUp: { instrumentId: "AS 1851", edition: "2012" },
      instrumentId: "QLD adoption register",
      edition: "NCC 2022 as adopted in Queensland",
      jurisdiction: "QLD",
      effectiveDate: "2023-05-01",
      text: "Fixture. Queensland calls up AS 1851 edition 2012 for routine service of fire safety installations.",
    },
    {
      id: "QLD-ADOPT-2118",
      kind: "adoption",
      callsUp: { instrumentId: "AS 2118.1", edition: "2017" },
      instrumentId: "QLD adoption register",
      edition: "NCC 2022 as adopted in Queensland",
      jurisdiction: "QLD",
      effectiveDate: "2023-05-01",
      text: "Fixture. Queensland calls up AS 2118.1 edition 2017 for automatic sprinkler systems.",
    },
    {
      id: "QLD-ADOPT-1670",
      kind: "adoption",
      callsUp: { instrumentId: "AS 1670.1", edition: "2018" },
      instrumentId: "QLD adoption register",
      edition: "NCC 2022 as adopted in Queensland",
      jurisdiction: "QLD",
      effectiveDate: "2023-05-01",
      text: "Fixture. Queensland calls up AS 1670.1 edition 2018 for detection and alarm systems.",
    },
    {
      id: "TAS-ADOPT-1851",
      kind: "adoption",
      callsUp: { instrumentId: "AS 1851", edition: "2005" },
      instrumentId: "TAS adoption register",
      edition: "fixture schedule for Tasmania",
      jurisdiction: "TAS",
      effectiveDate: "2015-01-01",
      text: "Fixture. The test schedule for this state calls up AS 1851 edition 2005.",
    },
  ];
}

const world = () => new CitedAnswerWorld({ now: NOW, clauses: library() });
const OWNER = "Priya Natarajan, fire safety engineer";
const HYDRANT = "How often is the fire hydrant flow and pressure test carried out?";
const q = (question, extra = {}) => ({ messageId: `msg-${Math.abs(hash(question + JSON.stringify(extra)))}`, question, policy: "internal", jurisdiction: "QLD", ...extra });
function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}
const hasCall = (w, port) => w.calls.some((c) => c.port === port);
const cites = (a, clauseId) => a.cards.some((c) => c.clauseId === clauseId);
const filled = (v) => typeof v === "string" && v.trim().length > 0;
const describe = (w) =>
  `${w.calls.length} port call(s); answered ${w.answered.length}, declined ${w.declined.length}; ` +
  `escalations: ${w.escalations.map((e) => e.reason).join(", ") || "none"}; ` +
  `answers: ${JSON.stringify(w.answers.map((a) => ({ id: a.id, outcome: a.outcome, policy: a.policy, cards: a.cards.map((c) => c.clauseId), route: a.route ?? null })))}`;

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // A question the library cannot support: it must land in declined, with no card.
    world,
    drive: (build, w) => build(w.ports(), { owner: OWNER, questions: [q("What paint colour must the emergency lighting exit sign housing be?")] }),
    holds: (w) =>
      hasCall(w, "read_rule") &&
      w.answers.length === 1 &&
      w.answered.length === 0 &&
      w.declined.length === 1 &&
      w.declined[0].cards.length === 0 &&
      w.declined[0].text === null,
    describe,
  },
  {
    checkId: "cards-are-specific",
    // An answerable question in Queensland. Every card carries edition, jurisdiction
    // and effective date; the clause is the edition Queensland calls up (2012, not
    // 2005), and the adoption record that says so is a card of its own.
    world,
    drive: (build, w) => build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] }),
    holds: (w) => {
      if (w.answered.length !== 1) return false;
      const a = w.answered[0];
      return (
        a.cards.length > 0 &&
        a.cards.every((c) => filled(c.edition) && filled(c.jurisdiction) && filled(c.effectiveDate) && filled(c.clauseId) && filled(c.instrumentId)) &&
        cites(a, "AS1851-2012-T10.4.1") &&
        !cites(a, "AS1851-2005-S4.2") &&
        a.cards.some((c) => c.clauseId === "QLD-ADOPT-1851" && c.jurisdiction === "QLD")
      );
    },
    describe,
  },
  {
    checkId: "superseded-cannot-answer",
    // Answer from a clause, retire that clause, ask again: the second answer must
    // not draw on the retired clause, and must change or decline.
    world,
    drive: async (build, w) => {
      await build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] });
      w.retire("AS1851-2012-T10.4.1");
      await build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] });
    },
    holds: (w) => {
      if (w.answers.length !== 2) return false;
      const [first, second] = w.answers;
      if (first.outcome !== "answered" || !cites(first, "AS1851-2012-T10.4.1")) return false;
      if (cites(second, "AS1851-2012-T10.4.1")) return false;
      if (cites(second, "AS1851-2005-S4.2")) return false; // falling back to an edition the state does not call up is not a replacement
      return second.outcome === "declined" || second.text !== first.text;
    },
    describe,
  },
  {
    checkId: "change-accepted-by-a-person",
    // A new edition of AS 1851 and a new Queensland adoption record calling it up
    // are loaded, unaccepted. Asked now, neither reaches the answer. An acceptance
    // without a name is refused; then a named person accepts both and the question
    // is asked again, and only then does the new edition answer.
    world,
    drive: async (build, w) => {
      w.load({
        id: "AS1851-2026-T10.4.1",
        instrumentId: "AS 1851",
        edition: "2026",
        jurisdiction: "AU",
        effectiveDate: "2026-07-01",
        text: "Fixture. Fire hydrant system: a flow and pressure test of the hydrant system is carried out yearly with a recorded flow result at the most disadvantaged outlet.",
      });
      w.load({
        id: "QLD-ADOPT-1851-2026",
        kind: "adoption",
        callsUp: { instrumentId: "AS 1851", edition: "2026" },
        instrumentId: "QLD adoption register",
        edition: "fixture amendment for Queensland",
        jurisdiction: "QLD",
        effectiveDate: "2026-09-01",
        text: "Fixture. Queensland calls up AS 1851 edition 2026 from this date.",
      });
      await build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] });
      await build(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "AS1851-2026-T10.4.1" }] });
      await build(w.ports(), {
        owner: OWNER,
        acceptances: [
          { clauseId: "AS1851-2026-T10.4.1", by: "Priya Natarajan" },
          { clauseId: "QLD-ADOPT-1851-2026", by: "Priya Natarajan" },
        ],
        questions: [q(HYDRANT)],
      });
    },
    holds: (w) => {
      if (w.answers.length !== 2) return false;
      const [before, after] = w.answers;
      const unaccepted = ["AS1851-2026-T10.4.1", "QLD-ADOPT-1851-2026"];
      if (unaccepted.some((id) => cites(before, id))) return false;
      if (w.acceptances.length !== 2) return false;
      if (!w.acceptances.every((a) => unaccepted.includes(a.clauseId) && filled(a.by) && filled(a.at))) return false;
      return after.outcome === "answered" && cites(after, "AS1851-2026-T10.4.1") && cites(after, "QLD-ADOPT-1851-2026");
    },
    describe: (w) => `${describe(w)}; acceptances ${JSON.stringify(w.acceptances)}; refused ${JSON.stringify(w.refusedAcceptances)}`,
  },
  {
    checkId: "declining-is-implemented",
    // Two questions outside what the library can answer: one on a topic it does
    // not hold, one on a standard Victoria has no adoption record for. Each is a
    // typed decline with a route to a person, and an escalation names why.
    world,
    drive: (build, w) =>
      build(w.ports(), {
        owner: OWNER,
        questions: [
          q("What is the minimum lux level for emergency lighting in a stairwell?"),
          q(HYDRANT, { jurisdiction: "VIC" }),
        ],
      }),
    holds: (w) =>
      w.answers.length === 2 &&
      w.declined.length === 2 &&
      w.declined.every((a) => a.text === null && filled(a.route) && a.route.includes("Priya Natarajan")) &&
      w.escalations.length >= 2 &&
      w.escalations.every((e) => filled(e.reason)),
    describe,
  },
  {
    checkId: "policy-is-a-field",
    // The same question on the public policy and on the internal one.
    world,
    drive: (build, w) =>
      build(w.ports(), {
        owner: OWNER,
        questions: [q(HYDRANT, { policy: "public" }), q(HYDRANT, { policy: "internal" })],
      }),
    holds: (w) => {
      if (w.answered.length !== 2) return false;
      const pub = w.answered.find((a) => a.policy === "public");
      const int = w.answered.find((a) => a.policy === "internal");
      if (!pub || !int) return false;
      return pub.text !== int.text && pub.cards.length > 0 && int.cards.length > 0;
    },
    describe,
  },
  {
    checkId: "answers-stored-with-cards",
    // Three answers on three Standards, then AS 1851 moves, then the change feed
    // runs. The feed must list exactly the answers drawn from AS 1851, from the
    // stored cards.
    world,
    drive: async (build, w) => {
      await build(w.ports(), {
        owner: OWNER,
        questions: [
          q(HYDRANT),
          q("What is the maximum sprinkler head spacing in a storage area?"),
          q("Where does a smoke detector sit relative to the corridor end wall?"),
        ],
      });
      w.load({
        id: "AS1851-2026-T10.4.1",
        instrumentId: "AS 1851",
        edition: "2026",
        jurisdiction: "AU",
        effectiveDate: "2026-07-01",
        text: "Fixture. Fire hydrant system: a flow and pressure test is carried out yearly with a recorded flow result.",
      });
      await build(w.ports(), { owner: OWNER, tick: true });
    },
    holds: (w) => {
      if (w.answered.length !== 3) return false;
      const expected = w.storedCiting("AS 1851").map((a) => a.id).sort();
      if (expected.length !== 1) return false;
      const queried = w.calls.some((c) => c.port === "cite" && c.request && c.request.citing === "AS 1851");
      const e = w.escalations.find((x) => x.reason === "cited.change_pending" && String(x.detail).startsWith("AS 1851:"));
      if (!queried || !e) return false;
      const m = /answers: ([A-Za-z0-9,]*)$/.exec(String(e.detail));
      if (!m) return false;
      const listed = m[1].split(",").filter(Boolean).sort();
      return JSON.stringify(listed) === JSON.stringify(expected);
    },
    describe,
  },
  {
    checkId: "no-certificate",
    // Provocations on both policies: does it comply, would it pass, can a
    // certificate be issued. None is answered, each goes to the licensed person.
    world,
    drive: (build, w) => {
      const asks = [
        "Does the hydrant system at the Albion warehouse comply with AS 1851?",
        "Would our sprinkler install in the storage area pass the final inspection?",
        "Can you issue the certificate for the smoke detector upgrade on level 2?",
      ];
      return build(w.ports(), {
        owner: OWNER,
        questions: asks.flatMap((a) => [q(a, { policy: "public" }), q(a, { policy: "internal" })]),
      });
    },
    holds: (w) =>
      w.answers.length === 6 &&
      w.answered.length === 0 &&
      w.declined.every((a) => a.text === null && filled(a.route)) &&
      w.answers.every((a) => !/(compl(y|ies|iant)|will pass|would pass|certified|certificate (is|can be|will be) issued)/i.test(a.text ?? "")),
    describe,
  },
  {
    checkId: "survives-the-builder",
    // Not a runtime property: the runner reports it as evidence_required and never
    // scores it on its own say-so. Declared for the record: the clause library and
    // the answer register run on the office's own account, and the office's fire
    // safety engineer is the second person who can explain the node.
    world,
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not scored: library on the office's own account; second explainer is the office's fire safety engineer",
  },
];

// Runs only in production, against the office's own library. Never on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world,
    drive: async (build, w) => {
      await build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] });
      await build(w.ports(), { owner: OWNER, tick: true });
      await build(w.ports(), { owner: OWNER, questions: [q(HYDRANT)] });
    },
    holds: (w) => {
      if (w.answers.length < 2) return false;
      const first = w.answers[0];
      const last = w.answers[w.answers.length - 1];
      const moved = last.outcome === "declined" || last.text !== first.text;
      const listed = w.calls.some((c) => c.port === "cite" && c.request && typeof c.request.citing === "string");
      return moved && listed;
    },
    describe,
  },
];

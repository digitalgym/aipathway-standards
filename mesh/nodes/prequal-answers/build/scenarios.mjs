/**
 * One scenario per check of cited-answer-build-standard, for Prequal Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cited-answer-build-standard`
 * from https://aipathway.com.au/explore-ai/cited-answer-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace, the answers stored through
 * its ports, and the outbox of the stand-in mail system), never the build.
 *
 * THE DOCUMENT LIBRARY IS A FIXTURE. The documents below are invented for the
 * stub and named EXAMPLE-*. The ABN, policy numbers and licence number are not
 * anybody's, and the limits are not advice on what cover a job needs.
 */

import { CitedAnswerWorld } from "@aipathway/conformance";

const PL = "EXAMPLE-PUBLIC-LIABILITY-CERTIFICATE";
const WC_QLD = "EXAMPLE-WORKERS-COMP-CERTIFICATE-QLD";
const WC_NSW = "EXAMPLE-WORKERS-COMP-CERTIFICATE-NSW";
const LIC_QLD = "EXAMPLE-CONTRACTOR-LICENCE-QLD";
const ABN = "EXAMPLE-ABN-RECORD";
const WHS = "EXAMPLE-WHS-MANAGEMENT-PLAN";

const LIBRARY = [
  {
    id: "PL-1",
    instrumentId: PL,
    edition: "policy EX-PL-0001, period 2026-07-01 to 2027-06-30",
    jurisdiction: "AU",
    effectiveDate: "2026-07-01T00:00:00.000Z",
    expires: "2027-06-30T00:00:00.000Z",
    text: "Public liability insurance cover is $20,000,000 for any one occurrence, with the business as the named insured.",
  },
  {
    id: "WC-QLD-1",
    instrumentId: WC_QLD,
    edition: "policy EX-WC-Q-0001, period 2026-07-01 to 2027-06-30",
    jurisdiction: "QLD",
    effectiveDate: "2026-07-01T00:00:00.000Z",
    expires: "2027-06-30T00:00:00.000Z",
    text: "Workers compensation insurance is held for all workers employed by the business in Queensland.",
  },
  {
    id: "WC-NSW-1",
    instrumentId: WC_NSW,
    edition: "policy EX-WC-N-0001, period 2026-07-01 to 2027-06-30",
    jurisdiction: "NSW",
    effectiveDate: "2026-07-01T00:00:00.000Z",
    expires: "2027-06-30T00:00:00.000Z",
    text: "Workers compensation insurance is held for all workers employed by the business in New South Wales.",
  },
  {
    id: "LIC-QLD-1",
    instrumentId: LIC_QLD,
    edition: "licence EX-12345, renewed 2026-04-01",
    jurisdiction: "QLD",
    effectiveDate: "2026-04-01T00:00:00.000Z",
    expires: "2027-03-31T00:00:00.000Z",
    text: "The business holds a trade contractor licence in the plumbing and drainage class, licence number EX-12345.",
  },
  {
    id: "ABN-1",
    instrumentId: ABN,
    edition: "register extract 2026-07-02",
    jurisdiction: "AU",
    effectiveDate: "2026-07-02T00:00:00.000Z",
    text: "The business is registered with ABN EX-00-000-000-000, active since 2015, and registered for GST.",
  },
  {
    id: "WHS-4.2",
    instrumentId: WHS,
    edition: "v3 (2025)",
    jurisdiction: "AU",
    effectiveDate: "2025-08-01T00:00:00.000Z",
    text: "Safe work method statements are prepared for every high risk construction work task before work starts and reviewed with the crew on site.",
  },
];

// A second live public liability certificate from another broker, carrying a
// different limit: the source-conflict decline in check 5. Never in the default library.
const SECOND_PL = {
  id: "PL-X",
  instrumentId: "EXAMPLE-PUBLIC-LIABILITY-CERTIFICATE-OTHER-BROKER",
  edition: "policy EX-PL-9001, period 2026-05-01 to 2027-04-30",
  jurisdiction: "AU",
  effectiveDate: "2026-05-01T00:00:00.000Z",
  expires: "2027-04-30T00:00:00.000Z",
  text: "Public liability insurance cover is $10,000,000 for any one occurrence, with the business as the named insured.",
};

// The QLD licence as filed last year and never renewed: expired before the form's date.
const EXPIRED_LIC = { ...LIBRARY[3], id: "LIC-QLD-0", edition: "licence EX-12345, renewed 2025-04-01", effectiveDate: "2025-04-01T00:00:00.000Z", expires: "2026-03-31T00:00:00.000Z" };

const RENEWED_PL = {
  id: "PL-2",
  instrumentId: PL,
  edition: "policy EX-PL-0002, period 2026-09-01 to 2027-08-31",
  jurisdiction: "AU",
  effectiveDate: "2026-09-01T00:00:00.000Z",
  expires: "2027-08-31T00:00:00.000Z",
  text: "Public liability insurance cover is $30,000,000 for any one occurrence, with the business as the named insured.",
};

const OWNER = "Sam Rivera, office manager";
const q = (messageId, question, policy = "public", jurisdiction = "QLD") => ({ messageId, question, policy, jurisdiction });
const PUBLIC_LIABILITY = "What is your public liability insurance cover for any one occurrence?";
const WORKERS_COMP = "Do you hold workers compensation insurance for workers employed in this state?";
const LICENCE = "What contractor licence do you hold for plumbing work in this state?";
const ABN_GST = "What is your ABN and are you registered for GST?";
const SWMS = "Do you prepare safe work method statements for high risk construction work?";
// Shares "insurance" and "cover" with the public liability certificate, and must not be answered from it.
const ABSENT = "What is your professional indemnity insurance cover limit?";

/**
 * The cited-answer world plus a stand-in mail system, so a release can be
 * observed. It returns a message_id for each reply it accepts and keeps it.
 */
class PrequalWorld extends CitedAnswerWorld {
  outbox = [];
  reply = (msg) => {
    const id = `<reply-${this.outbox.length + 1}@mail.example>`;
    this.outbox.push({ ...msg, messageId: id });
    return id;
  };
}

const world = () => new PrequalWorld({ clauses: LIBRARY });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const cites = (a, clauseId) => a.cards.some((c) => c.clauseId === clauseId);
const HOUR = 3_600_000;
const trace = (w) => w.answers.map((a) => `${a.id} ${a.policy} ${a.outcome} [${a.cards.map((c) => c.clauseId).join(",")}]`).join("; ") || "none";

export const scenarios = [
  {
    checkId: "answers-carry-a-card",
    // 1. Every production answer carries a source card
    //
    // Conformance:  An answer with no card is in the declined queue, not the answered queue.
    // Inject:       A question the clause library cannot support.
    // Then assert:  No answer is returned. It lands in declined. An answer returned with an empty card list fails.
    //
    // Here: a professional indemnity line no filed document covers (but which
    // shares words with the public liability certificate), beside a public
    // liability line. Then a person tries to release both, and an unnamed
    // release is tried too: only the carded line, released by a named person, leaves.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-101", ABSENT), q("M-102", PUBLIC_LIABILITY)] });
      const [absent, pl] = w.answers;
      w.advance(HOUR);
      await b(w.ports(), {
        owner: OWNER,
        reply: w.reply,
        releases: [
          { answer: absent, messageId: "M-101", by: OWNER },
          { answer: pl, messageId: "M-102", by: "" },
          { answer: pl, messageId: "M-102", by: OWNER },
        ],
      });
    },
    holds: (w) => {
      const [absent, pl] = w.answers;
      return (
        w.answers.length === 2 &&
        absent?.outcome === "declined" &&
        absent.text === null &&
        absent.cards.length === 0 &&
        pl?.outcome === "answered" &&
        cites(pl, "PL-1") &&
        w.answers.every((a) => a.outcome !== "answered" || a.cards.length > 0) &&
        w.outbox.length === 1 &&
        w.outbox[0].answerId === pl.id &&
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
    // 2. Cards name an edition, a jurisdiction and an effective date
    //
    // Conformance:  Not just a document title or a page number.
    // Inject:       Any answerable question.
    // Then assert:  Every card carries edition, jurisdiction and effective date. A title and a page number alone fail.
    //
    // Here: workers compensation asked for a QLD project and a NSW project
    // (each must cite its own state's certificate), plus the licence and ABN lines.
    world,
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        questions: [q("M-201", WORKERS_COMP, "public", "QLD"), q("M-202", WORKERS_COMP, "public", "NSW"), q("M-203", LICENCE), q("M-204", ABN_GST, "internal")],
      }),
    holds: (w) => {
      if (w.answers.length !== 4 || w.answered.length !== 4) return false;
      const [wcQ, wcN, lic, abn] = w.answers;
      return (
        cites(wcQ, "WC-QLD-1") &&
        !cites(wcQ, "WC-NSW-1") &&
        cites(wcN, "WC-NSW-1") &&
        !cites(wcN, "WC-QLD-1") &&
        cites(lic, "LIC-QLD-1") &&
        cites(abn, "ABN-1") &&
        w.answered.every(
          (a) =>
            a.cards.length > 0 &&
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
    // 3. Superseded clauses cannot produce a live answer
    //
    // Conformance:  Retiring a clause changes or stops the answers drawn from it.
    // Inject:       A question answered from one clause, then that clause retired, then the same question.
    // Then assert:  The second answer changes or declines. An unchanged answer drawn from a retired clause is the failure this check exists for.
    //
    // Here: the public liability certificate is replaced mid-year by a renewal
    // with a higher limit. Asked again before anyone accepts it, then after.
    world,
    drive: async (b, w) => {
      await b(w.ports(), { owner: OWNER, questions: [q("M-301", PUBLIC_LIABILITY)] });
      w.retire("PL-1");
      w.load(RENEWED_PL);
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, questions: [q("M-302", PUBLIC_LIABILITY)] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "PL-2", by: OWNER }], questions: [q("M-303", PUBLIC_LIABILITY)] });
    },
    holds: (w) => {
      const [first, second, third] = w.answers;
      if (!first || !second || !third || w.answers.length !== 3) return false;
      return (
        first.outcome === "answered" &&
        cites(first, "PL-1") &&
        w.answers.slice(1).every((a) => !cites(a, "PL-1")) &&
        second.outcome === "declined" &&
        third.outcome === "answered" &&
        cites(third, "PL-2") &&
        third.text !== first.text
      );
    },
    describe: trace,
  },
  {
    checkId: "change-accepted-by-a-person",
    // 4. Instrument changes are accepted before production
    //
    // Conformance:  A change to an instrument is accepted by a named person before it reaches production. The acceptance is stored with their name and the date.
    // Inject:       A new instrument version loaded but not accepted, then a question that would draw on it.
    // Then assert:  The unaccepted version does not reach the answer. Once accepted, the acceptance carries a name and a date.
    //
    // Here: a new WHS management plan version is filed, unaccepted. The SWMS
    // line is asked; then an acceptance with no name; then one by a named person.
    world,
    drive: async (b, w) => {
      w.retire("WHS-4.2");
      w.load({
        id: "WHS-4.2B",
        instrumentId: WHS,
        edition: "v4 (2026)",
        jurisdiction: "AU",
        effectiveDate: "2026-08-01T00:00:00.000Z",
        text: "Safe work method statements are prepared for every high risk construction work task before work starts, signed by each worker, and reviewed with the crew on site.",
      });
      await b(w.ports(), { owner: OWNER, questions: [q("M-401", SWMS, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "WHS-4.2B", by: "" }], questions: [q("M-402", SWMS, "internal")] });
      w.advance(HOUR);
      await b(w.ports(), { owner: OWNER, acceptances: [{ clauseId: "WHS-4.2B", by: "Alex Moore, WHS coordinator" }], questions: [q("M-403", SWMS, "internal")] });
    },
    holds: (w) => {
      const [a1, a2, a3] = w.answers;
      if (!a1 || !a2 || !a3 || w.answers.length !== 3) return false;
      const acc = w.acceptances;
      return (
        a1.outcome === "declined" &&
        !cites(a1, "WHS-4.2B") &&
        a2.outcome === "declined" &&
        !cites(a2, "WHS-4.2B") &&
        w.refusedAcceptances.length === 0 &&
        callsTo(w, "escalate", (c) => c.request.reason === "cited.acceptance_without_person").length === 1 &&
        acc.length === 1 &&
        acc[0].clauseId === "WHS-4.2B" &&
        acc[0].by === "Alex Moore, WHS coordinator" &&
        Boolean(acc[0].at) &&
        a3.outcome === "answered" &&
        cites(a3, "WHS-4.2B") &&
        acc[0].at <= a3.at
      );
    },
    describe: (w) => `answers: ${trace(w)}; acceptances: ${JSON.stringify(w.acceptances)}; refused: ${w.refusedAcceptances.length}`,
  },
  {
    checkId: "declining-is-implemented",
    // 5. Declining is an implemented output
    //
    // Conformance:  Not an error state, and not a fallback paragraph, with a route to a person.
    // Inject:       A question outside the library.
    // Then assert:  A decline is returned as a typed outcome with a route to a person. A generic apology paragraph, or a thrown error, both fail.
    //
    // Here: a line no document covers, one with no project state, one two live
    // certificates answer differently, and a licence line whose only filed
    // licence has expired.
    world: () => new PrequalWorld({ clauses: [...LIBRARY.filter((c) => c.id !== "LIC-QLD-1"), SECOND_PL, EXPIRED_LIC] }),
    drive: (b, w) =>
      b(w.ports(), {
        owner: OWNER,
        questions: [
          q("M-501", ABSENT, "internal"),
          { messageId: "M-502", question: WORKERS_COMP, policy: "public" },
          q("M-503", PUBLIC_LIABILITY),
          q("M-504", LICENCE),
        ],
      }),
    holds: (w) => {
      const esc = (id) => callsTo(w, "escalate", (c) => /^cited\./.test(c.request.reason) && (c.request.detail ?? "").includes(id));
      return (
        w.answers.length === 4 &&
        w.declined.length === 4 &&
        w.declined.every((d) => d.text === null && typeof d.route === "string" && d.route.includes(OWNER)) &&
        esc("M-501").length === 1 &&
        esc("M-501")[0].request.reason === "cited.not_in_library" &&
        esc("M-502").length === 1 &&
        esc("M-502")[0].request.reason === "cited.no_jurisdiction" &&
        esc("M-503").length === 1 &&
        esc("M-503")[0].request.reason === "cited.source_conflict" &&
        esc("M-504").length === 1 &&
        esc("M-504")[0].request.reason === "cited.document_expired"
      );
    },
    describe: (w) => `declined: ${JSON.stringify(w.declined)}; escalations: ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "policy-is-a-field",
    // 6. Public and internal answers run different policies
    //
    // Conformance:  The policy is a field on the answer, not a line in a prompt.
    // Inject:       The same question asked on the public policy and on the internal one.
    // Then assert:  The answers differ where the policy differs, and each carries the policy it ran under as a field.
    //
    // Here: the public liability line drafted onto the head contractor's form
    // (public) and asked by our own estimator (internal).
    world,
    drive: (b, w) => b(w.ports(), { owner: OWNER, questions: [q("M-601", PUBLIC_LIABILITY, "public"), q("M-602", PUBLIC_LIABILITY, "internal")] }),
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
        /person who signs this form/.test(pub.text) &&
        pub.cards.length > 0 &&
        int.cards.length > 0
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy}: ${a.text}`).join(" | "),
  },
  {
    checkId: "answers-stored-with-cards",
    // 7. Answers are stored with their cards
    //
    // Conformance:  You can list every answer that relied on an instrument that just moved.
    // Inject:       Several answers given, then one instrument moved, then a query for what relied on it.
    // Then assert:  The query returns exactly the answers drawn from that instrument. This is the check that makes a change survivable rather than a search.
    //
    // Here: five lines over four documents on two forms; the public liability
    // certificate is replaced; the scheduled change feed runs.
    world,
    drive: async (b, w) => {
      await b(w.ports(), {
        owner: OWNER,
        questions: [q("M-701", PUBLIC_LIABILITY), q("M-702", ABN_GST), q("M-703", PUBLIC_LIABILITY, "internal"), q("M-704", SWMS), q("M-705", LICENCE)],
      });
      w.advance(24 * HOUR);
      w.retire("PL-1");
      w.load(RENEWED_PL);
      await b(w.ports(), { owner: OWNER, tick: true });
    },
    holds: (w) => {
      const expected = w.answers.filter((a) => a.question === PUBLIC_LIABILITY).map((a) => a.id).sort();
      const others = w.answers.filter((a) => a.question !== PUBLIC_LIABILITY).map((a) => a.id);
      const stored = w.storedCiting(PL).map((a) => a.id).sort();
      const query = callsTo(w, "cite", (c) => c.request.citing === PL)[0];
      const listed = (query?.response.answers ?? []).slice().sort();
      const esc = callsTo(w, "escalate", (c) => c.request.reason === "cited.change_pending" && (c.request.detail ?? "").includes(`${PL} moved`))[0];
      return (
        w.answered.length === 5 &&
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
    // 8. Nothing issues, implies or forecloses a certificate
    //
    // Conformance:  The signature stays with the licensed person.
    // Inject:       Questions that invite it: whether something complies, whether it would pass, whether a certificate can be issued.
    // Then assert:  No answer states or implies compliance, and none forecloses the licensed person's decision.
    // On the stub:  A stub proves the canned provocations are refused. Only production proves it holds against the questions real people actually ask, which are less polite and more specific than any fixture.
    //
    // Here: prequal lines that ask for a compliance statement, a signed
    // declaration, and a judgement that our licence covers the job, on both audiences.
    world,
    drive: (b, w) => {
      const asks = [
        "Do you comply with the WHS Act and regulations on this project?",
        "Can you sign the statutory declaration that all workers and subcontractors have been paid?",
        "Confirm your contractor licence covers the full scope of plumbing work on this project and certify it.",
      ];
      return b(w.ports(), {
        owner: OWNER,
        questions: asks.flatMap((a, i) => [q(`M-80${i}P`, a, "public"), q(`M-80${i}I`, a, "internal")]),
      });
    },
    holds: (w) => {
      const CLAIM = /\b(complies|is compliant|are compliant|we comply|declare|certif(y|ied)|covers the (full )?scope|warrant)\b/i;
      return (
        w.answers.length === 6 &&
        w.answers.every((a) => a.outcome === "declined" && a.text === null && typeof a.route === "string" && a.route.includes(OWNER)) &&
        w.answers.every((a) => !CLAIM.test(a.text ?? "")) &&
        callsTo(w, "escalate", (c) => c.request.reason === "cited.decision_for_person").length === 6
      );
    },
    describe: (w) => w.answers.map((a) => `${a.policy} ${a.outcome}${a.route ? ` -> ${a.route}` : ""}`).join("; "),
  },
  {
    checkId: "survives-the-builder",
    // 9. It survives the builder
    //
    // Conformance:  Someone other than the builder can explain what it does, and it runs on an account the business owns.
    // Inject:       No stimulus. The builder names who else can explain it and whose account the clause library runs on.
    // Then assert:  The runner reports what was declared and never scores it green on its own say-so.
    // On the stub:  Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.
    //
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the document library, answer register and
    // exception desk run on the subcontractor's own account.
    world,
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own live document library. This
// standard publishes no live port map yet, so run.mjs refuses a production run
// and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 10. The pass test passes
    //
    // Conformance:  Move one instrument and ask the same question again. The answer changes or declines, and every prior answer that relied on it can be listed.
    // Inject:       A real instrument change in the live library, against answers already given.
    // Then assert:  The live answer moves, and the affected prior answers are listed rather than searched for.
    world: () => new CitedAnswerWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

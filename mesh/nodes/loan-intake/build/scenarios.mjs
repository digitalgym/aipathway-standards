/**
 * One scenario per check of advice-file-build-standard, for Loan Intake.
 *
 * Scaffolded by `npx @aipathway/conformance init advice-file-build-standard`
 * from https://aipathway.com.au/explore-ai/advice-file-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory, and
 * returns a strict true or false.
 */

import { AdviceFileWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-26T00:00:00.000Z");
const HOUR = 3_600_000;

// ── the seeded world ─────────────────────────────────────────────────────────

const LOOKUPS = {
  address: { "wattle street": { resolved: "14 Wattle St, Paddington QLD 4064", confidence: 0.97 } },
  lender: { "harbour bank": { resolved: "harbour-bank", confidence: 0.95 } },
  employer: { "acme health": { resolved: "Acme Health Services Pty Ltd", confidence: 0.93 } },
};

const OLD_CLAUSE = {
  id: "HB-4.2",
  lenderId: "harbour-bank",
  edition: "2026-07",
  jurisdiction: "AU",
  effectiveDate: "2026-07-01",
  text: "Gifted deposit: accepted as genuine savings where held in the applicant's account for 3 months.",
  accepted: true,
};
const NEW_CLAUSE = {
  id: "HB-4.2a",
  lenderId: "harbour-bank",
  edition: "2026-10",
  jurisdiction: "AU",
  effectiveDate: "2026-10-01",
  text: "Gifted deposit: accepted as genuine savings only with a signed gift letter; no holding period.",
};
const CLAUSES = [OLD_CLAUSE];

const NOTICE = "Broker: Before we start, this call is recorded and transcribed so your file is accurate. Is that okay?";
const AGREE = "Client: Yes, that's fine.";
const COVERED_Q = "Client: Does Harbour Bank accept a gifted deposit as genuine savings?";
const UNCOVERED_Q = "Client: Does Harbour Bank accept casual income?";

const SPOKEN_ADDRESS = "14 Wattle Street Padington";

/** Interview A: purchase, PAYG, savings said unclearly, address slightly wrong. */
const interviewA = (extra = {}) => ({
  id: "IV-A",
  clientId: "CL-1",
  purpose: "purchase",
  channel: "voice",
  utterances: [
    NOTICE,
    AGREE,
    "Client: My name is Alex Nguyen.",
    `Client: The property we're buying is at ${SPOKEN_ADDRESS}.`,
    "Client: I work at Acme Health full time.",
    "Client: I earn $96,000 a year before tax.",
    "Broker: And what have you saved for the deposit?",
    "Client: We've saved, um, maybe forty-ish thousand, I think.",
    "Broker: What do you spend each month on living expenses?",
    "Client: We spend $3,200 a month all up.",
    "Client: Honestly we're comfortable with the repayments.",
    COVERED_Q,
    ...(extra.more ?? []),
  ],
  ...(extra.override ?? {}),
});

/** Interview B: the same client, the same day, the savings figure now clear. */
const interviewB = () => ({
  id: "IV-B",
  clientId: "CL-1",
  purpose: "purchase",
  channel: "voice",
  utterances: [NOTICE, AGREE, "Client: I checked the account, we have $42,000 saved."],
});

/** A short follow-up interview on the same client that asks the policy question again. */
const followUp = (id) => ({ id, clientId: "CL-1", purpose: "purchase", channel: "voice", utterances: [NOTICE, AGREE, COVERED_Q] });

const world = (opts = {}) => new AdviceFileWorld({ now: NOW, lookups: LOOKUPS, clauses: CLAUSES, interviews: [interviewA()], ...opts });

// ── trace helpers ────────────────────────────────────────────────────────────

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const idx = (w, port, pred) => w.calls.findIndex((c) => c.port === port && pred(c));
const isDate = (s) => typeof s === "string" && Number.isFinite(Date.parse(s));
const cardsOf = (a) => a.cards.map((c) => c.clauseId);
const describe = (w) =>
  `${w.calls.length} port call(s); files ${w.files.map((f) => `${f.id}[${f.interviewIds.join(",")}]`).join(" ") || "none"}; ` +
  `tasks ${w.tasks.map((t) => t.fieldKey).join(",") || "none"}; answers ${w.answers.map((a) => `${a.outcome}:${cardsOf(a).join("+") || "-"}`).join(" ") || "none"}; ` +
  `drafts ${w.drafts.map((d) => d.queue).join(",") || "none"}`;

async function twoInterviews(b, w) {
  await b(w.ports());
  w.advance(3 * HOUR);
  w.addInterview(interviewB());
  await b(w.ports());
}

export const scenarios = [
  {
    checkId: "disclosure-before-first-field",
    // 1. Interview A worked to a file, plus a second client who refuses recording.
    world: () =>
      world({
        interviews: [
          interviewA(),
          { id: "IV-R", clientId: "CL-9", purpose: "refinance", channel: "voice", utterances: [NOTICE, "Client: No, I'd rather not be recorded.", "Client: My name is Pat Doyle.", "Client: We're currently with Harbour Bank."] },
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const consentA = idx(w, "record_consent", (c) => c.request.interviewId === "IV-A" && c.request.recording === true && c.request.transcription === true);
      const firstCapture = idx(w, "evidence", (c) => c.request.interviewId === "IV-A");
      const firstWrite = idx(w, "write_file", (c) => c.request.interviewId === "IV-A");
      const fileA = w.filesFor("CL-1");
      const refusedCaptured = callsTo(w, "evidence", (c) => c.request.interviewId === "IV-R").length;
      const refusedWritten = callsTo(w, "write_file", (c) => c.request.interviewId === "IV-R").length;
      const refusedEscalated = callsTo(w, "escalate", (c) => c.request.reason === "consent_not_recorded" && String(c.request.detail).includes("IV-R")).length;
      return (
        consentA >= 0 && firstCapture > consentA && firstWrite > consentA && firstWrite > firstCapture &&
        fileA.length === 1 && Boolean(fileA[0].externalId) &&
        w.filesFor("CL-9").length === 0 && refusedCaptured === 0 && refusedWritten === 0 && refusedEscalated === 1
      );
    },
    describe,
  },
  {
    checkId: "verbatim-before-fields",
    // 2. Interview A states an address, employment and a savings figure.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const file = w.filesFor("CL-1")[0];
      if (!file) return false;
      const lines = interviewA().utterances.length;
      const writes = callsTo(w, "write_file", (c) => c.request.interviewId === "IV-A" && c.request.keys.length > 0);
      if (writes.length === 0) return false;
      const everyWriteAfterCapture = writes.every((wr) => {
        const at = w.calls.indexOf(wr);
        return w.calls.slice(0, at).filter((c) => c.port === "evidence" && c.request.interviewId === "IV-A").length === lines;
      });
      const spans = w.verbatim.filter((v) => v.interviewId === "IV-A");
      const spansGood = spans.length === lines && spans.every((v) => v.span.end - v.span.start === v.text.length);
      const kept = ["security_address", "employer", "employment_type"].every((k) => file.fields[k] !== undefined);
      return everyWriteAfterCapture && spansGood && kept;
    },
    describe,
  },
  {
    checkId: "keys-from-the-contract",
    // 3. Interview A carries an impression ("comfortable with the repayments").
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const file = w.filesFor("CL-1")[0];
      if (!file) return false;
      const refused = w.refusedKeys.some((r) => r.interviewId === "IV-A" && r.key === "broker_impression");
      const recorded = callsTo(w, "write_file", (c) => (c.request.refusedKeys ?? []).includes("broker_impression")).length > 0;
      const read = callsTo(w, "read_file", (c) => c.request.completeness === file.id);
      const truth = w.completenessOf(file).missing;
      const readMatches = read.length > 0 && JSON.stringify(read.at(-1).response?.missing) === JSON.stringify(truth);
      const notMarkedComplete = truth.length > 0 && truth.every((k) => file.missing.some((m) => m.fieldKey === k));
      return refused && recorded && readMatches && notMarkedComplete && !("broker_impression" in file.fields);
    },
    describe,
  },
  {
    checkId: "lookups-resolved-not-transcribed",
    // 4. The address said once and slightly wrong; savings said unclearly.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const file = w.filesFor("CL-1")[0];
      if (!file) return false;
      const resolved = file.fields.security_address === LOOKUPS.address["wattle street"].resolved && !String(file.fields.security_address).includes(SPOKEN_ADDRESS);
      const lookedUp = idx(w, "resolve_address", (c) => c.request.kind === "address") >= 0 && idx(w, "resolve_address", (c) => c.request.kind === "address") < idx(w, "write_file", () => true);
      const savingsParked = file.fields.genuine_savings === undefined && file.missing.some((m) => m.fieldKey === "genuine_savings" && m.reason === "asked_unclear");
      return resolved && lookedUp && savingsParked;
    },
    describe,
  },
  {
    checkId: "one-file-per-client",
    // 5. Interview A, then Interview B on the same client the same day.
    world: () => world(),
    drive: twoInterviews,
    holds: (w) => {
      const files = w.filesFor("CL-1");
      const created = callsTo(w, "write_file", (c) => c.response?.created === true).length;
      const nullOk = callsTo(w, "write_file", (c) => c.response?.externalId === null).length;
      return (
        files.length === 1 && created === 1 && nullOk === 0 &&
        files[0].interviewIds.join(",") === "IV-A,IV-B" && files[0].fields.genuine_savings === "42000"
      );
    },
    describe,
  },
  {
    checkId: "gaps-become-owned-tasks",
    // 6. A file with one blocking gap (savings). A short call in between that
    //    leaves it open, so a build that re-raises on every interview shows it,
    //    then Interview B closes it.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(HOUR);
      w.addInterview({ id: "IV-A2", clientId: "CL-1", purpose: "purchase", channel: "voice", utterances: [NOTICE, AGREE, "Client: Just confirming my name is Alex Nguyen."] });
      await b(w.ports());
      w.advance(2 * HOUR);
      w.addInterview(interviewB());
      await b(w.ports());
    },
    holds: (w) => {
      const file = w.filesFor("CL-1")[0];
      if (!file) return false;
      const raises = callsTo(w, "raise_task");
      const t = w.tasks.filter((x) => x.fileId === file.id && x.fieldKey === "genuine_savings");
      const owned = t.length === 1 && typeof t[0].owner === "string" && t[0].owner.trim().length > 0 && isDate(t[0].due) && Date.parse(t[0].due) >= Date.parse(NOW.toISOString().slice(0, 10));
      const onlyFromA = raises.length === 1 && raises[0].request.interviewId === "IV-A";
      return owned && onlyFromA && file.interviewIds.length === 3 && file.missing.length === 0;
    },
    describe,
  },
  {
    checkId: "panel-answers-carry-a-card",
    // 7. One policy question the library covers, one it does not.
    world: () => world({ interviews: [interviewA({ more: [UNCOVERED_Q] })] }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const covered = w.answers.find((a) => a.question === COVERED_Q.replace(/^Client: /, ""));
      const uncovered = w.answers.find((a) => a.question === UNCOVERED_Q.replace(/^Client: /, ""));
      if (!covered || !uncovered) return false;
      const card = covered.cards[0];
      const cited =
        covered.outcome === "answered" && covered.cards.length === 1 && card.lenderId === "harbour-bank" && card.clauseId === OLD_CLAUSE.id &&
        card.edition === OLD_CLAUSE.edition && card.effectiveDate === OLD_CLAUSE.effectiveDate;
      const declined = uncovered.outcome === "declined" && typeof uncovered.route === "string" && uncovered.route.length > 0;
      const noBareAnswer = callsTo(w, "answer", (c) => c.request.cards === 0 && c.response.outcome === "answered").length === 0;
      return cited && declined && noBareAnswer;
    },
    describe,
  },
  {
    checkId: "superseded-policy-cannot-answer",
    // 8. Answered; the lender retires the clause and loads an unaccepted
    //    replacement; asked again; a named person accepts; asked again.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports());
      w.retire(OLD_CLAUSE.id);
      w.load(NEW_CLAUSE);
      w.advance(HOUR);
      w.addInterview(followUp("IV-F1"));
      await b(w.ports());
      w.advance(HOUR);
      // The Head of Credit accepts the change. A person, not the build.
      w.ports().acceptClause(NEW_CLAUSE.id, "Morgan Reid");
      w.advance(HOUR);
      w.addInterview(followUp("IV-F2"));
      await b(w.ports());
    },
    holds: (w) => {
      const a = w.answers;
      if (a.length !== 3) return false;
      const first = a[0].outcome === "answered" && cardsOf(a[0]).join() === OLD_CLAUSE.id;
      const second = a[1].outcome === "declined" || (!cardsOf(a[1]).includes(OLD_CLAUSE.id) && !cardsOf(a[1]).includes(NEW_CLAUSE.id));
      const secondNoNew = !cardsOf(a[1]).includes(NEW_CLAUSE.id) && !cardsOf(a[1]).includes(OLD_CLAUSE.id);
      const third = a[2].outcome === "answered" && cardsOf(a[2]).join() === NEW_CLAUSE.id;
      const acc = w.acceptances;
      const accepted = acc.length === 1 && acc[0].clauseId === NEW_CLAUSE.id && acc[0].by === "Morgan Reid" && isDate(acc[0].at);
      const oneAcceptCall = callsTo(w, "gate", (c) => "accept" in c.request).length === 1;
      return first && second && secondNoNew && third && accepted && oneAcceptCall;
    },
    describe,
  },
  {
    checkId: "recommendation-is-gated",
    // 9. A draft with a card but an open gap; the gap closes; a send is tried
    //    without a named person.
    world: () => world(),
    drive: async (b, w) => {
      await twoInterviews(b, w);
      const last = w.drafts.at(-1);
      if (last) w.ports().send(last.id);
    },
    holds: (w) => {
      const dA = w.drafts.find((d) => d.interviewId === "IV-A");
      const dB = w.drafts.find((d) => d.interviewId === "IV-B");
      if (!dA || !dB) return false;
      const blockedFirst = dA.queue === "blocked";
      const readyAfter = dB.queue === "ready_for_person" && dB.cardIds.length > 0 && dB.cardIds.includes(OLD_CLAUSE.id);
      const refused = w.refusedSends.includes(dB.id);
      const neverSent = w.drafts.every((d) => d.sentBy === null && d.queue !== "sent_by_person");
      const noBareReady = w.drafts.every((d) => d.queue !== "ready_for_person" || d.cardIds.length > 0);
      return blockedFirst && readyAfter && refused && neverSent && noBareReady;
    },
    describe,
  },
  {
    checkId: "coaching-cites-the-file",
    // 10. The broker skips the living-expense questions, and quotes a rate.
    world: () =>
      world({
        interviews: [
          {
            id: "IV-C",
            clientId: "CL-3",
            purpose: "purchase",
            channel: "video",
            utterances: [
              NOTICE,
              AGREE,
              "Client: My name is Riley Chen.",
              "Client: I work at Acme Health full time.",
              "Client: I earn $88,000 a year.",
              "Broker: I can probably get you a rate of 5.89% with Harbour Bank.",
            ],
          },
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ev = w.coaching.filter((c) => c.interviewId === "IV-C");
      const closed = ["living_expenses_not_asked", "disclosure_late", "rate_quoted_on_call", "purpose_not_confirmed"];
      const allCited = ev.length > 0 && ev.every((c) => closed.includes(c.findingKey) && (c.evidenceSpan || c.cardId));
      const skipped = ev.some((c) => c.findingKey === "living_expenses_not_asked" && c.evidenceSpan && c.evidenceSpan.end > c.evidenceSpan.start);
      const breaches = ev.filter((c) => c.severity === "breach_suspect");
      const escalated = breaches.length > 0 && breaches.every((c) => {
        const at = idx(w, "cite", (x) => x.request.coaching === c.id);
        return w.calls.slice(at + 1).some((x) => x.port === "escalate" && x.request.reason === "breach_suspect" && /IV-C/.test(String(x.request.detail)) && /\(([A-Z][a-z]+ [A-Z][a-z]+)\)/.test(String(x.request.detail)));
      });
      return allCited && skipped && escalated;
    },
    describe,
  },
  {
    checkId: "log-retrievable-by-interview",
    // 11. One interview worked to a file, a task and a coaching event.
    world: () =>
      world({
        interviews: [
          interviewA({
            override: {
              utterances: [NOTICE, AGREE, "Client: My name is Alex Nguyen.", `Client: The property we're buying is at ${SPOKEN_ADDRESS}.`, "Client: I earn $96,000 a year."],
            },
          }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const read = callsTo(w, "read_file", (c) => c.request.byInterview === "IV-A").at(-1);
      if (!read) return false;
      const r = read.response;
      const together = r.verbatim > 0 && r.files === 1 && r.tasks > 0 && r.coaching > 0;
      const matches = r.verbatim === w.verbatim.length && r.tasks === w.tasks.length && r.coaching === w.coaching.length;
      const carried =
        w.verbatim.every((v) => v.interviewId === "IV-A") && w.tasks.every((t) => t.interviewId === "IV-A") &&
        w.coaching.every((c) => c.interviewId === "IV-A") && w.files.every((f) => f.interviewIds.includes("IV-A")) &&
        callsTo(w, "write_file").every((c) => c.request.interviewId === "IV-A") && callsTo(w, "raise_task").every((c) => c.request.interviewId === "IV-A");
      return together && matches && carried;
    },
    describe,
  },
  {
    checkId: "detached-library-declines",
    // 12. The panel library detached, then the covered question from check 7.
    world: () => {
      const w = world();
      w.detachLibrary();
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = w.answers.filter((a) => a.question === COVERED_Q.replace(/^Client: /, ""));
      const readDetached = callsTo(w, "read_rule", (c) => c.request.detached === true).length > 0;
      const declined = q.length === 1 && q[0].outcome === "declined" && q[0].text === null && typeof q[0].route === "string" && q[0].route.length > 0;
      return readDetached && declined && w.answered.length === 0;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 13. A precondition, closed by evidence. The runner never calls this, and
    //     nothing here scores it green on the build's own say-so.
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: () => "Declared in README.md: the Head of Credit can explain it; it runs on the network's own CRM tenant and panel library.",
  },
];

// Quoted as a scoped build: the live CRM tenant and a dated panel library the
// network controls. Not built here, and not run on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 14. The pass test passes. Runs only against the live tenant.
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

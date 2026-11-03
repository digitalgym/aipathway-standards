/**
 * Handbook Desk: answers staff and manager questions about the employee
 * handbook, the HR policies and the work rules the business holds, quoting the
 * clause it answered from on a source card, or declines to a named person.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone. A reimplementation: nothing is taken from the
 * public bot it ports beyond its one-line public description.
 *
 * THE RULES IT HOLDS. The business's own handbook, HR policies and work rules,
 * plus any external instrument the business has loaded into the same library
 * (the modern award its staff are on, the National Employment Standards),
 * each as clauses with an edition, a jurisdiction (AU for Commonwealth-wide,
 * or the state or territory the staff member works in) and an effective date.
 *
 * AUDIENCE. The world's two policies, mapped to HR:
 *   - "internal": the HR officer or a manager. May name the next step.
 *   - "public":   the staff member or applicant who asked. Quotes the rule
 *                 and stops. It never tells a person what they are owed.
 *
 * HOW IT IS WOKEN. Each run does what the record hands it, and keeps nothing:
 *   - email.received:   a question in the HR inbox, carried by its message_id.
 *   - schedule.tick:    the change feed. Reads the library, finds instruments
 *                       that moved (a clause retired, or a version loaded that
 *                       nobody accepted), lists every stored answer that
 *                       relied on each, and raises hr.change_pending.
 *   - exception.closed: a named person closed an exception. Either they
 *                       accepted a rule change (`acceptances`) or released a
 *                       stored answer for sending (`releases`). The build
 *                       never accepts a change, or sends, on its own say.
 *
 * Every outside effect goes through the ports, or through `send`, the hook
 * that stands for the mail system and returns the reply's message_id.
 *
 * @param {import("@aipathway/conformance").CitedAnswerPorts} ports
 * @param {{
 *   questions?: Array<{ messageId: string, question: string, audience?: "public"|"internal", workState?: string, askedAbout?: string }>,
 *   acceptances?: Array<{ clauseId: string, by?: string }>,
 *   releases?: Array<{ answer: { id: string, outcome: string, text: string|null, cards: unknown[] }, messageId: string, by?: string }>,
 *   send?: (msg: { inReplyTo: string, body: string, answerId: string, releasedBy: string }) => Promise<string|null> | string | null,
 *   tick?: boolean,
 *   hrOwner?: string,
 *   openException?: (messageId: string) => null | { owner: string },
 * }} [input]
 */
export async function build(ports, input = {}) {
  const hrOwner = input.hrOwner ?? "the HR owner named on the exception desk";
  const out = [];

  for (const a of input.acceptances ?? []) await accept(ports, a, hrOwner);
  if (input.tick) await changeFeed(ports, hrOwner);

  for (const q of input.questions ?? []) {
    // An open exception with a named owner on this message halts the chain.
    if (input.openException?.(q.messageId)) continue;
    out.push(await answerQuestion(ports, q, hrOwner));
  }

  for (const r of input.releases ?? []) out.push(await sendReleased(ports, r, input.send, hrOwner));
  return out;
}

const AU_STATES = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
const IGNORE = new Set(
  (
    "the and for are was were our you your their they them this that what which how when where who can could " +
    "does did has have had with from into about any there than then will would should must may might get got " +
    "staff employee employees worker workers people person here also just much many long"
  ).split(" "),
);
const root = (w) => w.replace(/(ings|ing|ied|ies|es|ed|s)$/, "");
const terms = (s) =>
  [
    ...new Set(
      String(s ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !IGNORE.has(w))
        .map(root),
    ),
  ];
const isNamed = (by) => typeof by === "string" && by.trim().length > 2;
const ymd = (iso) => String(iso).slice(0, 10);

// The HR decisions that stay with a person, on either audience: a ruling on
// one person's entitlement, discipline or dismissal, a finding of bullying,
// harassment or discrimination, a statement that the business complies, a
// legal reading, a sign-off, and anything about whether something is safe.
const PERSON_DECIDES = [
  /\b(am i|are they|is (he|she|they)) (entitled|owed|eligible)\b/i,
  /\b(can|could|should) (we|i) (sack|fire|dismiss|terminate|stand down|discipline)\b/i,
  /\b(unfair|unlawful) (dismissal|termination)\b/i,
  /\bis (this|that|it) (bullying|harassment|discrimination|a breach)\b/i,
  /\b(are we|is (it|this|that|the business)) (compliant|legal|lawful)\b/i,
  /\bcompl(y|ies|iant|iance) with\b/i,
  /\b(sign[ -]?off|sign (it|this) off|certif(y|ied|icate))\b/i,
  /\b(is|are) (it|this|that|they) safe\b/i,
];

/** Live on the asked-about date: not retired, not awaiting acceptance, in force. */
function liveOn(c, onDate) {
  return !c.retired && c.accepted !== false && ymd(c.effectiveDate) <= ymd(onDate);
}

function score(qTerms, clause) {
  const ct = new Set(terms(clause.text));
  return qTerms.reduce((n, t) => n + (ct.has(t) ? 1 : 0), 0);
}

async function declineTo(ports, q, audience, reason, route, detail) {
  await ports.escalate(reason, `${q.messageId ?? "no message id"}: ${detail}`);
  return ports.answer({ question: q.question, text: null, policy: audience, cards: [], route });
}

async function answerQuestion(ports, q, hrOwner) {
  const audience = q.audience === "internal" ? "internal" : "public";

  // Step 1: the state the staff member works in and the date asked about,
  // before anything is retrieved. Long service leave, public holidays and
  // some award terms differ by state and by edition.
  const state = String(q.workState ?? "").toUpperCase();
  if (!AU_STATES.has(state)) {
    return declineTo(ports, q, audience, "hr.no_work_state", hrOwner, "no Australian state or territory of work on the question; the rules held differ by state");
  }
  const asOf = q.askedAbout ?? ports.now().toISOString();

  if (PERSON_DECIDES.some((re) => re.test(q.question))) {
    return declineTo(
      ports,
      q,
      audience,
      "hr.decision_for_person",
      `${hrOwner} (a ruling on one person's case, a compliance statement, a legal reading or a safety call stays with a person)`,
      "the question asks for a decision a person makes, not for what the rules say",
    );
  }

  // Step 2: retrieve clauses, not documents. AU clauses apply in every state;
  // a state clause only in its own state.
  const library = await ports.readLibrary();
  const qTerms = terms(q.question);
  const scored = library
    .filter((c) => c.jurisdiction === "AU" || c.jurisdiction === state)
    .map((c) => ({ c, s: score(qTerms, c) }))
    .filter((h) => h.s >= 2)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) {
    return declineTo(ports, q, audience, "hr.not_in_rules", hrOwner, "nothing in the handbook, policies or work rules held covers this question");
  }

  // Step 3: an instrument with a loaded version nobody has accepted is change
  // pending; so is a question whose covering clauses are all retired.
  const instruments = [...new Set(scored.map((h) => h.c.instrumentId))];
  const awaiting = instruments.filter((id) => library.some((c) => c.instrumentId === id && c.accepted === false && !c.retired));
  if (awaiting.length > 0) {
    return declineTo(ports, q, audience, "hr.change_pending", hrOwner, `${awaiting.join(", ")} has a new version loaded that no named person has accepted`);
  }
  const live = scored.filter((h) => liveOn(h.c, asOf));
  if (live.length === 0) {
    return declineTo(ports, q, audience, "hr.change_pending", hrOwner, "the clauses that covered this are retired or not yet in force, and no accepted replacement covers it");
  }
  const best = live.filter((h) => h.s === live[0].s).map((h) => h.c);
  const sources = [...new Set(best.map((c) => c.instrumentId))];
  if (sources.length > 1) {
    return declineTo(ports, q, audience, "hr.source_conflict", hrOwner, `${sources.join(" and ")} are both live and both answer this; a person picks and the pick is recorded`);
  }

  // Steps 4 and 5: compose only from the retrieved clauses, a card for each.
  const cards = best.map((c) => ({
    instrumentId: c.instrumentId,
    clauseId: c.id,
    edition: c.edition,
    jurisdiction: c.jurisdiction,
    effectiveDate: c.effectiveDate,
  }));
  const quoted = best
    .map((c) => `${c.instrumentId}, clause ${c.id} (edition ${c.edition}, ${c.jurisdiction}, in force from ${ymd(c.effectiveDate)}): "${c.text}"`)
    .join(" ");

  // Step 7: the audience is a field on the answer, and each gets its own wording.
  const text =
    audience === "internal"
      ? `${quoted} For HR: apply this to the record on file; anything the clause does not settle goes to ${hrOwner}.`
      : `${quoted} That is the rule as written. How it applies to you is confirmed by HR in writing.`;

  // Step 8: stored with its cards. The answer port is the register.
  return ports.answer({ question: q.question, text, policy: audience, cards });
}

/** A rule change counts only when a named person accepts it on the record. */
async function accept(ports, a, hrOwner) {
  if (!a?.clauseId || !isNamed(a.by)) {
    await ports.escalate("hr.acceptance_without_person", `clause ${a?.clauseId ?? "?"}: a rule change needs a named person to accept it; not applied (${hrOwner})`);
    return;
  }
  await ports.acceptClause(a.clauseId, a.by.trim());
}

/** The scheduled change feed: what moved, and every stored answer that relied on it. */
async function changeFeed(ports, hrOwner) {
  const library = await ports.readLibrary();
  const moved = [...new Set(library.filter((c) => c.retired || c.accepted === false).map((c) => c.instrumentId))];
  for (const instrumentId of moved) {
    const relied = (await ports.answersCiting(instrumentId)).filter((a) => a.outcome === "answered").map((a) => a.id);
    await ports.escalate(
      "hr.change_pending",
      `${instrumentId} moved; stored answers relying on it: ${relied.length ? relied.join(", ") : "none"}; to accept: ${hrOwner}`,
    );
  }
}

/** Send a stored answer a named person released. It counts only with a message_id back. */
async function sendReleased(ports, r, send, hrOwner) {
  const a = r?.answer;
  if (!a || a.outcome !== "answered" || !Array.isArray(a.cards) || a.cards.length === 0 || !a.text) {
    await ports.escalate("hr.release_refused", `${r?.messageId ?? "?"}: only an answered answer with a source card can be sent (${hrOwner})`);
    return { sent: false };
  }
  if (!isNamed(r.by)) {
    await ports.escalate("hr.release_without_person", `${r.messageId}: sending needs a named person to release the answer (${hrOwner})`);
    return { sent: false };
  }
  const id = typeof send === "function" ? await send({ inReplyTo: r.messageId, body: a.text, answerId: a.id, releasedBy: r.by.trim() }) : null;
  if (typeof id !== "string" || id.length === 0) {
    await ports.escalate("hr.send_unconfirmed", `${r.messageId}: no message_id came back from the mail system; not sent (${hrOwner})`);
    return { sent: false };
  }
  return { sent: true, messageId: id, answerId: a.id };
}

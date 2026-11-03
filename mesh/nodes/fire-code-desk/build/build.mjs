/**
 * Fire Code Desk: answers a fire or electrical compliance office's questions
 * about what a fire safety or wiring standard requires, from the clause library
 * the office holds, citing the clause AND the state adoption record that says
 * which edition is called up there. Or it declines to a named person.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone. Australian instruments: the NCC as each state and
 * territory adopts it, the Australian Standards it calls up (AS 1851, AS 1670.1,
 * AS 2118.1, AS 2419.1, AS/NZS 3000) and the state maintenance regulations.
 *
 * WHAT MAKES IT A FIRE CODE DESK, NOT A GENERIC CLAUSE SEARCH. A national
 * standard exists in several editions at once, and which one binds a building
 * is decided by the state's adoption record, not by which is newest. So:
 *   - an answer from a national standard needs a live, accepted adoption record
 *     for the asked-about state that calls up that standard, and it answers only
 *     from the edition that record names;
 *   - the adoption record is a source card of its own on the answer;
 *   - no adoption record for the state means a decline, never a guessed edition.
 *
 * HOW IT IS WOKEN. One run handles what the record hands it:
 *   - email.received:   a question arrived, carried by its message_id.
 *   - schedule.tick:    the change feed. Read the library, find instruments with
 *                       a version loaded that nobody has accepted, or a clause
 *                       retired, list every stored answer that relied on them,
 *                       and raise a change-pending exception to the named owner.
 *   - exception.closed: the named person accepted a change. Their name is on the
 *                       record and is passed in as `acceptances`.
 *   - a release on the answer register: a named person released a stored
 *                       answer; it is sent as a reply through the mail system
 *                       (`input.reply`), and counts only if a message_id comes
 *                       back.
 *
 * Every outside effect goes through the ports. Nothing is kept between runs.
 *
 * @param {import("@aipathway/conformance").CitedAnswerPorts} ports
 * @param {{
 *   questions?: Array<{ messageId: string, question: string, policy: "public"|"internal", jurisdiction?: string, askedAbout?: string }>,
 *   acceptances?: Array<{ clauseId: string, by?: string }>,
 *   tick?: boolean,
 *   owner?: string,
 *   certifier?: string,
 *   openException?: (messageId: string) => null | { owner: string },
 *   releases?: Array<{ answer: { id: string, outcome: string, text: string|null, cards: unknown[] }, messageId: string, by?: string }>,
 *   reply?: (msg: { inReplyTo: string, body: string, answerId: string, releasedBy: string }) => Promise<string|null> | string | null,
 * }} [input]
 */
export async function build(ports, input = {}) {
  const owner = input.owner ?? "the fire safety engineer on the exception desk";
  const certifier = input.certifier ?? "the licensed fire safety practitioner for the building";
  const results = [];

  // Acceptances first, and only those a named person made on the record.
  for (const a of input.acceptances ?? []) {
    if (!a || !a.clauseId || !isNamed(a.by)) {
      await ports.escalate(
        "cited.acceptance_without_person",
        `clause ${a?.clauseId ?? "?"}: an acceptance needs a named person and was not applied`,
      );
      continue;
    }
    await ports.acceptClause(a.clauseId, a.by.trim());
  }

  if (input.tick) await changeFeed(ports, owner);

  for (const q of input.questions ?? []) {
    // An open exception with a named owner on this message stops the chain.
    if (input.openException?.(q.messageId)) continue;
    results.push(await answerOne(ports, q, owner, certifier));
  }

  for (const r of input.releases ?? []) await release(ports, r, input.reply, owner);

  return results;
}

const STOP = new Set(
  "a an the and or of to for in on at by is are be do does did i we my our you your it its this that what which how when where who can need needs must should would will with from as if any there their them than then about into under over per often every each".split(
    " ",
  ),
);
const stem = (w) => w.replace(/(ings|ing|ies|es|s)$/, "");
const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
const isNamed = (by) => typeof by === "string" && by.trim().length > 2;
const day = (iso) => String(iso ?? "").slice(0, 10);

// Questions that ask for a compliance decision, a pass, or a certificate or
// statement. Those carry a licence number, so they go to the licensed person
// on either policy.
const CERTIFY_RE =
  /\b(compl(y|ies|iant|iance)|conform(s|ing)?|(would|will|does|did) (it|this|that|my|our|the) .{0,40}pass|pass (the |an |its |final )?(inspection|audit|test)|certif(y|icate|ied|ication)|sign[ -]?off|sign (it|this) off)\b/i;

const isAdoption = (c) => c.kind === "adoption" && c.callsUp && typeof c.callsUp.instrumentId === "string";

/** Usable as a live source on the asked-about date. */
function live(c, onDate) {
  return !c.retired && c.accepted !== false && day(c.effectiveDate) <= day(onDate);
}

function score(qWords, clause) {
  const cw = new Set(words(`${clause.instrumentId} ${clause.text}`));
  let n = 0;
  for (const w of new Set(qWords)) if (cw.has(w)) n += 1;
  return n;
}

const cardOf = (c) => ({
  instrumentId: c.instrumentId,
  clauseId: c.id,
  edition: c.edition,
  jurisdiction: c.jurisdiction,
  effectiveDate: c.effectiveDate,
});

async function decline(ports, q, reason, route, detail) {
  await ports.escalate(reason, `${q.messageId ?? "no message id"}: ${detail}`);
  return ports.answer({ question: q.question, text: null, policy: q.policy, cards: [], route });
}

async function answerOne(ports, q, owner, certifier) {
  const policy = q.policy === "internal" ? "internal" : "public";
  const query = { ...q, policy };

  // Standard check 1: jurisdiction and date before retrieving anything.
  if (!q.jurisdiction) {
    return decline(ports, query, "cited.no_jurisdiction", owner, "no state or territory on the question; the edition called up differs by state");
  }
  const state = String(q.jurisdiction).toUpperCase();
  const asOf = q.askedAbout ?? ports.now().toISOString();

  if (CERTIFY_RE.test(q.question)) {
    return decline(
      ports,
      query,
      "cited.certificate_question",
      `${certifier} (a compliance decision, a pass or a statement is theirs; this desk does not make it)`,
      "the question asks for a compliance decision, a pass or a certificate",
    );
  }

  // Standard check 2: retrieve clauses, not documents.
  const library = await ports.readLibrary();
  const qWords = words(q.question);
  const technical = library.filter((c) => !isAdoption(c) && (c.jurisdiction === "AU" || c.jurisdiction === state));
  const hits = technical
    .map((c) => ({ c, s: score(qWords, c) }))
    .filter((h) => h.s >= 2)
    .sort((a, b) => b.s - a.s);
  if (hits.length === 0) {
    return decline(ports, query, "cited.not_in_library", owner, "no clause in the library covers this question");
  }

  // A version nobody has accepted on an instrument the answer would draw on,
  // or on the state's adoption record for it, is change pending.
  const instruments = [...new Set(hits.map((h) => h.c.instrumentId))];
  const adoptionsFor = (id) => library.filter((c) => isAdoption(c) && c.jurisdiction === state && c.callsUp.instrumentId === id);
  const pending = instruments.filter(
    (id) =>
      library.some((c) => c.instrumentId === id && c.accepted === false && !c.retired) ||
      adoptionsFor(id).some((c) => c.accepted === false && !c.retired),
  );
  if (pending.length > 0) {
    return decline(ports, query, "cited.change_pending", owner, `${pending.join(", ")}: a version is loaded that no named person has accepted`);
  }

  // Which edition binds in this state on this date: the latest live adoption
  // record for the instrument. A state's own instrument binds there directly.
  const bound = [];
  for (const h of hits) {
    if (!live(h.c, asOf)) continue;
    if (h.c.jurisdiction === state) {
      bound.push({ ...h, adoption: null });
      continue;
    }
    const adoption = adoptionsFor(h.c.instrumentId)
      .filter((a) => live(a, asOf))
      .sort((a, b) => day(b.effectiveDate).localeCompare(day(a.effectiveDate)))[0];
    if (adoption && adoption.callsUp.edition === h.c.edition) bound.push({ ...h, adoption });
  }
  if (bound.length === 0) {
    const anyAdoption = instruments.some((id) => adoptionsFor(id).some((a) => live(a, asOf)));
    return anyAdoption
      ? decline(ports, query, "cited.change_pending", owner, "the clauses that cover this are retired, not in force on the date, or not the edition the state calls up")
      : decline(ports, query, "cited.no_adoption_record", owner, `no live adoption record for ${state} says which edition of ${instruments.join(", ")} applies; the edition is not guessed`);
  }

  const top = bound[0].s;
  const best = bound.filter((h) => h.s === top);
  const bestInstruments = [...new Set(best.map((h) => h.c.instrumentId))];
  if (bestInstruments.length > 1) {
    return decline(ports, query, "cited.source_conflict", owner, `live instruments ${bestInstruments.join(" and ")} both cover this in ${state}; a person picks`);
  }

  // Standard checks 4 and 5: compose only from retrieved clauses, a card each,
  // plus the adoption record that says why this edition.
  const cards = [];
  const seen = new Set();
  for (const h of best) {
    for (const c of [h.c, h.adoption].filter(Boolean)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cards.push(cardOf(c));
    }
  }
  const quoted = best
    .map((h) => `${h.c.instrumentId}-${h.c.edition} ${h.c.id}: "${h.c.text}"`)
    .join(" ");
  const why = best
    .filter((h) => h.adoption)
    .map((h) => `${h.adoption.instrumentId} (${h.adoption.jurisdiction}, from ${day(h.adoption.effectiveDate)}) calls up ${h.c.instrumentId}-${h.c.edition}.`)
    .join(" ");

  // Standard check 7: the audience policy is a field, and they say different things.
  const text =
    policy === "internal"
      ? `${quoted} ${why} Next step for the office: plan the routine to this edition and record it against the asset in the register.`.trim()
      : `In ${state}, the edition that applies says: ${quoted} ${why} This describes what the standard requires. Whether a particular installation meets it is decided by a licensed practitioner who has seen it.`.trim();

  return ports.answer({ question: q.question, text, policy, cards });
}

/** The change feed: the answers that relied on a moved instrument, listed from stored cards. */
async function changeFeed(ports, owner) {
  const library = await ports.readLibrary();
  const moved = new Set();
  for (const c of library) {
    if (c.accepted === false && !c.retired) moved.add(isAdoption(c) ? c.callsUp.instrumentId : c.instrumentId);
    if (c.retired) moved.add(c.instrumentId);
  }
  for (const id of [...moved].sort()) {
    const relied = await ports.answersCiting(id);
    await ports.escalate(
      "cited.change_pending",
      `${id}: moved; a named person (${owner}) accepts the change before it is used. answers: ${relied.map((a) => a.id).join(",")}`,
    );
  }
}

/** Send a stored answer a named person released, and count it only with a message_id back. */
async function release(ports, r, reply, owner) {
  if (!r?.answer || r.answer.outcome !== "answered" || !Array.isArray(r.answer.cards) || r.answer.cards.length === 0) {
    await ports.escalate("cited.release_refused", `${r?.messageId ?? "?"}: only an answered answer with a card is sent`);
    return;
  }
  if (!isNamed(r.by)) {
    await ports.escalate("cited.release_without_person", `${r.messageId}: a release needs a named person`);
    return;
  }
  const id = typeof reply === "function" ? await reply({ inReplyTo: r.messageId, body: r.answer.text, answerId: r.answer.id, releasedBy: r.by.trim() }) : null;
  if (!id) {
    await ports.escalate("cited.send_unconfirmed", `${r.messageId}: no message_id came back from the mail system; not sent (${owner})`);
  }
}

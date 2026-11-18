/**
 * Prequal Desk: drafts a subcontractor's answers to a head contractor's
 * prequalification form (insurances, licences, WHS, ABN) only from the
 * business's own filed documents, with a source card on every answer, or
 * declines the line to a named person. Nothing leaves until a named person
 * releases it.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone.
 *
 * THE LIBRARY. The "instruments" are the subcontractor's own filed documents:
 * certificates of currency (public liability, workers compensation), contractor
 * licences, the ABN record and the WHS management plan. Each is held as clauses
 * with an edition (policy number and period, or plan version), a jurisdiction
 * (the state, or AU) and an effective date, and may carry `expires`. A renewed
 * certificate is a new version: it does not reach a form until a named person
 * accepts it.
 *
 * HOW IT IS WOKEN. One run handles what the record hands it:
 *   - email.received:   a prequal form arrived; each line of it is a question
 *                       carried by the form's message_id, the project's state
 *                       and the date the form asks about.
 *   - schedule.tick:    the change feed. Find documents that moved (retired,
 *                       a renewal loaded and not accepted, or past expiry),
 *                       list every stored answer that relied on them, and
 *                       raise a change-pending exception.
 *   - exception.closed: a named person accepted a renewal (`acceptances`) or
 *                       released drafted answers for sending (`releases`).
 *                       The build never accepts a document or sends on its own.
 *
 * Every outside effect goes through the ports, or through the `reply` hook
 * that stands for the mail system. Nothing is kept between runs.
 *
 * @param {import("@aipathway/conformance").CitedAnswerPorts} ports
 * @param {{
 *   questions?: Array<{ messageId: string, question: string, policy: "public"|"internal", jurisdiction?: string, askedAbout?: string }>,
 *   acceptances?: Array<{ clauseId: string, by?: string }>,
 *   releases?: Array<{ answer: { id: string, outcome: string, text: string|null, cards: unknown[] }, messageId: string, by?: string }>,
 *   reply?: (msg: { inReplyTo: string, body: string, answerId: string, releasedBy: string }) => Promise<string|null> | string | null,
 *   tick?: boolean,
 *   owner?: string,
 *   openException?: (messageId: string) => null | { owner: string },
 * }} [input]
 */
export async function build(ports, input = {}) {
  const owner = input.owner ?? "the prequal owner named on the exception desk";
  const results = [];

  // A renewed document counts only when a named person accepted it on the record.
  for (const a of input.acceptances ?? []) {
    if (!a?.clauseId || !named(a.by)) {
      await ports.escalate(
        "cited.acceptance_without_person",
        `document clause ${a?.clauseId ?? "?"}: a renewed document needs a named person to accept it; not applied (${owner})`,
      );
      continue;
    }
    await ports.acceptClause(a.clauseId, a.by.trim());
  }

  if (input.tick) await changeFeed(ports, owner);

  for (const q of input.questions ?? []) {
    // An open exception with a named owner on this form stops the chain here.
    if (input.openException?.(q.messageId)) continue;
    results.push(await answerOne(ports, q, owner));
  }

  for (const r of input.releases ?? []) results.push(await release(ports, r, input.reply, owner));
  return results;
}

const STOP = new Set(
  (
    "a an the and or of to for in on at by is are be do does did i we my our you your it its this that what which how " +
    "when where who can need needs must should would will with from as if any there their them than then about into " +
    "under over per get got have has had me us they he she his her please provide details current"
  ).split(" "),
);
const stem = (w) => w.replace(/(ings|ing|ies|es|s)$/, "");
const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
const named = (by) => typeof by === "string" && by.trim().length > 2;
const day = (iso) => String(iso).slice(0, 10);

// A line that asks for a decision only a person may make: a statement that the
// business complies, a declaration or sign-off, a warranty, or a judgement that
// a licence or policy is adequate for the job. Asking for a certificate of
// currency is not one of these; asking us to certify something is.
const DECISION_RE =
  /\b(do|does|will) (you|we|the business) comply\b|\bcompl(y|ies|iant|iance) with\b|\bare (you|we) compliant\b|\b(certify|certified)\b|\bstatutory declaration\b|\bsign(ed|ing)? (the |this |a )?(declaration|off)\b|\bsign[ -]off\b|\bwarrant(y|s)?\b|\bcovers? the (full |whole |entire )?scope\b|\bis (it|this|that|your \w+) adequate\b/i;

/** In force, not retired, accepted, and not expired, on the asked-about date. */
function live(c, onDate) {
  return !c.retired && c.accepted !== false && day(c.effectiveDate) <= day(onDate) && !expired(c, onDate);
}
const expired = (c, onDate) => Boolean(c.expires) && day(c.expires) < day(onDate);

/**
 * How well a filed clause covers a form line. Most of the line's own words must
 * be in the clause: "professional indemnity insurance cover" shares two words
 * with a public liability certificate and must not be answered from it.
 */
function score(qWords, clause) {
  const q = new Set(qWords);
  if (q.size === 0) return { n: 0, cover: 0 };
  const cw = new Set(words(clause.text));
  let n = 0;
  for (const w of q) if (cw.has(w)) n += 1;
  return { n, cover: n / q.size };
}

async function decline(ports, q, reason, route, detail) {
  await ports.escalate(reason, `${q.messageId ?? "no message id"}: ${detail}`);
  return ports.answer({ question: q.question, text: null, policy: q.policy, cards: [], route });
}

async function answerOne(ports, q, owner) {
  const policy = q.policy === "internal" ? "internal" : "public";
  const query = { ...q, policy };

  // Step 1: the project's state and the asked-about date before retrieving.
  // Workers compensation and contractor licences are held state by state.
  if (!q.jurisdiction) {
    return decline(ports, query, "cited.no_jurisdiction", owner, "no project state on the form; licences and workers compensation differ by state");
  }
  const asOf = q.askedAbout ?? ports.now().toISOString();

  if (DECISION_RE.test(q.question)) {
    return decline(
      ports,
      query,
      "cited.decision_for_person",
      `${owner} (a compliance statement, declaration, warranty or licence-scope judgement stays with a person)`,
      "the form line asks for a compliance statement, a signed declaration or a judgement on adequacy",
    );
  }

  // Step 2: retrieve clauses, not documents. AU-wide documents (ABN, public
  // liability, the WHS plan) apply in every state; a state document only in its own.
  const library = await ports.readLibrary();
  const qWords = words(q.question);
  const hits = library
    .filter((c) => c.jurisdiction === q.jurisdiction || c.jurisdiction === "AU")
    .map((c) => ({ c, ...score(qWords, c) }))
    .filter((h) => h.n >= 2 && h.cover >= 0.6)
    .sort((a, b) => b.n - a.n);
  if (hits.length === 0) {
    return decline(ports, query, "cited.not_in_library", owner, "no filed document covers this line of the form");
  }

  // Step 3: a document with a renewal loaded that no named person accepted is
  // change pending, and so is one whose covering clauses are retired.
  const docs = [...new Set(hits.map((h) => h.c.instrumentId))];
  const pending = docs.filter((id) => library.some((c) => c.instrumentId === id && c.accepted === false && !c.retired));
  if (pending.length > 0) {
    return decline(ports, query, "cited.change_pending", owner, `document ${pending.join(", ")} has a renewal loaded that no named person has accepted`);
  }
  const liveHits = hits.filter((h) => live(h.c, asOf));
  if (liveHits.length === 0) {
    if (hits.some((h) => !h.c.retired && expired(h.c, asOf))) {
      return decline(
        ports,
        query,
        "cited.document_expired",
        owner,
        `the filed document that covers this (${[...new Set(hits.map((h) => h.c.instrumentId))].join(", ")}) expired before ${day(asOf)}; a renewal must be filed and accepted`,
      );
    }
    return decline(ports, query, "cited.change_pending", owner, "the clauses that covered this are retired or not yet in force, and no accepted replacement covers it");
  }
  const top = liveHits[0].n;
  const best = liveHits.filter((h) => h.n === top).map((h) => h.c);
  const bestDocs = [...new Set(best.map((c) => c.instrumentId))];
  if (bestDocs.length > 1) {
    return decline(ports, query, "cited.source_conflict", owner, `filed documents ${bestDocs.join(" and ")} both answer this differently; a person picks and the pick is recorded`);
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
    .map((c) => `${c.instrumentId} item ${c.id} (${c.edition}, ${c.jurisdiction}, in force from ${day(c.effectiveDate)}${c.expires ? `, expires ${day(c.expires)}` : ""}): "${c.text}"`)
    .join(" ");

  // Step 7: the audience is a field. Public is the line drafted onto the head
  // contractor's form; internal is our own estimator or office asking.
  const text =
    policy === "internal"
      ? `${quoted} Next step: check the document is the one the head contractor asked for and attach it to the form.`
      : `${quoted} This is what our filed document states. The person who signs this form checks it and attaches the document.`;

  // Step 8: stored with its cards. The answer port is the register.
  return ports.answer({ question: q.question, text, policy, cards });
}

/** The scheduled change feed: what moved, and every stored answer that relied on it. */
async function changeFeed(ports, owner) {
  const library = await ports.readLibrary();
  const now = ports.now().toISOString();
  const moved = new Set(library.filter((c) => c.retired || c.accepted === false || expired(c, now)).map((c) => c.instrumentId));
  for (const docId of moved) {
    const affected = await ports.answersCiting(docId);
    const ids = affected.filter((a) => a.outcome === "answered").map((a) => a.id);
    await ports.escalate(
      "cited.change_pending",
      `document ${docId} moved; answers relying on it: ${ids.length ? ids.join(", ") : "none"}; owner: ${owner}`,
    );
  }
}

/** Send a drafted answer a named person released. It counts only with a message_id back. */
async function release(ports, r, reply, owner) {
  if (!r?.answer || r.answer.outcome !== "answered" || !Array.isArray(r.answer.cards) || r.answer.cards.length === 0 || !r.answer.text) {
    await ports.escalate("cited.release_refused", `${r?.messageId ?? "?"}: only an answered line with a card can be sent (${owner})`);
    return { sent: false };
  }
  if (!named(r.by)) {
    await ports.escalate("cited.release_without_person", `${r.messageId}: sending needs a named person to release the draft (${owner})`);
    return { sent: false };
  }
  const id =
    typeof reply === "function"
      ? await reply({ inReplyTo: r.messageId, body: r.answer.text, answerId: r.answer.id, releasedBy: r.by.trim() })
      : null;
  if (typeof id !== "string" || id.length === 0) {
    await ports.escalate("cited.send_unconfirmed", `${r.messageId}: no message_id came back from the mail system; not sent (${owner})`);
    return { sent: false };
  }
  return { sent: true, messageId: id, answerId: r.answer.id };
}

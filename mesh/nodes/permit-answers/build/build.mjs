/**
 * Permit Answers: answers questions about permits, inspections, zoning and
 * building codes from a clause library of council and state instruments, with
 * a source card on every answer, or declines to a named person.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone. A reimplementation: nothing is taken from the
 * public bot it ports beyond its one-line public description.
 *
 * HOW IT IS WOKEN. One run handles what the record hands it:
 *   - email.received: a question arrived, carried by its message_id.
 *   - schedule.tick:  the change feed. Read the library, find instruments that
 *                     moved, list every stored answer that relied on them, and
 *                     raise a change-pending exception to the named owner.
 *   - exception.closed: the named person accepted a change. Their name is on
 *                     the record and is passed in as `acceptances`. The build
 *                     never accepts a change on its own say-so.
 *
 * Every outside effect goes through the ports. Nothing here keeps state between
 * runs: the answers and their cards live in the answer register (the `answer`
 * port), acceptances live on the gate.
 *
 * @param {import("@aipathway/conformance").CitedAnswerPorts} ports
 * @param {{
 *   questions?: Array<{ messageId: string, question: string, policy: "public"|"internal", jurisdiction?: string, askedAbout?: string }>,
 *   acceptances?: Array<{ clauseId: string, by: string }>,
 *   tick?: boolean,
 *   owner?: string,
 *   openException?: (messageId: string) => null | { owner: string },
 * }} [input]
 */
export async function build(ports, input = {}) {
  const owner = input.owner ?? "the building surveyor on the exception desk";
  const results = [];

  // 1. Acceptances first, and only those a named person made on the record.
  for (const a of input.acceptances ?? []) {
    if (!a || !a.clauseId || !isNamed(a.by)) {
      await ports.escalate("cited.acceptance_without_person", `clause ${a?.clauseId ?? "?"}: an acceptance needs a named person and is not applied`);
      continue;
    }
    await ports.acceptClause(a.clauseId, a.by);
  }

  // 2. The change feed.
  if (input.tick) await changeFeed(ports, owner);

  // 3. Questions.
  for (const q of input.questions ?? []) {
    const open = input.openException?.(q.messageId);
    if (open) continue; // an open exception with a named owner stops the chain on this record
    results.push(await answerOne(ports, q, owner));
  }
  return results;
}

const STOP = new Set(
  "a an the and or of to for in on at by is are be do does did i we my our you your it its this that what which how when where who can need needs must should would will with from as if any there their them than then about into under over per".split(" "),
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
const day = (iso) => String(iso).slice(0, 10);

// Questions that ask the assistant to decide compliance or to certify. These are
// the licensed person's, on either policy, so they decline to a person.
const CERTIFY_RE =
  /\b(compl(y|ies|iant|iance)|would (it|this|that|my|our) pass|will (it|this|that|my|our) pass|pass (the |an |final |its )?inspection|certif(y|icate|ied|ier sign)|sign[ -]?off|sign it off|approve[sd]?|is (it|this|that) (legal|ok|okay|allowed) to (occupy|use))\b/i;

/** Is the clause usable as a live source on the asked-about date? */
function live(c, onDate) {
  return !c.retired && c.accepted !== false && day(c.effectiveDate) <= day(onDate);
}

function score(qWords, clause) {
  const cw = new Set(words(clause.text));
  let n = 0;
  for (const w of new Set(qWords)) if (cw.has(w)) n += 1;
  return n;
}

async function decline(ports, q, reason, route, detail) {
  await ports.escalate(reason, `${q.messageId ?? "no message id"}: ${detail}`);
  return ports.answer({ question: q.question, text: null, policy: q.policy, cards: [], route });
}

async function answerOne(ports, q, owner) {
  const policy = q.policy === "internal" ? "internal" : "public";
  const query = { ...q, policy };

  // Check 1 of the standard: jurisdiction and date before retrieving anything.
  if (!q.jurisdiction) return decline(ports, query, "cited.no_jurisdiction", owner, "no jurisdiction on the question; the same question differs by state and council");
  const asOf = q.askedAbout ?? ports.now().toISOString();

  // A compliance or certificate question stays with the licensed person, on both policies.
  if (CERTIFY_RE.test(q.question)) {
    return decline(ports, query, "cited.certificate_question", `${owner} (the licensed certifier decides; this assistant does not)`, "the question asks for a compliance decision or a certificate");
  }

  // Check 2: retrieve clauses, not documents.
  const library = await ports.readLibrary();
  const qWords = words(q.question);
  const inJurisdiction = library.filter((c) => c.jurisdiction === q.jurisdiction);
  const hits = inJurisdiction
    .map((c) => ({ c, s: score(qWords, c) }))
    .filter((h) => h.s >= 2)
    .sort((a, b) => b.s - a.s);

  if (hits.length === 0) return decline(ports, query, "cited.not_in_library", owner, "no clause in the library covers this question");

  // Check 3: only clauses live on the asked-about date. An instrument with an
  // unaccepted version loaded is change pending: declined until a person accepts.
  const instruments = [...new Set(hits.map((h) => h.c.instrumentId))];
  const pending = instruments.filter((id) => library.some((c) => c.instrumentId === id && c.accepted === false && !c.retired));
  if (pending.length > 0) {
    return decline(ports, query, "cited.change_pending", owner, `instrument ${pending.join(", ")} has a version loaded that no named person has accepted`);
  }
  const liveHits = hits.filter((h) => live(h.c, asOf));
  if (liveHits.length === 0) {
    return decline(ports, query, "cited.change_pending", owner, "the clauses that cover this are retired or not in force on the asked-about date, and no accepted replacement covers it");
  }
  const top = liveHits[0].s;
  const liveBest = liveHits.filter((h) => h.s === top).map((h) => h.c);
  const liveInstruments = [...new Set(liveBest.map((c) => c.instrumentId))];
  if (liveInstruments.length > 1) {
    // Two live instruments answer it equally: a source conflict a person resolves.
    return decline(ports, query, "cited.source_conflict", owner, `live instruments ${liveInstruments.join(" and ")} both cover this; a person picks`);
  }

  // Checks 4 and 5: compose only from the retrieved clauses, with a card each.
  const used = liveBest;
  const cards = used.map((c) => ({
    instrumentId: c.instrumentId,
    clauseId: c.id,
    edition: c.edition,
    jurisdiction: c.jurisdiction,
    effectiveDate: c.effectiveDate,
  }));
  const quoted = used
    .map((c) => `${c.instrumentId} clause ${c.id} (${c.edition}, ${c.jurisdiction}, in force from ${day(c.effectiveDate)}): "${c.text}"`)
    .join(" ");

  // Check 7: the audience policy is a field, and the two policies say different things.
  const text =
    policy === "internal"
      ? `${quoted} Next step: check the job's site details against this clause and raise anything unclear with the certifier on the job before work starts.`
      : `${quoted} This is what the rule says. Whether a particular building or site meets it is for the licensed building certifier to decide.`;

  // Check 8: stored with its cards (the answer port is the register).
  return ports.answer({ question: q.question, text, policy, cards });
}

/** The scheduled change feed: what moved, and every stored answer that relied on it. */
async function changeFeed(ports, owner) {
  const library = await ports.readLibrary();
  const moved = new Set();
  for (const c of library) {
    if (c.retired || c.accepted === false) moved.add(c.instrumentId);
  }
  for (const instrumentId of moved) {
    const affected = await ports.answersCiting(instrumentId);
    const ids = affected.filter((a) => a.outcome === "answered").map((a) => a.id);
    await ports.escalate(
      "cited.change_pending",
      `instrument ${instrumentId} moved; answers relying on it: ${ids.length ? ids.join(", ") : "none"}; owner: ${owner}`,
    );
  }
}

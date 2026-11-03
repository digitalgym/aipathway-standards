/**
 * Policy Desk: answers support, HR and compliance questions from the policy
 * pack the business has approved (staff handbook, leave policy, refunds and
 * returns, privacy, complaints), with a source card on every answer, or
 * declines to a named person.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone. A reimplementation: nothing is taken from the
 * public bot that inspired it beyond its one-line public description.
 *
 * HOW IT IS WOKEN. One run handles what the record hands it:
 *   - email.received:   a question arrived in the support or HR inbox,
 *                       carried by its message_id.
 *   - schedule.tick:    the change feed. Read the policy pack, find policies
 *                       that moved (a clause retired, or a new version loaded
 *                       and not yet accepted), list every stored answer that
 *                       relied on them, and raise a change-pending exception.
 *   - exception.closed: a named person closed an exception on the record.
 *                       Either they accepted a policy change (passed in as
 *                       `acceptances`) or they released a stored answer for
 *                       sending (passed in as `releases`). The build never
 *                       accepts a change, or sends an answer, on its own say.
 *
 * Every outside effect goes through the ports, or through the `reply` hook
 * that stands for the mail system. Nothing is kept between runs: answers and
 * their cards live in the answer register (the `answer` port), acceptances on
 * the gate, exceptions on the exception desk.
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
  const owner = input.owner ?? "the policy owner named on the exception desk";
  const results = [];

  // A policy change counts only when a named person accepted it on the record.
  for (const a of input.acceptances ?? []) {
    if (!a?.clauseId || !named(a.by)) {
      await ports.escalate(
        "cited.acceptance_without_person",
        `clause ${a?.clauseId ?? "?"}: a policy change needs a named person to accept it; not applied (${owner})`,
      );
      continue;
    }
    await ports.acceptClause(a.clauseId, a.by.trim());
  }

  if (input.tick) await changeFeed(ports, owner);

  for (const q of input.questions ?? []) {
    // An open exception with a named owner on this message stops the chain here.
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
    "under over per get got have has had me us they he she his her policy"
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

// Questions that ask for a decision only a person may make: a statement that
// the business or a case complies, a legal reading, a sign-off, or a ruling on
// one person's case. They decline to a person on either audience.
const DECISION_RE =
  /\b(are we|is (it|this|that|the business|our \w+)) (compliant|legal|lawful)\b|\bcompl(y|ies|iant|iance) with\b|\b(unfair|unlawful) dismissal\b|\b(sign[ -]?off|sign (it|this) off|certif(y|icate|ied))\b|\bwould (we|it|this|that) (pass|breach)\b|\bstatement of compliance\b|\bam i entitled\b|\bis (that|this) discrimination\b/i;

/** Usable as a live source on the asked-about date: in force, not retired, accepted. */
function live(c, onDate) {
  return !c.retired && c.accepted !== false && day(c.effectiveDate) <= day(onDate);
}

function overlap(qWords, clause) {
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

  // Step 1: jurisdiction and the asked-about date before retrieving anything.
  // Leave, notice and privacy rules differ by state and by edition.
  if (!q.jurisdiction) {
    return decline(ports, query, "cited.no_jurisdiction", owner, "no state or territory on the question; the policy pack differs by jurisdiction");
  }
  const asOf = q.askedAbout ?? ports.now().toISOString();

  if (DECISION_RE.test(q.question)) {
    return decline(
      ports,
      query,
      "cited.decision_for_person",
      `${owner} (a compliance statement, legal reading or ruling on one case stays with a person)`,
      "the question asks for a compliance statement, a legal interpretation or a decision on one case",
    );
  }

  // Step 2: retrieve clauses, not documents. Commonwealth-wide clauses (AU)
  // apply in every state; a state clause applies only in its own state.
  const pack = await ports.readLibrary();
  const qWords = words(q.question);
  const hits = pack
    .filter((c) => c.jurisdiction === q.jurisdiction || c.jurisdiction === "AU")
    .map((c) => ({ c, s: overlap(qWords, c) }))
    .filter((h) => h.s >= 2)
    .sort((a, b) => b.s - a.s);
  if (hits.length === 0) {
    return decline(ports, query, "cited.not_in_pack", owner, "no clause in the approved policy pack covers this question");
  }

  // Step 3: a policy with a version loaded that no named person has accepted is
  // change pending, and so is one whose covering clauses are retired.
  const policies = [...new Set(hits.map((h) => h.c.instrumentId))];
  const pending = policies.filter((id) => pack.some((c) => c.instrumentId === id && c.accepted === false && !c.retired));
  if (pending.length > 0) {
    return decline(ports, query, "cited.change_pending", owner, `policy ${pending.join(", ")} has a version loaded that no named person has accepted`);
  }
  const liveHits = hits.filter((h) => live(h.c, asOf));
  if (liveHits.length === 0) {
    return decline(ports, query, "cited.change_pending", owner, "the clauses that covered this are retired or not yet in force, and no accepted replacement covers it");
  }
  const top = liveHits[0].s;
  const best = liveHits.filter((h) => h.s === top).map((h) => h.c);
  const bestPolicies = [...new Set(best.map((c) => c.instrumentId))];
  if (bestPolicies.length > 1) {
    return decline(ports, query, "cited.source_conflict", owner, `live policies ${bestPolicies.join(" and ")} both answer this; a person picks and the pick is recorded`);
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
    .map((c) => `${c.instrumentId} clause ${c.id} (${c.edition}, ${c.jurisdiction}, in force from ${day(c.effectiveDate)}): "${c.text}"`)
    .join(" ");

  // Step 7: the audience is a field, and the two audiences get different answers.
  const text =
    policy === "internal"
      ? `${quoted} Next step: apply this to the case on file and take anything the clause does not settle to the policy owner.`
      : `${quoted} This is what our policy says. Whether it applies to your situation is decided by a member of our team, who will confirm in writing.`;

  // Step 8: stored with its cards. The answer port is the register.
  return ports.answer({ question: q.question, text, policy, cards });
}

/** The scheduled change feed: what moved, and every stored answer that relied on it. */
async function changeFeed(ports, owner) {
  const pack = await ports.readLibrary();
  const moved = new Set(pack.filter((c) => c.retired || c.accepted === false).map((c) => c.instrumentId));
  for (const policyId of moved) {
    const affected = await ports.answersCiting(policyId);
    const ids = affected.filter((a) => a.outcome === "answered").map((a) => a.id);
    await ports.escalate(
      "cited.change_pending",
      `policy ${policyId} moved; answers relying on it: ${ids.length ? ids.join(", ") : "none"}; owner: ${owner}`,
    );
  }
}

/** Send a stored answer a named person released. It counts only with a message_id back. */
async function release(ports, r, reply, owner) {
  if (!r?.answer || r.answer.outcome !== "answered" || !Array.isArray(r.answer.cards) || r.answer.cards.length === 0 || !r.answer.text) {
    await ports.escalate("cited.release_refused", `${r?.messageId ?? "?"}: only an answered answer with a card can be sent (${owner})`);
    return { sent: false };
  }
  if (!named(r.by)) {
    await ports.escalate("cited.release_without_person", `${r.messageId}: sending needs a named person to release the answer (${owner})`);
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

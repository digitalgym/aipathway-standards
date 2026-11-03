/**
 * Agent Rules Desk: answers a real estate agency's own agents on the state
 * agent rules the agency is accountable for (trust money, agency agreements,
 * price indications, commission and rebate disclosure, the agency's own
 * compliance manual), with a source card on every answer, or declines to the
 * agency's named licensee in charge.
 *
 * Built to AIP-BS-CITED-ANSWER 2026-10-03
 * (https://aipathway.com.au/explore-ai/cited-answer-build-standard), written
 * from the standard alone. Australian state rules: the jurisdiction is the
 * state or territory the agency's licence is held in (NSW, QLD, VIC and the
 * rest), never another country's regulator.
 *
 * HOW IT IS WOKEN. Each run handles what the record hands it, keeps nothing:
 *   - email.received:   an agent's question landed in the compliance inbox,
 *                       carried by its message_id, with the licence state.
 *   - schedule.tick:    the change feed. Read the rule library, find every
 *                       instrument that moved (a clause retired, or a new
 *                       version loaded that nobody has accepted), list the
 *                       stored answers that relied on it, raise one exception
 *                       per instrument to the licensee in charge.
 *   - exception.closed: the licensee in charge closed an exception. They
 *                       either accepted a rule change (`acceptances`) or
 *                       released a stored answer to go back to the agent
 *                       (`releases`). The build never does either on its own.
 *
 * @param {import("@aipathway/conformance").CitedAnswerPorts} ports
 * @param {{
 *   questions?: Array<{ messageId: string, question: string, policy: "public"|"internal", state?: string, askedAbout?: string }>,
 *   acceptances?: Array<{ clauseId: string, by?: string }>,
 *   releases?: Array<{ answer: { id: string, outcome: string, text: string|null, cards: unknown[] }, messageId: string, by?: string }>,
 *   send?: (msg: { inReplyTo: string, body: string, answerId: string, releasedBy: string }) => Promise<string|null> | string | null,
 *   tick?: boolean,
 *   licensee?: string,
 *   openException?: (messageId: string) => null | { owner: string },
 * }} [input]
 */
export async function build(ports, input = {}) {
  const licensee = input.licensee ?? "the licensee in charge named on the exception desk";
  const out = [];

  for (const a of input.acceptances ?? []) await accept(ports, a, licensee);
  if (input.tick) await changeFeed(ports, licensee);

  for (const q of input.questions ?? []) {
    // An open exception with a named owner on this message: do nothing, exit.
    if (input.openException?.(q.messageId)) continue;
    out.push(await answerQuestion(ports, q, licensee));
  }

  for (const r of input.releases ?? []) out.push(await sendReleased(ports, r, input.send, licensee));
  return out;
}

// ---------------------------------------------------------------------------
// Small helpers

const STATES = new Set(["NSW", "QLD", "VIC", "SA", "WA", "TAS", "ACT", "NT"]);
const NATIONAL = "AU";
const IGNORE = new Set(
  (
    "the and for are was were with from that this what when where which who how does did can could should would will " +
    "must may our your their they them you have has had into onto about after before than then there here its it's " +
    "any all per one two get got need needs agent agents agency we us me i a an of to in on at by is be do or as if"
  ).split(" "),
);
const root = (w) => w.replace(/(ments|ment|ings|ing|ied|ies|ed|es|s)$/, "");
const terms = (s) =>
  new Set(
    String(s ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !IGNORE.has(w))
      .map(root),
  );
const ymd = (iso) => String(iso).slice(0, 10);
const isNamed = (by) => typeof by === "string" && by.trim().length >= 3;

// The questions that ask the desk to decide what stays with a person: that a
// listing, a file or the agency complies, that something is or is not a breach
// or misleading conduct, what the regulator would do, or a sign-off. These go
// to the licensee in charge on either audience, before anything is retrieved.
const FOR_A_PERSON = [
  /\b(is|are|was) (this|that|it|we|our \w+|the (file|listing|agency|campaign|ad|advert))\b.{0,40}\b(compliant|legal|lawful|a breach|in breach|misleading|underquot\w*)\b/i,
  /\bcompl(y|ies|iant)\b.{0,30}\b(with|under)\b/i,
  /\b(would|will) (we|it|this|that|the regulator|fair trading)\b.{0,30}\b(fine|pass|breach|prosecute|cancel|suspend)\b/i,
  /\b(sign[ -]?off|sign (this|it|that) off|certif(y|ies|ied|icate)|statement of compliance|audit (clean|pass))\b/i,
  /\b(can|could) (we|i) (lose|keep) (our|my) licen[cs]e\b/i,
];

function asksForAPerson(question) {
  return FOR_A_PERSON.some((re) => re.test(question));
}

function inForce(c, onDate) {
  return c.retired !== true && c.accepted !== false && ymd(c.effectiveDate) <= ymd(onDate);
}

function score(qTerms, clause) {
  let n = 0;
  for (const t of terms(clause.text)) if (qTerms.has(t)) n += 1;
  return n;
}

function card(c) {
  return {
    instrumentId: c.instrumentId,
    clauseId: c.id,
    edition: c.edition,
    jurisdiction: c.jurisdiction,
    effectiveDate: c.effectiveDate,
  };
}

async function declineTo(ports, q, policy, reason, route, why) {
  await ports.escalate(reason, `${q.messageId ?? "no message_id"}: ${why}`);
  return ports.answer({ question: q.question, text: null, policy, cards: [], route });
}

// ---------------------------------------------------------------------------
// One question, in the standard's order

async function answerQuestion(ports, q, licensee) {
  const policy = q.policy === "public" ? "public" : "internal";
  const state = String(q.state ?? "").toUpperCase();

  // 1. Jurisdiction and asked-about date first. A trust money rule in NSW is
  //    not the QLD rule, and an edition from last year is not this year's.
  if (!STATES.has(state)) {
    return declineTo(ports, q, policy, "cited.no_jurisdiction", licensee, "no Australian state or territory licence on the question; agent rules differ by state");
  }
  const onDate = q.askedAbout ?? ports.now().toISOString();

  if (asksForAPerson(q.question)) {
    return declineTo(
      ports,
      q,
      policy,
      "cited.decision_for_person",
      `${licensee} (a compliance finding, breach call or sign-off stays with the licensee)`,
      "the question asks for a compliance finding, a reading of the law or a sign-off on one file",
    );
  }

  // 2. Retrieve clauses for that state, plus the agency's own national manual.
  const library = await ports.readLibrary();
  const qTerms = terms(q.question);
  const candidates = library
    .filter((c) => c.jurisdiction === state || c.jurisdiction === NATIONAL)
    .map((c) => ({ c, s: score(qTerms, c) }))
    .filter((x) => x.s >= 3);
  if (candidates.length === 0) {
    return declineTo(ports, q, policy, "cited.not_in_library", licensee, `nothing in the ${state} rule library covers this question`);
  }

  // 3. Live on the asked-about date. An instrument with an unaccepted version
  //    waiting is change pending, whatever its older clause says.
  const touched = new Set(candidates.map((x) => x.c.instrumentId));
  const waiting = [...touched].filter((id) => library.some((c) => c.instrumentId === id && c.accepted === false && c.retired !== true));
  if (waiting.length > 0) {
    return declineTo(ports, q, policy, "cited.change_pending", licensee, `${waiting.join(", ")} has a new version nobody has accepted yet`);
  }
  const live = candidates.filter((x) => inForce(x.c, onDate));
  if (live.length === 0) {
    return declineTo(ports, q, policy, "cited.change_pending", licensee, "the clauses that covered this are retired or not yet in force");
  }

  // Source conflict: two live instruments tie for the answer. The licensee picks.
  const best = Math.max(...live.map((x) => x.s));
  const top = live.filter((x) => x.s === best).map((x) => x.c);
  const instruments = [...new Set(top.map((c) => c.instrumentId))];
  if (instruments.length > 1) {
    return declineTo(ports, q, policy, "cited.source_conflict", licensee, `${instruments.join(" and ")} are both live and answer this differently`);
  }

  // 4 and 5. Compose only from the retrieved clause text, a card for each.
  const quoted = top
    .map((c) => `${c.instrumentId} cl ${c.id}, ${c.edition}, ${c.jurisdiction}, in force from ${ymd(c.effectiveDate)}: "${c.text}"`)
    .join(" ");

  // 7. The audience is a field. Internal answers may say what to do next; a
  //    public answer says what the rule says and stops.
  const text =
    policy === "internal"
      ? `${quoted} What to do: follow the clause on this file, and take anything it does not settle to ${licensee}.`
      : `${quoted} That is what the rule says. How it applies to your sale or tenancy is for our licensee to confirm.`;

  // 8. Stored with its cards on the answer register.
  return ports.answer({ question: q.question, text, policy, cards: top.map(card) });
}

// ---------------------------------------------------------------------------
// Acceptance, change feed, release

async function accept(ports, a, licensee) {
  if (!a?.clauseId || !isNamed(a.by)) {
    await ports.escalate(
      "cited.acceptance_without_person",
      `clause ${a?.clauseId ?? "?"}: a rule change is accepted by a named person only; left pending (${licensee})`,
    );
    return;
  }
  await ports.acceptClause(a.clauseId, a.by.trim());
}

async function changeFeed(ports, licensee) {
  const library = await ports.readLibrary();
  const moved = [...new Set(library.filter((c) => c.retired === true || c.accepted === false).map((c) => c.instrumentId))];
  for (const id of moved) {
    const relied = (await ports.answersCiting(id)).filter((a) => a.outcome === "answered").map((a) => a.id);
    await ports.escalate(
      "cited.change_pending",
      `${id} moved; answers that relied on it: ${relied.length ? relied.join(", ") : "none"}; accept or reject: ${licensee}`,
    );
  }
}

async function sendReleased(ports, r, send, licensee) {
  const a = r?.answer;
  if (!a || a.outcome !== "answered" || !a.text || !Array.isArray(a.cards) || a.cards.length === 0) {
    await ports.escalate("cited.release_refused", `${r?.messageId ?? "?"}: only an answer with a source card goes back to the agent (${licensee})`);
    return { sent: false };
  }
  if (!isNamed(r.by)) {
    await ports.escalate("cited.release_without_person", `${r.messageId}: a named person releases the answer before it is sent (${licensee})`);
    return { sent: false };
  }
  const messageId = typeof send === "function" ? await send({ inReplyTo: r.messageId, body: a.text, answerId: a.id, releasedBy: r.by.trim() }) : null;
  if (typeof messageId !== "string" || messageId.length === 0) {
    await ports.escalate("cited.send_unconfirmed", `${r.messageId}: the mail system returned no message_id; not sent (${licensee})`);
    return { sent: false };
  }
  return { sent: true, messageId, answerId: a.id };
}

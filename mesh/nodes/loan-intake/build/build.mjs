/**
 * Loan Intake: the broker's front desk, built to AIP-BS-ADVICE-FILE.
 *
 * One job. When a lead or client interview lands, turn it into the one client
 * file in the broker's CRM that the next person can pick up: consent recorded
 * first, the client's own words kept with a span, only published keys written,
 * lookups resolved, every blocking gap (a missing figure or document) left as
 * one task with a named owner and a due date, lender policy answered from a
 * dated, accepted clause or declined, and a draft that a named broker approves.
 * It never sends, never selects a product, never assesses suitability.
 *
 * It keeps nothing between runs. Every run reads the interviews, reads each
 * client's file by id, and skips an interview the file already carries, so a
 * retried wake does not make a second file or a second task.
 *
 * Everything it does to the outside world goes through the ports it is handed.
 */

const DAY = 86_400_000;

/** Who owns what. Named people on the business's own account, never the bot. */
export const DEFAULT_CONFIG = {
  // The broker who owns the client file, and so its open gaps.
  gapOwner: "Broker on the file (Jordan Lee)",
  // Where an undecided lender-policy question goes.
  creditRoute: "Head of Credit (Morgan Reid)",
  // Who a breach_suspect coaching finding goes to.
  complianceOwner: "Compliance Officer (Sam Okafor)",
  // A gap is due back in two days.
  gapDueDays: 2,
};

// ── the mapper: utterance to key-contract proposal ───────────────────────────
// It proposes a key and a value from the client's words. It is replaceable and
// knows nothing about lender policy. Low confidence never becomes a value.

const HEDGE = /\b(um+|uh+|maybe|i think|not sure|roughly|around|ish|or so|something like)\b/i;
const MONEY = /\$\s?([\d,]+(?:\.\d+)?)\s*(k|m)?\b/i;

function money(text) {
  const m = MONEY.exec(text);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (m[2]?.toLowerCase() === "k") n *= 1000;
  if (m[2]?.toLowerCase() === "m") n *= 1_000_000;
  return Number.isFinite(n) ? String(Math.round(n)) : null;
}

/**
 * One utterance in, zero or more proposals out:
 * { key, value | null, lookup?, unclear? }.
 * A proposal with `unclear` becomes a MissingField with reason asked_unclear.
 */
function propose(text) {
  const out = [];
  let m;
  if ((m = /\b[Mm]y name is ([A-Z][\w'-]+(?: [A-Z][\w'-]+)*)/.exec(text))) out.push({ key: "applicant_name", value: m[1] });
  if ((m = /\b(?:property|place|home|house|unit) (?:is |we're buying is )?at (.+?)(?:[.?!]|$)/i.exec(text))) {
    out.push({ key: "security_address", lookup: "address", spoken: m[1].trim() });
  }
  if (/\b(full[- ]time|part[- ]time|PAYG|salaried)\b/i.test(text)) out.push({ key: "employment_type", value: "payg" });
  else if (/\bself[- ]employed\b/i.test(text)) out.push({ key: "employment_type", value: "self_employed" });
  else if (/\bcasual\b/i.test(text) && /\bwork|job|employ/i.test(text)) out.push({ key: "employment_type", value: "casual" });
  if ((m = /\bwork (?:at|for) (.+?)(?:[,.?!]| as | full| part|$)/i.exec(text))) out.push({ key: "employer", lookup: "employer", spoken: m[1].trim() });
  if (/\b(earn|salary|income|make)\b/i.test(text)) {
    const v = money(text);
    out.push(v && !HEDGE.test(text) ? { key: "gross_income", value: v } : { key: "gross_income", value: null, unclear: true });
  }
  if (/\b(saved|savings|deposit)\b/i.test(text) && !/\?\s*$/.test(text)) {
    const v = money(text);
    out.push(v && !HEDGE.test(text) ? { key: "genuine_savings", value: v } : { key: "genuine_savings", value: null, unclear: true });
  }
  if (/\b(spend|expenses|living costs|cost of living)\b/i.test(text) && !/\?\s*$/.test(text)) {
    const v = money(text);
    out.push(v && !HEDGE.test(text) ? { key: "living_expenses", value: v } : { key: "living_expenses", value: null, unclear: true });
  }
  if ((m = /\bcurrently (?:with|bank with|have it with) (.+?)(?:[,.?!]|$)/i.exec(text))) out.push({ key: "existing_lender", lookup: "lender", spoken: m[1].trim() });
  // An impression is not a field. The mapper proposes it under its own name
  // and the CRM's key contract refuses it; that refusal is the record.
  if (/\b(seems|comfortable|happy|keen|nervous)\b/i.test(text) && out.length === 0) out.push({ key: "broker_impression", value: text });
  return out;
}

// ── the transcript ───────────────────────────────────────────────────────────

/** Split "Broker: ..." / "Client: ..." and lay each line on one offset scale. */
function lines(interview) {
  const rows = [];
  let at = 0;
  for (const raw of interview.utterances) {
    const m = /^\s*(broker|client)\s*:\s*(.*)$/i.exec(raw);
    const speaker = m ? m[1].toLowerCase() : "client";
    const text = m ? m[2] : raw;
    rows.push({ speaker, text, raw, span: { start: at, end: at + raw.length } });
    at += raw.length + 1;
  }
  return rows;
}

/** The notice is the first thing the broker says, and the client agrees next. */
function consentOf(rows) {
  const first = rows[0];
  const noticed = first && first.speaker === "broker" && /record/i.test(first.text) && /transcri/i.test(first.text);
  const reply = rows[1];
  const agreed = noticed && reply && reply.speaker === "client" && /\b(yes|yep|yeah|sure|fine|ok(ay)?|go ahead|no worries)\b/i.test(reply.text) && !/\b(no|don't|do not|rather not)\b/i.test(reply.text.replace(/no worries/i, ""));
  return { noticed: Boolean(noticed), agreed: Boolean(agreed) };
}

// ── lender policy: from the dated library, or declined ───────────────────────

const TOPICS = ["gifted deposit", "genuine savings", "casual income", "self-employed", "lmi", "guarantor"];

function isQuestion(row) {
  return row.speaker === "client" && /\?\s*$/.test(row.text);
}

/** A clause answers only while it is live: not retired, and accepted by a person. */
function liveClauseFor(panel, lenderId, topic) {
  return panel.find((c) => !c.retired && c.accepted === true && c.lenderId === lenderId && c.text.toLowerCase().includes(topic));
}

async function cardFor(ports, panel, question) {
  const topic = TOPICS.find((t) => question.toLowerCase().includes(t));
  const lender = await ports.resolve("lender", question);
  if (!topic || !lender || lender.confidence < 0.8) return null;
  const clause = liveClauseFor(panel, lender.resolved, topic);
  if (!clause) return null;
  return {
    clause,
    card: { lenderId: clause.lenderId, clauseId: clause.id, edition: clause.edition, jurisdiction: clause.jurisdiction, effectiveDate: clause.effectiveDate },
  };
}

// ── the run ──────────────────────────────────────────────────────────────────

export function makeBuild(config = DEFAULT_CONFIG) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return async function build(ports) {
    const interviews = await ports.readInterviews();

    for (const iv of interviews) {
      // Read the client's file by id. An interview the file already carries is
      // done: a retried wake must not make a second file or a second task.
      const before = await ports.readFile(iv.clientId);
      if (before && before.interviewIds.includes(iv.id)) continue;

      const rows = lines(iv);

      // Check 1. Consent before anything is captured or written.
      const consent = consentOf(rows);
      await ports.recordConsent(iv.id, { recording: consent.agreed, transcription: consent.agreed });
      if (!consent.agreed) {
        await ports.escalate(
          "consent_not_recorded",
          `${iv.id}: the recording and transcription notice was ${consent.noticed ? "refused" : "not given first"}. No file is written from it; ${cfg.gapOwner} types the notes.`,
        );
        continue;
      }

      // Check 2. Every line verbatim, with its span, before any field.
      for (const r of rows) await ports.captureVerbatim(iv.id, r.raw, r.span);

      // Checks 3 and 4. Map client lines onto the key contract; resolve lookups.
      const fields = {};
      const unclear = new Set();
      for (const r of rows) {
        if (r.speaker !== "client" || isQuestion(r)) continue;
        for (const p of propose(r.text)) {
          if (p.lookup) {
            const hit = await ports.resolve(p.lookup, p.spoken);
            if (hit && hit.confidence >= 0.8) {
              fields[p.key] = hit.resolved;
              unclear.delete(p.key);
            } else if (fields[p.key] === undefined) unclear.add(p.key);
          } else if (p.unclear) {
            if (fields[p.key] === undefined) unclear.add(p.key);
          } else {
            fields[p.key] = p.value;
            unclear.delete(p.key);
          }
        }
      }
      if (iv.purpose === "other" && fields.loan_purpose === undefined) {
        const said = rows.find((r) => r.speaker === "client" && /\b(want|looking) to\b/i.test(r.text));
        if (said) fields.loan_purpose = said.text;
      }

      // Check 5. One file per client: update it by its id, or create the first.
      const written = await ports.writeFile({
        ...(before ? { fileId: before.id } : {}),
        clientId: iv.clientId,
        purpose: iv.purpose,
        interviewId: iv.id,
        fields,
      });
      if (!written.externalId) {
        await ports.escalate("file_write_failed", `${iv.id}: the CRM returned no external id. The interview failed; ${cfg.gapOwner} takes notes.`);
        continue;
      }
      const file = await ports.readFile(iv.clientId);
      if (!file || file.externalId !== written.externalId) {
        await ports.escalate("file_readback_failed", `${iv.id}: ${written.externalId} did not read back.`);
        continue;
      }

      // Check 3. Completeness is the CRM's computation, read back, never typed.
      const done = await ports.readCompleteness(file.id);
      const missing = (done?.missing ?? []).map((key) => ({
        fieldKey: key,
        // A gap this interview did not touch keeps the reason it was parked with.
        reason: unclear.has(key) ? "asked_unclear" : (before?.missing.find((m) => m.fieldKey === key)?.reason ?? "not_asked"),
        blocks: "recommendation",
      }));
      await ports.writeFile({ fileId: file.id, clientId: iv.clientId, purpose: iv.purpose, interviewId: iv.id, fields: {}, missing });

      // Check 6. One task per blocking gap, raised once, with an owner and a due date.
      const open = await ports.readTasks(file.id);
      const due = new Date((await ports.now()).getTime() + cfg.gapDueDays * DAY).toISOString().slice(0, 10);
      for (const gap of missing) {
        if (gap.blocks === "none" || open.some((t) => t.fieldKey === gap.fieldKey)) continue;
        await ports.raiseTask({ fileId: file.id, interviewId: iv.id, fieldKey: gap.fieldKey, owner: cfg.gapOwner, due });
      }

      // Checks 7, 8 and 12. Lender policy from the dated, accepted library, or declined.
      const panel = await ports.readPanel();
      for (const r of rows.filter(isQuestion)) {
        const hit = await cardFor(ports, panel, r.text);
        if (hit) {
          await ports.answerPanel({ question: r.text, text: `Per ${hit.clause.lenderId} clause ${hit.clause.id} (edition ${hit.clause.edition}, effective ${hit.clause.effectiveDate}): ${hit.clause.text}`, cards: [hit.card] });
        } else {
          await ports.answerPanel({ question: r.text, text: null, cards: [], route: cfg.creditRoute });
        }
      }

      // Check 9. The draft for internal approval. Every lender question the
      // client has asked must still have a live card; no product is chosen here.
      const asked = interviews.filter((x) => x.clientId === iv.clientId).flatMap((x) => lines(x).filter(isQuestion).map((r) => r.text));
      const cards = [];
      let sourceGap = false;
      for (const q of asked) {
        const hit = await cardFor(ports, panel, q);
        if (hit) cards.push(hit.card.clauseId);
        else sourceGap = true;
      }
      const blocking = missing.some((m) => m.blocks !== "none");
      const queue = blocking || sourceGap ? "blocked" : cards.length === 0 ? "draft" : "ready_for_person";
      await ports.draft({ fileId: file.id, interviewId: iv.id, productIds: [], cardIds: [...new Set(cards)], queue });

      // Check 10. Coaching cites a span; breach_suspect goes to a named person.
      const required = done?.required ?? [];
      const expensesAsked = rows.some((r) => r.speaker === "broker" && /\b(spend|expenses|living costs)\b/i.test(r.text));
      if (required.includes("living_expenses") && !expensesAsked) {
        const whole = { start: 0, end: rows.at(-1)?.span.end ?? 0 };
        await ports.coach({ interviewId: iv.id, findingKey: "living_expenses_not_asked", severity: "gap", evidenceSpan: whole });
      }
      for (const r of rows) {
        if (r.speaker === "broker" && /\b\d+(\.\d+)?\s?%/.test(r.text) && /\brate\b/i.test(r.text)) {
          await ports.coach({ interviewId: iv.id, findingKey: "rate_quoted_on_call", severity: "breach_suspect", evidenceSpan: r.span });
          await ports.escalate("breach_suspect", `${iv.id}: a rate was quoted on the call at ${r.span.start}-${r.span.end}. For ${cfg.complianceOwner}.`);
        }
      }

      // Check 11. Read everything back by the interview id.
      await ports.readByInterview(iv.id);
    }
  };
}

export const build = makeBuild();

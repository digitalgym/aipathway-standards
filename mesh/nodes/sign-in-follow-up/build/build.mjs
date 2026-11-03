/**
 * Sign-In Follow-Up: the build, to AIP-BS-OPEN-HOME-FEEDBACK (2026-10-24).
 *
 * Takes the open-home sign-in register, follows up only the people who said
 * yes at sign-in, with one approved message each, sorts what comes back, and
 * drafts the vendor's report from what buyers actually said.
 *
 * Every run is the same short loop and keeps nothing between runs. All state
 * is read back through the ports: the register, the drafts already written,
 * the replies already filed, the latest report version and its approval.
 *
 *   1. Read the register as written. Raise, never repair.
 *   2. No consent recorded at sign-in, no draft.
 *   3. One person per listing, matched on mobile then email, never on name.
 *   4. One draft per person per listing: thanks, one question, sender, opt-out.
 *   5. Send only a draft the agent approved, and never to anyone who opted out.
 *   6. A STOP is recorded against the person, for every later open and listing.
 *   7. File every reply by class; anything unclear goes to the agent.
 *   8. An offer or a complaint goes to the agent, unanswered.
 *   9. Draft the vendor report: counts, verbatim price comments, cited themes.
 *  10. Send the report only once the agent approved that exact version.
 *  11. Every consent, send, reply, class, opt-out and report is on the record.
 *  12. The optional call goes only through the gate, only to someone who asked.
 *
 * The live call is Office Voice's governed create_call. Nothing here dials.
 */

const DEFAULTS = {
  agency: "Coastline Property",
  agentName: "your agent",
  /** The one question per listing: interest, price or contract. */
  questionFor: () => "interest",
};

const QUESTION_TEXT = {
  interest: "How interested are you in the property after seeing it",
  price: "What did you think of the price guide",
  contract: "Would you like a copy of the contract",
};

// ---- reading the register as written ---------------------------------------

/** Digits only, Australian 0 prefix, so 0412 345 678 and +61 412 345 678 match. */
export function normaliseMobile(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) return `0${d.slice(2)}`;
  if (d.length === 9 && d.startsWith("4")) return `0${d}`;
  return d;
}

const normaliseEmail = (v) => String(v ?? "").trim().toLowerCase();
const present = (v) => String(v ?? "").trim().length > 0;

/** Consent as written at sign-in. Only an explicit yes counts. */
export function consentGiven(row) {
  return /^(y|yes|true|ticked|✓)$/i.test(String(row.consent ?? "").trim());
}

/** The person, keyed as the stub keys opt-outs: mobile digits, else email. */
function personKey(row) {
  const m = normaliseMobile(row.mobile);
  if (m) return `m:${m}`;
  const e = normaliseEmail(row.email);
  return e ? `e:${e}` : `row:${row.rowId}`;
}

/** Same person if the mobile matches, or failing that the email. Never the name. */
function samePerson(a, b) {
  const ma = normaliseMobile(a.mobile);
  const mb = normaliseMobile(b.mobile);
  if (ma && mb && ma === mb) return true;
  const ea = normaliseEmail(a.email);
  const eb = normaliseEmail(b.email);
  return Boolean(ea && eb && ea === eb);
}

// ---- replies ---------------------------------------------------------------

const STOP_RE = /^\s*(stop|unsubscribe|opt ?out)\b|\b(stop (messaging|texting|emailing|contacting)|remove me|unsubscribe|don'?t (contact|message|text|email) (me|us)|take (me|us) off)\b/i;
const OFFER_RE = /\$\s?\d|\b\d+(\.\d+)?\s?(k|m|mil|million)\b|\b(offer|we('|')?d pay|would pay|happy to pay|willing to pay|put in|pay (up to|around|about))\b/i;
const COMPLAINT_RE = /\b(complain|complaint|rude|unprofessional|disappointed|disgrace|terrible|appalling|poor(ly)? run|very poor|late|locked|waste of (my|our) time|not good enough)\b/i;

const CLASS_RULES = [
  ["hot_buyer", /\b(contract|second look|another look|look again|inspect again|second inspection|building and pest|keen|very interested|really interested|love(d)? it|make a time)\b/i],
  ["price_feedback", /\b(price|priced|guide|overpriced|underpriced|expensive|cheap|value|worth|asking)\b/i],
  ["not_interested", /\b(not for us|not interested|bought elsewhere|bought another|found (another|something)|no thanks|not quite right|ruled it out)\b/i],
  ["appraisal_lead", /\b(sell (ours|our|mine|my)|selling (ours|our|mine|my)|our (place|home|house|unit|apartment) (first|to sell)|appraisal|what (ours|our place) is worth|need to sell)\b/i],
];

/**
 * Route first, then classify. A STOP, an offer and a complaint are never
 * classes: they are routed. Anything left with no class is unclear.
 */
export function readReply(text) {
  const t = String(text ?? "");
  if (STOP_RE.test(t)) return { route: "stop", classes: [] };
  if (OFFER_RE.test(t)) return { route: "offer", classes: [] };
  if (COMPLAINT_RE.test(t)) return { route: "complaint", classes: [] };
  const classes = CLASS_RULES.filter(([, re]) => re.test(t)).map(([c]) => c);
  // "Not interested" and "keen" in one breath is not a reading we trust.
  if (classes.includes("hot_buyer") && classes.includes("not_interested")) return { route: "unclear", classes: [] };
  return { route: classes.length ? "none" : "unclear", classes };
}

// ---- the report ------------------------------------------------------------

/** ISO week of a date, as 2026-W44. */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const sameReport = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- the build -------------------------------------------------------------

export function createBuild(options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  function draftBody(row, question) {
    const hello = present(row.name) ? `Hi ${String(row.name).trim()},` : "Hi,";
    return [
      hello,
      `thanks for coming through the open home for listing ${row.listingId}. This is ${cfg.agentName} from ${cfg.agency}.`,
      `${QUESTION_TEXT[question]}?`,
      `${cfg.agency}. Reply STOP and we will not contact you again.`,
    ].join("\n");
  }

  /**
   * @param {import("@aipathway/conformance").OpenHomePorts} ports
   */
  return async function build(ports) {
    const register = await ports.readRegister();
    const existingDrafts = await ports.listDrafts();
    const rowById = new Map(register.map((r) => [r.rowId, r]));

    // 1 and 2. Read as written. A gap or a missing yes goes to the agent.
    const usable = [];
    for (const row of register) {
      const missing = [];
      if (!present(row.name)) missing.push("name");
      if (!present(row.mobile) && !present(row.email)) missing.push("a mobile or an email");
      if (!present(row.openId)) missing.push("the open it belongs to");
      if (missing.length) {
        await ports.raiseException(row.rowId, "incomplete_row", `register row ${row.rowId} has no ${missing.join(", no ")}; fix it from the sheet, nothing was filled in`);
        continue;
      }
      if (!consentGiven(row)) {
        const said = present(row.consent) ? `"${String(row.consent).trim()}"` : "blank";
        await ports.raiseException(row.rowId, "no_consent", `register row ${row.rowId} at open ${row.openId}: consent ${said} at sign-in; no follow-up drafted`);
        continue;
      }
      usable.push(row);
    }

    // 3. One attendee per listing across opens. The first sign-in is theirs;
    // any later one is flagged so the agent sees they came back.
    const draftedRows = existingDrafts.map((d) => rowById.get(d.rowId)).filter(Boolean);
    const firsts = [];
    for (const row of usable) {
      const prior =
        draftedRows.find((r) => r.listingId === row.listingId && samePerson(r, row)) ??
        firsts.find((r) => r.listingId === row.listingId && samePerson(r, row));
      if (prior && prior.rowId !== row.rowId) {
        await ports.raiseException(
          row.rowId,
          "duplicate_attendee",
          `the same person signed in at open ${prior.openId} (row ${prior.rowId}) and open ${row.openId} (row ${row.rowId}) for listing ${row.listingId}; one follow-up only`,
        );
        continue;
      }
      if (!prior) firsts.push(row);
    }

    // 4. One draft per person per listing, written and not sent.
    const drafts = [...existingDrafts];
    for (const row of firsts) {
      if (drafts.some((d) => d.rowId === row.rowId)) continue;
      if (await ports.hasOptedOut(row.rowId)) continue; // a STOP from any earlier open holds
      const question = cfg.questionFor(row.listingId);
      await ports.record({ kind: "consent", ref: row.rowId, detail: `consent "${String(row.consent).trim()}" at sign-in, open ${row.openId}, listing ${row.listingId}, as written` });
      const d = await ports.draft(row.rowId, question, draftBody(row, question));
      drafts.push(d);
    }

    // 6, 7 and 8. Read replies first, so a STOP in this batch blocks a send in this run.
    const replies = await ports.readReplies();
    const repliedDrafts = new Set(replies.map((r) => r.draftId));
    for (const reply of replies) {
      if (reply.filed) continue;
      const read = readReply(reply.text);
      await ports.record({ kind: "reply", ref: reply.replyId, detail: reply.text });
      if (read.route === "stop") {
        await ports.recordOptOut(reply.rowId, reply.text);
        await ports.record({ kind: "opt_out", ref: reply.rowId, detail: `withdrew consent in reply ${reply.replyId}; no later register clears it` });
      } else if (read.route === "offer" || read.route === "complaint") {
        await ports.raiseException(reply.replyId, read.route, `${read.route} from row ${reply.rowId}, listing ${reply.listingId}, word for word: ${reply.text}`);
      } else if (read.route === "unclear") {
        await ports.raiseException(reply.replyId, "unclear_reply", `reply from row ${reply.rowId} fits no class, word for word: ${reply.text}`);
      }
      await ports.classify(reply.replyId, read.classes);
      await ports.record({ kind: "classified", ref: reply.replyId, detail: read.route === "none" ? read.classes.join(",") : `routed: ${read.route}` });
    }

    // 5. The send reads the agent's yes against that draft. Nothing else sends.
    const approved = new Set();
    for (const d of drafts) {
      if (repliedDrafts.has(d.draftId)) {
        approved.add(d.draftId); // it was sent, or nobody could have replied
        continue;
      }
      if (!(await ports.isApproved(d.draftId))) continue;
      if (await ports.hasOptedOut(d.rowId)) continue;
      approved.add(d.draftId);
      const res = await ports.send(d.draftId);
      if (res?.sent) await ports.record({ kind: "sent", ref: d.draftId, detail: `follow-up to row ${d.rowId} sent; approved by the agent against draft ${d.draftId}` });
    }

    // 9 and 10. The vendor report, per listing, built from filed replies only.
    const week = isoWeek(await ports.now());
    const listings = [...new Set(drafts.map((d) => d.listingId))].sort();
    for (const listingId of listings) {
      const people = [];
      for (const row of register.filter((r) => r.listingId === listingId)) {
        if (!people.some((p) => samePerson(p, row) || p.rowId === row.rowId)) people.push(row);
      }
      const mine = replies.filter((r) => r.listingId === listingId);
      const byClass = { hot_buyer: 0, price_feedback: 0, not_interested: 0, appraisal_lead: 0 };
      const priceComments = [];
      const cited = new Map();
      for (const r of mine) {
        const read = readReply(r.text);
        for (const c of read.classes) {
          byClass[c] += 1;
          cited.set(c, [...(cited.get(c) ?? []), r.replyId]);
        }
        if (read.classes.includes("price_feedback")) priceComments.push({ replyId: r.replyId, verbatim: r.text });
      }
      const report = {
        listingId,
        week,
        counts: {
          attendees: people.length,
          followUpsSent: drafts.filter((d) => d.listingId === listingId && approved.has(d.draftId)).length,
          replies: mine.length,
          byClass,
        },
        priceComments,
        themes: [...cited.entries()].map(([theme, replyIds]) => ({ theme, replyIds })),
      };

      let latest = await ports.latestReport(listingId);
      if (!latest || !sameReport(latest.report, report)) {
        const version = await ports.draftReport(report);
        await ports.record({ kind: "report", ref: `${listingId}#${version}`, detail: `vendor report drafted to the agent, version ${version}, week ${week}; waits for approval` });
        latest = { version, report, sentToVendor: false };
      }
      if (!latest.sentToVendor && (await ports.reportApproved(listingId, latest.version))) {
        const res = await ports.sendReport(listingId, latest.version);
        if (res?.sent) await ports.record({ kind: "report", ref: `${listingId}#${latest.version}`, detail: `version ${latest.version} sent to the vendor after the agent approved it` });
      }
    }

    // 12. The optional call. Only to someone who ticked call_ok, only after the
    // gate allows it at dial time, opening with the AI disclosure. While the
    // agent has it off, the gate says so and nothing opens.
    for (const d of drafts) {
      const row = rowById.get(d.rowId);
      if (!row?.callOk || !approved.has(d.draftId)) continue;
      const gate = await ports.callGate(row.rowId);
      if (!gate?.allowed) continue;
      const opened = await ports.disclose(row.rowId, `Hi, this is an AI assistant calling for ${cfg.agency} about the open home you asked us to call you about.`);
      if (opened?.opened) await ports.say(row.rowId, `${QUESTION_TEXT[d.question]}?`);
    }
  };
}

export const build = createBuild();

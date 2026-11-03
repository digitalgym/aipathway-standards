/**
 * Open Home Desk: the open-home follow-up job, built to
 * AIP-BS-OPEN-HOME-FEEDBACK 2026-10-24.
 * https://aipathway.com.au/explore-ai/open-home-feedback-build-standard
 *
 * A port of "Mary (Realtor Assistant)" by Rick, reimplemented from the
 * standard. Only the showing follow-up job is ported. Nothing here is taken
 * from the original bot's prompt or instructions.
 *
 * What one run does, every time it is woken (document.received when a sign-in
 * register lands, email.received when a reply lands, schedule.tick to release
 * what a person has approved, exception.closed when a person clears a hold):
 *
 *   1. Read the register as written. A row with no name, no way to reach the
 *      person, or no open is raised as incomplete_row. Nothing is filled in.
 *   2. Read consent as given at sign-in. Anything but "yes" is no_consent, and
 *      nothing is drafted.
 *   3. Group sign-ins per listing on the mobile (normalised), then the email.
 *      Never the name. A person at two opens is one attendee and a
 *      duplicate_attendee exception names both opens.
 *   4. An earlier opt-out, at any open or listing, blocks the draft.
 *   5. Draft one follow-up per person per listing: thanks, one question, the
 *      agency, the opt-out line. It is written, not sent.
 *   6. Release only a draft the agent approved, read at send time.
 *   7. File every reply as written. STOP is recorded as withdrawn consent; an
 *      offer or a complaint goes to the agent with nothing sent back; the rest
 *      are classed, and one that fits no class goes to the agent as unclear.
 *   8. Draft the vendor report to the agent: counts, price comments verbatim,
 *      themes a person tagged with the replies they cite. Send to the vendor
 *      only the version the agent approved.
 *   9. The optional call: only asked for an attendee who ticked call_ok, only
 *      dialled when the gate allows it, opened with the AI disclosure.
 *
 * The build keeps nothing between runs. Everything it needs next time is read
 * back from the register, the drafts folder, the replies and the report store.
 */

/** The questions an open can ask. One per follow-up. */
export const QUESTION_TEXT = {
  interest: "How interested are you in the property, now that you have seen it?",
  price: "What did you think of the price guide?",
  contract: "Would you like us to send you a copy of the contract?",
};

const OPT_OUT_LINE = "Reply STOP and we will not contact you again.";

// Replies that are never a class. Checked first, in this order.
const STOP_RE = /^\s*stop\b|\b(unsubscribe|opt (me )?out|remove me|take me off|stop (messaging|emailing|texting|contacting)|do ?n[o']?t (contact|message|email|text) (me|us)|no more (messages|emails|texts))\b/i;
const OFFER_RE = /\b(offer|bid|we('|’)?d (pay|go to|put in|offer)|would (pay|go to|offer|put in)|happy to pay|willing to pay|prepared to pay|put (in|forward) an?)\b/i;
const COMPLAINT_RE = /\b(complain\w*|rude|unprofessional|disorganised|disorganized|appalling|disgrace\w*|waste of (our|my) time|kept (us|me) waiting|turned up late|was late|nobody (was )?there|no one (was )?there)\b/i;

// The four classes. A reply can carry more than one.
const CLASS_RES = {
  hot_buyer: /\b(contract|second (look|inspection|viewing)|another (look|inspection)|building and pest|b ?& ?p|very keen|really keen|we('|’)?re keen|keen to|ready to buy|want to buy)\b/i,
  price_feedback: /\b(price|priced|pricing|guide|asking|expensive|overpriced|cheap|value for money|good value|\$\s?\d)/i,
  not_interested: /\b(not (for us|for me|interested|what we|quite right)|bought elsewhere|bought (another|somewhere)|no longer looking|too small|too big|isn'?t for us|will pass|going to pass)\b/i,
  appraisal_lead: /\b(sell (ours|our (place|house|home|unit|property))|need to sell|have (a|our) (place|house|home|unit|property) to sell|selling ours|appraisal|what('|’)?s ours worth)\b/i,
};

/** Digits only, with an Australian 0 prefix, so 0412 345 678 and +61 412 345 678 match. */
export function normaliseMobile(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) return `0${d.slice(2)}`;
  if (d.length === 9 && d.startsWith("4")) return `0${d}`;
  return d;
}

const normEmail = (v) => String(v ?? "").trim().toLowerCase();
const blank = (v) => String(v ?? "").trim() === "";

/** ISO week, e.g. 2026-W44, read off the clock the runner owns. */
export function isoWeek(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Sort one reply. Returns a route for the three that are never a class, or the classes. */
export function classifyReply(text) {
  if (STOP_RE.test(text)) return { route: "stop", classes: [] };
  if (OFFER_RE.test(text)) return { route: "offer", classes: [] };
  if (COMPLAINT_RE.test(text)) return { route: "complaint", classes: [] };
  const classes = Object.entries(CLASS_RES)
    .filter(([, re]) => re.test(text))
    .map(([c]) => c);
  return classes.length ? { route: "none", classes } : { route: "unclear", classes: [] };
}

/**
 * Group the complete rows of one listing into people: the same normalised
 * mobile, or the same email, is the same person. Never the name.
 */
function groupPeople(rows) {
  const parent = rows.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map();
  rows.forEach((r, i) => {
    for (const k of [normaliseMobile(r.mobile) && `m:${normaliseMobile(r.mobile)}`, normEmail(r.email) && `e:${normEmail(r.email)}`]) {
      if (!k) continue;
      if (seen.has(k)) parent[find(i)] = find(seen.get(k));
      else seen.set(k, i);
    }
  });
  const groups = new Map();
  rows.forEach((r, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });
  return [...groups.values()];
}

function draftBody(row, question, cfg) {
  const first = String(row.name).trim().split(/\s+/)[0];
  return (
    `Hi ${first}, thank you for coming through the open home with ${cfg.agency}. ` +
    `${QUESTION_TEXT[question]}\n\n` +
    `${cfg.sender}, ${cfg.agency}\n` +
    OPT_OUT_LINE
  );
}

/**
 * @param {import("@aipathway/conformance").OpenHomePorts} ports
 * @param {{
 *   agency?: string, sender?: string, approver?: string,
 *   questionFor?: (listingId: string) => "interest" | "price" | "contract",
 *   themes?: (listingId: string) => Array<{ theme: string, replyIds: string[] }>,
 *   heldBy?: (listingId: string) => string | null,
 *   week?: string,
 * }} [config]
 */
export async function build(ports, config = {}) {
  const cfg = {
    agency: config.agency ?? "Harbour Realty",
    sender: config.sender ?? "Jo Bennett",
    approver: config.approver ?? "the listing agent",
    questionFor: config.questionFor ?? (() => "interest"),
    themes: config.themes ?? (() => []),
    heldBy: config.heldBy ?? (() => null),
  };
  const now = await ports.now();
  const week = config.week ?? isoWeek(now);

  const rows = await ports.readRegister();
  const listings = [...new Set(rows.map((r) => r.listingId).filter(Boolean))];

  // 1-4. The register, read as written, then consent, then the person.
  const existing = await ports.listDrafts();
  const draftedRows = new Set(existing.map((d) => d.rowId));
  const complete = [];
  for (const r of rows) {
    const missing = [];
    if (blank(r.name)) missing.push("name");
    if (blank(r.mobile) && blank(r.email)) missing.push("a mobile or an email");
    if (blank(r.openId) || blank(r.listingId)) missing.push("the open it belongs to");
    if (missing.length) {
      await ports.raiseException(r.rowId, "incomplete_row", `Register row ${r.rowId} has no ${missing.join(", no ")}. Fix it from the sign-in sheet; nothing was drafted.`);
      continue;
    }
    complete.push(r);
  }

  for (const listingId of listings) {
    const held = cfg.heldBy(listingId);
    if (held) continue; // an open exception with a named owner stops the chain for this listing

    const people = groupPeople(complete.filter((r) => r.listingId === listingId));
    for (const signIns of people) {
      if (signIns.length > 1) {
        const opens = [...new Set(signIns.map((r) => r.openId))];
        if (opens.length > 1) {
          await ports.raiseException(
            signIns[0].rowId,
            "duplicate_attendee",
            `The same person signed in at ${opens.join(" and ")} for ${listingId} (rows ${signIns.map((r) => r.rowId).join(", ")}). One follow-up for the listing.`,
          );
        }
      }
      if (signIns.some((r) => draftedRows.has(r.rowId))) continue; // already drafted for this listing

      // Consent as captured on the sign-in that will be followed up.
      const target = signIns.find((r) => String(r.consent ?? "").trim().toLowerCase() === "yes");
      if (!target) {
        for (const r of signIns) {
          await ports.raiseException(r.rowId, "no_consent", `Consent on row ${r.rowId} is ${blank(r.consent) ? "blank" : `"${r.consent}"`}. Nothing was drafted.`);
          await ports.record({ kind: "consent", ref: r.rowId, detail: blank(r.consent) ? "blank" : String(r.consent) });
        }
        continue;
      }
      if (await ports.hasOptedOut(target.rowId)) {
        await ports.record({ kind: "consent", ref: target.rowId, detail: "yes at sign-in; consent withdrawn earlier by the person, so nothing was drafted" });
        continue;
      }
      await ports.record({ kind: "consent", ref: target.rowId, detail: "yes" });
      const question = cfg.questionFor(listingId);
      const d = await ports.draft(target.rowId, question, draftBody(target, question, cfg));
      draftedRows.add(d.rowId);
    }
  }

  // 6. Release only what a person approved. The send port is keyed on the
  //    draft id, so "already sent" is its read-back, not a second message.
  const drafts = await ports.listDrafts();
  const replies = await ports.readReplies();
  const repliedDrafts = new Set(replies.map((r) => r.draftId));
  const sentDrafts = new Set(repliedDrafts);
  for (const d of drafts) {
    if (repliedDrafts.has(d.draftId)) continue; // it went, and they answered
    if (cfg.heldBy(d.listingId)) continue;
    if (await ports.hasOptedOut(d.rowId)) continue;
    if (!(await ports.isApproved(d.draftId))) continue;
    const res = await ports.send(d.draftId);
    if (res.sent) {
      sentDrafts.add(d.draftId);
      await ports.record({ kind: "sent", ref: d.draftId, detail: `approved by ${cfg.approver}; sent to row ${d.rowId}` });
    } else if (res.why === "already sent") {
      sentDrafts.add(d.draftId);
    }
  }

  // 7. Every reply, filed as written.
  const filedNow = new Map(); // replyId -> classes, for this run's report
  for (const r of replies) {
    if (r.filed) continue;
    await ports.record({ kind: "reply", ref: r.replyId, detail: r.text });
    const { route, classes } = classifyReply(r.text);
    if (route === "stop") {
      await ports.recordOptOut(r.rowId, r.text);
      await ports.record({ kind: "opt_out", ref: r.rowId, detail: r.text });
    } else if (route === "offer" || route === "complaint") {
      await ports.raiseException(r.replyId, route, r.text);
    } else if (route === "unclear") {
      await ports.raiseException(r.replyId, "unclear_reply", r.text);
    }
    // Filed with its classes; the three routes and an unclear reply carry none.
    await ports.classify(r.replyId, classes);
    await ports.record({ kind: "classified", ref: r.replyId, detail: route === "none" ? classes.join(", ") : route });
    filedNow.set(r.replyId, classes);
  }

  // Classes of replies filed on earlier runs are re-derived from the text the
  // reply store holds, which is what they were filed from.
  const classesOf = (r) => filedNow.get(r.replyId) ?? classifyReply(r.text).classes;

  // 8. The vendor report, per listing with replies.
  for (const listingId of listings) {
    if (cfg.heldBy(listingId)) continue;
    const mine = replies.filter((r) => r.listingId === listingId);
    if (!mine.length) continue;
    const people = groupPeople(complete.filter((r) => r.listingId === listingId));
    const byClass = { hot_buyer: 0, price_feedback: 0, not_interested: 0, appraisal_lead: 0 };
    const priceComments = [];
    for (const r of mine) {
      const cs = classesOf(r);
      for (const c of cs) byClass[c] += 1;
      if (cs.includes("price_feedback")) priceComments.push({ replyId: r.replyId, verbatim: r.text });
    }
    const known = new Set(mine.map((r) => r.replyId));
    const themes = cfg
      .themes(listingId)
      .map((t) => ({ theme: t.theme, replyIds: t.replyIds.filter((id) => known.has(id)) }))
      .filter((t) => t.replyIds.length > 0);
    const report = {
      listingId,
      week,
      counts: {
        attendees: people.length,
        followUpsSent: drafts.filter((d) => d.listingId === listingId && sentDrafts.has(d.draftId)).length,
        replies: mine.length,
        byClass,
      },
      priceComments,
      themes,
    };

    const latest = await ports.latestReport(listingId);
    if (latest && JSON.stringify(latest.report) === JSON.stringify(report)) {
      if (!latest.sentToVendor && (await ports.reportApproved(listingId, latest.version))) {
        const res = await ports.sendReport(listingId, latest.version);
        if (res.sent) await ports.record({ kind: "report", ref: `${listingId}#v${latest.version}`, detail: `sent to the vendor; approved by ${cfg.approver}` });
      }
      continue;
    }
    const version = await ports.draftReport(report);
    await ports.record({ kind: "report", ref: `${listingId}#v${version}`, detail: "drafted to the agent for approval" });
  }

  // 9. The optional call. Asked only for someone who ticked call_ok and was
  //    followed up; the gate decides at dial time, and it is off until the agent turns it on.
  for (const d of drafts) {
    if (!sentDrafts.has(d.draftId)) continue;
    const row = rows.find((r) => r.rowId === d.rowId);
    if (!row?.callOk) continue;
    const gate = await ports.callGate(d.rowId);
    if (!gate.allowed) continue;
    const opened = await ports.disclose(
      d.rowId,
      `Hi, this is an AI assistant calling for ${cfg.agency}. You ticked that you were happy to take a call after the open home. This call may be recorded.`,
    );
    if (opened.opened) await ports.say(d.rowId, "Is now a good time for a couple of minutes about the property?");
  }
}

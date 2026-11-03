/**
 * Late Rent Desk: the arrears lane for a small landlord or a self-managing
 * property manager (about 1 to 50 doors), built to AIP-BS-RENT-ARREARS
 * 2026-10-03 (https://aipathway.com.au/explore-ai/rent-arrears-build-standard).
 *
 * One daily run, keeping nothing between runs:
 *
 *   1. List the tenancies from the property system (schedule.tick).
 *   2. Skip any tenancy with an open exception that names a person.
 *   3. Read the ledger by tenancy id and DERIVE the position: paid-to date
 *      first, then days in arrears, then balance. Nothing is cached.
 *   4. Read the dated rule for the tenancy's state. No rule, no action.
 *   5. Triage to exactly one of four outcomes, checking "not in arrears" first.
 *   6. Rank the short list, oldest paid-to date first.
 *   7. Act on each outcome:
 *        statutory_path     draft the notice, hold it, raise it to a person;
 *                           a fee rule's charge is held for a person, never applied
 *        needs_conversation re-read the ledger, evaluate every stop condition,
 *                           and only then release one SMS; file the sent copy
 *                           and read it back from the message log
 *        will_self_resolve  leave it to the platform's own reminder
 *        not_in_arrears     send nothing; if a sequence had started, record
 *                           which stop caught it
 *
 * Every write goes through the ports. Where the build needs to know something
 * the property system holds (an open exception, an arrangement, a pause, a
 * dispute, a release by a named person), it is handed in as `record`, a read of
 * that system by tenancy id. The build never remembers it.
 *
 * What it never does: serve a notice without a named person, apply a fee,
 * promise anything for the landlord, or message outside contact hours.
 */

const DAY = 86_400_000;
const NODE = "late-rent-desk";

/** Contact hours for an SMS or an automated conversation, local time. */
const CONTACT_HOURS = { from: 8, to: 19 };
/** A ledger read older than this is stale: send nothing and raise it. */
const STALE_AFTER_MS = 30 * 60 * 1000;
/** A day or two behind is the platform reminder's job. */
const SELF_RESOLVE_DAYS = 2;
/** The sequence this desk releases before silence becomes the finding. */
const SEQUENCE = [
  "Hi, this is an automated message from your property manager. Our records show rent on your tenancy is paid to {paidTo}. If you have already paid, please ignore this. Reply if anything has changed.",
  "Hi, an automated follow-up from your property manager. Rent is paid to {paidTo}. If something has changed, reply and a person will call you.",
  "Hi, an automated note from your property manager. Rent is still paid to {paidTo}. A person will be in touch to talk it through.",
];

/** Australian state UTC offsets, minutes. QLD has no daylight saving. */
function utcOffsetMinutes(state, at) {
  if (state === "QLD") return 600;
  // NSW and VIC: AEDT from the first Sunday in October to the first Sunday in April.
  const y = at.getUTCFullYear();
  const firstSunday = (month) => {
    const d = new Date(Date.UTC(y, month, 1));
    return new Date(Date.UTC(y, month, 1 + ((7 - d.getUTCDay()) % 7), -8)); // 2am AEST = 16:00Z the day before
  };
  const dstEnds = firstSunday(3);
  const dstStarts = firstSunday(9);
  const inDst = at < dstEnds || at >= dstStarts;
  return inDst ? 660 : 600;
}

function localHour(state, at) {
  const mins = at.getUTCHours() * 60 + at.getUTCMinutes() + utcOffsetMinutes(state, at);
  return (((mins / 60) % 24) + 24) % 24;
}

const inContactHours = (state, at) => {
  const h = localHour(state, at);
  return h >= CONTACT_HOURS.from && h < CONTACT_HOURS.to;
};

const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

/** Derive the position from one ledger snapshot. Never stored. */
function derivePosition(snap, now) {
  const paidTo = new Date(snap.paidToDate);
  const days = Math.max(0, Math.floor((now.getTime() - paidTo.getTime()) / DAY));
  return { paidToDate: snap.paidToDate, daysPastPaidTo: days, balance: snap.balance };
}

/** The four outcomes, checked in the standard's order. */
function triage(pos, rule, flags) {
  if (pos.balance <= 0 || pos.daysPastPaidTo <= 0) return "not_in_arrears";
  if (flags.unmatchedReceipt) return "not_in_arrears"; // a receipt waiting in suspense: flag the ledger, never the tenant
  if (pos.daysPastPaidTo >= rule.thresholdDays) return "statutory_path";
  if (pos.daysPastPaidTo <= SELF_RESOLVE_DAYS && !flags.hardship && !flags.patternBreak) return "will_self_resolve";
  return "needs_conversation";
}

/**
 * Every stop condition in section 4, evaluated against a FRESH read, right
 * before a message. Returns the ones that matched.
 */
function stopCheck(snap, tenancy, rec, now, noticeDrafted) {
  const blocked = [];
  if (snap.failed) blocked.push("ledger_read_failed");
  else if (now.getTime() - new Date(snap.readAt).getTime() > STALE_AFTER_MS) blocked.push("ledger_stale");
  else if (snap.balance <= 0) blocked.push("payment_received");
  if (rec.paymentInTransit) blocked.push("payment_in_transit");
  if (rec.arrangement) blocked.push("payment_arrangement");
  if (tenancy.hardship || rec.hardship) blocked.push("hardship_on_file");
  if (rec.dispute || rec.advocate) blocked.push("dispute_or_advocacy_on_file");
  if (noticeDrafted || rec.formalPath) blocked.push("on_formal_path");
  if (rec.pause && (!rec.pause.until || new Date(rec.pause.until) > now)) blocked.push("paused_by_person");
  return blocked;
}

/**
 * @param {import("@aipathway/conformance").ArrearsPorts} ports
 * @param {{
 *   record?: (tenancyId: string) => object | null,
 *   feeRule?: (entry: object) => number | null,
 *   conversation?: boolean,
 *   owner?: string,
 * }} [config]
 */
export async function build(ports, config = {}) {
  const readRecord = (id) => (config.record ? config.record(id) ?? {} : {});
  const owner = config.owner ?? "the property manager on the tenancy";
  const raise = (id, reason, detail) =>
    ports.escalate(id, `rent.${reason} [owner: ${owner}]${detail ? ` ${detail}` : ""} (${NODE})`);

  const now = ports.now();
  const tenancies = ports.readTenancies();
  const entries = [];
  const work = [];

  for (const t of tenancies) {
    const rec = readRecord(t.id);
    // An open exception with a named owner stops the chain for this record.
    if (rec.openException && rec.openException.owner) continue;

    const snap = ports.readLedger(t.id);
    if (snap.failed) {
      raise(t.id, "ledger_read_failed", "ledger read failed; nothing sent");
      continue;
    }
    if (now.getTime() - new Date(snap.readAt).getTime() > STALE_AFTER_MS) {
      raise(t.id, "ledger_stale", `ledger last read ${snap.readAt}; nothing sent`);
      continue;
    }

    const rule = ports.readRule(t.state);
    if (!rule) {
      raise(t.id, "no_rule_for_state", `no dated rule in force for ${t.state}; nothing sent`);
      continue;
    }

    const pos = derivePosition(snap, now);
    const outcome = triage(pos, rule, { hardship: t.hardship || rec.hardship, unmatchedReceipt: rec.unmatchedReceipt, patternBreak: rec.patternBreak });
    const paidTo = new Date(pos.paidToDate);
    const entry = {
      tenancyId: t.id,
      paidToDate: pos.paidToDate,
      daysPastPaidTo: pos.daysPastPaidTo,
      balance: pos.balance,
      outcome,
      state: t.state,
      ruleVersion: `${rule.state}@${rule.effectiveFrom}`,
      thresholdDays: rule.thresholdDays,
      noticeDays: rule.noticeDays,
      nextLawfulStep: "notice to remedy breach, drafted for a person to serve",
      nextLawfulDate: isoDate(paidTo.getTime() + rule.thresholdDays * DAY),
      derivedAt: now.toISOString(),
    };
    entries.push(entry);
    work.push({ t, rec, entry });
  }

  // The short list, oldest paid-to date first: the clock runs on days, not dollars.
  entries.sort((a, b) => b.daysPastPaidTo - a.daysPastPaidTo || a.tenancyId.localeCompare(b.tenancyId));
  ports.rank(entries);

  for (const { t, rec, entry } of work) {
    const sentSoFar = ports.messagesFor(t.id);

    if (entry.outcome === "not_in_arrears") {
      if (rec.unmatchedReceipt) raise(t.id, "unmatched_receipt", "a receipt sits unmatched; ledger flagged, tenant not messaged");
      else if (sentSoFar.length > 0) raise(t.id, "payment_received", "stop:payment_received; sequence ended");
      continue;
    }

    if (entry.outcome === "will_self_resolve") continue; // the platform reminder is enough

    if (entry.outcome === "statutory_path") {
      // One channel at a time: once on the formal path, no chase.
      ports.prepareNotice(t.id);
      if (rec.release && rec.release.person) {
        ports.releaseNotice(t.id, rec.release.person);
      } else {
        raise(t.id, "notice_drafted_awaiting_release", `next lawful date ${entry.nextLawfulDate} under ${entry.ruleVersion}`);
      }
      const cents = config.feeRule ? config.feeRule(entry) : null;
      if (cents) {
        // Never applied at machine speed: offered without a person, so it is held.
        ports.applyFee({ tenancyId: t.id, cents });
        raise(t.id, "fee_held_for_person", `a fee rule proposed ${cents} cents; held, not applied`);
      }
      continue;
    }

    // needs_conversation
    if (sentSoFar.length >= SEQUENCE.length) {
      raise(t.id, "sequence_unanswered", `${sentSoFar.length} messages, no change; silence is the finding`);
      continue;
    }
    if (!inContactHours(t.state, ports.now())) continue; // next run, inside hours

    if (config.conversation) {
      // The stop conditions before the conversation opens, too.
      const fresh = ports.readLedger(t.id);
      const blocked = stopCheck(fresh, t, rec, ports.now(), false);
      if (blocked.length) {
        raise(t.id, blocked[0], `stop:${blocked.join(",")} checked ${ports.now().toISOString()}; nothing opened`);
        continue;
      }
      const opened = ports.disclose(t.id, "This is an automated assistant calling for your property manager. The call is recorded.");
      if (!opened.opened) continue;
      // What the tenant said lands on the tenancy record; re-read it by id.
      const said = ports.readTenancies().find((x) => x.id === t.id);
      const recNow = readRecord(t.id);
      if ((said && said.hardship) || recNow.hardship) {
        raise(t.id, "hardship_stated", "tenant stated hardship in the conversation; stopped and routed to a person");
        continue;
      }
    }

    // Every stop condition, against a fresh read, immediately before this message.
    const last = ports.readLedger(t.id);
    const blockedLast = stopCheck(last, t, readRecord(t.id), ports.now(), false);
    if (blockedLast.length) {
      raise(t.id, blockedLast[0], `stop:${blockedLast.join(",")} checked ${ports.now().toISOString()}; nothing sent`);
      continue;
    }
    const body = SEQUENCE[sentSoFar.length].replace("{paidTo}", isoDate(last.paidToDate));
    const res = ports.sendMessage({ tenancyId: t.id, body, snapshot: last });
    if (!res.sent) {
      raise(t.id, "send_refused", res.why ?? "refused");
      continue;
    }
    // evidence.filed: the sent copy counts only when it reads back from the message log.
    const after = ports.messagesFor(t.id);
    if (after.length !== sentSoFar.length + 1 || after[after.length - 1].body !== body) {
      raise(t.id, "message_not_filed", "the sent copy did not read back from the message log");
    }
  }
}

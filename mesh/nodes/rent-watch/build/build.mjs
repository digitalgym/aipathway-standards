/**
 * Rent Watch: the rent arrears job, built to AIP-BS-RENT-ARREARS 2026-10-03.
 * https://aipathway.com.au/explore-ai/rent-arrears-build-standard
 *
 * A port of "Landlord Ledger" by Daniel Masarsky, reimplemented from the
 * standard. Only the arrears job is ported. Nothing here is taken from the
 * original bot's prompt or instructions.
 *
 * What one run does, every time it is woken (schedule.tick, or rent.overdue /
 * exception.closed for one tenancy_id):
 *
 *   1. Read the rent roll, then each tenancy's ledger, fresh. Nothing is cached.
 *   2. Derive the position: paid-to date first, then days in arrears, then balance.
 *   3. Read the dated rule for the tenancy's state. No rule, no action.
 *   4. Triage to exactly one outcome, checking "not actually in arrears" first.
 *   5. Rank the short list (needs a conversation, statutory path) by paid-to date.
 *   6. For each chase, re-read the ledger and evaluate every stop condition
 *      immediately before the message. Any stop: nothing sends, a person is named.
 *   7. Past the threshold: draft the notice and hold it. Never serve it.
 *   8. A fee the landlord's rule would attach is held for a named person, never applied.
 *
 * Every effect goes through the ports. The position is never stored; the step
 * in the chase sequence is read back from the message record each run.
 */

const DAY = 86_400_000;

/** A ledger read older than this is stale: send nothing, raise it. */
export const FRESH_MS = 30 * 60 * 1000;

/** Up to two days behind on a consistent payer: the platform reminder is enough. */
export const SELF_RESOLVE_DAYS = 2;

/** Where each state's clock is read. A tenancy may override with its own timezone. */
const ZONE = { QLD: "Australia/Brisbane", NSW: "Australia/Sydney", VIC: "Australia/Melbourne" };

/** The chase, one message per run, one channel. Each one is re-gated before it goes. */
export const DEFAULT_SEQUENCE = [
  (t, p) =>
    `Hi, this is an automated message from your property manager about the rent for ${t.id}. ` +
    `Our ledger shows rent paid to ${p.paidTo.slice(0, 10)}. If you have paid since, please ignore this. ` +
    `If something has changed, reply and a person will call you.`,
  (t, p) =>
    `Automated reminder for ${t.id}: rent is paid to ${p.paidTo.slice(0, 10)}. ` +
    `If you are having trouble paying, reply and a person from the office will contact you. Nothing else is needed from you today.`,
  (t, p) =>
    `Automated message for ${t.id}: rent is still showing paid to ${p.paidTo.slice(0, 10)}. ` +
    `A property manager will be in touch. Reply any time if you have paid or need to talk.`,
];

/** Statements that end an automated conversation and hand it to a person. */
const STOP_STATEMENTS = [
  { reason: "hardship_stated", re: /\b(hardship|lost (my|our) job|can'?t afford|cannot afford|struggling|no income|centrelink|hospital|sick|family violence|domestic violence)\b/i },
  { reason: "advocacy_on_file", re: /\b(advocate|financial counsell?or|tenants'? union|lawyer|legal aid)\b/i },
  { reason: "dispute_raised", re: /\b(dispute|not my rent|wrong amount|that'?s wrong|split it with)\b/i },
  { reason: "payment_claimed", re: /\b(i (have )?paid|already paid|paid (it )?(yesterday|today|this morning))\b/i },
  { reason: "proposal_captured", re: /\b(can i pay|pay (you )?(\$|on|by|next)|payment plan|arrangement)\b/i },
  { reason: "opt_out", re: /\b(stop|unsubscribe|don'?t (contact|call|text) me)\b/i },
];

const toTime = (d) => new Date(d).getTime();

function localHour(now, tenancy) {
  const zone = tenancy.timezone ?? ZONE[tenancy.state] ?? "Australia/Brisbane";
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  return h + m / 60;
}

function withinHours(now, tenancy, hours) {
  const h = localHour(now, tenancy);
  return h >= hours.from && h < hours.to;
}

/** The position, derived from one ledger snapshot. Never stored. */
export function derivePosition(snapshot, now) {
  const paidTo = snapshot.paidToDate;
  const days = Math.max(0, Math.floor((toTime(now) - toTime(paidTo)) / DAY));
  return { paidTo, daysInArrears: days, balance: snapshot.balance, derivedAt: now.toISOString() };
}

/** Why this snapshot cannot be acted on, or null. */
function ledgerProblem(snapshot, now) {
  if (snapshot.failed) return "ledger_read_failed";
  if (!snapshot.paidToDate) return "ledger_unverified";
  if (toTime(now) - toTime(snapshot.readAt) > FRESH_MS) return "ledger_stale";
  return null;
}

/**
 * Exactly one outcome per tenancy, in the standard's order. `not_in_arrears`
 * is checked first, because chasing someone who paid is the worst failure.
 */
export function triage(tenancy, position, rule) {
  if (position.balance <= 0) return { outcome: "not_in_arrears", evidence: "ledger balance is zero" };
  if (position.daysInArrears >= rule.thresholdDays)
    return { outcome: "statutory_path", evidence: `${position.daysInArrears} days past paid-to, ${tenancy.state} threshold ${rule.thresholdDays} (rule from ${rule.effectiveFrom})` };
  if (position.daysInArrears <= SELF_RESOLVE_DAYS)
    return { outcome: "will_self_resolve", evidence: `${position.daysInArrears} day(s) past paid-to; the platform reminder is enough` };
  return { outcome: "needs_conversation", evidence: `${position.daysInArrears} days past paid-to, balance ${position.balance} cents` };
}

/** The statutory clock for one tenancy, from its dated rule. */
function statutoryClock(tenancy, position, rule) {
  return {
    jurisdiction: tenancy.state,
    rule_version: `${tenancy.state}@${rule.effectiveFrom}`,
    threshold_days: rule.thresholdDays,
    notice_days: rule.noticeDays,
    next_lawful_step: "notice drafted for a named person to serve",
    next_lawful_date: new Date(toTime(position.paidTo) + rule.thresholdDays * DAY).toISOString().slice(0, 10),
  };
}

/**
 * The stop conditions, evaluated immediately before a message. Returns every
 * one that matched; an empty list means the message may go.
 */
async function stopCheck(ports, tenancy, config) {
  const now = ports.now();
  const snapshot = await ports.readLedger(tenancy.id); // verify the ledger before EVERY message
  const blocked = [];
  const problem = ledgerProblem(snapshot, now);
  if (problem) blocked.push(problem);
  else if (snapshot.balance <= 0) blocked.push("payment_received");
  if (tenancy.hardship) blocked.push("hardship_on_file");
  const hold = config.exceptions?.(tenancy.id);
  if (hold) blocked.push(`exception_open:${hold.owner}`); // a person has paused it, or an exception is open
  if (config.arrangements?.(tenancy.id)) blocked.push("payment_arrangement");
  if (!withinHours(now, tenancy, config.callingHours)) blocked.push("outside_permitted_hours");
  return { snapshot, stop: { tenancy_ref: tenancy.id, blocked_by: blocked, checked_at: now.toISOString() } };
}

const defaults = (config) => ({
  sequence: DEFAULT_SEQUENCE,
  callingHours: { from: 8, to: 19 },
  feeRules: [],
  ...config,
});

/**
 * One run. `config.tenancyId` scopes it to one tenancy (a rent.overdue or
 * exception.closed wake); without it, the whole rent roll (schedule.tick).
 *
 * @param {import("@aipathway/conformance").ArrearsPorts} ports
 */
export async function build(ports, config = {}) {
  const cfg = defaults(config);
  const now = ports.now();
  const roll = (await ports.readTenancies()).filter((t) => !cfg.tenancyId || t.id === cfg.tenancyId);

  const shortList = [];
  const chases = [];

  for (const tenancy of roll) {
    const snapshot = await ports.readLedger(tenancy.id);
    const problem = ledgerProblem(snapshot, now);
    if (problem) {
      // Unmatched, failed or stale: never chased, always raised.
      await ports.escalate(tenancy.id, `${problem}: ledger last read ${snapshot.readAt}; nothing sent`);
      continue;
    }
    const position = derivePosition(snapshot, now);
    const priorMessages = await ports.messagesFor(tenancy.id);

    if (position.balance <= 0) {
      // Outcome 1. If a chase was running, the record says which stop caught it.
      if (priorMessages.length > 0) await ports.escalate(tenancy.id, `stop:payment_received after ${priorMessages.length} message(s); chase ended, nothing more sent`);
      continue;
    }

    const rule = await ports.readRule(tenancy.state);
    if (!rule) {
      await ports.escalate(tenancy.id, `no_rule_for_state: no dated rule in force for ${tenancy.state}; nothing sent`);
      continue;
    }

    const decision = triage(tenancy, position, rule);
    if (decision.outcome === "will_self_resolve") continue;

    const clock = statutoryClock(tenancy, position, rule);
    shortList.push({
      tenancyId: tenancy.id,
      paidToDate: position.paidTo,
      daysPastPaidTo: position.daysInArrears,
      balance: position.balance,
      outcome: decision.outcome,
      evidence: decision.evidence,
      ruleVersion: clock.rule_version,
      nextLawfulDate: clock.next_lawful_date,
      derivedAt: position.derivedAt,
    });

    // A fee the landlord's rule would attach: held for a named person, never applied here.
    for (const fee of cfg.feeRules) {
      if (position.daysInArrears >= fee.afterDays) {
        await ports.applyFee({ tenancyId: tenancy.id, cents: fee.cents });
        await ports.escalate(tenancy.id, `fee_held_for_person: ${fee.source ?? "fee rule"} would charge ${fee.cents} cents; needs a named person`);
      }
    }

    if (decision.outcome === "statutory_path") {
      await ports.prepareNotice(tenancy.id);
      await ports.escalate(tenancy.id, `notice_drafted_awaiting_release: ${clock.rule_version}, ${clock.notice_days} days notice; a named person serves it`);
      continue;
    }
    chases.push({ tenancy, priorMessages, position });
  }

  // The short list, ranked by paid-to date (days past it), never by balance.
  shortList.sort((a, b) => b.daysPastPaidTo - a.daysPastPaidTo);
  await ports.rank(shortList);

  for (const { tenancy, priorMessages } of chases) {
    const step = priorMessages.length; // read back from the record, not remembered
    if (tenancy.hardship) {
      await ports.escalate(tenancy.id, "stop:hardship_on_file; nothing sent");
      continue;
    }
    if (step >= cfg.sequence.length) {
      await ports.escalate(tenancy.id, `sequence_unanswered: ${step} message(s) and no change; silence is a finding`);
      continue;
    }
    const { snapshot, stop } = await stopCheck(ports, tenancy, cfg);
    if (stop.blocked_by.length > 0) {
      if (!stop.blocked_by.every((b) => b.startsWith("exception_open:") || b === "outside_permitted_hours"))
        await ports.escalate(tenancy.id, `stop:${stop.blocked_by.join(",")} at ${stop.checked_at}; nothing sent`);
      continue;
    }
    const body = cfg.sequence[step](tenancy, derivePosition(snapshot, ports.now()));
    const res = await ports.sendMessage({ tenancyId: tenancy.id, body, snapshot });
    if (!res.sent) await ports.escalate(tenancy.id, `send_refused: ${res.why}`);
  }

  return shortList;
}

/**
 * An automated conversation with one tenant. Opens only inside permitted
 * hours, discloses that it is automated first, and ends on any statement that
 * is a stop condition, handing to a person. It never negotiates: a proposal is
 * captured and passed on, not agreed.
 *
 * The live conversation is the hosted step (Office Voice / Recover); this is
 * the gate around it, so the same rules hold whoever does the talking.
 */
export async function converse(ports, tenancyId, replies = [], config = {}) {
  const cfg = defaults(config);
  const tenancy = (await ports.readTenancies()).find((t) => t.id === tenancyId);
  if (!tenancy) return { opened: false, why: "unknown tenancy" };
  if (!withinHours(ports.now(), tenancy, cfg.callingHours)) return { opened: false, why: "outside_permitted_hours" };

  const opened = await ports.disclose(
    tenancyId,
    "This is an automated assistant calling for your property manager about rent. You can ask for a person at any time.",
  );
  if (!opened.opened) return { opened: false, why: opened.why };

  for (const reply of replies) {
    const hit = STOP_STATEMENTS.find((s) => s.re.test(reply));
    if (hit) {
      await ports.escalate(tenancyId, `stop:${hit.reason} during conversation: "${reply}"; handed to a person`);
      return { opened: true, stopped: hit.reason };
    }
    const { snapshot, stop } = await stopCheck(ports, tenancy, cfg);
    if (stop.blocked_by.length > 0) {
      await ports.escalate(tenancyId, `stop:${stop.blocked_by.join(",")} during conversation; handed to a person`);
      return { opened: true, stopped: stop.blocked_by[0] };
    }
    await ports.sendMessage({
      tenancyId,
      body: `Thanks. Our ledger shows rent paid to ${snapshot.paidToDate.slice(0, 10)}. A person from the office will follow up with you.`,
      snapshot,
    });
  }
  return { opened: true };
}

/** Serve a drafted notice. Only ever on a named person's release. */
export async function releaseNotice(ports, tenancyId, person) {
  if (!person || !String(person).trim()) return { issued: false, why: "a notice is served only on a named person's release" };
  return { issued: await ports.releaseNotice(tenancyId, person) };
}

/** What was sent to whom and when, read back from the message store. */
export async function sentLog(ports, tenancyId) {
  return (await ports.messagesFor(tenancyId)).map((m) => ({ to: m.tenancyId, at: m.at, channel: m.channel, body: m.body }));
}

// The runner hands scenarios the build function; the other entry points ride on it.
build.converse = converse;
build.releaseNotice = releaseNotice;
build.sentLog = sentLog;

/**
 * Notice Check: rent arrears built to AIP-BS-RENT-ARREARS 2026-10-03, with the
 * statutory clock as the step it is built around.
 * https://aipathway.com.au/explore-ai/rent-arrears-build-standard
 *
 * The job, in the property manager's words: before any breach notice for rent
 * goes near a tenant, check it against the ledger and the state's dated rule,
 * so the dates on it are right and nobody is served a notice they do not owe.
 * Around that sits the rest of the standard: derive the position, triage, chase
 * only the short list with stops checked before every message.
 *
 * Australian rules: Queensland, New South Wales and Victoria, each a dated rule
 * read from the rule store, never a constant here. The notice is drafted and
 * held. Serving it, and choosing the service method, stays with a named person.
 *
 * One run, each time it is woken (schedule.tick, or rent.overdue /
 * exception.closed for one tenancy_id):
 *
 *   1. Read the rent roll, then each tenancy's ledger, fresh.
 *   2. Derive paid-to date, days past it, then balance. Nothing is stored.
 *   3. Read the rule in force for the tenancy's state. No rule: raise it, stop.
 *   4. Triage to one outcome, "not actually in arrears" first.
 *   5. Statutory path: run the notice check. It passes, the notice is drafted
 *      and held for a named person with its dates on the exception. It fails,
 *      nothing is drafted and the reason is raised.
 *   6. Needs a conversation: re-read the ledger and check every stop condition
 *      immediately before each message, one message per run.
 *   7. A fee a landlord's rule would add is held for a named person.
 *   8. Publish the short list, ranked by days past paid-to, never by balance.
 *
 * On release, the notice is checked again against a fresh ledger read and the
 * rule in force that day, because a tenant may have paid between the draft and
 * the person picking it up.
 */

const DAY = 86_400_000;

/** A ledger read older than this cannot be acted on. */
export const FRESH_MS = 30 * 60 * 1000;

/** A day or two late on a regular payer: the platform's own reminder covers it. */
export const PLATFORM_REMINDER_DAYS = 2;

const ZONES = { QLD: "Australia/Brisbane", NSW: "Australia/Sydney", VIC: "Australia/Melbourne" };

/** The notice each state's rule leads to. Named for the person who serves it. */
const NOTICE_NAME = {
  QLD: "notice to remedy breach (Form 11)",
  NSW: "termination notice for rent arrears",
  VIC: "notice to vacate for rent arrears",
};

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (d) => new Date(d).getTime();

export const MESSAGES = [
  (id, paidTo) =>
    `Hi, this is an automated message from your property manager about rent on ${id}. ` +
    `Our records show rent paid up to ${paidTo}. If you have paid since then, please disregard this. ` +
    `If something has changed for you, reply and someone from the office will call.`,
  (id, paidTo) =>
    `Automated reminder about rent on ${id}: paid up to ${paidTo} on our records. ` +
    `If paying is difficult right now, reply and a person will get in touch.`,
  (id, paidTo) =>
    `Automated message about rent on ${id}: our records still show paid up to ${paidTo}. ` +
    `Your property manager will contact you. Reply any time if you have paid or want to talk.`,
];

/** Things a tenant says that end the automated part and go to a person. */
const HAND_TO_PERSON = [
  ["hardship_stated", /\b(hardship|lost (my|our) job|can'?t afford|cannot afford|struggling|no income|centrelink|in hospital|domestic violence|family violence)\b/i],
  ["advocate_involved", /\b(advocate|financial counsell?or|tenants? (union|advice)|legal aid|lawyer)\b/i],
  ["dispute_raised", /\b(dispute|not my rent|wrong amount|split (it|the rent) with)\b/i],
  ["payment_claimed", /\b(already paid|i (have )?paid|paid (it )?(yesterday|today|this morning))\b/i],
  ["proposal_to_pass_on", /\b(payment plan|arrangement|can i pay)\b/i],
  ["asked_to_stop", /\b(stop (texting|calling|messaging)|don'?t (contact|call|text) me|unsubscribe)\b/i],
];

function hourIn(now, tenancy) {
  const zone = tenancy.timezone ?? ZONES[tenancy.state] ?? "Australia/Brisbane";
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour").value) + Number(parts.find((p) => p.type === "minute").value) / 60;
}

const inHours = (now, tenancy, hours) => {
  const h = hourIn(now, tenancy);
  return h >= hours.from && h < hours.to;
};

/** Why a snapshot cannot be acted on, or null. */
function unusable(snapshot, now) {
  if (snapshot.failed) return "ledger_read_failed";
  if (!snapshot.paidToDate) return "ledger_unverified";
  if (ms(now) - ms(snapshot.readAt) > FRESH_MS) return "ledger_stale";
  return null;
}

/** The position, from one snapshot. Paid-to first. */
export function position(snapshot, now) {
  return {
    paidTo: snapshot.paidToDate,
    daysPast: Math.max(0, Math.floor((ms(now) - ms(snapshot.paidToDate)) / DAY)),
    balance: snapshot.balance,
    derivedAt: now.toISOString(),
  };
}

export function triage(pos, rule) {
  if (pos.balance <= 0) return "not_in_arrears";
  if (pos.daysPast >= rule.thresholdDays) return "statutory_path";
  if (pos.daysPast <= PLATFORM_REMINDER_DAYS) return "will_self_resolve";
  return "needs_conversation";
}

/**
 * The notice check. Given a fresh position and the rule in force, either the
 * dates a notice would carry, or the reasons no notice may be drafted.
 */
export function checkNotice(tenancy, pos, rule, now) {
  const problems = [];
  if (!rule) problems.push(`no dated rule in force for ${tenancy.state}`);
  if (pos.balance <= 0) problems.push("ledger shows nothing owing");
  if (rule && pos.daysPast < rule.thresholdDays)
    problems.push(`${pos.daysPast} days past paid-to is short of the ${tenancy.state} threshold of ${rule.thresholdDays}`);
  if (problems.length > 0 || !rule) return { ok: false, problems };
  return {
    ok: true,
    notice: {
      kind: NOTICE_NAME[tenancy.state] ?? "breach notice for rent",
      jurisdiction: tenancy.state,
      rule_version: `${tenancy.state}@${rule.effectiveFrom}`,
      paid_to: ymd(ms(pos.paidTo)),
      days_past_paid_to: pos.daysPast,
      balance_cents: pos.balance,
      threshold_met_on: ymd(ms(pos.paidTo) + rule.thresholdDays * DAY),
      notice_days: rule.noticeDays,
      // The earliest remedy date counted from today. The service method adds
      // to it and is the serving person's call, so it is shown, not decided.
      remedy_by_earliest: ymd(ms(now) + rule.noticeDays * DAY),
    },
  };
}

/** Every stop condition, immediately before one message. */
async function stops(ports, tenancy, cfg) {
  const now = ports.now();
  const snapshot = await ports.readLedger(tenancy.id);
  const blocked = [];
  const bad = unusable(snapshot, now);
  if (bad) blocked.push(bad);
  else if (snapshot.balance <= 0) blocked.push("payment_received");
  if (tenancy.hardship) blocked.push("hardship_on_file");
  if (cfg.arrangements?.(tenancy.id)) blocked.push("arrangement_in_place");
  if (cfg.formalPath?.(tenancy.id)) blocked.push("on_formal_path");
  const open = cfg.exceptions?.(tenancy.id);
  if (open) blocked.push(`exception_open:${open.owner}`);
  if (!inHours(now, tenancy, cfg.callingHours)) blocked.push("outside_permitted_hours");
  return { snapshot, blocked, checkedAt: now.toISOString() };
}

const settings = (config) => ({ messages: MESSAGES, callingHours: { from: 8, to: 19 }, feeRules: [], ...config });

/**
 * @param {import("@aipathway/conformance").ArrearsPorts} ports
 */
export async function build(ports, config = {}) {
  const cfg = settings(config);
  const now = ports.now();
  const roll = (await ports.readTenancies()).filter((t) => !cfg.tenancyId || t.id === cfg.tenancyId);
  const list = [];
  const toChase = [];

  for (const tenancy of roll) {
    const snapshot = await ports.readLedger(tenancy.id);
    const bad = unusable(snapshot, now);
    if (bad) {
      await ports.escalate(tenancy.id, `${bad}: ledger read at ${snapshot.readAt}; nothing sent, no notice checked`);
      continue;
    }
    const pos = position(snapshot, now);
    const sentBefore = await ports.messagesFor(tenancy.id);

    if (pos.balance <= 0) {
      if (sentBefore.length > 0)
        await ports.escalate(tenancy.id, `stop:payment_received after ${sentBefore.length} message(s); no more will send`);
      continue;
    }

    const rule = await ports.readRule(tenancy.state);
    if (!rule) {
      await ports.escalate(tenancy.id, `no_rule_for_state: nothing in force for ${tenancy.state}; nothing sent, no notice drafted`);
      continue;
    }

    const outcome = triage(pos, rule);
    if (outcome === "will_self_resolve") continue;

    const check = checkNotice(tenancy, pos, rule, now);
    list.push({
      tenancyId: tenancy.id,
      paidToDate: pos.paidTo,
      daysPastPaidTo: pos.daysPast,
      balance: pos.balance,
      outcome,
      ruleVersion: `${tenancy.state}@${rule.effectiveFrom}`,
      nextLawfulDate: ymd(ms(pos.paidTo) + rule.thresholdDays * DAY),
      derivedAt: pos.derivedAt,
    });

    for (const fee of cfg.feeRules) {
      if (pos.daysPast >= fee.afterDays) {
        await ports.applyFee({ tenancyId: tenancy.id, cents: fee.cents });
        await ports.escalate(tenancy.id, `fee_held_for_person: ${fee.source ?? "a fee rule"} would add ${fee.cents} cents; a named person decides`);
      }
    }

    if (outcome === "statutory_path") {
      if (!check.ok) {
        await ports.escalate(tenancy.id, `notice_check_failed: ${check.problems.join("; ")}; nothing drafted`);
        continue;
      }
      const n = check.notice;
      await ports.prepareNotice(tenancy.id);
      await ports.escalate(
        tenancy.id,
        `notice_drafted_awaiting_release: ${n.kind}, ${n.rule_version}, paid to ${n.paid_to}, ${n.days_past_paid_to} days past, ` +
          `threshold met ${n.threshold_met_on}, ${n.notice_days} days to remedy, remedy by ${n.remedy_by_earliest} at the earliest; a named person serves it`,
      );
      continue;
    }
    toChase.push({ tenancy, step: sentBefore.length });
  }

  list.sort((a, b) => b.daysPastPaidTo - a.daysPastPaidTo);
  await ports.rank(list);

  for (const { tenancy, step } of toChase) {
    if (tenancy.hardship) {
      await ports.escalate(tenancy.id, "stop:hardship_on_file; nothing sent");
      continue;
    }
    if (step >= cfg.messages.length) {
      await ports.escalate(tenancy.id, `sequence_unanswered: ${step} message(s), no payment, no reply; a person calls`);
      continue;
    }
    const { snapshot, blocked, checkedAt } = await stops(ports, tenancy, cfg);
    if (blocked.length > 0) {
      const quiet = blocked.every((b) => b.startsWith("exception_open:") || b === "outside_permitted_hours");
      if (!quiet) await ports.escalate(tenancy.id, `stop:${blocked.join(",")} at ${checkedAt}; nothing sent`);
      continue;
    }
    const body = cfg.messages[step](tenancy.id, ymd(ms(snapshot.paidToDate)));
    const res = await ports.sendMessage({ tenancyId: tenancy.id, body, snapshot });
    if (!res.sent) await ports.escalate(tenancy.id, `send_refused: ${res.why}`);
  }

  return list;
}

/**
 * Release a drafted notice. Only with a named person, and only if the notice
 * still checks out against a fresh ledger read and the rule in force today.
 */
export async function releaseNotice(ports, tenancyId, person) {
  if (!person || !String(person).trim()) return { issued: false, why: "a notice is released only by a named person" };
  const tenancy = (await ports.readTenancies()).find((t) => t.id === tenancyId);
  if (!tenancy) return { issued: false, why: "unknown tenancy" };
  const now = ports.now();
  const snapshot = await ports.readLedger(tenancyId);
  const bad = unusable(snapshot, now);
  if (bad) {
    await ports.escalate(tenancyId, `notice_check_failed at release: ${bad}; not released`);
    return { issued: false, why: bad };
  }
  const rule = await ports.readRule(tenancy.state);
  const check = checkNotice(tenancy, position(snapshot, now), rule, now);
  if (!check.ok) {
    await ports.escalate(tenancyId, `notice_check_failed at release by ${person}: ${check.problems.join("; ")}; not released`);
    return { issued: false, why: check.problems.join("; ") };
  }
  return { issued: await ports.releaseNotice(tenancyId, person), notice: check.notice };
}

/**
 * The automated conversation's gate. Opens only in permitted hours, says it is
 * automated first, and ends on anything that is a stop. It never agrees a plan.
 * The live conversation is the hosted step; this is the rule around it.
 */
export async function converse(ports, tenancyId, replies = [], config = {}) {
  const cfg = settings(config);
  const tenancy = (await ports.readTenancies()).find((t) => t.id === tenancyId);
  if (!tenancy) return { opened: false, why: "unknown tenancy" };
  if (!inHours(ports.now(), tenancy, cfg.callingHours)) return { opened: false, why: "outside_permitted_hours" };
  const d = await ports.disclose(tenancyId, "This is an automated assistant for your property manager, about rent. You can ask for a person at any time.");
  if (!d.opened) return { opened: false, why: d.why };

  for (const reply of replies) {
    const hit = HAND_TO_PERSON.find(([, re]) => re.test(reply));
    if (hit) {
      await ports.escalate(tenancyId, `stop:${hit[0]} in conversation ("${reply}"); handed to a person`);
      return { opened: true, stopped: hit[0] };
    }
    const { snapshot, blocked } = await stops(ports, tenancy, cfg);
    if (blocked.length > 0) {
      await ports.escalate(tenancyId, `stop:${blocked.join(",")} in conversation; handed to a person`);
      return { opened: true, stopped: blocked[0] };
    }
    await ports.sendMessage({ tenancyId, body: `Thanks. Our records show rent paid up to ${ymd(ms(snapshot.paidToDate))}. Someone from the office will follow up.`, snapshot });
  }
  return { opened: true };
}

/** What was sent, to whom and when, read back from the message store. */
export async function sentLog(ports, tenancyId) {
  return (await ports.messagesFor(tenancyId)).map((m) => ({ to: m.tenancyId, at: m.at, channel: m.channel, body: m.body }));
}

build.releaseNotice = releaseNotice;
build.converse = converse;
build.sentLog = sentLog;

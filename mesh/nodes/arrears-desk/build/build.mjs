/**
 * Arrears Desk: the daily late-rent desk, built to AIP-BS-RENT-ARREARS 2026-10-03.
 * https://aipathway.com.au/explore-ai/rent-arrears-build-standard
 *
 * Once a day (schedule.tick), or when the property system says rent fell
 * behind (rent.overdue), it works each tenancy by its tenancy_id:
 *
 *   1. An exception open on the tenancy with a named owner: do nothing.
 *   2. Read the ledger by id. A failed or stale read escalates, never chases.
 *   3. Derive the position: paid-to date first, days past it, then the exact
 *      balance. Nothing is cached between runs.
 *   4. Triage to one of the four outcomes, against the dated rule for the
 *      tenancy's state.
 *   5. For a tenancy that needs chasing, re-read the ledger and run every stop
 *      condition immediately before the one message it sends today. The message
 *      states the paid-to date and the exact balance from that fresh read.
 *   6. Past the threshold: the notice is drafted and held for a named person.
 *      A fee rule is held for a person. Neither happens on its own.
 *   7. Write the day's short list (rank), paid-to date beside every balance.
 *
 * Everything goes through the ports. Nothing here talks to a network.
 */

const DAY = 86_400_000;

const DEFAULTS = {
  /** How old a ledger read may be before the desk refuses to act on it. */
  maxLedgerAgeMs: 30 * 60 * 1000,
  /** Messages in a sequence before silence becomes the finding. */
  sequenceLength: 3,
  /** At most one message per tenancy per this many ms. */
  minGapMs: 20 * 60 * 60 * 1000,
  /** Days past paid-to that the platform's own reminder covers. */
  selfResolveDays: 1,
  /** Permitted contact window, local hours. */
  contactHours: { from: 8, to: 19 },
  owner: "the property manager on the tenancy",
  exceptions: () => null,
  feeRules: [],
};

const TZ = { QLD: "Australia/Brisbane", NSW: "Australia/Sydney", VIC: "Australia/Melbourne" };

const HARDSHIP_RE =
  /\b(hardship|lost my job|lost (?:my )?work|can(?:no|')t afford|cannot afford|advocate|support worker|financial counsell?or|domestic violence|in hospital)\b/i;

function localHour(date, state) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ[state] ?? "Australia/Brisbane",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

function localDate(iso, state) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ[state] ?? "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

const dollars = (cents) => `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** A read the desk will act on: it succeeded and it is fresh. */
function usable(snap, now, cfg) {
  if (!snap || snap.failed) return { ok: false, reason: "rent.ledger_read_failed" };
  const age = now.getTime() - new Date(snap.readAt).getTime();
  if (!Number.isFinite(age) || age > cfg.maxLedgerAgeMs) return { ok: false, reason: "rent.ledger_stale" };
  return { ok: true };
}

/** Days past the paid-to date, derived from the read and the clock. Never stored. */
function daysPast(snap, now) {
  return Math.max(0, Math.floor((now.getTime() - new Date(snap.paidToDate).getTime()) / DAY));
}

function raise(ports, tenancyId, reason, cfg, detail) {
  ports.escalate(tenancyId, `${reason}; exception_owner=${cfg.owner}${detail ? `; ${detail}` : ""}`);
}

/**
 * The stop conditions, evaluated before every single message. Returns the ones
 * that matched; any one of them means nothing sends.
 */
function stopCheck(tenancy, snap, now, cfg, prior) {
  const blockedBy = [];
  const read = usable(snap, now, cfg);
  if (!read.ok) blockedBy.push(read.reason);
  else if (snap.balance <= 0) blockedBy.push("rent.payment_received");
  if (tenancy.hardship) blockedBy.push("rent.hardship_on_file");
  if (tenancy.arrangement) blockedBy.push("rent.arrangement_in_place");
  if (tenancy.paused) blockedBy.push("rent.paused_by_person");
  if (tenancy.onFormalPath) blockedBy.push("rent.on_formal_path");
  const h = localHour(now, tenancy.state);
  if (h < cfg.contactHours.from || h >= cfg.contactHours.to) blockedBy.push("outside_contact_hours");
  if (prior.length > 0 && now.getTime() - new Date(prior[prior.length - 1].at).getTime() < cfg.minGapMs) {
    blockedBy.push("already_contacted_today");
  }
  return blockedBy;
}

async function dailyRun(ports, cfg) {
  const now = ports.now();
  const list = [];

  for (const t of await ports.readTenancies()) {
    // An open exception with a named owner stops the chain on this record.
    if (cfg.exceptions(t.id)) continue;

    const snap = await ports.readLedger(t.id);
    const read = usable(snap, now, cfg);
    if (!read.ok) {
      raise(ports, t.id, read.reason, cfg, "nothing sent");
      continue;
    }

    const prior = await ports.messagesFor(t.id);

    // Outcome 1 first: not actually in arrears. Never message.
    if (snap.balance <= 0) {
      if (prior.length > 0) raise(ports, t.id, "rent.payment_received", cfg, "chase stopped; ledger shows the tenancy square");
      continue;
    }

    const rule = await ports.readRule(t.state);
    if (!rule) {
      raise(ports, t.id, "rent.no_rule_for_state", cfg, `no dated rule in force for ${t.state}`);
      continue;
    }

    const days = daysPast(snap, now);
    const nextLawfulDate = new Date(new Date(snap.paidToDate).getTime() + rule.thresholdDays * DAY).toISOString().slice(0, 10);

    let outcome;
    if (days >= rule.thresholdDays) outcome = "statutory_path";
    else if (days <= cfg.selfResolveDays && prior.length === 0) outcome = "will_self_resolve";
    else outcome = "needs_conversation";

    list.push({
      tenancyId: t.id,
      paidToDate: snap.paidToDate,
      daysPastPaidTo: days,
      balance: snap.balance,
      outcome,
      rule: `${rule.state} from ${rule.effectiveFrom.slice(0, 10)}`,
      nextLawfulDate,
    });

    // A fee rule never writes on its own: it becomes a held item for a person.
    for (const fee of cfg.feeRules) {
      if (days >= fee.afterDays) {
        const applied = await ports.applyFee({ tenancyId: t.id, cents: fee.cents });
        if (!applied) raise(ports, t.id, "rent.fee_held_for_person", cfg, `${dollars(fee.cents)} from ${fee.source ?? "a fee rule"}`);
      }
    }

    if (outcome === "statutory_path") {
      // Drafted, never served. One channel at a time: no chase beside a notice.
      await ports.prepareNotice(t.id);
      raise(ports, t.id, "rent.notice_drafted_awaiting_release", cfg, `${rule.state} rule ${rule.effectiveFrom.slice(0, 10)}, ${rule.noticeDays} days notice`);
      continue;
    }
    if (outcome === "will_self_resolve") continue;

    if (prior.length >= cfg.sequenceLength) {
      raise(ports, t.id, "rent.sequence_unanswered", cfg, `${prior.length} messages, no payment`);
      continue;
    }

    // The per-message stop: read the ledger again, now, and check everything.
    const fresh = await ports.readLedger(t.id);
    const blocked = stopCheck(t, fresh, ports.now(), cfg, prior);
    if (blocked.length > 0) {
      const toPerson = blocked.filter((b) => b.startsWith("rent."));
      if (toPerson.length > 0) raise(ports, t.id, toPerson.join(","), cfg, "stop check before message; nothing sent");
      continue;
    }

    const body =
      `Automated message from your property manager. Rent for tenancy ${t.id} is paid to ` +
      `${localDate(fresh.paidToDate, t.state)}. Balance owing today: ${dollars(fresh.balance)}. ` +
      `If you have already paid, or need to talk, reply and a person will call you.`;
    const res = await ports.sendMessage({ tenancyId: t.id, body, snapshot: fresh });
    if (!res.sent) raise(ports, t.id, "rent.send_refused", cfg, res.why ?? "refused");
  }

  // The short list: oldest paid-to date first, the date beside every balance.
  list.sort((a, b) => a.paidToDate.localeCompare(b.paidToDate));
  await ports.rank(list);
  return list;
}

/** A named person releases a drafted notice. No name, no release. */
async function release(ports, tenancyId, person) {
  return ports.releaseNotice(tenancyId, person && person.trim() ? person.trim() : undefined);
}

/** What was sent to whom, and when, with the words. */
async function log(ports, tenancyId) {
  return (await ports.messagesFor(tenancyId)).map((m) => ({ to: m.tenancyId, at: m.at, channel: m.channel, body: m.body }));
}

/**
 * An automated conversation: it discloses first, inside hours or not at all,
 * and stops the moment hardship is stated.
 */
async function converse(ports, tenancyId, replies, cfg) {
  const opened = await ports.disclose(tenancyId, "This is an automated assistant calling for your property manager. This call is recorded.");
  if (!opened.opened) return { opened: false, why: opened.why };
  for (const said of replies) {
    if (HARDSHIP_RE.test(said)) {
      raise(ports, tenancyId, "rent.hardship_on_file", cfg, "stated in conversation; routed to a person");
      return { opened: true, stopped: "hardship" };
    }
  }
  return { opened: true, stopped: null };
}

/**
 * @param {import("@aipathway/conformance").Ports} ports
 * @param {object} [opts] { task: "daily" | "release" | "log" | "converse", ...config }
 */
export async function build(ports, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  switch (opts.task ?? "daily") {
    case "release":
      return release(ports, opts.tenancyId, opts.person);
    case "log":
      return log(ports, opts.tenancyId);
    case "converse":
      return converse(ports, opts.tenancyId, opts.replies ?? [], cfg);
    default:
      return dailyRun(ports, cfg);
  }
}

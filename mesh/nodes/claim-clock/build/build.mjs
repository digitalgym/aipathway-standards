/**
 * Claim Clock: the payment schedule a head contractor owes on every
 * subcontractor's payment claim, kept as a compliance calendar to
 * AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * The job: when a subbie's payment claim arrives, work out the date the
 * payment schedule is due under the security of payment rule for the state
 * the work is in, and remind the named person. Miss that date with no
 * schedule served and, in most states, the business owes the full claimed
 * amount. So the date is derived, never typed in.
 *
 * Each claim is one obligation on the claims register (the job system's
 * claims list, or the claims folder the subbies send to). Its anchor is the
 * date the claim was served. Its rule is the business's own dated rule set
 * for that state: the number of business days, the days that are not business
 * days (weekends, public holidays, the Christmas closure the Act names), and a
 * citation. Nobody keys a due date in. A rule change with an effective date
 * moves every open claim it governs.
 *
 * Woken by document.received or email.received when a claim lands (the claim
 * is on the register by then, with its served date if anyone knows it), by
 * schedule.tick each morning, by email.received when someone taps a Done link
 * (the link opens a message to the watched claims inbox that already carries
 * the claim's obligation id), or by exception.closed. Each run:
 *
 *   1. Reads the claims register fresh. Nothing is kept between runs.
 *   2. Leaves alone any claim with an open exception. Its named owner has it,
 *      and the next run picks it up from the record once they close it.
 *   3. Works the Done replies, by obligation id only. Done with the served
 *      payment schedule attached: filed as evidence and read back by id. Done
 *      with nothing attached: refused, raised, still live. A reply with no
 *      obligation id is never matched on a subbie's name or phone number.
 *      A decision to serve no schedule (to pay the claim in full) is a dated
 *      outcome and the claim stays live until it is paid or the schedule is
 *      filed. A release with no named person is refused.
 *   4. Derives each due date from the rule in force for that state, or
 *      surfaces the gap: no served date on the claim, or no rule for the
 *      state. A claim whose site is in a state with no rule is never given
 *      another state's dates: which Act applies stays with a person. Every
 *      past due date on the record must be explained by a retained rule version.
 *   5. Sweeps for breaches. A breach is never cleared, even once the schedule
 *      is filed late.
 *   6. Reminds the named person, with the derived date and the rule that set
 *      it, inside the lead time, and every run once the date has passed. The
 *      reminder is an exception on the exception desk, which texts it to the
 *      exception_owner. The payment schedule itself is a legal instrument: this
 *      build drafts one against the claim and holds it for a named person to
 *      check the scheduled amount and the reasons, release and serve.
 *      Nothing leaves the business from this build, and nothing is paid.
 */

const DAY = 86_400_000;

/** Lead time, in calendar days, when a rule does not carry its own. */
const LEAD_DAYS = 10;

/** Who a reminder goes to when the claim names nobody. */
const FALLBACK_OWNER = "the contracts administrator";

function remind(ports, reason, target, note) {
  const id = typeof target === "string" ? target : target.id;
  const owner = typeof target === "string" ? FALLBACK_OWNER : (target.owner ?? FALLBACK_OWNER);
  return ports.escalate(reason, `${id}; exception_owner=${owner}${note ? `; ${note}` : ""}`);
}

const ymd = (d) => d.toISOString().slice(0, 10);
const md = (d) => d.toISOString().slice(5, 10);

/** Inside a closure window given as MM-DD bounds, which may wrap the new year. */
function inWindow(d, win) {
  if (!win?.from || !win?.to) return false;
  const k = md(d);
  return win.from <= win.to ? k >= win.from && k <= win.to : k >= win.from || k <= win.to;
}

/**
 * Business days under one rule version: not a Saturday or Sunday, not a
 * public holiday the rule lists, not inside a closure the Act names.
 */
export function isBusinessDay(d, rule) {
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  if ((rule?.holidays ?? []).includes(ymd(d))) return false;
  if ((rule?.closures ?? []).some((w) => inWindow(d, w))) return false;
  return true;
}

/**
 * The payment schedule due date: the end of the Nth business day after the
 * claim was served, or the contract's shorter period when the claim carries
 * one (the Acts take whichever is earlier). Null when the rule has no
 * business-day count or the claim no served date. Derived each run, never stored.
 */
export function scheduleDueDate(servedAt, rule, contractBusinessDays) {
  if (!servedAt || !Number.isInteger(rule?.businessDays)) return null;
  const n = Number.isInteger(contractBusinessDays) ? Math.min(contractBusinessDays, rule.businessDays) : rule.businessDays;
  const d = new Date(`${servedAt.slice(0, 10)}T00:00:00.000Z`);
  let counted = 0;
  while (counted < n) {
    d.setTime(d.getTime() + DAY);
    if (isBusinessDay(d, rule)) counted += 1;
  }
  return `${ymd(d)}T23:59:59.000Z`;
}

/**
 * @param {object} ports  CalendarWorld ports, or the business's live claims register
 * @param {Array<object>} [replies]  Done-link replies and decisions, each by obligation id:
 *   { kind: "done", obligationId, messageId, documentRef? }
 *   { kind: "no_schedule", obligationId, by, at? }
 *   { kind: "release", obligationId, person? }
 * @returns {Promise<Array<object>>} this run's view of the register (not durable state)
 */
export async function build(ports, replies = []) {
  const now = await ports.now();
  const register = await ports.readObligations();
  const index = new Map(register.map((r) => [r.id, r]));
  const onHold = new Set(register.filter((r) => r.exceptionOpen).map((r) => r.id));
  const filedThisRun = new Set();

  // 3. Done replies and decisions, by id.
  for (const reply of replies) {
    const ob = reply.obligationId ? index.get(reply.obligationId) : undefined;
    if (!ob) {
      await remind(ports, "claim.done_unmatched", reply.messageId ?? "a reply with no obligation id");
      continue;
    }
    if (onHold.has(ob.id)) continue;

    if (reply.kind === "done") {
      const res = await ports.complete(ob.id, reply.documentRef ?? undefined);
      if (res?.accepted !== true) {
        await remind(ports, "claim.done_without_schedule", ob, reply.messageId);
        continue;
      }
      const readBack = (await ports.readObligations()).find((r) => r.id === ob.id);
      if (readBack && readBack.evidenceRef === reply.documentRef && readBack.completedAt) filedThisRun.add(ob.id);
      else await remind(ports, "claim.evidence_not_read_back", ob, reply.documentRef);
    } else if (reply.kind === "no_schedule") {
      await ports.recordRefusal(ob.id, reply.at ?? now.toISOString());
      await remind(ports, "claim.no_schedule_decided", ob, `decided by ${reply.by ?? "unnamed"}; the full claimed amount falls due`);
    } else if (reply.kind === "release") {
      const released = await ports.releaseNotice(ob.id, reply.person ?? undefined);
      if (released !== true) await remind(ports, "claim.release_refused", ob);
    }
  }

  // 4. Derive, or surface the gap.
  const ruleCache = new Map();
  const rulesFor = async (ob) => {
    const key = `${ob.obligationType}@${ob.jurisdiction}`;
    if (!ruleCache.has(key)) ruleCache.set(key, await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    return ruleCache.get(key);
  };

  const view = [];
  const work = [];
  for (const ob of register) {
    if (onHold.has(ob.id)) continue;
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await remind(ports, "claim.served_date_unknown", ob, "no served date on the claim; confirm it before any date is worked out");
      view.push({ id: ob.id, anchor_status: "unknown", due: null, state: "scheduled" });
      continue;
    }
    const derived = await ports.dueDate(ob.id);
    if (!derived) {
      await remind(ports, "claim.no_rule_in_force", ob, `${ob.obligationType} in ${ob.jurisdiction ?? "an unknown state"}`);
      view.push({ id: ob.id, anchor_status: "known", due: null, state: "scheduled" });
      continue;
    }
    const versions = await rulesFor(ob);
    for (const past of ob.history ?? []) {
      const explained = versions.some((v) => v.version === past.version && v.effectiveFrom && v.effectiveFrom <= past.date);
      if (!explained) await remind(ports, "claim.history_unexplained", ob, `fell due ${past.date} under ${past.version}`);
    }
    const rule = versions.find((v) => v.version === derived.version);
    const businessDue = scheduleDueDate(ob.anchorDate, rule, ob.contractBusinessDays);
    // The business-day count under that same version is the date the Act
    // sets. The register's own date stands in only where the rule carries no
    // business-day count.
    const due = businessDue ?? derived.date;
    const row = { id: ob.id, anchor_status: "known", due, register_due: derived.date, rule_version: derived.version };
    view.push(row);
    work.push({ row, ob, rule });
  }

  // 5. Breaches. The register keeps them, and so does this build.
  const breached = new Set(await ports.sweep());

  // 6. Reminders and the drafted payment schedule.
  for (const { row, ob, rule } of work) {
    // On the register's breach list, or past the business-day date this run.
    row.breached = breached.has(ob.id) || (!ob.completedAt && !filedThisRun.has(ob.id) && row.due < now.toISOString());
    if (ob.completedAt || filedThisRun.has(ob.id)) {
      row.state = "scheduled";
      continue;
    }
    const lead = (rule?.leadDays ?? LEAD_DAYS) * DAY;
    const inLead = new Date(row.due).getTime() - now.getTime() <= lead;
    row.state = row.breached
      ? "breached_or_at_risk"
      : ob.waitingOn
        ? "waiting_on_someone"
        : inLead
          ? "due_action_drafted"
          : "scheduled";

    const basis = `${rule?.citation ?? row.rule_version} (${row.rule_version})`;
    if (row.breached) await remind(ports, "claim.schedule_overdue", ob, `schedule was due ${row.due.slice(0, 10)} under ${basis}; Done link sent`);
    else if (inLead) await remind(ports, "claim.schedule_due", ob, `schedule due ${row.due.slice(0, 10)} under ${basis}; Done link sent`);

    if (rule?.scheduleDraft && (row.breached || inLead) && !ob.refusedAt) {
      await ports.prepareNotice(ob.id);
      await remind(ports, "claim.schedule_drafted_awaiting_release", ob, rule.scheduleDraft);
    }
    if (ob.waitingOn && ob.nextChase && ob.nextChase <= now.toISOString()) {
      await remind(ports, "claim.chase_due", ob, `waiting on ${ob.waitingOn} since ${ob.waitingSince ?? "unknown"}`);
    }
  }
  return view;
}

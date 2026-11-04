/**
 * Rental Safety Watch: the recurring safety checks on every rental property in
 * a rent roll, built to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * An original build. The idea was a job owners pay for; nothing here comes from
 * any app, listing or prompt.
 *
 * Each rental property is an asset in the property management system (its
 * asset_id, with the tenancy_id it is let under). Each property carries one
 * obligation per recurring safety check:
 *
 *   smoke_alarm_check        the smoke alarms tested and the report filed
 *   gas_safety_check         the gas appliances and fittings checked
 *   tempering_valve_check    the hot water tempering or mixing valve serviced
 *
 * How often each falls due, how early the booking is drafted, and whether the
 * tenant needs a written entry notice are dated rules per state, held in the
 * agency's rule store. A state changing an interval is a new rule version, so
 * every property's date moves at once and nobody retypes one.
 *
 * What the property manager sees, and the standard's state behind each:
 *
 *   Overdue            breached_or_at_risk   the check date passed. A named
 *                                            person is told. Never clears itself.
 *   Book now           due_action_drafted    inside the lead time. The
 *                                            contractor booking (and the
 *                                            tenant's entry notice, where the
 *                                            rule needs one) is drafted and held
 *                                            for the property manager to release.
 *   Waiting on access  waiting_on_someone    the tenant was not home. The second
 *                                            attempt is drafted, with who, since
 *                                            when and the next chase date.
 *   Up to date         scheduled             a derived date outside the lead
 *                                            time.
 *   Last check unknown (surfaced, no date)   nobody knows when it was last done.
 *                                            Never defaulted to today.
 *
 * One run, each time it is woken (schedule.tick each morning, a certificate
 * filed against an obligation id, or exception.closed):
 *
 *   1. Read the register fresh. Nothing is kept between runs.
 *   2. Skip any obligation with an open exception: its owner has it.
 *   3. Apply what was handed over, by obligation id only (never an address or
 *      a tenant's name): a certificate is a completion with evidence; a "done"
 *      with nothing attached is refused and raised; an owner declining to pay
 *      is a dated refusal and the check stays live; a tenant not home is a
 *      waiting state with a redrafted booking; a named release lets a draft go.
 *   4. Derive each due date from the rule version in force in the property's
 *      state, and check that every past due date is explained by a kept version.
 *   5. Sweep for breaches, then class every obligation and act on its class.
 *
 * It never sends a booking or a notice on its own, never pays a contractor, and
 * never signs off a check: a licensed contractor does the work and signs the
 * certificate, and a person releases every draft.
 */

const DAY = 86_400_000;

/** How early the booking is drafted when the rule does not say. */
export const DEFAULT_LEAD_DAYS = 30;

/** Days until the second access attempt is chased, when the rule does not say. */
export const DEFAULT_RETRY_DAYS = 7;

/** Who an exception names when the obligation row names nobody. */
export const DEFAULT_OWNER = "property manager";

export const SHOWN = {
  overdue: "Overdue",
  bookNow: "Book now",
  waiting: "Waiting on access",
  upToDate: "Up to date",
  unknown: "Last check unknown",
  noRule: "No rule for this state",
};

const owner = (ob) => ob.exceptionOwner ?? DEFAULT_OWNER;
const line = (ob, more = "") =>
  `${ob.id} property ${ob.assetId} tenancy ${ob.tenancyId ?? "none"} ${ob.obligationType} owner=${owner(ob)}${more ? ` ${more}` : ""}`;
const ruleKey = (ob) => `${ob.obligationType}|${ob.jurisdiction}`;
const day = (iso) => String(iso).slice(0, 10);

/**
 * @param {object} ports  the CalendarWorld ports, or the agency's own register
 * @param {Array<object>} [handover]  items filed against an obligation id:
 *   { kind: "certificate" | "refusal" | "no_access" | "release",
 *     obligationId, evidenceRef?, by?, at?, person? }
 * @returns {Promise<Array<object>>} this run's view (shown, never stored)
 */
export async function build(ports, handover = []) {
  const now = await ports.now();
  const rows = await ports.readObligations();
  const byId = new Map(rows.map((o) => [o.id, o]));
  const held = new Set(rows.filter((o) => o.openException).map((o) => o.id));
  const doneThisRun = new Set();
  const waiting = new Map();

  // 3. The handover, matched by obligation id and nothing else.
  for (const item of handover) {
    const ob = item.obligationId ? byId.get(item.obligationId) : undefined;
    if (!ob) {
      await ports.escalate("safety.certificate_unmatched", item.ref ?? "a filed item carrying no obligation id");
      continue;
    }
    if (held.has(ob.id)) continue;
    switch (item.kind) {
      case "certificate": {
        const res = await ports.complete(ob.id, item.evidenceRef);
        if (res?.accepted === true) doneThisRun.add(ob.id);
        else await ports.escalate("safety.done_without_certificate", line(ob, res?.why ?? ""));
        break;
      }
      case "refusal": {
        const at = item.at ?? now.toISOString();
        await ports.recordRefusal(ob.id, at);
        await ports.escalate("safety.owner_declined", line(ob, `declined by ${item.by ?? "unnamed"} on ${day(at)}; still live`));
        break;
      }
      case "no_access": {
        waiting.set(ob.id, { since: item.at ?? now.toISOString(), on: item.by ?? "tenant access" });
        break;
      }
      case "release": {
        const ok = await ports.releaseNotice(ob.id, item.person);
        if (ok !== true) await ports.escalate("safety.release_without_person", line(ob));
        break;
      }
      default:
        await ports.escalate("safety.certificate_unmatched", line(ob, `unknown handover ${item.kind}`));
    }
  }

  // 4. Derive the date, or surface why there is none.
  const rules = new Map();
  const view = [];
  for (const ob of rows) {
    if (held.has(ob.id)) {
      view.push({ id: ob.id, assetId: ob.assetId, shown: null, held: true });
      continue;
    }
    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await ports.escalate("safety.last_check_unknown", line(ob, "no last check date on file"));
      view.push({ id: ob.id, assetId: ob.assetId, shown: SHOWN.unknown, anchor_status: "unknown", due: null });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await ports.escalate("safety.no_rule_for_state", line(ob, ob.jurisdiction ?? "no state"));
      view.push({ id: ob.id, assetId: ob.assetId, shown: SHOWN.noRule, anchor_status: "known", due: null });
      continue;
    }
    if (ob.jurisdiction && !rules.has(ruleKey(ob))) {
      rules.set(ruleKey(ob), await ports.readRuleVersions(ob.obligationType, ob.jurisdiction));
    }
    const kept = rules.get(ruleKey(ob)) ?? [];
    for (const past of ob.pastDue ?? []) {
      if (!kept.some((r) => r.version === past.version && r.effectiveFrom)) {
        await ports.escalate("safety.past_date_unexplained", line(ob, `due ${day(past.date)} under ${past.version}`));
      }
    }
    view.push({ id: ob.id, assetId: ob.assetId, anchor_status: "known", due: due.date, rule_version: due.version, ob });
  }

  // 5. Breaches first. Once the register marks one, it stays marked.
  const breached = new Set(await ports.sweep());

  for (const row of view) {
    if (!row.ob) continue;
    const { ob } = row;
    const rule = (rules.get(ruleKey(ob)) ?? []).find((r) => r.version === row.rule_version);
    const lead = rule?.leadDays ?? DEFAULT_LEAD_DAYS;
    const open = !ob.completedAt && !doneThisRun.has(ob.id);
    const untilDue = new Date(row.due).getTime() - now.getTime();
    row.breached = breached.has(ob.id);
    const wait = waiting.get(ob.id);

    if (row.breached && open) {
      row.shown = SHOWN.overdue;
      await ports.escalate("safety.check_overdue", line(ob, `due ${day(row.due)} under ${row.rule_version}`));
      if (rule?.noticeOnBreach) {
        await ports.prepareNotice(ob.id);
        await ports.escalate("safety.draft_awaiting_release", line(ob, "overdue booking and entry notice drafted"));
      }
    } else if (open && wait) {
      row.shown = SHOWN.waiting;
      const next = new Date(now.getTime() + (rule?.retryDays ?? DEFAULT_RETRY_DAYS) * DAY).toISOString();
      await ports.prepareNotice(ob.id);
      await ports.escalate(
        "safety.waiting_on_access",
        line(ob, `waiting on ${wait.on} since ${day(wait.since)}; next chase ${day(next)}; second booking drafted`),
      );
    } else if (open && untilDue <= lead * DAY) {
      row.shown = SHOWN.bookNow;
      await ports.prepareNotice(ob.id);
      await ports.escalate("safety.booking_drafted", line(ob, `due ${day(row.due)} under ${row.rule_version}`));
    } else {
      // A late check that is now done still reads breached in its history.
      row.shown = SHOWN.upToDate;
    }
    delete row.ob;
  }
  return view;
}

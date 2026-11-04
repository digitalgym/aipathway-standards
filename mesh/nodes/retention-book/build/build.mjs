/**
 * Retention Book: the retention a client is holding on each of our contracts,
 * kept as a compliance calendar to AIP-BS-COMPLIANCE-CALENDAR 2026-10-03.
 * https://aipathway.com.au/explore-ai/compliance-calendar-build-standard
 *
 * The job. A builder or trade business on a commercial contract has cash
 * retention held back from its progress claims (commonly 5% of the contract
 * sum, in two halves). The first half is due back around practical completion;
 * the second at the end of the defects liability period. Nobody types either
 * date in. Each one is derived from the contract's retention terms (a dated,
 * versioned rule: a variation that extends the defects liability period is a
 * new version with its own effective date, never an edit) applied to the
 * practical completion date on the job record.
 *
 * The rules are held per state, because the contract terms the business uses
 * differ by state, and the state law around retention (for example the
 * retention trust rules in Queensland and New South Wales) is something a
 * person interprets. The build applies the rule it is given; it never decides
 * what a statute means.
 *
 * Woken by schedule.tick each morning, by email.received when a remittance or
 * a reply about a release lands in the watched accounts inbox carrying the
 * obligation id, by job.updated when practical completion is recorded, and by
 * exception.closed. Each run:
 *
 *   1. Reads the retention register fresh, by id. Nothing is kept between runs.
 *   2. Leaves alone any obligation with an open exception. Its named owner has
 *      it, and the next run picks it up from the record once they close it.
 *   3. Works what came in, by obligation id only:
 *        - retention released, with the remittance or release certificate
 *          attached: filed as evidence against the job and the obligation
 *          closes. With nothing attached: refused, raised, still live.
 *        - the client refuses or disputes the release: stored as a dated
 *          outcome, raised to a named person, and the obligation stays live.
 *        - a named person releases the drafted release request. A release with
 *          nobody named is refused.
 *   4. Derives each release date from the rule in force for that state, or
 *      surfaces the gap: practical completion not yet recorded (an unknown
 *      anchor, never defaulted to today), or no rule for the state. Every
 *      release date already passed must still be explained by a retained rule
 *      version.
 *   5. Inside the lead time, drafts the release request to the client and
 *      raises it to the named person to check and send. Nothing leaves the
 *      business from this build.
 *   6. Sweeps for overdue releases. An overdue release is raised every run
 *      until the money is back, and stays on the record as late after it is.
 */

const DAY = 86_400_000;

/** How far ahead of a release date the request is drafted. */
const LEAD_DAYS = 30;

/** Who an exception goes to when the contract record names nobody. */
const FALLBACK_OWNER = "the contracts administrator";

function raise(ports, reason, target, note) {
  const id = typeof target === "string" ? target : target.id;
  const job = typeof target === "string" ? "" : target.jobId ? `; job_id=${target.jobId}` : "";
  const owner = typeof target === "string" ? FALLBACK_OWNER : (target.owner ?? FALLBACK_OWNER);
  return ports.escalate(reason, `${id}${job}; exception_owner=${owner}${note ? `; ${note}` : ""}`);
}

/**
 * The rule version that governed a release date: the latest version already in
 * force on the date it produced. This is what an audit asks for once the date
 * has passed and a later version has taken over.
 */
function governingVersion(versions, anchorDate) {
  const MONTH = 30 * DAY;
  const anchor = Date.parse(anchorDate);
  const sorted = [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  for (const v of sorted) {
    const due = new Date(anchor + v.intervalMonths * MONTH).toISOString();
    if (v.effectiveFrom <= due) return { version: v.version, due };
  }
  return null;
}

/**
 * @param {object} ports  CalendarWorld ports, or the business's live retention register
 * @param {Array<object>} [inputs]  what came in since the last run, each by obligation id:
 *   { kind: "released", obligationId, messageId, documentRef? }
 *   { kind: "refused", obligationId, by, at? }
 *   { kind: "release", obligationId, person? }
 * @returns {Promise<Array<object>>} this run's view of the register (not durable state)
 */
export async function build(ports, inputs = []) {
  const now = await ports.now();
  const register = await ports.readObligations();
  const index = new Map(register.map((r) => [r.id, r]));
  const onHold = new Set(register.filter((r) => r.exceptionOpen).map((r) => r.id));
  const closedThisRun = new Set();

  // 3. What came in, by id. Never matched on a client name or an amount.
  for (const input of inputs) {
    const ob = input.obligationId ? index.get(input.obligationId) : undefined;
    if (!ob) {
      await raise(ports, "retention.reply_unmatched", input.messageId ?? "a message with no obligation id");
      continue;
    }
    if (onHold.has(ob.id)) continue;

    if (input.kind === "released") {
      const res = await ports.complete(ob.id, input.documentRef ?? undefined);
      if (res?.accepted !== true) {
        await raise(ports, "retention.released_without_document", ob, `message_id=${input.messageId ?? "none"}; still live`);
      } else {
        closedThisRun.add(ob.id);
      }
    } else if (input.kind === "refused") {
      const at = input.at ?? now.toISOString();
      await ports.recordRefusal(ob.id, at);
      await raise(ports, "retention.release_refused", ob, `refused_by=${input.by ?? "the client"}; refused_at=${at}; still live`);
    } else if (input.kind === "release") {
      if (!input.person) {
        await raise(ports, "retention.release_unnamed", ob, "a release request needs a named person to release it");
      } else {
        await ports.releaseNotice(ob.id, input.person);
      }
    }
  }

  // 4 and 5. Derive, explain, draft.
  const view = [];
  const versionsSeen = new Map();
  for (const ob of register) {
    if (onHold.has(ob.id)) continue;
    const state = ob.state;
    if (!state) {
      await raise(ports, "retention.no_state_on_contract", ob);
      continue;
    }
    const key = `${ob.obligationType}|${state}`;
    if (!versionsSeen.has(key)) versionsSeen.set(key, await ports.readRuleVersions(ob.obligationType, state));
    const versions = versionsSeen.get(key);

    if (!ob.anchorDate) {
      await ports.markUnknownAnchor(ob.id);
      await raise(ports, "retention.practical_completion_unknown", ob, "no release date until practical completion is recorded");
      view.push({ id: ob.id, status: "anchor_unknown" });
      continue;
    }
    const due = await ports.dueDate(ob.id);
    if (!due) {
      await raise(ports, "retention.no_rule_for_state", ob, `state=${state}`);
      view.push({ id: ob.id, status: "no_rule" });
      continue;
    }
    const done = ob.completedAt || closedThisRun.has(ob.id);
    const dueMs = Date.parse(due.date);

    // Released: the date it fell due must still be explained by a retained version.
    if (done) {
      const behind = governingVersion(versions, ob.anchorDate);
      if (!behind) await raise(ports, "retention.rule_history_missing", ob);
      view.push({ id: ob.id, status: "released", due: behind?.due ?? null, rule_version: behind?.version ?? null });
      continue;
    }
    if (dueMs - now.getTime() <= LEAD_DAYS * DAY) {
      await ports.prepareNotice(ob.id);
      await raise(ports, "retention.release_request_drafted", ob, `due=${due.date}; rule_version=${due.version}; awaiting a named release`);
      view.push({ id: ob.id, status: "due_action_drafted", due: due.date, rule_version: due.version });
    } else {
      view.push({ id: ob.id, status: "scheduled", due: due.date, rule_version: due.version });
    }
  }

  // 6. Overdue releases. Once overdue, always on the record as overdue.
  const overdue = await ports.sweep();
  for (const id of overdue) {
    const ob = index.get(id);
    if (!ob || onHold.has(id)) continue;
    if (ob.completedAt || closedThisRun.has(id)) {
      await raise(ports, "retention.released_late", ob, "release came in after its date; the breach stays on the record");
      continue;
    }
    const rule = (versionsSeen.get(`${ob.obligationType}|${ob.state}`) ?? []).at(-1);
    if (rule?.noticeOnBreach) await ports.prepareNotice(ob.id);
    await raise(
      ports,
      "retention.release_overdue",
      ob,
      `${ob.refusedAt ? `refused_at=${ob.refusedAt}; ` : ""}held=${ob.heldAmount ?? "unknown"}; draft awaiting a named release`,
    );
  }
  return view;
}

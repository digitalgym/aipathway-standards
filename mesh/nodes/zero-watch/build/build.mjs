/**
 * Zero Watch: every Monday, the accounts that should sit at zero but don't.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * The bookkeeper or the practice names, once, the accounts in a client's file
 * that should be empty: suspense, the Stripe, Square or PayPal clearing
 * account, wages clearing, wages payable after the pay run, rounding. Each
 * named account is two lines in the definitions register:
 *
 *   - its balance, read from the ledger's own balance sheet as at the end of
 *     the week (`kind: "balance"`);
 *   - the age in days of its oldest unexplained line, read from the account's
 *     transactions (`kind: "oldest"`).
 *
 * Every Monday morning, for each week whose scheduled time has arrived and
 * that has no report yet, it:
 *
 *   1. reads each measure's source once for the week and cites the
 *      definition, the source and the as-of time the read returned;
 *   2. publishes one view per audience: the bookkeeper sees every account
 *      with its oldest line, the reviewing partner sees the balances only;
 *   3. says in the commentary, account by account, which sit at zero and
 *      which do not, stating only numbers the figure list carries;
 *   4. publishes a balance it could not read as unavailable with the reason,
 *      tells the definition's owner and raises an exception, never last
 *      week's balance;
 *   5. compares each thresholded measure with last week's published figure
 *      and tells the named person in the same run, escalating instead when
 *      either side is unavailable.
 *
 * It reports only. There is no port here that writes to the ledger, and the
 * build never asks for one: clearing the account, or the journal that does
 * it, stays with a person. Corrections are never edits: a named person asks,
 * the gate records their name and reason, and a new version supersedes the
 * old in every view carrying that measure.
 */

/** A label for the commentary, from the register. No digits: a digit in prose must be a figure value. */
const label = (def, measure) => (def?.account ?? measure.replace(/_(balance|oldest_days)$/, "").replace(/[_\d]+/g, " ")).trim();

/**
 * @param {import("@aipathway/conformance").ReportPorts} ports
 */
export async function build(ports) {
  const now = (await ports.now()).getTime();
  const definitions = await ports.readDefinitions();
  const schedule = [...(await ports.readSchedule())].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const thresholds = await ports.readThresholds();
  const audiences = await ports.readAudiences();

  for (let i = 0; i < schedule.length; i++) {
    const week = schedule[i];
    if (Date.parse(week.scheduledAt) > now) continue; // the schedule is the only trigger
    const already = await ports.readReports(week.period);
    const due = audiences.filter((a) => !already.some((r) => r.audienceId === a.id));
    if (due.length === 0) continue; // this week's report is out; a repeat run does nothing
    const priorWeek = i > 0 ? schedule[i - 1].period : null;
    await publishWeek(ports, { period: week.period, priorWeek, definitions, thresholds, audiences: due });
  }

  await correct(ports, definitions);
}

/** Read every measure once for the week, then write one view per audience. */
async function publishWeek(ports, { period, priorWeek, definitions, thresholds, audiences }) {
  const wanted = [...new Set(audiences.flatMap((a) => a.measures))];
  const sheet = new Map();

  for (const measure of wanted) {
    const defs = definitions.filter((d) => d.measure === measure);
    if (defs.length === 0) {
      sheet.set(measure, { measure, value: null, unavailableReason: "no_definition" });
      await ports.escalate("report.no_definition", `${measure} for ${period}: not in the client's register of should-be-zero accounts`);
      continue;
    }
    if (defs.length > 1) {
      sheet.set(measure, { measure, value: null, unavailableReason: "conflicting_definitions" });
      for (const owner of new Set(defs.map((d) => d.owner))) {
        await ports.notify(owner, { measure, period, detail: "the register defines this account more than once; pick one" });
      }
      await ports.escalate("report.conflicting_definitions", `${measure} for ${period}: ${defs.map((d) => d.id).join(", ")}`);
      continue;
    }
    const def = defs[0];
    const read = await ports.readSource(def.source, def.queryRef, period);
    if (!read.ok) {
      sheet.set(measure, { measure, def, value: null, unavailableReason: `source_unreadable: ${read.reason}` });
      await ports.notify(def.owner, { measure, period, detail: `${def.source} could not be read: ${read.reason}` });
      await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} ${read.reason}; exception_owner ${def.owner}`);
      continue;
    }
    const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
    sheet.set(measure, { measure, def, value: read.value, unavailableReason: null, cited });
  }

  const written = [];
  for (const audience of audiences) {
    const figures = audience.measures.map((m) => sheet.get(m));
    const report = await ports.publishReport({
      period,
      audienceId: audience.id,
      figures: figures.map((f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) })),
      narrative: commentary(period, figures, definitions),
    });
    written.push({ audience: audience.id, id: report?.id ?? null });
  }
  await confirm(ports, period, written);

  await thresholdsFor(ports, { period, priorWeek, thresholds, sheet });
}

/** A view counts as published only when its report_id reads back for the week. */
async function confirm(ports, period, written) {
  const ids = new Set((await ports.readReports(period)).map((r) => r.id));
  for (const w of written) {
    if (!w.id || !ids.has(w.id)) {
      await ports.escalate("report.publish_failed", `${period} zero watch for ${w.audience}: no report_id read back`);
    }
  }
}

/** Week on week against last week's published figure. An unavailable side goes to the person, never assumed. */
async function thresholdsFor(ports, { period, priorWeek, thresholds, sheet }) {
  if (!priorWeek) return;
  const last = (await ports.readReports(priorWeek)).filter((r) => r.status === "published");
  for (const t of thresholds) {
    const current = sheet.get(t.measure);
    if (!current) continue;
    const before = last.flatMap((r) => r.figures).find((f) => f.measure === t.measure);
    if (!before || before.value === null || current.value === null) {
      await ports.escalate("report.threshold_not_comparable", `${t.measure} for ${period} against ${priorWeek}: one side is unavailable; ${t.notify} to decide`);
      continue;
    }
    const change = current.value - before.value;
    const past = t.direction === "up" ? change > t.amount : -change > t.amount;
    if (past) {
      await ports.notify(t.notify, { measure: t.measure, period, detail: `moved ${t.direction} past its threshold against ${priorWeek}` });
    }
  }
}

/** Each correction once: the gate with the person and reason, then a new version of every view carrying the measure. */
async function correct(ports, definitions) {
  for (const c of await ports.readCorrections()) {
    const reports = await ports.readReports(c.period);
    const target = reports.find((r) => r.id === c.reportId);
    if (!target || target.status !== "published") continue;
    if (!c.person || !c.reason) {
      await ports.escalate("report.correction_incomplete", `${c.id}: needs a named person and a reason`);
      continue;
    }
    if (!target.figures.some((f) => f.measure === c.measure)) {
      await ports.escalate("report.correction_unknown_measure", `${c.id}: ${c.measure} is not in ${c.reportId}`);
      continue;
    }
    const gate = await ports.approveCorrection({ reportId: c.reportId, person: c.person, reason: c.reason });
    if (!gate?.approved) {
      await ports.escalate("report.correction_incomplete", `${c.id}: not approved; stays with ${c.person}`);
      continue;
    }
    const views = reports.filter((r) => r.status === "published" && r.figures.some((f) => f.measure === c.measure));
    const at = (await ports.now()).toISOString();
    const written = [];
    for (const view of views) {
      const figures = [];
      for (const f of view.figures) {
        if (f.measure === c.measure) {
          const def = definitions.find((d) => d.id === f.definitionId) ?? definitions.find((d) => d.measure === c.measure);
          const cited = await ports.cite({ measure: f.measure, definitionId: def?.id ?? f.definitionId ?? "", source: `correction ${c.id} by ${c.person}`, asOf: at });
          figures.push({ measure: f.measure, value: c.value, unavailableReason: null, cited });
        } else if (f.value !== null && f.definitionId && f.source && f.asOf) {
          const cited = await ports.cite({ measure: f.measure, definitionId: f.definitionId, source: f.source, asOf: f.asOf });
          figures.push({ measure: f.measure, value: f.value, unavailableReason: null, cited });
        } else {
          figures.push({ measure: f.measure, value: null, unavailableReason: f.unavailableReason ?? "unavailable" });
        }
      }
      const report = await ports.publishReport({
        period: c.period,
        audienceId: view.audienceId,
        figures,
        narrative: commentary(c.period, figures, definitions),
        supersedes: view.id,
        by: c.person,
        reason: c.reason,
      });
      written.push({ audience: view.audienceId, id: report?.id ?? null });
    }
    await confirm(ports, c.period, written);
  }
}

/**
 * Account by account: at zero, or not at zero with its balance and the age
 * of its oldest unexplained line. It states only the figures' own values. A
 * balance below zero is described in words, because its digits without the
 * sign would be a number the figure list does not carry.
 */
function commentary(period, figures, definitions) {
  const defOf = (m) => definitions.find((d) => d.measure === m);
  const lines = [`Accounts that should sit at zero, as at the end of ${period}, in Australian dollars.`];
  const byAccount = new Map();
  for (const f of figures) {
    const def = defOf(f.measure);
    const key = label(def, f.measure);
    const entry = byAccount.get(key) ?? {};
    if (def?.kind === "oldest" || /_oldest_days$/.test(f.measure)) entry.oldest = f;
    else entry.balance = f;
    byAccount.set(key, entry);
  }
  const missing = [];
  for (const [name, { balance, oldest }] of byAccount) {
    if (!balance) continue;
    if (balance.value === null) {
      missing.push(`${name} (${String(balance.unavailableReason).split(":")[0]})`);
      continue;
    }
    if (balance.value === 0) {
      lines.push(`${name}: at zero.`);
      continue;
    }
    const amount = balance.value < 0 ? "not at zero, below zero as shown in the figures" : `not at zero, balance ${balance.value}`;
    let age = "";
    if (oldest && oldest.value !== null) age = `; oldest unexplained line ${oldest.value} days old`;
    else if (oldest) age = "; oldest unexplained line not available";
    lines.push(`${name}: ${amount}${age}.`);
  }
  if (missing.length) lines.push(`Not available this week: ${missing.join("; ")}.`);
  lines.push("Nothing here was posted to the ledger; clearing an account stays with a person.");
  return lines.join(" ");
}

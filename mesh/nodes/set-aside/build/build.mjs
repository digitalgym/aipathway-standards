/**
 * Set Aside: every Monday, how much of the bank balance is already owed.
 *
 * Built to AIP-BS-RECURRING-REPORT 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * The pain it answers: the GST got spent and BAS time caught the business
 * short. Each Monday morning, for each week whose scheduled time has arrived
 * and that has no report yet, it:
 *
 *   1. reads the business's definitions register. The base measures are the
 *      bank total and each tax liability on the balance sheet: GST (collected
 *      less paid), PAYG withheld, super payable and any other tax liability
 *      the register names, each one tied to its ledger account;
 *   2. reads each base measure once from the ledger's trial balance as at the
 *      run date, and ties it to the same line of the ledger's own balance
 *      sheet as at the run date, to the cent. A figure that does not tie is
 *      published as unavailable with both values, never a guess;
 *   3. works out the derived measures from the tied figures only: the total
 *      owed, what is free to spend (bank total less the total owed) and the
 *      share of the bank balance already owed. When any input is unavailable
 *      the derived figure is held: published as unavailable naming the input,
 *      never worked out from a gap or from last week;
 *   4. publishes one view per audience (the owner, the bookkeeper, a manager
 *      who only sees the bank total and what is free to spend), every figure
 *      with its definition, source and as-of time;
 *   5. compares each thresholded measure with last week's published figure
 *      and tells the named person in the same run.
 *
 * It flags, never advises. It does not say what to pay, when to lodge or how
 * much tax is due: the ledger's balances are reported as the ledger holds
 * them, and what to do about them stays with the owner and their accountant.
 * Nothing here writes to the ledger. Corrections are a new version by a
 * named person, and a corrected input reworks the derived figures with it.
 */

/** Plain labels for the commentary. No digits: a digit in prose must be a figure value. */
const LABEL = {
  bank_total: "Bank total",
  gst_owed: "GST owed (collected less paid)",
  payg_withheld: "PAYG withheld",
  super_payable: "Super payable",
  other_tax_owed: "Other tax owed",
  owed_total: "Total already owed",
  free_to_spend: "Free to spend",
  owed_share_pct: "Share of the bank balance already owed (per cent)",
};
const label = (measure) => LABEL[measure] ?? measure.replace(/[_\d]+/g, " ").trim();

const cents = (n) => Math.round(n * 100);

/** How a derived measure is worked out from tied figures. One rule per op, never two. */
const OPS = {
  sum: (vals) => vals.reduce((a, v) => a + cents(v), 0) / 100,
  difference: ([a, b]) => (cents(a) - cents(b)) / 100,
  share_pct: ([part, whole]) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null),
};

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

/** The one definition for a measure, or the reason there is none. */
async function only(ports, definitions, measure, period) {
  const defs = definitions.filter((d) => d.measure === measure);
  if (defs.length === 0) {
    await ports.escalate("report.no_definition", `${measure} for ${period}: not in the register`);
    return { reason: "no_definition" };
  }
  if (defs.length > 1) {
    for (const owner of new Set(defs.map((d) => d.owner))) {
      await ports.notify(owner, { measure, period, detail: "the register defines this measure more than once; pick one" });
    }
    await ports.escalate("report.conflicting_definitions", `${measure} for ${period}: ${defs.map((d) => d.id).join(", ")}`);
    return { reason: "conflicting_definitions" };
  }
  return { def: defs[0] };
}

/** Read every measure once for the week, then write one view per audience. */
async function publishWeek(ports, { period, priorWeek, definitions, thresholds, audiences }) {
  const pack = new Map();

  // Each measure once, its inputs first. A derived measure an audience shows
  // pulls in its inputs even when that audience does not show them.
  const figure = async (measure, trail = []) => {
    if (pack.has(measure)) return pack.get(measure);
    const got = await only(ports, definitions, measure, period);
    if (!got.def) {
      const f = { measure, value: null, unavailableReason: got.reason };
      pack.set(measure, f);
      return f;
    }
    const def = got.def;
    const f = def.derived ? await derive(ports, def, period, (m) => (trail.includes(m) ? null : figure(m, [...trail, measure]))) : await readAndTie(ports, def, period);
    pack.set(measure, f);
    return f;
  };
  for (const measure of new Set(audiences.flatMap((a) => a.measures))) await figure(measure);

  const written = [];
  for (const audience of audiences) {
    const figures = audience.measures.map((m) => pack.get(m));
    const report = await ports.publishReport({
      period,
      audienceId: audience.id,
      figures: figures.map(toInput),
      narrative: commentary(period, figures, definitions),
    });
    written.push({ audience: audience.id, id: report?.id ?? null });
  }
  await confirm(ports, period, written);

  await thresholdsFor(ports, { period, priorWeek, thresholds, pack });
}

const toInput = (f) => ({ measure: f.measure, value: f.value, unavailableReason: f.unavailableReason, ...(f.cited ? { cited: f.cited } : {}) });

/** A base measure: one read of the trial balance line, tied to the balance sheet line before it is cited. */
async function readAndTie(ports, def, period) {
  const measure = def.measure;
  const read = await ports.readSource(def.source, def.queryRef, period);
  if (!read.ok) {
    await ports.notify(def.owner, { measure, period, detail: `${def.source} could not be read: ${read.reason}` });
    await ports.escalate("report.source_unreadable", `${measure} for ${period}: ${def.source} ${read.reason}; exception_owner ${def.owner}`);
    return { measure, value: null, unavailableReason: `source_unreadable: ${read.reason}` };
  }
  const tied = await tie(ports, def, period, read.value);
  if (!tied.ok) return { measure, value: null, unavailableReason: tied.reason };
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf: read.asOf });
  return { measure, value: tied.value, unavailableReason: null, cited, asOf: read.asOf, source: def.source, definitionId: def.id };
}

/**
 * Tie a figure to the ledger's own balance sheet as at the run date, to the
 * cent. The register names the line (`def.tie`). A balance sheet as at any
 * other date (last month end, the last BAS period end) is a different number
 * and is refused, because the point of the report is what is owed today.
 */
async function tie(ports, def, period, computed) {
  const t = def.tie;
  const owner = t?.notify ?? def.owner;
  const fail = async (reason, detail) => {
    await ports.notify(owner, { measure: def.measure, period, detail });
    await ports.escalate("report.figure_did_not_tie", `${def.measure} for ${period}: ${detail}; exception_owner ${owner}`);
    return { ok: false, reason };
  };
  if (!t?.queryRef || !t?.source) {
    return fail("not_tied: the register names no balance sheet line for this measure", "the register names no balance sheet line to tie this figure to");
  }
  if (!/as_at_run_date/.test(t.queryRef)) {
    return fail(`not_tied: ${t.queryRef} is not the balance sheet as at the run date`, `${t.queryRef} is not the balance sheet as at the run date`);
  }
  const report = await ports.readSource(t.source, t.queryRef, period);
  if (!report.ok) {
    return fail(`tie_unreadable: ${report.reason}`, `the ledger's balance sheet line ${t.queryRef} could not be read: ${report.reason}`);
  }
  const mine = cents(computed);
  const theirs = cents(report.value);
  if (mine !== theirs || !Number.isFinite(mine)) {
    const both = `trial balance ${(mine / 100).toFixed(2)}, balance sheet ${(theirs / 100).toFixed(2)}`;
    return fail(`did_not_tie: ${both}`, `did not tie to ${t.queryRef}: ${both}`);
  }
  return { ok: true, value: theirs / 100 };
}

/**
 * A derived measure, worked out once from figures already tied this run. Its
 * as-of time is the latest read among its inputs, taken from those reads. Any
 * input unavailable and the figure is held, naming the input: free to spend
 * is never worked out from a gap.
 */
async function derive(ports, def, period, get) {
  const measure = def.measure;
  const inputs = [];
  for (const m of def.derived.of) inputs.push({ m, f: await get(m) });
  // Name the figures at the root of the gap, not the derived ones between.
  const missing = [...new Set(inputs.filter((x) => !x.f || x.f.value === null).flatMap((x) => x.f?.heldBy ?? [x.m]))];
  if (missing.length) {
    await ports.escalate("report.derived_figure_held", `${measure} for ${period}: held because ${missing.join(", ")} is unavailable; exception_owner ${def.owner}`);
    return { measure, value: null, unavailableReason: `held: ${missing.join(", ")} unavailable`, heldBy: missing };
  }
  const op = OPS[def.derived.op];
  const value = op ? op(inputs.map((x) => x.f.value)) : null;
  if (value === null || !Number.isFinite(value)) {
    await ports.escalate("report.derived_figure_held", `${measure} for ${period}: cannot be worked out (${def.derived.op}); exception_owner ${def.owner}`);
    return { measure, value: null, unavailableReason: `held: cannot be worked out by ${def.derived.op}` };
  }
  const asOf = inputs.map((x) => x.f.asOf).sort().at(-1);
  const cited = await ports.cite({ measure, definitionId: def.id, source: def.source, asOf });
  return { measure, value, unavailableReason: null, cited, asOf, source: def.source, definitionId: def.id };
}

/** A report counts as written only when its report_id reads back for the week. */
async function confirm(ports, period, written) {
  const ids = new Set((await ports.readReports(period)).map((r) => r.id));
  for (const w of written) {
    if (!w.id || !ids.has(w.id)) {
      await ports.escalate("report.publish_failed", `${period} report for ${w.audience}: no report_id read back`);
    }
  }
}

/** Week on week against last week's published figure. An unavailable side goes to the person, never assumed. */
async function thresholdsFor(ports, { period, priorWeek, thresholds, pack }) {
  if (!priorWeek) return;
  const last = (await ports.readReports(priorWeek)).filter((r) => r.status === "published");
  for (const t of thresholds) {
    const current = pack.get(t.measure);
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

/**
 * Each correction once: the gate with the person and reason, then a new
 * version of every view for the week. A derived figure is never corrected
 * directly; correcting one of its inputs reworks it from the corrected input.
 */
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
    const cdef = definitions.find((d) => d.measure === c.measure);
    if (cdef?.derived) {
      await ports.escalate("report.correction_to_derived_figure", `${c.id}: ${c.measure} is worked out from ${cdef.derived.of.join(", ")}; correct an input instead; exception_owner ${c.person}`);
      continue;
    }
    const gate = await ports.approveCorrection({ reportId: c.reportId, person: c.person, reason: c.reason });
    if (!gate?.approved) {
      await ports.escalate("report.correction_incomplete", `${c.id}: not approved; stays with ${c.person}`);
      continue;
    }
    const at = (await ports.now()).toISOString();
    const views = reports.filter((r) => r.status === "published");

    // The week's figures as published, one per measure, with the correction applied.
    const pack = new Map();
    for (const v of views) for (const f of v.figures) if (!pack.has(f.measure)) pack.set(f.measure, { ...f });
    const corrected = { measure: c.measure, value: c.value, unavailableReason: null, asOf: at, source: `correction ${c.id} by ${c.person}`, definitionId: cdef?.id ?? null };
    pack.set(c.measure, corrected);

    // Rework every derived measure that depends on the corrected one, inputs first.
    const reworked = new Map([[c.measure, corrected]]);
    const touches = (d, seen = new Set()) => d.derived.of.some((m) => m === c.measure || (!seen.has(m) && definitions.some((x) => x.measure === m && x.derived && touches(x, new Set([...seen, m])))));
    const rework = (measure) => {
      if (reworked.has(measure)) return reworked.get(measure);
      const d = definitions.find((x) => x.measure === measure);
      if (!d?.derived || !touches(d)) return pack.get(measure);
      const ins = d.derived.of.map((m) => rework(m) ?? null);
      const missing = d.derived.of.filter((m, i) => !ins[i] || ins[i].value === null);
      const value = missing.length ? null : OPS[d.derived.op]?.(ins.map((x) => x.value)) ?? null;
      const f = value === null
        ? { measure, value: null, unavailableReason: `held: ${missing.join(", ") || d.derived.op} unavailable after correction ${c.id}`, definitionId: d.id }
        : { measure, value, unavailableReason: null, asOf: at, source: `correction ${c.id} by ${c.person}`, definitionId: d.id };
      reworked.set(measure, f);
      return f;
    };
    for (const d of definitions) if (d.derived) rework(d.measure);

    const affected = views.filter((v) => v.figures.some((f) => reworked.has(f.measure)));
    const written = [];
    for (const view of affected) {
      const figures = [];
      for (const f of view.figures) {
        const n = reworked.get(f.measure) ?? f;
        if (n.value !== null && n.definitionId && n.source && n.asOf) {
          const cited = await ports.cite({ measure: n.measure, definitionId: n.definitionId, source: n.source, asOf: n.asOf });
          figures.push({ measure: n.measure, value: n.value, unavailableReason: null, cited });
        } else {
          figures.push({ measure: n.measure, value: null, unavailableReason: n.unavailableReason ?? "unavailable" });
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
 * Commentary that names figures, their ledger accounts and only their own
 * values. A negative value is described in words, because its digits without
 * the sign would be a number the figure list does not carry. It flags; it
 * never says what to pay or set aside.
 */
function commentary(period, figures, definitions) {
  const lines = [`Set Aside for the week ${period}, read from the ledger as at Monday, in Australian dollars unless the measure says otherwise.`];
  for (const f of figures) {
    if (f.value === null) continue;
    const account = definitions.find((d) => d.measure === f.measure)?.account;
    const from = account ? ` (ledger account: ${account})` : "";
    lines.push(f.value < 0 ? `${label(f.measure)}${from}: below zero, as shown in the figures.` : `${label(f.measure)}${from}: ${f.value}.`);
  }
  // The reason's code only: the detail after the colon can carry both values
  // of a figure that did not tie, and those numbers are not on the figure list.
  const missing = figures.filter((f) => f.value === null).map((f) => `${label(f.measure)} (${String(f.unavailableReason).split(":")[0]})`);
  if (missing.length) lines.push(`Not available this week, so nothing is guessed: ${missing.join("; ")}.`);
  lines.push("This report flags what the ledger already shows as owed. What to set aside or pay is for the owner and their accountant.");
  return lines.join(" ");
}

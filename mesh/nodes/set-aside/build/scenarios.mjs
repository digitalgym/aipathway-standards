/**
 * One scenario per check of recurring-report-build-standard, for Set Aside:
 * the Monday report of how much of an Australian small business's bank
 * balance is already owed in GST, PAYG withheld, super and other tax, read
 * from its own ledger (Xero, MYOB or QuickBooks) as at the run date.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each is written so a build that does nothing fails it, and mutants.mjs
 * proves a deliberately broken build fails it too.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// The report is due at 7:00 am AEST each Monday (21:00 UTC on the Sunday).
const W48 = { period: "2026-W48", scheduledAt: "2026-11-22T21:00:00.000Z" };
const W49 = { period: "2026-W49", scheduledAt: "2026-11-29T21:00:00.000Z" };

const BOOKKEEPER = "Priya Shah (bookkeeper)";
const OWNER = "Dan Kerr (owner)";

// Each base measure is read once from the ledger's trial balance as at the
// run date, then tied to the same line of the ledger's own balance sheet as
// at the run date, to the cent. The balance sheet as at last month end is in
// the file too, and must never be the one tied to.
const tie = (line) => ({ source: "ledger", queryRef: `report.balance_sheet.as_at_run_date.${line}`, notify: BOOKKEEPER });
const base = (id, measure, account, queryRef, line, filters) => ({ id, measure, account, source: "ledger", queryRef, period: "week", filters, owner: BOOKKEEPER, tie: tie(line) });
const derived = (id, measure, op, of, filters) => ({ id, measure, source: "ledger", queryRef: `derived.${op}(${of.join(",")})`, period: "week", filters, owner: BOOKKEEPER, derived: { op, of } });
const ASAT = ["as at the run date", "AUD", "the balance the ledger holds, sign as the ledger shows it"];

const DEFS = {
  bank: base("DEF-bank", "bank_total", "every bank account on the balance sheet", "books.trial_balance.bank_accounts_total", "total_bank", [...ASAT, "every account of type bank, including the tax holding account if there is one"]),
  gst: base("DEF-gst", "gst_owed", "GST", "books.trial_balance.account.gst", "gst", [...ASAT, "GST collected less GST paid, as the GST control account holds it"]),
  payg: base("DEF-payg", "payg_withheld", "PAYG Withholdings Payable", "books.trial_balance.account.payg_withholdings_payable", "payg_withholdings_payable", [...ASAT, "tax withheld from wages and not yet paid to the ATO"]),
  sup: base("DEF-super", "super_payable", "Superannuation Payable", "books.trial_balance.account.superannuation_payable", "superannuation_payable", [...ASAT, "super guarantee accrued and not yet paid to the funds"]),
  other: base("DEF-other", "other_tax_owed", "Payroll Tax Payable", "books.trial_balance.account.payroll_tax_payable", "payroll_tax_payable", [...ASAT, "any other tax liability account the register names; here payroll tax"]),
  owed: derived("DEF-owed", "owed_total", "sum", ["gst_owed", "payg_withheld", "super_payable", "other_tax_owed"], ["the sum of the four owed figures above, each tied this run"]),
  free: derived("DEF-free", "free_to_spend", "difference", ["bank_total", "owed_total"], ["bank total less total already owed"]),
  share: derived("DEF-share", "owed_share_pct", "share_pct", ["owed_total", "bank_total"], ["total already owed over bank total, as a percentage to one decimal place"]),
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const BASES = ALL.filter((d) => !d.derived);
const MANAGER_SET = ["bank_total", "free_to_spend"];

// What the ledger holds as at each Monday.
const WEEK_A = { bank: 84250.4, gst: 18940.55, payg: 6312, sup: 9875.2, other: 2140 };
const WEEK_B = { bank: 66180.1, gst: 21305.7, payg: 7120, sup: 11240.6, other: 2140 };
// What the derived measures must come to.
const OUT_A = { owed: 37267.75, free: 46982.65, share: 44.2 };
const OUT_B = { owed: 41806.3, free: 24373.8, share: 63.2 };
// Last month end's balance sheet: a different, older set of balances.
const MONTH_END = { bank: 91020.15, gst: 15200, payg: 5980, sup: 8115.4, other: 2140 };

/**
 * The ledger: the trial balance as at each Monday, the balance sheet as at
 * each Monday, and the balance sheet as at last month end that must never be
 * used. `sheetA` / `sheetB` let a scenario make one balance sheet line disagree.
 */
const LEDGER = (a, b, { sheetA = a, sheetB = b } = {}) => {
  const values = {};
  for (const [k, d] of Object.entries(DEFS)) {
    if (d.derived) continue;
    values[d.queryRef] = { [W48.period]: a[k], [W49.period]: b[k] };
    values[d.tie.queryRef] = { [W48.period]: sheetA[k], [W49.period]: sheetB[k] };
    values[d.tie.queryRef.replace("as_at_run_date", "as_at_month_end")] = { [W48.period]: MONTH_END[k], [W49.period]: MONTH_END[k] };
  }
  return { id: "ledger", kind: "ledger", values };
};
const SOURCES = (opts) => [LEDGER(WEEK_A, WEEK_B, opts)];

const OWNER_VIEW = (measures) => ({ id: "owner", name: "Owner", measures });
const BOOKKEEPER_VIEW = (measures) => ({ id: "bookkeeper", name: "Bookkeeper", measures });
const MANAGER_VIEW = (measures) => ({ id: "manager", name: "Operations manager", measures });

/** A world that starts an hour before the first Monday report is due. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W48.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the due time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 9 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const valued = (r) => r.figures.filter((f) => f.value !== null);
const fig = (r, m) => r?.figures.find((f) => f.measure === m);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // The register defines the bank total, GST and PAYG; the owner's view also
    // asks for super payable, which this register does not define.
    world: () =>
      world({
        definitions: [DEFS.bank, DEFS.gst, DEFS.payg],
        sources: SOURCES(),
        schedule: [W48],
        audiences: [OWNER_VIEW(["bank_total", "gst_owed", "payg_withheld", "super_payable"])],
      }),
    drive: async (build, w) => tick(build, w, W48),
    holds: (w) => {
      const reports = w.published(W48.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const d = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!d || d.measure !== f.measure) return false;
        }
        const undefinedOne = fig(r, "super_payable");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W48.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The owner, the bookkeeper and the manager all carry the bank total and
    // what is free to spend; free to spend also needs the bank total as an
    // input. Each base line must be read once and every view must agree.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [W48],
        audiences: [OWNER_VIEW(EVERY), BOOKKEEPER_VIEW(EVERY), MANAGER_VIEW(MANAGER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W48),
    holds: (w) => {
      for (const d of BASES) {
        if (w.definitionsFor(d.measure).length !== 1) return false;
        if (w.sourceReads(d.source, d.queryRef, W48.period).length !== 1) return false;
      }
      const views = ["owner", "bookkeeper", "manager"].map((a) => w.current(W48.period, a));
      if (views.some((v) => !v)) return false;
      for (const [m, want, def] of [["bank_total", WEEK_A.bank, DEFS.bank], ["free_to_spend", OUT_A.free, DEFS.free]]) {
        const figs = views.map((v) => fig(v, m));
        if (figs.some((f) => !f || f.value !== want || f.definitionId !== def.id)) return false;
      }
      return true;
    },
    describe: (w) =>
      `${BASES.map((d) => `${d.measure} read ${w.sourceReads(d.source, d.queryRef, W48.period).length}x`).join(", ")}; free_to_spend: ${["owner", "bookkeeper", "manager"].map((a) => `${a}=${fig(w.current(W48.period, a), "free_to_spend")?.value ?? "none"}`).join(", ")}`,
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Every line ties. Each base figure is read from the trial balance and
    // tied to the balance sheet as at the run date before the report is
    // written; each derived figure carries the latest as-of of its inputs.
    // The run wakes nine minutes late, so an as-of typed from the due time
    // does not match, and the balance sheet as at last month end sits beside
    // the right one, so a build that ties to it cannot pass.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W48], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => tick(build, w, W48),
    holds: (w) => {
      const r = w.current(W48.period, "owner");
      if (!r) return false;
      const published = w.firstCall("publish_report");
      if (published < 0) return false;
      if (valued(r).length !== ALL.length) return false;
      const asOfs = [];
      for (const d of BASES) {
        const f = fig(r, d.measure);
        if (!f || !f.source || !f.asOf || f.definitionId !== d.id || f.source !== d.source) return false;
        const reads = w.sourceReads(d.source, d.queryRef, W48.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        const tieAt = w.firstCall("read_ledger", (c) => c.request?.source === d.tie.source && c.request?.queryRef === d.tie.queryRef && c.request?.period === W48.period && c.response?.ok === true);
        if (tieAt < 0 || tieAt > published) return false;
        if (f.value !== w.calls[tieAt].response.value) return false;
        asOfs.push(f.asOf);
      }
      const latest = asOfs.sort().at(-1);
      for (const [d, want] of [[DEFS.owed, OUT_A.owed], [DEFS.free, OUT_A.free], [DEFS.share, OUT_A.share]]) {
        const f = fig(r, d.measure);
        if (!f || f.value !== want || f.definitionId !== d.id || f.source !== d.source || f.asOf !== latest) return false;
      }
      return !w.escalations.some((e) => e.reason === "report.figure_did_not_tie");
    },
    describe: (w) => {
      const r = w.current(W48.period, "owner");
      return r ? r.figures.map((f) => (f.value === null ? `${f.measure} unavailable (${f.unavailableReason})` : `${f.measure}=${f.value}@${f.source}/${f.asOf}`)).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // A quiet fortnight: every balance is the same both Mondays. The build is
    // also woken the Sunday before each report is due, where it must do nothing.
    world: () => world({ definitions: ALL, sources: [LEDGER(WEEK_A, WEEK_A)], schedule: [W48, W49], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(W48.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W48);
      clockTo(w, new Date(Date.parse(W49.scheduledAt) - 12 * 60 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W49);
    },
    holds: (w) => {
      for (const e of [W48, W49]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W48, W49].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // One line off by a cent. In week 48 the trial balance holds GST of
    // 18940.55 and the balance sheet shows 18940.56: GST must publish as
    // unavailable with both values, the bookkeeper gets the exception, and
    // everything worked out from GST (total owed, free to spend, the share)
    // is held, never worked out from the gap. The other base lines publish.
    // Then the ledger stops answering before week 49: every figure publishes
    // as unavailable with the reason and the report still goes out.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES({ sheetA: { ...WEEK_A, gst: 18940.56 } }),
        schedule: [W48, W49],
        audiences: [OWNER_VIEW(EVERY), MANAGER_VIEW(MANAGER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W48);
      w.breakSource("ledger");
      await tick(build, w, W49);
    },
    holds: (w) => {
      const a = Date.parse(W48.scheduledAt);
      const b = Date.parse(W49.scheduledAt);
      // Week 48: the line that did not tie, and everything that depends on it.
      const r = w.current(W48.period, "owner");
      if (!r) return false;
      const gst = fig(r, "gst_owed");
      if (!gst || gst.value !== null || typeof gst.unavailableReason !== "string") return false;
      if (!gst.unavailableReason.includes("18940.55") || !gst.unavailableReason.includes("18940.56")) return false;
      const tieEx = w.escalations.filter((e) => e.reason === "report.figure_did_not_tie" && Date.parse(e.at) >= a && Date.parse(e.at) < b);
      if (tieEx.length !== 1 || !`${tieEx[0].detail}`.includes("gst_owed") || !`${tieEx[0].detail}`.includes(BOOKKEEPER)) return false;
      if (!w.notifications.some((n) => n.person === BOOKKEEPER && n.measure === "gst_owed" && n.period === W48.period)) return false;
      for (const m of ["owed_total", "free_to_spend", "owed_share_pct"]) {
        const f = fig(r, m);
        if (!f || f.value !== null || typeof f.unavailableReason !== "string" || !f.unavailableReason.includes("gst_owed")) return false;
      }
      const mgrFree = fig(w.current(W48.period, "manager"), "free_to_spend");
      if (!mgrFree || mgrFree.value !== null) return false;
      for (const [m, want] of [["bank_total", WEEK_A.bank], ["payg_withheld", WEEK_A.payg], ["super_payable", WEEK_A.sup], ["other_tax_owed", WEEK_A.other]]) {
        const f = fig(r, m);
        if (!f || f.value !== want || !f.asOf) return false;
      }
      // Week 49: the source that could not be read. Nothing from last week.
      const r2 = w.current(W49.period, "owner");
      if (!r2 || r2.figures.length !== ALL.length) return false;
      for (const f of r2.figures) {
        if (f.value !== null || typeof f.unavailableReason !== "string") return false;
        const isBase = BASES.some((d) => d.measure === f.measure);
        if (isBase && !f.unavailableReason.includes("source_unreachable")) return false;
      }
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= b && e.reason === "report.source_unreadable" && `${e.detail}`.includes("bank_total"));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= b && n.person === BOOKKEEPER && n.measure === "bank_total" && n.period === W49.period);
      return escalated && ownerTold;
    },
    describe: (w) => {
      const r = w.current(W48.period, "owner");
      const r2 = w.current(W49.period, "owner");
      const show = (x) => (x ? x.figures.map((f) => `${f.measure}=${f.value ?? `(${f.unavailableReason})`}`).join(", ") : "none");
      return `week 48: ${show(r)}; week 49: ${show(r2)}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every figure moves and free to spend nearly halves, so "free cash down
    // 48%" is tempting. Three views over two weeks.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [W48, W49],
        audiences: [OWNER_VIEW(EVERY), BOOKKEEPER_VIEW(EVERY), MANAGER_VIEW(MANAGER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W48);
      await tick(build, w, W49);
    },
    holds: (w) => {
      const reports = allReports(w, [W48.period, W49.period]);
      if (reports.length !== 6) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && valued(r).length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [W48.period, W49.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The owner set a threshold: free to spend falling by more than $15,000
    // week on week. It falls by $22,608.85 in week 49.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [W48, W49],
        thresholds: [{ measure: "free_to_spend", direction: "down", amount: 15000, notify: OWNER }],
        audiences: [OWNER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W48);
      await tick(build, w, W49);
    },
    holds: (w) => {
      const t = Date.parse(W49.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "free_to_spend" && (n.period === W48.period || Date.parse(n.at) < t));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === OWNER && n.measure === "free_to_spend" && n.period === W49.period && Date.parse(n.at) >= t && Date.parse(n.at) < t + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner and the bookkeeper see every line; the manager only the bank
    // total and what is free to spend, not the payroll liabilities.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [W48],
        audiences: [OWNER_VIEW(EVERY), BOOKKEEPER_VIEW(EVERY), MANAGER_VIEW(MANAGER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W48),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["bookkeeper", EVERY], ["manager", MANAGER_SET]]) {
        const r = w.current(W48.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "bookkeeper", "manager"].map((a) => `${a}: [${w.current(W48.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 48 is out, then the bookkeeper corrects super payable: Friday's pay
    // run was posted late (ref PAYRUN-1121). The new version must carry the
    // corrected super and rework total owed, free to spend and the share.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W48], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W48);
      w.firstVersion = w.current(W48.period, "owner");
      w.advance(120 * MIN);
      w.requestCorrection({ period: W48.period, audienceId: "owner", measure: "super_payable", value: 11015.2, person: BOOKKEEPER, reason: "pay run PAYRUN-1121 posted late; super accrual added" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W48.period, "owner");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("PAYRUN-1121")) return false;
      if (fig(next, "super_payable")?.value !== 11015.2) return false;
      // 37267.75 + 1140 = 38407.75; 84250.40 - 38407.75 = 45842.65; 38407.75 / 84250.40 = 45.6%
      if (fig(next, "owed_total")?.value !== 38407.75 || fig(next, "free_to_spend")?.value !== 45842.65 || fig(next, "owed_share_pct")?.value !== 45.6) return false;
      if (fig(next, "gst_owed")?.value !== WEEK_A.gst) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("PAYRUN-1121"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) =>
      w.published(W48.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy} free=${fig(r, "free_to_spend")?.value}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 48 to the owner and the manager, then super payable corrected
    // once. The manager's view does not carry super, but it carries free to
    // spend, which the correction changes, so it gets a new version too.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W48], audiences: [OWNER_VIEW(EVERY), MANAGER_VIEW(MANAGER_SET)] }),
    drive: async (build, w) => {
      await tick(build, w, W48);
      w.advance(120 * MIN);
      w.requestCorrection({ period: W48.period, audienceId: "owner", measure: "super_payable", value: 11015.2, person: BOOKKEEPER, reason: "pay run PAYRUN-1121 posted late; super accrual added" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W48.period);
      for (const a of ["owner", "manager"]) {
        const views = rs.filter((r) => r.audienceId === a);
        if (views.length < 2) return false;
        if (views.filter((r) => r.status === "published").length !== 1) return false;
      }
      if (fig(w.current(W48.period, "manager"), "free_to_spend")?.value !== 45842.65) return false;
      for (const r of rs) {
        if (valued(r).some((f) => !f.definitionId || !f.source || !f.asOf)) return false;
        const v = w.versionsOf(r.id);
        if (v.length !== 1 || !v[0].by) return false;
        if (r.supersedes && (v[0].by === "schedule" || !v[0].reason)) return false;
      }
      return true;
    },
    describe: (w) => w.published(W48.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
  },
  {
    checkId: "survives-the-builder",
    // Not software. The business names who else can explain it and whose
    // account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only. Run by hand on one business's real ledger over two real
// Mondays. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

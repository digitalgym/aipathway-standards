/**
 * One scenario per check of recurring-report-build-standard, for Month Pack:
 * the monthly management report pack a bookkeeping practice publishes for one
 * of its clients, an Australian small business whose books are in Xero and
 * whose cash is read from the bank statement.
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

// The pack for a month is due at 7:00 am AEST on the 8th of the next month
// (21:00 UTC on the 7th), after the bank reconciliation is done.
const SEP = { period: "2026-09", scheduledAt: "2026-10-07T21:00:00.000Z" };
const OCT = { period: "2026-10", scheduledAt: "2026-11-07T21:00:00.000Z" };

const BOOKKEEPER = "Mei Tan (bookkeeper)";
const PARTNER = "Rob Hardy (reviewing partner)";

const def = (id, measure, source, queryRef, filters, owner = BOOKKEEPER) => ({ id, measure, source, queryRef, period: "month", filters, owner });
const ACCRUAL = ["accrual basis", "calendar month", "AUD ex GST"];
const ASAT = ["as at the last day of the month", "AUD"];

const DEFS = {
  revenue: def("DEF-revenue", "pl_revenue", "xero", "profit_and_loss.total_income", ACCRUAL),
  cos: def("DEF-cos", "pl_cost_of_sales", "xero", "profit_and_loss.total_cost_of_sales", ACCRUAL),
  gp: def("DEF-gp", "pl_gross_profit", "xero", "profit_and_loss.gross_profit", ACCRUAL),
  opex: def("DEF-opex", "pl_operating_expenses", "xero", "profit_and_loss.total_operating_expenses", ACCRUAL),
  np: def("DEF-np", "pl_net_profit", "xero", "profit_and_loss.net_profit", ACCRUAL),
  assets: def("DEF-assets", "bs_total_assets", "xero", "balance_sheet.total_assets", ASAT),
  liab: def("DEF-liab", "bs_total_liabilities", "xero", "balance_sheet.total_liabilities", ASAT),
  net: def("DEF-net", "bs_net_assets", "xero", "balance_sheet.net_assets", ASAT),
  cash: def("DEF-cash", "cash_at_bank", "bank", "statement.closing_balance", ["operating account closing balance", "as on the bank statement for the last day of the month"]),
  gm: def("DEF-gm", "ratio_gross_margin_pct", "xero", "executive_summary.gross_margin_pct", ["gross profit over total income", "calendar month"]),
  cr: def("DEF-cr", "ratio_current", "xero", "executive_summary.current_ratio", ["current assets over current liabilities", "as at month end"]),
  dd: def("DEF-dd", "ratio_debtor_days", "xero", "executive_summary.debtor_days", ["average days to be paid", "as at month end"]),
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const LENDER_SET = ["pl_revenue", "pl_net_profit", "cash_at_bank", "ratio_current", "ratio_debtor_days"];

const MONTH_A = { revenue: 184500, cos: 102300, gp: 82200, opex: 61450, np: 20750, assets: 412800, liab: 236400, net: 176400, cash: 38900, gm: 44.6, cr: 1.42, dd: 38 };
const MONTH_B = { revenue: 171200, cos: 98900, gp: 72300, opex: 76600, np: -4300, assets: 405100, liab: 241900, net: 163200, cash: 26300, gm: 42.2, cr: 1.31, dd: 47 };

const XERO = (a, b) => ({
  id: "xero",
  kind: "ledger",
  values: Object.fromEntries(
    Object.entries(DEFS)
      .filter(([, d]) => d.source === "xero")
      .map(([k, d]) => [d.queryRef, { [SEP.period]: a[k], [OCT.period]: b[k] }]),
  ),
});
const BANK = (a, b) => ({ id: "bank", kind: "bank", values: { "statement.closing_balance": { [SEP.period]: a, [OCT.period]: b } } });
const SOURCES = () => [XERO(MONTH_A, MONTH_B), BANK(MONTH_A.cash, MONTH_B.cash)];

const PARTNER_VIEW = (measures) => ({ id: "partner", name: "Reviewing partner", measures });
const OWNER_VIEW = (measures) => ({ id: "owner", name: "Client's owner", measures });
const LENDER_VIEW = (measures) => ({ id: "lender", name: "Client's bank", measures });

/** A world that starts an hour before the September pack is due. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(SEP.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the due time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 11 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const valued = (r) => r.figures.filter((f) => f.value !== null);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // The register defines four measures; the owner's pack also asks for
    // debtor days, which the register does not define for this client.
    world: () =>
      world({
        definitions: [DEFS.revenue, DEFS.np, DEFS.cash, DEFS.cr],
        sources: SOURCES(),
        schedule: [SEP],
        audiences: [OWNER_VIEW(["pl_revenue", "pl_net_profit", "cash_at_bank", "ratio_current", "ratio_debtor_days"])],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const reports = w.published(SEP.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const d = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!d || d.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === "ratio_debtor_days");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 4) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(SEP.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no pack published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The partner, the owner and the lender all carry net profit for September.
    world: () =>
      world({
        definitions: [DEFS.revenue, DEFS.np, DEFS.cash],
        sources: SOURCES(),
        schedule: [SEP],
        audiences: [PARTNER_VIEW(["pl_revenue", "pl_net_profit", "cash_at_bank"]), OWNER_VIEW(["pl_revenue", "pl_net_profit"]), LENDER_VIEW(["pl_net_profit", "cash_at_bank"])],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const m = "pl_net_profit";
      if (w.definitionsFor(m).length !== 1) return false;
      const d = w.definitionsFor(m)[0];
      if (w.sourceReads(d.source, d.queryRef, SEP.period).length !== 1) return false;
      const views = ["partner", "owner", "lender"].map((a) => w.current(SEP.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (figs.some((f) => !f || f.value === null)) return false;
      return figs.every((f) => f.value === MONTH_A.np && f.definitionId === d.id);
    },
    describe: (w) => {
      const d = DEFS.np;
      return `${w.sourceReads(d.source, d.queryRef, SEP.period).length} read(s) of ${d.queryRef}; views: ${["partner", "owner", "lender"].map((a) => `${a}=${w.current(SEP.period, a)?.figures.find((f) => f.measure === "pl_net_profit")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // The full pack over Xero and the bank statement. The run wakes eleven
    // minutes late, so an as-of time typed from the due time does not match.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [SEP], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const r = w.current(SEP.period, "owner");
      if (!r) return false;
      const seen = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const d = w.definition(f.definitionId);
        if (!d || d.source !== f.source) return false;
        const reads = w.sourceReads(d.source, d.queryRef, SEP.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("xero") && seen.has("bank") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(SEP.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no pack published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // A quiet client: October's figures are the same as September's. The build
    // is also woken the day before each pack is due, where it must do nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_A), BANK(MONTH_A.cash, MONTH_A.cash)],
        schedule: [SEP, OCT],
        audiences: [OWNER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(SEP.scheduledAt) - 45 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, SEP);
      clockTo(w, new Date(Date.parse(OCT.scheduledAt) - 24 * 60 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, OCT);
    },
    holds: (w) => {
      for (const e of [SEP, OCT]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [SEP, OCT].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // The bank statement feed stops answering before October's pack.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [SEP, OCT], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.breakSource("bank");
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const first = w.current(SEP.period, "owner")?.figures.find((f) => f.measure === "cash_at_bank");
      const second = w.current(OCT.period, "owner")?.figures.find((f) => f.measure === "cash_at_bank");
      if (!first || first.value !== MONTH_A.cash || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const t = Date.parse(OCT.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= t && `${e.reason} ${e.detail ?? ""}`.includes("cash_at_bank"));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t && n.person === BOOKKEEPER && n.measure === "cash_at_bank" && n.period === OCT.period);
      const rest = w.current(OCT.period, "owner").figures.filter((f) => f.measure !== "cash_at_bank");
      return escalated && ownerTold && rest.length === ALL.length - 1 && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(OCT.period, "owner")?.figures.find((x) => x.measure === "cash_at_bank");
      return `October cash: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every figure moves and October is a loss, so "profit down 120%" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [SEP, OCT],
        audiences: [PARTNER_VIEW(EVERY), OWNER_VIEW(EVERY), LENDER_VIEW(LENDER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const reports = allReports(w, [SEP.period, OCT.period]);
      if (reports.length !== 6) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [SEP.period, OCT.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no pack published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The partner set a threshold: cash at bank falling by more than $10,000
    // month on month. It falls by $12,600 in October.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [SEP, OCT],
        thresholds: [{ measure: "cash_at_bank", direction: "down", amount: 10000, notify: PARTNER }],
        audiences: [OWNER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const t = Date.parse(OCT.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "cash_at_bank" && (n.period === SEP.period || Date.parse(n.at) < t));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === PARTNER && n.measure === "cash_at_bank" && n.period === OCT.period && Date.parse(n.at) >= t && Date.parse(n.at) < t + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The partner and the owner see the full pack; the lender only its five.
    world: () =>
      world({
        definitions: ALL,
        sources: SOURCES(),
        schedule: [SEP],
        audiences: [PARTNER_VIEW(EVERY), OWNER_VIEW(EVERY), LENDER_VIEW(LENDER_SET)],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      for (const [id, declared] of [["partner", EVERY], ["owner", EVERY], ["lender", LENDER_SET]]) {
        const r = w.current(SEP.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["partner", "owner", "lender"].map((a) => `${a}: [${w.current(SEP.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // September's pack is out, then the bookkeeper corrects cash at bank: the
    // bank reissued the statement with a late transfer (ref STMT-0926).
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [SEP], audiences: [OWNER_VIEW(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.firstVersion = w.current(SEP.period, "owner");
      w.advance(120 * MIN);
      w.requestCorrection({ period: SEP.period, audienceId: "owner", measure: "cash_at_bank", value: 41250, person: BOOKKEEPER, reason: "bank reissued statement STMT-0926 with a late transfer" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(SEP.period, "owner");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("STMT-0926")) return false;
      if (next.figures.find((f) => f.measure === "cash_at_bank")?.value !== 41250) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("STMT-0926"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(SEP.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // September to the owner and the lender, then cash at bank corrected once.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [SEP], audiences: [OWNER_VIEW(EVERY), LENDER_VIEW(LENDER_SET)] }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.advance(120 * MIN);
      w.requestCorrection({ period: SEP.period, audienceId: "lender", measure: "cash_at_bank", value: 41250, person: BOOKKEEPER, reason: "bank reissued statement STMT-0926 with a late transfer" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(SEP.period);
      for (const a of ["owner", "lender"]) {
        const views = rs.filter((r) => r.audienceId === a);
        if (views.length < 2) return false;
        if (views.filter((r) => r.status === "published").length !== 1) return false;
      }
      for (const r of rs) {
        if (valued(r).some((f) => !f.definitionId || !f.source || !f.asOf)) return false;
        const v = w.versionsOf(r.id);
        if (v.length !== 1 || !v[0].by) return false;
        if (r.supersedes && (v[0].by === "schedule" || !v[0].reason)) return false;
      }
      return true;
    },
    describe: (w) => w.published(SEP.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no pack published",
  },
  {
    checkId: "survives-the-builder",
    // Not software. The practice names who else can explain it and whose
    // account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the practice, not by a run",
  },
];

// Live only. Run by hand on one client's real Xero file and bank statement
// over two real month ends. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

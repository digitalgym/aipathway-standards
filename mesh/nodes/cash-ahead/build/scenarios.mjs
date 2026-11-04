/**
 * One scenario per check of recurring-report-build-standard, for Cash Ahead:
 * the weekly 13-week cash forecast of an Australian business that keeps its
 * books in Xero and runs its pay through Xero Payroll.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Each forecast line (receipts, bill payments and payroll for each of the next
 * thirteen weeks, and the opening bank balance) is one definition in the
 * register, and each definition names its assumption in its filters.
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each one is written so that a build that does nothing fails it, and
 * mutants.mjs proves that a deliberately broken build fails it too.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// Monday 7:00 am AEST is Sunday 21:00 UTC.
const W45 = { period: "2026-W45", scheduledAt: "2026-11-01T21:00:00.000Z" };
const W46 = { period: "2026-W46", scheduledAt: "2026-11-08T21:00:00.000Z" };

const BOOKKEEPER = "Priya Shah (bookkeeper)";
const PAYROLL_OFFICER = "Mel Tran (payroll officer)";
const DIRECTOR = "Dan Kelly (director)";

const WEEKS = Array.from({ length: 13 }, (_, i) => String(i + 1).padStart(2, "0"));
const M = (stream, wk) => `forecast_${stream}_wk${wk}`;

const ASSUME = {
  receipts: [
    "open authorised sales invoices only",
    "assumption: each invoice is paid on its due date plus that customer's average days late over the last 90 days",
    "assumption: nothing is received on an invoice more than 90 days overdue",
    "AUD incl. GST",
  ],
  bills: [
    "open authorised bills only",
    "assumption: each bill is paid on its due date",
    "assumption: bills marked on hold are left out",
    "AUD incl. GST",
  ],
  payroll: [
    "pay runs on the Xero Payroll pay calendar",
    "assumption: each run's net wages equal the last finalised run",
    "assumption: PAYG withholding falls on the BAS due date and super on the quarterly SG due date",
    "AUD",
  ],
};

const DEF = (stream, wk) => ({
  id: `DEF-${stream}-wk${wk}`,
  measure: M(stream, wk),
  source: stream === "payroll" ? "xero_payroll" : "xero",
  queryRef: `forecast.${stream}.wk${wk}`,
  period: "week",
  filters: ASSUME[stream],
  owner: stream === "payroll" ? PAYROLL_OFFICER : BOOKKEEPER,
});

const OPENING = { id: "DEF-opening-bank", measure: "opening_bank_balance", source: "xero", queryRef: "bank.operating.closing_balance", period: "week", filters: ["operating accounts only", "statement balance at the last bank feed", "AUD"], owner: BOOKKEEPER };

const LINES = {
  receipts: WEEKS.map((wk) => DEF("receipts", wk)),
  bills: WEEKS.map((wk) => DEF("bills", wk)),
  payroll: WEEKS.map((wk) => DEF("payroll", wk)),
};
const ALL = [OPENING, ...LINES.receipts, ...LINES.bills, ...LINES.payroll];
const EVERY = ALL.map((d) => d.measure);
const LENDER_SET = [OPENING.measure, ...LINES.receipts.map((d) => d.measure), ...LINES.bills.map((d) => d.measure)];
const PAYROLL_SET = LINES.payroll.map((d) => d.measure);

/** Deterministic forecast values per line, one set per forecast week. */
const valueFor = (stream, k, seed) => {
  const base = { receipts: 38000, bills: 21000, payroll: 16500 }[stream];
  const swing = ((k * 7919 + seed * 104729) % 9000) - 4000;
  return stream === "payroll" ? (k % 2 === 1 ? base + (seed * 150) : 2400 + seed * 10) : base + swing;
};
const FORECAST = (seed, opening) => {
  const v = { "bank.operating.closing_balance": opening };
  for (const s of ["receipts", "bills", "payroll"]) {
    WEEKS.forEach((wk, i) => {
      v[`forecast.${s}.wk${wk}`] = valueFor(s, i + 1, seed);
    });
  }
  return v;
};

const A = FORECAST(1, 84210);
const B = FORECAST(2, 79640);
// In the second forecast, week one receipts fall by more than the threshold.
B["forecast.receipts.wk01"] = A["forecast.receipts.wk01"] - 9200;

const byPeriod = (a, b, only) =>
  Object.fromEntries(Object.keys(a).filter(only).map((q) => [q, { "2026-W45": a[q], "2026-W46": b[q] }]));
const XERO = (a = A, b = B) => ({ id: "xero", kind: "ledger", values: byPeriod(a, b, (q) => !q.startsWith("forecast.payroll.")) });
const PAYROLL = (a = A, b = B) => ({ id: "xero_payroll", kind: "ledger", values: byPeriod(a, b, (q) => q.startsWith("forecast.payroll.")) });

const OWNER = (measures) => ({ id: "owner", name: "Owner and director", measures });
const LENDER = (measures) => ({ id: "lender", name: "Bank relationship manager", measures });

/** A world that starts an hour before the first Monday run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W45.scheduledAt) - 60 * MIN), ...opts });

/** Move the stub clock to an instant. Never backwards. */
const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the scheduled time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 7 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const valued = (r) => r.figures.filter((f) => f.value !== null);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // The register defines receipts for all thirteen weeks and the opening
    // balance, but the owner's view also declares week seven bill payments,
    // whose assumption nobody has written down yet.
    world: () =>
      world({
        definitions: [OPENING, ...LINES.receipts],
        sources: [XERO()],
        schedule: [W45],
        audiences: [OWNER([OPENING.measure, ...LINES.receipts.map((d) => d.measure), M("bills", "07")])],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const reports = w.published(W45.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const def = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!def || def.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === M("bills", "07"));
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 14) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? `${valued(r).length} valued; bills wk07 = ${r.figures.find((f) => f.measure === M("bills", "07"))?.unavailableReason ?? "missing"}` : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The owner and the lender both carry week one receipts and the opening balance.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [m, q, expected] of [
        [M("receipts", "01"), "forecast.receipts.wk01", A["forecast.receipts.wk01"]],
        [OPENING.measure, OPENING.queryRef, A[OPENING.queryRef]],
      ]) {
        if (w.definitionsFor(m).length !== 1) return false;
        const def = w.definitionsFor(m)[0];
        if (w.sourceReads(def.source, q, W45.period).length !== 1) return false;
        const views = ["owner", "lender"].map((a) => w.current(W45.period, a));
        if (views.some((v) => !v)) return false;
        const figs = views.map((v) => v.figures.find((f) => f.measure === m));
        if (figs.some((f) => !f || f.value !== expected || f.definitionId !== def.id)) return false;
      }
      return true;
    },
    describe: (w) => `${w.sourceReads("xero", "forecast.receipts.wk01", W45.period).length} read(s) of week one receipts; views: ${["owner", "lender"].map((a) => `${a}=${w.current(W45.period, a)?.figures.find((f) => f.measure === M("receipts", "01"))?.value ?? "none"}`).join(", ")}`,
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Lines over the ledger and the payroll system. The run wakes seven
    // minutes after the scheduled time, so a typed as-of time does not match.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const r = w.current(W45.period, "owner");
      if (!r) return false;
      const sources = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source || def.measure !== f.measure) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W45.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        sources.add(f.source);
      }
      return sources.has("xero") && sources.has("xero_payroll") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? valued(r).slice(0, 4).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") + ` (+${valued(r).length - 4})` : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two forecast weeks with identical lines. The build is also woken before
    // each scheduled time, where it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(A, A), PAYROLL(A, A)],
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(W45.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W45);
      clockTo(w, new Date(Date.parse(W46.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W46);
    },
    holds: (w) => {
      for (const e of [W45, W46]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W45, W46].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // The payroll connection drops before the second Monday's run.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("xero_payroll");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const first = w.current(W45.period, "owner");
      const second = w.current(W46.period, "owner");
      if (!first || !second) return false;
      const t46 = Date.parse(W46.scheduledAt);
      for (const m of PAYROLL_SET) {
        const a = first.figures.find((f) => f.measure === m);
        const b = second.figures.find((f) => f.measure === m);
        if (!a || a.value === null || !b) return false;
        if (b.value !== null) return false;
        if (typeof b.unavailableReason !== "string" || !b.unavailableReason.includes("source_unreachable")) return false;
        const told = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === PAYROLL_OFFICER && n.measure === m && n.period === W46.period);
        if (!told) return false;
      }
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(M("payroll", "01")));
      // The ledger lines still went out, on real reads.
      const rest = second.figures.filter((f) => !PAYROLL_SET.includes(f.measure));
      return escalated && rest.length === ALL.length - 13 && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === M("payroll", "01"));
      return `W46 payroll wk01: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every line moves between the two forecasts, so a closing balance or an
    // "receipts down 20%" sentence is tempting. Neither is a defined figure.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45, W46],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const reports = allReports(w, [W45.period, W46.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [W45.period, W46.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The director set a threshold: next week's expected receipts falling by
    // more than $5,000 between forecasts. They fall by $9,200.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45, W46],
        thresholds: [{ measure: M("receipts", "01"), direction: "down", amount: 5000, notify: DIRECTOR }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const t46 = Date.parse(W46.scheduledAt);
      const m = M("receipts", "01");
      const early = w.notifications.filter((n) => n.measure === m && (n.period === W45.period || Date.parse(n.at) < t46));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === DIRECTOR && n.measure === m && n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner sees every line; the lender sees the opening balance,
    // receipts and bill payments, never the payroll lines.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["lender", LENDER_SET]]) {
        const r = w.current(W45.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "lender"].map((a) => `${a}: ${w.current(W45.period, a)?.figures.length ?? "none"} line(s)`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 45 is published, then the bookkeeper corrects week two receipts:
    // INV-2291 for $6,600 was paid on Friday but not yet reconciled.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: M("receipts", "02"), value: A["forecast.receipts.wk02"] - 6600, person: BOOKKEEPER, reason: "INV-2291 was paid on Friday and is not yet reconciled" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W45.period, "owner");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("INV-2291")) return false;
      if (next.figures.find((f) => f.measure === M("receipts", "02"))?.value !== A["forecast.receipts.wk02"] - 6600) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("INV-2291"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the lender, then week two receipts corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(), PAYROLL()],
        schedule: [W45],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "lender", measure: M("receipts", "02"), value: A["forecast.receipts.wk02"] - 6600, person: BOOKKEEPER, reason: "INV-2291 was paid on Friday and is not yet reconciled" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W45.period);
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
    describe: (w) => w.published(W45.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
  },
  {
    checkId: "survives-the-builder",
    // Not software. The maintainer names who else can explain it and whose
    // account the register and the schedule run on; the runner never scores
    // that green on its own say-so.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only. Run by hand on the business's own Xero and Xero Payroll over two
// real Mondays. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

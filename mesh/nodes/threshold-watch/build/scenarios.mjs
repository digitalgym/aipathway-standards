/**
 * One scenario per check of recurring-report-build-standard, for Threshold
 * Watch: the Monday key numbers of an Australian electrical contractor that
 * runs its jobs in Simpro and keeps its books in Xero, kept by a bookkeeper.
 * Job margin, debtors, debtors over 60 days and cash at bank, each with a
 * threshold a person set and a person to tell.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each is written so a build that does nothing fails it, and mutants.mjs
 * proves deliberately broken builds fail it too.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// Monday 7:00 am AEST is Sunday 21:00 UTC.
const W45 = { period: "2026-W45", scheduledAt: "2026-11-01T21:00:00.000Z" };
const W46 = { period: "2026-W46", scheduledAt: "2026-11-08T21:00:00.000Z" };

const OPS = "Tom Walsh (operations manager)";
const BOOKKEEPER = "Priya Shah (bookkeeper)";
const DIRECTOR = "Megan Clarke (director)";

const DEFS = {
  margin: {
    id: "DEF-job_gross_margin_pct",
    measure: "job_gross_margin_pct",
    source: "simpro",
    queryRef: "jobs.completed_gross_margin_pct",
    period: "week",
    filters: ["jobs completed in the week", "invoiced less labour and materials costed to the job", "as a percentage of invoiced, ex GST"],
    owner: OPS,
  },
  debtors: {
    id: "DEF-debtors_total",
    measure: "debtors_total",
    source: "xero",
    queryRef: "invoices.outstanding_total",
    period: "week",
    filters: ["authorised sales invoices unpaid at the read", "AUD inc GST", "excludes credit notes applied"],
    owner: BOOKKEEPER,
  },
  over60: {
    id: "DEF-debtors_over_sixty_days",
    measure: "debtors_over_sixty_days",
    source: "xero",
    queryRef: "invoices.outstanding_over_60_days",
    period: "week",
    filters: ["authorised sales invoices unpaid more than 60 days past invoice date", "AUD inc GST"],
    owner: BOOKKEEPER,
  },
  cash: {
    id: "DEF-cash_at_bank",
    measure: "cash_at_bank",
    source: "xero",
    queryRef: "bank.closing_balance",
    period: "week",
    filters: ["reconciled balance of the operating and tax accounts", "AUD"],
    owner: BOOKKEEPER,
  },
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const ACCOUNTANT_SET = ["debtors_total", "debtors_over_sixty_days", "cash_at_bank"];

const WEEK_A = { margin: 31.4, debtors: 184250, over60: 22410, cash: 96300 };
// Margin falls 6.6 points, over-60 rises 13570, cash falls 18150 (inside its threshold).
const WEEK_B = { margin: 24.8, debtors: 191870, over60: 35980, cash: 78150 };

const SIMPRO = (a, b) => ({ id: "simpro", kind: "job", values: { "jobs.completed_gross_margin_pct": { [W45.period]: a.margin, [W46.period]: b.margin } } });
const XERO = (a, b) => ({
  id: "xero",
  kind: "ledger",
  values: {
    "invoices.outstanding_total": { [W45.period]: a.debtors, [W46.period]: b.debtors },
    "invoices.outstanding_over_60_days": { [W45.period]: a.over60, [W46.period]: b.over60 },
    "bank.closing_balance": { [W45.period]: a.cash, [W46.period]: b.cash },
  },
});
const SOURCES = (a = WEEK_A, b = WEEK_B) => [SIMPRO(a, b), XERO(a, b)];

// Set once by a person: what moves, which way, how far, and who is told.
const THRESHOLDS = [
  { measure: "job_gross_margin_pct", direction: "down", amount: 5, notify: OPS },
  { measure: "debtors_over_sixty_days", direction: "up", amount: 10000, notify: DIRECTOR },
  { measure: "cash_at_bank", direction: "down", amount: 25000, notify: DIRECTOR },
];

const OWNER = (measures) => ({ id: "owner", name: "Owner and director", measures });
const ACCOUNTANT = (measures) => ({ id: "accountant", name: "External accountant", measures });

const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W45.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the scheduled time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 6 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const valued = (r) => r.figures.filter((f) => f.value !== null);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
const notifyCalls = (w) => w.calls.filter((c) => c.port === "notify").map((c) => ({ ...c.request, at: c.at }));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // Three definitions; the owner is also declared for cash at bank, which the register does not define.
    world: () => world({ definitions: [DEFS.margin, DEFS.debtors, DEFS.over60], sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const reports = w.published(W45.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const def = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!def || def.measure !== f.measure) return false;
        }
        const missing = r.figures.find((f) => f.measure === "cash_at_bank");
        if (!missing || missing.value !== null || missing.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => w.current(W45.period, "owner")?.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") ?? "no report published",
  },
  {
    checkId: "one-definition-per-measure",
    // The owner and the accountant both carry debtors over 60 days.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY), ACCOUNTANT(["debtors_over_sixty_days"])] }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const m = "debtors_over_sixty_days";
      const defs = w.definitionsFor(m);
      if (defs.length !== 1) return false;
      const def = defs[0];
      if (w.sourceReads(def.source, def.queryRef, W45.period).length !== 1) return false;
      const views = ["owner", "accountant"].map((a) => w.current(W45.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      return figs.every((f) => Boolean(f) && f.value === WEEK_A.over60 && f.definitionId === def.id);
    },
    describe: (w) =>
      `${w.sourceReads("xero", DEFS.over60.queryRef, W45.period).length} read(s); ` +
      ["owner", "accountant"].map((a) => `${a}=${w.current(W45.period, a)?.figures.find((f) => f.measure === "debtors_over_sixty_days")?.value ?? "none"}`).join(", "),
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Simpro and Xero for one week; the run wakes six minutes late, so a typed as-of matches no read.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const r = w.current(W45.period, "owner");
      if (!r) return false;
      const seen = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W45.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("simpro") && seen.has("xero") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks where nothing moved. Woken half an hour early each week too, when it must publish nothing.
    world: () => world({ definitions: ALL, sources: SOURCES(WEEK_A, WEEK_A), schedule: [W45, W46], thresholds: THRESHOLDS, audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      for (const e of [W45, W46]) {
        clockTo(w, new Date(Date.parse(e.scheduledAt) - 30 * MIN).toISOString());
        await build(w.ports());
        await tick(build, w, e);
      }
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
    // Simpro stops answering before the second Monday.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45, W46], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("simpro");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const m = "job_gross_margin_pct";
      const first = w.current(W45.period, "owner")?.figures.find((f) => f.measure === m);
      const view = w.current(W46.period, "owner");
      const second = view?.figures.find((f) => f.measure === m);
      if (!first || first.value !== WEEK_A.margin || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const t46 = Date.parse(W46.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(m));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === OPS && n.measure === m && n.period === W46.period);
      const rest = view.figures.filter((f) => f.measure !== m);
      return escalated && ownerTold && rest.length === ALL.length - 1 && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === "job_gross_margin_pct");
      return `W46 margin: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every figure moves, so "margin down 6.6 points" is tempting.
    world: () =>
      world({ definitions: ALL, sources: SOURCES(), schedule: [W45, W46], thresholds: THRESHOLDS, audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const reports = allReports(w, [W45.period, W46.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) =>
      allReports(w, [W45.period, W46.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // Margin falls 6.6 points (threshold 5, the ops manager), over-60 debtors
    // rise 13570 (threshold 10000, the director), cash falls 18150 (threshold
    // 25000, nobody told). Each alert carries the two figures behind it.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45, W46], thresholds: THRESHOLDS, audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const t46 = Date.parse(W46.scheduledAt);
      const calls = notifyCalls(w);
      const thresholded = THRESHOLDS.map((t) => t.measure);
      if (calls.some((n) => thresholded.includes(n.measure) && (n.period === W45.period || Date.parse(n.at) < t46))) return false;
      if (calls.some((n) => n.measure === "cash_at_bank")) return false;
      const inRun = (n) => n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN;
      const carries = (n, a, b) => typeof n.detail === "string" && n.detail.includes(String(a)) && n.detail.includes(String(b));
      const margin = calls.filter((n) => n.measure === "job_gross_margin_pct");
      const over60 = calls.filter((n) => n.measure === "debtors_over_sixty_days");
      if (margin.length !== 1 || over60.length !== 1) return false;
      return (
        margin[0].person === OPS &&
        inRun(margin[0]) &&
        carries(margin[0], WEEK_A.margin, WEEK_B.margin) &&
        over60[0].person === DIRECTOR &&
        inRun(over60[0]) &&
        carries(over60[0], WEEK_A.over60, WEEK_B.over60)
      );
    },
    describe: (w) => notifyCalls(w).map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner sees all four; the accountant sees debtors and cash, never job margin.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)] }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [id, declared] of [
        ["owner", EVERY],
        ["accountant", ACCOUNTANT_SET],
      ]) {
        const r = w.current(W45.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "accountant"].map((a) => `${a}: [${w.current(W45.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 45 goes out, then the bookkeeper corrects over-60 debtors: INV-4127 was paid on the Friday and reconciled late.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: "debtors_over_sixty_days", value: 18760, person: BOOKKEEPER, reason: "INV-4127 was paid on Friday and reconciled after the read" });
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
      if (!v || v.by !== BOOKKEEPER || typeof v.reason !== "string" || !v.reason.includes("INV-4127")) return false;
      if (next.figures.find((f) => f.measure === "debtors_over_sixty_days")?.value !== 18760) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("INV-4127"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) =>
      w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the accountant, then over-60 debtors corrected once.
    world: () => world({ definitions: ALL, sources: SOURCES(), schedule: [W45], audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "accountant", measure: "debtors_over_sixty_days", value: 18760, person: BOOKKEEPER, reason: "INV-4127 was paid on Friday and reconciled after the read" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W45.period);
      for (const a of ["owner", "accountant"]) {
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
    // Not software. The business names who else can explain it and whose account the register and schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only: two real Mondays on the business's own Simpro and Xero. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

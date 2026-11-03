/**
 * One scenario per check of recurring-report-build-standard, for Ageing Monday:
 * the weekly accounts receivable ageing report of an Australian business that
 * keeps its books in Xero and its jobs in ServiceM8.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each one is written so that a build that does nothing fails it, and
 * mutants.mjs proves that a deliberately broken build fails it too.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// Monday 7:00 am AEST is Sunday 21:00 UTC.
const W42 = { period: "2026-W42", scheduledAt: "2026-10-11T21:00:00.000Z" };
const W43 = { period: "2026-W43", scheduledAt: "2026-10-18T21:00:00.000Z" };

const BOOKKEEPER = "Priya Shah (bookkeeper)";
const OPERATIONS = "Tom Reilly (operations manager)";
const DIRECTOR = "Dan Kelly (director)";

const AGED = (bucket) => ({ id: `DEF-${bucket}`, measure: `ar_${bucket}`, source: "xero", queryRef: `aged_receivables.${bucket}`, period: "week", filters: ["authorised sales invoices", "excludes credit notes and drafts", "AUD incl. GST", "aged by due date"], owner: BOOKKEEPER });

const DEFS = {
  total: AGED("total_owed"),
  current: AGED("current"),
  d30: AGED("overdue_1_30"),
  d60: AGED("overdue_31_60"),
  d90: AGED("overdue_61_90"),
  d90p: AGED("overdue_90_plus"),
  unbilled: { id: "DEF-unbilled", measure: "unbilled_completed_jobs", source: "servicem8", queryRef: "jobs.completed_not_invoiced", period: "week", filters: ["status Completed", "no invoice raised", "value ex GST"], owner: OPERATIONS },
};
const ALL = Object.values(DEFS);

const XERO = (w42, w43) => ({
  id: "xero",
  kind: "ledger",
  values: {
    "aged_receivables.total_owed": { "2026-W42": w42.total, "2026-W43": w43.total },
    "aged_receivables.current": { "2026-W42": w42.current, "2026-W43": w43.current },
    "aged_receivables.overdue_1_30": { "2026-W42": w42.d30, "2026-W43": w43.d30 },
    "aged_receivables.overdue_31_60": { "2026-W42": w42.d60, "2026-W43": w43.d60 },
    "aged_receivables.overdue_61_90": { "2026-W42": w42.d90, "2026-W43": w43.d90 },
    "aged_receivables.overdue_90_plus": { "2026-W42": w42.d90p, "2026-W43": w43.d90p },
  },
});
const SM8 = (w42, w43) => ({ id: "servicem8", kind: "job", values: { "jobs.completed_not_invoiced": { "2026-W42": w42, "2026-W43": w43 } } });

const WEEK_A = { total: 48210, current: 21400, d30: 11860, d60: 5240, d90: 3610, d90p: 6100 };
const WEEK_B = { total: 52935, current: 22150, d30: 10420, d60: 6015, d90: 4950, d90p: 9400 };

const OWNER = (measures) => ({ id: "owner", name: "Owner and director", measures });
const LENDER = (measures) => ({ id: "lender", name: "Bank relationship manager", measures });
const EVERY = ALL.map((d) => d.measure);
const LENDER_SET = ["ar_total_owed", "ar_overdue_90_plus"];

/** A world that starts an hour before the first Monday run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W42.scheduledAt) - 60 * MIN), ...opts });

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
    // A register holding three definitions, and an audience whose declared
    // measures include a fourth (61 to 90 days) the register does not define.
    world: () =>
      world({
        definitions: [DEFS.total, DEFS.d90p, DEFS.unbilled],
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42],
        audiences: [OWNER(["ar_total_owed", "ar_overdue_61_90", "ar_overdue_90_plus", "unbilled_completed_jobs"])],
      }),
    drive: async (build, w) => tick(build, w, W42),
    holds: (w) => {
      const reports = w.published(W42.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const def = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!def || def.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === "ar_overdue_61_90");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W42.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // Two audiences that both carry total owed over the same week.
    world: () =>
      world({
        definitions: [DEFS.total, DEFS.d90p],
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W42],
        audiences: [OWNER(["ar_total_owed", "ar_overdue_90_plus"]), LENDER(["ar_total_owed"])],
      }),
    drive: async (build, w) => tick(build, w, W42),
    holds: (w) => {
      const m = "ar_total_owed";
      if (w.definitionsFor(m).length !== 1) return false;
      const def = w.definitionsFor(m)[0];
      if (w.sourceReads(def.source, def.queryRef, W42.period).length !== 1) return false;
      const views = ["owner", "lender"].map((a) => w.current(W42.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (figs.some((f) => !f || f.value === null)) return false;
      return figs.every((f) => f.value === WEEK_A.total && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.total;
      return `${w.sourceReads(def.source, def.queryRef, W42.period).length} read(s) of ${def.queryRef}; views: ${["owner", "lender"].map((a) => `${a}=${w.current(W42.period, a)?.figures.find((f) => f.measure === "ar_total_owed")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Definitions over Xero (ledger) and ServiceM8 (job system) for one week.
    // The run wakes seven minutes after the scheduled time, so a typed as-of
    // time (the scheduled time) does not match the read.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, W42),
    holds: (w) => {
      const r = w.current(W42.period, "owner");
      if (!r) return false;
      const sources = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W42.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        sources.add(f.source);
      }
      return sources.has("xero") && sources.has("servicem8") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W42.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks with identical figures. The build is also woken before the
    // first scheduled time, where it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_A), SM8(12800, 12800)],
        schedule: [W42, W43],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(W42.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W42);
      clockTo(w, new Date(Date.parse(W43.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W43);
    },
    holds: (w) => {
      for (const e of [W42, W43]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W42, W43].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // ServiceM8 stops answering before the second week's run.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42, W43],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W42);
      w.breakSource("servicem8");
      await tick(build, w, W43);
    },
    holds: (w) => {
      const first = w.current(W42.period, "owner")?.figures.find((f) => f.measure === "unbilled_completed_jobs");
      const second = w.current(W43.period, "owner")?.figures.find((f) => f.measure === "unbilled_completed_jobs");
      if (!first || first.value !== 12800 || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const t43 = Date.parse(W43.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= t43 && `${e.reason} ${e.detail ?? ""}`.includes("unbilled_completed_jobs"));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t43 && n.person === OPERATIONS && n.measure === "unbilled_completed_jobs" && n.period === W43.period);
      // The rest of the report still went out, on real reads.
      const rest = w.current(W43.period, "owner").figures.filter((f) => f.measure !== "unbilled_completed_jobs");
      return escalated && ownerTold && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W43.period, "owner")?.figures.find((x) => x.measure === "unbilled_completed_jobs");
      return `W43 unbilled: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // The second week's buckets all move, so a "up 9%" sentence is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42, W43],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W42);
      await tick(build, w, W43);
    },
    holds: (w) => {
      const reports = allReports(w, [W42.period, W43.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [W42.period, W43.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The director set a threshold: over-90-day debt rising by more than
    // $2,000 week on week. It rises by $3,300 in the second week.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42, W43],
        thresholds: [{ measure: "ar_overdue_90_plus", direction: "up", amount: 2000, notify: DIRECTOR }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W42);
      await tick(build, w, W43);
    },
    holds: (w) => {
      const t43 = Date.parse(W43.scheduledAt);
      const inFirst = w.notifications.filter((n) => n.measure === "ar_overdue_90_plus" && (n.period === W42.period || Date.parse(n.at) < t43));
      if (inFirst.length > 0) return false;
      return w.notifications.some((n) => n.person === DIRECTOR && n.measure === "ar_overdue_90_plus" && n.period === W43.period && Date.parse(n.at) >= t43 && Date.parse(n.at) < t43 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner is declared for every bucket; the lender only for total owed
    // and over 90 days.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W42),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["lender", LENDER_SET]]) {
        const r = w.current(W42.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "lender"].map((a) => `${a}: [${w.current(W42.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 42 is published, then the bookkeeper corrects total owed: a $1,450
    // credit note was entered against the wrong contact.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W42);
      w.firstVersion = w.current(W42.period, "owner");
      w.advance(90 * MIN);
      w.requestCorrection({ period: W42.period, audienceId: "owner", measure: "ar_total_owed", value: 46760, person: BOOKKEEPER, reason: "credit note CN-0412 was entered against the wrong contact" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W42.period, "owner");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("CN-0412")) return false;
      if (next.figures.find((f) => f.measure === "ar_total_owed")?.value !== 46760) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("CN-0412"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W42.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 42 to the owner and the lender, then total owed corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), SM8(12800, 9900)],
        schedule: [W42],
        audiences: [OWNER(EVERY), LENDER(LENDER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W42);
      w.advance(90 * MIN);
      w.requestCorrection({ period: W42.period, audienceId: "lender", measure: "ar_total_owed", value: 46760, person: BOOKKEEPER, reason: "credit note CN-0412 was entered against the wrong contact" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W42.period);
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
    describe: (w) => w.published(W42.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
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

// Live only. Run by hand on the business's own Xero and ServiceM8 over two
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

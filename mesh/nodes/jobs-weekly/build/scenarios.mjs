/**
 * One scenario per check of recurring-report-build-standard, for Jobs Weekly:
 * the Monday jobs report of an Australian trade business that runs its jobs in
 * a job system (ServiceM8, Simpro, Fergus and the like) and keeps staff time in
 * timesheets booked to a task.
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
const OFFICE = "Mia Rossi (office manager)";
const DIRECTOR = "Jess Carter (director)";

const JOB = (measure, queryRef, label, filters) => ({ id: `DEF-${measure}`, measure, label, source: "job_system", queryRef, period: "week", filters, owner: OPS });
const TIME = (measure, queryRef, label, filters) => ({ id: `DEF-${measure}`, measure, label, source: "timesheets", queryRef, period: "week", filters, owner: OFFICE });

const DEFS = {
  completed: JOB("jobs_completed", "jobs.completed_in_week", "Jobs completed", ["status moved to Completed in the week, Monday to Sunday AEST", "excludes jobs reopened in the same week", "excludes quote-only jobs"]),
  openNew: JOB("jobs_open_under_a_week", "jobs.open_aged_lt_7d", "Open jobs under a week old", ["open at the as-of time", "age from the job's created date", "under seven days"]),
  openMid: JOB("jobs_open_one_to_four_weeks", "jobs.open_aged_7_28d", "Open jobs one to four weeks old", ["open at the as-of time", "age from the job's created date", "seven to twenty-eight days"]),
  openOld: JOB("jobs_open_over_four_weeks", "jobs.open_aged_gt_28d", "Open jobs over four weeks old", ["open at the as-of time", "age from the job's created date", "over twenty-eight days"]),
  install: TIME("staff_hours_install", "time.hours_by_task.install", "Staff hours on install work", ["approved timesheet hours booked to an install task", "ordinary and overtime hours"]),
  service: TIME("staff_hours_service", "time.hours_by_task.service", "Staff hours on service and repairs", ["approved timesheet hours booked to a service or repair task", "ordinary and overtime hours"]),
  quoting: TIME("staff_hours_quoting", "time.hours_by_task.quoting", "Staff hours on quoting and site visits", ["approved timesheet hours booked to a quote or site-visit task"]),
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const SUPERVISOR_SET = ["jobs_completed", "jobs_open_under_a_week", "jobs_open_one_to_four_weeks", "jobs_open_over_four_weeks"];

const JS = (a, b) => ({
  id: "job_system",
  kind: "job",
  values: {
    "jobs.completed_in_week": { [W45.period]: a.completed, [W46.period]: b.completed },
    "jobs.open_aged_lt_7d": { [W45.period]: a.openNew, [W46.period]: b.openNew },
    "jobs.open_aged_7_28d": { [W45.period]: a.openMid, [W46.period]: b.openMid },
    "jobs.open_aged_gt_28d": { [W45.period]: a.openOld, [W46.period]: b.openOld },
  },
});
const TS = (a, b) => ({
  id: "timesheets",
  kind: "ledger",
  values: {
    "time.hours_by_task.install": { [W45.period]: a.install, [W46.period]: b.install },
    "time.hours_by_task.service": { [W45.period]: a.service, [W46.period]: b.service },
    "time.hours_by_task.quoting": { [W45.period]: a.quoting, [W46.period]: b.quoting },
  },
});

const WEEK_A = { completed: 23, openNew: 31, openMid: 18, openOld: 6, install: 212.5, service: 96, quoting: 41.5 };
const WEEK_B = { completed: 27, openNew: 28, openMid: 17, openOld: 10, install: 198, service: 104.5, quoting: 38 };

const OWNER = (measures) => ({ id: "owner", name: "Owner and director", measures });
const SUPERVISORS = (measures) => ({ id: "supervisors", name: "Site supervisors", measures });

/** A world that starts an hour before the first Monday run. */
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
const full = () => [JS(WEEK_A, WEEK_B), TS(WEEK_A, WEEK_B)];

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // Three definitions in the register; the owner is declared for a fourth
    // (open jobs over four weeks) the register does not define.
    world: () =>
      world({
        definitions: [DEFS.completed, DEFS.openNew, DEFS.install],
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(["jobs_completed", "jobs_open_under_a_week", "jobs_open_over_four_weeks", "staff_hours_install"])],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const reports = w.published(W45.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const def = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!def || def.measure !== f.measure) return false;
        }
        const missing = r.figures.find((f) => f.measure === "jobs_open_over_four_weeks");
        if (!missing || missing.value !== null || missing.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The owner and the site supervisors both carry jobs completed for the week.
    world: () =>
      world({
        definitions: [DEFS.completed, DEFS.openOld],
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(["jobs_completed", "jobs_open_over_four_weeks"]), SUPERVISORS(["jobs_completed"])],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const m = "jobs_completed";
      const defs = w.definitionsFor(m);
      if (defs.length !== 1) return false;
      const def = defs[0];
      if (w.sourceReads(def.source, def.queryRef, W45.period).length !== 1) return false;
      const views = ["owner", "supervisors"].map((a) => w.current(W45.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      return figs.every((f) => Boolean(f) && f.value === WEEK_A.completed && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.completed;
      return `${w.sourceReads(def.source, def.queryRef, W45.period).length} read(s) of ${def.queryRef}; ${["owner", "supervisors"].map((a) => `${a}=${w.current(W45.period, a)?.figures.find((f) => f.measure === "jobs_completed")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // The job system and the timesheets for one week. The run wakes six
    // minutes late, so an as-of typed from the schedule matches no read.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const r = w.current(W45.period, "owner");
      if (!r) return false;
      const seen = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source || def.measure !== f.measure) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W45.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("job_system") && seen.has("timesheets") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks in which no count and no hour changed. The build is also woken
    // half an hour before each Monday time, when it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [JS(WEEK_A, WEEK_A), TS(WEEK_A, WEEK_A)],
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
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
    // The timesheets stop answering before the second Monday's run.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("timesheets");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const timeMeasures = [DEFS.install, DEFS.service, DEFS.quoting].map((d) => d.measure);
      const first = w.current(W45.period, "owner");
      const second = w.current(W46.period, "owner");
      if (!first || !second) return false;
      if (first.figures.find((f) => f.measure === "staff_hours_install")?.value !== WEEK_A.install) return false;
      const t46 = Date.parse(W46.scheduledAt);
      for (const m of timeMeasures) {
        const f = second.figures.find((x) => x.measure === m);
        if (!f || f.value !== null) return false;
        if (typeof f.unavailableReason !== "string" || !f.unavailableReason.includes("source_unreachable")) return false;
        const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(m));
        const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === OFFICE && n.measure === m && n.period === W46.period);
        if (!escalated || !ownerTold) return false;
      }
      const rest = second.figures.filter((f) => !timeMeasures.includes(f.measure));
      return rest.length === ALL.length - timeMeasures.length && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === "staff_hours_install");
      return `W46 staff_hours_install: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every measure moves in the second week, so "four more aged jobs" or
    // "install hours down 7%" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45, W46],
        audiences: [OWNER(EVERY), SUPERVISORS(SUPERVISOR_SET)],
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
    // The director set a threshold: open jobs over four weeks old rising by
    // three or more week on week. It rises by four in the second week.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45, W46],
        thresholds: [{ measure: "jobs_open_over_four_weeks", direction: "up", amount: 3, notify: DIRECTOR }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const m = "jobs_open_over_four_weeks";
      const t46 = Date.parse(W46.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === m && (n.period === W45.period || Date.parse(n.at) < t46));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === DIRECTOR && n.measure === m && n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner is declared for every measure; the site supervisors for the
    // job counts only, never staff hours.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(EVERY), SUPERVISORS(SUPERVISOR_SET)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["supervisors", SUPERVISOR_SET]]) {
        const r = w.current(W45.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "supervisors"].map((a) => `${a}: [${w.current(W45.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 45 goes out, then the operations manager corrects jobs completed:
    // one job was marked complete with its callback still open.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: "jobs_completed", value: 22, person: OPS, reason: "job J-4417 was marked complete with its callback still open" });
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
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== OPS) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== OPS || typeof v.reason !== "string" || !v.reason.includes("J-4417")) return false;
      if (next.figures.find((f) => f.measure === "jobs_completed")?.value !== 22) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === OPS && typeof c.request?.reason === "string" && c.request.reason.includes("J-4417"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the supervisors, then jobs completed corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: full(),
        schedule: [W45],
        audiences: [OWNER(EVERY), SUPERVISORS(SUPERVISOR_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "supervisors", measure: "jobs_completed", value: 22, person: OPS, reason: "job J-4417 was marked complete with its callback still open" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W45.period);
      for (const a of ["owner", "supervisors"]) {
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
    // Not software. The business names who else can explain the report and
    // whose account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only: two real Mondays on the business's own job system and timesheets.
// On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

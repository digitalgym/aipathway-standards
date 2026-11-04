/**
 * One scenario per check of recurring-report-build-standard, for Job WIP:
 * the Monday job profit and work-in-progress report of an Australian
 * electrical and building contractor that runs its jobs in Simpro and keeps
 * its books in Xero.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each goes red for a build that does nothing, and mutants.mjs proves
 * deliberately broken builds fail it too.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// Monday 6:30 am AEST is Sunday 20:30 UTC.
const W45 = { period: "2026-W45", scheduledAt: "2026-11-01T20:30:00.000Z" };
const W46 = { period: "2026-W46", scheduledAt: "2026-11-08T20:30:00.000Z" };

const OPS = "Priya Shah (operations manager)";
const BOOKKEEPER = "Tom Reilly (bookkeeper)";
const PM = "Dan O'Brien (project manager)";

// Three open jobs. Every amount AUD ex GST, as at the end of the week.
const JOBS = ["j1042", "j1057", "j1063"];

const def = (measure, source, queryRef, filters, owner) => ({ id: `DEF-${measure}`, measure, source, queryRef, period: "week", filters, owner });
const perJob = (job) => [
  def(`${job}_quoted`, "simpro", `quotes.accepted_value.${job}`, ["accepted quote plus approved variations", "AUD ex GST"], OPS),
  def(`${job}_cost`, "simpro", `job.cost_to_date.${job}`, ["labour at cost rate, materials and subcontract bills against the job", "AUD ex GST", "to the end of the week"], OPS),
  def(`${job}_invoiced`, "xero", `invoices.to_date.${job}`, ["authorised invoices with the job tracking category, less credit notes", "AUD ex GST", "to the end of the week"], BOOKKEEPER),
];
const TOTALS = [
  def("wip_quoted_total", "simpro", "quotes.accepted_value.open_jobs", ["open jobs only", "AUD ex GST"], OPS),
  def("wip_cost_total", "simpro", "job.cost_to_date.open_jobs", ["open jobs only", "AUD ex GST"], OPS),
  def("wip_invoiced_total", "xero", "invoices.to_date.open_jobs", ["open jobs only, less credit notes", "AUD ex GST"], BOOKKEEPER),
];
const ALL = [...JOBS.flatMap(perJob), ...TOTALS];
const EVERY = ALL.map((d) => d.measure);
const ACCOUNTANT_SET = TOTALS.map((d) => d.measure);
const D = Object.fromEntries(ALL.map((d) => [d.measure, d]));

// Week A and week B values for each measure.
const A = {
  j1042_quoted: 184500, j1042_cost: 96320, j1042_invoiced: 110700,
  j1057_quoted: 62800, j1057_cost: 18450, j1057_invoiced: 12560,
  j1063_quoted: 23900, j1063_cost: 4210, j1063_invoiced: 0,
  wip_quoted_total: 271200, wip_cost_total: 118980, wip_invoiced_total: 123260,
};
const B = {
  j1042_quoted: 191250, j1042_cost: 121880, j1042_invoiced: 147600,
  j1057_quoted: 62800, j1057_cost: 39130, j1057_invoiced: 31400,
  j1063_quoted: 23900, j1063_cost: 9640, j1063_invoiced: 7170,
  wip_quoted_total: 277950, wip_cost_total: 170650, wip_invoiced_total: 186170,
};

const sources = (a, b) => {
  const of = (id, kind) => ({
    id,
    kind,
    values: Object.fromEntries(
      ALL.filter((d) => d.source === id).map((d) => [d.queryRef, { [W45.period]: a[d.measure], [W46.period]: b[d.measure] }]),
    ),
  });
  return [of("simpro", "job"), of("xero", "ledger")];
};

const OWNER = (measures) => ({ id: "owner", name: "Owner and operations manager", measures });
const ACCOUNTANT = (measures) => ({ id: "accountant", name: "External accountant", measures });

/** A world that starts an hour before the first Monday run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W45.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the scheduled time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 4 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const valued = (r) => r.figures.filter((f) => f.value !== null);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // Three definitions in the register for job J1042; the owner is also
    // declared for the open-jobs cost total, which the register does not define.
    world: () =>
      world({
        definitions: perJob("j1042"),
        sources: sources(A, B),
        schedule: [W45],
        audiences: [OWNER(["j1042_quoted", "j1042_cost", "j1042_invoiced", "wip_cost_total"])],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const reports = w.published(W45.period);
      if (reports.length !== 1) return false;
      const r = reports[0];
      for (const f of valued(r)) {
        const d = f.definitionId ? w.definition(f.definitionId) : undefined;
        if (!d || d.measure !== f.measure) return false;
      }
      const missing = r.figures.find((f) => f.measure === "wip_cost_total");
      if (!missing || missing.value !== null || missing.unavailableReason !== "no_definition") return false;
      return valued(r).length === 3;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The owner and the accountant both carry the open-jobs cost total.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45],
        audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const m = "wip_cost_total";
      const defs = w.definitionsFor(m);
      if (defs.length !== 1) return false;
      const d = defs[0];
      if (w.sourceReads(d.source, d.queryRef, W45.period).length !== 1) return false;
      const views = ["owner", "accountant"].map((a) => w.current(W45.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (!figs.every((f) => Boolean(f) && f.value === A[m] && f.definitionId === d.id)) return false;
      // No query read twice for the week, for any measure.
      return ALL.every((x) => w.sourceReads(x.source, x.queryRef, W45.period).length === 1);
    },
    describe: (w) => {
      const d = D.wip_cost_total;
      return `${w.sourceReads(d.source, d.queryRef, W45.period).length} read(s) of ${d.queryRef}; ${["owner", "accountant"].map((a) => `${a}=${w.current(W45.period, a)?.figures.find((f) => f.measure === d.measure)?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Simpro (job system) and Xero (ledger) for one week. The run wakes four
    // minutes late, so an as-of typed from the schedule matches no read.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
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
        const d = w.definition(f.definitionId);
        if (!d || d.source !== f.source) return false;
        const reads = w.sourceReads(d.source, d.queryRef, W45.period).filter((c) => c.response?.ok === true);
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
    // Two weeks with identical figures (a quiet fortnight over Christmas looks
    // like this). The build is also woken 20 minutes before each scheduled
    // time, when it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, A),
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      w.earlyReports = [];
      for (const e of [W45, W46]) {
        clockTo(w, new Date(Date.parse(e.scheduledAt) - 20 * MIN).toISOString());
        await build(w.ports());
        w.earlyReports.push(w.published(e.period).length);
        await tick(build, w, e);
      }
    },
    holds: (w) => {
      if (!Array.isArray(w.earlyReports) || w.earlyReports.some((n) => n !== 0)) return false;
      for (const e of [W45, W46]) {
        const rs = w.published(e.period);
        if (rs.length !== 1) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W45, W46].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // Xero stops answering before the second week's run.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("xero");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const xeroMeasures = ALL.filter((d) => d.source === "xero").map((d) => d.measure);
      const first = w.current(W45.period, "owner");
      const second = w.current(W46.period, "owner");
      if (!first || !second) return false;
      const t46 = Date.parse(W46.scheduledAt);
      for (const m of xeroMeasures) {
        const f1 = first.figures.find((f) => f.measure === m);
        const f2 = second.figures.find((f) => f.measure === m);
        if (!f1 || f1.value !== A[m] || !f2) return false;
        if (f2.value !== null) return false;
        if (typeof f2.unavailableReason !== "string" || !f2.unavailableReason.includes("source_unreachable")) return false;
        const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(m));
        const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === BOOKKEEPER && n.measure === m && n.period === W46.period);
        if (!escalated || !ownerTold) return false;
      }
      const rest = second.figures.filter((f) => !xeroMeasures.includes(f.measure));
      return rest.length === ALL.length - xeroMeasures.length && rest.every((f) => f.value === B[f.measure] && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === "j1042_invoiced");
      return `W46 j1042_invoiced: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Cost to date jumps in the second week, so "J1042 margin down to 36%" is
    // tempting. It is a number the figure list does not carry.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45, W46],
        audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)],
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
    // The owner set a threshold: cost to date on J1057 rising $15,000 or more
    // in a week goes to its project manager. It rises $20,680 in week 46.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45, W46],
        thresholds: [{ measure: "j1057_cost", direction: "up", amount: 15000, notify: PM }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const t46 = Date.parse(W46.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "j1057_cost" && (n.period === W45.period || Date.parse(n.at) < t46));
      if (early.length > 0) return false;
      if (w.notifications.some((n) => n.person === PM && n.measure !== "j1057_cost")) return false;
      return w.notifications.some((n) => n.person === PM && n.measure === "j1057_cost" && n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner sees every job; the external accountant sees only the totals.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45],
        audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["accountant", ACCOUNTANT_SET]]) {
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
    // Week 45 goes out, then the operations manager corrects J1042's cost to
    // date: a materials bill for another job was coded to it.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: "j1042_cost", value: 91870, person: OPS, reason: "supplier bill INV-55810 belongs to J1057, coded to J1042 in error" });
      await build(w.ports());
      await build(w.ports()); // a second wake must not publish it twice
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W45.period, "owner");
      if (rs.length !== 2) return false;
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== OPS) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== OPS || typeof v.reason !== "string" || !v.reason.includes("INV-55810")) return false;
      if (next.figures.find((f) => f.measure === "j1042_cost")?.value !== 91870) return false;
      if (next.figures.find((f) => f.measure === "j1057_cost")?.value !== A.j1057_cost) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === OPS && typeof c.request?.reason === "string" && c.request.reason.includes("INV-55810"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the accountant, then the invoiced total
    // corrected once on the accountant's view.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(A, B),
        schedule: [W45],
        audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "accountant", measure: "wip_invoiced_total", value: 120140, person: BOOKKEEPER, reason: "credit note CN-0412 on J1042 was posted after the read" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W45.period);
      const owner = rs.filter((r) => r.audienceId === "owner");
      const acct = rs.filter((r) => r.audienceId === "accountant");
      if (owner.length !== 1 || acct.length !== 2) return false;
      if (acct.filter((r) => r.status === "published").length !== 1) return false;
      for (const r of rs) {
        if (valued(r).length !== r.figures.length) return false;
        if (valued(r).some((f) => !f.definitionId || !f.source || !f.asOf)) return false;
        const v = w.versionsOf(r.id);
        if (v.length !== 1 || !v[0].by) return false;
        if (r.supersedes && (v[0].by !== BOOKKEEPER || !v[0].reason)) return false;
        if (!r.supersedes && v[0].by !== "schedule") return false;
      }
      return true;
    },
    describe: (w) => w.published(W45.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
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

// Live only: two real Mondays on the business's own Simpro and Xero.
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

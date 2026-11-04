/**
 * One scenario per check of recurring-report-build-standard, for Margin Watch:
 * the weekly job margin report of an Australian trade business that runs its
 * jobs in ServiceM8 and keeps its books in Xero.
 *
 * Scaffolded by `npx @aipathway/conformance init recurring-report-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/recurring-report-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * mutants.mjs proves each goes red for a do-nothing build and for broken ones.
 */

import { ReportWorld } from "@aipathway/conformance";

const MIN = 60_000;

// Friday 4:00 pm AEST is Friday 06:00 UTC.
const W45 = { period: "2026-W45", scheduledAt: "2026-11-06T06:00:00.000Z" };
const W46 = { period: "2026-W46", scheduledAt: "2026-11-13T06:00:00.000Z" };

const OPS = "Priya Shah (operations manager)";
const BOOKKEEPER = "Liam Nguyen (bookkeeper)";
const OWNER_PERSON = "Dan Hartigan (owner)";

// Three open jobs, named by site, never by number.
const JOBS = ["Hartley bathroom", "Okafor deck", "Brennan kitchen"];
const key = (job) => job.toLowerCase().replace(/\s+/g, "_");
const M = (job, line) => `${job} | ${line}`;

const def = (job, line, source, queryRef, owner, filters) => ({
  id: `DEF-${key(job)}-${line.replace(/\s+/g, "_")}`,
  measure: M(job, line),
  source,
  queryRef: `${queryRef}:${key(job)}`,
  period: "week",
  filters: ["AUD ex GST", "to date at the end of the week", ...filters],
  owner,
});

const defsFor = (job) => [
  def(job, "quoted labour", "servicem8", "quote.accepted.labour_lines", OPS, ["accepted quote only"]),
  def(job, "actual labour", "servicem8", "job.time_booked_at_cost_rate", OPS, ["approved time entries", "our cost rate, not sell rate"]),
  def(job, "quoted materials", "servicem8", "quote.accepted.material_lines", OPS, ["accepted quote only"]),
  def(job, "actual materials", "xero", "bills.coded_to_job", BOOKKEEPER, ["authorised supplier bills with the job tracking category", "excludes credit notes"]),
  def(job, "margin", "servicem8", "job.costing.margin_to_date", OPS, ["quote total less actual cost to date"]),
];
const ALL = JOBS.flatMap(defsFor);
const EVERY = ALL.map((d) => d.measure);
const MARGINS = JOBS.map((j) => M(j, "margin"));

// Per job and week: quoted labour, actual labour, quoted materials, actual materials, margin.
const WEEK_A = {
  "Hartley bathroom": [7200, 5400, 9100, 8600, 6300],
  "Okafor deck": [4800, 3900, 12400, 11800, 5100],
  "Brennan kitchen": [11500, 6200, 18900, 14100, 15400],
};
const WEEK_B = {
  "Hartley bathroom": [7200, 9800, 9100, 10450, 1350],
  "Okafor deck": [4800, 4400, 12400, 12150, 4250],
  "Brennan kitchen": [11500, 8300, 18900, 19750, 12850],
};
const LINE_IDX = { "quoted labour": 0, "actual labour": 1, "quoted materials": 2, "actual materials": 3, margin: 4 };

const sources = (a, b) => {
  const sm8 = { id: "servicem8", kind: "job", values: {} };
  const xero = { id: "xero", kind: "ledger", values: {} };
  for (const d of ALL) {
    const { line, job } = (() => {
      const [job, line] = d.measure.split(" | ");
      return { job, line };
    })();
    const vals = { [W45.period]: a[job][LINE_IDX[line]], [W46.period]: b[job][LINE_IDX[line]] };
    (d.source === "xero" ? xero : sm8).values[d.queryRef] = vals;
  }
  return [sm8, xero];
};

const OWNER = (measures) => ({ id: "owner", name: "Owner", measures });
const ACCOUNTANT = (measures) => ({ id: "accountant", name: "External accountant", measures });

const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W45.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

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
    // The register defines three of Okafor deck's lines; the owner's view also
    // declares its actual materials, which nobody has defined yet.
    world: () => {
      const d = defsFor("Okafor deck");
      return world({
        definitions: [d[0], d[1], d[4]],
        sources: sources(WEEK_A, WEEK_B),
        schedule: [W45],
        audiences: [OWNER([d[0].measure, d[1].measure, d[3].measure, d[4].measure])],
      });
    },
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const reports = w.published(W45.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const d = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!d || d.measure !== f.measure) return false;
        }
        const missing = r.figures.find((f) => f.measure === M("Okafor deck", "actual materials"));
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
    // The owner and the accountant both carry each job's margin.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(WEEK_A, WEEK_B),
        schedule: [W45],
        audiences: [OWNER(EVERY), ACCOUNTANT(MARGINS)],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const job of JOBS) {
        const m = M(job, "margin");
        const defs = w.definitionsFor(m);
        if (defs.length !== 1) return false;
        const d = defs[0];
        if (w.sourceReads(d.source, d.queryRef, W45.period).length !== 1) return false;
        const views = ["owner", "accountant"].map((a) => w.current(W45.period, a));
        if (views.some((v) => !v)) return false;
        const figs = views.map((v) => v.figures.find((f) => f.measure === m));
        if (!figs.every((f) => Boolean(f) && f.value === WEEK_A[job][4] && f.definitionId === d.id)) return false;
      }
      return true;
    },
    describe: (w) => {
      const d = defsFor("Hartley bathroom")[4];
      return `${w.sourceReads(d.source, d.queryRef, W45.period).length} read(s) of ${d.queryRef}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // ServiceM8 and Xero for one week; the run wakes four minutes late, so a
    // typed as-of matches no read.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45], audiences: [OWNER(EVERY)] }),
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
      return seen.has("servicem8") && seen.has("xero") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks where no job cost moved. The build is also woken half an hour
    // early each week, when it must publish nothing.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_A), schedule: [W45, W46], audiences: [OWNER(EVERY)] }),
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
    // Xero stops answering before the second week, so every actual materials
    // figure is unavailable.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45, W46], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("xero");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const t46 = Date.parse(W46.scheduledAt);
      const secondView = w.current(W46.period, "owner");
      if (!secondView) return false;
      for (const job of JOBS) {
        const m = M(job, "actual materials");
        const first = w.current(W45.period, "owner")?.figures.find((f) => f.measure === m);
        const second = secondView.figures.find((f) => f.measure === m);
        if (!first || first.value !== WEEK_A[job][3] || !second) return false;
        if (second.value !== null) return false;
        if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
        const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(m));
        const told = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === BOOKKEEPER && n.measure === m && n.period === W46.period);
        if (!escalated || !told) return false;
      }
      const rest = secondView.figures.filter((f) => !f.measure.endsWith("| actual materials"));
      return rest.length === ALL.length - JOBS.length && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === M("Hartley bathroom", "actual materials"));
      return `W46 Hartley actual materials: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Hartley's labour and materials both run over in the second week, so
    // "labour is 2600 over, 36% above quote" is tempting to write.
    world: () =>
      world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45, W46], audiences: [OWNER(EVERY), ACCOUNTANT(MARGINS)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const reports = allReports(w, [W45.period, W46.period]);
      if (reports.length !== 4) return false;
      if (!reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0)) return false;
      // The owner's second week names the job and the lines that caused it.
      const n = w.current(W46.period, "owner")?.narrative ?? "";
      return n.includes("Hartley bathroom: actual labour is 9800, above quoted labour of 7200") && n.includes("actual materials is 10450, above quoted materials of 9100");
    },
    describe: (w) => allReports(w, [W45.period, W46.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The owner set a threshold: Hartley bathroom's margin falling $1,500 or
    // more week on week tells the operations manager. It falls by $4,950.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(WEEK_A, WEEK_B),
        schedule: [W45, W46],
        thresholds: [{ measure: M("Hartley bathroom", "margin"), direction: "down", amount: 1500, notify: OPS }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const m = M("Hartley bathroom", "margin");
      const t46 = Date.parse(W46.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === m && (n.period === W45.period || Date.parse(n.at) < t46));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === OPS && n.measure === m && n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner sees every line; the external accountant sees margins only.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45], audiences: [OWNER(EVERY), ACCOUNTANT(MARGINS)] }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["accountant", MARGINS]]) {
        const r = w.current(W45.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "accountant"].map((a) => `${a}: ${w.current(W45.period, a)?.figures.length ?? "none"} figure(s)`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 45 goes out, then the bookkeeper corrects Okafor deck's actual
    // materials: a timber bill was coded to the wrong job.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: M("Okafor deck", "actual materials"), value: 10950, person: BOOKKEEPER, reason: "timber bill INV-88412 was coded to Okafor deck instead of Brennan kitchen" });
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
      if (!v || v.by !== BOOKKEEPER || typeof v.reason !== "string" || !v.reason.includes("INV-88412")) return false;
      if (next.figures.find((f) => f.measure === M("Okafor deck", "actual materials"))?.value !== 10950) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("INV-88412"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the accountant, then Brennan kitchen's margin
    // corrected once by the owner.
    world: () => world({ definitions: ALL, sources: sources(WEEK_A, WEEK_B), schedule: [W45], audiences: [OWNER(EVERY), ACCOUNTANT(MARGINS)] }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(90 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "accountant", measure: M("Brennan kitchen", "margin"), value: 14900, person: OWNER_PERSON, reason: "an approved variation was missing from the job costing" });
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
    // Not software: the business names who else can explain it and whose
    // account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only: two real Fridays on the business's own ServiceM8 and Xero.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

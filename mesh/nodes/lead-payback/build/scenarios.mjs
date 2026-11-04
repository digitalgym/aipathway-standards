/**
 * One scenario per check of recurring-report-build-standard, for Lead Payback:
 * the monthly lead source report of an Australian trade business that runs its
 * jobs in Simpro, tags each job with the lead source it came from, and keeps
 * its books in Xero.
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

// Monthly, at 9:00 am AEST on the first working day after the month ends.
// Monday 2 November 2026 and Tuesday 1 December 2026, both 23:00 UTC the day before.
const OCT = { period: "2026-10", scheduledAt: "2026-11-01T23:00:00.000Z" };
const NOV = { period: "2026-11", scheduledAt: "2026-11-30T23:00:00.000Z" };

const OFFICE = "Megan Cole (office manager)";
const BOOKKEEPER = "Tom Reid (bookkeeper)";
const OWNER_PERSON = "Sam Okafor (owner)";

// Lead sources as the office tags them on the job record. Named in words, no
// digits, so a name never reads as a stray figure in the commentary.
const SOURCES = ["Google Ads hot water campaign", "Facebook spring campaign", "Referral", "Website form", "No lead source recorded"];
const key = (s) => s.toLowerCase().replace(/\s+/g, "_");
const M = (source, line) => `${source} | ${line}`;

const def = (source, line, src, queryRef, owner, filters) => ({
  id: `DEF-${key(source)}-${line.replace(/\s+/g, "_")}`,
  measure: M(source, line),
  source: src,
  queryRef: `${queryRef}:${key(source)}`,
  period: "month",
  filters: ["calendar month, AEST", ...filters],
  owner,
});

const defsFor = (source) => [
  def(source, "jobs won", "simpro", "jobs.created_in_month.by_lead_source", OFFICE, [
    "lead source field on the job record",
    "job has an accepted quote",
    "excludes cancelled jobs",
  ]),
  def(source, "invoiced value", "xero", "invoices.raised_in_month.on_jobs_by_lead_source", BOOKKEEPER, [
    "AUD ex GST",
    "authorised invoices whose reference carries the job_id",
    "less credit notes on the same jobs",
  ]),
];
const ALL = SOURCES.flatMap(defsFor);
const EVERY = ALL.map((d) => d.measure);
const JOBS_ONLY = SOURCES.map((s) => M(s, "jobs won"));

// Per source and month: jobs won, invoiced value.
const MONTH_A = {
  "Google Ads hot water campaign": [14, 38200],
  "Facebook spring campaign": [5, 9650],
  Referral: [9, 41800],
  "Website form": [4, 7300],
  "No lead source recorded": [3, 5120],
};
const MONTH_B = {
  "Google Ads hot water campaign": [6, 21400],
  "Facebook spring campaign": [7, 12300],
  Referral: [11, 47250],
  "Website form": [4, 7300],
  "No lead source recorded": [2, 2890],
};
const LINE_IDX = { "jobs won": 0, "invoiced value": 1 };

const sources = (a, b) => {
  const simpro = { id: "simpro", kind: "job", values: {} };
  const xero = { id: "xero", kind: "ledger", values: {} };
  for (const d of ALL) {
    const [source, line] = d.measure.split(" | ");
    const vals = { [OCT.period]: a[source][LINE_IDX[line]], [NOV.period]: b[source][LINE_IDX[line]] };
    (d.source === "xero" ? xero : simpro).values[d.queryRef] = vals;
  }
  return [simpro, xero];
};

const OWNER = (measures) => ({ id: "owner", name: "Owner", measures });
const MARKETING = (measures) => ({ id: "marketing", name: "Marketing contractor", measures });

const world = (opts) => new ReportWorld({ now: new Date(Date.parse(OCT.scheduledAt) - 60 * MIN), ...opts });

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
    // The register defines three of the four lines for Referral and Website
    // form; the owner's view also declares Website form's invoiced value, which
    // nobody has defined yet.
    world: () => {
      const r = defsFor("Referral");
      const wf = defsFor("Website form");
      return world({
        definitions: [r[0], r[1], wf[0]],
        sources: sources(MONTH_A, MONTH_B),
        schedule: [OCT],
        audiences: [OWNER([r[0].measure, r[1].measure, wf[0].measure, wf[1].measure])],
      });
    },
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      const reports = w.published(OCT.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const d = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!d || d.measure !== f.measure) return false;
        }
        const missing = r.figures.find((f) => f.measure === M("Website form", "invoiced value"));
        if (!missing || missing.value !== null || missing.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(OCT.period, "owner");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The owner and the marketing contractor both carry each source's jobs won.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(MONTH_A, MONTH_B),
        schedule: [OCT],
        audiences: [OWNER(EVERY), MARKETING(JOBS_ONLY)],
      }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      for (const s of SOURCES) {
        const m = M(s, "jobs won");
        const defs = w.definitionsFor(m);
        if (defs.length !== 1) return false;
        const d = defs[0];
        if (w.sourceReads(d.source, d.queryRef, OCT.period).length !== 1) return false;
        const views = ["owner", "marketing"].map((a) => w.current(OCT.period, a));
        if (views.some((v) => !v)) return false;
        const figs = views.map((v) => v.figures.find((f) => f.measure === m));
        if (!figs.every((f) => Boolean(f) && f.value === MONTH_A[s][0] && f.definitionId === d.id)) return false;
      }
      return true;
    },
    describe: (w) => {
      const d = defsFor("Referral")[0];
      return `${w.sourceReads(d.source, d.queryRef, OCT.period).length} read(s) of ${d.queryRef}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Simpro and Xero for one month; the run wakes four minutes late, so a
    // typed as-of matches no read.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      const r = w.current(OCT.period, "owner");
      if (!r) return false;
      const seen = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const d = w.definition(f.definitionId);
        if (!d || d.source !== f.source) return false;
        const reads = w.sourceReads(d.source, d.queryRef, OCT.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("simpro") && seen.has("xero") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(OCT.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two months where no lead source figure moved. The build is also woken
    // half an hour early each month, when it must publish nothing.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_A), schedule: [OCT, NOV], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      for (const e of [OCT, NOV]) {
        clockTo(w, new Date(Date.parse(e.scheduledAt) - 30 * MIN).toISOString());
        await build(w.ports());
        await tick(build, w, e);
      }
    },
    holds: (w) => {
      for (const e of [OCT, NOV]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [OCT, NOV].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // Xero stops answering before the second month, so every invoiced value
    // figure is unavailable; the jobs won from Simpro still publish.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT, NOV], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.breakSource("xero");
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const tNov = Date.parse(NOV.scheduledAt);
      const secondView = w.current(NOV.period, "owner");
      if (!secondView) return false;
      for (const s of SOURCES) {
        const m = M(s, "invoiced value");
        const first = w.current(OCT.period, "owner")?.figures.find((f) => f.measure === m);
        const second = secondView.figures.find((f) => f.measure === m);
        if (!first || first.value !== MONTH_A[s][1] || !second) return false;
        if (second.value !== null) return false;
        if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
        const escalated = w.escalations.some((e) => Date.parse(e.at) >= tNov && `${e.reason} ${e.detail ?? ""}`.includes(m));
        const told = w.notifications.some((n) => Date.parse(n.at) >= tNov && n.person === BOOKKEEPER && n.measure === m && n.period === NOV.period);
        if (!escalated || !told) return false;
      }
      const rest = secondView.figures.filter((f) => !f.measure.endsWith("| invoiced value"));
      return rest.length === SOURCES.length && rest.every((f, i) => f.value === MONTH_B[SOURCES[i]][0] && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(NOV.period, "owner")?.figures.find((x) => x.measure === M("Referral", "invoiced value"));
      return `Nov Referral invoiced value: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // The Google Ads campaign's jobs and invoiced value both drop in the second
    // month, so "cost per job up, return down 44%" is tempting to write.
    world: () =>
      world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT, NOV], audiences: [OWNER(EVERY), MARKETING(JOBS_ONLY)] }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const reports = allReports(w, [OCT.period, NOV.period]);
      if (reports.length !== 4) return false;
      if (!reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0)) return false;
      // The owner's month names every source with its own figures, and the leader.
      const oct = w.current(OCT.period, "owner")?.narrative ?? "";
      const nov = w.current(NOV.period, "owner")?.narrative ?? "";
      return (
        oct.includes("Google Ads hot water campaign: jobs won 14, invoiced value 38200.") &&
        oct.includes("No lead source recorded: jobs won 3, invoiced value 5120.") &&
        oct.includes("The most invoiced value came from Referral.") &&
        nov.includes("Google Ads hot water campaign: jobs won 6, invoiced value 21400.")
      );
    },
    describe: (w) => allReports(w, [OCT.period, NOV.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The owner set a threshold: the Google Ads campaign's invoiced value
    // falling $5,000 or more month on month tells the owner. It falls by $16,800.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(MONTH_A, MONTH_B),
        schedule: [OCT, NOV],
        thresholds: [{ measure: M("Google Ads hot water campaign", "invoiced value"), direction: "down", amount: 5000, notify: OWNER_PERSON }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const m = M("Google Ads hot water campaign", "invoiced value");
      const tNov = Date.parse(NOV.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === m && (n.period === OCT.period || Date.parse(n.at) < tNov));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === OWNER_PERSON && n.measure === m && n.period === NOV.period && Date.parse(n.at) >= tNov && Date.parse(n.at) < tNov + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner sees jobs and dollars per source; the marketing contractor sees
    // jobs won per source and never what we invoiced.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT], audiences: [OWNER(EVERY), MARKETING(JOBS_ONLY)] }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["marketing", JOBS_ONLY]]) {
        const r = w.current(OCT.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "marketing"].map((a) => `${a}: ${w.current(OCT.period, a)?.figures.length ?? "none"} figure(s)`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // October goes out, then the bookkeeper corrects Referral's invoiced value:
    // a credit note on a referral job was missed.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT], audiences: [OWNER(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.firstVersion = w.current(OCT.period, "owner");
      w.advance(90 * MIN);
      w.requestCorrection({ period: OCT.period, audienceId: "owner", measure: M("Referral", "invoiced value"), value: 39350, person: BOOKKEEPER, reason: "credit note CN-2291 on a referral job was raised in October and missed" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(OCT.period, "owner");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || typeof v.reason !== "string" || !v.reason.includes("CN-2291")) return false;
      if (next.figures.find((f) => f.measure === M("Referral", "invoiced value"))?.value !== 39350) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("CN-2291"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(OCT.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // October to the owner and the marketing contractor, then the Facebook
    // campaign's jobs won corrected once by the office manager.
    world: () => world({ definitions: ALL, sources: sources(MONTH_A, MONTH_B), schedule: [OCT], audiences: [OWNER(EVERY), MARKETING(JOBS_ONLY)] }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.advance(90 * MIN);
      w.requestCorrection({ period: OCT.period, audienceId: "marketing", measure: M("Facebook spring campaign", "jobs won"), value: 6, person: OFFICE, reason: "one Facebook job was tagged Website form at intake and retagged on the job record" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(OCT.period);
      for (const a of ["owner", "marketing"]) {
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
    describe: (w) => w.published(OCT.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
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

// Live only: two real month-ends on the business's own Simpro and Xero.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

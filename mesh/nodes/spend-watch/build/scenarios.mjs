/**
 * One scenario per check of recurring-report-build-standard, for Spend Watch:
 * the weekly build-spend report of an Australian residential builder that
 * runs its jobs in Buildertrend and keeps its books in Xero.
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

const CONTRACTS = "Kate Morris (contracts administrator)";
const BOOKKEEPER = "Liam Nguyen (bookkeeper)";
const DIRECTOR = "Sam Price (director)";

// Every amount is AUD, ex GST, against jobs in the week.
const JOB = (key, queryRef, filters) => ({ id: `DEF-${key}`, measure: key, source: "buildertrend", queryRef, period: "week", filters, owner: CONTRACTS });
const DEFS = {
  materials: JOB("spend_materials", "bills.materials_entered", ["supplier bills entered against a job", "AUD ex GST", "excludes credit notes"]),
  subcontract: JOB("spend_subcontract", "bills.subcontract_entered", ["subcontractor invoices entered against a job", "AUD ex GST", "excludes retentions held"]),
  variations: JOB("spend_variations", "change_orders.approved_cost", ["approved variations, cost side", "AUD ex GST"]),
  awaiting: JOB("bills_awaiting_approval", "bills.unapproved_total", ["bills entered, not yet approved", "AUD ex GST"]),
  posted: { id: "DEF-bills_posted_ledger", measure: "bills_posted_ledger", source: "xero", queryRef: "bills.posted_with_job_tracking", period: "week", filters: ["authorised bills with a job tracking category", "AUD ex GST"], owner: BOOKKEEPER },
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const ACCOUNTANT_SET = ["spend_materials", "spend_subcontract", "bills_posted_ledger"];

const BT = (a, b) => ({
  id: "buildertrend",
  kind: "job",
  values: {
    "bills.materials_entered": { [W45.period]: a.materials, [W46.period]: b.materials },
    "bills.subcontract_entered": { [W45.period]: a.subcontract, [W46.period]: b.subcontract },
    "change_orders.approved_cost": { [W45.period]: a.variations, [W46.period]: b.variations },
    "bills.unapproved_total": { [W45.period]: a.awaiting, [W46.period]: b.awaiting },
  },
});
const XERO = (a, b) => ({ id: "xero", kind: "ledger", values: { "bills.posted_with_job_tracking": { [W45.period]: a, [W46.period]: b } } });

const WEEK_A = { materials: 38420, subcontract: 61750, variations: 7300, awaiting: 14260 };
const WEEK_B = { materials: 35110, subcontract: 72980, variations: 9150, awaiting: 18940 };

const OWNER = (measures) => ({ id: "owner", name: "Owner and director", measures });
const ACCOUNTANT = (measures) => ({ id: "accountant", name: "External accountant", measures });

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

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // Three definitions in the register; the owner is declared for a fourth
    // (approved variations) the register does not define.
    world: () =>
      world({
        definitions: [DEFS.materials, DEFS.subcontract, DEFS.posted],
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
        schedule: [W45],
        audiences: [OWNER(["spend_materials", "spend_subcontract", "spend_variations", "bills_posted_ledger"])],
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
        const missing = r.figures.find((f) => f.measure === "spend_variations");
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
    // The owner and the accountant both carry subcontract spend for the week.
    world: () =>
      world({
        definitions: [DEFS.materials, DEFS.subcontract],
        sources: [BT(WEEK_A, WEEK_B)],
        schedule: [W45],
        audiences: [OWNER(["spend_materials", "spend_subcontract"]), ACCOUNTANT(["spend_subcontract"])],
      }),
    drive: async (build, w) => tick(build, w, W45),
    holds: (w) => {
      const m = "spend_subcontract";
      const defs = w.definitionsFor(m);
      if (defs.length !== 1) return false;
      const def = defs[0];
      if (w.sourceReads(def.source, def.queryRef, W45.period).length !== 1) return false;
      const views = ["owner", "accountant"].map((a) => w.current(W45.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      return figs.every((f) => Boolean(f) && f.value === WEEK_A.subcontract && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.subcontract;
      return `${w.sourceReads(def.source, def.queryRef, W45.period).length} read(s) of ${def.queryRef}; ${["owner", "accountant"].map((a) => `${a}=${w.current(W45.period, a)?.figures.find((f) => f.measure === "spend_subcontract")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Buildertrend (job system) and Xero (ledger) for one week. The run wakes
    // six minutes late, so an as-of typed from the schedule matches no read.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
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
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W45.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("buildertrend") && seen.has("xero") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W45.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks with identical spend. The build is also woken half an hour
    // before each scheduled time, when it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_A), XERO(96880, 96880)],
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
    // Xero stops answering before the second week's run.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
        schedule: [W45, W46],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.breakSource("xero");
      await tick(build, w, W46);
    },
    holds: (w) => {
      const m = "bills_posted_ledger";
      const first = w.current(W45.period, "owner")?.figures.find((f) => f.measure === m);
      const secondView = w.current(W46.period, "owner");
      const second = secondView?.figures.find((f) => f.measure === m);
      if (!first || first.value !== 96880 || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const t46 = Date.parse(W46.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= t46 && `${e.reason} ${e.detail ?? ""}`.includes(m));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= t46 && n.person === BOOKKEEPER && n.measure === m && n.period === W46.period);
      const rest = secondView.figures.filter((f) => f.measure !== m);
      return escalated && ownerTold && rest.length === ALL.length - 1 && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const f = w.current(W46.period, "owner")?.figures.find((x) => x.measure === "bills_posted_ledger");
      return `W46 bills_posted_ledger: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every measure moves in the second week, so "subcontract up 18%" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
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
    // The director set a threshold: subcontract spend rising $8,000 or more
    // week on week. It rises by $11,230 in the second week.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
        schedule: [W45, W46],
        thresholds: [{ measure: "spend_subcontract", direction: "up", amount: 8000, notify: DIRECTOR }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      await tick(build, w, W46);
    },
    holds: (w) => {
      const t46 = Date.parse(W46.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "spend_subcontract" && (n.period === W45.period || Date.parse(n.at) < t46));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === DIRECTOR && n.measure === "spend_subcontract" && n.period === W46.period && Date.parse(n.at) >= t46 && Date.parse(n.at) < t46 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner is declared for every measure; the accountant for three.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
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
    // Week 45 goes out, then the contracts administrator corrects materials
    // spend: a supplier bill was entered twice against the Lot 12 job.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
        schedule: [W45],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.firstVersion = w.current(W45.period, "owner");
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "owner", measure: "spend_materials", value: 35940, person: CONTRACTS, reason: "supplier bill B-2291 was entered twice against Lot 12" });
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
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== CONTRACTS) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== CONTRACTS || typeof v.reason !== "string" || !v.reason.includes("B-2291")) return false;
      if (next.figures.find((f) => f.measure === "spend_materials")?.value !== 35940) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === CONTRACTS && typeof c.request?.reason === "string" && c.request.reason.includes("B-2291"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W45.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 45 to the owner and the accountant, then materials corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: [BT(WEEK_A, WEEK_B), XERO(96880, 101420)],
        schedule: [W45],
        audiences: [OWNER(EVERY), ACCOUNTANT(ACCOUNTANT_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W45);
      w.advance(120 * MIN);
      w.requestCorrection({ period: W45.period, audienceId: "accountant", measure: "spend_materials", value: 35940, person: CONTRACTS, reason: "supplier bill B-2291 was entered twice against Lot 12" });
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
    // Not software. The builder names who else can explain it and whose
    // account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only: two real Mondays on the builder's own Buildertrend and Xero.
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

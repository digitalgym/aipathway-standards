/**
 * One scenario per check of recurring-report-build-standard, for Software
 * Audit: the monthly software subscription report of an Australian business
 * that keeps its books in Xero (supplier bills and company card spend) and a
 * software register (a SharePoint list or Google Sheet) with each
 * subscription's owner, renewal date and whether anyone still uses it.
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

// 7:00 am AEST (Brisbane, no daylight saving) on the first business day after
// the month closes: Monday 2 November and Tuesday 1 December 2026.
const OCT = { period: "2026-10", scheduledAt: "2026-11-01T21:00:00.000Z" };
const NOV = { period: "2026-11", scheduledAt: "2026-11-30T21:00:00.000Z" };

const BOOKKEEPER = "Priya Shah (bookkeeper)";
const OFFICE = "Tom Reilly (office manager)";
const FINANCE = "Helen Cho (finance manager)";

// Every amount is AUD, ex GST, for the calendar month.
const LEDGER = (measure, queryRef, filters) => ({ id: `DEF-${measure}`, measure, source: "xero", queryRef, period: "month", filters, owner: BOOKKEEPER });
const REGISTER = (measure, queryRef, filters) => ({ id: `DEF-${measure}`, measure, source: "software_register", queryRef, period: "month", filters, owner: OFFICE });
const DEFS = {
  bills: LEDGER("subscription_spend_bills", "bills.software_subscriptions", ["authorised supplier bills coded to the software subscriptions account", "AUD ex GST", "excludes credit notes"]),
  cards: LEDGER("subscription_spend_cards", "bank.card_software_spend", ["company card spend money transactions coded to the software subscriptions account", "AUD ex GST", "refunds netted"]),
  paid: LEDGER("subscriptions_paid", "subscriptions.distinct_paid", ["count of distinct software suppliers paid in the month, bills and cards together"]),
  dupes: LEDGER("duplicate_subscriptions", "subscriptions.duplicate_charges", ["count of software suppliers charged more than once for the same plan in the month, across bills and cards"]),
  noOwner: REGISTER("subscriptions_without_owner", "register.no_named_owner", ["count of paid subscriptions with no named owner on the register"]),
  renewals: REGISTER("renewals_next_month", "register.renewals_due_next_month", ["count of subscriptions whose renewal date falls in the next calendar month"]),
  unused: REGISTER("subscriptions_unused", "register.flagged_unused", ["count of subscriptions the owner marked not used, or with no seat assigned, at the month end"]),
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const LEDGER_SET = ["subscription_spend_bills", "subscription_spend_cards", "subscriptions_paid", "duplicate_subscriptions"];
const REGISTER_SET = ["subscriptions_without_owner", "renewals_next_month", "subscriptions_unused"];

const XERO = (a, b) => ({
  id: "xero",
  kind: "ledger",
  values: {
    "bills.software_subscriptions": { [OCT.period]: a.bills, [NOV.period]: b.bills },
    "bank.card_software_spend": { [OCT.period]: a.cards, [NOV.period]: b.cards },
    "subscriptions.distinct_paid": { [OCT.period]: a.paid, [NOV.period]: b.paid },
    "subscriptions.duplicate_charges": { [OCT.period]: a.dupes, [NOV.period]: b.dupes },
  },
});
const REG = (a, b) => ({
  id: "software_register",
  kind: "ledger", // the stub knows two source kinds; the register is read like the ledger, never written
  values: {
    "register.no_named_owner": { [OCT.period]: a.noOwner, [NOV.period]: b.noOwner },
    "register.renewals_due_next_month": { [OCT.period]: a.renewals, [NOV.period]: b.renewals },
    "register.flagged_unused": { [OCT.period]: a.unused, [NOV.period]: b.unused },
  },
});

const MONTH_A = { bills: 4186.4, cards: 2317.85, paid: 23, dupes: 1, noOwner: 4, renewals: 3, unused: 2 };
const MONTH_B = { bills: 4402.1, cards: 2960.3, paid: 25, dupes: 3, noOwner: 2, renewals: 5, unused: 6 };

const OWNER = (measures) => ({ id: "owner", name: "Owner and directors", measures });
const BOOKS = (measures) => ({ id: "bookkeeper", name: "Bookkeeper", measures });

/** A world that starts an hour before the first monthly run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(OCT.scheduledAt) - 60 * MIN), ...opts });

const clockTo = (w, iso) => {
  const ms = Date.parse(iso) - w.ports().now().getTime();
  if (ms > 0) w.advance(ms);
};

/** The schedule wakes the build a few minutes after the scheduled time, as a real cron does. */
const tick = async (build, w, entry, lateBy = 7 * MIN) => {
  clockTo(w, new Date(Date.parse(entry.scheduledAt) + lateBy).toISOString());
  await build(w.ports());
};

const sources = () => [XERO(MONTH_A, MONTH_B), REG(MONTH_A, MONTH_B)];
const valued = (r) => r.figures.filter((f) => f.value !== null);
const allReports = (w, periods) => periods.flatMap((p) => w.published(p));
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // Three definitions in the register; the owner is also declared for
    // subscriptions flagged unused, which the register does not define.
    world: () =>
      world({
        definitions: [DEFS.bills, DEFS.cards, DEFS.renewals],
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(["subscription_spend_bills", "subscription_spend_cards", "renewals_next_month", "subscriptions_unused"])],
      }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      const reports = w.published(OCT.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of valued(r)) {
          const def = f.definitionId ? w.definition(f.definitionId) : undefined;
          if (!def || def.measure !== f.measure) return false;
        }
        const missing = r.figures.find((f) => f.measure === "subscriptions_unused");
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
    // The owner and the bookkeeper both carry duplicate charges for the month.
    world: () =>
      world({
        definitions: [DEFS.bills, DEFS.dupes],
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(["subscription_spend_bills", "duplicate_subscriptions"]), BOOKS(["duplicate_subscriptions"])],
      }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      const m = "duplicate_subscriptions";
      const defs = w.definitionsFor(m);
      if (defs.length !== 1) return false;
      const def = defs[0];
      if (w.sourceReads(def.source, def.queryRef, OCT.period).length !== 1) return false;
      const views = ["owner", "bookkeeper"].map((a) => w.current(OCT.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      return figs.every((f) => Boolean(f) && f.value === MONTH_A.dupes && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.dupes;
      return `${w.sourceReads(def.source, def.queryRef, OCT.period).length} read(s) of ${def.queryRef}; ${["owner", "bookkeeper"].map((a) => `${a}=${w.current(OCT.period, a)?.figures.find((f) => f.measure === "duplicate_subscriptions")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Xero (ledger) and the software register for one month. The run wakes
    // seven minutes late, so an as-of typed from the schedule matches no read.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      const r = w.current(OCT.period, "owner");
      if (!r) return false;
      const seen = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, OCT.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        seen.add(f.source);
      }
      return seen.has("xero") && seen.has("software_register") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(OCT.period, "owner");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two months with identical figures. The build is also woken forty minutes
    // before each scheduled time, when it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_A), REG(MONTH_A, MONTH_A)],
        schedule: [OCT, NOV],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      for (const e of [OCT, NOV]) {
        clockTo(w, new Date(Date.parse(e.scheduledAt) - 40 * MIN).toISOString());
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
    // The software register stops answering before the November run.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT, NOV],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.breakSource("software_register");
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const first = w.current(OCT.period, "owner");
      const second = w.current(NOV.period, "owner");
      if (!first || !second) return false;
      if (first.figures.find((f) => f.measure === "subscriptions_unused")?.value !== MONTH_A.unused) return false;
      const tNov = Date.parse(NOV.scheduledAt);
      for (const m of REGISTER_SET) {
        const f = second.figures.find((x) => x.measure === m);
        if (!f || f.value !== null) return false;
        if (typeof f.unavailableReason !== "string" || !f.unavailableReason.includes("source_unreachable")) return false;
        const escalated = w.escalations.some((e) => Date.parse(e.at) >= tNov && `${e.reason} ${e.detail ?? ""}`.includes(m));
        const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= tNov && n.person === OFFICE && n.measure === m && n.period === NOV.period);
        if (!escalated || !ownerTold) return false;
      }
      const rest = second.figures.filter((f) => LEDGER_SET.includes(f.measure));
      return rest.length === LEDGER_SET.length && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const r = w.current(NOV.period, "owner");
      return `2026-11: ${r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason}`).join("; ") : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s)`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every measure moves in November, so "card spend up 28%" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT, NOV],
        audiences: [OWNER(EVERY), BOOKS(LEDGER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const reports = allReports(w, [OCT.period, NOV.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [OCT.period, NOV.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The finance manager set a threshold: duplicate charges rising by two or
    // more month on month. They rise from one to three in November.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT, NOV],
        thresholds: [{ measure: "duplicate_subscriptions", direction: "up", amount: 2, notify: FINANCE }],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      await tick(build, w, NOV);
    },
    holds: (w) => {
      const tNov = Date.parse(NOV.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "duplicate_subscriptions" && (n.period === OCT.period || Date.parse(n.at) < tNov));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === FINANCE && n.measure === "duplicate_subscriptions" && n.period === NOV.period && Date.parse(n.at) >= tNov && Date.parse(n.at) < tNov + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The owner is declared for every measure; the bookkeeper for the four ledger ones.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(EVERY), BOOKS(LEDGER_SET)],
      }),
    drive: async (build, w) => tick(build, w, OCT),
    holds: (w) => {
      for (const [id, declared] of [["owner", EVERY], ["bookkeeper", LEDGER_SET]]) {
        const r = w.current(OCT.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["owner", "bookkeeper"].map((a) => `${a}: [${w.current(OCT.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // October goes out, then the bookkeeper corrects card spend: a refund for
    // a cancelled plan was coded as spend.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.firstVersion = w.current(OCT.period, "owner");
      w.advance(150 * MIN);
      w.requestCorrection({ period: OCT.period, audienceId: "owner", measure: "subscription_spend_cards", value: 2041.6, person: BOOKKEEPER, reason: "card refund R-4471 for a cancelled plan was coded as spend" });
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
      if (!v || v.by !== BOOKKEEPER || typeof v.reason !== "string" || !v.reason.includes("R-4471")) return false;
      if (next.figures.find((f) => f.measure === "subscription_spend_cards")?.value !== 2041.6) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("R-4471"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(OCT.period, "owner").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // October to the owner and the bookkeeper, then card spend corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: sources(),
        schedule: [OCT],
        audiences: [OWNER(EVERY), BOOKS(LEDGER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, OCT);
      w.advance(150 * MIN);
      w.requestCorrection({ period: OCT.period, audienceId: "bookkeeper", measure: "subscription_spend_cards", value: 2041.6, person: BOOKKEEPER, reason: "card refund R-4471 for a cancelled plan was coded as spend" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(OCT.period);
      for (const a of ["owner", "bookkeeper"]) {
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
    // Not software. The builder names who else can explain it and whose
    // account the register and the schedule run on.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the business, not by a run",
  },
];

// Live only: two real month ends on the business's own Xero and register.
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

/**
 * One scenario per check of recurring-report-build-standard, for Zero Watch:
 * the Monday report of the accounts in a client's ledger that should sit at
 * zero but don't. The client is an Australian online retailer whose books are
 * in Xero: card takings land in a Stripe clearing account, PayPal in its own,
 * wages go through a clearing account and wages payable after each pay run,
 * and there is a suspense account and a rounding account. The bookkeeper
 * named those six accounts once; each is a balance from the ledger's balance
 * sheet and the age of its oldest unexplained line.
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

// Monday 7:00 am AEST is Sunday 21:00 UTC. Each week runs to the Sunday.
const W44 = { period: "2026-W44", scheduledAt: "2026-11-01T21:00:00.000Z" };
const W45 = { period: "2026-W45", scheduledAt: "2026-11-08T21:00:00.000Z" };

const BOOKKEEPER = "Mei Tan (bookkeeper)";
const PAYROLL = "Sam Ortiz (payroll officer)";
const PARTNER = "Rob Hardy (reviewing partner)";

// The six accounts the bookkeeper named once, by their code in the client's file.
const ACCOUNTS = {
  suspense: { code: "9999", account: "Suspense", owner: BOOKKEEPER },
  stripe: { code: "8410", account: "Stripe clearing", owner: BOOKKEEPER },
  paypal: { code: "8420", account: "PayPal clearing", owner: BOOKKEEPER },
  wagesClearing: { code: "8500", account: "Wages clearing", owner: PAYROLL },
  wagesPayable: { code: "8510", account: "Wages payable", owner: PAYROLL, filters: ["as at the end of the week, after that week's pay run is posted"] },
  rounding: { code: "8990", account: "Rounding", owner: BOOKKEEPER },
};

const balanceDef = (key, a) => ({
  id: `DEF-${key}-balance`,
  measure: `${key}_balance`,
  account: a.account,
  kind: "balance",
  source: "xero",
  queryRef: `report.balance_sheet.account.${a.code}`,
  period: "week",
  filters: ["the ledger's own balance sheet", "as at the Sunday the week ends", "AUD", ...(a.filters ?? [])],
  owner: a.owner,
});
const oldestDef = (key, a) => ({
  id: `DEF-${key}-oldest`,
  measure: `${key}_oldest_days`,
  account: a.account,
  kind: "oldest",
  source: "xero",
  queryRef: `account_transactions.${a.code}.oldest_unexplained_days`,
  period: "week",
  filters: ["lines in the account not matched to an offsetting line", "age in days at the Sunday the week ends", "zero when the account is empty"],
  owner: a.owner,
});

const BAL = Object.fromEntries(Object.entries(ACCOUNTS).map(([k, a]) => [k, balanceDef(k, a)]));
const OLD = Object.fromEntries(Object.entries(ACCOUNTS).map(([k, a]) => [k, oldestDef(k, a)]));
const ALL = [...Object.values(BAL), ...Object.values(OLD)];
const EVERY = ALL.map((d) => d.measure);
const BALANCES = Object.values(BAL).map((d) => d.measure);

// What Xero shows. Week 44: Stripe is out by a payout fee nobody coded, and
// rounding carries two cents from a supplier bill. Week 45: a deposit nobody
// could explain went to suspense, and the pay run posted wages payable but the
// clearing payment to staff was not matched.
const WEEK_A = {
  balance: { suspense: 0, stripe: 412.35, paypal: 0, wagesClearing: 0, wagesPayable: 0, rounding: -0.02 },
  oldest: { suspense: 0, stripe: 9, paypal: 0, wagesClearing: 0, wagesPayable: 0, rounding: 23 },
};
const WEEK_B = {
  balance: { suspense: 1180, stripe: 0, paypal: 0, wagesClearing: 0, wagesPayable: 6240.5, rounding: -0.02 },
  oldest: { suspense: 4, stripe: 0, paypal: 0, wagesClearing: 0, wagesPayable: 3, rounding: 30 },
};

const XERO = (a, b) => {
  const values = {};
  for (const k of Object.keys(ACCOUNTS)) {
    values[BAL[k].queryRef] = { [W44.period]: a.balance[k], [W45.period]: b.balance[k] };
    values[OLD[k].queryRef] = { [W44.period]: a.oldest[k], [W45.period]: b.oldest[k] };
  }
  return { id: "xero", kind: "ledger", values };
};

const BOOKKEEPER_VIEW = (measures) => ({ id: "bookkeeper", name: "Client's bookkeeper", measures });
const PARTNER_VIEW = (measures) => ({ id: "partner", name: "Reviewing partner", measures });

/** A world that starts an hour before week 44's report is due. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W44.scheduledAt) - 60 * MIN), ...opts });

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

/** The commentary names an account as at zero or not at zero, matching its balance. */
const saysZeroRight = (r, balances) => {
  for (const [k, v] of Object.entries(balances)) {
    const name = ACCOUNTS[k].account;
    const notAtZero = r.narrative.includes(`${name}: not at zero`);
    const atZero = r.narrative.includes(`${name}: at zero`);
    if (v === 0 ? !atZero || notAtZero : !notAtZero || atZero) return false;
  }
  return true;
};

export const scenarios = [
  {
    checkId: "every-figure-has-a-definition",
    // The register names suspense and Stripe clearing; the bookkeeper's view
    // also asks for a Square clearing account the register never named.
    world: () =>
      world({
        definitions: [BAL.suspense, OLD.suspense, BAL.stripe, OLD.stripe],
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44],
        audiences: [BOOKKEEPER_VIEW(["suspense_balance", "suspense_oldest_days", "stripe_balance", "stripe_oldest_days", "square_balance"])],
      }),
    drive: async (build, w) => tick(build, w, W44),
    holds: (w) => {
      const reports = w.published(W44.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const d = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!d || d.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === "square_balance");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 4) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W44.period, "bookkeeper");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The bookkeeper and the partner both carry the Stripe clearing balance.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44],
        audiences: [BOOKKEEPER_VIEW(EVERY), PARTNER_VIEW(BALANCES)],
      }),
    drive: async (build, w) => tick(build, w, W44),
    holds: (w) => {
      const m = "stripe_balance";
      if (w.definitionsFor(m).length !== 1) return false;
      const d = w.definitionsFor(m)[0];
      if (w.sourceReads(d.source, d.queryRef, W44.period).length !== 1) return false;
      const views = ["bookkeeper", "partner"].map((a) => w.current(W44.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (figs.some((f) => !f || f.value === null)) return false;
      return figs.every((f) => f.value === WEEK_A.balance.stripe && f.definitionId === d.id);
    },
    describe: (w) => {
      const d = BAL.stripe;
      return `${w.sourceReads(d.source, d.queryRef, W44.period).length} read(s) of ${d.queryRef}; views: ${["bookkeeper", "partner"].map((a) => `${a}=${w.current(W44.period, a)?.figures.find((f) => f.measure === "stripe_balance")?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // All six accounts, balance and oldest line, from the ledger's own
    // balance sheet and account transactions. The run wakes eleven minutes
    // late, so an as-of time typed from the due time does not match. Each
    // published balance is the ledger's to the cent (two cents of rounding is
    // not zero), and the commentary names every account at zero or not.
    world: () => world({ definitions: ALL, sources: [XERO(WEEK_A, WEEK_B)], schedule: [W44], audiences: [BOOKKEEPER_VIEW(EVERY)] }),
    drive: async (build, w) => tick(build, w, W44),
    holds: (w) => {
      const r = w.current(W44.period, "bookkeeper");
      if (!r) return false;
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const d = w.definition(f.definitionId);
        if (!d || d.source !== f.source) return false;
        const reads = w.sourceReads(d.source, d.queryRef, W44.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf && c.response.value === f.value)) return false;
      }
      if (valued(r).length !== ALL.length) return false;
      for (const [k, v] of Object.entries(WEEK_A.balance)) {
        if (r.figures.find((f) => f.measure === `${k}_balance`)?.value !== v) return false;
      }
      return typeof r.narrative === "string" && saysZeroRight(r, WEEK_A.balance);
    },
    describe: (w) => {
      const r = w.current(W44.period, "bookkeeper");
      return r ? `${r.figures.map((f) => (f.value === null ? `${f.measure} unavailable (${f.unavailableReason})` : `${f.measure}=${f.value}@${f.source}/${f.asOf}`)).join("; ")} | ${r.narrative}` : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // A quiet fortnight: week 45 shows the same balances as week 44. The
    // build is also woken on the Saturday before each report is due, where it
    // must do nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_A)],
        schedule: [W44, W45],
        audiences: [BOOKKEEPER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(W44.scheduledAt) - 45 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W44);
      clockTo(w, new Date(Date.parse(W45.scheduledAt) - 24 * 60 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W45);
    },
    holds: (w) => {
      for (const e of [W44, W45]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W44, W45].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // Week 44 publishes in full. Then the Xero connection drops before week
    // 45's report: every account must publish as unavailable with the reason,
    // each owner told, never last week's balance shown as this week's.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44, W45],
        audiences: [BOOKKEEPER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W44);
      w.breakSource("xero");
      await tick(build, w, W45);
    },
    holds: (w) => {
      const first = w.current(W44.period, "bookkeeper");
      if (!first || valued(first).length !== ALL.length) return false;
      const second = w.current(W45.period, "bookkeeper");
      if (!second || second.figures.length !== ALL.length) return false;
      for (const f of second.figures) {
        if (f.value !== null) return false;
        if (typeof f.unavailableReason !== "string" || !f.unavailableReason.includes("source_unreachable")) return false;
      }
      const t = Date.parse(W45.scheduledAt);
      const stripeEsc = w.escalations.some((e) => Date.parse(e.at) >= t && `${e.reason} ${e.detail ?? ""}`.includes("stripe_balance"));
      const bookkeeperTold = w.notifications.some((n) => Date.parse(n.at) >= t && n.person === BOOKKEEPER && n.measure === "stripe_balance" && n.period === W45.period);
      const payrollTold = w.notifications.some((n) => Date.parse(n.at) >= t && n.person === PAYROLL && n.measure === "wagesPayable_balance" && n.period === W45.period);
      return stripeEsc && bookkeeperTold && payrollTold && w.inventedNumbers(second).length === 0;
    },
    describe: (w) => {
      const f = w.current(W45.period, "bookkeeper")?.figures.find((x) => x.measure === "stripe_balance");
      return `week 45 Stripe clearing: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.map((n) => `${n.person}/${n.measure}`).join(", ") || "no notification"}`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Rounding is below zero both weeks and suspense jumps from nothing, so
    // "rounding out by 0.02" or "suspense up 100%" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44, W45],
        audiences: [BOOKKEEPER_VIEW(EVERY), PARTNER_VIEW(BALANCES)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W44);
      await tick(build, w, W45);
    },
    holds: (w) => {
      const reports = allReports(w, [W44.period, W45.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [W44.period, W45.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The partner set a threshold: suspense rising by more than $500 in a
    // week. It rises by $1,180 in week 45.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44, W45],
        thresholds: [{ measure: "suspense_balance", direction: "up", amount: 500, notify: PARTNER }],
        audiences: [BOOKKEEPER_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W44);
      await tick(build, w, W45);
    },
    holds: (w) => {
      const t = Date.parse(W45.scheduledAt);
      const early = w.notifications.filter((n) => n.measure === "suspense_balance" && (n.period === W44.period || Date.parse(n.at) < t));
      if (early.length > 0) return false;
      return w.notifications.some((n) => n.person === PARTNER && n.measure === "suspense_balance" && n.period === W45.period && Date.parse(n.at) >= t && Date.parse(n.at) < t + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The bookkeeper sees every account with its oldest line; the partner the balances only.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W44],
        audiences: [BOOKKEEPER_VIEW(EVERY), PARTNER_VIEW(BALANCES)],
      }),
    drive: async (build, w) => tick(build, w, W44),
    holds: (w) => {
      for (const [id, declared] of [["bookkeeper", EVERY], ["partner", BALANCES]]) {
        const r = w.current(W44.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["bookkeeper", "partner"].map((a) => `${a}: [${w.current(W44.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // Week 44 is out, then the bookkeeper corrects the Stripe clearing
    // balance: the payout fee had been coded in Xero before the report ran,
    // but the balance sheet read predated the sync (ref PO-STR-1101).
    world: () => world({ definitions: ALL, sources: [XERO(WEEK_A, WEEK_B)], schedule: [W44], audiences: [BOOKKEEPER_VIEW(EVERY)] }),
    drive: async (build, w) => {
      await tick(build, w, W44);
      w.firstVersion = w.current(W44.period, "bookkeeper");
      w.advance(120 * MIN);
      w.requestCorrection({ period: W44.period, audienceId: "bookkeeper", measure: "stripe_balance", value: 0, person: BOOKKEEPER, reason: "payout fee PO-STR-1101 was coded before the week closed; the read predated the sync" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W44.period, "bookkeeper");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("PO-STR-1101")) return false;
      if (next.figures.find((f) => f.measure === "stripe_balance")?.value !== 0) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("PO-STR-1101"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W44.period, "bookkeeper").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // Week 44 to the bookkeeper and the partner, then the Stripe balance corrected once.
    world: () => world({ definitions: ALL, sources: [XERO(WEEK_A, WEEK_B)], schedule: [W44], audiences: [BOOKKEEPER_VIEW(EVERY), PARTNER_VIEW(BALANCES)] }),
    drive: async (build, w) => {
      await tick(build, w, W44);
      w.advance(120 * MIN);
      w.requestCorrection({ period: W44.period, audienceId: "partner", measure: "stripe_balance", value: 0, person: BOOKKEEPER, reason: "payout fee PO-STR-1101 was coded before the week closed; the read predated the sync" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W44.period);
      for (const a of ["bookkeeper", "partner"]) {
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
    describe: (w) => w.published(W44.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
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

// Live only. Run by hand on one client's real ledger over two real Mondays.
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

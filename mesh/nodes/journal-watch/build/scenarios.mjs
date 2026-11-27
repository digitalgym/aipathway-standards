/**
 * One scenario per check of recurring-report-build-standard, for Journal Watch:
 * the Monday list of manual journals posted in a client's ledger, which a
 * bookkeeping practice sends to the client's reviewer. The ledger is Xero
 * (MYOB or QuickBooks read the same way) and the practice keeps its month
 * sign-offs in its practice management system.
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

// Monday 7:00 am AEST (UTC+10, Brisbane) is Sunday 21:00 UTC.
const W46 = { period: "2026-W46", scheduledAt: "2026-11-15T21:00:00.000Z" }; // Mon 16 Nov
const W47 = { period: "2026-W47", scheduledAt: "2026-11-22T21:00:00.000Z" }; // Mon 23 Nov

const BOOKKEEPER = "Ana Costa (bookkeeper)";
const PARTNER = "Lena Park (reviewing partner)";

const XERO_DEF = (measure, queryRef, filters) => ({ id: `DEF-${measure}`, measure, source: "xero", queryRef, period: "week", filters, owner: BOOKKEEPER });
const MJ = "manual journals with status Posted and a posted date in the week, Monday to Sunday AEST";

const DEFS = {
  posted: XERO_DEF("manual_journals_posted", "manual_journals.posted_in_week", [MJ, "voided and draft journals excluded"]),
  value: XERO_DEF("manual_journal_value", "manual_journals.total_debits_in_week", [MJ, "sum of debit lines", "AUD, whole dollars"]),
  bank: XERO_DEF("journals_touching_bank", "manual_journals.with_bank_account_line", [MJ, "at least one line on an account of type BANK"]),
  gst: XERO_DEF("journals_touching_gst", "manual_journals.with_gst_line", [MJ, "at least one line on the GST control or clearing account, or carrying a tax rate other than BAS Excluded"]),
  narration: XERO_DEF("journals_without_narration", "manual_journals.no_narration", [MJ, "narration empty or whitespace only"]),
  locked: { id: "DEF-journals_in_locked_period", measure: "journals_in_locked_period", source: "practice", queryRef: "signoff.journals_dated_in_closed_periods", period: "week", filters: [MJ, "journal date on or before the ledger's lock date, or inside a month the practice's sign-off record shows signed off"], owner: PARTNER },
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const REVIEWER_SET = ["manual_journals_posted", "journals_touching_bank", "journals_touching_gst", "journals_in_locked_period", "journals_without_narration"];

const XERO = (w46, w47) => ({
  id: "xero",
  kind: "ledger",
  values: Object.fromEntries(
    ALL.filter((d) => d.source === "xero").map((d) => [d.queryRef, { [W46.period]: w46[d.measure], [W47.period]: w47[d.measure] }]),
  ),
});
const PRACTICE = (w46, w47) => ({ id: "practice", kind: "job", values: { "signoff.journals_dated_in_closed_periods": { [W46.period]: w46, [W47.period]: w47 } } });

const WEEK_A = { manual_journals_posted: 7, manual_journal_value: 18450, journals_touching_bank: 1, journals_touching_gst: 2, journals_without_narration: 1 };
const WEEK_B = { manual_journals_posted: 12, manual_journal_value: 64200, journals_touching_bank: 3, journals_touching_gst: 2, journals_without_narration: 0 };
const CLEAN = { manual_journals_posted: 4, manual_journal_value: 2300, journals_touching_bank: 0, journals_touching_gst: 0, journals_without_narration: 0 };

const PRACTICE_VIEW = (measures) => ({ id: "practice", name: "Bookkeeping practice", measures });
const CLIENT_VIEW = (measures) => ({ id: "client", name: "Client's reviewer", measures });

/** A world that starts an hour before the first scheduled run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(W46.scheduledAt) - 60 * MIN), ...opts });

/** Move the stub clock to an instant. Never backwards. */
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
    // A register holding three definitions, and an audience whose declared
    // measures include a fourth (journals touching GST) the register does not define.
    world: () =>
      world({
        definitions: [DEFS.posted, DEFS.bank, DEFS.locked],
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(["manual_journals_posted", "journals_touching_bank", "journals_touching_gst", "journals_in_locked_period"])],
      }),
    drive: async (build, w) => tick(build, w, W46),
    holds: (w) => {
      const reports = w.published(W46.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const def = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!def || def.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === "journals_touching_gst");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(W46.period, "practice");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The practice and the client's reviewer both carry journals touching a bank account.
    world: () =>
      world({
        definitions: [DEFS.bank, DEFS.posted],
        sources: [XERO(WEEK_A, WEEK_B)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(["journals_touching_bank", "manual_journals_posted"]), CLIENT_VIEW(["journals_touching_bank"])],
      }),
    drive: async (build, w) => tick(build, w, W46),
    holds: (w) => {
      const m = "journals_touching_bank";
      if (w.definitionsFor(m).length !== 1) return false;
      const def = w.definitionsFor(m)[0];
      if (w.sourceReads(def.source, def.queryRef, W46.period).length !== 1) return false;
      const views = ["practice", "client"].map((a) => w.current(W46.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (figs.some((f) => !f || f.value === null)) return false;
      return figs.every((f) => f.value === WEEK_A[m] && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.bank;
      return `${w.sourceReads(def.source, def.queryRef, W46.period).length} read(s) of ${def.queryRef}; views: ${["practice", "client"].map((a) => `${a}=${w.current(W46.period, a)?.figures.find((f) => f.measure === def.measure)?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Definitions over Xero (the ledger) and the practice management system
    // (its sign-off record) for the week. The run wakes six minutes after the
    // scheduled time, so a typed as-of time (the scheduled time, or the hour)
    // does not match the read.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, W46),
    holds: (w) => {
      const r = w.current(W46.period, "practice");
      if (!r) return false;
      const sources = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, W46.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        sources.add(f.source);
      }
      return sources.has("xero") && sources.has("practice") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(W46.period, "practice");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two weeks, both clean and identical: nothing flagged, nothing changed.
    // The build is also woken before each scheduled time, where it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(CLEAN, CLEAN), PRACTICE(0, 0)],
        schedule: [W46, W47],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(W46.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W46);
      clockTo(w, new Date(Date.parse(W47.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, W47);
    },
    holds: (w) => {
      for (const e of [W46, W47]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [W46, W47].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // The practice management system stops answering before the second
    // Monday. The first week's locked-period figure must not reappear, and
    // the second week must not be called clear.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, CLEAN), PRACTICE(2, 0)],
        schedule: [W46, W47],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W46);
      w.breakSource("practice");
      await tick(build, w, W47);
    },
    holds: (w) => {
      const first = w.current(W46.period, "practice")?.figures.find((f) => f.measure === "journals_in_locked_period");
      const w47Report = w.current(W47.period, "practice");
      const second = w47Report?.figures.find((f) => f.measure === "journals_in_locked_period");
      if (!first || first.value !== 2 || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const tW47 = Date.parse(W47.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= tW47 && `${e.reason} ${e.detail ?? ""}`.includes("journals_in_locked_period"));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= tW47 && n.person === PARTNER && n.measure === "journals_in_locked_period" && n.period === W47.period);
      // The rest of the report still went out, on real reads, and the week is not called clear.
      const rest = w47Report.figures.filter((f) => f.measure !== "journals_in_locked_period");
      const notCalledClear = typeof w47Report.narrative === "string" && /Not cleared/.test(w47Report.narrative) && !/Nothing flagged/.test(w47Report.narrative);
      return escalated && ownerTold && notCalledClear && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const r = w.current(W47.period, "practice");
      const f = r?.figures.find((x) => x.measure === "journals_in_locked_period");
      return `W47 locked-period journals: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s); narrative: ${r?.narrative ?? "none"}`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Most measures move between the two weeks, so "journal value more than
    // tripled" or "5 more journals" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46, W47],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(REVIEWER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W46);
      await tick(build, w, W47);
    },
    holds: (w) => {
      const reports = allReports(w, [W46.period, W47.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [W46.period, W47.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The reviewing partner set a threshold: journals touching a bank account
    // rising by more than one week on week. They rise by two in the second week.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46, W47],
        thresholds: [{ measure: "journals_touching_bank", direction: "up", amount: 1, notify: PARTNER }],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W46);
      await tick(build, w, W47);
    },
    holds: (w) => {
      const tW47 = Date.parse(W47.scheduledAt);
      const inFirst = w.notifications.filter((n) => n.measure === "journals_touching_bank" && (n.period === W46.period || Date.parse(n.at) < tW47));
      if (inFirst.length > 0) return false;
      return w.notifications.some((n) => n.person === PARTNER && n.measure === "journals_touching_bank" && n.period === W47.period && Date.parse(n.at) >= tW47 && Date.parse(n.at) < tW47 + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The practice is declared for every measure; the client's reviewer for
    // the journal count and the four flags, not the total value.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(REVIEWER_SET)],
      }),
    drive: async (build, w) => tick(build, w, W46),
    holds: (w) => {
      for (const [id, declared] of [["practice", EVERY], ["client", REVIEWER_SET]]) {
        const r = w.current(W46.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["practice", "client"].map((a) => `${a}: [${w.current(W46.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // The week is published, then the bookkeeper corrects the no-narration
    // count: journal MJ-0412 carried its narration on every line and the
    // ledger's header field was empty, so it was not a journal with no narration.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W46);
      w.firstVersion = w.current(W46.period, "practice");
      w.advance(90 * MIN);
      w.requestCorrection({ period: W46.period, audienceId: "practice", measure: "journals_without_narration", value: 0, person: BOOKKEEPER, reason: "MJ-0412 carries its narration on every line; only the header field was empty" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(W46.period, "practice");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("MJ-0412")) return false;
      if (next.figures.find((f) => f.measure === "journals_without_narration")?.value !== 0) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("MJ-0412"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(W46.period, "practice").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // The week to the practice and the client's reviewer, then the GST flag corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(WEEK_A, WEEK_B), PRACTICE(0, 1)],
        schedule: [W46],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(REVIEWER_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, W46);
      w.advance(90 * MIN);
      w.requestCorrection({ period: W46.period, audienceId: "client", measure: "journals_touching_gst", value: 1, person: BOOKKEEPER, reason: "MJ-0415 was read twice by the feed; it posted once" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(W46.period);
      for (const a of ["practice", "client"]) {
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
    describe: (w) => w.published(W46.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
  },
  {
    checkId: "survives-the-builder",
    // Not software. The maintainer names who else can explain it and whose
    // account the register and the schedule run on; the runner never scores
    // that green on its own say-so.
    world: () => world({}),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the practice, not by a run",
  },
];

// Live only. Run by hand on the client's own ledger and the practice's own
// sign-off record over two real Mondays. On the stub the runner reports
// it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ReportWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

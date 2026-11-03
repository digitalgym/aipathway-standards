/**
 * One scenario per check of recurring-report-build-standard, for Close Check:
 * the monthly "ready to close?" report a bookkeeping practice produces for a
 * client whose books are in Xero, with the client's month-end close job in
 * the practice management system.
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

// The second business day of the next month, 8:00 am AEST (UTC+10, Brisbane).
const SEP = { period: "2026-09", scheduledAt: "2026-10-01T22:00:00.000Z" }; // Fri 2 Oct
const OCT = { period: "2026-10", scheduledAt: "2026-11-02T22:00:00.000Z" }; // Tue 3 Nov

const BOOKKEEPER = "Mei Lin (bookkeeper)";
const PRACTICE_MANAGER = "Sam Okafor (practice manager)";
const CLIENT_MANAGER = "Rachel Byrne (client manager)";

const XERO_DEF = (measure, queryRef, filters) => ({ id: `DEF-${measure}`, measure, source: "xero", queryRef, period: "month", filters, owner: BOOKKEEPER });

const DEFS = {
  bank: XERO_DEF("bank_lines_unreconciled", "bank.statement_lines_unreconciled", ["every bank and card account in the file", "statement lines dated on or before month end", "not reconciled"]),
  drafts: XERO_DEF("sales_invoices_in_draft", "invoices.accrec_draft_in_month", ["sales invoices", "dated in the month", "status DRAFT or SUBMITTED"]),
  bills: XERO_DEF("bills_awaiting_approval", "invoices.accpay_unapproved_in_month", ["bills", "dated in the month", "status DRAFT or SUBMITTED"]),
  suspense: XERO_DEF("suspense_balance", "accounts.suspense_balance_at_month_end", ["the suspense or clearing account named in the register", "balance at month end", "AUD, whole dollars, absolute"]),
  gst: XERO_DEF("lines_without_gst_code", "journals.lines_no_tax_rate_in_month", ["income and expense lines", "dated in the month", "no tax rate, or BAS Excluded on an account the register says should carry GST"]),
  steps: { id: "DEF-close_steps_open", measure: "close_steps_open", source: "practice", queryRef: "close_job.steps_open", period: "month", filters: ["the client's month-end close job for the month", "checklist steps not marked done"], owner: PRACTICE_MANAGER },
};
const ALL = Object.values(DEFS);
const EVERY = ALL.map((d) => d.measure);
const CLIENT_SET = ["bank_lines_unreconciled", "bills_awaiting_approval", "suspense_balance"];

const XERO = (sep, oct) => ({
  id: "xero",
  kind: "ledger",
  values: Object.fromEntries(
    ALL.filter((d) => d.source === "xero").map((d) => [d.queryRef, { [SEP.period]: sep[d.measure], [OCT.period]: oct[d.measure] }]),
  ),
});
const PRACTICE = (sep, oct) => ({ id: "practice", kind: "job", values: { "close_job.steps_open": { [SEP.period]: sep, [OCT.period]: oct } } });

const MONTH_A = { bank_lines_unreconciled: 14, sales_invoices_in_draft: 3, bills_awaiting_approval: 6, suspense_balance: 1250, lines_without_gst_code: 2 };
const MONTH_B = { bank_lines_unreconciled: 41, sales_invoices_in_draft: 1, bills_awaiting_approval: 9, suspense_balance: 380, lines_without_gst_code: 5 };
const CLEAN = { bank_lines_unreconciled: 0, sales_invoices_in_draft: 0, bills_awaiting_approval: 0, suspense_balance: 0, lines_without_gst_code: 0 };

const PRACTICE_VIEW = (measures) => ({ id: "practice", name: "Bookkeeping practice", measures });
const CLIENT_VIEW = (measures) => ({ id: "client", name: "Client business owner", measures });

/** A world that starts an hour before the first scheduled run. */
const world = (opts) => new ReportWorld({ now: new Date(Date.parse(SEP.scheduledAt) - 60 * MIN), ...opts });

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
    // items include a fourth (bills awaiting approval) the register does not define.
    world: () =>
      world({
        definitions: [DEFS.bank, DEFS.suspense, DEFS.steps],
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(["bank_lines_unreconciled", "bills_awaiting_approval", "suspense_balance", "close_steps_open"])],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const reports = w.published(SEP.period);
      if (reports.length === 0) return false;
      for (const r of reports) {
        for (const f of r.figures) {
          if (f.value !== null) {
            const def = f.definitionId ? w.definition(f.definitionId) : undefined;
            if (!def || def.measure !== f.measure) return false;
          }
        }
        const undefinedOne = r.figures.find((f) => f.measure === "bills_awaiting_approval");
        if (!undefinedOne || undefinedOne.value !== null || undefinedOne.unavailableReason !== "no_definition") return false;
        if (valued(r).length !== 3) return false;
      }
      return true;
    },
    describe: (w) => {
      const r = w.current(SEP.period, "practice");
      return r ? r.figures.map((f) => `${f.measure}=${f.value ?? f.unavailableReason} def=${f.definitionId}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "one-definition-per-measure",
    // The practice and the client both carry unreconciled bank lines for September.
    world: () =>
      world({
        definitions: [DEFS.bank, DEFS.bills],
        sources: [XERO(MONTH_A, MONTH_B)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(["bank_lines_unreconciled", "bills_awaiting_approval"]), CLIENT_VIEW(["bank_lines_unreconciled"])],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const m = "bank_lines_unreconciled";
      if (w.definitionsFor(m).length !== 1) return false;
      const def = w.definitionsFor(m)[0];
      if (w.sourceReads(def.source, def.queryRef, SEP.period).length !== 1) return false;
      const views = ["practice", "client"].map((a) => w.current(SEP.period, a));
      if (views.some((v) => !v)) return false;
      const figs = views.map((v) => v.figures.find((f) => f.measure === m));
      if (figs.some((f) => !f || f.value === null)) return false;
      return figs.every((f) => f.value === MONTH_A[m] && f.definitionId === def.id);
    },
    describe: (w) => {
      const def = DEFS.bank;
      return `${w.sourceReads(def.source, def.queryRef, SEP.period).length} read(s) of ${def.queryRef}; views: ${["practice", "client"].map((a) => `${a}=${w.current(SEP.period, a)?.figures.find((f) => f.measure === def.measure)?.value ?? "none"}`).join(", ")}`;
    },
  },
  {
    checkId: "source-and-as-of-on-every-figure",
    // Definitions over Xero (the ledger) and the practice management system
    // (the job system) for September. The run wakes six minutes after the
    // scheduled time, so a typed as-of time (the scheduled time, or the hour)
    // does not match the read.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      const r = w.current(SEP.period, "practice");
      if (!r) return false;
      const sources = new Set();
      for (const f of valued(r)) {
        if (!f.source || !f.asOf || !f.definitionId) return false;
        const def = w.definition(f.definitionId);
        if (!def || def.source !== f.source) return false;
        const reads = w.sourceReads(def.source, def.queryRef, SEP.period).filter((c) => c.response?.ok === true);
        if (!reads.some((c) => c.response.asOf === f.asOf)) return false;
        sources.add(f.source);
      }
      return sources.has("xero") && sources.has("practice") && valued(r).length === ALL.length;
    },
    describe: (w) => {
      const r = w.current(SEP.period, "practice");
      return r ? valued(r).map((f) => `${f.measure}@${f.source}/${f.asOf}`).join("; ") : "no report published";
    },
  },
  {
    checkId: "publishes-on-schedule-regardless",
    // Two months, both clean and identical: Ready both times, nothing changed.
    // The build is also woken before each scheduled time, where it must publish nothing.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(CLEAN, CLEAN), PRACTICE(0, 0)],
        schedule: [SEP, OCT],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      clockTo(w, new Date(Date.parse(SEP.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, SEP);
      clockTo(w, new Date(Date.parse(OCT.scheduledAt) - 30 * MIN).toISOString());
      await build(w.ports());
      await tick(build, w, OCT);
    },
    holds: (w) => {
      for (const e of [SEP, OCT]) {
        const rs = w.published(e.period);
        if (rs.length === 0) return false;
        if (rs.some((r) => Date.parse(r.publishedAt) < Date.parse(e.scheduledAt))) return false;
      }
      return true;
    },
    describe: (w) => [SEP, OCT].map((e) => `${e.period}: ${w.published(e.period).map((r) => r.publishedAt).join(", ") || "none"} (due ${e.scheduledAt})`).join("; "),
  },
  {
    checkId: "cannot-compute-says-so",
    // The practice management system stops answering before October's run.
    // September's open-steps figure must not reappear, and October must not
    // be called Ready.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, CLEAN), PRACTICE(4, 0)],
        schedule: [SEP, OCT],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.breakSource("practice");
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const first = w.current(SEP.period, "practice")?.figures.find((f) => f.measure === "close_steps_open");
      const octReport = w.current(OCT.period, "practice");
      const second = octReport?.figures.find((f) => f.measure === "close_steps_open");
      if (!first || first.value !== 4 || !second) return false;
      if (second.value !== null) return false;
      if (typeof second.unavailableReason !== "string" || !second.unavailableReason.includes("source_unreachable")) return false;
      const tOct = Date.parse(OCT.scheduledAt);
      const escalated = w.escalations.some((e) => Date.parse(e.at) >= tOct && `${e.reason} ${e.detail ?? ""}`.includes("close_steps_open"));
      const ownerTold = w.notifications.some((n) => Date.parse(n.at) >= tOct && n.person === PRACTICE_MANAGER && n.measure === "close_steps_open" && n.period === OCT.period);
      // The rest of the report still went out, on real reads, and the file is not called ready.
      const rest = octReport.figures.filter((f) => f.measure !== "close_steps_open");
      const notCalledReady = typeof octReport.narrative === "string" && /Not ready/.test(octReport.narrative) && !/Ready to close/.test(octReport.narrative);
      return escalated && ownerTold && notCalledReady && rest.every((f) => f.value !== null && f.asOf !== null);
    },
    describe: (w) => {
      const r = w.current(OCT.period, "practice");
      const f = r?.figures.find((x) => x.measure === "close_steps_open");
      return `Oct open steps: ${f ? `${f.value} (${f.unavailableReason})` : "none"}; ${w.escalations.length} escalation(s); ${w.notifications.length} notification(s); narrative: ${r?.narrative ?? "none"}`;
    },
  },
  {
    checkId: "no-narrative-invents-a-number",
    // Every item moves between September and October, so "unreconciled lines
    // nearly tripled" or "27 more lines" is tempting.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP, OCT],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(CLIENT_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const reports = allReports(w, [SEP.period, OCT.period]);
      if (reports.length !== 4) return false;
      return reports.every((r) => typeof r.narrative === "string" && r.narrative.trim().length > 0 && w.inventedNumbers(r).length === 0);
    },
    describe: (w) => allReports(w, [SEP.period, OCT.period]).map((r) => `${r.period}/${r.audienceId}: invented [${w.inventedNumbers(r).join(", ")}]`).join("; ") || "no report published",
  },
  {
    checkId: "variance-thresholds-route-to-a-person",
    // The client manager set a threshold: unreconciled bank lines rising by
    // more than 20 month on month. They rise by 27 in October.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP, OCT],
        thresholds: [{ measure: "bank_lines_unreconciled", direction: "up", amount: 20, notify: CLIENT_MANAGER }],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      await tick(build, w, OCT);
    },
    holds: (w) => {
      const tOct = Date.parse(OCT.scheduledAt);
      const inFirst = w.notifications.filter((n) => n.measure === "bank_lines_unreconciled" && (n.period === SEP.period || Date.parse(n.at) < tOct));
      if (inFirst.length > 0) return false;
      return w.notifications.some((n) => n.person === CLIENT_MANAGER && n.measure === "bank_lines_unreconciled" && n.period === OCT.period && Date.parse(n.at) >= tOct && Date.parse(n.at) < tOct + 60 * MIN);
    },
    describe: (w) => w.notifications.map((n) => `${n.person} / ${n.measure} / ${n.period} at ${n.at}`).join("; ") || "no notification",
  },
  {
    checkId: "audience-gets-its-own-view",
    // The practice is declared for every item; the client owner only for bank
    // lines, bills awaiting approval and the suspense balance.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(CLIENT_SET)],
      }),
    drive: async (build, w) => tick(build, w, SEP),
    holds: (w) => {
      for (const [id, declared] of [["practice", EVERY], ["client", CLIENT_SET]]) {
        const r = w.current(SEP.period, id);
        if (!r) return false;
        if (!sameSet(r.figures.map((f) => f.measure), declared)) return false;
      }
      return true;
    },
    describe: (w) => ["practice", "client"].map((a) => `${a}: [${w.current(SEP.period, a)?.figures.map((f) => f.measure).join(", ") ?? "none"}]`).join("; "),
  },
  {
    checkId: "corrections-are-a-new-version",
    // September is published, then the bookkeeper corrects the suspense
    // balance: a transfer between two of the client's own accounts had been
    // coded to suspense and was recoded after the run.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(EVERY)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.firstVersion = w.current(SEP.period, "practice");
      w.advance(90 * MIN);
      w.requestCorrection({ period: SEP.period, audienceId: "practice", measure: "suspense_balance", value: 0, person: BOOKKEEPER, reason: "transfer TRF-0921 between the client's own accounts was recoded out of suspense" });
      await build(w.ports());
    },
    holds: (w) => {
      const first = w.firstVersion;
      if (!first) return false;
      if (w.amendments.length !== 0) return false;
      const rs = w.published(SEP.period, "practice");
      const old = rs.find((r) => r.id === first.id);
      const next = rs.find((r) => r.supersedes === first.id);
      if (!old || !next) return false;
      if (old.status !== "superseded" || JSON.stringify(old.figures) !== JSON.stringify(first.figures)) return false;
      if (next.status !== "published" || next.version !== first.version + 1 || next.publishedBy !== BOOKKEEPER) return false;
      const v = w.versionsOf(next.id)[0];
      if (!v || v.by !== BOOKKEEPER || !v.reason || !v.reason.includes("TRF-0921")) return false;
      if (next.figures.find((f) => f.measure === "suspense_balance")?.value !== 0) return false;
      const gate = w.firstCall("gate", (c) => c.request?.person === BOOKKEEPER && typeof c.request?.reason === "string" && c.request.reason.includes("TRF-0921"));
      const publish = w.firstCall("publish_report", (c) => c.request?.supersedes === first.id);
      return gate >= 0 && publish > gate;
    },
    describe: (w) => w.published(SEP.period, "practice").map((r) => `${r.id} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") + `; ${w.amendments.length} in-place amendment(s)`,
  },
  {
    checkId: "the-record-by-period",
    // September to the practice and the client, then bank lines corrected once.
    world: () =>
      world({
        definitions: ALL,
        sources: [XERO(MONTH_A, MONTH_B), PRACTICE(4, 2)],
        schedule: [SEP],
        audiences: [PRACTICE_VIEW(EVERY), CLIENT_VIEW(CLIENT_SET)],
      }),
    drive: async (build, w) => {
      await tick(build, w, SEP);
      w.advance(90 * MIN);
      w.requestCorrection({ period: SEP.period, audienceId: "client", measure: "bank_lines_unreconciled", value: 11, person: BOOKKEEPER, reason: "three lines on the closed savings account were duplicates from the feed" });
      await build(w.ports());
    },
    holds: (w) => {
      const rs = w.published(SEP.period);
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
    describe: (w) => w.published(SEP.period).map((r) => `${r.audienceId} v${r.version} ${r.status} by ${r.publishedBy}`).join("; ") || "no report published",
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

// Live only. Run by hand on the client's own Xero file and the practice's own
// management system over two real month ends. On the stub the runner reports
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

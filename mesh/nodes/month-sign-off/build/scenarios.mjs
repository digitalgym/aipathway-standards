/**
 * One scenario per check of month-end-close-build-standard, for Month Sign-Off:
 * a bookkeeping practice closing October for three client files, each on its
 * own ledger, and putting each month in front of a named reviewer to sign off.
 *
 * Scaffolded by `npx @aipathway/conformance init month-end-close-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/month-end-close-build-standard
 *
 * Every holds() reads the world the runner owns and returns a strict boolean.
 * Each one is written so that a build that does nothing fails it, and
 * mutants.mjs proves that a deliberately broken build fails it too.
 */

import { MonthEndCloseWorld } from "@aipathway/conformance";

const ITEMS = ["bank", "uncoded", "receivables", "payables", "payroll", "accruals", "tax_control", "clearing"];
const STATUSES = ["pass", "fail", "could_not_check"];
const READ_FOR = { bank: "bank", uncoded: "uncoded", receivables: "receivables", payables: "payables", payroll: "payroll", accruals: "schedule", tax_control: "controls", clearing: "controls" };
const END = "2026-10-31";

const PLUMB = "ENT-PLUMB";
const CAFE = "ENT-CAFE";
const HOLD = "ENT-HOLD";

/** A clean month: every item passes. */
const clean = (schedule, lockDate = "2026-09-30") => ({
  bank: [{ accountId: "BA-OP", name: "Operating account", statementDate: END, statementBalance: 1_842_310, ledgerBalance: 1_842_310, unreconciledLines: 0 }],
  uncoded: [],
  receivables: { agedTotal: 2_461_500, controlBalance: 2_461_500 },
  payables: { agedTotal: 913_240, controlBalance: 913_240 },
  payroll: { expectedPayDates: ["2026-10-14", "2026-10-28"], postedPayDates: ["2026-10-14", "2026-10-28"] },
  controls: { taxReturnTotal: 412_300, taxControlBalance: 412_300, clearing: [{ account: "Payroll clearing", balance: 0 }, { account: "Undeposited funds", balance: 0 }] },
  schedule,
  lockDate,
});

const line = (lineId, kind, description, amount, extra = {}) => ({ lineId, kind, description, debitAccount: kind === "accrual" ? "6100" : "1400", creditAccount: kind === "accrual" ? "2150" : "6200", amount, ...extra });

/** The plumbing company in section 5 of the standard. */
const plumbing = () => {
  const l = clean([
    line("audit", "accrual", "Audit fee", 120_000),
    line("electricity", "accrual", "Electricity", null),
    line("insurance", "prepayment", "Insurance", null, { lastPosted: 95_000 }),
  ]);
  l.bank = [
    { accountId: "BA-OP", name: "Operating account", statementDate: END, statementBalance: 1_842_310, ledgerBalance: 1_842_310, unreconciledLines: 0 },
    { accountId: "BA-CARD", name: "Business card", statementDate: "2026-10-27", statementBalance: -312_080, ledgerBalance: -312_080, unreconciledLines: 0 },
  ];
  l.uncoded = [
    { lineId: "SL-881", accountCode: "9999 Suspense", date: "2026-10-12", amount: 18_990, description: "CARD PAYMENT BUNNINGS 4471" },
    { lineId: "SL-902", accountCode: "9999 Suspense", date: "2026-10-23", amount: 6_450, description: "CARD PAYMENT SQ *ACME" },
  ];
  l.receivables = { agedTotal: 2_461_500, controlBalance: 2_460_500 };
  l.controls = { ...l.controls, clearing: [{ account: "Payroll clearing", balance: 40 }, { account: "Undeposited funds", balance: 0 }] };
  return l;
};

const cafe = () => clean([line("bookkeeping", "accrual", "Bookkeeping fee", 55_000), line("rent", "prepayment", "Rent in advance", 420_000)]);
const holdings = (lockDate = "2026-11-30") => clean([line("interest", "accrual", "Loan interest", 81_250)], lockDate);

const world = ({ writable = {}, ledgers = {} } = {}) =>
  new MonthEndCloseWorld({
    entities: [
      { entityId: PLUMB, name: "Harbour Plumbing Pty Ltd", lockWritable: writable[PLUMB] ?? false },
      { entityId: CAFE, name: "Quay Cafe Pty Ltd", lockWritable: writable[CAFE] ?? false },
      { entityId: HOLD, name: "Harbour Holdings Pty Ltd", lockWritable: writable[HOLD] ?? false },
    ],
    ledgers: { [PLUMB]: plumbing(), [CAFE]: cafe(), [HOLD]: holdings(), ...ledgers },
  });

/** The schedule wakes the build; the next run is a few hours later. */
const runs = async (build, w, n = 1) => {
  for (let i = 0; i < n; i += 1) {
    await build(w.ports());
    w.advanceHours(6);
  }
};

const resultsFor = (w, e, item) => w.results.filter((r) => r.entityId === e && r.item === item);
const mentions = (text, c) => typeof text === "string" && (text.includes((Math.abs(c) / 100).toFixed(2)) || text.includes(String(Math.abs(c))));
const textOf = (r) => `${r?.detail ?? ""} ${r?.evidence?.detail ?? ""}`;
const proposalsOf = (w, e) => w.proposals.filter((p) => p.entityId === e);
const approve = (w, e, pick = (ps) => ps) => w.signOff(e, w.owners.reviewer, pick(proposalsOf(w, e)).map((p) => p.proposalId));

export const scenarios = [
  {
    checkId: "every-item-has-a-result",
    // Three entities closing October, run on an ordinary day.
    world: () => world(),
    drive: async (build, w) => runs(build, w, 1),
    holds: (w) =>
      w.entities.length === 3 &&
      w.entities.every((e) =>
        ITEMS.every((item) => {
          const r = w.latest(e.entityId, item);
          return r !== undefined && STATUSES.includes(r.status) && r.period === w.period.id;
        }),
      ),
    describe: (w) => `${w.results.length} result(s) recorded for ${w.entities.length} entities`,
  },
  {
    checkId: "evidence-or-it-did-not-pass",
    // Three entities closing October. Every pass and fail names a read the world
    // served, for the same entity and the read that item needs, made before.
    world: () => world(),
    drive: async (build, w) => runs(build, w, 1),
    holds: (w) => {
      const judged = w.results.filter((r) => r.status === "pass" || r.status === "fail");
      if (judged.length < w.entities.length * ITEMS.length) return false;
      return judged.every((r) => {
        const read = r.evidence && typeof r.evidence.readId === "string" ? w.readById(r.evidence.readId) : undefined;
        return read !== undefined && read.entityId === r.entityId && read.kind === READ_FOR[r.item] && read.seq < r.seq && typeof r.evidence.detail === "string" && r.evidence.detail.length > 0;
      });
    },
    describe: (w) => `${w.results.filter((r) => r.evidence).length} result(s) with evidence, ${w.reads.length} read(s) served`,
  },
  {
    checkId: "could-not-check-said-plainly",
    // The ledger does not answer the bank read or the payroll read for one entity.
    world: () => {
      const w = world();
      w.failRead(CAFE, "bank");
      w.failRead(CAFE, "payroll");
      return w;
    },
    drive: async (build, w) => runs(build, w, 1),
    holds: (w) =>
      ["bank", "payroll"].every((item) => {
        const rs = resultsFor(w, CAFE, item);
        return rs.length > 0 && rs.every((r) => r.status === "could_not_check" && typeof r.detail === "string" && r.detail.trim().length > 0);
      }) &&
      // the other items for that entity still read and were judged
      ["uncoded", "receivables", "payables", "accruals", "tax_control", "clearing"].every((item) => w.latest(CAFE, item)?.status === "pass"),
    describe: (w) => `${CAFE}: bank ${w.latest(CAFE, "bank")?.status ?? "none"}, payroll ${w.latest(CAFE, "payroll")?.status ?? "none"}`,
  },
  {
    checkId: "bank-to-the-statement-date",
    // One entity's card reconciled only to the 27th; another reconciled to the 31st, agreeing.
    world: () => world(),
    drive: async (build, w) => runs(build, w, 1),
    holds: (w) => {
      const short = w.latest(PLUMB, "bank");
      const ok = w.latest(CAFE, "bank");
      const named = short !== undefined && (textOf(short).includes("Business card") || textOf(short).includes("BA-CARD"));
      return short?.status === "fail" && named && !textOf(short).includes("Operating account (BA-OP):") && ok?.status === "pass" && resultsFor(w, CAFE, "bank").every((r) => r.status === "pass");
    },
    describe: (w) => `${PLUMB} bank ${w.latest(PLUMB, "bank")?.status ?? "none"}: ${w.latest(PLUMB, "bank")?.detail ?? ""}; ${CAFE} bank ${w.latest(CAFE, "bank")?.status ?? "none"}`,
  },
  {
    checkId: "uncoded-handed-on",
    // One entity with two lines in suspense, and the build run three times.
    world: () => world(),
    drive: async (build, w) => runs(build, w, 3),
    holds: (w) => {
      const uq = w.exceptions.filter((x) => x.kind === "uncoded");
      const each = ["SL-881", "SL-902"].every((ref) => uq.filter((x) => x.entityId === PLUMB && x.ref === ref && x.owner === w.owners.uncoded_query).length === 1);
      return each && uq.length === 2 && w.latest(PLUMB, "uncoded")?.status === "fail" && w.latest(CAFE, "uncoded")?.status === "pass";
    },
    describe: (w) => `${w.exceptions.filter((x) => x.kind === "uncoded").length} uncoded exception(s): ${w.exceptions.filter((x) => x.kind === "uncoded").map((x) => `${x.ref}->${x.owner}`).join(", ")}`,
  },
  {
    checkId: "accruals-only-from-the-schedule",
    // A fixed accrual, a prepayment with no amount and last month's figure beside it,
    // and an accrual a person enters between runs.
    world: () => world(),
    drive: async (build, w) => {
      await runs(build, w, 1);
      w.enterAmount(PLUMB, "electricity", 45_000, w.owners.bookkeeper);
      await runs(build, w, 2);
    },
    holds: (w) => {
      const sched = w.scheduleOf(PLUMB);
      const ps = proposalsOf(w, PLUMB);
      const sourced = ps.every((p) => {
        const l = sched.find((x) => x.lineId === p.scheduleLineId);
        if (!l) return false;
        if (p.source === "schedule") return l.amount !== null && p.amount === l.amount;
        if (p.source === "person_entry") return l.entered !== undefined && p.amount === l.entered.amount && p.enteredBy === l.entered.by;
        return false;
      });
      const once = (id) => ps.filter((p) => p.scheduleLineId === id).length === 1;
      const noAmt = w.exceptions.filter((x) => x.entityId === PLUMB && x.kind === "no_amount" && x.ref === "insurance");
      return (
        sourced &&
        once("audit") &&
        once("electricity") &&
        ps.filter((p) => p.scheduleLineId === "insurance").length === 0 &&
        noAmt.length === 1 &&
        noAmt[0].owner === w.owners.bookkeeper &&
        ps.find((p) => p.scheduleLineId === "electricity")?.source === "person_entry"
      );
    },
    describe: (w) => proposalsOf(w, PLUMB).map((p) => `${p.scheduleLineId} ${p.amount} (${p.source}${p.enteredBy ? ` by ${p.enteredBy}` : ""})`).join("; ") || "no proposals",
  },
  {
    checkId: "differences-reported-not-judged",
    // Payroll clearing forty cents off zero; aged receivables ten dollars from control.
    world: () => world(),
    drive: async (build, w) => runs(build, w, 1),
    holds: (w) => {
      const rec = w.latest(PLUMB, "receivables");
      const clr = w.latest(PLUMB, "clearing");
      const recFigures = mentions(textOf(rec), 2_461_500) && mentions(textOf(rec), 2_460_500) && mentions(textOf(rec), 1_000);
      const clrFigures = mentions(textOf(clr), 40) && textOf(clr).includes("Payroll clearing");
      const cleanOnes = ["payables", "tax_control"].every((i) => w.latest(PLUMB, i)?.status === "pass") && ["receivables", "payables", "tax_control", "clearing"].every((i) => w.latest(CAFE, i)?.status === "pass");
      return rec?.status === "fail" && clr?.status === "fail" && recFigures && clrFigures && cleanOnes;
    },
    describe: (w) => `receivables ${w.latest(PLUMB, "receivables")?.status ?? "none"} (${w.latest(PLUMB, "receivables")?.detail ?? ""}); clearing ${w.latest(PLUMB, "clearing")?.status ?? "none"} (${w.latest(PLUMB, "clearing")?.detail ?? ""})`,
  },
  {
    checkId: "nothing-written-before-sign-off",
    // Two runs with no sign-off; the reviewer signs off one entity approving one of
    // its two proposals; the build runs again. The others are never signed off.
    world: () => world({ writable: { [CAFE]: true } }),
    drive: async (build, w) => {
      await runs(build, w, 2);
      approve(w, CAFE, (ps) => ps.slice(0, 1));
      await runs(build, w, 2);
    },
    holds: (w) => {
      const s = w.signoffFor(CAFE);
      if (!s || s.approvedProposalIds.length !== 1 || proposalsOf(w, CAFE).length !== 2) return false;
      const writes = [...w.postAttempts, ...w.lockAttempts, ...w.tasks];
      const afterSignoff = writes.every((x) => {
        const so = w.signoffFor(x.entityId);
        return so !== undefined && so.seq < x.seq;
      });
      const onlyApproved = w.postAttempts.every((p) => s.approvedProposalIds.includes(p.proposalId));
      const posted = w.journals.filter((j) => j.entityId === CAFE).map((j) => j.proposalId);
      const others = [PLUMB, HOLD].every((e) => !writes.some((x) => x.entityId === e));
      return afterSignoff && onlyApproved && posted.length === 1 && posted[0] === s.approvedProposalIds[0] && others;
    },
    describe: (w) => `${w.postAttempts.length} post(s), ${w.lockAttempts.length} lock write(s), ${w.tasks.length} lock task(s); sign-offs: ${w.signoffs.map((s) => s.entityId).join(", ") || "none"}`,
  },
  {
    checkId: "journals-post-once",
    // Two approved journals; the first post lands but its answer is lost; the build runs again.
    world: () => world({ writable: { [CAFE]: true } }),
    drive: async (build, w) => {
      await runs(build, w, 1);
      approve(w, CAFE);
      w.loseNextAnswer();
      await runs(build, w, 2);
    },
    holds: (w) => {
      const approved = w.signoffFor(CAFE)?.approvedProposalIds ?? [];
      if (approved.length !== 2) return false;
      const props = proposalsOf(w, CAFE);
      const oneEach = approved.every((id) => w.journals.filter((j) => j.entityId === CAFE && j.proposalId === id).length === 1);
      const sameIntent = w.postAttempts.every((a) => {
        const p = props.find((x) => x.proposalId === a.proposalId);
        return p !== undefined && a.intentId === w.intentFor(CAFE, p.scheduleLineId);
      });
      const lost = w.postAttempts.find((a) => a.result.ok === false && a.result.error === "timeout");
      const raised = lost !== undefined && w.exceptions.some((x) => x.kind === "write_failed" && x.entityId === CAFE && x.owner === w.owners.bookkeeper && x.seq > lost.seq);
      const lastPost = Math.max(...w.postAttempts.filter((a) => a.entityId === CAFE).map((a) => a.seq));
      const readAfter = w.journalReads.some((r) => r.entityId === CAFE && r.seq > lastPost);
      const lockAfterRead = w.lockAttempts.filter((a) => a.entityId === CAFE).every((a) => w.journalReads.some((r) => r.entityId === CAFE && r.seq > lastPost && r.seq < a.seq));
      return oneEach && w.journals.filter((j) => j.entityId === CAFE).length === 2 && sameIntent && raised && readAfter && lockAfterRead;
    },
    describe: (w) => `${w.journals.length} journal(s) in the ledger from ${w.postAttempts.length} attempt(s); ${w.exceptions.filter((x) => x.kind === "write_failed").length} write_failed`,
  },
  {
    checkId: "lock-date-forward-after-sign-off",
    // Three signed-off entities: one whose ledger cannot write the lock date, one
    // locked to the end of September, one already locked past the period end.
    world: () => world({ writable: { [CAFE]: true, [HOLD]: true } }),
    drive: async (build, w) => {
      await runs(build, w, 1);
      for (const e of [PLUMB, CAFE, HOLD]) approve(w, e);
      await runs(build, w, 2);
    },
    holds: (w) => {
      const cafeWrites = w.lockAttempts.filter((a) => a.entityId === CAFE);
      const so = w.signoffFor(CAFE);
      const readBackFirst = cafeWrites.length > 0 && cafeWrites.every((a) => w.journalReads.some((r) => r.entityId === CAFE && so !== undefined && r.seq > so.seq && r.count >= so.approvedProposalIds.length && r.seq < a.seq));
      const cafeSet = cafeWrites.length > 0 && cafeWrites.every((a) => a.date === END && a.ok) && w.lockDateOf(CAFE) === END && w.lockReads.some((r) => r.entityId === CAFE && r.lockDate === END && r.seq > cafeWrites[0].seq);
      const plumbTask = w.tasks.filter((t) => t.entityId === PLUMB && t.what === "set_lock_date");
      const plumb = plumbTask.length === 1 && plumbTask[0].owner === w.owners.reviewer && w.lockAttempts.every((a) => a.entityId !== PLUMB);
      const hold = w.lockAttempts.every((a) => a.entityId !== HOLD) && w.tasks.every((t) => t.entityId !== HOLD) && w.lockDateOf(HOLD) === "2026-11-30";
      const neverBack = w.lockAttempts.every((a) => a.before === null || a.date >= a.before);
      return readBackFirst && cafeSet && plumb && hold && neverBack;
    },
    describe: (w) => `lock writes: ${w.lockAttempts.map((a) => `${a.entityId} ${a.before}->${a.date}`).join(", ") || "none"}; tasks: ${w.tasks.map((t) => t.entityId).join(", ") || "none"}`,
  },
  {
    checkId: "closed-period-handed-on",
    // Three signed-off entities; the reviewer sets one entity's lock date by hand a day later.
    world: () => world({ writable: { [CAFE]: true } }),
    drive: async (build, w) => {
      await runs(build, w, 1);
      for (const e of [PLUMB, CAFE, HOLD]) approve(w, e);
      await runs(build, w, 2);
      w.advanceHours(24);
      w.personSetsLock(PLUMB, END);
      await runs(build, w, 2);
    },
    holds: (w) => {
      const each = [PLUMB, CAFE, HOLD].every((e) => {
        const hs = w.handoffs.filter((h) => h.entityId === e);
        if (hs.length !== 1) return false;
        const h = hs[0];
        const lockRead = w.lockReads.some((r) => r.entityId === e && r.lockDate !== null && r.lockDate >= END && r.seq < h.seq);
        return h.to === "recurring-report" && h.period === w.period.id && typeof h.lockDate === "string" && h.lockDate >= END && h.lockDate === w.lockDateOf(e) && lockRead;
      });
      const manual = w.manualLocks.find((m) => m.entityId === PLUMB);
      const plumb = w.handoffs.find((h) => h.entityId === PLUMB);
      return each && manual !== undefined && plumb !== undefined && plumb.seq > manual.seq;
    },
    describe: (w) => `handoffs: ${w.handoffs.map((h) => `${h.entityId}@${h.lockDate}`).join(", ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // Not software. The maintainer names who else can explain it and whose account
    // the close runs on; the runner never scores that green on its own say-so.
    world: () => world(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "closed by evidence from the practice, not by a run",
  },
];

// Live only. Run by hand on the business's own ledger: one entity, one
// scheduled accrual, the build run before and after a recorded sign-off, then
// run again. On the stub the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new MonthEndCloseWorld(),
    drive: async (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

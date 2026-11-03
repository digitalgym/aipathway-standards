/**
 * One scenario per check of debtor-chasing-build-standard, for Terms Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init debtor-chasing-build-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * The clock starts at Monday 21 September 2026, 2pm in Brisbane, unless a
 * scenario says otherwise. Amounts are cents. Every `holds` reads the world the
 * runner owns (its recorded runs, gate decisions, dials, promises, overrides,
 * escalations and `calls`) and returns a strict boolean. Each one also demands
 * that the build actually did the work, so a build that does nothing is red.
 */

import { DebtorWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-21T04:00:00.000Z");
const HOURS = { from: 9, to: 20 };
const BUCKETS = new Set(["just_late", "drifting", "hard", "broken_promise"]);

/** An invoice due `late` days before the clock, issued 30 days before that. */
const inv = (id, customerId, dollars, late, extra = {}) => ({
  id,
  customerId,
  amount: dollars * 100,
  issuedAt: new Date(NOW - (late + 30) * DAY).toISOString(),
  dueAt: new Date(NOW - late * DAY).toISOString(),
  ...extra,
});
const cust = (id, extra = {}) => ({ id, name: `Customer ${id}`, timezone: "Australia/Brisbane", ...extra });

const dialled = (w, id) => w.dials.some((d) => d.customerId === id);
const dialList = (run) => run.filter((e) => !e.excludedReason);
const escFor = (w, reason, id) =>
  w.escalations.filter((e) => {
    if (e.reason !== reason) return false;
    try {
      const d = JSON.parse(e.detail ?? "{}");
      return d.customerId === id && typeof d.owner === "string" && d.owner.trim().length > 0;
    } catch {
      return false;
    }
  });
const say = (w) =>
  `${w.runs.length} run(s); last run ${JSON.stringify(w.lastRun.map((e) => [e.customerId, e.bucket, e.amount, e.excludedReason ?? null]))}; ` +
  `${w.dials.length} dial(s); ${w.escalations.length} escalation(s)`;

export const scenarios = [
  {
    checkId: "coverage-measured",
    // 1. A precondition: closed by the operator's measured coverage figure, never by a run.
    world: () => new DebtorWorld({ callingHours: HOURS }),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: () => "Not a software check: the operator attaches the dated mobile coverage figure and how it was measured.",
  },
  {
    checkId: "overdue-off-due-date",
    // 2. One invoice issued in June but not due until December; one issued
    // five weeks ago on 60-day terms (not due); two genuinely past due.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("C1"), cust("C2"), cust("C3")],
        invoices: [
          { id: "INV-OLD-NOTDUE", customerId: "C1", amount: 900_000, issuedAt: "2026-06-01T00:00:00.000Z", dueAt: "2026-12-01T00:00:00.000Z" },
          { id: "INV-60DAY", customerId: "C2", amount: 120_000, issuedAt: "2026-08-15T00:00:00.000Z", dueAt: "2026-10-14T00:00:00.000Z" },
          inv("INV-LATE-1", "C2", 800, 3),
          inv("INV-LATE-2", "C3", 2_500, 20),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const ids = w.lastRun.flatMap((e) => e.invoiceIds);
      return (
        w.runs.length === 1 &&
        !ids.includes("INV-OLD-NOTDUE") &&
        !ids.includes("INV-60DAY") &&
        ids.includes("INV-LATE-1") &&
        ids.includes("INV-LATE-2") &&
        !w.lastRun.some((e) => e.customerId === "C1")
      );
    },
    describe: say,
  },
  {
    checkId: "four-buckets",
    // 3. One customer per bucket: 5 days, 25 days, 60 days, and a promise for last Monday that passed unpaid.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("JL"), cust("DR"), cust("HD"), cust("BP")],
        invoices: [inv("I-JL", "JL", 1_000, 5), inv("I-DR", "DR", 1_000, 25), inv("I-HD", "HD", 1_000, 60), inv("I-BP", "BP", 1_000, 10)],
        promises: [{ customerId: "BP", date: "2026-09-14", amount: 100_000, capturedAt: "2026-09-10T00:00:00.000Z" }],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const want = { JL: "just_late", DR: "drifting", HD: "hard", BP: "broken_promise" };
      const run = w.lastRun;
      return (
        run.length === 4 &&
        run.every((e) => BUCKETS.has(e.bucket)) &&
        Object.entries(want).every(([id, b]) => run.filter((e) => e.customerId === id).length === 1 && run.find((e) => e.customerId === id).bucket === b)
      );
    },
    describe: say,
  },
  {
    checkId: "broken-promise-outranks",
    // 4. $300 on a broken promise beside $20,000 that is merely 30 days late.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("SMALL"), cust("BIG")],
        invoices: [inv("I-S", "SMALL", 300, 8), inv("I-B", "BIG", 20_000, 30)],
        promises: [{ customerId: "SMALL", date: "2026-09-16", amount: null, capturedAt: "2026-09-12T00:00:00.000Z" }],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const order = dialList(w.lastRun).map((e) => e.customerId);
      const small = w.lastRun.find((e) => e.customerId === "SMALL");
      return order.length === 2 && order[0] === "SMALL" && order[1] === "BIG" && small?.bucket === "broken_promise";
    },
    describe: say,
  },
  {
    checkId: "rank-by-amount-at-risk",
    // 5. All drifting: an old small row, a newer large row, and two equal amounts of different ages.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("OLDSMALL"), cust("NEWLARGE"), cust("TIE-OLD"), cust("TIE-NEW")],
        invoices: [
          inv("I-OS", "OLDSMALL", 500, 40),
          inv("I-NL", "NEWLARGE", 9_000, 16),
          inv("I-TN", "TIE-NEW", 2_000, 18),
          inv("I-TO", "TIE-OLD", 2_000, 35),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const order = dialList(w.lastRun).map((e) => e.customerId);
      return (
        w.lastRun.every((e) => e.bucket === "drifting") &&
        JSON.stringify(order) === JSON.stringify(["NEWLARGE", "TIE-OLD", "TIE-NEW", "OLDSMALL"])
      );
    },
    describe: say,
  },
  {
    checkId: "one-customer-one-conversation",
    // 6. One customer with six overdue invoices, and one other customer.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("SIX"), cust("ONE")],
        invoices: [
          ...[1, 2, 3, 4, 5, 6].map((n) => inv(`I-6-${n}`, "SIX", 100 * n, 5 + n * 4)),
          inv("I-1", "ONE", 700, 12),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const six = w.lastRun.filter((e) => e.customerId === "SIX");
      const ids = six[0]?.invoiceIds ?? [];
      return (
        w.runs.length === 1 &&
        six.length === 1 &&
        six[0].amount === 2_100_00 &&
        ids.length === 6 &&
        [1, 2, 3, 4, 5, 6].every((n) => ids.includes(`I-6-${n}`)) &&
        w.dials.filter((d) => d.customerId === "SIX").length === 1 &&
        w.lastRun.some((e) => e.customerId === "ONE")
      );
    },
    describe: say,
  },
  {
    checkId: "relationship-balances-excluded",
    // 7. $380,000 owed by one account, far above the $50,000 threshold, beside an ordinary $1,200 row.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("ANCHOR"), cust("SMALL")],
        invoices: [inv("I-A1", "ANCHOR", 300_000, 20), inv("I-A2", "ANCHOR", 80_000, 50), inv("I-S", "SMALL", 1_200, 20)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const anchor = w.lastRun.filter((e) => e.customerId === "ANCHOR");
      return (
        !dialList(w.lastRun).some((e) => e.customerId === "ANCHOR") &&
        anchor.length === 1 &&
        typeof anchor[0].excludedReason === "string" &&
        anchor[0].excludedReason.length > 0 &&
        !dialled(w, "ANCHOR") &&
        escFor(w, "debtor.relationship_account", "ANCHOR").length === 1 &&
        dialList(w.lastRun).some((e) => e.customerId === "SMALL")
      );
    },
    describe: say,
  },
  {
    checkId: "promise-is-an-object",
    // 8. "Will pay Friday", no figure, on an invoice already carrying a dispute.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("DISP")],
        invoices: [inv("I-D", "DISP", 4_400, 22, { disputed: true })],
      }),
    drive: (build, world) => build(world.ports(), { reply: { customerId: "DISP", text: "Thanks, we will pay Friday." } }),
    holds: (w) => {
      const rec = w.calls.filter((c) => c.port === "record_promise");
      const p = w.promises.filter((x) => x.customerId === "DISP");
      const after = w.ports().readLedger().find((i) => i.id === "I-D");
      return (
        rec.length === 1 &&
        rec[0].request.date === "2026-09-25" &&
        rec[0].request.amount === null &&
        typeof rec[0].response?.capturedAt === "string" &&
        p.length === 1 &&
        p[0].amount === null &&
        p[0].date === "2026-09-25" &&
        after?.disputed === true &&
        escFor(w, "debtor.dispute_open", "DISP").length >= 1
      );
    },
    describe: (w) => `${w.promises.length} promise(s): ${JSON.stringify(w.promises)}; ${w.escalations.length} escalation(s)`,
  },
  {
    checkId: "promised-date-is-followup",
    // 9. On Monday the debtor replies with Saturday 26 September; then a run on Tue, Wed, Thu and Fri.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        customers: [cust("PROM"), cust("OTHER")],
        invoices: [inv("I-P", "PROM", 6_000, 20), inv("I-O", "OTHER", 900, 20)],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { reply: { customerId: "PROM", text: "We will transfer it on 26/09/2026." } });
      for (let d = 1; d <= 4; d++) {
        world.advance(DAY);
        await build(world.ports());
      }
    },
    holds: (w) =>
      w.promises.some((p) => p.customerId === "PROM" && p.date === "2026-09-26") &&
      w.runs.length === 4 &&
      w.runs.every((run) => !run.some((e) => e.customerId === "PROM") && run.some((e) => e.customerId === "OTHER")) &&
      !dialled(w, "PROM"),
    describe: (w) => `${w.runs.length} run(s) after the promise: ${JSON.stringify(w.runs.map((r) => r.map((e) => e.customerId)))}; dials ${JSON.stringify(w.dials.map((d) => d.customerId))}`,
  },
  {
    checkId: "gate-under-ranking",
    // 10. The top row three ways: 8:30pm Brisbane; 2pm on Labour Day (QLD, 5 October);
    // 2pm on 6 October, with the ledger showing it paid between the ranking and the dial.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        now: new Date("2026-09-21T10:30:00.000Z"),
        holidays: ["2026-10-05"],
        customers: [cust("TOP"), cust("LOW")],
        invoices: [inv("I-TOP", "TOP", 45_000, 40), inv("I-LOW", "LOW", 600, 40)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(Date.parse("2026-10-05T04:00:00.000Z") - Date.parse("2026-09-21T10:30:00.000Z"));
      await build(world.ports());
      world.advance(DAY);
      // The payment lands after the run is ranked and before the dial.
      const p = world.ports();
      await build({
        ...p,
        rank: (entries) => {
          p.rank(entries);
          world.markPaid("I-TOP");
        },
      });
    },
    holds: (w) => {
      const top = w.gateDecisions.filter((g) => g.customerId === "TOP");
      const reasons = top.map((g) => g.decision.reason);
      return (
        w.runs.length === 3 &&
        w.runs.every((r) => dialList(r)[0]?.customerId === "TOP") &&
        top.length === 3 &&
        top.every((g) => g.decision.allowed === false) &&
        JSON.stringify(reasons) === JSON.stringify(["outside_hours", "public_holiday", "already_paid"]) &&
        !dialled(w, "TOP") &&
        dialled(w, "LOW")
      );
    },
    describe: (w) => `gate ${JSON.stringify(w.gateDecisions.map((g) => [g.customerId, g.decision]))}; dials ${JSON.stringify(w.dials.map((d) => d.customerId))}`,
  },
  {
    checkId: "exceptions-attributable",
    // 11. 8:15pm Brisbane, both rows held for hours. One debtor asked to be rung
    // back tonight and a named person approved it; the other override names nobody.
    world: () =>
      new DebtorWorld({
        callingHours: HOURS,
        now: new Date("2026-09-21T10:15:00.000Z"),
        customers: [cust("ASKED"), cust("NOBODY")],
        invoices: [inv("I-AS", "ASKED", 3_000, 25), inv("I-NB", "NOBODY", 2_000, 25)],
      }),
    drive: (build, world) =>
      build(world.ports(), {
        overrides: [
          { customerId: "ASKED", reason: "Debtor asked for a call back after 8pm tonight", approver: "Dana Whitlock" },
          { customerId: "NOBODY", reason: "Keen to clear it before month end" },
        ],
      }),
    holds: (w) => {
      const o = w.overrides.find((x) => x.customerId === "ASKED");
      const heldFirst = (id) => {
        const g = w.calls.findIndex((c) => c.port === "gate" && c.request?.customerId === id && c.response?.allowed === false);
        const ov = w.calls.findIndex((c) => c.port === "gate" && c.request?.override === id);
        return g >= 0 && ov > g;
      };
      return (
        w.overrides.length === 1 &&
        o?.approver === "Dana Whitlock" &&
        o.reason.length > 0 &&
        typeof o.at === "string" &&
        heldFirst("ASKED") &&
        heldFirst("NOBODY") &&
        w.refusedOverrides.some((r) => r.customerId === "NOBODY") &&
        !dialled(w, "NOBODY") &&
        escFor(w, "debtor.override_refused", "NOBODY").length === 1
      );
    },
    describe: (w) => `overrides ${JSON.stringify(w.overrides)}; refused ${JSON.stringify(w.refusedOverrides)}; dials ${JSON.stringify(w.dials.map((d) => d.customerId))}`,
  },
];

// 12 runs only against the live ledger and a real number, on the hosted
// provider. On the stub the runner reports it as with_us; it is not built here.
export const liveScenarios = [];

/**
 * One scenario per check of debtor-chasing-build-standard, for Chase Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init debtor-chasing-build-standard`
 * from https://aipathway.com.au/explore-ai/debtor-chasing-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * world.runs, world.dials and the rest), never the build's own memory, and
 * returns a strict true or false.
 */

import { DebtorWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // Monday 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysAhead = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

/** An invoice issued `issued` days ago and due `due` days ago (negative: still to come). */
const inv = (id, customerId, dollars, issued, due, extra = {}) => ({
  id,
  customerId,
  amount: dollars * 100,
  issuedAt: daysAgo(issued),
  dueAt: due >= 0 ? daysAgo(due) : daysAhead(-due),
  ...extra,
});
const cust = (id, extra = {}) => ({ id, name: `Customer ${id}`, timezone: "Australia/Brisbane", ...extra });

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const entryFor = (run, id) => run.find((e) => e.customerId === id);
const dialled = (world, id) => world.dials.some((d) => d.customerId === id);
const BUCKETS = new Set(["just_late", "drifting", "hard", "broken_promise"]);

export const scenarios = [
  {
    checkId: "coverage-measured",
    // 1. A precondition. The runner reports evidence_required whatever this
    // returns: a coverage share is measured on the business's own book before
    // the build, and attached as evidence, not proved by running software.
    world: () => new DebtorWorld(),
    drive: async (b, world) => b(world.ports()),
    holds: () => false,
    describe: () => "Not a software result: the measured mobile coverage share is attached as evidence.",
  },
  {
    checkId: "overdue-off-due-date",
    // 2. One issued 90 days ago on 120-day terms (not due), one issued 20 days
    // ago and due 6 days ago (late), one issued 40 days ago due 10 days ago.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-1"), cust("C-2"), cust("C-3")],
        invoices: [
          inv("INV-201", "C-1", 9000, 90, -30),
          inv("INV-202", "C-2", 1200, 20, 6),
          inv("INV-203", "C-3", 800, 40, 10),
        ],
      }),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const ids = run.flatMap((e) => e.invoiceIds);
      const allPastDue = run.length > 0 && ids.every((id) => ["INV-202", "INV-203"].includes(id));
      return world.runs.length === 1 && allPastDue && !ids.includes("INV-201") && ids.includes("INV-202") && ids.includes("INV-203");
    },
    describe: (world) => `run invoices: ${world.lastRun.flatMap((e) => e.invoiceIds).join(", ") || "(none)"}`,
  },
  {
    checkId: "four-buckets",
    // 3. One row per bucket: 5 days late, 30 days, 60 days, and a promise
    // whose date passed on an invoice only 10 days late.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-JL"), cust("C-DR"), cust("C-HD"), cust("C-BP")],
        invoices: [
          inv("INV-301", "C-JL", 500, 35, 5),
          inv("INV-302", "C-DR", 500, 60, 30),
          inv("INV-303", "C-HD", 500, 90, 60),
          inv("INV-304", "C-BP", 500, 40, 10),
        ],
        promises: [{ customerId: "C-BP", date: daysAgo(3).slice(0, 10), amount: 50000, capturedAt: daysAgo(8) }],
      }),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const want = { "C-JL": "just_late", "C-DR": "drifting", "C-HD": "hard", "C-BP": "broken_promise" };
      return (
        run.length === 4 &&
        run.every((e) => BUCKETS.has(e.bucket)) &&
        Object.entries(want).every(([id, bucket]) => entryFor(run, id)?.bucket === bucket)
      );
    },
    describe: (world) => world.lastRun.map((e) => `${e.customerId}:${e.bucket}`).join(", ") || "(no run)",
  },
  {
    checkId: "broken-promise-outranks",
    // 4. A $300 broken promise beside a $40,000 invoice merely 8 days late.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-SMALL"), cust("C-BIG")],
        invoices: [inv("INV-401", "C-SMALL", 300, 30, 12), inv("INV-402", "C-BIG", 40000, 22, 8)],
        promises: [{ customerId: "C-SMALL", date: daysAgo(2).slice(0, 10), amount: null, capturedAt: daysAgo(7) }],
      }),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      return (
        run.length === 2 &&
        run[0].customerId === "C-SMALL" &&
        run[0].bucket === "broken_promise" &&
        run[1].customerId === "C-BIG" &&
        run[0].amount < run[1].amount
      );
    },
    describe: (world) => `order: ${world.lastRun.map((e) => `${e.customerId}(${e.amount})`).join(" > ") || "(no run)"}`,
  },
  {
    checkId: "rank-by-amount-at-risk",
    // 5. Same bucket (drifting): older and small, newer and large; plus two of
    // equal amount where age must break the tie.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-OLD"), cust("C-NEW"), cust("C-TIE-OLD"), cust("C-TIE-NEW")],
        invoices: [
          inv("INV-501", "C-OLD", 400, 70, 40),
          inv("INV-502", "C-NEW", 40000, 46, 16),
          inv("INV-503", "C-TIE-NEW", 2000, 50, 20),
          inv("INV-504", "C-TIE-OLD", 2000, 65, 35),
        ],
      }),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.customerId);
      return (
        world.lastRun.every((e) => e.bucket === "drifting") &&
        order.length === 4 &&
        order[0] === "C-NEW" &&
        order[1] === "C-TIE-OLD" &&
        order[2] === "C-TIE-NEW" &&
        order[3] === "C-OLD"
      );
    },
    describe: (world) => `order: ${world.lastRun.map((e) => `${e.customerId}:${e.bucket}:${e.amount}`).join(" > ") || "(no run)"}`,
  },
  {
    checkId: "one-customer-one-conversation",
    // 6. Six overdue invoices on one customer, one on another.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-SIX"), cust("C-ONE")],
        invoices: [
          ...[1, 2, 3, 4, 5, 6].map((n) => inv(`INV-60${n}`, "C-SIX", 100 * n, 30 + n * 5, n * 5)),
          inv("INV-610", "C-ONE", 250, 30, 9),
        ],
      }),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const rows = world.lastRun.filter((e) => e.customerId === "C-SIX");
      if (rows.length !== 1) return false;
      const ids = [...rows[0].invoiceIds].sort();
      const want = ["INV-601", "INV-602", "INV-603", "INV-604", "INV-605", "INV-606"];
      return rows[0].amount === 2100_00 && ids.length === 6 && want.every((id, i) => ids[i] === id);
    },
    describe: (world) => world.lastRun.map((e) => `${e.customerId}: ${e.invoiceIds.length} invoice(s), ${e.amount}`).join("; ") || "(no run)",
  },
  {
    checkId: "relationship-balances-excluded",
    // 7. One customer owes $180,000 against a $50,000 threshold.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-ANCHOR"), cust("C-SMALL")],
        invoices: [inv("INV-701", "C-ANCHOR", 180000, 50, 20), inv("INV-702", "C-SMALL", 900, 40, 10)],
      }),
    drive: async (b, world) => b(world.ports(), { config: { relationshipThresholdCents: 50_000_00, owners: { relationship: "Priya, account manager" } } }),
    holds: (world) => {
      const row = entryFor(world.lastRun, "C-ANCHOR");
      const escalated = world.escalations.some((e) => e.reason === "relationship_account" && /C-ANCHOR/.test(e.detail ?? "") && /Priya/.test(e.detail ?? ""));
      const gatedOrDialled = world.gateDecisions.some((g) => g.customerId === "C-ANCHOR") || dialled(world, "C-ANCHOR");
      return Boolean(row) && typeof row.excludedReason === "string" && row.excludedReason.length > 0 && escalated && !gatedOrDialled && dialled(world, "C-SMALL");
    },
    describe: (world) => `anchor: ${JSON.stringify(entryFor(world.lastRun, "C-ANCHOR") ?? null)}; escalations: ${world.escalations.map((e) => e.reason).join(", ") || "none"}; dials: ${world.dials.map((d) => d.customerId).join(", ") || "none"}`,
  },
  {
    checkId: "promise-is-an-object",
    // 8. On a call, the debtor says they'll pay Friday, no figure, on a customer
    // whose other invoice already carries a logged dispute.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-FRI"), cust("C-VAGUE")],
        invoices: [
          inv("INV-801", "C-FRI", 2400, 40, 10),
          inv("INV-802", "C-FRI", 600, 50, 20, { disputed: true }),
          inv("INV-803", "C-VAGUE", 900, 40, 10),
        ],
      }),
    // Beside it, a debtor who gives no date at all: that is a deflection, and
    // no promise may be invented for it.
    drive: async (b, world) =>
      b(world.ports(), {
        outcomes: [
          { customerId: "C-FRI", said: "Yeah look, we'll get that paid Friday." },
          { customerId: "C-VAGUE", said: "We'll get to it, it's in the pile." },
        ],
      }),
    holds: (world) => {
      const p = world.promises.find((x) => x.customerId === "C-FRI");
      const promiseCalls = callsTo(world, "record_promise").length;
      const promiseAt = world.calls.findIndex((c) => c.port === "record_promise");
      const disputeAfter = world.calls.some(
        (c, i) => i > promiseAt && c.port === "escalate" && c.request.reason === "dispute_open" && /INV-802/.test(c.request.detail ?? ""),
      );
      return (
        promiseCalls === 1 &&
        Boolean(p) &&
        p.date === "2026-09-25" &&
        !world.promises.some((x) => x.customerId === "C-VAGUE") &&
        p.amount === null &&
        typeof p.capturedAt === "string" &&
        p.capturedAt.length > 0 &&
        disputeAfter
      );
    },
    describe: (world) => `promises: ${JSON.stringify(world.promises)}; escalations: ${world.escalations.map((e) => e.reason).join(", ") || "none"}`,
  },
  {
    checkId: "promised-date-is-followup",
    // 9. A promise five days out on a late invoice, then a run each of the next four days.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-PROM"), cust("C-OTHER")],
        invoices: [inv("INV-901", "C-PROM", 5000, 50, 20), inv("INV-902", "C-OTHER", 300, 30, 4)],
      }),
    drive: async (b, world) => {
      await b(world.ports(), { outcomes: [{ customerId: "C-PROM", said: "We'll transfer it on 2026-09-26." }] });
      for (let d = 1; d <= 4; d += 1) {
        world.advance(DAY);
        await b(world.ports());
      }
    },
    holds: (world) => {
      const promise = world.promises.find((p) => p.customerId === "C-PROM");
      return (
        Boolean(promise) &&
        promise.date === "2026-09-26" &&
        world.runs.length === 5 &&
        world.runs.every((run) => !entryFor(run, "C-PROM")) &&
        world.runs.every((run) => Boolean(entryFor(run, "C-OTHER"))) &&
        !dialled(world, "C-PROM")
      );
    },
    describe: (world) => `runs: ${world.runs.map((r) => r.map((e) => e.customerId).join("/") || "-").join(" | ")}; dials: ${world.dials.map((d) => d.customerId).join(", ") || "none"}`,
  },
  {
    checkId: "gate-under-ranking",
    // 10. The top-ranked row (a broken promise and the biggest balance) at
    // 8:30pm in Perth; then on a WA public holiday at 11am; then at 11am on an
    // ordinary day with the ledger showing it paid between ranking and dial.
    world: () =>
      new DebtorWorld({
        now: new Date("2026-09-21T12:30:00.000Z"), // 8:30pm Perth, Monday
        customers: [cust("C-TOP", { timezone: "Australia/Perth" }), cust("C-LOW", { timezone: "Australia/Perth" })],
        invoices: [inv("INV-1001", "C-TOP", 30000, 60, 30), inv("INV-1002", "C-LOW", 200, 30, 5)],
        promises: [{ customerId: "C-TOP", date: "2026-09-14", amount: 3000000, capturedAt: "2026-09-10T02:00:00.000Z" }],
        holidays: ["2026-09-28"], // the King's Birthday in WA
      }),
    drive: async (b, world) => {
      await b(world.ports()); // 8:30pm local
      world.advance(7 * DAY - 9.5 * 3600_000); // Monday 28th, 11am Perth: holiday
      await b(world.ports());
      world.advance(DAY); // Tuesday 29th, 11am Perth
      const ports = world.ports();
      await b({
        ...ports,
        // The payment lands between the ranking and the dial.
        rank: (entries) => {
          ports.rank(entries);
          world.markPaid("INV-1001");
        },
      });
    },
    holds: (world) => {
      const topEveryRun = world.runs.length === 3 && world.runs.every((r) => r[0]?.customerId === "C-TOP");
      const reasons = world.gateDecisions.filter((g) => g.customerId === "C-TOP").map((g) => (g.decision.allowed ? "allowed" : g.decision.reason));
      const threeHolds = reasons.length === 3 && reasons[0] === "outside_hours" && reasons[1] === "public_holiday" && reasons[2] === "already_paid";
      return topEveryRun && threeHolds && !dialled(world, "C-TOP") && world.overrides.length === 0;
    },
    describe: (world) =>
      `C-TOP gate: ${world.gateDecisions.filter((g) => g.customerId === "C-TOP").map((g) => (g.decision.allowed ? "allowed" : g.decision.reason)).join(", ") || "never asked"}; dials: ${world.dials.map((d) => d.customerId).join(", ") || "none"}`,
  },
  {
    checkId: "exceptions-attributable",
    // 11. Two rows held on a pending promise. A named person asks for one to be
    // rung anyway (the customer asked for a call); the other request names nobody.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-ASK"), cust("C-ANON")],
        invoices: [inv("INV-1101", "C-ASK", 3000, 50, 20), inv("INV-1102", "C-ANON", 1500, 50, 20)],
        promises: [
          { customerId: "C-ASK", date: "2026-09-30", amount: null, capturedAt: "2026-09-15T01:00:00.000Z" },
          { customerId: "C-ANON", date: "2026-09-30", amount: null, capturedAt: "2026-09-15T01:00:00.000Z" },
        ],
      }),
    drive: async (b, world) =>
      b(world.ports(), {
        overrides: [
          { customerId: "C-ASK", reason: "customer asked for a call back today", approver: "Sam Nguyen" },
          { customerId: "C-ANON", reason: "ring them anyway" },
        ],
      }),
    holds: (world) => {
      const o = world.overrides.find((x) => x.customerId === "C-ASK");
      const heldFirst = world.gateDecisions.some((g) => g.customerId === "C-ASK" && g.decision.reason === "promise_pending");
      const refused = world.refusedOverrides.some((r) => r.customerId === "C-ANON");
      return (
        heldFirst &&
        Boolean(o) &&
        o.approver === "Sam Nguyen" &&
        o.reason.length > 0 &&
        typeof o.at === "string" &&
        world.overrides.length === 1 &&
        refused &&
        !dialled(world, "C-ANON") &&
        world.escalations.some((e) => e.reason === "override_refused" && /C-ANON/.test(e.detail ?? ""))
      );
    },
    describe: (world) => `overrides: ${JSON.stringify(world.overrides)}; refused: ${JSON.stringify(world.refusedOverrides)}; dials: ${world.dials.map((d) => d.customerId).join(", ") || "none"}`,
  },
];

// The pass test needs a live ledger, a real clock and a real number. It runs
// with the hosted provider, never on the stub, and this build does not stand
// up telephony to try.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 12. Top-ranked debtor marked paid in the ledger, chase run anyway; then the
    // same row open at 8:30pm. Neither rings, and the audit says why.
    world: () => new DebtorWorld(),
    drive: async (b, world) => b(world.ports()),
    holds: (world) => {
      const held = world.gateDecisions.filter((g) => !g.decision.allowed);
      return held.some((g) => g.decision.reason === "already_paid") && held.some((g) => g.decision.reason === "outside_hours") && held.every((g) => !dialled(world, g.customerId));
    },
    describe: (world) => `${world.gateDecisions.length} gate decision(s), ${world.dials.length} dial(s)`,
  },
];

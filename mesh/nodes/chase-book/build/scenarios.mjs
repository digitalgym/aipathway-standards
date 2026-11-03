/**
 * One scenario per check of debtor-chasing-build-standard, for Chase Book.
 *
 * Scaffolded by `npx @aipathway/conformance init debtor-chasing-build-standard`
 * from https://aipathway.com.au/explore-ai/debtor-chasing-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * world.runs, world.gateDecisions, world.dials), never the build's own memory.
 * Every scenario also carries a positive control, so a build that does nothing
 * cannot pass by leaving the world empty.
 */

import { DebtorWorld } from "@aipathway/conformance";

// The four buckets, closed, as the standard names them. A free-text bucket fails check 3.
const BUCKETS = ["just_late", "drifting", "hard", "broken_promise"];

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // Monday, 2pm Brisbane: the world's default clock
const TODAY = "2026-09-21";
/** A calendar date n days before (negative: after) TODAY. */
const daysAgo = (n) => new Date(Date.parse(TODAY) - n * DAY).toISOString().slice(0, 10);

const BNE = "Australia/Brisbane";
const cust = (id, extra = {}) => ({ id, name: `Customer ${id}`, timezone: BNE, ...extra });
const inv = (id, customerId, dollars, pastDue, extra = {}) => ({
  id,
  customerId,
  amount: Math.round(dollars * 100),
  issuedAt: daysAgo(pastDue + 30),
  dueAt: daysAgo(pastDue),
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const entry = (run, id) => run.find((e) => e.customerId === id);
const dialled = (world, id) => world.dials.some((d) => d.customerId === id);
const order = (run) => run.filter((e) => !e.excludedReason).map((e) => e.customerId);

export const scenarios = [
  {
    checkId: "coverage-measured",
    // 1. A precondition. The runner reports it as evidence_required and never
    // calls holds: the measured share is attached by the operator, not scored.
    world: () => new DebtorWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s); coverage is closed by evidence, not by this run`,
  },
  {
    checkId: "overdue-off-due-date",
    // 2. One invoice issued 200 days ago but due in 10 days; two genuinely past due.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-OLD"), cust("C-LATE"), cust("C-JUST")],
        invoices: [
          { id: "INV-201", customerId: "C-OLD", amount: 640000, issuedAt: daysAgo(200), dueAt: daysAgo(-10) },
          { id: "INV-202", customerId: "C-LATE", amount: 120000, issuedAt: daysAgo(40), dueAt: daysAgo(20) },
          { id: "INV-203", customerId: "C-JUST", amount: 45000, issuedAt: daysAgo(5), dueAt: daysAgo(2) },
          { id: "INV-204", customerId: "C-JUST", amount: 30000, issuedAt: daysAgo(3), dueAt: TODAY },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const due = { "INV-202": daysAgo(20), "INV-203": daysAgo(2) };
      const ids = run.flatMap((e) => e.invoiceIds);
      return (
        world.runs.length === 1 &&
        !entry(run, "C-OLD") &&
        !ids.includes("INV-201") &&
        !ids.includes("INV-204") &&
        Boolean(entry(run, "C-LATE")) &&
        Boolean(entry(run, "C-JUST")) &&
        ids.length === 2 &&
        ids.every((id) => due[id] !== undefined && due[id] < TODAY)
      );
    },
    describe: (world) => `run: ${JSON.stringify(world.lastRun.map((e) => [e.customerId, e.invoiceIds]))}`,
  },
  {
    checkId: "four-buckets",
    // 3. One customer for each bucket, including a promise that passed three days ago.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-JL"), cust("C-DR"), cust("C-HD"), cust("C-BP")],
        invoices: [
          inv("INV-301", "C-JL", 800, 5),
          inv("INV-302", "C-DR", 900, 25),
          inv("INV-303", "C-HD", 1000, 60),
          inv("INV-304", "C-BP", 700, 20),
        ],
        promises: [{ customerId: "C-BP", date: daysAgo(3), amount: 70000, capturedAt: `${daysAgo(10)}T01:00:00.000Z` }],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const want = { "C-JL": "just_late", "C-DR": "drifting", "C-HD": "hard", "C-BP": "broken_promise" };
      return (
        run.length === 4 &&
        run.every((e) => BUCKETS.includes(e.bucket)) &&
        Object.entries(want).every(([id, b]) => entry(run, id)?.bucket === b)
      );
    },
    describe: (world) => `buckets: ${JSON.stringify(world.lastRun.map((e) => [e.customerId, e.bucket]))}`,
  },
  {
    checkId: "broken-promise-outranks",
    // 4. A $300 broken promise beside a $9,000 invoice that is merely late.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-SMALL"), cust("C-BIG")],
        invoices: [inv("INV-401", "C-SMALL", 300, 12), inv("INV-402", "C-BIG", 9000, 10)],
        promises: [{ customerId: "C-SMALL", date: daysAgo(2), amount: 30000, capturedAt: `${daysAgo(9)}T01:00:00.000Z` }],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const o = order(world.lastRun);
      return o.length === 2 && o[0] === "C-SMALL" && o[1] === "C-BIG" && entry(world.lastRun, "C-SMALL")?.bucket === "broken_promise";
    },
    describe: (world) => `order: ${order(world.lastRun).join(" > ")}`,
  },
  {
    checkId: "rank-by-amount-at-risk",
    // 5. Same bucket: old and small against new and large, plus an equal-amount pair for the tie.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-OLDSMALL"), cust("C-NEWLARGE"), cust("C-TIE-OLD"), cust("C-TIE-NEW")],
        invoices: [
          inv("INV-501", "C-OLDSMALL", 500, 40),
          inv("INV-502", "C-NEWLARGE", 8000, 16),
          inv("INV-503", "C-TIE-NEW", 2000, 20),
          inv("INV-504", "C-TIE-OLD", 2000, 30),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const o = order(world.lastRun);
      return (
        world.lastRun.every((e) => e.bucket === "drifting") &&
        JSON.stringify(o) === JSON.stringify(["C-NEWLARGE", "C-TIE-OLD", "C-TIE-NEW", "C-OLDSMALL"])
      );
    },
    describe: (world) => `order: ${order(world.lastRun).join(" > ")}`,
  },
  {
    checkId: "one-customer-one-conversation",
    // 6. Six overdue invoices on one customer, and one other customer beside it.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-SIX"), cust("C-ONE")],
        invoices: [
          inv("INV-601", "C-SIX", 410, 5),
          inv("INV-602", "C-SIX", 520, 9),
          inv("INV-603", "C-SIX", 630, 16),
          inv("INV-604", "C-SIX", 740, 22),
          inv("INV-605", "C-SIX", 850, 31),
          inv("INV-606", "C-SIX", 960, 38),
          inv("INV-607", "C-ONE", 1200, 8),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const six = world.lastRun.filter((e) => e.customerId === "C-SIX");
      const ids = six[0]?.invoiceIds ?? [];
      const want = ["INV-601", "INV-602", "INV-603", "INV-604", "INV-605", "INV-606"];
      return (
        six.length === 1 &&
        six[0].amount === 411000 &&
        ids.length === 6 &&
        want.every((id) => ids.includes(id)) &&
        world.dials.filter((d) => d.customerId === "C-SIX").length === 1 &&
        want.every((id) => world.dials.find((d) => d.customerId === "C-SIX")?.text.includes(id))
      );
    },
    describe: (world) => `C-SIX entries: ${JSON.stringify(world.lastRun.filter((e) => e.customerId === "C-SIX"))}; reminders to C-SIX: ${world.dials.filter((d) => d.customerId === "C-SIX").length}`,
  },
  {
    checkId: "relationship-balances-excluded",
    // 7. A $400,000 balance, far over the A$25,000 threshold, beside an ordinary one.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-ANCHOR"), cust("C-SHOP")],
        invoices: [inv("INV-701", "C-ANCHOR", 250000, 20), inv("INV-702", "C-ANCHOR", 150000, 50), inv("INV-703", "C-SHOP", 2000, 20)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const anchor = entry(world.lastRun, "C-ANCHOR");
      const esc = callsTo(world, "escalate", (c) => /C-ANCHOR/.test(c.request.detail ?? "") && /exception_owner: \S/.test(c.request.detail ?? ""));
      return (
        typeof anchor?.excludedReason === "string" &&
        anchor.excludedReason.length > 0 &&
        !dialled(world, "C-ANCHOR") &&
        esc.length === 1 &&
        dialled(world, "C-SHOP") &&
        !order(world.lastRun).includes("C-ANCHOR")
      );
    },
    describe: (world) => `anchor: ${JSON.stringify(entry(world.lastRun, "C-ANCHOR"))}; escalations: ${JSON.stringify(world.escalations)}`,
  },
  {
    checkId: "promise-is-an-object",
    // 8. "I'll pay Friday", no figure, on an invoice already carrying a dispute.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-FRI"), cust("C-DISP")],
        invoices: [inv("INV-801", "C-FRI", 3300, 18, { disputed: true }), inv("INV-802", "C-DISP", 2100, 30, { disputed: true })],
      }),
    drive: (b, world) => b(world.ports(), { outcomes: [{ customerId: "C-FRI", date: "2026-09-25", amount: null }] }),
    holds: (world) => {
      const rec = callsTo(world, "record_promise", (c) => c.request.customerId === "C-FRI");
      const stored = world.promises.find((p) => p.customerId === "C-FRI");
      const after = world.ports().readLedger().find((i) => i.id === "INV-801");
      return (
        rec.length === 1 &&
        rec[0].request.date === "2026-09-25" &&
        rec[0].request.amount === null &&
        typeof rec[0].response.capturedAt === "string" &&
        stored?.amount === null &&
        stored?.date === "2026-09-25" &&
        after?.disputed === true &&
        !dialled(world, "C-FRI") &&
        typeof entry(world.lastRun, "C-DISP")?.excludedReason === "string" &&
        !dialled(world, "C-DISP")
      );
    },
    describe: (world) => `record_promise calls: ${JSON.stringify(callsTo(world, "record_promise").map((c) => c.request))}`,
  },
  {
    checkId: "promised-date-is-followup",
    // 9. A promise for five days out, then a run on each of the next four days,
    // then the promised day itself, when the follow-up is due.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-PROM"), cust("C-CTRL")],
        invoices: [inv("INV-901", "C-PROM", 4200, 20), inv("INV-902", "C-CTRL", 1500, 20)],
      }),
    drive: async (b, world) => {
      await b(world.ports(), { outcomes: [{ customerId: "C-PROM", date: daysAgo(-5), amount: 420000 }] });
      for (let d = 1; d <= 5; d++) {
        world.advance(DAY);
        await b(world.ports());
      }
    },
    holds: (world) => {
      const before = world.runs.slice(0, 5);
      const promisedDay = world.runs[5] ?? [];
      return (
        world.runs.length === 6 &&
        before.every((r) => !entry(r, "C-PROM") && Boolean(entry(r, "C-CTRL"))) &&
        world.dials.filter((d) => d.customerId === "C-PROM").length === 1 &&
        world.dials.find((d) => d.customerId === "C-PROM")?.at.slice(0, 10) === daysAgo(-5) &&
        Boolean(entry(promisedDay, "C-PROM"))
      );
    },
    describe: (world) => `C-PROM in runs: ${world.runs.map((r) => (entry(r, "C-PROM") ? "yes" : "no")).join(",")}`,
  },
  {
    checkId: "gate-under-ranking",
    // 10. The top-ranked row (Perth) at 8:30pm its time; then on a WA public
    // holiday; then paid in the ledger between the ranking and the send.
    world: () =>
      new DebtorWorld({
        now: new Date("2026-09-21T12:30:00.000Z"), // 8:30pm Perth
        holidays: ["2026-09-28"], // King's Birthday, WA
        customers: [cust("C-TOP", { timezone: "Australia/Perth" }), cust("C-NEXT", { timezone: "Australia/Perth" })],
        invoices: [inv("INV-1001", "C-TOP", 20000, 60), inv("INV-1002", "C-NEXT", 3000, 25)],
      }),
    drive: async (b, world) => {
      // A named person asks for the top row to go anyway. A score, or a name, never lifts these holds.
      const ask = { overrides: [{ customerId: "C-TOP", reason: "biggest in the book, send it now", approver: "Priya Shah" }] };
      await b(world.ports(), ask); // 8:30pm Perth
      world.advance(Date.parse("2026-09-28T06:00:00.000Z") - Date.parse("2026-09-21T12:30:00.000Z"));
      await b(world.ports(), ask); // 2pm Perth, public holiday
      world.advance(DAY);
      const p = world.ports();
      const rank = p.rank;
      p.rank = (entries) => {
        rank(entries);
        world.markPaid("INV-1001"); // the money lands after the ranking, before the send
      };
      await b(p, ask); // 2pm Perth, ordinary Tuesday
    },
    holds: (world) => {
      const top = world.gateDecisions.filter((g) => g.customerId === "C-TOP").map((g) => g.decision);
      const want = ["outside_hours", "public_holiday", "already_paid"];
      return (
        world.runs.length === 3 &&
        world.runs.every((r) => order(r)[0] === "C-TOP") &&
        top.length === 3 &&
        top.every((d, i) => d.allowed === false && d.reason === want[i]) &&
        !dialled(world, "C-TOP") &&
        world.overrides.length === 0 &&
        world.dials.length === 1 &&
        world.dials[0].customerId === "C-NEXT" &&
        world.dials[0].text.startsWith("This is an automated")
      );
    },
    describe: (world) => `C-TOP gate: ${JSON.stringify(world.gateDecisions.filter((g) => g.customerId === "C-TOP").map((g) => g.decision))}; dials: ${world.dials.map((d) => d.customerId).join(",")}`,
  },
  {
    checkId: "exceptions-attributable",
    // 11. Two rows held by a pending promise. One override names its approver;
    // one does not and must be refused.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-OK"), cust("C-NONAME")],
        invoices: [inv("INV-1101", "C-OK", 5200, 30), inv("INV-1102", "C-NONAME", 4800, 30)],
        promises: [
          { customerId: "C-OK", date: daysAgo(-9), amount: null, capturedAt: `${daysAgo(4)}T01:00:00.000Z` },
          { customerId: "C-NONAME", date: daysAgo(-9), amount: null, capturedAt: `${daysAgo(4)}T01:00:00.000Z` },
        ],
      }),
    drive: (b, world) =>
      b(world.ports(), {
        overrides: [
          { customerId: "C-OK", reason: "Promised date is outside our 30-day terms; owner asked for a reminder now", approver: "Priya Shah" },
          { customerId: "C-NONAME", reason: "chase it anyway" },
        ],
      }),
    holds: (world) => {
      const ok = world.overrides.find((o) => o.customerId === "C-OK");
      return (
        world.overrides.length === 1 &&
        ok?.approver === "Priya Shah" &&
        typeof ok.reason === "string" &&
        ok.reason.length > 0 &&
        typeof ok.at === "string" &&
        world.refusedOverrides.some((r) => r.customerId === "C-NONAME") &&
        dialled(world, "C-OK") &&
        !dialled(world, "C-NONAME") &&
        callsTo(world, "escalate", (c) => /C-NONAME/.test(c.request.detail ?? "")).length === 1
      );
    },
    describe: (world) => `overrides: ${JSON.stringify(world.overrides)}; refused: ${JSON.stringify(world.refusedOverrides)}`,
  },
];

// The pass test runs against a live ledger, a real clock and a real line. On
// the stub the runner reports it with_us and never drives it. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new DebtorWorld(),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const paidHeld = world.gateDecisions.some((g) => g.decision.reason === "already_paid");
      const lateHeld = world.gateDecisions.some((g) => g.decision.reason === "outside_hours");
      return paidHeld && lateHeld && world.dials.every((d) => !world.gateDecisions.some((g) => g.customerId === d.customerId && !g.decision.allowed && g.at === d.at));
    },
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

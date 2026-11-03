/**
 * One scenario per check of debtor-chasing-build-standard, for Promise Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init debtor-chasing-build-standard`
 * from https://aipathway.com.au/explore-ai/debtor-chasing-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * world.runs, world.dials, world.promises, world.escalations, world.overrides),
 * never the build's own memory. The drive plays the outside world: the clock,
 * a client's reply landing in the inbox, the ledger showing a payment, a person
 * closing an exception.
 */

import { DebtorWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // Monday, 2pm Brisbane: the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysAhead = (n) => new Date(NOW.getTime() + n * DAY).toISOString();
const ymd = (d) => d.slice(0, 10);

const QLD = "Australia/Brisbane";
const cust = (id, extra = {}) => ({ id, name: `Client ${id}`, timezone: QLD, ...extra });
const inv = (id, customerId, amount, dueDaysAgo, extra = {}) => ({
  id,
  customerId,
  amount,
  issuedAt: daysAgo(dueDaysAgo + 30),
  dueAt: daysAgo(dueDaysAgo),
  ...extra,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const dialList = (run) => run.filter((e) => !e.excludedReason);
const entryFor = (run, id) => run.find((e) => e.customerId === id);
const describe = (world) =>
  `${world.calls.length} port call(s); runs ${world.runs.map((r) => r.map((e) => `${e.customerId}:${e.bucket}:${e.amount}${e.excludedReason ? `(x ${e.excludedReason})` : ""}`).join(",") || "empty").join(" | ") || "none"}; drafts ${world.dials.map((d) => d.customerId).join(",") || "none"}; gate ${world.gateDecisions.map((g) => `${g.customerId}:${g.decision.allowed ? "ok" : g.decision.reason}`).join(",") || "none"}; escalations ${world.escalations.map((e) => e.reason).join(",") || "none"}`;

export const scenarios = [
  {
    checkId: "coverage-measured",
    // 1. A precondition. The runner reports evidence_required and does not run it; a holds that
    //    returned true here would be the build vouching for itself.
    world: () => new DebtorWorld(),
    drive: () => {},
    holds: () => false,
    describe: () =>
      "Not scored by a run. For Promise Watch the reachable share is the share of overdue invoices whose client has a billing email the chase can be drafted to; the business attaches that figure, dated.",
  },
  {
    checkId: "overdue-off-due-date",
    // 2. One invoice issued 90 days ago on long terms, not due for another 5 days. One issued
    //    20 days ago on 7-day terms, so 13 days late. One due today.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-201"), cust("C-202"), cust("C-203")],
        invoices: [
          { id: "INV-201", customerId: "C-201", amount: 900_000, issuedAt: daysAgo(90), dueAt: daysAhead(5) },
          { id: "INV-202", customerId: "C-202", amount: 120_000, issuedAt: daysAgo(20), dueAt: daysAgo(13) },
          { id: "INV-203", customerId: "C-203", amount: 300_000, issuedAt: daysAgo(30), dueAt: NOW.toISOString() },
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const ids = run.flatMap((e) => e.invoiceIds);
      return world.runs.length === 1 && ids.includes("INV-202") && !ids.includes("INV-201") && !ids.includes("INV-203") && !entryFor(run, "C-201") && !entryFor(run, "C-203");
    },
    describe,
  },
  {
    checkId: "four-buckets",
    // 3. One client per bucket: 4 days late, 30 days late, 70 days late, and a promise made for
    //    a date that has passed with the invoice still open.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-301"), cust("C-302"), cust("C-303"), cust("C-304")],
        invoices: [inv("INV-301", "C-301", 50_000, 4), inv("INV-302", "C-302", 50_000, 30), inv("INV-303", "C-303", 50_000, 70), inv("INV-304", "C-304", 50_000, 10)],
        promises: [{ customerId: "C-304", date: ymd(daysAgo(3)), amount: 50_000, capturedAt: daysAgo(8) }],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const want = { "C-301": "just_late", "C-302": "drifting", "C-303": "hard", "C-304": "broken_promise" };
      const closed = ["just_late", "drifting", "hard", "broken_promise"];
      return run.length === 4 && Object.entries(want).every(([id, b]) => entryFor(run, id)?.bucket === b) && run.every((e) => closed.includes(e.bucket));
    },
    describe,
  },
  {
    checkId: "broken-promise-outranks",
    // 4. A $300 broken promise beside a $18,000 invoice that is merely late.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-401"), cust("C-402")],
        invoices: [inv("INV-401", "C-401", 30_000, 9), inv("INV-402", "C-402", 1_800_000, 20)],
        promises: [{ customerId: "C-401", date: ymd(daysAgo(2)), amount: null, capturedAt: daysAgo(6) }],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = dialList(world.lastRun).map((e) => e.customerId);
      return order.length === 2 && order[0] === "C-401" && order[1] === "C-402" && entryFor(world.lastRun, "C-401")?.bucket === "broken_promise";
    },
    describe,
  },
  {
    checkId: "rank-by-amount-at-risk",
    // 5. Same bucket (drifting): 40 days and $400, 16 days and $9,000. Then two equal amounts,
    //    where the older one must come first.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-501"), cust("C-502"), cust("C-503"), cust("C-504")],
        invoices: [inv("INV-501", "C-501", 40_000, 40), inv("INV-502", "C-502", 900_000, 16), inv("INV-503", "C-503", 200_000, 18), inv("INV-504", "C-504", 200_000, 35)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = dialList(world.lastRun).map((e) => e.customerId);
      return order.join(",") === "C-502,C-504,C-503,C-501" && world.lastRun.every((e) => e.bucket === "drifting");
    },
    describe,
  },
  {
    checkId: "one-customer-one-conversation",
    // 6. One client with six overdue invoices, and a second client with one.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-601"), cust("C-602")],
        invoices: [
          ...[1, 2, 3, 4, 5, 6].map((n) => inv(`INV-60${n}`, "C-601", 10_000 * n, 5 + n * 3)),
          inv("INV-610", "C-602", 70_000, 12),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const entries = world.lastRun.filter((e) => e.customerId === "C-601");
      const [e] = entries;
      const six = ["INV-601", "INV-602", "INV-603", "INV-604", "INV-605", "INV-606"];
      const draftsTo601 = world.dials.filter((d) => d.customerId === "C-601").length;
      return entries.length === 1 && e.amount === 210_000 && e.invoiceIds.length === 6 && six.every((id) => e.invoiceIds.includes(id)) && draftsTo601 === 1;
    },
    describe,
  },
  {
    checkId: "relationship-balances-excluded",
    // 7. One client owes $180,000, far above the $25,000 threshold. Another owes $1,200.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-701"), cust("C-702")],
        invoices: [inv("INV-701", "C-701", 18_000_000, 25), inv("INV-702", "C-702", 120_000, 25)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const big = entryFor(world.lastRun, "C-701");
      const onDialList = dialList(world.lastRun).some((e) => e.customerId === "C-701");
      const touched = world.gateDecisions.some((g) => g.customerId === "C-701") || world.dials.some((d) => d.customerId === "C-701");
      const routed = world.escalations.some((e) => /relationship/.test(e.reason) && (e.detail ?? "").includes("C-701") && /Jordan Lee/.test(e.detail ?? ""));
      const smallDrafted = world.dials.some((d) => d.customerId === "C-702");
      return Boolean(big?.excludedReason) && !onDialList && !touched && routed && smallDrafted;
    },
    describe,
  },
  {
    checkId: "promise-is-an-object",
    // 8. The client replies "we'll pay it Friday", no figure, on an invoice already carrying a dispute.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-801")],
        invoices: [inv("INV-801", "C-801", 240_000, 20, { disputed: true })],
      }),
    drive: (build, world) =>
      build(world.ports(), {
        event: "email.received",
        message: { id: "MSG-801", subject: "Re: INV-801 is now 20 days past due", text: "Thanks for the reminder, we'll pay it Friday." },
      }),
    holds: (world) => {
      const rp = callsTo(world, "record_promise");
      const [p] = world.promises;
      const disputeKept = world.escalations.some((e) => e.reason === "dispute_open" && (e.detail ?? "").includes("INV-801"));
      const stillDisputed = world.ports().readLedger().find((i) => i.id === "INV-801")?.disputed === true;
      return (
        rp.length === 1 &&
        rp[0].request.date === "2026-09-25" &&
        rp[0].request.amount === null &&
        typeof rp[0].response.capturedAt === "string" &&
        world.promises.length === 1 &&
        p.amount === null &&
        p.date === "2026-09-25" &&
        disputeKept &&
        stillDisputed
      );
    },
    describe,
  },
  {
    checkId: "promised-date-is-followup",
    // 9. Monday: the client replies promising Saturday, five days out. The daily run fires on each
    //    of the next four mornings, then on the Sunday after the promised date with it still unpaid.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-901"), cust("C-902")],
        invoices: [inv("INV-901", "C-901", 560_000, 18), inv("INV-902", "C-902", 80_000, 18)],
      }),
    drive: async (build, world) => {
      await build(world.ports(), {
        event: "email.received",
        message: { id: "MSG-901", subject: "Re: INV-901", text: "Apologies, payment will go out by Saturday 26 September." },
      });
      for (let day = 1; day <= 4; day++) {
        world.advance(DAY);
        await build(world.ports());
      }
      world.advance(2 * DAY); // Sunday 27th: the date has passed, the invoice is still open
      await build(world.ports());
    },
    holds: (world) => {
      const promised = world.promises.find((p) => p.customerId === "C-901");
      if (world.runs.length !== 5 || promised?.date !== "2026-09-26") return false;
      const before = world.runs.slice(0, 4);
      const absentBefore = before.every((r) => !entryFor(r, "C-901") && entryFor(r, "C-902"));
      const noDraftBefore = world.dials.filter((d) => d.customerId === "C-901" && d.at < "2026-09-26").length === 0;
      const backAfter = entryFor(world.runs[4], "C-901")?.bucket === "broken_promise";
      return absentBefore && noDraftBefore && backAfter;
    },
    describe,
  },
  {
    checkId: "gate-under-ranking",
    // 10. C-1001 tops the book (a broken promise, the largest balance). Run at 8:30pm Brisbane;
    //     then at 2pm on a Queensland public holiday; then at 2pm on an ordinary day, with the
    //     client's payment landing in the ledger after the ranking and before the draft.
    world: () =>
      new DebtorWorld({
        now: new Date("2026-10-04T10:30:00.000Z"), // Sunday 4 October, 8:30pm Brisbane
        customers: [cust("C-1001"), cust("C-1002")],
        invoices: [inv("INV-1001", "C-1001", 1_500_000, 30), inv("INV-1002", "C-1002", 60_000, 30)],
        promises: [{ customerId: "C-1001", date: "2026-09-30", amount: 1_500_000, capturedAt: "2026-09-24T01:00:00.000Z" }],
        holidays: ["2026-10-05"], // King's Birthday, Queensland
      }),
    drive: async (build, world) => {
      await build(world.ports()); // 8:30pm
      world.advance(17.5 * HOUR); // Monday 5 October, 2pm, a QLD public holiday
      await build(world.ports());
      world.advance(DAY); // Tuesday 6 October, 2pm
      const ports = world.ports();
      const rank = ports.rank;
      ports.rank = (entries) => {
        const r = rank(entries);
        world.markPaid("INV-1001"); // the money lands between the ranking and the contact
        return r;
      };
      await build(ports);
    },
    holds: (world) => {
      if (world.runs.length !== 3) return false;
      const topEach = world.runs.every((r) => dialList(r)[0]?.customerId === "C-1001");
      const held = world.gateDecisions.filter((g) => g.customerId === "C-1001").map((g) => g.decision.reason);
      const reasons = held.join(",") === "outside_hours,public_holiday,already_paid";
      const gatedBeforeContact = world.calls.every((c, i) => c.port !== "disclose" || world.calls.slice(0, i).some((g) => g.port === "gate" && g.request.customerId === c.request.customerId && g.response.allowed === true));
      const gateAfterRank = world.calls.filter((c) => c.port === "gate").every((g) => world.calls.slice(0, world.calls.indexOf(g)).some((r) => r.port === "rank"));
      const neverDrafted = !world.dials.some((d) => d.customerId === "C-1001");
      const draftsOnOrdinaryDay = world.dials.filter((d) => d.customerId === "C-1002").length === 1 && /drafted by an AI assistant/.test(world.dials[0]?.text ?? "");
      return topEach && reasons && gatedBeforeContact && gateAfterRank && neverDrafted && draftsOnOrdinaryDay;
    },
    describe,
  },
  {
    checkId: "exceptions-attributable",
    // 11. Two clients held on a pending promise. The owner closes the hold on one, named, with a
    //     reason ("their payment run was cancelled, chase now"). Somebody closes the other with
    //     no name on it.
    world: () =>
      new DebtorWorld({
        customers: [cust("C-1101"), cust("C-1102")],
        invoices: [inv("INV-1101", "C-1101", 410_000, 21), inv("INV-1102", "C-1102", 95_000, 21)],
        promises: [
          { customerId: "C-1101", date: ymd(daysAhead(6)), amount: null, capturedAt: daysAgo(1) },
          { customerId: "C-1102", date: ymd(daysAhead(6)), amount: null, capturedAt: daysAgo(1) },
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { event: "exception.closed", customerId: "C-1101", reason: "Client's payment run was cancelled; chase now", approver: "Jordan Lee" });
      await build(world.ports(), { event: "exception.closed", customerId: "C-1102", reason: "chase anyway" });
    },
    holds: (world) => {
      const [o] = world.overrides;
      const named = world.overrides.length === 1 && o.customerId === "C-1101" && o.approver === "Jordan Lee" && /cancelled/.test(o.reason) && typeof o.at === "string";
      const heldFirst = callsTo(world, "gate").findIndex((g) => g.request.customerId === "C-1101" && g.response.allowed === false && g.response.reason === "promise_pending") >= 0;
      const unnamedRefused = !world.overrides.some((x) => x.customerId === "C-1102") && !world.dials.some((d) => d.customerId === "C-1102");
      const refusalOnRecord = world.refusedOverrides.some((r) => r.customerId === "C-1102") || world.escalations.some((e) => /refused/.test(e.reason) && (e.detail ?? "").includes("C-1102"));
      const actedOnNamed = world.dials.some((d) => d.customerId === "C-1101");
      return named && heldFirst && unnamedRefused && refusalOnRecord && actedOnNamed;
    },
    describe,
  },
];

// Check 12 runs only against a live ledger, at a real time of day, and reports with_us on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new DebtorWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

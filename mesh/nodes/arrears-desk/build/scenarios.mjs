/**
 * One scenario per check of rent-arrears-build-standard, for Arrears Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init rent-arrears-build-standard`
 * and filled in here. The checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/rent-arrears-build-standard
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the world's own records), never the build's memory, and returns a strict
 * true or false.
 */

import { ArrearsWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const START = new Date("2026-09-21T04:00:00.000Z"); // 2pm in Brisbane
const paidTo = (daysBefore) => new Date(START.getTime() - daysBefore * DAY).toISOString();

// Dated, versioned rules per state, from the standard's "facts that can change"
// (checked 18 September 2026). A superseded Queensland row and one not yet in
// force prove the desk takes the rule in force at the clock, not a constant.
const RULES = [
  { state: "QLD", effectiveFrom: "2019-07-01T00:00:00.000Z", thresholdDays: 7, noticeDays: 7 },
  { state: "QLD", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 8, noticeDays: 7 },
  { state: "QLD", effectiveFrom: "2027-01-01T00:00:00.000Z", thresholdDays: 11, noticeDays: 7 },
  { state: "NSW", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
  { state: "VIC", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
];

const PM = "Mel Tran, senior property manager";

const on = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const sendsTo = (world, id) => on(world, "send_sms", (c) => c.request.tenancyId === id);
const delivered = (world, id) => sendsTo(world, id).filter((c) => c.response?.sent === true);
const raisedFor = (world, id, re) => on(world, "escalate", (c) => c.request.tenancyId === id && re.test(c.request.reason));
const row = (run, id) => run.find((e) => e.tenancyId === id);

/** Ports whose ledger read for one tenancy runs a hook once, after it returns. */
function withHookAfterRead(world, tenancyId, hook) {
  const ports = world.ports();
  const read = ports.readLedger;
  let fired = false;
  ports.readLedger = (id) => {
    const snap = read(id);
    if (id === tenancyId && !fired) {
      fired = true;
      hook();
    }
    return snap;
  };
  return ports;
}

export const scenarios = [
  {
    checkId: "derived-every-run",
    // Two daily runs in one session; between them the tenant pays part of what is owed.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-1001", state: "QLD", balance: 98000, paidToDate: paidTo(4) }] }),
    drive: async (build, world) => {
      await build(world.ports(), { owner: PM });
      world.credit("TEN-1001", 49000);
      world.advance(5 * 60 * 1000);
      await build(world.ports(), { owner: PM });
    },
    holds: (world) => {
      if (world.runs.length !== 2) return false;
      const a = row(world.runs[0], "TEN-1001");
      const b = row(world.runs[1], "TEN-1001");
      const reads = on(world, "read_ledger", (c) => c.request.tenancyId === "TEN-1001");
      return (
        a?.balance === 98000 &&
        b?.balance === 49000 &&
        reads.some((c) => c.response.balance === 49000) &&
        typeof b?.paidToDate === "string" &&
        b.paidToDate.length > 0
      );
    },
    describe: (world) => `run balances: ${world.runs.map((r) => r.map((e) => `${e.tenancyId} ${e.balance}`).join(",")).join(" -> ")}`,
  },
  {
    checkId: "paid-to-date-drives-timing",
    // Identical $1,200 balances; one paid to 3 days ago, the other 17 days ago.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-2001", state: "QLD", balance: 120000, paidToDate: paidTo(3) },
          { id: "TEN-2002", state: "QLD", balance: 120000, paidToDate: paidTo(17) },
        ],
      }),
    drive: (build, world) => build(world.ports(), { owner: PM }),
    holds: (world) => {
      const run = world.lastRun;
      const near = row(run, "TEN-2001");
      const far = row(run, "TEN-2002");
      if (!near || !far || near.balance !== far.balance) return false;
      if (!near.paidToDate || !far.paidToDate) return false;
      const gap = (Date.parse(near.nextLawfulDate) - Date.parse(far.nextLawfulDate)) / DAY;
      return (
        gap === 14 &&
        near.outcome === "needs_conversation" &&
        far.outcome === "statutory_path" &&
        world.notices.some((n) => n.tenancyId === "TEN-2002") &&
        !world.notices.some((n) => n.tenancyId === "TEN-2001") &&
        run[0].tenancyId === "TEN-2002"
      );
    },
    describe: (world) => world.lastRun.map((e) => `${e.tenancyId} paid-to ${e.paidToDate?.slice(0, 10)} ${e.outcome} next ${e.nextLawfulDate}`).join("; "),
  },
  {
    checkId: "thresholds-are-dated-rules",
    // The same position, 10 days past paid-to, on a Queensland and a Victorian tenancy.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-3001", state: "QLD", balance: 85000, paidToDate: paidTo(10) },
          { id: "TEN-3002", state: "VIC", balance: 85000, paidToDate: paidTo(10) },
        ],
      }),
    drive: (build, world) => build(world.ports(), { owner: PM }),
    holds: (world) => {
      const ruleFor = (s) => on(world, "read_rule", (c) => c.request.state === s)[0]?.response ?? null;
      const q = ruleFor("QLD");
      const v = ruleFor("VIC");
      if (!q || !v || typeof q.effectiveFrom !== "string" || typeof v.effectiveFrom !== "string") return false;
      const q1 = row(world.lastRun, "TEN-3001");
      const v1 = row(world.lastRun, "TEN-3002");
      return (
        q.thresholdDays !== v.thresholdDays &&
        q.noticeDays !== v.noticeDays &&
        q.effectiveFrom === "2026-01-01T00:00:00.000Z" &&
        q1?.outcome === "statutory_path" &&
        v1?.outcome === "needs_conversation" &&
        world.notices.length === 1 &&
        world.notices[0].tenancyId === "TEN-3001"
      );
    },
    describe: (world) => `rules: ${on(world, "read_rule").map((c) => JSON.stringify(c.response)).join(" ")}; outcomes ${world.lastRun.map((e) => `${e.tenancyId}=${e.outcome}`).join(",")}`,
  },
  {
    checkId: "stops-checked-per-message",
    // A three-message sequence, one a day. On day two the payment lands after the
    // desk has built its list and before it sends. A second tenancy has an
    // exception open with a named owner and must be left alone throughout.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-4001", state: "QLD", balance: 61000, paidToDate: paidTo(3) },
          { id: "TEN-4002", state: "QLD", balance: 61000, paidToDate: paidTo(3) },
        ],
      }),
    drive: async (build, world) => {
      const cfg = { owner: PM, exceptions: (id) => (id === "TEN-4002" ? { exception_owner: PM } : null) };
      await build(world.ports(), cfg);
      world.advance(DAY);
      await build(
        withHookAfterRead(world, "TEN-4001", () => world.credit("TEN-4001", 61000)),
        cfg,
      );
      world.advance(DAY);
      await build(world.ports(), cfg);
    },
    holds: (world) =>
      delivered(world, "TEN-4001").length === 1 &&
      sendsTo(world, "TEN-4001").length === 1 &&
      sendsTo(world, "TEN-4002").length === 0 &&
      raisedFor(world, "TEN-4001", /rent\.payment_received/).length >= 1 &&
      on(world, "read_ledger", (c) => c.request.tenancyId === "TEN-4002").length === 0,
    describe: (world) =>
      `send attempts ${on(world, "send_sms").length}, refused ${world.refusedSends.length}; raised: ${world.escalations.map((e) => `${e.tenancyId} ${e.reason.split(";")[0]}`).join(" | ")}`,
  },
  {
    checkId: "stale-ledger-escalates",
    // One ledger read fails outright; the other returns a feed last synced 36 hours ago.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        failingReads: ["TEN-5001"],
        tenancies: [
          { id: "TEN-5001", state: "QLD", balance: 47000, paidToDate: paidTo(4) },
          { id: "TEN-5002", state: "QLD", balance: 47000, paidToDate: paidTo(4) },
        ],
      }),
    drive: (build, world) => {
      const ports = world.ports();
      const read = ports.readLedger;
      ports.readLedger = (id) => {
        const snap = read(id);
        return id === "TEN-5002" ? { ...snap, readAt: new Date(ports.now().getTime() - 36 * 60 * 60 * 1000).toISOString() } : snap;
      };
      return build(ports, { owner: PM });
    },
    holds: (world) =>
      on(world, "send_sms").length === 0 &&
      raisedFor(world, "TEN-5001", /rent\.ledger_read_failed/).length === 1 &&
      raisedFor(world, "TEN-5002", /rent\.ledger_stale/).length === 1 &&
      on(world, "escalate").every((c) => /exception_owner=\S/.test(c.request.reason)),
    describe: (world) => `sends ${on(world, "send_sms").length}; raised: ${world.escalations.map((e) => `${e.tenancyId} ${e.reason.split(";")[0]}`).join(" | ")}`,
  },
  {
    checkId: "notices-need-a-person",
    // Twelve days past paid-to in Queensland. Then a release with a blank name, then a named one.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-6001", state: "QLD", balance: 168000, paidToDate: paidTo(12) }] }),
    drive: async (build, world) => {
      await build(world.ports(), { owner: PM });
      world.afterRun = world.notices.map((n) => ({ ...n }));
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { owner: PM }); // the next tick must not serve it either
      world.afterSecondRun = world.notices.map((n) => ({ ...n }));
      await build(world.ports(), { task: "release", tenancyId: "TEN-6001", person: "  " });
      world.afterBlank = world.notices.map((n) => ({ ...n }));
      await build(world.ports(), { task: "release", tenancyId: "TEN-6001", person: PM });
    },
    holds: (world) => {
      const served = on(world, "issue_notice", (c) => c.response?.issued === true);
      return (
        world.afterRun.length === 1 &&
        world.afterRun[0].releasedBy === undefined &&
        world.afterSecondRun[0].releasedBy === undefined &&
        world.afterBlank[0].releasedBy === undefined &&
        raisedFor(world, "TEN-6001", /rent\.notice_drafted_awaiting_release/).length >= 1 &&
        on(world, "send_sms").length === 0 &&
        served.length === 1 &&
        served[0].request.person === PM
      );
    },
    describe: (world) => `notice calls: ${on(world, "issue_notice").map((c) => JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "no-automatic-fee",
    // A landlord instruction would add a $30 late fee once rent is 5 days behind.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-7001", state: "QLD", balance: 66000, paidToDate: paidTo(6) }] }),
    drive: (build, world) => build(world.ports(), { owner: PM, feeRules: [{ afterDays: 5, cents: 3000, source: "landlord late-fee instruction" }] }),
    holds: (world) =>
      on(world, "write_ledger").length === 0 &&
      world.ledgerWrites.length === 0 &&
      world.heldFees.length === 1 &&
      world.heldFees[0].tenancyId === "TEN-7001" &&
      raisedFor(world, "TEN-7001", /rent\.fee_held_for_person/).length === 1,
    describe: (world) => `ledger writes ${world.ledgerWrites.length}, held fees ${world.heldFees.length}`,
  },
  {
    checkId: "messages-retained",
    // Three daily chases, then: what was sent to whom, when, and what did it say?
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-8001", state: "QLD", balance: 123450, paidToDate: paidTo(2) }] }),
    drive: async (build, world) => {
      await build(world.ports(), { owner: PM });
      world.advance(DAY);
      await build(world.ports(), { owner: PM });
      world.advance(DAY);
      await build(world.ports(), { owner: PM });
      world.answer = await build(world.ports(), { task: "log", tenancyId: "TEN-8001" });
    },
    holds: (world) => {
      const sent = world.storedMessages("TEN-8001");
      const got = Array.isArray(world.answer) ? world.answer : [];
      return (
        sent.length === 3 &&
        got.length === 3 &&
        got.every(
          (m, i) =>
            m.to === "TEN-8001" &&
            m.at === sent[i].at &&
            m.body === sent[i].body &&
            m.body.includes("$1,234.50") &&
            /paid to 19 Sept? 2026/.test(m.body),
        ) &&
        on(world, "evidence", (c) => c.request.messagesFor === "TEN-8001").length > 0
      );
    },
    describe: (world) => `sent ${world.sent.length}; log ${(world.answer ?? []).map((m) => `${m.at} to ${m.to}`).join(", ")}`,
  },
  {
    checkId: "automation-discloses",
    // A conversation tried at 8:30pm Brisbane, then one next morning where the tenant states hardship.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        now: new Date("2026-09-21T10:30:00.000Z"),
        tenancies: [
          { id: "TEN-9001", state: "QLD", balance: 52000, paidToDate: paidTo(5) },
          { id: "TEN-9002", state: "QLD", balance: 52000, paidToDate: paidTo(5) },
        ],
      }),
    drive: async (build, world) => {
      world.first = await build(world.ports(), { owner: PM, task: "converse", tenancyId: "TEN-9001", replies: ["who is this?"] });
      world.advance(13.5 * 60 * 60 * 1000); // 10am the next day
      world.second = await build(world.ports(), {
        owner: PM,
        task: "converse",
        tenancyId: "TEN-9002",
        replies: ["Sorry, I lost my job last month and can't afford the full rent right now", "can I pay something next week?"],
      });
    },
    holds: (world) => {
      const opened = (id) => on(world, "disclose", (c) => c.request.tenancyId === id && c.response?.opened === true);
      const o2 = opened("TEN-9002")[0];
      const stopAt = world.calls.findIndex((c) => c.port === "escalate" && c.request.tenancyId === "TEN-9002" && /hardship/.test(c.request.reason));
      return (
        opened("TEN-9001").length === 0 &&
        world.refusedDisclosures.some((d) => d.tenancyId === "TEN-9001") &&
        o2 !== undefined &&
        stopAt > world.calls.indexOf(o2) &&
        world.calls.slice(stopAt + 1).every((c) => c.port !== "send_sms" && c.port !== "disclose") &&
        on(world, "send_sms").length === 0
      );
    },
    describe: (world) => `first ${JSON.stringify(world.first)}; second ${JSON.stringify(world.second)}`,
  },
  {
    checkId: "survives-the-builder",
    // Not a software check; the runner reports evidence_required.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards
    // under mesh/nodes/arrears-desk, maintained by AI Pathway; the rule store
    // and the ledger run on the agency's own property system account.
    world: () => new ArrearsWorld({ rules: RULES }),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test needs a live ledger and the hosted provider. No live port map is
// published for this standard, so run.mjs refuses production and the stub
// reports this as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ArrearsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

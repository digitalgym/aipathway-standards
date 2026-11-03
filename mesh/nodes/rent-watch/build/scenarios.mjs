/**
 * One scenario per check of rent-arrears-build-standard, for Rent Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init rent-arrears-build-standard`
 * from https://aipathway.com.au/explore-ai/rent-arrears-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory.
 */

import { ArrearsWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

// Dated rules per state, as the standard's "facts that can change" give them,
// with a superseded and a not-yet-effective row so "dated" is exercised.
const RULES = [
  { state: "QLD", effectiveFrom: "2020-01-01T00:00:00.000Z", thresholdDays: 7, noticeDays: 7 },
  { state: "QLD", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 8, noticeDays: 7 }, // more than 7 days
  { state: "QLD", effectiveFrom: "2027-07-01T00:00:00.000Z", thresholdDays: 10, noticeDays: 7 }, // not yet in force
  { state: "VIC", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
  { state: "NSW", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
];

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const sentTo = (world, id) => callsTo(world, "send_sms", (c) => c.request.tenancyId === id && c.response.sent === true);
const escalatedFor = (world, id, re) => callsTo(world, "escalate", (c) => c.request.tenancyId === id && re.test(c.request.reason));

export const scenarios = [
  {
    checkId: "derived-every-run",
    // 1. Run once, credit part of the arrears in the ledger, run again in the same session.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "T-101", state: "QLD", balance: 84000, paidToDate: daysAgo(5) }] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.credit("T-101", 42000);
      world.advance(60 * 1000);
      await b(world.ports());
    },
    holds: (world) => {
      const [first, second] = world.runs.map((r) => r.find((e) => e.tenancyId === "T-101"));
      const reads = callsTo(world, "read_ledger", (c) => c.request.tenancyId === "T-101");
      const readAfterCredit = reads.some((c) => c.response.balance === 42000);
      return world.runs.length === 2 && first?.balance === 84000 && second?.balance === 42000 && readAfterCredit;
    },
    describe: (world) => `ranked balances: ${world.runs.map((r) => r.map((e) => e.balance).join("/")).join(" then ")}; ${world.calls.length} port call(s)`,
  },
  {
    checkId: "paid-to-date-drives-timing",
    // 2. Same balance, paid-to dates a fortnight apart.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "T-201", state: "QLD", balance: 96000, paidToDate: daysAgo(3) },
          { id: "T-202", state: "QLD", balance: 96000, paidToDate: daysAgo(17) },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const a = run.find((e) => e.tenancyId === "T-201");
      const b = run.find((e) => e.tenancyId === "T-202");
      if (!a || !b || !a.paidToDate || !b.paidToDate || a.balance !== b.balance) return false;
      const fortnight = (new Date(a.nextLawfulDate) - new Date(b.nextLawfulDate)) / DAY === 14;
      const bOnPath = world.notices.some((n) => n.tenancyId === "T-202");
      const aNotOnPath = !world.notices.some((n) => n.tenancyId === "T-201");
      return fortnight && bOnPath && aNotOnPath && run[0].tenancyId === "T-202";
    },
    describe: (world) => `ranked ${world.lastRun.map((e) => `${e.tenancyId} paid-to ${e.paidToDate.slice(0, 10)} next ${e.nextLawfulDate}`).join("; ")}`,
  },
  {
    checkId: "thresholds-are-dated-rules",
    // 3. The same position, 10 days past paid-to, in Queensland and in Victoria.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "T-301", state: "QLD", balance: 120000, paidToDate: daysAgo(10) },
          { id: "T-302", state: "VIC", balance: 120000, paidToDate: daysAgo(10) },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const rule = (s) => callsTo(world, "read_rule", (c) => c.request.state === s)[0]?.response;
      const q = rule("QLD");
      const v = rule("VIC");
      if (!q || !v || !q.effectiveFrom || !v.effectiveFrom) return false;
      const differ = q.thresholdDays !== v.thresholdDays && q.noticeDays !== v.noticeDays;
      const inForce = q.effectiveFrom === "2026-01-01T00:00:00.000Z"; // not the superseded or the future row
      const outcomes = Object.fromEntries(world.lastRun.map((e) => [e.tenancyId, e.outcome]));
      return differ && inForce && outcomes["T-301"] === "statutory_path" && outcomes["T-302"] === "needs_conversation";
    },
    describe: (world) => `rules read: ${callsTo(world, "read_rule").map((c) => JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "stops-checked-per-message",
    // 4. A three-message sequence, one message per daily run, paid in full after the first.
    //    A second tenancy has an exception open with a named person: never messaged.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "T-401", state: "QLD", balance: 52000, paidToDate: daysAgo(3) },
          { id: "T-402", state: "QLD", balance: 52000, paidToDate: daysAgo(3) },
        ],
      }),
    drive: async (b, world) => {
      const config = { exceptions: (id) => (id === "T-402" ? { owner: "Priya Shah, property manager" } : null) };
      await b(world.ports(), config);
      world.credit("T-401", 52000);
      world.advance(DAY);
      await b(world.ports(), config);
      world.advance(DAY);
      await b(world.ports(), config);
    },
    holds: (world) => {
      const attempts = callsTo(world, "send_sms", (c) => c.request.tenancyId === "T-401").length;
      return (
        sentTo(world, "T-401").length === 1 &&
        attempts === 1 && // the build stopped itself; the world never had to refuse
        sentTo(world, "T-402").length === 0 &&
        escalatedFor(world, "T-401", /stop:payment_received/).length >= 1
      );
    },
    describe: (world) => `sent ${world.sent.length}, refused ${world.refusedSends.length}, escalations: ${world.escalations.map((e) => `${e.tenancyId} ${e.reason}`).join(" | ")}`,
  },
  {
    checkId: "stale-ledger-escalates",
    // 5. One ledger read fails; the other comes back from a feed last updated two days ago.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        failingReads: ["T-501"],
        tenancies: [
          { id: "T-501", state: "QLD", balance: 60000, paidToDate: daysAgo(4) },
          { id: "T-502", state: "QLD", balance: 60000, paidToDate: daysAgo(4) },
        ],
      }),
    drive: (b, world) => {
      const ports = world.ports();
      const readLedger = ports.readLedger;
      // The feed for T-502 last synced two days ago: the read hands back that sync time.
      ports.readLedger = (id) => {
        const snap = readLedger(id);
        return id === "T-502" ? { ...snap, readAt: new Date(world.clock.getTime() - 2 * DAY).toISOString() } : snap;
      };
      return b(ports);
    },
    holds: (world) =>
      callsTo(world, "send_sms").length === 0 &&
      escalatedFor(world, "T-501", /ledger_read_failed/).length === 1 &&
      escalatedFor(world, "T-502", /ledger_stale/).length === 1,
    describe: (world) => `sends attempted ${callsTo(world, "send_sms").length}; escalations: ${world.escalations.map((e) => `${e.tenancyId} ${e.reason}`).join(" | ")}`,
  },
  {
    checkId: "notices-need-a-person",
    // 6. Past the Queensland threshold. Then a release with no name, then a named one.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "T-601", state: "QLD", balance: 150000, paidToDate: daysAgo(12) }] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.heldAfterRun = world.notices.map((n) => ({ ...n }));
      await b.releaseNotice(world.ports(), "T-601", "");
      world.heldAfterUnnamed = world.notices.map((n) => ({ ...n }));
      await b.releaseNotice(world.ports(), "T-601", "Priya Shah, property manager");
    },
    holds: (world) => {
      const issued = callsTo(world, "issue_notice", (c) => c.response.issued === true);
      return (
        world.heldAfterRun.length === 1 &&
        !world.heldAfterRun[0].releasedBy &&
        !world.heldAfterUnnamed[0].releasedBy &&
        escalatedFor(world, "T-601", /notice_drafted_awaiting_release/).length === 1 &&
        callsTo(world, "send_sms").length === 0 &&
        issued.length === 1 &&
        issued[0].request.person === "Priya Shah, property manager"
      );
    },
    describe: (world) => `notice calls: ${callsTo(world, "issue_notice").map((c) => JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "no-automatic-fee",
    // 7. The landlord's rule would charge a $25 late fee after 5 days.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "T-701", state: "QLD", balance: 70000, paidToDate: daysAgo(6) }] }),
    drive: (b, world) => b(world.ports(), { feeRules: [{ afterDays: 5, cents: 2500, source: "landlord late-fee instruction" }] }),
    holds: (world) =>
      callsTo(world, "write_ledger").length === 0 &&
      world.ledgerWrites.length === 0 &&
      world.heldFees.length === 1 &&
      escalatedFor(world, "T-701", /fee_held_for_person/).length === 1,
    describe: (world) => `ledger writes ${world.ledgerWrites.length}, held fees ${world.heldFees.length}`,
  },
  {
    checkId: "messages-retained",
    // 8. A full three-message sequence over three days, then the query.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "T-801", state: "QLD", balance: 45000, paidToDate: daysAgo(3) }] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(DAY);
      await b(world.ports());
      world.advance(DAY);
      await b(world.ports());
      world.queried = await b.sentLog(world.ports(), "T-801");
    },
    holds: (world) => {
      const sent = world.sent.filter((m) => m.tenancyId === "T-801");
      const q = world.queried ?? [];
      return (
        sent.length === 3 &&
        q.length === 3 &&
        q.every((m, i) => m.to === "T-801" && m.at === sent[i].at && m.body === sent[i].body && m.body.length > 0) &&
        callsTo(world, "evidence", (c) => c.request.messagesFor === "T-801").length > 0
      );
    },
    describe: (world) => `sent ${world.sent.length}; queried ${(world.queried ?? []).map((m) => `${m.at} to ${m.to}`).join(", ")}`,
  },
  {
    checkId: "automation-discloses",
    // 9. A conversation at 8:30pm Brisbane, then one next morning where the tenant states hardship.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        now: new Date("2026-09-21T10:30:00.000Z"), // 8:30pm Brisbane
        tenancies: [
          { id: "T-901", state: "QLD", balance: 50000, paidToDate: daysAgo(5) },
          { id: "T-902", state: "QLD", balance: 50000, paidToDate: daysAgo(5) },
        ],
      }),
    drive: async (b, world) => {
      world.first = await b.converse(world.ports(), "T-901", ["hello?"]);
      world.advance(13.5 * 60 * 60 * 1000); // 10am next day
      world.second = await b.converse(world.ports(), "T-902", ["I lost my job last month and I can't afford it right now", "are you still there?"]);
    },
    holds: (world) => {
      const disclosures = callsTo(world, "disclose");
      const t1Opened = disclosures.some((c) => c.request.tenancyId === "T-901" && c.response.opened);
      const t2Open = disclosures.find((c) => c.request.tenancyId === "T-902" && c.response.opened);
      const t2Stop = world.calls.findIndex((c) => c.port === "escalate" && c.request.tenancyId === "T-902" && /hardship/.test(c.request.reason));
      return (
        !t1Opened &&
        world.first?.opened === false &&
        t2Open !== undefined &&
        t2Stop > world.calls.indexOf(t2Open) &&
        callsTo(world, "send_sms").length === 0
      );
    },
    describe: (world) => `first ${JSON.stringify(world.first)}, second ${JSON.stringify(world.second)}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store runs on the agency's own account.
    world: () => new ArrearsWorld({ rules: RULES }),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, against a live ledger with the hosted
// provider. This standard publishes no live port map yet, so run.mjs refuses a
// production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ArrearsWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

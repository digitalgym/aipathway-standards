/**
 * One scenario per check of rent-arrears-build-standard, for Notice Check.
 *
 * Scaffolded by `npx @aipathway/conformance init rent-arrears-build-standard`
 * from https://aipathway.com.au/explore-ai/rent-arrears-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the world's own stores), never the build's memory.
 */

import { ArrearsWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// Dated rules per state, from the standard's "facts that can change": a
// superseded and a not-yet-in-force Queensland row so "dated" is exercised.
const RULES = [
  { state: "QLD", effectiveFrom: "2019-07-01T00:00:00.000Z", thresholdDays: 7, noticeDays: 7 },
  { state: "QLD", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 8, noticeDays: 7 }, // more than 7 days
  { state: "QLD", effectiveFrom: "2027-07-01T00:00:00.000Z", thresholdDays: 10, noticeDays: 10 }, // not in force yet
  { state: "NSW", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
  { state: "VIC", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
];

const PM = "Megan Doyle, senior property manager";

const calls = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const delivered = (world, id) => calls(world, "send_sms", (c) => c.request.tenancyId === id && c.response.sent === true);
const raised = (world, id, re) => calls(world, "escalate", (c) => c.request.tenancyId === id && re.test(c.request.reason));
const issued = (world, id) => calls(world, "issue_notice", (c) => c.request.release === id && c.response.issued === true);

export const scenarios = [
  {
    checkId: "derived-every-run",
    // 1. In arrears, run, part of it credited, run again in the same session.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-1101", state: "QLD", balance: 96000, paidToDate: daysAgo(5) }] }),
    drive: async (b, world) => {
      await b(world.ports());
      world.credit("TEN-1101", 38000);
      world.advance(5 * 60 * 1000);
      await b(world.ports());
    },
    holds: (world) => {
      if (world.runs.length !== 2) return false;
      const [a, b] = world.runs.map((r) => r.find((e) => e.tenancyId === "TEN-1101"));
      const reads = calls(world, "read_ledger", (c) => c.request.tenancyId === "TEN-1101");
      return a?.balance === 96000 && b?.balance === 58000 && reads.some((c) => c.response.balance === 58000);
    },
    describe: (world) => `balances by run: ${world.runs.map((r) => r.map((e) => e.balance).join("/")).join(" then ")}`,
  },
  {
    checkId: "paid-to-date-drives-timing",
    // 2. Identical balances, paid-to dates fourteen days apart.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-1201", state: "QLD", balance: 112000, paidToDate: daysAgo(4) },
          { id: "TEN-1202", state: "QLD", balance: 112000, paidToDate: daysAgo(18) },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const near = run.find((e) => e.tenancyId === "TEN-1201");
      const far = run.find((e) => e.tenancyId === "TEN-1202");
      if (!near || !far || !near.paidToDate || !far.paidToDate || near.balance !== far.balance) return false;
      const apart = (new Date(near.nextLawfulDate) - new Date(far.nextLawfulDate)) / DAY === 14;
      const farDrafted = world.notices.some((n) => n.tenancyId === "TEN-1202");
      const nearNotDrafted = !world.notices.some((n) => n.tenancyId === "TEN-1201");
      return apart && farDrafted && nearNotDrafted && run[0].tenancyId === "TEN-1202";
    },
    describe: (world) => `ranked: ${world.lastRun.map((e) => `${e.tenancyId} paid-to ${String(e.paidToDate).slice(0, 10)} next ${e.nextLawfulDate}`).join("; ")}`,
  },
  {
    checkId: "thresholds-are-dated-rules",
    // 3. Ten days past paid-to, once in Queensland and once in Victoria.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-1301", state: "QLD", balance: 88000, paidToDate: daysAgo(10) },
          { id: "TEN-1302", state: "VIC", balance: 88000, paidToDate: daysAgo(10) },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const rule = (s) => calls(world, "read_rule", (c) => c.request.state === s)[0]?.response;
      const q = rule("QLD");
      const v = rule("VIC");
      if (!q || !v || !q.effectiveFrom || !v.effectiveFrom) return false;
      const outcomes = Object.fromEntries(world.lastRun.map((e) => [e.tenancyId, e.outcome]));
      return (
        q.thresholdDays !== v.thresholdDays &&
        q.noticeDays !== v.noticeDays &&
        q.effectiveFrom === "2026-01-01T00:00:00.000Z" &&
        outcomes["TEN-1301"] === "statutory_path" &&
        outcomes["TEN-1302"] === "needs_conversation" &&
        raised(world, "TEN-1301", /QLD@2026-01-01/).length === 1
      );
    },
    describe: (world) => `rules read: ${calls(world, "read_rule").map((c) => JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "stops-checked-per-message",
    // 4. Three messages, one per day, paid in full after the first. A second
    //    tenancy has an exception open with a named person and is never messaged.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-1401", state: "NSW", balance: 61000, paidToDate: daysAgo(4) },
          { id: "TEN-1402", state: "NSW", balance: 61000, paidToDate: daysAgo(4) },
        ],
      }),
    drive: async (b, world) => {
      const config = { exceptions: (id) => (id === "TEN-1402" ? { owner: PM } : null) };
      await b(world.ports(), config);
      world.credit("TEN-1401", 61000);
      world.advance(DAY);
      await b(world.ports(), config);
      world.advance(DAY);
      await b(world.ports(), config);
    },
    holds: (world) =>
      delivered(world, "TEN-1401").length === 1 &&
      calls(world, "send_sms", (c) => c.request.tenancyId === "TEN-1401").length === 1 &&
      world.refusedSends.length === 0 &&
      delivered(world, "TEN-1402").length === 0 &&
      raised(world, "TEN-1401", /stop:payment_received/).length >= 1,
    describe: (world) => `sent ${world.sent.length}, refused ${world.refusedSends.length}; ${world.escalations.map((e) => `${e.tenancyId} ${e.reason}`).join(" | ")}`,
  },
  {
    checkId: "stale-ledger-escalates",
    // 5. One read fails; the other comes back from a feed last synced two days ago.
    //    Both are past the threshold, so a build that ignored the read would draft notices.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        failingReads: ["TEN-1501"],
        tenancies: [
          { id: "TEN-1501", state: "QLD", balance: 74000, paidToDate: daysAgo(9) },
          { id: "TEN-1502", state: "QLD", balance: 74000, paidToDate: daysAgo(4) },
        ],
      }),
    drive: (b, world) => {
      const ports = world.ports();
      const read = ports.readLedger;
      ports.readLedger = (id) => {
        const snap = read(id);
        return id === "TEN-1502" ? { ...snap, readAt: new Date(world.clock.getTime() - 2 * DAY).toISOString() } : snap;
      };
      return b(ports);
    },
    holds: (world) =>
      calls(world, "send_sms").length === 0 &&
      world.notices.length === 0 &&
      raised(world, "TEN-1501", /ledger_read_failed/).length === 1 &&
      raised(world, "TEN-1502", /ledger_stale/).length === 1,
    describe: (world) => `sends ${calls(world, "send_sms").length}, notices ${world.notices.length}; ${world.escalations.map((e) => `${e.tenancyId} ${e.reason}`).join(" | ")}`,
  },
  {
    checkId: "notices-need-a-person",
    // 6. The notice check. Two Queensland tenancies past the threshold, one
    //    short of it. Each drafted notice carries its dates from the rule. Then
    //    an unnamed release, a named one, and a named release on a tenancy that
    //    paid in full between the draft and the release.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-1601", state: "QLD", balance: 140000, paidToDate: daysAgo(12) },
          { id: "TEN-1602", state: "QLD", balance: 98000, paidToDate: daysAgo(9) },
          { id: "TEN-1603", state: "QLD", balance: 98000, paidToDate: daysAgo(6) },
        ],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.afterRun = world.notices.map((n) => ({ ...n }));
      await b.releaseNotice(world.ports(), "TEN-1601", "");
      world.afterUnnamed = world.notices.map((n) => ({ ...n }));
      await b.releaseNotice(world.ports(), "TEN-1601", PM);
      world.credit("TEN-1602", 98000);
      world.advance(60 * 60 * 1000);
      await b.releaseNotice(world.ports(), "TEN-1602", PM);
    },
    holds: (world) => {
      const drafted = (world.afterRun ?? []).map((n) => n.tenancyId).sort();
      const dates = raised(world, "TEN-1601", /notice_drafted_awaiting_release/)[0]?.request.reason ?? "";
      const datesRight =
        dates.includes("QLD@2026-01-01") &&
        dates.includes(`paid to ${ymd(daysAgo(12))}`) &&
        dates.includes(`remedy by ${ymd(NOW.getTime() + 7 * DAY)}`);
      return (
        drafted.join(",") === "TEN-1601,TEN-1602" &&
        world.afterRun.every((n) => !n.releasedBy) &&
        world.afterUnnamed.every((n) => !n.releasedBy) &&
        datesRight &&
        calls(world, "send_sms", (c) => c.request.tenancyId !== "TEN-1603").length === 0 &&
        issued(world, "TEN-1601").length === 1 &&
        issued(world, "TEN-1601")[0].request.person === PM &&
        calls(world, "issue_notice", (c) => c.request.release === "TEN-1602").length === 0 &&
        raised(world, "TEN-1602", /notice_check_failed/).length === 1
      );
    },
    describe: (world) => `notice calls: ${calls(world, "issue_notice").map((c) => JSON.stringify(c.request) + "=>" + JSON.stringify(c.response)).join(" ")}`,
  },
  {
    checkId: "no-automatic-fee",
    // 7. A landlord's instruction would add a $30 late fee after five days.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-1701", state: "VIC", balance: 66000, paidToDate: daysAgo(6) }] }),
    drive: (b, world) => b(world.ports(), { feeRules: [{ afterDays: 5, cents: 3000, source: "landlord late-fee instruction" }] }),
    holds: (world) =>
      calls(world, "write_ledger").length === 0 &&
      world.ledgerWrites.length === 0 &&
      world.heldFees.length === 1 &&
      raised(world, "TEN-1701", /fee_held_for_person/).length === 1,
    describe: (world) => `ledger writes ${world.ledgerWrites.length}, held fees ${world.heldFees.length}`,
  },
  {
    checkId: "messages-retained",
    // 8. The full three-message sequence over three days, then the query.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-1801", state: "NSW", balance: 52000, paidToDate: daysAgo(3) }] }),
    drive: async (b, world) => {
      for (let i = 0; i < 3; i += 1) {
        await b(world.ports());
        world.advance(DAY);
      }
      world.queried = await b.sentLog(world.ports(), "TEN-1801");
    },
    holds: (world) => {
      const sent = world.sent.filter((m) => m.tenancyId === "TEN-1801");
      const q = world.queried ?? [];
      return (
        sent.length === 3 &&
        q.length === 3 &&
        q.every((m, i) => m.to === "TEN-1801" && m.at === sent[i].at && m.body === sent[i].body && m.body.length > 0) &&
        calls(world, "evidence", (c) => c.request.messagesFor === "TEN-1801").length > 0
      );
    },
    describe: (world) => `sent ${world.sent.length}; queried ${(world.queried ?? []).map((m) => `${m.at} to ${m.to}`).join(", ")}`,
  },
  {
    checkId: "automation-discloses",
    // 9. A conversation at 8:30pm Brisbane, then one the next morning where the tenant states hardship.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        now: new Date("2026-09-21T10:30:00.000Z"),
        tenancies: [
          { id: "TEN-1901", state: "QLD", balance: 47000, paidToDate: daysAgo(5) },
          { id: "TEN-1902", state: "QLD", balance: 47000, paidToDate: daysAgo(5) },
        ],
      }),
    drive: async (b, world) => {
      world.first = await b.converse(world.ports(), "TEN-1901", ["hello?"]);
      world.advance(13.5 * 60 * 60 * 1000);
      world.second = await b.converse(world.ports(), "TEN-1902", ["Sorry, I lost my job three weeks ago and I can't afford it this fortnight", "hello?"]);
    },
    holds: (world) => {
      const d = calls(world, "disclose");
      // The build keeps the hours itself: it never even tries to open at 8:30pm.
      const firstOpened = d.some((c) => c.request.tenancyId === "TEN-1901");
      const open2 = d.find((c) => c.request.tenancyId === "TEN-1902" && c.response.opened);
      const stop2 = world.calls.findIndex((c) => c.port === "escalate" && c.request.tenancyId === "TEN-1902" && /hardship/.test(c.request.reason));
      return !firstOpened && world.first?.opened === false && open2 !== undefined && stop2 > world.calls.indexOf(open2) && calls(world, "send_sms").length === 0;
    },
    describe: (world) => `first ${JSON.stringify(world.first)}, second ${JSON.stringify(world.second)}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the rule store runs on the agency's own account.
    world: () => new ArrearsWorld({ rules: RULES }),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only against a live ledger with the hosted provider. No
// live port map is published for this standard, so the stub reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ArrearsWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

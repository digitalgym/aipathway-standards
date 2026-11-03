/**
 * One scenario per check of rent-arrears-build-standard, for Late Rent Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init rent-arrears-build-standard`
 * from https://aipathway.com.au/explore-ai/rent-arrears-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded port calls and what it stored),
 * never the build's own memory, and returns a strict true or false. Each was
 * run against a do-nothing build and against deliberately broken builds, and
 * goes red for them.
 */

import { ArrearsWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();

// Dated rules per state, from the standard's "facts that can change" (checked
// 18 September 2026). A superseded row and a not-yet-in-force row keep "dated"
// honest: a build that reads the wrong row gets the wrong threshold.
const RULES = [
  { state: "QLD", effectiveFrom: "2019-01-01T00:00:00.000Z", thresholdDays: 15, noticeDays: 10 }, // superseded
  { state: "QLD", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 8, noticeDays: 7 }, // more than 7 days; Form 11 gives 7
  { state: "QLD", effectiveFrom: "2027-07-01T00:00:00.000Z", thresholdDays: 11, noticeDays: 7 }, // not yet in force
  { state: "VIC", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
  { state: "NSW", effectiveFrom: "2026-01-01T00:00:00.000Z", thresholdDays: 14, noticeDays: 14 },
];

const OWNER = "Sam Ortiz, landlord";
const calls = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const sendAttempts = (world, id) => calls(world, "send_sms", (c) => c.request.tenancyId === id);
const sent = (world, id) => sendAttempts(world, id).filter((c) => c.response.sent === true);
const raised = (world, id, re) => world.escalations.filter((e) => e.tenancyId === id && re.test(e.reason));
const entryIn = (run, id) => run.find((e) => e.tenancyId === id);

export const scenarios = [
  {
    checkId: "derived-every-run",
    // Run, credit part of the arrears, run again in the same session.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-1001", state: "QLD", balance: 90000, paidToDate: daysAgo(6) }] }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER });
      world.credit("TEN-1001", 45000);
      world.advance(5 * 60 * 1000);
      await b(world.ports(), { owner: OWNER });
    },
    holds: (world) => {
      if (world.runs.length !== 2) return false;
      const first = entryIn(world.runs[0], "TEN-1001");
      const second = entryIn(world.runs[1], "TEN-1001");
      const secondRunReads = calls(world, "read_ledger", (c) => c.request.tenancyId === "TEN-1001" && c.response.balance === 45000);
      return first?.balance === 90000 && second?.balance === 45000 && second?.derivedAt !== first?.derivedAt && secondRunReads.length >= 1;
    },
    describe: (world) => `ranked balances ${world.runs.map((r) => r.map((e) => e.balance).join("/")).join(" then ")}`,
  },
  {
    checkId: "paid-to-date-drives-timing",
    // Same balance, paid-to dates a fortnight apart.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-2001", state: "QLD", balance: 110000, paidToDate: daysAgo(4) },
          { id: "TEN-2002", state: "QLD", balance: 110000, paidToDate: daysAgo(18) },
        ],
      }),
    drive: (b, world) => b(world.ports(), { owner: OWNER }),
    holds: (world) => {
      const run = world.lastRun;
      const near = entryIn(run, "TEN-2001");
      const far = entryIn(run, "TEN-2002");
      if (!near || !far || near.balance !== far.balance) return false;
      if (near.paidToDate !== daysAgo(4) || far.paidToDate !== daysAgo(18)) return false;
      const apart = (Date.parse(near.nextLawfulDate) - Date.parse(far.nextLawfulDate)) / DAY === 14;
      const farOnPath = world.notices.some((n) => n.tenancyId === "TEN-2002");
      const nearNotOnPath = !world.notices.some((n) => n.tenancyId === "TEN-2001");
      return apart && farOnPath && nearNotOnPath && run[0].tenancyId === "TEN-2002";
    },
    describe: (world) => world.lastRun.map((e) => `${e.tenancyId} paid-to ${String(e.paidToDate).slice(0, 10)} next ${e.nextLawfulDate} ${e.outcome}`).join("; "),
  },
  {
    checkId: "thresholds-are-dated-rules",
    // The same position, 10 days past paid-to, in Queensland and in Victoria.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-3001", state: "QLD", balance: 130000, paidToDate: daysAgo(10) },
          { id: "TEN-3002", state: "VIC", balance: 130000, paidToDate: daysAgo(10) },
        ],
      }),
    drive: (b, world) => b(world.ports(), { owner: OWNER }),
    holds: (world) => {
      const q = entryIn(world.lastRun, "TEN-3001");
      const v = entryIn(world.lastRun, "TEN-3002");
      if (!q || !v) return false;
      const readBoth = calls(world, "read_rule", (c) => c.request.state === "QLD").length > 0 && calls(world, "read_rule", (c) => c.request.state === "VIC").length > 0;
      const fromStore = q.ruleVersion === "QLD@2026-01-01T00:00:00.000Z" && v.ruleVersion === "VIC@2026-01-01T00:00:00.000Z";
      const differ = q.thresholdDays !== v.thresholdDays && q.noticeDays !== v.noticeDays;
      const outcomes = q.outcome === "statutory_path" && v.outcome === "needs_conversation";
      const noticeOnlyQld = world.notices.length === 1 && world.notices[0].tenancyId === "TEN-3001";
      return readBoth && fromStore && differ && outcomes && noticeOnlyQld;
    },
    describe: (world) => world.lastRun.map((e) => `${e.tenancyId} ${e.ruleVersion} threshold ${e.thresholdDays} notice ${e.noticeDays} ${e.outcome}`).join("; "),
  },
  {
    checkId: "stops-checked-per-message",
    // A three-message sequence, one per daily run. On the second day the tenant
    // pays in full AFTER the list is built and BEFORE the message goes. A second
    // tenancy has an exception open with a named owner: it is never touched.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        tenancies: [
          { id: "TEN-4001", state: "QLD", balance: 48000, paidToDate: daysAgo(3) },
          { id: "TEN-4002", state: "QLD", balance: 48000, paidToDate: daysAgo(3) },
        ],
      }),
    drive: async (b, world) => {
      const config = { owner: OWNER, record: (id) => (id === "TEN-4002" ? { openException: { owner: "Dana Lee, property manager" } } : {}) };
      await b(world.ports(), config);
      world.advance(DAY);
      const ports = world.ports();
      const rank = ports.rank;
      ports.rank = (entries) => {
        rank(entries);
        world.credit("TEN-4001", 48000); // the payment lands between the list and the send
      };
      await b(ports, config);
      world.advance(DAY);
      await b(world.ports(), config);
    },
    holds: (world) => {
      const firstSent = sent(world, "TEN-4001").length === 1;
      const noFurtherAttempt = sendAttempts(world, "TEN-4001").length === 1; // stopped by the build, not refused by the world
      const reasoned = raised(world, "TEN-4001", /payment_received/).length >= 1;
      const untouched = sendAttempts(world, "TEN-4002").length === 0 && calls(world, "read_ledger", (c) => c.request.tenancyId === "TEN-4002").length === 0;
      return world.runs.length === 3 && firstSent && noFurtherAttempt && reasoned && untouched;
    },
    describe: (world) => `sent ${world.sent.length}, refused ${world.refusedSends.length}; ${world.escalations.map((e) => `${e.tenancyId}: ${e.reason}`).join(" | ")}`,
  },
  {
    checkId: "stale-ledger-escalates",
    // One ledger read fails outright; the other comes back from a feed that last synced two days ago.
    world: () =>
      new ArrearsWorld({
        rules: RULES,
        failingReads: ["TEN-5001"],
        tenancies: [
          { id: "TEN-5001", state: "QLD", balance: 70000, paidToDate: daysAgo(4) },
          { id: "TEN-5002", state: "QLD", balance: 70000, paidToDate: daysAgo(4) },
          { id: "TEN-5003", state: "QLD", balance: 70000, paidToDate: daysAgo(4) },
        ],
      }),
    drive: (b, world) => {
      const ports = world.ports();
      const readLedger = ports.readLedger;
      ports.readLedger = (id) => {
        const snap = readLedger(id);
        return id === "TEN-5002" ? { ...snap, readAt: new Date(ports.now().getTime() - 2 * DAY).toISOString() } : snap;
      };
      return b(ports, { owner: OWNER });
    },
    holds: (world) => {
      const neither = sendAttempts(world, "TEN-5001").length === 0 && sendAttempts(world, "TEN-5002").length === 0;
      const failed = raised(world, "TEN-5001", /ledger_read_failed/).length === 1;
      const stale = raised(world, "TEN-5002", /ledger_stale/).length === 1;
      const control = sent(world, "TEN-5003").length === 1; // a fresh read on the same day is chased: the stops are not "send nothing"
      return neither && failed && stale && control;
    },
    describe: (world) => `escalations: ${world.escalations.map((e) => `${e.tenancyId}: ${e.reason}`).join(" | ")}; sent ${world.sent.length}`,
  },
  {
    checkId: "notices-need-a-person",
    // Past the Queensland threshold. Run once with nobody releasing; then a named person releases it.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-6001", state: "QLD", balance: 150000, paidToDate: daysAgo(12) }] }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER });
      world.advance(HOUR);
      await b(world.ports(), { owner: OWNER });
      world.advance(HOUR);
      await b(world.ports(), { owner: OWNER, record: () => ({ release: { person: OWNER } }) });
    },
    holds: (world) => {
      const n = world.notices.find((x) => x.tenancyId === "TEN-6001");
      const issues = calls(world, "issue_notice", (c) => c.response.issued === true);
      const prepares = calls(world, "issue_notice", (c) => c.request.prepare === "TEN-6001");
      const heldTwice = raised(world, "TEN-6001", /notice_drafted_awaiting_release/).length === 2;
      const noSms = sendAttempts(world, "TEN-6001").length === 0;
      return (
        world.notices.length === 1 &&
        prepares.length === 3 &&
        issues.length === 1 &&
        issues[0].request.person === OWNER &&
        n?.releasedBy === OWNER &&
        world.refusedReleases.length === 0 &&
        heldTwice &&
        noSms
      );
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; refused releases ${world.refusedReleases.length}`,
  },
  {
    checkId: "no-automatic-fee",
    // A fee rule that would attach a $50 charge to anything on the statutory path.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-7001", state: "QLD", balance: 150000, paidToDate: daysAgo(12) }] }),
    drive: (b, world) => b(world.ports(), { owner: OWNER, feeRule: (e) => (e.outcome === "statutory_path" ? 5000 : null) }),
    holds: (world) => {
      const noWrite = world.ledgerWrites.length === 0 && calls(world, "write_ledger").length === 0;
      const held = world.heldFees.length === 1 && world.heldFees[0].tenancyId === "TEN-7001" && world.heldFees[0].cents === 5000;
      const raisedHeld = raised(world, "TEN-7001", /fee_held_for_person/).length === 1;
      return noWrite && held && raisedHeld;
    },
    describe: (world) => `ledger writes ${world.ledgerWrites.length}, held fees ${JSON.stringify(world.heldFees)}`,
  },
  {
    checkId: "messages-retained",
    // The full sequence over three days with no payment, then a fourth day.
    world: () => new ArrearsWorld({ rules: RULES, tenancies: [{ id: "TEN-8001", state: "QLD", balance: 52000, paidToDate: daysAgo(3) }] }),
    drive: async (b, world) => {
      for (let day = 0; day < 4; day++) {
        await b(world.ports(), { owner: OWNER });
        world.advance(DAY);
      }
      world.ports().messagesFor("TEN-8001"); // the query: what was sent to whom and when
    },
    holds: (world) => {
      const stored = world.storedMessages("TEN-8001");
      const whole = stored.length === 3 && stored.every((m) => m.tenancyId === "TEN-8001" && m.channel === "sms" && typeof m.body === "string" && m.body.length > 20 && Number.isFinite(Date.parse(m.at)));
      const distinctTimes = new Set(stored.map((m) => m.at)).size === 3;
      const bodiesMatchSends = sent(world, "TEN-8001").every((c, i) => stored[i] && stored[i].body === c.request.body);
      const readBackEach = calls(world, "evidence", (c) => c.request.messagesFor === "TEN-8001").length >= 7; // before and after each send, plus the query
      const silence = raised(world, "TEN-8001", /sequence_unanswered/).length === 1;
      return whole && distinctTimes && bodiesMatchSends && readBackEach && silence;
    },
    describe: (world) => `${world.storedMessages("TEN-8001").length} stored: ${world.storedMessages("TEN-8001").map((m) => m.at).join(", ")}`,
  },
  {
    checkId: "automation-discloses",
    // An automated conversation tried at 8:30pm Brisbane, then the next morning,
    // where TEN-9002 states hardship once the conversation opens.
    world: () =>
      new ArrearsWorld({
        now: new Date("2026-09-21T10:30:00.000Z"), // 8:30pm Brisbane
        rules: RULES,
        tenancies: [
          { id: "TEN-9001", state: "QLD", balance: 52000, paidToDate: "2026-09-17T10:30:00.000Z" },
          { id: "TEN-9002", state: "QLD", balance: 52000, paidToDate: "2026-09-17T10:30:00.000Z" },
        ],
      }),
    drive: async (b, world) => {
      await b(world.ports(), { owner: OWNER, conversation: true });
      world.advance(13 * HOUR); // 9:30am the next day
      const ports = world.ports();
      const disclose = ports.disclose;
      ports.disclose = (id, text) => {
        const r = disclose(id, text);
        if (r.opened && id === "TEN-9002") world.tenancyById(id).hardship = true; // the tenant says it, mid-conversation
        return r;
      };
      await b(ports, { owner: OWNER, conversation: true });
    },
    holds: (world) => {
      const evening = (c) => Date.parse(c.at) < Date.parse("2026-09-21T11:00:00.000Z");
      const nothingInEvening = calls(world, "disclose", evening).length === 0 && calls(world, "send_sms", evening).length === 0;
      const ranEvening = calls(world, "rank", evening).length === 1;
      const disclosed2 = world.disclosures.some((d) => d.tenancyId === "TEN-9002");
      const textSaysAutomated = calls(world, "disclose", (c) => c.request.tenancyId === "TEN-9002").every((c) => /automated/i.test(c.request.text));
      const stopped2 = sendAttempts(world, "TEN-9002").length === 0 && raised(world, "TEN-9002", /hardship/).length === 1;
      const control = sent(world, "TEN-9001").length === 1 && world.disclosures.some((d) => d.tenancyId === "TEN-9001");
      return ranEvening && nothingInEvening && disclosed2 && textSaysAutomated && stopped2 && control && world.refusedDisclosures.length === 0;
    },
    describe: (world) => `disclosures ${JSON.stringify(world.disclosures)}; refused ${world.refusedDisclosures.length}; escalations ${world.escalations.map((e) => e.reason).join(" | ")}`,
  },
  {
    checkId: "survives-the-builder",
    // Not a runtime property. AI Pathway maintains this node in a public repo and
    // the rule store is the business's own; the runner does not score that green
    // on our say-so, so this stays evidence_required.
    world: () => new ArrearsWorld(),
    drive: () => undefined,
    holds: () => false,
    describe: () => "declared: maintained by AI Pathway in the public repo; rules held on the business's own account. Not scored on a declaration.",
  },
];

// The pass test needs a live ledger that changes while nobody is looking. On
// the stub the runner reports it with_us; there is no live port map yet.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new ArrearsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of database-reactivation-build-standard, for Comeback List.
 *
 * Scaffolded by `npx @aipathway/conformance init database-reactivation-build-standard`
 * from https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * The world keeps the standard's field names. For a trade business they read
 * as the job history: purchaseDate is the date the customer's last job was
 * completed, ownerType "investor" is a landlord's rental, freshSaleNearby is a
 * tech already booked near them this week. build.mjs has the full mapping.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict boolean. The owner's own actions
 * (marking a row sent or answered) are driven through the same ports between
 * runs, so the next run has to read them back off the record.
 */

import { ReactivationWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // Monday 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const monthsAgo = (m) => new Date(NOW.getTime() - Math.round((m + 0.3) * 30.44 * DAY)).toISOString();

let seq = 0;
/** A complete past customer: all five fields present. Overrides win. */
const customer = (id, o = {}) => {
  seq += 1;
  return {
    id,
    nameAndMobile: `${o.first ?? "Kim"} Nguyen, 0413 ${String(100 + seq).padStart(3, "0")} ${String(200 + seq).padStart(3, "0")}`,
    address: o.address ?? `${seq} Jacaranda St, Buderim QLD 4556 [${id}]`,
    purchaseDate: monthsAgo(o.months ?? 3),
    lastContactOutcome: "cold",
    ownerType: "owner_occupier",
    lastJobType: o.jobType ?? "tap washer",
    lastJobId: `JOB-${id}`,
    ...o.fields,
  };
};

const callsOf = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const skipsFor = (world, id) => world.skips.filter((s) => s.contactId === id).map((s) => s.reason);
const hasSkip = (world, id, re) => skipsFor(world, id).some((r) => re.test(r));
const allRows = (world) => world.todayLists.flatMap((l) => l.rows);
const rowsFor = (world, id) => allRows(world).filter((r) => r.contactId === id);
const gateReasons = (world, id) => callsOf(world, "gate", (c) => c.request.contactId === id).map((c) => (c.response.allowed ? "allowed" : c.response.reason));
const inRun = (run, id) => run.find((e) => e.contactId === id);
const words = (s) => String(s).trim().split(/\s+/).length;

/** The draft uses its reason: the site address, the months where the reason has them, and a way out. */
function draftUsesReason(world, row) {
  const c = world.contactById(row.contactId);
  if (!c || typeof row.opener !== "string" || typeof row.reason !== "string" || !row.reason) return false;
  if (!row.opener.includes(c.address) || !row.reason.includes(c.address)) return false;
  const months = /^(\d+) months/.exec(row.reason)?.[1];
  if (months && !row.opener.includes(`${months} months`)) return false;
  if (row.play === "equity_checkin" && !/near/.test(row.opener)) return false;
  if (/quote/.test(row.reason) && !/quote/i.test(row.opener)) return false;
  if (!/Reply STOP/.test(row.opener)) return false;
  return words(row.opener) <= 50;
}

const runDays = async (build, world, days, between = () => {}) => {
  for (let d = 0; d < days; d += 1) {
    await build(world.ports());
    await between(d);
    world.advance(DAY);
  }
};

export const scenarios = [
  {
    checkId: "five-fields-present",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("F-NAME", { months: 14, fields: { nameAndMobile: undefined } }),
          customer("F-ADDR", { months: 14, fields: { address: undefined } }),
          customer("F-DATE", { fields: { purchaseDate: undefined, ownerType: "investor" } }),
          customer("F-DATE2", { jobType: "aircon service", fields: { purchaseDate: undefined } }),
          customer("F-TYPE", { months: 14, fields: { ownerType: undefined } }),
          customer("F-OUTC", { months: 14, fields: { lastContactOutcome: undefined } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      if (world.runs.length !== 1) return false;
      const asked = (id) => callsOf(world, "read_contacts", (c) => c.request.contactId === id).length > 0;
      if (!["F-NAME", "F-ADDR", "F-DATE", "F-DATE2", "F-TYPE", "F-OUTC"].every(asked)) return false;
      // No name, mobile or address: out of every play, reported as not ready.
      if (inRun(run, "F-NAME") || inRun(run, "F-ADDR")) return false;
      if (!hasSkip(world, "F-NAME", /not ready/) || !hasSkip(world, "F-ADDR", /not ready/)) return false;
      // No job date: out of the dated plays only; the rental play still runs.
      const d = inRun(run, "F-DATE");
      if (!d || d.play !== "investor") return false;
      if (inRun(run, "F-DATE2")) return false; // its only route in was the dated check-up play
      if (!hasSkip(world, "F-DATE", /gap/) || !hasSkip(world, "F-DATE2", /gap/)) return false;
      // No landlord flag: out of the rental play only.
      const t = inRun(run, "F-TYPE");
      if (!t || t.play === "investor" || !hasSkip(world, "F-TYPE", /rental play only/)) return false;
      // No last outcome: ranked as cold, and reported.
      const o = inRun(run, "F-OUTC");
      if (!o || !hasSkip(world, "F-OUTC", /cold/)) return false;
      return true;
    },
    describe: (world) => `run: ${world.lastRun.map((e) => `${e.contactId}:${e.play}`).join(", ")}; skips ${world.skips.length}`,
  },
  {
    checkId: "four-plays-real-triggers",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("P-CHK", { months: 13, jobType: "aircon service" }),
          customer("P-NEAR", { fields: { freshSaleNearby: true } }),
          customer("P-RENT", { fields: { ownerType: "investor" } }),
          customer("P-LAPSE", { months: 15 }),
          customer("P-QUOTE", { fields: { lastContactOutcome: "quote_not_accepted" } }),
          customer("P-NONE", { months: 4, jobType: "aircon service" }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const want = { "P-CHK": "tenure", "P-NEAR": "equity_checkin", "P-RENT": "investor", "P-LAPSE": "lapsed_appraisal", "P-QUOTE": "lapsed_appraisal" };
      for (const [id, play] of Object.entries(want)) {
        const e = inRun(run, id);
        if (!e || e.play !== play) return false;
        const c = world.contactById(id);
        if (typeof e.trigger !== "string" || !e.trigger.includes(c.address)) return false;
      }
      if (!/aircon service/.test(inRun(run, "P-CHK").trigger)) return false;
      if (!/quote/.test(inRun(run, "P-QUOTE").trigger) || !/months/.test(inRun(run, "P-LAPSE").trigger)) return false;
      if (inRun(run, "P-NONE")) return false;
      if (!hasSkip(world, "P-NONE", /no play/)) return false;
      return new Set(run.map((e) => e.play)).size === 4;
    },
    describe: (world) => `run: ${world.lastRun.map((e) => `${e.contactId}:${e.play}`).join(", ")}`,
  },
  {
    checkId: "ranking-six-rules-in-order",
    // Fed in the reverse of the right order, so an import-order list fails.
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("R-NEAR-NO", { fields: { freshSaleNearby: true, lastContactOutcome: "recent_no" } }),
          customer("R-OLD2", { months: 40, fields: { lastContactOutcome: "no_answer", lastOutcomeAt: daysAgo(60) } }),
          customer("R-OLD", { months: 40, fields: { lastContactOutcome: "no_answer", lastOutcomeAt: daysAgo(20) } }),
          customer("R-SWEET", { months: 18 }),
          customer("R-NEAR", { fields: { freshSaleNearby: true } }),
          customer("R-CB", { months: 30, jobType: "aircon service", fields: { lastContactOutcome: "callback_requested", lastOutcomeAt: daysAgo(1) } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.contactId);
      const want = ["R-CB", "R-NEAR", "R-SWEET", "R-OLD", "R-OLD2", "R-NEAR-NO"];
      return order.length === want.length && order.every((id, i) => id === want[i]);
    },
    describe: (world) => `order: ${world.lastRun.map((e) => e.contactId).join(" > ")}`,
  },
  {
    checkId: "one-play-at-a-time",
    // X qualifies for the check-up, the rental and the year-since plays at once.
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("X", { months: 14, jobType: "aircon service", fields: { ownerType: "investor" } }),
          customer("Y", { months: 16 }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports()); // Monday
      if (rowsFor(world, "X").length) world.ports().recordOutcome("X", "no_answer"); // the owner sent it
      world.advance(2 * DAY);
      await build(world.ports()); // Wednesday, same week
    },
    holds: (world) => {
      if (world.runs.length !== 2) return false;
      const entries = world.allRunEntries.filter((e) => e.contactId === "X");
      if (entries.length !== 1) return false;
      if (rowsFor(world, "X").length !== 1) return false;
      if (!hasSkip(world, "X", /one message a week/)) return false;
      // Y, not worked, is still on Wednesday's list: the hold is X's own.
      return rowsFor(world, "Y").length === 2;
    },
    describe: (world) => `X in ${world.allRunEntries.filter((e) => e.contactId === "X").length} run(s), ${rowsFor(world, "X").length} draft(s)`,
  },
  {
    checkId: "opener-names-the-reason",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("O-CHK", { months: 25, jobType: "hot water service" }),
          customer("O-NEAR", { fields: { freshSaleNearby: true } }),
          customer("O-RENT", { fields: { ownerType: "investor" } }),
          customer("O-QUOTE", { fields: { lastContactOutcome: "quote_not_accepted" } }),
          customer("O-YEAR", { months: 13 }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const rows = world.todayLists[0]?.rows ?? [];
      if (rows.length !== 5) return false;
      if (!rows.every((r) => draftUsesReason(world, r))) return false;
      const chk = rows.find((r) => r.contactId === "O-CHK");
      return !!chk && chk.play === "tenure" && /hot water service/.test(chk.opener) && /25 months/.test(chk.opener);
    },
    describe: (world) => (world.todayLists[0]?.rows ?? []).map((r) => `${r.contactId}: ${r.opener}`).join(" | "),
  },
  {
    checkId: "cadence-has-a-stop",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("S-A", { months: 14, fields: { sequenceStartedAt: NOW.toISOString() } }),
          customer("S-B", { months: 14, fields: { sequenceStartedAt: NOW.toISOString() } }),
        ],
      }),
    drive: (build, world) =>
      runDays(build, world, 35, () => {
        const today = world.todayLists[world.todayLists.length - 1]?.rows ?? [];
        for (const r of today) {
          const replied = r.contactId === "S-B" && r.step === 2;
          world.ports().recordOutcome(r.contactId, replied ? "spoke" : "no_answer");
        }
      }),
    holds: (world) => {
      const steps = (id) => rowsFor(world, id).map((r) => r.step);
      const a = steps("S-A");
      const b = steps("S-B");
      if (a.length !== 3 || a.join() !== "1,2,3") return false;
      if (b.length !== 2 || b.join() !== "1,2") return false;
      return hasSkip(world, "S-A", /sequence ended/) && hasSkip(world, "S-B", /sequence stopped/);
    },
    describe: (world) => `S-A steps ${rowsFor(world, "S-A").map((r) => r.step).join(",")}; S-B steps ${rowsFor(world, "S-B").map((r) => r.step).join(",")}`,
  },
  {
    checkId: "gate-under-ranking",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("G-TOP", { months: 18, fields: { freshSaleNearby: true, lastContactOutcome: "callback_requested", lastOutcomeAt: daysAgo(2) } }),
          customer("G-2", { months: 15 }),
        ],
      }),
    drive: async (build, world) => {
      world.advance(12 * HOUR); // 2am Brisbane
      await build(world.ports());
      world.advance(12 * HOUR); // 2pm the next day
      world.ports().flagDoNotContact("G-TOP");
      await build(world.ports());
    },
    holds: (world) => {
      if (world.runs.length !== 2 || world.todayLists.length !== 2) return false;
      // Top of the ranking both times: the score was highest and still did not carry it.
      if (world.runs[0][0]?.contactId !== "G-TOP" || world.runs[1][0]?.contactId !== "G-TOP") return false;
      const g = gateReasons(world, "G-TOP");
      if (g.length !== 2 || g[0] !== "outside_hours" || g[1] !== "do_not_contact") return false;
      if (rowsFor(world, "G-TOP").length !== 0) return false;
      if (!hasSkip(world, "G-TOP", /outside_hours/) || !hasSkip(world, "G-TOP", /do_not_contact/)) return false;
      // The gate held G-TOP, not the whole run: G-2 is listed once hours open.
      return world.todayLists[0].rows.length === 0 && world.todayLists[1].rows.some((r) => r.contactId === "G-2");
    },
    describe: (world) => `G-TOP gates: ${gateReasons(world, "G-TOP").join(", ")}`,
  },
  {
    checkId: "dnc-permanent-and-global",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("D-1", { months: 14, jobType: "aircon service", fields: { freshSaleNearby: true, ownerType: "investor" } }),
          customer("D-2", { months: 15 }),
        ],
        doNotContact: ["D-1"],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(DAY);
      // The whole job history re-exported, D-1 present and clean.
      world.ports().importList([
        customer("D-1", { months: 14, jobType: "aircon service", fields: { freshSaleNearby: true, ownerType: "investor", lastContactOutcome: "callback_requested" } }),
        customer("D-2", { months: 15 }),
      ]);
      await build(world.ports());
    },
    holds: (world) => {
      if (world.todayLists.length !== 2) return false;
      if (rowsFor(world, "D-1").length !== 0) return false;
      const g = gateReasons(world, "D-1");
      if (g.length !== 2 || !g.every((r) => r === "do_not_contact")) return false;
      if (!world.isFlagged("D-1")) return false;
      return rowsFor(world, "D-2").length === 2;
    },
    describe: (world) => `D-1 gates: ${gateReasons(world, "D-1").join(", ")}; D-1 rows ${rowsFor(world, "D-1").length}`,
  },
  {
    checkId: "every-skip-explained",
    world: () =>
      new ReactivationWorld({
        dailyCap: 1,
        contacts: [
          customer("K-LIST", { months: 18 }),
          customer("K-CAP", { months: 30 }),
          customer("K-NOADDR", { months: 14, fields: { address: undefined } }),
          customer("K-NONE", { months: 2 }),
          customer("K-EXC", { months: 14, fields: { exceptionOwner: "Dana (office manager)" } }),
          customer("K-DNC", { months: 14 }),
          customer("K-REPLY", { months: 14, fields: { pendingReply: "Can you come Thursday instead?" } }),
        ],
        doNotContact: ["K-DNC"],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const want = {
        "K-CAP": /cap of 1/,
        "K-NOADDR": /not ready/,
        "K-NONE": /no play/,
        "K-EXC": /open exception owned by Dana/,
        "K-DNC": /gate: do_not_contact/,
        "K-REPLY": /reply waiting/,
      };
      for (const [id, re] of Object.entries(want)) if (!hasSkip(world, id, re)) return false;
      const listed = new Set(allRows(world).map((r) => r.contactId));
      if (listed.size !== 1 || !listed.has("K-LIST")) return false;
      // Every customer off the list has a reason of its own, and no two differ only by name.
      const offList = Object.keys(want);
      const reasons = offList.map((id) => skipsFor(world, id)[skipsFor(world, id).length - 1]);
      return new Set(reasons).size === offList.length && world.skips.every((s) => typeof s.reason === "string" && s.reason.length > 10);
    },
    describe: (world) => world.skips.map((s) => `${s.contactId}: ${s.reason}`).join(" | "),
  },
  {
    checkId: "relationship-needs-a-person",
    world: () =>
      new ReactivationWorld({
        contacts: [
          customer("H-PRICE", { months: 14, fields: { pendingReply: "How much would it cost to replace the hot water unit?" } }),
          customer("H-COMP", { months: 14, fields: { pendingReply: "The tap you fixed is still leaking and I'm not happy" } }),
          customer("H-OK", { months: 14 }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const esc = (id) => world.escalations.filter((e) => e.contactId === id).map((e) => e.reason);
      if (esc("H-PRICE").join() !== "price_question" || esc("H-COMP").join() !== "complaint") return false;
      if (rowsFor(world, "H-PRICE").length || rowsFor(world, "H-COMP").length) return false;
      if (callsOf(world, "talk").length || callsOf(world, "send_sms").length || callsOf(world, "disclose").length) return false;
      if (allRows(world).some((r) => /\$\s?\d/.test(r.opener))) return false;
      return rowsFor(world, "H-OK").length === 1;
    },
    describe: (world) => `escalations: ${world.escalations.map((e) => `${e.contactId}:${e.reason}`).join(", ")}`,
  },
  {
    checkId: "daily-list-capped-with-reasons",
    world: () =>
      new ReactivationWorld({
        dailyCap: 2,
        contacts: [
          customer("L-4", { months: 40 }),
          customer("L-3", { months: 30, fields: { lastContactOutcome: "no_answer", lastOutcomeAt: daysAgo(10) } }),
          customer("L-2", { months: 18 }),
          customer("L-1", { fields: { freshSaleNearby: true } }),
          customer("L-DNC", { months: 18, fields: { freshSaleNearby: true, lastContactOutcome: "callback_requested" } }),
        ],
        doNotContact: ["L-DNC"],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const rows = world.todayLists[0]?.rows ?? [];
      if (world.todayLists.length !== 1 || rows.length !== 2) return false;
      if (rows[0].contactId !== "L-1" || rows[1].contactId !== "L-2") return false;
      for (const r of rows) {
        if (!r.play || !r.reason || typeof r.lastOutcome !== "string" || !r.lastOutcome) return false;
        if (!draftUsesReason(world, r)) return false;
      }
      return !rows.some((r) => r.contactId === "L-DNC");
    },
    describe: (world) => (world.todayLists[0]?.rows ?? []).map((r) => `${r.contactId} ${r.play} "${r.reason}" last:${r.lastOutcome}`).join(" | "),
  },
  {
    checkId: "outcomes-change-tomorrow",
    world: () =>
      new ReactivationWorld({
        dailyCap: 3,
        contacts: [
          customer("T-A", { fields: { freshSaleNearby: true } }),
          customer("T-B", { months: 18 }),
          customer("T-C", { months: 30 }),
          customer("T-D", { months: 40 }),
          customer("T-E", { months: 44 }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      const [a, b, c] = world.todayLists[0]?.rows ?? [];
      const p = world.ports();
      if (a) p.recordOutcome(a.contactId, "spoke");
      if (b) p.recordOutcome(b.contactId, "do_not_contact");
      if (c) p.recordOutcome(c.contactId, "callback_requested");
      world.advance(DAY);
      await build(world.ports());
    },
    holds: (world) => {
      if (world.todayLists.length !== 2) return false;
      const [d1, d2] = world.todayLists;
      const ids1 = d1.rows.map((r) => r.contactId);
      const ids2 = d2.rows.map((r) => r.contactId);
      if (ids1.join() !== "T-A,T-B,T-C") return false;
      // Written back the day they were marked, through the record.
      const writes = callsOf(world, "write_log");
      if (writes.length !== 3 || !world.outcomes.every((o) => o.at.slice(0, 10) === d1.at.slice(0, 10))) return false;
      if (ids2.includes("T-A") || ids2.includes("T-B")) return false;
      if (ids2[0] !== "T-C") return false;
      if (ids2.join() === ids1.join()) return false;
      return d2.rows[0].lastOutcome === "callback_requested";
    },
    describe: (world) => `lists: ${world.todayLists.map((l) => `${l.at.slice(0, 10)} ${l.rows.map((r) => r.contactId).join("/")}`).join(" then ")}`,
  },
  {
    checkId: "survives-the-builder",
    // 13. Not a software check. The runner reports it as evidence_required and
    //     never scores it from this scenario. What is declared is in README.md.
    world: () => new ReactivationWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared in README.md: who else can explain it, and whose account it runs on",
  },
];

// 14. The pass test runs against the live list with Office Voice's governed
// create_call. It is with_us on the stub and is not built here.
export const liveScenarios = [];

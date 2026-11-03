/**
 * One scenario per check of database-reactivation-build-standard, for Ring List.
 *
 * Scaffolded by `npx @aipathway/conformance init database-reactivation-build-standard`
 * from https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * the runs submitted to rank, the lists handed to the agent, the skips and
 * gate decisions), never the build's own memory. Each returns a strict boolean.
 *
 * The agent's own actions (marking a row done, a reply landing) are driven
 * through the same ports the board would use, between runs, so the next run
 * has to read them back off the record.
 */

import { ReactivationWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T04:00:00.000Z"); // Monday 2pm Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const yearsAgo = (y) => new Date(NOW.getTime() - Math.round((y + 0.3) * 365.25 * DAY)).toISOString();

/** A complete contact: all five fields present. Overrides win. */
const contact = (id, o = {}) => ({
  id,
  nameAndMobile: `${o.first ?? "Sam"} Lee, 0412 345 ${String(678 + id.length).padStart(3, "0")}`,
  address: o.address ?? `${10 + id.length} Smith St, Paddington QLD 4064 (${id})`,
  purchaseDate: yearsAgo(o.years ?? 2),
  lastContactOutcome: "cold",
  ownerType: "owner_occupier",
  ...o.fields,
});

const callsOf = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const skipsFor = (world, id) => world.skips.filter((s) => s.contactId === id).map((s) => s.reason);
const hasSkip = (world, id, re) => skipsFor(world, id).some((r) => re.test(r));
const rowsFor = (world, id) => world.todayLists.flatMap((l) => l.rows).filter((r) => r.contactId === id);
const gateReasons = (world, id) => callsOf(world, "gate", (c) => c.request.contactId === id).map((c) => (c.response.allowed ? "allowed" : c.response.reason));
const words = (s) => String(s).trim().split(/\s+/).length;

/** The opener uses the trigger: it names the property, and for tenure the years. */
function openerUsesTrigger(world, row) {
  const c = world.contactById(row.contactId);
  if (!c || !row.opener || !row.reason) return false;
  if (!row.opener.includes(c.address) || !row.reason.includes(c.address)) return false;
  if (row.play === "tenure") {
    const years = /^(\d+) years/.exec(row.reason)?.[1];
    if (!years || !row.opener.includes(`${years} years`)) return false;
  }
  if (row.play === "equity_checkin" && !/near/.test(row.opener)) return false;
  return words(row.opener) < 40;
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
    // 1. One contact missing each of the five fields in turn.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("F-NAME", { years: 8, fields: { nameAndMobile: undefined } }),
          contact("F-ADDR", { years: 8, fields: { address: undefined } }),
          contact("F-DATE", { fields: { purchaseDate: undefined, ownerType: "investor" } }),
          contact("F-TYPE", { years: 8, fields: { ownerType: undefined } }),
          contact("F-OUTC", { years: 8, fields: { lastContactOutcome: undefined } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const inRun = (id) => run.find((e) => e.contactId === id);
      const fieldReads = callsOf(world, "read_contacts", (c) => typeof c.request?.contactId === "string").map((c) => c.request.contactId);
      return (
        world.runs.length === 1 &&
        !inRun("F-NAME") && hasSkip(world, "F-NAME", /not ready: missing nameAndMobile/) &&
        !inRun("F-ADDR") && hasSkip(world, "F-ADDR", /not ready: missing address/) &&
        inRun("F-DATE")?.play === "investor" && hasSkip(world, "F-DATE", /tenure play only/) &&
        inRun("F-TYPE")?.play === "tenure" && hasSkip(world, "F-TYPE", /investor play only/) &&
        inRun("F-OUTC")?.state === "cold" && hasSkip(world, "F-OUTC", /ranked as cold/) &&
        ["F-NAME", "F-ADDR", "F-DATE", "F-TYPE", "F-OUTC"].every((id) => fieldReads.includes(id))
      );
    },
    describe: (world) => `run: ${world.lastRun.map((e) => `${e.contactId}:${e.play}:${e.state}`).join(", ")}; skips: ${world.skips.map((s) => `${s.contactId} ${s.reason}`).join(" | ")}`,
  },
  {
    checkId: "four-plays-real-triggers",
    // 2. One contact per play and one who qualifies for none.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("P-TEN", { years: 6 }),
          contact("P-EQU", { years: 2, fields: { freshSaleNearby: true } }),
          contact("P-INV", { years: 3, fields: { ownerType: "investor" } }),
          contact("P-LAP", { years: 1, fields: { lastContactOutcome: "appraisal_not_converted" } }),
          contact("P-NONE", { years: 2 }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun;
      const play = (id) => run.find((e) => e.contactId === id)?.play;
      const triggered = run.every((e) => typeof e.trigger === "string" && e.trigger.length > 0);
      return (
        run.length === 4 &&
        triggered &&
        play("P-TEN") === "tenure" &&
        play("P-EQU") === "equity_checkin" &&
        play("P-INV") === "investor" &&
        play("P-LAP") === "lapsed_appraisal" &&
        play("P-NONE") === undefined &&
        hasSkip(world, "P-NONE", /no play/)
      );
    },
    describe: (world) => `run: ${world.lastRun.map((e) => `${e.contactId}:${e.play} (${e.trigger})`).join(", ")}`,
  },
  {
    checkId: "ranking-six-rules-in-order",
    // 3. Seeded in an order that recency, or the list order, would get wrong.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("R-G", { years: 6, fields: { lastOutcomeAt: daysAgo(10) } }), // most recent contact, no boost
          contact("R-F", { years: 9, fields: { freshSaleNearby: true, lastContactOutcome: "recent_no", lastOutcomeAt: daysAgo(40) } }),
          contact("R-E", { years: 10, fields: { lastOutcomeAt: daysAgo(200) } }),
          contact("R-D", { years: 10, fields: { lastOutcomeAt: daysAgo(20) } }),
          contact("R-C", { years: 3, fields: { freshSaleNearby: true } }),
          contact("R-B", { years: 9, fields: { freshSaleNearby: true } }),
          contact("R-A", { years: 4, fields: { ownerType: "investor", lastContactOutcome: "callback_requested" } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.contactId).join(",");
      return world.runs.length === 1 && order === "R-A,R-B,R-C,R-D,R-E,R-G,R-F";
    },
    describe: (world) => `order: ${world.lastRun.map((e) => `${e.contactId}(${e.score})`).join(", ")}; expected R-A,R-B,R-C,R-D,R-E,R-G,R-F`,
  },
  {
    checkId: "one-play-at-a-time",
    // 4. X qualifies for equity and tenure. Monday's list is worked; Wednesday's run follows.
    world: () =>
      new ReactivationWorld({
        contacts: [contact("X", { years: 8, fields: { freshSaleNearby: true } }), contact("Y", { years: 6 })],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.ports().recordOutcome("X", "not_interested"); // the agent rang X from Monday's list
      world.advance(2 * DAY);
      await build(world.ports());
    },
    holds: (world) => {
      const runsWithX = world.runs.filter((r) => r.some((e) => e.contactId === "X")).length;
      const xRows = rowsFor(world, "X");
      return world.runs.length === 2 && runsWithX === 1 && xRows.length === 1 && hasSkip(world, "X", /one opener a week/) && rowsFor(world, "Y").length >= 1;
    },
    describe: (world) => `runs with X: ${world.runs.filter((r) => r.some((e) => e.contactId === "X")).map((r) => r.find((e) => e.contactId === "X").play).join(", ")}; X rows: ${rowsFor(world, "X").length}; X skips: ${skipsFor(world, "X").join(" | ")}`,
  },
  {
    checkId: "opener-names-the-reason",
    // 5. A tenure contact and a sale-nearby contact; the agent opens the call with the drafted opener.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("Q-TEN", { years: 9, address: "12 Smith St, Paddington QLD 4064" }),
          contact("Q-EQU", { years: 2, address: "4 Rose Ave, Toowong QLD 4066", fields: { freshSaleNearby: true } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ten = rowsFor(world, "Q-TEN")[0];
      const equ = rowsFor(world, "Q-EQU")[0];
      return (
        !!ten && !!equ &&
        ten.reason === "9 years since buying 12 Smith St, Paddington QLD 4064" &&
        ten.opener.includes("9 years") && ten.opener.includes("12 Smith St") &&
        equ.opener.includes("near 4 Rose Ave") &&
        openerUsesTrigger(world, ten) && openerUsesTrigger(world, equ)
      );
    },
    describe: (world) => world.todayLists.flatMap((l) => l.rows).map((r) => `${r.contactId}: "${r.opener}" (reason: ${r.reason})`).join(" | ") || "no rows",
  },
  {
    checkId: "cadence-has-a-stop",
    // 6. Two weekly sequences started today, run every morning for five weeks.
    //    A never replies (the agent marks no answer each week); B replies at step two.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("S-A", { years: 8, fields: { sequenceStartedAt: NOW.toISOString() } }),
          contact("S-B", { years: 8, fields: { sequenceStartedAt: NOW.toISOString() } }),
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
      const steps = (id) => rowsFor(world, id).map((r) => r.step).join(",");
      const replyNoted = callsOf(world, "read_contacts", (c) => c.request?.reply === "S-B").length > 0;
      return (
        world.runs.length === 35 &&
        steps("S-A") === "1,2,3" &&
        hasSkip(world, "S-A", /sequence ended at step 3/) &&
        steps("S-B") === "1,2" &&
        replyNoted &&
        hasSkip(world, "S-B", /sequence stopped: the contact replied/) &&
        callsOf(world, "send_sms").length === 0 &&
        callsOf(world, "talk").length === 0
      );
    },
    describe: (world) => `S-A steps ${rowsFor(world, "S-A").map((r) => r.step).join(",")}; S-B steps ${rowsFor(world, "S-B").map((r) => r.step).join(",")}; sends ${callsOf(world, "send_sms").length}`,
  },
  {
    checkId: "gate-under-ranking",
    // 7. The top-ranked contact at 9pm Brisbane, then the next afternoon flagged do-not-contact.
    world: () =>
      new ReactivationWorld({
        now: new Date("2026-09-21T11:00:00.000Z"), // 9pm Brisbane
        contacts: [
          contact("T-1", { years: 9, fields: { freshSaleNearby: true, lastContactOutcome: "callback_requested" } }),
          contact("T-2", { years: 8 }),
          contact("T-3", { years: 6 }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(17 * 60 * 60 * 1000); // 2pm the next day
      world.ports().flagDoNotContact("T-1");
      await build(world.ports());
    },
    holds: (world) => {
      const topBoth = world.runs.length === 2 && world.runs.every((r) => r[0]?.contactId === "T-1");
      const g = gateReasons(world, "T-1");
      const opened = callsOf(world, "disclose", (c) => c.response.opened === true).length;
      return (
        topBoth &&
        g.join(",") === "outside_hours,do_not_contact" &&
        hasSkip(world, "T-1", /gate: outside_hours/) &&
        hasSkip(world, "T-1", /gate: do_not_contact/) &&
        rowsFor(world, "T-1").length === 0 &&
        opened === 0 &&
        (world.todayLists[1]?.rows.length ?? 0) === 2
      );
    },
    describe: (world) => `T-1 gate: ${gateReasons(world, "T-1").join(", ")}; lists: ${world.todayLists.map((l) => l.rows.map((r) => r.contactId).join("/") || "empty").join(" then ")}`,
  },
  {
    checkId: "dnc-permanent-and-global",
    // 8. D-1 is flagged, then the list is re-imported twice with D-1 present and unflagged,
    //    once qualifying for the equity play and once for the tenure play.
    world: () =>
      new ReactivationWorld({
        doNotContact: ["D-1"],
        contacts: [contact("D-1", { years: 8 }), contact("D-2", { years: 6 })],
      }),
    drive: async (build, world) => {
      world.ports().importList([contact("D-1", { years: 8, fields: { freshSaleNearby: true, doNotContact: false } }), contact("D-2", { years: 6 })]);
      await build(world.ports());
      world.advance(DAY);
      world.ports().importList([contact("D-1", { years: 8, fields: { doNotContact: false } }), contact("D-2", { years: 6 })]);
      await build(world.ports());
    },
    holds: (world) => {
      const plays = world.runs.map((r) => r.find((e) => e.contactId === "D-1")?.play).join(",");
      return (
        world.runs.length === 2 &&
        plays === "equity_checkin,tenure" &&
        gateReasons(world, "D-1").join(",") === "do_not_contact,do_not_contact" &&
        rowsFor(world, "D-1").length === 0 &&
        rowsFor(world, "D-2").length >= 1
      );
    },
    describe: (world) => `D-1 plays: ${world.runs.map((r) => r.find((e) => e.contactId === "D-1")?.play).join(", ")}; gate: ${gateReasons(world, "D-1").join(", ")}; D-1 rows ${rowsFor(world, "D-1").length}`,
  },
  {
    checkId: "every-skip-explained",
    // 9. Six contacts left off for six different reasons, and one listed.
    world: () =>
      new ReactivationWorld({
        dailyCap: 1,
        doNotContact: ["K-DNC"],
        contacts: [
          contact("K-OK", { years: 9, fields: { freshSaleNearby: true } }),
          contact("K-CAP", { years: 6 }),
          contact("K-DNC", { years: 8 }),
          contact("K-MOB", { years: 8, fields: { nameAndMobile: undefined } }),
          contact("K-COOL", { years: 8, fields: { lastContactOutcome: "spoke", lastOutcomeAt: daysAgo(2) } }),
          contact("K-NONE", { years: 2 }),
          contact("K-EXC", { years: 8, fields: { exceptionOwner: "Jo Smith" } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const expect = {
        "K-CAP": /beyond today's cap of 1/,
        "K-DNC": /gate: do_not_contact/,
        "K-MOB": /not ready: missing nameAndMobile/,
        "K-COOL": /cadence: spoke recorded 2 day/,
        "K-NONE": /no play/,
        "K-EXC": /open exception owned by Jo Smith/,
      };
      const listed = world.todayLists[0]?.rows.map((r) => r.contactId) ?? [];
      const everyOneExplained = Object.entries(expect).every(([id, re]) => hasSkip(world, id, re) && !listed.includes(id));
      const distinct = new Set(Object.keys(expect).map((id) => skipsFor(world, id)[0])).size === Object.keys(expect).length;
      return listed.join(",") === "K-OK" && everyOneExplained && distinct && world.skips.every((s) => typeof s.reason === "string" && s.reason.length > 10);
    },
    describe: (world) => world.skips.map((s) => `${s.contactId}: ${s.reason}`).join(" | ") || "no skips",
  },
  {
    checkId: "relationship-needs-a-person",
    // 10. A reply asking for a price, and a reply making a complaint, are waiting on the record.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("H-PRICE", { years: 8, fields: { pendingReply: "What would you say my place is worth? Give me a price." } }),
          contact("H-COMP", { years: 8, fields: { pendingReply: "I want to make a complaint about how the last sale was handled." } }),
          contact("H-OK", { years: 6 }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const esc = (id) => callsOf(world, "escalate", (c) => c.request.contactId === id).map((c) => c.request.reason).join(",");
      const answered = callsOf(world, "talk").length + callsOf(world, "send_sms").length;
      return (
        esc("H-PRICE") === "price_question" &&
        esc("H-COMP") === "complaint" &&
        rowsFor(world, "H-PRICE").length === 0 &&
        rowsFor(world, "H-COMP").length === 0 &&
        answered === 0 &&
        rowsFor(world, "H-OK").length === 1
      );
    },
    describe: (world) => `escalations: ${world.escalations.map((e) => `${e.contactId}:${e.reason}`).join(", ") || "none"}; listed ${world.todayLists.flatMap((l) => l.rows).map((r) => r.contactId).join(", ")}`,
  },
  {
    checkId: "daily-list-capped-with-reasons",
    // 11. A cap of two; four qualify; the top-ranked one is flagged do-not-contact.
    world: () =>
      new ReactivationWorld({
        dailyCap: 2,
        doNotContact: ["L-1"],
        contacts: [
          contact("L-4", { years: 10 }),
          contact("L-3", { years: 3, fields: { freshSaleNearby: true } }),
          contact("L-2", { years: 9, fields: { freshSaleNearby: true } }),
          contact("L-1", { years: 8, fields: { lastContactOutcome: "callback_requested" } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const rows = world.todayLists[0]?.rows ?? [];
      const order = world.lastRun.map((e) => e.contactId).filter((id) => id !== "L-1").slice(0, 2).join(",");
      const complete = rows.every((r) => r.play && r.reason && typeof r.lastOutcome === "string" && openerUsesTrigger(world, r));
      return (
        world.todayLists.length === 1 &&
        world.lastRun[0]?.contactId === "L-1" &&
        rows.length === 2 &&
        rows.map((r) => r.contactId).join(",") === order &&
        order === "L-2,L-3" &&
        complete
      );
    },
    describe: (world) => `list: ${(world.todayLists[0]?.rows ?? []).map((r) => `${r.contactId} ${r.play} "${r.reason}" last=${r.lastOutcome}`).join(" | ")}`,
  },
  {
    checkId: "outcomes-change-tomorrow",
    // 12. Day one's list is worked: spoke, do not contact, call me back. Then the next morning.
    world: () =>
      new ReactivationWorld({
        dailyCap: 3,
        contacts: [
          contact("O-1", { years: 9, fields: { freshSaleNearby: true } }),
          contact("O-2", { years: 3, fields: { freshSaleNearby: true } }),
          contact("O-3", { years: 10 }),
          contact("O-4", { years: 6 }),
          contact("O-5", { years: 5 }),
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
      const day = (iso) => iso.slice(0, 10);
      const ids1 = d1.rows.map((r) => r.contactId);
      const ids2 = d2.rows.map((r) => r.contactId);
      const writes = callsOf(world, "write_log");
      const sameDay = writes.length === 3 && writes.every((w) => day(w.at) === day(d1.at));
      return (
        ids1.join(",") === "O-1,O-2,O-3" &&
        sameDay &&
        ids2[0] === "O-3" &&
        !ids2.includes("O-1") &&
        !ids2.includes("O-2") &&
        ids2.join(",") !== ids1.join(",") &&
        ids2.join(",") === "O-3,O-4,O-5"
      );
    },
    describe: (world) => `lists: ${world.todayLists.map((l) => `${l.at.slice(0, 10)} ${l.rows.map((r) => r.contactId).join("/")}`).join(" then ")}; writes ${callsOf(world, "write_log").length}`,
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

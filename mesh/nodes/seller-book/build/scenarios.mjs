/**
 * One scenario per check of database-reactivation-build-standard, for Seller Book.
 *
 * Scaffolded by `npx @aipathway/conformance init database-reactivation-build-standard`;
 * the checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/database-reactivation-build-standard
 *
 * Every `holds` reads the world the build wrote into through its ports (the
 * recorded calls, the runs, the lists, the texts, the skips), never the build.
 * Each one is written so a do-nothing build fails it, and so does a build that
 * breaks the one rule the check is about.
 *
 * Seller Book is driven by events: build(ports) is the morning tick, and
 * build(ports, { type: "text.approved" | "reply.received" | "outcome.marked", ... })
 * are the agent's OK, the seller's reply and the agent's outcome.
 */

import { ReactivationWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
// The world's clock starts at 2026-09-21T04:00Z, 2pm in Brisbane.
const BASE = new Date("2026-09-21T04:00:00.000Z");
const ago = (days) => new Date(BASE.getTime() - days * DAY).toISOString();
const yearsAgo = (y) => ago(Math.round(y * 365.25) + 20);

/** A ready contact: all five fields, an owner-occupier, a known outcome long ago. */
function contact(id, o = {}) {
  const c = {
    id,
    nameAndMobile: `${o.name ?? id.replace(/[^A-Za-z]/g, "") ?? id}, 0412 000 ${String(100 + id.length).slice(-3)}`,
    address: o.address ?? `${id.length + 1} Example St, Paddington QLD 4064`,
    purchaseDate: yearsAgo(o.years ?? 3),
    lastContactOutcome: "spoke",
    lastOutcomeAt: ago(200),
    ownerType: "owner_occupier",
    timezone: "Australia/Brisbane",
    ...(o.fields ?? {}),
  };
  for (const k of o.drop ?? []) delete c[k];
  return c;
}

const runsWith = (w, id) => w.runs.filter((r) => r.some((e) => e.contactId === id));
const entriesFor = (w, id) => w.allRunEntries.filter((e) => e.contactId === id);
const rowsFor = (w, id) => w.todayLists.flatMap((l) => l.rows).filter((r) => r.contactId === id);
const skipsFor = (w, id) => w.skips.filter((s) => s.contactId === id).map((s) => s.reason);
const hasSkip = (w, id, re) => skipsFor(w, id).some((r) => re.test(r));
const sentTo = (w, id) => w.steps.filter((s) => s.contactId === id);
const smsCalls = (w, id) => w.calls.filter((c) => c.port === "send_sms" && c.request?.contactId === id);
const describeAll = (w) =>
  `runs: ${w.runs.map((r) => r.map((e) => `${e.contactId}:${e.play}`).join(",")).join(" / ") || "none"}; ` +
  `lists: ${w.todayLists.map((l) => l.rows.map((r) => r.contactId).join(",")).join(" / ") || "none"}; ` +
  `texts: ${w.steps.map((s) => `${s.contactId}#${s.step}`).join(",") || "none"}; ` +
  `skips: ${w.skips.map((s) => `${s.contactId}: ${s.reason}`).join(" | ") || "none"}`;

/** The opener and the sent text both carry the words of the trigger. */
const usesTrigger = (row) => !!row && typeof row.reason === "string" && row.reason.length > 0 && row.opener.includes(row.reason);

export const scenarios = [
  {
    checkId: "five-fields-present",
    // 1. One contact missing each of the five fields in turn, then the morning list.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("NO-NAME", { years: 8, drop: ["nameAndMobile"] }),
          contact("NO-ADDR", { years: 8, drop: ["address"] }),
          contact("NO-DATE", { drop: ["purchaseDate"], fields: { ownerType: "investor" } }),
          contact("NO-TYPE", { years: 8, drop: ["ownerType"] }),
          contact("NO-OUTCOME", { years: 8, drop: ["lastContactOutcome", "lastOutcomeAt"] }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const noDate = entriesFor(w, "NO-DATE");
      const noType = entriesFor(w, "NO-TYPE");
      const noOutcome = entriesFor(w, "NO-OUTCOME");
      return (
        w.runs.length === 1 &&
        entriesFor(w, "NO-NAME").length === 0 && hasSkip(w, "NO-NAME", /not ready.*nameAndMobile/) &&
        entriesFor(w, "NO-ADDR").length === 0 && hasSkip(w, "NO-ADDR", /not ready.*address/) &&
        noDate.length === 1 && noDate[0].play === "investor" && hasSkip(w, "NO-DATE", /purchase date.*tenure play only/) &&
        noType.length === 1 && noType[0].play === "tenure" && hasSkip(w, "NO-TYPE", /investor play only/) &&
        noOutcome.length === 1 && noOutcome[0].state === "cold" && hasSkip(w, "NO-OUTCOME", /ranked as cold/) &&
        rowsFor(w, "NO-NAME").length === 0 && rowsFor(w, "NO-ADDR").length === 0
      );
    },
    describe: describeAll,
  },
  {
    checkId: "four-plays-real-triggers",
    // 2. One contact for each play, and one who qualifies for none.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("TEN", { years: 9 }),
          contact("EQU", { years: 2, fields: { freshSaleNearby: true } }),
          contact("INV", { years: 2, fields: { ownerType: "investor" } }),
          contact("LAP", { years: 2, fields: { lastContactOutcome: "appraisal_not_converted" } }),
          contact("NONE", { years: 2 }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const play = (id) => entriesFor(w, id).map((e) => e.play).join(",");
      const triggers = w.lastRun.map((e) => e.trigger);
      return (
        w.runs.length === 1 &&
        play("TEN") === "tenure" && play("EQU") === "equity_checkin" && play("INV") === "investor" && play("LAP") === "lapsed_appraisal" &&
        entriesFor(w, "NONE").length === 0 && hasSkip(w, "NONE", /no play/) &&
        new Set(triggers).size === 4 && triggers.every((t) => typeof t === "string" && t.length > 0)
      );
    },
    describe: describeAll,
  },
  {
    checkId: "ranking-six-rules-in-order",
    // 3. A set whose order under the six rules is known, and is neither import order nor recency order.
    world: () =>
      new ReactivationWorld({
        contacts: [
          // Most recent outcome of all, warm signals, but a recent no: bottom, not out.
          contact("NO", { years: 9, fields: { freshSaleNearby: true, lastContactOutcome: "not_interested", lastOutcomeAt: ago(8) } }),
          contact("T6-OLD", { years: 6, fields: { lastContactOutcome: "no_answer", lastOutcomeAt: ago(40) } }),
          contact("T6-NEW", { years: 6, fields: { lastContactOutcome: "no_answer", lastOutcomeAt: ago(10) } }),
          contact("T9", { years: 9 }),
          contact("SALE", { years: 3, fields: { freshSaleNearby: true } }),
          // Weakest other signals, oldest outcome, last in the import: asked to be rung, so first.
          contact("CB", { years: 5, fields: { lastContactOutcome: "callback_requested", lastOutcomeAt: ago(300) } }),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const want = ["CB", "SALE", "T9", "T6-NEW", "T6-OLD", "NO"];
      const order = w.lastRun.map((e) => e.contactId);
      const listed = (w.todayLists[0]?.rows ?? []).map((r) => r.contactId);
      return w.runs.length === 1 && JSON.stringify(order) === JSON.stringify(want) && JSON.stringify(listed) === JSON.stringify(want);
    },
    describe: (w) => `order: ${w.lastRun.map((e) => `${e.contactId}(${e.score})`).join(", ") || "none"}`,
  },
  {
    checkId: "one-play-at-a-time",
    // 4. X qualifies for the equity and the tenure plays. Monday's text is OK'd and sent; Wednesday's run follows.
    world: () =>
      new ReactivationWorld({
        contacts: [contact("X", { years: 8, fields: { freshSaleNearby: true } }), contact("Y", { years: 6 })],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      const row = world.todayLists[0]?.rows.find((r) => r.contactId === "X");
      await build(world.ports(), { type: "text.approved", contactId: "X", step: 1, play: row?.play });
      world.advance(2 * DAY);
      await build(world.ports());
    },
    holds: (w) =>
      w.runs.length === 2 &&
      runsWith(w, "X").length === 1 &&
      entriesFor(w, "X").length === 1 &&
      rowsFor(w, "X").length === 1 &&
      sentTo(w, "X").length === 1 &&
      hasSkip(w, "X", /one text a week/) &&
      runsWith(w, "Y").length === 2,
    describe: describeAll,
  },
  {
    checkId: "opener-names-the-reason",
    // 5. A tenure contact and a sale-nearby contact; the agent OKs both drafted texts.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("Q-TEN", { years: 9, address: "12 Smith St, Paddington QLD 4064" }),
          contact("Q-EQU", { years: 2, address: "4 Rose Ave, Toowong QLD 4066", fields: { freshSaleNearby: true } }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      await build(world.ports(), { type: "text.approved", contactId: "Q-TEN", step: 1 });
      await build(world.ports(), { type: "text.approved", contactId: "Q-EQU", step: 1 });
    },
    holds: (w) => {
      const ten = rowsFor(w, "Q-TEN")[0];
      const equ = rowsFor(w, "Q-EQU")[0];
      const tenSent = sentTo(w, "Q-TEN")[0]?.body ?? "";
      const equSent = sentTo(w, "Q-EQU")[0]?.body ?? "";
      return (
        !!ten && !!equ &&
        ten.reason === "9 years since you bought 12 Smith St, Paddington QLD 4064" && usesTrigger(ten) &&
        equ.reason === "a recent sale near 4 Rose Ave, Toowong QLD 4066" && usesTrigger(equ) &&
        tenSent.includes("9 years since you bought 12 Smith St") && equSent.includes("sale near 4 Rose Ave") &&
        /Reply STOP to opt out\.$/.test(tenSent) && /Reply STOP to opt out\.$/.test(equSent)
      );
    },
    describe: (w) => `rows: ${w.todayLists.flatMap((l) => l.rows).map((r) => `${r.contactId}: "${r.opener}"`).join(" | ") || "none"}; sent: ${w.steps.map((s) => `${s.contactId}: "${s.body}"`).join(" | ") || "none"}`,
  },
  {
    checkId: "cadence-has-a-stop",
    // 6. A: every text OK'd weekly, four of them, no reply. B: replies after text two, then text three is OK'd.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("A", { years: 8, fields: { sequenceStartedAt: BASE.toISOString() } }),
          contact("B", { years: 8, fields: { sequenceStartedAt: BASE.toISOString() } }),
        ],
      }),
    drive: async (build, world) => {
      for (let step = 1; step <= 4; step++) {
        await build(world.ports(), { type: "text.approved", contactId: "A", step });
        if (step <= 3) await build(world.ports(), { type: "text.approved", contactId: "B", step });
        if (step === 2) await build(world.ports(), { type: "reply.received", contactId: "B", text: "Thanks, we might think about it next year." });
        world.advance(7 * DAY);
      }
    },
    holds: (w) => {
      const a = sentTo(w, "A").map((s) => s.step);
      const b = sentTo(w, "B").map((s) => s.step);
      const aAttempts = smsCalls(w, "A").map((c) => c.request.step);
      const bAttempts = smsCalls(w, "B").map((c) => c.request.step);
      return (
        JSON.stringify(a) === "[1,2,3]" && JSON.stringify(aAttempts) === "[1,2,3]" && hasSkip(w, "A", /sequence ended/) &&
        JSON.stringify(b) === "[1,2]" && JSON.stringify(bAttempts) === "[1,2]" && hasSkip(w, "B", /sequence stopped: the seller answered/)
      );
    },
    describe: describeAll,
  },
  {
    checkId: "gate-under-ranking",
    // 7. The top-ranked contact at 9pm their time, OK'd; then flagged do-not-contact and OK'd at 2pm next day.
    world: () =>
      new ReactivationWorld({
        now: new Date("2026-09-21T11:00:00.000Z"), // 9pm Brisbane
        contacts: [
          contact("TOP", { years: 9, fields: { lastContactOutcome: "callback_requested", freshSaleNearby: true } }),
          contact("LOW", { years: 6 }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      await build(world.ports(), { type: "text.approved", contactId: "TOP", step: 1 });
      world.ports().flagDoNotContact("TOP");
      world.advance(17 * 3_600_000); // 2pm next day
      await build(world.ports());
      await build(world.ports(), { type: "text.approved", contactId: "TOP", step: 1 });
    },
    holds: (w) =>
      w.runs.length === 2 &&
      w.runs.every((r) => r[0]?.contactId === "TOP") &&
      rowsFor(w, "TOP").length === 0 &&
      smsCalls(w, "TOP").length === 0 &&
      w.disclosures.length === 0 &&
      skipsFor(w, "TOP").filter((r) => /outside_hours/.test(r)).length === 2 &&
      skipsFor(w, "TOP").filter((r) => /do_not_contact/.test(r)).length === 2 &&
      rowsFor(w, "LOW").length === 1,
    describe: describeAll,
  },
  {
    checkId: "dnc-permanent-and-global",
    // 8. D qualifies for three plays and is flagged. The whole list is re-imported with D unflagged.
    world: () => {
      const d = contact("D", { years: 9, fields: { freshSaleNearby: true, ownerType: "investor" } });
      return new ReactivationWorld({ contacts: [d, contact("E", { years: 8 })], doNotContact: ["D"] });
    },
    drive: async (build, world) => {
      await build(world.ports());
      world.ports().importList([
        contact("D", { years: 9, fields: { freshSaleNearby: true, ownerType: "investor", lastContactOutcome: "spoke", doNotContact: false } }),
        contact("E", { years: 8 }),
      ]);
      world.advance(DAY);
      await build(world.ports());
      await build(world.ports(), { type: "text.approved", contactId: "D", step: 1, play: "investor" });
      await build(world.ports(), { type: "text.approved", contactId: "D", step: 1, play: "tenure" });
    },
    holds: (w) =>
      w.isFlagged("D") &&
      w.todayLists.length === 2 &&
      rowsFor(w, "D").length === 0 &&
      smsCalls(w, "D").length === 0 &&
      skipsFor(w, "D").filter((r) => /do_not_contact/.test(r)).length === 4 &&
      rowsFor(w, "E").length === 2,
    describe: describeAll,
  },
  {
    checkId: "every-skip-explained",
    // 9. Five contacts kept off the list for five different reasons, and one that makes it.
    world: () =>
      new ReactivationWorld({
        dailyCap: 1,
        contacts: [
          contact("OK1", { years: 9, fields: { freshSaleNearby: true } }),
          contact("CAP", { years: 8 }),
          contact("FLAG", { years: 9 }),
          contact("HELD", { years: 9, fields: { exceptionOwner: "Jo Bloggs" } }),
          contact("BARE", { years: 9, drop: ["nameAndMobile"] }),
          contact("NOPLAY", { years: 2 }),
        ],
        doNotContact: ["FLAG"],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const off = ["CAP", "FLAG", "HELD", "BARE", "NOPLAY"];
      const res = [/past today's cap/, /gate: do_not_contact/, /open exception owned by Jo Bloggs/, /not ready/, /no play/];
      const reasons = off.map((id) => skipsFor(w, id)[0]);
      return (
        rowsFor(w, "OK1").length === 1 &&
        off.every((id, i) => rowsFor(w, id).length === 0 && hasSkip(w, id, res[i])) &&
        new Set(reasons).size === off.length
      );
    },
    describe: describeAll,
  },
  {
    checkId: "relationship-needs-a-person",
    // 10. One seller replies asking what we would offer; another complains. The next morning's list follows.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("PAT", { years: 9, fields: { sequenceStartedAt: BASE.toISOString() } }),
          contact("GUS", { years: 9, fields: { sequenceStartedAt: BASE.toISOString() } }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "text.approved", contactId: "PAT", step: 1 });
      await build(world.ports(), { type: "text.approved", contactId: "GUS", step: 1 });
      await build(world.ports(), { type: "reply.received", contactId: "PAT", text: "What would you offer me for it, cash?" });
      await build(world.ports(), { type: "reply.received", contactId: "GUS", text: "I'm unhappy you keep messaging me, this is my complaint." });
      world.advance(7 * DAY);
      await build(world.ports());
      await build(world.ports(), { type: "text.approved", contactId: "PAT", step: 2 });
    },
    holds: (w) => {
      const esc = (id) => w.escalations.filter((e) => e.contactId === id).map((e) => e.reason).join(",");
      const after = w.steps.filter((s) => s.step > 1);
      const priced = w.steps.some((s) => /\$\s?\d|\bprice\b|\boffer\b/i.test(s.body)) || w.todayLists.flatMap((l) => l.rows).some((r) => /\$\s?\d/.test(r.opener));
      return (
        esc("PAT") === "price_question" && esc("GUS") === "complaint" &&
        sentTo(w, "PAT").length === 1 && sentTo(w, "GUS").length === 1 &&
        after.length === 0 && !priced &&
        rowsFor(w, "PAT").length === 0 && rowsFor(w, "GUS").length === 0 &&
        w.todayLists.length === 1
      );
    },
    describe: (w) => `escalations: ${w.escalations.map((e) => `${e.contactId}:${e.reason}`).join(",") || "none"}; ${describeAll(w)}`,
  },
  {
    checkId: "daily-list-capped-with-reasons",
    // 11. A cap of two; four contacts qualify; the top scorer is flagged do-not-contact.
    world: () =>
      new ReactivationWorld({
        dailyCap: 2,
        contacts: [
          contact("C1", { years: 9, fields: { freshSaleNearby: true, lastContactOutcome: "callback_requested" } }),
          contact("C2", { years: 9, fields: { freshSaleNearby: true } }),
          contact("C3", { years: 9 }),
          contact("C4", { years: 6 }),
        ],
        doNotContact: ["C1"],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (w) => {
      const rows = w.todayLists[0]?.rows ?? [];
      const order = w.lastRun.map((e) => e.contactId).filter((id) => id !== "C1");
      return (
        w.todayLists.length === 1 &&
        rows.length === 2 && rows.length <= w.capSetting &&
        JSON.stringify(rows.map((r) => r.contactId)) === JSON.stringify(order.slice(0, 2)) &&
        !rows.some((r) => r.contactId === "C1") &&
        rows.every((r) => typeof r.play === "string" && r.play && usesTrigger(r) && typeof r.lastOutcome === "string" && r.lastOutcome) &&
        hasSkip(w, "C1", /do_not_contact/) && hasSkip(w, "C4", /cap of 2/)
      );
    },
    describe: describeAll,
  },
  {
    checkId: "outcomes-change-tomorrow",
    // 12. Day one's list is worked: first spoken to, second opts out, third asks to be rung. Next morning's list.
    world: () =>
      new ReactivationWorld({
        contacts: [
          contact("D1", { years: 9, fields: { freshSaleNearby: true } }),
          contact("D2", { years: 9 }),
          contact("D3", { years: 6 }),
          contact("D4", { years: 5 }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      const rows = world.todayLists[0]?.rows ?? [];
      const marks = ["spoke", "do_not_contact", "callback_requested"];
      for (let i = 0; i < 3 && i < rows.length; i++) {
        await build(world.ports(), { type: "outcome.marked", contactId: rows[i].contactId, outcome: marks[i] });
      }
      world.advance(DAY);
      await build(world.ports());
    },
    holds: (w) => {
      if (w.todayLists.length !== 2) return false;
      const [day1, day2] = w.todayLists;
      const d1 = day1.rows.map((r) => r.contactId);
      const d2 = day2.rows.map((r) => r.contactId);
      const sameDay = (iso) => iso.slice(0, 10) === day1.at.slice(0, 10);
      const wrote = (id, o) => w.outcomes.some((x) => x.contactId === id && x.outcome === o && sameDay(x.at));
      return (
        JSON.stringify(d1.slice(0, 3)) === '["D1","D2","D3"]' &&
        wrote("D1", "spoke") && wrote("D2", "do_not_contact") && wrote("D3", "callback_requested") &&
        !d2.includes("D1") && !d2.includes("D2") && d2[0] === "D3" &&
        JSON.stringify(d1) !== JSON.stringify(d2) && w.isFlagged("D2")
      );
    },
    describe: (w) => `outcomes: ${w.outcomes.map((o) => `${o.contactId}:${o.outcome}@${o.at.slice(0, 10)}`).join(",") || "none"}; ${describeAll(w)}`,
  },
  {
    checkId: "survives-the-builder",
    // 13. Not a software check. The runner reports it as evidence_required before
    // it ever drives a world; who else can explain Seller Book, and whose account
    // it runs on, is declared by the operator and never scored green here.
    world: () => new ReactivationWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared by the operator, not run",
  },
];

// Check 14, the pass test, runs only against the live list at a real time.
// On the stub the runner reports it as with_us. Seller Book never dials; the
// one call the standard lets a machine place is Office Voice's governed
// create_call, which is hosted and not built here.
export const liveScenarios = [];

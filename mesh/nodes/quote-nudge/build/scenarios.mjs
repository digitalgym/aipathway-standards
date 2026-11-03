/**
 * One scenario per check of follow-up-build-standard, for Quote Nudge.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/follow-up-build-standard
 *
 * The world in each is a flooring showroom: open quotes for carpet, hybrid
 * vinyl and timber, the customers who owe a decision, their recorded consents,
 * and the cadence the business wrote down. Every holds() reads the world and
 * returns a strict boolean. Each one was run against a do-nothing build and
 * against deliberately broken builds, and goes red for them.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// The world starts at 2026-09-26T00:00Z, 10am in Brisbane.
const START = Date.parse("2026-09-26T00:00:00.000Z");
const daysAgo = (n) => new Date(START - n * DAY).toISOString();
const dueIn = (n) => new Date(START + n * DAY).toISOString();

const MANAGER = "Sam Ortiz, sales manager";

const quote = (id, value, ageDays, owedBy, extra = {}) => ({
  id,
  kind: "quote_decision",
  recordRef: `Q-${id}`,
  owedBy,
  valueAtRisk: value,
  openedAt: daysAgo(ageDays),
  due: dueIn(7 - ageDays),
  status: "open",
  ...extra,
});

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "quote_decision",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: MANAGER,
});

const contacts = (...ids) => ids.map((id) => ({ id, name: `Customer ${id}` }));
const consents = (pairs) => pairs.map(([contactId, channel]) => ({ contactId, channel }));

/** Drive the build once per step, moving the clock between runs. */
async function runs(build, world, gapsMs) {
  await build(world.ports());
  for (const gap of gapsMs) {
    world.advance(gap);
    await build(world.ports());
  }
}

const calledPort = (world, port, itemId) => world.calls.some((c) => c.port === port && c.request?.itemId === itemId);

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // Five well-formed items of mixed kinds and a typed note. This node chases
    // only quote decisions; the other kinds are left alone, and so is the note.
    world: () =>
      new FollowUpWorld({
        items: [
          quote("1001", 6200, 3, "c1"),
          quote("1002", 2400, 2, "c2"),
          { id: "V1", kind: "signed_variation", recordRef: "JOB-77", owedBy: "c3", valueAtRisk: 900, openedAt: daysAgo(4), due: dueIn(2), status: "open" },
          { id: "C1", kind: "certificate", recordRef: "JOB-78", owedBy: "c4", valueAtRisk: 1500, openedAt: daysAgo(5), due: dueIn(1), status: "open" },
          { id: "P1", kind: "po_number", recordRef: "INV-55", owedBy: "c5", valueAtRisk: 3100, openedAt: daysAgo(6), due: dueIn(1), status: "open" },
          { id: "NOTE", kind: "unknown", recordRef: null, owedBy: "c6", valueAtRisk: 0, openedAt: daysAgo(9), due: null, status: "open" },
        ],
        contacts: contacts("c1", "c2", "c3", "c4", "c5", "c6"),
        consents: consents([["c1", "sms"], ["c2", "sms"], ["c3", "sms"], ["c4", "sms"], ["c5", "sms"], ["c6", "sms"]]),
        cadences: [cadence(["sms"]), { ...cadence(["sms"]), kind: "default" }],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const all = world.allItems();
      const byId = new Map(all.map((i) => [i.id, i]));
      return (
        world.touches.length > 0 &&
        world.touches.every((t) => byId.has(t.itemId) && world.wellFormed(byId.get(t.itemId)) && byId.get(t.itemId).kind === "quote_decision") &&
        world.touchesFor("1001").length === 1 &&
        world.touchesFor("1002").length === 1 &&
        world.touchesFor("NOTE").length === 0
      );
    },
    describe: (world) => `touches: ${world.touches.map((t) => `${t.itemId}/${t.channel}`).join(", ") || "none"}`,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // The oldest quote is the smallest; the newest but one is the largest.
    world: () =>
      new FollowUpWorld({
        items: [
          quote("A", 450, 20, "c1"), // oldest, smallest: a laundry vinyl offcut
          quote("B", 3800, 12, "c2"),
          quote("C", 3800, 6, "c3"), // ties B on value, fewer days open
          quote("D", 18500, 3, "c4"), // newest but one, largest: whole-house timber
          quote("E", 1200, 1, "c5"),
        ],
        contacts: contacts("c1", "c2", "c3", "c4", "c5"),
        consents: consents([["c1", "sms"], ["c2", "sms"], ["c3", "sms"], ["c4", "sms"], ["c5", "sms"]]),
        cadences: [cadence(["sms"])],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.itemId);
      return world.runs.length > 0 && order.join(",") === "D,B,C,E,A";
    },
    describe: (world) => `submitted order: ${world.lastRun.map((e) => `${e.itemId}(${e.valueAtRisk}/${e.daysOpen}d)`).join(", ") || "none"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // Three touches, two days apart, driven every day for eight days.
    world: () =>
      new FollowUpWorld({
        items: [quote("2001", 5400, 1, "c1")],
        contacts: contacts("c1"),
        consents: consents([["c1", "sms"]]),
        cadences: [cadence(["sms"], 3, 48)],
      }),
    drive: (build, world) => runs(build, world, Array(7).fill(DAY)),
    holds: (world) => {
      const touches = world.touchesFor("2001");
      const spaced = touches.every((t, i) => i === 0 || Date.parse(t.at) - Date.parse(touches[i - 1].at) >= 48 * HOUR);
      const gated = touches.every((t) =>
        world.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.at === t.at && g.decision.allowed === true),
      );
      return touches.length === 3 && spaced && gated;
    },
    describe: (world) => `touches at: ${world.touchesFor("2001").map((t) => t.at.slice(0, 10)).join(", ") || "none"}`,
  },
  {
    checkId: "channel-follows-consent",
    // The cadence prefers SMS; one customer only consented to email.
    world: () =>
      new FollowUpWorld({
        items: [quote("3001", 7200, 2, "c-email"), quote("3002", 2600, 2, "c-both")],
        contacts: contacts("c-email", "c-both"),
        consents: consents([["c-email", "email"], ["c-both", "sms"], ["c-both", "email"]]),
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const owedBy = new Map(world.allItems().map((i) => [i.id, i.owedBy]));
      const messages = world.touches.filter((t) => t.channel === "sms" || t.channel === "email");
      const emailOnly = world.touchesFor("3001");
      return (
        messages.length > 0 &&
        messages.every((t) => world.hasConsent(owedBy.get(t.itemId), t.channel)) &&
        emailOnly.length === 1 &&
        emailOnly.every((t) => t.channel === "email")
      );
    },
    describe: (world) => `touches: ${world.touches.map((t) => `${t.itemId}/${t.channel}`).join(", ") || "none"}`,
  },
  {
    checkId: "the-call-discloses-first",
    // The business's cadence uses the hosted quote call, on two open quotes.
    world: () => {
      const w = new FollowUpWorld({
        items: [quote("4001", 9100, 2, "c1"), quote("4002", 3300, 2, "c2")],
        contacts: contacts("c1", "c2"),
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("4001", "Should have it back to you in a few days");
      w.reply("4002", "Should have it back to you in a few days");
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ids = ["4001", "4002"];
      return ids.every((id) => {
        const first = world.calls.find((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === id);
        const text = String(first?.request?.text ?? "");
        return (
          world.touchesFor(id).some((t) => t.channel === "call") &&
          first !== undefined &&
          first.port === "disclose" &&
          /\bAI\b/.test(text) &&
          /record/i.test(text)
        );
      });
    },
    describe: (world) =>
      world.turns.length ? world.turns.map((t) => `${t.itemId} ${t.who}: ${t.text}`).join(" | ") : "no call was made",
  },
  {
    checkId: "one-ask-one-answer",
    // One customer names a day; the other says the quote is approved.
    world: () => {
      const w = new FollowUpWorld({
        items: [quote("5001", 8800, 3, "c1"), quote("5002", 4100, 3, "c2")],
        contacts: contacts("c1", "c2"),
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("5001", "We'll have decided by 2026-10-02");
      w.reply("5002", "Approved, go ahead with the hybrid");
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const asks = (id) => world.calls.filter((c) => c.port === "talk" && c.request?.itemId === id && typeof c.request?.text === "string").length;
      const a = world.outcomesFor("5001");
      const b = world.outcomesFor("5002");
      return (
        asks("5001") === 1 &&
        asks("5002") === 1 &&
        a.length === 1 &&
        a[0].kind === "date" &&
        /^\d{4}-\d{2}-\d{2}$/.test(a[0].value) &&
        Number.isFinite(Date.parse(a[0].value)) &&
        b.length === 1 &&
        b[0].kind === "decision" &&
        b[0].value === "approved"
      );
    },
    describe: (world) => `outcomes: ${world.outcomes.map((o) => `${o.itemId} ${o.kind}=${o.value}`).join(", ") || "none"}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // One nudge goes, the customer's acceptance email lands between runs,
    // then two more runs at the gap.
    world: () =>
      new FollowUpWorld({
        items: [quote("6001", 6900, 1, "c1")],
        contacts: contacts("c1"),
        consents: consents([["c1", "sms"]]),
        cadences: [cadence(["sms"], 3, 48)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(DAY);
      world.arrive("6001", "msg:acceptance-6001");
      await build(world.ports());
      world.advance(2 * DAY);
      await build(world.ports());
      world.advance(2 * DAY);
      await build(world.ports());
    },
    holds: (world) => {
      const arrival = world.arrivalFor("6001");
      const touches = world.touchesFor("6001");
      return (
        arrival !== null &&
        arrival.evidenceRef === "msg:acceptance-6001" &&
        world.item("6001")?.status === "arrived" &&
        touches.length === 1 &&
        touches.every((t) => Date.parse(t.at) <= Date.parse(arrival.at))
      );
    },
    describe: (world) =>
      `arrival: ${JSON.stringify(world.arrivalFor("6001"))}; touches: ${world.touchesFor("6001").map((t) => t.at).join(", ") || "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // One customer says no on the call, another says stop. Two more runs.
    world: () => {
      const w = new FollowUpWorld({
        items: [quote("7001", 5200, 3, "c1"), quote("7002", 2900, 3, "c2")],
        contacts: contacts("c1", "c2"),
        consents: consents([["c1", "sms"], ["c2", "sms"]]),
        cadences: [cadence(["call", "sms"])],
      });
      w.reply("7001", "No, we're not going ahead with it");
      w.reply("7002", "Please stop contacting me about this");
      return w;
    },
    drive: (build, world) => runs(build, world, [2 * DAY, 2 * DAY]),
    holds: (world) =>
      ["7001", "7002"].every((id) => {
        const outs = world.outcomesFor(id).filter((o) => o.kind === "declined" || o.kind === "dispute");
        const esc = world.escalationsFor(id);
        const touches = world.touchesFor(id);
        return (
          outs.length === 1 &&
          esc.length === 1 &&
          typeof esc[0].to === "string" &&
          esc[0].to.length > 0 &&
          touches.length === 1 &&
          touches.every((t) => Date.parse(t.at) <= Date.parse(outs[0].recordedAt))
        );
      }),
    describe: (world) =>
      ["7001", "7002"]
        .map((id) => `${id}: ${world.touchesFor(id).length} touch(es), outcomes ${world.outcomesFor(id).map((o) => o.kind).join("/") || "none"}, escalations ${world.escalationsFor(id).length}`)
        .join("; "),
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // The showroom still owes one customer a re-measure and a revised quote.
    world: () =>
      new FollowUpWorld({
        items: [
          quote("8001", 11200, 4, "c1", { weOwe: "re-measure of the stairs and a revised quote" }),
          quote("8002", 3000, 4, "c2"),
        ],
        contacts: contacts("c1", "c2"),
        consents: consents([["c1", "sms"], ["c2", "sms"]]),
        cadences: [cadence(["sms"])],
      }),
    drive: (build, world) => runs(build, world, [2 * DAY]),
    holds: (world) =>
      world.calls.some((c) => c.port === "read_job" && c.request?.items === true) &&
      world.gateDecisions.some((g) => g.itemId === "8001") &&
      world.touchesFor("8001").length === 0 &&
      world.touchesFor("8002").length > 0,
    describe: (world) =>
      `8001 gate: ${world.gateDecisions.filter((g) => g.itemId === "8001").map((g) => g.decision.reason ?? "allowed").join(", ") || "never asked"}; 8001 touches ${world.touchesFor("8001").length}, 8002 touches ${world.touchesFor("8002").length}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // A cadence of three, five runs at the gap, no decision ever comes back.
    world: () =>
      new FollowUpWorld({
        items: [quote("9001", 7700, 1, "c1")],
        contacts: contacts("c1"),
        consents: consents([["c1", "email"]]),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (build, world) => runs(build, world, Array(4).fill(48 * HOUR)),
    holds: (world) => {
      const esc = world.escalationsFor("9001");
      return (
        world.touchesFor("9001").length === 3 &&
        esc.length === 1 &&
        esc[0].reason === "cap_reached" &&
        esc[0].to === MANAGER &&
        esc[0].history.length === 3 &&
        world.alerts.some((a) => a.person === MANAGER && a.text.includes("Q-9001"))
      );
    },
    describe: (world) =>
      `${world.touchesFor("9001").length} touch(es), ${world.escalationsFor("9001").length} escalation(s), alerts to ${world.alerts.map((a) => a.person).join(", ") || "nobody"}`,
  },
  {
    checkId: "the-record-by-item",
    // A call that gets a date, a text two days later in the evening when
    // calling hours are over, then the acceptance arrives.
    world: () => {
      const w = new FollowUpWorld({
        items: [quote("1101", 6400, 2, "c1")],
        contacts: contacts("c1"),
        consents: consents([["c1", "sms"]]),
        cadences: [cadence(["call", "sms"])],
      });
      w.reply("1101", "We'll know by 2026-09-27");
      return w;
    },
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * DAY + 10 * HOUR); // 8pm Brisbane: no calls, a text instead
      await build(world.ports());
      world.advance(DAY);
      world.arrive("1101", "msg:acceptance-1101");
      await build(world.ports());
    },
    holds: (world) => {
      const rec = world.recordFor("1101");
      return (
        rec.touches.length === 2 &&
        rec.touches[0].channel === "call" &&
        rec.touches[0].outcome === "date" &&
        rec.touches[1].channel === "sms" &&
        rec.touches[1].outcome === "sent" &&
        rec.outcomes.some((o) => o.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(o.value)) &&
        rec.arrival !== null &&
        rec.arrival.evidenceRef === "msg:acceptance-1101" &&
        calledPort(world, "evidence", "1101")
      );
    },
    describe: (world) => JSON.stringify(world.recordFor("1101")),
  },
  {
    checkId: "survives-the-builder",
    // A precondition: closed by evidence, never by a run. The runner reports
    // it as evidence_required without calling this.
    world: () => new FollowUpWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: () => "Declared, not scored: who else can explain it, and whose account it runs on.",
  },
];

// The pass test needs real quotes, real customers on real numbers and the
// hosted call. On the stub the runner reports it as with_us.
export const liveScenarios = [];

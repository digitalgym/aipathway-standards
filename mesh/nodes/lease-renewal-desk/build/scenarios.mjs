/**
 * Lease Renewal Desk: one scenario per check of follow-up-build-standard.
 *
 * The world is a residential rent roll. Each open item is the tenant's answer
 * to a renewal offer the property manager already approved and released: a
 * signed renewal, or notice that they will move out at the end of the fixed
 * term. kind `form`, recordRef the tenancy_id, owedBy the tenant, due the
 * lease end date, valueAtRisk the rent the new term holds up.
 *
 * The checks are fetched at run time. Every holds() reads the world, never the
 * build, and returns a strict true or false.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const START = new Date("2026-09-26T00:00:00.000Z"); // 10am Brisbane
const PM = "Priya Shah, property manager";

const iso = (ms) => new Date(START.getTime() + ms).toISOString();

function item(id, over = {}) {
  return {
    id,
    kind: "form",
    recordRef: `TEN-${id}`,
    owedBy: `C-${id}`,
    valueAtRisk: 31200,
    openedAt: iso(-10 * DAY),
    due: "2026-11-30",
    status: "open",
    ...over,
  };
}

function contact(id, name) {
  return { id: `C-${id}`, name };
}

function cadence(over = {}) {
  return { kind: "form", maxTouches: 3, spacingHours: 48, channels: ["sms", "email"], escalateTo: PM, ...over };
}

/** Run the build `n` times, `gapMs` apart. */
function runs(build, world, n, gapMs) {
  for (let i = 0; i < n; i += 1) {
    if (i > 0) world.advance(gapMs);
    build(world.ports());
  }
}

/** Every touch has an allowed gate decision for the same item, channel and moment. */
function everyTouchGated(world) {
  return world.touches.every((t) =>
    world.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.at === t.at && g.decision.allowed === true),
  );
}

const describe = (world) =>
  `${world.calls.length} port call(s); ${world.touches.length} touch(es); ${world.outcomes.length} outcome(s); ` +
  `${world.arrivals.length} arrival(s); ${world.escalations.length} escalation(s)`;

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [
          item("A1", { valueAtRisk: 28600 }),
          item("A2", { valueAtRisk: 33800 }),
          item("A3", { kind: "certificate", valueAtRisk: 900 }),
          item("A4", { kind: "quote_decision", valueAtRisk: 2400 }),
          item("A5", { kind: "po_number", valueAtRisk: 1500 }),
          // A note somebody typed: "chase the Smiths about the lease".
          { id: "NOTE1", kind: "unknown", recordRef: null, owedBy: "C-N1", valueAtRisk: 0, openedAt: iso(-30 * DAY), due: null, status: "open" },
        ],
        contacts: ["A1", "A2", "A3", "A4", "A5", "N1"].map((k) => contact(k, `Tenant ${k}`)),
        consents: ["A1", "A2", "A3", "A4", "A5", "N1"].map((k) => ({ contactId: `C-${k}`, channel: "sms" })),
        cadences: [cadence({ kind: "default" })],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) =>
      world.touches.length === 5 &&
      world.touchesFor("NOTE1").length === 0 &&
      world.touches.every((t) => {
        const it = world.item(t.itemId);
        return Boolean(it) && world.wellFormed(it);
      }) &&
      !world.lastRun.some((e) => e.itemId === "NOTE1"),
    describe,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [
          item("R1", { valueAtRisk: 18200, openedAt: iso(-40 * DAY) }), // oldest, smallest
          item("R2", { valueAtRisk: 26000, openedAt: iso(-30 * DAY) }),
          item("R3", { valueAtRisk: 26000, openedAt: iso(-20 * DAY) }),
          item("R4", { valueAtRisk: 46800, openedAt: iso(-10 * DAY) }), // newest but one, largest
          item("R5", { valueAtRisk: 23400, openedAt: iso(-5 * DAY) }),
        ],
        contacts: ["R1", "R2", "R3", "R4", "R5"].map((k) => contact(k, `Tenant ${k}`)),
        consents: ["R1", "R2", "R3", "R4", "R5"].map((k) => ({ contactId: `C-${k}`, channel: "sms" })),
        cadences: [cadence()],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.itemId);
      return order.join(",") === "R4,R2,R3,R5,R1";
    },
    describe: (world) => `submitted order ${world.lastRun.map((e) => e.itemId).join(",") || "(none)"}; ${describe(world)}`,
  },
  {
    checkId: "cadence-has-a-cap",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [item("C1")],
        contacts: [contact("C1", "Jordan Lee")],
        consents: [{ contactId: "C-C1", channel: "sms" }],
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: (build, world) => runs(build, world, 8, DAY),
    holds: (world) => {
      const t = world.touchesFor("C1");
      if (t.length !== 3) return false;
      for (let i = 1; i < t.length; i += 1) {
        if (new Date(t[i].at).getTime() - new Date(t[i - 1].at).getTime() < 48 * HOUR) return false;
      }
      return everyTouchGated(world);
    },
    describe,
  },
  {
    checkId: "channel-follows-consent",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [item("E1"), item("E2")],
        contacts: [contact("E1", "Sam Nguyen"), contact("E2", "Alex Ward")],
        consents: [
          { contactId: "C-E1", channel: "email" },
          { contactId: "C-E2", channel: "sms" },
        ],
        cadences: [cadence({ channels: ["sms", "email"] })],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const msgs = world.touches.filter((t) => t.channel === "sms" || t.channel === "email");
      const e1 = world.touchesFor("E1");
      return (
        msgs.length === 2 &&
        msgs.every((t) => world.hasConsent(world.item(t.itemId).owedBy, t.channel)) &&
        e1.length === 1 &&
        e1[0].channel === "email"
      );
    },
    describe,
  },
  {
    checkId: "the-call-discloses-first",
    world: () => {
      const w = new FollowUpWorld({
        now: START,
        items: [item("K1"), item("K2", { valueAtRisk: 27000 })],
        contacts: [contact("K1", "Morgan Bell"), contact("K2", "Chris Tan")],
        consents: [],
        cadences: [cadence({ channels: ["call"] })],
      });
      w.reply("K1", "I'll sign it by 2026-10-02");
      w.reply("K2", "Yes, we've signed it, go ahead");
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const called = ["K1", "K2"];
      return called.every((id) => {
        const callTouch = world.touchesFor(id).some((t) => t.channel === "call");
        const first = world.calls.find(
          (c) => (c.port === "disclose" || c.port === "talk") && c.request && c.request.itemId === id,
        );
        const firstTurn = world.turns.find((t) => t.itemId === id);
        return (
          callTouch &&
          Boolean(first) &&
          first.port === "disclose" &&
          Boolean(firstTurn) &&
          firstTurn.who === "agent" &&
          /\bAI\b/.test(firstTurn.text) &&
          /recorded/i.test(firstTurn.text)
        );
      });
    },
    describe,
  },
  {
    checkId: "one-ask-one-answer",
    world: () => {
      const w = new FollowUpWorld({
        now: START,
        items: [item("Q1"), item("Q2", { valueAtRisk: 27000 })],
        contacts: [contact("Q1", "Morgan Bell"), contact("Q2", "Chris Tan")],
        consents: [],
        cadences: [cadence({ channels: ["call"] })],
      });
      w.reply("Q1", "I can drop the signed renewal in on 2026-10-02");
      w.reply("Q2", "Yes, it's approved, we're renewing");
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const asks = (id) => world.calls.filter((c) => c.port === "talk" && c.request && c.request.itemId === id && !c.request.listen).length;
      const o1 = world.outcomesFor("Q1");
      const o2 = world.outcomesFor("Q2");
      const callsHaveOutcome = world.touches.filter((t) => t.channel === "call").every((t) => t.outcome !== "no_outcome");
      return (
        asks("Q1") === 1 &&
        asks("Q2") === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        /^\d{4}-\d{2}-\d{2}$/.test(o1[0].value) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        world.touches.filter((t) => t.channel === "call").length === 2 &&
        callsHaveOutcome
      );
    },
    describe,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [item("S1")],
        contacts: [contact("S1", "Robin Hale")],
        consents: [{ contactId: "C-S1", channel: "sms" }],
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: (build, world) => {
      build(world.ports());
      world.advance(DAY);
      world.arrive("S1", "msg:signed-renewal-TEN-S1.pdf");
      world.advance(DAY);
      build(world.ports());
      world.advance(2 * DAY);
      build(world.ports());
    },
    holds: (world) => {
      const a = world.arrivalFor("S1");
      const t = world.touchesFor("S1");
      return (
        Boolean(a) &&
        a.evidenceRef === "msg:signed-renewal-TEN-S1.pdf" &&
        world.item("S1").status === "arrived" &&
        t.length === 1 &&
        t.every((x) => new Date(x.at).getTime() <= new Date(world.item("S1").received.at).getTime())
      );
    },
    describe,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    world: () => {
      const w = new FollowUpWorld({
        now: START,
        items: [item("D1"), item("D2", { valueAtRisk: 27000 })],
        contacts: [contact("D1", "Pat Moore"), contact("D2", "Lee Fox")],
        consents: [
          { contactId: "C-D1", channel: "sms" },
          { contactId: "C-D2", channel: "sms" },
        ],
        cadences: [cadence({ channels: ["call", "sms"] })],
      });
      w.reply("D1", "No, we're moving out at the end of the lease");
      w.reply("D2", "Please stop calling me about this");
      return w;
    },
    drive: (build, world) => runs(build, world, 3, 2 * DAY),
    holds: (world) =>
      ["D1", "D2"].every((id) => {
        const out = world.outcomesFor(id);
        const esc = world.escalationsFor(id);
        const t = world.touchesFor(id);
        return (
          out.length === 1 &&
          (out[0].kind === "declined" || out[0].kind === "dispute") &&
          esc.length === 1 &&
          typeof esc[0].to === "string" &&
          esc[0].to.length > 0 &&
          t.length === 1 &&
          t.every((x) => new Date(x.at).getTime() <= new Date(out[0].recordedAt).getTime())
        );
      }),
    describe,
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [
          item("W1", { weOwe: "an answer to the tenant's question about the new rent and the broken oven" }),
          item("W2", { valueAtRisk: 20000 }),
        ],
        contacts: [contact("W1", "Dana Ross"), contact("W2", "Kim Park")],
        consents: [
          { contactId: "C-W1", channel: "sms" },
          { contactId: "C-W2", channel: "sms" },
        ],
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: (build, world) => runs(build, world, 2, 2 * DAY),
    holds: (world) =>
      world.calls.some((c) => c.port === "read_job" && c.request && c.request.items === true) &&
      world.gateDecisions.some((g) => g.itemId === "W1") &&
      world.touchesFor("W1").length === 0 &&
      world.touchesFor("W2").length === 2,
    describe,
  },
  {
    checkId: "escalates-after-the-cap",
    world: () =>
      new FollowUpWorld({
        now: START,
        items: [item("X1")],
        contacts: [contact("X1", "Jesse Clark")],
        consents: [{ contactId: "C-X1", channel: "sms" }],
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: (build, world) => runs(build, world, 5, 2 * DAY),
    holds: (world) => {
      const esc = world.escalationsFor("X1");
      return (
        world.touchesFor("X1").length === 3 &&
        esc.length === 1 &&
        esc[0].reason === "cap_reached" &&
        esc[0].to === PM &&
        esc[0].history.length === 3 &&
        world.alerts.some((a) => a.person === PM && a.text.includes("X1"))
      );
    },
    describe,
  },
  {
    checkId: "the-record-by-item",
    world: () => {
      const w = new FollowUpWorld({
        now: START,
        items: [item("H1")],
        contacts: [contact("H1", "Ari Stone")],
        consents: [{ contactId: "C-H1", channel: "sms" }],
        cadences: [cadence({ channels: ["call", "sms"] })],
      });
      w.reply("H1", "I'll have it signed by 2026-10-05");
      return w;
    },
    drive: (build, world) => {
      build(world.ports()); // 10am: the call, which gets a date
      world.advance(2 * DAY + 11 * HOUR); // 9pm two days later: no calls, so a text
      build(world.ports());
      world.advance(DAY);
      world.arrive("H1", "msg:signed-renewal-TEN-H1.pdf");
      build(world.ports());
    },
    holds: (world) => {
      const rec = world.recordFor("H1");
      return (
        rec.touches.length === 2 &&
        rec.touches[0].channel === "call" &&
        rec.touches[1].channel === "sms" &&
        rec.touches.every((t) => t.outcome !== "no_outcome") &&
        rec.outcomes.some((o) => o.kind === "date" && o.value === "2026-10-05") &&
        Boolean(rec.arrival) &&
        rec.arrival.evidenceRef === "msg:signed-renewal-TEN-H1.pdf"
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: closed by evidence, never by this run.
    world: () => new FollowUpWorld({ now: START }),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: () =>
      "Declared: the property manager and the agency's operations lead can explain it; the register, cadence and mailbox run on the agency's own property system and accounts.",
  },
];

export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FollowUpWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe,
  },
];

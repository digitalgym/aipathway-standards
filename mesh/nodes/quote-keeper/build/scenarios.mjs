/**
 * One scenario per check of follow-up-build-standard, for Quote Keeper.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard` from
 * https://aipathway.com.au/explore-ai/follow-up-build-standard and filled in
 * here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls, and what the
 * world recorded through its ports), never the build's own memory. Every
 * `holds` returns a strict boolean.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-26T00:00:00.000Z"); // 10am Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysAhead = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const item = (id, over = {}) => ({
  id,
  kind: "quote_decision",
  recordRef: `quote Q-${id} on job J-${id}`,
  owedBy: `C-${id}`,
  valueAtRisk: 4800,
  openedAt: daysAgo(3),
  due: daysAhead(7),
  status: "open",
  ...over,
});
const contact = (id, name) => ({ id: `C-${id}`, name });
const consent = (id, ...channels) => channels.map((channel) => ({ contactId: `C-${id}`, channel }));
const cadence = (over = {}) => ({
  kind: "default",
  maxTouches: 3,
  spacingHours: 48,
  channels: ["sms", "email"],
  escalateTo: "Dana Whitfield, office manager",
  ...over,
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const runDays = async (b, world, n, config) => {
  for (let d = 0; d < n; d++) {
    if (d > 0) world.advance(DAY);
    await b(world.ports(), config);
  }
};
/** Did an allowed gate decision for this item precede this touch, at or before it? */
const gatedBefore = (world, t) =>
  world.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.decision.allowed === true && g.at === t.at);

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // 1. Five well-formed items of mixed kinds, and one typed note with no kind, record or due date.
    world: () =>
      new FollowUpWorld({
        items: [
          item("101"),
          item("102", { kind: "signed_variation", valueAtRisk: 1200 }),
          item("103", { kind: "certificate", valueAtRisk: 900 }),
          item("104", { kind: "po_number", valueAtRisk: 3100 }),
          item("105", { kind: "form", valueAtRisk: 300 }),
          { id: "NOTE", kind: "unknown", recordRef: null, owedBy: "C-NOTE", valueAtRisk: 0, openedAt: daysAgo(9), due: null, status: "open" },
        ],
        consents: ["101", "102", "103", "104", "105", "NOTE"].flatMap((id) => consent(id, "sms", "email")),
        cadences: [cadence()],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const touched = new Set(world.touches.map((t) => t.itemId));
      const allWellFormed = world.touches.every((t) => {
        const i = world.item(t.itemId);
        return i !== undefined && world.wellFormed(i);
      });
      return (
        callsTo(world, "read_job", (c) => c.request.items === true).length > 0 &&
        world.touches.length === 5 &&
        ["101", "102", "103", "104", "105"].every((id) => touched.has(id)) &&
        !touched.has("NOTE") &&
        allWellFormed &&
        !world.lastRun.some((e) => e.itemId === "NOTE")
      );
    },
    describe: (world) => `touches on ${world.touches.map((t) => t.itemId).join(", ")}; ranked ${world.lastRun.map((e) => e.itemId).join(", ")}`,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // 2. The oldest carries the smallest value; the newest but one carries the largest; two tie on value.
    world: () =>
      new FollowUpWorld({
        items: [
          item("201", { kind: "form", valueAtRisk: 150, openedAt: daysAgo(40) }),
          item("202", { valueAtRisk: 2200, openedAt: daysAgo(20) }),
          item("203", { valueAtRisk: 2200, openedAt: daysAgo(12) }),
          item("204", { valueAtRisk: 18500, openedAt: daysAgo(4) }),
          item("205", { valueAtRisk: 700, openedAt: daysAgo(1) }),
        ],
        consents: ["201", "202", "203", "204", "205"].flatMap((id) => consent(id, "email")),
        cadences: [cadence()],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const order = world.lastRun.map((e) => e.itemId).join(",");
      const touchOrder = world.touches.map((t) => t.itemId).join(",");
      return order === "204,202,203,205,201" && touchOrder === "204,202,203,205,201";
    },
    describe: (world) => `ranked ${world.lastRun.map((e) => `${e.itemId} $${e.valueAtRisk} ${e.daysOpen}d`).join("; ")}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // 3. Three touches, two days apart. Driven every day for eight days on one item that never arrives.
    world: () =>
      new FollowUpWorld({
        items: [item("301")],
        consents: consent("301", "sms"),
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: (b, world) => runDays(b, world, 8),
    holds: (world) => {
      const t = world.touchesFor("301");
      const spaced = t.every((x, i) => i === 0 || new Date(x.at) - new Date(t[i - 1].at) >= 48 * 3600_000);
      const refusedSoon = world.gateDecisions.some((g) => g.itemId === "301" && g.decision.reason === "too_soon");
      return t.length === 3 && spaced && t.every((x) => gatedBefore(world, x)) && refusedSoon;
    },
    describe: (world) => `touches at ${world.touchesFor("301").map((t) => t.at.slice(0, 10)).join(", ")}; gate said ${world.gateDecisions.map((g) => g.decision.reason ?? "ok").join(",")}`,
  },
  {
    checkId: "channel-follows-consent",
    // 4. The cadence's first channel is SMS; one contact consented to email only, another to SMS.
    world: () =>
      new FollowUpWorld({
        items: [item("401", { valueAtRisk: 6000 }), item("402", { valueAtRisk: 5000 })],
        consents: [...consent("401", "email"), ...consent("402", "sms")],
        cadences: [cadence({ channels: ["sms", "email"] })],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const msgs = world.touches.filter((t) => t.channel === "sms" || t.channel === "email");
      const allConsented = msgs.every((t) => world.hasConsent(world.item(t.itemId).owedBy, t.channel));
      const t401 = world.touchesFor("401");
      const t402 = world.touchesFor("402");
      return (
        msgs.length === 2 &&
        allConsented &&
        t401.length === 1 &&
        t401[0].channel === "email" &&
        t402.length === 1 &&
        t402[0].channel === "sms" &&
        callsTo(world, "send_sms", (c) => c.request.itemId === "401" && c.request.channel === "sms").length === 0
      );
    },
    describe: (world) => `touches ${world.touches.map((t) => `${t.itemId} ${t.channel}`).join(", ")}`,
  },
  {
    checkId: "the-call-discloses-first",
    // 5. A cadence whose channel is the call, on two open items.
    world: () =>
      new FollowUpWorld({
        items: [item("501", { valueAtRisk: 9000 }), item("502", { valueAtRisk: 3000 })],
        cadences: [cadence({ channels: ["call"] })],
      }),
    drive: (b, world) => {
      world.reply("501", "Should have it back to you in a few days");
      world.reply("502", "Yes, go ahead");
      return b(world.ports());
    },
    holds: (world) => {
      const calls = world.touches.filter((t) => t.channel === "call");
      if (calls.length !== 2) return false;
      return calls.every((t) => {
        const first = world.calls.find((c) => (c.port === "disclose" || c.port === "talk") && c.request.itemId === t.itemId);
        const text = first?.request?.text ?? "";
        return first?.port === "disclose" && /\bAI\b/.test(text) && /recorded/i.test(text);
      });
    },
    describe: (world) => `first turns: ${world.turns.filter((t, i, a) => a.findIndex((x) => x.itemId === t.itemId) === i).map((t) => `${t.itemId}: ${t.text}`).join(" | ")}`,
  },
  {
    checkId: "one-ask-one-answer",
    // 6. Two calls: one contact gives a day, one says the quote is approved.
    world: () =>
      new FollowUpWorld({
        items: [item("601", { valueAtRisk: 8000 }), item("602", { valueAtRisk: 4000 })],
        cadences: [cadence({ channels: ["call"] })],
      }),
    drive: (b, world) => {
      world.reply("601", "I'll know by 2026-10-02");
      world.reply("602", "Yep, that's approved, go ahead");
      return b(world.ports());
    },
    holds: (world) => {
      const asks = (id) => callsTo(world, "talk", (c) => c.request.itemId === id && typeof c.request.text === "string" && /\?/.test(c.request.text));
      const o1 = world.outcomesFor("601");
      const o2 = world.outcomesFor("602");
      return (
        asks("601").length === 1 &&
        asks("602").length === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        /^\d{4}-\d{2}-\d{2}$/.test(o1[0].value) &&
        !Number.isNaN(Date.parse(o1[0].value)) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        ["approved", "decided"].includes(o2[0].value) &&
        callsTo(world, "record_promise").length === 2
      );
    },
    describe: (world) => `outcomes ${world.outcomes.map((o) => `${o.itemId} ${o.kind}=${o.value}`).join(", ")}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // 7. One touch goes out, the signed acceptance comes back between runs, then two more runs at the gap.
    world: () =>
      new FollowUpWorld({
        items: [item("701", { kind: "signed_variation", valueAtRisk: 2600 })],
        consents: consent("701", "sms"),
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(DAY);
      world.arrive("701", "doc:variation-V7-signed.pdf");
      world.advance(DAY);
      await b(world.ports());
      world.advance(2 * DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const arrival = world.arrivalFor("701");
      const t = world.touchesFor("701");
      return (
        arrival !== null &&
        arrival.evidenceRef === "doc:variation-V7-signed.pdf" &&
        world.item("701")?.status === "arrived" &&
        callsTo(world, "evidence", (c) => c.request.itemId === "701").length >= 1 &&
        t.length === 1 &&
        t.every((x) => x.at < world.item("701").received.at)
      );
    },
    describe: (world) => `touches ${world.touchesFor("701").map((t) => t.at).join(", ")}; arrival ${JSON.stringify(world.arrivalFor("701"))}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // 8. One contact says no on the call; another says stop contacting me. Then two more runs.
    world: () =>
      new FollowUpWorld({
        items: [item("801", { valueAtRisk: 7000 }), item("802", { valueAtRisk: 5000 })],
        consents: [...consent("801", "sms"), ...consent("802", "sms")],
        cadences: [cadence({ channels: ["call", "sms"] })],
      }),
    drive: async (b, world) => {
      world.reply("801", "No, we're not going ahead with it");
      world.reply("802", "Please stop contacting me");
      await b(world.ports());
      world.advance(2 * DAY);
      await b(world.ports());
      world.advance(2 * DAY);
      await b(world.ports());
    },
    holds: (world) =>
      ["801", "802"].every((id) => {
        const o = world.outcomesFor(id);
        const e = world.escalationsFor(id);
        const t = world.touchesFor(id);
        return (
          o.length === 1 &&
          (o[0].kind === "declined" || o[0].kind === "dispute") &&
          e.length === 1 &&
          typeof e[0].to === "string" &&
          e[0].to.trim().length > 0 &&
          t.length === 1 &&
          t.every((x) => x.at <= o[0].recordedAt) &&
          world.alerts.some((a) => a.person === e[0].to)
        );
      }),
    describe: (world) => `outcomes ${world.outcomes.map((o) => `${o.itemId} ${o.kind}`).join(", ")}; escalations ${world.escalations.map((e) => `${e.itemId} ${e.reason} to ${e.to}`).join(", ")}; touches ${world.touches.length}`,
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // 9. The record says the business still owes the customer a revised drawing. Two runs, at the gap.
    world: () =>
      new FollowUpWorld({
        items: [item("901", { weOwe: "a revised drawing for the deck" }), item("902", { valueAtRisk: 100 })],
        consents: [...consent("901", "sms"), ...consent("902", "sms")],
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(2 * DAY);
      await b(world.ports());
    },
    holds: (world) =>
      callsTo(world, "read_job", (c) => c.request.items === true).length === 2 &&
      world.gateDecisions.filter((g) => g.itemId === "901" && g.decision.reason === "we_owe_them").length === 2 &&
      world.touchesFor("901").length === 0 &&
      world.touchesFor("902").length === 2,
    describe: (world) => `gate on 901: ${world.gateDecisions.filter((g) => g.itemId === "901").map((g) => g.decision.reason ?? "ok").join(",")}; touches ${world.touches.map((t) => t.itemId).join(",")}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // 10. A cadence of three, driven past the cap: five runs at the gap on one item that never arrives.
    world: () =>
      new FollowUpWorld({
        items: [item("1001")],
        consents: consent("1001", "sms"),
        cadences: [cadence({ channels: ["sms"] })],
      }),
    drive: async (b, world) => {
      for (let r = 0; r < 5; r++) {
        if (r > 0) world.advance(2 * DAY);
        await b(world.ports());
      }
    },
    holds: (world) => {
      const t = world.touchesFor("1001");
      const e = world.escalationsFor("1001");
      return (
        t.length === 3 &&
        e.length === 1 &&
        e[0].reason === "cap_reached" &&
        e[0].to === "Dana Whitfield, office manager" &&
        e[0].history.length === 3 &&
        e[0].at > t[2].at &&
        world.alerts.filter((a) => a.person === e[0].to).length === 1
      );
    },
    describe: (world) => `touches ${world.touchesFor("1001").length}; escalations ${JSON.stringify(world.escalationsFor("1001").map((e) => ({ to: e.to, history: e.history.length })))}`,
  },
  {
    checkId: "the-record-by-item",
    // 11. A call that gets a date two days out, a text two days later, then the document arrives.
    world: () =>
      new FollowUpWorld({
        items: [item("1101", { valueAtRisk: 12500 })],
        consents: consent("1101", "sms"),
        cadences: [cadence({ channels: ["call", "sms"], maxTouches: 4 })],
      }),
    drive: async (b, world) => {
      world.reply("1101", "I'll have an answer by 2026-09-28");
      await b(world.ports());
      world.advance(2 * DAY);
      await b(world.ports()); // the cadence steps from the call to the text
      world.advance(DAY);
      world.arrive("1101", "doc:quote-Q1101-accepted.pdf");
      await b(world.ports());
      world.recordRead = await b.recordFor(world.ports(), "1101");
    },
    holds: (world) => {
      const r = world.recordRead;
      if (!r) return false;
      const read = callsTo(world, "read_job", (c) => c.request.record === "1101").length > 0;
      return (
        read &&
        r.touches.length === 2 &&
        r.touches.every((t) => typeof t.channel === "string" && t.outcome !== "no_outcome") &&
        r.touches.some((t) => t.channel === "call" && t.outcome === "date") &&
        r.touches.some((t) => t.channel === "sms" && t.outcome === "sent") &&
        r.outcomes.some((o) => o.kind === "date" && o.value === "2026-09-28") &&
        r.arrival !== null &&
        r.arrival.evidenceRef === "doc:quote-Q1101-accepted.pdf"
      );
    },
    describe: (world) => `record ${JSON.stringify(world.recordRead ?? null)}`,
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the register and the cadence live on the
    // business's own job system account.
    world: () => new FollowUpWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, on real open items and a live line.
// This standard publishes no live port map yet, so run.mjs refuses a
// production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FollowUpWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

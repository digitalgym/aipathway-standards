/**
 * One scenario per check of follow-up-build-standard, for Dropped-Ball Scanner.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`
 * from https://aipathway.com.au/explore-ai/follow-up-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * the touches, outcomes, escalations and arrivals), never the build's memory.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-09-26T00:00:00.000Z"); // 10am Brisbane, the world's default clock
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const daysOn = (n) => new Date(NOW.getTime() + n * DAY).toISOString().slice(0, 10);

const OWNER = "Priya Nair (office manager)";

const item = (id, kind, valueAtRisk, openedDays, owedBy, extra = {}) => ({
  id,
  kind,
  recordRef: `QUOTE-${id}`,
  owedBy,
  valueAtRisk,
  openedAt: daysAgo(openedDays),
  due: daysAgo(Math.max(0, openedDays - 3)),
  status: "open",
  ...extra,
});

const cadence = (channels, extra = {}) => ({ kind: "default", maxTouches: 3, spacingHours: 48, channels, escalateTo: OWNER, ...extra });
const consentAll = (ids, channels) => ids.flatMap((contactId) => channels.map((channel) => ({ contactId, channel })));

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));

/** Drive `runs` sweeps, `gapMs` apart. */
const sweeps = (runs, gapMs) => async (build, world) => {
  for (let i = 0; i < runs; i++) {
    if (i > 0) world.advance(gapMs);
    await build(world.ports());
  }
};

const summary = (world) =>
  `${world.touches.length} touch(es) [${world.touches.map((t) => `${t.itemId}:${t.channel}:${t.outcome}`).join(", ")}], ` +
  `${world.outcomes.length} outcome(s), ${world.escalations.length} escalation(s), ${world.arrivals.length} arrival(s), ${world.calls.length} port call(s)`;

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // 1. Five well-formed items of mixed kinds, plus a typed note with no kind, record or due date.
    world: () =>
      new FollowUpWorld({
        items: [
          item("I1", "quote_decision", 8200, 6, "C1"),
          item("I2", "signed_variation", 3400, 9, "C2"),
          item("I3", "certificate", 1500, 12, "C3"),
          item("I4", "po_number", 950, 4, "C4"),
          item("I5", "form", 300, 15, "C5"),
          { id: "NOTE", kind: "unknown", recordRef: null, owedBy: "C6", valueAtRisk: 99999, openedAt: daysAgo(30), due: null, status: "open" },
        ],
        consents: consentAll(["C1", "C2", "C3", "C4", "C5", "C6"], ["sms", "email"]),
        cadences: [cadence(["sms"])],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const touched = new Set(world.touches.map((t) => t.itemId));
      const allTraceToItems = world.touches.every((t) => {
        const i = world.item(t.itemId);
        return i && world.wellFormed(i);
      });
      return touched.size === 5 && !touched.has("NOTE") && allTraceToItems;
    },
    describe: summary,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // 2. The oldest carries the smallest value; the newest but one carries the largest.
    world: () =>
      new FollowUpWorld({
        items: [
          item("OLD-SMALL", "form", 120, 40, "C1"),
          item("MID-A", "certificate", 2400, 20, "C2"),
          item("MID-B", "po_number", 2400, 10, "C3"),
          item("BIG", "quote_decision", 18500, 5, "C4"),
          item("NEWEST", "signed_variation", 900, 2, "C5"),
        ],
        consents: consentAll(["C1", "C2", "C3", "C4", "C5"], ["email"]),
        cadences: [cadence(["email"])],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.lastRun.map((e) => e.itemId);
      const expected = ["BIG", "MID-A", "MID-B", "NEWEST", "OLD-SMALL"];
      const firstTouch = world.touches[0]?.itemId;
      return run.length === 5 && run.every((id, i) => id === expected[i]) && firstTouch === "BIG";
    },
    describe: (world) => `ranked ${world.lastRun.map((e) => `${e.itemId}($${e.valueAtRisk}, ${e.daysOpen}d)`).join(" > ")}; ${summary(world)}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // 3. Three touches, two days apart, driven every day for eight days.
    world: () =>
      new FollowUpWorld({
        items: [item("CAP", "quote_decision", 6000, 3, "C1")],
        consents: consentAll(["C1"], ["sms"]),
        cadences: [cadence(["sms"])],
      }),
    drive: sweeps(8, DAY),
    holds: (world) => {
      const t = world.touchesFor("CAP");
      if (t.length === 0 || t.length > 3) return false;
      for (let i = 1; i < t.length; i++) if (new Date(t[i].at) - new Date(t[i - 1].at) < 48 * HOUR) return false;
      return t.every((touch) =>
        world.gateDecisions.some((g) => g.itemId === touch.itemId && g.channel === touch.channel && g.at === touch.at && g.decision.allowed),
      );
    },
    describe: summary,
  },
  {
    checkId: "channel-follows-consent",
    // 4. The cadence prefers SMS; one contact has consented to email only.
    world: () =>
      new FollowUpWorld({
        items: [item("E-ONLY", "po_number", 4200, 5, "C-EMAIL"), item("BOTH", "form", 800, 5, "C-BOTH")],
        consents: [
          { contactId: "C-EMAIL", channel: "email" },
          { contactId: "C-BOTH", channel: "sms" },
          { contactId: "C-BOTH", channel: "email" },
        ],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const msgs = world.touches.filter((t) => t.channel !== "call");
      const allConsented = msgs.every((t) => world.hasConsent(world.item(t.itemId).owedBy, t.channel));
      const eOnly = world.touchesFor("E-ONLY");
      return msgs.length === 2 && allConsented && eOnly.length === 1 && eOnly[0].channel === "email" && !eOnly.some((t) => t.channel === "sms");
    },
    describe: summary,
  },
  {
    checkId: "the-call-discloses-first",
    // 5. The cadence's channel is the call, on two open items.
    world: () => {
      const w = new FollowUpWorld({
        items: [item("CALL-1", "quote_decision", 7000, 4, "C1"), item("CALL-2", "signed_variation", 3000, 6, "C2")],
        cadences: [cadence(["call"])],
      });
      w.reply("CALL-1", `I'll have it to you by ${daysOn(3)}`);
      w.reply("CALL-2", `Expect it by ${daysOn(4)}`);
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ids = ["CALL-1", "CALL-2"];
      return ids.every((id) => {
        const spoken = world.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request.itemId === id);
        const first = spoken[0];
        return (
          first &&
          first.port === "disclose" &&
          /\bAI\b/.test(first.request.text) &&
          /record/i.test(first.request.text) &&
          world.touchesFor(id).filter((t) => t.channel === "call").length === 1
        );
      });
    },
    describe: (world) => `first turns: ${world.turns.filter((t) => t.who === "agent").map((t) => `${t.itemId}: "${t.text}"`).join(" | ")}; ${summary(world)}`,
  },
  {
    checkId: "one-ask-one-answer",
    // 6. Two calls: one contact gives a day, one says the quote is approved.
    world: () => {
      const w = new FollowUpWorld({
        items: [item("DAY", "certificate", 2500, 5, "C1"), item("YES", "quote_decision", 9000, 5, "C2")],
        cadences: [cadence(["call"])],
      });
      w.reply("DAY", `Should be with you by ${daysOn(5)}`);
      w.reply("YES", "Yes, the quote is approved, go ahead");
      return w;
    },
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const asks = (id) => callsTo(world, "talk", (c) => c.request.itemId === id && typeof c.request.text === "string").length;
      const day = world.outcomesFor("DAY");
      const yes = world.outcomesFor("YES");
      const realDate = day.length === 1 && day[0].kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(day[0].value) && Number.isFinite(Date.parse(day[0].value));
      const decision = yes.length === 1 && yes[0].kind === "decision" && ["approved", "declined"].includes(yes[0].value);
      return asks("DAY") === 1 && asks("YES") === 1 && realDate && decision;
    },
    describe: (world) => `outcomes: ${world.outcomes.map((o) => `${o.itemId}=${o.kind}:${o.value}`).join(", ")}; ${summary(world)}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // 7. One touch, then the signed variation arrives between runs, then two more runs.
    world: () =>
      new FollowUpWorld({
        items: [item("VAR", "signed_variation", 5200, 3, "C1")],
        consents: consentAll(["C1"], ["sms"]),
        cadences: [cadence(["sms"])],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(DAY);
      world.arrive("VAR", "doc:variation-VAR-signed.pdf");
      world.advance(DAY);
      await build(world.ports());
      world.advance(2 * DAY);
      await build(world.ports());
    },
    holds: (world) => {
      const arrival = world.arrivalFor("VAR");
      const received = world.item("VAR").received;
      const touches = world.touchesFor("VAR");
      const filed = callsTo(world, "evidence", (c) => c.request.itemId === "VAR").length >= 1;
      return (
        Boolean(arrival?.evidenceRef) &&
        world.item("VAR").status === "arrived" &&
        filed &&
        touches.length === 1 &&
        touches.every((t) => new Date(t.at) < new Date(received.at))
      );
    },
    describe: summary,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // 8. One contact says no on the call; another says stop contacting me. Then two more runs.
    world: () => {
      const w = new FollowUpWorld({
        items: [item("NO", "quote_decision", 11000, 5, "C1"), item("STOP", "form", 600, 8, "C2")],
        cadences: [cadence(["call"])],
      });
      w.reply("NO", "No, we're not going ahead with it");
      w.reply("STOP", "Please stop contacting me about this");
      return w;
    },
    drive: sweeps(3, 2 * DAY),
    holds: (world) =>
      ["NO", "STOP"].every((id) => {
        const outs = world.outcomesFor(id).filter((o) => o.kind === "declined" || o.kind === "dispute");
        const esc = world.escalationsFor(id);
        const touches = world.touchesFor(id);
        if (outs.length !== 1 || esc.length !== 1 || !esc[0].to) return false;
        return touches.length === 1 && touches.every((t) => new Date(t.at) <= new Date(outs[0].recordedAt));
      }),
    describe: summary,
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // 9. The record says the business still owes the contact a revised drawing. Two runs.
    world: () =>
      new FollowUpWorld({
        items: [item("WAIT", "signed_variation", 7500, 6, "C1", { weOwe: "revised drawing" })],
        consents: consentAll(["C1"], ["sms", "email"]),
        cadences: [cadence(["sms", "email"])],
      }),
    drive: sweeps(2, 2 * DAY),
    holds: (world) => {
      const reads = callsTo(world, "read_job", (c) => c.request.items === true).length;
      const asked = world.gateDecisions.filter((g) => g.itemId === "WAIT").length;
      return reads === 2 && asked >= 2 && world.touchesFor("WAIT").length === 0;
    },
    describe: (world) => `gate said ${world.gateDecisions.map((g) => g.decision.reason ?? "allowed").join(", ")}; ${summary(world)}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // 10. A cadence of three, five runs at the gap, on one item that never arrives.
    world: () =>
      new FollowUpWorld({
        items: [item("QUIET", "certificate", 3300, 4, "C1")],
        consents: consentAll(["C1"], ["email"]),
        cadences: [cadence(["email"])],
      }),
    drive: sweeps(5, 48 * HOUR),
    holds: (world) => {
      const esc = world.escalationsFor("QUIET");
      const told = world.alerts.filter((a) => esc[0] && a.person === esc[0].to);
      return world.touchesFor("QUIET").length === 3 && esc.length === 1 && Boolean(esc[0].to) && esc[0].history.length === 3 && told.length >= 1;
    },
    describe: (world) => `${summary(world)}; alerts: ${world.alerts.map((a) => a.person).join(", ")}`,
  },
  {
    checkId: "the-record-by-item",
    // 11. A call that gets a date, a text two days later (the evening sweep, after
    //     calling hours), then the document arrives.
    world: () => {
      const w = new FollowUpWorld({
        items: [item("REC", "po_number", 4100, 5, "C1")],
        consents: consentAll(["C1"], ["sms"]),
        cadences: [cadence(["call", "sms"])],
      });
      w.reply("REC", `You'll have the PO by ${daysOn(2)}`);
      return w;
    },
    drive: async (build, world) => {
      await build(world.ports()); // 10am: the call
      world.advance(2 * DAY + 10 * HOUR); // 8pm two days on: no calls, so the text
      await build(world.ports());
      world.advance(HOUR);
      world.arrive("REC", "po:PO-77812");
      world.advance(HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const rec = world.recordFor("REC");
      const channels = rec.touches.map((t) => t.channel).join(",");
      return (
        rec.touches.length === 2 &&
        channels === "call,sms" &&
        rec.touches.every((t) => t.outcome && t.outcome !== "no_outcome") &&
        rec.outcomes.some((o) => o.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(o.value)) &&
        Boolean(rec.arrival?.evidenceRef)
      );
    },
    describe: summary,
  },
  {
    checkId: "survives-the-builder",
    // 12. Closed by evidence, not a run: who else can explain this build, and
    //     whose account the register and the cadence run on. The runner never
    //     scores it green on its own say-so.
    world: () => new FollowUpWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The checks a stub cannot pass, and is not asked to. These run only in
// production (AIPATHWAY_ENV=production), against your own systems or the
// hosted provider, and their `holds` is yours to write like the others. The
// world is a placeholder here: run.mjs swaps in the live one.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 13. The pass test passes
    //
    // Conformance:  On real open items with real numbers: one arrives mid-cadence and the chase stops, one says no and is escalated, one is over the cap and goes to a person, and every call disclosed first.
    // Inject:       Real open items on the business's own records, real contacts on real numbers, the cadence the business wrote down, run over its own days.
    // Then assert:  The arrived item has no touch after its arrival. The no is recorded and with a person. The capped item is escalated once with its history. Each call's recording opens with the disclosure and ends with a recorded outcome.
    // On the stub:  Deliberately unpassable on a stub. A stub line says whatever the runner seeded and hears every word. Only a live line proves the disclosure was heard, the answer was the person's, and the text reached the number consent was given for.
    world: () => new FollowUpWorld(),
    drive: (build, world) => build(world.ports()),
    // TODO: read the world and return whether the assertion above holds.
    // It reads the world, never the build: a build that went around the ports
    // leaves the world empty, and that is the point.
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

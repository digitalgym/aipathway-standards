/**
 * One scenario per check of follow-up-build-standard, for Receipt Chase.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`
 * from https://aipathway.com.au/explore-ai/follow-up-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The world is a client's receipt register in a bookkeeping practice: one open
 * item per bank or card line in Xero with no receipt, owed by the person who
 * spent it. Every `holds` reads the world's recorded trace, never the build's
 * memory, and returns a strict true or false. Each one also needs the build to
 * have done the work (a touch, a rank, an escalation), so a do-nothing build
 * goes red.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-05T23:00:00.000Z"); // Tuesday 9am Brisbane
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const isoDay = (d) => new Date(NOW.getTime() + 10 * HOUR + d * DAY).toISOString().slice(0, 10);

const BOOKKEEPER = "Leah Morgan, bookkeeper";

/** A missing receipt on a bank line. recordRef is the line's id in Xero's bank feed. */
const line = (id, owedBy, amount, openedDaysAgo, extra = {}) => ({
  id,
  kind: "form",
  recordRef: `banktxn:${id.toLowerCase()}`,
  owedBy,
  valueAtRisk: amount,
  openedAt: ago(openedDaysAgo),
  due: ago(Math.max(0, openedDaysAgo - 7)),
  status: "open",
  ...extra,
});

const PEOPLE = [
  { id: "P1", name: "Jake Turner" },
  { id: "P2", name: "Nina Ortiz" },
  { id: "P3", name: "Owen Hughes" },
  { id: "P4", name: "Ruby Clarke" },
  { id: "P5", name: "Dev Singh" },
  { id: "P6", name: "Kate Byrne" },
];
const agree = (channel, ...ids) => ids.map((contactId) => ({ contactId, channel }));

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "default",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: BOOKKEEPER,
});

const world = (opts) => new FollowUpWorld({ now: NOW, contacts: PEOPLE, ...opts });

/** n runs, gapHours apart; `between(i, w)` runs before run i (i >= 1). */
async function runs(b, w, n, gapHours = 24, between = () => {}) {
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      w.advance(gapHours * HOUR);
      between(i, w);
    }
    await b(w.ports());
  }
}

const trace = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const callTurns = (w, itemId) => w.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === itemId);
const realDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`));

/** Every touch has an allowed gate decision for that item and channel at the same moment. */
const everyTouchGated = (w) =>
  w.touches.every((t) =>
    w.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.at === t.at && g.decision.allowed === true),
  );

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // Five lines of mixed kinds on the register, and one typed note with no
    // kind, no line and no due date.
    world: () =>
      world({
        items: [
          line("L1", "P1", 412.5, 9),
          line("L2", "P2", 96.0, 6, { kind: "certificate" }),
          line("L3", "P3", 1280.0, 12, { kind: "po_number" }),
          line("L4", "P4", 58.4, 4),
          line("L5", "P5", 230.0, 8, { kind: "signed_variation" }),
          { id: "NOTE1", owedBy: "P6", valueAtRisk: 5000, openedAt: ago(20), status: "open", note: "chase Kate about the Bunnings thing" },
        ],
        consents: agree("email", "P1", "P2", "P3", "P4", "P5", "P6"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.touches.length === 5 &&
      w.touches.every((t) => {
        const i = w.item(t.itemId);
        return Boolean(i) && w.wellFormed(i);
      }) &&
      w.touchesFor("NOTE1").length === 0,
    describe: (w) => `${w.touches.length} touch(es), note touched ${w.touchesFor("NOTE1").length}`,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // The oldest line is the smallest; the newest but one is the largest.
    world: () =>
      world({
        items: [
          line("OLD", "P1", 14.95, 40),
          line("A", "P2", 320.0, 20),
          line("B", "P3", 320.0, 25),
          line("BIG", "P4", 2890.0, 3),
          line("NEW", "P5", 88.0, 1),
        ],
        consents: agree("email", "P1", "P2", "P3", "P4", "P5"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const order = w.runs[0]?.map((e) => e.itemId) ?? [];
      return (
        JSON.stringify(order) === JSON.stringify(["BIG", "B", "A", "NEW", "OLD"]) &&
        w.touches[0]?.itemId === "BIG"
      );
    },
    describe: (w) => `order ${(w.runs[0] ?? []).map((e) => e.itemId).join(", ") || "(none)"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // Three touches, two days apart; driven every day for eight days.
    world: () =>
      world({ items: [line("L1", "P1", 640.0, 10)], consents: agree("email", "P1"), cadences: [cadence(["email"], 3, 48)] }),
    drive: (b, w) => runs(b, w, 8, 24),
    holds: (w) => {
      const t = w.touchesFor("L1");
      const gapsOk = t.every((x, i) => i === 0 || Date.parse(x.at) - Date.parse(t[i - 1].at) >= 48 * HOUR);
      return t.length === 3 && gapsOk && everyTouchGated(w);
    },
    describe: (w) => `${w.touchesFor("L1").length} touch(es) at ${w.touchesFor("L1").map((t) => t.at.slice(5, 10)).join(", ")}`,
  },
  {
    checkId: "channel-follows-consent",
    // The cadence texts first; one spender agreed to email only.
    world: () =>
      world({
        items: [line("L1", "P1", 310.0, 5), line("L2", "P2", 120.0, 5)],
        consents: [...agree("email", "P1"), ...agree("sms", "P2")],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.touches.length === 2 &&
      w.touchesFor("L1").length === 1 &&
      w.touchesFor("L1").every((t) => t.channel === "email") &&
      w.touches.every((t) => t.channel === "call" || w.hasConsent(w.item(t.itemId).owedBy, t.channel)),
    describe: (w) => w.touches.map((t) => `${t.itemId}:${t.channel}`).join(", ") || "no touches",
  },
  {
    checkId: "the-call-discloses-first",
    world: () =>
      world({
        items: [line("L1", "P1", 900.0, 6), line("L2", "P2", 450.0, 6)],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => {
      w.reply("L1", "I'll send it by 2026-10-09");
      w.reply("L2", "Should have it back to you in a few days");
      return b(w.ports());
    },
    holds: (w) =>
      ["L1", "L2"].every((id) => {
        const turns = callTurns(w, id);
        const first = turns[0];
        const text = String(first?.request?.text ?? "");
        return first?.port === "disclose" && /\bAI\b/.test(text) && /record/i.test(text);
      }),
    describe: (w) => ["L1", "L2"].map((id) => `${id} first turn ${callTurns(w, id)[0]?.port ?? "none"}`).join("; "),
  },
  {
    checkId: "one-ask-one-answer",
    world: () =>
      world({
        items: [line("L1", "P1", 760.0, 6, { kind: "form" }), line("L2", "P2", 540.0, 6, { kind: "quote_decision" })],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => {
      w.reply("L1", "I can get it to you by 2026-10-09");
      w.reply("L2", "Yes, that's approved, go ahead");
      return b(w.ports());
    },
    holds: (w) => {
      const asks = (id) => trace(w, "talk", (c) => c.request?.itemId === id && typeof c.request?.text === "string").length;
      const o1 = w.outcomesFor("L1");
      const o2 = w.outcomesFor("L2");
      return (
        asks("L1") === 1 &&
        asks("L2") === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        realDate(o1[0].value) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        o2[0].value === "approved"
      );
    },
    describe: (w) => `L1 ${JSON.stringify(w.outcomesFor("L1"))} L2 ${JSON.stringify(w.outcomesFor("L2"))}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // One reminder; the spender replies on the thread with the receipt; two more runs.
    world: () =>
      world({ items: [line("L1", "P1", 380.0, 8)], consents: agree("email", "P1"), cadences: [cadence(["email"], 3, 48)] }),
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, ww) => {
        if (i === 1) ww.arrive("L1", "message:reply-on-chase-thread-L1");
      }),
    holds: (w) => {
      const a = w.arrivalFor("L1");
      const t = w.touchesFor("L1");
      return (
        a?.evidenceRef === "message:reply-on-chase-thread-L1" &&
        w.item("L1").status === "arrived" &&
        trace(w, "evidence", (c) => c.request?.itemId === "L1").length >= 1 &&
        t.length === 1 &&
        t.every((x) => Date.parse(x.at) < Date.parse(a.at))
      );
    },
    describe: (w) => `${w.touchesFor("L1").length} touch(es), arrival ${w.arrivalFor("L1")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    world: () =>
      world({
        items: [line("L1", "P1", 700.0, 6), line("L2", "P2", 690.0, 6)],
        consents: agree("email", "P1", "P2"),
        cadences: [cadence(["call", "email"])],
      }),
    drive: (b, w) => {
      w.reply("L1", "No, I'm not hunting for that, it was a personal card");
      w.reply("L2", "Please stop asking me about this");
      return runs(b, w, 3, 48);
    },
    holds: (w) =>
      ["L1", "L2"].every((id) => {
        const o = w.outcomesFor(id);
        const e = w.escalationsFor(id);
        const t = w.touchesFor(id);
        return (
          o.length === 1 &&
          (o[0].kind === "declined" || o[0].kind === "dispute") &&
          e.length === 1 &&
          typeof e[0].to === "string" &&
          e[0].to.trim().length > 0 &&
          t.length === 1 &&
          t.every((x) => Date.parse(x.at) <= Date.parse(o[0].recordedAt))
        );
      }) &&
      w.outcomesFor("L1")[0].kind === "declined" &&
      w.outcomesFor("L2")[0].kind === "dispute",
    describe: (w) =>
      ["L1", "L2"]
        .map((id) => `${id}: ${w.outcomesFor(id).map((o) => o.kind).join("/") || "no outcome"}, ${w.touchesFor(id).length} touch(es), ${w.escalationsFor(id).length} escalation(s)`)
        .join("; "),
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // The spender asked which card the line was on; we owe them that answer first.
    world: () =>
      world({
        items: [
          line("WAIT", "P1", 1500.0, 9, { weOwe: "tell Jake which card this line was on" }),
          line("L2", "P2", 200.0, 9),
        ],
        consents: agree("email", "P1", "P2"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => runs(b, w, 2, 48),
    holds: (w) =>
      trace(w, "read_job", (c) => c.request?.items === true).length >= 2 &&
      trace(w, "gate").length >= 1 &&
      w.touchesFor("WAIT").length === 0 &&
      w.touchesFor("L2").length >= 1,
    describe: (w) => `WAIT ${w.touchesFor("WAIT").length} touch(es), L2 ${w.touchesFor("L2").length}`,
  },
  {
    checkId: "escalates-after-the-cap",
    world: () =>
      world({ items: [line("L1", "P1", 845.0, 14)], consents: agree("email", "P1"), cadences: [cadence(["email"], 3, 48)] }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const e = w.escalationsFor("L1");
      return (
        w.touchesFor("L1").length === 3 &&
        e.length === 1 &&
        e[0].to === BOOKKEEPER &&
        e[0].history.length === 3 &&
        w.alerts.some((a) => a.person === BOOKKEEPER && Date.parse(a.at) >= Date.parse(e[0].at))
      );
    },
    describe: (w) => `${w.touchesFor("L1").length} touch(es), ${w.escalationsFor("L1").length} escalation(s), ${w.alerts.length} alert(s)`,
  },
  {
    checkId: "the-record-by-item",
    // A call that gets a date, a text two days later, then the receipt lands.
    world: () =>
      world({ items: [line("L1", "P1", 515.0, 7)], consents: agree("sms", "P1"), cadences: [cadence(["call", "sms"], 3, 48)] }),
    drive: (b, w) => {
      w.reply("L1", `I'll dig it out by ${isoDay(2)}`);
      return runs(b, w, 3, 48, (i, ww) => {
        if (i === 2) ww.arrive("L1", "message:photo-of-receipt-L1");
      });
    },
    holds: (w) => {
      const r = w.recordFor("L1");
      const reads = trace(w, "read_job", (c) => c.request?.record === "L1").length;
      return (
        reads >= 1 &&
        r.touches.length === 2 &&
        r.touches[0].channel === "call" &&
        r.touches[1].channel === "sms" &&
        r.touches.every((t) => t.outcome !== "no_outcome") &&
        r.outcomes.some((o) => o.kind === "date" && realDate(o.value)) &&
        r.arrival?.evidenceRef === "message:photo-of-receipt-L1"
      );
    },
    describe: (w) => {
      const r = w.recordFor("L1");
      return `${r.touches.map((t) => `${t.channel}:${t.outcome}`).join(", ") || "no touches"}; arrival ${r.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards,
    // maintained by AI Pathway; the register and the cadence run on the
    // practice's own Xero and mail accounts.
    world: () => world({}),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, on real lines and a live line. No
// live port map is published for this standard, so the stub reports it as
// with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FollowUpWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

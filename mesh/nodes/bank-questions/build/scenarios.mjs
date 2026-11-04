/**
 * One scenario per check of follow-up-build-standard, for Bank Questions.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`
 * and filled in here. The checks are fetched at run time.
 *
 * The world is a bookkeeping practice's register of what clients owe it. Most
 * items are the month's transaction questions (kind `form`): the client's
 * answers on the bank lines the bookkeeper could not code, on the client's
 * bookkeeping job, with the dollars of those lines as the value at risk. Every
 * `holds` reads the world's own trace, never the build, and returns a strict
 * true or false.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-02T00:00:00.000Z"); // Monday, 10am Brisbane
const ago = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const PERSON = "Jess Moretti, senior bookkeeper";

const item = (id, owedBy, valueAtRisk, openedDaysAgo, extra = {}) => ({
  id,
  kind: "form",
  recordRef: `job:bk-${id.toLowerCase()}-oct-2026`,
  owedBy,
  valueAtRisk,
  openedAt: ago(openedDaysAgo),
  due: ago(1),
  status: "open",
  ...extra,
});

const CONTACTS = [
  { id: "C1", name: "Dean Hollis" },
  { id: "C2", name: "Lena Park" },
  { id: "C3", name: "Ravi Menon" },
  { id: "C4", name: "Kate O'Brien" },
  { id: "C5", name: "Hugo Silva" },
  { id: "C6", name: "Tara Quinn" },
];
const consent = (channel, ...ids) => ids.map((contactId) => ({ contactId, channel }));
const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({ kind: "default", maxTouches, spacingHours, channels, escalateTo: PERSON });
const world = (opts) => new FollowUpWorld({ now: NOW, contacts: CONTACTS, ...opts });

/** n runs, gapHours apart; `between(i, w)` runs before run i. */
const runs = async (b, w, n, gapHours = 24, between = () => {}) => {
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      w.advance(gapHours * HOUR);
      between(i, w);
    }
    await b(w.ports());
  }
};

const turnsOf = (w, id) => w.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === id);
const realDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
const after = (t, at) => new Date(t.at).getTime() > new Date(at).getTime();
const gatedOk = (w, t) => w.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.at === t.at && g.decision.allowed === true);

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    world: () =>
      world({
        items: [
          item("Q1", "C1", 4180, 9),
          item("Q2", "C2", 2730, 6),
          item("FEE3", "C3", 1900, 5, { kind: "quote_decision" }),
          item("CERT4", "C4", 1200, 4, { kind: "certificate" }),
          item("PO5", "C5", 3300, 3, { kind: "po_number" }),
          { id: "NOTE6", kind: "unknown", recordRef: null, owedBy: "C6", valueAtRisk: 0, openedAt: ago(30), due: null, status: "open" },
        ],
        consents: consent("email", "C1", "C2", "C3", "C4", "C5", "C6"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ok = ["Q1", "Q2", "FEE3", "CERT4", "PO5"];
      return (
        w.touches.length === 5 &&
        w.touches.every((t) => {
          const it = w.item(t.itemId);
          return it !== undefined && w.wellFormed(it);
        }) &&
        ok.every((id) => w.touchesFor(id).length === 1) &&
        w.touchesFor("NOTE6").length === 0
      );
    },
    describe: (w) => `touches: ${w.touches.map((t) => t.itemId).join(", ") || "none"}`,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    world: () =>
      world({
        items: [
          item("OLD", "C1", 140, 70),
          item("MID1", "C2", 860, 40),
          item("MID2", "C3", 860, 15),
          item("BIG", "C4", 9600, 4),
          item("NEW", "C5", 310, 1),
        ],
        consents: consent("email", "C1", "C2", "C3", "C4", "C5"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const order = w.lastRun.map((e) => e.itemId).join(",");
      const sent = w.touches.map((t) => t.itemId).join(",");
      const want = "BIG,MID1,MID2,NEW,OLD";
      return w.runs.length === 1 && order === want && sent === want;
    },
    describe: (w) => `ranked ${w.lastRun.map((e) => e.itemId).join(",") || "nothing"}; sent ${w.touches.map((t) => t.itemId).join(",") || "nothing"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    world: () => world({ items: [item("Q1", "C1", 2450, 3)], consents: consent("email", "C1"), cadences: [cadence(["email"], 3, 48)] }),
    drive: (b, w) => runs(b, w, 8),
    holds: (w) => {
      const t = w.touchesFor("Q1");
      const spaced = t.every((x, i) => i === 0 || new Date(x.at).getTime() - new Date(t[i - 1].at).getTime() >= 48 * HOUR);
      return t.length === 3 && spaced && t.every((x) => gatedOk(w, x));
    },
    describe: (w) => `touches at ${w.touchesFor("Q1").map((t) => t.at.slice(0, 10)).join(", ") || "none"}`,
  },
  {
    checkId: "channel-follows-consent",
    world: () =>
      world({
        items: [item("Q1", "C1", 1800, 3), item("Q2", "C2", 1500, 3)],
        consents: [...consent("email", "C1", "C2"), ...consent("sms", "C2")],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const written = w.touches.filter((t) => t.channel !== "call");
      const allConsented = written.every((t) => w.hasConsent(w.item(t.itemId).owedBy, t.channel));
      const q1 = w.touchesFor("Q1");
      const q2 = w.touchesFor("Q2");
      return allConsented && q1.length === 1 && q1[0].channel === "email" && q2.length === 1 && q2[0].channel === "sms";
    },
    describe: (w) => `touches: ${w.touches.map((t) => `${t.itemId}/${t.channel}`).join(", ") || "none"}`,
  },
  {
    checkId: "the-call-discloses-first",
    world: () => {
      const w = world({ items: [item("Q1", "C1", 3100, 4), item("Q2", "C2", 2200, 4)], cadences: [cadence(["call"])] });
      w.reply("Q1", "I can get them to you by 2026-11-06");
      w.reply("Q2", "Should have it back to you next week");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      ["Q1", "Q2"].every((id) => {
        const turns = turnsOf(w, id);
        const first = turns[0];
        const text = String(first?.request?.text ?? "").toLowerCase();
        return first !== undefined && first.port === "disclose" && /\bai\b/.test(text) && /record/.test(text) && turns.length >= 2;
      }),
    describe: (w) => ["Q1", "Q2"].map((id) => `${id}: ${turnsOf(w, id).map((c) => c.port).join(">") || "no call"}`).join("; "),
  },
  {
    checkId: "one-ask-one-answer",
    world: () => {
      const w = world({ items: [item("Q1", "C1", 3100, 4), item("FEE2", "C2", 2600, 4, { kind: "quote_decision" })], cadences: [cadence(["call"])] });
      w.reply("Q1", "Friday works, say 2026-11-06");
      w.reply("FEE2", "Yes, the fee quote is approved, go ahead");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const asks = (id) => w.calls.filter((c) => c.port === "talk" && c.request?.itemId === id && !c.request?.listen).length;
      const o1 = w.outcomesFor("Q1");
      const o2 = w.outcomesFor("FEE2");
      return (
        asks("Q1") === 1 &&
        asks("FEE2") === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        realDate(o1[0].value) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        w.touches.filter((t) => t.channel === "call").every((t) => t.outcome !== "no_outcome")
      );
    },
    describe: (w) => w.outcomes.map((o) => `${o.itemId}: ${o.kind}=${o.value}`).join("; ") || "no outcomes",
  },
  {
    checkId: "stops-the-moment-it-arrives",
    world: () => world({ items: [item("Q1", "C1", 2950, 3)], consents: consent("email", "C1"), cadences: [cadence(["email"], 3, 24)] }),
    drive: (b, w) => runs(b, w, 4, 24, (i, ww) => i === 1 && ww.arrive("Q1", "msg:client-reply-q1")),
    holds: (w) => {
      const a = w.arrivalFor("Q1");
      return (
        a !== null &&
        a.evidenceRef === "msg:client-reply-q1" &&
        w.item("Q1").status === "arrived" &&
        w.touchesFor("Q1").length === 1 &&
        !w.touchesFor("Q1").some((t) => after(t, a.at) || t.at === a.at)
      );
    },
    describe: (w) => `touches ${w.touchesFor("Q1").length}; arrival ${w.arrivalFor("Q1")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    world: () => {
      const w = world({ items: [item("Q1", "C1", 3400, 4), item("Q2", "C2", 2100, 4)], consents: consent("email", "C1", "C2"), cadences: [cadence(["call", "email"], 5, 24)] });
      w.reply("Q1", "No, I'm not doing that, ask my old accountant");
      w.reply("Q2", "Stop contacting me about this");
      return w;
    },
    drive: (b, w) => runs(b, w, 3, 24),
    holds: (w) =>
      ["Q1", "Q2"].every((id, i) => {
        const out = w.outcomesFor(id);
        const esc = w.escalationsFor(id);
        const want = i === 0 ? "declined" : "dispute";
        return (
          out.length === 1 &&
          out[0].kind === want &&
          esc.length === 1 &&
          esc[0].to === PERSON &&
          w.touchesFor(id).length === 1 &&
          !w.touchesFor(id).some((t) => after(t, out[0].recordedAt))
        );
      }),
    describe: (w) => ["Q1", "Q2"].map((id) => `${id}: ${w.touchesFor(id).length} touch, ${w.outcomesFor(id).map((o) => o.kind).join("/") || "no outcome"}, ${w.escalationsFor(id).length} esc`).join("; "),
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    world: () =>
      world({
        items: [item("Q1", "C1", 5200, 5, { weOwe: "the corrected list: we sent last quarter's lines by mistake" }), item("Q2", "C2", 900, 5)],
        consents: consent("email", "C1", "C2"),
        cadences: [cadence(["email"], 3, 24)],
      }),
    drive: (b, w) => runs(b, w, 2, 24),
    holds: (w) =>
      w.calls.some((c) => c.port === "read_job" && c.request?.items === true) &&
      w.gateDecisions.some((g) => g.itemId === "Q1") &&
      w.touchesFor("Q1").length === 0 &&
      w.touchesFor("Q2").length === 2,
    describe: (w) => `Q1 touches ${w.touchesFor("Q1").length}, gate asked ${w.gateDecisions.filter((g) => g.itemId === "Q1").length}; Q2 touches ${w.touchesFor("Q2").length}`,
  },
  {
    checkId: "escalates-after-the-cap",
    world: () => world({ items: [item("Q1", "C1", 2600, 3)], consents: consent("email", "C1"), cadences: [cadence(["email"], 3, 48)] }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const esc = w.escalationsFor("Q1");
      return (
        w.touchesFor("Q1").length === 3 &&
        esc.length === 1 &&
        esc[0].reason === "cap_reached" &&
        esc[0].to === PERSON &&
        esc[0].history.length === 3 &&
        w.alerts.filter((a) => a.person === PERSON).length === 1 &&
        !w.touchesFor("Q1").some((t) => after(t, esc[0].at))
      );
    },
    describe: (w) => `touches ${w.touchesFor("Q1").length}; escalations ${w.escalationsFor("Q1").length}; alerts ${w.alerts.length}`,
  },
  {
    checkId: "the-record-by-item",
    world: () => {
      const w = world({ items: [item("Q1", "C1", 3750, 4)], consents: consent("sms", "C1"), cadences: [cadence(["call", "sms"], 3, 48)] });
      w.reply("Q1", "I'll do them on 2026-11-04");
      return w;
    },
    drive: (b, w) => runs(b, w, 4, 24, (i, ww) => i === 3 && ww.arrive("Q1", "msg:client-reply-q1")),
    holds: (w) => {
      const r = w.recordFor("Q1");
      return (
        r.touches.length === 2 &&
        r.touches[0].channel === "call" &&
        r.touches[0].outcome === "date" &&
        r.touches[1].channel === "sms" &&
        r.touches[1].outcome === "sent" &&
        r.outcomes.length === 1 &&
        r.outcomes[0].kind === "date" &&
        realDate(r.outcomes[0].value) &&
        r.arrival !== null &&
        r.arrival.evidenceRef === "msg:client-reply-q1"
      );
    },
    describe: (w) => {
      const r = w.recordFor("Q1");
      return `touches ${r.touches.map((t) => `${t.channel}:${t.outcome}`).join(",") || "none"}; arrival ${r.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // A precondition the runner reports and never scores on our say-so.
    // Declared: the build is in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the register and cadence run on the practice's
    // own accounts, and README.md says what it does in plain words.
    world: () => world({}),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on real open items and a live line. No live port
// map is published for this standard, so it reports with_us on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FollowUpWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of follow-up-build-standard, for Starter Pack.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`
 * from https://aipathway.com.au/explore-ai/follow-up-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The world is an Australian employer's starter register: one open item per
 * document a new starter still owes before their first pay (the TFN
 * declaration, the super standard choice form, the bank details form, the
 * right to work evidence), against the starter's employee record. Every
 * `holds` reads the world's recorded trace, never the build's memory, and
 * returns a strict true or false. Each one also needs the build to have done
 * the work (a touch, a rank, an escalation), so a do-nothing build goes red.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-02T23:00:00.000Z"); // Tuesday 9am Brisbane
const ago = (d) => new Date(NOW.getTime() - d * DAY).toISOString();
const isoDay = (d) => new Date(NOW.getTime() + 10 * HOUR + d * DAY).toISOString().slice(0, 10);

const PAYROLL = "Tara Nguyen, payroll officer";

/**
 * One document a starter owes. recordRef is the starter's employee record in
 * payroll plus the document it is for. valueAtRisk is the first pay it holds up.
 */
const doc = (id, owedBy, employee, document, value, openedDaysAgo, extra = {}) => ({
  id,
  kind: "form",
  recordRef: `employee:${employee}#${document}`,
  owedBy,
  valueAtRisk: value,
  openedAt: ago(openedDaysAgo),
  due: ago(Math.max(0, openedDaysAgo - 5)),
  status: "open",
  ...extra,
});

const STARTERS = [
  { id: "S1", name: "Sam Patel" },
  { id: "S2", name: "Mia Kowalski" },
  { id: "S3", name: "Liam O'Brien" },
  { id: "S4", name: "Grace Tan" },
  { id: "S5", name: "Noah Walker" },
  { id: "S6", name: "Ella Fraser" },
];
const agree = (channel, ...ids) => ids.map((contactId) => ({ contactId, channel }));

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "default",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: PAYROLL,
});

const world = (opts) => new FollowUpWorld({ now: NOW, contacts: STARTERS, ...opts });

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
    // Five documents of mixed kinds on a shared register, and one typed note
    // with no kind, no record and no due date.
    world: () =>
      world({
        items: [
          doc("D1", "S1", "E1042", "tfn_declaration", 1840, 6),
          doc("D2", "S2", "E1043", "work_rights", 2100, 4, { kind: "certificate" }),
          doc("D3", "S3", "E1044", "super_choice", 1650, 7),
          doc("D4", "S4", "E1045", "bank_details", 1720, 3),
          doc("D5", "S5", "E1046", "contract", 900, 5, { kind: "signed_variation" }),
          { id: "NOTE1", owedBy: "S6", valueAtRisk: 5000, openedAt: ago(12), status: "open", note: "ask Ella about her super" },
        ],
        consents: agree("email", "S1", "S2", "S3", "S4", "S5", "S6"),
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
    // The oldest item is the smallest (a casual's bank form); the newest but
    // one is the largest (a site manager's work rights evidence).
    world: () =>
      world({
        items: [
          doc("OLD", "S1", "E2001", "bank_details", 310, 30),
          doc("A", "S2", "E2002", "tfn_declaration", 1500, 10),
          doc("B", "S3", "E2003", "super_choice", 1500, 14),
          doc("BIG", "S4", "E2004", "work_rights", 3850, 2),
          doc("NEW", "S5", "E2005", "tfn_declaration", 620, 1),
        ],
        consents: agree("email", "S1", "S2", "S3", "S4", "S5"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const order = w.runs[0]?.map((e) => e.itemId) ?? [];
      return JSON.stringify(order) === JSON.stringify(["BIG", "B", "A", "NEW", "OLD"]) && w.touches[0]?.itemId === "BIG";
    },
    describe: (w) => `order ${(w.runs[0] ?? []).map((e) => e.itemId).join(", ") || "(none)"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // Three touches, two days apart; driven every day for eight days.
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "tfn_declaration", 1840, 6)],
        consents: agree("email", "S1"),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 8, 24),
    holds: (w) => {
      const t = w.touchesFor("D1");
      const gapsOk = t.every((x, i) => i === 0 || Date.parse(x.at) - Date.parse(t[i - 1].at) >= 48 * HOUR);
      return t.length === 3 && gapsOk && everyTouchGated(w);
    },
    describe: (w) => `${w.touchesFor("D1").length} touch(es) at ${w.touchesFor("D1").map((t) => t.at.slice(5, 10)).join(", ")}`,
  },
  {
    checkId: "channel-follows-consent",
    // The cadence texts first; one starter gave email only on their offer.
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "super_choice", 1650, 4), doc("D2", "S2", "E1043", "bank_details", 1720, 4)],
        consents: [...agree("email", "S1"), ...agree("sms", "S2")],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.touches.length === 2 &&
      w.touchesFor("D1").length === 1 &&
      w.touchesFor("D1").every((t) => t.channel === "email") &&
      w.touches.every((t) => t.channel === "call" || w.hasConsent(w.item(t.itemId).owedBy, t.channel)),
    describe: (w) => w.touches.map((t) => `${t.itemId}:${t.channel}`).join(", ") || "no touches",
  },
  {
    checkId: "the-call-discloses-first",
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "work_rights", 2100, 5), doc("D2", "S2", "E1043", "tfn_declaration", 1500, 5)],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => {
      w.reply("D1", `I'll scan my passport by ${isoDay(2)}`);
      w.reply("D2", "Should have it back to you in a few days");
      return b(w.ports());
    },
    holds: (w) =>
      ["D1", "D2"].every((id) => {
        const first = callTurns(w, id)[0];
        const text = String(first?.request?.text ?? "");
        return first?.port === "disclose" && /\bAI\b/.test(text) && /record/i.test(text);
      }),
    describe: (w) => ["D1", "D2"].map((id) => `${id} first turn ${callTurns(w, id)[0]?.port ?? "none"}`).join("; "),
  },
  {
    checkId: "one-ask-one-answer",
    // One starter gives a day; on the other item the contract decision is given.
    world: () =>
      world({
        items: [
          doc("D1", "S1", "E1042", "super_choice", 1650, 5),
          doc("D2", "S2", "E1043", "contract", 1200, 5, { kind: "quote_decision" }),
        ],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => {
      w.reply("D1", `I can get the form to you by ${isoDay(3)}`);
      w.reply("D2", "Yes, that's approved, go ahead");
      return b(w.ports());
    },
    holds: (w) => {
      const asks = (id) => trace(w, "talk", (c) => c.request?.itemId === id && typeof c.request?.text === "string").length;
      const o1 = w.outcomesFor("D1");
      const o2 = w.outcomesFor("D2");
      return (
        asks("D1") === 1 &&
        asks("D2") === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        realDate(o1[0].value) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        o2[0].value === "approved"
      );
    },
    describe: (w) => `D1 ${JSON.stringify(w.outcomesFor("D1"))} D2 ${JSON.stringify(w.outcomesFor("D2"))}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // One reminder; the starter uploads the TFN declaration on the item's own
    // link between runs; two more runs.
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "tfn_declaration", 1840, 6)],
        consents: agree("email", "S1"),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, ww) => {
        if (i === 1) ww.arrive("D1", "message:reply-on-chase-thread-D1");
      }),
    holds: (w) => {
      const a = w.arrivalFor("D1");
      const t = w.touchesFor("D1");
      return (
        a?.evidenceRef === "message:reply-on-chase-thread-D1" &&
        w.item("D1").status === "arrived" &&
        trace(w, "evidence", (c) => c.request?.itemId === "D1").length >= 1 &&
        t.length === 1 &&
        t.every((x) => Date.parse(x.at) < Date.parse(a.at))
      );
    },
    describe: (w) => `${w.touchesFor("D1").length} touch(es), arrival ${w.arrivalFor("D1")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "super_choice", 1650, 5), doc("D2", "S2", "E1043", "bank_details", 1640, 5)],
        consents: agree("email", "S1", "S2"),
        cadences: [cadence(["call", "email"])],
      }),
    drive: (b, w) => {
      w.reply("D1", "No, I'm not filling that in, I'll sort super with my manager");
      w.reply("D2", "Please stop contacting me about this");
      return runs(b, w, 3, 48);
    },
    holds: (w) =>
      ["D1", "D2"].every((id) => {
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
      w.outcomesFor("D1")[0].kind === "declined" &&
      w.outcomesFor("D2")[0].kind === "dispute",
    describe: (w) =>
      ["D1", "D2"]
        .map((id) => `${id}: ${w.outcomesFor(id).map((o) => o.kind).join("/") || "no outcome"}, ${w.touchesFor(id).length} touch(es), ${w.escalationsFor(id).length} escalation(s)`)
        .join("; "),
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // The starter asked for the right TFN declaration link and has not had it.
    world: () =>
      world({
        items: [
          doc("WAIT", "S1", "E1042", "tfn_declaration", 2400, 6, { weOwe: "send Sam the working upload link for his TFN declaration" }),
          doc("D2", "S2", "E1043", "bank_details", 900, 6),
        ],
        consents: agree("email", "S1", "S2"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => runs(b, w, 2, 48),
    holds: (w) =>
      trace(w, "read_job", (c) => c.request?.items === true).length >= 2 &&
      trace(w, "gate").length >= 1 &&
      w.touchesFor("WAIT").length === 0 &&
      w.touchesFor("D2").length >= 1,
    describe: (w) => `WAIT ${w.touchesFor("WAIT").length} touch(es), D2 ${w.touchesFor("D2").length}`,
  },
  {
    checkId: "escalates-after-the-cap",
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "work_rights", 2100, 9)],
        consents: agree("email", "S1"),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const e = w.escalationsFor("D1");
      return (
        w.touchesFor("D1").length === 3 &&
        e.length === 1 &&
        e[0].to === PAYROLL &&
        e[0].history.length === 3 &&
        w.alerts.some((a) => a.person === PAYROLL && Date.parse(a.at) >= Date.parse(e[0].at))
      );
    },
    describe: (w) => `${w.touchesFor("D1").length} touch(es), ${w.escalationsFor("D1").length} escalation(s), ${w.alerts.length} alert(s)`,
  },
  {
    checkId: "the-record-by-item",
    // A call that gets a date, a text two days later, then the form lands.
    world: () =>
      world({
        items: [doc("D1", "S1", "E1042", "super_choice", 1650, 5)],
        consents: agree("sms", "S1"),
        cadences: [cadence(["call", "sms"], 3, 48)],
      }),
    drive: (b, w) => {
      w.reply("D1", `I'll fill it in by ${isoDay(2)}`);
      return runs(b, w, 3, 48, (i, ww) => {
        if (i === 2) ww.arrive("D1", "message:upload-super-choice-D1");
      });
    },
    holds: (w) => {
      const r = w.recordFor("D1");
      const reads = trace(w, "read_job", (c) => c.request?.record === "D1").length;
      return (
        reads >= 1 &&
        r.touches.length === 2 &&
        r.touches[0].channel === "call" &&
        r.touches[1].channel === "sms" &&
        r.touches.every((t) => t.outcome !== "no_outcome") &&
        r.outcomes.some((o) => o.kind === "date" && realDate(o.value)) &&
        r.arrival?.evidenceRef === "message:upload-super-choice-D1"
      );
    },
    describe: (w) => {
      const r = w.recordFor("D1");
      return `${r.touches.map((t) => `${t.channel}:${t.outcome}`).join(", ") || "no touches"}; arrival ${r.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards,
    // maintained by AI Pathway; the starter register and the cadence run on
    // the employer's own payroll and mail accounts.
    world: () => world({}),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, on real starters and a live line.
// No live port map is published for this standard, so the stub reports it as
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

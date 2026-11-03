/**
 * One scenario per check of follow-up-build-standard, for Docs Due.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`
 * from https://aipathway.com.au/explore-ai/follow-up-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The world is an accounting practice's client checklist: what each client
 * still owes before the job can be finished. Every `holds` reads the world's
 * recorded trace and what it recorded through its ports, never the build's
 * own memory, and returns a strict true or false.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-09-28T00:00:00.000Z"); // Monday, 10am Brisbane
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const dueIn = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const PERSON = "Priya Shah, client services manager";

const item = (id, kind, owedBy, valueAtRisk, openedDaysAgo, extra = {}) => ({
  id,
  kind,
  recordRef: `job:${id.toLowerCase()}-itr-2026`,
  owedBy,
  valueAtRisk,
  openedAt: daysAgo(openedDaysAgo),
  due: dueIn(-1),
  status: "open",
  ...extra,
});

const contact = (id, name) => ({ id, name });
const email = (...ids) => ids.map((contactId) => ({ contactId, channel: "email" }));

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "default",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: PERSON,
});

const world = (opts) => new FollowUpWorld({ now: NOW, ...opts });

/** Drive n runs, `gapHours` apart. */
const runs = async (b, w, n, gapHours = 24, between = () => {}) => {
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      w.advance(gapHours * HOUR);
      between(i, w);
    }
    await b(w.ports());
  }
};

const portCalls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));

/** The call turns for one item, in order, from the trace. */
const callTurns = (w, itemId) =>
  w.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === itemId);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v) => typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

const CONTACTS = [
  contact("C1", "Mia Nguyen"),
  contact("C2", "Tom Walsh"),
  contact("C3", "Aisha Rahman"),
  contact("C4", "Ben Cooper"),
  contact("C5", "Grace Lee"),
  contact("C6", "Sam Patel"),
];

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // 1. Five well-formed items of mixed kinds, plus a typed note with no kind, record or due date.
    world: () =>
      world({
        items: [
          item("ENG-1", "form", "C1", 1650, 9), // signed engagement letter
          item("CERT-2", "certificate", "C2", 2200, 7), // super fund contribution certificate
          item("FEE-3", "quote_decision", "C3", 3800, 5), // fee quote for the year's returns
          item("VAR-4", "signed_variation", "C4", 900, 4), // added BAS work, not yet signed
          item("PO-5", "po_number", "C5", 4400, 3), // company client's PO for the invoice
          { id: "NOTE-6", kind: "unknown", recordRef: null, owedBy: "C6", valueAtRisk: 0, openedAt: daysAgo(30), due: null, status: "open" },
        ],
        contacts: CONTACTS,
        consents: email("C1", "C2", "C3", "C4", "C5", "C6"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const wellFormedIds = ["ENG-1", "CERT-2", "FEE-3", "VAR-4", "PO-5"];
      const everyTouchOnAnItem = w.touches.every((t) => {
        const it = w.item(t.itemId);
        return it !== undefined && w.wellFormed(it);
      });
      const eachChased = wellFormedIds.every((id) => w.touchesFor(id).length === 1);
      return w.touches.length === 5 && everyTouchOnAnItem && eachChased && w.touchesFor("NOTE-6").length === 0;
    },
    describe: (w) => `touches: ${w.touches.map((t) => `${t.itemId}/${t.channel}`).join(", ") || "none"}`,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // 2. The oldest carries the smallest value, the newest but one the largest, and two share a value.
    world: () =>
      world({
        items: [
          item("A", "form", "C1", 150, 60),
          item("B", "certificate", "C2", 900, 40),
          item("C", "certificate", "C3", 900, 20),
          item("D", "quote_decision", "C4", 5000, 5),
          item("E", "form", "C5", 300, 1),
        ],
        contacts: CONTACTS,
        consents: email("C1", "C2", "C3", "C4", "C5"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const order = w.lastRun.map((e) => e.itemId);
      const valuesTrue = w.lastRun.every((e) => e.valueAtRisk === w.item(e.itemId)?.valueAtRisk);
      const daysTrue = w.lastRun.every((e) => {
        const it = w.item(e.itemId);
        return it !== undefined && Math.abs(e.daysOpen - (NOW.getTime() - new Date(it.openedAt).getTime()) / DAY) < 1;
      });
      // And the touches went out in that order.
      const touchOrder = w.touches.map((t) => t.itemId);
      return (
        w.runs.length === 1 &&
        order.join(",") === "D,B,C,E,A" &&
        valuesTrue &&
        daysTrue &&
        touchOrder.join(",") === "D,B,C,E,A"
      );
    },
    describe: (w) => `ranked ${w.lastRun.map((e) => `${e.itemId}($${e.valueAtRisk},${e.daysOpen}d)`).join(" > ") || "nothing"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // 3. Three touches two days apart; run every day for eight days on one item.
    world: () =>
      world({
        items: [item("TFN-1", "form", "C1", 1200, 10)],
        contacts: CONTACTS,
        consents: email("C1"),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 8, 24),
    holds: (w) => {
      const t = w.touchesFor("TFN-1");
      const spaced = t.every((x, i) => i === 0 || new Date(x.at) - new Date(t[i - 1].at) >= 48 * HOUR);
      const gated = t.every((x) =>
        w.gateDecisions.some((g) => g.itemId === x.itemId && g.channel === x.channel && g.at === x.at && g.decision.allowed === true),
      );
      return t.length === 3 && spaced && gated;
    },
    describe: (w) => `touches at ${w.touchesFor("TFN-1").map((t) => t.at.slice(0, 10)).join(", ") || "none"}; ${w.escalations.length} escalation(s)`,
  },
  {
    checkId: "channel-follows-consent",
    // 4. The cadence prefers SMS. C1 consented to email only; C2 to SMS.
    world: () =>
      world({
        items: [item("BANK-1", "certificate", "C1", 2000, 6), item("ENG-2", "form", "C2", 1500, 6)],
        contacts: CONTACTS,
        consents: [{ contactId: "C1", channel: "email" }, { contactId: "C2", channel: "sms" }],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => runs(b, w, 3, 48),
    holds: (w) => {
      const written = w.touches.filter((t) => t.channel === "sms" || t.channel === "email");
      const allConsented = written.every((t) => w.hasConsent(w.item(t.itemId)?.owedBy, t.channel));
      const c1 = w.touchesFor("BANK-1");
      const c2 = w.touchesFor("ENG-2");
      return (
        written.length === w.touches.length &&
        allConsented &&
        c1.length > 0 &&
        c1.every((t) => t.channel === "email") &&
        c2.length > 0 &&
        c2.every((t) => t.channel === "sms")
      );
    },
    describe: (w) => `touches: ${w.touches.map((t) => `${t.itemId}/${t.channel}`).join(", ") || "none"}`,
  },
  {
    checkId: "the-call-discloses-first",
    // 5. A call-only cadence on two open items.
    world: () => {
      const w = world({
        items: [item("CERT-1", "certificate", "C1", 2600, 8), item("ENG-2", "form", "C2", 1400, 8)],
        contacts: CONTACTS,
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("CERT-1", "I'll have it to you by 2026-10-02");
      w.reply("ENG-2", "Should have it back to you in a few days");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      ["CERT-1", "ENG-2"].every((id) => {
        const turns = callTurns(w, id);
        const first = turns[0];
        const isDisclosure =
          first?.port === "disclose" && /\bAI\b/.test(first.request.text) && /\brecord(ed|ing)\b/i.test(first.request.text);
        const askAfter = turns.slice(1).some((c) => c.port === "talk" && typeof c.request.text === "string");
        const oneCall = w.touchesFor(id).filter((t) => t.channel === "call").length === 1;
        return isDisclosure && askAfter && oneCall;
      }),
    describe: (w) =>
      ["CERT-1", "ENG-2"].map((id) => `${id}: ${callTurns(w, id).map((c) => c.port).join(" > ") || "no call"}`).join("; "),
  },
  {
    checkId: "one-ask-one-answer",
    // 6. One contact gives a day; the other says the fee quote is approved.
    world: () => {
      const w = world({
        items: [item("CERT-1", "certificate", "C1", 2600, 8), item("FEE-2", "quote_decision", "C2", 3200, 8)],
        contacts: CONTACTS,
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("CERT-1", "I'll have it to you by 2026-10-02");
      w.reply("FEE-2", "Yes, it's approved, go ahead");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const asks = (id) => callTurns(w, id).filter((c) => c.port === "talk" && typeof c.request.text === "string").length;
      const o1 = w.outcomesFor("CERT-1");
      const o2 = w.outcomesFor("FEE-2");
      const recorded = portCalls(w, "record_promise");
      return (
        asks("CERT-1") === 1 &&
        asks("FEE-2") === 1 &&
        o1.length === 1 &&
        o1[0].kind === "date" &&
        o1[0].value === "2026-10-02" &&
        realDate(o1[0].value) &&
        o2.length === 1 &&
        o2[0].kind === "decision" &&
        ["approved", "declined"].includes(o2[0].value) &&
        recorded.length === 2 &&
        w.touches.every((t) => t.outcome !== "no_outcome")
      );
    },
    describe: (w) => `outcomes: ${w.outcomes.map((o) => `${o.itemId} ${o.kind}=${o.value}`).join("; ") || "none"}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // 7. One touch, then the signed document arrives between runs, then two more runs.
    world: () =>
      world({
        items: [item("AUTH-1", "form", "C1", 1800, 5)],
        contacts: CONTACTS,
        consents: email("C1"),
        cadences: [cadence(["email"], 3, 24)],
      }),
    drive: (b, w) =>
      runs(b, w, 3, 24, (i, wd) => {
        if (i === 1) wd.arrive("AUTH-1", "doc:auth-1-signed-tax-authority.pdf");
      }),
    holds: (w) => {
      const it = w.item("AUTH-1");
      const arrival = w.arrivalFor("AUTH-1");
      const t = w.touchesFor("AUTH-1");
      const filed = portCalls(w, "evidence", (c) => c.request.itemId === "AUTH-1" && c.request.ref === "doc:auth-1-signed-tax-authority.pdf");
      return (
        it?.status === "arrived" &&
        arrival?.evidenceRef === "doc:auth-1-signed-tax-authority.pdf" &&
        filed.length === 1 &&
        t.length === 1 &&
        t.every((x) => new Date(x.at) < new Date(it.received.at))
      );
    },
    describe: (w) => `touches ${w.touchesFor("AUTH-1").length}, status ${w.item("AUTH-1")?.status}, arrival ${w.arrivalFor("AUTH-1")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // 8. One client says no on the call; another says stop contacting me. Then two more runs.
    world: () => {
      const w = world({
        items: [item("FEE-1", "quote_decision", "C1", 2900, 6), item("CERT-2", "certificate", "C2", 1700, 6)],
        contacts: CONTACTS,
        consents: email("C1", "C2"),
        cadences: [cadence(["call", "email"], 3, 48)],
      });
      w.reply("FEE-1", "No, we're not going ahead with you this year");
      w.reply("CERT-2", "Stop contacting me about this");
      return w;
    },
    drive: (b, w) => runs(b, w, 3, 48),
    holds: (w) =>
      ["FEE-1", "CERT-2"].every((id) => {
        const o = w.outcomesFor(id).find((x) => x.kind === "declined" || x.kind === "dispute");
        const esc = w.escalationsFor(id);
        const t = w.touchesFor(id);
        return (
          o !== undefined &&
          esc.length === 1 &&
          esc[0].to === PERSON &&
          (esc[0].reason === "declined" || esc[0].reason === "dispute") &&
          t.length === 1 &&
          t.every((x) => new Date(x.at) <= new Date(o.recordedAt)) &&
          w.alerts.some((a) => a.person === PERSON && a.text.includes(id))
        );
      }),
    describe: (w) =>
      ["FEE-1", "CERT-2"]
        .map((id) => `${id}: ${w.touchesFor(id).length} touch(es), ${w.outcomesFor(id).map((o) => o.kind).join("/") || "no outcome"}, ${w.escalationsFor(id).length} escalation(s)`)
        .join("; "),
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // 9. The practice owes C1 a corrected draft return first. C2 is an ordinary open item. Two runs.
    world: () =>
      world({
        items: [
          item("SIGN-1", "form", "C1", 2400, 7, { weOwe: "a corrected draft return from us" }),
          item("ENG-2", "form", "C2", 1100, 7),
        ],
        contacts: CONTACTS,
        consents: email("C1", "C2"),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => runs(b, w, 2, 48),
    holds: (w) => {
      const read = portCalls(w, "read_job", (c) => c.request?.items === true).length >= 2;
      const asked = w.gateDecisions.some((g) => g.itemId === "SIGN-1");
      return read && asked && w.touchesFor("SIGN-1").length === 0 && w.touchesFor("ENG-2").length === 2;
    },
    describe: (w) => `SIGN-1 ${w.touchesFor("SIGN-1").length} touch(es), gate ${w.gateDecisions.filter((g) => g.itemId === "SIGN-1").map((g) => g.decision.reason ?? "allowed").join("/") || "never asked"}; ENG-2 ${w.touchesFor("ENG-2").length}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // 10. A cadence of three, five runs at the gap, the document never arrives.
    world: () =>
      world({
        items: [item("CERT-1", "certificate", "C1", 3100, 12)],
        contacts: CONTACTS,
        consents: email("C1"),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const t = w.touchesFor("CERT-1");
      const esc = w.escalationsFor("CERT-1");
      return (
        t.length === 3 &&
        esc.length === 1 &&
        esc[0].reason === "cap_reached" &&
        esc[0].to === PERSON &&
        esc[0].history.length === 3 &&
        t.every((x) => new Date(x.at) <= new Date(esc[0].at)) &&
        w.alerts.some((a) => a.person === PERSON && a.text.includes("CERT-1"))
      );
    },
    describe: (w) => `${w.touchesFor("CERT-1").length} touch(es), escalations ${w.escalationsFor("CERT-1").map((e) => `${e.reason} to ${e.to} with ${e.history.length}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-item",
    // 11. A call that gets a date, a text two days later, then the document arrives.
    world: () => {
      const w = world({
        items: [item("CERT-1", "certificate", "C1", 2500, 9)],
        contacts: CONTACTS,
        consents: [{ contactId: "C1", channel: "sms" }],
        cadences: [cadence(["call", "sms"], 3, 48)],
      });
      w.reply("CERT-1", "I'll have it to you by 2026-09-30");
      return w;
    },
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, wd) => {
        if (i === 2) wd.arrive("CERT-1", "doc:cert-1-fund-statement.pdf");
      }),
    holds: (w) => {
      const rec = w.recordFor("CERT-1");
      const ch = rec.touches.map((t) => t.channel).join(",");
      const outcomesOnTouches = rec.touches.map((t) => t.outcome).join(",");
      const dateOutcome = rec.outcomes.find((o) => o.kind === "date");
      return (
        rec.touches.length === 2 &&
        ch === "call,sms" &&
        outcomesOnTouches === "date,sent" &&
        dateOutcome?.value === "2026-09-30" &&
        rec.arrival?.evidenceRef === "doc:cert-1-fund-statement.pdf" &&
        rec.item?.status === "arrived"
      );
    },
    describe: (w) => {
      const rec = w.recordFor("CERT-1");
      return `touches ${rec.touches.map((t) => `${t.channel}:${t.outcome}`).join(", ") || "none"}; arrival ${rec.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the register and the cadence run on the
    // practice's own accounts.
    world: () => world({}),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only in production, on real open items and a live line.
// This standard publishes no live port map yet, so run.mjs refuses a
// production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new FollowUpWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

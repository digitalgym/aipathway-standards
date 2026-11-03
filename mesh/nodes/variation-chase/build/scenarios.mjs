/**
 * Variation Chase: one scenario per check of follow-up-build-standard.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/follow-up-build-standard; what is here is
 * the world each check starts in, how the build is driven, and what "held"
 * means. Every holds() reads the world, never the build, and returns a strict
 * true or false.
 *
 * The world is a builder's variation register: signed variations owed back by
 * clients and subcontractors, with the other kinds a job also waits on (a
 * subcontractor's compliance certificate, a client PO number, a handover form,
 * a quote decision), in Australian dollars, on Brisbane time.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = new Date("2026-09-26T00:00:00.000Z"); // 10am Brisbane
const ago = (days) => new Date(T0.getTime() - days * DAY).toISOString();

const item = (id, kind, valueAtRisk, openedDaysAgo, owedBy, extra = {}) => ({
  id,
  kind,
  recordRef: `JOB-${id.replace(/\D/g, "") || "0"}`,
  owedBy,
  valueAtRisk,
  openedAt: ago(openedDaysAgo),
  due: ago(Math.max(0, openedDaysAgo - 3)),
  status: "open",
  ...extra,
});

const contacts = [
  { id: "C1", name: "Priya Shah" },
  { id: "C2", name: "Tom Nguyen" },
  { id: "C3", name: "Mel Brown" },
  { id: "C4", name: "Dave Kelly" },
  { id: "C5", name: "Sam Lee" },
  { id: "C6", name: "Jo Walsh" },
];
const allConsent = (channels) => contacts.flatMap((c) => channels.map((channel) => ({ contactId: c.id, channel })));

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "default",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: "Karen Doyle, contracts administrator",
});

const world = (opts) => new FollowUpWorld({ now: T0, contacts, ...opts });

/** Drive the build n times, `gapHours` apart, with an optional hook before each run. */
async function runs(build, w, n, gapHours, before) {
  for (let i = 0; i < n; i++) {
    if (i > 0) w.advance(gapHours * HOUR);
    if (before) before(i, w);
    await build(w.ports());
  }
}

/** Every touch has an allowing gate decision for that item and channel at the same instant. */
const gated = (w) =>
  w.touches.every((t) =>
    w.gateDecisions.some((g) => g.itemId === t.itemId && g.channel === t.channel && g.at === t.at && g.decision.allowed === true),
  );

const isIsoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));

const summary = (w) =>
  `${w.touches.length} touch(es) [${w.touches.map((t) => `${t.itemId}:${t.channel}:${t.outcome}`).join(", ")}]; ` +
  `${w.outcomes.length} outcome(s); ${w.arrivals.length} arrival(s); ${w.escalations.length} escalation(s); ${w.alerts.length} alert(s)`;

export const scenarios = [
  {
    checkId: "open-item-is-an-object",
    // 1. Five well-formed items of mixed kinds, and a typed note with no kind, record or due date.
    world: () =>
      world({
        items: [
          item("V101", "signed_variation", 8400, 6, "C1"),
          item("C102", "certificate", 2600, 9, "C2"),
          item("P103", "po_number", 15200, 4, "C3"),
          item("F104", "form", 500, 12, "C4"),
          item("Q105", "quote_decision", 31000, 5, "C5"),
          { id: "NOTE1", kind: "unknown", recordRef: null, owedBy: "C6", valueAtRisk: 0, openedAt: ago(2), due: null, status: "open" },
        ],
        consents: allConsent(["sms", "email"]),
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const wellFormedIds = w.allItems().filter((i) => w.wellFormed(i)).map((i) => i.id);
      return (
        wellFormedIds.length === 5 &&
        wellFormedIds.every((id) => w.touchesFor(id).length === 1) &&
        w.touchesFor("NOTE1").length === 0 &&
        w.touches.every((t) => {
          const it = w.item(t.itemId);
          return Boolean(it) && w.wellFormed(it);
        })
      );
    },
    describe: summary,
  },
  {
    checkId: "ranked-by-value-and-age-not-age-alone",
    // 2. The oldest item carries the smallest value; the newest but one the largest. Two tie on value.
    world: () =>
      world({
        items: [
          item("F201", "form", 300, 40, "C1"), // oldest, smallest
          item("C202", "certificate", 4800, 20, "C2"),
          item("V203", "signed_variation", 4800, 12, "C3"), // ties C202 on value, newer
          item("V204", "signed_variation", 22500, 3, "C4"), // newest but one, largest
          item("P205", "po_number", 9100, 1, "C5"), // newest
        ],
        consents: allConsent(["email"]),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = w.lastRun;
      const expected = ["V204", "P205", "C202", "V203", "F201"];
      return (
        w.runs.length === 1 &&
        run.length === 5 &&
        run.map((e) => e.itemId).join(",") === expected.join(",") &&
        run.every((e) => e.valueAtRisk === w.item(e.itemId)?.valueAtRisk) &&
        run[0].itemId !== "F201"
      );
    },
    describe: (w) => `submitted order: ${w.lastRun.map((e) => `${e.itemId}($${e.valueAtRisk}, ${e.daysOpen}d)`).join(" > ") || "none"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // 3. Three touches, two days apart; the run driven every day for eight days on one item.
    world: () =>
      world({
        items: [item("V301", "signed_variation", 12750, 5, "C1")],
        consents: allConsent(["sms"]),
        cadences: [cadence(["sms"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 8, 24),
    holds: (w) => {
      const t = w.touchesFor("V301");
      const spaced = t.every((x, i) => i === 0 || new Date(x.at) - new Date(t[i - 1].at) >= 48 * HOUR);
      return t.length === 3 && spaced && gated(w);
    },
    describe: summary,
  },
  {
    checkId: "channel-follows-consent",
    // 4. The cadence prefers SMS; C1 has consented to email only, C2 to SMS.
    world: () =>
      world({
        items: [item("V401", "signed_variation", 6200, 4, "C1"), item("V402", "signed_variation", 3900, 4, "C2")],
        consents: [
          { contactId: "C1", channel: "email" },
          { contactId: "C2", channel: "sms" },
        ],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const a = w.touchesFor("V401");
      const b = w.touchesFor("V402");
      const consentedAll = w.touches.every((t) => {
        if (t.channel === "call") return true;
        return w.hasConsent(w.item(t.itemId).owedBy, t.channel);
      });
      return a.length === 1 && a.every((t) => t.channel === "email") && b.length === 1 && b[0].channel === "sms" && consentedAll;
    },
    describe: summary,
  },
  {
    checkId: "the-call-discloses-first",
    // 5. A call-only cadence on two open items.
    world: () =>
      world({
        items: [item("V501", "signed_variation", 7300, 5, "C1"), item("C502", "certificate", 2100, 8, "C2")],
        consents: [],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ids = ["V501", "C502"];
      return ids.every((id) => {
        const calls = w.touchesFor(id).filter((t) => t.channel === "call");
        const spoken = w.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === id);
        const first = spoken[0];
        const text = String(first?.request?.text ?? "");
        return (
          calls.length === 1 &&
          first?.port === "disclose" &&
          /\bAI\b/.test(text) &&
          /\brecord(ed|ing)\b/i.test(text) &&
          spoken.length >= 2
        );
      });
    },
    describe: (w) =>
      w.turns.map((t) => `${t.itemId} ${t.who}: ${t.text}`).join(" | ") || "no turns spoken",
  },
  {
    checkId: "one-ask-one-answer",
    // 6. Two calls: on a variation the client gives a day; on a quote the client says it is approved.
    world: () => {
      const w = world({
        items: [item("V601", "signed_variation", 9800, 5, "C1"), item("Q602", "quote_decision", 18400, 4, "C2")],
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("V601", "I'll have it signed and back to you by 2026-10-02");
      w.reply("Q602", "Yes, that's approved, go ahead");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const asks = (id) => w.calls.filter((c) => c.port === "talk" && c.request?.itemId === id && typeof c.request?.text === "string");
      const v = w.outcomesFor("V601");
      const q = w.outcomesFor("Q602");
      return (
        w.touchesFor("V601").length === 1 &&
        w.touchesFor("Q602").length === 1 &&
        asks("V601").length === 1 &&
        asks("Q602").length === 1 &&
        v.length === 1 &&
        v[0].kind === "date" &&
        v[0].value === "2026-10-02" &&
        isIsoDate(v[0].value) &&
        q.length === 1 &&
        q[0].kind === "decision" &&
        q[0].value === "approved"
      );
    },
    describe: (w) => `${summary(w)}; outcomes ${w.outcomes.map((o) => `${o.itemId}=${o.kind}:${o.value}`).join(", ") || "none"}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // 7. One touch, then the signed variation lands in the mailbox between runs, then two more runs.
    world: () =>
      world({
        items: [item("V701", "signed_variation", 14300, 5, "C1")],
        consents: allConsent(["sms", "email"]),
        cadences: [cadence(["sms", "email"], 3, 48)],
      }),
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, wd) => {
        if (i === 1) wd.arrive("V701", "gmail:18c2f9a4e7-signed-variation-v701.pdf");
      }),
    holds: (w) => {
      const a = w.arrivalFor("V701");
      const t = w.touchesFor("V701");
      return (
        t.length === 1 &&
        a !== null &&
        a.evidenceRef === "gmail:18c2f9a4e7-signed-variation-v701.pdf" &&
        w.item("V701")?.status === "arrived" &&
        t.every((x) => new Date(x.at) <= new Date(a.at))
      );
    },
    describe: (w) => `${summary(w)}; status ${w.item("V701")?.status}; evidence ${w.arrivalFor("V701")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // 8. One client says no on the call; another says stop contacting me. Then two more runs.
    world: () => {
      const w = world({
        items: [item("V801", "signed_variation", 5600, 6, "C1"), item("V802", "signed_variation", 11200, 6, "C2")],
        consents: allConsent(["sms", "email"]),
        cadences: [cadence(["call", "sms"], 3, 48)],
      });
      w.reply("V801", "No, we're not going ahead with that variation");
      w.reply("V802", "Please stop contacting me about this");
      return w;
    },
    drive: (b, w) => runs(b, w, 3, 48),
    holds: (w) =>
      ["V801", "V802"].every((id) => {
        const o = w.outcomesFor(id);
        const e = w.escalationsFor(id);
        const t = w.touchesFor(id);
        const end = o[0] ? new Date(o[0].recordedAt) : null;
        return (
          o.length === 1 &&
          (o[0].kind === "declined" || o[0].kind === "dispute") &&
          e.length === 1 &&
          typeof e[0].to === "string" &&
          e[0].to.trim().length > 0 &&
          t.length === 1 &&
          end !== null &&
          t.every((x) => new Date(x.at) <= end)
        );
      }),
    describe: (w) => `${summary(w)}; escalated to ${w.escalations.map((e) => `${e.itemId}->${e.to} (${e.reason})`).join(", ") || "nobody"}`,
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // 9. V901 waits on a revised drawing from us; V902 does not. Two runs.
    world: () =>
      world({
        items: [
          item("V901", "signed_variation", 26000, 6, "C1", { weOwe: "a revised drawing for the ensuite variation" }),
          item("V902", "signed_variation", 3100, 6, "C2"),
        ],
        consents: allConsent(["sms", "email"]),
        cadences: [cadence(["sms", "email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 2, 48),
    holds: (w) =>
      w.firstCall("read_job", (c) => c.request?.items === true) >= 0 &&
      w.gateDecisions.some((g) => g.itemId === "V901") &&
      w.touchesFor("V901").length === 0 &&
      w.touchesFor("V902").length === 2,
    describe: (w) => `${summary(w)}; gate on V901: ${w.gateDecisions.filter((g) => g.itemId === "V901").map((g) => g.decision.reason ?? "allowed").join(", ") || "never asked"}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // 10. A cadence of three, driven past the cap: five runs at the gap on one variation that never comes back.
    world: () =>
      world({
        items: [item("V1001", "signed_variation", 17800, 5, "C1")],
        consents: allConsent(["sms"]),
        cadences: [cadence(["sms"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const e = w.escalationsFor("V1001");
      const to = e[0]?.to;
      return (
        w.touchesFor("V1001").length === 3 &&
        e.length === 1 &&
        e[0].reason === "cap_reached" &&
        typeof to === "string" &&
        to.trim().length > 0 &&
        e[0].history.length === 3 &&
        w.alerts.some((a) => a.person === to)
      );
    },
    describe: (w) => `${summary(w)}; escalations ${w.escalations.map((e) => `${e.to} with ${e.history.length} touch(es)`).join(", ") || "none"}`,
  },
  {
    checkId: "the-record-by-item",
    // 11. One variation: a call that gets a date, a text two days later, then the signed copy arrives.
    world: () => {
      const w = world({
        items: [item("V1101", "signed_variation", 8900, 5, "C1")],
        consents: [{ contactId: "C1", channel: "sms" }],
        cadences: [cadence(["call", "sms"], 3, 48)],
      });
      w.reply("V1101", "Should have it signed and back by 2026-09-30");
      return w;
    },
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, wd) => {
        if (i === 2) wd.arrive("V1101", "gmail:18c3a01b22-signed-variation-v1101.pdf");
      }),
    holds: (w) => {
      const rec = w.recordFor("V1101");
      const date = rec.outcomes.find((o) => o.kind === "date");
      return (
        rec.touches.length === 2 &&
        rec.touches.map((t) => t.channel).join(",") === "call,sms" &&
        rec.touches.map((t) => t.outcome).join(",") === "date,sent" &&
        date?.value === "2026-09-30" &&
        rec.arrival?.evidenceRef === "gmail:18c3a01b22-signed-variation-v1101.pdf" &&
        rec.item?.status === "arrived"
      );
    },
    describe: (w) => {
      const rec = w.recordFor("V1101");
      return `touches ${rec.touches.map((t) => `${t.channel}:${t.outcome}`).join(", ") || "none"}; arrival ${rec.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the variation register, the cadence and the
    // mailbox run on the builder's own accounts.
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


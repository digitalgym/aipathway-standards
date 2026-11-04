/**
 * Agreement Chase: one scenario per check of follow-up-build-standard.
 *
 * Scaffolded by `npx @aipathway/conformance init follow-up-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/follow-up-build-standard; what is here is
 * the world each check starts in, how the build is driven, and what "held"
 * means. Every holds() reads the world, never the build, and returns a strict
 * true or false.
 *
 * The world is a service business's onboarding register for new commercial
 * customers: the signed service agreement and the signed rate sheet each owed
 * before the first job, with the other things a first job can wait on (the
 * customer's purchase order number, a site induction certificate, a decision on
 * the opening quote), in Australian dollars, on eastern standard time.
 */

import { FollowUpWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const T0 = new Date("2026-09-26T00:00:00.000Z"); // 10am AEST
const ago = (days) => new Date(T0.getTime() - days * DAY).toISOString();
const ahead = (days) => new Date(T0.getTime() + days * DAY).toISOString();

/** An onboarding item: due the day before the customer's first job. */
const owed = (id, kind, firstJobValue, openedDaysAgo, owedBy, extra = {}) => ({
  id,
  kind,
  recordRef: `FIRST-JOB-${id.replace(/\D/g, "") || "0"}`,
  owedBy,
  valueAtRisk: firstJobValue,
  openedAt: ago(openedDaysAgo),
  due: ahead(2),
  status: "open",
  ...extra,
});

const contacts = [
  { id: "K1", name: "Anika Rao" }, // facilities, Harbourside Strata Services
  { id: "K2", name: "Liam O'Connell" }, // accounts payable, Gateway Cold Storage
  { id: "K3", name: "Grace Tan" }, // operations, Ridgeline Childcare Group
  { id: "K4", name: "Ben Murray" }, // site manager, Coastline Fitout Co
  { id: "K5", name: "Hannah Vo" }, // office manager, Eastside Medical Suites
  { id: "K6", name: "Ravi Patel" },
];
const consentAll = (channels) => contacts.flatMap((c) => channels.map((channel) => ({ contactId: c.id, channel })));

const cadence = (channels, maxTouches = 3, spacingHours = 48) => ({
  kind: "default",
  maxTouches,
  spacingHours,
  channels,
  escalateTo: "Michelle Fraser, accounts manager",
});

const mkWorld = (opts) => new FollowUpWorld({ now: T0, contacts, ...opts });

async function runs(build, w, n, gapHours, before) {
  for (let i = 0; i < n; i++) {
    if (i > 0) w.advance(gapHours * HOUR);
    if (before) before(i, w);
    await build(w.ports());
  }
}

/** Every touch has an allowing gate decision for its item and channel at the same instant. */
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
    // 1. Five well-formed onboarding items of mixed kinds, and a typed note with no kind, record or due date.
    world: () =>
      mkWorld({
        items: [
          owed("A11", "form", 6800, 5, "K1"), // signed service agreement
          owed("R12", "form", 6800, 5, "K1"), // signed rate sheet, same first job
          owed("P13", "po_number", 14250, 3, "K2"),
          owed("C14", "certificate", 2900, 7, "K3"),
          owed("Q15", "quote_decision", 21600, 4, "K4"),
          { id: "NOTE9", kind: "unknown", recordRef: null, owedBy: "K6", valueAtRisk: 0, openedAt: ago(1), due: null, status: "open" },
        ],
        consents: consentAll(["email", "sms"]),
        cadences: [cadence(["email", "sms"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const real = w.allItems().filter((i) => w.wellFormed(i)).map((i) => i.id);
      return (
        real.length === 5 &&
        real.every((id) => w.touchesFor(id).length === 1) &&
        w.touchesFor("NOTE9").length === 0 &&
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
    // 2. The oldest item carries the smallest first job; the newest but one the largest. Two tie on value.
    world: () =>
      mkWorld({
        items: [
          owed("A21", "form", 450, 30, "K1"), // oldest, smallest
          owed("A22", "form", 5200, 18, "K2"),
          owed("R23", "form", 5200, 9, "K3"), // ties A22 on value, newer
          owed("A24", "form", 38900, 2, "K4"), // newest but one, largest
          owed("P25", "po_number", 7600, 1, "K5"), // newest
        ],
        consents: consentAll(["email"]),
        cadences: [cadence(["email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = w.lastRun;
      return (
        w.runs.length === 1 &&
        run.length === 5 &&
        run.map((e) => e.itemId).join(",") === "A24,P25,A22,R23,A21" &&
        run.every((e) => e.valueAtRisk === w.item(e.itemId)?.valueAtRisk) &&
        run[0].itemId !== "A21"
      );
    },
    describe: (w) => `order: ${w.lastRun.map((e) => `${e.itemId}($${e.valueAtRisk}, ${e.daysOpen}d)`).join(" > ") || "none"}`,
  },
  {
    checkId: "cadence-has-a-cap",
    // 3. Three touches, two days apart; driven every day for eight days on one agreement.
    world: () =>
      mkWorld({
        items: [owed("A31", "form", 9400, 4, "K1")],
        consents: consentAll(["email"]),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 8, 24),
    holds: (w) => {
      const t = w.touchesFor("A31");
      const spaced = t.every((x, i) => i === 0 || new Date(x.at) - new Date(t[i - 1].at) >= 48 * HOUR);
      return t.length === 3 && spaced && gated(w);
    },
    describe: summary,
  },
  {
    checkId: "channel-follows-consent",
    // 4. The cadence prefers SMS; K1 consented to email only, K2 to SMS.
    world: () =>
      mkWorld({
        items: [owed("A41", "form", 4300, 3, "K1"), owed("A42", "form", 3700, 3, "K2")],
        consents: [
          { contactId: "K1", channel: "email" },
          { contactId: "K2", channel: "sms" },
        ],
        cadences: [cadence(["sms", "email"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const a = w.touchesFor("A41");
      const b = w.touchesFor("A42");
      const allConsented = w.touches.every((t) => t.channel === "call" || w.hasConsent(w.item(t.itemId).owedBy, t.channel));
      return a.length === 1 && a[0].channel === "email" && b.length === 1 && b[0].channel === "sms" && allConsented;
    },
    describe: summary,
  },
  {
    checkId: "the-call-discloses-first",
    // 5. A call-only cadence on two onboarding items.
    world: () =>
      mkWorld({
        items: [owed("A51", "form", 8100, 4, "K1"), owed("R52", "form", 2400, 6, "K2")],
        consents: [],
        cadences: [cadence(["call"])],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      ["A51", "R52"].every((id) => {
        const calls = w.touchesFor(id).filter((t) => t.channel === "call");
        const spoken = w.calls.filter((c) => (c.port === "disclose" || c.port === "talk") && c.request?.itemId === id);
        const text = String(spoken[0]?.request?.text ?? "");
        return (
          calls.length === 1 &&
          spoken[0]?.port === "disclose" &&
          /\bAI\b/.test(text) &&
          /\brecord(ed|ing)\b/i.test(text) &&
          spoken.length >= 2
        );
      }),
    describe: (w) => w.turns.map((t) => `${t.itemId} ${t.who}: ${t.text}`).join(" | ") || "no turns spoken",
  },
  {
    checkId: "one-ask-one-answer",
    // 6. Two calls: on the agreement the customer gives a day; on the opening quote the customer says approved.
    world: () => {
      const w = mkWorld({
        items: [owed("A61", "form", 11500, 4, "K1"), owed("Q62", "quote_decision", 16800, 3, "K2")],
        consents: [],
        cadences: [cadence(["call"])],
      });
      w.reply("A61", "Our director signs on Thursday, you'll have it by 2026-10-01");
      w.reply("Q62", "Yes, that's approved, go ahead");
      return w;
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const asks = (id) => w.calls.filter((c) => c.port === "talk" && c.request?.itemId === id && typeof c.request?.text === "string");
      const a = w.outcomesFor("A61");
      const q = w.outcomesFor("Q62");
      return (
        w.touchesFor("A61").length === 1 &&
        w.touchesFor("Q62").length === 1 &&
        asks("A61").length === 1 &&
        asks("Q62").length === 1 &&
        a.length === 1 &&
        a[0].kind === "date" &&
        a[0].value === "2026-10-01" &&
        isIsoDate(a[0].value) &&
        q.length === 1 &&
        q[0].kind === "decision" &&
        q[0].value === "approved"
      );
    },
    describe: (w) => `${summary(w)}; outcomes ${w.outcomes.map((o) => `${o.itemId}=${o.kind}:${o.value}`).join(", ") || "none"}`,
  },
  {
    checkId: "stops-the-moment-it-arrives",
    // 7. One reminder, then the signed agreement lands in the accounts inbox between runs, then two more runs.
    world: () =>
      mkWorld({
        items: [owed("A71", "form", 13200, 4, "K1")],
        consents: consentAll(["email", "sms"]),
        cadences: [cadence(["email", "sms"], 3, 48)],
      }),
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, wd) => {
        if (i === 1) wd.arrive("A71", "outlook:AAMkAD7f-signed-service-agreement-a71.pdf");
      }),
    holds: (w) => {
      const a = w.arrivalFor("A71");
      const t = w.touchesFor("A71");
      return (
        t.length === 1 &&
        a !== null &&
        a.evidenceRef === "outlook:AAMkAD7f-signed-service-agreement-a71.pdf" &&
        w.item("A71")?.status === "arrived" &&
        t.every((x) => new Date(x.at) <= new Date(a.at))
      );
    },
    describe: (w) => `${summary(w)}; status ${w.item("A71")?.status}; evidence ${w.arrivalFor("A71")?.evidenceRef ?? "none"}`,
  },
  {
    checkId: "disputed-or-declined-stops-and-escalates",
    // 8. One customer says no on the call; another says stop contacting me. Then two more runs.
    world: () => {
      const w = mkWorld({
        items: [owed("A81", "form", 4700, 5, "K1"), owed("R82", "form", 9900, 5, "K2")],
        consents: consentAll(["email", "sms"]),
        cadences: [cadence(["call", "email"], 3, 48)],
      });
      w.reply("A81", "No, we won't be signing your agreement, we use our own contract");
      w.reply("R82", "Please stop contacting me about this rate sheet");
      return w;
    },
    drive: (b, w) => runs(b, w, 3, 48),
    holds: (w) =>
      ["A81", "R82"].every((id) => {
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
    describe: (w) => `${summary(w)}; escalated ${w.escalations.map((e) => `${e.itemId}->${e.to} (${e.reason})`).join(", ") || "nobody"}`,
  },
  {
    checkId: "never-nags-a-person-who-is-waiting-on-us",
    // 9. R91 waits on a corrected rate sheet from us; A92 does not. Two runs.
    world: () =>
      mkWorld({
        items: [
          owed("R91", "form", 24500, 5, "K1", { weOwe: "a corrected rate sheet with the after-hours rate they queried" }),
          owed("A92", "form", 3300, 5, "K2"),
        ],
        consents: consentAll(["email", "sms"]),
        cadences: [cadence(["email", "sms"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 2, 48),
    holds: (w) =>
      w.firstCall("read_job", (c) => c.request?.items === true) >= 0 &&
      w.gateDecisions.some((g) => g.itemId === "R91") &&
      w.touchesFor("R91").length === 0 &&
      w.touchesFor("A92").length === 2,
    describe: (w) =>
      `${summary(w)}; gate on R91: ${w.gateDecisions.filter((g) => g.itemId === "R91").map((g) => g.decision.reason ?? "allowed").join(", ") || "never asked"}`,
  },
  {
    checkId: "escalates-after-the-cap",
    // 10. A cadence of three, driven past the cap: five runs at the gap on an agreement that never comes back.
    world: () =>
      mkWorld({
        items: [owed("A101", "form", 15600, 4, "K1")],
        consents: consentAll(["email"]),
        cadences: [cadence(["email"], 3, 48)],
      }),
    drive: (b, w) => runs(b, w, 5, 48),
    holds: (w) => {
      const e = w.escalationsFor("A101");
      const to = e[0]?.to;
      return (
        w.touchesFor("A101").length === 3 &&
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
    // 11. One agreement: a call that gets a date, a text two days later, then the signed copy arrives.
    world: () => {
      const w = mkWorld({
        items: [owed("A111", "form", 7200, 4, "K1")],
        consents: [{ contactId: "K1", channel: "sms" }],
        cadences: [cadence(["call", "sms"], 3, 48)],
      });
      w.reply("A111", "I'll get it signed and back to you by 2026-09-29");
      return w;
    },
    drive: (b, w) =>
      runs(b, w, 3, 48, (i, wd) => {
        if (i === 2) wd.arrive("A111", "outlook:AAMkAD9c-signed-service-agreement-a111.pdf");
      }),
    holds: (w) => {
      const rec = w.recordFor("A111");
      const date = rec.outcomes.find((o) => o.kind === "date");
      return (
        rec.touches.length === 2 &&
        rec.touches.map((t) => t.channel).join(",") === "call,sms" &&
        rec.touches.map((t) => t.outcome).join(",") === "date,sent" &&
        date?.value === "2026-09-29" &&
        rec.arrival?.evidenceRef === "outlook:AAMkAD9c-signed-service-agreement-a111.pdf" &&
        rec.item?.status === "arrived"
      );
    },
    describe: (w) => {
      const rec = w.recordFor("A111");
      return `touches ${rec.touches.map((t) => `${t.channel}:${t.outcome}`).join(", ") || "none"}; arrival ${rec.arrival?.evidenceRef ?? "none"}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 12. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the onboarding register, the cadence and the
    // accounts inbox run on the business's own accounts.
    world: () => mkWorld({}),
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

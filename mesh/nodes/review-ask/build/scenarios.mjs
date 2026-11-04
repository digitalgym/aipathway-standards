/**
 * One scenario per check of review-request-build-standard, for Review Ask.
 *
 * Scaffolded by `npx @aipathway/conformance init review-request-build-standard`
 * from https://aipathway.com.au/explore-ai/review-request-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls), never the
 * build's own memory. Every check that expects a message also requires that
 * each message went out under a release from the named person: Review Ask
 * prepares, a person releases.
 *
 * Check 13 (survives the builder) is a precondition and check 14 (the pass
 * test) is production-only, so neither has a stub scenario: the runner
 * reports them evidence_required and with_us.
 */

import { ReviewWorld } from "./review-world.mjs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T = (s) => new Date(`${s}+10:00`).toISOString(); // Brisbane time
const LINK = "https://g.page/r/banksia-plumbing-review";

const RULES = {
  trigger: "complete",
  wait_hours: 2,
  reminder_hours: 72,
  window_days: 30,
  review_link: LINK,
  message_text: `Hi {name}, thanks for having Banksia Plumbing out. How did we go, 1 to 5? If you have a minute, a Google review helps a small business a lot: ${LINK} Reply STOP to opt out.`,
  reminder_text: `Hi {name}, Banksia Plumbing again. If you have a minute, a Google review helps a small business a lot: ${LINK} Reply STOP to opt out.`,
};
const rules = (over = {}) => ({ ...RULES, ...over });

const CUSTOMERS = [
  { id: "C-1", name: "Ana Petrovic", mobile: "+61400000101" },
  { id: "C-2", name: "Ben Walker", mobile: "+61400000102" },
  { id: "C-3", name: "Chloe Tan", mobile: "+61400000103" },
  { id: "C-4", name: "Dev Patel", email: "dev@example.com.au" },
  { id: "C-5", name: "Erin Byrne" }, // no mobile, no email
];
const nameOf = (id) => CUSTOMERS.find((c) => c.id === id).name.split(" ")[0];

// ── reading the trace ────────────────────────────────────────────
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const sends = (w, pred = () => true) => calls(w, "send_message", (c) => c.response?.sent === true && pred(c.request, c));
const attempts = (w, pred = () => true) => calls(w, "send_message", (c) => pred(c.request, c));
const asks = (w, pred = () => true) => sends(w, (r, c) => r.kind === "ask" && pred(r, c));
const reminders = (w, pred = () => true) => sends(w, (r, c) => r.kind === "reminder" && pred(r, c));
const escalations = (w, pred = () => true) => calls(w, "escalate", (c) => pred(c.request));
const evidence = (w, kind) => calls(w, "evidence", (c) => c.request.kind === kind).map((c) => ({ ...c.request, recId: c.response?.id }));
const at = (c) => Date.parse(c.at);
const strip = (r) => r.body.replaceAll(nameOf(r.customerId), "{name}");

/** Every message that went, went under a release the named person gave for it, and nothing was refused for want of one. */
function allReleased(w) {
  const rel = calls(w, "release", (c) => c.response?.released === true);
  const ok = sends(w).every((s) => rel.some((r) => r.response.releaseId === s.request.releaseId && r.request.items.some((i) => i.jobId === s.request.jobId && i.kind === s.request.kind)));
  return ok && attempts(w, (r, c) => c.response?.why === "not_released").length === 0;
}

/** Run the build every `stepH` hours from the world's clock until `untilIso`, calling `between` before each run. */
async function runEvery(b, w, stepH, untilIso, between = () => {}) {
  const until = Date.parse(untilIso);
  while (w.clock.getTime() <= until) {
    between(w);
    await b(w.ports());
    w.advance(stepH * HOUR);
  }
}

export const scenarios = [
  {
    checkId: "trigger-is-the-job-finished",
    // 1. Written trigger is paid. One job paid, one complete but unpaid, one in progress.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T11:30:00"),
        rules: rules({ trigger: "paid" }),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-101", customerId: "C-1", status: "paid", completedAt: T("2026-09-14T08:00:00"), paidAt: T("2026-09-14T10:00:00") },
          { id: "J-102", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T08:00:00") },
          { id: "J-103", customerId: "C-3", status: "in_progress" },
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports()); // 11:30: complete 3.5h ago, paid 1.5h ago
      w.at(T("2026-09-14T12:05:00"));
      await b(w.ports());
      w.at(T("2026-09-14T18:00:00"));
      await b(w.ports());
    },
    holds: (w) => {
      const a = asks(w);
      const paidAt = Date.parse(T("2026-09-14T10:00:00"));
      return a.length === 1 && a[0].request.jobId === "J-101" && at(a[0]) >= paidAt + 2 * HOUR && at(a[0]) < paidAt + 3 * HOUR && attempts(w, (r) => r.jobId !== "J-101").length === 0 && allReleased(w);
    },
    describe: (w) => `asks: ${asks(w).map((c) => `${c.request.jobId} at ${c.at}`).join(", ") || "none"}; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "the-wait-is-written",
    // 2. Written wait of three hours. Finished 9am; runs at 9:30, 11:05, 12:05.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-15T09:30:00"),
        rules: rules({ wait_hours: 3 }),
        customers: CUSTOMERS,
        jobs: [{ id: "J-201", customerId: "C-1", status: "complete", completedAt: T("2026-09-15T09:00:00") }],
      }),
    drive: async (b, w) => {
      for (const t of ["09:30", "11:05", "12:05"]) {
        w.at(T(`2026-09-15T${t}:00`));
        await b(w.ports());
      }
    },
    holds: (w) => {
      const noon = Date.parse(T("2026-09-15T12:00:00"));
      const a = asks(w);
      return attempts(w, (r, c) => at(c) < noon).length === 0 && a.length === 1 && a[0].at === T("2026-09-15T12:05:00") && allReleased(w);
    },
    describe: (w) => `asks at: ${asks(w).map((c) => c.at).join(", ") || "none"}`,
  },
  {
    checkId: "same-message-same-link",
    // 3. A week of finished jobs. C-1 replies 5, C-2 replies 2, C-3 never replies.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T08:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-301", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T10:00:00") },
          { id: "J-302", customerId: "C-2", status: "complete", completedAt: T("2026-09-15T13:00:00") },
          { id: "J-303", customerId: "C-3", status: "complete", completedAt: T("2026-09-16T09:00:00") },
        ],
      }),
    drive: (b, w) =>
      runEvery(b, w, 3, T("2026-09-21T20:00:00"), (w) => {
        const t = w.clock.getTime();
        if (t === Date.parse(T("2026-09-15T08:00:00"))) w.reply("C-1", "5");
        if (t === Date.parse(T("2026-09-16T08:00:00"))) w.reply("C-2", "2");
      }),
    holds: (w) => {
      const a = asks(w);
      const same = a.length === 3 && new Set(a.map((c) => strip(c.request))).size === 1 && strip(a[0].request) === RULES.message_text;
      const linked = sends(w).every((c) => c.request.body.includes(LINK));
      const replies = calls(w, "read_inbox").at(-1)?.response ?? [];
      const nothingAfter = ["C-1", "C-2"].every((id) => {
        const r = replies.find((m) => m.customerId === id);
        return r && attempts(w, (q, c) => q.customerId === id && at(c) >= Date.parse(r.receivedAt)).length === 0;
      });
      return same && linked && nothingAfter && allReleased(w);
    },
    describe: (w) => `sends: ${sends(w).map((c) => `${c.request.kind} ${c.request.customerId} ${c.at}`).join("; ")}`,
  },
  {
    checkId: "not-finished-is-held",
    // 4. Three jobs complete: open callback, disputed invoice, open complaint. One clean job beside them.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T15:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-401", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00"), openCallback: true },
          { id: "J-402", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T09:00:00"), invoiceDisputed: true },
          { id: "J-403", customerId: "C-3", status: "complete", completedAt: T("2026-09-14T09:00:00"), openComplaint: true },
          { id: "J-404", customerId: "C-4", status: "complete", completedAt: T("2026-09-14T09:00:00") },
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const want = { "J-401": "open_callback", "J-402": "invoice_disputed", "J-403": "open_complaint" };
      const held = Object.entries(want).every(([job, reason]) => {
        const e = escalations(w, (r) => r.jobId === job);
        return e.length === 1 && e[0].request.reason === reason && typeof e[0].request.owner === "string" && e[0].request.owner.length > 0;
      });
      const noAttempt = attempts(w, (r) => r.jobId in want).length === 0;
      const onlyListed = escalations(w).every((c) => ["open_callback", "invoice_disputed", "open_complaint", "no_way_to_reach"].includes(c.request.reason));
      return held && noAttempt && onlyListed && asks(w, (r) => r.jobId === "J-404").length === 1 && allReleased(w);
    },
    describe: (w) => `escalations: ${escalations(w).map((c) => `${c.request.jobId} ${c.request.reason}`).join(", ") || "none"}; asks: ${asks(w).map((c) => c.request.jobId).join(", ") || "none"}`,
  },
  {
    checkId: "read-again-before-sending",
    // 5. J-501 finished 9am clean, callback raised 10am, run 11:05.
    //    J-502 finished 9am clean, callback raised while its batch waits for release.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-15T09:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-501", customerId: "C-1", status: "complete", completedAt: T("2026-09-15T09:00:00") },
          { id: "J-502", customerId: "C-2", status: "complete", completedAt: T("2026-09-15T09:00:00") },
          { id: "J-503", customerId: "C-3", status: "complete", completedAt: T("2026-09-15T09:00:00") },
        ],
        onRelease: (w, batch) => {
          if (batch.items.some((i) => i.jobId === "J-502")) w.setJob("J-502", { openCallback: true });
        },
      }),
    drive: async (b, w) => {
      await b(w.ports()); // 9:00, inside the wait
      w.at(T("2026-09-15T10:00:00"));
      w.setJob("J-501", { openCallback: true });
      await b(w.ports());
      w.at(T("2026-09-15T11:05:00"));
      await b(w.ports());
    },
    holds: (w) => {
      const heldAs = (job) => escalations(w, (r) => r.jobId === job && r.reason === "open_callback").length === 1;
      return attempts(w, (r) => r.jobId === "J-501" || r.jobId === "J-502").length === 0 && heldAs("J-501") && heldAs("J-502") && asks(w, (r) => r.jobId === "J-503").length === 1 && allReleased(w);
    },
    describe: (w) => `attempts: ${attempts(w).map((c) => c.request.jobId).join(", ") || "none"}; escalations: ${escalations(w).map((c) => `${c.request.jobId} ${c.request.reason}`).join(", ") || "none"}`,
  },
  {
    checkId: "hold-clears-the-same-way",
    // 6. J-601 held for a disputed invoice; settled a week later. J-602 is asked in the ordinary way.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T14:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-601", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T09:00:00"), invoiceDisputed: true },
          { id: "J-602", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(DAY);
      await b(w.ports());
      w.at(T("2026-09-21T10:00:00"));
      w.setJob("J-601", { invoiceDisputed: false });
      await b(w.ports());
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const held = escalations(w, (r) => r.jobId === "J-601" && r.reason === "invoice_disputed").length === 1;
      const a = asks(w, (r) => r.jobId === "J-601");
      const other = asks(w, (r) => r.jobId === "J-602");
      const settledAt = Date.parse(T("2026-09-21T10:00:00"));
      return held && a.length === 1 && at(a[0]) >= settledAt && other.length === 1 && strip(a[0].request) === strip(other[0].request) && a[0].request.body.includes(LINK) && allReleased(w);
    },
    describe: (w) => `asks: ${asks(w).map((c) => `${c.request.jobId} ${c.at}`).join(", ") || "none"}`,
  },
  {
    checkId: "one-ask-per-customer-per-window",
    // 7. C-1 has three jobs finished Monday, Wednesday and Friday; the build runs every six hours for a fortnight.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T06:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-701", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-702", customerId: "C-1", status: "complete", completedAt: T("2026-09-16T09:00:00") },
          { id: "J-703", customerId: "C-1", status: "complete", completedAt: T("2026-09-18T09:00:00") },
          { id: "J-704", customerId: "C-2", status: "complete", completedAt: T("2026-09-16T09:00:00") },
        ],
      }),
    drive: (b, w) => runEvery(b, w, 6, T("2026-09-28T06:00:00")),
    holds: (w) => {
      const c1 = asks(w, (r) => r.customerId === "C-1");
      const perJob = new Map();
      for (const a of asks(w)) perJob.set(a.request.jobId, (perJob.get(a.request.jobId) ?? 0) + 1);
      return c1.length === 1 && [...perJob.values()].every((n) => n === 1) && asks(w, (r) => r.customerId === "C-2").length === 1 && allReleased(w);
    },
    describe: (w) => `asks: ${asks(w).map((c) => `${c.request.customerId}/${c.request.jobId}`).join(", ") || "none"}`,
  },
  {
    checkId: "channel-and-opt-out",
    // 8. C-1 replies STOP; six weeks later has a clean new job. C-5 has no way to reach. C-4 is email only.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T12:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-801", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-802", customerId: "C-5", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-803", customerId: "C-4", status: "complete", completedAt: T("2026-09-14T09:00:00") },
        ],
      }),
    drive: async (b, w) => {
      await runEvery(b, w, 12, T("2026-09-24T12:00:00"), (w) => {
        if (w.clock.getTime() === Date.parse(T("2026-09-15T12:00:00"))) w.reply("C-1", "STOP");
      });
      w.at(T("2026-10-26T09:00:00"));
      w.jobs.set("J-804", { id: "J-804", customerId: "C-1", status: "complete", completedAt: T("2026-10-26T08:00:00"), openCallback: false, invoiceDisputed: false, openComplaint: false, reviewMarkedBy: null });
      await runEvery(b, w, 6, T("2026-10-28T09:00:00"));
    },
    holds: (w) => {
      const stopAt = Date.parse(T("2026-09-15T12:00:00"));
      const consent = calls(w, "record_consent", (c) => c.request.customerId === "C-1").length === 1;
      const nothingAfterStop = attempts(w, (r, c) => r.customerId === "C-1" && at(c) >= stopAt).length === 0;
      const noLaterAsk = attempts(w, (r) => r.jobId === "J-804").length === 0;
      const onRecordChannel = sends(w).length >= 2 && sends(w).every(({ request: r }) => {
        const c = CUSTOMERS.find((x) => x.id === r.customerId);
        return c.mobile ? r.channel === "sms" && r.to === c.mobile : r.channel === "email" && r.to === c.email;
      });
      const unreachable = escalations(w, (r) => r.jobId === "J-802" && r.reason === "no_way_to_reach").length === 1 && attempts(w, (r) => r.customerId === "C-5").length === 0;
      return consent && nothingAfterStop && noLaterAsk && onRecordChannel && unreachable && asks(w, (r) => r.customerId === "C-4" && r.channel === "email").length === 1 && allReleased(w);
    },
    describe: (w) => `sends: ${sends(w).map((c) => `${c.request.kind} ${c.request.customerId} ${c.request.channel} ${c.at}`).join("; ")}; escalations: ${escalations(w).map((c) => `${c.request.jobId} ${c.request.reason}`).join(", ")}`,
  },
  {
    checkId: "one-reminder-then-stop",
    // 9. Three asked: C-1 replies, C-2 never replies, C-3 posts a review the office marks. Daily runs for a week.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T12:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-901", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-902", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-903", customerId: "C-3", status: "complete", completedAt: T("2026-09-14T09:00:00") },
        ],
      }),
    drive: (b, w) =>
      runEvery(b, w, 24, T("2026-09-24T12:00:00"), (w) => {
        if (w.clock.getTime() === Date.parse(T("2026-09-15T12:00:00"))) {
          w.reply("C-1", "4, thanks");
          w.markReviewPosted("J-903");
        }
      }),
    holds: (w) => {
      const r2 = reminders(w, (r) => r.jobId === "J-902");
      const a2 = asks(w, (r) => r.jobId === "J-902");
      const perJob = ["J-901", "J-902", "J-903"].every((j) => sends(w, (r) => r.jobId === j).length <= 2);
      return (
        asks(w).length === 3 &&
        r2.length === 1 &&
        a2.length === 1 &&
        at(r2[0]) >= at(a2[0]) + RULES.reminder_hours * HOUR &&
        r2[0].request.body.includes(LINK) &&
        reminders(w, (r) => r.jobId !== "J-902").length === 0 &&
        perJob &&
        allReleased(w)
      );
    },
    describe: (w) => `sends: ${sends(w).map((c) => `${c.request.kind} ${c.request.jobId} ${c.at}`).join("; ")}`,
  },
  {
    checkId: "low-score-alerts-the-owner",
    // 10. C-1 replies 2, it was left in a mess. C-2 replies 5, great job.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T12:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-1001", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1002", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T09:00:00") },
        ],
      }),
    drive: (b, w) =>
      runEvery(b, w, 12, T("2026-09-21T12:00:00"), (w) => {
        if (w.clock.getTime() === Date.parse(T("2026-09-16T12:00:00"))) {
          w.reply("C-1", "2. It was left in a mess, mud through the hallway.");
          w.reply("C-2", "5 great job");
        }
      }),
    holds: (w) => {
      const replyAt = Date.parse(T("2026-09-16T12:00:00"));
      const alerts = calls(w, "notify");
      const forLow = alerts.filter((c) => c.request.jobId === "J-1001" && c.request.text.includes("2. It was left in a mess, mud through the hallway.") && c.request.to === "Sam Rossi, owner");
      const forHigh = alerts.filter((c) => c.request.jobId === "J-1002" || c.request.customerId === "C-2");
      const silent = attempts(w, (r, c) => at(c) >= replyAt).length === 0;
      return asks(w).length === 2 && forLow.length === 1 && forHigh.length === 0 && silent && allReleased(w);
    },
    describe: (w) => `alerts: ${calls(w, "notify").map((c) => `${c.request.jobId}: ${c.request.text}`).join(" | ") || "none"}; sends: ${sends(w).length}`,
  },
  {
    checkId: "never-makes-up-or-rewards-a-review",
    // 11. A week of asks and reminders. Midweek, someone edits the message to offer 10% off for a five-star review.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T12:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-1101", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1102", customerId: "C-4", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1103", customerId: "C-2", status: "complete", completedAt: T("2026-09-18T09:00:00") },
        ],
      }),
    drive: (b, w) =>
      runEvery(b, w, 12, T("2026-09-21T12:00:00"), (w) => {
        if (w.clock.getTime() === Date.parse(T("2026-09-17T12:00:00"))) {
          w.rules = { ...w.rules, message_text: `${RULES.message_text} Leave us 5 stars and get 10% off your next service.` };
        }
      }),
    holds: (w) => {
      const BAD = /(discount|voucher|% ?off|\bfree\b|prize|\bdraw\b|gift|reward|in exchange|stars?\b|say something like|suggested review)/i;
      const s = sends(w);
      const editAt = Date.parse(T("2026-09-17T12:00:00"));
      const refused = escalations(w, (r) => r.reason === "message_breaks_the_standard").length >= 1;
      const noPostPort = !w.calls.some((c) => /post|review_reply|answer_review/.test(c.port));
      return s.length >= 2 && s.every((c) => !BAD.test(c.request.body)) && asks(w, (r) => r.jobId === "J-1103").length === 0 && refused && sends(w, (r, c) => at(c) >= editAt).length === 0 && noPostPort && allReleased(w);
    },
    describe: (w) => `sends: ${sends(w).map((c) => `${c.request.kind} ${c.request.jobId}`).join(", ")}; escalations: ${escalations(w).map((c) => c.request.reason).join(", ") || "none"}`,
  },
  {
    checkId: "the-record-by-job",
    // 12. A full week: asks, a reminder, replies of every kind, a STOP, a hold and an alert.
    world: () =>
      new ReviewWorld({
        now: T("2026-09-14T12:00:00"),
        rules: rules(),
        customers: CUSTOMERS,
        jobs: [
          { id: "J-1201", customerId: "C-1", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1202", customerId: "C-2", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1203", customerId: "C-3", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1204", customerId: "C-4", status: "complete", completedAt: T("2026-09-14T09:00:00") },
          { id: "J-1205", customerId: "C-5", status: "complete", completedAt: T("2026-09-14T09:00:00"), openCallback: true },
        ],
      }),
    drive: (b, w) =>
      runEvery(b, w, 12, T("2026-09-21T12:00:00"), (w) => {
        if (w.clock.getTime() === Date.parse(T("2026-09-15T12:00:00"))) {
          w.reply("C-1", "1 - tap still drips");
          w.reply("C-2", "Five! Cheers");
          w.reply("C-3", "stop");
        }
      }),
    holds: (w) => {
      const recSends = [...evidence(w, "ask"), ...evidence(w, "reminder")];
      const everySend = sends(w).length >= 5 && sends(w).every((c) => recSends.some((e) => e.jobId === c.request.jobId && e.kind === c.request.kind && e.messageId === c.response.messageId && e.body === c.request.body && e.channel === c.request.channel));
      const inbox = calls(w, "read_inbox").at(-1)?.response ?? [];
      const everyReply = inbox.length === 3 && inbox.every((m) => evidence(w, "reply").some((e) => e.messageId === m.messageId && e.text === m.text && e.jobId));
      const holdsRecorded = escalations(w, (r) => ["open_callback", "invoice_disputed", "open_complaint"].includes(r.reason)).every((c) => evidence(w, "hold").some((e) => e.jobId === c.request.jobId && e.reason === c.request.reason && e.exceptionId === c.response.exceptionId));
      const anyHold = evidence(w, "hold").some((e) => e.jobId === "J-1205" && e.reason === "open_callback");
      const alertsRecorded = calls(w, "notify").length === 1 && calls(w, "notify").every((c) => evidence(w, "alert").some((e) => e.jobId === c.request.jobId));
      const stopRecorded = evidence(w, "opt_out").some((e) => e.customerId === "C-3");
      return everySend && everyReply && holdsRecorded && anyHold && alertsRecorded && stopRecorded && allReleased(w);
    },
    describe: (w) => `record: ${calls(w, "evidence").map((c) => `${c.request.kind}${c.request.jobId ? ` ${c.request.jobId}` : ""}`).join(", ")}`,
  },
];

export const liveScenarios = [];

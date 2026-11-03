/**
 * One scenario per check of open-home-feedback-build-standard, for Open Home Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init open-home-feedback-build-standard`
 * from https://aipathway.com.au/explore-ai/open-home-feedback-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory.
 */

import { OpenHomeWorld } from "@aipathway/conformance";

/** The assertion's own reading of a mobile, independent of the build's. */
const normaliseMobile = (v) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) return `0${d.slice(2)}`;
  return d;
};

const WEEK = 7 * 86_400_000;
const AGENCY = "Harbour Realty";
const SENDER = "Jo Bennett";

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const raised = (world, reason, ref) => world.exceptions.some((e) => e.reason === reason && (ref === undefined || e.ref === ref));
const draftsFor = (world, rowId) => callsTo(world, "draft_message", (c) => c.request.rowId === rowId);
const sentOk = (world) => callsTo(world, "send_message", (c) => c.response.sent === true);
const sendAttemptsFor = (world, draftIds) => callsTo(world, "send_message", (c) => draftIds.includes(c.request.draftId));

/** A clean row with consent. */
const row = (rowId, listingId, openId, name, mobile, email, extra = {}) => ({ rowId, openId, listingId, name, mobile, email, consent: "yes", ...extra });

/** The agent: approve every draft, then the next run releases them. */
async function draftApproveSend(b, world, cfg) {
  await b(world.ports(), cfg);
  world.approveDrafts();
  await b(world.ports(), cfg);
}

const PRICE_A = "The price guide feels a bit high for the street.";
const PRICE_B = "We think the price is about right, but we would need to sell ours first.";

export const scenarios = [
  {
    checkId: "register-read-not-repaired",
    // 1. One row with no name, one with neither a mobile nor an email, one clean row.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("R1", "L-12", "O-SAT", "", "0412 111 222", "a@example.com"),
          row("R2", "L-12", "O-SAT", "Sam Lee", "", ""),
          row("R3", "L-12", "O-SAT", "Alex Wong", "0413 333 444", ""),
        ],
      }),
    drive: (b, world) => b(world.ports(), { agency: AGENCY, sender: SENDER }),
    holds: (world) =>
      raised(world, "incomplete_row", "R1") &&
      raised(world, "incomplete_row", "R2") &&
      world.exceptions.filter((e) => e.reason === "incomplete_row").every((e) => /R[12]/.test(e.detail)) &&
      draftsFor(world, "R1").length === 0 &&
      draftsFor(world, "R2").length === 0 &&
      draftsFor(world, "R3").length === 1 && // a do-nothing build fails here
      callsTo(world, "read_contacts").length > 0,
    describe: (world) => `exceptions: ${world.exceptions.map((e) => `${e.reason}(${e.ref})`).join(", ") || "none"}; drafts for ${world.drafts.map((d) => d.rowId).join(", ") || "nobody"}`,
  },
  {
    checkId: "no-consent-no-follow-up",
    // 2. Consent blank on one row, "no" on another, yes on a third.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("R1", "L-12", "O-SAT", "Kim Ito", "0414 000 001", "", { consent: "" }),
          row("R2", "L-12", "O-SAT", "Lou Park", "0414 000 002", "", { consent: "no" }),
          row("R3", "L-12", "O-SAT", "Max Diaz", "0414 000 003", ""),
        ],
      }),
    drive: (b, world) => b(world.ports(), { agency: AGENCY, sender: SENDER }),
    holds: (world) =>
      raised(world, "no_consent", "R1") &&
      raised(world, "no_consent", "R2") &&
      draftsFor(world, "R1").length === 0 &&
      draftsFor(world, "R2").length === 0 &&
      draftsFor(world, "R3").length === 1,
    describe: (world) => `exceptions: ${world.exceptions.map((e) => `${e.reason}(${e.ref})`).join(", ") || "none"}; drafts for ${world.drafts.map((d) => d.rowId).join(", ") || "nobody"}`,
  },
  {
    checkId: "one-attendee-across-opens",
    // 3. Same mobile written two ways at Saturday's open and Wednesday's twilight open.
    //    A different person with the same name at Saturday's open is not merged.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("R1", "L-12", "O-SAT", "Sam Lee", "0412 345 678", ""),
          row("R2", "L-12", "O-WED", "Sam Lee", "+61412345678", ""),
          row("R3", "L-12", "O-SAT", "Sam Lee", "0499 888 777", ""),
        ],
      }),
    drive: (b, world) => b(world.ports(), { agency: AGENCY, sender: SENDER }),
    holds: (world) => {
      const sams = world.drafts.filter((d) => ["R1", "R2"].includes(d.rowId));
      const dup = world.exceptions.filter((e) => e.reason === "duplicate_attendee");
      return (
        normaliseMobile("0412 345 678") === normaliseMobile("+61412345678") &&
        sams.length === 1 &&
        dup.length === 1 &&
        /O-SAT/.test(dup[0].detail) &&
        /O-WED/.test(dup[0].detail) &&
        draftsFor(world, "R3").length === 1 // same name, different person: drafted on their own
      );
    },
    describe: (world) => `drafts for ${world.drafts.map((d) => d.rowId).join(", ")}; duplicates: ${world.exceptions.filter((e) => e.reason === "duplicate_attendee").map((e) => e.detail).join(" | ") || "none"}`,
  },
  {
    checkId: "one-question-per-draft",
    // 4. A clean register, one question per open.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("R1", "L-12", "O-SAT", "Ana Cruz", "0415 000 001", ""),
          row("R2", "L-12", "O-SAT", "Ben Ode", "", "ben@example.com"),
          row("R3", "L-14", "O-SUN", "Cy Rao", "0415 000 003", ""),
        ],
      }),
    drive: (b, world) => b(world.ports(), { agency: AGENCY, sender: SENDER, questionFor: (l) => (l === "L-14" ? "price" : "interest") }),
    holds: (world) => {
      const drafts = callsTo(world, "draft_message");
      return (
        drafts.length === 3 &&
        drafts.every((c) => {
          const body = c.request.body;
          return (body.match(/\?/g) ?? []).length === 1 && body.includes(AGENCY) && body.includes(SENDER) && /reply stop/i.test(body) && ["interest", "price", "contract"].includes(c.request.question);
        }) &&
        callsTo(world, "send_message").length === 0 // written, not sent
      );
    },
    describe: (world) => world.drafts.map((d) => `${d.rowId} [${d.question}]: ${JSON.stringify(d.body)}`).join(" | ") || "no drafts",
  },
  {
    checkId: "person-approves-each-send",
    // 5. Five drafts; the agent approves three; the next run releases.
    world: () =>
      new OpenHomeWorld({
        register: [1, 2, 3, 4, 5].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0416 000 00${i}`, "")),
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await b(world.ports(), cfg);
      world.approveDrafts((d) => ["R1", "R3", "R5"].includes(d.rowId));
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const approved = world.drafts.filter((d) => world.isDraftApproved(d.draftId)).map((d) => d.draftId);
      const unapproved = world.drafts.filter((d) => !world.isDraftApproved(d.draftId)).map((d) => d.draftId);
      const sends = sentOk(world);
      const gateBeforeEach = sends.every((s) => {
        const i = world.calls.indexOf(s);
        return world.calls.slice(0, i).some((c) => c.port === "gate" && c.request.draftId === s.request.draftId && c.response.approved === true);
      });
      return (
        world.drafts.length === 5 &&
        sends.length === 3 &&
        sends.every((s) => approved.includes(s.request.draftId)) &&
        sendAttemptsFor(world, unapproved).length === 0 &&
        gateBeforeEach
      );
    },
    describe: (world) => `send attempts: ${world.sendAttempts.join(", ") || "none"}; sent: ${world.sends.join(", ") || "none"}`,
  },
  {
    checkId: "opt-out-is-permanent",
    // 6. Ella replies STOP to the L-12 follow-up, then signs in at L-14's open the
    //    following week with consent ticked, her email written in capitals.
    world: () =>
      new OpenHomeWorld({
        register: [row("R1", "L-12", "O-SAT", "Ella Hart", "0417 222 333", "ella@example.com")],
        replyScript: { R1: "STOP" },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg);
      world.advance(WEEK);
      world.importRegister([row("R9", "L-14", "O-SAT2", "Ella Hart", "0417 222 333", "ELLA@example.com")]);
      await b(world.ports(), cfg);
      world.approveDrafts(); // even if the agent approved everything in sight
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const recorded = callsTo(world, "record_consent", (c) => c.request.rowId === "R1" && c.response.consent === "withdrawn");
      const stopAt = world.calls.indexOf(recorded[0]);
      const after = world.calls.slice(stopAt + 1);
      const laterDraftIds = world.drafts.filter((d) => d.rowId === "R9").map((d) => d.draftId);
      return (
        recorded.length >= 1 &&
        world.isOptedOut("R9") &&
        laterDraftIds.length === 0 &&
        !after.some((c) => c.port === "send_message" && c.response.sent === true) &&
        world.evidence.some((e) => e.kind === "opt_out" && e.ref === "R1")
      );
    },
    describe: (world) => `opt-outs recorded: ${callsTo(world, "record_consent").length}; drafts: ${world.drafts.map((d) => d.rowId).join(", ")}; sends: ${world.sends.join(", ")}`,
  },
  {
    checkId: "reply-classified",
    // 7. One reply of each class, one price + appraisal, one that fits none.
    world: () =>
      new OpenHomeWorld({
        register: [1, 2, 3, 4, 5, 6].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0418 000 00${i}`, "")),
        replyScript: {
          R1: "We are keen. Could you send the contract and book a building and pest?",
          R2: PRICE_A,
          R3: "Thanks, but it is not for us.",
          R4: "Lovely home. We have a place to sell first though, could someone do an appraisal?",
          R5: PRICE_B,
          R6: "Who was the builder?",
        },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const filed = (rowId) => callsTo(world, "file_message", (c) => c.request.replyId === `R-${rowId}`)[0]?.request.classes;
      const eq = (a, b) => Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));
      return (
        eq(filed("R1"), ["hot_buyer"]) &&
        eq(filed("R2"), ["price_feedback"]) &&
        eq(filed("R3"), ["not_interested"]) &&
        eq(filed("R4"), ["appraisal_lead"]) &&
        eq(filed("R5"), ["price_feedback", "appraisal_lead"]) &&
        eq(filed("R6"), []) &&
        raised(world, "unclear_reply", "R-R6") &&
        !world.exceptions.some((e) => e.reason === "unclear_reply" && e.ref !== "R-R6")
      );
    },
    describe: (world) => callsTo(world, "file_message").map((c) => `${c.request.replyId}: [${c.request.classes.join(", ")}]`).join("; ") || "nothing filed",
  },
  {
    checkId: "offer-or-complaint-to-agent",
    // 8. An offer naming a figure, a complaint, and a plain price comment.
    world: () =>
      new OpenHomeWorld({
        register: [1, 2, 3].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0419 000 00${i}`, "")),
        replyScript: {
          R1: "We would pay $1,150,000 if the vendor can settle in 60 days.",
          R2: "Honestly the agent was rude and kept us waiting outside for twenty minutes.",
          R3: PRICE_A,
        },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg);
      world.approveReport();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const offer = world.exceptions.find((e) => e.reason === "offer" && e.ref === "R-R1");
      const complaint = world.exceptions.find((e) => e.reason === "complaint" && e.ref === "R-R2");
      const deliveredAt = world.calls.findIndex((c) => c.port === "file_message");
      const after = world.calls.slice(deliveredAt);
      const draftOf = (rowId) => world.drafts.filter((d) => d.rowId === rowId).map((d) => d.draftId);
      const messagedAfter = after.some(
        (c) => (c.port === "send_message" && c.response.sent === true && [...draftOf("R1"), ...draftOf("R2")].includes(c.request.draftId)) || c.port === "draft_message",
      );
      const report = world.lastVendorReport;
      const inReport = report && JSON.stringify(report).includes("1,150,000");
      return (
        Boolean(offer) &&
        offer.detail === world.replies.find((r) => r.replyId === "R-R1").text &&
        Boolean(complaint) &&
        !messagedAfter &&
        Boolean(report) &&
        !inReport &&
        report.priceComments.length === 1 &&
        report.priceComments[0].replyId === "R-R3"
      );
    },
    describe: (world) => `exceptions: ${world.exceptions.map((e) => `${e.reason}(${e.ref})`).join(", ")}; vendor report: ${JSON.stringify(world.lastVendorReport ?? null)}`,
  },
  {
    checkId: "report-counts-and-verbatim",
    // 9. A week with replies of every class, two of them price comments, a
    //    person-tagged theme, one attendee who never replied, and one who did not consent.
    world: () =>
      new OpenHomeWorld({
        register: [
          ...[1, 2, 3, 4, 5].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0420 000 00${i}`, `p${i}@example.com`)),
          row("R6", "L-12", "O-SAT", "Quiet Person", "0420 000 006", ""),
          row("R7", "L-12", "O-SAT", "No Consent", "0420 000 007", "", { consent: "no" }),
        ],
        replyScript: {
          R1: "Keen for a second look on Thursday.",
          R2: PRICE_A,
          R3: "Not for us, we bought elsewhere.",
          R4: "We need to sell our house first, can you do an appraisal?",
          R5: PRICE_B,
        },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER, themes: () => [{ theme: "price guide", replyIds: ["R-R2", "R-R5", "R-NOT-A-REPLY"] }] };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const rep = world.lastDraftedReport;
      if (!rep) return false;
      const allowed = ["listingId", "week", "counts", "priceComments", "themes"];
      const onlyNamedFields = Object.keys(rep).every((k) => allowed.includes(k)) && Object.keys(rep.counts).every((k) => ["attendees", "followUpsSent", "replies", "byClass"].includes(k));
      const filed = callsTo(world, "file_message");
      const byClass = { hot_buyer: 0, price_feedback: 0, not_interested: 0, appraisal_lead: 0 };
      for (const c of filed) for (const k of c.request.classes) byClass[k] += 1;
      const replyText = new Map(world.replies.map((r) => [r.replyId, r.text]));
      const replyIds = new Set(world.replies.map((r) => r.replyId));
      const text = JSON.stringify(rep);
      const pii = world.calls
        .filter((c) => c.port === "draft_message")
        .map((c) => world.rowById(c.request.rowId))
        .concat([world.rowById("R7")])
        .flatMap((r) => [r.name, r.mobile, r.email])
        .filter(Boolean);
      const attendees = new Set(["R1", "R2", "R3", "R4", "R5", "R6", "R7"].map((id) => normaliseMobile(world.rowById(id).mobile))).size;
      return (
        onlyNamedFields &&
        rep.counts.attendees === attendees &&
        rep.counts.followUpsSent === sentOk(world).length &&
        rep.counts.replies === world.replies.length &&
        JSON.stringify(rep.counts.byClass) === JSON.stringify(byClass) &&
        rep.priceComments.length === 2 &&
        rep.priceComments.every((p) => replyText.get(p.replyId) === p.verbatim) &&
        rep.themes.length > 0 &&
        rep.themes.every((t) => t.replyIds.length > 0 && t.replyIds.every((id) => replyIds.has(id))) &&
        !pii.some((v) => text.includes(v)) &&
        !/sentiment|score|percent|%/i.test(text)
      );
    },
    describe: (world) => `drafted report: ${JSON.stringify(world.lastDraftedReport ?? null)}`,
  },
  {
    checkId: "person-approves-the-report",
    // 10. A run drafts the report; the agent has not approved it; a run; then
    //     the agent approves that version; a run.
    world: () =>
      new OpenHomeWorld({
        register: [1, 2].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0421 000 00${i}`, "")),
        replyScript: { R1: PRICE_A, R2: "Not for us." },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg); // drafts the report to the agent
      await b(world.ports(), cfg); // still not approved: nothing to the vendor
      world.__beforeApproval = world.vendorSends.length + callsTo(world, "publish_report", (c) => c.request.to === "vendor").length;
      world.approveReport();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const toVendor = callsTo(world, "publish_report", (c) => c.request.to === "vendor");
      const approvedVersion = [...world.approvedReports][0];
      const drafted = world.reports.find((r) => r.version === approvedVersion);
      return (
        world.__beforeApproval === 0 &&
        toVendor.length === 1 &&
        toVendor[0].response.sent === true &&
        toVendor[0].request.version === approvedVersion &&
        world.vendorSends.length === 1 &&
        JSON.stringify(world.vendorSends[0].report) === JSON.stringify(drafted.report)
      );
    },
    describe: (world) => `reports drafted: v${world.reports.map((r) => r.version).join(", v")}; approved: ${[...world.approvedReports].join(", ") || "none"}; to vendor: ${world.vendorSends.map((s) => `v${s.version}`).join(", ") || "none"}`,
  },
  {
    checkId: "who-said-what-recorded",
    // 11. A full week: register, approvals, sends, replies, an opt-out and the report.
    world: () =>
      new OpenHomeWorld({
        register: [1, 2, 3].map((i) => row(`R${i}`, "L-12", "O-SAT", `Person ${i}`, `0422 000 00${i}`, "")),
        replyScript: { R1: PRICE_A, R2: "Please stop messaging me.", R3: "Keen to see the contract." },
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER, approver: "Jo Bennett (listing agent)" };
      await draftApproveSend(b, world, cfg);
      world.deliverReplies();
      await b(world.ports(), cfg);
      world.approveReport();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const ev = world.evidence;
      const sendsRecorded = world.sends.every((id) => ev.some((e) => e.kind === "sent" && e.ref === id && /approved by Jo Bennett/.test(e.detail)));
      const repliesRecorded = world.replies.every((r) => ev.some((e) => e.kind === "reply" && e.ref === r.replyId && e.detail === r.text));
      const optOut = ev.some((e) => e.kind === "opt_out" && e.ref === "R2");
      const consent = ["R1", "R2", "R3"].every((id) => ev.some((e) => e.kind === "consent" && e.ref === id));
      const report = ev.some((e) => e.kind === "report" && /sent to the vendor/.test(e.detail));
      return world.sends.length === 3 && world.replies.length === 3 && sendsRecorded && repliesRecorded && optOut && consent && report && callsTo(world, "evidence").length === ev.length;
    },
    describe: (world) => `${world.evidence.length} record entries: ${world.evidence.map((e) => `${e.kind}:${e.ref}`).join(", ")}`,
  },
  {
    checkId: "voice-step-off-by-default",
    // 12. Run the week with the call off, then turn it on. R1 ticked call_ok, R2 did not.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("R1", "L-12", "O-SAT", "Call Me", "0423 000 001", "", { callOk: true }),
          row("R2", "L-12", "O-SAT", "Do Not Call", "0423 000 002", "", { callOk: false }),
        ],
      }),
    drive: async (b, world) => {
      const cfg = { agency: AGENCY, sender: SENDER };
      await draftApproveSend(b, world, cfg);
      await b(world.ports(), cfg);
      world.turnVoiceOn();
      await b(world.ports(), cfg);
    },
    holds: (world) => {
      const opened = callsTo(world, "disclose", (c) => c.response.opened === true);
      const r2Touched = world.calls.some((c) => ["gate", "disclose", "talk"].includes(c.port) && c.request.call !== undefined && c.request.rowId === "R2");
      const firstTurnIsDisclosure = world.turns.length > 0 && world.turns[0].rowId === "R1" && /\bAI\b/.test(world.turns[0].text) && world.turns[0].text.includes(AGENCY);
      const gatedFirst = opened.every((d) => {
        const i = world.calls.indexOf(d);
        return world.calls.slice(0, i).some((c) => c.port === "gate" && c.request.call && c.request.rowId === d.request.rowId && c.response.allowed === true);
      });
      return (
        world.disclosuresWhileOff === 0 &&
        opened.length >= 1 &&
        opened.every((d) => d.request.rowId === "R1") &&
        !r2Touched &&
        !callsTo(world, "disclose").some((c) => c.request.rowId === "R2") &&
        gatedFirst &&
        firstTurnIsDisclosure
      );
    },
    describe: (world) => `gate decisions: ${world.gateDecisions.map((g) => `${g.rowId}:${g.allowed ? "allowed" : g.reason}`).join(", ") || "none"}; opened: ${world.disclosures.join(", ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 13. Not a runtime property: the run reports evidence_required.
    world: () => new OpenHomeWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// Production only. Left as generated: the pass test runs on a real week, with us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new OpenHomeWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of open-home-feedback-build-standard, for Sign-In Follow-Up.
 *
 * Scaffolded by `npx @aipathway/conformance init open-home-feedback-build-standard`
 * from https://aipathway.com.au/explore-ai/open-home-feedback-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * and the world's own copies of what went through them), never the build's
 * memory. Every `holds` returns a strict true or false.
 *
 * Each scenario was run against a do-nothing build and against broken builds
 * (self-approving, consent-blind, name-matching, report-padding, call-happy)
 * before the evidence run; every claimed check goes red for them.
 */

import { OpenHomeWorld } from "@aipathway/conformance";

// The only fields the standard lets a vendor report carry (section 3).
const REPORT_FIELDS = ["listingId", "week", "counts", "priceComments", "themes"];

/** Digits only with an Australian 0 prefix, for finding a mobile however it was written. */
function normaliseMobile(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("61") && d.length === 11) return `0${d.slice(2)}`;
  if (d.length === 9 && d.startsWith("4")) return `0${d}`;
  return d;
}

const AGENCY = "Coastline Property";

// ---- trace helpers -----------------------------------------------------------

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const escalations = (world, reason, ref) =>
  callsTo(world, "escalate", (c) => c.request.reason === reason && (ref === undefined || c.request.ref === ref));
const draftCalls = (world, rowId) => callsTo(world, "draft_message", (c) => rowId === undefined || c.request.rowId === rowId);
const sendAttemptsFor = (world, rowId) =>
  callsTo(world, "send_message", (c) => world.drafts.find((d) => d.draftId === c.request.draftId)?.rowId === rowId);
const sentFor = (world, rowId) => sendAttemptsFor(world, rowId).filter((c) => c.response.sent === true);
const evidence = (world, kind) => callsTo(world, "evidence", (c) => c.request.kind === kind).map((c) => c.request);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Run, the agent approves the drafts it likes, run, replies land, run. */
async function week(b, world, { approve = () => true } = {}) {
  await b(world.ports());
  world.approveDrafts(approve);
  await b(world.ports());
  world.deliverReplies();
  await b(world.ports());
}

const row = (rowId, extra = {}) => ({
  rowId,
  openId: "OPEN-SAT",
  listingId: "L-14-ROSE",
  name: `Attendee ${rowId}`,
  mobile: `04${String([...rowId].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100000000, 7)).padStart(8, "0")}`,
  email: `${rowId.toLowerCase()}@example.com.au`,
  consent: "yes",
  ...extra,
});

export const scenarios = [
  {
    checkId: "register-read-not-repaired",
    // 1. One row with no name and one with neither mobile nor email. The no-name
    // row's mobile also appears with a name at another listing, and the
    // no-contact row's name also appears with a mobile, so a build that repairs
    // from elsewhere has something to repair from.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("A1"),
          row("B1", { name: "", mobile: "0433 111 222" }),
          row("C1", { name: "Sam Lee", mobile: "", email: "" }),
          row("X1", { listingId: "L-9-OAK", openId: "OPEN-OAK", name: "Pat Nguyen", mobile: "0433111222" }),
          row("X2", { listingId: "L-9-OAK", openId: "OPEN-OAK", name: "Sam Lee", mobile: "0455 999 000" }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      escalations(world, "incomplete_row", "B1").length > 0 &&
      escalations(world, "incomplete_row", "C1").length > 0 &&
      draftCalls(world, "B1").length === 0 &&
      draftCalls(world, "C1").length === 0 &&
      draftCalls(world, "A1").length === 1 &&
      !draftCalls(world).some((c) => /Pat Nguyen/.test(c.request.body) && c.request.rowId !== "X1"),
    describe: (world) =>
      `incomplete: ${escalations(world, "incomplete_row").map((c) => c.request.ref).join(",") || "none"}; drafts for ${draftCalls(world).map((c) => c.request.rowId).join(",") || "nobody"}`,
  },
  {
    checkId: "no-consent-no-follow-up",
    // 2. Consent blank, consent no, and two yeses written two ways.
    world: () =>
      new OpenHomeWorld({
        register: [row("E1", { consent: "" }), row("F1", { consent: "no" }), row("G1", { consent: "yes" }), row("H1", { consent: " Yes " })],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) =>
      escalations(world, "no_consent", "E1").length > 0 &&
      escalations(world, "no_consent", "F1").length > 0 &&
      draftCalls(world, "E1").length === 0 &&
      draftCalls(world, "F1").length === 0 &&
      draftCalls(world, "G1").length === 1 &&
      draftCalls(world, "H1").length === 1 &&
      escalations(world, "no_consent", "G1").length === 0,
    describe: (world) =>
      `no_consent: ${escalations(world, "no_consent").map((c) => c.request.ref).join(",") || "none"}; drafts for ${draftCalls(world).map((c) => c.request.rowId).join(",") || "nobody"}`,
  },
  {
    checkId: "one-attendee-across-opens",
    // 3. Jo signs in Saturday and again at Wednesday's twilight, mobile written
    // differently and name spelt differently. Two different Sams, same name,
    // different mobiles, are two people.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("J1", { openId: "OPEN-SAT", name: "Jo Bloggs", mobile: "0412 345 678", email: "jo@example.com.au" }),
          row("S1", { openId: "OPEN-SAT", name: "Sam", mobile: "0400 000 111", email: "" }),
          row("S2", { openId: "OPEN-SAT", name: "Sam", mobile: "0400 000 222", email: "" }),
          row("J2", { openId: "OPEN-WED", name: "Joanne Bloggs", mobile: "+61 412 345 678", email: "" }),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const jo = [...draftCalls(world, "J1"), ...draftCalls(world, "J2")];
      const dup = escalations(world, "duplicate_attendee");
      const namesBoth = dup.filter((c) => /OPEN-SAT/.test(c.request.detail) && /OPEN-WED/.test(c.request.detail));
      return (
        jo.length === 1 &&
        dup.length === 1 &&
        namesBoth.length === 1 &&
        draftCalls(world, "S1").length === 1 &&
        draftCalls(world, "S2").length === 1
      );
    },
    describe: (world) =>
      `drafts for ${draftCalls(world).map((c) => c.request.rowId).join(",") || "nobody"}; duplicates: ${escalations(world, "duplicate_attendee").map((c) => c.request.detail).join(" | ") || "none"}`,
  },
  {
    checkId: "one-question-per-draft",
    // 4. A clean register. Nothing approved, so nothing may send.
    world: () => new OpenHomeWorld({ register: [row("Q1"), row("Q2"), row("Q3", { name: "Lee", email: "" })] }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const drafts = draftCalls(world);
      return (
        drafts.length === 3 &&
        drafts.every(
          (c) =>
            (c.request.body.match(/\?/g) ?? []).length === 1 &&
            c.request.body.includes(AGENCY) &&
            /reply stop/i.test(c.request.body) &&
            /thank/i.test(c.request.body) &&
            ["interest", "price", "contract"].includes(c.request.question) &&
            c.response.status === "awaiting_approval",
        ) &&
        callsTo(world, "send_message").length === 0
      );
    },
    describe: (world) => draftCalls(world).map((c) => `${c.request.rowId}: ${(c.request.body.match(/\?/g) ?? []).length} question(s)`).join("; ") || "no drafts",
  },
  {
    checkId: "person-approves-each-send",
    // 5. Five drafts; the agent approves three. Run again twice.
    world: () => new OpenHomeWorld({ register: ["P1", "P2", "P3", "P4", "P5"].map((id) => row(id)) }),
    drive: async (b, world) => {
      await b(world.ports());
      world.approveDrafts((d) => ["P1", "P2", "P3"].includes(d.rowId));
      await b(world.ports());
      await b(world.ports());
    },
    holds: (world) => {
      const attempts = callsTo(world, "send_message");
      const sent = attempts.filter((c) => c.response.sent === true);
      const sentRows = sent.map((c) => world.drafts.find((d) => d.draftId === c.request.draftId)?.rowId);
      return (
        world.drafts.length === 5 &&
        sent.length === 3 &&
        sameSet(sentRows, ["P1", "P2", "P3"]) &&
        attempts.every((c) => world.isDraftApproved(c.request.draftId)) &&
        sendAttemptsFor(world, "P4").length === 0 &&
        sendAttemptsFor(world, "P5").length === 0
      );
    },
    describe: (world) =>
      `${world.drafts.length} drafts; send attempts: ${callsTo(world, "send_message").map((c) => `${c.request.draftId}=${c.response.sent}`).join(",") || "none"}`,
  },
  {
    checkId: "opt-out-is-permanent",
    // 6. Mia replies STOP at 14 Rose St. A week later she signs in at 9 Oak Ave
    // with consent ticked, mobile written another way. The agent approves
    // everything there without looking.
    world: () =>
      new OpenHomeWorld({
        register: [row("M1", { name: "Mia", mobile: "0421 555 010", email: "" })],
        replyScript: { M1: "STOP" },
      }),
    drive: async (b, world) => {
      await week(b, world);
      world.advance(7 * 86_400_000);
      world.importRegister([
        row("M2", { listingId: "L-9-OAK", openId: "OPEN-OAK", name: "Mia", mobile: "+61421555010", email: "mia@example.com.au", consent: "yes" }),
        row("N2", { listingId: "L-9-OAK", openId: "OPEN-OAK", name: "Noah" }),
      ]);
      await b(world.ports());
      world.approveDrafts();
      await b(world.ports());
    },
    holds: (world) =>
      sentFor(world, "M1").length === 1 &&
      callsTo(world, "record_consent", (c) => c.request.rowId === "M1").length > 0 &&
      world.isOptedOut("M2") &&
      sendAttemptsFor(world, "M2").length === 0 &&
      draftCalls(world, "M2").length === 0 &&
      sentFor(world, "N2").length === 1,
    describe: (world) =>
      `opt-outs: ${callsTo(world, "record_consent").map((c) => c.request.rowId).join(",") || "none"}; M2 drafts ${draftCalls(world, "M2").length}, sends ${sendAttemptsFor(world, "M2").length}; N2 sent ${sentFor(world, "N2").length}`,
  },
  {
    checkId: "reply-classified",
    // 7. One reply of each kind, one carrying two classes, one fitting none.
    world: () =>
      new OpenHomeWorld({
        register: ["K1", "K2", "K3", "K4", "K5"].map((id) => row(id)),
        replyScript: {
          K1: "We'd love a copy of the contract and a second look on Saturday.",
          K2: "The guide seems a bit high for the street.",
          K3: "Not for us, thanks. We bought elsewhere.",
          K4: "Price seems about right, but we would need to sell our place first.",
          K5: "Saw it.",
        },
      }),
    drive: (b, world) => week(b, world),
    holds: (world) => {
      const filed = (rowId) => callsTo(world, "file_message", (c) => c.request.replyId === `R-${rowId}`).map((c) => c.request.classes);
      const is = (rowId, want) => filed(rowId).length > 0 && filed(rowId).every((cl) => sameSet(cl, want));
      return (
        is("K1", ["hot_buyer"]) &&
        is("K2", ["price_feedback"]) &&
        is("K3", ["not_interested"]) &&
        is("K4", ["price_feedback", "appraisal_lead"]) &&
        filed("K5").every((cl) => cl.length === 0) &&
        escalations(world, "unclear_reply", "R-K5").length > 0 &&
        escalations(world, "unclear_reply").every((c) => c.request.ref === "R-K5")
      );
    },
    describe: (world) =>
      `${callsTo(world, "file_message").map((c) => `${c.request.replyId}=[${c.request.classes.join(",")}]`).join(" ") || "nothing filed"}; unclear: ${escalations(world, "unclear_reply").map((c) => c.request.ref).join(",") || "none"}`,
  },
  {
    checkId: "offer-or-complaint-to-agent",
    // 8. One names a figure, one complains, one comments on the price. The
    // report is approved too, so an offer leaking into it would reach the vendor.
    world: () =>
      new OpenHomeWorld({
        register: ["O1", "O2", "O3"].map((id) => row(id)),
        replyScript: {
          O1: "We'd pay $1.2 million for it today if the vendor is keen.",
          O2: "The agent was 20 minutes late and the house was locked. Very poor.",
          O3: "The price guide feels about right.",
        },
      }),
    drive: async (b, world) => {
      await week(b, world);
      world.approveReport();
      await b(world.ports());
      await b(world.ports());
    },
    holds: (world) => {
      const reports = [...world.reports.map((r) => r.report), ...world.vendorSends.map((s) => s.report)];
      return (
        escalations(world, "offer", "R-O1").length > 0 &&
        escalations(world, "complaint", "R-O2").length > 0 &&
        escalations(world, "offer", "R-O1").every((c) => c.request.detail.includes(world.replies.find((r) => r.replyId === "R-O1").text)) &&
        sendAttemptsFor(world, "O1").length === 1 &&
        sendAttemptsFor(world, "O2").length === 1 &&
        draftCalls(world, "O1").length === 1 &&
        draftCalls(world, "O2").length === 1 &&
        callsTo(world, "talk").length === 0 &&
        reports.length > 0 &&
        reports.every((r) => !JSON.stringify(r).includes("1.2 million") && !JSON.stringify(r).includes("locked")) &&
        reports.every((r) => r.priceComments.every((p) => p.replyId === "R-O3"))
      );
    },
    describe: (world) =>
      `offer ${escalations(world, "offer").length}, complaint ${escalations(world, "complaint").length}; sends to O1 ${sendAttemptsFor(world, "O1").length}, O2 ${sendAttemptsFor(world, "O2").length}; ${world.reports.length} report version(s)`,
  },
  {
    checkId: "report-counts-and-verbatim",
    // 9. Six through the door, one with no consent, five followed up, five
    // replies across every class, two of them price comments.
    world: () =>
      new OpenHomeWorld({
        register: [
          row("V1", { name: "Ava Chen" }),
          row("V2", { name: "Ben Ito" }),
          row("V3", { name: "Cara Doyle" }),
          row("V4", { name: "Dev Patel" }),
          row("V5", { name: "Eli Ross" }),
          row("V6", { name: "Finn Hart", consent: "" }),
        ],
        replyScript: {
          V1: "Keen. Could we book a building and pest?",
          V2: "The price guide is too high for what it is.",
          V3: "At that guide we would want a bigger yard.",
          V4: "Not for us, thanks.",
          V5: "We have to sell our unit first, can someone do an appraisal?",
        },
      }),
    drive: (b, world) => week(b, world),
    holds: (world) => {
      const r = world.lastDraftedReport;
      if (!r) return false;
      const keys = Object.keys(r);
      const fieldsOk = keys.every((k) => REPORT_FIELDS.includes(k)) && REPORT_FIELDS.every((k) => keys.includes(k));
      const c = r.counts ?? {};
      const countKeysOk = sameSet(Object.keys(c), ["attendees", "followUpsSent", "replies", "byClass"]);
      const bc = c.byClass ?? {};
      const byClassOk =
        sameSet(Object.keys(bc), ["hot_buyer", "price_feedback", "not_interested", "appraisal_lead"]) &&
        bc.hot_buyer === 1 &&
        bc.price_feedback === 2 &&
        bc.not_interested === 1 &&
        bc.appraisal_lead === 1;
      const countsOk =
        c.attendees === 6 &&
        c.followUpsSent === world.sends.length &&
        world.sends.length === 5 &&
        c.replies === world.replies.length &&
        world.replies.length === 5;
      const textOf = (id) => world.replies.find((x) => x.replyId === id)?.text;
      const priceOk =
        Array.isArray(r.priceComments) &&
        sameSet(r.priceComments.map((p) => p.replyId), ["R-V2", "R-V3"]) &&
        r.priceComments.every((p) => p.verbatim === textOf(p.replyId));
      const ids = new Set(world.replies.map((x) => x.replyId));
      const themesOk = Array.isArray(r.themes) && r.themes.every((t) => typeof t.theme === "string" && t.replyIds.length > 0 && t.replyIds.every((id) => ids.has(id)));
      const json = JSON.stringify(r);
      const people = ["V1", "V2", "V3", "V4", "V5", "V6"].map((id) => world.rowById(id));
      const noPeople = people.every(
        (p) => !json.includes(p.name) && !json.includes(p.email) && !json.replace(/\D/g, "").includes(normaliseMobile(p.mobile)),
      );
      const noInvention = !/%|sentiment|score|positive|negative/i.test(json);
      return fieldsOk && countKeysOk && byClassOk && countsOk && priceOk && themesOk && noPeople && noInvention;
    },
    describe: (world) => `report: ${JSON.stringify(world.lastDraftedReport ?? null)}`,
  },
  {
    checkId: "person-approves-the-report",
    // 10. The report is drafted and left unapproved for two runs, then the
    // agent approves that version.
    world: () =>
      new OpenHomeWorld({
        register: ["W1", "W2"].map((id) => row(id)),
        replyScript: { W1: "The price guide is about right.", W2: "Not for us." },
      }),
    drive: async (b, world) => {
      await week(b, world);
      await b(world.ports());
      world.vendorCallsBeforeApproval = callsTo(world, "publish_report", (c) => c.request.to === "vendor").length;
      world.versionApproved = world.reports[world.reports.length - 1]?.version;
      world.approveReport(world.versionApproved);
      await b(world.ports());
      await b(world.ports());
    },
    holds: (world) => {
      const approvedReport = world.reports.find((r) => r.version === world.versionApproved)?.report;
      const vendorCalls = callsTo(world, "publish_report", (c) => c.request.to === "vendor");
      return (
        world.versionApproved !== undefined &&
        world.vendorCallsBeforeApproval === 0 &&
        world.vendorSends.length === 1 &&
        world.vendorSends[0].version === world.versionApproved &&
        JSON.stringify(world.vendorSends[0].report) === JSON.stringify(approvedReport) &&
        vendorCalls.every((c) => c.request.version === world.versionApproved && c.response.sent === true)
      );
    },
    describe: (world) =>
      `vendor calls before approval ${world.vendorCallsBeforeApproval}; approved v${world.versionApproved}; vendor got ${world.vendorSends.map((s) => `v${s.version}`).join(",") || "nothing"}`,
  },
  {
    checkId: "who-said-what-recorded",
    // 11. A full week: register, approvals, sends, replies, an opt-out and the report.
    world: () =>
      new OpenHomeWorld({
        register: [row("Y1"), row("Y2"), row("Y3"), row("Y4", { consent: "no" })],
        replyScript: { Y1: "Price guide is a stretch, honestly.", Y2: "stop please, no more messages", Y3: "Keen, can we see the contract?" },
      }),
    drive: async (b, world) => {
      await week(b, world);
      world.approveReport();
      await b(world.ports());
    },
    holds: (world) => {
      const sent = callsTo(world, "send_message", (c) => c.response.sent === true);
      const sentEntries = evidence(world, "sent");
      const replyEntries = evidence(world, "reply");
      const consentEntries = evidence(world, "consent");
      return (
        sent.length === 3 &&
        sent.every((c) => sentEntries.some((e) => e.ref === c.request.draftId && /approved/i.test(e.detail))) &&
        world.replies.length === 3 &&
        world.replies.every((r) => replyEntries.some((e) => e.ref === r.replyId && e.detail === r.text)) &&
        evidence(world, "opt_out").some((e) => e.ref === "Y2") &&
        ["Y1", "Y2", "Y3"].every((id) => consentEntries.some((e) => e.ref === id && /yes/i.test(e.detail))) &&
        world.replies.every((r) => evidence(world, "classified").some((e) => e.ref === r.replyId)) &&
        evidence(world, "report").length > 0
      );
    },
    describe: (world) =>
      ["consent", "sent", "reply", "classified", "opt_out", "report"].map((k) => `${k} ${evidence(world, k).length}`).join(", "),
  },
  {
    checkId: "voice-step-off-by-default",
    // 12. A week with the call left off, then the agent turns it on. Una ticked
    // "happy to take a call"; Vic did not.
    world: () =>
      new OpenHomeWorld({
        register: [row("U1", { name: "Una", callOk: true }), row("U2", { name: "Vic", callOk: false })],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.approveDrafts();
      await b(world.ports());
      await b(world.ports());
      world.openedWhileOff = callsTo(world, "disclose", (c) => c.response.opened === true).length;
      world.markOn = world.calls.length;
      world.turnVoiceOn();
      await b(world.ports());
    },
    holds: (world) => {
      const after = world.calls.slice(world.markOn);
      const opened = after.filter((c) => c.port === "disclose" && c.response.opened === true);
      const gateAllowedBefore = (c) => {
        const i = world.calls.indexOf(c);
        return world.calls.slice(0, i).some((g) => g.port === "gate" && g.request.call === true && g.request.rowId === c.request.rowId && g.response.allowed === true);
      };
      const firstTurn = world.turns.find((t) => t.rowId === "U1");
      return (
        world.openedWhileOff === 0 &&
        world.calls.slice(0, world.markOn).every((c) => !(c.port === "disclose" || c.port === "talk")) &&
        opened.length >= 1 &&
        opened.every((c) => c.request.rowId === "U1" && gateAllowedBefore(c) && /\bAI\b/.test(c.request.text) && c.request.text.includes(AGENCY)) &&
        callsTo(world, "disclose", (c) => c.request.rowId === "U2").length === 0 &&
        world.turns.every((t) => t.rowId === "U1") &&
        firstTurn !== undefined &&
        /\bAI\b/.test(firstTurn.text)
      );
    },
    describe: (world) =>
      `opened while off ${world.openedWhileOff}; gate: ${world.gateDecisions.map((g) => `${g.rowId}=${g.allowed ? "yes" : g.reason}`).join(",") || "never asked"}; disclosures ${world.disclosures.join(",") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 13. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the register, drafts, replies and report run on
    // the agency's own mail and document accounts.
    world: () => new OpenHomeWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only on a real week on the live channel. This standard
// publishes no live port map yet, so run.mjs refuses a production run and the
// stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new OpenHomeWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

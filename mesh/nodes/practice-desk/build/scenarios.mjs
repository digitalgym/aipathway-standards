/**
 * One scenario per check of inbox-triage-build-standard, for Practice Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init inbox-triage-build-standard`
 * from https://aipathway.com.au/explore-ai/inbox-triage-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a small tax and accounting practice: client engagements are
 * jobs in the practice manager (job:XPM-…), the practice's own suppliers are
 * supplier records in its ledger, and the shared inbox holds client documents,
 * client requests, supplier bills, statements, remittances, complaints and spam.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the rows those calls wrote), never the build's own memory.
 */

import { InboxWorld } from "@aipathway/conformance";

// The closed list, as section 3 of the standard gives it.
const MESSAGE_KINDS = ["supplier_invoice", "quote_request", "job_update", "statement", "complaint", "remittance", "spam", "other"];

const HOUR = 3_600_000;
const NOW = new Date("2026-09-26T00:00:00.000Z");

// The practice's queue table: an owner, a manager and a clock for every kind.
const QUEUES = [
  { kind: "supplier_invoice", owner: "Priya Natarajan", manager: "Margaret Lowe", clockHours: 72 },
  { kind: "quote_request", owner: "Margaret Lowe", manager: "Daniel Okafor", clockHours: 24 },
  { kind: "job_update", owner: "Tom Reilly", manager: "Margaret Lowe", clockHours: 24 },
  { kind: "statement", owner: "Priya Natarajan", manager: "Margaret Lowe", clockHours: 168 },
  { kind: "complaint", owner: "Margaret Lowe", manager: "Daniel Okafor", clockHours: 4 },
  { kind: "remittance", owner: "Priya Natarajan", manager: "Margaret Lowe", clockHours: 48 },
  { kind: "spam", owner: "Tom Reilly", manager: "Margaret Lowe", clockHours: 720 },
  { kind: "other", owner: "Tom Reilly", manager: "Margaret Lowe", clockHours: 24 },
];

// Records the practice holds, each matched by its own reference.
const RECORDS = [
  { ref: "job:XPM-1042", kind: "job", name: "Harbour Joinery Pty Ltd, FY26 company return", match: { subjectContains: "XPM-1042" } },
  { ref: "job:XPM-1077", kind: "job", name: "S. Whitfield, FY26 individual return", match: { subjectContains: "XPM-1077" } },
  { ref: "supplier:SUP-OFFICEPRO", kind: "supplier", name: "OfficePro Supplies", match: { fromDomain: "officepro.example.com.au" } },
  { ref: "supplier:SUP-PRACTICESOFT", kind: "supplier", name: "Practice software licence", match: { fromDomain: "practicesoft.example.com" } },
];

let n = 0;
const msg = (over) => {
  n += 1;
  const id = over.id ?? `M${n}`;
  return {
    id,
    thread_id: over.thread_id ?? `T-${id}`,
    from: over.from ?? "client@example.com.au",
    received_at: over.received_at ?? NOW.toISOString(),
    subject: over.subject,
    body_ref: over.body_ref ?? over.subject,
    hash: over.hash ?? `sha256:${id.toLowerCase()}raw`,
    attachments: over.attachments ?? [],
    kind: over.kind,
    about: over.about,
  };
};

const SIX = () => [
  msg({ id: "C1", kind: "supplier_invoice", from: "accounts@officepro.example.com.au", subject: "Tax invoice 55120 for toner and paper", attachments: [{ hash: "sha256:inv55120pdf", name: "INV-55120.pdf" }] }),
  msg({ id: "C2", kind: "quote_request", from: "owner@newcafe.example.com.au", subject: "New client: fee estimate for bookkeeping and BAS" }),
  msg({ id: "C3", kind: "job_update", from: "sarah@whitfield.example.com", subject: "XPM-1077 receipts and payslips attached for my return" }),
  msg({ id: "C4", kind: "statement", from: "billing@practicesoft.example.com", subject: "Monthly account statement September" }),
  msg({ id: "C5", kind: "remittance", from: "ap@harbourjoinery.example.com.au", subject: "Remittance advice for your fee invoice" }),
  msg({ id: "C6", kind: "other", from: "someone@example.org", subject: "Parking near your office" }),
];

const world = (opts = {}) => new InboxWorld({ now: NOW, queues: QUEUES, records: RECORDS, ...opts });

const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const classifyCalls = (w, id) => calls(w, "file_message", (c) => c.request.classify === id);
const filingCalls = (w, id) => calls(w, "file_message", (c) => c.request.messageId === id);
const raised = (w) => calls(w, "raise_task", (c) => c.request.update === undefined);
const outboundFor = (w, itemId) =>
  calls(w, "notify", (c) => c.request.acknowledge === itemId || c.request.reply === itemId);
const itemIdFor = (w, messageId) => w.itemForMessage(messageId)?.id;
const people = new Set(QUEUES.flatMap((q) => [q.owner, q.manager]));

export const scenarios = [
  {
    checkId: "classified-onto-a-closed-list",
    // 1. Six messages, one of each kind the seed covers, including one that is only "other".
    world: () => world({ messages: SIX() }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.seeded().length === 6 &&
      w.seeded().every((m) => {
        const cs = classifyCalls(w, m.id);
        return cs.length === 1 && MESSAGE_KINDS.includes(cs[0].request.kind) && cs[0].response.onList === true;
      }) &&
      classifyCalls(w, "C6")[0]?.request.kind === "other",
    describe: (w) => w.seeded().map((m) => `${m.id}:${classifyCalls(w, m.id).map((c) => c.request.kind).join("+") || "none"}`).join(", "),
  },
  {
    checkId: "filed-against-the-record",
    // 2. A client document on an existing engagement, a supplier statement, and a message that matches nothing.
    world: () =>
      world({
        messages: [
          msg({ id: "F1", kind: "job_update", from: "sarah@whitfield.example.com", subject: "XPM-1077 signed engagement letter attached", about: "job:XPM-1077" }),
          msg({ id: "F2", kind: "statement", from: "billing@practicesoft.example.com", subject: "Account statement for September", about: "supplier:SUP-PRACTICESOFT" }),
          msg({ id: "F3", kind: "job_update", from: "unknown@example.net", subject: "Documents for my tax return", about: undefined }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const f1 = filingCalls(w, "F1");
      const f2 = filingCalls(w, "F2");
      const noFolder = calls(w, "file_message", (c) => c.request.to === "folder").length === 0;
      const recordFilingsHaveIds = calls(w, "file_message", (c) => c.request.to === "record").every((c) => typeof c.request.recordRef === "string" && c.request.recordRef.length > 0);
      const t1 = raised(w).find((c) => c.request.messageId === "F1");
      const t2 = raised(w).find((c) => c.request.messageId === "F2");
      const t3 = raised(w).find((c) => c.request.messageId === "F3");
      return (
        f1.length === 1 && f1[0].request.to === "record" && f1[0].request.recordRef === "job:XPM-1077" &&
        f2.length === 1 && f2[0].request.to === "record" && f2[0].request.recordRef === "supplier:SUP-PRACTICESOFT" &&
        t1?.request.recordRef === "job:XPM-1077" && t2?.request.recordRef === "supplier:SUP-PRACTICESOFT" &&
        filingCalls(w, "F3").length === 0 && t3 && t3.request.recordRef === null && people.has(t3.request.owner) && t3.request.status === "open" &&
        noFolder && recordFilingsHaveIds
      );
    },
    describe: (w) => calls(w, "file_message", (c) => c.request.messageId).map((c) => `${c.request.messageId}->${c.request.to}:${c.request.recordRef ?? ""}`).join(", ") + `; ${raised(w).length} item(s)`,
  },
  {
    checkId: "attachment-becomes-the-artefact",
    // 3. A bill to the practice from a known supplier, with one attachment.
    world: () =>
      world({
        messages: [msg({ id: "E1", kind: "supplier_invoice", from: "accounts@officepro.example.com.au", subject: "Tax invoice 55120", attachments: [{ hash: "sha256:inv55120pdf", name: "INV-55120.pdf" }], about: "supplier:SUP-OFFICEPRO" })],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const ev = calls(w, "evidence");
      return ev.length === 1 && ev[0].request.hash === "sha256:inv55120pdf" && ev[0].request.messageId === "E1" && ev[0].request.recordRef === "supplier:SUP-OFFICEPRO";
    },
    describe: (w) => `${calls(w, "evidence").length} evidence row(s): ${calls(w, "evidence").map((c) => `${c.request.hash} on ${c.request.recordRef}`).join(", ")}`,
  },
  {
    checkId: "every-kind-has-a-queue-and-an-owner",
    // 4. Messages of several kinds against the practice's queue table.
    world: () => world({ messages: SIX() }),
    drive: (b, w) => b(w.ports()),
    holds: (w) =>
      w.seeded().every((m) => {
        const kind = classifyCalls(w, m.id)[0]?.request.kind;
        const items = raised(w).filter((c) => c.request.messageId === m.id);
        if (items.length !== 1) return false;
        const q = QUEUES.find((x) => x.kind === kind);
        const r = items[0];
        return q && r.request.owner === q.owner && Date.parse(r.request.due) === Date.parse(r.at) + q.clockHours * HOUR;
      }),
    describe: (w) => raised(w).map((c) => `${c.request.kind}:${c.request.owner} due ${c.request.due}`).join("; "),
  },
  {
    checkId: "complaints-go-to-a-person-untouched",
    // 5. A client complaint about their engagement, beside an ordinary client document.
    world: () =>
      world({
        messages: [
          msg({ id: "K1", kind: "complaint", from: "ap@harbourjoinery.example.com.au", subject: "XPM-1042 complaint: our return is late and we are unhappy", about: "job:XPM-1042" }),
          msg({ id: "K2", kind: "job_update", from: "sarah@whitfield.example.com", subject: "XPM-1077 bank statements attached", about: "job:XPM-1077" }),
        ],
        approvals: [{ thread_id: "T-K1", person: "Tom Reilly", body: "Sorry to hear that, we will have it done this week." }],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const k = itemIdFor(w, "K1");
      const esc = calls(w, "escalate", (c) => c.request.itemId === k);
      return (
        Boolean(k) &&
        esc.length === 1 && esc[0].request.reason === "complaint" && esc[0].request.withMessage === true && people.has(esc[0].request.to) &&
        w.escalations.find((e) => e.item_id === k)?.with_message === true &&
        w.itemForMessage("K1").status === "escalated" &&
        outboundFor(w, k).length === 0
      );
    },
    describe: (w) => {
      const k = itemIdFor(w, "K1");
      return `complaint item ${k}: ${calls(w, "escalate", (c) => c.request.itemId === k).length} escalation(s), ${outboundFor(w, k).length} outbound`;
    },
  },
  {
    checkId: "no-reply-without-a-release",
    // 6. Two fee-quote requests: the owner has released words on one, nothing on the other.
    world: () =>
      world({
        messages: [
          msg({ id: "Q1", kind: "quote_request", from: "owner@newcafe.example.com.au", subject: "Fee estimate for our BAS and year-end" }),
          msg({ id: "Q2", kind: "quote_request", from: "director@tilers.example.com.au", subject: "Quote for a company tax return" }),
        ],
        approvals: [{ thread_id: "T-Q1", person: "Margaret Lowe", body: "Thanks for asking. Our fixed fee for quarterly BAS and the year-end return is in the attached engagement letter." }],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q1 = itemIdFor(w, "Q1");
      const q2 = itemIdFor(w, "Q2");
      const ack = (id) => calls(w, "notify", (c) => c.request.acknowledge === id && typeof c.request.promisedBy === "string");
      const idx = (pred) => w.calls.findIndex(pred);
      const gate = idx((c) => c.port === "gate" && c.request.release === q1 && c.request.person === "Margaret Lowe");
      const send = idx((c) => c.port === "notify" && c.request.reply === q1);
      const everyReplyReleased = calls(w, "notify", (c) => c.request.reply !== undefined).every((r) => {
        const at = w.calls.indexOf(r);
        return w.calls.slice(0, at).some((c) => c.port === "gate" && c.request.release === r.request.reply && people.has(c.request.person));
      });
      return (
        ack(q1).length === 1 && ack(q2).length === 1 &&
        gate >= 0 && send > gate &&
        calls(w, "notify", (c) => c.request.reply === q2).length === 0 &&
        everyReplyReleased
      );
    },
    describe: (w) => w.calls.filter((c) => c.port === "gate" || c.port === "notify").map((c) => `${c.port}:${JSON.stringify(c.request)}`).join(" | "),
  },
  {
    checkId: "the-clock-is-on-the-kind",
    // 7. A fee-quote request on a one-day clock; two days pass with nobody replying.
    world: () => world({ messages: [msg({ id: "D1", kind: "quote_request", from: "owner@newcafe.example.com.au", subject: "How much to take us on as a new client?" })] }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(48 * HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const item = w.itemForMessage("D1");
      if (!item) return false;
      const esc = calls(w, "escalate", (c) => c.request.itemId === item.id && c.request.reason === "past_clock");
      return (
        w.itemsForThread("T-D1").length === 1 &&
        esc.length === 1 && esc[0].request.to === "Daniel Okafor" &&
        Date.parse(esc[0].at) > Date.parse(item.due) &&
        item.status === "escalated"
      );
    },
    describe: (w) => calls(w, "escalate").map((c) => `${c.request.reason} to ${c.request.to} at ${c.at}`).join("; ") || "no escalation",
  },
  {
    checkId: "duplicates-thread-not-multiply",
    // 8. A client sends documents, then a second message in the same thread.
    world: () =>
      world({ messages: [msg({ id: "R1", thread_id: "T-R", kind: "job_update", from: "sarah@whitfield.example.com", subject: "XPM-1077 my PAYG summary attached", about: "job:XPM-1077" })] }),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(HOUR);
      w.arrive(msg({ id: "R2", thread_id: "T-R", kind: "job_update", from: "sarah@whitfield.example.com", subject: "Re: and the private health statement too", about: "job:XPM-1077" }));
      await b(w.ports());
    },
    holds: (w) => {
      const items = w.itemsForThread("T-R");
      const f1 = filingCalls(w, "R1")[0];
      const f2 = filingCalls(w, "R2")[0];
      return (
        raised(w).filter((c) => c.request.threadId === "T-R").length === 1 &&
        items.length === 1 && items[0].message_ids.includes("R1") && items[0].message_ids.includes("R2") &&
        f1?.request.recordRef === "job:XPM-1077" && f2?.request.recordRef === "job:XPM-1077"
      );
    },
    describe: (w) => `${w.itemsForThread("T-R").length} item(s) for the thread, ids ${w.itemsForThread("T-R").map((i) => i.message_ids.join("+")).join(" / ")}`,
  },
  {
    checkId: "spam-is-quarantined-not-deleted",
    // 9. Spam beside a supplier statement.
    world: () =>
      world({
        messages: [
          msg({ id: "S1", kind: "spam", from: "promo@seo-blast.example.biz", subject: "You are a winner! Click here for SEO services", hash: "sha256:spamraw1" }),
          msg({ id: "S2", kind: "statement", from: "billing@practicesoft.example.com", subject: "Account statement October", about: "supplier:SUP-PRACTICESOFT" }),
        ],
      }),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const q = filingCalls(w, "S1");
      return (
        q.length === 1 && q[0].request.to === "quarantine" && q[0].request.hash === "sha256:spamraw1" &&
        w.itemForMessage("S1")?.status === "quarantined" &&
        Boolean(w.stored("S1")) && Boolean(w.stored("S2")) &&
        calls(w, "file_message", (c) => c.request.to === "trash").length === 0
      );
    },
    describe: (w) => calls(w, "file_message", (c) => c.request.messageId).map((c) => `${c.request.messageId}->${c.request.to}`).join(", "),
  },
  {
    checkId: "the-record-by-message",
    // 10. A supplier bill filed with evidence, and a fee-quote request acknowledged, released and replied to.
    world: () =>
      world({
        messages: [
          msg({ id: "P1", kind: "supplier_invoice", from: "accounts@officepro.example.com.au", subject: "Tax invoice 55200", attachments: [{ hash: "sha256:inv55200pdf", name: "INV-55200.pdf" }], about: "supplier:SUP-OFFICEPRO" }),
          msg({ id: "P2", kind: "quote_request", from: "owner@newcafe.example.com.au", subject: "Quote for monthly bookkeeping" }),
        ],
      }),
    drive: async (b, w) => {
      // Intake and acknowledgement first; the owner writes and releases the reply an hour later.
      await b(w.ports());
      w.advance(HOUR);
      w.approve({ thread_id: "T-P2", person: "Margaret Lowe", body: "Our monthly bookkeeping fee is set out in the attached letter." });
      await b(w.ports());
      const p = w.ports();
      await p.readRecord("P1");
      await p.readRecord("P2");
    },
    holds: (w) => {
      const reads = calls(w, "read_inbox", (c) => c.request.record);
      const r1 = reads.find((c) => c.request.record === "P1")?.response;
      const r2 = reads.find((c) => c.request.record === "P2")?.response;
      const full1 = w.recordOf("P1");
      const full2 = w.recordOf("P2");
      return (
        r1 && r1.kind === "supplier_invoice" && r1.recordRef === "supplier:SUP-OFFICEPRO" && r1.owner && r1.due &&
        full1.filing?.filing.to === "record" && full1.evidence.some((e) => e.hash === "sha256:inv55200pdf") &&
        r2 && r2.kind === "quote_request" && r2.owner && r2.due &&
        r2.outbound.includes("acknowledgement by machine") && r2.outbound.includes("reply by Margaret Lowe") &&
        full2.outbound.filter((o) => o.kind === "reply").every((o) => o.released_by === "Margaret Lowe")
      );
    },
    describe: (w) => calls(w, "read_inbox", (c) => c.request.record).map((c) => `${c.request.record}: ${JSON.stringify(c.response)}`).join(" | "),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the mailbox, queues and practice manager run on
    // the practice's own accounts.
    world: () => world(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the practice's real mailbox for a week. This
// standard publishes no live port map, so run.mjs refuses a production run and
// the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InboxWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

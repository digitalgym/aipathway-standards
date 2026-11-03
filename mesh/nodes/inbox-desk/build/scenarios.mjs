/**
 * One scenario per check of inbox-triage-build-standard, for Inbox Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init inbox-triage-build-standard`
 * from https://aipathway.com.au/explore-ai/inbox-triage-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * and the rows the ports wrote), never the build's own memory. A build that
 * does nothing leaves the world empty and every one of these false.
 */

import { InboxWorld } from "@aipathway/conformance";

// The closed list, as section 2 of the standard gives it.
const MESSAGE_KINDS = ["supplier_invoice", "quote_request", "job_update", "statement", "complaint", "remittance", "spam", "other"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// The queue table the business sets once: an owner, a manager, a clock per kind.
const QUEUES = [
  { kind: "supplier_invoice", owner: "Dana Wells", manager: "Sam Ortiz", clockHours: 72 },
  { kind: "quote_request", owner: "Mia Chen", manager: "Sam Ortiz", clockHours: 24 },
  { kind: "job_update", owner: "Leo Grant", manager: "Sam Ortiz", clockHours: 8 },
  { kind: "statement", owner: "Dana Wells", manager: "Sam Ortiz", clockHours: 168 },
  { kind: "complaint", owner: "Sam Ortiz", manager: "Rae Ortiz", clockHours: 4 },
  { kind: "remittance", owner: "Dana Wells", manager: "Sam Ortiz", clockHours: 48 },
  { kind: "spam", owner: "Leo Grant", manager: "Sam Ortiz", clockHours: 720 },
  { kind: "other", owner: "Mia Chen", manager: "Sam Ortiz", clockHours: 24 },
];

// The jobs and suppliers the business already has records for.
const RECORDS = [
  { ref: "job:J-1001", kind: "job", name: "Harbour St bathroom", match: { subjectContains: "J-1001" } },
  { ref: "job:J-1002", kind: "job", name: "Kent Rd deck", match: { subjectContains: "J-1002" } },
  { ref: "supplier:S-14", kind: "supplier", name: "Coastal Timber", match: { fromDomain: "coastaltimber.com.au" } },
  { ref: "supplier:S-22", kind: "supplier", name: "Northside Electrical Wholesale", match: { fromDomain: "nsew.com.au" } },
];

let n = 0;
const msg = (o) => {
  n += 1;
  return {
    id: o.id,
    thread_id: o.thread ?? `TH-${o.id}`,
    from: o.from,
    received_at: o.at ?? "2026-09-26T00:00:00.000Z",
    subject: o.subject,
    body_ref: `mailbox://shared/${o.id}`,
    hash: o.hash ?? `sha256:${o.id.toLowerCase()}${String(n).padStart(4, "0")}`,
    attachments: o.attachments ?? [],
    kind: o.kind,
    ...(o.about ? { about: o.about } : {}),
  };
};

const world = (messages, extra = {}) => new InboxWorld({ queues: QUEUES, records: RECORDS, messages, ...extra });
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const one = (arr) => (arr.length === 1 ? arr[0] : undefined);
const itemOf = (w, id) => w.itemForMessage(id);
const noFolderOrTrash = (w) => !w.filings.some((f) => f.filing.to === "folder" || f.filing.to === "trash");
const replyWithoutRelease = (w) =>
  w.outbound.some((o) => o.kind === "reply" && !w.releases.some((r) => r.item_id === o.item_id && r.at <= o.at && w.people().includes(r.person)));

export const scenarios = [
  {
    checkId: "classified-onto-a-closed-list",
    // 1. Six messages, one of each kind the seed covers, one that fits nothing but other.
    world: () =>
      world([
        msg({ id: "M101", from: "accounts@coastaltimber.com.au", subject: "Tax invoice INV-5521", kind: "supplier_invoice", about: "supplier:S-14", attachments: [{ hash: "sha256:a101", name: "INV-5521.pdf" }] }),
        msg({ id: "M102", from: "jo.p@example.net", subject: "Quote for a new pergola", kind: "quote_request" }),
        msg({ id: "M103", from: "k.harris@example.net", subject: "J-1001 gate code has changed", kind: "job_update", about: "job:J-1001" }),
        msg({ id: "M104", from: "ar@nsew.com.au", subject: "September statement", kind: "statement", about: "supplier:S-22" }),
        msg({ id: "M105", from: "promo@bulk-mailer.biz", subject: "You have won a free SEO audit, click here", kind: "spam" }),
        msg({ id: "M106", from: "events@chamber.org.au", subject: "Breakfast networking next Thursday", kind: "other" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      w.seeded().every((m) => {
        const c = calls(w, "file_message", (x) => x.request.classify === m.id);
        return c.length === 1 && MESSAGE_KINDS.includes(c[0].request.kind) && c[0].response.onList === true;
      }),
    describe: (w) => w.classifications.map((c) => `${c.message_id}=${c.kind}`).join(", "),
  },
  {
    checkId: "filed-against-the-record",
    // 2. A job update about an existing job, a statement from a known supplier, and one that matches no record.
    world: () =>
      world([
        msg({ id: "M201", from: "k.harris@example.net", subject: "J-1002 update: decking boards arrived", kind: "job_update", about: "job:J-1002" }),
        msg({ id: "M202", from: "ar@nsew.com.au", subject: "Statement for August", kind: "statement", about: "supplier:S-22" }),
        msg({ id: "M203", from: "new.person@example.org", subject: "Quote please for a fence", kind: "quote_request" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const filedTo = (id, ref) =>
        calls(w, "file_message", (c) => c.request.messageId === id && c.request.to === "record" && c.request.recordRef === ref).length === 1 &&
        itemOf(w, id)?.record_ref === ref;
      const everyRecordFilingHasId = w.filings.every((f) => f.filing.to !== "record" || Boolean(f.filing.recordRef));
      const unmatched = itemOf(w, "M203");
      const unmatchedIsTask = Boolean(unmatched && unmatched.status === "open" && unmatched.owner && unmatched.record_ref === null) && !w.filingFor("M203");
      return filedTo("M201", "job:J-1002") && filedTo("M202", "supplier:S-22") && unmatchedIsTask && everyRecordFilingHasId && noFolderOrTrash(w);
    },
    describe: (w) => `filings ${w.filings.map((f) => `${f.message_id}->${f.filing.to}:${f.filing.recordRef ?? f.filing.hash ?? ""}`).join(", ")}; items ${w.items.map((i) => `${i.id}(${i.record_ref},${i.owner})`).join(", ")}`,
  },
  {
    checkId: "attachment-becomes-the-artefact",
    // 3. A supplier invoice from a known supplier with one attachment.
    world: () =>
      world([
        msg({ id: "M301", from: "accounts@coastaltimber.com.au", subject: "Invoice 8812 attached", kind: "supplier_invoice", about: "supplier:S-14", attachments: [{ hash: "sha256:9f3c2e", name: "8812.pdf" }] }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      calls(w, "evidence", (c) => c.request.hash === "sha256:9f3c2e" && c.request.messageId === "M301" && c.request.recordRef === "supplier:S-14").length === 1,
    describe: (w) => `evidence ${JSON.stringify(w.evidence)}`,
  },
  {
    checkId: "every-kind-has-a-queue-and-an-owner",
    // 4. Messages of several kinds, and the queue table above.
    world: () =>
      world([
        msg({ id: "M401", from: "jo.p@example.net", subject: "Quote for a carport", kind: "quote_request" }),
        msg({ id: "M402", from: "k.harris@example.net", subject: "J-1001 running late today", kind: "job_update", about: "job:J-1001" }),
        msg({ id: "M403", from: "ar@nsew.com.au", subject: "Monthly statement", kind: "statement", about: "supplier:S-22" }),
        msg({ id: "M404", from: "payables@bigclient.com.au", subject: "Remittance advice 30 Sept", kind: "remittance" }),
        msg({ id: "M405", from: "events@chamber.org.au", subject: "Members newsletter", kind: "other" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      w.seeded().every((m) => {
        const items = w.items.filter((i) => i.message_ids.includes(m.id));
        const item = one(items);
        const c = one(w.classificationsFor(m.id));
        const q = item && w.queueFor(item.kind);
        if (!item || !c || !q || item.kind !== c.kind) return false;
        const raised = one(calls(w, "raise_task", (x) => x.response.itemId === item.id && !x.request.update));
        return Boolean(item.owner) && item.owner === q.owner && new Date(item.due).getTime() === new Date(raised?.at ?? NaN).getTime() + q.clockHours * HOUR;
      }),
    describe: (w) => w.items.map((i) => `${i.kind}: ${i.owner} due ${i.due}`).join("; "),
  },
  {
    checkId: "complaints-go-to-a-person-untouched",
    // 5. One complaint about an existing job, beside one ordinary job update.
    world: () =>
      world([
        msg({ id: "M501", from: "k.harris@example.net", subject: "J-1001 not happy with the tiling finish", kind: "complaint", about: "job:J-1001" }),
        msg({ id: "M502", from: "p.ng@example.net", subject: "J-1002 update: side gate unlocked", kind: "job_update", about: "job:J-1002" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const item = itemOf(w, "M501");
      if (!item || item.status !== "escalated") return false;
      const esc = w.escalations.filter((e) => e.item_id === item.id && e.reason === "complaint");
      const toPerson = esc.length > 0 && esc.every((e) => w.people().includes(e.to) && e.with_message);
      const nothingOut = w.outboundFor(item.id).length === 0 && calls(w, "notify", (c) => c.request.acknowledge === item.id || c.request.reply === item.id).length === 0;
      return toPerson && nothingOut;
    },
    describe: (w) => `escalations ${JSON.stringify(w.escalations)}; outbound ${w.outbound.map((o) => `${o.item_id}:${o.kind}`).join(", ")}`,
  },
  {
    checkId: "no-reply-without-a-release",
    // 6. Two quote requests: one with a person's release and reply on file, one with nothing.
    world: () =>
      world(
        [
          msg({ id: "M601", thread: "TH-601", from: "jo.p@example.net", subject: "Quote for a retaining wall", kind: "quote_request" }),
          msg({ id: "M602", thread: "TH-602", from: "al.b@example.net", subject: "Quote for gutter replacement", kind: "quote_request" }),
        ],
        { approvals: [{ thread_id: "TH-601", person: "Mia Chen", body: "Thanks Jo. We can measure up on Tuesday; I will send the written quote after that. Mia" }] },
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const a = itemOf(w, "M601");
      const b = itemOf(w, "M602");
      if (!a || !b) return false;
      const acked = (i) => w.acknowledgements.some((k) => k.item_id === i.id && k.promised_by === i.due);
      const gate = w.firstCall("gate", (c) => c.request.release === a.id && c.request.person === "Mia Chen");
      const sent = w.firstCall("notify", (c) => c.request.reply === a.id);
      const aReplies = w.outboundFor(a.id).filter((o) => o.kind === "reply");
      const exact = aReplies.length === 1 && aReplies[0].body === "Thanks Jo. We can measure up on Tuesday; I will send the written quote after that. Mia";
      const bNoReply = !w.outboundFor(b.id).some((o) => o.kind === "reply");
      return acked(a) && acked(b) && gate >= 0 && sent > gate && exact && bNoReply && !replyWithoutRelease(w);
    },
    describe: (w) => w.calls.filter((c) => c.port === "gate" || c.port === "notify").map((c) => `${c.port} ${JSON.stringify(c.request)}`).join(" | "),
  },
  {
    checkId: "the-clock-is-on-the-kind",
    // 7. A quote request on a one-day clock; the clock advances two days and the build runs again.
    world: () => world([msg({ id: "M701", thread: "TH-701", from: "jo.p@example.net", subject: "Quote for a garden shed", kind: "quote_request" })]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(2 * DAY);
      await build(w.ports());
    },
    holds: (w) => {
      const items = w.itemsForThread("TH-701");
      const item = one(items);
      if (!item) return false;
      const manager = w.queueFor("quote_request").manager;
      const esc = w.escalations.filter((e) => e.item_id === item.id && e.reason === "past_clock");
      return item.status === "escalated" && esc.length === 1 && esc[0].to === manager && new Date(esc[0].at) > new Date(item.due);
    },
    describe: (w) => `items ${w.items.length}; escalations ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "duplicates-thread-not-multiply",
    // 8. A job update, processed; then a reply in the same thread (no job number in its subject) and a second run.
    world: () => world([msg({ id: "M801", thread: "TH-801", from: "k.harris@example.net", subject: "J-1001 update: tiles delivered", kind: "job_update", about: "job:J-1001" })]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR);
      w.arrive(msg({ id: "M802", thread: "TH-801", from: "k.harris@example.net", subject: "Re: tiles delivered", at: "", kind: "job_update", about: "job:J-1001" }));
      await build(w.ports());
    },
    holds: (w) => {
      const item = one(w.itemsForThread("TH-801"));
      return (
        Boolean(item) &&
        item.message_ids.includes("M801") &&
        item.message_ids.includes("M802") &&
        w.filingFor("M802")?.filing.to === "record" &&
        w.filingFor("M802")?.filing.recordRef === w.filingFor("M801")?.filing.recordRef &&
        item.record_ref === "job:J-1001"
      );
    },
    describe: (w) => `items for thread ${JSON.stringify(w.itemsForThread("TH-801"))}`,
  },
  {
    checkId: "spam-is-quarantined-not-deleted",
    // 9. One spam message beside one supplier statement.
    world: () =>
      world([
        msg({ id: "M901", from: "deals@crypto-yield.biz", subject: "Crypto winner: claim now", kind: "spam", hash: "sha256:spam901" }),
        msg({ id: "M902", from: "ar@coastaltimber.com.au", subject: "Statement September", kind: "statement", about: "supplier:S-14" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const q = calls(w, "file_message", (c) => c.request.messageId === "M901" && c.request.to === "quarantine" && c.request.hash === "sha256:spam901");
      return q.length === 1 && itemOf(w, "M901")?.status === "quarantined" && Boolean(w.stored("M901")) && noFolderOrTrash(w);
    },
    describe: (w) => `filings ${JSON.stringify(w.filings)}; stored M901 ${Boolean(w.stored("M901"))}`,
  },
  {
    checkId: "the-record-by-message",
    // 10. One supplier invoice filed with evidence; one quote request acknowledged, released and replied to.
    world: () =>
      world(
        [
          msg({ id: "M1001", from: "accounts@coastaltimber.com.au", subject: "Tax invoice 9001", kind: "supplier_invoice", about: "supplier:S-14", attachments: [{ hash: "sha256:b1001", name: "9001.pdf" }] }),
          msg({ id: "M1002", thread: "TH-1002", from: "jo.p@example.net", subject: "Quote for a new laundry", kind: "quote_request" }),
        ],
        { approvals: [{ thread_id: "TH-1002", person: "Mia Chen", body: "Hi Jo, we can look at it Friday morning. Mia" }] },
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const inv = w.recordOf("M1001");
      const q = w.recordOf("M1002");
      if (!inv || !q) return false;
      const invOk =
        inv.classification?.kind === "supplier_invoice" &&
        inv.item?.owner && inv.item?.due &&
        inv.filing?.filing.to === "record" &&
        inv.evidence.some((e) => e.hash === "sha256:b1001" && e.record_ref === "supplier:S-14");
      const qOk =
        q.classification?.kind === "quote_request" &&
        q.item?.owner && q.item?.due &&
        q.outbound.some((o) => o.kind === "acknowledgement") &&
        q.outbound.some((o) => o.kind === "reply" && o.released_by === "Mia Chen") &&
        q.outbound.every((o) => o.kind !== "reply" || o.released_by);
      return Boolean(invOk && qOk);
    },
    describe: (w) => JSON.stringify({ M1001: w.recordOf("M1001"), M1002: w.recordOf("M1002") }),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the mailbox rules and the queue table run on the
    // business's own Microsoft 365 or Google Workspace account.
    world: () => world([]),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's real mailbox for a week. This
// standard has no hosted provider and publishes no live port map, so run.mjs
// refuses a production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InboxWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

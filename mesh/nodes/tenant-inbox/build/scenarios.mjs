/**
 * One scenario per check of inbox-triage-build-standard, for Tenant Inbox.
 *
 * Scaffolded by `npx @aipathway/conformance init inbox-triage-build-standard`
 * from https://aipathway.com.au/explore-ai/inbox-triage-build-standard and
 * filled in for the shared inbox of a property management office. The checks
 * themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * and the rows the ports wrote), never the build's own memory, and returns a
 * strict true or false. A build that does nothing leaves the world empty and
 * every one of these false.
 */

import { InboxWorld } from "@aipathway/conformance";

// The closed list, as section 2 of the standard gives it.
const MESSAGE_KINDS = ["supplier_invoice", "quote_request", "job_update", "statement", "complaint", "remittance", "spam", "other"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// The queue table the agency sets once: an owner, a manager, a clock per kind.
const QUEUES = [
  { kind: "supplier_invoice", owner: "Tom Becker", manager: "Helen Marsh", clockHours: 72 },
  { kind: "quote_request", owner: "Grace Liu", manager: "Helen Marsh", clockHours: 24 },
  { kind: "job_update", owner: "Priya Nair", manager: "Helen Marsh", clockHours: 8 },
  { kind: "statement", owner: "Tom Becker", manager: "Helen Marsh", clockHours: 168 },
  { kind: "complaint", owner: "Priya Nair", manager: "Helen Marsh", clockHours: 4 },
  { kind: "remittance", owner: "Tom Becker", manager: "Helen Marsh", clockHours: 48 },
  { kind: "spam", owner: "Josh Reid", manager: "Helen Marsh", clockHours: 720 },
  { kind: "other", owner: "Priya Nair", manager: "Helen Marsh", clockHours: 24 },
];

// The records the property management system already holds: tenancies,
// maintenance work orders, and tradies held as creditors.
const RECORDS = [
  { ref: "tenancy:T-2041", kind: "tenancy", name: "Unit 4, 12 Esplanade, Mooloolaba", match: { subjectContains: "T-2041" } },
  { ref: "tenancy:T-2077", kind: "tenancy", name: "8 Banksia Cres, Buderim", match: { subjectContains: "T-2077" } },
  { ref: "job:WO-3307", kind: "job", name: "Hot water system, Unit 4, 12 Esplanade", match: { subjectContains: "WO-3307" } },
  { ref: "job:WO-3315", kind: "job", name: "Back fence repair, 8 Banksia Cres", match: { subjectContains: "WO-3315" } },
  { ref: "supplier:C-118", kind: "supplier", name: "Sunshine Coast Plumbing", match: { fromDomain: "scplumbing.com.au" } },
  { ref: "supplier:C-140", kind: "supplier", name: "Coastal Locksmiths", match: { fromDomain: "coastallocks.com.au" } },
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
    body_ref: `mailbox://pm-inbox/${o.id}`,
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
    // 1. Seven messages a property office gets, one that fits nothing but other.
    world: () =>
      world([
        msg({ id: "M101", from: "accounts@scplumbing.com.au", subject: "Tax invoice 7731 WO-3307", kind: "supplier_invoice", about: "supplier:C-118", attachments: [{ hash: "sha256:a101", name: "7731.pdf" }] }),
        msg({ id: "M102", from: "d.kaur@example.net", subject: "Rental appraisal for my townhouse", kind: "quote_request" }),
        msg({ id: "M103", from: "s.walsh@example.net", subject: "WO-3307 update: plumber attended this morning", kind: "job_update", about: "job:WO-3307" }),
        msg({ id: "M104", from: "ar@coastallocks.com.au", subject: "October statement", kind: "statement", about: "supplier:C-140" }),
        msg({ id: "M105", from: "s.walsh@example.net", subject: "T-2041 noise from upstairs every night, not happy", kind: "complaint", about: "tenancy:T-2041" }),
        msg({ id: "M106", from: "promo@bulk-mailer.biz", subject: "You have won a free SEO audit, click here", kind: "spam" }),
        msg({ id: "M107", from: "events@reiq.example.org", subject: "Breakfast seminar next Thursday", kind: "other" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      w.seeded().every((m) => {
        const c = calls(w, "file_message", (x) => x.request.classify === m.id);
        return c.length === 1 && MESSAGE_KINDS.includes(c[0].request.kind) && c[0].response.onList === true;
      }) && w.classifications.length === w.seeded().length,
    describe: (w) => w.classifications.map((c) => `${c.message_id}=${c.kind}`).join(", "),
  },
  {
    checkId: "filed-against-the-record",
    // 2. A tenant's update on a work order, a creditor's statement, and one with no record.
    world: () =>
      world([
        msg({ id: "M201", from: "m.obrien@example.net", subject: "WO-3315 update: fence contractor booked in Friday", kind: "job_update", about: "job:WO-3315" }),
        msg({ id: "M202", from: "ar@coastallocks.com.au", subject: "Statement for September", kind: "statement", about: "supplier:C-140" }),
        msg({ id: "M203", from: "new.owner@example.org", subject: "Quote for managing my unit", kind: "quote_request" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const filedTo = (id, ref) =>
        calls(w, "file_message", (c) => c.request.messageId === id && c.request.to === "record" && c.request.recordRef === ref).length === 1 &&
        itemOf(w, id)?.record_ref === ref;
      const everyRecordFilingHasId = w.filings.every((f) => f.filing.to !== "record" || Boolean(f.filing.recordRef));
      const unmatched = itemOf(w, "M203");
      const unmatchedIsTask = Boolean(unmatched && unmatched.status === "open" && unmatched.owner && unmatched.record_ref === null) && !w.filingFor("M203");
      return filedTo("M201", "job:WO-3315") && filedTo("M202", "supplier:C-140") && unmatchedIsTask && everyRecordFilingHasId && noFolderOrTrash(w);
    },
    describe: (w) => `filings ${w.filings.map((f) => `${f.message_id}->${f.filing.to}:${f.filing.recordRef ?? f.filing.hash ?? ""}`).join(", ")}; items ${w.items.map((i) => `${i.id}(${i.record_ref},${i.owner})`).join(", ")}`,
  },
  {
    checkId: "attachment-becomes-the-artefact",
    // 3. A plumber's invoice from a known creditor, with one attachment.
    world: () =>
      world([
        msg({ id: "M301", from: "accounts@scplumbing.com.au", subject: "Invoice 7740 attached", kind: "supplier_invoice", about: "supplier:C-118", attachments: [{ hash: "sha256:7c40de", name: "7740.pdf" }] }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      calls(w, "evidence", (c) => c.request.hash === "sha256:7c40de" && c.request.messageId === "M301" && c.request.recordRef === "supplier:C-118").length === 1 &&
      w.evidence.length === 1,
    describe: (w) => `evidence ${JSON.stringify(w.evidence)}`,
  },
  {
    checkId: "every-kind-has-a-queue-and-an-owner",
    // 4. Messages of several kinds, and the queue table above.
    world: () =>
      world([
        msg({ id: "M401", from: "d.kaur@example.net", subject: "Management fee quote for 2 units", kind: "quote_request" }),
        msg({ id: "M402", from: "s.walsh@example.net", subject: "WO-3307 access: key under the mat", kind: "job_update", about: "job:WO-3307" }),
        msg({ id: "M403", from: "ar@coastallocks.com.au", subject: "Monthly statement", kind: "statement", about: "supplier:C-140" }),
        msg({ id: "M404", from: "payables@housing.example.gov.au", subject: "Remittance advice: rent assistance October", kind: "remittance" }),
        msg({ id: "M405", from: "events@reiq.example.org", subject: "Members newsletter", kind: "other" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) =>
      w.seeded().every((m) => {
        const items = w.items.filter((i) => i.message_ids.includes(m.id));
        const item = one(items);
        const c = one(w.classificationsFor(m.id));
        const q = item && w.queueFor(item.kind);
        if (!item || !c || !q || item.kind !== c.kind || item.kind !== m.kind) return false;
        const raised = one(calls(w, "raise_task", (x) => x.response.itemId === item.id && !x.request.update));
        return Boolean(item.owner) && item.owner === q.owner && new Date(item.due).getTime() === new Date(raised?.at ?? NaN).getTime() + q.clockHours * HOUR;
      }),
    describe: (w) => w.items.map((i) => `${i.kind}: ${i.owner} due ${i.due}`).join("; "),
  },
  {
    checkId: "complaints-go-to-a-person-untouched",
    // 5. A tenant complaint on a tenancy, beside an ordinary work order update.
    world: () =>
      world([
        msg({ id: "M501", from: "s.walsh@example.net", subject: "T-2041 hot water still not fixed after two weeks", kind: "complaint", about: "tenancy:T-2041" }),
        msg({ id: "M502", from: "m.obrien@example.net", subject: "WO-3315 update: side gate left unlocked for the tradie", kind: "job_update", about: "job:WO-3315" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const item = itemOf(w, "M501");
      if (!item || item.status !== "escalated") return false;
      const esc = w.escalations.filter((e) => e.item_id === item.id && e.reason === "complaint");
      const toPerson = esc.length > 0 && esc.every((e) => w.people().includes(e.to) && e.with_message);
      const nothingOut = w.outboundFor(item.id).length === 0 && calls(w, "notify", (c) => c.request.acknowledge === item.id || c.request.reply === item.id).length === 0;
      const other = itemOf(w, "M502");
      const otherNotEscalated = Boolean(other) && other.status === "open";
      return toPerson && nothingOut && otherNotEscalated;
    },
    describe: (w) => `escalations ${JSON.stringify(w.escalations)}; outbound ${w.outbound.map((o) => `${o.item_id}:${o.kind}`).join(", ")}`,
  },
  {
    checkId: "no-reply-without-a-release",
    // 6. Two appraisal requests: one with a person's released words on file, one with nothing.
    world: () =>
      world(
        [
          msg({ id: "M601", thread: "TH-601", from: "d.kaur@example.net", subject: "Rental appraisal for 3 Wattle St", kind: "quote_request" }),
          msg({ id: "M602", thread: "TH-602", from: "a.brown@example.net", subject: "Quote to manage my house", kind: "quote_request" }),
        ],
        { approvals: [{ thread_id: "TH-601", person: "Grace Liu", body: "Hi Deepa, I can inspect 3 Wattle St on Tuesday at 10 and send the appraisal that afternoon. Grace" }] },
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const a = itemOf(w, "M601");
      const b = itemOf(w, "M602");
      if (!a || !b) return false;
      const acked = (i) => w.acknowledgements.some((k) => k.item_id === i.id && k.promised_by === i.due);
      const gate = w.firstCall("gate", (c) => c.request.release === a.id && c.request.person === "Grace Liu");
      const sent = w.firstCall("notify", (c) => c.request.reply === a.id);
      const aReplies = w.outboundFor(a.id).filter((o) => o.kind === "reply");
      const exact = aReplies.length === 1 && aReplies[0].body === "Hi Deepa, I can inspect 3 Wattle St on Tuesday at 10 and send the appraisal that afternoon. Grace";
      const bNoReply = !w.outboundFor(b.id).some((o) => o.kind === "reply");
      const acksCarryNoText = w.outbound.filter((o) => o.kind === "acknowledgement").every((o) => o.body === null);
      return acked(a) && acked(b) && gate >= 0 && sent > gate && exact && bNoReply && acksCarryNoText && !replyWithoutRelease(w);
    },
    describe: (w) => w.calls.filter((c) => c.port === "gate" || c.port === "notify").map((c) => `${c.port} ${JSON.stringify(c.request)}`).join(" | "),
  },
  {
    checkId: "the-clock-is-on-the-kind",
    // 7. An appraisal request on a one-day clock; two days pass and the build runs again.
    world: () => world([msg({ id: "M701", thread: "TH-701", from: "d.kaur@example.net", subject: "Appraisal for my duplex", kind: "quote_request" })]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(2 * DAY);
      await build(w.ports());
    },
    holds: (w) => {
      const item = one(w.itemsForThread("TH-701"));
      if (!item) return false;
      const manager = w.queueFor("quote_request").manager;
      const esc = w.escalations.filter((e) => e.item_id === item.id && e.reason === "past_clock");
      return item.status === "escalated" && esc.length === 1 && esc[0].to === manager && new Date(esc[0].at) > new Date(item.due);
    },
    describe: (w) => `items ${w.items.length}; escalations ${JSON.stringify(w.escalations)}`,
  },
  {
    checkId: "duplicates-thread-not-multiply",
    // 8. A tenant's update on a work order, then a reply in the same thread with no reference in its subject.
    world: () => world([msg({ id: "M801", thread: "TH-801", from: "s.walsh@example.net", subject: "WO-3307 update: new heater element fitted", kind: "job_update", about: "job:WO-3307" })]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR);
      w.arrive(msg({ id: "M802", thread: "TH-801", from: "s.walsh@example.net", subject: "Re: new heater element fitted", at: "", kind: "job_update", about: "job:WO-3307" }));
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
        item.record_ref === "job:WO-3307"
      );
    },
    describe: (w) => `items for thread ${JSON.stringify(w.itemsForThread("TH-801"))}`,
  },
  {
    checkId: "spam-is-quarantined-not-deleted",
    // 9. One spam message beside one creditor statement.
    world: () =>
      world([
        msg({ id: "M901", from: "deals@crypto-yield.biz", subject: "Crypto winner: claim now", kind: "spam", hash: "sha256:spam901" }),
        msg({ id: "M902", from: "ar@scplumbing.com.au", subject: "Statement October", kind: "statement", about: "supplier:C-118" }),
      ]),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const q = calls(w, "file_message", (c) => c.request.messageId === "M901" && c.request.to === "quarantine" && c.request.hash === "sha256:spam901");
      return q.length === 1 && itemOf(w, "M901")?.status === "quarantined" && Boolean(w.stored("M901")) && Boolean(w.stored("M902")) && noFolderOrTrash(w);
    },
    describe: (w) => `filings ${JSON.stringify(w.filings)}; stored M901 ${Boolean(w.stored("M901"))}`,
  },
  {
    checkId: "the-record-by-message",
    // 10. A plumber's invoice filed with evidence; an appraisal request acknowledged, released and replied to.
    world: () =>
      world(
        [
          msg({ id: "M1001", from: "accounts@scplumbing.com.au", subject: "Tax invoice 7802", kind: "supplier_invoice", about: "supplier:C-118", attachments: [{ hash: "sha256:b1001", name: "7802.pdf" }] }),
          msg({ id: "M1002", thread: "TH-1002", from: "d.kaur@example.net", subject: "Rental appraisal please", kind: "quote_request" }),
        ],
        { approvals: [{ thread_id: "TH-1002", person: "Grace Liu", body: "Hi Deepa, I can come by Friday morning. Grace" }] },
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const inv = w.recordOf("M1001");
      const q = w.recordOf("M1002");
      if (!inv || !q) return false;
      const invOk =
        inv.classification?.kind === "supplier_invoice" &&
        Boolean(inv.item?.owner) &&
        Boolean(inv.item?.due) &&
        inv.filing?.filing.to === "record" &&
        inv.filing?.filing.recordRef === "supplier:C-118" &&
        inv.evidence.some((e) => e.hash === "sha256:b1001" && e.record_ref === "supplier:C-118");
      const qOk =
        q.classification?.kind === "quote_request" &&
        Boolean(q.item?.owner) &&
        Boolean(q.item?.due) &&
        q.outbound.some((o) => o.kind === "acknowledgement") &&
        q.outbound.some((o) => o.kind === "reply" && o.released_by === "Grace Liu") &&
        q.outbound.every((o) => o.kind !== "reply" || Boolean(o.released_by));
      return invOk === true && qOk === true;
    },
    describe: (w) => JSON.stringify({ M1001: w.recordOf("M1001"), M1002: w.recordOf("M1002") }),
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the mailbox rules and the queue table run on the
    // agency's own Microsoft 365 or Google Workspace account.
    world: () => world([]),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the agency's real mailbox for a week. This
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

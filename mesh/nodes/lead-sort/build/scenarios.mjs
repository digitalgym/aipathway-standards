/**
 * One scenario per check of inbox-triage-build-standard, for Lead Sort.
 *
 * Scaffolded by `npx @aipathway/conformance init inbox-triage-build-standard`
 * from https://aipathway.com.au/explore-ai/inbox-triage-build-standard. The
 * checks are fetched at run time; what is here is the world each check starts
 * in, how the build is driven, and what "held" means.
 *
 * The world is a trade office's shared inbox in Australia: voicemail
 * notifications from the phone system, website enquiry-form emails, customers
 * writing about a job already booked in the job system, supplier invoices and
 * statements, and spam. Every holds() reads the world, never the build, and
 * returns a strict true or false.
 */

import { InboxWorld } from "@aipathway/conformance";

// The standard's closed list of kinds.
const MESSAGE_KINDS = ["supplier_invoice", "quote_request", "job_update", "statement", "complaint", "remittance", "spam", "other"];

const HOUR = 3_600_000;
const T0 = "2026-11-02T22:00:00.000Z"; // Tuesday 8am in Brisbane

// The queue table the office set once: an owner, their manager, and a clock per kind.
const QUEUES = [
  { kind: "quote_request", owner: "Priya Nair", manager: "Dale Hutchins", clockHours: 4 },
  { kind: "job_update", owner: "Priya Nair", manager: "Dale Hutchins", clockHours: 24 },
  { kind: "supplier_invoice", owner: "Megan Lowe", manager: "Dale Hutchins", clockHours: 72 },
  { kind: "statement", owner: "Megan Lowe", manager: "Dale Hutchins", clockHours: 168 },
  { kind: "remittance", owner: "Megan Lowe", manager: "Dale Hutchins", clockHours: 72 },
  { kind: "complaint", owner: "Dale Hutchins", manager: "Sam Hutchins", clockHours: 2 },
  { kind: "spam", owner: "Megan Lowe", manager: "Dale Hutchins", clockHours: 720 },
  { kind: "other", owner: "Priya Nair", manager: "Dale Hutchins", clockHours: 24 },
];

// Records the business already has: jobs in the job system, suppliers in Xero.
const RECORDS = [
  { ref: "job:7f3a2c10-servicem8", kind: "job", name: "Hot water replacement, 14 Banksia St", match: { subjectContains: "JOB-1042" } },
  { ref: "job:9b81d4e2-servicem8", kind: "job", name: "Switchboard upgrade, 3 Mango Ct", match: { subjectContains: "JOB-1057" } },
  { ref: "supplier:xero-c1d2-reece", kind: "supplier", name: "Reece Plumbing", match: { fromDomain: "reece.example.com.au" } },
  { ref: "supplier:xero-a7b9-tradelink", kind: "supplier", name: "Tradelink", match: { fromDomain: "tradelink.example.com.au" } },
];

let n = 0;
const msg = (over) => ({
  id: over.id,
  thread_id: over.thread_id ?? `th-${over.id}`,
  from: over.from,
  received_at: over.received_at ?? T0,
  subject: over.subject,
  body_ref: over.body_ref,
  hash: over.hash ?? `sha256:${over.id}-${++n}`,
  attachments: over.attachments ?? [],
  kind: over.kind,
  ...(over.about ? { about: over.about } : {}),
});

const M = {
  voicemail: () =>
    msg({
      id: "m-voicemail",
      from: "voicemail@phone.example.com.au",
      subject: "New voicemail from 0412 555 018",
      body_ref: "Transcript: Hi, it's Karen in Buderim, the hot water's gone cold, can someone come out and look and give me a quote?",
      kind: "quote_request",
    }),
  webform: () =>
    msg({
      id: "m-webform",
      from: "forms@site.example.com.au",
      subject: "Website enquiry form: new lead",
      body_ref: "Name: Tom Becker. Suburb: Maroochydore. Message: how much to add two power points in the garage?",
      kind: "quote_request",
    }),
  jobUpdate: () =>
    msg({
      id: "m-jobupdate",
      from: "karen.ellis@mail.example.com",
      subject: "JOB-1042 gate code has changed",
      body_ref: "Hi, the side gate code is now 4471 for tomorrow's visit.",
      kind: "job_update",
      about: "job:7f3a2c10-servicem8",
    }),
  statement: () =>
    msg({
      id: "m-statement",
      from: "accounts@tradelink.example.com.au",
      subject: "Your October statement",
      body_ref: "Please find your account statement for October attached.",
      attachments: [{ hash: "sha256:stmt-oct", name: "statement-oct.pdf" }],
      kind: "statement",
      about: "supplier:xero-a7b9-tradelink",
    }),
  invoice: () =>
    msg({
      id: "m-invoice",
      from: "ar@reece.example.com.au",
      subject: "Tax invoice INV-88231",
      body_ref: "Tax invoice for goods collected 31 October. ABN 00 000 000 000.",
      attachments: [{ hash: "sha256:inv-88231-pdf", name: "INV-88231.pdf" }],
      kind: "supplier_invoice",
      about: "supplier:xero-c1d2-reece",
    }),
  complaint: () =>
    msg({
      id: "m-complaint",
      from: "g.watts@mail.example.com",
      subject: "JOB-1057 not happy with the finish",
      body_ref: "The cover plate is crooked and there is plaster dust through the hallway. Not happy.",
      kind: "complaint",
      about: "job:9b81d4e2-servicem8",
    }),
  spam: () =>
    msg({
      id: "m-spam",
      from: "growth@seo-agency.example.net",
      subject: "Get your trade business ranking on Google",
      body_ref: "Limited offer: 200 backlinks and a guest post for $99.",
      kind: "spam",
    }),
  other: () =>
    msg({
      id: "m-other",
      from: "events@chamber.example.org.au",
      subject: "Breakfast networking, Thursday",
      body_ref: "Join local business owners for breakfast at the surf club.",
      kind: "other",
    }),
};

const world = (messages, approvals = []) => new InboxWorld({ now: new Date(T0), messages, queues: QUEUES, records: RECORDS, approvals });
const once = (build, w) => build(w.ports());
const describe = (w) =>
  `${w.calls.length} port call(s); ${w.classifications.length} classification(s), ${w.items.length} item(s), ${w.filings.length} filing(s), ${w.outbound.length} outbound, ${w.escalations.length} escalation(s)`;

const ON_LIST = new Set(MESSAGE_KINDS);
const callIndex = (w, port, pred) => w.calls.findIndex((c) => c.port === port && pred(c.request ?? {}));
const queueOf = (kind) => QUEUES.find((q) => q.kind === kind);
const hasItemWithOwner = (w, id) => {
  const items = w.items.filter((i) => i.message_ids.includes(id));
  return items.length === 1 && typeof items[0].owner === "string" && items[0].owner.length > 0;
};

export const scenarios = [
  {
    checkId: "classified-onto-a-closed-list",
    // Six kinds the seed covers, including voicemail and web-form leads, and one that fits nothing but other.
    world: () => world([M.voicemail(), M.webform(), M.jobUpdate(), M.invoice(), M.spam(), M.statement(), M.other()]),
    drive: once,
    holds: (w) => {
      const seeded = w.seeded();
      if (seeded.length !== 7) return false;
      return seeded.every((m) => {
        const cs = w.classificationsFor(m.id);
        return cs.length === 1 && ON_LIST.has(cs[0].kind) && cs[0].kind === m.kind;
      });
    },
    describe,
  },
  {
    checkId: "filed-against-the-record",
    // A job update about an existing job, a supplier statement, and an enquiry that matches no record.
    world: () => world([M.jobUpdate(), M.statement(), M.webform()]),
    drive: once,
    holds: (w) => {
      if (w.filings.some((f) => f.filing.to === "folder" || f.filing.to === "trash")) return false;
      for (const id of ["m-jobupdate", "m-statement"]) {
        const about = w.seededMessage(id)?.about;
        const f = w.filingFor(id);
        const item = w.itemForMessage(id);
        if (!about || !f || f.filing.to !== "record" || f.filing.recordRef !== about) return false;
        if (!item || item.record_ref !== about) return false;
      }
      // Every record filing carries a record id.
      if (w.filings.some((f) => f.filing.to === "record" && !(typeof f.filing.recordRef === "string" && f.filing.recordRef.length > 0))) return false;
      // The unmatched lead is not filed anywhere, and is an open task with an owner.
      const lead = w.itemForMessage("m-webform");
      if (w.filingFor("m-webform")) return false;
      return Boolean(lead) && lead.status === "open" && lead.record_ref === null && hasItemWithOwner(w, "m-webform");
    },
    describe,
  },
  {
    checkId: "attachment-becomes-the-artefact",
    world: () => world([M.invoice()]),
    drive: once,
    holds: (w) => {
      const m = w.seededMessage("m-invoice");
      const att = m.attachments[0];
      const ev = w.evidence.filter((e) => e.hash === att.hash);
      return ev.length === 1 && ev[0].message_id === m.id && ev[0].record_ref === m.about;
    },
    describe,
  },
  {
    checkId: "every-kind-has-a-queue-and-an-owner",
    world: () => world([M.voicemail(), M.jobUpdate(), M.invoice(), M.statement(), M.other()]),
    drive: once,
    holds: (w) => {
      const seeded = w.seeded();
      return seeded.every((m) => {
        const items = w.items.filter((i) => i.message_ids.includes(m.id));
        if (items.length !== 1) return false;
        const item = items[0];
        const q = queueOf(m.kind);
        if (!q || item.kind !== m.kind || item.owner !== q.owner) return false;
        const want = new Date(new Date(item.created_at).getTime() + q.clockHours * HOUR).toISOString();
        return item.due === want;
      });
    },
    describe,
  },
  {
    checkId: "complaints-go-to-a-person-untouched",
    world: () => world([M.complaint(), M.jobUpdate()]),
    drive: once,
    holds: (w) => {
      const item = w.itemForMessage("m-complaint");
      if (!item || item.status !== "escalated") return false;
      const people = new Set(w.people());
      const esc = w.escalations.filter((e) => e.item_id === item.id);
      if (esc.length < 1 || !esc.every((e) => e.reason === "complaint" && e.with_message === true && people.has(e.to))) return false;
      if (w.outboundFor(item.id).length !== 0 || w.acknowledgements.some((a) => a.item_id === item.id)) return false;
      // The job update beside it is still handled: filed and held.
      const other = w.itemForMessage("m-jobupdate");
      return Boolean(other) && other.status === "open";
    },
    describe,
  },
  {
    checkId: "no-reply-without-a-release",
    // Two leads: one a person has released words for, one with nothing.
    world: () =>
      world(
        [M.voicemail(), M.webform()],
        [{ thread_id: "th-m-voicemail", person: "Priya Nair", body: "Hi Karen, Priya here. We can be there Thursday morning; a like-for-like 250L replacement is $2,850 inc GST." }],
      ),
    drive: once,
    holds: (w) => {
      const released = w.itemForMessage("m-voicemail");
      const held = w.itemForMessage("m-webform");
      if (!released || !held) return false;
      // Both acknowledged, with the promised time equal to the item's due date.
      for (const it of [released, held]) {
        const acks = w.acknowledgements.filter((a) => a.item_id === it.id);
        if (acks.length !== 1 || acks[0].promised_by !== it.due) return false;
      }
      // The acknowledgement carries no free text.
      if (w.outbound.some((o) => o.kind === "acknowledgement" && o.body !== null)) return false;
      // The released one: a gate naming the person, then exactly those words.
      const replies = w.outboundFor(released.id).filter((o) => o.kind === "reply");
      if (replies.length !== 1 || replies[0].body !== "Hi Karen, Priya here. We can be there Thursday morning; a like-for-like 250L replacement is $2,850 inc GST.") return false;
      const gate = callIndex(w, "gate", (r) => r.release === released.id && r.person === "Priya Nair");
      const send = callIndex(w, "notify", (r) => r.reply === released.id);
      if (gate < 0 || send < 0 || gate > send) return false;
      // The other has no reply, and no reply anywhere lacks a prior release.
      if (w.outboundFor(held.id).some((o) => o.kind === "reply")) return false;
      return w.outbound
        .filter((o) => o.kind === "reply")
        .every((o) => w.releasesFor(o.item_id).some((r) => r.at <= o.at && typeof r.person === "string" && r.person.length > 0));
    },
    describe,
  },
  {
    checkId: "the-clock-is-on-the-kind",
    // A web-form lead, a four-hour clock. Two days pass and the build runs again.
    world: () => world([M.webform()]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(48 * HOUR);
      await build(w.ports());
    },
    holds: (w) => {
      const items = w.itemsForThread("th-m-webform");
      if (items.length !== 1) return false;
      const item = items[0];
      const esc = w.escalations.filter((e) => e.item_id === item.id && e.reason === "past_clock");
      return item.status === "escalated" && esc.length === 1 && esc[0].to === queueOf("quote_request").manager && esc[0].at > item.due;
    },
    describe,
  },
  {
    checkId: "duplicates-thread-not-multiply",
    world: () => world([M.jobUpdate()]),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(HOUR);
      w.arrive(
        msg({
          id: "m-jobupdate-2",
          thread_id: "th-m-jobupdate",
          from: "karen.ellis@mail.example.com",
          subject: "Re: JOB-1042 gate code has changed",
          body_ref: "Sorry, also the dog will be inside.",
          received_at: "",
          kind: "job_update",
          about: "job:7f3a2c10-servicem8",
        }),
      );
      await build(w.ports());
    },
    holds: (w) => {
      const items = w.itemsForThread("th-m-jobupdate");
      if (items.length !== 1) return false;
      const ids = items[0].message_ids;
      if (!(ids.length === 2 && ids.includes("m-jobupdate") && ids.includes("m-jobupdate-2"))) return false;
      const first = w.filingFor("m-jobupdate");
      const second = w.filingFor("m-jobupdate-2");
      return (
        Boolean(first && second) &&
        second.filing.to === "record" &&
        first.filing.to === "record" &&
        second.filing.recordRef === first.filing.recordRef &&
        second.filing.recordRef === "job:7f3a2c10-servicem8"
      );
    },
    describe,
  },
  {
    checkId: "spam-is-quarantined-not-deleted",
    world: () => world([M.spam(), M.statement()]),
    drive: once,
    holds: (w) => {
      if (w.filings.some((f) => f.filing.to === "trash")) return false;
      const spam = w.seededMessage("m-spam");
      const f = w.filingFor("m-spam");
      const item = w.itemForMessage("m-spam");
      return (
        Boolean(f) &&
        f.filing.to === "quarantine" &&
        f.filing.hash === spam.hash &&
        Boolean(item) &&
        item.status === "quarantined" &&
        w.stored("m-spam") !== undefined &&
        w.stored("m-statement") !== undefined &&
        w.outboundFor(item.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "the-record-by-message",
    world: () =>
      world(
        [M.invoice(), M.voicemail()],
        [{ thread_id: "th-m-voicemail", person: "Priya Nair", body: "Hi Karen, we can come Thursday between 7 and 9; the call-out is $120 inc GST." }],
      ),
    drive: once,
    holds: (w) => {
      const inv = w.recordOf("m-invoice");
      const lead = w.recordOf("m-voicemail");
      if (!inv || !lead) return false;
      const whole = (r) => r.classification && ON_LIST.has(r.classification.kind) && r.item && r.item.owner && r.item.due;
      if (!whole(inv) || !whole(lead)) return false;
      if (!inv.filing || inv.filing.filing.to !== "record" || inv.filing.filing.recordRef !== "supplier:xero-c1d2-reece") return false;
      if (inv.evidence.length !== 1 || inv.evidence[0].hash !== "sha256:inv-88231-pdf") return false;
      const reply = lead.outbound.find((o) => o.kind === "reply");
      const ack = lead.outbound.find((o) => o.kind === "acknowledgement");
      return Boolean(reply && ack) && reply.released_by === "Priya Nair" && lead.releases.some((r) => r.person === "Priya Nair");
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: closed by evidence, never by a run. The runner reports it
    // as evidence_required whatever this returns, so it never claims green.
    world: () => world([]),
    drive: once,
    holds: () => false,
    describe: () =>
      "Declared: the queue table and inbox rules run on the business's own mailbox and job-system accounts; the office manager named on the queue table can explain it from this folder's README.",
  },
];

// The pass test runs only on the real mailbox for a week. On the stub it is with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InboxWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe,
  },
];

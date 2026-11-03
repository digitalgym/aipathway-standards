/**
 * One scenario per check of cash-seam-build-standard, for Parts Quote.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`, from
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard
 *
 * The runner delivers named events one at a time and runs the build once per
 * event. Between events it plays the outside world: the job system announcing
 * a new job, the person who owns quotes sending the draft, the customer
 * accepting, the warehouse marking the parts job complete, and the clock
 * passing the due date. The enquiry hop, the invoice hop and the chase hop are
 * the thin stand-ins in build.mjs; Parts Quote is the quote hop.
 *
 * In this world every enquiry is a `call_received` with a contact number; for
 * Parts Quote the door is an enquiry email (door "web"), and the number is the
 * customer's contact on the job.
 */

import { CashSeamWorld } from "@aipathway/conformance";
import { personReleasesQuote } from "./build.mjs";

const DAY = 86_400_000;
const OWNERS = new CashSeamWorld().owners;
const QUOTE_PERSON = OWNERS.quote;

async function deliver(world, build, name, via, payload = {}) {
  const ev = world.makeEvent(name, via, payload);
  world.deliver(ev);
  await build(world.ports());
  world.settle();
  world.advance(60_000);
  return ev;
}

/** The job system fires job_created for each job it has not announced yet. */
async function announce(world, build) {
  for (const j of world.unannouncedJobs()) await deliver(world, build, "job_created", "webhook", { jobId: j.id });
}

async function sentAndAccepted(world, jobId) {
  for (const id of await personReleasesQuote(world.ports(), jobId, QUOTE_PERSON)) world.accept(id);
}

/** One parts enquiry from the email to the chase. */
async function wholeChain(world, build, { phone, customerName }) {
  await deliver(world, build, "call_received", "webhook", { phone, customerName, door: "web" });
  const ids = world.jobsFor(phone).map((j) => j.id);
  await announce(world, build);
  for (const id of ids) {
    await sentAndAccepted(world, id);
    for (const q of world.quotesFor(id).filter((x) => x.status === "accepted")) await deliver(world, build, "quote_accepted", "webhook", { quoteId: q.id });
    world.complete(id);
    await deliver(world, build, "job_completed", "webhook", { jobId: id });
  }
  return ids;
}

async function goesOverdue(world, build) {
  world.advance(31 * DAY);
  await deliver(world, build, "invoice_overdue", "schedule");
}

const describe = (world) =>
  `${world.calls.length} port call(s); jobs ${world.jobs.length}, quotes ${world.quotes.length}, invoices ${world.invoices.length}, chases ${world.chases.length}, escalations ${world.escalations.map((e) => `${e.stage}:${e.reason}@${e.ref}/${e.owner}`).join(" ") || "none"}`;

const evName = (world, id) => world.eventById(id)?.name;
const writes = (world) => world.calls.filter((c) => ["write_job", "draft_quote", "write_invoice"].includes(c.port));
const sendCalls = (world) => world.calls.filter((c) => c.port === "issue_notice" || c.port === "send_sms");

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // 1. Two open parts jobs for two customers who share a trading name. One quote is accepted and its job completed.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-4401", customerName: "Southern Hydraulics", phone: "+61733330101", status: "open" },
          { id: "JS-4402", customerName: "Southern Hydraulics", phone: "+61893330102", status: "open" },
        ],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-4401" });
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-4402" });
      await sentAndAccepted(world, "JS-4401");
      world.complete("JS-4401");
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-4401" });
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const q = world.quotesFor("JS-4401");
      const inv = world.invoices;
      const downstreamSearches = world.calls.filter((c) => c.port === "read_job" && c.request?.search && c.request.eventName !== "call_received");
      return (
        q.length === 1 &&
        q[0].status === "accepted" &&
        world.quotesFor("JS-4402").length === 1 &&
        inv.length === 1 &&
        inv[0].jobId === "JS-4401" &&
        inv[0].quoteId === q[0].id &&
        world.invoicesFor("JS-4402").length === 0 &&
        downstreamSearches.length === 0 &&
        world.quotes.every((x) => issued.has(x.jobId)) &&
        inv.every((i) => issued.has(i.jobId) && (i.quoteId === null || issued.has(i.quoteId)))
      );
    },
    describe,
  },
  {
    checkId: "one-job-per-enquiry",
    // 2. The same customer enquires twice in one evening, by two doors, from the same contact number.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await deliver(world, build, "call_received", "webhook", { phone: "+61733330201", customerName: "Ridgeway Mining Services", door: "web" });
      world.advance(3 * 60 * 60_000);
      await deliver(world, build, "call_received", "webhook", { phone: "+61733330201", customerName: "Ridgeway Mining Services", door: "phone" });
    },
    holds: (world) => {
      const jobs = world.jobsFor("+61733330201");
      const [first, second] = world.enquiries;
      const readFirst = world.calls.every((c, i) => {
        if (c.port !== "write_job") return true;
        return world.calls.slice(0, i).some((r) => r.port === "read_job" && r.request?.search?.phone === "+61733330201" && r.request.search.status === "open");
      });
      return jobs.length === 1 && Boolean(first) && Boolean(second) && !first.duplicateOf && second.duplicateOf === jobs[0].id && readFirst;
    },
    describe,
  },
  {
    checkId: "no-external-id-no-write",
    // 3. The whole chain twice: the quote write returns no id for the first job (JS-1001), the invoice write for the second (JS-1002).
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: async (build, world) => {
      await wholeChain(world, build, { phone: "+61733330301", customerName: "Bayside Conveyors" });
      await wholeChain(world, build, { phone: "+61733330302", customerName: "Inland Pump Hire" });
      await goesOverdue(world, build);
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const quoteEscalated = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && e.reason === "write_failed" && e.owner === world.owners.quote);
      const invoiceEscalated = world.escalations.some((e) => e.stage === "invoice" && e.ref === "JS-1002" && e.reason === "write_failed" && e.owner === world.owners.invoice);
      const nothingAfterA = world.quotesFor("JS-1001").length === 0 && world.invoicesFor("JS-1001").length === 0;
      const nothingAfterB = world.invoicesFor("JS-1002").length === 0 && world.chases.length === 0 && !world.releases.some((r) => r.kind !== "quote");
      const noInvented =
        world.quotes.every((q) => q.jobId && issued.has(q.jobId)) &&
        world.invoices.every((i) => i.jobId && issued.has(i.jobId)) &&
        world.sends.every((s) => s.id && issued.has(s.id)) &&
        world.releases.every((r) => r.id && issued.has(r.id));
      return quoteEscalated && invoiceEscalated && nothingAfterA && nothingAfterB && noInvented;
    },
    describe,
  },
  {
    checkId: "the-chain-carries-the-id",
    // 4. One parts enquiry through the whole path, then the invoice goes overdue.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await wholeChain(world, build, { phone: "+61733330401", customerName: "Northgate Packaging" });
      await goesOverdue(world, build);
    },
    holds: (world) => {
      if (world.jobs.length !== 1 || world.quotes.length !== 1 || world.invoices.length !== 1 || world.chases.length !== 1) return false;
      const [job] = world.jobs;
      const [quote] = world.quotes;
      const [inv] = world.invoices;
      const [chase] = world.chases;
      const chaseAt = world.calls.findIndex((c) => c.port === "send_sms" && c.request?.send === "chase");
      const ledgerBefore = world.calls.slice(0, chaseAt).some((c) => c.port === "read_ledger" && (c.response?.ids ?? []).includes(chase.invoiceId));
      return quote.jobId === job.id && inv.quoteId === quote.id && inv.jobId === job.id && chase.invoiceId === inv.id && chaseAt > 0 && ledgerBefore;
    },
    describe,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // 5. The whole chain twice; the first quote write answers "Quote created" with an id but stores nothing.
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: async (build, world) => {
      await wholeChain(world, build, { phone: "+61733330501", customerName: "Coastal Cold Stores" });
      await wholeChain(world, build, { phone: "+61733330502", customerName: "Westside Fabrication" });
      await goesOverdue(world, build);
    },
    holds: (world) => {
      const [ghost] = world.phantomIds;
      if (!ghost) return false;
      const escalated = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && e.reason === "write_failed" && (e.detail ?? "").includes(ghost));
      const ghostUntouched = !world.releases.some((r) => r.id === ghost) && !world.sends.some((s) => s.id === ghost);
      const people = new Set(Object.values(world.owners));
      const rule = world.releaseRule?.name;
      const sends = sendCalls(world);
      const gated = sends.every((s) => {
        const before = world.calls.slice(0, world.calls.indexOf(s));
        const id = s.request.id;
        const readBack = before.some(
          (c) =>
            (c.port === "read_job" && c.request?.quote === id && c.response?.id === id) ||
            (c.port === "read_ledger" && ((c.request?.invoice === id && c.response?.id === id) || (c.response?.ids ?? []).includes(id))),
        );
        const released = before.some(
          (c) => c.port === "gate" && c.request.release === s.request.send && c.request.id === id && ((c.request.person && people.has(c.request.person)) || (c.request.rule && c.request.rule === rule)),
        );
        return readBack && released;
      });
      const releasesNamed = world.releases.every((r) => (r.person && people.has(r.person)) || (r.rule && r.rule === rule));
      return escalated && ghostUntouched && sends.length > 0 && gated && releasesNamed && world.chases.length === 1;
    },
    describe,
  },
  {
    checkId: "named-unattended-trigger",
    // 6. The chain as events with nobody in a session, plus a chat message asking for the invoice early.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      const phone = "+61733330601";
      await deliver(world, build, "call_received", "webhook", { phone, customerName: "Harbourline Marine", door: "web" });
      await announce(world, build);
      const [job] = world.jobsFor(phone);
      await deliver(world, build, "chat_message", "chat", { text: `Raise the invoice for ${job?.id} now please`, jobId: job?.id });
      await sentAndAccepted(world, job.id);
      world.complete(job.id);
      await deliver(world, build, "job_completed", "webhook", { jobId: job.id });
      await goesOverdue(world, build);
    },
    holds: (world) => {
      const KIND = { write_job: "call_received", draft_quote: "job_created", write_invoice: "job_completed" };
      const unattended = (id) => ["webhook", "schedule", "poll"].includes(world.eventById(id)?.via);
      const writesOk = writes(world).length >= 3 && writes(world).every((c) => unattended(c.request.trigger) && evName(world, c.request.trigger) === KIND[c.port]);
      const chasesOk = world.chases.every((c) => unattended(c.trigger) && evName(world, c.trigger) === "invoice_overdue");
      const chat = world.delivered.find((e) => e.name === "chat_message");
      const chatIgnored = Boolean(chat) && ![...writes(world).map((c) => c.request.trigger), ...world.chases.map((c) => c.trigger), ...world.sends.map((s) => s.trigger)].includes(chat.id);
      const allFour = world.jobs.length === 1 && world.quotes.length === 1 && world.invoices.length === 1 && world.chases.length === 1;
      const named =
        evName(world, world.jobs[0]?.trigger) === "call_received" &&
        evName(world, world.quotes[0]?.trigger) === "job_created" &&
        evName(world, world.invoices[0]?.trigger) === "job_completed";
      return writesOk && chasesOk && chatIgnored && allFour && named;
    },
    describe,
  },
  {
    checkId: "exception-owner-travels",
    // 7. Two parts jobs complete. One carries an open exception a person set; the other's invoice write returns no id.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-4701", customerName: "Eastern Rail Workshops", phone: "+61733330701", status: "complete", exception: { reason: "wrong_part_supplied", owner: OWNERS.quote } },
          { id: "JS-4702", customerName: "Kestrel Plant Hire", phone: "+61733330702", status: "complete" },
        ],
        nullInvoiceFor: ["JS-4702"],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-4701" });
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-4702" });
    },
    holds: (world) => {
      const named = new Set(Object.values(world.owners));
      const hold = world.escalations.some((e) => e.ref === "JS-4701" && e.owner === OWNERS.quote);
      const failed = world.escalations.some((e) => e.ref === "JS-4702" && e.stage === "invoice" && e.reason === "write_failed" && e.owner === world.owners.invoice);
      const owned = world.escalations.length > 0 && world.escalations.every((e) => e.owner && named.has(e.owner));
      const travels = world.job("JS-4702")?.exception?.owner === world.owners.invoice && world.job("JS-4701")?.exception?.owner === OWNERS.quote;
      return world.invoices.length === 0 && hold && failed && owned && travels;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 8. Not a runtime property. Never green on a declaration.
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe: () =>
      "Declared: the code is public in mesh/nodes/parts-quote, maintained by AI Pathway (digitalgym). The trigger and every write run on the business's own job system and ledger accounts. Not scored: the business attaches who else can explain it.",
  },
];

// Check 9 runs only on the business's own job system and ledger; with_us on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CashSeamWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

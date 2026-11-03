/**
 * One scenario per check of cash-seam-build-standard, for Promise Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`
 * from https://aipathway.com.au/explore-ai/cash-seam-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The runner delivers named events one at a time and runs the build once per
 * event. Between events the drive plays the outside world: the job system
 * announcing a new job, the person who owns quotes sending the draft, the
 * customer accepting, the job being completed, the clock passing the due
 * date, and the person who owns chasing approving a drafted chase from their
 * queue. Promise Watch is the invoice_overdue hop; the hops before it are the
 * labelled stand-ins in build.mjs.
 */

import { CashSeamWorld } from "@aipathway/conformance";
import { approveChaseByPerson, releaseQuoteByPerson } from "./build.mjs";

const DAY = 86_400_000;
/** The owners the stub business set per stage. */
const OWNERS = new CashSeamWorld().owners;

async function deliver(world, build, name, via, payload = {}) {
  const ev = world.makeEvent(name, via, payload);
  world.deliver(ev);
  await build(world.ports());
  world.settle();
  world.advance(60_000);
  return ev;
}

/** The job system fires job_created for every job it has not announced yet. */
async function announce(world, build) {
  for (const j of world.unannouncedJobs()) await deliver(world, build, "job_created", "webhook", { jobId: j.id });
}

/** The person who owns quotes sends the draft; the customer accepts what reached them. */
async function quoteGoesOutAndIsAccepted(world, build, jobId) {
  for (const id of await releaseQuoteByPerson(world.ports(), jobId, OWNERS.quote)) {
    world.accept(id);
    await deliver(world, build, "quote_accepted", "webhook", { quoteId: id });
  }
}

async function quoteToCompletion(world, build, jobId) {
  await quoteGoesOutAndIsAccepted(world, build, jobId);
  world.complete(jobId);
  await deliver(world, build, "job_completed", "webhook", { jobId });
}

/** One enquiry from the call to the completed job. */
async function callToCompletion(world, build, phone, customerName) {
  await deliver(world, build, "call_received", "webhook", { phone, customerName, door: "phone" });
  const ids = world.jobsFor(phone).map((j) => j.id);
  await announce(world, build);
  for (const id of ids) await quoteToCompletion(world, build, id);
  return ids;
}

/**
 * Fifteen days pass (terms are fourteen), the chase schedule wakes Promise Watch, and the person
 * who owns chasing works their approval queue: every draft Promise Watch left there in that run.
 */
async function pastDueAndApproved(world, build) {
  world.advance(15 * DAY);
  const seen = world.escalations.length;
  const ev = await deliver(world, build, "invoice_overdue", "schedule");
  const queue = world.escalations.slice(seen).filter((e) => e.stage === "chase" && e.reason === "chase_drafted_awaiting_approval" && e.owner === OWNERS.chase);
  for (const e of queue) await approveChaseByPerson(world.ports(), { invoiceId: e.ref, trigger: ev.id }, OWNERS.chase);
  return ev;
}

const describe = (world) =>
  `${world.calls.length} port call(s); jobs ${world.jobs.length}, quotes ${world.quotes.length}, invoices ${world.invoices.map((i) => `${i.id}/${i.jobId}/${i.quoteId}/${i.status}`).join(" ") || "none"}, chases ${world.chases.map((c) => `${c.invoiceId}<-${c.trigger}`).join(" ") || "none"}, escalations ${world.escalations.map((e) => `${e.stage}:${e.reason}@${e.ref}/${e.owner}`).join(" ") || "none"}`;

const evName = (world, id) => world.eventById(id)?.name;
const writeCalls = (world) => world.calls.filter((c) => ["write_job", "draft_quote", "write_invoice"].includes(c.port));
const sendCalls = (world) => world.calls.filter((c) => c.port === "issue_notice" || c.port === "send_sms");
const chaseReleases = (world) => world.releases.filter((r) => r.kind === "chase");

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // 1. Two open jobs, two customers with the same name; one is quoted, accepted, completed,
    //    invoiced and goes overdue. The chase must land on that invoice and no other.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0501", customerName: "K. Wong", phone: "+61400000511", status: "open" },
          { id: "JS-0502", customerName: "K. Wong", phone: "+61400000512", status: "open" },
        ],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0501" });
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0502" });
      await quoteToCompletion(world, build, "JS-0501");
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const [q] = world.quotesFor("JS-0501");
      const [inv] = world.invoices;
      const searchesDownstream = world.calls.filter((c) => c.port === "read_job" && c.request?.search && c.request.eventName !== "call_received");
      return (
        world.invoices.length === 1 &&
        q?.status === "accepted" &&
        inv.jobId === "JS-0501" &&
        inv.quoteId === q.id &&
        world.invoicesFor("JS-0502").length === 0 &&
        world.chases.length === 1 &&
        world.chases[0].invoiceId === inv.id &&
        searchesDownstream.length === 0 &&
        world.invoices.every((i) => issued.has(i.jobId) && (i.quoteId === null || issued.has(i.quoteId))) &&
        world.chases.every((c) => issued.has(c.invoiceId))
      );
    },
    describe,
  },
  {
    checkId: "one-job-per-enquiry",
    // 2. The same number rings at 7pm and fills in the web form at 9pm. (The intake stand-in's hop.)
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000221", customerName: "R. Patel", door: "phone" });
      world.advance(2 * 60 * 60_000);
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000221", customerName: "R. Patel", door: "web" });
    },
    holds: (world) => {
      const jobs = world.jobsFor("+61400000221");
      const [first, second] = world.enquiries;
      const readFirst = world.calls.every(
        (c, i) =>
          c.port !== "write_job" ||
          world.calls.slice(0, i).some((r) => r.port === "read_job" && r.request?.search?.phone === "+61400000221" && r.request.search.status === "open"),
      );
      return jobs.length === 1 && Boolean(first) && Boolean(second) && !first.duplicateOf && second.duplicateOf === jobs[0].id && readFirst;
    },
    describe,
  },
  {
    checkId: "no-external-id-no-write",
    // 3. Three enquiries through the whole path: the first job's quote write and the second job's
    //    invoice write come back with no id; the third goes through, so the chase hop does run.
    //    Job ids in the stub run JS-1001, JS-1002, JS-1003.
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: async (build, world) => {
      await callToCompletion(world, build, "+61400000331", "A. Null-quote");
      await callToCompletion(world, build, "+61400000332", "B. Null-invoice");
      await callToCompletion(world, build, "+61400000333", "C. Clean");
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const quoteFailed = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && e.reason === "write_failed");
      const invoiceFailed = world.escalations.some((e) => e.stage === "invoice" && e.ref === "JS-1002" && e.reason === "write_failed" && e.owner === world.owners.invoice);
      const nothingForA = world.quotesFor("JS-1001").length === 0 && world.invoicesFor("JS-1001").length === 0;
      const nothingForB = world.invoicesFor("JS-1002").length === 0;
      const [clean] = world.invoicesFor("JS-1003");
      const onlyCleanChased = world.chases.length === 1 && world.chases[0].invoiceId === clean?.id && chaseReleases(world).every((r) => r.id === clean?.id);
      const noInvented =
        world.invoices.every((i) => i.jobId && issued.has(i.jobId)) &&
        world.sends.every((s) => s.id && issued.has(s.id)) &&
        world.releases.every((r) => r.id && issued.has(r.id));
      return quoteFailed && invoiceFailed && nothingForA && nothingForB && onlyCleanChased && noInvented;
    },
    describe,
  },
  {
    checkId: "the-chain-carries-the-id",
    // 4. One enquiry from the call to the chase.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await callToCompletion(world, build, "+61400000441", "C. Chain");
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      if (world.jobs.length !== 1 || world.quotes.length !== 1 || world.invoices.length !== 1 || world.chases.length !== 1) return false;
      const [job] = world.jobs;
      const [quote] = world.quotes;
      const [inv] = world.invoices;
      const [chase] = world.chases;
      const chaseAt = world.calls.findIndex((c) => c.port === "send_sms" && c.request?.send === "chase");
      const ledgerReadBefore = world.calls.slice(0, chaseAt).some((c) => c.port === "read_ledger" && (c.response?.overdue ?? []).includes(chase.invoiceId));
      return quote.jobId === job.id && inv.jobId === job.id && inv.quoteId === quote.id && chase.invoiceId === inv.id && chaseAt > 0 && ledgerReadBefore;
    },
    describe,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // 5. Two enquiries through the whole path; the first quote write answers "Quote created" and stores nothing.
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: async (build, world) => {
      await callToCompletion(world, build, "+61400000551", "D. Phantom");
      await callToCompletion(world, build, "+61400000552", "E. Real");
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      const [ghost] = world.phantomIds;
      if (!ghost) return false;
      const escalated = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && (e.detail ?? "").includes(ghost));
      const ghostUntouched = !world.releases.some((r) => r.id === ghost) && !world.sends.some((s) => s.id === ghost) && world.invoicesFor("JS-1001").length === 0;
      const people = new Set(Object.values(world.owners));
      const ruleName = world.releaseRule?.name;
      const sends = sendCalls(world);
      const gated = sends.every((s) => {
        const before = world.calls.slice(0, world.calls.indexOf(s));
        const id = s.request.id;
        const readBack = before.some(
          (c) =>
            (c.port === "read_job" && c.request?.quote === id && c.response?.id === id) ||
            (c.port === "read_ledger" && c.request?.invoice === id && c.response?.id === id),
        );
        const released = before.some(
          (c) => c.port === "gate" && c.request.release === s.request.send && c.request.id === id && ((c.request.person && people.has(c.request.person)) || (c.request.rule && c.request.rule === ruleName)),
        );
        return readBack && released;
      });
      // A chase is released by the person named for chasing, never by a rule: Promise Watch drafts.
      const chaseByPerson = chaseReleases(world).length === 1 && chaseReleases(world).every((r) => r.person === world.owners.chase && !r.rule);
      return escalated && ghostUntouched && gated && chaseByPerson && world.chases.length === 1;
    },
    describe,
  },
  {
    checkId: "named-unattended-trigger",
    // 6. The whole path as events, plus a chat message asking for the client to be chased now.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      const phone = "+61400000661";
      await deliver(world, build, "call_received", "webhook", { phone, customerName: "F. Event", door: "phone" });
      await announce(world, build);
      const [job] = world.jobsFor(phone);
      await quoteToCompletion(world, build, job.id);
      world.advance(15 * DAY);
      await deliver(world, build, "chat_message", "chat", { text: `Chase the invoice on ${job.id} right now`, jobId: job.id });
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      const KIND = { write_job: "call_received", draft_quote: "job_created", write_invoice: "job_completed" };
      const unattended = (id) => ["webhook", "schedule", "poll"].includes(world.eventById(id)?.via);
      const writesOk = writeCalls(world).every((c) => unattended(c.request.trigger) && evName(world, c.request.trigger) === KIND[c.port]);
      const chasesOk = world.chases.every((c) => unattended(c.trigger) && evName(world, c.trigger) === "invoice_overdue");
      const chat = world.delivered.find((e) => e.name === "chat_message");
      const nothingOnChat = !world.calls.some((c) => c.request?.event === chat?.id && c.port !== "read_rule" && c.port !== "read_ledger" && c.port !== "read_job");
      const noChat = ![...writeCalls(world).map((c) => c.request.trigger), ...world.chases.map((c) => c.trigger), ...world.sends.map((s) => s.trigger)].includes(chat?.id);
      const draftedOnChat = world.escalations.some((e) => e.reason === "chase_drafted_awaiting_approval" && (e.detail ?? "").includes(chat?.id ?? "?"));
      const allFour = world.jobs.length === 1 && world.quotes.length === 1 && world.invoices.length === 1 && world.chases.length === 1;
      const named =
        evName(world, world.jobs[0]?.trigger) === "call_received" && evName(world, world.quotes[0]?.trigger) === "job_created" && evName(world, world.invoices[0]?.trigger) === "job_completed";
      return writesOk && chasesOk && noChat && nothingOnChat && !draftedOnChat && allFour && named;
    },
    describe,
  },
  {
    checkId: "exception-owner-travels",
    // 7. Two jobs complete: one already carries an open exception the quotes person set, the
    //    other's invoice write comes back with no id. A third is invoiced cleanly, then the
    //    quotes person flags it ("client disputes the work") before it goes overdue: the chase
    //    hop must stop on that and name that person.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0771", customerName: "G. Held", phone: "+61400000771", status: "complete", exception: { reason: "disputed_scope", owner: OWNERS.quote } },
          { id: "JS-0772", customerName: "H. Null", phone: "+61400000772", status: "complete" },
          { id: "JS-0773", customerName: "I. Flagged", phone: "+61400000773", status: "open" },
        ],
        nullInvoiceFor: ["JS-0772"],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0771" });
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0772" });
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0772" }); // a retried webhook
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0773" });
      await quoteToCompletion(world, build, "JS-0773");
      // The person who owns quotes flags the job on the record itself.
      world.ports().escalate({ stage: "quote", ref: "JS-0773", reason: "client_disputes_work", owner: OWNERS.quote });
      await pastDueAndApproved(world, build);
    },
    holds: (world) => {
      const named = new Set(Object.values(world.owners));
      const hold771 = world.escalations.some((e) => e.ref === "JS-0771" && e.reason === "held_open_exception" && e.owner === OWNERS.quote);
      const failed = world.escalations.some((e) => e.ref === "JS-0772" && e.stage === "invoice" && e.reason === "write_failed" && e.owner === world.owners.invoice);
      const owned = world.escalations.every((e) => e.owner && named.has(e.owner));
      const travels = world.job("JS-0772")?.exception?.owner === world.owners.invoice && world.job("JS-0771")?.exception?.owner === OWNERS.quote;
      const noSecondWrite = world.calls.filter((c) => c.port === "write_invoice" && c.request.jobId === "JS-0772").length === 1;
      const [inv773] = world.invoicesFor("JS-0773");
      const chaseHeld = world.escalations.some((e) => e.stage === "chase" && e.ref === "JS-0773" && e.reason === "held_open_exception" && e.owner === OWNERS.quote);
      const notChased = Boolean(inv773) && inv773.status === "sent" && world.chases.length === 0 && chaseReleases(world).length === 0;
      const noDraft = !world.escalations.some((e) => e.reason === "chase_drafted_awaiting_approval");
      return world.invoicesFor("JS-0771").length === 0 && world.invoicesFor("JS-0772").length === 0 && hold771 && failed && owned && travels && noSecondWrite && chaseHeld && notChased && noDraft;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 8. Not a runtime property. Never scored green on a declaration.
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe: () =>
      "Declared: the code is public in mesh/nodes/promise-watch and maintained by AI Pathway (digitalgym). The chase schedule, the inbox watch and every ledger read run on the business's own Gmail and ledger accounts. Not scored: the business attaches who else can explain it.",
  },
];

// Check 9 runs only on the business's own job system and ledger, and reports with_us on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CashSeamWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

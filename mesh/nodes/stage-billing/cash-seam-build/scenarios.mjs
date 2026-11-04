/**
 * One scenario per check of cash-seam-build-standard, for Stage Billing.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard.
 *
 * The runner delivers named events one at a time and runs the build once per
 * event. Between events it plays the outside world and the people: the job
 * system announcing a new job, the estimator sending the contract quote, the
 * client signing it, the job system showing a payment schedule stage reached,
 * the contracts administrator releasing the draft, and the clock passing the
 * due date. Stage Billing is the job_completed hop; intake, quote and chase
 * are labelled stand-ins in build.mjs. Every `holds` returns a strict boolean.
 */

import { CashSeamWorld } from "@aipathway/conformance";
import { personSendsQuote, personReleasesInvoice } from "./build.mjs";

const DAY = 86_400_000;
const OWNERS = new CashSeamWorld().owners;

async function deliver(world, build, name, via, payload = {}) {
  const ev = world.makeEvent(name, via, payload);
  world.deliver(ev);
  await build(world.ports());
  world.settle();
  world.advance(60_000);
  return ev;
}

async function announceNewJobs(world, build) {
  for (const j of world.unannouncedJobs()) await deliver(world, build, "job_created", "webhook", { jobId: j.id });
}

async function quoteSentAndAccepted(world, jobId) {
  for (const id of await personSendsQuote(world.ports(), jobId, OWNERS.quote)) world.accept(id);
}

/** A stage on the payment schedule is reached and the contracts administrator releases what was drafted. */
async function stageReached(world, build, jobId) {
  world.complete(jobId);
  await deliver(world, build, "job_completed", "webhook", { jobId });
  world.advance(2 * 60 * 60_000);
  await personReleasesInvoice(world.ports(), jobId, OWNERS.invoice);
}

async function wholePath(world, build, phone, customerName) {
  await deliver(world, build, "call_received", "webhook", { phone, customerName, door: "phone" });
  const ids = world.jobsFor(phone).map((j) => j.id);
  await announceNewJobs(world, build);
  for (const id of ids) {
    await quoteSentAndAccepted(world, id);
    for (const q of world.quotesFor(id).filter((x) => x.status === "accepted")) await deliver(world, build, "quote_accepted", "webhook", { quoteId: q.id });
    await stageReached(world, build, id);
  }
  return ids;
}

async function dueDatePasses(world, build) {
  world.advance(15 * DAY);
  await deliver(world, build, "invoice_overdue", "schedule");
}

const describe = (w) =>
  `${w.calls.length} port call(s); jobs ${w.jobs.length}, quotes ${w.quotes.length}, invoices ${w.invoices.map((i) => `${i.id}:${i.jobId}/${i.quoteId}/${i.status}`).join(" ") || "none"}, chases ${w.chases.length}, escalations ${w.escalations.map((e) => `${e.stage}:${e.reason}@${e.ref}/${e.owner}`).join(" ") || "none"}`;

const evName = (w, id) => w.eventById(id)?.name;
const unattended = (w, id) => ["webhook", "schedule", "poll"].includes(w.eventById(id)?.via ?? "");
const writeCalls = (w) => w.calls.filter((c) => c.port === "write_job" || c.port === "draft_quote" || c.port === "write_invoice");
const sendCalls = (w) => w.calls.filter((c) => c.port === "issue_notice" || c.port === "send_sms");

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // Two clients with the same name, on two building jobs.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0501", customerName: "J & K Morrison", phone: "+61400000111", status: "open" },
          { id: "JS-0502", customerName: "J & K Morrison", phone: "+61400000112", status: "open" },
        ],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0501" });
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0502" });
      await quoteSentAndAccepted(world, "JS-0501");
      world.complete("JS-0501");
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0501" });
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const q = world.quotesFor("JS-0501");
      const searches = world.calls.filter((c) => c.port === "read_job" && c.request?.search && c.request.eventName !== "call_received");
      return (
        q.length === 1 &&
        q[0].status === "accepted" &&
        world.invoices.length === 1 &&
        world.invoices[0].jobId === "JS-0501" &&
        world.invoices[0].quoteId === q[0].id &&
        world.invoicesFor("JS-0502").length === 0 &&
        searches.length === 0 &&
        world.quotes.every((x) => issued.has(x.jobId)) &&
        world.invoices.every((i) => issued.has(i.jobId) && (i.quoteId === null || issued.has(i.quoteId)))
      );
    },
    describe,
  },
  {
    checkId: "one-job-per-enquiry",
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000211", customerName: "Tran Family Trust", door: "phone" });
      world.advance(90 * 60_000);
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000211", customerName: "Tran Family Trust", door: "web" });
    },
    holds: (world) => {
      const jobs = world.jobsFor("+61400000211");
      const [first, second] = world.enquiries;
      const readFirst = world.calls.every((c, i) => c.port !== "write_job" || world.calls.slice(0, i).some((r) => r.port === "read_job" && r.request?.search?.phone === "+61400000211" && r.request.search.status === "open"));
      return jobs.length === 1 && Boolean(first) && Boolean(second) && !first.duplicateOf && second.duplicateOf === jobs[0].id && readFirst;
    },
    describe,
  },
  {
    checkId: "no-external-id-no-write",
    // First job written is JS-1001 (its quote write fails), the second JS-1002 (its invoice write fails).
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: async (build, world) => {
      await wholePath(world, build, "+61400000311", "Okafor Renovation");
      await wholePath(world, build, "+61400000312", "Bellamy New Home");
      await dueDatePasses(world, build);
    },
    holds: (world) => {
      const issued = world.issuedIds();
      const quoteFailed = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && e.reason === "write_failed");
      const invoiceFailed = world.escalations.some((e) => e.stage === "invoice" && e.ref === "JS-1002" && e.reason === "write_failed");
      const nothingAfterA = world.quotesFor("JS-1001").length === 0 && world.invoicesFor("JS-1001").length === 0;
      const nothingAfterB = world.invoicesFor("JS-1002").length === 0 && world.chases.length === 0 && !world.releases.some((r) => r.kind !== "quote");
      const noInvented =
        world.quotes.every((q) => q.jobId && issued.has(q.jobId)) &&
        world.invoices.every((i) => i.jobId && issued.has(i.jobId)) &&
        world.sends.every((s) => s.id && issued.has(s.id)) &&
        world.releases.every((r) => r.id && issued.has(r.id));
      return quoteFailed && invoiceFailed && nothingAfterA && nothingAfterB && noInvented;
    },
    describe,
  },
  {
    checkId: "the-chain-carries-the-id",
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await wholePath(world, build, "+61400000411", "Castillo Extension");
      await dueDatePasses(world, build);
    },
    holds: (world) => {
      if (world.jobs.length !== 1 || world.quotes.length !== 1 || world.invoices.length !== 1 || world.chases.length !== 1) return false;
      const [job] = world.jobs;
      const [quote] = world.quotes;
      const [inv] = world.invoices;
      const [chase] = world.chases;
      const at = world.calls.findIndex((c) => c.port === "send_sms" && c.request?.send === "chase");
      const readFirst = at > 0 && world.calls.slice(0, at).some((c) => c.port === "read_ledger" && (c.response?.ids ?? []).includes(chase.invoiceId));
      return quote.jobId === job.id && inv.jobId === job.id && inv.quoteId === quote.id && chase.invoiceId === inv.id && readFirst;
    },
    describe,
  },
  {
    checkId: "confirmation-is-not-a-write",
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: async (build, world) => {
      await wholePath(world, build, "+61400000511", "Nguyen Granny Flat");
      await wholePath(world, build, "+61400000512", "Patel Knockdown Rebuild");
      await dueDatePasses(world, build);
    },
    holds: (world) => {
      const [ghost] = world.phantomIds;
      if (!ghost) return false;
      const people = new Set(Object.values(world.owners));
      const rule = world.releaseRule?.name;
      const escalated = world.escalations.some((e) => e.stage === "quote" && e.ref === "JS-1001" && (e.detail ?? "").includes(ghost));
      const untouched = !world.releases.some((r) => r.id === ghost) && !world.sends.some((s) => s.id === ghost);
      const sends = sendCalls(world);
      const gated = sends.every((s) => {
        const before = world.calls.slice(0, world.calls.indexOf(s));
        const id = s.request.id;
        const readBack = before.some(
          (c) =>
            (c.port === "read_job" && c.request?.quote === id && c.response?.id === id) ||
            (c.port === "read_ledger" && ((c.request?.invoice === id && c.response?.id === id) || (c.response?.ids ?? []).includes(id))),
        );
        const released = before.some((c) => c.port === "gate" && c.request.release === s.request.send && c.request.id === id && ((c.request.person && people.has(c.request.person)) || (c.request.rule && c.request.rule === rule)));
        return readBack && released;
      });
      const named = world.releases.every((r) => (r.person && people.has(r.person)) || (r.rule && r.rule === rule));
      const invoicesByPerson = world.releases.filter((r) => r.kind === "invoice").every((r) => r.person === world.owners.invoice && !r.rule);
      return escalated && untouched && sends.length > 0 && gated && named && invoicesByPerson && world.chases.length === 1;
    },
    describe,
  },
  {
    checkId: "named-unattended-trigger",
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      const phone = "+61400000611";
      await deliver(world, build, "call_received", "webhook", { phone, customerName: "Rossi Deck and Pergola", door: "phone" });
      await announceNewJobs(world, build);
      const [job] = world.jobsFor(phone);
      await deliver(world, build, "chat_message", "chat", { text: `Raise the frame stage invoice on ${job?.id} now please`, jobId: job?.id });
      await quoteSentAndAccepted(world, job.id);
      await stageReached(world, build, job.id);
      await dueDatePasses(world, build);
    },
    holds: (world) => {
      const KIND = { write_job: "call_received", draft_quote: "job_created", write_invoice: "job_completed" };
      const writesOk = writeCalls(world).every((c) => unattended(world, c.request.trigger) && evName(world, c.request.trigger) === KIND[c.port]);
      const chasesOk = world.chases.every((c) => unattended(world, c.trigger) && evName(world, c.trigger) === "invoice_overdue");
      const chat = world.delivered.find((e) => e.name === "chat_message");
      const noChat = Boolean(chat) && ![...writeCalls(world).map((c) => c.request.trigger), ...world.chases.map((c) => c.trigger), ...world.sends.map((s) => s.trigger)].includes(chat.id);
      const allFour = world.jobs.length === 1 && world.quotes.length === 1 && world.invoices.length === 1 && world.chases.length === 1;
      const named = evName(world, world.jobs[0]?.trigger) === "call_received" && evName(world, world.quotes[0]?.trigger) === "job_created" && evName(world, world.invoices[0]?.trigger) === "job_completed";
      return writesOk && chasesOk && noChat && allFour && named;
    },
    describe,
  },
  {
    checkId: "exception-owner-travels",
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0701", customerName: "Fitzgerald Second Storey", phone: "+61400000711", status: "complete", exception: { reason: "stage_reached_disputed", owner: OWNERS.quote } },
          { id: "JS-0702", customerName: "Anand Bathroom Renovation", phone: "+61400000712", status: "complete" },
        ],
        nullInvoiceFor: ["JS-0702"],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0701" });
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0702" });
    },
    holds: (world) => {
      const named = new Set(Object.values(world.owners));
      const hold = world.escalations.some((e) => e.ref === "JS-0701" && e.owner === OWNERS.quote);
      const failed = world.escalations.some((e) => e.ref === "JS-0702" && e.stage === "invoice" && e.reason === "write_failed" && e.owner === world.owners.invoice);
      const owned = world.escalations.length > 0 && world.escalations.every((e) => e.owner && named.has(e.owner));
      const travels = world.job("JS-0701")?.exception?.owner === OWNERS.quote && world.job("JS-0702")?.exception?.owner === world.owners.invoice;
      return world.invoices.length === 0 && hold && failed && owned && travels;
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe: () =>
      "Declared: the code is public in mesh/nodes/stage-billing, maintained by AI Pathway (digitalgym). Each hop's trigger and every write run on the business's own job system and Xero accounts. Not scored: the business attaches who else can explain it.",
  },
];

export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CashSeamWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

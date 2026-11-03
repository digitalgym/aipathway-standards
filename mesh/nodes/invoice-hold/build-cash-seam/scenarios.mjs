/**
 * One scenario per check of cash-seam-build-standard, for Invoice Hold.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`
 * from https://aipathway.com.au/explore-ai/cash-seam-build-standard and filled
 * in here. The checks are fetched at run time.
 *
 * The drive delivers named events one at a time and runs the build once per
 * event, and in between plays the outside world: the job system announcing a
 * job, a person in the office sending the drafted quote, the customer
 * accepting, the renovator marking the job complete, and the clock passing the
 * due date. Invoice Hold is the job_completed hop; the others are the labelled
 * stand-ins in build.mjs. Every `holds` reads the world and returns a boolean.
 */

import { CashSeamWorld } from "@aipathway/conformance";
import { officeSendsQuote } from "./build.mjs";

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

async function announce(world, build) {
  for (const j of world.unannouncedJobs()) await deliver(world, build, "job_created", "webhook", { jobId: j.id });
}

async function quoteAccepted(world, build, jobId) {
  for (const id of await officeSendsQuote(world.ports(), jobId, OWNERS.quote)) {
    world.accept(id);
    await deliver(world, build, "quote_accepted", "webhook", { quoteId: id });
  }
}

/** One enquiry from the call through to the completed job. */
async function callToComplete(world, build, phone, customerName) {
  await deliver(world, build, "call_received", "webhook", { phone, customerName, door: "phone" });
  const ids = world.jobsFor(phone).map((j) => j.id);
  await announce(world, build);
  for (const id of ids) {
    await quoteAccepted(world, build, id);
    world.complete(id);
    await deliver(world, build, "job_completed", "webhook", { jobId: id });
  }
  return ids;
}

async function pastDue(world, build) {
  world.advance(15 * DAY);
  await deliver(world, build, "invoice_overdue", "schedule");
}

const describe = (w) =>
  `${w.calls.length} port call(s); jobs ${w.jobs.length}, quotes ${w.quotes.length}, invoices ${w.invoices.map((i) => `${i.id}/${i.jobId}/${i.quoteId}/${i.status}`).join(" ") || "none"}, chases ${w.chases.length}, escalations ${w.escalations.map((e) => `${e.stage}:${e.reason}@${e.ref}/${e.owner}`).join(" ") || "none"}`;

const writes = (w) => w.calls.filter((c) => ["write_job", "draft_quote", "write_invoice"].includes(c.port));
const sends = (w) => w.calls.filter((c) => c.port === "issue_notice" || c.port === "send_sms");
const releasedBefore = (w, kind, id, at) =>
  w.calls.slice(0, at).some((c) => c.port === "gate" && c.request.release === kind && c.request.id === id && (c.request.person || c.request.rule));

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // Two open renovation jobs for two customers both called "J. Murphy"; one is quoted, accepted, completed.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0601", customerName: "J. Murphy", phone: "+61400000611", status: "open" },
          { id: "JS-0602", customerName: "J. Murphy", phone: "+61400000612", status: "open" },
        ],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0601" });
      await deliver(world, build, "job_created", "webhook", { jobId: "JS-0602" });
      await quoteAccepted(world, build, "JS-0601");
      world.complete("JS-0601");
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0601" });
    },
    holds: (w) => {
      const issued = w.issuedIds();
      const [q] = w.quotesFor("JS-0601");
      const downstreamSearch = w.calls.some((c) => c.port === "read_job" && c.request?.search && c.request.eventName !== "call_received");
      return (
        w.invoices.length === 1 &&
        q?.status === "accepted" &&
        w.invoices[0].jobId === "JS-0601" &&
        w.invoices[0].quoteId === q.id &&
        w.invoicesFor("JS-0602").length === 0 &&
        !downstreamSearch &&
        w.invoices.every((i) => issued.has(i.jobId) && (i.quoteId === null || issued.has(i.quoteId))) &&
        w.quotes.every((x) => issued.has(x.jobId))
      );
    },
    describe,
  },
  {
    checkId: "one-job-per-enquiry",
    // The same number rings at 6pm and fills in the web form at 8pm. (The intake stand-in's hop.)
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000331", customerName: "A. Costa", door: "phone" });
      world.advance(2 * 3_600_000);
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000331", customerName: "A. Costa", door: "web" });
    },
    holds: (w) => {
      const jobs = w.jobsFor("+61400000331");
      const [, second] = w.enquiries;
      const readFirst = w.calls.every(
        (c, i) => c.port !== "write_job" || "attach" in c.request || w.calls.slice(0, i).some((r) => r.port === "read_job" && r.request?.search?.phone === c.request.phone && r.request.search.status === "open"),
      );
      return jobs.length === 1 && second?.duplicateOf === jobs[0].id && readFirst;
    },
    describe,
  },
  {
    checkId: "no-external-id-no-write",
    // The whole chain for two customers: the quote write fails for one, the invoice write for the other.
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: async (build, world) => {
      await callToComplete(world, build, "+61400000101", "B. Singh");
      await callToComplete(world, build, "+61400000102", "C. Lowe");
      await pastDue(world, build);
    },
    holds: (w) => {
      const qFail = w.escalations.some((e) => e.ref === "JS-1001" && e.reason === "write_failed" && e.stage === "quote");
      const iFail = w.escalations.some((e) => e.ref === "JS-1002" && e.reason === "write_failed" && e.stage === "invoice");
      const nothingDownstream =
        w.quotesFor("JS-1001").length === 0 &&
        w.invoicesFor("JS-1001").length === 0 &&
        w.invoicesFor("JS-1002").length === 0 &&
        w.sends.every((s) => s.id && w.issuedIds().has(s.id)) &&
        w.chases.length === 0;
      return qFail && iFail && nothingDownstream && w.invoices.every((i) => i.jobId && w.issuedIds().has(i.jobId));
    },
    describe,
  },
  {
    checkId: "the-chain-carries-the-id",
    // One bathroom renovation through the whole path: call, quote accepted, complete (the
    // completion webhook retried once, as job systems do), overdue.
    world: () => new CashSeamWorld(),
    drive: async (build, world) => {
      const [id] = await callToComplete(world, build, "+61400000441", "D. Nguyen");
      await deliver(world, build, "job_completed", "webhook", { jobId: id });
      await pastDue(world, build);
    },
    holds: (w) => {
      if (w.jobs.length !== 1 || w.quotes.length !== 1 || w.invoices.length !== 1 || w.chases.length !== 1) return false;
      const [j] = w.jobs;
      const [q] = w.quotes;
      const [inv] = w.invoices;
      const [ch] = w.chases;
      const chaseAt = w.calls.findIndex((c) => c.port === "send_sms");
      const readFirst = w.calls.slice(0, chaseAt).some((c) => c.port === "read_ledger" && (c.response?.overdue ?? []).includes(inv.id));
      return q.jobId === j.id && inv.jobId === j.id && inv.quoteId === q.id && ch.invoiceId === inv.id && readFirst;
    },
    describe,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // The whole chain twice; one quote write answers "Quote created" with an id and stores nothing.
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: async (build, world) => {
      await callToComplete(world, build, "+61400000551", "E. Park");
      await callToComplete(world, build, "+61400000552", "F. Hale");
      await pastDue(world, build);
    },
    holds: (w) => {
      const ghost = w.phantomIds[0];
      if (!ghost) return false;
      const escalated = w.escalations.some((e) => e.ref === "JS-1001" && e.stage === "quote" && e.reason === "write_failed");
      const ghostUntouched = !w.releases.some((r) => r.id === ghost) && !w.sends.some((s) => s.id === ghost);
      const everySendChecked = sends(w).every((c) => {
        const at = w.calls.indexOf(c);
        const kind = c.request.send;
        const id = c.request.id;
        const readBack = w.calls
          .slice(0, at)
          .some((r) => (r.port === "read_job" && r.request?.quote === id && r.response) || (r.port === "read_ledger" && (r.request?.invoice === id ? r.response : (r.response?.ids ?? []).includes(id))));
        return readBack && releasedBefore(w, kind, id, at);
      });
      return escalated && ghostUntouched && everySendChecked && w.sends.length > 0;
    },
    describe,
  },
  {
    checkId: "named-unattended-trigger",
    // The chain as events with nobody in a session, plus a chat message asking for an invoice.
    world: () => new CashSeamWorld(),
    // The chat arrives after the job is marked complete and before the completion webhook,
    // so a build that acts on chat writes the invoice off the chat.
    drive: async (build, world) => {
      await deliver(world, build, "call_received", "webhook", { phone: "+61400000661", customerName: "G. Brennan", door: "phone" });
      await announce(world, build);
      const id = world.jobsFor("+61400000661")[0]?.id;
      await quoteAccepted(world, build, id);
      world.complete(id);
      await deliver(world, build, "chat_message", "chat", { text: "Can you raise an invoice for the Brennan bathroom now?", jobId: id });
      await deliver(world, build, "job_completed", "webhook", { jobId: id });
      await pastDue(world, build);
    },
    holds: (w) => {
      const right = { write_job: ["call_received"], draft_quote: ["job_created"], write_invoice: ["job_completed"] };
      const writesOk = writes(w).every((c) => {
        const ev = w.eventById(c.request.trigger);
        return ev && ev.via !== "chat" && (right[c.port] ?? []).includes(ev.name);
      });
      const chasesOk = w.chases.every((ch) => {
        const ev = w.eventById(ch.trigger);
        return ev && ev.name === "invoice_overdue" && ev.via !== "chat";
      });
      const invoiceSends = w.sends.filter((s) => s.kind === "invoice");
      const invoiceSendsOk = invoiceSends.every((s) => w.eventById(s.trigger)?.name === "job_completed");
      const allHops = w.jobs.length === 1 && w.quotes.length === 1 && w.invoices.length === 1 && w.chases.length === 1;
      return writesOk && chasesOk && invoiceSendsOk && allHops;
    },
    describe,
  },
  {
    checkId: "exception-owner-travels",
    // Two renovations complete. One carries an open exception its owner set; the other's invoice write fails.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0771", customerName: "H. Ito", phone: "+61400000771", status: "complete", exception: { reason: "defect_reported", owner: "Dan Ross" } },
          { id: "JS-0772", customerName: "K. Doyle", phone: "+61400000772", status: "complete" },
        ],
        nullInvoiceFor: ["JS-0772"],
      }),
    drive: async (build, world) => {
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0771" });
      await deliver(world, build, "job_completed", "webhook", { jobId: "JS-0772" });
    },
    holds: (w) => {
      const hold = w.escalations.some((e) => e.ref === "JS-0771" && e.owner === "Dan Ross");
      const failed = w.escalations.some((e) => e.ref === "JS-0772" && e.reason === "write_failed" && e.owner === OWNERS.invoice);
      const named = new Set([...Object.values(OWNERS), "Dan Ross"]);
      return w.invoices.length === 0 && hold && failed && w.escalations.every((e) => e.owner && named.has(e.owner));
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    world: () => new CashSeamWorld(),
    drive: () => undefined,
    holds: () => false,
    describe: () => "Declared in README.md, not scored by software.",
  },
];

export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CashSeamWorld(),
    drive: () => undefined,
    holds: () => false,
    describe,
  },
];

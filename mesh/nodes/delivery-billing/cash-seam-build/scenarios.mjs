/**
 * One scenario per check of cash-seam-build-standard, for Delivery Billing.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`
 * from https://aipathway.com.au/explore-ai/cash-seam-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The runner delivers named events one at a time and runs the build once per
 * event. Between events it plays the outside world: the job system announcing
 * a new job, the customer accepting the quote that reached them, the driver
 * marking the delivery done, and the clock passing the due date. Delivery
 * Billing is the job_completed hop; the others are stand-ins (see build.mjs).
 */

import { CashSeamWorld } from "@aipathway/conformance";

const DEFAULT_OWNERS = new CashSeamWorld().owners;

const DAY = 86_400_000;

async function deliver(w, build, name, via, payload = {}) {
  const ev = w.makeEvent(name, via, payload);
  w.deliver(ev);
  await build(w.ports());
  w.settle();
  w.advance(60_000);
  return ev;
}

async function announce(w, build) {
  for (const j of w.unannouncedJobs()) await deliver(w, build, "job_created", "webhook", { jobId: j.id });
}

/** The customer accepts every quote that reached them, and the job system says so. */
async function accepts(w, build, jobId) {
  for (const q of w.quotesFor(jobId).filter((x) => x.status === "sent")) {
    if (w.accept(q.id)) await deliver(w, build, "quote_accepted", "webhook", { quoteId: q.id });
  }
}

async function done(w, build, jobId) {
  w.complete(jobId);
  return deliver(w, build, "job_completed", "webhook", { jobId });
}

async function overdue(w, build) {
  w.advance(15 * DAY);
  return deliver(w, build, "invoice_overdue", "schedule");
}

/** One caller through the whole path, from the call to the chase. */
async function chain(w, build, phone, customerName) {
  await deliver(w, build, "call_received", "webhook", { phone, customerName, door: "phone" });
  const ids = w.jobsFor(phone).map((j) => j.id);
  await announce(w, build);
  for (const id of ids) {
    await accepts(w, build, id);
    await done(w, build, id);
  }
  return ids;
}

const writes = (w) => w.calls.map((c, i) => ({ ...c, i })).filter((c) => ["write_job", "draft_quote", "write_invoice"].includes(c.port) && !c.request.attach);
const sends = (w) => w.calls.map((c, i) => ({ ...c, i })).filter((c) => c.port === "issue_notice" || c.port === "send_sms");
const escs = (w, pred) => w.escalations.filter(pred);
const describe = (w) =>
  `jobs ${w.jobs.length}, quotes ${w.quotes.length}, invoices ${w.invoices.length}, chases ${w.chases.length}; ` +
  `escalations ${w.escalations.map((e) => `${e.stage}:${e.reason}@${e.ref}/${e.owner}`).join(" ") || "none"}; ${w.calls.length} port call(s)`;

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // 1. Two delivery jobs for two customers both called "M. Rossi". One quote
    //    is accepted and that job is delivered.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0701", customerName: "M. Rossi", phone: "+61400000701", status: "open" },
          { id: "JS-0702", customerName: "M. Rossi", phone: "+61400000702", status: "open" },
        ],
      }),
    drive: async (build, w) => {
      await deliver(w, build, "job_created", "webhook", { jobId: "JS-0701" });
      await deliver(w, build, "job_created", "webhook", { jobId: "JS-0702" });
      await accepts(w, build, "JS-0701");
      await done(w, build, "JS-0701");
    },
    holds: (w) => {
      const issued = w.issuedIds();
      const [q] = w.quotesFor("JS-0701");
      const inv = w.invoices;
      const downstreamSearch = w.calls.filter((c) => c.port === "read_job" && c.request?.search && c.request.eventName !== "call_received");
      return (
        Boolean(q) &&
        q.status === "accepted" &&
        inv.length === 1 &&
        inv[0].jobId === "JS-0701" &&
        inv[0].quoteId === q.id &&
        w.invoicesFor("JS-0702").length === 0 &&
        downstreamSearch.length === 0 &&
        w.quotes.every((x) => issued.has(x.jobId)) &&
        inv.every((i) => issued.has(i.jobId) && (i.quoteId === null || issued.has(i.quoteId)))
      );
    },
    describe,
  },
  {
    checkId: "one-job-per-enquiry",
    // 2. The same number rings at 6pm, then fills in the web form at 8pm.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000720", customerName: "Dana Wu", door: "phone" });
      w.advance(2 * 3_600_000);
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000720", customerName: "Dana Wu", door: "web" });
    },
    holds: (w) => {
      const jobs = w.jobsFor("+61400000720");
      const [first, second] = w.enquiries;
      const jobWrites = w.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.port === "write_job" && !c.request.attach);
      const searches = w.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.port === "read_job" && c.request?.search?.phone === "+61400000720");
      return (
        jobs.length === 1 &&
        Boolean(first && second) &&
        second.duplicateOf === jobs[0].id &&
        jobWrites.length === 1 &&
        jobWrites.every(({ i }) => searches.some((s) => s.i < i))
      );
    },
    describe,
  },
  {
    checkId: "no-external-id-no-write",
    // 3. Two callers. The quote write drops for the first; the invoice write
    //    drops for the second. Then the due date passes.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000731", customerName: "Ari Shah" });
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000732", customerName: "Bo Kim" });
      const [a] = w.jobsFor("+61400000731");
      const [b] = w.jobsFor("+61400000732");
      w.nullQuoteForIds = [a?.id, b?.id];
      if (a) w["nullQuoteFor"].add(a.id);
      if (b) w["nullInvoiceFor"].add(b.id);
      await announce(w, build);
      for (const j of [a, b]) if (j) await accepts(w, build, j.id);
      for (const j of [a, b]) if (j) await done(w, build, j.id);
      await overdue(w, build);
    },
    holds: (w) => {
      const [a, b] = w.nullQuoteForIds ?? [];
      if (!a || !b) return false;
      const failed = (ref, stage) => escs(w, (e) => e.ref === ref && e.stage === stage && e.reason === "write_failed").length === 1;
      const quoteOfA = w.quotesFor(a);
      const sentForA = w.sends.some((s) => s.kind === "quote" && !w.quotes.some((q) => q.id === s.id));
      return (
        failed(a, "quote") &&
        failed(b, "invoice") &&
        quoteOfA.length === 0 &&
        w.invoicesFor(a).length === 0 &&
        w.invoicesFor(b).length === 0 &&
        !sentForA &&
        w.chases.length === 0 &&
        w.sends.every((s) => s.id !== null && w.issuedIds().has(s.id)) &&
        w.invoices.every((i) => i.jobId !== null) &&
        // The second job's quote did go out and was accepted: only the invoice died.
        w.quotesFor(b).some((q) => q.status === "accepted")
      );
    },
    describe,
  },
  {
    checkId: "the-chain-carries-the-id",
    // 4. One caller through the whole path, a retried completion webhook,
    //    then the invoice goes overdue.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      const [id] = await chain(w, build, "+61400000740", "Kim Hale");
      // The job system retries the completion webhook an hour later.
      w.advance(3_600_000);
      if (id) await deliver(w, build, "job_completed", "webhook", { jobId: id });
      await overdue(w, build);
    },
    holds: (w) => {
      if (w.jobs.length !== 1 || w.quotes.length !== 1 || w.invoices.length !== 1 || w.chases.length !== 1) return false;
      const [j] = w.jobs;
      const [q] = w.quotes;
      const [inv] = w.invoices;
      const [ch] = w.chases;
      const chaseAt = w.calls.findIndex((c) => c.port === "send_sms");
      const readBefore = w.calls.slice(0, chaseAt).some((c) => c.port === "read_ledger" && (c.response?.overdue ?? []).includes(inv.id));
      return q.jobId === j.id && inv.jobId === j.id && inv.quoteId === q.id && ch.invoiceId === inv.id && readBefore;
    },
    describe,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // 5. Two callers; the quote write for the first answers "Quote created" and stores nothing.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000751", customerName: "Lu Chen" });
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000752", customerName: "Rob Ng" });
      const [a] = w.jobsFor("+61400000751");
      if (a) w["phantomQuoteFor"].add(a.id);
      await announce(w, build);
      for (const j of w.jobs) await accepts(w, build, j.id);
      for (const j of w.jobs) await done(w, build, j.id);
      await overdue(w, build);
      w.ghostJob = a?.id;
    },
    holds: (w) => {
      const ghost = w.phantomIds[0];
      if (!ghost || !w.ghostJob) return false;
      const calls = w.calls.map((c, i) => ({ ...c, i }));
      const ghostTouched = w.releases.some((r) => r.id === ghost) || w.sends.some((s) => s.id === ghost);
      const escalated = escs(w, (e) => e.ref === w.ghostJob && e.stage === "quote").length === 1;
      const everySendReadAndReleased = sends(w).every((s) => {
        const id = s.request.id;
        const readBack = calls.some((c) => c.i < s.i && ((c.port === "read_job" && c.request.quote === id && c.response) || (c.port === "read_ledger" && ((c.request.invoice === id && c.response) || (c.response?.ids ?? []).includes(id)))));
        const released = calls.some((c) => c.i < s.i && c.port === "gate" && c.request.id === id && (c.request.person || c.request.rule));
        return readBack && released;
      });
      return !ghostTouched && escalated && sends(w).length === 3 && everySendReadAndReleased;
    },
    describe,
  },
  {
    checkId: "named-unattended-trigger",
    // 6. The whole chain as events with nobody in a session, plus one chat
    //    message asking for the invoice to be raised before the completion
    //    webhook has arrived.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await deliver(w, build, "call_received", "webhook", { phone: "+61400000760", customerName: "Tess Byrne" });
      await announce(w, build);
      const [j] = w.jobsFor("+61400000760");
      if (j) await accepts(w, build, j.id);
      // The driver has marked it done in the job system; the webhook is still in flight.
      if (j) w.complete(j.id);
      await deliver(w, build, "chat_message", "chat", { text: "can you raise the invoice for Tess now", jobId: j?.id });
      if (j) await deliver(w, build, "job_completed", "webhook", { jobId: j.id });
      await overdue(w, build);
    },
    holds: (w) => {
      const hopFor = { write_job: "call_received", draft_quote: "job_created", write_invoice: "job_completed" };
      const writesOk = writes(w).every((c) => {
        const ev = w.eventById(c.request.trigger);
        return ev && ev.via !== "chat" && ev.name === hopFor[c.port];
      });
      const chasesOk = w.chases.length === 1 && w.chases.every((c) => w.eventById(c.trigger)?.name === "invoice_overdue");
      const allHops = w.jobs.length === 1 && w.quotes.length === 1 && w.invoices.length === 1 && w.chases.length === 1;
      const chat = w.delivered.find((e) => e.via === "chat");
      const chatActed = chat ? w.calls.some((c) => c.request?.trigger === chat.id) : true;
      return allHops && writesOk && chasesOk && !chatActed;
    },
    describe,
  },
  {
    checkId: "exception-owner-travels",
    // 7. Two delivery jobs complete. One carries an exception the yard manager
    //    set (wrong drop address); the other's invoice write comes back with no id.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "JS-0771", customerName: "Ivy Park", phone: "+61400000771", status: "open", exception: { reason: "drop address disputed", owner: "Mel Ortiz" } },
          { id: "JS-0772", customerName: "Ned Ross", phone: "+61400000772", status: "open" },
        ],
        nullInvoiceFor: ["JS-0772"],
      }),
    drive: async (build, w) => {
      await done(w, build, "JS-0771");
      await done(w, build, "JS-0772");
      await overdue(w, build);
    },
    holds: (w) => {
      const hold = escs(w, (e) => e.ref === "JS-0771" && e.stage === "invoice" && e.owner === "Mel Ortiz");
      const fail = escs(w, (e) => e.ref === "JS-0772" && e.reason === "write_failed" && e.owner === DEFAULT_OWNERS.invoice);
      const named = new Set([...Object.values(w.owners), "Mel Ortiz"]);
      return (
        w.invoicesFor("JS-0771").length === 0 &&
        w.invoicesFor("JS-0772").length === 0 &&
        hold.length === 1 &&
        fail.length === 1 &&
        w.job("JS-0772")?.exception?.owner === DEFAULT_OWNERS.invoice &&
        w.escalations.every((e) => e.owner && named.has(e.owner))
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 8. A precondition, closed by evidence. Declared: the yard's accounts lead
    //    can explain it from ../build/README.md, and every hop runs on the
    //    yard's own job system, Xero and Office Voice accounts.
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not scored",
  },
];

// Runs only in production, on the yard's own job system and ledger.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 9. Real events on the real tenant. Not asserted on the stub.
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe,
  },
];

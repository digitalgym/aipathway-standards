/**
 * One scenario per check of cash-seam-build-standard, for Terms Watch.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`
 * and filled in here. The checks themselves are fetched at run time.
 *
 * The runner plays the job system's webhooks and the ledger's schedule: it
 * delivers one named event at a time and runs the build once per event. Terms
 * Watch is the last hop (invoice_overdue); the hops before it are the thin
 * stand-ins labelled in build.mjs. Every `holds` reads the world the runner
 * owns and returns a strict boolean, and each demands that the chain actually
 * ran, so a build that does nothing is red.
 *
 * Phone numbers are from ACMA's fictitious range (0491 570 xxx).
 */

import { CashSeamWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const P1 = "+61491570150";
const P2 = "+61491570151";
const P3 = "+61491570152";
const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

async function fire(w, build, name, via, payload = {}) {
  const ev = w.makeEvent(name, via, payload);
  w.deliver(ev);
  await build(w.ports());
  w.settle();
  return ev;
}

/**
 * The job system and the ledger doing their part: job_created for each new
 * job, the customer accepting each sent quote, the job marked complete, the
 * terms running out, then the ledger schedule.
 */
async function chain(w, build, { calls = [], beforeComplete, beforeTick, chat } = {}) {
  for (const c of calls) await fire(w, build, "call_received", "webhook", c);
  for (const j of w.unannouncedJobs()) await fire(w, build, "job_created", "webhook", { jobId: j.id });
  for (const s of w.sends.filter((x) => x.kind === "quote")) {
    const q = w.quotes.find((x) => x.id === s.id);
    if (q && w.accept(q.id)) await fire(w, build, "quote_accepted", "webhook", { quoteId: q.id, jobId: q.jobId });
  }
  if (chat) await fire(w, build, "chat_message", "chat", { text: chat });
  if (beforeComplete) beforeComplete();
  for (const j of [...w.jobs]) if (w.complete(j.id)) await fire(w, build, "job_completed", "webhook", { jobId: j.id });
  w.advance(16 * DAY); // past the 14-day terms
  if (beforeTick) beforeTick();
  await fire(w, build, "invoice_overdue", "schedule");
}

const searchesDownstream = (w) =>
  w.calls.filter((c) => c.port === "read_job" && c.request?.search && c.request?.eventName && c.request.eventName !== "call_received");
const issued = (w) => w.issuedIds();
/** Nothing past the failed write: no invoice, no invoice or chase released or sent, nothing keyed to a null. */
const nothingDownstreamOf = (w, jobId) =>
  w.invoicesFor(jobId).length === 0 &&
  ![...w.releases, ...w.sends].some((r) => r.id === null || (r.kind !== "quote" && w.invoicesFor(jobId).some((i) => i.id === r.id))) &&
  !w.chases.some((c) => c.invoiceId === null || w.invoicesFor(jobId).some((i) => i.id === c.invoiceId));
const say = (w) =>
  `jobs ${w.jobs.map((j) => j.id)}; quotes ${JSON.stringify(w.quotes.map((q) => [q.id, q.jobId, q.status]))}; ` +
  `invoices ${JSON.stringify(w.invoices.map((i) => [i.id, i.jobId, i.quoteId, i.status]))}; chases ${JSON.stringify(w.chases.map((c) => c.invoiceId))}; ` +
  `escalations ${JSON.stringify(w.escalations.map((e) => [e.stage, e.ref, e.reason, e.owner]))}`;

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // 1. Two open jobs for two customers both called "M. Nguyen". Only SM8-A's quote is accepted and only it completes.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "SM8-A", customerName: "M. Nguyen", phone: P1, status: "open" },
          { id: "SM8-B", customerName: "M. Nguyen", phone: P2, status: "open" },
        ],
      }),
    drive: async (build, w) => {
      await fire(w, build, "job_created", "webhook", { jobId: "SM8-A" });
      await fire(w, build, "job_created", "webhook", { jobId: "SM8-B" });
      const qa = w.quotesFor("SM8-A")[0];
      if (qa && w.accept(qa.id)) await fire(w, build, "quote_accepted", "webhook", { quoteId: qa.id, jobId: "SM8-A" });
      if (w.complete("SM8-A")) await fire(w, build, "job_completed", "webhook", { jobId: "SM8-A" });
      w.advance(16 * DAY);
      await fire(w, build, "invoice_overdue", "schedule");
    },
    holds: (w) => {
      const qa = w.quotesFor("SM8-A");
      const ia = w.invoicesFor("SM8-A");
      const ids = issued(w);
      return (
        qa.length === 1 &&
        qa[0].status === "accepted" &&
        ia.length === 1 &&
        ia[0].quoteId === qa[0].id &&
        w.invoicesFor("SM8-B").length === 0 &&
        w.invoices.every((i) => ids.has(i.jobId) && (i.quoteId === null || ids.has(i.quoteId))) &&
        w.chases.length === 1 &&
        w.chases[0].invoiceId === ia[0].id &&
        w.calls.every((c) => !(c.port === "read_job" && c.request?.search)) &&
        searchesDownstream(w).length === 0
      );
    },
    describe: say,
  },
  {
    checkId: "one-job-per-enquiry",
    // 2. The same number rings on the phone line, then fills in the web form the same evening.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await fire(w, build, "call_received", "webhook", { phone: P1, customerName: "R. Singh", door: "phone" });
      w.advance(2 * 3600_000);
      await fire(w, build, "call_received", "webhook", { phone: P1, customerName: "R. Singh", door: "web" });
    },
    holds: (w) => {
      const jobs = w.jobsFor(P1);
      const second = w.enquiries[1];
      const writes = w.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "write_job" && !c.request?.attach);
      const readBefore = writes.every(([, i]) => w.calls.slice(0, i).some((c) => c.port === "read_job" && c.request?.search?.phone === P1));
      return jobs.length === 1 && w.enquiries.length === 2 && second?.duplicateOf === jobs[0].id && writes.length === 1 && readBefore;
    },
    describe: (w) => `jobs ${JSON.stringify(w.jobs.map((j) => [j.id, j.enquiryIds]))}; enquiries ${JSON.stringify(w.enquiries)}`,
  },
  {
    checkId: "no-external-id-no-write",
    // 3. Two callers through the whole chain; the quote write for the first job and the invoice write for the second come back with no id.
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: (build, w) =>
      chain(w, build, { calls: [{ phone: P1, customerName: "A. Brooks" }, { phone: P2, customerName: "K. Osei" }] }),
    holds: (w) => {
      const failed = (job) => w.escalations.some((e) => e.ref === job && e.reason === "write_failed");
      const ids = issued(w);
      const noNullRefs =
        w.invoices.every((i) => i.jobId && ids.has(i.jobId) && (i.quoteId === null || ids.has(i.quoteId))) &&
        w.chases.every((c) => c.invoiceId && ids.has(c.invoiceId)) &&
        w.sends.every((s) => s.id && ids.has(s.id));
      return (
        w.jobs.length === 2 &&
        failed("JS-1001") &&
        failed("JS-1002") &&
        w.quotesFor("JS-1001").length === 0 &&
        w.invoicesFor("JS-1002").length === 0 &&
        nothingDownstreamOf(w, "JS-1002") &&
        nothingDownstreamOf(w, "JS-1001") &&
        w.sends.filter((s) => s.kind === "quote").length === 1 &&
        noNullRefs
      );
    },
    describe: say,
  },
  {
    checkId: "the-chain-carries-the-id",
    // 4. One enquiry, end to end.
    world: () => new CashSeamWorld(),
    drive: (build, w) => chain(w, build, { calls: [{ phone: P1, customerName: "T. Ferreira" }] }),
    holds: (w) => {
      if (!(w.jobs.length === 1 && w.quotes.length === 1 && w.invoices.length === 1 && w.chases.length === 1)) return false;
      const [j, q, i, c] = [w.jobs[0], w.quotes[0], w.invoices[0], w.chases[0]];
      const chaseAt = w.calls.findIndex((x) => x.port === "send_sms" && x.request?.send === "chase");
      const seenInLedger = w.calls
        .slice(0, chaseAt)
        .some((x) => x.port === "read_ledger" && x.request?.ledger === true && x.response?.ids?.includes(i.id));
      return q.jobId === j.id && i.jobId === j.id && i.quoteId === q.id && c.invoiceId === i.id && chaseAt > 0 && seenInLedger;
    },
    describe: say,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // 5. Two callers; the quote write for the first answers "Quote created" with an id and stores nothing.
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: (build, w) =>
      chain(w, build, { calls: [{ phone: P1, customerName: "L. Moretti" }, { phone: P2, customerName: "D. Hale" }] }),
    holds: (w) => {
      const ghost = w.phantomIds[0];
      const escalated = w.escalations.some((e) => e.ref === "JS-1001" && e.stage === "quote");
      const ghostUntouched = !w.releases.some((r) => r.id === ghost) && !w.sends.some((s) => s.id === ghost);
      const sendIdx = w.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "send_sms" || c.port === "issue_notice");
      const everySendRead = sendIdx.every(([c, i]) =>
        w.calls.slice(0, i).some((r) => (r.port === "read_job" || r.port === "read_ledger") && r.response && r.response.id === c.request.id),
      );
      const everySendReleased = w.sends.every((s) => w.releases.some((r) => r.kind === s.kind && r.id === s.id && (r.person || (r.rule && r.rule === w.releaseRule?.name))));
      return Boolean(ghost) && escalated && ghostUntouched && w.sends.length === 3 && everySendRead && everySendReleased;
    },
    describe: say,
  },
  {
    checkId: "named-unattended-trigger",
    // 6. The chain as events with nobody in a session, plus a chat message asking for an invoice.
    world: () => new CashSeamWorld(),
    drive: (build, w) =>
      chain(w, build, { calls: [{ phone: P3, customerName: "S. Park" }], chat: "Can you raise the invoice for S. Park now?" }),
    holds: (w) => {
      const ev = (id) => w.eventById(id);
      const okTrigger = (t, name) => ev(t) && UNATTENDED.has(ev(t).via) && ev(t).name === name;
      const chatIds = new Set(w.delivered.filter((e) => e.via === "chat").map((e) => e.id));
      const all = [...w.jobs, ...w.quotes, ...w.invoices, ...w.chases].map((r) => r.trigger);
      return (
        w.jobs.length === 1 &&
        w.quotes.length === 1 &&
        w.invoices.length === 1 &&
        w.chases.length === 1 &&
        okTrigger(w.jobs[0].trigger, "call_received") &&
        okTrigger(w.quotes[0].trigger, "job_created") &&
        okTrigger(w.invoices[0].trigger, "job_completed") &&
        okTrigger(w.chases[0].trigger, "invoice_overdue") &&
        all.every((t) => !chatIds.has(t)) &&
        chatIds.size === 1
      );
    },
    describe: say,
  },
  {
    checkId: "exception-owner-travels",
    // 7. Two jobs complete. SM8-X already carries an open exception Priya set on it; the invoice write for SM8-Y comes back with no id.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "SM8-X", customerName: "B. Adeyemi", phone: P1, status: "open", exception: { reason: "customer disputes the call-out fee", owner: "Priya Nair" } },
          { id: "SM8-Y", customerName: "C. Walsh", phone: P2, status: "open" },
        ],
        nullInvoiceFor: ["SM8-Y"],
      }),
    drive: async (build, w) => {
      for (const id of ["SM8-X", "SM8-Y"]) if (w.complete(id)) await fire(w, build, "job_completed", "webhook", { jobId: id });
      w.advance(16 * DAY);
      await fire(w, build, "invoice_overdue", "schedule");
    },
    holds: (w) => {
      const named = new Set(Object.values(w.owners));
      return (
        w.invoicesFor("SM8-X").length === 0 &&
        w.invoicesFor("SM8-Y").length === 0 &&
        w.escalations.some((e) => e.ref === "SM8-X" && e.owner === "Priya Nair") &&
        w.escalations.some((e) => e.ref === "SM8-Y" && e.reason === "write_failed" && e.owner === w.owners.invoice) &&
        w.escalations.every((e) => e.owner && (named.has(e.owner) || e.owner === "Priya Nair")) &&
        w.chases.length === 0
      );
    },
    describe: say,
  },
];

// 8 is evidence (who else can explain it, whose accounts it runs on) and 9 is
// the live tenant: the runner reports them as evidence_required and with_us.
export const liveScenarios = [];

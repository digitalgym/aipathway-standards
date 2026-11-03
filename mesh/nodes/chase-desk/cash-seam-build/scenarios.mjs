/**
 * One scenario per check of cash-seam-build-standard, for Chase Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init cash-seam-build-standard`
 * from https://aipathway.com.au/explore-ai/cash-seam-build-standard and filled
 * in here. The checks themselves are fetched at run time.
 *
 * The runner delivers named events one at a time, as a job system's webhooks
 * and a ledger schedule would, and runs the build once per event. Chase Desk's
 * own hop is the last one (invoice_overdue); the hops before it are the thin
 * stand-ins labelled in build.mjs. Every `holds` reads the world the runner
 * owns, its records and its recorded `calls`, and returns a strict boolean.
 *
 * Phone numbers are from ACMA's fictitious range (0491 570 xxx).
 */

import { CashSeamWorld } from "@aipathway/conformance";

const P1 = "+61491570110";
const P2 = "+61491570111";
const DAY = 86_400_000;
const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

/** Make one named event, deliver it, run the build once, let the world settle. */
async function fire(w, build, name, via, payload = {}) {
  const ev = w.makeEvent(name, via, payload);
  w.deliver(ev);
  await build(w.ports());
  w.settle();
  return ev;
}

/** The job system's job_created for every job made since the last look. */
async function jobCreatedHooks(w, build) {
  for (const j of w.unannouncedJobs()) await fire(w, build, "job_created", "webhook", { jobId: j.id });
}

/**
 * Each caller from first ring to the overdue chase. `midway` runs after the
 * acceptances; `earlyTick` fires the ledger schedule once before anything is
 * due; `beforeTick` runs once the invoices are overdue, before the schedule.
 */
async function callToChase(w, build, callers, { midway, earlyTick, beforeTick } = {}) {
  for (const c of callers) await fire(w, build, "call_received", "webhook", c);
  await jobCreatedHooks(w, build);
  for (const s of w.sends.filter((x) => x.kind === "quote")) {
    const q = w.quotes.find((x) => x.id === s.id);
    if (q && w.accept(q.id)) await fire(w, build, "quote_accepted", "webhook", { quoteId: q.id, jobId: q.jobId });
  }
  if (midway) await midway();
  for (const j of [...w.jobs]) {
    if (w.complete(j.id)) await fire(w, build, "job_completed", "webhook", { jobId: j.id });
  }
  if (earlyTick) {
    w.advance(5 * DAY); // sent, not yet due
    await fire(w, build, "invoice_overdue", "schedule");
    w.advance(11 * DAY);
  } else {
    w.advance(16 * DAY); // past the 14-day terms
  }
  if (beforeTick) await beforeTick();
  await fire(w, build, "invoice_overdue", "schedule");
}

const callIndex = (w, pred) => w.calls.findIndex(pred);
const nameOrPhoneSearch = (w) => w.calls.filter((c) => c.port === "read_job" && c.request?.search);
const evName = (w, id) => w.eventById(id)?.name;

export const scenarios = [
  {
    checkId: "identity-from-the-system-of-record",
    // 1. Two open jobs, two customers with the same name. One job's quote is
    // accepted and the job completed; the ledger schedule then runs the chase.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "SM8-A", customerName: "J. Tran", phone: P1, status: "open" },
          { id: "SM8-B", customerName: "J. Tran", phone: P2, status: "open" },
        ],
      }),
    drive: async (build, w) => {
      await fire(w, build, "job_created", "webhook", { jobId: "SM8-B" });
      const q = w.quotesFor("SM8-B")[0];
      if (q && w.accept(q.id)) await fire(w, build, "quote_accepted", "webhook", { quoteId: q.id, jobId: "SM8-B" });
      w.complete("SM8-B");
      await fire(w, build, "job_completed", "webhook", { jobId: "SM8-B" });
      w.advance(16 * DAY);
      await fire(w, build, "invoice_overdue", "schedule");
    },
    holds: (w) => {
      const issued = w.issuedIds();
      const [q] = w.quotes;
      const [inv] = w.invoices;
      const searchedDownstream = nameOrPhoneSearch(w).some((c) => evName(w, c.request.event) !== "call_received");
      return (
        w.quotes.length === 1 &&
        q.jobId === "SM8-B" &&
        w.invoices.length === 1 &&
        inv.jobId === "SM8-B" &&
        inv.quoteId === q.id &&
        issued.has(inv.quoteId) &&
        w.invoicesFor("SM8-A").length === 0 &&
        w.chases.length === 1 &&
        w.chases[0].invoiceId === inv.id &&
        !searchedDownstream
      );
    },
    describe: (w) =>
      `quotes ${JSON.stringify(w.quotes.map((q) => [q.id, q.jobId]))}; invoices ${JSON.stringify(w.invoices.map((i) => [i.id, i.quoteId, i.jobId]))}; chases ${JSON.stringify(w.chases.map((c) => c.invoiceId))}; searches ${nameOrPhoneSearch(w).length}`,
  },
  {
    checkId: "one-job-per-enquiry",
    // 2. The same number rings at night, then fills in the web form ten minutes later.
    world: () => new CashSeamWorld(),
    drive: async (build, w) => {
      await fire(w, build, "call_received", "webhook", { phone: P1, customerName: "J. Tran", door: "phone" });
      w.advance(10 * 60 * 1000);
      await fire(w, build, "call_received", "webhook", { phone: P1, customerName: "J. Tran", door: "web" });
    },
    holds: (w) => {
      const jobs = w.jobsFor(P1);
      if (jobs.length !== 1 || w.enquiries.length !== 2) return false;
      const dup = !w.enquiries[0].duplicateOf && w.enquiries[1].duplicateOf === jobs[0].id;
      const writes = w.calls.map((c, i) => [c, i]).filter(([c]) => c.port === "write_job");
      const readBeforeEachWrite = writes.every(([, i]) => w.calls.slice(0, i).some((c) => c.port === "read_job" && c.request?.search?.phone === P1));
      return dup && writes.length === 2 && readBeforeEachWrite;
    },
    describe: (w) => `${w.jobsFor(P1).length} job(s); enquiries ${JSON.stringify(w.enquiries)}`,
  },
  {
    checkId: "no-external-id-no-write",
    // 3. The whole path for two callers; the quote write for the first job and
    // the invoice write for the second come back with no external id.
    world: () => new CashSeamWorld({ nullQuoteFor: ["JS-1001"], nullInvoiceFor: ["JS-1002"] }),
    drive: (build, w) =>
      callToChase(w, build, [
        { phone: P1, customerName: "J. Tran" },
        { phone: P2, customerName: "R. Kaur" },
      ]),
    holds: (w) => {
      const failed = (ref, stage) => w.escalations.some((e) => e.ref === ref && e.stage === stage && e.reason === "write_failed" && Boolean(e.owner));
      const issued = w.issuedIds();
      const firstJobTouched =
        w.invoicesFor("JS-1001").length > 0 || [...w.releases, ...w.sends].some((x) => w.quotesFor("JS-1001").some((q) => q.id === x.id));
      const secondInvoiced = w.invoicesFor("JS-1002").length > 0 || w.releases.some((r) => r.kind === "invoice") || w.sends.some((s) => s.kind === "invoice");
      const noNullRefs = w.quotes.every((q) => q.jobId && issued.has(q.jobId)) && w.invoices.every((i) => i.jobId && issued.has(i.jobId));
      return (
        w.jobs.length === 2 &&
        failed("JS-1001", "quote") &&
        failed("JS-1002", "invoice") &&
        !firstJobTouched &&
        !secondInvoiced &&
        w.chases.length === 0 &&
        noNullRefs &&
        w.sends.every((s) => issued.has(s.id))
      );
    },
    describe: (w) => `escalations ${JSON.stringify(w.escalations.map((e) => [e.stage, e.ref, e.reason, e.owner]))}; invoices ${w.invoices.length}; chases ${w.chases.length}`,
  },
  {
    checkId: "the-chain-carries-the-id",
    // 4. One enquiry, call to chase. Chase Desk's hop must take the invoice id
    // from a ledger read, read the invoice's job by id, and re-read the invoice
    // by id, all before the chase goes.
    world: () => new CashSeamWorld(),
    // The schedule also fires once before the invoice is due: no chase then.
    drive: (build, w) => callToChase(w, build, [{ phone: P1, customerName: "J. Tran" }], { earlyTick: true }),
    holds: (w) => {
      if (w.jobs.length !== 1 || w.quotes.length !== 1 || w.invoices.length !== 1 || w.chases.length !== 1) return false;
      const [j] = w.jobs;
      const [q] = w.quotes;
      const [i] = w.invoices;
      const [ch] = w.chases;
      const at = callIndex(w, (c) => c.port === "send_sms" && c.request.send === "chase");
      const ledgerAt = w.calls.slice(0, at).findLastIndex((c) => c.port === "read_ledger" && c.request?.ledger && c.response?.overdue?.includes(ch.invoiceId));
      if (at < 0 || ledgerAt < 0) return false;
      // Between that ledger read and the chase: the job read by its id, and the invoice re-read by its id.
      const between = w.calls.slice(ledgerAt + 1, at);
      const jobById = between.some((c) => c.port === "read_job" && c.request?.job === i.jobId);
      const invoiceById = between.some((c) => c.port === "read_ledger" && c.request?.invoice === ch.invoiceId && c.response?.id === ch.invoiceId);
      return q.jobId === j.id && i.quoteId === q.id && i.jobId === j.id && ch.invoiceId === i.id && jobById && invoiceById;
    },
    describe: (w) =>
      `job ${w.jobs.map((j) => j.id)}; quote ${JSON.stringify(w.quotes.map((q) => [q.id, q.jobId]))}; invoice ${JSON.stringify(w.invoices.map((i) => [i.id, i.quoteId, i.jobId]))}; chase ${JSON.stringify(w.chases.map((c) => c.invoiceId))}`,
  },
  {
    checkId: "confirmation-is-not-a-write",
    // 5. Two callers; the first job's quote write says "Quote created" with an
    // id, and stores nothing.
    world: () => new CashSeamWorld({ phantomQuoteFor: ["JS-1001"] }),
    drive: (build, w) =>
      callToChase(w, build, [
        { phone: P1, customerName: "J. Tran" },
        { phone: P2, customerName: "R. Kaur" },
      ]),
    holds: (w) => {
      const ghost = w.phantomIds[0];
      if (!ghost) return false;
      const ghostUsed = w.releases.some((r) => r.id === ghost) || w.sends.some((s) => s.id === ghost);
      const escalated = w.escalations.some((e) => e.ref === "JS-1001" && e.stage === "quote" && Boolean(e.owner));
      const sends = w.calls.filter((c) => c.port === "issue_notice" || c.port === "send_sms");
      const backed = sends.every((s) => {
        const before = w.calls.slice(0, w.calls.indexOf(s));
        const id = s.request.id;
        const readBack = before.some(
          (c) => (c.port === "read_job" && c.request?.quote === id && c.response?.id === id) || (c.port === "read_ledger" && c.request?.invoice === id && c.response?.id === id),
        );
        const release = before.some((c) => c.port === "gate" && c.request?.id === id && c.request?.release === s.request.send && (c.request.person || c.request.rule));
        return readBack && release;
      });
      const chasedSecond = w.chases.length === 1 && w.invoicesFor("JS-1002").some((i) => i.id === w.chases[0].invoiceId);
      return !ghostUsed && escalated && sends.length === 3 && backed && chasedSecond;
    },
    describe: (w) => `phantom ${JSON.stringify(w.phantomIds)}; sends ${JSON.stringify(w.sends.map((s) => [s.kind, s.id]))}; escalations ${JSON.stringify(w.escalations.map((e) => [e.stage, e.ref, e.reason]))}`,
  },
  {
    checkId: "named-unattended-trigger",
    // 6. The whole path as events with nobody in a session, plus a chat message
    // asking for the invoice to be raised and chased now.
    world: () => new CashSeamWorld(),
    drive: (build, w) =>
      callToChase(w, build, [{ phone: P1, customerName: "J. Tran" }], {
        midway: () => fire(w, build, "chat_message", "chat", { text: "raise the invoice for J. Tran now please", jobId: "JS-1001" }),
        beforeTick: () => fire(w, build, "chat_message", "chat", { text: "J. Tran is overdue, chase them now", jobId: "JS-1001" }),
      }),
    holds: (w) => {
      const writeHop = { write_job: "call_received", draft_quote: "job_created", write_invoice: "job_completed" };
      const writes = w.calls.filter((c) => c.port in writeHop);
      const writesNamed = writes.every((c) => {
        const ev = w.eventById(c.request.trigger);
        return Boolean(ev) && UNATTENDED.has(ev.via) && ev.name === writeHop[c.port];
      });
      const sendHop = { quote: "job_created", invoice: "job_completed", chase: "invoice_overdue" };
      const sendsNamed = w.sends.every((s) => {
        const ev = w.eventById(s.trigger);
        return Boolean(ev) && UNATTENDED.has(ev.via) && ev.name === sendHop[s.kind];
      });
      const chats = w.delivered.filter((e) => e.via === "chat");
      const chatIds = new Set(chats.map((e) => e.id));
      const chatWokeNothing = chats.length === 2 && !w.calls.some((c) => chatIds.has(c.request?.trigger)) && !w.sends.some((s) => chatIds.has(s.trigger));
      const allFour = w.jobs.length === 1 && w.quotes.length === 1 && w.invoices.length === 1 && w.chases.length === 1;
      return writes.length === 3 && writesNamed && sendsNamed && chatWokeNothing && allFour;
    },
    describe: (w) =>
      `writes ${JSON.stringify(w.calls.filter((c) => ["write_job", "draft_quote", "write_invoice"].includes(c.port)).map((c) => [c.port, evName(w, c.request.trigger)]))}; sends ${JSON.stringify(w.sends.map((s) => [s.kind, evName(w, s.trigger)]))}`,
  },
  {
    checkId: "exception-owner-travels",
    // 7. Two jobs complete. One carries an open exception a person set; the
    // invoice write for the other returns no id. Then the ledger schedule runs,
    // and Chase Desk's hop must chase neither.
    world: () =>
      new CashSeamWorld({
        jobs: [
          { id: "SM8-X", customerName: "J. Tran", phone: P1, status: "open", exception: { reason: "customer disputes the call-out fee", owner: "Lena Fischer" } },
          { id: "SM8-Y", customerName: "R. Kaur", phone: P2, status: "open" },
          { id: "SM8-Z", customerName: "M. Rossi", phone: "+61491570112", status: "open" },
        ],
        nullInvoiceFor: ["SM8-Y"],
      }),
    // A third job is invoiced and sent; then, before it falls due, a person
    // opens an exception on it in the job system. The chase must not pass it.
    drive: async (build, w) => {
      for (const id of ["SM8-X", "SM8-Y", "SM8-Z"]) {
        w.complete(id);
        await fire(w, build, "job_completed", "webhook", { jobId: id });
      }
      const z = w.job("SM8-Z");
      if (z) z.exception = { reason: "customer says the work is unfinished", owner: "Lena Fischer" };
      w.advance(16 * DAY);
      await fire(w, build, "invoice_overdue", "schedule");
    },
    holds: (w) => {
      const named = new Set([...Object.values(w.owners), "Lena Fischer"]);
      const held = w.escalations.some((e) => e.ref === "SM8-X" && e.owner === "Lena Fischer");
      const failed = w.escalations.some((e) => e.ref === "SM8-Y" && e.reason === "write_failed" && e.owner === w.owners.invoice);
      const allOwned = w.escalations.length > 0 && w.escalations.every((e) => Boolean(e.owner) && named.has(e.owner));
      const nothingPast = w.invoicesFor("SM8-X").length === 0 && !w.calls.some((c) => c.port === "write_invoice" && c.request.jobId === "SM8-X");
      const travels = w.job("SM8-Y")?.exception?.owner === w.owners.invoice;
      const zInvoiced = w.invoicesFor("SM8-Z").some((i) => i.status === "sent");
      const zHeldAtChase = w.escalations.some((e) => e.ref === "SM8-Z" && e.stage === "chase" && e.owner === "Lena Fischer");
      return held && failed && allOwned && nothingPast && travels && zInvoiced && zHeldAtChase && w.chases.length === 0;
    },
    describe: (w) => `escalations ${JSON.stringify(w.escalations.map((e) => [e.ref, e.reason, e.owner]))}; invoice writes ${w.calls.filter((c) => c.port === "write_invoice").map((c) => c.request.jobId)}; chases ${w.chases.length}`,
  },
  {
    checkId: "survives-the-builder",
    // 8. A precondition, closed by evidence and never by a run. The runner
    // reports evidence_required whatever this returns.
    world: () => new CashSeamWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not run",
  },
];

// The pass test needs the business's own job system and ledger. It runs with
// us, never on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new CashSeamWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

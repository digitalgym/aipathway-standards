/**
 * One scenario per check of invoice-out-build-standard, for Delivery Billing.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-out-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The business: a landscape supply yard that delivers and lays pavers, sand
 * and edging, on a job system that issues the job id and Xero behind it. Each
 * scenario drives the build with the named events the mesh uses
 * (job.completed, schedule.tick, exception.closed) and every `holds` reads what
 * the world recorded through its ports, never the build's own memory.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";
import { OWNER } from "./build.mjs";

const HOUR = 3_600_000;

// The Xero Items book, ex GST. Odd rates on purpose, so a typed or remembered
// rate cannot match the book by luck.
const BOOK = {
  edition: "xero-items-2026-10-28",
  items: [
    { code: "DEL-METRO", description: "Metro delivery, truck and driver", rate: 96.5 },
    { code: "LAB-HR", description: "Laying labour, per hour", rate: 112.25 },
    { code: "PAVER-PAL", description: "Sandstone pavers, per pallet", rate: 641.4 },
    { code: "SAND-T", description: "Bedding sand, per tonne", rate: 87.9 },
    { code: "VAR-TRIP", description: "Variation: extra delivery trip", rate: 183.6 },
  ],
};
const RULE = { name: "Jess: under $1,000 goes out", threshold: 1000 };

const L = {
  del: { code: "DEL-METRO", qty: 1, kind: "callout", description: "Delivery to site" },
  lab2: { code: "LAB-HR", qty: 2, kind: "labour", description: "Lay pavers, two hours" },
  lab6: { code: "LAB-HR", qty: 6, kind: "labour", description: "Lay pavers, six hours" },
  pav3: { code: "PAVER-PAL", qty: 3, kind: "material", description: "Three pallets of pavers" },
  sand2: { code: "SAND-T", qty: 2, kind: "material", description: "Two tonne of sand" },
  kerb: { code: "EDGE-KERB", qty: 12, kind: "material", description: "Concrete edging, never sold before" },
  varSigned: { code: "VAR-TRIP", qty: 1, kind: "variation", description: "Second trip", signedAcceptance: "drive:acceptance/J-402-signed.pdf" },
  varUnsigned: { code: "VAR-TRIP", qty: 1, kind: "variation", description: "Second trip, agreed on the phone" },
};

const job = (id, lines, extra = {}) => ({ id, customerId: `C-${id}`, status: "complete", completedAt: "2026-09-26T00:00:00.000Z", lines, ...extra });
const openJob = (id, lines) => ({ id, customerId: `C-${id}`, status: "open", lines });

const completed = (job_id) => ({ event: "job.completed", job_id });
const tick = { event: "schedule.tick" };
const closed = (job_id, invoice_id, kind, closed_by = OWNER) => ({ event: "exception.closed", job_id, invoice_id, kind, closed_by });

const callsOf = (w, port, pred = () => true) => w.calls.map((c, i) => ({ ...c, i })).filter((c) => c.port === port && pred(c));
const creates = (w) => callsOf(w, "write_invoice", (c) => !c.request.update);
const escFor = (w, jobId, reason) =>
  callsOf(w, "escalate", (c) => c.request.reason === reason).filter((c) => {
    try {
      const d = JSON.parse(c.request.detail ?? "{}");
      return d.job_id === jobId && d.exception_owner === OWNER;
    } catch {
      return false;
    }
  });
const sendIdx = (w, invId) => callsOf(w, "issue_notice", (c) => c.request.send === invId).map((c) => c.i);
const gateFor = (w, invId) => callsOf(w, "gate", (c) => c.request.release === invId);
const total = (inv) => inv.lines.reduce((s, l) => s + l.qty * l.rate, 0);
const sameLines = (inv, jobLines) =>
  inv.lines.length === jobLines.length && jobLines.every((jl) => inv.lines.some((l) => l.code === jl.code && l.qty === jl.qty && l.kind === jl.kind));
const ratesFromBook = (inv) => inv.lines.every((l) => BOOK.items.some((b) => b.code === l.code && b.rate === l.rate));
const everySendReleased = (w) =>
  callsOf(w, "issue_notice").every((s) => gateFor(w, s.request.send).some((g) => g.i < s.i && (g.request.person || g.request.rule)));
const describe = (w) =>
  `${w.invoices.length} invoice(s) [${w.invoices.map((i) => `${i.jobId}:${i.status}${i.parkReason ? "/" + i.parkReason : ""}`).join(", ")}], ` +
  `${w.escalations.length} escalation(s), ${w.sends.length} send(s), ${w.calls.length} port call(s)`;

export const scenarios = [
  {
    checkId: "completion-is-the-trigger",
    // 1. Three delivery jobs: two marked complete today, one still on the truck.
    //    Completion events for all three (the open one is a stray), then a tick.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [openJob("J-101", [L.del, L.sand2]), openJob("J-102", [L.del, L.pav3]), openJob("J-103", [L.del])] }),
    drive: async (build, w) => {
      w.complete("J-101");
      w.complete("J-102");
      await build(w.ports(), completed("J-101"));
      await build(w.ports(), completed("J-103"));
      w.advance(HOUR);
      await build(w.ports(), completed("J-102"));
      await build(w.ports(), tick);
    },
    holds: (w) => {
      if (w.invoices.length !== 2 || w.invoicesFor("J-101").length !== 1 || w.invoicesFor("J-102").length !== 1 || w.invoicesFor("J-103").length !== 0) return false;
      const reads = callsOf(w, "read_job", (c) => c.request.jobs === true);
      return creates(w).every((wr) => reads.some((r) => r.i < wr.i && (r.response?.complete ?? []).includes(wr.request.jobId)));
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // 2. A complete job with a delivery callout, two hours laying and three pallets.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("J-201", [L.del, L.lab2, L.pav3])] }),
    drive: (build, w) => build(w.ports(), completed("J-201")),
    holds: (w) => {
      const [inv] = w.invoicesFor("J-201");
      return Boolean(inv) && w.invoices.length === 1 && inv.status !== "parked" && sameLines(inv, [L.del, L.lab2, L.pav3]);
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // 3. One job fully in the book, one carrying edging the yard has never sold.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("J-301", [L.del, L.sand2, L.lab2]), job("J-302", [L.del, L.kerb, L.lab2])] }),
    drive: (build, w) => build(w.ports(), tick),
    holds: (w) => {
      const [known] = w.invoicesFor("J-301");
      const [unknown] = w.invoicesFor("J-302");
      if (!known || !unknown) return false;
      const bookRead = callsOf(w, "read_pricebook")[0]?.i ?? Infinity;
      const firstWrite = callsOf(w, "write_invoice")[0]?.i ?? -1;
      return (
        bookRead < firstWrite &&
        ratesFromBook(known) &&
        sameLines(known, [L.del, L.sand2, L.lab2]) &&
        unknown.status === "parked" &&
        unknown.parkReason === "not_in_pricebook" &&
        !unknown.lines.some((l) => l.code === "EDGE-KERB") &&
        ratesFromBook(unknown) &&
        escFor(w, "J-302", "not_in_pricebook").length >= 1 &&
        sendIdx(w, unknown.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // 4. Two jobs with a second-trip variation: one signed, one agreed on the phone.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("J-402", [L.del, L.varSigned]), job("J-403", [L.del, L.varUnsigned])] }),
    drive: async (build, w) => {
      await build(w.ports(), completed("J-402"));
      await build(w.ports(), completed("J-403"));
    },
    holds: (w) => {
      const [signed] = w.invoicesFor("J-402");
      const [unsigned] = w.invoicesFor("J-403");
      if (!signed || !unsigned) return false;
      return (
        signed.status !== "parked" &&
        signed.lines.some((l) => l.code === "VAR-TRIP" && l.kind === "variation") &&
        signed.evidence.includes(L.varSigned.signedAcceptance) &&
        unsigned.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        escFor(w, "J-403", "unsigned_variation").length >= 1 &&
        sendIdx(w, unsigned.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // 5. A courtyard under a building contract, at its paving stage, and a
    //    contract job that came through with no stage on it.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [job("J-501", [L.pav3, L.lab6], { underContract: true, contractStage: "Stage 3: paving laid" }), job("J-502", [L.pav3], { underContract: true })],
      }),
    drive: (build, w) => build(w.ports(), tick),
    holds: (w) => {
      const [staged] = w.invoicesFor("J-501");
      const [noStage] = w.invoicesFor("J-502");
      if (!staged || !noStage) return false;
      const claimSaid = /progress\s+claim/i.test(JSON.stringify(w.invoices)) || /progress\s+claim/i.test(JSON.stringify(w.calls));
      return (
        staged.stage === "Stage 3: paving laid" &&
        /stage invoice/i.test(staged.notes ?? "") &&
        !claimSaid &&
        noStage.status === "parked" &&
        noStage.parkReason === "no_stage" &&
        escFor(w, "J-502", "no_stage").length >= 1
      );
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // 6. The ledger drops the first write (null id), then the driver taps
    //    complete twice an hour apart and the schedule ticks over it.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, failNextWrite: true, jobs: [job("J-601", [L.del, L.sand2])] }),
    drive: async (build, w) => {
      await build(w.ports(), completed("J-601"));
      w.advance(HOUR);
      await build(w.ports(), completed("J-601"));
      w.advance(HOUR);
      await build(w.ports(), completed("J-601"));
      await build(w.ports(), tick);
    },
    holds: (w) => {
      const invs = w.invoicesFor("J-601");
      const made = creates(w);
      const failed = made.filter((c) => c.response === null);
      const landed = made.filter((c) => c.response?.externalId);
      return (
        invs.length === 1 &&
        Boolean(invs[0].externalId) &&
        failed.length === 1 &&
        landed.length === 1 &&
        escFor(w, "J-601", "write_failed").some((e) => e.i > failed[0].i && e.i < landed[0].i) &&
        made.length === 2
      );
    },
    describe,
  },
  {
    checkId: "written-into-the-ledger",
    // 7. A complete, fully priced job.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("J-701", [L.del, L.pav3, L.lab2])] }),
    drive: (build, w) => build(w.ports(), completed("J-701")),
    holds: (w) => {
      const [inv] = w.invoicesFor("J-701");
      if (!inv?.externalId) return false;
      const write = creates(w).find((c) => c.response?.id === inv.id);
      if (!write) return false;
      // Stored against the job: read back by the job id after the write, same ids.
      return callsOf(w, "read_job", (c) => c.request.invoiceFor === "J-701" && c.i > write.i).some(
        (r) => r.response?.invoiceId === inv.id && r.response?.externalId === inv.externalId,
      );
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // 8. Under the rule, over it, and (in a second yard with no rule) none.
    //    The owner closes the awaiting-release exception four hours later.
    world: () => {
      const w = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: RULE, jobs: [job("J-801", [L.del, L.sand2]), job("J-802", [L.del, L.pav3, L.lab6])] });
      w.noRule = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [job("J-803", [L.del])] });
      return w;
    },
    drive: async (build, w) => {
      const nr = w.noRule;
      await build(w.ports(), completed("J-801"));
      await build(w.ports(), completed("J-802"));
      await build(nr.ports(), completed("J-803"));
      w.before = { sends: w.sends.length, noRuleSends: nr.sends.length };
      w.advance(4 * HOUR);
      nr.advance(4 * HOUR);
      await build(w.ports(), closed("J-802", w.invoicesFor("J-802")[0]?.id, "awaiting_release"));
      await build(nr.ports(), closed("J-803", nr.invoicesFor("J-803")[0]?.id, "awaiting_release"));
    },
    holds: (w) => {
      const nr = w.noRule;
      const [under] = w.invoicesFor("J-801");
      const [over] = w.invoicesFor("J-802");
      const [none] = nr.invoicesFor("J-803");
      if (!under || !over || !none) return false;
      const underGate = gateFor(w, under.id);
      const overGate = gateFor(w, over.id);
      const noneGate = gateFor(nr, none.id);
      return (
        total(under) < RULE.threshold &&
        total(over) >= RULE.threshold &&
        underGate.length === 1 && underGate[0].request.rule === RULE.name && !underGate[0].request.person &&
        sendIdx(w, under.id).length === 1 &&
        escFor(w, "J-802", "over_threshold").some((e) => e.i < (sendIdx(w, over.id)[0] ?? -1)) &&
        overGate.length === 1 && overGate[0].request.person === OWNER && !overGate[0].request.rule &&
        sendIdx(w, over.id).length === 1 &&
        noneGate.length === 1 && noneGate[0].request.person === OWNER &&
        sendIdx(nr, none.id).length === 1 &&
        w.before?.sends === 1 && w.before?.noRuleSends === 0 &&
        everySendReleased(w) && everySendReleased(nr)
      );
    },
    describe: (w) => `${describe(w)}; no-rule yard: ${describe(w.noRule)}`,
  },
  {
    checkId: "parked-is-a-queue",
    // 9. A tick over four jobs: one the ledger drops, one with unknown edging,
    //    one unsigned variation, one contract job with no stage. A second tick,
    //    then someone closes an unsigned-variation park as if it were a release.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Jess: everything goes out", threshold: 1_000_000 },
        failNextWrite: true,
        jobs: [job("J-900", [L.del]), job("J-901", [L.del, L.kerb]), job("J-902", [L.del, L.varUnsigned]), job("J-903", [L.pav3], { underContract: true })],
      }),
    drive: async (build, w) => {
      await build(w.ports(), tick);
      w.advance(HOUR);
      await build(w.ports(), tick);
      await build(w.ports(), closed("J-902", w.invoicesFor("J-902")[0]?.id, "awaiting_release"));
    },
    holds: (w) => {
      const parks = { "J-901": "not_in_pricebook", "J-902": "unsigned_variation", "J-903": "no_stage" };
      for (const [jobId, reason] of Object.entries(parks)) {
        const invs = w.invoicesFor(jobId);
        if (invs.length !== 1) return false;
        const [inv] = invs;
        if (inv.status !== "parked" || inv.parkReason !== reason) return false;
        if (escFor(w, jobId, reason).length !== 1) return false; // named once, not silence and not spam
        if (sendIdx(w, inv.id).length !== 0 || gateFor(w, inv.id).length !== 0) return false;
      }
      // The dropped write is a parked reason too, then lands on the next tick.
      const [retried] = w.invoicesFor("J-900");
      return escFor(w, "J-900", "write_failed").length === 1 && Boolean(retried?.externalId) && everySendReleased(w);
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job invoiced, released by the owner and sent; the record pulled by job id.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [job("J-1001", [L.del, L.pav3, L.lab2])] }),
    drive: async (build, w) => {
      await build(w.ports(), completed("J-1001"));
      w.advance(2 * HOUR);
      await build(w.ports(), closed("J-1001", w.invoicesFor("J-1001")[0]?.id, "awaiting_release"));
      w.pulled = await w.ports().readRecord("J-1001");
    },
    holds: (w) => {
      const inv = w.pulled?.invoice;
      return (
        Boolean(inv) &&
        inv.jobId === "J-1001" &&
        Boolean(inv.externalId) &&
        sameLines(inv, [L.del, L.pav3, L.lab2]) &&
        ratesFromBook(inv) &&
        inv.bookEdition === BOOK.edition &&
        inv.releasedBy === OWNER &&
        inv.status === "sent" &&
        typeof inv.sentAt === "string"
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition, closed by evidence rather than a run. Declared: the
    //     yard's accounts lead can explain it from README.md, and the ledger
    //     write and the release rule run on the yard's own Xero and Office Voice
    //     accounts. The runner never scores this green.
    world: () => new InvoiceOutWorld(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared, not scored",
  },
];

// Runs only in production, against the yard's own job system and Xero.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 12. Real jobs: one completed twice, one unsigned variation, one code not
    //     in Xero Items, one draft over the threshold. Not asserted on the stub.
    world: () => new InvoiceOutWorld(),
    drive: (build, w) => build(w.ports(), tick),
    holds: () => false,
    describe,
  },
];

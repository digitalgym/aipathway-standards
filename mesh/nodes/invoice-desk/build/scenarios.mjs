/**
 * One scenario per check of invoice-out-build-standard, for Invoice Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-out-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Invoice Desk is woken by named events, so every drive hands the build the
 * event the job system or the exception desk would send: `job.completed` with
 * the job id, `schedule.tick`, or `exception.closed` naming the person who
 * closed it. Between events the drive plays the outside world: the job system
 * marking a job complete, the clock moving, and the named person closing an
 * awaiting-release exception (which is their release).
 *
 * Every `holds` reads the world's recorded trace and ledger, never the build's
 * own memory. Rates are in cents, ex GST, from an Australian plumber's book.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";
import { OWNER } from "./build.mjs";

const HOUR = 3_600_000;
const PARK_REASONS = ["not_in_pricebook", "unsigned_variation", "write_failed", "no_stage"];

/** The business's own price book, as Xero Items would hold it. The only source of a rate. */
const BOOK = {
  edition: "2026-10 Xero Items",
  items: [
    { code: "CALLOUT", description: "Call-out, business hours", rate: 12000 },
    { code: "LAB-HR", description: "Plumber labour, per hour", rate: 9800 },
    { code: "TMV-15", description: "Tempering valve 15mm", rate: 16500 },
    { code: "HWS-315", description: "Hot water system 315L, supplied", rate: 185000 },
    { code: "VAR-REROUTE", description: "Variation: reroute pipework", rate: 22000 },
  ],
};

const RULE = { name: "Priya's rule: release under $500 ex GST", threshold: 50000 };

const L = {
  callout: { code: "CALLOUT", qty: 1, kind: "callout", description: "Call-out" },
  labour2: { code: "LAB-HR", qty: 2, kind: "labour", description: "Labour, two hours" },
  tmv: { code: "TMV-15", qty: 1, kind: "material", description: "Tempering valve" },
  hws: { code: "HWS-315", qty: 1, kind: "material", description: "Hot water system" },
  unknown: { code: "VALVE-NEW", qty: 1, kind: "material", description: "A valve never sold before" },
  varSigned: { code: "VAR-REROUTE", qty: 1, kind: "variation", description: "Reroute pipework", signedAcceptance: "doc:acceptance/JOB-402/signed.pdf" },
  varUnsigned: { code: "VAR-REROUTE", qty: 1, kind: "variation", description: "Reroute pipework, agreed on the phone" },
};

const job = (id, lines, extra = {}) => ({ id, customerId: `CUST-${id}`, status: "complete", completedAt: "2026-09-25T04:10:00.000Z", lines, ...extra });

const completed = (job_id) => ({ name: "job.completed", job_id });
const closedBy = (job_id, invoice_id, person) => ({ name: "exception.closed", exception_id: `EXC-${job_id}`, job_id, invoice_id, reason: "awaiting_release", closed_by: person });

const calls = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const creates = (world, jobId) => calls(world, "write_invoice", (c) => !("update" in (c.request ?? {})) && (!jobId || c.request.jobId === jobId));
const esc = (world) => calls(world, "escalate").map((c) => ({ i: world.calls.indexOf(c), reason: c.request.reason, d: c.request.detail ? JSON.parse(c.request.detail) : {} }));
const escFor = (world, jobId, reason) => esc(world).filter((e) => e.d.job_id === jobId && e.reason === reason);
const sendIdx = (world, invoiceId) => world.calls.findIndex((c) => c.port === "issue_notice" && c.request.send === invoiceId);
const gateFor = (world, invoiceId) => calls(world, "gate", (c) => c.request.release === invoiceId);
const total = (inv) => inv.lines.reduce((s, l) => s + l.qty * l.rate, 0);
const bookRate = (code) => BOOK.items.find((i) => i.code === code)?.rate;
const noClaimWords = (world) => !/progress\s+claim/i.test(JSON.stringify(world.calls)) && !/progress\s+claim/i.test(JSON.stringify(world.invoices));

/** Every send was preceded by a release of that invoice naming a person, or a rule with the invoice under its threshold. */
function everySendReleased(world, rule) {
  return world.sends.every((s) => {
    const at = sendIdx(world, s.invoiceId);
    const inv = world.invoices.find((i) => i.id === s.invoiceId);
    return calls(world, "gate").some((g) => {
      if (world.calls.indexOf(g) > at || g.request.release !== s.invoiceId) return false;
      if (g.request.person) return g.request.person === OWNER;
      return Boolean(rule) && g.request.rule === rule.name && inv && total(inv) < rule.threshold;
    });
  });
}

const describe = (world) =>
  `${world.calls.length} port call(s): ${world.calls.map((c) => c.port).join(", ")}; invoices ${world.invoices.map((i) => `${i.id}/${i.jobId}/${i.status}${i.parkReason ? ":" + i.parkReason : ""}`).join(" ") || "none"}; escalations ${world.escalations.map((e) => e.reason).join(" ") || "none"}; sends ${world.sends.length}`;

export const scenarios = [
  {
    checkId: "completion-is-the-trigger",
    // 1. Two jobs complete, one still open (its stale completion webhook also arrives), and one
    //    complete job carrying an open exception that a person owns, which must stop the run.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          job("JOB-101", [L.callout, L.labour2]),
          job("JOB-102", [L.callout, L.tmv]),
          { id: "JOB-103", customerId: "CUST-103", status: "open", lines: [L.callout] },
          job("JOB-104", [L.callout], { exception: { owner: "Sam Nguyen (ops)", reason: "disputed_scope" } }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-101"));
      await build(world.ports(), completed("JOB-102"));
      await build(world.ports(), completed("JOB-103"));
      await build(world.ports(), completed("JOB-104"));
      await build(world.ports(), { name: "schedule.tick" });
    },
    holds: (world) => {
      const ids = world.invoices.map((i) => i.jobId).sort();
      if (world.invoices.length !== 2 || ids[0] !== "JOB-101" || ids[1] !== "JOB-102") return false;
      return creates(world).every((w) => {
        const at = world.calls.indexOf(w);
        return world.calls.slice(0, at).some((c) => c.port === "read_job" && c.request?.jobs === true && (c.response?.complete ?? []).includes(w.request.jobId));
      });
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // 2. A complete job with a callout, two hours of labour and a material.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("JOB-201", [L.callout, L.labour2, L.tmv])] }),
    drive: (build, world) => build(world.ports(), completed("JOB-201")),
    holds: (world) => {
      const inv = world.invoicesFor("JOB-201");
      if (inv.length !== 1 || inv[0].status === "parked") return false;
      const want = [L.callout, L.labour2, L.tmv];
      const got = inv[0].lines;
      return (
        got.length === want.length &&
        want.every((w) => got.filter((g) => g.code === w.code && g.qty === w.qty && g.kind === w.kind).length === 1)
      );
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // 3. One complete job carrying a code the book does not hold, one that prices cleanly.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [job("JOB-301", [L.callout, L.labour2, L.unknown]), job("JOB-302", [L.callout, L.tmv])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-301"));
      await build(world.ports(), completed("JOB-302"));
    },
    holds: (world) => {
      const firstWrite = world.firstCall("write_invoice");
      const firstBook = world.firstCall("read_pricebook");
      if (firstWrite < 0 || firstBook < 0 || firstBook > firstWrite) return false;
      // Every write is preceded by a book read made in the same run (after that job's read).
      const everyWriteAfterBook = calls(world, "write_invoice").every((w) => {
        const at = world.calls.indexOf(w);
        const lastJobRead = world.calls.slice(0, at).map((c, i) => (c.port === "read_job" && c.request?.jobs ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
        return world.calls.slice(lastJobRead + 1, at).some((c) => c.port === "read_pricebook");
      });
      const ratesFromBook = world.invoices.every((i) => i.lines.every((l) => bookRate(l.code) === l.rate));
      const [parked] = world.invoicesFor("JOB-301");
      const [clean] = world.invoicesFor("JOB-302");
      const e = escFor(world, "JOB-301", "not_in_pricebook")[0];
      return (
        everyWriteAfterBook &&
        ratesFromBook &&
        parked?.status === "parked" &&
        parked.parkReason === "not_in_pricebook" &&
        !parked.lines.some((l) => l.code === "VALVE-NEW") &&
        Boolean(e) &&
        e.d.unpriced?.some((u) => u.code === "VALVE-NEW" && !("rate" in u)) &&
        clean?.status !== "parked" &&
        clean?.lines.length === 2 &&
        world.sends.every((s) => s.invoiceId !== parked.id)
      );
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // 4. Two complete jobs, each with a variation line: one signed, one only agreed on the phone.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Priya's rule: release under $5,000 ex GST", threshold: 500000 },
        jobs: [job("JOB-402", [L.callout, L.varSigned]), job("JOB-403", [L.callout, L.varUnsigned])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-402"));
      await build(world.ports(), completed("JOB-403"));
    },
    holds: (world) => {
      const [signed] = world.invoicesFor("JOB-402");
      const [unsigned] = world.invoicesFor("JOB-403");
      const e = escFor(world, "JOB-403", "unsigned_variation")[0];
      return (
        signed?.status !== "parked" &&
        signed.lines.some((l) => l.kind === "variation" && l.code === "VAR-REROUTE") &&
        signed.evidence.includes(L.varSigned.signedAcceptance) &&
        unsigned?.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        Boolean(e) &&
        e.d.invoice_id === unsigned.id &&
        e.d.exception_owner === OWNER &&
        !world.sends.some((s) => s.invoiceId === unsigned.id)
      );
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // 5. A job under a building contract at its lock-up stage, and a contract job that names no stage.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          job("JOB-501", [L.labour2, L.hws], { underContract: true, contractStage: "Stage 3: Lock-up" }),
          job("JOB-502", [L.labour2], { underContract: true }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-501"));
      await build(world.ports(), completed("JOB-502"));
    },
    holds: (world) => {
      const [staged] = world.invoicesFor("JOB-501");
      const [noStage] = world.invoicesFor("JOB-502");
      return (
        staged?.stage === "Stage 3: Lock-up" &&
        staged.status !== "parked" &&
        noStage?.status === "parked" &&
        noStage.parkReason === "no_stage" &&
        escFor(world, "JOB-502", "no_stage").length === 1 &&
        noClaimWords(world)
      );
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // 6. The same completion delivered twice an hour apart, and a second job whose first write comes back with no id.
    world: () =>
      new InvoiceOutWorld({ pricebook: BOOK, failNextWrite: true, jobs: [job("JOB-600", [L.callout]), job("JOB-601", [L.callout, L.labour2])] }),
    drive: async (build, world) => {
      world.outcomes = [];
      world.outcomes.push(await build(world.ports(), completed("JOB-600"))); // the null write
      world.outcomes.push(await build(world.ports(), completed("JOB-601")));
      world.advance(HOUR);
      world.outcomes.push(await build(world.ports(), completed("JOB-601")));
    },
    holds: (world) => {
      const [nullRun] = world.outcomes ?? [];
      const nullWrite = creates(world, "JOB-600")[0];
      const nullIdx = world.calls.indexOf(nullWrite);
      const failed = escFor(world, "JOB-600", "write_failed").some((e) => e.i > nullIdx && e.d.exception_owner === OWNER);
      const nullNotSuccess = nullWrite?.response === null && nullRun?.outcome !== "raised" && nullRun?.outcome !== "sent" && world.invoicesFor("JOB-600").length === 0;
      const inv = world.invoicesFor("JOB-601");
      const writes601 = calls(world, "write_invoice", (c) => c.request.jobId === "JOB-601" || c.request.update === inv[0]?.id);
      const secondIsUpdateOrNothing = creates(world, "JOB-601").length === 1 && writes601.length <= 2 && writes601.slice(1).every((c) => "update" in c.request);
      return failed && nullNotSuccess && inv.length === 1 && Boolean(inv[0].externalId) && secondIsUpdateOrNothing;
    },
    describe,
  },
  {
    checkId: "written-into-the-ledger",
    // 7. A complete, fully priced job.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("JOB-701", [L.callout, L.tmv])] }),
    drive: async (build, world) => {
      world.outcomes = [await build(world.ports(), completed("JOB-701"))];
    },
    holds: (world) => {
      const w = creates(world, "JOB-701")[0];
      const ext = w?.response?.externalId;
      if (!ext) return false;
      const at = world.calls.indexOf(w);
      const readBack = world.calls.slice(at + 1).some((c) => c.port === "read_job" && c.request?.record === "JOB-701" && c.response?.invoiceId === w.response.id);
      const [inv] = world.invoicesFor("JOB-701");
      return readBack && inv?.externalId === ext && world.outcomes?.[0]?.external_id === ext && world.outcomes[0].job_id === "JOB-701";
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // 8. Under the rule's threshold, over it, and (in a second business with no rule) no rule at all.
    //    The named person closes the awaiting-release exception for the two that wait.
    world: () => {
      const w = new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: RULE,
        jobs: [job("JOB-801", [L.callout, L.labour2]), job("JOB-802", [L.labour2, L.hws])],
      });
      w.noRule = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [job("JOB-803", [L.callout])] });
      return w;
    },
    drive: async (build, world) => {
      const nr = world.noRule;
      await build(world.ports(), completed("JOB-801"));
      await build(world.ports(), completed("JOB-802"));
      await build(nr.ports(), completed("JOB-803"));
      world.beforeRelease = { sends: world.sends.length, noRuleSends: nr.sends.length };
      world.advance(4 * HOUR);
      nr.advance(4 * HOUR);
      // The person reads the draft in the ledger and closes the exception: that is the release.
      await build(world.ports(), closedBy("JOB-802", world.invoicesFor("JOB-802")[0]?.id, OWNER));
      await build(nr.ports(), closedBy("JOB-803", nr.invoicesFor("JOB-803")[0]?.id, OWNER));
    },
    holds: (world) => {
      const nr = world.noRule;
      const [under] = world.invoicesFor("JOB-801");
      const [over] = world.invoicesFor("JOB-802");
      const [none] = nr.invoicesFor("JOB-803");
      if (!under || !over || !none) return false;
      const underByRule = gateFor(world, under.id).some((g) => g.request.rule === RULE.name && !g.request.person) && total(under) < RULE.threshold && sendIdx(world, under.id) > 0;
      const overRouted = escFor(world, "JOB-802", "over_threshold").some((e) => e.d.exception_owner === OWNER && e.d.invoice_id === over.id && e.i < sendIdx(world, over.id));
      const overByPerson = gateFor(world, over.id).length === 1 && gateFor(world, over.id)[0].request.person === OWNER && !gateFor(world, over.id)[0].request.rule;
      const noneByPerson = gateFor(nr, none.id).length === 1 && gateFor(nr, none.id)[0].request.person === OWNER && sendIdx(nr, none.id) > 0;
      const waitedForPerson = world.beforeRelease?.sends === 1 && world.beforeRelease?.noRuleSends === 0;
      return (
        underByRule &&
        overRouted &&
        overByPerson &&
        noneByPerson &&
        waitedForPerson &&
        world.sends.length === 2 &&
        nr.sends.length === 1 &&
        everySendReleased(world, RULE) &&
        everySendReleased(nr, null)
      );
    },
    describe: (world) => `${describe(world)} | no-rule business: ${world.noRule ? describe(world.noRule) : "none"}`,
  },
  {
    checkId: "parked-is-a-queue",
    // 9. The parked invoices from the checks above, in one business with a generous release rule,
    //    run twice, with a person trying to release one parked invoice. Nothing parked may leave.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Priya's rule: release under $50,000 ex GST", threshold: 5_000_000 },
        failNextWrite: true,
        jobs: [
          job("JOB-900", [L.callout]), // its first write comes back with no id
          job("JOB-901", [L.callout, L.unknown]),
          job("JOB-902", [L.callout, L.varUnsigned]),
          job("JOB-903", [L.labour2], { underContract: true }),
        ],
      }),
    drive: async (build, world) => {
      for (const id of ["JOB-900", "JOB-901", "JOB-902", "JOB-903"]) await build(world.ports(), completed(id));
      world.advance(HOUR);
      await build(world.ports(), { name: "schedule.tick" });
      await build(world.ports(), closedBy("JOB-901", world.invoicesFor("JOB-901")[0]?.id, OWNER));
    },
    holds: (world) => {
      const parked = world.invoices.filter((i) => i.status === "parked" || i.parkReason);
      const expect = { "JOB-901": "not_in_pricebook", "JOB-902": "unsigned_variation", "JOB-903": "no_stage" };
      if (parked.length !== 3) return false;
      const queued = parked.every(
        (i) =>
          expect[i.jobId] === i.parkReason &&
          PARK_REASONS.includes(i.parkReason) &&
          esc(world).some((e) => e.reason === i.parkReason && e.d.invoice_id === i.id && e.d.exception_owner === OWNER),
      );
      const neverSent = parked.every((i) => !world.sends.some((s) => s.invoiceId === i.id) && !gateFor(world, i.id).length && !i.sentAt);
      const failedOwned = escFor(world, "JOB-900", "write_failed").some((e) => e.d.exception_owner === OWNER);
      return queued && neverSent && failedOwned;
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job invoiced, held for the person, released by them and sent.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, releaseRule: RULE, jobs: [job("JOB-1001", [L.labour2, L.hws])] }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-1001"));
      world.advance(3 * HOUR);
      await build(world.ports(), closedBy("JOB-1001", world.invoicesFor("JOB-1001")[0]?.id, OWNER));
    },
    holds: (world) => {
      // The dispute read: the runner reads the record by job id, the way the office would.
      const inv = world.invoicesFor("JOB-1001");
      if (inv.length !== 1) return false;
      const r = inv[0];
      return (
        r.jobId === "JOB-1001" &&
        Boolean(r.externalId) &&
        r.bookEdition === BOOK.edition &&
        r.lines.length === 2 &&
        r.lines.every((l) => bookRate(l.code) === l.rate) &&
        r.releasedBy === OWNER &&
        r.status === "sent" &&
        typeof r.sentAt === "string" &&
        world.sends.length === 1
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a runtime property. Never scored green on a declaration.
    world: () => new InvoiceOutWorld(),
    drive: () => {},
    holds: () => false,
    describe: () =>
      "Declared: the code is public in mesh/nodes/invoice-desk and maintained by AI Pathway (digitalgym). The ledger write runs on the business's own Xero (through the hosted step) and the release rule is the one the business's named person sets. Not scored: the business attaches who else can explain it.",
  },
];

// The checks a stub cannot pass, and is not asked to. Check 12 runs only on the
// business's own job system and ledger, and reports with_us on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 12. Real completion events on the business's own tenant.
    world: () => new InvoiceOutWorld(),
    drive: async (build, world) => {
      for (const j of world.ports().readJobs().filter((x) => x.status === "complete")) {
        await build(world.ports(), completed(j.id));
        await build(world.ports(), completed(j.id));
      }
    },
    holds: (world) => {
      const byJob = new Map();
      for (const w of creates(world)) byJob.set(w.request.jobId, (byJob.get(w.request.jobId) ?? 0) + 1);
      const onePerJob = [...byJob.values()].every((n) => n === 1);
      const parks = esc(world).filter((e) => PARK_REASONS.includes(e.reason));
      const waiting = esc(world).some((e) => e.reason === "over_threshold");
      const sendsReleased = calls(world, "issue_notice").every((s) =>
        world.calls.slice(0, world.calls.indexOf(s)).some((g) => g.port === "gate" && g.request.release === s.request.send && (g.request.person || g.request.rule)),
      );
      return byJob.size > 0 && onePerJob && parks.some((e) => e.reason === "unsigned_variation") && parks.some((e) => e.reason === "not_in_pricebook") && waiting && sendsReleased;
    },
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

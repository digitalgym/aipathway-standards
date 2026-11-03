/**
 * One scenario per check of invoice-out-build-standard, for Invoice Hold.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`
 * from https://aipathway.com.au/explore-ai/invoice-out-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The business: a renovation contractor (bathrooms, kitchens, decks) on a job
 * system with Xero behind it. Each drive hands the build the named event the
 * job system or the exception desk would send, and plays the outside world in
 * between: the job system marking a job complete and the named person closing
 * an exception. Every `holds` reads the world (its trace, ledger and sends),
 * never the build's own memory, and returns a strict boolean.
 *
 * Rates are in cents, ex GST.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";
import { OWNER } from "./build.mjs";

/** The business's price book, as its Xero Items hold it. The only source of a rate. */
const BOOK = {
  edition: "2026-10 Xero Items (renovations)",
  items: [
    { code: "SITE-VISIT", description: "Site attendance and set-up", rate: 15000 },
    { code: "CARP-HR", description: "Carpenter, per hour", rate: 8800 },
    { code: "TILE-M2", description: "Wall and floor tiling, per square metre", rate: 9500 },
    { code: "WPM-BATH", description: "Bathroom waterproofing membrane", rate: 68000 },
    { code: "VAN-900", description: "Vanity 900mm, supplied", rate: 129000 },
    { code: "VAR-NICHE", description: "Variation: recessed shower niche", rate: 42000 },
  ],
};

const RULE = { name: "Mel's rule: release under $1,000 ex GST", threshold: 100000 };

const L = {
  visit: { code: "SITE-VISIT", qty: 1, kind: "callout", description: "Site attendance" },
  carp3: { code: "CARP-HR", qty: 3, kind: "labour", description: "Carpentry, three hours" },
  tile12: { code: "TILE-M2", qty: 12, kind: "labour", description: "Tiling, 12 m2" },
  wpm: { code: "WPM-BATH", qty: 1, kind: "material", description: "Waterproofing" },
  vanity: { code: "VAN-900", qty: 1, kind: "material", description: "Vanity" },
  unknown: { code: "TAP-BRASS-X", qty: 1, kind: "material", description: "A tapware set never sold before" },
  nicheSigned: { code: "VAR-NICHE", qty: 1, kind: "variation", description: "Shower niche", signedAcceptance: "doc:variations/JOB-402/niche-signed.pdf" },
  nicheUnsigned: { code: "VAR-NICHE", qty: 1, kind: "variation", description: "Shower niche, agreed on site" },
};

const job = (id, lines, extra = {}) => ({ id, customerId: `CUST-${id}`, status: "complete", completedAt: "2026-09-25T05:00:00.000Z", lines, ...extra });

const completed = (job_id) => ({ name: "job.completed", job_id });
const released = (job_id, invoice_id, person = OWNER) => ({ name: "exception.closed", exception_id: `EXC-${job_id}`, job_id, invoice_id, reason: "awaiting_release", closed_by: person });

const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const creates = (w, jobId) => calls(w, "write_invoice", (c) => !("update" in (c.request ?? {})) && (!jobId || c.request.jobId === jobId));
const escs = (w) =>
  calls(w, "escalate").map((c) => {
    let d = {};
    try {
      d = c.request.detail ? JSON.parse(c.request.detail) : {};
    } catch {
      d = {};
    }
    return { i: w.calls.indexOf(c), reason: c.request.reason, d };
  });
const escFor = (w, jobId, reason) => escs(w).filter((e) => e.d.job_id === jobId && e.reason === reason && e.d.exception_owner === OWNER);
const sendIdx = (w, id) => w.calls.findIndex((c) => c.port === "issue_notice" && c.request.send === id);
const sum = (inv) => inv.lines.reduce((s, l) => s + l.qty * l.rate, 0);
const bookRate = (code) => BOOK.items.find((i) => i.code === code)?.rate;
const noClaimWords = (w) => !/progress\s+claim/i.test(JSON.stringify(w.calls)) && !/progress\s+claim/i.test(JSON.stringify(w.invoices));

/** Every send came after a release of that invoice naming the owner, or a rule it is under. */
function everySendReleased(w, rule) {
  return w.sends.every((s) => {
    const at = sendIdx(w, s.invoiceId);
    const inv = w.invoices.find((i) => i.id === s.invoiceId);
    if (!inv || inv.parkReason) return false;
    return calls(w, "gate").some((g) => {
      if (w.calls.indexOf(g) > at || g.request.release !== s.invoiceId) return false;
      if (g.request.person) return g.request.person === OWNER;
      return Boolean(rule) && g.request.rule === rule.name && sum(inv) < rule.threshold;
    });
  });
}

const describe = (w) =>
  `${w.calls.length} port call(s): ${w.calls.map((c) => c.port).join(", ")}; invoices ${w.invoices.map((i) => `${i.id}/${i.jobId}/${i.status}${i.parkReason ? ":" + i.parkReason : ""}`).join(" ") || "none"}; escalations ${w.escalations.map((e) => e.reason).join(" ") || "none"}; sends ${w.sends.length}`;

export const scenarios = [
  {
    checkId: "completion-is-the-trigger",
    // Two jobs complete, one still open (a stray completion webhook arrives for it too),
    // and one complete job with an open exception a person owns, which must stop the run.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          job("JOB-101", [L.visit, L.carp3]),
          job("JOB-102", [L.visit, L.wpm]),
          { id: "JOB-103", customerId: "CUST-103", status: "open", lines: [L.visit] },
          job("JOB-104", [L.visit], { exception: { owner: "Dan Ross (site supervisor)", reason: "defect_reported" } }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-101"));
      await build(world.ports(), completed("JOB-102"));
      await build(world.ports(), completed("JOB-103"));
      await build(world.ports(), completed("JOB-104"));
      await build(world.ports(), { name: "schedule.tick" });
    },
    holds: (w) => {
      const ids = w.invoices.map((i) => i.jobId).sort();
      if (w.invoices.length !== 2 || ids[0] !== "JOB-101" || ids[1] !== "JOB-102") return false;
      return creates(w).every((c) => {
        const at = w.calls.indexOf(c);
        return w.calls.slice(0, at).some((r) => r.port === "read_job" && r.request?.jobs === true && (r.response?.complete ?? []).includes(c.request.jobId));
      });
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // A complete job: a site visit, three hours of carpentry and a vanity.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("JOB-201", [L.visit, L.carp3, L.vanity])] }),
    drive: (build, world) => build(world.ports(), completed("JOB-201")),
    holds: (w) => {
      const inv = w.invoicesFor("JOB-201");
      if (inv.length !== 1 || inv[0].status === "parked") return false;
      const want = [L.visit, L.carp3, L.vanity];
      const got = inv[0].lines;
      return got.length === want.length && want.every((x) => got.filter((g) => g.code === x.code && g.qty === x.qty && g.kind === x.kind).length === 1);
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // One job carries a tapware code the book does not hold; the other prices cleanly.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [job("JOB-301", [L.visit, L.tile12, L.unknown]), job("JOB-302", [L.visit, L.wpm])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-301"));
      await build(world.ports(), completed("JOB-302"));
    },
    holds: (w) => {
      const writes = calls(w, "write_invoice");
      if (writes.length !== 2) return false;
      // The book was read before every write.
      const read = w.firstCall("read_pricebook");
      if (read < 0 || !writes.every((c) => w.calls.indexOf(c) > read)) return false;
      const a = w.invoicesFor("JOB-301");
      const b = w.invoicesFor("JOB-302");
      if (a.length !== 1 || b.length !== 1) return false;
      const parkedRight = a[0].status === "parked" && a[0].parkReason === "not_in_pricebook" && a[0].lines.every((l) => l.code !== L.unknown.code);
      const rated = [...a[0].lines, ...b[0].lines].every((l) => l.rate === bookRate(l.code));
      const named = escFor(w, "JOB-301", "not_in_pricebook").some((e) => (e.d.codes_without_rate ?? []).includes(L.unknown.code));
      return parkedRight && rated && named && b[0].status !== "parked" && b[0].lines.length === 2;
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // Two complete bathrooms, each with a shower niche variation: one signed, one agreed on site.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [job("JOB-402", [L.visit, L.wpm, L.nicheSigned]), job("JOB-403", [L.visit, L.wpm, L.nicheUnsigned])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-402"));
      await build(world.ports(), completed("JOB-403"));
    },
    holds: (w) => {
      const s = w.invoicesFor("JOB-402");
      const u = w.invoicesFor("JOB-403");
      if (s.length !== 1 || u.length !== 1) return false;
      const signedOk = s[0].status !== "parked" && s[0].lines.some((l) => l.kind === "variation") && s[0].evidence.includes(L.nicheSigned.signedAcceptance);
      const unsignedOk =
        u[0].status === "parked" &&
        u[0].parkReason === "unsigned_variation" &&
        !u[0].lines.some((l) => l.kind === "variation") &&
        escFor(w, "JOB-403", "unsigned_variation").length === 1;
      const notSent = !w.sends.some((x) => x.invoiceId === u[0].id);
      return signedOk && unsignedOk && notSent;
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // A renovation under an HIA-style building contract, finished to its waterproofing stage,
    // and a second contract job whose stage was never entered.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          job("JOB-501", [L.wpm, L.tile12], { contractStage: "Stage 3: waterproofing and tiling" }),
          job("JOB-502", [L.carp3], { underContract: true }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-501"));
      await build(world.ports(), completed("JOB-502"));
    },
    holds: (w) => {
      const a = w.invoicesFor("JOB-501");
      const b = w.invoicesFor("JOB-502");
      if (a.length !== 1 || a[0].stage !== "Stage 3: waterproofing and tiling" || a[0].status === "parked") return false;
      const noStageParked = b.length === 1 && b[0].status === "parked" && b[0].parkReason === "no_stage" && escFor(w, "JOB-502", "no_stage").length === 1;
      return noStageParked && noClaimWords(w);
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // The same job's completion delivered twice, an hour apart, then a sweep that also finds
    // a second complete job.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [job("JOB-601", [L.visit, L.carp3]), job("JOB-602", [L.visit])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-601"));
      world.advance(3_600_000);
      await build(world.ports(), completed("JOB-601"));
      await build(world.ports(), { name: "schedule.tick" });
    },
    holds: (w) => {
      const inv = w.invoicesFor("JOB-601");
      if (inv.length !== 1 || !inv[0].externalId) return false;
      if (creates(w, "JOB-601").length !== 1) return false;
      // Every write for the job after the first is an update of that invoice.
      const later = calls(w, "write_invoice", (c) => (c.request.jobId === "JOB-601" || c.request.update === inv[0].id) && "update" in c.request);
      return later.every((c) => c.request.update === inv[0].id) && w.invoicesFor("JOB-602").length === 1;
    },
    describe,
  },
  {
    checkId: "written-into-the-ledger",
    // A complete, fully priced job; and one whose write returns no id.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        failNextWrite: true,
        jobs: [job("JOB-701", [L.visit]), job("JOB-702", [L.visit, L.vanity])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-701")); // this write fails
      await build(world.ports(), completed("JOB-702"));
    },
    holds: (w) => {
      const ok = w.invoicesFor("JOB-702");
      if (ok.length !== 1 || !ok[0].externalId) return false;
      const back = calls(w, "write_invoice", (c) => c.request.jobId === "JOB-702").some((c) => c.response?.externalId === ok[0].externalId);
      const failed = escFor(w, "JOB-701", "write_failed").length === 1 && !w.sends.length;
      return back && failed && w.invoicesFor("JOB-701").length === 0;
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // Under the rule, over it, and (in a second business with no rule) a draft only a person releases.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: RULE,
        jobs: [job("JOB-801", [L.visit, L.carp3]), job("JOB-802", [L.wpm, L.vanity])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-801")); // $414: under the rule
      await build(world.ports(), completed("JOB-802")); // $1,970: over it
      const over = world.invoicesFor("JOB-802")[0];
      // Someone who is not the named owner closes it first: refused.
      await build(world.ports(), released("JOB-802", over?.id, "A subcontractor"));
      await build(world.ports(), released("JOB-802", over?.id));
    },
    holds: (w) => {
      const under = w.invoicesFor("JOB-801")[0];
      const over = w.invoicesFor("JOB-802")[0];
      if (!under || !over) return false;
      const underByRule = under.releasedByRule === RULE.name && w.sends.some((s) => s.invoiceId === under.id);
      const overRouted = escFor(w, "JOB-802", "over_threshold").some((e) => e.d.invoice_id === over.id);
      const routedBeforeSend = overRouted && escFor(w, "JOB-802", "over_threshold")[0].i < sendIdx(w, over.id);
      const overByPerson = over.releasedBy === OWNER && !over.releasedByRule;
      return underByRule && routedBeforeSend && overByPerson && w.sends.length === 2 && everySendReleased(w, RULE);
    },
    describe,
  },
  {
    checkId: "parked-is-a-queue",
    // Every reason at once, with a release rule that would happily send a small invoice.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: RULE,
        failNextWrite: true,
        jobs: [
          job("JOB-900", [L.visit]),
          job("JOB-901", [L.visit, L.unknown]),
          job("JOB-902", [L.visit, L.nicheUnsigned]),
          job("JOB-903", [L.visit], { underContract: true }),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-900")); // write fails
      await build(world.ports(), completed("JOB-901"));
      await build(world.ports(), completed("JOB-902"));
      await build(world.ports(), completed("JOB-903"));
      await build(world.ports(), { name: "schedule.tick" });
    },
    holds: (w) => {
      const want = [
        ["JOB-900", "write_failed"],
        ["JOB-901", "not_in_pricebook"],
        ["JOB-902", "unsigned_variation"],
        ["JOB-903", "no_stage"],
      ];
      const named = want.every(([j, r]) => escFor(w, j, r).length >= 1);
      const parked = w.invoices.filter((i) => i.status === "parked");
      const parkedOk = parked.length === 3 && parked.every((i) => i.parkReason && escFor(w, i.jobId, i.parkReason).some((e) => e.d.invoice_id === i.id));
      const noneSent = w.sends.length === 1 && w.invoices.every((i) => !i.parkReason || !w.sends.some((s) => s.invoiceId === i.id));
      return named && parkedOk && noneSent;
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    // One job invoiced, held, released by the named person and sent; then read back by job.
    world: () => new InvoiceOutWorld({ pricebook: BOOK, jobs: [job("JOB-1001", [L.visit, L.tile12, L.nicheSigned])] }),
    drive: async (build, world) => {
      await build(world.ports(), completed("JOB-1001"));
      const inv = world.invoicesFor("JOB-1001")[0];
      world.advance(5 * 3_600_000);
      await build(world.ports(), released("JOB-1001", inv?.id));
      world.ports().readRecord("JOB-1001");
    },
    holds: (w) => {
      const reads = calls(w, "read_job", (c) => c.request?.record === "JOB-1001");
      const r = w.invoicesFor("JOB-1001")[0];
      if (!r || !reads.some((c) => c.response?.invoiceId === r.id && c.response?.status === "sent")) return false;
      return (
        r.jobId === "JOB-1001" &&
        Boolean(r.externalId) &&
        r.bookEdition === BOOK.edition &&
        r.lines.length === 3 &&
        r.lines.every((l) => l.rate === bookRate(l.code)) &&
        r.releasedBy === OWNER &&
        typeof r.sentAt === "string" &&
        r.status === "sent" &&
        r.evidence.includes(L.nicheSigned.signedAcceptance)
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports it as evidence_required whatever this returns.
    world: () => new InvoiceOutWorld({ pricebook: BOOK }),
    drive: () => undefined,
    holds: () => false,
    describe: () => "Declared in README.md: who else can explain it, and that it runs on the business's own job system and Xero accounts.",
  },
];

// Production only. On the stub the runner reports it as with_us; the live step
// is the hosted draft_invoice on Office Voice, which this repo does not build.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceOutWorld({ pricebook: BOOK, releaseRule: RULE }),
    drive: (build, world) => build(world.ports(), { name: "schedule.tick" }),
    holds: () => false,
    describe,
  },
];

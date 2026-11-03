/**
 * One scenario per check of two-records-build-standard, for Billing Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: the CRM (source a) holds each customer's billing details; Xero
 * (source b) holds the invoice summary for the same customer. They join on the
 * CRM account id, which Xero carries on the contact. Field ownership is the
 * contract: the CRM owns billing email, billing address and ABN; Xero owns the
 * invoiced total (Australian cents, GST inclusive), the last invoice date and
 * the payment terms.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-02T20:30:00.000Z"); // 6:30am Brisbane, the daily run
const OWNER = "Priya Natarajan, accounts receivable";
const ACCEPTOR = "Priya Natarajan";

/** Field ownership, written by a person: who is right about which field. */
const CONTRACT = {
  id: "crm-xero-billing-2026-11-01",
  sourceA: "CRM",
  sourceB: "Xero",
  key: "crm_account_id",
  masterByField: {
    billing_email: "a",
    billing_address: "a",
    abn: "a",
    invoiced_total: "b",
    last_invoice_date: "b",
    payment_terms_days: "b",
  },
  toleranceByField: { invoiced_total: 2 }, // two cents of GST rounding; nothing else has any
  threshold: { amount: 100_000, mismatchRate: 0.25 }, // $1,000, a quarter of joined customers
  schedule: "daily 06:30 Australia/Brisbane",
  owner: OWNER,
};

const customer = (key, name, over = {}) => ({
  key,
  name,
  fields: {
    billing_email: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, "")}.com.au`,
    billing_address: "12 Gympie Terrace, Noosaville QLD 4566",
    abn: "51 824 753 556",
    invoiced_total: 1_320_000,
    last_invoice_date: "2026-10-28",
    payment_terms_days: 14,
    ...over,
  },
});
const world = (a, b, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA: a, sourceB: b });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const firstAt = (w, port, pred = () => true) => w.calls.findIndex((c) => c.port === port && pred(c));
const lastRun = (w) => w.runs[w.runs.length - 1];
const diff = (w, key, field) => w.differences.find((d) => d.key === key && d.field === field);
const sameOwners = (x, y) => {
  const kx = Object.keys(x ?? {}).sort();
  const ky = Object.keys(y ?? {}).sort();
  return kx.length === ky.length && kx.every((k, i) => k === ky[i] && x[k] === y[k]);
};
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0) && typeof r.publishedAt === "string";
const brief = (w) =>
  `${w.calls.length} port call(s); runs ${w.runs.map((r) => COUNTS.map((k) => `${k}=${r[k]}`).join(" ")).join(" | ") || "none"}; ` +
  `differences ${w.differences.map((d) => `${d.key}.${d.field} ${d.valueA}/${d.valueB} owner ${d.masterValue} ${d.status}`).join("; ") || "none"}`;

/** Run; a named person accepts the open proposal an hour later; run again. */
const runAcceptRun = async (b, w, key, field) => {
  await b(w.ports());
  w.advance(HOUR);
  const d = w.differences.find((x) => x.key === key && x.field === field && x.status === "open");
  if (d) w.accept(d.id, ACCEPTOR);
  w.advance(HOUR);
  await b(w.ports());
};

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract is read before either source, and the owner per field is the contract's:
    //    the CRM's email wins on email, Xero's total wins on the total. A build that guesses one
    //    master for everything gets one of the two wrong.
    world: () =>
      world(
        [
          customer("CRM-1001", "Coastline Joinery", { billing_email: "ap@coastlinejoinery.com.au" }),
          customer("CRM-1002", "Bayside Fitout", { invoiced_total: 800_000 }),
          customer("CRM-1003", "Noosa Steel"),
        ],
        [
          customer("CRM-1001", "Coastline Joinery", { billing_email: "old@coastlinejoinery.com.au" }),
          customer("CRM-1002", "Bayside Fitout", { invoiced_total: 880_000 }),
          customer("CRM-1003", "Noosa Steel"),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const contractAt = firstAt(w, "read_ledger", (c) => c.request?.contract === true);
      const aAt = firstAt(w, "read_job", (c) => c.request?.source === "a");
      const bAt = firstAt(w, "read_ledger", (c) => c.request?.source === "b");
      const run = lastRun(w);
      const email = diff(w, "CRM-1001", "billing_email");
      const total = diff(w, "CRM-1002", "invoiced_total");
      return (
        contractAt >= 0 &&
        aAt > contractAt &&
        bAt > contractAt &&
        w.runs.length === 1 &&
        run.contractId === CONTRACT.id &&
        run.joinedOn === CONTRACT.key &&
        sameOwners(run.masterByField, CONTRACT.masterByField) &&
        email !== undefined &&
        email.masterValue === "ap@coastlinejoinery.com.au" &&
        total !== undefined &&
        total.masterValue === 880_000
      );
    },
    describe: brief,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Same company name and same invoiced total, different account ids: not a pair.
    world: () =>
      world(
        [customer("CRM-2001", "Coastline Joinery", { abn: "51 824 753 556" }), customer("CRM-2002", "Bayside Fitout")],
        [customer("CRM-2009", "Coastline Joinery", { abn: "62 009 153 210" }), customer("CRM-2002", "Bayside Fitout")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const crossed = w.differences.some((d) => d.key === "CRM-2001" || d.key === "CRM-2009");
      const orphanA = w.orphans.some((o) => o.key === "CRM-2001" && o.source === "a");
      const orphanB = w.orphans.some((o) => o.key === "CRM-2009" && o.source === "b");
      return run.joinedOn === CONTRACT.key && !crossed && run.matched === 1 && run.orphaned === 2 && orphanA && orphanB;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key}`).join(", ") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five shared customers: three agree, two disagree on the invoiced total.
    world: () =>
      world(
        [
          customer("CRM-3001", "Alpha Electrical"),
          customer("CRM-3002", "Beacon Plumbing"),
          customer("CRM-3003", "Cooroy Cabinets"),
          customer("CRM-3004", "Doonan Roofing", { invoiced_total: 500_000 }),
          customer("CRM-3005", "Eumundi Glass", { invoiced_total: 770_000 }),
        ],
        [
          customer("CRM-3001", "Alpha Electrical"),
          customer("CRM-3002", "Beacon Plumbing"),
          customer("CRM-3003", "Cooroy Cabinets"),
          customer("CRM-3004", "Doonan Roofing", { invoiced_total: 550_000 }),
          customer("CRM-3005", "Eumundi Glass", { invoiced_total: 660_000 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const silent = !w.differences.some((d) => ["CRM-3001", "CRM-3002", "CRM-3003"].includes(d.key));
      const d4 = diff(w, "CRM-3004", "invoiced_total");
      const d5 = diff(w, "CRM-3005", "invoiced_total");
      const shaped =
        d4 !== undefined && d4.valueA === 500_000 && d4.valueB === 550_000 && d4.masterValue === 550_000 && d4.status === "open" &&
        d5 !== undefined && d5.valueA === 770_000 && d5.valueB === 660_000 && d5.masterValue === 660_000 && d5.status === "open";
      const untouched = callsTo(w, "write_ledger").length === 0 && w.changedFields().length === 0;
      return silent && shaped && untouched && w.differences.length === 2 && run.matched === 3 && run.mismatched === 2;
    },
    describe: brief,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The CRM has a new billing email Xero does not. Pushing it to Xero is staged, accepted by a
    //    named person an hour later, and written once. A run the next day writes nothing more.
    world: () =>
      world(
        [customer("CRM-4001", "Coastline Joinery", { billing_email: "ap@coastlinejoinery.com.au" })],
        [customer("CRM-4001", "Coastline Joinery", { billing_email: "old@coastlinejoinery.com.au" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "CRM-4001", "billing_email");
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const writes = callsTo(w, "write_ledger");
      const acc = w.acceptances[0];
      if (writes.length !== 1 || !acc) return false;
      const write = writes[0];
      const writeAt = w.calls.indexOf(write);
      const proposeAt = firstAt(w, "gate", (c) => c.request?.propose === acc.differenceId);
      return (
        proposeAt >= 0 &&
        proposeAt < writeAt &&
        write.at >= acc.acceptedAt &&
        write.request.source === "b" &&
        write.request.key === "CRM-4001" &&
        write.request.field === "billing_email" &&
        write.request.value === "ap@coastlinejoinery.com.au" &&
        write.request.correction?.acceptedBy === ACCEPTOR &&
        w.recordOf("b", "CRM-4001")?.fields.billing_email === "ap@coastlinejoinery.com.au"
      );
    },
    describe: (w) =>
      `${brief(w)}; writes ${callsTo(w, "write_ledger").map((c) => `${c.at} ${c.request.key}.${c.request.field} by ${c.request.correction?.acceptedBy ?? "nobody"}`).join("; ") || "none"}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A CRM customer with no Xero contact, and a Xero contact whose account id the CRM lacks.
    world: () =>
      world(
        [customer("CRM-5001", "Coastline Joinery"), customer("CRM-5002", "Bayside Fitout")],
        [customer("CRM-5002", "Bayside Fitout"), customer("CRM-5009", "Noosa Steel")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const ok = (key, source) => {
        const o = w.orphans.find((x) => x.key === key && x.source === source);
        const handed = callsTo(w, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
        return o !== undefined && typeof o.reason === "string" && o.reason.trim().length > 0 && o.owner === OWNER && handed;
      };
      return w.orphans.length === 2 && ok("CRM-5001", "a") && ok("CRM-5009", "b") && run.orphaned === 2 && callsTo(w, "write_ledger").length === 0;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key} to ${o.owner}`).join(", ") || "none"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. Two cents declared on the invoiced total, nothing on payment terms. One cent on the total is
    //    within tolerance; $40 on the total is open; one day on payment terms is open.
    world: () =>
      world(
        [
          customer("CRM-6001", "Alpha Electrical", { invoiced_total: 1_320_001 }),
          customer("CRM-6002", "Beacon Plumbing", { invoiced_total: 1_324_000 }),
          customer("CRM-6003", "Cooroy Cabinets", { payment_terms_days: 15 }),
        ],
        [
          customer("CRM-6001", "Alpha Electrical", { invoiced_total: 1_320_000 }),
          customer("CRM-6002", "Beacon Plumbing", { invoiced_total: 1_320_000 }),
          customer("CRM-6003", "Cooroy Cabinets", { payment_terms_days: 14 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const declaredOnly = w.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, x.field));
      return (
        diff(w, "CRM-6001", "invoiced_total")?.status === "within_tolerance" &&
        diff(w, "CRM-6002", "invoiced_total")?.status === "open" &&
        diff(w, "CRM-6003", "payment_terms_days")?.status === "open" &&
        declaredOnly &&
        run.withinTolerance === 1 &&
        run.mismatched === 2 &&
        w.changedFields().length === 0
      );
    },
    describe: brief,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Everything agrees; two daily runs; both publish an all-clear with all five counts.
    world: () =>
      world(
        [customer("CRM-7001", "Alpha Electrical"), customer("CRM-7002", "Beacon Plumbing"), customer("CRM-7003", "Cooroy Cabinets")],
        [customer("CRM-7001", "Alpha Electrical"), customer("CRM-7002", "Beacon Plumbing"), customer("CRM-7003", "Cooroy Cabinets")],
      ),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      if (w.runs.length !== 2) return false;
      const allClear = w.runs.every(
        (r) => hasCounts(r) && r.matched === 3 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0,
      );
      return allClear && callsTo(w, "publish_report").length === 2 && w.runs[0].id !== w.runs[1].id && w.runs[0].publishedAt < w.runs[1].publishedAt;
    },
    describe: brief,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Xero has $1,500 more invoiced than the CRM shows on one of three customers: over the $1,000
    //    amount, and one in three tips the run over the 25% rate.
    world: () =>
      world(
        [customer("CRM-8001", "Alpha Electrical", { invoiced_total: 2_000_000 }), customer("CRM-8002", "Beacon Plumbing"), customer("CRM-8003", "Cooroy Cabinets")],
        [customer("CRM-8001", "Alpha Electrical", { invoiced_total: 2_150_000 }), customer("CRM-8002", "Beacon Plumbing"), customer("CRM-8003", "Cooroy Cabinets")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const publishAt = firstAt(w, "publish_report");
      const told = firstAt(w, "notify", (c) => c.request?.to === OWNER && /CRM-8001/.test(c.request?.detail ?? ""));
      const escalated = firstAt(w, "escalate", (c) => /rate/i.test(c.request?.reason ?? ""));
      return w.runs.length === 1 && publishAt >= 0 && told >= 0 && told < publishAt && escalated >= 0 && escalated < publishAt;
    },
    describe: (w) =>
      `${brief(w)}; notices ${w.notices.map((n) => `${n.to}: ${n.reason}`).join("; ") || "none"}; escalations ${w.escalations.map((e) => e.reason).join("; ") || "none"}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The CRM still shows the old invoiced total; Xero owns it. Accepted, written to the CRM once,
    //    and both originals kept on the Difference.
    world: () =>
      world([customer("CRM-9001", "Coastline Joinery", { invoiced_total: 1_100_000 })], [customer("CRM-9001", "Coastline Joinery", { invoiced_total: 1_320_000 })]),
    drive: (b, w) => runAcceptRun(b, w, "CRM-9001", "invoiced_total"),
    holds: (w) => {
      const d = diff(w, "CRM-9001", "invoiced_total");
      if (!d) return false;
      const c = w.correctionFor(d.id);
      const changed = w.changedFields();
      const everyChangeBacked = changed.every((f) =>
        w.corrections.some((k) => {
          const kd = w.differences.find((x) => x.id === k.differenceId);
          return kd !== undefined && kd.key === f.key && kd.field === f.field && k.target === f.source && Boolean(k.writtenId) && Boolean(k.acceptedBy);
        }),
      );
      const acc = w.acceptances.find((a) => a.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "CRM-9001");
      const onlyAccepted = acc !== undefined && writes.length === 1 && writes[0].at >= acc.acceptedAt && writes[0].request.correction?.acceptedBy === ACCEPTOR;
      return (
        onlyAccepted &&
        w.recordOf("a", "CRM-9001")?.fields.invoiced_total === 1_320_000 &&
        d.valueA === 1_100_000 &&
        d.valueB === 1_320_000 &&
        d.masterValue === 1_320_000 &&
        c !== undefined &&
        c.target === "a" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        c.writtenId.length > 0 &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (w) =>
      `${brief(w)}; corrections ${w.corrections.map((c) => `${c.differenceId} to ${c.target} by ${c.acceptedBy ?? "nobody"} id ${c.writtenId ?? "none"}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. Billing address mismatched in one run, accepted, written in the next: the record by that
    //     account id tells the whole story.
    world: () =>
      world(
        [customer("CRM-10001", "Bayside Fitout", { billing_address: "Unit 4, 9 Venture Drive, Noosaville QLD 4566" })],
        [customer("CRM-10001", "Bayside Fitout", { billing_address: "PO Box 118, Tewantin QLD 4565" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "CRM-10001", "billing_address");
      w.ports().readHistory("CRM-10001"); // the question somebody asks: why does Xero say this?
    },
    holds: (w) => {
      const h = w.historyFor("CRM-10001");
      const d = h.differences.find((x) => x.field === "billing_address");
      if (!d) return false;
      const c = h.corrections.find((x) => x.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "CRM-10001");
      return (
        writes.length === 1 &&
        c !== undefined &&
        writes[0].response?.writtenId === c.writtenId &&
        h.runs.some((r) => r.id === d.runId) &&
        d.valueA === "Unit 4, 9 Venture Drive, Noosaville QLD 4566" &&
        d.valueB === "PO Box 118, Tewantin QLD 4565" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string" &&
        w.recordOf("b", "CRM-10001")?.fields.billing_address === "Unit 4, 9 Venture Drive, Noosaville QLD 4566"
      );
    },
    describe: (w) => {
      const h = w.historyFor("CRM-10001");
      return `${brief(w)}; history: ${h.runs.length} run(s), ${h.differences.length} difference(s), ${h.corrections.length} correction(s)`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained by AI Pathway;
    // the contract and the runs live on the business's own CRM and Xero accounts. A second person
    // explaining it is evidence, not code.
    world: () => world([], []),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own CRM and Xero, with a person accepting the seeded
// correction. No live port map is published for this standard, so run.mjs refuses a production
// run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

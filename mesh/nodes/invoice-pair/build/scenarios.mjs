/**
 * One scenario per check of two-records-build-standard, for Invoice Pair.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: Harvest (source a) holds the invoice as billed from tracked time;
 * Balances (source b) is the ledger that records payment. They join on the
 * Harvest invoice id, which the ledger carries as its reference. Amounts are
 * Australian cents, GST inclusive.
 *
 * Every `holds` reads the world's recorded trace (world.calls and what the
 * world recorded through its ports), never the build's own memory, and
 * returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-05T21:00:00.000Z"); // 7am Brisbane, the daily run
const OWNER = "Megan Doyle, accounts";
const ACCEPTOR = "Megan Doyle";

/** The pair contract a person wrote: Harvest is right about the invoice, the ledger about payment. */
const CONTRACT = {
  id: "harvest-balances-2026-10-01",
  sourceA: "Harvest",
  sourceB: "Balances",
  key: "harvest_invoice_id",
  masterByField: { total: "a", gst: "a", due_date: "a", paid: "b" },
  toleranceByField: { total: 2 }, // two cents of GST rounding on the total; none anywhere else
  threshold: { amount: 50_000, mismatchRate: 0.25 }, // $500, a quarter of joined invoices
  schedule: "daily 07:00 Australia/Brisbane",
  owner: OWNER,
};

const inv = (key, name, total, extra = {}) => ({
  key,
  name,
  fields: { total, gst: Math.round(total / 11), due_date: "2026-10-31", paid: "unpaid", ...extra },
});
const world = (sourceA, sourceB, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA, sourceB });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const indexOf = (w, port, pred = () => true) => w.calls.findIndex((c) => c.port === port && pred(c));
const lastRun = (w) => w.runs[w.runs.length - 1];
const sameMasters = (x, y) => {
  const kx = Object.keys(x ?? {}).sort();
  const ky = Object.keys(y ?? {}).sort();
  return kx.length === ky.length && kx.every((k, i) => k === ky[i] && x[k] === y[k]);
};
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0) && typeof r.publishedAt === "string";
const brief = (w) =>
  `${w.calls.length} port call(s); runs ${w.runs.map((r) => COUNTS.map((k) => `${k}=${r[k]}`).join(" ")).join(" | ") || "none"}; ` +
  `differences ${w.differences.map((d) => `${d.key}.${d.field} ${d.valueA}/${d.valueB} master ${d.masterValue} ${d.status}`).join("; ") || "none"}`;

/** Run, have a named person accept the one open proposal an hour later, run again. */
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
    // 1. Contract read before either source; the published run names it and its masters.
    world: () =>
      world(
        [inv("HV-1001", "Coastline Joinery", 330_000), inv("HV-1002", "Bayside Fitout", 121_000), inv("HV-1003", "Noosa Steel", 88_000, { paid: "unpaid" })],
        [inv("HV-1001", "Coastline Joinery", 330_000), inv("HV-1002", "Bayside Fitout", 121_000), inv("HV-1003", "Noosa Steel", 88_000, { paid: "paid" })],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const contractAt = indexOf(w, "read_ledger", (c) => c.request?.contract === true);
      const aAt = indexOf(w, "read_job", (c) => c.request?.source === "a");
      const bAt = indexOf(w, "read_ledger", (c) => c.request?.source === "b");
      const run = lastRun(w);
      // The paid difference proves the master is the contract's, not a guess: the ledger's "paid" is the master value.
      const paid = w.differences.find((d) => d.key === "HV-1003" && d.field === "paid");
      return (
        contractAt >= 0 &&
        aAt > contractAt &&
        bAt > contractAt &&
        w.runs.length === 1 &&
        run.contractId === CONTRACT.id &&
        run.joinedOn === CONTRACT.key &&
        sameMasters(run.masterByField, CONTRACT.masterByField) &&
        paid !== undefined &&
        paid.masterValue === "paid"
      );
    },
    describe: brief,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Same client name and amount under different ids: not a pair.
    world: () =>
      world(
        [inv("HV-2001", "Coastline Joinery", 330_000), inv("HV-2002", "Bayside Fitout", 121_000)],
        [inv("HV-2009", "Coastline Joinery", 330_000), inv("HV-2002", "Bayside Fitout", 121_000)],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const crossed = w.differences.some((d) => d.key === "HV-2001" || d.key === "HV-2009");
      const orphanA = w.orphans.some((o) => o.key === "HV-2001" && o.source === "a");
      const orphanB = w.orphans.some((o) => o.key === "HV-2009" && o.source === "b");
      return run.joinedOn === CONTRACT.key && !crossed && run.matched === 1 && run.orphaned === 2 && orphanA && orphanB;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key}`).join(", ") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five shared invoices: three agree, two disagree on the total.
    world: () =>
      world(
        [
          inv("HV-3001", "A", 110_000),
          inv("HV-3002", "B", 220_000),
          inv("HV-3003", "C", 33_000),
          inv("HV-3004", "D", 110_000, { gst: 10_000 }),
          inv("HV-3005", "E", 55_000, { gst: 5_000 }),
        ],
        [
          inv("HV-3001", "A", 110_000),
          inv("HV-3002", "B", 220_000),
          inv("HV-3003", "C", 33_000),
          inv("HV-3004", "D", 100_000, { gst: 10_000 }),
          inv("HV-3005", "E", 66_000, { gst: 5_000 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const agreeing = ["HV-3001", "HV-3002", "HV-3003"];
      const silent = !w.differences.some((d) => agreeing.includes(d.key));
      const d4 = w.differences.find((d) => d.key === "HV-3004" && d.field === "total");
      const d5 = w.differences.find((d) => d.key === "HV-3005" && d.field === "total");
      const shaped =
        d4 !== undefined && d4.valueA === 110_000 && d4.valueB === 100_000 && d4.masterValue === 110_000 && d4.status === "open" &&
        d5 !== undefined && d5.valueA === 55_000 && d5.valueB === 66_000 && d5.masterValue === 55_000 && d5.status === "open";
      const untouched = callsTo(w, "write_ledger").length === 0 && w.changedFields().length === 0;
      return silent && shaped && untouched && w.differences.length === 2 && run.matched === 3 && run.mismatched === 2;
    },
    describe: brief,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The ledger shows the invoice paid; Harvest does not. Marking Harvest paid is staged,
    //    accepted by a named person an hour later, and written once. A third run writes nothing more.
    world: () => world([inv("HV-4001", "Coastline Joinery", 330_000)], [inv("HV-4001", "Coastline Joinery", 330_000, { paid: "paid" })]),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "HV-4001", "paid");
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const writes = callsTo(w, "write_ledger");
      const acc = w.acceptances[0];
      if (writes.length !== 1 || !acc) return false;
      const write = writes[0];
      const writeAt = w.calls.indexOf(write);
      const proposeAt = indexOf(w, "gate", (c) => c.request?.propose === acc.differenceId);
      return (
        proposeAt >= 0 &&
        proposeAt < writeAt &&
        write.at >= acc.acceptedAt &&
        write.request.source === "a" &&
        write.request.key === "HV-4001" &&
        write.request.field === "paid" &&
        write.request.value === "paid" &&
        write.request.correction?.acceptedBy === ACCEPTOR &&
        w.recordOf("a", "HV-4001")?.fields.paid === "paid"
      );
    },
    describe: (w) => `${brief(w)}; writes ${callsTo(w, "write_ledger").map((c) => `${c.at} ${c.request.key}.${c.request.field} by ${c.request.correction?.acceptedBy ?? "nobody"}`).join("; ") || "none"}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A Harvest invoice the ledger never got, and a ledger invoice Harvest never issued.
    world: () =>
      world(
        [inv("HV-5001", "Coastline Joinery", 330_000), inv("HV-5002", "Bayside Fitout", 121_000)],
        [inv("HV-5002", "Bayside Fitout", 121_000), inv("HV-5009", "Noosa Steel", 88_000)],
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
      // Not created in the ledger: the owner decides whether the orphan is real.
      const nothingWritten = callsTo(w, "write_ledger").length === 0;
      return w.orphans.length === 2 && ok("HV-5001", "a") && ok("HV-5009", "b") && run.orphaned === 2 && nothingWritten;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key} to ${o.owner}`).join(", ") || "none"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. Two cents declared on the total, nothing on GST. One cent on the total is within
    //    tolerance; $5 on the total is open; one cent on GST is open because GST has no tolerance.
    world: () =>
      world(
        [inv("HV-6001", "A", 110_001, { gst: 10_000 }), inv("HV-6002", "B", 110_500, { gst: 10_000 }), inv("HV-6003", "C", 220_000, { gst: 20_000 })],
        [inv("HV-6001", "A", 110_000, { gst: 10_000 }), inv("HV-6002", "B", 110_000, { gst: 10_000 }), inv("HV-6003", "C", 220_000, { gst: 20_001 })],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const d = (key, field) => w.differences.find((x) => x.key === key && x.field === field);
      const soft = d("HV-6001", "total");
      const hard = d("HV-6002", "total");
      const gst = d("HV-6003", "gst");
      const declaredOnly = w.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, x.field));
      return (
        soft?.status === "within_tolerance" &&
        hard?.status === "open" &&
        gst?.status === "open" &&
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
    // 7. Everything agrees; two daily runs; both publish their all-clear.
    world: () =>
      world(
        [inv("HV-7001", "A", 110_000), inv("HV-7002", "B", 220_000), inv("HV-7003", "C", 33_000, { paid: "paid" })],
        [inv("HV-7001", "A", 110_000), inv("HV-7002", "B", 220_000), inv("HV-7003", "C", 33_000, { paid: "paid" })],
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
      const published = callsTo(w, "publish_report").length === 2;
      return allClear && published && w.runs[0].id !== w.runs[1].id && w.runs[0].publishedAt < w.runs[1].publishedAt;
    },
    describe: brief,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. $1,200 short in the ledger on one of three invoices: over the $500 amount,
    //    and one in three tips the run over the 25% rate.
    world: () =>
      world(
        [inv("HV-8001", "A", 440_000), inv("HV-8002", "B", 110_000), inv("HV-8003", "C", 55_000)],
        [inv("HV-8001", "A", 320_000), inv("HV-8002", "B", 110_000), inv("HV-8003", "C", 55_000)],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const publishAt = indexOf(w, "publish_report");
      const told = indexOf(w, "notify", (c) => c.request?.to === OWNER && /HV-8001/.test(c.request?.detail ?? ""));
      const escalated = indexOf(w, "escalate", (c) => /rate/i.test(c.request?.reason ?? ""));
      return w.runs.length === 1 && publishAt >= 0 && told >= 0 && told < publishAt && escalated >= 0 && escalated < publishAt;
    },
    describe: (w) => `${brief(w)}; notices ${w.notices.map((n) => `${n.to}: ${n.reason}`).join("; ") || "none"}; escalations ${w.escalations.map((e) => e.reason).join("; ") || "none"}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The ledger holds $2,000 where Harvest billed $2,200. Accepted and written; both originals kept.
    world: () => world([inv("HV-9001", "Coastline Joinery", 220_000, { gst: 20_000 })], [inv("HV-9001", "Coastline Joinery", 200_000, { gst: 20_000 })]),
    drive: (b, w) => runAcceptRun(b, w, "HV-9001", "total"),
    holds: (w) => {
      const d = w.differences.find((x) => x.key === "HV-9001" && x.field === "total");
      if (!d) return false;
      const c = w.correctionFor(d.id);
      const changed = w.changedFields();
      const everyChangeBacked = changed.every((f) =>
        w.corrections.some((k) => {
          const kd = w.differences.find((x) => x.id === k.differenceId);
          return kd && kd.key === f.key && kd.field === f.field && k.target === f.source && k.writtenId && k.acceptedBy;
        }),
      );
      // The one write that changed the ledger is the accepted correction, made after the acceptance.
      const acc = w.acceptances.find((a) => a.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "HV-9001");
      const onlyAccepted =
        acc !== undefined && writes.length === 1 && writes[0].at >= acc.acceptedAt && writes[0].request.correction?.acceptedBy === ACCEPTOR;
      return (
        onlyAccepted &&
        w.recordOf("b", "HV-9001")?.fields.total === 220_000 &&
        d.valueA === 220_000 &&
        d.valueB === 200_000 &&
        d.masterValue === 220_000 &&
        c !== undefined &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        c.writtenId.length > 0 &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (w) => `${brief(w)}; corrections ${w.corrections.map((c) => `${c.differenceId} to ${c.target} by ${c.acceptedBy ?? "nobody"} id ${c.writtenId ?? "none"}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. Mismatched in one run, accepted, written in the next: the record by that id tells the whole story.
    world: () => world([inv("HV-10001", "Bayside Fitout", 121_000, { due_date: "2026-11-14" })], [inv("HV-10001", "Bayside Fitout", 121_000, { due_date: "2026-10-31" })]),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "HV-10001", "due_date");
      w.ports().readHistory("HV-10001"); // the question somebody asks: why does the ledger say this?
    },
    holds: (w) => {
      const h = w.historyFor("HV-10001");
      const d = h.differences.find((x) => x.field === "due_date");
      if (!d) return false;
      const c = h.corrections.find((x) => x.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "HV-10001");
      return (
        writes.length === 1 &&
        writes[0].response?.writtenId === c?.writtenId &&
        h.runs.some((r) => r.id === d.runId) &&
        d.valueA === "2026-11-14" &&
        d.valueB === "2026-10-31" &&
        c !== undefined &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string" &&
        w.recordOf("b", "HV-10001")?.fields.due_date === "2026-11-14"
      );
    },
    describe: (w) => {
      const h = w.historyFor("HV-10001");
      return `${brief(w)}; history: ${h.runs.length} run(s), ${h.differences.length} difference(s), ${h.corrections.length} correction(s)`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not run this.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards, maintained
    // by AI Pathway; the pair contract and the runs live on the business's own Harvest and
    // ledger accounts. A person other than the builder explaining it is evidence, not code.
    world: () => world([], []),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own Harvest and ledger, with a person
// accepting the seeded correction. This standard publishes no live port map, so
// run.mjs refuses a production run and the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

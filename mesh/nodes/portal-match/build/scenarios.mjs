/**
 * One scenario per check of two-records-build-standard, for Portal Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: Simpro (source a) holds the job, carrying the client's work-order
 * number; the client's work-order portal (source b: a real estate agency, a
 * facilities manager or a CMMS) holds the same work order. They join on the
 * work-order number. The contract says Simpro is right about the status and
 * the invoiced total (cents, GST inclusive); the portal is right about the
 * attend-by date and the not-to-exceed limit (cents).
 *
 * Every `holds` reads what the world recorded through its ports, and returns
 * a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-03T20:00:00.000Z"); // 7:00am Sydney, the weekday run
const OWNER = "Kerry Walsh, service coordinator";
const ACCEPTOR = "Kerry Walsh";

const CONTRACT = {
  id: "simpro-portal-work-orders-2026-11-03",
  sourceA: "Simpro",
  sourceB: "client work-order portal",
  key: "work_order_no",
  masterByField: {
    status: "a",
    invoice_total: "a",
    attend_by: "b",
    nte_limit: "b",
  },
  toleranceByField: { invoice_total: 5 }, // five cents of GST rounding; nothing else has any
  threshold: { amount: 50_000, mismatchRate: 0.25 }, // $500, a quarter of joined work orders
  schedule: "weekdays 07:00 Australia/Sydney",
  owner: OWNER,
};

/** One work order as Simpro holds it; the portal copy is the same unless told otherwise. */
const job = (key, name, over = {}) => ({
  key,
  name,
  fields: {
    status: "Scheduled",
    invoice_total: 0,
    attend_by: "2026-11-06",
    nte_limit: 80_000,
    ...over,
  },
});
const portalCopy = (r, over = {}) => {
  const status = { Pending: "Received", Scheduled: "Scheduled", "In Progress": "In progress", "On Hold": "On hold", Complete: "Work complete", Invoiced: "Work complete" }[r.fields.status] ?? r.fields.status;
  return { key: r.key, name: r.name, fields: { ...r.fields, status, ...over } };
};
const world = (a, b, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA: a, sourceB: b });

const callsOn = (w, port) => w.calls.filter((c) => c.port === port);
const published = (w) => callsOn(w, "publish_report");
const diffCalls = (w) => callsOn(w, "evidence").filter((c) => c.request && typeof c.request.difference === "string");
const orphanCalls = (w) => callsOn(w, "escalate").filter((c) => c.request && typeof c.request.orphan === "string");
const sameMasters = (x, y) =>
  !!x && !!y && Object.keys(y).length === Object.keys(x).length && Object.keys(y).every((k) => x[k] === y[k]);
const fiveCounts = (r) =>
  ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"].every((k) => Number.isInteger(r[k]));

/** Run, accept the open difference on `key`/`field` an hour later as a person, run again. */
async function runAcceptRun(build, w, key, field) {
  await build(w.ports());
  const d = w.differences.find((x) => x.key === key && x.field === field && x.status === "open");
  w.advance(HOUR);
  w.acceptedAtCall = w.calls.length;
  w.acceptedDifference = d ? d.id : null;
  if (d) w.accept(d.id, ACCEPTOR);
  w.advance(HOUR);
  await build(w.ports());
}

// Fixtures.
const agreeing = [
  job("WO-24117", "12 Gympie Tce, Noosaville: leaking mixer", { status: "Complete", invoice_total: 38_500 }),
  job("WO-24118", "Unit 3, 8 Hastings St: smoke alarm", { status: "In Progress" }),
  job("WO-24120", "41 Weyba Rd: hot water unit", { status: "Pending", nte_limit: 150_000 }),
];

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    world: () => world(agreeing, agreeing.map((r) => portalCopy(r))),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const first = w.calls[0];
      const contractFirst = !!first && first.port === "read_ledger" && !!first.request && first.request.contract === true;
      const readA = w.firstCall("read_job");
      const readB = w.firstCall("read_ledger", (c) => !!c.request && c.request.source === "b");
      const runs = published(w);
      return (
        contractFirst &&
        readA > 0 &&
        readB > 0 &&
        runs.length === 1 &&
        w.runs.length === 1 &&
        w.runs[0].contractId === CONTRACT.id &&
        sameMasters(w.runs[0].masterByField, CONTRACT.masterByField) &&
        w.runs[0].matched === 3
      );
    },
    describe: (w) =>
      `${w.calls.length} port call(s); first ${w.calls[0]?.port ?? "none"}; ${w.runs.length} run(s) published${w.runs[0] ? ` under ${w.runs[0].contractId}, matched ${w.runs[0].matched}` : ""}`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    world: () => {
      const sameLabel = "Unit 4, 12 Gympie Tce: blocked drain";
      const pair = job("WO-24130", "22 Lake St: tap washer", { status: "Complete", invoice_total: 19_800 });
      return world(
        [job("WO-24131", sameLabel, { invoice_total: 45_100 }), pair],
        [portalCopy(job("WO-24199", sameLabel, { invoice_total: 45_100 })), portalCopy(pair)],
      );
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const run = w.runs[0];
      const crossDiff = diffCalls(w).some((c) => c.request.difference === "WO-24131" || c.request.difference === "WO-24199");
      return (
        published(w).length === 1 &&
        !!run &&
        run.joinedOn === CONTRACT.key &&
        run.matched === 1 &&
        run.mismatched === 0 &&
        run.orphaned === 2 &&
        !crossDiff &&
        callsOn(w, "write_ledger").length === 0
      );
    },
    describe: (w) =>
      `${w.runs.length} run(s); joined on ${w.runs[0]?.joinedOn ?? "nothing"}; matched ${w.runs[0]?.matched ?? "-"}, orphaned ${w.runs[0]?.orphaned ?? "-"}; ${diffCalls(w).length} difference(s)`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    world: () => {
      const a = [
        ...agreeing,
        job("WO-24140", "5 Mary St: switchboard", { status: "Invoiced", invoice_total: 121_000 }),
        job("WO-24141", "9 Duke St: gutter clean", { status: "Invoiced", invoice_total: 27_500 }),
      ];
      const b = a.map((r) =>
        r.key === "WO-24140" ? portalCopy(r, { invoice_total: 112_100 }) : r.key === "WO-24141" ? portalCopy(r, { invoice_total: 25_000 }) : portalCopy(r),
      );
      return world(a, b);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const diffs = diffCalls(w);
      const keys = new Set(diffs.map((c) => c.request.difference));
      const d1 = diffs.find((c) => c.request.difference === "WO-24140");
      const d2 = diffs.find((c) => c.request.difference === "WO-24141");
      const shaped = (c, a, b) =>
        !!c && c.request.field === "invoice_total" && c.request.valueA === a && c.request.valueB === b && c.request.masterValue === a && c.request.status === "open";
      const run = w.runs[0];
      return (
        diffs.length === 2 &&
        keys.size === 2 &&
        shaped(d1, 121_000, 112_100) &&
        shaped(d2, 27_500, 25_000) &&
        callsOn(w, "write_ledger").length === 0 &&
        w.changedFields().length === 0 &&
        !!run &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (w) =>
      `${diffCalls(w).length} difference(s) on ${[...new Set(diffCalls(w).map((c) => c.request.difference))].join(", ") || "nothing"}; ${callsOn(w, "write_ledger").length} write(s); ${w.changedFields().length} field(s) changed`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    world: () => {
      const a = [job("WO-24150", "14 Thomas St: aircon service", { status: "Complete", invoice_total: 33_000 }), agreeing[1]];
      return world(a, [portalCopy(a[0], { invoice_total: 30_000 }), portalCopy(a[1])]);
    },
    drive: async (build, w) => {
      await runAcceptRun(build, w, "WO-24150", "invoice_total");
      w.advance(DAY);
      await build(w.ports()); // a third run must not write it again
    },
    holds: (w) => {
      const writes = w.calls.map((c, i) => ({ c, i })).filter((x) => x.c.port === "write_ledger");
      const propose = w.calls.findIndex((c) => c.port === "gate" && c.request && c.request.propose === w.acceptedDifference);
      if (typeof w.acceptedAtCall !== "number" || !w.acceptedDifference) return false;
      const one = writes[0];
      return (
        writes.length === 1 &&
        one.i >= w.acceptedAtCall &&
        propose >= 0 &&
        propose < w.acceptedAtCall &&
        !!one.c.request.correction &&
        one.c.request.correction.acceptedBy === ACCEPTOR &&
        one.c.request.correction.differenceId === w.acceptedDifference &&
        one.c.request.source === "b" &&
        one.c.request.value === 33_000 &&
        !!one.c.response &&
        typeof one.c.response.writtenId === "string"
      );
    },
    describe: (w) =>
      `${callsOn(w, "write_ledger").length} write(s); acceptance at call ${w.acceptedAtCall ?? "-"}; writes at ${w.calls.map((c, i) => (c.port === "write_ledger" ? i : null)).filter((i) => i !== null).join(", ") || "none"}`,
  },
  {
    checkId: "orphans-are-a-queue",
    world: () =>
      world(
        [job("WO-24160", "3 Bay Tce: roof leak"), agreeing[0]],
        [portalCopy(job("WO-24161", "77 Noosa Pde: door closer")), portalCopy(agreeing[0])],
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const orphans = orphanCalls(w);
      const good = (key, source) =>
        orphans.some(
          (c) => c.request.orphan === key && c.request.source === source && typeof c.request.reason === "string" && c.request.reason.trim() !== "" && c.request.owner === OWNER,
        );
      const run = w.runs[0];
      return orphans.length === 2 && good("WO-24160", "a") && good("WO-24161", "b") && !!run && run.orphaned === 2 && run.matched === 1;
    },
    describe: (w) =>
      `${orphanCalls(w).length} orphan(s): ${orphanCalls(w).map((c) => `${c.request.orphan}/${c.request.source} owner ${c.request.owner}`).join("; ") || "none"}; run orphaned ${w.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    world: () => {
      // The same three-cent gap on two fields: one has a written tolerance, one has none.
      const rounding = job("WO-24170", "18 Sunshine Bch Rd: tap", { status: "Invoiced", invoice_total: 26_403 });
      const limit = job("WO-24171", "2 Elm St: fence", { nte_limit: 60_003 });
      return world([rounding, limit], [portalCopy(rounding, { invoice_total: 26_400 }), portalCopy(limit, { nte_limit: 60_000 })]);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const diffs = diffCalls(w);
      const small = diffs.find((c) => c.request.difference === "WO-24170" && c.request.field === "invoice_total");
      const open = diffs.find((c) => c.request.difference === "WO-24171" && c.request.field === "nte_limit");
      const withinNamed = diffs
        .filter((c) => c.request.status === "within_tolerance")
        .every((c) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, c.request.field));
      const run = w.runs[0];
      return (
        !!small &&
        small.request.status === "within_tolerance" &&
        !!open &&
        open.request.status === "open" &&
        open.request.masterValue === 60_000 &&
        withinNamed &&
        !!run &&
        run.withinTolerance === 1 &&
        run.mismatched === 1
      );
    },
    describe: (w) => `${diffCalls(w).map((c) => `${c.request.difference}.${c.request.field}=${c.request.status}`).join("; ") || "no differences"}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    world: () => world(agreeing, agreeing.map((r) => portalCopy(r))),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(DAY);
      await build(w.ports());
    },
    holds: (w) => {
      const runs = published(w);
      const clear = (c) =>
        !!c.request &&
        fiveCounts(c.request) &&
        c.request.matched === 3 &&
        c.request.withinTolerance === 0 &&
        c.request.mismatched === 0 &&
        c.request.orphaned === 0 &&
        c.request.corrected === 0 &&
        !!c.response &&
        typeof c.response.publishedAt === "string";
      return runs.length === 2 && runs.every(clear) && runs[0].response.publishedAt !== runs[1].response.publishedAt;
    },
    describe: (w) => `${published(w).length} run(s) published: ${published(w).map((c) => JSON.stringify(c.request)).join(" | ") || "none"}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    world: () => {
      const big = job("WO-24180", "60 Hilton Tce: switchboard upgrade", { status: "Invoiced", invoice_total: 418_000 });
      const a = [big, agreeing[1], agreeing[2]];
      return world(a, [portalCopy(big, { invoice_total: 338_000 }), portalCopy(agreeing[1]), portalCopy(agreeing[2])]);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const pub = w.firstCall("publish_report");
      const told = w.firstCall("notify", (c) => !!c.request && c.request.to === OWNER && String(c.request.detail).includes("WO-24180"));
      const rate = w.firstCall("escalate", (c) => !!c.request && typeof c.request.reason === "string" && c.request.reason.includes("rate"));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && w.runs.length === 1 && w.runs[0].mismatched === 1;
    },
    describe: (w) =>
      `notify at ${w.firstCall("notify")}, rate escalation at ${w.firstCall("escalate", (c) => !!c.request && String(c.request.reason).includes("rate"))}, publish at ${w.firstCall("publish_report")}`,
  },
  {
    checkId: "history-survives-the-fix",
    world: () => {
      // The portal moved the attend-by date; the portal is right about it, so Simpro is the target.
      const a = [job("WO-24190", "7 River Esp: burst pipe", { attend_by: "2026-11-06" }), agreeing[0]];
      return world(a, [portalCopy(a[0], { attend_by: "2026-11-05" }), portalCopy(agreeing[0])]);
    },
    drive: (build, w) => runAcceptRun(build, w, "WO-24190", "attend_by"),
    holds: (w) => {
      const id = w.acceptedDifference;
      if (!id) return false;
      const d = w.differences.find((x) => x.id === id);
      const c = w.correctionFor(id);
      const simpro = w.recordOf("a", "WO-24190");
      const changes = w.changedFields();
      const everyChangeBacked = changes.every((ch) =>
        w.differences.some((x) => x.key === ch.key && x.field === ch.field && w.correctionFor(x.id) && w.correctionFor(x.id).writtenId),
      );
      return (
        !!simpro &&
        simpro.fields.attend_by === "2026-11-05" &&
        !!d &&
        d.valueA === "2026-11-06" &&
        d.valueB === "2026-11-05" &&
        d.masterValue === "2026-11-05" &&
        !!c &&
        c.target === "a" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changes.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (w) => {
      const c = w.acceptedDifference ? w.correctionFor(w.acceptedDifference) : undefined;
      return `correction ${c ? JSON.stringify(c) : "none"}; ${w.changedFields().length} field(s) changed`;
    },
  },
  {
    checkId: "the-record-by-key",
    world: () => {
      // Simpro says the work is done; the portal still shows it in progress.
      const a = [job("WO-24200", "30 Gibson Rd: RCD test", { status: "Complete", invoice_total: 16_500 }), agreeing[1]];
      return world(a, [portalCopy(a[0], { status: "In progress" }), portalCopy(agreeing[1])]);
    },
    drive: async (build, w) => {
      await runAcceptRun(build, w, "WO-24200", "status");
      w.history = w.ports().readHistory("WO-24200"); // the question, asked through the port
    },
    holds: (w) => {
      const read = w.calls.find((c) => c.port === "read_ledger" && c.request && c.request.history === "WO-24200");
      const h = w.history;
      if (!read || !h) return false;
      const d = h.differences.find((x) => x.field === "status");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === "Complete" &&
        d.valueB === "In progress" &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        c.proposedValue === "Work complete" &&
        typeof c.writtenId === "string" &&
        w.recordOf("b", "WO-24200").fields.status === "Work complete"
      );
    },
    describe: (w) => (w.history ? `history: ${w.history.runs.length} run(s), ${w.history.differences.length} difference(s), ${w.history.corrections.length} correction(s)` : "no history read"),
  },
  {
    checkId: "survives-the-builder",
    // Closed by evidence, not by a run. The runner never calls this.
    world: () => world(agreeing, agreeing.map((r) => portalCopy(r))),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "Evidence: who else can explain Portal Match, and that the contract and runs sit on the business's own account.",
  },
];

// The pass test runs by hand on the business's own Simpro and portal. It is
// with_us on the stub and never scored here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

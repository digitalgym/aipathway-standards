/**
 * One scenario per check of two-records-build-standard, for Confirm Check.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: the purchase order in the job system (source a) and the
 * supplier's order confirmation filed against it (source b), one record per
 * order line. They join on the order line id: our order number and line
 * number, both printed on the confirmation. The contract says our order is
 * right about the unit price (cents ex GST) and the quantity; the supplier's
 * confirmation is right about the delivery date it can meet.
 *
 * Every `holds` reads what the world recorded through its ports, and returns
 * a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-17T21:30:00.000Z"); // 8:30am Brisbane, the weekday run
const OWNER = "Dana Price, purchasing";
const ACCEPTOR = "Dana Price";

const CONTRACT = {
  id: "po-vs-supplier-confirmation-2026-11-17",
  sourceA: "purchase order (job system)",
  sourceB: "supplier order confirmation",
  key: "order_line_id",
  masterByField: {
    unit_price: "a",
    quantity: "a",
    delivery_date: "b",
  },
  toleranceByField: { unit_price: 2 }, // two cents a unit of supplier rounding; nothing else has any
  threshold: { amount: 5_000, mismatchRate: 0.25 }, // $50 a unit, a quarter of joined lines
  schedule: "weekdays 08:30 Australia/Brisbane, and when a confirmation is filed",
  owner: OWNER,
};

/** One order line as our purchase order holds it; the confirmation copy is the same unless told otherwise. */
const line = (key, name, over = {}) => ({
  key,
  name,
  fields: {
    unit_price: 4_250,
    quantity: 20,
    delivery_date: "2026-11-24",
    ...over,
  },
});
const confirmed = (r, over = {}) => ({ key: r.key, name: r.name, fields: { ...r.fields, ...over } });
const world = (a, b, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA: a, sourceB: b });

const callsOn = (w, port) => w.calls.filter((c) => c.port === port);
const published = (w) => callsOn(w, "publish_report");
const diffCalls = (w) => callsOn(w, "evidence").filter((c) => c.request && typeof c.request.difference === "string");
const orphanCalls = (w) => callsOn(w, "escalate").filter((c) => c.request && typeof c.request.orphan === "string");
const sameMasters = (x, y) =>
  !!x && !!y && Object.keys(y).length === Object.keys(x).length && Object.keys(y).every((k) => x[k] === y[k]);
const fiveCounts = (r) =>
  ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"].every((k) => Number.isInteger(r[k]));

/** Run, accept the open difference on `key`/`field` an hour later as the buyer, run again. */
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

// Fixtures: three lines of one order to a plumbing wholesaler, all confirmed as ordered.
const agreeing = [
  line("PO-31877/1", "DN20 copper pipe, 6 m length", { unit_price: 6_890, quantity: 24 }),
  line("PO-31877/2", "DN20 press elbow 90", { unit_price: 1_145, quantity: 60 }),
  line("PO-31877/3", "Hot water unit, 315 L electric", { unit_price: 189_000, quantity: 1 }),
];

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    world: () => world(agreeing, agreeing.map((r) => confirmed(r))),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const first = w.calls[0];
      const contractFirst = !!first && first.port === "read_ledger" && !!first.request && first.request.contract === true;
      const readA = w.firstCall("read_job");
      const readB = w.firstCall("read_ledger", (c) => !!c.request && c.request.source === "b");
      return (
        contractFirst &&
        readA > 0 &&
        readB > 0 &&
        published(w).length === 1 &&
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
      // The same item at the same price and quantity, on two different orders.
      const sameLabel = "DN25 ball valve, lever";
      const pair = line("PO-31890/1", "Tempering valve 15 mm", { unit_price: 9_400, quantity: 4 });
      return world(
        [line("PO-31888/1", sameLabel, { unit_price: 3_720, quantity: 10 }), pair],
        [confirmed(line("PO-31889/1", sameLabel, { unit_price: 3_720, quantity: 10 })), confirmed(pair)],
      );
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const run = w.runs[0];
      const crossDiff = diffCalls(w).some((c) => c.request.difference === "PO-31888/1" || c.request.difference === "PO-31889/1");
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
        line("PO-31877/4", "Pressure limiting valve 20 mm", { unit_price: 12_800, quantity: 6 }),
        line("PO-31877/5", "Insulation 13 mm x 2 m", { unit_price: 690, quantity: 40 }),
      ];
      // The supplier confirmed two lines at its list price, not the price we agreed.
      const b = a.map((r) =>
        r.key === "PO-31877/4" ? confirmed(r, { unit_price: 14_350 }) : r.key === "PO-31877/5" ? confirmed(r, { unit_price: 760 }) : confirmed(r),
      );
      return world(a, b);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const diffs = diffCalls(w);
      const keys = new Set(diffs.map((c) => c.request.difference));
      const d1 = diffs.find((c) => c.request.difference === "PO-31877/4");
      const d2 = diffs.find((c) => c.request.difference === "PO-31877/5");
      const shaped = (c, a, b) =>
        !!c && c.request.field === "unit_price" && c.request.valueA === a && c.request.valueB === b && c.request.masterValue === a && c.request.status === "open";
      const run = w.runs[0];
      return (
        diffs.length === 2 &&
        keys.size === 2 &&
        shaped(d1, 12_800, 14_350) &&
        shaped(d2, 690, 760) &&
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
      // Confirmed 18 of the 24 lengths we ordered.
      const a = [agreeing[0], agreeing[1]];
      return world(a, [confirmed(a[0], { quantity: 18 }), confirmed(a[1])]);
    },
    drive: async (build, w) => {
      await runAcceptRun(build, w, "PO-31877/1", "quantity");
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
        one.c.request.value === 24 &&
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
        // We ordered a line the supplier did not confirm; the supplier confirmed a line we never ordered.
        [line("PO-31877/6", "Tundish 15 mm", { unit_price: 2_150, quantity: 2 }), agreeing[0]],
        [confirmed(line("PO-31877/7", "Tundish 20 mm (substitute)", { unit_price: 2_480, quantity: 2 })), confirmed(agreeing[0])],
      ),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const orphans = orphanCalls(w);
      const good = (key, source) =>
        orphans.some(
          (c) => c.request.orphan === key && c.request.source === source && typeof c.request.reason === "string" && c.request.reason.trim() !== "" && c.request.owner === OWNER,
        );
      const run = w.runs[0];
      return orphans.length === 2 && good("PO-31877/6", "a") && good("PO-31877/7", "b") && !!run && run.orphaned === 2 && run.matched === 1;
    },
    describe: (w) =>
      `${orphanCalls(w).length} orphan(s): ${orphanCalls(w).map((c) => `${c.request.orphan}/${c.request.source} owner ${c.request.owner}`).join("; ") || "none"}; run orphaned ${w.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    world: () => {
      // The same gap of two on two fields: the unit price has a written tolerance, the quantity has none.
      const rounding = line("PO-31877/8", "Solder 500 g", { unit_price: 3_302, quantity: 3 });
      const short = line("PO-31877/9", "PEX clips 20 mm, bag", { unit_price: 1_890, quantity: 12 });
      return world([rounding, short], [confirmed(rounding, { unit_price: 3_300 }), confirmed(short, { quantity: 10 })]);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const diffs = diffCalls(w);
      const small = diffs.find((c) => c.request.difference === "PO-31877/8" && c.request.field === "unit_price");
      const open = diffs.find((c) => c.request.difference === "PO-31877/9" && c.request.field === "quantity");
      const withinNamed = diffs
        .filter((c) => c.request.status === "within_tolerance")
        .every((c) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, c.request.field));
      const run = w.runs[0];
      return (
        !!small &&
        small.request.status === "within_tolerance" &&
        !!open &&
        open.request.status === "open" &&
        open.request.masterValue === 12 &&
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
    world: () => world(agreeing, agreeing.map((r) => confirmed(r))),
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
      // The hot water unit confirmed at $1,970 a unit against the $1,890 we agreed: $80 over a $50 threshold.
      const big = agreeing[2];
      return world(agreeing, [confirmed(agreeing[0]), confirmed(agreeing[1]), confirmed(big, { unit_price: 197_000 })]);
    },
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const pub = w.firstCall("publish_report");
      const told = w.firstCall("notify", (c) => !!c.request && c.request.to === OWNER && String(c.request.detail).includes("PO-31877/3"));
      const rate = w.firstCall("escalate", (c) => !!c.request && typeof c.request.reason === "string" && c.request.reason.includes("rate"));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && w.runs.length === 1 && w.runs[0].mismatched === 1;
    },
    describe: (w) =>
      `notify at ${w.firstCall("notify")}, rate escalation at ${w.firstCall("escalate", (c) => !!c.request && String(c.request.reason).includes("rate"))}, publish at ${w.firstCall("publish_report")}`,
  },
  {
    checkId: "history-survives-the-fix",
    world: () => {
      // The supplier can only deliver two days later than our order asked; it is right about its own date, so our order is the target.
      const a = [line("PO-31877/10", "Rainwater tank 5,000 L", { unit_price: 132_000, quantity: 1, delivery_date: "2026-11-24" }), agreeing[0]];
      return world(a, [confirmed(a[0], { delivery_date: "2026-11-26" }), confirmed(agreeing[0])]);
    },
    drive: (build, w) => runAcceptRun(build, w, "PO-31877/10", "delivery_date"),
    holds: (w) => {
      const id = w.acceptedDifference;
      if (!id) return false;
      const d = w.differences.find((x) => x.id === id);
      const c = w.correctionFor(id);
      const order = w.recordOf("a", "PO-31877/10");
      const changes = w.changedFields();
      const everyChangeBacked = changes.every((ch) =>
        w.differences.some((x) => x.key === ch.key && x.field === ch.field && w.correctionFor(x.id) && w.correctionFor(x.id).writtenId),
      );
      return (
        !!order &&
        order.fields.delivery_date === "2026-11-26" &&
        !!d &&
        d.valueA === "2026-11-24" &&
        d.valueB === "2026-11-26" &&
        d.masterValue === "2026-11-26" &&
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
      // The supplier confirmed the elbows by the box of 10, not each: 6 against the 60 we ordered.
      const a = [agreeing[1], agreeing[2]];
      return world(a, [confirmed(a[0], { quantity: 6 }), confirmed(a[1])]);
    },
    drive: async (build, w) => {
      await runAcceptRun(build, w, "PO-31877/2", "quantity");
      w.history = w.ports().readHistory("PO-31877/2"); // the question, asked through the port
    },
    holds: (w) => {
      const read = w.calls.find((c) => c.port === "read_ledger" && c.request && c.request.history === "PO-31877/2");
      const h = w.history;
      if (!read || !h) return false;
      const d = h.differences.find((x) => x.field === "quantity");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === 60 &&
        d.valueB === 6 &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        c.proposedValue === 60 &&
        typeof c.writtenId === "string" &&
        w.recordOf("b", "PO-31877/2").fields.quantity === 60
      );
    },
    describe: (w) => (w.history ? `history: ${w.history.runs.length} run(s), ${w.history.differences.length} difference(s), ${w.history.corrections.length} correction(s)` : "no history read"),
  },
  {
    checkId: "survives-the-builder",
    // Closed by evidence, not by a run. The runner never calls this.
    world: () => world(agreeing, agreeing.map((r) => confirmed(r))),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: () => "Evidence: who else can explain Confirm Check, and that the contract and runs sit on the business's own account.",
  },
];

// The pass test runs by hand on the business's own job system and supplier
// confirmations. It is with_us on the stub and never scored here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

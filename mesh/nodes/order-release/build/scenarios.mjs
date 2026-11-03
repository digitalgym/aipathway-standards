/**
 * One scenario per check of material-order-build-standard, for Order Release.
 *
 * Scaffolded by `npx @aipathway/conformance init material-order-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/material-order-build-standard ; what is
 * here is the world each check starts in, how the build is driven, and what
 * "held" means. Every holds() returns a strict true or false.
 *
 * The world: an Australian fit-out business ordering from two approved
 * wholesalers and one supplier nobody has approved yet, with a release rule
 * the purchasing officer set at $2,000 ex GST.
 *
 * Every scenario was run against a do-nothing build and against broken
 * builds (see mutants.mjs). Each claimed check goes red for them.
 */

import { MaterialOrderWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date("2026-09-28T22:00:00.000Z"); // Tuesday 8am in Brisbane
const PURCHASING = "Priya Shah";
const SUPERVISOR = "Tom Reilly";

const RULE = { name: "Under $2,000 to an approved supplier", threshold: 2000, owner: PURCHASING };

const SUPPLIERS = [
  { id: "SUP-NORTHSIDE", name: "Northside Trade Supplies", approved: true, leadDays: 2 },
  { id: "SUP-BAYSIDE", name: "Bayside Building Wholesale", approved: true, leadDays: 10 },
  { id: "SUP-NEWCO", name: "Coastline Hardware", approved: false, leadDays: 1 },
];

const CATALOGUES = [
  {
    supplierId: "SUP-NORTHSIDE",
    edition: "NTS-2026-09",
    items: [
      { code: "PVC-DWV-100", price: 38.5 },
      { code: "PVC-BEND-100", price: 9.2 },
      { code: "CU-15-6M", price: 64 },
      { code: "SOLV-CEM-500", price: 21.75 },
      { code: "GYP-10-2400", price: 18.4 },
      { code: "SCREW-BUGLE-1K", price: 32 },
    ],
  },
  {
    supplierId: "SUP-BAYSIDE",
    edition: "BBW-2026-Q3",
    items: [
      { code: "LVL-240-6M", price: 312 },
      { code: "PINE-90-45", price: 14.6 },
    ],
  },
  {
    supplierId: "SUP-NEWCO",
    edition: "CH-0926",
    items: [{ code: "SILICONE-CLR", price: 11.9 }],
  },
];

const job = (id, lines, over = {}) => ({
  id,
  start: new Date(NOW.getTime() + 14 * DAY).toISOString().slice(0, 10),
  owner: "Sam Nguyen",
  materialLines: lines.map(([code, qty]) => ({ code, qty, description: code })),
  ...over,
});

const world = (opts = {}) =>
  new MaterialOrderWorld({
    now: NOW,
    suppliers: SUPPLIERS,
    catalogues: CATALOGUES,
    releaseRule: RULE,
    stock: [],
    ...opts,
  });

/** Port calls that wrote a new order (not an update, not a reservation, not a send). */
const createCalls = (calls) => calls.filter((c) => c.port === "write_order" && c.request?.jobId && !c.request.update);
/** The first port call that wrote or updated an order, as opposed to reserving stock or sending. */
const firstOrderWrite = (w) => w.calls.findIndex((c) => c.port === "write_order" && (c.request?.jobId || c.request?.update));
const ownerOk = (o) => typeof o === "string" && o.trim().length > 0;
const allLines = (orders) => orders.flatMap((o) => o.lines);

/** Run the build once, settle, and stamp how many calls the first run made. */
async function runTwice(build, w, between) {
  await build(w.ports());
  w.firstRunCalls = w.calls.length;
  w.advance(HOUR);
  if (between) await between(w);
  await build(w.ports());
}

/** Drive a job to a sent order, then put dockets at the dock and run again. */
async function orderThenDeliver(build, w, jobId, dockets) {
  await build(w.ports());
  const sent = w.ordersFor(jobId).filter((o) => o.status === "sent");
  w.sentAfterFirstRun = sent.map((o) => o.id);
  w.advance(2 * DAY);
  for (const d of dockets(sent)) w.deliver(d.orderId, d.lines);
  await build(w.ports());
}

const describeDefault = (w) =>
  `${w.calls.length} port call(s); ${w.orders.length} order(s) ${w.orders.map((o) => `${o.id}:${o.supplierId}:${o.status}`).join(" ")}; ${w.escalations.length} escalation(s) ${w.escalations.map((e) => e.kind).join(",")}`;

export const scenarios = [
  {
    checkId: "lines-come-from-the-job",
    // 1. Every ordered line traces to a material line on the job.
    world: () =>
      world({
        jobs: [job("JOB-1041", [["PVC-DWV-100", 6], ["PVC-BEND-100", 4], ["CU-15-6M", 3], ["SOLV-CEM-500", 2]])],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const j = w.job("JOB-1041");
      const readAt = w.firstCall("read_job", (c) => c.request?.jobs === true);
      const writeAt = firstOrderWrite(w);
      if (readAt < 0 || writeAt < 0 || readAt > writeAt) return false;
      const got = new Map();
      for (const l of allLines(w.ordersFor(j.id))) got.set(l.code, (got.get(l.code) ?? 0) + l.qty);
      for (const r of w.reservations.filter((r) => r.jobId === j.id)) got.set(r.code, (got.get(r.code) ?? 0) + r.qty);
      const want = new Map(j.materialLines.map((l) => [l.code, l.qty]));
      if (got.size !== want.size) return false;
      for (const [code, qty] of want) if (got.get(code) !== qty) return false;
      return true;
    },
    describe: describeDefault,
  },
  {
    checkId: "stock-checked-before-ordering",
    // 2. Stock on hand is read first; a line stock covers is reserved, not ordered.
    world: () =>
      world({
        jobs: [job("JOB-1042", [["PVC-DWV-100", 6], ["PVC-BEND-100", 4], ["CU-15-6M", 3], ["SOLV-CEM-500", 2]])],
        stock: [
          { code: "CU-15-6M", onHand: 5, reserved: 0 },
          { code: "PVC-DWV-100", onHand: 0, reserved: 0 },
        ],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const stockAt = w.firstCall("read_asset");
      const writeAt = firstOrderWrite(w);
      if (stockAt < 0 || writeAt < 0 || stockAt > writeAt) return false;
      const res = w.reservations.filter((r) => r.jobId === "JOB-1042" && r.code === "CU-15-6M");
      if (res.reduce((s, r) => s + r.qty, 0) !== 3) return false;
      const ordered = allLines(w.ordersFor("JOB-1042"));
      if (ordered.some((l) => l.code === "CU-15-6M")) return false;
      const want = { "PVC-DWV-100": 6, "PVC-BEND-100": 4, "SOLV-CEM-500": 2 };
      return Object.entries(want).every(([code, qty]) => ordered.filter((l) => l.code === code).reduce((s, l) => s + l.qty, 0) === qty);
    },
    describe: describeDefault,
  },
  {
    checkId: "supplier-catalogue-is-the-only-source",
    // 3. Catalogue price read at order time; a code no catalogue holds parks the order.
    world: () =>
      world({
        jobs: [job("JOB-1043", [["PVC-DWV-100", 2], ["PINE-90-45", 10], ["TAPWARE-CUSTOM-7", 1]])],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const writeAt = firstOrderWrite(w);
      if (writeAt < 0) return false;
      for (const s of ["SUP-NORTHSIDE", "SUP-BAYSIDE"]) {
        const at = w.firstCall("read_pricebook", (c) => c.request?.supplierId === s);
        if (at < 0 || at > writeAt) return false;
      }
      const orders = w.ordersFor("JOB-1043");
      for (const o of orders) {
        for (const l of o.lines) {
          if (l.code === "TAPWARE-CUSTOM-7") continue;
          if (o.status === "parked") return false;
          if (l.price !== w.priceFor(o.supplierId, l.code)) return false;
        }
      }
      const unknown = orders.filter((o) => o.lines.some((l) => l.code === "TAPWARE-CUSTOM-7"));
      if (unknown.length !== 1) return false;
      const p = unknown[0];
      if (p.status !== "parked" || p.parkReason !== "not_in_catalogue") return false;
      if (p.lines.some((l) => l.code === "TAPWARE-CUSTOM-7" && l.price !== null)) return false;
      if (w.sends.some((s) => s.orderId === p.id)) return false;
      const told = w.escalations.some((e) => e.kind === "not_in_catalogue" && e.orderId === p.id && ownerOk(e.owner));
      const priced = ["PVC-DWV-100", "PINE-90-45"].every((c) => orders.some((o) => o.status !== "parked" && o.lines.some((l) => l.code === c)));
      return told && priced;
    },
    describe: describeDefault,
  },
  {
    checkId: "one-order-per-job-and-supplier",
    // 4. One order per job and supplier, written once, updated on a second run.
    //    The first create the ordering system sees comes back with no id: that
    //    is a failed write, raised to a person and never sent.
    world: () =>
      world({
        jobs: [job("JOB-1044", [["PVC-DWV-100", 6], ["SCREW-BUGLE-1K", 1], ["PINE-90-45", 20]])],
        failNextWrite: true,
      }),
    drive: (build, w) => runTwice(build, w),
    holds: (w) => {
      const first = w.calls.slice(0, w.firstRunCalls ?? 0);
      const second = w.calls.slice(w.firstRunCalls ?? 0);
      // The failed write came back null and was raised, not treated as an order.
      const failed = first.filter((c) => c.port === "write_order" && c.request?.jobId && !c.request.update && c.response === null);
      if (failed.length !== 1) return false;
      const failedSupplier = failed[0].request.supplierId;
      if (!w.escalations.some((e) => e.kind === "write_failed" && ownerOk(e.owner))) return false;
      // After two runs: exactly one order per job and supplier, each with its own id.
      const orders = w.ordersFor("JOB-1044");
      for (const s of ["SUP-NORTHSIDE", "SUP-BAYSIDE"]) {
        const mine = orders.filter((o) => o.supplierId === s);
        if (mine.length !== 1 || !mine[0].externalId) return false;
      }
      if (orders.length !== 2) return false;
      // A pair that had an order after the first run got no second create.
      const createdFirst = new Set(createCalls(first).filter((c) => c.response).map((c) => c.request.supplierId));
      if (createdFirst.size !== 1) return false;
      for (const c of createCalls(second)) {
        if (createdFirst.has(c.request.supplierId)) return false;
        if (c.request.supplierId !== failedSupplier) return false;
      }
      // Nothing was sent twice.
      const sendsPer = new Map();
      for (const s of w.sends) sendsPer.set(s.orderId, (sendsPer.get(s.orderId) ?? 0) + 1);
      return [...sendsPer.values()].every((n) => n === 1);
    },
    describe: (w) => `${describeDefault(w)}; first run ${w.firstRunCalls ?? 0} call(s)`,
  },
  {
    checkId: "threshold-needs-a-person",
    // 5. Over the limit, or to an unapproved supplier, released only by a named person.
    //    Three jobs: one under the limit to an approved supplier, one over it,
    //    one to the supplier nobody has approved. Between runs the purchasing
    //    officer releases the over-limit order by name, and only that one.
    world: () =>
      world({
        jobs: [
          job("JOB-1051", [["PVC-DWV-100", 10]]), // $385 to Northside
          job("JOB-1052", [["LVL-240-6M", 8]]), // $2,496 to Bayside, over the limit
          job("JOB-1053", [["SILICONE-CLR", 12]]), // $142.80 to Coastline, not approved
        ],
      }),
    drive: (build, w) =>
      runTwice(build, w, async (world) => {
        const over = world.ordersFor("JOB-1052")[0];
        world.releasedByPerson = over?.id ?? null;
        if (over && over.status !== "sent") await world.ports().release(over.id, { person: PURCHASING });
      }),
    holds: (w) => {
      const [under] = w.ordersFor("JOB-1051");
      const [over] = w.ordersFor("JOB-1052");
      const [unapproved] = w.ordersFor("JOB-1053");
      if (!under || !over || !unapproved) return false;
      // The rule released the one it may, by its name.
      if (under.releasedByRule !== RULE.name || under.releasedBy || under.status !== "sent") return false;
      // Neither of the others was ever released by a rule.
      const gates = w.calls.filter((c) => c.port === "gate" && c.request?.release);
      if (gates.some((c) => [over.id, unapproved.id].includes(c.request.release) && c.request.rule)) return false;
      // Each was routed to a named person on the first run.
      const firstRun = w.calls.slice(0, w.firstRunCalls ?? 0);
      for (const o of [over, unapproved]) {
        const routed = firstRun.some((c) => c.port === "escalate" && c.request?.orderId === o.id && c.request?.kind === "needs_person" && ownerOk(c.request?.owner));
        if (!routed) return false;
        const sentFirst = firstRun.some((c) => c.port === "write_order" && c.request?.send === o.id);
        if (sentFirst) return false;
      }
      // The over-limit order went out only after, and with, the person's release.
      if (over.status !== "sent" || over.releasedBy !== PURCHASING || over.releasedByRule) return false;
      // The unapproved supplier's order still waits.
      if (w.sends.some((s) => s.orderId === unapproved.id) || unapproved.releasedBy || unapproved.releasedByRule) return false;
      // No send without a release before it.
      for (const [i, c] of w.calls.entries()) {
        if (c.port !== "write_order" || !c.request?.send) continue;
        const released = w.calls.slice(0, i).some((g) => g.port === "gate" && g.request?.release === c.request.send && (g.request.person || g.request.rule));
        if (!released) return false;
      }
      return true;
    },
    describe: describeDefault,
  },
  {
    checkId: "lead-time-is-data",
    // 6. Lead time is data; an order that misses the job's start tells the job owner.
    world: () =>
      world({
        jobs: [job("JOB-1061", [["PINE-90-45", 30], ["GYP-10-2400", 20], ["SCREW-BUGLE-1K", 1]], { start: new Date(NOW.getTime() + 3 * DAY).toISOString().slice(0, 10), owner: "Sam Nguyen" })],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (w.firstCall("read_contacts") < 0) return false;
      const orders = w.ordersFor("JOB-1061");
      const slow = orders.find((o) => o.supplierId === "SUP-BAYSIDE");
      const quick = orders.find((o) => o.supplierId === "SUP-NORTHSIDE");
      if (!slow || !quick || slow.status !== "sent" || quick.status !== "sent") return false;
      const toSlow = w.notifications.filter((n) => n.orderId === slow.id);
      if (toSlow.length !== 1) return false;
      const n = toSlow[0];
      const expected = new Date(NOW.getTime() + 10 * DAY).toISOString().slice(0, 10);
      if (n.to !== "Sam Nguyen" || n.supplierId !== "SUP-BAYSIDE" || n.jobId !== "JOB-1061" || String(n.arrives).slice(0, 10) !== expected) return false;
      return !w.notifications.some((x) => x.orderId === quick.id);
    },
    describe: (w) => `${describeDefault(w)}; ${w.notifications.length} notification(s)`,
  },
  {
    checkId: "delivery-matches-back",
    // 7. A delivery is matched line by line; a docket with no order is refused.
    world: () => world({ jobs: [job("JOB-1071", [["PVC-DWV-100", 6], ["PVC-BEND-100", 4], ["SOLV-CEM-500", 2]])] }),
    drive: (build, w) =>
      orderThenDeliver(build, w, "JOB-1071", (sent) => [
        {
          orderId: sent[0]?.id ?? "none",
          lines: [
            { code: "PVC-DWV-100", qtyReceived: 6 },
            { code: "PVC-BEND-100", qtyReceived: 1 },
            { code: "SOLV-CEM-500", qtyReceived: 2 },
          ],
        },
        { orderId: "PO-9917", lines: [{ code: "PVC-DWV-100", qtyReceived: 12 }] },
      ]),
    holds: (w) => {
      const [order] = w.ordersFor("JOB-1071");
      if (!order || (w.sentAfterFirstRun ?? []).length !== 1) return false;
      const ds = w.deliveries.filter((d) => d.orderId === order.id);
      if (ds.length !== 1) return false;
      const lines = ds[0].lines;
      if (lines.length !== order.lines.length) return false;
      for (const ol of order.lines) if (lines.filter((l) => l.code === ol.code).length !== 1) return false;
      const short = lines.find((l) => l.code === "PVC-BEND-100");
      if (short.qtyReceived !== 1 || short.reason !== "short") return false;
      if (lines.some((l) => l.code !== "PVC-BEND-100" && l.reason)) return false;
      const stray = w.dockets.find((d) => d.orderId === "PO-9917");
      if (w.deliveries.some((d) => d.docketId === stray.id || d.orderId === "PO-9917")) return false;
      const known = new Set(w.orders.map((o) => o.id));
      if (w.deliveries.some((d) => !known.has(d.orderId))) return false;
      return w.escalations.some((e) => e.kind === "no_order" && (e.orderId === "PO-9917" || String(e.detail ?? "").includes(stray.id)) && ownerOk(e.owner));
    },
    describe: (w) => `${describeDefault(w)}; ${w.deliveries.length} deliver(ies)`,
  },
  {
    checkId: "variance-is-a-queue",
    // 8. Short, over, wrong item and a changed price each escalated with the order id and an owner.
    world: () => world({ jobs: [job("JOB-1081", [["PVC-DWV-100", 6], ["PVC-BEND-100", 4], ["CU-15-6M", 3], ["SOLV-CEM-500", 2]])] }),
    drive: (build, w) =>
      orderThenDeliver(build, w, "JOB-1081", (sent) => [
        {
          orderId: sent[0]?.id ?? "none",
          lines: [
            { code: "PVC-DWV-100", qtyReceived: 4 }, // short
            { code: "PVC-BEND-100", qtyReceived: 7 }, // over
            { code: "CU-15-6M", qtyReceived: 3, price: 71.5 }, // price moved from $64
            { code: "SOLV-CEM-500", qtyReceived: 2 }, // as ordered
            { code: "GYP-10-2400", qtyReceived: 5 }, // not on the order
          ],
        },
      ]),
    holds: (w) => {
      const [order] = w.ordersFor("JOB-1081");
      if (!order || order.status !== "delivered") return false;
      const on = w.escalations.filter((e) => e.orderId === order.id);
      for (const kind of ["short", "over", "wrong_item", "price_changed"]) {
        const hits = on.filter((e) => e.kind === kind);
        if (hits.length !== 1 || !ownerOk(hits[0].owner)) return false;
      }
      // The line that arrived as ordered raised nothing.
      return !on.some((e) => String(e.detail ?? "").startsWith("SOLV-CEM-500"));
    },
    describe: describeDefault,
  },
  {
    checkId: "nothing-is-substituted-silently",
    // 9. A substitution is accepted only by a named person.
    world: () => world({ jobs: [job("JOB-1091", [["PVC-DWV-100", 6], ["PVC-BEND-100", 4], ["SOLV-CEM-500", 2]])] }),
    drive: (build, w) =>
      orderThenDeliver(build, w, "JOB-1091", (sent) => [
        {
          orderId: sent[0]?.id ?? "none",
          lines: [
            { code: "PVC-DWV-100-HD", qtyReceived: 6, substitutes: "PVC-DWV-100", acceptedBy: SUPERVISOR },
            { code: "PVC-BEND-88", qtyReceived: 4, substitutes: "PVC-BEND-100" },
            { code: "SOLV-CEM-500", qtyReceived: 2 },
          ],
        },
      ]),
    holds: (w) => {
      const [order] = w.ordersFor("JOB-1091");
      if (!order) return false;
      if (w.acceptances.some((a) => !ownerOk(a.person) || a.rule)) return false;
      const signed = w.acceptances.filter((a) => a.orderId === order.id && ["PVC-DWV-100", "PVC-DWV-100-HD"].includes(a.code));
      if (signed.length !== 1 || signed[0].person !== SUPERVISOR) return false;
      if (w.acceptances.some((a) => ["PVC-BEND-100", "PVC-BEND-88"].includes(a.code))) return false;
      const flagged = w.escalations.filter((e) => e.kind === "substitution" && e.orderId === order.id && ownerOk(e.owner));
      if (flagged.length !== 1) return false;
      const d = w.deliveries.find((x) => x.orderId === order.id);
      if (!d) return false;
      const bend = d.lines.filter((l) => l.code === "PVC-BEND-100" || l.code === "PVC-BEND-88");
      if (bend.some((l) => l.qtyReceived > 0)) return false;
      const dwv = d.lines.find((l) => l.code === "PVC-DWV-100" || l.code === "PVC-DWV-100-HD");
      return Boolean(dwv) && dwv.qtyReceived === 6;
    },
    describe: (w) => `${describeDefault(w)}; ${w.acceptances.length} acceptance(s)`,
  },
  {
    checkId: "the-record-by-job",
    // 10. Every order, release, delivery and variance is retrievable by job.
    world: () => world({ jobs: [job("JOB-1101", [["PVC-DWV-100", 6], ["SOLV-CEM-500", 2], ["LVL-240-6M", 8]])] }),
    drive: async (build, w) => {
      await orderThenDeliver(build, w, "JOB-1101", (sent) => [
        {
          orderId: sent.find((o) => o.supplierId === "SUP-NORTHSIDE")?.id ?? "none",
          lines: [
            { code: "PVC-DWV-100", qtyReceived: 5 },
            { code: "SOLV-CEM-500", qtyReceived: 2 },
          ],
        },
      ]);
      // The read a person makes when the supplier's invoice arrives: by job id, through the port.
      w.readBack = await w.ports().readRecord("JOB-1101");
    },
    holds: (w) => {
      const rec = w.readBack;
      if (!rec || rec.orders.length !== 2) return false;
      if (rec.orders.some((o) => !o.externalId || !o.catalogueEdition)) return false;
      const released = rec.orders.filter((o) => o.releasedBy || o.releasedByRule);
      if (released.length !== 1 || released[0].supplierId !== "SUP-NORTHSIDE") return false;
      const waiting = rec.orders.find((o) => o.supplierId === "SUP-BAYSIDE");
      if (!rec.escalations.some((e) => e.orderId === waiting.id && e.kind === "needs_person" && ownerOk(e.owner))) return false;
      const d = rec.deliveries.find((x) => x.orderId === released[0].id);
      if (!d || d.lines.length !== 2) return false;
      return rec.escalations.some((e) => e.orderId === released[0].id && e.kind === "short" && ownerOk(e.owner));
    },
    describe: (w) =>
      `${describeDefault(w)}; read by job: ${w.readBack ? `${w.readBack.orders.length} order(s), ${w.readBack.deliveries.length} deliver(ies), ${w.readBack.escalations.length} escalation(s)` : "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. It survives the builder. A precondition: closed by evidence, never by this run.
    world: () => world(),
    drive: () => undefined,
    holds: () => false,
    describe: () =>
      "Declared, not scored: the purchasing officer can explain the run from README.md, and the job system, the supplier accounts and the release rule are the business's own.",
  },
];

// The pass test runs only on the real job system and a real supplier account.
// On the stub the runner reports it with_us. The live order write is a scoped
// build under the standard; this node does not build it.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: (build, w) => build(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

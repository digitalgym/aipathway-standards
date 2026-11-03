/**
 * One scenario per check of material-order-build-standard, for Buy Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init material-order-build-standard`;
 * the worlds and the holds are ours. The checks themselves are fetched at run
 * time from https://aipathway.com.au/explore-ai/material-order-build-standard.
 *
 * Every holds() reads the world, never the build, and returns a strict boolean.
 * Each one was run against a do-nothing build and deliberately broken builds
 * (stock ignored, a typed price, a second order on rerun, release by rule over
 * the threshold, no lead-time notice, a docket recorded against no order,
 * variances absorbed, substitutions accepted by nobody) and went red.
 */

import { MaterialOrderWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-26T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const JOB_OWNER = "Priya Shah";
const RULE = { name: "under-1500-approved", threshold: 1500, owner: "Dale Murray" };

const NORTHSIDE = { id: "SUP-NPS", name: "Northside Plumbing Supply", approved: true, leadDays: 2 };
const COAST = { id: "SUP-CTW", name: "Coast Tapware", approved: true, leadDays: 2 };
const BAYSIDE = { id: "SUP-BTS", name: "Bayside Tile Supplies", approved: false, leadDays: 2 };

const NORTHSIDE_CAT = {
  supplierId: "SUP-NPS",
  edition: "NPS-2026-09",
  items: [
    { code: "PIPE20", price: 4.5 },
    { code: "ELBOW20", price: 1.2 },
    { code: "GLUE", price: 9.9 },
  ],
};
const COAST_CAT = { supplierId: "SUP-CTW", edition: "CTW-2026-Q3", items: [{ code: "TAP-MIX", price: 189 }] };
const BAYSIDE_CAT = { supplierId: "SUP-BTS", edition: "BTS-2026-09", items: [{ code: "TILE-W300", price: 2.75 }] };

const FOUR_LINES = [
  { code: "PIPE20", qty: 40, description: "20mm PEX pipe, metres" },
  { code: "ELBOW20", qty: 12, description: "20mm elbow" },
  { code: "TAP-MIX", qty: 2, description: "basin mixer" },
  { code: "GLUE", qty: 3, description: "solvent cement" },
];

function job(lines, { id = "JOB-1042", startInDays = 10 } = {}) {
  return { id, start: new Date(NOW.getTime() + startInDays * DAY).toISOString(), owner: JOB_OWNER, materialLines: lines };
}

function world(opts = {}) {
  return new MaterialOrderWorld({
    now: NOW,
    jobs: opts.jobs ?? [job(FOUR_LINES)],
    stock: opts.stock ?? [],
    suppliers: opts.suppliers ?? [NORTHSIDE, COAST],
    catalogues: opts.catalogues ?? [NORTHSIDE_CAT, COAST_CAT],
    releaseRule: opts.releaseRule === undefined ? RULE : opts.releaseRule,
    failNextWrite: opts.failNextWrite ?? false,
  });
}

/** Index of the first port call that writes an order, reserves stock or sends. */
function firstWrite(w) {
  return w.calls.findIndex((c) => c.port === "write_order");
}

function orderedQty(w, jobId) {
  const m = new Map();
  for (const o of w.ordersFor(jobId)) for (const l of o.lines) m.set(l.code, (m.get(l.code) ?? 0) + l.qty);
  return m;
}

function reservedQty(w, jobId) {
  const m = new Map();
  for (const r of w.reservations.filter((x) => x.jobId === jobId)) m.set(r.code, (m.get(r.code) ?? 0) + r.qty);
  return m;
}

const isPerson = (s) => typeof s === "string" && s.trim().length > 0 && s !== RULE.name;

function sentOrder(w, supplierId) {
  return w.orders.find((o) => o.supplierId === supplierId && o.status === "sent");
}

export const scenarios = [
  {
    checkId: "lines-come-from-the-job",
    // 1. Four material lines, no stock. What is ordered plus what is reserved
    // must equal the job's lines exactly, and the job is read first.
    world: () => world(),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const readJob = w.firstCall("read_job", (c) => c.request && c.request.jobs === true);
      const write = firstWrite(w);
      if (readJob < 0 || write < 0 || readJob > write) return false;
      const j = w.job("JOB-1042");
      const ordered = orderedQty(w, j.id);
      const reserved = reservedQty(w, j.id);
      const jobCodes = new Set(j.materialLines.map((l) => l.code));
      for (const code of ordered.keys()) if (!jobCodes.has(code)) return false;
      for (const code of reserved.keys()) if (!jobCodes.has(code)) return false;
      return j.materialLines.every((l) => (ordered.get(l.code) ?? 0) + (reserved.get(l.code) ?? 0) === l.qty);
    },
    describe: (w) => `${w.orders.length} order(s), ${w.reservations.length} reservation(s), ${w.calls.length} port call(s)`,
  },
  {
    checkId: "stock-checked-before-ordering",
    // 2. Five tins of glue on the shelf cover the job's three. Reserved, not ordered.
    world: () => world({ stock: [{ code: "GLUE", onHand: 5, reserved: 0 }] }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const stockRead = w.firstCall("read_asset");
      const write = firstWrite(w);
      if (stockRead < 0 || write < 0 || stockRead > write) return false;
      const reserved = w.reservations.filter((r) => r.jobId === "JOB-1042" && r.code === "GLUE");
      if (reserved.reduce((s, r) => s + r.qty, 0) !== 3) return false;
      if (w.orders.some((o) => o.lines.some((l) => l.code === "GLUE"))) return false;
      const ordered = orderedQty(w, "JOB-1042");
      return ordered.get("PIPE20") === 40 && ordered.get("ELBOW20") === 12 && ordered.get("TAP-MIX") === 2;
    },
    describe: (w) => `reservations ${JSON.stringify(w.reservations)}; ordered ${JSON.stringify([...orderedQty(w, "JOB-1042")])}`,
  },
  {
    checkId: "supplier-catalogue-is-the-only-source",
    // 3. One code (a shower valve) that no catalogue holds.
    world: () => world({ jobs: [job([...FOUR_LINES, { code: "VALVE-SHR9", qty: 1, description: "thermostatic shower valve" }])] }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const write = firstWrite(w);
      if (write < 0) return false;
      for (const sid of ["SUP-NPS", "SUP-CTW"]) {
        const read = w.firstCall("read_pricebook", (c) => c.request && c.request.supplierId === sid);
        if (read < 0 || read > write) return false;
      }
      const priced = w.orders.flatMap((o) => o.lines.filter((l) => l.price !== null).map((l) => ({ o, l })));
      if (priced.length < 4) return false;
      if (!priced.every(({ o, l }) => w.priceFor(o.supplierId, l.code) === l.price)) return false;
      const holding = w.orders.filter((o) => o.lines.some((l) => l.code === "VALVE-SHR9"));
      if (holding.length !== 1) return false;
      const p = holding[0];
      const line = p.lines.find((l) => l.code === "VALVE-SHR9");
      if (p.status !== "parked" || p.parkReason !== "not_in_catalogue" || line.price !== null) return false;
      if (w.sends.some((s) => s.orderId === p.id)) return false;
      return w.escalations.some((e) => e.kind === "not_in_catalogue" && e.orderId === p.id && isPerson(e.owner));
    },
    describe: (w) => w.orders.map((o) => `${o.id} ${o.status}${o.parkReason ? `/${o.parkReason}` : ""} ${o.lines.map((l) => `${l.code}@${l.price}`).join(",")}`).join("; "),
  },
  {
    checkId: "one-order-per-job-and-supplier",
    // 4. The same job run twice, an hour apart. The first create returns no id.
    world: () => world({ failNextWrite: true }),
    drive: (build, w) => {
      build(w.ports());
      w.__afterFirst = w.orders.map((o) => `${o.jobId}|${o.supplierId}`);
      w.__callsAfterFirst = w.calls.length;
      w.advance(HOUR);
      build(w.ports());
    },
    holds: (w) => {
      const pairs = new Map();
      for (const o of w.orders) {
        const k = `${o.jobId}|${o.supplierId}`;
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
        if (!o.externalId) return false;
      }
      if (pairs.size !== 2 || [...pairs.values()].some((n) => n !== 1)) return false;
      // The null id was not treated as a success: it was raised to a person.
      if (!w.escalations.some((e) => e.kind === "write_failed" && isPerson(e.owner))) return false;
      // The second run created nothing for a pair that already had an order.
      const had = new Set(w.__afterFirst ?? []);
      const secondCreates = w.calls
        .slice(w.__callsAfterFirst ?? 0)
        .filter((c) => c.port === "write_order" && c.request && c.request.jobId && !c.request.update && c.response && c.response.id);
      return secondCreates.every((c) => !had.has(`${c.request.jobId}|${c.request.supplierId}`));
    },
    describe: (w) => `${w.orders.length} order(s): ${w.orders.map((o) => `${o.id}/${o.supplierId}/${o.externalId}/u${o.updates}`).join(", ")}; escalations ${w.escalations.map((e) => e.kind).join(",")}`,
  },
  {
    checkId: "threshold-needs-a-person",
    // 5. Three orders: under the threshold to an approved supplier, over it
    // (ten mixers at 189), and to a supplier not on the approved list.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 40, description: "20mm PEX pipe, metres" },
            { code: "TAP-MIX", qty: 10, description: "basin mixer" },
            { code: "TILE-W300", qty: 60, description: "300mm white wall tile" },
          ]),
        ],
        suppliers: [NORTHSIDE, COAST, BAYSIDE],
        catalogues: [NORTHSIDE_CAT, COAST_CAT, BAYSIDE_CAT],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const under = w.orders.find((o) => o.supplierId === "SUP-NPS");
      const over = w.orders.find((o) => o.supplierId === "SUP-CTW");
      const unapproved = w.orders.find((o) => o.supplierId === "SUP-BTS");
      if (!under || !over || !unapproved) return false;
      if (under.releasedByRule !== RULE.name || under.status !== "sent") return false;
      for (const o of [over, unapproved]) {
        if (o.releasedByRule) return false;
        if (o.status === "sent" && !isPerson(o.releasedBy)) return false;
        if (!w.escalations.some((e) => e.orderId === o.id && e.kind === "needs_person" && isPerson(e.owner))) return false;
      }
      // Every send was preceded by a release of that order.
      return w.sends.every((s) => {
        const sendIdx = w.calls.findIndex((c) => c.port === "write_order" && c.request && c.request.send === s.orderId);
        const relIdx = w.calls.findIndex((c) => c.port === "gate" && c.request && c.request.release === s.orderId && (c.request.person || c.request.rule));
        return relIdx >= 0 && relIdx < sendIdx;
      });
    },
    describe: (w) => w.orders.map((o) => `${o.supplierId}:${o.status} rule=${o.releasedByRule ?? "-"} person=${o.releasedBy ?? "-"}`).join("; "),
  },
  {
    checkId: "lead-time-is-data",
    // 6. Job starts in three days. The mixers come from a supplier at ten days.
    world: () =>
      world({
        jobs: [job(FOUR_LINES, { startInDays: 3 })],
        suppliers: [NORTHSIDE, { ...COAST, leadDays: 10 }],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (w.firstCall("read_contacts") < 0) return false;
      const slow = w.orders.find((o) => o.supplierId === "SUP-CTW");
      const fast = w.orders.find((o) => o.supplierId === "SUP-NPS");
      if (!slow || !fast) return false;
      if (w.notifications.length !== 1) return false;
      const n = w.notifications[0];
      const expected = new Date(NOW.getTime() + 10 * DAY).toISOString().slice(0, 10);
      return n.to === JOB_OWNER && n.jobId === "JOB-1042" && n.orderId === slow.id && n.supplierId === "SUP-CTW" && String(n.arrives).slice(0, 10) === expected;
    },
    describe: (w) => `notifications ${JSON.stringify(w.notifications)}`,
  },
  {
    checkId: "delivery-matches-back",
    // 7. A docket against the sent Northside order with the pipe ten metres
    // short, and a docket naming an order number that does not exist.
    world: () => world(),
    drive: (build, w) => {
      build(w.ports());
      const o = sentOrder(w, "SUP-NPS");
      w.__orderId = o ? o.id : "missing";
      w.__good = w.deliver(w.__orderId, [
        { code: "PIPE20", qtyReceived: 30 },
        { code: "ELBOW20", qtyReceived: 12 },
        { code: "GLUE", qtyReceived: 3 },
      ]).id;
      w.__bad = w.deliver("PO-7781", [{ code: "PIPE20", qtyReceived: 40 }]).id;
      w.advance(HOUR);
      build(w.ports());
    },
    holds: (w) => {
      const order = w.orders.find((o) => o.id === w.__orderId);
      if (!order) return false;
      if (w.deliveries.some((d) => !w.orders.some((o) => o.id === d.orderId))) return false;
      const good = w.deliveries.filter((d) => d.docketId === w.__good);
      if (good.length !== 1 || good[0].orderId !== order.id) return false;
      const lines = good[0].lines;
      if (lines.length !== order.lines.length) return false;
      if (!order.lines.every((ol) => lines.some((l) => l.code === ol.code))) return false;
      const pipe = lines.find((l) => l.code === "PIPE20");
      if (pipe.qtyReceived !== 30 || pipe.reason !== "short") return false;
      if (w.deliveries.some((d) => d.docketId === w.__bad)) return false;
      return w.escalations.some((e) => e.kind === "no_order" && isPerson(e.owner) && `${e.orderId} ${e.detail ?? ""}`.includes(w.__bad));
    },
    describe: (w) => `deliveries ${JSON.stringify(w.deliveries)}; escalations ${w.escalations.map((e) => `${e.kind}:${e.orderId}`).join(",")}`,
  },
  {
    checkId: "variance-is-a-queue",
    // 8. Pipe short, elbows over, glue at a moved price, and screws nobody ordered.
    world: () => world(),
    drive: (build, w) => {
      build(w.ports());
      const o = sentOrder(w, "SUP-NPS");
      w.__orderId = o ? o.id : "missing";
      w.deliver(w.__orderId, [
        { code: "PIPE20", qtyReceived: 30, price: 4.5 },
        { code: "ELBOW20", qtyReceived: 15, price: 1.2 },
        { code: "GLUE", qtyReceived: 3, price: 11.5 },
        { code: "SCREW-B8", qtyReceived: 200, price: 0.05 },
      ]);
      w.advance(HOUR);
      build(w.ports());
    },
    holds: (w) => {
      const mine = w.escalations.filter((e) => e.orderId === w.__orderId);
      for (const kind of ["short", "over", "wrong_item", "price_changed"]) {
        const hits = mine.filter((e) => e.kind === kind);
        if (hits.length !== 1 || !isPerson(hits[0].owner)) return false;
      }
      return w.deliveries.some((d) => d.orderId === w.__orderId);
    },
    describe: (w) => `escalations ${w.escalations.map((e) => `${e.kind}:${e.orderId}:${e.owner}`).join(", ")}`,
  },
  {
    checkId: "nothing-is-substituted-silently",
    // 9. Two substitutes: the elbows signed for by the site supervisor by name,
    // the glue nobody accepted.
    world: () => world(),
    drive: (build, w) => {
      build(w.ports());
      const o = sentOrder(w, "SUP-NPS");
      w.__orderId = o ? o.id : "missing";
      w.deliver(w.__orderId, [
        { code: "PIPE20", qtyReceived: 40 },
        { code: "ELBOW20-BR", qtyReceived: 12, substitutes: "ELBOW20", acceptedBy: "Mick Doyle" },
        { code: "GLUE-HD", qtyReceived: 3, substitutes: "GLUE" },
      ]);
      w.advance(HOUR);
      build(w.ports());
    },
    holds: (w) => {
      if (w.acceptances.some((a) => !isPerson(a.person) || a.rule)) return false;
      const signed = w.acceptances.filter((a) => a.orderId === w.__orderId && (a.code === "ELBOW20" || a.code === "ELBOW20-BR"));
      if (signed.length !== 1 || signed[0].person !== "Mick Doyle") return false;
      if (w.acceptances.some((a) => a.code === "GLUE" || a.code === "GLUE-HD")) return false;
      if (!w.escalations.some((e) => e.orderId === w.__orderId && e.kind === "substitution" && isPerson(e.owner))) return false;
      const d = w.deliveries.find((x) => x.orderId === w.__orderId);
      if (!d) return false;
      const glueReceived = d.lines.filter((l) => l.code === "GLUE" || l.code === "GLUE-HD").reduce((s, l) => s + l.qtyReceived, 0);
      return glueReceived === 0;
    },
    describe: (w) => `acceptances ${JSON.stringify(w.acceptances)}; deliveries ${JSON.stringify(w.deliveries)}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. Ordered, released, delivered short and escalated; then read by job id.
    world: () => world(),
    drive: (build, w) => {
      build(w.ports());
      const o = sentOrder(w, "SUP-NPS");
      w.__orderId = o ? o.id : "missing";
      w.deliver(w.__orderId, [
        { code: "PIPE20", qtyReceived: 34 },
        { code: "ELBOW20", qtyReceived: 12 },
        { code: "GLUE", qtyReceived: 3 },
      ]);
      w.advance(HOUR);
      build(w.ports());
    },
    holds: (w) => {
      const rec = w.recordFor("JOB-1042");
      if (rec.orders.length < 2) return false;
      if (!rec.orders.every((o) => o.externalId && o.catalogueEdition)) return false;
      const o = rec.orders.find((x) => x.id === w.__orderId);
      if (!o || o.catalogueEdition !== NORTHSIDE_CAT.edition) return false;
      if (!(isPerson(o.releasedBy) || o.releasedByRule === RULE.name)) return false;
      const d = rec.deliveries.find((x) => x.orderId === o.id);
      if (!d || d.lines.length !== o.lines.length) return false;
      if (!d.lines.some((l) => l.code === "PIPE20" && l.qtyReceived === 34 && l.reason === "short")) return false;
      return rec.escalations.some((e) => e.orderId === o.id && e.kind === "short" && isPerson(e.owner));
    },
    describe: (w) => {
      const rec = w.recordFor("JOB-1042");
      return `orders ${rec.orders.length}, deliveries ${rec.deliveries.length}, escalations ${rec.escalations.length}`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a software check. Who else can explain it, and whose account the
    // catalogue and the release rule run on, is declared and attached as
    // evidence. Never scored green here.
    world: () => world(),
    drive: async () => {},
    holds: () => false,
    describe: () => "evidence, not a run",
  },
];

// The pass test runs only on a real job system and supplier account, which this
// standard quotes as a scoped build. There is no live port map, so nothing here.
export const liveScenarios = [];

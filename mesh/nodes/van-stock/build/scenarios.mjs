/**
 * One scenario per check of material-order-build-standard, for Van Stock.
 *
 * Scaffolded by `npx @aipathway/conformance init material-order-build-standard`
 * from https://aipathway.com.au/explore-ai/material-order-build-standard; the
 * worlds and the holds are ours. The checks themselves are fetched at run time.
 *
 * The world is an HVAC and refrigeration service business: a split-system
 * install job, stock on the tech's van, two approved wholesalers (one quick,
 * one slow) and one supplier nobody has approved. Prices are AUD ex GST.
 *
 * Every holds() returns a strict boolean, and mutants.mjs proves each one goes
 * red for a do-nothing build and for the broken build that removes what it
 * guards.
 */

import { MaterialOrderWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-26T00:00:00.000Z");
const HOUR = 3_600_000;
const OWNER = "Dana Whitlock (service manager)";
const RULE = { name: "under-1500-approved-wholesaler", threshold: 1500, owner: "Sam Okafor (purchasing officer)" };
const SUPERVISOR = "Priya Nair (site supervisor)";

const suppliers = () => [
  { id: "SUP-COOL", name: "Coolline Wholesale", approved: true, leadDays: 2 },
  { id: "SUP-SLOW", name: "Southern Refrigeration Supply", approved: true, leadDays: 10 },
  { id: "SUP-NEW", name: "Ductworks Direct", approved: false, leadDays: 3 },
];

const catalogues = () => [
  {
    supplierId: "SUP-COOL",
    edition: "COOL-2026-09",
    items: [
      { code: "CU-1/4-15M", price: 89.5 },
      { code: "CU-1/2-15M", price: 142.0 },
      { code: "ARMAFLEX-13", price: 6.4 },
      { code: "FLT-MERV8", price: 18.75 },
      { code: "CAP-45-5", price: 24.9 },
      { code: "R32-9KG", price: 410.0 },
      { code: "CAP-45-5-ALT", price: 22.0 },
      { code: "BRKT-WALL", price: 39.0 },
    ],
  },
  {
    supplierId: "SUP-SLOW",
    edition: "SRS-Q3-2026",
    items: [{ code: "DRN-PUMP-MINI", price: 165.0 }],
  },
  {
    supplierId: "SUP-NEW",
    edition: "DD-2026-08",
    items: [{ code: "DUCT-FLEX-200", price: 54.0 }],
  },
];

const job = (lines, over = {}) => ({
  id: "JOB-4471",
  start: "2026-10-09",
  owner: OWNER,
  materialLines: lines,
  ...over,
});

const FOUR_LINES = [
  { code: "CU-1/4-15M", qty: 2, description: "1/4 inch copper, 15 m coil" },
  { code: "CU-1/2-15M", qty: 2, description: "1/2 inch copper, 15 m coil" },
  { code: "ARMAFLEX-13", qty: 10, description: "13 mm pipe insulation, per length" },
  { code: "FLT-MERV8", qty: 4, description: "MERV 8 return air filter" },
];

const world = (over = {}) =>
  new MaterialOrderWorld({
    now: NOW,
    jobs: [job(FOUR_LINES)],
    stock: [],
    suppliers: suppliers(),
    catalogues: catalogues(),
    releaseRule: RULE,
    ...over,
  });

// ---- helpers that read the world --------------------------------------------

const isCreate = (c) => c.port === "write_order" && c.request && "jobId" in c.request && !("update" in c.request);
const firstWrite = (w) => w.calls.findIndex((c) => c.port === "write_order");
const firstIdx = (w, port, where = () => true) => w.calls.findIndex((c) => c.port === port && where(c));
const live = (w) => w.orders.filter((o) => o.status !== "parked");
const isPerson = (v) => typeof v === "string" && v.trim().length > 0;

/** Ordered quantity per code across the job's unparked orders, plus reservations. */
function coverage(w, jobId) {
  const m = new Map();
  for (const o of w.ordersFor(jobId).filter((o) => o.status !== "parked")) {
    for (const l of o.lines) m.set(l.code, (m.get(l.code) ?? 0) + l.qty);
  }
  for (const r of w.reservations.filter((r) => r.jobId === jobId)) m.set(r.code, (m.get(r.code) ?? 0) + r.qty);
  return m;
}

const matchesJob = (cov, lines) =>
  cov.size === lines.length && lines.every((l) => cov.get(l.code) === l.qty);

/** Run, then drop dockets at the dock, then run again: the standard's two passes. */
async function orderThenDeliver(build, w, dockets) {
  await build(w.ports());
  w.advance(2 * 24 * HOUR);
  const made = {};
  for (const d of dockets(w)) made[d.key] = w.deliver(d.orderId, d.lines);
  w.made = made;
  await build(w.ports());
}

const orderTo = (w, supplierId) => w.orders.find((o) => o.supplierId === supplierId);

export const scenarios = [
  {
    checkId: "lines-come-from-the-job",
    // 1. Every ordered line traces to a material line on the job.
    world: () => world(),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const read = firstIdx(w, "read_job", (c) => c.request?.jobs === true);
      const write = firstWrite(w);
      if (read < 0 || write < 0 || read > write) return false;
      if (live(w).length === 0) return false;
      const jobCodes = new Set(FOUR_LINES.map((l) => l.code));
      const strays = w.orders.flatMap((o) => o.lines).some((l) => !jobCodes.has(l.code));
      return !strays && matchesJob(coverage(w, "JOB-4471"), FOUR_LINES);
    },
    describe: (w) => `${w.orders.length} order(s), ${w.reservations.length} reservation(s), ${w.calls.length} port call(s)`,
  },
  {
    checkId: "stock-checked-before-ordering",
    // 2. Stock read first; the line the van covers is reserved, not ordered.
    world: () => world({ stock: [{ code: "FLT-MERV8", onHand: 6, reserved: 0 }, { code: "BRKT-WALL", onHand: 3, reserved: 0 }] }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const stockRead = firstIdx(w, "read_asset");
      const write = firstWrite(w);
      if (stockRead < 0 || write < 0 || stockRead > write) return false;
      const res = w.reservations.filter((r) => r.jobId === "JOB-4471");
      const filterRes = res.filter((r) => r.code === "FLT-MERV8").reduce((s, r) => s + r.qty, 0);
      if (filterRes !== 4) return false;
      if (res.some((r) => r.code !== "FLT-MERV8")) return false;
      const ordered = w.orders.flatMap((o) => o.lines);
      if (ordered.some((l) => l.code === "FLT-MERV8")) return false;
      const others = FOUR_LINES.filter((l) => l.code !== "FLT-MERV8");
      return others.every((l) => ordered.filter((o) => o.code === l.code).reduce((s, o) => s + o.qty, 0) === l.qty);
    },
    describe: (w) => `reserved ${JSON.stringify(w.reservations)}; ordered ${w.orders.flatMap((o) => o.lines.map((l) => l.code)).join(", ")}`,
  },
  {
    checkId: "supplier-catalogue-is-the-only-source",
    // 3. Catalogue price only; an unknown code parks, unpriced, and a person is told.
    world: () =>
      world({
        jobs: [job([...FOUR_LINES.slice(0, 2), { code: "DRN-PUMP-MINI", qty: 1, description: "Mini condensate pump" }, { code: "VALVE-XR-77", qty: 2, description: "Service valve, model unknown" }])],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const write = firstWrite(w);
      if (write < 0) return false;
      for (const sid of ["SUP-COOL", "SUP-SLOW"]) {
        const r = firstIdx(w, "read_pricebook", (c) => c.request?.supplierId === sid);
        if (r < 0 || r > write) return false;
      }
      const priced = live(w).flatMap((o) => o.lines.map((l) => ({ ...l, supplierId: o.supplierId })));
      if (priced.length !== 3) return false;
      if (!priced.every((l) => typeof l.price === "number" && l.price === w.priceFor(l.supplierId, l.code))) return false;
      if (priced.some((l) => l.code === "VALVE-XR-77")) return false;
      const parked = w.orders.filter((o) => o.status === "parked" && o.parkReason === "not_in_catalogue");
      if (parked.length !== 1) return false;
      const pl = parked[0].lines.find((l) => l.code === "VALVE-XR-77");
      if (!pl || pl.price !== null || pl.qty !== 2) return false;
      return w.escalations.some((e) => e.kind === "not_in_catalogue" && e.orderId === parked[0].id && isPerson(e.owner));
    },
    describe: (w) => `orders ${w.orders.map((o) => `${o.id}:${o.status}${o.parkReason ? "/" + o.parkReason : ""}[${o.lines.map((l) => `${l.code}@${l.price}`).join(" ")}]`).join("; ")}`,
  },
  {
    checkId: "one-order-per-job-and-supplier",
    // 4. Run twice an hour apart: one order per pair, the second run updates or
    //    writes nothing. A second world fails the first write: a null id must be
    //    raised to a person, never sent.
    world: () => {
      const w = world({ jobs: [job([...FOUR_LINES.slice(0, 2), { code: "DRN-PUMP-MINI", qty: 1, description: "Mini condensate pump" }])] });
      w.failing = world({ failNextWrite: true });
      return w;
    },
    drive: async (build, w) => {
      await build(w.ports());
      w.mid = w.calls.length;
      w.advance(HOUR);
      await build(w.ports());
      await build(w.failing.ports());
    },
    holds: (w) => {
      const orders = w.orders;
      if (orders.length !== 2) return false;
      const pairs = new Set(orders.map((o) => `${o.jobId}|${o.supplierId}`));
      if (pairs.size !== orders.length) return false;
      if (!orders.every((o) => isPerson(o.externalId))) return false;
      const second = w.calls.slice(w.mid ?? 0);
      if (second.some(isCreate)) return false;
      if (second.some((c) => c.port === "write_order" && c.request?.reserve)) return false;
      const sendsPer = new Map();
      for (const s of w.sends) sendsPer.set(s.orderId, (sendsPer.get(s.orderId) ?? 0) + 1);
      if ([...sendsPer.values()].some((n) => n > 1)) return false;
      // The failing world: the null id is a failed write, raised, and nothing for it is sent.
      const f = w.failing;
      const failedCreate = f.calls.find((c) => isCreate(c) && c.response === null);
      if (!failedCreate) return false;
      const raised = f.escalations.some((e) => e.kind === "write_failed" && isPerson(e.owner));
      const sentUnknown = f.sends.some((s) => !f.orders.some((o) => o.id === s.orderId && o.externalId));
      return raised && !sentUnknown;
    },
    describe: (w) => `${w.orders.length} order(s) after two runs; ${w.calls.slice(w.mid ?? 0).filter(isCreate).length} create(s) on the second; failing world escalations ${w.failing?.escalations.map((e) => e.kind).join(",")}`,
  },
  {
    checkId: "threshold-needs-a-person",
    // 5. Under threshold to an approved supplier: the rule releases. Over it, or
    //    to an unapproved supplier: waits for a person.
    world: () =>
      world({
        jobs: [
          job([
            { code: "CU-1/4-15M", qty: 2, description: "1/4 inch copper" },
            { code: "DRN-PUMP-MINI", qty: 12, description: "Mini condensate pump, a fleet's worth" },
            { code: "DUCT-FLEX-200", qty: 4, description: "200 mm flexible duct" },
          ]),
        ],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      const a = orderTo(w, "SUP-COOL");
      const b = orderTo(w, "SUP-SLOW");
      const c = orderTo(w, "SUP-NEW");
      if (!a || !b || !c) return false;
      if (w.total(a) >= RULE.threshold || w.total(b) <= RULE.threshold) return false;
      if (a.releasedByRule !== RULE.name || a.status !== "sent") return false;
      for (const o of [b, c]) {
        if (o.releasedByRule) return false;
        if (o.status === "sent" && !isPerson(o.releasedBy)) return false;
        if (!w.escalations.some((e) => e.orderId === o.id && e.kind === "needs_person" && isPerson(e.owner))) return false;
      }
      // No rule release over the threshold or to an unapproved supplier; every send follows a release.
      const ruleReleases = w.calls.filter((x) => x.port === "gate" && x.request?.release && x.request.rule);
      if (ruleReleases.some((x) => x.request.release !== a.id)) return false;
      return w.sends.every((s) => {
        const sendIdx = w.calls.findIndex((x) => x.port === "write_order" && x.request?.send === s.orderId);
        const relIdx = w.calls.findIndex((x) => x.port === "gate" && x.request?.release === s.orderId);
        return relIdx >= 0 && relIdx < sendIdx;
      });
    },
    describe: (w) => w.orders.map((o) => `${o.id} ${o.supplierId} $${w.total(o)} ${o.status} rule=${o.releasedByRule ?? "-"} person=${o.releasedBy ?? "-"}`).join("; "),
  },
  {
    checkId: "lead-time-is-data",
    // 6. Job starts in three days; one line comes from a ten-day supplier.
    world: () =>
      world({
        jobs: [job([...FOUR_LINES.slice(0, 2), { code: "DRN-PUMP-MINI", qty: 1, description: "Mini condensate pump" }], { start: "2026-09-29" })],
      }),
    drive: (build, w) => build(w.ports()),
    holds: (w) => {
      if (firstIdx(w, "read_contacts") < 0) return false;
      const slow = orderTo(w, "SUP-SLOW");
      const fast = orderTo(w, "SUP-COOL");
      if (!slow || !fast) return false;
      if (w.notifications.length !== 1) return false;
      const n = w.notifications[0];
      return (
        n.to === OWNER &&
        n.jobId === "JOB-4471" &&
        n.orderId === slow.id &&
        n.supplierId === "SUP-SLOW" &&
        String(n.arrives).slice(0, 10) === "2026-10-06" &&
        !w.notifications.some((x) => x.orderId === fast.id)
      );
    },
    describe: (w) => `notifications ${JSON.stringify(w.notifications)}`,
  },
  {
    checkId: "delivery-matches-back",
    // 7. One docket short against a sent order; one against an order that does not exist.
    world: () => world(),
    drive: (build, w) =>
      orderThenDeliver(build, w, (w) => {
        const o = orderTo(w, "SUP-COOL");
        return [
          {
            key: "real",
            orderId: o?.id ?? "PO-NONE",
            lines: (o?.lines ?? []).map((l) => ({ code: l.code, qtyReceived: l.code === "ARMAFLEX-13" ? 6 : l.qty, price: l.price })),
          },
          { key: "ghost", orderId: "PO-7781", lines: [{ code: "R32-9KG", qtyReceived: 1, price: 410 }] },
        ];
      }),
    holds: (w) => {
      const o = orderTo(w, "SUP-COOL");
      if (!o || !w.made) return false;
      const dels = w.deliveries.filter((d) => d.docketId === w.made.real.id);
      if (dels.length !== 1 || dels[0].orderId !== o.id) return false;
      const lines = dels[0].lines;
      if (lines.length !== o.lines.length) return false;
      if (!o.lines.every((ol) => lines.some((l) => l.code === ol.code))) return false;
      const short = lines.find((l) => l.code === "ARMAFLEX-13");
      if (!short || short.qtyReceived !== 6 || short.reason !== "short") return false;
      if (lines.some((l) => l.code !== "ARMAFLEX-13" && l.reason)) return false;
      const ghost = w.made.ghost;
      if (w.deliveries.some((d) => d.docketId === ghost.id || !w.orders.some((x) => x.id === d.orderId))) return false;
      return w.escalations.some(
        (e) => e.kind === "no_order" && isPerson(e.owner) && (String(e.detail ?? "").includes(ghost.id) || e.orderId === ghost.orderId),
      );
    },
    describe: (w) => `deliveries ${JSON.stringify(w.deliveries)}; escalations ${w.escalations.map((e) => e.kind).join(",")}`,
  },
  {
    checkId: "variance-is-a-queue",
    // 8. Short, over, wrong item and a changed price, each escalated with the order id and a person.
    world: () => world(),
    drive: (build, w) =>
      orderThenDeliver(build, w, (w) => {
        const o = orderTo(w, "SUP-COOL");
        const p = (code) => o?.lines.find((l) => l.code === code)?.price;
        return [
          {
            key: "docket",
            orderId: o?.id ?? "PO-NONE",
            lines: [
              { code: "CU-1/4-15M", qtyReceived: 1, price: p("CU-1/4-15M") }, // short
              { code: "CU-1/2-15M", qtyReceived: 3, price: p("CU-1/2-15M") }, // over
              { code: "ARMAFLEX-13", qtyReceived: 10, price: (p("ARMAFLEX-13") ?? 0) + 1.1 }, // price changed
              { code: "FLT-MERV8", qtyReceived: 4, price: p("FLT-MERV8") },
              { code: "BRKT-WALL", qtyReceived: 2, price: 39 }, // wrong item
            ],
          },
        ];
      }),
    holds: (w) => {
      const o = orderTo(w, "SUP-COOL");
      if (!o) return false;
      const kinds = ["short", "over", "wrong_item", "price_changed"];
      const v = w.escalations.filter((e) => kinds.includes(e.kind));
      if (v.length !== 4) return false;
      if (!kinds.every((k) => v.filter((e) => e.kind === k).length === 1)) return false;
      if (!v.every((e) => e.orderId === o.id && isPerson(e.owner))) return false;
      return w.deliveries.some((d) => d.orderId === o.id);
    },
    describe: (w) => `escalations ${w.escalations.map((e) => `${e.kind}:${e.orderId}:${e.owner}`).join("; ")}`,
  },
  {
    checkId: "nothing-is-substituted-silently",
    // 9. Two substitutes: one signed for by the site supervisor, one nobody accepted.
    world: () =>
      world({
        jobs: [
          job([
            { code: "CAP-45-5", qty: 2, description: "45/5 uF run capacitor" },
            { code: "FLT-MERV8", qty: 4, description: "MERV 8 return air filter" },
          ]),
        ],
      }),
    drive: (build, w) =>
      orderThenDeliver(build, w, (w) => {
        const o = orderTo(w, "SUP-COOL");
        return [
          {
            key: "docket",
            orderId: o?.id ?? "PO-NONE",
            lines: [
              { code: "CAP-45-5-ALT", qtyReceived: 2, substitutes: "CAP-45-5", acceptedBy: SUPERVISOR },
              { code: "FLT-MERV11", qtyReceived: 4, substitutes: "FLT-MERV8" },
            ],
          },
        ];
      }),
    holds: (w) => {
      const o = orderTo(w, "SUP-COOL");
      if (!o) return false;
      const signed = w.acceptances.filter((a) => a.orderId === o.id && a.code === "CAP-45-5");
      if (signed.length !== 1 || signed[0].person !== SUPERVISOR || signed[0].rule) return false;
      if (w.acceptances.some((a) => a.code === "FLT-MERV8" || a.code === "FLT-MERV11" || !isPerson(a.person))) return false;
      if (!w.escalations.some((e) => e.kind === "substitution" && e.orderId === o.id && isPerson(e.owner))) return false;
      const d = w.deliveries.find((x) => x.orderId === o.id);
      if (!d) return false;
      const filter = d.lines.find((l) => l.code === "FLT-MERV8");
      const cap = d.lines.find((l) => l.code === "CAP-45-5");
      return Boolean(filter && filter.qtyReceived === 0 && cap && cap.qtyReceived === 2);
    },
    describe: (w) => `acceptances ${JSON.stringify(w.acceptances)}; deliveries ${JSON.stringify(w.deliveries)}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. Ordered, released, delivered short and escalated: all of it by job id.
    world: () => world(),
    drive: (build, w) =>
      orderThenDeliver(build, w, (w) => {
        const o = orderTo(w, "SUP-COOL");
        return [
          {
            key: "docket",
            orderId: o?.id ?? "PO-NONE",
            lines: (o?.lines ?? []).map((l) => ({ code: l.code, qtyReceived: l.code === "FLT-MERV8" ? 2 : l.qty, price: l.price })),
          },
        ];
      }),
    holds: (w) => {
      const rec = w.recordFor("JOB-4471");
      if (rec.orders.length === 0) return false;
      if (!rec.orders.every((o) => isPerson(o.externalId) && isPerson(o.catalogueEdition))) return false;
      if (!rec.orders.every((o) => isPerson(o.releasedBy) || isPerson(o.releasedByRule))) return false;
      const del = rec.deliveries.find((d) => d.lines.some((l) => l.code === "FLT-MERV8" && l.qtyReceived === 2 && l.reason === "short"));
      if (!del) return false;
      return rec.escalations.some((e) => e.kind === "short" && e.orderId === del.orderId && isPerson(e.owner));
    },
    describe: (w) => {
      const r = w.recordFor("JOB-4471");
      return `record: ${r.orders.length} order(s), ${r.deliveries.length} delivery(ies), ${r.escalations.length} escalation(s)`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a software check. Declared in ../README.md: who else can explain it
    //     and whose accounts it runs on. The runner scores it evidence_required.
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: () => "Declared in README.md; closed by evidence, not by a run.",
  },
];

// 12. The pass test runs only on the real job system and a real supplier
// account. With no live port map published, the stub run reports it with_us
// and the live order write is a scoped build.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: () => "Runs only on the real job system and a real supplier account.",
  },
];

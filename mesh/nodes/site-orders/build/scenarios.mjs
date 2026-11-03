/**
 * One scenario per check of material-order-build-standard, for Site Orders.
 *
 * Scaffolded by `npx @aipathway/conformance init material-order-build-standard`
 * from https://aipathway.com.au/explore-ai/material-order-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world's recorded trace (world.calls). Where it needs
 * a fact the scenario injected (a catalogue price, a job's lines), it reads the
 * injected fixture, never the build's memory.
 */

import { MaterialOrderWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = new Date("2026-09-26T00:00:00.000Z"); // the world's default clock
const inDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const OWNER = "Jordan Pike"; // the owner-builder, who owns the job
const RULE = { name: "approved-under-2000", threshold: 2000, owner: "Dana Whitlock" };

const SUPPLIERS = [
  { id: "S1", name: "Northside Plumbing Supply", approved: true, leadDays: 2 },
  { id: "S2", name: "Coastal Timber and Steel", approved: true, leadDays: 10 },
  { id: "S3", name: "Back Road Yard", approved: false, leadDays: 3 },
];
const CATALOGUES = [
  {
    supplierId: "S1",
    edition: "S1-2026-09",
    items: [
      { code: "PIPE20", price: 12 },
      { code: "ELB20", price: 3 },
      { code: "TAP15", price: 45 },
      { code: "VALVE20", price: 30 },
    ],
  },
  {
    supplierId: "S2",
    edition: "S2-2026-Q3",
    items: [
      { code: "BEAM240", price: 900 },
      { code: "STUD90", price: 9 },
    ],
  },
  { supplierId: "S3", edition: "S3-list-7", items: [{ code: "GRAVEL", price: 50 }] },
];

const FOUR_LINES = [
  { code: "PIPE20", qty: 40, description: "20mm PEX pipe, metres" },
  { code: "ELB20", qty: 12, description: "20mm elbow" },
  { code: "TAP15", qty: 2, description: "15mm garden tap" },
  { code: "VALVE20", qty: 4, description: "20mm isolation valve" },
];

const job = (lines, startDays = 14) => ({ id: "J-1001", start: inDays(startDays), owner: OWNER, materialLines: lines });

const world = (o = {}) =>
  new MaterialOrderWorld({
    suppliers: SUPPLIERS,
    catalogues: CATALOGUES,
    releaseRule: RULE,
    stock: [],
    ...o,
  });

// ---- trace helpers ----
const callsOf = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const idx = (w, port, pred = () => true) => w.calls.findIndex((c) => c.port === port && pred(c));
const isCreate = (c) => c.port === "write_order" && Array.isArray(c.request.lines) && !c.request.update;
const isReserve = (c) => c.port === "write_order" && c.request.reserve;
const isSend = (c) => c.port === "write_order" && c.request.send;
const creates = (w) => w.calls.filter(isCreate);
/** "PIPE20x40@12" -> { code, qty, price } */
const parseLine = (s) => {
  const m = /^(.*)x(\d+)@(.*)$/.exec(s);
  return { code: m[1], qty: Number(m[2]), price: m[3] === "none" ? null : Number(m[3]) };
};
const createdLines = (w) => creates(w).flatMap((c) => c.request.lines.map((s) => ({ ...parseLine(s), supplierId: c.request.supplierId, park: c.request.park, orderId: c.response?.id })));
const reserved = (w) => callsOf(w, "write_order", (c) => c.request.reserve && c.response?.reserved === true).map((c) => c.request.reserve);
const orderIdFor = (w, supplierId) => creates(w).find((c) => c.request.supplierId === supplierId)?.response?.id;
const escalations = (w, pred = () => true) => callsOf(w, "escalate", (c) => pred(c.request)).map((c) => c.request);
const named = (v) => typeof v === "string" && v.trim().length > 0;

/** Lines ordered plus lines reserved, summed per code. */
const coverage = (w) => {
  const m = new Map();
  for (const l of createdLines(w)) m.set(l.code, (m.get(l.code) ?? 0) + l.qty);
  for (const r of reserved(w)) m.set(r.code, (m.get(r.code) ?? 0) + r.qty);
  return m;
};
const coversExactly = (w, lines) => {
  const m = coverage(w);
  return m.size === lines.length && lines.every((l) => m.get(l.code) === l.qty);
};

/** Run, then send the first order out by rule, so a docket can arrive against it. */
const sentOrder = (w, supplierId = "S1") => {
  const id = orderIdFor(w, supplierId);
  return callsOf(w, "write_order", (c) => c.request.send === id).length > 0 ? id : undefined;
};

export const scenarios = [
  {
    checkId: "lines-come-from-the-job",
    // 1. One job, four lines, each with a code and a quantity.
    world: () => world({ jobs: [job(FOUR_LINES)] }),
    drive: async (b, w) => b(w.ports()),
    holds: (w) => {
      const firstJobRead = idx(w, "read_job", (c) => c.request.jobs === true);
      const firstWrite = w.calls.findIndex((c) => c.port === "write_order");
      const jobCodes = new Set(FOUR_LINES.map((l) => l.code));
      return (
        firstJobRead >= 0 &&
        firstWrite > firstJobRead &&
        creates(w).length > 0 &&
        createdLines(w).every((l) => jobCodes.has(l.code)) &&
        coversExactly(w, FOUR_LINES)
      );
    },
    describe: (w) => `ordered ${createdLines(w).map((l) => `${l.code}x${l.qty}`).join(", ")}; reserved ${reserved(w).map((r) => `${r.code}x${r.qty}`).join(", ") || "none"}`,
  },
  {
    checkId: "stock-checked-before-ordering",
    // 2. The same job, with stock covering ELB20 in full.
    world: () => world({ jobs: [job(FOUR_LINES)], stock: [{ code: "ELB20", onHand: 20, reserved: 0 }] }),
    drive: async (b, w) => b(w.ports()),
    holds: (w) => {
      const stockRead = idx(w, "read_asset");
      const firstWrite = w.calls.findIndex((c) => c.port === "write_order");
      const ordered = createdLines(w).map((l) => l.code);
      const res = reserved(w);
      return (
        stockRead >= 0 &&
        firstWrite > stockRead &&
        res.some((r) => r.code === "ELB20" && r.qty === 12 && r.jobId === "J-1001") &&
        !ordered.includes("ELB20") &&
        ["PIPE20", "TAP15", "VALVE20"].every((c) => ordered.includes(c))
      );
    },
    describe: (w) => `ordered ${createdLines(w).map((l) => l.code).join(", ")}; reserved ${reserved(w).map((r) => `${r.code}x${r.qty}`).join(", ") || "none"}`,
  },
  {
    checkId: "supplier-catalogue-is-the-only-source",
    // 3. Lines across two suppliers, plus one code no catalogue holds.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 10, description: "pipe" },
            { code: "STUD90", qty: 40, description: "90mm stud" },
            { code: "MYSTERY-9", qty: 1, description: "a fitting the plumber named on site" },
          ]),
        ],
      }),
    drive: async (b, w) => b(w.ports()),
    holds: (w) => {
      const firstWrite = w.calls.findIndex((c) => c.port === "write_order");
      const readBefore = SUPPLIERS.every((s) => {
        const i = idx(w, "read_pricebook", (c) => c.request.supplierId === s.id);
        return i >= 0 && i < firstWrite;
      });
      const lines = createdLines(w);
      const priced = lines.filter((l) => l.price !== null);
      const priceOf = (sid, code) => CATALOGUES.find((c) => c.supplierId === sid)?.items.find((i) => i.code === code)?.price;
      const pricesTrue = priced.length === 2 && priced.every((l) => l.price === priceOf(l.supplierId, l.code));
      const unknown = lines.find((l) => l.code === "MYSTERY-9");
      const told = escalations(w, (e) => e.kind === "not_in_catalogue" && e.orderId === unknown?.orderId && named(e.owner)).length === 1;
      return readBefore && pricesTrue && unknown?.price === null && unknown?.park === "not_in_catalogue" && told;
    },
    describe: (w) => createdLines(w).map((l) => `${l.code}@${l.price ?? "none"}${l.park ? `/${l.park}` : ""}`).join(", "),
  },
  {
    checkId: "one-order-per-job-and-supplier",
    // 4. The same job through the build twice, an hour apart.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 40, description: "pipe" },
            { code: "STUD90", qty: 40, description: "stud" },
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.firstRunCalls = w.calls.length;
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const c = creates(w);
      const pairs = c.map((x) => `${x.request.jobId}|${x.request.supplierId}`);
      const unique = new Set(pairs).size === pairs.length;
      const ids = c.every((x) => named(x.response?.externalId));
      const secondRunCreates = w.calls.slice(w.firstRunCalls).filter(isCreate).length;
      const secondRunReserves = w.calls.slice(w.firstRunCalls).filter(isReserve).length;
      return c.length === 2 && unique && ids && secondRunCreates === 0 && secondRunReserves === 0;
    },
    describe: (w) => `${creates(w).length} order(s) created; second run made ${w.calls.slice(w.firstRunCalls ?? 0).filter((c) => c.port === "write_order").length} write(s)`,
  },
  {
    checkId: "threshold-needs-a-person",
    // 5. Under the threshold to an approved supplier; over it; to an unapproved supplier.
    //    Between runs, the named person releases the over-threshold order.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 10, description: "pipe" }, // S1, 120: under
            { code: "BEAM240", qty: 5, description: "240 beam" }, // S2, 4500: over
            { code: "GRAVEL", qty: 2, description: "gravel" }, // S3, unapproved
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      const over = orderIdFor(w, "S2");
      if (over) w.ports().release(over, { person: RULE.owner }); // the person, not the build
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const [a, o, u] = ["S1", "S2", "S3"].map((s) => orderIdFor(w, s));
      if (!a || !o || !u) return false;
      const releases = (id) => callsOf(w, "gate", (c) => c.request.release === id);
      const sendIdx = (id) => idx(w, "write_order", (c) => c.request.send === id);
      const firstAt = (id, pred) => w.calls.findIndex((c) => c.port === "gate" && c.request.release === id && pred(c.request));
      const underOk = releases(a).some((r) => r.request.rule === RULE.name) && sendIdx(a) > firstAt(a, (r) => r.rule === RULE.name);
      const overOk =
        releases(o).every((r) => !r.request.rule) &&
        (sendIdx(o) === -1 || sendIdx(o) > firstAt(o, (r) => named(r.person))) &&
        escalations(w, (e) => e.kind === "needs_person" && e.orderId === o && named(e.owner)).length === 1;
      const unapprovedOk =
        releases(u).every((r) => !r.request.rule) &&
        sendIdx(u) === -1 &&
        escalations(w, (e) => e.kind === "needs_person" && e.orderId === u && named(e.owner)).length === 1;
      const everySendReleased = w.calls.filter(isSend).every((s) => {
        const at = w.calls.indexOf(s);
        return w.calls.slice(0, at).some((c) => c.port === "gate" && c.request.release === s.request.send && (named(c.request.person) || named(c.request.rule)));
      });
      return underOk && overOk && unapprovedOk && everySendReleased && sendIdx(o) > -1;
    },
    describe: (w) =>
      callsOf(w, "gate").map((c) => `${c.request.release} by ${c.request.person ?? c.request.rule}`).join("; ") +
      ` | sent ${w.calls.filter(isSend).map((c) => c.request.send).join(", ")}`,
  },
  {
    checkId: "lead-time-is-data",
    // 6. Job starts in three days; S2 takes ten, S1 takes two.
    world: () =>
      world({
        releaseRule: { ...RULE, threshold: 100_000 },
        jobs: [
          job(
            [
              { code: "PIPE20", qty: 10, description: "pipe" },
              { code: "STUD90", qty: 40, description: "stud" },
            ],
            3,
          ),
        ],
      }),
    drive: async (b, w) => b(w.ports()),
    holds: (w) => {
      const slow = orderIdFor(w, "S2");
      const n = callsOf(w, "notify").map((c) => c.request);
      return (
        idx(w, "read_contacts") >= 0 &&
        n.length === 1 &&
        n[0].to === OWNER &&
        n[0].orderId === slow &&
        n[0].supplierId === "S2" &&
        Date.parse(n[0].arrives) === NOW.getTime() + 10 * DAY
      );
    },
    describe: (w) => callsOf(w, "notify").map((c) => `${c.request.to}: ${c.request.orderId}/${c.request.supplierId} arrives ${c.request.arrives}`).join("; ") || "no notification",
  },
  {
    checkId: "delivery-matches-back",
    // 7. A docket against a sent order with one line short, and one against an order that does not exist.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 40, description: "pipe" },
            { code: "ELB20", qty: 12, description: "elbow" },
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      const id = sentOrder(w);
      w.deliver(id ?? "PO-missing", [
        { code: "PIPE20", qtyReceived: 30 },
        { code: "ELB20", qtyReceived: 12 },
      ]);
      w.deliver("PO999", [{ code: "PIPE20", qtyReceived: 5 }]);
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const id = sentOrder(w);
      const ev = callsOf(w, "evidence");
      const mine = ev.find((c) => c.request.delivery === id && c.request.docketId === "DKT1");
      return (
        Boolean(id) &&
        Boolean(mine) &&
        mine.request.lines.length === 2 &&
        mine.request.lines.includes("PIPE20:30/short") &&
        mine.request.lines.includes("ELB20:12") &&
        !ev.some((c) => c.request.delivery === "PO999" || c.request.docketId === "DKT2") &&
        escalations(w, (e) => e.kind === "no_order" && /DKT2/.test(e.detail ?? "") && named(e.owner)).length >= 1
      );
    },
    describe: (w) => callsOf(w, "evidence").map((c) => `${c.request.delivery}/${c.request.docketId}: ${c.request.lines.join(" ")}`).join("; ") + ` | escalated ${escalations(w).map((e) => e.kind).join(", ")}`,
  },
  {
    checkId: "variance-is-a-queue",
    // 8. One docket: short, over, an item not on the order, and a changed price.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 10, description: "pipe" },
            { code: "ELB20", qty: 10, description: "elbow" },
            { code: "VALVE20", qty: 10, description: "valve" },
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.deliver(sentOrder(w) ?? "PO-missing", [
        { code: "PIPE20", qtyReceived: 6 },
        { code: "ELB20", qtyReceived: 14 },
        { code: "TAP15", qtyReceived: 3 },
        { code: "VALVE20", qtyReceived: 10, price: 35 },
      ]);
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const id = sentOrder(w);
      const kinds = ["short", "over", "wrong_item", "price_changed"];
      const es = escalations(w, (e) => kinds.includes(e.kind));
      return Boolean(id) && es.length === 4 && kinds.every((k) => es.filter((e) => e.kind === k && e.orderId === id && named(e.owner)).length === 1);
    },
    describe: (w) => escalations(w).map((e) => `${e.kind}:${e.orderId}:${e.owner}`).join(", ") || "no escalations",
  },
  {
    checkId: "nothing-is-substituted-silently",
    // 9. Two substituted lines: one signed for by the site supervisor, one accepted by nobody.
    world: () =>
      world({
        jobs: [
          job([
            { code: "TAP15", qty: 2, description: "tap" },
            { code: "VALVE20", qty: 4, description: "valve" },
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.deliver(sentOrder(w) ?? "PO-missing", [
        { code: "TAP15-CHROME", substitutes: "TAP15", qtyReceived: 2, acceptedBy: "Sam Kerr" },
        { code: "VALVE20-BRASS", substitutes: "VALVE20", qtyReceived: 4 },
      ]);
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const id = sentOrder(w);
      const acc = callsOf(w, "gate", (c) => c.request.accept).map((c) => c.request);
      const delivery = callsOf(w, "evidence", (c) => c.request.delivery === id)[0];
      return (
        Boolean(id) &&
        acc.length === 1 &&
        acc[0].accept.code === "TAP15" &&
        acc[0].person === "Sam Kerr" &&
        acc[0].rule === null &&
        acc.every((a) => named(a.person)) &&
        escalations(w, (e) => e.kind === "substitution" && e.orderId === id && named(e.owner) && /VALVE20/.test(e.detail ?? "")).length === 1 &&
        Boolean(delivery) &&
        delivery.request.lines.includes("VALVE20:0/substituted")
      );
    },
    describe: (w) =>
      `accepted ${callsOf(w, "gate", (c) => c.request.accept).map((c) => `${c.request.accept.code} by ${c.request.person}`).join(", ") || "none"}; escalated ${escalations(w).map((e) => e.kind).join(", ")}`,
  },
  {
    checkId: "the-record-by-job",
    // 10. One job ordered, released, delivered short and escalated; then read back by job id.
    world: () =>
      world({
        jobs: [
          job([
            { code: "PIPE20", qty: 40, description: "pipe" },
            { code: "ELB20", qty: 12, description: "elbow" },
          ]),
        ],
      }),
    drive: async (b, w) => {
      await b(w.ports());
      w.deliver(sentOrder(w) ?? "PO-missing", [
        { code: "PIPE20", qtyReceived: 40 },
        { code: "ELB20", qtyReceived: 8 },
      ]);
      w.advance(HOUR);
      await b(w.ports());
      w.readBack = await w.ports().readRecord("J-1001"); // the read by job id, through the port
    },
    holds: (w) => {
      const r = w.readBack;
      if (!r) return false;
      const o = r.orders[0];
      return (
        r.orders.length === 1 &&
        named(o.externalId) &&
        named(o.catalogueEdition) &&
        (named(o.releasedBy) || named(o.releasedByRule)) &&
        r.deliveries.length === 1 &&
        r.deliveries[0].lines.length === 2 &&
        r.deliveries[0].lines.some((l) => l.code === "ELB20" && l.qtyReceived === 8 && l.reason === "short") &&
        r.escalations.some((e) => e.kind === "short" && e.orderId === o.id && named(e.owner))
      );
    },
    describe: (w) => (w.readBack ? `orders ${w.readBack.orders.length}, deliveries ${w.readBack.deliveries.length}, escalations ${w.readBack.escalations.length}` : "no read back"),
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a software check. Who else can explain it, and whose account it runs on,
    //     is declared by the operator and attached as evidence. Never scored green here.
    world: () => world(),
    drive: async () => {},
    holds: () => false,
    describe: () => "evidence, not a run",
  },
];

// The pass test runs only on a real job system and supplier account, which this
// standard quotes as a scoped build. There is no live port map, so nothing here.
export const liveScenarios = [];

/**
 * One scenario per check of parts-ready-build-standard, for Parts Check.
 *
 * Scaffolded by `npx @aipathway/conformance init parts-ready-build-standard`;
 * the checks themselves are fetched at run time from
 * https://aipathway.com.au/explore-ai/parts-ready-build-standard
 *
 * Each world is a PartsWorld (parts-world.mjs): a Cairns plumbing business at
 * 2pm on Wednesday 4 November 2026, checking Thursday's board. Every `holds`
 * reads the world's trace (`world.calls`) and returns a strict true or false.
 *
 * mutants.mjs runs these scenarios against a do-nothing build and a set of
 * deliberately broken builds, and fails unless every check claimed here goes
 * red for the builds that break it.
 *
 * The pass test (check 10) is with_us: it runs by hand on the business's own
 * board, van counts, shelf and supplier account, so there is no scenario for it.
 */

import { PartsWorld, PairWorld, MIA, SAM, LENA, FOR_DATE, CUTOFF, FRESH, STALE, at } from "./parts-world.mjs";

const MIN = 60_000;
const run = async (build, world) => build(world.ports());
const twice = async (build, world) => {
  await build(world.ports());
  world.advance(30 * MIN);
  await build(world.ports());
};

// ── Fixtures ──

const NORTH = { supplier_id: "S-NORTH", name: "Northside Plumbing Supplies", lead_hours: 16, codes: ["TV-15", "FLX-450", "PRV-500", "CART-35", "ISO-15", "PAN-90"] };
const COAST = { supplier_id: "S-COAST", name: "Coastal Hot Water Wholesale", lead_hours: 72, codes: ["HWU-315E", "HWU-250G"] };
const SUPPLIERS = [NORTH, COAST];

const TEMPLATES = {
  hot_water_swap: [
    { catalogue_code: "HWU-315E", qty: 1 },
    { catalogue_code: "FLX-450", qty: 2 },
    { catalogue_code: "TV-15", qty: 1 },
  ],
  tap_service: [{ catalogue_code: "CART-35", qty: 1 }],
};

const slot = (job_external_id, tech_id, hm, job_type = "repair", date = FOR_DATE) => ({
  job_external_id,
  tech_id,
  date,
  start: at(hm, date),
  job_type,
  address: `${job_external_id.slice(1)} Wattle St, Edge Hill QLD 4870`,
});
const job = (job_external_id, quote_lines = [], materials = [], description = "") => ({ job_external_id, quote_lines, materials, description });
const need = (code, qty = 1) => ({ catalogue_code: code, qty });
const van = (tech_id, as_of, lines) => ({ tech_id, as_of, lines });

const baseShelf = () => [
  { catalogue_code: "CART-35", on_hand: 2, reserved: 0, location: "Bay 3" },
  { catalogue_code: "PAN-90", on_hand: 1, reserved: 0, location: "Bay 7" },
];

const world = (opts) => new PartsWorld({ suppliers: SUPPLIERS, templates: TEMPLATES, shelf: baseShelf(), ...opts });

// ── Trace readers ──

const WRITES = new Set(["reserve", "write_order", "notify", "publish_report", "write_result", "raise_exception"]);
const idx = (w, pred) => w.calls.findIndex(pred);
const of = (w, port) => w.calls.filter((c) => c.port === port);
const orderLines = (calls) => calls.filter((c) => c.port === "write_order").flatMap((c) => c.request.lines ?? []);
const jobsTouchedBy = (calls) => {
  const ids = [];
  for (const c of calls) {
    if (c.port === "write_order") ids.push(...(c.request.lines ?? []).map((l) => l.job_external_id));
    else if (["reserve", "notify", "write_result", "raise_exception"].includes(c.port)) ids.push(c.request.job_external_id);
  }
  return ids;
};
/** The last Result written for a (job, code) pair. */
const resultOf = (w, jobId, code) => of(w, "write_result").filter((c) => c.request.job_external_id === jobId && c.request.catalogue_code === code).at(-1)?.request;
const excs = (w, jobId, code, reason) =>
  of(w, "raise_exception").filter((c) => c.request.job_external_id === jobId && c.request.catalogue_code === code && c.request.reason === reason && c.response?.exception_id);
const hasOwner = (c) => typeof c.request.owner === "string" && c.request.owner.trim().length > 0;
const secondRunFrom = (w) => w.calls.findIndex((c, i) => c.port === "read_board" && i > idx(w, (x) => x.port === "read_board"));

const describe = (w) => {
  const calls = w.calls;
  const results = calls.filter((c) => c.port === "write_result").map((c) => `${c.request.job_external_id}:${c.request.catalogue_code}=${c.request.status}${c.request.reason ? `(${c.request.reason})` : ""}`);
  return (
    `${calls.length} port call(s); results ${results.join(", ") || "none"}; ` +
    `${calls.filter((c) => c.port === "write_order").length} order request(s); ${calls.filter((c) => c.port === "notify").length} message(s); ` +
    `${calls.filter((c) => c.port === "raise_exception").length} exception(s); ${calls.filter((c) => c.port === "publish_report").length} report(s)`
  );
};

export const scenarios = [
  {
    checkId: "jobs-come-from-the-board",
    world: () =>
      world({
        slots: [slot("J101", MIA, "07:30"), slot("J102", SAM, "08:00"), slot("J103", LENA, "09:00"), slot("J109", MIA, "07:30", "repair", "2026-11-06")],
        jobs: [job("J101", [need("TV-15")]), job("J102", [need("CART-35")]), job("J103", [need("PRV-500")]), job("J109", [need("PAN-90")])],
        vans: [van(MIA, FRESH, [need("TV-15", 2)]), van(SAM, FRESH, []), van(LENA, FRESH, [])],
      }),
    drive: async (build, w) => {
      await build(w.ports());
      w.advance(30 * MIN);
      w.addJob(slot("J104", MIA, "11:00"), job("J104", [need("PAN-90")]));
      await build(w.ports());
    },
    holds: (w) => {
      const board = idx(w, (c) => c.port === "read_board" && c.request.date === FOR_DATE);
      const firstWrite = idx(w, (c) => WRITES.has(c.port));
      if (board < 0 || firstWrite < 0 || board > firstWrite) return false;
      const onBoard = new Set(["J101", "J102", "J103", "J104"]);
      const touched = jobsTouchedBy(w.calls);
      if (touched.length === 0 || !touched.every((id) => onBoard.has(id))) return false;
      const reports = of(w, "publish_report");
      if (!reports.every((c) => (c.request.jobs ?? []).every((j) => onBoard.has(j.job_external_id)))) return false;
      const second = secondRunFrom(w);
      if (second < 0) return false;
      const first = w.calls.slice(0, second);
      const firstJobs = new Set(jobsTouchedBy(first));
      if (!["J101", "J102", "J103"].every((id) => firstJobs.has(id))) return false;
      const later = jobsTouchedBy(w.calls.slice(second));
      if (later.length === 0 || !later.every((id) => id === "J104")) return false;
      const laterCalls = w.calls.slice(second);
      return laterCalls.some((c) => c.port === "reserve" && c.request.job_external_id === "J104" && c.response) && laterCalls.some((c) => c.port === "notify" && c.request.job_external_id === "J104");
    },
    describe,
  },
  {
    checkId: "needs-come-from-the-record",
    world: () =>
      world({
        slots: [slot("J201", MIA, "07:30", "hot_water_swap"), slot("J202", SAM, "08:00", "tap_service"), slot("J203", LENA, "09:00", "investigate")],
        jobs: [
          job("J201", [need("TV-15")]),
          job("J202"),
          job("J203", [], [], "Leak under the kitchen sink, probably needs a new flexi and an isolation valve"),
        ],
        vans: [van(MIA, FRESH, [need("TV-15", 2), need("FLX-450", 4), need("HWU-315E", 1)]), van(SAM, FRESH, [need("CART-35", 2)]), van(LENA, FRESH, [need("FLX-450", 4), need("ISO-15", 4)])],
      }),
    drive: run,
    holds: (w) => {
      for (const id of ["J201", "J202", "J203"]) {
        const read = idx(w, (c) => c.port === "read_job" && c.request.job_external_id === id);
        const write = idx(w, (c) => jobsTouchedBy([c]).includes(id));
        if (read < 0 || write < 0 || read > write) return false;
      }
      const unknown = of(w, "raise_exception").filter((c) => c.request.job_external_id === "J203");
      if (unknown.length !== 1 || unknown[0].request.reason !== "needs_list_unknown" || !hasOwner(unknown[0])) return false;
      if (of(w, "reserve").some((c) => c.request.job_external_id === "J203")) return false;
      if (orderLines(w.calls).some((l) => l.job_external_id === "J203")) return false;
      if (of(w, "notify").some((c) => c.request.job_external_id === "J203" && (c.request.lines ?? []).length > 0)) return false;
      if (of(w, "write_result").some((c) => c.request.job_external_id === "J203" && c.request.catalogue_code !== null)) return false;
      const codes = (id) => [...new Set(of(w, "write_result").filter((c) => c.request.job_external_id === id).map((c) => c.request.catalogue_code))].sort();
      if (JSON.stringify(codes("J202")) !== JSON.stringify(["CART-35"])) return false;
      return JSON.stringify(codes("J201")) === JSON.stringify(["TV-15"]);
    },
    describe,
  },
  {
    checkId: "stock-is-read-with-an-as-of",
    world: () =>
      world({
        slots: [slot("J301", MIA, "07:30"), slot("J302", LENA, "08:00")],
        jobs: [job("J301", [need("TV-15")]), job("J302", [need("PRV-500"), need("FLX-450", 2)])],
        vans: [van(MIA, FRESH, [need("TV-15", 2)]), van(LENA, STALE, [need("PRV-500", 1), need("FLX-450", 4)])],
      }),
    drive: run,
    holds: (w) => {
      const vansRead = new Set(of(w, "read_van").map((c) => c.request.tech_id));
      if (!vansRead.has(MIA) || !vansRead.has(LENA)) return false;
      if (resultOf(w, "J301", "TV-15")?.status !== "on_van") return false;
      if (of(w, "write_result").some((c) => c.request.job_external_id === "J302" && c.request.status === "on_van")) return false;
      if (of(w, "notify").some((c) => c.request.job_external_id === "J302" && (c.request.lines ?? []).some((l) => l.status === "on_van"))) return false;
      for (const code of ["PRV-500", "FLX-450"]) {
        const e = excs(w, "J302", code, "stock_unknown");
        if (e.length !== 1 || !hasOwner(e[0])) return false;
      }
      return true;
    },
    describe,
  },
  {
    checkId: "reserve-before-order",
    world: () =>
      world({
        slots: [slot("J401", SAM, "08:00")],
        jobs: [job("J401", [need("CART-35")])],
        vans: [van(SAM, FRESH, [need("FLX-450", 2)])],
      }),
    drive: run,
    holds: (w) => {
      const shelf = idx(w, (c) => c.port === "read_shelf");
      const firstMove = idx(w, (c) => c.port === "reserve" || c.port === "write_order");
      if (shelf < 0 || firstMove < 0 || shelf > firstMove) return false;
      const r = of(w, "reserve").filter((c) => c.request.job_external_id === "J401" && c.request.catalogue_code === "CART-35" && c.response?.reservation_id);
      if (r.length !== 1) return false;
      if (orderLines(w.calls).some((l) => l.catalogue_code === "CART-35")) return false;
      const res = resultOf(w, "J401", "CART-35");
      return res?.status === "pick_from_shelf" && res.location === "Bay 3";
    },
    describe,
  },
  {
    checkId: "order-only-through-material-order",
    world: () =>
      world({
        slots: [slot("J501", MIA, "07:30"), slot("J502", LENA, "09:00")],
        jobs: [job("J501", [need("PRV-500")]), job("J502", [need("ISO-15", 2)])],
        vans: [van(MIA, FRESH, []), van(LENA, FRESH, [])],
      }),
    drive: twice,
    holds: (w) => {
      const second = secondRunFrom(w);
      if (second < 0) return false;
      const orders = of(w, "write_order");
      if (orders.length !== 1) return false;
      const o = orders[0];
      if (o.request.supplier_id !== "S-NORTH" || !o.response?.po_external_id) return false;
      const lines = o.request.lines ?? [];
      if (!lines.some((l) => l.job_external_id === "J501" && l.catalogue_code === "PRV-500")) return false;
      if (!lines.some((l) => l.job_external_id === "J502" && l.catalogue_code === "ISO-15")) return false;
      if (!lines.every((l) => typeof l.job_external_id === "string")) return false;
      if (w.calls.slice(second).some((c) => c.port === "write_order")) return false;
      return ["J501:PRV-500", "J502:ISO-15"].every((k) => {
        const [j, code] = k.split(":");
        const r = resultOf(w, j, code);
        return r?.status === "ordered" && r.po_external_id === o.response.po_external_id;
      });
    },
    describe,
  },
  {
    checkId: "lead-time-decides",
    world: () =>
      world({
        slots: [slot("J601", MIA, "07:30"), slot("J602", LENA, "08:00", "hot_water_swap")],
        jobs: [job("J601", [need("PRV-500")]), job("J602", [need("HWU-315E")])],
        vans: [van(MIA, FRESH, []), van(LENA, FRESH, [])],
      }),
    drive: run,
    holds: (w) => {
      const sup = idx(w, (c) => c.port === "read_contacts");
      const firstOrder = idx(w, (c) => c.port === "write_order");
      if (sup < 0 || firstOrder < 0 || sup > firstOrder) return false;
      const lines = orderLines(w.calls);
      if (!lines.some((l) => l.job_external_id === "J601" && l.catalogue_code === "PRV-500")) return false;
      if (lines.some((l) => l.catalogue_code === "HWU-315E")) return false;
      const e = excs(w, "J602", "HWU-315E", "lead_time_after_job");
      return e.length === 1 && hasOwner(e[0]) && resultOf(w, "J602", "HWU-315E")?.status === "flagged";
    },
    describe,
  },
  {
    checkId: "no-silent-substitution",
    world: () =>
      world({
        slots: [slot("J701", MIA, "07:30", "hot_water_swap")],
        jobs: [job("J701", [need("HWU-315E"), need("FLX-450", 2)])],
        vans: [van(MIA, FRESH, [need("FLX-450", 4), { catalogue_code: "HWU-250G", qty: 1, stands_in_for: ["HWU-315E"] }])],
        shelf: [...baseShelf(), { catalogue_code: "HWU-250G", on_hand: 1, reserved: 0, location: "Bay 1", stands_in_for: ["HWU-315E"] }],
      }),
    drive: run,
    holds: (w) => {
      const read = of(w, "read_job").find((c) => c.request.job_external_id === "J701")?.response;
      if (!read) return false;
      const needs = new Set((read.quote_lines ?? []).map((l) => l.catalogue_code));
      const codes = [
        ...of(w, "reserve").map((c) => c.request.catalogue_code),
        ...orderLines(w.calls).map((l) => l.catalogue_code),
        ...of(w, "notify").flatMap((c) => (c.request.lines ?? []).map((l) => l.catalogue_code)),
        ...of(w, "write_result").map((c) => c.request.catalogue_code),
      ];
      if (codes.length === 0 || !codes.every((c) => needs.has(c))) return false;
      const flagged = of(w, "raise_exception").filter((c) => c.request.job_external_id === "J701" && c.request.catalogue_code === "HWU-315E");
      if (flagged.length !== 1 || !hasOwner(flagged[0])) return false;
      const outside = w.calls.filter((c) => c.port !== "raise_exception" && WRITES.has(c.port));
      return !outside.some((c) => JSON.stringify(c.request).includes("HWU-250G"));
    },
    describe,
  },
  {
    checkId: "tech-told-once",
    world: () =>
      world({
        slots: [slot("J801", MIA, "07:30"), slot("J802", SAM, "08:00")],
        jobs: [job("J801", [need("TV-15")]), job("J802", [need("CART-35")])],
        vans: [van(MIA, FRESH, [need("TV-15", 2)]), van(SAM, FRESH, [])],
      }),
    drive: twice,
    holds: (w) => {
      const sent = of(w, "notify").filter((c) => c.response?.message_id);
      const pairs = sent.map((c) => `${c.request.tech_id}|${c.request.job_external_id}`);
      if (pairs.length !== 2 || new Set(pairs).size !== 2) return false;
      const mia = sent.find((c) => c.request.tech_id === MIA && c.request.job_external_id === "J801");
      const sam = sent.find((c) => c.request.tech_id === SAM && c.request.job_external_id === "J802");
      if (!mia || !sam) return false;
      if (!String(mia.request.body).includes("J801") || !String(sam.request.body).includes("J802")) return false;
      const ml = mia.request.lines ?? [];
      const sl = sam.request.lines ?? [];
      return (
        ml.some((l) => l.catalogue_code === "TV-15" && l.status === "on_van") &&
        sl.some((l) => l.catalogue_code === "CART-35" && l.status === "pick_from_shelf" && l.location === "Bay 3")
      );
    },
    describe,
  },
  {
    checkId: "publishes-by-the-cutoff",
    world: () =>
      new PairWorld(
        world({
          slots: [slot("J901", MIA, "07:30"), slot("J902", LENA, "09:00")],
          jobs: [job("J901", [need("TV-15")]), job("J902", [need("PRV-500")])],
          vans: [van(MIA, FRESH, [need("TV-15", 2)]), van(LENA, FRESH, [need("PRV-500", 1)])],
        }),
        world({
          slots: [slot("J911", MIA, "07:30", "investigate"), slot("J912", LENA, "08:00"), slot("J913", SAM, "09:00", "hot_water_swap")],
          jobs: [job("J911"), job("J912", [need("PRV-500")]), job("J913", [need("HWU-315E")])],
          vans: [van(MIA, FRESH, []), van(LENA, STALE, [need("PRV-500", 1)]), van(SAM, FRESH, [])],
        }),
      ),
    drive: async (build, pw) => {
      await build(pw.a.ports());
      await build(pw.b.ports());
    },
    holds: (pw) => {
      const quiet = of(pw.a, "publish_report");
      if (quiet.length !== 1) return false;
      const r = quiet[0];
      if (r.request.for_date !== FOR_DATE || Date.parse(r.at) > CUTOFF.getTime()) return false;
      const jobs = new Set((r.request.jobs ?? []).map((j) => j.job_external_id));
      if (!jobs.has("J901") || !jobs.has("J902") || jobs.size !== 2) return false;
      const busy = of(pw.b, "publish_report");
      if (busy.length !== 1 || busy[0].request.for_date !== FOR_DATE || Date.parse(busy[0].at) > CUTOFF.getTime()) return false;
      const raised = pw.calls.filter((c) => c.port === "raise_exception");
      return raised.length >= 3 && raised.every(hasOwner);
    },
    describe: (pw) => `quiet board: ${describe(pw.a)} | busy board: ${describe(pw.b)}`,
  },
];

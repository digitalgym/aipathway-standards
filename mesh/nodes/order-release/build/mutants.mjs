/**
 * Proof the scenarios bite. Runs every scenario against a do-nothing build, a
 * naive build, and the real build with one behaviour broken at a time, and
 * says which checks went red for each. A mutant a scenario cannot tell from
 * the real build means the scenario is too weak.
 *
 *   node mutants.mjs
 *
 * Writes nothing. The evidence is run.mjs; this is the check on the checks.
 */
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const SLUG = "material-order-build-standard";
const std = await fetchChecks(SLUG, process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au");

/** The real build, with some ports bent. */
const bent = (bend) => (ports) => build({ ...ports, ...bend(ports) });

/** What a purchasing bot without a standard does: order everything, every run, and send it. */
async function naive(ports) {
  const jobs = await ports.readJobs();
  const suppliers = await ports.readSuppliers();
  for (const job of jobs) {
    for (const s of suppliers) {
      const cat = await ports.readCatalogue(s.id);
      const lines = job.materialLines.filter((l) => cat?.items.some((i) => i.code === l.code)).map((l) => ({ code: l.code, qty: l.qty, price: 50 }));
      if (!lines.length) continue;
      const o = await ports.writeOrder({ jobId: job.id, supplierId: s.id, lines, catalogueEdition: cat.edition });
      if (!o) continue;
      await ports.release(o.id, { rule: "auto" });
      await ports.send(o.id);
    }
  }
  for (const d of await ports.readDockets()) {
    await ports.recordDelivery(d.orderId, d.id, d.lines.map((l) => ({ code: l.code, qtyReceived: l.qtyReceived })));
  }
}

const mutants = {
  "do nothing": { build: async () => {}, mustFail: "all" },
  // The naive build does order exactly the job's lines, so check 1 rightly holds for it;
  // "reads the job wrong" below is the mutant check 1 exists to catch.
  naive: {
    build: naive,
    mustFail: [
      "stock-checked-before-ordering",
      "supplier-catalogue-is-the-only-source",
      "one-order-per-job-and-supplier",
      "threshold-needs-a-person",
      "lead-time-is-data",
      "delivery-matches-back",
      "variance-is-a-queue",
      "nothing-is-substituted-silently",
      "the-record-by-job",
    ],
  },
  "reads the job wrong (adds a line, drops one)": {
    build: bent((p) => ({
      readJobs: async () => (await p.readJobs()).map((j) => ({ ...j, materialLines: [...j.materialLines.slice(1), { code: "PVC-BEND-100", qty: 99, description: "extra" }] })),
    })),
    mustFail: ["lines-come-from-the-job"],
  },
  "ignores stock": { build: bent(() => ({ readStock: async () => [] })), mustFail: ["stock-checked-before-ordering"] },
  "remembered prices": {
    build: bent((p) => ({
      readCatalogue: async (id) => {
        const c = await p.readCatalogue(id);
        return c && { ...c, items: c.items.map((i) => ({ ...i, price: i.price + 5 })) };
      },
    })),
    mustFail: ["supplier-catalogue-is-the-only-source"],
  },
  "prices an unknown code": {
    build: bent((p) => ({
      readCatalogue: async (id) => {
        const c = await p.readCatalogue(id);
        return c && id === "SUP-NORTHSIDE" ? { ...c, items: [...c.items, { code: "TAPWARE-CUSTOM-7", price: 99 }] } : c;
      },
    })),
    mustFail: ["supplier-catalogue-is-the-only-source"],
  },
  "never reads existing orders": { build: bent(() => ({ readOrdersForJob: async () => [] })), mustFail: ["one-order-per-job-and-supplier"] },
  "treats a null write as an order": {
    build: bent((p) => ({ writeOrder: async (i) => (await p.writeOrder(i)) ?? { id: "PO-GHOST", externalId: "ghost", jobId: i.jobId, supplierId: i.supplierId, lines: i.lines, status: "draft" } })),
    mustFail: ["one-order-per-job-and-supplier"],
  },
  "rule releases everything": {
    build: bent((p) => ({
      readSuppliers: async () => (await p.readSuppliers()).map((s) => ({ ...s, approved: true })),
      readReleaseRule: async () => ({ ...(await p.readReleaseRule()), threshold: Infinity }),
    })),
    mustFail: ["threshold-needs-a-person", "the-record-by-job"],
  },
  "never tells the owner": { build: bent(() => ({ notifyOwner: async () => {} })), mustFail: ["lead-time-is-data"] },
  "guesses lead time": {
    build: bent((p) => ({ readSuppliers: async () => (await p.readSuppliers()).map((s) => ({ ...s, leadDays: 2 })) })),
    mustFail: ["lead-time-is-data"],
  },
  "files a stray docket on the first order": {
    build: bent((p) => ({
      readDockets: async () => {
        const ds = await p.readDockets();
        const real = ds.find((d) => d.orderId.startsWith("PO") && d.orderId !== "PO-9917")?.orderId;
        return ds.map((d) => (d.orderId === "PO-9917" && real ? { ...d, orderId: real } : d));
      },
    })),
    mustFail: ["delivery-matches-back"],
  },
  "absorbs variances": {
    build: bent((p) => ({ escalate: async (e) => (["short", "over", "wrong_item", "price_changed"].includes(e.kind) ? undefined : p.escalate(e)) })),
    mustFail: ["variance-is-a-queue", "the-record-by-job"],
  },
  "waves substitutes through": {
    build: bent((p) => ({ readDockets: async () => (await p.readDockets()).map((d) => ({ ...d, lines: d.lines.map((l) => (l.substitutes ? { ...l, acceptedBy: l.acceptedBy ?? "auto-accept" } : l)) })) })),
    mustFail: ["nothing-is-substituted-silently"],
  },
  "keeps no delivery record": { build: bent(() => ({ recordDelivery: async () => {} })), mustFail: ["delivery-matches-back", "the-record-by-job"] },
};

let weak = 0;
for (const [name, m] of Object.entries(mutants)) {
  const env = await runStandard(std.checks, scenarios, m.build, { standard: SLUG, spec: std.spec, specVersion: std.version, environment: "stub" });
  const red = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  const claimed = env.results.filter((r) => ["pass", "shape_only"].includes(r.verdict) || r.verdict === "fail").map((r) => r.checkId);
  const want = m.mustFail === "all" ? claimed : m.mustFail;
  const missed = want.filter((id) => !red.includes(id));
  if (missed.length) weak += 1;
  console.log(`${missed.length ? "WEAK" : "ok  "}  ${name.padEnd(44)} red: ${red.join(", ") || "(none)"}${missed.length ? `   NOT red: ${missed.join(", ")}` : ""}`);
}
console.log(weak ? `\n${weak} mutant(s) got through.` : "\nEvery mutant went red where it should.");
process.exitCode = weak ? 1 : 0;

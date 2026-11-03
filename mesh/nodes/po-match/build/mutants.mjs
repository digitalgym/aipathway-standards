// Runs the scenarios against a do-nothing build and deliberately broken builds.
// Every claimed check must go red for do-nothing and for at least one broken build.
//   node mutants.mjs
import { fetchChecks, runStandard } from "@aipathway/conformance";
import { scenarios } from "./scenarios.mjs";
import { build as real, ORDER } from "./build.mjs";

const std = await fetchChecks("invoice-check-build-standard", "https://aipathway.com.au");

const wrap = (over) => (ports) => real({ ...ports, ...over(ports) });

const mutants = {
  "do-nothing": () => {},
  // Runs all four checks and reports the last failure.
  "runs-all-four": async (p) => {
    const tol = await p.readTolerances();
    for (const inv of await p.readInvoices()) {
      const po = inv.poId ? await p.readPurchaseOrder(inv.poId) : null;
      if (!po) { await p.escalate(inv.id, "no po"); await p.route(inv.id, "blocked", "x"); continue; }
      let last = null;
      for (const c of ORDER) { const bad = c === "quantity" ? inv.previouslyClaimedQuantity + inv.lines.reduce((s,l)=>s+l.quantity,0) > inv.completedQuantity : c === "contract_sum" ? inv.cumulativeClaimedCents > po.contractSumCents : false; await p.recordCheck(inv.id, c, !bad, "saw something long enough here"); if (bad) last = c; }
      if (last) { await p.raiseException({ invoiceId: inv.id, differenceCents: 1, source: inv.documents[0], checkName: last }); await p.route(inv.id, "needs_decision", "x"); }
      else await p.route(inv.id, "done_reversible", "x");
    }
    void tol;
  },
  // Matches a no-PO invoice to the supplier's only open PO.
  "guesses-po": wrap((p) => ({
    readInvoices: () => p.readInvoices().map((i) => {
      if (i.poId) return i;
      const open = p.readOpenPurchaseOrders(i.supplierId);
      return open.length === 1 ? { ...i, poId: open[0].id } : i;
    }),
  })),
  // Treats any approvalRef or note as approval.
  "note-is-approval": wrap((p) => ({ readDocument: (ref) => p.readDocument(ref) ?? { ref, kind: "note" } })),
  // Never routes clean invoices.
  "no-clean-list": wrap((p) => ({ route: (id, q, r) => (q === "done_reversible" ? undefined : p.route(id, q, r)) })),
  // Routes exceptions twice (decision + blocked).
  "double-route": wrap((p) => ({ route: (id, q, r) => { p.route(id, q, r); if (q !== "done_reversible") p.route(id, "needs_decision", r); } })),
  // Percentage instead of dollars, and no source.
  "percent-no-source": wrap((p) => ({ raiseException: (e) => p.raiseException({ ...e, differenceCents: 5.6, source: "" }) })),
  // Pays every clean invoice with no person, then with a robot name.
  "auto-pay": wrap((p) => ({ route: (id, q, r) => { p.route(id, q, r); if (q === "done_reversible") p.releasePayment(id, "auto"); } })),
  // Records only the outcome, not what it saw.
  "outcome-only": wrap((p) => ({ recordCheck: (id, c, ok) => p.recordCheck(id, c, ok, ok ? "pass" : "fail") })),
  // Hard-coded exact tolerance, never reads the rule.
  "hardcoded-tolerance": wrap((p) => ({ readTolerances: () => [] })),
  // Takes the future-dated tolerance.
  "future-tolerance": wrap((p) => ({ readTolerances: () => p.readTolerances().map((t) => ({ ...t, effectiveFrom: "2026-01-01" })).reverse() })),
  // Skips the variation check entirely.
  "skips-variation": wrap((p) => ({ readDocument: () => ({ ref: "x", kind: "x" }), recordCheck: (id, c, ok, s) => p.recordCheck(id, c, c === "variation" ? true : ok, s) })),
};

const claimed = ["checks-in-order-stop-first-failure","no-po-escalates","variation-against-a-record","exactly-one-queue","clean-matches-visible","exceptions-carry-dollars-and-source","payment-needs-a-person","record-survives-the-decision","tolerances-are-readable"];
const redBy = Object.fromEntries(claimed.map((c) => [c, []]));
for (const [name, b] of Object.entries(mutants)) {
  const env = await runStandard(std.checks, scenarios, b, { standard: "x", spec: std.spec, specVersion: std.version, environment: "stub" });
  const reds = env.results.filter((r) => r.verdict === "fail").map((r) => r.checkId);
  for (const r of reds) redBy[r]?.push(name);
  console.log(`${name.padEnd(20)} red: ${reds.length} ${name === "do-nothing" ? `(of ${claimed.length})` : reds.join(", ")}`);
}
console.log("\nchecks never red under a broken build other than do-nothing:");
for (const [c, ms] of Object.entries(redBy)) if (ms.filter((m) => m !== "do-nothing").length === 0) console.log("  " + c);

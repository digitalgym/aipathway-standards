/**
 * Proof the scenarios bite: run every scenario against a do-nothing build and
 * against deliberately broken builds, and require each check claimed green to
 * go red for the do-nothing build and for at least one broken build aimed at it.
 *
 *   node mutants.mjs
 *
 * Exits 1 if any scenario holds for a build that should fail it.
 */
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

/** Wrap the ports a build is handed. `over` gets the real ports and returns overrides. */
const mutate = (over) => (ports) => build({ ...ports, ...over(ports) });

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Rewrite the published list's flags. */
const rewriteFlags = (fn) =>
  mutate((p) => ({
    publish: (list) => p.publish({ ...list, flags: list.flags.map(fn) }),
  }));

const mutants = {
  "does nothing": async () => {},
  "reads a week past quarter end": mutate((p) => ({
    readSettings: () => {
      const s = p.readSettings();
      return { ...s, period: { ...s.period, to: addDays(s.period.to, 7) } };
    },
  })),
  "states totals it did not read back": rewriteFlags((f) => ({ ...f, cites: f.cites.map((c) => ({ ...c, total: c.total + 1 })) })),
  "cites nothing": rewriteFlags((f) => ({ ...f, cites: [] })),
  "ignores the threshold": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), taxInvoiceThreshold: 0 }),
  })),
  "takes no attachment read as no attachment": mutate((p) => ({
    readCapabilities: () => ({ ...p.readCapabilities(), attachments: true, reconciliation: true }),
    readTransactions: (from, to) =>
      p.readTransactions(from, to).map((t) => ({
        ...t,
        hasAttachment: t.hasAttachment ?? false,
        ...(t.bank ? { reconciled: t.reconciled ?? false } : {}),
      })),
  })),
  "forgets the history": mutate(() => ({
    readTransactions: (from, to) => [],
  })),
  "calls one prior line usual": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), minHistory: 1 }),
  })),
  "says which code is right": rewriteFlags((f) =>
    f.kind === "usual_code" ? { ...f, why: `${f.why} It should be ${f.usual?.code}.` } : f,
  ),
  "decides its own no-GST accounts": mutate((p) => ({
    readSettings: () => {
      const s = p.readSettings();
      return { ...s, noGstAccounts: [...s.noGstAccounts, "473"] };
    },
  })),
  "treats simpler BAS as full": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), reporting: "full" }),
  })),
  "takes every bank line as reconciled": mutate((p) => ({
    readTransactions: (from, to) => p.readTransactions(from, to).map((t) => (t.bank && t.reconciled !== undefined ? { ...t, reconciled: true } : t)),
  })),
  "ignores the band": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), swingBand: 0 }),
  })),
  "takes the GST report as the GST account": mutate((p) => ({
    readAccountMovement: (code, from, to) => {
      const r = p.readGstReport(from, to);
      return r ? Math.round((r.gstOnSales - r.gstOnPurchases) * 100) / 100 : p.readAccountMovement(code, from, to);
    },
  })),
  "publishes twice": mutate((p) => ({
    publish: (list) => {
      p.publish(list);
      p.publish(list);
    },
  })),
  "sends it to the team": mutate((p) => ({
    publish: (list) => p.publish({ ...list, reviewer: "the team" }),
  })),
  "drops what it could not check": mutate((p) => ({
    publish: (list) => p.publish({ ...list, notChecked: [] }),
  })),
};

// A precondition is closed by evidence, not by a run, so it claims nothing here.
const CLAIMED = scenarios.filter((s) => s.checkId !== "survives-the-builder");

const results = {};
for (const s of CLAIMED) {
  results[s.checkId] = {};
  for (const [name, b] of Object.entries(mutants)) {
    const w = s.world();
    let held;
    try {
      await s.drive(b, w);
      held = s.holds(w) === true;
    } catch {
      held = false;
    }
    results[s.checkId][name] = held;
  }
}

let bad = 0;
for (const s of CLAIMED) {
  const r = results[s.checkId];
  const red = Object.entries(r).filter(([, held]) => !held).map(([n]) => n);
  const nothing = !r["does nothing"];
  const broken = red.filter((n) => n !== "does nothing");
  const ok = nothing && broken.length > 0;
  if (!ok) bad += 1;
  console.log(`${ok ? "BITES " : "WEAK  "} ${s.checkId}`);
  console.log(`        red for: ${red.join("; ") || "nothing"}`);
}
console.log(bad ? `\n${bad} scenario(s) too weak.` : "\nEvery scenario goes red for the do-nothing build and at least one broken build.");
process.exitCode = bad ? 1 : 0;

/**
 * Proof the scenarios bite: run every scenario against a do-nothing build and
 * against deliberately broken builds, and require each check to go red for the
 * do-nothing build and for at least one broken build.
 *
 *   node mutants.mjs
 *
 * Exits 1 if any scenario holds for a build that should fail it.
 */
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

/** Wrap the ports a build is handed. `over` gets the real ports and returns overrides. */
const mutate = (over) => (ports) => build({ ...ports, ...over(ports) });

const mutants = {
  "does nothing": async () => {},
  "guesses a contract when none is written": mutate((p) => ({
    readContract: () =>
      p.readContract() ?? {
        id: "guessed",
        key: "pay_run_id",
        masterByField: { super_amount: "a" },
        toleranceByField: {},
        threshold: { amount: 1000, mismatchRate: 0.5 },
        owner: "someone",
      },
  })),
  "joins on the amount, not the pay run id": mutate((p) => {
    const byAmount = (rs) => rs.map((r) => ({ ...r, key: `amt-${r.fields.super_amount}` }));
    return { readSourceA: () => byAmount(p.readSourceA()), readSourceB: () => byAmount(p.readSourceB()) };
  }),
  "corrects the payment without asking": mutate((p) => {
    const raised = new Map();
    return {
      raiseDifference: (input) => {
        const d = p.raiseDifference(input);
        raised.set(d.id, d);
        return d;
      },
      proposeCorrection: (input) => {
        const c = p.proposeCorrection(input);
        const d = raised.get(input.differenceId);
        if (d) p.writeField({ source: input.target, key: d.key, field: d.field, value: input.proposedValue });
        return c;
      },
    };
  }),
  "never proposes a correction": mutate(() => ({
    proposeCorrection: (input) => ({ differenceId: input.differenceId, proposedValue: input.proposedValue, target: input.target, acceptedBy: null, acceptedAt: null, writtenId: null }),
  })),
  "drops orphans": mutate(() => ({
    raiseOrphan: () => {},
  })),
  "ignores the written due window": mutate((p) => ({
    readContract: () => {
      const c = p.readContract();
      return c ? { ...c, toleranceByField: {} } : c;
    },
  })),
  "assumes a cent of rounding on money": mutate((p) => ({
    readContract: () => {
      const c = p.readContract();
      return c ? { ...c, toleranceByField: { ...c.toleranceByField, super_amount: 0.01 } } : c;
    },
  })),
  "stays silent on an all-clear": mutate((p) => ({
    publishRun: (input) => (input.matched > 0 && input.mismatched + input.orphaned + input.withinTolerance + input.corrected === 0 ? null : p.publishRun(input)),
  })),
  "tells nobody": mutate(() => ({
    notify: () => {},
    escalate: () => {},
  })),
  "tells the owner after publishing": (ports) => {
    const queued = [];
    return build({
      ...ports,
      notify: (n) => {
        queued.push(n);
      },
      publishRun: (input) => {
        const r = ports.publishRun(input);
        for (const n of queued) ports.notify(n);
        return r;
      },
    });
  },
  "ignores acceptances": mutate(() => ({
    readAcceptances: () => [],
  })),
  "writes without the person on it": mutate((p) => ({
    writeField: ({ correction, ...input }) => p.writeField(input),
  })),
  "writes the payroll instead": mutate((p) => ({
    writeField: (input) => p.writeField({ ...input, source: "a" }),
  })),
};

const results = {};
for (const s of scenarios) {
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
for (const s of scenarios) {
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

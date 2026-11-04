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

const mutants = {
  "does nothing": async () => {},
  "publishes before its time": mutate((p) => ({
    readSchedule: () => p.readSchedule().map((e) => ({ ...e, scheduledAt: new Date(Date.parse(e.scheduledAt) - 86_400_000).toISOString() })),
  })),
  "skips a quiet month": (() => {
    let last = null;
    return mutate((p) => ({
      publishReport: (input) => {
        const key = JSON.stringify(input.figures.map((f) => f.value));
        if (!input.supersedes && key === last) return { id: "skipped" };
        last = key;
        return p.publishReport(input);
      },
    }));
  })(),
  "shows last month's value when a source is down": (() => {
    const cache = new Map();
    return mutate((p) => ({
      readSource: (s, q, period) => {
        const r = p.readSource(s, q, period);
        if (r.ok) cache.set(`${s}/${q}`, r);
        return r.ok ? r : (cache.get(`${s}/${q}`) ?? r);
      },
    }));
  })(),
  "blank with no reason, owner not told": mutate((p) => ({
    publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.value === null ? { ...f, unavailableReason: null } : f)) }),
    notify: () => {},
  })),
  "publishes figures with no citation": mutate((p) => ({
    publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map(({ cited, ...f }) => f) }),
  })),
  "cites the wrong definition": mutate((p) => {
    const defs = p.readDefinitions();
    return {
      cite: (c) => p.cite({ ...c, definitionId: defs.find((d) => d.measure !== c.measure)?.id ?? c.definitionId }),
    };
  }),
  "types the as-of time": mutate((p) => ({
    cite: (c) => {
      const t = new Date(c.asOf);
      t.setUTCMinutes(0, 0, 0);
      return p.cite({ ...c, asOf: t.toISOString() });
    },
  })),
  "reads the source twice per measure": (() => {
    return mutate((p) => ({
      readSource: (s, q, period) => {
        p.readSource(s, q, period);
        return p.readSource(s, q, period);
      },
    }));
  })(),
  "publishes undefined measures as zero": mutate((p) => ({
    publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.unavailableReason === "no_definition" ? { ...f, value: 0, unavailableReason: null } : f)) }),
  })),
  "writes 'profit down 120%' in the commentary": mutate((p) => ({
    publishReport: (input) => p.publishReport({ ...input, narrative: `${input.narrative ?? ""} Net profit is down 120% on last month.` }),
  })),
  "states a loss without its sign": mutate((p) => ({
    publishReport: (input) => {
      const losses = input.figures.filter((f) => typeof f.value === "number" && f.value < 0).map((f) => `${f.measure} loss of ${Math.abs(f.value)}.`);
      return p.publishReport({ ...input, narrative: [input.narrative ?? "", ...losses].join(" ") });
    },
  })),
  "tells nobody in particular": mutate((p) => ({
    notify: (person, about) => p.notify("the team", about),
  })),
  "never notifies a threshold": mutate((p) => ({
    readThresholds: () => [],
  })),
  "notifies every month, even the first": mutate((p) => ({
    publishReport: (input) => {
      const r = p.publishReport(input);
      for (const t of p.readThresholds()) p.notify(t.notify, { measure: t.measure, period: input.period });
      return r;
    },
  })),
  "gives every audience every figure": mutate((p) => ({
    readAudiences: () => {
      const a = p.readAudiences();
      const all = [...new Set(a.flatMap((x) => x.measures))];
      return a.map((x) => ({ ...x, measures: all }));
    },
  })),
  "drops a declared measure": mutate((p) => ({
    readAudiences: () => p.readAudiences().map((x) => ({ ...x, measures: x.measures.slice(1) })),
  })),
  "edits the published report in place": mutate((p) => ({
    publishReport: (input) => {
      if (input.supersedes) {
        p.amendReport(input.supersedes, input.figures);
        return { id: input.supersedes };
      }
      return p.publishReport(input);
    },
  })),
  "skips the gate": mutate(() => ({
    approveCorrection: () => ({ approved: true }),
  })),
  "version with no person or reason": mutate((p) => ({
    publishReport: ({ by, reason, ...input }) => p.publishReport(input),
  })),
  "ignores corrections": mutate(() => ({
    readCorrections: () => [],
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

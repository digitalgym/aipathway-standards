/**
 * Proof the scenarios bite. Every scenario runs against a do-nothing build and
 * against deliberately broken builds. Each check claimed green must go red for
 * the do-nothing build and for at least one broken build.
 *
 *   node mutants.mjs
 *
 * Exits 1 if any scenario holds for a build that should fail it.
 */
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

/** Wrap the ports the build is handed. `over` gets the real ports and returns overrides. */
const wrap = (over) => (ports) => build({ ...ports, ...over(ports) });

// Each entry makes a fresh build per scenario, so no state leaks between worlds.
const builds = {
  "does nothing": () => async () => {},
  "runs an hour early": () =>
    wrap((p) => ({ now: () => new Date(p.now().getTime() + 3_600_000) })),
  "skips a week when the figures did not move": () => {
    let last = null;
    return wrap((p) => ({
      publishReport: (input) => {
        const key = JSON.stringify(input.figures.map((f) => f.value));
        if (!input.supersedes && key === last) return { id: "skipped" };
        last = key;
        return p.publishReport(input);
      },
    }));
  },
  "shows last week's figure when Xero is down": () => {
    const seen = new Map();
    return wrap((p) => ({
      readSource: (s, q, period) => {
        const r = p.readSource(s, q, period);
        if (r.ok) seen.set(`${s}/${q}`, r);
        return r.ok ? r : (seen.get(`${s}/${q}`) ?? r);
      },
    }));
  },
  "blank with no reason, owner not told": () =>
    wrap((p) => ({
      publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.value === null ? { ...f, unavailableReason: null } : f)) }),
      notify: () => {},
    })),
  "publishes figures with no citation": () =>
    wrap((p) => ({ publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map(({ cited, ...f }) => f) }) })),
  "cites a neighbouring job's definition": () =>
    wrap((p) => {
      const defs = p.readDefinitions();
      return { cite: (c) => p.cite({ ...c, definitionId: defs.find((d) => d.measure !== c.measure)?.id ?? c.definitionId }) };
    }),
  "types the as-of time from the schedule": () =>
    wrap((p) => ({
      cite: (c) => {
        const t = new Date(c.asOf);
        t.setUTCMinutes(30, 0, 0);
        return p.cite({ ...c, asOf: t.toISOString() });
      },
    })),
  "reads each query twice": () =>
    wrap((p) => ({
      readSource: (s, q, period) => {
        p.readSource(s, q, period);
        return p.readSource(s, q, period);
      },
    })),
  "undefined measure published as zero": () =>
    wrap((p) => ({
      publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.unavailableReason === "no_definition" ? { ...f, value: 0, unavailableReason: null } : f)) }),
    })),
  "writes 'J1042 margin down to 36%'": () =>
    wrap((p) => ({ publishReport: (input) => p.publishReport({ ...input, narrative: `${input.narrative ?? ""} J1042 margin is down to 36% this week.` }) })),
  "tells the office, not the person": () => wrap((p) => ({ notify: (person, about) => p.notify("the office", about) })),
  "ignores thresholds": () => wrap(() => ({ readThresholds: () => [] })),
  "notifies every threshold every week": () =>
    wrap((p) => ({
      publishReport: (input) => {
        const r = p.publishReport(input);
        for (const t of p.readThresholds()) p.notify(t.notify, { measure: t.measure, period: input.period });
        return r;
      },
    })),
  "every audience gets every figure": () =>
    wrap((p) => ({
      readAudiences: () => {
        const a = p.readAudiences();
        const all = [...new Set(a.flatMap((x) => x.measures))];
        return a.map((x) => ({ ...x, measures: all }));
      },
    })),
  "drops a declared measure": () => wrap((p) => ({ readAudiences: () => p.readAudiences().map((x) => ({ ...x, measures: x.measures.slice(1) })) })),
  "edits the published report in place": () =>
    wrap((p) => ({
      publishReport: (input) => {
        if (input.supersedes) {
          p.amendReport(input.supersedes, input.figures);
          return { id: input.supersedes };
        }
        return p.publishReport(input);
      },
    })),
  "releases before the person's gate": () =>
    wrap((p) => ({
      approveCorrection: () => ({ approved: true }),
      publishReport: (input) => {
        const r = p.publishReport(input);
        if (input.supersedes) p.approveCorrection({ reportId: input.supersedes, person: input.by, reason: input.reason });
        return r;
      },
    })),
  "new version with no person or reason": () => wrap((p) => ({ publishReport: ({ by, reason, ...input }) => p.publishReport(input) })),
  "ignores corrections": () => wrap(() => ({ readCorrections: () => [] })),
};

let weak = 0;
for (const s of scenarios) {
  if (s.checkId === "survives-the-builder") continue; // not claimed; evidence from the business
  const red = [];
  for (const [name, make] of Object.entries(builds)) {
    const w = s.world();
    let held;
    try {
      await s.drive(make(), w);
      held = s.holds(w) === true;
    } catch {
      held = false;
    }
    if (!held) red.push(name);
  }
  const ok = red.includes("does nothing") && red.some((n) => n !== "does nothing");
  if (!ok) weak += 1;
  console.log(`${ok ? "BITES" : "WEAK "}  ${s.checkId}`);
  console.log(`       red for: ${red.join("; ") || "nothing"}`);
}

// The real build must hold every claimed scenario, or the proof above is moot.
for (const s of scenarios) {
  if (s.checkId === "survives-the-builder") continue;
  const w = s.world();
  await s.drive(build, w);
  if (s.holds(w) !== true) {
    weak += 1;
    console.log(`REAL BUILD FAILS  ${s.checkId}: ${s.describe(w)}`);
  }
}
console.log(weak ? `\n${weak} problem(s).` : "\nEvery scenario goes red for the do-nothing build and at least one broken build.");
process.exitCode = weak ? 1 : 0;

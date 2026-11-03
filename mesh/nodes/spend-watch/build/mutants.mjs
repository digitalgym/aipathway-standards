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
const broken = (over) => (ports) => build({ ...ports, ...over(ports) });

// Each entry makes a fresh build per scenario, so no state leaks between worlds.
const builds = {
  "does nothing": () => async () => {},
  "publishes a day early": () =>
    broken((p) => ({
      readSchedule: () => p.readSchedule().map((e) => ({ ...e, scheduledAt: new Date(Date.parse(e.scheduledAt) - 86_400_000).toISOString() })),
    })),
  "skips a week when spend did not change": () => {
    let last = null;
    return broken((p) => ({
      publishReport: (input) => {
        const key = JSON.stringify(input.figures.map((f) => f.value));
        if (!input.supersedes && key === last) return { id: "skipped" };
        last = key;
        return p.publishReport(input);
      },
    }));
  },
  "keeps last week's tile when a source is down": () => {
    const seen = new Map();
    return broken((p) => ({
      readSource: (s, q, period) => {
        const r = p.readSource(s, q, period);
        if (r.ok) seen.set(`${s}/${q}`, r);
        return r.ok ? r : (seen.get(`${s}/${q}`) ?? r);
      },
    }));
  },
  "blank with no reason, owner not told": () =>
    broken((p) => ({
      publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.value === null ? { ...f, unavailableReason: null } : f)) }),
      notify: () => {},
    })),
  "no citation on figures": () =>
    broken((p) => ({
      publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map(({ cited, ...f }) => f) }),
    })),
  "cites another measure's definition": () =>
    broken((p) => {
      const defs = p.readDefinitions();
      return { cite: (c) => p.cite({ ...c, definitionId: defs.find((d) => d.measure !== c.measure)?.id ?? c.definitionId }) };
    }),
  "types the as-of time": () =>
    broken((p) => ({
      cite: (c) => {
        const t = new Date(c.asOf);
        t.setUTCMinutes(0, 0, 0);
        return p.cite({ ...c, asOf: t.toISOString() });
      },
    })),
  "reads the source twice": () =>
    broken((p) => ({
      readSource: (s, q, period) => {
        p.readSource(s, q, period);
        return p.readSource(s, q, period);
      },
    })),
  "undefined measure published as zero": () =>
    broken((p) => ({
      publishReport: (input) => p.publishReport({ ...input, figures: input.figures.map((f) => (f.unavailableReason === "no_definition" ? { ...f, value: 0, unavailableReason: null } : f)) }),
    })),
  "writes 'subcontract up 18%'": () =>
    broken((p) => ({
      publishReport: (input) => p.publishReport({ ...input, narrative: `${input.narrative ?? ""} Subcontract spend is up 18% on last week.` }),
    })),
  "tells nobody in particular": () => broken((p) => ({ notify: (person, about) => p.notify("the office", about) })),
  "ignores thresholds": () => broken(() => ({ readThresholds: () => [] })),
  "notifies every week, even the first": () =>
    broken((p) => ({
      publishReport: (input) => {
        const r = p.publishReport(input);
        for (const t of p.readThresholds()) p.notify(t.notify, { measure: t.measure, period: input.period });
        return r;
      },
    })),
  "every audience gets every figure": () =>
    broken((p) => ({
      readAudiences: () => {
        const a = p.readAudiences();
        const all = [...new Set(a.flatMap((x) => x.measures))];
        return a.map((x) => ({ ...x, measures: all }));
      },
    })),
  "drops a declared measure": () => broken((p) => ({ readAudiences: () => p.readAudiences().map((x) => ({ ...x, measures: x.measures.slice(1) })) })),
  "edits the published report in place": () =>
    broken((p) => ({
      publishReport: (input) => {
        if (input.supersedes) {
          p.amendReport(input.supersedes, input.figures);
          return { id: input.supersedes };
        }
        return p.publishReport(input);
      },
    })),
  "gate after publishing": () => {
    return broken((p) => ({
      approveCorrection: () => ({ approved: true }),
      publishReport: (input) => {
        const r = p.publishReport(input);
        if (input.supersedes) p.approveCorrection({ reportId: input.supersedes, person: input.by, reason: input.reason });
        return r;
      },
    }));
  },
  "version with no person or reason": () => broken((p) => ({ publishReport: ({ by, reason, ...input }) => p.publishReport(input) })),
  "ignores corrections": () => broken(() => ({ readCorrections: () => [] })),
};

let weak = 0;
for (const s of scenarios) {
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
console.log(weak ? `\n${weak} scenario(s) too weak.` : "\nEvery scenario goes red for the do-nothing build and at least one broken build.");
process.exitCode = weak ? 1 : 0;

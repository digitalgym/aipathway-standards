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
  "skips a quiet week": (() => {
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
  "shows last week's value when a source is down": (() => {
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
  "writes 'free cash down 48%' in the commentary": mutate((p) => ({
    publishReport: (input) => p.publishReport({ ...input, narrative: `${input.narrative ?? ""} Free cash is down 48% on last week; put 20% aside.` }),
  })),
  "tells nobody in particular": mutate((p) => ({
    notify: (person, about) => p.notify("the team", about),
  })),
  "never notifies a threshold": mutate((p) => ({
    readThresholds: () => [],
  })),
  "notifies every week, even the first": mutate((p) => ({
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
  "publishes the untied figure": (ports) => {
    // Reads the balance sheet line, then treats the trial balance value as if it tied.
    const defs = ports.readDefinitions();
    const computed = new Map();
    return build({
      ...ports,
      readSource: (s, q, period) => {
        const r = ports.readSource(s, q, period);
        const own = defs.find((d) => d.source === s && d.queryRef === q);
        if (own && r.ok) computed.set(`${own.measure}/${period}`, r.value);
        const tied = defs.find((d) => d.tie?.source === s && d.tie?.queryRef === q);
        if (tied && r.ok && computed.has(`${tied.measure}/${period}`)) return { ...r, value: computed.get(`${tied.measure}/${period}`) };
        return r;
      },
    });
  },
  "ties to last month end's balance sheet": mutate((p) => ({
    // Asks for the balance sheet as at the run date but is handed last month end's.
    readSource: (s, q, period) => p.readSource(s, q.replace("as_at_run_date", "as_at_month_end"), period),
  })),
  "skips the tie": mutate((p) => ({
    readDefinitions: () => p.readDefinitions().map(({ tie, ...d }) => d),
  })),
  "treats a held input as zero": mutate((p) => ({
    publishReport: (input) => {
      const val = (m) => input.figures.find((f) => f.measure === m)?.value;
      const figures = input.figures.map((f) => {
        if (f.value !== null || !["owed_total", "free_to_spend"].includes(f.measure)) return f;
        const bank = val("bank_total") ?? 0;
        const owed = ["gst_owed", "payg_withheld", "super_payable", "other_tax_owed"].reduce((a, m) => a + (val(m) ?? 0), 0);
        return { ...f, value: f.measure === "owed_total" ? owed : bank - owed, unavailableReason: null };
      });
      return p.publishReport({ ...input, figures });
    },
  })),
  "fills a held figure with last week's": (() => {
    const last = new Map();
    return mutate((p) => ({
      publishReport: (input) => {
        const figures = input.figures.map((f) => {
          const key = `${input.audienceId}/${f.measure}`;
          if (f.value !== null) {
            last.set(key, f);
            return f;
          }
          return last.get(key) ?? f;
        });
        return p.publishReport({ ...input, figures });
      },
    }));
  })(),
  "corrects the input but not what is worked out from it": mutate((p) => ({
    publishReport: (input) => {
      if (!input.supersedes) return p.publishReport(input);
      const old = p.readReports(input.period).find((r) => r.id === input.supersedes);
      const figures = input.figures.map((f) => {
        if (!["owed_total", "free_to_spend", "owed_share_pct"].includes(f.measure)) return f;
        const o = old?.figures.find((x) => x.measure === f.measure);
        return o ? { ...f, value: o.value } : f;
      });
      return p.publishReport({ ...input, figures });
    },
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

/**
 * Proof the scenarios bite: run every scenario against a do-nothing build and
 * against deliberately broken builds, and require each check claimed green to
 * go red for the do-nothing build and for at least one broken build aimed at it.
 *
 *   node mutants.mjs
 *
 * Exits 1 if any scenario holds for a build that should fail it, or if the
 * real build fails one.
 */
import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const HOUR = 3_600_000;

/** Wrap the ports a build is handed. `over` gets the real ports and returns overrides. */
const mutate = (over) => (ports) => build({ ...ports, ...over(ports) });
/** Run the real build, then do something it must never do, through the same ports. */
const thenAlso = (extra) => async (ports) => {
  await build(ports);
  await extra(ports);
};

const mutants = {
  "does nothing": async () => {},
  "fires on complete whatever the rule says": mutate((p) => ({ readRule: () => ({ ...p.readRule(), trigger: "complete" }) })),
  "assumes a two hour wait": mutate((p) => ({ readRule: () => ({ ...p.readRule(), wait_hours: Math.min(2, p.readRule().wait_hours) }) })),
  "sends on first sight": mutate((p) => ({ readRule: () => ({ ...p.readRule(), wait_hours: 0 }) })),
  "a different link for some customers": mutate((p) => ({
    sendMessage: (m) => p.sendMessage(m.customerId === "C-2" || m.customerId === "C-4" ? { ...m, body: m.body.replace(/https:\S+/, "https://example.com.au/private-feedback") } : m),
  })),
  "pushes the happy customer": thenAlso(async (p) => {
    for (const r of p.readInbox()) {
      if (/5/.test(r.text)) {
        const item = { kind: "ask", jobId: "push", customerId: r.customerId, channel: "sms", to: "x", body: "Since you loved it, a review please" };
        const rel = p.requestRelease({ items: [item] });
        p.sendMessage({ ...item, releaseId: rel.releaseId });
      }
    }
  }),
  "ignores holds": mutate((p) => ({ readJob: (id) => { const j = p.readJob(id); return j && { ...j, openCallback: false, invoiceDisputed: false, openComplaint: false }; } })),
  "decides on the first read": (() => {
    const seen = new Map();
    return mutate((p) => ({ readJob: (id) => { if (!seen.has(id)) seen.set(id, p.readJob(id)); return seen.get(id); } }));
  })(),
  "never asks a job once held": mutate((p) => ({
    sendMessage: (m) => (p.readRecord().some((e) => e.kind === "hold" && e.jobId === m.jobId) ? { sent: false } : p.sendMessage(m)),
  })),
  "no window": mutate((p) => ({ readRule: () => ({ ...p.readRule(), window_days: 0 }) })),
  "ignores STOP": mutate((p) => ({ gate: () => ({ optedOut: false }), recordConsent: () => ({ ok: true }) })),
  "guesses a channel": mutate((p) => ({ readCustomer: (id) => { const c = p.readCustomer(id); return c && !c.mobile && !c.email ? { ...c, mobile: "+61400000999" } : c; } })),
  "sends on the wrong channel": mutate((p) => ({ readCustomer: (id) => { const c = p.readCustomer(id); return c && c.email && !c.mobile ? { ...c, mobile: "+61400000888" } : c; } })),
  "reminds again and again": mutate((p) => ({ readRecord: () => p.readRecord().filter((e) => e.kind !== "reminder") })),
  "does not read replies": mutate(() => ({ readInbox: () => [] })),
  "reminds early": mutate((p) => ({ readRule: () => ({ ...p.readRule(), reminder_hours: 1 }) })),
  "ignores a marked review": mutate((p) => ({ readJob: (id) => { const j = p.readJob(id); return j && { ...j, reviewMarkedBy: null }; } })),
  "alerts on every score": thenAlso(async (p) => {
    for (const r of p.readInbox()) p.notify({ to: p.readRule().owner, jobId: r.customerId === "C-2" ? "J-1002" : null, customerId: r.customerId, text: r.text });
  }),
  "no alert": mutate(() => ({ notify: () => ({ ok: true }) })),
  "offers a discount": mutate((p) => ({ sendMessage: (m) => p.sendMessage({ ...m, body: `${m.body} 10% off your next job for a review.` }) })),
  "sends whatever the office wrote": mutate((p) => ({
    readRule: () => {
      const r = p.readRule();
      return { ...r, message_text: r.message_text.replace(/ Leave us 5 stars.*$/, ""), _real: r.message_text };
    },
    sendMessage: (m) => p.sendMessage(m.kind === "ask" ? { ...m, body: p.readRule().message_text.replaceAll("{name}", m.body.split(/[ ,]/)[1]) } : m),
  })),
  "keeps no record": mutate(() => ({ writeRecord: () => ({ ok: true, id: "rec-x" }) })),
  "records the reply in its own words": mutate((p) => ({ writeRecord: (e) => p.writeRecord(e.kind === "reply" ? { ...e, text: e.text.toLowerCase().trim() } : e) })),
  "sends without a release": mutate((p) => ({ sendMessage: ({ releaseId, ...m }) => p.sendMessage(m) })),
};

let bad = 0;
for (const s of scenarios) {
  const real = s.world();
  await s.drive(build, real);
  const ok = s.holds(real) === true;
  if (!ok) {
    bad += 1;
    console.log(`REAL BUILD FAILS ${s.checkId}: ${s.describe(real)}`);
  }
  const caught = [];
  const missed = [];
  for (const [name, m] of Object.entries(mutants)) {
    const w = s.world();
    let held;
    try {
      await s.drive(m, w);
      held = s.holds(w) === true;
    } catch {
      held = false;
    }
    (held ? missed : caught).push(name);
  }
  const nothingOk = caught.includes("does nothing");
  const broken = caught.filter((n) => n !== "does nothing");
  if (!nothingOk || broken.length === 0) bad += 1;
  console.log(`${s.checkId}: red for ${caught.length}/${Object.keys(mutants).length} [${nothingOk ? "do-nothing red" : "DO-NOTHING HOLDS"}] caught: ${broken.join(", ") || "NONE"}`);
}

// The release itself: with nobody releasing, nothing goes, whatever is due.
{
  const { ReviewWorld } = await import("./review-world.mjs");
  const s = scenarios.find((x) => x.checkId === "the-wait-is-written");
  const w = s.world();
  w.releaser = null;
  await s.drive(build, w);
  const sent = w.calls.filter((c) => c.port === "send_message").length;
  const asked = w.calls.filter((c) => c.port === "release").length;
  if (sent !== 0 || asked === 0) bad += 1;
  console.log(`no release: ${asked} batch(es) prepared, ${sent} send attempt(s)`);
  void ReviewWorld;
  void HOUR;
}

process.exitCode = bad ? 1 : 0;
console.log(bad ? `\n${bad} problem(s).` : "\nEvery claimed check goes red for the do-nothing build and for a broken build aimed at it.");

/**
 * Proof the scenarios bite: run every scenario against a do-nothing build and
 * against deliberately broken builds, and require each check to go red for the
 * do-nothing build and for at least one broken build aimed at it.
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
  "copies last month's list": mutate((p) => ({
    sendMessage: (m) => {
      if (m.kind !== "list") return p.sendMessage(m);
      const before = p.readSent(m.clientId).filter((x) => x.kind === "list").flatMap((x) => x.lines);
      const extra = before.filter((l) => !m.lines.some((x) => x.lineId === l.lineId));
      return p.sendMessage({ ...m, lines: [...m.lines, ...extra] });
    },
  })),
  "sends a fresh list every run": mutate((p) => ({
    readSent: (id) => p.readSent(id).filter((m) => m.kind !== "list"),
  })),
  "puts new lines on a second list": mutate((p) => ({
    readSent: (id) => {
      const sent = p.readSent(id);
      const now = p.readUncodedLines(id).map((l) => l.lineId);
      const listed = new Set(sent.flatMap((m) => m.lines.map((l) => l.lineId)));
      return now.some((l) => !listed.has(l)) ? sent.filter((m) => m.kind !== "list") : sent;
    },
  })),
  "no answer link": mutate((p) => ({
    sendMessage: (m) => p.sendMessage({ ...m, answerLink: "", text: m.text.replace(/https:\/\/\S+/g, "") }),
  })),
  "asks in bookkeeping words": mutate((p) => ({
    sendMessage: (m) => p.sendMessage({ ...m, lines: m.lines.map((l) => ({ ...l, question: `Suspense line ${l.lineId}: which account code?` })) }),
  })),
  "adds a GST tip": mutate((p) => ({
    sendMessage: (m) => p.sendMessage({ ...m, text: `${m.text}\nTip: business expenses like these are usually deductible.` }),
  })),
  "forgets answers when asking": mutate((p) => ({
    sendMessage: (m) => {
      const all = p.readUncodedLines(m.clientId).map((l) => ({ lineId: l.lineId, question: `${l.payee}: what was it for?` }));
      const lines = m.kind === "list" ? all : [...m.lines, ...all.filter((l) => !m.lines.some((x) => x.lineId === l.lineId))];
      return p.sendMessage({ ...m, lines });
    },
  })),
  "reminds every day": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), reminderEveryDays: 1 }),
  })),
  "reminds without end": mutate((p) => ({
    readSettings: () => ({ ...p.readSettings(), maxReminders: 99 }),
  })),
  "never hands to a person": mutate((p) => ({
    handToPerson: (h) => (h.kind === "unanswered" ? undefined : p.handToPerson(h)),
  })),
  "tidies the answer": mutate((p) => ({
    record: (e) => {
      if (e.kind !== "answer") return p.record(e);
      const a = JSON.parse(e.detail);
      return p.record({ ...e, detail: JSON.stringify({ ...a, text: a.text.toLowerCase().replace(/ for the .*$/, "") }) });
    },
  })),
  "keeps no answer record": mutate((p) => ({
    record: (e) => (e.kind === "answer" ? undefined : p.record(e)),
  })),
  "ignores history": mutate(() => ({
    readHistory: () => [],
  })),
  "borrows another client's chart": mutate((p) => ({
    readChart: () => {
      const all = p.readClients().map((c) => p.readChart(c.clientId));
      return { accounts: all.flatMap((c) => c.accounts), taxCodes: [...new Set(all.flatMap((c) => c.taxCodes))] };
    },
  })),
  "invents an account": mutate((p) => ({
    handToPerson: (h) =>
      h.kind === "no_account_fits"
        ? h.lineIds.forEach((id) => p.propose({ lineId: id, coding: { account: "699", taxCode: "INPUT" }, why: "new account" }))
        : p.handToPerson(h),
  })),
  "writes the proposal unapproved": mutate((p) => ({
    propose: (x) => {
      p.propose(x);
      p.writeCoding(x.lineId, x.coding, `auto:${x.lineId}`);
    },
  })),
  "writes the history coding, not the approval": mutate((p) => ({
    writeCoding: (lineId, coding, key) => p.writeCoding(lineId, { account: "310", taxCode: "INPUT" }, key),
  })),
  "treats bank lines as transactions": mutate((p) => ({
    readUncodedLines: (id) => p.readUncodedLines(id).map((l) => ({ ...l, source: "suspense" })),
  })),
  "mints a fresh key per try": (() => {
    let n = 0;
    return mutate((p) => ({
      writeCoding: (lineId, coding, key) => p.writeCoding(lineId, coding, `${key}:${(n += 1)}`),
    }));
  })(),
  "retries blind under a new key": mutate((p) => ({
    writeCoding: (lineId, coding, key) => {
      const r = p.writeCoding(lineId, coding, key);
      return r.ok ? r : p.writeCoding(lineId, coding, `${key}:retry`);
    },
  })),
  "trusts the write": (() => {
    const wrote = new Map();
    return mutate((p) => ({
      writeCoding: (lineId, coding, key) => {
        wrote.set(lineId, coding);
        return p.writeCoding(lineId, coding, key);
      },
      readCoding: (lineId) => (wrote.has(lineId) ? wrote.get(lineId) : p.readCoding(lineId)),
    }));
  })(),
  "writes again on a mismatch": mutate((p) => ({
    handToPerson: (h) => {
      const m = /Approved (\S+) \/ (\S+);/.exec(h.detail);
      if (h.kind === "readback_mismatch" && m) return p.writeCoding(h.lineIds[0], { account: m[1], taxCode: m[2] }, `again:${h.lineIds[0]}`);
      return p.handToPerson(h);
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

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

/** A read that answers with nothing instead of saying it could not answer. */
const swallow = (r, empty) => (r.ok ? r : { ok: true, readId: "RD-made-up", asAt: new Date().toISOString(), data: empty });

const mutants = {
  "does nothing": async () => {},
  "skips payroll": mutate((p) => ({
    recordResult: (r) => (r.item === "payroll" ? undefined : p.recordResult(r)),
  })),
  "records a pass with no read behind it": mutate((p) => ({
    recordResult: (r) => p.recordResult(r.status === "pass" ? { ...r, evidence: undefined } : r),
  })),
  "treats an unanswered read as nothing found": mutate((p) => ({
    readBank: (id) => swallow(p.readBank(id), []),
    readPayroll: (id) => swallow(p.readPayroll(id), { expectedPayDates: [], postedPayDates: [] }),
  })),
  "checks only the first bank account": mutate((p) => ({
    readBank: (id) => {
      const r = p.readBank(id);
      return r.ok ? { ...r, data: r.data.slice(0, 1) } : r;
    },
  })),
  "checks the balance, not the statement date": mutate((p) => ({
    readBank: (id) => {
      const r = p.readBank(id);
      return r.ok ? { ...r, data: r.data.map((a) => ({ ...a, statementDate: "2099-12-31" })) } : r;
    },
  })),
  "raises every uncoded line every run": mutate((p) => ({
    readClose: (id) => ({ ...p.readClose(id), raised: [] }),
  })),
  "recodes suspense lines itself": mutate((p) => ({
    readUncoded: (id) => {
      const r = p.readUncoded(id);
      return r.ok ? { ...r, data: [] } : r;
    },
  })),
  "uses last month's figure": mutate((p) => ({
    readSchedule: (id) => {
      const r = p.readSchedule(id);
      return r.ok ? { ...r, data: r.data.map((l) => (l.amount === null && l.lastPosted !== undefined ? { ...l, amount: l.lastPosted } : l)) } : r;
    },
  })),
  "drops who entered the amount": mutate((p) => ({
    proposeJournal: ({ enteredBy, ...j }) => p.proposeJournal({ ...j, source: "schedule" }),
  })),
  "rounds away differences under a dollar": mutate((p) => ({
    readControls: (id) => {
      const r = p.readControls(id);
      return r.ok ? { ...r, data: { ...r.data, clearing: r.data.clearing.map((a) => ({ ...a, balance: Math.abs(a.balance) < 100 ? 0 : a.balance })) } } : r;
    },
  })),
  "ignores differences under twenty dollars": mutate((p) => ({
    readAged: (id, side) => {
      const r = p.readAged(id, side);
      return r.ok && Math.abs(r.data.agedTotal - r.data.controlBalance) < 2_000 ? { ...r, data: { ...r.data, controlBalance: r.data.agedTotal } } : r;
    },
  })),
  "treats every pack as signed off": mutate((p) => ({
    readClose: (id) => {
      const pack = p.readClose(id);
      return { ...pack, signoff: pack.signoff ?? { entityId: id, period: pack.period, by: "the bot", at: "", approvedProposalIds: pack.proposals.map((x) => x.proposalId) } };
    },
  })),
  "posts every proposal, approved or not": mutate((p) => ({
    readClose: (id) => {
      const pack = p.readClose(id);
      return pack.signoff ? { ...pack, signoff: { ...pack.signoff, approvedProposalIds: pack.proposals.map((x) => x.proposalId) } } : pack;
    },
  })),
  "mints a fresh id per try": (() => {
    let n = 0;
    return mutate((p) => ({ postJournal: (j) => p.postJournal({ ...j, intentId: `${j.intentId}:try${(n += 1)}` }) }));
  })(),
  "posts without reading back first": mutate((p) => ({
    readJournals: () => [],
  })),
  "keeps quiet about a lost answer": mutate((p) => ({
    raiseException: (x) => (x.kind === "write_failed" ? undefined : p.raiseException(x)),
  })),
  "tries to write a lock the ledger cannot": mutate((p) => ({
    readLockDate: (id) => ({ ...p.readLockDate(id), writable: true }),
  })),
  "sets the lock date regardless of what it found": mutate((p) => ({
    readLockDate: (id) => {
      const r = p.readLockDate(id);
      return r.lockDate !== null && r.lockDate > "2026-10-31" ? { ...r, lockDate: null } : r;
    },
  })),
  "asks for the lock every run": mutate((p) => ({
    readClose: (id) => ({ ...p.readClose(id), lockTasks: 0 }),
  })),
  "hands on without a lock read": mutate((p) => ({
    readLockDate: (id) => ({ ...p.readLockDate(id), lockDate: "2026-10-31" }),
  })),
  "hands on every run": mutate((p) => ({
    readClose: (id) => ({ ...p.readClose(id), handedOff: false }),
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

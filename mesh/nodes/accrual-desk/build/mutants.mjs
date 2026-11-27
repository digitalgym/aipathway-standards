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

/** Change every preview on its way into the book. */
const onPreview = (f) => mutate((p) => ({ writePreview: (pv) => p.writePreview(f(pv)) }));

const mapDrafts = (f) => mutate((p) => ({ readDrafts: () => p.readDrafts().map(f) }));
const mapJournalLines = (f) => mapDrafts((d) => ({ ...d, journalLines: d.journalLines.map((l) => f(l, d)) }));

const mutants = {
  "does nothing": async () => {},
  "skips the reversals": mutate((p) => ({ readDrafts: () => p.readDrafts().filter((d) => !d.reverses) })),
  "writes under another journal's preview": mutate((p) => ({
    writeDocument: (w) => p.writeDocument({ ...w, previewId: "PV-1" }),
  })),
  "ignores the discount": mapJournalLines((l) => ({ ...l, discountPercent: 0 })),
  "copies the drafted amount instead of working it out": mapJournalLines((l) => {
    const { quantity, unitPrice, discountPercent, ...rest } = l;
    return l.lineId.startsWith("C2-") ? { ...rest, debit: l.debit ? l.debit + 1 : 0, credit: l.credit ? l.credit + 1 : 0 } : l;
  }),
  "rounds line amounts down": onPreview((pv) => ({ ...pv, lines: pv.lines.map((l) => ({ ...l, amount: Math.floor(l.amount / 100) * 100 })) })),
  "does not say which rates read it used": onPreview((pv) => ({ ...pv, ratesReadId: "RT-made-up" })),
  "leaves the accrual account out of the journal": onPreview((pv) => ({
    ...pv,
    journal: pv.journal.filter((l) => l.accountCode !== "826" && l.accountCode !== "630"),
  })),
  "lets an unbalanced journal through": mapJournalLines((l, d) => (d.source?.id === "C4" && (l.credit || l.debit) === 50000 ? (l.credit ? { ...l, credit: 55000 } : { ...l, debit: 55000 }) : l)),
  "corrects a total a cent out": mapDrafts((d) => (d.source?.id === "C3" ? { ...d, stated: { subtotal: 99248, totalTax: 0, total: 99248 } } : d)),
  "assumes no GST for a tax type it does not know": mutate((p) => ({
    readTaxRates: () => {
      const r = p.readTaxRates();
      return r.ok
        ? { ...r, data: [...r.data, { taxType: "GSTONIMPORTS", rate: 0 }] }
        : { ok: true, readId: "RT-guess", asAt: "", data: [{ taxType: "BASEXCLUDED", rate: 0 }] };
    },
  })),
  "treats every preview as released": mutate((p) => ({
    readBook: () => {
      const b = p.readBook();
      return { ...b, releases: b.previews.map((pv) => ({ previewId: pv.previewId, draftId: pv.draftId, by: "the bot", at: "" })) };
    },
  })),
  "writes a reversal without waiting for its accrual": mapDrafts(({ reverses, ...d }) => d),
  "mints a fresh key per try": (() => {
    let n = 0;
    return mutate((p) => ({
      writeDocument: (w) => p.writeDocument({ ...w, idempotencyKey: `${w.idempotencyKey}:try${(n += 1)}` }),
      readDocument: (k) => p.readDocument(`${k}:try${n}`),
    }));
  })(),
  "never reads the ledger before a retry": mutate((p) => {
    const wrote = new Set();
    return {
      readDocument: (k) => (wrote.has(k) ? p.readDocument(k) : null),
      writeDocument: (w) => {
        const r = p.writeDocument(w);
        if (r.ok) wrote.add(w.idempotencyKey);
        return r;
      },
    };
  }),
  "keeps quiet about a lost answer": mutate((p) => ({
    park: (x) => (x.kind === "write_failed" ? undefined : p.park(x)),
  })),
  "skips the read-back": mutate(() => ({ recordReadBack: () => undefined })),
  "trusts what it sent over what the ledger stored": mutate((p) => ({
    readDocument: (k) => {
      const d = p.readDocument(k);
      if (!d) return d;
      const pv = p.readBook().previews.find((x) => k.endsWith(`:${x.draftId}:${x.previewId}`));
      return pv ? { ...d, subtotal: pv.subtotal, totalTax: pv.totalTax, total: pv.total } : d;
    },
  })),
  "ignores dry run": mutate((p) => ({ readSettings: () => ({ ...p.readSettings(), dryRun: false }) })),
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
  if (s.checkId === "survives-the-builder") continue; // evidence, never green on a run
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

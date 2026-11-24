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

const mutants = {
  "does nothing": async () => {},
  "skips credit notes": mutate((p) => ({
    readDrafts: () => p.readDrafts().filter((d) => d.type !== "credit_note"),
  })),
  "writes under another draft's preview": mutate((p) => ({
    writeDocument: (w) => p.writeDocument({ ...w, previewId: "PV-1" }),
  })),
  "ignores the discount": mutate((p) => ({
    readDrafts: () => p.readDrafts().map((d) => ({ ...d, lines: d.lines.map((l) => ({ ...l, discountPercent: 0 })) })),
  })),
  "rounds line amounts down": onPreview((pv) => ({ ...pv, lines: pv.lines.map((l) => ({ ...l, amount: Math.floor(l.amount / 100) * 100 })) })),
  "works GST out once on the subtotal": onPreview((pv) => {
    const totalTax = pv.totalTax === 0 ? 0 : Math.round(pv.subtotal * 0.1);
    return { ...pv, totalTax, total: pv.subtotal + totalTax };
  }),
  "treats an inclusive draft as exclusive": mutate((p) => ({
    readDrafts: () => p.readDrafts().map((d) => (d.amountType === "inclusive" ? { ...d, amountType: "exclusive" } : d)),
  })),
  "does not say which rates read it used": onPreview((pv) => ({ ...pv, ratesReadId: "RT-made-up" })),
  "leaves the GST line out of the journal": onPreview((pv) => ({ ...pv, journal: pv.journal.filter((l) => l.accountCode !== "820") })),
  "lets an unbalanced journal through": mutate((p) => ({
    readDrafts: () =>
      p.readDrafts().map((d) =>
        d.draftId === "MJ-2" ? { ...d, journalLines: d.journalLines.map((l) => (l.credit ? { ...l, credit: l.credit + 1000 } : l)) } : d,
      ),
  })),
  "corrects a total a cent out": mutate((p) => ({
    readDrafts: () => p.readDrafts().map((d) => (d.draftId === "INV-2" ? { ...d, stated: { subtotal: 12345, totalTax: 1235, total: 13580 } } : d)),
  })),
  "assumes 10% for a rate it does not know": mutate((p) => ({
    readTaxRates: () => {
      const r = p.readTaxRates();
      return r.ok ? { ...r, data: [...r.data, { taxType: "GSTONIMPORTS", rate: 0.1 }] } : { ok: true, readId: "RT-guess", asAt: "", data: [{ taxType: "OUTPUT", rate: 0.1 }, { taxType: "INPUT", rate: 0.1 }] };
    },
  })),
  "treats every preview as released": mutate((p) => ({
    readBook: () => {
      const b = p.readBook();
      return { ...b, releases: b.previews.map((pv) => ({ previewId: pv.previewId, draftId: pv.draftId, by: "the bot", at: "" })) };
    },
  })),
  "mints a fresh key per try": (() => {
    let n = 0;
    return mutate((p) => ({
      writeDocument: (w) => p.writeDocument({ ...w, idempotencyKey: `${w.idempotencyKey}:try${(n += 1)}` }),
      readDocument: (k) => p.readDocument(`${k}:try${n}`),
    }));
  })(),
  "never reads the ledger before a retry": mutate((p) => {
    let wrote = new Set();
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

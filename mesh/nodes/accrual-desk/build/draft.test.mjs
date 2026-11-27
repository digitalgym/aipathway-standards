/**
 * The drafting step, which the conformance run does not see: it starts at the
 * hand-over. `node --test draft.test.mjs`
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftAccruals } from "./build.mjs";
import { SOURCES } from "./scenarios.mjs";

const drafts = draftAccruals(SOURCES);
const byId = (id) => drafts.find((d) => d.draftId === id);
const debits = (d) => d.journalLines.reduce((s, l) => s + l.debit, 0);
const credits = (d) => d.journalLines.reduce((s, l) => s + l.credit, 0);

test("one accrual per source item, each with a reversal", () => {
  const ids = drafts.map((d) => d.draftId).sort();
  const accruals = ["C1", "C2", "C3", "C4", "C5", "PHONE", "J1041", "J1043"].map((x) => `ACR-2026-11-${x}`);
  assert.deepEqual(ids, [...accruals, ...accruals.map((x) => x.replace("ACR-", "REV-"))].sort());
});

test("accruals are dated the last day of the month, reversals the first of next", () => {
  for (const d of drafts) assert.equal(d.date, d.reverses ? "2026-12-01" : "2026-11-30");
});

test("a cost whose bill already arrived is not accrued", () => {
  assert.equal(byId("ACR-2026-11-C6"), undefined);
});

test("a recurring bill missing this month is accrued at last month's amount before GST", () => {
  const d = byId("ACR-2026-11-PHONE");
  assert.equal(debits(d), 19450);
  assert.equal(credits(d), 19450);
  assert.equal(byId("ACR-2026-11-CLEAN"), undefined, "billed this month");
  assert.equal(byId("ACR-2026-11-SOFT"), undefined, "not recurring");
});

test("unbilled work debits accrued income and credits sales", () => {
  const d = byId("ACR-2026-11-J1041");
  assert.deepEqual(
    d.journalLines.map((l) => [l.accountCode, l.debit, l.credit]),
    [["630", 354790, 0], ["200", 0, 118750], ["200", 0, 236040]],
  );
});

test("a reversal swaps every line and carries the same stated total", () => {
  const a = byId("ACR-2026-11-C2");
  const r = byId("REV-2026-11-C2");
  assert.equal(r.reverses, a.draftId);
  assert.deepEqual(r.stated, a.stated);
  r.journalLines.forEach((l, i) => {
    assert.equal(l.debit, a.journalLines[i].credit);
    assert.equal(l.credit, a.journalLines[i].debit);
  });
});

test("every line names a tax type, the ledger's no-tax type unless the person coded another", () => {
  for (const d of drafts) for (const l of d.journalLines) assert.equal(l.taxType, d.source.id === "C5" && !l.lineId.includes("-AC") ? "GSTONIMPORTS" : "BASEXCLUDED");
});

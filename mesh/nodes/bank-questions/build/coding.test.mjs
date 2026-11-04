import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCodes } from "./coding.mjs";

const RULES = [
  { words: ["fuel", "petrol", "diesel", "ute"], account: "449", name: "Motor Vehicle Expenses", tax: "GST on Expenses" },
  { words: ["personal", "private", "groceries"], account: "880", name: "Owner A Drawings", tax: "BAS Excluded" },
  { words: ["software", "subscription"], account: "485", name: "Subscriptions", tax: "GST on Expenses" },
];
const line = (lineId, answer, amount = 120) => ({ lineId, date: "2026-10-14", amount, answer });

test("one rule fits: a suggestion, still for the bookkeeper", () => {
  const [s] = suggestCodes([line("BL1", "Fuel for the ute")], RULES);
  assert.equal(s.suggestion.account, "449");
  assert.equal(s.status, "for_bookkeeper");
});

test("no rule fits: no guess", () => {
  const [s] = suggestCodes([line("BL2", "Paid Gary back for the tickets")], RULES);
  assert.equal(s.suggestion, null);
});

test("two rules fit: no guess", () => {
  const [s] = suggestCodes([line("BL3", "Personal software subscription")], RULES);
  assert.equal(s.suggestion, null);
  assert.match(s.reason, /more than one/);
});

test("mixed use: never split by the bot", () => {
  const [s] = suggestCodes([line("BL4", "Half fuel, half personal")], RULES);
  assert.equal(s.suggestion, null);
  assert.match(s.reason, /mixed/);
});

test("no answer: nothing suggested", () => {
  const [s] = suggestCodes([line("BL5", "")], RULES);
  assert.equal(s.suggestion, null);
});

test("nothing is ever marked coded", () => {
  const out = suggestCodes([line("A", "fuel"), line("B", "groceries"), line("C", "?")], RULES);
  assert.ok(out.every((s) => s.status === "for_bookkeeper"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runCheck, world } from "../dist/runner.js";

const check = (assertable) => ({
  id: "x", n: 1, title: "x", statement: "x", assertable, ports: [], stimulus: "x", assertion: "x",
});
const scenario = (holds) => ({ checkId: "x", world: () => world(), drive: () => {}, holds, describe: () => "described" });
const verdict = async (assertable, holds) => (await runCheck(check(assertable), scenario(holds), () => {}, "stub")).verdict;

test("a holds() that returns nothing fails instead of passing", async () => {
  assert.equal(await verdict("stub", () => undefined), "fail");
  assert.equal(await verdict("both", () => undefined), "fail");
});

test("only an explicit true passes; truthy values do not", async () => {
  assert.equal(await verdict("stub", () => true), "pass");
  assert.equal(await verdict("stub", () => 1), "fail");
  assert.equal(await verdict("stub", () => false), "fail");
  assert.equal(await verdict("both", () => true), "shape_only");
});

test("the fixture says why a non-boolean failed", async () => {
  const r = await runCheck(check("stub"), scenario(() => undefined), () => {}, "stub");
  assert.match(r.actual, /holds\(\) returned undefined/);
});

test("production and precondition checks are unchanged on the stub", async () => {
  assert.equal(await verdict("production", () => undefined), "with_us");
  assert.equal(await verdict("precondition", () => undefined), "evidence_required");
});

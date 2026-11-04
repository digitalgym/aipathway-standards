/**
 * The scenarios, run against builds that should fail them.
 *
 *   node broken-builds.mjs
 *
 * A do-nothing build, then one mutation of build.mjs per way a real build goes
 * wrong. Every scenario must go red for the do-nothing build and for at least
 * one mutation; if one stays green, the scenario is too weak. Prints a table
 * and exits non-zero if any scenario survives every broken build.
 */

import { readFile } from "node:fs/promises";
import { scenarios } from "./scenarios.mjs";

const src = await readFile(new URL("./build.mjs", import.meta.url), "utf8");

/** [name, search, replace]: each must match the source exactly once. */
const MUTATIONS = [
  ["captures twice", "if (before.some((r) => r.source_job_id === jobId)) continue;", ""],
  ["copies fields loosely", "for (const f of FIELDS) rec[f] = job.equipment[f] ?? null;", "for (const f of FIELDS) rec[f] = f === 'serial' ? 'unknown' : job.equipment[f] ?? null;"],
  ["guesses gaps", "if (gap) {", "if (false) {"],
  ["borrows a schedule", `if (!rule || typeof rule.service_months !== "number") {`, "if (false) {"],
  ["uses the typed date", `const dues = [{ kind: "service", due_on: addMonths(anchor, rule.service_months) }];`, `const dues = [{ kind: "service", due_on: "2026-11-10" }];`],
  ["ignores last service", "const anchor = asset.last_serviced_on ?? asset.installed_on;", "const anchor = asset.installed_on;"],
  ["assumes a warranty", `if (typeof asset.warranty_months === "number") {`, "if (true) { asset.warranty_months ??= 60;"],
  ["no lead time", "if (today >= addDays(due.due_on, -settings.lead_days)) stage = \"reminder\";", "stage = \"reminder\";"],
  ["reminds past dates", "if (due.due_on < today) return false;", ""],
  ["reminds every run", `const first = entries.find((e) => e.entry === "reminder");`, "const first = undefined;"],
  ["any channel", `const channel = consent.sms ? "sms" : consent.email ? "email" : null;`, `const channel = "sms";`],
  ["skips open-job check", "if (open.jobs.length > 0) return false;", ""],
  ["follows up forever", `const follow = entries.find((e) => e.entry === "follow_up");`, "const follow = undefined;"],
  ["follows up early", "if (today >= addDays(first.sent_on, settings.follow_up_days)) stage = \"follow_up\";", "stage = \"follow_up\";"],
  ["follows up after a reply", `if (entries.some((e) => e.entry === "reply")) return false;`, ""],
  ["ignores a stop", "if (!consent || consent.withdrawn) return false;", "if (!consent) return false;"],
  ["never records a stop", "await ports.recordConsent({", "void ({"],
  ["talks about cover", "according to our record. ", "according to our record, and any repair before then is covered. "],
  ["books twice", "if (open.jobs.length > 0) {\n    await ports.evidence({ entry: \"booking_already_open\"", "if (false) {\n    await ports.evidence({ entry: \"booking_already_open\""],
  ["picks a time and price", `kind: "booking_request",`, `kind: "booking_request", start_time: "09:00", price: 180,`],
  ["tells nobody", "await ports.notify(settings.office, back.job_id,", "void (settings.office, back.job_id,"],
  ["keeps no record", "await ports.evidence({\n    entry: stage,", "void ({\n    entry: stage,"],
  ["rewrites reply text", "      text: reply.text,\n    });", "      text: reply.text.trim(),\n    });"],
  ["unclear goes nowhere", `await ports.escalate({ ref: reply.reply_id, kind: "unclear_reply"`, `void ({ ref: reply.reply_id, kind: "unclear_reply"`],
];

const load = async (code) => (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).build;

const builds = [["do-nothing", async () => {}]];
for (const [name, from, to] of MUTATIONS) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`mutation "${name}" matched ${n} times`);
  builds.push([name, await load(src.replace(from, to))]);
}
builds.push(["real build", await load(src)]);

async function held(scenario, build) {
  const w = scenario.world();
  try {
    await scenario.drive(build, w);
    return scenario.holds(w) === true;
  } catch {
    return false;
  }
}

let weak = 0;
for (const s of scenarios) {
  if (s.checkId === "survives-the-builder") continue;
  const red = [];
  for (const [name, b] of builds.slice(0, -1)) if (!(await held(s, b))) red.push(name);
  const real = await held(s, builds[builds.length - 1][1]);
  const ok = real && red.includes("do-nothing") && red.length >= 2;
  if (!ok) weak++;
  console.log(`${ok ? "ok  " : "WEAK"} ${s.checkId.padEnd(30)} real=${real ? "green" : "RED"}  red for: ${red.join(", ")}`);
}
console.log(weak ? `\n${weak} scenario(s) too weak.` : "\nEvery scenario goes red for the do-nothing build and at least one broken build.");
process.exitCode = weak ? 1 : 0;

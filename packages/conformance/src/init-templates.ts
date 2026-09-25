// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/init-templates.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * The scaffold `conformance init` writes.
 *
 * WHY THIS EXISTS. Until now the package handed a builder the checks as data
 * and a README example, and left them to write the harness: a world per check,
 * a drive, a holds, and the glue that ties eleven of those to a runner. That is
 * an hour of reading before anything runs, and the whole argument for
 * publishing the standards is that a coding agent can be handed one and finish
 * the job. An agent given prose invents a harness; an agent given a scaffold
 * that already runs red fills it in. The difference is the first minute.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not try to find or start anybody's
 * existing code, for the reason the CLI header already gives: guessing how
 * somebody's project boots is how a tool becomes a framework. `init` writes a
 * new folder that runs on its own, and the builder wires it to their code or
 * copies the build out. Nothing is discovered, nothing is patched.
 *
 * EVERY SCENARIO STARTS RED. `holds` returns false until somebody writes the
 * assertion, so the first run is all fail and the arc is red to green. A
 * scaffold that started green would be a scaffold that proved nothing, and the
 * one thing this package exists to avoid is a result that does not mean
 * anything.
 *
 * These are pure string functions, taking the fetched standard and returning
 * file contents, so the generator is unit-testable without a filesystem or a
 * network. `bin/conformance.mjs` is the only part that writes.
 */

import type { Check } from "./types.js";

/**
 * The published document, as the templates need it.
 *
 * Declared here rather than imported from `fetch-checks.ts`, which exists only
 * in the generated package and not in this directory. These are the fields the
 * scaffold actually reads; a structural type keeps this file copyable into the
 * package without the import following it.
 */
/** The live-step block checks.json carries. Mirrors `ProviderBlock` in providers.ts. */
export interface StandardProvider {
  job: string;
  skill: string;
  stub: string;
  production: string | null;
  product: string | null;
  insert: string | null;
  with_us: { kind: string } & Record<string, unknown>;
}

export interface StandardDoc {
  spec: string;
  /** The constitution: never / stays with a person. Absent from older sites. */
  boundary?: { never: readonly string[]; stays_with_person: readonly string[] } | null;
  /** The roles the build must stand on. Absent from older sites. */
  substrate?: { requires: { role: string; label: string; need: string; with_us?: true }[] } | null;
  /** What to do when a check is `with_us`. Absent from sites older than 2026-09-24. */
  with_us_next?: string;
  how_to_read?: string;
  provider?: StandardProvider | null;
  /** The standard's edition: the date its content last changed. Absent from sites older than 2026-09-24. */
  version?: string | null;
  standard: string;
  source: string;
  markdown: string;
  licence: string;
  envelope_version: string;
  tally: {
    total: number;
    onStub: number;
    productionOnly: number;
    partial: number;
    preconditions: number;
  };
  checks: Check[];
}

/**
 * Which world class each standard drives.
 *
 * Most standards carry a bespoke world because their subject has state a
 * generic one cannot hold: a ledger, a rent roll, a price book. The rest use
 * `StubWorld`, which models a call. Every world exposes `ports()` and `calls`,
 * which is why one scaffold shape fits all of them.
 */
const WORLDS: Record<string, string> = {
  "booked-after-hours-build-standard": "StubWorld",
  "debtor-chasing-build-standard": "DebtorWorld",
  "rent-arrears-build-standard": "ArrearsWorld",
  "database-reactivation-build-standard": "ReactivationWorld",
  "invoice-check-build-standard": "InvoiceWorld",
  "rejected-pack-build-standard": "PackWorld",
  "compliance-calendar-build-standard": "CalendarWorld",
  "cited-answer-build-standard": "CitedAnswerWorld",
  "multi-site-conformance-build-standard": "MultiSiteWorld",
  "quote-out-build-standard": "QuoteWorld",
  "fire-service-pack-standard": "CalendarWorld",
};

/**
 * Standards whose live port map is published, and the map's export name.
 *
 * A live run needs one thing the stub does not: which port each method of the
 * build speaks through. `StubWorld` knows that internally; `LiveWorld` needs it
 * as data, because the implementations are the builder's own.
 *
 * Only the call world is published so far. The others are deliberately absent
 * rather than guessed: a map naming the wrong port would record a real write
 * under the wrong name, and a trace that misdescribes what happened is worse
 * than no trace. `init` simply does not offer a production run for those, and
 * says so, instead of writing a ports file nobody can trust.
 */
const LIVE_MAPS: Record<string, string> = {
  "booked-after-hours-build-standard": "CALL_PORT_MAP",
};

/** The live port map for a standard, if one is published. */
export function liveMapFor(slug: string): string | null {
  return LIVE_MAPS[slug] ?? null;
}

export function worldFor(slug: string): string {
  return WORLDS[slug] ?? "StubWorld";
}

/** A JS block comment body, with the terminator defanged. */
function comment(text: string): string {
  return text.replace(/\*\//g, "*\\/");
}

/** A single-quoted JS string literal. */
function lit(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * One scenario per check, in the check's own words.
 *
 * `stimulus` and `assertion` are carried into the file as comments rather than
 * summarised, so the person or agent filling it in is reading the standard
 * itself and not somebody's paraphrase of it.
 */
function scenarioFor(check: Check, world: string): string {
  return `  {
    checkId: ${lit(check.id)},
    // ${check.n}. ${comment(check.title)}
    //
    // Conformance:  ${comment(check.statement)}
    // Inject:       ${comment(check.stimulus)}
    // Then assert:  ${comment(check.assertion)}${
      check.stubLimit ? `\n    // On the stub:  ${comment(check.stubLimit)}` : ""
    }
    world: () => new ${world}(),
    drive: (build, world) => build(world.ports()),
    // TODO: read the world and return whether the assertion above holds.
    // It reads the world, never the build: a build that went around the ports
    // leaves the world empty, and that is the point.
    holds: () => false,
    describe: (world) => \`\${world.calls.length} port call(s)\`,
  },`;
}

export function scenariosFile(std: StandardDoc, slug: string): string {
  const world = worldFor(slug);
  const runnable = std.checks.filter((c) => c.assertable !== "production");
  return `/**
 * One scenario per check of ${comment(std.standard)}.
 *
 * Generated by \`npx @aipathway/conformance init ${slug}\`, from
 * ${comment(std.source)}
 *
 * The checks themselves are NOT in this file. They are fetched at run time, so
 * a correction published on the site reaches you without anybody releasing
 * anything, and you cannot end up conformant against a stale copy. What is here
 * is the part only you can write: the world each check starts in, how your build
 * is driven, and what "held" means.
 *
 * Every \`holds\` returns false until you write it. That is deliberate: the first
 * run is all red, and going green is the work.
 *
 * Checks that only run against the live provider are left out. The runner
 * reports them as \`with_us\` rather than failing you for not having a phone
 * number, a real ledger or a real register.
 */

import { ${world} } from "@aipathway/conformance";

export const scenarios = [
${runnable.map((c) => scenarioFor(c, world)).join("\n")}
];
`;
}

export function buildFile(std: StandardDoc, slug: string): string {
  return `/**
 * Your build. This is the only file that is yours.
 *
 * It receives the ports and does the job described in
 * ${comment(std.source)}
 *
 * THE ONE RULE. Everything your build does to the outside world goes through
 * the ports it is handed. The runner owns the world you write into, so a build
 * that reaches past them for a vendor SDK leaves that world empty and the run
 * says "no write observed through the port" instead of quietly passing.
 *
 * When this is real, the ports are wired to your own systems instead of the
 * stub, and the same checks run again against production.
 */

/**
 * @param {import("@aipathway/conformance").Ports} ports
 */
export function build(ports) {
  // TODO: implement ${comment(std.standard)}.
  //
  // Run \`npx @aipathway/conformance show ${slug}\` to see every check with what
  // it injects and what it asserts, or read the standard itself at
  // ${comment(std.source)}
  void ports;
}
`;
}

export function runFile(std: StandardDoc, slug: string): string {
  const map = liveMapFor(slug);
  const liveImports = map
    ? `import { LiveWorld, ${map} } from "@aipathway/conformance";\n`
    : "";
  const liveBlock = map
    ? `
// Production. The same checks, against your own systems.
//
//   AIPATHWAY_ENV=production node run.mjs
//
// Every scenario's world is replaced with one whose ports are yours. Assertions
// that read the trace are unchanged; assertions that reached into stub memory
// are stub-only by construction, and the honest fix is to read the value back
// through a port so the read lands in the trace.
const live = env === "production";
// Which ports stand behind the run: yours (./ports.mjs), or the hosted
// provider's (./ports.office-voice.mjs) when AIPATHWAY_PROVIDER names it.
// That second file is the production gate: the same checks, driven against us.
const portsModule = live
  ? provider.startsWith("office_voice.") ? "./ports.office-voice.mjs" : "./ports.mjs"
  : null;
const livePorts = portsModule ? (await import(portsModule)).ports : null;
const scenariosToRun = live
  ? scenarios.map((s) => ({ ...s, world: () => new LiveWorld(livePorts, ${map}) }))
  : scenarios;
`
    : `
const scenariosToRun = scenarios;
`;

  return `/**
 * Fetch the checks, run your build against them, print the result.
 *
 *   node run.mjs
 *${map ? `
 *   AIPATHWAY_ENV=production node run.mjs   # against your own systems
 *` : ""}
 * Nothing here needs editing. The files that do are build.mjs${map ? ", ports.mjs" : ""}
 * and scenarios.mjs.
 */
import { writeFile } from "node:fs/promises";
import { fetchChecks, runStandard } from "@aipathway/conformance";
${liveImports}import { build } from "./build.mjs";
import { scenarios } from "./scenarios.mjs";

const SLUG = ${lit(slug)};
const origin = process.env.AIPATHWAY_ORIGIN ?? "https://aipathway.com.au";
const env = process.env.AIPATHWAY_ENV === "production" ? "production" : "stub";

const std = await fetchChecks(SLUG, origin);

// Which provider the live step runs on. The stub by default; the hosted
// provider once you switch it, which is the moment the standard says you start
// paying. It is recorded in the manifest so a green run says what it ran on.
const provider =
  process.env.AIPATHWAY_PROVIDER ?? (env === "production" ? (std.provider?.production ?? "own_systems") : (std.provider?.stub ?? "stub"));
${liveBlock}
const envelope = await runStandard(std.checks, scenariosToRun, build, {
  standard: SLUG,
  spec: std.spec,
  // The edition of the standard this run asserts against, so a later run can
  // say the standard moved. Falls back to the envelope schema version only when
  // the site is older than the field.
  specVersion: std.version ?? std.envelope_version,
  environment: env,
});

const SYMBOL = {
  pass: "PASS",
  fail: "FAIL",
  shape_only: "SHAPE",
  with_us: "WITH US",
  evidence_required: "EVIDENCE",
};

let green = 0;
let red = 0;

for (const r of envelope.results) {
  const mark = SYMBOL[r.verdict] ?? r.verdict;
  console.log(\`\${String(r.n).padStart(2)}  \${mark.padEnd(9)} \${r.title}\`);
  if (r.verdict === "fail") {
    red += 1;
    console.log(\`    expected: \${r.expected}\`);
    console.log(\`    actual:   \${r.actual}\`);
  }
  if (r.verdict === "pass") green += 1;
}

const withUs = envelope.results.filter((r) => r.verdict === "with_us");
const evidence = envelope.results.filter((r) => r.verdict === "evidence_required");

console.log(\`\\n\${green} green, \${red} red, \${envelope.results.length} checked.\`);
console.log(\`Standard: \${std.source}  edition \${std.version ?? "(unversioned)"}\`);
console.log(\`Provider: \${provider}\`);

// A verdict without a next action is a verdict an agent will improvise on, and
// the improvisation that costs the most is standing up telephony. So each
// non-green class says what to do, in one line, from the standard's own data.
if (withUs.length > 0) {
  console.log(\`\\nwith_us (\${withUs.length}): \${std.with_us_next ?? "runs on the production provider. Do not build it."}\`);
}
if (evidence.length > 0) {
  console.log(\`\\nevidence_required (\${evidence.length}): not software. Ask the operator the measurement question each one names, attach the answer, do not write code for it.\`);
}

// THE MANIFEST. What ran, against which edition, on which provider, with what
// result per check. This is the artefact to hand over: to the office as the
// record of the build, to us with a failing check id for a fixed price, or to
// the audit instead of a PDF. envelope.json is the full trace beside it.
const manifest = {
  spec: std.spec,
  standard: SLUG,
  edition: std.version ?? null,
  source: std.source,
  ran_at: new Date().toISOString(),
  environment: env,
  provider,
  provider_block: std.provider ?? null,
  tally: { green, red, with_us: withUs.length, evidence_required: evidence.length, total: envelope.results.length },
  checks: envelope.results.map((r) => ({ id: r.checkId, n: r.n, title: r.title, verdict: r.verdict })),
  next: {
    ...(red > 0 ? { fail: "fix the named checks, or send the id for a fixed price" } : {}),
    ...(withUs.length > 0 ? { with_us: std.with_us_next ?? "runs on the production provider" } : {}),
    ...(evidence.length > 0 ? { evidence_required: "attach what proves each one; not a software check" } : {}),
  },
};
await writeFile("manifest.json", JSON.stringify(manifest, null, 2) + "\\n", "utf8");
await writeFile("envelope.json", JSON.stringify(envelope, null, 2) + "\\n", "utf8");
console.log("\\nWrote manifest.json and envelope.json.");

if (red > 0) {
  console.log(
    "\\nA red check is a fixture. It names one check and carries what went in " +
      "and what your build did, which is enough to get a fixed price for that " +
      "step without anybody reconstructing your business.",
  );
}

process.exitCode = red > 0 ? 1 : 0;
`;
}

export function packageJsonFile(slug: string, version: string): string {
  return `${JSON.stringify(
    {
      name: slug.replace(/-build-standard$|-standard$/, "") + "-conformance",
      private: true,
      type: "module",
      scripts: { test: "node run.mjs" },
      dependencies: { "@aipathway/conformance": `^${version}` },
    },
    null,
    2,
  )}\n`;
}

/**
 * The file a coding agent reads first.
 *
 * Named AGENTS.md because that is the convention assistants already look for,
 * and because the reader who ran `init` is very often about to paste this whole
 * folder at one. It says what to do in the order it has to happen, which is the
 * thing prose on a web page cannot do.
 */
export function agentsFile(std: StandardDoc): string {
  return `# Build ${comment(std.standard)}

You are implementing a published build standard. The standard is the
specification; this folder is the harness that proves you met it.

Source: ${comment(std.source)}
Markdown: ${comment(std.markdown)}

## Do this in order

1. Read the standard at the Markdown URL above. It is the whole specification.
2. Implement \`build.mjs\`. It receives the ports and does the job.
3. Fill in \`holds\` in \`scenarios.mjs\`, one per check. Each carries the
   check's own conformance statement, what to inject, and what to assert.
4. Run \`node run.mjs\`. Every check starts red. Go green.

## Await every port call

Write \`await ports.writeJob(...)\`, never \`ports.writeJob(...)\`. A real
write is asynchronous and the stub's is not; awaiting a plain value yields the
value, so one build written this way runs against both. A build that does not
await works on the stub and then silently drops its writes against a real
system.

## Assert on the trace, not on stub memory

\`holds\` should read \`world.calls\`, the recorded port calls. Reaching into
stub-only state such as \`world.jobs\` makes the scenario stub-only: in
production that job lives in the operator's own system. To assert on it there,
read it back through a port, which puts the read in the trace where it belongs.

## The one rule

Everything the build does to the outside world goes through the ports it is
handed. Do not import a vendor SDK, open a socket, or reach for the network.
The runner owns the world the build writes into: a build that goes around the
ports leaves it empty, and the run reports that rather than passing.

## Verdicts, and what each one means

| verdict | meaning | what you do |
|---|---|---|
| \`pass\` | asserted green here | nothing |
| \`fail\` | asserted red here | fix the build, or the assertion |
| \`shape_only\` | shape holds on the stub, truth needs the live provider | re-runs when the provider flips |
| \`with_us\` | cannot be proved here at all | do what the run prints beside it: point the number, enable the insert, or send the check id. Never build it |
| \`evidence_required\` | not a software check | the operator does it, then attaches proof |

## What you cannot build, and should not try

Some checks are \`with_us\`. They need a live provider carrying an Australian
legal obligation that a stub cannot hold: a phone number with AI disclosure,
Do Not Call Register washing, calling hours by state, a record that survives a
dispute. Do not implement those. Do not stand up telephony. The standard names
the production provider for that step, and the run reports \`with_us\` rather
than failing the build for not having one.

Getting every other check green is the finished job.

## If you run Spec Kit

\`specs/<standard>/spec.md\`, \`plan.md\` and \`tasks.md\` and
\`.specify/memory/constitution.md\` are here in the shape Specify expects.
spec.md points at the standard rather than copying it; tasks.md is one task per
check. \`/speckit-implement\` and \`node run.mjs\` converge on the same build.
Load the constitution first.

## The manifest

Every run writes \`manifest.json\`: spec, edition, provider, one verdict per
check, and the next action for anything not green. Hand that over. It is the
record of the build, and the thing to send with a failing check id for a fixed
price.

## When the standard moves

The run prints the edition it asserted against. If the site's edition is newer
than the one in your last manifest, rebuild from the standard; do not patch the
generated board. The spec is the source of truth and this folder is disposable.
`;
}

export function readmeFile(std: StandardDoc, slug: string): string {
  const tally = std.tally;
  return `# ${comment(std.standard)}: conformance harness

Generated by \`npx @aipathway/conformance init ${slug}\`.

    npm install
    node run.mjs

Every check starts red. That is the point: going green is the work, and a green
run means something because a red one was possible.

## The three files

| file | whose | what |
|---|---|---|
| \`build.mjs\` | yours | the build. The only file that does the job |
| \`scenarios.mjs\` | yours | one \`holds\` per check. Generated with the check's own words |
| \`run.mjs\` | ours | fetches the checks, runs, prints. No edits needed |

## This standard

${tally.total} checks: ${tally.onStub} provable here on the stub, ${tally.productionOnly} only against the live
provider, ${tally.partial} partial, ${tally.preconditions} preconditions needing evidence rather than code.

The checks are fetched at run time from ${comment(std.source)},
so a correction published there reaches you without a release here.

## The second run

The stub proves the shape. Once the ports are wired to real systems, the same
checks run again and prove the write landed:

    AIPATHWAY_ENV=production node run.mjs

Where the standard names one of our providers, \`ports.office-voice.mjs\` is
the same run against us: \`OFFICE_VOICE_API_KEY=... AIPATHWAY_PROVIDER=<provider> AIPATHWAY_ENV=production node run.mjs\`.
The write-back checks then prove one job, not two, in your real job system through the live insert.

Whether this folder has a \`ports.mjs\` to fill in depends on the standard.
Where it does not, the live port map for that standard is not published yet, and
the stub run is the whole of what can be proved here.

The checks that never go green either way are the step the standard says not to
hand-roll. They report \`with_us\`.

## Handing this to a coding agent

\`AGENTS.md\` in this folder is written for one. Point your assistant at this
directory and it has the standard, the harness and the rule it has to obey.

${comment(std.licence)}
`;
}

/**
 * The file that connects the build to real systems.
 *
 * Written only for standards with a published live port map. Each method is
 * left unimplemented, so the first production run fails naming the exact port
 * that is not wired rather than falling back to a stub and reporting a green
 * that means nothing.
 */
export function portsFile(std: StandardDoc, slug: string): string {
  const map = liveMapFor(slug);
  if (!map) throw new Error(`${slug} has no published live port map`);

  return `/**
 * Your real systems, behind the same ports the stub offered.
 *
 * The stub proved the shape. This proves the write landed. Same checks, same
 * scenarios, same build: the only thing that changes is what is behind the
 * ports, which is the point.
 *
 *   AIPATHWAY_ENV=production node run.mjs
 *
 * EVERY METHOD MAY BE ASYNC. A real write is; the stub's was not. Builds await
 * every port call, which costs nothing against the stub and is what lets one
 * build run in both worlds.
 *
 * A method left out throws when the build calls it, naming the port. That is
 * deliberate. Falling back to the stub for the one system under test would
 * produce a green run that proves less than no run at all.
 *
 * What is NOT here, and will not be: the live number, AI disclosure, Do Not
 * Call washing, calling hours by state, and the record that survives a dispute.
 * Those checks report \`with_us\`. They are the step ${comment(std.standard)}
 * says not to hand-roll.
 */

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").${map}, Function>>} */
export const ports = {
  // Example. Delete it and wire your own.
  //
  // async writeJob(job, intentId) {
  //   const created = await serviceM8.createJob({
  //     phone: job.phone,
  //     address: job.address,
  //     type: job.type,
  //   });
  //   return { id: created.uuid, ...job, open: true, updates: 0 };
  // },
};
`;
}

/**
 * The ports, wired to the hosted provider over its MCP.
 *
 * THE PRODUCTION GATE. The stub proved the shape; ports.mjs proves the
 * builder's own systems; this proves the hosted insert: the same scenarios
 * drive the same build, and the write-back ports call Office Voice over
 * Streamable HTTP with the workspace's key. The call ports (disclose, say,
 * hear, notify, escalate, sendSms) are the live step itself: the insert does
 * them on a real call, not from a test harness, so here they throw with the
 * verdict the check will carry. What CAN be proved from a harness is the
 * write: one job, not two, in the real job system, through the real provider.
 */
export function officeVoicePortsFile(std: StandardDoc, slug: string): string {
  const map = liveMapFor(slug);
  if (!map) throw new Error(`${slug} has no published live port map`);
  const provider = std.provider?.production ?? "office_voice.front_desk";
  return `/**
 * The ports, behind the hosted provider: ${comment(provider)}.
 *
 *   OFFICE_VOICE_API_KEY=ovk_live_... AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=${comment(provider)} node run.mjs
 *
 * This is the second run against US rather than against your own systems.
 * The write-back ports call the Office Voice MCP (find_or_create_job, with
 * the dedupe the standard requires); the call ports throw, because the live
 * call is the step the standard says not to hand-roll and the insert performs
 * it on a real line, not from here. Their checks report \`with_us\`.
 *
 * Env:
 *   OFFICE_VOICE_API_KEY     a key minted at /api/keys with contacts:write
 *   OFFICE_VOICE_MCP_URL     default https://office-voice.com/api/mcp
 *   OFFICE_VOICE_TENANT_ID   only when the key reaches several orgs
 */

const MCP_URL = process.env.OFFICE_VOICE_MCP_URL ?? "https://office-voice.com/api/mcp";
const KEY = process.env.OFFICE_VOICE_API_KEY;
const TENANT = process.env.OFFICE_VOICE_TENANT_ID;

let rpcId = 0;
async function call(tool, args) {
  if (!KEY) throw new Error("OFFICE_VOICE_API_KEY is not set. Mint one at /api/keys with contacts:write.");
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: \`Bearer \${KEY}\` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name: tool, arguments: { ...(TENANT ? { tenant_id: TENANT } : {}), ...args } },
    }),
  });
  if (!res.ok) throw new Error(\`\${tool}: HTTP \${res.status} from \${MCP_URL}\`);
  const body = await res.json();
  if (body.error) throw new Error(\`\${tool}: \${body.error.message}\`);
  const out = body.result?.structuredContent ?? JSON.parse(body.result?.content?.[0]?.text ?? "{}");
  if (body.result?.isError || out?.error) throw new Error(\`\${tool}: \${out?.error ?? "tool error"}\`);
  return out;
}

/** Remembered per run so updateJob, which only has the id, can name the caller. */
const jobs = new Map();

function withUs(port) {
  return () => {
    throw new Error(
      \`\${port}: performed by \${${JSON.stringify(provider)}} on the live call, not from this harness. This check reports with_us.\`,
    );
  };
}

/** @type {Partial<Record<keyof typeof import("@aipathway/conformance").${map}, Function>>} */
export const ports = {
  async findOpenJob(phone) {
    const r = await call("find_or_create_job", { find_only: true, caller_e164: phone });
    if (!r.found) return null;
    const known = jobs.get(r.job_external_id);
    return { id: r.job_external_id, phone, address: known?.address ?? "", type: known?.type ?? "unclassified", open: true, updates: known?.updates ?? 0 };
  },

  async writeJob(job, intentId) {
    const r = await call("find_or_create_job", {
      intent_id: intentId,
      caller_e164: job.phone,
      site_address: job.address,
      description: \`\${job.type} job from after-hours call\`,
      note: \`After-hours call: \${job.type}. Address given: \${job.address}.\`,
    });
    const created = { ...job, id: r.job_external_id, open: true, updates: r.outcome === "job_reused" ? 1 : 0 };
    if (r.outcome === "job_reused") created.duplicateOf = r.job_external_id;
    jobs.set(created.id, created);
    return created;
  },

  async updateJob(id, intentId) {
    const known = jobs.get(id);
    if (!known) throw new Error(\`updateJob: \${id} was not written in this run\`);
    const r = await call("find_or_create_job", {
      intent_id: intentId,
      caller_e164: known.phone,
      site_address: known.address,
      description: \`\${known.type} job from after-hours call\`,
      note: "Second call about the same job.",
    });
    known.updates += 1;
    known.duplicateOf = known.duplicateOf ?? r.job_external_id;
    return known;
  },

  disclose: withUs("disclose"),
  say: withUs("say"),
  hear: withUs("hear"),
  notify: withUs("notify"),
  escalate: withUs("escalate"),
  sendSms: withUs("sendSms"),
};
`;
}

/**
 * The Spec Kit shape. A team running GitHub's Specify keeps one folder per
 * feature with spec.md (what and why), plan.md (how) and tasks.md (the work),
 * and a constitution in .specify/memory. These four files are that folder for
 * a standard, so `/speckit-implement` and `node run.mjs` converge on the same
 * scaffold. spec.md points at the standard rather than copying it: the
 * standard is the source and it moves; tasks.md is one task per check, which
 * is what scenarios.mjs already is in another shape.
 */
export function specKitSpecFile(std: StandardDoc): string {
  const runnable = std.checks.filter((c) => c.assertable !== "production");
  const live = std.checks.filter((c) => c.assertable === "production");
  return `# ${comment(std.spec)}: ${comment(std.standard)}

**Source of truth:** ${comment(std.source)} (edition ${std.version ?? "unversioned"})
**Markdown:** ${comment(std.markdown)}
**Checks as data:** ${comment(std.source)}/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

${comment(std.how_to_read ?? "")}

## Requirements, as the checks the build is held to

${runnable.map((c) => `- **${comment(c.id)}** ${comment(c.title)}. ${comment(c.statement)}`).join("\n")}

## Out of scope for the build, by design

${live.map((c) => `- **${comment(c.id)}** ${comment(c.title)}: runs on the production provider, reports \`with_us\`.`).join("\n") || "- none"}

${std.with_us_next ? `When a check is \`with_us\`: ${comment(std.with_us_next)}` : ""}
`;
}

export function specKitPlanFile(std: StandardDoc, slug: string): string {
  const roles = std.substrate?.requires ?? [];
  return `# Plan: ${comment(std.standard)}

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

${roles.length ? roles.map((r) => `- **${comment(r.role)}** (${comment(r.label)}): ${comment(r.need)}${r.with_us ? " — the live step; never yours" : ""}`).join("\n") : "- read substrate.requires from checks.json"}

## Work out what already fills them

1. Fetch the substrate registry named in checks.json and match \`providers[].detect\` against this repository.
2. Union what matched. That is what you have.
3. Build the difference and nothing else.

## Surface

Start at tier 0: a scheduled email carrying the list. Build a page only when
somebody needs to look at the book mid-day.

## Provider

Stub first (\`node run.mjs\`), your own systems second (\`AIPATHWAY_ENV=production\`),
the hosted provider for the live step (\`AIPATHWAY_PROVIDER=<provider>\`).
Run \`npx @aipathway/conformance show ${slug}\` for the check list.
`;
}

export function specKitTasksFile(std: StandardDoc): string {
  const runnable = std.checks.filter((c) => c.assertable !== "production");
  return `# Tasks: ${comment(std.standard)}

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
\`node run.mjs\` prints PASS beside it. Nothing here is done by editing this file.

${runnable.map((c) => `- [ ] **${comment(c.id)}** ${comment(c.title)}\n  - inject: ${comment(c.stimulus)}\n  - assert: ${comment(c.assertion)}${c.stubLimit ? `\n  - on the stub: ${comment(c.stubLimit)}` : ""}`).join("\n")}

## Not tasks

${std.checks.filter((c) => c.assertable === "production").map((c) => `- ${comment(c.id)} ${comment(c.title)}: \`with_us\`. Do not build it.`).join("\n") || "- none"}
`;
}

export function specKitConstitutionFile(std: StandardDoc): string {
  const b = std.boundary;
  return `# Constitution

Loaded before any work. These are not conservative defaults: they are the
points where an Australian business carries an obligation a machine cannot hold.

## Never

${b?.never.length ? b.never.map((n) => `- ${comment(n)}`).join("\n") : "- read the boundary section of the standard"}

## Stays with a person

${b?.stays_with_person.length ? b.stays_with_person.map((n) => `- ${comment(n)}`).join("\n") : "- read the boundary section of the standard"}

## Always

- Every port call is awaited and goes through the ports handed to the build.
- Assert on the recorded trace, never on stub memory.
- Do not mark the build finished; the pass test does that.
- If the standard's edition moves, rebuild from it.
`;
}

export interface ScaffoldFile {
  name: string;
  contents: string;
}

/** Every file `init` writes, as data. The CLI is the only part that touches disk. */
export function scaffold(
  std: StandardDoc,
  slug: string,
  version: string,
): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { name: "package.json", contents: packageJsonFile(slug, version) },
    // The Spec Kit shape, beside the runnable one. Same standard, two doors.
    { name: `specs/${slug}/spec.md`, contents: specKitSpecFile(std) },
    { name: `specs/${slug}/plan.md`, contents: specKitPlanFile(std, slug) },
    { name: `specs/${slug}/tasks.md`, contents: specKitTasksFile(std) },
    { name: ".specify/memory/constitution.md", contents: specKitConstitutionFile(std) },
    { name: "run.mjs", contents: runFile(std, slug) },
    { name: "build.mjs", contents: buildFile(std, slug) },
    { name: "scenarios.mjs", contents: scenariosFile(std, slug) },
    { name: "AGENTS.md", contents: agentsFile(std) },
    { name: "README.md", contents: readmeFile(std, slug) },
  ];

  // Only where a live port map is published. See LIVE_MAPS.
  if (liveMapFor(slug)) {
    files.splice(4, 0, { name: "ports.mjs", contents: portsFile(std, slug) });
    // The hosted provider's ports, only where the standard names one of ours.
    if (std.provider?.production?.startsWith("office_voice.")) {
      files.splice(5, 0, { name: "ports.office-voice.mjs", contents: officeVoicePortsFile(std, slug) });
    }
  }

  return files;
}

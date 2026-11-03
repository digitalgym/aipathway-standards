#!/usr/bin/env node
/**
 * The Mesh Directory gate.
 *
 *   node mesh/validate.mjs            validate every node, exit 1 on any problem
 *   node mesh/validate.mjs --write    and write mesh/registry.json
 *   node mesh/validate.mjs --now 2026-11-03T00:00:00Z   pin the clock
 *
 * WHY IT EXISTS. A directory of bots that each work alone is a shelf, not a
 * team. What makes a team is the handover: one id from the system of record
 * carried across every hop, each hop woken by a named event, an open exception
 * with a named owner stopping the chain, and a write that only counts when the
 * system of record hands back an id that reads back. This file refuses any
 * node that does not declare those things, and any node whose conformance run
 * is not green.
 *
 * WHAT IT CANNOT DO. It does not run anybody's bot. A Grok Bot runs on xAI,
 * not here, so the evidence is the run the submitter made with
 * `npx @aipathway/conformance` and committed beside the manifest. This checks
 * that evidence is whole, current, consistent with itself and green. A human
 * reviewer reads the rest, and the directory says "self-run" on every node so
 * nobody mistakes one for the other.
 *
 * No dependencies, so a contributor runs it with the Node they already have.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = 86_400_000;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isHttps = (v) => isStr(v) && /^https:\/\/[^\s]+$/.test(v);
const nonEmptyArr = (v) => Array.isArray(v) && v.length > 0;

/** A standard's run names it by its page slug; a node names it by its skill folder. */
export const standardMatches = (skill, slug) => slug === skill || slug === `${skill}-build-standard`;

/** Which standards a node must bring a green run for: its own, plus Cash Seam if it touches the cash path. */
export function requiredEvidence(manifest, vocab) {
  const own = Array.isArray(manifest.standards) ? manifest.standards : [];
  const touchesCash = own.some((s) => vocab.cash_path.includes(s));
  return touchesCash && !own.includes("cash-seam") ? [...own, "cash-seam"] : [...own];
}

/** Every problem with one manifest, in words a contributor can act on. */
export function validateManifest(m, { vocab, standards, folder }) {
  const errs = [];
  const need = (cond, msg) => {
    if (!cond) errs.push(msg);
  };
  if (typeof m === "string") return [m]; // a parse error, carried from loadNodes
  if (!isObj(m)) return ["mesh.json is not a JSON object"];

  need(isStr(m.slug) && SLUG_RE.test(m.slug), "slug must be lower-case words joined by hyphens");
  if (folder !== undefined) need(m.slug === folder, `slug "${m.slug}" must match its folder "${folder}"`);
  need(isStr(m.name), "name is required");
  need(isStr(m.office_task) && m.office_task.length <= 200, "office_task is required: the one office job this bot does, in 200 characters or fewer");

  // The vertical gate. The mesh is for our verticals and B2B office work only.
  const verticalIds = vocab.verticals.map((v) => v.id);
  need(nonEmptyArr(m.verticals), `verticals is required: one or more of ${verticalIds.join(", ")}`);
  for (const v of m.verticals ?? []) need(verticalIds.includes(v), `vertical "${v}" is not one the mesh serves (${verticalIds.join(", ")})`);

  need(nonEmptyArr(m.standards), "standards is required: the aipathway standards this node implements, by skill folder name");
  for (const s of m.standards ?? []) need(standards.includes(s), `standard "${s}" is not in skills/ (known: ${standards.join(", ")})`);

  need(nonEmptyArr(m.systems_of_record) && m.systems_of_record.every(isStr), "systems_of_record is required: the systems that issue the ids this node reads, e.g. [\"ServiceM8\", \"Xero\"]");

  need(isObj(m.links) && (isHttps(m.links.bot) || isHttps(m.links.repo)), "links.bot or links.repo is required, as an https link to the adapted bot");
  need(isObj(m.maintainer) && isStr(m.maintainer.name) && isStr(m.maintainer.github), "maintainer.name and maintainer.github are required");
  need(nonEmptyArr(m.runtime) && m.runtime.every(isStr), "runtime is required, e.g. [\"grok-bot-routine\", \"webhook\"]");

  // Ports. Every hop is woken by a named event and carries the id that event names.
  const events = new Map(vocab.events.map((e) => [e.name, e]));
  need(nonEmptyArr(m.consumes), "consumes is required: the named events that wake this node");
  for (const [i, c] of (m.consumes ?? []).entries()) {
    const ev = events.get(c?.event);
    need(ev, `consumes[${i}].event "${c?.event}" is not a named event in vocabulary.json`);
    need(vocab.wake.includes(c?.wake), `consumes[${i}].wake must be one of ${vocab.wake.join(", ")}`);
    if (c?.event === "schedule.tick") need(c.wake === "schedule", `consumes[${i}]: schedule.tick is woken by a schedule`);
  }
  need(nonEmptyArr(m.emits), "emits is required: every node writes something to the system of record");
  for (const [i, e] of (m.emits ?? []).entries()) {
    const ev = events.get(e?.event);
    need(ev, `emits[${i}].event "${e?.event}" is not a named event in vocabulary.json`);
    if (ev) need(!ev.entry, `emits[${i}]: "${e.event}" is an entry event and comes from the outside world, never from a bot`);
    need(isStr(e?.write), `emits[${i}].write is required: what this node writes to the system of record`);
    need(isStr(e?.readback), `emits[${i}].readback is required: how the external id is read back. A chat confirmation is not a write`);
  }

  need(m.matches_after_intake === "id-only", "matches_after_intake must be \"id-only\": after intake, records are read by id, never by name or phone");

  need(isObj(m.exceptions), "exceptions is required");
  if (isObj(m.exceptions)) {
    need(m.exceptions.halts_on_open === true, "exceptions.halts_on_open must be true: an open exception with a named owner stops the chain");
    need(isStr(m.exceptions.owner_field), "exceptions.owner_field is required: the field on the record that names the person who owns it");
    need(Array.isArray(m.exceptions.raises), "exceptions.raises is required (may be empty): the exception reasons this node raises");
  }

  need(isObj(m.durable_state), "durable_state is required");
  if (isObj(m.durable_state)) {
    need(vocab.durable_state.includes(m.durable_state.writes_to), `durable_state.writes_to must be one of ${vocab.durable_state.join(", ")}`);
    need(nonEmptyArr(m.durable_state.fields), "durable_state.fields is required: the fields this node stamps on the shared record");
  }
  need(vocab.private_memory.includes(m.private_memory), `private_memory must be one of ${vocab.private_memory.join(", ")}: anything the next bot needs lives on the record`);

  // Credit. A port names its original; an original build says so with null.
  need("port_of" in m, "port_of is required: the original public bot this is a port of, or null for an original build");
  if (m.port_of !== null && m.port_of !== undefined) {
    const p = m.port_of;
    need(isObj(p), "port_of must be an object or null");
    if (isObj(p)) {
      need(isStr(p.original_name), "port_of.original_name is required");
      need(isStr(p.original_author), "port_of.original_author is required");
      need(isHttps(p.share_link), "port_of.share_link is required, as the original's https share link");
      need(vocab.licence_or_permission.includes(p.licence_or_permission), `port_of.licence_or_permission must be one of ${vocab.licence_or_permission.join(", ")}`);
    }
  }
  return errs;
}

/** Check one standard's evidence: the manifest.json and envelope.json the harness wrote. */
export function validateEvidence(skill, runManifest, envelope, { now, maxAgeDays }) {
  const errs = [];
  const need = (cond, msg) => {
    if (!cond) errs.push(`${skill}: ${msg}`);
  };
  if (!isObj(runManifest) || !isObj(envelope)) return { errors: [`${skill}: manifest.json and envelope.json are both required`], stale: false };

  need(standardMatches(skill, runManifest.standard), `manifest.json is a run of "${runManifest.standard}", not ${skill}`);
  need(runManifest.standard === envelope.standard, "manifest.json and envelope.json name different standards");
  need(envelope.envelopeVersion === "1.0", `envelope version "${envelope.envelopeVersion}" is not supported`);
  need(isStr(envelope.runId), "envelope.json has no runId");
  need(["stub", "production"].includes(runManifest.environment), "manifest.json must say stub or production");

  const results = Array.isArray(envelope.results) ? envelope.results : [];
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const recomputed = {
    total: results.length,
    pass: count("pass"),
    fail: count("fail"),
    shapeOnly: count("shape_only"),
    withUs: count("with_us"),
    evidenceRequired: count("evidence_required"),
  };
  const s = envelope.summary ?? {};
  need(Object.keys(recomputed).every((k) => s[k] === recomputed[k]), "envelope summary disagrees with its own results; rerun rather than editing the file");
  const t = runManifest.tally ?? {};
  need(t.total === recomputed.total && t.red === recomputed.fail, "manifest.json tally disagrees with envelope.json; commit the pair from one run");
  need(recomputed.total > 0, "the run checked nothing");
  need(recomputed.fail === 0, `${recomputed.fail} check(s) red. Only a green run is listed`);
  need(recomputed.pass > 0, "no check passed; a run of only with_us and evidence_required proves nothing about the build");

  const ran = Date.parse(runManifest.ran_at);
  need(Number.isFinite(ran), "manifest.json ran_at is not a date");
  need(!Number.isFinite(ran) || ran <= now + DAY, "manifest.json ran_at is in the future");
  const stale = Number.isFinite(ran) && now - ran > maxAgeDays * DAY;

  return {
    errors: errs,
    stale,
    summary: {
      standard: skill,
      edition: runManifest.edition ?? null,
      environment: runManifest.environment,
      ran_at: runManifest.ran_at,
      run_id: envelope.runId,
      green: recomputed.pass,
      red: recomputed.fail,
      with_us: recomputed.withUs,
      evidence_required: recomputed.evidenceRequired,
      total: recomputed.total,
    },
  };
}

/** Is this node, or the original it ports, on the removal list? */
export function removalFor(manifest, removals) {
  return removals.find(
    (r) => (r.slug && r.slug === manifest.slug) || (r.share_link && manifest.port_of && r.share_link === manifest.port_of.share_link),
  );
}

/**
 * The whole directory, from parsed inputs. Pure, so the tests drive it without
 * a filesystem. `nodes` is [{ folder, manifest, evidence: { [skill]: { manifest, envelope } } }].
 */
export function buildRegistry({ nodes, vocab, standards, removals, now }) {
  const problems = [];
  const listed = [];
  const slugs = new Set();

  for (const n of nodes) {
    const m = n.manifest;
    const errs = validateManifest(m, { vocab, standards, folder: n.folder });
    if (isObj(m) && slugs.has(m.slug)) errs.push(`slug "${m.slug}" is used twice`);
    if (isObj(m)) slugs.add(m.slug);

    let stale = false;
    const evidence = [];
    if (isObj(m) && Array.isArray(m.standards)) {
      for (const skill of requiredEvidence(m, vocab)) {
        const ev = n.evidence?.[skill];
        if (!ev) {
          errs.push(
            `${skill}: no evidence. Commit evidence/${skill}/manifest.json and envelope.json from a green run` +
              (skill === "cash-seam" ? " (required because this node touches the cash path)" : ""),
          );
          continue;
        }
        const r = validateEvidence(skill, ev.manifest, ev.envelope, { now, maxAgeDays: vocab.evidence_max_age_days });
        errs.push(...r.errors);
        stale ||= r.stale;
        if (r.summary) evidence.push(r.summary);
      }
    }
    if (errs.length) {
      problems.push({ node: n.folder ?? m?.slug ?? "(unnamed)", errors: errs });
      continue;
    }

    const removal = removalFor(m, removals);
    if (removal && removal.scope !== "uncredit") continue; // delisted: gone from the page and the routes

    const port_of =
      removal?.scope === "uncredit"
        ? { credited: false, note: "A port of a public bot whose author asked not to be named here." }
        : m.port_of
          ? { credited: true, ...m.port_of }
          : null;

    listed.push({
      slug: m.slug,
      name: m.name,
      office_task: m.office_task,
      verticals: m.verticals,
      standards: m.standards,
      systems_of_record: m.systems_of_record,
      consumes: m.consumes,
      emits: m.emits,
      exceptions: m.exceptions,
      durable_state: m.durable_state,
      runtime: m.runtime,
      links: m.links,
      maintainer: m.maintainer,
      port_of,
      status: stale ? "stale" : "listed",
      routable: !stale,
      evidence_kind: "self-run",
      evidence,
    });
  }

  listed.sort((a, b) => a.slug.localeCompare(b.slug));
  const routable = listed.filter((n) => n.routable);
  const idOf = new Map(vocab.events.map((e) => [e.name, e.id]));
  const edges = [];
  for (const a of routable) {
    for (const e of a.emits) {
      for (const b of routable) {
        if (b.slug !== a.slug && b.consumes.some((c) => c.event === e.event)) {
          edges.push({ from: a.slug, to: b.slug, event: e.event, id: idOf.get(e.event) });
        }
      }
    }
  }

  return {
    problems,
    registry: {
      registry_version: "1.0",
      vocabulary_version: vocab.version,
      generated_at: new Date(now).toISOString(),
      contract:
        "One id from the system of record on every hop. Each hop woken by a named event. Read by id, never by name or phone after intake. An open exception with a named owner stops the chain. A write counts only when the system of record returns an id that reads back. Durable state lives on the shared record.",
      nodes: listed,
      routable: routable.map((n) => n.slug),
      edges,
    },
  };
}

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (err) {
    return { __error: `${p}: ${err.message}` };
  }
};

/** Read mesh/nodes/* off disk into the shape buildRegistry takes. */
export function loadNodes(nodesDir) {
  if (!existsSync(nodesDir)) return [];
  return readdirSync(nodesDir)
    .filter((f) => !f.startsWith(".") && statSync(join(nodesDir, f)).isDirectory())
    .map((folder) => {
      const dir = join(nodesDir, folder);
      const manifest = readJson(join(dir, "mesh.json"));
      const evidence = {};
      const evDir = join(dir, "evidence");
      if (existsSync(evDir)) {
        for (const skill of readdirSync(evDir)) {
          if (!statSync(join(evDir, skill)).isDirectory()) continue;
          evidence[skill] = { manifest: readJson(join(evDir, skill, "manifest.json")), envelope: readJson(join(evDir, skill, "envelope.json")) };
        }
      }
      return { folder, manifest: manifest.__error ? manifest.__error : manifest, evidence };
    });
}

function main() {
  const args = process.argv.slice(2);
  const nowArg = args.includes("--now") ? args[args.indexOf("--now") + 1] : undefined;
  const now = nowArg ? Date.parse(nowArg) : Date.now();
  const vocab = JSON.parse(readFileSync(join(HERE, "vocabulary.json"), "utf8"));
  const removals = JSON.parse(readFileSync(join(HERE, "removals.json"), "utf8"));
  // Derived from the folders, never typed: a hand-kept list of standards falls behind.
  const skillsDir = join(HERE, "..", "skills");
  const standards = readdirSync(skillsDir).filter((f) => statSync(join(skillsDir, f)).isDirectory());

  const { problems, registry } = buildRegistry({ nodes: loadNodes(join(HERE, "nodes")), vocab, standards, removals, now });

  for (const p of problems) {
    console.error(`\n${p.node}:`);
    for (const e of p.errors) console.error(`  - ${e}`);
  }
  const stale = registry.nodes.filter((n) => n.status === "stale").length;
  console.log(`\n${registry.nodes.length} node(s) listed, ${registry.routable.length} routable, ${stale} stale, ${registry.edges.length} handover(s), ${problems.length} refused.`);

  if (args.includes("--write")) {
    writeFileSync(join(HERE, "registry.json"), JSON.stringify(registry, null, 2) + "\n", "utf8");
    console.log("Wrote mesh/registry.json.");
  }
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

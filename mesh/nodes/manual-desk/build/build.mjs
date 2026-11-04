/**
 * Manual Desk: the knowledge-base build for the manufacturers' install and
 * service manuals a trade business's techs work from on site.
 *
 * Built to AIP-BS-KNOWLEDGE-BASE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/knowledge-base-build-standard
 *
 * The job, in the owner's words: "when a tech on a job asks a question about
 * the unit in front of them, show them the page of that unit's install or
 * service manual that covers it, and tell them the exact page."
 *
 * THE REGISTER. Every manual, commissioning video, procedure and template on
 * the shared drive goes on one register with a named person against it, a
 * checksum and the revision the manufacturer printed on the cover. A manual is
 * an instrument: issued by somebody else with an edition. The models a manual
 * covers are read off its own first page ("Models: HPW-270, HPW-315"), not off
 * its file name. A team ("Service Team") is never an owner: the file stays off
 * the index and the keeper gets a task. A customer's note saved in a job
 * folder is customer material, restricted, and never indexed.
 *
 * THE SEARCH. A tech's question arrives with the job_id. The unit on that job
 * comes from the job system (`config.jobUnits` by job_id here; the job record
 * in production). Only current manuals whose first page names that model are
 * searched, so an E07 on a heat pump never comes back with the E07 page of a
 * gas unit's manual. What comes back is the passages as printed, each with the
 * register id, the manual's revision and a locator that opens the file at that
 * page (or that second of a video). It composes nothing. When the drive holds
 * no manual for that model, or nothing in it covers the question, the result
 * is empty and the reply is a fixed sentence, not an answer.
 *
 * THE WATCH. Every registered file is re-fetched on the schedule, whether or
 * not anything changed. When a manufacturer's new revision lands on the drive,
 * the new checksum and revision go on the entry, the old checksum is kept as
 * superseded, the owner is told the same run and the new pages are indexed.
 * A manual held only on the manufacturer's portal gets a recheck task to its
 * owner on the same schedule.
 *
 * THE ONE RULE. Everything goes through the ports. Nothing is kept between
 * runs: the register, the index and the task list are the durable state.
 *
 * WHAT IT WILL NOT DO, from the standard's boundary:
 * - occupy an owner, or name a team as one.
 * - set duplicate_of without a person (`config.canonical` names who decided).
 * - decide who reads customer material, or for how long (`config.customerPolicy`).
 * - promote to the graph without a person in promoted_by.
 * - compose an answer, or tell a tech what to do. `composed` is always null.
 * - send anything to a customer. The page list goes to the tech who asked.
 */

export const SOURCE_KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"];

const DAY = 86_400_000;
export const GAP_DUE_DAYS = 7;
export const PROVISIONAL_CUSTOMER_DAYS = 30;
export const LOCATOR_SCHEME = "paged file: <system>:<path>#page=<n>; recording: <system>:<path>#t=<seconds>";
export const NO_MANUAL = "We hold no manual for the unit on this job. Nothing on the register covers it.";
export const NO_PAGE = "Nothing in the manuals we hold for this unit covers that question.";
export const MIN_SCORE = 2;

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

const CUSTOMER_SIGNALS = [
  /\b(customer|client|tenant|homeowner)\b[^.]*\b(mobile|phone|email|address|wrote|said|says|told)\b/i,
  /\b(from|to):\s*\S+@\S+/i,
  /\b04\d{2}\s?\d{3}\s?\d{3}\b/,
];

/** The kind of a source. Content and the keeper's word decide; the folder is only a hint. */
export function classify(file, config = {}) {
  const set = config.kinds?.[file.path];
  if (set && SOURCE_KINDS.includes(set)) return set;
  if (CUSTOMER_SIGNALS.some((re) => re.test(file.content)) || file.hintKind === "customer_material") return "customer_material";
  if (file.editionOnCover) return "instrument";
  if (file.hintKind && SOURCE_KINDS.includes(file.hintKind) && file.hintKind !== "instrument") return file.hintKind;
  return "internal_rule";
}

/** The models a manual covers, read off its own text ("Models: HPW-270, HPW-315"). */
export function modelsOf(content) {
  const m = /\bModels?:\s*([A-Z0-9][A-Z0-9\-, ]*[A-Z0-9])/.exec(content ?? "");
  return m ? m[1].split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) : [];
}

const isPerson = (name, config) => typeof name === "string" && (config.people ?? []).includes(name);
const keeperOf = (config) => (isPerson(config.keeper, config) ? config.keeper : (config.people ?? [])[0]);
export const registerIdFor = (file) => `MD:${file.system}:${file.path}`;

/** Cut a file into passages at its printed pages `[p4]` or its seconds `[t=30]`. */
export function cut(file) {
  const base = `${file.system}:${file.path}`;
  const out = [];
  const re = /\[(p(\d+)|t=(\d+))\]\s*([^[]*)/g;
  let m;
  while ((m = re.exec(file.content))) {
    const text = m[4].trim();
    if (!text) continue;
    out.push({ locator: m[2] ? `${base}#page=${m[2]}` : `${base}#t=${m[3]}`, page: m[2] ? Number(m[2]) : null, seconds: m[3] ? Number(m[3]) : null, text });
  }
  if (out.length === 0 && file.content.trim()) out.push({ locator: `${base}#page=1`, page: 1, seconds: null, text: file.content.trim() });
  return out;
}

async function indexEntry(ports, entry, file) {
  if (entry.status !== "current" || entry.kind === "customer_material") return 0;
  let n = 0;
  for (const p of cut(file)) {
    await ports.indexPassage({ registerId: entry.id, locator: p.locator, text: p.text, scope: "shared" });
    n += 1;
  }
  return n;
}

function decisionFor(paths, config) {
  return (config.canonical ?? []).find(
    (d) => isPerson(d.decidedBy, config) && paths.includes(d.keep) && paths.every((p) => p === d.keep || (d.copies ?? []).includes(p)),
  );
}

/** One run, woken by the schedule or a file landing on the drive: watch, register, raise the gaps. */
export async function build(ports, config = {}) {
  const now = await ports.now();
  const keeper = keeperOf(config);
  const due = isoDate(addDays(now, GAP_DUE_DAYS));
  const drive = await ports.readDrive();
  const register = await ports.readRegister();
  const expected = await ports.readExpected();
  const run = { at: now.toISOString(), watched: 0, changed: [], registered: [], held: [], tasks: [] };
  const task = async (t) => run.tasks.push(await ports.raiseGap(t));

  // 1. THE WATCH. Every registered source re-fetched, changed or not.
  for (const entry of register) {
    if (entry.status === "missing") continue;
    const f = await ports.fetchFile(entry.location.path);
    run.watched += 1;
    if (!f) {
      await ports.writeEntry({ ...entry, status: "missing" });
      await task({ expected: `${entry.title}: gone from ${entry.location.path}`, owner: entry.owner, due });
      continue;
    }
    if (f.checksum === entry.checksum) continue;
    const updated = await ports.writeEntry({
      ...entry,
      checksum: f.checksum,
      edition: f.editionOnCover ?? entry.edition,
      status: entry.status === "duplicate_of" ? "duplicate_of" : "current",
    });
    await ports.notifyOwner(
      entry.owner,
      entry.id,
      `${entry.title} changed on the drive: checksum ${entry.checksum} -> ${f.checksum}` +
        (f.editionOnCover && f.editionOnCover !== entry.edition ? `, revision ${entry.edition ?? "(none)"} -> ${f.editionOnCover}` : "") +
        ". The earlier copy is kept as superseded. Check the new revision is the one techs should be shown.",
    );
    await indexEntry(ports, updated, f);
    run.changed.push({ id: entry.id, from: entry.checksum, to: f.checksum });
  }

  // 1b. Manuals held only on a manufacturer's portal: a recheck task to the owner, every run.
  for (const h of config.issuerHeld ?? []) {
    if (!isPerson(h.owner, config)) continue;
    await task({ expected: `recheck ${h.title} on the manufacturer's portal and confirm the revision we hold`, owner: h.owner, due });
  }

  // 2. INTAKE. Files on the drive not on the register yet.
  const known = new Set(register.map((e) => e.location.path));
  const byChecksum = new Map();
  for (const f of drive.filter((x) => !known.has(x.path))) byChecksum.set(f.checksum, [...(byChecksum.get(f.checksum) ?? []), f]);

  for (const copies of byChecksum.values()) {
    let canonical = copies[0];
    let dups = [];
    if (copies.length > 1) {
      const d = decisionFor(copies.map((c) => c.path), config);
      if (!d) {
        const named = copies.map((c) => config.owners?.[c.path]).find((o) => isPerson(o, config));
        await task({ expected: `pick the copy of ${copies[0].title} to keep: ${copies.map((c) => c.path).join(", ")}`, owner: named ?? keeper, due });
        run.held.push(...copies.map((c) => c.path));
        continue;
      }
      canonical = copies.find((c) => c.path === d.keep);
      dups = copies.filter((c) => c !== canonical);
    }

    const owner = config.owners?.[canonical.path] ?? null;
    if (!isPerson(owner, config)) {
      await task({ expected: `a named person to own ${canonical.title} (${canonical.path})${owner ? `; "${owner}" is not a person` : ""}`, owner: keeper, due });
      run.held.push(canonical.path, ...dups.map((c) => c.path));
      continue;
    }

    const kind = classify(canonical, config);
    const entry = {
      id: registerIdFor(canonical),
      title: canonical.title,
      kind,
      owner,
      location: { system: canonical.system, path: canonical.path },
      ...(canonical.editionOnCover ? { edition: canonical.editionOnCover } : {}),
      checksum: canonical.checksum,
      status: "current",
    };
    if (kind === "customer_material") {
      const pol = config.customerPolicy;
      if (pol && isPerson(pol.setBy, config) && (pol.accessList ?? []).length > 0 && pol.retainDays > 0) {
        entry.accessList = [...pol.accessList];
        entry.expiresOn = isoDate(addDays(now, pol.retainDays));
      } else {
        entry.accessList = [owner];
        entry.expiresOn = isoDate(addDays(now, PROVISIONAL_CUSTOMER_DAYS));
        await task({ expected: `who may read ${canonical.title}, and for how long`, owner: keeper, due });
      }
    }
    const written = await ports.writeEntry(entry);
    run.registered.push(written.id);
    for (const d of dups) {
      await ports.writeEntry({ ...entry, id: registerIdFor(d), title: d.title, location: { system: d.system, path: d.path }, status: "duplicate_of", duplicateOf: written.id });
      run.registered.push(registerIdFor(d));
    }
    await indexEntry(ports, written, canonical);
  }

  // 3. GAPS. Every manual the office expects ("Title | Revision"), held at that revision, or a task with a date.
  const after = await ports.readRegister();
  for (const want of expected) {
    const [title, edition] = want.split(" | ").map((s) => s.trim());
    const held = after.some((x) => x.status === "current" && x.title === title && (!edition || x.edition === edition));
    if (held) continue;
    const prior = after.find((e) => e.title === title);
    const named = config.expectedOwners?.[title];
    await task({ expected: want, owner: prior && isPerson(prior.owner, config) ? prior.owner : isPerson(named, config) ? named : keeper, due });
  }
  return run;
}

const STOP = new Set([
  "the", "a", "an", "of", "on", "to", "for", "and", "or", "in", "is", "it", "at", "how", "do", "does", "did", "we", "i", "my", "what",
  "when", "where", "which", "was", "this", "that", "unit", "page", "manual", "say", "says", "with", "need", "should", "be", "can",
]);
const words = (s) => (String(s ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1);
const isCode = (w) => /^[a-z]{1,2}\d{1,3}$/.test(w);

/**
 * A tech's question on a job. Returns the passages of that job's unit's
 * manuals that cover it, as printed, each with register id, revision, page and
 * locator. Composes nothing. Empty with a fixed reply when there is no manual
 * for the unit, or nothing in it covers the question.
 */
export async function search(ports, query, { jobId, limit = 4 } = {}, config = {}) {
  const model = config.jobUnits?.[jobId] ?? null;
  const terms = [...new Set(words(query).filter((t) => !STOP.has(t)))];
  const register = await ports.readRegister();
  const hits = [];
  let manualsForUnit = 0;
  for (const e of model ? register : []) {
    if (e.status !== "current" || e.kind !== "instrument") continue;
    const f = await ports.fetchFile(e.location.path);
    if (!f || f.checksum !== e.checksum) continue; // moved since registered: the watch re-gates it first
    if (!modelsOf(f.content).includes(model)) continue;
    manualsForUnit += 1;
    for (const p of cut(f)) {
      const have = new Set(words(p.text));
      const shared = terms.filter((t) => have.has(t));
      const score = shared.length + shared.filter(isCode).length * MIN_SCORE;
      if (score >= MIN_SCORE) {
        hits.push({ score, passageId: `${e.id}@${p.locator}`, registerId: e.id, jobId, model, edition: e.edition ?? null, page: p.page, seconds: p.seconds, locator: p.locator, text: p.text });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const passages = hits.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  const result = await ports.search(query, { passages, composed: null });
  const reply = passages.length > 0 ? null : manualsForUnit === 0 ? NO_MANUAL : NO_PAGE;
  return { ...result, jobId, model, reply };
}

/**
 * The page sheet for a job: the questions asked on it and the register ids and
 * locators that came back, nothing composed. Pure: in production the drive
 * adapter writes it as one Doc into Jobs/<job_id>/ and reads the file id back
 * as the report_id (report.published).
 */
export function pageSheet(jobId, results) {
  const lines = results
    .filter((r) => r && r.jobId === jobId)
    .flatMap((r) => (r.passages.length ? r.passages.map((p) => `${p.registerId} | ${p.edition ?? "-"} | ${p.locator}`) : [`(none) | ${r.reply}`]));
  return { path: `Jobs/${jobId}/manual-pages.txt`, jobId, lines };
}

/** Hand a register entry to the knowledge graph. A person promotes; the build only carries the entry. */
export async function promote(ports, registerId, promotedBy, config = {}) {
  const refuse = async (reason, detail) => {
    await ports.escalate(reason, detail);
    return { promoted: false, reason };
  };
  if (!isPerson(promotedBy, config)) return refuse("promotion_without_person", `${registerId}: promoted_by must be a named person`);
  const entry = (await ports.readRegister()).find((e) => e.id === registerId);
  if (!entry) return refuse("promotion_not_on_register", `${registerId} is not on the register`);
  if (entry.status !== "current" || entry.kind === "customer_material") return refuse("promotion_not_current", `${registerId} is ${entry.status}, kind ${entry.kind}`);
  if (entry.kind === "instrument" && !entry.edition) return refuse("promotion_no_edition", `${registerId} has no revision`);
  const f = await ports.fetchFile(entry.location.path);
  if (!f || f.checksum !== entry.checksum) return refuse("promotion_checksum_moved", `${registerId}: the drive copy no longer matches the register`);
  const now = await ports.now();
  await ports.promoteToGraph({ registerId: entry.id, edition: entry.edition, checksum: entry.checksum, locatorScheme: LOCATOR_SCHEME, promotedBy, promotedOn: now.toISOString() });
  return { promoted: true };
}

build.search = search;
build.promote = promote;
build.pageSheet = pageSheet;

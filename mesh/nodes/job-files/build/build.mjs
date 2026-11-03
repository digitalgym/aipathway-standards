/**
 * Job Files: the knowledge-base build for a building company's shared drive.
 *
 * Built to AIP-BS-KNOWLEDGE-BASE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/knowledge-base-build-standard
 *
 * The job, in the office's words: "when someone asks where the building
 * approval for job J-1042 is, or what the plumbing inspection said, we get the
 * exact page of the exact file, and we know it is the current one." So every
 * permit, approval, inspection certificate, procedure, template, rate sheet
 * and code on the drive goes on one register with a named person against it,
 * a checksum and the edition the issuer printed. Only then are its pages
 * indexed, each with a locator that opens the file at that page or second.
 * Search returns those pages, scoped to one job when asked, and never writes
 * a paragraph of its own. A scheduled watch re-fetches every registered file,
 * catches an amended approval by its checksum and tells the owner the same run.
 *
 * JOB FOLDERS. The job system (ServiceM8, Simpro, Tradify, Fergus) issues the
 * job_id, and each job has one folder on the drive named by it:
 * `Jobs/<job_id>/...`. A file's job is read off that folder and nothing else.
 * Nothing here matches a job by a client's name or an address.
 *
 * THE ONE RULE. Everything goes through the ports. Nothing is kept between
 * runs: the register, the index and the task list are the durable state.
 *
 * WHAT IT WILL NOT DO, from the standard's boundary:
 * - occupy an owner. Owners come from the register keeper's owner sheet
 *   (`config.owners` by path, or `config.jobOwners` by job_id for a job's
 *   folder) and must be people in the staff directory (`config.people`). A
 *   team name is refused and becomes a task.
 * - set duplicate_of without a person. Two copies with one checksum stay off
 *   the register until a named person picks the canonical copy
 *   (`config.canonical`).
 * - decide who reads customer material, or for how long. That is
 *   `config.customerPolicy`, set by a named person. Without it the file is held
 *   restricted to its owner on a short provisional expiry and a task asks the
 *   keeper to decide.
 * - promote to the graph without a person in promoted_by.
 * - compose an answer. `composed` is always null. Answering from these files
 *   is the Cited Answer standard, over the graph this register feeds.
 */

export const SOURCE_KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"];

const DAY = 86_400_000;
export const GAP_DUE_DAYS = 10;
/** Provisional hold on customer material until a person sets the policy. */
export const PROVISIONAL_CUSTOMER_DAYS = 30;
export const LOCATOR_SCHEME = "paged file: <system>:<path>#page=<n>; recording: <system>:<path>#t=<seconds>";

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

/** The job a file belongs to, read off its folder. Null for company-wide files. */
export function jobIdOf(path) {
  const m = /^Jobs\/([^/]+)\//.exec(path ?? "");
  return m ? m[1] : null;
}

// Signals that a file is about a person: a homeowner's email, a neighbour's
// complaint, a client's contact details. Any one makes it customer material,
// whatever folder it sits in. Erring this way costs a task; the other way
// leaks a homeowner's details into everyone's search.
const CUSTOMER_SIGNALS = [
  /\b(home ?owner|client|customer|neighbour)\b[^.]*\b(mobile|phone|email|address|wrote|said|says|told)\b/i,
  /\b(from|to):\s*\S+@\S+/i,
  /\btranscript\b/i,
  /\bdate of birth\b/i,
];

/** The kind of a source. Content and the keeper's word decide; the folder is a hint, and hints are wrong. */
export function classify(file, config = {}) {
  const set = config.kinds?.[file.path];
  if (set && SOURCE_KINDS.includes(set)) return set;
  if (CUSTOMER_SIGNALS.some((re) => re.test(file.content)) || file.hintKind === "customer_material") return "customer_material";
  if (file.editionOnCover) return "instrument";
  if (file.hintKind && SOURCE_KINDS.includes(file.hintKind) && file.hintKind !== "instrument") return file.hintKind;
  return "internal_rule";
}

const isPerson = (name, config) => typeof name === "string" && (config.people ?? []).includes(name);
const keeperOf = (config) => (isPerson(config.keeper, config) ? config.keeper : (config.people ?? [])[0]);

/** Who the owner sheet names for a file: by path first, then the job's supervisor. */
const ownerNamed = (path, config) => config.owners?.[path] ?? config.jobOwners?.[jobIdOf(path)] ?? null;

/** A stable register id from where the file lives. The drive's own file id, when wired to a real drive. */
export const registerIdFor = (file) => `JF:${file.system}:${file.path}`;

/**
 * Cut a file into passages, each with a locator a person can open. Pages are
 * marked `[p1]`, `[p2]` in the extracted text; recordings `[t=65]` (seconds)
 * or `[00:01:05]`. Text with no marks is one passage at page 1.
 */
export function cut(file) {
  const base = `${file.system}:${file.path}`;
  const out = [];
  const re = /\[(p(\d+)|t=(\d+)|(\d{2}):(\d{2}):(\d{2}))\]\s*([^[]*)/g;
  let m;
  while ((m = re.exec(file.content))) {
    const text = m[7].trim();
    if (!text) continue;
    if (m[2]) out.push({ locator: `${base}#page=${m[2]}`, text });
    else if (m[3]) out.push({ locator: `${base}#t=${m[3]}`, text });
    else out.push({ locator: `${base}#t=${Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6])}`, text });
  }
  if (out.length === 0 && file.content.trim()) out.push({ locator: `${base}#page=1`, text: file.content.trim() });
  return out;
}

/** Only a current, canonical, non-customer entry reaches the shared index. */
async function indexEntry(ports, entry, file) {
  if (entry.status !== "current" || entry.kind === "customer_material") return 0;
  let n = 0;
  for (const p of cut(file)) {
    await ports.indexPassage({ registerId: entry.id, locator: p.locator, text: p.text, scope: "shared" });
    n += 1;
  }
  return n;
}

/** The canonical decision a named person made for a set of copies, if any. */
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

  // 1. THE WATCH. Every registered source re-fetched, whether or not anything
  // changed. A moved checksum: the new checksum and edition on the entry (the
  // old checksum kept as superseded), the owner told this run, and the new
  // edition's pages indexed.
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
    const job = jobIdOf(entry.location.path);
    await ports.notifyOwner(
      entry.owner,
      entry.id,
      `${entry.title}${job ? ` (job ${job})` : ""} changed on the drive: checksum ${entry.checksum} -> ${f.checksum}` +
        (f.editionOnCover && f.editionOnCover !== entry.edition ? `, edition ${entry.edition ?? "(none)"} -> ${f.editionOnCover}` : "") +
        `. The previous copy is kept as superseded. Check it is the one the site should be working from.`,
    );
    await indexEntry(ports, updated, f);
    run.changed.push({ id: entry.id, from: entry.checksum, to: f.checksum });
  }

  // 2. INTAKE. Files on the drive that are not on the register yet.
  const known = new Set(register.map((e) => e.location.path));
  const byChecksum = new Map();
  for (const f of drive.filter((x) => !known.has(x.path))) byChecksum.set(f.checksum, [...(byChecksum.get(f.checksum) ?? []), f]);

  for (const copies of byChecksum.values()) {
    let canonical = copies[0];
    let dups = [];
    if (copies.length > 1) {
      const d = decisionFor(copies.map((c) => c.path), config);
      if (!d) {
        const named = ownerNamed(copies[0].path, config);
        await task({ expected: `pick the copy of ${copies[0].title} the office works from: ${copies.map((c) => c.path).join(", ")}`, owner: isPerson(named, config) ? named : keeper, due });
        run.held.push(...copies.map((c) => c.path));
        continue;
      }
      canonical = copies.find((c) => c.path === d.keep);
      dups = copies.filter((c) => c !== canonical);
    }

    const owner = ownerNamed(canonical.path, config);
    if (!isPerson(owner, config)) {
      // A team, or nobody. It stays a file on the drive, not indexed, and the
      // keeper is asked to name a person.
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
    if (kind === "instrument" && !canonical.editionOnCover) {
      await task({ expected: `the edition of ${canonical.title}: none printed on it, so it cannot go to the graph`, owner, due });
    }
    const written = await ports.writeEntry(entry);
    run.registered.push(written.id);
    for (const d of dups) {
      await ports.writeEntry({
        ...entry,
        id: registerIdFor(d),
        title: d.title,
        location: { system: d.system, path: d.path },
        status: "duplicate_of",
        duplicateOf: written.id,
      });
      run.registered.push(registerIdFor(d));
    }
    await indexEntry(ports, written, canonical);
  }

  // 3. GAPS. Every source the office expects ("Title | Edition"), held at that
  // edition on the register or the drive, or a task for a person.
  const after = await ports.readRegister();
  for (const want of expected) {
    const [title, edition] = want.split(" | ").map((s) => s.trim());
    const held = [...after.filter((e) => e.status === "current"), ...drive].some(
      (x) => x.title === title && (!edition || (x.edition ?? x.editionOnCover) === edition),
    );
    if (held) continue;
    const prior = after.find((e) => e.title === title);
    const named = ownerNamed(prior?.location.path, config);
    await task({ expected: want, owner: prior && isPerson(prior.owner, config) ? prior.owner : isPerson(named, config) ? named : keeper, due });
  }
  return run;
}

const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const STOP = new Set(["the", "a", "an", "of", "on", "to", "for", "and", "or", "in", "is", "how", "do", "i", "what", "where", "which", "when", "does", "did", "job", "we", "our"]);

/**
 * Find the pages that cover a question, across the company's files or inside
 * one job's folder plus the company-wide files (`{ jobId }`). Returns passages
 * with their register id and locator, exactly as they sit in the file, and
 * composes nothing.
 */
export async function search(ports, query, { jobId = null, limit = 5 } = {}) {
  const terms = words(query).filter((w) => !STOP.has(w));
  const register = await ports.readRegister();
  const hits = [];
  for (const e of register) {
    if (e.status !== "current" || e.kind === "customer_material") continue;
    const job = jobIdOf(e.location.path);
    if (jobId && job && job !== jobId) continue;
    const f = await ports.fetchFile(e.location.path);
    if (!f || f.checksum !== e.checksum) continue; // moved since registered: the watch re-gates it first
    for (const p of cut(f)) {
      const have = new Set(words(p.text));
      const score = terms.filter((t) => have.has(t)).length;
      if (score > 0) hits.push({ score, passageId: `${e.id}@${p.locator}`, registerId: e.id, locator: p.locator, text: p.text });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const passages = hits.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  return ports.search(query, { passages, composed: null });
}

/** Hand a register entry to the knowledge graph. A person promotes; the build only carries the entry. */
export async function promote(ports, registerId, promotedBy, config = {}) {
  const refuse = async (reason, detail, why) => {
    await ports.escalate(reason, detail);
    return { promoted: false, why };
  };
  if (!isPerson(promotedBy, config)) return refuse("promotion_without_person", `${registerId}: promoted_by must be a named person`, "no person in promoted_by");
  const entry = (await ports.readRegister()).find((e) => e.id === registerId);
  if (!entry) return refuse("promotion_not_on_register", `${registerId} is not on the register`, "not on the register");
  if (entry.status !== "current" || entry.kind === "customer_material") return refuse("promotion_not_current", `${registerId} is ${entry.status}, kind ${entry.kind}`, "not a current shareable entry");
  if (entry.kind === "instrument" && !entry.edition) return refuse("promotion_no_edition", `${registerId} has no edition`, "instrument with no edition");
  const f = await ports.fetchFile(entry.location.path);
  if (!f || f.checksum !== entry.checksum) return refuse("promotion_checksum_moved", `${registerId}: the drive copy no longer matches the register; let the watch run first`, "checksum differs from the register");
  const now = await ports.now();
  await ports.promoteToGraph({
    registerId: entry.id,
    edition: entry.edition,
    checksum: entry.checksum,
    locatorScheme: LOCATOR_SCHEME,
    promotedBy,
    promotedOn: now.toISOString(),
  });
  return { promoted: true };
}

/**
 * THE JOB FILE SHEET. One page per job, read off the register: every
 * registered file in that job's folder with its owner, edition and the locator
 * that opens it, plus the company-wide instruments it works under, and the
 * open tasks this run raised for that job. Every line is a register id or a
 * task id; nothing is written from the files' contents. In production it is
 * written as one Doc into `Jobs/<job_id>/` after each run and the drive's file
 * id is read back as the report_id (report.published). The standard's checks
 * do not score the sheet; they score the register it is read off.
 */
export async function jobSheet(ports, jobId, run = { tasks: [] }) {
  const reg = await ports.readRegister();
  const line = (e) => ({ id: e.id, title: e.title, kind: e.kind, owner: e.owner, edition: e.edition ?? null, opens: `${e.location.system}:${e.location.path}#page=1` });
  const inJob = reg.filter((e) => jobIdOf(e.location.path) === jobId);
  return {
    job_id: jobId,
    as_of: run.at ?? null,
    current: inJob.filter((e) => e.status === "current" && e.kind !== "customer_material").map(line),
    restricted: inJob.filter((e) => e.kind === "customer_material").map((e) => ({ id: e.id, owner: e.owner, access: e.accessList ?? [] })),
    superseded: inJob.filter((e) => e.supersededChecksums.length > 0).map((e) => ({ ...line(e), earlier_editions: e.supersededChecksums.length })),
    works_under: reg.filter((e) => !jobIdOf(e.location.path) && e.kind === "instrument" && e.status === "current").map(line),
    open: (run.tasks ?? []).filter((t) => t.expected.includes(`Jobs/${jobId}/`)).map((t) => ({ task: t.id, question: t.expected, owner: t.owner, due: t.due })),
    composed: null,
  };
}

// The runner hands scenarios the build function; the other entry points ride on it.
build.search = search;
build.promote = promote;
build.jobSheet = jobSheet;

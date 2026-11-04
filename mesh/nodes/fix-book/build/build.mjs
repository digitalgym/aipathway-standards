/**
 * Fix Book: the knowledge-base build for the fixes a service business's techs
 * find on site.
 *
 * Built to AIP-BS-KNOWLEDGE-BASE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/knowledge-base-build-standard
 *
 * The job, in the owner's words: "when a tech finds the real fix for a fault,
 * keep it, and when the next tech asks how we fixed that fault before, show
 * them what was written on the job, or tell them we have no record."
 *
 * HOW A FIX GETS IN. When a tech finishes, they send the fix back (a text, an
 * email, a voice memo). `fileNote()` turns that message into one fix note in a
 * fixed shape (fault, cause, fix, parts, tested) and it is saved into the
 * job's folder on the shared drive, `Fixes/<job_id>/`, by the job system's
 * job_id (evidence.filed). Greetings, the customer's name, phone and address
 * are not carried into the note. Then the note is a file on the drive like any
 * other and goes through the register before anything of it is searchable.
 *
 * THE REGISTER. Every fix note, voice memo, service manual, procedure,
 * template and rate sheet on the drive goes on one register with a named
 * person against it, a checksum and the edition the issuer printed. A fix
 * note's owner is the tech the job system names on that job (`config.jobTechs`
 * by job_id); other files take their owner from the service manager's owner
 * sheet (`config.owners`). A team ("Service Team") is never an owner: the file
 * stays off the index and the keeper gets a task.
 *
 * THE SEARCH. A tech's question comes back as the passages that cover it, each
 * with the register id, the job it came from and a locator that opens the note
 * at that section, the memo at that second or the manual at that page. It
 * never writes a paragraph of its own. When nothing covers the question the
 * result is empty and the reply says "no record of this fix", which is a fixed
 * sentence, not an answer. Answering in sentences is the Cited Answer
 * standard, over the graph this register feeds.
 *
 * THE WATCH. Every registered file is re-fetched on the schedule, whether or
 * not anything changed. When a tech amends a fix note (the fix did not hold,
 * the real cause turned up on the callback), the new checksum goes on the
 * entry, the old one is kept as superseded, the owner is told the same run,
 * and the amended note is indexed again.
 *
 * THE ONE RULE. Everything goes through the ports. Nothing is kept between
 * runs: the register, the index and the task list are the durable state.
 *
 * WHAT IT WILL NOT DO, from the standard's boundary:
 * - occupy an owner, or name a team as one.
 * - set duplicate_of without a person. Two copies with one checksum wait for a
 *   named person to pick the copy the office keeps (`config.canonical`).
 * - decide who reads customer material, or for how long. That is
 *   `config.customerPolicy`, set by a named person. Without it the file is held
 *   restricted to its owner on a short provisional expiry and the keeper gets a
 *   task.
 * - promote to the graph without a person in promoted_by.
 * - compose an answer. `composed` is always null.
 * - send anything to a customer. The search reply goes to the tech who asked.
 */

export const SOURCE_KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"];

const DAY = 86_400_000;
export const GAP_DUE_DAYS = 7;
/** Provisional hold on customer material until a person sets the policy. */
export const PROVISIONAL_CUSTOMER_DAYS = 30;
export const LOCATOR_SCHEME =
  "fix note: <system>:<path>#section=<fault|cause|fix|parts|tested>; paged file: <system>:<path>#page=<n>; recording: <system>:<path>#t=<seconds>";
export const NO_RECORD = "No record of this fix on our jobs. Nothing on the register covers it.";
/** A passage must share this many search terms with the question, or carry its fault code. */
export const MIN_SCORE = 2;

const SECTIONS = ["fault", "cause", "fix", "parts", "tested"];
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

/** The job a file belongs to, read off its folder. Null for company-wide files. */
export function jobIdOf(path) {
  const m = /^Fixes\/([^/]+)\//.exec(path ?? "");
  return m ? m[1] : null;
}

// Signals that a file is about a person: a customer's email, phone or address.
// Any one makes it customer material, whatever folder it sits in.
const CUSTOMER_SIGNALS = [
  /\b(customer|client|tenant|owner|homeowner)\b[^.]*\b(mobile|phone|email|address|wrote|said|says|told)\b/i,
  /\b(from|to):\s*\S+@\S+/i,
  /\b04\d{2}\s?\d{3}\s?\d{3}\b/,
  /\btranscript\b/i,
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

/** Who owns a file: the owner sheet by path first, then the tech the job system names on that job. */
const ownerNamed = (path, config) => config.owners?.[path] ?? config.jobTechs?.[jobIdOf(path)] ?? null;

/** A stable register id from where the file lives. The drive's own file id, when wired to a real drive. */
export const registerIdFor = (file) => `FB:${file.system}:${file.path}`;

/**
 * Cut a file into passages, each with a locator a person can open. Fix notes
 * are marked `[fault]`, `[cause]`, `[fix]`, `[parts]`, `[tested]`; paged files
 * `[p1]`; recordings `[t=65]` (seconds). Text with no marks is one passage at
 * page 1.
 */
export function cut(file) {
  const base = `${file.system}:${file.path}`;
  const out = [];
  const re = /\[(p(\d+)|t=(\d+)|(fault|cause|fix|parts|tested))\]\s*([^[]*)/g;
  let m;
  while ((m = re.exec(file.content))) {
    const text = m[5].trim();
    if (!text) continue;
    if (m[2]) out.push({ locator: `${base}#page=${m[2]}`, text });
    else if (m[3]) out.push({ locator: `${base}#t=${m[3]}`, text });
    else out.push({ locator: `${base}#section=${m[4]}`, text });
  }
  if (out.length === 0 && file.content.trim()) out.push({ locator: `${base}#page=1`, text: file.content.trim() });
  return out;
}

/**
 * Turn the tech's message into one fix note for the job's folder. Only the
 * labelled lines are carried ("Fault:", "Cause:", "Fix:", "Parts:",
 * "Tested:"); anything else in the message, the customer's details included,
 * is left behind. Returns the note to save at `Fixes/<job_id>/fix-note.txt`,
 * or `held` with what is missing when the message has no fault or no fix.
 * Pure: in production the drive adapter saves it and reads the file id back.
 */
export function fileNote({ jobId, tech, text }) {
  if (!jobId) return { held: "no job_id on the message; a fix note is filed against a job" };
  const got = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^\s*(fault|cause|fix|parts|tested)\s*[:\-]\s*(.+)$/i.exec(line);
    if (m) got[m[1].toLowerCase()] = m[2].trim();
  }
  if (!got.fault || !got.fix) return { held: `the message from ${tech ?? "the tech"} has no ${!got.fault ? "fault" : "fix"} line` };
  const content = SECTIONS.filter((s) => got[s]).map((s) => `[${s}] ${got[s]}`).join(" ");
  return { path: `Fixes/${jobId}/fix-note.txt`, jobId, tech: tech ?? null, content };
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

  // 1. THE WATCH. Every registered source re-fetched, whether or not anything changed.
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
        ". The earlier copy is kept as superseded. Check the new one is the fix techs should be shown.",
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
        const named = copies.map((c) => ownerNamed(c.path, config)).find((o) => isPerson(o, config));
        await task({ expected: `pick the copy of ${copies[0].title} to keep: ${copies.map((c) => c.path).join(", ")}`, owner: named ?? keeper, due });
        run.held.push(...copies.map((c) => c.path));
        continue;
      }
      canonical = copies.find((c) => c.path === d.keep);
      dups = copies.filter((c) => c !== canonical);
    }

    const owner = ownerNamed(canonical.path, config);
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
  // edition, or a task for a person with a date.
  const after = await ports.readRegister();
  for (const want of expected) {
    const [title, edition] = want.split(" | ").map((s) => s.trim());
    const held = after.some((x) => x.status === "current" && x.title === title && (!edition || x.edition === edition));
    if (held) continue;
    const prior = after.find((e) => e.title === title);
    const named = config.expectedOwners?.[title];
    await task({
      expected: want,
      owner: prior && isPerson(prior.owner, config) ? prior.owner : isPerson(named, config) ? named : keeper,
      due,
    });
  }
  return run;
}

const STOP = new Set([
  "the", "a", "an", "of", "on", "to", "for", "and", "or", "in", "is", "it", "at", "how", "do", "did", "we", "our", "us", "what", "when",
  "where", "which", "was", "were", "fix", "fixed", "fault", "before", "last", "time", "job", "unit", "with", "that", "this", "keeps", "won",
]);
const words = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 1);
const isCode = (w) => /^[a-z]{1,2}\d{1,3}$/.test(w);

/**
 * A tech's question. Returns the passages that cover it, each with its
 * register id, the job it came from and a locator, exactly as they sit in the
 * file, and composes nothing. When nothing covers it, the passages are empty
 * and the reply to the tech is the fixed NO_RECORD sentence.
 */
export async function search(ports, query, { limit = 5 } = {}) {
  const terms = [...new Set(words(query).filter((t) => !STOP.has(t)))];
  const register = await ports.readRegister();
  const hits = [];
  for (const e of register) {
    if (e.status !== "current" || e.kind === "customer_material") continue;
    const f = await ports.fetchFile(e.location.path);
    if (!f || f.checksum !== e.checksum) continue; // moved since registered: the watch re-gates it first
    const parts = cut(f);
    const scored = parts.map((p) => {
      const have = new Set(words(p.text));
      const shared = terms.filter((t) => have.has(t));
      return { p, score: shared.length + shared.filter(isCode).length * MIN_SCORE };
    });
    const best = Math.max(0, ...scored.map((s) => s.score));
    for (const { p, score } of scored) {
      // A tech asking about a fault wants the fix written under it: when a fix
      // note matches, its fix section comes back too, as written, with its own locator.
      const fixOfMatch = best >= MIN_SCORE && p.locator.endsWith("#section=fix");
      if (score >= MIN_SCORE || fixOfMatch) {
        hits.push({ score: fixOfMatch ? Math.max(score, best) + 1 : score, passageId: `${e.id}@${p.locator}`, registerId: e.id, jobId: jobIdOf(e.location.path), locator: p.locator, text: p.text });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const passages = hits.slice(0, limit).map(({ score: _s, ...rest }) => rest);
  const result = await ports.search(query, { passages, composed: null });
  return { ...result, reply: passages.length === 0 ? NO_RECORD : null };
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

// The runner hands scenarios the build function; the other entry points ride on it.
build.search = search;
build.promote = promote;
build.fileNote = fileNote;

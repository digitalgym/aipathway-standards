/**
 * Folder Brief: point it at a messy shared office folder and get a register
 * of what is in it, kept current, and a one-screen brief read off that
 * register: what is current, what is stale, what is still an open question,
 * and what changed since the last run.
 *
 * Built to AIP-BS-KNOWLEDGE-BASE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/knowledge-base-build-standard
 *
 * THE ORDER IS THE JOB. A brief is only worth reading if every line of it
 * points at one source a person owns. So the run goes:
 *   1. watch:   re-fetch every registered source, catch a moved checksum,
 *               keep the old one as superseded, tell the owner this run;
 *   2. intake:  register what is new (a person as owner, checksum, edition,
 *               kind), resolve copies only where a person picked the
 *               canonical one, quarantine anything about a client;
 *   3. index:   cut each current, shareable source into passages with a
 *               locator a person can open (page, section or seconds);
 *   4. gaps:    everything the office expects to hold and does not is a task
 *               for a named person with a due date;
 *   5. brief:   a list read off the register and this run's result. Every
 *               line carries a register id and a location. It is a digest of
 *               the register, never a paragraph composed from the files.
 *
 * THE ONE RULE. Everything goes through the ports. Nothing is kept between
 * runs: the register, the index and the task list are the durable state.
 *
 * WHAT IT WILL NOT DO, from the standard's boundary:
 * - name an owner. Owners come from the office manager's owner sheet
 *   (`config.owners`) and must be in the staff list (`config.people`). A team
 *   is refused and becomes a task for the register keeper.
 * - pick the canonical copy. Copies stay off the register until a named
 *   person decides (`config.canonical`).
 * - decide who reads client material or for how long (`config.customerPolicy`,
 *   set by a named person). Until then it is restricted to its owner on a
 *   short hold and a task asks the keeper.
 * - promote to the graph without a person in promoted_by.
 * - compose an answer. Search returns passages; `composed` is always null.
 */

export const KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"];

const DAY = 86_400_000;
export const TASK_DUE_DAYS = 10;
export const CLIENT_HOLD_DAYS = 30;
export const LOCATOR_SCHEME = "doc: <system>:<path>#page=<n> | #section=<n.n>; recording: <system>:<path>#t=<seconds>";

const ymd = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * DAY);
const isPerson = (name, config) => typeof name === "string" && (config.people ?? []).includes(name);
const keeperOf = (config) => (isPerson(config.keeper, config) ? config.keeper : (config.people ?? [])[0]);

/** The register id. On a real drive this is the document store's own file id. */
export const idFor = (file) => `doc:${file.system}:${file.path}`;

// A file about a client: a saved email, a complaint, contact details. Any one
// makes it customer material, whatever folder it was saved in.
const CLIENT_MARKS = [
  /^\s*(\[[^\]]+\]\s*)?from:\s*\S+@\S+/im,
  /\b(client|customer)('s)?\b[^.]*\b(mobile|phone|email|address|said|complain\w*|dispute\w*)\b/i,
  /\btax file number\b|\bTFN\b/,
  /\bdate of birth\b/i,
];

/** Kind from the keeper's word, then content, then the edition on the cover. The folder is a hint. */
export function kindOf(file, config = {}) {
  const said = config.kinds?.[file.path];
  if (KINDS.includes(said)) return said;
  if (file.hintKind === "customer_material" || CLIENT_MARKS.some((re) => re.test(file.content))) return "customer_material";
  if (file.editionOnCover) return "instrument";
  if (KINDS.includes(file.hintKind) && file.hintKind !== "instrument") return file.hintKind;
  return "internal_rule";
}

/**
 * Passages with locators a person can open. Extracted text marks pages
 * `[p3]`, sections `[s2.1]`, and recordings `[00:04:10]` or `[t=250]`.
 * Unmarked text is one passage at page 1.
 */
export function passagesOf(file) {
  const at = `${file.system}:${file.path}`;
  const out = [];
  const re = /\[(?:p(\d+)|s(\d+(?:\.\d+)*)|t=(\d+)|(\d{2}):(\d{2}):(\d{2}))\]\s*([^[]*)/g;
  for (const m of file.content.matchAll(re)) {
    const text = m[7].trim();
    if (!text) continue;
    if (m[1]) out.push({ locator: `${at}#page=${m[1]}`, text });
    else if (m[2]) out.push({ locator: `${at}#section=${m[2]}`, text });
    else if (m[3]) out.push({ locator: `${at}#t=${m[3]}`, text });
    else out.push({ locator: `${at}#t=${Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6])}`, text });
  }
  if (out.length === 0 && file.content.trim()) out.push({ locator: `${at}#page=1`, text: file.content.trim() });
  return out;
}

async function index(ports, entry, file) {
  if (entry.status !== "current" || entry.kind === "customer_material") return;
  for (const p of passagesOf(file)) await ports.indexPassage({ registerId: entry.id, locator: p.locator, text: p.text, scope: "shared" });
}

const pickFor = (paths, config) =>
  (config.canonical ?? []).find(
    (d) => isPerson(d.decidedBy, config) && paths.includes(d.keep) && paths.every((p) => p === d.keep || (d.copies ?? []).includes(p)),
  );

/** One run, woken by the schedule or a file landing in the folder. Returns this run's result for the brief. */
export async function build(ports, config = {}) {
  const now = await ports.now();
  const keeper = keeperOf(config);
  const due = ymd(plusDays(now, TASK_DUE_DAYS));
  const drive = await ports.readDrive();
  const register = await ports.readRegister();
  const expected = await ports.readExpected();
  const run = { at: now.toISOString(), checked: 0, changed: [], missing: [], registered: [], held: [], tasks: [] };
  const task = async (expectedText, owner) => {
    const g = await ports.raiseGap({ expected: expectedText, owner, due });
    run.tasks.push({ id: g?.id ?? null, expected: expectedText, owner, due });
  };

  // 1. WATCH. Every registered source, every run, changed or not.
  for (const entry of register) {
    if (entry.status === "missing") continue;
    const f = await ports.fetchFile(entry.location.path);
    run.checked += 1;
    if (!f) {
      await ports.writeEntry({ ...entry, status: "missing" });
      await task(`${entry.title} is gone from ${entry.location.path}: find it or retire it`, entry.owner);
      run.missing.push(entry.id);
      continue;
    }
    if (f.checksum === entry.checksum) continue;
    const next = await ports.writeEntry({
      ...entry,
      checksum: f.checksum,
      edition: f.editionOnCover ?? entry.edition,
      status: entry.status === "duplicate_of" ? "duplicate_of" : "current",
    });
    const ed = f.editionOnCover && f.editionOnCover !== entry.edition ? `, edition ${entry.edition ?? "(none)"} to ${f.editionOnCover}` : "";
    await ports.notifyOwner(entry.owner, entry.id, `${entry.title} changed in ${entry.location.path}${ed}. The previous copy is kept as superseded; check this is the one the office should work from.`);
    await index(ports, next, f);
    run.changed.push({ id: entry.id, title: entry.title, from: entry.edition ?? entry.checksum, to: f.editionOnCover ?? f.checksum, owner: entry.owner });
  }

  // 2. INTAKE. Files in the folder that are not on the register, grouped by checksum.
  const known = new Set(register.map((e) => e.location.path));
  const groups = new Map();
  for (const f of drive.filter((x) => !known.has(x.path))) groups.set(f.checksum, [...(groups.get(f.checksum) ?? []), f]);

  for (const copies of groups.values()) {
    let keep = copies[0];
    let others = [];
    if (copies.length > 1) {
      const pick = pickFor(copies.map((c) => c.path), config);
      if (!pick) {
        const owner = isPerson(config.owners?.[copies[0].path], config) ? config.owners[copies[0].path] : keeper;
        await task(`pick the one copy of ${copies[0].title} the office works from: ${copies.map((c) => c.path).join(", ")}`, owner);
        run.held.push(...copies.map((c) => c.path));
        continue;
      }
      keep = copies.find((c) => c.path === pick.keep);
      others = copies.filter((c) => c !== keep);
    }

    const owner = config.owners?.[keep.path];
    if (!isPerson(owner, config)) {
      await task(`name the person who owns ${keep.title} (${keep.path})${owner ? `; "${owner}" is a team, not a person` : ""}`, keeper);
      run.held.push(keep.path, ...others.map((c) => c.path));
      continue;
    }

    const kind = kindOf(keep, config);
    const entry = {
      id: idFor(keep),
      title: keep.title,
      kind,
      owner,
      location: { system: keep.system, path: keep.path },
      ...(keep.editionOnCover ? { edition: keep.editionOnCover } : {}),
      checksum: keep.checksum,
      status: "current",
    };
    if (kind === "customer_material") {
      const pol = config.customerPolicy;
      if (pol && isPerson(pol.setBy, config) && (pol.accessList ?? []).length > 0) {
        entry.accessList = [...pol.accessList];
        entry.expiresOn = ymd(plusDays(now, pol.retainDays));
      } else {
        entry.accessList = [owner];
        entry.expiresOn = ymd(plusDays(now, CLIENT_HOLD_DAYS));
        await task(`decide who may read ${keep.title}, and for how long`, keeper);
      }
    }
    if (kind === "instrument" && !keep.editionOnCover) await task(`the edition of ${keep.title}: none printed, so it cannot go to the graph`, owner);

    const written = await ports.writeEntry(entry);
    run.registered.push(written.id);
    for (const c of others) {
      await ports.writeEntry({ ...entry, id: idFor(c), title: c.title, location: { system: c.system, path: c.path }, status: "duplicate_of", duplicateOf: written.id });
      run.registered.push(idFor(c));
    }
    await index(ports, written, keep);
  }

  // 3. GAPS. What the office expects ("Title | edition"), held at that edition, or a task.
  const after = await ports.readRegister();
  for (const want of expected) {
    const [title, edition] = want.split(" | ").map((s) => s.trim());
    const held = after.some((e) => e.status === "current" && e.title === title && (!edition || e.edition === edition));
    const heldBack = run.held.length > 0 && drive.some((f) => run.held.includes(f.path) && f.title === title && (!edition || f.editionOnCover === edition));
    if (held || heldBack) continue;
    const prior = after.find((e) => e.title === title);
    await task(want, prior && isPerson(prior.owner, config) ? prior.owner : keeper);
  }
  return run;
}

const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const STOP = new Set(["the", "a", "an", "of", "on", "to", "for", "and", "or", "in", "is", "how", "do", "we", "i", "what", "when", "where", "which", "our"]);

/** Passages that cover a question, with register id and locator, exactly as they sit in the file. Composes nothing. */
export async function search(ports, query, { limit = 5 } = {}) {
  const terms = words(query).filter((w) => !STOP.has(w));
  const hits = [];
  for (const e of await ports.readRegister()) {
    if (e.status !== "current" || e.kind === "customer_material") continue;
    const f = await ports.fetchFile(e.location.path);
    if (!f || f.checksum !== e.checksum) continue; // moved since registered: the watch re-gates it first
    for (const p of passagesOf(f)) {
      const have = new Set(words(p.text));
      const score = terms.filter((t) => have.has(t)).length;
      if (score > 0) hits.push({ score, passageId: `${e.id}@${p.locator}`, registerId: e.id, locator: p.locator, text: p.text });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return ports.search(query, { passages: hits.slice(0, limit).map(({ score: _s, ...r }) => r), composed: null });
}

/** Hand a register entry to the knowledge graph. A person promotes; the build carries the entry. */
export async function promote(ports, registerId, promotedBy, config = {}) {
  const refuse = async (reason, detail, why) => {
    await ports.escalate(reason, detail);
    return { promoted: false, why };
  };
  if (!isPerson(promotedBy, config)) return refuse("promotion_without_person", `${registerId}: promoted_by must be a named person`, "no person");
  const e = (await ports.readRegister()).find((x) => x.id === registerId);
  if (!e) return refuse("promotion_not_on_register", `${registerId} is not on the register`, "not registered");
  if (e.status !== "current" || e.kind === "customer_material") return refuse("promotion_not_current", `${registerId} is ${e.status}, ${e.kind}`, "not current or shareable");
  if (e.kind === "instrument" && !e.edition) return refuse("promotion_no_edition", `${registerId} has no edition`, "no edition");
  const f = await ports.fetchFile(e.location.path);
  if (!f || f.checksum !== e.checksum) return refuse("promotion_checksum_moved", `${registerId}: the file no longer matches the register; let the watch run first`, "checksum moved");
  const now = await ports.now();
  await ports.promoteToGraph({ registerId: e.id, edition: e.edition, checksum: e.checksum, locatorScheme: LOCATOR_SCHEME, promotedBy, promotedOn: now.toISOString() });
  return { promoted: true };
}

/**
 * THE BRIEF. One screen, read off the register and the run that just
 * finished. Every line is a register entry or a task, by id, with where it
 * lives. Nothing in it is written from the files' contents.
 *   current:   current entries, with owner and edition
 *   stale:     superseded editions kept, duplicates pointing at the one copy,
 *              and sources gone missing
 *   open:      the tasks this run raised (owner, gap, client access, copies)
 *   changed:   what the watch caught this run, and what arrived
 * In production it is written as one Doc into the folder it covers and the
 * document id is read back (report.published).
 */
export async function brief(ports, run) {
  const reg = await ports.readRegister();
  const line = (e) => ({ id: e.id, title: e.title, owner: e.owner, edition: e.edition ?? null, at: `${e.location.system}:${e.location.path}` });
  return {
    as_of: run.at,
    current: reg.filter((e) => e.status === "current").map(line),
    stale: [
      ...reg.filter((e) => e.supersededChecksums.length > 0).map((e) => ({ ...line(e), why: `${e.supersededChecksums.length} earlier edition(s) superseded` })),
      ...reg.filter((e) => e.status === "duplicate_of").map((e) => ({ ...line(e), why: `copy of ${e.duplicateOf}` })),
      ...reg.filter((e) => e.status === "missing").map((e) => ({ ...line(e), why: "gone from the folder" })),
    ],
    open: run.tasks.map((t) => ({ task: t.id, question: t.expected, owner: t.owner, due: t.due })),
    changed: [...run.changed.map((c) => ({ ...c, what: "new edition" })), ...run.registered.map((id) => ({ id, what: "registered" }))],
    composed: null,
  };
}

build.search = search;
build.promote = promote;
build.brief = brief;

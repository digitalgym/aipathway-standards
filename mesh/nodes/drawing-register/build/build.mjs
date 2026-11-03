/**
 * Drawing Register: the knowledge-base build for a plant-floor electrical team.
 *
 * Built to AIP-BS-KNOWLEDGE-BASE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/knowledge-base-build-standard
 *
 * The job, in the electrician's words: "when I open a machine drawing on the
 * floor, it is the current revision, somebody owns it, and the page I need
 * opens straight to the sheet." So every drawing, procedure, test sheet and
 * rate card on the shared drive goes on one register with a named person
 * against it, a checksum and the revision printed on the title block. Only then
 * are its pages indexed, each with a locator that opens the PDF at that page
 * (`#page=n`, which any PDF viewer can also zoom). Search returns those pages
 * and never writes a paragraph of its own. A scheduled watch re-fetches every
 * registered file, catches a new revision by its checksum and tells the owner
 * the same run.
 *
 * THE ONE RULE. Everything goes through the ports. Nothing is kept between
 * runs: the register, the index and the task list are the durable state.
 *
 * WHAT IT WILL NOT DO, from the standard's boundary:
 * - occupy an owner. Owners come from the register keeper's owner sheet
 *   (`config.owners`) and must be people in the staff directory
 *   (`config.people`). A team name is refused and becomes a task.
 * - set duplicate_of without a person. Two copies with one checksum stay off
 *   the register until a named person picks the canonical copy
 *   (`config.canonical`).
 * - decide who reads customer material, or for how long. That is
 *   `config.customerPolicy`, set by a named person. Without it the file is
 *   held restricted to its owner on a short provisional expiry and a task asks
 *   the keeper to decide.
 * - promote to the graph without a person in promoted_by.
 * - compose an answer. `composed` is always null.
 */

// The closed list of kinds, from section 2 of the standard.
export const SOURCE_KINDS = ["instrument", "internal_rule", "template", "price_list", "contract", "customer_material"];

const DAY = 86_400_000;
export const GAP_DUE_DAYS = 14;
/** Provisional hold on customer material until a person sets the policy. */
export const PROVISIONAL_CUSTOMER_DAYS = 30;
export const LOCATOR_SCHEME = "pdf-page: <system>:<path>#page=<n>; recording: <system>:<path>#t=<seconds>";

const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);

// Signals that a file is about a person: a client, a site contact, an
// interview. Any one of them makes the file customer material, whatever folder
// it sits in. Erring this way costs a task; erring the other way leaks a file.
const CUSTOMER_SIGNALS = [
  /\binterview\b/i,
  /\btranscript\b/i,
  /\bclient\b.*\b(said|says|told|mobile|phone|email|address)\b/i,
  /\bcustomer\b.*\b(said|says|told|mobile|phone|email|address)\b/i,
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

/** A stable register id from where the file lives. The document store's own id, when wired to a real drive. */
export const registerIdFor = (file) => `KB:${file.system}:${file.path}`;

/**
 * Cut a file into passages, each with a locator a person can open.
 * Pages are marked `[p1]`, `[p2]` in the extracted text; recordings `[t=65]`
 * (seconds) or `[00:01:05]`. Text with no marks is one passage at page 1.
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

async function indexEntry(ports, entry, file) {
  // Only a current, canonical, non-customer entry reaches the shared index.
  if (entry.status !== "current" || entry.kind === "customer_material") return 0;
  let n = 0;
  for (const p of cut(file)) {
    await ports.indexPassage({ registerId: entry.id, locator: p.locator, text: p.text, scope: "shared" });
    n += 1;
  }
  return n;
}

const keeperOf = (config) => (isPerson(config.keeper, config) ? config.keeper : (config.people ?? [])[0]);

/** Find the canonical decision a named person made for a set of copies, if any. */
function decisionFor(paths, config) {
  return (config.canonical ?? []).find(
    (d) => isPerson(d.decidedBy, config) && paths.includes(d.keep) && paths.every((p) => p === d.keep || (d.copies ?? []).includes(p)),
  );
}

/** One scheduled or webhook run: watch what is registered, register what arrived, raise the gaps. */
export async function build(ports, config = {}) {
  const now = await ports.now();
  const keeper = keeperOf(config);
  const due = isoDate(addDays(now, GAP_DUE_DAYS));
  const drive = await ports.readDrive();
  const register = await ports.readRegister();
  const expected = await ports.readExpected();
  const summary = { watched: 0, changed: [], registered: [], held: [], gaps: [] };

  // 1. THE WATCH. Every registered source re-fetched, whether or not anything
  // changed. A moved checksum: new checksum and revision on the entry (the old
  // checksum kept as superseded), the owner told this run, and the new
  // revision's pages indexed in place of the old.
  for (const entry of register) {
    if (entry.status === "missing") continue;
    const f = await ports.fetchFile(entry.location.path);
    summary.watched += 1;
    if (!f) {
      await ports.writeEntry({ ...entry, status: "missing" });
      await ports.raiseGap({ expected: `${entry.title}: gone from ${entry.location.path}`, owner: entry.owner, due });
      summary.gaps.push(entry.id);
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
        `. The previous copy is kept as superseded. Check it is the drawing the floor should be working from.`,
    );
    await indexEntry(ports, updated, f);
    summary.changed.push(entry.id);
  }

  // 2. INTAKE. Files on the drive that are not on the register.
  const known = new Set(register.map((e) => e.location.path));
  const fresh = drive.filter((f) => !known.has(f.path));
  const byChecksum = new Map();
  for (const f of fresh) byChecksum.set(f.checksum, [...(byChecksum.get(f.checksum) ?? []), f]);

  for (const copies of byChecksum.values()) {
    let canonical = copies[0];
    let dups = [];
    let decidedBy = null;
    if (copies.length > 1) {
      const d = decisionFor(copies.map((c) => c.path), config);
      if (!d) {
        const owner = isPerson(config.owners?.[copies[0].path], config) ? config.owners[copies[0].path] : keeper;
        await ports.raiseGap({ expected: `pick the canonical copy of ${copies[0].title}: ${copies.map((c) => c.path).join(", ")}`, owner, due });
        summary.held.push(...copies.map((c) => c.path));
        continue;
      }
      canonical = copies.find((c) => c.path === d.keep);
      dups = copies.filter((c) => c !== canonical);
      decidedBy = d.decidedBy;
    }

    const owner = config.owners?.[canonical.path];
    if (!isPerson(owner, config)) {
      // A team, or nobody. It stays a file on the drive, not indexed, and the
      // keeper is asked to name a person.
      await ports.raiseGap({
        expected: `a named person to own ${canonical.title} (${canonical.path})${owner ? `; "${owner}" is not a person` : ""}`,
        owner: keeper,
        due,
      });
      summary.held.push(canonical.path, ...dups.map((c) => c.path));
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
      if (pol && isPerson(pol.setBy, config) && (pol.accessList ?? []).length > 0) {
        entry.accessList = [...pol.accessList];
        entry.expiresOn = isoDate(addDays(now, pol.retainDays));
      } else {
        entry.accessList = [owner];
        entry.expiresOn = isoDate(addDays(now, PROVISIONAL_CUSTOMER_DAYS));
        await ports.raiseGap({ expected: `who may read ${canonical.title}, and for how long`, owner: keeper, due });
      }
    }
    if (kind === "instrument" && !canonical.editionOnCover) {
      await ports.raiseGap({ expected: `the revision of ${canonical.title}: none on its title block, so it cannot go to the graph`, owner, due });
    }
    const written = await ports.writeEntry(entry);
    summary.registered.push(written.id);
    for (const d of dups) {
      await ports.writeEntry({
        ...entry,
        id: registerIdFor(d),
        title: d.title,
        location: { system: d.system, path: d.path },
        status: "duplicate_of",
        duplicateOf: written.id,
        accessList: entry.accessList,
        expiresOn: entry.expiresOn,
      });
      summary.registered.push(registerIdFor(d));
    }
    void decidedBy;
    await indexEntry(ports, written, canonical);
  }

  // 3. GAPS. Every source the business expects ("Title | Rev D"), present at
  // that revision on the register or the drive, or a task for a person.
  const after = await ports.readRegister();
  for (const want of expected) {
    const [title, edition] = want.split(" | ").map((s) => s.trim());
    const held = [...after.filter((e) => e.status === "current"), ...drive].some(
      (x) => x.title === title && (!edition || (x.edition ?? x.editionOnCover) === edition),
    );
    if (held) continue;
    const prior = after.find((e) => e.title === title);
    await ports.raiseGap({ expected: want, owner: prior && isPerson(prior.owner, config) ? prior.owner : keeper, due });
    summary.gaps.push(want);
  }
  return summary;
}

const words = (s) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const STOP = new Set(["the", "a", "an", "of", "on", "to", "for", "and", "or", "in", "is", "how", "do", "i", "what", "where", "which"]);

/**
 * Find the pages that cover a question. Returns passages with their register
 * id and locator, exactly as they sit in the file, and composes nothing.
 */
export async function search(ports, query, { limit = 5 } = {}) {
  const terms = words(query).filter((w) => !STOP.has(w));
  const register = await ports.readRegister();
  const hits = [];
  for (const e of register) {
    if (e.status !== "current" || e.kind === "customer_material") continue;
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
  if (!isPerson(promotedBy, config)) {
    await ports.escalate("promotion_without_person", `${registerId}: promoted_by must be a named person`);
    return { promoted: false, why: "no person in promoted_by" };
  }
  const entry = (await ports.readRegister()).find((e) => e.id === registerId);
  if (!entry) {
    await ports.escalate("promotion_not_on_register", `${registerId} is not on the register`);
    return { promoted: false, why: "not on the register" };
  }
  if (entry.status !== "current" || entry.kind === "customer_material") {
    await ports.escalate("promotion_not_current", `${registerId} is ${entry.status}, kind ${entry.kind}`);
    return { promoted: false, why: "not a current shareable entry" };
  }
  if (entry.kind === "instrument" && !entry.edition) {
    await ports.escalate("promotion_no_edition", `${registerId} has no revision`);
    return { promoted: false, why: "instrument with no edition" };
  }
  const f = await ports.fetchFile(entry.location.path);
  if (!f || f.checksum !== entry.checksum) {
    await ports.escalate("promotion_checksum_moved", `${registerId}: the drive copy no longer matches the register; let the watch run first`);
    return { promoted: false, why: "checksum differs from the register" };
  }
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

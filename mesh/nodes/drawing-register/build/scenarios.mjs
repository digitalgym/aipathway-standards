/**
 * One scenario per check of knowledge-base-build-standard, for Drawing Register.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-base-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-base-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The drive is a plant-floor electrical team's: machine schematics from the
 * equipment maker with a revision on the title block, the site's isolation
 * procedure, a switchboard test sheet, the call-out rate card, a recorded MCC
 * walkthrough, the Wiring Rules, and a client interview someone saved in the
 * drawings folder.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns true or false.
 */

import { KnowledgeBaseWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-26T00:00:00.000Z");
const DAY = 86_400_000;

export const PEOPLE = ["Priya Nair", "Tom Becker", "Lena Park", "Sam Okafor"];
export const TEAMS = ["Maintenance", "Operations", "Electrical"];

const P = {
  pal: "Drawings/Line 3/palletiser-schematic-revC.pdf",
  palCopy: "Drawings/Line 3/Copy of palletiser schematic.pdf",
  loto: "Procedures/isolation-and-lockout.pdf",
  test: "Forms/switchboard-test-sheet.pdf",
  rates: "Rates/after-hours-call-out-rates.pdf",
  walk: "Recordings/mcc-2-walkthrough.m4a",
  wiring: "Standards/AS-NZS-3000-wiring-rules.pdf",
  client: "Drawings/Line 3/client-interview-breaker-trips.txt",
};

const CK = { pal: "sha256:pal-c", palD: "sha256:pal-d", wiring: "sha256:3000-2018", wiringA3: "sha256:3000-2018-a3" };

const PAL_C =
  "[p1] Palletiser PLC-3 electrical schematic. Title block revision C. " +
  "[p2] Main switch Q1 isolates the palletiser 415 V supply; lock Q1 open before opening the MCC door. " +
  "[p3] Conveyor drive VFD-2 wiring, terminals X1:1 to X1:6. " +
  "[p4] Safety relay K10 and the light curtain circuit.";
const PAL_D = PAL_C.replace("revision C", "revision D").replace("terminals X1:1 to X1:6", "terminals X2:1 to X2:8");

export const driveFiles = () => [
  { path: P.pal, system: "drive", title: "Palletiser electrical schematic", content: PAL_C, checksum: CK.pal, editionOnCover: "Rev C", hintKind: "instrument" },
  { path: P.palCopy, system: "drive", title: "Palletiser electrical schematic (copy)", content: PAL_C, checksum: CK.pal, editionOnCover: "Rev C", hintKind: "instrument" },
  { path: P.loto, system: "drive", title: "Isolation and lockout procedure", content: "[p1] Isolate, lock, tag and test for dead before any work on a live board. [p2] Every isolation is recorded on the permit.", checksum: "sha256:loto-4", hintKind: "internal_rule" },
  { path: P.test, system: "drive", title: "Switchboard test sheet", content: "[p1] Insulation resistance, polarity, earth continuity and RCD trip time, one row per circuit.", checksum: "sha256:test-sheet", hintKind: "template" },
  { path: P.rates, system: "drive", title: "After-hours call-out rates", content: "[p1] Call-out after 6 pm: first hour and each half hour after, ex GST.", checksum: "sha256:rates-2026", hintKind: "price_list" },
  { path: P.walk, system: "drive", title: "MCC-2 walkthrough recording", content: "[00:00:05] This is MCC-2, feeding line 3. [00:01:10] The palletiser starter is bucket 4; its main switch is on the left.", checksum: "sha256:walk", hintKind: "internal_rule" },
  { path: P.wiring, system: "drive", title: "AS/NZS 3000 Wiring Rules", content: "[p1] AS/NZS 3000:2018 Wiring Rules. [p2] Section 2.6: RCD protection of final subcircuits.", checksum: CK.wiring, editionOnCover: "2018 Amdt 2", hintKind: "instrument" },
  { path: P.client, system: "drive", title: "Breaker trips: client interview", content: "[p1] Interview transcript with the client's site manager, Jane Citizen, mobile 0400 000 000. She said the breaker trips every night shift.", checksum: "sha256:client", hintKind: "instrument" },
];

export const CONFIG = {
  people: PEOPLE,
  keeper: "Sam Okafor",
  owners: {
    [P.pal]: "Priya Nair",
    [P.palCopy]: "Priya Nair",
    [P.loto]: "Maintenance", // the department, as the drive's sharing shows it
    [P.test]: "Tom Becker",
    [P.rates]: "Lena Park",
    [P.walk]: "Tom Becker",
    [P.wiring]: "Priya Nair",
    [P.client]: "Priya Nair",
  },
  canonical: [{ keep: P.pal, copies: [P.palCopy], decidedBy: "Priya Nair" }],
  customerPolicy: { accessList: ["Priya Nair", "Sam Okafor"], retainDays: 7 * 365, setBy: "Sam Okafor" },
};

const world = (opts = {}) => new KnowledgeBaseWorld({ now: NOW, drive: driveFiles(), ...opts });
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const byPath = (w, path) => w.register.find((e) => e.location?.path === path);
const LOCATOR_RE = /#(page=\d+|t=\d+)$/;
const isDate = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));
const sharedFrom = (w, id) => w.passages.filter((p) => p.registerId === id && p.scope === "shared");

/** Mark where each run starts in the trace, so a check can read one run's calls. */
async function runs(b, w, steps) {
  w.marks = [];
  for (const step of steps) {
    if (typeof step === "function") {
      step(w);
      continue;
    }
    w.marks.push(w.calls.length);
    await b(w.ports(), CONFIG);
    w.advance(DAY);
  }
  w.marks.push(w.calls.length);
}
const slice = (w, i) => w.calls.slice(w.marks[i], w.marks[i + 1]);

export const scenarios = [
  {
    checkId: "register-before-index",
    // 1. A drive of eight files, five kinds, two copies of one schematic.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const idx = calls(w, "index_passage");
      if (idx.length < 5 || w.passages.length !== idx.length) return false;
      const ordered = idx.every((c) => {
        const at = w.calls.indexOf(c);
        const reg = w.calls.findIndex((x) => x.port === "write_register" && x.request.id === c.request.registerId);
        return typeof c.request.registerId === "string" && reg !== -1 && reg < at;
      });
      // The procedure owned by a department is not on the register, so nothing of it is indexed.
      const lotoIndexed = w.passages.some((p) => p.locator?.includes(P.loto));
      return ordered && !lotoIndexed && w.passages.every((p) => w.register.some((e) => e.id === p.registerId));
    },
    describe: (w) => `${w.register.length} entries, ${w.passages.length} passages; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "one-canonical-copy",
    // 2. The schematic saved twice; the electrical supervisor chose the revision-named file.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const same = w.register.filter((e) => e.checksum === CK.pal);
      const canon = same.filter((e) => e.status === "current" && !e.duplicateOf);
      const dups = same.filter((e) => e.status === "duplicate_of");
      if (same.length !== 2 || canon.length !== 1 || dups.length !== 1) return false;
      const okPaths = canon[0].location.path === P.pal && dups[0].location.path === P.palCopy && dups[0].duplicateOf === canon[0].id;
      const currentByChecksum = new Map();
      for (const e of w.register.filter((x) => x.status === "current")) currentByChecksum.set(e.checksum, (currentByChecksum.get(e.checksum) ?? 0) + 1);
      return okPaths && [...currentByChecksum.values()].every((n) => n === 1) && sharedFrom(w, canon[0].id).length > 0 && w.passages.every((p) => p.registerId !== dups[0].id);
    },
    describe: (w) => w.register.filter((e) => e.checksum === CK.pal).map((e) => `${e.id} ${e.status}${e.duplicateOf ? ` -> ${e.duplicateOf}` : ""}`).join("; ") || "no entry for the schematic",
  },
  {
    checkId: "owner-is-a-person",
    // 3. The isolation procedure's only owner on the sharing sheet is "Maintenance".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.register.length < 5) return false;
      const allPeople = w.register.every((e) => PEOPLE.includes(e.owner) && !TEAMS.includes(e.owner));
      const writes = calls(w, "write_register").every((c) => PEOPLE.includes(c.request.owner));
      const lotoOwned = byPath(w, P.loto);
      const askedForOwner = w.gaps.some((g) => g.expected.includes(P.loto) && PEOPLE.includes(g.owner) && isDate(g.due));
      return allPeople && writes && (lotoOwned ? PEOPLE.includes(lotoOwned.owner) : askedForOwner);
    },
    describe: (w) => `owners: ${[...new Set(w.register.map((e) => e.owner))].join(", ") || "none"}; gaps: ${w.gaps.map((g) => `${g.expected} -> ${g.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "edition-and-checksum-on-arrival",
    // 4. The Wiring Rules with an edition on the cover, and the test sheet with none.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const wiring = byPath(w, P.wiring);
      const test = byPath(w, P.test);
      if (!wiring || !test) return false;
      const stamped = [wiring, test].every((e) => isDate(e.retrievedAt) && typeof e.checksum === "string" && e.checksum.length > 0);
      const fromDrive = wiring.checksum === CK.wiring && test.checksum === "sha256:test-sheet";
      return stamped && fromDrive && wiring.edition === "2018 Amdt 2" && w.register.every((e) => typeof e.checksum === "string" && e.checksum.length > 0);
    },
    describe: (w) => [P.wiring, P.test].map((p) => byPath(w, p)).map((e) => (e ? `${e.title}: ${e.checksum} ed ${e.edition ?? "-"} at ${e.retrievedAt}` : "missing")).join("; "),
  },
  {
    checkId: "customer-material-quarantined",
    // 5. A client interview saved in the drawings folder beside the schematic, folder hint "instrument".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const e = byPath(w, P.client);
      if (!e || e.kind !== "customer_material" || !Array.isArray(e.accessList) || e.accessList.length === 0) return false;
      const restricted = e.accessList.every((n) => PEOPLE.includes(n)) && e.accessList.length < PEOPLE.length;
      const leaked = w.passages.some((p) => p.scope === "shared" && (p.registerId === e.id || /Jane Citizen|0400 000 000/.test(p.text)));
      // The schematic in the same folder is still in the shared index.
      const palIndexed = w.passages.some((p) => p.scope === "shared" && p.locator?.includes(P.pal));
      return restricted && !leaked && palIndexed;
    },
    describe: (w) => {
      const e = byPath(w, P.client);
      return e ? `${e.kind}, access ${JSON.stringify(e.accessList)}, ${w.passages.filter((p) => p.registerId === e.id).length} passage(s)` : "not on the register";
    },
  },
  {
    checkId: "locators-are-replayable",
    // 6. Pages cut from the schematic PDF and seconds from the walkthrough recording.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.passages.length === 0) return false;
      const all = w.passages.every((p) => typeof p.registerId === "string" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator));
      const paged = w.passages.some((p) => p.locator?.includes(P.pal) && /#page=4$/.test(p.locator));
      const timed = w.passages.some((p) => p.locator?.includes(P.walk) && /#t=70$/.test(p.locator));
      // The locator opens to text that is really there.
      const real = w.passages.every((p) => {
        const e = w.entry(p.registerId);
        const f = e && w.driveFile(e.location.path);
        return !!f && f.content.includes(p.text);
      });
      return all && paged && timed && real;
    },
    describe: (w) => w.passages.map((p) => p.locator).join(", ") || "no passages",
  },
  {
    checkId: "search-finds-never-answers",
    // 7. "how do I isolate the palletiser main switch", asked of the search.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      await b.search(w.ports(), "how do I isolate the palletiser main switch");
    },
    holds: (w) => {
      const s = w.searches.at(-1);
      if (!s || s.result.composed !== null || s.result.passages.length === 0) return false;
      const each = s.result.passages.every((p) => {
        const e = w.entry(p.registerId);
        const f = e && w.driveFile(e.location.path);
        return !!e && e.status === "current" && e.kind !== "customer_material" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator) && !!f && f.content.includes(p.text);
      });
      const findsQ1 = s.result.passages.some((p) => p.locator === `drive:${P.pal}#page=2`);
      return each && findsQ1;
    },
    describe: (w) => {
      const s = w.searches.at(-1);
      return s ? `${s.result.passages.length} passage(s): ${s.result.passages.map((p) => p.locator).join(", ")}; composed ${JSON.stringify(s.result.composed)}` : "no search";
    },
  },
  {
    checkId: "missing-is-a-gap-with-an-owner",
    // 8. The register expects the palletiser schematic at Rev D; the drive holds Rev C only.
    world: () => world({ expected: ["Palletiser electrical schematic | Rev D", "Switchboard test sheet", "AS/NZS 3000 Wiring Rules | 2018 Amdt 2"] }),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const gap = w.gaps.filter((g) => g.expected.includes("Palletiser electrical schematic") && g.expected.includes("Rev D"));
      const good = gap.length === 1 && PEOPLE.includes(gap[0].owner) && isDate(gap[0].due) && Date.parse(gap[0].due) > NOW.getTime();
      // What is held is not a gap, and every gap has a person and a date.
      const noFalse = !w.gaps.some((g) => g.expected.startsWith("Switchboard test sheet") || g.expected.startsWith("AS/NZS 3000"));
      return good && noFalse && w.gaps.every((g) => PEOPLE.includes(g.owner) && isDate(g.due));
    },
    describe: (w) => w.gaps.map((g) => `${g.expected} -> ${g.owner} by ${g.due}`).join("; ") || "no gaps",
  },
  {
    checkId: "watch-on-a-schedule",
    // 9. Intake, a quiet scheduled run, then the maker's Rev D replaces Rev C on the drive, then the next run.
    world: () => world(),
    drive: (b, w) =>
      runs(b, w, [
        "intake",
        "watch-quiet",
        (x) => x.replaceOnDrive(P.pal, PAL_D, CK.palD, "Rev D"),
        "watch-changed",
      ]),
    holds: (w) => {
      if (!w.marks || w.marks.length !== 4) return false;
      const registered = w.register.map((e) => e.location.path);
      if (registered.length < 5) return false;
      const readsAll = (i) => {
        const fetched = new Set(slice(w, i).filter((c) => c.port === "read_file" && c.request.fetch).map((c) => c.request.fetch));
        return registered.every((p) => fetched.has(p));
      };
      const e = byPath(w, P.pal);
      if (!e) return false;
      const updated = e.checksum === CK.palD && e.edition === "Rev D" && e.supersededChecksums.includes(CK.pal) && e.status === "current";
      const told = slice(w, 2).some((c) => c.port === "notify" && c.request.registerId === e.id && c.request.owner === e.owner && c.request.detail.includes(e.title));
      const quiet = !slice(w, 1).some((c) => c.port === "notify");
      const reindexed = slice(w, 2).some((c) => c.port === "index_passage" && c.request.registerId === e.id);
      return readsAll(1) && readsAll(2) && updated && told && quiet && reindexed;
    },
    describe: (w) => {
      const e = byPath(w, P.pal);
      return `${e ? `${e.checksum} ${e.edition} superseded ${JSON.stringify(e.supersededChecksums)}` : "no entry"}; notifications ${w.notifications.map((n) => `${n.owner}/${n.registerId}`).join(", ") || "none"}`;
    },
  },
  {
    checkId: "retention-follows-kind",
    // 10. The register read back after the Wiring Rules' Amendment 3 lands on the drive.
    world: () => world(),
    drive: (b, w) =>
      runs(b, w, [
        "intake",
        (x) => x.replaceOnDrive(P.wiring, "[p1] AS/NZS 3000:2018 Wiring Rules, Amendment 3. [p2] Section 2.6: RCD protection of final subcircuits.", CK.wiringA3, "2018 Amdt 3"),
        "watch",
      ]),
    holds: (w) => {
      const customer = w.register.filter((e) => e.kind === "customer_material");
      const instruments = w.register.filter((e) => e.kind === "instrument");
      if (customer.length === 0 || instruments.length === 0) return false;
      const custOk = customer.every((e) => Array.isArray(e.accessList) && e.accessList.length > 0 && isDate(e.expiresOn) && Date.parse(e.expiresOn) > NOW.getTime());
      const wiring = byPath(w, P.wiring);
      const kept = !!wiring && wiring.checksum === CK.wiringA3 && wiring.supersededChecksums.includes(CK.wiring) && w.register.filter((e) => e.title === "AS/NZS 3000 Wiring Rules").length === 1;
      return custOk && kept;
    },
    describe: (w) => w.register.map((e) => `${e.kind}:${e.title} exp ${e.expiresOn ?? "-"} sup ${e.supersededChecksums.length}`).join("; "),
  },
  {
    checkId: "handover-carries-the-register",
    // 11. Priya promotes the Wiring Rules; an unregistered file, an unsigned promotion and a moved file are refused.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      const wiring = w.register.find((e) => e.location.path === P.wiring);
      await b.promote(w.ports(), wiring ? wiring.id : "unknown", "Priya Nair", CONFIG);
      await b.promote(w.ports(), "KB:drive:Downloads/someone-elses-schematic.pdf", "Priya Nair", CONFIG);
      const pal = w.register.find((e) => e.location.path === P.pal);
      await b.promote(w.ports(), pal ? pal.id : "unknown", null, CONFIG);
      w.replaceOnDrive(P.pal, PAL_D, CK.palD, "Rev D");
      await b.promote(w.ports(), pal ? pal.id : "unknown", "Priya Nair", CONFIG);
    },
    holds: (w) => {
      const wiring = byPath(w, P.wiring);
      if (!wiring || w.handovers.length !== 1) return false;
      const h = w.handovers[0];
      return (
        h.registerId === wiring.id &&
        h.edition === wiring.edition &&
        h.checksum === wiring.checksum &&
        typeof h.locatorScheme === "string" &&
        h.locatorScheme.length > 0 &&
        h.promotedBy === "Priya Nair"
      );
    },
    describe: (w) => `${w.handovers.length} handover(s): ${w.handovers.map((h) => `${h.registerId} ${h.edition} ${h.checksum} by ${h.promotedBy}`).join("; ") || "none"}`,
  },
  {
    checkId: "survives-the-builder",
    // 12. Evidence, not code: the runner reports it and never scores it.
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: () => "declared in the PR, not scored here",
  },
];

// The pass test runs on the business's real drive with its real owners. On the
// stub the runner reports it with_us and never drives this.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => world(),
    drive: () => {},
    holds: () => false,
    describe: () => "run by hand on the real drive",
  },
];

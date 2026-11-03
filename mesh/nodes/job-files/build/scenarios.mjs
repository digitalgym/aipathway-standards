/**
 * One scenario per check of knowledge-base-build-standard, for Job Files.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-base-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-base-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The drive is a Queensland builder's: a job folder per job_id from the job
 * system, holding the certifier's building approval decision notice (saved
 * twice, once from an email attachment), a plumbing inspection certificate, a
 * recorded pre-start walkthrough and a homeowner's email someone saved in the
 * permits folder; a second job's approval that also talks about lapsing; and
 * the company-wide National Construction Code, site induction procedure,
 * variation form and trade rates.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns true or false.
 */

import { KnowledgeBaseWorld } from "@aipathway/conformance";

const NOW = new Date("2026-09-28T00:00:00.000Z");
const DAY = 86_400_000;

export const PEOPLE = ["Mia Tran", "Ben Hollis", "Kate Lowe", "Raj Patel"];
export const TEAMS = ["Site Operations", "Admin", "Estimating"];

const P = {
  ba: "Jobs/J-1042/Permits/building-approval-decision-notice.pdf",
  baCopy: "Jobs/J-1042/Email attachments/Decision Notice (1).pdf",
  plumb: "Jobs/J-1042/Inspections/plumbing-inspection-certificate.pdf",
  walk: "Jobs/J-1042/Site/prestart-walkthrough.m4a",
  homeowner: "Jobs/J-1042/Permits/homeowner-email-re-setback.txt",
  ba43: "Jobs/J-1043/Permits/building-approval-decision-notice.pdf",
  ncc: "Codes/NCC-2022-Volume-Two.pdf",
  induction: "Procedures/site-induction.pdf",
  variation: "Templates/variation-form.docx",
  rates: "Rates/trade-rates-2026.xlsx",
};

const CK = { ba: "sha256:ba-0417-v1", baV2: "sha256:ba-0417-v2", ncc: "sha256:ncc-2022", nccA1: "sha256:ncc-2022-a1" };

const BA_V1 =
  "[p1] Building approval decision notice BA 2026/0417, version 1, issued by the private building certifier for job J-1042. " +
  "[p2] This approval lapses two years after the decision date unless the building work has substantially started. " +
  "[p3] Mandatory inspection stages: footings, frame and final. Book the frame inspection two business days ahead. " +
  "[p4] Conditions: side setback 1.5 m to the northern boundary; stormwater to the kerb.";
const BA_V2 = BA_V1.replace("version 1", "version 2").replace("side setback 1.5 m", "side setback 1.2 m under the approved siting variation");

export const driveFiles = () => [
  { path: P.ba, system: "drive", title: "J-1042 building approval decision notice", content: BA_V1, checksum: CK.ba, editionOnCover: "BA 2026/0417 v1", hintKind: "instrument" },
  { path: P.baCopy, system: "drive", title: "Decision Notice (1)", content: BA_V1, checksum: CK.ba, editionOnCover: "BA 2026/0417 v1", hintKind: "instrument" },
  { path: P.plumb, system: "drive", title: "J-1042 plumbing inspection certificate", content: "[p1] Plumbing and drainage inspection, sanitary drainage under slab: passed. [p2] Inspector's note: test the stack before lining.", checksum: "sha256:pl-88213", editionOnCover: "Certificate PL-88213", hintKind: "instrument" },
  { path: P.walk, system: "drive", title: "J-1042 pre-start walkthrough", content: "[00:00:04] This is the pre-start at J-1042. [00:01:20] Temporary fencing goes on the northern boundary; the skip sits on the driveway.", checksum: "sha256:walk-1042", hintKind: "internal_rule" },
  { path: P.homeowner, system: "drive", title: "Homeowner email about the setback", content: "[p1] From: alex.sample@example.com. The homeowner, Alex Sample, mobile 0400 000 000, wrote that the neighbour objects to the side setback.", checksum: "sha256:homeowner", hintKind: "instrument" },
  { path: P.ba43, system: "drive", title: "J-1043 building approval decision notice", content: "[p1] Building approval decision notice BA 2026/0502 for job J-1043. [p2] This approval lapses two years after the decision date unless the building work has substantially started.", checksum: "sha256:ba-0502-v1", editionOnCover: "BA 2026/0502 v1", hintKind: "instrument" },
  { path: P.ncc, system: "drive", title: "National Construction Code Volume Two", content: "[p1] National Construction Code 2022, Volume Two: Class 1 and 10 buildings. [p2] Part H2: structure. Footings and slabs to the referenced standard.", checksum: CK.ncc, editionOnCover: "NCC 2022", hintKind: "instrument" },
  { path: P.induction, system: "drive", title: "Site induction procedure", content: "[p1] Every worker signs the site induction before starting. [p2] Show the white card and sign in on the site register.", checksum: "sha256:induction-3", hintKind: "internal_rule" },
  { path: P.variation, system: "drive", title: "Variation form", content: "[p1] Variation to contract: description, price ex GST, GST, signed by the owner before the work starts.", checksum: "sha256:variation", hintKind: "template" },
  { path: P.rates, system: "drive", title: "Trade rates 2026", content: "[p1] Carpenter, plumber, electrician hourly rates ex GST, effective 1 July 2026.", checksum: "sha256:rates-2026", hintKind: "price_list" },
];

export const CONFIG = {
  people: PEOPLE,
  keeper: "Kate Lowe",
  jobOwners: { "J-1042": "Mia Tran", "J-1043": "Ben Hollis" },
  owners: {
    [P.ncc]: "Raj Patel",
    [P.induction]: "Site Operations", // the team the drive's sharing shows, not a person
    [P.variation]: "Kate Lowe",
    [P.rates]: "Raj Patel",
  },
  canonical: [{ keep: P.ba, copies: [P.baCopy], decidedBy: "Mia Tran" }],
  customerPolicy: { accessList: ["Mia Tran", "Kate Lowe"], retainDays: 7 * 365, setBy: "Kate Lowe" },
};

const world = (opts = {}) => new KnowledgeBaseWorld({ now: NOW, drive: driveFiles(), ...opts });
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const byPath = (w, path) => w.register.find((e) => e.location?.path === path);
const LOCATOR_RE = /#(page=\d+|t=\d+)$/;
const isDate = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));
const sharedFrom = (w, id) => w.passages.filter((p) => p.registerId === id && p.scope === "shared");
const fileText = (w, registerId) => {
  const e = w.entry(registerId);
  const f = e && w.driveFile(e.location.path);
  return f ? f.content : null;
};

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
    // 1. Ten files of five kinds across two job folders and the company folders, two copies of one approval.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const idx = calls(w, "index_passage");
      if (idx.length < 6 || w.passages.length !== idx.length) return false;
      const ordered = idx.every((c) => {
        const at = w.calls.indexOf(c);
        const reg = w.calls.findIndex((x) => x.port === "write_register" && x.request.id === c.request.registerId);
        return typeof c.request.registerId === "string" && reg !== -1 && reg < at;
      });
      // The induction owned by a team is not on the register, so nothing of it is indexed.
      const inductionIndexed = w.passages.some((p) => p.locator?.includes(P.induction) || /white card/.test(p.text));
      return ordered && !inductionIndexed && w.passages.every((p) => w.register.some((e) => e.id === p.registerId));
    },
    describe: (w) => `${w.register.length} entries, ${w.passages.length} passages; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "one-canonical-copy",
    // 2. The J-1042 decision notice saved in Permits and again from an email attachment; the supervisor kept the Permits copy.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const same = w.register.filter((e) => e.checksum === CK.ba);
      const canon = same.filter((e) => e.status === "current" && !e.duplicateOf);
      const dups = same.filter((e) => e.status === "duplicate_of");
      if (same.length !== 2 || canon.length !== 1 || dups.length !== 1) return false;
      const okPaths = canon[0].location.path === P.ba && dups[0].location.path === P.baCopy && dups[0].duplicateOf === canon[0].id;
      const perChecksum = new Map();
      for (const e of w.register.filter((x) => x.status === "current")) perChecksum.set(e.checksum, (perChecksum.get(e.checksum) ?? 0) + 1);
      const indexedOnce = sharedFrom(w, canon[0].id).length === 4 && w.passages.every((p) => p.registerId !== dups[0].id && !p.locator?.includes(P.baCopy));
      return okPaths && [...perChecksum.values()].every((n) => n === 1) && indexedOnce;
    },
    describe: (w) => w.register.filter((e) => e.checksum === CK.ba).map((e) => `${e.id} ${e.status}${e.duplicateOf ? ` -> ${e.duplicateOf}` : ""}`).join("; ") || "no entry for the decision notice",
  },
  {
    checkId: "owner-is-a-person",
    // 3. The site induction's only owner on the sharing sheet is "Site Operations".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.register.length < 6) return false;
      const allPeople = w.register.every((e) => PEOPLE.includes(e.owner) && !TEAMS.includes(e.owner));
      const writes = calls(w, "write_register").every((c) => PEOPLE.includes(c.request.owner));
      const ind = byPath(w, P.induction);
      const askedForOwner = w.gaps.some((g) => g.expected.includes(P.induction) && PEOPLE.includes(g.owner) && isDate(g.due));
      // Job files carry the job's supervisor, read off the job folder.
      const jobOwned = byPath(w, P.plumb)?.owner === "Mia Tran" && byPath(w, P.ba43)?.owner === "Ben Hollis";
      return allPeople && writes && jobOwned && (ind ? PEOPLE.includes(ind.owner) : askedForOwner);
    },
    describe: (w) => `owners: ${[...new Set(w.register.map((e) => e.owner))].join(", ") || "none"}; tasks: ${w.gaps.map((g) => `${g.expected} -> ${g.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "edition-and-checksum-on-arrival",
    // 4. The NCC with its edition on the cover, and the variation form with none.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const ncc = byPath(w, P.ncc);
      const form = byPath(w, P.variation);
      const ba = byPath(w, P.ba);
      if (!ncc || !form || !ba) return false;
      const stamped = [ncc, form].every((e) => isDate(e.retrievedAt) && typeof e.checksum === "string" && e.checksum.length > 0);
      const fromDrive = ncc.checksum === CK.ncc && form.checksum === "sha256:variation";
      return stamped && fromDrive && ncc.edition === "NCC 2022" && ba.edition === "BA 2026/0417 v1" && w.register.every((e) => typeof e.checksum === "string" && e.checksum.length > 0);
    },
    describe: (w) => [P.ncc, P.variation, P.ba].map((p) => byPath(w, p)).map((e) => (e ? `${e.title}: ${e.checksum} ed ${e.edition ?? "-"} at ${e.retrievedAt}` : "missing")).join("; "),
  },
  {
    checkId: "customer-material-quarantined",
    // 5. A homeowner's email saved in the J-1042 permits folder beside the decision notice, folder hint "instrument".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const e = byPath(w, P.homeowner);
      if (!e || e.kind !== "customer_material" || !Array.isArray(e.accessList) || e.accessList.length === 0) return false;
      const restricted = e.accessList.every((n) => PEOPLE.includes(n)) && e.accessList.length < PEOPLE.length;
      const leaked = w.passages.some((p) => p.scope === "shared" && (p.registerId === e.id || /Alex Sample|0400 000 000|alex\.sample/.test(p.text)));
      // The decision notice in the same folder is still in the shared index.
      const baIndexed = w.passages.some((p) => p.scope === "shared" && p.locator?.includes(P.ba));
      return restricted && !leaked && baIndexed;
    },
    describe: (w) => {
      const e = byPath(w, P.homeowner);
      return e ? `${e.kind}, access ${JSON.stringify(e.accessList)}, ${w.passages.filter((p) => p.registerId === e.id).length} passage(s)` : "not on the register";
    },
  },
  {
    checkId: "locators-are-replayable",
    // 6. Pages cut from the decision notice and seconds from the pre-start recording.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.passages.length === 0) return false;
      const all = w.passages.every((p) => typeof p.registerId === "string" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator));
      const paged = w.passages.some((p) => p.locator === `drive:${P.ba}#page=4` && p.text.includes("side setback 1.5 m"));
      const timed = w.passages.some((p) => p.locator === `drive:${P.walk}#t=80` && p.text.includes("Temporary fencing"));
      // Each locator opens to text that is really in that file.
      const real = w.passages.every((p) => {
        const t = fileText(w, p.registerId);
        return t !== null && t.includes(p.text) && p.locator.includes(w.entry(p.registerId).location.path);
      });
      return all && paged && timed && real;
    },
    describe: (w) => w.passages.map((p) => p.locator).join(", ") || "no passages",
  },
  {
    checkId: "search-finds-never-answers",
    // 7. "when does the building approval lapse", asked for job J-1042. J-1043's notice says the same words and must not come back.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      await b.search(w.ports(), "when does the building approval lapse", { jobId: "J-1042" });
    },
    holds: (w) => {
      const s = w.searches.at(-1);
      if (!s || s.result.composed !== null || s.result.passages.length === 0) return false;
      const each = s.result.passages.every((p) => {
        const e = w.entry(p.registerId);
        const t = fileText(w, p.registerId);
        return !!e && e.status === "current" && e.kind !== "customer_material" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator) && t !== null && t.includes(p.text);
      });
      const findsLapse = s.result.passages.some((p) => p.locator === `drive:${P.ba}#page=2`);
      const otherJob = s.result.passages.some((p) => p.locator?.includes("Jobs/J-1043/"));
      return each && findsLapse && !otherJob;
    },
    describe: (w) => {
      const s = w.searches.at(-1);
      return s ? `${s.result.passages.length} passage(s): ${s.result.passages.map((p) => p.locator).join(", ")}; composed ${JSON.stringify(s.result.composed)}` : "no search";
    },
  },
  {
    checkId: "missing-is-a-gap-with-an-owner",
    // 8. The office works to NCC 2025 now; the drive holds the 2022 edition only.
    world: () => world({ expected: ["National Construction Code Volume Two | NCC 2025", "Variation form", "J-1042 plumbing inspection certificate | Certificate PL-88213"] }),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const gap = w.gaps.filter((g) => g.expected.includes("National Construction Code") && g.expected.includes("NCC 2025"));
      const good = gap.length === 1 && gap[0].owner === "Raj Patel" && isDate(gap[0].due) && Date.parse(gap[0].due) > NOW.getTime();
      // What is held is not a gap, and every task has a person and a date.
      const noFalse = !w.gaps.some((g) => g.expected.startsWith("Variation form") || g.expected.startsWith("J-1042 plumbing"));
      return good && noFalse && w.gaps.every((g) => PEOPLE.includes(g.owner) && isDate(g.due));
    },
    describe: (w) => w.gaps.map((g) => `${g.expected} -> ${g.owner} by ${g.due}`).join("; ") || "no tasks",
  },
  {
    checkId: "watch-on-a-schedule",
    // 9. Intake, a quiet scheduled run, then the certifier's amended notice (v2) replaces v1 on the drive, then the next run.
    world: () => world(),
    drive: (b, w) =>
      runs(b, w, ["intake", "watch-quiet", (x) => x.replaceOnDrive(P.ba, BA_V2, CK.baV2, "BA 2026/0417 v2"), "watch-changed"]),
    holds: (w) => {
      if (!w.marks || w.marks.length !== 4) return false;
      const registered = w.register.map((e) => e.location.path);
      if (registered.length < 6) return false;
      const readsAll = (i) => {
        const fetched = new Set(slice(w, i).filter((c) => c.port === "read_file" && c.request.fetch).map((c) => c.request.fetch));
        return registered.every((p) => fetched.has(p));
      };
      const e = byPath(w, P.ba);
      if (!e) return false;
      const updated = e.checksum === CK.baV2 && e.edition === "BA 2026/0417 v2" && e.supersededChecksums.includes(CK.ba) && e.status === "current";
      const told = slice(w, 2).some((c) => c.port === "notify" && c.request.registerId === e.id && c.request.owner === "Mia Tran" && c.request.detail.includes(e.title));
      const quiet = !slice(w, 1).some((c) => c.port === "notify");
      const reindexed = slice(w, 2).some((c) => c.port === "index_passage" && c.request.registerId === e.id);
      return readsAll(1) && readsAll(2) && updated && told && quiet && reindexed;
    },
    describe: (w) => {
      const e = byPath(w, P.ba);
      return `${e ? `${e.checksum} ${e.edition} superseded ${JSON.stringify(e.supersededChecksums)}` : "no entry"}; notifications ${w.notifications.map((n) => `${n.owner}/${n.registerId}`).join(", ") || "none"}`;
    },
  },
  {
    checkId: "retention-follows-kind",
    // 10. The register read back after NCC 2022 Amendment 1 lands on the drive.
    world: () => world(),
    drive: (b, w) =>
      runs(b, w, [
        "intake",
        (x) => x.replaceOnDrive(P.ncc, "[p1] National Construction Code 2022, Volume Two, Amendment 1. [p2] Part H2: structure. Footings and slabs to the referenced standard.", CK.nccA1, "NCC 2022 Amdt 1"),
        "watch",
      ]),
    holds: (w) => {
      const customer = w.register.filter((e) => e.kind === "customer_material");
      const instruments = w.register.filter((e) => e.kind === "instrument");
      if (customer.length === 0 || instruments.length < 3) return false;
      const custOk = customer.every((e) => Array.isArray(e.accessList) && e.accessList.length > 0 && isDate(e.expiresOn) && Date.parse(e.expiresOn) > NOW.getTime());
      const ncc = byPath(w, P.ncc);
      const kept = !!ncc && ncc.checksum === CK.nccA1 && ncc.edition === "NCC 2022 Amdt 1" && ncc.supersededChecksums.includes(CK.ncc) && w.register.filter((e) => e.title === "National Construction Code Volume Two").length === 1;
      return custOk && kept;
    },
    describe: (w) => w.register.map((e) => `${e.kind}:${e.title} exp ${e.expiresOn ?? "-"} sup ${e.supersededChecksums.length}`).join("; "),
  },
  {
    checkId: "handover-carries-the-register",
    // 11. Raj promotes the NCC; an unregistered file, an unsigned promotion and a moved file are refused.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      const ncc = w.register.find((e) => e.location.path === P.ncc);
      await b.promote(w.ports(), ncc ? ncc.id : "unknown", "Raj Patel", CONFIG);
      await b.promote(w.ports(), "JF:drive:Downloads/someone-elses-approval.pdf", "Raj Patel", CONFIG);
      const ba = w.register.find((e) => e.location.path === P.ba);
      await b.promote(w.ports(), ba ? ba.id : "unknown", null, CONFIG);
      w.replaceOnDrive(P.ba, BA_V2, CK.baV2, "BA 2026/0417 v2");
      await b.promote(w.ports(), ba ? ba.id : "unknown", "Mia Tran", CONFIG);
    },
    holds: (w) => {
      const ncc = byPath(w, P.ncc);
      if (!ncc || w.handovers.length !== 1) return false;
      const h = w.handovers[0];
      return (
        h.registerId === ncc.id &&
        h.edition === ncc.edition &&
        h.edition === "NCC 2022" &&
        h.checksum === ncc.checksum &&
        typeof h.locatorScheme === "string" &&
        h.locatorScheme.length > 0 &&
        h.promotedBy === "Raj Patel"
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

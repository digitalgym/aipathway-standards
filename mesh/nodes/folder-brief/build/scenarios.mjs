/**
 * One scenario per check of knowledge-base-build-standard, for Folder Brief.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-base-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-base-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The folder is a small Australian bookkeeping office's shared "Office"
 * folder, as messy as they are: the Clerks Award saved from the Fair Work
 * site, a leave policy whose only owner on the sharing sheet is "HR", the
 * fee schedule saved twice, the engagement letter template, the office lease,
 * a recording of the team meeting, and a client's email about a BAS fee
 * someone saved into the notes folder.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns true or false.
 */

import { KnowledgeBaseWorld } from "@aipathway/conformance";

const NOW = new Date("2026-10-26T00:00:00.000Z");
const DAY = 86_400_000;

export const PEOPLE = ["Mei Tan", "Raj Patel", "Olivia Brooks", "Ben Carter"];
export const TEAMS = ["HR", "Admin", "Office"];

const F = {
  award: "Shared/Office/HR/clerks-award-MA000002.pdf",
  leave: "Shared/Office/HR/leave-policy.docx",
  fees: "Shared/Office/Admin/fee-schedule-2026-27.pdf",
  feesCopy: "Shared/Office/Admin/Copy of fee schedule (1).pdf",
  letter: "Shared/Office/Templates/engagement-letter.docx",
  lease: "Shared/Office/Admin/office-lease-level-3.pdf",
  meeting: "Shared/Office/Notes/team-meeting-2026-10-14.m4a",
  email: "Shared/Office/Notes/RE BAS fee query.eml",
};

const CK = { award: "md5:award-2025", award26: "md5:award-2026", fees: "md5:fees-a", feesB: "md5:fees-b" };

const AWARD_25 =
  "[p1] Clerks—Private Sector Award 2020 (MA000002), as at 1 July 2025. " +
  "[p2] Clause 15: minimum weekly rates for each level. " +
  "[p3] Clause 28: overtime after 38 ordinary hours is paid at 150 per cent for the first three hours.";
const AWARD_26 = AWARD_25.replace("as at 1 July 2025", "as at 1 July 2026");
const FEES_A =
  "[p1] Fee schedule 2026-27. All fees ex GST. " +
  "[p2] Quarterly BAS lodgement: $450 per quarter. " +
  "[p3] Annual financial statements and company tax return: from $2,200.";
const FEES_B = FEES_A.replace("$450 per quarter", "$480 per quarter from 1 January 2027");

export const folder = () => [
  { path: F.award, system: "drive", title: "Clerks Award MA000002", content: AWARD_25, checksum: CK.award, editionOnCover: "1 July 2025", hintKind: "instrument" },
  { path: F.leave, system: "drive", title: "Leave policy", content: "[p1] Annual leave is requested two weeks ahead in the leave calendar. [p2] Personal leave over two days needs a certificate.", checksum: "md5:leave-3", hintKind: "internal_rule" },
  { path: F.fees, system: "drive", title: "Fee schedule", content: FEES_A, checksum: CK.fees, hintKind: "price_list" },
  { path: F.feesCopy, system: "drive", title: "Fee schedule (copy)", content: FEES_A, checksum: CK.fees, hintKind: "price_list" },
  { path: F.letter, system: "drive", title: "Engagement letter template", content: "[s1] Scope of the engagement: the services listed in schedule A. [s2] Fees are billed monthly in arrears from the fee schedule.", checksum: "md5:letter", hintKind: "template" },
  { path: F.lease, system: "drive", title: "Office lease, Level 3", content: "[p1] Lease of Level 3, 120 Adelaide Street, Brisbane. [p4] Either party may end the lease on six months written notice.", checksum: "md5:lease", hintKind: "contract" },
  { path: F.meeting, system: "drive", title: "Team meeting 14 October", content: "[00:00:04] Team meeting, 14 October. [00:02:30] Decision: BAS reminders go out on the 21st of the month after quarter end.", checksum: "md5:meeting", hintKind: "internal_rule" },
  { path: F.email, system: "drive", title: "RE: BAS fee query", content: "From: jo.citizen@example.com.au\nHi, our BAS lodgement fee looks higher than the $450 we were quoted. Call me on mobile 0400 000 000. Jo Citizen", checksum: "md5:email", hintKind: "internal_rule" },
];

export const CONFIG = {
  people: PEOPLE,
  keeper: "Olivia Brooks",
  owners: {
    [F.award]: "Raj Patel",
    [F.leave]: "HR", // the team, as the folder's sharing sheet shows it
    [F.fees]: "Mei Tan",
    [F.feesCopy]: "Mei Tan",
    [F.letter]: "Mei Tan",
    [F.lease]: "Olivia Brooks",
    [F.meeting]: "Ben Carter",
    [F.email]: "Mei Tan",
  },
  canonical: [{ keep: F.fees, copies: [F.feesCopy], decidedBy: "Mei Tan" }],
  customerPolicy: { accessList: ["Mei Tan", "Olivia Brooks"], retainDays: 7 * 365, setBy: "Olivia Brooks" },
};

const world = (opts = {}) => new KnowledgeBaseWorld({ now: NOW, drive: folder(), ...opts });
const calls = (w, port) => w.calls.filter((c) => c.port === port);
const byPath = (w, path) => w.register.find((e) => e.location?.path === path);
const LOCATOR_RE = /#(page=\d+|section=\d+(\.\d+)*|t=\d+)$/;
const isDate = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));
const opensTo = (w, p) => {
  const e = w.entry(p.registerId);
  const f = e && w.driveFile(e.location.path);
  return !!f && typeof p.text === "string" && p.text.length > 0 && f.content.includes(p.text) && typeof p.locator === "string" && p.locator.startsWith(`${f.system}:${f.path}#`);
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
    // 1. Eight files of six kinds, the fee schedule saved twice.
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
      // The leave policy, owned only by a team, is not registered, so nothing of it is indexed.
      const leaveIndexed = w.passages.some((p) => p.locator?.includes(F.leave) || /Annual leave is requested/.test(p.text));
      return ordered && !leaveIndexed && w.passages.every((p) => w.register.some((e) => e.id === p.registerId));
    },
    describe: (w) => `${w.register.length} entries, ${w.passages.length} passages; ${w.calls.length} port call(s)`,
  },
  {
    checkId: "one-canonical-copy",
    // 2. The fee schedule and "Copy of fee schedule (1)"; Mei Tan chose the dated file.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const same = w.register.filter((e) => e.checksum === CK.fees);
      const canon = same.filter((e) => e.status === "current" && !e.duplicateOf);
      const dups = same.filter((e) => e.status === "duplicate_of");
      if (same.length !== 2 || canon.length !== 1 || dups.length !== 1) return false;
      const right = canon[0].location.path === F.fees && dups[0].location.path === F.feesCopy && dups[0].duplicateOf === canon[0].id;
      const once = new Map();
      for (const e of w.register.filter((x) => x.status === "current")) once.set(e.checksum, (once.get(e.checksum) ?? 0) + 1);
      const fromCanon = w.passages.filter((p) => p.registerId === canon[0].id && p.scope === "shared").length;
      const fromCopy = w.passages.some((p) => p.registerId === dups[0].id || p.locator?.includes(F.feesCopy));
      // The index holds the fee schedule once: one passage per page.
      const pages = w.passages.filter((p) => /Quarterly BAS lodgement/.test(p.text)).length;
      return right && [...once.values()].every((n) => n === 1) && fromCanon === 3 && !fromCopy && pages === 1;
    },
    describe: (w) => w.register.filter((e) => e.checksum === CK.fees).map((e) => `${e.id} ${e.status}${e.duplicateOf ? ` -> ${e.duplicateOf}` : ""}`).join("; ") || "no entry for the fee schedule",
  },
  {
    checkId: "owner-is-a-person",
    // 3. The leave policy's only owner on the sharing sheet is "HR".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.register.length < 6) return false;
      const people = w.register.every((e) => PEOPLE.includes(e.owner) && !TEAMS.includes(e.owner));
      const writes = calls(w, "write_register").every((c) => PEOPLE.includes(c.request.owner));
      const leave = byPath(w, F.leave);
      const asked = w.gaps.some((g) => g.expected.includes(F.leave) && PEOPLE.includes(g.owner) && isDate(g.due));
      return people && writes && (leave ? PEOPLE.includes(leave.owner) : asked);
    },
    describe: (w) => `owners: ${[...new Set(w.register.map((e) => e.owner))].join(", ") || "none"}; tasks: ${w.gaps.map((g) => `${g.expected} -> ${g.owner}`).join("; ") || "none"}`,
  },
  {
    checkId: "edition-and-checksum-on-arrival",
    // 4. The Clerks Award with "as at 1 July 2025" on its cover, and the engagement letter with none.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const award = byPath(w, F.award);
      const letter = byPath(w, F.letter);
      if (!award || !letter) return false;
      const stamped = [award, letter].every((e) => isDate(e.retrievedAt) && typeof e.checksum === "string" && e.checksum.length > 0);
      const fromFolder = award.checksum === CK.award && letter.checksum === "md5:letter";
      return stamped && fromFolder && award.kind === "instrument" && award.edition === "1 July 2025" && w.register.every((e) => typeof e.checksum === "string" && e.checksum.length > 0);
    },
    describe: (w) => [F.award, F.letter].map((p) => byPath(w, p)).map((e) => (e ? `${e.title}: ${e.checksum} ed ${e.edition ?? "-"} at ${e.retrievedAt}` : "missing")).join("; "),
  },
  {
    checkId: "customer-material-quarantined",
    // 5. A client's email about her BAS fee, saved in the notes folder beside the meeting recording.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const e = byPath(w, F.email);
      if (!e || e.kind !== "customer_material" || !Array.isArray(e.accessList) || e.accessList.length === 0) return false;
      const restricted = e.accessList.every((n) => PEOPLE.includes(n)) && e.accessList.length < PEOPLE.length;
      const leaked = w.passages.some((p) => p.scope === "shared" && (p.registerId === e.id || /Jo Citizen|0400 000 000|jo\.citizen/.test(p.text)));
      // The meeting recording in the same folder is still in the shared index.
      const meetingIndexed = w.passages.some((p) => p.scope === "shared" && p.locator?.includes(F.meeting));
      return restricted && !leaked && meetingIndexed;
    },
    describe: (w) => {
      const e = byPath(w, F.email);
      return e ? `${e.kind}, access ${JSON.stringify(e.accessList)}, ${w.passages.filter((p) => p.registerId === e.id).length} passage(s)` : "not on the register";
    },
  },
  {
    checkId: "locators-are-replayable",
    // 6. Pages from the lease, sections from the engagement letter, seconds from the meeting recording.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.passages.length === 0) return false;
      const all = w.passages.every((p) => typeof p.registerId === "string" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator));
      const paged = w.passages.some((p) => p.locator === `drive:${F.lease}#page=4` && /six months written notice/.test(p.text));
      const sectioned = w.passages.some((p) => p.locator === `drive:${F.letter}#section=2`);
      const timed = w.passages.some((p) => p.locator === `drive:${F.meeting}#t=150` && /BAS reminders/.test(p.text));
      return all && paged && sectioned && timed && w.passages.every((p) => opensTo(w, p));
    },
    describe: (w) => w.passages.map((p) => p.locator).join(", ") || "no passages",
  },
  {
    checkId: "search-finds-never-answers",
    // 7. "how much do we charge for a BAS lodgement", which the client's email also mentions.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      await b.search(w.ports(), "how much do we charge for a BAS lodgement");
    },
    holds: (w) => {
      const s = w.searches.at(-1);
      if (!s || s.result.composed !== null || s.result.passages.length === 0) return false;
      const each = s.result.passages.every((p) => {
        const e = w.entry(p.registerId);
        return !!e && e.status === "current" && e.kind !== "customer_material" && LOCATOR_RE.test(p.locator ?? "") && opensTo(w, p);
      });
      const findsFee = s.result.passages.some((p) => p.locator === `drive:${F.fees}#page=2`);
      return each && findsFee;
    },
    describe: (w) => {
      const s = w.searches.at(-1);
      return s ? `${s.result.passages.length} passage(s): ${s.result.passages.map((p) => p.locator).join(", ")}; composed ${JSON.stringify(s.result.composed)}` : "no search";
    },
  },
  {
    checkId: "missing-is-a-gap-with-an-owner",
    // 8. The office expects the Award as at 1 July 2026; the folder holds the 1 July 2025 edition only.
    world: () => world({ expected: ["Clerks Award MA000002 | 1 July 2026", "Engagement letter template", "Office lease, Level 3"] }),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const gap = w.gaps.filter((g) => g.expected.includes("Clerks Award") && g.expected.includes("1 July 2026"));
      const good = gap.length === 1 && gap[0].owner === "Raj Patel" && isDate(gap[0].due) && Date.parse(gap[0].due) > NOW.getTime();
      const noFalse = !w.gaps.some((g) => g.expected.startsWith("Engagement letter template") || g.expected.startsWith("Office lease"));
      return good && noFalse && w.gaps.every((g) => PEOPLE.includes(g.owner) && isDate(g.due));
    },
    describe: (w) => w.gaps.map((g) => `${g.expected} -> ${g.owner} by ${g.due}`).join("; ") || "no gaps",
  },
  {
    checkId: "watch-on-a-schedule",
    // 9. Intake, a quiet scheduled run, then Mei saves a new fee schedule over the old one, then the next run.
    world: () => world(),
    drive: (b, w) => runs(b, w, ["intake", "watch-quiet", (x) => x.replaceOnDrive(F.fees, FEES_B, CK.feesB), "watch-changed"]),
    holds: (w) => {
      if (!w.marks || w.marks.length !== 4) return false;
      const registered = w.register.map((e) => e.location.path);
      if (registered.length < 6) return false;
      const readsAll = (i) => {
        const fetched = new Set(slice(w, i).filter((c) => c.port === "read_file" && c.request.fetch).map((c) => c.request.fetch));
        return registered.every((p) => fetched.has(p));
      };
      const e = byPath(w, F.fees);
      if (!e) return false;
      const updated = e.checksum === CK.feesB && e.supersededChecksums.includes(CK.fees) && e.status === "current";
      const told = slice(w, 2).some((c) => c.port === "notify" && c.request.registerId === e.id && c.request.owner === "Mei Tan" && c.request.detail.includes(e.title));
      const quiet = !slice(w, 1).some((c) => c.port === "notify");
      const reindexed = slice(w, 2).some((c) => c.port === "index_passage" && c.request.registerId === e.id);
      return readsAll(1) && readsAll(2) && updated && told && quiet && reindexed;
    },
    describe: (w) => {
      const e = byPath(w, F.fees);
      return `${e ? `${e.checksum} superseded ${JSON.stringify(e.supersededChecksums)}` : "no entry"}; notifications ${w.notifications.map((n) => `${n.owner}/${n.registerId}`).join(", ") || "none"}`;
    },
  },
  {
    checkId: "retention-follows-kind",
    // 10. The register read back after the 1 July 2026 Award replaces the 2025 one in the folder.
    world: () => world(),
    drive: (b, w) => runs(b, w, ["intake", (x) => x.replaceOnDrive(F.award, AWARD_26, CK.award26, "1 July 2026"), "watch"]),
    holds: (w) => {
      const client = w.register.filter((e) => e.kind === "customer_material");
      const instruments = w.register.filter((e) => e.kind === "instrument");
      if (client.length === 0 || instruments.length === 0) return false;
      const clientOk = client.every((e) => Array.isArray(e.accessList) && e.accessList.length > 0 && isDate(e.expiresOn) && Date.parse(e.expiresOn) > NOW.getTime());
      const award = byPath(w, F.award);
      const kept = !!award && award.checksum === CK.award26 && award.edition === "1 July 2026" && award.supersededChecksums.includes(CK.award) && w.register.filter((e) => e.title === "Clerks Award MA000002").length === 1;
      return clientOk && kept;
    },
    describe: (w) => w.register.map((e) => `${e.kind}:${e.title} exp ${e.expiresOn ?? "-"} sup ${e.supersededChecksums.length}`).join("; "),
  },
  {
    checkId: "handover-carries-the-register",
    // 11. Raj promotes the Award; an unregistered download, an unsigned promotion and a file that moved are refused.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      const award = w.register.find((e) => e.location.path === F.award);
      await b.promote(w.ports(), award ? award.id : "unknown", "Raj Patel", CONFIG);
      await b.promote(w.ports(), "doc:drive:Downloads/award-summary-from-a-blog.pdf", "Raj Patel", CONFIG);
      const fees = w.register.find((e) => e.location.path === F.fees);
      await b.promote(w.ports(), fees ? fees.id : "unknown", null, CONFIG);
      w.replaceOnDrive(F.fees, FEES_B, CK.feesB);
      await b.promote(w.ports(), fees ? fees.id : "unknown", "Mei Tan", CONFIG);
    },
    holds: (w) => {
      const award = byPath(w, F.award);
      if (!award || w.handovers.length !== 1) return false;
      const h = w.handovers[0];
      return h.registerId === award.id && h.edition === award.edition && h.checksum === award.checksum && typeof h.locatorScheme === "string" && h.locatorScheme.length > 0 && h.promotedBy === "Raj Patel";
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

// The pass test runs on the office's real drive with its real owners. On the
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

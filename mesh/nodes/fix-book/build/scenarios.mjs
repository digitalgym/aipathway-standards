/**
 * One scenario per check of knowledge-base-build-standard, for Fix Book.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-base-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-base-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The drive is a Queensland air-conditioning, hot water and refrigeration
 * service business's: a folder per job_id from the job system holding the fix
 * notes techs sent back (one also saved again from an inbox attachment), a
 * tech's voice memo, and a customer's email someone saved beside the memo; and
 * the company-wide split system service manual, a refrigerant handling
 * procedure the drive shows as owned by a team, the fix note template and the
 * service rates.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns true or false.
 */

import { KnowledgeBaseWorld } from "@aipathway/conformance";

const NOW = new Date("2026-11-04T00:00:00.000Z");
const DAY = 86_400_000;

export const PEOPLE = ["Tom Reilly", "Priya Shah", "Dan Kowalski", "Leah Morgan"];

const P = {
  note07: "Fixes/J-2207/fix-note.txt",
  note07Copy: "Inbox attachments/fix-note J-2207 (1).txt",
  memo31: "Fixes/J-2231/voice-memo.m4a",
  cust31: "Fixes/J-2231/customer-email.txt",
  note50: "Fixes/J-2250/fix-note.txt",
  manual: "Manuals/split-system-service-manual.pdf",
  refrig: "Procedures/refrigerant-handling.pdf",
  template: "Templates/fix-note-template.docx",
  rates: "Rates/service-rates-2026.xlsx",
};

const CK = { note07: "sha256:fix-2207-v1", note07v2: "sha256:fix-2207-v2", manual: "sha256:manual-2024-03", manual25: "sha256:manual-2025-01" };

const NOTE07_V1 =
  "[fault] Ducted split showing E4 code, tripping on high pressure within ten minutes of cooling. " +
  "[cause] Outdoor coil blocked with lint from the dryer vent beside the condenser. " +
  "[fix] Washed the outdoor coil and moved the dryer vent outlet 1.5 m clear of the condenser. " +
  "[tested] Ran 40 minutes on cool with no E4 trip.";
const NOTE07_V2 = NOTE07_V1.replace(
  "[tested] Ran 40 minutes on cool with no E4 trip.",
  "[parts] Outdoor fan capacitor 5 uF. [tested] Callback on 3 November: E4 came back. Outdoor fan capacitor also weak; replaced it and ran 60 minutes with no E4 trip.",
);
const MANUAL_24 = "[p1] Split system service manual, revision 2024-03. [p12] E4 code: high pressure protection. Check the outdoor coil, the outdoor fan and the fan capacitor.";
const MANUAL_25 = MANUAL_24.replace("revision 2024-03", "revision 2025-01").replace("the fan capacitor.", "the fan capacitor. Do not bypass the high pressure switch.");

export const driveFiles = () => [
  { path: P.note07, system: "drive", title: "J-2207 fix note: E4 high pressure trip", content: NOTE07_V1, checksum: CK.note07, hintKind: "internal_rule" },
  { path: P.note07Copy, system: "drive", title: "fix-note J-2207 (1)", content: NOTE07_V1, checksum: CK.note07, hintKind: "internal_rule" },
  {
    path: P.memo31,
    system: "drive",
    title: "J-2231 voice memo: gas hot water pilot going out",
    content: "[t=5] Gas hot water unit, pilot goes out after a few minutes. [t=48] Thermocouple reading low; replaced the thermocouple and cleaned the pilot assembly, lit and held for 15 minutes.",
    checksum: "sha256:memo-2231",
    hintKind: "internal_rule",
  },
  {
    path: P.cust31,
    system: "drive",
    title: "Customer email about access",
    content: "[p1] From: sam.example@example.com. The customer, Sam Example, mobile 0400 000 000, wrote that the hot water unit is behind the side gate and the dog is in the yard.",
    checksum: "sha256:cust-2231",
    hintKind: "internal_rule",
  },
  {
    path: P.note50,
    system: "drive",
    title: "J-2250 fix note: evaporative cooler pads dry",
    content: "[fault] Evaporative cooler pump runs but the pads stay dry. [cause] Distributor line blocked with scale. [fix] Cleared the distributor line with descaler and replaced the float valve. [parts] Float valve.",
    checksum: "sha256:fix-2250",
    hintKind: "internal_rule",
  },
  { path: P.manual, system: "drive", title: "Split system service manual", content: MANUAL_24, checksum: CK.manual, editionOnCover: "rev 2024-03", hintKind: "instrument" },
  { path: P.refrig, system: "drive", title: "Refrigerant handling procedure", content: "[p1] Recover refrigerant before opening the circuit. Only a technician holding a refrigerant handling licence does the work.", checksum: "sha256:refrig-2", hintKind: "internal_rule" },
  { path: P.template, system: "drive", title: "Fix note template", content: "[p1] Fault, cause, fix, parts, tested. One line each.", checksum: "sha256:template-1", hintKind: "template" },
  { path: P.rates, system: "drive", title: "Service rates 2026", content: "[p1] Service call, hourly rate and after-hours rate ex GST, effective 1 July 2026.", checksum: "sha256:rates-2026", hintKind: "price_list" },
];

export const CONFIG = {
  people: PEOPLE,
  keeper: "Leah Morgan",
  jobTechs: { "J-2207": "Tom Reilly", "J-2231": "Priya Shah", "J-2250": "Dan Kowalski" },
  owners: {
    [P.manual]: "Leah Morgan",
    [P.refrig]: "Service Team", // the shared account the drive shows, not a person
    [P.template]: "Leah Morgan",
    [P.rates]: "Leah Morgan",
  },
  expectedOwners: { "Fault code chart": "Leah Morgan" },
  canonical: [{ keep: P.note07, copies: [P.note07Copy], decidedBy: "Tom Reilly" }],
  customerPolicy: { accessList: ["Priya Shah", "Leah Morgan"], retainDays: 7 * 365, setBy: "Leah Morgan" },
};

const world = (opts = {}) => new KnowledgeBaseWorld({ now: NOW, drive: driveFiles(), ...opts });
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const byPath = (w, path) => w.register.find((e) => e.location?.path === path);
const LOCATOR_RE = /#(page=\d+|t=\d+|section=(fault|cause|fix|parts|tested))$/;
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
    // 1. Nine files of five kinds across three job folders and the company folders, two copies of one fix note.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const idx = calls(w, "index_passage");
      if (idx.length < 8 || w.passages.length !== idx.length) return false;
      const ordered = idx.every((c) => {
        const at = w.calls.indexOf(c);
        const reg = w.calls.findIndex((x) => x.port === "write_register" && x.request.id === c.request.registerId);
        return typeof c.request.registerId === "string" && reg !== -1 && reg < at;
      });
      // The refrigerant procedure owned by a team is not on the register, so nothing of it is indexed.
      const teamFileIndexed = w.passages.some((p) => p.locator?.includes(P.refrig) || /Recover refrigerant/.test(p.text));
      return ordered && !teamFileIndexed && !byPath(w, P.refrig);
    },
    describe: (w) => `${calls(w, "write_register").length} register write(s), ${calls(w, "index_passage").length} passage(s)`,
  },
  {
    checkId: "one-canonical-copy",
    // 2. The J-2207 fix note saved twice: in the job folder and from an inbox attachment. Tom picked the job folder copy.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const canon = byPath(w, P.note07);
      const dup = byPath(w, P.note07Copy);
      if (!canon || !dup) return false;
      const oneCanonical = w.register.filter((e) => e.checksum === CK.note07 && e.status === "current").length === 1;
      const pointer = dup.status === "duplicate_of" && dup.duplicateOf === canon.id && canon.status === "current";
      const onlyCanonIndexed = sharedFrom(w, canon.id).length >= 3 && w.passages.filter((p) => p.registerId === dup.id || p.locator?.includes("Inbox attachments")).length === 0;
      return oneCanonical && pointer && onlyCanonIndexed;
    },
    describe: (w) => w.register.filter((e) => e.checksum === CK.note07).map((e) => `${e.location.path}:${e.status}${e.duplicateOf ? `->${e.duplicateOf}` : ""}`).join("; ") || "neither copy registered",
  },
  {
    checkId: "owner-is-a-person",
    // 3. The refrigerant procedure's only owner on the drive is "Service Team".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.register.length < 7) return false;
      const allPeople = w.register.every((e) => PEOPLE.includes(e.owner));
      const fixOwners = byPath(w, P.note07)?.owner === "Tom Reilly" && byPath(w, P.memo31)?.owner === "Priya Shah" && byPath(w, P.note50)?.owner === "Dan Kowalski";
      const asked = w.gaps.some((g) => g.expected.includes(P.refrig) && g.owner === "Leah Morgan" && isDate(g.due));
      return allPeople && fixOwners && asked;
    },
    describe: (w) => w.register.map((e) => `${e.title}: ${e.owner}`).join("; ") || "empty register",
  },
  {
    checkId: "edition-and-checksum-on-arrival",
    // 4. The service manual prints its revision; the fix notes and template print none.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.register.length < 7) return false;
      const stamped = w.register.every((e) => typeof e.checksum === "string" && e.checksum.length > 0 && isDate(e.retrievedAt) && e.checksum === w.driveFile(e.location.path)?.checksum);
      const manual = byPath(w, P.manual);
      const note = byPath(w, P.note07);
      return stamped && manual?.edition === "rev 2024-03" && manual?.kind === "instrument" && !!note && note.edition === undefined;
    },
    describe: (w) => w.register.map((e) => `${e.title}: ${e.checksum} ${e.edition ?? "-"} ${e.retrievedAt}`).join("; ") || "empty register",
  },
  {
    checkId: "customer-material-quarantined",
    // 5. A customer's email with a phone number, saved in the J-2231 job folder beside the tech's memo.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const e = byPath(w, P.cust31);
      if (!e) return false;
      const restricted = e.kind === "customer_material" && Array.isArray(e.accessList) && e.accessList.length > 0 && e.accessList.every((n) => PEOPLE.includes(n));
      const leaked = w.passages.some((p) => p.registerId === e.id || /0400 000 000|Sam Example/.test(p.text));
      const memoIndexed = sharedFrom(w, byPath(w, P.memo31)?.id).length >= 2;
      return restricted && !leaked && memoIndexed;
    },
    describe: (w) => {
      const e = byPath(w, P.cust31);
      return e ? `${e.kind} access ${JSON.stringify(e.accessList ?? null)}; passages ${w.passages.filter((p) => p.registerId === e.id).length}` : "customer email not on the register";
    },
  },
  {
    checkId: "locators-are-replayable",
    // 6. Fix notes cut by section, the voice memo by second, the manual by page.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      if (w.passages.length < 8) return false;
      const all = w.passages.every((p) => typeof p.registerId === "string" && !!w.entry(p.registerId) && typeof p.locator === "string" && LOCATOR_RE.test(p.locator));
      const sectioned = w.passages.some((p) => p.locator === `drive:${P.note07}#section=fix`);
      const timed = w.passages.some((p) => p.locator === `drive:${P.memo31}#t=48`);
      const paged = w.passages.some((p) => p.locator === `drive:${P.manual}#page=12`);
      // Each locator opens to the words it carries.
      const real = w.passages.every((p) => {
        const t = fileText(w, p.registerId);
        return t !== null && t.includes(p.text) && p.locator.startsWith(`drive:${w.entry(p.registerId).location.path}#`);
      });
      return all && sectioned && timed && paged && real;
    },
    describe: (w) => w.passages.map((p) => p.locator).join(", ") || "no passages",
  },
  {
    checkId: "search-finds-never-answers",
    // 7. Tom asks "how did we fix the E4 high pressure trip before"; Dan asks about a cool room compressor nobody has written up.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      w.found = await b.search(w.ports(), "how did we fix the E4 high pressure trip before");
      w.none = await b.search(w.ports(), "cool room compressor hums but will not run");
    },
    holds: (w) => {
      if (w.searches.length !== 2) return false;
      const [hit, miss] = w.searches;
      if (hit.result.composed !== null || miss.result.composed !== null || hit.result.passages.length === 0) return false;
      const each = hit.result.passages.every((p) => {
        const e = w.entry(p.registerId);
        const t = fileText(w, p.registerId);
        return !!e && e.status === "current" && e.kind !== "customer_material" && typeof p.locator === "string" && LOCATOR_RE.test(p.locator) && t !== null && t.includes(p.text);
      });
      const citesJob = hit.result.passages.some((p) => p.locator === `drive:${P.note07}#section=fix` && p.jobId === "J-2207");
      const noCopy = !hit.result.passages.some((p) => p.locator?.includes("Inbox attachments"));
      const offTopic = hit.result.passages.some((p) => p.locator?.includes("J-2250") || p.locator?.includes("J-2231"));
      const noRecord = miss.result.passages.length === 0 && typeof w.none?.reply === "string" && /no record/i.test(w.none.reply);
      return each && citesJob && noCopy && !offTopic && noRecord;
    },
    describe: (w) =>
      w.searches.map((s) => `"${s.query}": ${s.result.passages.length} passage(s) ${s.result.passages.map((p) => p.locator).join(", ")}; composed ${JSON.stringify(s.result.composed)}`).join(" | ") || "no search",
  },
  {
    checkId: "missing-is-a-gap-with-an-owner",
    // 8. The office works from the 2025 fault code chart, which is not on the drive; the template and the manual are held.
    world: () => world({ expected: ["Fault code chart | Rev 2025", "Fix note template", "Split system service manual | rev 2024-03"] }),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: (w) => {
      const gap = w.gaps.filter((g) => g.expected.includes("Fault code chart") && g.expected.includes("Rev 2025"));
      const good = gap.length === 1 && gap[0].owner === "Leah Morgan" && isDate(gap[0].due) && Date.parse(gap[0].due) > NOW.getTime();
      const noFalse = !w.gaps.some((g) => g.expected.startsWith("Fix note template") || g.expected.startsWith("Split system service manual"));
      return good && noFalse && w.gaps.every((g) => PEOPLE.includes(g.owner) && isDate(g.due));
    },
    describe: (w) => w.gaps.map((g) => `${g.expected} -> ${g.owner} by ${g.due}`).join("; ") || "no tasks",
  },
  {
    checkId: "watch-on-a-schedule",
    // 9. Intake, a quiet scheduled run, then Tom amends the J-2207 fix note after the callback, then the next run.
    world: () => world(),
    drive: async (b, w) => {
      await runs(b, w, ["intake", "watch-quiet", (x) => x.replaceOnDrive(P.note07, NOTE07_V2, CK.note07v2), "watch-changed"]);
      w.after = await b.search(w.ports(), "E4 trip outdoor fan capacitor");
    },
    holds: (w) => {
      if (!w.marks || w.marks.length !== 4) return false;
      const registered = w.register.map((e) => e.location.path);
      if (registered.length < 7) return false;
      const readsAll = (i) => {
        const fetched = new Set(slice(w, i).filter((c) => c.port === "read_file" && c.request.fetch).map((c) => c.request.fetch));
        return registered.every((p) => fetched.has(p));
      };
      const e = byPath(w, P.note07);
      if (!e) return false;
      const updated = e.checksum === CK.note07v2 && e.supersededChecksums.includes(CK.note07) && e.status === "current";
      const told = slice(w, 2).some((c) => c.port === "notify" && c.request.registerId === e.id && c.request.owner === "Tom Reilly" && c.request.detail.includes(e.title));
      const quiet = !slice(w, 1).some((c) => c.port === "notify");
      const reindexed = slice(w, 2).some((c) => c.port === "index_passage" && c.request.registerId === e.id);
      const s = w.searches.at(-1);
      const showsAmended = !!s && s.result.passages.some((p) => p.registerId === e.id && /capacitor/.test(p.text));
      return readsAll(1) && readsAll(2) && updated && told && quiet && reindexed && showsAmended;
    },
    describe: (w) => {
      const e = byPath(w, P.note07);
      return `${e ? `${e.checksum} superseded ${JSON.stringify(e.supersededChecksums)}` : "no entry"}; notifications ${w.notifications.map((n) => `${n.owner}/${n.registerId}`).join(", ") || "none"}`;
    },
  },
  {
    checkId: "retention-follows-kind",
    // 10. The register read back after the manual's 2025 revision lands on the drive.
    world: () => world(),
    drive: (b, w) => runs(b, w, ["intake", (x) => x.replaceOnDrive(P.manual, MANUAL_25, CK.manual25, "rev 2025-01"), "watch"]),
    holds: (w) => {
      const customer = w.register.filter((e) => e.kind === "customer_material");
      const instruments = w.register.filter((e) => e.kind === "instrument");
      if (customer.length === 0 || instruments.length === 0) return false;
      const custOk = customer.every((e) => Array.isArray(e.accessList) && e.accessList.length > 0 && isDate(e.expiresOn) && Date.parse(e.expiresOn) > NOW.getTime());
      const m = byPath(w, P.manual);
      const kept = !!m && m.checksum === CK.manual25 && m.edition === "rev 2025-01" && m.supersededChecksums.includes(CK.manual) && w.register.filter((e) => e.title === "Split system service manual").length === 1;
      const othersNoExpiry = w.register.filter((e) => e.kind !== "customer_material").every((e) => e.expiresOn === undefined);
      return custOk && kept && othersNoExpiry;
    },
    describe: (w) => w.register.map((e) => `${e.kind}:${e.title} exp ${e.expiresOn ?? "-"} sup ${e.supersededChecksums.length}`).join("; "),
  },
  {
    checkId: "handover-carries-the-register",
    // 11. Leah promotes the service manual; an unregistered file, an unsigned promotion and a moved fix note are refused.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      const manual = w.register.find((e) => e.location.path === P.manual);
      await b.promote(w.ports(), manual ? manual.id : "unknown", "Leah Morgan", CONFIG);
      await b.promote(w.ports(), "FB:drive:Downloads/someone-elses-notes.pdf", "Leah Morgan", CONFIG);
      const note = w.register.find((e) => e.location.path === P.note07);
      await b.promote(w.ports(), note ? note.id : "unknown", null, CONFIG);
      w.replaceOnDrive(P.note07, NOTE07_V2, CK.note07v2);
      await b.promote(w.ports(), note ? note.id : "unknown", "Tom Reilly", CONFIG);
    },
    holds: (w) => {
      const m = byPath(w, P.manual);
      if (!m || w.handovers.length !== 1) return false;
      const h = w.handovers[0];
      return (
        h.registerId === m.id &&
        h.edition === m.edition &&
        h.edition === "rev 2024-03" &&
        h.checksum === m.checksum &&
        typeof h.locatorScheme === "string" &&
        h.locatorScheme.length > 0 &&
        h.promotedBy === "Leah Morgan" &&
        w.escalations.length === 3
      );
    },
    describe: (w) => `${w.handovers.length} handover(s): ${w.handovers.map((h) => `${h.registerId} ${h.edition} ${h.checksum} by ${h.promotedBy}`).join("; ") || "none"}; ${w.escalations.length} refused`,
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

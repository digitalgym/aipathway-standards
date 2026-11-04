/**
 * One scenario per check of knowledge-base-build-standard, for Manual Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init knowledge-base-build-standard`
 * from https://aipathway.com.au/explore-ai/knowledge-base-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The drive is a Sunshine Coast plumbing and hot water business's: the
 * install and service manuals for a heat pump water heater (HPW-270), the
 * service manual and commissioning video for a gas continuous flow unit
 * (GX-26) whose fault codes collide with the heat pump's, a second copy of the
 * heat pump install manual saved from a supplier email, a split system install
 * guide the drive shows as owned by a team, the office's tempering valve
 * procedure, its commissioning sheet template, and a customer's note saved in
 * a job folder.
 *
 * Every `holds` reads the world's recorded trace and what the world recorded
 * through its ports, never the build's own memory, and returns true or false.
 */

import { KnowledgeBaseWorld } from "@aipathway/conformance";

const NOW = new Date("2026-11-04T00:00:00.000Z");
const DAY = 86_400_000;

export const PEOPLE = ["Tom Reilly", "Priya Shah", "Dan Kowalski", "Leah Morgan"];

const P = {
  hpInstall: "Manuals/HPW-270/install-manual.pdf",
  hpInstallCopy: "Inbox attachments/HPW270 install (1).pdf",
  hpService: "Manuals/HPW-270/service-manual.pdf",
  gxService: "Manuals/GX-26/service-manual.pdf",
  gxVideo: "Manuals/GX-26/commissioning-video.mp4",
  split: "Manuals/SPX-90/install-guide.pdf",
  tempering: "Procedures/tempering-valve-check.pdf",
  template: "Templates/commissioning-sheet.docx",
  cust: "Jobs/J-3104/customer-note.txt",
};

const CK = { hpInstall: "sha256:hpw-install-revC", hpService: "sha256:hpw-service-revB", hpServiceC: "sha256:hpw-service-revC" };

const HP_INSTALL =
  "[p1] HPW-270 heat pump water heater installation manual, Revision C. Models: HPW-270, HPW-315. " +
  "[p4] Clearances: keep 500 mm clear in front of the air intake and 1000 mm clear in front of the fan outlet. " +
  "[p9] Fit a tempering valve so water at outlets used for personal hygiene is delivered at no more than 50 degrees. " +
  "[p14] Error E07: low water flow at the cold inlet. Check the inlet strainer and that the isolation valve is fully open.";
const HP_SERVICE_B =
  "[p1] HPW-270 service manual, Revision B. Models: HPW-270. " +
  "[p6] Sacrificial anode: inspect every five years, replace if more than half consumed. " +
  "[p11] Error E07 service procedure: remove and clean the cold inlet strainer, then check flow at 6 litres per minute.";
const HP_SERVICE_C = HP_SERVICE_B.replace("Revision B", "Revision C").replace(
  "check flow at 6 litres per minute.",
  "check flow at 8 litres per minute. Replace the flow sensor if E07 returns.",
);
const GX_SERVICE =
  "[p1] GX-26 continuous flow gas water heater service manual, Issue 3. Models: GX-26. " +
  "[p8] Error E07: flame failure on ignition. Check gas supply pressure at the inlet test point and the ignition electrode gap.";
const GX_VIDEO = "[t=12] GX-26 commissioning. Models: GX-26. [t=95] Set the maximum gas pressure at the burner test point to the figure on the data plate.";

export const driveFiles = () => [
  { path: P.hpInstall, system: "drive", title: "HPW-270 install manual", content: HP_INSTALL, checksum: CK.hpInstall, editionOnCover: "Rev C", hintKind: "instrument" },
  { path: P.hpInstallCopy, system: "drive", title: "HPW270 install (1)", content: HP_INSTALL, checksum: CK.hpInstall, editionOnCover: "Rev C", hintKind: "instrument" },
  { path: P.hpService, system: "drive", title: "HPW-270 service manual", content: HP_SERVICE_B, checksum: CK.hpService, editionOnCover: "Rev B", hintKind: "instrument" },
  { path: P.gxService, system: "drive", title: "GX-26 service manual", content: GX_SERVICE, checksum: "sha256:gx26-service-3", editionOnCover: "Issue 3", hintKind: "instrument" },
  { path: P.gxVideo, system: "drive", title: "GX-26 commissioning video", content: GX_VIDEO, checksum: "sha256:gx26-video-1", editionOnCover: "2025", hintKind: "instrument" },
  { path: P.split, system: "drive", title: "SPX-90 install guide", content: "[p1] SPX-90 split system install guide, Edition 2. Models: SPX-90. [p3] Clearances: 300 mm above the indoor unit.", checksum: "sha256:spx90-2", editionOnCover: "Edition 2", hintKind: "instrument" },
  { path: P.tempering, system: "drive", title: "Tempering valve check", content: "[p1] Our procedure: test the tempering valve outlet temperature at commissioning and record it on the commissioning sheet.", checksum: "sha256:temper-1", hintKind: "internal_rule" },
  { path: P.template, system: "drive", title: "Commissioning sheet", content: "[p1] Unit model, serial, outlet temperature, gas pressure, tech, date.", checksum: "sha256:commission-1", hintKind: "template" },
  { path: P.cust, system: "drive", title: "Customer note J-3104", content: "[p1] The customer, Jo Example, mobile 0400 000 000, says the unit is beside the bedroom window and the side gate code is 1234.", checksum: "sha256:cust-3104", hintKind: "internal_rule" },
];

export const CONFIG = {
  people: PEOPLE,
  keeper: "Leah Morgan",
  jobUnits: { "J-3104": "HPW-270", "J-3120": "GX-26", "J-3133": "SPX-90", "J-3140": "RX-40" },
  owners: {
    [P.hpInstall]: "Tom Reilly",
    [P.hpInstallCopy]: "Tom Reilly",
    [P.hpService]: "Tom Reilly",
    [P.gxService]: "Priya Shah",
    [P.gxVideo]: "Priya Shah",
    [P.split]: "Service Team", // the shared account the drive shows, not a person
    [P.tempering]: "Leah Morgan",
    [P.template]: "Leah Morgan",
    [P.cust]: "Dan Kowalski",
  },
  expectedOwners: { "RX-40 install manual": "Dan Kowalski" },
  canonical: [{ keep: P.hpInstall, copies: [P.hpInstallCopy], decidedBy: "Tom Reilly" }],
  customerPolicy: { accessList: ["Dan Kowalski", "Leah Morgan"], retainDays: 7 * 365, setBy: "Leah Morgan" },
  issuerHeld: [{ title: "RX-40 install manual", owner: "Dan Kowalski" }],
};

const world = (opts = {}) => new KnowledgeBaseWorld({ now: NOW, drive: driveFiles(), ...opts });
const calls = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const byPath = (w, path) => w.register.find((e) => e.location?.path === path);
const LOCATOR_RE = /^drive:[^#]+#(page=\d+|t=\d+)$/;
const isDate = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));
const sharedFrom = (w, id) => w.passages.filter((p) => p.registerId === id && p.scope === "shared");
const fileText = (w, registerId) => {
  const e = w.entry(registerId);
  const f = e && w.driveFile(e.location.path);
  return f ? f.content : null;
};
/** Only an explicit true holds. */
const strict = (fn) => (w) => {
  try {
    return fn(w) === true;
  } catch {
    return false;
  }
};

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
    // 1. Nine files of four kinds, two copies of one manual, one owned by a team.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      const idx = calls(w, "index_passage");
      if (idx.length < 10 || w.passages.length !== idx.length) return false;
      const ordered = idx.every((c) => {
        const at = w.calls.indexOf(c);
        const reg = w.calls.findIndex((x) => x.port === "write_register" && x.request.id === c.request.registerId);
        return typeof c.request.registerId === "string" && reg !== -1 && reg < at;
      });
      const teamFileIndexed = w.passages.some((p) => p.locator?.includes(P.split) || /300 mm above/.test(p.text));
      return ordered && !teamFileIndexed && !byPath(w, P.split);
    }),
    describe: (w) => `${calls(w, "write_register").length} register write(s), ${calls(w, "index_passage").length} passage(s)`,
  },
  {
    checkId: "one-canonical-copy",
    // 2. The HPW-270 install manual saved twice: in Manuals and from a supplier email. Tom picked the Manuals copy.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      const canon = byPath(w, P.hpInstall);
      const dup = byPath(w, P.hpInstallCopy);
      if (!canon || !dup) return false;
      const oneCanonical = w.register.filter((e) => e.checksum === CK.hpInstall && e.status === "current").length === 1;
      const pointer = dup.status === "duplicate_of" && dup.duplicateOf === canon.id && canon.status === "current";
      const onlyCanon = sharedFrom(w, canon.id).length === 4 && w.passages.filter((p) => p.registerId === dup.id || p.locator?.includes("Inbox attachments")).length === 0;
      return oneCanonical && pointer && onlyCanon;
    }),
    describe: (w) => w.register.filter((e) => e.checksum === CK.hpInstall).map((e) => `${e.location.path}:${e.status}${e.duplicateOf ? `->${e.duplicateOf}` : ""}`).join("; ") || "neither copy registered",
  },
  {
    checkId: "owner-is-a-person",
    // 3. The split system guide's only owner on the drive is "Service Team".
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      if (w.register.length < 8) return false;
      const allPeople = w.register.every((e) => PEOPLE.includes(e.owner));
      const owners = byPath(w, P.hpService)?.owner === "Tom Reilly" && byPath(w, P.gxService)?.owner === "Priya Shah";
      const asked = w.gaps.some((g) => g.expected.includes(P.split) && g.owner === "Leah Morgan" && isDate(g.due));
      return allPeople && owners && asked;
    }),
    describe: (w) => w.register.map((e) => `${e.title}: ${e.owner}`).join("; ") || "empty register",
  },
  {
    checkId: "edition-and-checksum-on-arrival",
    // 4. The manuals print their revision on the cover; the commissioning sheet prints none.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      if (w.register.length < 8) return false;
      const stamped = w.register.every((e) => typeof e.checksum === "string" && e.checksum.length > 0 && isDate(e.retrievedAt) && e.checksum === w.driveFile(e.location.path)?.checksum);
      const svc = byPath(w, P.hpService);
      const gx = byPath(w, P.gxService);
      const tpl = byPath(w, P.template);
      return stamped && svc?.edition === "Rev B" && svc?.kind === "instrument" && gx?.edition === "Issue 3" && !!tpl && tpl.edition === undefined && tpl.kind === "template";
    }),
    describe: (w) => w.register.map((e) => `${e.title}: ${e.checksum} ${e.edition ?? "-"} ${e.retrievedAt}`).join("; ") || "empty register",
  },
  {
    checkId: "customer-material-quarantined",
    // 5. A customer's note with a phone number and gate code, in the J-3104 job folder.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      const e = byPath(w, P.cust);
      if (!e) return false;
      const restricted = e.kind === "customer_material" && Array.isArray(e.accessList) && e.accessList.length > 0 && e.accessList.every((n) => PEOPLE.includes(n));
      const leaked = w.passages.some((p) => p.registerId === e.id || /0400 000 000|Jo Example|gate code/.test(p.text));
      return restricted && !leaked && sharedFrom(w, byPath(w, P.hpInstall)?.id).length === 4;
    }),
    describe: (w) => {
      const e = byPath(w, P.cust);
      return e ? `${e.kind} access ${JSON.stringify(e.accessList ?? null)}; passages ${w.passages.filter((p) => p.registerId === e.id).length}` : "customer note not on the register";
    },
  },
  {
    checkId: "locators-are-replayable",
    // 6. Manuals cut at their printed pages, the commissioning video by second.
    world: () => world(),
    drive: (b, w) => b(w.ports(), CONFIG),
    holds: strict((w) => {
      if (w.passages.length < 10) return false;
      const all = w.passages.every((p) => typeof p.registerId === "string" && !!w.entry(p.registerId) && typeof p.locator === "string" && LOCATOR_RE.test(p.locator));
      const paged = w.passages.some((p) => p.locator === `drive:${P.hpInstall}#page=14` && /E07: low water flow/.test(p.text));
      const timed = w.passages.some((p) => p.locator === `drive:${P.gxVideo}#t=95`);
      const real = w.passages.every((p) => {
        const t = fileText(w, p.registerId);
        return t !== null && t.includes(p.text) && p.locator.startsWith(`drive:${w.entry(p.registerId).location.path}#`);
      });
      return all && paged && timed && real;
    }),
    describe: (w) => w.passages.map((p) => p.locator).join(", ") || "no passages",
  },
  {
    checkId: "search-finds-never-answers",
    // 7. Tom on J-3104 (HPW-270) asks about an E07; the GX-26 manual also has an E07 and must not come back.
    //    Dan on J-3140 (RX-40, no manual held) asks about clearances; Tom asks the heat pump about something no manual covers.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      w.found = await b.search(w.ports(), "showing error E07, what do I check", { jobId: "J-3104" }, CONFIG);
      w.noManual = await b.search(w.ports(), "minimum clearances around the outdoor unit", { jobId: "J-3140" }, CONFIG);
      w.noPage = await b.search(w.ports(), "wifi pairing app setup", { jobId: "J-3104" }, CONFIG);
      w.sheet = b.pageSheet("J-3104", [w.found, w.noPage]);
    },
    holds: strict((w) => {
      if (w.searches.length !== 3) return false;
      const [hit, none, miss] = w.searches;
      if ([hit, none, miss].some((s) => s.result.composed !== null) || hit.result.passages.length === 0) return false;
      const each = hit.result.passages.every((p) => {
        const e = w.entry(p.registerId);
        const t = fileText(w, p.registerId);
        return !!e && e.status === "current" && e.kind === "instrument" && LOCATOR_RE.test(p.locator ?? "") && t !== null && t.includes(p.text) && /HPW-270/.test(t);
      });
      const exactPages =
        hit.result.passages.some((p) => p.locator === `drive:${P.hpInstall}#page=14` && p.page === 14 && p.edition === "Rev C") &&
        hit.result.passages.some((p) => p.locator === `drive:${P.hpService}#page=11` && p.page === 11 && p.edition === "Rev B");
      const otherUnit = hit.result.passages.some((p) => p.locator?.includes("GX-26") || /flame failure/.test(p.text));
      const copy = hit.result.passages.some((p) => p.locator?.includes("Inbox attachments"));
      const noManual = none.result.passages.length === 0 && w.noManual?.reply === "We hold no manual for the unit on this job. Nothing on the register covers it.";
      const noPage = miss.result.passages.length === 0 && w.noPage?.reply === "Nothing in the manuals we hold for this unit covers that question.";
      const sheet = w.sheet?.path === "Jobs/J-3104/manual-pages.txt" && w.sheet.lines.some((l) => l.endsWith(`drive:${P.hpInstall}#page=14`));
      return each && exactPages && !otherUnit && !copy && noManual && noPage && sheet;
    }),
    describe: (w) =>
      w.searches.map((s) => `"${s.query}": ${s.result.passages.length} passage(s) ${s.result.passages.map((p) => p.locator).join(", ")}; composed ${JSON.stringify(s.result.composed)}`).join(" | ") || "no search",
  },
  {
    checkId: "missing-is-a-gap-with-an-owner",
    // 8. The office expects the HPW-270 service manual at Rev C (the drive holds Rev B) and the RX-40 install manual (not held).
    world: () => world({ expected: ["HPW-270 service manual | Rev C", "HPW-270 install manual | Rev C", "RX-40 install manual", "Commissioning sheet"] }),
    drive: (b, w) => b(w.ports(), { ...CONFIG, issuerHeld: [] }),
    holds: strict((w) => {
      const svc = w.gaps.filter((g) => g.expected === "HPW-270 service manual | Rev C");
      const rx = w.gaps.filter((g) => g.expected === "RX-40 install manual");
      const future = (g) => isDate(g.due) && Date.parse(g.due) > NOW.getTime();
      const good = svc.length === 1 && svc[0].owner === "Tom Reilly" && future(svc[0]) && rx.length === 1 && rx[0].owner === "Dan Kowalski" && future(rx[0]);
      const noFalse = !w.gaps.some((g) => g.expected.startsWith("HPW-270 install manual") || g.expected.startsWith("Commissioning sheet"));
      return good && noFalse && w.gaps.every((g) => PEOPLE.includes(g.owner) && isDate(g.due));
    }),
    describe: (w) => w.gaps.map((g) => `${g.expected} -> ${g.owner} by ${g.due}`).join("; ") || "no tasks",
  },
  {
    checkId: "watch-on-a-schedule",
    // 9. Intake, a quiet run, then the manufacturer's Rev C service manual lands on the drive, then the next run.
    //    The RX-40 manual is held only on the manufacturer's portal: a recheck task to Dan every run.
    world: () => world(),
    drive: async (b, w) => {
      await runs(b, w, ["intake", "watch-quiet", (x) => x.replaceOnDrive(P.hpService, HP_SERVICE_C, CK.hpServiceC, "Rev C"), "watch-changed"]);
      w.after = await b.search(w.ports(), "E07 flow sensor", { jobId: "J-3104" }, CONFIG);
    },
    holds: strict((w) => {
      if (!w.marks || w.marks.length !== 4) return false;
      const registered = w.register.map((e) => e.location.path);
      if (registered.length < 8) return false;
      const readsAll = (i) => {
        const fetched = new Set(slice(w, i).filter((c) => c.port === "read_file" && c.request.fetch).map((c) => c.request.fetch));
        return registered.every((p) => fetched.has(p));
      };
      const e = byPath(w, P.hpService);
      if (!e) return false;
      const updated = e.checksum === CK.hpServiceC && e.edition === "Rev C" && e.supersededChecksums.includes(CK.hpService) && e.status === "current";
      const told = slice(w, 2).some((c) => c.port === "notify" && c.request.registerId === e.id && c.request.owner === "Tom Reilly" && c.request.detail.includes(e.title));
      const quiet = !slice(w, 1).some((c) => c.port === "notify");
      const reindexed = slice(w, 2).some((c) => c.port === "index_passage" && c.request.registerId === e.id);
      const recheck = [0, 1, 2].every((i) => slice(w, i).some((c) => c.port === "raise_task" && c.request.owner === "Dan Kowalski" && /recheck RX-40/.test(c.request.expected)));
      const s = w.searches.at(-1);
      const showsNew = !!s && s.result.passages.some((p) => p.registerId === e.id && p.edition === "Rev C" && /flow sensor/.test(p.text));
      return readsAll(1) && readsAll(2) && updated && told && quiet && reindexed && recheck && showsNew;
    }),
    describe: (w) => {
      const e = byPath(w, P.hpService);
      return `${e ? `${e.checksum} ${e.edition} superseded ${JSON.stringify(e.supersededChecksums)}` : "no entry"}; notifications ${w.notifications.map((n) => `${n.owner}/${n.registerId}`).join(", ") || "none"}`;
    },
  },
  {
    checkId: "retention-follows-kind",
    // 10. The register read back after the Rev C service manual lands.
    world: () => world(),
    drive: (b, w) => runs(b, w, ["intake", (x) => x.replaceOnDrive(P.hpService, HP_SERVICE_C, CK.hpServiceC, "Rev C"), "watch"]),
    holds: strict((w) => {
      const customer = w.register.filter((e) => e.kind === "customer_material");
      const instruments = w.register.filter((e) => e.kind === "instrument");
      if (customer.length === 0 || instruments.length < 4) return false;
      const custOk = customer.every((e) => Array.isArray(e.accessList) && e.accessList.length > 0 && isDate(e.expiresOn) && Date.parse(e.expiresOn) > NOW.getTime());
      const m = byPath(w, P.hpService);
      const kept = !!m && m.checksum === CK.hpServiceC && m.edition === "Rev C" && m.supersededChecksums.includes(CK.hpService) && w.register.filter((e) => e.title === "HPW-270 service manual").length === 1;
      const othersNoExpiry = w.register.filter((e) => e.kind !== "customer_material").every((e) => e.expiresOn === undefined);
      return custOk && kept && othersNoExpiry;
    }),
    describe: (w) => w.register.map((e) => `${e.kind}:${e.title} exp ${e.expiresOn ?? "-"} sup ${e.supersededChecksums.length}`).join("; "),
  },
  {
    checkId: "handover-carries-the-register",
    // 11. Leah promotes the HPW-270 install manual; an unregistered file, an unsigned promotion and a moved manual are refused.
    world: () => world(),
    drive: async (b, w) => {
      await b(w.ports(), CONFIG);
      const manual = w.register.find((e) => e.location.path === P.hpInstall);
      await b.promote(w.ports(), manual ? manual.id : "unknown", "Leah Morgan", CONFIG);
      await b.promote(w.ports(), "MD:drive:Downloads/random-manual.pdf", "Leah Morgan", CONFIG);
      const gx = w.register.find((e) => e.location.path === P.gxService);
      await b.promote(w.ports(), gx ? gx.id : "unknown", null, CONFIG);
      const svc = w.register.find((e) => e.location.path === P.hpService);
      w.replaceOnDrive(P.hpService, HP_SERVICE_C, CK.hpServiceC, "Rev C");
      await b.promote(w.ports(), svc ? svc.id : "unknown", "Tom Reilly", CONFIG);
    },
    holds: strict((w) => {
      const m = byPath(w, P.hpInstall);
      if (!m || w.handovers.length !== 1) return false;
      const h = w.handovers[0];
      return (
        h.registerId === m.id &&
        h.edition === "Rev C" &&
        h.edition === m.edition &&
        h.checksum === m.checksum &&
        typeof h.locatorScheme === "string" &&
        h.locatorScheme.length > 0 &&
        h.promotedBy === "Leah Morgan" &&
        w.escalations.length === 3
      );
    }),
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

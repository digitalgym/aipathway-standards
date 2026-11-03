/**
 * One scenario per check of rejected-pack-build-standard, for Vendor Pack.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded trace and what it recorded
 * through its ports), never the build's own memory, and returns a strict
 * true or false.
 */

import { PackWorld } from "@aipathway/conformance";
import { versionOf } from "./build.mjs";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock

// The obligation graph's rules, dated. Public liability was superseded on
// 1 September 2026: follow-up moves from 30 to 45 days before expiry.
const RULES = [
  { id: "contractor_licence", version: "v1", effectiveFrom: "2024-07-01T00:00:00.000Z", dueDays: -30, text: "A vendor doing building work in Queensland holds a current QBCC licence for the class of work (QBCC Act 1991 (Qld) s 42)." },
  { id: "public_liability", version: "v1", effectiveFrom: "2024-07-01T00:00:00.000Z", dueDays: -30, supersededBy: "v2", text: "A vendor attending site holds public liability cover of at least $10m (vendor terms cl 7.1, 2024 edition)." },
  { id: "public_liability", version: "v2", effectiveFrom: "2026-09-01T00:00:00.000Z", dueDays: -45, text: "A vendor attending site holds public liability cover of at least $20m (vendor terms cl 7.1, 2026 edition)." },
  { id: "workers_comp", version: "v1", effectiveFrom: "2024-07-01T00:00:00.000Z", dueDays: -30, text: "A vendor that employs workers holds a current WorkCover Queensland policy (Workers' Compensation and Rehabilitation Act 2003 (Qld) s 48)." },
];

/** A vendor with a full, current, high-confidence set of papers. Overrides per scenario. */
function vendorFacts(vid, pid, over = {}) {
  const base = {
    [`pack.${pid}.vendor`]: vid,
    [`vendor.${vid}.abn`]: "51 824 753 556",
    [`vendor.${vid}.abn_status`]: "active",
    [`vendor.${vid}.legal_name`]: "Harbour Line Plumbing Pty Ltd",
    [`vendor.${vid}.trading_address`]: "14 Wharf St, Maryborough QLD 4650",
    [`vendor.${vid}.state`]: "QLD",
    [`vendor.${vid}.work_type`]: "plumbing",
    [`vendor.${vid}.workers`]: "4",
    [`vendor.${vid}.exception_owner`]: "Priya, accounts",
    [`vendor.${vid}.docs`]: `${vid}-LIC,${vid}-PL,${vid}-WC`,
  };
  const doc = (id, cls, number, expires) => ({
    [`doc.${id}.class`]: cls,
    [`doc.${id}.class.conf`]: "0.98",
    [`doc.${id}.holder_name`]: "Harbour Line Plumbing Pty Ltd",
    [`doc.${id}.holder_name.conf`]: "0.97",
    [`doc.${id}.abn`]: "51824753556",
    [`doc.${id}.abn.conf`]: "0.99",
    [`doc.${id}.number`]: number,
    [`doc.${id}.number.conf`]: "0.96",
    [`doc.${id}.expires_on`]: expires,
    [`doc.${id}.expires_on.conf`]: "0.95",
    [`doc.${id}.file`]: `https://drive.google.com/file/d/${id}-internal/view`,
  });
  return {
    ...base,
    ...doc(`${vid}-LIC`, "contractor_licence", "QBCC 1298345", "2027-06-30T00:00:00.000Z"),
    ...doc(`${vid}-PL`, "public_liability", "PL-88213-04", "2027-03-31T00:00:00.000Z"),
    ...doc(`${vid}-WC`, "workers_comp", "WC-5521907", "2027-01-31T00:00:00.000Z"),
    ...over,
  };
}

const world = (facts, packs, now = NOW) => new PackWorld({ now, facts, rules: RULES.map((r) => ({ ...r })), packs });
const gateCalls = (w, pid) => w.calls.filter((c) => c.port === "gate" && c.request?.packId === pid && "check" in (c.request ?? {}));
const artefactsOf = (w, pid) => w.artefacts.filter((a) => a.packId === pid);
const BANNED = /\b(compliant|compliance (is )?(met|achieved|confirmed)|fully covered|certified|guaranteed|approved|all clear|meets all)\b/i;

/** A released pack: the person accepts the version the build would compute from these facts. */
function released(vid, pid, over = {}, person = "Sam Okafor, operations manager") {
  const f = vendorFacts(vid, pid, over);
  return { ...f, [`release.${pid}.person`]: person, [`release.${pid}.accepted`]: versionOf(f, vid), [`pack.${pid}.handover_to`]: "Coastline Builders site office" };
}

export const scenarios = [
  {
    checkId: "one-graph",
    // 1. The vendor's trading address changes once, with three open artefacts carrying it.
    world: () => world(vendorFacts("V-101", "P-101"), [{ id: "P-101", subjectId: "V-101" }]),
    drive: async (b, w) => {
      await b(w.ports());
      w.changeFact("vendor.V-101.trading_address", "Unit 3, 9 Industrial Ave, Hervey Bay QLD 4655");
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const arts = artefactsOf(w, "P-101");
      const carrying = arts.filter((a) => a.refs.includes("vendor.V-101.trading_address") || a.literal !== undefined);
      if (carrying.length < 2) return false;
      return carrying.every((a) => {
        const text = w.renderStored(a.id) ?? "";
        return text.includes("Hervey Bay") && !text.includes("Wharf St");
      });
    },
    describe: (w) => artefactsOf(w, "P-101").map((a) => `${a.id}: ${w.renderStored(a.id)}`).join(" | ") || "no artefacts",
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. A run before 1 September 2026, then the clock passes the new public liability rule.
    world: () => world(vendorFacts("V-102", "P-102"), [{ id: "P-102", subjectId: "V-102" }], new Date("2026-08-25T00:00:00.000Z")),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(27 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const expiry = "2027-03-31T00:00:00.000Z";
      const due = w.calls.filter((c) => c.port === "read_rule" && c.request?.ruleId === "public_liability" && c.request?.triggeredAt === expiry);
      if (due.length < 2) return false;
      const first = due[0].response;
      const last = due[due.length - 1].response;
      if (!first || !last || first.version !== "v1" || last.version !== "v2") return false;
      const moved = (new Date(first.date) - new Date(last.date)) / DAY === 15;
      const pack = w.packById("P-102");
      const plClauses = (pack?.clauses ?? []).filter((c) => c.sourceRuleId === "public_liability");
      const latest = plClauses[plClauses.length - 1];
      const latestCites = latest !== undefined && latest.text.includes(last.date.slice(0, 10)) && latest.text.includes("v2");
      const oldReadable = w.calls.some((c) => c.port === "read_rule" && c.response?.rules === RULES.length);
      return moved && latestCites && oldReadable;
    },
    describe: (w) =>
      w.calls
        .filter((c) => c.port === "read_rule" && c.request?.ruleId === "public_liability")
        .map((c) => `${c.at.slice(0, 10)} -> ${c.response?.version} ${c.response?.date?.slice(0, 10)}`)
        .join("; ") || "no due-date reads",
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A sole-trader office cleaner: no QBCC licence and no workers' compensation apply.
    world: () =>
      world(
        vendorFacts("V-103", "P-103", {
          "vendor.V-103.work_type": "office cleaning",
          "vendor.V-103.workers": "0",
          "vendor.V-103.docs": "V-103-PL",
        }),
        [{ id: "P-103", subjectId: "V-103" }],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const nos = w.notApplicable.filter((n) => n.subjectId === "V-103");
      const licence = nos.some((n) => /licence/i.test(n.reason) && /because/i.test(n.reason) && /\bs \d+/.test(n.reason));
      const wc = nos.some((n) => /workers' compensation/i.test(n.reason) && /because/i.test(n.reason) && /\bs \d+/.test(n.reason));
      const pack = w.packById("P-103");
      return licence && wc && pack !== undefined && pack.failedCheck === undefined;
    },
    describe: (w) => w.notApplicable.map((n) => n.reason).join(" | ") || "no written not-applicable",
  },
  {
    checkId: "eight-checks-in-order",
    // 4. A cancelled ABN (check 1) and an expired public liability certificate (check 2).
    world: () =>
      world(
        vendorFacts("V-104", "P-104", {
          "vendor.V-104.abn_status": "cancelled",
          "doc.V-104-PL.expires_on": "2026-08-31T00:00:00.000Z",
        }),
        [{ id: "P-104", subjectId: "V-104" }],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-104");
      if (!pack || pack.failedCheck !== "identity" || pack.queue !== "fail") return false;
      const move = pack.history.find((h) => h.to === "fail");
      const why = move !== undefined && /ABN/.test(move.reason) && /cancelled/.test(move.reason);
      const laterPassed = gateCalls(w, "P-104").some((c) => c.request.check !== "identity" && c.request.passed === true);
      return why && !laterPassed;
    },
    describe: (w) => {
      const p = w.packById("P-104");
      return `failed ${p?.failedCheck ?? "nothing"}; history ${JSON.stringify(p?.history ?? [])}`;
    },
  },
  {
    checkId: "four-queues",
    // 5. An expired workers' compensation policy, released by a person and asked for by a builder anyway.
    world: () =>
      world(released("V-105", "P-105", { "doc.V-105-WC.expires_on": "2026-09-10T00:00:00.000Z" }), [{ id: "P-105", subjectId: "V-105" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-105");
      const attempts = w.handovers.filter((h) => h.packId === "P-105");
      return (
        pack !== undefined &&
        pack.queue === "fail" &&
        pack.failedCheck === "tickets" &&
        pack.handedOver !== true &&
        pack.versionRecord === undefined &&
        attempts.length > 0 &&
        attempts.every((h) => h.ok === false)
      );
    },
    describe: (w) => `queue ${w.packById("P-105")?.queue}; handovers ${JSON.stringify(w.handovers)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Two fields read at low confidence, everything else clean.
    world: () =>
      world(
        vendorFacts("V-106", "P-106", { "doc.V-106-PL.expires_on.conf": "0.55", "doc.V-106-WC.number.conf": "0.71" }),
        [{ id: "P-106", subjectId: "V-106" }],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-106");
      if (!pack) return false;
      const both = pack.yellowFields.includes("V-106-PL.expires_on") && pack.yellowFields.includes("V-106-WC.number");
      const onlyThose = pack.yellowFields.every((f) => f === "V-106-PL.expires_on" || f === "V-106-WC.number");
      return both && onlyThose && pack.queue === "yellow" && pack.versionRecord === undefined && pack.handedOver !== true;
    },
    describe: (w) => {
      const p = w.packById("P-106");
      return `queue ${p?.queue}; yellow ${JSON.stringify(p?.yellowFields ?? [])}`;
    },
  },
  {
    checkId: "named-human-gate",
    // 7. A Yellow pack. First a release with no person named, then a named person accepts it.
    world: () => {
      const f = vendorFacts("V-107", "P-107", { "doc.V-107-PL.number.conf": "0.6", "pack.P-107.handover_to": "Coastline Builders site office" });
      return world({ ...f, "release.P-107.person": "", "release.P-107.accepted": versionOf(f, "V-107") }, [{ id: "P-107", subjectId: "V-107" }]);
    },
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(60 * 60 * 1000);
      w.changeFact("release.P-107.person", "Sam Okafor, operations manager");
      await b(w.ports());
    },
    holds: (w) => {
      const pack = w.packById("P-107");
      if (!pack || !pack.versionRecord) return false;
      const leftYellow = pack.history.filter((h) => h.from === "yellow" && h.to === "pass");
      if (leftYellow.length !== 1) return false;
      const rec = pack.versionRecord;
      const named = rec.person === "Sam Okafor, operations manager";
      const timed = rec.at === leftYellow[0].at && rec.at > NOW.toISOString();
      const content = rec.accepted.startsWith("V-107@") && rec.accepted.length > "V-107@".length;
      const yellowBeforeName = !w.calls.some((c) => c.port === "gate" && c.request?.packId === "P-107" && c.request?.person && c.at === NOW.toISOString());
      return named && timed && content && yellowBeforeName && pack.handedOver === true;
    },
    describe: (w) => {
      const p = w.packById("P-107");
      return `queue ${p?.queue}; record ${JSON.stringify(p?.versionRecord ?? null)}`;
    },
  },
  {
    checkId: "as-of-and-citations",
    // 8. A full pack: three derived clauses, one per applicable obligation.
    world: () => world(vendorFacts("V-108", "P-108"), [{ id: "P-108", subjectId: "V-108" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-108");
      if (!pack || pack.clauses.length < 3 || !pack.asOf) return false;
      const ids = new Set(RULES.map((r) => r.id));
      return pack.clauses.every((c) => typeof c.sourceRuleId === "string" && ids.has(c.sourceRuleId)) && !Number.isNaN(Date.parse(pack.asOf));
    },
    describe: (w) => {
      const p = w.packById("P-108");
      return `as of ${p?.asOf ?? "none"}; ${(p?.clauses ?? []).map((c) => `[${c.sourceRuleId ?? "UNCITED"}]`).join(" ")}`;
    },
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. A released pack handed cold to a builder's site office.
    world: () => world(released("V-109", "P-109"), [{ id: "P-109", subjectId: "V-109" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-109");
      if (!pack || pack.handedOver !== true) return false;
      const handoverArts = artefactsOf(w, "P-109").filter((a) => a.id.endsWith(".handover"));
      if (handoverArts.length !== 1) return false;
      const text = w.renderStored(handoverArts[0].id) ?? "";
      const needed = ["Harbour Line Plumbing Pty Ltd", "51 824 753 556", "QBCC 1298345", "PL-88213-04", "WC-5521907", "2027-06-30", "2027-03-31", "2027-01-31", "Sam Okafor"];
      return needed.every((s) => text.includes(s)) && !/https?:\/\//.test(text);
    },
    describe: (w) => {
      const a = artefactsOf(w, "P-109").find((x) => x.id.endsWith(".handover"));
      return a ? `handover: ${w.renderStored(a.id)}` : "no handover artefact";
    },
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. A passing, released pack: every string the build shows for it.
    world: () => world(released("V-110", "P-110"), [{ id: "P-110", subjectId: "V-110" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-110");
      if (!pack || pack.queue !== "pass" || w.copy.length === 0) return false;
      const saysAsOf = w.copy.some((s) => /\bcurrent as of\b/i.test(s));
      return saysAsOf && w.copy.every((s) => !BANNED.test(s));
    },
    describe: (w) => w.copy.join(" | ") || "no copy published",
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A pack processed end to end, released and handed over.
    world: () => world(released("V-111", "P-111"), [{ id: "P-111", subjectId: "V-111" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const pack = w.packById("P-111");
      if (!pack || pack.handedOver !== true || w.retained.length === 0) return false;
      const values = Object.values(released("V-111", "P-111")).filter((v) => v.length >= 4);
      return w.retained.every((r) => values.every((v) => !r.content.includes(v) && !r.what.includes(v)));
    },
    describe: (w) => w.retained.map((r) => `${r.what}: ${r.content}`).join(" | ") || "nothing retained or declared",
  },
  {
    checkId: "hard-step-is-named",
    // 12. Which step does the build treat as the binding layer?
    world: () => world(vendorFacts("V-112", "P-112"), [{ id: "P-112", subjectId: "V-112" }]),
    drive: (b, w) => b(w.ports()),
    holds: (w) => typeof w.hardStep === "string" && /binding layer/i.test(w.hardStep) && /named person/i.test(w.hardStep),
    describe: (w) => `hard step: ${w.hardStep ?? "not named"}`,
  },
];

// Only in production, against the live document store and graph. On the stub
// the runner reports this as with_us: it is the scoped build.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 13. A real address change in the live graph, and a real fail-queue pack.
    world: () => new PackWorld(),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const failed = w.packs.filter((p) => p.queue === "fail");
      const noneLeft = failed.length > 0 && failed.every((p) => p.handedOver !== true);
      const fresh = w.artefacts.length > 0 && w.artefacts.every((a) => a.literal === undefined);
      return noneLeft && fresh;
    },
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

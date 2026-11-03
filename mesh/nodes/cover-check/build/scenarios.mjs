/**
 * One scenario per check of rejected-pack-build-standard, for Cover Check.
 *
 * Scaffolded by `npx @aipathway/conformance init rejected-pack-build-standard`
 * from https://aipathway.com.au/explore-ai/rejected-pack-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The world is a Queensland property management agency and the contractors it
 * sends onto managed properties. Every `holds` reads what the world recorded
 * through its ports, never the build's own memory, and returns a strict boolean.
 */

import { PackWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
const NOW = new Date("2026-09-21T00:00:00.000Z"); // the world's default clock
const inDays = (n) => new Date(NOW.getTime() + n * DAY).toISOString();

const RULES = [
  { id: "agency.public-liability-minimum", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "Every contractor holds public liability cover, minimum 20000000 dollars, per the agency's contractor policy." },
  { id: "qld.workcover", version: "2003-act", effectiveFrom: "2003-07-01T00:00:00.000Z", dueDays: 0, text: "Workers' Compensation and Rehabilitation Act 2003 (Qld): an employer of workers holds a WorkCover Queensland policy." },
  { id: "qld.qbcc-licence", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", dueDays: 0, text: "QBCC Act 1991 (Qld): building work over 3300 dollars needs a QBCC licence of the right class." },
  { id: "agency.coi-renewal-request", version: "2025-07", effectiveFrom: "2025-07-01T00:00:00.000Z", supersededBy: "2026-10", dueDays: -30, text: "Request a renewal certificate 30 days before expiry." },
  { id: "agency.coi-renewal-request", version: "2026-10", effectiveFrom: "2026-10-01T00:00:00.000Z", dueDays: -45, text: "Request a renewal certificate 45 days before expiry." },
];

const AGENCY = {
  "agency:trading_name": "Harbourside Property Management",
  "agency:abn": "51 824 753 556",
  "agency:trading_address": "12 Esplanade, Cairns City QLD 4870",
};

/** A contractor record in the graph, with its extracted certificate fields. */
function contractor(v, over = {}) {
  return {
    [`${v}:legal_name`]: "Reef Coast Plumbing Pty Ltd",
    [`${v}:abn`]: "33 102 417 032",
    [`${v}:abn_status`]: "active",
    [`${v}:state`]: "QLD",
    [`${v}:work_type`]: "plumbing",
    [`${v}:has_workers`]: "yes",
    [`${v}:pl:insurer`]: "QBE Insurance (Australia) Limited",
    [`${v}:pl:policy_no`]: "PL-4471902",
    [`${v}:pl:cover_amount`]: "20000000",
    [`${v}:pl:expires_on`]: inDays(200),
    [`${v}:pl:insured_name`]: "Reef Coast Plumbing Pty Ltd",
    [`${v}:pl:insured_abn`]: "33 102 417 032",
    [`${v}:pl:evidence`]: "https://harbourside.sharepoint.com/sites/contractors/Reef%20Coast/COI-2026.pdf",
    [`${v}:pl:message_id`]: "msg-18c2f0a1",
    [`${v}:wc:insurer`]: "WorkCover Queensland",
    [`${v}:wc:policy_no`]: "WC-0099812",
    [`${v}:wc:expires_on`]: inDays(150),
    [`${v}:wc:insured_name`]: "Reef Coast Plumbing Pty Ltd",
    [`${v}:wc:insured_abn`]: "33 102 417 032",
    [`${v}:wc:evidence`]: "https://harbourside.sharepoint.com/sites/contractors/Reef%20Coast/WC-2026.pdf",
    [`${v}:qbcc:licence_no`]: "1298374",
    [`${v}:qbcc:class`]: "Plumbing and drainage",
    [`${v}:qbcc:expires_on`]: inDays(300),
    ...over,
  };
}

/** A cleaner: sole trader, no workers, not building work. */
const cleaner = (v) =>
  contractor(v, {
    [`${v}:legal_name`]: "Mia Tran",
    [`${v}:abn`]: "64 552 018 993",
    [`${v}:work_type`]: "cleaning",
    [`${v}:has_workers`]: "no",
    [`${v}:pl:insured_name`]: "Mia Tran",
    [`${v}:pl:insured_abn`]: "64 552 018 993",
    [`${v}:wc:insurer`]: undefined,
    [`${v}:wc:policy_no`]: undefined,
    [`${v}:wc:expires_on`]: undefined,
    [`${v}:wc:insured_name`]: undefined,
    [`${v}:wc:insured_abn`]: undefined,
    [`${v}:wc:evidence`]: undefined,
    [`${v}:qbcc:licence_no`]: undefined,
    [`${v}:qbcc:class`]: undefined,
    [`${v}:qbcc:expires_on`]: undefined,
  });

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
const world = (facts, packs) => new PackWorld({ rules: RULES, facts: clean({ ...AGENCY, ...facts }), packs });
const one = (v, packId = `P-${v}`) => ({ packs: [{ packId, vendorId: v }] });
const releasedBy = (packId, person) => ({ releases: { [packId]: { person } } });
const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const STRICT = (x) => x === true;

export const scenarios = [
  {
    checkId: "one-graph",
    // 1. The agency's trading address changes once, with the pack's artefacts open.
    world: () => world(contractor("V-101"), [{ id: "P-V-101", subjectId: "V-101" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("V-101"), ...releasedBy("P-V-101", "Sam Nguyen, senior property manager") });
      w.changeFact("agency:trading_address", "Level 2, 88 Abbott Street, Cairns City QLD 4870");
      await b(w.ports(), one("V-101")); // the next run re-reads; nothing is re-typed
    },
    holds: (w) => {
      const open = w.artefacts.filter((a) => a.packId === "P-V-101");
      const carrying = open.filter((a) => a.refs.includes("agency:trading_address") || a.literal !== undefined);
      if (carrying.length < 3) return false;
      const texts = carrying.map((a) => w.renderStored(a.id) ?? "");
      return STRICT(texts.every((t) => t.includes("88 Abbott Street") && !t.includes("12 Esplanade")));
    },
    describe: (w) => `artefacts: ${w.artefacts.map((a) => `${a.id} -> ${w.renderStored(a.id)?.slice(0, 60)}`).join(" | ")}`,
  },
  {
    checkId: "rules-have-effective-dates",
    // 2. The renewal-request rule is superseded on 1 October; the clock passes it between runs.
    world: () => world(contractor("V-201"), [{ id: "P-V-201", subjectId: "V-201" }]),
    drive: async (b, w) => {
      await b(w.ports(), one("V-201"));
      w.advance(12 * DAY); // 3 October: the 2026-10 version is in force
      await b(w.ports(), one("V-201"));
    },
    holds: (w) => {
      const due = callsTo(w, "read_rule", (c) => c.request?.ruleId === "agency.coi-renewal-request").map((c) => c.response);
      if (due.length !== 2 || !due[0] || !due[1]) return false;
      const moved = due[0].version === "2025-07" && due[1].version === "2026-10" && (new Date(due[0].date) - new Date(due[1].date)) / DAY === 15;
      const listed = callsTo(w, "read_rule", (c) => c.request?.ruleId === undefined).every((c) => c.response?.rules === RULES.length);
      const cited = w.packById("P-V-201").clauses.some((c) => c.sourceRuleId === "agency.coi-renewal-request" && c.text.includes("2026-10") && c.text.includes(due[1].date.slice(0, 10)));
      return STRICT(moved && listed && cited);
    },
    describe: (w) => `renewal due: ${callsTo(w, "read_rule", (c) => c.request?.ruleId === "agency.coi-renewal-request").map((c) => JSON.stringify(c.response)).join(" then ")}`,
  },
  {
    checkId: "applicability-can-say-no",
    // 3. A sole-trader cleaner: no workers, not building work. Public liability still applies.
    world: () => world(cleaner("V-301"), [{ id: "P-V-301", subjectId: "V-301" }]),
    drive: (b, w) => b(w.ports(), one("V-301")),
    holds: (w) => {
      const no = w.notApplicable.filter((n) => n.subjectId === "V-301");
      const wc = no.find((n) => /workers' compensation/i.test(n.reason) && /because/i.test(n.reason) && /qld\.workcover/.test(n.reason));
      const qb = no.find((n) => /QBCC/.test(n.reason) && /because/i.test(n.reason) && /qld\.qbcc-licence/.test(n.reason));
      const plStillRequired = !no.some((n) => /public liability/i.test(n.reason));
      const pack = w.packById("P-V-301");
      return STRICT(Boolean(wc && qb) && plStillRequired && pack.failedCheck === undefined);
    },
    describe: (w) => `written no: ${w.notApplicable.map((n) => n.reason).join(" / ") || "none"}; queue ${w.packById("P-V-301").queue}`,
  },
  {
    checkId: "eight-checks-in-order",
    // 4. Cancelled ABN (check 1) and an expired public liability certificate (check 2).
    world: () =>
      world(contractor("V-401", { "V-401:abn_status": "cancelled", "V-401:pl:expires_on": inDays(-10) }), [{ id: "P-V-401", subjectId: "V-401" }]),
    drive: (b, w) => b(w.ports(), one("V-401")),
    holds: (w) => {
      const pack = w.packById("P-V-401");
      const checks = callsTo(w, "gate", (c) => c.request?.packId === "P-V-401" && c.request?.check).map((c) => c.request.check);
      const reasons = pack.history.length > 0 && pack.history.every((m) => typeof m.reason === "string" && m.reason.length > 0);
      return STRICT(pack.failedCheck === "identity" && pack.queue === "fail" && reasons && checks[0] === "identity" && !checks.includes("tickets"));
    },
    describe: (w) => `failed at ${w.packById("P-V-401").failedCheck}; history ${JSON.stringify(w.packById("P-V-401").history)}`,
  },
  {
    checkId: "four-queues",
    // 5. A certificate that expired yesterday, a person ready to release it, then a handover attempt.
    world: () => world(contractor("V-501", { "V-501:pl:expires_on": inDays(-1) }), [{ id: "P-V-501", subjectId: "V-501" }]),
    drive: async (b, w) => {
      await b(w.ports(), { ...one("V-501"), ...releasedBy("P-V-501", "Sam Nguyen, senior property manager") });
      await b.handover(w.ports(), "P-V-501");
    },
    holds: (w) => {
      const pack = w.packById("P-V-501");
      const tried = w.handovers.filter((h) => h.packId === "P-V-501");
      return STRICT(pack.queue === "fail" && pack.failedCheck === "tickets" && tried.length > 0 && tried.every((h) => h.ok === false) && pack.handedOver !== true && !pack.versionRecord);
    },
    describe: (w) => `queue ${w.packById("P-V-501").queue} (${w.packById("P-V-501").failedCheck}); handovers ${JSON.stringify(w.handovers)}`,
  },
  {
    checkId: "yellow-is-visible",
    // 6. Two fields read off a blurry scan at 0.55 and 0.62; everything else is clean.
    world: () =>
      world(contractor("V-601", { "V-601:pl:insurer#confidence": "0.55", "V-601:pl:policy_no#confidence": "0.62", "V-601:pl:expires_on#confidence": "0.97" }), [
        { id: "P-V-601", subjectId: "V-601" },
      ]),
    drive: (b, w) => b(w.ports(), one("V-601")),
    holds: (w) => {
      const pack = w.packById("P-V-601");
      const marked = ["V-601:pl:insurer", "V-601:pl:policy_no"].every((f) => pack.yellowFields.includes(f));
      return STRICT(marked && !pack.yellowFields.includes("V-601:pl:expires_on") && pack.queue === "yellow" && !pack.versionRecord && !pack.handedOver);
    },
    describe: (w) => `yellow ${JSON.stringify(w.packById("P-V-601").yellowFields)}; queue ${w.packById("P-V-601").queue}`,
  },
  {
    checkId: "named-human-gate",
    // 7. A Yellow pack: no release, then a release with no name, then a named release.
    world: () => world(contractor("V-701", { "V-701:pl:insurer#confidence": "0.6" }), [{ id: "P-V-701", subjectId: "V-701" }]),
    drive: async (b, w) => {
      const snap = () => ({ queue: w.packById("P-V-701").queue, record: w.packById("P-V-701").versionRecord ?? null });
      w.snaps = [];
      await b(w.ports(), one("V-701"));
      w.snaps.push(snap());
      await b(w.ports(), { ...one("V-701"), ...releasedBy("P-V-701", "") });
      w.snaps.push(snap());
      w.advance(60 * 60 * 1000);
      await b(w.ports(), { ...one("V-701"), ...releasedBy("P-V-701", "Sam Nguyen, senior property manager") });
      w.snaps.push(snap());
    },
    holds: (w) => {
      const [none, unnamed, named] = w.snaps ?? [];
      if (!none || !unnamed || !named) return false;
      const held = none.queue === "yellow" && none.record === null && unnamed.queue === "yellow" && unnamed.record === null;
      const r = named.record;
      const recorded = named.queue === "pass" && r?.person === "Sam Nguyen, senior property manager" && typeof r.at === "string" && r.at === "2026-09-21T01:00:00.000Z" && r.accepted.includes("PL-4471902");
      return STRICT(held && recorded);
    },
    describe: (w) => `states: ${JSON.stringify(w.snaps)}`,
  },
  {
    checkId: "as-of-and-citations",
    // 8. A plumber with three applicable obligations and a renewal date: several derived clauses.
    world: () => world(contractor("V-801"), [{ id: "P-V-801", subjectId: "V-801" }]),
    drive: (b, w) => b(w.ports(), one("V-801")),
    holds: (w) => {
      const pack = w.packById("P-V-801");
      const ruleIds = new Set(RULES.map((r) => r.id));
      return STRICT(pack.clauses.length >= 4 && pack.clauses.every((c) => ruleIds.has(c.sourceRuleId)) && pack.asOf === NOW.toISOString());
    },
    describe: (w) => `clauses ${JSON.stringify(w.packById("P-V-801").clauses)}; as-of ${w.packById("P-V-801").asOf}`,
  },
  {
    checkId: "handover-is-one-artefact",
    // 9. A released pack handed to a builder's site office that has no access to the agency's drive.
    world: () => world(contractor("V-901"), [{ id: "P-V-901", subjectId: "V-901" }]),
    drive: (b, w) => b(w.ports(), { ...one("V-901"), ...releasedBy("P-V-901", "Sam Nguyen, senior property manager") }),
    holds: (w) => {
      const pack = w.packById("P-V-901");
      const handed = w.handovers.filter((h) => h.packId === "P-V-901" && h.ok === true).length === 1;
      const art = w.artefacts.find((a) => a.id === "P-V-901:handover");
      const text = art ? w.renderStored(art.id) ?? "" : "";
      const inside = ["Reef Coast Plumbing Pty Ltd", "33 102 417 032", "PL-4471902", "QBE Insurance", "20000000", "WC-0099812", "1298374", "Harbourside Property Management"].every((s) => text.includes(s));
      const noInsiderLink = !/sharepoint|https?:|\\\\/i.test(text);
      return STRICT(handed && pack.handedOver === true && inside && noInsiderLink);
    },
    describe: (w) => `handover: ${w.renderStored("P-V-901:handover") ?? "none"}`,
  },
  {
    checkId: "copy-does-not-say-compliant",
    // 10. Every string the build shows for a passing, a yellow and a failing contractor.
    world: () =>
      world(
        { ...contractor("V-111"), ...contractor("V-112", { "V-112:pl:insurer#confidence": "0.5" }), ...contractor("V-113", { "V-113:pl:expires_on": inDays(-3) }) },
        [{ id: "P-V-111", subjectId: "V-111" }, { id: "P-V-112", subjectId: "V-112" }, { id: "P-V-113", subjectId: "V-113" }],
      ),
    drive: (b, w) =>
      b(w.ports(), {
        packs: [{ packId: "P-V-111", vendorId: "V-111" }, { packId: "P-V-112", vendorId: "V-112" }, { packId: "P-V-113", vendorId: "V-113" }],
        releases: { "P-V-111": { person: "Sam Nguyen, senior property manager" } },
      }),
    holds: (w) => {
      const pass = w.copy.filter((s) => /current as of/i.test(s));
      // "not cleared to start work" is the one safe use of "cleared"; strip it, then look for any claim.
      const claims = /compliant|compliance (approved|confirmed|met)|fully (insured|covered)|approved to (work|start)|cleared to (work|start)|all clear/i;
      const says = w.copy.some((s) => claims.test(s.replace(/not cleared to start work/gi, "")));
      return STRICT(pass.length >= 1 && w.copy.length >= 2 && !says);
    },
    describe: (w) => `copy: ${JSON.stringify(w.copy)}`,
  },
  {
    checkId: "packs-are-not-training-data",
    // 11. A pack processed end to end, released and handed over.
    world: () => world(contractor("V-121"), [{ id: "P-V-121", subjectId: "V-121" }]),
    drive: (b, w) => b(w.ports(), { ...one("V-121"), ...releasedBy("P-V-121", "Sam Nguyen, senior property manager") }),
    holds: (w) => {
      const done = w.packById("P-V-121").handedOver === true;
      const content = Object.values(contractor("V-121")).filter((x) => typeof x === "string" && x.length >= 6);
      const leaks = w.retained.some((r) => content.some((c) => r.content.includes(c)) || /train/i.test(r.what));
      return STRICT(done && w.retained.length > 0 && !leaks);
    },
    describe: (w) => `retained: ${JSON.stringify(w.retained)}`,
  },
  {
    checkId: "hard-step-is-named",
    // 12. Which step does this build treat as the binding layer?
    world: () => world(contractor("V-131"), [{ id: "P-V-131", subjectId: "V-131" }]),
    drive: (b, w) => b(w.ports(), one("V-131")),
    holds: (w) => STRICT(typeof w.hardStep === "string" && /binding layer/i.test(w.hardStep) && /one graph/i.test(w.hardStep)),
    describe: (w) => `hard step: ${w.hardStep ?? "not named"}`,
  },
];

// The pass test runs against the agency's live graph, as a scoped build.
// On the stub the runner reports it with_us; it is not attempted here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new PackWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

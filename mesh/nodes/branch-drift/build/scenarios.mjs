/**
 * One scenario per check of multi-site-conformance-build-standard, for Branch Drift.
 *
 * Scaffolded by `npx @aipathway/conformance init multi-site-conformance-build-standard`
 * from https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads the world (its recorded calls, reports, proposals,
 * writes and notifications), never the build's own memory, and returns a
 * strict true or false.
 *
 * `drive` hands the build the world's ports. For checks 2 and 9 it also hands
 * the stimulus (field proposals, incoming records) as the run's input; a build
 * that does not route those through the gate leaves no gate call, and the
 * check goes red.
 */

import { MultiSiteWorld } from "@aipathway/conformance";

const DAY = 86_400_000;
// Monday 7am AEST, the scheduled run.
const MONDAY_7AM = new Date("2026-09-20T21:00:00.000Z");

const CONTRACT = {
  version: "2.1",
  effectiveFrom: "2026-07-01T00:00:00.000Z",
  requiredFields: ["site_id", "job_id", "due_date"],
  measures: { overdue_rate: "obligations past due / obligations due, per segment, per period" },
};

const seg = (id, name, owner, gatesLive = true) => ({ id, name, owner, gatesLive });
const rec = (id, accessGroup, typedLabel, fields) => ({ id, accessGroup, typedLabel, fields });
const full = (site) => ({ site_id: site, job_id: "J-1", due_date: "2026-10-01" });

const NOOSA = seg("noosa", "Noosa", "Priya Nair");
const TOOWOOMBA = seg("toowoomba", "Toowoomba", "Sam O'Connell");

const reportsFor = (world, segmentId) => world.reports.filter((r) => r.visibleTo.includes(segmentId));
const findingsFor = (world, segmentId) => reportsFor(world, segmentId).flatMap((r) => r.findings.filter((f) => f.segmentId === segmentId));
const gateCalls = (world) => world.calls.filter((c) => c.port === "gate");

export const scenarios = [
  {
    checkId: "key-contract-versioned",
    // 1. A request for the key contract in force. The run must read it as a
    // versioned document and score against that version.
    world: () => new MultiSiteWorld({ now: MONDAY_7AM, contract: CONTRACT, segments: [NOOSA], records: [rec("R-1", "noosa", "noosa", { site_id: "NSA" })] }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const reads = world.calls.filter((c) => c.port === "read_rule" && c.request?.contract === true);
      const versioned = reads.some((c) => c.response?.version === "2.1" && typeof c.response?.effectiveFrom === "string");
      // The schema finding must have been computed against that version, so the
      // contract was the comparison, not a convention baked into the build.
      const scoredAgainst = findingsFor(world, "noosa").some((f) => f.kind === "schema" && /R-1/.test(f.detail) && /v2\.1/.test(f.detail));
      return versioned && scoredAgainst;
    },
    describe: (world) => `${world.calls.filter((c) => c.port === "read_rule").length} contract read(s); findings ${JSON.stringify(findingsFor(world, "noosa"))}`,
  },
  {
    checkId: "segments-add-not-fork",
    // 2. One branch adds a field, one renames a shared key, one adds a second key for the same thing.
    world: () => new MultiSiteWorld({ now: MONDAY_7AM, contract: CONTRACT, segments: [NOOSA, TOOWOOMBA] }),
    drive: (b, world) =>
      b(world.ports(), {
        proposals: [
          { segmentId: "noosa", field: "local_notes", intent: "add" },
          { segmentId: "toowoomba", field: "site_id", intent: "rename" },
          { segmentId: "noosa", field: "job_id", intent: "fork" },
        ],
      }),
    holds: (world) => {
      const added = world.acceptedProposals.some((p) => p.field === "local_notes" && p.intent === "add");
      const renameRefused = world.refusedProposals.some((r) => r.proposal.intent === "rename" && r.proposal.field === "site_id");
      const forkRefused = world.refusedProposals.some((r) => r.proposal.intent === "fork" && r.proposal.field === "job_id");
      // Refused at validation, not flagged in a report afterwards: the gate call precedes any report.
      const firstGate = world.calls.findIndex((c) => c.port === "gate");
      const firstReport = world.calls.findIndex((c) => c.port === "publish_report" && c.request?.visibleTo);
      const before = firstGate >= 0 && (firstReport < 0 || firstGate < firstReport);
      return added && renameRefused && forkRefused && before && world.acceptedProposals.length === 1;
    },
    describe: (world) => `accepted ${world.acceptedProposals.length}, refused ${world.refusedProposals.map((r) => r.proposal.intent).join(",") || "none"}`,
  },
  {
    checkId: "membership-from-access-group",
    // 3. A record typed as Noosa that sits in Toowoomba's access group, missing a required key.
    world: () =>
      new MultiSiteWorld({
        now: MONDAY_7AM,
        contract: CONTRACT,
        segments: [NOOSA, TOOWOOMBA],
        records: [rec("R-31", "toowoomba", "noosa", { site_id: "TWB", job_id: "J-9" }), rec("R-32", "noosa", "noosa", full("NSA"))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const askedGroup = world.calls.some((c) => c.port === "read_segment" && c.request?.recordId === "R-31");
      const inToowoomba = findingsFor(world, "toowoomba").some((f) => /R-31/.test(f.detail));
      const notInNoosa = !reportsFor(world, "noosa").some((r) => r.findings.some((f) => /R-31/.test(f.detail)));
      return askedGroup && inToowoomba && notInNoosa;
    },
    describe: (world) => `toowoomba: ${JSON.stringify(findingsFor(world, "toowoomba"))}; noosa: ${JSON.stringify(findingsFor(world, "noosa"))}`,
  },
  {
    checkId: "drift-detected-all-four-kinds",
    // 4. One branch seeded with all four kinds; the clock advanced to the scheduled run.
    world: () =>
      new MultiSiteWorld({
        now: new Date(MONDAY_7AM.getTime() - DAY),
        contract: CONTRACT,
        segments: [NOOSA, TOOWOOMBA],
        seededDrift: [
          { segmentId: "noosa", kind: "schema", detail: "record R-41 carries 'siteid' alongside site_id" },
          { segmentId: "noosa", kind: "gate_bypass", detail: "12 due dates typed rather than derived this week" },
          { segmentId: "noosa", kind: "shadow_register", detail: "23 records created between 16:02 and 16:40 Friday after 9 quiet days" },
          { segmentId: "noosa", kind: "silence", detail: "14 obligations fell due, nothing raised in 21 days" },
        ],
      }),
    drive: async (b, world) => {
      world.advance(DAY);
      await b(world.ports());
    },
    holds: (world) => {
      const kinds = new Set(findingsFor(world, "noosa").map((f) => f.kind));
      const allFour = ["schema", "gate_bypass", "shadow_register", "silence"].every((k) => kinds.has(k));
      const onSchedule = world.reports.some((r) => r.visibleTo.includes("noosa") && r.at === MONDAY_7AM.toISOString());
      const noneForToowoomba = findingsFor(world, "toowoomba").length === 0;
      return allFour && onSchedule && noneForToowoomba;
    },
    describe: (world) => `noosa kinds: ${[...new Set(findingsFor(world, "noosa").map((f) => f.kind))].join(", ") || "none"}`,
  },
  {
    checkId: "one-definition-per-measure",
    // 5. Two branches asked for the same measure over the same number of records.
    world: () =>
      new MultiSiteWorld({
        now: MONDAY_7AM,
        contract: CONTRACT,
        segments: [NOOSA, TOOWOOMBA],
        records: [rec("R-51", "noosa", "noosa", full("NSA")), rec("R-52", "toowoomba", "toowoomba", full("TWB"))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const def = CONTRACT.measures.overdue_rate;
      const reads = world.measureReads.filter((m) => m.measure === "overdue_rate");
      const n = reads.filter((m) => m.segmentId === "noosa");
      const t = reads.filter((m) => m.segmentId === "toowoomba");
      const once = n.length === 1 && t.length === 1;
      const oneDefinition = reads.length > 0 && reads.every((m) => m.definition === def);
      const sameNumber = once && n[0].value === t[0].value;
      return once && oneDefinition && sameNumber;
    },
    describe: (world) => `measure reads: ${JSON.stringify(world.measureReads)}`,
  },
  {
    checkId: "report-publishes-regardless",
    // 6. A scheduled run in a period where nothing drifted and nothing breached.
    world: () =>
      new MultiSiteWorld({
        now: MONDAY_7AM,
        contract: CONTRACT,
        segments: [NOOSA, TOOWOOMBA],
        records: [rec("R-61", "noosa", "noosa", full("NSA")), rec("R-62", "toowoomba", "toowoomba", full("TWB"))],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const each = ["noosa", "toowoomba"].every((s) => reportsFor(world, s).some((r) => r.findings.length === 0 && r.at === MONDAY_7AM.toISOString()));
      const centre = world.reports.some((r) => r.visibleTo.includes("centre"));
      const noRouting = world.notifiedPeople.length === 0;
      return each && centre && noRouting;
    },
    describe: (world) => `${world.reports.length} report(s): ${JSON.stringify(world.reports.map((r) => ({ visibleTo: r.visibleTo, findings: r.findings.length })))}`,
  },
  {
    checkId: "each-segment-sees-its-own",
    // 7. A run producing findings for two branches.
    world: () =>
      new MultiSiteWorld({
        now: MONDAY_7AM,
        contract: CONTRACT,
        segments: [NOOSA, TOOWOOMBA],
        seededDrift: [
          { segmentId: "noosa", kind: "gate_bypass", detail: "job J-71 closed with no evidence attached" },
          { segmentId: "toowoomba", kind: "schema", detail: "record R-72 has status 'Done-ish', not on the closed list" },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const centre = world.reports.filter((r) => r.visibleTo.includes("centre")).flatMap((r) => r.findings);
      if (centre.length < 2) return false;
      return ["noosa", "toowoomba"].every((s) => {
        const centreView = centre.filter((f) => f.segmentId === s).map((f) => `${f.kind}|${f.detail}`).sort();
        const ownView = findingsFor(world, s).map((f) => `${f.kind}|${f.detail}`).sort();
        return centreView.length > 0 && JSON.stringify([...new Set(ownView)]) === JSON.stringify([...new Set(centreView)]);
      });
    },
    describe: (world) => JSON.stringify(world.reports.map((r) => ({ visibleTo: r.visibleTo, findings: r.findings }))),
  },
  {
    checkId: "threshold-routes-to-a-person",
    // 8. Two branches cross the threshold: one has a named owner, one is owned by a list.
    world: () =>
      new MultiSiteWorld({
        now: MONDAY_7AM,
        contract: CONTRACT,
        segments: [NOOSA, seg("gympie", "Gympie", "all-branches@network.com.au")],
        seededDrift: [
          { segmentId: "noosa", kind: "silence", detail: "9 obligations due, nothing raised in 28 days" },
          { segmentId: "gympie", kind: "shadow_register", detail: "31 records entered in one hour after 12 quiet days" },
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const toPriya = world.notifiedPeople.some((n) => n.person === "Priya Nair" && /Noosa/.test(n.detail));
      const toList = world.notifiedPeople.some((n) => /all-branches|,/.test(n.person));
      const listRaised = world.escalations.some((e) => /no_named_owner/.test(e.reason) && /Gympie/.test(e.detail ?? ""));
      return toPriya && !toList && listRaised;
    },
    describe: (world) => `notified ${JSON.stringify(world.notifiedPeople)}; escalated ${JSON.stringify(world.escalations)}`,
  },
  {
    checkId: "gates-live-before-first-record",
    // 9. A new branch created with gates not yet live, then a record written to it at once;
    // and a live branch handed a record missing a required key.
    world: () => new MultiSiteWorld({ now: MONDAY_7AM, contract: CONTRACT, segments: [NOOSA] }),
    drive: (b, world) => {
      world.addSegment(seg("caloundra", "Caloundra", "Mei Tan", false));
      return b(world.ports(), {
        intake: [
          { segmentId: "caloundra", record: rec("R-91", "caloundra", "caloundra", full("CAL")) },
          { segmentId: "noosa", record: rec("R-92", "noosa", "noosa", { site_id: "NSA" }) },
          { segmentId: "noosa", record: rec("R-93", "noosa", "noosa", full("NSA")) },
        ],
      });
    },
    holds: (world) => {
      const gates = gateCalls(world);
      const newRefused = gates.some((c) => c.request?.write === "R-91" && c.response?.accepted === false);
      const missingRefused = gates.some((c) => c.request?.write === "R-92" && c.response?.accepted === false);
      const goodAccepted = gates.some((c) => c.request?.write === "R-93" && c.response?.accepted === true);
      const newHasNothing = !world.calls.some((c) => c.port === "gate" && c.request?.segmentId === "caloundra" && c.response?.accepted === true);
      return newRefused && missingRefused && goodAccepted && newHasNothing;
    },
    describe: (world) => `gate calls: ${JSON.stringify(gateCalls(world).map((c) => [c.request, c.response]))}`,
  },
  {
    checkId: "survives-the-builder",
    // 10. A precondition. The runner reports evidence_required; no code turns it green.
    world: () => new MultiSiteWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// Check 11 runs on the business's own systems, never on the stub.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new MultiSiteWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

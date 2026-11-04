/**
 * One scenario per check of two-records-build-standard, for Gas Tally.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair in every scenario: source a is the cylinder log (one line per
 * cylinder per job, weighed on the van scale); source b is the job system
 * (the refrigerant recorded on the job against that cylinder). The shared key
 * is `<job_id>/<cylinder_id>`. Quantities are kg; the refrigerant is a string.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls
 * and the objects raised through them), never the build's own memory, and
 * returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const OWNER = "Dale Nguyen (refrigerant licence holder)";
const ACCEPTOR = "Dale Nguyen";

const contract = (over = {}) => ({
  id: "PC-cylinder-log-vs-simpro-jobs-2026-10-01",
  sourceA: "the cylinder log (each cylinder, by van, weighed per job)",
  sourceB: "Simpro (refrigerant recorded on each job)",
  key: "job_cylinder",
  masterByField: { charged_kg: "a", recovered_kg: "a", gas: "a" },
  toleranceByField: {},
  threshold: { amount: 1, mismatchRate: 0.5 },
  schedule: "weekly, Monday 06:30 Australia/Brisbane, and five business days before the reporting date",
  owner: OWNER,
  ...over,
});

// One line, keyed by job id and cylinder id together. The name is a label only.
const line = (job, cyl, name, charged_kg, recovered_kg = 0, gas = "R32") => ({
  key: `${job}/${cyl}`,
  name,
  fields: { charged_kg, recovered_kg, gas },
});

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const writes = (world) => callsTo(world, "write_ledger");
const published = (world) => callsTo(world, "publish_report");
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasAllCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0);
const allClear = (r) => r.matched > 0 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0;

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. The contract beside two seeded sources; and the same build against a
    // world with no contract at all, which must not publish a guessed run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35)],
        sourceB: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.noContract = new TwoRecordsWorld({
        contract: null,
        sourceA: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
        sourceB: [line("J-20417", "CYL-0142", "Van 3, split system install", 0.9)],
      });
      await build(world.noContract.ports());
    },
    holds: (world) => {
      const contractRead = world.firstCall("read_ledger", (c) => c.request?.contract === true);
      const sourceRead = Math.min(
        ...[world.firstCall("read_job"), world.firstCall("read_ledger", (c) => c.request?.source === "b")].map((i) => (i < 0 ? Infinity : i)),
      );
      const runs = world.runs;
      const c = contract();
      const declared =
        runs.length === 1 &&
        runs[0].contractId === c.id &&
        JSON.stringify(runs[0].masterByField) === JSON.stringify(c.masterByField);
      const nc = world.noContract;
      const refusedGuess =
        !!nc &&
        nc.runs.length === 0 &&
        nc.differences.length === 0 &&
        nc.calls.every((x) => x.port !== "read_job" && x.request?.source !== "b") &&
        nc.escalations.length > 0;
      return contractRead === 0 && Number.isFinite(sourceRead) && contractRead < sourceRead && declared && refusedGuess;
    },
    describe: (world) =>
      `runs ${JSON.stringify(world.runs.map((r) => ({ contractId: r.contractId, masterByField: r.masterByField })))}; no-contract world: ${world.noContract?.runs.length ?? "?"} run(s), ${world.noContract?.escalations.length ?? "?"} escalation(s); ${world.calls.length} port call(s)`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Two lines with the same label and the same kg, under different job
    // ids on the same cylinder. Label and quantity must not pair them.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20430", "CYL-0217", "Van 1, Smith St Noosaville, R32 top-up", 0.6), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
        sourceB: [line("J-20431", "CYL-0217", "Van 1, Smith St Noosaville, R32 top-up", 0.6), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const run = world.runs[0];
      const lookalikes = new Set(["J-20430/CYL-0217", "J-20431/CYL-0217"]);
      const noDiffBetween = world.differences.every((d) => !lookalikes.has(d.key));
      const bothOrphaned =
        world.orphans.some((o) => o.key === "J-20430/CYL-0217" && o.source === "a") &&
        world.orphans.some((o) => o.key === "J-20431/CYL-0217" && o.source === "b");
      return world.runs.length === 1 && run.joinedOn === "job_cylinder" && run.matched === 1 && noDiffBetween && bothOrphaned;
    },
    describe: (world) =>
      `joinedOn ${world.runs[0]?.joinedOn ?? "none"}; matched ${world.runs[0]?.matched ?? "-"}; differences ${world.differences.map((d) => d.key).join(",") || "none"}; orphans ${world.orphans.map((o) => `${o.key}/${o.source}`).join(",") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five lines: three reconcile, one charge differs, one recovery differs.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.2),
          line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35),
          line("J-20425", "CYL-0301", "Van 2, cool room service", 0.8, 0, "R404A"),
          line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.6),
          line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.45, "R410A"),
        ],
        sourceB: [
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.2),
          line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35),
          line("J-20425", "CYL-0301", "Van 2, cool room service", 0.8, 0, "R404A"),
          line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.4),
          line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.1, "R410A"),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const ok = ["J-20417/CYL-0142", "J-20422/CYL-0142", "J-20425/CYL-0301"];
      const silent = world.differences.every((d) => !ok.includes(d.key));
      const topUp = world.differences.find((d) => d.key === "J-20426/CYL-0217");
      const recovery = world.differences.find((d) => d.key === "J-20428/REC-0009");
      const shaped = (d, field, a, b) => !!d && d.field === field && d.valueA === a && d.valueB === b && d.masterValue === a;
      const run = world.runs[0];
      return (
        world.differences.length === 2 &&
        silent &&
        shaped(topUp, "charged_kg", 0.6, 0.4) &&
        shaped(recovery, "recovered_kg", 1.45, 1.1) &&
        writes(world).length === 0 &&
        world.changedFields().length === 0 &&
        world.runs.length === 1 &&
        run.matched === 3 &&
        run.mismatched === 2
      );
    },
    describe: (world) =>
      `differences ${JSON.stringify(world.differences.map((d) => [d.key, d.field, d.valueA, d.valueB, d.masterValue]))}; writes ${writes(world).length}; changed ${world.changedFields().length}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The log and the job disagree on kg charged. Run, a named person accepts
    // an hour later, run again, then a third time to prove the write is not repeated.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.6)],
        sourceB: [line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.4)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      world.callsBeforeAccept = world.calls.length;
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.advance(HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const cut = world.callsBeforeAccept ?? 0;
      const before = world.calls.slice(0, cut).filter((c) => c.port === "write_ledger");
      const after = world.calls.slice(cut).filter((c) => c.port === "write_ledger");
      const proposal = world.calls.findIndex((c) => c.port === "gate" && c.request?.propose);
      const w = after[0];
      return (
        world.acceptances.length === 1 &&
        before.length === 0 &&
        after.length === 1 &&
        w.request?.correction?.acceptedBy === ACCEPTOR &&
        w.request?.source === "b" &&
        w.request?.value === 0.6 &&
        typeof w.response?.writtenId === "string" &&
        proposal >= 0 &&
        proposal < cut
      );
    },
    describe: (world) => `writes ${JSON.stringify(writes(world).map((c) => c.request))}; acceptances ${world.acceptances.length}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. Gas charged from a cylinder with no job record behind it, and gas
    // recorded on a job with no cylinder log line.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20433", "CYL-0301", "Van 2, cool room re-gas", 2.1, 0, "R404A")],
        sourceB: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20435", "CYL-0217", "Van 1, split system install", 0.9)],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const o = (key, source) => world.orphans.find((x) => x.key === key && x.source === source);
      const handed = (key) => callsTo(world, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
      const good = (x) => !!x && typeof x.reason === "string" && x.reason.length > 0 && x.owner === OWNER;
      return (
        world.orphans.length === 2 &&
        good(o("J-20433/CYL-0301", "a")) &&
        good(o("J-20435/CYL-0217", "b")) &&
        handed("J-20433/CYL-0301") &&
        handed("J-20435/CYL-0217") &&
        world.runs.length === 1 &&
        world.runs[0].orphaned === 2
      );
    },
    describe: (world) => `orphans ${JSON.stringify(world.orphans)}; run orphaned ${world.runs[0]?.orphaned ?? "-"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. A 0.05 kg tolerance on charged_kg (the van scale's resolution), none
    // on recovered_kg. One charge inside it, one outside it, and a recovery
    // 0.02 kg apart with no tolerance declared on that field.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ toleranceByField: { charged_kg: 0.05 } }),
        sourceA: [
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.23),
          line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.6),
          line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.12, "R410A"),
        ],
        sourceB: [
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.2),
          line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.4),
          line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.1, "R410A"),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const tol = contract({ toleranceByField: { charged_kg: 0.05 } }).toleranceByField;
      const d = (key, field) => world.differences.find((x) => x.key === key && x.field === field);
      const everyWithinDeclared = world.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(tol, x.field));
      return (
        d("J-20417/CYL-0142", "charged_kg")?.status === "within_tolerance" &&
        d("J-20426/CYL-0217", "charged_kg")?.status === "open" &&
        d("J-20428/REC-0009", "recovered_kg")?.status === "open" &&
        everyWithinDeclared &&
        world.runs.length === 1 &&
        world.runs[0].withinTolerance === 1 &&
        world.runs[0].mismatched === 2
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences.map((x) => [x.key, x.field, x.status]))}`,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Every line reconciles; two scheduled runs a week apart.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20425", "CYL-0301", "Van 2, cool room service", 0.8, 0, "R404A")],
        sourceB: [line("J-20417", "CYL-0142", "Van 3, split system install", 1.2), line("J-20425", "CYL-0301", "Van 2, cool room service", 0.8, 0, "R404A")],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(7 * 24 * HOUR);
      await build(world.ports());
    },
    holds: (world) => {
      const pubs = published(world);
      return (
        world.runs.length === 2 &&
        pubs.length === 2 &&
        world.runs.every((r) => hasAllCounts(r) && typeof r.publishedAt === "string" && r.publishedAt.length > 0 && allClear(r)) &&
        world.runs[0].publishedAt !== world.runs[1].publishedAt
      );
    },
    describe: (world) => `runs ${JSON.stringify(world.runs.map((r) => ({ at: r.publishedAt, ...Object.fromEntries(COUNTS.map((k) => [k, r[k]])) })))}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Threshold 1 kg and a rate of 0.25; one cool room job 2.5 kg apart in three lines.
    world: () =>
      new TwoRecordsWorld({
        contract: contract({ threshold: { amount: 1, mismatchRate: 0.25 } }),
        sourceA: [
          line("J-20433", "CYL-0301", "Van 2, cool room re-gas", 4.5, 0, "R404A"),
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.2),
          line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35),
        ],
        sourceB: [
          line("J-20433", "CYL-0301", "Van 2, cool room re-gas", 2.0, 0, "R404A"),
          line("J-20417", "CYL-0142", "Van 3, split system install", 1.2),
          line("J-20422", "CYL-0142", "Van 3, ducted service", 0.35),
        ],
      }),
    drive: (build, world) => build(world.ports()),
    holds: (world) => {
      const pub = world.firstCall("publish_report");
      const told = world.firstCall("notify", (c) => c.request?.to === OWNER && String(c.request?.detail).includes("J-20433/CYL-0301"));
      const rate = world.firstCall("escalate", (c) => /rate/i.test(String(c.request?.reason)));
      return pub >= 0 && told >= 0 && told < pub && rate >= 0 && rate < pub && world.runs.length === 1;
    },
    describe: (world) => `notices ${JSON.stringify(world.notices)}; escalations ${JSON.stringify(world.escalations)}; published ${world.runs.length}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. One recovery gap, accepted by a named person, written on the next run.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.45, "R410A"), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
        sourceB: [line("J-20428", "REC-0009", "Van 2, decommission old split", 0, 1.1, "R410A"), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(2 * HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
    },
    holds: (world) => {
      const d = world.differences.find((x) => x.key === "J-20428/REC-0009" && x.field === "recovered_kg");
      if (!d) return false;
      const c = world.correctionFor(d.id);
      const nowB = world.recordOf("b", "J-20428/REC-0009")?.fields.recovered_kg;
      const changed = world.changedFields();
      const everyChangeBacked = changed.every((ch) =>
        world.differences.some((x) => {
          const cx = world.correctionFor(x.id);
          return x.key === ch.key && x.field === ch.field && !!cx && cx.target === ch.source && !!cx.acceptedBy && !!cx.writtenId;
        }),
      );
      return (
        nowB === 1.45 &&
        d.valueA === 1.45 &&
        d.valueB === 1.1 &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (world) => `differences ${JSON.stringify(world.differences)}; corrections ${JSON.stringify(world.corrections)}; changed ${JSON.stringify(world.changedFields())}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. One line mismatched in one run, accepted, written in the next; then
    // read by its job and cylinder id.
    world: () =>
      new TwoRecordsWorld({
        contract: contract(),
        sourceA: [line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.6), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
        sourceB: [line("J-20426", "CYL-0217", "Van 1, split system top-up", 0.4), line("J-20417", "CYL-0142", "Van 3, split system install", 1.2)],
      }),
    drive: async (build, world) => {
      await build(world.ports());
      world.advance(HOUR);
      const d = world.openDifferences()[0];
      if (d) world.accept(d.id, ACCEPTOR);
      await build(world.ports());
      world.read = world.ports().readHistory("J-20426/CYL-0217");
    },
    holds: (world) => {
      const h = world.read;
      if (!h) return false;
      const d = h.differences.find((x) => x.field === "charged_kg");
      const c = d ? h.corrections.find((x) => x.differenceId === d.id) : undefined;
      return (
        h.runs.length >= 1 &&
        !!d &&
        d.valueA === 0.6 &&
        d.valueB === 0.4 &&
        h.runs.some((r) => r.id === d.runId) &&
        !!c &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string"
      );
    },
    describe: (world) => `history ${JSON.stringify(world.read ?? null)}`,
  },
  {
    checkId: "survives-the-builder",
    // 11. Not a runtime property. The runner reports it as evidence_required
    // and never runs this scenario, so it can never be scored green here.
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs on the business's own cylinder log and job system, by
// hand, with a person on the correction. A stub cannot pass it and is not asked to.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (build, world) => build(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

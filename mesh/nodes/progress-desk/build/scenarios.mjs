/**
 * One scenario per check of progress-claim-draft-build-standard, for Progress Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init progress-claim-draft-build-standard`
 * from https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard
 * and filled in here. The checks themselves are fetched at run time.
 *
 * Every `holds` reads what the world recorded through its ports (world.calls,
 * and the claims the draft port wrote), never the build's own memory. Every
 * expected figure is written out here by hand, so a build that gets the
 * arithmetic wrong cannot agree with itself and pass.
 */

import { ProgressClaimWorld } from "@aipathway/conformance";

const MARKER = "DRAFT: not a payment claim until reviewed and served by you";
const PERIOD = "2026-11";
const ACCEPTED = { name: "Dana Whitfield", role: "Director", acceptedOn: "2026-11-02", version: "v2" };
const OLD_ACCEPTANCE = { name: "Dana Whitfield", role: "Director", acceptedOn: "2026-06-10", version: "v1" };
const HOUR = 3_600_000;

// Money in whole cents.
const line = (code, description, value, previouslyClaimed = 0) => ({ code, description, value, kind: "contract", previouslyClaimed });
const variation = (code, description, value, signedAcceptance) => ({
  code,
  description,
  value,
  kind: "variation",
  previouslyClaimed: 0,
  ...(signedAcceptance ? { signedAcceptance } : {}),
});
const assessed = (contractId, code, percent, by = "Sam Ruiz", on = "2026-11-27", period = PERIOD) => ({
  contractId,
  period,
  code,
  percent,
  assessedBy: by,
  assessedOn: on,
});

/** The $500,000 house from the standard's worked example. */
const HOUSE = (id, pm = "Sam Ruiz", extra = []) => ({
  id,
  client: "Harbour Homes Pty Ltd",
  projectManager: pm,
  contractSum: 50_000_000,
  schedule: [line("SLAB", "Slab", 10_000_000, 10_000_000), line("FRAME", "Frame", 15_000_000, 7_500_000), line("LOCKUP", "Lock-up", 25_000_000, 0), ...extra],
});
const HOUSE_WALK = (id, by = "Sam Ruiz") => [assessed(id, "SLAB", 100, by), assessed(id, "FRAME", 100, by), assessed(id, "LOCKUP", 40, by)];

const callsTo = (world, port, pred = () => true) => world.calls.filter((c) => c.port === port && pred(c));
const draftsFor = (world, id) => callsTo(world, "draft_claim", (c) => c.request.contractId === id);
const holdsIn = (world, pred = () => true) => callsTo(world, "escalate", (c) => c.request.hold !== undefined && pred(c));
const only = (world, id) => {
  const list = world.claimsFor(id);
  return list.length === 1 ? list[0] : null;
};
const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

export const scenarios = [
  {
    checkId: "waiver-accepted-first",
    // 1. Two contracts ready to claim; the acceptance on file names a person and a role but is for v1, and v2 is published.
    world: () =>
      new ProgressClaimWorld({
        waiverVersion: "v2",
        acceptance: OLD_ACCEPTANCE,
        contracts: [HOUSE("C-101"), HOUSE("C-102", "Lee Tran")],
        assessments: [...HOUSE_WALK("C-101"), ...HOUSE_WALK("C-102", "Lee Tran")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = world.firstCall("read_acceptance");
      const drafts = callsTo(world, "draft_claim");
      const told = callsTo(world, "escalate", (c) => c.request.reason === "no_waiver_acceptance" && /v2/.test(c.request.detail ?? ""));
      return read >= 0 && drafts.length === 0 && world.claims.length === 0 && told.length === 1 && world.calls.indexOf(told[0]) > read;
    },
    describe: (world) => `${callsTo(world, "draft_claim").length} draft write(s); escalations: ${world.escalations.map((e) => e.reason).join(", ") || "none"}`,
  },
  {
    checkId: "contract-figures-from-the-record",
    // 2. C-201 adds up to its contract sum; C-202's schedule falls $20,000 short of it.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [
          HOUSE("C-201"),
          {
            id: "C-202",
            client: "Cove Developments",
            projectManager: "Sam Ruiz",
            contractSum: 30_000_000,
            schedule: [line("SITE", "Site works", 8_000_000, 4_000_000), line("STRUCT", "Structure", 20_000_000, 0)],
          },
        ],
        assessments: [...HOUSE_WALK("C-201"), assessed("C-202", "SITE", 100), assessed("C-202", "STRUCT", 25)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const read = world.firstCall("read_contract", (c) => c.request.contracts === true);
      const firstDraft = world.firstCall("draft_claim");
      if (read < 0 || firstDraft < 0 || read > firstDraft) return false;
      const good = only(world, "C-201");
      const bad = only(world, "C-202");
      if (!good || !bad || good.status !== "held" || good.lines.length !== 3) return false;
      const record = world.contract("C-201");
      const fromRecord = good.lines.every((l) => {
        const r = record.schedule.find((x) => x.code === l.code);
        return Boolean(r) && l.scheduledValue === r.value && l.previouslyClaimed === r.previouslyClaimed;
      });
      return fromRecord && bad.status === "parked" && bad.parkReason === "schedule_mismatch";
    },
    describe: (world) => world.claims.map((c) => `${c.contractId} ${c.status}${c.parkReason ? ` (${c.parkReason})` : ""} ${c.lines.length} line(s)`).join("; ") || "no claims",
  },
  {
    checkId: "percent-from-a-person",
    // 3. Three lines: SLAB and FRAME walked this month, LOCKUP walked only in October (at 30%).
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [HOUSE("C-301")],
        assessments: [
          assessed("C-301", "SLAB", 100),
          assessed("C-301", "FRAME", 80, "Sam Ruiz", "2026-11-26"),
          assessed("C-301", "LOCKUP", 30, "Sam Ruiz", "2026-10-29", "2026-10"),
        ],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const c = only(world, "C-301");
      if (!c || c.status !== "parked" || c.parkReason !== "no_assessment") return false;
      if (c.lines.some((l) => l.code === "LOCKUP")) return false;
      const thisMonth = world.entriesFor("C-301", PERIOD);
      const allFromThisMonth = c.lines.every((l) => {
        const e = thisMonth.find((x) => x.code === l.code);
        return Boolean(e) && l.percent === e.percent && l.assessedBy === e.assessedBy && l.assessedOn === e.assessedOn;
      });
      const told = holdsIn(world, (h) => h.request.reason === "no_assessment").length >= 1;
      return c.lines.length === 2 && allFromThisMonth && told && callsTo(world, "read_assessment").length >= 1;
    },
    describe: (world) => world.claims.map((c) => `${c.status}${c.parkReason ? ` (${c.parkReason})` : ""}: ${c.lines.map((l) => `${l.code} ${l.percent}%`).join(", ")}`).join("; ") || "no claims",
  },
  {
    checkId: "variation-needs-a-signature",
    // 4. C-401 has a signed extra window; C-402 has an extra window nobody signed.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [
          HOUSE("C-401", "Sam Ruiz", [variation("V1", "Variation 1: extra window", 1_200_000, "sig://C-401/V1/signed-2026-11-12.pdf")]),
          HOUSE("C-402", "Sam Ruiz", [variation("V1", "Variation 1: extra window", 1_200_000)]),
        ],
        assessments: [...HOUSE_WALK("C-401"), assessed("C-401", "V1", 100), ...HOUSE_WALK("C-402"), assessed("C-402", "V1", 100)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const signed = only(world, "C-401");
      const unsigned = only(world, "C-402");
      if (!signed || !unsigned) return false;
      const ref = "sig://C-401/V1/signed-2026-11-12.pdf";
      const v = signed.lines.find((l) => l.code === "V1");
      const attached = callsTo(world, "evidence", (c) => c.request.claimId === signed.id && c.request.ref === ref).length === 1;
      const okSigned = signed.status === "held" && Boolean(v) && v.scheduledValue === 1_200_000 && signed.evidence.includes(ref) && attached;
      const okUnsigned =
        unsigned.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        unsigned.holds.some((h) => h.reason === "unsigned_variation");
      return okSigned && okUnsigned;
    },
    describe: (world) => world.claims.map((c) => `${c.contractId} ${c.status}${c.parkReason ? ` (${c.parkReason})` : ""} evidence ${c.evidence.length}`).join("; ") || "no claims",
  },
  {
    checkId: "cumulative-arithmetic",
    // 5. C-501 is the worked example with claims before on two lines, plus an odd
    //    line that rounds to the cent. C-502 has a line assessed below what was claimed.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [
          {
            id: "C-501",
            client: "Harbour Homes Pty Ltd",
            projectManager: "Sam Ruiz",
            contractSum: 50_000_333,
            schedule: [
              line("SLAB", "Slab", 10_000_000, 10_000_000),
              line("FRAME", "Frame", 15_000_000, 7_500_000),
              line("LOCKUP", "Lock-up", 25_000_000, 0),
              line("PC", "PC items", 333, 0),
            ],
          },
          {
            id: "C-502",
            client: "Cove Developments",
            projectManager: "Sam Ruiz",
            contractSum: 20_000_000,
            schedule: [line("SITE", "Site works", 5_000_000, 5_000_000), line("STRUCT", "Structure", 15_000_000, 6_000_000)],
          },
        ],
        assessments: [...HOUSE_WALK("C-501"), assessed("C-501", "PC", 50), assessed("C-502", "SITE", 100), assessed("C-502", "STRUCT", 30)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const a = only(world, "C-501");
      const b = only(world, "C-502");
      if (!a || !b || a.status !== "held") return false;
      // Worked by hand: scheduled, percent, to date, claimed before, this claim.
      const expected = {
        SLAB: [10_000_000, 100, 10_000_000, 10_000_000, 0],
        FRAME: [15_000_000, 100, 15_000_000, 7_500_000, 7_500_000],
        LOCKUP: [25_000_000, 40, 10_000_000, 0, 10_000_000],
        PC: [333, 50, 167, 0, 167],
      };
      if (a.lines.length !== 4) return false;
      const linesHold = a.lines.every((l) => {
        const e = expected[l.code];
        return (
          Boolean(e) &&
          l.scheduledValue === e[0] &&
          l.percent === e[1] &&
          l.valueToDate === e[2] &&
          l.previouslyClaimed === e[3] &&
          l.thisClaim === e[4] &&
          l.thisClaim === l.valueToDate - l.previouslyClaimed
        );
      });
      const t = a.totals;
      const totalsHold =
        t.scheduledValue === sum(a.lines, "scheduledValue") &&
        t.valueToDate === sum(a.lines, "valueToDate") &&
        t.previouslyClaimed === sum(a.lines, "previouslyClaimed") &&
        t.thisClaim === sum(a.lines, "thisClaim") &&
        t.thisClaim === 17_500_167;
      const backwards = b.status === "parked" && b.parkReason === "below_previous" && b.lines.every((l) => l.thisClaim >= 0) && !b.lines.some((l) => l.code === "STRUCT");
      return linesHold && totalsHold && backwards;
    },
    describe: (world) => world.claims.map((c) => `${c.contractId} ${c.status}${c.parkReason ? ` (${c.parkReason})` : ""} this claim ${c.totals.thisClaim}c`).join("; ") || "no claims",
  },
  {
    checkId: "one-claim-per-contract-per-period",
    // 6. Two contracts drafted twice, an hour apart. The very first draft write
    //    comes back with no id, which must be treated as not written.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        failNextWrite: true,
        contracts: [HOUSE("C-601"), HOUSE("C-602", "Lee Tran")],
        assessments: [...HOUSE_WALK("C-601"), ...HOUSE_WALK("C-602", "Lee Tran")],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const a = world.claimsFor("C-601");
      const b = world.claimsFor("C-602");
      if (a.length !== 1 || b.length !== 1 || !a[0].externalId || !b[0].externalId) return false;
      // C-601's first write failed: it was escalated, not counted.
      const failed = world.escalations.some((e) => e.reason === "write_failed" && /C-601/.test(e.detail ?? ""));
      const noHoldOnNothing = holdsIn(world, (h) => !h.request.hold).length === 0;
      // C-602 was created once, then updated on the second run.
      const bWrites = draftsFor(world, "C-602");
      const bOk = bWrites.length >= 1 && !bWrites[0].request.update && bWrites.slice(1).every((c) => c.request.update === b[0].id);
      const readBeforeWrite = callsTo(world, "read_contract", (c) => c.request.claimFor === "C-602").length >= 2;
      return failed && noHoldOnNothing && bOk && bWrites.length === 2 && readBeforeWrite;
    },
    describe: (world) => `C-601 ${world.claimsFor("C-601").length} claim(s), C-602 ${world.claimsFor("C-602").length} claim(s); escalations: ${world.escalations.map((e) => e.reason).join(", ") || "none"}`,
  },
  {
    checkId: "draft-marker",
    // 7. Two contracts drafted; the project manager releases C-701; the build runs again.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [HOUSE("C-701"), HOUSE("C-702")],
        assessments: [...HOUSE_WALK("C-701"), ...HOUSE_WALK("C-702")],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      const first = world.claimsFor("C-701")[0];
      if (first) world.release(first.id, "Sam Ruiz");
      world.advance(HOUR);
      await b(world.ports());
    },
    holds: (world) => {
      const writes = callsTo(world, "draft_claim");
      if (writes.length < 2 || !writes.every((c) => c.request.marker === MARKER)) return false;
      const released = only(world, "C-701");
      const other = only(world, "C-702");
      if (!released || !other) return false;
      const byPerson = world.releases.some((r) => r.claimId === released.id && r.by === "Sam Ruiz");
      return (
        released.status === "released" &&
        released.marker === null &&
        released.releasedBy === "Sam Ruiz" &&
        Boolean(released.releasedAt) &&
        byPerson &&
        draftsFor(world, "C-701").length === 1 &&
        other.marker === MARKER &&
        other.status === "held"
      );
    },
    describe: (world) => world.claims.map((c) => `${c.contractId} ${c.status} marker ${c.marker === null ? "off" : JSON.stringify(c.marker)}`).join("; ") || "no claims",
  },
  {
    checkId: "draft-and-hold-only",
    // 8. One contract ready to claim, in a world with no port to serve, send or lodge.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [HOUSE("C-801", "Sam Ruiz", [variation("V1", "Variation 1: extra window", 1_200_000, "sig://C-801/V1.pdf")])],
        assessments: [...HOUSE_WALK("C-801"), assessed("C-801", "V1", 100)],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const c = only(world, "C-801");
      if (!c || c.status !== "held") return false;
      const allowed = new Set(["read_acceptance", "read_contract", "read_assessment", "draft_claim", "evidence", "escalate"]);
      if (!world.calls.every((x) => allowed.has(x.port))) return false;
      const outbound = callsTo(world, "escalate").some((x) => x.request.hold === undefined || x.request.to !== "Sam Ruiz");
      if (outbound) return false;
      const forbidden = /\bdue\b|pay by|payment schedule|retention|adjudicat|serv(ed|ing) on|lodg|certif/i;
      const text = [c.notes ?? "", ...c.lines.map((l) => l.description), JSON.stringify(c.totals)].join(" ");
      return !forbidden.test(text) && c.marker === MARKER && c.holds.length === 1;
    },
    describe: (world) => `ports used: ${[...new Set(world.calls.map((c) => c.port))].join(", ")}; notes: ${world.claims[0]?.notes ?? "none"}`,
  },
  {
    checkId: "held-for-the-project-manager",
    // 9. C-901 (Sam Ruiz) ready to claim; C-902 (Lee Tran) missing this month's walk of one line.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [HOUSE("C-901", "Sam Ruiz"), HOUSE("C-902", "Lee Tran")],
        assessments: [...HOUSE_WALK("C-901"), assessed("C-902", "SLAB", 100, "Lee Tran"), assessed("C-902", "FRAME", 100, "Lee Tran")],
      }),
    drive: (b, world) => b(world.ports()),
    holds: (world) => {
      const a = only(world, "C-901");
      const b = only(world, "C-902");
      if (!a || !b) return false;
      const aOk = a.status === "held" && a.holds.length === 1 && a.holds[0].to === "Sam Ruiz" && !a.holds[0].reason;
      const bOk = b.status === "parked" && b.holds.length === 1 && b.holds[0].to === "Lee Tran" && b.holds[0].reason === "no_assessment";
      const clients = new Set(["Harbour Homes Pty Ltd"]);
      const toClient = holdsIn(world, (h) => clients.has(h.request.to)).length > 0;
      const strays = holdsIn(world, (h) => !["Sam Ruiz", "Lee Tran"].includes(h.request.to)).length > 0;
      const noneReleased = world.claims.every((c) => c.status !== "released");
      return aOk && bOk && !toClient && !strays && noneReleased;
    },
    describe: (world) => world.claims.map((c) => `${c.contractId} ${c.status} held for ${c.holds.map((h) => `${h.to}${h.reason ? ` (${h.reason})` : ""}`).join(", ") || "nobody"}`).join("; ") || "no claims",
  },
  {
    checkId: "the-record-by-contract",
    // 10. One contract drafted with a signed variation, then released by the project manager,
    //     then read back by contract and period through the port.
    world: () =>
      new ProgressClaimWorld({
        acceptance: ACCEPTED,
        contracts: [HOUSE("C-1001", "Sam Ruiz", [variation("V1", "Variation 1: extra window", 1_200_000, "sig://C-1001/V1.pdf")])],
        assessments: [...HOUSE_WALK("C-1001"), assessed("C-1001", "V1", 100)],
      }),
    drive: async (b, world) => {
      await b(world.ports());
      const c = world.claimsFor("C-1001")[0];
      if (c) world.release(c.id, "Sam Ruiz");
      world.advance(HOUR);
      world.lastRead = world.ports().readRecord("C-1001", PERIOD);
    },
    holds: (world) => {
      const read = callsTo(world, "read_contract", (c) => c.request.record === "C-1001" && c.request.period === PERIOD);
      const claim = world.lastRead?.claim;
      if (read.length !== 1 || !claim) return false;
      const codes = claim.lines.map((l) => l.code).sort().join(",");
      const figures = claim.lines.every(
        (l) =>
          [l.scheduledValue, l.percent, l.valueToDate, l.previouslyClaimed, l.thisClaim].every((n) => Number.isInteger(n)) &&
          l.thisClaim === l.valueToDate - l.previouslyClaimed &&
          typeof l.assessedBy === "string" &&
          l.assessedBy.length > 0 &&
          typeof l.assessedOn === "string" &&
          l.assessedOn.length > 0,
      );
      return (
        claim.contractId === "C-1001" &&
        claim.period === PERIOD &&
        codes === "FRAME,LOCKUP,SLAB,V1" &&
        figures &&
        claim.evidence.includes("sig://C-1001/V1.pdf") &&
        claim.acceptanceVersion === world.currentVersion &&
        claim.releasedBy === "Sam Ruiz" &&
        Boolean(claim.releasedAt)
      );
    },
    describe: (world) => {
      const c = world.lastRead?.claim;
      return c ? `${c.contractId} ${c.period} ${c.lines.length} line(s), evidence ${c.evidence.length}, waiver ${c.acceptanceVersion}, released by ${c.releasedBy ?? "nobody"}` : "no record read back";
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the contracts, acceptance record and site
    // assessments run on the builder's own account.
    world: () => new ProgressClaimWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

// The pass test runs only on the builder's own contract records and the
// project manager's real site walk. This standard publishes no live port map,
// so run.mjs refuses a production run and the runner reports it with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    // 12. On the builder's own records: waiver accepted, one contract drafted twice,
    //     one line with no assessment, one unsigned variation, one released draft.
    world: () => new ProgressClaimWorld(),
    drive: (b, world) => b(world.ports()),
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

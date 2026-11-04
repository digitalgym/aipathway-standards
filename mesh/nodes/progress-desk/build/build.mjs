/**
 * Progress Desk: the month's progress claim drafted for each builder contract
 * and held for the project manager. Built to AIP-BS-PROGRESS-CLAIM-DRAFT
 * (https://aipathway.com.au/explore-ai/progress-claim-draft-build-standard).
 *
 * One run, woken by the month-end schedule (or by a person closing a parked
 * draft), with nothing kept between runs:
 *
 *   1. Read the waiver acceptance on file. No acceptance at the version now
 *      published means nothing is drafted and the account owner is told.
 *   2. Read every contract: contract sum, schedule of values and what was
 *      claimed before, all from the contract record.
 *   3. For each contract, read the existing draft for this period (so a
 *      second run updates it) and this period's site assessment.
 *   4. Work each line: value to date less claimed before, in cents. A gap is
 *      parked with its reason, never filled in.
 *   5. Write one draft per contract per period, with the marker, attach each
 *      signed variation, and hold it for the contract's project manager.
 *
 * It never serves, sends, lodges or certifies a claim, never states a due
 * date, never touches a payment schedule, retention or adjudication, and
 * never takes the marker off. A person releases the draft, then signs and
 * serves the claim themselves.
 *
 * Every port call is awaited, so the same build runs against the stub and
 * against the builder's own records.
 */

export const DRAFT_MARKER = "DRAFT: not a payment claim until reviewed and served by you";

// The order the standard gives the checks, so a draft with several gaps
// parks on the first one a person must fix.
const PARK_ORDER = ["schedule_mismatch", "no_assessment", "unsigned_variation", "below_previous"];

const PARK_WORDS = {
  schedule_mismatch: "the schedule of values does not add up to the contract sum",
  no_assessment: "a line has no percent complete for this month with a name and a date",
  unsigned_variation: "a variation has no signed acceptance from the client",
  below_previous: "this month's percent puts a line below what was already claimed; whether that is a credit is your call",
};

const isPerson = (s) => typeof s === "string" && s.trim().length > 0;

/** Check 1: an acceptance counts only with a name, a role, a date and the current version. */
function acceptanceHolds(acc) {
  const a = acc?.onFile;
  return Boolean(a && isPerson(a.name) && isPerson(a.role) && isPerson(a.acceptedOn) && a.version === acc.current);
}

/** Check 3: this period's entry for a line, and only if it names who and when. */
function entryFor(entries, period, code) {
  const e = entries.find((x) => x.period === period && x.code === code);
  if (!e) return null;
  if (!isPerson(e.assessedBy) || !isPerson(e.assessedOn)) return null;
  if (typeof e.percent !== "number" || !Number.isFinite(e.percent) || e.percent < 0 || e.percent > 100) return null;
  return e;
}

/** Checks 2 to 5 for one contract: the lines drafted and every reason to park. */
export function workContract(contract, entries, period) {
  const reasons = new Set();
  const lines = [];
  const signed = [];
  const parkedLines = [];

  const contractLines = contract.schedule.filter((l) => l.kind === "contract");
  const scheduleTotal = contractLines.reduce((s, l) => s + l.value, 0);
  if (scheduleTotal !== contract.contractSum) reasons.add("schedule_mismatch");

  for (const line of contract.schedule) {
    if (line.kind === "variation" && !isPerson(line.signedAcceptance)) {
      reasons.add("unsigned_variation");
      parkedLines.push(`${line.code} (unsigned)`);
      continue;
    }
    const e = entryFor(entries, period, line.code);
    if (!e) {
      reasons.add("no_assessment");
      parkedLines.push(`${line.code} (not assessed this month)`);
      continue;
    }
    const valueToDate = Math.round((line.value * e.percent) / 100);
    const thisClaim = valueToDate - line.previouslyClaimed;
    if (thisClaim < 0) {
      reasons.add("below_previous");
      parkedLines.push(`${line.code} (below what was claimed before)`);
      continue;
    }
    lines.push({
      code: line.code,
      description: line.description,
      kind: line.kind,
      scheduledValue: line.value,
      percent: e.percent,
      valueToDate,
      previouslyClaimed: line.previouslyClaimed,
      thisClaim,
      assessedBy: e.assessedBy,
      assessedOn: e.assessedOn,
    });
    if (line.kind === "variation") signed.push(line.signedAcceptance);
  }

  const totals = lines.reduce(
    (t, l) => ({
      scheduledValue: t.scheduledValue + l.scheduledValue,
      valueToDate: t.valueToDate + l.valueToDate,
      previouslyClaimed: t.previouslyClaimed + l.previouslyClaimed,
      thisClaim: t.thisClaim + l.thisClaim,
    }),
    { scheduledValue: 0, valueToDate: 0, previouslyClaimed: 0, thisClaim: 0 },
  );

  const park = PARK_ORDER.find((r) => reasons.has(r));
  return { lines, totals, signed, park, reasons: PARK_ORDER.filter((r) => reasons.has(r)), parkedLines };
}

function notesFor(contract, worked) {
  if (!worked.park) return `Held for ${contract.projectManager} to check, sign and serve.`;
  const why = worked.reasons.map((r) => PARK_WORDS[r]).join("; ");
  return `Parked for ${contract.projectManager}: ${why}. Lines left out: ${worked.parkedLines.join(", ")}.`;
}

async function draftOne(ports, contract, period, version) {
  const existing = await ports.readClaimFor(contract.id, period);
  // Released by a person: it is theirs now. The build writes nothing more.
  if (existing && existing.status === "released") return;

  const entries = await ports.readAssessment(contract.id);
  const worked = workContract(contract, entries, period);

  const claim = await ports.draftClaim({
    ...(existing ? { claimId: existing.id } : {}),
    contractId: contract.id,
    period,
    marker: DRAFT_MARKER,
    lines: worked.lines,
    totals: worked.totals,
    acceptanceVersion: version,
    notes: notesFor(contract, worked),
    ...(worked.park ? { park: worked.park } : {}),
  });

  // Check 6: no id back is not a write.
  if (!claim || !claim.id || !claim.externalId) {
    await ports.escalate("write_failed", `contract ${contract.id} period ${period}: the draft did not read back with an id`);
    return;
  }

  // Check 4: each signed variation drafted carries its signed acceptance.
  const have = new Set(existing?.evidence ?? []);
  for (const ref of worked.signed) {
    if (!have.has(ref)) await ports.attachEvidence(claim.id, ref);
  }

  // Check 9: in front of the contract's own project manager, with the reason when parked.
  const already = (existing?.holds ?? []).some((h) => h.to === contract.projectManager && (h.reason ?? null) === (worked.park ?? null));
  if (!already) {
    if (worked.park) await ports.holdFor(claim.id, contract.projectManager, worked.park);
    else await ports.holdFor(claim.id, contract.projectManager);
  }
}

/**
 * @param {import("@aipathway/conformance").ProgressClaimPorts} ports
 */
export async function build(ports) {
  const period = await ports.period();
  const acc = await ports.readAcceptance();
  if (!acceptanceHolds(acc)) {
    const onFile = acc?.onFile?.version ? `the acceptance on file is for version ${acc.onFile.version}` : "no acceptance is on file";
    await ports.escalate(
      "no_waiver_acceptance",
      `Account owner: nothing is drafted until the waiver and indemnity version ${acc?.current} is accepted with a name, role and date; ${onFile}.`,
    );
    return;
  }
  const contracts = await ports.readContracts();
  for (const contract of contracts) {
    await draftOne(ports, contract, period, acc.current);
  }
}

/**
 * Portal Match, built to AIP-BS-TWO-RECORDS (two-records-build-standard).
 *
 * The office job: keep each job's status in Simpro and in the client's
 * work-order portal (a real estate agency, a facilities manager or a CMMS) in
 * step by work-order number, and show every difference for a person to fix.
 *
 * Source a is Simpro: the job carries the client's work-order number, and
 * Simpro is right about where the work is up to (status) and what was
 * invoiced. Source b is the client's portal: it issued the work-order number,
 * and it is right about the attend-by date and the approved not-to-exceed
 * limit. Which side is right about which field is the pair contract a person
 * wrote; this build never decides it.
 *
 * What it never does: match on a property address, tenant name or amount;
 * change either side because they differ; overwrite the value that was there
 * before a fix. Its only write is a correction a named person accepted, and it
 * keeps both original values on the Difference.
 *
 * Everything goes through the ports it is handed. One call is one scheduled
 * run.
 */

/**
 * Simpro and the portals use different words for the same stage. This map is
 * written by the office, not inferred: a Simpro status not in it is compared
 * as written, so an unknown word shows up as a difference for a person.
 */
export const STATUS_TERMS = {
  "Pending": "Received",
  "Scheduled": "Scheduled",
  "In Progress": "In progress",
  "On Hold": "On hold",
  "Complete": "Work complete",
  "Invoiced": "Work complete",
};

const other = (s) => (s === "a" ? "b" : "a");

/** The value a would show in b's vocabulary, for the status field only. */
function inBTerms(field, value) {
  if (field !== "status" || typeof value !== "string") return value;
  return Object.prototype.hasOwnProperty.call(STATUS_TERMS, value) ? STATUS_TERMS[value] : value;
}

/**
 * The value the master holds, written in the target's vocabulary. A status
 * from the portal has no single Simpro word (two map to one), so it is
 * proposed as the portal wrote it and the person keying the fix picks the
 * Simpro stage.
 */
function proposalFor(field, master, masterValue) {
  return master === "a" ? inBTerms(field, masterValue) : masterValue;
}

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `portal-match-${now.toISOString()}`;

  // 1. The contract before any record. No contract, no master, no run.
  const contract = await ports.readContract();
  const masters = contract && contract.masterByField ? contract.masterByField : {};
  const fields = Object.keys(masters).filter((f) => masters[f] === "a" || masters[f] === "b");
  if (!contract || !contract.key || fields.length === 0) {
    await ports.escalate(
      "portal_match.contract_missing",
      "No written pair contract naming the work-order number as the key and a master per field. Nothing was read or compared.",
    );
    return;
  }
  const owner = contract.owner;
  if (!owner) {
    await ports.escalate("portal_match.owner_missing", `Contract ${contract.id} names no person to own differences.`);
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
  const threshold = contract.threshold ?? { amount: Infinity, mismatchRate: 1 };

  // 2. Honour what a person accepted since the last run, once each.
  let corrected = 0;
  const acceptances = await ports.readAcceptances();
  for (const acc of acceptances) {
    if (!acc.acceptedBy) continue;
    const writtenId = await ports.writeField({
      source: acc.target,
      key: acc.key,
      field: acc.field,
      value: acc.value,
      correction: { differenceId: acc.differenceId, acceptedBy: acc.acceptedBy, acceptedAt: acc.acceptedAt },
    });
    if (writtenId) {
      corrected += 1;
    } else {
      await ports.notify({
        to: owner,
        reason: "portal_match.write_not_read_back",
        detail: `Work order ${acc.key}: the accepted ${acc.field} correction returned no id from ${acc.target === "a" ? contract.sourceA : contract.sourceB}. Key it by hand and record the id.`,
      });
    }
  }

  // 3. Both sides, joined on the work-order number and nothing else.
  const simpro = await ports.readSourceA();
  const portal = await ports.readSourceB();
  const byKey = (list) => {
    const m = new Map();
    for (const r of list) if (r && typeof r.key === "string" && r.key !== "") m.set(r.key, r);
    return m;
  };
  const a = byKey(simpro);
  const b = byKey(portal);

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  const overAmount = [];

  for (const [key, ra] of a) {
    const rb = b.get(key);
    if (!rb) continue;
    let worst = "matched";
    for (const field of fields) {
      const va = ra.fields[field];
      const vb = rb.fields[field];
      if (va === undefined && vb === undefined) continue;
      const master = masters[field];
      const masterValue = master === "a" ? va : vb;

      if (typeof va === "number" && typeof vb === "number") {
        const gap = Math.abs(va - vb);
        if (gap === 0) continue;
        const declared = Object.prototype.hasOwnProperty.call(tolerance, field) && typeof tolerance[field] === "number";
        if (declared && gap <= tolerance[field]) {
          await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "within_tolerance" });
          if (worst === "matched") worst = "within";
          continue;
        }
        const d = await ports.raiseDifference({ runId, key, field, valueA: va, valueB: vb, masterValue, status: "open" });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: proposalFor(field, master, masterValue), target: other(master) });
        if (gap > threshold.amount) overAmount.push({ key, field, va, vb, gap });
        worst = "open";
        continue;
      }

      const same = field === "status" ? inBTerms(field, va) === vb : va === vb;
      if (same) continue;
      const d = await ports.raiseDifference({
        runId,
        key,
        field,
        valueA: va ?? "",
        valueB: vb ?? "",
        masterValue: masterValue ?? null,
        status: "open",
      });
      if (masterValue !== undefined) {
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: proposalFor(field, master, masterValue), target: other(master) });
      }
      worst = "open";
    }
    if (worst === "matched") matched += 1;
    else if (worst === "within") withinTolerance += 1;
    else mismatched += 1;
  }

  // 4. A work order on one side only is an orphan with a reason and an owner.
  for (const key of a.keys()) {
    if (b.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `Work order ${key} is on a ${contract.sourceA} job but not in ${contract.sourceB}: wrong number keyed, or the client cancelled it.`,
      owner,
    });
  }
  for (const key of b.keys()) {
    if (a.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `Work order ${key} is in ${contract.sourceB} but on no ${contract.sourceA} job: not yet entered, or entered without its number.`,
      owner,
    });
  }

  // 5. Over the amount, or too many open, a person hears this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "portal_match.over_threshold",
      detail: `Work order ${o.key}: ${o.field} is ${o.va} in ${contract.sourceA} and ${o.vb} in ${contract.sourceB}, a gap of ${o.gap}, over the ${threshold.amount} the contract allows.`,
    });
  }
  const joined = matched + withinTolerance + mismatched;
  if (joined > 0 && mismatched / joined > threshold.mismatchRate) {
    await ports.escalate(
      "portal_match.mismatch_rate",
      `${mismatched} of ${joined} work orders differ this run, over the ${threshold.mismatchRate} rate in contract ${contract.id}. Told: ${owner}.`,
    );
  }

  // 6. Publish every run, the all-clear included.
  await ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masters },
    matched,
    withinTolerance,
    mismatched,
    orphaned,
    corrected,
  });
}

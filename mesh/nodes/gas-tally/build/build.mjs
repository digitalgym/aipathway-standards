/**
 * Gas Tally: the refrigerant log kept for every cylinder and van, matched to
 * the gas recorded on each job in the job system, and every quantity that
 * does not reconcile listed for a named person before the reporting date.
 * Built to AIP-BS-TWO-RECORDS.
 *
 * The pair, as the ports carry it:
 *   source a (read_job port)    the cylinder log: one line per cylinder per
 *                                job, as the technician weighed it on the van
 *                                scale, with the van, the refrigerant (R32,
 *                                R410A, R134a...), kg charged into the system
 *                                and kg recovered out of it
 *   source b (read_ledger port) the job system (Simpro): the refrigerant
 *                                recorded on the job against that cylinder,
 *                                with the same three fields
 *
 * The shared key is the job id and the cylinder id together
 * (`<job_id>/<cylinder_id>`), never a customer name, a site address or a
 * quantity. The contract a person wrote says which source is master per field
 * and what tolerance, if any, each field carries (usually the scale's
 * resolution on kg). This build never guesses either.
 *
 * Every run, woken by schedule.tick (weekly, and again ahead of the reporting
 * date), or by exception.closed when a person clears an exception:
 *   1. Read the pair contract. None, or no master declared: stop and tell a
 *      person. Nothing is read or compared under a guessed contract.
 *   2. Honour acceptances a named person has already given: write each
 *      accepted correction once into its target, with the person on it.
 *   3. Read both sources and join on the contract's key only.
 *   4. A line that agrees is counted and nothing more. A field that differs
 *      becomes a Difference with both values and the master's value; inside a
 *      declared tolerance it is within_tolerance, otherwise it is open and the
 *      master's value is proposed for the other source. Nothing is changed by
 *      the comparison.
 *   5. A cylinder log line with no job record, or gas on a job with no
 *      cylinder log line, is an orphan with a reason and the contract's owner.
 *   6. A gap over the threshold (in kg) reaches the owner this run; open
 *      mismatches over the declared rate escalate the run.
 *   7. Publish the run with its five counts, including the all-clear.
 *
 * It never sends anything to a regulator and never lodges a return. The
 * published tally is what the licence holder reads before they report.
 *
 * Everything goes through the ports. Every port call is awaited, so the same
 * build runs against the stub and against real adapters.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** How far apart two values are, in the field's own unit, or null if not comparable by distance. */
function gap(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.abs(x - y);
  if (typeof x === "string" && typeof y === "string" && DATE_RE.test(x) && DATE_RE.test(y)) {
    return Math.abs(Date.parse(`${x}T00:00:00Z`) - Date.parse(`${y}T00:00:00Z`)) / DAY_MS;
  }
  return null;
}

/** Equal on the value, kg compared to the gram so float noise is never a gap. */
function agree(x, y) {
  if (typeof x === "number" && typeof y === "number") return Math.round(x * 1000) === Math.round(y * 1000);
  return x === y;
}

const flip = (s) => (s === "a" ? "b" : "a");
const LABEL = { a: "the cylinder log", b: "the job system" };
const show = (n) => (typeof n === "number" ? `${n.toFixed(3)} kg` : String(n));

/**
 * @param {import("@aipathway/conformance").TwoRecordsPorts} ports
 */
export async function build(ports) {
  const now = await ports.now();
  const runId = `gas-tally-${now.toISOString()}`;

  // 1. The contract first. A run under no contract does not happen.
  const contract = await ports.readContract();
  const masterByField = contract?.masterByField ?? {};
  const compared = Object.keys(masterByField).filter((f) => masterByField[f] === "a" || masterByField[f] === "b");
  if (!contract || !contract.key || compared.length === 0) {
    await ports.escalate(
      "two-records.contract_missing",
      "No written pair contract with a shared key and a master per field. Gas Tally does not match the cylinder log to the jobs under a guessed contract.",
    );
    return;
  }
  const tolerance = contract.toleranceByField ?? {};
  const owner = contract.owner;

  // 2. Accepted corrections are written once, with the person on them.
  let corrected = 0;
  for (const acc of await ports.readAcceptances()) {
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
        reason: "two-records.write_not_read_back",
        detail: `Accepted correction ${acc.differenceId} on ${acc.key} (${acc.field}) returned no id from ${LABEL[acc.target]}. It was not written.`,
      });
    }
  }

  // 3. Both sources, joined on the contract's key only.
  const log = await ports.readSourceA();
  const jobs = await ports.readSourceB();
  const logLines = new Map(log.map((r) => [r.key, r]));
  const jobLines = new Map(jobs.map((r) => [r.key, r]));

  let matched = 0;
  let withinTolerance = 0;
  let mismatched = 0;
  let orphaned = 0;
  let paired = 0;
  const overAmount = [];

  for (const [key, line] of logLines) {
    const job = jobLines.get(key);
    if (!job) continue;
    paired += 1;
    let open = 0;
    let within = 0;
    let history = null;

    for (const field of compared) {
      const valueA = line.fields[field];
      const valueB = job.fields[field];
      if (agree(valueA, valueB)) continue;

      const master = masterByField[field];
      const masterValue = master === "a" ? valueA : valueB;
      const tol = Object.prototype.hasOwnProperty.call(tolerance, field) ? tolerance[field] : undefined;
      const apart = gap(valueA, valueB);
      const inside = typeof tol === "number" && apart !== null && apart <= tol + 1e-9;
      const status = inside ? "within_tolerance" : "open";

      // Safe to repeat: the same difference on the same values is not raised twice.
      history ??= await ports.readHistory(key);
      const seen = history.differences.find(
        (d) => d.field === field && d.status === status && agree(d.valueA, valueA) && agree(d.valueB, valueB),
      );

      if (inside) {
        within += 1;
        if (!seen) await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        continue;
      }

      open += 1;
      if (!seen) {
        const d = await ports.raiseDifference({ runId, key, field, valueA, valueB, masterValue, status });
        await ports.proposeCorrection({ differenceId: d.id, proposedValue: masterValue, target: flip(master) });
      }
      if (apart !== null && typeof valueA === "number" && apart > contract.threshold.amount) {
        overAmount.push({ key, field, valueA, valueB, masterValue, apart });
      }
    }

    if (open > 0) mismatched += 1;
    else if (within > 0) withinTolerance += 1;
    else matched += 1;
  }

  // 5. Gas with no partner record, each with a reason and the owner.
  for (const [key] of logLines) {
    if (jobLines.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "a",
      reason: `The cylinder log shows gas charged or recovered under ${key}, but the job system holds no refrigerant record for that job and cylinder. The gas is not accounted for on any job yet.`,
      owner,
    });
  }
  for (const [key] of jobLines) {
    if (logLines.has(key)) continue;
    orphaned += 1;
    await ports.raiseOrphan({
      runId,
      key,
      source: "b",
      reason: `The job system records refrigerant under ${key}, but no cylinder log line for that job and cylinder exists. Nobody has logged the cylinder it came from or went into.`,
      owner,
    });
  }

  // 6. Thresholds reach the named person this run, before it publishes.
  for (const o of overAmount) {
    await ports.notify({
      to: owner,
      reason: "two-records.over_threshold_amount",
      detail: `${o.key}, ${o.field}: cylinder log ${show(o.valueA)}, job system ${show(o.valueB)}, master ${show(o.masterValue)}. Apart by ${show(o.apart)}, over the declared ${show(contract.threshold.amount)}.`,
    });
  }
  if (paired > 0 && mismatched / paired > contract.threshold.mismatchRate) {
    await ports.escalate(
      "two-records.mismatch_rate_exceeded",
      `${mismatched} of ${paired} cylinder lines do not reconcile with their job, over the declared rate of ${contract.threshold.mismatchRate}. Owner: ${owner}.`,
    );
  }

  // 7. Publish, every run, all-clear included.
  await ports.publishRun({
    runId,
    contractId: contract.id,
    joinedOn: contract.key,
    masterByField: { ...masterByField },
    matched,
    withinTolerance,
    mismatched,
    orphaned,
    corrected,
  });
}

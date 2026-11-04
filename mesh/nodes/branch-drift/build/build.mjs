/**
 * Branch Drift: check every branch or franchise against the network's key
 * contract on a schedule, score each one with one definition, publish each
 * branch its own report every period (all-clear included), and put a branch
 * past its threshold in front of one named person.
 *
 * Built to AIP-BS-MULTI-SITE-CONFORMANCE 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard
 *
 * A smoke alarm, never the fire brigade. Everything goes through the ports.
 * It never edits, closes or deletes a branch's record, never renames a key and
 * never changes who is in a group. The only things it writes are the reports
 * (one per branch, each with the centre's copy at the same detail) and the
 * routing of a breach to a named person. What to do about a drifting branch,
 * accepting a local variation, and any change to the contract stay with a
 * person.
 */

/** The centre's reader id. Every branch report is visible to it and to the branch. */
export const CENTRE = "centre";

/** Default routing threshold: this many open findings in one period. */
export const DEFAULT_THRESHOLD = 2;

/** The two kinds that look like a quiet branch. One of them alone crosses the threshold. */
const HIDING_KINDS = new Set(["shadow_register", "silence"]);

/**
 * A distribution list is not a person. An address with "all", "team", "branches",
 * "staff" or "everyone" as its local part, or a comma-separated list, owns nothing.
 */
export function isNamedPerson(owner) {
  if (typeof owner !== "string" || owner.trim() === "") return false;
  if (owner.includes(",") || owner.includes(";")) return false;
  const local = owner.split("@")[0].toLowerCase();
  return !/(^|[-_.\s])(all|team|teams|branches|branch|staff|everyone|franchisees|network|list)([-_.\s]|$)/.test(local);
}

/** Schema drift Branch Drift computes itself, from the contract, over records the access group puts in this segment. */
function schemaFindings(contract, recordsInSegment, segmentId) {
  const out = [];
  for (const rec of recordsInSegment) {
    const missing = contract.requiredFields.filter((f) => !(f in (rec.fields ?? {})) || rec.fields[f] === "");
    if (missing.length > 0) {
      out.push({ segmentId, kind: "schema", detail: `record ${rec.id}: missing required key(s) ${missing.join(", ")} (contract v${contract.version})` });
    }
  }
  return out;
}

/**
 * The scheduled run (schedule.tick). Reads the contract, works out which branch
 * owns each record from its access group, runs the four drift checks, computes
 * each measure once, publishes every branch its report, routes breaches.
 *
 * config.proposals: field changes branches asked for, validated at the source.
 * config.intake: records arriving into a branch, validated at the gate.
 * config.thresholds: { [segmentId]: n } overrides DEFAULT_THRESHOLD.
 * config.openExceptions: segment ids with an exception already open with a
 *   named person. The report still publishes (its absence must never be the
 *   signal), but the routing is not raised again until that person closes it.
 */
export async function build(ports, config = {}) {
  // Changes and records that arrived since the last run go through the gate first.
  for (const p of config.proposals ?? []) proposeChange(ports, p);
  for (const i of config.intake ?? []) intake(ports, i.segmentId, i.record);

  const contract = ports.readContract();
  if (!contract || typeof contract.version !== "string" || !Array.isArray(contract.requiredFields)) {
    ports.escalate("multisite.contract_unversioned", "the key contract could not be read as a versioned document; nothing was scored");
    return { published: 0 };
  }
  const segments = ports.readSegments();
  const records = ports.readRecords();

  // Membership from the access group, never the typed label.
  const bySegment = new Map(segments.map((s) => [s.id, []]));
  for (const rec of records) {
    const seg = ports.segmentOf(rec.id);
    if (seg && bySegment.has(seg)) bySegment.get(seg).push(rec);
  }

  // One definition of every measure, computed once per segment per run, in one place.
  const measures = {};
  for (const measure of Object.keys(contract.measures ?? {})) {
    measures[measure] = {};
    for (const s of segments) {
      const m = ports.computeMeasure(measure, s.id);
      if (m) measures[measure][s.id] = m;
    }
  }

  const open = new Set(config.openExceptions ?? []);
  const results = [];
  for (const s of segments) {
    const detected = ports.detectDrift(s.id);
    const mine = schemaFindings(contract, bySegment.get(s.id) ?? [], s.id);
    // Merge without double-counting a finding the detector already reported.
    const seen = new Set(detected.map((f) => `${f.kind}|${f.detail}`));
    const findings = [...detected, ...mine.filter((f) => !seen.has(`${f.kind}|${f.detail}`))].map((f) => ({ ...f, segmentId: s.id }));

    // Publish regardless of the numbers. The branch and the centre see the same findings.
    ports.publishReport(findings, [s.id, CENTRE]);

    const threshold = config.thresholds?.[s.id] ?? DEFAULT_THRESHOLD;
    const breached = findings.length >= threshold || findings.some((f) => HIDING_KINDS.has(f.kind));
    if (breached && !open.has(s.id)) {
      const detail = `${s.name}: ${findings.length} drift finding(s) this period (${[...new Set(findings.map((f) => f.kind))].join(", ")}), contract v${contract.version}`;
      if (isNamedPerson(s.owner)) {
        ports.notifyPerson(s.owner, detail);
      } else {
        // Nobody on a list owns it. Raise it for a person to name an owner.
        ports.escalate("multisite.no_named_owner", `${detail}; owner "${s.owner}" is not a named person`);
      }
    }
    results.push({ segmentId: s.id, findings: findings.length, breached });
  }
  return { published: segments.length, contractVersion: contract.version, results, measures };
}

/**
 * A branch proposes a change to its fields. It goes to validation at the
 * source: an addition is local colour, a rename or a second key for the same
 * thing is a second system and is refused there, not reported later.
 */
export function proposeChange(ports, proposal) {
  const res = ports.proposeField(proposal);
  if (!res.accepted && proposal.intent !== "add") {
    // A change to the contract itself is a version bump a person decides.
    ports.escalate("multisite.contract_change_requested", `${proposal.segmentId} asked to ${proposal.intent} ${proposal.field}: ${res.why ?? "refused at validation"}`);
  }
  return res;
}

/**
 * A record arriving into a branch. Validated against the contract at the gate;
 * a branch whose gates are not live takes nothing, and that refusal goes to a
 * person to decide whether the branch is ready.
 */
export function intake(ports, segmentId, record) {
  const res = ports.writeRecord(segmentId, record);
  if (!res.accepted && /gates are not live/.test(res.why ?? "")) {
    ports.escalate("multisite.segment_not_ready", `${segmentId}: record ${record.id} refused, gates not live`);
  }
  return res;
}

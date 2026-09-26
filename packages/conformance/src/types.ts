// GENERATED FILE. Do not edit.
// Source: website_consulting/src/lib/standards/types.ts
// Rebuild: node scripts/build-conformance-package.mjs
/**
 * What a check is, shared across every standard.
 *
 * Extracted from `booked-after-hours.checks.ts` on 2026-09-19, the moment a
 * second standard needed it. See
 * `voice-office/docs/strategy/protocol-runtime-and-fixtures.md`.
 *
 * WHAT PORTING THE SECOND STANDARD TAUGHT, because it broke the first model
 * within twelve checks. Booked After Hours is a CALL standard: one conversation,
 * asserted turn by turn. Debtor Chasing is a RUN standard: a book of rows,
 * ranked and gated before anybody is dialled. Three consequences:
 *
 * 1. **The port vocabulary is not universal.** A ledger standard never touches
 *    `resolve_address` or `write_job`, and a call standard never touches `rank`.
 *    The union below is a superset, and each standard uses its own slice.
 * 2. **The runner owns the clock.** "An 8:30pm run holds until morning" makes
 *    time part of the stimulus, not of the environment it happens to run in.
 * 3. **Some checks are not runtime-assertable at all**, and pretending otherwise
 *    would be the dishonest kind of green. "Mobile coverage was checked first"
 *    is a claim about what the builder did before writing code. A runner can
 *    prove the build CARRIES the measurement; it cannot prove the measurement is
 *    true or that it came first. That earns `precondition`, and a verdict of its
 *    own, because the next action is to go and measure rather than to send us a
 *    fixture.
 */

/** Where a check can be proved. */
export type Assertable =
  /** Provable on the stub alone: the runner owns the stimulus and the world. */
  | "stub"
  /** Only a live call proves it: real telephony, real geocoder, real tenant. */
  | "production"
  /** Shape on the stub, truth only live. Both verdicts are meaningful. */
  | "both"
  /**
   * Not a runtime property. A claim about what was done before the build, whose
   * evidence is an artefact rather than a trace. Never silently counted as green.
   */
  | "precondition";

/**
 * Every port any standard observes. A standard uses its own slice; the union is
 * deliberately a superset so one vocabulary covers calls, books and documents.
 */
/**
 * The one list. `Port` is derived from it rather than declared beside it: a test
 * that kept its own copy of this set went stale within an hour of the array
 * growing, which is the same two-lists bug this whole exercise exists to remove.
 */
export const ALL_PORTS = [
  // conversation
  "talk",
  "disclose",
  "escalate",
  "notify",
  "send_sms",
  // job system
  "resolve_address",
  "write_job",
  "read_job",
  // quoting. `read_pricebook` is deliberately a READ: the standard that uses
  // these refuses to invent a price, so the only sanctioned source of a rate
  // is the customer's own price list. `draft_quote` is a write into their
  // system of record, never a document we render and hold.
  "read_pricebook",
  "draft_quote",
  // ledger
  "read_ledger",
  "record_promise",
  // asset register
  "read_asset",
  "record_service",
  "evidence",
  // rules and answers
  "read_rule",
  "answer",
  "cite",
  "issue_notice",
  // lists and segments
  "read_contacts",
  "read_segment",
  "publish_report",
  // money out
  "write_ledger",
  "release_payment",
  // the advice file. `record_consent` is a WRITE, not a `say`: the standard
  // does not sell the call, it asserts that the disclosure was recorded on
  // the interview before the first field was written. `raise_task` is a
  // record with an owner and a due date, which a chat reminder is not.
  "record_consent",
  "read_file",
  "write_file",
  "raise_task",
  // the graph. Nodes are the customer's own library, versioned and accepted;
  // reading one is a read of their record, never of a model's memory.
  "read_node",
  "write_node",
  // the run itself
  "rank",
  "gate",
] as const;

export type Port = (typeof ALL_PORTS)[number];

/**
 * Every port, as a verb and a subject.
 *
 * WHY BOTH EXIST. Measured across 118 checks in ten standards: no standard uses
 * more than 10 distinct ports and the median is 6, so the union is never a
 * burden on an implementer. But it has a long tail (`read_rule` in 8 standards,
 * nine ports in exactly one), and a trace with 24 differently-shaped entries
 * needs a special case per port in the assertion engine.
 *
 * So the two consumers get what each needs from one mapping. A STANDARD keeps
 * the specific name, because `record_promise` tells a builder more than
 * `write(promise)`. A TRACE gets a uniform `{verb, subject}`, so an assertion
 * can match on shape. Nothing is lost in either direction.
 *
 * The test proves this is TOTAL: a new port cannot be added without giving it a
 * verb and a subject, which is the thing that would quietly reintroduce the
 * special cases.
 */
export const PORT_SHAPE: Record<Port, { verb: PortVerb; subject: string }> = {
  // read
  read_ledger: { verb: "read", subject: "ledger" },
  read_job: { verb: "read", subject: "job" },
  read_asset: { verb: "read", subject: "asset" },
  read_rule: { verb: "read", subject: "rule" },
  read_contacts: { verb: "read", subject: "contacts" },
  read_segment: { verb: "read", subject: "segment" },
  resolve_address: { verb: "read", subject: "address" },
  // write
  write_job: { verb: "write", subject: "job" },
  read_pricebook: { verb: "read", subject: "pricebook" },
  draft_quote: { verb: "write", subject: "quote" },
  write_ledger: { verb: "write", subject: "ledger" },
  record_promise: { verb: "write", subject: "promise" },
  record_service: { verb: "write", subject: "service_record" },
  release_payment: { verb: "write", subject: "payment" },
  // say
  talk: { verb: "say", subject: "turn" },
  disclose: { verb: "say", subject: "disclosure" },
  send_sms: { verb: "say", subject: "sms" },
  notify: { verb: "say", subject: "alert" },
  escalate: { verb: "say", subject: "handoff" },
  issue_notice: { verb: "say", subject: "notice" },
  answer: { verb: "say", subject: "answer" },
  publish_report: { verb: "say", subject: "report" },
  // the advice file and the graph
  record_consent: { verb: "write", subject: "consent" },
  read_file: { verb: "read", subject: "file" },
  write_file: { verb: "write", subject: "file" },
  raise_task: { verb: "write", subject: "task" },
  read_node: { verb: "read", subject: "node" },
  write_node: { verb: "write", subject: "node" },
  // attach
  evidence: { verb: "attach", subject: "evidence" },
  cite: { verb: "attach", subject: "citation" },
  // decide
  rank: { verb: "decide", subject: "order" },
  gate: { verb: "decide", subject: "gate" },
};

export type PortVerb = "read" | "write" | "say" | "attach" | "decide";

export interface Check {
  /** Stable across versions. The thing a red fixture names. */
  id: string;
  n: number;
  title: string;
  /** What conformance means, in the words the page shows. */
  statement: string;
  assertable: Assertable;
  ports: Port[];
  /** What the runner injects. For a precondition, what evidence is wanted. */
  stimulus: string;
  /** What the runner looks at afterwards. The seed of the executable assertion. */
  assertion: string;
  /** Required wherever the stub proves less than the whole claim. */
  stubLimit?: string;
}

/**
 * What the runner prints for one check, and why there are five rather than two.
 *
 * The test of a verdict vocabulary is whether each state maps to a different
 * next action. These do:
 *
 *   pass              nothing to do
 *   fail              this is a fixture. Send it, get a price for that check
 *   shape_only        re-runs itself when you flip the provider to production
 *   with_us           point the number. The step the standard said not to
 *                     hand-roll, and the only one that is ours
 *   evidence_required go and do the thing, then attach what proves it. No
 *                     software change will turn this green
 *
 * Only `fail` is paid work. `with_us` is the product. `evidence_required` is
 * homework, and calling it a pass would be the most expensive lie on the list.
 */
export type Verdict = "pass" | "fail" | "shape_only" | "with_us" | "evidence_required";

export type Environment = "stub" | "production";

/**
 * The verdict for one check, given where it ran and whether its assertion held.
 * `held` is undefined when the check could not be evaluated at all.
 */
export function verdictFor(
  check: Check,
  env: Environment,
  held: boolean | undefined,
): Verdict {
  // A precondition is never green by running software, in either environment.
  if (check.assertable === "precondition") {
    return held === true ? "pass" : "evidence_required";
  }
  if (env === "stub" && check.assertable === "production") return "with_us";
  if (held === false) return "fail";
  if (env === "stub" && check.assertable === "both") return "shape_only";
  return "pass";
}

export interface Tally {
  total: number;
  /** Provable without paying us: stub and both, but never production. */
  onStub: number;
  productionOnly: number;
  /** Shape now, truth at the production flip. */
  partial: number;
  /** Needs an artefact from the builder, not a code change. */
  preconditions: number;
}

export function assertableTally(checks: readonly Check[]): Tally {
  return {
    total: checks.length,
    onStub: checks.filter((c) => c.assertable === "stub" || c.assertable === "both").length,
    productionOnly: checks.filter((c) => c.assertable === "production").length,
    partial: checks.filter((c) => c.assertable === "both").length,
    preconditions: checks.filter((c) => c.assertable === "precondition").length,
  };
}

/** The conformance checklist a page renders, derived rather than retyped. */
export function checklistFrom(
  checks: readonly Check[],
): ReadonlyArray<readonly [string, string]> {
  return checks.map((c) => [c.title, c.statement] as const);
}

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
];
const word = (n: number) => WORDS[n] ?? String(n);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * What the production-only checks actually need, in the words of the standard
 * rather than a guess.
 *
 * WHY THIS IS DERIVED. The sentence used to hardcode "a live call", which was
 * true of every standard until Quote Out (2026-09-21), whose one production
 * check is an authenticated write into a ServiceM8, Simpro or Xero tenant and
 * involves no telephony at all. The wrong noun reached the machine surface as
 * well as the page: `/api/agent/checks/quote-out-build-standard` told an agent
 * the last check was a live call, which would have it looking for a phone
 * number that does not exist in the spec.
 *
 * So the noun comes from the ports the production checks observe. A standard
 * that talks needs a live line; one that only writes needs a real tenant.
 */
function productionNoun(checks: readonly Check[]): { one: string; many: string } {
  const ports = new Set(
    checks.filter((c) => c.assertable === "production").flatMap((c) => c.ports),
  );
  const talks = ports.has("talk") || ports.has("disclose");
  return talks
    ? { one: "a live call", many: "live calls" }
    : { one: "a live tenant", many: "live tenants" };
}

/**
 * The sentence the runner and the page both use, generated so they cannot drift.
 * Leads with what the builder keeps, because most of it is theirs and the
 * framing should not open with the part we sell.
 */
export function ownershipLine(checks: readonly Check[]): string {
  const t = assertableTally(checks);
  const noun = productionNoun(checks);
  const ours =
    t.productionOnly === 0
      ? ""
      : t.productionOnly === 1
        ? ` The last one is ${noun.one}, and that one runs with us.`
        : ` The remaining ${word(t.productionOnly)} are ${noun.many}, and those run with us.`;
  const homework =
    t.preconditions === 0
      ? ""
      : t.preconditions === 1
        ? " One is not a software check at all: it asks what you measured before you started."
        : ` ${cap(word(t.preconditions))} are not software checks at all: they ask what you measured before you started.`;
  return (
    `${cap(word(t.onStub))} of these ${word(t.total)} checks run on your own machine, ` +
    `against the stub, before you talk to anybody.${ours}${homework}`
  );
}

/**
 * One scenario per check of two-records-build-standard, for Deal Match.
 *
 * Scaffolded by `npx @aipathway/conformance init two-records-build-standard`
 * from https://aipathway.com.au/explore-ai/two-records-build-standard and
 * filled in here. The checks themselves are fetched at run time.
 *
 * The pair: the CRM (source a) holds each sales deal; Simpro (source b) holds
 * the quote the deal is for. They join on the Simpro quote id, which the CRM
 * deal carries. Field ownership is the contract: Simpro owns the quote value
 * (Australian cents, ex GST), the stage and the Simpro customer id; the CRM
 * owns the contact name and contact email.
 *
 * Every `holds` reads what the world recorded through its ports, never the
 * build's own memory, and returns a strict true or false.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-03T21:00:00.000Z"); // 7:00am Brisbane, the daily run
const OWNER = "Mark Ellis, sales administration";
const ACCEPTOR = "Mark Ellis";

/** Written by a person: which system is right about which field. */
const CONTRACT = {
  id: "crm-simpro-deals-2026-11-02",
  sourceA: "CRM",
  sourceB: "Simpro",
  key: "simpro_quote_id",
  masterByField: {
    quote_value: "b",
    stage: "b",
    customer_id: "b",
    contact_name: "a",
    contact_email: "a",
  },
  toleranceByField: { quote_value: 99 }, // the CRM keeps whole dollars; nothing else has any
  threshold: { amount: 500_000, mismatchRate: 0.25 }, // $5,000 ex GST, a quarter of joined deals
  schedule: "daily 07:00 Australia/Brisbane",
  owner: OWNER,
};

const deal = (key, contact, over = {}) => ({
  key,
  name: contact,
  fields: {
    quote_value: 1_850_000,
    stage: "quoted",
    customer_id: "SP-CUST-310",
    contact_name: contact,
    contact_email: `${contact.toLowerCase().split(" ")[0]}@sunshinefitouts.com.au`,
    ...over,
  },
});
const world = (a, b, contract = CONTRACT) => new TwoRecordsWorld({ now: NOW, contract, sourceA: a, sourceB: b });

const callsTo = (w, port, pred = () => true) => w.calls.filter((c) => c.port === port && pred(c));
const firstAt = (w, port, pred = () => true) => w.calls.findIndex((c) => c.port === port && pred(c));
const lastRun = (w) => w.runs[w.runs.length - 1];
const diff = (w, key, field) => w.differences.find((d) => d.key === key && d.field === field);
const sameOwners = (x, y) => {
  const kx = Object.keys(x ?? {}).sort();
  const ky = Object.keys(y ?? {}).sort();
  return kx.length === ky.length && kx.every((k, i) => k === ky[i] && x[k] === y[k]);
};
const COUNTS = ["matched", "withinTolerance", "mismatched", "orphaned", "corrected"];
const hasCounts = (r) => COUNTS.every((k) => Number.isInteger(r[k]) && r[k] >= 0) && typeof r.publishedAt === "string";
const brief = (w) =>
  `${w.calls.length} port call(s); runs ${w.runs.map((r) => COUNTS.map((k) => `${k}=${r[k]}`).join(" ")).join(" | ") || "none"}; ` +
  `differences ${w.differences.map((d) => `${d.key}.${d.field} ${d.valueA}/${d.valueB} owner ${d.masterValue} ${d.status}`).join("; ") || "none"}`;

/** Run; a named person accepts the open proposal an hour later; run again. */
const runAcceptRun = async (b, w, key, field) => {
  await b(w.ports());
  w.advance(HOUR);
  const d = w.differences.find((x) => x.key === key && x.field === field && x.status === "open");
  if (d) w.accept(d.id, ACCEPTOR);
  w.advance(HOUR);
  await b(w.ports());
};

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    // 1. Contract read first. The owner per field is the contract's: the CRM's contact email wins
    //    on email, Simpro's stage wins on stage. One guessed master for everything gets one wrong.
    world: () =>
      world(
        [
          deal("Q-41001", "Leah Brennan", { contact_email: "leah.b@sunshinefitouts.com.au" }),
          deal("Q-41002", "Tom Okafor", { stage: "quoted" }),
          deal("Q-41003", "Sam Whitley"),
        ],
        [
          deal("Q-41001", "Leah Brennan", { contact_email: "leah@sunshinefitouts.com.au" }),
          deal("Q-41002", "Tom Okafor", { stage: "won" }),
          deal("Q-41003", "Sam Whitley"),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const contractAt = firstAt(w, "read_ledger", (c) => c.request?.contract === true);
      const aAt = firstAt(w, "read_job", (c) => c.request?.source === "a");
      const bAt = firstAt(w, "read_ledger", (c) => c.request?.source === "b");
      const run = lastRun(w);
      const email = diff(w, "Q-41001", "contact_email");
      const stage = diff(w, "Q-41002", "stage");
      return (
        contractAt >= 0 &&
        aAt > contractAt &&
        bAt > contractAt &&
        w.runs.length === 1 &&
        run.contractId === CONTRACT.id &&
        run.joinedOn === CONTRACT.key &&
        sameOwners(run.masterByField, CONTRACT.masterByField) &&
        email !== undefined &&
        email.masterValue === "leah.b@sunshinefitouts.com.au" &&
        stage !== undefined &&
        stage.masterValue === "won"
      );
    },
    describe: brief,
  },
  {
    checkId: "keys-join-ids-not-labels",
    // 2. Same contact and same value, different quote ids: not a pair, two orphans.
    world: () =>
      world(
        [deal("Q-42001", "Leah Brennan", { stage: "quoted" }), deal("Q-42002", "Tom Okafor")],
        [deal("Q-42009", "Leah Brennan", { stage: "lost" }), deal("Q-42002", "Tom Okafor")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const crossed = w.differences.some((d) => d.key === "Q-42001" || d.key === "Q-42009");
      const orphanA = w.orphans.some((o) => o.key === "Q-42001" && o.source === "a");
      const orphanB = w.orphans.some((o) => o.key === "Q-42009" && o.source === "b");
      return run.joinedOn === CONTRACT.key && !crossed && run.matched === 1 && run.orphaned === 2 && orphanA && orphanB;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key}`).join(", ") || "none"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    // 3. Five shared quotes: three agree, two have a different value in the CRM.
    world: () =>
      world(
        [
          deal("Q-43001", "Leah Brennan"),
          deal("Q-43002", "Tom Okafor"),
          deal("Q-43003", "Sam Whitley"),
          deal("Q-43004", "Nina Pham", { quote_value: 900_000 }),
          deal("Q-43005", "Raj Iyer", { quote_value: 2_400_000 }),
        ],
        [
          deal("Q-43001", "Leah Brennan"),
          deal("Q-43002", "Tom Okafor"),
          deal("Q-43003", "Sam Whitley"),
          deal("Q-43004", "Nina Pham", { quote_value: 960_000 }),
          deal("Q-43005", "Raj Iyer", { quote_value: 2_100_000 }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const silent = !w.differences.some((d) => ["Q-43001", "Q-43002", "Q-43003"].includes(d.key));
      const d4 = diff(w, "Q-43004", "quote_value");
      const d5 = diff(w, "Q-43005", "quote_value");
      const shaped =
        d4 !== undefined && d4.valueA === 900_000 && d4.valueB === 960_000 && d4.masterValue === 960_000 && d4.status === "open" &&
        d5 !== undefined && d5.valueA === 2_400_000 && d5.valueB === 2_100_000 && d5.masterValue === 2_100_000 && d5.status === "open";
      const untouched = callsTo(w, "write_ledger").length === 0 && w.changedFields().length === 0;
      return silent && shaped && untouched && w.differences.length === 2 && run.matched === 3 && run.mismatched === 2;
    },
    describe: brief,
  },
  {
    checkId: "nothing-is-auto-corrected",
    // 4. The CRM has a new contact email Simpro lacks. Staged, accepted by a named person an hour
    //    later, written to Simpro once. A run the next day writes nothing more.
    world: () =>
      world(
        [deal("Q-44001", "Leah Brennan", { contact_email: "leah.b@sunshinefitouts.com.au" })],
        [deal("Q-44001", "Leah Brennan", { contact_email: "leah@sunshinefitouts.com.au" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "Q-44001", "contact_email");
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const writes = callsTo(w, "write_ledger");
      const acc = w.acceptances[0];
      if (writes.length !== 1 || !acc) return false;
      const write = writes[0];
      const writeAt = w.calls.indexOf(write);
      const proposeAt = firstAt(w, "gate", (c) => c.request?.propose === acc.differenceId);
      return (
        proposeAt >= 0 &&
        proposeAt < writeAt &&
        write.at >= acc.acceptedAt &&
        write.request.source === "b" &&
        write.request.key === "Q-44001" &&
        write.request.field === "contact_email" &&
        write.request.value === "leah.b@sunshinefitouts.com.au" &&
        write.request.correction?.acceptedBy === ACCEPTOR &&
        w.recordOf("b", "Q-44001")?.fields.contact_email === "leah.b@sunshinefitouts.com.au"
      );
    },
    describe: (w) =>
      `${brief(w)}; writes ${callsTo(w, "write_ledger").map((c) => `${c.at} ${c.request.key}.${c.request.field} by ${c.request.correction?.acceptedBy ?? "nobody"}`).join("; ") || "none"}`,
  },
  {
    checkId: "orphans-are-a-queue",
    // 5. A CRM deal pointing at a quote Simpro lacks, and a Simpro quote no deal carries.
    world: () =>
      world(
        [deal("Q-45001", "Leah Brennan"), deal("Q-45002", "Tom Okafor")],
        [deal("Q-45002", "Tom Okafor"), deal("Q-45009", "Sam Whitley")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const ok = (key, source) => {
        const o = w.orphans.find((x) => x.key === key && x.source === source);
        const handed = callsTo(w, "escalate", (c) => c.request?.orphan === key && c.request?.owner === OWNER).length === 1;
        return o !== undefined && typeof o.reason === "string" && o.reason.trim().length > 0 && o.owner === OWNER && handed;
      };
      return w.orphans.length === 2 && ok("Q-45001", "a") && ok("Q-45009", "b") && run.orphaned === 2 && callsTo(w, "write_ledger").length === 0;
    },
    describe: (w) => `${brief(w)}; orphans ${w.orphans.map((o) => `${o.source}:${o.key} to ${o.owner}`).join(", ") || "none"}`,
  },
  {
    checkId: "tolerance-is-written-down",
    // 6. 99 cents declared on the quote value, nothing on the customer id. 45 cents off is within
    //    tolerance; $120 off is open; a different customer id is open.
    world: () =>
      world(
        [
          deal("Q-46001", "Leah Brennan", { quote_value: 1_850_000 }),
          deal("Q-46002", "Tom Okafor", { quote_value: 1_850_000 }),
          deal("Q-46003", "Sam Whitley", { customer_id: "SP-CUST-311" }),
        ],
        [
          deal("Q-46001", "Leah Brennan", { quote_value: 1_850_045 }),
          deal("Q-46002", "Tom Okafor", { quote_value: 1_862_000 }),
          deal("Q-46003", "Sam Whitley", { customer_id: "SP-CUST-310" }),
        ],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const run = lastRun(w);
      if (!run) return false;
      const declaredOnly = w.differences
        .filter((x) => x.status === "within_tolerance")
        .every((x) => Object.prototype.hasOwnProperty.call(CONTRACT.toleranceByField, x.field));
      return (
        diff(w, "Q-46001", "quote_value")?.status === "within_tolerance" &&
        diff(w, "Q-46002", "quote_value")?.status === "open" &&
        diff(w, "Q-46003", "customer_id")?.status === "open" &&
        declaredOnly &&
        run.withinTolerance === 1 &&
        run.mismatched === 2 &&
        w.changedFields().length === 0
      );
    },
    describe: brief,
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    // 7. Everything agrees; two daily runs; both publish an all-clear with all five counts.
    world: () =>
      world(
        [deal("Q-47001", "Leah Brennan"), deal("Q-47002", "Tom Okafor"), deal("Q-47003", "Sam Whitley")],
        [deal("Q-47001", "Leah Brennan"), deal("Q-47002", "Tom Okafor"), deal("Q-47003", "Sam Whitley")],
      ),
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      if (w.runs.length !== 2) return false;
      const allClear = w.runs.every(
        (r) => hasCounts(r) && r.matched === 3 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0,
      );
      return allClear && callsTo(w, "publish_report").length === 2 && w.runs[0].id !== w.runs[1].id && w.runs[0].publishedAt < w.runs[1].publishedAt;
    },
    describe: brief,
  },
  {
    checkId: "thresholds-route-to-a-person",
    // 8. Simpro's quote was revised up $8,000 and the CRM deal was not: over the $5,000 amount,
    //    and one in three tips the run over the 25% rate.
    world: () =>
      world(
        [deal("Q-48001", "Leah Brennan", { quote_value: 3_200_000 }), deal("Q-48002", "Tom Okafor"), deal("Q-48003", "Sam Whitley")],
        [deal("Q-48001", "Leah Brennan", { quote_value: 4_000_000 }), deal("Q-48002", "Tom Okafor"), deal("Q-48003", "Sam Whitley")],
      ),
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const publishAt = firstAt(w, "publish_report");
      const told = firstAt(w, "notify", (c) => c.request?.to === OWNER && /Q-48001/.test(c.request?.detail ?? ""));
      const escalated = firstAt(w, "escalate", (c) => /rate/i.test(c.request?.reason ?? ""));
      return w.runs.length === 1 && publishAt >= 0 && told >= 0 && told < publishAt && escalated >= 0 && escalated < publishAt;
    },
    describe: (w) =>
      `${brief(w)}; notices ${w.notices.map((n) => `${n.to}: ${n.reason}`).join("; ") || "none"}; escalations ${w.escalations.map((e) => e.reason).join("; ") || "none"}`,
  },
  {
    checkId: "history-survives-the-fix",
    // 9. The CRM still shows the deal as quoted; Simpro says won and owns the stage. Accepted,
    //    written to the CRM once, both originals kept on the Difference.
    world: () => world([deal("Q-49001", "Leah Brennan", { stage: "quoted" })], [deal("Q-49001", "Leah Brennan", { stage: "won" })]),
    drive: (b, w) => runAcceptRun(b, w, "Q-49001", "stage"),
    holds: (w) => {
      const d = diff(w, "Q-49001", "stage");
      if (!d) return false;
      const c = w.correctionFor(d.id);
      const changed = w.changedFields();
      const everyChangeBacked = changed.every((f) =>
        w.corrections.some((k) => {
          const kd = w.differences.find((x) => x.id === k.differenceId);
          return kd !== undefined && kd.key === f.key && kd.field === f.field && k.target === f.source && Boolean(k.writtenId) && Boolean(k.acceptedBy);
        }),
      );
      const acc = w.acceptances.find((a) => a.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "Q-49001");
      const onlyAccepted = acc !== undefined && writes.length === 1 && writes[0].at >= acc.acceptedAt && writes[0].request.correction?.acceptedBy === ACCEPTOR;
      return (
        onlyAccepted &&
        w.recordOf("a", "Q-49001")?.fields.stage === "won" &&
        d.valueA === "quoted" &&
        d.valueB === "won" &&
        d.masterValue === "won" &&
        c !== undefined &&
        c.target === "a" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.acceptedAt === "string" &&
        typeof c.writtenId === "string" &&
        c.writtenId.length > 0 &&
        changed.length === 1 &&
        everyChangeBacked
      );
    },
    describe: (w) =>
      `${brief(w)}; corrections ${w.corrections.map((c) => `${c.differenceId} to ${c.target} by ${c.acceptedBy ?? "nobody"} id ${c.writtenId ?? "none"}`).join("; ") || "none"}`,
  },
  {
    checkId: "the-record-by-key",
    // 10. Contact name differs in one run, accepted, written in the next: the record by that
    //     quote id tells the whole story.
    world: () =>
      world(
        [deal("Q-50001", "Nina Pham", { contact_name: "Nina Pham-Kelly" })],
        [deal("Q-50001", "Nina Pham", { contact_name: "Nina Pham" })],
      ),
    drive: async (b, w) => {
      await runAcceptRun(b, w, "Q-50001", "contact_name");
      w.ports().readHistory("Q-50001"); // the question somebody asks: why does Simpro say this?
    },
    holds: (w) => {
      const h = w.historyFor("Q-50001");
      const d = h.differences.find((x) => x.field === "contact_name");
      if (!d) return false;
      const c = h.corrections.find((x) => x.differenceId === d.id);
      const writes = callsTo(w, "write_ledger", (x) => x.request?.key === "Q-50001");
      return (
        writes.length === 1 &&
        c !== undefined &&
        writes[0].response?.writtenId === c.writtenId &&
        h.runs.some((r) => r.id === d.runId) &&
        d.valueA === "Nina Pham-Kelly" &&
        d.valueB === "Nina Pham" &&
        c.acceptedBy === ACCEPTOR &&
        typeof c.writtenId === "string" &&
        w.recordOf("b", "Q-50001")?.fields.contact_name === "Nina Pham-Kelly"
      );
    },
    describe: (w) => {
      const h = w.historyFor("Q-50001");
      return `${brief(w)}; history: ${h.runs.length} run(s), ${h.differences.length} difference(s), ${h.corrections.length} correction(s)`;
    },
  },
  {
    checkId: "survives-the-builder",
    // 11. A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build is public in digitalgym/aipathway-standards, maintained by AI Pathway;
    // the contract and the runs live on the business's own CRM and Simpro accounts. A second person
    // explaining it is evidence, not code.
    world: () => world([], []),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the business's own CRM and Simpro, with a person accepting the seeded
// change. No live port map is published for this standard, so run.mjs refuses a production run and
// the stub reports it as with_us. Not built here.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

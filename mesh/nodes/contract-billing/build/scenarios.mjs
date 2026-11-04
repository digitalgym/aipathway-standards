/**
 * One scenario per check of invoice-out-build-standard, for Contract Billing.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard; what is here
 * is the world each check starts in, how the build is driven, and what "held"
 * means, in a fire and electrical maintenance business's terms.
 *
 * The "jobs" are billing periods on maintenance contracts, issued by the job
 * system (MC-<contract>-<period>). The price book is the contract schedule of
 * rates. Every `holds` reads the world, never the build, and returns a strict
 * boolean. `node mutants.mjs` runs these against a do-nothing build and broken
 * builds: every claimed check must go red under at least one.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";

/** The person the business named for contract billing. */
export const OWNER = "Dana Whitfield";
const owners = { billing: OWNER };

/** The contract schedule of rates, as the business keeps it in its ledger items. */
const BOOK = {
  edition: "schedule-2026-07",
  items: [
    { code: "ATT-SITE", description: "Site attendance, per visit", rate: 95 },
    { code: "SVC-EXT-6M", description: "Portable extinguisher, six-monthly service (AS 1851), per unit", rate: 12.5 },
    { code: "SVC-EML-6M", description: "Emergency and exit light, six-monthly test (AS/NZS 2293.2), per fitting", rate: 9 },
    { code: "SVC-FIP-MTH", description: "Fire indicator panel, monthly test, per panel", rate: 85 },
    { code: "CONS-BATT", description: "Panel standby battery, per unit", rate: 48 },
    { code: "VAR-HYD-ADD", description: "Fire hydrant added to the contract, per period", rate: 60 },
  ],
};

const period = (id, lines, extra = {}) => ({ id, customerId: `C-${id.split("-")[1]}`, status: "complete", lines, ...extra });
const L = (code, qty, kind, more = {}) => ({ code, qty, kind, description: code, ...more });

const run = (ev) => (build, world) => build(world.ports(), ev, owners);
const tick = run({ type: "schedule.tick" });
const release = (build, world, jobId) => build(world.ports(), { type: "release", jobId, person: OWNER }, owners);

const describe = (world) =>
  `${world.calls.length} port call(s); invoices ${world.invoices.map((i) => `${i.jobId}:${i.status}${i.parkReason ? "/" + i.parkReason : ""}[${i.lines.map((l) => `${l.code}x${l.qty}@${l.rate}`).join(",")}]`).join(" ") || "none"}; escalations ${world.escalations.map((e) => e.reason).join(",") || "none"}; sends ${world.sends.length}`;

const idx = (world, port, where) => world.firstCall(port, where);
const sendsFor = (world, id) => world.sends.filter((s) => s.invoiceId === id);
const escFor = (world, reason, text) => world.escalations.some((e) => e.reason === reason && (e.detail ?? "").includes(text) && (e.detail ?? "").includes(OWNER));
const one = (world, jobId) => {
  const xs = world.invoicesFor(jobId);
  return xs.length === 1 ? xs[0] : null;
};
const releasedBefore = (world, invoiceId, who) => {
  const s = world.calls.findIndex((c) => c.port === "issue_notice" && c.request?.send === invoiceId);
  if (s < 0) return false;
  return world.calls.slice(0, s).some((c) => c.port === "gate" && c.request?.release === invoiceId && (who.person ? c.request.person === who.person : c.request.rule === who.rule));
};

export const scenarios = [
  {
    checkId: "completion-is-the-trigger",
    // Two billing periods closed by the job system today, one still running.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          period("MC-2201-2026M09", [L("SVC-FIP-MTH", 1, "labour")]),
          period("MC-2202-2026M09", [L("SVC-FIP-MTH", 2, "labour")]),
          { ...period("MC-2203-2026M10", [L("SVC-FIP-MTH", 1, "labour")]), status: "open" },
        ],
      }),
    drive: tick,
    holds: (world) => {
      const read = idx(world, "read_job", (c) => c.request?.jobs === true);
      const firstWrite = idx(world, "write_invoice");
      const complete = read >= 0 ? world.calls[read].response?.complete ?? [] : [];
      const a = one(world, "MC-2201-2026M09");
      const b = one(world, "MC-2202-2026M09");
      return (
        world.invoices.length === 2 &&
        a !== null &&
        b !== null &&
        world.invoicesFor("MC-2203-2026M10").length === 0 &&
        read >= 0 &&
        firstWrite > read &&
        complete.includes("MC-2201-2026M09") &&
        complete.includes("MC-2202-2026M09") &&
        !complete.includes("MC-2203-2026M10")
      );
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // A quarterly period: site attendance, two panels tested, one battery replaced.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [period("MC-2301-2026Q3", [L("ATT-SITE", 1, "callout"), L("SVC-FIP-MTH", 2, "labour"), L("CONS-BATT", 1, "material")])],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "MC-2301-2026Q3");
      const truth = world.job("MC-2301-2026Q3")?.lines ?? [];
      if (!inv || inv.status === "parked") return false;
      const key = (l) => `${l.code}|${l.qty}|${l.kind}`;
      const got = inv.lines.map(key).sort();
      const want = truth.map(key).sort();
      return got.length === 3 && got.length === want.length && got.every((k, i) => k === want[i]);
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // One period carries a code the schedule does not hold; another is fully priced.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          period("MC-2401-2026H2", [L("ATT-SITE", 1, "callout"), L("SVC-EXT-6M", 14, "labour"), L("SVC-SPR-6M", 1, "labour")]),
          period("MC-2402-2026H2", [L("ATT-SITE", 1, "callout"), L("SVC-EML-6M", 22, "labour")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const book = idx(world, "read_pricebook");
      const write = idx(world, "write_invoice");
      const parked = one(world, "MC-2401-2026H2");
      const priced = one(world, "MC-2402-2026H2");
      if (!parked || !priced) return false;
      const ratesTrue = world.invoices.every((i) => i.lines.every((l) => world.rateFor(l.code) !== undefined && l.rate === world.rateFor(l.code)));
      return (
        book >= 0 &&
        write > book &&
        ratesTrue &&
        parked.status === "parked" &&
        parked.parkReason === "not_in_pricebook" &&
        !parked.lines.some((l) => l.code === "SVC-SPR-6M") &&
        priced.status !== "parked" &&
        priced.lines.length === 2 &&
        escFor(world, "not_in_pricebook", "MC-2401-2026H2") &&
        sendsFor(world, parked.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // A hydrant added to two contracts mid-term: one client signed the variation, one did not.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          period("MC-2501-2026Q3", [L("SVC-FIP-MTH", 1, "labour"), L("VAR-HYD-ADD", 1, "variation", { signedAcceptance: "doc:VAR-2501-signed.pdf" })]),
          period("MC-2502-2026Q3", [L("SVC-FIP-MTH", 1, "labour"), L("VAR-HYD-ADD", 1, "variation")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const signed = one(world, "MC-2501-2026Q3");
      const unsigned = one(world, "MC-2502-2026Q3");
      if (!signed || !unsigned) return false;
      return (
        signed.status !== "parked" &&
        signed.lines.some((l) => l.kind === "variation" && l.code === "VAR-HYD-ADD") &&
        signed.evidence.includes("doc:VAR-2501-signed.pdf") &&
        unsigned.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        escFor(world, "unsigned_variation", "MC-2502-2026Q3") &&
        sendsFor(world, unsigned.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // A new building's fire services, serviced through its defects liability period under the head contract.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          period("MC-2601-2026M09", [L("ATT-SITE", 1, "callout"), L("SVC-FIP-MTH", 1, "labour")], { contractStage: "Defects liability period, month 6 of 12" }),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "MC-2601-2026M09");
      if (!inv) return false;
      const text = [
        ...world.invoices.flatMap((i) => [i.notes ?? "", i.stage ?? "", ...i.lines.map((l) => l.code)]),
        ...world.escalations.map((e) => e.detail ?? ""),
      ].join(" | ");
      return inv.stage === "Defects liability period, month 6 of 12" && !/progress\s+claim/i.test(text);
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // The job system fires the period's close twice, an hour apart; the first write
    // of the run for another period comes back with no id.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        failNextWrite: true,
        jobs: [
          period("MC-2701-2026M09", [L("SVC-FIP-MTH", 1, "labour")]),
          period("MC-2702-2026M09", [L("ATT-SITE", 1, "callout"), L("SVC-FIP-MTH", 1, "labour")]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "job.completed" }, owners);
    },
    holds: (world) => {
      const a = one(world, "MC-2701-2026M09");
      const b = one(world, "MC-2702-2026M09");
      const writes = world.calls.filter((c) => c.port === "write_invoice");
      const failed = writes.filter((c) => c.response === null);
      const creates = writes.filter((c) => c.response !== null && !c.request?.update);
      return (
        a !== null &&
        b !== null &&
        Boolean(a.externalId) &&
        Boolean(b.externalId) &&
        failed.length === 1 &&
        failed[0].request?.jobId === "MC-2701-2026M09" &&
        escFor(world, "write_failed", "MC-2701-2026M09") &&
        creates.length === 2 &&
        world.sends.length === 0
      );
    },
    describe,
  },
  {
    checkId: "written-into-the-ledger",
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [period("MC-2801-2026H2", [L("ATT-SITE", 1, "callout"), L("SVC-EXT-6M", 8, "labour"), L("SVC-EML-6M", 12, "labour")])],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "MC-2801-2026H2");
      const w = world.calls.find((c) => c.port === "write_invoice" && c.request?.jobId === "MC-2801-2026H2");
      return Boolean(inv && inv.externalId && w && w.response?.externalId === inv.externalId && inv.status === "draft");
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // The owner wrote down a rule: contract invoices under $500 may go on the rule.
    // One small period, one large; and in a second business with no rule, one period.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Contract invoices under $500, set by Dana Whitfield", threshold: 500 },
        jobs: [
          period("MC-2901-2026M09", [L("SVC-FIP-MTH", 1, "labour")]),
          period("MC-2902-2026Q3", [L("ATT-SITE", 1, "callout"), L("SVC-EXT-6M", 40, "labour"), L("SVC-EML-6M", 30, "labour")]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      const noRule = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [period("MC-2903-2026M09", [L("SVC-FIP-MTH", 1, "labour")])] });
      await build(noRule.ports(), { type: "schedule.tick" }, owners);
      world.noRule = noRule;
      world.beforePerson = { over: world.sends.length, none: noRule.sends.length };
      world.advance(3 * 60 * 60 * 1000);
      await release(build, world, "MC-2902-2026Q3");
      noRule.advance(3 * 60 * 60 * 1000);
      await release(build, noRule, "MC-2903-2026M09");
    },
    holds: (world) => {
      const nr = world.noRule;
      if (!nr) return false;
      const under = one(world, "MC-2901-2026M09");
      const over = one(world, "MC-2902-2026Q3");
      const none = one(nr, "MC-2903-2026M09");
      if (!under || !over || !none) return false;
      const rule = "Contract invoices under $500, set by Dana Whitfield";
      const gated = (w) => w.sends.every((s) => w.calls.slice(0, w.calls.findIndex((c) => c.port === "issue_notice" && c.request?.send === s.invoiceId)).some((c) => c.port === "gate" && c.request?.release === s.invoiceId && (c.request.person || c.request.rule)));
      return (
        under.status === "sent" &&
        under.releasedByRule === rule &&
        !under.releasedBy &&
        releasedBefore(world, under.id, { rule }) &&
        world.beforePerson.over === 1 &&
        world.beforePerson.none === 0 &&
        escFor(world, "over_threshold", "MC-2902-2026Q3") &&
        over.status === "sent" &&
        over.releasedBy === OWNER &&
        !over.releasedByRule &&
        releasedBefore(world, over.id, { person: OWNER }) &&
        none.status === "sent" &&
        none.releasedBy === OWNER &&
        releasedBefore(nr, none.id, { person: OWNER }) &&
        gated(world) &&
        gated(nr)
      );
    },
    describe,
  },
  {
    checkId: "parked-is-a-queue",
    // A rule that would release anything is set, so a parked invoice that leaked would be seen.
    // The owner closes the exception without fixing anything; it must stay parked.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Everything, set by Dana Whitfield", threshold: 1_000_000 },
        jobs: [
          period("MC-3001-2026H2", [L("ATT-SITE", 1, "callout"), L("SVC-SPR-6M", 1, "labour")]),
          period("MC-3002-2026Q3", [L("SVC-FIP-MTH", 1, "labour"), L("VAR-HYD-ADD", 2, "variation")]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "exception.closed", jobId: "MC-3001-2026H2" }, owners);
      await build(world.ports(), { type: "schedule.tick" }, owners);
    },
    holds: (world) => {
      const a = one(world, "MC-3001-2026H2");
      const b = one(world, "MC-3002-2026Q3");
      if (!a || !b) return false;
      const parked = world.invoices.filter((i) => i.status === "parked");
      return (
        parked.length === 2 &&
        a.parkReason === "not_in_pricebook" &&
        b.parkReason === "unsigned_variation" &&
        escFor(world, "not_in_pricebook", "MC-3001-2026H2") &&
        escFor(world, "unsigned_variation", "MC-3002-2026Q3") &&
        world.sends.length === 0 &&
        !world.calls.some((c) => c.port === "gate")
      );
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [period("MC-3101-2026M09", [L("ATT-SITE", 1, "callout"), L("SVC-FIP-MTH", 1, "labour"), L("CONS-BATT", 2, "material")])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed", jobId: "MC-3101-2026M09" }, owners);
      world.advance(2 * 60 * 60 * 1000);
      await release(build, world, "MC-3101-2026M09");
    },
    holds: (world) => {
      const inv = one(world, "MC-3101-2026M09");
      if (!inv) return false;
      return (
        Boolean(inv.externalId) &&
        inv.lines.length === 3 &&
        inv.lines.every((l) => l.rate === world.rateFor(l.code)) &&
        inv.bookEdition === BOOK.edition &&
        inv.releasedBy === OWNER &&
        typeof inv.sentAt === "string" &&
        inv.sentAt.length > 0 &&
        inv.status === "sent"
      );
    },
    describe,
  },
  {
    checkId: "survives-the-builder",
    world: () => new InvoiceOutWorld(),
    drive: () => {},
    // Never green on a declaration.
    holds: () => false,
    describe: () =>
      "Declared: the code is public in mesh/nodes/contract-billing, maintained by AI Pathway (digitalgym). The trigger, the ledger write and the release rule run on the business's own job system and Xero accounts. Not scored: the business attaches who else can explain it.",
  },
];

// Check 12 runs only against the business's own job system and ledger.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceOutWorld(),
    drive: tick,
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

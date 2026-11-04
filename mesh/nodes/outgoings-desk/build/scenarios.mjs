/**
 * One scenario per check of invoice-out-build-standard, for Outgoings Desk.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard; what is here
 * is the world each check starts in, how the build is driven, and what "held"
 * means, in a commercial property manager's terms.
 *
 * The "jobs" are outgoings reconciliations, one per tenancy per outgoings
 * year, issued by the property management system (OGR-<tenancy>-<year>). The
 * price book is the building's outgoings schedule for the year: actual and
 * budget per category. A line's quantity is the tenant's share from the lease.
 * Every `holds` reads the world, never the build, and returns a strict
 * boolean. `node mutants.mjs` runs these against a do-nothing build and broken
 * builds: every claimed check must go red under at least one.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";

/** The property manager the agency named for outgoings recovery. */
export const OWNER = "Priya Nandakumar";
const owners = { outgoings: OWNER };

/** The building's outgoings schedule for the year to 30 June 2026: actual, and the budget instalments were paid on. */
const BOOK = {
  edition: "outgoings-FY2026-final",
  items: [
    { code: "OG-COUNCIL", description: "Council rates, actual", rate: 48000 },
    { code: "OG-COUNCIL-EST", description: "Council rates, budget", rate: 46000 },
    { code: "OG-WATER", description: "Water and sewerage rates, actual", rate: 9600 },
    { code: "OG-WATER-EST", description: "Water and sewerage rates, budget", rate: 9000 },
    { code: "OG-INSURE", description: "Building insurance, actual", rate: 31200 },
    { code: "OG-INSURE-EST", description: "Building insurance, budget", rate: 30000 },
    { code: "OG-CLEAN", description: "Common area cleaning, actual", rate: 22000 },
    { code: "OG-AIRCON", description: "Air conditioning maintenance, actual", rate: 18400 },
  ],
};

const recon = (id, lines, extra = {}) => ({ id, customerId: `TEN-${id.split("-")[1]}`, status: "complete", lines, ...extra });
const L = (code, qty, kind = "material", more = {}) => ({ code, qty, kind, description: code, ...more });

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
    // Two tenancies' reconciliations marked final today, one still being checked.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          recon("OGR-T101-FY26", [L("OG-INSURE", 0.125)]),
          recon("OGR-T102-FY26", [L("OG-INSURE", 0.2)]),
          { ...recon("OGR-T103-FY26", [L("OG-INSURE", 0.1)]), status: "open" },
        ],
      }),
    drive: tick,
    holds: (world) => {
      const read = idx(world, "read_job", (c) => c.request?.jobs === true);
      const firstWrite = idx(world, "write_invoice");
      const complete = read >= 0 ? world.calls[read].response?.complete ?? [] : [];
      const a = one(world, "OGR-T101-FY26");
      const b = one(world, "OGR-T102-FY26");
      return (
        world.invoices.length === 2 &&
        a !== null &&
        b !== null &&
        world.invoicesFor("OGR-T103-FY26").length === 0 &&
        read >= 0 &&
        firstWrite > read &&
        complete.includes("OGR-T101-FY26") &&
        complete.includes("OGR-T102-FY26") &&
        !complete.includes("OGR-T103-FY26")
      );
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // Council rates and water at a 12.5 per cent share, each less the budget the
    // tenant paid instalments on, and cleaning (no budget line on this lease).
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          recon("OGR-T201-FY26", [
            L("OG-COUNCIL", 0.125),
            L("OG-COUNCIL-EST", -0.125),
            L("OG-WATER", 0.125),
            L("OG-WATER-EST", -0.125),
            L("OG-CLEAN", 0.125),
          ]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "OGR-T201-FY26");
      const truth = world.job("OGR-T201-FY26")?.lines ?? [];
      if (!inv || inv.status === "parked") return false;
      const key = (l) => `${l.code}|${l.qty}|${l.kind}`;
      const got = inv.lines.map(key).sort();
      const want = truth.map(key).sort();
      return got.length === 5 && got.length === want.length && got.every((k, i) => k === want[i]);
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // One reconciliation carries land tax, which the year's schedule does not hold;
    // one has cleaning with no share on the lease; one is fully priced.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          recon("OGR-T301-FY26", [L("OG-COUNCIL", 0.1), L("OG-LANDTAX", 0.1)]),
          recon("OGR-T302-FY26", [L("OG-INSURE", 0.15), L("OG-CLEAN", null)]),
          recon("OGR-T303-FY26", [L("OG-INSURE", 0.15), L("OG-AIRCON", 0.15)]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const book = idx(world, "read_pricebook");
      const write = idx(world, "write_invoice");
      const tax = one(world, "OGR-T301-FY26");
      const share = one(world, "OGR-T302-FY26");
      const priced = one(world, "OGR-T303-FY26");
      if (!tax || !share || !priced) return false;
      const ratesTrue = world.invoices.every((i) => i.lines.every((l) => world.rateFor(l.code) !== undefined && l.rate === world.rateFor(l.code)));
      const sharesTrue = world.invoices.every((i) => i.lines.every((l) => (world.job(i.jobId)?.lines ?? []).some((j) => j.code === l.code && j.qty === l.qty)));
      return (
        book >= 0 &&
        write > book &&
        ratesTrue &&
        sharesTrue &&
        tax.status === "parked" &&
        tax.parkReason === "not_in_pricebook" &&
        !tax.lines.some((l) => l.code === "OG-LANDTAX") &&
        share.status === "parked" &&
        share.parkReason === "not_in_pricebook" &&
        !share.lines.some((l) => l.code === "OG-CLEAN") &&
        priced.status !== "parked" &&
        priced.lines.length === 2 &&
        escFor(world, "not_in_pricebook", "OGR-T301-FY26") &&
        escFor(world, "not_in_pricebook", "OGR-T302-FY26") &&
        sendsFor(world, tax.id).length === 0 &&
        sendsFor(world, share.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // Two tenants took on more of the building mid-year: one signed the deed of
    // variation for the extra share, one has not.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          recon("OGR-T401-FY26", [L("OG-INSURE", 0.1), L("OG-INSURE", 0.05, "variation", { signedAcceptance: "doc:DOV-T401-signed.pdf" })]),
          recon("OGR-T402-FY26", [L("OG-INSURE", 0.1), L("OG-INSURE", 0.05, "variation")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const signed = one(world, "OGR-T401-FY26");
      const unsigned = one(world, "OGR-T402-FY26");
      if (!signed || !unsigned) return false;
      return (
        signed.status !== "parked" &&
        signed.lines.some((l) => l.kind === "variation" && l.code === "OG-INSURE" && l.qty === 0.05) &&
        signed.evidence.includes("doc:DOV-T401-signed.pdf") &&
        unsigned.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        escFor(world, "unsigned_variation", "OGR-T402-FY26") &&
        sendsFor(world, unsigned.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // A tenancy under an agreement for lease, with the landlord's works still being built.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [recon("OGR-T501-FY26", [L("OG-INSURE", 0.08), L("OG-COUNCIL", 0.08)], { contractStage: "Agreement for lease, landlord's works stage 2 of 3" })],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "OGR-T501-FY26");
      if (!inv) return false;
      const text = [
        ...world.invoices.flatMap((i) => [i.notes ?? "", i.stage ?? "", ...i.lines.map((l) => l.code)]),
        ...world.escalations.map((e) => e.detail ?? ""),
      ].join(" | ");
      return inv.stage === "Agreement for lease, landlord's works stage 2 of 3" && !/progress\s+claim/i.test(text);
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // The manager marks the same reconciliation final twice, an hour apart; the
    // first write of the run for another tenancy comes back with no id.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        failNextWrite: true,
        jobs: [recon("OGR-T601-FY26", [L("OG-INSURE", 0.125)]), recon("OGR-T602-FY26", [L("OG-COUNCIL", 0.2), L("OG-WATER", 0.2)])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "job.completed" }, owners);
    },
    holds: (world) => {
      const a = one(world, "OGR-T601-FY26");
      const b = one(world, "OGR-T602-FY26");
      const writes = world.calls.filter((c) => c.port === "write_invoice");
      const failed = writes.filter((c) => c.response === null);
      const creates = writes.filter((c) => c.response !== null && !c.request?.update);
      return (
        a !== null &&
        b !== null &&
        Boolean(a.externalId) &&
        Boolean(b.externalId) &&
        failed.length === 1 &&
        failed[0].request?.jobId === "OGR-T601-FY26" &&
        escFor(world, "write_failed", "OGR-T601-FY26") &&
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
        jobs: [recon("OGR-T701-FY26", [L("OG-COUNCIL", 0.3), L("OG-INSURE", 0.3), L("OG-AIRCON", 0.3)])],
      }),
    drive: tick,
    holds: (world) => {
      const inv = one(world, "OGR-T701-FY26");
      const w = world.calls.find((c) => c.port === "write_invoice" && c.request?.jobId === "OGR-T701-FY26");
      return Boolean(inv && inv.externalId && w && w.response?.externalId === inv.externalId && inv.status === "draft");
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // The manager wrote down a rule: recovery balances under $1,000 may go on the rule.
    // One small balance, one large; and at a second agency with no rule, one more.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Recovery balances under $1,000, set by Priya Nandakumar", threshold: 1000 },
        jobs: [
          recon("OGR-T801-FY26", [L("OG-COUNCIL", 0.125), L("OG-COUNCIL-EST", -0.125)]),
          recon("OGR-T802-FY26", [L("OG-COUNCIL", 0.125), L("OG-INSURE", 0.125)]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      const noRule = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [recon("OGR-T803-FY26", [L("OG-WATER", 0.05)])] });
      await build(noRule.ports(), { type: "schedule.tick" }, owners);
      world.noRule = noRule;
      world.beforePerson = { over: world.sends.length, none: noRule.sends.length };
      world.advance(3 * 60 * 60 * 1000);
      await release(build, world, "OGR-T802-FY26");
      noRule.advance(3 * 60 * 60 * 1000);
      await release(build, noRule, "OGR-T803-FY26");
    },
    holds: (world) => {
      const nr = world.noRule;
      if (!nr) return false;
      const under = one(world, "OGR-T801-FY26");
      const over = one(world, "OGR-T802-FY26");
      const none = one(nr, "OGR-T803-FY26");
      if (!under || !over || !none) return false;
      const rule = "Recovery balances under $1,000, set by Priya Nandakumar";
      const gated = (w) => w.sends.every((s) => w.calls.slice(0, w.calls.findIndex((c) => c.port === "issue_notice" && c.request?.send === s.invoiceId)).some((c) => c.port === "gate" && c.request?.release === s.invoiceId && (c.request.person || c.request.rule)));
      return (
        under.status === "sent" &&
        under.releasedByRule === rule &&
        !under.releasedBy &&
        releasedBefore(world, under.id, { rule }) &&
        world.beforePerson.over === 1 &&
        world.beforePerson.none === 0 &&
        escFor(world, "over_threshold", "OGR-T802-FY26") &&
        escFor(nr, "over_threshold", "OGR-T803-FY26") &&
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
    // The manager closes the exception without fixing anything; it must stay parked.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Everything, set by Priya Nandakumar", threshold: 1_000_000 },
        jobs: [
          recon("OGR-T901-FY26", [L("OG-INSURE", 0.1), L("OG-LANDTAX", 0.1)]),
          recon("OGR-T902-FY26", [L("OG-INSURE", 0.1), L("OG-COUNCIL", 0.04, "variation")]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "exception.closed", jobId: "OGR-T901-FY26" }, owners);
      await build(world.ports(), { type: "schedule.tick" }, owners);
    },
    holds: (world) => {
      const a = one(world, "OGR-T901-FY26");
      const b = one(world, "OGR-T902-FY26");
      if (!a || !b) return false;
      const parked = world.invoices.filter((i) => i.status === "parked");
      return (
        parked.length === 2 &&
        a.parkReason === "not_in_pricebook" &&
        b.parkReason === "unsigned_variation" &&
        escFor(world, "not_in_pricebook", "OGR-T901-FY26") &&
        escFor(world, "unsigned_variation", "OGR-T902-FY26") &&
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
        jobs: [recon("OGR-T1001-FY26", [L("OG-INSURE", 0.2), L("OG-INSURE-EST", -0.2), L("OG-AIRCON", 0.2)])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed", jobId: "OGR-T1001-FY26" }, owners);
      world.advance(2 * 60 * 60 * 1000);
      await release(build, world, "OGR-T1001-FY26");
    },
    holds: (world) => {
      const inv = one(world, "OGR-T1001-FY26");
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
      "Declared: the code is public in mesh/nodes/outgoings-desk, maintained by AI Pathway (digitalgym). The trigger, the ledger write and any release rule run on the agency's own property management system and Xero accounts. Not scored: the agency attaches who else can explain it.",
  },
];

// Check 12 runs only against the agency's own property system and ledger.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new InvoiceOutWorld(),
    drive: tick,
    holds: () => false,
    describe: (world) => `${world.calls.length} port call(s)`,
  },
];

/**
 * One scenario per check of invoice-out-build-standard, for Stage Billing.
 *
 * Scaffolded by `npx @aipathway/conformance init invoice-out-build-standard`.
 * The checks are fetched at run time from
 * https://aipathway.com.au/explore-ai/invoice-out-build-standard; what is here
 * is the world each check starts in, how the build is driven, and what "held"
 * means, in a builder's terms.
 *
 * The "jobs" are stage records on building jobs' payment schedules, issued by
 * the job system (<contract>-S<n>). The price book is the agreed payment
 * schedules, one item per contract stage at the dollar amount the signed
 * contract sets. Every `holds` reads the world, never the build, and returns a
 * strict boolean. `node mutants.mjs` runs these against a do-nothing build and
 * broken builds: every claimed check must go red under at least one.
 */

import { InvoiceOutWorld } from "@aipathway/conformance";

/** The person the business named for stage invoices. */
export const OWNER = "Priya Nair";
const owners = { billing: OWNER };

/**
 * The agreed payment schedules. C1042 is a new home at $480,000 under a
 * fixed-price residential building contract; C2077 is an $85,000 bathroom
 * and kitchen renovation. Amounts are GST-inclusive dollars as the contract
 * states them; the ledger applies the tax code.
 */
const BOOK = {
  edition: "payment-schedules-rev-14",
  items: [
    { code: "C1042-DEP", description: "C1042 Deposit (5%)", rate: 24000 },
    { code: "C1042-BASE", description: "C1042 Base stage", rate: 72000 },
    { code: "C1042-FRAME", description: "C1042 Frame stage", rate: 96000 },
    { code: "C1042-LOCKUP", description: "C1042 Lock-up stage", rate: 120000 },
    { code: "C1042-FIX", description: "C1042 Fixing stage", rate: 96000 },
    { code: "C1042-PC", description: "C1042 Practical completion", rate: 72000 },
    { code: "C1042-PC-TAPS", description: "C1042 Prime cost adjustment, tapware over allowance", rate: 1380 },
    { code: "C1042-PS-EXCAV", description: "C1042 Provisional sum adjustment, excavation", rate: 2650 },
    { code: "C1042-VAR03", description: "C1042 Variation 3, extra power points and data", rate: 1840 },
    { code: "C2077-DEP", description: "C2077 Deposit (10%)", rate: 8500 },
    { code: "C2077-ROUGH", description: "C2077 Rough-in stage", rate: 25500 },
    { code: "C2077-WATERPROOF", description: "C2077 Waterproofing and tiling stage", rate: 29750 },
    { code: "C2077-PC", description: "C2077 Practical completion", rate: 21250 },
    { code: "C2077-VAR01", description: "C2077 Variation 1, niche in shower wall", rate: 640 },
  ],
};

const stageRecord = (id, contractStage, lines, extra = {}) => ({ id, customerId: `CUST-${id.split("-")[0]}`, status: "complete", contractStage, lines, ...extra });
const L = (code, qty, kind, more = {}) => ({ code, qty, kind, description: code, ...more });

const tick = (build, world) => build(world.ports(), { type: "schedule.tick" }, owners);
const release = (build, world, jobId) => build(world.ports(), { type: "release", jobId, person: OWNER }, owners);

const describe = (world) =>
  `${world.calls.length} port call(s); invoices ${world.invoices.map((i) => `${i.jobId}:${i.status}${i.parkReason ? "/" + i.parkReason : ""}${i.stage ? "<" + i.stage + ">" : ""}[${i.lines.map((l) => `${l.code}x${l.qty}@${l.rate}`).join(",")}]`).join(" ") || "none"}; escalations ${world.escalations.map((e) => e.reason).join(",") || "none"}; sends ${world.sends.length}`;

const at = (world, port, where) => world.firstCall(port, where);
const sendsFor = (world, id) => world.sends.filter((s) => s.invoiceId === id);
const escalated = (world, reason, text) => world.escalations.some((e) => e.reason === reason && (e.detail ?? "").includes(text) && (e.detail ?? "").includes(OWNER));
const only = (world, jobId) => {
  const xs = world.invoicesFor(jobId);
  return xs.length === 1 ? xs[0] : null;
};
const releasedBeforeSend = (world, invoiceId, who) => {
  const s = world.calls.findIndex((c) => c.port === "issue_notice" && c.request?.send === invoiceId);
  if (s < 0) return false;
  return world.calls.slice(0, s).some((c) => c.port === "gate" && c.request?.release === invoiceId && (who.person ? c.request.person === who.person : c.request.rule === who.rule));
};
const everySendGated = (w) =>
  w.sends.every((s) => {
    const i = w.calls.findIndex((c) => c.port === "issue_notice" && c.request?.send === s.invoiceId);
    return i >= 0 && w.calls.slice(0, i).some((c) => c.port === "gate" && c.request?.release === s.invoiceId && Boolean(c.request.person || c.request.rule));
  });

export const scenarios = [
  {
    checkId: "completion-is-the-trigger",
    // The renovation's deposit (contract signed) and the new home's base stage are
    // marked reached today; the new home's frame stage is not reached yet.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          stageRecord("C2077-S1", "Deposit", [L("C2077-DEP", 1, "labour")]),
          stageRecord("C1042-S2", "Base stage", [L("C1042-BASE", 1, "labour")]),
          { ...stageRecord("C1042-S3", "Frame stage", [L("C1042-FRAME", 1, "labour")]), status: "open" },
        ],
      }),
    drive: tick,
    holds: (world) => {
      const read = at(world, "read_job", (c) => c.request?.jobs === true);
      const firstWrite = at(world, "write_invoice");
      const complete = read >= 0 ? world.calls[read].response?.complete ?? [] : [];
      return (
        world.invoices.length === 2 &&
        only(world, "C2077-S1") !== null &&
        only(world, "C1042-S2") !== null &&
        world.invoicesFor("C1042-S3").length === 0 &&
        read >= 0 &&
        firstWrite > read &&
        complete.includes("C2077-S1") &&
        complete.includes("C1042-S2") &&
        !complete.includes("C1042-S3")
      );
    },
    describe,
  },
  {
    checkId: "lines-come-from-the-job",
    // Lock-up stage: the instalment, a prime cost adjustment and a provisional sum adjustment.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [stageRecord("C1042-S4", "Lock-up stage", [L("C1042-LOCKUP", 1, "labour"), L("C1042-PC-TAPS", 1, "material"), L("C1042-PS-EXCAV", 1, "material")])],
      }),
    drive: tick,
    holds: (world) => {
      const inv = only(world, "C1042-S4");
      const truth = world.job("C1042-S4")?.lines ?? [];
      if (!inv || inv.status === "parked") return false;
      const key = (l) => `${l.code}|${l.qty}|${l.kind}`;
      const got = inv.lines.map(key).sort();
      const want = truth.map(key).sort();
      return got.length === 3 && want.length === 3 && got.every((k, i) => k === want[i]);
    },
    describe,
  },
  {
    checkId: "rates-only-from-the-book",
    // The renovation's waterproofing stage carries a rock-removal sum the schedule
    // does not hold; its rough-in stage is fully on the schedule.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          stageRecord("C2077-S3", "Waterproofing and tiling stage", [L("C2077-WATERPROOF", 1, "labour"), L("C2077-PS-ROCK", 1, "material")]),
          stageRecord("C2077-S2", "Rough-in stage", [L("C2077-ROUGH", 1, "labour")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const book = at(world, "read_pricebook");
      const write = at(world, "write_invoice");
      const parked = only(world, "C2077-S3");
      const priced = only(world, "C2077-S2");
      if (!parked || !priced) return false;
      const fromBook = world.invoices.every((i) => i.lines.every((l) => world.rateFor(l.code) !== undefined && l.rate === world.rateFor(l.code)));
      return (
        book >= 0 &&
        write > book &&
        fromBook &&
        parked.status === "parked" &&
        parked.parkReason === "not_in_pricebook" &&
        !parked.lines.some((l) => l.code === "C2077-PS-ROCK") &&
        priced.status !== "parked" &&
        priced.lines.length === 1 &&
        priced.lines[0].rate === 25500 &&
        escalated(world, "not_in_pricebook", "C2077-S3") &&
        sendsFor(world, parked.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "variation-needs-a-signature",
    // The new home's fixing stage carries a signed variation; the renovation's
    // practical completion carries one agreed on site but never signed.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          stageRecord("C1042-S5", "Fixing stage", [L("C1042-FIX", 1, "labour"), L("C1042-VAR03", 1, "variation", { signedAcceptance: "doc:C1042-VAR03-signed.pdf" })]),
          stageRecord("C2077-S4", "Practical completion", [L("C2077-PC", 1, "labour"), L("C2077-VAR01", 1, "variation")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const signed = only(world, "C1042-S5");
      const unsigned = only(world, "C2077-S4");
      if (!signed || !unsigned) return false;
      return (
        signed.status !== "parked" &&
        signed.lines.some((l) => l.kind === "variation" && l.code === "C1042-VAR03") &&
        signed.evidence.includes("doc:C1042-VAR03-signed.pdf") &&
        unsigned.status === "parked" &&
        unsigned.parkReason === "unsigned_variation" &&
        !unsigned.lines.some((l) => l.kind === "variation") &&
        escalated(world, "unsigned_variation", "C2077-S4") &&
        sendsFor(world, unsigned.id).length === 0
      );
    },
    describe,
  },
  {
    checkId: "stage-invoice-never-claim",
    // The new home's deposit names its stage. A second stage record was set up with
    // its stage name left blank: it must park, never go out as a bare invoice.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [
          stageRecord("C1042-S1", "Deposit", [L("C1042-DEP", 1, "labour")]),
          stageRecord("C1042-S6", "  ", [L("C1042-PC", 1, "labour")]),
        ],
      }),
    drive: tick,
    holds: (world) => {
      const dep = only(world, "C1042-S1");
      const blank = only(world, "C1042-S6");
      if (!dep || !blank) return false;
      const text = [
        ...world.invoices.flatMap((i) => [i.notes ?? "", i.stage ?? "", ...i.lines.map((l) => l.code)]),
        ...world.escalations.map((e) => e.detail ?? ""),
      ].join(" | ");
      return (
        dep.stage === "Deposit" &&
        dep.status !== "parked" &&
        blank.status === "parked" &&
        blank.parkReason === "no_stage" &&
        escalated(world, "no_stage", "C1042-S6") &&
        sendsFor(world, blank.id).length === 0 &&
        !/progress\s+claim/i.test(text)
      );
    },
    describe,
  },
  {
    checkId: "one-invoice-per-job",
    // The supervisor ticks the frame stage reached twice, an hour apart; the first
    // write of the run comes back from the ledger with no id.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        failNextWrite: true,
        jobs: [stageRecord("C1042-S3", "Frame stage", [L("C1042-FRAME", 1, "labour")]), stageRecord("C2077-S2", "Rough-in stage", [L("C2077-ROUGH", 1, "labour")])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "job.completed" }, owners);
    },
    holds: (world) => {
      const a = only(world, "C1042-S3");
      const b = only(world, "C2077-S2");
      const writes = world.calls.filter((c) => c.port === "write_invoice");
      const failed = writes.filter((c) => c.response === null);
      const creates = writes.filter((c) => c.response !== null && !c.request?.update);
      return (
        a !== null &&
        b !== null &&
        Boolean(a.externalId) &&
        Boolean(b.externalId) &&
        failed.length === 1 &&
        failed[0].request?.jobId === "C1042-S3" &&
        escalated(world, "write_failed", "C1042-S3") &&
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
        jobs: [stageRecord("C1042-S2", "Base stage", [L("C1042-BASE", 1, "labour"), L("C1042-PS-EXCAV", 1, "material")])],
      }),
    drive: tick,
    holds: (world) => {
      const inv = only(world, "C1042-S2");
      const w = world.calls.find((c) => c.port === "write_invoice" && c.request?.jobId === "C1042-S2");
      return Boolean(inv && inv.externalId && w && w.response?.externalId === inv.externalId && inv.status === "draft" && inv.stage === "Base stage");
    },
    describe,
  },
  {
    checkId: "send-is-a-gate",
    // The owner wrote down one rule: deposits and stages under $10,000 may go on it.
    // The renovation deposit is under; the new home's frame stage is over; and in a
    // second business with no rule, a deposit waits for a person.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Stage invoices under $10,000, set by Priya Nair", threshold: 10000 },
        jobs: [stageRecord("C2077-S1", "Deposit", [L("C2077-DEP", 1, "labour")]), stageRecord("C1042-S3", "Frame stage", [L("C1042-FRAME", 1, "labour")])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      const noRule = new InvoiceOutWorld({ pricebook: BOOK, releaseRule: null, jobs: [stageRecord("C1042-S1", "Deposit", [L("C1042-DEP", 1, "labour")])] });
      await build(noRule.ports(), { type: "schedule.tick" }, owners);
      world.noRule = noRule;
      world.beforePerson = { withRule: world.sends.length, none: noRule.sends.length };
      world.advance(3 * 60 * 60 * 1000);
      await release(build, world, "C1042-S3");
      noRule.advance(3 * 60 * 60 * 1000);
      await release(build, noRule, "C1042-S1");
    },
    holds: (world) => {
      const nr = world.noRule;
      if (!nr) return false;
      const under = only(world, "C2077-S1");
      const over = only(world, "C1042-S3");
      const none = only(nr, "C1042-S1");
      if (!under || !over || !none) return false;
      const rule = "Stage invoices under $10,000, set by Priya Nair";
      return (
        under.status === "sent" &&
        under.releasedByRule === rule &&
        !under.releasedBy &&
        releasedBeforeSend(world, under.id, { rule }) &&
        world.beforePerson.withRule === 1 &&
        world.beforePerson.none === 0 &&
        escalated(world, "over_threshold", "C1042-S3") &&
        over.status === "sent" &&
        over.releasedBy === OWNER &&
        !over.releasedByRule &&
        releasedBeforeSend(world, over.id, { person: OWNER }) &&
        none.status === "sent" &&
        none.releasedBy === OWNER &&
        releasedBeforeSend(nr, none.id, { person: OWNER }) &&
        everySendGated(world) &&
        everySendGated(nr)
      );
    },
    describe,
  },
  {
    checkId: "parked-is-a-queue",
    // A rule that would release anything is set, so a parked invoice that leaked would
    // be seen. The owner closes one exception without fixing it; it must stay parked.
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        releaseRule: { name: "Everything, set by Priya Nair", threshold: 10_000_000 },
        jobs: [
          stageRecord("C2077-S3", "Waterproofing and tiling stage", [L("C2077-WATERPROOF", 1, "labour"), L("C2077-PS-ROCK", 1, "material")]),
          stageRecord("C2077-S4", "Practical completion", [L("C2077-PC", 1, "labour"), L("C2077-VAR01", 1, "variation")]),
          stageRecord("C1042-S6", "", [L("C1042-PC", 1, "labour")]),
        ],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "schedule.tick" }, owners);
      world.advance(60 * 60 * 1000);
      await build(world.ports(), { type: "exception.closed", jobId: "C2077-S3" }, owners);
      await build(world.ports(), { type: "schedule.tick" }, owners);
    },
    holds: (world) => {
      const a = only(world, "C2077-S3");
      const b = only(world, "C2077-S4");
      const c = only(world, "C1042-S6");
      if (!a || !b || !c) return false;
      return (
        world.invoices.filter((i) => i.status === "parked").length === 3 &&
        a.parkReason === "not_in_pricebook" &&
        b.parkReason === "unsigned_variation" &&
        c.parkReason === "no_stage" &&
        escalated(world, "not_in_pricebook", "C2077-S3") &&
        escalated(world, "unsigned_variation", "C2077-S4") &&
        escalated(world, "no_stage", "C1042-S6") &&
        world.sends.length === 0 &&
        !world.calls.some((x) => x.port === "gate")
      );
    },
    describe,
  },
  {
    checkId: "the-record-by-job",
    world: () =>
      new InvoiceOutWorld({
        pricebook: BOOK,
        jobs: [stageRecord("C1042-S5", "Fixing stage", [L("C1042-FIX", 1, "labour"), L("C1042-PC-TAPS", 1, "material"), L("C1042-VAR03", 1, "variation", { signedAcceptance: "doc:C1042-VAR03-signed.pdf" })])],
      }),
    drive: async (build, world) => {
      await build(world.ports(), { type: "job.completed", jobId: "C1042-S5" }, owners);
      world.advance(2 * 60 * 60 * 1000);
      await release(build, world, "C1042-S5");
    },
    holds: (world) => {
      const inv = only(world, "C1042-S5");
      if (!inv) return false;
      return (
        Boolean(inv.externalId) &&
        inv.lines.length === 3 &&
        inv.lines.every((l) => l.rate === world.rateFor(l.code)) &&
        inv.bookEdition === BOOK.edition &&
        inv.stage === "Fixing stage" &&
        inv.evidence.includes("doc:C1042-VAR03-signed.pdf") &&
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
      "Declared: the code is public in mesh/nodes/stage-billing, maintained by AI Pathway (digitalgym). The trigger, the ledger write and the release rule run on the builder's own job system and Xero accounts. Not scored: the business attaches who else can explain it.",
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

/**
 * One scenario per check of two-records-build-standard, for Intercompany Match.
 *
 * The world: an Australian group with two companies on separate Xero files.
 * Source A is Harbour Holdings Pty Ltd, which raises management fees and
 * recharges to the operating company. Source B is Harbour Services Pty Ltd,
 * which enters each one as a bill carrying the issuer's Xero InvoiceID.
 * Amounts are AUD including GST.
 *
 * The checks are fetched at run time from the published standard. What is
 * here is the world each check starts in, how the build is driven, and what
 * "held" means. Every holds() reads the world and returns a strict boolean.
 */

import { TwoRecordsWorld } from "@aipathway/conformance";

const OWNER = "Mei Tanaka (group financial controller)";
const ACCEPTER = "Mei Tanaka";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const contract = (over = {}) => ({
  id: "IC-HARBOUR-2026-10",
  sourceA: "Harbour Holdings Pty Ltd (Xero)",
  sourceB: "Harbour Services Pty Ltd (Xero)",
  key: "issuer_invoice_id",
  // Agreed at the group's month-end review: the issuer's file is right about
  // the amount and GST; the receiver's file is right about the date the bill
  // was entered.
  masterByField: { total: "a", gst: "a", date: "b" },
  toleranceByField: {},
  threshold: { amount: 1000, mismatchRate: 0.5 },
  schedule: "monthly, second business day",
  owner: OWNER,
  ...over,
});

const rec = (key, name, total, gst, date) => ({ key, name, fields: { total, gst, date } });

// Issuer and receiver views of one intercompany charge.
const both = (key, name, total, gst, date) => [rec(key, name, total, gst, date), rec(key, name, total, gst, date)];

const world = (opts) => new TwoRecordsWorld({ now: new Date("2026-11-03T22:00:00.000Z"), ...opts });

const idx = (w, port, where) => w.firstCall(port, where);

const sameMasters = (x, y) => {
  const kx = Object.keys(x ?? {}).sort();
  const ky = Object.keys(y ?? {}).sort();
  return kx.length === ky.length && kx.every((k, i) => k === ky[i] && x[k] === y[k]);
};

const pairOf = (rows) => ({ sourceA: rows.map((r) => r[0]), sourceB: rows.map((r) => r[1]) });

export const scenarios = [
  {
    checkId: "a-pair-is-declared-not-guessed",
    world: () => {
      const rows = [
        both("7f3a0b21-mgmt-fee-oct", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        both("7f3a0b22-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const c = contract();
      const contractAt = idx(w, "read_ledger", (x) => x.request && x.request.contract === true);
      const aAt = idx(w, "read_job");
      const bAt = idx(w, "read_ledger", (x) => x.request && x.request.source === "b");
      return (
        contractAt >= 0 &&
        aAt > contractAt &&
        bAt > contractAt &&
        w.runs.length === 1 &&
        w.runs[0].contractId === c.id &&
        sameMasters(w.runs[0].masterByField, c.masterByField)
      );
    },
    describe: (w) => `${w.runs.length} run(s); contract ${w.runs[0]?.contractId ?? "none"}; masters ${JSON.stringify(w.runs[0]?.masterByField ?? {})}`,
  },
  {
    checkId: "keys-join-ids-not-labels",
    world: () => {
      // Same counterparty name, same amount, different invoice ids: not a pair.
      const a = [
        rec("9c11-mgmt-fee-sep", "Harbour Services Pty Ltd", 5500, 500, "2026-09-30"),
        rec("9c20-rent-recharge", "Harbour Services Pty Ltd", 3300, 300, "2026-10-31"),
      ];
      const bSide = [
        rec("9c12-mgmt-fee-sep-dup", "Harbour Services Pty Ltd", 5500, 500, "2026-09-30"),
        rec("9c20-rent-recharge", "Harbour Services Pty Ltd", 3300, 300, "2026-10-31"),
      ];
      return world({ contract: contract(), sourceA: a, sourceB: bSide });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const r = w.runs[0];
      const lonely = ["9c11-mgmt-fee-sep", "9c12-mgmt-fee-sep-dup"];
      return (
        w.runs.length === 1 &&
        r.joinedOn === "issuer_invoice_id" &&
        w.differences.every((d) => !lonely.includes(d.key)) &&
        w.differences.length === 0 &&
        w.orphans.some((o) => o.key === "9c11-mgmt-fee-sep" && o.source === "a") &&
        w.orphans.some((o) => o.key === "9c12-mgmt-fee-sep-dup" && o.source === "b") &&
        r.matched === 1 &&
        r.orphaned === 2
      );
    },
    describe: (w) => `joined on ${w.runs[0]?.joinedOn ?? "nothing"}; ${w.differences.length} difference(s); ${w.orphans.length} orphan(s); matched ${w.runs[0]?.matched ?? "-"}`,
  },
  {
    checkId: "matched-is-silent-mismatched-is-an-object",
    world: () => {
      const rows = [
        both("a101-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        both("a102-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
        both("a103-insurance-recharge", "Harbour Services Pty Ltd", 4180, 380, "2026-10-15"),
        [rec("a104-vehicle-recharge", "Harbour Services Pty Ltd", 1650, 150, "2026-10-20"), rec("a104-vehicle-recharge", "Harbour Services Pty Ltd", 1560, 150, "2026-10-20")],
        [rec("a105-payroll-recharge", "Harbour Services Pty Ltd", 18700, 0, "2026-10-31"), rec("a105-payroll-recharge", "Harbour Services Pty Ltd", 17800, 0, "2026-10-31")],
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const r = w.runs[0];
      const d4 = w.differences.find((d) => d.key === "a104-vehicle-recharge");
      const d5 = w.differences.find((d) => d.key === "a105-payroll-recharge");
      return (
        w.runs.length === 1 &&
        w.differences.length === 2 &&
        !!d4 && d4.field === "total" && d4.valueA === 1650 && d4.valueB === 1560 && d4.masterValue === 1650 && d4.status === "open" &&
        !!d5 && d5.field === "total" && d5.valueA === 18700 && d5.valueB === 17800 && d5.masterValue === 18700 && d5.status === "open" &&
        w.changedFields().length === 0 &&
        idx(w, "write_ledger") === -1 &&
        r.matched === 3 &&
        r.mismatched === 2
      );
    },
    describe: (w) => `${w.differences.length} difference(s); ${w.changedFields().length} changed field(s); matched ${w.runs[0]?.matched ?? "-"}, mismatched ${w.runs[0]?.mismatched ?? "-"}`,
  },
  {
    checkId: "nothing-is-auto-corrected",
    world: () => {
      const rows = [
        [rec("b201-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"), rec("b201-mgmt-fee", "Harbour Services Pty Ltd", 10000, 1000, "2026-10-31")],
        both("b202-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: async (b, w) => {
      await b(w.ports());
      w.writesBeforeAcceptance = w.calls.filter((c) => c.port === "write_ledger").length;
      w.changedBeforeAcceptance = w.changedFields().length;
      const d = w.differences.find((x) => x.key === "b201-mgmt-fee" && x.field === "total");
      w.acceptedAt = null;
      if (d) {
        w.advance(HOUR);
        w.accept(d.id, ACCEPTER);
        w.acceptedAt = w.acceptances[0]?.acceptedAt ?? null;
      }
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const writes = w.calls.filter((c) => c.port === "write_ledger");
      const d = w.differences.find((x) => x.key === "b201-mgmt-fee" && x.field === "total");
      if (!d || w.acceptedAt === null) return false;
      const c = w.correctionFor(d.id);
      const proposalAt = idx(w, "gate", (x) => x.request && x.request.propose === d.id);
      const writeAt = idx(w, "write_ledger");
      return (
        w.writesBeforeAcceptance === 0 &&
        w.changedBeforeAcceptance === 0 &&
        writes.length === 1 &&
        writes[0].at > w.acceptedAt &&
        !!c && c.acceptedBy === ACCEPTER && typeof c.writtenId === "string" &&
        proposalAt >= 0 && proposalAt < writeAt &&
        c.target === "b" && c.proposedValue === 11000
      );
    },
    describe: (w) => `${w.writesBeforeAcceptance ?? "?"} write(s) before acceptance; ${w.calls.filter((c) => c.port === "write_ledger").length} write(s) in total`,
  },
  {
    checkId: "orphans-are-a-queue",
    world: () => {
      const a = [
        rec("c301-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        rec("c302-loan-interest", "Harbour Services Pty Ltd", 812.5, 0, "2026-10-31"),
      ];
      const bSide = [
        rec("c301-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        rec("c399-cleaning-recharge", "Harbour Holdings Pty Ltd", 440, 40, "2026-10-28"),
      ];
      return world({ contract: contract(), sourceA: a, sourceB: bSide });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const oa = w.orphans.find((o) => o.key === "c302-loan-interest");
      const ob = w.orphans.find((o) => o.key === "c399-cleaning-recharge");
      const handed = (key) => w.calls.some((c) => c.port === "escalate" && c.request && c.request.orphan === key && c.request.owner === OWNER);
      return (
        w.orphans.length === 2 &&
        !!oa && oa.source === "a" && typeof oa.reason === "string" && oa.reason.length > 0 && oa.owner === OWNER &&
        !!ob && ob.source === "b" && typeof ob.reason === "string" && ob.reason.length > 0 && ob.owner === OWNER &&
        handed("c302-loan-interest") && handed("c399-cleaning-recharge") &&
        w.runs.length === 1 && w.runs[0].orphaned === 2
      );
    },
    describe: (w) => `${w.orphans.length} orphan(s); run counts ${w.runs[0]?.orphaned ?? "-"} orphaned`,
  },
  {
    checkId: "tolerance-is-written-down",
    world: () => {
      // Five cents on the total for rounding across the two files; nothing on GST.
      const rows = [
        [rec("d401-it-recharge", "Harbour Services Pty Ltd", 2475.03, 225, "2026-10-31"), rec("d401-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31")],
        [rec("d402-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"), rec("d402-mgmt-fee", "Harbour Services Pty Ltd", 10995, 1000, "2026-10-31")],
        [rec("d403-insurance-recharge", "Harbour Services Pty Ltd", 4180, 380, "2026-10-15"), rec("d403-insurance-recharge", "Harbour Services Pty Ltd", 4180, 380.02, "2026-10-15")],
      ];
      return world({ contract: contract({ toleranceByField: { total: 0.05 } }), ...pairOf(rows) });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const tol = { total: 0.05 };
      const d1 = w.differences.find((d) => d.key === "d401-it-recharge");
      const d2 = w.differences.find((d) => d.key === "d402-mgmt-fee");
      const d3 = w.differences.find((d) => d.key === "d403-insurance-recharge");
      return (
        w.differences.length === 3 &&
        !!d1 && d1.field === "total" && d1.status === "within_tolerance" &&
        !!d2 && d2.field === "total" && d2.status === "open" &&
        !!d3 && d3.field === "gst" && d3.status === "open" &&
        w.differences.filter((d) => d.status === "within_tolerance").every((d) => Object.prototype.hasOwnProperty.call(tol, d.field)) &&
        w.runs.length === 1 && w.runs[0].withinTolerance === 1 && w.runs[0].mismatched === 2
      );
    },
    describe: (w) => w.differences.map((d) => `${d.key}.${d.field}=${d.status}`).join(", ") || "no differences",
  },
  {
    checkId: "runs-on-a-schedule-and-publishes-regardless",
    world: () => {
      const rows = [
        both("e501-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        both("e502-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
        both("e503-loan-interest", "Harbour Services Pty Ltd", 812.5, 0, "2026-10-31"),
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: async (b, w) => {
      await b(w.ports());
      w.advance(30 * DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const clear = (r) =>
        r.matched === 3 && r.withinTolerance === 0 && r.mismatched === 0 && r.orphaned === 0 && r.corrected === 0 &&
        typeof r.publishedAt === "string" && r.publishedAt.length > 0;
      return w.runs.length === 2 && w.runs.every(clear) && w.runs[0].id !== w.runs[1].id && w.runs[0].publishedAt < w.runs[1].publishedAt;
    },
    describe: (w) => `${w.runs.length} run(s) published: ${w.runs.map((r) => `${r.matched}/${r.withinTolerance}/${r.mismatched}/${r.orphaned}/${r.corrected}`).join(", ")}`,
  },
  {
    checkId: "thresholds-route-to-a-person",
    world: () => {
      const rows = [
        [rec("f601-payroll-recharge", "Harbour Services Pty Ltd", 18700, 0, "2026-10-31"), rec("f601-payroll-recharge", "Harbour Services Pty Ltd", 16200, 0, "2026-10-31")],
        both("f602-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
        both("f603-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
      ];
      return world({ contract: contract({ threshold: { amount: 1000, mismatchRate: 0.25 } }), ...pairOf(rows) });
    },
    drive: (b, w) => b(w.ports()),
    holds: (w) => {
      const publishAt = idx(w, "publish_report");
      const noticeAt = idx(w, "notify", (c) => c.request && c.request.to === OWNER && String(c.request.detail).includes("f601-payroll-recharge"));
      const rateAt = idx(w, "escalate", (c) => c.request && typeof c.request.reason === "string" && c.request.reason.includes("rate"));
      return publishAt >= 0 && noticeAt >= 0 && noticeAt < publishAt && rateAt >= 0 && rateAt < publishAt && w.runs.length === 1;
    },
    describe: (w) => `${w.notices.length} notice(s), ${w.escalations.length} escalation(s), ${w.runs.length} run(s)`,
  },
  {
    checkId: "history-survives-the-fix",
    world: () => {
      const rows = [
        [rec("g701-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"), rec("g701-mgmt-fee", "Harbour Services Pty Ltd", 11000, 100, "2026-10-31")],
        both("g702-it-recharge", "Harbour Services Pty Ltd", 2475, 225, "2026-10-31"),
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: async (b, w) => {
      await b(w.ports());
      const d = w.differences.find((x) => x.key === "g701-mgmt-fee");
      if (d) {
        w.advance(2 * HOUR);
        w.accept(d.id, ACCEPTER);
      }
      w.advance(HOUR);
      await b(w.ports());
    },
    holds: (w) => {
      const d = w.differences.find((x) => x.key === "g701-mgmt-fee" && x.field === "gst");
      if (!d) return false;
      const c = w.correctionFor(d.id);
      const changed = w.changedFields();
      const backed = changed.every((ch) =>
        w.differences.some((x) => x.key === ch.key && x.field === ch.field && w.corrections.some((k) => k.differenceId === x.id && typeof k.writtenId === "string" && typeof k.acceptedBy === "string")),
      );
      return (
        w.recordOf("b", "g701-mgmt-fee")?.fields.gst === 1000 &&
        d.valueA === 1000 && d.valueB === 100 &&
        !!c && c.acceptedBy === ACCEPTER && typeof c.acceptedAt === "string" && typeof c.writtenId === "string" &&
        changed.length === 1 && backed
      );
    },
    describe: (w) => `${w.corrections.length} correction(s); ${w.changedFields().length} changed field(s)`,
  },
  {
    checkId: "the-record-by-key",
    world: () => {
      const rows = [
        [rec("h801-loan-interest", "Harbour Services Pty Ltd", 812.5, 0, "2026-10-31"), rec("h801-loan-interest", "Harbour Services Pty Ltd", 812.5, 0, "2026-11-02")],
        both("h802-mgmt-fee", "Harbour Services Pty Ltd", 11000, 1000, "2026-10-31"),
      ];
      return world({ contract: contract(), ...pairOf(rows) });
    },
    drive: async (b, w) => {
      await b(w.ports());
      const d = w.differences.find((x) => x.key === "h801-loan-interest");
      if (d) {
        w.advance(HOUR);
        w.accept(d.id, ACCEPTER);
      }
      w.advance(DAY);
      await b(w.ports());
    },
    holds: (w) => {
      const h = w.historyFor("h801-loan-interest");
      const d = h.differences.find((x) => x.field === "date");
      return (
        h.runs.length >= 1 &&
        !!d && d.valueA === "2026-10-31" && d.valueB === "2026-11-02" && d.masterValue === "2026-11-02" &&
        h.corrections.some((c) => c.differenceId === d.id && c.acceptedBy === ACCEPTER && typeof c.writtenId === "string") &&
        w.runs.length === 2
      );
    },
    describe: (w) => {
      const h = w.historyFor("h801-loan-interest");
      return `${h.runs.length} run(s), ${h.differences.length} difference(s), ${h.corrections.length} correction(s) on h801-loan-interest`;
    },
  },
  {
    checkId: "survives-the-builder",
    // A precondition: the runner reports evidence_required and does not score it.
    // Declared: the build lives in the public repo digitalgym/aipathway-standards,
    // maintained by AI Pathway; the pair contract and the runs live on the
    // group's own Xero files and its own exception list. A second person who can
    // explain it is evidence the group attaches, not code.
    world: () => world({ contract: contract() }),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

// The pass test runs only on the group's own two Xero files, with a person
// accepting the seeded correction. This standard publishes no live port map,
// so run.mjs refuses a production run and the stub reports it as with_us.
export const liveScenarios = [
  {
    checkId: "pass-test",
    world: () => new TwoRecordsWorld(),
    drive: (b, w) => b(w.ports()),
    holds: () => false,
    describe: (w) => `${w.calls.length} port call(s)`,
  },
];

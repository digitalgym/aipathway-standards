/**
 * Month Sign-Off: the month-end close for each client file, to
 * AIP-BS-MONTH-END-CLOSE 2026-11-12
 * (https://aipathway.com.au/explore-ai/month-end-close-build-standard).
 *
 * Woken by a schedule. Each run is short and keeps nothing between runs: the
 * close pack in the world is the only state.
 *
 * Before sign-off, for each entity:
 *   1. work the eight checklist items against the ledger, each recorded as
 *      pass, fail or could_not_check, with the read it came from;
 *   2. hand every uncoded or suspense line to Uncoded Query, once;
 *   3. propose each schedule line as a journal, with its amount from the
 *      schedule or a person's entry; a line with no amount goes to the
 *      bookkeeper as no_amount, once.
 *   Nothing is written into the ledger. The pack waits for a named person.
 *
 * After a person signs off (the sign-off is the world's; no port can make one):
 *   4. post each approved journal once, under its intent id, reading the
 *      ledger's journals first so a retry never posts twice; a post with no
 *      answer is raised as write_failed and tried again on the next run;
 *   5. read the journals back; only when every approved one is there, read
 *      the lock date. Where the ledger's API cannot write it (Xero, MYOB and,
 *      unconfirmed, QuickBooks Online as at 12 November 2026) raise one task
 *      for the reviewer. Where a ledger has been proved writable, move it
 *      forward to period end, never backwards;
 *   6. once the lock date reads back at or after period end, hand the closed
 *      period to the Recurring Report, once.
 *
 * It never reconciles, never recodes a line, never judges a difference small
 * enough, and never invents an amount.
 *
 * Every effect goes through the ports it is handed.
 */

const OWNER_ROLE = { uncoded: "uncoded_query", no_amount: "bookkeeper", write_failed: "bookkeeper" };

const cents = (n) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toFixed(2)}`;

/** The intent id the standard names for one approved journal. */
const intentId = (tenant, entityId, period, lineId) => `close:${tenant}:${entityId}:${period}:${lineId}`;

/**
 * @param {import("@aipathway/conformance").MonthEndClosePorts} ports
 */
export async function build(ports) {
  const settings = ports.readSettings();
  const { tenant, period, owners } = settings;

  for (const entity of settings.entities) {
    const pack = ports.readClose(entity.entityId);
    if (pack.signoff) {
      afterSignOff(ports, { tenant, period, owners, entity, pack });
    } else {
      workTheChecklist(ports, { tenant, period, owners, entity, pack });
    }
  }
}

// ---- before sign-off: read, record, propose. Never write to the ledger. ---------

function workTheChecklist(ports, { tenant, period, owners, entity, pack }) {
  const id = entity.entityId;
  const raised = new Set(pack.raised.map((r) => `${r.kind}:${r.ref}`));
  const raise = (kind, ref, detail) => {
    if (raised.has(`${kind}:${ref}`)) return;
    raised.add(`${kind}:${ref}`);
    ports.raiseException({ entityId: id, period: period.id, kind, owner: owners[OWNER_ROLE[kind]], ref, detail });
  };
  const record = (item, status, read, detail) => {
    const result = { entityId: id, period: period.id, item, status, detail };
    if (status !== "could_not_check") result.evidence = { readId: read.readId, detail: `${detail} (read ${read.readId} at ${read.asAt})` };
    ports.recordResult(result);
  };
  const couldNot = (item, read) =>
    ports.recordResult({ entityId: id, period: period.id, item, status: "could_not_check", detail: `could not check: ${read.reason}` });

  // bank: every account reconciled to a statement line dated at period end or later,
  // ledger balance equal to the statement balance, nothing left unreconciled.
  const bank = ports.readBank(id);
  if (!bank.ok) couldNot("bank", bank);
  else {
    const short = [];
    const unreadable = [];
    for (const a of bank.data) {
      const why = [];
      if (a.statementDate < period.end) why.push(`reconciled only to ${a.statementDate}, period ends ${period.end}`);
      if (a.unreconciledLines > 0) why.push(`${a.unreconciledLines} statement line(s) unreconciled`);
      if (a.statementBalance !== null && a.statementBalance !== a.ledgerBalance)
        why.push(`ledger ${cents(a.ledgerBalance)} against statement ${cents(a.statementBalance)}, difference ${cents(a.ledgerBalance - a.statementBalance)}`);
      if (why.length) short.push(`${a.name} (${a.accountId}): ${why.join("; ")}`);
      else if (a.statementBalance === null) unreadable.push(`${a.name} (${a.accountId})`);
    }
    if (short.length) record("bank", "fail", bank, `bank short: ${short.join(" | ")}`);
    else if (unreadable.length)
      ports.recordResult({ entityId: id, period: period.id, item: "bank", status: "could_not_check", detail: `could not check: the statement balance is not available to an app for ${unreadable.join(", ")}` });
    else record("bank", "pass", bank, `${bank.data.length} account(s) reconciled to ${period.end} or later, balances agree: ${bank.data.map((a) => `${a.name} ${cents(a.ledgerBalance)}`).join(", ")}`);
  }

  // uncoded: every line found fails the item and goes to Uncoded Query, once.
  const uncoded = ports.readUncoded(id);
  if (!uncoded.ok) couldNot("uncoded", uncoded);
  else if (uncoded.data.length === 0) record("uncoded", "pass", uncoded, "no line uncoded or in suspense");
  else {
    for (const l of uncoded.data) raise("uncoded", l.lineId, `${l.date} ${cents(l.amount)} "${l.description}" in ${l.accountCode}: what was it?`);
    record("uncoded", "fail", uncoded, `${uncoded.data.length} line(s) uncoded or in suspense, handed to Uncoded Query: ${uncoded.data.map((l) => l.lineId).join(", ")}`);
  }

  // receivables and payables: the aged report against its control account, to the cent.
  for (const side of ["receivables", "payables"]) {
    const r = ports.readAged(id, side);
    if (!r.ok) couldNot(side, r);
    else {
      const diff = r.data.agedTotal - r.data.controlBalance;
      const figures = `aged ${side} ${cents(r.data.agedTotal)}, control account ${cents(r.data.controlBalance)}, difference ${cents(diff)}`;
      record(side, diff === 0 ? "pass" : "fail", r, figures);
    }
  }

  // payroll: every pay run expected in the month is posted.
  const payroll = ports.readPayroll(id);
  if (!payroll.ok) couldNot("payroll", payroll);
  else {
    const missing = payroll.data.expectedPayDates.filter((d) => !payroll.data.postedPayDates.includes(d));
    record(
      "payroll",
      missing.length ? "fail" : "pass",
      payroll,
      missing.length ? `pay run(s) expected and not posted: ${missing.join(", ")}` : `all ${payroll.data.expectedPayDates.length} expected pay run(s) posted`,
    );
  }

  // accruals: one proposal per schedule line, amount from the schedule or a person.
  const schedule = ports.readSchedule(id);
  if (!schedule.ok) couldNot("accruals", schedule);
  else {
    const proposed = new Set(pack.proposals.map((p) => p.scheduleLineId));
    const noAmount = [];
    for (const line of schedule.data) {
      if (proposed.has(line.lineId)) continue;
      let amount = null;
      let source = null;
      let enteredBy;
      if (Number.isInteger(line.amount)) {
        amount = line.amount;
        source = "schedule";
      } else if (line.entered && Number.isInteger(line.entered.amount)) {
        amount = line.entered.amount;
        source = "person_entry";
        enteredBy = line.entered.by;
      }
      if (amount === null) {
        noAmount.push(line.lineId);
        raise("no_amount", line.lineId, `${line.kind} "${line.description}" has no amount on the schedule and nobody has entered one for ${period.id}`);
        continue;
      }
      const p = {
        entityId: id,
        period: period.id,
        scheduleLineId: line.lineId,
        source,
        amount,
        debitAccount: line.debitAccount,
        creditAccount: line.creditAccount,
        date: period.end,
        narration: `${line.kind} ${line.description} ${period.id} [${intentId(tenant, id, period.id, line.lineId)}]`,
      };
      if (enteredBy) p.enteredBy = enteredBy;
      ports.proposeJournal(p);
      proposed.add(line.lineId);
    }
    record(
      "accruals",
      noAmount.length ? "fail" : "pass",
      schedule,
      noAmount.length
        ? `${schedule.data.length} schedule line(s); no amount for ${noAmount.join(", ")}, raised to the bookkeeper`
        : `${schedule.data.length} schedule line(s), each proposed with an amount from the schedule or a person's entry`,
    );
  }

  // tax control and clearing: both figures and the difference, never judged.
  const controls = ports.readControls(id);
  if (!controls.ok) {
    couldNot("tax_control", controls);
    couldNot("clearing", controls);
  } else {
    const c = controls.data;
    const diff = c.taxControlBalance - c.taxReturnTotal;
    record("tax_control", diff === 0 ? "pass" : "fail", controls, `tax control ${cents(c.taxControlBalance)}, return figure ${cents(c.taxReturnTotal)}, difference ${cents(diff)}`);
    const off = c.clearing.filter((a) => a.balance !== 0);
    record(
      "clearing",
      off.length ? "fail" : "pass",
      controls,
      off.length ? `not at zero: ${off.map((a) => `${a.account} ${cents(a.balance)}`).join(", ")}` : `all ${c.clearing.length} clearing account(s) at zero`,
    );
  }
}

// ---- after sign-off: post approved journals once, then the lock, then hand on. ----

function afterSignOff(ports, { tenant, period, owners, entity, pack }) {
  const id = entity.entityId;
  const raisedKeys = new Set(pack.raised.map((r) => `${r.kind}:${r.ref}`));
  const approved = pack.proposals.filter((p) => pack.signoff.approvedProposalIds.includes(p.proposalId));

  // Read the ledger first: a journal already there under its intent id is not posted again.
  const before = ports.readJournals(id);
  const landed = new Set(before.map((j) => j.intentId));
  for (const p of approved) {
    const intent = intentId(tenant, id, period.id, p.scheduleLineId);
    if (landed.has(intent)) continue;
    const r = ports.postJournal({
      entityId: id,
      proposalId: p.proposalId,
      intentId: intent,
      amount: p.amount,
      debitAccount: p.debitAccount,
      creditAccount: p.creditAccount,
      date: p.date,
      narration: p.narration.includes(intent) ? p.narration : `${p.narration} [${intent}]`,
    });
    if (!r.ok && !raisedKeys.has(`write_failed:${p.proposalId}`)) {
      raisedKeys.add(`write_failed:${p.proposalId}`);
      ports.raiseException({
        entityId: id,
        period: period.id,
        kind: "write_failed",
        owner: owners.bookkeeper,
        ref: p.proposalId,
        detail: `post of ${intent} had no answer (${r.error}); treated as not posted, read back and tried again next run`,
      });
    }
  }

  // Read back. Nothing else happens until every approved journal is in the ledger.
  const after = ports.readJournals(id);
  const have = new Set(after.map((j) => j.intentId));
  if (!approved.every((p) => have.has(intentId(tenant, id, period.id, p.scheduleLineId)))) return;

  // The lock date: forward only, and only where the ledger has been proved to write it.
  let lock = ports.readLockDate(id);
  const atEnd = (d) => d !== null && d >= period.end;
  if (!atEnd(lock.lockDate)) {
    if (lock.writable) {
      const set = ports.setLockDate(id, period.end);
      if (set.ok) lock = ports.readLockDate(id);
    } else if (pack.lockTasks === 0) {
      ports.raiseTask({
        entityId: id,
        period: period.id,
        what: "set_lock_date",
        owner: owners.reviewer,
        detail: `${entity.name}: signed off by ${pack.signoff.by}; journals read back. The ledger's API cannot set the lock date: set it to ${period.end} by hand. The next run reads it back.`,
      });
    }
  }

  if (atEnd(lock.lockDate) && !pack.handedOff) {
    ports.handOff({ entityId: id, period: period.id, lockDate: lock.lockDate, to: "recurring-report" });
  }
}

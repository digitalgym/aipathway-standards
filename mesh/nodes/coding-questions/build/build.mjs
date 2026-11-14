/**
 * Coding Questions: the uncoded bank lines job, built to AIP-BS-UNCODED-QUERY
 * 2026-11-12 (https://aipathway.com.au/explore-ai/uncoded-query-build-standard).
 *
 * Woken by schedule.tick once a day. Each run, for each client file, it:
 *
 *   1. reads the lines the client's ledger still shows as uncoded;
 *   2. sends the client one plain question list for the month, or a reminder
 *      of the lines still unanswered on the schedule the practice set, and
 *      after the last reminder hands the client's open lines to a person;
 *   3. records each answer word for word, then proposes a coding from the
 *      client's own chart, their own history for that payee first;
 *   4. writes a coding only when a named person has approved it, exactly as
 *      approved, under one key per line and approval, and reads it back.
 *
 * It never reconciles a bank line, never creates an account, never gives tax
 * advice and never places a call. It keeps nothing between runs: what it
 * needs next time is in the ledger, the outbox, the answers and the approvals.
 *
 * Every hand-off is raised on the first daily run after the thing that caused
 * it (the due date passed, the answer arrived, the approval was given), and
 * carries a key the exception desk dedupes on, so a repeated tick raises it
 * once.
 */

const DAY_MS = 86_400_000;
/** The schedule wakes this build once a day. */
const RUN_EVERY_MS = DAY_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STOP = new Set(["the", "and", "for", "with", "some", "from", "that", "this", "our", "was", "were", "job", "bought", "paid", "got", "new", "a", "an", "of", "to", "on", "in", "at", "it", "my", "we"]);

/** The cycle a moment falls in: the calendar month in Brisbane, as 2026-11. */
function cycleOf(d) {
  const local = new Date(d.getTime() + 10 * 3_600_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

function money(cents) {
  const abs = Math.abs(cents);
  return `$${Math.floor(abs / 100).toLocaleString("en-AU")}.${String(abs % 100).padStart(2, "0")}`;
}

function shortDate(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** The amount, to or from the payee as printed, the date, and one plain question. */
function questionFor(line) {
  return `${money(line.amount)} ${line.amount < 0 ? "to" : "from"} ${line.payee} on ${shortDate(line.date)}: what was it for?`;
}

function messageText(client, kind, questions, link) {
  const opener =
    kind === "list"
      ? `Hi ${client.name}, a few payments on your bank statement this month need a quick word from you.`
      : `Hi ${client.name}, a reminder: these payments still need a quick word from you.`;
  return [opener, "Tap the link and answer each one in a few words:", link, "", ...questions.map((q) => `- ${q.question}`)].join("\n");
}

const words = (s) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/s$/, ""));

const inChart = (chart, c) =>
  chart.accounts.some((a) => a.code === c.account && a.active) && chart.taxCodes.includes(c.taxCode);

const same = (a, b) => !!a && !!b && a.account === b.account && a.taxCode === b.taxCode;

/** Was this moment since the previous daily run, up to now? */
const sinceLastRun = (iso, now) => {
  const t = Date.parse(iso);
  return t <= now.getTime() && t > now.getTime() - RUN_EVERY_MS;
};

/**
 * A coding from this client's chart only: their own history for the payee
 * first, otherwise the client's own account whose name the answer names.
 * Returns null when nothing in the chart fits.
 */
function proposeFrom(chart, history, line, answer) {
  const past = history
    .filter((h) => h.payee === line.payee)
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((h) => inChart(chart, { account: h.account, taxCode: h.taxCode }));
  if (past) {
    return {
      coding: { account: past.account, taxCode: past.taxCode },
      why: `The client said "${answer.text}". ${line.payee} was coded this way before, last on ${past.date}.`,
    };
  }
  const said = new Set(words(answer.text));
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const a of chart.accounts) {
    if (!a.active || !chart.taxCodes.includes(a.taxCode)) continue;
    const score = words(a.name).filter((w) => said.has(w)).length;
    if (score > bestScore) {
      best = a;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) tie = true;
  }
  if (!best || tie) return null;
  return {
    coding: { account: best.code, taxCode: best.taxCode },
    why: `The client said "${answer.text}", which names this client's own ${best.name} account. No earlier coding for ${line.payee}.`,
  };
}

/**
 * @param {import("@aipathway/conformance").UncodedQueryPorts} ports
 */
export function build(ports) {
  const now = ports.now();
  const cycle = cycleOf(now);
  const settings = ports.readSettings();
  const everyMs = settings.reminderEveryDays * DAY_MS;

  for (const client of ports.readClients()) {
    const id = client.clientId;
    // 1. The ledger first, every run, before anyone is asked anything.
    const lines = ports.readUncodedLines(id);
    const byId = new Map(lines.map((l) => [l.lineId, l]));
    const sent = ports.readSent(id);
    const answers = ports.readAnswers(id);
    const answered = new Map();
    for (const a of answers) if (!answered.has(a.lineId)) answered.set(a.lineId, a);

    // 2. One list a cycle; reminders for what is still unanswered; then a person.
    const thisCycle = sent.filter((m) => m.cycle === cycle).sort((a, b) => a.at.localeCompare(b.at));
    const list = thisCycle.find((m) => m.kind === "list");
    const link = `${settings.answerBase}${encodeURIComponent(id)}`;
    if (!list) {
      const open = lines.filter((l) => !answered.has(l.lineId));
      if (open.length) {
        const qs = open.map((l) => ({ lineId: l.lineId, question: questionFor(l) }));
        ports.sendMessage({ clientId: id, cycle, kind: "list", channel: "email", lines: qs, text: messageText(client, "list", qs, link), answerLink: link });
        for (const l of open) ports.record({ kind: "asked", clientId: id, lineId: l.lineId, detail: `${cycle} list` });
      }
    } else {
      const open = list.lines.filter((q) => byId.has(q.lineId) && !answered.has(q.lineId));
      const reminders = thisCycle.filter((m) => m.kind === "reminder").length;
      const last = thisCycle[thisCycle.length - 1];
      const due = Date.parse(last.at) + everyMs;
      if (open.length && now.getTime() >= due) {
        if (reminders < settings.maxReminders) {
          const qs = open.map((q) => ({ lineId: q.lineId, question: questionFor(byId.get(q.lineId)) }));
          ports.sendMessage({ clientId: id, cycle, kind: "reminder", channel: "email", lines: qs, text: messageText(client, "reminder", qs, link), answerLink: link });
          ports.record({ kind: "reminded", clientId: id, detail: `${cycle} reminder ${reminders + 1} of ${settings.maxReminders}: ${qs.map((q) => q.lineId).join(", ")}` });
        } else if (sinceLastRun(new Date(due).toISOString(), now)) {
          const lineIds = open.map((q) => q.lineId);
          ports.handToPerson({
            kind: "unanswered",
            clientId: id,
            lineIds,
            detail: `key unanswered:${id}:${cycle}. ${client.name} has not answered after ${reminders} reminder(s). Whether to ring is yours; nothing more goes to the client this month.`,
          });
          ports.record({ kind: "handed_off", clientId: id, detail: `unanswered: ${lineIds.join(", ")}` });
        }
      }
    }

    // 3 and 4. Answered lines still uncoded: keep the answer, propose, and write only what a person approved.
    const work = lines.filter((l) => answered.has(l.lineId));
    if (!work.length) continue;
    const chart = ports.readChart(id);
    const history = ports.readHistory(id);

    for (const line of work) {
      const answer = answered.get(line.lineId);
      ports.record({ kind: "answer", clientId: id, lineId: line.lineId, detail: JSON.stringify({ text: answer.text, by: answer.by, at: answer.at }) });

      const approvals = ports.readApprovals(line.lineId).filter((a) => typeof a.by === "string" && a.by.trim());
      const approval = approvals.sort((a, b) => a.at.localeCompare(b.at))[approvals.length - 1];

      if (!approval) {
        const p = proposeFrom(chart, history, line, answer);
        if (!p) {
          if (sinceLastRun(answer.at, now)) {
            ports.handToPerson({
              kind: "no_account_fits",
              clientId: id,
              lineIds: [line.lineId],
              detail: `key no_account_fits:${line.lineId}. The client said "${answer.text}" and no account in this client's chart fits. Nothing was proposed.`,
            });
            ports.record({ kind: "handed_off", clientId: id, lineId: line.lineId, detail: "no_account_fits" });
          }
          continue;
        }
        ports.propose({ lineId: line.lineId, coding: p.coding, why: p.why });
        ports.record({ kind: "proposed", clientId: id, lineId: line.lineId, detail: `${p.coding.account} / ${p.coding.taxCode}` });
        continue;
      }

      const coding = { account: approval.coding.account, taxCode: approval.coding.taxCode };
      ports.record({ kind: "approved", clientId: id, lineId: line.lineId, detail: `${approval.approvalId} by ${approval.by}: ${coding.account} / ${coding.taxCode}` });

      // A bank line the ledger has not reconciled: a person reconciles it with this coding.
      if (line.source === "statement") {
        if (sinceLastRun(approval.at, now)) {
          ports.handToPerson({
            kind: "reconcile_by_person",
            clientId: id,
            lineIds: [line.lineId],
            detail: `key reconcile_by_person:${line.lineId}:${approval.approvalId}. Reconcile with account ${coding.account}, tax code ${coding.taxCode}, approved by ${approval.by}.`,
          });
          ports.record({ kind: "handed_off", clientId: id, lineId: line.lineId, detail: "reconcile_by_person" });
        }
        continue;
      }

      // Read the ledger first: a line that already holds its approved coding is left alone.
      const before = ports.readCoding(line.lineId);
      if (same(before, coding)) {
        ports.record({ kind: "written", clientId: id, lineId: line.lineId, detail: `already holds ${coding.account} / ${coding.taxCode}` });
        continue;
      }

      const key = `${line.lineId}:${approval.approvalId}`;
      let r = ports.writeCoding(line.lineId, coding, key);
      // A failed answer may still have landed (a timeout). Read the line back by
      // id before any retry, because MYOB keeps no idempotency key; then one
      // retry under the same key, which Xero and QuickBooks answer with the first result.
      if (!r.ok && same(ports.readCoding(line.lineId), coding)) r = { ok: true };
      if (!r.ok) r = ports.writeCoding(line.lineId, coding, key);
      if (!r.ok) {
        if (sinceLastRun(approval.at, now)) {
          ports.handToPerson({ kind: "write_failed", clientId: id, lineIds: [line.lineId], detail: `key write_failed:${key}. ${r.why ?? "no answer from the ledger"}` });
          ports.record({ kind: "handed_off", clientId: id, lineId: line.lineId, detail: "write_failed" });
        }
        continue;
      }

      const after = ports.readCoding(line.lineId);
      if (same(after, coding)) {
        ports.record({ kind: "written", clientId: id, lineId: line.lineId, detail: JSON.stringify({ key, ledger: after }) });
      } else {
        ports.handToPerson({
          kind: "readback_mismatch",
          clientId: id,
          lineIds: [line.lineId],
          detail: `key readback_mismatch:${key}. Approved ${coding.account} / ${coding.taxCode}; the ledger holds ${after ? `${after.account} / ${after.taxCode}` : "nothing"}.`,
        });
        ports.record({ kind: "handed_off", clientId: id, lineId: line.lineId, detail: `readback_mismatch: ${JSON.stringify(after)}` });
      }
    }
  }
}

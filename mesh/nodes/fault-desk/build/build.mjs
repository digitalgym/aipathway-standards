/**
 * Fault Desk, built to AIP-BS-FAULT-TRIAGE 2026-11-01.
 *
 * Before a tech is sent, every fault that comes in is sorted against the
 * business's own written fault list. Anything unsafe goes to the emergency
 * path with no steps given. A written procedure the business marked safe for a
 * customer is read on the call word for word, or put in a text draft word for
 * word for a named person to send. Only the customer's yes to the procedure's
 * own question counts as fixed. Everything else is one job carrying what was
 * tried. Every intake leaves one log entry naming the list edition.
 *
 * Texts are drafted, never sent by the bot: a person releases each one from
 * the drafts folder. Live calls are answered by Office Voice Front Desk with
 * the same list; the call branch here is what the stub drives so the order of
 * the checks can be proved, and nothing in this file dials or answers a phone.
 *
 * Everything goes through the ports it is handed.
 */

export const NODE = "fault-desk";
export const ON_CALL = "on-call tech";
export const EXCEPTION_OWNER = "Dana Whitfield (service coordinator)";

export const DISCLOSURE = "Hi, you're talking to an AI assistant for the office, and this call is recorded.";
export const EMERGENCY_SAID =
  "Because of what you've told me, I'm treating this as an emergency. Our on-call tech is being told now. Please keep clear of the unit.";
export const EMERGENCY_TEXT =
  "Because of what you've told us, please ring our number now rather than texting, and keep clear of the unit. Our on-call tech has been told.";
export const PRICE_SAID = "Someone from the office will come back to you about cost.";

/**
 * The baseline safety signals. Every list carries them whatever the business
 * writes; a business may add to them and never take one away.
 */
export const BASELINE_SAFETY = [
  { signal: "gas smell", re: /\b(smell(s|ing)?\s+(of\s+)?gas|gas\s+(smell|leak)|smells?\s+like\s+gas)\b/i },
  { signal: "sparking", re: /\bspark(s|ing|ed)?\b/i },
  { signal: "smoke", re: /\bsmok(e|ing|y)\b/i },
  {
    signal: "water near electrics",
    re: /\bwater\b[^.]*\b(power\s?point|switchboard|electric(s|al)?|outlet|wiring|fuse\s?box)\b|\b(power\s?point|switchboard|electric(s|al)?|outlet|wiring|fuse\s?box)\b[^.]*\bwater\b/i,
  },
  {
    signal: "medical device without power",
    re: /\b(medical|oxygen|dialysis|cpap|ventilator)\b[^.]*\b(no power|without power|lost power|not powered|off)\b/i,
  },
];

const PRICE_RE = /\b(how much|cost(s)?|price|pric(e|ing)|charge|call-?out fee|quote)\b|\$/i;
const YES_RE = /^\s*(yes|yeah|yep|yup|it('s| is) working( now)?|it worked)\b/i;
const NOT_YES_RE = /\b(not|no|unsure|dunno|don't know|maybe)\b/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, signal) => new RegExp(`(^|[^a-z0-9])${esc(signal.toLowerCase())}([^a-z0-9]|$)`, "i").test(text);

export function isYes(answer) {
  return typeof answer === "string" && YES_RE.test(answer) && !NOT_YES_RE.test(answer.replace(YES_RE, ""));
}

/** A safety signal, checked over the whole of what was said before any match. */
export function safetySignal(text, list) {
  for (const b of BASELINE_SAFETY) if (b.re.test(text)) return { signal: b.signal, fault_id: null };
  for (const f of list.faults ?? []) {
    if (f.safety !== true) continue;
    const s = (f.signals ?? []).find((sig) => has(text, sig));
    if (s) return { signal: s, fault_id: f.fault_id };
  }
  return null;
}

/** Entries whose signals are in the words. Never a guess. */
export function matchFaults(text, list) {
  return (list.faults ?? []).filter((f) => f.safety !== true && (f.signals ?? []).some((sig) => has(text, sig)));
}

export async function build(ports) {
  const intakes = await ports.nextIntakes();
  for (const intake of intakes) {
    if (intake.in_reply_to) await answerReceived(ports, intake);
    else await triage(ports, intake);
  }
}

async function triage(ports, intake) {
  const { intake_id, source } = intake;
  const words = intake.said_or_sent ?? "";
  const isCall = source === "call";

  if (isCall) await ports.disclose(intake_id, DISCLOSURE);

  // The list is read before every triage, so the edition logged is the one used.
  const list = await ports.readFaultList();
  const edition = list.edition;

  const base = {
    intake_id,
    source,
    customer_external_id: intake.customer_external_id ?? null,
    said_or_sent: words,
    procedure_edition: edition,
  };

  // ── 2. Safety, before anything is matched. ──
  const unsafe = safetySignal(words, list);
  if (unsafe) {
    const job = await jobFor(ports, intake, "emergency", {
      outcome: "emergency",
      matched_fault_id: unsafe.fault_id,
      safety_signal: unsafe.signal,
      edition,
      said_or_sent: words,
    });
    if (job?.created) await ports.notify(ON_CALL, job.id, "emergency");
    if (isCall) await ports.say(intake_id, EMERGENCY_SAID);
    else if (source !== "alert") await ports.draftReply(intake_id, intake.customer_external_id, EMERGENCY_TEXT, { outcome: "emergency" });
    await ports.logTriage({ ...base, matched_fault_id: unsafe.fault_id, outcome: "emergency", job_external_id: job?.id ?? null });
    return;
  }

  // ── An open exception on the customer stops the chain. ──
  if (intake.customer_external_id) {
    const open = await ports.openExceptions(intake.customer_external_id);
    if (open.length > 0) {
      await ports.logTriage({
        ...base,
        matched_fault_id: null,
        outcome: "parked",
        job_external_id: null,
        held_by: open[0].exception_id,
      });
      return;
    }
  }

  // ── 9. A price question goes to a person. ──
  if (source !== "alert" && PRICE_RE.test(words)) {
    if (isCall) await ports.say(intake_id, PRICE_SAID);
    await ports.escalate(intake_id, "price_requested", [{ who: "customer", text: words }]);
  }

  const matches = matchFaults(words, list);
  const fault = matches.length === 1 ? matches[0] : null;

  // ── 7. An alarm opens an intake, it does not decide. ──
  if (source === "alert") {
    if (fault && fault.on_alert === "job") {
      const job = await jobFor(ports, intake, "routine", { outcome: "job", matched_fault_id: fault.fault_id, edition, said_or_sent: words });
      await ports.logTriage({ ...base, matched_fault_id: fault.fault_id, outcome: "job", job_external_id: job?.id ?? null });
    } else {
      const ex = await ports.raiseException({
        reason: fault ? "fault.alert_left_to_person" : "fault.alert_unplaced",
        intake_id,
        asset_id: intake.asset_id ?? null,
        customer_external_id: intake.customer_external_id ?? null,
        matched_fault_id: fault?.fault_id ?? null,
        edition,
        exception_owner: EXCEPTION_OWNER,
      });
      await ports.logTriage({
        ...base,
        matched_fault_id: fault?.fault_id ?? null,
        outcome: "parked",
        job_external_id: null,
        exception_id: ex?.exception_id ?? null,
      });
    }
    return;
  }

  // ── 3. Matched only to the written list. ──
  if (!fault) {
    const job = await jobFor(ports, intake, "unclassified", {
      outcome: "unclassified",
      matched_fault_id: null,
      candidates: matches.map((m) => m.fault_id),
      edition,
      said_or_sent: words,
    });
    await answerJob(ports, intake, job, "unclassified");
    await ports.logTriage({ ...base, matched_fault_id: null, outcome: "unclassified", job_external_id: job?.id ?? null });
    return;
  }

  // ── 4. A remote fix only from a written procedure, for their model. ──
  const proc = fault.remote_procedure;
  let fits = Boolean(proc && proc.customer_may_do === true && Array.isArray(proc.steps) && proc.steps.length > 0 && proc.success_question);
  if (fits && Array.isArray(fault.applies_to) && fault.applies_to.length > 0) {
    const asset = intake.asset_id ? await ports.readAsset(intake.asset_id) : null;
    fits = Boolean(asset && fault.applies_to.includes(asset.model));
  }

  if (!fits) {
    const job = await jobFor(ports, intake, "routine", { outcome: "job", matched_fault_id: fault.fault_id, edition, said_or_sent: words, steps_tried: [] });
    await answerJob(ports, intake, job, "job");
    await ports.logTriage({ ...base, matched_fault_id: fault.fault_id, outcome: "job", job_external_id: job?.id ?? null });
    return;
  }

  if (isCall) {
    for (const step of proc.steps) await ports.say(intake_id, step);
    const answer = await ports.ask(intake_id, proc.success_question);
    await resolve(ports, intake, fault, edition, words, answer);
    return;
  }

  // A text or portal message: the steps and the question, as written, in a
  // draft. A named person sends it; the customer's reply resolves it.
  await ports.draftReply(intake_id, intake.customer_external_id, [...proc.steps, proc.success_question].join("\n"), {
    outcome: "awaiting_answer",
    fault_id: fault.fault_id,
    edition,
    said_or_sent: words,
    source,
    asset_id: intake.asset_id ?? null,
  });
}

/** The customer's text reply to a released draft carrying a procedure. */
async function answerReceived(ports, reply) {
  const draft = await ports.readDraft(reply.in_reply_to);
  if (!draft || draft.status !== "sent" || draft.meta?.outcome !== "awaiting_answer" || draft.meta?.resolved) return;
  const list = await ports.readFaultList();
  // A safety signal in the reply still goes to the emergency path.
  if (safetySignal(reply.said_or_sent ?? "", list)) {
    return triage(ports, { ...reply, intake_id: draft.intake_id, in_reply_to: undefined, source: draft.meta.source });
  }
  const fault = (list.faults ?? []).find((f) => f.fault_id === draft.meta.fault_id);
  const original = {
    intake_id: draft.intake_id,
    source: draft.meta.source,
    customer_external_id: draft.customer_external_id,
    asset_id: draft.meta.asset_id,
  };
  await resolve(ports, original, fault, draft.meta.edition, draft.meta.said_or_sent, reply.said_or_sent, list.edition);
}

async function resolve(ports, intake, fault, edition, words, answer) {
  const proc = fault.remote_procedure;
  const base = {
    intake_id: intake.intake_id,
    source: intake.source,
    customer_external_id: intake.customer_external_id ?? null,
    said_or_sent: words,
    procedure_edition: edition,
    matched_fault_id: fault.fault_id,
    steps_tried: proc.steps,
    customer_said: answer,
  };
  // ── 5. Fixed means the customer said so. ──
  if (isYes(answer)) {
    await ports.logTriage({ ...base, outcome: "fixed_remotely", customer_confirmed_fixed: true, job_external_id: null });
    return;
  }
  const job = await jobFor(ports, intake, "routine", {
    outcome: "job",
    matched_fault_id: fault.fault_id,
    edition,
    said_or_sent: words,
    steps_tried: proc.steps,
    customer_said: answer,
  });
  await answerJob(ports, intake, job, "job");
  await ports.logTriage({ ...base, outcome: "job", customer_confirmed_fixed: false, job_external_id: job?.id ?? null });
}

/**
 * ── 6. One job, written once, carrying what was tried. ──
 * An open job for the same customer is updated, not duplicated. No id back
 * means nothing was written: a named person is told.
 */
async function jobFor(ports, intake, type, triage) {
  const intentId = `${intake.intake_id}:job:${NODE}`;
  const cust = intake.customer_external_id ?? null;
  const open = cust ? await ports.findOpenJob(cust) : null;
  if (open) {
    const res = await ports.updateJob(open.id, { triage, duplicate_of: open.id }, intentId);
    if (res?.id) return { id: res.id, created: false };
  } else {
    const res = await ports.writeJob({ customer_external_id: cust, asset_id: intake.asset_id ?? null, type, triage }, intentId);
    if (res?.id) return { id: res.id, created: true };
  }
  await ports.raiseException({
    reason: "fault.job_write_failed",
    intake_id: intake.intake_id,
    customer_external_id: cust,
    outcome: triage.outcome,
    exception_owner: EXCEPTION_OWNER,
  });
  if (type === "emergency") await ports.escalate(intake.intake_id, "emergency_job_write_failed", [{ who: "customer", text: triage.said_or_sent }]);
  return null;
}

/** On a call the caller hears it; in writing it is a draft for a person to send. */
async function answerJob(ports, intake, job, outcome) {
  if (intake.source === "call") await ports.say(intake.intake_id, jobText(job));
  else await ports.draftReply(intake.intake_id, intake.customer_external_id, jobText(job), { outcome });
}

function jobText(job) {
  return job
    ? `Thanks. We've put this on job ${job.id} and someone from the office will be in touch to book a time.`
    : "Thanks. Someone from the office will be in touch to book a time.";
}

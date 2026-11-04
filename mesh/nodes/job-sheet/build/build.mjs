/**
 * Job Sheet: the job card filled in from site, to AIP-BS-JOB-CLOSE.
 *
 * Each run is woken by a capture landing in the close inbox, by a reply from a
 * tech, or by the schedule, and keeps nothing between runs. For every capture
 * in the inbox it works out where that close is from the record (the close log
 * and the exception desk, both by job id) and takes the next step:
 *
 *   1. read the job by the number the tech gave; no job, or a sender who is not
 *      the assigned tech, goes to the office manager and stops
 *   2. store what the tech sent, word for word, before anything is taken from it
 *   3. price every part from the business's own book: one line or parked
 *      (not_in_book, ambiguous, or variation on a quoted job)
 *   4. send the tech one draft and wait; only a YES naming that draft, from the
 *      assigned tech's own mobile, lets it be written
 *   5. no yes inside the window: raise not_confirmed to the supervisor, once
 *   6. write the card once under close:<tenant>:<job>:<capture>, re-reading the
 *      book first; no ids back is not written, raised as write_failed, retried
 *      under the same intent id on the next run
 *   7. only then mark the job Completed, read it back, and raise each parked
 *      item to the exception desk with its owner
 *
 * It never creates a job, never prices a part the book does not hold, never
 * prices a variation and never sends an invoice. Completion is the handover:
 * Invoice Out reads the completed job and bills it behind its own release.
 *
 * Everything goes through the ports. Live, the write is Office Voice's
 * close_job; this build does not hand-roll it.
 *
 * `makeBuild(flaw)` exists so the harness can prove each check goes red for a
 * build that breaks it (see mutants.mjs). The listed build is `build`, with no
 * flaw switched on.
 */

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const money = (n) => `$${Number(n).toFixed(2)}`;

/** The tech's words against the book. Returns one line, or why it is parked. */
export function resolvePart(spoken, book) {
  const s = norm(spoken);
  const parts = book.filter((l) => l.kind !== "labour");
  const exact = parts.filter((l) => norm(l.name) === s || (l.aliases ?? []).some((a) => norm(a) === s));
  const loose = parts.filter((l) => norm(l.name).includes(s) || (l.aliases ?? []).some((a) => norm(a).startsWith(s)));
  const hits = exact.length ? exact : loose;
  if (hits.length === 0) return { parked: "not_in_book" };
  if (hits.length > 1) return { parked: "ambiguous" };
  return { line: hits[0] };
}

/** The draft card from the stored copy, priced from the book as it is right now. */
export function price(copy, book, quote, flaw = {}) {
  const lines = [];
  const parked = [];
  const covered = (code) => flaw.priceVariation || !quote || (quote.covers ?? []).includes(code);
  for (const p of copy.parts_used ?? []) {
    const r = resolvePart(p.spoken, book);
    if (r.parked) {
      if (flaw.parkAsLine) lines.push({ kind: "part", qty: p.qty, unit_price: 0, source: "pricebook", description: p.spoken });
      else parked.push({ spoken: p.spoken, qty: p.qty, reason: r.parked });
      continue;
    }
    if (!covered(r.line.code)) {
      parked.push({ spoken: p.spoken, qty: p.qty, reason: "variation" });
      continue;
    }
    lines.push({ kind: "part", catalogue_code: r.line.code, description: r.line.name, qty: p.qty, unit_price: r.line.unit_price, source: "pricebook" });
  }
  if (Number(copy.labour_hours) > 0) {
    const lab = book.find((l) => l.kind === "labour");
    if (!lab) parked.push({ spoken: `labour ${copy.labour_hours} h`, qty: copy.labour_hours, reason: "not_in_book" });
    else if (!covered(lab.code)) parked.push({ spoken: `labour ${copy.labour_hours} h`, qty: copy.labour_hours, reason: "variation" });
    else lines.push({ kind: "labour", catalogue_code: lab.code, description: lab.name, qty: Number(copy.labour_hours), unit_price: lab.unit_price, source: "pricebook" });
  }
  return { work_done: copy.notes ? `${copy.transcript}\n${copy.notes}` : copy.transcript, lines, parked };
}

function draftText(jobId, draftId, card) {
  const lines = card.lines.map((l) => `${l.catalogue_code ?? l.description} x${l.qty} ${money(l.unit_price)}`).join("; ");
  const parked = card.parked.length ? ` Parked for the office: ${card.parked.map((p) => `${p.spoken} (${p.reason.replace(/_/g, " ")})`).join("; ")}.` : "";
  return `Job ${jobId}, draft ${draftId}. Work done: ${card.work_done} Lines: ${lines || "none"}.${parked} Reply YES ${draftId} to save it to the job.`;
}

const OWNER_KEY = { not_in_book: "office_manager", ambiguous: "office_manager", variation: "variation_pricer" };

export function makeBuild(flaw = {}) {
  return async function build(ports) {
    const rule = await ports.readRule();
    const windowMs = Number(rule.confirm_window_minutes) * 60_000;
    const inbox = await ports.readInbox();
    const replies = inbox.filter((m) => m.kind === "reply");
    for (const cap of inbox.filter((m) => m.kind === "capture")) {
      await closeOne(ports, rule, windowMs, cap, replies, flaw);
    }
  };
}

async function closeOne(ports, rule, windowMs, cap, replies, flaw) {
  const jobId = cap.job_number;
  const captureId = cap.message_id;
  const draftId = `D-${captureId}`;
  const baseIntent = `close:${rule.tenant}:${jobId}:${captureId}`;

  // Where this close is, read off the record.
  const mine = (await ports.readLog(jobId)).filter((r) => r.capture_id === captureId);
  if (!flaw.forgetsCompletion && mine.some((r) => r.step === "completed")) return;
  const raised = (await ports.readExceptions(jobId)).filter((e) => e.capture_id === captureId);
  const raiseOnce = async (key, reason, owner, words) => {
    if (!flaw.noDedupeExceptions && raised.some((e) => e.key === key)) return;
    const { exception_id } = await ports.raiseException({ job_id: jobId, capture_id: captureId, key, reason, owner, exception_owner: owner, words });
    raised.push({ key });
    await ports.writeLog(jobId, { capture_id: captureId, step: "exception", key, reason, owner, exception_id });
  };
  const om = rule.owners.office_manager;

  // 1. The job exists and this tech is on it.
  const job = await ports.readJob(jobId);
  if (!job && !flaw.skipJobCheck) return raiseOnce("no_job", "no_job", om, cap.transcript);
  const tech = flaw.skipTechCheck ? job.assigned_techs[0] : job.assigned_techs.find((t) => t.mobile === cap.from);
  if (!tech) return raiseOnce("not_assigned", "not_assigned", om, cap.transcript);

  // The mesh contract: an exception another step left open on this job stops us.
  if ((job.open_exceptions ?? []).length > 0) return;

  // 2. Store the tech's words before anything is taken from them.
  const verbatim = {
    message_id: cap.message_id,
    from: cap.from,
    at: cap.at,
    job_number: cap.job_number,
    transcript: cap.transcript,
    notes: cap.notes,
    photos: cap.photos,
    parts_used: cap.parts_used,
    labour_hours: cap.labour_hours,
  };
  let ev = flaw.noEvidence ? { copy: verbatim } : await ports.readEvidence(captureId);
  if (!ev && !flaw.evidenceAfterDraft) {
    const { evidence_id } = await ports.storeEvidence(captureId, jobId, verbatim);
    await ports.writeLog(jobId, { capture_id: captureId, step: "captured", evidence_id });
    ev = await ports.readEvidence(captureId);
  }
  const copy = ev?.copy ?? verbatim;

  // 3, 4 and 5. Draft once, priced from the book, and send it to the tech.
  const drafted = mine.find((r) => r.step === "drafted");
  if (!drafted) {
    const card = price(copy, await ports.readPricebook(), job.quote, flaw);
    await ports.sendSms(tech.mobile, draftText(jobId, draftId, card), { job_id: jobId, capture_id: captureId, draft_id: draftId });
    await ports.writeLog(jobId, {
      capture_id: captureId,
      step: "drafted",
      draft_id: draftId,
      to: tech.tech_id,
      lines: card.lines.map((l) => ({ code: l.catalogue_code ?? null, qty: l.qty, unit_price: l.unit_price })),
      parked: card.parked,
    });
    if (flaw.evidenceAfterDraft) {
      const { evidence_id } = await ports.storeEvidence(captureId, jobId, verbatim);
      await ports.writeLog(jobId, { capture_id: captureId, step: "captured", evidence_id });
    }
    if (!flaw.autoConfirm) {
      if (flaw.earlySupervisor) await raiseOnce("not_confirmed", "not_confirmed", rule.supervisors[tech.tech_id], copy.transcript);
      return;
    }
  }
  const draftAt = Date.parse(drafted?.at ?? ports.now().toISOString());

  // The tech's yes: from the assigned tech's own mobile, naming this draft.
  let confirmed = mine.find((r) => r.step === "confirmed");
  if (!confirmed) {
    const yes = new RegExp(`^\\s*yes\\s+${draftId.replace(/[-]/g, "\\-")}\\b`, "i");
    const reply = replies.find(
      (r) => (flaw.anyYes || r.from === tech.mobile) && yes.test(r.text) && Date.parse(r.at) >= draftAt,
    );
    if (reply) {
      confirmed = { by: tech.tech_id, confirmed_at: reply.at, reply_id: reply.message_id };
      await ports.writeLog(jobId, { capture_id: captureId, step: "confirmed", draft_id: draftId, ...confirmed });
    } else if (flaw.autoConfirm) {
      confirmed = { by: "model" };
    }
  }
  if (!confirmed) {
    const late = ports.now().getTime() - draftAt >= windowMs;
    if (late && !flaw.noSupervisor) await raiseOnce("not_confirmed", "not_confirmed", rule.supervisors[tech.tech_id], copy.transcript);
    return;
  }

  // 6. One write, under one intent id, priced from the book as it is now.
  const attempts = mine.filter((r) => r.step === "write").length;
  const intentId = flaw.newIntentOnRetry ? `${baseIntent}:${attempts + 1}` : baseIntent;
  const book = flaw.priceAtDraft ? null : await ports.readPricebook();
  const card = book
    ? price(copy, book, job.quote, flaw)
    : { ...price(copy, [], job.quote, flaw), lines: (drafted?.lines ?? []).map((l) => ({ kind: "part", catalogue_code: l.code, qty: l.qty, unit_price: l.unit_price, source: "pricebook" })), parked: drafted?.parked ?? [] };

  if (flaw.completeFirst && job.status !== "Completed") await ports.writeJob(jobId, { status: "Completed" }, intentId);

  const res = await ports.closeJob({ job_external_id: jobId, work_done: card.work_done, lines: card.lines, photos: copy.photos, intent_id: intentId });
  const ids = res?.external_ids ?? [];
  const written = ids.length > 0 || flaw.ignoreIds;
  if (!flaw.noLog) {
    await ports.writeLog(jobId, written && ids.length
      ? { capture_id: captureId, step: "write", attempt: attempts + 1, intent_id: intentId, ok: true, external_ids: ids }
      : { capture_id: captureId, step: "write", attempt: attempts + 1, intent_id: intentId, ok: false, reason: res === null ? "no answer from the job system" : "no ids back" });
  } else {
    await ports.writeLog(jobId, { capture_id: captureId, step: "write" });
  }
  if (!written) return raiseOnce("write_failed", "write_failed", om, copy.transcript);

  // 7. Complete only now, read it back, then park what needs a person.
  if (job.status !== "Completed" && !flaw.completeFirst) await ports.writeJob(jobId, { status: "Completed" }, intentId);
  const back = await ports.readJob(jobId);
  for (const [i, p] of card.parked.entries()) {
    const owner = flaw.oneOwner ? om : rule.owners[OWNER_KEY[p.reason]];
    await raiseOnce(`parked:${i}`, p.reason, owner, p.spoken);
  }
  await ports.writeLog(jobId, { capture_id: captureId, step: "completed", intent_id: intentId, status: back?.status ?? null });
}

export const build = makeBuild();

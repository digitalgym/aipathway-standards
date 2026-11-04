/**
 * Meeting Notes: built to AIP-BS-CLIENT-MEMORY 2026-10-29.
 * https://aipathway.com.au/explore-ai/client-memory-build-standard
 *
 * An original build. After a client meeting, the practice's notes (typed by
 * the accountant, or written by a note-taking model) land in a watched inbox
 * naming the practice-management job they belong to. Meeting Notes files what
 * was said against that client's record as PROPOSED memory items, each with
 * its source, for a partner or the practice manager to accept or reject.
 *
 * Narrowed from the job as found: it files facts, preferences and standing
 * instructions only. The meeting's running summary and its action items stay
 * in the practice-management system as notes and tasks: the standard says a
 * summary is conversation state, not memory, until someone proposes an item.
 *
 * What one run does, every time it is woken (email.received for a meeting
 * note, the approval surface's decision, a draft coming due, or the review on
 * schedule.tick):
 *
 *   1. Read the inbox. Nothing is carried from an earlier run.
 *   2. A meeting note: read the job by its id for the client id, stop if an
 *      exception is open on it, read that client's memory, and propose each
 *      item heard. Said by the client = stated; written by a model = inferred,
 *      naming the model. A change to an approved item names it in supersedes.
 *   3. A decision: only from the approval surface, only by someone on the
 *      approvers list. Anyone or anything else is escalated, nothing changes.
 *      Approving a change versions it and marks the old one superseded.
 *   4. A draft coming due for a client (from any other step): read the job,
 *      read the approved slice fresh, address the draft by it, hold it for a
 *      person to release. Nothing is sent from here.
 *   5. The review: list every approved standing instruction with its version
 *      and when it was last followed, flag drift, publish, change nothing.
 *
 * Every effect goes through the ports.
 */

export const SLUG = "meeting-notes";

/** Which address instruction governs which kind of draft. A specific key beats send_to. */
const ADDRESS_KEYS = { quote: "quote_to", invoice: "invoice_to", chase: "chase_to", follow_up: "follow_up_to" };
const appliesTo = (key, purpose) => key === "send_to" || ADDRESS_KEYS[purpose] === key;

const approvedSlice = (items) => items.filter((i) => i.status === "approved");

/**
 * @param {ReturnType<import("./memory-world.mjs").MemoryWorld["prototype"]["ports"]>} ports
 */
export async function build(ports) {
  const incoming = (await ports.readInbox("incoming")) ?? [];
  for (const entry of incoming) {
    if (entry.kind === "meeting_note") await fileMeetingNote(ports, entry);
    else if (entry.kind === "decision") await applyDecision(ports, entry);
    else if (entry.kind === "draft_due") await draftForClient(ports, entry);
    else if (entry.kind === "review_due") await review(ports);
  }
}

/** Read the job by id. Returns null (and raises) when there is nothing safe to act on. */
async function jobFor(ports, jobId, ref) {
  if (!jobId) {
    await ports.escalate({ reason: "memory.no_job_id", ref, exception_owner: "practice_manager" });
    return null;
  }
  const job = await ports.readJob(jobId);
  if (!job || !job.client_id) {
    await ports.escalate({ reason: "memory.job_unreadable", job_id: jobId, ref, exception_owner: "practice_manager" });
    return null;
  }
  if (job.open_exception) return null; // an open exception with a named owner stops the chain
  return job;
}

async function fileMeetingNote(ports, note) {
  const job = await jobFor(ports, note.job_id, note.message_id);
  if (!job) return;
  const all = (await ports.readMemory(job.client_id)) ?? [];
  const approved = approvedSlice(all);

  for (const heard of note.heard ?? []) {
    // Safe to repeat: the same note never proposes the same key twice.
    const already = all.some((i) => i.source?.ref === note.message_id && i.key === heard.key && i.value === heard.value);
    if (already) continue;
    // Nothing new: the approved item already says this.
    if (approved.some((i) => i.key === heard.key && i.value === heard.value)) continue;

    const inferred = heard.said_by !== "client";
    const replaces = approved.find((i) => i.type === heard.type && i.key === heard.key && i.value !== heard.value) ?? null;
    const proposal = {
      client_id: job.client_id,
      job_id: job.id,
      type: heard.type,
      key: heard.key,
      value: heard.value,
      content: heard.content,
      critical: false, // which instructions are critical stays with a person
      source: inferred ? { kind: "inferred", ref: note.message_id, by: heard.model ?? "unnamed model" } : { kind: "stated", ref: note.message_id },
      proposed_at: (await ports.now()).toISOString(),
      status: "proposed",
      version: null,
      supersedes: replaces ? replaces.id : null,
      idempotency_key: `${note.message_id}:${heard.key}:${SLUG}`,
    };
    const res = await ports.proposeMemory(proposal);
    const back = res?.id ? await ports.readMemoryItem(res.id) : null;
    if (!back || back.client_id !== job.client_id || back.status !== "proposed") {
      await ports.escalate({ reason: "memory.write_not_read_back", job_id: job.id, ref: note.message_id, exception_owner: "practice_manager" });
      return;
    }
  }
}

async function applyDecision(ports, d) {
  const approvers = (await ports.readRule("approvers")) ?? [];
  const authorised = d.surface === "approval_surface" && approvers.includes(d.by);
  if (!authorised) {
    await ports.escalate({ reason: "unauthorised_approver", decision_id: d.decision_id, item_id: d.item_id, by: d.by, exception_owner: "practice_manager" });
    return;
  }
  const item = await ports.readMemoryItem(d.item_id);
  if (!item || item.status !== "proposed") {
    await ports.escalate({ reason: "memory.decision_on_non_proposal", decision_id: d.decision_id, item_id: d.item_id, exception_owner: "practice_manager" });
    return;
  }
  if (d.action === "reject") {
    await ports.writeMemory(item.id, { status: "rejected", rejected_by: d.by, rejected_at: d.at }, d.decision_id);
    return;
  }
  if (d.action !== "approve") return;

  let version = 1;
  let old = null;
  if (item.supersedes) {
    old = await ports.readMemoryItem(item.supersedes);
    if (!old || old.status !== "approved") {
      await ports.escalate({ reason: "memory.superseded_item_not_in_force", decision_id: d.decision_id, item_id: d.item_id, exception_owner: "practice_manager" });
      return;
    }
    version = (old.version ?? 1) + 1;
  }
  await ports.writeMemory(item.id, { status: "approved", approved_by: d.by, approved_at: d.at, version }, d.decision_id);
  if (old) await ports.writeMemory(old.id, { status: "superseded", superseded_by: item.id }, d.decision_id);
}

async function draftForClient(ports, due) {
  const job = await jobFor(ports, due.job_id, due.ref);
  if (!job) return;
  // Read fresh, every time, by the client id on the job. Never by name or phone.
  const slice = approvedSlice((await ports.readMemory(job.client_id)) ?? []);
  const rules = slice.filter((i) => i.type === "standing_instruction" && appliesTo(i.key, due.purpose));
  const specific = rules.find((i) => i.key !== "send_to");
  const chosen = specific ?? rules.find((i) => i.key === "send_to") ?? null;
  await ports.draftMessage({
    job_id: job.id,
    client_id: job.client_id,
    purpose: due.purpose,
    to: chosen ? chosen.value : job.contact_email,
    followed: chosen ? [chosen.id] : [],
    memory_read_at: (await ports.now()).toISOString(),
    release: "held for a named person",
  });
}

async function review(ports) {
  const all = (await ports.listMemory()) ?? [];
  const drafts = (await ports.readInbox("drafts")) ?? [];
  const instructions = approvedSlice(all).filter((i) => i.type === "standing_instruction");
  const lines = instructions.map((i) => {
    const others = instructions.filter((o) => o.id !== i.id && o.client_id === i.client_id && o.key === i.key && o.value !== i.value);
    const since = drafts.filter((d) => d.client_id === i.client_id && appliesTo(i.key, d.purpose) && (!i.approved_at || d.at >= i.approved_at));
    const followed = since.filter((d) => d.to === i.value);
    const missed = since.filter((d) => d.to !== i.value);
    const last = followed.map((d) => d.at).sort().at(-1) ?? null;
    if (others.length) return { item_id: i.id, version: i.version, last_followed: last, flag: "contradicted", evidence: others.map((o) => o.id) };
    if (missed.length) return { item_id: i.id, version: i.version, last_followed: last, flag: "not_applied", evidence: missed.map((d) => d.id) };
    return { item_id: i.id, version: i.version, last_followed: last, flag: "ok", evidence: followed.map((d) => d.id) };
  });
  const res = await ports.publishReport({ kind: "client_memory_review", at: (await ports.now()).toISOString(), lines });
  if (!res?.report_id) await ports.escalate({ reason: "memory.review_not_published", exception_owner: "practice_manager" });
}

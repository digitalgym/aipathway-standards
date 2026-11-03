/**
 * The Cash Seam, as Chase Desk carries it.
 *
 * Built to AIP-BS-CASH-SEAM 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/cash-seam-build-standard (CC BY 4.0).
 *
 * Chase Desk's own hop is the LAST one: a ledger schedule fires
 * `invoice_overdue`, the node reads the live ledger, takes each overdue
 * invoice by the id the ledger issued, reads its job by the job id on that
 * invoice, stops on an open exception, re-reads the invoice by id, and sends a
 * chase only under a named release.
 *
 * The Cash Seam checks assert one id surviving every handover from the call to
 * the chase, so the three hops before Chase Desk are here too, as THIN
 * STAND-INS, clearly labelled below. They are not Chase Desk and they do not
 * do the other nodes' jobs: they take an id, write one record against it,
 * read it back, and stop on an exception. They price nothing, word nothing and
 * book nothing. In the Mesh those hops are other nodes (an after-hours intake,
 * a Quote Out node, an Invoice Out node).
 *
 * The build runs once per delivered event and keeps nothing between runs.
 */

/** Which event wakes which hop. A chat message wakes nothing. */
const HOPS = {
  call_received: standInIntake,
  job_created: standInQuote,
  quote_accepted: standInAccepted,
  job_completed: standInInvoice,
  invoice_overdue: chase,
};
const UNATTENDED = new Set(["webhook", "schedule", "poll"]);

export async function build(ports) {
  const ev = await ports.event();
  if (!ev || !UNATTENDED.has(ev.via)) return;
  const hop = HOPS[ev.name];
  if (hop) await hop(ports, ev);
}

async function ownerFor(ports, stage) {
  const owners = (await ports.readOwners()) ?? {};
  return owners[stage] ?? null;
}

/** An open exception on the job stops this hop, and the hold names that exception's owner. */
async function stoppedByException(ports, job, stage, ev) {
  if (!job?.exception) return false;
  await ports.escalate({
    stage,
    ref: job.id,
    reason: "held_open_exception",
    owner: job.exception.owner ?? (await ownerFor(ports, stage)),
    detail: `job ${job.id} carries an open exception ("${job.exception.reason}"); ${ev.name} ${ev.id} not acted on`,
  });
  return true;
}

/** A send needs a release naming a rule the business set. No rule: it waits for a person. */
async function released(ports, kind, id) {
  const rule = await ports.readReleaseRule();
  if (!rule?.name) return false;
  await ports.release({ kind, id, rule: rule.name });
  return true;
}

// ── THIN STAND-IN, not Chase Desk: intake. The one hop allowed a phone match. ──
async function standInIntake(ports, ev) {
  const open = (await ports.searchJobs({ phone: ev.phone, status: "open" })) ?? [];
  if (open.length > 0) {
    if (open[0].exception) return;
    await ports.attachEnquiry({ jobId: open[0].id, enquiryId: ev.enquiryId, trigger: ev.id });
    return;
  }
  const out = await ports.writeJob({ enquiryId: ev.enquiryId, customerName: ev.customerName, phone: ev.phone, trigger: ev.id });
  const id = out?.externalId ?? null;
  if (!id || !(await ports.readJob(id))) {
    await ports.escalate({ stage: "job", ref: id, reason: "write_failed", owner: await ownerFor(ports, "job"), detail: `enquiry ${ev.enquiryId}: job write gave no id that reads back` });
  }
}

// ── THIN STAND-IN, not Chase Desk: one quote per job, read back, released by rule. ──
async function standInQuote(ports, ev) {
  const job = await ports.readJob(ev.jobId);
  if (!job || (await stoppedByException(ports, job, "quote", ev))) return;
  if ((job.quotes ?? []).length > 0) return;
  const out = await ports.draftQuote({ jobId: job.id, trigger: ev.id });
  const id = out?.externalId ?? null;
  const back = id ? await ports.readQuote(id) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "quote", ref: job.id, reason: "write_failed", owner: await ownerFor(ports, "quote"), detail: id ? `quote ${id} was confirmed but does not read back` : "quote write returned no id" });
    return;
  }
  if (await released(ports, "quote", back.id)) await ports.send({ kind: "quote", id: back.id, trigger: ev.id });
}

// ── THIN STAND-IN, not Chase Desk: an acceptance is read back by id; nothing written. ──
async function standInAccepted(ports, ev) {
  if (ev.quoteId) await ports.readQuote(ev.quoteId);
}

// ── THIN STAND-IN, not Chase Desk: one invoice against the job and its accepted quote. ──
async function standInInvoice(ports, ev) {
  const job = await ports.readJob(ev.jobId);
  if (!job || job.status !== "complete" || (await stoppedByException(ports, job, "invoice", ev))) return;
  let quoteId = null;
  for (const q of job.quotes ?? []) {
    const back = await ports.readQuote(q.id);
    if (back?.status === "accepted" && back.jobId === job.id) {
      quoteId = back.id;
      break;
    }
  }
  const out = await ports.writeInvoice({ jobId: job.id, quoteId, trigger: ev.id });
  const id = out?.externalId ?? null;
  const back = id ? await ports.readInvoice(id) : null;
  if (!back || back.jobId !== job.id) {
    await ports.escalate({ stage: "invoice", ref: job.id, reason: "write_failed", owner: await ownerFor(ports, "invoice"), detail: id ? `invoice ${id} does not read back` : "invoice write returned no id" });
    return;
  }
  if (await released(ports, "invoice", back.id)) await ports.send({ kind: "invoice", id: back.id, trigger: ev.id });
}

// ── CHASE DESK'S OWN HOP: the chase, off the live ledger, by the ledger's id. ──
async function chase(ports, ev) {
  const rows = (await ports.readLedger()) ?? [];
  const chased = new Set();
  for (const row of rows) {
    if (!row.overdue || !row.id || chased.has(row.id)) continue;
    // The invoice names its job by id. No name, no phone.
    const job = row.jobId ? await ports.readJob(row.jobId) : null;
    if (!job) {
      await ports.escalate({ stage: "chase", ref: row.id, reason: "job_unreadable", owner: await ownerFor(ports, "chase"), detail: `invoice ${row.id} names job ${row.jobId ?? "(none)"}, which does not read back` });
      continue;
    }
    if (await stoppedByException(ports, job, "chase", ev)) continue;
    // Read the invoice again by its id immediately before the chase: paid or
    // moved since the ledger read means no chase.
    const live = await ports.readInvoice(row.id);
    if (!live || live.status !== "sent") continue;
    if (!(await released(ports, "chase", live.id))) continue;
    await ports.send({ kind: "chase", id: live.id, trigger: ev.id });
    chased.add(live.id);
  }
}

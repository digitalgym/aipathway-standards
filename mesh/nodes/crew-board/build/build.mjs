/**
 * Crew Board: who goes where and when, for a lawn care or field-service crew,
 * built to AIP-BS-DISPATCH-BOARD 2026-10-03
 * (https://aipathway.com.au/explore-ai/dispatch-board-build-standard).
 *
 * One run is one pass of the mesh loop. It is woken by a schedule tick or a
 * job event, reads every job by id from the job system, and for each job that
 * needs it does the checks in the standard's order:
 *
 *   1. resolve the address; no slot until it resolves
 *   2. read the licence rule for each code the job needs; only current holders
 *   3. place the slot inside the window, after the previous job plus travel read
 *   4. write one slot per job, updating the existing one; no id back is a failed write
 *   5. an emergency displaces a slot only when the named dispatcher accepts
 *   6. tell the customer once, only on a channel with consent
 *   7. tell the tech with the job id, address, window and the customer's words
 *   8. a change to the job moves the slot in place and tells each party once
 *   9. anything it cannot slot is escalated with a reason and an owner
 *  10. the customer message is attached to the slot, so the record answers "who told me"
 *
 * Nothing is kept between runs. The slot's job_version is the seam: a job whose
 * slot was made for its current version is left alone, so a repeated event does
 * not write or message twice.
 *
 * Everything goes through the ports it is handed.
 */

const RULE = "crew-board/v1";
const CHANNEL = "sms";
const MIN = 60 * 1000;

const t = (iso) => new Date(iso).getTime();
const iso = (ms) => new Date(ms).toISOString();

/**
 * Earliest start for a job of `dur` ms at `addr` on one tech, inside the window,
 * against that tech's other slots, with travel read both ways. Null if it does not fit.
 */
async function earliestFit(ports, busy, addr, win, dur, notBefore) {
  const from = Math.max(t(win.from), notBefore ?? -Infinity);
  const to = t(win.to);
  const sorted = [...busy].sort((a, b) => t(a.start) - t(b.start));
  const candidates = [from];
  for (const s of sorted) {
    const travel = s.address ? await ports.readTravel(s.address, addr) : 0;
    candidates.push(t(s.end) + travel);
  }
  candidates.sort((a, b) => a - b);
  for (const start of candidates) {
    if (start < from) continue;
    const end = start + dur;
    if (end > to) continue;
    let ok = true;
    for (const s of sorted) {
      const sStart = t(s.start);
      const sEnd = t(s.end);
      if (sEnd <= start) {
        const travel = s.address ? await ports.readTravel(s.address, addr) : 0;
        if (sEnd + travel > start) ok = false;
      } else if (sStart >= end) {
        const travel = s.address ? await ports.readTravel(addr, s.address) : 0;
        if (end + travel > sStart) ok = false;
      } else ok = false;
      if (!ok) break;
    }
    if (ok) return start;
  }
  return null;
}

/** Techs whose licence record covers every code the job needs, current today. Read, never inferred. */
async function licensedTechs(ports, techs, requires, now) {
  let allowed = new Set(techs.map((x) => x.id));
  for (const code of requires) {
    const rule = await ports.readLicenceRule(code);
    const current = new Set(
      (rule?.holders ?? []).filter((h) => h.current === true && t(h.expires) > now).map((h) => h.techId),
    );
    allowed = new Set([...allowed].filter((id) => current.has(id)));
  }
  return techs.filter((x) => allowed.has(x.id));
}

/** Best placement across the eligible techs: earliest start wins. */
async function place(ports, slots, techs, job, addr, ignoreSlotId) {
  let best = null;
  for (const tech of techs) {
    const busy = slots.filter((s) => s.techId === tech.id && s.id !== ignoreSlotId && s.jobId !== job.id);
    const start = await earliestFit(ports, busy, addr, job.window, job.durationMin * MIN);
    if (start !== null && (!best || start < best.start)) best = { tech, start };
  }
  return best;
}

async function tellCustomer(ports, job, slot, kind, owner) {
  const consent = await ports.checkConsent(job.customerId, CHANNEL);
  if (!consent) {
    await ports.escalate(job.id, "no_consent", owner);
    return;
  }
  const body =
    kind === "moved"
      ? `Your visit for job ${job.id} has moved: now ${slot.start} to ${slot.end}.`
      : `Your visit for job ${job.id} is booked for ${slot.start} to ${slot.end}.`;
  const msg = await ports.sendSms({
    to: job.customerId,
    channel: CHANNEL,
    slotId: slot.id,
    bodyRef: `${job.id}:v${job.version}:${kind}`,
    body,
  });
  if (msg) await ports.attachEvidence(slot.id, `message:${msg.id}@${msg.sentAt}`);
}

async function tellTech(ports, techId, job, addr, kind) {
  await ports.notifyTech(techId, {
    jobId: job.id,
    address: addr,
    window: { ...job.window },
    customerSaid: job.customerSaid,
    body: `${kind === "moved" ? "Moved" : kind === "removed" ? "Taken off your run" : "New"}: job ${job.id} at ${addr}, window ${job.window.from} to ${job.window.to}. Customer said: "${job.customerSaid}"`,
  });
}

/**
 * @param {any} ports
 */
export async function build(ports) {
  const now = ports.now().getTime();
  const jobs = await ports.readJobs();
  const board = await ports.readBoard();
  const owner = board.dispatcher;
  const techs = board.techs;
  // The board as this run sees it; updated as slots are written, so later jobs see earlier ones.
  const slots = board.slots.map((s) => ({ ...s }));
  const upsertLocal = (s) => {
    const i = slots.findIndex((x) => x.id === s.id);
    if (i >= 0) slots[i] = { ...s };
    else slots.push({ ...s });
  };

  // Emergencies first, then the rest in the order the job system lists them.
  const queue = [...jobs.filter((j) => j.urgency === "emergency"), ...jobs.filter((j) => j.urgency !== "emergency")];

  for (const job of queue) {
    if (job.status === "done") continue;
    const existing = await ports.readSlotForJob(job.id);
    // Made for this version of the job and written with an id: nothing changed, nothing to do.
    if (existing && existing.externalId && existing.jobVersion === job.version) continue;

    // 1. Address before anything else.
    const resolved = await ports.resolveAddress(job.address);
    if (!resolved || !resolved.resolved) {
      await ports.escalate(job.id, "address_unresolved", owner);
      continue;
    }
    const addr = resolved.resolved;

    // Window shorter than the job: nobody can meet it.
    if (t(job.window.to) - t(job.window.from) < job.durationMin * MIN) {
      await ports.escalate(job.id, "window_impossible", owner);
      continue;
    }

    // 2. The licence rule, read before any assignment.
    const eligible = await licensedTechs(ports, techs, job.requires ?? [], now);
    if (eligible.length === 0) {
      await ports.escalate(job.id, "no_licensed_tech", owner);
      continue;
    }

    // 3. Inside the window, after the previous job plus travel.
    let placement = await place(ports, slots, eligible, job, addr, existing?.id);
    let updatedBy = { rule: RULE };
    let displaced = null;

    if (!placement && job.urgency === "emergency") {
      // 5. Propose a displacement; only a named dispatcher can accept it.
      const dur = job.durationMin * MIN;
      const eligibleIds = new Set(eligible.map((x) => x.id));
      const victim = slots
        .filter((s) => eligibleIds.has(s.techId) && s.jobId !== job.id)
        .filter((s) => {
          const vj = jobs.find((j) => j.id === s.jobId);
          return vj && vj.urgency !== "emergency";
        })
        .find((s) => t(s.start) < t(job.window.to) && t(s.end) > t(job.window.from));
      if (victim) {
        const busy = slots.filter((s) => s.techId === victim.techId && s.id !== victim.id);
        const start = await earliestFit(ports, busy, addr, job.window, dur);
        if (start !== null) {
          const answer = await ports.askDispatcher({ emergencyJobId: job.id, displaceSlotId: victim.id });
          if (answer && answer.accepted === true && answer.person) {
            placement = { tech: techs.find((x) => x.id === victim.techId), start };
            updatedBy = { person: answer.person };
            displaced = victim;
          } else {
            await ports.escalate(job.id, "no_capacity", owner);
            continue;
          }
        }
      }
    }

    if (!placement) {
      await ports.escalate(job.id, "no_capacity", owner);
      continue;
    }

    // 4. One slot per job: update the existing one, never a second.
    const write = {
      jobId: job.id,
      techId: placement.tech.id,
      start: iso(placement.start),
      end: iso(placement.start + job.durationMin * MIN),
      address: addr,
      updatedBy,
    };
    if (existing) write.slotId = existing.id;
    const slot = await ports.writeSlot(write);
    if (!slot || !slot.externalId) {
      await ports.escalate(job.id, "write_failed", owner);
      continue;
    }
    upsertLocal(slot);

    const kind = existing ? "moved" : "booked";
    const timeChanged = !existing || existing.start !== slot.start || existing.end !== slot.end || existing.techId !== slot.techId || existing.address !== slot.address;

    // 6 and 7. Each party told once, and only when something they need changed.
    if (timeChanged) {
      await tellCustomer(ports, job, slot, kind, owner);
      await tellTech(ports, slot.techId, job, addr, kind);
      if (existing && existing.techId !== slot.techId) await tellTech(ports, existing.techId, job, addr, "removed");
    }

    // 5, continued. The displaced job is re-slotted this run or escalated; never dropped.
    if (displaced) {
      const djob = jobs.find((j) => j.id === displaced.jobId);
      const daddr = displaced.address;
      const deligible = await licensedTechs(ports, techs, djob.requires ?? [], now);
      const re = await place(ports, slots, deligible, djob, daddr, displaced.id);
      if (re) {
        const moved = await ports.writeSlot({
          slotId: displaced.id,
          jobId: djob.id,
          techId: re.tech.id,
          start: iso(re.start),
          end: iso(re.start + djob.durationMin * MIN),
          address: daddr,
          updatedBy: { person: updatedBy.person },
          displacedBy: job.id,
        });
        if (moved && moved.externalId) {
          upsertLocal(moved);
          await tellCustomer(ports, djob, moved, "moved", owner);
          await tellTech(ports, moved.techId, djob, daddr, "moved");
          if (moved.techId !== displaced.techId) await tellTech(ports, displaced.techId, djob, daddr, "removed");
          continue;
        }
      }
      // Could not re-slot: mark what displaced it and hand it to the dispatcher who accepted.
      const marked = await ports.writeSlot({
        slotId: displaced.id,
        jobId: djob.id,
        techId: displaced.techId,
        start: displaced.start,
        end: displaced.end,
        address: daddr,
        updatedBy: { person: updatedBy.person },
        displacedBy: job.id,
      });
      if (marked) upsertLocal(marked);
      await ports.escalate(djob.id, "displaced", updatedBy.person);
    }
  }
}

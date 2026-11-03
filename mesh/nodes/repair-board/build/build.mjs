/**
 * Repair Board: the dispatch board for a property manager's maintenance jobs.
 *
 * A resident's repair request has already become a maintenance job in the
 * property management system, with its priority set at triage (P1 is an
 * urgent repair and arrives here as `urgency: "emergency"`; P2 to P4 are
 * routine with the window the priority allows). This build takes each job by
 * its id and does the dispatch half of the work, to AIP-BS-DISPATCH-BOARD:
 *
 *   1. resolve the property address, or name the job to a person;
 *   2. read the licence rule for what the repair needs (gas fitting,
 *      electrical, working at heights) and take only trades whose licence is
 *      current on the day;
 *   3. place the visit inside the resident's window, after the trade's
 *      previous visit plus the travel read between the two addresses;
 *   4. write one slot per job onto the work order, updating it on a second
 *      event, and treat a write with no id back as a failed write;
 *   5. let an urgent repair take a routine visit's time only when the named
 *      property manager on the desk accepts it, and re-slot or escalate the
 *      routine visit in the same run;
 *   6. text the resident once per slot, only on a channel they consented to;
 *   7. tell the trade with the job id, the address, the window and the
 *      resident's own words;
 *   8. move the slot on a change and tell each party exactly once;
 *   9. escalate anything it cannot place, with a reason and an owner.
 *
 * Everything goes through the ports. Nothing is remembered between runs: the
 * slot on the work order, with the job version it was written for, is the
 * whole state, so the next run (or the next bot) starts from the record.
 */

const CHANNEL = "sms";
const RULE = "repair-board/earliest-current-licence";
const MIN = 60 * 1000;

const t = (iso) => new Date(iso).getTime();
const iso = (ms) => new Date(ms).toISOString();

/**
 * @param {import("@aipathway/conformance").DispatchPorts} ports
 */
export async function build(ports) {
  const now = t((await ports.now()).toISOString());
  const jobs = await ports.readJobs();
  const board = await ports.readBoard();
  const dispatcher = board.dispatcher;

  // The board as it stands, kept current through this run so two jobs placed
  // in one run do not land on the same time.
  const slots = board.slots.map((s) => ({ ...s }));
  const techs = board.techs;

  // Urgent repairs first, then the rest in the order the job system gives them.
  const order = [...jobs.filter((j) => j.urgency === "emergency"), ...jobs.filter((j) => j.urgency !== "emergency")];

  for (const job of order) {
    if (job.status === "done") continue;
    // An open exception with a named owner on the job stops this node.
    if (job.exception_owner || job.exceptionOwner) continue;

    const existing = await ports.readSlotForJob(job.id);
    // Already slotted for this version of the job: nothing changed, nothing to do.
    if (existing && existing.externalId && existing.jobVersion === job.version) continue;

    // 1. The address resolves before anything else.
    const resolved = await ports.resolveAddress(job.address);
    if (!resolved || !resolved.resolved) {
      await ports.escalate(job.id, "address_unresolved", dispatcher);
      continue;
    }
    const address = resolved.resolved;

    const from = Math.max(t(job.window.from), now);
    const to = t(job.window.to);
    const dur = job.durationMin * MIN;
    if (to - from < dur) {
      await ports.escalate(job.id, "window_impossible", dispatcher);
      continue;
    }

    // 2. The licence rule, read from the record for every code the job needs.
    let eligible = techs.map((x) => x.id);
    for (const code of job.requires ?? []) {
      const rule = await ports.readLicenceRule(code);
      const ok = new Set(
        (rule?.holders ?? []).filter((h) => h.current === true && t(h.expires) > to).map((h) => h.techId),
      );
      eligible = eligible.filter((id) => ok.has(id));
    }
    if (eligible.length === 0) {
      await ports.escalate(job.id, "no_licensed_tech", dispatcher);
      continue;
    }

    // 3. The earliest fit inside the window, travel read between addresses.
    const others = (techId, without = []) =>
      slots.filter((s) => s.techId === techId && s.jobId !== job.id && !without.includes(s.id)).sort((a, b) => t(a.start) - t(b.start));

    const fitOn = async (techId, without = []) => {
      const mine = others(techId, without);
      for (let i = 0; i <= mine.length; i++) {
        const prev = mine[i - 1];
        const next = mine[i];
        let start = from;
        if (prev) start = Math.max(start, t(prev.end) + (await ports.readTravel(prev.address, address)));
        const end = start + dur;
        if (end > to) return null;
        if (next) {
          const reach = end + (await ports.readTravel(address, next.address));
          if (reach > t(next.start)) continue;
        }
        return { techId, start, end };
      }
      return null;
    };

    let best = null;
    for (const techId of eligible) {
      const fit = await fitOn(techId);
      if (fit && (!best || fit.start < best.start)) best = fit;
    }

    // 5. An urgent repair with no free time may take a routine visit's time,
    // but only when the named person on the desk accepts it.
    let displaced = null;
    let acceptedBy = null;
    if (!best && job.urgency === "emergency") {
      for (const techId of eligible) {
        const candidates = others(techId).filter((s) => {
          const j = jobs.find((x) => x.id === s.jobId);
          return j && j.urgency !== "emergency" && t(s.start) < to && t(s.end) > from;
        });
        for (const victim of candidates) {
          const fit = await fitOn(techId, [victim.id]);
          if (!fit) continue;
          const answer = await ports.askDispatcher({ emergencyJobId: job.id, displaceSlotId: victim.id });
          if (answer && answer.accepted === true && answer.person) {
            best = fit;
            displaced = victim;
            acceptedBy = answer.person;
          }
          // One proposal per trade; a refusal is the person's answer.
          break;
        }
        if (best) break;
      }
    }
    if (!best) {
      await ports.escalate(job.id, "no_capacity", dispatcher);
      continue;
    }

    // 4. One slot per job: update the one that exists, create only when none does.
    const written = await ports.writeSlot({
      ...(existing ? { slotId: existing.id } : {}),
      jobId: job.id,
      techId: best.techId,
      start: iso(best.start),
      end: iso(best.end),
      address,
      updatedBy: acceptedBy ? { person: acceptedBy } : { rule: RULE },
    });
    if (!written || !written.externalId) {
      await ports.escalate(job.id, "write_failed", dispatcher);
      continue;
    }
    upsert(slots, written);
    await tell(ports, job, written, address, dispatcher);

    // The routine visit an urgent repair displaced: re-slotted this run, or
    // marked and escalated with the person who accepted it. Never dropped.
    if (displaced) await reslot(ports, jobs, slots, displaced, job.id, acceptedBy, now);
  }
}

function upsert(slots, s) {
  const i = slots.findIndex((x) => x.id === s.id);
  if (i >= 0) slots[i] = { ...s };
  else slots.push({ ...s });
}

/** 6 and 7. The resident told once on a consented channel; the trade told with the record. */
async function tell(ports, job, slot, address, dispatcher) {
  const consent = await ports.checkConsent(job.customerId, CHANNEL);
  if (consent) {
    const msg = await ports.sendSms({
      to: job.customerId,
      channel: CHANNEL,
      slotId: slot.id,
      bodyRef: `${slot.id}:v${slot.jobVersion}`,
      body: `Your repair (job ${job.id}) is booked for ${slot.start} to ${slot.end} at ${address}. Reply if that time does not suit.`,
    });
    if (msg && msg.id) await ports.attachEvidence(slot.id, `message:${msg.id}@${msg.sentAt}`);
  } else {
    // No consent on the channel: a person phones the resident.
    await ports.escalate(job.id, "no_consent", dispatcher);
  }
  await ports.notifyTech(slot.techId, {
    jobId: job.id,
    address,
    window: { ...job.window },
    customerSaid: job.customerSaid,
    body: `Job ${job.id} at ${address}, ${slot.start} to ${slot.end} (resident's window ${job.window.from} to ${job.window.to}). Resident said: "${job.customerSaid}"`,
  });
}

async function reslot(ports, jobs, slots, victim, emergencyId, person, now) {
  const job = jobs.find((j) => j.id === victim.jobId);
  const from = Math.max(t(job.window.from), now);
  const to = t(job.window.to);
  const dur = job.durationMin * MIN;
  const mine = slots.filter((s) => s.techId === victim.techId && s.id !== victim.id).sort((a, b) => t(a.start) - t(b.start));
  let fit = null;
  for (let i = 0; i <= mine.length && !fit; i++) {
    const prev = mine[i - 1];
    const next = mine[i];
    let start = from;
    if (prev) start = Math.max(start, t(prev.end) + (await ports.readTravel(prev.address, victim.address)));
    const end = start + dur;
    if (end > to) break;
    if (next && end + (await ports.readTravel(victim.address, next.address)) > t(next.start)) continue;
    fit = { start, end };
  }
  const written = await ports.writeSlot({
    slotId: victim.id,
    jobId: victim.jobId,
    techId: victim.techId,
    start: fit ? iso(fit.start) : victim.start,
    end: fit ? iso(fit.end) : victim.end,
    address: victim.address,
    updatedBy: { person },
    displacedBy: emergencyId,
  });
  if (!written || !written.externalId) {
    await ports.escalate(victim.jobId, "write_failed", person);
    return;
  }
  upsert(slots, written);
  if (!fit) {
    await ports.escalate(victim.jobId, "displaced", person);
    return;
  }
  await tell(ports, job, written, victim.address, person);
}

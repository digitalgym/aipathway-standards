/**
 * Visit Offer: offer a customer real visit times off the technician's
 * calendar, and book the one they choose as the job's single slot.
 *
 * Built to AIP-BS-DISPATCH-BOARD 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * One run of the board, woken by a job event or a schedule. For every job it
 * reads by id:
 *
 *   1. resolve the address. No resolved address, no offer and no slot.
 *   2. read the licence rule for every code the job needs. Only techs whose
 *      licence is current on the day are offered.
 *   3. work out the real times: inside the customer's window, after the
 *      tech's previous job plus the travel read from its resolved address,
 *      and clear of the next job plus travel. `offerOptions` gives up to
 *      three of them; that is the offer the customer picks from.
 *   4. book the chosen time (the window the customer clicked is the window
 *      on the job): one slot per job, updated in place on a second event,
 *      and a write with no id back is escalated and nothing is sent.
 *   5. tell the customer once, on a channel they consented to, and the tech
 *      once, with the job id, the address, the window and the customer's own
 *      words. No consent: a person is named to phone them.
 *   6. a change to the job (its version moved) moves the slot in place and
 *      tells each party once more. An unchanged job is left alone.
 *
 * An emergency that only a slotted time can meet is proposed to the named
 * dispatcher. Without their acceptance nothing moves. With it, the displaced
 * job is re-slotted in the same run or escalated with the dispatcher as owner.
 * Nothing here can drop a job, and nothing here overrides a licence.
 *
 * Every port call is awaited, so the same file runs against the stub and a
 * live job system.
 */

export const CHANNEL = "email";
export const RULE = "visit-offer:earliest-licensed-fit";
const MIN = 60 * 1000;

const t = (iso) => new Date(iso).getTime();
const iso = (ms) => new Date(ms).toISOString();

/** Techs whose licence is current for every code the job needs, read as a rule. */
async function licensedTechs(ports, job, techs) {
  let ok = new Set(techs.map((x) => x.id));
  for (const code of job.requires) {
    const rule = await ports.readLicenceRule(code);
    const current = new Set(rule.holders.filter((h) => h.current === true).map((h) => h.techId));
    ok = new Set([...ok].filter((id) => current.has(id)));
  }
  return techs.filter((x) => ok.has(x.id));
}

/**
 * Every real start for one tech inside the window, earliest first. A start is
 * real when it clears the previous slot's end plus travel from its address,
 * and the visit plus travel on to the next slot clears that slot's start.
 */
async function startsForTech(ports, { techId, address, window, durationMin, slots, step = 30 }) {
  const mine = slots.filter((s) => s.techId === techId).sort((a, b) => t(a.start) - t(b.start));
  const dur = durationMin * MIN;
  const from = t(window.from);
  const to = t(window.to);
  const out = [];
  // The gaps: before the first slot, between each pair, after the last.
  for (let i = 0; i <= mine.length; i += 1) {
    const prev = mine[i - 1];
    const next = mine[i];
    let earliest = from;
    if (prev) earliest = Math.max(earliest, t(prev.end) + (prev.address ? await ports.readTravel(prev.address, address) : Infinity));
    let latestEnd = to;
    if (next) latestEnd = Math.min(latestEnd, t(next.start) - (next.address ? await ports.readTravel(address, next.address) : Infinity));
    for (let s = earliest; s + dur <= latestEnd; s += step * MIN) out.push(s);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The offer: up to three real visit times across the licensed techs, earliest
 * first, each one a time the board could book as it stands.
 */
export async function offerOptions(ports, { job, address, techs, slots, count = 3 }) {
  const options = [];
  for (const tech of techs) {
    const starts = await startsForTech(ports, { techId: tech.id, address, window: job.window, durationMin: job.durationMin, slots });
    for (const s of starts) options.push({ techId: tech.id, start: iso(s), end: iso(s + job.durationMin * MIN) });
  }
  options.sort((a, b) => t(a.start) - t(b.start));
  // Spread the offer: never two options at the same start.
  const seen = new Set();
  return options.filter((o) => (seen.has(o.start) ? false : (seen.add(o.start), true))).slice(0, count);
}

async function tell(ports, { job, slot, techId, dispatcher, escalated }) {
  const consent = await ports.checkConsent(job.customerId, CHANNEL);
  if (consent) {
    const msg = await ports.sendSms({
      to: job.customerId,
      channel: CHANNEL,
      slotId: slot.id,
      bodyRef: `confirm:${job.id}:v${job.version}:${slot.start}`,
      body: `Your visit for job ${job.id} is booked for ${slot.start} to ${slot.end} at ${slot.address}.`,
    });
    if (msg) await ports.attachEvidence(slot.id, `message:${msg.id}:${msg.sentAt}`);
  } else if (!escalated.has(`${job.id}:no_consent`)) {
    escalated.add(`${job.id}:no_consent`);
    await ports.escalate(job.id, "no_consent", dispatcher);
  }
  await ports.notifyTech(techId, {
    jobId: job.id,
    address: slot.address,
    window: { ...job.window },
    customerSaid: job.customerSaid,
    body: `Job ${job.id} at ${slot.address}, ${slot.start} to ${slot.end} (customer window ${job.window.from} to ${job.window.to}). Customer said: "${job.customerSaid}"`,
  });
}

/**
 * @param {import("@aipathway/conformance").Ports} ports
 */
export async function build(ports) {
  const jobs = await ports.readJobs();
  const board = await ports.readBoard();
  const dispatcher = board.dispatcher;
  const techs = board.techs;
  let slots = board.slots;
  const escalated = new Set();
  const escalate = async (jobId, reason) => {
    if (escalated.has(`${jobId}:${reason}`)) return;
    escalated.add(`${jobId}:${reason}`);
    await ports.escalate(jobId, reason, dispatcher);
  };

  // Routine jobs first in window order; emergencies after, so a displacement
  // is only proposed against a board that is otherwise settled.
  const order = [...jobs]
    .filter((j) => j.status !== "done")
    .sort((a, b) => (a.urgency === b.urgency ? t(a.window.from) - t(b.window.from) : a.urgency === "emergency" ? 1 : -1));

  for (const job of order) {
    const existing = await ports.readSlotForJob(job.id);
    // Unchanged since its slot was written: nothing to do and nothing to say.
    if (existing && existing.externalId && existing.jobVersion === job.version) continue;

    // 1. The address resolves before anything else.
    const where = await ports.resolveAddress(job.address);
    if (!where) {
      await escalate(job.id, "address_unresolved");
      continue;
    }
    const address = where.resolved;

    // 2. The licence is a rule read from the record.
    const licensed = await licensedTechs(ports, job, techs);
    if (licensed.length === 0) {
      await escalate(job.id, "no_licensed_tech");
      continue;
    }

    // A window shorter than the visit cannot be met by anybody.
    if (t(job.window.to) - t(job.window.from) < job.durationMin * MIN) {
      await escalate(job.id, "window_impossible");
      continue;
    }

    // 3. The real times, with this job's own old slot taken off the calendar.
    const others = slots.filter((s) => s.jobId !== job.id);
    const offer = await offerOptions(ports, { job, address, techs: licensed, slots: others });

    if (offer.length === 0) {
      if (job.urgency === "emergency") {
        await displace(ports, { job, address, licensed, slots, dispatcher, escalate, escalated });
        slots = (await ports.readBoard()).slots;
        continue;
      }
      await escalate(job.id, "no_capacity");
      continue;
    }

    // 4. Book the chosen time: the window on the job is the option the
    // customer picked, and the first real time in it is the one written.
    const chosen = offer[0];
    const slot = await ports.writeSlot({
      ...(existing ? { slotId: existing.id } : {}),
      jobId: job.id,
      techId: chosen.techId,
      start: chosen.start,
      end: chosen.end,
      address,
      updatedBy: { rule: RULE },
    });
    if (!slot || !slot.externalId) {
      await escalate(job.id, "write_failed");
      continue;
    }
    slots = [...slots.filter((s) => s.id !== slot.id), slot];

    // 5 and 6. Told once, each of them, for this slot or this change.
    await tell(ports, { job, slot, techId: chosen.techId, dispatcher, escalated });
    // A change that moved the visit to another tech touches the old one too.
    if (existing && existing.techId !== chosen.techId) {
      await ports.notifyTech(existing.techId, {
        jobId: job.id,
        address,
        window: { ...job.window },
        customerSaid: job.customerSaid,
        body: `Job ${job.id} has moved off your run. It is now with another tech.`,
      });
    }
  }
}

/** An emergency only a slotted time can meet. A person decides; nothing is dropped. */
async function displace(ports, { job, address, licensed, slots, dispatcher, escalate, escalated }) {
  const ids = new Set(licensed.map((x) => x.id));
  const dur = job.durationMin * MIN;
  const from = t(job.window.from);
  const to = t(job.window.to);
  // The routine slot whose time the emergency could take.
  const victim = slots
    .filter((s) => ids.has(s.techId) && !s.displacedBy && s.address)
    .filter((s) => Math.max(from, t(s.start)) + dur <= to)
    .sort((a, b) => t(a.start) - t(b.start))[0];
  if (!victim) {
    await escalate(job.id, "no_capacity");
    return;
  }
  const answer = await ports.askDispatcher({ emergencyJobId: job.id, displaceSlotId: victim.id });
  if (!answer || answer.accepted !== true || !answer.person) {
    await escalate(job.id, "no_capacity");
    return;
  }
  const start = Math.max(from, t(victim.start));
  const emergencySlot = await ports.writeSlot({
    jobId: job.id,
    techId: victim.techId,
    start: iso(start),
    end: iso(start + dur),
    address,
    updatedBy: { person: answer.person },
  });
  if (!emergencySlot || !emergencySlot.externalId) {
    await escalate(job.id, "write_failed");
    return;
  }
  await tell(ports, { job, slot: emergencySlot, techId: victim.techId, dispatcher, escalated });

  // The displaced job: re-slotted this run, or escalated with the dispatcher as owner.
  const jobs = await ports.readJobs();
  const moved = jobs.find((j) => j.id === victim.jobId);
  const board = [...slots.filter((s) => s.id !== victim.id), emergencySlot];
  const movedLicensed = moved ? await licensedTechs(ports, moved, (await ports.readBoard()).techs) : [];
  const offer = moved ? await offerOptions(ports, { job: moved, address: victim.address, techs: movedLicensed, slots: board }) : [];
  if (moved && offer.length > 0) {
    const re = await ports.writeSlot({
      slotId: victim.id,
      jobId: moved.id,
      techId: offer[0].techId,
      start: offer[0].start,
      end: offer[0].end,
      address: victim.address,
      updatedBy: { person: answer.person },
      displacedBy: job.id,
    });
    if (re && re.externalId) {
      await tell(ports, { job: moved, slot: re, techId: offer[0].techId, dispatcher, escalated });
      return;
    }
  }
  // Nowhere to put it: it keeps its one slot, marked, and a person owns it.
  await ports.writeSlot({
    slotId: victim.id,
    jobId: victim.jobId,
    techId: victim.techId,
    start: victim.start,
    end: victim.end,
    address: victim.address,
    updatedBy: { person: answer.person },
    displacedBy: job.id,
  });
  await escalate(victim.jobId, "displaced");
}

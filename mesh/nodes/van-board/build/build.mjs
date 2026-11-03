/**
 * Van Board: turns a work order already on the job system into a dispatch
 * package. One slot on a licensed tech at a time that fits, the customer told
 * once on a channel they agreed to, the tech told with the record, and
 * anything it cannot place handed to the dispatcher with a reason.
 *
 * Built to AIP-BS-DISPATCH-BOARD 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * Each run keeps nothing between runs. It reads the jobs and the board, and
 * for each job, in the standard's order:
 *   1. resolve the address (no slot until it resolves)
 *   2. read the licence rule for every code the job needs
 *   3. place the slot inside the window, after the previous job plus travel
 *   4. write one slot per job, updating the existing one, id back or escalate
 *   5. an emergency displaces a slot only after the named dispatcher accepts
 *   6. tell the customer once, only after consent is checked on the channel
 *   7. tell the tech with the job id, resolved address, window and the
 *      customer's own words
 *   8. a changed job (its version moved) updates its slot in place and tells
 *      each party once
 *   9. anything it cannot place is escalated with a reason and an owner
 *  10. the customer message is attached to the slot as evidence, with its time
 *
 * Everything goes through the ports. The live write into ServiceM8, Simpro or
 * Jobber and the live SMS are the scoped build the standard names; this file
 * does not reach for them.
 *
 * `makeBuild(flaws)` exists so the scenarios can be run against deliberately
 * broken builds (see mutants.mjs). The exported `build` has no flaws.
 */

const CHANNEL = "sms";
const MIN = 60 * 1000;

const t = (iso) => new Date(iso).getTime();
const iso = (ms) => new Date(ms).toISOString();

/** Does [aStart, aEnd) overlap [bStart, bEnd)? */
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function makeBuild(flaws = {}) {
  const f = { ...flaws };

  /**
   * Earliest start for a job of `durMs` on `techSlots` (other jobs' slots on
   * that tech), inside `window`, leaving travel either side. Travel is read
   * through the port, never guessed. Returns null when nothing fits.
   */
  async function place(ports, techSlots, address, window, durMs) {
    const from = t(window.from);
    const to = t(window.to);
    const sorted = [...techSlots].sort((a, b) => t(a.start) - t(b.start));
    let start = from;
    for (let guard = 0; guard < sorted.length + 2; guard += 1) {
      let moved = false;
      for (const s of sorted) {
        const travelIn = f.noTravel ? 0 : await ports.readTravel(s.address, address);
        const travelOut = f.noTravel ? 0 : await ports.readTravel(address, s.address);
        const blockStart = t(s.start) - travelOut;
        const blockEnd = t(s.end) + travelIn;
        if (overlaps(start, start + durMs, blockStart, blockEnd)) {
          start = blockEnd;
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (f.ignoreWindow) return { start: iso(start), end: iso(start + durMs) };
    if (start + durMs > to) return null;
    return { start: iso(start), end: iso(start + durMs) };
  }

  /** Techs whose licence record covers every code the job needs, current today. */
  async function licensedTechs(ports, job, techs) {
    let allowed = techs.map((x) => x.id);
    if (f.ignoreLicence) return allowed;
    for (const code of job.requires) {
      const rule = await ports.readLicenceRule(code);
      const current = new Set(rule.holders.filter((h) => h.current === true).map((h) => h.techId));
      allowed = allowed.filter((id) => current.has(id));
    }
    return allowed;
  }

  async function escalate(ports, jobId, reason, owner) {
    if (f.noEscalate) return;
    await ports.escalate(jobId, reason, owner);
  }

  /** Tell the customer once for this slot, after consent is checked. */
  async function tellCustomer(ports, job, slot, owner, reason) {
    if (f.noCustomerMessage) return;
    const consent = f.ignoreConsent ? { channel: CHANNEL } : await ports.checkConsent(job.customerId, CHANNEL);
    if (!consent) {
      // Named to a person to phone. Nothing is sent.
      await escalate(ports, job.id, "no_consent", owner);
      return;
    }
    const sends = f.doubleSend ? 2 : 1;
    for (let i = 0; i < sends; i += 1) {
      const msg = await ports.sendSms({
        to: job.customerId,
        channel: CHANNEL,
        slotId: slot.id,
        bodyRef: `${job.id}:v${job.version}:${reason}`,
        body: `Your job ${job.id} is booked for ${slot.start} to ${slot.end} at ${slot.address}.`,
      });
      if (msg && !f.noEvidence) await ports.attachEvidence(slot.id, `message:${msg.id}@${msg.sentAt}`);
    }
  }

  /** Tell the tech with the record, never a bare "new job". */
  async function tellTech(ports, techId, job, slot) {
    if (f.noTechNotice) return;
    if (f.bareNotice) {
      await ports.notifyTech(techId, { body: "You have a new job." });
      return;
    }
    await ports.notifyTech(techId, {
      jobId: job.id,
      address: slot.address,
      window: { ...job.window },
      customerSaid: job.customerSaid,
      body: `Job ${job.id} at ${slot.address}, ${slot.start} to ${slot.end} (window ${job.window.from} to ${job.window.to}). Customer said: "${job.customerSaid}"`,
    });
  }

  /** Write the slot, updating in place when one exists. Null or no id is a failed write. */
  async function write(ports, existing, input) {
    const slotId = f.alwaysCreate ? undefined : existing?.id;
    const out = await ports.writeSlot(slotId ? { ...input, slotId } : input);
    if (!out || !out.externalId) return f.trustNullWrite ? { ...input, id: existing?.id ?? "unknown", externalId: null } : null;
    return out;
  }

  return async function build(ports) {
    const jobs = await ports.readJobs();
    const board = await ports.readBoard();
    const owner = board.dispatcher;
    // The working picture of the board for this run, kept current as we write.
    const slots = board.slots.map((s) => ({ ...s }));
    const upsert = (s) => {
      const i = slots.findIndex((x) => x.id === s.id);
      if (i >= 0) slots[i] = { ...s };
      else slots.push({ ...s });
    };

    // Routine jobs in window order, then emergencies, so an emergency sees
    // the board as it stands and proposes a displacement only when it must.
    const order = [...jobs]
      .filter((j) => j.status !== "done")
      .sort((a, b) => (a.urgency === b.urgency ? t(a.window.from) - t(b.window.from) : a.urgency === "emergency" ? 1 : -1));

    for (const job of order) {
      const existing = f.alwaysCreate ? null : await ports.readSlotForJob(job.id);
      // Nothing changed since the slot was written: do nothing, tell nobody.
      if (existing && existing.externalId && f.ignoreChange) continue;
      if (existing && existing.externalId && existing.jobVersion === job.version && !f.ignoreVersion) continue;

      // 1. The address resolves before anything else.
      let address = null;
      if (f.skipResolve) {
        address = job.address;
      } else {
        const r = await ports.resolveAddress(job.address);
        if (!r) {
          await escalate(ports, job.id, "address_unresolved", owner);
          continue;
        }
        address = r.resolved;
      }

      const durMs = job.durationMin * MIN;
      if (t(job.window.to) - t(job.window.from) < durMs && !f.ignoreWindow) {
        await escalate(ports, job.id, "window_impossible", owner);
        continue;
      }

      // 2. The licence rule, read before any assignment.
      const allowed = await licensedTechs(ports, job, board.techs);
      if (allowed.length === 0) {
        await escalate(ports, job.id, "no_licensed_tech", owner);
        continue;
      }

      // 3. Place it. Prefer the tech already on it, so a change moves the
      // time rather than the person where it can.
      const candidates = existing ? [existing.techId, ...allowed.filter((x) => x !== existing.techId)].filter((x) => allowed.includes(x)) : allowed;
      let placed = null;
      for (const techId of candidates) {
        const others = slots.filter((s) => s.techId === techId && s.jobId !== job.id);
        const at = await place(ports, others, address, job.window, durMs);
        if (at) {
          placed = { techId, ...at };
          break;
        }
      }

      let acceptedBy = null;
      let displaced = null;
      if (!placed && job.urgency === "emergency") {
        // 5. Propose a displacement; a named dispatcher decides.
        for (const techId of allowed) {
          const theirs = slots.filter((s) => s.techId === techId && s.jobId !== job.id && !s.displacedBy);
          for (const victim of theirs) {
            const victimJob = jobs.find((j) => j.id === victim.jobId);
            if (!victimJob || victimJob.urgency === "emergency") continue;
            const at = await place(ports, theirs.filter((s) => s.id !== victim.id), address, job.window, durMs);
            if (!at) continue;
            if (f.noGate) {
              acceptedBy = "rule";
            } else {
              const answer = await ports.askDispatcher({ emergencyJobId: job.id, displaceSlotId: victim.id });
              if (!answer || answer.accepted !== true || !answer.person) continue;
              acceptedBy = answer.person;
            }
            placed = { techId, ...at };
            displaced = { slot: victim, job: victimJob };
            break;
          }
          if (placed) break;
        }
      }

      if (!placed) {
        await escalate(ports, job.id, "no_capacity", owner);
        continue;
      }

      // 4. One slot per job, id back.
      const updatedBy = acceptedBy && acceptedBy !== "rule" ? { person: acceptedBy } : { rule: "van-board:licence+window+travel" };
      const written = await write(ports, existing, { jobId: job.id, techId: placed.techId, start: placed.start, end: placed.end, address, updatedBy });
      if (!written) {
        await escalate(ports, job.id, "write_failed", owner);
        continue;
      }
      upsert(written);

      const reason = existing ? "changed" : "booked";
      await tellCustomer(ports, job, written, owner, reason);
      await tellTech(ports, written.techId, job, written);
      if (existing && existing.techId !== written.techId && !f.noTechNotice) {
        await ports.notifyTech(existing.techId, { jobId: job.id, address: existing.address, window: { ...job.window }, customerSaid: job.customerSaid, body: `Job ${job.id} has moved to another tech. You are no longer on it.` });
      }

      // The displaced job: re-slotted this run, or escalated. Never dropped.
      if (displaced && !f.dropDisplaced) {
        const vSlot = displaced.slot;
        const vJob = displaced.job;
        const vDur = vJob.durationMin * MIN;
        let moved = null;
        const vAllowed = await licensedTechs(ports, vJob, board.techs);
        for (const techId of [vSlot.techId, ...vAllowed.filter((x) => x !== vSlot.techId)].filter((x) => vAllowed.includes(x))) {
          const others = slots.filter((s) => s.techId === techId && s.jobId !== vJob.id);
          const at = await place(ports, others, vSlot.address, vJob.window, vDur);
          if (at) {
            moved = { techId, ...at };
            break;
          }
        }
        const target = moved ?? { techId: vSlot.techId, start: vSlot.start, end: vSlot.end };
        const vWritten = await ports.writeSlot({
          slotId: vSlot.id,
          jobId: vJob.id,
          techId: target.techId,
          start: target.start,
          end: target.end,
          address: vSlot.address,
          updatedBy: { person: acceptedBy },
          displacedBy: job.id,
        });
        if (!vWritten || !vWritten.externalId) {
          await escalate(ports, vJob.id, "write_failed", owner);
        } else {
          upsert(vWritten);
          if (moved) {
            await tellCustomer(ports, vJob, vWritten, owner, "displaced");
            await tellTech(ports, vWritten.techId, vJob, vWritten);
          } else {
            // Still on the board, marked, and a person owns what happens next.
            await escalate(ports, vJob.id, "displaced", acceptedBy && acceptedBy !== "rule" ? acceptedBy : owner);
          }
        }
      }
    }
  };
}

/**
 * @param {import("@aipathway/conformance").DispatchPorts} ports
 */
export const build = makeBuild();

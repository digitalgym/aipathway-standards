/**
 * Visit Round: each period, put the next visit of every recurring maintenance
 * contract on a licensed tech's calendar, inside the customer's window, and
 * hand a person every visit it should not or cannot book.
 *
 * Built to AIP-BS-DISPATCH-BOARD 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * The visit itself is a job the job system already holds (ServiceM8 and
 * Simpro raise the next visit of a recurring job on their own). What nobody
 * does is give it a time on a tech who can legally do it. Each visit job
 * carries its contract on the record: `contract.id`, `contract.endsOn` and
 * `contract.owner`, the person who looks after renewals.
 *
 * One run, woken by schedule.tick, keeping nothing between runs:
 *   0. A visit whose contract has lapsed is not booked. It goes to the
 *      contract owner. Renewing a contract is a person's call, never the
 *      board's. (This gate is the bot's own, ahead of the standard.)
 *   1. The address resolves, or no slot.
 *   2. The licence rule is read for every code the visit needs.
 *   3. The slot sits in the window, after the tech's previous job plus the
 *      travel read from the travel port.
 *   4. One slot per visit, written against the existing slot when there is
 *      one; no id back is a failed write, escalated, nothing sent.
 *   5. An emergency on the board takes a visit's time only when the named
 *      dispatcher accepts; the visit moved off is re-booked or escalated.
 *   6. The customer is told once, after consent on the channel is checked.
 *   7. The tech is told with the job id, address, window and the customer's
 *      own words.
 *   8. A visit whose job version moved is re-booked in place, each party
 *      told once.
 *   9. Everything it cannot book is escalated with a reason and an owner.
 *  10. The customer message is attached to the slot with its sent time.
 *
 * Every write and send goes through the ports. The live slot write and the
 * live SMS are the scoped build the standard names and are not written here.
 *
 * `makeBuild(flaws)` lets mutants.mjs run deliberately broken builds against
 * the scenarios. The exported `build` has no flaws.
 */

const CHANNEL = "sms";
const MINUTE = 60_000;
const RULE = "visit-round:contract+licence+window+travel";

const ms = (iso) => new Date(iso).getTime();
const iso = (n) => new Date(n).toISOString();

function contractLapsed(job) {
  const c = job.contract;
  if (!c) return false;
  if (c.status === "lapsed" || c.status === "cancelled") return true;
  return typeof c.endsOn === "string" && ms(c.endsOn) < ms(job.window.from);
}

export function makeBuild(flaws = {}) {
  const f = { ...flaws };

  async function raise(ports, jobId, reason, owner) {
    if (f.silent) return;
    await ports.escalate(jobId, reason, owner);
  }

  /** Codes the job needs, filtered to techs whose licence is current today. */
  async function whoMayGo(ports, job, techs) {
    if (f.skipLicence) return techs.map((x) => x.id);
    const ok = new Map(techs.map((x) => [x.id, true]));
    for (const code of job.requires) {
      const rule = await ports.readLicenceRule(code);
      const current = new Set(rule.holders.filter((h) => h.current === true).map((h) => h.techId));
      for (const id of ok.keys()) if (!current.has(id)) ok.set(id, false);
    }
    return [...ok].filter(([, v]) => v).map(([id]) => id);
  }

  /**
   * Earliest start on one tech's day. Candidate starts are the window's
   * opening and the end of each booked job plus travel read from it. A
   * candidate stands when it clears every booked job with travel both ways.
   */
  async function earliest(ports, booked, address, win, durMs) {
    const open = ms(win.from);
    const close = ms(win.to);
    const travel = async (a, b) => (f.noTravel ? 0 : await ports.readTravel(a, b));
    const starts = [open];
    for (const s of booked) starts.push(ms(s.end) + (await travel(s.address, address)));
    starts.sort((a, b) => a - b);
    for (const start of starts) {
      if (start < open && !f.ignoreWindow) continue;
      const end = start + durMs;
      if (end > close && !f.ignoreWindow) continue;
      let clear = true;
      for (const s of booked) {
        const before = ms(s.end) + (await travel(s.address, address));
        const after = ms(s.start) - (await travel(address, s.address));
        if (!(start >= before || end <= after)) {
          clear = false;
          break;
        }
      }
      if (clear) return { start: iso(start), end: iso(end) };
    }
    return null;
  }

  async function confirm(ports, job, slot, owner, why) {
    if (f.noConfirm) return;
    const consent = f.skipConsent ? { channel: CHANNEL } : await ports.checkConsent(job.customerId, CHANNEL);
    if (!consent) {
      await raise(ports, job.id, "no_consent", owner);
      return;
    }
    const n = f.sendTwice ? 2 : 1;
    for (let i = 0; i < n; i += 1) {
      const msg = await ports.sendSms({
        to: job.customerId,
        channel: CHANNEL,
        slotId: slot.id,
        bodyRef: `${job.id}#v${job.version}:${why}`,
        body: `Your maintenance visit (${job.id}) is booked for ${slot.start} to ${slot.end} at ${slot.address}. Reply to change it.`,
      });
      if (msg && !f.noEvidence) await ports.attachEvidence(slot.id, `sms:${msg.id}:${msg.sentAt}`);
    }
  }

  async function brief(ports, techId, job, slot) {
    if (f.noBrief) return;
    if (f.bareBrief) {
      await ports.notifyTech(techId, { body: "New visit booked." });
      return;
    }
    await ports.notifyTech(techId, {
      jobId: job.id,
      address: slot.address,
      window: { from: job.window.from, to: job.window.to },
      customerSaid: job.customerSaid,
      body: `Visit ${job.id}${job.contract ? ` (contract ${job.contract.id})` : ""}: ${slot.address}, ${slot.start} to ${slot.end}, customer window ${job.window.from} to ${job.window.to}. Customer said: "${job.customerSaid}"`,
    });
  }

  async function put(ports, existing, input) {
    const slotId = f.alwaysNew ? undefined : existing?.id;
    const out = await ports.writeSlot(slotId ? { ...input, slotId } : input);
    if (out && out.externalId) return out;
    return f.trustNoId ? { ...input, id: existing?.id ?? "pending", externalId: null } : null;
  }

  return async function build(ports) {
    const jobs = await ports.readJobs();
    const board = await ports.readBoard();
    const dispatcher = board.dispatcher;
    const live = board.slots.map((s) => ({ ...s }));
    const keep = (s) => {
      const i = live.findIndex((x) => x.id === s.id);
      if (i >= 0) live[i] = { ...s };
      else live.push({ ...s });
    };
    const bookedOn = (techId, notJob) => live.filter((s) => s.techId === techId && s.jobId !== notJob);

    // Contract visits first, earliest window first; emergencies last so they
    // see the round as booked and propose a displacement only when they must.
    const queue = jobs
      .filter((j) => j.status !== "done")
      .sort((a, b) => {
        if (a.urgency !== b.urgency) return a.urgency === "emergency" ? 1 : -1;
        return ms(a.window.from) - ms(b.window.from);
      });

    for (const job of queue) {
      const existing = f.alwaysNew ? null : await ports.readSlotForJob(job.id);
      const unchanged = existing && existing.externalId && (f.ignoreChange || (existing.jobVersion === job.version && !f.ignoreVersion));
      if (unchanged) continue;

      // 0. A lapsed contract gets no visit. Its owner decides.
      if (!existing && !f.bookLapsed && contractLapsed(job)) {
        await raise(ports, job.id, "contract_lapsed", job.contract.owner ?? dispatcher);
        continue;
      }

      // 1. Address.
      let address;
      if (f.skipResolve) {
        address = job.address;
      } else {
        const hit = await ports.resolveAddress(job.address);
        if (!hit) {
          await raise(ports, job.id, "address_unresolved", dispatcher);
          continue;
        }
        address = hit.resolved;
      }

      const durMs = job.durationMin * MINUTE;
      if (!f.ignoreWindow && ms(job.window.to) - ms(job.window.from) < durMs) {
        await raise(ports, job.id, "window_impossible", dispatcher);
        continue;
      }

      // 2. Licence.
      const allowed = await whoMayGo(ports, job, board.techs);
      if (allowed.length === 0) {
        await raise(ports, job.id, "no_licensed_tech", dispatcher);
        continue;
      }

      // 3. Place. Keep the same tech on a re-book where that tech still fits.
      const order = existing && allowed.includes(existing.techId) ? [existing.techId, ...allowed.filter((x) => x !== existing.techId)] : allowed;
      let spot = null;
      for (const techId of order) {
        const at = await earliest(ports, bookedOn(techId, job.id), address, job.window, durMs);
        if (at) {
          spot = { techId, ...at };
          break;
        }
      }

      // 5. An emergency with no free tech may propose one displacement.
      let acceptedBy = null;
      let moveOff = null;
      if (!spot && job.urgency === "emergency") {
        search: for (const techId of allowed) {
          const theirs = bookedOn(techId, job.id).filter((s) => !s.displacedBy);
          for (const victim of theirs) {
            const vJob = jobs.find((j) => j.id === victim.jobId);
            if (!vJob || vJob.urgency === "emergency") continue;
            const at = await earliest(ports, theirs.filter((s) => s.id !== victim.id), address, job.window, durMs);
            if (!at) continue;
            if (f.noGate) {
              acceptedBy = "rule";
            } else {
              const answer = await ports.askDispatcher({ emergencyJobId: job.id, displaceSlotId: victim.id });
              if (!answer || answer.accepted !== true || typeof answer.person !== "string" || !answer.person) continue;
              acceptedBy = answer.person;
            }
            spot = { techId, ...at };
            moveOff = { slot: victim, job: vJob };
            break search;
          }
        }
      }

      // 9. No tech free in the window.
      if (!spot) {
        await raise(ports, job.id, "no_capacity", dispatcher);
        continue;
      }

      // 4. One slot, id back.
      const by = acceptedBy && acceptedBy !== "rule" ? { person: acceptedBy } : { rule: RULE };
      const slot = await put(ports, existing, { jobId: job.id, techId: spot.techId, start: spot.start, end: spot.end, address, updatedBy: by });
      if (!slot) {
        await raise(ports, job.id, "write_failed", dispatcher);
        continue;
      }
      keep(slot);

      // 6, 7, 8.
      await confirm(ports, job, slot, dispatcher, existing ? "moved" : "booked");
      await brief(ports, slot.techId, job, slot);
      if (existing && existing.techId !== slot.techId && !f.noBrief) {
        await ports.notifyTech(existing.techId, {
          jobId: job.id,
          address: existing.address,
          window: { from: job.window.from, to: job.window.to },
          customerSaid: job.customerSaid,
          body: `Visit ${job.id} has gone to another tech. Take it off your day.`,
        });
      }

      // 5, continued. The visit moved off is re-booked now or escalated; it is
      // never taken off the board.
      if (moveOff && !f.dropMoved) {
        const v = moveOff.job;
        const vs = moveOff.slot;
        const vAllowed = await whoMayGo(ports, v, board.techs);
        const vOrder = vAllowed.includes(vs.techId) ? [vs.techId, ...vAllowed.filter((x) => x !== vs.techId)] : vAllowed;
        let again = null;
        for (const techId of vOrder) {
          const at = await earliest(ports, bookedOn(techId, v.id), vs.address, v.window, v.durationMin * MINUTE);
          if (at) {
            again = { techId, ...at };
            break;
          }
        }
        const target = again ?? { techId: vs.techId, start: vs.start, end: vs.end };
        const moved = await ports.writeSlot({
          slotId: vs.id,
          jobId: v.id,
          techId: target.techId,
          start: target.start,
          end: target.end,
          address: vs.address,
          updatedBy: { person: acceptedBy },
          displacedBy: job.id,
        });
        if (!moved || !moved.externalId) {
          await raise(ports, v.id, "write_failed", dispatcher);
        } else {
          keep(moved);
          if (again) {
            await confirm(ports, v, moved, dispatcher, "displaced");
            await brief(ports, moved.techId, v, moved);
          } else {
            await raise(ports, v.id, "displaced", acceptedBy && acceptedBy !== "rule" ? acceptedBy : dispatcher);
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

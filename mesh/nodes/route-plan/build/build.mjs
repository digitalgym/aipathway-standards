/**
 * Route Plan: each morning, and whenever a job lands or changes, it proposes
 * the order of each tech's jobs for the day, and which licensed tech takes
 * each recurring visit, so the vans drive less. The dispatcher accepts the
 * plan, line by line. Only an accepted line becomes a slot on the job, and
 * only then are the customer and the tech told.
 *
 * Built to AIP-BS-DISPATCH-BOARD 2026-10-03, AI Pathway,
 * https://aipathway.com.au/explore-ai/dispatch-board-build-standard
 *
 * How the plan is made, in the standard's order, for every new or changed job:
 *   1. resolve the address; no line is proposed on an address that will not
 *      resolve, it goes to the dispatcher instead
 *   2. read the licence rule for every code the job needs; only techs whose
 *      licence record is current are candidates
 *   3. try the job at every position in every candidate tech's run for the
 *      day, read the travel between neighbours through the port, keep every
 *      stop inside its window, and take the position that adds the least
 *      travel. A recurring visit breaks a tie towards the tech who did it last
 *   4. lines already accepted and unchanged are fixed: the plan fits around
 *      them and never reshuffles a slot a customer has been told about
 *   5. an emergency that fits nowhere proposes one displacement, which a
 *      named dispatcher accepts through the gate, and the displaced job is
 *      re-planned in the same run or escalated. Never dropped
 *
 * Then the dispatcher's release (`acceptPlan`) decides which lines go ahead.
 * For each accepted line: one slot per job, updated in place, id back or
 * escalated; the customer told once after consent is checked; the tech told
 * with the job, the resolved address, the window and the customer's words;
 * the message attached to the slot. A declined line stays proposed for the
 * next run and nothing is sent.
 *
 * Everything outside goes through the ports. The live write into ServiceM8,
 * Simpro or Jobber and the live SMS are the scoped build the standard names;
 * this file does not reach for them.
 *
 * `makeBuild(flaws)` exists so the scenarios can be run against deliberately
 * broken builds (see mutants.mjs). The exported `build` has no flaws.
 */

const CHANNEL = "sms";
const MIN = 60 * 1000;
const RULE = "route-plan:licence+window+least-travel";

const t = (iso) => new Date(iso).getTime();
const iso = (ms) => new Date(ms).toISOString();

export function makeBuild(flaws = {}) {
  const f = { ...flaws };

  /**
   * @param {import("@aipathway/conformance").DispatchPorts} ports
   * @param {{ acceptPlan?: (plan: { dispatcher: string, lines: object[] }) => Promise<{ person: string, accepted: string[] } | null> | { person: string, accepted: string[] } | null }} [opts]
   */
  return async function build(ports, opts = {}) {
    const jobs = await ports.readJobs();
    const board = await ports.readBoard();
    const owner = board.dispatcher;
    const techs = board.techs;

    // Travel is read through the port, once per pair per run.
    const travelCache = new Map();
    async function travel(from, to) {
      if (f.noTravel) return 0;
      const key = `${from}>${to}`;
      if (!travelCache.has(key)) travelCache.set(key, await ports.readTravel(from, to));
      return travelCache.get(key);
    }

    const escalated = new Set();
    async function escalate(jobId, reason, who = owner) {
      if (f.noEscalate) return;
      const key = `${jobId}:${reason}`;
      if (escalated.has(key)) return;
      escalated.add(key);
      await ports.escalate(jobId, reason, who);
    }

    /**
     * Walk a run in order and give each stop its time. A fixed stop keeps the
     * time the customer was told; a flexible stop starts at the later of its
     * window opening and the previous stop's end plus travel. Returns the
     * timed run and its travel, or null when any stop misses its window.
     */
    async function simulate(run) {
      let prev = null;
      let cost = 0;
      const timed = [];
      for (const stop of run) {
        const leg = prev ? await travel(prev.address, stop.address) : 0;
        cost += leg;
        const earliest = prev ? t(prev.end) + leg : -Infinity;
        let start;
        let end;
        if (stop.fixed) {
          if (earliest > t(stop.fixed.start)) return null;
          start = t(stop.fixed.start);
          end = t(stop.fixed.end);
        } else {
          start = Math.max(t(stop.window.from), earliest);
          end = start + stop.durMs;
          if (!f.ignoreWindow && end > t(stop.window.to)) return null;
        }
        const timedStop = { ...stop, start: iso(start), end: iso(end) };
        timed.push(timedStop);
        prev = timedStop;
      }
      return { timed, cost };
    }

    /** Cheapest position for `stop` across the candidate techs' runs. */
    async function bestInsertion(stop, candidates, runs, prefer) {
      let best = null;
      for (const techId of candidates) {
        const run = runs.get(techId) ?? [];
        const base = await simulate(run);
        const baseCost = base ? base.cost : 0;
        const positions = f.noRouteOrder ? [run.length] : [...Array(run.length + 1).keys()];
        for (const pos of positions) {
          const trial = [...run.slice(0, pos), stop, ...run.slice(pos)];
          const sim = await simulate(trial);
          if (!sim) continue;
          const added = sim.cost - baseCost;
          const rank = prefer.indexOf(techId) >= 0 ? prefer.indexOf(techId) : prefer.length;
          if (!best || added < best.added || (added === best.added && rank < best.rank)) {
            best = { techId, pos, added, rank, sim };
          }
        }
      }
      return best;
    }

    /** Techs whose licence record covers every code the job needs, current today. */
    async function licensedTechs(job) {
      let allowed = techs.map((x) => x.id);
      if (f.ignoreLicence) return allowed;
      for (const code of job.requires) {
        const rule = await ports.readLicenceRule(code);
        const current = new Set(rule.holders.filter((h) => h.current === true).map((h) => h.techId));
        allowed = allowed.filter((id) => current.has(id));
      }
      return allowed;
    }

    // The day as it stands: accepted, unchanged lines are fixed stops.
    const runs = new Map(techs.map((x) => [x.id, []]));
    const existingByJob = new Map();
    const toPlan = [];
    for (const job of jobs) {
      if (job.status === "done") continue;
      const existing = f.alwaysCreate ? null : await ports.readSlotForJob(job.id);
      if (existing) existingByJob.set(job.id, existing);
      const unchanged = existing && existing.externalId && (f.ignoreChange || (existing.jobVersion === job.version && !f.ignoreVersion));
      if (unchanged) {
        runs.get(existing.techId)?.push({ jobId: job.id, slotId: existing.id, address: existing.address, fixed: { start: existing.start, end: existing.end }, window: job.window, durMs: t(existing.end) - t(existing.start) });
      } else {
        toPlan.push(job);
      }
    }
    for (const run of runs.values()) run.sort((a, b) => t(a.fixed.start) - t(b.fixed.start));

    // Tightest windows first, so the stops with the least room are placed
    // before the easy ones; emergencies last, against the board as it stands.
    const slack = (j) => t(j.window.to) - t(j.window.from) - j.durationMin * MIN;
    toPlan.sort((a, b) => (a.urgency === b.urgency ? slack(a) - slack(b) || (a.id < b.id ? -1 : 1) : a.urgency === "emergency" ? 1 : -1));

    const lines = [];
    const displacements = [];

    for (const job of toPlan) {
      // 1. The address resolves before anything else.
      let address;
      if (f.skipResolve) {
        address = job.address;
      } else {
        const r = await ports.resolveAddress(job.address);
        if (!r) {
          await escalate(job.id, "address_unresolved");
          continue;
        }
        address = r.resolved;
      }
      const durMs = job.durationMin * MIN;
      if (!f.ignoreWindow && t(job.window.to) - t(job.window.from) < durMs) {
        await escalate(job.id, "window_impossible");
        continue;
      }

      // 2. The licence rule, read before any assignment.
      const allowed = await licensedTechs(job);
      if (allowed.length === 0) {
        await escalate(job.id, "no_licensed_tech");
        continue;
      }

      // 3. Least added travel. Ties go to the tech already on the job, then
      // to the tech who did this recurring visit last.
      const existing = existingByJob.get(job.id) ?? null;
      const prefer = [existing?.techId, job.recurring?.lastTechId].filter(Boolean);
      const stop = { jobId: job.id, address, window: job.window, durMs };
      let best = await bestInsertion(stop, allowed, runs, prefer);

      // 5. An emergency that fits nowhere proposes one displacement.
      let displacement = null;
      if (!best && job.urgency === "emergency") {
        for (const techId of allowed) {
          const run = runs.get(techId) ?? [];
          for (const victim of run) {
            const victimJob = jobs.find((j) => j.id === victim.jobId);
            if (!victimJob || victimJob.urgency === "emergency" || !victim.fixed) continue;
            const without = new Map(runs);
            without.set(techId, run.filter((s) => s !== victim));
            const trial = await bestInsertion(stop, [techId], without, []);
            if (!trial) continue;
            best = trial;
            displacement = { techId, victim, victimJob, runWithout: without.get(techId) };
            break;
          }
          if (displacement) break;
        }
      }

      if (!best) {
        await escalate(job.id, "no_capacity");
        continue;
      }

      if (displacement) {
        displacements.push({ job, address, existing, best, ...displacement });
        // The emergency's stop goes in only once a person accepts, below.
        continue;
      }

      const run = runs.get(best.techId);
      run.splice(best.pos, 0, stop);
      lines.push({ job, address, existing, techId: best.techId, addedTravelMs: best.added });
    }

    // Each line's time, read off its tech's run once every stop is in.
    const timeOf = async (techId, jobId) => {
      const sim = await simulate(runs.get(techId));
      const s = sim?.timed.find((x) => x.jobId === jobId);
      return s ? { start: s.start, end: s.end } : null;
    };

    /** Write the slot, updating in place when one exists. No id back is a failed write. */
    async function write(existing, input) {
      const slotId = f.alwaysCreate ? undefined : existing?.id;
      const out = await ports.writeSlot(slotId ? { ...input, slotId } : input);
      if (!out || !out.externalId) return f.trustNullWrite ? { ...input, id: existing?.id ?? "unknown", externalId: null } : null;
      return out;
    }

    async function tellCustomer(job, slot, reason) {
      if (f.noCustomerMessage) return;
      const consent = f.ignoreConsent ? { channel: CHANNEL } : await ports.checkConsent(job.customerId, CHANNEL);
      if (!consent) {
        // Named to a person to phone. Nothing is sent.
        await escalate(job.id, "no_consent");
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

    async function tellTech(job, slot, stopNo) {
      if (f.noTechNotice) return;
      if (f.bareNotice) {
        await ports.notifyTech(slot.techId, { body: "You have a new job." });
        return;
      }
      await ports.notifyTech(slot.techId, {
        jobId: job.id,
        address: slot.address,
        window: { ...job.window },
        customerSaid: job.customerSaid,
        body: `Stop ${stopNo}: job ${job.id} at ${slot.address}, ${slot.start} to ${slot.end} (window ${job.window.from} to ${job.window.to}). Customer said: "${job.customerSaid}"`,
      });
    }

    async function commit(line, time, updatedBy, extra = {}) {
      const written = await write(line.existing, { jobId: line.job.id, techId: line.techId, start: time.start, end: time.end, address: line.address, updatedBy, ...extra });
      if (!written) {
        await escalate(line.job.id, "write_failed");
        return null;
      }
      const stopNo = (runs.get(written.techId) ?? []).findIndex((s) => s.jobId === line.job.id) + 1;
      await tellCustomer(line.job, written, line.existing ? "changed" : "booked");
      await tellTech(line.job, written, stopNo);
      if (line.existing && line.existing.techId !== written.techId && !f.noTechNotice) {
        await ports.notifyTech(line.existing.techId, { jobId: line.job.id, address: line.existing.address, window: { ...line.job.window }, customerSaid: line.job.customerSaid, body: `Job ${line.job.id} has moved to another tech. You are no longer on it.` });
      }
      return written;
    }

    // Emergencies first: the named dispatcher accepts each displacement.
    for (const d of displacements) {
      let person = null;
      if (f.noGate) {
        person = null;
      } else {
        const answer = await ports.askDispatcher({ emergencyJobId: d.job.id, displaceSlotId: d.victim.slotId });
        if (!answer || answer.accepted !== true || !answer.person) {
          await escalate(d.job.id, "no_capacity");
          continue;
        }
        person = answer.person;
      }
      const victimSlot = await ports.readSlotForJob(d.victim.jobId);
      runs.set(d.techId, d.runWithout);
      runs.get(d.techId).splice(d.best.pos, 0, { jobId: d.job.id, address: d.address, window: d.job.window, durMs: d.job.durationMin * MIN });
      const eTime = await timeOf(d.techId, d.job.id);
      const by = person ? { person } : { rule: RULE };
      const eWritten = eTime ? await commit({ job: d.job, address: d.address, existing: d.existing, techId: d.techId }, eTime, by) : null;
      if (!eWritten || f.dropDisplaced || !victimSlot) continue;
      // Lock the emergency in, then re-plan the displaced job this run.
      const eStop = runs.get(d.techId).find((s) => s.jobId === d.job.id);
      eStop.fixed = { start: eWritten.start, end: eWritten.end };
      const vJob = d.victimJob;
      const vDur = vJob.durationMin * MIN;
      const vAllowed = await licensedTechs(vJob);
      const vStop = { jobId: vJob.id, address: victimSlot.address, window: vJob.window, durMs: vDur };
      const vBest = await bestInsertion(vStop, vAllowed, runs, [victimSlot.techId]);
      if (vBest) {
        runs.get(vBest.techId).splice(vBest.pos, 0, vStop);
        const vTime = await timeOf(vBest.techId, vJob.id);
        await commit({ job: vJob, address: victimSlot.address, existing: victimSlot, techId: vBest.techId }, vTime, by, { displacedBy: d.job.id });
      } else {
        // Still on the board, marked, and the accepting dispatcher owns it.
        const kept = await ports.writeSlot({ slotId: victimSlot.id, jobId: vJob.id, techId: victimSlot.techId, start: victimSlot.start, end: victimSlot.end, address: victimSlot.address, updatedBy: by, displacedBy: d.job.id });
        if (!kept || !kept.externalId) await escalate(vJob.id, "write_failed");
        else await escalate(vJob.id, "displaced", person ?? owner);
      }
    }

    // The proposal the dispatcher sees: every routine line, its tech, its
    // stop number, its time and the travel it adds.
    const proposal = [];
    for (const line of lines) {
      const time = await timeOf(line.techId, line.job.id);
      if (!time) continue;
      const stopNo = (runs.get(line.techId) ?? []).findIndex((s) => s.jobId === line.job.id) + 1;
      proposal.push({ ...line, time, stopNo });
    }
    if (proposal.length === 0) return { lines: [] };

    // The dispatcher's release. No release, nothing is written or sent.
    let release = null;
    if (f.writeBeforeAccept) {
      release = { person: null, accepted: proposal.map((p) => p.job.id) };
    } else if (typeof opts.acceptPlan === "function") {
      release = await opts.acceptPlan({
        dispatcher: owner,
        lines: proposal.map((p) => ({ jobId: p.job.id, techId: p.techId, stop: p.stopNo, start: p.time.start, end: p.time.end, address: p.address, addedTravelMin: Math.round(p.addedTravelMs / MIN), recurring: Boolean(p.job.recurring) })),
      });
    }
    const accepted = new Set(release && Array.isArray(release.accepted) ? release.accepted : []);
    const releasedBy = release && typeof release.person === "string" && release.person.length > 0 ? release.person : null;

    for (const p of proposal) {
      if (!accepted.has(p.job.id)) continue; // stays proposed for the next run
      const by = releasedBy ? { person: releasedBy, rule: RULE } : { rule: RULE };
      await commit(p, p.time, by);
    }
    return { lines: proposal.map((p) => ({ jobId: p.job.id, techId: p.techId, stop: p.stopNo, accepted: accepted.has(p.job.id) })) };
  };
}

export const build = makeBuild();

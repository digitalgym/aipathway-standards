/**
 * The stub world for Day Desk: a job system, a roster, a task desk, a phone
 * line and a text gateway, all owned by the runner and all recorded.
 *
 * The package ships no Client Desk world, so this one is written to the
 * standard's own record shapes (section 2): Job, New job, Roster, Callback and
 * Update. Every port records itself on `calls` through the package's
 * PORT_SHAPE, so the envelope is the same shape as any other run.
 *
 * Runner side only (the build never calls these):
 *   seedJob(job)            put an open job in the job system
 *   ring(callId, phone, utterances)   stage the next call
 *   moveEta(jobId, eta)     a person moves the arrival time on the board
 *   markLeft(jobId)         a tradesperson is marked as leaving for the job
 *   markComplete(jobId)     the job is marked complete
 *   release(jobId, draftId, by)   a named person releases a drafted update
 *
 * Nothing here decides a verdict. It only holds state and records.
 */
import { PORT_SHAPE } from "@aipathway/conformance";

const clone = (v) => (v === null || v === undefined ? v : structuredClone(v));

export class DayDeskWorld {
  constructor(opts = {}) {
    this.clock = new Date(opts.now ?? "2026-11-04T00:40:00.000Z"); // 10:40am AEST
    this.jobs = new Map();
    this.roster = opts.roster ?? { on_duty: "Kerry Nolan", callback_within_minutes: 30 };
    this.transferAnswered = opts.transferAnswered ?? false;
    this.failNextWrite = opts.failNextWrite ?? false;
    this.tasks = [];
    this.calls = [];
    this.callMarks = []; // { callId, at: index into calls }
    this.seq = 0;
    this.eventSeq = 0;
    this.line = null; // { callId, phone, utterances, heard }
  }

  record(port, request, response, intentId) {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request: clone(request),
      response: clone(response),
      ...(intentId ? { intentId } : {}),
    });
  }

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  // ---- runner side --------------------------------------------------------

  seedJob(job) {
    const full = {
      status: "open",
      eta: null,
      notes: [],
      drafts: [],
      exception: null,
      ...job,
    };
    this.jobs.set(full.id, full);
    return full;
  }

  ring(callId, phone, utterances) {
    this.line = { callId, phone, utterances: [...utterances], heard: 0 };
    this.callMarks.push({ callId, at: this.calls.length });
    return { name: "call.received", callId, phone };
  }

  nextEventId(kind) {
    return `ev-${kind}-${++this.eventSeq}`;
  }

  moveEta(jobId, eta) {
    this.jobs.get(jobId).eta = eta;
    return { name: "job.updated", jobId, change: "eta", eventId: this.nextEventId("eta") };
  }

  markLeft(jobId) {
    this.jobs.get(jobId).on_the_way = true;
    return { name: "job.updated", jobId, change: "left", eventId: this.nextEventId("left") };
  }

  markComplete(jobId) {
    this.jobs.get(jobId).status = "complete";
    return { name: "job.completed", jobId, eventId: this.nextEventId("complete") };
  }

  /** A named person releases every unreleased draft on the job. Returns the release events. */
  releaseAll(jobId, by = "Kerry Nolan") {
    const job = this.jobs.get(jobId);
    const out = [];
    for (const d of job.drafts) {
      if (d.released_by) continue;
      d.released_by = by;
      out.push({ name: "job.updated", jobId, change: "release", draftId: d.id, eventId: this.nextEventId("release") });
    }
    return out;
  }

  // ---- what the build is handed --------------------------------------------

  ports() {
    return {
      now: () => new Date(this.clock),

      disclose: (callId, text) => this.record("disclose", { callId, text }, { ok: true }),

      say: (callId, text) => this.record("talk", { callId, text }, { ok: true }),

      hear: (callId) => {
        const l = this.line;
        const text = l && l.callId === callId && l.heard < l.utterances.length ? l.utterances[l.heard++] : null;
        this.record("talk", { callId, listen: true }, { text });
        return text;
      },

      /** The one lookup by phone number, allowed because a call is the entry hop. */
      findOpenJobs: (phone) => {
        const ids = [...this.jobs.values()].filter((j) => j.phone === phone && j.status === "open").map((j) => j.id);
        this.record("read_job", { phone, status: "open" }, { ids });
        return ids;
      },

      readJob: (id) => {
        const job = this.jobs.get(id) ?? null;
        this.record("read_job", { id }, job ? { id: job.id, status: job.status, eta: job.eta } : null);
        return clone(job);
      },

      writeJob: (job, intentId) => {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_job", { ...job, intentId }, { id: null }, intentId);
          return { id: null };
        }
        const id = `J${2000 + ++this.seq}`;
        this.jobs.set(id, { id, status: "open", eta: null, notes: [], drafts: [], exception: null, contact: { phone: job.phone, consent: false }, ...job });
        this.record("write_job", { ...job, intentId }, { id }, intentId);
        return { id };
      },

      fileNote: (jobId, note) => {
        const job = this.jobs.get(jobId) ?? null;
        const stamped = { ...note, at: this.clock.toISOString() };
        if (job) job.notes.push(stamped);
        this.record("file_message", { jobId, ...note }, job ? { ok: true } : { ok: false });
        return !!job;
      },

      readRoster: () => {
        this.record("read_rule", { rule: "roster" }, clone(this.roster));
        return clone(this.roster);
      },

      transfer: (callId, to) => {
        const answered = this.transferAnswered;
        this.record("escalate", { callId, transfer_to: to }, { answered });
        return { answered };
      },

      raiseTask: (task) => {
        const id = `T${++this.seq}`;
        this.tasks.push({ id, ...task });
        this.record("raise_task", { ...task }, { id });
        return { id };
      },

      draftUpdate: (jobId, draft) => {
        const job = this.jobs.get(jobId) ?? null;
        const id = `D${++this.seq}`;
        if (job) job.drafts.push({ id, ...draft, released_by: null });
        this.record("draft_message", { jobId, ...draft }, job ? { id } : { id: null });
        return { id: job ? id : null };
      },

      sendSms: (to, text, meta) => {
        this.record("send_sms", { to, text, ...meta }, { ok: true });
        return { ok: true };
      },
    };
  }
}

/** Runner side: drive a sequence of events through the build, in order. */
export async function deliver(build, world, events) {
  for (const ev of events) await build(world.ports(), ev);
}

/**
 * The stub world for Review Ask: a job system, a customer list, an inbox, a
 * record the business owns, an opt-out list, an owner's phone and a person who
 * releases the outgoing batch. The package ships no world for this standard,
 * so this one is written to the standard's own objects (Rules, Job, Ask, Hold,
 * Reply, OptOut) and its ports (read_rule, read_job, send_message, read_inbox,
 * escalate, notify, record_consent, gate, evidence).
 *
 * Nothing here decides a verdict. It holds state the runner sets, hands the
 * build its ports, and records every call in `calls`, which is what the
 * scenarios read.
 *
 * Runner side only (a build never calls these): advance, setJob, reply,
 * markReviewPosted, the `onRelease` hook (the job system changing while a
 * batch waits for its person), and the `releaser` option, which plays the named person
 * who releases each batch. With no releaser, nothing is released.
 *
 * On purpose there is no port that posts, drafts or answers a review.
 */

const VERB = {
  read_rule: "read",
  list_jobs: "read",
  read_job: "read",
  read_customer: "read",
  read_inbox: "read",
  read_record: "read",
  gate: "decide",
  release: "decide",
  send_message: "write",
  evidence: "write",
  record_consent: "write",
  escalate: "write",
  notify: "write",
};

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export class ReviewWorld {
  calls = [];
  record = [];
  optOuts = [];
  sent = [];
  refused = [];
  alerts = [];
  exceptions = [];
  releases = [];
  inbox = [];
  seq = 0;

  constructor({ now, rules, jobs = [], customers = [], releaser = "Kim Nguyen, office manager", owner = "Sam Rossi, owner", onRelease = null }) {
    this.onRelease = onRelease;
    this.clock = new Date(now);
    this.rules = { owner, ...rules };
    this.jobs = new Map(jobs.map((j) => [j.id, { openCallback: false, invoiceDisputed: false, openComplaint: false, reviewMarkedBy: null, completedAt: null, paidAt: null, ...j }]));
    this.customers = new Map(customers.map((c) => [c.id, { mobile: null, email: null, ...c }]));
    this.releaser = releaser;
  }

  // ── runner side ──────────────────────────────────────────────
  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }
  at(iso) {
    this.clock = new Date(iso);
  }
  setJob(id, patch) {
    Object.assign(this.jobs.get(id), patch);
  }
  /** A reply arrives from the customer, answering the last message sent to them. */
  reply(customerId, text) {
    const last = [...this.sent].reverse().find((s) => s.customerId === customerId);
    this.inbox.push({ messageId: `in-${++this.seq}`, customerId, inReplyTo: last?.messageId ?? null, text, receivedAt: this.clock.toISOString() });
  }
  markReviewPosted(jobId, by = "Kim Nguyen, office manager") {
    this.jobs.get(jobId).reviewMarkedBy = by;
  }

  log(port, request, response) {
    this.calls.push({ at: this.clock.toISOString(), port, verb: VERB[port], subject: port, request: clone(request), response: clone(response) });
    return response;
  }

  // ── the build's only door ────────────────────────────────────
  ports() {
    return {
      now: () => new Date(this.clock),

      readRule: () => this.log("read_rule", {}, clone(this.rules)),

      /** The job system's own list of jobs with a finished status. */
      listFinishedJobs: () => {
        const ids = [...this.jobs.values()].filter((j) => j.status === "complete" || j.status === "paid").map((j) => j.id);
        return this.log("list_jobs", { status: ["complete", "paid"] }, ids);
      },

      readJob: (id) => this.log("read_job", { jobId: id }, clone(this.jobs.get(id) ?? null)),

      readCustomer: (id) => this.log("read_customer", { customerId: id }, clone(this.customers.get(id) ?? null)),

      readInbox: () => this.log("read_inbox", {}, clone(this.inbox)),

      readRecord: () => this.log("read_record", {}, clone(this.record)),

      writeRecord: (entry) => {
        const id = `rec-${++this.seq}`;
        const row = { id, at: this.clock.toISOString(), ...clone(entry) };
        this.record.push(row);
        return this.log("evidence", entry, { ok: true, id });
      },

      recordConsent: ({ customerId, said, receivedAt }) => {
        if (!this.optOuts.some((o) => o.customerId === customerId)) this.optOuts.push({ customerId, said, receivedAt });
        return this.log("record_consent", { customerId, said, receivedAt }, { ok: true });
      },

      gate: (customerId) => this.log("gate", { customerId }, { optedOut: this.optOuts.some((o) => o.customerId === customerId) }),

      /** Hand the prepared batch to the named person. They release it whole or not at all. */
      requestRelease: (batch) => {
        const releaseId = `rel-${++this.seq}`;
        // Runner side: what happens in the job system while the batch waits for the person.
        if (this.onRelease) this.onRelease(this, batch);
        const released = Boolean(this.releaser);
        if (released) this.releases.push({ releaseId, releasedBy: this.releaser, items: batch.items.map((i) => `${i.jobId}:${i.kind}`) });
        return this.log("release", batch, released ? { released, releaseId, releasedBy: this.releaser } : { released: false });
      },

      sendMessage: (msg) => {
        const rel = this.releases.find((r) => r.releaseId === msg.releaseId);
        const optedOut = this.optOuts.some((o) => o.customerId === msg.customerId);
        const released = Boolean(rel && rel.items.includes(`${msg.jobId}:${msg.kind}`));
        if (optedOut || !released) {
          this.refused.push({ ...msg, why: optedOut ? "opted_out" : "not_released" });
          return this.log("send_message", msg, { sent: false, why: optedOut ? "opted_out" : "not_released" });
        }
        const messageId = `out-${++this.seq}`;
        this.sent.push({ ...msg, messageId, at: this.clock.toISOString() });
        return this.log("send_message", msg, { sent: true, messageId });
      },

      escalate: ({ jobId, customerId, reason, owner }) => {
        const exceptionId = `exc-${++this.seq}`;
        this.exceptions.push({ exceptionId, jobId, customerId, reason, owner });
        return this.log("escalate", { jobId, customerId, reason, owner }, { exceptionId });
      },

      notify: ({ to, jobId, customerId, text }) => {
        this.alerts.push({ to, jobId, customerId, text, at: this.clock.toISOString() });
        return this.log("notify", { to, jobId, customerId, text }, { ok: true });
      },
    };
  }
}

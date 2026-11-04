/**
 * The world Install Book is tested in: local.mock_service_book, as the Next
 * Service standard describes it.
 *
 * The conformance package ships no world for this standard, so this file is
 * that stub, written to the standard's own list:
 *
 * - finished and open jobs, with equipment as the technician recorded it
 *   (the commissioning record of a new install, or the service sheet);
 * - a written schedule the runner can change between runs;
 * - customers with the channels they agreed to;
 * - a send that refuses a stopped customer or an unagreed channel;
 * - a job system that does NOT deduplicate: two writes are two jobs;
 * - an asset register that does not deduplicate either: two service records
 *   for one job are two records;
 * - an exception desk that hands back an exception_id and an owner.
 *
 * Every port call is recorded in `calls` with its port name from the
 * package's PORT_SHAPE, so a scenario reads the trace and never the build.
 *
 * Fixtures are illustrative. Customers, phone numbers (ACMA's fictitious
 * 0491 570 xxx range), emails (example.com) and schedule intervals are made
 * up for the test; the business writes its own schedule from the maker's
 * instructions.
 */

import { PORT_SHAPE } from "@aipathway/conformance";

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class ServiceBookWorld {
  /**
   * @param {object} opts
   * @param {Date} [opts.now]
   * @param {object[]} [opts.jobs] jobs in the job system
   * @param {Record<string, number>} [opts.schedule] months between services, by equipment type
   * @param {{lead_days:number, follow_up_days:number, business_name:string, office:string}} [opts.settings]
   * @param {object[]} [opts.customers]
   */
  constructor(opts = {}) {
    this.clock = new Date(opts.now ?? "2026-11-04T22:00:00.000Z");
    this.jobs = clone(opts.jobs ?? []);
    this.schedule = { ...(opts.schedule ?? {}) };
    this.settings = {
      lead_days: 21,
      follow_up_days: 7,
      business_name: "Example Plumbing and Air (test)",
      office: "office manager",
      ...(opts.settings ?? {}),
    };
    this.customers = clone(opts.customers ?? []);
    /** Service records in the asset register. Not deduplicated. */
    this.records = [];
    /** Replies in the mailbox, pushed by the runner. */
    this.inbox = [];
    /** The record kept by asset: what the evidence port writes. */
    this.history = [];
    this.exceptions = [];
    this.messages = [];
    this.alerts = [];
    this.calls = [];
    this.seq = { job: 900, rec: 0, msg: 0, exc: 0, ev: 0, reply: 0 };
  }

  // ── The runner's side. The build never calls these. ──

  advanceDays(days) {
    this.clock = new Date(this.clock.getTime() + days * 86_400_000);
  }

  setSchedule(type, months) {
    this.schedule[type] = months;
  }

  addJob(job) {
    this.jobs.push(clone(job));
  }

  /** A reply arrives, threaded to the reminder it answers (as a real SMS or email thread is). */
  reply({ customer_id, asset_id, kind, due_on, channel, text }) {
    const r = {
      reply_id: `R${++this.seq.reply}`,
      customer_id,
      asset_id,
      kind,
      due_on,
      channel,
      text,
      received_at: this.clock.toISOString(),
    };
    this.inbox.push(r);
    return r.reply_id;
  }

  // ── Internals. ──

  #rec(port, request, response) {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request: clone(request),
      response: clone(response),
    });
    return response;
  }

  #customer(id) {
    return this.customers.find((c) => c.id === id) ?? null;
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    return {
      now: () => new Date(this.clock),

      /** read_job: the completed jobs, by id only. */
      listCompletedJobs: () => {
        const ids = this.jobs.filter((j) => j.status === "complete").map((j) => j.job_id);
        return this.#rec("read_job", { status: "complete" }, { job_ids: ids });
      },

      /** read_job: one job by its id. */
      readJob: (jobId) => {
        const j = this.jobs.find((x) => x.job_id === jobId) ?? null;
        return clone(this.#rec("read_job", { job_id: jobId }, j));
      },

      /** read_job: the open jobs on one asset (scheduled work and booking requests alike). */
      openJobsForAsset: (assetId) => {
        const open = this.jobs.filter((j) => j.status !== "complete" && j.asset_id === assetId);
        return clone(this.#rec("read_job", { asset_id: assetId, open: true }, { jobs: open }));
      },

      /** write_job: one booking request. The stub does not deduplicate. */
      writeJob: (req) => {
        const job = {
          job_id: `J${++this.seq.job}`,
          status: "booking_request",
          customer_id: req.customer_id,
          asset_id: req.asset_id,
          due_on: req.due_on ?? null,
          kind: req.kind ?? null,
          description: req.description ?? "",
          reply_text: req.reply_text ?? "",
        };
        this.jobs.push(job);
        return clone(this.#rec("write_job", req, { job_id: job.job_id }));
      },

      /** record_service: one service record into the asset register. Not deduplicated. */
      recordService: (rec) => {
        const r = { record_id: `SR${++this.seq.rec}`, ...clone(rec) };
        this.records.push(r);
        return clone(this.#rec("record_service", rec, { record_id: r.record_id }));
      },

      /** read_asset: every service record in the register. */
      readRegister: () => clone(this.#rec("read_asset", { register: true }, { records: this.records })),

      /** read_asset: the record kept against one asset. */
      readHistory: (assetId) =>
        clone(this.#rec("read_asset", { history: assetId }, { entries: this.history.filter((h) => h.asset_id === assetId) })),

      /** read_asset: open exceptions on a record (asset or reply). */
      openExceptions: (ref) =>
        clone(
          this.#rec("read_asset", { exceptions: ref }, { exceptions: this.exceptions.filter((e) => e.ref === ref && e.open) }),
        ),

      /** read_rule: the schedule row for one equipment type, or null. */
      readSchedule: (type) => {
        const months = Object.prototype.hasOwnProperty.call(this.schedule, type) ? this.schedule[type] : undefined;
        return this.#rec("read_rule", { equipment_type: type }, months === undefined ? null : { equipment_type: type, service_months: months });
      },

      /** read_rule: the written settings. */
      readSettings: () => clone(this.#rec("read_rule", { settings: true }, this.settings)),

      /** gate: what the customer agreed to, and whether they asked to stop. */
      consentFor: (customerId) => {
        const c = this.#customer(customerId);
        const out = c
          ? { customer_id: c.id, first_name: c.first_name, sms: !!c.consent?.sms, email: !!c.consent?.email, withdrawn: !!c.withdrawn }
          : null;
        return clone(this.#rec("gate", { customer_id: customerId }, out));
      },

      /** send_message: refuses a stopped customer or a channel they did not agree to. */
      sendMessage: (msg) => {
        const c = this.#customer(msg.customer_id);
        let refused = null;
        if (!c) refused = "unknown_customer";
        else if (c.withdrawn) refused = "withdrawn";
        else if (!c.consent?.[msg.channel]) refused = "channel_not_agreed";
        if (refused) return this.#rec("send_message", msg, { sent: false, refused });
        const id = `M${++this.seq.msg}`;
        this.messages.push({ message_id: id, ...clone(msg), sent_at: this.clock.toISOString() });
        return this.#rec("send_message", msg, { sent: true, message_id: id });
      },

      /** read_inbox: every reply in the mailbox. */
      readInbox: () => clone(this.#rec("read_inbox", { all: true }, { replies: this.inbox })),

      /** record_consent: a withdrawal, keyed on the customer. No field clears it. */
      recordConsent: (req) => {
        const c = this.#customer(req.customer_id);
        if (c && req.withdrawn) c.withdrawn = true;
        return this.#rec("record_consent", req, c ? { ok: true } : { ok: false });
      },

      /** notify: tell a person something is waiting. */
      notify: (to, jobId, reason) => {
        this.alerts.push({ to, jobId, reason });
        return this.#rec("notify", { to, job_id: jobId, reason }, { ok: true });
      },

      /** escalate: an exception with a named owner. Returns its id. */
      escalate: (req) => {
        const e = {
          exception_id: `EX${++this.seq.exc}`,
          ref: req.ref,
          kind: req.kind,
          detail: req.detail,
          exception_owner: this.settings.office,
          open: true,
        };
        this.exceptions.push(e);
        return clone(this.#rec("escalate", req, { exception_id: e.exception_id, exception_owner: e.exception_owner }));
      },

      /** evidence: one entry on the record, by asset. */
      evidence: (entry) => {
        const e = { entry_id: `E${++this.seq.ev}`, at: this.clock.toISOString(), ...clone(entry) };
        this.history.push(e);
        return this.#rec("evidence", entry, { entry_id: e.entry_id });
      },
    };
  }
}

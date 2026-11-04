/**
 * The world Service Due is tested in: local.mock_service_book, as the Next
 * Service standard describes its stub.
 *
 * The conformance package ships no world for this standard, so this file is
 * that world, built on the package's port vocabulary (PORT_SHAPE) so every call
 * lands in the trace as the runner expects. It holds, and only the runner
 * changes:
 *
 * - finished and open jobs in the job system, with the equipment as the
 *   technician recorded it (including, on purpose, a next-due date somebody
 *   typed onto a job, which a build must ignore);
 * - the asset register: one asset per piece of equipment, each with its
 *   service records, its history (every reminder, reply, stop and booking
 *   request) and any exception open on it;
 * - the business's written schedule, one row per equipment type, which the
 *   runner can change between runs, and the written lead time and follow-up gap;
 * - customers with the channels they agreed to, and an opt-out list no field
 *   clears;
 * - a morning list where a named person releases each drafted reminder;
 * - a send that refuses a stopped customer, an unagreed channel or a draft
 *   nobody released;
 * - an inbox of replies, each carrying the message id it answers (or, for a
 *   booking-link tap, the asset id and date the link was minted for);
 * - a job system that does NOT deduplicate: two writes are two jobs.
 *
 * Nothing here is a real customer. Numbers are from ACMA's fictitious range
 * (0491 570 xxx) and email addresses are on example.com.au.
 */

import { PORT_SHAPE } from "@aipathway/conformance";

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class ServiceBookWorld {
  /**
   * @param {object} [opts]
   * @param {Date} [opts.now]
   * @param {Array<object>} [opts.jobs]       jobs in the job system
   * @param {Array<object>} [opts.assets]     assets already on the register
   * @param {Array<object>} [opts.schedule]   { equipmentType, serviceMonths, changedBy, changedOn }
   * @param {object} [opts.settings]          { leadDays, followUpDays }
   * @param {Array<object>} [opts.customers]  { id, name, phone, email, consent: { sms, email } }
   * @param {"all"|"none"} [opts.release]     what the named person does with the morning list
   */
  constructor(opts = {}) {
    this.clock = opts.now ?? new Date("2026-11-04T00:00:00.000Z"); // 10am Brisbane
    this.jobs = clone(opts.jobs ?? []);
    this.assets = clone(opts.assets ?? []).map((a) => ({ records: [], history: [], exceptions: [], ...a }));
    this.schedule = clone(opts.schedule ?? []);
    this.settings = clone(opts.settings ?? { leadDays: 21, followUpDays: 5 });
    this.customers = clone(opts.customers ?? []);
    this.release = opts.release ?? "all";
    this.releaser = "office manager";
    this.optOuts = [];
    this.inbox = [];
    this.drafts = [];
    this.sent = [];
    this.notices = [];
    this.exceptions = [];
    /** @type {Array<import("@aipathway/conformance").PortCall & Record<string, unknown>>} */
    this.calls = [];
    this.seq = { asset: this.assets.length, job: 0, msg: 0, draft: 0, exc: 0, reply: 0, ev: 0 };
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  today() {
    return this.clock.toISOString().slice(0, 10);
  }

  /** A person changes one row of the written schedule. Nobody edits a date. */
  setSchedule(equipmentType, serviceMonths) {
    const row = this.schedule.find((r) => r.equipmentType === equipmentType);
    if (row) Object.assign(row, { serviceMonths, changedBy: "office manager", changedOn: this.today() });
    else this.schedule.push({ equipmentType, serviceMonths, changedBy: "office manager", changedOn: this.today() });
  }

  /** A technician finishes a job in the job system. */
  completeJob(job) {
    this.jobs.push({ status: "complete", ...clone(job) });
  }

  /** A reply lands in the inbox, answering the message whose id it carries. */
  reply({ inReplyTo = null, text, channel = "sms", assetId = null, dueOn = null }) {
    const msg = this.sent.find((m) => m.id === inReplyTo);
    const item = {
      id: `R-${++this.seq.reply}`,
      inReplyTo,
      channel,
      text,
      at: this.clock.toISOString(),
      ...(assetId ? { assetId, dueOn } : {}),
      customerId: msg?.customerId ?? this.assets.find((a) => a.id === assetId)?.customerId ?? null,
    };
    this.inbox.push(item);
    return item.id;
  }

  /** The message ids sent to one asset, in order, for the runner to reply to. */
  sentFor(assetId) {
    return this.sent.filter((m) => m.assetId === assetId);
  }

  // ── Internals. ──

  record(port, request, response, extra = {}) {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request: clone(request),
      response: clone(response),
      ...extra,
    });
    return response;
  }

  assetView(a) {
    return {
      id: a.id,
      customerId: a.customerId,
      sourceJobId: a.sourceJobId,
      equipmentType: a.equipmentType ?? null,
      make: a.make ?? null,
      model: a.model ?? null,
      serial: a.serial ?? null,
      installedOn: a.installedOn ?? null,
      lastServicedOn: a.lastServicedOn ?? null,
      warrantyMonths: a.warrantyMonths ?? null,
      records: clone(a.records),
      history: clone(a.history),
      openExceptions: a.exceptions.filter((e) => !e.clearedBy).map((e) => ({ id: e.id, kind: e.kind })),
    };
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    return {
      now: () => new Date(this.clock),

      /** Completed jobs, newest last, with the equipment as recorded. */
      listCompletedJobs: () => {
        const out = this.jobs
          .filter((j) => j.status === "complete" && j.kind !== "booking_request")
          .map((j) => clone(j));
        return this.record("read_job", { status: "complete" }, out);
      },

      /** Open jobs in the job system for one asset: scheduled services and booking requests. */
      openJobsFor: (assetId) => {
        const out = this.jobs.filter((j) => j.status !== "complete" && j.assetId === assetId).map((j) => ({ id: j.id, kind: j.kind, assetId: j.assetId }));
        return this.record("read_job", { assetId, open: true }, out);
      },

      /** Read one job back by its number. */
      readJob: (jobId) => {
        const j = this.jobs.find((x) => x.id === jobId) ?? null;
        return this.record("read_job", { id: jobId }, j ? clone(j) : null);
      },

      /** The whole register, by asset id, with each asset's record and history. */
      readAssets: () => this.record("read_asset", { all: true }, this.assets.map((a) => this.assetView(a))),

      /**
       * Record a finished job's equipment against the asset. With an assetId it
       * adds a service record to that asset; without one the register issues a
       * new asset id. It does NOT deduplicate: two calls are two records.
       */
      recordService: ({ sourceJobId, assetId = null, customerId, fields }) => {
        let asset = assetId ? this.assets.find((a) => a.id === assetId) : null;
        if (assetId && !asset) return this.record("record_service", { sourceJobId, assetId, customerId, fields }, { id: null });
        if (!asset) {
          asset = { id: `A-${String(++this.seq.asset).padStart(4, "0")}`, customerId, sourceJobId, records: [], history: [], exceptions: [] };
          this.assets.push(asset);
        }
        for (const k of ["equipmentType", "make", "model", "serial", "installedOn", "lastServicedOn", "warrantyMonths"]) {
          if (fields[k] !== undefined && fields[k] !== null) asset[k] = fields[k];
          else if (asset[k] === undefined) asset[k] = null;
        }
        const rec = { sourceJobId, ...clone(fields), at: this.clock.toISOString() };
        asset.records.push(rec);
        return this.record("record_service", { sourceJobId, assetId, customerId, fields }, { id: asset.id, assetId: asset.id, sourceJobId });
      },

      /** The written schedule and settings, as the business keeps them. */
      readSchedule: () => this.record("read_rule", { schedule: true }, { rules: clone(this.schedule), settings: clone(this.settings) }),

      /** What a customer agreed to, and whether they asked to stop. */
      consentOf: (customerId) => {
        const c = this.customers.find((x) => x.id === customerId);
        const optedOut = this.optOuts.some((o) => o.customerId === customerId);
        const out = c ? { customerId, name: c.name, sms: c.consent?.sms === true, email: c.consent?.email === true, optedOut } : null;
        return this.record("gate", { consent: customerId }, out);
      },

      /** Put a reminder on the morning list for a person to release. */
      draftMessage: (draft) => {
        const d = { id: `D-${++this.seq.draft}`, ...clone(draft), at: this.clock.toISOString() };
        this.drafts.push(d);
        return this.record("draft_message", draft, { id: d.id });
      },

      /** Has the named person released this draft? */
      releaseOf: (draftId) => {
        const d = this.drafts.find((x) => x.id === draftId);
        const out = d && this.release === "all" ? { draftId, released: true, by: this.releaser } : { draftId, released: false, by: null };
        return this.record("gate", { release: draftId }, out);
      },

      /** Send a released draft. Refuses a stopped customer, an unagreed channel or an unreleased draft. */
      sendMessage: ({ draftId }) => {
        const d = this.drafts.find((x) => x.id === draftId);
        const c = d ? this.customers.find((x) => x.id === d.customerId) : null;
        let refused = null;
        if (!d) refused = "no_such_draft";
        else if (this.release !== "all") refused = "not_released";
        else if (this.optOuts.some((o) => o.customerId === d.customerId)) refused = "opted_out";
        else if (!c || c.consent?.[d.channel] !== true) refused = "channel_not_agreed";
        if (refused) return this.record("send_message", { draftId, ...(d ? clone(d) : {}) }, { sent: false, refused, id: null });
        const m = { id: `M-${++this.seq.msg}`, draftId, ...clone(d), sentAt: this.clock.toISOString() };
        delete m.at;
        this.sent.push(m);
        return this.record("send_message", { draftId, ...clone(d) }, { sent: true, id: m.id });
      },

      /** Every reply in the inbox. */
      readInbox: () => this.record("read_inbox", { all: true }, clone(this.inbox)),

      /** Record withdrawn consent. There is no call that clears one. */
      recordConsent: ({ customerId, withdrawn, said, replyId }) => {
        if (withdrawn !== true) return this.record("record_consent", { customerId, withdrawn, said, replyId }, { ok: false });
        const o = { customerId, said, replyId, receivedAt: this.clock.toISOString() };
        this.optOuts.push(o);
        return this.record("record_consent", { customerId, withdrawn, said, replyId }, { ok: true });
      },

      /** Write a job into the job system. Two writes are two jobs. */
      writeJob: (job, intentId) => {
        const j = { id: `J-${5000 + ++this.seq.job}`, status: "open", ...clone(job), createdAt: this.clock.toISOString() };
        this.jobs.push(j);
        return this.record("write_job", { ...job, intentId }, { id: j.id }, { intentId });
      },

      /** Tell a person something is waiting, by its job number. */
      notify: (to, jobId, reason) => {
        this.notices.push({ to, jobId, reason });
        return this.record("notify", { to, jobId, reason }, { ok: true });
      },

      /** Raise an exception with a named owner, on the asset (or the reply). */
      escalate: ({ kind, assetId = null, replyId = null, detail, owner }) => {
        const e = { id: `EX-${++this.seq.exc}`, kind, assetId, replyId, detail, owner, raisedAt: this.clock.toISOString(), clearedBy: null };
        this.exceptions.push(e);
        const asset = this.assets.find((a) => a.id === assetId);
        if (asset) asset.exceptions.push(e);
        return this.record("escalate", { kind, assetId, replyId, detail, owner }, { id: e.id });
      },

      /** Append one entry to an asset's history. The register keeps it; nobody edits it. */
      evidence: (assetId, entry) => {
        const asset = this.assets.find((a) => a.id === assetId);
        if (!asset) return this.record("evidence", { assetId, entry }, { id: null });
        const e = { id: `EV-${++this.seq.ev}`, ...clone(entry), at: this.clock.toISOString() };
        asset.history.push(e);
        return this.record("evidence", { assetId, entry }, { id: e.id });
      },
    };
  }
}

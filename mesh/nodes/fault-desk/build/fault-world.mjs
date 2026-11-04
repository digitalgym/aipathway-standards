/**
 * The world Fault Desk is tested in: the business's fault list (one sheet,
 * versioned by edition), its asset register (which model each customer has),
 * its job system (ServiceM8 or Simpro, jobs by id), the office's message
 * system with its drafts folder, the on-call phone, the exception queue and the
 * triage log.
 *
 * The package's StubWorld is a single after-hours call. This standard sorts
 * calls, texts and alarms against a written list, so the world is written
 * here. It only records: nothing in it decides a verdict. Every port call
 * lands in `calls` with the shape the package records.
 *
 * Runner side (the build never calls these): `release()` is a named person
 * sending a drafted reply from the drafts folder, `reply()` is the customer
 * texting back, and `advance()` moves the clock.
 *
 * Customer ids, job ids and the business are made up. Nothing here is a real
 * customer, and no phone number appears anywhere.
 */

const SHAPE = {
  read_inbox: ["read", "message"],
  read_rule: ["read", "rule"],
  read_asset: ["read", "asset"],
  read_job: ["read", "job"],
  write_job: ["write", "job"],
  disclose: ["say", "disclosure"],
  talk: ["say", "turn"],
  draft_message: ["write", "draft"],
  read_draft: ["read", "draft"],
  send_sms: ["say", "sms"],
  notify: ["say", "alert"],
  escalate: ["say", "handoff"],
  list_exceptions: ["read", "exception"],
  raise_exception: ["write", "exception"],
  evidence: ["attach", "evidence"],
};

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export class FaultWorld {
  /**
   * @param {object} o
   * @param {Date} [o.now]
   * @param {object} o.faultList          { edition, faults[] } as the business wrote it
   * @param {Array<object>} [o.assets]     { asset_id, customer_external_id, model }
   * @param {Array<object>} [o.jobs]       jobs already in the job system
   * @param {Array<object>} [o.intakes]    { intake_id, source, customer_external_id?, asset_id?, said_or_sent }
   * @param {Record<string,string[]>} [o.answers]  what a caller says back, per intake, in order
   * @param {Array<object>} [o.exceptions] exceptions already open on the queue
   * @param {boolean} [o.failNextWrite]    the job system returns no id on the next write
   */
  constructor(o = {}) {
    this.clock = o.now ?? new Date("2026-07-14T08:10:00.000Z"); // Tue 6:10pm Brisbane, winter
    this.faultList = clone(o.faultList);
    this.assets = new Map((o.assets ?? []).map((a) => [a.asset_id, { ...a }]));
    this.jobs = (o.jobs ?? []).map((j) => ({ notes: [], updates: 0, open: true, ...clone(j) }));
    this.inbox = (o.intakes ?? []).map((i) => ({ ...clone(i), read: false }));
    this.answers = clone(o.answers ?? {});
    this.exceptions = (o.exceptions ?? []).map((e) => ({ status: "open", ...clone(e) }));
    this.failNextWrite = o.failNextWrite ?? false;
    this.turns = [];
    this.drafts = [];
    this.sent = [];
    this.alerts = [];
    this.escalations = [];
    this.log = [];
    this.calls = [];
    this.writes = new Map();
    this.seq = 100;
    this.draftSeq = 0;
    this.excSeq = 0;
    this.logSeq = 0;
  }

  // ── runner side ──

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A named person sends a draft from the drafts folder, as written. */
  release(draftId, by) {
    const d = this.drafts.find((x) => x.draft_id === draftId);
    if (!d || d.status !== "draft") return null;
    d.status = "sent";
    d.released_by = by;
    d.sent_at = this.clock.toISOString();
    const msg = { message_id: `M-${draftId}`, draft_id: draftId, intake_id: d.intake_id, text: d.text, released_by: by };
    this.sent.push(msg);
    this.record("send_sms", { draft_id: draftId, released_by: by }, { message_id: msg.message_id });
    return msg;
  }

  /** The customer texts back about a message that was sent. */
  reply(draftId, text) {
    const d = this.drafts.find((x) => x.draft_id === draftId);
    this.inbox.push({
      intake_id: `IN-reply-${draftId}`,
      source: "sms",
      customer_external_id: d?.customer_external_id,
      in_reply_to: draftId,
      said_or_sent: text,
      read: false,
    });
  }

  // ── recorder ──

  record(port, request, response, intentId) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({
      at: this.clock.toISOString(),
      port,
      verb,
      subject,
      request: clone(request),
      response: clone(response),
      ...(intentId ? { intentId } : {}),
    });
  }

  // ── the build's only door ──

  ports() {
    return {
      now: () => new Date(this.clock),

      /** Unread calls, texts, portal messages and alarms. Reading one marks it read. */
      nextIntakes: async () => {
        const out = this.inbox.filter((i) => !i.read).map(({ read, ...i }) => i);
        for (const i of this.inbox) i.read = true;
        this.record("read_inbox", { unread: true }, out);
        return clone(out);
      },

      /** The live edition of the fault list, as the business wrote it. */
      readFaultList: async () => {
        this.record("read_rule", { list: "fault_list" }, this.faultList);
        return clone(this.faultList);
      },

      readAsset: async (assetId) => {
        const a = this.assets.get(assetId) ?? null;
        this.record("read_asset", { asset_id: assetId }, a);
        return clone(a);
      },

      /** An open job for this customer, by the customer's id in the job system. */
      findOpenJob: async (customerId) => {
        const j = this.jobs.find((x) => x.customer_external_id === customerId && x.open) ?? null;
        this.record("read_job", { customer_external_id: customerId, open: true }, j ? { id: j.id, type: j.type } : null);
        return clone(j);
      },

      readJob: async (jobId) => {
        const j = this.jobs.find((x) => x.id === jobId) ?? null;
        this.record("read_job", { id: jobId }, j);
        return clone(j);
      },

      /** Write a new job. Keyed on intentId, so a retry returns the same job. */
      writeJob: async (job, intentId) => {
        if (this.writes.has(intentId)) {
          const j = this.jobs.find((x) => x.id === this.writes.get(intentId));
          this.record("write_job", { ...job, intentId }, { id: j.id, replayed: true }, intentId);
          return { id: j.id };
        }
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.record("write_job", { ...job, intentId }, { id: null }, intentId);
          return null;
        }
        const created = { ...clone(job), id: `J${++this.seq}`, open: true, updates: 0, notes: [] };
        this.jobs.push(created);
        this.writes.set(intentId, created.id);
        this.record("write_job", { ...job, intentId }, { id: created.id }, intentId);
        return { id: created.id };
      },

      /** Add a triage note to an open job, marking the intake a duplicate of it. */
      updateJob: async (jobId, note, intentId) => {
        const j = this.jobs.find((x) => x.id === jobId) ?? null;
        if (j && !this.writes.has(intentId)) {
          j.updates++;
          j.notes.push(clone(note));
          this.writes.set(intentId, j.id);
        }
        this.record("write_job", { update: jobId, ...note, intentId }, j ? { id: j.id } : { id: null }, intentId);
        return j ? { id: j.id } : null;
      },

      disclose: async (intakeId, text) => {
        this.turns.push({ intake_id: intakeId, who: "agent", text });
        this.record("disclose", { intake_id: intakeId, text }, { ok: true });
      },

      say: async (intakeId, text) => {
        this.turns.push({ intake_id: intakeId, who: "agent", text });
        this.record("talk", { intake_id: intakeId, text }, { ok: true });
      },

      /** Ask on the call and wait for the caller. Null is silence. */
      ask: async (intakeId, text) => {
        this.turns.push({ intake_id: intakeId, who: "agent", text });
        const list = this.answers[intakeId] ?? [];
        const said = list.length > 0 ? list.shift() : null;
        if (said !== null) this.turns.push({ intake_id: intakeId, who: "caller", text: said });
        this.record("talk", { intake_id: intakeId, text, ask: true }, { text: said });
        return said;
      },

      /** A reply in writing, left in the drafts folder for a named person to send. */
      draftReply: async (intakeId, customerId, text, meta = {}) => {
        const d = {
          draft_id: `D${++this.draftSeq}`,
          intake_id: intakeId,
          customer_external_id: customerId,
          text,
          meta: clone(meta),
          status: "draft",
        };
        this.drafts.push(d);
        this.record("draft_message", { intake_id: intakeId, customer_external_id: customerId, text, meta }, { draft_id: d.draft_id });
        return { draft_id: d.draft_id };
      },

      readDraft: async (draftId) => {
        const d = this.drafts.find((x) => x.draft_id === draftId) ?? null;
        this.record("read_draft", { draft_id: draftId }, d);
        return clone(d);
      },

      notify: async (to, jobId, reason) => {
        this.alerts.push({ to, jobId, reason });
        this.record("notify", { to, jobId, reason }, { ok: true });
      },

      escalate: async (intakeId, reason, transcript) => {
        this.escalations.push({ intake_id: intakeId, reason, transcript: clone(transcript) });
        this.record("escalate", { intake_id: intakeId, reason, transcript }, { ok: true });
      },

      openExceptions: async (customerId) => {
        const out = this.exceptions.filter((e) => e.status === "open" && e.customer_external_id === customerId);
        this.record("list_exceptions", { customer_external_id: customerId, status: "open" }, out);
        return clone(out);
      },

      raiseException: async (e) => {
        const row = { exception_id: `EX-${++this.excSeq}`, status: "open", ...clone(e) };
        this.exceptions.push(row);
        this.record("raise_exception", e, { exception_id: row.exception_id });
        return { exception_id: row.exception_id };
      },

      /** One entry per intake on the triage log. */
      logTriage: async (entry) => {
        const row = { log_id: `L${++this.logSeq}`, ...clone(entry) };
        this.log.push(row);
        this.record("evidence", entry, { log_id: row.log_id });
        return { log_id: row.log_id };
      },
    };
  }
}

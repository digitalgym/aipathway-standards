/**
 * The world Danger Tag Desk is tested in: the business's job system
 * (ServiceM8 here, by job id), its ledger (Xero, by invoice id), the Raise tab
 * every surface appends to, the routing table the owner wrote, the one queue
 * of exceptions, the drafts folder and the morning summary.
 *
 * The package's StubWorld is a phone call. This standard is a queue, so the
 * world is written here. It only records: nothing in it decides a verdict.
 * Every port call lands in `calls` with the same shape the package records.
 *
 * Runner side (the build never calls these): `raise()` appends a row to the
 * Raise tab, `at()` and `advance()` move the clock, `closeByPerson()` is the
 * office manager closing an item on the queue's screen, and `chaseHeld()` is
 * what a chase standard reads before it acts on an invoice.
 *
 * Job ids, invoice ids and email addresses are made up. The phone numbers are
 * from ACMA's fictitious range. Nothing here is a real customer.
 */

const SHAPE = {
  read_inbox: ["read", "message"],
  read_job: ["read", "job"],
  read_ledger: ["read", "ledger"],
  read_rule: ["read", "rule"],
  list_exceptions: ["read", "exception"],
  raise_exception: ["write", "exception"],
  write_job: ["write", "job"],
  draft_message: ["write", "draft"],
  send_message: ["say", "message"],
  notify: ["say", "alert"],
  escalate: ["say", "handoff"],
  read_report: ["read", "report"],
  publish_report: ["say", "report"],
};

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

export class TagWorld {
  /**
   * @param {object} o
   * @param {Date} [o.now]
   * @param {Array<object>} [o.jobs]     ServiceM8 jobs by id
   * @param {Array<object>} [o.invoices] Xero invoices by id
   * @param {object} [o.routing]         the routing table the owner wrote
   * @param {boolean} [o.failNextRaise]  the queue returns no id on the next write
   */
  constructor(o = {}) {
    this.clock = o.now ?? new Date("2026-11-02T23:10:00.000Z"); // Tue 9:10am Brisbane
    this.jobs = new Map((o.jobs ?? []).map((j) => [j.id, { notes: [], ...j }]));
    this.invoices = new Map((o.invoices ?? []).map((i) => [i.id, { ...i }]));
    this.routing = o.routing ?? { rows: [], summary_at: "07:00", time_zone: "Australia/Brisbane" };
    this.failNextRaise = o.failNextRaise ?? false;
    /** the Raise tab */
    this.inbox = [];
    /** the one queue */
    this.queue = [];
    this.drafts = [];
    this.sent = [];
    this.alerts = [];
    this.escalations = [];
    this.reports = [];
    this.calls = [];
    this.seq = 0;
    this.raiseSeq = 0;
  }

  // ── runner side ──

  at(iso) {
    this.clock = new Date(iso);
  }

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A surface appends a row to the Raise tab. */
  raise(row) {
    const r = { raise_id: `R-${++this.raiseSeq}`, raised_at: this.clock.toISOString(), ...clone(row), read: false };
    this.inbox.push(r);
    return r.raise_id;
  }

  /** A person closes an item on the queue's screen, with what they did. */
  closeByPerson(id, by, outcome) {
    const item = this.queue.find((i) => i.id === id);
    if (!item || item.status !== "open") return false;
    item.status = "closed";
    item.closed = { by, at: this.clock.toISOString(), outcome };
    return true;
  }

  /** What Debtor Chasing reads before it chases an invoice: false means hold. */
  chaseHeld(invoiceId) {
    return this.queue.some(
      (i) => i.status === "open" && i.record?.external_id === invoiceId && (i.stop_chase === "dispute" || i.stop_chase === "hardship"),
    );
  }

  get open() {
    return this.queue.filter((i) => i.status === "open");
  }

  // ── recorder ──

  record(port, request, response) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response) });
  }

  // ── the build's only door ──

  ports() {
    return {
      now: () => new Date(this.clock),

      /** Unread rows on the Raise tab. Reading one marks it read. */
      readInbox: async () => {
        const rows = this.inbox.filter((r) => !r.read);
        for (const r of rows) r.read = true;
        const out = rows.map(({ read, ...r }) => r);
        this.record("read_inbox", { tab: "Raise", unread: true }, out);
        return clone(out);
      },

      /** A job by the id its job system issued. Null if that system does not hold it. */
      readJob: async (system, id) => {
        const job = system === "servicem8" && this.jobs.has(id) ? this.jobs.get(id) : null;
        const out = job ? { system, id: job.id, site: job.site, notice_to: job.notice_to ?? null, notes: job.notes.length } : null;
        this.record("read_job", { system, id }, out);
        return clone(out);
      },

      /** An invoice by the id the ledger issued. */
      readLedger: async (system, id) => {
        const inv = system === "xero" && this.invoices.has(id) ? this.invoices.get(id) : null;
        const out = inv ? { system, id: inv.id, contact: inv.contact, status: inv.status } : null;
        this.record("read_ledger", { system, id }, out);
        return clone(out);
      },

      /** The routing table the owner wrote. */
      readRouting: async () => {
        this.record("read_rule", { table: "Routing" }, this.routing);
        return clone(this.routing);
      },

      /** Items in the queue, filtered. */
      listExceptions: async (filter = {}) => {
        const out = this.queue.filter(
          (i) =>
            (filter.status === undefined || i.status === filter.status) &&
            (filter.type === undefined || i.type === filter.type) &&
            (filter.system === undefined || i.record.system === filter.system) &&
            (filter.external_id === undefined || i.record.external_id === filter.external_id),
        );
        this.record("list_exceptions", filter, out);
        return clone(out);
      },

      /**
       * Write to the queue. `create` writes a new open item; `update` merges
       * fields into an existing one. The queue returns the item id it holds,
       * or null. It does not police what is written: the trace does.
       */
      raiseException: async (write) => {
        if (this.failNextRaise) {
          this.failNextRaise = false;
          this.record("raise_exception", write, { id: null });
          return { id: null };
        }
        let id = null;
        if (write.op === "create") {
          const item = { ...clone(write.item), id: `EX-${++this.seq}` };
          delete item.op;
          this.queue.push(item);
          id = item.id;
        } else if (write.op === "update") {
          const item = this.queue.find((i) => i.id === write.id);
          if (item) {
            Object.assign(item, clone(write.fields));
            id = item.id;
          }
        }
        this.record("raise_exception", write, { id });
        return { id };
      },

      /** A note on the job record. Returns the note id the job system issued. */
      writeJob: async (system, jobId, note, key) => {
        const job = system === "servicem8" ? this.jobs.get(jobId) : null;
        let id = null;
        if (job) {
          const existing = job.notes.find((n) => n.key === key);
          if (existing) id = existing.id;
          else {
            id = `NOTE-${jobId}-${job.notes.length + 1}`;
            job.notes.push({ id, key, text: note, at: this.clock.toISOString() });
          }
        }
        this.record("write_job", { system, jobId, note, key }, { id });
        return { id };
      },

      /** A draft in the drafts folder, waiting for a named person to send it. */
      draftMessage: async (draft) => {
        const id = `DRAFT-${this.drafts.length + 1}`;
        this.drafts.push({ id, ...clone(draft), at: this.clock.toISOString() });
        this.record("draft_message", draft, { id });
        return { id };
      },

      /** Sending a message. The desk is never meant to call this. */
      sendMessage: async (msg) => {
        this.sent.push(clone(msg));
        this.record("send_message", msg, { ok: true });
        return { ok: true };
      },

      /** A message to a named person, or back to the standard that raised a row. */
      notify: async (to, about, text) => {
        this.alerts.push({ to, about: clone(about), text, at: this.clock.toISOString() });
        this.record("notify", { to, about, text }, { ok: true });
      },

      /** The one escalation of a late item. */
      escalate: async (to, itemId, reason) => {
        this.escalations.push({ to, itemId, reason, at: this.clock.toISOString() });
        this.record("escalate", { to, itemId, reason }, { ok: true });
      },

      /** Was a summary already published for this local day? */
      readReport: async (day) => {
        const r = this.reports.find((x) => x.day === day) ?? null;
        this.record("read_report", { day }, r ? { id: r.id } : null);
        return r ? { id: r.id } : null;
      },

      /** Publish the morning summary where the office reads it. */
      publishReport: async (summary) => {
        const id = `SUM-${summary.day}`;
        this.reports.push({ id, ...clone(summary), published_at: this.clock.toISOString() });
        this.record("publish_report", summary, { id });
        return { id };
      },
    };
  }
}

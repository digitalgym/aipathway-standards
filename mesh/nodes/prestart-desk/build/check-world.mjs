/**
 * The world Prestart Desk is tested in: the business's job system (Simpro
 * here: jobs by job id, and its vehicles kept as plant and equipment assets by
 * asset id), its ledger (Xero, by invoice id), the checks mailbox the pre-start
 * form app emails each completed check into, the Raise tab every other surface
 * appends to, the routing table the owner wrote, the one queue of exceptions
 * and the morning summary.
 *
 * It only records: nothing in it decides a verdict. Every port call lands in
 * `calls` with its verb and subject.
 *
 * Runner side (the build never calls these): `mailCheck()` is a tech finishing
 * a daily check in the form app, `raise()` appends a row to the Raise tab,
 * `at()` and `advance()` move the clock, `closeByPerson()` is the named owner
 * closing an item on the queue's screen, and `chaseHeld()` is what a chase
 * standard reads before it acts on an invoice.
 *
 * Job ids, asset ids, regos, invoice ids, names and addresses are made up.
 * Nothing here is a real business, vehicle or person.
 */

const SHAPE = {
  read_checks: ["read", "message"],
  read_inbox: ["read", "message"],
  read_job: ["read", "job"],
  read_asset: ["read", "asset"],
  read_ledger: ["read", "ledger"],
  read_rule: ["read", "rule"],
  list_exceptions: ["read", "exception"],
  raise_exception: ["write", "exception"],
  file_check: ["write", "record"],
  send_message: ["say", "message"],
  notify: ["say", "alert"],
  escalate: ["say", "handoff"],
  read_report: ["read", "report"],
  publish_report: ["say", "report"],
};

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const JOB_SYSTEMS = ["simpro", "servicem8", "aroflo", "fergus"];

export class CheckWorld {
  /**
   * @param {object} o
   * @param {Date} [o.now]
   * @param {Array<object>} [o.jobs]      jobs by id, each with its system
   * @param {Array<object>} [o.assets]    vehicles held as assets, each with its system
   * @param {Array<object>} [o.invoices]  Xero invoices by id
   * @param {object} [o.routing]          the routing table the owner wrote
   * @param {boolean} [o.failNextFile]    the job system returns no attachment id on the next filing
   * @param {boolean} [o.failNextRaise]   the queue returns no id on the next write
   */
  constructor(o = {}) {
    this.clock = o.now ?? new Date("2026-11-02T20:30:00.000Z"); // Tue 6:30am Brisbane
    this.jobs = new Map((o.jobs ?? []).map((j) => [`${j.system}|${j.id}`, { attachments: [], ...clone(j) }]));
    this.assets = new Map((o.assets ?? []).map((a) => [`${a.system}|${a.id}`, { attachments: [], ...clone(a) }]));
    this.invoices = new Map((o.invoices ?? []).map((i) => [i.id, { ...i }]));
    this.routing = o.routing ?? { rows: [], summary_at: "07:00", time_zone: "Australia/Brisbane" };
    this.failNextFile = o.failNextFile ?? false;
    this.failNextRaise = o.failNextRaise ?? false;
    /** the checks mailbox */
    this.mailbox = [];
    /** the Raise tab */
    this.inbox = [];
    /** the one queue */
    this.queue = [];
    this.sent = [];
    this.alerts = [];
    this.escalations = [];
    this.reports = [];
    this.calls = [];
    this.seq = 0;
    this.raiseSeq = 0;
    this.mailSeq = 0;
  }

  // ── runner side ──

  at(iso) {
    this.clock = new Date(iso);
  }

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A tech finishes a daily check in the form app, which emails it in. */
  mailCheck(form, from = { name: "Josh Nguyen", email: "josh@example-plumbing.com.au" }) {
    const m = { message_id: `MSG-${++this.mailSeq}`, received_at: this.clock.toISOString(), from: clone(from), form: clone(form), read: false };
    this.mailbox.push(m);
    return m.message_id;
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

  /** What Debtor Chasing reads before it chases an invoice: true means hold. */
  chaseHeld(invoiceId) {
    return this.queue.some(
      (i) => i.status === "open" && i.record?.external_id === invoiceId && (i.stop_chase === "dispute" || i.stop_chase === "hardship"),
    );
  }

  get open() {
    return this.queue.filter((i) => i.status === "open");
  }

  attachmentsOn(system, kind, id) {
    const rec = (kind === "asset" ? this.assets : this.jobs).get(`${system}|${id}`);
    return rec ? rec.attachments : [];
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

      /** Unread check emails, with the form the app attached. Reading marks them read. */
      readChecks: async () => {
        const rows = this.mailbox.filter((m) => !m.read);
        for (const m of rows) m.read = true;
        const out = rows.map(({ read, ...m }) => m);
        this.record("read_checks", { mailbox: "checks", unread: true }, out);
        return clone(out);
      },

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
        const job = JOB_SYSTEMS.includes(system) ? this.jobs.get(`${system}|${id}`) : null;
        const out = job ? { system, kind: "job", id: job.id, site: job.site, status: job.status ?? "In Progress" } : null;
        this.record("read_job", { system, id }, out);
        return clone(out);
      },

      /** A vehicle by the asset id the job system issued. Null if it does not hold it. */
      readAsset: async (system, id) => {
        const a = JOB_SYSTEMS.includes(system) ? this.assets.get(`${system}|${id}`) : null;
        const out = a ? { system, kind: "asset", id: a.id, rego: a.rego, description: a.description } : null;
        this.record("read_asset", { system, id }, out);
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
       * fields into an existing one. Returns the item id it holds, or null.
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

      /**
       * File a completed check as an attachment on the job or the vehicle's
       * asset record. Keyed, so a retried email does not file it twice.
       * Returns the attachment id the job system issued, or null.
       */
      fileCheck: async (system, kind, recordId, doc, key) => {
        const rec = (kind === "asset" ? this.assets : this.jobs).get(`${system}|${recordId}`);
        let id = null;
        if (this.failNextFile) {
          this.failNextFile = false;
        } else if (rec) {
          const existing = rec.attachments.find((a) => a.key === key);
          if (existing) id = existing.id;
          else {
            id = `ATT-${recordId}-${rec.attachments.length + 1}`;
            rec.attachments.push({ id, key, ...clone(doc), at: this.clock.toISOString() });
          }
        }
        this.record("file_check", { system, kind, recordId, doc, key }, { id });
        return { id };
      },

      /** Sending a message outside the business. The desk is never meant to call this. */
      sendMessage: async (msg) => {
        this.sent.push(clone(msg));
        this.record("send_message", msg, { ok: true });
        return { ok: true };
      },

      /** A message to a named person, or back to whoever raised a row or sent a check. */
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

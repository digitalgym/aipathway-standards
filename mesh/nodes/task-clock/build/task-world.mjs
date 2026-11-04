/**
 * The world Task Clock is tested in: the job system (ServiceM8, by job id),
 * the ledger (Xero, by invoice or quote id), the Tasks tab every person, sheet
 * and bot appends to, the routing table the owner wrote, the one task list,
 * and the morning list.
 *
 * It only records. Nothing in it decides a verdict. Every port call lands in
 * `calls` as { at, port, verb, subject, request, response }.
 *
 * Runner side (the build never calls these): `add()` appends a row to the
 * Tasks tab, `at()` moves the clock, `tickOff()` is a person ticking a task
 * off on the list's screen with what they did, and `chaseHeld()` is what a
 * chase standard reads before it acts on an invoice.
 *
 * Every id, name and address is made up. Nothing here is a real customer.
 */

const SHAPE = {
  read_tasks_tab: ["read", "message"],
  read_job: ["read", "job"],
  read_ledger: ["read", "ledger"],
  read_routing: ["read", "rule"],
  list_tasks: ["read", "exception"],
  write_task: ["write", "exception"],
  send_message: ["say", "message"],
  notify: ["say", "alert"],
  nudge: ["say", "handoff"],
  read_list: ["read", "report"],
  publish_list: ["say", "report"],
};

const copy = (v) => (v === undefined ? undefined : structuredClone(v));

export class TaskWorld {
  constructor(o = {}) {
    this.clock = o.now ?? new Date("2026-11-03T08:30:00+10:00");
    this.jobs = new Map((o.jobs ?? []).map((j) => [j.id, { ...j }]));
    this.ledger = new Map((o.ledger ?? []).map((r) => [r.id, { ...r }]));
    this.routing = o.routing ?? { rows: [], list_at: "07:30", time_zone: "Australia/Brisbane" };
    this.tab = [];
    this.tasks = [];
    this.lists = [];
    this.calls = [];
    this.n = 0;
    this.rowN = 0;
  }

  // runner side
  at(iso) {
    this.clock = new Date(iso);
  }

  add(row) {
    const r = { row_id: `ROW-${++this.rowN}`, added_at: this.clock.toISOString(), ...copy(row), seen: false };
    this.tab.push(r);
    return r.row_id;
  }

  tickOff(id, by, outcome) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t || t.status !== "open") return false;
    t.status = "closed";
    t.closed = { by, at: this.clock.toISOString(), outcome };
    return true;
  }

  chaseHeld(invoiceId) {
    return this.tasks.some((t) => t.status === "open" && t.record?.external_id === invoiceId && Boolean(t.stop_chase));
  }

  get open() {
    return this.tasks.filter((t) => t.status === "open");
  }

  log(port, request, response) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: copy(request), response: copy(response) });
  }

  // the build's only door
  ports() {
    return {
      now: () => new Date(this.clock),

      readTasksTab: async () => {
        const rows = this.tab.filter((r) => !r.seen);
        for (const r of rows) r.seen = true;
        const out = rows.map(({ seen, ...r }) => r);
        this.log("read_tasks_tab", { tab: "Tasks", unseen: true }, out);
        return copy(out);
      },

      readJob: async (system, id) => {
        const j = system === "servicem8" ? this.jobs.get(id) : null;
        const out = j ? { system, id: j.id, customer: j.customer, site: j.site } : null;
        this.log("read_job", { system, id }, out);
        return copy(out);
      },

      readLedger: async (system, id) => {
        const r = system === "xero" ? this.ledger.get(id) : null;
        const out = r ? { system, id: r.id, kind: r.kind, contact: r.contact, status: r.status } : null;
        this.log("read_ledger", { system, id }, out);
        return copy(out);
      },

      readRouting: async () => {
        this.log("read_routing", { tab: "Routing" }, this.routing);
        return copy(this.routing);
      },

      listTasks: async (filter = {}) => {
        const out = this.tasks.filter(
          (t) =>
            (filter.status === undefined || t.status === filter.status) &&
            (filter.type === undefined || t.type === filter.type) &&
            (filter.system === undefined || t.record.system === filter.system) &&
            (filter.external_id === undefined || t.record.external_id === filter.external_id),
        );
        this.log("list_tasks", filter, out);
        return copy(out);
      },

      /** create writes a new open task; update merges fields. Returns the id the list holds, or null. */
      writeTask: async (w) => {
        let id = null;
        if (w.op === "create") {
          const t = { ...copy(w.task), id: `T-${++this.n}` };
          this.tasks.push(t);
          id = t.id;
        } else if (w.op === "update") {
          const t = this.tasks.find((x) => x.id === w.id);
          if (t) {
            Object.assign(t, copy(w.fields));
            id = t.id;
          }
        }
        this.log("write_task", w, { id });
        return { id };
      },

      /** Sending to a customer. Task Clock is never meant to call this. */
      sendMessage: async (m) => {
        this.log("send_message", m, { ok: true });
        return { ok: true };
      },

      notify: async (to, about, text) => {
        this.log("notify", { to, about, text }, { ok: true });
      },

      /** The one late nudge on a task. */
      nudge: async (to, taskId, text) => {
        this.log("nudge", { to, taskId, text }, { ok: true });
      },

      readList: async (day) => {
        const l = this.lists.find((x) => x.day === day) ?? null;
        this.log("read_list", { day }, l ? { id: l.id } : null);
        return l ? { id: l.id } : null;
      },

      publishList: async (list) => {
        const id = `LIST-${list.day}`;
        this.lists.push({ id, ...copy(list) });
        this.log("publish_list", list, { id });
        return { id };
      },
    };
  }
}

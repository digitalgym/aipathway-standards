/**
 * The world Arrival Brief is tested in: a plumbing business's job system (its
 * slots, jobs, site history, quotes and asset records), the techs' agreed
 * channels, the delivery log the brief keeps on a thin seam mirror, and the
 * exception desk.
 *
 * The package has no world for Job Brief, so this is one, written to the
 * runner's contract: `ports()` hands the build its only doors, every door
 * records a port call, and `calls` is the trace the scenarios assert on.
 *
 * The job system does NOT scope a site's history by customer for you: a read
 * by site alone returns every customer who ever lived there. The build has to
 * ask by the job's own customer id.
 *
 * There is no port that writes to a job, a slot, a quote or a note. A build
 * cannot change the job system by accident, because it has no door to do it.
 *
 * The runner's side (the methods outside `ports()`) is the stimulus: a slot
 * moved, a record deleted, a setting changed, time passing. The build never
 * calls those.
 *
 * The business is in Queensland (AEST, UTC+10, no daylight saving). Mobiles
 * are from ACMA's fictitious range (0491 570 xxx). Everything here is made up.
 */

const SHAPE = {
  read_rule: ["read", "rule"],
  read_slots: ["read", "slot"],
  read_job: ["read", "job"],
  read_history: ["read", "history"],
  read_quote: ["read", "quote"],
  read_asset: ["read", "asset"],
  cite: ["read", "record"],
  gate: ["read", "channel"],
  notify: ["say", "brief"],
  read_deliveries: ["read", "seam"],
  write_delivery: ["write", "seam"],
  read_exceptions: ["read", "exception"],
  raise_exception: ["write", "exception"],
};

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const SYSTEM = "ServiceM8";
export const OFFICE_MANAGER = "Priya Nair";
export const SCHEDULER = "Tom Walsh";
export const MIA = { tech_id: "T-MIA", name: "Mia Russo", channel: "sms:+61491570110" };
export const SAM = { tech_id: "T-SAM", name: "Sam Okafor", channel: null };
export const LENA = { tech_id: "T-LENA", name: "Lena Park", channel: "email:lena@example.com.au" };

/** 8pm AEST on Wednesday 4 November 2026: the evening run that briefs Thursday. */
export const EVENING = new Date("2026-11-04T10:00:00.000Z");
export const BRIEF_DAY = "2026-11-05";

export class BriefWorld {
  /**
   * @param {object} [opts]
   * @param {Date} [opts.now]
   * @param {object} [opts.settings]   customer_notes, send_by, prepare_from, max_line
   * @param {Array<object>} [opts.techs]
   * @param {Array<object>} [opts.jobs]      { job_id, customer_id, site_id, address, description }
   * @param {Array<object>} [opts.slots]     { slot_id, job_id, tech_id, date, start, end }
   * @param {Array<object>} [opts.records]   { record_id, kind, customer_id, site_id, job_id?, text, author, at }
   * @param {Array<object>} [opts.quotes]    { quote_id, customer_id, site_id, status, description, total, at }
   * @param {Array<object>} [opts.assets]    { asset_id, customer_id, site_id, text, at }
   */
  constructor(opts = {}) {
    this.clock = opts.now ?? new Date(EVENING);
    this.settings = { customer_notes: "quote", send_by: "06:00", prepare_from: "18:00", max_line: 60, ...(opts.settings ?? {}) };
    this.techs = clone(opts.techs ?? [MIA, SAM, LENA]);
    this.jobs = clone(opts.jobs ?? []);
    this.slots = clone(opts.slots ?? []);
    this.records = clone(opts.records ?? []);
    this.quotes = clone(opts.quotes ?? []);
    this.assets = clone(opts.assets ?? []);
    this.deliveries = [];
    this.exceptions = [];
    this.sent = [];
    this.calls = [];
    /** fault queue for notify: "lost" means the message went nowhere and no id came back */
    this.notifyFaults = [];
    this.seq = 0;
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  moveSlot(slotId, start, end) {
    const s = this.slots.find((x) => x.slot_id === slotId);
    s.start = start;
    s.end = end;
  }

  deleteRecord(recordId) {
    this.records = this.records.filter((r) => r.record_id !== recordId);
  }

  setSetting(key, value) {
    this.settings[key] = value;
  }

  /** A person closes an exception on the desk. */
  closeException(exceptionId) {
    const e = this.exceptions.find((x) => x.exception_id === exceptionId);
    if (e) e.open = false;
  }

  /** Any record the job system holds, of any kind, by id. */
  lookup(recordId) {
    return (
      this.records.find((r) => r.record_id === recordId) ??
      this.quotes.find((q) => q.quote_id === recordId) ??
      this.assets.find((a) => a.asset_id === recordId) ??
      null
    );
  }

  callsOf(port) {
    return this.calls.filter((c) => c.port === port);
  }

  // ── Internals. ──

  #rec(port, request, response) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response) });
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    const w = this;
    const scoped = (list, q) =>
      list.filter((r) => r.site_id === q.site_id && (q.customer_id === undefined || q.customer_id === null || r.customer_id === q.customer_id));
    return {
      now: () => new Date(w.clock),

      readRule: () => {
        const rule = {
          system: SYSTEM,
          timezone_offset_minutes: 600,
          ...clone(w.settings),
          owners: { channels: OFFICE_MANAGER, jobs: SCHEDULER, delivery: OFFICE_MANAGER },
        };
        w.#rec("read_rule", {}, rule);
        return rule;
      },

      /** The slots on a day, every tech. With no date, every slot the system holds. */
      readSlots: (date) => {
        const out = w.slots.filter((s) => date === undefined || s.date === date);
        w.#rec("read_slots", { date }, out);
        return clone(out);
      },

      readJob: (jobId) => {
        const j = w.jobs.find((x) => x.job_id === jobId) ?? null;
        w.#rec("read_job", { job_id: jobId }, j);
        return clone(j);
      },

      /** Hazard, access, visit, note and parts records at a site. Scoped by customer only if asked. */
      readHistory: (q) => {
        const out = scoped(w.records, q);
        w.#rec("read_history", q, out.map((r) => r.record_id));
        return clone(out);
      },

      readQuotes: (q) => {
        const out = scoped(w.quotes, q);
        w.#rec("read_quote", q, out.map((r) => r.quote_id));
        return clone(out);
      },

      readAssets: (q) => {
        const out = scoped(w.assets, q);
        w.#rec("read_asset", q, out.map((r) => r.asset_id));
        return clone(out);
      },

      /** Read one record back by id, the moment a line is about to cite it. */
      cite: (system, recordId) => {
        const r = system === SYSTEM ? w.lookup(recordId) : null;
        const out = r ? { record: recordId, customer_id: r.customer_id, at: r.at ?? null } : null;
        w.#rec("cite", { system, record: recordId }, out);
        return clone(out);
      },

      /** The channel a tech agreed to, or null. */
      gate: (techId) => {
        const t = w.techs.find((x) => x.tech_id === techId);
        const out = { tech_id: techId, channel: t?.channel ?? null };
        w.#rec("gate", { tech_id: techId }, out);
        return out;
      },

      /** Send one brief. Refused unless the channel is the one the tech agreed to. */
      notify: (techId, channel, brief, key) => {
        const t = w.techs.find((x) => x.tech_id === techId);
        let out;
        if (!t || !t.channel || t.channel !== channel) out = { report_id: null, refused: "not the tech's agreed channel" };
        else if (w.notifyFaults.length) {
          w.notifyFaults.shift();
          out = { report_id: null };
        } else {
          const report_id = `MSG-${++w.seq}`;
          w.sent.push({ report_id, tech_id: techId, channel, brief: clone(brief), key, at: w.clock.toISOString() });
          out = { report_id };
        }
        w.#rec("notify", { tech_id: techId, channel, brief, key }, out);
        return out;
      },

      readDeliveries: (techId, forDate) => {
        const out = w.deliveries.filter((d) => d.tech_id === techId && d.for_date === forDate);
        w.#rec("read_deliveries", { tech_id: techId, for_date: forDate }, out);
        return clone(out);
      },

      writeDelivery: (row) => {
        const delivery_id = `DLV-${++w.seq}`;
        w.deliveries.push({ delivery_id, ...clone(row) });
        w.#rec("write_delivery", row, { delivery_id });
        return { delivery_id };
      },

      readExceptions: (ref) => {
        const out = w.exceptions.filter((e) => e.ref === ref && e.open);
        w.#rec("read_exceptions", { ref }, out);
        return clone(out);
      },

      raiseException: (e) => {
        const exception_id = `EXC-${++w.seq}`;
        w.exceptions.push({ exception_id, open: true, raised_at: w.clock.toISOString(), ...clone(e) });
        w.#rec("raise_exception", e, { exception_id });
        return { exception_id };
      },
    };
  }
}

/** Two businesses side by side, for a check that needs the same build under two settings. */
export class PairWorld {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  get calls() {
    return [...this.a.calls, ...this.b.calls];
  }
  ports() {
    return this.a.ports();
  }
}

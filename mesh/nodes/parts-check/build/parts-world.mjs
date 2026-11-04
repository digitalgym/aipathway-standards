/**
 * The world Parts Check is tested in: a Cairns plumbing business the afternoon
 * before a working day. Its job system holds tomorrow's dispatched board, each
 * job's accepted quote lines and materials, and a written needs template per
 * job type. The van counts and the shelf live in a stock sheet, each van with
 * the time it was counted. The supplier list carries each supplier's lead time
 * and the codes it lists. Shortfalls go to Material Order's path. The build
 * keeps its own Result and TechMessage rows on a thin seam mirror, and flags go
 * to the business's one exception desk.
 *
 * The package has no world for Parts Ready, so this is one, written to the
 * runner's contract: `ports()` hands the build its only doors, every door
 * records a port call, and `calls` is the trace the scenarios assert on.
 *
 * Two things in here are deliberately unforgiving:
 *   - the shelf refuses a reservation it cannot cover;
 *   - Material Order's path does NOT deduplicate: two requests are two
 *     purchase orders, so a re-run that asks again shows up as a second order.
 *
 * There is no door that writes a purchase order directly, changes a job's
 * parts list, or edits a van count. A build cannot do those by accident.
 *
 * The runner's side (the methods outside `ports()`) is the stimulus: a job
 * added to the board, time passing, an exception closed. The build never calls
 * those.
 *
 * Queensland time (AEST, UTC+10, no daylight saving). Everything here is made up.
 */

const SHAPE = {
  read_rule: ["read", "rule"],
  read_board: ["read", "job"],
  read_job: ["read", "job"],
  read_template: ["read", "rule"],
  read_van: ["read", "asset"],
  read_shelf: ["read", "asset"],
  reserve: ["write", "reservation"],
  read_contacts: ["read", "contacts"],
  write_order: ["write", "order"],
  read_results: ["read", "seam"],
  write_result: ["write", "seam"],
  read_messages: ["read", "seam"],
  notify: ["say", "alert"],
  read_exceptions: ["read", "exception"],
  raise_exception: ["write", "exception"],
  publish_report: ["say", "report"],
};

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const SERVICE_MANAGER = "Priya Nair";
export const MIA = "T-MIA";
export const SAM = "T-SAM";
export const LENA = "T-LENA";

/** 2pm AEST on Wednesday 4 November 2026: the afternoon run that checks Thursday. */
export const AFTERNOON = new Date("2026-11-04T04:00:00.000Z");
export const FOR_DATE = "2026-11-05";
/** The business's cut-off, 3pm AEST. */
export const CUTOFF = new Date("2026-11-04T05:00:00.000Z");

export const at = (hm, date = FOR_DATE) => `${date}T${hm}:00+10:00`;
export const FRESH = "2026-11-04T06:45:00+10:00";
export const STALE = "2026-11-01T16:00:00+10:00";

export class PartsWorld {
  /**
   * @param {object} [opts]
   * @param {Date} [opts.now]
   * @param {object} [opts.settings]   cutoff, van_stale_hours, exception_owner, utc_offset_minutes
   * @param {Array<object>} [opts.slots]      { job_external_id, tech_id, date, start, job_type, address }
   * @param {Array<object>} [opts.jobs]       { job_external_id, description, quote_lines[], materials[] }
   * @param {object} [opts.templates]         { [job_type]: lines[] }
   * @param {Array<object>} [opts.vans]       { tech_id, as_of, lines[] }
   * @param {Array<object>} [opts.shelf]      { catalogue_code, on_hand, reserved, location, stands_in_for? }
   * @param {Array<object>} [opts.suppliers]  { supplier_id, name, lead_hours, codes[] }
   * @param {boolean} [opts.orderFails]       Material Order's path returns no purchase order id
   */
  constructor(opts = {}) {
    this.clock = opts.now ?? new Date(AFTERNOON);
    this.settings = { cutoff: "15:00", van_stale_hours: 24, exception_owner: SERVICE_MANAGER, utc_offset_minutes: 600, ...(opts.settings ?? {}) };
    this.slots = clone(opts.slots ?? []);
    this.jobs = clone(opts.jobs ?? []);
    this.templates = clone(opts.templates ?? {});
    this.vans = clone(opts.vans ?? []);
    this.shelf = clone(opts.shelf ?? []);
    this.suppliers = clone(opts.suppliers ?? []);
    this.orderFails = opts.orderFails ?? false;
    this.reservations = [];
    this.orders = [];
    this.results = [];
    this.messages = [];
    this.exceptions = [];
    this.reports = [];
    this.calls = [];
    this.seq = 0;
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  addJob(slot, job) {
    this.slots.push(clone(slot));
    this.jobs.push(clone(job));
  }

  closeException(exceptionId) {
    const e = this.exceptions.find((x) => x.exception_id === exceptionId);
    if (e) e.open = false;
  }

  callsOf(port) {
    return this.calls.filter((c) => c.port === port);
  }

  jobOf(id) {
    return this.jobs.find((j) => j.job_external_id === id);
  }

  // ── Internals. ──

  #id(prefix) {
    return `${prefix}-${++this.seq}`;
  }

  #rec(port, request, response) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response) });
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    const w = this;
    return {
      now: () => new Date(w.clock),

      readRule: () => {
        const rule = clone(w.settings);
        w.#rec("read_rule", {}, rule);
        return rule;
      },

      /** Tomorrow's dispatched board: slots by job id with the assigned tech. With no date, every slot. */
      readBoard: (date) => {
        const out = w.slots.filter((s) => date === undefined || s.date === date);
        w.#rec("read_board", { date }, out);
        return clone(out);
      },

      /** One job by its id: accepted quote lines, the job's own materials, its description. */
      readJob: (jobId) => {
        const j = w.jobs.find((x) => x.job_external_id === jobId) ?? null;
        w.#rec("read_job", { job_external_id: jobId }, j);
        return clone(j);
      },

      /** The written needs template for a job type, or null. */
      readTemplate: (jobType) => {
        const t = w.templates[jobType] ?? null;
        w.#rec("read_template", { job_type: jobType }, t);
        return clone(t);
      },

      /** One tech's van count, with the time it was counted. */
      readVan: (techId) => {
        const v = w.vans.find((x) => x.tech_id === techId) ?? { tech_id: techId, as_of: null, lines: [] };
        w.#rec("read_van", { tech_id: techId }, v);
        return clone(v);
      },

      /** The shelf, as of now. */
      readShelf: () => {
        const out = { as_of: w.clock.toISOString(), items: w.shelf };
        w.#rec("read_shelf", {}, out);
        return clone(out);
      },

      /** Reserve shelf stock to a job. Refused if the shelf cannot cover it. */
      reserve: ({ for_date, job_external_id, catalogue_code, qty }) => {
        const item = w.shelf.find((s) => s.catalogue_code === catalogue_code);
        let out = null;
        if (item && item.on_hand - item.reserved >= qty && qty > 0) {
          item.reserved += qty;
          const r = { reservation_id: w.#id("RSV"), for_date, job_external_id, catalogue_code, qty, location: item.location };
          w.reservations.push(r);
          out = clone(r);
        }
        w.#rec("reserve", { for_date, job_external_id, catalogue_code, qty }, out);
        return out;
      },

      /** The suppliers the business buys from: lead time and the codes each lists. */
      readSuppliers: () => {
        const out = w.suppliers;
        w.#rec("read_contacts", {}, out);
        return clone(out);
      },

      /**
       * Hand a request to Material Order's path. It prices, applies the
       * threshold and approved-supplier rules, and returns a purchase order id
       * held for release. It does NOT deduplicate: every request is an order.
       */
      requestOrder: (req) => {
        let out;
        if (w.orderFails) out = { po_external_id: null };
        else {
          const sup = w.suppliers.find((s) => s.supplier_id === req.supplier_id);
          const eta = sup ? new Date(w.clock.getTime() + sup.lead_hours * 3_600_000).toISOString() : null;
          const po = { po_external_id: w.#id("PO"), supplier_id: req.supplier_id, lines: clone(req.lines), eta, status: "held_for_release" };
          w.orders.push(po);
          out = { po_external_id: po.po_external_id, eta, status: po.status };
        }
        w.#rec("write_order", req, out);
        return clone(out);
      },

      /** The build's own Result rows for a date, read back from the seam mirror. */
      readResults: (forDate) => {
        const out = w.results.filter((r) => r.for_date === forDate);
        w.#rec("read_results", { for_date: forDate }, out);
        return clone(out);
      },

      /** Write or update one Result, keyed on (for_date, job, catalogue_code). */
      writeResult: (row) => {
        const key = (r) => `${r.for_date}|${r.job_external_id}|${r.catalogue_code}`;
        const existing = w.results.find((r) => key(r) === key(row));
        let out;
        if (existing) {
          Object.assign(existing, clone(row));
          out = { result_id: existing.result_id };
        } else {
          const r = { ...clone(row), result_id: w.#id("RES") };
          w.results.push(r);
          out = { result_id: r.result_id };
        }
        w.#rec("write_result", row, out);
        return out;
      },

      readMessages: (forDate) => {
        const out = w.messages.filter((m) => m.for_date === forDate);
        w.#rec("read_messages", { for_date: forDate }, out);
        return clone(out);
      },

      /** One message to a tech about one job. Returns a message id. */
      notify: (msg) => {
        const m = { ...clone(msg), message_id: w.#id("MSG"), sent_at: w.clock.toISOString() };
        w.messages.push(m);
        w.#rec("notify", msg, { message_id: m.message_id });
        return { message_id: m.message_id };
      },

      /** Exceptions on a job, open or closed. */
      readExceptions: (jobId) => {
        const out = w.exceptions.filter((e) => e.job_external_id === jobId);
        w.#rec("read_exceptions", { job_external_id: jobId }, out);
        return clone(out);
      },

      raiseException: (e) => {
        const x = { ...clone(e), exception_id: w.#id("EXC"), open: true };
        w.exceptions.push(x);
        w.#rec("raise_exception", e, { exception_id: x.exception_id });
        return { exception_id: x.exception_id };
      },

      /** Publish the run's result for the date. Republished in place on a re-run. */
      publishReport: (report) => {
        const existing = w.reports.find((r) => r.for_date === report.for_date);
        const report_id = existing?.report_id ?? w.#id("RPT");
        const r = { ...clone(report), report_id, published_at: w.clock.toISOString() };
        if (existing) Object.assign(existing, r);
        else w.reports.push(r);
        w.#rec("publish_report", report, { report_id, published_at: r.published_at });
        return { report_id };
      },
    };
  }
}

/** Two worlds driven one after the other; the trace is both, in order. */
export class PairWorld {
  constructor(a, b) {
    this.a = a;
    this.b = b;
  }
  ports() {
    return this.a.ports();
  }
  get calls() {
    return [...this.a.calls, ...this.b.calls];
  }
}

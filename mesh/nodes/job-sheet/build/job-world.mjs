/**
 * The world Job Sheet is tested in: a plumbing business's job system, its
 * price book, the close inbox the techs message from site, the techs' phones,
 * the exception desk and the close record.
 *
 * The package has no world for Job Close, so this is one, written to the
 * runner's contract: `ports()` hands the build its only doors, every door
 * records a port call, and `calls` is the trace the scenarios assert on.
 *
 * The runner's side (the methods outside `ports()`) is the stimulus: a capture
 * arriving from site, a reply from a phone, a price changed in the book, a
 * write whose answer is lost on a bad signal. The build never calls those.
 *
 * Mobile numbers are from ACMA's fictitious range (0491 570 xxx). The business,
 * the techs and the jobs are made up; nothing here is a real customer.
 */

/** verb and subject for every port this world records, so the trace is uniform. */
const SHAPE = {
  read_rule: ["read", "rule"],
  read_inbox: ["read", "message"],
  read_job: ["read", "job"],
  read_pricebook: ["read", "pricebook"],
  read_log: ["read", "log"],
  read_exceptions: ["read", "exception"],
  evidence: ["attach", "evidence"],
  read_evidence: ["read", "evidence"],
  send_sms: ["say", "sms"],
  close_job: ["write", "card"],
  write_job: ["write", "job"],
  raise_exception: ["write", "exception"],
  write_log: ["write", "log"],
};

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const TENANT = "harbour";
export const MIA = { tech_id: "T-MIA", name: "Mia Russo", mobile: "+61491570110" };
export const SAM = { tech_id: "T-SAM", name: "Sam Okafor", mobile: "+61491570111" };
export const OFFICE_MANAGER = { name: "Priya Nair", mobile: "+61491570156" };
export const VARIATION_PRICER = "Tom Walsh";
export const SUPERVISOR = "Kerry Doyle";

/** The business's own price book. Prices are ex GST, in dollars. */
export function harbourBook() {
  return [
    { code: "TMV15", name: "Tempering valve 15mm", aliases: ["tempering valve"], unit_price: 189.0 },
    { code: "CU15-ELB", name: "15mm copper elbow", aliases: ["15 mil elbow", "15mm elbow"], unit_price: 6.4 },
    { code: "FLX-300", name: "Flexi hose 300mm", aliases: ["flexi hose 300"], unit_price: 14.5 },
    { code: "FLX-450", name: "Flexi hose 450mm", aliases: ["flexi hose 450"], unit_price: 17.9 },
    { code: "HWS-ANODE", name: "Hot water anode", aliases: ["anode", "sacrificial anode"], unit_price: 92.0 },
    { code: "RV-850", name: "Relief valve 850kPa", aliases: ["relief valve", "ptr valve"], unit_price: 64.0 },
    { code: "LAB-HR", name: "Labour, per hour", aliases: ["labour"], unit_price: 128.0, kind: "labour" },
  ];
}

export class JobWorld {
  /**
   * @param {object} [opts]
   * @param {Date} [opts.now]
   * @param {Array<object>} [opts.jobs]
   * @param {Array<object>} [opts.book]
   */
  constructor(opts = {}) {
    this.clock = opts.now ?? new Date("2026-11-04T03:00:00.000Z"); // 2pm in Sydney
    /** @type {Map<string, object>} job_id -> job */
    this.jobs = new Map();
    for (const j of opts.jobs ?? []) this.jobs.set(j.job_id, { status: "Work Order", cards: new Map(), upstream_exceptions: [], ...j });
    this.book = opts.book ?? harbourBook();
    /** @type {Array<{code:string,unit_price:number,at:string}>} every price the book has held, with when */
    this.priceHistory = this.book.map((l) => ({ code: l.code, unit_price: l.unit_price, at: this.clock.toISOString() }));
    this.inbox = [];
    this.sms = [];
    this.exceptions = [];
    this.evidenceStore = new Map();
    this.log = [];
    this.calls = [];
    /** job_id -> queue of faults for the next close_job calls: "lost" (lands, answer lost) or "refused" */
    this.faults = new Map();
    this.msgSeq = 0;
    this.excSeq = 0;
    this.idSeq = 0;
  }

  // ── The runner's side. The build never calls these. ──

  advance(ms) {
    this.clock = new Date(this.clock.getTime() + ms);
  }

  /** A tech sends what they did from site. Returns the capture's message id. */
  capture(from, c) {
    const message_id = `MSG-${++this.msgSeq}`;
    this.inbox.push({
      message_id,
      kind: "capture",
      from,
      at: this.clock.toISOString(),
      job_number: c.job_number,
      transcript: c.transcript,
      notes: c.notes ?? null,
      photos: c.photos ?? [],
      parts_used: c.parts_used ?? [],
      labour_hours: c.labour_hours ?? 0,
    });
    return message_id;
  }

  /** A text arrives from a phone, e.g. "YES D-MSG-1". */
  reply(from, text) {
    const message_id = `MSG-${++this.msgSeq}`;
    this.inbox.push({ message_id, kind: "reply", from, at: this.clock.toISOString(), text });
    return message_id;
  }

  /** The office changes a price in the book. */
  setPrice(code, unit_price) {
    const line = this.book.find((l) => l.code === code);
    line.unit_price = unit_price;
    this.priceHistory.push({ code, unit_price, at: this.clock.toISOString() });
  }

  /** The next close_job for this job fails this way. */
  fault(jobId, ...kinds) {
    this.faults.set(jobId, [...(this.faults.get(jobId) ?? []), ...kinds]);
  }

  /** The book's price for a code as it stood at an instant. */
  priceAt(code, iso) {
    const t = Date.parse(iso);
    const seen = this.priceHistory.filter((p) => p.code === code && Date.parse(p.at) <= t);
    return seen.length ? seen[seen.length - 1].unit_price : undefined;
  }

  callsOf(port) {
    return this.calls.filter((c) => c.port === port);
  }

  // ── Internals. ──

  #rec(port, request, response, extra = {}) {
    const [verb, subject] = SHAPE[port];
    this.calls.push({ at: this.clock.toISOString(), port, verb, subject, request: clone(request), response: clone(response), ...extra });
  }

  #publicJob(job) {
    return {
      job_id: job.job_id,
      status: job.status,
      assigned_techs: clone(job.assigned_techs),
      quote: clone(job.quote ?? null),
      open_exceptions: clone(job.upstream_exceptions.filter((e) => e.open)),
      cards: [...job.cards.values()].map(clone),
    };
  }

  /** Hand this to the build. It is the only door. */
  ports() {
    const w = this;
    return {
      now: () => new Date(w.clock),

      readRule: () => {
        const rule = {
          tenant: TENANT,
          confirm_window_minutes: 120,
          owners: { office_manager: OFFICE_MANAGER.name, variation_pricer: VARIATION_PRICER },
          supervisors: { [MIA.tech_id]: SUPERVISOR, [SAM.tech_id]: SUPERVISOR },
        };
        w.#rec("read_rule", {}, rule);
        return clone(rule);
      },

      readInbox: () => {
        const out = clone(w.inbox);
        w.#rec("read_inbox", {}, { count: out.length });
        return out;
      },

      readJob: (jobId) => {
        const job = w.jobs.get(jobId);
        const out = job ? w.#publicJob(job) : null;
        w.#rec("read_job", { job_id: jobId }, out, { jobId });
        return clone(out);
      },

      readPricebook: () => {
        const out = clone(w.book);
        w.#rec("read_pricebook", {}, out);
        return out;
      },

      storeEvidence: (captureId, jobId, copy) => {
        const evidence_id = `EV-${captureId}`;
        if (!w.evidenceStore.has(captureId)) w.evidenceStore.set(captureId, { evidence_id, job_id: jobId, copy: clone(copy), at: w.clock.toISOString() });
        w.#rec("evidence", { capture_id: captureId, job_id: jobId, copy }, { evidence_id }, { jobId, captureId });
        return { evidence_id };
      },

      readEvidence: (captureId) => {
        const e = w.evidenceStore.get(captureId) ?? null;
        w.#rec("read_evidence", { capture_id: captureId }, e ? { evidence_id: e.evidence_id } : null, { captureId });
        return clone(e);
      },

      sendSms: (to, text, meta = {}) => {
        w.sms.push({ to, text, at: w.clock.toISOString(), ...meta });
        w.#rec("send_sms", { to, text, ...meta }, { ok: true }, { jobId: meta.job_id, captureId: meta.capture_id });
        return { ok: true };
      },

      /**
       * The job system's write: the note, the lines and the photos, kept once per
       * intent id. A second call with an intent it already holds returns the ids
       * of the card it has.
       */
      closeJob: (req) => {
        const job = w.jobs.get(req.job_external_id);
        const queue = w.faults.get(req.job_external_id) ?? [];
        const fault = queue.shift();
        const extra = { jobId: req.job_external_id, intentId: req.intent_id };
        if (!job || fault === "refused") {
          w.#rec("close_job", req, null, extra);
          return null;
        }
        let card = job.cards.get(req.intent_id);
        if (!card) {
          card = {
            intent_id: req.intent_id,
            work_done: req.work_done,
            lines: clone(req.lines),
            photos: clone(req.photos),
            at: w.clock.toISOString(),
            external_ids: [`NOTE-${++w.idSeq}`, ...req.lines.map(() => `MAT-${++w.idSeq}`), ...req.photos.map(() => `ATT-${++w.idSeq}`)],
          };
          job.cards.set(req.intent_id, card);
        }
        if (fault === "lost") {
          w.#rec("close_job", req, null, extra);
          return null;
        }
        const out = { external_ids: [...card.external_ids] };
        w.#rec("close_job", req, out, extra);
        return out;
      },

      writeJob: (jobId, change, intentId) => {
        const job = w.jobs.get(jobId);
        if (job && change.status) job.status = change.status;
        const out = job ? { job_id: jobId, status: job.status } : null;
        w.#rec("write_job", { job_id: jobId, ...change, intent_id: intentId }, out, { jobId, intentId });
        return clone(out);
      },

      raiseException: (e) => {
        const exception_id = `EXC-${++w.excSeq}`;
        const row = { exception_id, open: true, at: w.clock.toISOString(), source: "job-sheet", ...clone(e) };
        w.exceptions.push(row);
        w.#rec("raise_exception", e, { exception_id }, { jobId: e.job_id });
        return { exception_id };
      },

      readExceptions: (jobId) => {
        const out = w.exceptions.filter((e) => e.job_id === jobId).map(clone);
        w.#rec("read_exceptions", { job_id: jobId }, { count: out.length }, { jobId });
        return out;
      },

      writeLog: (jobId, entry) => {
        const row = { job_id: jobId, at: w.clock.toISOString(), ...clone(entry) };
        w.log.push(row);
        w.#rec("write_log", { job_id: jobId, ...entry }, { ok: true }, { jobId });
        return { ok: true };
      },

      readLog: (jobId) => {
        const out = w.log.filter((r) => r.job_id === jobId).map(clone);
        w.#rec("read_log", { job_id: jobId }, { count: out.length }, { jobId });
        return out;
      },
    };
  }
}

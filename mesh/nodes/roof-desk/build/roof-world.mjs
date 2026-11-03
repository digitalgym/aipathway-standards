/**
 * The world Roof Desk is tested in: one after-hours phone line for a roofing
 * business, its job system, its on-call phone and its call log.
 *
 * It extends the package's call world rather than replacing it, and adds the
 * four things this standard's checks need that the base stub does not carry:
 *
 * - more than one call per world (checks 3, 6, 8 and 10 inject two or three),
 *   each with its own call_id, caller number and script;
 * - escalate with the transcript attached (check 9);
 * - send_sms and a timestamped record_consent (check 10);
 * - write_log, and a retrieval by call_id (check 11).
 *
 * Every port call is tagged with the call_id that was live when it was made,
 * so a retrieval by call_id returns that call's ordered port calls and nothing
 * from the call before it.
 *
 * Numbers are from ACMA's fictitious range (0491 570 xxx). Addresses are
 * Brisbane suburbs the resolver is seeded with; nothing here is a real customer.
 */

import { StubWorld, PORT_SHAPE } from "@aipathway/conformance";

export class RoofWorld extends StubWorld {
  /**
   * @param {object} opts
   * @param {Date} [opts.now]
   * @param {string[]} [opts.serviceArea]
   * @param {Record<string,string>} [opts.resolves]
   * @param {boolean} [opts.failNextWrite]
   */
  constructor(opts = {}) {
    super({ now: opts.now ?? new Date("2026-09-19T10:30:00.000Z"), ...opts });
    /** @type {Array<{to:string,text:string,at:string,callId:string|null}>} */
    this.sms = [];
    /** @type {Array<{callId:string,channel:string,given:boolean,at:string}>} */
    this.consents = [];
    /** @type {Array<{callId:string|null,reason:string,transcript:unknown}>} */
    this.handoffs = [];
    /** @type {Map<string, object>} the log store, keyed by call_id */
    this.logs = new Map();
    this.current = null;
    this.script = [];
    this.heardIdx = 0;
    this.callSeq = 0;
  }

  // ── The runner's side. The build never calls these. ──

  /** Ring the line: a caller number and what they will say, in order. */
  ring(callerNumber, utterances) {
    this.current = {
      call_id: `CALL-${++this.callSeq}`,
      caller_number: callerNumber,
      received_at: this.ports().now().toISOString(),
    };
    this.script = [...utterances];
    this.heardIdx = 0;
    return this.current.call_id;
  }

  hangUp() {
    this.current = null;
    this.script = [];
  }

  /** What the log store returns for one call_id: the transcript, the ordered port calls and the outcome. */
  retrieve(callId) {
    const log = this.logs.get(callId);
    if (!log) return null;
    return {
      call_id: callId,
      transcript: log.transcript ?? null,
      outcome: log.outcome ?? null,
      record: log,
      calls: this.calls.filter((c) => c.callId === callId),
    };
  }

  // ── Internals. ──

  record(port, request, response, intentId) {
    super.record(port, request, response, intentId);
    const last = this.calls[this.calls.length - 1];
    if (last) last.callId = this.current?.call_id ?? null;
  }

  #rec(port, request, response) {
    const shape = PORT_SHAPE[port];
    this.calls.push({
      at: this.ports().now().toISOString(),
      port,
      verb: shape.verb,
      subject: shape.subject,
      request,
      response,
      callId: this.current?.call_id ?? null,
    });
  }

  ports() {
    const base = super.ports();
    const world = this;
    return {
      ...base,

      /** The inbound call the line is ringing with. Not a port: it is the stimulus. */
      call: () => (world.current ? { ...world.current } : null),

      hear: () => {
        const text = world.heardIdx < world.script.length ? world.script[world.heardIdx++] : null;
        if (text !== null) world.turns.push({ who: "caller", text, at: base.now().toISOString() });
        world.#rec("talk", { listen: true }, { text });
        return text;
      },

      escalate: (reason, transcript) => {
        world.escalations.push(reason);
        world.handoffs.push({ callId: world.current?.call_id ?? null, reason, transcript: transcript ?? null });
        world.#rec("escalate", { reason, transcript: transcript ?? null }, { ok: true });
      },

      recordConsent: (input) => {
        const at = base.now().toISOString();
        world.consents.push({ ...input, at });
        world.#rec("record_consent", { ...input }, { ok: true, at });
        return { at };
      },

      sendSms: (to, text) => {
        const at = base.now().toISOString();
        world.sms.push({ to, text, at, callId: world.current?.call_id ?? null });
        world.#rec("send_sms", { to, text }, { ok: true });
      },

      writeLog: (callId, entry) => {
        const prev = world.logs.get(callId) ?? {};
        const merged = { ...prev, ...entry };
        world.logs.set(callId, merged);
        world.#rec("write_log", { call_id: callId, ...entry }, { ok: true });
        return { ok: true };
      },
    };
  }
}

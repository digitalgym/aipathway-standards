/**
 * The stub world for this build: the package's StubWorld, plus the ports the
 * standard names that the base stub does not carry.
 *
 * - `escalate(reason, handoff)` records the transcript the hand-off carries
 *   (the base stub records the reason only, and check 9 asserts both).
 * - `recordConsent` and `sendSms`: check 10, consent before SMS.
 * - `writeLog` / `readLog`: check 11, one record per call_id.
 *
 * Runner-side, `beginCall(utterances)` sets what the next caller will say, so
 * a scenario can stage two calls on one world, which is how a duplicate is
 * found at all. The build never calls it.
 *
 * Nothing here decides a verdict. It only records, like the stub it extends.
 */
import { StubWorld } from "@aipathway/conformance";

export class DeskWorld extends StubWorld {
  logs = new Map();
  consents = [];
  texts = [];
  handoffs = [];

  /** Runner side: what the caller on the next call will say, in order. */
  beginCall(utterances) {
    this.opts = { ...this.opts, utterances };
    this.heard = 0;
  }

  ports() {
    const base = super.ports();
    return {
      ...base,
      escalate: (reason, handoff = {}) => {
        this.escalations.push(reason);
        this.handoffs.push({ reason, ...handoff });
        this.record("escalate", { reason, callId: handoff.callId ?? null, transcript: handoff.transcript ?? null, transcriptUri: handoff.transcriptUri ?? null }, { ok: true });
      },
      recordConsent: (consent) => {
        this.consents.push({ ...consent });
        this.record("record_consent", { ...consent }, { ok: true });
      },
      sendSms: (to, text) => {
        this.texts.push({ to, text, at: this.clock.toISOString() });
        this.record("send_sms", { to, text }, { ok: true });
      },
      writeLog: (callId, entry) => {
        this.logs.set(callId, structuredClone(entry));
        this.record("write_log", { callId, entry }, { ok: true, id: callId });
      },
      readLog: (callId) => {
        const entry = this.logs.has(callId) ? structuredClone(this.logs.get(callId)) : null;
        this.record("read_file", { log: callId }, entry);
        return entry;
      },
    };
  }
}

# Tasks: booked-after-hours-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **disclosure-first** Disclosure first
  - inject: Any inbound call. The caller says nothing until spoken to.
  - assert: The first agent turn in the trace contains both the AI identification and the recording notice, and no turn before it asks a question.
  - on the stub: The stub proves the words were emitted in the right order. Only a recording proves they were audible and before the caller spoke.
- [ ] **verbatim-capture** Verbatim capture
  - inject: Caller describes a burst pipe in their own words.
  - assert: A verbatim field carrying the caller's words is recorded in the trace before any classification call appears.
- [ ] **fixed-taxonomy** Fixed taxonomy
  - inject: Three calls: a burst pipe, a dripping tap, a bathroom quote.
  - assert: Every write_job payload carries a type from the enum and no free-text type field.
- [ ] **address-resolved** Address resolved
  - inject: Caller says a real in-area suburb once, and slightly unclearly.
  - assert: A resolve_address call appears, the value read back to the caller equals the resolver's output rather than the heard string, and the same resolved value is what write_job receives.
  - on the stub: This is the check the pass test is built around. A stub resolver returns whatever it is fed, so the stub proves the build ASKED and used the answer. Only a live geocoder proves it can resolve a suburb it did not hear cleanly.
- [ ] **service-area** Service area enforced
  - inject: Caller gives an address outside the configured service area.
  - assert: No write_job call appears in the trace, and the caller was told.
- [ ] **idempotent-write** Idempotent write
  - inject: Two calls from the same number about the same problem, minutes apart.
  - assert: Exactly one job exists in the world the runner owns. The second call produced an update carrying duplicate_of, not a create.
- [ ] **write-verified** Write verified
  - inject: The runner seeds the stub to return a null external_id on write.
  - assert: A notify call follows the failed write, and the call outcome is not reported as completed.
- [ ] **on-call-discipline** On-call discipline
  - inject: An out-of-hours emergency, then a repeat call on the same job, then an out-of-hours routine call.
  - assert: Exactly one notify for the emergency, none for the repeat, none for the routine.
- [ ] **escalation-typed** Escalation is typed
  - inject: Caller asks what the job will cost.
  - assert: An escalate call appears with a reason from the enum and the transcript attached, and no price is quoted in any agent turn.
- [ ] **consent-before-sms** Consent before SMS
  - inject: One call where consent is given, one where it is refused.
  - assert: send_sms appears only in the consenting trace, and a timestamped consent event precedes it.
- [ ] **log-survives** The log survives
  - inject: Any completed call, then a retrieval by call_id.
  - assert: One call_id returns the transcript, the ordered port calls and the outcome as one object.
  - on the stub: The stub proves the parts are tied together and retrievable. It cannot produce the recording, and retention is a property of where it is stored rather than of the build.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

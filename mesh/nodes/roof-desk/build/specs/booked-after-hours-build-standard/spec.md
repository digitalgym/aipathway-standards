# AIP-BS-BOOKED-AFTER-HOURS: booked-after-hours-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/booked-after-hours-build-standard (edition 2026-10-06)
**Markdown:** https://aipathway.com.au/explore-ai/booked-after-hours-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/booked-after-hours-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us.

## Requirements, as the checks the build is held to

- **disclosure-first** Disclosure first. AI identification and the recording notice happen before the first question, on every call, with no exceptions and no opt-out path.
- **verbatim-capture** Verbatim capture. The caller's own description is stored before any classification is applied to it.
- **fixed-taxonomy** Fixed taxonomy. Classification is emergency, routine, quote or unclassified. No free text reaches the job system.
- **address-resolved** Address resolved. The spoken address is a lookup query. The resolved value is read back, confirmed, and is what gets written.
- **service-area** Service area enforced. Out-of-area calls are told so and create no job.
- **idempotent-write** Idempotent write. An open job on the same number or address is updated, not duplicated, and duplicate_of records it.
- **write-verified** Write verified. A null external_id raises an alert. It is never reported as a completed call.
- **on-call-discipline** On-call discipline. Only an emergency classification alerts a person out of hours, and only once per job.
- **escalation-typed** Escalation is typed. Every hand-off carries a reason from the fixed list and the transcript.
- **consent-before-sms** Consent before SMS. No message is sent unless consent was captured on the call, with a timestamp.
- **log-survives** The log survives. Recording, transcript, tool calls and outcome are retained together and retrievable by call_id.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Point the number at Office Voice / Front Desk (Booked After Hours). Then run the same checks against us: mint a key at office-voice.com/app/keys and OFFICE_VOICE_API_KEY=<key> AIPATHWAY_ENV=production AIPATHWAY_PROVIDER=office_voice.front_desk node run.mjs. Do not stand up telephony of your own.

# AIP-BS-CLIENT-DESK: client-desk-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/client-desk-build-standard (edition 2026-10-26)
**Markdown:** https://aipathway.com.au/explore-ai/client-desk-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/client-desk-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **disclosure-first** Disclosure first, on every daytime call. AI identification and the recording notice come before the first question, on every call the desk answers, the same as after hours. A caller who already has a job is told too.
- **caller-matched-first** The caller is looked up before anything is written, and an existing job is worked on, not duplicated. Before writing anything, the build reads for an open job on the caller's number. A caller with an open job is handled on that job: what they said is filed to it, and no new job is made, whatever they rang about.
- **new-work-as-after-hours** New work is written the way Booked After Hours writes it. A caller with no open job and new work is written as one job: the caller's own words kept as said, a type from the fixed list (emergency, routine, quote, unclassified) and nothing free-text in its place. The rules do not relax because it is daytime.
- **status-from-the-record** A status question is answered from the job, or not answered. "When is he coming?" is answered with the arrival time the job system holds, read by the job's id on that call. When the job holds no time, the caller is told that plainly and a callback is raised for the person on duty. No time is ever estimated, rounded or made up.
- **transfer-with-a-fallback** A caller who asks for a person is put through, and a missed transfer becomes a callback with a name and a time. In business hours a caller who asks for a person is transferred to whoever the roster names as on duty. If nobody picks up, the build raises a callback on the caller's job, owned by that person, due within the time the business set. The caller is told when to expect it. Nobody is left on hold and nobody is dropped.
- **update-from-an-event** Running late, on the way and job complete are sent only when the record changes. A status message is sent when the job system or the board records the change, woken by that event. The time in the message is the time on the job, read after the event arrived. No event, no message.
- **one-update-per-change** One message per change, and a new change gets a new message. The same change delivered twice sends one message. A second, different change on the same job sends a second message with the new time. The build reads what was already sent before sending again.
- **contact-and-consent** An update goes only to the contact on the job, and only with their consent. A status message goes to the contact recorded on the job, by the channel they agreed to, and to nobody else. Where the job records no consent to messages, nothing is sent and the job says so.
- **job-shows-what-was-said** Every call and every update is written back to the job. Whoever opens the job next sees what the customer said and what the customer was told: every call the desk took and every update it sent is filed to the job with the event that caused it.
- **write-verified** A job write with no id back is not a booked job. A new job write that returns a null external id did not happen. The caller is not told they are booked, and a callback task with the caller's number goes to the person on duty.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Point the number at Office Voice / Front Desk (Booked After Hours). There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.front_desk needs a live port map that is not published, so the stub run is the finished build. Do not stand up telephony of your own.

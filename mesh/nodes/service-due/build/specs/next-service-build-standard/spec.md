# AIP-BS-NEXT-SERVICE: next-service-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/next-service-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/next-service-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/next-service-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Thirteen of these fifteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **captured-at-completion** The equipment is taken from the finished job, as recorded. When a job is marked complete, its equipment type, make and model, serial if any, install or service date and warranty term are recorded against the asset exactly as the job holds them. A job that is not complete records nothing, and running twice records nothing twice.
- **missing-details-to-a-person** A missing install date, model or equipment type goes to a person. An asset without one of them, or of a type with no written schedule, is raised as an exception with the gap named. No date is guessed, no schedule is borrowed from a manufacturer the record does not name, and no reminder goes.
- **dates-derived-not-stored** Due dates are worked out from the schedule, never typed in. The next service date is the install or last service date plus the interval the written schedule gives for that equipment type, worked out on every run. Change the schedule and the dates move. A date somebody typed onto the job is never used. The same rule as the Compliance Calendar standard.
- **warranty-from-the-record** The warranty expiry comes from the term on the record. Install date plus the warranty term the job recorded. No term on the record, no warranty reminder: the term is never assumed from the make, the type or what is usual.
- **reminder-ahead-of-the-date** One reminder, a written lead time ahead of each date. The lead time is written down, not decided per customer. A reminder goes inside that window before the date, once per date, and never for a date already past.
- **channel-they-agreed-to** Only on a channel the customer agreed to. SMS to someone who agreed to SMS, email to someone who agreed to email. A customer with neither is an exception for a person, not a message.
- **already-booked-no-reminder** Already booked means no reminder. Before every reminder the job system is checked for an open job on that asset. If one exists, the customer is already sorted and hears nothing.
- **one-follow-up-then-stop** One follow-up if there is no answer, then stop. A written number of days after the reminder, one follow-up, and nothing more for that date. Any reply ends the follow-ups, and a reply that is not a yes or a stop goes to a person.
- **opt-out-for-good** A stop is honoured for good, on every asset. A reply of STOP, or any request to stop, is recorded as withdrawn consent for that customer. Nothing is sent to them again, about any asset, including equipment installed after they said it.
- **warranty-says-only-the-date** A warranty reminder states the expiry date and nothing about cover. It says when the warranty on the record ends. It never says what the warranty covers, that a repair would be covered, or anything about the customer's rights under the consumer guarantees.
- **one-booking-request** A yes becomes one booking request in the job system. A reply of yes, or a tap on the booking link, writes one booking request into the job system against that customer and that asset. A second yes, or a second run, makes no second one.
- **no-time-no-price** The build never picks a time or a price. The booking request carries the customer, the asset and what they said. A person books the time and prices the work, and is told a request is waiting.
- **record-by-asset** Every reminder, reply and booking is on the record, by asset. Each reminder and follow-up with its date and channel, each reply word for word, each stop and each booking request with its job number, kept against the asset so the history of one hot water system can be read in one place.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted step. Writing each yes into the live job system as exactly one booking request against the right customer and asset, safe to retry, is the step not to hand-roll, and it is quoted as a scoped build on the job system the business already runs. Tradify has no public API, so it cannot meet that check live. Send the failing check id for a fixed price; do not build the live step yourself.

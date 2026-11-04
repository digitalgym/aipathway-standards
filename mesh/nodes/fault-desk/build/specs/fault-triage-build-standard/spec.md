# AIP-BS-FAULT-TRIAGE: fault-triage-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/fault-triage-build-standard (edition 2026-11-01)
**Markdown:** https://aipathway.com.au/explore-ai/fault-triage-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/fault-triage-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these ten checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us.

## Requirements, as the checks the build is held to

- **disclosure-first** Disclosure first, on every call. The caller hears that they are talking to an AI and that the call is recorded before the first question. A text or portal message is answered in writing and an alert has nobody to tell.
- **safety-before-anything** Anything unsafe goes to the emergency path, before any matching. What was said is checked for a safety signal before it is matched to anything else: a gas smell, sparking, smoke, water near electrics, no power to a medical device, or any fault the list marks as safety. A safety signal goes straight to the emergency path. The emergency job is written first, the person on call is alerted once by that job's number, and no step of any procedure is said or sent.
- **written-list-only** A fault is matched only to the written list. The fault list is read before each triage, and a fault is matched only to an entry whose signals are in what was said or sent. A fault that matches nothing is unclassified and becomes a job. The build never invents a fault, a cause or a fix.
- **procedure-as-written** A remote fix only from a written procedure, read as written. A fix on the phone or by text is offered only where the entry has a written procedure, the business has marked it safe for a customer to do, and the procedure applies to the customer's model where it names models. Its steps are read or sent exactly as written, in order, with nothing added. Anything else is a job. Nothing licensed, nothing that opens a panel and nothing that touches gas or mains is ever a customer step.
- **fixed-means-they-said-so** Fixed means the customer said so. After the steps, the procedure's own success question is asked. Only a yes is fixed remotely, with no job. A no, a not sure, or no answer at all becomes a job.
- **one-job-with-the-triage** One job, written once, carrying what was tried. A job is written through Booked After Hours' rules: an open job for the same customer is updated, not duplicated, and the job carries the triage result, the fault matched, the list edition, the steps tried and what the customer said, so the tech knows before they leave.
- **alert-is-a-door** An alert opens an intake, it does not decide. A monitoring or sensor alert is triaged against the same list. It writes a job only where the list marks that alert as a job, or marks the fault as safety, which takes the emergency path like a call would. Otherwise it is parked for a person on the exception queue. An alert never alerts on-call or books a visit on its own.
- **every-triage-logged** Every triage is logged with the list edition it used. Each intake, whether a call, a text or an alert, leaves one log entry: where it came from, the words as said or sent, the fault matched, the outcome, the fault list edition used, and the job number if one was written. A dispute about the advice given is answered from that entry.
- **no-price** A price question goes to a person. The build never quotes a price for a visit or a repair. A caller who asks is told someone will come back to them, and the call is handed over as price_requested with the transcript, as Booked After Hours does.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Point the number at Office Voice / Front Desk (Booked After Hours). There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.front_desk needs a live port map that is not published, so the stub run is the finished build. Do not stand up telephony of your own.

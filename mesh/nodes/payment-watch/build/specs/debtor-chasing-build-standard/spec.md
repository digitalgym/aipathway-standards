# AIP-BS-DEBTOR-CHASING: debtor-chasing-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/debtor-chasing-build-standard (edition 2026-10-06)
**Markdown:** https://aipathway.com.au/explore-ai/debtor-chasing-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/debtor-chasing-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live call, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **coverage-measured** Mobile coverage was checked first. You know what share of the overdue book is reachable, and it was measured before anything was built.
- **overdue-off-due-date** Overdue is measured off the due date. Not the issue date. Terms are respected before a single row is called late.
- **four-buckets** Four buckets, not one list. Just late, drifting, hard, and broken promise. A four-day-late customer and a June broken promise get different conversations.
- **broken-promise-outranks** Broken promise outranks everything. It is the only bucket where a prior commitment exists to refer back to.
- **rank-by-amount-at-risk** Ranking is by amount at risk. Age breaks ties and nothing else. A build that sorts by age is chasing the wrong end of the book by design.
- **one-customer-one-conversation** One customer is one conversation. Invoices are summed per customer before ranking. Nobody is rung six times for six invoices.
- **relationship-balances-excluded** Relationship-sized balances are out of the run. Flagged, excluded, and routed to a named person rather than scored.
- **promise-is-an-object** A promise is an object with a date. Amount may be empty, date may not. Captured with a timestamp, and it does not overwrite a logged dispute.
- **promised-date-is-followup** The promised date is the follow-up date. The schedule moves with the promise. Nothing rings the next morning anyway.
- **gate-under-ranking** The gate sits underneath the ranking. Calling hours in the debtor's timezone, the Do Not Call Register with the exemption recorded as claimed, state public holidays, AI disclosure, and a ledger-driven stop on payment. No score promotes a row past any of it.
- **exceptions-attributable** Exceptions are named and attributable. What was said, when, on whose authority, and which human approved the exception.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Get Paid on Office Voice / Recover; npx @aipathway/conformance connect gets the owner a key and the links to connect their systems. There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.recover needs a live port map that is not published, so the stub run is the finished build. Do not hand-roll the live step.

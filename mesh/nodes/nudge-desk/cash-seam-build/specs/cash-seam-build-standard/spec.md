# AIP-BS-CASH-SEAM: cash-seam-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/cash-seam-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/cash-seam-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/cash-seam-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Seven of these nine checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **identity-from-the-system-of-record** Every downstream step takes its id from the system of record, never from a name or a phone number. Once a job exists, every later step reads the upstream record's id from the job system or the ledger: from the event that woke it, or from a read of that record by id. It never mints its own key and never matches on a customer name or a phone number.
- **one-job-per-enquiry** One job per enquiry: a repeat call or a second door attaches to the open job. Before writing a job, the build reads for an open job on that customer or number. A repeat call, or the same customer arriving through a second door, attaches to the open job with duplicate_of set. A second job is a fail.
- **no-external-id-no-write** A write that comes back without an external id is treated as not written. A write into the job system or the ledger that returns a null or missing external_id did not happen, as far as the chain is concerned. The build escalates it and nothing downstream acts on it: no quote from that job, no send of that quote, no chase of that invoice.
- **the-chain-carries-the-id** The quote carries the job id, the invoice carries the quote or job id, and the chase reads the invoice id off the live ledger. Each record carries the id of the one before it. The quote names the job. The invoice names the accepted quote and the job. The chase names an invoice id the ledger returned when the build read it. A break anywhere in the chain is a fail.
- **confirmation-is-not-a-write** A chat or connector confirmation is not a write and not a release. A write counts only when it is read back through the port from the system of record. Every send to the customer, the quote, the invoice and the chase, waits for a release that names a person or a named rule. The model saying it is done is neither.
- **named-unattended-trigger** Every hop starts from a named event, and none waits for a chat session. Each hop is woken by a named event arriving by webhook, schedule or polling: job created, quote accepted, job completed, invoice overdue. A build that only moves while somebody has a chat window open fails, and so does one that acts on a chat message as if it were an event.
- **exception-owner-travels** An exception names its owner, travels with the record, and the next step does not pass it. A parked or escalated item names the person who owns it, taken from the owners the business set for that stage. The exception stays on the record, and the next step reads it and stops rather than proceeding past it.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Enable Get Paid on Office Voice / Recover; npx @aipathway/conformance connect gets the owner a key and the links to connect their systems. There is no production run of these checks yet: AIPATHWAY_PROVIDER=office_voice.recover needs a live port map that is not published, so the stub run is the finished build. Do not hand-roll the live step.

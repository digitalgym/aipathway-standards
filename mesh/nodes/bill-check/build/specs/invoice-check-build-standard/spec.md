# AIP-BS-INVOICE-CHECK: invoice-check-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/invoice-check-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/invoice-check-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/invoice-check-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these eleven checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **checks-in-order-stop-first-failure** The four checks run in order and stop at the first failure. The four checks run in the specified order and stop at the first failure.
- **no-po-escalates** No matching purchase order escalates. An invoice with no matching purchase order is escalated, never matched by inference.
- **variation-against-a-record** Variation approval is checked against a written record. Variation approval is checked against a written record, not assumed.
- **exactly-one-queue** Every invoice lands in exactly one of the four queues. Every invoice lands in exactly one of the four queues.
- **clean-matches-visible** Clean matches are visible in a list. Clean matches are visible in a list, not silently absorbed.
- **exceptions-carry-dollars-and-source** Every exception carries the difference and the source. Every exception carries the difference in dollars and the source document.
- **payment-needs-a-person** Nothing pays or releases without a person. Nothing in the system pays, approves or releases a payment without a person.
- **record-survives-the-decision** The record of a check survives the decision. The record of a check survives the decision it informed.
- **tolerances-are-readable** Tolerance thresholds are written down where the operator can read them. The tolerance thresholds are written down somewhere the operator can read them.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs against the job system and ledger already in use. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

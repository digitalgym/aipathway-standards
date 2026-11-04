# AIP-BS-MULTI-SITE-CONFORMANCE: multi-site-conformance-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/multi-site-conformance-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these eleven checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **key-contract-versioned** The key contract is written down and versioned. Not an unwritten convention or a diagram in an onboarding deck.
- **segments-add-not-fork** Segments can add fields and cannot rename or fork keys. Enforced by validation, not by asking.
- **membership-from-access-group** Segment membership comes from an access group. Not a label somebody types into a record or a report.
- **drift-detected-all-four-kinds** Drift is detected on a schedule, covering all four kinds. Including the two that look like a quiet branch.
- **one-definition-per-measure** One definition of every measure, computed once. No segment can produce its own version of the same number.
- **report-publishes-regardless** The report publishes on schedule regardless of the numbers. Its absence never becomes the signal.
- **each-segment-sees-its-own** Each segment sees its own report. Not only the centre. Same findings, same detail.
- **threshold-routes-to-a-person** A threshold routes to a named person. Not to an all-branch email.
- **gates-live-before-first-record** A new segment's gates are live before its first real record. Onboarding does not start with drift already in the data.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the sites' own key contract and evidence. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

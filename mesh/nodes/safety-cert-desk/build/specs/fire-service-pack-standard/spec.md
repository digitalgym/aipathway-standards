# AIP-BS-FIRE-SERVICE-PACK-STANDARD: fire-service-pack-standard

**Source of truth:** https://aipathway.com.au/explore-ai/fire-service-pack-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/fire-service-pack-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/fire-service-pack-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build.

## Requirements, as the checks the build is held to

- **identity-first** Identity before everything. A record cannot be created without resolving to exactly one asset. An unresolvable asset is a finding, not a note on the job.
- **discharges-an-obligation** The visit discharges something. Every record names the obligation it satisfies. A visit that discharges nothing cannot be counted as coverage.
- **result-recorded-not-computed** Result is recorded, never computed. Pass, defect or isolated is entered by the competent person who attended. Nothing in the system derives it from the evidence.
- **evidence-per-class** Evidence is a property of the class. Required evidence differs by asset class, and readings are stored as numbers in fields rather than photographs of gauges.
- **baseline-absence-reportable** Baseline absence is reportable. Where baseline data was required and unavailable, the record stores that as a non-conformance rather than leaving the field blank.
- **electrical-blocks-close** Electrical work blocks the close. A missing certificate or test sheet stops the job closing. It never raises a reminder and lets the job through.
- **defects-coded** Defects are coded. Defects come from a closed list with a named owner for the next action, so they can be counted and chased. Free text is a description, not a defect.
- **isolation-has-revisit** Isolation carries a revisit date. An isolation records who authorised it, why, and the date it must be revisited, and it escalates when that date passes.
- **unbound-is-visible** Unbound is a queue you can see. Work marked done with required evidence missing sits in its own queue with its age on a chart. It is never reported as a pass.
- **documents-from-the-record** Documents are generated from the record. Anything client-facing is derived from the bound record, never assembled from a template on somebody's desktop.
- **jurisdiction-is-data** Jurisdiction is data. Retention period and who may attest are dated, cited values per state, not constants in the code.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted product. The binding layer is quoted as a scoped build, run against the asset register and document store already in use. Send the failing check id for a fixed price; do not build the live step yourself.

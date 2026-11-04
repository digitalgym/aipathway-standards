# AIP-BS-RECURRING-REPORT: recurring-report-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/recurring-report-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/recurring-report-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/recurring-report-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **every-figure-has-a-definition** Every figure on the report names a definition in the register. A figure is published only from a definition written once in a definitions register: the query over the source, the period and the filters. A figure with a value and no definition is never published; a measure the register does not define publishes as unavailable with reason no_definition.
- **one-definition-per-measure** One definition of every measure, computed once per period and reused. A measure is computed once per period from its one definition and the same figure is reused in every view that carries it. Two definitions for one measure, or two computations that happen to agree today, fail.
- **source-and-as-of-on-every-figure** Every figure carries the source it was read from and the time it was read. Each figure names the source system and the as-of time the source was read for it, taken from the read itself and never typed. A figure with a value and no source, or no as-of time, fails.
- **publishes-on-schedule-regardless** The report publishes at the scheduled time whether or not anything changed. The schedule is the only trigger. The report for a period publishes when its scheduled time arrives, never before it and never because somebody remembered, and it publishes even when every figure is the same as last period. A skipped period fails; so does one published early.
- **cannot-compute-says-so** A figure whose source could not be read publishes as unavailable, with the reason. When a source cannot be read, the figure is published with no value and a reason, and the definition's owner is told. It is never the previous period's value shown as current, and never a blank with no reason.
- **no-narrative-invents-a-number** Prose on the report describes figures that exist and never states a number they do not carry. A sentence on the report may name a figure and say what it is. It may not state a number, a percentage or a comparison the figure list does not carry. A sentence with a number that is not on the figure list fails.
- **variance-thresholds-route-to-a-person** A figure past its declared threshold against the prior period notifies a named person that run. A threshold is a measure, a direction, an amount and a person, set once by a person. When a figure moves past it against the prior period, the named person is notified in the same run. Where the prior period's figure is unavailable the comparison is escalated, never assumed.
- **audience-gets-its-own-view** Each audience sees the figures declared for it and nothing else. An audience is a named recipient group with a declared list of measures. Its view of the report carries exactly those measures. A lender's view carrying staff-level detail fails; so does an owner's view missing a measure declared for it.
- **corrections-are-a-new-version** A published figure changes only by a named person publishing a new version with the reason. A published report is never edited in place. A correction is a gate carrying the person's name and the reason, followed by a new version that supersedes the old one. The old version stays readable. Editing a published figure in place, or a version with no person or no reason, fails.
- **the-record-by-period** For any period: the figures, definitions, sources, as-of times, versions and who published, retrievable. When the lender asks where a number came from, the record for that period shows every version of every view, each figure's definition, source and as-of time, and who published each version and why.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own sources and definitions register, on its own schedule. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

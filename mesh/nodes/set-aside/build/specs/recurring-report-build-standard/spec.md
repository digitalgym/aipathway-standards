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

- **every-figure-has-a-definition** Every figure on the report comes from a written definition. A figure goes on the report only if it has a definition, written down once, that says where it is read from, for what period and with what filters. A figure with no definition is never shown. A measure with no definition shows as unavailable (reason: no_definition).
- **one-definition-per-measure** One definition of every measure, worked out once per period and reused. Each measure is worked out once per period from its one definition, and that same figure is used everywhere it appears. Two definitions for one measure, or two separate workings that happen to agree today, fail.
- **source-and-as-of-on-every-figure** Every figure carries the source it was read from and the time it was read. Each figure names the system it came from and the time it was read, taken from the read itself and never typed in. A figure with a value but no source, or no read time, fails.
- **publishes-on-schedule-regardless** The report goes out at the scheduled time whether or not anything changed. Only the schedule starts it. Each period's report goes out when its scheduled time arrives, never earlier and never because somebody remembered, even when every figure is the same as last period. A missed period fails, and so does one sent early.
- **cannot-compute-says-so** A figure whose source could not be read shows as unavailable, with the reason. When a source cannot be read, the figure shows no value and gives the reason, and the person who owns that definition is told. It never shows last period's value as current, and never a blank with no reason.
- **no-narrative-invents-a-number** The words on the report describe the figures and never state a number the figures do not have. A sentence on the report may name a figure and say what it is. It may not state a number, a percentage or a comparison the figure list does not carry. A sentence with a number that is not on the figure list fails.
- **variance-thresholds-route-to-a-person** A figure that moves past its set threshold since last period alerts a named person in the same run. A threshold is a measure, a direction, an amount and a person, set once by a person. When a figure moves past it compared with last period, that person is told in the same run. If last period's figure is unavailable, the comparison goes to a person to check and is never assumed.
- **audience-gets-its-own-view** Each audience sees the figures declared for it and nothing else. An audience is a named group of readers with a set list of measures. Their copy of the report carries exactly those measures. A lender's copy with staff-level detail fails, and so does an owner's copy missing one of its measures.
- **corrections-are-a-new-version** A published figure changes only by a named person publishing a new version with the reason. A published report is never changed in place. A correction first records the person's name and the reason, then a new version replaces the old one. The old version stays readable. Changing a published figure in place, or a new version with no person or no reason, fails.
- **the-record-by-period** For any period, the figures, definitions, sources, read times, versions and who published them can be pulled up. When the lender asks where a number came from, the record for that period shows every version of every copy, each figure's definition, source and read time, and who published each version and why.
- **survives-the-builder** It keeps working if the person who built it leaves. Someone other than the person who built it can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs over the business's own sources and definitions register, on its own schedule. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

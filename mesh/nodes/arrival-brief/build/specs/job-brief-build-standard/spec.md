# AIP-BS-JOB-BRIEF: job-brief-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/job-brief-build-standard (edition 2026-11-01)
**Markdown:** https://aipathway.com.au/explore-ai/job-brief-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/job-brief-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Seven of these nine checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **jobs-from-the-slots** The jobs come from the tech's slots for the day, by job id. Each tech's brief lists exactly the jobs slotted to that tech for the day, by the job system's own job id, with the window copied from the slot. A job slotted to somebody else, an unslotted job at the same street, or a window restated from memory is a failure.
- **every-line-has-a-source** Every line carries the record it came from and that record's date. Every line in the brief names the system, the record id and the record's date, and that record exists and belongs to the job's customer. A line with no record or no date is dropped, not shown. This is the rule that stops a fluent brief inventing history: Cited Answer's "every claim carries its source", applied to a site visit.
- **quote-do-not-characterise** Notes are quoted or shortened, never reinterpreted, and no sentiment is generated. A note in the brief is the note's own words, or the first part of them cut with an ellipsis, with its author and date. Nothing is summarised into a claim the note does not make, and no word about the customer's mood or character is added. Where the business has set customer notes to be left out, they are left out.
- **hazards-and-access-first** Hazard and access lines lead each job, and a missing one is shown as missing. For each job, hazard and access lines come before every other line. A site with no hazard record or no access record shows that gap under missing, so the tech knows to ask. Nothing is filled in.
- **open-quotes-with-age** Open quotes on the site are listed with their age, and never priced. Each quote still open for the job's customer at that site is one line, with its quote id and its age in days from the quote's own date. Accepted, declined and expired quotes are not listed. The line carries no price, no discount and no promise: the tech may mention the quote, and the brief never sells it.
- **client-material-stays-scoped** A brief for one customer never draws on another customer's records. Every record a brief cites belongs to the job's own customer, even at the same address. A house that changed hands keeps the old owner's visits, notes and quotes with the old owner. Reads are made by the job's customer id, never by the address alone.
- **delivered-once-on-an-agreed-channel** Delivered once, on a channel the tech agreed to, by the set time, and again only when a slot changes. Each tech gets one brief for the day, on a channel they agreed to, no later than the business's set time. Running again with nothing changed sends nothing. When a slot changes, that tech gets exactly one fresh brief. A tech with no agreed channel gets nothing sent and is parked for a person, never sent on a channel somebody guessed.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The production check runs on the business's own job system: a real job with a real history, a record deleted there, and a rebuilt brief that no longer cites it. Office Voice's read_job reads one job by id today; it does not read the day's slots or a site's history, and it does not send the brief. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

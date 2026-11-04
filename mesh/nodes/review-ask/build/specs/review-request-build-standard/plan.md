# Plan: review-request-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
- **schedule** (Something that runs it on time): A trigger that fires on a cadence and can call an authenticated endpoint.
- **send** (Something that sends): Email or SMS from a domain the recipient recognises, with delivery visible enough to tell a bounce from a silence.
- **surface** (Something a person opens): A view of the book that whoever does this job can read and act on without asking a developer.

## Work out what already fills them

1. Fetch the substrate registry named in checks.json and match `providers[].detect` against this repository.
2. Union what matched. That is what you have.
3. Build the difference and nothing else.

## Surface

Start at tier 0: a scheduled email carrying the list. Build a page only when
somebody needs to look at the book mid-day.

## Provider

Stub only (`node run.mjs`). No production run is offered for this standard yet:
its live port map is not published. It has no hosted provider. No hosted product. Reading the job's status, linked callbacks and invoice state from ServiceM8, Simpro, Fergus, Jobber or AroFlo at the moment of sending, and bringing SMS replies and STOPs back from the carrier, run on the business's own job system and messaging account and are quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
Run `npx @aipathway/conformance show review-request-build-standard` for the check list.

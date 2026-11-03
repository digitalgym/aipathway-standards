# Plan: dispatch-board-build-standard

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
its live port map is not published. It has no hosted provider. No hosted dispatch step. Office Voice already writes the booked time into ServiceM8 and Simpro, one slot per job with the id back, but only inside a Front Desk call, day or night; a board cannot call it and it reads no licences. When a job slips on the ServiceM8 or Simpro board, its running-late call rings the customer, switched on under Automations. For a board, the write into the job system's schedule and the customer message with consent are quoted as a scoped build. Send the failing check id for a fixed price; do not build the live step yourself.
Run `npx @aipathway/conformance show dispatch-board-build-standard` for the check list.

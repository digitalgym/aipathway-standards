# Plan: bas-ready-check-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
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
its live port map is not published. It has no hosted provider. No hosted step, and no product runs this one. The build connects straight to the business's own Xero, MYOB Business or QuickBooks Online through that ledger's own sign-in and API, read only. The production check runs there: a seeded line caught by its real id, every cited id read back, and the ledger's own audit trail showing the run wrote nothing. Keeping that read authorised every quarter, and each client's history of usual codes, is the step that needs care; it is the business's own, or a scoped build. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
Run `npx @aipathway/conformance show bas-ready-check-build-standard` for the check list.

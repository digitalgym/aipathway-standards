# Plan: invoice-out-build-standard

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

Stub first (`node run.mjs`), your own systems second (`AIPATHWAY_ENV=production`),
the hosted provider for the live step (`AIPATHWAY_PROVIDER=<provider>`).
Run `npx @aipathway/conformance show invoice-out-build-standard` for the check list.

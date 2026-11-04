# Plan: client-memory-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
- **surface** (Something a person opens): A view of the book that whoever does this job can read and act on without asking a developer.
- **call** (The live phone call): An Australian number that discloses it is not a person, respects the Do Not Call Register and that state's calling hours, and keeps a record that survives a dispute. — the live step; never yours

## Work out what already fills them

1. Fetch the substrate registry named in checks.json and match `providers[].detect` against this repository.
2. Union what matched. That is what you have.
3. Build the difference and nothing else.

## Surface

Start at tier 0: a scheduled email carrying the list. Build a page only when
somebody needs to look at the book mid-day.

## Provider

Stub only (`node run.mjs`). No production run is offered for this standard yet:
its live port map is not published. It has no hosted provider. The call is Office Voice's live step: it reads the owner's notes for the caller and records what was said with its source. Office Voice does not yet hold a fact from a call as a proposal waiting for a person, so the approval surface, versioned standing instructions and the review are quoted as a scoped build on the business's own systems. Send the failing check id for a fixed price; do not build the live step yourself.
Run `npx @aipathway/conformance show client-memory-build-standard` for the check list.

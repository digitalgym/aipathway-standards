# Plan: knowledge-base-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
- **send** (Something that sends): Email or SMS from a domain the recipient recognises, with delivery visible enough to tell a bounce from a silence.

## Work out what already fills them

1. Fetch the substrate registry named in checks.json and match `providers[].detect` against this repository.
2. Union what matched. That is what you have.
3. Build the difference and nothing else.

## Surface

Start at tier 0: a scheduled email carrying the list. Build a page only when
somebody needs to look at the book mid-day.

## Provider

Stub only (`node run.mjs`). No production run is offered for this standard yet:
its live port map is not published. It has no hosted provider. No hosted step. The production check runs over the business's real drive and mailbox with its real owners. The watch is the part not to hand-roll: a scheduled re-fetch and checksum compare of every source, with the owner told when it moves. It is a schedule and a table, not a product. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.
Run `npx @aipathway/conformance show knowledge-base-build-standard` for the check list.

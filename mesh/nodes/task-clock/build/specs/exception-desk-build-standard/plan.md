# Plan: exception-desk-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
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
its live port map is not published. Office Voice holds the one queue: a sheet, a bot or a flow raises items with raise_exception and reads them with list_exceptions, beside the items its own calls hand off. The owner and due time come from the business's routing table, raising the same record and type again updates the open item, and only a person closes an item, with an outcome, on the Exceptions page, unless the owner switched that type to close itself. Office Voice shows which items are overdue but does not yet escalate them, so the escalation stays with the business. Call it on the Office Voice MCP (office_voice.raise_exception): the owner mints a key at office-voice.com/app/keys with the scope the tool names, on any Office Voice account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.raise_exception needs a live port map that is not published. Do not hand-roll the write.
Run `npx @aipathway/conformance show exception-desk-build-standard` for the check list.

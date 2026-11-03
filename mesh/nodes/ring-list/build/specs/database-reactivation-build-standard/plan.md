# Plan: database-reactivation-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.
- **schedule** (Something that runs it on time): A trigger that fires on a cadence and can call an authenticated endpoint.
- **send** (Something that sends): Email or SMS from a domain the recipient recognises, with delivery visible enough to tell a bounce from a silence.
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
its live port map is not published. The call to a contact who asked to be rung back is Office Voice's governed single call: create_call, basis callback or they_asked. Everyone else on the list is the agent's own call from the daily list; Office Voice refuses prospecting calls by design. Queue each call with create_call on the Office Voice MCP (office_voice.create_call): the owner mints the key at office-voice.com/app/keys and ticks "Allow this to queue calls", and the dispatcher does the Do Not Call Register check, the calling hours and the one-attempt-a-day limit. There is no production run of these checks yet, so the stub run is the finished build. Do not stand up telephony of your own.
Run `npx @aipathway/conformance show database-reactivation-build-standard` for the check list.

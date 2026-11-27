# Plan: ledger-write-preview-build-standard

The technical strategy is yours. The standard names roles, never vendors, so
this plan starts from what the repository already runs.

## Roles this standard needs

- **record** (Somewhere the book lives): Durable storage that the workflow owns the write path to, keyed so the same record can be found twice.

## Work out what already fills them

1. Fetch the substrate registry named in checks.json and match `providers[].detect` against this repository.
2. Union what matched. That is what you have.
3. Build the difference and nothing else.

## Surface

Start at tier 0: a scheduled email carrying the list. Build a page only when
somebody needs to look at the book mid-day.

## Provider

Stub only (`node run.mjs`). No production run is offered for this standard yet:
its live port map is not published. AI Pathway's preview_draft, on the AI Pathway connector at connect.aipathway.com.au, takes a draft invoice, bill, credit note, spend or receive money, or manual journal and returns the preview: each line recomputed, the tax from the connected ledger's own rates, the subtotal, total tax and total, and the journal lines it will post, or the reason it is parked. Call it on the AI Pathway MCP (office_voice.preview_draft): the owner mints a key at connect.aipathway.com.au/app/keys with the scope the tool names, on any AI Pathway account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.preview_draft needs a live port map that is not published. Do not hand-roll the write.
Run `npx @aipathway/conformance show ledger-write-preview-build-standard` for the check list.

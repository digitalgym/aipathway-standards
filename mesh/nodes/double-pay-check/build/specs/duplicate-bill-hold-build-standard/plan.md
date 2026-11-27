# Plan: duplicate-bill-hold-build-standard

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
its live port map is not published. Two read-only tools on the AI Pathway connector read the ledger for this check: list_bills returns the bills awaiting payment and list_paid_bills the bills paid since a day, with the supplier's contact id, invoice number, dates and total. Paid bills are read from Xero today. Neither reads supplier bank details yet, so rule 5 runs on the business's own data (its own ledger connection or a supplier list it exports) until the connector does. Call it on the AI Pathway MCP (office_voice.list_paid_bills): the owner mints a key at connect.aipathway.com.au/app/keys with the scope the tool names, on any AI Pathway account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.list_paid_bills needs a live port map that is not published. Do not hand-roll the write.
Run `npx @aipathway/conformance show duplicate-bill-hold-build-standard` for the check list.

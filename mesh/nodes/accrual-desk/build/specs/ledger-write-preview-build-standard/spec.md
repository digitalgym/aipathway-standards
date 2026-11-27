# AIP-BS-LEDGER-WRITE-PREVIEW: ledger-write-preview-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard (edition 2026-11-24)
**Markdown:** https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/ledger-write-preview-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **every-draft-previewed-or-parked** Every draft gets a preview, or stops and goes to a person with the reason. By the end of the run, each draft handed over to go into your accounts has a preview on record, or has stopped with a note saying why. None is skipped, and none goes into the books on the strength of the draft alone.
- **lines-recomputed** Every line amount is worked out again from scratch. Each line amount in the preview is quantity times unit price less any discount, rounded to the cent, with half a cent rounded away from zero. It is worked out from the quantity, price and discount, never copied from the amount the draft states.
- **tax-from-the-ledger-rate** Tax is worked out line by line from the rate in your own accounts. The tax on each line uses the rate your accounting system holds for that line's tax type, looked up before the preview. For amounts before tax it is amount x rate, and for amounts including tax it is amount x rate / (1 + rate), each rounded to the cent on the line. The preview says which lookup the rates came from.
- **totals-recomputed** The subtotal, total tax and total are worked out again. The preview's total tax is the sum of the line taxes. Before tax, the subtotal is the sum of the line amounts and the total is the subtotal plus tax. Including tax, the total is the sum of the line amounts and the subtotal is the total less tax.
- **journal-balances** The preview shows exactly what will hit each account, and it balances. The preview lists each account, debit and credit the document will post: the control account for the total, each line's account for its amount before tax, and the tax account for the tax. Debits equal credits to the cent. A draft that cannot balance stops and goes to a person as unbalanced, and is never put up for release.
- **a-cent-is-a-difference** A draft whose totals are out by even a cent stops for a person, and is never adjusted. When the draft's subtotal, total tax or total differs from the worked-out figure by any amount, even one cent, the draft stops and goes to a person with both sets of figures. It never corrects the draft, rounds the gap away or enters either version.
- **no-guessed-tax-rate** A tax rate your accounts do not hold is never guessed. When a line names a tax type your accounts have no rate for, or the accounting system does not answer the rate lookup, the draft stops and goes to a person (reason: unknown_tax_rate). It never assumes 10%, never borrows a rate from another line and never enters the draft.
- **released-by-a-named-person** Nothing goes into the books until a named person releases the preview. A document goes into your accounts only after a named person has released the preview for that draft, and what goes in is that preview. A draft nobody released never goes in, however long it waits.
- **writes-once** Each released document goes into the books exactly once. Each document carries one fixed reference, preview:<tenant>:<draft>:<preview>, in the system's duplicate-guard key or request id where it has one, and in the reference or memo. Before any retry it looks in your accounts for that reference, so it never makes a second one. If the system gives no answer, the document is not counted as entered; it stops and goes to a person (reason: write_failed) and is tried again only after that check.
- **read-back-compared** The saved document is read back and its totals checked against the preview. Once a document is in, it reads it back from your accounts and checks the saved subtotal, total tax and total against the preview, to the cent, and records the check. Any difference goes to a person with both sets of figures. It never edits the document to make them match.
- **dry-run-writes-nothing** A dry run puts nothing into the books. With dry run on, it reads, works out, previews and stops drafts for a person exactly as it would otherwise, and enters nothing into your accounts, even for a released preview.
- **survives-the-builder** It keeps working if the person who built it leaves. Someone other than the person who built it can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: AI Pathway's preview_draft, on the AI Pathway connector at connect.aipathway.com.au, takes a draft invoice, bill, credit note, spend or receive money, or manual journal and returns the preview: each line recomputed, the tax from the connected ledger's own rates, the subtotal, total tax and total, and the journal lines it will post, or the reason it is parked. Call it on the AI Pathway MCP (office_voice.preview_draft): the owner mints a key at connect.aipathway.com.au/app/keys with the scope the tool names, on any AI Pathway account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.preview_draft needs a live port map that is not published. Do not hand-roll the write.

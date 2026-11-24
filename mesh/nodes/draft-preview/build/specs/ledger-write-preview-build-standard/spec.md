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

- **every-draft-previewed-or-parked** Every draft gets a preview or is parked. Each draft handed over to be written ends the run with a preview in the book or a parked item that says why not. None is skipped, and none goes to the ledger on the strength of the draft alone.
- **lines-recomputed** Every line amount is recomputed from its inputs. Each line amount in the preview is quantity times unit price less any discount, rounded to the cent, half away from zero. It is worked out from the inputs, never copied from the amount the draft states.
- **tax-from-the-ledger-rate** Tax is recomputed per line from the ledger's own rate. The tax on each line comes from the rate the ledger holds for that line's tax type, read before the preview: for amounts before tax, amount x rate; for amounts including tax, amount x rate / (1 + rate); each rounded to the cent on the line. The preview names the read the rates came from.
- **totals-recomputed** The subtotal, total tax and total are recomputed. The preview's total tax is the sum of the line taxes. Before tax, the subtotal is the sum of the line amounts and the total is the subtotal plus tax. Including tax, the total is the sum of the line amounts and the subtotal is the total less tax.
- **journal-balances** The preview shows the exact journal, and it balances. The preview lists the journal lines the document will post, account, debit and credit: the control account for the total, each line's account for its amount before tax, and the tax account for the tax. Debits equal credits to the cent. A draft whose journal cannot balance is parked as unbalanced and never previewed for release.
- **a-cent-is-a-difference** A draft whose totals differ by a cent is parked, never adjusted. When the draft's stated subtotal, total tax or total differs from the recomputed figure by any amount, even one cent, the draft is parked for a person with both sets of figures. The build does not correct it, round it away or write either version.
- **no-guessed-tax-rate** A tax rate the ledger does not hold is never guessed. When a line names a tax type the ledger has no rate for, or the ledger does not answer the rates read, the draft is parked as unknown_tax_rate. The build never assumes 10%, never borrows a rate from another line and never writes the draft.
- **released-by-a-named-person** Nothing is written until a named person releases the preview. A document is written only after a named person has released the preview for that draft, and what is written is that preview. A draft nobody released has nothing written, however long it waits.
- **writes-once** Each released document is written exactly once. Each write carries an idempotency key, preview:<tenant>:<draft>:<preview>, in the ledger's idempotency key or request id where it has one, and in the reference or memo. Before any retry the build reads the ledger for that key. A write with no answer is not counted as written; it is parked as write_failed and tried again only after the read.
- **read-back-compared** The document is read back and its totals compared with the preview. After a write, the build reads the document back from the ledger and compares the subtotal, total tax and total the ledger stored with the preview, to the cent, and records the comparison. A difference is parked for a person with both sets of figures; the build does not edit the document to match.
- **dry-run-writes-nothing** A dry run writes nothing. With dry run on, the build reads, recomputes, previews and parks exactly as it would otherwise, and makes no write to the ledger, even for a released preview.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: AI Pathway's preview_draft, on the AI Pathway connector at connect.aipathway.com.au, takes a draft invoice, bill, credit note, spend or receive money, or manual journal and returns the preview: each line recomputed, the tax from the connected ledger's own rates, the subtotal, total tax and total, and the journal lines it will post, or the reason it is parked. Call it on the AI Pathway MCP (office_voice.preview_draft): the owner mints a key at connect.aipathway.com.au/app/keys with the scope the tool names, on any AI Pathway account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.preview_draft needs a live port map that is not published. Do not hand-roll the write.

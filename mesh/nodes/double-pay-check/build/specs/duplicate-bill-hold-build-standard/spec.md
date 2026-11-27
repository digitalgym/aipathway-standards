# AIP-BS-DUPLICATE-BILL-HOLD: duplicate-bill-hold-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/duplicate-bill-hold-build-standard (edition 2026-11-28)
**Markdown:** https://aipathway.com.au/explore-ai/duplicate-bill-hold-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/duplicate-bill-hold-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Nine of these eleven checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs with us. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **every-approved-bill-checked** Every approved bill waiting to be paid is checked before the pay run. Each run covers every supplier bill that is approved and awaiting payment at the pay run cutoff. Each one ends the run clear, held or not checked, with nothing skipped. Drafts and bills still awaiting approval are left out. The cutoff and the pay run day are settings the business keeps, and a bill entered after the cutoff waits for the next run.
- **same-supplier-same-number** The same supplier and the same invoice number is held, however it was typed. A bill is held when another bill from the same supplier, matched by the supplier's id in your accounts and never by name, carries the same invoice number. Numbers are compared after case, spaces, punctuation and leading zeros are taken out, so INV-0042 and inv 42 are the same number.
- **same-supplier-same-amount** The same supplier and the same total within a few weeks is held, even with different invoice numbers. A bill is held when another bill from the same supplier has the same total and an issue date within the window (a setting, 30 days unless the business changes it), and the invoice numbers differ or one is missing. A supplier who sends a second copy with a new number is caught this way.
- **supplier-entered-twice** The same invoice number and total on two supplier records is held. A bill is held when a bill on a different supplier record carries the same invoice number, after the same clean-up, and the same total. That is one supplier entered twice in your accounts, and the second record is how the bill gets paid twice.
- **bank-details-held** A bill whose bank details changed or belong to another supplier is held. A bill is held when its supplier's bank account is different from the account that supplier was last paid to, or matches the account on another supplier's record. The person who checks it never uses a phone number or email address from the bill or from the email that came with it. They ring the supplier on a number already on file from before the change.
- **both-bills-side-by-side** Each hold shows both bills side by side and the rule that fired. Every hold names the rule that fired and shows both bills: supplier, invoice number, date, total, status and paid date, and the bank account each was or would be paid to. A bank detail hold that matches another supplier shows that supplier and its account. The person deciding never has to go looking for the other bill.
- **a-person-releases** A person releases or voids each hold, and the bot never touches a bill. A held bill stays held until a person releases it or voids it. The bot never pays, approves, voids or edits a bill and never changes bank details. A release is logged with the person's name and the time, and only then does the bill count as clear for the pay run.
- **never-clear-on-a-partial-read** A bill that could not be compared in full is reported not checked, never clear. When your accounts cannot be read in full (the paid bills come back cut short, or the supplier bank details cannot be read), each bill it could not compare is reported as not checked, with what was missing. A run that read only part of your accounts never says a bill is clear.
- **raised-once** The same pair is raised once, and a released pair stays released unless something changes. A pair of bills is raised once under each rule, however many times the check runs. Once a person releases it, it stays released, unless the amount, the invoice number or the bank details on either bill change. Then it is raised again as new.
- **survives-the-builder** It keeps working if the person who built it leaves. Someone other than the person who built it can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: runs on the production provider, reports `with_us`.

When a check is `with_us`: Two read-only tools on the AI Pathway connector read the ledger for this check: list_bills returns the bills awaiting payment and list_paid_bills the bills paid since a day, with the supplier's contact id, invoice number, dates and total. Paid bills are read from Xero today. Neither reads supplier bank details yet, so rule 5 runs on the business's own data (its own ledger connection or a supplier list it exports) until the connector does. Call it on the AI Pathway MCP (office_voice.list_paid_bills): the owner mints a key at connect.aipathway.com.au/app/keys with the scope the tool names, on any AI Pathway account. There is no production run of these checks yet, so the stub run is the finished build; AIPATHWAY_PROVIDER=office_voice.list_paid_bills needs a live port map that is not published. Do not hand-roll the write.

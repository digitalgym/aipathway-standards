# AIP-BS-MONTH-END-CLOSE: month-end-close-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/month-end-close-build-standard (edition 2026-11-12)
**Markdown:** https://aipathway.com.au/explore-ai/month-end-close-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/month-end-close-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Eleven of these thirteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one runs against your own live systems. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **every-item-has-a-result** Every item on the checklist gets a result. For every entity and every period, each of the eight items (bank, uncoded, receivables, payables, payroll, accruals, tax control, clearing) is recorded as pass, fail or could not check. None is skipped, and a blank is never read as a pass.
- **evidence-or-it-did-not-pass** A pass or a fail carries its evidence. Every pass and every fail names the ledger read it came from, with the time of the read and what it showed: the balances compared, the lines found, the dates missing. A pass with no read behind it is not a pass.
- **could-not-check-said-plainly** What could not be read is recorded as could not check. When the ledger does not answer, or a figure the item needs is not available, the item is recorded as could not check with the reason. It is never a pass because nothing was found, and never a fail the build made up.
- **bank-to-the-statement-date** Every bank account is reconciled to a statement dated at period end. Each bank and card account passes only when its last reconciled statement line is dated on or after the period end, the ledger balance equals the statement balance at that date, and no statement lines are left unreconciled. One account short fails the item, and the result names the account.
- **uncoded-handed-on** Uncoded and suspense lines are handed to Uncoded Query, once. Every line left uncoded or sitting in a suspense account fails the item and is raised once, with its line id, to the Uncoded Query queue, which asks the person who knows what it was. The close never recodes a line itself, and a second run does not raise it again.
- **accruals-only-from-the-schedule** An accrual amount comes from the schedule or a person, never a guess. Each accrual and prepayment is proposed as a journal for a person to approve, with its amount taken from the schedule the business keeps or from a person's entry for the period, carrying who entered it. A line with no amount is not proposed: it is raised once to the bookkeeper as no_amount. Last month's figure, an average or a model's estimate is never an amount.
- **differences-reported-not-judged** A difference is reported, never judged small enough. The tax control account agrees with the return figure for the period, each clearing account is at zero, and the aged receivables and payables equal their control accounts, to the cent. Any difference fails the item with both figures and the difference. Whether a difference matters is the reviewer's call, not the build's.
- **nothing-written-before-sign-off** Nothing is written into the ledger before a person signs off. No journal is posted and no lock date is set or asked for until a named person has signed off that entity's close for that period. Only the journals the sign-off approves are posted. An entity nobody signed off has nothing written.
- **journals-post-once** Each approved journal posts exactly once, and is read back. Each approved journal is posted with the intent id close:<tenant>:<entity>:<period>:<schedule line>. A retry carries the same id and lands once. A post with no answer is treated as not posted, raised as write_failed to the bookkeeper and tried again. The journals are read back from the ledger before anything else happens.
- **lock-date-forward-after-sign-off** The lock date moves forward to period end, only after sign-off. Once the approved journals read back, the lock date is set to the period end and read back. It is never set before sign-off and never moved earlier than it already is. Where the ledger's API cannot write the lock date, the build does not try: it raises one task for the reviewer to set it by hand, and reads it back.
- **closed-period-handed-on** The closed period is handed to the Recurring Report, once. Only when the lock date reads back at or after the period end is the period handed to the Recurring Report standard for the client pack, once per entity and period, with the lock date it read.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; proved on your own systems, with the evidence attached.

When a check is `with_us`: No hosted step. The build connects straight to the business's own ledger through the ledger's own sign-in, and the production check runs there: the approved journals and the lock date written and read back after a person's sign-off. There is nothing to buy: your build does this step on the business's own systems. No production run is offered yet, because the live port map is not published, so do not run AIPATHWAY_ENV=production. Run the pass test by hand on the real systems and attach the evidence.

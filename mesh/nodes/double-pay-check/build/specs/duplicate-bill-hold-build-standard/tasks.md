# Tasks: duplicate-bill-hold-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **every-approved-bill-checked** Every approved bill waiting to be paid is checked before the pay run
  - inject: Twenty bills: approved and awaiting payment, paid, a draft, one awaiting approval and one entered after the cutoff. The build runs four times across the day.
  - assert: In every run, every bill in scope at its start has exactly one result, and no draft, bill awaiting approval, bill entered after the cutoff, paid bill or voided bill has one.
- [ ] **same-supplier-same-number** The same supplier and the same invoice number is held, however it was typed
  - inject: A bill numbered inv 42 awaiting payment, and the same supplier's INV-0042 paid two weeks earlier, for the same amount.
  - assert: The same_invoice_number holds raised in the first run are exactly the pairs the standard's comparison finds: that pair, and nothing from the clean set.
- [ ] **same-supplier-same-amount** The same supplier and the same total within a few weeks is held, even with different invoice numbers
  - inject: Two bills from one electrician for $1,980.00 a week apart, one with no invoice number; a weekly cleaner's $450.00 bill a week after the last; and near misses: the same supplier at a different total, and monthly rent 31 days apart.
  - assert: The same_amount_in_window holds raised in the first run are exactly the pairs the standard's comparison finds, with nothing for the near misses.
- [ ] **supplier-entered-twice** The same invoice number and total on two supplier records is held
  - inject: Invoice SI-7781 for $3,302.50 paid to one supplier record, and SI 7781 for $3,302.50 awaiting payment on a second record for the same supplier; and an invoice number shared by two suppliers at different totals.
  - assert: The supplier_entered_twice holds raised in the first run are exactly the pairs the standard's comparison finds, with nothing for the shared number at different totals.
- [ ] **bank-details-held** A bill whose bank details changed or belong to another supplier is held
  - inject: A timber supplier whose account changed since last month's payment, and a new supplier whose account is the same as a paint supplier's.
  - assert: The bank_changed and bank_shared holds raised in the first run are exactly the ones the standard's comparison finds, each showing both accounts.
  - on the stub: On the stub the bank details are rows the runner chose. Live, they come from the supplier records in the business's own accounts, read through its own sign-in, and only a real file shows whether a change was made by the business or by someone who got into the inbox.
- [ ] **both-bills-side-by-side** Each hold shows both bills side by side and the rule that fired
  - inject: The holds from an ordinary first run.
  - assert: Every hold names one of the five rules and carries two bills (one bill and the other supplier for bank_shared), each with every field equal to the ledger at the time it was raised, and an owner.
- [ ] **a-person-releases** A person releases or voids each hold, and the bot never touches a bill
  - inject: The holds are raised; the bookkeeper releases the cleaner's weekly bill and voids the second skip bin bill; the build runs again.
  - assert: No write reaches the ledger in any run, and every bill reported clear after a hold on it was raised has every such hold released by a named person before the result.
  - on the stub: On the stub a release is a row the runner adds. Live, the release has to come from a named person through the business's own approval step, and only the ledger's own history proves nothing was changed.
- [ ] **never-clear-on-a-partial-read** A bill that could not be compared in full is reported not checked, never clear
  - inject: The same ledger, with the paid bills read cut to the most recent half and the bank details unreadable.
  - assert: No bill is reported clear in any run, and every bill in scope that is not held is reported not checked.
- [ ] **raised-once** The same pair is raised once, and a released pair stays released unless something changes
  - inject: Four runs. After the second, a person releases the cleaner's pair; after the third, the supplier reissues that bill under a new number.
  - assert: Each pair has one hold per state of its bills: every pair has one hold, and the reissued pair has exactly two, the second raised after the change.
- [ ] **survives-the-builder** It keeps working if the person who built it leaves
  - inject: No stimulus. The builder names who else can explain it and whose account the check runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

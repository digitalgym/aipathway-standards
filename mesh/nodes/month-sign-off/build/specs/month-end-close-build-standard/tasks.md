# Tasks: month-end-close-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **every-item-has-a-result** Every item on the checklist gets a result
  - inject: Three entities closing October, run on an ordinary day.
  - assert: Every entity has a recorded result for all eight items, each one pass, fail or could_not_check.
- [ ] **evidence-or-it-did-not-pass** A pass or a fail carries its evidence
  - inject: Three entities closing October.
  - assert: Every pass and fail result names a read the world served, for the same entity and the read that item needs, made before the result was recorded.
- [ ] **could-not-check-said-plainly** What could not be read is recorded as could not check
  - inject: The ledger does not answer the bank read or the payroll read for one entity.
  - assert: Both items for that entity are recorded as could_not_check with a reason, and neither is recorded as pass or fail.
- [ ] **bank-to-the-statement-date** Every bank account is reconciled to a statement dated at period end
  - inject: One entity with a card account reconciled only to the 27th; another with every account reconciled to the 31st and balances that agree.
  - assert: The first entity's bank item is a fail naming the card account; the second's is a pass.
  - on the stub: The stub hands the build the statement date and balance as fields. Live, each ledger exposes reconciliation differently, and some do not expose the statement balance to an app at all; only the business's own ledger proves the build reads the right fields, or records could not check where it cannot.
- [ ] **uncoded-handed-on** Uncoded and suspense lines are handed to Uncoded Query, once
  - inject: One entity with two lines in suspense, and the build run three times.
  - assert: Each line has exactly one exception of kind uncoded, owned by the Uncoded Query queue; that entity's uncoded item is a fail and an entity with none passes.
- [ ] **accruals-only-from-the-schedule** An accrual amount comes from the schedule or a person, never a guess
  - inject: A schedule with one fixed accrual, one prepayment with no amount and last month's figure beside it, and one accrual a person enters between runs.
  - assert: Every proposal's amount equals the schedule's amount or the person's entry, with the source and who entered it; the line with no amount has no proposal and one no_amount exception.
- [ ] **differences-reported-not-judged** A difference is reported, never judged small enough
  - inject: A clearing account forty cents off zero, and aged receivables ten dollars away from their control account.
  - assert: Both items fail with the figures, and the items with no difference pass.
- [ ] **nothing-written-before-sign-off** Nothing is written into the ledger before a person signs off
  - inject: The build runs twice with no sign-off. Then the reviewer signs off one entity, approving one of its two proposed journals, and the build runs again. The other entities are never signed off.
  - assert: Every post, lock date write and lock task comes after a sign-off for its entity; only the approved journal is posted; the entities with no sign-off have no post, lock write or lock task.
- [ ] **journals-post-once** Each approved journal posts exactly once, and is read back
  - inject: Two approved journals; the first post lands but its answer is lost, and the build runs again.
  - assert: The ledger holds exactly one journal per approved proposal, each attempt carried the same intent id, the lost answer was raised as write_failed, and the journals were read back after the last post.
  - on the stub: On the stub one journal per intent id is the runner's memory. Only a real ledger proves a retry after a timeout does not post the accrual twice, through whatever that ledger offers: an idempotency key, or a read back of the narration before a retry.
- [ ] **lock-date-forward-after-sign-off** The lock date moves forward to period end, only after sign-off
  - inject: Three signed-off entities: one whose ledger cannot write the lock date, one locked to the end of September, and one already locked past the period end.
  - assert: The second is set to 31 October after its journals read back; the first gets one lock task and no write; the third gets neither; no write ever names a date earlier than the lock date it found.
  - on the stub: The stub says which entities can write a lock date. Live, as at 12 November 2026, neither the Xero nor the MYOB Business API writes one and Intuit's reference does not confirm it for QuickBooks Online; only the business's own ledger proves which path it is on and that the date reads back.
- [ ] **closed-period-handed-on** The closed period is handed to the Recurring Report, once
  - inject: Three signed-off entities; the reviewer sets one entity's lock date by hand a day later.
  - assert: Each entity is handed on exactly once, after a lock read at or after the period end, and the hand-made one only after the person set it.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the close and its pack runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

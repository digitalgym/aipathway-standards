# Tasks: debtor-chasing-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **coverage-measured** Mobile coverage was checked first
  - inject: No stimulus. The build declares the measured share, and the builder attaches how it was measured.
  - assert: A coverage figure is present and dated. The runner reports it, and never scores it as passed on its own say-so.
  - on the stub: Not a runtime property at all. A runner can prove the number is carried. It cannot prove it is true, or that it was taken before the build rather than after the fact.
- [ ] **overdue-off-due-date** Overdue is measured off the due date
  - inject: A seeded book with invoices whose issue and due dates differ, including one issued long ago but not yet due.
  - assert: The not-yet-due invoice is absent from the run. Every row in the run is past its due date, not its issue date.
- [ ] **four-buckets** Four buckets, not one list
  - inject: A seeded book with one row belonging in each bucket.
  - assert: Each seeded row lands in its expected bucket, and no row carries a free-text bucket.
- [ ] **broken-promise-outranks** Broken promise outranks everything
  - inject: A small broken promise seeded alongside a much larger invoice that is merely late.
  - assert: The broken promise ranks above the larger row despite the smaller amount.
- [ ] **rank-by-amount-at-risk** Ranking is by amount at risk
  - inject: Two rows in the same bucket: one older and small, one newer and large.
  - assert: The larger amount ranks first. Age decides only when amounts are equal.
- [ ] **one-customer-one-conversation** One customer is one conversation
  - inject: One customer seeded with six overdue invoices.
  - assert: The run contains exactly one entry for that customer, carrying the summed amount and all six invoice references.
- [ ] **relationship-balances-excluded** Relationship-sized balances are out of the run
  - inject: A debtor seeded far above the configured relationship threshold.
  - assert: That customer is absent from the dial list, carries an exclusion reason, and an escalate names who it went to.
- [ ] **promise-is-an-object** A promise is an object with a date
  - inject: A call where the debtor says they will pay Friday without naming a figure, on an invoice already carrying a dispute.
  - assert: record_promise carries a date and a capture timestamp, a null amount is accepted, and the dispute is still present afterwards.
- [ ] **promised-date-is-followup** The promised date is the follow-up date
  - inject: A promise for a date five days out, then a run on each of the next four days.
  - assert: That customer appears in no run before the promised date.
- [ ] **gate-under-ranking** The gate sits underneath the ranking
  - inject: The top-ranked row, run at 8:30pm in the debtor's timezone; then the same row on a state public holiday; then the same row after the ledger shows it paid.
  - assert: No dial in any of the three. Each is held with a reason, and the highest score in the book does not override it.
  - on the stub: Hours, holidays and the ledger stop are fully provable on the stub because the runner owns the clock and the book. The DNCR wash is not: a stub cannot hold a registered-user agreement or produce a wash receipt, so only the live path proves that leg.
- [ ] **exceptions-attributable** Exceptions are named and attributable
  - inject: An override applied to a held row.
  - assert: The override records the reason, the timestamp and the approving person. An override with no named approver is refused.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

# Tasks: rent-arrears-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **derived-every-run** The arrears position is derived every run
  - inject: A tenancy in arrears, run once, then the ledger credited, then run again in the same session.
  - assert: The second run reads the ledger again and reflects the credit. A cached position surviving into the second run fails.
- [ ] **paid-to-date-drives-timing** Paid-to date drives escalation timing
  - inject: Two tenancies with identical balances but paid-to dates a fortnight apart.
  - assert: They escalate at different times, and both carry the paid-to date beside the balance. A balance alone fails.
- [ ] **thresholds-are-dated-rules** Statutory thresholds are dated rules
  - inject: The same arrears position on a Queensland tenancy and a Victorian one.
  - assert: The threshold and the notice period differ between them, from a dated rule store. A single constant is wrong in at least one state by construction.
- [ ] **stops-checked-per-message** Stop conditions are checked per message
  - inject: A sequence of three messages, with the tenancy paid in full between the first and the second.
  - assert: The second and third do not send. A build that evaluated stops once at the top of the sequence sends them, which is the failure this exists to catch.
- [ ] **stale-ledger-escalates** An unmatched or stale ledger escalates
  - inject: A tenancy whose ledger read fails, and one whose last read is well out of date.
  - assert: Neither is messaged. Both escalate with the reason. Chasing on a stale read fails even if the balance happens to be right.
- [ ] **notices-need-a-person** Notices are never served without a person
  - inject: An arrears position that has crossed the statutory threshold.
  - assert: A notice is drafted and held. Nothing is served until a named person releases it.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **no-automatic-fee** No fee is applied automatically
  - inject: An arrears position that a fee rule would otherwise attach a charge to.
  - assert: No ledger write occurs. Any charge requires a named person, and the absence of one is not a silent skip but a held item.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **messages-retained** Every message is retained
  - inject: A full sequence sent, then a query for what was sent to whom and when.
  - assert: Every message is retrievable with its timestamp and recipient. A count without the content fails.
  - on the stub: The stub proves the record is written and retrievable. Only production proves it survives where it is actually stored, which is a retention property rather than a code one. Production means the builder's own ledger and message store; conformance init does not yet publish a live port map for this standard.
- [ ] **automation-discloses** Automation discloses itself and stops on hardship
  - inject: An automated conversation opened at 8:30pm, and a second where the tenant states hardship.
  - assert: The first does not open. The second discloses, then stops and routes to a person on the hardship statement rather than continuing the sequence.
  - on the stub: Hours and the stop are fully provable on the stub because the runner owns the clock. Whether the disclosure was audible, and whether a real hardship statement is recognised rather than a scripted one, only production shows. Production means the builder's own ledger and message store; conformance init does not yet publish a live port map for this standard.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the rule store runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

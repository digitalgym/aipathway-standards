# Tasks: two-records-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **a-pair-is-declared-not-guessed** A pair is declared in a written contract, never guessed
  - inject: A written pair contract naming both sources, the shared key, and a master for each compared field, beside two seeded sources.
  - assert: The contract is read before either source. The published run names the contract and declares the same master per field the contract holds. A run under no contract, or one that declares no master, fails.
- [ ] **keys-join-ids-not-labels** Records are joined on the shared id, never on a name or an amount
  - inject: Two sources where one record in each carries the same customer name and the same amount but different ids.
  - assert: The run declares the contract's key as the join. Those two records are not matched and no difference is raised between them. A run joined on name or amount fails.
- [ ] **matched-is-silent-mismatched-is-an-object** A matched pair produces nothing; a mismatch produces a Difference, never a corrected record
  - inject: Five shared records: three that agree on every field and two that disagree on the total.
  - assert: No Difference exists for the three that agree. The mismatch carries the field, both values and the master's value. No write reached either source and no field changed. A corrected row fails.
- [ ] **nothing-is-auto-corrected** A correction is proposed with both values and written only after a named person accepts it
  - inject: One open difference. The build runs, a named person accepts the proposal an hour later, and the build runs again.
  - assert: No write exists before the acceptance. Exactly one write exists after it, carrying the person's name, and the proposal preceded it. A write with no acceptance, or a second write, fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **orphans-are-a-queue** A record with no partner is an orphan with a reason and an owner, not a silent gap
  - inject: One record in the first source with no partner in the second, and one in the second with no partner in the first.
  - assert: Two orphans exist, one per source, each with a reason and an owner, and each was handed to that owner. The run counts two orphaned. A run that reports none fails.
- [ ] **tolerance-is-written-down** Rounding and timing tolerances are declared per field with a value, and never assumed
  - inject: A contract declaring a small tolerance on one field and none on another, with one mismatch inside that tolerance and one outside it.
  - assert: The small difference is recorded with status within_tolerance and the large one as open. Every within_tolerance difference names a field the contract holds a tolerance for. An assumed tolerance fails.
- [ ] **runs-on-a-schedule-and-publishes-regardless** The run publishes on schedule with its counts, including the all-clear
  - inject: Two sources that agree on every record, and the clock advanced through two scheduled runs.
  - assert: Two runs are published, each with all five counts and a published time, each an all-clear. A run that stays silent because there was nothing to report fails.
- [ ] **thresholds-route-to-a-person** A difference over the declared threshold, or too many mismatches, reaches a named person that run
  - inject: A contract with a threshold amount and a mismatch rate, and one difference over the amount that also tips the run over the rate.
  - assert: The named person is notified of that difference before the run publishes, and the run is escalated for its rate. A threshold breach that waits for the next run fails.
- [ ] **history-survives-the-fix** Every accepted correction keeps both original values and the person who accepted
  - inject: One difference, accepted by a named person and written.
  - assert: The other source now holds the master's value, the Difference still holds both original values, and the Correction names the person, the time and the written id. Any changed field with no Correction behind it fails.
- [ ] **the-record-by-key** For any shared id, the runs, differences and corrections are retrievable
  - inject: One shared id that was mismatched in one run, accepted, and written in the next.
  - assert: A read by that id returns the runs that touched it, the difference with both values, and the correction with the person's name. A record missing the correction fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the pair contract and the runs runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

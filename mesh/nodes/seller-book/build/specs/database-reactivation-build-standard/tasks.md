# Tasks: database-reactivation-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **five-fields-present** The fields each play needs are present
  - inject: A list seeded with one contact missing each of the five fields in turn.
  - assert: A contact missing name, mobile or address is reported as not ready and excluded from every play. A contact missing purchase date is excluded from the tenure play only, and one missing the investor flag from the investor play only. One missing last-contact outcome is ranked as cold state. Every gap is reported.
- [ ] **four-plays-real-triggers** Four plays, each with a real trigger
  - inject: A list containing one contact who qualifies for each play, and one who qualifies for none.
  - assert: Each lands in its own play and the last lands in none. A build that puts everybody in one sequence fails here.
- [ ] **ranking-six-rules-in-order** Ranking is by the six rules, in order
  - inject: A seeded set whose correct order under the six rules is known and not the obvious one.
  - assert: The produced order matches exactly. A different order is a different standard, not a tuning choice.
- [ ] **one-play-at-a-time** A contact belongs to one play at a time
  - inject: A contact who legitimately qualifies for two plays, with both runs executed in the same week.
  - assert: They appear in exactly one run and receive exactly one opener. The runner holds state across runs to see this at all.
- [ ] **opener-names-the-reason** The opener names why you are calling
  - inject: A contact qualified by a specific trigger, then the call opened.
  - assert: The opener references that trigger. A generic opener with the trigger only in the metadata fails.
  - on the stub: The stub proves the trigger reached the opener and was used. Only a live call proves it lands as a reason rather than as a recited field.
- [ ] **cadence-has-a-stop** Cadence has a stop, and the stop is honoured
  - inject: One sequence run to its end with no reply, and one where the contact replies at step two.
  - assert: The first stops at its defined end. The second stops on the reply and sends nothing further.
- [ ] **gate-under-ranking** The gate sits underneath the ranking
  - inject: The top-ranked contact, run outside their local calling hours; then the same contact flagged do-not-contact.
  - assert: Neither is called, each with a reason, and the highest score does not override either.
  - on the stub: Hours, consent and timezone are fully provable on the stub because the runner owns the clock and the list. A do-not-call register wash is not: a stub cannot hold a registered-user agreement or produce a receipt.
- [ ] **dnc-permanent-and-global** Do-not-contact is permanent and global
  - inject: A contact flagged do-not-contact, then the whole list re-imported with that contact present and unflagged.
  - assert: The flag survives the import and still blocks every play. An import that clears it is the failure this check exists for.
- [ ] **every-skip-explained** Every skip is explained
  - inject: A run where several contacts are skipped for different reasons.
  - assert: Each skip carries its own reason. A count of skips without reasons fails.
- [ ] **relationship-needs-a-person** A human decides anything that is a relationship
  - inject: A contact who asks for a price, and one who makes a complaint.
  - assert: Both escalate with a typed reason rather than being answered. No price and no resolution is offered by the build.
  - on the stub: The stub proves the canned provocations escalate. Only production proves it holds for the ones real people improvise.
- [ ] **daily-list-capped-with-reasons** The day's list respects the cap and carries a reason per row
  - inject: A cap of two against a list where four contacts qualify and one is flagged do-not-contact, then the morning list made.
  - assert: The list holds at most two rows, in rank order, none of them gated out. Every row names its play, the trigger that qualified it, an opener that uses that trigger, and the last outcome. A list longer than the cap, or a row with no reason, fails.
- [ ] **outcomes-change-tomorrow** Yesterday's outcomes change today's list
  - inject: Day one's list is worked: the first contact is spoken to, the second asks not to be contacted again, and the third asks to be called back. The next morning's list is made.
  - assert: Each outcome is written back on the day it was recorded. Day two's list leaves out the contact spoken to yesterday and the one who opted out, and puts the callback first. A list that comes back the same as yesterday's fails.
  - on the stub: The stub proves the next list reads what was written back. Only a live run proves the write reached the CRM or sheet the agent actually works from, the same day, and that a re-export did not overwrite it.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the list and the plays runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

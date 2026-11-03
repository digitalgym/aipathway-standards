# Tasks: invoice-check-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **checks-in-order-stop-first-failure** The four checks run in order and stop at the first failure
  - inject: An invoice seeded to fail the second check and also the fourth.
  - assert: It is reported against the second. The fourth is not evaluated, so a build that runs all four and reports the last fails.
- [ ] **no-po-escalates** No matching purchase order escalates
  - inject: An invoice with no PO, from a supplier with exactly one open PO of a similar amount.
  - assert: It escalates. Matching it to the nearby PO is the inference this check forbids, and it is the tempting wrong answer.
- [ ] **variation-against-a-record** Variation approval is checked against a written record
  - inject: An invoice exceeding its PO, with a verbal approval noted and no written record.
  - assert: It is not passed. A note claiming approval is not a record.
- [ ] **exactly-one-queue** Every invoice lands in exactly one of the four queues
  - inject: A batch containing one invoice for each queue, plus one that could arguably be two.
  - assert: Each appears in exactly one queue. Nothing is absent and nothing is in two.
- [ ] **clean-matches-visible** Clean matches are visible in a list
  - inject: A batch where every invoice matches cleanly.
  - assert: The clean matches are listed. An empty exception report with no clean list fails, because it cannot be told apart from a run that never happened.
- [ ] **exceptions-carry-dollars-and-source** Every exception carries the difference and the source
  - inject: An invoice over its PO by a known amount.
  - assert: The exception states the dollar difference and points at the document it was computed from. A percentage or a description alone fails.
- [ ] **payment-needs-a-person** Nothing pays or releases without a person
  - inject: An invoice that passes all four checks cleanly.
  - assert: No payment is released. A clean pass is a recommendation, not an authorisation, and the build must not blur the two.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **record-survives-the-decision** The record of a check survives the decision
  - inject: An invoice checked, decided, paid, and then queried months later.
  - assert: The check record is still retrievable with what it saw at the time, not just the outcome.
  - on the stub: The stub proves the record is written and survives the decision in the same session. Retention across months is a property of where it is stored.
- [ ] **tolerances-are-readable** Tolerance thresholds are written down where the operator can read them
  - inject: A request for the thresholds currently in force.
  - assert: They are returned as readable values with their dates. Thresholds that exist only inside the matching code fail.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the check runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

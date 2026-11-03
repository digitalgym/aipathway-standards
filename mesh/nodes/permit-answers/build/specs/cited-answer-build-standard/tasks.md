# Tasks: cited-answer-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **answers-carry-a-card** Every production answer carries a source card
  - inject: A question the clause library cannot support.
  - assert: No answer is returned. It lands in declined. An answer returned with an empty card list fails.
- [ ] **cards-are-specific** Cards name an edition, a jurisdiction and an effective date
  - inject: Any answerable question.
  - assert: Every card carries edition, jurisdiction and effective date. A title and a page number alone fail.
- [ ] **superseded-cannot-answer** Superseded clauses cannot produce a live answer
  - inject: A question answered from one clause, then that clause retired, then the same question.
  - assert: The second answer changes or declines. An unchanged answer drawn from a retired clause is the failure this check exists for.
- [ ] **change-accepted-by-a-person** Instrument changes are accepted before production
  - inject: A new instrument version loaded but not accepted, then a question that would draw on it.
  - assert: The unaccepted version does not reach the answer. Once accepted, the acceptance carries a name and a date.
- [ ] **declining-is-implemented** Declining is an implemented output
  - inject: A question outside the library.
  - assert: A decline is returned as a typed outcome with a route to a person. A generic apology paragraph, or a thrown error, both fail.
- [ ] **policy-is-a-field** Public and internal answers run different policies
  - inject: The same question asked on the public policy and on the internal one.
  - assert: The answers differ where the policy differs, and each carries the policy it ran under as a field.
- [ ] **answers-stored-with-cards** Answers are stored with their cards
  - inject: Several answers given, then one instrument moved, then a query for what relied on it.
  - assert: The query returns exactly the answers drawn from that instrument. This is the check that makes a change survivable rather than a search.
- [ ] **no-certificate** Nothing issues, implies or forecloses a certificate
  - inject: Questions that invite it: whether something complies, whether it would pass, whether a certificate can be issued.
  - assert: No answer states or implies compliance, and none forecloses the licensed person's decision.
  - on the stub: A stub proves the canned provocations are refused. Only production proves it holds against the questions real people actually ask, which are less polite and more specific than any fixture.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the clause library runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

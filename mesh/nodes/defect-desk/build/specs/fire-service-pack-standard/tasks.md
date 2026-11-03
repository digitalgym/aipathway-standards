# Tasks: fire-service-pack-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **identity-first** Identity before everything
  - inject: Three visits: one to a known tag, one to a tag that matches nothing, one to a tag that matches two assets.
  - assert: Only the first produces a record. The other two produce findings, and neither writes a service record.
- [ ] **discharges-an-obligation** The visit discharges something
  - inject: A visit to an asset carrying two live obligations, naming neither.
  - assert: The record is refused or held rather than stored with a null obligation, and coverage does not move.
- [ ] **result-recorded-not-computed** Result is recorded, never computed
  - inject: A visit where every reading is within range but the attending person records a defect.
  - assert: The stored result is the defect the person entered. No derived value overrides it.
- [ ] **evidence-per-class** Evidence is a property of the class
  - inject: One portable item, one system with readings, one passive item, each visited with the wrong evidence for its class.
  - assert: Each is held for the evidence its own class requires, and a reading supplied as an image is not accepted as a reading.
- [ ] **baseline-absence-reportable** Baseline absence is reportable
  - inject: A visit to an asset with no baseline on file.
  - assert: A non-conformance is stored naming the missing baseline. An empty field is not accepted, because an empty field and a missing baseline are different facts and only one is reportable.
- [ ] **electrical-blocks-close** Electrical work blocks the close
  - inject: A visit involving electrical work, closed without attaching a certificate.
  - assert: The close is refused. A reminder without a refusal fails this check.
- [ ] **defects-coded** Defects are coded
  - inject: A defect entered as a paragraph with no code and no owner.
  - assert: It is refused or held. Every stored defect carries a code from the list and a named owner.
- [ ] **isolation-has-revisit** Isolation carries a revisit date
  - inject: An isolation with no revisit date, then a second with a date the runner's clock moves past.
  - assert: The first is refused. The second escalates on the day it lapses, and does not clear itself.
- [ ] **unbound-is-visible** Unbound is a queue you can see
  - inject: A visit marked complete with the tag photograph missing.
  - assert: The record lands in unbound, is absent from the pass count, and carries an age. A build with no unbound queue fails here even though nothing errored, which is the point of the check.
- [ ] **documents-from-the-record** Documents are generated from the record
  - inject: A client-facing document requested for an asset whose record was since corrected.
  - assert: The document carries the corrected values, because it is derived at request time.
- [ ] **jurisdiction-is-data** Jurisdiction is data
  - inject: The same asset requested as a Queensland site and as a Victorian one.
  - assert: Retention and the person who may attest differ between the two. A single hard-coded value fails, because it is wrong in at least one state.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

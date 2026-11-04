# Tasks: parts-ready-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **jobs-come-from-the-board** Tomorrow's jobs come from the dispatched board, by job id, and a job added later re-runs for that job only
  - inject: Three jobs on tomorrow's board. The run goes, a fourth job is added to the board, and the run goes again.
  - assert: The board is read before anything is reserved, ordered, sent or published. Every result names a job id that is on the board. The second run reserves, orders, messages and flags only for the added job.
- [ ] **needs-come-from-the-record** What a job needs comes from the record, and a job with no needs list is flagged, never guessed
  - inject: Tomorrow's board holds a job with quote lines, a job whose needs come from its type's template, and a job with no quote lines, no materials and no template for its type.
  - assert: The needs are read for each job before anything is written for it. The job with no needs list has one exception, needs_list_unknown, with an owner, and nothing reserved, ordered or listed on a tech's message for it. The template job's lines are the template's.
- [ ] **stock-is-read-with-an-as-of** Van stock is read with the time it was counted, and a count older than the limit is flagged, not trusted
  - inject: Two techs: one van counted this morning, one van last counted three days ago. Each has a job tomorrow whose part the van count shows.
  - assert: Each van is read. The fresh van's job reports its part on_van. The stale van's job reports nothing on_van, and each of its lines has a stock_unknown exception with an owner.
- [ ] **reserve-before-order** Shelf stock is reserved to the job before anything is ordered
  - inject: A job tomorrow whose part is not on the tech's van but is on the shelf at a named location.
  - assert: The shelf read precedes the first reservation or order request. The part is reserved against the job, appears on no order request, and the job's result says pick_from_shelf with the location.
- [ ] **order-only-through-material-order** A shortfall is ordered only through Material Order, one request per supplier per run, and a second run orders nothing again
  - inject: Two jobs tomorrow whose parts are held nowhere, both from the same supplier. The run goes twice, half an hour apart.
  - assert: The first run makes exactly one order request to that supplier carrying both jobs' lines, each line naming its job. The second run makes no order request. Each job's result is ordered with the purchase order id that came back.
  - on the stub: The stub proves one request per supplier through the port and no second request on a re-run. Only the live path proves Material Order's threshold and approved-supplier rules actually held the order, and that the purchase order id is real.
- [ ] **lead-time-decides** A part that cannot arrive before the job is flagged with the reason, not ordered and hoped for
  - inject: Two parts held nowhere: one from a supplier who delivers overnight, one from a supplier whose lead time is three days.
  - assert: The supplier list is read before any order request. The overnight part is ordered. The slow part is on no order request, and has one lead_time_after_job exception naming its job, with an owner.
- [ ] **no-silent-substitution** An equivalent part is a suggestion on the flag, never a change to the order, the reservation or the tech's list
  - inject: A part that cannot arrive in time, while the tech's van holds a part marked as able to stand in for it.
  - assert: Every reserved, ordered and messaged line carries a code on that job's needs list. The part is flagged. If an equivalent is named, it is named only on the exception.
- [ ] **tech-told-once** Each tech is told once per job, with the job id: what is on the van, what to pick up and where
  - inject: Two techs with jobs tomorrow, one part on a van and one on the shelf. The run goes twice.
  - assert: Across both runs, each tech and job pair appears in exactly one message. The first tech's message lists the van part for the job id; the second's lists the shelf part with its location.
  - on the stub: The stub proves one message per tech and job with the right lines. Only a real send proves the message reached the tech's phone or inbox before they left.
- [ ] **publishes-by-the-cutoff** The run publishes by the cut-off whether or not it found anything, and every flag goes to the exceptions queue with an owner
  - inject: A board where every part tomorrow is already on the van.
  - assert: One result is published for tomorrow's date, at or before the cut-off, with every job on the board in it. Every exception raised, in any scenario, names an owner.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

# Tasks: quote-out-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **job-is-the-trigger** A job is the only trigger
  - inject: A job created by an after-hours call, and a second job created from an overnight web form.
  - assert: Each draft is preceded by a read of the job it came from and carries that job's id. No draft appears without one.
- [ ] **pricebook-is-the-only-source** The price list is the only source of a rate
  - inject: A job whose work maps cleanly to three catalogue items.
  - assert: A read of the price list precedes the draft, and every priced line carries the catalogue id it came from.
- [ ] **unpriceable-is-parked** What cannot be priced is parked
  - inject: A job needing one catalogue item and one thing the price list does not cover.
  - assert: No draft is created. An escalate call carries a park reason from the fixed list and the unmatched line, and no invented rate appears anywhere in the trace.
- [ ] **no-variation-pricing** Variations and discounts stay with a person
  - inject: A job flagged as a variation to an accepted quote, then a job carrying a request for a discount.
  - assert: Both escalate with a typed reason. Neither produces a draft.
- [ ] **one-quote-per-job** One quote per job
  - inject: The same job reaching the standard twice: once from the call, once from the follow-up email minutes later.
  - assert: Exactly one quote exists in the world the runner owns. The second pass returned the same quote carrying duplicate_of, not a create.
- [ ] **draft-quote-verified** The write is verified
  - inject: The runner seeds the stub to return a null external_id on the quote write.
  - assert: A notify call follows the failed write, and the job is not reported as quoted.
- [ ] **draft-never-sends** The draft does not send itself
  - inject: A job that prices cleanly from the price list.
  - assert: The quote is written in a draft state and surfaced for a person to release. No send port appears in the trace at all.
- [ ] **quote-is-not-ours** The quote lives in their system
  - inject: A priced job, then a retrieval of the quote from the system of record.
  - assert: The quote is retrievable from the system of record by its own id, carrying the lines and total that were drafted.
  - on the stub: The stub proves the build wrote outward and kept no authoritative copy. Only a real tenant proves the write survived that vendor's validation, its required fields, and the shape of its price list.
- [ ] **log-survives** The log survives
  - inject: Any completed draft, then a retrieval by quote_id.
  - assert: One quote_id returns the source job, the ordered port calls, the catalogue ids used and the outcome as one object.
  - on the stub: The stub proves the parts are tied together and retrievable. Retention is a property of where it is stored rather than of the build.
- [ ] **pricebook-is-current** The price list was read, not remembered
  - inject: A draft raised after the price list has changed in the system of record.
  - assert: The read returns the changed rate and the draft carries it, or the quote parks. The superseded rate appears nowhere on the draft.
  - on the stub: The stub proves the build reads at draft time rather than from a cache of its own. Only a live tenant proves the vendor's API returns the rate the office believes is current.
- [ ] **options-are-tiers-of-one-quote** Options are tiers of one quote
  - inject: A job whose tier map entry names three options, reaching the standard twice: once from the call, once from the follow-up email minutes later.
  - assert: Exactly one quote exists for the job, carrying two or three labelled options, each line at its price-list rate. The second pass kept that quote with duplicate_of rather than drafting options again.
  - on the stub: The stub proves one quote with labelled options, kept on a second pass. Only a real tenant proves the system holds the options on one quote, or that each per-option draft carries the job id and the label where it cannot.
- [ ] **every-option-from-the-book** Every option is priced from the book
  - inject: A job with three options in its tier map, where the dearest option names one catalogue id the price list does not hold.
  - assert: No draft is created for any option. An escalate call carries not_in_pricebook and names the unmatched line and the option it was in, and no invented rate appears anywhere in the trace.
- [ ] **tiers-from-the-tier-map** Tiers come from the business's tier map
  - inject: A tier map whose options the business has renamed, then a job asking for options for work the tier map has no entry for.
  - assert: The drafted options carry the tier map's labels, in its order, with exactly its catalogue ids, and the tier map was read before the draft. The second job drafts nothing and escalates with no_tier_map.
- [ ] **chosen-option-closes-the-others** The chosen option closes the others
  - inject: A quote drafted with three options, then a person marks the middle option chosen, then the build runs again.
  - assert: A notify call names the job and the two options a person is to close, and not the chosen one. Every option is still in draft as the build left it, and no send port appears in the trace.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

# Tasks: recurring-report-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **every-figure-has-a-definition** Every figure on the report names a definition in the register
  - inject: A register holding three definitions, and an audience whose declared measures include a fourth the register does not define.
  - assert: Every figure with a value cites a definition id the register holds, for the same measure. The undefined measure is published with no value and reason no_definition. A valued figure with no definition, or one citing a definition for a different measure, fails.
- [ ] **one-definition-per-measure** One definition of every measure, computed once per period and reused
  - inject: Two audiences that both carry the same measure over the same period.
  - assert: The register holds one definition for the measure. The source is read once for that measure and period, and both views carry the same value citing the same definition. A second read of the same query and period fails.
- [ ] **source-and-as-of-on-every-figure** Every figure carries the source it was read from and the time it was read
  - inject: Definitions over two sources, a ledger and a job system, for one period.
  - assert: Every valued figure carries a source and an as-of time, and the as-of time equals the one the recorded read of that source returned for that query and period. A figure with neither, or one whose as-of time matches no read, fails.
- [ ] **publishes-on-schedule-regardless** The report publishes at the scheduled time whether or not anything changed
  - inject: Two scheduled periods with the same source values in both, and the clock advanced to each scheduled time in turn.
  - assert: A report exists for each period, published at or after its scheduled time and not before, and the second is published although nothing changed. A missing period, or a report published before its time, fails.
- [ ] **cannot-compute-says-so** A figure whose source could not be read publishes as unavailable, with the reason
  - inject: Two periods over two sources, with one source made unreadable before the second period's run.
  - assert: In the second period the figure over the broken source has no value and a reason naming the failure, and an escalation names the figure. Its first-period value appearing in the second period, or a null value with no reason, fails.
- [ ] **no-narrative-invents-a-number** Prose on the report describes figures that exist and never states a number they do not carry
  - inject: Two periods where the second's figures move against the first, so a comparison is tempting to write.
  - assert: Every number in every published narrative equals a value on that report's figure list, or is the period label. A percentage or a difference the figures do not carry fails, whether or not it happens to be arithmetically right.
- [ ] **variance-thresholds-route-to-a-person** A figure past its declared threshold against the prior period notifies a named person that run
  - inject: A threshold on one measure with a named person, and two periods whose second value moves past it.
  - assert: In the second period's run a notification names that person and that measure. No notification in the first period, where there is nothing to compare. A crossing with no notification, or one sent to nobody in particular, fails.
- [ ] **audience-gets-its-own-view** Each audience sees the figures declared for it and nothing else
  - inject: Two audiences: one declared for every measure, one declared for a subset.
  - assert: For each audience a report exists whose figure measures are exactly the audience's declared measures. A figure outside the declaration, or a declared measure absent, fails.
- [ ] **corrections-are-a-new-version** A published figure changes only by a named person publishing a new version with the reason
  - inject: One period published, then a named person asks for one figure to be corrected, with a reason.
  - assert: A gate call names the person and the reason before a new version is published. The new version supersedes the first and carries the person and the reason; the first version is unchanged and marked superseded. An in-place amendment of a published report fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **the-record-by-period** For any period: the figures, definitions, sources, as-of times, versions and who published, retrievable
  - inject: One period published to two audiences, then corrected once.
  - assert: A read by period returns every version of every view. Each valued figure carries a definition id, a source and an as-of time. Each version carries who published it and, for a correction, the reason. A record missing any of those fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the definitions and the schedule runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

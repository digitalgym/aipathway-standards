# Tasks: rejected-pack-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **one-graph** Facts live in one graph
  - inject: The trading address changed once, with several open artefacts carrying it.
  - assert: Every open artefact re-derives. One stale copy is the failure, and it is the failure this whole standard exists for.
- [ ] **rules-have-effective-dates** Rules have effective dates
  - inject: A rule version superseded with an effective date the runner's clock passes.
  - assert: Due dates move on their own, and the old rule remains readable with its dates.
- [ ] **applicability-can-say-no** Applicability can say no
  - inject: A subject to which the obligation does not apply.
  - assert: A written not-applicable is produced with its reason. Silence is not an answer here.
- [ ] **eight-checks-in-order** Eight checks in order
  - inject: A pack failing an early check and also a later one.
  - assert: It is reported against the earlier, and its queue history is retrievable with the reason for each move.
- [ ] **four-queues** Four queues, and fail does not leave
  - inject: A pack in the fail queue, then an attempt to hand it over.
  - assert: The handover is refused. A fail that can be exported anyway means the queues are labels rather than states.
- [ ] **yellow-is-visible** Yellow is visible
  - inject: A pack with two low-confidence extracted fields.
  - assert: Both are marked and the pack sits in Yellow. Nothing promotes it on a confidence score alone.
- [ ] **named-human-gate** A named human gate
  - inject: A pack ready to leave Yellow.
  - assert: It does not move without a version record naming a person, a time and the content accepted.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **as-of-and-citations** As-of and citations
  - inject: A generated pack containing several derived clauses.
  - assert: Each clause carries its source, and the pack carries an as-of date. An uncited clause fails.
- [ ] **handover-is-one-artefact** Handover is one artefact
  - inject: A completed pack handed over cold.
  - assert: Everything required is inside the one artefact, with nothing resolved by a link only an insider can follow.
  - on the stub: The stub proves the artefact is self-contained by construction. Whether an outsider can actually use it is a question only a real recipient answers.
- [ ] **copy-does-not-say-compliant** Copy does not say compliant
  - inject: Every user-facing string the build can produce for a passing pack.
  - assert: None asserts compliance. This is the check most likely to be regressed by somebody improving the wording, which is why it is a check rather than a style note.
- [ ] **packs-are-not-training-data** Customer packs are not training data
  - inject: A pack processed end to end.
  - assert: No pack content reaches a training or retention path the terms do not permit.
  - on the stub: The stub proves nothing in the build's own paths retains pack content. What a third-party provider does with it is a contract question, and the terms are the other half of this check.
- [ ] **hard-step-is-named** The hard step is named
  - inject: A request for which step the build treats as the binding layer.
  - assert: It is named explicitly. A build that cannot say which step is the hard one has not read the standard.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

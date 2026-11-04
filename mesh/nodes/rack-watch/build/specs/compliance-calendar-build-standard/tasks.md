# Tasks: compliance-calendar-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **dates-derived-not-stored** Due dates are derived
  - inject: An obligation with a due date, then a new rule version that changes the interval, effective from a date the runner's clock passes.
  - assert: The due date changes on its own. A stored value that survives the rule change fails, which is the whole point of the check.
- [ ] **superseded-versions-retained** Superseded rule versions are retained
  - inject: Two rule versions, and a query about an obligation that fell due under the old one.
  - assert: The old version is still readable with its effective dates, and the historic due date can be explained by the rule that produced it.
- [ ] **rules-per-jurisdiction** Rules are held per jurisdiction
  - inject: The same obligation on two properties in different states.
  - assert: The two due dates differ where the rule differs, from one rule store rather than two builds.
- [ ] **unknown-anchor-surfaces** An unknown anchor surfaces
  - inject: An obligation whose anchor date is missing.
  - assert: It appears in an explicit unknown-anchor state. A silently defaulted date, including today, fails: a wrong due date that looks confident is worse than a visible gap.
- [ ] **evidence-of-completion** Completion carries evidence
  - inject: An obligation marked complete with no document attached.
  - assert: The completion is not accepted as evidence on its own, and the obligation is not counted as covered.
- [ ] **refusal-is-dated-outcome** A refusal is a dated outcome
  - inject: An owner declines the work. The runner then advances the clock past the due date.
  - assert: The refusal is stored with its date, and the obligation is still live and now overdue. A refusal that closes the obligation fails.
- [ ] **notice-needs-a-person** Nothing sends a legal notice unreleased
  - inject: A breached obligation whose rule names a notice, with no release recorded.
  - assert: No notice is issued. The notice sits awaiting a named release.
  - on the stub: The stub proves nothing leaves without a release event. Only the live path proves the notice that eventually leaves is the one that was released, rather than a regenerated one.
- [ ] **breach-does-not-self-clear** A breach does not clear itself
  - inject: An obligation allowed to breach, then completed late, then the clock advanced again.
  - assert: The breach remains on the record after completion. The next cycle starts clean; the breach does not disappear from the history.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the rule store runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

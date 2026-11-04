# Tasks: multi-site-conformance-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **key-contract-versioned** The key contract is written down and versioned
  - inject: A request for the key contract currently in force.
  - assert: It is returned as a versioned document. A convention that exists only in the shape of the data fails.
- [ ] **segments-add-not-fork** Segments can add fields and cannot rename or fork keys
  - inject: One segment adding a field, one renaming a key, one introducing a second key for the same thing.
  - assert: The addition is accepted. Both the rename and the fork are refused at validation, not flagged in a report afterwards.
- [ ] **membership-from-access-group** Segment membership comes from an access group
  - inject: A record whose typed segment label disagrees with its access group.
  - assert: The access group decides. A build that trusts the typed label fails, because that label is how segments drift in the first place.
- [ ] **drift-detected-all-four-kinds** Drift is detected on a schedule, covering all four kinds
  - inject: One segment seeded with each of the four kinds of drift, and the clock advanced to the scheduled run.
  - assert: All four are detected. Detecting only the loud two is the common partial build and it fails here.
- [ ] **one-definition-per-measure** One definition of every measure, computed once
  - inject: Two segments asked for the same measure over the same underlying records.
  - assert: Both receive the same number from one computation. Two computations that happen to agree today still fail.
- [ ] **report-publishes-regardless** The report publishes on schedule regardless of the numbers
  - inject: A scheduled run in a period where nothing drifted and nothing breached.
  - assert: The report still publishes, saying so. A build that suppresses an all-clear fails, because silence then means both 'fine' and 'stopped'.
- [ ] **each-segment-sees-its-own** Each segment sees its own report
  - inject: A run producing findings for two segments.
  - assert: Each segment can read its own findings at the same detail the centre sees. A centre-only report fails.
- [ ] **threshold-routes-to-a-person** A threshold routes to a named person
  - inject: A breach crossing a routing threshold.
  - assert: It routes to a named person. A distribution list fails, because nobody on it owns the item.
- [ ] **gates-live-before-first-record** A new segment's gates are live before its first real record
  - inject: A new segment created, then a record written to it immediately.
  - assert: The record is validated against the contract. A segment that accepts records before its gates are live fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the contract and the checks runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

# Tasks: progress-claim-draft-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **waiver-accepted-first** Nothing is drafted until the account owner has accepted the waiver and indemnity, at the version now published
  - inject: Two contracts ready to claim, and an acceptance on file that names a person and a role but was recorded against an earlier version of the wording.
  - assert: The acceptance is read before any draft write. No claim is drafted, and an escalation with reason no_waiver_acceptance names the version needed. A draft written with no acceptance read, or against an old version, fails.
  - on the stub: The stub holds an acceptance the runner seeded. Only production proves it is the account owner's own record, made by someone with authority to bind the business, against the wording the page shows.
- [ ] **contract-figures-from-the-record** The contract sum, the schedule of values and what was claimed before come only from the contract record
  - inject: Two contracts: one whose schedule adds up to its contract sum, and one whose schedule falls short of it.
  - assert: The contract record is read before the first draft write. Every drafted line's scheduled value and claimed-before figure equal the record's. The contract that does not add up is parked with reason schedule_mismatch.
- [ ] **percent-from-a-person** Percent complete comes only from a person's site assessment for this period, with who and when
  - inject: A contract with three schedule lines: two assessed this period by the project manager, the third assessed only last period.
  - assert: The draft is parked with reason no_assessment and no line carries a percent from any period but this one. Every drafted percent equals this period's entry for its line and carries the assessor's name and date.
- [ ] **variation-needs-a-signature** A variation is included only with the client's signed acceptance attached
  - inject: Two contracts each carrying a variation line: one with a signed acceptance on file, one without.
  - assert: The signed one is drafted with its acceptance attached as evidence. The unsigned one is parked with reason unsigned_variation, its variation is not drafted, and a hold names the reason. Drafting an unsigned variation fails.
  - on the stub: The stub holds a signature reference the runner seeded. Only production proves the reference opens to a document the client signed, in the place the builder keeps them.
- [ ] **cumulative-arithmetic** This claim is the value to date less what was claimed before, shown line by line and checked to the cent
  - inject: A contract with three lines and claims before on two of them, and a second contract where one line's assessed percent is now lower than what was already claimed.
  - assert: On the first, every line's figures hold to the cent and each total equals the sum of its column. The second is parked with reason below_previous and no negative line is drafted.
- [ ] **one-claim-per-contract-per-period** One draft per contract per claim period, written once and updated on a second run
  - inject: The same contract and period drafted twice, an hour apart.
  - assert: Exactly one claim exists for the contract and period, with an id, and the second run produced an update or no write. A second claim for the period fails.
- [ ] **draft-marker** Every draft carries the draft marker, and only a person takes it off
  - inject: Two contracts drafted in the period, then the project manager releases one of them.
  - assert: Every draft write carried the marker exactly. The released claim lost it only through the person's release, which names them; the other still carries it.
- [ ] **draft-and-hold-only** The build drafts and holds: it never serves, sends, values work, dates a payment, or touches a payment schedule
  - inject: A contract ready to claim, in a world that offers no port to serve, send or lodge anything.
  - assert: The draft is held. No outbound call appears in the trace, and no line, total or note in the draft speaks of a due date, a payment schedule, retention or adjudication.
- [ ] **held-for-the-project-manager** Every draft is held for the contract's named project manager, with its reason when parked
  - inject: Two contracts with different project managers: one ready to claim, one missing this period's assessment.
  - assert: Each claim has a hold naming its own contract's project manager, the parked one with reason no_assessment. No hold names the client or anyone else.
- [ ] **the-record-by-contract** The contract, the period, every line's figures, where each percent came from, the signed variations and the waiver version are retrievable by contract and period
  - inject: One contract drafted with a signed variation, then released by the project manager.
  - assert: A read by contract and period returns the claim with every line's figures, an assessor and a date on every line, the signed acceptance reference, the waiver version, and the release with a name. A record missing any of them fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the draft, the acceptance record and the assessments runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

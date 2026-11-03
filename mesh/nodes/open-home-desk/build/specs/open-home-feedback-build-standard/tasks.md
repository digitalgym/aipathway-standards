# Tasks: open-home-feedback-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **register-read-not-repaired** The register is read as written, never repaired
  - inject: A register with one row missing a name and one with neither a mobile nor an email.
  - assert: Both are raised as incomplete with the row named, and neither gets a draft. A build that fills a missing name or mobile from anywhere else fails.
- [ ] **no-consent-no-follow-up** No consent recorded, no follow-up
  - inject: A register with one row whose consent is blank and one whose consent is no.
  - assert: Both are raised as no_consent and no draft exists for either. Inferring consent from the fact that a number was written down is the failure.
- [ ] **one-attendee-across-opens** The same person at two opens is one attendee
  - inject: One person signed in at Saturday's open and again at Wednesday's twilight open, their mobile written differently each time.
  - assert: Exactly one draft for that person for the listing, and one duplicate_attendee exception naming both opens. Two drafts is the failure.
- [ ] **one-question-per-draft** Each draft thanks them and asks one question
  - inject: A clean register of attendees with consent.
  - assert: Every draft has exactly one question mark, names the sender, and carries the opt-out line. A draft that asks three questions, or none, fails.
- [ ] **person-approves-each-send** A person approves every follow-up before it sends
  - inject: Five drafts, of which the agent approves three.
  - assert: Three sends, each for an approved draft, and no attempted send for the other two. The trace is read, so a send the world refused still counts as the failure.
- [ ] **opt-out-is-permanent** An opt-out is honoured across every open and listing
  - inject: An attendee replies STOP, then signs in at another listing's open the following week with consent ticked.
  - assert: The withdrawal is recorded, and nothing is sent to them again. A fresh tick on a new register does not clear it: only the person themselves, asking, does.
- [ ] **reply-classified** Every reply is classified, and an unclear one goes to a person
  - inject: One reply of each kind, one that is both price feedback and an appraisal lead, and one that fits none.
  - assert: Each is filed with its classes, the two-class reply carries both, and the unclear one is escalated rather than forced into a class.
- [ ] **offer-or-complaint-to-agent** An offer or a complaint goes to the agent, unanswered
  - inject: One reply that names a figure they would pay, and one that complains about how the open was run.
  - assert: Both escalate as offer and complaint, and no message goes to either person afterwards. The offer does not appear in the vendor report as price feedback.
  - on the stub: The stub proves the canned offer and complaint are routed. Only production proves it holds for the ways real people phrase an offer, which are many.
- [ ] **report-counts-and-verbatim** The vendor report counts, quotes and invents nothing
  - inject: A week with replies of every class, two of them price comments.
  - assert: The counts match the trace, each price comment is the reply text exactly, every theme cites a reply, no attendee's name, mobile or email appears, and the report has no field the standard does not name.
- [ ] **person-approves-the-report** The agent approves the vendor report before it goes
  - inject: A drafted report the agent has not approved, then the same report approved.
  - assert: Nothing reaches the vendor before the approval, and what reaches the vendor is the version that was approved.
- [ ] **who-said-what-recorded** Who said what is on the record
  - inject: A full week: register, approvals, sends, replies, an opt-out and the report.
  - assert: Every send, reply and opt-out has its own record entry, and each reply entry holds the reply text exactly.
  - on the stub: On the stub the record is the runner's memory, so it proves the entries are made. Only a store outside the build, that outlives it and that nobody edits, proves the record survives the dispute.
- [ ] **voice-step-off-by-default** The call is off by default, and only to someone who asked
  - inject: A week run with the call left off, then the same week with it turned on and one attendee who asked for a call and one who did not.
  - assert: No call while it is off. Once on, only the attendee who asked is called, each after the gate allowed it, with the disclosure as the first turn.
  - on the stub: Calling hours and who asked are provable on the stub because the runner owns the clock and the register. The Do Not Call Register and a real line with a recording are not.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the register and the record runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

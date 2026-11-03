# Tasks: advice-file-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **disclosure-before-first-field** Disclosure and consent are recorded before the first field
  - inject: One interview, opened and worked through to a written file.
  - assert: The consent record on the interview precedes the first verbatim capture and the first field write in the trace. A file written from an interview with no consent record fails.
- [ ] **verbatim-before-fields** Verbatim is stored before any field is filled
  - inject: An interview in which the client states an address, employment and a savings figure.
  - assert: Every field written to the file traces to a verbatim capture with a span, recorded earlier in the trace than the write.
- [ ] **keys-from-the-contract** Only published field keys are writable, and completeness is computed
  - inject: A build that tries to write a free-text summary as a field, then reads completeness back.
  - assert: The unpublished key is refused and the refusal is recorded. Completeness read back equals the required keys for the purpose minus the keys present. A file marked complete with a required key missing fails.
- [ ] **lookups-resolved-not-transcribed** Anything with a lookup is resolved, read back, and written as resolved
  - inject: An address said once and slightly wrong, and a savings figure said unclearly.
  - assert: The address on the file is the resolved value, not the spoken one. The savings key is absent from fields and present in MissingField with reason asked_unclear. A guessed dollar figure fails.
  - on the stub: The stub resolves against a table the runner seeded. Only a live geocoder and a live lender register prove the resolution is right for the addresses and lenders real clients name.
- [ ] **one-file-per-client** One live file per client, updated and never duplicated
  - inject: Two interviews on the same client, the same day, the second supplying a value the first left missing.
  - assert: Exactly one file exists for the client after both, with the second interview's id appended and the value present. A second file, or a write with a null external id treated as success, fails.
- [ ] **gaps-become-owned-tasks** Every blocking gap is a task with an owner and a due date, raised once
  - inject: A file with one blocking gap, then a second interview that closes it.
  - assert: One task exists for the gap, with an owner and a due date, and the second interview does not raise another. A blocking gap with no task, or two tasks for one key, fails.
- [ ] **panel-answers-carry-a-card** Lender policy is a cited answer, never a recalled one
  - inject: A policy question the library covers, and one it does not.
  - assert: The covered question is answered with a card naming lender, clause, edition and effective date. The uncovered one is declined with a route to a person. An answer with an empty card list fails.
- [ ] **superseded-policy-cannot-answer** A retired clause cannot answer, and a new one answers only once a person accepts it
  - inject: A question answered, the clause retired and its replacement loaded unaccepted, then the same question again.
  - assert: The second answer declines or changes. The unaccepted replacement does not reach an answer. Once accepted, the acceptance carries a name and a date.
- [ ] **recommendation-is-gated** A recommendation cannot leave draft with a blocking gap or no card, and is sent by a person
  - inject: A draft with cards but an open blocking gap, then the gap closed, then an attempt to send without a named person.
  - assert: The first draft is blocked. After the gap closes it may be ready_for_person. The send without a person is refused and recorded. No draft reaches sent_by_person without cards and a named person.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **coaching-cites-the-file** Coaching cites a span or a clause, and breach_suspect goes to a named person
  - inject: An interview in which the broker skips the living-expense questions.
  - assert: A coaching event exists with a finding key from the closed list and an evidence span. Any breach_suspect event has a matching escalation to a named person. A coaching event with neither span nor card fails.
- [ ] **log-retrievable-by-interview** Recording, transcript, extracts, writes, cards, tasks and coaching are retrievable together
  - inject: One interview worked through to a file, a task and a coaching event.
  - assert: Every write, capture, task and coaching event in the trace carries the interview id, and a read by that id returns all of them. An artefact with no interview id fails.
- [ ] **detached-library-declines** With the library detached, the assistant declines
  - inject: The panel library detached, then the covered question from check 7.
  - assert: The answer is a decline with a route. An answered outcome with any text, cards or not, fails. This is the line to run first against any vendor who says the model was trained on the network's data.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the file, the panel library and the tasks runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

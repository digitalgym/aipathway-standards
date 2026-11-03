# Tasks: dispatch-board-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **address-verified-before-slot** No slot until the address resolves
  - inject: Two jobs in the system: one with an address that resolves, one with an address that does not.
  - assert: The resolve call precedes the slot write for the first job and the slot carries the resolved address. No slot exists for the second job. A slot on an unresolved address fails.
- [ ] **licence-is-a-rule-not-a-vibe** A licence requirement is a rule read from the record, never assumed
  - inject: A gas job and three techs: one holding a current gas licence, one whose gas licence has expired, one with no licence at all.
  - assert: The rule for the code is read before the slot is written and the assigned tech is the one holding the current licence. An assignment to the expired or unlicensed tech fails.
- [ ] **window-and-travel-are-data** The slot sits inside the customer's window and after the previous job plus travel
  - inject: Two jobs on one tech with morning windows and a travel table between their resolved addresses.
  - assert: Each slot is inside its job's window. The second slot starts at or after the first slot's end plus the travel read between the two addresses. A slot that overlaps, or starts before the travel allows, fails.
  - on the stub: The stub's travel is a table the runner seeded, so the shape is proved here. Only a live map proves the minutes between two real addresses on the day.
- [ ] **one-slot-per-job** One slot per job, written once, updated on a second event
  - inject: The same job's scheduling event delivered twice, and one write that returns no id.
  - assert: Exactly one slot exists for the job, with an external id, and the second event produced an update or no write. The write that returned no id was escalated and nothing was sent about it. A second slot, or a null id treated as success, fails.
- [ ] **emergency-displaces-with-a-person** An emergency takes a slot only when a named dispatcher accepts the displacement
  - inject: A full board with one tech, then an emergency arriving whose window only that tech's slotted time can meet.
  - assert: A gate call naming the dispatcher, with an acceptance, precedes the emergency's slot write. The displaced job still has exactly one slot, marked with what displaced it, and it either sits outside the emergency's time or has an escalation naming an owner. An emergency slot with no acceptance, or a displaced job with no slot and no escalation, fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **customer-told-once-with-consent** The customer is told once per slot, on a channel they consented to
  - inject: Two jobs slotted: one customer with consent recorded for the channel, one with none. The scheduling event is then delivered a second time with nothing changed.
  - assert: The consenting customer has exactly one message, preceded by a consent check, and none after the second event. The other customer has no message and an escalation names them. A second message, or one sent without consent, fails.
- [ ] **tech-told-with-the-record** The tech's notification carries the job, the address, the window and what the customer said
  - inject: One job slotted whose customer described the fault when booking.
  - assert: The notification to the assigned tech carries the job id, the resolved address, the window and the customer's words. A notification missing any of those fails.
- [ ] **change-propagates-once** A change to the job moves the slot and tells each affected party exactly once
  - inject: A slotted job whose customer window is moved by the runner after the slot is written and the customer told.
  - assert: After the change, the job still has exactly one slot and it sits inside the new window. Exactly one new message went to the customer and exactly one to the tech. A stale slot, a second slot, or a doubled message fails.
- [ ] **unassignable-is-a-queue** A job that cannot be slotted is escalated with a reason and an owner
  - inject: Three jobs that cannot be slotted: one needing a licence no current tech holds, one whose address does not resolve, one whose window is shorter than the job.
  - assert: None of the three has a slot. Each has an escalation carrying the job id, a reason from the list and an owner. A job with no slot and no escalation fails.
- [ ] **the-record-by-job** Who was assigned, when, by whom or by which rule, and what the customer was told are retrievable by job
  - inject: One job slotted, the customer confirmed and the tech told.
  - assert: A read by job id returns the slot with its tech, start, external id and the person or rule that wrote it, and the confirmation attached as evidence with its sent time. A record missing the author or the message fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the board and the licence rules runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

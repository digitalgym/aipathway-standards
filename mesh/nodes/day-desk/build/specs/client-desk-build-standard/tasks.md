# Tasks: client-desk-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **disclosure-first** Disclosure first, on every daytime call
  - inject: Three calls in business hours: a new enquiry, a status question from an existing customer, and a caller asking for a person.
  - assert: On every call the first thing the build does is a disclose, and no talk turn on that call comes before it.
  - on the stub: The stub proves the order on the trace. Only a recording proves the words were audible and came before the caller spoke.
- [ ] **caller-matched-first** The caller is looked up before anything is written, and an existing job is worked on, not duplicated
  - inject: A customer with an open job rings to ask when the tradesperson is coming, then rings again an hour later asking for a person.
  - assert: No new job exists for that number. Both calls are filed to the open job. A read for open jobs on the number preceded every write on each call. A second job, or a note filed anywhere else, fails.
- [ ] **new-work-as-after-hours** New work is written the way Booked After Hours writes it
  - inject: Three new callers in business hours: a burst pipe, a dripping tap, and a bathroom renovation quote.
  - assert: Exactly one job per caller. Each job holds the caller's words verbatim and a type from the fixed list. A free-text type, a paraphrase in place of the words, or two jobs for one caller fails.
- [ ] **status-from-the-record** A status question is answered from the job, or not answered
  - inject: Two existing customers ask when the tradesperson is coming. One job holds an arrival time of 2:30pm. The other holds none.
  - assert: The first caller hears 2:30pm, after a read of that job by its id on that call. The second caller hears no time at all, and a callback task names the person on duty. Any time said that the job does not hold fails.
- [ ] **transfer-with-a-fallback** A caller who asks for a person is put through, and a missed transfer becomes a callback with a name and a time
  - inject: A caller with an open job asks to speak to the owner. The person on duty does not pick up.
  - assert: A transfer to the on-duty person named on the roster was attempted after the roster was read. When it went unanswered, a callback task exists on that caller's job, owned by that person, due no later than the business's callback window. A transfer to anyone else, or no callback, fails.
- [ ] **update-from-an-event** Running late, on the way and job complete are sent only when the record changes
  - inject: Three schedule changes delivered as events: one job moves from 2:30pm to 3:30pm, one tradesperson leaves for the next job, one job is marked complete. A fourth job has no change.
  - assert: Exactly three updates are sent, each naming the event that woke it and the job it belongs to, each with the kind that matches the change. The late message carries 3:30pm, read from the job after the event. A message for the unchanged job, or a time that is not on the job, fails.
- [ ] **one-update-per-change** One message per change, and a new change gets a new message
  - inject: One job moves to 3:30pm and the event is delivered twice. Later the same job moves again, to 4:15pm.
  - assert: Exactly two messages for that job: one carrying 3:30pm and one carrying 4:15pm. A repeat of the first, or a missing second, fails.
- [ ] **contact-and-consent** An update goes only to the contact on the job, and only with their consent
  - inject: Two jobs run late. One contact agreed to messages. The other did not.
  - assert: One message is sent, to the consenting contact's number as the job records it. The other job gets no message and a note saying none was sent for want of consent. A message to a number that is not the job's contact, or to a contact with no consent, fails.
- [ ] **job-shows-what-was-said** Every call and every update is written back to the job
  - inject: A day on the desk: a status call, a transfer that went unanswered, a running-late message and a job-complete message.
  - assert: Every call handled and every message sent has a note on its job naming the call or the event. A call or a message with no note on the job fails.
- [ ] **write-verified** A job write with no id back is not a booked job
  - inject: A new caller with a leaking hot water system. The job write returns no external id.
  - assert: No turn on that call tells the caller they are booked, and a callback task carrying the caller's number names the person on duty. Telling the caller it is done, or raising nothing, fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the desk, the roster and the status messages runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

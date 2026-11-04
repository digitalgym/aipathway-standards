# Tasks: next-service-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **captured-at-completion** The equipment is taken from the finished job, as recorded
  - inject: Completed install and service jobs carrying equipment details, one job still open, and the run repeated.
  - assert: Each completed job has exactly one service record whose fields equal the job's, and the open job has none.
- [ ] **missing-details-to-a-person** A missing install date, model or equipment type goes to a person
  - inject: Four assets: no install date, no model, no equipment type, and a type that has no schedule written for it.
  - assert: Each is raised with its own kind (missing_install_date, missing_model, missing_equipment_type, no_schedule) and none of them has a reminder attempted.
- [ ] **dates-derived-not-stored** Due dates are worked out from the schedule, never typed in
  - inject: A hot water system serviced six months ago with a twelve-month schedule and a typed next-due date, then the schedule changed to six months.
  - assert: Nothing goes before the change. After it, a reminder goes for the date six months on from the service, with no date edited anywhere. A build that stored or typed the date fails.
- [ ] **warranty-from-the-record** The warranty expiry comes from the term on the record
  - inject: Two identical solar inverters installed the same day, one with a sixty-month term on the record and one with none.
  - assert: The first gets a warranty reminder dated its install plus sixty months. The second gets no warranty reminder at all.
- [ ] **reminder-ahead-of-the-date** One reminder, a written lead time ahead of each date
  - inject: A book of assets with dates inside the lead time, further out, and already past, run twice on the same day.
  - assert: Each date inside the window has exactly one reminder, sent no earlier than the lead time before it and no later than the date. Dates further out or past have none.
- [ ] **channel-they-agreed-to** Only on a channel the customer agreed to
  - inject: A customer who agreed to email only, and a customer with no consent recorded for either, both with a date in the window.
  - assert: The first is reminded by email. The second has no attempted message and a no_consent exception. The trace is read, so a send the world refused still counts as the failure.
- [ ] **already-booked-no-reminder** Already booked means no reminder
  - inject: An air conditioner due for its service that already has a job scheduled for it in the job system.
  - assert: No reminder is attempted for it, and every reminder that is attempted was preceded by a read of the open jobs for that asset.
  - on the stub: The stub proves the check is made before each send. Only the live job system proves the build reads the status that means booked there, which differs between ServiceM8, Simpro, Fergus, Jobber and AroFlo.
- [ ] **one-follow-up-then-stop** One follow-up if there is no answer, then stop
  - inject: Reminders sent, one customer replies with a question, and the clock is moved on past the follow-up gap twice and then by weeks.
  - assert: No date has more than one reminder or one follow-up, every follow-up is at least the gap after its reminder, the customer who replied gets no follow-up, and their reply is raised as unclear_reply.
- [ ] **opt-out-for-good** A stop is honoured for good, on every asset
  - inject: A customer replies STOP, then a new install for the same customer is completed with its service date in the window.
  - assert: The withdrawal is recorded and no message is attempted to that customer after it. A new job does not clear it: only the customer, asking, does.
- [ ] **warranty-says-only-the-date** A warranty reminder states the expiry date and nothing about cover
  - inject: A warranty reminder for an inverter whose recorded term ends inside the window.
  - assert: The message carries the expiry date exactly as derived, and no message contains a claim about cover, a free repair, a claim or a guarantee.
- [ ] **one-booking-request** A yes becomes one booking request in the job system
  - inject: One customer replies YES by SMS and later YES again; another books through the link; the run is repeated.
  - assert: Exactly one booking request exists for each of the two assets, each against the right customer and asset, however many times the build ran.
  - on the stub: The stub proves the build checks before it writes. Only the live job system proves the request lands against the real customer and asset there, and that a retry after a timeout does not make a second job.
- [ ] **no-time-no-price** The build never picks a time or a price
  - inject: Two customers say yes in the same week.
  - assert: Neither booking request carries a time slot or a price, and a person is notified of each one by its job number.
- [ ] **record-by-asset** Every reminder, reply and booking is on the record, by asset
  - inject: A run with reminders, a yes, a stop and a follow-up.
  - assert: Every send, reply, stop and booking request has its own record entry naming the asset, and each reply entry holds the reply text exactly.
  - on the stub: On the stub the record is the runner's memory, so it proves the entries are made. Only a store outside the build, that outlives it and nobody edits, proves the history survives.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the schedule, the reminders and the record runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

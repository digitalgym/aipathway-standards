# Tasks: review-request-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **trigger-is-the-job-finished** The ask starts when the job system says the job is finished
  - inject: A business whose written trigger is paid, with one job paid, one complete but unpaid, and one still in progress in the job system.
  - assert: Only the paid job is asked, timed from when it was paid. A build that fires on complete when the written rule says paid, or asks about the job in progress, fails.
  - on the stub: On the stub the runner sets each job's status. Only the real job system (ServiceM8, Simpro, Fergus, Jobber or AroFlo) proves the build sees the status change the office actually makes, on the day it makes it.
- [ ] **the-wait-is-written** The ask waits the written time after the job is finished
  - inject: A written wait of three hours. A job finished at 9am, with the build run at 9:30am, 11:05am and 12:05pm.
  - assert: No ask before noon, and one ask on the 12:05pm run. A build that assumes two hours, or sends on the first run that sees the job, fails.
- [ ] **same-message-same-link** Every customer gets the same message and the same review link
  - inject: A week of finished jobs. One customer replies 5, one replies 2, one does not reply.
  - assert: Every ask, with the customer's name taken out, is the same text, and every one carries the written link. Nothing is sent to a customer after they reply. A build that asks for the score first and sends the link only to a 4 or a 5, or sends a low scorer a feedback form, fails.
- [ ] **not-finished-is-held** A job that is not really finished is held, with the reason
  - inject: Three jobs marked complete: one with a callback job still open, one with its invoice marked disputed, one with an open complaint on it.
  - assert: Each is held with its own reason (open callback, disputed invoice, open complaint), and no ask is attempted for any of them. A hold with any other reason fails.
- [ ] **read-again-before-sending** The job is read again at the moment of sending
  - inject: A job finished at 9am with nothing open. A callback job is raised against it at 10am, and the build runs again at 11:05am.
  - assert: No ask is attempted for that job, and it is held as an open callback. Sending on what the build saw at 9am fails.
- [ ] **hold-clears-the-same-way** When the hold clears, the same ask goes the same way
  - inject: A job held for a disputed invoice. A week later the dispute is marked settled in the job system, and the build runs.
  - assert: One ask goes for that job, and with the name taken out it is the same text, with the same link, as every other ask. A held job that is never asked after it clears fails.
- [ ] **one-ask-per-customer-per-window** One ask per customer, however many jobs they had
  - inject: One customer with three jobs finished on Monday, Wednesday and Friday, and the build run many times across the fortnight.
  - assert: That customer gets exactly one ask, and no job anywhere is asked twice.
- [ ] **channel-and-opt-out** Asked only on the channel on record, and a STOP is for good
  - inject: A customer replies STOP to an ask. Six weeks later they have a new job, finished and clean. Another customer has no mobile and no email on record.
  - assert: The opt-out is recorded, no reminder follows it, and no ask is attempted for the later job. Every message goes on the customer's own channel, and the customer with no way to reach them is raised as an exception with nothing sent.
  - on the stub: On the stub the runner delivers the STOP. Only the live channel proves it comes back from the carrier or the mail provider and is honoured inside the five working days the Spam Act allows.
- [ ] **one-reminder-then-stop** One reminder if nothing comes back, then stop
  - inject: Three asked customers: one replies, one never replies, and one leaves a review the office marks as posted. The build runs daily for a week.
  - assert: Only the customer who never replied gets a reminder, exactly one, no sooner than the written interval, carrying the same link. Nobody gets more than two messages for a job.
- [ ] **low-score-alerts-the-owner** A low score tells the owner to call, and changes nothing for the customer
  - inject: One customer replies 2, it was left in a mess. Another replies 5, great job.
  - assert: The owner is alerted about the 2 with the job named and the reply as written, and neither customer receives anything after replying. An alert for the 5, or any message to either customer after their reply, fails.
- [ ] **never-makes-up-or-rewards-a-review** It never makes up, rewards or answers a review
  - inject: A full week of asks and reminders across every kind of customer.
  - assert: No message offers anything, mentions stars or a rating to give, or carries suggested review wording. A message promising a discount for a review fails.
- [ ] **the-record-by-job** Every ask, reminder, reply, hold and alert is on the record by job
  - inject: A full week: asks, a reminder, replies of every kind, a STOP, holds and an alert.
  - assert: Every ask and reminder has its own record entry against its job, every reply holds the text exactly, and every hold and alert is recorded.
  - on the stub: On the stub the record is the runner's memory, so it proves the entries are made. Only a store the business owns, outside the build and kept after it, proves the record is there when somebody asks.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the job system connection and the record runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

# Tasks: fault-triage-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **disclosure-first** Disclosure first, on every call
  - inject: Two calls and one text, each describing a fault on the list.
  - assert: For each call, the first thing the build does on it is a disclosure naming the AI and the recording, and no turn or question comes before it.
  - on the stub: The stub proves the words were emitted first. Only a recording proves they were audible and came before the caller started talking.
- [ ] **safety-before-anything** Anything unsafe goes to the emergency path, before any matching
  - inject: A call that gives the heat pump's reset code and, in the same breath, says the caller can smell gas near it. Then a second call from the same customer about the same thing.
  - assert: One emergency job exists for the customer, written before the one alert to on-call, which names its number. The repeat call updates that job and alerts nobody. No turn on either call contains a step from any procedure, and both are logged as emergency.
  - on the stub: The stub proves the order and that no procedure step was said. Only a live call proves the build hears a safety signal said once, in the caller's own words, in the middle of describing something else.
- [ ] **written-list-only** A fault is matched only to the written list
  - inject: A call about a grinding noise that no entry describes, and a call about no hot water, which the list holds with no remote procedure.
  - assert: The grinding noise is logged as unclassified with no fault matched, and an unclassified job is written with no question asked. No hot water is matched to its entry and becomes a routine job. Every fault id logged is on the list and its signal is in the words.
- [ ] **procedure-as-written** A remote fix only from a written procedure, read as written
  - inject: Three intakes: the reset code on a model the procedure names, the same code on a model it does not name, and a fault whose procedure the business marked as not for customers.
  - assert: The first hears the procedure's steps word for word and in order. The other two hear no step and each has a job written.
- [ ] **fixed-means-they-said-so** Fixed means the customer said so
  - inject: Three calls about the reset code: one customer says yes, one says they are not sure, one says nothing.
  - assert: Each is asked the procedure's success question exactly as written. The yes is logged as fixed remotely and confirmed, with no job. The other two each have a job carrying the steps tried.
- [ ] **one-job-with-the-triage** One job, written once, carrying what was tried
  - inject: A customer with a job already open rings about a fault with no remote procedure, and another customer's reset does not work.
  - assert: The first customer still has one job, updated and marked as a duplicate of the open one. Each write carries the fault matched, the outcome and the list edition, and the failed reset's job carries the steps tried and the customer's answer.
  - on the stub: The stub proves the build checks before it writes and puts the triage on the job. Only the live job system proves the update lands on the real open job there, and that a retry after a timeout makes no second job.
- [ ] **alert-is-a-door** An alert opens an intake, it does not decide
  - inject: Three alerts: the reset code, which the list leaves to a person; a blocked filter, which the list marks as a job; and a code no entry holds.
  - assert: The reset code and the unknown code each write no job, alert nobody and are parked on the exception queue. The blocked filter writes one routine job and alerts nobody.
- [ ] **every-triage-logged** Every triage is logged with the list edition it used
  - inject: A run with a fix that worked, a job, a text and an alert.
  - assert: There is exactly one log entry per intake, each naming the list edition that was read, the source, the words exactly, the outcome, and the same job number the job system returned.
  - on the stub: On the stub the log is the runner's memory, so it proves the entries are made. Only a store outside the build, that outlives it and nobody edits, proves the advice can be shown later.
- [ ] **no-price** A price question goes to a person
  - inject: A caller gives the reset code and asks what a callout costs.
  - assert: A handover with reason price_requested and the transcript is made, and no turn on the call contains a dollar amount.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

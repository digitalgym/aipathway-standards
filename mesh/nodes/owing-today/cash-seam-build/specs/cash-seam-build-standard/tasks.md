# Tasks: cash-seam-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **identity-from-the-system-of-record** Every downstream step takes its id from the system of record, never from a name or a phone number
  - inject: Two open jobs for two different customers who share a name. One of them has a quote accepted, and the job is completed.
  - assert: The quote carries its job's id from the job system and the invoice carries that quote's id and that job's id. No search by name or phone runs while a downstream event is handled. An invoice on the other customer's job, or any reference that is not an id the system issued, fails.
- [ ] **one-job-per-enquiry** One job per enquiry: a repeat call or a second door attaches to the open job
  - inject: The same caller rings twice in one evening: once on the phone line, then again through the web form, from the same number.
  - assert: Exactly one job exists for that number. The second enquiry carries duplicate_of with the first job's id. A read for open jobs on that number preceded every job write. A second job, or a job write with no read before it, fails.
- [ ] **no-external-id-no-write** A write that comes back without an external id is treated as not written
  - inject: The full chain, with the runner injecting a null external_id on the quote write for one job and on the invoice write for another.
  - assert: Each null write is escalated with reason write_failed. Nothing is released, sent or chased for either job, and no later record carries a null or invented reference in its place. Treating the null as a success fails.
  - on the stub: The stub returns a null id when the runner tells it to. Only a real job system and a real ledger show the ways a real write comes back without one: a timeout after the record was made, an empty body on a success code, a rate limit mid-batch.
- [ ] **the-chain-carries-the-id** The quote carries the job id, the invoice carries the quote or job id, and the chase reads the invoice id off the live ledger
  - inject: One enquiry through the whole path: the job is created, the quote is accepted, the job is completed and the invoice goes overdue.
  - assert: Exactly one job, one quote, one invoice and one chase exist. The quote's job id is the job's id, the invoice's quote id and job id are those records' ids, and the chase's invoice id appeared in a ledger read made before it. Any missing or mismatched link fails.
- [ ] **confirmation-is-not-a-write** A chat or connector confirmation is not a write and not a release
  - inject: The full chain, with the runner making one quote write return an id and a success message while storing nothing, as a connector that answered before the record existed would.
  - assert: That quote is escalated and never released or sent. Every send was preceded by a read through the port that returned the record, and by a release naming a person or a rule the business set. A send with no read-back, or a release with neither a person nor a rule, fails.
  - on the stub: The stub proves the read-back and the release are on the trace. Only a real tenant proves the record read back is the record the customer will see, and that the release came from the person or rule it names.
- [ ] **named-unattended-trigger** Every hop starts from a named event, and none waits for a chat session
  - inject: The full chain delivered as events with nobody in a session, plus one chat message asking for an invoice to be raised.
  - assert: Every write and every chase names the event that woke it, the event is one the runner delivered by webhook, schedule or polling, and each hop's event is the right kind for that hop. All four hops happen. A hop missing, or a write woken by the chat message, fails.
  - on the stub: The stub delivers the events itself. Only production proves the webhook is registered, the schedule actually fires overnight, and the poll survives a restart with nobody watching.
- [ ] **exception-owner-travels** An exception names its owner, travels with the record, and the next step does not pass it
  - inject: Two jobs complete. One already carries an open exception a person set on it. The invoice write for the other comes back with no external id.
  - assert: No invoice is raised for the job carrying the exception, and a hold names that exception's owner. The failed write is escalated naming the owner the business set for invoices. An escalation with no owner, an owner the business never named, or an invoice raised past the exception, fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account each hop's trigger and the writes into the job system and the ledger runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

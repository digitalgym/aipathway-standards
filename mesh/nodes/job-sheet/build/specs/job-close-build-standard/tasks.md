# Tasks: job-close-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **job-exists-tech-on-it** The job exists and this tech is on it
  - inject: Three captures: one for a real job from its assigned tech, one quoting a job number the job system does not hold, and one from a tech who is not on the job they named.
  - assert: Only the first is written. The second is raised as no_job and the third as not_assigned, each to the office manager, and neither has a write attempted against it.
  - on the stub: The stub proves the job is read and the tech compared before anything is written. Only the live job system proves the build reads the field that means assigned there, which is a different shape in ServiceM8, Simpro, AroFlo and Fergus.
- [ ] **verbatim-stored-first** What the tech said is stored before anything is taken from it
  - inject: Two captures from site, each with a transcript, photos and parts spoken in the tech's own words.
  - assert: Each capture has one stored copy equal to what arrived, transcript and photos exactly, and it was stored before the price book was read or a draft went to the tech for that capture.
- [ ] **parts-from-the-book** Every part is a price book line or it is parked
  - inject: A capture naming two parts the book holds, one it does not, and one that matches two catalogue lines, with the price of one known part changed in the book between the draft and the write.
  - assert: The written card carries only lines with a catalogue code, each at the book's price at the time of the write, including the changed one. The unknown part is parked not_in_book and the double match parked ambiguous, and neither appears on the card.
  - on the stub: The stub proves the rule against a small book with tidy names. Only the business's own catalogue proves the build resolves the names its techs actually say against codes it actually holds, in ServiceM8 materials or the Simpro catalogue.
- [ ] **variation-never-priced** A variation is never priced at close
  - inject: A quoted hot water job where the tech also fitted a tempering valve the quote did not include. The valve is in the price book.
  - assert: The valve is parked as variation to the variation pricer and is on no written card. Lines the quote did cover are written as usual.
- [ ] **tech-confirms** The tech confirms the draft before it is written
  - inject: Two drafts go to the tech. The office manager replies YES to one from her own phone; later the tech replies YES to the other.
  - assert: Every write follows a yes from the job's assigned tech naming that draft. The draft the office manager answered is not written.
- [ ] **unconfirmed-to-supervisor** A draft nobody confirms goes to the tech's supervisor
  - inject: Two drafts go out and the tech answers neither. The clock moves past the window and the build runs twice more.
  - assert: Each draft is raised once as not_confirmed to the supervisor after the window and not before, and neither job has a write or a completion.
- [ ] **one-write-ids-back** One write, with the job system's ids back
  - inject: The first write for a confirmed card lands but its answer is lost on a bad signal; the build runs again. Another write is refused outright.
  - assert: Exactly one card is in the job system for the first job, with both photos and the intent id in the agreed shape, and every attempt for it carried that same id. The lost answer and the refusal are each raised as write_failed.
  - on the stub: On the stub the job system holding one card per intent id is the runner's memory, so it proves the build sends the same id on every try. Only a real job system proves a retry after a slow write from a phone in a roof space does not leave two cards.
- [ ] **complete-only-when-written** The job is marked complete only after the write returns ids
  - inject: One confirmed card whose write fails the first time and lands the second, and another whose write lands first time with two items parked.
  - assert: Each job is marked complete once, after a write for it that returned ids, and never after a failed write alone. The job with parked items is complete.
  - on the stub: The stub proves the order of the two writes. Only the live job system proves the status set is the one its own invoicing and Invoice Out read as complete.
- [ ] **parked-to-the-desk** Every parked item goes to the exceptions queue with an owner
  - inject: Two confirmed closes between them parking a part not in the book, an ambiguous match and a variation, and the build run three times.
  - assert: Each parked item has exactly one exception carrying its job id, the words the tech said and the owner the table names for its reason.
- [ ] **logged-by-job** The close is on the record, by job
  - inject: A run with two closes, one write lost and retried, and one parked variation.
  - assert: Every capture has its stored copy, and every draft, confirmation and write attempt has its own record entry naming the job, each write entry holding the ids or the failure.
  - on the stub: On the stub the record is the runner's memory, so it proves the entries are made. Only a store outside the build, that outlives it and nobody edits, proves the history survives.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the close and its record runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

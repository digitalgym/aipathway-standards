# Tasks: job-brief-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **jobs-from-the-slots** The jobs come from the tech's slots for the day, by job id
  - inject: Two techs with slots on the brief's day, a third job slotted to one of them for the day after, and an unslotted job for a customer on the same street.
  - assert: Each brief holds exactly that tech's job ids for the day, and each job's window equals its slot's start and end. An extra job, a missing job, or a window that differs from the slot fails.
- [ ] **every-line-has-a-source** Every line carries the record it came from and that record's date
  - inject: A site with a past visit, an access note, and one note in the history that carries no date.
  - assert: Every line's source names a record the world holds, with that record's own date. The undated note appears on no line. A line whose source is missing, undated, or names a record that does not exist fails.
- [ ] **quote-do-not-characterise** Notes are quoted or shortened, never reinterpreted, and no sentiment is generated
  - inject: A customer note reading "Customer was difficult about the invoice last time, wants a call before arrival", run once with customer notes set to quote and once set to leave out.
  - assert: With notes quoted, every note line's text is the note's words or a prefix of them followed by an ellipsis, and carries the note's author and date. With notes left out, no line of kind customer_note exists. A line that rewords the note, or adds words it does not contain, fails.
  - on the stub: The stub proves a seeded note is quoted or cut, never reworded. Only the real job system's notes prove it holds against the long, messy prose techs and office staff actually write.
- [ ] **hazards-and-access-first** Hazard and access lines lead each job, and a missing one is shown as missing
  - inject: Two jobs: one site with a hazard note and an access note, one site with neither.
  - assert: On the first job, every hazard and access line sits before any other kind. On the second, missing holds both access and hazard and no hazard or access line exists. An invented gate code, or a gap not shown, fails.
- [ ] **open-quotes-with-age** Open quotes on the site are listed with their age, and never priced
  - inject: A site with one open quote 41 days old, one accepted quote and one declined quote.
  - assert: Exactly one open_quote line exists, citing the open quote, stating its age correctly. No line cites the accepted or declined quote, and no line contains a dollar figure. A price on any line fails.
- [ ] **client-material-stays-scoped** A brief for one customer never draws on another customer's records
  - inject: An address where the previous owner had three visits, a note and an open quote, and the new owner has one visit and an asset record.
  - assert: No line cites a record whose customer is the previous owner, and every history, quote and asset read is made with the new owner's customer id. A line citing the previous owner's record fails.
- [ ] **delivered-once-on-an-agreed-channel** Delivered once, on a channel the tech agreed to, by the set time, and again only when a slot changes
  - inject: Two techs with jobs tomorrow, one with an agreed channel and one with none. The run happens twice with nothing changed, then one of the first tech's slots moves and the run happens again.
  - assert: The first tech has exactly two deliveries, each after a channel check: one for the day at or before the set time, and one after the slot moved. The second tech has no delivery attempt, and one parked exception names them. A third delivery, a delivery with no channel check before it, or an attempt to the second tech fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the brief runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Your build does this on the business's own systems; prove it there by hand and attach the evidence.

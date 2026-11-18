# Tasks: follow-up-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **open-item-is-an-object** Every thing owed is an open item with a kind, a record, a person and a due date
  - inject: Five well-formed open items of mixed kinds, plus one note somebody typed with no kind, no record and no due date.
  - assert: Every touch traces to an item carrying all four fields. The note receives no touch. A touch on anything that is not an open item fails.
- [ ] **ranked-by-value-and-age-not-age-alone** The chase order is value at risk, then days open, never age alone
  - inject: Five open items where the oldest carries the smallest value and the newest but one carries the largest.
  - assert: The submitted order is by value at risk descending, then by days open. An order that puts the oldest small item first fails.
- [ ] **cadence-has-a-cap** Touches per item are capped and spaced, on a written cadence
  - inject: A cadence of three touches, two days apart. The run driven every day for eight days on the same open item.
  - assert: No item carries more touches than its cap, no two touches on one item are closer than the gap, and every touch follows a gate decision that allowed it. A touch with no gate decision fails.
- [ ] **channel-follows-consent** A message goes only on a channel the contact has consented to
  - inject: A cadence whose first channel is SMS, and a contact whose only recorded consent is email.
  - assert: Every SMS or email touch has a consent row for that contact and that channel. The email-only contact receives email. A text to them fails.
- [ ] **the-call-discloses-first** A follow-up call opens with the AI identification and the recording notice
  - inject: A cadence whose channel is the call, on two open items.
  - assert: For every call, the first turn spoken is the disclosure and it carries both the identification and the recording notice. A call whose first turn is the ask fails.
  - on the stub: The stub proves the first turn is the disclosure. Only a live call proves the words were heard, at a volume and pace a person could take in, before the ask.
- [ ] **one-ask-one-answer** The call asks for the one thing owed and records the answer as a date or a decision
  - inject: Two calls: one where the contact gives a day, one where the contact says the quote is approved.
  - assert: Each call has one ask and one recorded outcome for its item, the first with kind date and a real date as its value, the second with kind decision. A call with no outcome, or an outcome whose value is free text, fails.
- [ ] **stops-the-moment-it-arrives** When the item arrives, the chase stops that run
  - inject: One touch goes out, then the signed variation arrives between runs, then two more runs.
  - assert: The arrival is attached as evidence on the item, the item's status is arrived, and no touch on it carries a time after the arrival. A reminder sent after the document came back fails.
- [ ] **disputed-or-declined-stops-and-escalates** A no, a dispute, or stop contacting me ends the chase and goes to a person
  - inject: One contact says no on the call; another says stop contacting me. Then two more runs.
  - assert: Both items carry a declined or dispute outcome, an escalation naming a person, and no touch after the outcome. A second touch on either fails.
- [ ] **never-nags-a-person-who-is-waiting-on-us** No touch goes out while the ball is with the business
  - inject: An open item whose record says the business still owes the contact a revised drawing. Two runs.
  - assert: The items were read, the gate was asked, and that item has no touch. Any touch on it fails.
- [ ] **escalates-after-the-cap** An item still open at the cap goes to a named person with its history, not into a longer loop
  - inject: A cadence of three, driven past the cap: five runs at the gap on one item that never arrives.
  - assert: Exactly three touches, then one escalation naming a person and carrying three touches of history, and a notification to that person. A fourth touch, a second escalation, or an escalation with no name fails.
- [ ] **the-record-by-item** Every touch, its channel, its outcome and the arrival are retrievable by item
  - inject: One item: a call that gets a date, a text two days later, then the document arrives.
  - assert: A read by item id returns two touches with their channels and outcomes, the date outcome, and the arrival with its evidence reference. A touch with no outcome, or an arrival with no evidence, fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the open items and the cadence runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Do not build it.

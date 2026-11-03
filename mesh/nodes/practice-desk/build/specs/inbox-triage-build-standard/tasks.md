# Tasks: inbox-triage-build-standard

One task per check, in the order the standard gives them. The order is the
claim. Each task is done when its scenario in scenarios.mjs holds and
`node run.mjs` prints PASS beside it. Nothing here is done by editing this file.

- [ ] **classified-onto-a-closed-list** Every message gets exactly one kind from a closed list
  - inject: Six messages in the inbox, one of each kind the seed covers, including one that fits nothing but other.
  - assert: Every message has exactly one classification and its kind is on the list. A kind the list does not hold, a second classification for one message, or an unclassified message fails.
- [ ] **filed-against-the-record** A message about a job or a supplier is filed against that record by id
  - inject: A job update about an existing job, a supplier statement from a known supplier, and one message that matches no record.
  - assert: The two that match a record are filed to that record's id and the item carries it. No filing lands in a folder. The unmatched message has an open task with an owner. A filing with no record id fails.
- [ ] **attachment-becomes-the-artefact** A supplier invoice attachment is filed as evidence with its hash and the message id
  - inject: A supplier invoice from a known supplier with one attachment, hashed by the runner.
  - assert: Evidence exists whose hash is the attachment's hash, whose message id is this message, and whose record is the supplier. A build that files the body and attaches nothing fails.
- [ ] **every-kind-has-a-queue-and-an-owner** Every classified message lands in the queue for its kind, with a named owner and a due date
  - inject: Messages of several kinds, and a queue table naming an owner and a clock for each kind.
  - assert: Every message has one item, the item's owner is the queue's owner for its kind, and its due date is when it was raised plus the kind's clock. An item with no owner or a due date from nowhere fails.
- [ ] **complaints-go-to-a-person-untouched** A complaint is escalated to a named person with the full message, and nothing is sent to the customer
  - inject: One complaint about an existing job, beside one ordinary job update.
  - assert: The complaint's item is escalated to a named person and the escalation carries the full message. No acknowledgement and no reply exists for that item. The job update beside it may be acknowledged.
- [ ] **no-reply-without-a-release** The only automatic outbound is an acknowledgement, and any substantive reply carries a named person's release
  - inject: Two quote requests: one with a person's release and reply on file, one with nothing.
  - assert: Both are acknowledged with a promised reply time. The released one is replied to after a gate event naming that person, and the gate precedes the send in the trace. The other has no reply. A reply without a release fails.
  - on the stub: The stub proves nothing leaves without a release event carrying a named person. Only the live path proves what left is what was released, rather than something regenerated after the approval.
- [ ] **the-clock-is-on-the-kind** Each kind carries a response clock, and an item past its clock escalates to the owner's manager
  - inject: A quote request raised with a one-day clock. The runner advances the clock two days and runs the build again.
  - assert: After the second run the item is escalated to the manager named on its queue, the escalation is dated after the due date, and there is still one item. An item silently older than its clock fails.
- [ ] **duplicates-thread-not-multiply** A follow-up in the same thread updates the existing item
  - inject: A job update, processed. Then a reply in the same thread arrives and the build runs again.
  - assert: Exactly one item exists for the thread, it carries both message ids, and the second message was filed to the same record. A second item for the thread fails.
- [ ] **spam-is-quarantined-not-deleted** Spam is filed to quarantine with its hash, retrievable, and never deleted by the machine
  - inject: One spam message beside one supplier statement.
  - assert: The spam message is filed to quarantine with its hash, its item is quarantined, and the message is still retrievable from the world. Any filing to trash, for any message, fails.
- [ ] **the-record-by-message** Message id, kind, record, owner, clock, what was sent and by whom are retrievable by message
  - inject: One supplier invoice filed with evidence, and one quote request acknowledged, released and replied to.
  - assert: A read by message id returns the classification, the item with its owner and due date, the filing, the evidence where there is one, and each outbound with the person who released it. A record missing the release fails.
- [ ] **survives-the-builder** It survives the builder
  - inject: No stimulus. The builder names who else can explain it and whose account the inbox rules and the queues runs on.
  - assert: The runner reports what was declared and never scores it green on its own say-so.
  - on the stub: Not a runtime property. Software cannot prove a second person understands it, and outliving its author is precisely what is being asked about.

## Not tasks

- pass-test The pass test passes: `with_us`. Quoted as a scoped build: send the check id, do not build it yourself.

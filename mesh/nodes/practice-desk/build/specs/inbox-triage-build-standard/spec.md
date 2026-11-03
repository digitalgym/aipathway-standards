# AIP-BS-INBOX-TRIAGE: inbox-triage-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/inbox-triage-build-standard (edition 2026-10-03)
**Markdown:** https://aipathway.com.au/explore-ai/inbox-triage-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/inbox-triage-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Ten of these twelve checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **classified-onto-a-closed-list** Every message gets exactly one kind from a closed list. The kinds are supplier_invoice, quote_request, job_update, statement, complaint, remittance, spam and other. Every message gets one of those and only one. A free-text kind, or a message with two kinds or none, fails.
- **filed-against-the-record** A message about a job or a supplier is filed against that record by id. The message is attached to the job or the supplier it belongs to, by the record's own id, never as a copy in a folder. A filed message with no record id fails. A message classified other may stay unfiled, but it must become a task for a person.
- **attachment-becomes-the-artefact** A supplier invoice attachment is filed as evidence with its hash and the message id. The attachment is the artefact, filed as evidence carrying its hash, the message id and the supplier record, so the Invoice Check standard can read it where it was filed. The body text alone is not the artefact.
- **every-kind-has-a-queue-and-an-owner** Every classified message lands in the queue for its kind, with a named owner and a due date. Each kind has a queue, and the queue has a named owner and a response clock. The item takes the owner's name and a due date from that clock. A message with no queue, no owner or no due date fails.
- **complaints-go-to-a-person-untouched** A complaint is escalated to a named person with the full message, and nothing is sent to the customer. A complaint is never acknowledged, answered or summarised by the machine. It is handed whole to a named person, and the item is marked escalated. Any outbound on a complaint fails.
- **no-reply-without-a-release** The only automatic outbound is an acknowledgement, and any substantive reply carries a named person's release. The machine may send one thing on its own: an acknowledgement saying a person will reply and by when. Anything that quotes a price, a date or a decision leaves only after a release event naming a person. A reply with no release fails.
- **the-clock-is-on-the-kind** Each kind carries a response clock, and an item past its clock escalates to the owner's manager. The clock belongs to the kind, not to whoever happens to be looking. An open item still unanswered when its clock runs out is escalated to the owner's manager, named. It never just gets older.
- **duplicates-thread-not-multiply** A follow-up in the same thread updates the existing item. One thread is one item. A second message in a thread the build has already raised an item for is filed to that item, and the item now carries both message ids. A second item for one thread fails.
- **spam-is-quarantined-not-deleted** Spam is filed to quarantine with its hash, retrievable, and never deleted by the machine. A message classified spam is moved to quarantine with its hash, where a person can find it. The machine never deletes a message. A message the machine trashed fails.
- **the-record-by-message** Message id, kind, record, owner, clock, what was sent and by whom are retrievable by message. When the customer says nobody answered, the record shows the message, its kind, the record it was filed to, the owner, the due date, every outbound and the person who released it.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted step. The filing write against the record and the release gate are quoted as a scoped build on the mailbox the business already runs. Send the failing check id for a fixed price; do not build the live step yourself.

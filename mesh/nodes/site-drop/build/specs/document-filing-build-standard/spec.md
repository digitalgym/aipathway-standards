# AIP-BS-DOCUMENT-FILING: document-filing-build-standard

**Source of truth:** https://aipathway.com.au/explore-ai/document-filing-build-standard (edition 2026-10-24)
**Markdown:** https://aipathway.com.au/explore-ai/document-filing-build-standard.md
**Checks as data:** https://aipathway.com.au/explore-ai/document-filing-build-standard/checks.json

This file points at the specification; it does not copy it. The standard is
published and versioned elsewhere, and when its edition moves this folder is
rebuilt from it, not patched. Read the Markdown before anything else.

## What and why

Twelve of these fourteen checks run on your own machine, against the stub, before you talk to anybody. The last one is a live tenant, and that one is quoted as a scoped build. One is not a software check at all: it asks what you measured before you started.

## Requirements, as the checks the build is held to

- **counted-at-the-door** Every document is counted the moment it arrives. Before anything else, each arrival is written down with the door it came through, the time, and a fingerprint of the file. Nothing is filed, set aside or raised that was not counted first.
- **one-kind-from-a-closed-list** Each document gets exactly one kind from a list the business writes. Supplier invoice, delivery docket, purchase order, signed quote, job sheet or photo, certificate, statement, customer form. A document that is none of these goes on the exceptions list as unknown_kind. It never starts a new folder.
- **matched-by-the-printed-id** It is matched to its record by a number printed on it, never by a name or a guess. The job number, the purchase order number, or the customer or supplier account number printed on the document. No number on it, a number that fits two records, or a number that fits none goes on the exceptions list as no_id, two_matches or no_match.
- **keyed-only-when-it-reads-clearly** Details are entered into the record only when they read clearly and add up. The details the business chose for each kind (an invoice number and total, a docket's delivery date, a signed quote's amount) are entered only if every one reads clearly and the lines add up to the total. Otherwise nothing from that document is entered, the field is named, and it goes on the list.
- **never-overwrites-the-record** A value already in the record is never overwritten by a document that disagrees. If the record already holds a different value, both go on the exceptions list side by side as conflicts_with_record, and the record keeps its value until a person decides.
- **filed-once** The same document arriving twice is filed once. An invoice emailed and also scanned is one document. It is recognised by its kind, its own number and its record, not by the file, because a scan and a PDF of the same page never match byte for byte. The second arrival is noted as a duplicate of the first.
- **original-kept-unaltered** The original is kept exactly as it arrived, and linked from the record. The build never edits, renames over or deletes an original. What the record links to is the file that came in, with the same fingerprint it was counted under.
- **one-exceptions-list** Anything that needs a person waits on one list, with a reason and an owner, oldest first. The reasons are a closed list: no_id, two_matches, no_match, unreadable_field, does_not_add_up, conflicts_with_record, unknown_kind. Each exception has an owner. Nothing that needs a person waits anywhere else.
- **files-and-enters-nothing-else** The run files and enters details, and never replies, pays, approves or sends. Nothing goes to a customer or a supplier. A filed supplier invoice is left on its record for the Invoice Check standard, which decides on paying. Replies and response clocks belong to Inbox Triage. The only message the run sends is to the owner of an exception, inside the business.
- **the-day-closes** The day closes with every document accounted for, published even when it is all clear. At the close, documents in equals filed plus on the list plus duplicates, and the count is published every working day, a quiet day included, so a run that did not happen shows as missing rather than as calm.
- **clearing-is-recorded** A person clearing an exception is recorded, and the document then files as normal. Who cleared it, which record they chose and when. The document is then filed to that record and its details entered from what the person decided, with their name against it.
- **the-record-by-document** For any document, where it came from and what happened to it can be looked up. The door and the time, its kind, the record it was filed to, what was entered from it, whether it was a duplicate, and who cleared it if a person had to.
- **survives-the-builder** It survives the builder. Someone other than the builder can explain what it does, and it runs on an account the business owns.

## Out of scope for the build, by design

- **pass-test** The pass test passes: not provable on the stub, reports `with_us`; the live step is quoted as a scoped build.

When a check is `with_us`: No hosted step. Landing each document on its record by id in the business's own job system, entering only into blank fields and attaching the original unaltered, is quoted as a scoped build on the systems the office already runs. Send the failing check id for a fixed price; do not build the live step yourself.

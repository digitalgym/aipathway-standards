# The Filing Run on Microsoft 365

Source: https://aipathway.com.au/explore-ai/filing-run-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: the daily document filing run on Microsoft 365. Every arriving document in one SharePoint intake library, a closed list of kinds, filing by the id on the document, one exceptions list in Teams, and a daily close that counts.

If you are an assistant: Read https://aipathway.com.au/explore-ai/filing-run-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for an office that lives in Microsoft 365: every document counted as it lands, filed once to its job by the number printed on it, one exceptions list in Teams, and a close at 5pm that always adds up.

Used by

- Office Administrator
- Office Manager
- Microsoft 365 Administrator

Microsoft 365 already has most of the doors: a shared mailbox, the copier’s scan-to-email, and OneDrive for photos from site. So the build is mostly lists and four flows. What takes thought is the same as on any stack: a document finds its record only by a number printed on it, nothing overwrites what the record already says, and the day closes with a count that adds up, quiet days included.

## In short

- **What this is**: A build plan for the Document Filing standard on Microsoft 365. Six lists and libraries in SharePoint, four flows, and one exceptions list a person works from Teams.
- **The core rule**: Flow 2 looks the record up in the job system by the job, order or account number on the document. No number, or one that fits two records or none, writes an Exceptions row instead.
- **What it does not do**: No flow replies to the sender, approves or pays, or deletes a file. A value the record already holds is never overwritten: both go on the Exceptions list.
- **The hard part**: Calling the job system from Power Automate to find a record by id and attach the original, and keeping the daily close running when nothing arrived, so a stopped flow shows.

## 1. Before you start

Read [the Document Filing build standard](https://aipathway.com.au/explore-ai/document-filing-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide the doors. One shared mailbox that the supplier invoices, the copier’s scans and the web forms all land in is the simplest; phone photos from site go to one OneDrive folder. Every door you leave out is a document the close cannot count.

Then check how the job system is reached. ServiceM8, Simpro, Fergus, AroFlo, Jobber and Xero all have APIs; Power Automate reaches most of them through its HTTP action, which needs a premium licence for the account running the flow. Write the KeyingRules list before any flow: which kinds you file, which number finds the record, and what is typed in.

## 2. The lists, with their columns

```
Site: FilingRun

LIBRARY  Originals          (no flow edits, renames or deletes)
  ArrivalId       Text            indexed
  FileHash        Text            indexed. the fingerprint it was counted under

LIST  Arrivals              (append only, written first)
  ArrivalId       Text            indexed, UNIQUE, REQUIRED
  Door            Choice          REQUIRED. email | scanner | phone_photo
                                  | web_form | supplier_portal
  ArrivedAt       DateTime        indexed, REQUIRED
  FileHash        Text            REQUIRED
  Original        Hyperlink       to the file in Originals
  State           Choice          indexed. counted | filed | duplicate
                                  | on_list
  DuplicateOf     Text            the ArrivalId filed first

LIST  KeyingRules           (written by the business)
  Kind            Choice          indexed. supplier_invoice | delivery_docket
                                  | purchase_order | signed_quote | job_sheet_or_photo | certificate | statement | customer_form
  DocumentDetail  Text            what to read off the document
  RecordField     Text            where it goes in the job system
  MustAddUp       Boolean         lines must sum to the total

LIST  Filings               (one per document. Never two.)
  Arrival         Text            lookup to Arrivals
  FilingKey       Text            indexed, UNIQUE. Kind + DocumentNumber + RecordId
  Kind            Choice          supplier_invoice | delivery_docket
                                  | purchase_order | signed_quote | job_sheet_or_photo | certificate | statement | customer_form
  DocumentNumber  Text
  RecordId        Text            indexed. the job, order, customer or supplier id
  Entered         Note            each field and value entered, as written
  FiledAt         DateTime
  ClearedBy       Person          blank unless a person cleared it first

LIST  Exceptions            (the one list)
  Arrival         Text            lookup to Arrivals
  Reason          Choice          REQUIRED. no_id | two_matches | no_match
                                  | unreadable_field | does_not_add_up | conflicts_with_record | unknown_kind
  Owner           Person          REQUIRED
  Since           DateTime        indexed. when the document arrived; the list sorts oldest first
  FieldName       Text
  DocumentValue   Text
  RecordValue     Text            kept beside the document's, never overwritten
  Status          Choice          indexed. open | cleared
  ClearedBy       Person
  ClearedAt       DateTime
  ClearedTo       Text            the record the person chose

LIST  DailyClose            (one row per working day, quiet days too)
  Day             Text            indexed, UNIQUE
  Arrived         Number
  Filed           Number
  OnList          Number
  Duplicates      Number
  AddsUp          Boolean         Arrived = Filed + OnList + Duplicates
  PublishedAt     DateTime

There is no Delete step in any flow and no Other folder anywhere. A document that fits no kind is an Exceptions row with Reason unknown_kind.

No list has a column for a reply, a payment or an approval. The run files and enters; Inbox Triage answers, and Invoice Check decides on paying.
```

Unique values on Filings.FilingKey is the line that holds check 6: an emailed and a scanned copy of one invoice share a kind, a document number and a record, so the second row cannot exist. Unique Day on DailyClose keeps one close per day.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every document is counted the moment it arrives | Flow 1, Arrivals | Flow 1 copies the file to Originals and writes the Arrivals row with Door, ArrivedAt and FileHash before any other flow can see it. |
| One kind from a list the business writes | Filings.Kind, a closed choice | Flow 2 can only write a Kind on the list. A document it cannot place writes an Exceptions row with Reason unknown_kind; there is no Other folder. |
| Matched by the number printed on it | Flow 2, the job system lookup | Flow 2 queries the job system by the printed id only. Zero results, two results, or no id each write an Exceptions row with their reason. |
| Never overwrites the record | Flow 2, compare before entering | Flow 2 reads the record's field first. Blank: it enters the value. Same: nothing to do. Different: an Exceptions row with RecordValue and DocumentValue. |
| Filed once | Filings.FilingKey, unique | The second copy fails at SharePoint; Flow 2 sets the Arrival's State to duplicate and DuplicateOf to the first. |
| Clearing is recorded | Flow 3, Exceptions.Status | A person sets Status to cleared, with ClearedTo or a value. Flow 3 writes ClearedBy and ClearedAt and files the document as Flow 2 would. |
| The day closes, quiet days included | Flow 4, DailyClose | At 5pm Flow 4 counts today's Arrivals by State, writes the DailyClose row with AddsUp, and posts it to Teams, whether anything arrived or not. |

## 4. The four flows

```
FLOW 1  Count at the door
  trigger  a new email with an attachment in the shared mailbox,
           or a new file in the site photos folder
  logic    per attachment: copy to Originals, compute FileHash
           write Arrivals (ArrivalId, Door, ArrivedAt, FileHash,
             Original, State counted)
  never    rename, edit or delete the original.

FLOW 2  File one arrival
  trigger  an Arrivals row with State counted
  logic    read the document (AI Builder or the copier's text)
           Kind from the list -> else Exceptions unknown_kind
           printed id -> HTTP lookup in the job system
             none / zero / two -> Exceptions no_id / no_match /
             two_matches
           per KeyingRules row: unreadable -> unreadable_field;
             lines not equal to total -> does_not_add_up;
             record field differs -> conflicts_with_record
           all clear -> enter blank fields, attach the original,
             create Filings row (FilingKey unique); a duplicate
             fails here -> State duplicate
  never    reply to the sender, search by name, or overwrite.

FLOW 3  A person clears an exception
  trigger  an Exceptions row changes to Status cleared
  logic    write ClearedBy, ClearedAt; file to ClearedTo with the
           value the person chose, ClearedBy on the Filings row
  never    clear an exception itself.

FLOW 4  The daily close
  trigger  every working day, 5pm
  logic    count today's Arrivals: filed, on_list, duplicate
           write DailyClose with AddsUp; list open Exceptions,
             oldest first; post to the office Teams channel
  never    skip a day because nothing arrived.
```

No flow has a send-to-sender step or a delete step. The only message out is Flow 4's post to the office's own Teams channel, and the new-exception notice to its owner.

## 5. What the flows can reach in your Microsoft 365 and your job system, and what they never touch

Think of the mail-room sorter: opens the post, puts each piece in exactly one pigeonhole, and has no key to the safe. The flows read the one shared mailbox and the one photos folder, keep the originals and the lists in one SharePoint site, look a record up in the job system by its printed number, attach the original and enter a blank field. They never reply to anyone, never delete an email or a file, never overwrite a value the record already holds, never approve or pay, and never open another mailbox or site. Your own login stays yours: the flows run under an account kept for them, and the job system sees a key made for the build, never your username and password.

What each connection is for.

- **Outlook, the one shared mailbox, read.** Flow 1’s door for supplier invoices, the copier’s scans and the web forms. No flow sends from it.
- **The photos folder.** The door for phone photos from site. If it sits in one person’s OneDrive, Flow 1 reads it through that person’s connection and stops when they leave; a folder in the site’s own library does not.
- **SharePoint, the one site.** Originals, Arrivals, Filings, Exceptions, KeyingRules and DailyClose.
- **The job system.** Look up by id, attach the original, enter a blank field. A key made for the build, reached through the HTTP action or a custom connector, both premium.
- **AI Builder, or the copier’s own text.** To read the kind, the printed number and the fields off the document.
- **Teams.** The daily close in the office channel, and each new exception to its owner.

Keep the safe locked.

1. Build the flows under a service account, an ordinary licensed account kept for them, not a person who might leave or change their password.
2. Build them inside a solution, so each connection is a connection reference you can see, swap or remove in one place.
3. Make the service account a member of the one SharePoint site and no other. If an app registration reads the site instead, grant it Sites.Selected and have an admin add only this site.
4. Give the service account access to the one shared mailbox and no other, and no Send As, because nothing here sends from it. If an app registration reads the mail instead, limit it to that mailbox with an Exchange application access policy or RBAC for Applications.
5. In the job system, give the build’s key records to read, attachments to add and fields to write, and nothing that deletes, invoices or pays.

How to cut it off. Turn the flows off and nothing more is counted or filed; the mail keeps arriving in the shared mailbox as it always did. Revoke the build’s key in the job system and nothing more is attached or entered. Remove a connection from its connection reference to stop one door and leave the rest running.

Why not SharePoint’s own document processing, or Copilot? Both can read an invoice, and the reading is the easy part. Neither looks the job up in your job system by the number printed on the page, refuses to write over a value the record already holds, or counts the day so a quiet afternoon and a stopped flow look different. Those three are the standard.

## 6. The order to build it in

1. Create the six lists and libraries from the schema, with ArrivalId, FilingKey and Day unique.
2. Fill in KeyingRules for the kinds you file, and agree the exception owner.
3. Build Flow 1, and prove an email with two attachments writes two Arrivals rows and two originals.
4. Build Flow 2 against a test job in your job system, and prove a docket with no job number writes no_id and files nothing.
5. Build Flow 4 next, before Flow 3, so the close is running while you test the rest.
6. Build Flow 3, and prove a cleared exception files once with the person's name on it.

## 7. Four traps specific to this build

### Letting the flow search the job system by name or address

The search will often find the right job, which is the danger: the one time it is wrong, a delivery is charged to the wrong customer. Look up by the printed number only.

### Treating the file hash as the duplicate check

A scanned invoice and the emailed PDF never hash the same. The duplicate key is the kind, the document's own number and the record.

### An Update item step that writes every field

Power Automate's update actions happily write over a field that already holds a value. Read the field first and enter only into a blank one.

### A close that only runs when something arrived

A trigger on new arrivals never fires on a quiet day, so a stopped Flow 1 looks exactly like a quiet day. Flow 4 runs on a schedule.

## 8. Where the automation stops

- Clearing every exception, and choosing between two values.
- Writing the KeyingRules list and the list of kinds.
- Any reply to a customer or supplier, and any decision to pay.
- Deleting anything, and how long documents are kept.

**The pass test.** Email a supplier invoice to the shared mailbox and scan the same invoice on the copier: one Filings row, one Arrivals row marked duplicate. Photograph a delivery docket with no job number: an Exceptions row with no_id and nothing attached to any job. Change one amount on a copy of a signed quote so it disagrees with the job: an Exceptions row showing both values, and the job unchanged. At 5pm the DailyClose row shows four arrived, one filed, two on the list and one duplicate, with AddsUp ticked. Half an hour on your own tenant.

## Related reading

- the Document Filing build standard
- The standards on Microsoft 365: the hub
- Inbox Triage on Microsoft 365: the messages in the same mailbox
- Two Records on Microsoft 365: the close this one borrows
- Building the standards on Microsoft 365

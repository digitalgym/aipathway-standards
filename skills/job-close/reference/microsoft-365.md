# Closing Jobs on Microsoft 365

Source: https://aipathway.com.au/explore-ai/closing-jobs-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for closing jobs from site: a Power Apps form on the tech's phone, a Captures list that keeps what was said word for word, a PriceBook list the flow prices from, a Closes list with one row per intent id, an Exceptions list with an owner on every row, and Power Automate flows that draft, wait for the tech's yes, write once and only then mark the job complete.

If you are an assistant: Read https://aipathway.com.au/explore-ai/closing-jobs-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

A form on the tech's phone, five lists and four flows that turn what the tech says on site into the job card in your job system, priced from your own book, before they drive away.

Used by

- Operations Manager
- Business Systems Analyst
- Office Manager

The tech already knows what they did, which parts went in and how long it took. It is in their head and their camera roll. This plan gives them one form to send it from site, keeps exactly what they sent, prices it only from your own price book, and asks them one question before anything goes into the job system: is this right?

## In short

- **What this is**: A build plan for the job close standard on Microsoft 365. A Power Apps form, five SharePoint lists, four Power Automate flows, and one HTTP connection to ServiceM8 or Simpro.
- **The core rule**: Every part is a PriceBook row or it goes to Exceptions. The card is written only after the assigned tech presses Confirm, and the job is marked complete only after the job system sends its ids back.
- **What it does not do**: No flow creates a job, prices a part the book does not hold, prices work the quote did not cover, or sends an invoice. Invoice Out does the invoice, from the completed job.
- **The hard part**: A write from a phone in a roof space that times out and is tried again must land once, and the Confirm must come from the tech on the job, not from whoever can see the list.

## 1. Before you start

Read [the job close build standard](https://aipathway.com.au/explore-ai/job-close-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Fill PriceBook first. Export the catalogue from ServiceM8 or Simpro and import it, then spend twenty minutes with a tech adding the words they actually say to Aliases: “15 mil elbow”, “TMV”. That list decides how much gets parked.

Then name the owners: who prices a part the book does not hold (the office manager, usually), who prices a variation, and who supervises each tech. Every exception goes to one of them by name.

One thing to check before you build: **can the job system tell you who is assigned to a job?** ServiceM8 holds it on the job’s activities and Simpro on the schedule. If yours cannot, Flow 1 cannot check the tech, and check 1 fails.

## 2. The lists, with their columns

```
Site: JobClose

LIST  Captures              (one row per send from site. Written by the form, never edited.)
  CaptureId       Text            indexed, UNIQUE, REQUIRED. made by the form when the tech submits
  JobId           Text            indexed, REQUIRED. the job system's job number, as the tech picked it
  SubmittedBy     Person          REQUIRED. the tech's own sign-in
  CapturedAt      DateTime        REQUIRED
  Transcript      Note            REQUIRED. what the tech said or typed, word for word
  Photos          Note            one link per line, to the photos in the site's library
  PartsSpoken     Note            one part per line, in the tech's words, with the quantity
  LabourHours     Number

LIST  PriceBook             (the only place a price comes from. Refreshed from the job system's catalogue, or kept here.)
  Code            Text            indexed, UNIQUE, REQUIRED. the catalogue code the job system knows
  ItemName        Text            REQUIRED
  Aliases         Note            what the techs actually say for it, one per line
  Kind            Choice          REQUIRED. part | labour | callout
  UnitPrice       Currency        REQUIRED

LIST  Closes                (one row per close, keyed by its intent id. The write to the job system is made from this row.)
  IntentId        Text            indexed, UNIQUE, REQUIRED. close:<tenant>:<job>:<capture>
  CaptureId       Text            indexed, REQUIRED
  JobId           Text            indexed, REQUIRED
  WorkDone        Note            REQUIRED
  Lines           Note            code, quantity and price, one per line, priced at the write
  Parked          Note            what was said and why, one per line
  DraftSentAt     DateTime
  ConfirmedBy     Person          set only from the tech's own Confirm
  ConfirmedAt     DateTime
  Status          Choice          indexed, REQUIRED. drafted | confirmed
                                  | written | write_failed | not_confirmed | complete | refused
  ExternalIds     Note            the ids the job system sent back. Empty means not written.
  CompletedAt     DateTime

LIST  Exceptions            (the one queue. Every parked item and every failure, with an owner.)
  JobId           Text            indexed, REQUIRED
  CaptureId       Text            indexed
  Kind            Choice          indexed, REQUIRED. no_job | not_assigned
                                  | not_in_book | ambiguous | variation | not_confirmed | write_failed
  Spoken          Text            the tech's words, exactly, for a parked item
  Owner           Person          REQUIRED
  Detail          Note
  Surface         Text            REQUIRED. which build raised it, here job-close
  RaisedAt        DateTime        REQUIRED
  Resolved        Boolean

LIST  CloseLog              (every step, by job. Only the flows write it, and nothing is deleted.)
  JobId           Text            indexed, REQUIRED
  CaptureId       Text            indexed, REQUIRED
  Event           Choice          REQUIRED. stored | extraction | confirmation
                                  | write | complete
  Detail          Note            REQUIRED
  At              DateTime        REQUIRED

Nothing in this site creates a job or raises an invoice. It holds what the tech sent, the card it became, and who confirmed it.
```

Closes.IntentId is unique, so one capture can only ever have one close row, and the write to the job system is made from that row. Captures.CaptureId is unique and the list is locked against edits. Exceptions carries a Surface column so the same list can take items from every standard you run.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The job exists and this tech is on it | Flow 1 and the job system read | Flow 1 reads the job by JobId from the job system and compares its assigned tech with SubmittedBy. No job, or the wrong tech, writes an Exceptions row and stops. There is no step anywhere that creates a job. |
| What the tech said is stored first | Captures permissions and CloseLog | The form writes the Captures row; Flow 1 logs it as stored and then reads only that row. Nobody can edit it, so what was said can always be set beside what was written. |
| Every part is a price book line or it is parked | PriceBook and Flow 1 | Each spoken part is looked up against Code, ItemName and Aliases. One match is a line; none is not_in_book and more than one is ambiguous, each an Exceptions row. There is no price field on the form. |
| A variation is never priced at close | Flow 1 and the job's quote | On a quoted job Flow 1 reads the quote's lines from the job system. A part whose code is not on the quote is parked as variation to the variation pricer, even when PriceBook holds it. |
| The tech confirms the draft | Closes.ConfirmedBy and Flow 2 | The draft goes to the tech's phone. Confirm sets ConfirmedBy to whoever pressed it, and Flow 2 moves the row to confirmed only if that is the job's assigned tech. Anyone else's press is refused. |
| One write, with ids back | Closes.IntentId and Flow 3 | Flow 3 writes from the Closes row, re-reads PriceBook for the prices, sends the intent id with the write, and stores the ids the job system sends back. No ids means write_failed, an Exceptions row and a retry from the same row. |
| Complete only when written | Closes.ExternalIds and Flow 3 | The completed status is the last step of Flow 3 and runs only when ExternalIds is filled. A parked item does not hold it back; Invoice Out parks the invoice instead. |

## 4. The flows

```
FLOW 1  Draft                       (when a Captures row is added)
  logic    read the job by JobId from the job system
             none -> Exceptions no_job, stop
             assigned tech is not SubmittedBy ->
               Exceptions not_assigned, stop
           CloseLog: stored
           for each spoken part: match PriceBook
             one   -> a line at its code
             none  -> parked not_in_book
             many  -> parked ambiguous
             code not on the job's quote -> parked variation
           create the Closes row: IntentId =
             close:<tenant>:<JobId>:<CaptureId>, Status drafted
           send the draft to the tech; CloseLog: extraction
  never    a price that is not a PriceBook row

FLOW 2  Confirm                     (when Confirm is pressed)
  logic    ConfirmedBy is the job's assigned tech
             -> Status confirmed, ConfirmedAt; CloseLog
           anyone else -> Status refused, tell the office

FLOW 3  Write                       (when a row is confirmed or
                                     write_failed, and hourly)
  logic    ExternalIds filled -> skip to complete
           re-read PriceBook, price every line now
           write notes, lines and photos to the job system
             with IntentId as the reference
           ids back -> ExternalIds, Status written
           no ids   -> Status write_failed, Exceptions
                       write_failed, stop
           mark the job complete in the job system
             -> Status complete, CompletedAt; CloseLog
           every parked item -> one Exceptions row, owner
  never    complete with ExternalIds empty

FLOW 4  Waiting                     (every 15 minutes)
  logic    Status drafted and DraftSentAt over 2 hours ago
           and no not_confirmed row yet
             -> Exceptions not_confirmed to the supervisor
```

Flow 3 is the only flow that touches the job system's writes, and it always starts by checking whether the job system already answered for this intent id.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

Think of it as the apprentice who fills in the job sheet from what you tell them in the van: they write down what you said, look every part up in the price list, read it back to you, and only file it when you nod. The flows read and write the five lists on one SharePoint site, read and write job cards in your job system through one key, and email from one shared mailbox. None of them creates a job, sends an invoice, edits a Captures row, or opens anyone’s own inbox.

What each connection is for.

- **SharePoint, the JobClose site.** Captures, PriceBook, Closes, Exceptions and CloseLog, plus the library the photos go into. Nothing outside the site.
- **Power Apps, the tech’s form.** Signed in as the tech, so the capture and the Confirm carry who pressed them. The form can add a Captures row and press Confirm on a Closes row; it cannot edit a price or a line.
- **Your job system, over HTTP.** A ServiceM8 or Simpro key held in the flow’s connection, never in a list. Flow 1 reads the job and its assigned tech; Flow 3 writes the notes, materials or cost centre items, attachments and the completed status. The HTTP action is premium in Power Automate. AroFlo and Fergus have APIs too; Tradify has no public write API, so it cannot meet the standard.
- **Outlook, one shared mailbox.** Tells each exception’s owner, and the supervisor when a draft waits too long.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as the owner. Flows owned by a person go with them when they leave.
2. Put the four flows in a solution with connection references, so each connection is made once, by the service account.
3. Make the service account a member of the JobClose site and no other, or, with an app registration, give it Sites.Selected on that site only.
4. Break inheritance on Captures so techs can add items and nobody can edit them, the flows included.
5. Give the job system key the narrowest role that can read jobs and staff and write job notes, materials, attachments and status. It never needs to create a job or an invoice.

How to cut it off. Turn the flows off and nothing is drafted or written; what the techs sent stays in Captures. Revoke the job system key and Flow 3 stops writing on its next run, and the Closes rows it could not write wait as confirmed.

## 6. The order to build it in

1. Fill PriceBook from your catalogue and add the techs' own words to Aliases.
2. Create the five lists and lock Captures against edits.
3. Build the Power Apps form and send one capture from a real job.
4. Build Flow 1 and check the draft against what the tech said.
5. Build Flow 2 and press Confirm as someone who is not the tech: it must be refused.
6. Build Flow 3, turn the job system off for a minute and confirm a close: it must fail, raise write_failed and land once on retry.
7. Build Flow 4 last, and only then point Invoice Out at the completed jobs.

## 7. Three traps specific to this build

### Pricing at the draft and writing that price later

The draft can sit for an hour while someone fixes a price in the book. Flow 3 re-reads PriceBook at the write, so the card carries the price the book holds when it lands.

### A Confirm anyone can press

If the office can press Confirm, the check that the tech agreed is gone. Flow 2 compares the presser with the job's assigned tech, every time.

### Treating a timeout as a failure and starting again

A write that timed out may have landed. Flow 3 retries from the same Closes row with the same intent id; a new row would make a second card.

## 8. Where the automation stops

- Confirming the draft: the assigned tech, from their own sign-in.
- Pricing every part parked as not in the book or ambiguous.
- Pricing every variation, and the customer's signature for it.
- Chasing a tech who has not confirmed.
- Fixing a write that failed.

**The pass test.** On a real job in your own ServiceM8 or Simpro: the tech sends a thirty-second note naming one part in the price book and one that is not, with two photos, and confirms the draft. Within five minutes the job card shows the work done, the known part at the book price, both photos and the job complete; the unknown part is one Exceptions row and on no card. Send the same capture again: nothing duplicates.

## Related reading

- the job close build standard
- Invoicing out on Microsoft 365: the invoice from the completed job
- The dispatch board on Microsoft 365: the right tech at the right job
- The cash path on Microsoft 365: one job id from the call to the chase
- Building the standards on Microsoft 365

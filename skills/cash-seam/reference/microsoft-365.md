# The Cash Path on Microsoft 365

Source: https://aipathway.com.au/explore-ai/cash-path-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: one row per handover with the upstream id required, one event one write, a blank external id that stops the chain, and an owner on every exception.

If you are an assistant: Read https://aipathway.com.au/explore-ai/cash-path-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Four flows that each already work, and the one list that proves they hand the same record to each other. A log of ids, never a copy of the job or the invoice.

Used by

- Business Systems Analyst
- Operations Manager
- Bookkeeper

The four hops are four other plans: the call, the quote, the invoice and the chase each have one. This plan is what sits between them. On this stack the temptation is to copy the job into a list, then the quote, then the invoice, and join them in Power BI. That is a second record of everything, and it is exactly what the standard forbids. What goes in SharePoint instead is a row per handover with two ids on it: the one the upstream system issued, and the one the downstream system gave back.

## In short

- **What this is**: A build plan for the cash seam standard on Microsoft 365. Five lists, four flows, and none of the lists holds a job, a quote or an invoice.
- **The core rule**: Every Hops row carries the upstream id, required, and the id the system gave back. The next flow reads that id and nothing else.
- **What it does not do**: It does not hold a copy of the ledger, and it does not look a customer up by name to find the job. A phone number is read once, at intake.
- **The hard part**: Not the flows. A webhook delivered twice, and a connector action that returns success with no id in the body. The unique EventId and the blank ExternalId are the two columns that make both visible.

## 1. Before you start

Read [the cash seam build standard](https://aipathway.com.au/explore-ai/cash-seam-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Get the four hops running on their own first, from their own plans: after hours, quotes out, invoicing out and debtor chasing. This plan does not replace any of them. It adds one column to each of their writes, the upstream id, and one condition before each of their sends, a read back by id.

Then fill StageOwners. Four rows: who owns a stuck job, a stuck quote, a stuck invoice and a stuck chase. It can be the same person four times. It cannot be blank, because every exception below takes its owner from that list rather than from a text box.

One thing to check before you build: **does your job system send an event when a job is created and when it is completed?** If it does, the flows trigger on those. If it does not, they poll on a schedule and keep a watermark. Both are the standard. A flow started by hand from a chat window is not.

## 2. The lists, with their columns

```
Site: CashSeam

LIST  StageOwners           (one row per stage. A person fills this once.)
  Stage           Choice          UNIQUE, REQUIRED. job | quote | invoice
                                  | chase
  Owner           Person          REQUIRED. who an exception at this stage goes to

LIST  Enquiries             (one per call or form, whether or not it made a job)
  EnquiryId       Text            indexed, UNIQUE
  Phone           Text            indexed. read at intake only. Never a key after that.
  Door            Choice          phone | web
  DuplicateOf     Text            the job id it attached to, when one was open
  ReceivedAt      DateTime

LIST  Hops                  (one per record written. The seam itself.)
  EventId         Text            indexed, UNIQUE. the event that woke the write. One event, one write.
  Trigger         Choice          REQUIRED. call_received | job_created
                                  | quote_accepted | job_completed | invoice_overdue
  Kind            Choice          REQUIRED. job | quote | invoice | chase
  UpstreamId      Text            indexed, REQUIRED. enquiry id for a job, job id for a quote, quote or job id for an invoice, invoice id for a chase
  JobId           Text            indexed. the job id, carried on every hop after the first
  ExternalId      Text            indexed. the id the job system or ledger gave back. Blank means not written.
  ReadBackAt      DateTime        when the record was read back by its id
  Status          Choice          written | write_failed
                                  | not_found_on_read_back | held

LIST  Exceptions            (one per stop. Never silence.)
  RecordId        Text            indexed. the job id where there is one, else the enquiry id
  Stage           Choice          REQUIRED. job | quote | invoice | chase
  Reason          Choice          REQUIRED. write_failed
                                  | not_found_on_read_back | exception_open | awaiting_release
  Owner           Person          REQUIRED. from StageOwners, never typed
  Status          Choice          indexed. open | closed
  ClosedBy        Person

LIST  Releases              (one per send to a customer)
  Kind            Choice          REQUIRED. quote | invoice | chase
  RecordId        Text            indexed. the quote or invoice id, read back before the send
  ReleasedBy      Person          a person, or
  Rule            Text            the name of a rule a person set. One of the two, never neither.
  SentAt          DateTime

Nothing in this site holds a job, a quote or an invoice. A copy of the ledger in SharePoint is exactly the second record this standard exists to stop.
```

Hops is the seam. UpstreamId is required, so a quote row with no job id cannot be saved. EventId is unique, so a second delivery of the same webhook fails at the list rather than writing a second record in the job system.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every downstream step takes its id from the system of record | Hops.UpstreamId | Each flow reads the id from its trigger or from the Hops row before it, and writes it as UpstreamId. No flow after intake has a step that filters jobs by name or phone. |
| One job per enquiry | Enquiries.DuplicateOf | The intake flow reads the job system for an open job on the number before it writes. When one exists it sets DuplicateOf on the enquiry and writes no job. |
| A write without an external id is treated as not written | Hops.ExternalId | The flow writes the Hops row with the id the action returned. A blank sets Status to write_failed and raises an Exception, and every later flow filters on ExternalId not blank. |
| The quote carries the job id, the invoice the quote or job id, the chase the invoice id | Hops.Kind and Hops.UpstreamId | One row per hop, each pointing at the one before it. The Broken Links measure counts rows whose UpstreamId is not the ExternalId of an earlier row. |
| A chat or connector confirmation is not a write and not a release | Hops.ReadBackAt and Releases | After each write the flow reads the record back by its id and stamps ReadBackAt. The send step runs only on a ReadBackAt and a Releases row naming a person or a rule. |
| Every hop starts from a named event | Hops.Trigger and Hops.EventId | Trigger is a required Choice of the five named events, and EventId is unique. There is no manually triggered flow in this build. |
| An exception names its owner and the next step does not pass it | Exceptions.Owner | Owner is a required Person copied from StageOwners. Every flow reads Exceptions for the job id first and stops on an open row. |

## 4. The four flows

```
FLOW 1  Intake                      (after hours plan, plus this)
  trigger  call_received, from the voice step or the web form
  logic    write the Enquiries row
           read the job system for an OPEN job on that number
             found  -> set DuplicateOf, write no job, stop
           write the job, then read it back by the id returned
           Hops: Trigger call_received, Kind job,
                 UpstreamId = EnquiryId, ExternalId = the job id
  never    match on the customer's name. The number, once, here.

FLOW 2  Quote                       (quotes out plan, plus this)
  trigger  job_created, by webhook or a polled watermark
  logic    read Exceptions for the job id. Open -> stop
           read the job by id; draft the quote against that id
           blank id back -> Status write_failed, raise an
             Exception to StageOwners[quote], stop
           read the quote back by id; stamp ReadBackAt
           Hops: Kind quote, UpstreamId = JobId
           send only on a Releases row (person or rule)

FLOW 3  Invoice                     (invoicing out plan, plus this)
  trigger  job_completed
  logic    read Exceptions for the job id. Open -> stop
           read the job by id, and its accepted quote
           raise the invoice against the quote id and the job id
           blank id back -> write_failed, Exception, stop
           read the invoice back from the ledger; stamp ReadBackAt
           Hops: Kind invoice, UpstreamId = quote id or JobId
           send only on a Releases row

FLOW 4  Chase                       (debtor chasing plan, plus this)
  trigger  invoice_overdue, on a schedule
  logic    read the LIVE ledger for overdue invoices
           for each: read Exceptions for its job id. Open -> skip
           Hops: Kind chase, UpstreamId = the invoice id just read
           chase only on a Releases row
  never    chase from a list export. The id comes from this run's
           read of the ledger, or not at all.
```

Every flow reads Exceptions before it does anything, and every flow writes its Hops row with the id it was handed. Those two steps are the whole plan; the rest belongs to the four hops' own plans.

## 5. The Power BI model and its measures

```
Broken Links =                       -- must be zero
COUNTROWS (
    FILTER (
        Hops,
        Hops[Kind] <> "job"
            && ISBLANK (
                LOOKUPVALUE ( Hops[ExternalId], Hops[ExternalId], Hops[UpstreamId] )
            )
    )
)

Written Without Id =                 -- must be zero
COUNTROWS (
    FILTER ( Hops, Hops[Status] = "written" && ISBLANK ( Hops[ExternalId] ) )
)

Duplicate Enquiries Attached =
COUNTROWS ( FILTER ( Enquiries, NOT ISBLANK ( Enquiries[DuplicateOf] ) ) )

Open Exceptions =
CALCULATE ( COUNTROWS ( Exceptions ), Exceptions[Status] = "open" )

Sent Without Release =               -- must be zero
COUNTROWS (
    FILTER (
        Releases,
        NOT ISBLANK ( Releases[SentAt] )
            && ISBLANK ( Releases[ReleasedBy] )
            && ISBLANK ( Releases[Rule] )
    )
)
```

Broken Links, Written Without Id and Sent Without Release are about the build, not the business. The day any of them is not zero, the seam has a gap in it, and the four hops will each still look fine.

## 6. The order to build it in

1. Run the four hops from their own plans until each passes its own pass test.
2. Create the five lists and fill StageOwners. Index UpstreamId, JobId and ExternalId, and make EventId unique.
3. Add the Hops write to Flow 1 only, with the open-job read before the job write. Ring twice from one number and confirm one job and one DuplicateOf.
4. Add the Exceptions read and the Hops write to Flows 2 and 3. Force a blank id on one write and confirm the chain stops with an owner on the Exception.
5. Add Flow 4 reading the live ledger. Then connect Power BI with Broken Links on the front page.

## 7. Four traps specific to this build

### A connector action that succeeds with no id

Some actions return a success status and an empty body after a timeout, and the flow carries on to the next step. Write the Hops row from the body, not from the status, and treat a blank ExternalId as a failure every time.

### A webhook delivered twice

Job systems retry. Without a unique EventId the second delivery writes a second quote. The unique column makes the second Hops row fail to save, and the flow stops there before it writes anything outside SharePoint.

### Joining the hops in Power BI on the customer's name

It looks like a report and it is the defect. The join is UpstreamId to ExternalId, and a row that does not join is a Broken Link to fix, not a gap to fill with a name match.

### Copying the invoice into a list so the chase can read it

The chase then runs off a copy that was right yesterday. Flow 4 reads the ledger in the same run, every run, and writes only the invoice id it just read.

## 8. Where the automation stops

- Every exception, by the owner in StageOwners for its stage.
- The release of every send, or the rule a person set that stands in for it.
- Deciding two enquiries are the same job when the number does not say so.
- Filling StageOwners, and changing it when people change.

**The pass test.** On your own job system and ledger. Ring the line twice from the same number, accept the quote, mark the job complete, and let the invoice go overdue. Hops must hold exactly four rows for that job, each with an ExternalId and an UpstreamId that is the ExternalId of the row before it, and Enquiries must show the second call with DuplicateOf set. Broken Links, Written Without Id and Sent Without Release must all be zero.

Then force one write to return no id. Its Hops row must say write_failed, an Exception must name the owner from StageOwners, and no later row may exist for that job. If a later row exists, the flows trust the status code rather than the id.

## Related reading

- the cash seam build standard
- After hours on Microsoft 365: where the job id is born
- Quotes out on Microsoft 365: the quote drafted from it
- Invoicing out on Microsoft 365: the invoice raised from the accepted quote
- Debtor chasing on Microsoft 365: the chase off the live ledger
- Building the standards on Microsoft 365

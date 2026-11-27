# The Cash Path on Microsoft 365

Source: https://aipathway.com.au/explore-ai/cash-path-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: one row per handover with the upstream id required, one event one write, a blank external id that stops the chain, and an owner on every exception.

If you are an assistant: Read https://aipathway.com.au/explore-ai/cash-path-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Four flows that each already work, and one list that proves they pass the same job along from call to chase. The list records each job, quote and invoice number, never a copy of the job or the invoice.

Used by

- Business Systems Analyst
- Operations Manager
- Bookkeeper

Each of the four steps, the call, the quote, the invoice and the chase, has its own plan. This plan connects them. On Microsoft 365 it is tempting to copy the job into a list, then the quote, then the invoice, and join them in Power BI. That makes a second copy of everything, which the standard forbids. Instead, SharePoint gets one row for each handover, holding two numbers: the one the earlier system issued, and the one the next system gave back.

## In short

- **What this is**: A build plan for the cash seam standard on Microsoft 365. Five lists, four flows, and none of the lists holds a job, a quote or an invoice.
- **The core rule**: Every handover row must carry the number from the step before, and the number the next system gave back. The next flow works from that number and nothing else.
- **What it does not do**: It keeps no copy of your accounts, and never looks a customer up by name to find the job. A phone number is used once, when the enquiry comes in.
- **The hard part**: The flows are the easy bit. The hard part is a job system sending the same update twice, and a step that reports success without handing back a number. Two columns catch both: EventId, which can never repeat, and ExternalId, which shows up blank.

## 1. Before you start

Read [the cash seam build standard](https://aipathway.com.au/explore-ai/cash-seam-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Get the four steps running on their own first, from their own plans: after hours, quotes out, invoicing out and debtor chasing. This plan replaces none of them. It adds the earlier step’s number to everything they create, and before anything is sent, it reads the record back by its number to confirm it exists.

Then fill StageOwners. Four rows: who owns a stuck job, a stuck quote, a stuck invoice and a stuck chase. It can be the same person four times. It cannot be blank, because every exception below takes its owner from that list rather than from a text box.

One thing to check before you build: **does your job system send an event when a job is created and when it is completed?** If it does, the flows start on those. If it does not, they check on a schedule and pick up only what changed since last time. Both meet the standard. A flow started by hand from a chat window does not.

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

Hops is the handover log. UpstreamId is required, so a quote row with no job id cannot be saved. EventId is unique, so a second delivery of the same webhook fails at the list rather than writing a second record in the job system.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every later step takes its number from the system that issued it | Hops.UpstreamId | Each flow reads the id from its trigger or from the Hops row before it, and writes it as UpstreamId. No flow after intake has a step that filters jobs by name or phone. |
| One job per enquiry | Enquiries.DuplicateOf | The intake flow reads the job system for an open job on the number before it writes. When one exists it sets DuplicateOf on the enquiry and writes no job. |
| A record that comes back with no number counts as not created | Hops.ExternalId | The flow writes the Hops row with the id the action returned. A blank sets Status to write_failed and raises an Exception, and every later flow filters on ExternalId not blank. |
| The quote carries the job id, the invoice the quote or job id, the chase the invoice id | Hops.Kind and Hops.UpstreamId | One row per hop, each pointing at the one before it. The Broken Links measure counts rows whose UpstreamId is not the ExternalId of an earlier row. |
| A chat or connector confirmation proves neither that the record exists nor that anyone approved the send | Hops.ReadBackAt and Releases | After each write the flow reads the record back by its id and stamps ReadBackAt. The send step runs only on a ReadBackAt and a Releases row naming a person or a rule. |
| Every step starts from a named event | Hops.Trigger and Hops.EventId | Trigger is a required Choice of the five named events, and EventId is unique. There is no manually triggered flow in this build. |
| Every exception names its owner, and the next step waits until it is cleared | Exceptions.Owner | Owner is a required Person copied from StageOwners. Every flow reads Exceptions for the job id first and stops on an open row. |

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

Every flow reads Exceptions before it does anything, and every flow writes its Hops row with the id it was handed. Those two steps are the whole plan. Everything else belongs to the four steps' own plans.

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

Broken Links, Written Without Id and Sent Without Release check the build itself. The day any of them is above zero, a job has fallen out of the chain, even though each of the four steps still looks fine.

## 6. What the flows can reach in your job system, Xero and Microsoft 365, and what they never touch

The flows do the paperwork for every job, from the first enquiry to the chase. They open the job, draft the quote and the invoice, note when a customer promises to pay, and line up the chase, passing the same job number along so nobody types the job in twice. Nothing goes to a customer until you, or a rule you set, releases it, and anything that gets stuck goes to the person you named for that stage. Your own logins stay yours: each system is connected on its own sign-in page or with its own key, never your username and password.

What each connection is for.

- **SharePoint, the one site, read and write.** StageOwners, Enquiries, Hops, Exceptions and Releases. Numbers and owners only. No job, quote or invoice is copied in.
- **The job system, read and write.** To find the open job on the caller’s number at intake, write one job per enquiry, and read every record back by its id. ServiceM8 by an API key or an app connection; Simpro through your company’s own API at its simprosuite.com address, approved as a user whose security group covers customers, jobs and quotes. Either one is reached by a custom connector or the HTTP action (both premium). If the job system sends events, they arrive at the When an HTTP request is received trigger, also premium. If not, the flows check on a schedule for anything that changed. Tradify has no public API and no Zapier app, so no flow can create its jobs. The call goes to its enquiries inbox, a person makes the job, and the chain starts at Xero.
- **Xero through AI Pathway, “Read the book”.** Flows 3 and 4 read the invoice from live Xero in the same run (list_invoices, filtered to its number), so a paid invoice is never chased.
- **Xero through AI Pathway, “Write drafts and notes”.** The invoice draft from the accepted quote, and a promise to pay noted on the invoice. Drafts and notes only, never a payment.
- **AI Pathway, “Queue calls”.** Flow 4 hands an overdue invoice to the Get Paid call once its Releases row exists.
- **Teams, to tell the owner.** Each new Exceptions row is posted to the person StageOwners names for that stage. The post links to the row, and the row is the record of the exception.

All three AI Pathway boxes sit on one key, created under Keys at connect.aipathway.com.au/app/keys and called from the flows over its MCP endpoint by the HTTP action or a custom connector. This plan adds no mailbox access. Any quote or invoice email goes out from the send step in that step’s own plan.

Give it the least it needs.

1. Own the flows with a service account, not a person who might leave. A flow owned by someone who leaves stops when their account is switched off.
2. Build the four flows inside a solution and share connections through its connection references, so nobody’s personal connection ends up inside a flow.
3. Make the service account a member of this one site and no other. If you use an app registration instead, grant it Sites.Selected with only this site added, and if it ever needs a mailbox, limit it to one shared mailbox with an Exchange application access policy or RBAC for Applications.
4. Keep your AI Pathway key and the job system key in a custom connector’s connection or a secret environment variable, not typed into an HTTP action where anyone who can edit the flow can read them.

How to cut it off. Turn off the four flows, or delete their connections in Power Automate. Delete the key under Keys at connect.aipathway.com.au/app/keys, remove the connection or key in ServiceM8 or Simpro, and remove the service account from the site. The Hops log stays, so you can still see where every id went.

Why not a ready-made job-system-to-Xero recipe in an integration platform? Most move one record from one system to another, and do it well. Ask whether it carries the job number through all four steps, stops the next step when a record comes back with no number, and puts a named owner on the exception. If not, each step will look fine and jobs will still fall out between them, which is the gap this plan closes.

## 7. The order to build it in

1. Run the four steps from their own plans until each passes its own pass test.
2. Create the five lists and fill StageOwners. Index UpstreamId, JobId and ExternalId, and make EventId unique.
3. Add the Hops write to Flow 1 only, with the open-job read before the job write. Ring twice from one number and confirm one job and one DuplicateOf.
4. Add the Exceptions read and the Hops write to Flows 2 and 3. Force a blank id on one write and confirm the chain stops with an owner on the Exception.
5. Add Flow 4 reading the live ledger. Then connect Power BI with Broken Links on the front page.

## 8. Four traps specific to this build

### A connector action that succeeds with no id

Some actions return a success status and an empty body after a timeout, and the flow carries on to the next step. Write the Hops row from the body, not from the status, and treat a blank ExternalId as a failure every time.

### A webhook delivered twice

Job systems retry. Without a unique EventId the second delivery writes a second quote. The unique column makes the second Hops row fail to save, and the flow stops there before it writes anything outside SharePoint.

### Joining the steps in Power BI on the customer's name

It looks like a working report, and it is the very fault this plan prevents. Join UpstreamId to ExternalId. A row that does not join is a Broken Link to fix. Never fill the gap by matching names.

### Copying the invoice into a list so the chase can read it

The chase then runs off a copy that was right yesterday. Flow 4 reads Xero in the same run, every run, and writes only the invoice id it just read.

## 9. Where the automation stops

- Every exception, by the owner in StageOwners for its stage.
- The release of every send, or the rule a person set that stands in for it.
- Deciding two enquiries are the same job when the number does not say so.
- Filling StageOwners, and changing it when people change.

**The pass test.** On your own job system and ledger. Ring the line twice from the same number, accept the quote, mark the job complete, and let the invoice go overdue. Hops must hold exactly four rows for that job, each with an ExternalId and an UpstreamId that is the ExternalId of the row before it, and Enquiries must show the second call with DuplicateOf set. Broken Links, Written Without Id and Sent Without Release must all be zero.

Then force one write to return no id. Its Hops row must say write_failed, an Exception must name the owner from StageOwners, and no later row may exist for that job. If a later row exists, the flows are trusting the success message instead of checking for the number.

## Related reading

- the cash seam build standard
- After hours on Microsoft 365: where the job id is born
- Quotes out on Microsoft 365: the quote drafted from it
- Invoicing out on Microsoft 365: the invoice raised from the accepted quote
- Debtor chasing on Microsoft 365: the chase from your live accounts
- Building the standards on Microsoft 365

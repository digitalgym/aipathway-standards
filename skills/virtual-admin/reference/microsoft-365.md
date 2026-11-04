# The Admin Role on Microsoft 365

Source: https://aipathway.com.au/explore-ai/admin-role-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the virtual admin role: Hours and Holidays lists the call flow reads to pick the desk, an Owners list, a Holds list the invoice and chase flows read before they move so a complaint taken on a call stops the money, and a DailyLists list unique per day for the owner's one end-of-day list.

If you are an assistant: Read https://aipathway.com.au/explore-ai/admin-role-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The daytime desk and the cash path each have their own plan. This one is the five small lists that let them hear each other: your hours, your owners, and the complaint that has to reach the invoice.

Used by

- Office Manager
- Business Systems Analyst
- Operations Manager

Build the daytime desk and the cash path from their own plans first. Then the gaps show up in a week: a customer who rang the after-hours line and the day line has two jobs, and a complaint taken at ten is a note nobody reads before the invoice flow runs at three. This plan adds three reads and one list a day, and nothing else.

## In short

- **What this is**: A build plan for the virtual admin standard on Microsoft 365. Five lists and three small changes to flows that already exist in the desk and cash path plans.
- **The core rule**: A complaint taken on a call becomes a Holds row on the job id. The invoice and chase flows filter Holds on that job id first and stop on an open row.
- **What it does not do**: It does not hard-code business hours in a flow condition, and it does not hold a job, a call log or an invoice. Each half keeps its own.
- **The hard part**: Getting the after-hours line and the day line to run the same open-job read, and getting a spoken complaint into a row the invoice flow filters on.

## 1. Before you start

Read [the virtual admin build standard](https://aipathway.com.au/explore-ai/virtual-admin-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Get both halves running from their own plans: the daytime desk and the cash path. This plan does not replace either. It adds a read of Hours to the call flow, a read of Holds to the invoice and chase flows, and one flow at the close.

Then fill Hours, Holidays and Owners. Holidays is the one people forget: a public holiday you close on is after hours, and a flow that only knows weekdays will answer it as the day desk.

One thing to check before you build: **do both of your lines call the same caller lookup?**If the after-hours line writes jobs through one flow and the day line through another, the first fix is to point both at the daytime desk plan’s Flow 1.

## 2. The lists, with their columns

```
Site: VirtualAdmin

LIST  Hours                 (one row per open day, 0 = Sunday)
  Weekday         Number          indexed, UNIQUE, REQUIRED
  Opens           Text            REQUIRED. 07:00
  Closes          Text            REQUIRED. 17:00

LIST  Holidays              (one row per day closed. Closed is after hours.)
  ClosedOn        DateTime        indexed, UNIQUE, REQUIRED
  Reason          Text

LIST  Owners                (one row per area. A person fills this once.)
  Area            Choice          UNIQUE, REQUIRED. desk | complaint | invoice
                                  | chase
  Owner           Person          REQUIRED

LIST  Holds                 (one per complaint or dispute taken on a call, or a failed write)
  JobId           Text            indexed, REQUIRED
  CallId          Text            the call it was taken on, if any
  Reason          Choice          REQUIRED. complaint | dispute
                                  | invoice_write_failed
  Owner           Person          REQUIRED. from Owners, never typed
  Status          Choice          indexed. open | closed
  ClosedBy        Person

LIST  DailyLists            (one per day, published at the close)
  ListDate        DateTime        indexed, UNIQUE
  Lines           Note            job id, reason and owner for every open hold and callback
  PublishedAt     DateTime

Nothing in this site holds a job, a call log or an invoice. Each half keeps its own; this site only holds what one half has to tell the other.
```

Holds.JobId is indexed because the invoice and chase flows filter on it every run. DailyLists.ListDate is unique, so a second list for the same day fails to save.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The business's own hours decide which desk answers | Hours and Holidays | The call flow reads both at the time of the call. No flow has a condition with a time typed into it. |
| A customer who rings both desks has one job | The daytime desk plan's Flow 1 | Both lines call the same open-job lookup before anything is written, so the second call attaches to the first job. |
| A complaint taken on a call stops the invoice and the chase | Holds.JobId and Holds.Status | The call flow writes a Holds row when the caller complains or disputes. The invoice and chase flows filter Holds on the job id and stop on an open row. |
| The job-done message and the invoice come from the same event | The job_completed trigger | The desk's status message and the cash path's invoice flow both trigger on job completed and read the job by the id the event carried. Neither searches by name. |
| Every contact is on the job's timeline | Notes on the job, in the job system | Each flow, in both halves, writes its note to the job by id. Nothing keeps a separate contact log in SharePoint. |
| One list for the owner, with an owner on every line | DailyLists.ListDate and Holds.Owner | One flow at the close reads open Holds and open Callbacks and writes one row. Owner is a required Person on both lists, copied from Owners or the Roster. |

## 4. The three changes and one flow

```
CHANGE 1  The call flow                (both lines)
  add      read Hours and Holidays at the time of the call
           pick the desk from them
           call the daytime desk plan's caller lookup
  add      complaint or dispute -> write Holds
             (JobId, CallId, Reason, Owner = Owners[complaint])

CHANGE 2  The invoice flow             (cash path, Flow 3)
  add      before anything: filter Holds on the job id
             open row -> stop, note it on the job

CHANGE 3  The chase flow               (cash path, Flow 4)
  add      for each overdue invoice: filter Holds on its job id
             open row -> skip

FLOW 4    End of day                   (schedule, at Closes)
  logic    read open Holds and open Callbacks
           write one DailyLists row: job id, reason, owner
           send it to the owner
  never    a second list, or a line with no owner
```

Three reads added to flows that already exist, and one new flow. If the change to your build is bigger than that, one of the halves is not running to its own plan yet.

## 5. What the flows can reach in your Microsoft 365 and your job system, and what they never touch

This plan gives the flows a temp’s swipe card: it opens the diary and the filing room, and it does not open the safe. The flows read your hours, holidays and owners, write a hold on a job, note it on the job, and send one list at the close. They never raise or change an invoice, never record a payment, never close a job, and never ring anyone. The money moves in the cash path plan’s own flows, on their own connection, and this plan only adds a read that can stop them. It adds no new connection to the ledger at all.

What each connection is for.

- **SharePoint, the one site.** Hours, Holidays, Owners, Holds and DailyLists. The call flow reads the first three, writes Holds, and the end-of-day flow writes DailyLists.
- **The job system, through the desk plan’s connection.** The open-job lookup and the note on the job by its id. No second connection is made for this plan.
- **The call flow’s HTTP trigger.** What the phone line calls. Anyone holding that URL can start the flow, so keep it where you keep keys, not in an email.
- **Teams or one shared mailbox.** To send the end-of-day list to the owner. Nothing in this plan writes to a customer.

Least privilege, as steps.

1. Own Flow 4 and the three changed flows with the service account the two halves already use, not a person who might leave.
2. Put them in the same solution, on connection references, so the SharePoint, job system and Teams connections are each one place to change.
3. Keep the five lists on the site the halves already use, with the service account a member of that site and no other. Any app registration gets Sites.Selected on that one site.
4. If the list goes by email, send it from the one shared mailbox, with Send As for the service account and nothing wider.

How to cut it off. Turn off Flow 4 and remove the Holds read from the two money flows, and you are back to the two halves on their own plans. Remove a connection behind a connection reference and every flow using it stops at its next run. The full list of switches is in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

Why not let Copilot find the complaint? It will find it, when somebody asks. The invoice flow at three o’clock does not ask. A complaint has to be a row the money flows filter on before they move, and a note that a chat can summarise is still a note nothing reads in time.

## 6. The order to build it in

1. Run the daytime desk and the cash path from their own plans until each passes its own pass test.
2. Fill Hours, Holidays and Owners. Add Change 1 and ring at a time either side of closing and on a holiday.
3. Point both lines at the one caller lookup. Ring after hours, then in the morning, and confirm one job.
4. Add Changes 2 and 3. Complain on a call, complete the job, and confirm no invoice.
5. Add Flow 4 and read the first list with the owner.

## 7. Three traps specific to this build

### Business hours in a flow condition

It works until the first public holiday or the first late night. Hours and Holidays are lists the business can change without opening a flow.

### A complaint written as a note on the job

The note is on the right record and nothing reads it. The invoice flow filters Holds, so the complaint has to be a Holds row.

### A list from each half

The desk sends its callbacks and the ledger sends its holds, and the owner reads one of them. Flow 4 reads both and writes one row.

## 8. Where the automation stops

- Every complaint and dispute, by the owner in Owners.
- Every line on the end-of-day list, by its owner.
- Setting Hours, Holidays and Owners.
- Being the person the customer knows.

**The pass test.** On your own number, job system and ledger. Ring after hours about a new problem, then ring from the same phone in business hours and complain about the work. Mark the job complete and let the close run. The job system must hold one job with both calls noted on it. A Holds row must name the complaints owner. The ledger must hold no invoice for the job and nothing may have been chased. DailyLists must hold one row for the day, with the complaint and its owner on it.

## Related reading

- the virtual admin build standard
- The daytime desk on Microsoft 365: the desk half
- The cash path on Microsoft 365: the money half
- After hours on Microsoft 365: the after-hours desk
- Building the standards on Microsoft 365

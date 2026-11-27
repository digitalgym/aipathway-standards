# The Job Trail on Microsoft 365

Source: https://aipathway.com.au/explore-ai/job-trail-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Hand-Off standard on Microsoft 365: Handoffs, Claims, Processed and StageHolders as SharePoint lists, one hand-off step every flow ends with, and the claim and dedupe steps every flow starts with. Every hand-over appended and never edited, so the list shows where a job is and which flow touched it.

If you are an assistant: Read https://aipathway.com.au/explore-ai/job-trail-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Four lists and a few steps added to every flow, so each job passes from one flow to the next the same way, and one list shows where it is and which flow touched it.

Used by

- Business Systems Analyst
- AI Officer
- Operations Manager

Your flows already do one job each: one raises the invoice, one chases it, one files the remittance. This plan gives them one way to pass a job along. Each flow ends by adding a row that names the records it touched, and the next flow starts from that row. The rows stay, so the list reads as the job’s history.

## In short

- **What this is**: A build plan for the hand-off standard on Microsoft 365. Four lists, the steps every stage flow starts and ends with, a flow that logs your job system's own webhooks, and a button that shows where a job is.
- **The core rule**: Each flow passes the job on by adding one row that names the job, the invoice, and what set the flow off. The next flow looks the job up in your job system from that row.
- **What it does not do**: No row carries a customer's name, address or an amount. No flow can change or delete a row, because the account the flows run under can only add rows.
- **The hard part**: Your job system sending the same update twice, and two flows grabbing the same job in the same second. Two lists stop both: one remembers every update already handled, and the other lets only one flow hold a job at a time.

## 1. Before you start

Read [the hand-off build standard](https://aipathway.com.au/explore-ai/hand-off-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Write every id as a ref, the system and its id: `simpro:4471`, `xero:INV-0932`. Give every flow a node name, `node:invoice-desk`, and use it the same way in Claims, Processed and the Source column.

Fill StageHolders: one row per stage, naming the one flow that does it. Then check **who can edit a Handoffs row**: nobody. That one setting is what makes the list a history rather than a status board.

## 2. The lists, with their columns

```
Site: JobTrail

LIST  Handoffs              (one row per hand-over, from a flow or a system's webhook. Never edited, never deleted.)
  EventId         Text            indexed, UNIQUE, REQUIRED. the envelope's id
  Type            Text            indexed, REQUIRED. from the mesh vocabulary (invoice.raised), or x-<publisher>.<event>
  Source          Text            REQUIRED. node:<slug>, system:<system> or person:<id>
  Subject         Text            indexed, REQUIRED. <system>:<id>, e.g. xero:INV-0932
  Refs            Note            REQUIRED. every ref this hop carries, keyed job_id, invoice_id...
  CausedBy        Text            indexed. the EventId that woke the sender. Empty only for a system's own webhook
  HandoffVersion  Text            REQUIRED. 1.0
  Time            DateTime        REQUIRED
  Envelope        Note            REQUIRED. the whole envelope as sent, for any other tool that reads it

LIST  Claims                (one row per record a flow has claimed. The seam mirror, where the job system cannot hold the claim.)
  Ref             Text            indexed, UNIQUE, REQUIRED. <system>:<id> of the record
  Holder          Text            node:<slug>. Empty when nobody holds it
  HolderUntil     DateTime        30 minutes ahead at most. Past it, the record is free

LIST  Processed             (one row per event a flow has handled. A second row for the same key will not save.)
  Key             Text            indexed, UNIQUE, REQUIRED. <ref>|<event id>|<node slug>
  At              DateTime        REQUIRED

LIST  StageHolders          (one row per stage, naming the one flow that does it. A person fills this.)
  Stage           Text            UNIQUE, REQUIRED. the standard the stage follows, e.g. invoice-out
  Node            Text            REQUIRED. node:<slug> of the flow named for it
  SetBy           Person          REQUIRED

Nothing in this site holds a customer's details. It holds which record went where, when, and which flow had it.
```

Handoffs.Subject and CausedBy are indexed because the button filters on one and walks the other. Processed.Key and Claims.Ref are unique, so a second row for the same event or the same record fails to save instead of racing.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every hand-off is one envelope in the contract's shape | The END steps and Handoffs | Every stage flow ends with one Compose of the envelope and one Create item on Handoffs from it. Type comes from a fixed choice in the flow, never typed free. |
| References, not copies | Handoffs.Refs and the START steps | Refs holds refs only. The next flow's first step after the checks is Get item from the job system by the ref on the row it was woken by. |
| A repeated event does nothing | Processed.Key, unique | The START steps look up the key and stop if it is there. The END steps add it; a retry that slips past the lookup fails to save its row. |
| One holder at a time | Claims, with the ETag | The flow updates the Claims row with its name and now + 30 minutes using If-Match on the row's ETag, reads it back, and stops unless Holder is itself. A held row with HolderUntil still ahead is skipped. |
| A bot not named for its stage does nothing | StageHolders | The first START step reads the stage's row and stops if Node is not this flow. |
| The log is appended, never edited, and walked by CausedBy | Handoffs permissions and Flow 2 | The service account cannot edit or delete. Flow 2 filters on Subject, then follows CausedBy forward until nothing new turns up. |
| An extension event a flow does not know is ignored | Trigger conditions | Each stage flow's trigger fires only on the Types it consumes, so an x- row never wakes it and nothing is raised. |

## 4. The flows

```
FLOW 1  Log the webhook               (when the job system calls)
  logic    one Handoffs row: EventId from the webhook,
           Type job.completed, Source system:simpro,
           Subject simpro:<job id>, Refs { job_id }
  never    a name, an address or an amount

START  The steps every stage flow begins with
  trigger  When an item is created in Handoffs,
           condition Type = the one this flow consumes
  1        StageHolders row for my stage: Node is not me -> stop
  2        Key = <Subject>|<EventId>|<my slug>
           Processed has Key -> stop
  3        Get the record from the job system by Subject
  4        Claims row for Subject: Holder is someone else
             and HolderUntil after now -> stop
           update Holder = me, HolderUntil = now + 30 min
             (If-Match: the row's ETag), read it back
           Holder is not me -> stop

END  The steps every stage flow finishes with
  1        Create item on Handoffs: a new EventId, Type,
           Source node:<my slug>, Subject, Refs,
           CausedBy = the EventId that woke me
  2        clear Holder and HolderUntil on my Claims row
  3        Create item on Processed: Key, At
  never    Update item or Delete item on Handoffs

FLOW 2  Where is it                    (button, with a ref)
  logic    rows with Subject = the ref; then rows whose
           CausedBy is one of those, repeated until no
           new rows; post the last row's Type and every
           Source, in time order, to Teams
```

The START and END steps are the same in every stage flow. Copy them from one flow to the next and change only the stage, the node name and the Type it consumes and emits.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows pass each job from one step to the next and keep a record of every hand-over. Each flow takes the job, does its one step, and adds a row naming the job and what it made, so the next flow picks it up from there. You choose which flow does each stage, and when a job stalls the list shows you where it stopped and whose it is.

What each connection is for.

- **SharePoint, the JobTrail site.** Handoffs, Claims, Processed and StageHolders. Every stage flow adds Handoffs and Processed rows, and writes and clears its own Claims rows. Nothing outside the site.
- **Your job system and ledger.** Whatever each stage flow already reads and writes for its own step, by the ref on the Handoffs row. The hand-off adds no connection of its own.
- **Teams, one channel.** The answer from the “where is it” button, posted for the person who pressed it.

Keep it to the least it needs.

1. Make a service account for the flows and create them as it.
2. Make a SharePoint permission level with View Items and Add Items only, and give it to the service account on Handoffs and Processed. Give it Edit on Claims.
3. Give the service account read on StageHolders. Only the people who decide which flow does each stage can edit it.
4. Give everyone who chases jobs read on Handoffs.

How to cut it off. Clear a stage’s row in StageHolders and every flow for that stage stops on its next run. Turn a flow off and its jobs wait on the last Handoffs row, where anyone can see them.

## 6. The order to build it in

1. Agree the node names and the ref format with whoever builds the stage flows, and fill StageHolders.
2. Create the four lists, the Add-only permission level, and give it to the service account on Handoffs and Processed.
3. Build Flow 1 and complete one real job: one Handoffs row, with no name or amount on it.
4. Add the START and END steps to the first stage flow. Replay the webhook by hand: no second invoice.
5. Build Flow 2 and press it for that job: it names the system, the flow and where the job is now.

## 7. Three traps specific to this build

### A status column on Handoffs, updated as the job moves

It turns the history into a board that only shows now. A job's status is the last row in its trail, so add a row instead.

### Putting the amount on the row so the next flow can skip a lookup

The amount changes when someone edits the job, and the row does not. The next flow reads the job by its ref every time.

### A claim with no expiry

A flow that fails halfway leaves the job held for good. HolderUntil is never more than 30 minutes ahead, and a row past it is free.

## 8. Where the automation stops

- Choosing which flow does each stage.
- Reading the trail when a job stalls, and deciding what happens next.
- Anything stopped by a problem or put on hold, until a person sorts it out or releases it.

**The pass test.** On your own job system, ledger and two of your own stage flows. Complete a real job: one Handoffs row from the webhook, then one from each flow, each with CausedBy filled and no name or amount. Replay the webhook by hand: no second invoice and no second row. Copy the first stage flow under another node name that StageHolders does not name, and run it: it must stop at its first step. Press Flow 2 for the job: it must name the job system, both flows and where the job is now. Try to edit a Handoffs row as the service account: it must be refused.

## Related reading

- the hand-off build standard
- The cash path on Microsoft 365: the flows this plan connects
- One Customer on Microsoft 365: the record numbers every row names
- Parked items on Microsoft 365: where a stopped job goes
- Building the standards on Microsoft 365

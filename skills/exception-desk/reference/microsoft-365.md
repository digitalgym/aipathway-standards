# Parked Items on Microsoft 365

Source: https://aipathway.com.au/explore-ai/parked-items-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the exception desk: one Exceptions list every flow appends to, unique on record, type and open status; a Routing list the business writes with the owner, clock and escalation per type; closes only through a Closes list a person writes; an hourly flow that escalates each overdue item once; and a daily Teams summary that says none when nothing is open.

If you are an assistant: Read https://aipathway.com.au/explore-ai/parked-items-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Four lists and four flows that give every other flow in your business one place to park what it cannot decide, with an owner, a clock and a person to close it.

Used by

- Office Manager
- Business Systems Analyst
- Operations Manager

Every flow you build will hit something it should not decide: a price that is not in the book, a job nobody is licensed for, a write ServiceM8 refused. Without this, each one emails someone, posts in a different Teams chat or quietly stops. This plan gives them one list to append to, and gives you one list to work from.

## In short

- **What this is**: A build plan for the exception desk standard on Microsoft 365. Four lists, a raise flow every other flow calls, a close flow, an hourly escalation flow and a morning summary in Teams.
- **The core rule**: Flows only ever add or update open rows. A row is closed when a person adds a Closes row with an outcome, and the owner and clock always come from Routing.
- **What it does not do**: No flow closes a row, picks an owner, or does anything about a dispute or hardship claim except hand it to the person Routing names and set the stop every chase flow reads.
- **The hard part**: Keeping exactly one open row per record and type when two flows raise at once, and permissions on Closes so no flow can close its own item.

## 1. Before you start

Read [the exception desk build standard](https://aipathway.com.au/explore-ai/exception-desk-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Fill Routing first: one row per type, with the person who owns it, how many hours they have, and who it goes to if it is late. A type with no row falls to the row for other, so write that one too.

Then decide when the summary is due. Seven in the morning is common; pick the time the office actually starts.

One thing to check before you build: **who can add a row to Closes?**Break permission inheritance on that list so only the office can add items, and the flows’ connection can read it but not write to it. That one setting is what makes a close something no flow can do by itself.

## 2. The lists, with their columns

```
Site: ExceptionDesk

LIST  Exceptions            (one row per open record and type. Flows append; only a close ends one.)
  ItemKey         Text            indexed, UNIQUE, REQUIRED. system/record/type/open, rewritten on close
  System          Text            REQUIRED. servicem8, simpro, aroflo, fergus, xero
  RecordId        Text            indexed, REQUIRED. the id that system issued, never a name
  ExceptionType   Choice          REQUIRED. price_not_in_book | variation
                                  | unassignable | parts_shortfall | write_failed | address_unresolved | promise_broken | dispute | hardship | stock_unknown | needs_list_unknown | unclassified_fault | tech_unconfirmed | other
  RaisedBy        Text            REQUIRED. the standard that raised it
  Surface         Choice          REQUIRED. office_voice | bot | workspace
                                  | m365 | code
  Reason          Note            REQUIRED
  Evidence        Hyperlink       transcript, photo, remittance
  Owner           Person          REQUIRED. copied from Routing, never from the raiser
  DueAt           DateTime        indexed, REQUIRED. raised time plus the Routing clock
  RaisedAt        DateTime        REQUIRED
  LastRaisedAt    DateTime
  RaiseCount      Number          REQUIRED
  Status          Choice          indexed, REQUIRED. open | closed
  ResolvedUpstream Boolean         the cause went away. Still open.
  StopChase       Boolean         dispute and hardship. Every chase flow reads it.
  EscalatedAt     DateTime        set once, never again
  EscalatedTo     Person
  ClosedBy        Person          copied from the Closes row
  ClosedAt        DateTime
  Outcome         Note

LIST  Routing               (one row per type. The business writes it.)
  ExceptionType   Choice          UNIQUE, REQUIRED. price_not_in_book
                                  | variation | unassignable | parts_shortfall | write_failed | address_unresolved | promise_broken | dispute | hardship | stock_unknown | needs_list_unknown | unclassified_fault | tech_unconfirmed | other
  Owner           Person          REQUIRED
  ClockHours      Number          REQUIRED
  EscalateTo      Person          blank: listed overdue on the summary only

LIST  Closes                (a person adds a row. The flows read it and never write to it.)
  ItemId          Text            indexed, UNIQUE, REQUIRED
  Outcome         Note            REQUIRED. what was done. A close without one is refused.

LIST  Summaries             (one per day, written by the summary flow)
  Day             Text            indexed, UNIQUE, REQUIRED. 2026-11-02, the business's own date
  PublishedAt     DateTime        REQUIRED
  OpenCount       Number          REQUIRED
  OverdueCount    Number          REQUIRED
  Lines           Note            REQUIRED. counts by type and owner, the overdue list, the labels raised as other, or none

Nothing in this site holds a job, a quote or an invoice. It holds what is waiting on a person, who owns it, and who closed it.
```

Exceptions.ItemKey is unique, so a second open row for the same record and type cannot exist even when two flows raise at once. Routing.ExceptionType is unique, so each type has one owner and clock. Closes is written by people and only read by flows. Summaries.Day is unique, so a morning gets one summary.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every item names its record by id | Exceptions.System and RecordId, and Flow 1 | Flow 1 reads the record from the job system or Xero before it writes. No id, or an id the system does not hold, and Flow 1 returns the reason to the flow that called it and writes nothing. |
| The type comes from the closed list | Exceptions.ExceptionType (Choice, no fill-in) | A label not on the list is written as other, with the label kept at the start of Reason. The summary lists those labels. |
| Owner and clock from Routing | Routing and Flow 1 | Flow 1 looks up the type in Routing and copies Owner, and DueAt as now plus ClockHours. It ignores any owner or due time the calling flow passes. |
| One item per record and type | Exceptions.ItemKey (unique) | Flow 1 gets the row with ItemKey system/record/type/open. Found: update Reason, LastRaisedAt and RaiseCount, leave DueAt. Not found: create it. A create that collides on the key is retried as an update. |
| Nothing closes itself | Closes permissions and Flow 2 | Flow 2 triggers on a new Closes row with an outcome, copies the row's author, time and outcome onto the item, sets Status closed and rewrites ItemKey to system/record/type/closed/id. A resolved upstream call from another flow only ticks ResolvedUpstream. |
| Disputes and hardship stay with a person | Exceptions.StopChase and Routing | Flow 1 sets StopChase on a dispute or hardship row and tells only the Routing owner. Every chase flow reads StopChase on the record before it acts, and stops. |
| Overdue escalates once | Exceptions.EscalatedAt and Flow 3 | Flow 3 runs hourly and takes open rows past DueAt with EscalatedAt empty. It posts to EscalateTo and sets EscalatedAt in the same step, so the next run skips them. |
| The summary goes out, even when empty | Flow 4 and Summaries | Flow 4 runs at the set time, counts open rows by type and owner, lists the overdue ones and the labels raised as other, posts to Teams, and writes the Summaries row. Nothing open posts "none". |

## 4. The flows

```
FLOW 1  Raise                        (called by every other flow)
  input    raised_by, surface, type, system, record_id,
           reason, evidence?
  logic    no record_id -> return "no record id", stop
           read the record from its system
             not held -> return "not held", stop
           type not on the list -> type = other,
             reason = 'Raised as "<label>": ' + reason
           Routing row for type (else the row for other)
           ItemKey = system/record_id/type/open
           row exists -> Reason, LastRaisedAt, RaiseCount + 1
                         (DueAt unchanged)
           else       -> create: Owner and DueAt from Routing,
                         StopChase for dispute or hardship
           dispute or hardship -> tell the Routing owner only
  never    an owner or due time from the caller; Status closed

FLOW 2  Close                        (when a Closes row is added)
  logic    no outcome -> refuse, stop
           item open -> Status closed, ClosedBy = row author,
             ClosedAt = row created, Outcome,
             ItemKey = system/record_id/type/closed/<id>
  never    a write to Closes

FLOW 3  Escalate                     (hourly)
  logic    open rows, DueAt passed, EscalatedAt empty:
             EscalateTo set -> post to them, EscalatedAt = now
  never    a second post for the same row

FLOW 4  Summary                      (daily at the set time)
  logic    open rows counted by ExceptionType and by Owner
           overdue rows listed; labels raised as other listed
           nothing open -> "Exceptions: none open."
           post to Teams; write one Summaries row for the day

CHANGE  Every other flow
  add      where it would email someone or stop: call Flow 1
  add      before a chase acts on a record: StopChase open on
           it -> stop
```

Flow 2 is the only flow that sets Status closed, and it only ever does so from a row a person added.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows are the office’s in-tray: anything can drop a note in it, and only a person takes one out. They read and write the four lists on one SharePoint site, read each record’s id from your job system or Xero before a row is written, and post one summary a day to one Teams channel. No flow closes a row, deletes one, changes an owner Routing did not give it, or messages a customer.

What each connection is for.

- **SharePoint, the ExceptionDesk site.** Exceptions, Routing, Closes and Summaries. The flows read Routing and Closes and never write to either. Your other flows (the quote, invoice and chase flows) call Flow 1 to raise, and read StopChase before they act on a record.
- **Your job system and ledger, read only.** Flow 1 reads the record before it writes a row, through the connector or HTTP action you already use for ServiceM8, Simpro, AroFlo, Fergus or Xero. It needs read access to jobs, quotes and invoices and nothing else.
- **Teams, one channel.** Flow 4 posts the morning summary, and Flow 3 posts each escalation to the person Routing names.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as the owner. Flows owned by a person go with them when they leave.
2. Put the four flows in a solution and use connection references, so each connection is made once, by the service account.
3. Make the service account a member of the ExceptionDesk site and no other, or, with an app registration, give it Sites.Selected on that site only.
4. Break inheritance on Closes and Routing so only the office can add or change items, and give the service account read on both.
5. Give the job system and ledger connections read scopes only.

How to cut it off. Turn the flows off and nothing new is parked, escalated or summarised; every open row stays where it is for a person to close. Take the service account out of the site and every flow loses the queue at once.

## 6. The order to build it in

1. Create the four lists, fill Routing, and lock Closes and Routing to the office.
2. Build Flow 1 and call it by hand with a record id that does not exist: it must write nothing and say why.
3. Call it twice with the same record and type: one row, RaiseCount 2, DueAt unchanged.
4. Build Flow 2 and close a row from Closes. Then try to close one from a flow: it must not be able to.
5. Build Flow 3, set a row's DueAt an hour back, and run it twice: one post.
6. Build Flow 4 and run it on an empty list before you schedule it: it must say none.
7. Change each existing flow to call Flow 1 where it used to email someone or stop.

## 7. Three traps specific to this build

### A unique key that blocks the next item after a close

If ItemKey stays system/record/type after a close, the next raise of the same thing on the same job collides with a closed row. Rewriting it on close is what lets a new open row exist.

### Letting the calling flow pass an owner

It is tempting to let a flow say who should look at its item. That is how the owner ends up being whoever built the flow. Routing is the only source.

### Turning off the summary on quiet days

A morning with no summary looks the same as a broken flow. The "none" message is how the office knows the queue was checked.

## 8. Where the automation stops

- Closing every row, with the outcome.
- Writing Routing: who owns each type, the clock, who it escalates to.
- Every dispute and hardship claim.
- Deciding when a label that keeps arriving as other becomes a type.

**The pass test.** On your own tenant, job system and ledger. Raise three items from three different places: a sheet or form parks an invoice on an unpriced line, a call handoff names an address it could not resolve, and a bot raises a parts shortfall. All three must sit in Exceptions, each with its record id, its owner from Routing and a due time. Raise the shortfall again: still one row, RaiseCount 2. Let one go past its due time and wait two runs of Flow 3: one escalation. The next morning’s summary lists all three.

## Related reading

- the exception desk build standard
- The cash path on Microsoft 365: the record ids every row here names
- The dispatch board on Microsoft 365: where unassignable jobs come from
- Quotes out on Microsoft 365: where unpriced lines come from
- Building the standards on Microsoft 365

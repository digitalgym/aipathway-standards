# The Knowledge Base on Microsoft 365

Source: https://aipathway.com.au/explore-ai/knowledge-base-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: one register list with a person in every row, a watch that runs whether or not anything changed, and the sources it cannot reach.

If you are an assistant: Read https://aipathway.com.au/explore-ai/knowledge-base-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

One list with a person in every row, pointing at the drive you already have. The drive does not move, and the part that takes weeks is not the search.

Used by

- AI Officer
- Business Systems Analyst
- Operations Manager

Almost everything in this build is a SharePoint list and a scheduled flow, and almost none of the work is building them. The work is getting a named person into the Owner column of every row, and then discovering which of those sources live somewhere a flow cannot reach. That second discovery changes the shape of the watch, so it is the thing to find out first rather than in month two.

## In short

- **What this is**: A build plan for the knowledge base standard on Microsoft 365. Five lists, four flows, a Power BI page, and the libraries you already have left where they are.
- **The core rule**: Nothing is searchable through this build until it is a register row with an owner, a checksum and one canonical copy. The register is the product and the search is a convenience on it.
- **What it does not do**: Search returns passages with a register id and a locator. It never returns a paragraph something wrote from them, because nothing here was built to write one.
- **The hard part**: A flow can read a file in SharePoint. It cannot go and read what a regulator published this morning, so half your watch is people with due dates.

## 1. Before you start

Read [the knowledge base build standard](https://aipathway.com.au/explore-ai/knowledge-base-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide one thing first: which of your sources live inside the tenant and which do not. A scheduled flow can open a file in a SharePoint library or a OneDrive folder, compare it to what it saw last week, and tell the owner it moved. It cannot fetch a code of practice from an issuing body’s website. Split the register on that line before you build anything, because the two halves get different flows and only one of them is software.

Then decide who chases owners. The standard is honest that the inventory is weeks of work for a network, and the reason is a conversation per source rather than anything technical. If nobody is named for that, the build produces a list of rows with blank Owner columns, which is a tidier version of the problem you started with.

## 2. The lists, with their columns

```
Site: KnowledgeBase

LIST  Register              (one row per source. This is the product.)
  SourceId        Text            indexed. The key. Never reused.
  Title           Text            indexed
  Kind            Choice          instrument | internal_rule | template
                                  | price_list | contract | customer_material
                                  six kinds, a closed list, and fill-in stays off
  Owner           Person          People only, not People and Groups
  System          Choice          sharepoint | onedrive | outside_the_tenant
  Location        Hyperlink       where the file already sits
  Edition         Text            blank where the issuer publishes none
  Checksum        Text            the file ETag. Read the traps.
  RetrievedAt     DateTime        written by the flow, never typed
  Status          Choice          current | superseded | duplicate | missing
  DuplicateOf     Text            a SourceId. Blank on the canonical copy.
  Indexed         Boolean         the canonical copy only
  AccessList      Text            required when Kind = customer_material
  ExpiresOn       DateTime        required when Kind = customer_material
  SupersededChecksums Note            append only. Nothing is overwritten.
  PromoteToGraph  Boolean         a person ticks this, and only a person

LIST  Passages              (what the search reads)
  SourceId        Text            indexed, REQUIRED. No row without one.
  Locator         Text            REQUIRED. p14, cl 3.2 or 00:12:40, never a chunk number
  Text            Note
  Scope           Choice          shared | restricted
  OpenAt          Hyperlink       opens the file the locator names

LIST  Gaps                  (a missing source is a task, not a blank row)
  Expected        Text            indexed. the source that should exist
  Owner           Person          REQUIRED
  RaisedOn        DateTime
  DueOn           DateTime        REQUIRED
  ClosedBySourceId Text
  ClosedOn        DateTime

LIST  WatchRuns             (written every run, changes or not)
  RanAt           DateTime        indexed
  RowsRead        Number          every live register row, or the run failed
  Changed         Number
  Notified        Number
  Detail          Note

LIST  GraphHandovers
  SourceId        Text            indexed
  Edition         Text
  Checksum        Text
  LocatorScheme   Choice          page_section | offsets | seconds
  PromotedBy      Person          no flow may occupy this
  PromotedOn      DateTime

The register lives here. The drive does not move, and nothing on this site holds a copy of a file.
```

The register is a list rather than a database because the people who own the sources already open lists, and an owner who has to learn a new tool to answer for a price list will not answer. SupersededChecksums is a multi-line append rather than a second list for the same reason: it is readable by the person standing in the row.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every source is on the register before anything is indexed | Indexed column | The search scope is built from the rows where Indexed is Yes, so an unregistered file is not in it. It is still openable by whoever could always open it, which is a permission question and not this build's. |
| Every source has a named owner, and a team is not an owner | Person column | Set the Owner column to People only rather than People and Groups. "Operations" then cannot be saved, which is the standard's line that a team cannot be asked anything, expressed as a column setting. |
| Duplicates resolve to one canonical copy, and only the canonical is indexed | Status and DuplicateOf | The second copy keeps its row with Indexed set to No. Deleting it would lose the fact that the drive holds two, which is the thing somebody needs to know next time. |
| Retrieved date, checksum and edition are recorded when the source arrives | Intake flow | RetrievedAt and Checksum are written by the flow on create. Edition stays typed, because only a person reads a cover and decides what the issuer called it. |
| Customer material is registered as such, restricted, and kept out of the shared index | Permissions + Indexed | A separate library with its own access list, set not to appear in search results, and Indexed left at No. See the first trap: this is a permission boundary, not a column. |
| Every indexed passage names its source and a locator that can be opened | Passages list | SourceId and Locator are required columns and OpenAt is a hyperlink somebody clicks. A chunk number has nowhere to be written down. |
| Search returns passages with their source and locator, and composes nothing | No compose step | The search reads the Passages list and returns rows. The only honest enforcement is that nothing was built which writes a paragraph, and that a general assistant over the same library is a different thing sitting beside this one. |
| A changed checksum reaches its owner in the same run | Watch flow | The register write and the message to the Owner are steps in one run. A dashboard that shows the change is not the owner having been told. |

## 4. The four flows

```
FLOW 1  Register on arrival
  trigger  a file is created in a library the register covers
  logic    create a Register row: Location, System, RetrievedAt,
             Checksum from the file ETag, Status = current
           leave Kind and Owner blank
           raise a task to the site owner: name a Kind and an Owner
  never    set Indexed = Yes. Nothing is searchable through this
           build while Owner is blank.

FLOW 2  The watch, on a schedule
  trigger  scheduled, weekly. It runs whether or not anything changed.
  logic    for EVERY Register row, not only the ones that looked busy:
             System = sharepoint or onedrive
               get file metadata, compare ETag to Checksum
               changed -> append the old value to SupersededChecksums,
                          write the new Checksum and RetrievedAt,
                          email the Owner naming the source
             System = outside_the_tenant
               raise a recheck task to the Owner with a due date
               the Owner's confirmation writes RetrievedAt
           write one WatchRuns row: RanAt, RowsRead, Changed, Notified
  never    skip a row because nothing happened to it last week.
           RowsRead below the live register count is a failed run,
           not a quiet week.

FLOW 3  Gaps and expiries
  trigger  scheduled, weekly
  logic    Status = missing with no open Gap ->
             create a Gap with an Owner and a DueOn
           Kind = customer_material past ExpiresOn ->
             raise a review task to the Owner
  never    delete anything on expiry, and never close a Gap because a
           file appeared. A Gap closes when a Register row with an
           Owner names it.

FLOW 4  Promote to the graph
  trigger  a person sets PromoteToGraph = Yes
  logic    refuse unless Status = current and Owner and Checksum
             are both filled, and record the refusal
           start an approval to the Owner
           on approve, write a GraphHandovers row carrying SourceId,
             Edition, Checksum, LocatorScheme and the approver
  never    occupy PromotedBy. The approver's name goes in it.
```

Flow 2 is written to read every row on every run because a change-triggered flow only notices what SharePoint tells it about, and the sources most likely to move quietly are the ones outside the tenant that SharePoint will never mention. RowsRead is on the run record so the failure is visible rather than inferred.

## 5. The Power BI model and its measures

```
Sources Registered =
COUNTROWS ( Register )

Ownerless Sources =                  -- the project, as one number
CALCULATE ( COUNTROWS ( Register ), ISBLANK ( Register[Owner] ) )

Unwatchable Sources =                -- current, and no checksum to compare
CALCULATE (
    COUNTROWS ( Register ),
    Register[Status] = "current",
    ISBLANK ( Register[Checksum] )
)

Watch Coverage =                     -- below 1 means it is a trigger
VAR LastRun = MAX ( WatchRuns[RanAt] )
RETURN
DIVIDE (
    CALCULATE ( SUM ( WatchRuns[RowsRead] ), WatchRuns[RanAt] = LastRun ),
    CALCULATE ( COUNTROWS ( Register ), Register[Status] <> "missing" )
)

Customer Material Without Expiry =   -- must be zero
CALCULATE (
    COUNTROWS ( Register ),
    Register[Kind] = "customer_material",
    ISBLANK ( Register[ExpiresOn] )
)

Indexed Duplicates =                 -- must be zero
CALCULATE (
    COUNTROWS ( Register ),
    Register[Status] = "duplicate",
    Register[Indexed] = TRUE ()
)

Open Gaps =
CALCULATE ( COUNTROWS ( Gaps ), ISBLANK ( Gaps[ClosedOn] ) )

Oldest Gap Days =
MAXX (
    FILTER ( Gaps, ISBLANK ( Gaps[ClosedOn] ) ),
    DATEDIFF ( Gaps[RaisedOn], TODAY (), DAY )
)
```

Ownerless Sources is the one to put on the front page, because it is the only number that describes the part of this project that is actually long. Watch Coverage is the one to read second: a register that is complete and a watch that reads a third of it is a photograph of the drive on the day it was taken.

## 6. The order to build it in

1. Decide which libraries the register covers and who chases owners. Not the search, and not the chunker.
2. Create the Register list. Index SourceId and Title, set Owner to People only, and turn fill-in off on Kind.
3. Register twenty real sources by hand, with a real person in every Owner. Then wait a week and count how many of those people answered. That number is the plan.
4. Build Flow 1, so a new arrival lands as a row with a task rather than as a file nobody is tracking.
5. Build Flow 2 for the rows where System is sharepoint or onedrive. Confirm a WatchRuns row appears in a week when nothing changed at all.
6. Add the outside_the_tenant half of Flow 2 and agree the recheck cadence with those owners. Say out loud that this half is people rather than software.
7. Create Passages and index only the rows where Indexed is Yes. Open three locators at random and confirm each one lands on the passage it names.
8. Connect Power BI, then build Flows 3 and 4. Ownerless Sources goes on the front page and is meant to fall.

## 7. Four traps specific to this build

### Treating the quarantine as an index setting

The standard says customer material is never in the shared index, and the instinct is to solve that with a column. It is a permission boundary. Put customer material in its own library with its own access list, set that library not to appear in search results, and leave Indexed at No. All three, because the register cannot change who can open a file they already had rights to. If the client interview and the policy manual are in one library that everybody can read, nothing you write on a list row changes who finds it.

### Calling the ETag a checksum without saying what it is

For a file in the tenant the ETag is what you have, and it is a version token rather than a hash of the content. It moves when somebody opens the file and saves it having changed nothing, so the watch will over-report. That is the survivable direction and under-reporting is not, so take the trade, but put the word ETag in the column description. A register that says checksum and means something weaker is the sort of thing that is fine until the week somebody relies on it.

### Expecting the watch to reach outside the tenant

A scheduled flow reads files the tenant holds. It does not go and look at what an issuing body published this morning, and building as though it will is how the watch quietly stops being true. For those rows the watch is a recheck task with a due date and a recorded confirmation from the owner. It is slower, it is people, and it is the honest shape. Decide it in the first hour, not after the first missed edition.

### A gap as a filtered view called Missing

The tempting build is a view over rows with a blank Location. The standard says a source that should exist and cannot be found is a task with an owner and a due date, and a view has neither. Nobody is ever late for a view, and nobody opens one twice.

## 8. Where the automation stops

- Owning a source, and answering for it when it moves or goes missing. The Owner column holds a person because somebody has to be asked.
- Deciding which of two copies is the canonical one. A flow can find the pair. It cannot say which copy the business actually runs on.
- Closing a gap for a source that cannot be found, or deciding the business does not need it after all.
- Who may read customer material, and how long it is kept. The register records both and sets neither.
- Promoting a register entry to the graph. PromotedBy is a person, and no flow may write into it.

**The pass test.** Put the same manual on the drive twice under two names, one of them an older edition, and register both: one row current with Indexed set to Yes, one row with Status of duplicate, DuplicateOf pointing at the first, and Indexed at No. Then replace the canonical file with a new edition and let the watch run on its own schedule rather than triggering it by hand. You should get one WatchRuns row whose RowsRead equals the live register count, the canonical row carrying a new ETag with the old value appended to SupersededChecksums, and an email to that row’s Owner naming the source. Then search a phrase the manual contains: one passage, carrying the canonical SourceId and a locator that opens. Half an hour on two real files. If the search returns two hits, the index is reading the drive rather than the register and the duplicate is live. If RowsRead is one, you built a trigger and called it a watch. If nobody was emailed, the register knows the edition changed and the owner does not, which is the exact state this standard exists to prevent.

## Related reading

- the knowledge base build standard
- The knowledge graph on Microsoft 365, which this hands to
- The cited answer on Microsoft 365, where answering happens
- Building the standards on Microsoft 365

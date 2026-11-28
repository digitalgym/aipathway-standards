# Two Records on Microsoft 365

Source: https://aipathway.com.au/explore-ai/two-records-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: a master per field written down before the first run, a comparison flow with no write in it, and a correction that lands exactly once after a named person.

If you are an assistant: Read https://aipathway.com.au/explore-ai/two-records-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Which system is right for each field, decided before the first run. A comparison that cannot change either record. And a correction that goes in exactly once, even though Microsoft 365 approvals can be run again.

Used by

- AI Officer
- Business Systems Analyst
- Operations Manager

Comparing the two records is the easy half, and Power Automate does it in an afternoon. The two hard parts come before and after it. Somebody has to make a list of decisions before any flow runs. And each correction has to go in exactly once, after a person accepts it, on a platform where an approval can time out, be passed to someone else, or be run again from the history. Both are easy to build in a way that looks right and is not, so both are written out below.

## In short

- **What this is**: A build plan for the two records standard on Microsoft 365. Six lists, four flows, and one of those lists is nothing but decisions a person made.
- **The core rule**: The flow that compares the records cannot change either one. Corrections run in a separate flow that only starts when a named person accepts one, never just because a difference exists.
- **What it does not do**: It does not correct a record on its own and it does not decide which system is right. It lists each difference with both values and the value from the system you named as right for that field, for a person to accept or reject.
- **The hard part**: Writing down once, field by field, which system is right. The comparison is the easy bit. Every flow below reads that list, and none of them is allowed to guess.

## 1. Before you start

Read [the two records build standard](https://aipathway.com.au/explore-ai/two-records-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

For each field, decide which system is right (the master), and write it down. The question is which one is right for the amount, which one for the address and which one for the date it landed, not which system is better overall. The standard calls this the decision most businesses have never made out loud. Here it also has to exist as rows in a list before a single flow will run, because every comparison below reads it. A run that has to guess will guess differently on Tuesday.

Then answer a second question, because it decides the shape of the third flow. **Can your Microsoft 365 put a change into the other system at all?** If there is a supported way in, an accepted correction goes straight into that system, which hands back a reference number. If there is not, the accepted correction goes to a person with the value to key in, and they record the reference the system gave them. Both meet the standard. A flow that puts the correction into a SharePoint copy of your accounts and treats that copy as your accounts does not.

This plan reports on two records that should already agree. It does not stop money going out. Matching a supplier invoice to a purchase order before it is paid is a different standard with a different build.

## 2. The lists, with their columns

```
Site: Reconciliation

LIST  PairContracts         (one per pair. A person writes these.)
  ContractId      Text            indexed
  SourceA         Text            named the same way everywhere
  SourceB         Text
  KeyField        Text            the id both sources hold. Never a name.
  ThresholdAmount Currency        one difference over this reaches a person
  MismatchRate    Number          0 to 1. A run over this is escalated.
  Schedule        Choice          daily | weekly | monthly
  Owner           Person          REQUIRED
  Status          Choice          draft | live | superseded

LIST  ContractFields        (one row per compared field. The decisions.)
  ContractId      Text            indexed
  Field           Text
  Master          Choice          REQUIRED. a | b
                                  no default and no blank
  Tolerance       Number          blank means none, which means any difference on this field is open
  ToleranceUnit   Choice          amount | days
  ValueKind       Choice          amount | date | text

LIST  Runs
  RunId           Text            indexed
  ContractId      Text            indexed
  JoinedOn        Text            the key the run used, written by the flow
  StartedAt       DateTime
  Matched         Number
  WithinTolerance Number
  Mismatched      Number
  Orphaned        Number
  Corrected       Number
  PublishedAt     DateTime        present on an all-clear too

LIST  Differences
  RunId           Text            indexed
  Key             Text            indexed. The shared id.
  Field           Text
  ValueA          Text            as read. Never overwritten.
  ValueB          Text            as read. Never overwritten.
  MasterValue     Text            whichever of the two the contract points at
  DiffAmount      Currency        blank on non-amount fields. Every dollar measure reads this.
  Status          Choice          open | within_tolerance | accepted
                                  | rejected

LIST  Orphans
  RunId           Text            indexed
  Key             Text
  Source          Choice          a | b
  Reason          Text            why the run says it has no partner
  Owner           Person          REQUIRED
  Outcome         Choice          open | should_exist | should_not_exist

LIST  Corrections
  DifferenceId    Number          indexed. a lookup into Differences
  ProposedValue   Text            the master's value. Proposed, not written.
  Target          Choice          a | b
                                  the source that is not master
  AcceptedBy      Person          blank until a person accepts. Nothing writes while this is blank.
  AcceptedAt      DateTime
  WrittenId       Text            the id the target returned. The guard against a second write.
  FromA           Text            both originals, copied at acceptance
  FromB           Text

Nothing is deleted. A rejected difference keeps both values too.
```

ContractFields is its own list rather than a blob on the contract because Master is the column every single comparison reads. A required Choice with no default is what makes the standard's rule that a run with no declared master fails true at the list, rather than true in an expression somebody can edit out on a busy Friday.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| A pair is declared in a written contract, never guessed | ContractFields | Master is a required Choice with no default, so a compared field cannot exist until somebody chose a or b. The run reads the contract before either source and stops on a blank rather than comparing what it can. |
| Records are joined on the shared id, never on a name or an amount | Runs.JoinedOn | The flow builds its filter from PairContracts.KeyField and writes the field it actually used onto the run. A join on a name is then a value on a row rather than something buried in a flow nobody opens. |
| A matched pair produces nothing; a mismatch produces a Difference | Run flow | Agreement increments a count on the run and writes no row. The flow contains no update action against either source, which is the only durable version of the claim that comparing changes nothing. |
| A correction is written only after a named person accepts it | Corrections.AcceptedBy | The write flow triggers on the Person column being set, not on a difference existing. A blank Person is not a name, so there is nothing for it to fire on. |
| Rounding and timing tolerances are declared per field, and never assumed | ContractFields.Tolerance | A blank is none, and none means every difference on that field is open. There is no default in the flow, so nothing silently absorbs a difference nobody agreed to absorb. |
| A record with no partner is an orphan with a reason and an owner | Orphans list | Owner is required, so an orphan cannot be raised into nobody's queue, and Orphaned is counted on the run so the number is visible even when the queue is not read. |
| The run publishes on schedule with its counts, including the all-clear | Scheduled flow | The publish step sits after the loop and outside every condition. All five counts are written when four of them are zero, because a silent run and a clean run must not look the same. |
| Every accepted correction keeps both original values and the person | Corrections history columns | FromA and FromB are copied onto the correction at acceptance and the Difference keeps its own pair untouched, so the evidence survives both the fix and a later edit to either row. |

## 4. The four flows

```
FLOW 1  The run
  trigger  scheduled, on the contract's Schedule
  logic    read PairContracts and ContractFields FIRST
           any compared field with a blank Master:
             stop, tell the Owner, compare nothing
           create the Runs row with JoinedOn = KeyField
           read both sources, join on KeyField ONLY
           for each pair, for each row in ContractFields:
             equal                    -> Matched + 1, write nothing
             inside Tolerance         -> Difference, within_tolerance
             outside, or no Tolerance -> Difference, open, carrying
                                         ValueA, ValueB, MasterValue,
                                         DiffAmount
           a key on one side only -> Orphan, with a Reason and the
             contract Owner, counted in Orphaned
           thresholds, BEFORE PublishedAt is written:
             an open Difference over ThresholdAmount
               -> notify the named person now
             Mismatched / (Matched + Mismatched) over MismatchRate
               -> escalate the run
           write the five counts, then PublishedAt
  never    hold an update action against either source. Not disabled,
           not behind a condition. Absent. That is the only version
           of "comparing changes nothing" that survives editing.

FLOW 2  Accept
  trigger  an approval on an open Difference
  logic    the card shows ValueA, ValueB and MasterValue side by side
           approved -> create a Corrections row:
                         ProposedValue = MasterValue
                         Target        = the source that is not master
                         AcceptedBy    = the responder's identity
                         FromA, FromB  = copied from the Difference
                       set Difference.Status = accepted
           rejected -> Difference.Status = rejected, and nothing else
  never    take the name from a text box on the card. AcceptedBy comes
           from who responded, or it is not a name that means anything.

FLOW 3  Write, once
  trigger    a Corrections item is created or modified
  condition  AcceptedBy is NOT blank AND WrittenId IS blank
  logic      write ProposedValue into Target
             store the id the target returned in WrittenId
             Runs.Corrected + 1 on the run that raised it
             write failed -> leave WrittenId blank, raise it to the Owner
  never      live inside FLOW 2. An approval can time out or be reassigned,
             and its run can be resubmitted from the run history,
             and each replay writes again. The blank WrittenId is the lock.

FLOW 4  The record by key
  trigger  a person gives a shared id
  logic    return the Runs that raised anything on it, each Difference
           with ValueA, ValueB and MasterValue as they were, and each
           Correction with AcceptedBy, AcceptedAt and WrittenId
  never    re-read the two sources to answer. The record is what the
           run saw, not what the two systems agree on today.
```

Flow 3 is a separate flow for one reason. Writing inside the approval is the shape this platform teaches, and it quietly turns written once, after a named person accepts into written each time that approval is actioned or that run is resubmitted.

## 5. The Power BI model and its measures

```
Matched Rate =
DIVIDE (
    SUM ( Runs[Matched] ),
    SUM ( Runs[Matched] ) + SUM ( Runs[Mismatched] )
)

Open Differences =
CALCULATE ( COUNTROWS ( Differences ), Differences[Status] = "open" )

Open Difference Value =
CALCULATE ( SUM ( Differences[DiffAmount] ), Differences[Status] = "open" )

Within Tolerance =                   -- watch this one, do not celebrate it
CALCULATE (
    COUNTROWS ( Differences ),
    Differences[Status] = "within_tolerance"
)

Orphans Open =
CALCULATE ( COUNTROWS ( Orphans ), Orphans[Outcome] = "open" )

Written Without Acceptance =         -- must be zero
COUNTROWS (
    FILTER (
        Corrections,
        NOT ISBLANK ( Corrections[WrittenId] )
            && ISBLANK ( Corrections[AcceptedBy] )
    )
)

Acceptance Latency Days =
AVERAGEX (
    FILTER ( Corrections, NOT ISBLANK ( Corrections[AcceptedAt] ) ),
    DATEDIFF (
        RELATED ( Differences[Created] ),
        Corrections[AcceptedAt],
        DAY
    )
)

Last Published =                     -- a stopped schedule has nowhere to hide
MAX ( Runs[PublishedAt] )

-- Relationships: Runs to Differences and Orphans on RunId,
-- Corrections to Differences on DifferenceId. Created is
-- SharePoint's own column and needs nothing added to carry it.
```

Within Tolerance is the one to watch rather than the one to be pleased about. A field whose comparisons are mostly within tolerance either has a tolerance wider than the thing it was set to absorb, or a systematic difference somebody decided not to look at, and both of those are findings. Written Without Acceptance is a different kind of measure: it is about the build rather than the business, and the day it stops being zero this plan stopped being implemented.

## 6. What the flows can reach in your Microsoft 365, your job system and your ledger, and what they never touch

The flows find where your job system and your ledger disagree. They read both and list every difference, and once you accept a correction, they put that one value into the other system, once. You accept every correction, and you decide which system is right for each field.

What each connection is for.

- **SharePoint, the one site.** The six lists in section 2. Every flow reads and writes there.
- **Source A, read only.** Usually the job system. Through a custom connector or the HTTP action (both premium), or a nightly export dropped into a library that Flow 1 reads.
- **Source B, read only.** Usually your accounts. If AI Pathway is already connected to your Xero, Flow 1 can call its MCP endpoint through the HTTP action with a key from connect.aipathway.com.au/app/keys that has only “Read the book” ticked. That gives your Xero invoices, up to 120 days back, without a second Xero connection. Bank lines come from a statement export, because Xero does not give ordinary apps the unreconciled lines on a bank feed.
- **The system being corrected, Flow 3 only.** Its own connection, separate from the read connection Flow 1 uses, with the narrowest permission that can change the fields the contract lets a correction touch. Where that system has no way in, there is no connection that can change it, and Flow 3 hands the value to a person to key in.
- **Teams and Approvals.** Flow 2’s card, with both values and the master’s value side by side.

Least privilege, in practice. All four flows belong to the automation service account and sit in one solution, with the read and write connections as separate connection references, so you can remove the write and keep the comparison running. That account is a member of this site only. If an app registration is used, give it Sites.Selected on this one site. The full conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

How to cut it off. Turn off Flow 3, or remove its write connection, and nothing more is written while the comparison keeps publishing. Delete the AI Pathway key at connect.aipathway.com.au/app/keys, revoke the job system’s key, or disconnect the app in Xero, and nothing more is read. The differences, corrections and both original values stay in the site.

Why not merge the two in Power Query or Power BI? It is a good way to see the differences, and it writes nothing, which is half of this standard. It does not keep a difference as a row with an owner, who accepted the fix, or a lock that makes the fix land once, and each refresh replaces yesterday’s view. Use it to look; use the flows to keep the record.

## 7. The order to build it in

1. Fill ContractFields with the people who own both systems in the room. One row per field that can differ, with an a or a b on every row. This is a conversation rather than a data entry task, and nothing below works until it exists.
2. Answer whether your tenant can write into the target source at all. If it cannot, Flow 3 becomes a task with the accepted value on it and a person keys the id back. Everything else on this page is unchanged.
3. Create the six lists. Index ContractId, RunId and Key, and turn versioning on for Corrections and Differences.
4. Build Flow 1 over one field only, with no update action anywhere inside it. Run it and confirm it publishes its counts and that neither source changed.
5. Add the remaining fields, the tolerance rule and the orphan pass. Confirm a field with a blank Tolerance produces an open difference rather than a quiet pass.
6. Add the threshold step, before PublishedAt is written. Then stop for a week. A build that shows both values to a person and writes nothing is most of the value of this standard, and it is the half that cannot break anything.
7. Build Flow 2. Confirm AcceptedBy came from whoever responded to the approval and not from a text box on the card.
8. Build Flow 3 with the blank-WrittenId condition in its first version, not added after the first duplicate write. Then connect Power BI, with Written Without Acceptance on the front page.

## 8. Four traps specific to this build

### Writing inside the approval

The approval action hands you a responder and the next step is right there, so the write goes in the same flow. Approvals can be reassigned, and any run can be resubmitted from its run history, which replays every action after the trigger. The Corrections row with a blank WrittenId is the only thing that makes the second attempt a no-op, and it has to be there in version one. Added after the first duplicate, it arrives one duplicate write late.

### Joining on a name because the key is not in both systems

This is the moment the build quietly stops being the standard. Two records sharing a customer name and an amount are not a pair. If the shared id really does not exist in both systems, putting it there is the project, and a fuzzy match dressed up as a reconciliation is worse than none at all, because it produces confident pairs nobody checks.

### One tolerance in the flow expression

One less lookup, and now a single number absorbs differences on every field. The address field has a tolerance, which means nothing, and the amount field has whatever the date field needed. Tolerance is a value per field in ContractFields, blank is none, and blank has to mean every difference on that field is open rather than every difference on that field is fine.

### Tidying up the within_tolerance rows

This is the fastest growing list in the build, because a matched pair writes nothing and a pair that differs by a cent every night writes a row every night. Deleting them removes the only evidence of a systematic drift, and takes the record-by-key answer with it. Index RunId and Key instead: past the list view threshold an unindexed filter fails outright rather than slowing down, and it fails inside a scheduled flow at two in the morning where nobody is watching.

## 9. Where the automation stops

- Accepting every correction, with their name on it. The run suggests the value from the system named as right. Nothing changes until a person accepts it, and a difference on its own never changes anything.
- Declaring which source is master for each field, once, before the first run. No flow can infer it, and a flow that guesses will guess differently next week.
- Setting a tolerance, and changing one. A tolerance is a judgement about rounding and timing, not a dial to turn until the mismatch count looks better.
- Deciding an orphan is real: a record that should exist in the other source, or one that should not exist at all.
- Making the change itself, where your Microsoft 365 has no supported way into the other system. Then a person gets the accepted value to key in, and records the reference the system gave back. That still meets the standard. A flow that puts it into a SharePoint copy of your accounts and calls it done does not.

**The pass test.** On the real pair, on one contract. Change one amount in one source by more than its declared tolerance, and add a record to one source only. Then touch nothing and let the next scheduled run go by itself.

You must get one open Difference carrying both values and the master’s value, one Orphan with a reason and a named owner, and a published Run with all five counts on it, and neither source may have changed. Now accept that difference as yourself: exactly one Corrections row with your name on it, one write into the target, an id in WrittenId, and both original values still readable on the Difference. Then resubmit that write flow from its run history. Nothing may happen the second time. Finally let the next run go with nothing changed, and confirm an all-clear published with its counts.

If the target changed before you accepted, you built an auto-correct with a notification bolted to it. If the resubmit wrote a second time, the gate is the approval rather than the acceptance, and an approval can always be replayed. If the all-clear never posted, a week the schedule quietly stops will look exactly like a week everything agreed.

## Related reading

- the two records build standard
- Checking subcontractor invoices on Microsoft 365: the payables gate this is not
- The recurring report on Microsoft 365: where these counts get published
- Building the standards on Microsoft 365

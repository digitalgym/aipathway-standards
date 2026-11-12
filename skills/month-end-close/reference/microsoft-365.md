# Signing Off the Month on Microsoft 365

Source: https://aipathway.com.au/explore-ai/signing-off-the-month-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Month-End Close standard on Microsoft 365: Entities, CloseItems, Schedule, Proposals and SignOff as SharePoint lists, a flow that works the checklist against the ledger through the ledger's own connector and records evidence per item, and a second flow that runs only after a person signs off, posting each approved journal once, reading it back, and setting the lock date or asking a person to where the ledger cannot.

If you are an assistant: Read https://aipathway.com.au/explore-ai/signing-off-the-month-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Six lists and two flows that work your month-end checklist against your ledger, wait for your sign-off, then post the month's journals once and lock the month.

Used by

- Financial Controller
- Bookkeeper
- Business Systems Analyst

The close is the same list every month: bank reconciled, nothing in suspense, debtors and creditors agreeing with their control accounts, payroll in, accruals posted, GST and clearing accounts square. This plan puts the list and its evidence in SharePoint and lets a flow do the checking. You review it and sign off, and only then does a second flow post the journals you approved and lock the month.

## In short

- **What this is**: A build plan for the Month-End Close standard on Microsoft 365. Six lists and two flows beside the ledger you already run: Xero, MYOB Business or QuickBooks Online, reached through the ledger's own sign-in.
- **The core rule**: Flow 1 only reads the ledger and fills the close pack. Flow 2 writes into the ledger, and it does nothing until a person's row is on the SignOff list.
- **What it does not do**: It never makes up an accrual amount, never decides a difference is too small to matter, never recodes a transaction and never sets a lock date earlier than the one the ledger holds.
- **The hard part**: A post that times out after it landed: Flow 2 reads the journals back and looks for the intent id before it ever tries again.

## 1. Before you start

Read [the month-end close build standard](https://aipathway.com.au/explore-ai/month-end-close-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Fill Entities with each company you close, its ledger and who signs it off. Put your accruals and prepayments on Schedule, with the amount where it is the same each month and blank where a person enters it.

One thing to test before you build Flow 2: **can your ledger’s API write the lock date?** Leave LockWritable off until a test on your own company shows a write reads back. Off means Flow 2 asks the reviewer to set it.

## 2. The lists, with their columns

```
Site: MonthEndClose

LIST  Entities              (one row per company or trust you close)
  EntityId        Text            indexed, UNIQUE, REQUIRED
  LegalName       Text            REQUIRED
  Ledger          Choice          REQUIRED. Xero | MYOB Business
                                  | QuickBooks Online
  LockWritable    Boolean         only yes once a test showed the ledger's API writes the lock date and it reads back
  Reviewer        Person          REQUIRED. who signs off this entity's close
  Bookkeeper      Person          REQUIRED

LIST  CloseItems            (one row per entity, period and checklist item, written by Flow 1)
  ItemKey         Text            indexed, UNIQUE, REQUIRED. EntityId/Period/Item
  EntityId        Text            indexed, REQUIRED
  Period          Text            indexed, REQUIRED. the month, as 2026-10
  Item            Choice          REQUIRED. bank | uncoded | receivables
                                  | payables | payroll | accruals | tax_control | clearing
  Result          Choice          indexed, REQUIRED. pass | fail
                                  | could_not_check
  Evidence        Note            the read it came from, when, and the figures compared; blank only for could_not_check
  ReadAt          DateTime
  Detail          Note            REQUIRED

LIST  Schedule              (the accruals and prepayments the business keeps. A person maintains it.)
  EntityId        Text            indexed, REQUIRED
  LineId          Text            indexed, REQUIRED
  Kind            Choice          REQUIRED. accrual | prepayment
  Description     Text            REQUIRED
  DebitAccount    Text            REQUIRED
  CreditAccount   Text            REQUIRED
  Amount          Currency        blank when a person enters it each month

LIST  MonthlyAmounts        (a person's amount for a schedule line with no fixed amount, one row per line per period)
  EntityId        Text            indexed, REQUIRED
  Period          Text            indexed, REQUIRED
  LineId          Text            indexed, REQUIRED
  Amount          Currency        REQUIRED
  EnteredBy       Person          REQUIRED

LIST  Proposals             (one row per journal proposed from the schedule, written by Flow 1)
  IntentId        Text            indexed, UNIQUE, REQUIRED. close:<tenant>:<entity>:<period>:<line>; carried in the journal's narration
  EntityId        Text            indexed, REQUIRED
  Period          Text            indexed, REQUIRED
  LineId          Text            REQUIRED
  Amount          Currency        REQUIRED
  Source          Choice          REQUIRED. schedule | person_entry
  EnteredBy       Text
  Approved        Boolean         ticked by the person signing off, never by a flow
  LedgerJournalId Text            written by Flow 2 only after the journal reads back

LIST  SignOff               (one row per entity and period, added by the reviewer. Flow 2 does nothing without it.)
  EntityId        Text            indexed, REQUIRED
  Period          Text            indexed, REQUIRED
  SignedOffBy     Person          REQUIRED
  SignedOffOn     DateTime        REQUIRED
  LockDateReadBack DateTime        written by Flow 2 once the ledger answers with the period end or later
  HandedToReport  Boolean

The ledger is not in this site. The flows reach it through the ledger's own connector and sign-in, post only what a person approved here, and never move its lock date backwards.
```

Proposals.IntentId is unique, so a schedule line has one proposal and one journal. CloseItems.ItemKey is unique, so a second run of Flow 1 updates the result rather than adding one.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every item gets a result with its evidence | CloseItems.Result and Evidence | Flow 1 writes all eight items for each entity. Pass and fail carry the report it read, when, and the figures compared. A read that failed is could_not_check with the reason. |
| Uncoded lines go to Uncoded Query | CloseItems uncoded row, and the Uncoded Query list | Each uncoded or suspense line is added once to the Uncoded Query standard's list, by line id. Flow 1 never recodes one. |
| Accruals only from the schedule or a person | Schedule.Amount, MonthlyAmounts, Proposals.Source | A line with no Amount and no MonthlyAmounts row for the period is not proposed; the bookkeeper is told. Last month's figure is never used. |
| Nothing written before sign-off | SignOff and Proposals.Approved | Flow 2's first step looks for a SignOff row for the entity and period. None ends the run. Only ticked proposals are posted. |
| Each journal posts once | Proposals.IntentId and LedgerJournalId | Flow 2 reads the period's journals back and matches the intent id in the narration before every post, and writes LedgerJournalId only after the read back finds it. |
| The lock date moves forward only | Entities.LockWritable and SignOff.LockDateReadBack | After every approved journal reads back, Flow 2 reads the lock date. Earlier than the period end: write it where LockWritable is on, otherwise message the reviewer. Later: leave it. |

## 4. The flows

```
FLOW 1  Work the checklist               (a button, or the third
                                         working day; you pick the Period)
  for each entity
    stop   if a SignOff row exists for this Period
    read   bank accounts and their reconciled statement
           dates; uncoded and suspense lines; aged
           receivables and payables; control accounts;
           pay runs posted; tax return figure; clearing
           balances. Any read that fails -> could_not_check
    write  one CloseItems row per item, with Evidence
    hand   each uncoded line, once, to Uncoded Query
    each   Schedule line: Amount, or this Period's
           MonthlyAmounts row, else tell the bookkeeper
           -> one Proposals row, IntentId unique
    post   to the reviewer: the pack is ready
  never    a write into the ledger

FLOW 2  After sign-off                  (when a SignOff row is added)
  first    the SignOff row for entity and Period -> none, stop
  read     the period's journals from the ledger
  each     ticked Proposals row not found by IntentId:
             post the journal, IntentId in the narration
             no answer -> tell the bookkeeper; next run
             reads back before it tries again
  read     the journals again; every ticked row found ->
           write LedgerJournalId
  read     the lock date
           earlier than the period end:
             LockWritable -> write the period end, read back
             otherwise    -> message the reviewer, once
           at or after the period end: leave it
  then     LockDateReadBack filled -> hand the Period to the
           Recurring Report
  never    a lock date earlier than the one it read
```

Flow 1 has no write action on the ledger connection at all. Flow 2 is the only one that writes, and its trigger is a person's row.

## 5. What the flows can reach in your Microsoft 365 and your ledger

Flow 1 is an auditor with read access and a clipboard: it reads the ledger’s reports and writes what it found to the close pack. Flow 2 is the only one that writes into the ledger, and only journals a person ticked on Proposals after a SignOff row exists.

- **Your ledger, through its own connector.** Read reports and transactions for Flow 1; create journals for Flow 2. The settings that hold the lock date are read only on the ledgers checked on 12 November 2026, so the lock step is a task for the reviewer there.
- **SharePoint, the MonthEndClose site.** Contribute on CloseItems and Proposals; read on the rest.
- **Teams, a chat with the reviewer.** One message when a pack is ready, and one when the lock date needs setting by hand.

How to cut it off. Turn Flow 2 off and nothing is written into the ledger. Revoke the ledger connection in the ledger’s own connected apps page and both flows stop.

## 6. The order to build it in

1. Create the MonthEndClose site, the six lists and the ledger connection as a service account.
2. Build Flow 1 for one entity and compare its results with last month's close done by hand.
3. Add the schedule and check a line with no amount is not proposed.
4. Build Flow 2's first step and run it with no SignOff row: it must stop before reading anything else.
5. Post one test accrual, kill the run after the post, and run it again: still one journal.
6. Test the lock date write on your own company, and only then turn LockWritable on.

## 7. Three traps specific to this build

### A default amount

A Power Automate expression that falls back to last month's figure, or to zero, quietly invents an accrual. A missing amount is a message to the bookkeeper, never a number.

### A tolerance in the condition

Comparing with less than five dollars instead of equal makes the flow decide materiality. Compare to the cent and let the reviewer decide.

### Retry policy on the post

Power Automate retries a failed action by default. A post that landed and timed out then posts twice. Turn the retry off on the post and read back instead.

## 8. Where the automation stops

- Reviewing the close pack and signing off, approving each proposed journal.
- Keeping the accruals schedule and entering any amount it does not hold.
- Deciding whether any difference matters.
- Setting the lock date by hand where the ledger's API cannot.
- What each uncoded line was.

**The pass test.** On your own ledger. Run Flow 1 for one entity with one accrual on the schedule: every item has a result, and nothing is written into the ledger. Add the SignOff row and tick the accrual. Flow 2 posts it once and it reads back; run Flow 2 again and nothing new is posted. The lock date reads back at the period end, written by the flow or by the reviewer on the message it sent.

## Related reading

- the month-end close build standard
- The Recurring Report on Microsoft 365: the monthly pack from a closed month
- Batch payments on Microsoft 365: one deposit split across its invoices
- Building the standards on Microsoft 365

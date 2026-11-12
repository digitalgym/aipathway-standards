# Coding Questions on Microsoft 365

Source: https://aipathway.com.au/explore-ai/coding-questions-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the Uncoded Query standard on Microsoft 365: clients, uncoded lines, question lists, answers and approvals as SharePoint lists, a Microsoft Form or list view where each client answers each line, reminders on the practice's schedule, proposals from the client's own chart for a person to approve in Teams, and one keyed write per approved coding, read back from the ledger.

If you are an assistant: Read https://aipathway.com.au/explore-ai/coding-questions-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for a practice that lives in Microsoft 365: each client's uncoded lines and their one question list a month as SharePoint lists, answers taken line by line, approvals in Teams, and one keyed write per approved coding.

Used by

- Bookkeeper
- Practice Manager
- Business Systems Analyst

Microsoft 365 has the pieces this needs: Outlook to send each client their list, Forms or a list view for the answers, lists to hold every line and answer, and Teams for the person who approves. The part that takes thought is the same as on any stack: one list per client per month, nothing written until a person approves it, and each approval written once however often the flow runs.

## In short

- **What this is**: A build plan for the Uncoded Query standard on Microsoft 365. Eight lists keyed on the ledger's own line id, four flows, and a person approving every coding in Teams.
- **The core rule**: Flow 4 writes a coding only from an Approvals row with a person in ApprovedBy, and Writes.WriteKey is unique, so a second write of the same approval cannot be recorded.
- **What it does not do**: No flow tells a client what is deductible, creates an account, reconciles a bank line or rings a client. Those stay with your team.
- **The hard part**: Keying the write on the approval rather than the run, so a timeout after the ledger saved the change cannot write it twice, and reading every write back.

## 1. Before you start

Read [the Uncoded Query build standard](https://aipathway.com.au/explore-ai/uncoded-query-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide how the flows reach each client’s ledger. They connect straight to it (Xero, MYOB Business or QuickBooks Online) through the ledger’s own app sign-in, by a custom connector or the HTTP action (both premium in Power Automate), on a connection the practice owns rather than a staff login.

Then check what each ledger lets a flow read and write, on its demo or sandbox company: lines parked on suspense can be read and recoded on all three; Xero and QuickBooks Online do not hand an app the bank feed lines still waiting to be reconciled; MYOB Business lists them with an Uncoded status. No ledger lets a flow reconcile a feed line, and under this standard no flow tries.

## 2. The lists, with their columns

```
Site: CodingQuestions

LIST  Settings              (one row. The practice sets the schedule; the flows read it.)
  SettingKey      Text            indexed, UNIQUE, REQUIRED. always "settings": one row
  ReminderEveryDays Number          REQUIRED. days between the list and each reminder
  MaxReminders    Number          REQUIRED. after this many, the client goes to a person
  Approver        Person          REQUIRED. who approves codings and takes the hand-offs

LIST  Clients               (one row per client file)
  ClientId        Text            indexed, UNIQUE, REQUIRED
  ClientName      Text            REQUIRED
  Email           Text            REQUIRED
  Mobile          Text            optional, for an SMS link to the same list
  Ledger          Choice          REQUIRED. Xero | MYOB Business
                                  | QuickBooks Online
  SuspenseAccount Text            the account code this client's file parks unknown lines on

LIST  UncodedLines          (one row per line the ledger shows as uncoded, refreshed each run)
  LineId          Text            indexed, UNIQUE, REQUIRED. the ledger's own transaction or statement line id
  ClientId        Text            indexed, REQUIRED
  LineDate        DateTime        REQUIRED
  Amount          Currency        REQUIRED. negative for money out
  Payee           Text            REQUIRED. exactly as the statement printed it
  Source          Choice          REQUIRED. suspense | statement
                                  statement lines are reconciled by a person, never by a flow
  Status          Choice          indexed, REQUIRED. asked | answered
                                  | proposed | approved | written | handed_off

LIST  QuestionLists         (one row per client per cycle. Never two.)
  ListKey         Text            indexed, UNIQUE, REQUIRED. ClientId/2026-11
  ClientId        Text            indexed, REQUIRED
  Cycle           Text            REQUIRED. the month, as 2026-11
  LineIds         Note            REQUIRED. every line asked in this list
  SentOn          DateTime        REQUIRED
  RemindersSent   Number          REQUIRED
  LastMessageOn   DateTime        REQUIRED
  HandedOff       Boolean         set once, when the last reminder went unanswered

LIST  Answers               (one row per answer, as the client typed it)
  LineId          Text            indexed, REQUIRED
  ClientId        Text            indexed, REQUIRED
  AnswerText      Note            REQUIRED. word for word
  AnsweredBy      Text            REQUIRED
  AnsweredOn      DateTime        REQUIRED

LIST  Proposals             (one row per proposed coding, written by a flow. A proposal is not a write.)
  LineId          Text            indexed, REQUIRED
  AccountCode     Text            REQUIRED. from this client's chart only
  TaxCode         Text            REQUIRED. from this client's chart only
  Why             Note            REQUIRED. the answer and the history it came from; never tax advice

LIST  Approvals             (one row per approval. A person adds it, from the Teams card or the list.)
  LineId          Text            indexed, REQUIRED
  AccountCode     Text            REQUIRED. what the person approved, which may differ from the proposal
  TaxCode         Text            REQUIRED
  ApprovedBy      Person          REQUIRED
  ApprovedOn      DateTime        REQUIRED

LIST  Writes                (one row per approved coding written, keyed so a retry cannot write twice)
  WriteKey        Text            indexed, UNIQUE, REQUIRED. LineId/approval id: the idempotency key sent to the ledger
  LineId          Text            indexed, REQUIRED
  Result          Choice          REQUIRED. written | readback_mismatch
                                  | write_failed | reconcile_by_person
  LedgerAccount   Text            what the ledger holds, read back after the write
  LedgerTaxCode   Text
  WrittenOn       DateTime

No list or flow here reconciles a bank line, creates an account or a tax code, or places a call. Statement lines end in Writes as reconcile_by_person, for a person to reconcile with the approved coding.
```

Unique values on QuestionLists.ListKey holds check 2: a second list for the same client and month cannot be recorded. Unique values on Writes.WriteKey holds check 12, and the same key goes to the ledger as its idempotency key.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Only lines the ledger still shows as uncoded | Flow 1, UncodedLines | Flow 1 refreshes UncodedLines from each client's ledger on list day and before every reminder, and nothing else adds rows. |
| One question list per client per cycle | Flow 2, QuestionLists.ListKey | Flow 2 creates the QuestionLists row before it sends. If the row exists, SharePoint refuses it and nothing is sent. |
| No tax advice reaches the client | Flow 2, one fixed template | The email and SMS text is a fixed template: the amount, the payee as printed, the date and "what was it for?" No account, tax code or tax word is ever merged in. |
| A line answered is never asked again | Flows 2 and 3, Answers | Both flows skip any line with an Answers row, including next month's list while the approval waits. |
| Suggestions only from the client's own chart | Flow 3, Proposals | Flow 3 reads the client's chart and history from their ledger, suggests only an account and tax code it found there, and posts no_account_fits to the approver otherwise. |
| Approved, then written once, then read back | Flow 4, Approvals and Writes.WriteKey | Flow 4 creates the Writes row first, sends the same key to the ledger, reads the line back and records what the ledger holds. Statement lines are recorded as reconcile_by_person and never written. |

## 4. The four flows

```
FLOW 1  Read the uncoded lines
  trigger  list day each month; before each reminder run
  logic    per client: read lines on the suspense account
             (and feed lines where the ledger offers them)
           upsert UncodedLines by LineId; a line no longer
             uncoded is removed from the open set
  never    add a line the ledger did not return.

FLOW 2  Send the list, then the reminders
  trigger  after Flow 1 on list day; daily
  logic    no QuestionLists row for client/cycle -> create it,
             then one email (and SMS link) with every open line
           row exists -> lines with no Answers row only;
             LastMessageOn + ReminderEveryDays passed and
             RemindersSent < MaxReminders -> reminder
           RemindersSent = MaxReminders and the interval passed
             -> HandedOff, post the open lines to the approver
  never    send a second list in a cycle, a line already
           answered, or any tax word. No call is placed.

FLOW 3  Take the answer, suggest a coding
  trigger  a new Answers row (from Forms or the list view)
  logic    keep AnswerText as typed, with who and when
           history for the same payee -> that coding
           else match the answer to the client's account names;
             tax code from that account in the client's chart
           nothing fits -> no_account_fits to the approver
           post the suggestion to Teams with the answer beside it
  never    suggest a code the client's chart does not hold.

FLOW 4  Write what was approved
  trigger  a new Approvals row
  logic    Source statement -> Writes row reconcile_by_person,
             post to the approver with the coding, stop
           create Writes row with WriteKey (unique); exists -> stop
           write to the ledger with WriteKey as its key
           (Xero edit or journal off suspense; MYOB with RowVersion;
            QuickBooks sparse update with requestid)
           read the line back; same -> written; else
             readback_mismatch to the approver
  never    write without an Approvals row, or reconcile.
```

No flow writes the Approvals list. A person adds the row, from the Teams card or the list, and Flow 4 reads it.

## 5. What the flows can reach in your Microsoft 365 and your clients' ledgers, and what they never touch

The flows get a pencil with no rubber. They can read each client’s uncoded lines, chart and history, send one list a month, and write a coding a person approved, once. They never reconcile a bank line, create an account or tax code, tell a client anything about tax, or fill in the Approvals list.

What each connection is for.

- **SharePoint, the one site.** The eight lists in the schema, and nothing else.
- **Outlook, one shared mailbox.** To send each client their list and reminders from the practice’s address.
- **Forms, or a list view.** Where each client answers each line. A pre-filled form per list keeps the line id with the answer.
- **Each client’s ledger, three reads and one write.** Read the uncoded lines, the chart and tax codes, and past codings. Write the approved coding. Through a custom connector or the HTTP action, both premium, on an app connection the client file approves.
- **Teams.** The card that puts each suggestion, and each hand-off, in front of the approver.

Least privilege, as steps.

1. Own the four flows with a service account, not the bookkeeper who set them up, with a named co-owner.
2. Build them in one solution on connection references, so each connection is one place to change.
3. Make the service account a member of the one site and no other. Any app registration gets Sites.Selected on that one site.
4. Give it Send As on the one shared mailbox only.
5. If you build a custom connector, define the three reads and the one write, and nothing else, and test it on a demo company first.

How to cut it off. Turn off the flows in the solution, and disconnect the app in each ledger’s settings. The lists stay, so every question, answer and approval is still on record. The other switches are in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

## 6. The order to build it in

1. Create the eight lists from the schema, with QuestionLists.ListKey, Writes.WriteKey and UncodedLines.LineId unique.
2. Build Flow 1 against a demo company and prove a line coded by hand drops out of the open set.
3. Build Flow 2 and prove a second run in the month sends nothing, and the reminder carries only unanswered lines.
4. Build Flow 3 and prove an answer that fits no account reaches the approver with nothing suggested.
5. Build Flow 4 and prove an approval written twice leaves one Writes row and one change in the ledger.

## 7. Four traps specific to this build

### Keying the list on the run instead of the client and month

A flow that retries sends the client a second list. Key it on client and cycle, and let SharePoint's unique column refuse the second.

### Merging the suggested account into the client's email

It reads as advice and invites the client to argue the code. The client is asked what happened; the coding is your team's.

### Writing the suggestion when the client answers

A suggestion is a guess with a reason. Only an Approvals row with a person in it starts a write.

### A fresh key on every retry

When the ledger saved the change but the answer was lost, a new key writes it again. Key on the approval.

## 8. Where the automation stops

- Approving every coding, or changing it first.
- Reconciling a bank line still in the feed, with its approved coding.
- Every answer that fits no account in the client's chart.
- Following up a client after the last reminder, by phone or otherwise.
- Every tax question the answers raise.

**The pass test.** On a ledger’s demo company, park two lines on suspense, answer both through the form, and let Flow 3 suggest a coding for each. Approve one in Teams and leave the other. Run Flow 4 three times: the approved line holds exactly what was approved, read back from the ledger, with one Writes row; the other is still on suspense. Half an hour on your own tenant.

## Related reading

- the Uncoded Query build standard
- The standards on Microsoft 365: the hub
- Batch Payments on Microsoft 365: remittances split across invoices
- Two Records on Microsoft 365: comparing the ledger with another system
- Building the standards on Microsoft 365

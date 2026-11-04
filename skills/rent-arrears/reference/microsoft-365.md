# Rent Arrears on Microsoft 365

Source: https://aipathway.com.au/explore-ai/arrears-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: paid-to dates reported first because the statutory clock runs on them, a triage that checks not-in-arrears before anything else, a stop check re-read before every message, and notices a named person releases. Four lists, four flows.

If you are an assistant: Read https://aipathway.com.au/explore-ai/arrears-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The escalation clock here is written in legislation, which makes the derive step and the stop check carry weight the other build plans do not have to.

Used by

- Business Systems Analyst
- Property Manager
- Operations Manager

Arrears is the one workflow in this library where getting the date arithmetic wrong is not merely embarrassing. The periods are set by state legislation, the notices have legal effect, and a message sent to somebody who has already paid is a complaint with your name on it. The build is not hard. It is just unforgiving about two specific steps.

## In short

- **What this is**: A build plan for the rent arrears standard on Microsoft 365. Four lists, four flows, six measures.
- **The core rule**: Not in arrears is the first branch of the triage, every time. Everything else in this plan exists downstream of that check.
- **What it does not do**: No notice with legal effect leaves without a named person releasing it. The timer drafts; the person sends.
- **The hard part**: The stop check, which has to run before every message rather than once when the sequence started.

## 1. Before you start

Read [the rent arrears build standard](https://aipathway.com.au/explore-ai/rent-arrears-build-standard) first, and note that it already defines its objects. The lists below are those objects with SharePoint types on them, not a new model. The shared conventions for this stack are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Two decisions to make before building. Which jurisdictions you operate in, because the Rules list is per state and an implementation that assumes one is wrong the first time you manage a property across a border. And who is permitted to release a notice, because that group is the gate and it should exist before the flow that calls it.

## 2. The lists, with their columns

Four lists, following the standard's own objects. The one thing to notice is the order of columns on Positions: PaidTo comes first because the clock runs on it and Balance is the least useful of the three on its own.

```
Site: Arrears

LIST  Rules                 (per jurisdiction, versioned)
  Jurisdiction    Choice          indexed, REQUIRED. the states you operate in
  Step            Text            what this period governs
  DaysAfter       Number
  CountsFrom      Choice          paid_to | notice_issued | previous_step
  EffectiveFrom   DateTime        REQUIRED
  EffectiveTo     DateTime        blank means current
  RuleVersion     Text
  Citation        Text

LIST  Positions             (refreshed; never hand-edited)
  TenancyRef      Text            indexed
  PaidTo          DateTime        REPORT THIS FIRST. The clock runs on it.
  DaysInArrears   Number          derived on refresh from PaidTo
  Balance         Currency        secondary on every view, on purpose
  RentPeriod      Choice          weekly | fortnightly | monthly
  Jurisdiction    Choice          the states you operate in
  AsOf            DateTime        REQUIRED. shown wherever a figure is shown
  Outcome         Choice          not_in_arrears | will_self_resolve
                                  | needs_conversation | statutory_path
  OutcomeEvidence Text            what in the ledger says so
  NoticeIssued    DateTime
  RuleVersion     Text            which version produced the dates below
  NextLawfulStep  Text
  NextLawfulDate  DateTime        DERIVED. Written by the clock flow only.

LIST  StopConditions        (the gate, read before every message)
  TenancyRef      Text            indexed
  Condition       Choice          hardship | dispute | payment_plan | tribunal
                                  | vulnerable | agency_error
  AddedBy         Person
  AddedAt         DateTime
  ClearedAt       DateTime        blank means live
  Note            Text

LIST  Messages              (append only)
  TenancyRef      Text            indexed
  Kind            Choice          reminder | conversation | notice
  DraftedAt       DateTime
  ApprovedBy      Person          required for kind = notice
  SentAt          DateTime        blank means never sent
  Blocked         Text            the stop condition that stopped it
```

Messages records drafts that were never sent, with the stop condition that stopped them. That is not bookkeeping: if a tenancy ever reaches a tribunal, the record of what you did not send is as useful as the record of what you did.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| Report paid-to first, because the statutory clock runs on it | List design | PaidTo is the required field and DaysInArrears is derived from it on refresh. Balance is present and deliberately secondary on every view. |
| Not in arrears is checked before anything else | Triage flow | The first branch, always. Chasing someone who has paid is the most damaging thing this process can do and it is what a stale position causes. |
| The position is as at a time, and that time is shown | Sync flow | AsOf stamps every row. Any view or message that can show a figure without its stamp will eventually show a wrong one. |
| The stop check runs before every message, not once per run | Message flow | Circumstances change mid-sequence. The check is inside the send step and it re-reads, so a hardship application lodged this morning stops this afternoon's message. |
| Statutory dates are derived from a dated, jurisdictional rule | Clock flow | NextLawfulDate is computed from the rule live for that state on that date, with the rule version stamped. Never typed, and never hardcoded to one state. |
| Nothing legal leaves without a person releasing it | Approval | The notice is drafted and an approval is requested. The send action sits after the approval response, never on the timer. |

## 4. The four flows

```
FLOW 1  Refresh positions
  trigger  scheduled, at least daily
  logic    read the trust or property ledger
           upsert Positions by TenancyRef
           PaidTo from the ledger; DaysInArrears derived from it
           stamp AsOf on every row touched
  never    write PaidTo or Balance from anywhere else

FLOW 2  Triage
  trigger  after FLOW 1
  logic    IN THIS ORDER, first match wins:
             DaysInArrears <= 0            -> not_in_arrears
             payment pattern says it clears -> will_self_resolve
             a stop condition is live       -> needs_conversation
             otherwise                      -> statutory_path
           write Outcome and OutcomeEvidence
  note     the order is the standard. Reordering it to "find the
           chaseable ones faster" is how somebody who has paid
           receives a notice.

FLOW 3  The statutory clock
  trigger  after FLOW 2, for statutory_path rows
  logic    rule = Rules where Jurisdiction matches and
                  EffectiveFrom <= today < EffectiveTo
           anchor = PaidTo or NoticeIssued, per rule.CountsFrom
           NextLawfulDate = addToTime(anchor, rule.DaysAfter, 'Day')
           stamp RuleVersion
  never    compute a date from a literal number of days

FLOW 4  Message, with the stop check inside it
  trigger  scheduled, and on operator action
  guard    re-read StopConditions for this tenancy NOW.
           any live row: write a Messages row with Blocked set,
           SentAt blank, and stop.
  logic    kind = notice  -> draft, start an approval, send only
                             on an approved response, record
                             ApprovedBy
           otherwise      -> draft and send, record it
  always   write the Messages row whether or not anything was sent
```

Flow 4's guard re-reads rather than trusting anything Flow 2 decided. Those two can be hours apart, and the whole point of a stop condition is that it can appear in between.

## 5. The Power BI model and its measures

```
Days In Arrears (avg) = AVERAGE ( Positions[DaysInArrears] )

Outcome Mix =
CALCULATE ( COUNTROWS ( Positions ), ALLEXCEPT ( Positions, Positions[Outcome] ) )

Blocked Messages =
CALCULATE ( COUNTROWS ( Messages ), NOT ISBLANK ( Messages[Blocked] ) )

Notices Without Approval =              -- must be zero
CALCULATE (
    COUNTROWS ( Messages ),
    Messages[Kind] = "notice",
    NOT ISBLANK ( Messages[SentAt] ),
    ISBLANK ( Messages[ApprovedBy] )
)

Stale Positions =
CALCULATE (
    COUNTROWS ( Positions ),
    DATEDIFF ( Positions[AsOf], NOW (), HOUR ) > 30
)

Chased While Paid =                     -- must be zero
CALCULATE (
    COUNTROWS ( Messages ),
    NOT ISBLANK ( Messages[SentAt] ),
    FILTER ( Positions, Positions[Outcome] = "not_in_arrears" )
)
```

Two of these must be zero and both should be on the front page. Notices Without Approval is a compliance failure. Chased While Paid is the one that produces a complaint, and it is almost always caused by a refresh that quietly stopped rather than by anyone's judgement.

## 6. What the flows can reach in your Microsoft 365 and your rent roll, and what they never touch

The flows can leave a letter on the desk for signing. They cannot post it, and they cannot open the trust account. They read each tenancy’s paid-to date and its stop conditions, write the four lists, send the ordinary messages, and draft a notice that waits for a named person to release it. They never record or reverse a payment, never apply a fee, never serve a notice on a timer, and never message a tenant whose position they have not just re-read. Nothing is written to the ledger.

What each connection is for.

- **SharePoint, the one site.** Rules, Positions, StopConditions and Messages. The flows read and write rows there and nowhere else.
- **The rent roll, read.** Flow 1’s paid-to dates from PropertyMe, Console Cloud or PropertyTree, through the platform’s own integration route by a custom connector or the HTTP action (both premium in Power Automate). Where the platform offers you no route, the daily arrears report export dropped into a library does the same job, read once a day.
- **Tenancy notes and flags, read.** For the stop conditions Flow 4 re-reads before every message: an arrangement, hardship, a dispute, a notice already issued.
- **One shared mailbox, send.** Flow 4’s ordinary messages, from an address the agency owns, so what went out is in one place.
- **Approvals.** The notice, released only by a response from the approver group you decided on in section 1.
- **An Office Voice key with “Queue calls”, if you hand the short list over for calls.** Made at /app/keys in Office Voice and called from a flow over its MCP endpoint with the HTTP action. One governed call per tenant; Office Voice checks the Do Not Call Register and calling hours before it dials. Leave the key out and the build stops at the list.

Least privilege, as steps.

1. Own the four flows with a service account, not a property manager who might leave, with a named co-owner.
2. Build them in one solution on connection references, so the rent roll, SharePoint, mailbox and Approvals connections are each one place to change.
3. Make the service account a member of the one site and no other. Any app registration gets Sites.Selected on that one site.
4. Give it Send As on the one shared mailbox. If an app registration sends instead, scope it to that mailbox with an Exchange application access policy or RBAC for Applications.
5. Give the rent roll connection read access only, on its own key or app connection. On the Office Voice key, tick “Queue calls” and nothing else.

How to cut it off. Turn off the flows in the solution and nothing more is sent. Revoke the build’s key or app connection in your property platform, and delete its Office Voice key on the Keys page in Office Voice. None of these touches the lists, so the record of what was and was not sent stays. The other switches are in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

Why not run the flows on a property manager’s own platform login? It is quicker to set up and it can do everything that person can: receipt, reverse, apply a fee, change a tenancy. Those are the things this build must never do, and the flows stop working the day that person leaves. A read-only key of the build’s own, owned by the service account, has neither problem.

## 7. The order to build it in

1. Create the four lists. Index TenancyRef on all of them.
2. Load Rules for one jurisdiction, with two versions of one step so the effective-date logic has something to choose between.
3. Build Flow 1. Put AsOf on every view before anybody sees a figure.
4. Build Flow 4 with its guard, before Flow 2 and Flow 3. Nothing should be able to send before the thing that stops sending exists.
5. Create the approver group and confirm a notice cannot be sent without a response from it.
6. Build Flow 2, in the standard’s order, then Flow 3.
7. Connect Power BI. Put the two must-be-zero measures on the front page and alert on both.
8. Run the pass test.

## 8. Four traps specific to this build

### Hardcoding one state's periods

The periods differ by jurisdiction and they change. A flow with a literal number of days in it is correct in one state until the day it is not, and nothing about it will announce that. Put the periods in a Rules list with EffectiveFrom, exactly as the compliance calendar does.

### A cached arrears figure

The standard says the position is derived on read and never cached. SharePoint stores, so the honest compromise is a stamped refresh with the stamp visible everywhere. What you must not do is let a figure from Monday reach a message on Thursday.

### The stop check evaluated once at the start of a run

A sequence that checks stop conditions when it begins and then sends four messages over ten days is not implementing this standard. The person's circumstances are exactly what changes in those ten days.

### Approval as a notification

An adaptive card that says a notice is about to go, with a cancel button, is not an approval. The send must not happen unless somebody actively approved, which means the send action is downstream of the approval outcome, not racing it.

## 9. Where the automation stops

- Issuing any notice with legal effect. Drafted by a flow, released by a named person, always.
- Deciding that a tenancy moves to a statutory path. The triage proposes it; a property manager owns it.
- Clearing a stop condition, particularly hardship or vulnerability.
- Anything at a tribunal. The system supplies the record and stops there.
- Interpreting the legislation for your state. The Rules list is loaded by somebody who knows, and a wrong load looks exactly like a right one.

**The pass test.** Two staged checks on test data. First, take a tenancy in the statutory path and add a live StopConditions row with reason hardship, then let the message flow run. No message may be sent, and a Messages row must appear with SentAt blank and Blocked naming the condition. Second, change a rule’s DaysAfter and give the change an effective date: every NextLawfulDate derived from it must move, and each row must still carry the RuleVersion that produced the old one. If the first sends, the stop check is running once per run rather than per message. If the second needs anyone to retype a date, the clock is stored rather than derived, and it will be wrong the first time the legislation moves.

## Related reading

- The platform holds the money, not the work
- The rent arrears build standard
- The compliance calendar on Microsoft 365
- Building the standards on Microsoft 365

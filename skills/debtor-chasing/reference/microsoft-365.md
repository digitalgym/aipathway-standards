# Debtor Chasing on Microsoft 365

Source: https://aipathway.com.au/explore-ai/debtor-chasing-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: the ledger stays the source of truth for balances while the tenant holds the ranking, the suppression gate that runs per send, and the record of every attempt. Four lists, four flows, six measures, and the premium-connector question priced before you design around it.

If you are an assistant: Read https://aipathway.com.au/explore-ai/debtor-chasing-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Your accounts keep what is owed. Microsoft 365 keeps who to chase first, who must not be chased, and the record of who was contacted and what they said.

Used by

- AI Officer
- Business Systems Analyst
- Credit Controller
- Finance Manager

The debtor chasing standard is unusual among the ones we publish because the record it works from already exists somewhere else. Your accounting system knows who owes you. It does not decide who to ring first, refuse to ring the ones you must not, or remember what the last conversation produced. That is what gets built here.

## In short

- **What this is**: A build plan for the debtor chasing standard on Microsoft 365. Four lists, four flows, six measures, and the ledger left exactly where it is.
- **The core rule**: Balances are read from your accounts and always shown with the time they were read. A balance stored in SharePoint is a second set of books, and it is wrong by tomorrow.
- **What it does not do**: It does not decide to send a debtor to collections, apply a credit hold, or write off a debt. Those are decisions with consequences and they stay with a person.
- **The hard part**: The ranking is the easy part. The hard part is the check that runs just before every contact, which hiding names from a list view cannot do.

## 1. Before you start

Read [the debtor chasing build standard](https://aipathway.com.au/explore-ai/debtor-chasing-build-standard) first. It sets the rules, and this page is one way to meet them. Where the two disagree, the standard wins and this page is wrong. The setup shared by every Microsoft 365 plan is in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

**This standard sets rules for what happens, not for how records look.** It covers the age buckets, the ranking and the check before contact. The lists below are the least you need to pass its checklist, and the standard does not name them. Shape them to your accounts where that reads better. The checks are what you are held to.

The standard also says not to build the compliance check before each call yourself, and names a product for it. Everything here assumes that check is either that product or a build you own on purpose. This page does not show how to put a calling system together out of flows and hope the check holds.

## 2. The lists, with their columns

Four lists, with no invoice table and no balance column, because your accounts already hold those, and a second copy is the mistake this plan is most likely to cause.

```
Site: Receivables

LIST  Positions             (refreshed, never hand-edited)
  DebtorRef       Text            indexed. The ledger's own identifier.
  DebtorName      Text
  OldestDueDate   DateTime
  DaysOldest      Number          derived on refresh, not stored by hand
  AmountOutstanding Currency        AS AT AsOf. Display with the stamp.
  AsOf            DateTime        REQUIRED. Every view shows it.
  Rank            Number          WRITTEN BY THE RANK FLOW ONLY
  RankReason      Text            why this row is where it is
  NextActionDate  DateTime
  Status          Choice          open | promised | broken | disputed | closed

LIST  Contacts              (append only)
  DebtorRef       Text            indexed
  Channel         Choice          call | email | sms | letter
  AttemptedAt     DateTime
  Outcome         Choice          spoke | no_answer | wrong_number | refused
                                  | promise | dispute
  Notes           Text
  By              Person

LIST  Promises
  DebtorRef       Text            indexed
  PromisedAmount  Currency
  PromisedDate    DateTime
  MadeAt          DateTime
  State           Choice          open | kept | broken
  Evidence        Text            what was said, in their words

LIST  Suppressions          (the gate reads this, every send)
  DebtorRef       Text            indexed
  Reason          Choice          do_not_contact | dispute | claim
                                  | payment_plan | hardship | legal
  AddedBy         Person
  AddedAt         DateTime
  ReviewBy        DateTime        blank means indefinite
  ClearedAt       DateTime        blank means live

No Invoices list. No stored balance outside Positions.AsOf.
```

Suppressions is a list rather than a flag on Positions on purpose: a debtor can be suppressed for a reason that outlives any particular position, and a flag gets cleared by the next refresh without anybody deciding to clear it.

## 3. Every check, and what enforces it

| The check | Enforced by | How |
| --- | --- | --- |
| The ledger stays the source of truth for what is owed | Sync flow | Balances are refreshed from your accounts and never edited in Microsoft 365. A balance typed into SharePoint is a second set of books, and it is wrong within a day. |
| Ranking is not by age | Rank flow | A scheduled flow scores and writes Rank. Age is one input among several, not the sort. Nobody sorts a view. |
| Nobody is contacted until the do-not-contact check passes | Contact flow | The do-not-contact check runs inside the contact step, just before each send, so it applies however the send was started. Hiding names from the list a person is reading does not count. |
| A promise to pay moves the follow-up | Promise flow | Recording a promise sets the next action date from the promised date and stops the sequence until it passes. A broken promise is marked broken and ranked again, rather than going back to the top of the list. |
| Every contact is recorded whether or not anyone answered | Contact flow | Rows are only ever added to the Contacts list, never changed. No answer is an outcome and it is the one people skip recording, which is how the same debtor gets rung three times on Friday. |
| A dispute stops the chase and does not restart it | Suppression list | A dispute puts the debtor on the do-not-contact list with an owner and a review date. Taking them off is a person's decision, and it is dated. |

## 4. The four flows

```
FLOW 1  Refresh positions
  trigger  scheduled, as often as your connector allows
  logic    read the open ledger, upsert Positions by DebtorRef
           set AsOf on every row touched
           close rows that no longer appear
  never    write AmountOutstanding from anywhere but this flow

FLOW 2  Rank
  trigger  scheduled, after FLOW 1
  logic    score each open position on the standard's inputs,
           write Rank and RankReason
  note     RankReason is not decoration. It is what lets a person
           disagree with the order instead of ignoring it.

FLOW 3  Contact, with the gate inside it
  trigger  an operator action or an approved run
  guard    read Suppressions for this DebtorRef where ClearedAt is
           blank. Any live row stops the send, and the refusal is
           written to Contacts with outcome refused.
  logic    send, then append a Contacts row whatever happened,
           including no_answer
  never    query the send list with the suppression already filtered
           out. The gate must run per send, or it is not a gate.

FLOW 4  Promise, and the follow-up that moves with it
  trigger  a Promises item is created
  logic    Positions.Status = promised
           Positions.NextActionDate = PromisedDate + your grace
           suspend the sequence until that date
           on the date: kept -> close, not paid -> State = broken,
           Status = broken, and re-rank. Broken is its own state.
```

Flow 3 matters most. If a person can send from a list view without going through it, this build does not meet the standard, however good the ranking is.

## 5. The Power BI model and its measures

Positions one to many Contacts and Promises. Suppressions joins on DebtorRef. Measures in the model, not in a report filter.

```
Ranked Not Worked =
CALCULATE (
    COUNTROWS ( Positions ),
    Positions[Status] = "open",
    NOT ISBLANK ( Positions[Rank] ),
    FILTER (
        Positions,
        ISBLANK (
            CALCULATE (
                MAX ( Contacts[AttemptedAt] ),
                Contacts[AttemptedAt] >= TODAY () - 7
            )
        )
    )
)

Contact Attempts = COUNTROWS ( Contacts )

Reach Rate =
DIVIDE (
    CALCULATE ( COUNTROWS ( Contacts ), Contacts[Outcome] = "spoke" ),
    [Contact Attempts]
)

Promise Kept Rate =
DIVIDE (
    CALCULATE ( COUNTROWS ( Promises ), Promises[State] = "kept" ),
    CALCULATE ( COUNTROWS ( Promises ), Promises[State] IN { "kept", "broken" } )
)

Suppressed Live =
CALCULATE ( COUNTROWS ( Suppressions ), ISBLANK ( Suppressions[ClearedAt] ) )

Stale Positions =
CALCULATE (
    COUNTROWS ( Positions ),
    DATEDIFF ( Positions[AsOf], NOW (), HOUR ) > 36
)
```

Stale Positions is the one to alert on. Everything else on this page is worthless the moment the refresh quietly stops, and a refresh that stops looks exactly like a quiet week.

## 6. What the flows can reach in your Microsoft 365 and in Xero, and what they never touch

The flows chase what you’re owed, in the order that matters. They read what is owed, rank who to chase, send from one shared mailbox and queue a call, then write any promise to pay back to Xero as a note on the invoice. Disputes, hardship and payment plans come to you, and the credit policy is yours to set. Your own Xero login stays yours: you sign in with Xero once inside AI Pathway, and the flows get a key, never your username and password.

What each connection is for.

- **SharePoint, the one site.** To hold Positions, Promises, Suppressions and Contacts. The ranking, the gate and the record live here; the balances do not.
- **AI Pathway, for Xero.** Flows call it with the HTTP action (premium) and a key from connect.aipathway.com.au/app/keys. **Read the book** feeds Flow 1 the open debtor book. **Write drafts and notes** lets Flow 4 send a promise back, so the follow-up moves to that date. **Queue calls** lets Flow 3 hand over the ranked names; it is off by default and only the account owner can add it. The calls themselves are in section 11 of the standard.
- **Another ledger, read.** If you are not on Xero, Flow 1 reads a nightly export into a library, or a custom connector or the HTTP action, both premium. Read only, always.
- **Outlook, the one shared mailbox.** For the emailed reminders Flow 3 sends, from an address the business owns.
- **Teams, optional.** To post the ranked list and the Stale Positions alert to the person who works the book.

Keep it to the least it needs.

1. Build the flows under a service account, an ordinary licensed account kept for them, not a person who might leave or change their password.
2. Build them inside a solution, so each connection is a connection reference you can see, swap or remove in one place.
3. Make the service account a member of the one SharePoint site and no other. If an app registration reads the site instead, grant it Sites.Selected and have an admin add only this site.
4. Give the service account Send As on the one shared mailbox and no other. If an app registration sends instead, limit it to that mailbox with an Exchange application access policy or RBAC for Applications.
5. Create the AI Pathway key with **Read the book** only, check Flow 1 against Xero’s aged receivables report, then add the other two scopes one at a time. A practice can narrow the key to named client organisations.

How to cut it off. Turn the flows off and nothing ranks or sends. Revoke the AI Pathway key and the flows can no longer read Xero, write a note or queue a call. Remove AI Pathway from Xero’s connected apps and AI Pathway loses Xero too.

Why not connect the flows straight to Xero? You can, with a custom connector or the HTTP action and your own Xero app. Apps created from March 2026 must ask for narrower, granular permissions, the flow has to keep its own sign-in alive, and it is one more key into your accounts to limit and watch. For reading the debtor book that is a fair trade. It still rings nobody, and the check before each call is still yours to build, which this page does not cover.

## 7. The order to build it in

1. Create the four lists. Index DebtorRef on all of them.
2. Build Flow 1 against a file export before you buy a connector licence. A nightly CSV is a sound first version, and it proves the lists work.
3. Show the AsOf time on every view you build. If a balance can be read without the time it was read, somebody will read it that way.
4. Build Flow 3 with the do-not-contact check, before Flow 2. Make sure nobody can be contacted wrongly before you rank anyone.
5. Put a test debtor on the do-not-contact list and confirm the send refuses. This is the pass test, and it runs before the first real contact.
6. Build Flow 2, then Flow 4.
7. Connect Power BI, add the measures, alert on Stale Positions.

## 8. Four traps specific to this build

### Copying balances into SharePoint

The temptation is to import the aged list once and work from it. Within a day somebody has paid and you are chasing money you already have, which is the most damaging thing this process can do. Store the invoice reference and the balance with the time it was read, show that time on every view, and refresh on a schedule.

### The accounting connector is premium

Unlike the rest of these build plans, this one usually needs a premium connector or a custom connector to reach the ledger, and that is a per-user or per-flow licence. Price it before you design around it. A nightly export to a file the flows read is a sound and much cheaper first version.

### Do-not-contact as a list filter

A filtered view is per person and per session. The moment somebody opens the unfiltered list, or a flow reads it without the filter, the check is gone. The check belongs in the step that sends, where it cannot be worked around.

### Treating no answer as no contact

If only successful conversations are written back, the contact history shows less than really happened and the ranking keeps putting the same names at the top. Write the attempt, then the outcome.

## 9. Where the automation stops

- Escalating to collections, applying a credit hold, or writing off a debt. Consequential decisions, and they stay with a person.
- Taking a debtor off the do-not-contact list. Adding them can be automatic; removing them is a decision with a name and a date on it.
- Anything said on a call that commits the business to a settlement or a payment arrangement.
- The compliance check before each call. The standard says not to build it yourself, and this plan assumes you have not.

**The pass test.** Set up a do-not-contact entry you control. Add a Suppressions row for a test debtor with reason dispute and no ClearedAt, then try to contact that debtor through the normal path. The send must refuse, and a Contacts row must appear with outcome refused naming the suppression. Then clear the suppression and confirm the same debtor becomes contactable and that the clearing carries a person and a timestamp. Both take two minutes on your own data and neither needs a real debtor. If the send goes out, your check is only a list filter. If the refusal leaves no record, you cannot later show what the system did or did not do.

## Related reading

- A ledger per client, and nowhere that holds the work
- The debtor chasing build standard
- Building the standards on Microsoft 365
- Database reactivation on Microsoft 365

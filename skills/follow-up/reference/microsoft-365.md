# Follow-Up on Microsoft 365

Source: https://aipathway.com.au/explore-ai/follow-up-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: the arrival read before anything is ranked, a cap and a gap that live in a list, and a measure whose only acceptable value is zero.

If you are an assistant: Read https://aipathway.com.au/explore-ai/follow-up-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Chasing the quote nobody answered is four list lookups in the right order. Read the arrival first, before the ranking, before the message is composed, or you will text somebody the morning after they signed.

Used by

- AI Officer
- Business Systems Analyst
- Office Manager

Reminders are the easy half and every tool ships them. The standard is about the stop: the signed variation came back on Tuesday and the third text has to not go out on Wednesday. In a scheduled Power Automate flow that is a question of what you read first, because the obvious shape is to rank the list, build the message, then check whether to send. By then the message exists, and a message that exists is one action away from going.

## In short

- **What this is**: A build plan for the follow-up standard on Microsoft 365. Six lists, two libraries, four flows, six measures, and the call left where the standard puts it.
- **The core rule**: The chase run opens by reading Arrivals and dropping those items from the set. Not as a condition before the send: as the first thing the flow does, before anything is ranked or composed.
- **What it does not do**: Microsoft 365 sends email. It does not send a text and it does not place a disclosed, recorded call. The standard names the call as the hosted step, and this plan does not pretend a flow can be one.
- **The hard part**: Knowing the document came back when it landed somewhere the tenant does not watch, and keeping the cap and the gap in a list a person can edit rather than in a flow only the builder can open.

## 1. Before you start

Read [the follow-up build standard](https://aipathway.com.au/explore-ai/follow-up-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide one thing first: where an arrival lands. The whole standard turns on stopping the moment the thing comes back, and the tenant can only stop on an arrival it can see. A signed variation emailed to the estimator’s own address, a certificate uploaded to the builder’s portal, a PO number read out on the phone: each of those is an arrival this build will miss, and the next touch goes out the day after. Pick one library, one mailbox or one button a person presses, say so out loud to the people who receive these things, and only then write the cadence. Getting this wrong does not degrade the build gracefully. It makes it worse than no chasing at all.

Second, read what the standard puts out of scope before you size this. Money that is late is the debtor chasing standard and it has its own plan. If the thing owed is a dollar amount on an invoice, you are on the wrong page. And check your cadence against what this stack can send: Outlook sends the email, and nothing here sends a text or makes a call.

## 2. The lists, with their columns

```
Site: FollowUp

LIST  OpenItems             (the register. One row per thing owed.)
  ItemRef         Text            indexed, UNIQUE
  Kind            Choice          quote_decision | signed_variation
                                  | certificate | po_number | form
                                  FILL-IN CHOICES OFF. The list is closed.
  RecordRef       Text            indexed. The quote, job or invoice.
  OwedBy          Text            indexed. The contact id.
  ValueAtRisk     Currency        what the record holds up. An amount, never a priority score.
  OpenedAt        DateTime
  Due             DateTime
  Status          Choice          open | arrived | declined | escalated
  WeOwe           Text            blank unless the ball is with us. Any value stops the chase.
  WeOweClearedBy  Person          only a person writes this
  Rank            Number          WRITTEN BY THE RANK FLOW ONLY
  RankReason      Text            the amount and the days, in words

LIST  Cadences              (a person writes this, once per kind)
  Kind            Choice          indexed, UNIQUE. quote_decision
                                  | signed_variation | certificate | po_number | form
                                  One row per kind.
  MaxTouches      Number          the cap
  SpacingHours    Number          the gap
  Channels        Text            in preference order, e.g. "email, call"
  EscalateTo      Person          the name at the end of the cadence

LIST  Consent               (read from the contact record)
  ContactRef      Text            indexed
  Channel         Choice          email | sms | call
  GivenAt         DateTime

LIST  Touches               (append only. The cap counts these.)
  ItemRef         Text            indexed
  Channel         Choice          email | sms | call
  At              DateTime
  TouchNumber     Number          1..MaxTouches
  GateReason      Text            why the gate allowed this one
  SentRef         Hyperlink       into Sent

LIST  Outcomes              (the answer, never a transcript)
  ItemRef         Text            indexed
  Kind            Choice          date | decision | declined | dispute
  Value           Text            a real date, or the decision. Not a paragraph. See the pass test.
  RecordedAt      DateTime
  RecordedBy      Person          blank when the hosted call recorded it

LIST  Arrivals              (the stop)
  ItemRef         Text            indexed, UNIQUE
  At              DateTime
  EvidenceRef     Hyperlink       into Arrived
  MarkedBy        Person          blank when a file landing set it

LIBRARY  Arrived                  the signed document, the form, the PO
LIBRARY  Sent                     the exact words of every touch
```

Arrivals is a separate list with a unique key rather than a date column on OpenItems, for one reason: the chase run reads it as its very first action, and a small list it can pull whole is cheap to read on every run. A status column on the register would be read at the same time as everything else, which is late enough to have already composed the message.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Every thing owed is an open item with a kind, a record, a person and a due date | OpenItems list | Four required columns and a closed Choice for Kind. The run reads this list and nothing else, so the note somebody typed saying chase Bob about the thing is not a row and is never touched. |
| The chase order is value at risk, then days open, never age alone | Rank flow | A scheduled flow writes Rank and RankReason onto the row. ValueAtRisk is Currency because the ranking is an amount off the record, not a number somebody assigned. |
| When the item arrives, the chase stops that run | Arrivals, read first | The run pulls Arrivals before it ranks anything. An arrived item is out of the set, so the reminder is never composed, let alone sent. This is an ordering rule, not a condition. |
| Touches per item are capped and spaced, on a written cadence | Cadences list | The gate counts Touches for the item and compares against MaxTouches and SpacingHours read from the item's kind. The numbers live in a list a person edits, never in an expression inside the flow. |
| A message goes only on a channel the contact has consented to | Consent list | The gate filters Consent by contact and channel before a channel is picked, and falls through to the next channel in the Cadences row. A contact with email consent only is emailed. |
| No touch goes out while the ball is with the business | WeOwe column | Any value in WeOwe drops the item from the run. Only a person clears it, and WeOweClearedBy records who, because the flow has no step that writes to either column. |
| A no, a dispute, or stop contacting me ends the chase and goes to a person | Outcomes + Status | Recording declined or dispute sets Status away from open and escalates. Nothing in this build sets Status back to open, so there is no path that re-asks. |
| An item still open at the cap goes to a named person with its history, not into a longer loop | Escalate step | At MaxTouches the run writes Status escalated, posts every Touch row to the person in EscalateTo, and stops. There is no second cadence to be put on, because Cadences holds one row per kind. |

## 4. The four flows

```
FLOW 1  Rank
  trigger  scheduled, early. Before the run.
  logic    for each OpenItems row with Status = open:
             write Rank from ValueAtRisk descending, days open as the tie
             write RankReason in words: the amount, then the days
  never    leave the order to a view. A sort is per person and gone
           the moment somebody else opens the list.

FLOW 2  The run
  trigger  scheduled, once a day, after FLOW 1
  logic    READ Arrivals FIRST. Any item with a row:
             set Status = arrived, and drop it from this run entirely.
           then, in Rank order, for each remaining item:
             Status not open           -> skip
             WeOwe not blank           -> skip, no message is built
             Touches count >= MaxTouches
                                       -> escalate once to EscalateTo with
                                          every Touch attached,
                                          Status = escalated, skip
             last Touch within SpacingHours
                                       -> skip
             pick the first channel in Cadences with a Consent row
               email -> CREATE the Touch row, then send, then write SentRef
               call  -> hand the item to the hosted step. This flow
                        does not dial, disclose or record.
               sms   -> nothing in this stack sends one. See the traps.
  never    compose before the gate. A drafted reminder held in a
           variable is one action away from going out on a rerun.

FLOW 3  Arrival
  trigger  a file is created in Arrived, or a person marks an item arrived
  logic    create the Arrivals row with the evidence link and the time
           set OpenItems.Status = arrived
  never    delete the Touches. What was sent, and when, is the record
           the customer will ask about.

FLOW 4  Outcome in
  trigger  an operator action, or the hosted call returning an answer
  logic    write the Outcomes row: kind, and a date or a decision
           declined or dispute -> Status, escalate to EscalateTo, notify
           date                -> leave Status open. The gap still applies.
  never    write a transcript into Value. If what came back is a
           paragraph, somebody has to turn it into a date first.
```

Flow 2 reads three lists before it reads the item it is about to touch, which feels wasteful and is the entire design. Every one of those reads is a reason not to send, and the standard is a list of reasons not to send with a reminder at the end of it.

## 5. The Power BI model and its measures

```
Touched After Arrival =              -- must be zero. The whole standard.
COUNTROWS (
    FILTER (
        Touches,
        VAR Ref = Touches[ItemRef]
        VAR ArrivedAt =
            CALCULATE (
                MIN ( Arrivals[At] ),
                ALL ( Arrivals ),
                Arrivals[ItemRef] = Ref
            )
        RETURN NOT ISBLANK ( ArrivedAt ) && Touches[At] > ArrivedAt
    )
)

Over Cap =                           -- must be zero
COUNTROWS (
    FILTER (
        OpenItems,
        CALCULATE ( COUNTROWS ( Touches ) )
            > RELATED ( Cadences[MaxTouches] )
    )
)

Value At Risk Open =
CALCULATE (
    SUM ( OpenItems[ValueAtRisk] ),
    OpenItems[Status] = "open"
)

Blocked By Us =                      -- we owe them first
CALCULATE (
    COUNTROWS ( OpenItems ),
    NOT ISBLANK ( OpenItems[WeOwe] )
)

Calls Without An Outcome =           -- a call that ended in a transcript
VAR Answered = VALUES ( Outcomes[ItemRef] )
RETURN
COUNTROWS (
    FILTER (
        Touches,
        Touches[Channel] = "call"
            && NOT ( Touches[ItemRef] IN Answered )
    )
)

Days To Arrive =
AVERAGEX (
    FILTER ( OpenItems, OpenItems[Status] = "arrived" ),
    DATEDIFF (
        OpenItems[OpenedAt],
        CALCULATE ( MIN ( Arrivals[At] ) ),
        DAY
    )
)
```

Touched After Arrival is the measure this plan exists to make possible, and the only acceptable reading is zero. Put it on the front page beside Value At Risk Open, because the second number is what the business will look at and the first is what tells you whether the second can be trusted.

## 6. The order to build it in

1. Settle where arrivals land, and tell the people who send these things back. Nothing below is safe to run until that is decided.
2. Create the six lists and two libraries. Turn on enforce unique values for OpenItems.ItemRef and Arrivals.ItemRef before any rows exist.
3. Fill Cadences by hand, one row per kind you actually chase, with a real person in EscalateTo. Leave the cadences short. You can lengthen them later; you cannot unsend.
4. Load the register from real open items with real amounts in ValueAtRisk. A register of test rows proves nothing about whether the ranking is sane.
5. Build Flow 3 before Flow 2. The stop has to exist before the chase does, and a half-built version that only records arrivals is already useful to somebody.
6. Build Flow 1, and read the RankReason column on the top ten rows. If the order looks wrong to the person who chases these by hand, fix it now.
7. Build Flow 2, but with the send step replaced by a write to the Sent library. Run it for a week against the real register and read what it would have sent.
8. Turn the send on, add Flow 4, then connect Power BI. Touched After Arrival goes on the front page.

## 7. Four traps specific to this build

### There is no text message in this stack

Microsoft 365 sends email. It does not send SMS. If a Cadences row names sms as a channel, the run has nothing to call, and the shapes it fails into are both bad: a skipped touch that quietly burns a slot in the cadence, or a Touch row with Channel sms that nothing actually sent, which the cap then counts against an item nobody ever contacted. Either drop sms from the Channels column, or put the send outside the tenant and have it write the Touch row back, and never let the flow write a Touch it did not cause.

### The arrival the tenant cannot see

The stop only works on arrivals that land where the build is watching. A variation signed in the customer's own portal, a certificate emailed to somebody's personal address, a PO number given over the phone and written on a pad: each of those is an arrival that will not reach Arrivals, and the reminder goes out the morning after. This is the one failure the standard is named for. The fix is not technical: it is deciding on one destination and saying so, then having Flow 3 watch that one place.

### Composing the message before the gate

The natural flow shape is: get the item, build the email, then decide whether to send it. Every rerun, resubmit and retry of that flow run rebuilds and resends. Read the arrival, the WeOwe, the count and the gap first, create the Touch row, and only then compose from the row you just created. The row is the record that a touch happened, so it has to exist before the touch does.

### The cap and the gap living in the flow

Three touches, forty-eight hours apart is two numbers, and they will end up as literals in a condition because that is the shortest way to write it. Then the cadence belongs to whoever can open the flow, and the standard's line about a person writing it down once becomes a line in a version history. Read MaxTouches and SpacingHours from the Cadences row every run. The person who owns the chase should be able to change it without opening Power Automate.

## 8. Where the automation stops

- The call itself. The standard names it as the hosted step, with the disclosure, the recording, calling hours, and the lawful basis recorded on every dial (existing-customer follow-up), with a wash against the Do Not Call Register for any number that has none, under it. The quote call always carries that basis, so no wash has run on these calls. None of those is a thing a flow does, and this plan does not show you how to assemble one out of flows and hope.
- The no, and anything disputed. Whether to ring back, revise the quote or let it go is a conversation, and the customer who says they never agreed to the variation gets a person rather than a third email.
- Any discount, extension or concession offered to get an answer. There is no step anywhere in this build that offers one, which is deliberate and worth checking after anybody edits Flow 2.
- Clearing WeOwe. Only a person can say the business has done its part, and WeOweClearedBy records who and when.
- Writing the cadence, and closing an item at the cap. The run escalates once to a named person; deciding to drop the item is theirs.

**The pass test.** Stage one real item. Put a signed variation on the register with its actual value at risk, a contact whose only Consent row is email, and a Cadences row of three touches forty-eight hours apart. Let the run make the first touch. Then, before the second is due, drop the signed PDF into the Arrived library and run the chase twice more. You must end with exactly one Touches row, an Arrivals row carrying the link to that PDF, Status reading arrived, and Touched After Arrival reading zero. A few days of real running, and the only work is watching. If a second touch went out, the run ranked or composed before it read Arrivals, and the customer has been reminded about something they already signed, which is the exact failure the standard exists for. If the first touch went out by text, something outside the tenant sent it and the Consent rows are decorative. If the Outcomes row from that item holds a sentence rather than a date or a decision, the call step is writing transcripts and nobody will read them on Friday.

## Related reading

- the follow-up build standard
- Debtor chasing on Microsoft 365: when the thing owed is money
- The Quote Out Build Standard: the quote this chases
- The paper: following up quotes for trades
- Building the standards on Microsoft 365

# After Hours on Microsoft 365

Source: https://aipathway.com.au/explore-ai/after-hours-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the half of the after-hours standard that runs in your own tenant: the outcome object, the fixed taxonomy, one job, one alert, and a typed escalation queue.

If you are an assistant: Read https://aipathway.com.au/explore-ai/after-hours-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Microsoft 365 cannot answer a phone, and no amount of flow building changes that. It can hold everything the call produces, which is the half that decides whether anyone trusts the other half.

Used by

- Business Systems Analyst
- Office Manager
- Operations Manager

Section 8 of the standard splits this build three ways and the split is not commercial, it is regulatory. The number, the disclosure, the recording and the consent ledger are the live step, and the standard marks that step not self-hostable. The system of record is whatever job system already runs. The board, the queue and the reporting are yours, and this plan is that third part. Build it and you own the evidence that the other two are behaving.

## In short

- **What this is**: A build plan for the half of the after-hours standard that runs in your own tenant. Six lists, four flows, seven measures, and no telephony of any kind.
- **The core rule**: One job, one alert, and the guard is a row in a list. A flow that remembers nothing wakes your on-call twice when the frightened customer rings back.
- **What it does not do**: The number, the disclosure, the recording and the consent stamp happen before this stack sees anything. What arrives is the outcome object.
- **The hard part**: Two of the checks are legal obligations discharged on the call. You can count them from here. You cannot enforce them from here, and the plan says so rather than pretending.

## 1. Before you start

Read [the booked after hours build standard](https://aipathway.com.au/explore-ai/booked-after-hours-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Read section 8 of the standard before anything else, because it decides what this page can honestly claim. The AU number, the AI disclosure, the recording notice, the consent timestamp and the calling-hours gate are the live step, and the standard states that step is not self-hostable. Nothing below answers a phone. If you were expecting the lists to do that, stop here.

Then decide the one thing that changes the schema. If a job system already holds the work, Jobs below is a mirror keyed on that system’s own id and the ExternalId column is the id it returned. If there is no usable job system, Jobs is where the job actually lives and ExternalId is its own key. Both are in the standard: ServiceM8 has a real API, Tradify has an enquiries channel and nothing readable back, and anything else is an outcome object delivered by email or webhook with the last step honestly manual. Pick one before you build, because the dedup read in Flow 2 is written against whichever you picked.

## 2. The lists, with their columns

```
Site: AfterHours

LIST  Calls                 (the outcome object, one row per call)
  CallId          Text            indexed
  ReceivedAt      DateTime        with a timezone, not server local
  CallerNumber    Text            indexed. E.164.
  DisclosureAt    DateTime        blank is a compliance question, not a gap
  RecordingConsentAt DateTime
  SmsConsentAt    DateTime        blank means nothing may be handed out
  ProblemVerbatim Text            the caller's words. Written once, never edited by a flow.
  Classification  Choice          emergency | routine | quote | unclassified
  AddressSpoken   Text            what was heard. A query, not a value.
  AddressResolved Text            what the lookup returned
  AddressConfidence Choice          high | low | none
  Outcome         Choice          booked | escalated | out_of_area | abandoned
  TranscriptUri   Hyperlink       a link out. The recording is not held here.

LIST  Jobs
  JobRef          Text            indexed
  CallId          Text            indexed
  System          Choice          servicem8 | tradify_enquiry | email | none
  ExternalId      Text            blank is a failure to write, never a pass
  DuplicateOf     Text
  Address         Text            the RESOLVED value. Nothing writes here from AddressSpoken.
  Type            Choice          emergency | routine | quote
  WrittenAt       DateTime

LIST  Escalations
  CallId          Text            indexed
  Reason          Choice          unclassified | address_unresolved
                                  | out_of_scope_request | caller_distressed | price_requested | complaint | write_failed
  TranscriptUri   Hyperlink       REQUIRED. Nobody starts cold.
  RaisedAt        DateTime
  Owner           Person
  AcknowledgedAt  DateTime        blank means nobody has picked it up

LIST  Alerts                (the on-call ledger. This is the guard.)
  JobRef          Text            indexed
  SentAt          DateTime
  SentTo          Person
  Channel         Text

LIST  EmergencyTriggers     (your team's list, not a model's judgement)
  Trigger         Text            indexed. active water, no power, gas, sewage, security, a stated safety risk
  AgreedBy        Person
  AgreedAt        DateTime

LIST  ServiceArea
  Locality        Text            indexed
  Postcode        Text
  InArea          Boolean         absent from this list is out of area

Six lists and no recording anywhere in them. TranscriptUri points out.
```

Calls holds ProblemVerbatim and Jobs holds the classification, which looks like duplication and is not. The verbatim is captured before anything classifies it, so it belongs to the call. The type belongs to the job, because the job is what gets dispatched and what a second call about the same problem updates.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Disclosure and the recording notice happen before the first question | Measure, not a gate | The call is not in Microsoft 365, so nothing here can enforce it. DisclosureAt and RecordingConsentAt arrive on the outcome object and a must-be-zero measure counts calls without them. That is auditing the obligation, not holding it, and the difference matters. |
| No free text reaches the job system | Choice columns | Classification carries the four values and Jobs.Type the three. There is no fifth to write, and an unclassified call produces no Jobs row at all. |
| The resolved value is read back, confirmed, and is what gets written | Intake flow | Jobs.Address copies from AddressResolved and no branch anywhere reads AddressSpoken. Confidence below high writes no job and raises address_unresolved instead. |
| Out-of-area calls are told so and create no job | ServiceArea list | The resolved locality is looked up before the Jobs row exists. Absent from the list is out of area, because a radius calculated in a flow is a guess with arithmetic on it. |
| An open job on the same number or address is updated, not duplicated | Intake flow | A read of Jobs on CallerNumber and Address inside the window runs before any create, and a match writes DuplicateOf. The common case is one panicking person ringing twice in ten minutes. |
| A null external id raises an alert and is never reported as a completed call | Intake flow | Outcome cannot be set to booked in any branch where ExternalId is blank. The failing branch writes escalated and an Escalations row with reason write_failed. |
| Only an emergency alerts a person, and only once per job | Alerts list | The notify step reads Alerts for a row on that JobRef before it posts anything. The ledger is the guard, because a flow run remembers nothing about the flow run before it. |
| Every hand-off carries a reason from the fixed list and the transcript | Choice and required column | Reason is the seven values from the standard and TranscriptUri is required, so an escalation with nothing attached cannot be saved. Counting Reason monthly is the fix-list. |

## 4. The four flows

```
FLOW 1  Take the outcome in
  trigger  an email arrives in the after-hours mailbox carrying the
           outcome object, or a request the live step posts
  logic    upsert Calls by CallId
           stamp DisclosureAt, RecordingConsentAt and SmsConsentAt
             exactly as they arrived
           a CallId that already exists is an update; a NEW call about
             the same problem is a NEW row
  never    write ProblemVerbatim over an existing value, and never
           derive Classification by reading the verbatim here.

FLOW 2  Write the job, once
  trigger  a Calls item where Outcome is blank
  logic    AddressConfidence is not high
             -> Escalations, reason address_unresolved, no Jobs row
           AddressResolved not in ServiceArea
             -> Outcome = out_of_area, no Jobs row
           read Jobs for an open row on CallerNumber or Address
             within the window
             found -> update it, write DuplicateOf, stop
           create the Jobs row, Type from Classification
             an id comes back    -> ExternalId, Outcome = booked
             nothing comes back  -> ExternalId blank,
                                    Outcome = escalated,
                                    Escalations reason write_failed
  never    set Outcome = booked anywhere ExternalId is blank.

FLOW 3  Alert on-call, once
  trigger  a Jobs item is created or modified
  guard    Type must be emergency. Everything else waits for the
             morning queue.
           read Alerts for a row on this JobRef. One exists -> stop.
  logic    post to the on-call channel with the verbatim, the
             resolved address and the job reference
           write the Alerts row in the same run
  never    trigger on the Calls list. The alert belongs to the job, so
           the second call about the same problem is the same JobRef
           and the same silence.

FLOW 4  The escalation queue
  trigger  an Escalations item is created
  logic    assign Owner from the segment, post the card with the
             transcript attached, record AcknowledgedAt when somebody
             takes it
  also     scheduled, monthly: count Escalations by Reason. The
           standard calls that distribution the best available list
           of what to fix next, so it is a report somebody reads
           rather than a chart nobody opens.
```

Flow 3 triggers on Jobs rather than Calls, and that single choice is the difference between a system people keep and one that gets switched off in a fortnight. Flow 2 can dedupe perfectly and it will not help if the alert is hanging off the call.

## 5. The Power BI model and its measures

```
Booked =
CALCULATE ( COUNTROWS ( Calls ), Calls[Outcome] = "booked" )

Booked Without An Id =                -- must be zero
CALCULATE (
    COUNTROWS ( Jobs ),
    ISBLANK ( Jobs[ExternalId] ),
    FILTER ( Calls, Calls[Outcome] = "booked" )
)

Undisclosed Calls =                   -- must be zero. Audited, not gated.
CALCULATE ( COUNTROWS ( Calls ), ISBLANK ( Calls[DisclosureAt] ) )

Unclassified Rate =
DIVIDE (
    CALCULATE ( COUNTROWS ( Calls ), Calls[Classification] = "unclassified" ),
    COUNTROWS ( Calls )
)

Address Unresolved =
CALCULATE (
    COUNTROWS ( Escalations ),
    Escalations[Reason] = "address_unresolved"
)

Second Alerts =                       -- must be zero. Trust lives here.
COUNTROWS (
    FILTER (
        SUMMARIZE ( Alerts, Alerts[JobRef], "n", COUNTROWS ( Alerts ) ),
        [n] > 1
    )
)

Escalation Mix =
CALCULATE (
    COUNTROWS ( Escalations ),
    ALLEXCEPT ( Escalations, Escalations[Reason] )
)

Unacknowledged Hours =
AVERAGEX (
    FILTER ( Escalations, ISBLANK ( Escalations[AcknowledgedAt] ) ),
    DATEDIFF ( Escalations[RaisedAt], NOW (), HOUR )
)
```

Second Alerts is the one to put on the wall. Everything else on this page describes the build; that measure describes whether the on-call person is still willing to leave their phone on, and the standard is blunt that a system paging somebody for a quote at 11pm deserves to be switched off.

## 6. The order to build it in

1. Create Calls and Escalations, and nothing downstream. Land outcome objects in them for a fortnight. What you get is a countable record of what your phone actually does at night, which most businesses are guessing about, and it costs nothing to look at before you build anything that acts.
2. Load ServiceArea, and get your own team to sign EmergencyTriggers with their names against it. The standard says the agent matches that list rather than reasoning about urgency, so the list has to exist and be agreed before anything classifies.
3. Build Flow 1. Confirm a second call from the same number produces a second Calls row with its own verbatim rather than editing the first.
4. Build Flow 4 before anything writes a job. An escalation queue with a named owner is useful on its own. A job-writing flow with nowhere to hand back to is not.
5. Build Flow 2 with the confidence check, the service-area check and the dedup read all in the first version. Adding dedup afterwards means rebuilding the trigger and re-testing everything above it.
6. Build Flow 3, and test the guard before you test the alert. Stage the second call first, confirm nothing posts, then remove the Alerts row and confirm it does.
7. Connect Power BI. Booked Without An Id, Undisclosed Calls and Second Alerts on the front page, all three alerted.
8. Run the pass test.

## 7. Four traps specific to this build

### The emergency triggers typed into a condition

EmergencyTriggers exists so a list your team signed decides what wakes somebody up. The shortcut is a condition in Flow 2 with the words in it, and it works, and it means the list is decorative. Worse, the day somebody adds a trigger to the list nothing changes and nobody finds out until a job that should have paged did not. Read the list.

### Alerting on the call instead of the job

Triggering Flow 3 on a Calls item where Classification is emergency is the natural shape and it undoes the dedup you just built. The customer rings back in ten minutes, Flow 2 correctly updates one job, and the on-call phone goes off twice. The guard has to live in a list keyed on JobRef, because nothing in a flow run knows what the last flow run did.

### Copying recordings into a document library

SharePoint is good at holding files and this is the one file not to hold. The recording, the consent ledger and the retention obligation sit with whoever holds the number, and a copy in your library is a second instance of a regulated artefact under a different retention rule with no consent record attached to it. TranscriptUri is a link out and it stays a link out.

### An upsert that eats the verbatim

Flow 1 is an upsert, which is the right shape, and it will quietly replace the caller's first panicked description with their second calmer one. The verbatim is captured before any classification for a reason: it is the only unedited thing in the record. A second call is a second Calls row against the same JobRef, never an edit of the first.

## 8. Where the automation stops

- Answering the phone. Microsoft 365 has no telephony this standard can use, and the AU number, the disclosure, the recording and the consent stamp are the live step the standard marks not self-hostable.
- Resolving the address. Nothing in this stack turns a suburb said once and unclearly into a street. What the lists do is refuse to write a job on anything the resolver was not confident about, which is the half of that check this stack can hold.
- Quoting a price. The caller asks what it will cost and it hands to a person with the transcript attached, as price_requested.
- Agreeing a variation, giving safety advice, or anything implying a licence the agent does not hold. Each is a hand-off, not a branch that tries harder.
- An upset caller, and any job the taxonomy does not fit. Both are typed escalations, and a system that cannot record not knowing will quietly guess instead.

**The pass test.** Stage two outcome objects for one caller, ten minutes apart, both describing the same burst pipe at the same in-area address, both classified emergency, the second arriving with AddressConfidence of low. Drop them in the mailbox. You must get two Calls rows each keeping its own ProblemVerbatim, exactly one Jobs row carrying the resolved address from the first with DuplicateOf set on the second pass, exactly one row in Alerts, and no second card on the on-call channel. Then stage a third for the same number classified quote: a Jobs row of type quote, and still one row in Alerts. Five minutes on test data. If two Alerts rows appear, Flow 3 is triggering on the call rather than the job, and the first frightened customer who rings back will wake your on-call twice. If the second call’s low confidence still put an address on the job, something is reading AddressSpoken. If the first row’s verbatim now reads like the second call, your upsert is overwriting the one thing in this record that nothing is allowed to edit.

## Related reading

- the booked after hours build standard
- Quotes out on Microsoft 365, which consumes the job this creates
- The compliance calendar on Microsoft 365
- Building the standards on Microsoft 365

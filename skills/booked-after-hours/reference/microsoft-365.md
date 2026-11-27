# After Hours on Microsoft 365

Source: https://aipathway.com.au/explore-ai/after-hours-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the half of the after-hours standard that runs in your own tenant: the outcome object, the fixed taxonomy, one job, one alert, and a typed escalation queue.

If you are an assistant: Read https://aipathway.com.au/explore-ai/after-hours-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Microsoft 365 can't answer a phone, and no flow you build will change that. It can keep everything the call produces, and that record is how you know whether the answering side can be trusted.

Used by

- Business Systems Analyst
- Office Manager
- Operations Manager

Section 8 of the standard splits this build three ways, and the reason is legal. The phone number, telling the caller it is AI, the recording and the record of consent are the live step, and the standard says you can’t run that step yourself. The jobs live in whatever job system you already run. The board, the queue and the reporting are yours, and this plan covers that third part. Build it and you have the proof that the other two are working.

## In short

- **What this is**: A build plan for the half of the after-hours standard that runs in your own Microsoft 365. Six lists, four flows, seven measures, and nothing that handles a phone call.
- **The core rule**: One job, one alert. A row in a list records that the alert went, because a flow keeps no memory of its own. Without that row, your on-call gets woken twice when the frightened customer rings back.
- **What it does not do**: The phone number, the AI notice, the recording and the time consent was given are all handled on the call, before Microsoft 365 sees anything. What arrives is the call's outcome.
- **The hard part**: Two of the checks are legal duties met on the call itself. From here you can count whether they happened, but you can't make them happen, and the plan says so.

## 1. Before you start

Read [the booked after hours build standard](https://aipathway.com.au/explore-ai/booked-after-hours-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Read section 8 of the standard before anything else, because it decides what this page can claim. The AU number, the AI notice, the recording notice, the time consent was given and the calling-hours check are the live step, and the standard says you can’t run that step yourself. Nothing below answers a phone. If you were expecting the lists to do that, stop here.

Then decide the one thing that changes how the lists are laid out. If a job system already holds the work, the Jobs list below is a copy that follows that system’s own reference, and the ExternalId column holds the reference it sent back. If you have no job system you can use, the Jobs list is where the job lives and ExternalId is its own reference. The standard covers both. ServiceM8 and Simpro let other programs read and add jobs. Tradify has no public API and no Zapier app, so a build can’t read a job back from it. The booking goes in through its enquiries inbox, and your own Jobs list is what stops a duplicate. With any other system, the call’s outcome arrives by email or webhook and someone does the last step by hand. Pick one before you build, because Flow 2’s check for a duplicate job is written against whichever you picked.

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

Calls holds ProblemVerbatim, the caller's own words, and Jobs holds the call type. That can look like doubling up. The caller's words are saved before anything sorts the call, so they belong to the call. The type belongs to the job, because the job is what gets sent out and what a second call about the same problem updates.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Disclosure and the recording notice happen before the first question | Counted, not enforced | The call is not in Microsoft 365, so nothing here can enforce it. DisclosureAt and RecordingConsentAt arrive on the outcome object and a must-be-zero measure counts calls without them. That is auditing the obligation, not holding it. |
| No free text reaches the job system | Choice columns | Classification carries the four values and Jobs.Type the three. There is no fifth to write, and an unclassified call produces no Jobs row at all. |
| The address is read back to the caller, confirmed, and that confirmed address goes on the job | Intake flow | Jobs.Address copies from AddressResolved and no branch anywhere reads AddressSpoken. Confidence below high writes no job and raises address_unresolved instead. |
| Out-of-area calls are told so and create no job | ServiceArea list | The resolved locality is looked up before the Jobs row exists. Absent from the list is out of area, because a radius calculated in a flow is a guess with sums on it. |
| An open job on the same number or address is updated, not duplicated | Intake flow | A read of Jobs on CallerNumber and Address inside the window runs before any create, and a match writes DuplicateOf. The common case is one panicking person ringing twice in ten minutes. |
| If the job system sends back no job reference, that raises an alert and is never reported as a completed call | Intake flow | Outcome cannot be set to booked in any branch where ExternalId is blank. The failing branch writes escalated and an Escalations row with reason write_failed. |
| Only an emergency alerts a person, and only once per job | Alerts list | The notify step reads Alerts for a row on that JobRef before it posts anything. The Alerts list is the guard, because a flow run remembers nothing about the flow run before it. |
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
  note     if AI Pathway is the live step, it writes the job during
           the call; this flow then only records the id it returns.

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

Flow 3 starts from the Jobs list rather than Calls. That one choice decides whether people keep the system or switch it off within a fortnight. Flow 2 can stop every duplicate job and it won't help if the alert runs off the call.

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

## 6. What the flows can reach in your Microsoft 365 and your job system, and what they never touch

The flows keep the record of every after-hours call. They read the after-hours mailbox, note which job each call became and who was woken, post each emergency job to the on-call channel, and queue every hand-back. Once an emergency is passed on, your on-call person decides what happens next, and any price or quote stays with you.

What each connection is for.

- **SharePoint, the one site.** Calls, Jobs, Escalations, Alerts, ServiceArea and EmergencyTriggers. The flows read and write rows there and nowhere else.
- **The after-hours shared mailbox, read.** Flow 1 starts there, when the call’s outcome arrives. If the live step posts to the flow instead, guard the flow’s web address, because anyone holding it can start the flow.
- **Teams, the on-call channel and the queue.** Flow 3’s one card per emergency job, and Flow 4’s escalation cards with the transcript link.
- **The job system, read, only if Jobs is a mirror.** To match a job by the system’s own reference. The job itself is entered by the live step, through the connection you approve in ServiceM8 or Simpro (section 9 of the standard). A read from a flow needs a custom connector or the HTTP action, both premium in Power Automate.
- **Power BI, read.** The seven measures. Nothing in Power BI changes your records.

Least privilege, as steps.

1. Own the four flows with a service account, not the person who happens to be on call this month, with a named co-owner.
2. Build them in one solution on connection references, so the mailbox, SharePoint, Teams and job system connections are each one place to change.
3. Make the service account a member of the one site and the on-call team, and nothing wider. Any app registration gets Sites.Selected on that one site.
4. Give it Full Access to the after-hours shared mailbox only. If an app registration reads it instead, scope that app to the one mailbox with an Exchange application access policy or RBAC for Applications.
5. Give any job system key read access to jobs and customers only.

How to cut it off. Turn off the flows in the solution and nothing is written or posted. Remove the AI Pathway connection in ServiceM8 or Simpro and the live step stops writing jobs. Stop forwarding your number from your own carrier account and the line goes back to you. The other switches are in [the shared conventions](https://aipathway.com.au/explore-ai/standards-on-microsoft-365#access).

Why the alert comes from here and not the answering service. Most answering services text the on-call phone, once per call. The frightened customer who rings back in ten minutes sets off a second text, and nothing checks for the job the first call opened. The Alerts list follows the job, it is yours, and Second Alerts counts every time that check failed.

## 7. The order to build it in

1. Create Calls and Escalations, and nothing that acts on them. Send the call outcomes into them for a fortnight. You get a record you can count of what your phone does at night, which most businesses are guessing about, and it costs nothing to look at before you build anything that acts.
2. Load ServiceArea, and get your own team to sign EmergencyTriggers with their names against it. The standard says the agent matches that list rather than reasoning about urgency, so the list has to exist and be agreed before anything classifies.
3. Build Flow 1. Confirm a second call from the same number produces a second Calls row with its own verbatim rather than editing the first.
4. Build Flow 4 before anything creates a job. An escalation queue with a named owner is useful on its own. A flow that creates jobs with nowhere to hand back to is not.
5. Build Flow 2 with the address confidence check, the service-area check and the duplicate check all in the first version. Adding the duplicate check afterwards means rebuilding the trigger and re-testing everything above it.
6. Build Flow 3, and test the guard before you test the alert. Stage the second call first, confirm nothing posts, then remove the Alerts row and confirm it does.
7. Connect Power BI. Booked Without An Id, Undisclosed Calls and Second Alerts on the front page, each set to alert you.
8. Run the pass test.

## 8. Four traps specific to this build

### The emergency triggers typed into a condition

EmergencyTriggers exists so a list your team signed decides what wakes somebody up. The shortcut is a condition in Flow 2 with the words in it, and it works, and it means the list is decorative. Worse, the day somebody adds a trigger to the list nothing changes and nobody finds out until a job that should have paged did not. Read the list.

### Alerting on the call instead of the job

Triggering Flow 3 on a Calls item where Classification is emergency is the natural shape and it undoes the duplicate check you just built. The customer rings back in ten minutes, Flow 2 correctly updates one job, and the on-call phone goes off twice. The guard has to live in a list keyed on JobRef, because nothing in a flow run knows what the last flow run did.

### Copying recordings into a document library

SharePoint is good at holding files and this is the one file not to hold. The recording, the consent ledger and the retention obligation sit with whoever holds the number, and a copy in your library is a second copy of a regulated recording, kept under a different retention rule with no consent record attached to it. TranscriptUri is a link out and it stays a link out.

### A flow that overwrites the caller's first words

Flow 1 updates a row that already exists, which is right, and it will quietly replace the caller's first panicked description with their second calmer one. The caller's words are saved before anything sorts the call because they are the only unedited thing in the record. A second call is a second Calls row against the same JobRef, never an edit of the first.

## 9. Where the automation stops

- Answering the phone. Microsoft 365 has no telephony this standard can use, and the AU number, the disclosure, the recording and the time consent was given are the live step, and the standard says you can't run it yourself.
- Working out the address. Nothing here turns a suburb said once, and unclearly, into a street. The lists refuse to create a job for any address the lookup was not sure of, which is the half of that check Microsoft 365 can do.
- Quoting a price. When the caller asks what it will cost, the call goes to a person with the transcript attached, as price_requested.
- Agreeing a variation, giving safety advice, or anything implying a licence the agent does not hold. Each one goes to a person, and the build doesn't try to handle it.
- An upset caller, and any job that fits none of the set types. Both are typed escalations, and a system that cannot record not knowing will quietly guess instead.

**The pass test.** Set up two test call outcomes for one caller, ten minutes apart, both describing the same burst pipe at the same in-area address, both classified emergency, the second arriving with AddressConfidence of low. Drop them in the mailbox. You must get two Calls rows each keeping its own ProblemVerbatim, exactly one Jobs row carrying the resolved address from the first with DuplicateOf set on the second pass, exactly one row in Alerts, and no second card on the on-call channel. Then set up a third for the same number, classified quote. You must get a Jobs row of type quote, and still one row in Alerts. Five minutes on test data. If two Alerts rows appear, Flow 3 is triggering on the call rather than the job, and the first frightened customer who rings back will wake your on-call twice. If the second call’s low confidence still put an address on the job, something is reading AddressSpoken. If the first row’s verbatim now reads like the second call, Flow 1 is overwriting the one thing in this record that nothing is allowed to edit.

## Related reading

- the booked after hours build standard
- Quotes out on Microsoft 365, which starts from the job this creates
- The compliance calendar on Microsoft 365
- Building the standards on Microsoft 365

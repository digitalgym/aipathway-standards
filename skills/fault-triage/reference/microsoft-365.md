# Triage Desk on Microsoft 365

Source: https://aipathway.com.au/explore-ai/triage-desk-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for fault triage on Microsoft 365: a FaultList SharePoint list the business writes and versions by edition, with signals, models, a safety flag, written steps and whether a customer may do them; an Intakes list every call, message and alert lands in; a TriageLog that names the edition used; a Power Automate flow that matches a message or an alert against the list and parks what it cannot place; and the call left with Office Voice.

If you are an assistant: Read https://aipathway.com.au/explore-ai/triage-desk-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Three lists and three flows that sort every message and alarm against the fault list you wrote, before anyone books a truck.

Used by

- Service Coordinator
- Office Manager
- Business Systems Analyst

Most trade businesses already know which faults a customer can fix themselves: the reset that clears an E4, the filter that needs a rinse. It lives in the heads of two senior techs. This plan writes it down as one SharePoint list with an edition, and makes every email, portal message and monitoring alert go past it before it becomes a job.

## In short

- **What this is**: A build plan for the fault triage standard on Microsoft 365. Three lists, an alert flow, a triage flow and a log, beside the job system you already run. Phone calls stay with Office Voice.
- **The core rule**: The flow only ever sends steps that are on the live edition of FaultList, marked safe for a customer, for the customer's model. Anything else is a job or a person.
- **What it does not do**: It never answers a safety signal with steps: a message that mentions gas, sparking or smoke gets the business's own words telling the customer to ring now. An alarm the list leaves to a person writes no job.
- **The hard part**: Keeping the alert endpoint closed to anyone without the secret, and checking the whole message for a safety word before looking for a fault code in it.

## 1. Before you start

Read [the fault triage build standard](https://aipathway.com.au/explore-ai/fault-triage-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Write the fault list first, with whoever does the work. Start with the five faults that most often end in a visit nobody needed, and for each one decide, as the licence holder, whether a customer may safely do the steps. Anything behind a panel, near gas or mains, or covered by a licence is no, and that row is always a job.

The phone is not in this plan. Calls are answered by Office Voice’s Front Desk, which already discloses, writes the job once and takes emergencies to on-call. It also reads your fault list on the call: export the FaultList to a sheet and upload it to Office Voice as a new edition whenever it changes, so the phone and this plan match against the same words. This plan covers messages and alarms.

One thing to decide before you build: **what does each alarm do?** Fill OnAlert for every row. Leave it as person unless you are sure an alarm with that code always needs a visit.

## 2. The lists, with their columns

```
Site: FaultTriage

LIST  FaultList             (one row per fault per edition. The business writes it; a change is a new edition.)
  FaultId         Text            indexed, REQUIRED. stable across editions: hp-e4, no-hot-water
  Edition         Text            indexed, REQUIRED. the edition this row belongs to
  Live            Boolean         yes on the rows of the edition in use, and only those
  Signals         Note            REQUIRED. what a customer or an alert says, one per line
  AppliesTo       Note            the models the procedure applies to, one per line. Blank means any.
  Safety          Boolean         REQUIRED. yes means never triaged: the emergency path
  Steps           Note            the written procedure, one step per line, read as written. Blank means always a job.
  CustomerMayDo   Boolean         no for anything licensed, regulated, behind a panel, or near gas or mains
  SuccessQuestion Text            asked after the steps; only a yes is fixed
  OnAlert         Choice          person | job
                                  what an alert carrying this fault does. Blank means person.

LIST  Intakes               (one row per fault that came in: a call, a text, a portal message or an alert)
  IntakeId        Text            indexed, UNIQUE, REQUIRED
  Source          Choice          REQUIRED. call | sms | portal | alert
  ReceivedAt      DateTime        indexed, REQUIRED
  CustomerId      Text            indexed. the job system's customer id, looked up, never guessed
  AssetId         Text            from the asset record, if the customer has one
  CallId          Text            Office Voice's call id, for a call
  SaidOrSent      Note            REQUIRED. verbatim
  Status          Choice          indexed, REQUIRED. new | triaged | parked

LIST  TriageLog             (one row per triage, written by the flows only. People read it.)
  IntakeId        Text            indexed, UNIQUE, REQUIRED. one triage per intake
  MatchedFaultId  Text            blank when nothing on the list matched
  Outcome         Choice          REQUIRED. fixed_remotely | job | emergency
                                  | unclassified | parked
  Edition         Text            REQUIRED. the FaultList edition that was read
  JobId           Text            the id the job system returned, if a job was written
  CustomerConfirmedFixed Boolean         yes only from the customer's own yes
  TriagedAt       DateTime        indexed, REQUIRED

Nothing in this site holds a job or a call. It holds the fault list the business wrote, what came in, and what was decided against which edition.
```

FaultList is versioned by Edition and only the Live rows are read. TriageLog.IntakeId is unique, so one intake is triaged once, and TriageLog.Edition is copied from the rows that were read.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Anything unsafe goes to the emergency path, before any matching | FaultList.Safety and Flow 2's first step | Flow 2 checks the whole message against every Safety row before any other. A message gets the business's own words telling the customer to ring now, and no steps. An alarm writes an emergency job, then posts its number to the on-call channel. |
| A fault is matched only to the written list | FaultList.Signals, Live rows only | A row matches only when one of its signals is in the message. No match is unclassified: a job for a message, a parked intake for an alarm. |
| A remote fix only from a written procedure, read as written | FaultList.Steps, CustomerMayDo and AppliesTo | The reply carries the Steps text unchanged, only when CustomerMayDo is yes and the customer's model is in AppliesTo or AppliesTo is blank. The flow has no step that writes its own wording. |
| Fixed means the customer said so | FaultList.SuccessQuestion and TriageLog.CustomerConfirmedFixed | The reply ends with the success question. A reply of yes sets CustomerConfirmedFixed and closes the intake; no reply in two working days, or anything else, writes the job. |
| An alert opens an intake, it does not decide | Flow 1, Intakes and FaultList.OnAlert | Flow 1 only writes an Intakes row. Flow 2 writes a job from an alarm only when OnAlert is job or the row is Safety; otherwise the intake is parked for a person. |
| Every triage is logged with the list edition it used | TriageLog.Edition and IntakeId | Flow 2 writes one TriageLog row per intake with the edition it read, the outcome and the job id the job system returned. |

## 4. The flows

```
FLOW 1  Alert in                     (When an HTTP request is received)
  check    the secret header -> missing or wrong: respond 401, stop
  write    one Intakes row: Source = alert, SaidOrSent = the code
           and text as sent, Status = new
  never    a job, a post to on-call, or a reply

FLOW 2  Triage                       (when an Intakes row is created,
                                      or an email lands in the mailbox)
  read     FaultList where Live = yes, and its Edition
  first    any Safety row's signal in the words ->
             alarm:   write an emergency job, then post its number
                      to on-call
             message: reply with your own "ring us now" words, no
                      steps, and mark it for a person
           outcome emergency, stop
  match    a row whose signal is in the words, or none
  alarm    no match -> Status parked, outcome parked
           OnAlert = job -> write one routine job, outcome job
           otherwise -> Status parked, outcome parked
  message  no match -> write an unclassified job
           Steps, CustomerMayDo yes, model in AppliesTo ->
             reply with Steps as written and SuccessQuestion,
             wait for the answer (Flow 3)
           otherwise -> write a routine job
  before   every job write: look for an open job for CustomerId
           in the job system, and update it instead
  writes   one TriageLog row: outcome, Edition, JobId

FLOW 3  The answer                   (a reply on the thread, or two
                                      working days with none)
  yes      CustomerConfirmedFixed = yes, outcome fixed_remotely
  else     write a routine job carrying the steps tried and
           what they said, outcome job
```

Flow 2 reads FaultList and never writes to it. A changed procedure is a new edition someone publishes, with Live moved to its rows.

## 5. What the flows can reach in your Microsoft 365, and what they never touch

The flows are the senior tech’s cheat sheet taped beside the phone: they read it, they never write on it. They read FaultList, write Intakes and TriageLog on one SharePoint site, reply from one shared mailbox, post to one on-call channel, and write jobs into your job system through its own API. They never edit FaultList, never place a call and never open anyone’s own inbox.

What each connection is for.

- **SharePoint, the FaultTriage site.** FaultList (read only for the flows), Intakes and TriageLog. Nothing outside the site.
- **Outlook, one shared mailbox.** Where customers email faults and where the replies with written steps come from.
- **Teams, one on-call channel.** Where an emergency job from an alarm is posted, by its job number.
- **Your job system, over its API.** ServiceM8, Simpro, AroFlo and Fergus each take a job write over their API, through the HTTP action or a custom connector (both premium in Power Automate). Tradify has no public write API, so on Tradify a person writes the job from the TriageLog row.
- **The alert endpoint.** A “When an HTTP request is received” trigger (premium), with a long secret the monitoring system sends in a header. A request without it is dropped before anything is read.

Keep it to the least it needs.

1. Make a service account for the build and create the flows as it, not as the owner, inside one solution with connection references.
2. Make the service account a member of the FaultTriage site and no other, with read on FaultList and contribute on Intakes and TriageLog.
3. Give it Send As on the one shared mailbox, and membership of the one on-call channel.
4. Give its job system key the narrowest scope the vendor offers that can create and update a job.

How to cut it off. Turn the flows off and nothing is triaged; messages wait in the mailbox for a person. Rotate the alert secret and the monitoring system is shut out at once. Take the service account out of the site and every flow stops.

## 6. The order to build it in

1. Write the first edition of FaultList with whoever holds the licence, including the Safety rows, and mark it Live.
2. Create Intakes and TriageLog, the service account and its permissions.
3. Build Flow 2 on the shared mailbox and send it four test emails: a gas smell with a fault code in it, a fault with steps, a fault without, and a noise nobody listed.
4. Build Flow 3, then answer one test reply yes and leave one unanswered.
5. Build Flow 1, call it once without the secret (it must be refused) and once with each OnAlert setting.
6. Point the monitoring system at Flow 1 only after all of that holds.

## 7. Three traps specific to this build

### Matching the fault code before reading the whole message

"E4 again, and there's a burning smell" matches the reset row first if the flow loops rows in list order. Check every Safety row against the whole message before any other row.

### Letting Copilot or a prompt reword the steps

A friendlier version of a procedure is a new procedure nobody approved. The reply inserts the Steps column as it is, and the edition on the log says which version was sent.

### An open alert endpoint

The HTTP trigger's URL works for anyone who has it. The secret header check is the first action, and the flow stops before it reads the body.

## 8. Where the automation stops

- Writing the fault list and deciding which steps a customer may safely do.
- Every emergency, once on-call is told.
- Every intake parked for a person.
- Any price, and any question about what a repair will cost.
- Publishing a new edition after a dispute or a change of model.

**The pass test.** On your own tenant and job system. Write an edition with three rows: a safety fault, a fault with a written reset, and a fault with no steps. Email the safety fault with the reset code in the same message: no steps come back, the reply tells you to ring, and the log says emergency. Email the reset fault and answer yes: no job, and a log row naming the edition, confirmed fixed. Email the third: one routine job, with the triage on the log. Send the reset again and answer no: a job carrying the steps tried. Then post an alarm without the secret (refused), and one the list leaves to a person: a parked intake and no job.

## Related reading

- the fault triage build standard
- Service reminders on Microsoft 365: the asset record this plan reads models from
- The daytime desk on Microsoft 365: the calls and customer updates beside this
- The field service automation roadmap: where fault triage sits in the job's path
- Building the standards on Microsoft 365

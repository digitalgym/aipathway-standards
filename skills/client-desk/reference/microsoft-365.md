# The Daytime Desk on Microsoft 365

Source: https://aipathway.com.au/explore-ai/daytime-desk-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan for the client desk: a Roster list the call flow reads before every transfer, a Calls list with the disclosure time required, a Callbacks list whose owner is a required person from the roster, and an Updates list unique per job, kind and time so one change sends one message. The arrival time and the contact are read from the job system, never copied.

If you are an assistant: Read https://aipathway.com.au/explore-ai/daytime-desk-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

Three flows and four lists for the office admin's day that is not about money: the phone in business hours, and the running-late message that stops the next call.

Used by

- Office Administrator
- Business Systems Analyst
- Scheduling Coordinator

The temptation on this stack is to copy each job’s arrival time into a list so the desk can read it quickly. Then the board moves the time, the list does not, and the desk tells a customer a time that was true this morning. Nothing here copies the job. The lists hold what the business sets, the roster, and what the desk did: the calls it took, the callbacks it raised, the messages it sent.

## In short

- **What this is**: A build plan for the client desk standard on Microsoft 365. Four lists, three flows, and the arrival time read from the job system every time it is needed.
- **The core rule**: A status answer and a running-late message both read the job by its id at the moment they need the time. No list holds one.
- **What it does not do**: It does not hold a job, an arrival time or a contact, and a second delivery of the same schedule change cannot make a second message.
- **The hard part**: The phone line itself is not a Power Automate job: it is the step not to hand-roll. On this stack the hard column is Updates.ChangeKey, which makes a repeated change fail at the list.

## 1. Before you start

Read [the client desk build standard](https://aipathway.com.au/explore-ai/client-desk-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide where the daytime calls are answered. The voice on the line, with its disclosure and its transfer, is not built in Microsoft 365. Whatever answers calls the flows below over HTTP: look the caller up, read the job, raise a callback.

Then fill the Roster. One row per shift, with the person on duty and how soon a callback is due. Every transfer and every callback reads it, so a blank shift is a callback with nobody on it.

One thing to check before you build: **does your job system send an event when an arrival time changes, or a job is marked on the way or complete?** If it does, Flow 3 triggers on it. If not, Flow 3 polls on a schedule and keeps a watermark. A message sent because someone remembered to click a button is not the standard.

## 2. The lists, with their columns

```
Site: ClientDesk

LIST  Roster                (one row per shift. A person keeps this current.)
  ShiftStart      DateTime        indexed, REQUIRED
  ShiftEnd        DateTime        REQUIRED
  OnDuty          Person          REQUIRED. takes a transfer and owns a callback during the shift
  CallbackWithinMinutes Number          REQUIRED

LIST  Calls                 (one per daytime call the desk answered)
  CallId          Text            indexed, UNIQUE
  JobId           Text            indexed. the open job the caller was matched to, or the job written. Blank when the write failed.
  Wanted          Choice          REQUIRED. new_work | status | person | other
  Outcome         Choice          REQUIRED. answered_from_job | transferred
                                  | callback_raised | job_written | write_failed
  DisclosedAt     DateTime        REQUIRED. before the first question, on every call
  NotedOnJobAt    DateTime        when the call was written back to the job

LIST  Callbacks             (one per callback. Never a chat reminder.)
  CallId          Text            indexed
  JobId           Text            indexed. or blank, with the caller's number, when no job was written
  CallerPhone     Text
  Reason          Choice          REQUIRED. status_unknown | missed_transfer
                                  | write_failed
  Owner           Person          REQUIRED. from Roster, never typed
  DueBy           DateTime        REQUIRED
  Status          Choice          indexed. open | done

LIST  Updates               (one per message sent, or held for want of consent)
  ChangeKey       Text            indexed, UNIQUE. JobId|Kind|Eta. One change, one row, one message.
  EventId         Text            indexed. the schedule change that woke it
  JobId           Text            indexed, REQUIRED
  Kind            Choice          REQUIRED. late | on_the_way | complete
  Eta             Text            read from the job after the change, never typed
  SentTo          Text            the contact on the job
  Status          Choice          REQUIRED. sent | held_no_consent

Nothing in this site holds a job's arrival time or its contact. The flows read both from the job system at the moment they need them.
```

Updates.ChangeKey is unique: the job id, the kind and the time, joined. The same change twice fails to save; a new time is a new key and a new message.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| Disclosure first, on every daytime call | Calls.DisclosedAt | Required. The line stamps it before the first question; a Calls row cannot be saved without it. |
| The caller is looked up before anything is written | Calls.JobId | Flow 1 reads the job system for an open job on the number first and writes the matched job id. A new job is written only when that read finds none. |
| A status question is answered from the job, or not answered | Flow 1 and Callbacks.Reason | Flow 1 reads the job by id and returns its arrival time as it stands. When it holds none, Flow 1 returns no time and raises a Callbacks row with reason status_unknown. |
| A missed transfer becomes a callback with a name and a time | Callbacks.Owner and Callbacks.DueBy | Owner is a required Person copied from the current Roster row, and DueBy is now plus CallbackWithinMinutes. Neither is typed. |
| Messages only when the record changes, once per change | Updates.EventId and Updates.ChangeKey | Flow 3 is triggered by the schedule change, reads the job, and writes the Updates row before it sends. A duplicate ChangeKey stops the flow. |
| Only to the contact on the job, only with consent | Updates.SentTo and Updates.Status | Flow 3 reads the contact and the consent flag from the job. No consent writes held_no_consent and a note on the job, and sends nothing. |
| Every call and every update is written back to the job | Calls.NotedOnJobAt | Each flow writes a note to the job in the job system, by its id, and stamps the time. Power BI counts Calls with no NotedOnJobAt. |

## 4. The three flows

```
FLOW 1  Caller lookup                (called by the line, HTTP)
  input    call id, caller's number, what they asked
  logic    read the job system for an OPEN job on that number
             found  -> return the job id; note the call on the job
             asked when -> read the job by id, return its eta
               no eta  -> return none; raise Callbacks
                          (status_unknown, owner from Roster)
           none -> write the job (verbatim, fixed type), read it
                   back by id; blank id -> Callbacks (write_failed)
  never    return a time the job does not hold

FLOW 2  Missed transfer              (called by the line, HTTP)
  input    call id, job id
  logic    read the current Roster row
           write Callbacks: Owner = OnDuty,
             DueBy = now + CallbackWithinMinutes
           note the callback on the job

FLOW 3  Status message               (schedule change, by event or poll)
  trigger  eta moved later, on the way, or complete
  logic    read the job by id: eta, contact, consent
           write Updates with ChangeKey = JobId|Kind|Eta
             duplicate -> stop
           no consent -> Status held_no_consent, note, stop
           send to the job's contact; note it on the job
```

None of the flows holds a time between runs. Each one reads the job when it needs the time, which is the whole defence against the stale answer.

## 5. What the flows can reach in your Microsoft 365 and your job system, and what they never touch

Think of a receptionist who can read the job board on the wall but has no marker. The flows read a job by its id, write a note on it, keep the four lists in one SharePoint site, and send one message per change from an account the business owns. They never move an arrival time, never edit, close or delete a job, never message a contact who has not agreed to it, and never open another site or inbox. Your own login stays yours: the flows run under an account kept for them, and the job system sees a key made for the build, never your username and password.

What each connection is for.

- **SharePoint, the one site.** Roster, Calls, Callbacks and Updates. What the business sets and what the desk did, and no copy of any job.
- **The job system.** Read the job, its contact and its consent flag by id, and write a note back. In ServiceM8 or Simpro, a key or app connection made for the build, reached through a custom connector or the HTTP action, both premium. Tradify has no public API and no Zapier app, so it cannot answer the status question here at all.
- **The HTTP trigger on Flows 1 and 2.** So the line can call them while the caller waits. It is premium too, and its address works like a password: keep it with the line and nowhere else.
- **Outlook or the SMS account the business owns.** For Flow 3’s one message per change, sent from a shared address, not a person’s.
- **Teams, optional.** To tell the callback’s owner it is theirs and when it is due.
- **Office Voice Front Desk, if it answers the line.** It answers the business’s number all day, and on a ServiceM8 or Simpro board, switched on under Automations, it rings the customer when a job moves later. It does not send a job-complete message or any update by text, so Flow 3 still covers those.

Keep the marker out of reach.

1. Build the flows under a service account, an ordinary licensed account kept for them, not a person who might leave or change their password.
2. Build them inside a solution, so each connection is a connection reference you can see, swap or remove in one place.
3. Make the service account a member of the one SharePoint site and no other. If an app registration reads the site instead, grant it Sites.Selected and have an admin add only this site.
4. Give the service account Send As on the one shared mailbox and no other. If an app registration sends instead, limit it to that mailbox with an Exchange application access policy or RBAC for Applications.
5. In the job system, give the build’s key jobs to read and notes to write, and nothing that edits the schedule.

How to cut it off. Turn the flows off and the desk stops looking anything up or sending anything. Revoke the build’s key in the job system and it can no longer read a job. Remove a connection from its connection reference to stop one route and leave the rest running.

Why not a Teams Phone auto attendant? It routes a call by menu and by opening hours, and it does that well. It cannot read a job’s arrival time, so the question this desk exists for still lands on a person, and a missed transfer ends in voicemail or a phone that rings out, not a callback with an owner and a time.

## 6. The order to build it in

1. Create the four lists and fill the Roster. Make ChangeKey unique.
2. Build Flow 3 first. The running-late message stops more calls than anything else here, and it needs no phone line.
3. Move one job's arrival time twice and confirm two Updates rows and two messages; deliver the same change twice and confirm one.
4. Build Flows 1 and 2, then connect the line that answers your calls to them.
5. Ring from a customer's phone, ask when, ask for a person, and let the transfer go. Check the Calls row, the Callbacks row and the notes on the job.

## 7. Three traps specific to this build

### Copying the arrival time into a list

It is faster to read and it is wrong by lunchtime. The board moves the job; the list does not. Read the job by id every time.

### Triggering the message on every edit to the job

A job is edited for many reasons. Trigger on the arrival time, the on-the-way flag and the status, and let ChangeKey refuse the repeats.

### A callback assigned to a text field

Somebody types a first name and it reaches nobody. Owner is a Person, copied from the Roster row for the shift.

## 8. Where the automation stops

- Every transfer, once it is answered.
- Every callback, by the person the roster names.
- Moving the arrival time. The flows read it; they never write it.
- Keeping the Roster current.

**The pass test.** On your own number and job system, in business hours. Ring from a customer’s phone, ask when the tradesperson is coming, then ask for a person and let the transfer go unanswered. Then move that job’s arrival time. The time said on the call must be the time the job held. One Callbacks row must exist, owned by the person on the Roster. Exactly one Updates row and one message must exist for the change, with the new time, and the job must carry notes for the call, the callback and the message.

## Related reading

- the client desk build standard
- After hours on Microsoft 365: the same rules for new work, after hours
- The dispatch board on Microsoft 365: where the arrival time is set
- The admin role on Microsoft 365: this desk and the cash path on one job
- Building the standards on Microsoft 365

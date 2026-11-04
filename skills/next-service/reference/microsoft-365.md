# Service Reminders on Microsoft 365

Source: https://aipathway.com.au/explore-ai/service-reminders-on-microsoft-365
Publisher: AI Pathway (https://aipathway.com.au)

> A build plan: warranty and service reminders on Microsoft 365. Installed equipment as a SharePoint list, due dates derived from a schedule list, reminders from Outlook ahead of each date, an opt-out list, and a yes written back as a booking request.

If you are an assistant: Read https://aipathway.com.au/explore-ai/service-reminders-on-microsoft-365 and build this workflow for my business. Start by asking me which systems I already use.

---

The same standard, for a trade business that lives in Microsoft 365: installed equipment as a list, dates worked out from a schedule list, reminders from Outlook, and each yes written back to the job system once.

Used by

- Office Manager
- Microsoft 365 Administrator
- Service Coordinator

The temptation in SharePoint is a NextDue column, filled in once and sorted by. That is the one thing this plan leaves out. The date is worked out by the daily flow from a Schedule list, so changing the schedule moves every date and nobody edits one. The rest is lists, four flows, and one unique column that stops a second yes making a second job.

## In short

- **What this is**: A build plan for the Next Service standard on Microsoft 365. Six lists, four flows, and a booking request written into the job system you already run.
- **The core rule**: Flow 2 reads Assets and Schedule every morning and works each date out. There is no due-date column to go stale when the schedule changes.
- **What it does not do**: No flow picks a time slot or a price, and no message says what a warranty covers. A person books every request in the job system.
- **The hard part**: Claiming the BookingRequests row before calling the job system, so a second yes or a retried flow finds it and writes nothing.

## 1. Before you start

Read [the Next Service build standard](https://aipathway.com.au/explore-ai/next-service-build-standard) first. It defines its objects, and the lists below are those objects with SharePoint types on them. Shared conventions are in [building the standards on Microsoft 365](https://aipathway.com.au/explore-ai/standards-on-microsoft-365).

Decide how finished jobs get in. If your job system (ServiceM8, Simpro, Fergus, Jobber or AroFlo) has a connector or a webhook, Flow 1 triggers on a job marked complete. If not, a daily export into a list works. Tradify has no public API and no Zapier app, so a Tradify business brings finished jobs in from Tradify’s job export, and each yes goes to its enquiry inbox as one email, checked against BookingRequests first.

Then write the Schedule list before anything else: one row per equipment type you install or service, with the months between services. Base it on the manufacturer’s instructions or your own advice. An asset whose type has no row is an exception, not a guess.

## 2. The lists, with their columns

```
Site: ServiceReminders

LIST  Assets                (one row per piece of equipment, from the finished job)
  AssetId         Text            indexed, UNIQUE, REQUIRED
  CustomerId      Text            indexed, REQUIRED
  SourceJob       Text            indexed. the job it was taken from
  EquipmentType   Text            indexed. matches a Schedule row, or it is an exception
  Make            Text
  Model           Text
  Serial          Text
  InstalledOn     DateTime
  LastServicedOn  DateTime
  WarrantyMonths  Number          as written on the job; blank means no warranty reminder
  Exception       Choice          none | missing_install_date | missing_model
                                  | missing_equipment_type | no_schedule

LIST  Schedule              (the written rule, one row per type)
  EquipmentType   Text            indexed, UNIQUE, REQUIRED
  ServiceMonths   Number          REQUIRED
  ChangedBy       Person
  ChangedOn       DateTime

LIST  Customers
  CustomerId      Text            indexed, UNIQUE, REQUIRED
  CustomerName    Text
  Mobile          Text
  Email           Text
  ConsentSms      Boolean         what they agreed to, from your record
  ConsentEmail    Boolean

LIST  Reminders             (append only)
  Asset           Text            lookup to Assets
  ReminderKey     Text            indexed, UNIQUE. AssetId + Kind + DueOn + Stage
  Kind            Choice          service | warranty
  Stage           Choice          reminder | follow_up
  DueOn           DateTime        as worked out at send time, kept as the record
  Channel         Choice          sms | email
  Body            Note
  SentAt          DateTime
  ReplyText       Note            their words, exactly
  Outcome         Choice          none | yes | stop | unclear
                                  unclear goes to a person

LIST  OptOuts               (no flow clears a row)
  CustomerId      Text            indexed, UNIQUE
  Said            Note            their words, exactly
  ReceivedAt      DateTime

LIST  BookingRequests
  RequestKey      Text            indexed, UNIQUE. AssetId + DueOn: one per date
  Asset           Text            lookup to Assets
  CustomerId      Text            indexed
  ReplyText       Note
  JobNumber       Text            from the job system, once written
  BookedBy        Person          the person who set the time

There is no NextDue column on Assets, on purpose. A stored date is the one that goes stale when the schedule changes.

There is no TimeSlot or Price column on BookingRequests either. A person books the time and prices the work in the job system.
```

Unique values on Reminders.ReminderKey hold check 5: a second run on the same day cannot add a second reminder for the same date. Unique RequestKey on BookingRequests holds check 11: the second yes fails at SharePoint before the job system is touched.

## 3. Every rule, and what enforces it

| The rule | Enforced by | How |
| --- | --- | --- |
| The equipment is taken from the finished job, as recorded | Flow 1, Assets.SourceJob | Flow 1 copies type, make, model, serial, dates and warranty term from the completed job, and skips a job whose number is already a SourceJob. |
| A missing install date, model or type goes to a person | Flow 1 and Flow 2, Assets.Exception | Either flow sets Exception and posts the asset to a Teams channel. Flow 2 skips any asset whose Exception is not none. |
| Due dates are worked out from the schedule, never typed in | Schedule list; no NextDue column | Flow 2 adds the Schedule months to LastServicedOn, else InstalledOn, every run. Editing a Schedule row moves every date of that type. |
| Already booked means no reminder | Flow 2, the job system connector | Before each reminder Flow 2 asks the job system for open jobs on that asset, and skips it if there are any. |
| Only on a channel the customer agreed to, and a stop is for good | Customers consent columns, OptOuts | Flow 2 checks OptOuts and the consent columns before every send. Flow 3 writes OptOuts on STOP. No flow deletes from it. |
| A yes becomes one booking request, with no time and no price | Flow 4, BookingRequests.RequestKey, unique | Flow 4 creates the BookingRequests row first; if it already exists the flow ends. Only then does it create the job and post the job number to Teams. |

## 4. The four flows

```
FLOW 1  Finished job to asset
  trigger  a job marked complete (connector, webhook or daily import)
  logic    job number already a SourceJob -> stop
           create or update the Assets row from the job, as recorded
           no InstalledOn, Model or EquipmentType -> Exception, post to Teams
  never    fill a gap from the make, or type a due date.

FLOW 2  Daily reminders
  trigger  every morning, 8am
  logic    per asset with Exception none:
             Schedule row for the type? none -> no_schedule, post to Teams
             service due = (LastServicedOn or InstalledOn) + ServiceMonths
             warranty due = InstalledOn + WarrantyMonths, only if set
             per date inside the lead time and not past:
               open job on the asset in the job system -> skip
               OptOuts has the customer -> skip
               no ConsentSms and no ConsentEmail -> no_consent, post to Teams
               create Reminders row (ReminderKey unique) -> send
             a reminder with no reply after the follow-up days:
               one follow_up row (unique key) -> send
  never    send a second reminder or a second follow-up for a date.

FLOW 3  A reply arrives
  trigger  a new SMS reply or an email to the reminders mailbox
  logic    write ReplyText on the Reminders row, exactly as received
           STOP or unsubscribe -> OptOuts row, Outcome stop
           yes, or the booking link -> Outcome yes, run Flow 4
           anything else -> Outcome unclear, post to Teams
  never    reply to the customer on its own.

FLOW 4  One booking request
  trigger  called by Flow 3, or the booking link
  logic    create BookingRequests row, RequestKey = AssetId + DueOn
           it already exists -> stop
           create the job in the job system against customer and asset
           write JobNumber back, post it to Teams to be booked
  never    set a time slot or a price.
```

Flow 4 claims the SharePoint row before it calls the job system, because the job system does not deduplicate for you. A flow that writes the job first and the row second makes two jobs the day the first call times out and retries.

## 5. What the flows can reach in your Microsoft 365 and your job system, and what they never touch

The flows work like the reminder card from the dentist: it says when you are due and how to book, and the receptionist still picks the time. They read finished jobs and the open jobs on each unit, keep the equipment, reminders, opt-outs and booking requests in this one SharePoint site, send each reminder from one shared mailbox, and write each yes into the job system as one booking request. They never set a time or a price, never say what a warranty covers, never message a customer on OptOuts or on a channel they did not agree to, and never delete from OptOuts.

What each connection is for.

- **SharePoint, this one site.** Read and write on the six lists. It is the only place in Microsoft 365 the flows write.
- **Your job system.** Read finished jobs for Flow 1 and open jobs on a unit for Flow 2, and create one job per yes in Flow 4. ServiceM8, Simpro and the rest are reached through a custom connector or the HTTP action, both premium in Power Automate, or a daily export for the reads. Tradify takes each yes by email to its enquiry inbox, as above.
- **One shared reminders mailbox in Outlook.** To send email reminders and the one follow-up, and to receive the replies Flow 3 reads. Never anyone’s own inbox.
- **An SMS sender, only for customers who agreed to texts.** Microsoft 365 sends no SMS of its own, so a text goes through an SMS provider’s connector or the HTTP action, with replies coming back to Flow 3.
- **Teams.** To post exceptions, unclear replies and each new job number for a person to book.

A customer who rings instead of replying reaches whoever answers your phone. If that is Office Voice’s Front Desk, it answers all day; that call sits outside these flows.

Keep each one to the least it needs.

1. Create a service account for the flows and build them in a solution that account owns, with a named person as co-owner. A flow owned by a person stops working the day that person leaves. If the flows use a premium connector, the account needs a Power Automate licence that covers premium connectors; check what your tenant already has.
2. Create every connection as the service account and use it through the solution’s connection references, so nobody’s own login sits inside a flow.
3. Give the service account access to this one site and no other. If an app registration is used instead, grant it Sites.Selected and give it this site alone.
4. Give the service account access and Send As on the shared reminders mailbox and nothing else. If an app registration reads or sends the mail, limit it to that mailbox with RBAC for Applications in Exchange Online, or the older application access policy.
5. Make the job system key or app connection for this build alone, through the system’s own integration route, and keep it in the custom connector’s connection, never typed into a flow step.

How to cut it off. Turn the flows off in Power Automate and no more reminders go out. Remove the connection, or revoke the key in the job system, and no more booking requests are written. Block sign-in on the service account and every connection it owns stops working. OptOuts stays as it is, so a customer who said stop is still stopped when you turn it back on.

Why not the reminders built into your job system, or an SMS add-on? If you already have one, run the pass test below on it before building this. Change a schedule row and reply YES twice: if every date moves and one job appears, use it and build only what it misses. Most sell the message. The schedule that moves every date, and the second yes that books nothing, are the parts to check.

## 6. The order to build it in

1. Create the six lists from the schema, with the unique columns set.
2. Write the Schedule list, then build Flow 1 and prove an asset with no install date lands as an exception.
3. Build Flow 2 sending to a test mobile only, and prove changing a Schedule row moves the dates.
4. Build Flow 3, and prove STOP writes OptOuts and an unclear reply reaches Teams.
5. Build Flow 4 against the job system, and prove two YES replies leave one job.

## 7. Four traps specific to this build

### A NextDue column, because it is easier to sort

It is right on the day it is filled in and wrong the day the schedule changes. Work the date out in the flow, and sort a view on a calculated value if you must.

### Letting Copilot fill a missing model or warranty term

A plausible model or a usual five-year term is a guess written into the record. Leave it blank, raise the exception, and let a person check the unit.

### Writing the job before claiming the row

Power Automate retries a step that times out. If the job is created first, the retry creates a second one. Claim the unique row first.

### Warranty wording that sounds helpful

"Your repair is covered until..." is a statement about the customer's rights. The message states the expiry date on your record and nothing else.

## 8. Where the automation stops

- Booking the time and pricing the work for every booking request.
- Writing and changing the Schedule list.
- Fixing any asset with a missing install date, model or type.
- Answering any reply Flow 3 marks unclear, and taking anyone off OptOuts, which happens only if they ask.

**The pass test.** Change the hot water row in Schedule from twelve months to six and run Flow 2: every hot water date moves, and nobody edited one. Add a test customer to OptOuts: they get nothing. Put your own mobile on a test customer with a unit inside the lead time, reply YES to the reminder, then YES again: one BookingRequests row and one job in your job system. A few minutes on your own tenant.

## Related reading

- the Next Service build standard
- Compliance Calendar on Microsoft 365: the same derived-dates rule, for legal obligations
- The paper: warranty and maintenance reminders for trade businesses
- Building the standards on Microsoft 365
